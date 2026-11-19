import * as THREE from 'three';

// 「チェンソー」のモデル。箱だけの低コスト版。握りが原点、刃（ガイドバー）は +Z へ伸びる（剣・バット・爪と同じ向き）。
// 右手のチェンソーが「武器」（当たり判定・軌跡）。左手・脚・頭・足の歯車は、スキルと必殺技で生やす。
export const SAW = {
  length: 4.2,     // 全長（リグ単位）
  hitFrom: 0.9,    // 当たり判定: 本体のすぐ前〜先端
};

const ORANGE = 0xe8590c;
const GREY = 0x9aa3ad;
const DARK = 0x1c1f24;

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...o });

// 刃の縁を回る歯（縞模様。回転は、テクスチャをずらして見せる）
function chainTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#14171b'; g.fillRect(0, 0, 128, 16);
  g.fillStyle = '#c9d1d9';
  for (let i = 0; i < 8; i++) g.fillRect(i * 16 + 3, 3, 8, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.4, 1);
  return t;
}

export function createChainsaw(size = 1) {
  const g = new THREE.Group();
  g.name = 'Chainsaw';
  const inner = new THREE.Group(); // エンジンのふるえ（まわりの動きは変えず、これだけ揺らす）
  g.add(inner);
  // 本体（オレンジ）
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 1.5), mat(ORANGE));
  body.position.set(0, 0.05, 0.35);
  body.castShadow = true;
  inner.add(body);
  // 後ろのハンドル（握り）と、上の持ち手
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.9), mat(DARK));
  rear.position.set(0, 0.28, -0.45);
  inner.add(rear);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 1.1), mat(DARK));
  top.position.set(0, 0.62, 0.3);
  inner.add(top);
  // 引き紐の持ち手（後ろ）
  const cord = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), mat(0xd9d9d9));
  cord.position.set(0.5, 0.05, -0.1);
  inner.add(cord);
  // ガイドバー（銀色の板）と、回る歯
  const barLen = SAW.length - 1.1;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, barLen), mat(GREY, { metalness: 0.5 }));
  bar.position.set(0, 0, 1.1 + barLen / 2);
  bar.castShadow = true;
  inner.add(bar);
  const tex = chainTexture();
  const chainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.5, metalness: 0.4 });
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.74, barLen + 0.05), chainMat);
  chain.position.copy(bar.position);
  inner.add(chain);
  g.scale.setScalar(size);

  let rev = 0;      // エンジンのかかり具合（0〜1。引き紐を引くと上がり、しばらくして落ちる）
  let phase = 0;
  const apply = (level, time) => {
    const run = Math.max(level, rev);
    phase += run * 0.35;
    tex.offset.x = -phase;
    const sh = 0.03 * run;
    inner.position.set(sh * Math.sin(time * 90), sh * Math.cos(time * 77), 0);
  };
  // 剣と同じ口（Character が毎フレーム呼ぶ）: 振っている間は、歯が回って、ふるえる
  g.userData.setAura = (level, time) => apply(level, time);
  g.userData.setRev = (k) => { rev = Math.min(1, Math.max(0, k)); };
  g.userData.getRev = () => rev;
  g.userData.base = new THREE.Vector3(0, 0, SAW.hitFrom * size);
  g.userData.tip = new THREE.Vector3(0, 0, SAW.length * size);
  g.userData.trailBase = new THREE.Vector3(0, 0, 1.2 * size);
  g.userData.bladeTip = g.userData.tip.clone();
  g.userData.isSaw = true;
  g.userData.tick = (time) => apply(0, time);
  return g;
}

// 小型ナイフ（スキル1で投げる）: 世界に置いて飛ばす
export function createKnife() {
  const g = new THREE.Group();
  g.name = 'Knife';
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.9), mat(0xdfe6ee, { metalness: 0.7, roughness: 0.25 }));
  blade.position.z = 0.55;
  blade.castShadow = true;
  g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4).rotateX(Math.PI / 2).scale(0.3, 1, 1), mat(0xdfe6ee, { metalness: 0.7, roughness: 0.25 }));
  tip.position.z = 1.15;
  g.add(tip);
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), mat(0x2a1a12));
  hilt.position.z = -0.1;
  g.add(hilt);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.08), mat(0xc9a021));
  guard.position.z = 0.15;
  g.add(guard);
  return g;
}

// 引き金（必殺技）: チェンソーの引き紐の持ち手と、赤いトリガー。相手に投げつけて持たせる
export function createTrigger() {
  const g = new THREE.Group();
  g.name = 'SawTrigger';
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), mat(0xd9d9d9));
  grip.castShadow = true;
  g.add(grip);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), mat(0xe0182c, { emissive: 0x500008, emissiveIntensity: 0.6 }));
  knob.position.y = -0.5;
  g.add(knob);
  const cordMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat(0x222222));
  cordMesh.position.y = 1.2;
  g.add(cordMesh);
  g.userData.setGlow = (k, time = 0) => { knob.material.emissiveIntensity = 0.6 + 2.2 * k * (0.7 + 0.3 * Math.sin(time * 26)); };
  return g;
}

// 脚に生やすチェンソー: すねの前側に、つま先のほうへ向けて付ける（knee の子として使う）
export function createLegSaw(R) {
  const g = new THREE.Group();
  g.name = 'LegSaw';
  const s = createChainsaw(0.62);
  s.rotation.x = Math.PI / 2; // +Z → 下向き（すねに沿って、つま先のほうへ）
  s.position.set(0, -R.shin * 0.12, R.legD / 2 + 0.35);
  g.add(s);
  g.userData.saw = s;
  g.visible = false;
  return g;
}

// 頭に生やすチェンソー（上向き）
export function createHeadSaw(head) {
  const g = new THREE.Group();
  g.name = 'HeadSaw';
  const s = createChainsaw(0.62);
  s.rotation.x = -Math.PI / 2; // +Z → 上向き
  s.position.set(0, head * 0.5, 0);
  g.add(s);
  g.userData.saw = s;
  g.visible = false;
  return g;
}

// 足の歯車（スキル4）: 足首の横で、くるくる回る丸ノコ
export function createGear(side = 1) {
  const g = new THREE.Group();
  g.name = 'SawGear';
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 14).rotateZ(Math.PI / 2), mat(GREY, { metalness: 0.6 }));
  disc.castShadow = true;
  g.add(disc);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.2), mat(ORANGE));
    t.position.set(0, Math.cos(a) * 0.68, Math.sin(a) * 0.68);
    t.rotation.x = -a;
    g.add(t);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 8).rotateZ(Math.PI / 2), mat(DARK));
  g.add(hub);
  g.position.x = side * 0.62;
  g.visible = false;
  return g;
}
