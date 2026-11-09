/* ===================== model page boot =====================
   model.html?task=interconnect_length&exp=fixed_mlp-standard-v1.0.0&pdk=ng45&stage=global_place

   Everything shown comes from data/model-details.js (edaml_config.yaml +
   eval.yaml of the condition) and data/leaderboard.js. */
(function () {
  const DEFAULTS = { task: "interconnect_length", exp: "fixed_mlp-standard-v1.0.0", pdk: "ng45", stage: "global_place" };
  // A model link is an address: always spell out every part, even defaults.
  const URL_KEYS = { task: null, exp: null, pdk: null, stage: null };
  // The op graph shows the architecture; released models carry no weight tensors to zoom into.
  window.EDA_CFG = { op_graph_tensor_zoom: false };

  function fail(msg) {
    $("app").innerHTML = `<div class="k s12"><span class="knum">model</span><p class="hint">${msg}</p>` +
      `<p><a href="index.html">← back to the leaderboard</a></p></div>`;
  }

  function main() {
    try { LBD = LB.loadLeaderboard(); } catch (err) { fail(LB.esc(err.message)); return; }
    const P = LB.readParams(DEFAULTS);
    const task = LBD.taskById[P.task] ? P.task : null;
    const exp = LBD.expById[P.exp] ? P.exp : null;
    const pdk = LB.resolvePdk(LBD, P.pdk);
    const stage = LBD.stageById[P.stage] ? P.stage : null;
    if (!task || !exp || !pdk || !stage) { fail("Unknown model address. Pick a model from a ranking page."); return; }
    const entry = LBD.entries.find((e) => e.task === task && e.exp === exp && e.pdk === pdk && e.stage === stage);
    if (!entry) { fail(`No released model <span class="mono">${LB.esc(exp)}</span> for this condition.`); return; }
    if (entry.status !== "ok") { fail(`<span class="mono">${LB.esc(exp)}</span> has no evaluation for this condition.`); return; }

    Object.assign(CUR, { task, exp, pdk, stage, cond: `${pdk}-${stage}` });
    LB.writeParams({ task, exp, pdk: LB.pdkSlug(LBD, pdk), stage }, URL_KEYS);
    const t = LBD.taskById[task];
    document.title = `${exp} · ${t.label} · ${LBD.pdkById[pdk].label} · ${LBD.stageById[stage].label} | EDA-OpenML`;
    $("crumb").innerHTML = `<a href="${LB.rankingHref(LBD, task, pdk, stage, "mae")}">← ranking · ${LB.esc(t.label)} · ${LB.esc(LBD.pdkById[pdk].label)} · ${LB.esc(LBD.stageById[stage].label)}</a>`;

    RUN = EDA_MODEL.run(task, exp, CUR.cond);
    if (!RUN) { fail("Model details not found. Run <span class=\"mono\">python3 tools/build_data.py</span>."); return; }
    window.EDA_SPEC = { layers: RUN.spec.layers, formulation: { target: task } };
    setFeatures(RUN.spec.features);
    M0 = M = EDA_MODEL.layersFrom(RUN.spec.layers);
    drawHeader();
    drawSpecCards();
    drawNet();
    drawGeneralization();
    addEventListener("resize", () => fitGraphCard($("graph")));
    if (window.ResizeObserver) new ResizeObserver(() => fitGraphCard($("graph"))).observe($("graph").parentElement);
    addEventListener("themechange", drawNet);
  }

  main();
})();
