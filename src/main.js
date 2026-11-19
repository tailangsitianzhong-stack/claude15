// マップ（ステージ）とキャラクターの「形」だけを表示する最小のビューア。操作・戦闘・通信などは含まない。
import * as THREE from 'three';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';

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
  scene.add(c.group); c.animator.play('fight', 0);
  c.group.position.y = stage.groundY(c.group.position.x, c.group.position.z); // 足元を地面の高さに合わせる（広場は道路より 0.14 高い）
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 視点: ドラッグで回転、ホイールで距離、Space で「公園の近く」⇔「街の全景」
const view = { yaw: 0.6, pitch: 0.28, dist: 11, target: new THREE.Vector3(0, 1.2, 0), auto: true, overview: false };
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; view.auto = false; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  view.yaw -= (e.clientX - drag[0]) * 0.006; view.pitch = Math.max(0.03, Math.min(1.45, view.pitch + (e.clientY - drag[1]) * 0.005));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => { view.dist = Math.max(2, Math.min(260, view.dist * Math.exp(e.deltaY * 0.001))); view.auto = false; }, { passive: true });
addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  view.overview = !view.overview; view.dist = view.overview ? 150 : 11; view.pitch = view.overview ? 0.75 : 0.28; view.target.set(0, view.overview ? 10 : 1.2, 0); view.auto = false;
});
window.__view = view;
window.__chars = chars;
window.__stage = stage;
window.__scene = scene;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const c of chars) c.update(dt);
  if (view.auto) view.yaw += dt * 0.12;
  const cp = Math.cos(view.pitch);
  camera.position.set(view.target.x + Math.sin(view.yaw) * cp * view.dist, view.target.y + Math.sin(view.pitch) * view.dist, view.target.z + Math.cos(view.yaw) * cp * view.dist);
  camera.lookAt(view.target);
  renderer.render(scene, camera);
});
