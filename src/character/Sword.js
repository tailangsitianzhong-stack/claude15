import * as THREE from 'three';

// 西洋剣（片手で振れるロングソード）。箱と三角の切っ先だけで作る低コスト版。
// 柄を握る手の中心が原点、刃は +Z へ伸びる。刃の幅は Y、厚みは X。
export const SWORD = {
  bladeStart: 0.47,
  bladeLength: 2.55,
  tipLength: 0.42,
  bladeWidth: 0.27,
  bladeThick: 0.07,
};

// 斬撃のオーラ（刃を包む光）。end が攻撃の届く長さになる
export const AURA = { start: 0.25, end: 5.4, width: 0.95, color: 0x4fd8ff };

const COLORS = {
  blade: 0xdfe5ec,
  fuller: 0xaeb7c2,
  guard: 0xc9a23a,
  grip: 0x5a3a22,
  pommel: 0xc9a23a,
};

function part(geometry, color, glow = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  if (glow > 0) {
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = glow;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

// 切っ先: 刃と同じ厚みのまま、幅だけ先端へ向けてすぼまる三角柱
function tipGeometry(width, thick, length) {
  const w = width / 2;
  const t = thick / 2;
  const v = [
    [-t, -w, 0], [t, -w, 0], [t, w, 0], [-t, w, 0], // 根元の四角
    [-t, 0, length], [t, 0, length],                // 先端の辺
  ];
  const faces = [
    [0, 4, 3], [1, 2, 5],             // 左右の三角面
    [3, 4, 5], [3, 5, 2],             // 上の刃
    [0, 1, 5], [0, 5, 4],             // 下の刃
  ];
  const positions = [];
  for (const f of faces) for (const i of f) positions.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// 木の葉形（根元と先端がとがり、中ほどが膨らむ）の板。plane: 幅を取る軸 'x' | 'y'
function leafGeometry(z0, z1, width, plane) {
  const N = 14;
  const positions = [];
  const index = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // 根元寄りが一番太く、先端へ向けて細くなる
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.8);
    const z = z0 + (z1 - z0) * t;
    if (plane === 'y') positions.push(0, -w, z, 0, w, z); else positions.push(-w, 0, z, w, 0, z);
    if (i < N) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return g;
}

export function createSword() {
  const S = SWORD;
  const sword = new THREE.Group();
  sword.name = 'Sword';

  const blade = part(new THREE.BoxGeometry(S.bladeThick, S.bladeWidth, S.bladeLength), COLORS.blade, 0.25);
  blade.position.z = S.bladeStart + S.bladeLength / 2;

  const tip = part(tipGeometry(S.bladeWidth, S.bladeThick, S.tipLength), COLORS.blade, 0.25);
  tip.position.z = S.bladeStart + S.bladeLength;

  // 樋（刃の中央を走る溝）: 少しだけ厚い暗い帯として両面に見せる
  const fuller = part(new THREE.BoxGeometry(S.bladeThick + 0.016, S.bladeWidth * 0.3, S.bladeLength * 0.72), COLORS.fuller);
  fuller.position.z = S.bladeStart + S.bladeLength * 0.4;

  // 鍔（十字のガード）: 刃と同じ向きに長い棒 + 中央の厚み
  const guard = part(new THREE.BoxGeometry(0.17, 1.0, 0.14), COLORS.guard);
  guard.position.z = S.bladeStart - 0.07;
  const guardCore = part(new THREE.BoxGeometry(0.21, 0.36, 0.2), COLORS.guard);
  guardCore.position.z = S.bladeStart - 0.07;

  const grip = part(new THREE.BoxGeometry(0.13, 0.16, 0.66), COLORS.grip);
  grip.position.z = S.bladeStart - 0.14 - 0.33;

  const pommel = part(new THREE.BoxGeometry(0.22, 0.26, 0.2), COLORS.pommel);
  pommel.position.z = S.bladeStart - 0.14 - 0.66 - 0.08;

  sword.add(blade, tip, fuller, guard, guardCore, grip, pommel);

  // ---- 斬撃のオーラ: 攻撃中、刃を包んで剣より長く伸びる光の刃 ----
  const aura = new THREE.Group();
  aura.name = 'SwordAura';
  const outerMat = new THREE.MeshBasicMaterial({
    color: AURA.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const coreMat = outerMat.clone();
  coreMat.color.set(0xffffff);
  // 刃の面に沿った板と、それに直交する板を重ねて、どの角度からも厚みが見えるようにする
  const outerA = new THREE.Mesh(leafGeometry(AURA.start, AURA.end, AURA.width, 'y'), outerMat);
  const outerB = new THREE.Mesh(leafGeometry(AURA.start, AURA.end, AURA.width * 0.45, 'x'), outerMat);
  const coreA = new THREE.Mesh(leafGeometry(AURA.start, AURA.end - 0.25, AURA.width * 0.42, 'y'), coreMat);
  const coreB = new THREE.Mesh(leafGeometry(AURA.start, AURA.end - 0.25, AURA.width * 0.2, 'x'), coreMat);
  aura.add(outerA, outerB, coreA, coreB);
  aura.visible = false;
  sword.add(aura);

  // level: 0 = 消えている, 1 = 全開。time でゆらめかせる
  sword.userData.setAura = (level, time) => {
    aura.visible = level > 0.02;
    if (!aura.visible) return;
    const flicker = 1 + Math.sin(time * 47) * 0.06 + Math.sin(time * 31 + 1.7) * 0.05;
    aura.scale.set(flicker, (0.55 + 0.45 * level) * flicker, 0.35 + 0.65 * level);
    outerMat.opacity = 0.55 * level;
    coreMat.opacity = 0.85 * level;
  };

  // 当たり判定と軌跡に使う「刃」の根元と先端。先端はオーラの先まで（剣そのものより長い）
  sword.userData.base = new THREE.Vector3(0, 0, S.bladeStart + 0.25);
  sword.userData.tip = new THREE.Vector3(0, 0, AURA.end);
  sword.userData.trailBase = new THREE.Vector3(0, 0, AURA.end * 0.52); // 軌跡は外側半分だけ（細い弧にする）
  sword.userData.bladeTip = new THREE.Vector3(0, 0, S.bladeStart + S.bladeLength + S.tipLength);
  return sword;
}
