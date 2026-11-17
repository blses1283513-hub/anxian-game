// 暗線遊戲室 — game server. No dependencies: run with `node server.js` (Node 18+).
// Serves the site in ./public and a WebSocket endpoint at /ws. The server is the referee:
// it holds every room's full state and sends each player only what that player may know.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=require('./public/engine.js');
const PORT=+process.env.PORT||3000,PUB=path.join(__dirname,'public');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg','.m4a':'audio/mp4','.wav':'audio/wav'};
const RANGE=1.9,HOLD=3000;
const BRIEF=process.env.BRIEF_SECONDS!==undefined?+process.env.BRIEF_SECONDS:null; // BRIEF_SECONDS is for testing only
const ROUND_MS=S=>process.env.ROUND_SECONDS?+process.env.ROUND_SECONDS*1000:S.opts.roundMin*60000; // ROUND_SECONDS is for testing only

const server=http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';
  if(u==='/healthz'){res.writeHead(200,{'content-type':'text/plain'});res.end('ok');return}
  if(u==='/audio-list'){fs.readdir(path.join(PUB,'audio'),(e,f)=>{res.writeHead(200,{'content-type':'application/json','cache-control':'no-cache'});res.end(JSON.stringify(e?[]:f.filter(x=>/\.(mp3|ogg|m4a|wav)$/i.test(x))))});return}
  const f=path.normalize(path.join(PUB,u));
  if(!f.startsWith(PUB)){res.writeHead(403);res.end();return}
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404,{'content-type':'text/plain'});res.end('not found');return}
    res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-cache'});res.end(d)});
});

/* ---- minimal WebSocket (RFC 6455, text frames) ---- */
function wsSend(sock,obj){
  if(sock.destroyed)return;const p=Buffer.from(JSON.stringify(obj)),n=p.length;let h;
  if(n<126)h=Buffer.from([0x81,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}
  else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeUInt32BE(0,2);h.writeUInt32BE(n,6)}
  try{sock.write(Buffer.concat([h,p]))}catch(e){}
}
server.on('upgrade',(req,sock)=>{
  const key=req.headers['sec-websocket-key'];
  if(!key||req.url.split('?')[0]!=='/ws'){sock.destroy();return}
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+
    crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
  sock.setNoDelay(true);
  let buf=Buffer.alloc(0),parts=[];const c={sock,pid:null,room:null,alive:Date.now()};
  sock.on('data',d=>{
    buf=Buffer.concat([buf,d]);
    for(;;){
      if(buf.length<2)return;const fin=buf[0]&0x80,op=buf[0]&0x0f,masked=buf[1]&0x80;let len=buf[1]&0x7f,off=2;
      if(len===126){if(buf.length<4)return;len=buf.readUInt16BE(2);off=4}
      else if(len===127){if(buf.length<10)return;len=buf.readUInt32BE(6);off=10}
      if(len>1<<20){sock.destroy();return}
      const need=off+(masked?4:0)+len;if(buf.length<need)return;
      let pay=buf.subarray(off+(masked?4:0),need);
      if(masked){const m=buf.subarray(off,off+4);pay=Buffer.from(pay);for(let i=0;i<pay.length;i++)pay[i]^=m[i&3]}
      buf=buf.subarray(need);c.alive=Date.now();
      if(op===8){sock.end();return}
      if(op===9){try{sock.write(Buffer.concat([Buffer.from([0x8a,pay.length]),pay]))}catch(e){}continue}
      if(op===10)continue;
      parts.push(pay);if(!fin)continue;
      const text=Buffer.concat(parts).toString('utf8');parts=[];
      let m;try{m=JSON.parse(text)}catch(e){continue}
      try{onMsg(c,m)}catch(e){console.error('handler error',e)}
    }
  });
  const bye=()=>{const R=c.room;if(R&&c.pid&&R.cl.get(c.pid)===c){R.cl.delete(c.pid);voiceOff(R,c.pid);const q=R.pos[c.pid];if(q&&q.gi>=0){q.gi=-1;q.gt='';q.gk='';R.dirty.add(c.pid)}}};
  sock.on('close',bye);sock.on('error',bye);
});

/* ---- voice: the server only relays the WebRTC handshake between two players ---- */
let ICE=[{urls:'stun:stun.l.google.com:19302'}];
try{if(process.env.ICE_SERVERS)ICE=JSON.parse(process.env.ICE_SERVERS)}catch(e){console.error('ICE_SERVERS is not valid JSON, using the default')}
function voiceList(R){const list=[...R.voice].filter(id=>R.cl.has(id));for(const [,c] of R.cl)wsSend(c.sock,{t:'voice',list,ice:ICE})}
function voiceOff(R,pid){if(R.voice&&R.voice.delete(pid))voiceList(R)}
function mayTalk(R,a,b){const S=R.S,inList=id=>S.players.some(p=>p.id===id);if(!inList(a)||!inList(b))return false;
  if(S.phase==='play'&&S.game==='chase'){const g=S.g,ch=id=>g.roles[id]==='thief'?'th':'t'+g.team[id];return ch(a)===ch(b)}
  return true}
/* ---- rooms ---- */
// someone left the after-game room: drop them, and if everybody still here had agreed, the next game starts
function afterQuit(R,pid){const S=R.S;E.act(S,pid,{k:'quit'});if(R.pos)delete R.pos[pid];if(R.away)delete R.away[pid];
  if(S.phase==='play'&&S.game==='virus'){spawn(R);pushState(R);for(const [id,k] of R.cl){k.vroom=viewRoom(R,id);k.vphase=S.phase;sendAllPos(R,k,1)}}else pushState(R)}
const AWAY_MS=process.env.AWAY_SECONDS?+process.env.AWAY_SECONDS*1000:90000;   // after the game, a player gone this long (tab closed) stops holding up the rematch
const rooms=new Map();
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,12);
function spawn(R){const ids=R.S.players.map(p=>p.id),n=ids.length,now=Date.now();R.pos={};
  ids.forEach((id,i)=>{const p=E.spawnOf(i,n);R.pos[id]={x:p.x,z:p.z,r:p.r,gi:-1,gt:'',gk:'',tg:'',since:0,done:false,seat:null,act:null,seen:now}});
  R.dirty=new Set(ids);R.env={books:{},lockers:{},dark:{}};R.day=0;for(const [,c] of R.cl){c.vroom=null;c.envS=''}}
function pushState(R,toast){R.last=Date.now();const now=Date.now();
  for(const [pid,c] of R.cl)wsSend(c.sock,{t:'state',S:E.redact(R.S,pid),now,toast:toast||''})}
const roomOfP=q=>E.roomOf(q.x,q.z);
const near=(q,o,d)=>Math.hypot(q.x-o.x,q.z-o.z)<=d;
const viewRoom=(R,pid)=>R.pos[pid]?roomOfP(R.pos[pid]):'round';
/* A player only receives the positions of people they could see: the same room, or hall to hall. 0 = out of sight. */
function posFor(R,pid,ids){const all=R.S.phase==='over',vr=viewRoom(R,pid),p={};
  for(const id of ids){const q=R.pos[id];if(!q)continue;
    p[id]=(all||id===pid||E.sees(vr,roomOfP(q)))?[+q.x.toFixed(2),+q.z.toFixed(2),+q.r.toFixed(2),q.gi,q.gt]:0}
  return p}
function sendAllPos(R,c,init){wsSend(c.sock,{t:'pos',p:posFor(R,c.pid,Object.keys(R.pos)),init:init?1:0})}
function inTea(R,id){const t=R.pos[id];return!!(t&&R.S.g.alive[id]&&roomOfP(t)==='tea'&&near(t,E.MAP.tea,2.6))}
function alone(R,room,a,b){const ids=Object.keys(R.pos).filter(id=>R.S.g.alive[id]&&roomOfP(R.pos[id])===room);return ids.length===2&&ids.includes(a)&&ids.includes(b)}
/* an action is complete: the skill fires only if this action is the actor's secret condition for it */
function fire(R,pid,gk,gt,gi,a){const S=R.S;let fired=false,msg='';
  if(gk){const task=S.g.task[pid]&&S.g.task[pid][gk];if(task===gi){const e=E.vUse(S,pid,gk,gt);if(e)msg='沒有發動：'+e;else fired=true}}
  const c=R.cl.get(pid);if(c)wsSend(c.sock,{t:'gdone',fired,k:gk,m:msg,a:a||''});return fired}
function bind(c,R,pid){const old=R.cl.get(pid);if(old&&old!==c){wsSend(old.sock,{t:'gone',m:'你在另一個裝置或分頁重新加入了'});old.room=null;voiceOff(R,pid)}
  c.room=R;c.pid=pid;R.cl.set(pid,c)}
function onMsg(c,m){
  if(m.t==='ping'){wsSend(c.sock,{t:'pong'});return}
  if(m.t==='create'){
    const pid=clean(m.pid);if(pid.length<6)return;
    let code;do{code=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('')}while(rooms.has(code));
    const S=E.newState(E.GAMES[m.game]?m.game:'virus',pid,code);if(BRIEF!==null)S.opts.briefSec=BRIEF;S.players.push({id:pid,name:clean(m.name)||'房主',look:E.LOOKS[0][1].slice()});
    const R={S,cl:new Map(),pos:{},dirty:new Set(),last:Date.now(),keys:{},voice:new Set()};R.keys[pid]=String(m.key||'');rooms.set(code,R);bind(c,R,pid);pushState(R);return}
  if(m.t==='join'){
    const pid=clean(m.pid),R=rooms.get(String(m.code||'').toUpperCase());if(pid.length<6)return;
    if(!R){wsSend(c.sock,{t:'err',m:'找不到這個房間，可能已經結束了',fatal:1});return}
    const S=R.S,inList=S.players.some(p=>p.id===pid),key=String(m.key||'');
    if(R.keys[pid]!==undefined&&R.keys[pid]!==key){wsSend(c.sock,{t:'err',m:'這個座位屬於另一台裝置',fatal:1});return}
    R.keys[pid]=key;
    if(!inList&&S.phase==='lobby'){
      if(S.kicked[pid]){wsSend(c.sock,{t:'err',m:'你已被房主移出這個房間',fatal:1});return}
      const e=E.act(S,null,{k:'add',id:pid,name:clean(m.name)||'玩家'},true);
      if(e){wsSend(c.sock,{t:'err',m:'這個房間已經滿了（16 人）',fatal:1});return}}
    bind(c,R,pid);pushState(R);wsSend(c.sock,{t:'voice',list:[...R.voice].filter(id=>R.cl.has(id)),ice:ICE});
    c.vroom=null;c.envS='';if(S.phase!=='lobby'&&S.game==='virus'&&R.env){c.vroom=viewRoom(R,pid);c.vphase=S.phase;sendAllPos(R,c,1)}return}
  const R=c.room;if(!R||!c.pid)return;const S=R.S,pid=c.pid;
  if(m.t==='voice'){if(!S.players.some(p=>p.id===pid))return;if(m.on)R.voice.add(pid);else R.voice.delete(pid);voiceList(R);return}
  if(m.t==='rtc'){const to=String(m.to||''),k=R.cl.get(to);if(k&&R.voice.has(pid)&&R.voice.has(to)&&mayTalk(R,pid,to))wsSend(k.sock,{t:'rtc',from:pid,d:m.d});return}
  if(m.t==='leave'){R.cl.delete(pid);voiceOff(R,pid);c.room=null;
    if(S.phase==='lobby'&&pid!==S.hostId){S.players=S.players.filter(p=>p.id!==pid);pushState(R)}
    else if(S.phase==='over')afterQuit(R,pid);
    return}
  if(m.t==='act'){
    const a=m.a||{},host=!!m.host&&pid===S.hostId;
    if(a.k==='add'){wsSend(c.sock,{t:'err',m:'連線模式不能手動加人'});return}
    const was=S.phase,e=E.act(S,pid,a,host);
    if(e){wsSend(c.sock,{t:'err',m:e});return}
    if(a.k==='kick'){const k=R.cl.get(a.t);if(k){wsSend(k.sock,{t:'gone',m:'你被房主移出房間'});R.cl.delete(a.t);k.room=null}voiceOff(R,a.t)}
    if(was!=='play'&&S.phase==='play'&&S.game==='virus'){spawn(R);pushState(R);for(const [id,k] of R.cl){k.vroom=viewRoom(R,id);k.vphase=S.phase;sendAllPos(R,k,1)}return}
    pushState(R);return}
  if(process.env.TEST_HOOKS&&m.t==='dbg'&&m.ab&&S.g){wsSend(c.sock,{t:'dbgab',id:S.g.antibody||''});return}                      // tests only: who carries the antibody
  if(process.env.TEST_HOOKS&&m.t==='dbg'&&S.g&&S.g.task&&S.g.task[pid]){S.g.task[pid][m.k]=m.gi;pushState(R);return}   // tests only: choose my own secret condition
  if(m.t==='pos'){
    const q=R.pos[pid];if(!q||S.game!=='virus'||!S.g)return;
    if(S.phase==='over'){const x=+m.x,z=+m.z;if(isFinite(x)&&isFinite(z)&&E.walkable(x,z,.3)){q.x=x;q.z=z;q.r=isFinite(+m.r)?+m.r:q.r;q.gi=-1;q.seat=null;q.act=null;R.dirty.add(pid);R.last=Date.now()}return}
    if(S.phase!=='play'||!S.g.alive[pid])return;
    const now=Date.now();q.seen=now;R.last=now;
    const x=+m.x,z=+m.z;if(!isFinite(x)||!isFinite(z)||S.g.briefEnd)return;          // nobody moves during the identity briefing
    if(q.seat){if(now-q.seat.arm<800||Math.hypot(x-q.x,z-q.z)<.3)return;q.seat=null;q.gi=-1;q.gk='';q.tg=''}   // walking away from the bench = standing up (positions sent just before sitting down are ignored)
    if(E.walkable(x,z,.3)){q.x=x;q.z=z}
    q.r=isFinite(+m.r)?+m.r:q.r;R.dirty.add(pid);
    if(q.act){if(Math.hypot(q.x-q.act.x,q.z-q.act.z)>.4){q.act=null;q.gi=-1;wsSend(c.sock,{t:'gdone',fired:false,k:'',m:'你移動了，動作中斷',a:'x'})}return}
    const gi=Number.isInteger(m.gi)&&m.gi>=0&&m.gi<7?m.gi:-1,gt=gi>=0?String(m.gt||''):'',gk=gi>=0&&E.SKN[m.gk]?m.gk:'';
    if(gi!==q.gi||gt!==q.gt||gk!==q.gk){q.gi=gi;q.gt=gt;q.gk=gk;q.since=now;q.done=false}
    return}
  if(m.t==='env'){                                                                   // using the building: benches, books, lockers, tea, lights
    const q=R.pos[pid],g=S.g;if(!q||S.phase!=='play'||S.game!=='virus'||!g.alive[pid])return;
    const fail=t=>wsSend(c.sock,{t:'err',m:t});if(g.briefEnd)return fail('身分確認時間還沒結束');
    const now=Date.now(),gk=E.SKN[m.gk]?m.gk:'',gt=gk?String(m.gt||''):'',n=S.players.length;q.seen=now;
    if(!q.seat&&!q.act&&isFinite(+m.x)&&isFinite(+m.z)&&E.walkable(+m.x,+m.z,.3)){q.x=+m.x;q.z=+m.z;R.dirty.add(pid)}   // the request carries where the player stands right now
    if(m.a==='stand'){if(q.seat){q.seat=null;q.gi=-1;q.gk='';q.tg='';R.dirty.add(pid)}return}
    if(m.a==='sit'){const b=E.MAP.benches[m.b];if(!b)return;const same=q.seat&&q.seat.b===m.b;
      if(!same&&!near(q,b,2.9))return fail('離長椅太遠了');
      const taken=s=>Object.keys(R.pos).some(id=>id!==pid&&R.pos[id].seat&&R.pos[id].seat.b===m.b&&R.pos[id].seat.s===s);
      const free=b.seats.map((_,i)=>i).filter(i=>!taken(i)).sort((a,c)=>Math.hypot(q.x-b.seats[a][0],q.z-b.seats[a][1])-Math.hypot(q.x-b.seats[c][0],q.z-b.seats[c][1]));
      const st=same?q.seat.s:free[0];if(st===undefined)return fail('這張長椅坐滿了');
      q.seat={b:m.b,s:st,at:same?q.seat.at:now,arm:now};q.x=b.seats[st][0];q.z=b.seats[st][1];q.r=b.r;q.gi=7;q.gt='';q.gk=gk;q.tg=gt;q.done=false;q.act=null;R.dirty.add(pid);
      wsSend(c.sock,{t:'seat',x:q.x,z:q.z,r:q.r});return}
    if(q.seat)return fail('請先站起來');if(q.act)return;
    const start=(a,gi,x)=>{q.act=Object.assign({a,gi,gk,gt,t0:now,x:q.x,z:q.z},x||{});q.gi=gi;q.gt='';q.gk='';R.dirty.add(pid);wsSend(c.sock,{t:'act',a,ms:HOLD})};
    if(m.a==='book'||m.a==='letter'){const k=+m.n;
      if(!near(q,m.a==='book'?E.MAP.shelf:E.MAP.lockers,2.2))return fail(m.a==='book'?'離書架太遠了':'離置物櫃太遠了');
      if(!(Number.isInteger(k)&&k>=1&&k<=n))return;start(m.a,m.a==='book'?8:9,{n:k});return}
    if(m.a==='tea'){if(roomOfP(q)!=='tea'||!near(q,E.MAP.tea,2.2))return fail('離茶桌太遠了');start('tea',10,{ok:inTea(R,gt)});return}
    if(m.a==='light'){const room=roomOfP(q),sw=E.MAP.switches[room];if(!sw||!near(q,sw,2.2))return fail('離電燈開關太遠了');
      const mine=gk&&g.task[pid]&&g.task[pid][gk]===11;
      if(R.env.dark[room]&&!mine){delete R.env.dark[room];wsSend(c.sock,{t:'gdone',fired:false,k:'',m:'',a:'light'});return}
      R.env.dark[room]=now+12000;start('light',11,{room,ok:alone(R,room,pid,gt)});return}
    return}
}
setInterval(()=>{
  const now=Date.now();
  for(const [code,R] of rooms){
    const S=R.S;
    if(now-R.last>3*3600e3){rooms.delete(code);continue}
    if(S.phase==='play'&&S.g&&S.g.briefEnd&&now>=S.g.briefEnd){E.briefDone(S);pushState(R)}
    if(S.phase==='over'){R.away=R.away||{};
      for(const p of S.players.slice()){if(R.cl.has(p.id)){delete R.away[p.id];continue}R.away[p.id]=R.away[p.id]||now;if(now-R.away[p.id]>AWAY_MS){afterQuit(R,p.id);if(S.phase!=='over')break}}}
    else if(R.away)R.away=null;
    if(S.phase==='play'&&S.game==='virus'&&R.env){
      let changed=false;const g=S.g;
      for(const pid in R.pos){const q=R.pos[pid],live=!!g.alive[pid]&&R.cl.has(pid)&&now-(q.seen||0)<=2500;
        if(q.seat){                                                     // sitting on a bench
          if(!g.alive[pid]){q.seat=null;q.gi=-1;R.dirty.add(pid);continue}
          if(q.gk&&!q.done){const t=R.pos[q.tg];
            if(t&&t.seat&&t.seat.b===q.seat.b&&g.alive[q.tg]&&now-Math.max(q.seat.arm,t.seat.at)>=HOLD){q.done=true;if(fire(R,pid,q.gk,q.tg,7,'sit'))changed=true}}
          continue}
        if(q.act){const A=q.act;                                        // a timed action at an object
          if(!live||Math.hypot(q.x-A.x,q.z-A.z)>.4){q.act=null;q.gi=-1;R.dirty.add(pid);continue}
          if(now-A.t0<HOLD)continue;
          q.act=null;q.gi=-1;R.dirty.add(pid);let ok=false,why='';
          if(A.a==='book'){if(R.env.books[A.n])delete R.env.books[A.n];else R.env.books[A.n]=1;      // turning the target's book counts whichever way it was
            ok=g.seat[A.gt]===A.n;why='這本不是對象座號的書'}
          else if(A.a==='letter'){R.env.lockers[A.n]=1;ok=g.seat[A.gt]===A.n;why='這不是對象座號的置物櫃'}
          else if(A.a==='tea'){ok=A.ok&&inTea(R,A.gt);why='對象沒有一直站在茶桌旁'}
          else if(A.a==='light'){ok=A.ok&&!!R.env.dark[A.room]&&alone(R,A.room,pid,A.gt);why=R.env.dark[A.room]?'房間裡不是只有你和對象兩個人':'燈被打開了'}
          if(ok){if(fire(R,pid,A.gk,A.gt,A.gi,A.a))changed=true}
          else{const mine=A.gk&&g.task[pid]&&g.task[pid][A.gk]===A.gi,c=R.cl.get(pid);                 // tell only the actor why a prepared skill did not go off
            if(c)wsSend(c.sock,{t:'gdone',fired:false,k:'',m:mine?'沒有發動：'+why:'',a:A.a})}
          continue}
        if(q.gi<0)continue;                                             // a gesture next to the target
        if(!live){q.gi=-1;q.gt='';q.gk='';R.dirty.add(pid);continue}
        if(q.done)continue;const t=R.pos[q.gt];
        if(!t||!g.alive[q.gt]||roomOfP(t)!==roomOfP(q)||Math.hypot(q.x-t.x,q.z-t.z)>RANGE){q.since=now;continue}
        if(now-q.since<HOLD)continue;
        q.done=true;if(fire(R,pid,q.gk,q.gt,q.gi,'g'))changed=true;
      }
      if(S.phase==='play'&&S.g.round>=1&&now>=S.g.roundStart+ROUND_MS(S)){const r=S.g.round;E.act(S,null,{k:'next'},true);pushState(R,`第 ${r} 日時間到，已自動結算`);changed=false}
      if(changed)pushState(R);
      if(S.phase==='play'){for(const id in R.pos)if(!S.g.alive[id]&&R.pos[id].gi>=0){R.pos[id].gi=-1;R.pos[id].seat=null;R.pos[id].act=null;R.dirty.add(id)}
        if(R.day!==S.g.round){R.day=S.g.round;R.env.books={};R.env.lockers={}}}                       // flipped books and letters last until the day ends
      for(const r in R.env.dark)if(now>=R.env.dark[r])delete R.env.dark[r];
    }
    if(S.game==='virus'&&S.g&&R.env&&S.phase!=='lobby'){
      if(S.phase==='over'&&Object.keys(R.env.dark).length)R.env.dark={};                              // lights back on for the after-game walk
      for(const [pid,c] of R.cl){const vr=viewRoom(R,pid);
        if(c.vroom!==vr||c.vphase!==S.phase){c.vroom=vr;c.vphase=S.phase;sendAllPos(R,c,0)}           // entered another room: what is visible changes
        else if(R.dirty.size)wsSend(c.sock,{t:'pos',p:posFor(R,pid,R.dirty)});
        const e=JSON.stringify({dark:Object.keys(R.env.dark),books:vr==='library'?Object.keys(R.env.books).map(Number):null,lockers:vr==='locker'?Object.keys(R.env.lockers).map(Number):null});
        if(e!==c.envS){c.envS=e;wsSend(c.sock,Object.assign({t:'env'},JSON.parse(e)))}}
    }
    R.dirty.clear();
  }
},125);
server.listen(PORT,()=>console.log('暗線遊戲室 listening on port '+PORT));
