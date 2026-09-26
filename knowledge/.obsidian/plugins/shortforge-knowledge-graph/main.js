const { ItemView, Plugin } = require("obsidian");

const VIEW_TYPE = "shortforge-knowledge-graph";

const DEFAULTS = {
  arrows: true,
  nodeSize: 1,
  linkThickness: 1,
  textFade: 0.18,
  center: 0.045,
  repel: 1100,
  link: 0.035,
  distance: 135,
  animate: true,
  isolated: true,
  query: ""
};

const COLORS = {
  depends_on:"#9f7aea",
  feeds:"#a78bfa",
  produces:"#8b5cf6",
  verified_by:"#c084fc",
  supports:"#b794f4",
  conflicts_with:"#f87171",
  supersedes:"#fb923c",
  superseded_by:"#fb923c",
  related_to:"#94a3b8",
  links_to:"#94a3b8"
};

const clamp=(n,d,min,max)=>{
  n=Number(n);
  return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d;
};

const normRelation=(v)=>String(v||"related_to").trim().toLowerCase().replace(/\s+/g,"_").replace(/-/g,"_");
const labelFor=(v)=>String(v).replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());

function unwrap(value){
  const raw=String(value||"").trim();
  const m=raw.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
  return m?m[1].trim():raw;
}

class GraphStore {
  constructor(app){this.app=app;}
  async load(){
    const files=this.app.vault.getMarkdownFiles();
    const byPath=new Map(files.map(f=>[f.path,f]));
    const byBase=new Map();
    for(const f of files){
      const a=byBase.get(f.basename)||[];
      a.push(f.path);
      byBase.set(f.basename,a);
    }

    const nodes=[], byPathNode=new Map(), byKey=new Map();
    for(const f of files){
      const fm=this.app.metadataCache.getFileCache(f)?.frontmatter||{};
      const id=String(fm.sf_id||fm.id||f.path);
      const n={
        id,path:f.path,label:String(fm.title||f.basename),type:String(fm.type||"reference"),
        quality:String(fm.sf_quality_state||"VALID"),
        verified:String(fm.sf_verification_state||"")==="verified",
        tags:Array.isArray(fm.tags)?fm.tags.map(String):[],
        x:(Math.random()-.5)*100,y:(Math.random()-.5)*100,
        vx:0,vy:0,fixed:false,_visible:true
      };
      nodes.push(n);
      byPathNode.set(f.path,n);
      byKey.set(id,n); byKey.set(f.path,n); byKey.set(f.basename,n);
    }

    const edges=[], edgeKeys=new Set();
    const resolve=(value)=>{
      const key=unwrap(value);
      if(byKey.has(key)) return byKey.get(key);
      if(byPath.has(key)) return byPathNode.get(key);
      const m=byBase.get(key.replace(/\.md$/i,""))||[];
      return m.length===1?byPathNode.get(m[0]):null;
    };
    const add=(source,target,relation)=>{
      if(!source||!target||source.id===target.id)return;
      const rel=normRelation(relation);
      const id=source.id+"::"+target.id+"::"+rel;
      if(edgeKeys.has(id))return;
      edgeKeys.add(id);
      edges.push({id,source,target,relation:rel,visible:true});
    };

    const resolved=this.app.metadataCache.resolvedLinks||{};
    for(const [sourcePath,targets] of Object.entries(resolved)){
      const source=byPathNode.get(sourcePath);
      if(!source)continue;
      for(const targetPath of Object.keys(targets||{})) add(source,resolve(targetPath),"links_to");
    }

    for(const f of files){
      const source=byPathNode.get(f.path);
      if(!source)continue;
      const fm=this.app.metadataCache.getFileCache(f)?.frontmatter||{};
      const relationSets=[];
      if(Array.isArray(fm.sf_relations))relationSets.push(...fm.sf_relations);
      if(Array.isArray(fm.relations))relationSets.push(...fm.relations);
      for(const rel of relationSets){
        if(!rel||typeof rel!=="object")continue;
        add(source,resolve(rel.target||rel.to||rel.path),rel.relation||rel.type||"related_to");
      }
      for(const ref of (Array.isArray(fm.evidence_refs)?fm.evidence_refs:[]))
        add(source,resolve(ref),"verified_by");
      const superseded=fm.sf_superseded_by||fm.superseded_by;
      if(superseded)add(source,resolve(superseded),"superseded_by");
    }

    const relationTypes=[...new Set(edges.map(e=>e.relation))].sort();
    const connected=new Set();
    edges.forEach(e=>{connected.add(e.source.id);connected.add(e.target.id)});
    return {nodes,edges,relationTypes,connected};
  }
}

class GraphView extends ItemView {
  constructor(leaf,plugin){
    super(leaf); this.plugin=plugin; this.store=new GraphStore(this.app);
    this.s={...DEFAULTS,...plugin.settings}; this.graph={nodes:[],edges:[],relationTypes:[],connected:new Set()};
    this.pan={x:0,y:0}; this.zoom=1; this.alpha=1; this.running=false; this.last=0;
    this.selected=null; this.hovered=null; this.hoveredEdge=null; this.drag=null; this.relations=new Set();
  }

  getViewType(){return VIEW_TYPE}
  getDisplayText(){return "ShortForge Knowledge Graph"}

  async onOpen(){
    this.containerEl.innerHTML="";
    this.containerEl.classList.add("shortforge-knowledge-graph");
    this.buildShell();
    await this.refresh();
    this.bindInput();
    this.start();
  }

  async onClose(){this.running=false;this.resize?.disconnect();this.containerEl.innerHTML=""}

  buildShell(){
    const root=document.createElement("div");
    root.className="sfg-root"; this.root=root; this.containerEl.appendChild(root);

    const head=document.createElement("div");
    head.className="sfg-header";
    head.innerHTML='<div class="sfg-title">SHORTFORGE KNOWLEDGE GRAPH</div><div class="sfg-subtitle">Semantic relations across the knowledge vault</div>';
    root.appendChild(head);

    this.host=document.createElement("div"); this.host.className="sfg-graph-host"; root.appendChild(this.host);
    this.svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    this.svg.classList.add("sfg-svg"); this.host.appendChild(this.svg);

    const defs=document.createElementNS("http://www.w3.org/2000/svg","defs");
    const marker=document.createElementNS("http://www.w3.org/2000/svg","marker");
    marker.id="sfg-arrow"; marker.setAttribute("viewBox","0 0 10 10"); marker.setAttribute("refX","9"); marker.setAttribute("refY","5");
    marker.setAttribute("markerWidth","6"); marker.setAttribute("markerHeight","6"); marker.setAttribute("orient","auto");
    const p=document.createElementNS("http://www.w3.org/2000/svg","path"); p.setAttribute("d","M 0 0 L 10 5 L 0 10 z"); p.classList.add("sfg-arrow"); marker.appendChild(p); defs.appendChild(marker);
    this.svg.appendChild(defs);

    this.world=document.createElementNS("http://www.w3.org/2000/svg","g");
    this.edgesLayer=document.createElementNS("http://www.w3.org/2000/svg","g");
    this.labelsLayer=document.createElementNS("http://www.w3.org/2000/svg","g");
    this.nodesLayer=document.createElementNS("http://www.w3.org/2000/svg","g");
    this.edgesLayer.classList.add("sfg-edges"); this.labelsLayer.classList.add("sfg-labels"); this.nodesLayer.classList.add("sfg-nodes");
    this.world.append(this.edgesLayer,this.labelsLayer,this.nodesLayer); this.svg.appendChild(this.world);

    this.empty=document.createElement("div"); this.empty.className="sfg-empty"; this.empty.textContent="No linked ShortForge knowledge yet."; this.empty.style.display="none"; root.appendChild(this.empty);
    this.buildPanel(root);

    const footer=document.createElement("div");
    footer.className="sfg-footer"; footer.innerHTML='<span class="sfg-footer-status">RELATION FABRIC</span><span class="sfg-footer-hint">Drag nodes · wheel to zoom · drag background to pan · double-click a node to open</span>';
    root.appendChild(footer);

    this.resize=new ResizeObserver(()=>{this.sync();this.wake(.2)}); this.resize.observe(this.host);
  }

  section(parent,title,open=true){
    const d=document.createElement("details"); d.className="sfg-section"; d.open=open;
    const s=document.createElement("summary"); s.textContent=title; d.appendChild(s); parent.appendChild(d); return d;
  }

  toggle(parent,label,value,onChange){
    const row=document.createElement("div"); row.className="sfg-control-row";
    const text=document.createElement("span"); text.textContent=label;
    const b=document.createElement("button"); b.className="sfg-toggle"; b.classList.toggle("is-on",value);
    b.onclick=()=>{const v=!b.classList.contains("is-on");b.classList.toggle("is-on",v);onChange(v)};
    row.append(text,b);parent.appendChild(row);
  }

  slider(parent,label,min,max,step,value,onChange){
    const row=document.createElement("div");row.className="sfg-slider-row";
    const l=document.createElement("div");l.className="sfg-slider-label";
    const a=document.createElement("span");a.textContent=label;const b=document.createElement("span");
    const fmt=v=>step<1?Number(v).toFixed(2):Number(v).toFixed(0);b.textContent=fmt(value);l.append(a,b);
    const input=document.createElement("input");input.type="range";input.min=min;input.max=max;input.step=step;input.value=value;
    input.oninput=()=>{b.textContent=fmt(input.value);onChange(Number(input.value));this.plugin.saveSettings();this.wake(.12)};
    row.append(l,input);parent.appendChild(row);
  }

  action(parent,text,fn,active=false){
    const b=document.createElement("button");b.className="sfg-action";b.textContent=text;b.classList.toggle("is-active",active);b.onclick=fn;parent.appendChild(b);return b;
  }

  buildPanel(root){
    const panel=document.createElement("aside");panel.className="sfg-panel";root.appendChild(panel);
    const title=document.createElement("div");title.className="sfg-panel-title";title.textContent="Graph view";panel.appendChild(title);

    const search=document.createElement("input");search.className="sfg-search";search.placeholder="Filter relations / nodes…";search.value=this.s.query||"";
    search.oninput=()=>{this.s.query=search.value.toLowerCase().trim();this.applyFilter();this.plugin.saveSettings()};panel.appendChild(search);

    const display=this.section(panel,"Display",true);
    this.toggle(display,"Arrows",this.s.arrows,v=>{this.s.arrows=v;this.plugin.saveSettings();this.update()});
    this.slider(display,"Text fade threshold",0,.6,.01,this.s.textFade,v=>{this.s.textFade=v;this.update()});
    this.slider(display,"Node size",.55,2.1,.05,this.s.nodeSize,v=>{this.s.nodeSize=v;this.update()});
    this.slider(display,"Link thickness",.4,3,.1,this.s.linkThickness,v=>{this.s.linkThickness=v;this.update()});
    const actions=document.createElement("div");actions.className="sfg-actions";display.appendChild(actions);
    const anim=this.action(actions,"Animate",()=>{this.s.animate=!this.s.animate;anim.classList.toggle("is-active",this.s.animate);this.plugin.saveSettings();this.wake(.3)},this.s.animate);
    this.action(actions,"Fit",()=>this.fit());
    this.action(actions,"Refresh",()=>this.refresh());

    const forces=this.section(panel,"Forces",true);
    this.slider(forces,"Center force",0,.16,.005,this.s.center,v=>{this.s.center=v});
    this.slider(forces,"Repel force",250,2600,50,this.s.repel,v=>{this.s.repel=v});
    this.slider(forces,"Link force",.005,.09,.005,this.s.link,v=>{this.s.link=v});
    this.slider(forces,"Link distance",70,240,5,this.s.distance,v=>{this.s.distance=v});

    const rel=this.section(panel,"Relations",true);
    const relActions=document.createElement("div");relActions.className="sfg-relation-actions";rel.appendChild(relActions);
    this.action(relActions,"All",()=>{this.relations=new Set(this.graph.relationTypes);this.renderChips();this.applyFilter()});
    this.action(relActions,"Clear",()=>{this.relations.clear();this.renderChips();this.applyFilter()});
    this.chips=document.createElement("div");this.chips.className="sfg-relation-chips";rel.appendChild(this.chips);

    const scope=this.section(panel,"Scope",false);
    this.toggle(scope,"Show isolated",this.s.isolated,v=>{this.s.isolated=v;this.applyFilter();this.plugin.saveSettings()});

    this.inspector=document.createElement("div");this.inspector.className="sfg-inspector";panel.appendChild(this.inspector);
  }

  renderChips(){
    this.chips.innerHTML="";
    for(const r of this.graph.relationTypes){
      const b=document.createElement("button");b.className="sfg-relation-chip";b.textContent=labelFor(r);
      b.style.setProperty("--relation-color",COLORS[r]||COLORS.related_to);b.classList.toggle("is-on",this.relations.has(r));
      b.onclick=()=>{this.relations.has(r)?this.relations.delete(r):this.relations.add(r);this.renderChips();this.applyFilter()};this.chips.appendChild(b);
    }
  }

  async refresh(){
    this.graph=await this.store.load();
    this.relations=new Set(this.graph.relationTypes);
    this.graph.nodes.forEach((n,i)=>{const a=i*2.39996323,r=35+Math.sqrt(i+1)*42;n.x=Math.cos(a)*r;n.y=Math.sin(a)*r;n.vx=(Math.random()-.5)*.35;n.vy=(Math.random()-.5)*.35});
    this.renderChips();this.rebuild();this.applyFilter();this.fit();this.wake(.9);
  }

  rebuild(){
    this.edgesLayer.innerHTML="";this.labelsLayer.innerHTML="";this.nodesLayer.innerHTML="";
    for(const e of this.graph.edges){
      const line=document.createElementNS("http://www.w3.org/2000/svg","line");line.classList.add("sfg-edge");line.dataset.relation=e.relation;line.setAttribute("stroke",COLORS[e.relation]||COLORS.related_to);
      line.onmouseenter=()=>{this.hoveredEdge=e;this.update()};line.onmouseleave=()=>{this.hoveredEdge=null;this.update()};this.edgesLayer.appendChild(line);
      const text=document.createElementNS("http://www.w3.org/2000/svg","text");text.classList.add("sfg-edge-label");text.textContent=labelFor(e.relation);this.labelsLayer.appendChild(text);
      e.el=line;e.labelEl=text;
    }
    for(const n of this.graph.nodes){
      const g=document.createElementNS("http://www.w3.org/2000/svg","g");g.classList.add("sfg-node");
      const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.classList.add("sfg-node-circle");c.setAttribute("fill",this.color(n));g.appendChild(c);
      const text=document.createElementNS("http://www.w3.org/2000/svg","text");text.classList.add("sfg-node-label");text.textContent=n.label.length>34?n.label.slice(0,31)+"…":n.label;g.appendChild(text);
      g.onmouseenter=()=>{this.hovered=n;this.inspect();this.update()};g.onmouseleave=()=>{this.hovered=null;this.update()};
      g.onclick=(ev)=>{ev.stopPropagation();this.selected=n;this.inspect();this.update()};
      g.ondblclick=(ev)=>{ev.stopPropagation();this.open(n)};
      g.onpointerdown=(ev)=>{ev.stopPropagation();this.drag=n;n.fixed=true;try{g.setPointerCapture(ev.pointerId)}catch{};this.wake(.3)};
      n.el=g;n.circle=c;n.labelEl=text;this.nodesLayer.appendChild(g);
    }
  }

  color(n){
    if(n.quality==="CONTRADICTORY")return"#f87171";
    if(n.verified&&n.quality==="VALID")return"#a78bfa";
    if(n.type==="decision")return"#c084fc";
    if(n.type==="evidence")return"#8b5cf6";
    if(n.type==="incident")return"#fb923c";
    return"#94a3b8";
  }

  applyFilter(){
    const q=this.s.query||"";
    for(const n of this.graph.nodes){
      const hit=!q||[n.label,n.path,n.type,...n.tags].join(" ").toLowerCase().includes(q);
      n._visible=hit&&(this.s.isolated||this.graph.connected.has(n.id));
    }
    for(const e of this.graph.edges){
      const qHit=!q||e.relation.includes(q)||e.source.label.toLowerCase().includes(q)||e.target.label.toLowerCase().includes(q);
      e._visible=nBool(e.source._visible)&&nBool(e.target._visible)&&this.relations.has(e.relation)&&qHit;
    }
    this.update();this.wake(.25);
    const visible=this.graph.nodes.some(n=>n._visible);
    this.empty.style.display=visible?"none":"grid";
  }

  inspect(){
    const n=this.selected||this.hovered;
    if(!n){this.inspector.innerHTML='<div class="sfg-inspector-empty">Select a node to inspect its ShortForge relations.</div>';return}
    const relations=this.graph.edges.filter(e=>e.source.id===n.id||e.target.id===n.id).slice(0,8);
    this.inspector.innerHTML="";
    const t=document.createElement("div");t.className="sfg-inspector-title";t.textContent=n.label;this.inspector.appendChild(t);
    const m=document.createElement("div");m.className="sfg-inspector-meta";m.textContent=n.type+" · "+n.path;this.inspector.appendChild(m);
    const list=document.createElement("div");list.className="sfg-inspector-relations";
    for(const e of relations){
      const other=e.source.id===n.id?e.target:e.source;
      const b=document.createElement("button");b.className="sfg-inspector-relation";
      b.innerHTML='<span class="sfg-inspector-dot" style="background:'+(COLORS[e.relation]||COLORS.related_to)+'"></span><span>'+labelFor(e.relation)+'</span><span class="sfg-inspector-other">'+escapeHtml(other.label)+'</span>';
      b.onclick=()=>{this.selected=other;this.inspect();this.update()};list.appendChild(b);
    }
    this.inspector.appendChild(list);
    const open=document.createElement("button");open.className="sfg-open-note";open.textContent="Open knowledge note";open.onclick=()=>this.open(n);this.inspector.appendChild(open);
  }

  async open(n){
    const file=this.app.vault.getAbstractFileByPath(n.path);if(!file)return;
    const leaf=this.app.workspace.getLeaf("tab");await leaf.openFile(file);
  }

  bindInput(){
    this.svg.addEventListener("wheel",ev=>{
      ev.preventDefault();const r=this.svg.getBoundingClientRect(),sx=ev.clientX-r.left,sy=ev.clientY-r.top;
      const before=this.toWorld(sx,sy),factor=Math.exp(-ev.deltaY*.001);this.zoom=clamp(this.zoom*factor,1,.25,3.2);
      const after=this.toWorld(sx,sy);this.pan.x+=(after.x-before.x)*this.zoom;this.pan.y+=(after.y-before.y)*this.zoom;this.update();
    },{passive:false});

    this.svg.addEventListener("pointerdown",ev=>{
      if(ev.target!==this.svg)return;
      this.panPointer={x:ev.clientX,y:ev.clientY,px:this.pan.x,py:this.pan.y};try{this.svg.setPointerCapture(ev.pointerId)}catch{}
    });
    this.svg.addEventListener("pointermove",ev=>{
      if(this.drag){
        const r=this.svg.getBoundingClientRect(),p=this.toWorld(ev.clientX-r.left,ev.clientY-r.top);
        this.drag.x=p.x;this.drag.y=p.y;this.drag.vx=0;this.drag.vy=0;this.wake(.2);return;
      }
      if(this.panPointer){this.pan.x=this.panPointer.px+ev.clientX-this.panPointer.x;this.pan.y=this.panPointer.py+ev.clientY-this.panPointer.y;this.update()}
    });
    const release=ev=>{if(this.drag){this.drag.fixed=false;this.drag=null;this.wake(.18)}this.panPointer=null;try{this.svg.releasePointerCapture(ev.pointerId)}catch{}};
    this.svg.addEventListener("pointerup",release);this.svg.addEventListener("pointercancel",release);
    this.svg.addEventListener("dblclick",ev=>{if(ev.target===this.svg)this.fit()});
  }

  sync(){
    const r=this.host.getBoundingClientRect();this.svg.setAttribute("width",r.width);this.svg.setAttribute("height",r.height);
  }

  toWorld(x,y){
    return{x:(x-this.pan.x-this.host.clientWidth/2)/this.zoom,y:(y-this.pan.y-this.host.clientHeight/2)/this.zoom};
  }

  fit(){
    const ns=this.graph.nodes.filter(n=>n._visible);
    if(!ns.length)return;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const n of ns){minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y)}
    const sx=this.host.clientWidth*.72/Math.max(1,maxX-minX),sy=this.host.clientHeight*.78/Math.max(1,maxY-minY);
    this.zoom=Math.min(2.4,Math.max(.45,Math.min(sx,sy)));this.pan.x=-(minX+maxX)/2*this.zoom;this.pan.y=-(minY+maxY)/2*this.zoom;this.update();
  }

  wake(alpha=.35){this.alpha=Math.max(this.alpha,alpha);if(!this.running)this.start()}

  start(){if(this.running)return;this.running=true;requestAnimationFrame(t=>this.frame(t))}
  frame(t){
    if(!this.running)return;
    const dt=Math.min(.05,Math.max(.008,(t-this.last)/1000||.016));this.last=t;
    if(this.s.animate||this.alpha>.015){this.simulate(dt);this.update();if(!this.s.animate&&this.alpha<=.015){this.running=false;return}}else{this.running=false;return}
    requestAnimationFrame(x=>this.frame(x));
  }

  simulate(dt){
    const ns=this.graph.nodes.filter(n=>n._visible),es=this.graph.edges.filter(e=>e._visible);if(!ns.length)return;
    const cell=Math.max(80,this.s.distance),grid=new Map(),key=(x,y)=>Math.floor(x/cell)+":"+Math.floor(y/cell);
    for(const n of ns){const k=key(n.x,n.y),a=grid.get(k)||[];a.push(n);grid.set(k,a);n.fx=0;n.fy=0}
    for(const n of ns){
      const cx=Math.floor(n.x/cell),cy=Math.floor(n.y/cell);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const a=grid.get((cx+dx)+":"+(cy+dy))||[];
        for(const o of a){if(o===n)continue;const dxv=n.x-o.x,dyv=n.y-o.y,d2=Math.max(36,dxv*dxv+dyv*dyv),d=Math.sqrt(d2),f=this.s.repel/d2;n.fx+=dxv/d*f;n.fy+=dyv/d*f}
      }
      n.fx+=-n.x*this.s.center;n.fy+=-n.y*this.s.center;
    }
    for(const e of es){
      const a=e.source,b=e.target,dx=b.x-a.x,dy=b.y-a.y,d=Math.max(.001,Math.sqrt(dx*dx+dy*dy)),f=(d-this.s.distance)*this.s.link,fx=dx/d*f,fy=dy/d*f;
      a.fx+=fx;a.fy+=fy;b.fx-=fx;b.fy-=fy;
    }
    const temp=.9*Math.max(.05,this.alpha);
    for(const n of ns){
      if(n.fixed)continue;
      n.vx=(n.vx+n.fx*dt*temp)*.88;n.vy=(n.vy+n.fy*dt*temp)*.88;n.x+=n.vx*60*dt;n.y+=n.vy*60*dt;
    }
    this.alpha*=this.s.animate?.985:.84;
  }

  update(){
    if(!this.world)return;
    this.world.setAttribute("transform","translate("+(this.host.clientWidth/2+this.pan.x)+","+(this.host.clientHeight/2+this.pan.y)+") scale("+this.zoom+")");
    const focus=this.hovered||this.selected,has=!!(focus||this.hoveredEdge);
    for(const e of this.graph.edges){
      if(!e.el)continue;
      const vis=this.relations.has(e.relation)&&e._visible;
      e.el.style.display=vis?"":"none";e.labelEl.style.display=vis?"":"none";
      e.el.setAttribute("x1",e.source.x);e.el.setAttribute("y1",e.source.y);e.el.setAttribute("x2",e.target.x);e.el.setAttribute("y2",e.target.y);
      e.el.setAttribute("stroke-width",this.s.linkThickness*(e===this.hoveredEdge?2.2:1));e.el.style.opacity=has?(this.edgeFocus(e)?"1":".12"):".46";
      if(this.s.arrows)e.el.setAttribute("marker-end","url(#sfg-arrow)");else e.el.removeAttribute("marker-end");
      e.labelEl.setAttribute("x",(e.source.x+e.target.x)/2);e.labelEl.setAttribute("y",(e.source.y+e.target.y)/2);
      const lo=this.zoom>this.s.textFade+.12?.9:0;e.labelEl.style.opacity=has?(this.edgeFocus(e)?lo:0):lo*.7;
    }
    for(const n of this.graph.nodes){
      if(!n.el)continue;
      n.el.style.display=n._visible?"":"none";n.el.setAttribute("transform","translate("+n.x+","+n.y+")");n.circle.setAttribute("r",5.5+this.s.nodeSize*2.2);
      const selected=focus&&focus.id===n.id,connected=focus&&this.graph.edges.some(e=>(e.source.id===focus.id||e.target.id===focus.id)&&(e.source.id===n.id||e.target.id===n.id));
      n.el.style.opacity=has?(selected||connected?"1":".16"):".92";n.el.classList.toggle("is-selected",!!selected);n.el.classList.toggle("is-connected",!!connected);
      const lo=this.zoom>this.s.textFade?1:Math.max(0,(this.zoom-this.s.textFade+.08)/.2);n.labelEl.style.opacity=lo;n.labelEl.style.fontSize=(10/Math.max(.7,this.zoom))+"px";
    }
  }

  edgeFocus(e){const n=this.hovered||this.selected;return!!n&&(e.source.id===n.id||e.target.id===n.id||e===this.hoveredEdge)}
}

function nBool(v){return v===true}
function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}

class ShortForgeKnowledgeGraphPlugin extends Plugin{
  async onload(){
    this.settings={...DEFAULTS,...(await this.loadData()||{})};
    this.registerView(VIEW_TYPE,(leaf)=>new GraphView(leaf,this));
    this.addRibbonIcon("git-branch","ShortForge Knowledge Graph",()=>this.openGraph());
    this.addCommand({id:"open-knowledge-graph",name:"Open ShortForge Knowledge Graph",callback:()=>this.openGraph()});
    this.addCommand({id:"refresh-knowledge-graph",name:"Refresh ShortForge Knowledge Graph",callback:async()=>{
      for(const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)){if(leaf.view?.refresh)await leaf.view.refresh()}
    }});
  }
  async openGraph(){
    let leaf=this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if(!leaf)leaf=this.app.workspace.getLeaf("tab");
    await leaf.setViewState({type:VIEW_TYPE,active:true});
    await this.app.workspace.revealLeaf(leaf);
  }
  async saveSettings(){await this.saveData(this.settings)}
  async onunload(){this.app.workspace.detachLeavesOfType(VIEW_TYPE)}
}

module.exports={default:ShortForgeKnowledgeGraphPlugin};
