# EDA-learn leaderboard

### 🔗 Live leaderboard: **[drexel-ice.github.io/EDA-learn-leaderboard](https://drexel-ice.github.io/EDA-learn-leaderboard/)**

Released models, evaluation results and the public leaderboard for
**EDA-OpenML: An Open-Weight Framework for Data-Efficient Neural Prediction in
Digital IC Design Automation**. Framework code lives in
[drexel-ice/EDA-ML](https://github.com/drexel-ice/EDA-ML).

The leaderboard is a static site: no build step for the pages themselves, no backend.

## Layout

```
index.html                leaderboard: task × metric by source stage × PDK; each cell links to its ranking
ranking.html              every released model for one condition, ranked by any metric,
                          e.g. ranking.html?task=total_area&pdk=ng45&stage=detailed_place&metric=MAE
model.html                one model: problem formulation, results, features, hyperparameters,
                          network, and circuit-disjoint generalization,
                          e.g. model.html?task=total_area&exp=fixed_mlp-standard-v1.0.0&pdk=ng45&stage=detailed_place
assets/                   css, js (core/, components/, views/, explorer/), images
data/leaderboard.js       generated from model-data/ (overall metrics per condition) — do not hand-edit
data/leaderboard.json     same data as JSON, for programmatic use
data/model-details.js     generated from model-data/ (configs + per-circuit results) for model.html
model-data/               released artifacts: <task>_prediction/<experiment>-<descriptor>-<version>/<pdk>-<stage>/
tools/                    build and maintenance scripts
```

Each condition in `model-data/` holds `edaml_config.yaml` (the executable configuration:
problem formulation, features, layers, hyperparameters, data budget, LOCO circuits),
`eval.yaml` / `eval.log` (per-circuit and fold/sample-averaged metrics) and `flow.log`.
`baseline/` holds the OpenROAD reference results.
`model-data/.experiment_version_registry.json` lists every experiment with its version and a
one-line `description`, which the site shows on model pages and as ranking tooltips.

## Updating the data

After `model-data/` changes, regenerate and commit the payloads:

```bash
pip install pyyaml
python3 tools/build_data.py
```

It reads `eval.yaml`, `flow.log` and `edaml_config.yaml` files and takes a few seconds.

`tools/write_edaml_configs.py` is how the `edaml_config.yaml` files were produced. It needs the
full training run tree (each fold's `hparams.yaml` and checkpoints), which is not part of this
release, and verifies every Linear shape against the trained checkpoint.

## Previewing locally

Open `index.html` directly in a browser: everything is loaded with plain `<script>` tags,
so it works from disk as well as from a server (`python3 -m http.server 8000`).
Every view is deep-linkable through its query string.
