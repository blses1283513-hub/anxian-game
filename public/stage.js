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
  const stl=document.createElement('div');stl.className='stl';el.appendChild(stl);                 // top-left column: whatever the app puts there (caption, armed skill), then the progress bar
  const hud=document.createElement('div');hud.style.display='contents';stl.appendChild(hud);
  const gbar=document.createElement('div');gbar.className='gbar';gbar.hidden=true;gbar.innerHTML='<span></span><button class="btn sm" data-a="gstop">停止</button>';stl.appendChild(gbar);
  const tip=document.createElement('div');tip.className='stagetip';el.appendChild(tip);
  const mini=document.createElement('div');mini.className='mini';el.appendChild(mini);
  const ctx=document.createElement('div');ctx.className='ctx';ctx.hidden=true;el.appendChild(ctx);
  const pxq=+new URLSearchParams(location.search).get('px');                                   // ?px=1 lowers the drawing resolution on a slow phone
  renderer.setPixelRatio(pxq>0?Math.max(.25,Math.min(2,pxq)):Math.min(window.devicePixelRatio||1,2));
  const scene=new T.Scene();scene.background=new T.Color(0x0b141a);scene.fog=new T.Fog(0x0b141a,30,90);
  const cam=new T.PerspectiveCamera(48,4/3,.1,130),ray=new T.Raycaster();
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

  /* ---------- people: anime-style figures. Each limb is one merged, toon-shaded mesh with an ink outline; the face is a drawn texture. ---------- */
  const PAL={skin:[0xf7dcc4,0xefcaa6,0xd9aa80,0xb07c56,0x77503a],hair:[0x23232b,0x4f3120,0x86522c,0xe3bf5e,0xc04e32,0xa4abb2,0x4479e0,0x9a5fd6],
    top:[0x3f73c9,0xc9463f,0x2f9d6b,0x55795f,0xe2b93b,0x2b2f38,0x8a5cc9,0x30343f,0x9aa3ab,0xe68ab0],bot:[0x23304a,0x3a3f47,0x5b4a3a,0x7a8a99,0x1d1d22,0x6b3f2a,0xc98aa5,0x2f5d4a]};
  const EYE=[0x7a4a2a,0xb8742e,0x3f8f5a,0x3f7fd0,0x3a9a7a,0x6b8fb0,0x35b0d0,0x9a5ad0];        // eye colour goes with the hair colour
  const grad=(()=>{const t=new T.DataTexture(new Uint8Array([150,208,255]),3,1,T.LuminanceFormat);t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t})();
  const toonM=new T.MeshToonMaterial({vertexColors:true,gradientMap:grad}),toonG=new T.MeshToonMaterial({vertexColors:true,gradientMap:grad,transparent:true,opacity:.62});
  const glowM=new T.MeshBasicMaterial({vertexColors:true}),glowG=new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.7});
  const inkM=new T.MeshBasicMaterial({color:0x15181d,side:T.BackSide});inkM.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n\ttransformed+=normalize(normal)*.014;')};
  const mixC=(c,f,to)=>{const t=to==null?0:to,ch=s=>{const a=c>>s&255,b=t>>s&255;return Math.round(a+(b-a)*f)};return ch(16)<<16|ch(8)<<8|ch(0)},css=c=>'#'+c.toString(16).padStart(6,'0');
  const pg={};const SP=new T.SphereGeometry(1,12,9),HEAD=new T.SphereGeometry(1,20,14),BX=new T.BoxGeometry(1,1,1);
  const cyl=(rt,rb,seg)=>{const k='c'+rt+'|'+rb+'|'+(seg||10);return pg[k]||(pg[k]=new T.CylinderGeometry(rt,rb,1,seg||10))};
  const capG=th=>pg['h'+th]||(pg['h'+th]=new T.SphereGeometry(1,18,10,0,Math.PI*2,0,th));
  const SPIKE=cyl(.04,1,6),BLUNT=cyl(.55,1,6),ARC=new T.TorusGeometry(1,.035,5,14,1.6);
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
  const FACE=new T.SphereGeometry(1,14,10,Math.PI/2-1,2,.9,1.45),fmat={};
  const faceM=(t,gh)=>{const k=t.uuid+(gh?'g':'');return fmat[k]||(fmat[k]=new T.MeshToonMaterial({map:t,gradientMap:grad,transparent:true,opacity:gh?.7:1,depthWrite:false}))};
  // look = [sex, skin, hair style, hair colour, top colour, sleeve, bottom kind, bottom colour]
  // opt.role dresses the same person as that identity: T C AB R J I F (感染戰) or thief cop corrupt (地鐵追捕)
  function human(look,id,opt){
    const o=opt||{},role=o.role||'',[sex,sk,hs,hc,tc,sl0,bt0,bc]=look,g=new T.Group(),gh=!!o.ghost;
    const skin=PAL.skin[sk],hair=PAL.hair[hc],hl=mixC(hair,.38,0xffffff),dk=0x1d2026,wh=0xf4f1ea,red=0xc0322a,gold=0xf1cf63;
    let top=PAL.top[tc],bot=PAL.bot[bc],sl=sl0,bt=bt0,coat=0,hat='',fv='';
    if(role==='T'){top=0x23262c;bot=0x17191d;sl=1;bt=0;fv='cloth'}
    else if(role==='C'||role==='AB'){top=0x3f9d90;sl=1}
    else if(role==='R'){top=0xf2f2ee;sl=1;coat=.5;fv='glasses'}
    else if(role==='J'){top=0xb99a6b;sl=1;hat='fedora'}
    else if(role==='I'){top=0x243a5a;sl=1;coat=.42;hat='fedora'}
    else if(role==='F'){top=0x5a2f8a;sl=1;coat=.12;hat='hood'}
    else if(role==='thief'){top=0xf2f2ee;bot=0x1d1d22;sl=1;bt=0;hat='beanie';fv='mask'}
    else if(role==='cop'||role==='corrupt'){top=o.color==null?0x2d5fae:o.color;bot=0x1b2c4a;sl=1;bt=0;hat='police';if(role==='corrupt')fv='cloth'}
    const w=sex?.165:.19,ws=sex?.13:.16,rAt=y=>ws+(w-ws)*Math.max(0,Math.min(1,(y-.75)/.46)),hy=1.56,R=.3;
    const limb=par=>{const L={t:Parts(),e:Parts(),n:Parts(),par};L.done=()=>{
        if(L.n.count()){const m=new T.Mesh(L.n.geo(),gh?toonG:toonM);if(id)m.userData.id=id;par.add(m)}
        if(L.t.count()){const geo=L.t.geo(),m=new T.Mesh(geo,gh?toonG:toonM);if(id)m.userData.id=id;par.add(m);if(!gh){const ol=new T.Mesh(geo,inkM);if(id)ol.userData.id=id;par.add(ol)}}
        if(L.e.count()){const m=new T.Mesh(L.e.geo(),gh?glowG:glowM);par.add(m)}};return L};
    // legs
    const shoe=role?dk:bt===1?0xf0f0ee:bt===2?0x5a3a2a:0x24262c,sock=bt===2&&!role?(tc===5||tc===7?0x23262c:wh):wh;
    const legs=[-1,1].map(sd=>{const G=new T.Group();G.position.set(sd*.1,.66,0);const L=limb(G),p=L.t;
      if(bt===0)p.add(cyl(.095,.078),bot,0,-.28,0,1,.56,1);
      else if(bt===1){p.add(cyl(.105,.1),bot,0,-.11,0,1,.22,1).add(cyl(.074,.062),skin,0,-.39,0,1,.34,1).add(cyl(.066,.064),sock,0,-.52,0,1,.09,1)}
      else p.add(cyl(.074,.064),skin,0,-.2,0,1,.4,1).add(cyl(.068,.063),sock,0,-.46,0,1,.24,1);
      p.add(SP,shoe,0,-.605,.035,.082,.058,.135);L.done();g.add(G);return G});
    // body and head
    const B=limb(g),b=B.t;
    if(bt===2&&!coat){b.add(cyl(.15,.34,14),bot,0,.6,0,1,.3,.9).add(cyl(.336,.348,14),mixC(bot,.3,0xffffff),0,.468,0,1,.035,.9)}
    else if(bt!==2){b.add(cyl(ws+.012,ws+.024),bot,0,.7,0,1,.13,.8);if(bt===0)b.add(cyl(ws+.018,ws+.018),dk,0,.765,0,1,.032,.8).add(BX,gold,0,.765,(ws+.018)*.8,.04,.03,.012)}
    b.add(cyl(w,ws),top,0,.98,0,1,.46,.78).add(SP,top,0,1.205,0,w,.05,w*.78).add(cyl(.05,.056),skin,0,1.26,0,1,.13,1);
    if(coat){const len=1.21-coat,hem=w+.07+(role==='F'?.12:0);b.add(cyl(ws+.03,hem,14),top,0,coat+len*.3,0,1,len*.6,.82);        // a long coat or robe over the legs
      if(role!=='F')b.add(BX,mixC(top,.25),0,.84,(ws+.05)*.82,.012,.5,.012)}
    if(sl&&!role){b.add(BX,wh,-.05,1.215,.105,.085,.03,.05,.5,0,-.55).add(BX,wh,.05,1.215,.105,.085,.03,.05,.5,0,.55);
      if(!sex&&(tc===5||tc===7))b.add(BX,red,0,1.07,rAt(1.07)*.78+.008,.04,.22,.014).add(BX,red,0,1.185,.14,.05,.04,.02);
      else if(sex&&bt===2)b.add(SP,red,-.045,1.185,.14,.05,.03,.02).add(SP,red,.045,1.185,.14,.05,.03,.02).add(SP,mixC(red,.25),0,1.185,.15,.02);
      else for(const y of [1.08,.97,.86])b.add(SP,mixC(top,.35),0,y,rAt(y)*.78+.004,.013)}
    else if(!role){b.add(cyl(.08,.088),mixC(top,.25),0,1.218,0,1,.025,.8);const y=1.0,r=rAt(y)+.003;b.add(cyl(r,r-.004),mixC(top,.35,0xffffff),0,y,0,1,.06,.78)}
    b.add(HEAD,skin,0,hy,0,R,R*.96,R*.97).add(SP,skin,-.285,hy-.03,0,.04,.06,.035).add(SP,skin,.285,hy-.03,0,.04,.06,.035);
    // hair
    const Rh=R*1.05,spike=(a,pol,len,wd,rz,geo,col)=>b.add(geo||SPIKE,col||hair,Math.sin(a)*Math.sin(pol)*Rh,hy+Math.cos(pol)*Rh*.97,Math.cos(a)*Math.sin(pol)*Rh,wd||.075,len,.034,Math.PI-(Math.PI/2-pol),a,rz||0);
    const capH=(r,th,tilt)=>b.add(capG(th),hair,0,hy+.005,-.012,r,r,r,tilt,0,0);
    const fringe=(as,len,rz,geo)=>as.forEach((a,i)=>spike(a,.93+len/2/R,len*(i%2?.92:1),.078,rz,geo));
    const nape=()=>{for(const a of [Math.PI-.55,Math.PI,Math.PI+.55])spike(a,2.0,.15,.09)};
    if(hat!=='hood'){
      if(hs===1){capH(R*1.035,1.38,-.45);fringe([-.8,-.4,0,.4,.8],.07)}
      else{capH(R*1.06,1.5,-.5);B.n.add(ARC,hl,0,hy+.225,.01,.238,.238,.238,Math.PI/2,-(Math.PI/2-.8),0)}
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
    if(role==='AB'){B.e.add(new T.TorusGeometry(1,.1,6,24),0x7dffb0,0,hy+.5,0,.24,.24,.24,Math.PI/2,0,0).add(BX,0x7dffb0,0,1.02,z0(1.02)+.04,.16,.05,.012).add(BX,0x7dffb0,0,1.02,z0(1.02)+.04,.05,.16,.012)}
    B.done();
    const face=new T.Mesh(FACE,faceM(faceTex(sex,EYE[hc],mixC(hair,hc===3||hc===5?.5:.25),fv),gh));face.position.set(0,hy,0);face.scale.set(R*1.012,R*.96*1.012,R*.97*1.012);if(id)face.userData.id=id;if(gh)face.renderOrder=1;g.add(face);
    // arms; the first one (the figure's right hand) carries whatever the identity holds
    const arms=[-1,1].map((sd,ai)=>{const G=new T.Group();G.position.set(sd*(w+.045),1.14,0);const L=limb(G),p=L.t;
      p.add(SP,top,0,0,0,.068);
      if(sl)p.add(cyl(.062,.05),top,0,-.2,0,1,.4,1).add(cyl(.055,.055),role||coat?mixC(top,.2):wh,0,-.41,0,1,.03,1);
      else p.add(cyl(.066,.064),top,0,-.08,0,1,.16,1).add(cyl(.05,.042),skin,0,-.3,0,1,.28,1);
      if(role==='thief'&&sl)for(const y of [-.1,-.24,-.36])p.add(cyl(.064,.06),dk,0,y,0,1,.05,1);
      p.add(SP,skin,0,-.47,0,.056);
      if(role&&ai===0){const y=-.52;
        if(role==='T'){p.add(SP,0x111315,0,y-.1,.02,.13).add(cyl(.02,.02,6),0xd9c48a,0,y+.05,.02,1,.1,1);L.e.add(SP,0xff8a2a,0,y+.11,.02,.04)}
        else if(role==='R'){p.add(cyl(.035,.035,10),0xcfe9ef,0,y+.02,.02,1,.12,1);L.e.add(cyl(.045,.12,12),0x6fe08a,0,y-.11,.02,1,.16,1)}
        else if(role==='I'||role==='cop')p.add(BX,0x15181c,0,y-.03,.08,.05,.09,.22);
        else if(role==='F'){p.add(cyl(.035,.035,10),0xf2ecd8,0,y+.04,.02,1,.26,1);L.e.add(SP,0xffb347,0,y+.21,.02,.04,.06,.04)}
        else if(role==='corrupt')p.add(BX,0x4fbf6a,0,y-.02,.05,.2,.03,.11).add(BX,0x6fdc8a,0,y+.01,.05,.2,.03,.11,0,.3,0);
        else if(role==='J')p.add(BX,wh,0,y-.02,.04,.13,.17,.015).add(BX,0x9aa4a8,0,y+.05,.05,.1,.012,.016);
        G.rotation.x=role==='T'||role==='thief'?-.35:role==='C'||role==='AB'?-2.7:-1.05}
      L.done();g.add(G);return G});
    return{g,arms,legs};
  }
  function roleFigure(key,opt){const o=opt||{};return human(o.look||A.LOOKS[key==='thief'?2:0][1],null,{role:key,ghost:o.ghost,color:o.color}).g}
  let thR=null,thS=null,thC=null;
  api.palette=PAL;
  api.thumb=(look,w,h,role)=>{try{                                   // a small portrait of a look, as an image
    if(!thR){thR=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});thS=new T.Scene();thS.add(new T.HemisphereLight(0xffffff,0x55606a,1.05));
      const d=new T.DirectionalLight(0xffffff,.55);d.position.set(2,4,5);thS.add(d);thC=new T.PerspectiveCamera(28,1,.1,20)}
    thR.setPixelRatio(1);thR.setSize(w,h,false);thC.aspect=w/h;thC.updateProjectionMatrix();thC.position.set(1.3,1.5,4.6);thC.lookAt(0,1.02,0);
    const f=human(look,null,role?{role}:null).g;f.rotation.y=.3;thS.add(f);thR.render(thS,thC);const url=thR.domElement.toDataURL('image/png');thS.remove(f);f.traverse(o=>{if(o.isMesh&&o.geometry!==FACE)o.geometry.dispose()});return url}catch(e){return''}};

  /* ---------- 感染戰: a building to walk around (2 halls + 6 rooms) ---------- */
  const M=A.MAP,spawnOf=A.spawnOf;
  // how each action looks: [arm raise, motion, prop]. 0-6 gestures, 7 sitting, 8-11 using the building
  const GL=[[.9,'side',''],[1.9,'still',''],[1.57,'still','gun'],[1.3,'still','box'],[.25,'bow',''],[1.4,'rps',''],[1.7,'pat',''],
    [0,'sit',''],[1.9,'pat',''],[1.3,'thrust','box'],[1.3,'clink','cup'],[2.3,'still','']];
  const FLOOR={corr:0x39414a,round:0x16242d,lounge:0x1c2b35,library:0x2b251e,locker:0x222b31,tea:0x24302a,music:0x2c2532,store:0x26241f,clinic:0x25323a};
  const ACTN={book:'倒放書本',letter:'投信',tea:'倒茶',light:'關燈'};
  const PZ=M.size+9;let wasOver=false;
  // the curtain call: everybody on shelves facing the camera, in whatever grid fills the screen best
  function lineSpot(i,n){let cols=1,bs=0;for(let c=1;c<=n;c++){const sc=Math.min(cam.aspect/(c*1.3),1/(Math.ceil(n/c)*2.95));if(sc>bs+1e-6){bs=sc;cols=c}}
    const rows=Math.ceil(n/cols),row=Math.floor(i/cols),inRow=Math.min(cols,n-row*cols);
    return{x:(i%cols-(inRow-1)/2)*1.3,y:(rows-1-row)*2.95,z:PZ,cols,rows}}
  let env={dark:[],books:[],lockers:[]},eo={books:{},flags:{},dark:{},plates:{},signs:[]},seated=false,prog=null,nearKey='',nearT=0,camD=4.6;
  const box=(w,h,d,m,x,y,z,ry)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);if(ry)o.rotation.y=ry;root.add(o);return o};
  function buildRoom(S){
    clear();const n=S.players.length,g=S.g;eo={books:{},flags:{},dark:{},plates:{},signs:[]};env={dark:[],books:[],lockers:[]};seated=false;prog=null;nearKey='';
    M.rooms.forEach((r,ri)=>{const w=r.x1-r.x0,d=r.z1-r.z0,f=new T.Mesh(new T.PlaneGeometry(w,d),mat(FLOOR[r.id]));f.rotation.x=-Math.PI/2;f.position.set((r.x0+r.x1)/2,r.corr?.003*ri:0,(r.z0+r.z1)/2);root.add(f);
      if(!r.hall&&!r.corr){const dk=new T.Mesh(new T.BoxGeometry(w-.24,2.7,d-.24),new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.66,side:T.DoubleSide,depthWrite:false}));
        dk.position.set((r.x0+r.x1)/2,1.36,(r.z0+r.z1)/2);dk.visible=false;dk.renderOrder=3;root.add(dk);eo.dark[r.id]=dk}});
    const wm=mat(0x1f3640);
    M.rooms.filter(r=>r.corr).forEach((r,i)=>{const w=r.x1-r.x0,d=r.z1-r.z0,lx=w>d,len=lx?w:d,run=new T.Mesh(new T.PlaneGeometry(lx?w-.6:1.5,lx?1.5:d-.6),mat(0x6b2b33));     // carpet runner + ceiling lamps
      run.rotation.x=-Math.PI/2;run.position.set((r.x0+r.x1)/2,.045+.002*i,(r.z0+r.z1)/2);root.add(run);
      for(let k=0,nl=Math.round(len/6);k<nl;k++){const t=(k+.5)/nl,x=lx?r.x0+w*t:(r.x0+r.x1)/2,z=lx?(r.z0+r.z1)/2:r.z0+d*t;
        const lb=new T.Mesh(new T.SphereGeometry(.13,10,8),new T.MeshBasicMaterial({color:0xffe6b8}));lb.position.set(x,2.75,z);root.add(lb)}
      if(lx){const cl=new T.PointLight(0xffe2b0,.9,30);cl.position.set(0,3,(r.z0+r.z1)/2);root.add(cl)}});
    for(const w of M.walls){const gaps=M.doors.filter(d=>d.ax===w.ax&&d.c===w.c&&d.p>w.a&&d.p<w.b).sort((a,b)=>a.p-b.p);let at=w.a;const segs=[];
      for(const d of gaps){segs.push([at,d.p-d.w/2]);at=d.p+d.w/2}segs.push([at,w.b]);
      for(const [a,b] of segs){const len=b-a;if(len<.05)continue;if(w.ax==='x')box(len,2.6,.2,wm,(a+b)/2,1.3,w.c);else box(.2,2.6,len,wm,w.c,1.3,(a+b)/2)}}
    for(const d of M.doors){                                   // a sign over every door; a light switch beside the doors of the six rooms
      if(d.ax==='z'){const r=M.rooms.find(r=>r.hall&&(r.x0===d.c||r.x1===d.c));if(r){const sg=label(r.n,'#f1cf63',.6,{atten:true,depth:true});sg.position.set(d.c,3.0,d.p);root.add(sg);eo.signs.push(sg)}continue}
      const r=M.rooms.find(r=>!r.corr&&d.p>r.x0&&d.p<r.x1&&(r.z0===d.c||r.z1===d.c));if(!r)continue;
      const sg=label(r.n,'#f1cf63',.6,{atten:true,depth:true});sg.position.set(d.p,3.0,d.c);root.add(sg);eo.signs.push(sg);
      if(!r.hall){const sw=M.switches[r.id],pz=d.c+(r.z1===d.c?-.13:.13);eo.plates[r.id]=box(.2,.28,.06,new T.MeshStandardMaterial({color:0xf1cf63,emissive:0xa87a10}),sw.x,1.3,pz)}}
    // 圓桌廳
    const tb=M.table,top=new T.Mesh(new T.CylinderGeometry(tb.r,tb.r,.14,44),mat(0x5b3e2c));top.position.set(tb.x,.95,tb.z);root.add(top);
    const leg=new T.Mesh(new T.CylinderGeometry(.3,.55,.9,20),mat(0x3a281d));leg.position.set(tb.x,.45,tb.z);root.add(leg);
    const bulb=new T.Mesh(new T.SphereGeometry(.16,12,10),new T.MeshBasicMaterial({color:0xffd9a0}));bulb.position.set(tb.x,3.3,tb.z);root.add(bulb);
    lamp.position.set(tb.x,3.2,tb.z);lamp.intensity=1.2;
    const lamp2=new T.PointLight(0xffe2b0,1.0,24);lamp2.position.set(M.lounge.x,3.2,M.lounge.z);root.add(lamp2);
    // 交誼廳: benches
    M.benches.forEach(b=>{const gb=new T.Group();gb.position.set(b.x,0,b.z);gb.rotation.y=b.r;
      const seat=new T.Mesh(new T.BoxGeometry(4.0,.12,.55),mat(0x7a5a3a));seat.position.y=.46;const back=new T.Mesh(new T.BoxGeometry(4.0,.6,.1),mat(0x5e442b));back.position.set(0,.8,-.3);
      const l1=new T.Mesh(new T.BoxGeometry(.1,.46,.5),mat(0x2b2018));l1.position.set(-1.9,.23,0);const l2=l1.clone();l2.position.x=1.9;gb.add(seat,back,l1,l2);root.add(gb)});
    const pz=new T.Mesh(new T.CircleGeometry(7,44),mat(0x243540));pz.rotation.x=-Math.PI/2;pz.position.set(0,.01,PZ);root.add(pz);   // where everybody lines up when the game is over
    const rug=new T.Mesh(new T.CircleGeometry(2.4,32),mat(0x3a2a35));rug.rotation.x=-Math.PI/2;rug.position.set(M.lounge.x,.01,M.lounge.z);root.add(rug);
    // 圖書室: one book per seat number
    const sh=M.shelf;box(4.6,2.3,.4,mat(0x3d2c1e),sh.x,1.15,sh.z-.62);box(4.6,.06,.36,mat(0x2a1e14),sh.x,1.22,sh.z-.5);box(4.6,.06,.36,mat(0x2a1e14),sh.x,.47,sh.z-.5);
    const HUE=[0x6b8fb5,0x7fb58a,0xb58a6b,0xa97fb5,0xb5a36b,0x6bb5ac,0xb56b7e,0x8a93b5];
    for(let i=1;i<=n;i++){const col=(i-1)%8,row=Math.floor((i-1)/8),x=sh.x-1.75+col*.5,y=1.52-row*.75;
      const bk=new T.Mesh(new T.BoxGeometry(.3,.52,.22),new T.MeshStandardMaterial({color:HUE[(i-1)%8],roughness:.8}));bk.position.set(x,y,sh.z-.4);bk.userData.base=HUE[(i-1)%8];root.add(bk);eo.books[i]=bk;
      const nl=label(String(i),'#ffffff',.3,{atten:true,depth:true});nl.position.set(x,y+.02,sh.z-.26);root.add(nl)}
    // 置物間: one locker per seat number
    const lk=M.lockers;
    for(let i=1;i<=n;i++){const col=(i-1)%8,row=Math.floor((i-1)/8),x=lk.x-1.75+col*.5,y=1.55-row*.95;
      box(.46,.86,.4,mat(i%2?0x4c6170:0x566d7d),x,y,lk.z-.6);const nl=label(String(i),'#ffffff',.3,{atten:true,depth:true});nl.position.set(x,y+.15,lk.z-.37);root.add(nl);
      const fl=box(.16,.2,.05,new T.MeshStandardMaterial({color:0xe2594c,emissive:0x8a1f14}),x+.12,y-.2,lk.z-.37);fl.visible=false;eo.flags[i]=fl}
    // 茶水間, 音樂室, 醫務室, 儲藏室
    const tt=M.tea,tm=new T.Mesh(new T.CylinderGeometry(.7,.7,.1,28),mat(0xd9c9a8));tm.position.set(tt.x,.82,tt.z);root.add(tm);
    const tl=new T.Mesh(new T.CylinderGeometry(.12,.3,.8,14),mat(0x8a7a5a));tl.position.set(tt.x,.4,tt.z);root.add(tl);
    const pot=new T.Mesh(new T.SphereGeometry(.2,14,10),mat(0x7fd4e8));pot.position.set(tt.x,1.03,tt.z);root.add(pot);
    const D=M.deco;box(1.7,1.0,1.0,mat(0x15181c),D.piano.x,.5,D.piano.z);box(1.5,.08,.3,mat(0xf2f2ee),D.piano.x,1.02,D.piano.z-.6);
    box(1.2,.5,2.0,mat(0xe9eef0),D.bed.x,.25,D.bed.z);box(1.2,.16,.5,mat(0x8fd8ff),D.bed.x,.58,D.bed.z+.7);
    box(.9,.9,.9,mat(0x7a5a3a),D.crates.x-.2,.45,D.crates.z+.2);box(.8,.8,.8,mat(0x6b4d30),D.crates.x+.5,.4,D.crates.z-.4,.4);box(.7,.7,.7,mat(0x86633f),D.crates.x-.1,1.25,D.crates.z+.1,.2);
    // people
    S.players.forEach((p,i)=>{
      const gg=new T.Group(),H=human(p.look||A.LOOKS[i%A.LOOKS.length][1],p.id),pivot=H.g,arm=H.arms[0],arm2=H.arms[1];
      pivot.traverse(o=>{if(o.isMesh)picks.push(o)});
      const props={gun:new T.Mesh(G.gun,mat(0x111418)),cup:new T.Mesh(G.cup,mat(0x7fd4e8)),box:new T.Mesh(G.box,mat(0xf1cf63))};
      for(const k in props){props[k].position.y=-.53;props[k].visible=false;arm.add(props[k])}props.gun.rotation.x=Math.PI/2;
      gg.add(pivot);
      const ring=new T.Mesh(G.ring,new T.MeshBasicMaterial({color:0xe8a33d}));ring.rotation.x=Math.PI/2;ring.position.y=.04;ring.visible=false;gg.add(ring);
      const name=label((g.seat&&g.seat[p.id]?g.seat[p.id]+'號 ':'')+p.name,'#ece4d0',.06,{depth:true,w:448});name.position.y=2.34;gg.add(name);
      const gl=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,sizeAttenuation:true}));gl.scale.set(2.2,.55,1);gl.position.set(0,2.95,0);gl.visible=false;gl.renderOrder=4;gg.add(gl);
      const sp=spawnOf(i,n);gg.position.set(sp.x,0,sp.z);gg.rotation.y=sp.r;root.add(gg);
      const bub=new T.Sprite(new T.SpriteMaterial({map:texOf('說話中','#8fe3ff'),transparent:true,depthTest:true,sizeAttenuation:true}));bub.scale.set(1.5,.375,1);bub.position.set(0,2.5,0);bub.visible=false;gg.add(bub);
      figs[p.id]={g:gg,pivot,arm,arm2,legs:H.legs,props,ring,gl,bub,name,dead:false,role:null,gi:-1,sp,art:null,artKey:'',shown:true,walk:0,lx:sp.x,lz:sp.z};
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
      if(rk!==f.artKey){if(f.art)f.g.remove(f.art);f.art=null;f.artKey=rk;
        if(rk){const pi=S.players.findIndex(q=>q.id===id);f.art=roleFigure(rk.replace('~',''),{ghost:!over,look:S.players[pi].look||A.LOOKS[pi%A.LOOKS.length][1]});f.g.add(f.art);f.pop=(fresh||still)?1:0;f.pivot.visible=false;f.gl.visible=false}else f.pivot.visible=true}
      if(R&&(!alive||over)&&!f.role){f.role=label(R.n,'#f1cf63',.055,{depth:false});f.role.position.y=2.34;f.role.center.set(.5,-.6);f.g.add(f.role)}
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
          if(el2>HOLD+3000)stopGesture()}}
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
    const over=S.phase==='over',ids=Object.keys(figs);if(over!==wasOver){wasOver=over;if(over)camYaw=Math.PI}
    for(const id in figs){const f=figs[id],p=peers[id];if(!p)continue;const self=id===me&&mine,vis=over||!p.hidden||id===me;
      if(f.shown!==vis){f.shown=vis;f.g.visible=vis}if(!vis)continue;
      if(over){const L=lineSpot(ids.indexOf(id),ids.length);f.g.position.set(L.x,L.y,L.z);f.g.rotation.y=0;f.gl.visible=false;
        if(!f.lined){f.lined=true;f.name.visible=true;f.name.material.sizeAttenuation=true;f.name.material.needsUpdate=true;f.name.scale.set(1.89,.27,1);f.name.position.y=2.27;        // labels become part of the scene so they shrink with the figures
          if(f.role){f.role.material.sizeAttenuation=true;f.role.material.depthTest=true;f.role.material.needsUpdate=true;f.role.scale.set(1.36,.34,1);f.role.center.set(.5,.5);f.role.position.y=2.6}
          f.step=new T.Mesh(G.box,mat(0x2f4350));f.step.scale.set(7.6,.5,5);f.step.position.y=-.045;f.g.add(f.step)}}
      else if(self){f.g.position.set(p.x,0,p.z);f.g.rotation.y=p.r}
      else{f.g.position.x+=(p.x-f.g.position.x)*.22;f.g.position.z+=(p.z-f.g.position.z)*.22;
        let dr=p.r-f.g.rotation.y;dr=Math.atan2(Math.sin(dr),Math.cos(dr));f.g.rotation.y+=dr*.25}
      if(f.art){f.pop=Math.min(1,(f.pop||0)+.05);const e=1-Math.pow(1-f.pop,3);f.art.scale.setScalar(.55+.45*e);if(!still&&cur.S.phase==='over')f.art.position.y=Math.abs(Math.sin(t/500+f.sp.r*2))*.05;continue}
      const gi=p.gi,dk=env.dark.length&&env.dark.includes(A.roomOf(f.g.position.x,f.g.position.z));
      if(gi!==f.gi){f.gi=gi;for(const k in f.props)f.props[k].visible=gi>=0&&GL[gi][2]===k;if(gi>=0){f.gl.material.map=texOf(GN[gi],'#ffe9a8');f.gl.material.needsUpdate=true}}
      f.gl.visible=gi>=0&&!dk;f.name.visible=!dk;                          // in a dark room nobody can read what you are doing
      let ax=0,az=0,bow=0,sit=0;
      if(gi>=0){const L=GL[gi],w=still?0:t/1000;ax=-L[0];
        if(L[1]==='thrust')ax+=Math.sin(w*6)*.3;else if(L[1]==='clink')az=Math.sin(w*4)*.25;else if(L[1]==='rps')ax+=Math.sin(w*8)*.55;else if(L[1]==='pat')ax+=Math.sin(w*14)*.14;
        else if(L[1]==='side')az=-.9;else if(L[1]==='bow')bow=.55+Math.sin(w*3)*.1;else if(L[1]==='sit'){sit=-.16;ax=-.5}}
      f.arm.rotation.x+=(ax-f.arm.rotation.x)*.3;f.arm.rotation.z+=(az-f.arm.rotation.z)*.3;f.arm2.rotation.x=f.arm.rotation.x;f.arm2.rotation.z=-f.arm.rotation.z;f.pivot.rotation.x+=(bow-f.pivot.rotation.x)*.2;
      f.pivot.position.y+=(sit-f.pivot.position.y)*.25;
      const mv=Math.hypot(f.g.position.x-f.lx,f.g.position.z-f.lz);f.lx=f.g.position.x;f.lz=f.g.position.z;f.walk+=mv*4.2;const sw=mv>.002&&!still?Math.sin(f.walk)*.55:0;
      const lt=sit?-1.45:sw;f.legs[0].rotation.x+=(lt-f.legs[0].rotation.x)*.3;f.legs[1].rotation.x+=((sit?-1.45:-sw)-f.legs[1].rotation.x)*.3;
      if(gi<0){f.arm.rotation.x+=(-sw*.7-f.arm.rotation.x)*.3;f.arm2.rotation.x+=(sw*.7-f.arm2.rotation.x)*.3}
    }
    const cx=me3.ok?me3.x:M.table.x,cz=me3.ok?me3.z:M.table.z,sx=Math.sin(camYaw),sz=Math.cos(camYaw);
    let D=4.6;                                   // pull the camera in when a wall or a piece of furniture is in the way
    for(let d=.5;d<=4.6;d+=.2){const x=cx-sx*d,z=cz-sz*d;if(!A.walkable(x,z,.22)||A.blocked(x,z)&&Math.hypot(x-M.table.x,z-M.table.z)>M.table.r+.4){D=Math.max(.8,d-.3);break}}
    camD+=(D-camD)*(D<camD?.5:.12);
    if(over){const L=lineSpot(0,ids.length),hw=L.cols*.65,top=L.rows*2.95,th=Math.tan(cam.fov/2*Math.PI/180),D=Math.max(hw/(th*cam.aspect),top/2/th)*1.03+.5,a=camYaw-Math.PI;   // results: the line-up, seen from the front; drag to walk around it
      lamp.position.set(0,5,PZ+3);cam.position.set(Math.sin(a)*D,top/2-.12,PZ+Math.cos(a)*D);cam.lookAt(0,top/2-.12,PZ)}
    else{cam.position.set(cx-sx*camD,1.9+camD/4.6*1.1+(4.6-camD)*.3,cz-sz*camD);cam.lookAt(cx,1.25+(4.6-camD)*.08,cz)}
    for(const sg of eo.signs)sg.visible=sg.position.distanceToSquared(cam.position)>14;      // a door sign right above the camera would fill the screen
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
      p.m.scale.setScalar(id===me?.8:.62)});
    stick.hidden=true;gbar.hidden=true;mini.hidden=true;ctx.hidden=true;tip.textContent='左右拖曳旋轉・點車站選取';
  }

  function size(){
    const w=el.clientWidth||320,h=api.fill?(el.clientHeight||240):Math.round(kind==='virus'?Math.max(280,Math.min(w*1.05,window.innerHeight*.6)):w);
    renderer.setSize(w,h);cam.aspect=w/h;cam.fov=kind==='virus'?52:42;cam.updateProjectionMatrix();
    const t=Math.tan(cam.fov/2*Math.PI/180);fit=Math.max(5.9/(t*cam.aspect),5.4/t);
  }
  let lastT=0,qLv=0,qN=0,qT0=0;
  // a phone that cannot keep up gets a lower drawing resolution first, then loses the ink outlines
  function quality(t){
    if(!qT0||t-qT0>4500){qT0=t;qN=0;return}qN++;const e=t-qT0;if(e<2500)return;const fps=qN*1000/e;qT0=t;qN=0;
    if(fps>=20||qLv>=2||pxq)return;qLv++;renderer.setPixelRatio(qLv===1?Math.min(window.devicePixelRatio||1,1.25):1);if(qLv===2)inkM.visible=false;size()}
  function frame(t){
    if(!el.isConnected){raf=0;return}raf=requestAnimationFrame(frame);quality(t);
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
  api.speak=(id,v)=>{speak[id]=!!v;const f=figs[id];if(f)f.bub.visible=!!v&&!f.art};
  api.inRoom=()=>kind==='virus'&&me3.ok;
  api.gesture=(gi,t,k,name)=>{if(kind!=='virus'||!figs[t])return'對象不在場';if(seated)return'請先站起來';if(distTo(t)>RANGE)return'太遠了，先走到他旁邊（約兩步內）';prog=null;gest={gi,t,k:k||'',name:name||'',t0:Date.now()};beat();return''};
  // while an action is being held the server must keep hearing from us, even if this phone draws only a frame or two per second
  function beat(){if(kind!=='virus'||!gest||!api.onPos||!me3.ok)return;lastSendT=Date.now();api.onPos({x:me3.x,z:me3.z,r:me3.r,gi:gest.gi,gt:gest.t,gk:gest.k})}
  setInterval(()=>{if(gest&&el.isConnected&&Date.now()-lastSendT>550)beat()},600);
  api.stop=()=>stopGesture(true);
  api.busy=()=>!!gest;
  api.setYaw=y=>{camYaw=y};
  api.debug=()=>({quality:qLv,art:Object.fromEntries(Object.entries(figs).map(([k,f])=>[k,f.artKey])),me:Object.assign({},me3),peers:JSON.parse(JSON.stringify(peers)),gest,camYaw,seated,prog,env,room:A.roomOf(me3.x,me3.z),near:nearObjs()});
  api.teleport=(x,z)=>{if(!A.walkable(x,z)||A.blocked(x,z))return false;if(seated){seated=false;if(api.onEnv)api.onEnv({a:'stand'})}me3.x=x;me3.z=z;return true};
  api.env=m=>{env={dark:m.dark||[],books:m.books||[],lockers:m.lockers||[]};if(kind==='virus'&&root)applyEnv()};
  api.seat=(x,z,r)=>{me3.x=x;me3.z=z;me3.r=r;seated=true;gest=null;prog=null;nearKey=''};
  api.progress=(a,ms)=>{prog={a,t0:Date.now(),ms:ms||HOLD};gest=null};
  api.done=()=>{prog=null;gest=null;gbar.hidden=true;nearKey=''};
  api.room=()=>me3.ok?A.roomOf(me3.x,me3.z):'';
  api.roomOf=id=>{const p=peers[id];return p&&!p.hidden?A.roomOf(p.x,p.z):''};
  api.setCtx=h=>{if(ctx._h!==h){ctx._h=h;ctx.innerHTML=h}};
  api.setHud=h=>{hud.innerHTML=h};api.resize=()=>size();api.fill=false;api.rot=false;
  api.refreshNear=()=>{nearKey=''};
  api.screenOf=id=>{const f=figs[id];if(!f)return null;const v=new T.Vector3(f.g.position.x,1,f.g.position.z).project(cam),r=cv.getBoundingClientRect(),lx=(v.x+1)/2,ly=(1-v.y)/2;return api.rot?[r.right-ly*r.width,r.top+lx*r.height]:[r.left+lx*r.width,r.top+ly*r.height]};   // where a player is on the screen (for tests)
  api.stand=()=>{seated=false;nearKey=''};
  return api;
})();
