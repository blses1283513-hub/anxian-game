/* 暗線遊戲室 — rules engine. Shared by the browser (single-device mode) and the server (referee). */
(function(){
"use strict";
const clone=o=>JSON.parse(JSON.stringify(o));
const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
/* ============ shared engine ============ */
const GAMES={
  virus:{name:'感染戰',min:6,max:16,ds:'隱藏身分。沒有投票，只靠技能、子彈和依號碼擴散的病毒分勝負。'},
  chase:{name:'地鐵追捕',min:5,max:14,ds:'小偷在路線圖上隱藏移動收集贓物，三隊警察調查與逮捕，隊裡藏著內鬼。'}
};
function newState(game,hostId,code){return{v:1,code,game,hostId,phase:'lobby',players:[],kicked:{},
  opts:{deathDelay:2,rounds:5,roundMin:'std',lootGoal:6,maxRounds:15,verify:'3d',knowMates:0,novice:0,briefSec:60},groups:[],ack:{},pub:[],priv:{},chat:[],g:null,result:null}}
/* day lengths: 'std' = the standard schedule, day 1 to 5; a number = the same length every day */
const SCHED=[8,10,10,5,3];
const dayMin=(S,r)=>S.opts.roundMin==='std'?SCHED[Math.min(Math.max(r||1,1),SCHED.length)-1]:+S.opts.roundMin||12;
const nm=(S,id)=>{const p=S.players.find(p=>p.id===id);return p?p.name:'？'};
function pub(S,t){S.pubN=(S.pubN||0)+1;S.pub.push({r:S.g?S.g.round:0,t});if(S.pub.length>150)S.pub.shift()}
function note(S,id,t){(S.priv[id]=S.priv[id]||[]).push({r:S.g.round,t})}

function begin(S){S.pub=[];S.priv={};S.chat=[];S.groups=[];S.result=null;S.again={};S.phase='play';S.gid=Math.random().toString(36).slice(2,8);
  if(S.game==='virus')vDeal(S);else cDeal(S)}
// after a game: everybody who is still here agrees -> deal again at once. Returns true when a new game started.
function rematch(S){const G=GAMES[S.game],n=S.players.length;if(S.phase!=='over'||n<G.min||n>G.max)return false;
  if(!S.players.every(p=>(S.again||{})[p.id]))return false;begin(S);return true}
function act(S,pid,a,isHost){
  if(a.k==='say'){
    const t=String(a.text||'').trim().slice(0,200),v=S.phase==='play'&&S.game==='virus';
    if(!t)return'沒有內容';if(!S.players.some(p=>p.id===pid))return'你不在名單內';
    if(v&&!S.g.alive[pid])return'死者不能發言';
    let to=a.to||'';
    if(to==='#team'){if(!(S.phase!=='lobby'&&S.game==='chase'&&S.g&&S.g.roles[pid]))return'對象無效';to=S.g.roles[pid]==='thief'?'#th':'#t'+S.g.team[pid]}
    else if(to.startsWith('#g')){const G=(S.groups||[]).find(x=>x.id===to);if(!G||!G.m.includes(pid))return'你不在這個群組'}
    else if(to&&(to===pid||!S.players.some(p=>p.id===to)||(v&&!S.g.alive[to])))return'對象無效';
    S.chatN=(S.chatN||0)+1;(S.chat=S.chat||[]).push({i:S.chatN,f:pid,to,t,r:S.g?S.g.round:0});if(S.chat.length>150)S.chat.shift();return}
  if(a.k==='grp'||a.k==='grpinv'||a.k==='grpleave'){
    const valid=id=>S.players.some(p=>p.id===id);
    if(!valid(pid))return'你不在名單內';
    if(S.phase==='play'&&S.game==='virus'&&!S.g.alive[pid])return'死者不能使用群組';
    S.groups=S.groups||[];
    if(a.k==='grp'){const m=[...new Set([pid,...(a.m||[]).filter(valid)])];
      if(m.length<3)return'群組至少要 3 個人，兩個人請直接密談';if(S.groups.length>=30)return'群組數量已達上限';
      S.grpN=(S.grpN||0)+1;S.groups.push({id:'#g'+S.grpN,n:String(a.name||'').trim().slice(0,10)||'群組'+S.grpN,m});return}
    const G=S.groups.find(x=>x.id===a.g);if(!G||!G.m.includes(pid))return'你不在這個群組';
    if(a.k==='grpinv'){(a.m||[]).filter(valid).forEach(id=>{if(!G.m.includes(id))G.m.push(id)});return}
    G.m=G.m.filter(id=>id!==pid);if(G.m.length<2)S.groups=S.groups.filter(x=>x!==G);return}
  if(a.k==='rematch'){if(S.phase!=='over')return'遊戲還沒結束';if(!S.players.some(p=>p.id===pid))return'你不在名單內';
    S.again=S.again||{};if(a.v)S.again[pid]=1;else delete S.again[pid];rematch(S);return}
  if(a.k==='quit'){if(S.phase!=='over')return'現在不能這樣離開';if(!S.players.some(p=>p.id===pid))return;          // leaving the after-game room frees the others to start again
    S.players=S.players.filter(p=>p.id!==pid);if(S.again)delete S.again[pid];if(S.hostId===pid&&S.players.length)S.hostId=S.players[0].id;rematch(S);return}
  if(a.k==='settle'){const g=S.g;if(S.phase!=='play'||S.game!=='virus'||!g||!g.offer||g.offer.no)return'現在沒有提前結束的詢問';
    if(!g.alive[pid])return'只有存活玩家可以表決';
    if(!a.v){g.offer.no=true;pub(S,'有人不同意提前結束，遊戲照常進行。');return}
    g.offer.yes[pid]=1;if(S.players.every(p=>!g.alive[p.id]||g.offer.yes[p.id])){pub(S,'存活玩家全數同意，提前結束。');S.sim=true;let n=0;while(S.phase==='play'&&n++<20)vNext(S);delete S.sim}
    return}
  if(a.k==='look'){if(S.phase!=='lobby')return'遊戲開始後不能換造型';const p=S.players.find(p=>p.id===pid);if(!p)return'你不在名單內';if(!okLook(a.look))return'造型資料不正確';p.look=a.look.slice();return}
  if(['opt','game','start','next','again','kick','add'].includes(a.k)){
    if(!isHost)return'只有房主可以操作';
    if(a.k==='next'){if(S.phase!=='play')return'遊戲未在進行';if(S.game==='chase'&&S.g.briefEnd)return briefDone(S);return S.game==='virus'?vNext(S):cAdvance(S,true)}
    if(a.k==='again'){S.phase='lobby';S.g=null;S.result=null;S.again={};S.pub=[];S.priv={};S.chat=[];S.groups=[];return}
    if(S.phase!=='lobby')return'遊戲已開始';
    if(a.k==='opt'){const ok={deathDelay:[1,2],roundMin:['std',5,10,12,15,30],lootGoal:[5,6,7],verify:['3d','none'],knowMates:[0,1],novice:[0,1]}[a.o];if(!ok||!ok.includes(a.v))return'不支援的設定';S.opts[a.o]=a.v;
      if(a.o==='novice'&&a.v)S.opts.knowMates=1;if(a.o==='knowMates'&&!a.v)S.opts.novice=0;return}
    if(a.k==='game'){if(!GAMES[a.v])return'沒有這款遊戲';S.game=a.v;return}
    if(a.k==='kick'){S.players=S.players.filter(p=>p.id!==a.t);S.kicked[a.t]=1;return}
    if(a.k==='add'){if(S.players.length>=16)return'人數已滿';S.players.push({id:a.id,name:a.name,look:LOOKS[S.players.length%LOOKS.length][1].slice()});return}
    if(a.k==='start'){const G=GAMES[S.game],n=S.players.length;
      if(n<G.min||n>G.max)return`${G.name}需要 ${G.min}–${G.max} 人`;
      begin(S);return}
  }
  if(S.phase!=='play')return'遊戲未在進行';
  if(a.k==='scan'){if(S.game!=='virus')return'沒有這個操作';if(S.opts.verify==='3d')return'要走到醫務室的感染檢測儀旁邊才能使用';return vScan(S,pid)}
  if(S.practice&&S.game==='virus')return'練習場不會發動技能，只練習動作';
  return S.game==='virus'?vAct(S,pid,a):cAct(S,pid,a);
}

/* ============ 感染戰 ============ */
const VR={
  T:{n:'恐怖分子',f:'恐怖分子陣營',c:'threat',d:['病毒：全隊只有一次，指定 1 人感染','子彈：你個人一次，立刻擊殺 1 人','解毒劑：你個人一次，治好 1 名感染者（可用在自己）','勝利：至少一名恐怖分子存活，其餘玩家除抗體保有者外全部死亡']},
  C:{n:'一般市民',f:'市民陣營',c:'safe',d:['沒有主動技能','你可能帶有抗體，但自己不會知道；讓研究員對你製藥才查得出來','勝利：恐怖分子全滅，或解毒劑製成']},
  R:{n:'研究員',f:'市民陣營',c:'safe',d:['製藥：每日指定 1 名受試者；對方是抗體保有者才成功','全隊每日最多成功 1 次，累計 2 次解毒劑完成，市民立刻獲勝','第 1 次成功後，下一日會全場公告「製造準備中」']},
  J:{n:'記者',f:'市民陣營',c:'safe',d:['查驗：每日確認 1 名玩家的角色','看不出對方有沒有抗體']},
  I:{n:'搜查官',f:'中立',c:'neutral',d:['子彈：每日可擊殺 1 人','勝利：恐怖分子全部死亡；越早達成獎勵越高']},
  F:{n:'狂熱分子',f:'中立',c:'neutral',d:['沒有主動技能','勝利：自己死亡；越早死獎勵越高']}
};
/* 12 actions. 0-6 are gestures done next to the target; 7-11 use the building. */
const GN=['挽手臂','搭肩','比槍','遞東西','鞠躬','猜拳','拍背','同坐長椅','倒放書本','投信','倒茶','關燈'];
const TASKS=[['走到對方旁邊，挽住他的手臂 3 秒',0],['走到對方旁邊，把手搭在他肩上 3 秒',1],['走到對方旁邊，用手指比槍對準他 3 秒',2],['走到對方旁邊，遞一樣東西給他，持續 3 秒',3],
  ['走到對方旁邊，向他鞠躬 3 秒',4],['走到對方旁邊，和他猜拳 3 秒',5],['走到對方旁邊，拍他的背 3 秒',6],
  ['和對方同時坐在交誼廳的同一張長椅上 3 秒',7],['到圖書室的書架前，把對方座號的那本書倒過來',8],['到置物間，把信投進對方座號的置物櫃',9],
  ['對方站在茶水間的茶桌旁時，在茶桌前為他倒茶 3 秒',10],['房間裡只有你和對方兩個人時關掉電燈，維持 3 秒',11]];
/* ---------- the building: 2 halls, 6 rooms, 3 corridors (34 x 34) ---------- */
const MAP={
  rooms:[{id:'round',n:'圓桌廳',x0:-17,x1:-2,z0:-6,z1:6,hall:1},{id:'lounge',n:'交誼廳',x0:2,x1:17,z0:-6,z1:6,hall:1},
    {id:'library',n:'圖書室',x0:-17,x1:-6,z0:-17,z1:-9},{id:'locker',n:'置物間',x0:-6,x1:6,z0:-17,z1:-9},{id:'tea',n:'茶水間',x0:6,x1:17,z0:-17,z1:-9},
    {id:'store',n:'儲藏室',x0:-17,x1:-6,z0:9,z1:17},{id:'music',n:'音樂室',x0:-6,x1:6,z0:9,z1:17},{id:'clinic',n:'醫務室',x0:6,x1:17,z0:9,z1:17},
    {id:'corr',n:'走廊',x0:-17,x1:17,z0:-9,z1:-6,corr:1},{id:'corr',n:'走廊',x0:-17,x1:17,z0:6,z1:9,corr:1},{id:'corr',n:'走廊',x0:-2,x1:2,z0:-9,z1:9,corr:1}],
  // walls: ax 'x' runs along x at z=c from a to b; ax 'z' runs along z at x=c
  walls:[{ax:'x',c:-17,a:-17,b:17},{ax:'x',c:-9,a:-17,b:17},{ax:'x',c:-6,a:-17,b:-2},{ax:'x',c:-6,a:2,b:17},{ax:'x',c:6,a:-17,b:-2},{ax:'x',c:6,a:2,b:17},{ax:'x',c:9,a:-17,b:17},{ax:'x',c:17,a:-17,b:17},
    {ax:'z',c:-17,a:-17,b:17},{ax:'z',c:17,a:-17,b:17},{ax:'z',c:-6,a:-17,b:-9},{ax:'z',c:6,a:-17,b:-9},{ax:'z',c:-6,a:9,b:17},{ax:'z',c:6,a:9,b:17},{ax:'z',c:-2,a:-6,b:6},{ax:'z',c:2,a:-6,b:6}],
  // doors: a gap of width w centred at p on the wall (ax,c). Rooms open onto the corridors, so do the halls.
  doors:[{ax:'x',c:-9,p:-11.5,w:1.8},{ax:'x',c:-9,p:0,w:1.8},{ax:'x',c:-9,p:11.5,w:1.8},{ax:'x',c:9,p:-11.5,w:1.8},{ax:'x',c:9,p:0,w:1.8},{ax:'x',c:9,p:11.5,w:1.8},
    {ax:'x',c:-6,p:-9.5,w:2.4},{ax:'x',c:-6,p:9.5,w:2.4},{ax:'x',c:6,p:-9.5,w:2.4},{ax:'x',c:6,p:9.5,w:2.4},{ax:'z',c:-2,p:0,w:4},{ax:'z',c:2,p:0,w:4}],
  size:17,table:{x:-9.5,z:0,r:2.1},lounge:{x:9.5,z:0},
  deco:{piano:{x:4.6,z:15.6},bed:{x:15.6,z:15.4},crates:{x:-15.7,z:15.7}},
  scanner:{x:8.2,z:12.4},                                                  // 醫務室的感染檢測儀
  obs:[{x:-9.5,z:0,r:2.1},{x:11.5,z:-13,r:.75},{x:4.6,z:15.6,r:1.0},{x:15.6,z:15.4,r:1.1},{x:-15.7,z:15.7,r:1.0},{x:8.2,z:12.4,r:.5},   // table, tea table, piano, bed, crates
    {x:-16.3,z:-5.3,r:.32},{x:-16.3,z:5.3,r:.32},{x:-2.7,z:-5.3,r:.32},{x:-2.7,z:5.3,r:.32},{x:2.7,z:-5.3,r:.32},{x:2.7,z:5.3,r:.32},{x:16.4,z:-5.55,r:.3},{x:16.4,z:5.55,r:.3},   // potted plants
    {x:-15.2,z:-11.2,r:.62},{x:-13.4,z:16.2,r:.42},{x:-5.2,z:16.2,r:.32},{x:7.2,z:16.2,r:.38},{x:-12.2,z:16.15,r:.35},   // reading table, barrel, music-room plant, clinic cabinet, sacks
    ...[9.25,9.75,10.25,10.75,11.25,11.75,12.25,12.75,13.25,13.75].map(x=>({x,z:-16.55,r:.15}))],                         // the tea-room counter along the wall
  benches:[{x:16.1,z:-3,r:-Math.PI/2,seats:[[16.1,-4.5],[16.1,-3.5],[16.1,-2.5],[16.1,-1.5]]},{x:16.1,z:3,r:-Math.PI/2,seats:[[16.1,1.5],[16.1,2.5],[16.1,3.5],[16.1,4.5]]},{x:9.5,z:5.1,r:Math.PI,seats:[[8,5.1],[9,5.1],[10,5.1],[11,5.1]]}],   // four seats each
  shelf:{x:-11.5,z:-16.1},lockers:{x:0,z:-16.1},tea:{x:11.5,z:-13},
  switches:{library:{x:-10.1,z:-9.5},locker:{x:1.4,z:-9.5},tea:{x:12.9,z:-9.5},store:{x:-10.1,z:9.5},music:{x:1.4,z:9.5},clinic:{x:12.9,z:9.5}}
};
const roomOf=(x,z)=>{for(const r of MAP.rooms)if(x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)return r.id;return''};
const isHall=id=>id==='round'||id==='lounge';
const sees=(a,b)=>!!a&&a===b;                                        // you see the people who are in the same space as you
function walkable(x,z,m){m=m==null?.45:m;
  for(const r of MAP.rooms)if(x>=r.x0+m&&x<=r.x1-m&&z>=r.z0+m&&z<=r.z1-m)return true;
  for(const d of MAP.doors){const along=d.ax==='x'?x:z,across=d.ax==='x'?z:x;if(Math.abs(along-d.p)<=d.w/2-.3&&Math.abs(across-d.c)<=m+.08)return true}
  return false}
const blocked=(x,z)=>MAP.obs.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.38);
const spawnOf=(i,n)=>{const a=i/n*Math.PI*2;return{x:MAP.table.x+Math.sin(a)*3.6,z:MAP.table.z+Math.cos(a)*3.6,r:a+Math.PI}};
/* ---------- avatars: 20 presets (10 male, 10 female); every part can be changed ---------- */
// look = [sex 0/1, skin 0-4, hair style 0-7, hair colour 0-7, top colour 0-9, sleeve 0 short/1 long, bottom 0 trousers/1 shorts/2 skirt, bottom colour 0-7]
const LOOK_MAX=[1,4,7,7,9,1,2,7];
const LOOKS=[
  ['短髮藍襯衫',[0,1,0,0,0,1,0,0]],['平頭運動風',[0,2,1,0,2,0,1,1]],['側分西裝',[0,0,2,1,7,1,0,0]],['捲髮紅帽T',[0,3,7,0,1,1,0,2]],['金髮夏日',[0,1,0,3,4,0,1,3]],
  ['灰髮紳士',[0,0,2,5,8,1,0,4]],['黑膚街頭',[0,4,1,0,5,0,0,0]],['棕髮綠毛衣',[0,2,0,2,3,1,0,2]],['染髮潮流',[0,1,7,6,9,0,1,0]],['長髮文青',[0,0,3,1,6,1,0,5]],
  ['長直髮洋裝',[1,0,3,0,1,0,2,2]],['馬尾運動',[1,1,4,2,2,0,1,1]],['鮑伯頭上班',[1,0,5,0,7,1,0,0]],['丸子頭粉色',[1,1,6,1,9,1,2,6]],['金色長髮',[1,0,3,3,4,0,1,3]],
  ['捲髮黃上衣',[1,3,7,0,4,1,0,0]],['短髮帥氣',[1,2,0,0,5,1,0,0]],['黑膚馬尾',[1,4,4,0,0,0,2,4]],['紫髮個性',[1,1,5,7,6,0,1,0]],['棕髮毛衣裙',[1,2,6,2,3,1,2,5]]];
const okLook=l=>Array.isArray(l)&&l.length===8&&l.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=LOOK_MAX[i]);
const VSK={T:['infect','shoot','antidote'],I:['shoot'],J:['check'],R:['research']};
const SKN={infect:'投放病毒',shoot:'開槍',antidote:'解毒劑',check:'查驗身分',research:'製藥'};
const vTask=(S,pid,k)=>{const t=S.g.task&&S.g.task[pid];return t&&t[k]!=null?TASKS[t[k]]:null};
function vComp(n,novice){const T=n>=8?2:1,R=2,J=novice?0:1,I=n>=7?1:0,F=novice||n<10?0:1;return{T,R,J,I,F,C:n-T-R-J-I-F}}   // 新手局: no journalist, no zealot
function vDeal(S){
  if(S.opts.novice)S.opts.knowMates=1;                                 // 新手局: team-mates always know each other
  const ids=S.players.map(p=>p.id),c=vComp(ids.length,S.opts.novice),roles=[];
  for(const k of 'TRJIFC')for(let i=0;i<c[k];i++)roles.push(k);
  shuffle(roles);const nums=shuffle(ids.map((_,i)=>i+1)),seats=ids.map((_,i)=>i+1);   // seat numbers follow the order people joined
  const g=S.g={round:0,roundStart:0,roles:{},num:{},alive:{},inf:{},used:{},ru:{},virusUsed:false,cure:0,cureRound:false,announced:false,deathRound:{},seat:{},stats:{inf:0,dead:0,cure:0}};
  ids.forEach((id,i)=>{g.roles[id]=roles[i];g.num[id]=nums[i];g.seat[id]=seats[i];g.alive[id]=true;g.used[id]={x:0};g.ru[id]={x:0}});
  const cs=ids.filter(id=>g.roles[id]==='C');g.antibody=cs[rnd(cs.length)];
  g.task={};
  ids.forEach(id=>{const pool=shuffle(TASKS.map((_,i)=>i));g.task[id]={x:0};(VSK[g.roles[id]]||[]).forEach((k,i)=>g.task[id][k]=pool[i])});
  pub(S,`本局共 ${ids.length} 人：${[['T','恐怖分子'],['R','研究員'],['J','記者'],['I','搜查官'],['F','狂熱分子'],['C','一般市民']].filter(([k])=>c[k]>0).map(([k,n])=>n+' '+c[k]+' 人').join('、')}。其中一位一般市民帶有抗體，連本人都不知道。`);
  g.briefEnd=S.opts.briefSec>0?Date.now()+S.opts.briefSec*1000:0;
  pub(S,g.briefEnd?`身分已發下。請在 ${S.opts.briefSec} 秒內閱讀自己的身分說明，不要讓別人看到你的畫面。時間到自動開始第 1 日。`:'身分已發下。房主開始第 1 日後技能才能使用。');
}
function vTeam(S,r){return S.players.map(p=>p.id).filter(id=>S.g.roles[id]===r)}
function vKill(S,t,cause){const g=S.g;g.alive[t]=false;g.deathRound[t]=g.round;delete g.inf[t];
  pub(S,`${nm(S,t)} 死亡（${cause}），身分是「${VR[g.roles[t]].n}」`)}
function vCan(S,pid,k,t){
  const g=S.g,role=g.roles[pid],used=g.used[pid]||{},ru=g.ru[pid]||{};
  if(!role||!g.alive[pid])return'你已出局';
  if(g.round<1)return'第 1 日尚未開始';
  if(!g.alive[t])return'目標已經死亡';
  if(k!=='antidote'&&t===pid)return'不能選自己';
  if(k==='infect')return role!=='T'?'你沒有這個技能':g.virusUsed?'病毒已經被用掉了':null;
  if(k==='shoot')return role==='T'?(used.bullet?'子彈已用完':null):role==='I'?(ru.bullet?'本日已開過槍':null):'你沒有子彈';
  if(k==='antidote')return role!=='T'?'你沒有這個技能':used.antidote?'解毒劑已用完':null;
  if(k==='check')return role!=='J'?'你沒有這個技能':ru.check?'本日已查驗過':null;
  if(k==='research')return role!=='R'?'你沒有這個技能':ru.research?'本日已試過':null;
  return'未知的操作';
}
function vApply(S,pid,k,t){
  const g=S.g,role=g.roles[pid],used=g.used[pid]||(g.used[pid]={}),ru=g.ru[pid]||(g.ru[pid]={}),know=!!S.opts.knowMates;
  if(k==='infect'){
    g.virusUsed=true;if(g.inf[t]==null)g.inf[t]=g.round;
    vTeam(S,'T').forEach(id=>note(S,id,id===pid?`你把病毒投放給 ${nm(S,t)}`:know?`病毒已投放給 ${nm(S,t)}（${nm(S,pid)} 操作）`:'病毒已經被另一名恐怖分子用掉了'));
  }else if(k==='shoot'){
    if(role==='T')used.bullet=1;else ru.bullet=1;
    note(S,pid,`你對 ${nm(S,t)} 開槍`);vKill(S,t,'槍擊');vCheck(S);
  }else if(k==='antidote'){
    used.antidote=1;
    if(g.inf[t]!=null){delete g.inf[t];note(S,pid,`${nm(S,t)} 已解毒`)}else note(S,pid,`${nm(S,t)} 並未感染，解毒劑浪費了`);
  }else if(k==='check'){
    ru.check=1;note(S,pid,`查驗結果：${nm(S,t)} 是「${VR[g.roles[t]].n}」`);
  }else if(k==='research'){
    ru.research=1;const ok=t===g.antibody,to=know?vTeam(S,'R'):[pid];
    if(ok&&!g.cureRound){g.cure++;g.cureRound=true;
      to.forEach(id=>note(S,id,`製藥成功：${nm(S,t)} 是抗體保有者（進度 ${g.cure}/2）`));
      if(g.cure>=2){pub(S,'解毒劑製造完成');vFinish(S,'citizen','解毒劑製成',true)}
    }else to.forEach(id=>note(S,id,ok?`${nm(S,t)} 是抗體保有者，但本日已經有人成功過一次`:`製藥失敗：${nm(S,t)} 不是抗體保有者`));
  }
}
function vUse(S,pid,k,t){const e=vCan(S,pid,k,t);if(e)return e;vApply(S,pid,k,t);vOffer(S)}
/* the infection scanner in the clinic: anyone alive, once a day; the result is announced to everybody */
function vScan(S,pid){const g=S.g;if(!g||S.game!=='virus')return'沒有這個操作';
  if(!g.roles[pid]||!g.alive[pid])return'你已出局';if(g.round<1)return'第 1 日開始後才能使用';
  const ru=g.ru[pid]||(g.ru[pid]={x:0});if(ru.scan)return'你今天已經檢測過了，明天再來';
  ru.scan=1;const sick=g.inf[pid]!=null;
  pub(S,`${nm(S,pid)} 使用感染檢測儀：${sick?'已感染':'未感染'}`);note(S,pid,`你的檢測結果：${sick?'已感染':'未感染'}`);return null}
/* the action practice room: me and three dummies in the building, the day never ends and no skill goes off */
function practice(S){begin(S);const g=S.g,ids=S.players.map(p=>p.id),[mine,...dummies]=ids;S.practice=1;
  ids.forEach(id=>{g.roles[id]=id===mine?'T':'C';g.task[id]={x:0}});g.antibody=dummies[0];
  const pool=shuffle(TASKS.map((_,i)=>i));VSK.T.forEach((k,i)=>g.task[mine][k]=pool[i]);
  S.pub=[];g.briefEnd=0;g.round=1;g.roundStart=Date.now();
  pub(S,'練習場：這裡只有你和三個假人，時間不會結束，技能也不會真的發動。走到假人旁邊試做動作，或去醫務室試用感染檢測儀。')}
// true while somebody still holds something that could change how the game ends
function vOpen(S){
  const g=S.g,al=S.players.map(p=>p.id).filter(id=>g.alive[id]),last=g.round>=S.opts.rounds,of=r=>al.filter(id=>g.roles[id]===r);
  const Ts=of('T'),I=of('I'),Rs=of('R'),sick=al.some(id=>g.inf[id]!=null);
  if(Ts.length&&!g.virusUsed)return true;                                              // the virus is still in hand
  if(Ts.some(id=>!(g.used[id]||{}).bullet))return true;                                // a terrorist bullet
  if(sick&&Ts.some(id=>!(g.used[id]||{}).antidote))return true;                        // an antidote, with somebody to use it on
  if(I.length&&(!last||I.some(id=>!(g.ru[id]||{}).bullet)))return true;                // the investigator gets a bullet every day
  if(Rs.length&&g.alive[g.antibody]){const today=!g.cureRound&&Rs.some(id=>!(g.ru[id]||{}).research)?1:0;
    if(g.cure+today+(S.opts.rounds-g.round)>=2)return true}                            // the antidote can still be finished in the days left
  return false}
// nothing can change any more: play the remaining days out on a copy and ask the living whether to stop here
function vOffer(S){
  const g=S.g;if(S.sim||S.phase!=='play'||S.game!=='virus'||!g||g.round<1)return;
  if(vOpen(S)){g.offer=null;return}
  if(g.offer&&g.offer.r===g.round)return;
  const C=clone(S);C.sim=true;C.pub=[];let n=0;while(C.phase==='play'&&n++<20)vNext(C);if(C.phase!=='over')return;
  g.offer={r:g.round,winner:C.result.winner,title:C.result.title,why:C.result.why,yes:{},no:false};
  pub(S,`系統判定：已經沒有任何技能能改變結果，照規則走完會是「${C.result.title}」。存活玩家全數同意就提前結束。`)}
function vAct(S,pid,a){
  if(!SKN[a.k])return'未知的操作';
  if(S.opts.verify==='3d'&&a.t!==pid)return'要先在場景裡走到他旁邊，做出指定動作';
  return vUse(S,pid,a.k,a.t);
}
function vNext(S){
  const g=S.g;if(S.practice)return'練習場沒有結算';
  if(g.round===0){g.round=1;g.briefEnd=0;g.roundStart=Date.now();pub(S,'第 1 日開始');vOffer(S);return}
  const r=g.round,ids=S.players.map(p=>p.id).filter(id=>g.alive[id]).sort((a,b)=>g.num[a]-g.num[b]);
  const fresh=[];
  ids.forEach((id,i)=>{if(g.inf[id]!=null&&ids.length>1){const nx=ids[(i+1)%ids.length];if(g.inf[nx]==null&&!fresh.includes(nx))fresh.push(nx)}});
  for(const id of ids)if(g.inf[id]!=null&&id!==g.antibody&&r-g.inf[id]+1>=S.opts.deathDelay)vKill(S,id,'病毒發作');
  if(g.inf[g.antibody]!=null&&g.inf[g.antibody]<=r)delete g.inf[g.antibody];
  fresh.forEach(id=>{if(g.alive[id])g.inf[id]=r+1});
  const all=S.players.map(p=>p.id);
  g.stats={inf:all.filter(id=>g.alive[id]&&g.inf[id]!=null).length,dead:all.filter(id=>g.deathRound[id]===r).length,cure:g.cure};
  pub(S,`第 ${r} 日結束：目前感染 ${g.stats.inf} 人，本日死亡 ${g.stats.dead} 人，解毒劑進度 ${g.cure}/2`);
  vCheck(S);if(S.phase!=='play')return;
  if(r>=S.opts.rounds){vFinish(S,'none',`${S.opts.rounds} 日結束，兩個陣營都沒達成條件`);return}
  g.round=r+1;g.roundStart=Date.now();g.cureRound=false;all.forEach(id=>g.ru[id]={x:0});
  pub(S,`第 ${g.round} 日開始`);
  if(g.cure===1&&!g.announced){g.announced=true;pub(S,'公告：解毒劑製造準備中')}
  vOffer(S);
}
function vCheck(S){
  if(S.phase!=='play')return;const g=S.g,all=S.players.map(p=>p.id);
  if(!all.some(id=>g.roles[id]==='T'&&g.alive[id])){vFinish(S,'citizen','恐怖分子全滅');return}
  if(!all.some(id=>g.roles[id]!=='T'&&id!==g.antibody&&g.alive[id]))vFinish(S,'terror','除抗體保有者外，其餘玩家全數死亡');
}
function vFinish(S,winner,why,byCure){
  const g=S.g,rw={},tDead=!S.players.some(p=>g.roles[p.id]==='T'&&g.alive[p.id]);
  S.players.forEach(({id})=>{const r=g.roles[id],al=g.alive[id]?1:0;let n=0;
    if(r==='T')n=winner==='terror'?4:0;
    else if(r==='C'||r==='J')n=winner==='citizen'?1+al:0;
    else if(r==='R')n=winner==='citizen'?1+al+(byCure?1:0):0;
    else if(r==='I')n=tDead?[4,4,3,2,1][Math.min(g.round,5)-1]:0;
    else if(r==='F')n=g.alive[id]?0:([3,2,2,1,0][Math.min(g.deathRound[id]||5,5)-1]);
    rw[id]=n});
  S.phase='over';S.result={winner,why,rw,title:{citizen:'市民陣營獲勝',terror:'恐怖分子獲勝',none:'無陣營獲勝'}[winner]};
  pub(S,`遊戲結束：${S.result.title}（${why}）`);
}

/* ============ 地鐵追捕 ============ */
const LINES=[
  {c:'#e2594c',p:[[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3]]},
  {c:'#5c9eea',p:[[2,0],[2,1],[2,2],[2,3],[2,4],[2,5],[2,6]]},
  {c:'#68ba6f',p:[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[5,6]]},
  {c:'#e8a33d',p:[[1,1],[2,1],[3,1],[4,1],[5,1],[6,1]]},
  {c:'#ab93dc',p:[[1,5],[2,5],[3,5],[4,5],[5,5],[6,5]]},
  {c:'#52b8a8',p:[[1,1],[0,2],[0,3],[0,4],[1,5]]},
  {c:'#d98cb3',p:[[6,1],[7,2],[7,3],[7,4],[6,5]]}
];
const SNAMES=['松原','霧港','青石','白橋','北門','鹿野','星塘','竹林','南灣','雲頂','河口','鐵坊','茶山','月台','柳岸','石鼓','金礦','東圳','西濱','梅林','燈塔','古井','風口','稻田','銀杏','海角','赤土','麥倉','泉眼','烏橋','蘆塘','雁門'];
const ST=[],ADJ={};{const ix={};
  for(const L of LINES){let prev=null;for(const [x,y] of L.p){const k=x+','+y;if(ix[k]==null){ix[k]=ST.length;ST.push({id:ST.length,x:x*50+28,y:y*54+26,n:SNAMES[ST.length]});ADJ[ix[k]]=[]}
    const id=ix[k];if(prev!=null&&!ADJ[id].includes(prev)){ADJ[id].push(prev);ADJ[prev].push(id)}prev=id}L.ids=L.p.map(([x,y])=>ix[x+','+y])}}
const TEAMS=['紅隊','藍隊','綠隊'];
function cComp(n){const th=n>=8?2:1,cops=n-th,teams=cops>=6?3:cops>=4?2:1,cor=cops>=9?2:cops>=4?1:0;return{th,cops,teams,cor}}
function cDeal(S){
  const ids=shuffle(S.players.map(p=>p.id)),c=cComp(ids.length);
  const g=S.g={round:1,stage:'thief',order:[],roles:{},team:{},pos:{},trail:{x:0},loot:{x:0},got:0,arrested:{x:0},arrestBy:{x:0},budget:{},done:{x:0},marks:{},accuse:{x:0}};
  for(let i=0;i<c.teams;i++){g.order.push(i);g.marks['t'+i]=[]}
  const th=ids.slice(0,c.th),cops=ids.slice(c.th);
  th.forEach(id=>g.roles[id]='thief');
  cops.forEach((id,i)=>{g.roles[id]='cop';g.team[id]=i%c.teams});
  const tsh=shuffle([...g.order]);for(let i=0;i<c.cor;i++){const m=cops.filter(id=>g.team[id]===tsh[i]);g.roles[m[rnd(m.length)]]='corrupt'}
  const spots=shuffle(ST.map(s=>s.id));
  ids.forEach((id,i)=>g.pos[id]=spots[i]);
  th.forEach(id=>g.trail['s'+g.pos[id]]=1);
  shuffle(ST.map(s=>s.id).filter(s=>!th.some(id=>g.pos[id]===s))).slice(0,10).forEach(s=>g.loot['s'+s]=1);
  cSetup(S);
  g.briefEnd=S.opts.briefSec>0?Date.now()+S.opts.briefSec*1000:0;
  pub(S,g.briefEnd?`身分已發下。小偷是 ${th.map(id=>nm(S,id)).join('、')}。請在 ${S.opts.briefSec} 秒內閱讀自己的身分說明，時間到後第 1 回合開始。`:`小偷是 ${th.map(id=>nm(S,id)).join('、')}。第 1 回合開始，小偷先行動。`);
}
/* the identity briefing is over: the game proper starts */
function briefDone(S){const g=S.g;if(!g||!g.briefEnd)return;if(S.game==='virus')return vNext(S);g.briefEnd=0;pub(S,'身分確認結束。第 1 回合開始，小偷先行動。')}
function cActive(S){const g=S.g,all=S.players.map(p=>p.id);
  if(g.stage==='thief')return all.filter(id=>g.roles[id]==='thief'&&!g.arrested[id]);
  const t=g.order[g.stage];return all.filter(id=>g.roles[id]!=='thief'&&g.team[id]===t)}
function cSetup(S){const g=S.g;g.done={x:0};g.budget={};cActive(S).forEach(id=>g.budget[id]={m:2,a:2})}
function cStageName(S){const g=S.g;return g.stage==='thief'?'小偷':TEAMS[g.order[g.stage]]}
function cAdvance(S,forced){
  const g=S.g;
  if(g.stage==='thief')g.stage=0;else g.stage++;
  if(g.stage>=g.order.length){
    if(g.round>=S.opts.maxRounds){cFinish(S,'none',`${S.opts.maxRounds} 回合用盡`);return}
    g.round++;g.order.push(g.order.shift());g.stage='thief';pub(S,`第 ${g.round} 回合開始，小偷先行動`);
  }
  cSetup(S);if(!cActive(S).length)cAdvance(S);
}
function cAct(S,pid,a){
  const g=S.g,role=g.roles[pid];if(!role)return'你不在本局';
  if(g.briefEnd)return'身分確認時間還沒結束';
  if(a.k==='accuse'){
    if(role==='thief')return'小偷不能指認';if(a.t===pid||g.team[a.t]!==g.team[pid]||g.roles[a.t]==='thief')return'只能指認同隊隊友';
    g.accuse[pid]=a.t;note(S,pid,`你指認 ${nm(S,a.t)} 是內鬼（結算前可更改）`);return}
  if(!cActive(S).includes(pid))return'還沒輪到你';
  if(g.done[pid])return'你本回合已結束行動';
  const b=g.budget[pid],here=g.pos[pid];
  if(a.k==='move'){
    if(b.m<1)return'移動次數用完';if(!ADJ[here].includes(a.to))return'只能移動到相鄰的站';
    g.pos[pid]=a.to;b.m--;
    if(role==='thief'){g.trail['s'+a.to]=1;
      if(g.loot['s'+a.to]){delete g.loot['s'+a.to];g.got++;pub(S,`小偷取得第 ${g.got} 件贓物（目標 ${S.opts.lootGoal} 件）`);
        if(g.got>=S.opts.lootGoal){cFinish(S,'thief','贓物收集完成');return}}}
  }else if(a.k==='investigate'||a.k==='arrest'){
    if(role==='thief')return'小偷不能這麼做';if(b.a<1)return'行動次數用完';b.a--;
    const team=S.players.map(p=>p.id).filter(id=>g.roles[id]!=='thief'&&g.team[id]===g.team[pid]);
    if(a.k==='investigate'){const hit=g.trail['s'+here]?1:0;g.marks['t'+g.team[pid]].push({s:here,r:g.round,hit});
      team.forEach(id=>note(S,id,`${nm(S,pid)} 調查「${ST[here].n}」：${hit?'小偷來過':'沒有痕跡'}`))}
    else{const caught=S.players.map(p=>p.id).filter(id=>g.roles[id]==='thief'&&!g.arrested[id]&&g.pos[id]===here);
      if(caught.length){caught.forEach(id=>{g.arrested[id]=1;g.arrestBy[id]=pid;pub(S,`${nm(S,id)} 在「${ST[here].n}」被 ${nm(S,pid)} 逮捕`)});
        if(!S.players.some(p=>g.roles[p.id]==='thief'&&!g.arrested[p.id])){cFinish(S,'cop','小偷全數落網');return}}
      else team.forEach(id=>note(S,id,`${nm(S,pid)} 在「${ST[here].n}」逮捕落空`))}
  }else if(a.k==='done'){g.done[pid]=1}
  else return'未知的操作';
  if(S.phase==='play'&&cActive(S).every(id=>g.done[id]))cAdvance(S);
}
function cFinish(S,winner,why){
  const g=S.g,rw={};
  S.players.forEach(({id})=>{const r=g.roles[id];let n=0;
    if(winner==='thief'&&r!=='cop')n=3;
    if(r==='cop'){if(winner==='cop')n+=1;n+=2*Object.keys(g.arrestBy).filter(k=>g.arrestBy[k]===id).length;
      if(g.accuse[id]&&g.roles[g.accuse[id]]==='corrupt')n+=1}
    rw[id]=n});
  S.phase='over';S.result={winner,why,rw,title:{thief:'小偷與內鬼獲勝',cop:'警察獲勝',none:'無人獲勝'}[winner]};
  pub(S,`遊戲結束：${S.result.title}（${why}）`);
}


/* What one player is allowed to know. The server sends this instead of the full state. */
function redact(S,pid){
  const V=clone(S);delete V.ack;V.priv={};if(S.priv[pid])V.priv[pid]=S.priv[pid];
  const g=S.g,over=S.phase==='over',mine=(S.groups||[]).filter(G=>G.m.includes(pid)),gids=mine.map(G=>G.id);
  let tk='';if(g&&S.game==='chase'&&g.roles[pid])tk=g.roles[pid]==='thief'?'#th':'#t'+g.team[pid];
  V.groups=mine;V.chat=(S.chat||[]).filter(m=>!m.to||m.f===pid||m.to===pid||gids.includes(m.to)||(tk&&m.to===tk));
  if(!g||over)return V;
  const v=V.g,role=g.roles[pid];
  if(S.game==='virus'){
    const know=S.opts.knowMates&&(role==='T'||role==='R');
    for(const id in g.roles)if(!(id===pid||!g.alive[id]||(know&&g.roles[id]===role)))v.roles[id]='?';
    v.num={};if(role)v.num[pid]=g.num[pid];v.antibody='';v.inf={x:0};        // nobody is told who carries the antibody, not even the carrier; it is revealed with the results
    v.task={};if(g.task[pid])v.task[pid]=g.task[pid];
    v.used={};v.used[pid]=g.used[pid]||{x:0};v.ru={};v.ru[pid]=g.ru[pid]||{x:0};
    if(role!=='T')v.virusUsed=false;
    v.cure=g.stats.cure;v.cureRound=false;
  }else{
    const see=role==='thief'||role==='corrupt';
    for(const id in g.roles){if(g.roles[id]==='corrupt'&&!see&&id!==pid)v.roles[id]='cop';if(g.roles[id]==='thief'&&!see)v.pos[id]=-1}
    if(role!=='thief')v.loot={x:0};
    v.trail={x:0};v.marks={};if(role&&role!=='thief')v.marks['t'+g.team[pid]]=g.marks['t'+g.team[pid]]||[];
    v.accuse={x:0};if(g.accuse[pid])v.accuse[pid]=g.accuse[pid];
  }
  return V;
}

const AX={SCHED,dayMin,vScan,practice,LOOKS,LOOK_MAX,MAP,roomOf,isHall,sees,walkable,blocked,spawnOf,briefDone,GAMES,newState,act,nm,VR,GN,TASKS,VSK,SKN,vTask,vComp,cComp,vTeam,vUse,ST,ADJ,LINES,TEAMS,cActive,cStageName,redact,clone,rnd};
if(typeof module!=='undefined'&&module.exports)module.exports=AX;else window.AX=AX;
})();
