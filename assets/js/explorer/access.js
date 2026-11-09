/* ===================================================================
   Model data access for the static site.

   tools/build_data.py writes data/model-details.js: for every released model
   condition, its executable configuration (edaml_config.yaml: features,
   layers, hyperparameters) and per-circuit LOCO results (eval.yaml).
   Loaded with a plain <script> tag, so model.html works from file:// too.
   =================================================================== */
window.EDA_MODEL = {
  runKey(task, exp, cond) { return `${task}/${exp}/${cond}`; },

  run(task, exp, cond) {
    const all = window.EDA_MODEL_DETAILS || {};
    return all[this.runKey(task, exp, cond)] || null;
  },

  /* Linear layers as the op graph expects them: shapes from the executable
     configuration. Released models ship configurations and evaluations, not
     weights, so there are no tensors to show (W is null). */
  layersFrom(layers) {
    return (layers || [])
      .filter((l) => String(l.type).toLowerCase() === "linear")
      .map((l, i) => ({ kind: "linear", fi: +l.in_features, fo: +l.out_features,
        W: null, B: null, shape: [+l.out_features, +l.in_features], label: "linear", idx: i }));
  },
};
