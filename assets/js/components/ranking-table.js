// Ranking table for one condition (task × PDK × source stage).
//   rows:    OpenROAD baseline (pinned), then every released run, ranked by the
//            selected metric; failed runs listed last.
//   columns: rank, model (<experiment_name>-<descriptor>-<version>), one per metric.
//   cells:   value (raw) or improvement over OpenROAD (vs baseline), a bar, and
//            the run's rank within that column.
(function () {
  const LB = (window.LB = window.LB || {});
  const esc = LB.esc;
  const MEDAL = ["🥇", "🥈", "🥉"];

  const better = (meta, a, b) => (meta.better === "higher" ? a > b : a < b);

  // Rank of each entry within one metric column (1 = best); null when undefined.
  function columnRanks(entries, metric, agg, meta) {
    const vals = entries.map((e) => ({ e, v: LB.metricValue(e, metric, agg) })).filter((x) => x.v != null);
    vals.sort((a, b) => (meta.better === "higher" ? b.v - a.v : a.v - b.v));
    const ranks = new Map();
    vals.forEach((x, i) => {
      // ties share a rank
      const prev = vals[i - 1];
      ranks.set(x.e, prev && prev.v === x.v ? ranks.get(prev.e) : i + 1);
    });
    return ranks;
  }

  LB.renderRanking = function (el, d, C, handlers) {
    const task = d.taskById[C.task];
    const cond = d.cond.get(LB.condKey(C.task, C.pdk, C.stage));
    const metrics = task.metrics;
    const sortMeta = d.metrics[C.metric];

    const pool = cond ? cond.entries : [];
    const ok = pool.filter((e) => e.status === "ok");
    const bad = pool.filter((e) => e.status !== "ok");

    // sort by selected metric; undefined values last
    ok.sort((a, b) => {
      const va = LB.metricValue(a, C.metric, C.agg), vb = LB.metricValue(b, C.metric, C.agg);
      if (va == null || vb == null) return (va == null) - (vb == null);
      return sortMeta.better === "higher" ? vb - va : va - vb;
    });

    const ranks = Object.fromEntries(metrics.map((k) => [k, columnRanks(ok, k, C.agg, d.metrics[k])]));
    const baseVal = (k) => {
      const bm = cond && cond.baseline && cond.baseline.metrics[k];
      return bm ? (C.agg === "sample" ? bm.samp : bm.fold) : null;
    };

    // bar scale per column
    const scale = {};
    for (const k of metrics) {
      const meta = d.metrics[k];
      let max = 0;
      for (const e of ok) {
        if (C.view === "delta") {
          const dl = LB.delta(meta, LB.metricValue(e, k, C.agg), LB.baseValue(e, k, C.agg));
          if (dl) max = Math.max(max, Math.min(Math.abs(dl.value), dl.kind === "rel" ? 100 : 1));
        } else {
          const v = LB.metricValue(e, k, C.agg);
          if (v != null) max = Math.max(max, Math.abs(v));
        }
      }
      if (C.view !== "delta") { const b = baseVal(k); if (b != null) max = Math.max(max, Math.abs(b)); }
      scale[k] = max || 1;
    }

    const unit = (k) => (d.metrics[k].unit && task.unit ? ` (${task.unit})` : "");
    const cols = metrics.length + 2;

    const head = `<tr>
        <th class="rk-rank" scope="col">#</th>
        <th class="rk-model" scope="col">Model</th>
        ${metrics.map((k) => {
          const m = d.metrics[k], on = k === C.metric;
          return `<th class="rk-m${on ? " is-sort" : ""}" scope="col" aria-sort="${on ? (m.better === "higher" ? "descending" : "ascending") : "none"}">` +
            `<button class="rk-sort" data-metric="${k}" title="${esc(m.label)}: ${m.better} is better. Click to rank by it.">` +
            `${HELP.metric(esc(m.label), k, false)}${unit(k)} <span class="rk-dir" aria-hidden="true">${on ? "▾" : m.better === "higher" ? "↑" : "↓"}</span></button></th>`;
        }).join("")}
      </tr>`;

    const baseRow = cond && cond.baseline ? `<tr class="rk-base">
        <td class="rk-rank">—</td>
        <th class="rk-model" scope="row">OpenROAD baseline</th>
        ${metrics.map((k) => {
          const v = baseVal(k), meta = d.metrics[k];
          return `<td class="rk-m${k === C.metric ? " is-sort" : ""}"><span class="rk-v num">${LB.fmtValue(meta, v)}</span>` +
            `<span class="rk-badge rk-badge--none"></span></td>`;
        }).join("")}
      </tr>` : "";

    const rows = ok.map((e) => {
      const x = e.experiment;
      const r = ranks[C.metric].get(e);
      const beatsSort = (() => {
        const dl = LB.delta(sortMeta, LB.metricValue(e, C.metric, C.agg), LB.baseValue(e, C.metric, C.agg));
        return dl && dl.win;
      })();
      const cells = metrics.map((k) => {
        const meta = d.metrics[k];
        const v = LB.metricValue(e, k, C.agg);
        const dl = LB.delta(meta, v, LB.baseValue(e, k, C.agg));
        const rk = ranks[k].get(e);
        const tone = dl ? (dl.win ? "win" : "lose") : "none";
        let text, w;
        if (C.view === "delta") {
          text = LB.fmtDelta(meta, dl);
          w = dl ? (100 * Math.min(Math.abs(dl.value), dl.kind === "rel" ? 100 : 1)) / scale[k] : 0;
        } else {
          text = LB.fmtValue(meta, v);
          w = v == null ? 0 : (100 * Math.abs(v)) / scale[k];
        }
        return `<td class="rk-m${k === C.metric ? " is-sort" : ""}">` +
          (k === C.metric ? `<span class="rk-bar rk-bar--${tone}" style="width:${w}%"></span>` : "") +
          `<span class="rk-v num${C.view === "delta" && dl ? ` rk-${tone}` : ""}">${text}</span>` +
          `<span class="rk-badge${rk === 1 ? " is-top" : ""}"${rk ? ` title="rank ${rk} of ${ranks[k].size} on ${esc(meta.label)}"` : ""}>${rk || ""}</span></td>`;
      }).join("");

      return `<tr class="rk-row${r === 1 && beatsSort ? " rk-first" : ""}">
          <td class="rk-rank">${r && r <= 3 ? `<span class="rk-medal" title="rank ${r}">${MEDAL[r - 1]}</span>` : r || "–"}</td>
          <th class="rk-model" scope="row">
            <a class="rk-link mono" href="${esc(modelHref(d, C, x.id))}" title="${esc(x.description ? x.description + " Click to open the model page." : "Open the model page.")}">${esc(x.id)}</a>${e.in_paper ? "" : `<span class="rk-np" title="Released in model-data but not reported in the paper">not in paper</span>`}
          </th>
          ${cells}
        </tr>`;
    }).join("");

    const failed = bad.map((e) => `<tr class="rk-failed">
        <td class="rk-rank">–</td>
        <th class="rk-model" scope="row"><span class="mono">${esc(e.exp)}</span></th>
        <td colspan="${metrics.length}">${e.status === "failed" ? "run failed — no evaluation released" : "no evaluation released for this run"}</td>
      </tr>`).join("");

    el.innerHTML = !cond ? `<p class="lb-empty">No results for this condition.</p>` :
      `<div class="rk-scroll"><table class="rk">
        <thead>${head}</thead>
        <tbody>${baseRow}${rows || `<tr><td colspan="${cols}" class="rk-emptyrow">No released runs for this condition.</td></tr>`}${failed}</tbody>
      </table></div>`;

    el.querySelectorAll(".rk-sort").forEach((b) => b.addEventListener("click", () => handlers.onSort(b.dataset.metric)));
    return { shown: ok.length, total: cond ? cond.entries.length : 0 };
  };

  function modelHref(d, C, exp) {
    const p = new URLSearchParams({ task: C.task, exp, pdk: LB.pdkSlug(d, C.pdk), stage: C.stage });
    return `model.html?${p.toString()}`;
  }

})();
