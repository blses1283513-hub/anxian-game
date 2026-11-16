/* Narrator: reads out public game events with the phone's built-in speech and shows them as captions. */
window.Narrator=(()=>{
  "use strict";
  const synth=window.speechSynthesis||null,U=window.SpeechSynthesisUtterance||null;
  const get=k=>{try{return localStorage.getItem(k||'ax_narr')}catch(e){return null}},set=(v,k)=>{try{localStorage.setItem(k||'ax_narr',v)}catch(e){}};
  let on=get()!=='0',voice=null,male=false,unlocked=false,cap='',capT=0,lastText='',lastAt=0,pending=0;
  const log=[];
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
  function say(text){
    text=String(text||'').trim();if(!text)return;const now=Date.now();
    if(text===lastText&&now-lastAt<2500)return;lastText=text;lastAt=now;
    log.push(text);if(log.length>200)log.shift();
    cap=text;paint();clearTimeout(capT);capT=setTimeout(()=>{cap='';paint()},Math.max(6000,text.length*260));
    if(!on||!supported())return;
    try{
      if(pending>4){synth.cancel();pending=0}      // never fall far behind the game
      if(!voice)pick();
      if(!voice&&ready)return;                    // no Chinese voice on this phone: captions only, never read Chinese with a foreign voice
      const u=new U(text);u.lang=voice?ln(voice):'zh-TW';if(voice)u.voice=voice;
      u.rate=.92;u.pitch=male?.95:.7;u.volume=1;
      pending++;u.onend=u.onerror=()=>{pending=Math.max(0,pending-1)};
      synth.speak(u);
    }catch(e){}
  }
  function nextVoice(){if(!zhList.length)return null;const i=zhList.indexOf(voice);voice=zhList[(i+1)%zhList.length];chosen=voice.voiceURI||voice.name;set(chosen,'ax_narr_voice');
    male=MALE.test(voice.name)&&!FEMALE.test(voice.name);try{synth.cancel()}catch(e){}pending=0;const t=lastText;lastText='';say('現在由我擔任旁白。');lastText=t;return voice.name}
  function status(){return!supported()?'none':!ready?'loading':voice?'ok':'nozh'}
  function toggle(){on=!on;set(on?'1':'0');if(!on&&synth){try{synth.cancel()}catch(e){}pending=0}return on}
  return{say,toggle,nextVoice,status,voiceName:()=>voice?voice.name:'',voiceCount:()=>zhList.length,supported,isOn:()=>on,caption:()=>cap,clear(){cap='';paint()},log,
    debug:()=>({on,supported:supported(),ready,zh:zhList.map(v=>v.name),voice:voice?voice.name+' / '+voice.lang:null,male,pending,unlocked,spoken:log.slice(-12)})};
})();
