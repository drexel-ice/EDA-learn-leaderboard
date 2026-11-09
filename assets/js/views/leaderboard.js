// Leaderboard page: filters -> overview matrix. Each cell links to ranking.html.
(function () {
  const LB = window.LB;
  const esc = LB.esc;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    // "all", "none", "paper" (stages only) or a comma list of ids
    pdks: "all",
    stages: "paper",
    tasks: "all",
    agg: "fold",      // fold | sample
  };

  let D, S;

  // ---- filter lists <-> URL strings ----
  function resolveList(v, all, paper) {
    if (v === "all") return all.slice();
    if (v === "none") return [];
    if (v === "paper" && paper) return paper.slice();
    const set = new Set(v.split(","));
    return all.filter((x) => set.has(x));
  }
  function encodeList(list, all, paper) {
    if (!list.length) return "none";
    if (list.length === all.length) return "all";
    if (paper && list.length === paper.length && list.every((x, i) => x === paper[i])) return "paper";
    return list.join(",");
  }
  const ALL = () => ({
    pdks: D.pdks.map((p) => p.id),
    stages: D.stages.map((s) => s.id),
    paperStages: D.stages.filter((s) => s.in_paper).map((s) => s.id),
    tasks: D.tasks.map((t) => t.id),
  });
  function filters() {
    const a = ALL();
    return {
      pdks: resolveList(S.pdks, a.pdks),
      stages: resolveList(S.stages, a.stages, a.paperStages),
      tasks: resolveList(S.tasks, a.tasks),
    };
  }

  function validate(s) {
    if (!["fold", "sample"].includes(s.agg)) s.agg = DEFAULTS.agg;
    return s;
  }

  function update(patch) {
    S = validate(Object.assign({}, S, patch));
    LB.writeParams(S, DEFAULTS);
    render();
  }

  // ---- tooltip ----
  const tip = {
    el: null,
    show(html, x, y) {
      if (!html) return;
      const t = this.el;
      t.innerHTML = html;
      t.hidden = false;
      const w = t.offsetWidth, h = t.offsetHeight;
      t.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - w - 8))}px`;
      t.style.top = `${y + 16 + h > innerHeight ? Math.max(8, y - h - 12) : y + 16}px`;
    },
    hide() { this.el.hidden = true; },
  };

  // Ranking page link for a cell; carries the averaging choice.
  function href(task, pdk, stage, metric) {
    const extra = {};
    if (S.agg !== "fold") extra.agg = S.agg;
    return "#";   // ranking page not built yet
  }

  function chipRow(key, items, selected) {
    return items.map((it) =>
      `<button class="chip" data-key="${key}" data-id="${esc(it.id)}" aria-pressed="${selected.includes(it.id)}"` +
      `${it.title ? ` title="${esc(it.title)}"` : ""}>${esc(it.label)}</button>`).join("") +
      `<span class="chip-sep"></span><button class="chip-link" data-key="${key}" data-set="all">all</button>` +
      `<button class="chip-link" data-key="${key}" data-set="none">none</button>`;
  }

  function render() {
    const F = filters();
    $("f-pdks").innerHTML = chipRow("pdks", D.pdks, F.pdks);
    $("f-stages").innerHTML = chipRow("stages",
      D.stages.map((s) => ({ id: s.id, label: s.label.toLowerCase() + (s.in_paper ? "" : " *"),
        title: s.in_paper ? "" : "Not reported in the paper" })), F.stages);
    $("f-tasks").innerHTML = chipRow("tasks", D.tasks, F.tasks);
    document.querySelectorAll("[data-seg]").forEach((b) =>
      b.setAttribute("aria-pressed", String(S[b.dataset.seg] === b.dataset.val)));

    const res = LB.renderMatrix($("matrix"), D, S, F, { tip, href });
    const aggTxt = S.agg === "sample" ? "sample-averaged" : "fold-averaged";
    $("mx-summary").innerHTML = res.n
      ? `On ${aggTxt} MAE, the best released model beats OpenROAD in <strong>${res.wins} of ${res.n}</strong> shown conditions.`
      : "";
  }

  function wire() {
    document.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip[data-key], .chip-link");
      if (!chip) return;
      const key = chip.dataset.key, a = ALL();
      const all = a[key], paper = key === "stages" ? a.paperStages : null;
      let list;
      if (chip.dataset.set) list = chip.dataset.set === "all" ? all.slice() : [];
      else {
        const cur = new Set(filters()[key]);
        cur.has(chip.dataset.id) ? cur.delete(chip.dataset.id) : cur.add(chip.dataset.id);
        list = all.filter((x) => cur.has(x));
      }
      update({ [key]: encodeList(list, all, paper) });
    });
    document.querySelectorAll("[data-seg]").forEach((b) =>
      b.addEventListener("click", () => update({ [b.dataset.seg]: b.dataset.val })));
    addEventListener("popstate", () => { S = validate(LB.readParams(DEFAULTS)); render(); });
    addEventListener("scroll", () => tip.hide(), { passive: true });
  }

  function main() {
    tip.el = $("tip");
    try {
      D = LB.loadLeaderboard();
    } catch (err) {
      $("app").innerHTML = `<div class="lb-error"><strong>Could not load the leaderboard data.</strong><br>${esc(err.message)}</div>`;
      return;
    }
    S = validate(LB.readParams(DEFAULTS));
    wire();
    render();
  }

  if (document.readyState === "loading") addEventListener("DOMContentLoaded", main);
  else main();
})();
