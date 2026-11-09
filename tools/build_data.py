#!/usr/bin/env python3
"""Build the leaderboard payload from the released model-data/ tree.

    python3 tools/build_data.py                 # reads ./model-data, writes ./data
    python3 tools/build_data.py SRC OUT

Reads only eval.yaml and flow.log files (no checkpoints, no torch), so it runs
with nothing but PyYAML. Run it locally whenever model-data/ changes and commit
the resulting data/leaderboard.json -- the site itself is static.
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "model-data")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "data")

# --------------------------------------------------------------------------
# Vocabulary. Order here is display order on the site.
# --------------------------------------------------------------------------
PDKS = [
    ("nangate45", "NG45"),
    ("sky130hd", "SKY130"),
    ("ihp-sg13g2", "IHP130"),
    ("asap7", "ASAP7"),
]
STAGES = [
    ("floorplan", "Floorplan", "FP"),
    ("global_place", "Global place", "GP"),
    ("detailed_place", "Detailed place", "DP"),
    ("cts", "CTS", "CTS"),
    ("global_route", "Global route", "GR"),
]
PAPER_STAGES = {"floorplan", "global_place", "detailed_place", "cts"}

# id, label, target entity, unit (None = native target units, not recorded in eval files)
TASKS = [
    ("total_area", "Total area", "Netlist", None),
    ("total_power", "Total power", "Netlist", None),
    ("total_wirelength", "Total wirelength", "Netlist", None),
    ("worst_arrival_time", "Worst arrival time", "Netlist", None),
    ("worst_slack", "Worst slack", "Netlist", None),
    ("total_negative_slack", "Total negative slack", "Netlist", None),
    ("interconnect_length", "Interconnect length", "Interconnect", "µm"),
    ("timing_path_arrival_time", "Timing-path arrival time", "Timing path", None),
    ("timing_path_slack", "Timing-path slack", "Timing path", None),
    ("net_arc_delay", "Net-arc delay", "Net arc", None),
    ("cell_arc_delay", "Cell-arc delay", "Cell arc", None),
    ("cell_arc_slew", "Cell-arc slew", "Cell arc", None),
]
NO_FLOORPLAN = {"total_wirelength", "interconnect_length"}
SCALING_TASKS = {"interconnect_length", "timing_path_arrival_time", "timing_path_slack"}

# Table 2 of the paper. "pct": stored as a fraction, displayed as a percentage.
METRICS = {
    "mae":       {"label": "MAE",              "better": "lower",  "pct": False, "unit": True},
    "mape":      {"label": "MAPE",             "better": "lower",  "pct": True,  "unit": False},
    "r2":        {"label": "R²",               "better": "higher", "pct": False, "unit": False},
    "mae_top5":  {"label": "MAE top-5%",       "better": "lower",  "pct": False, "unit": True},
    "mape_top5": {"label": "MAPE top-5%",      "better": "lower",  "pct": True,  "unit": False},
    "mae_p95":   {"label": "MAE P95",          "better": "lower",  "pct": False, "unit": True},
    "mape_p95":  {"label": "MAPE P95",         "better": "lower",  "pct": True,  "unit": False},
    "mpe":       {"label": "MPE",  "better": "lower", "pct": False, "unit": True},
    "mne":       {"label": "MNE", "better": "lower", "pct": False, "unit": True},
    "tpr":       {"label": "TPR",              "better": "higher", "pct": True,  "unit": False},
    "tnr":       {"label": "TNR",              "better": "higher", "pct": True,  "unit": False},
}
METRIC_ORDER = list(METRICS)

EXP_RE = re.compile(r"^(?P<name>.+?)-(?P<desc>[^-]+)-(?P<ver>v\d+\.\d+\.\d+)$")


def describe_experiment(dirname):
    """Split a run folder <experiment_name>-<descriptor>-<version> into its parts.

    Deliberately nothing more: the leaderboard does not interpret descriptors
    (e.g. what "acq_maximin096" means), so new experiments need no code changes.
    """
    m = EXP_RE.match(dirname)
    if not m:
        return {"id": dirname, "name": dirname, "descriptor": "", "version": ""}
    return {"id": dirname, "name": m["name"], "descriptor": m["desc"], "version": m["ver"]}


# Runs reported in the EDA-OpenML paper, listed explicitly rather than inferred
# from descriptor names: the Fixed MLP everywhere (Tables 5-9), plus the
# stratified-utilization and maximin-acquisition sweeps for three tasks (Sec. 5).
PAPER_RUNS_ALL_TASKS = {"fixed_mlp-standard-v1.0.0"}
PAPER_RUNS_SCALING = {f"fixed_mlp-util_strat{p:03d}-v1.0.0" for p in (5, 10, 20, 50)} | \
                     {f"fixed_mlp-acq_maximin{n:03d}-v1.0.0" for n in (2, 8, 32, 64, 96)}


def in_paper(task, stage, exp_id):
    if stage not in PAPER_STAGES:
        return False
    if task in NO_FLOORPLAN and stage == "floorplan":
        return False
    if exp_id in PAPER_RUNS_ALL_TASKS:
        return True
    return task in SCALING_TASKS and exp_id in PAPER_RUNS_SCALING


# --------------------------------------------------------------------------
# Readers
# --------------------------------------------------------------------------
def num(v):
    """JSON-safe float, 10 significant digits; NaN/inf/missing -> None.
    (6 digits caused double rounding: 12.0925487 -> 12.0925 -> shown 12.092, paper 12.093.)"""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return float(f"{f:.10g}")


def load_yaml(path):
    with open(path) as fh:
        return yaml.safe_load(fh)


def parse_flow(path):
    info = {"status": None, "train_s": None, "wall_s": None, "runtime_s": None, "run_utc": None}
    if not os.path.exists(path):
        return info
    txt = open(path, errors="replace").read()
    if (m := re.search(r"Status:\s*(\w+)", txt)):
        info["status"] = m[1]
    if (m := re.search(r"total train time \(sum\):\s*([\d.]+)s", txt)):
        info["train_s"] = float(m[1])
    # "Total runtime" = training + evaluation of all LOCO folds: the paper's model runtime
    if (m := re.search(r"Total runtime:\s*([\d.]+)s", txt)):
        info["runtime_s"] = float(m[1])
    if (m := re.search(r"train wall time \(parallel\):\s*([\d.]+)s", txt)):
        info["wall_s"] = float(m[1])
    if (m := re.search(r"Flow run:\s*(\S+)", txt)):
        info["run_utc"] = m[1]
    return info


def better(metric, model, base):
    if model is None or base is None:
        return None
    return model > base if METRICS[metric]["better"] == "higher" else model < base


def summarize_eval(ev, with_model):
    """Return {metric: {...}} with fold/sample values and per-circuit wins."""
    overall = ev.get("overall") or {}
    fold = overall.get("fold_averaged") or {}
    samp = overall.get("sample_averaged") or {}
    per = ev.get("per_circuit") or []

    names = set((fold.get("baseline") or {}).keys())
    if with_model:
        names |= set((fold.get("model") or {}).keys())
    out = {}
    for k in METRIC_ORDER:
        if k not in names:
            continue
        rec = {
            "fold_base": num((fold.get("baseline") or {}).get(k)),
            "samp_base": num((samp.get("baseline") or {}).get(k)),
        }
        if with_model:
            rec["fold"] = num((fold.get("model") or {}).get(k))
            rec["samp"] = num((samp.get("model") or {}).get(k))
            wins = n = 0
            for pc in per:
                b = better(k, num((pc.get("sample_averaged") or {}).get(k)),
                           num((pc.get("baseline") or {}).get(k)))
                if b is None:
                    continue
                n += 1
                wins += bool(b)
            rec["wins"], rec["n"] = wins, n
        out[k] = rec
    return out


def model_details(cdir, ev):
    """What model.html shows for one condition: the executable configuration
    (edaml_config.yaml) and the per-circuit LOCO results from eval.yaml."""
    spec = {"features": {}, "layers": [], "hparams": {}}
    cfg_path = os.path.join(cdir, "edaml_config.yaml")
    if os.path.exists(cfg_path):
        cfg = load_yaml(cfg_path) or {}
        na = cfg.get("network_architecture") or {}
        spec = {"features": na.get("features") or {}, "layers": na.get("layers") or [],
                "hparams": cfg.get("hyperparameters") or {}}
    per_circuit = {}
    for pc in ev.get("per_circuit") or []:
        # 7 significant digits: ample for display and the per-circuit δ statistics
        clean = lambda d: {k: (None if num(v) is None else float(f"{num(v):.7g}")) for k, v in (d or {}).items()}  # noqa: E731
        per_circuit[pc.get("circuit")] = {"baseline": clean(pc.get("baseline")),
                                          "model": clean(pc.get("sample_averaged"))}
    return {"spec": spec, "circuits": list(per_circuit), "per_circuit": per_circuit}


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
def main():
    if not os.path.isdir(SRC):
        sys.exit(f"model-data not found: {SRC}")

    experiments = {}
    details = {}   # per model condition: spec + per-circuit results, for model.html
    entries, baselines, notes = [], [], []
    task_meta = []

    for tid, tlabel, entity, unit in TASKS:
        tdir = os.path.join(SRC, f"{tid}_prediction")
        if not os.path.isdir(tdir):
            notes.append(f"missing task directory: {tid}_prediction")
            continue
        task_metrics, task_stages = set(), set()

        for exp_dir in sorted(os.listdir(tdir)):
            edir = os.path.join(tdir, exp_dir)
            if not os.path.isdir(edir):
                continue
            is_base = exp_dir == "baseline"
            exp = None if is_base else experiments.setdefault(exp_dir, describe_experiment(exp_dir))

            for cond in sorted(os.listdir(edir)):
                cdir = os.path.join(edir, cond)
                if not os.path.isdir(cdir):
                    continue
                pdk = next((p for p, _ in PDKS if cond.startswith(p + "-")), None)
                if pdk is None:
                    notes.append(f"unrecognized condition: {tid}/{exp_dir}/{cond}")
                    continue
                stage = cond[len(pdk) + 1:]
                task_stages.add(stage)
                ev_path = os.path.join(cdir, "eval.yaml")
                ev = load_yaml(ev_path) if os.path.exists(ev_path) else None

                if is_base:
                    if ev is None:
                        notes.append(f"baseline without eval.yaml: {tid}/{cond}")
                        continue
                    m = summarize_eval(ev, with_model=False)
                    task_metrics |= set(m)
                    baselines.append({"task": tid, "pdk": pdk, "stage": stage,
                                      "metrics": {k: {"fold": v["fold_base"], "samp": v["samp_base"]}
                                                  for k, v in m.items()}})
                    continue

                flow = parse_flow(os.path.join(cdir, "flow.log"))
                folds = sum(1 for d in os.listdir(cdir)
                            if os.path.isdir(os.path.join(cdir, d)))
                rec = {
                    "task": tid, "pdk": pdk, "stage": stage, "exp": exp_dir,
                    "in_paper": in_paper(tid, stage, exp_dir),
                    "folds": folds,
                    "run_utc": flow["run_utc"],
                }
                if ev is None:
                    rec["status"] = "failed" if flow["status"] == "failed" else "no_eval"
                    rec["metrics"] = {}
                else:
                    rec["status"] = "ok"
                    rec["metrics"] = summarize_eval(ev, with_model=True)
                    task_metrics |= set(rec["metrics"])
                    details[f"{tid}/{exp_dir}/{cond}"] = model_details(cdir, ev)
                entries.append(rec)

        task_meta.append({
            "id": tid, "label": tlabel, "entity": entity, "unit": unit,
            "metrics": [k for k in METRIC_ORDER if k in task_metrics],
            "stages": [s for s, _, _ in STAGES if s in task_stages],
            "paper_stages": [s for s, _, _ in STAGES
                             if s in PAPER_STAGES and not (tid in NO_FLOORPLAN and s == "floorplan")],
        })

    exp_list = sorted(experiments.values(), key=lambda e: e["id"])

    registry = {}
    reg_path = os.path.join(SRC, ".experiment_version_registry.json")
    if os.path.exists(reg_path):
        registry = json.load(open(reg_path))

    # One-line description per experiment, from the release's registry (keyed
    # "<experiment_name>|<descriptor>"); the site shows it verbatim and never
    # derives it from the descriptor itself.
    for e in exp_list:
        reg = (registry.get("experiments") or {}).get(f"{e['name']}|{e['descriptor']}") or {}
        if reg.get("description") and reg.get("version") in (None, e["version"]):
            e["description"] = reg["description"]
        elif e["descriptor"]:
            notes.append(f"no registry description for {e['id']}")

    payload = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "registry_schema_version": registry.get("schema_version"),
        "circuits": 18,
        "pdks": [{"id": p, "label": l} for p, l in PDKS],
        "stages": [{"id": s, "label": l, "short": sh, "in_paper": s in PAPER_STAGES}
                   for s, l, sh in STAGES],
        "metrics": METRICS,
        "tasks": task_meta,
        "experiments": exp_list,
        "baselines": baselines,
        "entries": entries,
        "notes": notes,
    }

    os.makedirs(OUT, exist_ok=True)
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    # leaderboard.js is what the page loads: a plain <script> payload works from
    # file:// as well as over HTTP (fetch() and ES modules are blocked on file://).
    # leaderboard.json is the same data for anyone consuming it programmatically.
    js_path = os.path.join(OUT, "leaderboard.js")
    with open(js_path, "w") as fh:
        fh.write("/* Generated by tools/build_data.py from model-data/. Do not hand-edit. */\n")
        fh.write(f"window.EDA_LEADERBOARD={body};\n")
    out_path = os.path.join(OUT, "leaderboard.json")
    with open(out_path, "w") as fh:
        fh.write(body)

    det_path = os.path.join(OUT, "model-details.js")
    with open(det_path, "w") as fh:
        fh.write("/* Generated by tools/build_data.py from model-data/. Do not hand-edit. */\n")
        fh.write("window.EDA_MODEL_DETAILS=" + json.dumps(details, separators=(",", ":"), ensure_ascii=False) + ";\n")

    ok = sum(e["status"] == "ok" for e in entries)
    print(f"wrote {js_path} and {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB each)")
    print(f"wrote {det_path} ({os.path.getsize(det_path) / 1024:.0f} KB, {len(details)} model conditions)")
    print(f"  {len(task_meta)} tasks, {len(exp_list)} experiments, "
          f"{len(baselines)} baseline conditions, {len(entries)} model conditions ({ok} with results)")
    for n in notes:
        print("  note:", n)


if __name__ == "__main__":
    main()
