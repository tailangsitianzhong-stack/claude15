import * as THREE from 'three';

// 「矢印」の武器: 素手に、矢印のステッカーを貼って戦う。ここは、そのステッカーと、素手の当たり判定用のオブジェクト。
// 矢印は XY 平面に描いて、先が +Y を向く（法線は +Z）。置く向きは使う側で決める。

// 矢印の形（長さ 2、幅 1.3）。variant: 'single' | 'double'（加速: 頭が2つ）| 'cannon'（砲弾: 太い）
export function arrowShape(variant = 'single') {
  const sh = new THREE.Shape();
  if (variant === 'double') { // 山形（>）を2つ重ねた形。加速
    const s2 = new THREE.Shape();
    s2.moveTo(0, 1.0); s2.lineTo(0.7, 0.2); s2.lineTo(0.7, -0.25); s2.lineTo(0, 0.55); s2.lineTo(-0.7, -0.25); s2.lineTo(-0.7, 0.2); s2.closePath();
    return s2;
  }
  const w = variant === 'cannon' ? 0.42 : 0.22;
  const hw = variant === 'cannon' ? 0.9 : 0.65;
  sh.moveTo(-w, -1.0); sh.lineTo(w, -1.0); sh.lineTo(w, 0.1); sh.lineTo(hw, 0.1); sh.lineTo(0, 1.0); sh.lineTo(-hw, 0.1); sh.lineTo(-w, 0.1); sh.closePath();
  return sh;
}

const shapeGeos = {};
const geoFor = (variant) => (shapeGeos[variant] ??= new THREE.ShapeGeometry(arrowShape(variant)));

// ステッカー: 色つきの矢印に、白いふちどり。
// 加速（double）は、さらに矢印を2枚重ねて「>>」のように見せる
export function createArrowSticker(color = 0xffc21a, { variant = 'single', scale = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'ArrowSticker';
  const outline = new THREE.Mesh(geoFor(variant), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false }));
  outline.scale.set(1.3, 1.17, 1);
  outline.position.z = -0.004;
  const fill = new THREE.Mesh(geoFor(variant), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false }));
  g.add(outline, fill);
  if (variant === 'double') { // もう1つ上に、小さく
    const f2 = new THREE.Mesh(geoFor('double'), fill.material);
    f2.position.set(0, 0.55, 0.004); f2.scale.setScalar(0.8);
    g.add(f2);
  }
  g.scale.setScalar(scale);
  const base = new THREE.Color(color);
  const white = new THREE.Color(0xffffff);
  g.userData.baseScale = scale;
  g.userData.setGlow = (k, time = 0) => {
    fill.material.color.copy(base).lerp(white, 0.55 * k * (0.6 + 0.4 * Math.sin(time * 26)));
    g.scale.setScalar(scale * (1 + 0.12 * k * Math.sin(time * 18)));
  };
  g.userData.setOpacity = (a) => { outline.material.opacity = a; fill.material.opacity = a; };
  g.userData.color = color;
  return g;
}

// 素手の当たり判定用。右手に付ける（見えない）。攻撃の当たりは、ほとんど「相手が正面の近くにいるか」で決める
export function createFist() {
  const g = new THREE.Group();
  g.name = 'Fist';
  g.userData.base = new THREE.Vector3(0, 0, 0.2);
  g.userData.tip = new THREE.Vector3(0, 0, 1.4);
  g.userData.setAura = () => {};
  g.visible = false;
  return g;
}

// ステッカーの色
export const ARROW_COLORS = {
  accel: 0xffc21a,   // 加速: 黄
  cannon: 0xff5a1f,  // 砲弾: 橙赤
  up: 0x3dff7a,      // 上向き: 緑
  down: 0xb04cff,    // 下向き: 紫
  slow: 0x4ca8ff,    // 鈍足: 青
  pull: 0xff3fd0,    // 引き寄せ: 赤紫
  forward: 0x3ff0ff, // 前向き: 水色
};

// 立体の矢印（厚みのある矢印）。砲弾・頭の上の前向き矢印・地面から立つ上向き矢印に使う。
// pointing: 'z'（先が +Z）| 'y'（先が +Y）。scale: 長さの半分（ワールド単位）
export function createArrow3D(color = 0xff5a1f, { variant = 'single', depth = 0.5, scale = 1, pointing = 'z', emissive = 0.9 } = {}) {
  const geo = new THREE.ExtrudeGeometry(arrowShape(variant), { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  if (pointing === 'z') geo.rotateX(Math.PI / 2); // +Y → +Z（先が前を向く。厚みは上下方向）
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.4, metalness: 0.1 }));
  m.scale.setScalar(scale);
  m.castShadow = false;
  m.userData.setGlow = (k, time = 0) => { m.material.emissiveIntensity = emissive * (0.7 + 0.6 * k * (0.7 + 0.3 * Math.sin(time * 24))); };
  return m;
}
