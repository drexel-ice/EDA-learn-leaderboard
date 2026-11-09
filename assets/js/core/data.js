// Index the payload from data/leaderboard.js (built by tools/build_data.py).
(function () {
  const LB = (window.LB = window.LB || {});

  LB.condKey = (task, pdk, stage) => `${task}|${pdk}|${stage}`;

  LB.loadLeaderboard = function () {
    const d = window.EDA_LEADERBOARD;
    if (!d) throw new Error("data/leaderboard.js did not load. Run: python3 tools/build_data.py");
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    d.taskById = byId(d.tasks);
    d.pdkById = byId(d.pdks);
    d.stageById = byId(d.stages);
    d.expById = byId(d.experiments);

    d.cond = new Map();
    const slot = (t, p, s) => {
      const k = LB.condKey(t, p, s);
      if (!d.cond.has(k)) d.cond.set(k, { task: t, pdk: p, stage: s, baseline: null, entries: [] });
      return d.cond.get(k);
    };
    for (const b of d.baselines) slot(b.task, b.pdk, b.stage).baseline = b;
    for (const e of d.entries) {
      e.experiment = d.expById[e.exp];
      slot(e.task, e.pdk, e.stage).entries.push(e);
    }
    return d;
  };

  LB.metricValue = function (entry, metric, agg) {
    const m = entry.metrics[metric];
    return m ? (agg === "sample" ? m.samp : m.fold) : null;
  };

  LB.baseValue = function (entry, metric, agg) {
    const m = entry.metrics[metric];
    return m ? (agg === "sample" ? m.samp_base : m.fold_base) : null;
  };

  LB.bestEntry = function (entries, metric, agg, meta) {
    let best = null, bestV = null;
    for (const e of entries) {
      if (e.status !== "ok") continue;
      const v = LB.metricValue(e, metric, agg);
      if (v == null) continue;
      if (best == null || (meta.better === "higher" ? v > bestV : v < bestV)) { best = e; bestV = v; }
    }
    return best;
  };

  // URL-friendly names: pdk=ng45 (the display label, lowercased), metric=MAE.
  // Both resolvers also accept the internal ids, case-insensitively.
  LB.pdkSlug = (d, id) => d.pdkById[id].label.toLowerCase();
  LB.resolvePdk = function (d, v) {
    const s = String(v || "").toLowerCase();
    const p = d.pdks.find((x) => x.id === s || x.label.toLowerCase() === s);
    return p ? p.id : null;
  };
  LB.metricParam = (k) => k.toUpperCase();
  LB.resolveMetric = function (d, v) {
    const s = String(v || "").toLowerCase().replace("²", "2");
    return d.metrics[s] ? s : null;
  };

})();
