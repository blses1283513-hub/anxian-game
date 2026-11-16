/* Narrator: reads out public game events with the phone's built-in speech and shows them as captions. */
window.Narrator=(()=>{
  "use strict";
  const synth=window.speechSynthesis||null,U=window.SpeechSynthesisUtterance||null;
  const get=k=>{try{return localStorage.getItem(k||'ax_narr')}catch(e){return null}},set=(v,k)=>{try{localStorage.setItem(k||'ax_narr',v)}catch(e){}};
  let on=get()!=='0',voice=null,male=false,unlocked=false,cap='',capT=0,lastText='',lastAt=0,pending=0;
  const log=[],moods=[],api={};
  // voices that are known to be male; anything else is pitched down to sound deeper
  const MALE=/male|男|li-?mu|yun-?jhe|yunjhe|yunxi|yunyang|yunjian|yunze|kangkang|zhiwei|wan-?lung|danny/i,FEMALE=/female|女/i;
  // Chinese voices only. Language tags differ between phones (zh-TW, zh_TW, cmn-Hant-TW, yue-HK...), so the name is checked too.
  const ln=v=>String(v.lang||'').replace(/_/g,'-');
  const isZh=v=>/^(zh|cmn|yue)\b/i.test(ln(v))||/chinese|mandarin|cantonese|taiwan|中文|國語|国语|普通話|普通话|粵語|粤语|台灣|臺灣/i.test(v.name||'');
  const rank=v=>{const l=ln(v);return(/TW|Hant/i.test(l)?0:/HK|yue/i.test(l)?2:1)+(v.localService===false?.5:0)};
  let zhList=[],ready=false,chosen=get('ax_narr_voice');
  function pick(){
    if(!synth)return;const vs=synth.getVoices()||[];if(!vs.length)return;ready=true;
    zhList=vs.filter(isZh).sort((a,b)=>{const ma=MALE.test(a.name)&&!FEMALE.test(a.name)?0:1,mb=MALE.test(b.name)&&!FEMALE.test(b.name)?0:1;return ma-mb||rank(a)-rank(b)});
    voice=zhList.find(v=>v.voiceURI===chosen||v.name===chosen)||zhList[0]||null;male=!!voice&&MALE.test(voice.name)&&!FEMALE.test(voice.name);
  }
  if(synth){pick();try{synth.addEventListener('voiceschanged',pick)}catch(e){synth.onvoiceschanged=pick}
    let tries=0;const iv=setInterval(()=>{pick();if(voice||++tries>20)clearInterval(iv)},250)}   // Safari does not always announce its voices
  const supported=()=>!!(synth&&U);
  function unlock(){ // iOS only lets a page speak after the first tap
    if(unlocked||!supported())return;unlocked=true;try{const u=new U(' ');u.volume=0;synth.speak(u)}catch(e){}}
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
  function paint(){const el=document.getElementById('hudcap');if(el)el.textContent=cap}
  // how a line is delivered: speed, pitch, loudness and the pause between phrases
  const MOOD={neutral:{r:.95,p:1,v:1,gap:120},calm:{r:.9,p:.96,v:.95,gap:220},mystery:{r:.8,p:.9,v:.9,gap:380},firm:{r:1,p:1.04,v:1,gap:140},
    urgent:{r:1.16,p:1.14,v:1,gap:40},grave:{r:.76,p:.82,v:.95,gap:520},bright:{r:1.02,p:1.18,v:1,gap:120},dark:{r:.78,p:.72,v:1,gap:460},cold:{r:.84,p:.88,v:.85,gap:420}};
  let speaking=0,chain=Promise.resolve(),gen=0;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  function utter(text,m,k){return new Promise(res=>{
    if(!on||!supported()){res();return}
    if(!voice)pick();if(!voice&&ready){res();return}                 // no Chinese voice on this phone: captions only
    let done=false;const fin=()=>{if(done)return;done=true;speaking=Math.max(0,speaking-1);if(!speaking&&api.onSpeak)api.onSpeak(false);res()};
    try{const u=new U(text);u.lang=voice?ln(voice):'zh-TW';if(voice)u.voice=voice;
      const base=male?.95:.7,lift=[0,.05,-.04,.03][k%4];                 // a little rise and fall from phrase to phrase
      u.rate=Math.max(.6,Math.min(1.4,m.r));u.pitch=Math.max(.1,Math.min(2,base*m.p+lift));u.volume=m.v;
      u.onend=u.onerror=fin;if(!speaking&&api.onSpeak)api.onSpeak(true);speaking++;synth.speak(u);setTimeout(fin,Math.max(4000,text.length*420))}catch(e){fin()}})}
  function say(text,opt){
    text=String(text||'').trim();if(!text)return;const now=Date.now(),o=opt||{},m=MOOD[o.mood]||MOOD.neutral;
    if(text===lastText&&now-lastAt<2500)return;lastText=text;lastAt=now;
    log.push(text);moods.push(o.mood||'neutral');if(log.length>200){log.shift();moods.shift()}
    pending++;if(pending>6){gen++;pending=1;try{synth&&synth.cancel()}catch(e){}chain=Promise.resolve()}     // never fall far behind the game
    const g=gen,parts=text.split(/(?<=[。！？!?；])/).map(x=>x.trim()).filter(Boolean);
    chain=chain.then(async()=>{if(g!==gen)return;
      if(o.delay)await wait(o.delay);if(g!==gen)return;
      cap=text;paint();clearTimeout(capT);capT=setTimeout(()=>{cap='';paint()},Math.max(6000,text.length*260));
      for(let k=0;k<parts.length;k++){if(g!==gen)return;await utter(parts[k],m,k);if(k<parts.length-1)await wait(m.gap)}
    }).catch(()=>{}).then(()=>{pending=Math.max(0,pending-1)});
  }
  function nextVoice(){if(!zhList.length)return null;const i=zhList.indexOf(voice);voice=zhList[(i+1)%zhList.length];chosen=voice.voiceURI||voice.name;set(chosen,'ax_narr_voice');
    male=MALE.test(voice.name)&&!FEMALE.test(voice.name);gen++;try{synth.cancel()}catch(e){}pending=0;chain=Promise.resolve();const t=lastText;lastText='';say('現在由我擔任旁白。');lastText=t;return voice.name}
  function status(){return!supported()?'none':!ready?'loading':voice?'ok':'nozh'}
  function toggle(){on=!on;set(on?'1':'0');if(!on&&synth){gen++;try{synth.cancel()}catch(e){}pending=0;chain=Promise.resolve()}return on}
  return Object.assign(api,{moods,say,toggle,nextVoice,status,voiceName:()=>voice?voice.name:'',voiceCount:()=>zhList.length,supported,isOn:()=>on,caption:()=>cap,clear(){cap='';paint()},log,
    debug:()=>({on,supported:supported(),ready,zh:zhList.map(v=>v.name),voice:voice?voice.name+' / '+voice.lang:null,male,pending,unlocked,spoken:log.slice(-12)})});
})();
