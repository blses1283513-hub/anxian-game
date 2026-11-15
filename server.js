// 暗線遊戲室 — game server. No dependencies: run with `node server.js` (Node 18+).
// Serves the site in ./public and a WebSocket endpoint at /ws. The server is the referee:
// it holds every room's full state and sends each player only what that player may know.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=require('./public/engine.js');
const PORT=+process.env.PORT||3000,PUB=path.join(__dirname,'public');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const RANGE=1.9,HOLD=3000,ROOM_R=9.2;
const ROUND_MS=S=>process.env.ROUND_SECONDS?+process.env.ROUND_SECONDS*1000:S.opts.roundMin*60000; // ROUND_SECONDS is for testing only

const server=http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';
  if(u==='/healthz'){res.writeHead(200,{'content-type':'text/plain'});res.end('ok');return}
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
const rooms=new Map();
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,12);
function spawn(R){const ids=R.S.players.map(p=>p.id),n=ids.length;R.pos={};
  ids.forEach((id,i)=>{const a=i/n*Math.PI*2;R.pos[id]={x:Math.sin(a)*3.7,z:Math.cos(a)*3.7,r:a+Math.PI,gi:-1,gt:'',gk:'',since:0,done:false}});R.dirty=new Set(ids)}
function pushState(R,toast){R.last=Date.now();const now=Date.now();
  for(const [pid,c] of R.cl)wsSend(c.sock,{t:'state',S:E.redact(R.S,pid),now,toast:toast||''})}
function posList(R,ids){const p={};for(const id of ids){const q=R.pos[id];if(q)p[id]=[+q.x.toFixed(2),+q.z.toFixed(2),+q.r.toFixed(2),q.gi,q.gt]}return p}
function bind(c,R,pid){const old=R.cl.get(pid);if(old&&old!==c){wsSend(old.sock,{t:'gone',m:'你在另一個裝置或分頁重新加入了'});old.room=null;voiceOff(R,pid)}
  c.room=R;c.pid=pid;R.cl.set(pid,c)}
function onMsg(c,m){
  if(m.t==='ping'){wsSend(c.sock,{t:'pong'});return}
  if(m.t==='create'){
    const pid=clean(m.pid);if(pid.length<6)return;
    let code;do{code=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join('')}while(rooms.has(code));
    const S=E.newState(E.GAMES[m.game]?m.game:'virus',pid,code);S.players.push({id:pid,name:clean(m.name)||'房主'});
    const R={S,cl:new Map(),pos:{},dirty:new Set(),last:Date.now(),keys:{},voice:new Set()};R.keys[pid]=String(m.key||'');rooms.set(code,R);bind(c,R,pid);pushState(R);return}
  if(m.t==='join'){
    const pid=clean(m.pid),R=rooms.get(String(m.code||'').toUpperCase());if(pid.length<6)return;
    if(!R){wsSend(c.sock,{t:'err',m:'找不到這個房間，可能已經結束了',fatal:1});return}
    const S=R.S,inList=S.players.some(p=>p.id===pid),key=String(m.key||'');
    if(R.keys[pid]!==undefined&&R.keys[pid]!==key){wsSend(c.sock,{t:'err',m:'這個座位屬於另一台裝置',fatal:1});return}
    R.keys[pid]=key;
    if(!inList&&S.phase==='lobby'&&!S.kicked[pid])E.act(S,null,{k:'add',id:pid,name:clean(m.name)||'玩家'},true);
    bind(c,R,pid);pushState(R);wsSend(c.sock,{t:'voice',list:[...R.voice].filter(id=>R.cl.has(id)),ice:ICE});
    if(S.phase!=='lobby'&&S.game==='virus')wsSend(c.sock,{t:'pos',p:posList(R,Object.keys(R.pos)),init:1});return}
  const R=c.room;if(!R||!c.pid)return;const S=R.S,pid=c.pid;
  if(m.t==='voice'){if(!S.players.some(p=>p.id===pid))return;if(m.on)R.voice.add(pid);else R.voice.delete(pid);voiceList(R);return}
  if(m.t==='rtc'){const to=String(m.to||''),k=R.cl.get(to);if(k&&R.voice.has(pid)&&R.voice.has(to)&&mayTalk(R,pid,to))wsSend(k.sock,{t:'rtc',from:pid,d:m.d});return}
  if(m.t==='leave'){R.cl.delete(pid);voiceOff(R,pid);c.room=null;if(S.phase==='lobby'&&pid!==S.hostId){S.players=S.players.filter(p=>p.id!==pid);pushState(R)}return}
  if(m.t==='act'){
    const a=m.a||{},host=!!m.host&&pid===S.hostId;
    if(a.k==='add'){wsSend(c.sock,{t:'err',m:'連線模式不能手動加人'});return}
    const was=S.phase,e=E.act(S,pid,a,host);
    if(e){wsSend(c.sock,{t:'err',m:e});return}
    if(a.k==='kick'){const k=R.cl.get(a.t);if(k){wsSend(k.sock,{t:'gone',m:'你被房主移出房間'});R.cl.delete(a.t);k.room=null}voiceOff(R,a.t)}
    if(was==='lobby'&&S.phase==='play'&&S.game==='virus'){spawn(R);pushState(R);for(const [,k] of R.cl)wsSend(k.sock,{t:'pos',p:posList(R,Object.keys(R.pos)),init:1});return}
    pushState(R);return}
  if(m.t==='pos'){
    const q=R.pos[pid];if(!q||S.phase!=='play'||S.game!=='virus'||!S.g.alive[pid])return;
    let x=+m.x,z=+m.z;if(!isFinite(x)||!isFinite(z))return;const d=Math.hypot(x,z);if(d>ROOM_R){x*=ROOM_R/d;z*=ROOM_R/d}
    q.x=x;q.z=z;q.r=isFinite(+m.r)?+m.r:q.r;
    const gi=Number.isInteger(m.gi)&&m.gi>=0&&m.gi<E.GN.length?m.gi:-1,gt=gi>=0?String(m.gt||''):'',gk=gi>=0&&E.SKN[m.gk]?m.gk:'';
    if(gi!==q.gi||gt!==q.gt||gk!==q.gk){q.gi=gi;q.gt=gt;q.gk=gk;q.since=Date.now();q.done=false}
    q.seen=Date.now();R.dirty.add(pid);R.last=Date.now();return}
}
setInterval(()=>{
  const now=Date.now();
  for(const [code,R] of rooms){
    const S=R.S;
    if(now-R.last>3*3600e3){rooms.delete(code);continue}
    if(S.phase==='play'&&S.game==='virus'){
      let changed=false;
      for(const pid in R.pos){const q=R.pos[pid];if(q.gi<0)continue;
        if(!R.cl.has(pid)||now-(q.seen||0)>2500){q.gi=-1;q.gt='';q.gk='';R.dirty.add(pid);continue}
        if(q.done)continue;const t=R.pos[q.gt];
        if(!t||!S.g.alive[pid]||!S.g.alive[q.gt]||Math.hypot(q.x-t.x,q.z-t.z)>RANGE){q.since=now;continue}
        if(now-q.since<HOLD)continue;
        q.done=true;let msg='',fired=false;
        if(q.gk){const task=S.g.task[pid]&&S.g.task[pid][q.gk];
          if(task===q.gi){const e=E.vUse(S,pid,q.gk,q.gt);if(e)msg='沒有發動：'+e;else{fired=true;changed=true}}}
        const c=R.cl.get(pid);if(c)wsSend(c.sock,{t:'gdone',fired,k:q.gk,m:msg});
      }
      if(S.phase==='play'&&S.g.round>=1&&now>=S.g.roundStart+ROUND_MS(S)){const r=S.g.round;E.act(S,null,{k:'next'},true);pushState(R,`第 ${r} 回合時間到，已自動結算`);changed=false}
      if(changed)pushState(R);
      if(S.phase==='play')for(const id in R.pos)if(!S.g.alive[id]&&R.pos[id].gi>=0){R.pos[id].gi=-1;R.dirty.add(id)}
    }
    if(R.dirty.size){const p=posList(R,R.dirty);R.dirty.clear();for(const [,c] of R.cl)wsSend(c.sock,{t:'pos',p})}
  }
},125);
server.listen(PORT,()=>console.log('暗線遊戲室 listening on port '+PORT));
