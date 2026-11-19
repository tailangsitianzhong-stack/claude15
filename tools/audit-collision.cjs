const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5199/');await p.waitForTimeout(2500);
const res=await p.evaluate(async()=>{
 const THREE=await import('/vendor/three.module.min.js');
 const stage=window.__stage, city=stage.group.getObjectByName('City'); stage.group.updateMatrixWorld(true);
 // 裏面にも当たるようにして、「物の内側にいるか」を調べる
 const saved=[]; city.traverse(o=>{ if(o.isMesh){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{saved.push([m,m.side]);m.side=THREE.DoubleSide;}); }});
 const open=new Set(['PlaneGeometry','CircleGeometry','RingGeometry']);
 const rc=new THREE.Raycaster(); rc.far=60; const up=new THREE.Vector3(0,1,0), nrm=new THREE.Vector3(), im=new THREE.Matrix4(), mw=new THREE.Matrix4();
 function inside(x,y,z){
   rc.set(new THREE.Vector3(x,y,z),up);
   const hits=rc.intersectObject(city,true);
   for(const h of hits){
     if(open.has(h.object.geometry.type)) continue;
     if(h.object.geometry.type==='IcosahedronGeometry'||h.object.geometry.type==='TorusGeometry') continue; // 枝葉は頭上。輪は平ら
     mw.copy(h.object.matrixWorld); if(h.object.isInstancedMesh){h.object.getMatrixAt(h.instanceId,im);mw.multiply(im);}
     nrm.copy(h.face.normal).transformDirection(mw);
     return nrm.y>0 ? h.object : null;   // 上向きの面を下から当てた = 内側ではない… 上へ飛ばして最初に当たった面が裏向き(法線が上)なら内側
   }
   return null;
 }
 // 上へ飛ばして最初に当たった面の法線が下向きなら外側（天井の裏）、上向きなら内側
 function inside2(x,y,z){ rc.set(new THREE.Vector3(x,y,z),up); const hits=rc.intersectObject(city,true);
   for(const h of hits){ const g=h.object.geometry.type; if(open.has(g)||g==='IcosahedronGeometry'||g==='TorusGeometry') continue;
     mw.copy(h.object.matrixWorld); if(h.object.isInstancedMesh){h.object.getMatrixAt(h.instanceId,im);mw.multiply(im);}
     nrm.copy(h.face.normal).transformDirection(mw); return nrm.y>0.01 ? {g,at:[x,y,z]} : null; }
   return null; }
 const B=stage.bounds; const R=0.3, fails=[], testedPts=[];
 let seed=12345; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const pts=[];
 for(let x=B.minX-1;x<=B.maxX+1;x+=1.7) for(let z=B.minZ-1;z<=B.maxZ+1;z+=1.7) pts.push([x,z]);
 for(const o of stage.solids){ const ex=o.circle?o.r:Math.max(o.hx,o.hz); for(let i=0;i<6;i++){ pts.push([o.x+(rnd()*2-1)*(ex+0.7), o.z+(rnd()*2-1)*(ex+0.7)]); } }
 let moved=0;
 for(const [px,pz] of pts){
   const r=stage.resolve(px,pz,R); if(Math.hypot(r.x-px,r.z-pz)>1e-4) moved++;
   const gy=stage.groundY(r.x,r.z);
   const samples=[[0,0,0.2],[0,0,0.45],[0,0,0.7]];
   for(let a=0;a<8;a++) samples.push([Math.cos(a*Math.PI/4)*R*0.98,Math.sin(a*Math.PI/4)*R*0.98,0.4]);
   for(const [dx,dz,h] of samples){ const hit=inside2(r.x+dx,gy+h,r.z+dz); if(hit){ fails.push({from:[+px.toFixed(2),+pz.toFixed(2)],to:[+r.x.toFixed(2),+r.z.toFixed(2)],g:hit.g,gy:+gy.toFixed(2),h}); break; } }
   testedPts.push(1);
 }
 // 板（看板・窓）が物の内側に埋まっていないか: 板の表側 1cm の点が立体の内側にあれば、被って見えない
 const buried=[];
 city.traverse(o=>{ if(!o.isMesh||!open.has(o.geometry.type)) return;
   const n=new THREE.Vector3(0,0,1).transformDirection(o.matrixWorld); if(Math.abs(n.y)>0.9) return; // 地面の円盤などは除く
   const c=new THREE.Vector3(0,0,0).applyMatrix4(o.matrixWorld);
   for(const s of [1]){ const q=c.clone().addScaledVector(n,0.012*s); const hit=inside2(q.x,q.y,q.z); if(hit){ buried.push({at:c.toArray().map(x=>+x.toFixed(1)),side:s,g:o.geometry.type}); } } });
 // 地面の高さ: 道路 0 / 歩道 0.07 / 広場 0.14
 const gy={road:stage.groundY(0,-17.5),sidewalk:stage.groundY(-23,0),park_grass:stage.groundY(9,-3),plaza:stage.groundY(0,0),char:stage.groundY(-1,0)};
 saved.forEach(([m,s])=>m.side=s);
 return {pts:pts.length,moved,fails,buried,gy,charY:window.__chars.map(c=>+c.group.position.y.toFixed(3))};
});
require('fs').writeFileSync('/tmp/verify.json',JSON.stringify(res));
console.log('points',res.pts,'pushed-out',res.moved,'penetrations',res.fails.length,'buried planes',res.buried.length,res.gy,res.charY,errs);
await b.close();})();
