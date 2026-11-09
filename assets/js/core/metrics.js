// Metric arithmetic and number formatting.
//
// Improvement over OpenROAD follows the paper:
//   lower-is-better metrics  ->  Δ = 100 · (1 − model / baseline)   (relative %, eq. 18)
//   higher-is-better metrics ->  Δ = model − baseline               (absolute, eq. 16)
// Positive Δ always means the model is better.
//
// Plain script (not an ES module) so the page also works when opened from disk.
(function () {
  const LB = (window.LB = window.LB || {});

  LB.delta = function (meta, model, base) {
    if (model == null || base == null) return null;
    if (meta.better === "higher") return { value: model - base, kind: "abs", win: model > base };
    if (base === 0) return null;
    return { value: 100 * (1 - model / base), kind: "rel", win: model < base };
  };

  LB.fmtDelta = function (meta, d) {
    if (!d) return "—";
    const sign = d.value > 0 ? "+" : d.value < 0 ? "−" : "±";
    const a = Math.abs(d.value);
    if (d.kind === "rel") return a >= 1000 ? `${sign === "−" ? "<−" : ">+"}999%` : `${sign}${a.toFixed(1)}%`;
    if (meta.pct) return `${sign}${(a * 100).toFixed(1)} pp`;
    return `${sign}${a.toFixed(3)}`;
  };

  // OpenROAD is already exact: nothing left for a model to win.
  LB.isSaturated = function (meta, base) {
    if (base == null) return false;
    return meta.better === "higher" ? base >= 1 : base === 0;
  };

  const trim = (s) => (s.includes("e") || !s.includes(".") ? s : s.replace(/\.?0+$/, ""));

  LB.fmtNum = function (v) {
    if (v == null || Number.isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1e4) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (a >= 1) return trim(v.toPrecision(5));
    if (a >= 1e-3) return trim(v.toPrecision(4));
    return v.toExponential(2);
  };

  // Very large magnitudes (e.g. MAPE when targets sit near zero) in short form: 2.4e9
  const sci = (x) => x.toExponential(1).replace("e+", "e");

  LB.fmtValue = function (meta, v) {
    if (v == null) return "—";
    if (meta.pct) {
      const p = v * 100;
      if (Math.abs(p) >= 1e4) return `${sci(p)}%`;
      return `${Math.abs(p) >= 100 ? p.toFixed(1) : p.toFixed(2)}%`;
    }
    if (Math.abs(v) >= 1e7) return sci(v);
    return LB.fmtNum(v);
  };

  LB.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
})();
