/* 3D scenes: a walkable room for 感染戰 and a route map for 地鐵追捕. */
window.Stage3D=(()=>{
  "use strict";
  const T=window.THREE,A=window.AX;if(!T||!A)return null;
  let renderer;try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'})}catch(e){return null}
  const {ST,ADJ,LINES,VR,GN,cActive}=A;
  const RANGE=1.7,HOLD=3000,SPEED=3.3;

  const el=document.createElement('div');el.className='stage';
  const cv=renderer.domElement;el.appendChild(cv);
  const stick=document.createElement('div');stick.className='stick';stick.innerHTML='<div class="knob"></div>';el.appendChild(stick);
  const gbar=document.createElement('div');gbar.className='gbar';gbar.hidden=true;gbar.innerHTML='<span></span><button class="btn sm" data-a="gstop">停止</button>';el.appendChild(gbar);
  const tip=document.createElement('div');tip.className='stagetip';el.appendChild(tip);
  const mini=document.createElement('div');mini.className='mini';el.appendChild(mini);
  const ctx=document.createElement('div');ctx.className='ctx';ctx.hidden=true;el.appendChild(ctx);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  const scene=new T.Scene();scene.background=new T.Color(0x0b141a);scene.fog=new T.Fog(0x0b141a,22,60);
  const cam=new T.PerspectiveCamera(48,4/3,.1,90),ray=new T.Raycaster();
  scene.add(new T.HemisphereLight(0xa9c0cc,0x10181d,.7));
  const lamp=new T.PointLight(0xffc878,1.2,26);scene.add(lamp);
  const sun=new T.DirectionalLight(0xffffff,.4);sun.position.set(3,9,5);scene.add(sun);
  const flash=new T.PointLight(0xff4030,0,8);scene.add(flash);
  const still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  let root=null,dyn=null,kind='',sig='',picks=[],raf=0,onPick=null,cur=null; // cur = {S,me,ui}
  const speak={};let yaw=0,fit=10;                         // chase camera
  let figs={},me3={x:0,z:3.7,r:Math.PI,ok:false},camYaw=Math.PI,peers={},gest=null,lastSent='',lastSendT=0,pawns={};
  const joy={x:0,y:0,id:null},keys={};
  const api={el,onPos:null,onStop:null};

  const mats={};const mat=(c,o)=>{const k=c+JSON.stringify(o||0);return mats[k]||(mats[k]=new T.MeshStandardMaterial(Object.assign({color:c,roughness:.7,metalness:.05},o||{})))};
  const G={body:new T.CylinderGeometry(.26,.4,1.15,18),head:new T.SphereGeometry(.27,18,14),nose:new T.BoxGeometry(.1,.08,.14),arm:new T.BoxGeometry(.13,.56,.13),ring:new T.TorusGeometry(.56,.05,8,36),
    gun:new T.BoxGeometry(.09,.12,.3),cup:new T.CylinderGeometry(.08,.06,.16,10),box:new T.BoxGeometry(.16,.16,.16),dot:new T.SphereGeometry(.06,8,6),
    st:new T.CylinderGeometry(.17,.17,.1,20),hit:new T.CylinderGeometry(.42,.42,.5,10),cop:new T.ConeGeometry(.18,.5,16),thief:new T.OctahedronGeometry(.19),
    loot:new T.BoxGeometry(.17,.17,.17),mark:new T.TorusGeometry(.3,.035,8,28),sel:new T.TorusGeometry(.4,.05,8,32),reach:new T.TorusGeometry(.24,.03,8,24)};
  const ghost=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
  const tex={};
  function texOf(text,color,w){w=w||256;const k=text+color+w;let t=tex[k];if(!t){const c=document.createElement('canvas');c.width=w;c.height=64;const x=c.getContext('2d');
      x.font='700 34px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';x.textAlign='center';x.textBaseline='middle';x.lineWidth=7;x.strokeStyle='rgba(11,20,26,.92)';x.strokeText(text,w/2,34);x.fillStyle=color;x.fillText(text,w/2,34);t=tex[k]=new T.CanvasTexture(c)}return t}
  function label(text,color,h,opt){const o=opt||{},w=o.w||256;const s=new T.Sprite(new T.SpriteMaterial({map:texOf(text,color,w),transparent:true,depthTest:!!o.depth,sizeAttenuation:!!o.atten}));s.scale.set(h*w/64,h,1);s.renderOrder=5;return s}
  const TEAMC=[0xe2594c,0x5c9eea,0x68ba6f],FAC={threat:0xe2594c,safe:0x52b8a8,neutral:0xab93dc};
  const wpos=s=>new T.Vector3((s.x-203)/40,0,(s.y-188)/40);
  function clear(){if(root)scene.remove(root);root=new T.Group();dyn=new T.Group();root.add(dyn);scene.add(root);figs={};pawns={};picks=[];yaw=0;gest=null;peers={};me3.ok=false;synced=false;if(typeof mini!=='undefined'){mini.innerHTML='';ctx.innerHTML='';ctx._h=''}}

  /* ---------- role figures: shown once a player's identity is public ---------- */
  const SKIN=0xe8c9a0;
  function roleFigure(key,opt){
    const o=opt||{},gh=o.ghost?{transparent:true,opacity:.62}:null,M=(c,x)=>mat(c,Object.assign({},x||{},gh||{}));
    const g=new T.Group();
    const add=(geo,m,x,y,z,rx,ry,rz,sx,sy,sz)=>{const me=new T.Mesh(geo,m);me.position.set(x||0,y||0,z||0);me.rotation.set(rx||0,ry||0,rz||0);if(sx)me.scale.set(sx,sy||sx,sz||sx);g.add(me);return me};
    const cyl=(rt,rb,h,s)=>new T.CylinderGeometry(rt,rb,h,s||18),sph=r=>new T.SphereGeometry(r,16,12),box=(a,b,c)=>new T.BoxGeometry(a,b,c);
    const torso=(c,rt,rb,h)=>add(cyl(rt||.26,rb||.4,h||1.15),M(c),0,(h||1.15)/2,0);
    const head=c=>add(sph(.27),M(c==null?SKIN:c),0,1.42,0);
    const arms=c=>{add(box(.13,.56,.13),M(c),-.36,.8,0,0,0,.12);add(box(.13,.56,.13),M(c),.36,.8,0,0,0,-.12)};
    const eyes=()=>{add(sph(.035),M(0x1a1f24),-.1,1.46,.24);add(sph(.035),M(0x1a1f24),.1,1.46,.24)};
    const brimHat=(c,band)=>{add(cyl(.42,.42,.04,24),M(c),0,1.6,0);add(cyl(.22,.26,.24,20),M(c),0,1.72,0);if(band!=null)add(cyl(.265,.265,.06,20),M(band),0,1.65,0)};
    const cap=(c,badge)=>{add(cyl(.27,.28,.14,20),M(c),0,1.66,0);add(box(.34,.03,.2),M(c),0,1.6,.24);if(badge!=null)add(cyl(.06,.06,.03,10),M(badge,{emissive:0x6b5510}),0,1.67,.28,Math.PI/2)};
    const maskBand=c=>add(cyl(.275,.275,.1,20),M(c),0,1.46,0);
    if(key==='T'){torso(0x1b1e22);arms(0x1b1e22);head(0x23272c);add(cyl(.28,.28,.09,20),M(0xb3261e,{emissive:0x5a1510}),0,1.46,0);eyes();
      add(new T.TorusGeometry(.36,.05,8,24),M(0xb3261e),0,.72,0,Math.PI/2.4,0,.5);
      add(sph(.17),M(0x111315),.46,.42,.1);add(cyl(.02,.02,.16,6),M(0xd9c48a),.46,.63,.1);add(sph(.04),M(0xff8a2a,{emissive:0xff6a00}),.46,.73,.1)}
    else if(key==='C'||key==='AB'){torso(0x3f9d90);arms(0x3f9d90);head();eyes();cap(0x5b6770);add(new T.TorusGeometry(.27,.07,8,20),M(0xe8a33d),0,1.16,0,Math.PI/2);
      if(key==='AB'){add(new T.TorusGeometry(.36,.04,8,28),M(0x7dffb0,{emissive:0x2fd47a}),0,1.98,0,Math.PI/2);add(box(.2,.07,.03),M(0x7dffb0,{emissive:0x2fd47a}),0,.82,.36);add(box(.07,.2,.03),M(0x7dffb0,{emissive:0x2fd47a}),0,.82,.36)}}
    else if(key==='R'){torso(0xf2f2ee);arms(0xf2f2ee);head();add(box(.5,.03,.03),M(0x30363c),0,1.47,.2);add(cyl(.07,.07,.05,12),M(0x8fd8ff,{emissive:0x1d5c7a}),-.1,1.47,.25,Math.PI/2);add(cyl(.07,.07,.05,12),M(0x8fd8ff,{emissive:0x1d5c7a}),.1,1.47,.25,Math.PI/2);
      add(box(.06,.7,.02),M(0x9aa4a8),0,.7,.34);add(new T.ConeGeometry(.13,.22,14),M(0x6fe08a,{emissive:0x1f7a3a}),.46,.56,.12);add(cyl(.04,.04,.14,10),M(0xcfe9ef),.46,.73,.12)}
    else if(key==='J'){torso(0xb99a6b);arms(0xb99a6b);head();eyes();brimHat(0x6b4a2e,0xf2f2ee);add(box(.1,.07,.02),M(0xffffff),.2,1.66,.2);
      add(box(.26,.18,.14),M(0x23272c),0,.82,.38);add(cyl(.07,.07,.1,14),M(0x5c9eea,{emissive:0x1c3c6a}),0,.82,.48,Math.PI/2);add(new T.TorusGeometry(.3,.015,6,20),M(0x23272c),0,1.05,.12,Math.PI/2.6)}
    else if(key==='I'){torso(0x243a5a,.28,.46,1.15);arms(0x243a5a);head();eyes();brimHat(0x1b2636,0x0f1722);add(cyl(.34,.3,.12,18),M(0x2d4a72),0,1.2,0);
      add(new T.OctahedronGeometry(.09),M(0xf1cf63,{emissive:0x6b5510,metalness:.6,roughness:.3}),-.14,.9,.36,0,0,0,1,1,.35);add(box(.07,.1,.24),M(0x15181c),.46,.6,.16)}
    else if(key==='F'){add(new T.ConeGeometry(.5,1.3,20),M(0x5a2f8a),0,.65,0);add(sph(.22),M(0x15101c),0,1.36,.04);add(new T.ConeGeometry(.3,.62,18),M(0x6d3ba6),0,1.62,-.02);
      add(sph(.03),M(0xff5a3a,{emissive:0xff3a1a}),-.08,1.38,.23);add(sph(.03),M(0xff5a3a,{emissive:0xff3a1a}),.08,1.38,.23);
      add(new T.TorusGeometry(.33,.03,6,22),M(0xd9c48a),0,.72,0,Math.PI/2);add(cyl(.04,.04,.3,10),M(0xf2ecd8),.4,.72,.2);add(sph(.05),M(0xffb347,{emissive:0xff8a00}),.4,.92,.2)}
    else if(key==='thief'){for(let i=0;i<6;i++){const y=.1+i*.19,r0=.4-i*.024;add(cyl(r0-.024,r0,.19),M(i%2?0x1b1e22:0xf2f2ee),0,y,0)}arms(0x1b1e22);head();maskBand(0x15181c);add(sph(.035),M(0xffffff),-.1,1.46,.25);add(sph(.035),M(0xffffff),.1,1.46,.25);
      add(new T.SphereGeometry(.28,16,10,0,Math.PI*2,0,Math.PI/2),M(0x1b1e22),0,1.5,0);add(sph(.26),M(0x8a6a3a),0,.75,-.42);add(cyl(.06,.1,.12,10),M(0x8a6a3a),0,1.0,-.42)}
    else{const tc=o.color==null?0x2d5fae:o.color;torso(tc);arms(tc);head();eyes();cap(0x1b2c4a,0xf1cf63);add(cyl(.34,.34,.06,18),M(0x15181c),0,.5,0);
      if(key==='corrupt'){maskBand(0xb3261e);add(sph(.035),M(0xffffff),-.1,1.46,.25);add(sph(.035),M(0xffffff),.1,1.46,.25);add(box(.24,.03,.13),M(0x4fbf6a,{emissive:0x1a5a2a}),.46,.56,.14);add(box(.24,.03,.13),M(0x6fdc8a,{emissive:0x1a5a2a}),.46,.6,.16,0,.3)}
      else add(cyl(.03,.03,.42,8),M(0x15181c),.46,.6,.12,.5)}
    return g;
  }

  /* ---------- 感染戰: a building to walk around (2 halls + 6 rooms) ---------- */
  const M=A.MAP,spawnOf=A.spawnOf;
  // how each action looks: [arm raise, motion, prop]. 0-6 gestures, 7 sitting, 8-11 using the building
  const GL=[[.9,'side',''],[1.9,'still',''],[1.57,'still','gun'],[1.3,'still','box'],[.25,'bow',''],[1.4,'rps',''],[1.7,'pat',''],
    [0,'sit',''],[1.9,'pat',''],[1.3,'thrust','box'],[1.3,'clink','cup'],[2.3,'still','']];
  const FLOOR={round:0x16242d,lounge:0x1c2b35,library:0x2b251e,locker:0x222b31,tea:0x24302a,music:0x2c2532,store:0x26241f,clinic:0x25323a};
  const ACTN={book:'倒放書本',letter:'投信',tea:'倒茶',light:'關燈'};
  let env={dark:[],books:[],lockers:[]},eo={books:{},flags:{},dark:{},plates:{}},seated=false,prog=null,nearKey='',nearT=0,camD=4.6;
  const box=(w,h,d,m,x,y,z,ry)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);if(ry)o.rotation.y=ry;root.add(o);return o};
  function buildRoom(S){
    clear();const n=S.players.length,g=S.g;eo={books:{},flags:{},dark:{},plates:{}};env={dark:[],books:[],lockers:[]};seated=false;prog=null;nearKey='';
    for(const r of M.rooms){const w=r.x1-r.x0,d=r.z1-r.z0,f=new T.Mesh(new T.PlaneGeometry(w,d),mat(FLOOR[r.id]));f.rotation.x=-Math.PI/2;f.position.set((r.x0+r.x1)/2,0,(r.z0+r.z1)/2);root.add(f);
      if(!r.hall){const dk=new T.Mesh(new T.BoxGeometry(w-.24,2.7,d-.24),new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.66,side:T.DoubleSide,depthWrite:false}));
        dk.position.set((r.x0+r.x1)/2,1.36,(r.z0+r.z1)/2);dk.visible=false;dk.renderOrder=3;root.add(dk);eo.dark[r.id]=dk}}
    const wm=mat(0x1f3640);
    for(const w of M.walls){const gaps=M.doors.filter(d=>d.ax===w.ax&&d.c===w.c&&d.p>w.a&&d.p<w.b).sort((a,b)=>a.p-b.p);let at=w.a;const segs=[];
      for(const d of gaps){segs.push([at,d.p-d.w/2]);at=d.p+d.w/2}segs.push([at,w.b]);
      for(const [a,b] of segs){const len=b-a;if(len<.05)continue;if(w.ax==='x')box(len,2.6,.2,wm,(a+b)/2,1.3,w.c);else box(.2,2.6,len,wm,w.c,1.3,(a+b)/2)}}
    for(const d of M.doors){if(d.ax!=='x')continue;const r=M.rooms.find(r=>!r.hall&&d.p>r.x0&&d.p<r.x1&&(r.z0===d.c||r.z1===d.c));if(!r)continue;
      const s=label(r.n,'#f1cf63',.6,{atten:true,depth:true});s.position.set(d.p,3.0,d.c);root.add(s);
      const sw=M.switches[r.id],pz=d.c+(r.z1===d.c?-.13:.13);eo.plates[r.id]=box(.2,.28,.06,new T.MeshStandardMaterial({color:0xf1cf63,emissive:0xa87a10}),sw.x,1.3,pz)}
    // 圓桌廳
    const tb=M.table,top=new T.Mesh(new T.CylinderGeometry(tb.r,tb.r,.14,44),mat(0x5b3e2c));top.position.set(tb.x,.95,tb.z);root.add(top);
    const leg=new T.Mesh(new T.CylinderGeometry(.3,.55,.9,20),mat(0x3a281d));leg.position.set(tb.x,.45,tb.z);root.add(leg);
    const bulb=new T.Mesh(new T.SphereGeometry(.16,12,10),new T.MeshBasicMaterial({color:0xffd9a0}));bulb.position.set(tb.x,3.3,tb.z);root.add(bulb);
    lamp.position.set(tb.x,3.2,tb.z);lamp.intensity=1.2;
    const lamp2=new T.PointLight(0xffe2b0,1.0,24);lamp2.position.set(6,3.2,0);root.add(lamp2);
    // 交誼廳: benches
    M.benches.forEach(b=>{const gb=new T.Group();gb.position.set(b.x,0,b.z);gb.rotation.y=b.r;
      const seat=new T.Mesh(new T.BoxGeometry(4.0,.12,.55),mat(0x7a5a3a));seat.position.y=.46;const back=new T.Mesh(new T.BoxGeometry(4.0,.6,.1),mat(0x5e442b));back.position.set(0,.8,-.3);
      const l1=new T.Mesh(new T.BoxGeometry(.1,.46,.5),mat(0x2b2018));l1.position.set(-1.9,.23,0);const l2=l1.clone();l2.position.x=1.9;gb.add(seat,back,l1,l2);root.add(gb)});
    const rug=new T.Mesh(new T.CircleGeometry(2.4,32),mat(0x3a2a35));rug.rotation.x=-Math.PI/2;rug.position.set(6,.01,0);root.add(rug);
    // 圖書室: one book per seat number
    const sh=M.shelf;box(4.6,2.3,.4,mat(0x3d2c1e),sh.x,1.15,-11.72);box(4.6,.06,.36,mat(0x2a1e14),sh.x,1.22,-11.6);box(4.6,.06,.36,mat(0x2a1e14),sh.x,.47,-11.6);
    const HUE=[0x6b8fb5,0x7fb58a,0xb58a6b,0xa97fb5,0xb5a36b,0x6bb5ac,0xb56b7e,0x8a93b5];
    for(let i=1;i<=n;i++){const col=(i-1)%8,row=Math.floor((i-1)/8),x=sh.x-1.75+col*.5,y=1.52-row*.75;
      const bk=new T.Mesh(new T.BoxGeometry(.3,.52,.22),new T.MeshStandardMaterial({color:HUE[(i-1)%8],roughness:.8}));bk.position.set(x,y,-11.5);bk.userData.base=HUE[(i-1)%8];root.add(bk);eo.books[i]=bk;
      const nl=label(String(i),'#ffffff',.3,{atten:true,depth:true});nl.position.set(x,y+.02,-11.36);root.add(nl)}
    // 置物間: one locker per seat number
    const lk=M.lockers;
    for(let i=1;i<=n;i++){const col=(i-1)%8,row=Math.floor((i-1)/8),x=lk.x-1.75+col*.5,y=1.55-row*.95;
      box(.46,.86,.4,mat(i%2?0x4c6170:0x566d7d),x,y,-11.7);const nl=label(String(i),'#ffffff',.3,{atten:true,depth:true});nl.position.set(x,y+.15,-11.47);root.add(nl);
      const fl=box(.16,.2,.05,new T.MeshStandardMaterial({color:0xe2594c,emissive:0x8a1f14}),x+.12,y-.2,-11.47);fl.visible=false;eo.flags[i]=fl}
    // 茶水間, 音樂室, 醫務室, 儲藏室
    const tt=M.tea,tm=new T.Mesh(new T.CylinderGeometry(.7,.7,.1,28),mat(0xd9c9a8));tm.position.set(tt.x,.82,tt.z);root.add(tm);
    const tl=new T.Mesh(new T.CylinderGeometry(.12,.3,.8,14),mat(0x8a7a5a));tl.position.set(tt.x,.4,tt.z);root.add(tl);
    const pot=new T.Mesh(new T.SphereGeometry(.2,14,10),mat(0x7fd4e8));pot.position.set(tt.x,1.03,tt.z);root.add(pot);
    box(1.7,1.0,1.0,mat(0x15181c),10.6,.5,-10.6);box(1.5,.08,.3,mat(0xf2f2ee),10.6,1.02,-10.0);
    box(1.2,.5,2.0,mat(0xe9eef0),10.6,.25,10.4);box(1.2,.16,.5,mat(0x8fd8ff),10.6,.58,11.1);
    box(.9,.9,.9,mat(0x7a5a3a),-10.9,.45,10.9);box(.8,.8,.8,mat(0x6b4d30),-10.2,.4,10.3,.4);box(.7,.7,.7,mat(0x86633f),-10.8,1.25,10.8,.2);
    // people
    S.players.forEach((p,i)=>{
      const gg=new T.Group(),pivot=new T.Group(),m=new T.MeshStandardMaterial({color:0x8fa3ad,roughness:.7});
      const body=new T.Mesh(G.body,m),head=new T.Mesh(G.head,m),nose=new T.Mesh(G.nose,mat(0x22303a));
      body.position.y=.575;head.position.y=1.42;nose.position.set(0,1.44,.27);body.userData.id=head.userData.id=p.id;picks.push(body,head);
      const arm=new T.Group();arm.position.set(-.36,1.08,0);const am=new T.Mesh(G.arm,m);am.position.y=-.28;arm.add(am);
      const props={gun:new T.Mesh(G.gun,mat(0x111418)),cup:new T.Mesh(G.cup,mat(0x7fd4e8)),box:new T.Mesh(G.box,mat(0xf1cf63))};
      for(const k in props){props[k].position.y=-.6;props[k].visible=false;arm.add(props[k])}props.gun.rotation.x=Math.PI/2;
      const arm2=new T.Group();arm2.position.set(.36,1.08,0);const am2=new T.Mesh(G.arm,m);am2.position.y=-.28;arm2.add(am2);
      pivot.add(body,head,nose,arm,arm2);gg.add(pivot);
      const ring=new T.Mesh(G.ring,new T.MeshBasicMaterial({color:0xe8a33d}));ring.rotation.x=Math.PI/2;ring.position.y=.04;ring.visible=false;gg.add(ring);
      const name=label((g.seat&&g.seat[p.id]?g.seat[p.id]+'號 ':'')+p.name,'#ece4d0',.06,{depth:true,w:448});name.position.y=2.0;gg.add(name);
      const gl=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,sizeAttenuation:true}));gl.scale.set(2.2,.55,1);gl.position.set(0,2.75,0);gl.visible=false;gl.renderOrder=4;gg.add(gl);
      const sp=spawnOf(i,n);gg.position.set(sp.x,0,sp.z);gg.rotation.y=sp.r;root.add(gg);
      const bub=new T.Sprite(new T.SpriteMaterial({map:texOf('說話中','#8fe3ff'),transparent:true,depthTest:true,sizeAttenuation:true}));bub.scale.set(1.5,.375,1);bub.position.set(0,2.3,0);bub.visible=false;gg.add(bub);
      figs[p.id]={g:gg,pivot,m,arm,arm2,props,ring,gl,bub,name,dead:false,role:null,gi:-1,sp,art:null,artKey:'',shown:true};
      peers[p.id]={x:sp.x,z:sp.z,r:sp.r,gi:-1,gt:''};
    });
    mini.innerHTML=`<svg viewBox="-12.6 -12.6 25.2 25.2">${M.rooms.map(r=>`<rect data-r="${r.id}" x="${r.x0}" y="${r.z0}" width="${r.x1-r.x0}" height="${r.z1-r.z0}"/><text x="${(r.x0+r.x1)/2}" y="${(r.z0+r.z1)/2+.6}">${r.n.slice(0,2)}</text>`).join('')}<circle r=".9" cx="0" cy="0"/></svg>`;
  }
  function applyEnv(){
    for(const k in eo.books){const on=env.books.includes(+k),b=eo.books[k];b.rotation.z=on?Math.PI:0;b.material.color.setHex(on?0xe2594c:b.userData.base);b.material.emissive.setHex(on?0x7a1d14:0)}
    for(const k in eo.flags)eo.flags[k].visible=env.lockers.includes(+k);
    for(const r in eo.dark){const on=env.dark.includes(r);eo.dark[r].visible=on;const p=eo.plates[r];if(p)p.material.emissive.setHex(on?0x000000:0xa87a10)}
    nearKey='';
  }
  function syncRoom(S,me,ui,fresh){
    const g=S.g,over=S.phase==='over';
    if(pendInit){const p=pendInit;pendInit=null;setPeers(p,true);
      if(p[me]&&figs[me]){const a=p[me];me3={x:a[0],z:a[1],r:a[2],ok:true};camYaw=a[2];synced=true}}
    if(figs[me]&&!me3.ok){const sp=peers[me]||figs[me].sp;me3={x:sp.x,z:sp.z,r:sp.r,ok:true};camYaw=sp.r}
    for(const id in figs){const f=figs[id],alive=g.alive[id]!==false;
      if(!alive&&!f.dead){f.dead=true;if(!(fresh||still)){flash.position.set(f.g.position.x,1.6,f.g.position.z);flash.intensity=3}}
      const R=VR[g.roles[id]];
      const rk=R&&(!alive||over)?(g.roles[id]==='C'&&g.antibody===id?'AB':g.roles[id])+(over?'':'~'):'';
      if(rk!==f.artKey){if(f.art)f.g.remove(f.art);f.art=null;f.artKey=rk;
        if(rk){f.art=roleFigure(rk.replace('~',''),{ghost:!over});f.g.add(f.art);f.pop=(fresh||still)?1:0;f.pivot.visible=false;f.gl.visible=false}else f.pivot.visible=true}
      if(R&&(!alive||over)&&!f.role){f.role=label(R.n,'#f1cf63',.055,{depth:false});f.role.position.y=2.0;f.role.center.set(.5,-.6);f.g.add(f.role)}
      f.m.color.setHex(over&&R?FAC[R.c]:!alive?0x39454b:id===me?0xece4d0:0x8fa3ad);
      const tgt=id!==me&&(ui.t===id&&ui.pick||ui.ft===id);f.ring.visible=tgt||(id===me&&(alive||over));f.bub.visible=!!speak[id]&&!f.art;f.ring.material.color.setHex(tgt?0xe2594c:0xe8a33d);
    }
    const mine=figs[me]&&g.alive[me]!==false&&S.phase==='play';
    const walk=mine&&api.walk;stick.hidden=!walk;mini.hidden=over;ctx.hidden=!walk;if(!walk)tip.textContent='拖曳畫面轉視角';
    if(!mine){if(gest)stopGesture(true);seated=false;prog=null}
    applyEnv();
  }
  function setPeers(p,snap){for(const id in p){const a=p[id],f=figs[id];
      if(!a){peers[id]=Object.assign(peers[id]||{x:0,z:0,r:0},{gi:-1,gt:'',hidden:true});continue}
      const was=peers[id]&&peers[id].hidden;peers[id]={x:a[0],z:a[1],r:a[2],gi:a[3],gt:a[4]};
      if(f&&(snap||was)){f.g.position.set(a[0],0,a[1]);f.g.rotation.y=a[2]}}}
  function push(x,z){for(const o of M.obs){const dx=x-o.x,dz=z-o.z,dd=Math.hypot(dx,dz),min=o.r+.4;if(dd<min&&dd>.001){x=o.x+dx/dd*min;z=o.z+dz/dd*min}}return[x,z]}
  function moveTo(x,z,nx,nz){let p=push(nx,nz);if(A.walkable(p[0],p[1]))return p;p=push(nx,z);if(A.walkable(p[0],p[1]))return p;p=push(x,nz);if(A.walkable(p[0],p[1]))return p;return[x,z]}
  function stopGesture(silent){if(!gest)return;gest=null;gbar.hidden=true;if(!silent&&api.onStop)api.onStop()}
  function distTo(id){const p=peers[id];return p&&!p.hidden?Math.hypot(p.x-me3.x,p.z-me3.z):99}
  function nearObjs(){const o=[],d=q=>Math.hypot(me3.x-q.x,me3.z-q.z),room=A.roomOf(me3.x,me3.z);
    if(seated)return[{t:'seated'}];
    M.benches.forEach((b,i)=>{if(room==='lounge'&&d(b)<=2.6)o.push({t:'bench',b:i})});
    if(room==='library'&&d(M.shelf)<=2.0)o.push({t:'shelf'});
    if(room==='locker'&&d(M.lockers)<=2.0)o.push({t:'lockers'});
    if(room==='tea'&&d(M.tea)<=2.0)o.push({t:'tea'});
    const sw=M.switches[room];if(sw&&d(sw)<=1.9)o.push({t:'switch',room,dark:env.dark.includes(room)});
    return o}
  function stepRoom(dt,t){
    const S=cur.S,me=cur.me,g=S.g,play=S.phase==='play',mine=synced&&api.walk!==false&&figs[me]&&play&&g.alive[me]!==false,now=Date.now();
    if(mine){
      let jx=joy.x,jy=joy.y;if(keys.w||keys.arrowup)jy+=1;if(keys.s||keys.arrowdown)jy-=1;if(keys.a||keys.arrowleft)jx-=1;if(keys.d||keys.arrowright)jx+=1;
      const m=Math.hypot(jx,jy);
      if(m>.12){
        if(seated){seated=false;if(api.onEnv)api.onEnv({a:'stand'})}
        const k=Math.min(1,m)/m,fx=Math.sin(camYaw),fz=Math.cos(camYaw),dx=(fx*jy-fz*jx)*k,dz=(fz*jy+fx*jx)*k;
        const p=moveTo(me3.x,me3.z,me3.x+dx*SPEED*dt,me3.z+dz*SPEED*dt);me3.x=p[0];me3.z=p[1];me3.r=Math.atan2(dx,dz);
        if(gest){stopGesture();tip.textContent='你移動了，動作中斷'}
        if(prog){prog=null;gbar.hidden=true;tip.textContent='你移動了，動作中斷'}}
      if(gest){const p=peers[gest.t],d=distTo(gest.t);
        if(!p||g.alive[gest.t]===false||d>RANGE+.15){stopGesture();tip.textContent='距離太遠，動作中斷'}
        else{me3.r=Math.atan2(p.x-me3.x,p.z-me3.z);const el2=now-gest.t0;
          gbar.hidden=false;gbar.firstChild.textContent=`對 ${gest.name}「${GN[gest.gi]}」 ${Math.min(3,el2/1000).toFixed(1)} / 3 秒`;
          if(el2>HOLD+1500)stopGesture()}}
      else if(prog){const el2=now-prog.t0;gbar.hidden=false;gbar.firstChild.textContent=`${ACTN[prog.a]||''}中 ${Math.min(3,el2/1000).toFixed(1)} / 3 秒`;if(el2>prog.ms+2500){prog=null;gbar.hidden=true}}
      else if(!gbar.hidden)gbar.hidden=true;
      const sgi=gest?gest.gi:seated?7:prog?({book:8,letter:9,tea:10,light:11})[prog.a]:-1;
      peers[me]={x:me3.x,z:me3.z,r:me3.r,gi:sgi,gt:gest?gest.t:''};
      const key=[me3.x.toFixed(2),me3.z.toFixed(2),me3.r.toFixed(2),gest?gest.gi+gest.t+gest.k:''].join('|');
      if(api.onPos&&((key!==lastSent&&now-lastSendT>110)||now-lastSendT>1500)){lastSent=key;lastSendT=now;api.onPos({x:me3.x,z:me3.z,r:me3.r,gi:gest?gest.gi:-1,gt:gest?gest.t:'',gk:gest?gest.k:''})}
      if(now-nearT>200){nearT=now;const o=nearObjs(),k=JSON.stringify(o);if(k!==nearKey){nearKey=k;if(api.onNear)api.onNear(o)}
        const room=A.roomOf(me3.x,me3.z),rn=(M.rooms.find(r=>r.id===room)||{}).n||'';if(!gest&&!prog)tip.textContent=rn?'你在'+rn:'';
        const c=mini.querySelector('circle');if(c){c.setAttribute('cx',me3.x.toFixed(1));c.setAttribute('cy',me3.z.toFixed(1));mini.querySelectorAll('rect').forEach(e=>e.classList.toggle('on',e.dataset.r===room))}}
    }
    for(const id in figs){const f=figs[id],p=peers[id];if(!p)continue;const self=id===me&&mine,vis=!p.hidden||id===me;
      if(f.shown!==vis){f.shown=vis;f.g.visible=vis}if(!vis)continue;
      if(self){f.g.position.set(p.x,0,p.z);f.g.rotation.y=p.r}
      else{f.g.position.x+=(p.x-f.g.position.x)*.22;f.g.position.z+=(p.z-f.g.position.z)*.22;
        let dr=p.r-f.g.rotation.y;dr=Math.atan2(Math.sin(dr),Math.cos(dr));f.g.rotation.y+=dr*.25}
      if(f.art){f.pop=Math.min(1,(f.pop||0)+.05);const e=1-Math.pow(1-f.pop,3);f.art.scale.setScalar(.55+.45*e);if(!still&&cur.S.phase==='over')f.art.position.y=Math.abs(Math.sin(t/500+f.sp.r*2))*.05;continue}
      const gi=p.gi,dk=env.dark.length&&env.dark.includes(A.roomOf(f.g.position.x,f.g.position.z));
      if(gi!==f.gi){f.gi=gi;for(const k in f.props)f.props[k].visible=gi>=0&&GL[gi][2]===k;if(gi>=0){f.gl.material.map=texOf(GN[gi],'#ffe9a8');f.gl.material.needsUpdate=true}}
      f.gl.visible=gi>=0&&!dk;f.name.visible=!dk;                          // in a dark room nobody can read what you are doing
      let ax=0,az=0,bow=0,sit=0;
      if(gi>=0){const L=GL[gi],w=still?0:t/1000;ax=-L[0];
        if(L[1]==='thrust')ax+=Math.sin(w*6)*.3;else if(L[1]==='clink')az=Math.sin(w*4)*.25;else if(L[1]==='rps')ax+=Math.sin(w*8)*.55;else if(L[1]==='pat')ax+=Math.sin(w*14)*.14;
        else if(L[1]==='side')az=-.9;else if(L[1]==='bow')bow=.55+Math.sin(w*3)*.1;else if(L[1]==='sit'){sit=-.34;ax=-.5}}
      f.arm.rotation.x+=(ax-f.arm.rotation.x)*.3;f.arm.rotation.z+=(az-f.arm.rotation.z)*.3;f.arm2.rotation.x=f.arm.rotation.x;f.arm2.rotation.z=-f.arm.rotation.z;f.pivot.rotation.x+=(bow-f.pivot.rotation.x)*.2;
      f.pivot.position.y+=(sit-f.pivot.position.y)*.25;
    }
    const cx=me3.ok?me3.x:M.table.x,cz=me3.ok?me3.z:M.table.z,sx=Math.sin(camYaw),sz=Math.cos(camYaw);
    let D=4.6;                                   // pull the camera in when a wall or a piece of furniture is in the way
    for(let d=.5;d<=4.6;d+=.2){const x=cx-sx*d,z=cz-sz*d;if(!A.walkable(x,z,.22)||A.blocked(x,z)&&Math.hypot(x-M.table.x,z-M.table.z)>M.table.r+.4){D=Math.max(.8,d-.3);break}}
    camD+=(D-camD)*(D<camD?.5:.12);
    if(S.phase==='over'){cam.position.set(-sx*17,25,-sz*17);cam.lookAt(0,0,0)}       // results: the whole building from above
    else{cam.position.set(cx-sx*camD,1.9+camD/4.6*1.1+(4.6-camD)*.3,cz-sz*camD);cam.lookAt(cx,1.25+(4.6-camD)*.08,cz)}
  }

  /* ---------- 地鐵追捕: route map ---------- */
  function buildMap(){
    clear();lamp.position.set(0,7,0);lamp.intensity=.7;
    const ground=new T.Mesh(new T.PlaneGeometry(13,12),mat(0x13202a));ground.rotation.x=-Math.PI/2;ground.position.y=-.02;root.add(ground);
    LINES.forEach(L=>{for(let i=1;i<L.ids.length;i++){const a=wpos(ST[L.ids[i-1]]),b=wpos(ST[L.ids[i]]),d=b.clone().sub(a),len=d.length();
      const seg=new T.Mesh(new T.BoxGeometry(.11,.05,len),mat(L.c));seg.position.copy(a.clone().add(b).multiplyScalar(.5));seg.position.y=.02;seg.rotation.y=Math.atan2(d.x,d.z);root.add(seg)}});
    ST.forEach(s=>{const p=wpos(s),m=new T.Mesh(G.st,mat(0xece4d0));m.position.set(p.x,.05,p.z);root.add(m);
      const h=new T.Mesh(G.hit,ghost);h.position.set(p.x,.25,p.z);h.userData.id=s.id;root.add(h);picks.push(h);
      const l=label(s.n,'#b9c6c9',.04);l.position.set(p.x,.12,p.z+.4);root.add(l)});
  }
  function mkPawn(role,team,th,key){const m=roleFigure(th?'thief':role==='corrupt'?'corrupt':'cop',{color:TEAMC[team]});const p={m,to:new T.Vector3(),th,init:false,key};root.add(m);return p}
  function syncMap(S,me,ui,fresh){
    const g=S.g,role=g.roles[me],over=S.phase==='over',all=S.players.map(p=>p.id);
    const seeTh=over||role==='thief'||role==='corrupt',seeLoot=over||role==='thief';
    root.remove(dyn);dyn=new T.Group();root.add(dyn);
    const put=(geo,m,s,y,rx)=>{const o=new T.Mesh(geo,m),p=wpos(ST[s]);o.position.set(p.x,y,p.z);if(rx)o.rotation.x=Math.PI/2;dyn.add(o);return o};
    if(seeLoot)for(const k in g.loot)if(k!=='x'){const o=put(G.loot,mat(0xf1cf63,{emissive:0x6b5510}),+k.slice(1),.34);o.rotation.set(.6,.6,0);o.userData.spin=1}
    const marks={};Object.values(g.marks||{}).forEach(a=>a.forEach(m=>marks[m.s]=m));
    for(const s in marks)put(G.mark,mat(marks[s].hit?0xf1cf63:0x6f8187),+s,.07,1);
    const my=!over&&cActive(S).includes(me)&&!g.done[me]&&g.budget[me]&&g.budget[me].m>0;
    if(my)ADJ[g.pos[me]].forEach(s=>put(G.reach,mat(0xe8a33d,{emissive:0x7a4f10}),s,.08,1));
    if(ui.sel!=null)put(G.sel,mat(0xe8a33d,{emissive:0x7a4f10}),ui.sel,.1,1);
    const at={};
    all.forEach(id=>{const th=g.roles[id]==='thief',key=g.roles[id]+(th?'':g.team[id]);let p=pawns[id];
      if(p&&p.key!==key){root.remove(p.m);const old=p;p=pawns[id]=mkPawn(g.roles[id],g.team[id],th,key);p.m.position.copy(old.m.position);p.init=old.init}
      if(!p)p=pawns[id]=mkPawn(g.roles[id],g.team[id],th,key);
      const s=g.pos[id],vis=s>=0&&ST[s]&&(th?(seeTh&&!g.arrested[id]):true);p.m.visible=!!vis;if(!vis)return;
      const k=s+(th?'t':'c'),i=at[k]=(at[k]||0)+1,w=wpos(ST[s]);
      p.to.set(w.x+(th?.3:-.3)+(i-1)*.24,.06,w.z-(th?0:.26));
      if(!p.init||fresh||still){p.m.position.copy(p.to);p.init=true}
      p.m.scale.setScalar(id===me?.6:.45)});
    stick.hidden=true;gbar.hidden=true;mini.hidden=true;ctx.hidden=true;tip.textContent='左右拖曳旋轉・點車站選取';
  }

  function size(){
    const w=el.clientWidth||320,h=Math.round(kind==='virus'?Math.max(280,Math.min(w*1.05,window.innerHeight*.6)):w);
    renderer.setSize(w,h);cam.aspect=w/h;cam.fov=kind==='virus'?52:42;cam.updateProjectionMatrix();
    const t=Math.tan(21*Math.PI/180);fit=Math.max(5.5/(t*cam.aspect),5.4/t);
  }
  let lastT=0;
  function frame(t){
    if(!el.isConnected){raf=0;return}raf=requestAnimationFrame(frame);
    const dt=Math.min(.2,(t-lastT)/1000||0);lastT=t;   // walking speed must not depend on the frame rate
    if(kind==='virus')stepRoom(dt,t);
    else{for(const id in pawns){const p=pawns[id];p.m.position.lerp(p.to,.14);p.m.rotation.y=yaw}
      if(!still)dyn.children.forEach(o=>{if(o.userData.spin)o.rotation.y=t/900});
      cam.position.set(Math.sin(yaw)*fit*.4,fit*.92,Math.cos(yaw)*fit*.4+.15);cam.lookAt(0,0,.15)}
    if(flash.intensity>0)flash.intensity=Math.max(0,flash.intensity-.08);
    renderer.render(scene,cam);
  }
  /* ---------- input ---------- */
  let down=null;
  cv.addEventListener('pointerdown',e=>{if(down)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};try{cv.setPointerCapture(e.pointerId)}catch(_){}});
  cv.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;const dx=e.clientX-down.x;down.moved+=Math.abs(dx)+Math.abs(e.clientY-down.y);down.x=e.clientX;down.y=e.clientY;
    if(kind==='virus')camYaw-=dx*.008;else yaw-=dx*.008});
  const up=e=>{if(!down||e.pointerId!==down.id)return;const d=down;down=null;if(e.type!=='pointerup'||d.moved>10)return;
    const r=cv.getBoundingClientRect(),v=new T.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(v,cam);
    const hit=ray.intersectObjects(picks,false)[0];if(hit&&onPick)onPick(kind,hit.object.userData.id)};
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  const knob=stick.firstChild;
  const setJoy=e=>{const r=stick.getBoundingClientRect(),R=r.width/2;let x=(e.clientX-r.left-R)/R,y=-(e.clientY-r.top-R)/R;const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}joy.x=x;joy.y=y;knob.style.transform=`translate(${x*R*.55}px,${-y*R*.55}px)`};
  stick.addEventListener('pointerdown',e=>{joy.id=e.pointerId;try{stick.setPointerCapture(e.pointerId)}catch(_){}setJoy(e);e.preventDefault()});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===joy.id)setJoy(e)});
  const joyEnd=e=>{if(e.pointerId!==joy.id)return;joy.id=null;joy.x=joy.y=0;knob.style.transform=''};
  stick.addEventListener('pointerup',joyEnd);stick.addEventListener('pointercancel',joyEnd);
  const typing=()=>{const a=document.activeElement;return a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')};
  window.addEventListener('keydown',e=>{if(!typing())keys[e.key.toLowerCase()]=true});
  window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false});
  window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false});
  window.addEventListener('resize',()=>{if(el.isConnected)size()});
  el.addEventListener('contextmenu',e=>e.preventDefault());

  api.attach=(slot,S,me,ui,cb)=>{
    onPick=cb;cur={S,me,ui};const k=S.game,s=k+'|'+(S.gid||'')+'|'+S.players.map(p=>p.id).join(',')+'|'+(k==='virus'?me:'');let fresh=false;
    if(s!==sig){sig=s;kind=k;fresh=true;if(k==='virus')buildRoom(S);else buildMap()}
    if(el.parentNode!==slot)slot.appendChild(el);
    size();if(k==='virus')syncRoom(S,me,ui,fresh);else syncMap(S,me,ui,fresh);
    if(!raf)raf=requestAnimationFrame(frame);
  };
  let pendInit=null,synced=false; // synced: the server has told us where our avatar is; until then we neither move nor report a position
  api.peers=(p,init)=>{const me=cur&&cur.me,mine=me&&figs[me]&&cur.S.phase==='play'&&cur.S.g.alive[me]!==false;
    if(init){pendInit=p;if(me&&p[me]&&figs[me]){const a=p[me];me3={x:a[0],z:a[1],r:a[2],ok:true};camYaw=a[2];setPeers(p,true);pendInit=null;synced=true}return}
    const mineP=p[me];if(mineP&&mine&&me3.ok&&!seated){p=Object.assign({},p);delete p[me]}
    setPeers(p,false);
    if(mineP&&(!mine||seated)){me3.x=mineP[0];me3.z=mineP[1]}
    if(mineP&&!me3.ok){me3={x:mineP[0],z:mineP[1],r:mineP[2],ok:true};camYaw=mineP[2]}};
  api.dist=distTo;api.range=RANGE;
  api.speak=(id,v)=>{speak[id]=!!v;const f=figs[id];if(f)f.bub.visible=!!v&&!f.art};
  api.inRoom=()=>kind==='virus'&&me3.ok;
  api.gesture=(gi,t,k,name)=>{if(kind!=='virus'||!figs[t])return'對象不在場';if(seated)return'請先站起來';if(distTo(t)>RANGE)return'太遠了，先走到他旁邊（約兩步內）';prog=null;gest={gi,t,k:k||'',name:name||'',t0:Date.now()};return''};
  api.stop=()=>stopGesture(true);
  api.busy=()=>!!gest;
  api.debug=()=>({me:Object.assign({},me3),peers:JSON.parse(JSON.stringify(peers)),gest,camYaw,seated,prog,env,room:A.roomOf(me3.x,me3.z),near:nearObjs()});
  api.teleport=(x,z)=>{if(!A.walkable(x,z)||A.blocked(x,z))return false;if(seated){seated=false;if(api.onEnv)api.onEnv({a:'stand'})}me3.x=x;me3.z=z;return true};
  api.env=m=>{env={dark:m.dark||[],books:m.books||[],lockers:m.lockers||[]};if(kind==='virus'&&root)applyEnv()};
  api.seat=(x,z,r)=>{me3.x=x;me3.z=z;me3.r=r;seated=true;gest=null;prog=null;nearKey=''};
  api.progress=(a,ms)=>{prog={a,t0:Date.now(),ms:ms||HOLD};gest=null};
  api.done=()=>{prog=null;gest=null;gbar.hidden=true;nearKey=''};
  api.room=()=>me3.ok?A.roomOf(me3.x,me3.z):'';
  api.roomOf=id=>{const p=peers[id];return p&&!p.hidden?A.roomOf(p.x,p.z):''};
  api.setCtx=h=>{if(ctx._h!==h){ctx._h=h;ctx.innerHTML=h}};
  api.refreshNear=()=>{nearKey=''};
  api.stand=()=>{seated=false;nearKey=''};
  return api;
})();
