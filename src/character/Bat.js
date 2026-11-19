import * as THREE from 'three';

// 木製バットと、野球ボール・鉄球のモデル。箱と円柱だけの低コスト版。
// バット: 柄を握る手の中心が原点、先端は +Z へ伸びる（剣と同じ向き）。
export const BAT = {
  gripStart: -0.38,   // 握りの端（グリップエンド）
  gripEnd: 0.55,
  taperEnd: 1.2,      // ここから太い部分（芯）
  length: 3.25,       // 先端まで
  hitFrom: 1.3,       // 当たり判定に使う範囲（芯の根元〜先端）
};

const WOOD = new THREE.Color(0xc98d4a);
const WOOD_DARK = new THREE.Color(0xa56e32);
const TAPE = new THREE.Color(0x242424);
const METAL = new THREE.Color(0xdde6f2);
const METAL_DARK = new THREE.Color(0x8b99ad);

function cyl(r0, r1, z0, z1, color, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1).rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  m.castShadow = true;
  return m;
}

export function createBat() {
  const bat = new THREE.Group();
  bat.name = 'Bat';
  const B = BAT;
  const knob = cyl(0.09, 0.115, B.gripStart - 0.06, B.gripStart + 0.04, WOOD_DARK);
  const grip = cyl(0.075, 0.075, B.gripStart, B.gripEnd, TAPE);            // グリップテープ
  const taper = cyl(0.075, 0.185, B.gripEnd, B.taperEnd, WOOD);             // だんだん太くなる
  const barrel = cyl(0.185, 0.205, B.taperEnd, B.length - 0.12, WOOD);      // 芯
  const cap = cyl(0.205, 0.17, B.length - 0.12, B.length, WOOD_DARK);       // 先端
  const parts = [
    { mesh: knob, wood: WOOD_DARK, metal: METAL_DARK },
    { mesh: grip, wood: TAPE, metal: new THREE.Color(0x5b6678) },
    { mesh: taper, wood: WOOD, metal: METAL },
    { mesh: barrel, wood: WOOD, metal: METAL },
    { mesh: cap, wood: WOOD_DARK, metal: METAL_DARK },
  ];
  for (const p of parts) bat.add(p.mesh);

  // 金属化の度合い（0 = 木, 1 = 金属）。切り替わる間はきらっと光る
  let metal = 0;
  let glow = 0;
  const apply = (time = 0) => {
    for (const p of parts) {
      const m = p.mesh.material;
      m.color.copy(p.wood).lerp(p.metal, metal);
      m.metalness = 0.9 * metal;
      m.roughness = 0.55 - 0.3 * metal;
      m.emissive.set(0xffffff).multiplyScalar(0);
      const e = glow * (0.55 + 0.45 * Math.sin(time * 30));
      m.emissive.copy(metal > 0.5 ? new THREE.Color(0x9fe0ff) : new THREE.Color(0xffa050)).multiplyScalar(e);
    }
  };
  bat.userData.setMetal = (k) => { metal = Math.min(1, Math.max(0, k)); apply(); };
  bat.userData.getMetal = () => metal;
  // 剣と同じ口 (Character が毎フレーム呼ぶ): 振っている間は、ほんのり温かく光る。金属のときは強めに光る
  bat.userData.setAura = (level, time) => {
    glow = level * (metal > 0.5 ? 0.75 : 0.28);
    apply(time);
  };
  bat.userData.base = new THREE.Vector3(0, 0, B.hitFrom);   // 当たり判定: 芯の根元
  bat.userData.tip = new THREE.Vector3(0, 0, B.length);     //            先端
  bat.userData.trailBase = new THREE.Vector3(0, 0, B.length * 0.55);
  bat.userData.bladeTip = bat.userData.tip.clone();
  bat.userData.isBat = true;
  return bat;
}

// ---- 野球ボール / 鉄球 ----
const ballGeo = new THREE.SphereGeometry(1, 14, 10);
const seamGeo = new THREE.TorusGeometry(0.78, 0.07, 6, 24);
export function createBall(kind = 'ball') {
  const g = new THREE.Group();
  if (kind === 'iron') {
    // 鉄球: 黒っぽい金属。ぴかっと光る帯
    const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0x3b4150, metalness: 0.9, roughness: 0.3 }));
    m.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 6, 24), new THREE.MeshStandardMaterial({ color: 0xaab6c8, metalness: 0.9, roughness: 0.25 }));
    g.add(m, band);
  } else {
    const white = kind === 'metal' ? 0xe8f4ff : 0xfafafa;
    const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: white, roughness: 0.5, emissive: kind === 'metal' ? 0x66ccff : 0x000000, emissiveIntensity: kind === 'metal' ? 0.9 : 0 }));
    m.castShadow = true;
    g.add(m);
    for (const rz of [0.5, -0.5]) { // 赤い縫い目
      const s = new THREE.Mesh(seamGeo, new THREE.MeshStandardMaterial({ color: 0xd9302a, roughness: 0.6 }));
      s.rotation.set(1.2, rz, 0.3);
      s.position.x = rz * 0.5;
      g.add(s);
    }
  }
  return g;
}
