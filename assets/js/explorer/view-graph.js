/* ===================================================================
   Op graph — TensorBoard's representation: nodes for ops, tensor
   shapes annotated on the edges. Click a block to zoom the viewBox
   onto that op and paint its tensor (W, input, or activations) with
   the same signed-weight colors as the 3D view.
   =================================================================== */

/* GAP is the vertical rhythm between blocks; MAX_H / MAX_VH cap how tall the
   graph box may grow, so a 9-op net is read in one look instead of by
   scrolling. The SVG meets its viewBox, so the cap scales the drawing down
   rather than cropping it. */
const GRAPH={NW:196, NH:36, GAP:24, PADY:12, W:600, OPEN_PAD:14,
  MIN_H:320, MAX_H:640, MAX_VH:0.58};

const graphMaxH=()=>Math.min(GRAPH.MAX_H, Math.round(innerHeight*GRAPH.MAX_VH));
let graphOpen=null, graphHit=null, graphTween=null, graphG=null;

/* Click-to-expand is a setting: config.json op_graph_tensor_zoom. Off, the
   graph stays a static read of the topology. Defaults on when unconfigured. */
const graphZoomOn=()=>!(window.EDA_CFG&&EDA_CFG.op_graph_tensor_zoom===false);

function opGraphPush(nodes, edges, prev, prevShape, id, label, kind, shape, detail, mat){
  nodes.push({id,label,kind,shape,detail,mat:mat||null});
  if(prev)edges.push({from:prev,to:id,shape:prevShape});
  return {prev:id, prevShape:shape};
}

function opLinearName(k, ker){
  if(k==="gatconv")return "GATConv";
  if(k==="conv")return `Conv2d ${ker}\u00d7${ker}`;
  return "Linear";
}

function opLinearDetail(w){
  if(!w)return "";
  return `W ${w.shape.join("\u00d7")} \u00b7 b [${w.fo}] \u00b7 ${(w.fo*w.fi+w.fo).toLocaleString("en-US")} params`;
}

function opAddInput(nodes, edges, spec, M){
  const inN=(M&&M[0]&&spec.inputKind!=="image")?M[0].fi:spec.input;
  const shape=spec.inputKind==="image"?`[N, ${spec.input}, H, W]`:`[N, ${inN}]`;
  const detail=spec.inputKind==="scalar"?`${inN} schema attributes`:spec.inputKind;
  return opGraphPush(nodes,edges,null,null,"in","input","io",shape,detail,{type:"x", ai:0});
}

function opAddWeighted(nodes, edges, prev, prevShape, l, w, wi){
  const shape=w?`[N, ${w.fo}]`:`[N, ${l.fo}]`;
  return opGraphPush(nodes,edges,prev,prevShape,"op"+nodes.length,opLinearName(l.k,l.ker),
    "weighted",shape,opLinearDetail(w),{type:"W", wi:wi, ai:wi+1});
}

function opAddAct(nodes, edges, prev, prevShape, name, wi){
  return opGraphPush(nodes,edges,prev,prevShape,"op"+nodes.length,name,"act",prevShape,
    "elementwise",{type:"act", ai:wi});
}

function opAddDrop(nodes, edges, prev, prevShape, name, wi){
  return opGraphPush(nodes,edges,prev,prevShape,"op"+nodes.length,name,"reg",prevShape,
    "training only",{type:"act", ai:wi});
}

function opAddReduce(nodes, edges, prev, prevShape, name, k, wi){
  return opGraphPush(nodes,edges,prev,prevShape,"op"+nodes.length,name,"reduce",
    k==="pool"?"[N, C]":prevShape,"reduction",{type:"act", ai:wi});
}

function opAddTrees(nodes, edges, prev, prevShape, name){
  return opGraphPush(nodes,edges,prev,prevShape,"op"+nodes.length,name,"weighted","[N, 1]",
    "no differentiable weights",null);
}

function opAddEnsemble(nodes, edges, prev, prevShape, name){
  return opGraphPush(nodes,edges,prev,prevShape,"op"+nodes.length,name,"reduce","[N, 1]",
    "mean over trees",null);
}

function opAddOutput(nodes, edges, prev, prevShape, taskLabel, M){
  return opGraphPush(nodes,edges,prev,prevShape,"out",taskLabel,"io","[N, 1]","z-scored target",
    {type:"y", ai:M?M.length:0});
}

function opAddLayer(nodes, edges, prev, prevShape, l, M, wi){
  if(l.k==="linear"||l.k==="gatconv"||l.k==="conv")
    return{link:opAddWeighted(nodes,edges,prev,prevShape,l,M&&M[wi],wi), wi:wi+1};
  if(l.k==="act")
    return{link:opAddAct(nodes,edges,prev,prevShape,l.name,wi), wi};
  if(l.k==="drop")
    return{link:opAddDrop(nodes,edges,prev,prevShape,l.name,wi), wi};
  if(l.k==="pool"||l.k==="fuse")
    return{link:opAddReduce(nodes,edges,prev,prevShape,l.name,l.k,wi), wi};
  if(l.k==="trees")
    return{link:opAddTrees(nodes,edges,prev,prevShape,l.name), wi};
  if(l.k==="ens")
    return{link:opAddEnsemble(nodes,edges,prev,prevShape,l.name), wi};
  return{link:null, wi};
}

function opGraph(M,fam,taskLabel){
  const spec=activeArchSpec(fam);
  const nodes=[], edges=[];
  let wi=0, prev=null, prevShape=null;
  const start=opAddInput(nodes,edges,spec,M);
  prev=start.prev; prevShape=start.prevShape;
  for(let i=0;i<spec.layers.length;i++){
    const step=opAddLayer(nodes,edges,prev,prevShape,spec.layers[i],M,wi);
    if(!step.link)continue;
    prev=step.link.prev; prevShape=step.link.prevShape; wi=step.wi;
  }
  opAddOutput(nodes,edges,prev,prevShape,taskLabel,M);
  return{nodes,edges};
}

const OPCOL={
  io:      ["var(--lb-layer-in-bg)",   "var(--lb-layer-in-br)"],
  weighted:["var(--lb-layer-op-bg)",   "var(--lb-layer-op-br)"],
  act:     ["var(--lb-layer-in-bg)",   "var(--lb-layer-in-br)"],
  reg:     ["var(--lb-layer-in-bg)",   "var(--lb-layer-in-br)"],
  reduce:  ["var(--lb-layer-pool-bg)", "var(--lb-layer-pool-br)"]
};

function tensorGrid(n){
  if(!n||!n.mat)return null;
  if(n.mat.type==="W"){
    const l=M&&M[n.mat.wi];
    if(!l||!l.W)return null;
    return{vals:l.W, cols:l.fi, rows:l.fo, kind:"W", layer:l, wi:n.mat.wi};
  }
  const v=ACTS&&ACTS[n.mat.ai];
  if(!v)return null;
  return{vals:v, cols:v.length, rows:1, kind:n.mat.type, ai:n.mat.ai};
}

function graphOpenSize(grid){
  const cell=grid.rows>48?5:grid.cols>48?7:9;
  return{
    w:Math.max(GRAPH.NW, Math.min(520, grid.cols*cell+GRAPH.OPEN_PAD*2)),
    h:Math.max(132, Math.min(380, grid.rows*cell+42+GRAPH.OPEN_PAD*2)),
    cell
  };
}

function graphNodeH(n, i){
  if(graphOpen!==i)return GRAPH.NH;
  const g=tensorGrid(n);
  if(!g)return GRAPH.NH+56;
  return graphOpenSize(g).h;
}

function graphNodeW(n, i){
  if(graphOpen!==i)return GRAPH.NW;
  const g=tensorGrid(n);
  if(!g)return GRAPH.NW+40;
  return graphOpenSize(g).w;
}

function graphNodeY(nodes, i){
  let y=GRAPH.PADY;
  for(let k=0;k<i;k++)y+=graphNodeH(nodes[k],k)+GRAPH.GAP;
  return y;
}

function graphTotalH(nodes){
  if(!nodes.length)return GRAPH.PADY*2;
  const last=nodes.length-1;
  return graphNodeY(nodes, last)+graphNodeH(nodes[last], last)+GRAPH.PADY;
}

function graphCx(){return GRAPH.W/2;}

function graphFullBox(nodes){
  const h=graphTotalH(nodes);
  return{x:28, y:0, w:GRAPH.W-48, h:h};
}

function graphFocusBox(nodes, i){
  const n=nodes[i];
  const w=graphNodeW(n,i), h=graphNodeH(n,i);
  const x=graphCx()-w/2, y=graphNodeY(nodes,i), pad=18;
  return{x:x-pad, y:y-pad, w:w+pad*2, h:h+pad*2};
}

function graphMarkerDef(){
  return `<defs><marker id="gar" markerWidth="9" markerHeight="9" refX="6" refY="3"
    orient="auto"><path d="M0,0 L6,3 L0,6" fill="var(--global-text-color-light)"/></marker></defs>`;
}

function graphEdgeLine(cx, y0, y1){
  return `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y1-7}"
    stroke="var(--global-text-color-light)" stroke-width="1.3"
    marker-end="url(#gar)" opacity=".6"/>`;
}

function graphEdgeShape(cx, y0, gap, shape){
  return `<text x="${cx+14}" y="${(y0+gap/2+4).toFixed(0)}" font-size="12.5"
    font-family="var(--global-font-mono)" fill="var(--global-text-color-light)">${shape||""}</text>`;
}

function graphNodeFill(kind, on){
  const[bg,br]=OPCOL[kind]||OPCOL.act;
  return{bg, br:on?"var(--global-theme-color)":br, sw:on?2.4:1.4};
}

function graphNodeRect(x, y, w, h, kind, on){
  const sty=graphNodeFill(kind,on);
  const rx=kind==="io"?20:6;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"
    fill="${sty.bg}" stroke="${sty.br}" stroke-width="${sty.sw}"/>`;
}

function graphNodeLabel(cx, y, h, label, open){
  const yy=open?y+18:y+h/2+1;
  return `<text x="${cx}" y="${yy}" text-anchor="middle" dominant-baseline="middle"
    font-size="${open?13:14}" fill="var(--global-text-color)">${label}</text>`;
}

function graphNodeDetail(x, y, h, detail){
  if(!detail)return "";
  return `<text x="${x-16}" y="${y+h/2+1}" text-anchor="end" dominant-baseline="middle"
    font-size="11.5" fill="var(--global-text-color-light)">${detail}</text>`;
}

function graphGroupStripe(x, y, w, h, fill){
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
}

function graphGroupStripes(x, y, innerW, fi){
  if(typeof FEATS==="undefined"||fi!==41)return "";
  let col=0, s="";
  const cw=innerW/fi;
  for(let gi=0;gi<FEATS.length;gi++){
    const g=FEATS[gi][0], ns=FEATS[gi][1];
    const fill=cssColor(GCOL[g])||"var(--global-text-color-light)";
    s+=graphGroupStripe(x+col*cw, y, ns.length*cw, 5, fill);
    col+=ns.length;
  }
  return s;
}

function graphEmptyNote(x, y, w, h, msg){
  return `<text x="${x+w/2}" y="${y+h/2}" text-anchor="middle" font-size="12"
    fill="var(--global-text-color-light)">${msg}</text>`;
}

function graphHeatImage(n, x, y, w, h){
  const g=tensorGrid(n);
  if(!g)return graphEmptyNote(x,y,w,h,"no tensor on this op");
  const url=signedMapDataUrl(g.vals, g.cols, g.rows);
  const pad=GRAPH.OPEN_PAD;
  const iy=y+28, ih=h-40, ix=x+pad, iw=w-pad*2;
  graphHit={x:ix, y:iy, w:iw, h:ih, cols:g.cols, rows:g.rows, kind:g.kind,
    vals:g.vals, wi:g.wi, n};
  let s=`<image href="${url}" x="${ix}" y="${iy}" width="${iw}" height="${ih}"
    preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
  if(g.kind==="W"&&g.cols===41)s+=graphGroupStripes(ix, iy-7, iw, g.cols);
  return s;
}

function graphNodeGroup(n, i, x, y, w, h, sel){
  const open=graphOpen===i;
  const wiAttr=n.kind==="weighted"&&n.mat&&n.mat.type==="W"?` data-wi="${n.mat.wi}"`:"";
  let s=`<g class="gn" data-gn="${i}" data-kind="${n.kind}"${wiAttr}>`;
  s+=graphNodeRect(x,y,w,h,n.kind,sel===i||open);
  s+=graphNodeLabel(x+w/2,y,h,n.label,open);
  if(!open)s+=graphNodeDetail(x,y,h,n.detail);
  if(open)s+=graphHeatImage(n,x,y,w,h);
  s+=`</g>`;
  return s;
}

function graphMarkup(G, sel){
  const cx=graphCx();
  let s=graphMarkerDef();
  graphHit=null;
  for(let i=0;i<G.nodes.length;i++){
    const n=G.nodes[i];
    const h=graphNodeH(n,i), w=graphNodeW(n,i);
    const y=graphNodeY(G.nodes,i), x=cx-w/2;
    if(i>0){
      const yPrev=graphNodeY(G.nodes,i-1)+graphNodeH(G.nodes[i-1],i-1);
      s+=graphEdgeLine(cx, yPrev, y);
      s+=graphEdgeShape(cx, yPrev, y-yPrev, G.edges[i-1]?G.edges[i-1].shape:"");
    }
    s+=graphNodeGroup(n,i,x,y,w,h,sel);
  }
  return s;
}

function currentViewBox(svg){
  const v=svg.viewBox.baseVal;
  if(!v||!v.width)return null;
  return{x:v.x, y:v.y, w:v.width, h:v.height};
}

function setGraphViewBox(svg, box){
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
}

function easeOut(t){return 1-Math.pow(1-t,3);}

function mixBox(a, b, t){
  return{
    x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t),
    w:lerp(a.w,b.w,t), h:lerp(a.h,b.h,t)
  };
}

function stepGraphTween(now){
  if(!graphTween)return;
  const t=Math.min(1, (now-graphTween.t0)/graphTween.ms);
  setGraphViewBox(graphTween.svg, mixBox(graphTween.from, graphTween.to, easeOut(t)));
  if(t<1)requestAnimationFrame(stepGraphTween);
  else graphTween=null;
}

function startGraphTween(svg, from, to){
  graphTween={svg, from, to, t0:performance.now(), ms:280};
  requestAnimationFrame(stepGraphTween);
}

function graphWantBox(nodes){
  if(graphOpen==null)return graphFullBox(nodes);
  return graphFocusBox(nodes, graphOpen);
}

function fitGraphCard(svg, box){
  if(!svg)return;
  const host=svg.parentElement;
  if(!host)return;
  const w=host.clientWidth|0;
  if(w<8){
    if(!fitGraphCard._wait){
      fitGraphCard._wait=1;
      requestAnimationFrame(()=>{fitGraphCard._wait=0;fitGraphCard(svg, box);});
    }
    return;
  }
  const b=box||graphWantBox(graphG?graphG.nodes:[]);
  const want=Math.max(GRAPH.MIN_H, w*(b.h/Math.max(1,b.w)));
  const h=Math.round(Math.min(graphMaxH(), want));
  if(Math.abs((parseFloat(host.style.height)||0)-h)<1)return;
  host.style.height=h+"px";
}

function applyGraphCamera(svg, nodes){
  const want=graphWantBox(nodes);
  fitGraphCard(svg, want);
  const cur=currentViewBox(svg);
  if(!cur){setGraphViewBox(svg, want);return;}
  startGraphTween(svg, cur, want);
}

function graphCapClosed(){
  return "";   // how to read the graph lives in the "network" hover help
}

function graphCapOpen(n){
  const g=tensorGrid(n);
  if(!g)return n.label+" \u2014 no tensor. Click empty space to zoom out.";
  if(g.kind==="W"){
    const st=typeof layerStats==="function"?layerStats(g.layer):null;
    const lab=typeof layerLab==="function"?layerLab(g.layer):g.rows+"\u00d7"+g.cols;
    return n.label+"  W "+lab+(st?"  \u00b7  max |w| "+st.mx.toFixed(3):"")+"  \u00b7  blue +  orange \u2212  \u00b7  click empty to zoom out";
  }
  return n.label+"  "+g.cols+"-vector  \u00b7  live forward pass  \u00b7  click empty to zoom out";
}

function setGraphCap(G){
  const el=$("graphcap");
  if(!el)return;
  if(graphOpen==null||!G)el.textContent=graphCapClosed();
  else el.textContent=graphCapOpen(G.nodes[graphOpen]);
}

function drawGraph(svg, G, sel){
  graphG=G;
  if(!graphZoomOn())graphOpen=null;
  if(graphOpen!=null&&graphOpen>=G.nodes.length)graphOpen=null;
  svg.classList.toggle("nozoom", !graphZoomOn());
  svg.innerHTML=graphMarkup(G, sel);
  svg.style.width="100%";
  svg.style.height="100%";
  applyGraphCamera(svg, G.nodes);
  setGraphCap(G);
}

function graphNodeFromEvent(e){
  const svg=$("graph");
  if(!svg)return null;
  const el=e.target.closest("[data-gn]");
  if(!el||!svg.contains(el))return null;
  return +el.dataset.gn;
}

function svgPoint(svg, e){
  const ctm=svg.getScreenCTM();
  if(!ctm)return{x:0,y:0};
  const p=svg.createSVGPoint();
  p.x=e.clientX; p.y=e.clientY;
  return p.matrixTransform(ctm.inverse());
}

function graphCellAt(e){
  if(!graphHit)return null;
  const svg=$("graph");
  const p=svgPoint(svg, e);
  const c=Math.floor((p.x-graphHit.x)/graphHit.w*graphHit.cols);
  const r=Math.floor((p.y-graphHit.y)/graphHit.h*graphHit.rows);
  if(c<0||r<0||c>=graphHit.cols||r>=graphHit.rows)return null;
  return{c, r, v:graphHit.vals[r*graphHit.cols+c]};
}

function graphCellCap(cell){
  if(!cell||!graphHit)return;
  const el=$("graphcap");
  if(!el)return;
  if(graphHit.kind==="W"){
    const inName=graphHit.wi===0?origFeatName(cell.c):("in "+cell.c);
    el.textContent=`W[${cell.r}, ${cell.c}] = ${fmt(cell.v,4)}  \u00b7  row ${cell.r}  \u00b7  ${inName}`;
    return;
  }
  const name=graphHit.kind==="x"?origFeatName(cell.c):("unit "+cell.c);
  el.textContent=`${name} = ${fmt(cell.v,4)}`;
}

function onGraphOver(e){
  const i=graphNodeFromEvent(e);
  if(i==null)return;
  if(graphSel===i)return;
  graphSel=i;
  paintGraphSel($("graph"));
}

function onGraphOut(e){
  const svg=$("graph");
  if(e.relatedTarget&&svg.contains(e.relatedTarget))return;
  if(graphSel==null)return;
  graphSel=null;
  paintGraphSel(svg);
  if(graphOpen!=null)setGraphCap(graphG);
}

function onGraphMove(e){
  if(graphOpen==null)return;
  const cell=graphCellAt(e);
  if(cell)graphCellCap(cell);
  else setGraphCap(graphG);
}

function onGraphClick(e){
  if(!graphZoomOn())return;
  const i=graphNodeFromEvent(e);
  if(i==null){
    if(graphOpen==null)return;
    graphOpen=null;
  }else if(graphOpen===i){
    return;
  }else{
    graphOpen=i;
  }
  const svg=$("graph");
  const target=(window.EDA_SPEC&&EDA_SPEC.formulation&&EDA_SPEC.formulation.target)||CUR.task;
  drawGraph(svg, opGraph(M,FAM,taskLabel(target)), graphSel);
}

function bindGraphClicks(){
  const svg=$("graph");
  if(!svg||svg._bound)return;
  svg._bound=true;
  svg.addEventListener("pointerover", onGraphOver);
  svg.addEventListener("pointerout", onGraphOut);
  svg.addEventListener("pointermove", onGraphMove);
  svg.addEventListener("click", onGraphClick);
}
