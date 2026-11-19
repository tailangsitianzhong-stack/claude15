import * as THREE from 'three';

// 「吸血牙」のモデル: 両手の爪、口の牙、必殺技の赤い宝石。箱と円錐だけの低コスト版。
// 爪: 握りの中心が原点、先は +Z へ伸びる（剣・バットと同じ向き）。右手の爪が「武器」（当たり判定・軌跡）。
export const CLAW = {
  length: 2.6,     // 爪の長さ（リグ単位）
  aura: 7.2,       // 斬撃のオーラの長さ（爪の先から、さらに前へ）。攻撃の当たり判定も、ここまで伸びる
  hitFrom: 0.5,    // 当たり判定: 根元〜先端
};

const BONE = new THREE.Color(0xf1e8d8);
const BONE_DARK = new THREE.Color(0xb8a98f);
const BLOOD = new THREE.Color(0xe0182c);
const GLOVE = new THREE.Color(0x2a1018);

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.45 });

export function createClaws(size = 1) {
  const g = new THREE.Group();
  g.name = 'Claws';
  // 拳をおおう黒い手甲
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.4, 0.5), mat(GLOVE));
  glove.position.set(0, 0, 0.12);
  glove.castShadow = true;
  g.add(glove);
  // 3本の爪（細い四角錐を前へ。少しずつ内側に反る）
  const claws = [];
  for (const [x, len, yaw] of [[-0.22, 0.88, 0.07], [0, 1.0, 0], [0.22, 0.88, -0.07]]) {
    const L = CLAW.length * len;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, L, 4).rotateX(Math.PI / 2).translate(0, 0, L / 2), mat(BONE));
    cone.position.set(x, 0, 0.32);
    cone.rotation.y = yaw;
    cone.castShadow = true;
    g.add(cone);
    claws.push(cone);
  }
  // 斬撃のオーラ: 爪の先から長くのびる赤い光の刃（攻撃中だけ光る）
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xff2a44, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const auraMesh = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.42, 0.14, 1), auraMat);
  const AL = CLAW.length + CLAW.aura;
  auraMesh.scale.set(1, 1, (AL - 0.6) / 2);
  auraMesh.position.z = 0.6 + (AL - 0.6) / 2;
  auraMesh.visible = false;
  g.add(auraMesh);
  g.scale.setScalar(size);

  let red = 0;
  let glow = 0;
  const apply = (time = 0) => {
    for (const c of claws) {
      const m = c.material;
      m.color.copy(BONE).lerp(BLOOD, red);
      const e = (glow + red * 0.8) * (0.7 + 0.3 * Math.sin(time * 28));
      m.emissive.set(0xff1030).multiplyScalar(Math.min(1, e));
    }
  };
  g.userData.setRed = (k) => { red = Math.min(1, Math.max(0, k)); apply(); };
  g.userData.getRed = () => red;
  // 剣と同じ口 (Character が毎フレーム呼ぶ): 振っている間は、爪が赤く光る
  g.userData.setAura = (level, time) => {
    glow = level * 0.6;
    apply(time);
    auraMesh.visible = level > 0.04;
    auraMat.opacity = Math.min(0.75, level * 0.75) * (0.8 + 0.2 * Math.sin(time * 40));
  };
  g.userData.base = new THREE.Vector3(0, 0, CLAW.hitFrom * size);
  g.userData.tip = new THREE.Vector3(0, 0, (CLAW.length + CLAW.aura) * size);
  g.userData.trailBase = new THREE.Vector3(0, 0, CLAW.length * size);
  g.userData.bladeTip = g.userData.tip.clone();
  g.userData.isClaws = true;
  return g;
}

// 口の牙: 顔の口もとに2本。neck の子として付ける（頭の寸法 head を渡す）
export function createFangs(head) {
  const g = new THREE.Group();
  g.name = 'Fangs';
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(head * 0.05, head * 0.16, 4).rotateX(Math.PI), mat(0xffffff));
    f.position.set(sx * head * 0.115, head * 0.235, head / 2 + head * 0.012);
    g.add(f);
  }
  g.visible = false;
  return g;
}

// 赤い宝石（必殺技）: 八面体。光り具合 setGlow(0〜1)
export function createGem() {
  const g = new THREE.Group();
  g.name = 'RedGem';
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.7, 1, 0.7), new THREE.MeshStandardMaterial({ color: 0xc8001e, roughness: 0.2, metalness: 0.2, emissive: 0xff0a28, emissiveIntensity: 0.9, flatShading: true }));
  m.castShadow = true;
  g.add(m);
  g.userData.setGlow = (k, time = 0) => {
    m.material.emissiveIntensity = 0.7 + 2.6 * k * (0.75 + 0.25 * Math.sin(time * 24));
    m.scale.setScalar(1 + 0.25 * k);
  };
  // 【メモ】ここに PointLight は置かない。光源の数が変わると、画面のすべての物のシェーダーが作り直されて、一瞬止まるため
  g.userData.setGlow(0);
  return g;
}
