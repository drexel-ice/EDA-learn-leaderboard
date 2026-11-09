// Page state lives in the query string so every view is deep-linkable.
// Each page passes its own defaults; only non-default values are written.
(function () {
  const LB = (window.LB = window.LB || {});

  LB.readParams = function (defaults) {
    const p = new URLSearchParams(location.search);
    const s = Object.assign({}, defaults);
    for (const k of Object.keys(defaults)) if (p.has(k)) s[k] = p.get(k);
    return s;
  };

  LB.writeParams = function (s, defaults, push) {
    const p = new URLSearchParams();
    for (const k of Object.keys(defaults)) if (s[k] !== defaults[k]) p.set(k, s[k]);
    const q = p.toString();
    const url = location.pathname + (q ? `?${q}` : "") + location.hash;
    try {
      history[push ? "pushState" : "replaceState"](null, "", url);
    } catch (e) {
      /* some browsers refuse history changes on file:// — the page still works */
    }
  };

  // Link to the ranking page for one condition. `extra` carries optional
  // view settings (e.g. agg) that differ from the ranking page defaults.
  LB.rankingHref = function (d, task, pdk, stage, metric, extra) {
    const p = new URLSearchParams({
      task, pdk: LB.pdkSlug(d, pdk), stage, metric: LB.metricParam(metric),
    });
    for (const [k, v] of Object.entries(extra || {})) if (v != null) p.set(k, v);
    return `ranking.html?${p.toString()}`;
  };
})();
