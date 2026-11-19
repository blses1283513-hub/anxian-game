// runs inside the page: builds a 16-person game and defines every shot of the promo
(()=>{const A=window.AX,S3=window.Stage3D,PI=Math.PI;
const NAMES=['阿哲','小美','阿凱','Leo','佳佳','大熊','Momo','小雨','Ken','安安','Jay','老王','Yuki','阿福','Nina','小光'];
let S,slot,ui={},me='__cam';
const TB={x:-9.5,z:0},ring=(i,n,rad)=>{const a=i/n*PI*2;return{x:TB.x+Math.sin(a)*rad,z:TB.z+Math.cos(a)*rad,r:a+PI}};
const lerp=(a,b,k)=>a+(b-a)*k,ease=k=>k<0?0:k>1?1:k*k*(3-2*k),L3=(a,b,k)=>a.map((v,i)=>lerp(v,b[i],k));
function fresh(roles){S=A.newState('virus','p0','CINE');S.opts.verify='none';S.opts.briefSec=0;
  NAMES.forEach((n,i)=>S.players.push({id:'p'+i,name:n,look:A.LOOKS[(i*7)%20][1].slice()}));
  A.act(S,'p0',{k:'start'},true);S.g.round=1;S.g.briefEnd=0;S.gid='g'+Math.random();
  if(roles)for(const id in roles)S.g.roles[id]=roles[id];
  if(!slot){slot=document.createElement('div');slot.style.cssText='position:fixed;left:0;top:0;z-index:99;background:#000';document.body.appendChild(slot);
    const st=document.createElement('style');st.textContent='.stage .stick,.stage .mini,.stage .ctx,.stage .stagetip,.stage .stl{display:none!important}';document.head.appendChild(st)}
}
let pos={};
function place(p,snap){pos=Object.assign(pos,p);const out={};for(const id in pos){const q=pos[id];out[id]=[q.x,q.z,q.r||0,q.gi==null?-1:q.gi,q.gt||'']}S3.peers(out,false);if(snap){S3.peers(out,true);S3.attach(slot,S,me,ui,()=>{})}}
function crowd(skip){const p={};S.players.forEach((pl,i)=>{if(skip&&skip.includes(pl.id))return;const q=ring(i,16,3.6);p[pl.id]={x:q.x,z:q.z,r:q.r}});return p}
function park(ids){const p={};ids.forEach((id,i)=>{p[id]={x:-15+i*.9,z:-4.5,r:0}});return p}   // people who are not in the shot stand in a corner of the round hall
function kill(id){S.g.alive[id]=false;S3.attach(slot,S,me,ui,()=>{})}
function talk(list){S.players.forEach(p=>S3.speak(p.id,list.includes(p.id)))}
function setup(W,H){S3.cine.size(W,H);slot.style.width=W+'px';slot.style.height=H+'px';S3.attach(slot,S,me,ui,()=>{});S3.cine.size(W,H)}
const fovFor=(f,W,H)=>W<H?2*Math.atan(Math.tan(f*PI/360)*1.7)*180/PI:f;
const SH={
 dark:{dur:4,init(){fresh({p0:'T',p1:'C'});const p=crowd(['p0','p1']);p.p0={x:-13.4,z:-12.2,r:PI/2};p.p1={x:-10.6,z:-12.6,r:-PI/2};place(p,true);S3.env({dark:['library'],books:[],lockers:[]})},
   frame(t,c){S3.cine.dim(.6);if(t>2.4&&!c.g){c.g=1;place({p0:{x:-13.4,z:-12.2,r:PI/2,gi:2,gt:'p1'}})}if(t>3.25&&!c.k){c.k=1;kill('p1');S3.env({dark:['library'],books:[],lockers:[]})}
     return{p:L3([-11.3,1.95,-9.6],[-11.9,1.75,-10.4],ease(t/4)),l:[-12,1.25,-12.6],fov:50}},
   pframe(t){return{p:L3([-14.7,1.8,-10.6],[-14.5,1.75,-11.0],ease(t/4)),l:[-10.6,1.2,-12.6],fov:42}}},
 title:{dur:4,init(){fresh();place(crowd(),true);talk(['p3','p9'])},
   frame(t){const a=.4+t*.12;return{p:[TB.x+Math.sin(a)*6.5,9.5-t*.4,Math.cos(a)*6.5],l:[TB.x,0.6,0],fov:46}}},
 orbit:{dur:4,init(){fresh();place(crowd(),true)},
   frame(t){talk(t<1.3?['p2']:t<2.7?['p11']:['p6']);const a=2.2+t*.16;return{p:[TB.x+Math.sin(a)*6.3,2.35,Math.cos(a)*6.3],l:[TB.x,1.05,0],fov:50}}},
 faces:{dur:3,init(){fresh();place(crowd(),true);talk(['p5'])},
   frame(t){const a=(4.2+t*.28)/16*PI*2,c={x:TB.x+Math.sin(a)*2.3,z:Math.cos(a)*2.3},f={x:TB.x+Math.sin(a+.04)*3.6,z:Math.cos(a+.04)*3.6};return{p:[c.x,1.72,c.z],l:[f.x,1.68,f.z],fov:36}}},
 walk:{dur:3.5,init(){fresh();const p=crowd(['p4']);p.p4={x:-6,z:7.5,r:PI/2};place(p,true)},
   frame(t){const x=-6+t*2.2;place({p4:{x,z:7.5,r:PI/2}});return{p:[x+2.1,1.45,8.75],l:[x+.1,1.0,7.4],fov:50}}},
 gun:{dur:3,init(){fresh({p7:'T'});const p=crowd(['p7','p8']);p.p7={x:8.2,z:2.6,r:PI};p.p8={x:8.2,z:.4,r:0};place(p,true)},
   frame(t,c){if(t>.4&&!c.g){c.g=1;place({p7:{x:8.2,z:2.6,r:PI,gi:2,gt:'p8'}})}return{p:L3([9.4,1.75,4.0],[9.25,1.7,3.6],t/3),l:[7.95,1.3,.4],fov:44}}},
 give:{dur:1.1,init(){fresh();const p=crowd(['p3','p12']);p.p3={x:5.4,z:-2.5,r:PI/2};p.p12={x:6.6,z:-2.5,r:-PI/2};place(p,true)},
   frame(t,c){if(!c.g){c.g=1;place({p3:{x:5.4,z:-2.5,r:PI/2,gi:3,gt:'p12'}})}return{p:[6,1.4,.2],l:[6,1.1,-2.5],fov:40}}},
 tea:{dur:1.1,init(){fresh();const p=crowd(['p10','p13']);p.p10={x:11.5,z:-11.8,r:PI};p.p13={x:12.7,z:-12.9,r:-PI/2};place(p,true)},
   frame(t,c){if(!c.g){c.g=1;place({p10:{x:11.5,z:-11.8,r:PI,gi:10,gt:'p13'}})}return{p:[9.4,1.65,-10.6],l:[11.7,1.05,-12.6],fov:42}}},
 light:{dur:1.3,init(){fresh();const p=crowd(['p14']);p.p14={x:-10.1,z:-10.15,r:0};place(p,true)},
   frame(t,c){if(!c.g){c.g=1;place({p14:{x:-10.1,z:-10.15,r:0,gi:11}})}if(t>.75&&!c.d){c.d=1;S3.env({dark:['library'],books:[],lockers:[]})}S3.cine.dim(t>.75?Math.min(.6,(t-.75)*3):0);return{p:[-12.4,1.75,-12.9],l:[-10.1,1.35,-9.8],fov:46}}},
 scan:{dur:5,init(){fresh();const p=crowd(['p7','p1','p9']);p.p7={x:10,z:10.4,r:-2.3};p.p1={x:7.0,z:14.7,r:2.4};p.p9={x:6.8,z:13.3,r:2.0};place(p,true)},
   frame(t){const k=ease(Math.min(1,t/1.6)),x=lerp(10,8.95,k),z=lerp(10.4,12.95,k);place({p7:{x,z,r:Math.atan2(8.2-x,12.4-z)}});talk(t>2.2?['p1']:[]);
     return{p:L3([11.4,1.7,10.6],[11.0,1.65,10.9],t/5),l:[8.4,1.15,13.0],fov:46}}},
 shot2:{dur:4,init(){fresh({p5:'T',p6:'C'});const p=crowd(['p5','p6']);p.p5={x:5.8,z:-2,r:PI/2};p.p6={x:9,z:-2,r:-PI/2};place(p,true)},
   frame(t,c){if(t>2.4&&!c.g){c.g=1;place({p5:{x:5.8,z:-2,r:PI/2,gi:2,gt:'p6'}})}if(t>3.1&&!c.k){c.k=1;kill('p6')}
     return{p:L3([7.4,.62,1.9],[7.4,.68,.9],ease(t/3.1)),l:[7.4,1.4,-2],fov:50}},
   pframe(t){return{p:L3([4.4,1.0,-.6],[4.7,1.0,-.9],ease(t/3.1)),l:[9,1.35,-2.2],fov:40}}},
 ghost:{dur:4,init(){fresh();S.g.alive.p6=false;place(crowd(),true);talk(['p2','p13'])},
   frame(t){const a=.5+ease(t/4)*1.9;return{p:[TB.x+Math.sin(a)*7.2,5.6-t*.15,Math.cos(a)*7.2],l:[TB.x,.7,0],fov:50}}},
 results:{dur:5,init(){fresh();place(crowd(),true);const rw={};S.players.forEach(p=>{const r=S.g.roles[p.id];rw[p.id]=r==='T'||r==='F'?0:2});
     S.phase='over';S.result={winner:'citizen',why:'恐怖分子全滅',rw,title:'市民陣營獲勝'};S3.attach(slot,S,me,ui,()=>{});S3.cine.cam(null)},
   frame(){return null}},
 end:{dur:6,init(){fresh();place(crowd(),true);talk(['p0','p8'])},
   frame(t){const a=3.6+t*.09;return{p:[TB.x+Math.sin(a)*7.2,4.2,Math.cos(a)*7.2],l:[TB.x,.9,0],fov:44}}}
};
window.CINE={shots:Object.keys(SH),dur:k=>SH[k].dur,
  start(k,W,H){pos={};fresh();setup(W,H);S3.cine.dim(0);SH[k].init();setup(W,H);this.k=k;this.c={};this.W=W;this.H=H;
    for(let i=0;i<12;i++)this.frame(-.5+i/24,true)},                 // a moment of settling before the first recorded frame
  frame(t,warm){const s=SH[this.k],tt=Math.max(0,t),cm0=s.frame(tt,this.c),cm=this.W<this.H&&s.pframe?s.pframe(tt):cm0;if(cm)S3.cine.cam(cm.p,cm.l,fovFor(cm.fov,this.W,this.H));else S3.cine.cam(null);
    return S3.cine.step(performance.now(),1/24)}};
})();
