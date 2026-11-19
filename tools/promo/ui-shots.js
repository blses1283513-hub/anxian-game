const { chromium } = require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const E=require('/home/user/anxian-game/public/engine.js');
function client(){const ws=new WebSocket('ws://localhost:3100/ws');const c={ws,S:null,send:o=>ws.send(JSON.stringify(o))};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='state')c.S=m.S};return new Promise(r=>ws.onopen=()=>r(c))}
const NAMES=['小美','阿凱','Leo','佳佳','大熊','Momo','小雨','Ken','安安','Jay'];
async function room(b,game,n,tag){const p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:2});
  await p.goto('http://localhost:3100/?u=ui'+tag);await p.waitForTimeout(1200);await p.fill('#nick','阿哲');
  if(game==='chase')await p.click('[data-a=pickgame][data-v=chase]');await p.click('[data-a=create]');await p.waitForTimeout(700);
  const code=await p.evaluate(()=>document.querySelector('.code').textContent.trim());
  for(let i=0;i<n-1;i++){const c=await client();c.send({t:'join',code,pid:'ui'+tag+'b'+i+'xx',key:'k',name:NAMES[i]});await sleep(50);c.send({t:'act',a:{k:'look',look:E.LOOKS[(i*3+2)%20][1]}})}
  await p.waitForTimeout(600);return p}
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 for(let k=0;k<10;k++){const p=await room(b,'virus',8,'v'+k);await p.click('[data-a=start]');await p.waitForTimeout(2500);
   const role=await p.evaluate(()=>document.body.innerText.match(/你抽到的身分\s*(\S+)/)?.[1]||'');
   if(!/恐怖分子|搜查官|記者|研究員/.test(role)){await p.close();continue}
   await p.screenshot({path:'ui/brief.png'});console.log('role',role);
   await p.waitForTimeout(62000);   // the identity briefing runs out, day 1 starts
   await p.click('[data-a=tab][data-v=id]');await p.waitForTimeout(800);await p.screenshot({path:'ui/idcard.png'});
   const sk=await p.$('[data-a=pick]');if(sk){await sk.click();await p.waitForTimeout(500);const t=await p.$('[data-a=target]');if(t){await t.click();await p.waitForTimeout(500)}await p.screenshot({path:'ui/pick.png'})}
   await p.close();break}
 const c=await room(b,'chase',8,'c');await c.click('[data-a=start]');await c.waitForTimeout(64000);await c.screenshot({path:'ui/chase.png'});
 await c.click('[data-a=tab][data-v=act]').catch(()=>{});await c.waitForTimeout(600);await c.screenshot({path:'ui/chase2.png'});
 await b.close()})();
