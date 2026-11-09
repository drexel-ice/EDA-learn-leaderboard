// Ranking page: every released model for one condition.
//   ranking.html?task=total_area&pdk=ng45&stage=detailed_place&metric=MAE
(function () {
  const LB = window.LB;
  const esc = LB.esc;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    task: "interconnect_length",
    pdk: "ng45",
    stage: "global_place",
    metric: "MAE",
    agg: "fold",          // fold | sample
    view: "raw",          // raw | delta
  };

  let D, S;

  // URL state (S) -> resolved ids (C)
  function context() {
    return {
      task: S.task, pdk: LB.resolvePdk(D, S.pdk), stage: S.stage,
      metric: LB.resolveMetric(D, S.metric), agg: S.agg, view: S.view,
    };
  }

  function validate(s) {
    if (!D.taskById[s.task]) s.task = DEFAULTS.task;
    const t = D.taskById[s.task];
    const pdk = LB.resolvePdk(D, s.pdk) || LB.resolvePdk(D, DEFAULTS.pdk);
    s.pdk = LB.pdkSlug(D, pdk);
    if (!t.stages.includes(s.stage)) s.stage = t.stages.includes(DEFAULTS.stage) ? DEFAULTS.stage : t.stages[0];
    const m = LB.resolveMetric(D, s.metric);
    s.metric = LB.metricParam(m && t.metrics.includes(m) ? m : "mae");
    if (!["fold", "sample"].includes(s.agg)) s.agg = DEFAULTS.agg;
    if (!["raw", "delta"].includes(s.view)) s.view = DEFAULTS.view;
    return s;
  }

  function update(patch, push) {
    S = validate(Object.assign({}, S, patch));
    LB.writeParams(S, DEFAULTS, push);
    render();
  }

  function render() {
    const C = context();
    const t = D.taskById[C.task], st = D.stageById[C.stage], p = D.pdkById[C.pdk];
    const cond = D.cond.get(LB.condKey(C.task, C.pdk, C.stage));

    document.title = `${t.label} · ${p.label} · ${st.label} | EDA-OpenML Ranking`;
    $("r-title").textContent = t.label;
    $("r-sub").innerHTML = `<span class="r-chip">${esc(p.label)}</span><span class="r-chip">${esc(st.label)}</span>` +
      `<span class="r-chip">${esc(t.entity)}-level</span>` +
      (st.in_paper ? "" : `<span class="r-chip r-chip--warn">not reported in the paper</span>`);
    $("back").href = "index.html" + (S.agg !== "fold" ? `?agg=${S.agg}` : "");

    // condition pickers
    const opts = (list, v) => list.map(([id, l]) => `<option value="${esc(id)}"${id === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    $("c-task").innerHTML = opts(D.tasks.map((x) => [x.id, x.label]), C.task);
    $("c-pdk").innerHTML = opts(D.pdks.map((x) => [x.id, x.label]), C.pdk);
    $("c-stage").innerHTML = opts(t.stages.map((s) => [s, D.stageById[s].label + (D.stageById[s].in_paper ? "" : " *")]), C.stage);

    document.querySelectorAll("[data-seg]").forEach((b) =>
      b.setAttribute("aria-pressed", String(S[b.dataset.seg] === b.dataset.val)));

    const res = LB.renderRanking($("ranking"), D, C, {
      onSort: (metric) => update({ metric: LB.metricParam(metric) }),
    });
    const meta = D.metrics[C.metric];
    $("r-count").innerHTML = `<strong>${res.shown}</strong> of ${res.total} models · ranked by ` +
      `${S.agg === "sample" ? "sample" : "fold"}-averaged ${esc(meta.label)} (${meta.better} is better)`;
  }

  function wire() {
    $("c-task").addEventListener("change", (e) => update({ task: e.target.value }, true));
    $("c-pdk").addEventListener("change", (e) => update({ pdk: e.target.value }, true));
    $("c-stage").addEventListener("change", (e) => update({ stage: e.target.value }, true));
    document.querySelectorAll("[data-seg]").forEach((b) =>
      b.addEventListener("click", () => update({ [b.dataset.seg]: b.dataset.val })));
    addEventListener("popstate", () => { S = validate(LB.readParams(DEFAULTS)); render(); });
  }

  function main() {
    try {
      D = LB.loadLeaderboard();
    } catch (err) {
      $("app").innerHTML = `<div class="lb-error"><strong>Could not load the leaderboard data.</strong><br>${esc(err.message)}</div>`;
      return;
    }
    S = validate(LB.readParams(DEFAULTS));
    LB.writeParams(S, DEFAULTS);   // normalise e.g. pdk=nangate45 -> ng45
    wire();
    render();
  }

  if (document.readyState === "loading") addEventListener("DOMContentLoaded", main);
  else main();
})();
