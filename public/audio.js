/* Music and sound effects.
   Everything is synthesised in the browser. If a file with the matching name exists in public/audio/
   (music_<scene>.mp3 or sfx_<name>.mp3, see public/audio/說明.md) that file is played instead. */
window.Sound=(()=>{
  "use strict";
  const AC=window.AudioContext||window.webkitAudioContext;
  const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}},set=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
  let ctx=null,master=null,musicBus=null,sfxBus=null,duckGain=null,noiseBuf=null;
  let musicOn=get('ax_music')!=='0',sfxOn=get('ax_sfx')!=='0',want='',cur=null,ducks=0,files=null,filesP=null;
  const bufs={},log=[];
  const api={};
  const supported=()=>!!AC;

  function init(){
    if(ctx||!AC)return;
    try{ctx=new AC()}catch(e){return}
    master=ctx.createGain();master.gain.value=.9;master.connect(ctx.destination);
    duckGain=ctx.createGain();duckGain.connect(master);
    musicBus=ctx.createGain();musicBus.gain.value=musicOn?.5:0;musicBus.connect(duckGain);
    sfxBus=ctx.createGain();sfxBus.gain.value=sfxOn?.9:0;sfxBus.connect(master);
    const n=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    if(want)scene(want,true);
  }
  function unlock(){init();if(ctx&&ctx.state!=='running')ctx.resume().catch(()=>{})}
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
  document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.visibilityState==='visible')ctx.resume().catch(()=>{});else ctx.suspend().catch(()=>{})});

  /* ---- optional audio files ---- */
  function listFiles(){if(!filesP)filesP=fetch('audio-list',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(a=>{files=Array.isArray(a)?a:[];return files}).catch(()=>{files=[];return files});return filesP}
  async function fileBuf(name){
    if(name in bufs)return bufs[name];const list=await listFiles(),f=list.find(x=>x.replace(/\.(mp3|ogg|m4a|wav)$/i,'')===name);
    if(!f||!ctx)return bufs[name]=null;
    try{const ab=await (await fetch('audio/'+encodeURIComponent(f))).arrayBuffer();bufs[name]=await new Promise((ok,no)=>ctx.decodeAudioData(ab,ok,no))}catch(e){bufs[name]=null}
    return bufs[name];
  }

  /* ---- small synth toolbox ---- */
  const hz=m=>440*Math.pow(2,(m-69)/12);
  function env(g,t,a,d,peak,sus){g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(Math.max(.0001,sus||.0001),t+a+d)}
  function tone(dest,f,t,dur,o){o=o||{};const os=ctx.createOscillator(),g=ctx.createGain();os.type=o.type||'sine';os.frequency.setValueAtTime(f,t);if(o.to)os.frequency.exponentialRampToValueAtTime(o.to,t+dur);
    if(o.detune)os.detune.value=o.detune;env(g,t,o.a==null?.01:o.a,dur,o.g==null?.2:o.g);let out=g;
    if(o.lp){const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.value=o.lp;g.connect(fl);out=fl}
    os.connect(g);out.connect(dest);os.start(t);os.stop(t+dur+.05);return os}
  function noise(dest,t,dur,o){o=o||{};const s=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();s.buffer=noiseBuf;s.loop=true;f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.f||1000,t);
    if(o.to)f.frequency.exponentialRampToValueAtTime(o.to,t+dur);f.Q.value=o.q||1;env(g,t,o.a==null?.005:o.a,dur,o.g==null?.3:o.g);s.connect(f);f.connect(g);g.connect(dest);s.start(t,Math.random());s.stop(t+dur+.05)}

  /* ---- music: a tiny step sequencer; one definition per scene ---- */
  // k: key quality, prog: chord roots in semitones from the tonic (one per bar), patterns are 16 steps per bar
  const SC={
    lobby:      {bpm:92, root:57,k:'M',prog:[0,9,5,7],  pad:.05,bass:'x.....x.x.....x.',arp:'x.x.x.x.x.x.x.x.',arpT:'triangle',kick:'x.......x.......',hat:'....x.......x...'},
    brief:      {bpm:66, root:50,k:'m',prog:[0,0,8,7],  pad:.08,bass:'x...............',arp:'x.....x...x.....',arpT:'sine',    kick:'',hat:''},
    day:        {bpm:84, root:50,k:'m',prog:[0,0,5,7],  pad:.06,bass:'x.....x.x.......',arp:'..x...x...x...x.',arpT:'triangle',kick:'x.......x.......',hat:'....x.......x...'},
    urgent:     {bpm:132,root:50,k:'m',prog:[0,1,0,1],  pad:.05,bass:'x.x.x.x.x.x.x.x.',arp:'x.xx.xx.x.xx.xx.',arpT:'square',  kick:'x...x...x...x...',hat:'..x...x...x...x.'},
    win_citizen:{bpm:118,root:60,k:'M',prog:[0,5,7,0],  pad:.06,bass:'x...x...x...x...',arp:'x.xxx.xxx.xxx.xx',arpT:'triangle',kick:'x...x...x...x...',hat:'..x...x...x...x.',lead:[0,2,4,7,4,7,9,7, 5,4,2,4,7,4,2,0]},
    win_cure:   {bpm:96, root:62,k:'M',prog:[0,9,5,7],  pad:.08,bass:'x.......x.......',arp:'x..x..x.x..x..x.',arpT:'sine',    kick:'',hat:'',lead:[4,7,9,7,4,2,0,2, 4,5,7,5,4,2,0,0]},
    win_terror: {bpm:74, root:45,k:'m',prog:[0,1,0,6],  pad:.08,bass:'x..x..x.x..x..x.',arp:'x.......x.......',arpT:'sawtooth',kick:'x.....x.x.....x.',hat:'',lead:[0,0,3,1,0,-2,0,1, 0,0,3,1,6,5,3,1]},
    none:       {bpm:54, root:48,k:'m',prog:[0,0,3,0],  pad:.08,bass:'x...............',arp:'........x.......',arpT:'sine',    kick:'',hat:''},
    chase_thief:{bpm:100,root:52,k:'m',prog:[0,0,10,0], pad:.03,bass:'x..x..x...x.x...',arp:'..x.....x...x...',arpT:'triangle',kick:'',hat:'x.x.x.x.x.x.x.x.'},
    chase_cop:  {bpm:126,root:52,k:'m',prog:[0,3,5,3],  pad:.04,bass:'x.xx.xx.x.xx.xx.',arp:'x...x...x...x...',arpT:'square',  kick:'x...x...x...x...',hat:'..x...x...x...x.'}
  };
  const quality=(k,off)=>{off=((off%12)+12)%12;if(k==='M')return[2,4,9].includes(off)?[0,3,7]:[0,4,7];return[1,3,6,8,10].includes(off)?[0,4,7]:[0,3,7]};
  function startSynth(name,out){
    const s=SC[name];if(!s)return()=>{};const step=60/s.bpm/4;let next=ctx.currentTime+.08,i=0,alive=true;
    const tick=()=>{if(!alive||!ctx)return;
      while(next<ctx.currentTime+.35){const bar=Math.floor(i/16)%s.prog.length,st=i%16,off=s.prog[bar],ch=quality(s.k,off),base=s.root+off;
        if(st===0&&s.pad)for(const iv of ch)for(const dt of [-7,7])tone(out,hz(base+iv),next,step*16,{type:'sawtooth',g:s.pad,a:step*4,lp:900,detune:dt});
        if(s.bass[st]==='x')tone(out,hz(base-24+(st%8===6?ch[2]:0)),next,step*2.2,{type:'triangle',g:.3,lp:500});
        if(s.arp[st]==='x'){const n=ch[(i>>1)%3]+12*((i>>3)%2);tone(out,hz(base+n),next,step*1.8,{type:s.arpT,g:s.arpT==='square'||s.arpT==='sawtooth'?.05:.11,lp:2400})}
        if(s.kick&&s.kick[st]==='x')tone(out,120,next,.22,{to:42,g:.5});
        if(s.hat&&s.hat[st]==='x')noise(out,next,.05,{type:'highpass',f:6500,g:.07});
        if(s.lead&&st%2===0){const n=s.lead[(Math.floor(i/2))%s.lead.length];tone(out,hz(s.root+12+n),next,step*1.9,{type:name==='win_terror'?'sawtooth':'triangle',g:name==='win_terror'?.07:.14,lp:name==='win_terror'?1200:3200})}
        next+=step;i++}
    };
    const iv=setInterval(tick,90);tick();return()=>{alive=false;clearInterval(iv)};
  }
  function scene(name,force){
    name=name||'';want=name;if(!ctx||(!force&&cur&&cur.name===name))return;if(cur&&cur.name===name&&!force)return;
    const t=ctx.currentTime,old=cur;
    if(old){old.g.gain.cancelScheduledValues(t);old.g.gain.setValueAtTime(old.g.gain.value,t);old.g.gain.linearRampToValueAtTime(.0001,t+1.2);setTimeout(()=>{old.stop();try{old.g.disconnect()}catch(e){}},1500)}
    cur=null;if(!name)return;
    const g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(1,t+1.5);g.connect(musicBus);
    const me=cur={name,g,stop(){},file:false};log.push('music:'+name);if(log.length>80)log.shift();
    fileBuf('music_'+name).then(b=>{if(cur!==me)return;
      if(b){const src=ctx.createBufferSource();src.buffer=b;src.loop=true;src.connect(g);src.start();me.file=true;me.stop=()=>{try{src.stop()}catch(e){}}}
      else me.stop=startSynth(name,g)});
  }

  /* ---- sound effects ---- */
  const FX={
    join(d,t){tone(d,660,t,.12,{type:'triangle',g:.25});tone(d,990,t+.1,.18,{type:'triangle',g:.25})},
    shuffle(d,t){for(let i=0;i<14;i++)noise(d,t+i*.07,.05,{f:2500+Math.random()*2500,q:3,g:.22})},
    flip(d,t){noise(d,t,.07,{f:1800,q:1,g:.35});for(const [i,n] of [[0,72],[1,76],[2,79]])tone(d,hz(n),t+.08+i*.07,.5,{type:'sine',g:.16})},
    bell(d,t){for(const [r,g] of [[1,.3],[2.01,.18],[2.76,.12],[5.4,.06]])tone(d,392*r,t,2.4,{type:'sine',g,a:.004})},
    heartbeat(d,t){for(let i=0;i<4;i++){tone(d,70,t+i*.85,.16,{to:38,g:.7});tone(d,62,t+i*.85+.24,.14,{to:36,g:.5})}},
    tick(d,t){for(let i=0;i<10;i++){noise(d,t+i,.03,{type:'highpass',f:3000,g:.3});tone(d,i%2?880:1320,t+i,.04,{type:'square',g:.08})}},
    gun(d,t){noise(d,t,.35,{type:'lowpass',f:5200,to:300,g:1.1,a:.001});tone(d,150,t,.3,{to:38,g:.9,a:.001});noise(d,t+.12,.9,{f:900,q:.6,g:.18,a:.05})},
    cough(d,t){for(const o of [0,.28,.5])noise(d,t+o,.16,{f:700,to:350,q:1.5,g:.6});tone(d,90,t+1.0,.35,{to:40,g:.7})},
    drum(d,t){tone(d,110,t,.9,{to:45,g:.9,a:.002});noise(d,t,.25,{type:'lowpass',f:600,g:.4})},
    success(d,t){[60,64,67,72,76].forEach((n,i)=>tone(d,hz(n),t+i*.09,.6,{type:'triangle',g:.2}))},
    cheer(d,t){noise(d,t,2.6,{f:1400,q:.5,g:.5,a:.5});for(let i=0;i<26;i++)noise(d,t+.2+Math.random()*2.2,.04,{type:'highpass',f:2200,g:.3});[60,64,67,72].forEach((n,i)=>tone(d,hz(n),t+i*.12,.9,{type:'triangle',g:.16}))},
    // a deep, slowing "ha ha ha": voiced bursts through vowel formants. A real recording (sfx_laugh.mp3) replaces it.
    laugh(d,t){const out=ctx.createGain();out.gain.value=1;const dl=ctx.createDelay();dl.delayTime.value=.11;const fb=ctx.createGain();fb.gain.value=.25;out.connect(d);out.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(d);
      let at=t;for(let i=0;i<9;i++){const f0=132-i*5+(i<2?i*10:0),dur=.17+i*.012;
        for(const [ff,q,g] of [[720,7,.9],[1150,8,.5],[2600,9,.18]]){const os=ctx.createOscillator(),bp=ctx.createBiquadFilter(),g2=ctx.createGain();os.type='sawtooth';os.frequency.setValueAtTime(f0*1.08,at);os.frequency.exponentialRampToValueAtTime(f0*.86,at+dur);
          bp.type='bandpass';bp.frequency.value=ff;bp.Q.value=q;env(g2,at,.02,dur,g*.9);os.connect(bp);bp.connect(g2);g2.connect(out);os.start(at);os.stop(at+dur+.05)}
        noise(out,at,.06,{type:'highpass',f:3000,g:.08});at+=dur+.07+i*.012}},
    wind(d,t){noise(d,t,3.6,{f:420,to:260,q:.8,g:.45,a:1.2});noise(d,t+.6,3,{f:900,to:500,q:2,g:.14,a:1})},
    steps(d,t){for(let i=0;i<4;i++)noise(d,t+i*.26,.07,{type:'lowpass',f:380,g:.55})},
    coin(d,t){tone(d,1320,t,.09,{type:'square',g:.1});tone(d,1760,t+.08,.35,{type:'square',g:.1})},
    siren(d,t){for(let i=0;i<3;i++){tone(d,660,t+i*.7,.34,{type:'sawtooth',g:.12,lp:1800});tone(d,880,t+i*.7+.35,.34,{type:'sawtooth',g:.12,lp:1800})}},
    cuffs(d,t){for(const o of [0,.09,.3])for(const f of [2100,3170,4400])tone(d,f,t+o,.12,{type:'square',g:.05});noise(d,t+.3,.05,{type:'highpass',f:4000,g:.25})}
  };
  function sfx(name){
    log.push('sfx:'+name);if(log.length>80)log.shift();
    if(!ctx||!sfxOn||!FX[name])return;
    fileBuf('sfx_'+name).then(b=>{const t=ctx.currentTime+.02;
      if(b){const s=ctx.createBufferSource();s.buffer=b;s.connect(sfxBus);s.start(t)}else{try{FX[name](sfxBus,t)}catch(e){}}});
  }
  /* music steps back while the narrator or a player is talking */
  function duck(on){ducks=Math.max(0,ducks+(on?1:-1));if(!ctx)return;const t=ctx.currentTime;duckGain.gain.cancelScheduledValues(t);duckGain.gain.setValueAtTime(duckGain.gain.value,t);duckGain.gain.linearRampToValueAtTime(ducks?.28:1,t+(ducks?.15:.6))}
  function setMusic(v){musicOn=v;set('ax_music',v?'1':'0');if(ctx){const t=ctx.currentTime;musicBus.gain.cancelScheduledValues(t);musicBus.gain.linearRampToValueAtTime(v?.5:0,t+.3)}}
  function setSfx(v){sfxOn=v;set('ax_sfx',v?'1':'0');if(ctx)sfxBus.gain.value=v?.9:0}
  return Object.assign(api,{supported,scene,sfx,duck,setMusic,setSfx,musicOn:()=>musicOn,sfxOn:()=>sfxOn,names:{music:Object.keys(SC),sfx:Object.keys(FX)},
    debug:()=>({ctx:ctx?ctx.state:null,want,scene:cur?cur.name:'',file:cur?cur.file:false,musicOn,sfxOn,ducks,files,log:log.slice(-30)})});
})();
