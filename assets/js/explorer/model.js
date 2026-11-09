/* ===================== architecture + forward pass =====================
   Adapted from the Flask explorer. The architecture comes from hparams.yaml;
   linear shapes are taken from the checkpoint (some hparams.yaml files declare
   an in_features that differs from the trained tensors). */

function yamlArchSpec() {
  const raw = (window.EDA_SPEC && EDA_SPEC.layers) || [];
  if (!raw.length) return null;
  const layers = [];
  let li = 0;
  raw.forEach((l) => {
    const t = String(l.type || "").toLowerCase();
    if (t === "linear") {
      const real = M0 && M0[li];
      layers.push({ k: "linear", fo: real ? real.fo : +l.out_features, fi: real ? real.fi : +l.in_features });
      li++;
    } else if (t === "dropout") layers.push({ k: "drop", name: l.type });
    else layers.push({ k: "act", name: l.type || "op" });
  });
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].k === "linear") { layers[i].out = true; break; }
  const first = layers.find((l) => l.k === "linear");
  return { input: first ? first.fi : 0, inputKind: "scalar", label: "hparams.yaml", layers };
}
function activeArchSpec() {
  return yamlArchSpec() || { input: 0, inputKind: "scalar", label: "", layers: [] };
}

/* used by the op graph for stable ids */
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

/* forward pass over the weight-bearing layers (ReLU between, linear output) */
function forward(W, x, abl) {
  const acts = [Float32Array.from(x)];
  let a = acts[0];
  for (let li = 0; li < W.length; li++) {
    const l = W[li], out = new Float32Array(l.fo);
    for (let o = 0; o < l.fo; o++) {
      let s = l.B[o];
      const base = o * l.fi;
      for (let i = 0; i < l.fi && i < a.length; i++) s += l.W[base + i] * a[i];
      if (li < W.length - 1) s = Math.max(0, s);
      if (abl && abl.has(li + "_" + o)) s = 0;
      out[o] = s;
    }
    acts.push(out);
    a = out;
  }
  return acts;
}

/* ===================== statistics ===================== */
function layerStats(l) {
  let mn = Infinity, mx = -Infinity, s = 0, s2 = 0, past = 0;
  for (const v of l.W) { mn = Math.min(mn, v); mx = Math.max(mx, v); s += v; s2 += v * v; if (Math.abs(v) > l.bound) past++; }
  const n = l.W.length, mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  return { n, mn, mx, mean, std, expStd: l.bound / Math.sqrt(3), ratio: std / (l.bound / Math.sqrt(3)), pastFrac: past / n };
}
function layerLab(l) { return l.shape.slice(0, 2).join("×"); }
