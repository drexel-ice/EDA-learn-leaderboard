"""Readers for the released run artifacts: hparams.yaml, Lightning checkpoints
and TensorBoard event files. Pure Python + PyYAML (no torch, no tensorboard).

The checkpoint and tfevents parsers are carried over from the Flask model
explorer (EDA-learn-leaderboard-flask/data.py).
"""
import base64
import struct
import zipfile
from collections import defaultdict
from pathlib import Path

import yaml


# ---------------------------------------------------------------- hparams.yaml
class SoftLoader(yaml.SafeLoader):
    """hparams.yaml holds !!python/object:eda_ml... tags; read them as plain data."""


def _construct_tagged(loader, _suffix, node):
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node, deep=True)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return loader.construct_scalar(node)


SoftLoader.add_multi_constructor("tag:yaml.org,2002:python/object:", _construct_tagged)


def read_yaml(path):
    with open(path) as fh:
        return yaml.load(fh, Loader=SoftLoader) or {}


def load_spec(hparams_path):
    """features (ordered {group: [names]}), layers, hyperparameters, branch."""
    raw = read_yaml(hparams_path)
    cfg = raw.get("config") if isinstance(raw.get("config"), dict) else raw
    branch_kind, branch = None, {}
    for key in ("mlp_branch", "gnn_branch", "cnn_branch", "fusion_branch"):
        b = cfg.get(key)
        if isinstance(b, dict) and b:
            branch_kind, branch = key.replace("_branch", ""), b
            break
    hp = cfg.get("hyperparameters") if isinstance(cfg.get("hyperparameters"), dict) else {}
    return {
        "branch": branch_kind,
        "features": branch.get("features") or {},
        "layers": branch.get("layers") or [],
        "hparams": hp,
    }


def linear_shapes(layers):
    out = []
    for layer in layers or []:
        if str(layer.get("type") or "").lower() != "linear":
            continue
        fi, fo = layer.get("in_features"), layer.get("out_features")
        if fi is not None and fo is not None:
            out.append((int(fo), int(fi)))
    return out


# ---------------------------------------------------------------- checkpoints
def load_checkpoint(path, shapes):
    """Linear weights/biases as base64 float32, in layer order.

    A Lightning checkpoint is a torch zip; the state_dict tensors are pickled
    first, so storages data/0..2k-1 are (W0, b0, W1, b1, ...).

    The checkpoint is the ground truth for shapes: some hparams.yaml files
    declare an in_features that differs from the trained network (e.g. 7 where
    W0 is 64x5). out_features must match the bias; in_features is taken from
    the stored W, and any disagreement is reported in "declared_vs_actual".
    """
    if not path or not shapes:
        return None
    layers, mismatch = [], []
    with zipfile.ZipFile(path) as z:
        prefix = next((n.split("/data/")[0] for n in z.namelist() if "/data/" in n), "archive")
        for i, (fo, fi_declared) in enumerate(shapes):
            try:
                w = z.read(f"{prefix}/data/{2 * i}")
                b = z.read(f"{prefix}/data/{2 * i + 1}")
            except KeyError:
                return None
            if len(b) != fo * 4 or len(w) % (fo * 4):
                return None
            fi = len(w) // (fo * 4)
            if i > 0 and fi != layers[-1]["fo"]:
                return None
            if fi != fi_declared:
                mismatch.append({"layer": i, "declared_in": fi_declared, "actual_in": fi})
            layers.append({"fi": fi, "fo": fo,
                           "w": base64.b64encode(w).decode("ascii"),
                           "b": base64.b64encode(b).decode("ascii")})
    return {"name": Path(path).name, "layers": layers, "declared_vs_actual": mismatch}


# ---------------------------------------------------------------- tfevents
CURVE_TAGS = {
    "loss/training": ("loss", "tr"), "loss/validation": ("loss", "va"),
    "r2/training": ("r2", "tr"), "r2/validation": ("r2", "va"),
    "mae/training": ("mae", "tr"), "mae/validation": ("mae", "va"),
    "mape/training": ("mape", "tr"), "mape/validation": ("mape", "va"),
}
TEST_TAGS = {"loss/test": "loss", "r2/test": "r2", "mae/test": "mae", "mape/test": "mape"}


def _read_varint(buf, i):
    val = shift = 0
    n = len(buf)
    while i < n:
        b = buf[i]
        i += 1
        val |= (b & 0x7F) << shift
        if not (b & 0x80):
            return val, i
        shift += 7
        if shift > 70:
            break
    raise ValueError("truncated varint")


def _iter_fields(buf):
    i, n = 0, len(buf)
    while i < n:
        try:
            key, i = _read_varint(buf, i)
        except ValueError:
            break
        field, wtype = key >> 3, key & 7
        if wtype == 0:
            val, i = _read_varint(buf, i)
            yield field, wtype, val
        elif wtype == 1:
            if i + 8 > n:
                break
            yield field, wtype, buf[i:i + 8]
            i += 8
        elif wtype == 5:
            if i + 4 > n:
                break
            yield field, wtype, buf[i:i + 4]
            i += 4
        elif wtype == 2:
            ln, i = _read_varint(buf, i)
            if i + ln > n:
                break
            yield field, wtype, buf[i:i + ln]
            i += ln
        else:
            break


def _iter_tf_records(data):
    i, n = 0, len(data)
    while i + 12 <= n:
        length = struct.unpack_from("<Q", data, i)[0]
        i += 12
        if i + length + 4 > n:
            break
        yield data[i:i + length]
        i += length + 4


def _scalars(payload):
    step, values = None, []
    for field, wtype, val in _iter_fields(payload):
        if field == 2 and wtype == 0:
            step = val
        elif field == 5 and wtype == 2:
            for sf, sw, sv in _iter_fields(val):
                if sf == 1 and sw == 2:
                    tag = simple = None
                    for f2, w2, v2 in _iter_fields(sv):
                        if f2 == 1 and w2 == 2:
                            tag = v2.decode("utf-8", "replace")
                        elif f2 == 2 and w2 == 5:
                            simple = struct.unpack("<f", v2)[0]
                    if tag is not None and simple is not None:
                        values.append((tag, simple))
    return step, values


def _sig(v):
    return float(f"{v:.5g}")


def load_curves(log_dir):
    """{metric: {tr: [...], va: [...]}} per epoch, plus final test values."""
    series = defaultdict(list)
    for ev in sorted(Path(log_dir).glob("events.out.tfevents*")):
        for rec in _iter_tf_records(ev.read_bytes()):
            step, values = _scalars(rec)
            for tag, simple in values:
                series[tag].append((step if step is not None else -1, float(simple)))
    curves = {m: {"tr": [], "va": []} for m, _ in CURVE_TAGS.values()}
    for tag, (metric, split) in CURVE_TAGS.items():
        curves[metric][split] = [_sig(v) for _, v in sorted(series.get(tag, []), key=lambda x: x[0])]
    test = {}
    for tag, metric in TEST_TAGS.items():
        pts = series.get(tag)
        if pts:
            test[metric] = _sig(sorted(pts, key=lambda x: x[0])[-1][1])
    if not any(c["tr"] or c["va"] for c in curves.values()):
        return None, None
    return curves, test or None
