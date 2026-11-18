/* Art kit for the 3D scenes: textures painted in code (wood, tiles, carpet, wallpaper...), smooth geometry
   (rounded boxes, turned shapes) and a batcher that merges many static pieces into one draw call. */
window.Art=(()=>{
  "use strict";
  const T=window.THREE;if(!T)return null;
  // repeatable random numbers, so every phone paints the same building
  const rng=seed=>{let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
  const css=(c,a)=>a==null?'#'+c.toString(16).padStart(6,'0'):`rgba(${c>>16&255},${c>>8&255},${c&255},${a})`;
  const mix=(c,f,to)=>{const t=to==null?0:to,ch=s=>{const a=c>>s&255,b=t>>s&255;return Math.round(a+(b-a)*f)};return ch(16)<<16|ch(8)<<8|ch(0)};
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
  let aniso=4;const live=new Set();
  function texture(c,repeat){const t=new T.CanvasTexture(c);t.anisotropy=aniso;live.add(t);t.addEventListener('dispose',()=>live.delete(t));if(repeat){t.wrapS=t.wrapT=T.RepeatWrapping}else{t.wrapS=t.wrapT=T.ClampToEdgeWrapping}return t}
  // soft value noise, drawn once and laid over other textures to take the flat, computer-made look away
  const noiseC=(()=>{const n=128,c=canvas(n,n),x=c.getContext('2d'),d=x.createImageData(n,n),r=rng(7),g=[];
    for(let i=0;i<16*16;i++)g.push(r());
    const v=(i,j)=>g[(j&15)*16+(i&15)];
    for(let y=0;y<n;y++)for(let X=0;X<n;X++){const fx=X/8,fy=y/8,i=Math.floor(fx),j=Math.floor(fy),u=fx-i,w=fy-j,s=u*u*(3-2*u),t=w*w*(3-2*w);
      const a=v(i,j)*(1-s)+v(i+1,j)*s,b=v(i,j+1)*(1-s)+v(i+1,j+1)*s,val=(a*(1-t)+b*t)*.7+r()*.3,k=(y*n+X)*4;
      d.data[k]=d.data[k+1]=d.data[k+2]=Math.round(val*255);d.data[k+3]=255}
    x.putImageData(d,0,0);return c})();
  function grain(x,w,h,alpha){x.save();x.globalAlpha=alpha;x.globalCompositeOperation='overlay';x.fillStyle=x.createPattern(noiseC,'repeat');x.fillRect(0,0,w,h);x.restore()}
  /* ---------- repeating textures (multiplied by each piece's own colour) ---------- */
  function woodTile(){const S=256,c=canvas(S,S),x=c.getContext('2d'),r=rng(11);x.fillStyle='#d8c3a5';x.fillRect(0,0,S,S);
    for(let i=0;i<70;i++){const y0=r()*S,amp=2+r()*6,ph=r()*6,a=.05+r()*.12;x.strokeStyle=`rgba(90,60,35,${a})`;x.lineWidth=.6+r()*1.6;x.beginPath();
      for(let X=0;X<=S;X+=8){const y=y0+Math.sin(X/S*Math.PI*2*2+ph)*amp;X?x.lineTo(X,y):x.moveTo(X,y)}x.stroke()}
    for(let i=0;i<3;i++){const kx=r()*S,ky=r()*S;const g=x.createRadialGradient(kx,ky,0,kx,ky,9);g.addColorStop(0,'rgba(80,50,30,.45)');g.addColorStop(1,'rgba(80,50,30,0)');x.fillStyle=g;x.beginPath();x.ellipse(kx,ky,10,5,0,0,7);x.fill()}
    grain(x,S,S,.35);return texture(c,true)}
  function paintTile(){const S=128,c=canvas(S,S),x=c.getContext('2d');x.fillStyle='#e9e9e9';x.fillRect(0,0,S,S);grain(x,S,S,.28);return texture(c,true)}
  function fabricTile(){const S=64,c=canvas(S,S),x=c.getContext('2d');x.fillStyle='#e6e6e6';x.fillRect(0,0,S,S);
    for(let i=0;i<S;i+=2){x.fillStyle='rgba(0,0,0,.06)';x.fillRect(i,0,1,S);x.fillStyle='rgba(255,255,255,.08)';x.fillRect(0,i,S,1)}grain(x,S,S,.2);return texture(c,true)}
  // a wall 1.3 m wide and 2.6 m high: panelled lower part, rail, papered upper part and a darker top band
  function wallTile(){const W=256,H=512,c=canvas(W,H),x=c.getContext('2d'),py=y=>H-y/2.6*H;
    x.fillStyle='#e7e2d8';x.fillRect(0,0,W,H);
    for(let X=0;X<W;X+=32){x.fillStyle='rgba(120,110,95,.08)';x.fillRect(X,0,14,py(.92))}                       // soft stripes
    for(let X=16;X<W;X+=64)for(let y=24;y<py(.95);y+=64){x.fillStyle='rgba(150,130,100,.12)';x.beginPath();x.ellipse(X+16,y,5,8,0,0,7);x.fill()}
    x.fillStyle='#bfb3a0';x.fillRect(0,py(.92),W,H);                                                            // wainscot
    x.fillStyle='rgba(0,0,0,.10)';x.fillRect(12,py(.82),W/2-24,py(.12)-py(.82));x.fillRect(W/2+12,py(.82),W/2-24,py(.12)-py(.82));
    x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=2;x.strokeRect(12,py(.82),W/2-24,py(.12)-py(.82));x.strokeRect(W/2+12,py(.82),W/2-24,py(.12)-py(.82));
    x.fillStyle='#8f8473';x.fillRect(0,py(.98),W,py(.9)-py(.98));x.fillStyle='rgba(255,255,255,.4)';x.fillRect(0,py(.98),W,2);   // chair rail
    x.fillStyle='#6f665a';x.fillRect(0,py(.1),W,H-py(.1));                                                      // skirting
    x.fillStyle='#9a8f7f';x.fillRect(0,0,W,py(2.5));                                                            // top band
    grain(x,W,H,.3);return texture(c,true)}
  /* ---------- floors: one picture per room, with rugs, light pools and soft shadows painted in ---------- */
  // f = {kind, w, d (metres), seed, base, alt, light:[{x,z,r,a}], shade:[{x,z,rx,rz,a}], rug:[{x,z,r,c,c2}], runner:{x0,z0,x1,z1,c}}; x/z are metres from the room's corner
  const floors={};
  function floorTex(f){const fk=JSON.stringify(f);if(floors[fk])return floors[fk];return floors[fk]=paintFloor(f)}
  function paintFloor(f){
    const ppm=f.ppm||36,pot=v=>{let p=64;while(p<v&&p<1024)p*=2;return p},W=pot(f.w*ppm),H=pot(f.d*ppm),sx=W/f.w,sz=H/f.d,c=canvas(W,H),x=c.getContext('2d'),r=rng(f.seed||1),base=f.base,alt=f.alt==null?mix(base,.15,0xffffff):f.alt;
    x.fillStyle=css(base);x.fillRect(0,0,W,H);
    if(f.kind==='planks'){const pw=.18*sz,pl=1.6*sx;
      for(let y=0,row=0;y<H;y+=pw,row++){let X=-(r()*pl);while(X<W){const len=pl*(.6+r()*.8);x.fillStyle=css(mix(base,(r()-.5)*.25,r()<.5?0:0xffffff));x.fillRect(X,y,len-1,pw-1);
          x.strokeStyle='rgba(40,25,15,.10)';x.lineWidth=1;for(let k=0;k<3;k++){x.beginPath();const yy=y+pw*(.2+.3*k)+r()*2;x.moveTo(X,yy);x.bezierCurveTo(X+len*.3,yy+r()*3-1.5,X+len*.6,yy+r()*3-1.5,X+len,yy);x.stroke()}
          x.fillStyle='rgba(0,0,0,.25)';x.fillRect(X+len-1,y,1.5,pw);X+=len}
        x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,y+pw-1,W,1.2)}}
    else if(f.kind==='tiles'||f.kind==='checker'||f.kind==='stone'){const ts=(f.tile||.6)*sx,tz=(f.tile||.6)*sz;
      for(let j=0;j*tz<H;j++)for(let i=0;i*ts<W;i++){const ch=f.kind==='checker'&&(i+j)%2;x.fillStyle=css(mix(ch?alt:base,(r()-.5)*(f.kind==='stone'?.18:.07),r()<.5?0:0xffffff));
        x.fillRect(i*ts+1,j*tz+1,ts-2,tz-2);if(f.kind==='stone'){x.strokeStyle='rgba(255,255,255,.05)';x.beginPath();x.moveTo(i*ts+r()*ts,j*tz);x.quadraticCurveTo(i*ts+r()*ts,j*tz+tz*.5,i*ts+r()*ts,j*tz+tz);x.stroke()}}
      x.globalCompositeOperation='multiply';x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=1.5;for(let i=0;i*ts<=W;i++){x.beginPath();x.moveTo(i*ts,0);x.lineTo(i*ts,H);x.stroke()}for(let j=0;j*tz<=H;j++){x.beginPath();x.moveTo(0,j*tz);x.lineTo(W,j*tz);x.stroke()}x.globalCompositeOperation='source-over'}
    else if(f.kind==='carpet'){const step=.5*sx;for(let j=0;j*step<H;j++)for(let i=0;i*step<W;i++){x.fillStyle=css(alt,.12);x.beginPath();const cx=i*step+step/2,cy=j*step+step/2;x.moveTo(cx,cy-step*.3);x.lineTo(cx+step*.3,cy);x.lineTo(cx,cy+step*.3);x.lineTo(cx-step*.3,cy);x.fill()}}
    else if(f.kind==='concrete'){for(let i=0;i<14;i++){const cx=r()*W,cy=r()*H,rr=(.4+r()*1.2)*sx;const g=x.createRadialGradient(cx,cy,0,cx,cy,rr);g.addColorStop(0,'rgba(0,0,0,.12)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(cx-rr,cy-rr,rr*2,rr*2)}
      x.strokeStyle='rgba(0,0,0,.2)';x.lineWidth=1;for(let X=2*sx;X<W;X+=2*sx){x.beginPath();x.moveTo(X,0);x.lineTo(X,H);x.stroke()}}
    grain(x,W,H,f.grain==null?.32:f.grain);
    for(const g of f.rug||[]){const cx=g.x*sx,cy=g.z*sz,rx=g.r*sx,rz=g.r*sz;x.save();x.translate(cx,cy);x.scale(1,rz/rx);                    // round rugs
      x.fillStyle='rgba(0,0,0,.35)';x.beginPath();x.arc(0,4,rx*1.02,0,7);x.fill();x.fillStyle=css(g.c);x.beginPath();x.arc(0,0,rx,0,7);x.fill();
      x.strokeStyle=css(g.c2||mix(g.c,.4,0xffffff));x.lineWidth=rx*.05;for(const k of [.9,.62,.3]){x.beginPath();x.arc(0,0,rx*k,0,7);x.stroke()}
      for(let a=0;a<16;a++){x.fillStyle=css(g.c2||mix(g.c,.4,0xffffff),.7);x.beginPath();x.arc(Math.cos(a/16*Math.PI*2)*rx*.76,Math.sin(a/16*Math.PI*2)*rx*.76,rx*.035,0,7);x.fill()}
      x.restore();grainArea(x,cx-rx,cy-rz,rx*2,rz*2)}
    if(f.runner){const q=f.runner,X0=q.x0*sx,Y0=q.z0*sz,X1=q.x1*sx,Y1=q.z1*sz;x.fillStyle='rgba(0,0,0,.3)';x.fillRect(X0+2,Y0+3,X1-X0,Y1-Y0);x.fillStyle=css(q.c);x.fillRect(X0,Y0,X1-X0,Y1-Y0);
      x.strokeStyle=css(mix(q.c,.45,0xf1cf63));x.lineWidth=Math.max(2,.05*sx);const m=.12*sx;x.strokeRect(X0+m,Y0+m,X1-X0-2*m,Y1-Y0-2*m);grainArea(x,X0,Y0,X1-X0,Y1-Y0)}
    for(const s of f.shade||[]){const cx=s.x*sx,cy=s.z*sz;x.save();x.translate(cx,cy);x.scale(1,(s.rz*sz)/(s.rx*sx));const R=s.rx*sx;const g=x.createRadialGradient(0,0,R*.3,0,0,R);g.addColorStop(0,`rgba(0,0,0,${s.a||.45})`);g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.beginPath();x.arc(0,0,R,0,7);x.fill();x.restore()}
    // darker along the walls, like light that does not reach the corners
    const e=.7*Math.min(sx,sz),edge=(x0,y0,x1,y1,gx0,gy0,gx1,gy1)=>{const g=x.createLinearGradient(gx0,gy0,gx1,gy1);g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(x0,y0,x1-x0,y1-y0)};
    if(!f.open){edge(0,0,W,e,0,0,0,e);edge(0,H-e,W,H,0,H,0,H-e);edge(0,0,e,H,0,0,e,0);edge(W-e,0,W,H,W,0,W-e,0)}
    x.globalCompositeOperation='lighter';
    for(const l of f.light||[]){const cx=l.x*sx,cy=l.z*sz,R=l.r*sx;x.save();x.translate(cx,cy);x.scale(1,sz/sx);const g=x.createRadialGradient(0,0,0,0,0,R);g.addColorStop(0,`rgba(255,214,150,${l.a||.28})`);g.addColorStop(.55,`rgba(255,200,130,${(l.a||.28)*.35})`);g.addColorStop(1,'rgba(255,200,130,0)');x.fillStyle=g;x.beginPath();x.arc(0,0,R,0,7);x.fill();x.restore()}
    x.globalCompositeOperation='source-over';
    const t=texture(c,false);t.minFilter=T.LinearMipmapLinearFilter;return t}
  function grainArea(x,X,Y,W,H){x.save();x.beginPath();x.rect(X,Y,W,H);x.clip();grain(x,X+W,Y+H,.25);x.restore()}
  // a soft round shadow, used under people and furniture
  const blobTex=(()=>{const S=128,c=canvas(S,S),x=c.getContext('2d'),g=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.5,'rgba(0,0,0,.3)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,S,S);return new T.CanvasTexture(c)})();
  const glowTex=(()=>{const S=128,c=canvas(S,S),x=c.getContext('2d'),g=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,S,S);return new T.CanvasTexture(c)})();
  // shadows for many moving things in one draw call
  function Shadows(n,size){const geo=new T.PlaneGeometry(1,1);geo.rotateX(-Math.PI/2);
    const m=new T.InstancedMesh(geo,new T.MeshBasicMaterial({map:blobTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),n);
    m.renderOrder=1;m.frustumCulled=false;const o=new T.Object3D(),s0=size||1;let used=0;
    return{mesh:m,begin(){used=0},put(x,y,z,s){if(used>=n)return;o.position.set(x,y+.02,z);o.scale.setScalar((s||1)*s0);o.updateMatrix();m.setMatrixAt(used++,o.matrix)},
      end(){m.count=used;m.instanceMatrix.needsUpdate=true}}}
  /* ---------- smooth shapes ---------- */
  const gc={};
  // a box with rounded edges; k = how many steps go round each edge
  function rbox(w,h,d,r,k){k=k||2;r=Math.min(r,w/2-.001,h/2-.001,d/2-.001);const key=['rb',w,h,d,r,k].join('|');if(gc[key])return gc[key];
    const n=2*k+1,g=new T.BoxGeometry(1,1,1,n,n,n),P=g.attributes.position,N=g.attributes.normal,hw=[w/2,h/2,d/2],m=.5/n,p=[0,0,0];
    for(let i=0;i<P.count;i++){p[0]=P.getX(i);p[1]=P.getY(i);p[2]=P.getZ(i);const c=[0,0,0];
      for(let a=0;a<3;a++){const u=p[a],s=Math.sign(u),au=Math.abs(u),inner=hw[a]-r;p[a]=au<=m+1e-6?u/m*inner:s*(inner+(au-m)/(.5-m)*r);c[a]=Math.max(-inner,Math.min(inner,p[a]))}
      const dx=p[0]-c[0],dy=p[1]-c[1],dz=p[2]-c[2],l=Math.hypot(dx,dy,dz);
      if(l>1e-6){P.setXYZ(i,c[0]+dx/l*r,c[1]+dy/l*r,c[2]+dz/l*r);N.setXYZ(i,dx/l,dy/l,dz/l)}else P.setXYZ(i,p[0],p[1],p[2])}
    return gc[key]=g}
  // a turned shape (table legs, pots, lamp shades): pts = [[radius, height], ...] from bottom to top
  function lathe(pts,seg){const key='la'+JSON.stringify(pts)+seg;return gc[key]||(gc[key]=new T.LatheGeometry(pts.map(p=>new T.Vector2(p[0],p[1])),seg||24))}
  // a rounded profile turned into a solid with a soft rim: radius r, thickness h
  const disc=(r,h,seg)=>{const e=Math.min(.02,h/4),i=Math.min(.04,r*.2);return lathe([[0,0],[r-i,0],[r,e],[r+.005,h/2],[r,h-e],[r-i,h],[0,h]],seg||40)};
  const sphere=(a,b)=>gc['sp'+a+b]||(gc['sp'+a+b]=new T.SphereGeometry(1,a||16,b||12));
  const cylinder=(rt,rb,seg)=>gc['cy'+rt+rb+seg]||(gc['cy'+rt+rb+seg]=new T.CylinderGeometry(rt,rb,1,seg||16));
  const torus=(r,t,a)=>gc['to'+r+t+a]||(gc['to'+r+t+a]=new T.TorusGeometry(r,t,8,24,a||Math.PI*2));
  /* ---------- merging ---------- */
  const _m=new T.Matrix4(),_q=new T.Quaternion(),_e=new T.Euler(0,0,0,'YXZ'),_p=new T.Vector3(),_s=new T.Vector3();
  // position (x,y,z), turn (ry, then rx, then rz) and size of one piece, optionally inside a parent placement
  function place(x,y,z,ry,rx,rz,sx,sy,sz,parent){_q.setFromEuler(_e.set(rx||0,ry||0,rz||0));_s.set(sx==null?1:sx,sy==null?(sx==null?1:sx):sy,sz==null?(sx==null?1:sx):sz);
    const m=new T.Matrix4().compose(_p.set(x||0,y||0,z||0),_q,_s);return parent?new T.Matrix4().multiplyMatrices(parent,m):m}
  // many static pieces of the same material become one mesh. Texture coordinates come from the world position
  // (so wood grain and wallpaper run continuously), or from the piece itself with uv:'own'.
  function Batch(){const P=[],N=[],C=[],U=[],I=[];let n=0;const v=new T.Vector3(),nm=new T.Matrix3(),col=new T.Color(),nv=new T.Vector3();
    const me={count:()=>n,
      add(geo,color,matrix,o){o=o||{};const pa=geo.attributes.position,na=geo.attributes.normal,ua=geo.attributes.uv,ix=geo.index,m=matrix||_m.identity(),su=o.s?(o.s.length?o.s[0]:o.s):1,sv=o.s?(o.s.length?o.s[1]:o.s):1;
        nm.getNormalMatrix(m);col.setHex(color);
        for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(m);nv.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();P.push(v.x,v.y,v.z);N.push(nv.x,nv.y,nv.z);
          if(o.cf)col.setHex(o.cf(v.x,v.y,v.z,nv));const ao=o.ao?o.ao(v.x,v.y,v.z,nv):1;C.push(col.r*ao,col.g*ao,col.b*ao);
          if(o.uv==='own'&&ua){const t=o.uvt;U.push(t?t[0]+ua.getX(i)*t[2]:ua.getX(i),t?t[1]+ua.getY(i)*t[3]:ua.getY(i))}
          else{const ax=Math.abs(nv.x),ay=Math.abs(nv.y),az=Math.abs(nv.z);if(ay>=ax&&ay>=az)U.push(v.x/su,v.z/sv);else if(ax>=az)U.push(v.z/su,v.y/sv);else U.push(v.x/su,v.y/sv)}}
        if(ix)for(let i=0;i<ix.count;i++)I.push(ix.getX(i)+n);else for(let i=0;i<pa.count;i++)I.push(i+n);n+=pa.count;return me},
      mesh(material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('normal',new T.Float32BufferAttribute(N,3));
        g.setAttribute('color',new T.Float32BufferAttribute(C,3));g.setAttribute('uv',new T.Float32BufferAttribute(U,2));g.setIndex(I);g.computeBoundingSphere();return new T.Mesh(g,material)}};
    return me}
  let tiles=null;
  const kit=()=>tiles||(tiles={wood:woodTile(),paint:paintTile(),fabric:fabricTile(),wall:wallTile()});
  const lambert=(map,o)=>new T.MeshLambertMaterial(Object.assign({vertexColors:true,map:map||null},o||{}));
  return{rng,css,mix,canvas,texture,grain,floorTex,blobTex,glowTex,Shadows,rbox,lathe,disc,sphere,cylinder,torus,place,Batch,kit,lambert,
    setAniso(a){if(a===aniso)return;aniso=a;for(const t of live){t.anisotropy=a;t.needsUpdate=true}}};
})();
