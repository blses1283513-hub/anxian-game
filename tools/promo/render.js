// node render.js <shot> <W> <H> <outdir> [fps]
const { chromium } = require('playwright');const fs=require('fs');
(async()=>{const [shot,W,H,out,fpsA]=process.argv.slice(2);const fps=+(fpsA||24);fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:+W,height:+H},deviceScaleFactor:1});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:3100/?cine=1&u=cine');await p.waitForTimeout(1500);await p.addScriptTag({path:__dirname+'/shots.js'});
 await p.evaluate(([k,w,h])=>CINE.start(k,w,h),[shot,+W,+H]);const dur=await p.evaluate(k=>CINE.dur(k),shot),n=Math.round(dur*fps),t0=Date.now();
 for(let i=0;i<n;i++){const url=await p.evaluate(t=>CINE.frame(t),i/fps);fs.writeFileSync(`${out}/${String(i).padStart(4,'0')}.jpg`,Buffer.from(url.split(',')[1],'base64'))}
 console.log(shot,W+'x'+H,n,'frames',((Date.now()-t0)/n/1000).toFixed(2)+'s/frame',errs.length?'ERR '+errs.join('|'):'');await b.close()})();
