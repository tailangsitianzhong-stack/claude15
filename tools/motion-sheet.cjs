// モーションの確認用: 歩き・小走り・走りの 8 位相と、ジャンプ（立ち・走り）のキーフレームを /tmp/sheets/ に画像で書き出す。
// 先に python3 -m http.server 5199 を立てておく（mkdir -p /tmp/sheets）。
const {chromium}=require('playwright');
const sets={
 walk:[0,1,2,3,4,5,6,7].map(i=>({name:'walk',phase:i*Math.PI/4})),
 jog:[0,1,2,3,4,5,6,7].map(i=>({name:'jog',phase:i*Math.PI/4})),
 run:[0,1,2,3,4,5,6,7].map(i=>({name:'run',phase:i*Math.PI/4})),
 jumpStand:[{name:'stand'},{name:'crouch',jumpT:1},{name:'push',jumpT:0.5},{name:'push',jumpT:1},{name:'air',airU:1},{name:'air',airU:0.4},{name:'air',airU:0},{name:'air',airU:-0.5},{name:'air',airU:-1},{name:'land',jumpT:0.35,landK:1},{name:'land',jumpT:0.7,landK:1},{name:'land',jumpT:1,landK:1}],
 jumpRun:[{name:'run',phase:0.2,runK:1},{name:'crouch',jumpT:1,runK:1},{name:'push',jumpT:0.5,runK:1},{name:'push',jumpT:1,runK:1},{name:'air',airU:1,runK:1},{name:'air',airU:0.4,runK:1},{name:'air',airU:0,runK:1},{name:'air',airU:-0.5,runK:1},{name:'air',airU:-1,runK:1},{name:'land',jumpT:0.35,landK:1,runK:1},{name:'land',jumpT:0.7,landK:1,runK:1},{name:'land',jumpT:1,landK:1,runK:1}],
};
(async()=>{
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:500,height:560}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
await p.goto('http://localhost:5199/');await p.waitForTimeout(2500);
await p.evaluate(()=>{const c=window.__chars;c[1].group.position.set(-40,0,-40);window.__view.auto=false;window.__view.yaw=0;window.__view.pitch=0.0;window.__view.dist=2.3;window.__view.target.set(-1,0.5,0);});
for(const [name,frames] of Object.entries(sets)){
  let i=0;for(const f of frames){
    await p.evaluate(f=>{const a=window.__chars[0].animator;a.debug={...f};},f);
    await p.waitForTimeout(220);
    await p.screenshot({path:`/tmp/sheets/${name}_${String(i).padStart(2,'0')}.png`,clip:{x:75,y:120,width:350,height:330}});i++;}
}
console.log(errs);await b.close();})();
