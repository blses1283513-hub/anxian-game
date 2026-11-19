// records the game's own synthesised music and sound effects to files
const { chromium } = require('playwright');const fs=require('fs');
const MUSIC=[['brief',9],['day',30],['urgent',16],['chase_cop',8],['win_citizen',14],['lobby',12]];
const SFX=['gun','bell','heartbeat','cheer','success','tick','shuffle','cough','join','drum','laugh'];
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();
 await p.addInitScript(()=>{const oc=AudioNode.prototype.connect;
   AudioNode.prototype.connect=function(dst,...r){const res=oc.call(this,dst,...r);if(dst instanceof AudioDestinationNode){const c=this.context;if(!c.__rec)c.__rec=c.createMediaStreamDestination();window.__ctx=c;oc.call(this,c.__rec)}return res};
   window.__record=ms=>new Promise(res=>{const mr=new MediaRecorder(window.__ctx.__rec.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000}),ch=[];
     mr.ondataavailable=e=>ch.push(e.data);mr.onstop=async()=>{const buf=await new Blob(ch).arrayBuffer();let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));res(btoa(s))};mr.start();setTimeout(()=>mr.stop(),ms)})});
 await p.goto('http://localhost:3100/?u=audio');await p.waitForTimeout(1000);await p.keyboard.press('Shift');await p.mouse.click(5,5);await p.waitForTimeout(500);
 console.log('sound:',JSON.stringify(await p.evaluate(()=>{Sound.setMusic(true);Sound.setSfx(true);return Sound.debug().ctx})),'names',JSON.stringify(await p.evaluate(()=>Sound.names)));
 for(const [name,sec] of MUSIC){await p.evaluate(()=>Sound.scene(''));await p.waitForTimeout(1500);
   const b64=await p.evaluate(([n,ms])=>{const r=window.__record(ms);Sound.scene(n);return r},[name,sec*1000]);fs.writeFileSync(`audio/music_${name}.webm`,Buffer.from(b64,'base64'));console.log('music',name,sec+'s')}
 await p.evaluate(()=>Sound.scene(''));await p.waitForTimeout(2500);
 for(const n of SFX){const b64=await p.evaluate(n=>{const r=window.__record(3500);Sound.sfx(n);return r},n);fs.writeFileSync(`audio/sfx_${n}.webm`,Buffer.from(b64,'base64'));console.log('sfx',n)}
 await b.close()})();
