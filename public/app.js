/* 暗線遊戲室 — browser app: screens, input and the connection to the game server. */
(()=>{
"use strict";
const {normLook,seatMark,lookLike,SCHED,dayMin,GAMES,newState,act,nm,VR,GN,TASKS,VSK,SKN,vTask,vComp,cComp,vTeam,ST,ADJ,LINES,TEAMS,cActive,cStageName,rnd,LOOKS}=window.AX;
const Stage3D=window.Stage3D||null,Voice=window.Voice,Narr=window.Narrator,Snd=window.Sound;
Narr.onSpeak=v=>Snd.duck(v);
const app=document.getElementById('app'),toastEl=document.getElementById('toast');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
let toastT=0;
function toast(t){toastEl.textContent=t;toastEl.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>toastEl.hidden=true,2800)}
const qs=new URLSearchParams(location.search);
const myId=(()=>{const u=qs.get('u');if(u)return'u_'+u.replace(/[^\w-]/g,'').slice(0,10)+'______'.slice(0,Math.max(0,4-u.length));let v=ls.get('ax_pid');if(!v){v='p'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);ls.set('ax_pid',v)}return v})();
const myKey=(()=>{const k='ax_key_'+myId;let v=ls.get(k);if(!v){v=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');ls.set(k,v)}return v})();

/* ============ session ============ */
let S=null,mode=null,me=null,online='checking',tOff=0,ws=null,wantRoom=null,retry=0;
const ui={nick:(ls.get('ax_nick')||''),game:'virus',join:(qs.get('room')||'').toUpperCase().slice(0,4),add:'',cover:false,hide:false,pick:null,t:null,sel:null,confirmNext:false,net:'',msg:'',ch:'',seen:{},gpanel:null,gsel:[],gname:'',ft:null,fakeOpen:false,tab:'',tabKey:'',privSeen:{},roam:false};
let dict=null,dictOn=false,composing=false,pendingRender=false;
function isHost(){return mode==='local'||(mode==='net'&&S&&S.hostId===me)}
function send(o){if(ws&&ws.readyState===1){ws.send(JSON.stringify(o));return true}return false}
function connect(){
  if(location.protocol!=='http:'&&location.protocol!=='https:'){online='none';render();return}
  try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws')}catch(e){online='none';return}
  ws.onopen=()=>{online='ok';retry=0;ui.net='';if(wantRoom)send({t:'join',code:wantRoom,pid:myId,key:myKey,name:ui.nick.trim()});else if(!S)render()};
  ws.onclose=()=>{online='none';if(mode==='net')ui.net='連線中斷，正在重新連線…';if(mode!=='local')render();setTimeout(connect,Math.min(8000,1000*++retry))};
  ws.onerror=()=>{};
  ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch(e){return}
    if(m.t==='state'){const prev=S;S=m.S;tOff=m.now-Date.now();mode='net';me=myId;wantRoom=S.code;ls.set('ax_room',S.code);
      if(prev&&prev.phase!==S.phase){ui.pick=null;ui.sel=null;ui.t=null;if(Stage3D)Stage3D.stop()}
      if(m.toast)toast(m.toast);narrate(prev);render()}
    else if(m.t==='pos'){if(Stage3D)Stage3D.peers(m.p,m.init)}
    else if(m.t==='voice'){Voice.setList(m.list,m.ice);if(Voice.st.on&&mode==='net'&&!m.list.includes(myId))send({t:'voice',on:true})}
    else if(m.t==='rtc'){Voice.signal(m.from,m.d)}
    else if(m.t==='gdone'){if(Stage3D)Stage3D.done();if(m.fired){ui.armed=null;toast('動作完成，「'+SKN[m.k]+'」已發動');render()}else if(m.m)toast(m.m);paintCtx()}
    else if(m.t==='seat'){if(Stage3D)Stage3D.seat(m.x,m.z,m.r);paintCtx()}
    else if(m.t==='act'){if(Stage3D)Stage3D.progress(m.a,m.ms)}
    else if(m.t==='env'){if(Stage3D)Stage3D.env(m);paintCtx()}
    else if(m.t==='dbgab'){window.__ab=m.id}
    else if(m.t==='err'){toast(m.m);if(m.pw){ui.needPw=m.code||ui.join;ui.join=m.code||ui.join;wantRoom=null;render();return}if(m.fatal){wantRoom=null;ls.del('ax_room');if(mode==='net'){S=null;mode=null}render()}}
    else if(m.t==='gone'){toast(m.m);Voice.disable();wantRoom=null;S=null;mode=null;me=null;ls.del('ax_room');render()}};
}
setInterval(()=>send({t:'ping'}),25000);
setInterval(()=>{if(mode==='net')fetch('/healthz',{cache:'no-store'}).catch(()=>{})},240000); // keeps free hosts from idling the server mid-game
if(Stage3D){Stage3D.onPos=p=>send(Object.assign({t:'pos'},p));Stage3D.onEnv=o=>{send(Object.assign({t:'env'},o));paintCtx()};Stage3D.onNear=o=>{nearObjs=o||[];paintCtx()}}
/* ---- using the building: benches, books, lockers, tea table, light switches ---- */
let nearObjs=[];
let muted=new Set(ls.get('ax_mute')||[]);const isMuted=id=>muted.has(id);
/* the seat mark as a small chip: colour plus circle or triangle */
const markHtml=n=>{if(!n)return'';const m=seatMark(n),tri=m.s==='tri';return`<svg class="mk" viewBox="0 0 24 24" aria-label="${n} 號" role="img">${tri?'<path d="M12 1.8 L22.6 20.6 Q23.2 21.8 21.8 21.8 L2.2 21.8 Q0.8 21.8 1.4 20.6 Z"':'<circle cx="12" cy="12" r="10.6"'} fill="${m.c}" stroke="#0b141a" stroke-width="1.6"/><text x="12" y="${tri?16.6:12.4}" text-anchor="middle" dominant-baseline="middle" font-size="${n>9?(tri?8:9.5):11}" font-weight="800" fill="#10161c">${n}</text></svg>`};
const seatOf=id=>S&&S.g&&S.g.seat&&S.g.seat[id]?S.g.seat[id]:S?S.players.findIndex(p=>p.id===id)+1:0;
const sn=id=>(S&&S.g&&S.g.seat&&S.g.seat[id]?S.g.seat[id]+'號 ':'')+nm(S,id);
function armedTask(){const a=ui.armed;return a&&S&&S.g?vTask(S,me,a.k):null}
const dayEnd=()=>S.practice||!S.g||S.g.round<1?0:S.g.roundStart+dayMin(S,S.g.round)*60000;
const schedText=o=>o.roundMin==='std'?`第 1–${SCHED.length} 日依序 ${SCHED.join('、')} 分鐘`:`每日 ${o.roundMin} 分鐘`;
function ctxHtml(){
  if(!S||!S.g||S.game!=='virus'||S.phase!=='play'||isBrief()||mode!=='net'||S.g.alive[me]===false)return'';
  const n=S.players.length,arm=ui.armed,at=armedTask(),want=arm?S.g.seat[arm.t]:0;let h='';
  if(ui.envAsk&&arm&&at){return`<div class="cx col ask"><span>確定對 ${markHtml(seatOf(arm.t))}${esc(sn(arm.t))} 發動「${SKN[arm.k]}」？（${GN[at[1]]}，只有你看得到這個確認）</span><div class="row"><button class="btn pri" data-a="envyes">確定</button><button class="btn" data-a="envno">取消</button></div></div>`}
  ui.envAsk=null;
  for(const o of nearObjs){
    if(o.t==='seated')h+=`<div class="cx"><span>你坐在長椅上${at&&at[1]===7?'，等 '+esc(nm(S,arm.t))+' 也坐下滿 3 秒':''}</span><button class="btn sm" data-a="stand">站起來</button></div>`;
    else if(o.t==='bench')h+=`<div class="cx"><span>長椅</span><button class="btn sm pri" data-a="sit" data-v="${o.b}">坐下</button></div>`;
    else if(o.t==='shelf'||o.t==='lockers'){const bk=o.t==='shelf',w=at&&at[1]===(bk?8:9)?want:0;
      h+=`<div class="cx col"><span>${bk?'書架：把幾號的書倒過來？已經倒放的再選一次會轉回來':'置物櫃：把信投進幾號？'}</span><div class="nums">${Array.from({length:n},(_,i)=>`<button class="btn sm ${w===i+1?'pri':''}" data-a="${bk?'book':'letter'}" data-v="${i+1}">${i+1}</button>`).join('')}</div></div>`}
    else if(o.t==='tea')h+=`<div class="cx"><span>茶桌</span><button class="btn sm pri" data-a="tea">倒茶</button></div>`;
    else if(o.t==='scanner'){const done=(S.g.ru[me]||{}).scan;h+=`<div class="cx"><span>感染檢測儀${done?'（今天已經檢測過了）':'：結果會公開給所有人'}</span><button class="btn sm pri" data-a="scan" ${done?'disabled':''}>檢測</button></div>`}
    else if(o.t==='switch'){const mine=at&&at[1]===11;h+=`<div class="cx"><span>電燈開關${o.dark&&mine?'（燈已經關著，按下重新計時）':''}</span><button class="btn sm pri" data-a="light">${o.dark&&!mine?'開燈':'關燈'}</button></div>`}
  }
  return h}
function paintCtx(){if(Stage3D)Stage3D.setCtx(ctxHtml())}
function envAsk(a,gi,x){const at=armedTask();if(ui.armed&&at&&at[1]===gi&&(gi!==8&&gi!==9||(x&&x.n===S.g.seat[ui.armed.t]))){ui.envAsk={a,gi,x};paintCtx();return true}return false}
function envSend(a,gi,x){const arm=ui.armed,t=armedTask(),m=Stage3D?Stage3D.debug().me:{};send(Object.assign({t:'env',a,x:m.x,z:m.z},x||{},arm&&t&&t[1]===gi?{gk:arm.k,gt:arm.t}:{}))}
/* ---- voice ---- */
const vPlay=()=>S&&mode==='net'&&S.phase==='play'&&S.g;
function canSpeak(){return true}                                         // the dead talk too, but only the dead hear them
function vPolicy(pid){ // -1: no connection allowed, otherwise the volume (0..1) this player is heard at
  if(!S||mode!=='net'||!S.players.some(p=>p.id===pid)||!S.players.some(p=>p.id===me))return -1;
  if(isMuted(pid))return 0;
  if(vPlay()&&S.game==='chase'){const g=S.g,ch=id=>g.roles[id]==='thief'?'th':'t'+g.team[id];return ch(pid)===ch(me)?1:-1}
  if(vPlay()&&S.game==='virus'){const dm=S.g.alive[me]===false,dp=S.g.alive[pid]===false;if(dm!==dp)return -1;if(dm)return 1;/* ghosts hear ghosts only */if(!Stage3D||!Stage3D.inRoom())return 1;const r=Stage3D.roomOf(pid);if(!r||r!==Stage3D.room())return 0;   // only people in the same room
    const d=Stage3D.dist(pid);return d<=3?1:d>=8.5?0:Math.pow((8.5-d)/5.5,1.5)}
  return 1}
function vScope(){return vPlay()?(S.game==='virus'?(S.g.alive[me]===false?'你已出局，只有其他出局的人聽得到你。':'只聽得到同一間的人，離得越遠越小聲。'):'只有同隊聽得到（小偷只聽得到小偷）。'):'現在所有人都聽得到。'}
function paintVoice(){
  paintVmini();const el=document.getElementById('vbar');if(!el)return;const v=Voice.st;let h;
  if(!Voice.supported())h='<span class="sub">語音通話需要 https 網址和支援的瀏覽器，這裡只能用文字交談。</span>';
  else if(!v.on)h=`<button class="btn sm pri" data-a="von">開啟語音通話</button><span class="sub">${v.err==='denied'?'麥克風權限被拒絕，請到瀏覽器設定允許後再按一次。':v.err?'無法啟動麥克風。':vScope()}</span>`;
  else{const can=canSpeak();h=`<button class="btn sm ${v.mic&&can?'on':''}" data-a="vmic" ${can?'':'disabled'}>${!can?'已出局，靜音':v.mic?'麥克風：開':'麥克風：關'}</button><button class="btn sm" data-a="voff">離開語音</button><span class="sub">語音連上 ${Voice.connected()} 人。${vScope()}</span>`}
  if(el._h!==h){el._h=h;el.innerHTML=h}}
function paintVmini(){const el=document.getElementById('vmini');if(!el)return;const v=Voice.st,can=canSpeak();
  const h=!Voice.supported()||!inGame()?'':!v.on?'<button class="btn sm" data-a="von">語音通話</button>':`<button class="btn sm ${v.mic&&can?'on':''}" data-a="vmic" ${can?'':'disabled'}>${!can?'靜音':v.mic?'麥克風開':'麥克風關'}</button>`;
  if(el._h!==h){el._h=h;el.innerHTML=h}}
Voice.send=o=>send(o);Voice.me=()=>myId;Voice.policy=vPolicy;Voice.canSpeak=canSpeak;Voice.onChange=()=>paintVoice();
setInterval(()=>{if(!S||mode!=='net')return;paintVoice();
  document.querySelectorAll('[data-sp]').forEach(e=>e.classList.toggle('sp',Voice.speaking(e.dataset.sp)));
  if(Stage3D)S.players.forEach(p=>Stage3D.speak(p.id,Voice.speaking(p.id)));
  const talk=S.players.some(p=>Voice.speaking(p.id));if(talk!==vDuck){vDuck=talk;Snd.duck(talk)}},300);
let vDuck=false;
/* ---- identity briefing ---- */
const isBrief=()=>!!(S&&S.phase==='play'&&S.g&&S.g.briefEnd>0);
const TGT='任何一名其他存活玩家';
const BR={
  T:{skills:[['infect','投放病毒','全隊共用一次，誰先用掉就沒了',TGT,'對方被感染。每日結束時病毒傳給下一個感染序號的存活玩家，感染到期的人死亡。'],
      ['shoot','開槍','你個人一次',TGT,'對方立刻出局，身分公開。'],
      ['antidote','解毒劑','你個人一次','任何一名存活玩家，包含自己','治好對方的感染。對沒被感染的人使用會浪費掉。用在自己身上不需要做動作。']],
    win:'至少一名恐怖分子存活，其餘玩家除了抗體保有者以外全部死亡。',score:['恐怖分子獲勝：每名恐怖分子 4 枚','沒有獲勝：0 枚']},
  C:{skills:[],win:'恐怖分子全部死亡，或研究員完成解毒劑。',score:['市民陣營獲勝：1 枚','結束時你還活著：再加 1 枚']},
  R:{skills:[['research','製藥','每日一次',TGT,'對方帶有抗體才算成功。帶有抗體的人自己也不知道，結果只有你看得到，要不要告訴對方由你決定。全隊每日最多成功一次，累計兩次解毒劑完成，市民陣營立刻獲勝。']],
    win:'恐怖分子全部死亡，或解毒劑完成。',score:['市民陣營獲勝：1 枚','結束時你還活著：再加 1 枚','因解毒劑完成而獲勝：再加 1 枚']},
  J:{skills:[['check','查驗身分','每日一次',TGT,'只有你會得知對方的角色。看不出對方有沒有抗體。']],
    win:'恐怖分子全部死亡，或研究員完成解毒劑。',score:['市民陣營獲勝：1 枚','結束時你還活著：再加 1 枚']},
  I:{skills:[['shoot','開槍','每日一次',TGT,'對方立刻出局，身分公開。']],
    win:'恐怖分子全部死亡。',score:['第 1 或第 2 日達成：4 枚','第 3 日：3 枚','第 4 日：2 枚','第 5 日：1 枚','恐怖分子沒有全滅：0 枚']},
  F:{skills:[],win:'你自己死亡，越早越好。',score:['第 1 日死亡：3 枚','第 2 或第 3 日：2 枚','第 4 日：1 枚','第 5 日死亡或活到最後：0 枚']},
  thief:{acts:[['移動','每回合最多 2 站','相鄰的車站','經過藏有贓物的站會自動拿走。你走過的每一站都會留下痕跡。']],
    win:()=>`兩名小偷合計收集 ${S.opts.lootGoal} 件贓物。`,score:['小偷方獲勝：3 枚','被警察在同一站逮捕就出局，但隊友收集完成你仍然獲勝']},
  cop:{acts:[['移動','每回合最多 2 站','相鄰的車站','警察的位置所有人都看得到。'],['調查','和逮捕合計每回合 2 次','你所在的車站','得知小偷是否曾經過這一站。結果只有同隊看得到。'],
      ['逮捕','和調查合計每回合 2 次','你所在的車站','小偷此刻在這一站就會被捕；不在就落空。'],['指認內鬼','一次，結算前可以更改','一名同隊隊友','結算時揭曉對錯。']],
    win:()=>'所有小偷都被逮捕。',score:['警察獲勝：1 枚','你每逮捕一名小偷：2 枚','指認內鬼正確：1 枚']},
  corrupt:{acts:[['移動','每回合最多 2 站','相鄰的車站','表面上和警察一樣行動。'],['調查／逮捕','合計每回合 2 次','你所在的車站','結果同隊都看得到，可以故意浪費行動或誤導隊友。'],['情報','每回合','—','地圖上看得到小偷的位置；小偷也知道你是內鬼。']],
    win:()=>`小偷收集到 ${S.opts.lootGoal} 件贓物。`,score:['小偷方獲勝：3 枚','警察獲勝：0 枚']}
};
function briefBody(){
  const g=S.g,v=S.game==='virus',role=g.roles[me];let h='';
  if(v){const B=BR[role],g3=S.opts.verify==='3d'&&mode==='net';if(!B)return'';
    h+=`<h4>技能與目標</h4>`+(B.skills.length?B.skills.map(([k,n,lim,tg,ef])=>{const t=g3?vTask(S,me,k):null;
      return`<div class="sk"><b>${n}</b>（${lim}）<ul><li>目標：${tg}</li><li>效果：${ef}</li>${t?`<li>施放條件：${t[0]}</li>`:''}</ul></div>`}).join('')
      :`<p>你沒有主動技能。${g3?'你可以對任何人做動作，也可以使用長椅、書架、置物櫃、茶桌和電燈開關來試探或誤導別人，這些都不會發動任何技能。':''}</p>`);
    if(role==='C')h+=`<div class="sk"><b>抗體</b><ul><li>一般市民之中有一位帶有抗體，但沒有人一開始知道是誰，連本人都不知道。可能就是你。</li><li>想知道只有一個辦法：找研究員合作，讓他對你製藥。結果只有研究員看得到，要由他告訴你，他說的不一定是真話。</li><li>帶有抗體的人會被感染，也會把病毒傳給下一個感染序號，但一日後自行痊癒，不會病死。恐怖分子獲勝時不需要他死亡。</li></ul></div>`;
    if(B.skills.length)h+=`<h4>施放操作</h4>`+(g3?`<ol><li>按下技能按鈕，選擇對象</li><li>條件是「走到對方旁邊」的動作：先走到他旁邊約兩步內再按，你的角色會做出動作，保持 3 秒不要移動</li><li>條件是使用建築物的動作：按下後技能進入準備狀態，再去指定的地方完成動作（坐下、選號碼、倒茶或關燈）</li><li>系統自動判定，達成就發動；沒達成技能不算用掉，可以重來</li></ol><p>別人只看得到你做了什麼動作，不會收到任何通知。倒放的書和置物櫃上的信號旗會留到當日結束。</p>`
      :`<ol><li>按下技能按鈕</li><li>選擇對象並確定，立刻發動</li></ol>`);
    h+=`<h4>你的號碼</h4><ul><li>座號 ${g.seat[me]} 號：公開，顯示在你的角色頭上。書本和置物櫃用座號對應玩家。</li><li>感染序號 ${g.num[me]} 號：只有你自己知道。病毒依感染序號的順序傳播。</li></ul>`;
    h+=`<h4>獲勝條件</h4><p>${B.win}</p><h4>積分計算</h4><ul>${B.score.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  }else{const B=BR[role];if(!B)return'';
    h+=`<h4>行動與目標</h4>`+B.acts.map(([n,lim,tg,ef])=>`<div class="sk"><b>${n}</b>（${lim}）<ul><li>目標：${tg}</li><li>效果：${ef}</li></ul></div>`).join('');
    h+=`<h4>操作方式</h4><ol><li>每回合小偷先行動，接著各警隊依序行動</li><li>輪到你的陣營時，在行動面板選相鄰的車站移動，也可以直接點地圖上的車站</li>${role==='thief'?'':'<li>需要時按「調查」或「逮捕」，作用在你所在的站</li>'}<li>按「結束我的行動」</li></ol>`;
    h+=`<h4>獲勝條件</h4><p>${B.win()}</p><h4>積分計算</h4><ul>${B.score.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  }
  return h;
}
let shufT=0,shufKey='';
function briefCard(){
  const g=S.g,v=S.game==='virus',role=g.roles[me]&&g.roles[me]!=='?'?g.roles[me]:null,all=S.players.map(p=>p.id);
  const dealAt=g.briefEnd-S.opts.briefSec*1000,left=3000-(Date.now()+tOff-dealAt),still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  let h='';
  if(!role)h+=`<p class="note">這一局你是觀眾。其他人正在確認身分。</p>`;
  else if(left>0&&!still){clearTimeout(shufT);shufT=setTimeout(render,left+40);
    if(shufKey!==S.gid){shufKey=S.gid;setTimeout(()=>Snd.sfx('flip'),left)}
    h+=`<section class="dossier shuffle"><span class="lbl">身分抽籤中</span><div class="role" id="shuf">？</div><p>每個人的身分都是隨機分配的，只有自己看得到。</p></section>`}
  else{let top;
    if(v){const R=VR[role],mates=S.opts.knowMates&&(role==='T'||role==='R')?vTeam(S,role).filter(id=>id!==me):[];
      top=`<span class="stamp ${R.c}">${R.f}</span><span class="lbl">你抽到的身分</span><div class="role">${R.n}</div>
        ${mates.length?`<div>同伴：<b>${mates.map(id=>esc(nm(S,id))).join('、')}</b></div>`:(role==='T'||role==='R')&&!S.opts.knowMates?'<div>你不知道誰是同伴，要自己找出來。</div>':''}`}
    else{const cor=all.filter(id=>g.roles[id]==='corrupt'),th=all.filter(id=>g.roles[id]==='thief'),mates=role==='thief'?[]:all.filter(id=>g.roles[id]!=='thief'&&g.team[id]===g.team[me]&&id!==me);
      const I={thief:['小偷','threat','小偷陣營'],cop:['警察','safe','警察陣營'],corrupt:['內鬼','neutral','與小偷同盟']}[role];
      top=`<span class="stamp ${I[1]}">${I[2]}</span><span class="lbl">你抽到的身分</span><div class="role">${I[0]}</div>
        ${role!=='thief'?`<div>${TEAMS[g.team[me]]}${mates.length?'　隊友：<b>'+mates.map(id=>esc(nm(S,id))).join('、')+'</b>':''}</div>`:`<div>另一名小偷：<b>${th.filter(id=>id!==me).map(id=>esc(nm(S,id))).join('、')||'無'}</b></div>`}
        ${role==='thief'&&cor.length?`<div>內鬼：<b>${cor.map(id=>esc(nm(S,id))+'（'+TEAMS[g.team[id]]+'）').join('、')}</b></div>`:''}
        ${role==='corrupt'&&cor.length>1?`<div>另一名內鬼：<b>${cor.filter(id=>id!==me).map(id=>esc(nm(S,id))).join('、')}</b></div>`:''}`}
    h+=`<section class="dossier brief">${top}${briefBody()}</section>
      <p class="note">不要讓別人看到你的畫面。時間到會自動開始；開始後可以從身分卡的「完整身分說明」再打開這一頁。</p>`}
  return h}
function briefHost(){return hostCtl(ui.confirmNext?`<p class="sub">所有人都讀完了嗎？提早開始後就不能回到這一頁的倒數。</p><div class="row"><button class="btn pri grow" data-a="next">確定提早開始</button><button class="btn" data-a="cancel">取消</button></div>`
    :`<p class="sub">時間到會自動開始。大家都說讀完了，可以提早開始。</p><button class="btn wide" data-a="asknext">提早開始</button>`)}
function briefView(){return topBar()+briefCard()+`<section class="panel"><h3>場景載入中</h3><p class="sub">遊戲場景先在這裡準備好，開始後才能${S.game==='virus'?'走動':'行動'}。</p>${stageSlot()}</section>`+briefHost()+rulesHtml(S.game)}
setInterval(()=>{const e=document.getElementById('shuf');if(!e||!S||!S.g)return;const names=S.game==='virus'?Object.values(VR).map(r=>r.n):['小偷','警察','內鬼'];e.textContent=names[rnd(names.length)]},110);
/* ---- narrator ---- */
let nPub=null;const cues={};
function spoken(t){
  let m=t.match(/^(.+) 死亡（(槍擊|病毒發作)），身分是「(.+)」$/);
  if(m){const pl=S&&S.g&&S.g.seat?S.players.find(p=>p.name===m[1]):null;return`${pl?S.g.seat[pl.id]+' 號，':''}${m[1]}，${m[2]==='槍擊'?'遭到槍擊':'病毒發作'}，出局。身分是${m[3]}。`}
  return t.replace(/(\d+)\/(\d+)/g,'$1，目標 $2').replace(/（/g,'，').replace(/）/g,'').replace(/[「」]/g,'').replace(/：/g,'，')}
function dayLine(t){ // a new day restates the public numbers
  const m=t.match(/^第 (\d+) 日開始$/);if(!m||!S.g||S.game!=='virus')return'';const g=S.g,n=S.players.filter(p=>g.alive[p.id]!==false).length;
  if(S.practice)return'';const mins=dayMin(S,+m[1]);
  return +m[1]===1?`第 1 日開始。存活 ${n} 人，共 ${S.opts.rounds} 日。今天限時 ${mins} 分鐘。技能現在可以使用。`
    :`第 ${m[1]} 日開始。目前存活 ${n} 人，感染 ${g.stats.inf} 人，解毒劑進度 ${g.stats.cure}，目標 2。今天限時 ${mins} 分鐘。`}
/* which sound effect and which tone of voice goes with a public line */
function cue(t){
  if(/死亡（槍擊）/.test(t))return{sfx:'gun',mood:'grave',delay:900};
  if(/死亡（病毒發作）/.test(t))return{sfx:'cough',mood:'grave',delay:1300};
  if(/^第 \d+ 日開始/.test(t))return{sfx:'bell',mood:'firm',delay:700};
  if(/^第 \d+ 日結束/.test(t))return{sfx:'drum',mood:'calm',delay:600};
  if(/^本局共/.test(t))return{sfx:'shuffle',mood:'mystery',delay:900};
  if(/^身分已發下/.test(t))return{mood:'mystery'};
  if(/解毒劑製造準備中/.test(t))return{sfx:'coin',mood:'bright',delay:400};
  if(/解毒劑製造完成/.test(t))return{sfx:'success',mood:'bright',delay:600};
  if(/^遊戲結束/.test(t)){const w=S.result&&S.result.winner;
    if(w==='terror'||w==='thief')return{sfx:'laugh',mood:'dark',delay:3000};
    if(w==='citizen')return{sfx:S.result.why==='解毒劑製成'?'success':'cheer',mood:'bright',delay:1500};
    if(w==='cop')return{sfx:'siren',mood:'bright',delay:1800};
    return{sfx:'wind',mood:'cold',delay:1500}}
  if(/小偷取得第/.test(t))return{sfx:'coin',mood:'mystery',delay:300};
  if(/被 .+ 逮捕/.test(t))return{sfx:'cuffs',mood:'firm',delay:500};
  if(/身分確認結束|回合開始/.test(t))return{sfx:'bell',mood:'firm',delay:600};
  return{mood:'neutral'}}
function musicScene(){
  if(!S||!mode)return'';if(S.phase==='lobby')return'lobby';
  if(S.phase==='over'){const w=S.result&&S.result.winner;return w==='citizen'?(S.result.why==='解毒劑製成'?'win_cure':'win_citizen'):w==='cop'?'win_citizen':w==='terror'||w==='thief'?'win_terror':'none'}
  if(!S.g)return'lobby';if(S.g.briefEnd)return'brief';
  if(S.game==='chase')return S.g.stage==='thief'?'chase_thief':'chase_cop';
  if(S.g.round<1)return'brief';
  return dayEnd()&&dayEnd()-(Date.now()+tOff)<=60000?'urgent':'day'}
function narrate(prev){
  if(!S)return;const say=(t,o)=>Narr.say(t,o),same=prev&&prev.code===S.code;
  if(S.phase==='lobby'){
    const G=GAMES[S.game],n=S.players.length,pn=same&&prev.phase==='lobby'?prev.players.length:null;
    if(pn===null)say(same&&prev.phase==='over'?`回到大廳。這一局是${G.name}，目前 ${n} 人。`:`歡迎來到暗線遊戲室。這一局是${G.name}，目前 ${n} 人，需要 ${G.min} 到 ${G.max} 人。`);
    else if(n>pn){const nw=S.players[n-1].name;Snd.sfx('join');
      say(n>=G.max?`${nw}加入。房間已滿，共 ${n} 人，房主可以開始遊戲。`:n>=G.min&&pn<G.min?`${nw}加入。目前 ${n} 人，已達開局人數。房主可以開始，也可以繼續等人。`:`${nw}加入，目前 ${n} 人。`)}
    else if(n<pn)say(`有人離開，目前 ${n} 人。`);
    else if(prev.game!==S.game)say(`房主把遊戲換成${G.name}，需要 ${G.min} 到 ${G.max} 人。`);
    nPub=S.pubN||0;return}
  const N=S.pubN||0;
  if(nPub===null||!same){nPub=N;                              // joined in the middle: one status line, no replay of the past
    if(S.phase==='play'&&S.g&&S.practice)say('歡迎來到練習場。走到假人旁邊試做動作，或去醫務室試用感染檢測儀。');
    else if(S.phase==='play'&&S.g)say(S.game==='virus'?(S.g.round>=1?`你已進入房間。現在是第 ${S.g.round} 日。`:'你已進入房間。現在是準備階段。'):`你已進入房間。現在是第 ${S.g.round} 回合，輪到${cStageName(S)}行動。`);
    else if(S.phase==='over')say('你已進入房間。這一局已經結束。');
    return}
  if(N>nPub){const k=Math.min(N-nPub,S.pub.length,5);S.pub.slice(S.pub.length-k).forEach(l=>{const c=cue(l.t);if(c.sfx)Snd.sfx(c.sfx);say(dayLine(l.t)||spoken(l.t),c)})}
  nPub=N;
  if(S.game==='chase'&&S.phase==='play'){const g=S.g,pg=prev.phase==='play'&&prev.g?prev.g:null;
    if(pg&&g.round!==pg.round&&S.opts.maxRounds-g.round===2)say('注意，只剩最後三回合。');
    if(!g.briefEnd&&(!pg||pg.briefEnd||g.stage!==pg.stage||g.round!==pg.round)){if(pg&&!pg.briefEnd&&g.stage!=='thief')say(`輪到${cStageName(S)}行動。`);if(me&&cActive(S).includes(me)&&!g.done[me]){Snd.sfx('join');say('輪到你了。',{mood:'firm'})}}}
  if(S.phase==='over'&&prev.phase==='play')say('所有人的身分已經公開，請看結算畫面。',{mood:S.result&&(S.result.winner==='terror'||S.result.winner==='thief')?'dark':'calm'});
}
function timeCues(now){
  if(isBrief()){const rem=Math.round((S.g.briefEnd-now)/1000),k=(S.gid||'')+'|brief';if(rem<=10&&rem>5&&!cues[k]){cues[k]=1;Snd.sfx('tick');Narr.say('十秒後遊戲開始。',{mood:'urgent'})}return}
  if(!S||S.phase!=='play'||S.game!=='virus'||S.g.round<1||S.practice)return;
  const total=dayMin(S,S.g.round)*60,rem=Math.round((dayEnd()-now)/1000);
  for(const [th,msg] of [[300,'剩下五分鐘'],[60,'剩下一分鐘'],[10,'最後十秒']]){const k=(S.gid||'')+'|'+S.g.round+'|'+th;
    if(total>th&&rem<=th&&rem>th-4&&!cues[k]){cues[k]=1;if(th===60)Snd.sfx('heartbeat');if(th===10)Snd.sfx('tick');Narr.say(`第 ${S.g.round} 日，${msg}。`,{mood:th===300?'firm':'urgent'})}}
}
function narrBtns(){const st=Narr.status();
  if(st==='none')return'<button class="btn sm" disabled>旁白僅字幕</button>';
  if(st==='nozh')return'<button class="btn sm" data-a="narrhelp">沒有中文語音</button>';
  return`<button class="btn sm ${Narr.isOn()?'on':''}" data-a="narr">${Narr.isOn()?'旁白：開':'旁白：關'}</button>${Narr.voiceCount()>1&&Narr.isOn()?'<button class="btn sm" data-a="narrvoice">換聲音</button>':''}`}
function sndBtns(){return Snd.supported()?`<button class="btn sm ${Snd.musicOn()?'on':''}" data-a="music">${Snd.musicOn()?'音樂：開':'音樂：關'}</button><button class="btn sm ${Snd.sfxOn()?'on':''}" data-a="sfxt">${Snd.sfxOn()?'音效：開':'音效：關'}</button>`:''}
function hudHtml(){
  const g=S.g,G=GAMES[S.game];let a,b;
  if(S.phase==='lobby'){a='等待玩家';b=`${S.players.length} 人・需要 ${G.min}–${G.max} 人`}
  else if(S.phase==='over'||!g){a='遊戲結束';b=S.result?esc(S.result.title):''}
  else if(g.briefEnd){a='身分確認';b=`剩餘 <span id="hudclock" data-end="${g.briefEnd}">–</span> 後開始`}
  else if(S.game==='virus'){a=g.round>=1?`第 ${g.round} 日`:'準備階段';b=S.practice?'練習場・不計時':g.round>=1?`剩餘 <span id="hudclock" data-end="${dayEnd()}">–</span>`:'第 1 日開始後計時'}
  else{a=`第 ${g.round} 回合`;b=`輪到${cStageName(S)}${g.stageEnd?`・剩 <span id="hudclock" data-end="${g.stageEnd}">–</span>`:''}・共 ${S.opts.maxRounds} 回合`}
  return`<div class="hud" id="hud"><div class="hudrow"><span class="hudday">${a}</span><span class="hudtime">${b}</span></div><div class="hudrow hudbtns">${narrBtns()}${sndBtns()}</div><div class="hudcap" id="hudcap" aria-live="polite">${esc(Narr.caption())}</div></div>`}
function startPractice(){if(!send({t:'practice',pid:myId,key:myKey,name:ui.nick.trim()}))toast('還沒連上遊戲伺服器')}
function createRoom(){if(!send({t:'create',pid:myId,key:myKey,name:ui.nick.trim(),game:ui.game}))toast('還沒連上遊戲伺服器')}
function joinRoom(code){code=(code||'').trim().toUpperCase();if(code.length!==4){toast('請輸入 4 碼房號');return}
  wantRoom=code;if(!send({t:'join',code,pid:myId,key:myKey,name:ui.nick.trim(),pw:ui.pw||''}))toast('還沒連上遊戲伺服器')}
// show my new look at once, so quick taps build on each other instead of on what the server last confirmed
let lookPend=null;
const myLook=()=>{const mine=S&&S.players.find(p=>p.id===me);return normLook(lookPend&&Date.now()-lookPend.t<2000?lookPend.L:(mine&&mine.look)||LOOKS[0][1])};
function setLook(L){const mine=S&&S.players.find(p=>p.id===me);if(!mine||S.phase!=='lobby')return;lookPend={L,t:Date.now()};mine.look=L;go({k:'look',look:L});if(mode==='net')render()}
function go(a,asHost){
  if(!S)return;
  if(mode==='net'){send({t:'act',a,host:!!asHost});if(a.k!=='say'&&!String(a.k).startsWith('grp')){ui.confirmNext=false}return}
  const prev=JSON.parse(JSON.stringify(S));const err=act(S,asHost?null:me,a,!!asHost);
  if(err){toast(err);return}
  narrate(prev);
  if(a.k!=='say'&&!String(a.k).startsWith('grp')){ui.pick=null;ui.t=null;ui.confirmNext=false}
  if(S.phase==='play'&&S.game==='chase'&&!asHost&&a.k==='done')ui.cover=true;
  render();ls.set('ax_local',S);
}
function leave(){Voice.disable();nPub=null;Narr.clear();Snd.scene('');if(mode==='net')send({t:'leave'});wantRoom=null;S=null;mode=null;me=null;ui.cover=false;ui.pick=null;ls.del('ax_room');render()}
function startLocal(resume){
  mode='local';me=null;wantRoom=null;
  S=resume&&ls.get('ax_local')||newState(ui.game,null,'');S.opts.verify='none';S.opts.briefSec=0;S.opts.stageSec=0;     // one phone passed around: no clock per half-round
  ui.cover=S.phase!=='lobby';nPub=null;narrate(null);render();
}

/* ============ views ============ */
const inGame=()=>S&&S.players.some(p=>p.id===me);
function rulesHtml(game,quick){
  const o=S?S.opts:{deathDelay:2,rounds:5,roundMin:'std',lootGoal:6,maxRounds:15};
  const wrap=(name,lines,full)=>quick?`<section class="panel"><h3>${name}：30 秒看懂</h3><ul>${lines.map(([k,t])=>`<li><b>${k}</b>：${t}</li>`).join('')}</ul>${full.replace('<summary>'+name+'規則','<summary>完整規則')}</section>`:full;
  if(game==='virus')return wrap('感染戰',[
    ['你是誰','開局抽一個只有你知道的身分。恐怖分子要讓其他人病死或被槍殺；市民、研究員、記者要消滅恐怖分子或做出解毒劑；搜查官和狂熱分子各有自己的目標。'],
    ['怎麼贏',`沒有投票。病毒每天依秘密序號傳給下一個人，感染滿 ${o.deathDelay} 日就死；共 ${o.rounds} 日，靠技能、子彈和解毒劑分勝負。`],
    ['怎麼放技能','每個技能配一個只有你知道的指定動作，走到對方旁邊做 3 秒就會發動。醫務室的感染檢測儀每天可以測一次自己，結果公開。']],
  `<details><summary>感染戰規則</summary><ul>
    <li>每人拿到一個角色、一個公開的座號（顯示在角色頭上）和一個只有自己知道的感染序號。全程沒有投票，死亡只會來自子彈或病毒。</li>
    <li>共 ${o.rounds} 日。房主按「提早結束本日」時結算：病毒先傳給下一個感染序號的存活玩家（最大號接回最小號，跳過死者），再讓感染滿 ${o.deathDelay} 日的人死亡。</li>
    <li>每日限時：${schedText(o)}（預設是標準時程：第 1 到 5 日依序 8、10、10、5、3 分鐘），時間到自動結算。如果所有人手上已經沒有任何能改變結果的技能，系統會公布照規則走完的結果，並詢問存活玩家是否提前結束；存活玩家全數同意就直接結算，有人不同意則照常進行，隔天再問一次。</li>
    <li>每日結束公布感染人數、死亡人數（含槍擊）、解毒劑進度。死者公開姓名與角色，不公開感染序號和抗體。</li>
    <li>抗體保有者是其中一位一般市民，但字卡上不會寫，連本人都不知道。他會被感染也會傳染，一日後自行痊癒，不會病死。市民要和研究員合作，讓研究員製藥才查得出抗體在誰身上；製藥結果只有研究員看得到。結算時才公布。</li>
    <li>獎勵（代幣）：恐怖分子勝各 4；市民方勝各 1、存活再 +1，研究員因解毒劑獲勝再 +1；搜查官在恐怖分子全滅時依達成日得 4/4/3/2/1；狂熱分子依死亡日得 3/2/2/1/0。</li>
    <li>連線對戰時，每個人在 3D 建築裡操控自己的角色：左下搖桿移動，拖曳畫面轉視角，右上角有小地圖。建築有兩個廳（圓桌廳、交誼廳）、六個房間（圖書室、置物間、茶水間、音樂室、儲藏室、醫務室）和連接它們的走廊。你只看得到、聽得到和你在同一個空間的人，走廊也算一個空間。</li>
    <li>遊戲結束後可以留在房間裡不限時聊天復盤（文字或語音），也能回到建築裡走動，所有人都以身分造型出現。留下的人全部同意「再來一局」，就會重新發身分直接開新局；隨時可以按「離開房間」。</li>
    <li>遊戲進行時用橫向畫面：左下搖桿走動、拖曳畫面轉視角，右上是小地圖，上方的「身分／交談／紀錄／選單」按一下打開、再按一下收起。手機直立拿著時畫面會自動轉 90 度，把手機橫過來即可。</li>
    <li>開局前可以在大廳選擇自己的造型（20 種，男女各 10），也可以微調髮型、髮色、膚色、服裝、花紋、配件、身高和胖瘦；和別人太像時會提醒你換。座號照加入房間的順序編排。</li>
    <li>指定動作：每個技能開局會隨機配到一個只有你知道的動作，共 12 種。七種要走到對方旁邊做 3 秒：挽手臂、搭肩、比槍、遞東西、鞠躬、猜拳、拍背。五種要利用建築：和對方同坐交誼廳的長椅（每張 4 個座位）、到圖書室把對方座號的書倒過來、到置物間把信投進對方座號的置物櫃、對方在茶桌旁時為他倒茶、房間裡只有你和對方時關燈。系統自動判定，不需要任何人同意。</li>
    <li>所有人都能做這些動作，但只有符合自己指定動作的那一次會發動技能。系統不會通知任何人誰做了什麼，只有剛好在同一間看到的人才知道。倒放的書和置物櫃的信號旗會留到當日結束，任何人走進去都看得到；關燈的房間裡看不到名字和動作標示。</li>
    <li>開局沒有人知道別人的身分，同陣營也一樣。病毒全隊只有一份，誰先用掉就沒了。大廳可以改成同陣營互相知道。</li>
    <li>每日時間到會自動結算，房主也可以提早結束。</li>
    <li>開局先隨機抽身分，接著有 60 秒的身分確認時間，畫面會列出你的技能、目標、施放條件、操作方式、獲勝條件和積分計算。時間到自動開始第 1 日，房主也可以提早開始。</li>
    <li>配樂會依場景切換（大廳、身分確認、白天、最後一分鐘、各種結局），槍響、鐘聲、心跳等音效會配合事件播放。畫面上方可以分別關掉音樂和音效。</li>
    <li>旁白會在開局、每日開始與結束、有人出局、倒數和結局時播報，同時顯示字幕。畫面上方可以關掉旁白聲音。</li>
    <li>語音：按「開啟語音通話」後可以直接說話。聲音跟著角色的距離，站得近聽得清楚，走遠就聽不見；想私下談就走到角落，別人也可以靠過來偷聽。出局的人只聽得到、也只能對其他出局的人說話。</li>
    <li>文字交談：公開討論室所有人可見；可以一對一密談，也可以拉任意幾個人開群組，不限陣營。說謊、冒充身分都允許。出局的人只能在「幽靈頻道」發言，活著的人看不到，遊戲結束後才公開。</li>
    <li>出局後可以在整棟建築裡自由飄移觀戰，看得到每個房間的人，但不能影響遊戲。</li>
    <li>座號標記：每個座號有自己的顏色和形狀（1–8 號圓形、9–16 號三角形），顯示在頭頂、腳下光圈和所有名單上；遠處的人只顯示標記。關燈的房間裡只看得到標記的外框。</li>
    <li>靜音與移除：玩家名單上可以把任何人靜音（語音和文字都隱藏，只影響自己的手機）；房主在遊戲中也能移除玩家，被移除的人算出局並公開身分。房主可以設 4 位數房間密碼。</li>
    <li>出局的人和結算時的所有人，角色會換成該身分的專屬造型。</li>
    <li>感染檢測儀：醫務室裡有一台檢測儀。每個活著的玩家每日可以走過去檢測自己一次，結果「已感染」或「未感染」會公開給所有人。抗體保有者在感染的那一日也會測出已感染，痊癒後就是未感染。</li>
    <li>新手局：房主可以在大廳開啟。開啟後不發記者和狂熱分子，同陣營開局互相知道身分。</li>
    <li>動作練習場：首頁可以一個人進 3D 建築，對三個假人練習所有指定動作和感染檢測儀，不影響任何人。</li>
    <li>本版調整：感染者本人不會收到通知，要靠檢測儀確認；指定動作是本版自己設計的。</li></ul></details>`);
  return wrap('地鐵追捕',[
    ['你是誰','小偷，或三隊警察裡的一員。小偷身分公開、位置不公開；警隊裡可能藏著暗中幫小偷的內鬼。'],
    ['怎麼贏',`小偷收集 ${o.lootGoal} 件贓物就贏；警察要在 ${o.maxRounds} 回合內抓到所有小偷。`],
    ['怎麼行動','每回合每人最多移動 2 站。警察另外可以在所在的站「調查」小偷有沒有來過，或「逮捕」此刻在這站的小偷。']],
  `<details><summary>地鐵追捕規則</summary><ul>
    <li>遊戲結束後可以留在房間裡不限時聊天復盤（文字或語音）。留下的人全部同意「再來一局」，就會重新發身分直接開新局；隨時可以按「離開房間」。</li>
    <li>遊戲進行時用橫向畫面：左邊是路線圖（可拖曳旋轉、點車站），右邊是行動面板；上方的「行動／交談／紀錄／選單」可切換或收起。手機直立拿著時畫面會自動轉 90 度。</li>
    <li>小偷身分公開，位置不公開。10 個站藏有贓物，只有小偷看得到；收集 ${o.lootGoal} 件小偷方獲勝。</li>
    <li>開局先隨機抽身分，接著有 60 秒的身分確認時間，時間到自動開始，房主也可以提早開始。</li>
    <li>每回合分兩段：小偷先行動，接著所有警隊同時行動。每段限時 ${o.stageSec||45} 秒，時間到自動換下一段。最多 ${o.maxRounds} 回合（房主可選 10、12、15）。</li>
    <li>每人每回合最多移動 2 站。警察另有 2 次行動，都作用在自己所在的站：「調查」得知小偷是否來過，「逮捕」抓住此刻在這站的小偷。結果只有同隊看得到。</li>
    <li>內鬼是警察隊員，每回合都看得到小偷的位置；小偷知道誰是內鬼。</li>
    <li>每位警察可指認一名同隊隊友是內鬼，結算時揭曉。</li>
    <li>語音：遊戲進行中，警察只聽得到同隊（內鬼也在隊裡），小偷只聽得到小偷。</li>
    <li>文字交談：公開討論室、各隊自己的頻道、小偷頻道、一對一密談，也可以拉任意幾個人開群組。說謊和冒充都允許，被捕的小偷仍可以發言。</li>
    <li>獎勵（代幣，本版自訂）：小偷方獲勝時小偷與內鬼各 3；警察獲勝時清白警察各 1；清白警察每逮捕一名小偷 +2、指認正確 +1。</li>
    <li>本版調整：地圖為原創的 32 站路線圖，人數不足 14 人時自動縮編。</li></ul></details>`);
}
function compHtml(){
  const n=S.players.length;
  if(S.game==='virus'){const c=vComp(Math.max(n,6),S.opts.novice);
    return [['T','threat'],['R','safe'],['J','safe'],['C','safe'],['I','neutral'],['F','neutral']].filter(([k])=>c[k]>0)
      .map(([k,cl])=>`<span class="chip c-${cl}">${VR[k].n} <b>${c[k]}</b></span>`).join('')+`<span class="chip">抗體保有者 <b>1</b>（一般市民之一，本人不知道）</span>`}
  const c=cComp(Math.max(n,5));
  return`<span class="chip c-threat">小偷 <b>${c.th}</b></span><span class="chip c-safe">警察 <b>${c.cops-c.cor}</b></span><span class="chip c-neutral">內鬼 <b>${c.cor}</b></span><span class="chip">警隊 <b>${c.teams}</b></span>`;
}
function homeView(){
  const hasLocal=!!ls.get('ax_local'),room=ls.get('ax_room');
  const st={checking:'正在連線到遊戲伺服器…',ok:'已連上遊戲伺服器。不需要註冊任何帳號。',none:'連不上遊戲伺服器，正在重試。這段時間可以先用單機輪流。'}[online];
  return`<header class="stack"><h1>暗線遊戲室</h1><p class="sub">給一群朋友的角色制對局。每個人用自己的手機操控角色、看身分、用技能，伺服器當裁判。iPhone 和 Android 手機用瀏覽器打開就能玩。</p></header>
  <section class="stack"><h3>選一款</h3>
    ${Object.entries(GAMES).map(([k,G])=>`<button class="btn gamecard ${ui.game===k?'on':''}" data-a="pickgame" data-v="${k}"><span class="nm">${G.name}</span><span class="ds">${G.ds}</span><span class="ds">${G.min}–${G.max} 人</span></button>`).join('')}
  </section>
  <section class="panel"><h3>連線對戰</h3>
    <label class="sub" for="nick">你的暱稱</label><input type="text" id="nick" maxlength="12" value="${esc(ui.nick)}" placeholder="例如：阿哲" data-in="nick" autocomplete="off">
    <button class="btn pri wide" data-a="create" ${online==='ok'?'':'disabled'}>開新房間</button>
    <div class="row"><div class="grow"><input type="text" id="join" maxlength="4" value="${esc(ui.join)}" placeholder="輸入 4 碼房號" data-in="join" autocapitalize="characters" autocomplete="off"></div><button class="btn" data-a="join" ${online==='ok'?'':'disabled'}>加入</button></div>
    ${ui.needPw?`<div class="row"><div class="grow"><input type="text" id="pwin" inputmode="numeric" maxlength="4" value="${esc(ui.pw||'')}" placeholder="房間 ${esc(ui.needPw)} 的密碼" data-in="pw" autocomplete="off"></div><button class="btn pri" data-a="join">用密碼加入</button></div>`:''}
    ${room&&online==='ok'?`<button class="btn sm" data-a="rejoin" data-v="${esc(room)}">回到房間 ${esc(room)}</button>`:''}
    <p class="sub">${st}</p></section>
  <section class="panel"><h3>動作練習場</h3><p class="sub">第一次玩感染戰？先一個人進 3D 建築，對假人練習 12 種指定動作和感染檢測儀。不會影響任何人。</p>
    <button class="btn wide" data-a="practice" ${online==='ok'?'':'disabled'}>進入練習場</button></section>
  <section class="panel"><h3>單機輪流</h3><p class="sub">只用這一台裝置，輪到誰就交給誰。這個模式沒有走動和指定動作，技能直接按按鈕。</p>
    <div class="row"><button class="btn grow" data-a="local">開始單機局</button>${hasLocal?`<button class="btn" data-a="localresume">接續上一局</button>`:''}</div></section>
  ${rulesHtml('virus',true)}${rulesHtml('chase',true)}`;
}
function topBar(){return hudHtml()+topBar0()+(mode==='net'&&inGame()?'<div id="vbar" class="vbar"></div>':'')}
function topBar0(){return`<div class="row between"><div><h2>${GAMES[S.game].name}</h2><span class="sub">${mode==='local'?'單機輪流':'房號 '+esc(S.code)+((mode==='net'&&S.hostId===me)?'・你是房主':'')}</span></div>
  <div class="row">${mode==='local'&&S.phase!=='lobby'?`<button class="btn sm" data-a="cover">換人</button>`:''}<button class="btn sm" data-a="leave">離開</button></div></div>${ui.net?`<p class="note">${ui.net}</p>`:''}`}
const thumbs={};
function thumb(l,w,h){if(!Stage3D||!l)return'';const q=Math.min(2,Math.max(1,window.devicePixelRatio||1)),k=l.join('')+'_'+w;return k in thumbs?thumbs[k]:(thumbs[k]=Stage3D.thumb(l,Math.round(w*q),Math.round(h*q)))}   // drawn at the screen's real pixel density
// warn when my look is close to somebody else's: 16 people in one building must be told apart at a glance
function likeHtml(){const L=myLook(),near=S.players.filter(p=>p.id!==me&&p.look&&lookLike(L,p.look)>=7);
  return near.length?`<p class="note">你的造型和 ${near.map(p=>esc(p.name)).join('、')} 很像，遠遠看會分不出來。建議換個上衣顏色、配件或身高。</p>`:''}
function lookHtml(){
  const mine=S.players.find(p=>p.id===me);if(!mine||mode!=='net'||!Stage3D)return'';
  const L=myLook(),key=L.join(''),P=Stage3D.palette,hex=c=>'#'+c.toString(16).padStart(6,'0');
  const sw=(i,arr,label)=>`<div class="row"><span class="sub lk">${label}</span>${arr.map((c,v)=>`<button class="swatch ${L[i]===v?'on':''}" data-a="lookset" data-i="${i}" data-v="${v}" style="background:${hex(c)}" aria-label="${label} ${v+1}"></button>`).join('')}</div>`;
  const ch=(i,names,label)=>`<div class="row"><span class="sub lk">${label}</span>${names.map((n,v)=>`<button class="btn sm ${L[i]===v?'on':''}" data-a="lookset" data-i="${i}" data-v="${v}">${n}</button>`).join('')}</div>`;
  return`<section class="panel"><h3>你的造型</h3>
    <div class="lookrow"><img class="lookbig" src="${thumb(L,132,176)}" alt="目前的造型">
      <div class="lookgrid">${LOOKS.map(([n,l],i)=>`<button class="lookbtn ${l.join('')===key?'on':''}" data-a="lookpreset" data-v="${i}" title="${n}" aria-label="${n}"><img src="${thumb(l,60,80)}" alt=""></button>`).join('')}</div></div>
    <p class="sub">前兩排是 10 種男性、後兩排是 10 種女性。選一個之後還可以微調配件、花紋、身高和胖瘦。所有人都看得到你的造型。</p>
    <details ${ui.lookOpen?'open':''}><summary data-a="looktoggle">微調造型</summary><div class="stack lookopts">
      ${ch(0,['男','女'],'體型')}${sw(1,P.skin,'膚色')}${ch(2,['短髮','平頭','側分','長直髮','馬尾','鮑伯頭','丸子頭','捲髮'],'髮型')}${sw(3,P.hair,'髮色')}
      ${sw(4,P.top,'上衣')}${ch(9,['素色','橫條紋','雙色拼接','胸前圖案'],'花紋')}${ch(5,['短袖','長袖'],'袖長')}${ch(6,['長褲','短褲','裙子'],'下身')}${sw(7,P.bot,'下身顏色')}
      ${ch(8,['無','眼鏡','棒球帽','毛帽','圍巾','背包'],'配件')}${ch(10,['矮','中等','高'],'身高')}${ch(11,['纖瘦','標準','壯碩'],'胖瘦')}</div></details>${likeHtml()}</section>`;
}
function lobbyView(){
  const G=GAMES[S.game],n=S.players.length,h=isHost(),ok=n>=G.min&&n<=G.max;
  const optBtn=(o,v,l)=>`<button class="btn sm ${S.opts[o]===v?'on':''}" data-a="opt" data-o="${o}" data-v="${v}">${l}</button>`;
  return topBar()+
  (mode!=='local'?`<section class="panel"><h3>房號</h3><div class="code">${esc(S.code)}</div><p class="sub">朋友用手機瀏覽器打開下面的網址就會直接進房，或打開首頁輸入這 4 碼。不需要任何帳號。</p><p class="share" id="share">${esc(location.origin+'/?room='+S.code)}</p><button class="btn sm" data-a="copy">複製邀請網址</button></section>`:'')+
  `<section class="panel"><div class="row between"><h3>玩家 ${n} 人</h3><span class="sub">需要 ${G.min}–${G.max} 人</span></div>
    <div class="plist">${S.players.map((p,pi)=>`<div class="pl ${p.id===me?'me':''}" data-sp="${esc(p.id)}"><span class="pn">${thumb(p.look,36,48)?`<img class="pth" src="${thumb(p.look,36,48)}" alt="">`:''}${markHtml(pi+1)}${pi+1}號 ${esc(p.name)}</span>${h&&p.id!==S.hostId?`<button class="btn sm" data-a="kick" data-v="${esc(p.id)}" aria-label="移除 ${esc(p.name)}">移除</button>`:p.id===S.hostId?'<span class="tag">房主</span>':''}</div>`).join('')||'<p class="sub">還沒有人。</p>'}</div>
    ${mode==='local'?`<div class="row"><div class="grow"><input type="text" id="add" maxlength="12" value="${esc(ui.add)}" placeholder="輸入玩家名字" data-in="add"></div><button class="btn" data-a="addp">加入</button></div>`:''}
    ${mode==='net'&&!inGame()?`<p class="note">${S.kicked[me]?'你已被房主移出這個房間。':'正在加入…'}</p>`:''}</section>
  ${lookHtml()}
  <section class="panel"><h3>這個人數的配置</h3><div class="row">${compHtml()}</div></section>
  ${S.opts.pw&&mode==='net'?`<p class="note">這個房間有密碼：<b>${esc(S.opts.pw)}</b>。新加入的人要輸入密碼。</p>`:''}
  ${h?`<section class="panel"><h3>設定</h3>
    <div class="row"><span class="sub">遊戲</span>${Object.entries(GAMES).map(([k,g])=>`<button class="btn sm ${S.game===k?'on':''}" data-a="setgame" data-v="${k}">${g.name}</button>`).join('')}</div>
    ${S.game==='virus'?`<div class="row"><span class="sub">感染後幾日死亡</span>${optBtn('deathDelay',1,'1')}${optBtn('deathDelay',2,'2')}</div>
      <div class="row"><span class="sub">每日分鐘（時間到自動結算）</span>${optBtn('roundMin','std','標準 '+SCHED.join('/'))}${[5,10,12,15,30].map(v=>optBtn('roundMin',v,v)).join('')}</div>
      <div class="row"><span class="sub">新手局（不發記者和狂熱分子，同陣營互相知道）</span>${optBtn('novice',0,'關')}${optBtn('novice',1,'開')}</div>
      ${mode==='local'?'':`<div class="row"><span class="sub">技能怎麼發動</span>${optBtn('verify','3d','走過去做指定動作')}${optBtn('verify','none','直接按按鈕')}</div>`}
      <div class="row"><span class="sub">同陣營開局互相知道身分</span>${optBtn('knowMates',0,'不知道')}${optBtn('knowMates',1,'知道')}</div>`
    :`<div class="row"><span class="sub">小偷要收集幾件</span>${[5,6,7].map(v=>optBtn('lootGoal',v,v)).join('')}</div>
      <div class="row"><span class="sub">回合數</span>${[10,12,15].map(v=>optBtn('maxRounds',v,v)).join('')}</div>`}
    ${mode==='net'?`<div class="row"><span class="sub">房間密碼（4 位數字，留空 = 不用密碼）</span><div class="grow"><input type="text" id="pw" inputmode="numeric" maxlength="4" value="${esc(ui.pwSet!=null?ui.pwSet:S.opts.pw||'')}" data-in="pwSet" placeholder="不用密碼" autocomplete="off"></div><button class="btn sm" data-a="setpw">${S.opts.pw?'更新':'設定'}</button></div>`:''}
    <button class="btn pri wide" data-a="start" ${ok?'':'disabled'}>${ok?'發身分，開始':'還差 '+Math.max(0,G.min-n)+' 人'}</button></section>`
  :`<p class="note">等房主開始遊戲。</p>`}
  ${rulesHtml(S.game,true)}`;
}
function logHtml(){
  const p=(S.priv[me]||[]).slice().reverse(),q=S.pub.slice().reverse();
  return(inGame()?`<section class="panel"><h3>只有你看得到</h3><div class="log secret">${p.map(l=>`<div><span class="r">${S.game==='virus'?'D':'R'}${l.r}</span><span>${esc(l.t)}</span></div>`).join('')||'<p class="sub">還沒有情報。</p>'}</div></section>`:'')+
  `<section class="panel"><h3>公開紀錄</h3><div class="log">${q.map(l=>`<div><span class="r">${S.game==='virus'?'D':'R'}${l.r}</span><span>${esc(l.t)}</span></div>`).join('')}</div></section>`;
}
function chatHtml(){
  if(!inGame())return'';
  const chat=(S.chat||[]).filter(m=>m.f===me||!isMuted(m.f)),v=S.game==='virus'&&S.phase==='play',c=S.game==='chase'&&S.g,dead=v&&!S.g.alive[me];
  const ghostCh=dead||(S.game==='virus'&&S.phase==='over'&&chat.some(m=>m.to==='#ghost'));if(dead&&ui.ch!=='#ghost'&&!ui.chPicked)ui.ch='#ghost';
  const others=S.players.filter(p=>p.id!==me&&!(v&&!S.g.alive[p.id]));
  const th=c&&S.g.roles[me]==='thief',tk=c?(th?'#th':'#t'+S.g.team[me]):'';
  const mates=c?S.players.filter(p=>p.id!==me&&(th?S.g.roles[p.id]==='thief':S.g.roles[p.id]!=='thief'&&S.g.team[p.id]===S.g.team[me])).length:0;
  const groups=(S.groups||[]).filter(G=>G.m.includes(me)),G=groups.find(x=>x.id===ui.ch);
  if(ui.ch==='#ghost'){if(!ghostCh)ui.ch=''}else if(ui.ch==='#team'){if(!mates)ui.ch=''}else if(ui.ch.startsWith('#g')){if(!G)ui.ch=''}else if(ui.ch&&!others.some(p=>p.id===ui.ch))ui.ch='';
  const inCh=(m,ch)=>ch==='#ghost'?m.to==='#ghost':ch==='#team'?m.to===tk:ch.startsWith('#g')?m.to===ch:ch?((m.f===me&&m.to===ch)||(m.f===ch&&m.to===me)):!m.to;
  const key=ch=>me+'|'+ch,seen=ch=>ui.seen[key(ch)]||0;
  ui.seen[key(ui.ch)]=chat.reduce((a,m)=>inCh(m,ui.ch)&&m.i>a?m.i:a,seen(ui.ch));
  const chip=(ch,l)=>{const un=chat.filter(m=>inCh(m,ch)&&m.f!==me&&m.i>seen(ch)).length;return`<button class="btn sm ${ui.ch===ch?'on':''}" data-a="ch" data-v="${esc(ch)}">${esc(l)}${un>0?` <b class="un">${un}</b>`:''}</button>`};
  const msgs=chat.filter(m=>inCh(m,ui.ch)).slice(-40),tl=th?'小偷頻道':c?TEAMS[S.g.team[me]]+'頻道':'';
  const sub=ui.ch==='#ghost'?'幽靈頻道：只有出局的人看得到，活著的人看不到。遊戲結束後所有人都看得到。':G?`群組「${esc(G.n)}」：${G.m.map(id=>esc(nm(S,id))).join('、')}。只有成員看得到。`:ui.ch==='#team'?(th?'只有小偷看得到。':'只有同隊看得到。隊裡如果有內鬼，他也看得到。'):ui.ch?`與 ${esc(nm(S,ui.ch))} 密談，只有你們兩人看得到。`:'公開討論室，所有人都看得到。你說的不一定要是真話。';
  let panel='';
  if(ui.gpanel&&!dead){const cand=others.filter(p=>!(ui.gpanel==='inv'&&G&&G.m.includes(p.id)));
    ui.gsel=ui.gsel.filter(id=>cand.some(p=>p.id===id));const okN=ui.gpanel==='new'?ui.gsel.length>=2:ui.gsel.length>=1;
    panel=`<div class="stack"><p class="sub">${ui.gpanel==='new'?'選至少兩個人開群組，任何人都可以拉，不限陣營。':'選要加進這個群組的人。'}</p>
      <div class="row">${cand.map(p=>`<button class="btn sm ${ui.gsel.includes(p.id)?'on':''}" data-a="gsel" data-v="${esc(p.id)}">${esc(p.name)}</button>`).join('')||'<span class="sub">沒有其他人可以選。</span>'}</div>
      ${ui.gpanel==='new'?`<input type="text" id="gname" data-in="gname" maxlength="10" value="${esc(ui.gname)}" placeholder="群組名稱（可不填）" autocomplete="off">`:''}
      <div class="row"><button class="btn pri grow" data-a="gok" ${okN?'':'disabled'}>${ui.gpanel==='new'?'建立群組':'加入群組'}</button><button class="btn" data-a="cancel">取消</button></div></div>`}
  return`<section class="panel"><h3>交談</h3>
    <div class="row">${chip('','公開')}${ghostCh?chip('#ghost','幽靈頻道'):''}${mates?chip('#team',tl):''}${groups.map(x=>chip(x.id,x.n)).join('')}${others.map(p=>chip(p.id,p.name)).join('')}${dead?'':`<button class="btn sm" data-a="gnew">＋群組</button>`}</div>
    ${panel||`<p class="sub">${sub}</p>${G&&!dead?`<div class="row"><button class="btn sm" data-a="ginv">加人</button><button class="btn sm" data-a="gleave">退出群組</button></div>`:''}
    <div class="msgs" id="msgs">${msgs.map(m=>`<div class="msg ${m.f===me?'mine':''} ${m.to?'wh':''}"><span class="who">${markHtml(seatOf(m.f))}${esc(nm(S,m.f))}</span><span class="tx">${esc(m.t)}</span></div>`).join('')||'<p class="sub">還沒有人說話。</p>'}</div>
    ${dead&&ui.ch!=='#ghost'?'<p class="note">出局的人只能在幽靈頻道發言。</p>':`<div class="row inrow"><div class="grow"><input type="text" id="msg" data-in="msg" maxlength="200" value="${esc(ui.msg)}" placeholder="${ui.ch==='#ghost'?'對其他出局的人說…':G?'對群組說…':ui.ch==='#team'?'對隊友說…':ui.ch?'悄悄話…':'對所有人說…'}" autocomplete="off"></div>
      ${dict?`<button class="btn ${dictOn?'on':''}" id="mic" data-a="mic">${dictOn?'停止':'語音'}</button>`:''}<button class="btn pri" data-a="say">送出</button></div>`}`}</section>`;
}
function stageSlot(){return`<div id="stage-slot">${Stage3D?'':S.game==='chase'?'<div class="map">'+mapSvg()+'</div>':'<p class="note">這台裝置無法顯示 3D 場景，請房主把「技能怎麼發動」改成直接按按鈕。</p>'}</div>`}
function pickHtml(){
  const p=ui.pick,vg=S.game==='virus',g3=vg&&S.opts.verify==='3d'&&mode==='net';
  if(vg){p.targets=p.targets.filter(id=>S.g.alive[id]!==false);if(ui.t&&!p.targets.includes(ui.t))ui.t=null}
  const task=g3?vTask(S,me,p.k):null,need=task&&ui.t&&ui.t!==me,envT=task&&task[1]>=7;
  const lbl=!ui.t?'先選一個人':need?(envT?`準備對 ${esc(nm(S,ui.t))} 使用（${GN[task[1]]}）`:`對 ${esc(sn(ui.t))}「${GN[task[1]]}」3 秒`):`確定對 ${esc(sn(ui.t))} 使用`;
  return`<section class="panel"><h3>${esc(p.label)}：選擇對象</h3>
    <div class="plist">${p.targets.map(id=>`<button class="btn sm ${ui.t===id?'on':''}" data-a="target" data-v="${esc(id)}">${esc(vg?sn(id):nm(S,id))}${id===me?'（自己）':''}</button>`).join('')}</div>
    ${task?`<p class="note">這個技能的條件：${task[0]}。${envT?`按下按鈕後技能進入準備狀態，接著去完成這個動作，系統會自動判定。${ui.t&&ui.t!==me?'對方的座號是 '+S.g.seat[ui.t]+' 號。':''}`:'先走到對方旁邊（約兩步內），按下按鈕後保持 3 秒不要移動。也可以直接在場景裡點人來選對象。'}${ui.t===me?'用在自己身上不需要動作。':''}</p>`:''}
    <div class="row"><button class="btn pri grow" data-a="confirm" ${ui.t?'':'disabled'}>${lbl}</button><button class="btn" data-a="cancel">取消</button></div></section>`;
}
function armHtml(A){const a=ui.armed;if(!a)return'';const t=armedTask();
  if(!t||!A.some(x=>x[0]===a.k)||S.g.alive[a.t]===false){ui.armed=null;return''}
  return`<div class="note armed">已準備「${SKN[a.k]}」→ ${esc(sn(a.t))}。現在去完成：${t[0]}。<button class="btn sm" data-a="disarm">取消準備</button></div>`}
function fakeHtml(){
  const g=S.g,others=S.players.filter(p=>p.id!==me&&g.alive[p.id]!==false);
  if(ui.ft&&!others.some(p=>p.id===ui.ft))ui.ft=null;
  return`<details class="fake" ${ui.fakeOpen?'open':''}><summary data-a="faketoggle">對人做動作（所有人都能做，不會發動技能）</summary>
    <p class="sub">任何人都可以對任何人做這 7 種動作，拿來試探或誤導別人。先選對象，走到他旁邊再選動作。長椅、書架、置物櫃、茶桌和電燈開關也是所有人都能用，走近就會出現按鈕。</p>
    <div class="row">${others.map(p=>`<button class="btn sm ${ui.ft===p.id?'on':''}" data-a="ftarget" data-v="${esc(p.id)}">${esc(sn(p.id))}</button>`).join('')}</div>
    <div class="ggrid">${GN.slice(0,7).map((n,i)=>`<button class="btn sm" data-a="fake" data-v="${i}" ${ui.ft?'':'disabled'}>${n}</button>`).join('')}</div></details>`;
}
function hostCtl(inner){return isHost()?`<section class="panel"><h3>房主控制</h3>${inner}</section>`:''}

// nothing anybody holds can change the result any more: the system asks the living whether to stop here
function offerHtml(){
  const g=S&&S.g,o=g&&S.phase==='play'&&S.game==='virus'?g.offer:null;if(!o||o.no)return'';
  const alive=S.players.filter(p=>g.alive[p.id]),yes=alive.filter(p=>o.yes[p.id]).length,can=me&&g.alive[me],mine=can&&o.yes[me];
  return`<div class="cx col offer"><span><b>結果已定：${o.title}</b>　已經沒有任何技能能改變結果。存活玩家全數同意就提前結束（${yes}/${alive.length} 同意）。</span>
    ${can?(mine?'<span class="sub">你已同意，等其他存活玩家。</span>':`<div class="row"><button class="btn sm pri grow" data-a="settle" data-v="1">同意提前結束</button><button class="btn sm" data-a="settle" data-v="0">不同意</button></div>`):'<span class="sub">由存活玩家表決。</span>'}</div>`}
// after the game: stay as long as you like; everybody still here agreeing deals a new game
function afterHtml(){
  const G=GAMES[S.game],n=S.players.length,ag=S.again||{},yes=S.players.filter(p=>ag[p.id]),wait=S.players.filter(p=>!ag[p.id]),mine=!!ag[me],v=S.game==='virus'&&mode==='net'&&Stage3D;
  return`<section class="panel after"><h3>賽後復盤</h3>
    <p class="sub">不限時，可以留下來用文字或語音聊天（現在所有人都聽得到）${v?'，也可以回到建築裡走走':''}。留下的人全部同意就會重新發身分、直接開新的一局。</p>
    ${inGame()?`<button class="btn ${mine?'on':'pri'} wide" data-a="rematch">${mine?'已同意再來一局（按一下取消）':'同意再來一局'}</button>`:''}
    <p class="sub">已同意 <b>${yes.length}</b> / ${n} 人${wait.length&&yes.length?'，還在等：'+wait.map(p=>esc(p.name)).join('、'):''}。${n<G.min?`目前只剩 ${n} 人，${G.name}至少要 ${G.min} 人，請回大廳找人。`:''}</p>
    <div class="row">${v?`<button class="btn grow" data-a="roam">${ui.roam?'看全員列隊':'回到建築裡走走'}</button>`:''}<button class="btn grow" data-a="leave">離開房間</button></div>
    ${isHost()?`<button class="btn wide" data-a="again">回大廳（換人或改設定）</button>`:''}</section>`}
function vStripHtml(){
  const g=S.g,alive=S.players.filter(p=>g.alive[p.id]);
  const end=dayEnd();
  return`<div class="strip"><div><div class="k">日</div><div class="v">${g.round||'–'}/${S.opts.rounds}</div></div>
    <div><div class="k">剩餘時間</div><div class="v" id="clock" data-end="${end}">–</div></div>
    <div><div class="k">存活</div><div class="v">${alive.length}</div></div>
    <div><div class="k">解毒劑</div><div class="v">${g.stats.cure}/2</div></div></div>
    <p class="sub">前一日結算：感染 ${g.stats.inf} 人，死亡 ${g.stats.dead} 人。${g.round===0?'現在是自由活動時間，可以先走動、聊天、練習動作。':''}</p>${gsOn()?'':offerHtml()}`}
function vIdHtml(){
  const g=S.g,all=S.players.map(p=>p.id),role=g.roles[me]&&g.roles[me]!=='?'?g.roles[me]:null,alive=all.filter(id=>g.alive[id]),g3=S.opts.verify==='3d'&&mode==='net';
  let h='';
  if(role){
    const R=VR[role],mates=S.opts.knowMates&&(role==='T'||role==='R')?vTeam(S,role).filter(id=>id!==me):[];
    const tasks=g3?(VSK[role]||[]).map(k=>[k,vTask(S,me,k)]).filter(x=>x[1]):[];
    h+=ui.hide?`<div class="hidden-card">身分卡已蓋住 <button class="btn sm" data-a="hide">翻開</button></div>`:
    `<section class="dossier"><span class="stamp ${R.c}">${R.f}</span><span class="lbl">你的身分</span><div class="role">${R.n}</div>
      <div class="num">座號 ${g.seat[me]}（公開）・感染序號 ${g.num[me]}（秘密）${g.alive[me]?'':'　・　已死亡'}</div>
      ${mates.length?`<div>同伴：<b>${mates.map(id=>esc(nm(S,id))).join('、')}</b></div>`:(role==='T'||role==='R')&&!S.opts.knowMates?'<div>你不知道誰是同伴，要自己找出來。</div>':''}
      <ul>${R.d.map(d=>`<li>${d}</li>`).join('')}</ul>
      ${tasks.length?`<div class="lbl">指定動作（只有你知道）</div><ul>${tasks.map(([k,t])=>`<li>${SKN[k]}：${t[0]}</li>`).join('')}</ul>`:''}
      <details class="fullbrief"><summary>完整身分說明</summary>${briefBody()}</details>
      <div><button class="btn sm" data-a="hide">蓋住</button></div></section>`;
    if(g.alive[me]){
      const used=g.used[me]||{},ru=g.ru[me]||{},others=alive.filter(id=>id!==me),A=[];
      if(role==='T'){if(!g.virusUsed)A.push(['infect','投放病毒（全隊一次）',others]);if(!used.bullet)A.push(['shoot','開槍（一次）',others]);if(!used.antidote)A.push(['antidote','使用解毒劑（一次）',alive])}
      if(role==='I'&&!ru.bullet)A.push(['shoot','開槍（本日一次）',others]);
      if(role==='J'&&!ru.check)A.push(['check','查驗身分（本日一次）',others]);
      if(role==='R'&&!ru.research)A.push(['research','製藥：指定受試者',others]);
      if(ui.pick)h+=pickHtml();
      else h+=`<section class="panel"><h3>你的技能</h3>${g.round<1?'<p class="sub">第 1 日開始後才能使用。</p>':A.length?`<div class="stack">${A.map(([k,l])=>{const t=g3?vTask(S,me,k):null;return`<button class="btn" data-a="pick" data-v="${k}">${l}${t?`<span class="tk">條件：${GN[t[1]]}</span>`:''}</button>`}).join('')}</div>`:'<p class="sub">目前沒有可用的技能。</p>'}${armHtml(A)}</section>`;
      ui._acts=A;
      if(!g3&&g.round>=1){const done=(g.ru[me]||{}).scan;h+=`<section class="panel"><h3>感染檢測儀</h3><p class="sub">每人每日一次，檢測自己有沒有被感染。結果會公開給所有人。</p><button class="btn wide" data-a="scan" ${done?'disabled':''}>${done?'今天已經檢測過了':'使用感染檢測儀'}</button></section>`}
      if(g3)h+=fakeHtml();
    }else h+=`<p class="note">你已死亡。你還可以轉動視角觀看，但不能移動、發言或使用技能。</p>`;
  }else h+=`<p class="note">這一局你是觀眾。</p>`;
  return h}
function vHostHtml(){const g=S.g;return hostCtl(g.round===0?`<button class="btn pri wide" data-a="next">開始第 1 日</button>`:
    ui.confirmNext?`<p class="sub">結算後病毒會擴散，感染到期的人會死亡。</p><div class="row"><button class="btn pri grow" data-a="next">確定結束第 ${g.round} 日</button><button class="btn" data-a="cancel">取消</button></div>`
    :`<p class="sub">時間到會自動結算，也可以提早結束。</p><button class="btn wide" data-a="asknext">提早結束第 ${g.round} 日並結算</button>`)}
function plTools(id){if(id===me||!inGame()||mode!=='net')return'';const k=S.kicked&&S.kicked[id];
  if(ui.kickAsk===id)return`<span class="row"><button class="btn sm pri" data-a="kick" data-v="${esc(id)}">確定移除</button><button class="btn sm" data-a="kickask" data-v="">取消</button></span>`;
  return`<span class="row"><button class="btn sm ${isMuted(id)?'on':''}" data-a="mute" data-v="${esc(id)}">${isMuted(id)?'已靜音':'靜音'}</button>${isHost()&&!k&&S.phase==='play'?`<button class="btn sm" data-a="kickask" data-v="${esc(id)}">移除</button>`:''}</span>`}
function vPlayersHtml(){const g=S.g,all=S.players.map(p=>p.id);return`<section class="panel"><h3>玩家</h3><div class="plist">${all.map(id=>`<div class="pl ${g.alive[id]?'':'dead'} ${id===me?'me':''}" data-sp="${esc(id)}"><span>${markHtml(seatOf(id))}${esc(sn(id))}</span><span class="tag">${g.alive[id]||!VR[g.roles[id]]?'':VR[g.roles[id]].n}</span>${plTools(id)}</div>`).join('')}</div></section>`}
function practiceHtml(){return S.practice?`<section class="panel"><h3>動作練習場</h3><p class="sub">只有你和三個假人。用「對人做動作」試做 7 種手勢；長椅、書架、置物櫃、茶桌、電燈開關走近就會出現按鈕；醫務室有感染檢測儀。你的身分卡上有三個技能，先按技能選假人，再去做指定動作，系統會告訴你條件有沒有成立。技能不會真的發動，時間也不會結束，練完按右上角「離開」。</p></section>`:''}
function virusView(){return topBar()+practiceHtml()+vStripHtml()+stageSlot()+vIdHtml()+chatHtml()+(S.practice?'':vHostHtml())+vPlayersHtml()+logHtml()+rulesHtml('virus')}
function mapSvg(){
  const g=S.g,role=g.roles[me],over=S.phase==='over',all=S.players.map(p=>p.id);
  const seeTh=over||role==='thief'||role==='corrupt',seeLoot=over||role==='thief';
  const myTurn=!over&&cActive(S).includes(me)&&!g.done[me]&&g.budget[me]&&g.budget[me].m>0,here=g.pos[me];
  const marks={};if(role&&role!=='thief')(g.marks['t'+g.team[me]]||[]).forEach(m=>marks[m.s]=m);
  if(over)Object.values(g.marks).forEach(a=>a.forEach(m=>marks[m.s]=m));
  let s=`<svg viewBox="0 0 406 386" role="img" aria-label="路線圖">`;
  LINES.forEach(L=>{s+=`<polyline points="${L.ids.map(i=>ST[i].x+','+ST[i].y).join(' ')}" fill="none" stroke="${L.c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`});
  ST.forEach(st=>{
    const cops=all.filter(id=>g.roles[id]!=='thief'&&g.pos[id]===st.id),th=seeTh?all.filter(id=>g.roles[id]==='thief'&&!g.arrested[id]&&g.pos[id]===st.id):[];
    const cls=['st',ui.sel===st.id?'sel':'',myTurn&&ADJ[here].includes(st.id)?'reach':'',here===st.id?'here':''].join(' ');
    s+=`<g class="${cls}" data-a="st" data-v="${st.id}" tabindex="0" role="button" aria-label="${st.n}">`;
    s+=`<circle cx="${st.x}" cy="${st.y}" r="20" fill="transparent"/>`;
    const m=marks[st.id];if(m)s+=`<circle cx="${st.x}" cy="${st.y}" r="13" fill="none" stroke="${m.hit?'var(--gold)':'var(--mute)'}" stroke-width="2" ${m.hit?'':'stroke-dasharray="3 3"'}/>`;
    s+=`<circle class="dot" cx="${st.x}" cy="${st.y}" r="8"/>`;
    if(seeLoot&&g.loot['s'+st.id])s+=`<rect x="${st.x-4}" y="${st.y-4}" width="8" height="8" fill="var(--gold)" transform="rotate(45 ${st.x} ${st.y})"/>`;
    cops.forEach((id,i)=>{const cx=st.x-10+i*10,cy=st.y-13;s+=`<circle cx="${cx}" cy="${cy}" r="${id===me?7:5.5}" fill="var(--t${g.team[id]})" stroke="${id===me?'var(--bone)':'var(--ink)'}" stroke-width="1.5"/>`});
    th.forEach((id,i)=>{const cx=st.x+10+i*9,cy=st.y+2;s+=`<path d="M${cx} ${cy-6}L${cx+6} ${cy}L${cx} ${cy+6}L${cx-6} ${cy}Z" fill="var(--ink)" stroke="${id===me?'var(--bone)':'var(--threat)'}" stroke-width="2"/>`});
    s+=`<text x="${st.x}" y="${st.y+21}">${st.n}</text></g>`;
  });
  return s+`</svg>`;
}
function cStripHtml(){
  const g=S.g,all=S.players.map(p=>p.id),thieves=all.filter(id=>g.roles[id]==='thief');
  return`<div class="strip"><div><div class="k">回合</div><div class="v">${g.round}/${S.opts.maxRounds}</div></div>
    <div><div class="k">行動中</div><div class="v" style="font-family:var(--body);font-size:16px">${cStageName(S)}</div></div>
    <div><div class="k">贓物</div><div class="v">${g.got}/${S.opts.lootGoal}</div></div>
    <div><div class="k">在逃</div><div class="v">${thieves.filter(id=>!g.arrested[id]).length}</div></div></div>`}
function cWaitHtml(){const g=S.g,waiting=cActive(S).filter(id=>!g.done[id]);return`<p class="sub">還沒結束行動：${waiting.map(id=>esc(nm(S,id))).join('、')||'無'}</p>`}
function cLegendHtml(){const role=S.g.roles[me];return`<p class="sub">${Stage3D?'可左右拖曳旋轉，也可以直接點車站。圓錐':'圓點'}是警察（紅、藍、綠隊）${role==='thief'||role==='corrupt'?(Stage3D?'，桃紅色菱形是小偷':'，菱形是小偷'):''}${role==='thief'?'，金色方塊是贓物':''}${role&&role!=='thief'?'。金圈是查到痕跡的站，虛線圈是沒有痕跡':''}。</p>`}
function cIdHtml(){
  const g=S.g,all=S.players.map(p=>p.id),role=g.roles[me],active=cActive(S);
  let h='';
  if(role){
    const b=g.budget[me],here=g.pos[me],my=active.includes(me)&&!g.done[me];
    if(my){
      const canMove=ui.sel!=null&&ADJ[here].includes(ui.sel)&&b.m>0;
      h+=`<section class="panel"><div class="row between"><h3>輪到你</h3><span class="sub">移動 ${b.m}/2${role==='thief'?'':'・行動 '+b.a+'/2'}</span></div>
        <p class="sub">你在「${ST[here].n}」。${b.m>0?'選一個相鄰的站移動：':'移動次數已用完。'}</p>
        ${b.m>0?`<div class="row">${ADJ[here].map(s=>`<button class="btn sm ${ui.sel===s?'on':''}" data-a="moveto" data-v="${s}">往「${ST[s].n}」</button>`).join('')}</div>`:''}
        ${canMove?`<button class="btn pri" data-a="move">移動到「${ST[ui.sel].n}」</button>`:''}
        ${role!=='thief'?`<div class="row"><button class="btn grow" data-a="cact" data-v="investigate" ${b.a>0?'':'disabled'}>調查「${ST[here].n}」</button><button class="btn grow danger" data-a="cact" data-v="arrest" ${b.a>0?'':'disabled'}>在這站逮捕</button></div>`:''}
        <button class="btn" data-a="cact" data-v="done">結束我的行動</button></section>`;
    }else h+=`<p class="note">${g.arrested[me]?'你已被逮捕。':active.includes(me)?'你已結束行動，等其他人。':'現在是'+cStageName(S)+'行動。'}</p>`;
    const cor=all.filter(id=>g.roles[id]==='corrupt'),mates=role==='thief'?[]:all.filter(id=>g.roles[id]!=='thief'&&g.team[id]===g.team[me]&&id!==me);
    const info={thief:['小偷','threat','小偷陣營',['每回合最多移動 2 站，經過藏有贓物的站會自動拿走','你走過的每一站都會留下痕跡','被警察在同一站逮捕就出局']],
      cop:['警察','safe','警察陣營',['每回合移動 2 站、行動 2 次','逮到所有小偷就獲勝','隊裡可能有內鬼，可以指認一人']],
      corrupt:['內鬼','neutral','與小偷同盟',['表面上是警察，行動方式相同','地圖上看得到小偷的位置','幫小偷拖延、誤導隊友；小偷收集完成你也獲勝']]}[role];
    h+=ui.hide?`<div class="hidden-card">身分卡已蓋住 <button class="btn sm" data-a="hide">翻開</button></div>`:
    `<section class="dossier"><span class="stamp ${info[1]}">${info[2]}</span><span class="lbl">你的身分</span><div class="role">${info[0]}</div>
      ${role!=='thief'?`<div>${TEAMS[g.team[me]]}${mates.length?'　隊友：<b>'+mates.map(id=>esc(nm(S,id))).join('、')+'</b>':''}</div>`:''}
      ${role==='thief'&&cor.length?`<div>內鬼：<b>${cor.map(id=>esc(nm(S,id))+'（'+TEAMS[g.team[id]]+'）').join('、')}</b></div>`:''}
      ${role==='corrupt'&&cor.length>1?`<div>另一名內鬼：<b>${cor.filter(id=>id!==me).map(id=>esc(nm(S,id))).join('、')}</b></div>`:''}
      <ul>${info[3].map(d=>`<li>${d}</li>`).join('')}</ul><details class="fullbrief"><summary>完整身分說明</summary>${briefBody()}</details><div><button class="btn sm" data-a="hide">蓋住</button></div></section>`;
    if(role!=='thief'&&mates.length){
      ui._acts=[['accuse','指認內鬼',mates]];
      h+=ui.pick?pickHtml():`<section class="panel"><h3>指認內鬼</h3><p class="sub">${g.accuse[me]?'目前指認：'+esc(nm(S,g.accuse[me]))+'。':'還沒指認。'}結算時揭曉，可以更改。</p><button class="btn" data-a="pick" data-v="accuse">選一名隊友</button></section>`;
    }
  }else h+=`<p class="note">這一局你是觀眾。</p>`;
  return h}
function cHostHtml(){return hostCtl(ui.confirmNext?`<p class="sub">還沒按結束的人會直接被跳過。</p><div class="row"><button class="btn pri grow" data-a="next">確定結束${cStageName(S)}的行動</button><button class="btn" data-a="cancel">取消</button></div>`
    :`<p class="sub">有人離席時可以直接跳過。</p><button class="btn wide" data-a="asknext">強制結束${cStageName(S)}的行動</button>`)}
function cPlayersHtml(){const g=S.g,all=S.players.map(p=>p.id);return`<section class="panel"><h3>玩家</h3><div class="plist">${all.map(id=>`<div class="pl ${g.arrested[id]||(S.kicked&&S.kicked[id])?'dead':''} ${id===me?'me':''}" data-sp="${esc(id)}"><span>${esc(nm(S,id))}${S.kicked&&S.kicked[id]?'（已移出）':''}</span><span class="tag">${g.roles[id]==='thief'?'小偷':TEAMS[g.team[id]]}</span>${plTools(id)}</div>`).join('')}</div></section>`}
function chaseView(){return topBar()+cStripHtml()+cWaitHtml()+stageSlot()+cLegendHtml()+cIdHtml()+chatHtml()+cHostHtml()+cPlayersHtml()+logHtml()+rulesHtml('chase')}
function overParts(){
  const g=S.g,R=S.result,v=S.game==='virus';
  const rows=S.players.map(({id,name})=>{
    const role=v?VR[g.roles[id]].n+(g.antibody===id?'・抗體':''):({thief:'小偷',cop:'警察',corrupt:'內鬼'}[g.roles[id]]+(g.roles[id]==='thief'?'':'・'+TEAMS[g.team[id]]));
    const st=v?(g.alive[id]?'存活':'第 '+g.deathRound[id]+' 日死亡')+'・座號 '+g.seat[id]+'・感染序號 '+g.num[id]+' 號':(g.roles[id]==='thief'?(g.arrested[id]?'被捕':'在逃'):(g.accuse[id]?'指認 '+nm(S,g.accuse[id]):'未指認'));
    return`<tr><td>${esc(name)}${id===me?'（你）':''}</td><td>${role}</td><td>${esc(st)}</td><td class="n">+${R.rw[id]||0}</td></tr>`}).join('');
  return{banner:`<section class="banner"><h2>${R.title}</h2><p class="sub">${esc(R.why)}</p></section>`,
    table:`<section class="panel"><h3>身分揭曉與代幣</h3><div class="scroll"><table><thead><tr><th>玩家</th><th>身分</th><th>結果</th><th style="text-align:right">代幣</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,
    again:isHost()?`<button class="btn pri wide" data-a="again">同一批人再來一局</button>`:'',
    log:`<section class="panel"><h3>公開紀錄</h3><div class="log">${S.pub.slice().reverse().map(l=>`<div><span class="r">${S.game==='virus'?'D':'R'}${l.r}</span><span>${esc(l.t)}</span></div>`).join('')}</div></section>`};
}
function overView(){const o=overParts();return topBar()+o.banner+stageSlot()+(mode==='net'?afterHtml():'')+o.table+(mode==='net'?'':o.again)+o.log}
function coverView(){
  const g=S.g,need=S.phase!=='play'?[]:S.game==='chase'?cActive(S).filter(id=>!g.done[id]):[];
  return topBarLite()+`<section class="panel cover"><h2>把裝置交給下一位</h2><p class="sub">點自己的名字才會顯示身分。別人拿著的時候請不要偷看。</p>
    <div class="plist">${S.players.map(p=>`<button class="btn ${need.includes(p.id)?'on':''}" data-a="iam" data-v="${esc(p.id)}">${esc(p.name)}${need.includes(p.id)?(S.game==='chase'?'・該你了':'・有事要確認'):''}</button>`).join('')}</div>
    ${S.phase==='play'&&S.game==='virus'?`<p class="sub">日 ${g.round||'–'}/${S.opts.rounds}</p>`:''}</section>
    ${S.phase==='play'?hostCtl(S.game==='virus'?(g.round===0?`<button class="btn pri wide" data-a="next">開始第 1 日</button>`:ui.confirmNext?`<div class="row"><button class="btn pri grow" data-a="next">確定結束第 ${g.round} 日</button><button class="btn" data-a="cancel">取消</button></div>`:`<button class="btn wide" data-a="asknext">結束第 ${g.round} 日並結算</button>`):ui.confirmNext?`<div class="row"><button class="btn pri grow" data-a="next">確定結束${cStageName(S)}的行動</button><button class="btn" data-a="cancel">取消</button></div>`:`<button class="btn wide" data-a="asknext">強制結束${cStageName(S)}的行動</button>`):''}
    <section class="panel"><h3>公開紀錄</h3><div class="log">${S.pub.slice().reverse().map(l=>`<div><span class="r">${S.game==='virus'?'D':'R'}${l.r}</span><span>${esc(l.t)}</span></div>`).join('')}</div></section>`;
}
function topBarLite(){return hudHtml()+`<div class="row between"><div><h2>${GAMES[S.game].name}</h2><span class="sub">單機輪流</span></div><button class="btn sm" data-a="leave">離開</button></div>`}

/* ---- landscape game screen (online play): the scene fills the screen; everything else sits in a slim top bar and a side drawer ---- */
const coarse=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches),rootEl=document.getElementById('root');
const gsOn=()=>!!(mode==='net'&&S&&S.g&&(S.phase==='play'||S.phase==='over'));
function gsTabs(){
  if(S.phase==='over')return[['res','結果'],['chat','交談'],['log','紀錄'],['menu','選單']];
  if(isBrief())return[['id','身分'],['menu','選單']];
  return S.game==='virus'?[['id','身分'],['chat','交談'],['log','紀錄'],['menu','選單']]:[['act','行動'],['chat','交談'],['log','紀錄'],['menu','選單']]}
function gsDefault(){const k=S.gid+'|'+S.phase+'|'+(isBrief()?'b':'p');if(ui.tabKey===k)return;ui.tabKey=k;ui.roam=false;ui.tab=S.phase==='over'?'res':isBrief()?'id':S.game==='chase'?'act':''}
function chatUnread(){
  if(!inGame())return 0;const c=S.game==='chase'&&S.g,th=c&&S.g.roles[me]==='thief',tk=c?(th?'#th':'#t'+S.g.team[me]):'';let n=0;
  for(const m of S.chat||[]){if(m.f===me)continue;const ch=!m.to?'':m.to==='#ghost'?'#ghost':m.to===tk?'#team':String(m.to).startsWith('#g')?m.to:m.to===me?m.f:null;if(ch!=null&&m.i>(ui.seen[me+'|'+ch]||0))n++}
  return n}
function gsTop(){
  const g=S.g,v=S.game==='virus';let info;
  if(S.phase==='over')info=`<span class="hudday">遊戲結束</span><span class="kv">${S.result?esc(S.result.title):''}</span>`;
  else if(isBrief())info=`<span class="hudday">身分確認</span><span class="hudtime">剩餘 <span id="hudclock" data-end="${g.briefEnd}">–</span> 後開始</span>`;
  else if(v){const alive=S.players.filter(p=>g.alive[p.id]).length;
    info=`<span class="hudday">${g.round>=1?'第 '+g.round+' 日':'準備階段'}</span><span class="hudtime">${S.practice?'練習場・不計時':g.round>=1?`剩餘 <span id="hudclock" data-end="${dayEnd()}">–</span>`:'尚未計時'}</span>
      <span class="kv">存活 <b>${alive}</b></span><span class="kv">解毒劑 <b>${g.stats.cure}/2</b></span><span class="kv opt">前一日感染 <b>${g.stats.inf}</b>・死亡 <b>${g.stats.dead}</b></span>`}
  else{const th=S.players.filter(p=>g.roles[p.id]==='thief'&&!g.arrested[p.id]).length;
    info=`<span class="hudday">第 ${g.round} 回合</span><span class="hudtime">輪到${cStageName(S)}${g.stageEnd?`・剩 <span id="hudclock" data-end="${g.stageEnd}">–</span>`:''}</span><span class="kv">贓物 <b>${g.got}/${S.opts.lootGoal}</b></span><span class="kv">在逃 <b>${th}</b></span><span class="kv opt">共 ${S.opts.maxRounds} 回合</span>`}
  const pn=(S.priv[me]||[]).length;if(ui.tab==='log')ui.privSeen[S.gid]=pn;
  const un={chat:ui.tab==='chat'?0:chatUnread(),log:Math.max(0,pn-(ui.privSeen[S.gid]||0))};
  return a2hsHtml()+`<div class="gs-top"><div class="gs-info">${info}${ui.net?`<span class="kv late">${ui.net}</span>`:''}</div>
    <div class="gs-tabs"><span id="vmini"></span>${fsBtn()}${gsTabs().map(([k,l])=>`<button class="btn sm ${ui.tab===k?'on':''}" data-a="tab" data-v="${k}">${l}${un[k]?` <b class="un">${un[k]}</b>`:''}</button>`).join('')}</div></div>`}
const standalone=()=>window.navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||(window.matchMedia&&matchMedia('(display-mode: fullscreen)').matches);
function fsBtn(){if(standalone())return'';const on=!!(document.fullscreenElement||document.webkitFullscreenElement);return`<button class="btn sm" data-a="fs" aria-label="${on?'離開全螢幕':'全螢幕'}">${on?'退出全螢幕':'全螢幕'}</button>`}
function a2hsHtml(){return ui.a2hs?`<div class="a2hs" role="dialog"><b>iPhone 要先「加入主畫面」才能全螢幕</b><ol><li>用 Safari 打開這個網址，按下方的「分享」按鈕。</li><li>選「加入主畫面」，再按「加入」。</li><li>之後從主畫面的「暗線」圖示打開，就沒有網址列擋住畫面。</li></ol><p class="sub">目前的房間會保留，從主畫面打開後按「回到房間」就能接著玩。</p><button class="btn pri wide" data-a="a2hsx">知道了</button></div>`:''}
function menuHtml(){
  const v=S.game==='virus';
  const qm=Stage3D&&Stage3D.qualityMode?Stage3D.qualityMode():'auto';
  return`<section class="panel"><h3>畫質</h3><div class="row hudbtns">${[['auto','自動'],['high','高'],['mid','中'],['low','省電']].map(([k,l])=>`<button class="btn sm ${qm===k?'on':''}" data-a="quality" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="sub">「自動」先用高畫質，手機跟不上時自動降低解析度與描邊，優先保持流暢。</p></section>
    <section class="panel"><h3>聲音與語音</h3><div class="row hudbtns">${narrBtns()}${sndBtns()}</div>${inGame()?'<div id="vbar" class="vbar"></div>':''}</section>
    ${S.phase==='over'?'':isBrief()?briefHost():v?vHostHtml():cHostHtml()}
    <section class="panel"><div class="row between"><div><h2>${GAMES[S.game].name}</h2><span class="sub">房號 ${esc(S.code)}${S.hostId===me?'・你是房主':''}</span></div><button class="btn sm" data-a="leave">離開</button></div>
      <p class="sub">遊戲進行時固定用橫向畫面。手機直立拿著時畫面會自動轉 90 度，把手機橫過來就可以了。</p></section>
    ${rulesHtml(S.game)}`}
function gsSide(){
  const t=ui.tab,v=S.game==='virus';if(!t)return'';let h='';
  if(t==='res'){const o=overParts();h=o.banner+afterHtml()+o.table}
  else if(t==='id')h=isBrief()?briefCard()+`<p class="note">不要讓別人看到你的畫面。時間到會自動開始。</p>`+briefHost():vIdHtml();
  else if(t==='act')h=cWaitHtml()+cIdHtml()+cLegendHtml();
  else if(t==='chat')h=chatHtml()||'<p class="note">觀眾不能發言。</p>';
  else if(t==='log')h=(S.phase==='over'?'':v?vPlayersHtml():cPlayersHtml())+logHtml();
  else if(t==='menu')h=menuHtml();
  return`<aside class="gs-side" id="side" data-tab="${t}">${h}</aside>`}
function gsView(){
  gsDefault();if(ui.tab&&!gsTabs().some(x=>x[0]===ui.tab))ui.tab='';
  const side=gsSide();
  return`<div class="gs ${isBrief()||S.phase==='over'?'wide':''} ${side?'open':''} g-${S.game}">${gsTop()}<div class="gs-main"><div class="gs-stage">${stageSlot()}</div>${side}</div></div>`}
// what sits on top of the scene: the narrator's caption and the skill that is waiting for its action
function stageHud(){
  if(!gsOn())return'';const a=ui.armed,t=a&&S.game==='virus'&&S.phase==='play'?armedTask():null;
  return`<div class="hudcap" id="hudcap" aria-live="polite">${esc(Narr.caption())}</div>${offerHtml()}${S.phase==='over'&&ui.roam?'<div class="cx"><span>賽後自由走動中</span><button class="btn sm" data-a="roam">看全員列隊</button></div>':''}${t?`<div class="cx armedx"><span>已準備「${SKN[a.k]}」→ ${esc(sn(a.t))}：${t[0]}</span><button class="btn sm" data-a="disarm">取消</button></div>`:''}`}
// the phone is held upright: turn the whole game a quarter so it reads right once the phone is on its side
const portrait=()=>{const so=screen.orientation;if(so&&so.type)return so.type.startsWith('portrait');if(typeof window.orientation==='number')return window.orientation%180===0;return innerHeight>innerWidth};
function layout(){
  const game=document.body.classList.contains('game'),vv=window.visualViewport,W=Math.round(vv?vv.width:innerWidth),H=Math.round(vv?vv.height:innerHeight),ox=vv?vv.offsetLeft:0,oy=vv?vv.offsetTop:0;
  const rot=game&&coarse&&portrait();document.body.classList.toggle('rot',rot);
  if(!game)rootEl.style.cssText='';
  else if(rot){rootEl.style.width=H+'px';rootEl.style.height=W+'px';rootEl.style.transform=`translate(${W+ox}px,${oy}px) rotate(90deg)`}
  else{rootEl.style.width=W+'px';rootEl.style.height=H+'px';rootEl.style.transform=ox||oy?`translate(${ox}px,${oy}px)`:''}
  if(Stage3D){Stage3D.rot=rot;if(Stage3D.el.isConnected)Stage3D.resize()}}
window.addEventListener('resize',layout);window.addEventListener('orientationchange',()=>setTimeout(layout,250));
if(window.visualViewport){visualViewport.addEventListener('resize',layout);visualViewport.addEventListener('scroll',layout)}
// Android can really lock the screen sideways (needs full screen and a tap); iPhones cannot, they get the quarter turn above
let lockTried='';
function tryLock(){
  if(!gsOn()||!coarse||lockTried===S.gid)return;lockTried=S.gid;const so=screen.orientation,de=document.documentElement;
  if(!so||!so.lock||!de.requestFullscreen||!portrait())return;
  de.requestFullscreen({navigationUI:'hide'}).then(()=>so.lock('landscape')).catch(()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})})}
function unlock(){lockTried='';try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock()}catch(e){}if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}
document.addEventListener('pointerup',tryLock,{passive:true});

function view(){
  if(!S)return homeView();
  if(S.phase==='lobby')return lobbyView();
  if(mode==='local'&&S.phase==='over'){me=null;return overView()}
  if(mode==='local'&&(ui.cover||!me))return coverView();
  if(mode==='net'&&!S.g)return lobbyView();
  if(gsOn())return gsView();
  if(S.phase==='over')return overView();
  if(isBrief())return briefView();
  return S.game==='virus'?virusView():chaseView();
}
function render(){
  if(composing){pendingRender=true;return}
  const a=document.activeElement,fid=a&&a.id,pos=a&&a.selectionStart;
  const om=document.getElementById('msgs'),stick=!om||om.scrollTop+om.clientHeight>=om.scrollHeight-30,otop=om?om.scrollTop:0;
  const osd=document.getElementById('side'),sdTab=osd&&osd.dataset.tab,sdTop=osd?osd.scrollTop:0;
  const game=gsOn(),was=document.body.classList.contains('game');document.body.classList.toggle('game',game);if(was&&!game)unlock();layout();
  if(Stage3D)Stage3D.fill=game;
  ui._acts=[];
  // on the game screen only the top bar and the side drawer are rebuilt; the 3D canvas stays where it is, so the picture never blinks
  const gsEl=game&&was&&Stage3D&&app.firstElementChild&&app.firstElementChild.classList.contains('gs')?app.firstElementChild:null,keep=gsEl&&Stage3D.el.parentNode&&gsEl.contains(Stage3D.el);
  if(keep){const tp=document.createElement('template');tp.innerHTML=view();const nw=tp.content.firstElementChild;
    if(nw&&nw.classList.contains('gs')){gsEl.className=nw.className;gsEl.querySelector('.gs-top').replaceWith(nw.querySelector('.gs-top'));
      const os=gsEl.querySelector('.gs-side'),ns=nw.querySelector('.gs-side');if(os&&ns)os.replaceWith(ns);else if(os)os.remove();else if(ns)gsEl.querySelector('.gs-main').appendChild(ns)}
    else{Stage3D.el.remove();app.innerHTML=tp.innerHTML}}
  else{if(Stage3D&&Stage3D.el.parentNode)Stage3D.el.remove();app.innerHTML=view()}
  if(Stage3D)Stage3D.roam=!!(game&&S.phase==='over'&&S.game==='virus'&&ui.roam);
  const nsd=document.getElementById('side');if(nsd&&nsd.dataset.tab===sdTab)nsd.scrollTop=sdTop;
  const slot=document.getElementById('stage-slot');
  if(Stage3D)Stage3D.walk=mode==='net'&&!isBrief();
  if(slot&&Stage3D&&S&&S.g)Stage3D.attach(slot,S,me,ui,(kind,id)=>{if(kind==='virus'){if(id===me)return;if(ui.pick&&ui.pick.targets.includes(id))H.target(id);else if(mode==='net'&&S.opts.verify==='3d'&&S.phase==='play'&&!isBrief()&&S.g.alive[id]!==false&&S.g.alive[me]){ui.ft=id;ui.fakeOpen=true;if(gsOn())ui.tab='id';render()}}else H.st(id)});
  if(Stage3D)Stage3D.setHud(stageHud());
  const nmg=document.getElementById('msgs');if(nmg)nmg.scrollTop=stick?nmg.scrollHeight:otop;
  paintVoice();paintCtx();Snd.scene(musicScene());
  if(fid){const n=document.getElementById(fid);if(n&&n!==document.activeElement){n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}}}
  tick();
}
function tick(){
  const now=Date.now()+tOff;
  if(S&&mode==='local'&&S.phase==='play'&&S.game==='virus'&&S.g.round>=1&&now>=dayEnd()){
    const r=S.g.round,prev=JSON.parse(JSON.stringify(S));act(S,null,{k:'next'},true);ui.confirmNext=false;toast(`第 ${r} 日時間到，已自動結算`);narrate(prev);render();ls.set('ax_local',S);return}
  timeCues(now);if(S&&mode)Snd.scene(musicScene());
  const hc=document.getElementById('hudclock');if(hc){const s=Math.max(0,Math.round((+hc.dataset.end-now)/1000));hc.textContent=s>=60?`${Math.floor(s/60)} 分 ${String(s%60).padStart(2,'0')} 秒`:`${s} 秒`;hc.classList.toggle('late',s<=(isBrief()?10:60))}
  const c=document.getElementById('clock');if(!c)return;const end=+c.dataset.end;if(!end){c.textContent='–';return}
  const s=Math.max(0,Math.round((end-now)/1000));c.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');c.classList.toggle('late',s<=60)}
setInterval(tick,1000);
/* ============ events ============ */
app.addEventListener('compositionstart',()=>{composing=true});
app.addEventListener('compositionend',e=>{composing=false;const k=e.target.dataset&&e.target.dataset.in;if(k)ui[k]=e.target.value;if(pendingRender){pendingRender=false;render()}});
app.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.in;if(!k)return;ui[k]=e.target.value;if(k==='nick')ls.set('ax_nick',ui.nick)});
app.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing)return;const t=e.target;if(t.id==='msg'){H.say();return}
  if(t.id==='add'){H.addp()}else if(t.id==='join'){H.join()}else if(t.classList&&t.classList.contains('st')){H.st(t.dataset.v)}});
app.addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(!el||el.disabled)return;const f=H[el.dataset.a];if(f)f(el.dataset.v,el)});
const H={
  pickgame(v){ui.game=v;render()},
  tab(v){ui.tab=ui.tab===v?'':v;render()},
  quality(v){if(Stage3D)Stage3D.setQuality(v);render()},
  settle(v){go({k:'settle',v:v==='1'});if(mode==='net')render()},
  rematch(){go({k:'rematch',v:!(S.again||{})[me]})},
  roam(){ui.roam=!ui.roam;if(ui.roam)ui.tab='';else ui.tab='res';render()},
  create(){createRoom()},join(){joinRoom(ui.join)},rejoin(v){joinRoom(v)},
  local(){startLocal(false)},localresume(){startLocal(true)},
  leave(){leave()},
  addp(){const n=ui.add.trim();if(!n)return;ui.add='';go({k:'add',id:'p'+Date.now().toString(36)+rnd(99),name:n.slice(0,12)},true);const i=document.getElementById('add');if(i)i.focus()},
  kick(v){ui.kickAsk=null;go({k:'kick',t:v},true)},
  setpw(){const v=String(ui.pwSet!=null?ui.pwSet:'').trim();if(v&&!/^\d{4}$/.test(v)){toast('密碼要是 4 位數字');return}ui.pwSet=null;go({k:'opt',o:'pw',v},true);toast(v?'已設定房間密碼':'已取消房間密碼')},
  setgame(v){go({k:'game',v},true)},
  opt(v,el){go({k:'opt',o:el.dataset.o,v:isNaN(+v)?v:+v},true)},
  start(){go({k:'start'},true);if(mode==='local'&&S.phase==='play'){ui.cover=true;me=null;render()}},
  again(){go({k:'again'},true)},
  asknext(){ui.confirmNext=true;render()},
  next(){go({k:'next'},true)},
  cancel(){ui.pick=null;ui.t=null;ui.confirmNext=false;ui.gpanel=null;render()},
  copy(){const t=location.origin+'/?room='+S.code;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('已複製邀請網址'),()=>{const e=document.getElementById('share');if(e){const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r)}toast('請長按網址複製')})},
  faketoggle(){ui.fakeOpen=!ui.fakeOpen},
  ftarget(v){ui.ft=v;ui.fakeOpen=true;render()},
  fake(v){if(!ui.ft||!Stage3D)return;const e=Stage3D.gesture(+v,ui.ft,'',nm(S,ui.ft));if(e)toast(e);else if(gsOn()){ui.tab='';render()}},
  gstop(){if(Stage3D)Stage3D.stop()},
  disarm(){ui.armed=null;render();paintCtx()},
  sit(v){ui.bench=+v;if(!envAsk('sit',7,{b:+v}))envSend('sit',7,{b:+v})},
  fs(){const d=document,el=d.documentElement;
    if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);setTimeout(render,300);return}
    const rq=el.requestFullscreen||el.webkitRequestFullscreen,iphone=/iPhone|iPod/.test(navigator.userAgent);
    if(rq&&!iphone){Promise.resolve(rq.call(el,{navigationUI:'hide'})).then(()=>{try{screen.orientation.lock('landscape').catch(()=>{})}catch(e){}setTimeout(render,300)}).catch(()=>{ui.a2hs=true;render()});return}
    ui.a2hs=true;render()},
  a2hsx(){ui.a2hs=false;render()},
  envyes(){const q=ui.envAsk;ui.envAsk=null;if(q)envSend(q.a,q.gi,q.x);paintCtx()},envno(){ui.envAsk=null;paintCtx()},
  stand(){send({t:'env',a:'stand'});if(Stage3D)Stage3D.stand();paintCtx()},
  book(v){if(!envAsk('book',8,{n:+v}))envSend('book',8,{n:+v})},letter(v){if(!envAsk('letter',9,{n:+v}))envSend('letter',9,{n:+v})},tea(){if(!envAsk('tea',10))envSend('tea',10)},scan(){if(S&&S.opts.verify==='3d'&&mode==='net')envSend('scan',-1);else go({k:'scan'})},practice(){startPractice()},light(){if(!envAsk('light',11))envSend('light',11)},
  narr(){Narr.toggle();render()},
  looktoggle(){ui.lookOpen=!ui.lookOpen},
  lookpreset(v){setLook(LOOKS[+v][1].slice())},
  lookset(v,el){const L=myLook().slice();L[+el.dataset.i]=+v;setLook(L)},
  music(){Snd.setMusic(!Snd.musicOn());render()},sfxt(){Snd.setSfx(!Snd.sfxOn());render()},
  narrvoice(){const n=Narr.nextVoice();if(n)toast('旁白聲音：'+n);render()},
  narrhelp(){toast(/iPhone|iPad/.test(navigator.userAgent)?'這台裝置沒有中文語音：到「設定 > 輔助使用 > 朗讀內容 > 聲音 > 中文」下載，再重新整理網頁。':'這台裝置沒有中文語音：到手機「設定」搜尋「文字轉語音」，下載中文（台灣）語音，再重新整理網頁。')},
  von(){Voice.enable()},vmic(){Voice.toggleMic()},voff(){Voice.disable()},
  gnew(){ui.gpanel='new';ui.gsel=[];render()},
  ginv(){ui.gpanel='inv';ui.gsel=[];render()},
  gsel(v){const i=ui.gsel.indexOf(v);if(i<0)ui.gsel.push(v);else ui.gsel.splice(i,1);render()},
  gok(){const m=ui.gsel.slice(),a=ui.gpanel==='new'?{k:'grp',m,name:ui.gname}:{k:'grpinv',g:ui.ch,m};ui.gpanel=null;ui.gsel=[];ui.gname='';go(a);if(mode==='net')render()},
  gleave(){const g=ui.ch;ui.ch='';go({k:'grpleave',g});if(mode==='net')render()},
  hide(){ui.hide=!ui.hide;render()},
  cover(){ui.cover=true;ui.pick=null;ui.sel=null;me=null;render()},
  iam(v){me=v;ui.cover=false;ui.hide=false;ui.pick=null;ui.sel=null;render()},
  pick(v){const a=(ui._acts||[]).find(x=>x[0]===v);if(!a)return;ui.pick={k:a[0],label:a[1],targets:a[2]};ui.t=null;render()},
  target(v){ui.t=v;render()},
  confirm(){if(!ui.pick||!ui.t)return;const a={k:ui.pick.k,t:ui.t};
    if(S.game==='virus'&&mode==='net'&&S.opts.verify==='3d'&&a.t!==me){const task=vTask(S,me,a.k);if(!Stage3D||!task){toast('這台裝置無法顯示 3D 場景');return}
      if(task[1]>=7){ui.armed={k:a.k,t:a.t};ui.pick=null;ui.t=null;toast('已準備「'+SKN[a.k]+'」，去完成指定動作');if(gsOn())ui.tab='';render();
        if(task[1]===7&&Stage3D.debug().seated&&ui.bench!=null)envSend('sit',7,{b:ui.bench});paintCtx();return}
      ui.armed=null;const e=Stage3D.gesture(task[1],a.t,a.k,nm(S,a.t));if(e){toast(e);return}ui.pick=null;ui.t=null;if(gsOn())ui.tab='';render();const s=document.getElementById('stage-slot');if(s)s.scrollIntoView({block:'nearest',behavior:'smooth'});return}
    if(mode==='net'){ui.pick=null;ui.t=null}go(a);if(mode==='net')render()},
  st(v){ui.sel=+v;render()},
  moveto(v){ui.sel=null;go({k:'move',to:+v})},
  ch(v){ui.ch=v;ui.chPicked=true;render()},
  mute(v){if(muted.has(v))muted.delete(v);else muted.add(v);ls.set('ax_mute',[...muted]);toast(muted.has(v)?'已靜音 '+nm(S,v)+'（只影響你這台手機）':'已取消靜音 '+nm(S,v));render()},
  kickask(v){ui.kickAsk=v;render()},
  say(){const t=ui.msg.trim();if(!t)return;ui.msg='';const i=document.getElementById('msg');if(i)i.value='';go({k:'say',to:ui.ch,text:t});if(mode==='net')render()},
  mic(){if(!dict)return;try{if(dictOn)dict.stop();else dict.start()}catch(e){toast('語音輸入無法啟動，請改用鍵盤上的麥克風或打字')}},
  move(){if(ui.sel==null)return;const to=ui.sel;ui.sel=null;go({k:'move',to})},
  cact(v){go({k:v})}
};


/* ============ boot ============ */
{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){try{const r=new SR();r.lang='zh-TW';r.interimResults=false;r.continuous=false;
    r.onresult=e=>{const t=Array.from(e.results).map(x=>x[0].transcript).join('');ui.msg=(ui.msg?ui.msg+' ':'')+t;const i=document.getElementById('msg');if(i)i.value=ui.msg};
    const set=v=>{dictOn=v;const b=document.getElementById('mic');if(b){b.classList.toggle('on',v);b.textContent=v?'停止':'語音'}};
    r.onstart=()=>set(true);r.onend=()=>set(false);r.onerror=e=>{set(false);if(e.error==='not-allowed')toast('沒有麥克風權限，請改用鍵盤上的麥克風或打字')};
    dict=r}catch(e){dict=null}}}
let wake=null;
async function keepAwake(){try{if('wakeLock' in navigator&&!wake){wake=await navigator.wakeLock.request('screen');wake.addEventListener('release',()=>{wake=null})}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S)keepAwake()});
document.addEventListener('pointerdown',()=>{if(S)keepAwake()},{passive:true});
document.addEventListener('gesturestart',e=>e.preventDefault());
if(ui.join.length===4)wantRoom=null;
render();connect();
window.__ax={tab(v){ui.tab=v;render()},snd:Snd,get ui(){return ui},narr:Narr,voice:Voice,get S(){return S},get me(){return me},get mode(){return mode},get online(){return online},stage:Stage3D,myId,send};
})();
