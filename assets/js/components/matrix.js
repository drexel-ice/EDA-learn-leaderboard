// Overview matrix.
//   rows:    one thin header row per task, then one row per metric it reports
//   columns: source stage × PDK
//   cell:    who wins (best released run vs. the OpenROAD estimate)
//            and the winning value. Each cell links to its ranking page.
(function () {
  const LB = (window.LB = window.LB || {});
  const esc = LB.esc;

  function classify(d, S, t, metric, p, s) {
    const meta = d.metrics[metric];
    const out = { k: LB.condKey(t.id, p.id, s.id), metric };
    if (!t.stages.includes(s.id)) return Object.assign(out, { kind: "na" });
    const c = d.cond.get(out.k);
    if (!c) return Object.assign(out, { kind: "na" });

    const pool = c.entries;
    const best = LB.bestEntry(pool, metric, S.agg, meta);
    if (!best) {
      const bm = c.baseline && c.baseline.metrics[metric];
      const base = bm ? (S.agg === "sample" ? bm.samp : bm.fold) : null;
      // Runs exist, but this metric is NaN for all of them (e.g. MPE with no overestimates).
      if (pool.some((e) => e.status === "ok")) return Object.assign(out, { kind: "nan", base });
      return Object.assign(out, { kind: "none", base });
    }
    const m = LB.metricValue(best, metric, S.agg);
    const b = LB.baseValue(best, metric, S.agg);
    Object.assign(out, { best, m, b, mm: best.metrics[metric] });
    if (b == null) return Object.assign(out, { kind: "undef" });
    if (LB.isSaturated(meta, b)) return Object.assign(out, { kind: "sat" });
    const dl = LB.delta(meta, m, b);
    return Object.assign(out, { kind: dl && dl.win ? "win" : "lose", dl });
  }

  function cellHTML(d, S, t, cl, tipIdx, first, href) {
    const meta = d.metrics[cl.metric];
    const cls = `mx-c mx-${cl.kind}${first ? " mx-first" : ""}`;
    // One line per cell: the winning value; colour says who won, the tooltip says which run.
    let val, extra = "";
    switch (cl.kind) {
      case "na":
        return `<td class="${cls}"></td>`;
      case "none": val = "–"; extra = ` aria-label="no entry"`; break;
      case "nan": val = "n/d"; break;
      case "undef": val = LB.fmtValue(meta, cl.m); break;
      case "sat": val = `◆ ${LB.fmtValue(meta, cl.b)}`; break;
      case "win": val = LB.fmtValue(meta, cl.m); break;
      default: val = LB.fmtValue(meta, cl.b);
    }
    return `<td class="${cls}"><a href="${esc(href)}" data-t="${tipIdx}"${extra}>${val}</a></td>`;
  }

  function tipHTML(d, S, t, p, s, cl) {
    const meta = d.metrics[cl.metric];
    const unit = meta.unit && t.unit ? ` ${t.unit}` : "";
    const head = `<b>${esc(t.label)}</b> · ${esc(meta.label)}<br><span class="tip-sub">${esc(p.label)} · ${esc(s.label)}` +
      `${s.in_paper ? "" : " (not in paper)"}</span>`;
    if (cl.kind === "nan") {
      return `${head}<br>OpenROAD <b>${LB.fmtValue(meta, cl.base)}</b>${unit}<br>` +
        `<span class="tip-sub">${esc(meta.label)} is undefined (NaN) for every model run here</span>`;
    }
    if (cl.kind === "none") {
      return `${head}<br>OpenROAD <b>${LB.fmtValue(meta, cl.base)}</b>${unit}<br>` +
        `<span class="tip-sub">no released runs for this condition</span>`;
    }
    // name the run by its release folder: <experiment_name>-<descriptor>-<version>
    const run = `<span class="mono">${esc(cl.best.experiment.id)}</span>`;
    const verdict = {
      win: `✓ ${run} beats OpenROAD`,
      lose: `– OpenROAD still leads ${run}`,
      sat: "◆ saturated: OpenROAD is exact",
      undef: `${run} · baseline undefined`,
    }[cl.kind];
    const lines = [head, `<span class="tip-v tip-v--${cl.kind}">${verdict}</span>`,
      `${run} <b>${LB.fmtValue(meta, cl.m)}</b>${unit}`,
      `OpenROAD <b>${LB.fmtValue(meta, cl.b)}</b>${unit}`];
    if (cl.dl) lines.push(`Δ ${LB.fmtDelta(meta, cl.dl)} vs OpenROAD`);
    if (cl.kind === "undef") lines.push(`${esc(meta.label)} is undefined for the OpenROAD estimate here`);
    if (cl.mm && cl.mm.n) lines.push(`${cl.mm.wins} of ${cl.mm.n} held-out circuits beat the baseline`);
    return lines.join("<br>");
  }

  LB.renderMatrix = function (el, d, S, F, handlers) {
    const pdks = d.pdks.filter((p) => F.pdks.includes(p.id));
    const tasks = d.tasks.filter((t) => F.tasks.includes(t.id));
    // drop stage columns that no visible task defines (e.g. floorplan for interconnect length)
    const stages = d.stages.filter((s) => F.stages.includes(s.id) && tasks.some((t) => t.stages.includes(s.id)));
    if (!pdks.length || !stages.length || !tasks.length) {
      el.innerHTML = `<p class="lb-empty">Select at least one PDK, one stage and one task.</p>`;
      return { wins: 0, n: 0 };
    }

    const tips = [];
    let wins = 0, n = 0;   // MAE cells only, to match the paper's headline count
    const head1 = stages.map((s) =>
      `<th class="mx-stg mx-first" colspan="${pdks.length}" scope="colgroup">${esc(s.label.toLowerCase())}` +
      `${s.in_paper ? "" : '<span class="mx-np" title="Not reported in the paper">*</span>'}</th>`).join("");
    const head2 = stages.map(() => pdks.map((p, i) =>
      `<th class="mx-pdk${i === 0 ? " mx-first" : ""}" scope="col">${esc(p.label)}</th>`).join("")).join("");

    const ncols = 1 + stages.length * pdks.length;
    const body = tasks.map((t, ti) => {
      const alt = ti % 2 ? " mx-alt" : "";   // faint band on every other task group
      const group = `<tr class="mx-group${alt}"><th colspan="${ncols}" scope="rowgroup">` +
        `<span class="mx-gname">${esc(t.label)}<span class="mx-ent">${esc(t.entity)}</span></span></th></tr>`;
      const rows = t.metrics.map((metric) => {
        const cells = stages.map((s) => pdks.map((p, i) => {
          const cl = classify(d, S, t, metric, p, s);
          if (metric === "mae" && (cl.kind === "win" || cl.kind === "lose")) { n++; wins += cl.kind === "win"; }
          const html = cellHTML(d, S, t, cl, tips.length, i === 0, handlers.href(t.id, p.id, s.id, metric));
          if (cl.kind !== "na") tips.push(tipHTML(d, S, t, p, s, cl));
          return html;
        }).join("")).join("");
        return `<tr class="${alt.trim()}"><th class="mx-metric" scope="row">${HELP.metric(esc(d.metrics[metric].label), metric)}</th>${cells}</tr>`;
      }).join("");
      return group + rows;
    }).join("");

    el.innerHTML = `<div class="mx-scroll"><table class="mx">
      <thead>
        <tr><th class="mx-h mx-metric" rowspan="2" scope="col">Metric</th>${head1}</tr>
        <tr>${head2}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table></div>`;

    el.querySelectorAll("a[data-t]").forEach((btn) => {
      const show = (x, y) => handlers.tip.show(tips[+btn.dataset.t], x, y);
      btn.addEventListener("mousemove", (e) => show(e.clientX, e.clientY));
      btn.addEventListener("mouseleave", () => handlers.tip.hide());
      btn.addEventListener("focus", () => { const r = btn.getBoundingClientRect(); show(r.right, r.bottom); });
      btn.addEventListener("blur", () => handlers.tip.hide());
    });
    return { wins, n };
  };
})();
