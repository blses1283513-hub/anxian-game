/* 3D scenes: a walkable room for 感染戰 and a route map for 地鐵追捕. */
window.Stage3D=(()=>{
  "use strict";
  const T=window.THREE,A=window.AX,Art=window.Art;if(!T||!A||!Art)return null;
  let renderer;try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'})}catch(e){return null}
  const {ST,ADJ,LINES,VR,GN,cActive}=A;
  const RANGE=1.7,HOLD=3000,SPEED=3.3;

  const el=document.createElement('div');el.className='stage';
  const cv=renderer.domElement;el.appendChild(cv);
  const stick=document.createElement('div');stick.className='stick';stick.innerHTML='<div class="knob"></div>';el.appendChild(stick);
  const stl=document.createElement('div');stl.className='stl';el.appendChild(stl);                 // top-left column: whatever the app puts there (caption, armed skill), then the progress bar
  const hud=document.createElement('div');hud.style.display='contents';stl.appendChild(hud);
  const gbar=document.createElement('div');gbar.className='gbar';gbar.hidden=true;gbar.innerHTML='<span></span><button class="btn sm" data-a="gstop">停止</button>';stl.appendChild(gbar);
  const tip=document.createElement('div');tip.className='stagetip';el.appendChild(tip);
  const mini=document.createElement('div');mini.className='mini';el.appendChild(mini);
  const ctx=document.createElement('div');ctx.className='ctx';ctx.hidden=true;el.appendChild(ctx);
  const pxq=+new URLSearchParams(location.search).get('px'),noDraw=new URLSearchParams(location.search).get('draw')==='0';   // draw=0: automated tests run the game logic on many pages without painting them                                   // ?px=1 lowers the drawing resolution on a slow phone
  const scene=new T.Scene();scene.background=new T.Color(0x0b141a);scene.fog=new T.Fog(0x0b141a,30,90);
  const cam=new T.PerspectiveCamera(48,4/3,.1,130),ray=new T.Raycaster();
  // two lights only: lamp light is painted into the floors, so phones do not pay for it every frame
  scene.add(new T.HemisphereLight(0xe4ecf2,0x3a3128,.95));
  const sun=new T.DirectionalLight(0xfff1dd,.55);sun.position.set(4,10,6);scene.add(sun);
  // a red glow where someone is shot: a sprite instead of a light
  const flash=new T.Sprite(new T.SpriteMaterial({map:Art.glowTex,color:0xff4030,transparent:true,blending:T.AdditiveBlending,depthWrite:false,opacity:0}));flash.scale.set(5,5,1);flash.visible=false;scene.add(flash);
  Object.defineProperty(flash,'intensity',{get(){return this.material.opacity*3},set(v){this.material.opacity=Math.max(0,Math.min(1,v/3));this.visible=v>0}});
  const shadows=Art.Shadows(20,1.1);scene.add(shadows.mesh);
  const still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  let root=null,dyn=null,kind='',sig='',picks=[],raf=0,onPick=null,cur=null; // cur = {S,me,ui}
  const speak={};let yaw=0,fit=10;                         // chase camera
  let figs={},me3={x:0,z:3.7,r:Math.PI,ok:false},camYaw=Math.PI,peers={},gest=null,lastSent='',lastSendT=0,pawns={};
  const joy={x:0,y:0,id:null},keys={};
  const api={el,onPos:null,onStop:null};

  const mats={};const mat=(c,o)=>{const k=c+JSON.stringify(o||0);if(mats[k])return mats[k];return mats[k]=new T.MeshLambertMaterial(Object.assign({color:c},o||{}))};   // cheap per-vertex lighting
  const G={body:new T.CylinderGeometry(.26,.4,1.15,18),head:new T.SphereGeometry(.27,18,14),nose:new T.BoxGeometry(.1,.08,.14),arm:new T.BoxGeometry(.13,.56,.13),ring:new T.TorusGeometry(.56,.05,12,72),seat:new T.TorusGeometry(.4,.028,10,72),
    gun:Art.rbox(.09,.12,.3,.025,2),cup:Art.lathe([[0,0],[.06,0],[.08,.15],[.075,.16],[.065,.02],[0,.02]],18),box:Art.rbox(.16,.16,.16,.03,2),dot:new T.SphereGeometry(.06,8,6),
    st:new T.CylinderGeometry(.17,.17,.1,20),hit:new T.CylinderGeometry(.42,.42,.5,10),cop:new T.ConeGeometry(.18,.5,16),thief:new T.OctahedronGeometry(.19),
    loot:Art.rbox(.17,.17,.17,.035,2),mark:new T.TorusGeometry(.3,.035,8,28),sel:new T.TorusGeometry(.4,.05,8,32),reach:new T.TorusGeometry(.24,.03,8,24)};
  const ghost=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});
  const tex={};
  // the seat mark: a filled circle (seats 1-8) or triangle (9-16) in the seat colour with the number inside; outline only = what you see in a dark room
  function drawMark(x,cx,cy,r,n,outline){const m=A.seatMark(n);x.save();x.beginPath();
    if(m.s==='tri'){x.moveTo(cx,cy-r*1.08);x.lineTo(cx+r*1.04,cy+r*.72);x.lineTo(cx-r*1.04,cy+r*.72);x.closePath()}else x.arc(cx,cy,r,0,Math.PI*2);
    x.lineJoin='round';x.lineWidth=outline?9:10;x.strokeStyle=outline?'rgba(240,240,240,.95)':'rgba(11,20,26,.92)';x.stroke();
    if(!outline){x.fillStyle=m.c;x.fill();x.fillStyle='#10161c';x.font='800 '+Math.round(r*(n>9?.95:1.15))+'px "Noto Sans TC",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(n),cx,cy+(m.s==='tri'?r*.18:r*.04))}
    x.restore()}
  function markTex(n){const k='mk'+n;if(tex[k])return tex[k];const c=document.createElement('canvas');c.width=c.height=128;drawMark(c.getContext('2d'),64,66,44,n,true);const t=tex[k]=new T.CanvasTexture(c);t.anisotropy=4;return t}
  function texOf(text,color,w,mk){w=w||256;const k=text+color+w+'|'+(mk||'');let t=tex[k];if(!t){const c=document.createElement('canvas');c.width=w*2;c.height=128;const x=c.getContext('2d');      // drawn at twice the size so text stays sharp on phone screens
      let tx=w;if(mk){x.font='700 68px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';const tw=x.measureText(text).width,full=tw+112;tx=w+56;drawMark(x,w-full/2+48,64,46,mk,false)}
      x.font='700 68px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';x.lineWidth=14;x.strokeStyle='rgba(11,20,26,.92)';x.strokeText(text,tx,68);x.fillStyle=color;x.fillText(text,tx,68);
      t=tex[k]=new T.CanvasTexture(c);t.anisotropy=4}return t}
  function label(text,color,h,opt){const o=opt||{},w=o.w||256;const s=new T.Sprite(new T.SpriteMaterial({map:texOf(text,color,w,o.mark),transparent:true,depthTest:!!o.depth,sizeAttenuation:!!o.atten}));s.scale.set(h*w/64,h,1);s.renderOrder=5;s.userData.free={m:1};return s}
  const TEAMC=[0xe2594c,0x5c9eea,0x68ba6f],FAC={threat:0xe2594c,safe:0x52b8a8,neutral:0xab93dc};
  const wpos=s=>new T.Vector3((s.x-203)/40,0,(s.y-188)/40);
  // objects marked userData.free own their geometry (g), material (m) and/or texture (t); shared ones are left alone
  function freeTree(o){o.traverse(x=>{const f=x.userData&&x.userData.free;if(!f)return;if(f.g&&x.geometry)x.geometry.dispose();const m=x.material;if(m){if(f.t&&m.map)m.map.dispose();if(f.m)m.dispose()}})}
  const own=(x,g,m,t)=>{x.userData.free={g,m,t};return x};
  function clear(){if(typeof shadows!=='undefined'){shadows.begin();shadows.end()}if(root){scene.remove(root);freeTree(root)}root=new T.Group();dyn=new T.Group();root.add(dyn);scene.add(root);figs={};pawns={};picks=[];yaw=0;gest=null;peers={};me3.ok=false;synced=false;if(typeof mini!=='undefined'){mini.innerHTML='';ctx.innerHTML='';ctx._h=''}}

  /* ---------- people: anime-style figures. Each limb is one merged, toon-shaded mesh with an ink outline; the face is a drawn texture. ---------- */
  const PAL={skin:[0xf7dcc4,0xefcaa6,0xd9aa80,0xb07c56,0x77503a],hair:[0x23232b,0x4f3120,0x86522c,0xe3bf5e,0xc04e32,0xa4abb2,0x4479e0,0x9a5fd6],
    top:[0x3f73c9,0xc9463f,0x2f9d6b,0x55795f,0xe2b93b,0x2b2f38,0x8a5cc9,0x30343f,0x9aa3ab,0xe68ab0],bot:[0x23304a,0x3a3f47,0x5b4a3a,0x7a8a99,0x1d1d22,0x6b3f2a,0xc98aa5,0x2f5d4a]};
  const EYE=[0x7a4a2a,0xb8742e,0x3f8f5a,0x3f7fd0,0x3a9a7a,0x6b8fb0,0x35b0d0,0x9a5ad0];        // eye colour goes with the hair colour
  const grad=(()=>{const t=new T.DataTexture(new Uint8Array([150,208,255]),3,1,T.LuminanceFormat);t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t})();
  const toonM=new T.MeshToonMaterial({vertexColors:true,gradientMap:grad}),toonG=new T.MeshToonMaterial({vertexColors:true,gradientMap:grad,transparent:true,opacity:.62});
  const glowM=new T.MeshBasicMaterial({vertexColors:true}),glowG=new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.7});
  const inkM=new T.MeshBasicMaterial({color:0x15181d,side:T.BackSide});inkM.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n\ttransformed+=normalize(normal)*.014;')};
  // arms and legs are skinned: the skin bends smoothly at the elbow and the knee instead of two tubes meeting
  const toonSk=toonM.clone();toonSk.skinning=true;const toonGSk=toonG.clone();toonGSk.skinning=true;
  const inkSk=new T.MeshBasicMaterial({color:0x15181d,side:T.BackSide,skinning:true});inkSk.onBeforeCompile=inkM.onBeforeCompile;
  const mixC=Art.mix,css=c=>Art.css(c);
  const pg={};const SP=new T.SphereGeometry(1,28,20),SPt=new T.SphereGeometry(1,16,12),HEAD=new T.SphereGeometry(1,48,36),BX=Art.rbox(1,1,1,.12,3);   // SPt: small parts (buttons, ears, hands) need few faces
  const cyl=(rt,rb,seg)=>{const n=Math.min(64,(seg||16)*2),k='c'+rt+'|'+rb+'|'+n;return pg[k]||(pg[k]=new T.CylinderGeometry(rt,rb,1,n))};   // twice the sides asked for: no visible facets up close
  const tubeG=(rt,rb)=>{const k='tb'+rt+'|'+rb;return pg[k]||(pg[k]=new T.CylinderGeometry(rt,rb,1,16,8))};   // enough rings along the length to bend smoothly
  const capG=th=>pg['h'+th]||(pg['h'+th]=new T.SphereGeometry(1,44,24,0,Math.PI*2,0,th));
  const tuft=(pts)=>new T.LatheGeometry(pts.map(q=>new T.Vector2(q[0],q[1])),28),SPIKE=tuft([[0,-.5],[.62,-.48],[.95,-.38],[1,-.24],[.84,-.02],[.56,.22],[.28,.4],[.1,.49],[0,.5]]),BLUNT=tuft([[0,-.5],[.7,-.48],[1,-.36],[1,-.1],[.9,.2],[.7,.42],[.4,.5],[0,.5]]),ARC=new T.TorusGeometry(1,.035,10,28,1.6),RING=new T.TorusGeometry(1,.32,16,48);
  // collects primitives (colour per vertex) into one geometry. Rotation order is yaw, then pitch, then roll.
  function Parts(){const P=[],N=[],C=[],I=[];let n=0;const m4=new T.Matrix4(),nm=new T.Matrix3(),v=new T.Vector3(),ps=new T.Vector3(),sc=new T.Vector3(),e=new T.Euler(0,0,0,'YXZ'),q=new T.Quaternion(),col=new T.Color();
    const me={count:()=>n,
      add(geo,c,x,y,z,sx,sy,sz,rx,ry,rz){const p=geo.attributes.position,nr=geo.attributes.normal,ix=geo.index,s0=sx==null?1:sx;
        q.setFromEuler(e.set(rx||0,ry||0,rz||0));sc.set(s0,sy==null?s0:sy,sz==null?s0:sz);m4.compose(ps.set(x||0,y||0,z||0),q,sc);nm.getNormalMatrix(m4);col.setHex(c);
        for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m4);P.push(v.x,v.y,v.z);v.fromBufferAttribute(nr,i).applyMatrix3(nm).normalize();N.push(v.x,v.y,v.z);C.push(col.r,col.g,col.b)}
        if(ix)for(let i=0;i<ix.count;i++)I.push(ix.getX(i)+n);else for(let i=0;i<p.count;i++)I.push(i+n);n+=p.count;return me},
      geo(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('normal',new T.Float32BufferAttribute(N,3));g.setAttribute('color',new T.Float32BufferAttribute(C,3));g.setIndex(I);return g}};
    return me}
  const ftex={};
  function faceTex(sex,eye,brow,v){
    const k=[sex,eye,brow,v].join('|');if(ftex[k])return ftex[k];
    const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),ink='#15171c',PI=Math.PI;x.lineCap='round';
    if(v==='mask'){x.fillStyle='#17191d';x.beginPath();x.ellipse(128,136,120,50,0,0,7);x.fill()}                 // a burglar's eye mask
    for(const sd of [-1,1]){const cx=128+sd*49,cy=138,w=sex?25:22,h=sex?35:30;
      x.save();x.beginPath();x.ellipse(cx,cy,w,h,0,0,7);x.clip();
      x.fillStyle='#fbfaf6';x.fillRect(cx-w,cy-h,w*2,h*2);
      const g=x.createLinearGradient(0,cy-h,0,cy+h);g.addColorStop(0,css(mixC(eye,.6)));g.addColorStop(.5,css(eye));g.addColorStop(1,css(mixC(eye,.5,0xffffff)));
      x.fillStyle=g;x.beginPath();x.ellipse(cx,cy+2,w*.84,h*.92,0,0,7);x.fill();
      x.fillStyle=ink;x.beginPath();x.ellipse(cx,cy+1,w*.36,h*.42,0,0,7);x.fill();
      x.fillStyle='rgba(18,20,26,.5)';x.fillRect(cx-w,cy-h,w*2,h*.46);x.restore();                                   // shadow of the upper lid
      x.fillStyle='#fff';x.beginPath();x.ellipse(cx-w*.3,cy-h*.36,w*.3,h*.22,-.4,0,7);x.fill();x.beginPath();x.arc(cx+w*.36,cy+h*.42,w*.15,0,7);x.fill();
      x.strokeStyle=ink;x.lineWidth=sex?7:6;x.beginPath();x.ellipse(cx,cy,w+1,h+1,0,PI*1.06,PI*1.94);x.stroke();
      if(sex){x.lineWidth=4;x.beginPath();x.moveTo(cx+sd*(w+1),cy-h*.3);x.lineTo(cx+sd*(w+10),cy-h*.62);x.stroke()}
      x.lineWidth=2.5;x.strokeStyle='rgba(20,22,26,.55)';x.beginPath();x.ellipse(cx,cy,w,h,0,PI*.22,PI*.78);x.stroke();
      x.strokeStyle=css(brow);x.lineWidth=sex?4:6;x.beginPath();x.moveTo(cx-sd*w*.9,cy-h-(sex?15:10));x.quadraticCurveTo(cx,cy-h-(sex?22:17),cx+sd*w,cy-h-(sex?13:14));x.stroke();
      if(v!=='mask'){x.fillStyle=sex?'rgba(255,115,130,.4)':'rgba(255,130,120,.2)';x.beginPath();x.ellipse(cx+sd*11,cy+h+12,17,8,0,0,7);x.fill()}
      if(v==='glasses'){x.fillStyle='rgba(170,225,255,.22)';x.strokeStyle='#2a3038';x.lineWidth=5;x.beginPath();x.ellipse(cx,cy+1,w+9,h+8,0,0,7);x.fill();x.stroke()}}
    if(v==='glasses'){x.strokeStyle='#2a3038';x.lineWidth=5;x.beginPath();x.moveTo(110,134);x.quadraticCurveTo(128,126,146,134);x.stroke()}
    x.strokeStyle='rgba(120,60,50,.7)';x.lineWidth=2.5;x.beginPath();x.moveTo(126,182);x.lineTo(130,186);x.stroke();
    if(v!=='cloth'){x.strokeStyle='#8a3a3a';x.lineWidth=3.5;x.beginPath();x.moveTo(115,203);x.quadraticCurveTo(128,213,141,203);x.stroke()}
    const t=new T.CanvasTexture(c);t.anisotropy=4;return ftex[k]=t}
  const FACE=new T.SphereGeometry(1,32,24,Math.PI/2-1,2,.9,1.45),fmat={};
  const faceM=(t,gh)=>{const k=t.uuid+(gh?'g':'');return fmat[k]||(fmat[k]=new T.MeshToonMaterial({map:t,gradientMap:grad,transparent:true,opacity:gh?.7:1,depthWrite:false}))};
  // look = [sex, skin, hair style, hair colour, top colour, sleeve, bottom kind, bottom colour]
  // opt.role dresses the same person as that identity: T C AB R J I F (感染戰) or thief cop corrupt (地鐵追捕)
  function human(look,id,opt){
    const o=opt||{},role=o.role||'',L12=A.normLook(look),[sex,sk,hs,hc,tc,sl0,bt0,bc,acc,pat,ht,bd]=L12,g=new T.Group(),gh=!!o.ghost;
    const bx=[.84,1,1.2][bd],tall=[.92,1,1.08][ht];g.scale.setScalar(tall);g.userData.tall=tall;          // build widens the body (not the head); height scales the whole person
    const skin=PAL.skin[sk],hair=PAL.hair[hc],hl=mixC(hair,.38,0xffffff),dk=0x1d2026,wh=0xf4f1ea,red=0xc0322a,gold=0xf1cf63;
    let top=PAL.top[tc],bot=PAL.bot[bc],sl=sl0,bt=bt0,coat=0,hat='',fv=!role&&acc===1?'glasses':'';
    const lum=c=>((c>>16&255)*.3+(c>>8&255)*.59+(c&255)*.11)/255,pc=c=>lum(c)>.55?mixC(c,.55):mixC(c,.6,0xffffff);   // a pattern colour that stands out on the cloth
    if(role==='T'){top=0x23262c;bot=0x17191d;sl=1;bt=0;fv='cloth'}
    else if(role==='C'||role==='AB'){top=0x3f9d90;sl=1}
    else if(role==='R'){top=0xf2f2ee;sl=1;coat=.5;fv='glasses'}
    else if(role==='J'){top=0xb99a6b;sl=1;hat='fedora'}
    else if(role==='I'){top=0x243a5a;sl=1;coat=.42;hat='fedora'}
    else if(role==='F'){top=0x5a2f8a;sl=1;coat=.12;hat='hood'}
    else if(role==='thief'){top=0xf2f2ee;bot=0x1d1d22;sl=1;bt=0;hat='beanie';fv='mask'}
    else if(role==='cop'||role==='corrupt'){top=o.color==null?0x2d5fae:o.color;bot=0x1b2c4a;sl=1;bt=0;hat='police';if(role==='corrupt')fv='cloth'}
    const w=(sex?.165:.19)*bx,ws=(sex?.13:.16)*bx*(bd===2?1.08:1),hy=1.56,R=.3;
    // the torso is a turned shape: hips, waist, chest and shoulders rounding into the neck
    const TP=sex?[[ws*.97,.74],[ws,.78],[ws*.88,.9],[w*.97,1.04],[w,1.11],[w*.9,1.18],[w*.55,1.225],[.06,1.245],[.05,1.25]]:[[ws*.98,.74],[ws,.78],[ws*.97,.9],[w*.98,1.04],[w,1.12],[w*.88,1.19],[w*.5,1.228],[.06,1.245],[.05,1.25]];
    const tk='t'+sex+'|'+bd,torso=pg[tk]||(pg[tk]=new T.LatheGeometry(TP.map(q=>new T.Vector2(q[0],q[1])),48));
    const rAt=y=>{for(let i=1;i<TP.length;i++)if(y<=TP[i][1]){const a=TP[i-1],b=TP[i],f=(y-a[1])/(b[1]-a[1]);return a[0]+(b[0]-a[0])*Math.max(0,Math.min(1,f))}return TP[TP.length-1][0]};
    const inks=[],limb=(par,oy)=>{const L={t:Parts(),e:Parts(),n:Parts(),par},o=oy||0;L.done=()=>{
        if(L.n.count()){const m=new T.Mesh(L.n.geo(),gh?toonG:toonM);m.position.y=o;m.userData.free={g:1};if(id)m.userData.id=id;par.add(m)}
        if(L.t.count()){const geo=L.t.geo(),m=new T.Mesh(geo,gh?toonG:toonM);m.position.y=o;m.userData.free={g:1};if(id)m.userData.id=id;par.add(m);if(!gh){const ol=new T.Mesh(geo,inkM);ol.position.y=o;if(id)ol.userData.id=id;par.add(ol);inks.push(ol)}}
        if(L.e.count()){const m=new T.Mesh(L.e.geo(),gh?glowG:glowM);m.position.y=o;m.userData.free={g:1};par.add(m)}};return L};
    // a skinned limb: three bones (shoulder/hip, elbow/knee, wrist/ankle); build() draws the sleeve or trouser leg hanging down from 0,
    // end() draws the hand or the shoe in the last bone's own space, into the same skinned mesh (one draw call per limb);
    // extra() is for things held in the hand that glow (identity props), as their own meshes on the last bone
    const skinLimb=(par,j1,j2,build,end,extra)=>{const P2=Parts();build(P2);
      const off={add(geo,c,x,y,z,...r){P2.add(geo,c,x,(y||0)+j2,z,...r);return off}};end(off);
      const geo=P2.geo(),pos=geo.attributes.position,n=pos.count,si=new Uint16Array(n*4),sw=new Float32Array(n*4),bw=.05,bw2=.018,sm=(a,b,y)=>{const t=Math.max(0,Math.min(1,(a-y)/(a-b)));return t*t*(3-2*t)};
      for(let i=0;i<n;i++){const y=pos.getY(i),k1=sm(j1+bw,j1-bw,y),k2=sm(j2+bw2,j2-bw2,y);si[i*4+1]=1;si[i*4+2]=2;sw[i*4]=1-k1;sw[i*4+1]=k1*(1-k2);sw[i*4+2]=k1*k2}
      geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));
      const b0=new T.Bone(),b1=new T.Bone(),b2=new T.Bone();b1.position.y=j1;b2.position.y=j2-j1;b0.add(b1);b1.add(b2);
      const m=new T.SkinnedMesh(geo,gh?toonGSk:toonSk);m.add(b0);par.add(m);m.updateMatrixWorld(true);const sk=new T.Skeleton([b0,b1,b2]);m.bind(sk);m.frustumCulled=false;m.userData.free={g:1};if(id)m.userData.id=id;
      if(!gh){const ol=new T.SkinnedMesh(geo,inkSk);par.add(ol);ol.bind(sk,m.bindMatrix);ol.frustumCulled=false;if(id)ol.userData.id=id;inks.push(ol)}
      if(extra){const E=limb(b2);extra(E.t,E);E.done()}return{G:par,b0,b1,b2}};
    // the skeleton above the legs: hips (moves up and down), spine (bends at the hip joints), head (turns at the neck)
    const hips=new T.Group(),spine=new T.Group(),head=new T.Group();spine.position.y=.66;head.position.y=1.27-.66;g.add(hips);hips.add(spine);spine.add(head);
    // legs
    const shoe=role?dk:bt===1?0xf0f0ee:bt===2?0x5a3a2a:0x24262c,sock=bt===2&&!role?(tc===5||tc===7?0x23262c:wh):wh;
    const legs=[-1,1].map(sd=>{const G=new T.Group();G.position.set(sd*.1*bx,.66,0);G.scale.set(1+(bx-1)*.8,1,1+(bx-1)*.8);hips.add(G);
      return skinLimb(G,-.3,-.575,p=>{
        if(bt===0)p.add(tubeG(.096,.085),bot,0,-.15,0,1,.32,1).add(SPt,bot,0,-.3,0,.084,.06,.084).add(tubeG(.082,.068),bot,0,-.44,0,1,.29,1);
        else if(bt===1)p.add(tubeG(.106,.1),bot,0,-.11,0,1,.22,1).add(tubeG(.077,.068),skin,0,-.2,0,1,.2,1).add(SPt,skin,0,-.3,0,.068,.05,.068).add(tubeG(.066,.056),skin,0,-.43,0,1,.27,1).add(tubeG(.062,.059),sock,0,-.52,0,1,.11,1);
        else p.add(tubeG(.078,.068),skin,0,-.15,0,1,.3,1).add(SPt,skin,0,-.3,0,.067,.05,.067).add(tubeG(.066,.057),skin,0,-.37,0,1,.15,1).add(tubeG(.063,.058),sock,0,-.47,0,1,.22,1)},
        p=>p.add(SP,shoe,0,-.03,.035,.082,.058,.135).add(SPt,mixC(shoe,.35),0,-.075,.035,.074,.012,.122))});
    // body and head
    const B=limb(spine,-.66),HD=limb(head,-1.27),hd=y=>y>=1.32,b={add(geo,c,x,y,...r){(hd(y)?HD.t:B.t).add(geo,c,x,y,...r);return b}},bn={add(geo,c,x,y,...r){(hd(y)?HD.n:B.n).add(geo,c,x,y,...r);return bn}},be={add(geo,c,x,y,...r){(hd(y)?HD.e:B.e).add(geo,c,x,y,...r);return be}};
    if(bt===2&&!coat){b.add(cyl(.15,.34,14),bot,0,.6,0,1,.3,.9).add(cyl(.336,.348,14),mixC(bot,.3,0xffffff),0,.468,0,1,.035,.9)}
    else if(bt!==2){b.add(cyl(ws+.012,ws+.024),bot,0,.7,0,1,.13,.8);if(bt===0)b.add(cyl(ws+.018,ws+.018),dk,0,.765,0,1,.032,.8).add(BX,gold,0,.765,(ws+.018)*.8,.04,.03,.012)}
    b.add(torso,top,0,0,0,1,1,.78).add(cyl(.05,.056),skin,0,1.26,0,1,.13,1);
    if(coat){const len=1.21-coat,hem=w+.07+(role==='F'?.12:0);b.add(cyl(ws+.03,hem,14),top,0,coat+len*.3,0,1,len*.6,.82);        // a long coat or robe over the legs
      if(role!=='F')b.add(BX,mixC(top,.25),0,.84,(ws+.05)*.82,.012,.5,.012)}
    if(sl&&!role){b.add(BX,wh,-.05,1.215,.105,.085,.03,.05,.5,0,-.55).add(BX,wh,.05,1.215,.105,.085,.03,.05,.5,0,.55);
      if(!sex&&(tc===5||tc===7))b.add(BX,red,0,1.07,rAt(1.07)*.78+.008,.04,.22,.014).add(BX,red,0,1.185,.14,.05,.04,.02);
      else if(sex&&bt===2)b.add(SPt,red,-.045,1.185,.14,.05,.03,.02).add(SPt,red,.045,1.185,.14,.05,.03,.02).add(SPt,mixC(red,.25),0,1.185,.15,.02);
      else for(const y of [1.08,.97,.86])b.add(SPt,mixC(top,.35),0,y,rAt(y)*.78+.004,.013)}
    else if(!role){b.add(cyl(.08,.088),mixC(top,.25),0,1.218,0,1,.025,.8);const y=1.0,r=rAt(y)+.003;b.add(cyl(r,r-.004),mixC(top,.35,0xffffff),0,y,0,1,.06,.78)}
    b.add(HEAD,skin,0,hy,0,R,R*.96,R*.97).add(SPt,skin,-.285,hy-.03,0,.04,.06,.035).add(SPt,skin,.285,hy-.03,0,.04,.06,.035);
    // hair
    const Rh=R*1.05,spike=(a,pol,len,wd,rz,geo,col)=>b.add(geo||SPIKE,col||hair,Math.sin(a)*Math.sin(pol)*Rh,hy+Math.cos(pol)*Rh*.97,Math.cos(a)*Math.sin(pol)*Rh,wd||.075,len,.034,Math.PI-(Math.PI/2-pol),a,rz||0);
    const capH=(r,th,tilt)=>b.add(capG(th),hair,0,hy+.005,-.012,r,r,r,tilt,0,0);
    const fringe=(as,len,rz,geo)=>as.forEach((a,i)=>spike(a,.93+len/2/R,len*(i%2?.92:1),.078,rz,geo));
    const nape=()=>{for(const a of [Math.PI-.55,Math.PI,Math.PI+.55])spike(a,2.0,.15,.09)};
    if(hat!=='hood'){
      if(hs===1){capH(R*1.035,1.38,-.45);fringe([-.8,-.4,0,.4,.8],.07)}
      else{capH(R*1.06,1.5,-.5);bn.add(ARC,hl,0,hy+.225,.01,.238,.238,.238,Math.PI/2,-(Math.PI/2-.8),0)}
      if(hs===0){fringe([-.78,-.4,0,.4,.78],.16);spike(-1.3,1.5,.17,.08);spike(1.3,1.5,.17,.08);nape();b.add(SPIKE,hair,.02,hy+.36,.03,.03,.14,.03,.5,0,-.5)}
      else if(hs===2){fringe([-.8,-.42,-.05,.32],.17,.5);spike(.72,1.36,.27,.085,.12);spike(-1.3,1.5,.16,.08);nape()}
      else if(hs===3){fringe([-.8,-.48,-.16,.16,.48,.8],.14,0,BLUNT);b.add(SP,hair,0,hy-.3,-.2,.275,.44,.1).add(SP,hair,-.265,hy-.22,.05,.05,.3,.075).add(SP,hair,.265,hy-.22,.05,.05,.3,.075)}
      else if(hs===4){fringe([-.78,-.4,0,.4,.78],.15);spike(-1.25,1.5,.2,.07);spike(1.25,1.5,.2,.07);b.add(SP,red,0,hy+.2,-.27,.062).add(SP,hair,0,hy-.06,-.39,.09,.3,.085,.22,0,0).add(SPIKE,hair,0,hy-.36,-.44,.07,.2,.06,Math.PI+.2,0,0)}
      else if(hs===5){fringe([-.8,-.48,-.16,.16,.48,.8],.15,0,BLUNT);b.add(SP,hair,0,hy-.09,-.11,.31,.27,.25).add(SP,hair,-.255,hy-.1,.03,.095,.25,.19).add(SP,hair,.255,hy-.1,.03,.095,.25,.19)}
      else if(hs===6){fringe([-.78,-.4,0,.4,.78],.14);b.add(SP,hair,0,hy+.35,-.08,.135).add(SP,red,0,hy+.25,-.07,.085,.03,.085).add(SP,hair,-.27,hy-.13,.07,.04,.18,.05).add(SP,hair,.27,hy-.13,.07,.04,.18,.05)}
      else if(hs===7){for(let i=0;i<11;i++){const a=i/11*Math.PI*2+.28,f=Math.abs(Math.sin(a/2));if(Math.cos(a)>.75)continue;b.add(SP,hair,Math.sin(a)*.29,hy+.06+(i%2)*.07-f*.1,Math.cos(a)*.27,.105)}
        for(const [x,y,z,r] of [[-.13,.3,.08,.1],[.13,.3,.08,.1],[0,.33,-.1,.12],[-.2,.2,.2,.085],[.2,.2,.2,.085],[0,.24,.24,.085]])b.add(SP,hair,x,hy+y,z,r)}
    }else{fringe([-.6,-.2,.2,.6],.13);b.add(capG(1.95),top,0,hy+.01,-.02,R*1.2,R*1.2,R*1.22,-.72,0,0).add(SPIKE,top,0,hy+.36,-.2,.13,.3,.13,-.75,0,0)}
    // hats
    if(hat==='fedora'){const c=role==='J'?0x6b4a2e:0x1b2636;b.add(cyl(.43,.43,20),c,0,hy+.225,0,1,.03,1).add(cyl(.21,.262,16),c,0,hy+.34,0,1,.22,1).add(cyl(.266,.266,16),role==='J'?wh:0x0f1722,0,hy+.262,0,1,.05,1);
      if(role==='J')b.add(BX,wh,.19,hy+.3,.2,.1,.07,.012,0,.75,0)}
    else if(hat==='police'){const c=0x1b2c4a;b.add(cyl(.275,.258,16),c,0,hy+.3,0,1,.12,1).add(cyl(.31,.278,16),c,0,hy+.385,0,1,.05,1).add(BX,dk,0,hy+.235,.3,.3,.02,.15,.22,0,0).add(SP,gold,0,hy+.32,.268,.045,.045,.02)}
    else if(hat==='beanie'){b.add(capG(1.25),dk,0,hy+.02,-.02,R*1.1,R*1.1,R*1.1,-.3,0,0).add(SP,dk,0,hy+.36,-.11,.05)}
    // identity details on the body
    const z0=y=>rAt(y)*.78;
    if(role==='T'||role==='corrupt')b.add(capG(1.34),red,0,hy,0,R*1.035,R*1.0,R*1.03,Math.PI,0,0).add(SPIKE,red,.2,hy-.12,-.25,.06,.2,.03,Math.PI-.3,.4,0);   // a red cloth over the lower face
    if(role==='T')b.add(cyl(w+.006,w-.006),red,0,1.1,0,1,.05,.78);
    if(role==='C'||role==='AB'){b.add(cyl(.105,.12),0xe8a33d,0,1.215,0,1,.075,.9).add(BX,0xe8a33d,.07,1.1,.13,.06,.2,.02,0,0,.12)}
    if(role==='R'){b.add(BX,0x9aa4a8,.09,1.03,z0(1.03)+.035,.07,.08,.01).add(BX,0x3f73c9,.075,1.08,z0(1.08)+.04,.012,.07,.012).add(BX,red,.105,1.08,z0(1.08)+.04,.012,.07,.012)}
    if(role==='J'){b.add(BX,0x23272c,0,.98,z0(.98)+.05,.17,.12,.09).add(cyl(.045,.045,12),0x5c9eea,0,.98,z0(.98)+.11,1,.05,1,Math.PI/2,0,0).add(BX,dk,-.09,1.12,z0(1.1)+.01,.012,.24,.012,0,0,.5).add(BX,dk,.09,1.12,z0(1.1)+.01,.012,.24,.012,0,0,-.5)}
    if(role==='I'){b.add(new T.OctahedronGeometry(1),gold,-.085,1.06,z0(1.06)+.035,.05,.05,.014).add(BX,mixC(top,.3),-.07,1.19,.12,.1,.035,.06,.5,0,-.6).add(BX,mixC(top,.3),.07,1.19,.12,.1,.035,.06,.5,0,.6).add(cyl(ws+.036,ws+.036),0x15181c,0,.78,0,1,.04,.82)}
    if(role==='F')b.add(cyl(ws+.05,ws+.06),gold,0,.8,0,1,.03,.82).add(BX,gold,.06,.7,(ws+.06)*.82,.02,.2,.02);
    if(role==='thief'){for(const y of [.82,.94,1.06,1.17]){const r=rAt(y)+.003;b.add(cyl(r,r-.003),dk,0,y,0,1,.06,.78)}b.add(SP,0x8a6a3a,0,.98,-.27,.2,.24,.17).add(cyl(.05,.08),0x8a6a3a,0,1.24,-.25,1,.1,1)}
    if(role==='cop'||role==='corrupt'){b.add(SP,gold,-.08,1.07,z0(1.07)+.035,.03,.035,.012).add(cyl(ws+.03,ws+.03),0x15181c,0,.775,0,1,.04,.82)}
    if(!role){const pcol=pc(top);
      if(pat===1)for(const y of [.84,.95,1.06,1.16]){const r=rAt(y)+.004;b.add(cyl(r,r-.004,24),pcol,0,y,0,1,.045,.78)}                       // stripes
      else if(pat===2){const yk='y'+sex+'|'+bd,yoke=pg[yk]||(pg[yk]=new T.LatheGeometry(TP.filter(q=>q[1]>=1.0).map(q=>new T.Vector2(q[0]*1.012,q[1])),48));b.add(yoke,pcol,0,0,0,1,1,.78)}   // a two-tone yoke over the shoulders
      else if(pat===3){const y=1.04,zf=z0(y)+.012;b.add(SP,pcol,0,y,zf,.085,.085,.012).add(SP,top,0,y,zf+.006,.05,.05,.01).add(SP,pcol,0,y,zf+.011,.022,.022,.008)}   // a round print on the chest
      const ac=PAL.top[(tc+4)%10];
      if(acc===2){b.add(capG(1.4),ac,0,hy+.012,-.01,R*1.1,R*1.08,R*1.1,-.12,0,0).add(SP,ac,0,hy+.2,.25,.2,.024,.19,-.22,0,0).add(SP,pc(ac),0,hy+.33,-.02,.03)}            // a baseball cap
      else if(acc===3){b.add(capG(1.3),ac,0,hy+.02,-.02,R*1.12,R*1.14,R*1.12,-.25,0,0).add(cyl(R*1.08,R*1.1,24),pc(ac),0,hy+.04,-.01,1,.06,1,-.25,0,0).add(SP,pc(ac),0,hy+.4,-.1,.065)}   // a knitted beanie with a pompom
      else if(acc===4){const sc=PAL.top[(tc+6)%10];b.add(RING,sc,0,1.235,.005,.095*bx+.02,.09*bx+.02,.075,Math.PI/2,0,0).add(BX,sc,.07,1.08,z0(1.08)+.04,.07,.22,.03,.1,0,.12).add(BX,pc(sc),.07,.975,z0(.975)+.045,.072,.03,.032,.1,0,.12)}   // a scarf
      else if(acc===5){const bc2=PAL.bot[(bc+3)%8];b.add(BX,bc2,0,1.0,-(ws*.78+.12),.3,.36,.16).add(BX,mixC(bc2,.25),0,.92,-(ws*.78+.205),.22,.14,.04);
        for(const sd of [-1,1])b.add(BX,mixC(bc2,.35),sd*.085,1.11,z0(1.11)+.012,.032,.26,.014,0,0,sd*.08)}                                      // a backpack and its straps
    }
    if(role==='AB'){be.add(new T.TorusGeometry(1,.1,12,48),0x7dffb0,0,hy+.5,0,.24,.24,.24,Math.PI/2,0,0).add(BX,0x7dffb0,0,1.02,z0(1.02)+.04,.16,.05,.012).add(BX,0x7dffb0,0,1.02,z0(1.02)+.04,.05,.16,.012)}
    B.done();HD.done();
    const face=new T.Mesh(FACE,faceM(faceTex(sex,EYE[hc],mixC(hair,hc===3||hc===5?.5:.25),fv),gh));face.position.set(0,hy-1.27,0);face.scale.set(R*1.012,R*.96*1.012,R*.97*1.012);if(id)face.userData.id=id;if(gh)face.renderOrder=1;head.add(face);
    // arms; the first one (the figure's right hand) carries whatever the identity holds
    let rolePose=null;
    const arms=[-1,1].map((sd,ai)=>{const G=new T.Group();G.position.set(sd*(w+.045),1.14-.66,0);G.scale.set(1+(bx-1)*.6,1,1+(bx-1)*.6);spine.add(G);
      const cuff=role||coat?mixC(top,.2):wh;
      return skinLimb(G,-.22,-.43,p=>{p.add(SPt,top,0,0,0,.068);
        if(sl)p.add(tubeG(.064,.056),top,0,-.11,0,1,.22,1).add(SPt,top,0,-.22,0,.056,.05,.056).add(tubeG(.056,.05),top,0,-.32,0,1,.2,1).add(tubeG(.055,.054),cuff,0,-.415,0,1,.032,1);
        else p.add(tubeG(.069,.064),top,0,-.07,0,1,.15,1).add(tubeG(.052,.047),skin,0,-.15,0,1,.16,1).add(SPt,skin,0,-.22,0,.048,.045,.048).add(tubeG(.047,.04),skin,0,-.32,0,1,.21,1);
        if(role==='thief'&&sl)for(const y of [-.1,-.24,-.36])p.add(tubeG(.066,.062),dk,0,y,0,1,.05,1)},
      p=>p.add(SPt,skin,0,-.05,.004,.047,.06,.036).add(SPt,skin,-sd*.014,-.028,.03,.018,.03,.017,-.5,0,0),       // a mitten hand and its thumb
      role&&ai===0?(p,L)=>{{const y=-.09;
        if(role==='T'){p.add(SP,0x111315,0,y-.1,.02,.13).add(cyl(.02,.02,6),0xd9c48a,0,y+.05,.02,1,.1,1);L.e.add(SP,0xff8a2a,0,y+.11,.02,.04)}
        else if(role==='R'){p.add(cyl(.035,.035,10),0xcfe9ef,0,y+.02,.02,1,.12,1);L.e.add(cyl(.045,.12,12),0x6fe08a,0,y-.11,.02,1,.16,1)}
        else if(role==='I'||role==='cop')p.add(BX,0x15181c,0,y-.03,.08,.05,.09,.22);
        else if(role==='F'){p.add(cyl(.035,.035,10),0xf2ecd8,0,y+.04,.02,1,.26,1);L.e.add(SP,0xffb347,0,y+.21,.02,.04,.06,.04)}
        else if(role==='corrupt')p.add(BX,0x4fbf6a,0,y-.02,.05,.2,.03,.11).add(BX,0x6fdc8a,0,y+.01,.05,.2,.03,.11,0,.3,0);
        else if(role==='J')p.add(BX,wh,0,y-.02,.04,.13,.17,.015).add(BX,0x9aa4a8,0,y+.05,.05,.1,.012,.016);
        rolePose=role==='T'||role==='thief'?{sx:-.25,e:-.35}:role==='C'||role==='AB'?{sx:-2.55,e:-.3}:{sx:-.55,e:-1.05}}}:null)});
    return{g,hips,spine,head,arms,legs,inks,rolePose,sd:[-1,1]};
  }
  function roleHuman(key,opt){const o=opt||{};return human(o.look||A.LOOKS[key==='thief'?2:0][1],null,{role:key,ghost:o.ghost,color:o.color})}
  function roleFigure(key,opt){const H=roleHuman(key,opt);rigPose(H,{w:0,ph:0,t:0,gi:-1,mode:''},10);return H.g}
  /* ---------- body language: a pose (hips, spine, head, both arms, both legs) eased towards a target, with the walk cycle laid on top ----------
     signs: spine sx > 0 bends forward; arm ax < 0 lifts the arm forward, az swings it out to the side (right arm -, left arm +), ae < 0 bends the elbow;
     leg lx < 0 lifts the thigh forward, lk > 0 bends the knee; the ankle keeps the foot flat on its own */
  const REST={hy:0,hx:0,sx:0,sy:0,sz:0,nx:0,ny:0,a0x:0,a0z:-.09,a0e:-.14,a0w:0,a1x:0,a1z:.09,a1e:-.14,a1w:0,l0x:0,l0k:0,l1x:0,l1k:0};
  // what each of the 12 actions does with the body (right arm = a0); ph = seconds, for the moving ones
  const GPOSE=[
    (P)=>{P.a0x=-.35;P.a0z=-.6;P.a0e=-1.75;P.sy=-.12;P.ny=-.25},                                                           // 挽手臂: hook your arm
    (P)=>{P.a0x=-2.05;P.a0z=-.18;P.a0e=-.45;P.a0w=.35;P.sz=.05;P.ny=-.1},                                                 // 搭肩: hand on the shoulder
    (P)=>{P.a0x=-1.55;P.a0z=.1;P.a0e=-.04;P.a1x=-1.3;P.a1z=-.32;P.a1e=-.8;P.sy=.12;P.ny=-.08},                            // 比槍: arm out, the other hand steadies it
    (P)=>{P.a0x=-1.12;P.a0z=.12;P.a0e=-.55;P.a1x=-1.12;P.a1z=-.12;P.a1e=-.55;P.sx=.08;P.nx=.12},                          // 遞東西: both hands forward
    (P,ph)=>{P.sx=.62+.06*Math.sin(ph*3);P.nx=.25;P.a0x=-.58;P.a1x=-.58;P.a0e=-.08;P.a1e=-.08;P.a0z=-.04;P.a1z=.04},       // 鞠躬: bend at the waist
    (P,ph)=>{P.a0x=-.95;P.a0e=-1.0+.45*Math.sin(ph*8);P.a0w=.3*Math.sin(ph*8);P.a1x=-.3;P.a1e=-.7;P.nx=.08},               // 猜拳: the forearm pumps
    (P,ph)=>{P.a0x=-1.42;P.a0z=-.25;P.a0e=-.35;P.a0w=.5*Math.sin(ph*14);P.ny=-.12},                                       // 拍背: the wrist pats
    (P)=>{P.hy=-.17;P.l0x=-1.45;P.l1x=-1.45;P.l0k=1.45;P.l1k=1.45;P.a0x=-.55;P.a1x=-.55;P.a0e=-.8;P.a1e=-.8;P.sx=-.06},   // 坐下: knees at a right angle, hands on the thighs
    (P,ph)=>{P.a0x=-2.3;P.a0z=-.1;P.a0e=-.35;P.a0w=.4*Math.sin(ph*3);P.nx=-.25;P.a1x=-.2},                                // 倒放書本: reach up to the shelf
    (P,ph)=>{P.a0x=-1.25+.25*Math.sin(ph*6);P.a0e=-.35;P.nx=.1},                                                           // 投信: push the letter in
    (P,ph)=>{P.a0x=-1.05;P.a0e=-.95;P.a0w=.45+.25*Math.sin(ph*4);P.a1x=-.65;P.a1e=-1.2;P.nx=.15},                          // 倒茶: tip the pot, the other hand holds the cup
    (P)=>{P.a0x=-1.95;P.a0z=-.15;P.a0e=-.5;P.a0w=-.3;P.nx=-.1}];                                                           // 關燈: flip the switch
  // o = {w: walking 0..1, ph: stride phase, t: seconds, gi: action or -1, mode: ''|ghost|cheer|slump, look: head yaw towards a speaker or null, talk}
  function rigPose(R,o,dt){
    const c=R.cur||(R.cur=Object.assign({},REST)),sd=R.seed==null?(R.seed=Math.random()*60):R.seed,t=o.t+sd,live=still?0:1,idle=live*(1-Math.min(1,o.w*1.4)),P=Object.assign({},REST);
    // standing still is never quite still: breathing, the weight moving from foot to foot, a look around
    const sh=Math.sin(t*.37);
    P.sx=.022*Math.sin(t*1.6)*idle;P.sz=.035*sh*idle;P.hx=.02*sh*idle;
    P.a0x=.045*Math.sin(t*1.6+.6)*idle;P.a1x=.045*Math.sin(t*1.6+1.1)*idle;P.a0e-=.05*idle*Math.max(0,Math.sin(t*.9));P.a1e-=.05*idle*Math.max(0,Math.sin(t*.9+2));
    P.l0k=.13*idle*Math.max(0,sh);P.l1k=.13*idle*Math.max(0,-sh);P.l0x=-P.l0k*.45;P.l1x=-P.l1k*.45;
    P.ny=o.look!=null?o.look:.4*idle*Math.sin(t*.21)*Math.sin(t*.13+1);P.nx=.05*Math.sin(t*.5)*idle;
    if(o.talk)P.nx+=.06*Math.sin(o.t*9)*live;
    if(R.rolePose){P.a0x=R.rolePose.sx;P.a0e=R.rolePose.e}
    if(o.mode==='ghost'){P.hy=.14+.06*Math.sin(t*1.3)*live;P.a0x=P.a1x=-.3;P.a0e=P.a1e=-.55;P.a0z=-.38;P.a1z=.38;P.l0x=-.25;P.l1x=.08;P.l0k=.45;P.l1k=.3;P.nx=.18}
    else if(o.mode==='cheer'){const j=Math.abs(Math.sin(t*4))*live;P.hy=.06*j;P.a0x=P.a1x=-2.75;P.a0z=-.38;P.a1z=.38;P.a0e=P.a1e=-.25-.4*j;P.nx=-.18;P.l0k=P.l1k=.3*(1-j);P.l0x=P.l1x=-.12*(1-j)}
    else if(o.mode==='slump'){P.sx=.2;P.nx=.42;P.a0z=-.03;P.a1z=.03;P.a0e=P.a1e=-.04;P.ny=0}
    if(o.gi>=0&&GPOSE[o.gi])GPOSE[o.gi](P,live?o.t:0);
    const k=1-Math.exp(-dt*(o.gi>=0?9:7));for(const key in P)c[key]+=(P[key]-c[key])*k;   // ease every joint towards its target: no snapping between poses
    // the walk: thighs swing, the knee folds as the leg swings through, arms swing against the legs with a soft elbow, shoulders twist against the hips, the body bobs
    const w=o.w*live,ph=o.ph,s0=Math.sin(ph),s1=-s0,c0=Math.cos(ph),c1=-c0;
    const L0=-.56*w*s0,L1=-.56*w*s1,K0=w*(.12+.95*Math.pow(Math.max(0,c0),1.3)),K1=w*(.12+.95*Math.pow(Math.max(0,c1),1.3));
    const tw=.13*w*s0,bob=-.045*w*Math.abs(s0)+.012*w,lean=.08*w;
    R.hips.position.set(c.hx,c.hy+bob,0);R.spine.rotation.set(c.sx+lean,c.sy+tw,c.sz);R.head.rotation.set(c.nx-lean*.6,c.ny-tw*.75,0);
    const A=R.arms,Lg=R.legs;
    A[0].b0.rotation.set(c.a0x-.48*w*s1,0,c.a0z);A[0].b1.rotation.x=c.a0e-w*(.18+.38*Math.max(0,s1));A[0].b2.rotation.x=c.a0w;
    A[1].b0.rotation.set(c.a1x-.48*w*s0,0,c.a1z);A[1].b1.rotation.x=c.a1e-w*(.18+.38*Math.max(0,s0));A[1].b2.rotation.x=c.a1w;
    const lx0=c.l0x+L0,lk0=c.l0k+K0,lx1=c.l1x+L1,lk1=c.l1k+K1;
    Lg[0].b0.rotation.x=lx0;Lg[0].b1.rotation.x=lk0;Lg[0].b2.rotation.x=-(lx0+lk0)*.85-.2*w*Math.max(0,c0);   // the ankle keeps the sole level; toes lift as the foot swings through
    Lg[1].b0.rotation.x=lx1;Lg[1].b1.rotation.x=lk1;Lg[1].b2.rotation.x=-(lx1+lk1)*.85-.2*w*Math.max(0,c1);
  }
  // how fast a figure is walking (0..1) and where its stride is, from how far it moved this frame; turning on the spot takes small steps
  function stride(f,mv,dt,rot){const sp=Math.min(1,mv/Math.max(dt,1e-3)/SPEED);f.spd=(f.spd||0)+(sp-(f.spd||0))*Math.min(1,dt*9);
    let dr=rot-(f.lr==null?rot:f.lr);dr=Math.atan2(Math.sin(dr),Math.cos(dr));f.lr=rot;const turn=Math.min(.45,Math.abs(dr)/Math.max(dt,1e-3)*.1);
    f.trn=(f.trn||0)+(turn-(f.trn||0))*Math.min(1,dt*8);f.ph=(f.ph||0)+mv/.62*Math.PI+Math.abs(dr)*1.3;return Math.max(f.spd,f.trn)}
  let thR=null,thS=null,thC=null;
  api.palette=PAL;
  let pvR=null,pvS=null,pvC=null,pvH=null,pvKey='',pvRaf=0,pvT0=0;
  api.preview=(host,look)=>{try{
    if(!pvR){pvR=new T.WebGLRenderer({antialias:true,alpha:true});pvR.setPixelRatio(Math.min(2,window.devicePixelRatio||1));pvS=new T.Scene();pvS.add(new T.HemisphereLight(0xffffff,0x55606a,1.05));
      const d=new T.DirectionalLight(0xffffff,.55);d.position.set(2,4,5);pvS.add(d);pvC=new T.PerspectiveCamera(28,.75,.1,20);pvC.position.set(1.1,1.45,4.9);pvC.lookAt(0,1.0,0);pvR.domElement.className='pvcanvas'}
    const cv2=pvR.domElement;if(cv2.parentNode!==host){host.innerHTML='';host.appendChild(cv2)}
    const w=host.clientWidth||96,h=host.clientHeight||128;pvR.setSize(w,h,false);pvC.aspect=w/h;pvC.updateProjectionMatrix();
    const key=JSON.stringify(look);if(key!==pvKey){pvKey=key;if(pvH){pvS.remove(pvH.g);freeTree(pvH.g)}pvH=human(look,null,null);pvH.g.rotation.y=.35;pvS.add(pvH.g);
      pvH.g.traverse(o=>{if(o.isMesh)o.userData.free=Object.assign({g:1},o.userData.free||{})})}
    if(!pvRaf){let last=0;const loop=t=>{if(!cv2.isConnected||!pvH){pvRaf=0;return}pvRaf=requestAnimationFrame(loop);const dt=Math.min(.1,(t-last)/1000||0);last=t;
      rigPose(pvH,{w:0,ph:0,t:t/1000,gi:-1,mode:''},dt);pvH.g.rotation.y=.35+Math.sin(t/2600)*.25;pvR.render(pvS,pvC)};pvRaf=requestAnimationFrame(loop)}
    return true}catch(e){return false}};
  // tests and review: one figure in one pose, as an image (o = rigPose options, run for a second so the easing settles; side = view from the side)
  api.poseShot=(look,o,w,h,side,role)=>{try{api.thumb(look,8,8);const H=human(look,null,role?{role}:null);for(let i=0;i<40;i++)rigPose(H,Object.assign({w:0,ph:0,t:i*.025,gi:-1,mode:''},o,{t:(o.t||0)+i*.025}),.025);
    H.g.rotation.y=side?Math.PI/2.4:.3;thS.add(H.g);thR.setSize(w,h,false);thC.aspect=w/h;thC.updateProjectionMatrix();thC.position.set(1.3,1.45,5.2);thC.lookAt(0,.95,0);
    thR.render(thS,thC);const url=thR.domElement.toDataURL('image/png');thS.remove(H.g);freeTree(H.g);return url}catch(e){return'ERR '+e.message}};
  api.thumb=(look,w,h,role)=>{try{                                   // a small portrait of a look, as an image
    if(!thR){thR=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});thS=new T.Scene();thS.add(new T.HemisphereLight(0xffffff,0x55606a,1.05));
      const d=new T.DirectionalLight(0xffffff,.55);d.position.set(2,4,5);thS.add(d);thC=new T.PerspectiveCamera(28,1,.1,20)}
    thR.setPixelRatio(1);thR.setSize(w,h,false);thC.aspect=w/h;thC.updateProjectionMatrix();thC.position.set(1.3,1.5,4.6);thC.lookAt(0,1.02,0);
    const H=human(look,null,role?{role}:null),f=H.g;rigPose(H,{w:0,ph:0,t:0,gi:-1,mode:''},10);f.rotation.y=.3;thS.add(f);thR.render(thS,thC);const url=thR.domElement.toDataURL('image/png');thS.remove(f);f.traverse(o=>{if(o.isMesh&&o.geometry!==FACE)o.geometry.dispose()});return url}catch(e){return''}};

  /* ---------- 感染戰: a building to walk around (2 halls + 6 rooms) ---------- */
  const M=A.MAP,spawnOf=A.spawnOf;
  // how each action looks: [arm raise, motion, prop]. 0-6 gestures, 7 sitting, 8-11 using the building
  const GL=[[.9,'side',''],[1.9,'still',''],[1.57,'still','gun'],[1.3,'still','box'],[.25,'bow',''],[1.4,'rps',''],[1.7,'pat',''],
    [0,'sit',''],[1.9,'pat',''],[1.3,'thrust','box'],[1.3,'clink','cup'],[2.3,'still','']];
  const ACTN={book:'倒放書本',letter:'投信',tea:'倒茶',light:'關燈'};
  const PZ=M.size+9;let wasOver=false;
  // the curtain call: everybody on shelves facing the camera, in whatever grid fills the screen best
  function lineSpot(i,n){let cols=1,bs=0;for(let c=1;c<=n;c++){const sc=Math.min(cam.aspect/(c*1.3),1/(Math.ceil(n/c)*2.95));if(sc>bs+1e-6){bs=sc;cols=c}}
    const rows=Math.ceil(n/cols),row=Math.floor(i/cols),inRow=Math.min(cols,n-row*cols);
    return{x:(i%cols-(inRow-1)/2)*1.3,y:(rows-1-row)*2.95,z:PZ,cols,rows}}
  let env={dark:[],books:[],lockers:[]},eo={books:{},flags:{},dark:{},plates:{},signs:[]},seated=false,prog=null,nearKey='',nearT=0,camD=4.6;
  let signTex=null,boardTex=null;const bookTex={};          // pictures that never change between games are painted once
  function buildRoom(S){
    clear();const n=S.players.length,g=S.g;eo={books:{},flags:{},dark:{},plates:{},signs:[]};env={dark:[],books:[],lockers:[]};seated=false;prog=null;nearKey='';
    const K=Art.kit(),P=Art.place,rb=(w,h,d,r,k)=>Art.rbox(w,h,d,r,Math.max(w,h,d)>1.2?3:2),lathe=Art.lathe,SPH=Art.sphere(24,18),CYL=Art.cylinder(.5,.5,32);   // rounded edges get several bevel steps so corners read as smooth
    // static pieces are merged per material and per room, so a room out of view costs nothing and a room in view costs a few draw calls
    const MATS={wood:Art.lambert(K.wood),paint:Art.lambert(K.paint),fabric:Art.lambert(K.fabric),glow:new T.MeshBasicMaterial({vertexColors:true})},SC={wood:1.2,paint:1.5,fabric:.5,glow:1};
    const Bk={},near=(x,y)=>Math.min(1,.7+y*1.2);                                   // pieces get darker where they meet the floor
    const put=(k,geo,color,m,o)=>{const rid=A.roomOf(m.elements[12],m.elements[14])||'out',key=k+'|'+rid;(Bk[key]||(Bk[key]=Art.Batch())).add(geo,color,m,Object.assign({s:SC[k],ao:k==='glow'?null:near},o||{}));return m};
    // ---- floors: every room gets its own painted floor with rugs, light pools and soft shadows under the furniture
    const tb=M.table,lg=M.lounge,sh=M.shelf,lk=M.lockers,tt=M.tea,D=M.deco;
    const FL={round:{kind:'stone',base:0x3b5763,tile:1.1},lounge:{kind:'planks',base:0x7a5638},library:{kind:'planks',base:0x6a4a30},locker:{kind:'tiles',base:0x6d7a84,tile:.5},
      tea:{kind:'checker',base:0xd5cdb2,alt:0x8aa58a,tile:.5},music:{kind:'carpet',base:0x4a3346,alt:0xc9a85a,grain:.22},store:{kind:'concrete',base:0x6a665c},clinic:{kind:'tiles',base:0x7fa6a2,tile:.42},corr:{kind:'stone',base:0x5a6068,tile:.8}};
    const lights={round:[[tb.x,tb.z,6.5,.32]],lounge:[[lg.x,lg.z,6.5,.3]]},shades={round:[[tb.x,tb.z+.15,2.6,2.6,.5]],lounge:M.benches.map(b=>{const along=Math.abs(Math.sin(b.r))>.5;return[b.x,b.z,along?.6:2.3,along?2.3:.6,.4]}),
      library:[[sh.x,sh.z-.5,2.6,.5,.5],[-15.2,-11.2,1.0,1.0,.45]],locker:[[lk.x,lk.z-.45,2.4,.5,.5]],tea:[[tt.x,tt.z,1.1,1.1,.5],[11.5,-16.5,2.8,.5,.4]],
      music:[[D.piano.x,D.piano.z,1.3,1.1,.5]],clinic:[[D.bed.x,D.bed.z,.9,1.3,.5],[7.2,16.2,.5,.4,.4],[M.scanner.x,M.scanner.z,.7,.6,.5]],store:[[D.crates.x+.2,D.crates.z,1.3,1.3,.55],[-13.4,16.2,.55,.55,.45]]};
    const rugs={round:[{x:tb.x,z:tb.z,r:3.1,c:0x6b2b33,c2:0xd9b86a}],lounge:[{x:lg.x,z:lg.z,r:2.5,c:0x3d4f6b,c2:0xc9b78a}],library:[{x:-14.6,z:-11.6,r:1.6,c:0x5d4632,c2:0xc8a46a}]};
    M.rooms.forEach((r,ri)=>{const w=r.x1-r.x0,d=r.z1-r.z0,lx=w>d,cf=Object.assign({},FL[r.id]),li=([x,z,rad,a])=>({x:x-r.x0,z:z-r.z0,r:rad,a}),sd=([x,z,rx,rz,a])=>({x:x-r.x0,z:z-r.z0,rx,rz,a});
      cf.w=w;cf.d=d;cf.seed=ri+3;
      if(r.corr){cf.runner=lx?{x0:.3,z0:d/2-.75,x1:w-.3,z1:d/2+.75,c:0x7a2f38}:{x0:w/2-.75,z0:.3,x1:w/2+.75,z1:d-.3,c:0x7a2f38};cf.open=!lx;
        cf.light=[];const len=lx?w:d;for(let k=0,nl=Math.round(len/6);k<nl;k++){const t=(k+.5)/nl;cf.light.push(lx?{x:w*t,z:d/2,r:2.6,a:.3}:{x:w/2,z:d*t,r:2.6,a:.3})}}
      else{cf.light=(lights[r.id]||[[(r.x0+r.x1)/2,(r.z0+r.z1)/2,Math.max(w,d)*.55,.24]]).map(li);cf.shade=(shades[r.id]||[]).map(sd);
        cf.rug=(rugs[r.id]||[]).map(q=>({x:q.x-r.x0,z:q.z-r.z0,r:q.r,c:q.c,c2:q.c2}))}
      const f=own(new T.Mesh(new T.PlaneGeometry(w,d),Art.lambert(Art.floorTex(cf),{vertexColors:false})),1,1,0);f.rotation.x=-Math.PI/2;f.position.set((r.x0+r.x1)/2,r.corr?.003*ri:0,(r.z0+r.z1)/2);root.add(f);
      if(!r.hall&&!r.corr){const dk=new T.Mesh(new T.BoxGeometry(w-.24,2.7,d-.24),new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.66,side:T.DoubleSide,depthWrite:false}));
        own(dk,1,1);dk.position.set((r.x0+r.x1)/2,1.36,(r.z0+r.z1)/2);dk.visible=false;dk.renderOrder=3;root.add(dk);eo.dark[r.id]=dk}});
    // the ground outside and the round stage used for the final line-up
    const og=Art.Batch(),gp=new T.PlaneGeometry(1,1);gp.rotateX(-Math.PI/2);og.add(gp,0x22302e,P(0,-.03,0,0,0,0,150,1,150),{s:3});
    og.add(Art.disc(7,.14,56),0x4a3a2c,P(0,-.14,PZ),{s:1.2});og.add(Art.disc(6.2,.04,56),0x6b2b33,P(0,-.035,PZ),{s:.5});root.add(own(og.mesh(MATS.paint),1));
    // ---- walls: papered, tinted after the room on each side, darker near the floor; a wooden cap on top and frames round every doorway
    const WALLC={round:0x9fb6c0,lounge:0xc7b29a,library:0xb59f86,locker:0xa7b3bb,tea:0xc5d2b8,music:0xb6a0b8,store:0xb3aa98,clinic:0xd6e6e4,corr:0xbdb4a8},wb=Art.Batch(),cap=Art.Batch();
    const wallCol=(x,y,z,nv)=>WALLC[A.roomOf(x+nv.x*.3,z+nv.z*.3)]||0x8a8378;
    for(const w of M.walls){const gaps=M.doors.filter(d=>d.ax===w.ax&&d.c===w.c&&d.p>w.a&&d.p<w.b).sort((a,b)=>a.p-b.p);let at=w.a;const segs=[];
      for(const d of gaps){segs.push([at,d.p-d.w/2]);at=d.p+d.w/2}segs.push([at,w.b]);
      for(const [a,b] of segs){const len=b-a;if(len<.05)continue;const c=(a+b)/2,m=w.ax==='x'?P(c,1.3,w.c):P(w.c,1.3,c,Math.PI/2);
        wb.add(rb(len,2.6,.2,.035,1),0xffffff,m,{s:[1.3,2.6],cf:wallCol,ao:(x,y)=>Math.min(1,.62+y*.5)});
        cap.add(rb(len+.04,.07,.28,.03,1),0x4a3424,w.ax==='x'?P(c,2.63,w.c):P(w.c,2.63,c,Math.PI/2),{s:1.2})}}
    for(const d of M.doors)for(const sd of [-1,1]){const m=d.ax==='x'?P(d.p+sd*(d.w/2+.02),1.32,d.c):P(d.c,1.32,d.p+sd*(d.w/2+.02),Math.PI/2);cap.add(rb(.12,2.64,.3,.04,1),0x5a4030,m,{s:1.2})}
    root.add(own(wb.mesh(Art.lambert(K.wall)),1,1));root.add(own(cap.mesh(MATS.wood),1));
    // ---- door signs: a wooden board standing on the wall above each doorway, painted on both faces
    const names=[...new Set(M.rooms.filter(r=>!r.corr).map(r=>r.n))],RH=128;
    if(!signTex){const atlas=Art.canvas(512,RH*8),ax=atlas.getContext('2d');names.forEach((nm,i)=>{const y=i*RH;ax.fillStyle='#3a281b';ax.fillRect(0,y,512,RH);const gr=ax.createLinearGradient(0,y,0,y+RH);gr.addColorStop(0,'#5a3f2a');gr.addColorStop(1,'#3a281b');ax.fillStyle=gr;
      ax.beginPath();ax.roundRect?ax.roundRect(10,y+10,492,RH-20,18):ax.rect(10,y+10,492,RH-20);ax.fill();ax.strokeStyle='#d9b86a';ax.lineWidth=4;ax.stroke();
      ax.font='900 64px "Noto Serif TC","Songti TC",serif';ax.textAlign='center';ax.textBaseline='middle';ax.fillStyle='#f1cf63';ax.shadowColor='rgba(0,0,0,.6)';ax.shadowBlur=6;ax.fillText(nm,256,y+RH/2+3);ax.shadowBlur=0});signTex=Art.texture(atlas,false)}
    const signM=new T.MeshLambertMaterial({map:signTex,vertexColors:true}),SG=new T.PlaneGeometry(1.36,.34);
    const sign=(nm,x,z,ry)=>{const i=names.indexOf(nm),v0=1-(i+1)/8,sb=Art.Batch(),base=P(0,0,0);
      sb.add(rb(1.5,.44,.1,.04,2),0xffffff,base,{uv:'own',uvt:[4/512,v0+4/1024,0,0]});
      for(const sd of [1,-1])sb.add(SG,0xffffff,P(0,0,sd*.052,sd>0?0:Math.PI,0,0,1,1,1,base),{uv:'own',uvt:[0,v0,1,1/8]});
      for(const px of [-.55,.55])sb.add(CYL,0x2a1e14,P(px,-.19,0,0,0,0,.05,.16,.05,base));
      const m=own(sb.mesh(signM),1,1,0);m.position.set(x,2.86,z);m.rotation.y=ry;root.add(m);eo.signs.push(m)};
    for(const d of M.doors){
      if(d.ax==='z'){const r=M.rooms.find(r=>r.hall&&(r.x0===d.c||r.x1===d.c));if(r)sign(r.n,d.c,d.p,Math.PI/2);continue}
      const r=M.rooms.find(r=>!r.corr&&d.p>r.x0&&d.p<r.x1&&(r.z0===d.c||r.z1===d.c));if(!r)continue;sign(r.n,d.p,d.c,0);
      if(!r.hall){const sw=M.switches[r.id],pz=d.c+(r.z1===d.c?-.13:.13);const pl=new T.Mesh(rb(.2,.3,.06,.025,2),new T.MeshLambertMaterial({color:0xf1cf63,emissive:0xa87a10}));own(pl,0,1);pl.position.set(sw.x,1.3,pz);root.add(pl);eo.plates[r.id]=pl}}
    // ---- lamps: shaded pendant lamps over the halls, small ones along the corridors
    const pendant=(x,z,y,s)=>{put('paint',lathe([[.02,.36],[.08,.34],[.3,.08],[.36,0],[.34,-.02],[.06,.3]],28),0x2b3d3a,P(x,y,z,0,0,0,s,s,s));put('glow',SPH,0xffe2b0,P(x,y+.02,z,0,0,0,.12*s,.12*s,.12*s));put('paint',CYL,0x1c1c1c,P(x,y+.36*s+1.5,z,0,0,0,.02,3,.02))};
    pendant(tb.x,tb.z,3.7,1.2);pendant(lg.x,lg.z,3.7,1.1);
    M.rooms.filter(r=>r.corr).forEach(r=>{const w=r.x1-r.x0,d=r.z1-r.z0,lx=w>d,len=lx?w:d;for(let k=0,nl=Math.round(len/6);k<nl;k++){const t=(k+.5)/nl;pendant(lx?r.x0+w*t:(r.x0+r.x1)/2,lx?(r.z0+r.z1)/2:r.z0+d*t,3.6,.6)}});
    M.rooms.filter(r=>!r.hall&&!r.corr).forEach(r=>pendant((r.x0+r.x1)/2,(r.z0+r.z1)/2,3.65,.8));
    // ---- potted plants: soft, leafy shapes in the corners
    const LEAF=Art.sphere(8,6),POT=lathe([[0,0],[.17,0],[.2,.04],[.24,.36],[.27,.4],[.27,.44],[.23,.44],[.22,.4],[0,.4]],22);
    const plant=(x,z,s,seed)=>{const r=Art.rng(seed);put('paint',POT,0xb0603c,P(x,0,z,0,0,0,s,s,s));put('paint',SPH,0x2e2216,P(x,.4*s,z,0,0,0,.22*s,.03*s,.22*s));
      for(let i=0;i<11;i++){const a=i/11*Math.PI*2+r(),tilt=.5+r()*.6,len=(.38+r()*.25)*s,cx=x+Math.sin(a)*Math.sin(tilt)*len*.6,cz=z+Math.cos(a)*Math.sin(tilt)*len*.6,cy=(.45+Math.cos(tilt)*len*.6)*1+.05;
        put('fabric',LEAF,i%3?0x3f8a4a:0x5aa85a,P(cx,cy*s,cz,a,tilt,0,.09*s,.04*s,len*.55))}
      put('fabric',SPH,0x4a9a52,P(x,.75*s,z,0,0,0,.16*s,.2*s,.16*s))};
    [[-16.3,-5.3],[-16.3,5.3],[-2.7,-5.3],[-2.7,5.3],[2.7,-5.3],[2.7,5.3],[16.4,-5.55],[16.4,5.55],[-5.2,16.2]].forEach(([x,z],i)=>plant(x,z,1.15,i+21));
    // ---- 圓桌廳: a turned round table on a pedestal
    put('wood',Art.disc(tb.r,.12,64),0x8a5a3a,P(tb.x,.88,tb.z));put('wood',Art.disc(tb.r-.12,.02,64),0xa8744a,P(tb.x,.995,tb.z));
    put('wood',lathe([[.62,0],[.6,.05],[.4,.1],[.2,.18],[.15,.4],[.19,.6],[.15,.75],[.3,.84],[.4,.88]],28),0x5a3a26,P(tb.x,0,tb.z));
    // ---- 交誼廳: slatted park benches with iron frames
    M.benches.forEach(b=>{const base=P(b.x,0,b.z,b.r);
      for(const z of [-.17,0,.17])put('wood',rb(4.0,.06,.15,.025,2),0x9a6b42,P(0,.46,z,0,0,0,1,1,1,base));
      for(const y of [.7,.88])put('wood',rb(4.0,.12,.05,.02,2),0x8a5d38,P(0,y,-.3,0,-.12,0,1,1,1,base));
      for(const x of [-1.8,0,1.8]){put('paint',rb(.07,.46,.07,.02,1),0x2a2c30,P(x,.23,.2,0,0,0,1,1,1,base));put('paint',rb(.07,1.0,.07,.02,1),0x2a2c30,P(x,.48,-.3,0,-.12,0,1,1,1,base));
        if(x)put('paint',rb(.07,.05,.56,.02,1),0x2a2c30,P(x,.66,-.04,0,0,0,1,1,1,base))}});
    // ---- 圖書室: a bookcase (one numbered book per seat) and a reading table
    const bc=sh.z-.55;put('wood',rb(.08,2.3,.5,.03,1),0x5a3a26,P(sh.x-2.32,1.15,bc));put('wood',rb(.08,2.3,.5,.03,1),0x5a3a26,P(sh.x+2.32,1.15,bc));
    put('wood',rb(4.7,2.3,.04,.015,1),0x4a3020,P(sh.x,1.15,bc-.21));put('wood',rb(4.8,.09,.56,.035,1),0x6a4630,P(sh.x,2.32,bc));put('wood',rb(4.7,.14,.5,.03,1),0x4a3020,P(sh.x,.07,bc));
    for(const y of [.47,1.22,1.97])put('wood',rb(4.6,.05,.46,.02,1),0x6a4630,P(sh.x,y,bc));
    {const r=Art.rng(5);for(let x=sh.x-2.1;x<sh.x+2.1;x+=.13+r()*.06){const h=.3+r()*.16;put('paint',rb(.11,h,.24,.02,1),[0x7a3b33,0x2f4a6b,0x3d6b4a,0x8a6a3a,0x5a3d6b][Math.floor(r()*5)],P(x,1.995+h/2,bc+.05,0,0,(r()-.5)*.12))}}
    const HUE=[0x6b8fb5,0x7fb58a,0xc28a5e,0xa97fb5,0xc2a85e,0x5eb5ac,0xb56b7e,0x8a93b5],bookG=rb(.3,.52,.22,.035,2);
    for(let i=1;i<=n;i++){const col=(i-1)%8,row=Math.floor((i-1)/8),x=sh.x-1.75+col*.5,y=1.52-row*.75;
      if(!bookTex[i]){const c=Art.canvas(64,128),bx=c.getContext('2d');bx.fillStyle='#f4efe4';bx.fillRect(0,0,64,128);bx.fillStyle='rgba(0,0,0,.18)';bx.fillRect(0,14,64,6);bx.fillRect(0,108,64,6);
      bx.fillStyle='#fffaf0';bx.beginPath();bx.arc(32,62,22,0,7);bx.fill();bx.strokeStyle='rgba(0,0,0,.35)';bx.lineWidth=2;bx.stroke();bx.font='900 30px "Noto Sans TC",sans-serif';bx.textAlign='center';bx.textBaseline='middle';bx.fillStyle='#1b2126';bx.fillText(String(i),32,64);Art.grain(bx,64,128,.25);bookTex[i]=Art.texture(c,false)}
      const bk=own(new T.Mesh(bookG,new T.MeshLambertMaterial({color:HUE[col],map:bookTex[i]})),0,1,0);bk.position.set(x,y,sh.z-.42);bk.userData.base=HUE[col];root.add(bk);eo.books[i]=bk}
    put('wood',Art.disc(.62,.06,40),0x7a5232,P(-15.2,.74,-11.2));put('wood',lathe([[.3,0],[.26,.04],[.07,.1],[.06,.6],[.12,.74]],18),0x5a3a26,P(-15.2,0,-11.2));
    put('paint',lathe([[.1,0],[.1,.02],[.03,.05],[.025,.3],[.14,.3],[.2,.45],[.08,.48]],18),0x2f4a3a,P(-15.0,.8,-11.1));put('glow',SPH,0xffe2b0,P(-15.0,1.16,-11.1,0,0,0,.05,.05,.05));
    // ---- 置物間: a bank of lockers, numbers, vents and handles painted on their doors
    const lz=lk.z-.6,rows=Math.ceil(n/8),dc=Art.canvas(1024,512),dx=dc.getContext('2d'),mapX=x=>(x-(lk.x-2))/4*1024,mapY=y=>(2.0-y)/1.9*512;
    for(let i=1;i<=n;i++){const col=(i-1)%8,row=Math.floor((i-1)/8),x=lk.x-1.75+col*.5,y=1.55-row*.95;
      put('paint',rb(.46,.86,.4,.04,2),i%2?0x5a7488:0x6a8496,P(x,y,lz));
      const X=mapX(x),Y=mapY(y),pw=.46/4*1024,ph=.86/1.9*512;dx.fillStyle='rgba(0,0,0,.3)';for(let k=0;k<4;k++)dx.fillRect(X-pw*.3,Y-ph*.38+k*9,pw*.6,4);
      dx.fillStyle='#f4efe4';dx.beginPath();dx.roundRect?dx.roundRect(X-42,Y-ph*.08,84,58,10):dx.rect(X-42,Y-ph*.08,84,58);dx.fill();dx.font='900 46px "Noto Sans TC",sans-serif';dx.textAlign='center';dx.textBaseline='middle';dx.fillStyle='#1b2126';dx.fillText(String(i),X,Y-ph*.08+31);
      dx.fillStyle='#c8ccd0';dx.fillRect(X+pw*.3,Y+ph*.12,6,34);
      const fl=new T.Mesh(rb(.16,.2,.05,.02,1),new T.MeshLambertMaterial({color:0xe2594c,emissive:0x8a1f14}));own(fl,0,1);fl.position.set(x+.12,y-.2,lk.z-.37);fl.visible=false;root.add(fl);eo.flags[i]=fl}
    put('paint',rb(4.2,.1,.46,.03,1),0x3a4650,P(lk.x,.05,lz));if(rows<2)put('paint',rb(4.1,.06,.42,.02,1),0x3a4650,P(lk.x,1.09,lz));
    const decal=own(new T.Mesh(new T.PlaneGeometry(4,1.9),new T.MeshLambertMaterial({map:Art.texture(dc,false),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})),1,1,1);decal.position.set(lk.x,1.05,lz+.205);root.add(decal);
    // ---- 茶水間: a round tea table with a pot and cups, and a counter
    put('fabric',Art.disc(.72,.06,40),0xe8dcc4,P(tt.x,.8,tt.z));put('wood',lathe([[.35,0],[.3,.05],[.08,.12],[.07,.7],[.2,.8]],20),0x5a3a26,P(tt.x,0,tt.z));
    put('paint',lathe([[0,0],[.1,0],[.16,.06],[.18,.14],[.15,.22],[.07,.26],[.075,.28],[0,.29]],24),0x3f9d90,P(tt.x,.86,tt.z));
    put('paint',CYL,0x3f9d90,P(tt.x+.2,.99,tt.z,0,0,-.9,.05,.22,.05));put('paint',Art.torus(.08,.018,Math.PI*1.2),0x2f7d72,P(tt.x-.17,1.02,tt.z,Math.PI/2,0,Math.PI/2-.3));put('paint',SPH,0x2f7d72,P(tt.x,1.17,tt.z,0,0,0,.035,.035,.035));
    for(const a of [.6,2.4,4.2]){const cx=tt.x+Math.cos(a)*.45,cz=tt.z+Math.sin(a)*.45;put('paint',lathe([[0,0],[.04,0],[.05,.02],[.055,.08],[.05,.08],[.04,.02],[0,.02]],16),0xf4efe4,P(cx,.86,cz));put('paint',Art.disc(.08,.01,20),0xf4efe4,P(cx,.86,cz))}
    put('wood',rb(5,.88,.6,.05,2),0x7a5232,P(11.5,.44,-16.6));put('paint',rb(5.1,.05,.66,.02,1),0xd8d4cc,P(11.5,.905,-16.6));
    put('paint',lathe([[0,0],[.1,0],[.11,.18],[.06,.24],[0,.25]],18),0xc0c4c8,P(10,.93,-16.6));for(let i=0;i<3;i++)put('paint',lathe([[0,0],[.06,0],[.065,.18],[.05,.2],[0,.2]],14),[0xc28a5e,0x8aa58a,0xe2b93b][i],P(12.4+i*.25,.93,-16.65));
    // ---- 音樂室: a grand piano with an open lid and a stool
    const pz=D.piano,shape=new T.Shape();shape.moveTo(-.75,-.55);shape.lineTo(.75,-.55);shape.lineTo(.75,.2);shape.bezierCurveTo(.75,.75,.25,.6,.05,.95);shape.bezierCurveTo(-.15,1.25,-.75,1.15,-.75,.9);shape.lineTo(-.75,-.55);
    const body=new T.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:3,curveSegments:24});body.rotateX(Math.PI/2);
    const pc=pz.z-.35,kz=pc-.66;put('paint',body,0x17181c,P(pz.x,1.05,pc));const lid=new T.ExtrudeGeometry(shape,{depth:.02,bevelEnabled:false,curveSegments:24});lid.rotateX(Math.PI/2);lid.translate(.75,0,0);put('paint',lid,0x22242a,P(pz.x-.75,1.09,pc,0,0,.7));
    put('paint',CYL,0x101114,P(pz.x+.35,1.25,pc+.35,0,0,.35,.015,.45,.015));
    for(const [x,z] of [[-.6,-.4],[.6,-.4],[-.3,.95]])put('paint',lathe([[.05,0],[.06,.1],[.045,.4],[.07,.72],[.09,.75]],14),0x17181c,P(pz.x+x,0,pc+z));
    put('paint',rb(1.5,.06,.2,.02,1),0xf4f1ea,P(pz.x,.83,kz));for(let i=0;i<15;i++)if(i%7!==2&&i%7!==6)put('paint',rb(.05,.03,.11,.01,1),0x101114,P(pz.x-.69+i*.1,.87,kz+.04));
    put('fabric',rb(.7,.1,.36,.04,2),0x5a2f3a,P(pz.x,.5,kz-.5));for(const sx of [-.28,.28])for(const sz of [-.13,.13])put('paint',rb(.05,.45,.05,.015,1),0x17181c,P(pz.x+sx,.22,kz-.5+sz));
    // ---- 醫務室: a hospital bed with a pillow and blanket, and a cabinet
    const bd=D.bed;for(const [x,z] of [[-.55,-.95],[.55,-.95],[-.55,.95],[.55,.95]])put('paint',CYL,0xc8ccd0,P(bd.x+x,.25,bd.z+z,0,0,0,.05,.5,.05));
    put('paint',rb(1.25,.08,2.05,.03,1),0xc8ccd0,P(bd.x,.48,bd.z));put('paint',rb(1.25,.7,.06,.03,2),0xc8ccd0,P(bd.x,.75,bd.z+1.0));
    put('fabric',rb(1.15,.2,1.95,.08,3),0xf4f6f6,P(bd.x,.62,bd.z));put('fabric',SPH,0xffffff,P(bd.x,.78,bd.z+.68,0,0,0,.42,.1,.22));put('fabric',rb(1.2,.12,1.25,.06,3),0x8fc4dc,P(bd.x,.74,bd.z-.32));
    put('paint',rb(.7,1.1,.45,.05,2),0xe4ecec,P(7.2,.55,16.2));put('paint',rb(.3,.08,.02,.01,1),0xe2594c,P(7.2,.9,15.97));put('paint',rb(.08,.3,.02,.01,1),0xe2594c,P(7.2,.9,15.97));
    // ---- 醫務室: the infection scanner, a white pedestal with a glowing screen and a hand pad
    const sc=M.scanner;put('paint',rb(.72,1.0,.6,.05,2),0xe4ecec,P(sc.x,.5,sc.z));put('paint',rb(.8,.08,.68,.03,1),0x3d5560,P(sc.x,1.04,sc.z));
    put('glow',rb(.42,.03,.42,.01,1),0x7fe8cf,P(sc.x,1.09,sc.z));put('paint',rb(.2,.62,.06,.02,1),0x3d5560,P(sc.x,1.38,sc.z-.24));
    put('glow',rb(.5,.34,.04,.01,1),0x3fc7a8,P(sc.x,1.52,sc.z-.2));put('paint',rb(.28,.07,.02,.01,1),0xe2594c,P(sc.x,.72,sc.z+.31));put('paint',rb(.07,.28,.02,.01,1),0xe2594c,P(sc.x,.72,sc.z+.31));
    // ---- 儲藏室: plank crates, a barrel and sacks
    const crate=(x,y,z,s,ry)=>{const base=P(x,y,z,ry);put('wood',rb(s,s,s,.04,2),0x8a6640,P(0,0,0,0,0,0,1,1,1,base));
      for(const sd of [-1,1]){put('wood',rb(s+.02,.1,.04,.02,1),0x6b4a2c,P(0,sd*s*.38,s/2,0,0,0,1,1,1,base));put('wood',rb(s+.02,.1,.04,.02,1),0x6b4a2c,P(0,sd*s*.38,-s/2,0,0,0,1,1,1,base))}
      put('wood',rb(s*1.2,.1,.04,.02,1),0x6b4a2c,P(0,0,s/2,0,0,.78,1,1,1,base))};
    crate(D.crates.x-.2,.45,D.crates.z+.2,.9,0);crate(D.crates.x+.55,.4,D.crates.z-.45,.8,.4);crate(D.crates.x-.1,1.26,D.crates.z+.1,.7,.2);
    put('wood',lathe([[.36,0],[.4,.1],[.45,.4],[.4,.7],[.36,.8],[0,.8]],26),0x7a5232,P(-13.4,0,16.2));for(const y of [.12,.68])put('paint',Art.torus(.415,.02),0x3a3c40,P(-13.4,y,16.2,0,Math.PI/2));
    put('fabric',SPH,0xb8a582,P(-12.4,.22,16.4,.3,0,0,.32,.24,.24));put('fabric',SPH,0xa8956f,P(-12.0,.2,15.9,-.4,0,0,.28,.2,.22));
    for(const key in Bk){const k=key.split('|')[0];root.add(own(Bk[key].mesh(MATS[k]),1,1))}
    // people
    S.players.forEach((p,i)=>{
      const gg=new T.Group(),H=human(p.look||A.LOOKS[i%A.LOOKS.length][1],p.id),pivot=H.g,arm=H.arms[0].b2;
      pivot.traverse(o=>{if(o.isMesh)picks.push(o)});
      const props={gun:new T.Mesh(G.gun,mat(0x111418)),cup:new T.Mesh(G.cup,mat(0x7fd4e8)),box:new T.Mesh(G.box,mat(0xf1cf63))};
      for(const k in props){props[k].position.set(0,-.08,.02);props[k].visible=false;arm.add(props[k])}props.gun.rotation.x=Math.PI/2;props.cup.position.set(0,-.1,.04);props.box.position.set(0,-.1,.06);
      gg.add(pivot);
      const ring=own(new T.Mesh(G.ring,new T.MeshBasicMaterial({color:0xe8a33d})),0,1);ring.rotation.x=Math.PI/2;ring.position.y=.04;ring.visible=false;gg.add(ring);
      const seatN=g.seat&&g.seat[p.id]?g.seat[p.id]:0,sc=seatN?A.seatMark(seatN).c:'#e8a33d';
      const name=label((seatN?seatN+'號 ':'')+p.name,'#ece4d0',.06,{depth:true,w:512,mark:seatN||0});name.position.y=2.34;gg.add(name);
      const cmk=own(new T.Sprite(new T.SpriteMaterial({map:texOf('','#ece4d0',64,seatN||i+1),transparent:true,depthTest:true,sizeAttenuation:false})),0,1);cmk.scale.set(.06,.06,1);cmk.position.y=2.34;cmk.visible=false;cmk.renderOrder=5;gg.add(cmk);
      const dmk=own(new T.Sprite(new T.SpriteMaterial({map:markTex(seatN||i+1),transparent:true,depthTest:true,sizeAttenuation:false})),0,1);dmk.scale.set(.05,.05,1);dmk.position.y=2.3;dmk.visible=false;dmk.renderOrder=5;gg.add(dmk);   // dark room: only the outline of the seat mark
      const sr=own(new T.Mesh(G.seat,new T.MeshBasicMaterial({color:new T.Color(sc),transparent:true,opacity:.9})),0,1);sr.rotation.x=Math.PI/2;sr.position.y=.03;gg.add(sr);             // a ring on the floor in the seat colour
      const gl=own(new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,sizeAttenuation:true})),0,1);gl.scale.set(2.2,.55,1);gl.position.set(0,2.95,0);gl.visible=false;gl.renderOrder=4;gg.add(gl);
      const sp=spawnOf(i,n);gg.position.set(sp.x,0,sp.z);gg.rotation.y=sp.r;root.add(gg);
      const bub=own(new T.Sprite(new T.SpriteMaterial({map:texOf('說話中','#8fe3ff'),transparent:true,depthTest:true,sizeAttenuation:true})),0,1);bub.scale.set(1.5,.375,1);bub.position.set(0,2.5,0);bub.visible=false;gg.add(bub);
      figs[p.id]={g:gg,pivot,rig:H,inks:H.inks,inkNear:true,props,ring,gl,bub,name,dmk,cmk,sr,dead:false,role:null,gi:-1,sp,art:null,artKey:'',shown:true,walk:0,lx:sp.x,lz:sp.z};
      peers[p.id]={x:sp.x,z:sp.z,r:sp.r,gi:-1,gt:''};
    });
    const Z=M.size+.6;mini.innerHTML=`<svg viewBox="${-Z} ${-Z} ${Z*2} ${Z*2}">${M.rooms.map(r=>`<rect data-r="${r.id}" class="${r.corr?'co':''}" x="${r.x0}" y="${r.z0}" width="${r.x1-r.x0}" height="${r.z1-r.z0}"/>${r.corr?'':`<text x="${(r.x0+r.x1)/2}" y="${(r.z0+r.z1)/2+1}">${r.n.slice(0,2)}</text>`}`).join('')}<circle r="1.2" cx="0" cy="0"/></svg>`;
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
      const rk=R&&(!alive||over)?(over&&g.roles[id]==='C'&&g.antibody===id?'AB':g.roles[id])+(over?'':'~'):'';   // the antibody is only shown with the results
      if(rk!==f.artKey){if(f.art){f.g.remove(f.art);freeTree(f.art)}f.art=null;f.artKey=rk;
        if(rk){const pi=S.players.findIndex(q=>q.id===id);f.artH=roleHuman(rk.replace('~',''),{ghost:!over,look:S.players[pi].look||A.LOOKS[pi%A.LOOKS.length][1]});f.art=f.artH.g;f.g.add(f.art);if(f.inkNear===false)for(const o of f.artH.inks)o.visible=false;f.pop=(fresh||still)?1:0;f.pivot.visible=false;f.gl.visible=false}else f.pivot.visible=true}
      if(R&&(!alive||over)&&!f.role&&!(CINE&&cineNoRole&&!over)){f.role=label(R.n,'#f1cf63',.055,{depth:false});f.role.position.y=2.34;f.role.center.set(.5,-.6);f.g.add(f.role)}
      const tgt=id!==me&&(ui.t===id&&ui.pick||ui.ft===id||(ui.armed&&ui.armed.t===id));f.ring.visible=tgt||(id===me&&(alive||over));f.bub.visible=!!speak[id]&&!f.art&&!CINE;f.ring.material.color.setHex(tgt?0xe2594c:0xe8a33d);
    }
    const roam=over&&api.roam,mine=figs[me]&&(roam||(g.alive[me]!==false&&S.phase==='play')),ghost=!!figs[me]&&S.phase==='play'&&g.alive[me]===false;
    const walk=(mine||ghost)&&api.walk;stick.hidden=!walk;mini.hidden=over&&!roam;ctx.hidden=!walk||over||ghost;if(!walk)tip.textContent='拖曳畫面轉視角';
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
    if(room==='clinic'&&d(M.scanner)<=2.0)o.push({t:'scanner'});
    const sw=M.switches[room];if(sw&&d(sw)<=1.9)o.push({t:'switch',room,dark:env.dark.includes(room)});
    return o}
  function stepRoom(dt,t){
    const S=cur.S,me=cur.me,g=S.g,play=S.phase==='play',mine=synced&&api.walk!==false&&figs[me]&&((play&&g.alive[me]!==false)||(S.phase==='over'&&api.roam)),now=Date.now();
    const ghost=!mine&&api.walk!==false&&!!figs[me]&&play&&g.alive[me]===false&&me3.ok;
    if(ghost){let jx=joy.x,jy=joy.y;if(keys.w||keys.arrowup)jy+=1;if(keys.s||keys.arrowdown)jy-=1;if(keys.a||keys.arrowleft)jx-=1;if(keys.d||keys.arrowright)jx+=1;
      const m=Math.hypot(jx,jy);if(m>.12){const k=Math.min(1,m)/m,fx=Math.sin(camYaw),fz=Math.cos(camYaw),dx=(fx*jy-fz*jx)*k,dz=(fz*jy+fx*jx)*k;
        const p=moveTo(me3.x,me3.z,me3.x+dx*SPEED*1.25*dt,me3.z+dz*SPEED*1.25*dt);me3.x=p[0];me3.z=p[1]}
      if(now-nearT>200){nearT=now;const room=A.roomOf(me3.x,me3.z),rn=(M.rooms.find(r=>r.id===room)||{}).n||'';tip.textContent='你已出局，正在觀戰'+(rn?'・'+rn:'');
        const c=mini.querySelector('circle');if(c){c.setAttribute('cx',me3.x.toFixed(1));c.setAttribute('cy',me3.z.toFixed(1));mini.querySelectorAll('rect').forEach(e=>e.classList.toggle('on',e.dataset.r===room))}}}
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
          if(el2>HOLD+3000)stopGesture()}}
      else if(prog){const el2=now-prog.t0;gbar.hidden=false;gbar.firstChild.textContent=`${ACTN[prog.a]||''}中 ${Math.min(3,el2/1000).toFixed(1)} / 3 秒`;if(el2>prog.ms+2500){prog=null;gbar.hidden=true}}
      else if(!gbar.hidden)gbar.hidden=true;
      const sgi=gest?gest.gi:seated?7:prog?({book:8,letter:9,tea:10,light:11})[prog.a]:-1;
      peers[me]={x:me3.x,z:me3.z,r:me3.r,gi:sgi,gt:gest?gest.t:''};
      const key=[me3.x.toFixed(2),me3.z.toFixed(2),me3.r.toFixed(2),gest?gest.gi+gest.t+gest.k:''].join('|');
      if(api.onPos&&((key!==lastSent&&now-lastSendT>110)||now-lastSendT>1500)){lastSent=key;lastSendT=now;api.onPos({x:me3.x,z:me3.z,r:me3.r,gi:gest?gest.gi:-1,gt:gest?gest.t:'',gk:gest?gest.k:'',sit:seated?1:0})}
      if(now-nearT>200){nearT=now;const o=nearObjs(),k=JSON.stringify(o);if(k!==nearKey){nearKey=k;if(api.onNear)api.onNear(o)}
        const room=A.roomOf(me3.x,me3.z),rn=(M.rooms.find(r=>r.id===room)||{}).n||'';if(!gest&&!prog)tip.textContent=rn?'你在'+rn:'';
        const c=mini.querySelector('circle');if(c){c.setAttribute('cx',me3.x.toFixed(1));c.setAttribute('cy',me3.z.toFixed(1));mini.querySelectorAll('rect').forEach(e=>e.classList.toggle('on',e.dataset.r===room))}}
    }
    const talkers=Object.keys(speak).filter(k=>speak[k]&&figs[k]);
    const over=S.phase==='over'&&!api.roam,ids=Object.keys(figs),kp=1-Math.exp(-dt*14),kr=1-Math.exp(-dt*15),ka=1-Math.exp(-dt*18);shadows.begin();if(over!==wasOver){wasOver=over;camYaw=over?Math.PI:me3.r}      // over = the line-up; walking around after the game is not
    for(const id in figs){const f=figs[id],p=peers[id];if(!p)continue;const self=id===me&&mine,vis=over||!p.hidden||id===me;
      if(f.shown!==vis){f.shown=vis;f.g.visible=vis}if(!vis)continue;
      if(!!f.lined!==over){f.lined=over;const nm=f.name,rl=f.role;nm.visible=true;nm.material.sizeAttenuation=over;nm.material.needsUpdate=true;        // in the line-up labels are part of the scene so they shrink with the figures
        if(over){nm.scale.set(2.16,.27,1);nm.position.y=2.27}else{nm.scale.set(.48,.06,1);nm.position.y=2.34}if(f.dmk)f.dmk.visible=false;if(f.cmk)f.cmk.visible=false;if(f.sr)f.sr.visible=!over
        if(rl){rl.material.sizeAttenuation=over;rl.material.depthTest=over;rl.material.needsUpdate=true;if(over){rl.scale.set(1.36,.34,1);rl.center.set(.5,.5);rl.position.y=2.6}else{rl.scale.set(.22,.055,1);rl.center.set(.5,-.6);rl.position.y=2.34}}
        if(!f.step){f.step=own(new T.Mesh(Art.rbox(1.2,.08,.8,.035,2),new T.MeshLambertMaterial({color:0x4a3a2c})),0,1);f.step.position.y=-.045;f.g.add(f.step)}f.step.visible=over;if(!over){f.g.position.set(p.x,0,p.z);f.g.rotation.y=p.r}}
      if(over){const L=lineSpot(ids.indexOf(id),ids.length);f.g.position.set(L.x,L.y,L.z);f.g.rotation.y=0;f.gl.visible=false}
      else if(self){f.g.position.set(p.x,0,p.z);f.g.rotation.y=p.r}
      else{f.g.position.x+=(p.x-f.g.position.x)*kp;f.g.position.z+=(p.z-f.g.position.z)*kp;              // other players glide towards their reported spot at the same speed whatever this phone's frame rate
        let dr=p.r-f.g.rotation.y;dr=Math.atan2(Math.sin(dr),Math.cos(dr));f.g.rotation.y+=dr*kr}
      shadows.put(f.g.position.x,f.g.position.y,f.g.position.z,1);
      const nearC=over||f.g.position.distanceToSquared(cam.position)<inkD2;if(nearC!==f.inkNear){f.inkNear=nearC;for(const o of f.inks)o.visible=nearC;if(f.artH)for(const o of f.artH.inks)o.visible=nearC}
      const mv=Math.hypot(f.g.position.x-f.lx,f.g.position.z-f.lz);f.lx=f.g.position.x;f.lz=f.g.position.z;const wk=over?0:stride(f,mv,dt,f.g.rotation.y);
      const d2=f.g.position.distanceToSquared(cam.position);f.aT=(f.aT||0)+dt;const busy=d2<400||over||f.aT>.1;      // past 20 m a figure is posed ten times a second, not every frame
      // the head turns towards whoever is talking nearby
      let look=null;if(!over&&talkers.length){let best=36;for(const s2 of talkers){if(s2===id)continue;const q=figs[s2];if(!q||!q.shown)continue;const dx=q.g.position.x-f.g.position.x,dz=q.g.position.z-f.g.position.z,dd=dx*dx+dz*dz;
        if(dd<best){best=dd;let a=Math.atan2(dx,dz)-f.g.rotation.y;a=Math.atan2(Math.sin(a),Math.cos(a));look=Math.max(-1.05,Math.min(1.05,a))}}}
      if(f.art){f.pop=Math.min(1,(f.pop||0)+dt*3);const e=1-Math.pow(1-f.pop,3);f.art.scale.setScalar(.55+.45*e);f.art.position.y=0;
        const res=cur.S.result,mode=over?(res&&res.rw&&res.rw[id]>0?'cheer':'slump'):cur.S.phase==='play'?'ghost':'';
        if(busy&&f.artH){rigPose(f.artH,{w:mode==='ghost'?0:wk,ph:f.ph||0,t:t/1000,gi:-1,mode,look:mode?null:look,talk:!!speak[id]},f.aT);f.aT=0}continue}
      const gi=p.gi,dk=env.dark.length&&env.dark.includes(A.roomOf(f.g.position.x,f.g.position.z));
      if(gi!==f.gi){f.gi=gi;for(const k in f.props)f.props[k].visible=gi>=0&&GL[gi][2]===k;if(gi>=0){f.gl.material.map=texOf(GN[gi],'#ffe9a8');f.gl.material.needsUpdate=true}}
      const far=(CINE&&cineMarks)||id!==me&&d2>64;                 // past 8 m only the seat mark shows, so 16 name tags do not pile up
      f.gl.visible=gi>=0&&!dk;f.name.visible=!dk&&!far;f.cmk.visible=!dk&&far;f.dmk.visible=!!dk;f.sr.visible=!dk;     // in a dark room nobody can read what you are doing: only the outline of the seat mark shows
      if(busy){rigPose(f.rig,{w:gi>=0?0:wk,ph:f.ph||0,t:t/1000,gi,mode:'',look:gi>=0?null:look,talk:!!speak[id]},f.aT);f.aT=0}
    }
    shadows.end();
    const cx=me3.ok?me3.x:M.table.x,cz=me3.ok?me3.z:M.table.z,sx=Math.sin(camYaw),sz=Math.cos(camYaw);
    let D=4.6;                                   // pull the camera in when a wall or a piece of furniture is in the way
    for(let d=.5;d<=4.6;d+=.2){const x=cx-sx*d,z=cz-sz*d;if(!A.walkable(x,z,.22)||A.blocked(x,z)&&Math.hypot(x-M.table.x,z-M.table.z)>M.table.r+.4){D=Math.max(.8,d-.3);break}}
    camD+=(D-camD)*(D<camD?.5:.12);
    if(over){const L=lineSpot(0,ids.length),hw=L.cols*.65,top=L.rows*2.95,th=Math.tan(cam.fov/2*Math.PI/180),D=Math.max(hw/(th*cam.aspect),top/2/th)*1.03+.5,a=camYaw-Math.PI;   // results: the line-up, seen from the front; drag to walk around it
      cam.position.set(Math.sin(a)*D,top/2-.12,PZ+Math.cos(a)*D);cam.lookAt(0,top/2-.12,PZ)}
    else{cam.position.set(cx-sx*camD,1.9+camD/4.6*1.1+(4.6-camD)*.3,cz-sz*camD);cam.lookAt(cx,1.25+(4.6-camD)*.08,cz)}
    for(const sg of eo.signs)sg.visible=sg.position.distanceToSquared(cam.position)>14;      // a door sign right above the camera would fill the screen
  }

  /* ---------- 地鐵追捕: route map ---------- */
  function buildMap(){
    clear();const P=Art.place,B=Art.Batch();
    if(!boardTex){
    // the map board: a rounded slab with a painted city underneath the lines
    B.add(Art.rbox(12.6,.24,11.6,.3,3),0x2a2018,P(0,-.14,0),{s:1.2});B.add(Art.rbox(12.2,.04,11.2,.08,2),0x6a4e34,P(0,-.03,0),{s:1.2});
    const mc=Art.canvas(1024,1024),x=mc.getContext('2d'),r=Art.rng(17),W=1024,toC=(px,py)=>[(px/40+6)/12*W,(py/40+5.5)/11*W];
    x.fillStyle='#1d2b33';x.fillRect(0,0,W,W);
    for(let i=0;i<9;i++){const cx=r()*W,cy=r()*W,rr=40+r()*90;x.fillStyle=i%3?'rgba(70,110,80,.35)':'rgba(60,95,120,.35)';x.beginPath();for(let a=0;a<=12;a++){const t=a/12*Math.PI*2,q=rr*(.75+r()*.4);a?x.lineTo(cx+Math.cos(t)*q,cy+Math.sin(t)*q):x.moveTo(cx+Math.cos(t)*q,cy+Math.sin(t)*q)}x.closePath();x.fill()}
    x.strokeStyle='rgba(90,140,170,.45)';x.lineWidth=26;x.lineCap='round';x.beginPath();x.moveTo(-20,W*.82);x.bezierCurveTo(W*.3,W*.7,W*.55,W*.98,W+20,W*.78);x.stroke();
    x.strokeStyle='rgba(255,255,255,.05)';x.lineWidth=2;for(let i=0;i<W;i+=48){x.beginPath();x.moveTo(i+r()*6,0);x.lineTo(i+r()*6,W);x.stroke();x.beginPath();x.moveTo(0,i+r()*6);x.lineTo(W,i+r()*6);x.stroke()}
    Art.grain(x,W,W,.3);const vg=x.createRadialGradient(W/2,W/2,W*.3,W/2,W/2,W*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.45)');x.fillStyle=vg;x.fillRect(0,0,W,W);boardTex=Art.texture(mc,false)}
    const board=own(new T.Mesh(new T.PlaneGeometry(12,11),new T.MeshLambertMaterial({map:boardTex})),1,1,0);board.rotation.x=-Math.PI/2;board.position.y=-.005;root.add(board);
    // lines: smooth tubes that bend round the corners; stations: rounded discs, bigger where lines meet
    LINES.forEach((L,li)=>{const pts=L.ids.map(i=>{const p=wpos(ST[i]);return new T.Vector3(p.x,.05+li*.004,p.z)});
      const curve=new T.CatmullRomCurve3(pts,false,'centripetal',.5);B.add(new T.TubeGeometry(curve,L.ids.length*14,.055,10,false),new T.Color(L.c).getHex(),P(0,0,0))});
    ST.forEach(s=>{const p=wpos(s),hub=ADJ[s.id].length>2;B.add(Art.disc(hub?.21:.16,.09,28),0xece4d0,P(p.x,.02,p.z));B.add(Art.torus(hub?.19:.145,.022),hub?0x2a3138:0x4a555c,P(p.x,.11,p.z,0,Math.PI/2));
      const h=new T.Mesh(G.hit,ghost);h.position.set(p.x,.25,p.z);h.visible=false;h.userData.id=s.id;root.add(h);picks.push(h);       // invisible tap targets (rays still find them)
      const l=label(s.n,'#d6e0e2',.04);l.position.set(p.x,.12,p.z+.4);root.add(l)});
    root.add(own(B.mesh(Art.lambert(Art.kit().paint)),1,1));
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
      if(p&&p.key!==key){root.remove(p.m);freeTree(p.m);const old=p;p=pawns[id]=mkPawn(g.roles[id],g.team[id],th,key);p.m.position.copy(old.m.position);p.init=old.init}
      if(!p)p=pawns[id]=mkPawn(g.roles[id],g.team[id],th,key);
      const s=g.pos[id],vis=s>=0&&ST[s]&&(th?(seeTh&&!g.arrested[id]):true);p.m.visible=!!vis;if(!vis)return;
      const k=s+(th?'t':'c'),i=at[k]=(at[k]||0)+1,w=wpos(ST[s]);
      p.to.set(w.x+(th?.3:-.3)+(i-1)*.24,.06,w.z-(th?0:.26));
      if(!p.init||fresh||still){p.m.position.copy(p.to);p.init=true}
      p.m.scale.setScalar(id===me?.8:.62)});
    stick.hidden=true;gbar.hidden=true;mini.hidden=true;ctx.hidden=true;tip.textContent='左右拖曳旋轉・點車站選取';
  }

  let sKey='';
  function size(force){
    const w=el.clientWidth||320,h=api.fill?(el.clientHeight||240):Math.round(kind==='virus'?Math.max(280,Math.min(w*1.05,window.innerHeight*.6)):w),k=w+'x'+h+kind;
    if(!force&&k===sKey)return;sKey=k;                                          // resizing clears the picture and reallocates it, so only do it when the size really changed
    renderer.setSize(w,h);cam.aspect=w/h;cam.fov=kind==='virus'?52:42;cam.updateProjectionMatrix();
    const t=Math.tan(cam.fov/2*Math.PI/180);fit=Math.max(5.9/(t*cam.aspect),5.4/t);
  }
  let lastT=0,qLv=0,qN=0,qT0=0;
  // a phone that cannot keep up gets a lower drawing resolution first, then loses the ink outlines
  // picture quality: 'auto' starts high and steps down when this phone cannot keep up; the player can also choose high / mid / low
  let inkD2=90;
  let qMode=(()=>{try{return localStorage.getItem('ax_q')||'auto'}catch(e){return'auto'}})();
  const qLevel=()=>qMode==='auto'?qLv:({high:0,mid:1,low:2}[qMode]||0);
  function applyQ(){const dpr=window.devicePixelRatio||1,lv=qLevel();
    renderer.setPixelRatio(pxq>0?Math.max(.25,Math.min(2,pxq)):lv===0?Math.min(dpr,2.5):lv===1?Math.min(dpr,1.5):Math.min(dpr,1)*.85);
    inkM.visible=lv<2;inkD2=lv===0?90:30;Art.setAniso(lv===0?Math.min(8,renderer.capabilities.getMaxAnisotropy()):lv===1?4:1);size(true)}
  function quality(t){
    if(!qT0||t-qT0>4500){qT0=t;qN=0;return}qN++;const e=t-qT0;if(e<2500)return;const fps=qN*1000/e;qT0=t;qN=0;
    if(fps>=24||qLv>=2||pxq||qMode!=='auto')return;qLv++;applyQ()}
  function frame(t,manual){
    if(CINE&&!manual){raf=0;return}                                   // director mode: the page drives every frame itself
    if(!manual){if(!el.isConnected){raf=0;return}raf=requestAnimationFrame(frame);quality(t)}
    const dt=manual?manual:Math.min(.2,(t-lastT)/1000||0);lastT=t;   // walking speed must not depend on the frame rate
    if(kind==='virus')stepRoom(dt,t);
    else{const kp=1-Math.exp(-dt*9);shadows.begin();for(const id in pawns){const p=pawns[id];p.m.position.lerp(p.to,kp);p.m.rotation.y=yaw;if(p.m.visible)shadows.put(p.m.position.x,.02,p.m.position.z,p.m.scale.x*.6)}shadows.end();
      if(!still)dyn.children.forEach(o=>{if(o.userData.spin)o.rotation.y=t/900});
      cam.position.set(Math.sin(yaw)*fit*.4,fit*.92,Math.cos(yaw)*fit*.4+.15);cam.lookAt(0,0,.15)}
    if(flash.intensity>0)flash.intensity=Math.max(0,flash.intensity-.08*(manual?manual*60:1));
    if(CINE&&cineCam){cam.fov=cineCam.fov||cam.fov;cam.updateProjectionMatrix();cam.position.set(cineCam.p[0],cineCam.p[1],cineCam.p[2]);cam.lookAt(cineCam.l[0],cineCam.l[1],cineCam.l[2]);
      for(const sg of eo.signs)sg.visible=sg.position.distanceToSquared(cam.position)>14}
    if(!noDraw)renderer.render(scene,cam);
  }
  /* ---------- director mode (?cine=1), for promo videos: a fixed frame size, a placed camera, and one frame at a time on request ---------- */
  const CINE=new URLSearchParams(location.search).get('cine')==='1';let cineCam=null,cineMarks=true,cineDim=null,cineNoRole=false;
  api.cine={on:CINE,
    size(w,h){renderer.setPixelRatio(1);api.fill=true;el.style.width=w+'px';el.style.height=h+'px';renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()},
    cam(p,l,fov){cineCam=p?{p,l,fov}:null},marks(v){cineMarks=!!v},hideRoles(v){cineNoRole=!!v},
    where(id){const f=figs[id];return f?[f.g.position.x,f.g.position.y,f.g.position.z]:null},
    flash(x,z,v){flash.position.set(x,1.6,z);flash.intensity=v==null?3:v},
    dim(v){if(!cineDim){cineDim=new T.Mesh(new T.PlaneGeometry(4,4),new T.MeshBasicMaterial({color:0x02040a,transparent:true,opacity:0,depthTest:false,depthWrite:false}));cineDim.position.z=-.2;cineDim.renderOrder=4;cam.add(cineDim);scene.add(cam)}cineDim.material.opacity=v;cineDim.visible=v>0},   // a dark room, as the camera sees it: seat marks (drawn later) stay on top
    step(t,dt){frame(t,dt||1/24);return renderer.domElement.toDataURL('image/jpeg',.92)}};
  /* ---------- input ---------- */
  let down=null;
  cv.addEventListener('pointerdown',e=>{if(down)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};try{cv.setPointerCapture(e.pointerId)}catch(_){}});
  // when the phone is upright the app turns the game a quarter (api.rot): screen-down is then the game's right, screen-left its down
  const loc=(e,r)=>api.rot?[e.clientY-r.top,r.right-e.clientX,r.height,r.width]:[e.clientX-r.left,e.clientY-r.top,r.width,r.height];
  cv.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;const dx=api.rot?e.clientY-down.y:e.clientX-down.x;down.moved+=Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y);down.x=e.clientX;down.y=e.clientY;
    if(kind==='virus')camYaw-=dx*.008;else yaw-=dx*.008});
  const up=e=>{if(!down||e.pointerId!==down.id)return;const d=down;down=null;if(e.type!=='pointerup'||d.moved>10)return;
    const [lx,ly,lw,lh]=loc(e,cv.getBoundingClientRect()),v=new T.Vector2(lx/lw*2-1,-(ly/lh)*2+1);ray.setFromCamera(v,cam);
    const hit=ray.intersectObjects(picks,false)[0];if(hit&&onPick)onPick(kind,hit.object.userData.id)};
  cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  const knob=stick.firstChild;
  const setJoy=e=>{const [lx,ly,lw]=loc(e,stick.getBoundingClientRect()),R=lw/2;let x=(lx-R)/R,y=-(ly-R)/R;const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}joy.x=x;joy.y=y;knob.style.transform=`translate(${x*R*.55}px,${-y*R*.55}px)`};
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
  api.speak=(id,v)=>{speak[id]=!!v;const f=figs[id];if(f)f.bub.visible=!!v&&!f.art&&!CINE};
  api.inRoom=()=>kind==='virus'&&me3.ok;
  api.gesture=(gi,t,k,name)=>{if(kind!=='virus'||!figs[t])return'對象不在場';if(seated)return'請先站起來';if(distTo(t)>RANGE)return'太遠了，先走到他旁邊（約兩步內）';prog=null;gest={gi,t,k:k||'',name:name||'',t0:Date.now()};beat();return''};
  // while an action is being held the server must keep hearing from us, even if this phone draws only a frame or two per second
  // (a gesture, sitting on a bench, or using the shelf, lockers, tea table or a light switch)
  function beat(){if(kind!=='virus'||!(gest||seated||prog)||!api.onPos||!me3.ok)return;lastSendT=Date.now();api.onPos({x:me3.x,z:me3.z,r:me3.r,gi:gest?gest.gi:-1,gt:gest?gest.t:'',gk:gest?gest.k:'',sit:seated?1:0})}
  setInterval(()=>{if((gest||seated||prog)&&el.isConnected&&Date.now()-lastSendT>550)beat()},600);
  api.stop=()=>stopGesture(true);
  api.busy=()=>!!gest;
  api.setYaw=y=>{camYaw=y};
  api.debugTris=()=>{const tri=g=>{let n=0,ink=0;g.traverse(o=>{if(o.isMesh&&o.geometry){const ix=o.geometry.index,t=(ix?ix.count:o.geometry.attributes.position.count)/3;if(o.material===inkM||o.material===inkSk)ink+=t;else n+=t}});return[Math.round(n),Math.round(ink)]};const f=Object.values(figs)[0];let sc=0;root.traverse(o=>{if(o.isMesh&&o.geometry&&!o.userData.id&&o.parent===root){const ix=o.geometry.index;sc+=(ix?ix.count:o.geometry.attributes.position.count)/3}});return{figure:f?tri(f.pivot):null,scenery:Math.round(sc)}};   // (tests: how heavy things are)
  api.perf=()=>{const i=renderer.info;let lights=0;scene.traverse(o=>{if(o.isLight&&o.visible)lights++});return{calls:i.render.calls,tris:i.render.triangles,programs:i.programs.length,geos:i.memory.geometries,tex:i.memory.textures,lights,px:renderer.getPixelRatio(),size:[cv.width,cv.height]}};
  api.debug=()=>({quality:qLv,art:Object.fromEntries(Object.entries(figs).map(([k,f])=>[k,f.artKey])),me:Object.assign({},me3),peers:JSON.parse(JSON.stringify(peers)),gest,camYaw,seated,prog,env,room:A.roomOf(me3.x,me3.z),near:nearObjs()});
  api.teleport=(x,z)=>{if(!A.walkable(x,z)||A.blocked(x,z))return false;if(seated){seated=false;if(api.onEnv)api.onEnv({a:'stand'})}me3.x=x;me3.z=z;return true};
  api.env=m=>{env={dark:m.dark||[],books:m.books||[],lockers:m.lockers||[]};if(kind==='virus'&&root)applyEnv()};
  api.seat=(x,z,r)=>{me3.x=x;me3.z=z;me3.r=r;seated=true;gest=null;prog=null;nearKey=''};
  api.progress=(a,ms)=>{prog={a,t0:Date.now(),ms:ms||HOLD};gest=null};
  api.done=()=>{prog=null;gest=null;gbar.hidden=true;nearKey=''};
  api.room=()=>me3.ok?A.roomOf(me3.x,me3.z):'';
  api.roomOf=id=>{const p=peers[id];return p&&!p.hidden?A.roomOf(p.x,p.z):''};
  api.setCtx=h=>{if(ctx._h!==h){ctx._h=h;ctx.innerHTML=h}};
  api.setHud=h=>{if(hud._h!==h){hud._h=h;hud.innerHTML=h}};
  api.setQuality=m=>{qMode=m;try{localStorage.setItem('ax_q',m)}catch(e){}if(m==='auto')qLv=0;applyQ()};api.qualityMode=()=>qMode;api.resize=()=>size();api.fill=false;api.rot=false;api.roam=false;
  api.refreshNear=()=>{nearKey=''};
  api.screenOf=id=>{const f=figs[id];if(!f)return null;const v=new T.Vector3(f.g.position.x,1,f.g.position.z).project(cam),r=cv.getBoundingClientRect(),lx=(v.x+1)/2,ly=(1-v.y)/2;return api.rot?[r.right-ly*r.width,r.top+lx*r.height]:[r.left+lx*r.width,r.top+ly*r.height]};   // where a player is on the screen (for tests)
  api.stand=()=>{seated=false;nearKey=''};
  applyQ();
  return api;
})();
