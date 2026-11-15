/* Narrator: reads out public game events with the phone's built-in speech and shows them as captions. */
window.Narrator=(()=>{
  "use strict";
  const synth=window.speechSynthesis||null,U=window.SpeechSynthesisUtterance||null;
  const get=()=>{try{return localStorage.getItem('ax_narr')}catch(e){return null}},set=v=>{try{localStorage.setItem('ax_narr',v)}catch(e){}};
  let on=get()!=='0',voice=null,male=false,unlocked=false,cap='',capT=0,lastText='',lastAt=0,pending=0;
  const log=[];
  // voices that are known to be male; anything else is pitched down to sound deeper
  const MALE=/male|男|yun-?jhe|yunjhe|yunxi|yunyang|yunjian|yunze|kangkang|zhiwei|wan-?lung|danny/i,FEMALE=/female|女/i;
  function pick(){
    if(!synth)return;const vs=synth.getVoices()||[];if(!vs.length)return;
    const zh=vs.filter(v=>/^(zh|cmn|yue)/i.test(v.lang)),rank=v=>(/TW|Hant/i.test(v.lang)?0:/CN|Hans/i.test(v.lang)?1:2);
    const m=zh.filter(v=>MALE.test(v.name)&&!FEMALE.test(v.name)).sort((a,b)=>rank(a)-rank(b))[0];
    voice=m||zh.slice().sort((a,b)=>rank(a)-rank(b))[0]||null;male=!!m;
  }
  if(synth){pick();try{synth.addEventListener('voiceschanged',pick)}catch(e){synth.onvoiceschanged=pick}}
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
      const u=new U(text);u.lang=voice?voice.lang:'zh-TW';if(voice)u.voice=voice;
      u.rate=.92;u.pitch=male?.95:.55;u.volume=1;
      pending++;u.onend=u.onerror=()=>{pending=Math.max(0,pending-1)};
      synth.speak(u);
    }catch(e){}
  }
  function toggle(){on=!on;set(on?'1':'0');if(!on&&synth){try{synth.cancel()}catch(e){}pending=0}return on}
  return{say,toggle,supported,isOn:()=>on,caption:()=>cap,clear(){cap='';paint()},log,
    debug:()=>({on,supported:supported(),voice:voice?voice.name+' / '+voice.lang:null,male,pending,unlocked,spoken:log.slice(-12)})};
})();
