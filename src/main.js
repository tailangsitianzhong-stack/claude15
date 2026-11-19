// マップ（ステージ）とキャラクターの「形」だけを表示する最小のビューア。操作・戦闘・通信などは含まない。
import * as THREE from 'three';
import { createStage } from './stage/Stage.js';
import { createCharacter } from './character/Character.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5ff);
scene.fog = new THREE.Fog(0x87c5ff, 160, 420);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 1000);

scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a7a3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(40, 70, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.01;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 });
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
for (const c of chars) { scene.add(c.group); c.animator.play('fight', 0); }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (const c of chars) c.update(dt);
  camera.position.set(Math.sin(t * 0.2) * 9, 3.5, Math.cos(t * 0.2) * 9); // ゆっくり周回して形を見せる
  camera.lookAt(0, 1.6, 0);
  renderer.render(scene, camera);
});
