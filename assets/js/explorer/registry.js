/* ===================== shared state, registries, header =====================
   Adapted from the Flask explorer. Everything shown comes from the released
   artifacts: no stand-in weights, curves or synthetic circuit inputs. */
const $ = (id) => document.getElementById(id);
const fmt = (v, d) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(d === undefined ? 3 : d));

/* current address. pdk is the internal id (nangate45 ...), cond = <pdk>-<stage> */
let CUR = { task: null, exp: null, pdk: null, stage: null, cond: null, circuit: null };
let RUN = null;          // EDA_MODEL run payload for CUR
let LBD = null;          // leaderboard data (window.EDA_LEADERBOARD, indexed)
let M = null, M0 = null, FAM = "MLP", X = null, ACTS = null;
let featOn = null;       // feature toggles are not offered; kept for the shared views
const ablate = new Set(), edits = new Map();
let curveTab = "loss";
const curveOn = {};
let curveShowTr = true, curveShowVa = true;

const isTree = () => false;

/* features of this model, in input order: [[group, [names]], ...] */
let FEATS = [], FEATFLAT = [];
function setFeatures(features) {
  FEATS = Object.entries(features || {});
  FEATFLAT = [];
  FEATS.forEach(([g, ns]) => ns.forEach((n) => FEATFLAT.push({ g, n, full: `${g}.${n}` })));
}
const ENT_COLORS = ["var(--ent-netlist)", "var(--ent-cell)", "var(--ent-power)", "var(--ent-timing)",
  "var(--ent-net)", "var(--ent-clock)", "var(--ent-routing)"];
const GCOL = new Proxy({}, {
  get(_, g) {
    const i = FEATS.findIndex(([name]) => name === g);
    return ENT_COLORS[(i < 0 ? 0 : i) % ENT_COLORS.length];
  },
});

function cssTok(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function cssVarName(expr) { return String(expr || "").replace(/^var\(|\)$/g, "").trim(); }
function cssColor(expr) { return cssTok(cssVarName(expr)); }
function lerp(a, b, t) { return a + (b - a) * t; }

const liveCircuits = () => (RUN && RUN.circuits) || [];
const taskLabel = (t) => (LBD && LBD.taskById[t] ? LBD.taskById[t].label : String(t || "").replace(/_/g, " "));

/* ---------- header: identity + evaluation ---------- */
function drawHeader() {
  $("m-title").textContent = CUR.exp;
  const t = LBD.taskById[CUR.task], st = LBD.stageById[CUR.stage], p = LBD.pdkById[CUR.pdk];
  const fields = [
    ["problem", CUR.task],
    ["pdk", p ? p.label : CUR.pdk],
    ["source_stage", CUR.stage],
    ["target entity", t ? t.entity.toLowerCase() : "—"],
  ];
  $("m-fields").innerHTML = fields.map(([k, v]) =>
    `<div class="pffield"><div class="pflab">${LB.esc(k)}</div><div class="pfval">${LB.esc(v)}</div></div>`).join("");
  if (st && !st.in_paper) $("m-fields").insertAdjacentHTML("beforeend", `<div class="pffield"><div class="pflab">note</div><div class="pfval">not in paper</div></div>`);
  drawEval();
}

/* OpenROAD vs model, fold-averaged (each held-out circuit weighs equally)
   and sample-averaged (pooled over all out-of-fold predictions) */
function drawEval() {
  const host = $("evalhost");
  const t = LBD.taskById[CUR.task];
  const entry = LBD.entries.find((e) => e.task === CUR.task && e.exp === CUR.exp && e.pdk === CUR.pdk && e.stage === CUR.stage);
  if (!entry || !t) { host.innerHTML = ""; return; }
  const cols = t.metrics;
  const meta = (k) => LBD.metrics[k];
  const cell = (k, v, b, isModel) => {
    const text = LB.fmtValue(meta(k), v);
    if (!isModel || v == null || b == null) return `<td>${text}</td>`;
    const better = meta(k).better === "higher" ? v > b : v < b;
    return `<td class="${v === b ? "evaltable-tie" : better ? "evaltable-better" : "evaltable-worse"}">${text}</td>`;
  };
  const get = (k, f) => (entry.metrics[k] ? entry.metrics[k][f] : null);
  // the averaging label sits to the left, spanning its OpenROAD and model rows
  const block = (label, mf, bf) =>
    `<tr class="evaltable-base evaltable-first"><th scope="rowgroup" rowspan="2" class="evaltable-side">${label}</th>` +
    `<th scope="row">OpenROAD</th>${cols.map((k) => cell(k, get(k, bf), get(k, bf), false)).join("")}</tr>` +
    `<tr class="evaltable-model"><th scope="row">model</th>${cols.map((k) => cell(k, get(k, mf), get(k, bf), true)).join("")}</tr>`;
  host.innerHTML = `<table class="evaltable">
    <thead><tr><th></th><th></th>${cols.map((k) => `<th>${HELP.metric(LB.esc(meta(k).label), k)}</th>`).join("")}</tr></thead>
    <tbody>${block("fold-averaged", "fold", "fold_base")}${block("sample-averaged", "samp", "samp_base")}</tbody></table>`;
}

/* ---------- static spec cards ---------- */
function drawSpecCards() {
  const spec = RUN.spec;
  $("featbody").innerHTML = FEATS.length ? FEATS.map(([g, ns]) =>
    `<details class="fg" open><summary class="fgh" style="color:${GCOL[g]}">${LB.esc(g)} <span>${ns.length}</span></summary>` +
    ns.map((n) => `<div class="fn featitem">${LB.esc(n)}</div>`).join("") + `</details>`).join("")
    : `<p class="hint">No feature list in hparams.yaml.</p>`;
  const hp = spec.hparams || {};
  $("hpbody").innerHTML = Object.keys(hp).length
    ? Object.entries(hp).map(([k, v]) => `<div class="st"><span>${LB.esc(k)}</span><b>${LB.esc(v)}</b></div>`).join("")
    : `<p class="hint">No hyperparameters recorded.</p>`;
}
