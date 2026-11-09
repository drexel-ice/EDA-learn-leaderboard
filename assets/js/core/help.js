/* Hover help. Any element with data-help="key" shows a popover on hover,
   keyboard focus or tap: <span class="hl" data-help="averaging" tabindex="0">Averaging</span>,
   or HELP.label(html, key) / HELP.metric(html, k) in generated HTML.
   Texts follow the EDA-OpenML paper (section / table cited). */
(function () {
  const Mh = "M&#770;";                         // M-hat
  const f = (s) => `<span class="help-f">${s}</span>`;
  const T = {
    /* ---------------- concepts ---------------- */
    condition: ["Condition and baseline",
      "A <b>condition</b> fixes everything except the model: the prediction task, the PDK (NG45, SKY130, IHP130, ASAP7) " +
      "and the <b>source stage</b> whose data the model sees. The target is always the value after detailed routing. " +
      "Models are only compared within one condition (§3.1).<br><br>" +
      "The <b>baseline</b> is the estimate OpenROAD already gives at the source stage: half-perimeter wirelength (HPWL) " +
      "for interconnect length, and the source-stage value of the same quantity for every other task. A model is useful " +
      "only if it beats this estimate.<br><br>" +
      "The headline count uses fold-averaged MAE, the paper's primary metric, and the best released run per " +
      "condition. Counting only the full-data Fixed MLP gives the paper's Table 5 figure, 88 of 184."],
    stages: ["Source stage",
      "The physical-design stage whose information is available for the prediction: <b>floorplan</b>, <b>global place</b>, " +
      "<b>detailed place</b>, <b>CTS</b> or <b>global route</b>. Only attributes available at or before this stage are used " +
      "as inputs (§3.1).<br><br>Earlier stages mean earlier, cheaper predictions but less information. Total wirelength and " +
      "interconnect length are not defined at floorplan.<br><br>Stages marked <b>*</b> (global route) are released but not " +
      "part of the paper's analysis, which covers floorplan to CTS."],
    tasks: ["Prediction tasks",
      "The twelve numerical prediction problems defined by EDA-Schema-V2, grouped by <b>target entity</b> (Table 3):<br>" +
      "<b>Netlist</b> (one value per design): total area, total power, total wirelength, worst arrival time, worst slack, " +
      "total negative slack.<br><b>Interconnect</b> (per net): interconnect length.<br><b>Timing path</b>: path arrival time, " +
      "path slack.<br><b>Net arc</b>: net-arc delay.<br><b>Cell arc</b>: cell-arc delay, cell-arc slew.<br><br>" +
      "Each task reports the metrics that are well defined for its data."],
    averaging: ["Fold vs. sample averaging",
      "Every model is evaluated <b>leave-one-circuit-out</b> (LOCO): each of the 18 circuits is held out in turn, and " +
      "predicted by a model trained only on the other 17. Preprocessing statistics come from the training circuits " +
      "only (§3.3).<br><br><b>Fold-averaged</b> " + f("(1/K) Σ<sub>k</sub> MAE<sub>k</sub>") + " gives each held-out " +
      "circuit equal weight. It is the paper's primary metric.<br><br><b>Sample-averaged</b> " +
      f("Σ<sub>k</sub> n<sub>k</sub>·MAE<sub>k</sub> / Σ<sub>k</sub> n<sub>k</sub>") + " gives each prediction equal " +
      "weight, so circuits with more samples count more. Non-linear metrics such as R² are recomputed from the pooled " +
      "out-of-fold predictions."],
    cells: ["Reading a cell",
      "Each cell compares the best released run for that condition and metric with the OpenROAD estimate, " +
      "and shows the winning value.<br><br><b>Green</b>: the model is better. " +
      "<b>Red</b>: OpenROAD still leads.<br><b>◆ saturated</b>: OpenROAD is already exact (e.g. MAE 0), " +
      "so there is nothing to win.<br><b>n/d</b>: the metric is undefined for every run (e.g. MPE when nothing is " +
      "overestimated).<br><b>–</b>: no released runs.<br><br>Hover for both values and the circuit wins; " +
      "click for the full ranking."],
    view: ["Raw vs. baseline",
      "<b>Raw</b> shows each metric's value.<br><br><b>vs baseline</b> shows the improvement over the run's own " +
      "OpenROAD estimate (eq. 18): " + f("Δ = 100 · (1 − model / OpenROAD)") + " for error metrics, and " +
      f("model − OpenROAD") + " for R², TPR and TNR. Positive always means the model is better."],
    ranks: ["Ranks and bars",
      "Rows are ranked by the highlighted column; click any metric header to rank by it. The small number beside " +
      "each value is that run's rank in its own column. OpenROAD is pinned at the top and not ranked.<br><br>" +
      "The bar under the ranked column is green where the run beats OpenROAD and red where it does not.<br><br>" +
      "Each run is named by its release folder, " + f("&lt;experiment_name&gt;-&lt;descriptor&gt;-&lt;version&gt;") +
      " (§6.1). Click a name for its model page."],
    results: ["Results",
      "OpenROAD vs. this model on the same LOCO evaluation. <b>Fold-averaged</b> rows weigh each of the 18 held-out " +
      "circuits equally (primary); <b>sample-averaged</b> rows pool every out-of-fold prediction. Model values are " +
      "green where they beat OpenROAD and red where they do not.<br><br>The model predicts the <b>residual</b> over " +
      "the baseline, " + f("y = M<sub>target</sub> − M<sub>OpenROAD</sub>") + ", standardised with training-fold " +
      "statistics. The final prediction is " + f(`${Mh} = M<sub>OpenROAD</sub> + ŷ`) + ", scored in the target's " +
      "physical units (eq. 3–10)."],
    features: ["Features",
      "The ordered numerical attributes the model takes as input, grouped by EDA-Schema-V2 source entity (Table 3). " +
      "For example, netlist tasks use netlist, area, cell, power and timing metrics; interconnect length uses each " +
      "net's fanout, HPWL and bounding box.<br><br>Only attributes available at or before the source stage are used. " +
      "When the same quantity exists at the source stage (arrival time, slack, delay), its source-stage value is an " +
      "input and the routed value is the target."],
    network: ["Network",
      "The network from this model's executable configuration (edaml_config.yaml), read top to bottom; each " +
      "edge is labelled with the tensor shape passed on and each Linear block with its parameter count.<br><br>" +
      "The paper's reference <b>Fixed MLP</b> (§4.1) is " + f("d → 64 → 32 → 16 → 1") + " with ReLU after each " +
      "hidden layer, MSE loss and SGD (learning rate 0.01) for up to 25 epochs, stopping after 3 epochs without " +
      "improvement. It is a controlled reference, deliberately not tuned per task. All 18 LOCO folds share this " +
      "architecture."],
    generalization: ["Circuit-disjoint generalization",
      "How consistently the model beats OpenROAD on circuits it never saw (§4.2–4.3). For each held-out circuit k " +
      "(eq. 15–16):<br>" + f("δ<sub>k</sub> = 100 · (1 − model<sub>k</sub> / OpenROAD<sub>k</sub>)") + " for error " +
      "metrics, and " + f("δ<sub>k</sub> = model<sub>k</sub> − OpenROAD<sub>k</sub>") + " for R², TPR and TNR. Positive " +
      "means the model is better on that circuit.<br><br>The summary gives the spread of δ across circuits: mean, " +
      "sample standard deviation, median, linearly interpolated quartiles and range (as in Table 9). <b>Wins</b> " +
      "counts circuits with δ &gt; 0. The paper calls 10/18 a majority win and 18/18 full consistency.<br><br>A good " +
      "aggregate score with few wins means a handful of circuits carry the average."],

    /* ---------------- metrics (Table 2) ---------------- */
    "m-mae": ["MAE · mean absolute error",
      f(`MAE = (1/n) Σ |M<sub>i</sub> − ${Mh}<sub>i</sub>|`) + "<br><br>Average prediction error in the physical units of " +
      "the target. Lower is better. This is the paper's primary metric, fold-averaged across held-out circuits."],
    "m-mape": ["MAPE · mean absolute percentage error",
      f(`MAPE = (100/n) Σ |(M<sub>i</sub> − ${Mh}<sub>i</sub>) / M<sub>i</sub>|`) + "<br><br>Scale-free error, comparable " +
      "across designs. Lower is better. It is unstable when targets are close to zero: a tiny true value inflates " +
      "the ratio (e.g. arc delays), so read it with MAE."],
    "m-r2": ["R² · coefficient of determination",
      f(`R² = 1 − Σ (M<sub>i</sub> − ${Mh}<sub>i</sub>)² / Σ (M<sub>i</sub> − M&#772;)²`) + "<br><br>Fit relative to always " +
      "predicting the mean of the targets. 1 is perfect, 0 is no better than the mean, and negative is worse. Higher is " +
      "better.<br><br>Per circuit it can be strongly negative when one circuit's targets barely vary, which drags the " +
      "fold average down; the sample-averaged R² is recomputed on pooled predictions."],
    "m-mae_p95": ["MAE P95 · 95th-percentile absolute error",
      f(`Q<sub>95</sub> { |M<sub>i</sub> − ${Mh}<sub>i</sub>| }`) + "<br><br>Upper-tail error in physical units: about " +
      "95% of samples have an absolute error at or below this value. Lower is better."],
    "m-mape_p95": ["MAPE P95 · 95th-percentile percentage error",
      f(`Q<sub>95</sub> { 100 · |(M<sub>i</sub> − ${Mh}<sub>i</sub>) / M<sub>i</sub>| }`) + "<br><br>Upper-tail relative " +
      "error: about 95% of samples have a percentage error at or below this value. Lower is better."],
    "m-mae_top5": ["MAE top-5% · worst-case absolute error",
      "Mean absolute error over the 5% of samples with the largest absolute errors.<br><br>Describes how large errors " +
      "get in the worst cases, in physical units. Lower is better."],
    "m-mape_top5": ["MAPE top-5% · worst-case percentage error",
      "Mean absolute percentage error over the 5% of samples with the largest percentage errors.<br><br>Describes " +
      "extreme relative error where percentages are meaningful. Lower is better."],
    "m-mpe": ["MPE · mean positive error",
      f(`MPE = (1/n<sub>p</sub>) Σ<sub>${Mh} &gt; M</sub> (${Mh}<sub>i</sub> − M<sub>i</sub>)`) + "<br><br>Average size of " +
      "<b>overestimates</b>, over the samples that are overestimated. Lower is better. For slack, overestimating is " +
      "the risky direction: it makes a design look safer than it is. Undefined when nothing is overestimated."],
    "m-mne": ["MNE · mean negative error",
      f(`MNE = (1/n<sub>n</sub>) Σ<sub>${Mh} &lt; M</sub> (M<sub>i</sub> − ${Mh}<sub>i</sub>)`) + "<br><br>Average size of " +
      "<b>underestimates</b>, over the samples that are underestimated. Lower is better. For slack, underestimating is " +
      "pessimistic: it flags safe designs as failing. Undefined when nothing is underestimated."],
    "m-tpr": ["TPR · true positive rate",
      f("TPR = TP / (TP + FN)") + "<br><br>Fraction of <b>timing-violating</b> samples (negative slack) that are correctly " +
      "predicted to violate. Higher is better. Undefined when a circuit has no violations."],
    "m-tnr": ["TNR · true negative rate",
      f("TNR = TN / (TN + FP)") + "<br><br>Fraction of <b>non-violating</b> samples that are correctly predicted to meet " +
      "timing. Higher is better."],
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* Generated HTML: wrap a label so hovering it shows help.
     focusable=false for labels that already sit inside a button (sort headers). */
  window.HELP = {
    label(html, key, focusable) {
      if (!T[key]) return html;
      return `<span class="hl" data-help="${esc(key)}"${focusable === false ? "" : ' tabindex="0"'}>${html}</span>`;
    },
    metric(html, k, focusable) { return this.label(html, `m-${k}`, focusable); },
  };

  /* ---------------- popover ----------------
     hover (after a short delay) or keyboard focus opens it; moving into the
     popover keeps it open so long texts can be scrolled; tap toggles on touch. */
  const SHOW_MS = 220, HIDE_MS = 160;
  let pop = null, cur = null, showT = 0, hideT = 0;

  function place(el) {
    const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(r.left - 8, innerWidth - w - 8))}px`;
    const below = r.bottom + 6, above = r.top - h - 6;
    pop.style.top = `${below + h <= innerHeight - 8 || above < 8 ? Math.max(8, Math.min(below, innerHeight - h - 8)) : above}px`;
  }

  function show(el) {
    clearTimeout(hideT);
    if (cur === el && !pop.hidden) return;
    const [t, body] = T[el.dataset.help] || ["", ""];
    if (!t) return;
    if (cur) cur.classList.remove("hl-on");
    pop.innerHTML = `<p class="help-t">${t}</p><div class="help-b">${body}</div>`;
    pop.hidden = false;
    pop.scrollTop = 0;
    place(el);
    el.classList.add("hl-on");
    el.setAttribute("aria-describedby", "helppop");
    cur = el;
  }

  function hide() {
    clearTimeout(showT);
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (cur) { cur.classList.remove("hl-on"); cur.removeAttribute("aria-describedby"); }
    cur = null;
  }
  const hideSoon = () => { clearTimeout(hideT); hideT = setTimeout(hide, HIDE_MS); };

  function init() {
    pop = document.createElement("div");
    pop.id = "helppop";
    pop.setAttribute("role", "tooltip");
    pop.hidden = true;
    document.body.appendChild(pop);

    const target = (e) => e.target.closest && e.target.closest("[data-help]");
    document.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      if (e.target.closest("#helppop")) { clearTimeout(hideT); return; }
      const el = target(e);
      if (!el) return;
      clearTimeout(hideT); clearTimeout(showT);
      showT = setTimeout(() => show(el), cur ? 0 : SHOW_MS);
    });
    document.addEventListener("pointerout", (e) => {
      if (e.pointerType === "touch") return;
      const to = e.relatedTarget;
      if (to && (to.closest("#helppop") || (cur && cur.contains(to)))) return;
      if (target(e) || e.target.closest("#helppop")) { clearTimeout(showT); hideSoon(); }
    });
    // touch: tap a label to toggle its help (does not block taps on sort buttons)
    document.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch") return;
      const el = target(e);
      if (el) { cur === el ? hide() : show(el); }
      else if (!e.target.closest("#helppop")) hide();
    });
    document.addEventListener("focusin", (e) => { const el = target(e); if (el) show(el); });
    document.addEventListener("focusout", (e) => { if (target(e)) hideSoon(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
    addEventListener("resize", hide);
    addEventListener("scroll", (e) => { if (!(e.target && e.target.id === "helppop")) hide(); }, { passive: true, capture: true });
  }

  if (document.readyState === "loading") addEventListener("DOMContentLoaded", init);
  else init();
})();
