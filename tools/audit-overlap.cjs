const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:5199/');await p.waitForTimeout(2500);
const res=await p.evaluate(async()=>{
 const THREE=await import('/vendor/three.module.min.js');
 const scene=window.__scene, stage=window.__stage;
 const city=stage.group.getObjectByName('City');
 // ---- 三角形の収集 ----
 const tris=[]; const objs=[]; // objs[id] = {desc}
 const v=new THREE.Vector3(), a=new THREE.Vector3(), c=new THREE.Vector3(), mat4=new THREE.Matrix4(), inst=new THREE.Matrix4();
 city.updateMatrixWorld(true);
 const meshes=[];
 city.traverse(o=>{ if(o.isMesh && o.visible) meshes.push(o); });
 for(const mesh of meshes){
   const g=mesh.geometry; g.computeBoundingBox();
   const pos=g.attributes.position, idx=g.index;
   const n=mesh.isInstancedMesh?mesh.count:1;
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   const groups=g.groups.length?g.groups:[{start:0,count:idx?idx.count:pos.count,materialIndex:0}];
   for(let k=0;k<n;k++){
     mat4.copy(mesh.matrixWorld); if(mesh.isInstancedMesh){mesh.getMatrixAt(k,inst);mat4.multiply(inst);}
     const id=objs.length; objs.push({type:g.type,instanced:mesh.isInstancedMesh,k});
     const bb=g.boundingBox.clone().applyMatrix4(mat4); objs[id].bb=[bb.min.toArray().map(x=>+x.toFixed(2)),bb.max.toArray().map(x=>+x.toFixed(2))];
     objs[id].open = ['PlaneGeometry','CircleGeometry','RingGeometry'].includes(g.type);
     objs[id].sides=mats.map(m=>m.side);
     objs[id].tr=mats.map(m=>m.transparent);
     for(const gr of groups){
       const m=Array.isArray(mesh.material)?mats[gr.materialIndex??0]:mats[0]; if(!m||m.visible===false) continue;
       for(let i=gr.start;i<gr.start+gr.count;i+=3){
         const ia=idx?idx.getX(i):i, ib=idx?idx.getX(i+1):i+1, ic=idx?idx.getX(i+2):i+2;
         const A=new THREE.Vector3().fromBufferAttribute(pos,ia).applyMatrix4(mat4);
         const B=new THREE.Vector3().fromBufferAttribute(pos,ib).applyMatrix4(mat4);
         const C=new THREE.Vector3().fromBufferAttribute(pos,ic).applyMatrix4(mat4);
         const nrm=new THREE.Vector3().subVectors(B,A).cross(a.subVectors(C,A));
         const area=nrm.length()/2; if(area<1e-6) continue; nrm.normalize();
         tris.push({id,A,B,C,n:nrm,d:nrm.dot(A),area,side:m.side,col:m.color?m.color.getHex():-1,map:!!m.map,mi:gr.materialIndex??0});
       }
     }
   }
 }
 // ---- 面の重なり（同じ向き・ほぼ同じ平面・面積が重なる）----
 const cell=3, grid=new Map();
 const key=(x,y,z)=>x+','+y+','+z;
 tris.forEach((t,i)=>{
   const mn=[Math.min(t.A.x,t.B.x,t.C.x),Math.min(t.A.y,t.B.y,t.C.y),Math.min(t.A.z,t.B.z,t.C.z)];
   const mx=[Math.max(t.A.x,t.B.x,t.C.x),Math.max(t.A.y,t.B.y,t.C.y),Math.max(t.A.z,t.B.z,t.C.z)];
   t.mn=mn;t.mx=mx;
   for(let x=Math.floor(mn[0]/cell);x<=Math.floor(mx[0]/cell);x++)for(let y=Math.floor(mn[1]/cell);y<=Math.floor(mx[1]/cell);y++)for(let z=Math.floor(mn[2]/cell);z<=Math.floor(mx[2]/cell);z++){
     const k=key(x,y,z); if(!grid.has(k))grid.set(k,[]); grid.get(k).push(i);} });
 const seen=new Set(); const pairs=new Map();
 const EPS=0.012;
 function overlap2D(t1,t2){
   // 平面内の座標系
   const n=t1.n; const u=new THREE.Vector3(); Math.abs(n.x)<0.9?u.set(1,0,0):u.set(0,1,0); u.cross(n).normalize(); const w=new THREE.Vector3().crossVectors(n,u);
   const P=t=>[t.A,t.B,t.C].map(q=>[q.dot(u),q.dot(w)]);
   const p1=P(t1),p2=P(t2);
   const axes=[];
   for(const poly of [p1,p2]) for(let i=0;i<3;i++){const e=[poly[(i+1)%3][0]-poly[i][0],poly[(i+1)%3][1]-poly[i][1]];const l=Math.hypot(e[0],e[1]);axes.push([-e[1]/l,e[0]/l]);}
   let minOv=Infinity;
   for(const ax of axes){
     const pr=poly=>{let lo=Infinity,hi=-Infinity;for(const q of poly){const d=q[0]*ax[0]+q[1]*ax[1];lo=Math.min(lo,d);hi=Math.max(hi,d);}return [lo,hi];};
     const [a1,b1]=pr(p1),[a2,b2]=pr(p2);
     const ov=Math.min(b1,b2)-Math.max(a1,a2);
     if(ov<=0.004) return 0; minOv=Math.min(minOv,ov);
   }
   return minOv;
 }
 for(const lst of grid.values()){
   for(let ii=0;ii<lst.length;ii++)for(let jj=ii+1;jj<lst.length;jj++){
     const i=lst[ii],j=lst[jj]; const t1=tris[i],t2=tris[j];
     if(t1.id===t2.id) continue;
     const kk=i<j?i*1e6+j:j*1e6+i; if(seen.has(kk)) continue; seen.add(kk);
     const dot=t1.n.dot(t2.n);
     const bothDouble=t1.side===2||t2.side===2;
     if(!(dot>0.9995 || (bothDouble&&Math.abs(dot)>0.9995))) continue;
     // 平面の距離
     const dd=Math.max(Math.abs(t1.n.dot(t2.A)-t1.d),Math.abs(t1.n.dot(t2.B)-t1.d),Math.abs(t1.n.dot(t2.C)-t1.d));
     if(dd>EPS) continue;
     // AABB
     let ok=true;for(let q=0;q<3;q++){if(t1.mx[q]<t2.mn[q]-0.001||t2.mx[q]<t1.mn[q]-0.001){ok=false;break;}} if(!ok) continue;
     const ov=overlap2D(t1,t2); if(!ov) continue;
     const pk=Math.min(t1.id,t2.id)+'-'+Math.max(t1.id,t2.id);
     const e=pairs.get(pk)||{a:t1.id,b:t2.id,count:0,dist:dd,n:[+t1.n.x.toFixed(2),+t1.n.y.toFixed(2),+t1.n.z.toFixed(2)]};
     e.count++; pairs.set(pk,e);
   }
 }
 const zf=[...pairs.values()].map(e=>({a:objs[e.a],b:objs[e.b],count:e.count,dist:+e.dist.toFixed(4),n:e.n}));
 // ---- 片面の開いた面 ----
 const oneSided=[];
 objs.forEach((o,i)=>{ if(o.open && o.sides[0]===0){ const bb=o.bb; const flatY=Math.abs(bb[1][1]-bb[0][1])<0.02; if(!flatY||true) oneSided.push({type:o.type,bb:o.bb}); }});
 return {tris:tris.length,objs:objs.length,zf,oneSided,colliders:stage.colliders.length};
});
require('fs').writeFileSync('/tmp/audit.json',JSON.stringify(res));
console.log('tris',res.tris,'objs',res.objs,'zfight pairs',res.zf.length,'oneSidedOpen',res.oneSided.length,'colliders',res.colliders,errs);
await b.close();})();
