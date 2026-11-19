// マップ（ステージ）とキャラクターの「形」だけを表示する最小のビューア。操作・戦闘・通信などは含まない。
import * as THREE from 'three';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';
import { PlayerController } from './character/PlayerController.js';
import { TouchControls } from './ui/TouchControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }) // 遠くでも、近い面どうしがちらつかないように;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5ff);
scene.fog = new THREE.Fog(0x87c5ff, 160, 420);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a7a3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(60, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.01;
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 260 });
scene.add(sun);

const stage = createStage();
scene.add(stage.group);

const chars = [
  createCharacter({ name: 'P1', shirt: 0x1e88e5, pants: 0x2e3a4b, hair: 0x4a2c17, hairStyle: 'short', face: 'smile', sleeves: 'short' }),
  createCharacter({ name: 'P2', shirt: 0xe53935, pants: 0x3b2e2e, hair: 0x222222, hairStyle: 'spiky', face: 'smile', sleeves: 'short' }),
];
chars[0].group.position.set(-1, 0, 0);
chars[0].group.rotation.y = Math.PI / 2;
chars[1].group.position.set(1, 0, 0);
chars[1].group.rotation.y = -Math.PI / 2;
for (const c of chars) {
  scene.add(c.group); c.animator.play(c === chars[0] ? 'stand' : 'fight', 0);
  c.group.position.y = stage.groundY(c.group.position.x, c.group.position.z); // 足元を地面の高さに合わせる（広場は道路より 0.14 高い）
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 操作: WASD / 矢印 = 移動（カメラから見た向き）、Shift = 走る、Space = ジャンプ、V = 公園の近く⇔街の全景
//        ドラッグ = 視点、ホイール = 距離
const keys = new Set();
addEventListener('keydown', (e) => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); keys.add(e.code); if (e.code === 'KeyV') toggleOverview(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const view = { yaw: 0.6, pitch: 0.28, dist: 3.2, target: new THREE.Vector3(-1, 0.6, 0), overview: false };
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (!drag) drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  view.yaw -= (e.clientX - drag.x) * 0.006; view.pitch = Math.max(-0.1, Math.min(1.45, view.pitch + (e.clientY - drag.y) * 0.005));
  drag.x = e.clientX; drag.y = e.clientY;
});
addEventListener('wheel', (e) => { view.dist = Math.max(1.2, Math.min(260, view.dist * Math.exp(e.deltaY * 0.001))); }, { passive: true });
function toggleOverview() { view.overview = !view.overview; view.dist = view.overview ? 150 : 3.2; view.pitch = view.overview ? 0.75 : 0.28; }
window.__view = view;
window.__chars = chars;
window.__stage = stage;
window.__scene = scene;

const player = new PlayerController(chars[0], stage);
const touch = new TouchControls(); // スマホ: 左のスティック（倒し切ると走る）と、右下のジャンプボタン
window.__player = player;
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:12px;bottom:10px;color:#fff;font:13px/1.5 system-ui,sans-serif;text-shadow:0 1px 2px #0008;pointer-events:none';
hud.id = 'hud';
hud.textContent = 'WASD / 矢印: 移動　Shift: 走る　Space: ジャンプ（走りながらで大股ジャンプ）　ドラッグ: 視点　ホイール: 距離　V: 全景';
document.body.appendChild(hud);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  // 入力 → カメラから見た進行方向
  let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let rt = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (f === 0 && rt === 0) { f = touch.y; rt = touch.x; } // キーを押していなければスティック（倒した量で速さが変わる）
  const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  const mx = fx * f + -fz * rt, mz = fz * f + fx * rt;
  const ml = Math.hypot(mx, mz);
  player.update(dt, { x: ml > 0 ? mx / Math.max(1, ml) : 0, z: ml > 0 ? mz / Math.max(1, ml) : 0, run: keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run, jump: keys.has('Space') || touch.takeJump() });
  hud.style.display = touch.enabled ? 'none' : '';
  // 相手と体が重ならないように押し離す
  const a = chars[0].group.position, bpos = chars[1].group.position, ddx = a.x - bpos.x, ddz = a.z - bpos.z, dd = Math.hypot(ddx, ddz);
  if (dd < 0.45 && dd > 1e-5) { a.x = bpos.x + (ddx / dd) * 0.45; a.z = bpos.z + (ddz / dd) * 0.45; }
  for (const c of chars) c.update(dt);
  // カメラ: プレイヤーを追う（全景のときは街の中心）
  const tgt = view.overview ? new THREE.Vector3(0, 10, 0) : new THREE.Vector3(a.x, a.y * 0.5 + 0.6, a.z);
  view.target.lerp(tgt, 1 - Math.exp(-8 * dt));
  const cp = Math.cos(view.pitch);
  camera.position.set(view.target.x + Math.sin(view.yaw) * cp * view.dist, view.target.y + Math.sin(view.pitch) * view.dist, view.target.z + Math.cos(view.yaw) * cp * view.dist);
  camera.lookAt(view.target);
  renderer.render(scene, camera);
});
