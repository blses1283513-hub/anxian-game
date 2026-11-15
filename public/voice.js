/* Voice chat: phones talk directly to each other (WebRTC); the game server only passes the handshake along. */
window.Voice=(()=>{
  "use strict";
  const st={on:false,mic:true,err:'',list:[],ice:[{urls:'stun:stun.l.google.com:19302'}]};
  const peers={},lastTry={};
  let stream=null,ctx=null,localAn=null,localLevel=0;
  const api={send:()=>{},me:()=>null,policy:()=>1,canSpeak:()=>true,onChange:()=>{}};
  const supported=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.RTCPeerConnection&&window.isSecureContext);
  function mkAn(src){const a=ctx.createAnalyser();a.fftSize=512;src.connect(a);return a}
  function levelOf(a){if(!a)return 0;const b=new Uint8Array(a.fftSize);a.getByteTimeDomainData(b);let s=0;for(let i=0;i<b.length;i++){const v=(b[i]-128)/128;s+=v*v}return Math.sqrt(s/b.length)}
  function applyMic(){if(stream)stream.getAudioTracks().forEach(t=>t.enabled=st.mic&&api.canSpeak())}
  async function enable(){
    if(st.on)return;st.err='';
    if(!supported()){st.err='unsupported';api.onChange();return}
    try{const AC=window.AudioContext||window.webkitAudioContext;ctx=ctx||new AC();if(ctx.state!=='running')ctx.resume();
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    }catch(e){st.err=e&&(e.name==='NotAllowedError'||e.name==='SecurityError')?'denied':'fail';api.onChange();return}
    st.on=true;st.mic=true;localAn=mkAn(ctx.createMediaStreamSource(stream));applyMic();api.send({t:'voice',on:true});api.onChange();
  }
  function disable(){
    if(!st.on)return;st.on=false;for(const id in peers)drop(id);
    if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;localAn=null;api.send({t:'voice',on:false});api.onChange();
  }
  function toggleMic(){st.mic=!st.mic;applyMic();api.onChange()}
  function drop(id){const p=peers[id];if(!p)return;delete peers[id];
    try{p.pc.onicecandidate=p.pc.ontrack=p.pc.onconnectionstatechange=null;p.pc.close()}catch(e){}
    try{if(p.gain)p.gain.disconnect();if(p.src)p.src.disconnect()}catch(e){}
    if(p.el){p.el.srcObject=null}api.onChange()}
  function make(id){
    const pc=new RTCPeerConnection({iceServers:st.ice}),p=peers[id]={pc,q:[],ready:false,gain:null,src:null,an:null,el:null,vol:0,level:0,speaking:false};
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    pc.onicecandidate=e=>{if(e.candidate)api.send({t:'rtc',to:id,d:{ice:e.candidate}})};
    pc.ontrack=e=>{const ms=e.streams[0]||new MediaStream([e.track]);
      const el=p.el=new Audio();el.muted=true;el.playsInline=true;el.setAttribute('playsinline','');el.srcObject=ms;el.play().catch(()=>{}); // keeps the stream flowing on Chrome
      p.src=ctx.createMediaStreamSource(ms);p.gain=ctx.createGain();p.gain.gain.value=0;p.an=mkAn(p.src);p.src.connect(p.gain);p.gain.connect(ctx.destination)};
    pc.onconnectionstatechange=()=>{const s=pc.connectionState;if(s==='failed'||s==='closed')drop(id);api.onChange()};
    return p;
  }
  async function offer(id){lastTry[id]=Date.now();drop(id);const p=make(id);
    try{const o=await p.pc.createOffer();await p.pc.setLocalDescription(o);api.send({t:'rtc',to:id,d:{sdp:p.pc.localDescription}})}catch(e){drop(id)}}
  async function signal(from,d){
    if(!st.on||!d||api.policy(from)<0)return;const me=api.me();
    try{
      if(d.want){if(me<from){const p=peers[from];if(!p||['failed','closed','disconnected'].includes(p.pc.connectionState)||Date.now()-(lastTry[from]||0)>8000&&p.pc.connectionState!=='connected')offer(from)}return}
      if(d.sdp){
        if(d.sdp.type==='offer'){drop(from);const p=make(from);await p.pc.setRemoteDescription(d.sdp);p.ready=true;
          const a=await p.pc.createAnswer();await p.pc.setLocalDescription(a);api.send({t:'rtc',to:from,d:{sdp:p.pc.localDescription}});
          for(const c of p.q)p.pc.addIceCandidate(c).catch(()=>{});p.q=[]}
        else{const p=peers[from];if(!p)return;await p.pc.setRemoteDescription(d.sdp);p.ready=true;for(const c of p.q)p.pc.addIceCandidate(c).catch(()=>{});p.q=[]}
        return}
      if(d.ice){const p=peers[from];if(!p)return;if(p.ready)p.pc.addIceCandidate(d.ice).catch(()=>{});else p.q.push(d.ice)}
    }catch(e){drop(from)}
  }
  function setList(list,ice){st.list=list||[];if(Array.isArray(ice)&&ice.length)st.ice=ice;api.onChange()}
  function tick(){
    if(!st.on){return}
    const me=api.me(),now=Date.now();applyMic();
    if(ctx&&ctx.state==='suspended')ctx.resume().catch(()=>{});
    for(const id of st.list){if(id===me)continue;const g=api.policy(id);
      if(g<0){if(peers[id])drop(id);continue}
      const p=peers[id];
      if(!p){if(now-(lastTry[id]||0)>3000){lastTry[id]=now;if(me<id)offer(id);else api.send({t:'rtc',to:id,d:{want:1}})}continue}
      p.vol=g;if(p.gain)p.gain.gain.setTargetAtTime(g,ctx.currentTime,.08);
      p.level=levelOf(p.an);p.speaking=p.level>.02&&g>.05;
    }
    for(const id in peers)if(!st.list.includes(id))drop(id);
    localLevel=levelOf(localAn);
  }
  setInterval(tick,200);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ctx&&ctx.state!=='running')ctx.resume().catch(()=>{})});
  return Object.assign(api,{st,supported,enable,disable,toggleMic,signal,setList,
    speaking:id=>id===api.me()?(st.on&&st.mic&&api.canSpeak()&&localLevel>.02):!!(peers[id]&&peers[id].speaking),
    connected:()=>Object.values(peers).filter(p=>p.pc.connectionState==='connected').length,
    debug:()=>({on:st.on,mic:st.mic,err:st.err,list:st.list.slice(),ctx:ctx&&ctx.state,localLevel:+localLevel.toFixed(3),micEnabled:!!(stream&&stream.getAudioTracks()[0]&&stream.getAudioTracks()[0].enabled),
      peers:Object.fromEntries(Object.entries(peers).map(([k,p])=>[k,{state:p.pc.connectionState,vol:+p.vol.toFixed(2),level:+p.level.toFixed(3),track:!!p.el}]))})});
})();
