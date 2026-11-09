/* ---------- network card: op graph ----------
   Adapted from the Flask explorer (3D view, feature sliders and width editor
   dropped: the site shows released models, it does not edit them). */
let netMode = "graph";
let graphSel = null;

function liveShape() {
  if (!M || !M.length) return "";
  return [M[0].fi, ...M.map((l) => l.fo)].join(" → ");
}

function drawNet() {
  if (!M) {
    $("graph").innerHTML = "";
    $("graphcap").textContent = "Weights could not be loaded.";
    return;
  }
  drawGraph($("graph"), opGraph(M, FAM, taskLabel(CUR.task)), graphSel);
  bindGraphClicks();
}

function paintGraphNodeSel(g) {
  const i = +g.dataset.gn;
  const on = graphSel === i || graphOpen === i;
  const rect = g.querySelector("rect");
  if (!rect) return;
  const br = (OPCOL[g.dataset.kind] || OPCOL.act)[1];
  rect.setAttribute("stroke", on ? "var(--global-theme-color)" : br);
  rect.setAttribute("stroke-width", on ? "2.4" : "1.4");
}
function paintGraphSel(svg) {
  svg.querySelectorAll("[data-gn]").forEach(paintGraphNodeSel);
}

