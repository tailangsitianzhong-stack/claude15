import * as THREE from 'three';
import { faceTexture } from './face.js';
import { Animator } from './Animator.js';
import { RIG } from './rig.js';
import { createSword } from './Sword.js';
import { createBat } from './Bat.js';
import { createClaws, createFangs } from './Fang.js';
import { createFist, createArrowSticker, ARROW_COLORS } from './Arrow.js';
import { createChainsaw, createLegSaw, createHeadSaw, createGear } from './Chainsaw.js';
import { StatusEffects } from './StatusEffects.js';
import { SwordTrail } from '../effects/SwordTrail.js';

// ロブロックス風の低コストキャラ。全部ただの箱＋顔デカール1枚。
// キャラは +Z を向く。キャラ自身から見て左が +X、右が -X。

const DEFAULTS = {
  skin: 0xf4f4f4,
  shirt: 0x1e88e5,
  pants: 0x2e3a4b,
  shoes: 0x222222,
  hair: 0x4a2c17,
  hairStyle: 'short', // 'short' | 'spiky' | 'none'
  face: 'smile',      // 'smile' | 'angry'
  sleeves: 'short',   // 'short'（前腕が肌） | 'long'（手だけ肌）
  sword: true,        // 右手に剣を持つ
  great: false,       // 最初から両手剣を持つ（確認用。必殺技では途中で持ち替える）
  scale: 0.15,
};

const SKIN_GLOW = 0.3;

function box(w, h, d, color, glow = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  if (glow > 0) {
    // 白い肌が影側でグレーに沈まないよう、少しだけ自分で光らせる
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = glow;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  // 影は落とすが受けない: キャラが小さく、影の解像度では体の表面にノイズが出るため
  mesh.castShadow = true;
  return mesh;
}

// 関節 = 回転の中心になる空のグループ
function joint(parent, x, y, z, order = 'XYZ') {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  j.rotation.order = order;
  parent.add(j);
  return j;
}

// 上端 yTop から下端 yBottom までの箱を関節にぶら下げる
function hang(parentJoint, w, d, yTop, yBottom, color, z = 0, glow = 0) {
  const b = box(w, yTop - yBottom, d, color, glow);
  b.position.set(0, (yTop + yBottom) / 2, z);
  parentJoint.add(b);
  return b;
}

function buildHair(style, color) {
  const hair = new THREE.Group();
  if (style === 'none') return hair;
  const add = (w, h, d, x, y, z, rx = 0, rz = 0) => {
    const b = box(w, h, d, color);
    b.position.set(x, y, z);
    b.rotation.set(rx, 0, rz);
    hair.add(b);
  };
  // 1.2 立方の頭を基準にした配置（頭の中心が原点）。実際の頭サイズへは group を縮尺して合わせる。
  if (style === 'short') {
    add(1.32, 0.35, 1.32, 0, 0.62, 0);                // てっぺん
    add(1.32, 1.0, 0.25, 0, 0.15, -0.55);             // 後ろ髪
    add(0.22, 0.75, 1.2, -0.6, 0.28, -0.05);          // 横髪
    add(0.22, 0.75, 1.2, 0.6, 0.28, -0.05);
    add(0.9, 0.22, 0.2, -0.15, 0.42, 0.58, 0, -0.15); // 前髪
  } else if (style === 'spiky') {
    add(1.3, 0.3, 1.3, 0, 0.62, 0);
    add(1.3, 0.8, 0.22, 0, 0.25, -0.56);
    const spikes = [[-0.4, 0.4, 0.3], [0, 0, 0], [0.4, -0.4, -0.3], [-0.3, 0.1, -0.45], [0.35, 0.2, 0.4]];
    spikes.forEach(([x, z, tilt]) => add(0.4, 0.6, 0.4, x, 0.95, z, tilt * 0.6, -tilt));
  }
  return hair;
}

/**
 * キャラを作る。
 * 関節の親子関係:
 *   group ─ hips(骨盤) ┬ waist(腰) ┬ neck(首) ─ 頭
 *                      │           ├ lShoulder(肩) ─ lElbow(肘)
 *                      │           └ rShoulder     ─ rElbow
 *                      ├ lHip(股) ─ lKnee(膝) ─ lAnkle(足首)
 *                      └ rHip     ─ rKnee     ─ rAnkle
 *
 * 返り値:
 *  - group: シーンに追加するルート（足元が y=0）
 *  - joints: 上記の関節（Three.js の Group）
 *  - animator: ポーズ再生（animator.play('walk') など）
 *  - update(dt): 毎フレーム呼ぶ
 */
export function createCharacter(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const R = RIG;
  const ov = R.jointOverlap;
  const group = new THREE.Group();
  group.name = o.name ?? 'Character';
  group.scale.setScalar(o.scale);
  group.rotation.order = 'YXZ'; // 向き(Y)を決めてから前後に倒す(X)。倒れた姿勢に使う

  // ---- 骨盤 ----
  const hips = joint(group, 0, R.hipY, 0, 'YXZ');
  hang(hips, R.pelvis[0], R.pelvis[2], R.pelvis[1] - 0.1, -0.1, o.pants);

  // ---- 胸 ----
  const waist = joint(hips, 0, R.waistUp, 0, 'YXZ');
  hang(waist, R.chest[0], R.chest[2], R.chestTop, R.chestTop - R.chest[1], o.shirt);

  // ---- 頭 ----
  const neck = joint(waist, 0, R.chestTop, 0, 'YXZ');
  const skull = hang(neck, R.head, R.head, R.head, 0, o.skin, 0, SKIN_GLOW);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(R.head * 0.92, R.head * 0.92),
    new THREE.MeshStandardMaterial({ map: faceTexture(o.face), transparent: true, roughness: 0.6 }),
  );
  face.position.set(0, R.head / 2, R.head / 2 + 0.002); // 頭の正面に貼り付け
  neck.add(face);
  const hair = buildHair(o.hairStyle, o.hair);
  hair.position.y = R.head / 2;
  hair.scale.setScalar(R.head / 1.2);
  neck.add(hair);

  // ---- 気絶の星: 頭上をまわる黄色い星（気絶中だけ表示）----
  const stars = new THREE.Group();
  stars.visible = false;
  const starGeo = new THREE.BoxGeometry(0.5, 0.5, 0.12);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, fog: false });
  const starMeshes = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(starGeo, starMat);
    m.add(new THREE.Mesh(starGeo, starMat)); // 2枚を45度ずらして重ね、星形っぽく見せる
    m.children[0].rotation.z = Math.PI / 4;
    stars.add(m);
    starMeshes.push(m);
  }
  stars.position.y = R.head + 0.7;
  neck.add(stars);
  let starTime = 0;

  // ---- 腕（肩 → 肘）----
  const makeArm = (side) => {
    const x = side * (R.chest[0] / 2 + R.armW / 2 + 0.04);
    // 回転順 XZY: 腕のねじり(Y) → 開き(Z) → 前後の振り(X)
    const shoulder = joint(waist, x, R.chestTop - R.shoulderDrop, 0, 'XZY');
    hang(shoulder, R.armW, R.armW, R.shoulderDrop, R.shoulderDrop - R.upperArm, o.shirt);
    const elbow = joint(shoulder, 0, R.shoulderDrop - R.upperArm, 0);
    const w = R.armW * 0.95; // 親より少し細くして、重なった面のちらつきを防ぐ
    if (o.sleeves === 'long') hang(elbow, w, w, ov, -R.forearm, o.shirt);
    else hang(elbow, w, w, ov, -R.forearm, o.skin, 0, SKIN_GLOW);
    // 手首: 回転順 YXZ = 前腕のひねり(Y) → 手首の曲げ(X)
    const wrist = joint(elbow, 0, -R.forearm, 0, 'YXZ');
    hang(wrist, w, w, 0, -R.hand, o.skin, 0, SKIN_GLOW);
    return { shoulder, elbow, wrist };
  };
  const lArm = makeArm(1);
  const rArm = makeArm(-1);

  // ---- 脚（股 → 膝 → 足首）----
  const soles = []; // 接地判定に使う靴底の四隅
  const makeLeg = (side) => {
    const hip = joint(hips, side * R.legX, 0, 0, 'XZY');
    hang(hip, R.legW, R.legD, ov, -R.thigh, o.pants);
    const knee = joint(hip, 0, -R.thigh, 0);
    hang(knee, R.legW * 0.96, R.legD * 0.96, ov, -R.shin, o.pants);
    const ankle = joint(knee, 0, -R.shin, 0);
    hang(ankle, R.legW, R.footD, 0.08, -R.footH, o.shoes, R.footZ);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        soles.push({
          ankle,
          point: new THREE.Vector3((sx * R.legW) / 2, -R.footH, R.footZ + (sz * R.footD) / 2),
        });
      }
    }
    return { hip, knee, ankle };
  };
  const lLeg = makeLeg(1);
  const rLeg = makeLeg(-1);

  const joints = {
    hips, waist, neck,
    lShoulder: lArm.shoulder, lElbow: lArm.elbow,
    rShoulder: rArm.shoulder, rElbow: rArm.elbow, rWrist: rArm.wrist,
    lWrist: lArm.wrist,
    lHip: lLeg.hip, lKnee: lLeg.knee, lAnkle: lLeg.ankle,
    rHip: rLeg.hip, rKnee: rLeg.knee, rAnkle: rLeg.ankle,
  };

  // ---- 剣（右手に握らせる）----
  let sword = null;
  let trail = null;
  let dagger = null;   // 必殺技で左手から取り出す小剣
  let great = null;    // 必殺技で持つ両手剣
  let trailGreat = null;
  if (o.sword) {
    sword = createSword();
    sword.position.set(0, -R.hand / 2, 0);
    joints.rWrist.add(sword);
    trail = new SwordTrail(sword);

    dagger = createSword();
    dagger.scale.setScalar(0.55);
    dagger.position.set(0, -R.hand / 2, 0);
    dagger.visible = false;
    joints.lWrist.add(dagger);

    great = createSword();
    great.scale.set(1.45, 1.7, 2.15); // 刃は長く・太く。柄も長い
    great.position.set(0, -R.hand / 2, 0);
    great.visible = false;
    joints.rWrist.add(great);
    trailGreat = new SwordTrail(great);
  }
  // ---- バット（右手。武器選択でバットを選んだときだけ表示する）----
  let bat = null;
  let trailBat = null;
  let weaponId = 'sword';
  if (o.sword) {
    bat = createBat();
    bat.position.set(0, -R.hand / 2, 0);
    bat.visible = false;
    joints.rWrist.add(bat);
    trailBat = new SwordTrail(bat);
  }
  // ---- 吸血牙（両手の爪と、口の牙。武器選択で選んだときだけ表示する）----
  let claws = null;
  let clawsL = null;
  let fangs = null;
  let trailFang = null;
  if (o.sword) {
    claws = createClaws();
    claws.position.set(0, -R.hand / 2, 0);
    claws.visible = false;
    joints.rWrist.add(claws);
    trailFang = new SwordTrail(claws, [1, 0.12, 0.2]);
    clawsL = createClaws();
    clawsL.position.set(0, -R.hand / 2, 0);
    clawsL.visible = false;
    joints.lWrist.add(clawsL);
    fangs = createFangs(R.head);
    neck.add(fangs);
  }
  // ---- チェンソー（右手に1本。左手・脚・頭・足の歯車は、スキルと必殺技で生やす。武器選択で選んだときだけ使う）----
  let chainsaw = null;
  let trailSaw = null;
  let sawL = null;
  let legSawL = null;
  let legSawR = null;
  let headSaw = null;
  let gearL = null;
  let gearR = null;
  if (o.sword) {
    chainsaw = createChainsaw();
    chainsaw.position.set(0, -R.hand / 2, 0);
    chainsaw.visible = false;
    joints.rWrist.add(chainsaw);
    trailSaw = new SwordTrail(chainsaw, [1, 0.55, 0.15]);
    sawL = createChainsaw();
    sawL.position.set(0, -R.hand / 2, 0);
    sawL.visible = false;
    joints.lWrist.add(sawL);
    legSawL = createLegSaw(R); joints.lKnee.add(legSawL);
    legSawR = createLegSaw(R); joints.rKnee.add(legSawR);
    headSaw = createHeadSaw(R.head); neck.add(headSaw);
    gearL = createGear(1); joints.lAnkle.add(gearL);
    gearR = createGear(-1); joints.rAnkle.add(gearR);
  }
  // ---- 矢印（素手。右の前腕に加速の矢印、すねに上向きの矢印を貼る。武器選択で選んだときだけ使う）----
  let fist = null;
  let armSticker = null;
  const shinStickers = [];
  if (o.sword) {
    fist = createFist();
    joints.rWrist.add(fist);
    // 右の前腕の外側に、手の方向を向いた加速の矢印
    const outer = new THREE.Group();
    outer.position.set(-(R.armW * 0.95) / 2 - 0.04, -R.forearm / 2, 0);
    outer.rotation.y = -Math.PI / 2;
    armSticker = createArrowSticker(ARROW_COLORS.accel, { variant: 'double', scale: 0.52 });
    armSticker.rotation.z = Math.PI;
    armSticker.visible = false;
    outer.add(armSticker);
    joints.rElbow.add(outer);
    // すねの前に、上向きの矢印（左右）
    for (const kn of [joints.lKnee, joints.rKnee]) {
      const st = createArrowSticker(ARROW_COLORS.up, { scale: 0.34 });
      st.position.set(0, -R.shin / 2, R.legD * 0.96 / 2 + 0.04);
      st.visible = false;
      kn.add(st);
      shinStickers.push(st);
    }
  }
  // 今握っている武器（軌跡・オーラはこちらに付ける）
  let held = sword;
  let heldTrail = trail;
  // 装備の切り替え: 'normal'（片手剣） | 'great'（両手剣） | 'none'
  const equip = (kind) => {
    if (!sword) return;
    sword.visible = kind === 'normal';
    great.visible = kind === 'great';
    held = kind === 'great' ? great : kind === 'normal' ? sword : null;
    heldTrail = kind === 'great' ? trailGreat : kind === 'normal' ? trail : null;
  };
  if (o.great) equip('great');
  // 武器の切り替え: 'sword' | 'bat'
  const setWeapon = (id) => {
    if (!sword) return;
    weaponId = id;
    sword.visible = id === 'sword';
    bat.visible = id === 'bat';
    claws.visible = clawsL.visible = fangs.visible = id === 'fang';
    great.visible = false;
    chainsaw.visible = id === 'saw';
    sawL.visible = legSawL.visible = legSawR.visible = headSaw.visible = gearL.visible = gearR.visible = false; // 生やすものは、スキルのときだけ
    held = id === 'bat' ? bat : id === 'fang' ? claws : id === 'saw' ? chainsaw : id === 'arrow' || id === 'onom' ? fist : sword;
    heldTrail = id === 'bat' ? trailBat : id === 'fang' ? trailFang : id === 'saw' ? trailSaw : id === 'arrow' || id === 'onom' ? null : trail;
    animator.armed = id === 'bat' ? 'bat' : id === 'fang' ? 'fang' : id === 'saw' ? 'saw' : id === 'arrow' ? 'arrow' : id === 'onom' ? 'onom' : 'sword';
  };

  const animator = new Animator({ group, joints, soles, scale: o.scale, armed: sword ? 'sword' : false });

  // 状態異常: 付いた・切れたときの見た目の切り替え
  const status = new StatusEffects();
  status.onChange((name, on) => { if (name === 'stun') stars.visible = on; });

  // 被弾時などに全身を白く光らせる（0 = 通常, 1 = 真っ白）
  const materials = [];
  group.traverse((obj) => {
    if (obj.isMesh && obj.material.emissive) {
      const m = obj.material;
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
      materials.push(m);
    }
  });
  const WHITE = new THREE.Color(0xffffff);
  // 全身に色をまとわせる（吸血牙の凶暴化: 赤く光る）。k = 0 で元に戻る
  const tintColor = new THREE.Color();
  const setTint = (color, k) => {
    tintColor.set(color);
    for (const m of materials) {
      if (k <= 0) { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseIntensity; continue; }
      m.emissive.copy(m.userData.baseEmissive).lerp(tintColor, k);
      m.emissiveIntensity = Math.max(m.userData.baseIntensity, 0.1 + 0.28 * k);
    }
  };
  const setFlash = (k) => {
    for (const m of materials) {
      m.emissive.copy(m.userData.baseEmissive).lerp(WHITE, k);
      m.emissiveIntensity = m.userData.baseIntensity + (1 - m.userData.baseIntensity) * k;
    }
  };

  // 剣を振っている間は 1 フレームを細かく刻んで姿勢を進める。
  // 軌跡がなめらかな弧になり、速い振りでも当たり判定（onSubstep）が刃の通り道を取りこぼさない
  let lastAttackT = 0;
  let auraLevel = 0;
  let auraTime = 0;
  const update = (dt, onSubstep) => {
    if (heldTrail && animator.trailOn && !animator.debug) {
      const SUB = 5;
      // 攻撃の進み具合も、前フレームの値から今フレームの値まで等分して進める
      const t1 = animator.attackT;
      const t0 = lastAttackT <= t1 ? lastAttackT : 0; // 次の攻撃に切り替わった直後は 0 から
      for (let i = 0; i < SUB; i++) {
        animator.attackT = t0 + ((t1 - t0) * (i + 1)) / SUB;
        animator.update(dt / SUB);
        group.updateWorldMatrix(true, true);
        heldTrail.sample();
        if (onSubstep) onSubstep();
      }
    } else {
      animator.update(dt);
      if (onSubstep) onSubstep();
    }
    lastAttackT = animator.attackT;
    if (trail) trail.update(dt);
    if (trailGreat) trailGreat.update(dt);
    if (trailBat) trailBat.update(dt);
    if (trailFang) trailFang.update(dt);
    if (trailSaw) trailSaw.update(dt);
    if (stars.visible) {
      starTime += dt;
      starMeshes.forEach((m, i) => {
        const a = starTime * 4.2 + (i / starMeshes.length) * Math.PI * 2;
        m.position.set(Math.cos(a) * 1.25, Math.sin(starTime * 7 + i * 1.7) * 0.12, Math.sin(a) * 1.25);
        m.rotation.y = -a; // 進行方向に正面を向ける
        m.rotation.z = starTime * 5 + i;
        m.scale.setScalar(0.85 + 0.25 * Math.sin(starTime * 9 + i * 2));
      });
    }
    if (held) {
      // 斬撃のオーラ: 振りかぶりで灯り、斬っている間は全開、終わるとすっと消える
      const want = animator.trailOn ? 1 : animator.name === 'batCall' ? 0.9 : animator.name === 'fangRaise' ? 0.9 : animator.name === 'chargeStance' ? 0.2 + 0.4 * animator.attackT : animator.name === 'stabCharge' ? 0.55 + 0.45 * animator.attackT : animator.name === 'ultDash' || animator.name === 'ultWindup' || animator.name === 'ultLeap' ? 1 : animator.name === 'ultSummon' ? 0.3 + 0.7 * animator.attackT : animator.name === 'airSlam' || animator.name === 'throw' || animator.name === 'groundStab' ? 0.8 : animator.name.startsWith('attack') && animator.attackT < 0.75 ? 0.5 : 0;
      auraLevel += (want - auraLevel) * (1 - Math.exp(-(want > auraLevel ? 30 : 9) * dt));
      auraTime += dt;
      held.userData.setAura(animator.debug ? (animator.debug.aura ?? 0) : auraLevel, auraTime);
    }
  };


  return {
    group,
    joints,
    animator,
    scale: o.scale,
    height: (R.hipY + R.waistUp + R.chestTop + R.head) * o.scale,
    update,
    status,
    get sword() { return held; },        // 今握っている武器（剣またはバット）。コントローラや当たり判定はこれを見る
    get weapon() { return weaponId; },
    swordModel: sword,
    bat,
    fist,
    armSticker,
    shinStickers,
    claws,
    clawsL,
    fangs,
    chainsaw, trailSaw, sawL, legSawL, legSawR, headSaw, gearL, gearR,
    trailFang,
    setTint,
    trail,
    trailBat,
    setWeapon,
    dagger,
    great,
    trailGreat,
    equip,
    setFlash,
    parts: { skull, face, hair },
  };
}
