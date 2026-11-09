/* ===================== circuit-disjoint generalization =====================
   The paper's LOCO analysis (Section 4.3, Tables 8 and 9), computed from the
   per-circuit results in eval.yaml:
     δ_k = 100 · (1 − model_k / OpenROAD_k)   error metrics (lower is better)
     δ_k = model_k − OpenROAD_k               R², TPR, TNR (higher is better)
   Summary statistics use the sample standard deviation and linearly
   interpolated quartiles, which reproduce the paper's Table 9. */

function genDelta(meta, m, b) {
  if (m == null || b == null || !isFinite(m) || !isFinite(b)) return null;
  if (meta.better === "higher") return m - b;
  if (b === 0) return null;
  return 100 * (1 - m / b);
}

function quantile(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function genStats(xs) {
  const n = xs.length;
  if (!n) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mean = xs.reduce((a, v) => a + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, median: quantile(s, 0.5), q1: quantile(s, 0.25), q3: quantile(s, 0.75),
    min: s[0], max: s[n - 1], wins: xs.filter((v) => v > 0).length };
}

/* δ formatting: relative % for error metrics, pp for TPR/TNR, raw for R² */
function fmtDelta(meta, v, signed) {
  if (v == null || !isFinite(v)) return "—";
  const sgn = signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : (v < 0 ? "−" : "");
  const a = Math.abs(v);
  if (meta.better !== "higher") return `${sgn}${a >= 1000 ? a.toExponential(1).replace("e+", "e") : a.toFixed(2)}%`;
  if (meta.pct) return `${sgn}${(a * 100).toFixed(1)} pp`;
  return `${sgn}${a.toFixed(3)}`;
}
function fmtSpread(meta, v) {
  if (v == null || !isFinite(v)) return "—";
  if (meta.better !== "higher") return `${Math.abs(v) >= 1e4 ? v.toExponential(1).replace("e+", "e") : v.toFixed(2)} pp`;
  if (meta.pct) return `${(v * 100).toFixed(1)} pp`;
  return v.toFixed(3);
}

function genMetrics() {
  const t = LBD.taskById[CUR.task];
  const pc = RUN.per_circuit || {};
  return t.metrics.filter((k) => Object.values(pc).some((r) => r.model && r.model[k] != null));
}

function drawGenSummary() {
  const pc = RUN.per_circuit || {};
  const rows = genMetrics().map((k) => {
    const meta = LBD.metrics[k];
    const ds = Object.values(pc).map((r) => genDelta(meta, r.model && r.model[k], r.baseline && r.baseline[k])).filter((v) => v != null);
    const st = genStats(ds);
    if (!st) return `<tr class="gen-row-na"><th scope="row">${HELP.metric(LB.esc(meta.label), k)}</th><td colspan="7" class="gen-na">undefined for every circuit</td></tr>`;
    const tone = (v) => (v > 0 ? "gen-pos" : v < 0 ? "gen-neg" : "");
    return `<tr class="gen-row${k === GEN.metric ? " is-sel" : ""}" data-k="${k}" tabindex="0" aria-selected="${k === GEN.metric}" title="Show ${LB.esc(meta.label)} per circuit">` +
      `<th scope="row">${HELP.metric(LB.esc(meta.label), k)}</th>` +
      `<td class="${tone(st.mean)}">${fmtDelta(meta, st.mean, true)}</td>` +
      `<td>${fmtSpread(meta, st.sd)}</td>` +
      `<td class="${tone(st.median)}"><b>${fmtDelta(meta, st.median, true)}</b></td>` +
      `<td>${fmtDelta(meta, st.q1, true)}</td><td>${fmtDelta(meta, st.q3, true)}</td>` +
      `<td>[${fmtDelta(meta, st.min, true)}, ${fmtDelta(meta, st.max, true)}]</td>` +
      `<td>${st.wins}/${st.n}</td></tr>`;
  }).join("");
  $("gen-summary").innerHTML = `<table class="gentable gentable--sum">
    <thead><tr><th>metric</th><th>mean</th><th>std.</th><th>median</th><th>Q1</th><th>Q3</th><th>range</th><th>wins</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function drawGenTable() {
  const pc = RUN.per_circuit || {};
  const ks = genMetrics();
  const unit = (k) => (LBD.metrics[k].unit && LBD.taskById[CUR.task].unit ? ` (${LBD.taskById[CUR.task].unit})` : "");
  const head1 = ks.map((k) => `<th colspan="3" class="gen-grp">${HELP.metric(LB.esc(LBD.metrics[k].label), k)}${unit(k)}</th>`).join("");
  const head2 = ks.map(() => `<th class="gen-grp-first">OpenROAD</th><th>model</th><th>&Delta;</th>`).join("");
  const rows = RUN.circuits.filter((c) => pc[c]).map((c) => {
    const r = pc[c];
    return `<tr><th scope="row" class="mono">${LB.esc(c)}</th>` + ks.map((k) => {
      const meta = LBD.metrics[k];
      const b = r.baseline ? r.baseline[k] : null, m = r.model ? r.model[k] : null;
      const d = genDelta(meta, m, b);
      const tone = d == null ? "" : d > 0 ? "gen-pos" : d < 0 ? "gen-neg" : "";
      return `<td class="gen-grp-first gen-b">${LB.fmtValue(meta, b)}</td>` +
        `<td class="${tone}">${LB.fmtValue(meta, m)}</td>` +
        `<td class="gen-d ${tone}">${fmtDelta(meta, d, true)}</td>`;
    }).join("") + `</tr>`;
  }).join("");
  $("gen-table").innerHTML = `<table class="gentable gentable--pc">
    <thead><tr><th rowspan="2">circuit</th>${head1}</tr><tr>${head2}</tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/* ---------- per-circuit chart: diverging bars of δ for one metric ----------
   Polarity encoding: bars right of zero = model better, left = OpenROAD better,
   with a validated blue/orange pair (--gen-pos / --gen-neg). Direction and the
   value label carry the meaning too, so it is never colour alone. */
const GEN = { metric: null, view: "chart" };
const GEN_CLIP_REL = 200;   // relative δ below −200% is drawn clipped (true value in label)

function genNiceStep(span) {
  const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function drawGenChart() {
  const k = GEN.metric, meta = LBD.metrics[k], pc = RUN.per_circuit || {};
  const rel = meta.better !== "higher";
  const rows = RUN.circuits.filter((c) => pc[c]).map((c) => {
    const b = pc[c].baseline ? pc[c].baseline[k] : null, m = pc[c].model ? pc[c].model[k] : null;
    return { c, b, m, d: genDelta(meta, m, b) };
  });
  const ok = rows.filter((r) => r.d != null).sort((x, y) => y.d - x.d);
  const na = rows.filter((r) => r.d == null);
  $("gen-pc-title").innerHTML = `per held-out circuit · ${HELP.metric(LB.esc(meta.label), k)} improvement over OpenROAD`;
  if (!ok.length) { $("gen-chart").innerHTML = `<p class="hint">${LB.esc(meta.label)} is undefined for every circuit.</p>`; return; }

  const clip = (v) => (rel ? Math.max(v, -GEN_CLIP_REL) : v);
  let lo = Math.min(0, ...ok.map((r) => clip(r.d))), hi = Math.max(0, ...ok.map((r) => clip(r.d)));
  if (lo === hi) hi = lo + 1;
  const step = genNiceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const pct = (v) => ((clip(v) - lo) / (hi - lo)) * 100;
  const zero = pct(0);
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const tickLab = (t) => (rel ? `${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.abs(t)}%` : meta.pct ? `${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.abs(t * 100).toFixed(0)} pp` : `${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.abs(+t.toFixed(3))}`);

  const grid = ticks.map((t) => `<span class="gc-tick${t === 0 ? " gc-zero" : ""}" style="left:${pct(t)}%"></span>`).join("");
  const axis = ticks.map((t) => `<span class="gc-tl" style="left:${pct(t)}%">${tickLab(t)}</span>`).join("");
  const bars = ok.map((r) => {
    const x0 = Math.min(zero, pct(r.d)), w = Math.abs(pct(r.d) - zero);
    const pos = r.d > 0, clipped = rel && r.d < -GEN_CLIP_REL;
    const labLeft = pos ? `left:calc(${x0 + w}% + 6px)` : `right:calc(${100 - x0}% + 6px)`;
    return `<div class="gc-row" data-c="${LB.esc(r.c)}">` +
      `<span class="gc-name mono">${LB.esc(r.c)}</span>` +
      `<span class="gc-plot">${grid}` +
      `<span class="gc-bar ${pos ? "gc-pos" : "gc-neg"}${clipped ? " gc-clip" : ""}" style="left:${x0}%;width:${Math.max(w, 0.4)}%"></span>` +
      `<span class="gc-val" style="${labLeft}">${fmtDelta(meta, r.d, true)}${clipped ? " ◂" : ""}</span>` +
      `</span></div>`;
  }).join("");
  const naNote = na.length ? `<p class="gc-na">Undefined for ${na.map((r) => `<span class="mono">${LB.esc(r.c)}</span>`).join(", ")}.</p>` : "";
  $("gen-chart").innerHTML =
    `<div class="gc" role="img" aria-label="${LB.esc(meta.label)} improvement over OpenROAD for each held-out circuit; see the table view for values">` +
    `<div class="gc-dir"><span class="gc-name"></span><span class="gc-plot">` +
    `<span class="gc-dl" style="right:${100 - zero}%">← OpenROAD better</span>` +
    `<span class="gc-dr" style="left:${zero}%">model better →</span></span></div>` +
    bars +
    `<div class="gc-axis"><span class="gc-name"></span><span class="gc-plot">${axis}</span></div>` +
    `</div>${naNote}`;

  // hover: per-bar tooltip with both values (hit target is the whole row)
  const tip = genTip();
  $("gen-chart").querySelectorAll(".gc-row").forEach((row) => {
    const r = ok.find((x) => x.c === row.dataset.c);
    row.addEventListener("mousemove", (e) => {
      tip.innerHTML = `<b class="mono">${LB.esc(r.c)}</b> held out<br>` +
        `model <b>${LB.fmtValue(meta, r.m)}</b> · OpenROAD <b>${LB.fmtValue(meta, r.b)}</b><br>` +
        `δ ${fmtDelta(meta, r.d, true)} — ${r.d > 0 ? "model better" : r.d < 0 ? "OpenROAD better" : "tie"}`;
      tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = `${Math.max(8, Math.min(e.clientX + 14, innerWidth - w - 8))}px`;
      tip.style.top = `${e.clientY + 16 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 16}px`;
    });
    row.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
}

function genTip() {
  let t = $("gentip");
  if (!t) {
    t = document.createElement("div");
    t.id = "gentip"; t.setAttribute("role", "tooltip"); t.hidden = true;
    document.body.appendChild(t);
    addEventListener("scroll", () => { t.hidden = true; }, { passive: true });
  }
  return t;
}

function drawGenPerCircuit() {
  document.querySelectorAll("[data-genview]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.genview === GEN.view)));
  $("gen-chart").hidden = GEN.view !== "chart";
  $("gen-table").hidden = GEN.view !== "table";
  if (GEN.view === "chart") drawGenChart();
  else { $("gen-pc-title").textContent = "per held-out circuit"; drawGenTable(); }
}

function drawGeneralization() {
  const ks = genMetrics();
  if (!GEN.metric || !ks.includes(GEN.metric)) GEN.metric = ks.includes("mae") ? "mae" : ks[0];
  drawGenSummary();
  drawGenPerCircuit();
  if (!drawGeneralization._wired) {
    drawGeneralization._wired = true;
    const pick = (row) => { if (row && row.dataset.k) { GEN.metric = row.dataset.k; GEN.view = "chart"; drawGenSummary(); drawGenPerCircuit(); } };
    $("gen-summary").addEventListener("click", (e) => pick(e.target.closest(".gen-row")));
    $("gen-summary").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e.target.closest(".gen-row")); } });
    document.querySelectorAll("[data-genview]").forEach((b) => b.addEventListener("click", () => { GEN.view = b.dataset.genview; drawGenPerCircuit(); }));
  }
}
