// ポーズ定義。各関数は「その瞬間の全関節の角度」を pose オブジェクトに書き込む。
//
// 角度の向き（ラジアン、左右共通の「体の動き」として書く）:
//   xxxSwing  : 前へ振る +          xxxOut   : 体の外側へ開く +
//   xxxTwist  : 腕=内側へねじる + / 脚=つま先を外へ +
//   Elbow/Knee: 曲げる +            Ankle    : つま先を上げる +
//   Flat      : 1 で靴底を地面と平行に保つ（接地中）、0 でスネに従う
//   hips/waist/neck Pitch: 前に倒す + / Yaw: 上から見て反時計回り + / Roll: 左側を上げる +
//   ground    : 1 で足が地面に着くよう腰の高さを自動調整、0 で空中
//   swordTilt : 剣先を腕の延長線の方へ倒す +（0 で前腕と直角、π/2 で一直線）
//   swordTwist: 前腕をひねって刃の向きを変える
//   lift      : 接地位置からさらに持ち上げる量（走りの滞空）
//   hipsFree  : 空中での腰の高さの補正

const { sin, cos, PI, max, min, abs } = Math;

const LIMB = [
  'ShoulderSwing', 'ShoulderOut', 'ShoulderTwist', 'Elbow',
  'HipSwing', 'HipOut', 'HipTwist', 'Knee', 'Ankle', 'Flat',
];
export const FIELDS = [
  'hipsX', 'hipsZ', 'hipsFree', 'lift', 'ground',
  'hipsPitch', 'hipsYaw', 'hipsRoll',
  'waistPitch', 'waistYaw', 'waistRoll',
  'neckPitch', 'neckYaw', 'neckRoll',
  'swordTilt', 'swordTwist', 'swordRoll',
  'daggerTilt',
  ...LIMB.map((f) => 'l' + f),
  ...LIMB.map((f) => 'r' + f),
];

export function makePose() {
  const p = {};
  for (const f of FIELDS) p[f] = 0;
  p.ground = 1;
  return p;
}

export function resetPose(p) {
  for (const f of FIELDS) p[f] = 0;
  p.ground = 1;
  return p;
}

export function lerpPose(out, a, b, t) {
  for (const f of FIELDS) out[f] = a[f] + (b[f] - a[f]) * t;
  return out;
}

export function copyPose(out, a) {
  for (const f of FIELDS) out[f] = a[f];
  return out;
}

// ---- 波形の部品 ----
const wrap = (x) => x - 2 * PI * Math.round(x / (2 * PI)); // [-π, π]
const clamp01 = (x) => min(1, max(0, x));
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
// center を頂点に、±half でゼロになるなめらかな山
const lobe = (x, center, half) => {
  const t = min(1, abs(wrap(x - center)) / half);
  return 0.5 + 0.5 * cos(PI * t);
};
// center ± half の区間で 1、端は soft の幅でなめらかに 0 へ
const plateau = (x, center, half, soft) => 1 - smooth((abs(wrap(x - center)) - (half - soft)) / soft);

// 左脚は位相そのまま、右脚は半周期ずらす
const SIDES = [['l', 0], ['r', PI]];

// ============================================================
// 立ちポーズ: 力を抜いた自然な直立。呼吸・重心のゆっくりした移動・視線の動き
// ============================================================
function stand(ctx, o) {
  const t = ctx.time;
  const breath = sin(t * 1.6);        // 呼吸（約4秒周期）
  const sway = sin(t * 0.55);         // 左右への体重移動（約11秒周期）
  const drift = sin(t * 0.37) * 0.7 + sin(t * 0.83 + 1.3) * 0.3;

  o.hipsX = 0.05 * sway;
  o.hipsRoll = -0.02 * sway;
  o.waistRoll = 0.028 * sway;
  o.neckRoll = -0.012 * sway;
  o.hipsPitch = 0.01;
  o.waistPitch = 0.025 + 0.014 * breath;
  o.neckPitch = -0.03 - 0.012 * breath;
  o.neckYaw = 0.13 * drift;
  o.waistYaw = 0.025 * drift;

  for (const [k, off] of SIDES) {
    const sign = off === 0 ? 1 : -1;
    o[k + 'ShoulderOut'] = 0.07 + 0.014 * breath;
    o[k + 'ShoulderSwing'] = 0.03 + 0.02 * sway * sign;
    o[k + 'ShoulderTwist'] = 0.2;
    o[k + 'Elbow'] = 0.16 + 0.025 * breath;
    o[k + 'HipOut'] = 0.055;
    o[k + 'HipTwist'] = 0.12;
    o[k + 'HipSwing'] = 0.03;
    o[k + 'Knee'] = 0.05 + 0.02 * breath + 0.03 * max(0, -sway * sign); // 体重が乗っていない側の膝が少し緩む
    o[k + 'Flat'] = 1;
  }
}

// ============================================================
// 構えポーズ: 左足・左手が前のオーソドックス。小さく弾むステップ
// ============================================================
function fight(ctx, o) {
  const t = ctx.time;
  const bounce = sin(t * 5.2);
  const slow = sin(t * 2.6);

  o.hipsYaw = -0.52;                 // 体を半身に
  o.waistYaw = -0.12;
  o.neckYaw = 0.6;                   // 顔は相手へ
  o.hipsPitch = 0.04;
  o.waistPitch = 0.17 + 0.02 * slow;
  o.neckPitch = 0.02;
  o.hipsX = 0.03 * slow;

  // 前足（左）: つま先を相手へ。後足（右）: かかとを浮かせる
  o.lHipSwing = 0.3;
  o.lHipOut = 0.2;
  o.lHipTwist = 0.42;
  o.lKnee = 0.42 + 0.07 * bounce;
  o.lFlat = 1;
  o.rHipSwing = -0.12;
  o.rHipOut = 0.24;
  o.rHipTwist = 0.05;
  o.rKnee = 0.55 + 0.07 * bounce;
  o.rFlat = 0.45;

  // 前手（左）: あごの前に出す。後手（右）: あごの横に引きつける
  o.lShoulderSwing = 1.0 + 0.04 * bounce;
  o.lShoulderOut = 0.18;
  o.lShoulderTwist = 0.5;
  o.lElbow = 1.75 - 0.05 * bounce;
  o.rShoulderSwing = 0.5 - 0.03 * bounce;
  o.rShoulderOut = 0.22;
  o.rShoulderTwist = 0.75;
  o.rElbow = 2.2 + 0.04 * bounce;
}

// ============================================================
// 歩き: 1周期 = 左右1歩ずつ。位相0で左脚が体の真下を前へ通過
// ============================================================
function walk(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  const cL = cos(p);

  for (const [k, off] of SIDES) {
    const q = p + off;
    const s = sin(q);
    // 脚: 股関節を前後に振り、遊脚（前へ運ぶ間）は膝を曲げて足を浮かせる
    o[k + 'HipSwing'] = 0.04 + 0.5 * s;
    o[k + 'Knee'] = 0.06
      + 1.05 * lobe(q, -0.75, 1.75)  // 蹴り出しから遊脚にかけての膝曲げ
      + 0.14 * lobe(q, 2.3, 0.8);    // かかと着地直後の衝撃吸収
    // 立脚中は靴底を地面に。着地はかかとから、蹴り出しはつま先で。遊脚の途中はつま先を引き上げて地面を擦らない
    o[k + 'Flat'] = max(plateau(q, 2.85, 1.75, 1.1), 0.8 * lobe(q, 0.2, 1.5));
    o[k + 'HipOut'] = 0.03;
    o[k + 'HipTwist'] = 0.06;
    // 腕: 反対の脚と一緒に前へ。前に出るとき肘が曲がる
    const a = -s;
    o[k + 'ShoulderSwing'] = 0.04 + 0.46 * a;
    o[k + 'Elbow'] = 0.3 + 0.26 * a;
    o[k + 'ShoulderOut'] = 0.06;
    o[k + 'ShoulderTwist'] = 0.2;
  }

  // 骨盤は前に出る脚の側が前へ回り、胸は逆へねじれる。頭は正面を保つ
  o.hipsYaw = -0.1 * sL;
  o.waistYaw = 0.23 * sL;
  o.neckYaw = -(o.hipsYaw + o.waistYaw) * 0.85;
  // 遊脚側の骨盤が少し下がり、体重は立脚側へ寄る
  o.hipsRoll = -0.04 * cL;
  o.waistRoll = 0.055 * cL;
  o.hipsX = -0.06 * cL;
  o.hipsPitch = 0.03;
  o.waistPitch = 0.05 + 0.015 * cos(2 * p);
  o.neckPitch = -0.06;
}

// ============================================================
// 走り: 前傾、大きな腕振り、蹴り上げた足を畳んで前へ運ぶ。両足が浮く滞空あり
// ============================================================
function run(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  const cL = cos(p);

  for (const [k, off] of SIDES) {
    const q = p + off;
    const s = sin(q);
    o[k + 'HipSwing'] = 0.28 + 0.85 * s; // もも上げは高く、後ろへの蹴りは控えめ
    o[k + 'Knee'] = 0.32
      + 1.3 * lobe(q, -0.55, 1.45)   // 蹴った後、かかとを尻へ引きつける
      + 0.55 * lobe(q, 0.85, 1.2);   // もも上げ中もスネは畳んだまま
    // 接地は体の真下で短く。前へ運ぶ間はつま先を引き上げて地面を擦らない
    o[k + 'Flat'] = max(0.85 * lobe(q, PI + 0.2, 1.0), 0.6 * lobe(q, 0.6, 1.3));
    o[k + 'Ankle'] = -0.25 * lobe(q, -1.2, 1.0); // 蹴り出しでつま先を伸ばす
    o[k + 'HipOut'] = 0.02;
    const a = -s;
    o[k + 'ShoulderSwing'] = 0.12 + 0.95 * a;
    o[k + 'Elbow'] = 1.5 + 0.32 * a;   // 肘は約90度に固定ぎみ
    o[k + 'ShoulderOut'] = 0.1;
    o[k + 'ShoulderTwist'] = 0.35;
  }

  o.hipsYaw = -0.16 * sL;
  o.waistYaw = 0.4 * sL;
  o.neckYaw = -(o.hipsYaw + o.waistYaw) * 0.9;
  o.hipsRoll = -0.05 * cL;
  o.waistRoll = 0.07 * cL;
  o.hipsX = -0.04 * cL;
  o.hipsPitch = 0.12;
  o.waistPitch = 0.24 + 0.035 * cos(2 * p);
  o.neckPitch = -0.24;
  // 片足が体の真下にある短い間だけ接地し、それ以外は両足が浮いて放物線を描く
  o.ground = max(plateau(p, 0.2, 0.75, 0.3), plateau(p, 0.2 + PI, 0.75, 0.3));
  o.hipsFree = -0.05 + 0.3 * (lobe(p, 1.77, 1.1) + lobe(p, 1.77 + PI, 1.1));
}

// ============================================================
// ジャンプ
// ============================================================
// 踏み切り前のしゃがみ: 膝を深く曲げ、腕を後ろへ引いて力をためる
function crouch(ctx, o) {
  o.hipsPitch = 0.2;
  o.waistPitch = 0.5;
  o.neckPitch = -0.4;
  for (const [k] of SIDES) {
    o[k + 'HipSwing'] = 0.95;
    o[k + 'Knee'] = 1.45;
    o[k + 'HipOut'] = 0.08;
    o[k + 'HipTwist'] = 0.1;
    o[k + 'Flat'] = 1;
    o[k + 'ShoulderSwing'] = -0.95;
    o[k + 'ShoulderOut'] = 0.18;
    o[k + 'Elbow'] = 0.35;
  }
}

// 上昇: 全身を伸ばし、腕を振り上げる
function airRise(o) {
  o.waistPitch = -0.1;
  o.neckPitch = -0.15;
  o.hipsPitch = -0.04;
  o.lHipSwing = 0.05; o.lKnee = 0.12;
  o.rHipSwing = -0.22; o.rKnee = 0.2;
  for (const [k] of SIDES) {
    o[k + 'Ankle'] = -0.55; // つま先まで伸ばす
    o[k + 'HipOut'] = 0.04;
    o[k + 'ShoulderSwing'] = 2.3;
    o[k + 'ShoulderOut'] = 0.22;
    o[k + 'ShoulderTwist'] = 0.2;
    o[k + 'Elbow'] = 0.3;
  }
}

// 頂点: 膝を抱え込み、腕は横に開いてバランス
function airApex(o) {
  o.waistPitch = 0.14;
  o.neckPitch = -0.05;
  o.lHipSwing = 1.4; o.lKnee = 1.75;
  o.rHipSwing = 0.95; o.rKnee = 1.85;
  for (const [k] of SIDES) {
    o[k + 'Ankle'] = -0.2;
    o[k + 'HipOut'] = 0.1;
    o[k + 'ShoulderSwing'] = 1.25;
    o[k + 'ShoulderOut'] = 0.75;
    o[k + 'Elbow'] = 0.7;
  }
}

// 落下: 足を地面へ伸ばして着地に備え、腕は上へ流れる
function airFall(o) {
  o.waistPitch = 0.16;
  o.neckPitch = 0.12;
  o.hipsPitch = 0.04;
  o.lHipSwing = 0.38; o.lKnee = 0.5;
  o.rHipSwing = 0.12; o.rKnee = 0.3;
  for (const [k] of SIDES) {
    o[k + 'Ankle'] = -0.3;
    o[k + 'HipOut'] = 0.12;
    o[k + 'ShoulderSwing'] = 0.45;
    o[k + 'ShoulderOut'] = 1.25;
    o[k + 'ShoulderTwist'] = 0.3;
    o[k + 'Elbow'] = 0.55;
  }
}

const tmpA = makePose();
const tmpB = makePose();

// 空中: 縦の速度 u（+1 = 踏み切り直後, 0 = 頂点, -1 = 着地直前）でポーズを切り替える
function air(ctx, o) {
  const u = max(-1, min(1, ctx.airU));
  resetPose(tmpA);
  resetPose(tmpB);
  airApex(tmpA);
  if (u >= 0) airRise(tmpB); else airFall(tmpB);
  lerpPose(o, tmpA, tmpB, smooth(abs(u)));
  o.ground = 0;
  o.hipsFree = 0;
}

// 着地: 深く沈んで衝撃を吸収。腕は前下へ出してバランスを取る
function land(ctx, o) {
  o.hipsPitch = 0.16;
  o.waistPitch = 0.42;
  o.neckPitch = -0.3;
  for (const [k] of SIDES) {
    o[k + 'HipSwing'] = 0.85;
    o[k + 'Knee'] = 1.3;
    o[k + 'HipOut'] = 0.14;
    o[k + 'HipTwist'] = 0.12;
    o[k + 'Flat'] = 1;
    o[k + 'ShoulderSwing'] = 0.55;
    o[k + 'ShoulderOut'] = 0.5;
    o[k + 'Elbow'] = 0.75;
  }
}

// ============================================================
// 剣を持っているときの右腕の上書き（攻撃以外のモーション用）
// ============================================================
export function carrySword(name, ctx, o) {
  switch (name) {
    case 'stand': // 剣先を斜め前の地面へ向けて下げる
      o.rShoulderSwing = 0.1 + (o.rShoulderSwing - 0.03) * 0.5;
      o.rShoulderOut += 0.1;
      o.rShoulderTwist = 0.0;
      o.rElbow += 0.2;
      o.swordTilt = 1.0;
      o.swordTwist = -0.35;
      break;
    case 'fight': // 右肩の前に剣を立てて構える
      o.rShoulderSwing = 0.55;
      o.rShoulderOut = 0.2;
      o.rShoulderTwist = 0.25;
      o.rElbow = 1.7 + 0.04 * sin(ctx.time * 5.2);
      o.swordTilt = 0.75;
      o.swordTwist = 0.25;
      break;
    case 'walk': // 腕の振りを抑えて、剣先は前下へ
      o.rShoulderSwing = 0.12 + (o.rShoulderSwing - 0.04) * 0.4;
      o.rShoulderOut = 0.14;
      o.rShoulderTwist = 0.0;
      o.rElbow = 0.42 + (o.rElbow - 0.3) * 0.4;
      o.swordTilt = 0.95;
      o.swordTwist = -0.3;
      break;
    case 'run': // 剣を後ろへ流して走る
      o.rShoulderSwing = -0.7 + (o.rShoulderSwing - 0.12) * 0.22;
      o.rShoulderOut = 0.3;
      o.rShoulderTwist = 0.0;
      o.rElbow = 0.22;
      o.swordTilt = 2.2;
      o.swordTwist = -0.25;
      break;
    case 'crouch':
      o.swordTilt = 1.9;
      break;
    case 'air':
      o.swordTilt = 0.9;
      break;
    case 'land':
      o.swordTilt = 1.2;
      o.swordTwist = -0.3;
      break;
    default:
      break;
  }
}

// ============================================================
// 攻撃（3連の斬撃がループする）
//   attack1: 右上から左下への袈裟斬り
//   attack2: 左から右への横薙ぎ
//   attack3: 跳び込みながらの兜割り（振り下ろし）
// 各攻撃は「振りかぶり → 斬る瞬間 → 振り抜き → 残心」のキーポーズを
// ctx.attackT（0→1）でつなぐ。斬る区間だけ加速させて、ためと速さの差を出す。
// ============================================================
const EASE = {
  lin: (t) => t,
  in: (t) => t * t,                      // ゆっくり → 速く（斬り始め）
  out: (t) => 1 - (1 - t) * (1 - t),     // 速く → ゆっくり（振り抜き）
  inout: smooth,
};

// keys: [{ t, pose(o), ease }]。ease はそのキーへ「入ってくる」区間のかかり方
function keyed(t, keys, o) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const u = clamp01((t - k0.t) / (k1.t - k0.t));
  resetPose(tmpA);
  resetPose(tmpB);
  k0.pose(tmpA);
  k1.pose(tmpB);
  lerpPose(o, tmpA, tmpB, EASE[k1.ease ?? 'inout'](u));
}

// --- 攻撃1: 袈裟斬り ---
const A1 = [
  { t: 0, pose: (o) => { // 振りかぶり: 体を右へひねり、剣を右肩の上へ
    o.hipsYaw = -0.3; o.waistYaw = -0.6; o.neckYaw = 0.75;
    o.waistPitch = 0.02; o.waistRoll = -0.08;
    o.lHipSwing = 0.3; o.lKnee = 0.35; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.5; o.rHipOut = 0.14; o.rFlat = 0.7;
    o.rShoulderSwing = 2.05; o.rShoulderOut = 0.7; o.rElbow = 1.55;
    o.swordTilt = 0.15;
    o.lShoulderSwing = 0.95; o.lShoulderOut = 0.1; o.lElbow = 0.85;
  } },
  { t: 0.3, ease: 'out', pose: (o) => { // ため: さらに沈んでひねる
    o.hipsYaw = -0.4; o.waistYaw = -0.75; o.neckYaw = 0.95;
    o.waistPitch = 0.0; o.waistRoll = -0.1;
    o.lHipSwing = 0.35; o.lKnee = 0.5; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.65; o.rHipOut = 0.14; o.rFlat = 0.7;
    o.rShoulderSwing = 2.25; o.rShoulderOut = 0.8; o.rElbow = 1.75;
    o.swordTilt = -0.05;
    o.lShoulderSwing = 1.1; o.lShoulderOut = 0.05; o.lElbow = 0.7;
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 斬る瞬間: 右足を踏み込み、腕が伸びきる
    o.hipsYaw = 0.1; o.waistYaw = 0.15; o.neckYaw = -0.2;
    o.waistPitch = 0.2; o.hipsPitch = 0.05;
    o.rHipSwing = 0.62; o.rKnee = 0.55; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.4; o.lKnee = 0.3; o.lHipOut = 0.1; o.lFlat = 0.3;
    o.rShoulderSwing = 1.35; o.rShoulderOut = 0.0; o.rElbow = 0.25;
    o.swordTilt = 1.1;
    o.lShoulderSwing = -0.3; o.lShoulderOut = 0.45; o.lElbow = 0.6;
  } },
  { t: 0.66, ease: 'out', pose: (o) => { // 振り抜き: 剣は左腰の下へ
    o.hipsYaw = 0.4; o.waistYaw = 0.75; o.neckYaw = -0.95;
    o.waistPitch = 0.4; o.hipsPitch = 0.08; o.waistRoll = 0.1;
    o.rHipSwing = 0.78; o.rKnee = 0.85; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.55; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 0.25;
    o.rShoulderSwing = 0.6; o.rShoulderOut = -0.75; o.rShoulderTwist = 0.4; o.rElbow = 0.45;
    o.swordTilt = 0.8;
    o.lShoulderSwing = -0.65; o.lShoulderOut = 0.6; o.lElbow = 0.5;
  } },
  { t: 1, ease: 'out', pose: (o) => { // 残心
    o.hipsYaw = 0.42; o.waistYaw = 0.8; o.neckYaw = -1.0;
    o.waistPitch = 0.34; o.hipsPitch = 0.06; o.waistRoll = 0.08;
    o.rHipSwing = 0.72; o.rKnee = 0.75; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.5; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 0.3;
    o.rShoulderSwing = 0.6; o.rShoulderOut = -0.8; o.rShoulderTwist = 0.45; o.rElbow = 0.6;
    o.swordTilt = 0.8;
    o.lShoulderSwing = -0.55; o.lShoulderOut = 0.55; o.lElbow = 0.55;
  } },
];

// --- 攻撃2: 横薙ぎ（左 → 右）---
const A2 = [
  { t: 0, pose: (o) => { // 振りかぶり: 体を左へひねり、剣を左脇へ引きつける
    o.hipsYaw = 0.42; o.waistYaw = 0.85; o.neckYaw = -1.05;
    o.waistPitch = 0.28; o.hipsPitch = 0.05;
    o.rHipSwing = 0.65; o.rKnee = 0.75; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.45; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 0.35;
    o.rShoulderSwing = 1.15; o.rShoulderOut = -0.95; o.rShoulderTwist = 0.5; o.rElbow = 1.3;
    o.swordTilt = 0.9; o.swordTwist = 1.4;
    o.lShoulderSwing = 0.2; o.lShoulderOut = 0.5; o.lElbow = 0.8;
  } },
  { t: 0.28, ease: 'out', pose: (o) => {
    o.hipsYaw = 0.5; o.waistYaw = 0.98; o.neckYaw = -1.2;
    o.waistPitch = 0.3; o.hipsPitch = 0.05;
    o.rHipSwing = 0.6; o.rKnee = 0.85; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.4; o.lKnee = 0.5; o.lHipOut = 0.1; o.lFlat = 0.35;
    o.rShoulderSwing = 1.2; o.rShoulderOut = -1.05; o.rShoulderTwist = 0.5; o.rElbow = 1.5;
    o.swordTilt = 0.8; o.swordTwist = 1.4;
    o.lShoulderSwing = 0.35; o.lShoulderOut = 0.4; o.lElbow = 0.9;
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 斬る瞬間: 腕を水平に伸ばして正面を通過
    o.hipsYaw = 0.0; o.waistYaw = -0.05; o.neckYaw = 0.05;
    o.waistPitch = 0.16;
    o.lHipSwing = 0.45; o.lKnee = 0.5; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.1; o.rKnee = 0.4; o.rHipOut = 0.12; o.rFlat = 0.8;
    o.rShoulderSwing = 1.45; o.rShoulderOut = 0.05; o.rElbow = 0.2;
    o.swordTilt = 1.35; o.swordTwist = 1.45;
    o.lShoulderSwing = -0.25; o.lShoulderOut = 0.7; o.lElbow = 0.6;
  } },
  { t: 0.66, ease: 'out', pose: (o) => { // 振り抜き: 剣は右の外へ、左手は後ろへ引く
    o.hipsYaw = -0.45; o.waistYaw = -0.85; o.neckYaw = 1.05;
    o.waistPitch = 0.12; o.waistRoll = -0.08;
    o.lHipSwing = 0.62; o.lKnee = 0.7; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.4; o.rKnee = 0.4; o.rHipOut = 0.14; o.rFlat = 0.35;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 1.2; o.rElbow = 0.15;
    o.swordTilt = 1.4; o.swordTwist = 1.5;
    o.lShoulderSwing = -0.75; o.lShoulderOut = 0.35; o.lElbow = 0.95;
  } },
  { t: 1, ease: 'out', pose: (o) => {
    o.hipsYaw = -0.5; o.waistYaw = -0.9; o.neckYaw = 1.15;
    o.waistPitch = 0.1; o.waistRoll = -0.06;
    o.lHipSwing = 0.58; o.lKnee = 0.62; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.36; o.rKnee = 0.4; o.rHipOut = 0.14; o.rFlat = 0.4;
    o.rShoulderSwing = 1.3; o.rShoulderOut = 1.3; o.rElbow = 0.3;
    o.swordTilt = 1.3; o.swordTwist = 1.5;
    o.lShoulderSwing = -0.65; o.lShoulderOut = 0.35; o.lElbow = 0.9;
  } },
];

// --- 攻撃3: 跳び込み兜割り ---
const A3 = [
  { t: 0, pose: (o) => { // 沈み込みながら剣を頭上へ回す
    o.hipsYaw = -0.2; o.waistYaw = -0.35; o.neckYaw = 0.5;
    o.waistPitch = 0.1; o.hipsPitch = 0.1;
    o.lHipSwing = 0.7; o.lKnee = 0.95; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 0.35; o.rKnee = 0.95; o.rHipOut = 0.12; o.rFlat = 0.8;
    o.rShoulderSwing = 1.9; o.rShoulderOut = 0.75; o.rElbow = 0.9;
    o.swordTilt = 0.7; o.swordTwist = 0.6;
    o.lShoulderSwing = 0.9; o.lShoulderOut = 0.3; o.lElbow = 0.8;
  } },
  { t: 0.24, ease: 'out', pose: (o) => { // 踏み切り直前: 両手で剣を背中側まで振りかぶる
    o.waistPitch = -0.12; o.hipsPitch = 0.12; o.neckPitch = 0.1;
    o.lHipSwing = 0.85; o.lKnee = 1.2; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 0.75; o.rKnee = 1.25; o.rHipOut = 0.1; o.rFlat = 1;
    o.rShoulderSwing = 2.65; o.rShoulderOut = 0.3; o.rShoulderTwist = 0.2; o.rElbow = 1.35;
    o.swordTilt = -0.1;
    o.lShoulderSwing = 2.5; o.lShoulderOut = 0.05; o.lShoulderTwist = 0.5; o.lElbow = 1.35;
  } },
  { t: 0.44, ease: 'out', pose: (o) => { // 空中の頂点: 体を反らせ、膝を畳む
    o.lift = 1.15;
    o.waistPitch = -0.28; o.hipsPitch = -0.05; o.neckPitch = 0.15;
    o.lHipSwing = 0.9; o.lKnee = 1.5; o.lHipOut = 0.08; o.lAnkle = -0.3;
    o.rHipSwing = 0.2; o.rKnee = 1.55; o.rHipOut = 0.1; o.rAnkle = -0.3;
    o.rShoulderSwing = 2.85; o.rShoulderOut = 0.25; o.rShoulderTwist = 0.2; o.rElbow = 1.1;
    o.swordTilt = -0.25;
    o.lShoulderSwing = 2.7; o.lShoulderOut = 0.0; o.lShoulderTwist = 0.5; o.lElbow = 1.1;
  } },
  { t: 0.58, ease: 'in', pose: (o) => { // 斬る瞬間: 落下しながら真下へ振り下ろす
    o.lift = 0.45;
    o.waistPitch = 0.32; o.hipsPitch = 0.1; o.neckPitch = -0.2;
    o.rHipSwing = 0.75; o.rKnee = 0.5; o.rHipOut = 0.08; o.rAnkle = 0.1;
    o.lHipSwing = -0.1; o.lKnee = 0.9; o.lHipOut = 0.1; o.lAnkle = -0.3;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 0.0; o.rShoulderTwist = 0.25; o.rElbow = 0.25;
    o.swordTilt = 1.15;
    o.lShoulderSwing = 1.3; o.lShoulderOut = -0.15; o.lShoulderTwist = 0.6; o.lElbow = 0.45;
  } },
  { t: 0.7, ease: 'out', pose: (o) => { // 着地: 深く沈み、剣先は地面すれすれ
    o.waistPitch = 0.62; o.hipsPitch = 0.16; o.neckPitch = -0.45;
    o.rHipSwing = 1.0; o.rKnee = 1.15; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.45; o.lKnee = 0.75; o.lHipOut = 0.12; o.lFlat = 0.25;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 0.0; o.rShoulderTwist = 0.25; o.rElbow = 0.3;
    o.swordTilt = 1.12;
    o.lShoulderSwing = 1.3; o.lShoulderOut = -0.12; o.lShoulderTwist = 0.6; o.lElbow = 0.5;
  } },
  { t: 1, ease: 'out', pose: (o) => { // 残心: 少しだけ体を起こす
    o.waistPitch = 0.5; o.hipsPitch = 0.12; o.neckPitch = -0.38;
    o.rHipSwing = 0.9; o.rKnee = 1.0; o.rHipOut = 0.08; o.rFlat = 1;
    o.lHipSwing = -0.42; o.lKnee = 0.65; o.lHipOut = 0.12; o.lFlat = 0.3;
    o.rShoulderSwing = 1.3; o.rShoulderOut = 0.05; o.rShoulderTwist = 0.2; o.rElbow = 0.4;
    o.swordTilt = 1.3;
    o.lShoulderSwing = 0.9; o.lShoulderOut = 0.15; o.lElbow = 0.6;
  } },
];

// --- 空中攻撃: 叩きつけ ---
// 空中で剣を頭上へ振りかぶり（attackT 0）、切っ先を下にして真下へ突っ込む（attackT 1）。
// 着地後は attack3 の着地〜残心の部分へつながる
const AIR_SLAM = [
  { t: 0, pose: (o) => { A3[2].pose(o); o.lift = 0; o.ground = 0; } },
  { t: 1, ease: 'in', pose: (o) => {
    o.ground = 0;
    o.hipsPitch = 0.35; o.waistPitch = 0.5; o.neckPitch = -0.5;
    o.lHipSwing = -0.3; o.lKnee = 0.9; o.lHipOut = 0.1; o.lAnkle = -0.4;
    o.rHipSwing = 0.25; o.rKnee = 1.1; o.rHipOut = 0.1; o.rAnkle = -0.4;
    o.rShoulderSwing = 1.5; o.rShoulderOut = 0.0; o.rShoulderTwist = 0.25; o.rElbow = 0.15;
    o.swordTilt = 1.95;
    o.lShoulderSwing = 1.4; o.lShoulderOut = -0.15; o.lShoulderTwist = 0.6; o.lElbow = 0.4;
  } },
];
const airSlam = (ctx, o) => keyed(ctx.attackT, AIR_SLAM, o);

const attack1 = (ctx, o) => keyed(ctx.attackT, A1, o);
const attack2 = (ctx, o) => keyed(ctx.attackT, A2, o);
const attack3 = (ctx, o) => keyed(ctx.attackT, A3, o);

// ============================================================
// 被弾: のけぞって（hitT 0 → 0.25）、持ち直す（→ 1）
// ============================================================
function hit(ctx, o) {
  const t = ctx.hitT;
  const k = t < 0.25 ? EASE.out(t / 0.25) : 1 - smooth((t - 0.25) / 0.75) * 0.75;
  o.hipsPitch = -0.12 * k;
  o.waistPitch = -0.5 * k;
  o.neckPitch = -0.45 * k;
  o.waistYaw = 0.25 * k;
  o.lHipSwing = -0.45 * k; o.lKnee = 0.3 + 0.2 * k; o.lHipOut = 0.12; o.lFlat = 1;
  o.rHipSwing = 0.3 * k; o.rKnee = 0.25 + 0.35 * k; o.rHipOut = 0.14; o.rFlat = 1;
  o.lShoulderSwing = 0.3 + 0.5 * k; o.lShoulderOut = 0.3 + 0.9 * k; o.lElbow = 0.9;
  o.rShoulderSwing = 0.3 - 0.5 * k; o.rShoulderOut = 0.3 + 0.7 * k; o.rElbow = 0.8;
  o.swordTilt = 0.8;
}

// ============================================================
// コンボ技（掴み上げ）のポーズ
// ============================================================
// 掴む: 踏み込んで左手を真っすぐ伸ばし、相手の胸ぐらを掴む。剣は後ろへ引く
function grab(ctx, o) {
  o.hipsYaw = -0.25; o.waistYaw = -0.4; o.neckYaw = 0.6;
  o.waistPitch = 0.16; o.hipsPitch = 0.04;
  o.lHipSwing = 0.6; o.lKnee = 0.6; o.lHipOut = 0.1; o.lFlat = 1;
  o.rHipSwing = -0.45; o.rKnee = 0.35; o.rHipOut = 0.12; o.rFlat = 0.3;
  o.lShoulderSwing = 1.7; o.lShoulderOut = -0.3; o.lShoulderTwist = 0.4; o.lElbow = 0.2;
  o.rShoulderSwing = -0.55; o.rShoulderOut = 0.4; o.rElbow = 0.6;
  o.swordTilt = 1.7;
}

// 持ち上げて跳ぶ: 左手で相手を高く掲げ、膝を畳んで上昇する
function carry(ctx, o) {
  o.ground = 0;
  o.waistYaw = -0.3; o.neckYaw = 0.3; o.waistPitch = -0.12; o.neckPitch = -0.25;
  o.lHipSwing = 1.0; o.lKnee = 1.4; o.lAnkle = -0.3;
  o.rHipSwing = -0.15; o.rKnee = 0.45; o.rAnkle = -0.5;
  o.lShoulderSwing = 1.95; o.lShoulderOut = -0.25; o.lShoulderTwist = 0.4; o.lElbow = 0.15;
  o.rShoulderSwing = -0.4; o.rShoulderOut = 0.45; o.rElbow = 0.5;
  o.swordTilt = 1.7;
}

// 投げ落とす: 左手を頭上へ振りかぶり、体ごと前へ折って地面へ叩きつける。右手は剣を振り上げて次に備える
const THROW = [
  { t: 0, pose: (o) => {
    o.ground = 0;
    o.waistPitch = -0.35; o.neckPitch = -0.2; o.waistYaw = -0.2;
    o.lHipSwing = 0.4; o.lKnee = 0.9; o.rHipSwing = -0.3; o.rKnee = 0.7;
    o.lShoulderSwing = 2.85; o.lShoulderOut = -0.1; o.lElbow = 0.7;
    o.rShoulderSwing = 0.2; o.rShoulderOut = 0.5; o.rElbow = 0.6; o.swordTilt = 1.5;
  } },
  { t: 0.5, ease: 'in', pose: (o) => {
    o.ground = 0;
    o.waistPitch = 0.5; o.hipsPitch = 0.2; o.neckPitch = 0.1; o.waistYaw = 0.25;
    o.lHipSwing = -0.3; o.lKnee = 0.6; o.rHipSwing = 0.5; o.rKnee = 1.0;
    o.lShoulderSwing = 0.9; o.lShoulderOut = -0.1; o.lElbow = 0.1;
    o.rShoulderSwing = 1.6; o.rShoulderOut = 0.5; o.rElbow = 1.0; o.swordTilt = 0.6;
  } },
  { t: 1, ease: 'out', pose: (o) => {
    o.ground = 0;
    o.waistPitch = 0.3; o.hipsPitch = 0.1; o.neckPitch = 0.2;
    o.lHipSwing = 0.3; o.lKnee = 1.1; o.rHipSwing = 0.1; o.rKnee = 1.3;
    o.lShoulderSwing = 0.4; o.lShoulderOut = 0.4; o.lElbow = 0.3;
    o.rShoulderSwing = 2.6; o.rShoulderOut = 0.3; o.rElbow = 1.2; o.swordTilt = 0.0;
  } },
];
const throwDown = (ctx, o) => keyed(ctx.attackT, THROW, o);

// 掴んだまま沈み込む: 跳び上がる前のため。膝を深く曲げ、相手を引き寄せる
function liftCrouch(ctx, o) {
  o.hipsYaw = -0.15; o.waistYaw = -0.3; o.neckYaw = 0.4;
  o.waistPitch = 0.38; o.hipsPitch = 0.14; o.neckPitch = -0.3;
  o.lHipSwing = 0.95; o.lKnee = 1.35; o.lHipOut = 0.12; o.lFlat = 1;
  o.rHipSwing = 0.55; o.rKnee = 1.3; o.rHipOut = 0.14; o.rFlat = 0.8;
  o.lShoulderSwing = 1.75; o.lShoulderOut = -0.3; o.lShoulderTwist = 0.4; o.lElbow = 0.75;
  o.rShoulderSwing = -0.8; o.rShoulderOut = 0.45; o.rElbow = 0.5;
  o.swordTilt = 1.8;
}

// 掴まれている側: もがく。両手で相手の腕を掴んで引きはがそうとし、足をばたつかせ、首を振る
function struggle(ctx, o) {
  const t = ctx.time;
  const kick = sin(t * 19);            // 足のばたつき（左右交互）
  const pull = sin(t * 13 + 0.7);      // 腕で引きはがす
  const shake = sin(t * 23);           // 首を振る
  const twist = sin(t * 9.5 + 2);      // 体をよじる
  o.ground = 0;
  o.waistPitch = -0.12 + 0.1 * pull;
  o.waistYaw = 0.3 * twist;
  o.hipsYaw = -0.2 * twist;
  o.hipsRoll = 0.1 * kick;
  o.neckPitch = -0.4 + 0.12 * pull;
  o.neckYaw = 0.35 * shake;
  o.neckRoll = 0.12 * twist;
  for (const [k, off] of SIDES) {
    const sgn = off === 0 ? 1 : -1;
    // 両手は胸の前（掴まれている所）へ。交互に引いたり押したりする
    o[k + 'ShoulderSwing'] = 1.25 + 0.3 * pull * sgn;
    o[k + 'ShoulderOut'] = -0.05 + 0.12 * shake * sgn;
    o[k + 'ShoulderTwist'] = 0.7;
    o[k + 'Elbow'] = 1.7 - 0.35 * pull * sgn;
    // 足は宙を蹴る
    o[k + 'HipSwing'] = 0.35 + 0.6 * kick * sgn;
    o[k + 'HipOut'] = 0.1 + 0.08 * twist * sgn;
    o[k + 'Knee'] = 0.75 - 0.55 * kick * sgn;
    o[k + 'Ankle'] = -0.3 + 0.3 * kick * sgn;
  }
  o.swordTilt = 0.4 + 0.5 * pull;      // 握った剣も振り回される
  o.swordTwist = 0.6 * twist;
}

// 投げ落とされている側: 背中から落ちながら、手足が上へ流れてばたつく
function thrown(ctx, o) {
  const w = sin(ctx.time * 26);
  o.ground = 0;
  o.waistPitch = 0.35; o.neckPitch = 0.3;
  for (const [k, off] of SIDES) {
    const sgn = off === 0 ? 1 : -1;
    o[k + 'ShoulderSwing'] = 1.9 + 0.35 * w * sgn; o[k + 'ShoulderOut'] = 0.6; o[k + 'Elbow'] = 0.4 + 0.25 * w * sgn;
    o[k + 'HipSwing'] = 0.9 - 0.3 * w * sgn; o[k + 'HipOut'] = 0.2; o[k + 'Knee'] = 0.5 + 0.3 * w * sgn; o[k + 'Ankle'] = -0.4;
  }
  o.swordTilt = 1.0;
}

// 急停止: 走りから止まるとき。前足を突っ張って体を後ろへ残し、腕を広げてバランスを取る
function brake(ctx, o) {
  o.hipsPitch = -0.1; o.waistPitch = -0.08; o.neckPitch = 0.12;
  o.hipsYaw = -0.25; o.waistYaw = 0.1; o.neckYaw = 0.15;
  o.lHipSwing = 0.8; o.lKnee = 0.3; o.lHipOut = 0.08; o.lFlat = 0.6; o.lAnkle = 0.2; // かかとで踏ん張る
  o.rHipSwing = -0.05; o.rKnee = 0.85; o.rHipOut = 0.12; o.rFlat = 1;
  o.lShoulderSwing = 0.7; o.lShoulderOut = 0.55; o.lElbow = 0.6;
  o.rShoulderSwing = 0.2; o.rShoulderOut = 0.6; o.rElbow = 0.5;
  o.swordTilt = 1.25; o.swordTwist = -0.3;
}

// 倒れている側: 大の字
function down(ctx, o) {
  o.ground = 0;
  o.neckPitch = -0.1;
  o.lShoulderSwing = 0.3; o.lShoulderOut = 1.2; o.lElbow = 0.4;
  o.rShoulderSwing = 0.3; o.rShoulderOut = 1.0; o.rElbow = 0.3;
  o.lHipSwing = 0.15; o.lHipOut = 0.3; o.lKnee = 0.3; o.lAnkle = -0.4;
  o.rHipSwing = 0.35; o.rHipOut = 0.2; o.rKnee = 0.7; o.rAnkle = -0.4;
  o.swordTilt = 1.5; o.swordTwist = 1.2;
}

// ============================================================
// スキル1（剣投げ → 引き寄せ → 連打 → 引き抜いて蹴り飛ばす）のポーズ
// ============================================================
// 剣を頭上で振り回す: ctx.spin（回した角度）で剣が手首を軸にプロペラのように回る
function spinUp(ctx, o) {
  const a = ctx.spin;
  o.hipsYaw = -0.2; o.waistYaw = -0.25 + 0.14 * sin(a); o.neckYaw = 0.4;
  o.waistPitch = -0.06 + 0.05 * cos(a); o.waistRoll = 0.06 * sin(a);
  o.lHipSwing = 0.35; o.lKnee = 0.5; o.lHipOut = 0.16; o.lFlat = 1;
  o.rHipSwing = -0.25; o.rKnee = 0.55; o.rHipOut = 0.18; o.rFlat = 0.8;
  o.rShoulderSwing = 2.45 + 0.12 * cos(a); o.rShoulderOut = 0.45 + 0.12 * sin(a); o.rElbow = 0.55;
  o.swordTilt = 0.15; o.swordTwist = a;
  o.lShoulderSwing = 0.9; o.lShoulderOut = 0.25; o.lElbow = 0.9; // 左手は狙いを定める
}

// 投げる: 大きく後ろへ引いて、踏み込みながら上手投げ
const THROW_SWORD = [
  { t: 0, pose: (o) => {
    o.hipsYaw = -0.45; o.waistYaw = -0.75; o.neckYaw = 1.0; o.waistPitch = -0.12;
    o.lHipSwing = 0.45; o.lKnee = 0.45; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.35; o.rKnee = 0.7; o.rHipOut = 0.18; o.rFlat = 0.6;
    o.rShoulderSwing = 2.7; o.rShoulderOut = 0.75; o.rElbow = 1.5; o.swordTilt = -0.2;
    o.lShoulderSwing = 1.35; o.lShoulderOut = 0.0; o.lElbow = 0.3;
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 手を離す瞬間: 腕が前へ伸びきる
    o.hipsYaw = 0.25; o.waistYaw = 0.5; o.neckYaw = -0.6; o.waistPitch = 0.3; o.hipsPitch = 0.08;
    o.lHipSwing = 0.75; o.lKnee = 0.75; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.6; o.rKnee = 0.35; o.rHipOut = 0.12; o.rFlat = 0.2;
    o.rShoulderSwing = 1.55; o.rShoulderOut = 0.0; o.rElbow = 0.1; o.swordTilt = 1.3;
    o.lShoulderSwing = -0.5; o.lShoulderOut = 0.45; o.lElbow = 0.7;
  } },
  { t: 1, ease: 'out', pose: (o) => { // 振り抜き
    o.hipsYaw = 0.35; o.waistYaw = 0.7; o.neckYaw = -0.9; o.waistPitch = 0.42; o.hipsPitch = 0.1;
    o.lHipSwing = 0.8; o.lKnee = 0.85; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.55; o.rKnee = 0.4; o.rHipOut = 0.12; o.rFlat = 0.25;
    o.rShoulderSwing = 0.7; o.rShoulderOut = -0.5; o.rElbow = 0.3;
    o.lShoulderSwing = -0.7; o.lShoulderOut = 0.5; o.lElbow = 0.6;
  } },
];
const throwSword = (ctx, o) => keyed(ctx.attackT, THROW_SWORD, o);

// 引き寄せる: 左手をかざし（attackT 0）、綱を手繰るように体ごと引く（attackT 1）
const BECKON = [
  { t: 0, pose: (o) => {
    o.hipsYaw = -0.3; o.waistYaw = -0.5; o.neckYaw = 0.75; o.waistPitch = 0.12;
    o.lHipSwing = 0.6; o.lKnee = 0.6; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.4; o.rKnee = 0.5; o.rHipOut = 0.16; o.rFlat = 0.7;
    o.lShoulderSwing = 1.6; o.lShoulderOut = -0.25; o.lShoulderTwist = 0.3; o.lElbow = 0.1;
    o.rShoulderSwing = -0.2; o.rShoulderOut = 0.3; o.rElbow = 1.3;
  } },
  { t: 0.35, ease: 'out', pose: (o) => { // かざしたまま指を握り込む間
    o.hipsYaw = -0.32; o.waistYaw = -0.55; o.neckYaw = 0.8; o.waistPitch = 0.16;
    o.lHipSwing = 0.65; o.lKnee = 0.7; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.4; o.rKnee = 0.55; o.rHipOut = 0.16; o.rFlat = 0.7;
    o.lShoulderSwing = 1.65; o.lShoulderOut = -0.25; o.lShoulderTwist = 0.3; o.lElbow = 0.05;
    o.rShoulderSwing = -0.25; o.rShoulderOut = 0.3; o.rElbow = 1.4;
  } },
  { t: 1, ease: 'inout', pose: (o) => { // 体重を後ろへかけて引き切る
    o.hipsYaw = -0.1; o.waistYaw = 0.1; o.neckYaw = 0.0; o.waistPitch = -0.2; o.hipsPitch = -0.06;
    o.lHipSwing = 0.5; o.lKnee = 0.35; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.85; o.rHipOut = 0.16; o.rFlat = 1;
    o.lShoulderSwing = 0.75; o.lShoulderOut = 0.1; o.lShoulderTwist = 0.3; o.lElbow = 1.75;
    o.rShoulderSwing = 0.5; o.rShoulderOut = 0.25; o.rElbow = 1.9; // 右拳を構える
  } },
];
const beckon = (ctx, o) => keyed(ctx.attackT, BECKON, o);

// 連打: ctx.phase の半周期ごとに左右の拳が交互に伸びる。腰と肩を入れ、体を上下させる
function flurry(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  o.hipsYaw = -0.16 * sL; o.waistYaw = -0.42 * sL; o.neckYaw = 0.5 * sL; // 打つ側の肩が前へ
  o.waistPitch = 0.2 + 0.05 * cos(2 * p); o.hipsPitch = 0.05; o.neckPitch = -0.12;
  o.hipsX = 0.05 * sL;
  o.lHipSwing = 0.5; o.lKnee = 0.6 + 0.08 * cos(2 * p); o.lHipOut = 0.16; o.lFlat = 1;
  o.rHipSwing = -0.3; o.rKnee = 0.6 + 0.08 * cos(2 * p); o.rHipOut = 0.18; o.rFlat = 0.6;
  for (const [k, off] of SIDES) {
    const e = smooth(max(0, sin(p + off)) * 1.25); // 0 = 引いている, 1 = 伸びきり
    o[k + 'ShoulderSwing'] = 0.75 + 0.75 * e;
    o[k + 'ShoulderOut'] = 0.28 - 0.3 * e;
    o[k + 'ShoulderTwist'] = 0.5;
    o[k + 'Elbow'] = 1.95 - 1.8 * e;
  }
}

// 引き抜く: 右手を柄へ伸ばして握り（〜0.5）、体をひねって一気に引き抜く
const PULL_OUT = [
  { t: 0, pose: (o) => {
    o.hipsYaw = 0.1; o.waistYaw = 0.3; o.neckYaw = -0.3; o.waistPitch = 0.22;
    o.lHipSwing = 0.5; o.lKnee = 0.6; o.lHipOut = 0.16; o.lFlat = 1;
    o.rHipSwing = -0.3; o.rKnee = 0.6; o.rHipOut = 0.18; o.rFlat = 0.6;
    o.rShoulderSwing = 1.4; o.rShoulderOut = -0.2; o.rShoulderTwist = 0.4; o.rElbow = 0.75; o.swordTilt = 1.57;
    o.lShoulderSwing = 0.9; o.lShoulderOut = 0.1; o.lElbow = 1.5;
  } },
  { t: 0.5, ease: 'out', pose: (o) => { // 柄を握ってためる
    o.hipsYaw = 0.2; o.waistYaw = 0.45; o.neckYaw = -0.5; o.waistPitch = 0.3;
    o.lHipSwing = 0.6; o.lKnee = 0.75; o.lHipOut = 0.16; o.lFlat = 1;
    o.rHipSwing = -0.3; o.rKnee = 0.65; o.rHipOut = 0.18; o.rFlat = 0.6;
    o.rShoulderSwing = 1.45; o.rShoulderOut = -0.25; o.rShoulderTwist = 0.4; o.rElbow = 0.4; o.swordTilt = 1.57;
    o.lShoulderSwing = 1.35; o.lShoulderOut = -0.1; o.lElbow = 0.5; // 左手で相手の肩を押さえる
  } },
  { t: 1, ease: 'in', pose: (o) => { // 引き抜いた: 剣は右後ろへ
    o.hipsYaw = -0.35; o.waistYaw = -0.7; o.neckYaw = 0.95; o.waistPitch = -0.05;
    o.lHipSwing = 0.4; o.lKnee = 0.4; o.lHipOut = 0.16; o.lFlat = 1;
    o.rHipSwing = -0.35; o.rKnee = 0.7; o.rHipOut = 0.18; o.rFlat = 0.9;
    o.rShoulderSwing = -0.5; o.rShoulderOut = 0.7; o.rElbow = 0.9; o.swordTilt = 1.3;
    o.lShoulderSwing = 1.2; o.lShoulderOut = 0.0; o.lElbow = 0.6;
  } },
];
const pullOut = (ctx, o) => keyed(ctx.attackT, PULL_OUT, o);

// 蹴り飛ばす: 右膝を抱え上げ（0）、足裏を突き出し（0.45）、残して（0.7）、下ろす（1）
const KICK = [
  { t: 0, pose: (o) => {
    o.hipsYaw = -0.2; o.waistYaw = -0.3; o.neckYaw = 0.45; o.hipsPitch = -0.05; o.waistPitch = 0.1;
    o.lHipSwing = 0.1; o.lKnee = 0.4; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 1.55; o.rKnee = 2.0; o.rHipOut = 0.05; o.rAnkle = 0.3;
    o.rShoulderSwing = -0.3; o.rShoulderOut = 0.7; o.rElbow = 0.8; o.swordTilt = 1.4;
    o.lShoulderSwing = 1.0; o.lShoulderOut = 0.2; o.lElbow = 1.4;
  } },
  { t: 0.45, ease: 'in', pose: (o) => {
    o.hipsYaw = 0.1; o.waistYaw = 0.1; o.neckYaw = -0.15; o.hipsPitch = -0.38; o.waistPitch = -0.05; o.neckPitch = 0.3;
    o.lHipSwing = -0.38; o.lKnee = 0.15; o.lHipOut = 0.1; o.lFlat = 1; // 軸足は伸ばす（体を後ろへ倒した分を打ち消す）
    o.rHipSwing = 1.2; o.rKnee = 0.05; o.rHipOut = 0.03; o.rAnkle = 0.5;
    o.rShoulderSwing = -0.7; o.rShoulderOut = 0.8; o.rElbow = 0.5; o.swordTilt = 1.5;
    o.lShoulderSwing = -0.3; o.lShoulderOut = 0.7; o.lElbow = 0.6;
  } },
  { t: 0.7, ease: 'out', pose: (o) => {
    o.hipsYaw = 0.12; o.waistYaw = 0.12; o.neckYaw = -0.15; o.hipsPitch = -0.34; o.waistPitch = -0.03; o.neckPitch = 0.28;
    o.lHipSwing = -0.34; o.lKnee = 0.2; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 1.15; o.rKnee = 0.1; o.rHipOut = 0.03; o.rAnkle = 0.45;
    o.rShoulderSwing = -0.65; o.rShoulderOut = 0.8; o.rElbow = 0.5; o.swordTilt = 1.5;
    o.lShoulderSwing = -0.25; o.lShoulderOut = 0.7; o.lElbow = 0.6;
  } },
  { t: 1, ease: 'inout', pose: (o) => {
    o.waistPitch = 0.1;
    o.lHipSwing = -0.1; o.lKnee = 0.3; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = 0.55; o.rKnee = 0.7; o.rHipOut = 0.1; o.rFlat = 1;
    o.rShoulderSwing = 0.1; o.rShoulderOut = 0.4; o.rElbow = 0.6; o.swordTilt = 1.2;
    o.lShoulderSwing = 0.4; o.lShoulderOut = 0.3; o.lElbow = 0.8;
  } },
];
const kick = (ctx, o) => keyed(ctx.attackT, KICK, o);

// --- スキルを受ける側 ---
// 剣が刺さった: 後ろへよろめき、左手で剣を掴む
function impaled(ctx, o) {
  const w = sin(ctx.time * 14);
  const j = ctx.jolt; // 引き抜かれた瞬間に前へ引っぱられる
  o.hipsPitch = -0.08 + 0.2 * j; o.waistPitch = -0.3 + 0.55 * j; o.neckPitch = -0.35 + 0.5 * j;
  o.waistYaw = 0.2 + 0.04 * w;
  o.lHipSwing = -0.4; o.lKnee = 0.55 + 0.05 * w; o.lHipOut = 0.14; o.lFlat = 1;
  o.rHipSwing = 0.3; o.rKnee = 0.6 - 0.05 * w; o.rHipOut = 0.16; o.rFlat = 1;
  o.lShoulderSwing = 1.1; o.lShoulderOut = -0.2; o.lShoulderTwist = 0.7; o.lElbow = 1.7;
  o.rShoulderSwing = -0.2 + 0.1 * w; o.rShoulderOut = 0.8; o.rElbow = 0.5;
}

// 引き寄せられている: 胸から引っぱられ、手足が後ろへ流れる
function dragged(ctx, o) {
  const w = sin(ctx.time * 21);
  o.ground = 0;
  o.hipsPitch = 0.25; o.waistPitch = -0.45; o.neckPitch = -0.4;
  for (const [k, off] of SIDES) {
    const sgn = off === 0 ? 1 : -1;
    o[k + 'ShoulderSwing'] = -0.75 + 0.2 * w * sgn; o[k + 'ShoulderOut'] = 0.55; o[k + 'Elbow'] = 0.35;
    o[k + 'HipSwing'] = -0.55 - 0.2 * w * sgn; o[k + 'HipOut'] = 0.12; o[k + 'Knee'] = 0.7 + 0.25 * w * sgn; o[k + 'Ankle'] = -0.5;
  }
}

// 連打を浴びている: 1発ごと（ctx.jolt が 1 になる）に頭と上体が弾かれ、打たれた側へねじれる
function pummeled(ctx, o) {
  const j = ctx.jolt;
  const side = ctx.joltSide;
  const w = sin(ctx.time * 17);
  o.hipsPitch = -0.05 - 0.08 * j; o.waistPitch = -0.12 - 0.3 * j; o.neckPitch = -0.15 - 0.55 * j;
  o.waistYaw = 0.35 * j * side; o.neckYaw = 0.5 * j * side; o.neckRoll = 0.2 * j * side;
  o.hipsX = 0.06 * j * side;
  o.lHipSwing = -0.25; o.lKnee = 0.55 + 0.12 * j; o.lHipOut = 0.14; o.lFlat = 1;
  o.rHipSwing = 0.2; o.rKnee = 0.6 + 0.12 * j; o.rHipOut = 0.16; o.rFlat = 1;
  for (const [k, off] of SIDES) {
    const sgn = off === 0 ? 1 : -1;
    o[k + 'ShoulderSwing'] = 0.25 - 0.5 * j + 0.06 * w * sgn;
    o[k + 'ShoulderOut'] = 0.45 + 0.45 * j;
    o[k + 'Elbow'] = 0.7 - 0.2 * j;
  }
}

// ============================================================
// スキル2（地面に剣を突き刺し、力を込めて地割れを起こす）のポーズ
// ============================================================
// 片膝をついて、両手で地面に刺した剣の柄を握る（共通の土台）
function kneelOnSword(o) {
  o.hipsPitch = 0.15; o.waistPitch = 0.45; o.neckPitch = 0.25;
  o.lHipSwing = 1.2; o.lKnee = 1.1; o.lHipOut = 0.14; o.lFlat = 1;       // 左膝を立てる
  o.rHipSwing = -0.1; o.rKnee = 1.55; o.rHipOut = 0.12; o.rAnkle = -0.3; // 右膝は地面へ
  o.rShoulderSwing = 1.65; o.rShoulderOut = -0.12; o.rShoulderTwist = 0.3; o.rElbow = 0.3;
  o.lShoulderSwing = 1.6; o.lShoulderOut = -0.3; o.lShoulderTwist = 0.6; o.lElbow = 0.45;
  o.swordTilt = 2.92; // 刃が真下を向く
}

// 地面へ突き刺す。4つの段階をはっきり分ける:
//   〜0.42 逆手に持ち替えながら跳び上がり、切っ先を真下にして両手で頭上に掲げる
//   〜0.55 頂点で一瞬ためる（体を反らせて狙いを定める）
//   〜0.74 全体重を乗せて落ち、片膝をつきながら突き立てる（ここで地面に刺さる）
//   〜1    刺さった剣を、肩を入れてさらに深く押し込む
const GROUND_STAB = [
  { t: 0, pose: (o) => {
    o.waistPitch = 0.12; o.neckPitch = -0.1;
    o.lHipSwing = 0.45; o.lKnee = 0.75; o.lHipOut = 0.12; o.lFlat = 1; // 踏み切りの沈み込み
    o.rHipSwing = 0.3; o.rKnee = 0.75; o.rHipOut = 0.12; o.rFlat = 1;
    o.rShoulderSwing = 1.4; o.rShoulderOut = 0.2; o.rElbow = 0.9; o.swordTilt = 2.6;
    o.lShoulderSwing = 1.2; o.lShoulderOut = 0.0; o.lShoulderTwist = 0.5; o.lElbow = 1.0;
  } },
  { t: 0.42, ease: 'out', pose: (o) => { // 跳び上がって掲げる
    o.waistPitch = -0.25; o.hipsPitch = -0.05; o.neckPitch = 0.3; o.lift = 1.0;
    o.lHipSwing = 0.75; o.lKnee = 1.35; o.lHipOut = 0.1; o.lAnkle = -0.4;
    o.rHipSwing = 0.1; o.rKnee = 1.2; o.rHipOut = 0.1; o.rAnkle = -0.4;
    o.rShoulderSwing = 2.8; o.rShoulderOut = 0.05; o.rShoulderTwist = 0.3; o.rElbow = 0.75; o.swordTilt = 5.37;
    o.lShoulderSwing = 2.75; o.lShoulderOut = -0.2; o.lShoulderTwist = 0.6; o.lElbow = 0.85;
  } },
  { t: 0.55, ease: 'out', pose: (o) => { // 頂点のため: さらに反って、肘を引き上げる
    o.waistPitch = -0.38; o.hipsPitch = -0.08; o.neckPitch = 0.42; o.lift = 1.15;
    o.lHipSwing = 0.85; o.lKnee = 1.5; o.lHipOut = 0.1; o.lAnkle = -0.4;
    o.rHipSwing = 0.0; o.rKnee = 1.35; o.rHipOut = 0.1; o.rAnkle = -0.4;
    o.rShoulderSwing = 2.95; o.rShoulderOut = 0.05; o.rShoulderTwist = 0.3; o.rElbow = 1.0; o.swordTilt = 5.9;
    o.lShoulderSwing = 2.9; o.lShoulderOut = -0.2; o.lShoulderTwist = 0.6; o.lElbow = 1.1;
  } },
  { t: 0.74, ease: 'in', pose: (o) => { // 突き立てた瞬間: 片膝が地面に着き、腕はまだ高い（刃が半分ほど入る）
    o.hipsPitch = 0.12; o.waistPitch = 0.32; o.neckPitch = 0.3;
    o.lHipSwing = 1.15; o.lKnee = 1.05; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.1; o.rKnee = 1.5; o.rHipOut = 0.12; o.rAnkle = -0.3;
    o.rShoulderSwing = 2.0; o.rShoulderOut = -0.1; o.rShoulderTwist = 0.3; o.rElbow = 0.55; o.swordTilt = 3.68;
    o.lShoulderSwing = 1.95; o.lShoulderOut = -0.3; o.lShoulderTwist = 0.6; o.lElbow = 0.7;
  } },
  { t: 1, ease: 'out', pose: kneelOnSword }, // 体重をかけて、鍔の近くまで押し込む
];
export const STAB_IMPACT = 0.74; // 剣が地面に刺さる瞬間（groundStab の進み具合）
const groundStab = (ctx, o) => keyed(ctx.attackT, GROUND_STAB, o);

// 力を込める: attackT（0〜1）が進むほど深く沈み、全身が小刻みに震える。解放の瞬間（jolt）に体が跳ね上がる
function stabCharge(ctx, o) {
  kneelOnSword(o);
  const c = ctx.attackT;
  const j = ctx.jolt;
  const tremble = sin(ctx.time * 61) * (0.012 + 0.03 * c);
  const tremble2 = sin(ctx.time * 47 + 1.3) * (0.01 + 0.025 * c);
  o.waistPitch += 0.14 * c + tremble - 0.4 * j;
  o.hipsPitch += 0.05 * c - 0.1 * j;
  o.neckPitch += 0.2 * c + tremble2 - 0.75 * j;   // うつむいて力をため、解放で顔を上げる
  o.waistRoll = tremble2;
  o.lKnee += 0.12 * c; o.lHipSwing += 0.1 * c;
  o.rShoulderSwing += 0.14 * c + tremble + 0.25 * j;
  o.lShoulderSwing += 0.14 * c - tremble + 0.25 * j;
  o.rElbow += 0.25 * c - 0.2 * j;                 // 肘を張って押し込む
  o.lElbow += 0.25 * c - 0.2 * j;
  o.rShoulderOut += 0.12 * c; o.lShoulderOut += 0.1 * c;
  o.swordTilt += 0.25 * c + tremble * 0.6 + 0.05 * j;
}

// 引き抜いて立ち上がる: 柄を引き上げ（〜0.55）、剣を払って構え直す（1）
const STAB_PULL = [
  { t: 0, pose: kneelOnSword },
  { t: 0.55, ease: 'inout', pose: (o) => {
    o.waistPitch = 0.1; o.hipsPitch = 0.02; o.neckPitch = -0.1;
    o.lHipSwing = 0.6; o.lKnee = 0.75; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.25; o.rKnee = 0.6; o.rHipOut = 0.14; o.rFlat = 0.7;
    o.rShoulderSwing = 2.1; o.rShoulderOut = 0.1; o.rShoulderTwist = 0.3; o.rElbow = 0.9; o.swordTilt = 3.2;
    o.lShoulderSwing = 1.9; o.lShoulderOut = -0.2; o.lShoulderTwist = 0.6; o.lElbow = 1.0;
  } },
  { t: 1, ease: 'inout', pose: (o) => {
    o.hipsYaw = -0.2; o.waistYaw = -0.3; o.neckYaw = 0.45; o.waistPitch = 0.05;
    o.lHipSwing = 0.3; o.lKnee = 0.35; o.lHipOut = 0.12; o.lFlat = 1;
    o.rHipSwing = -0.15; o.rKnee = 0.35; o.rHipOut = 0.14; o.rFlat = 1;
    o.rShoulderSwing = 0.5; o.rShoulderOut = 0.55; o.rElbow = 0.5; o.swordTilt = 1.2; o.swordTwist = -0.3;
    o.lShoulderSwing = 0.3; o.lShoulderOut = 0.3; o.lElbow = 0.6;
  } },
];
const stabPull = (ctx, o) => keyed(ctx.attackT, STAB_PULL, o);

// ============================================================
// スキル3（ため斬り）: 剣を右脇に引いて構え、力をためる。attackT = ため具合（0〜1）
// ============================================================
function chargeStance(ctx, o) {
  const c = ctx.attackT;
  const tr = sin(ctx.time * 53) * (0.008 + 0.028 * c);
  const tr2 = sin(ctx.time * 41 + 2) * (0.008 + 0.022 * c);
  const breathe = sin(ctx.time * 3.2) * 0.02 * (1 - c);
  o.hipsYaw = -0.4; o.waistYaw = -0.55 - 0.2 * c; o.neckYaw = 0.9 + 0.2 * c; // 右へ深くひねってためる
  o.waistPitch = 0.18 + 0.12 * c + tr + breathe; o.hipsPitch = 0.04 + 0.04 * c; o.neckPitch = -0.12;
  o.waistRoll = -0.06 + tr2;
  o.lHipSwing = 0.5 + 0.12 * c; o.lKnee = 0.6 + 0.3 * c; o.lHipOut = 0.16; o.lFlat = 1;
  o.rHipSwing = -0.38; o.rKnee = 0.6 + 0.3 * c; o.rHipOut = 0.18; o.rFlat = 0.75;
  // 剣は右腰の後ろへ引き、切っ先を後ろ下へ。左手を柄に添える
  o.rShoulderSwing = -0.35 - 0.15 * c + tr; o.rShoulderOut = 0.35; o.rElbow = 0.75 + 0.2 * c;
  o.swordTilt = 2.0 + 0.2 * c + tr2 * 2; o.swordTwist = -0.3;
  o.lShoulderSwing = 0.55; o.lShoulderOut = -0.75; o.lShoulderTwist = 0.6; o.lElbow = 1.45 + 0.15 * c - tr;
}

// ============================================================
// 気絶: 立ったままふらふらする。首がぐらつき、腕はだらんと下がり、膝が抜けかけている
// ============================================================
function stunned(ctx, o) {
  const t = ctx.time;
  const sway = sin(t * 2.3);            // 体全体の大きなゆれ
  const sway2 = sin(t * 3.7 + 1.1);
  const loll = sin(t * 1.7 + 0.6);      // 首のぐらつき（ゆっくり）
  o.hipsX = 0.1 * sway;
  o.hipsRoll = -0.1 * sway;
  o.hipsYaw = 0.12 * sway2;
  o.waistPitch = 0.14 + 0.1 * sway2;
  o.waistRoll = 0.17 * sway;
  o.waistYaw = -0.18 * sway2;
  o.neckPitch = 0.4 + 0.18 * loll;      // うなだれる
  o.neckRoll = -0.34 * sway + 0.12 * loll;
  o.neckYaw = 0.3 * sin(t * 1.3);
  for (const [k, off] of SIDES) {
    const sgn = off === 0 ? 1 : -1;
    o[k + 'ShoulderSwing'] = 0.05 + 0.14 * sway2 * sgn;
    o[k + 'ShoulderOut'] = 0.22 + 0.1 * sway * sgn;
    o[k + 'ShoulderTwist'] = 0.15;
    o[k + 'Elbow'] = 0.2;
    o[k + 'HipSwing'] = 0.06 + 0.1 * sway * sgn;
    o[k + 'HipOut'] = 0.12;
    o[k + 'Knee'] = 0.38 + 0.2 * max(0, sway * sgn) + 0.1 * sin(t * 2.3 + off); // ひざがかくっと抜ける
    o[k + 'Flat'] = 1;
  }
  o.swordTilt = 0.6 + 0.2 * sway2;      // 握った剣も下がって揺れる
}

// ============================================================
// スキル4（突進）: 剣を前へ向けて低く構え（lungeAim）、一瞬で飛びかかる（lungeDash）、突きの姿勢で残る（lungeStrike）
// ============================================================
// 構え: 体を後ろへ引き、剣を相手へまっすぐ向ける。左手は後ろへ引いてバランス
function lungeAim(ctx, o) {
  const c = ctx.attackT; // 0〜1: ため具合（沈み込みと、腕の引き）
  const tr = sin(ctx.time * 70) * 0.01 * c;
  o.hipsYaw = -0.3 - 0.1 * c; o.waistYaw = -0.5 - 0.1 * c; o.neckYaw = 0.8;
  o.hipsPitch = -0.04 + 0.1 * c; o.waistPitch = 0.12 + 0.12 * c + tr; o.neckPitch = -0.1;
  o.lHipSwing = 0.62 + 0.18 * c; o.lKnee = 0.75 + 0.45 * c; o.lHipOut = 0.14; o.lFlat = 1;           // 前足を深く曲げる
  o.rHipSwing = -0.55 - 0.15 * c; o.rKnee = 0.25 + 0.1 * c; o.rHipOut = 0.16; o.rFlat = 0.6;         // 後ろ足で蹴り出す準備
  o.rShoulderSwing = 1.5 - 0.12 * c; o.rShoulderOut = -0.05; o.rShoulderTwist = 0.2; o.rElbow = 0.55 + 0.3 * c; // 肘を引いてためる
  o.swordTilt = 1.35;                                                                                 // 切っ先は水平に前へ
  o.lShoulderSwing = -0.5; o.lShoulderOut = 0.85; o.lElbow = 0.5;
}

// 飛びかかり: 体を水平に寝かせ、剣を先頭に一直線。足は後ろへ流れる
function lungeDash(ctx, o) {
  o.ground = 0;
  o.lift = 0.5;
  o.hipsPitch = 0.75; o.waistPitch = 0.3; o.neckPitch = -0.5; o.hipsYaw = -0.1; o.waistYaw = -0.1; o.neckYaw = 0.1;
  o.lHipSwing = -0.7; o.lKnee = 0.3; o.lHipOut = 0.1; o.lAnkle = -0.6;
  o.rHipSwing = -0.95; o.rKnee = 0.15; o.rHipOut = 0.1; o.rAnkle = -0.7;
  o.rShoulderSwing = 1.85; o.rShoulderOut = -0.05; o.rShoulderTwist = 0.2; o.rElbow = 0.08; o.swordTilt = 0.95;
  o.lShoulderSwing = 1.7; o.lShoulderOut = 0.18; o.lElbow = 0.3; // 左腕も前へそろえて、空気抵抗を減らす
}

// 突き: 踏み込んだ姿勢で、腕をいっぱいに伸ばして静止（attackT 0 → 1 で少し戻って構え直す）
function lungeStrike(ctx, o) {
  const r = ctx.attackT;
  o.hipsYaw = 0.15; o.waistYaw = 0.25; o.neckYaw = -0.3;
  o.hipsPitch = 0.3 * (1 - r); o.waistPitch = 0.45 * (1 - r) + 0.05;
  o.lHipSwing = 1.05 - 0.4 * r; o.lKnee = 0.9 - 0.3 * r; o.lHipOut = 0.1; o.lFlat = 1;
  o.rHipSwing = -0.8 + 0.3 * r; o.rKnee = 0.2; o.rHipOut = 0.12; o.rFlat = 0.7;
  o.rShoulderSwing = 1.6; o.rShoulderOut = -0.02; o.rShoulderTwist = 0.2; o.rElbow = 0.04; o.swordTilt = 1.5;
  o.lShoulderSwing = -0.85; o.lShoulderOut = 0.8; o.lElbow = 0.4;
}

// ============================================================
// 必殺技のポーズ
//   小剣を左手で取り出して投げる（ultDraw → ultThrow）
//   ムービー中は両手剣を持って飛び回る（ultSummon → ultWindup → ultDash → ultFinish、締めは ultLeap → ultDash → ultLand）
// 剣の向きの目安: 刃の上向き角 = (肩の振り + 肘) − 手首の傾き（0 で水平に前向き）
// ============================================================
// 両手で柄を握る: 左右の腕を内側へ寄せて、手を胸の前でそろえる
function twoHand(o, swing, elbow, pitchUp, inward = 0.5) {
  o.rShoulderSwing = swing; o.lShoulderSwing = swing;
  o.rElbow = elbow; o.lElbow = elbow;
  o.rShoulderOut = -inward * 0.55; o.lShoulderOut = -inward;
  o.rShoulderTwist = 0.15; o.lShoulderTwist = 0.7;
  o.swordTilt = swing + elbow - pitchUp;
}

// 小剣を取り出す（attackT 0→1）: 左手を腰の後ろへ回し（0）、すっと引き抜いて胸の前に構える（1）
const ULT_DRAW = [
  { t: 0, pose: (o) => {
    o.hipsYaw = 0.25; o.waistYaw = 0.4; o.neckYaw = -0.3; o.waistPitch = 0.05;
    o.lHipSwing = 0.3; o.lKnee = 0.4; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.4; o.rHipOut = 0.16; o.rFlat = 1;
    o.lShoulderSwing = -0.75; o.lShoulderOut = 0.45; o.lElbow = 0.55; o.daggerTilt = -0.2;
    o.rShoulderSwing = 0.1; o.rShoulderOut = 0.2; o.rElbow = 0.3; o.swordTilt = 1.0;
  } },
  { t: 0.45, ease: 'out', pose: (o) => { // 引き抜く: 腕が大きく弧を描いて上がる
    o.hipsYaw = 0.1; o.waistYaw = 0.1; o.neckYaw = 0.1; o.waistPitch = 0.0;
    o.lHipSwing = 0.35; o.lKnee = 0.45; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.4; o.rHipOut = 0.16; o.rFlat = 1;
    o.lShoulderSwing = 0.9; o.lShoulderOut = 0.7; o.lElbow = 1.6; o.daggerTilt = 2.5;
    o.rShoulderSwing = 0.1; o.rShoulderOut = 0.2; o.rElbow = 0.3; o.swordTilt = 1.0;
  } },
  { t: 1, ease: 'inout', pose: (o) => { // 小剣を顔の前にかざす
    o.hipsYaw = -0.25; o.waistYaw = -0.35; o.neckYaw = 0.5; o.waistPitch = 0.1;
    o.lHipSwing = 0.5; o.lKnee = 0.6; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.3; o.rKnee = 0.4; o.rHipOut = 0.16; o.rFlat = 0.8;
    o.lShoulderSwing = 1.2; o.lShoulderOut = -0.2; o.lShoulderTwist = 0.4; o.lElbow = 1.5; o.daggerTilt = 2.7 - 0.6;
    o.rShoulderSwing = 0.1; o.rShoulderOut = 0.2; o.rElbow = 0.3; o.swordTilt = 1.0;
  } },
];
const ultDraw = (ctx, o) => keyed(ctx.attackT, ULT_DRAW, o);

// 小剣を投げる（attackT 0→1）: 振りかぶり（0）→ 手を離す（0.5）→ 振り抜き（1）
const ULT_THROW = [
  { t: 0, pose: (o) => {
    o.hipsYaw = -0.4; o.waistYaw = -0.7; o.neckYaw = 0.95; o.waistPitch = -0.1;
    o.lHipSwing = 0.5; o.lKnee = 0.6; o.lHipOut = 0.14; o.lFlat = 1;
    o.rHipSwing = -0.35; o.rKnee = 0.55; o.rHipOut = 0.16; o.rFlat = 0.6;
    o.lShoulderSwing = 2.2; o.lShoulderOut = 0.5; o.lElbow = 1.7; o.daggerTilt = 3.9 - 0.2;
    o.rShoulderSwing = 0.5; o.rShoulderOut = 0.5; o.rElbow = 0.5; o.swordTilt = 1.0;
  } },
  { t: 0.5, ease: 'in', pose: (o) => {
    o.hipsYaw = 0.2; o.waistYaw = 0.45; o.neckYaw = -0.5; o.waistPitch = 0.3; o.hipsPitch = 0.08;
    o.lHipSwing = 0.8; o.lKnee = 0.8; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.55; o.rKnee = 0.35; o.rHipOut = 0.12; o.rFlat = 0.25;
    o.lShoulderSwing = 1.55; o.lShoulderOut = 0.0; o.lElbow = 0.1; o.daggerTilt = 1.65;
    o.rShoulderSwing = -0.4; o.rShoulderOut = 0.6; o.rElbow = 0.6; o.swordTilt = 1.0;
  } },
  { t: 1, ease: 'out', pose: (o) => {
    o.hipsYaw = 0.3; o.waistYaw = 0.6; o.neckYaw = -0.7; o.waistPitch = 0.4; o.hipsPitch = 0.1;
    o.lHipSwing = 0.85; o.lKnee = 0.9; o.lHipOut = 0.1; o.lFlat = 1;
    o.rHipSwing = -0.5; o.rKnee = 0.4; o.rHipOut = 0.12; o.rFlat = 0.3;
    o.lShoulderSwing = 1.2; o.lShoulderOut = -0.35; o.lElbow = 0.1; o.daggerTilt = 1.3;
    o.rShoulderSwing = -0.35; o.rShoulderOut = 0.6; o.rElbow = 0.6; o.swordTilt = 1.0;
  } },
];
const ultThrow = (ctx, o) => keyed(ctx.attackT, ULT_THROW, o);

// 両手剣を構える（attackT 0→1）: 腰の前に下げた状態（0）から、肩の前へ立てて構える（1）
const ULT_SUMMON = [
  { t: 0, pose: (o) => {
    o.waistPitch = 0.1; o.neckPitch = -0.1;
    o.lHipSwing = 0.35; o.lKnee = 0.5; o.lHipOut = 0.16; o.lFlat = 1;
    o.rHipSwing = -0.15; o.rKnee = 0.45; o.rHipOut = 0.16; o.rFlat = 1;
    twoHand(o, 0.7, 0.8, -0.9, 0.45);
  } },
  { t: 0.55, ease: 'out', pose: (o) => { // 一気に掲げる
    o.waistPitch = -0.12; o.neckPitch = 0.2;
    o.lHipSwing = 0.4; o.lKnee = 0.6; o.lHipOut = 0.18; o.lFlat = 1;
    o.rHipSwing = -0.2; o.rKnee = 0.5; o.rHipOut = 0.18; o.rFlat = 1;
    twoHand(o, 2.0, 0.9, 1.35, 0.5);
  } },
  { t: 1, ease: 'inout', pose: (o) => { // 肩の前に立てて、ためる
    o.hipsYaw = -0.2; o.waistYaw = -0.25; o.neckYaw = 0.35; o.waistPitch = 0.08; o.neckPitch = 0.05;
    o.lHipSwing = 0.5; o.lKnee = 0.7; o.lHipOut = 0.18; o.lFlat = 1;
    o.rHipSwing = -0.3; o.rKnee = 0.55; o.rHipOut = 0.2; o.rFlat = 0.9;
    twoHand(o, 1.3, 1.25, 1.05, 0.5);
  } },
];
const ultSummon = (ctx, o) => keyed(ctx.attackT, ULT_SUMMON, o);

// 飛びかかる直前: 腰を落として、剣を後ろへ引く
function ultWindup(ctx, o) {
  o.ground = 0;
  o.hipsYaw = -0.3; o.waistYaw = -0.55; o.neckYaw = 0.8; o.hipsPitch = 0.2; o.waistPitch = 0.2; o.neckPitch = -0.2;
  o.lHipSwing = 0.8; o.lKnee = 1.0; o.lHipOut = 0.14; o.lAnkle = -0.3;
  o.rHipSwing = -0.5; o.rKnee = 0.6; o.rHipOut = 0.16; o.rAnkle = -0.5;
  twoHand(o, 0.45, 1.05, 0.2, 0.4);
  o.rShoulderOut = 0.1; o.lShoulderOut = -0.1;
}

// 飛びかかり: 体を水平に寝かせ、両手で握った剣を先頭に一直線
function ultDash(ctx, o) {
  o.ground = 0;
  o.hipsPitch = 0.75; o.waistPitch = 0.3; o.neckPitch = -0.55;
  o.lHipSwing = -0.7; o.lKnee = 0.3; o.lHipOut = 0.1; o.lAnkle = -0.6;
  o.rHipSwing = -0.95; o.rKnee = 0.15; o.rHipOut = 0.1; o.rAnkle = -0.7;
  twoHand(o, 1.85, 0.12, 1.1, 0.18); // 体が前へ倒れている分（約1.05）を足して、刃を進行方向へ向ける
}

// 斬り抜けたあと: 空中で体を起こし、剣を振り抜いた形で止まる
function ultFinish(ctx, o) {
  o.ground = 0;
  o.hipsYaw = 0.3; o.waistYaw = 0.55; o.neckYaw = -0.8; o.hipsPitch = 0.1; o.waistPitch = 0.25;
  o.lHipSwing = 0.5; o.lKnee = 0.9; o.lHipOut = 0.12; o.lAnkle = -0.4;
  o.rHipSwing = -0.3; o.rKnee = 0.5; o.rHipOut = 0.14; o.rAnkle = -0.5;
  twoHand(o, 0.65, 0.5, -0.25, 0.3);
  o.rShoulderOut = 0.5; o.lShoulderOut = 0.2;
}

// 跳び上がって、剣を頭上へ振りかぶる
function ultLeap(ctx, o) {
  const t = ctx.time;
  o.ground = 0;
  o.waistPitch = -0.3; o.hipsPitch = -0.05; o.neckPitch = 0.3;
  o.lHipSwing = 0.9; o.lKnee = 1.4; o.lHipOut = 0.1; o.lAnkle = -0.3;
  o.rHipSwing = 0.3; o.rKnee = 1.5; o.rHipOut = 0.12; o.rAnkle = -0.3;
  twoHand(o, 2.95, 0.5, 1.15, 0.4);
  o.rShoulderTwist = 0.2; o.waistRoll = 0.02 * sin(t * 40); // 力がこもって震える
}

// 着地: 片膝をついて、剣を地面へ突き立てた形
function ultLand(ctx, o) {
  kneelOnSword(o);
  o.hipsPitch = 0.2; o.waistPitch = 0.5; o.neckPitch = 0.4;
}

// ============================================================
// バット用のポーズ（野球の動きを全身で）
//
// 参考にした野球の動作（打撃）: 構え → ため（体重を後ろ足へ・前足を上げる）→ 踏み込み（前足を着く）→ 骨盤の回転が先に始まり、
// 肩・腕・バットが遅れてついてくる（下半身→体幹→腕の順）→ 打撃 → フォロースルー（バットが肩の上へ巻き込む）。
// （投球）: 脚上げ → 踏み込み → 腕を引いてためる → 腰の回転から腕が振られる → リリース → フォロースルー。
//
// 向き（キャラは +Z を向く。+yaw は左へ回る）: 右打ちの構えは、体を右へ向けて（負の yaw）左肩を相手に向け、
// 首だけ相手を見る。前足は左足。足を踏み出す向きは、腰を回してあるので hipOut（外へ開く）で表す。
// ============================================================
const bset = (o, f) => Object.assign(o, f);
const mirrorPose = (o) => {
  for (const f of LIMB) { const l = o['l' + f]; o['l' + f] = o['r' + f]; o['r' + f] = l; }
  for (const f of ['hipsYaw', 'waistYaw', 'neckYaw', 'hipsRoll', 'waistRoll', 'neckRoll', 'hipsX']) o[f] = -o[f];
  const t = o.swordTilt; o.swordTilt = o.daggerTilt; o.daggerTilt = t;
};

// 右打ちの構え（体は右向き、首は相手を見る。体重は後ろ足、膝はゆるめる）
const STANCE = {
  hipsYaw: -0.8, waistYaw: -0.5, neckYaw: 1.2, hipsPitch: 0.1, waistPitch: 0.2, neckPitch: -0.05, hipsX: -0.08, hipsZ: 0,
  lHipSwing: 0.05, lKnee: 0.5, lHipOut: 0.4, lFlat: 1,
  rHipSwing: 0.1, rKnee: 0.6, rHipOut: 0.4, rFlat: 1,
};
// 両手で握った構え（バットを右肩の後ろへ立てる）
const handsBack = (o, dy = 0) => bset(o, {
  rShoulderSwing: 0.75 + dy, rShoulderOut: 0.4, rShoulderTwist: 0.15, rElbow: 1.9, swordTilt: 1.2 + dy,
  lShoulderSwing: 1.0 + dy, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.7,
});

// 持ち歩き（バットを右肩にかつぐ）。剣の carrySword のバット版。fight は打者の構え全体
export function carryBat(name, ctx, o) {
  const t = ctx.time;
  switch (name) {
    case 'stand': // 右肩にバットをかついで、力を抜いて立つ。左手は腰
      bset(o, { rShoulderSwing: 0.45, rShoulderOut: 0.4, rShoulderTwist: 0.1, rElbow: 1.95 + 0.03 * sin(t * 1.6), swordTilt: 0.75, swordTwist: 0 });
      o.lShoulderOut = 0.35; o.lElbow = 0.5;
      break;
    case 'fight': { // 打者の構え: 小さく体を揺らし、バットをゆらす（ワッグル）
      const rock = sin(t * 3.4);
      bset(o, STANCE);
      handsBack(o);
      o.hipsX = -0.1 + 0.03 * rock;
      o.hipsRoll = -0.04 * rock;
      o.waistPitch += 0.02 * rock;
      o.lKnee += 0.06 * rock; o.rKnee -= 0.05 * rock;
      o.swordTilt += 0.1 * sin(t * 6.8);         // バットをゆらす
      o.rElbow += 0.07 * sin(t * 6.8 + 0.5);
      o.lElbow += 0.07 * sin(t * 6.8 + 0.5);
      break;
    }
    case 'walk':
      bset(o, { rShoulderSwing: 0.45 + (o.rShoulderSwing - 0.04) * 0.12, rShoulderOut: 0.4, rShoulderTwist: 0.1, rElbow: 1.95, swordTilt: 0.75, swordTwist: 0 });
      break;
    case 'run':
      bset(o, { rShoulderSwing: 0.6 + (o.rShoulderSwing - 0.12) * 0.1, rShoulderOut: 0.45, rShoulderTwist: 0.1, rElbow: 1.9, swordTilt: 0.95, swordTwist: 0 });
      break;
    case 'crouch': case 'land':
      bset(o, { rShoulderSwing: 0.5, rShoulderOut: 0.4, rElbow: 1.9, swordTilt: 0.8 });
      break;
    case 'air':
      bset(o, { rShoulderSwing: 0.8, rShoulderOut: 0.5, rElbow: 1.7, swordTilt: 0.9 });
      break;
    default:
      break;
  }
}

// ---- 標準のスイング（attackB1）。0.5 でボールを捉える ----
const SWING = [
  { t: 0, pose: (o) => { bset(o, STANCE); handsBack(o); } },
  { t: 0.14, ease: 'inout', pose: (o) => { // ため: 体重を後ろ足へ、前足（左）を上げる
    bset(o, STANCE); handsBack(o, -0.12);
    bset(o, { hipsX: -0.18, hipsYaw: -0.95, waistYaw: -0.55, hipsPitch: 0.12, lHipSwing: 0.9, lKnee: 1.2, lHipOut: 0.25, rKnee: 0.8 });
  } },
  { t: 0.3, ease: 'out', pose: (o) => { // 踏み込み: 前足を相手側へ大きく踏み出して着く。肩は閉じたまま（コイル）
    bset(o, STANCE); handsBack(o, -0.2);
    bset(o, { hipsX: -0.04, hipsYaw: -0.9, waistYaw: -0.8, hipsPitch: 0.12, lHipSwing: 0.1, lKnee: 0.4, lHipOut: 0.85, rKnee: 0.75, rHipOut: 0.35, waistPitch: 0.24 });
  } },
  { t: 0.43, ease: 'in', pose: (o) => { // 腰が先に回る。肩と腕とバットは遅れて、バットはまだ立ったまま
    bset(o, STANCE);
    bset(o, { hipsYaw: -0.1, waistYaw: -0.65, hipsPitch: 0.1, waistPitch: 0.26, neckYaw: 0.7, hipsX: 0.0, lHipSwing: 0.1, lKnee: 0.35, lHipOut: 0.85, rKnee: 0.5, rHipOut: 0.4, rFlat: 0.55,
      rShoulderSwing: 0.95, rShoulderOut: 0.35, rShoulderTwist: 0.15, rElbow: 1.35, swordTilt: 1.2,
      lShoulderSwing: 1.1, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.3 });
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 打撃: 前足で踏ん張り、後ろ足はつま先立ち。腕とバットが水平に伸びる
    bset(o, STANCE);
    bset(o, { hipsYaw: 0.25, waistYaw: -0.45, hipsPitch: 0.08, waistPitch: 0.28, neckYaw: 0.4, neckPitch: 0.1, hipsX: 0.04, lHipSwing: 0.1, lKnee: 0.15, lHipOut: 0.9, rKnee: 0.4, rHipOut: 0.35, rFlat: 0.2,
      rShoulderSwing: 1.5, rShoulderOut: 0.0, rShoulderTwist: 0.15, rElbow: 0.2, swordTilt: 1.7,
      lShoulderSwing: 1.5, lShoulderOut: -0.4, lShoulderTwist: 0.7, lElbow: 0.3 });
  } },
  { t: 0.64, ease: 'out', pose: (o) => { // フォロースルー: 腰も肩も大きく回り、バットが体に巻きつく
    bset(o, STANCE);
    bset(o, { hipsYaw: 0.9, waistYaw: 0.4, hipsPitch: 0.06, waistPitch: 0.2, neckYaw: -0.3, hipsX: 0.1, lHipSwing: 0.05, lKnee: 0.12, lHipOut: 0.85, rKnee: 0.7, rHipOut: 0.2, rFlat: 0.0,
      rShoulderSwing: 1.3, rShoulderOut: -0.2, rShoulderTwist: 0.15, rElbow: 1.1, swordTilt: 0.8,
      lShoulderSwing: 1.2, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.2 });
  } },
  { t: 1, ease: 'out', pose: (o) => { // 振り終わり: バットが左肩の後ろへ。体重は前足
    bset(o, STANCE);
    bset(o, { hipsYaw: 0.75, waistYaw: 0.5, hipsPitch: 0.08, waistPitch: 0.15, neckYaw: -0.4, hipsX: 0.1, lHipSwing: 0.05, lKnee: 0.25, lHipOut: 0.8, rKnee: 0.6, rHipOut: 0.2, rFlat: 0.3,
      rShoulderSwing: 1.1, rShoulderOut: -0.15, rShoulderTwist: 0.15, rElbow: 1.6, swordTilt: 0.5,
      lShoulderSwing: 1.0, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.5 });
  } },
];
const attackB1 = (ctx, o) => keyed(ctx.attackT, SWING, o);

// ---- 強打のスイング（attackBP。スキル1）: ためも踏み込みも回転も、ひと回り大きい ----
const POWER = [
  { t: 0, pose: (o) => { bset(o, STANCE); handsBack(o); } },
  { t: 0.18, ease: 'inout', pose: (o) => { // 深くためる: 大きく脚を上げ、体重を深く後ろへ。バットを後ろへ倒す
    bset(o, STANCE); handsBack(o, -0.3);
    bset(o, { hipsX: -0.26, hipsYaw: -1.1, waistYaw: -0.65, hipsPitch: 0.16, lHipSwing: 1.3, lKnee: 1.5, lHipOut: 0.2, rKnee: 1.0, waistPitch: 0.26, neckYaw: 1.5 });
  } },
  { t: 0.34, ease: 'out', pose: (o) => { // 大きな踏み込み
    bset(o, STANCE); handsBack(o, -0.35);
    bset(o, { hipsX: -0.05, hipsYaw: -1.1, waistYaw: -0.95, hipsPitch: 0.18, lHipSwing: 0.1, lKnee: 0.45, lHipOut: 1.05, rKnee: 0.95, rHipOut: 0.4, waistPitch: 0.3, neckYaw: 1.6 });
  } },
  { t: 0.45, ease: 'in', pose: (o) => {
    bset(o, STANCE);
    bset(o, { hipsYaw: -0.05, waistYaw: -0.85, hipsPitch: 0.12, waistPitch: 0.3, neckYaw: 0.9, lHipSwing: 0.1, lKnee: 0.35, lHipOut: 1.0, rKnee: 0.6, rHipOut: 0.4, rFlat: 0.45,
      rShoulderSwing: 0.8, rShoulderOut: 0.3, rShoulderTwist: 0.15, rElbow: 1.3, swordTilt: 0.9,
      lShoulderSwing: 1.0, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.3 });
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 打撃: 全身が伸びきる
    bset(o, STANCE);
    bset(o, { hipsYaw: 0.4, waistYaw: -0.5, hipsPitch: 0.06, waistPitch: 0.32, neckYaw: 0.5, neckPitch: 0.12, hipsX: 0.06, lHipSwing: 0.1, lKnee: 0.1, lHipOut: 1.05, rKnee: 0.35, rHipOut: 0.35, rFlat: 0.1,
      rShoulderSwing: 1.5, rShoulderOut: 0.05, rShoulderTwist: 0.15, rElbow: 0.1, swordTilt: 1.6,
      lShoulderSwing: 1.5, lShoulderOut: -0.4, lShoulderTwist: 0.7, lElbow: 0.2 });
  } },
  { t: 0.64, ease: 'out', pose: (o) => { // 大きく振り抜く: 体が後ろへ反り、バットが高く巻き上がる
    bset(o, STANCE);
    bset(o, { hipsYaw: 1.2, waistYaw: 0.55, hipsPitch: -0.04, waistPitch: 0.05, neckYaw: -0.5, neckPitch: -0.1, hipsX: 0.12, lHipSwing: 0.0, lKnee: 0.12, lHipOut: 1.0, rKnee: 0.5, rHipOut: 0.2, rFlat: 0.0,
      rShoulderSwing: 1.6, rShoulderOut: -0.3, rShoulderTwist: 0.15, rElbow: 1.2, swordTilt: 0.5,
      lShoulderSwing: 1.5, lShoulderOut: -0.35, lShoulderTwist: 0.7, lElbow: 1.3 });
  } },
  { t: 1, ease: 'out', pose: (o) => { // フィニッシュ: バットを肩にかついだまま、じっとボールの行方を見る
    bset(o, STANCE);
    bset(o, { hipsYaw: 1.0, waistYaw: 0.6, hipsPitch: 0.0, waistPitch: 0.0, neckYaw: -0.6, neckPitch: -0.2, hipsX: 0.12, lHipSwing: 0.0, lKnee: 0.15, lHipOut: 0.9, rKnee: 0.45, rHipOut: 0.2, rFlat: 0.2,
      rShoulderSwing: 1.3, rShoulderOut: 0.0, rShoulderTwist: 0.15, rElbow: 1.7, swordTilt: 0.4,
      lShoulderSwing: 1.2, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.7 });
  } },
];
const attackBP = (ctx, o) => keyed(ctx.attackT, POWER, o);

// ---- 素早いスイング（attackBQ。スキル3の連打）: 左手でボールを軽く上げ、小さく踏み込んで、コンパクトに振る。0.5 で打つ。1 → 0 でつながる ----
const QREADY = (o) => { // 右手でバットを肩へ、左手にボール（体の前）
  bset(o, STANCE);
  bset(o, { hipsX: -0.14, rShoulderSwing: 0.75, rShoulderOut: 0.4, rShoulderTwist: 0.15, rElbow: 1.9, swordTilt: 1.2,
    lShoulderSwing: 1.1, lShoulderOut: 0.2, lShoulderTwist: 0.3, lElbow: 0.7 });
};
const QUICK = [
  { t: 0, pose: QREADY },
  { t: 0.12, ease: 'out', pose: (o) => { // ボールを上へ放る
    QREADY(o);
    bset(o, { neckPitch: -0.3, waistPitch: 0.08, lShoulderSwing: 2.2, lShoulderOut: 0.1, lElbow: 0.25 });
  } },
  { t: 0.27, ease: 'out', pose: (o) => { // 左手を戻して握り、小さく踏み込む
    bset(o, STANCE); handsBack(o, -0.15);
    bset(o, { hipsX: -0.06, hipsYaw: -0.95, waistYaw: -0.7, lHipSwing: 0.4, lKnee: 0.7, lHipOut: 0.65, rKnee: 0.7 });
  } },
  { t: 0.42, ease: 'in', pose: (o) => {
    bset(o, STANCE);
    bset(o, { hipsYaw: -0.15, waistYaw: -0.6, neckYaw: 0.7, lKnee: 0.3, lHipOut: 0.85, rKnee: 0.5, rFlat: 0.5, waistPitch: 0.24,
      rShoulderSwing: 0.95, rShoulderOut: 0.35, rShoulderTwist: 0.15, rElbow: 1.3, swordTilt: 1.2, lShoulderSwing: 1.1, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.3 });
  } },
  { t: 0.5, ease: 'in', pose: (o) => SWING[4].pose(o) },
  { t: 0.7, ease: 'out', pose: (o) => SWING[5].pose(o) },
  { t: 1, ease: 'inout', pose: QREADY },
];
const attackBQ = (ctx, o) => keyed(ctx.attackT, QUICK, o);

// ---- ボールを放り上げて打つ（attackB3）: 左手でボールを上げ、握り直して、標準のスイング。ボールを捉えるのは 0.59 ----
const TOSS_HEAD = [
  { t: 0, pose: (o) => { // 右手だけでバットをかまえ、左手にボール
    bset(o, STANCE);
    bset(o, { rShoulderSwing: 0.75, rShoulderOut: 0.4, rShoulderTwist: 0.15, rElbow: 1.9, swordTilt: 1.2, lShoulderSwing: 0.5, lShoulderOut: 0.3, lShoulderTwist: 0.2, lElbow: 1.0 });
  } },
  { t: 0.12, ease: 'out', pose: (o) => { // 左手でボールを高く放り上げる。体は伸び上がる
    bset(o, STANCE);
    bset(o, { hipsYaw: -0.6, waistYaw: -0.45, neckYaw: 0.5, neckPitch: -0.45, waistPitch: 0.0, lKnee: 0.3, rKnee: 0.35, lHipOut: 0.3, rHipOut: 0.3,
      rShoulderSwing: 0.8, rShoulderOut: 0.4, rShoulderTwist: 0.15, rElbow: 1.9, swordTilt: 1.2, lShoulderSwing: 2.5, lShoulderOut: 0.1, lShoulderTwist: 0.2, lElbow: 0.3 });
  } },
  { t: 0.3, ease: 'inout', pose: (o) => { // 左手を戻して両手で握り直す。目はボールを追う
    bset(o, STANCE); handsBack(o, -0.1);
    bset(o, { neckPitch: -0.3, hipsX: -0.15, hipsYaw: -0.9, waistYaw: -0.55, lHipSwing: 0.9, lKnee: 1.2, lHipOut: 0.25, rKnee: 0.8 });
  } },
];
// 標準のスイングの 0.3〜1 を、TOSS の 0.46〜1 へ割り当てる（打撃 0.5 → 0.59）
const TOSS_KEYS = [
  ...TOSS_HEAD,
  ...SWING.filter((k) => k.t >= 0.3).map((k) => ({ ...k, t: 0.46 + (k.t - 0.3) / 0.7 * 0.54 })),
];
const attackB3 = (ctx, o) => keyed(ctx.attackT, TOSS_KEYS, o);

// ---- 一回転して振り回す（attackB2）: 深く沈んで体をねじり（コイル）、腰から回り始めて、肩と腕が遅れて続く ----
const TWO_PI_ = Math.PI * 2;
function attackB2(ctx, o) {
  const t = ctx.attackT;
  const coil = smooth(t / 0.3);                                   // ためる（逆向きへねじりながら沈む）
  const hipsSp = smooth((t - 0.28) / 0.46);                       // 腰が先に回る
  const upperSp = smooth((t - 0.34) / 0.46);                      // 肩・腕は遅れて続く
  const rec = smooth((t - 0.8) / 0.2);
  const hips = -1.3 * coil + (1.3 + TWO_PI_ + 0.4) * hipsSp;      // -1.3 → 5.4
  const upper = -0.8 * coil + (0.8 + TWO_PI_ + 0.1) * upperSp;    // 肩は少し遅れる
  const ext = smooth((t - 0.16) / 0.2);                           // 腕がバットごと水平に伸びる
  o.hipsYaw = 0.5 * hips * (1 - rec) + 0.5 * rec * 0.4;
  o.waistYaw = (upper - hips * 0.5) * (1 - rec) + 0.4 * rec * 0.5;
  o.neckYaw = -0.2 * sin(hipsSp * PI) - 0.2 * rec;
  o.hipsPitch = 0.22 * coil * (1 - hipsSp) + 0.05;
  o.waistPitch = 0.3 * coil * (1 - hipsSp) + 0.12;
  o.hipsRoll = -0.12 * sin(hipsSp * PI);                          // 回る間、体を内側へ傾ける
  o.waistRoll = -0.08 * sin(upperSp * PI);
  o.hipsX = -0.12 * coil * (1 - hipsSp) + 0.05 * hipsSp;
  // 脚: 深く沈んで、回りながら立ち上がる
  o.lHipSwing = 0.3; o.lKnee = 0.5 + 0.5 * coil * (1 - hipsSp); o.lHipOut = 0.45 + 0.2 * coil; o.lFlat = 1;
  o.rHipSwing = 0.0; o.rKnee = 0.55 + 0.5 * coil * (1 - hipsSp); o.rHipOut = 0.45 + 0.2 * coil; o.rFlat = 1 - 0.5 * sin(hipsSp * PI);
  // 腕: ためでは構えのまま、そこから両腕を水平にまっすぐ伸ばす
  o.rShoulderSwing = 0.75 + 0.78 * ext; o.rShoulderOut = 0.4 * (1 - ext) + 0.05; o.rShoulderTwist = 0.15;
  o.rElbow = 1.9 * (1 - ext) + 0.1 * ext; o.swordTilt = 1.2 + 0.5 * ext;
  o.lShoulderSwing = 1.0 + 0.55 * ext; o.lShoulderOut = -0.3 - 0.1 * ext; o.lShoulderTwist = 0.7; o.lElbow = 1.7 * (1 - ext) + 0.15 * ext;
  // 振り終わり: バットを肩へ
  o.rShoulderSwing -= 0.3 * rec; o.rElbow += 1.3 * rec; o.swordTilt -= 0.9 * rec;
  o.lShoulderSwing -= 0.3 * rec; o.lElbow += 1.3 * rec;
}

// ---- スキル1の最初: 予告ホームラン。バットを相手へまっすぐ向ける ----
const CALL = [
  { t: 0, pose: (o) => { bset(o, STANCE); handsBack(o); } },
  { t: 0.4, ease: 'inout', pose: (o) => { // 体を相手へ向け、バットを真っすぐ突き出す。左手は腰
    bset(o, STANCE);
    bset(o, { hipsYaw: -0.35, waistYaw: -0.2, neckYaw: 0.4, hipsX: 0.0, waistPitch: 0.1, lKnee: 0.4, rKnee: 0.4, lHipOut: 0.4, rHipOut: 0.4,
      rShoulderSwing: 1.55, rShoulderOut: 0.1, rShoulderTwist: 0.15, rElbow: 0.1, swordTilt: 1.65,
      lShoulderSwing: -0.1, lShoulderOut: 0.55, lShoulderTwist: 0.2, lElbow: 1.7 });
  } },
  { t: 0.75, ease: 'inout', pose: (o) => { // そのまま、金属になったバットを突きつける（小さく震える）
    bset(o, STANCE);
    bset(o, { hipsYaw: -0.35, waistYaw: -0.2, neckYaw: 0.4, waistPitch: 0.1, lKnee: 0.4, rKnee: 0.4, lHipOut: 0.4, rHipOut: 0.4,
      rShoulderSwing: 1.55, rShoulderOut: 0.1, rShoulderTwist: 0.15, rElbow: 0.1, swordTilt: 1.67,
      lShoulderSwing: -0.1, lShoulderOut: 0.55, lShoulderTwist: 0.2, lElbow: 1.7 });
  } },
  { t: 1, ease: 'in', pose: (o) => { bset(o, STANCE); handsBack(o, -0.1); o.hipsX = -0.16; } }, // 構えに戻る（ため）
];
const batCall = (ctx, o) => {
  keyed(ctx.attackT, CALL, o);
  o.swordTilt += 0.03 * sin(ctx.time * 60) * (ctx.attackT > 0.4 ? 1 : 0);
};

// ---- 投球フォーム（batPitch）: バットを投げつけるときの全身。0.6 でリリース ----
//   構え → 脚上げ（片脚立ちでバランス）→ 踏み込みと同時に両手を割る → 腕を引いてためる（コッキング）→ 腰が回り、腕が振られて加速 → リリース → 体が前へ倒れて、後ろ足が前へ
const PITCH = [
  { t: 0, pose: (o) => { // セットポジション: 両手を胸の前に
    bset(o, { hipsYaw: -0.5, waistYaw: -0.3, neckYaw: 0.8, waistPitch: 0.1, lKnee: 0.25, rKnee: 0.25, lHipOut: 0.2, rHipOut: 0.2, lFlat: 1, rFlat: 1,
      rShoulderSwing: 1.0, rShoulderOut: 0.1, rShoulderTwist: 0.15, rElbow: 1.9, swordTilt: 1.0,
      lShoulderSwing: 1.0, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.9 });
  } },
  { t: 0.22, ease: 'inout', pose: (o) => { // 脚上げ: 左ひざを胸まで上げ、軸足で立つ。体は横向き
    bset(o, { hipsYaw: -1.0, waistYaw: -0.5, neckYaw: 1.3, hipsPitch: -0.04, waistPitch: 0.06, hipsX: -0.06, lHipSwing: 1.55, lKnee: 1.7, lHipOut: 0.1, rKnee: 0.25, rHipOut: 0.15, rFlat: 1,
      rShoulderSwing: 1.1, rShoulderOut: 0.1, rShoulderTwist: 0.15, rElbow: 1.9, swordTilt: 1.0,
      lShoulderSwing: 1.1, lShoulderOut: -0.3, lShoulderTwist: 0.7, lElbow: 1.9 });
  } },
  { t: 0.4, ease: 'in', pose: (o) => { // 踏み込み: 左足が大きく前へ。両手が離れ、左腕は相手へ、右腕は後ろへ
    bset(o, { hipsYaw: -1.1, waistYaw: -0.6, neckYaw: 1.4, hipsPitch: 0.08, waistPitch: 0.05, hipsX: -0.02, lHipSwing: 0.3, lKnee: 0.3, lHipOut: 1.0, rKnee: 0.45, rHipOut: 0.3, rFlat: 1,
      rShoulderSwing: -0.2, rShoulderOut: 1.0, rShoulderTwist: 0.15, rElbow: 0.5, swordTilt: 1.2,
      lShoulderSwing: 0.2, lShoulderOut: 1.45, lShoulderTwist: 0.3, lElbow: 0.1 });
  } },
  { t: 0.5, ease: 'out', pose: (o) => { // コッキング: 肘を肩の高さに、手は頭の後ろへ。胸が反る
    bset(o, { hipsYaw: -0.6, waistYaw: -0.85, neckYaw: 1.0, hipsPitch: 0.04, waistPitch: -0.22, hipsX: 0.0, lHipSwing: 0.2, lKnee: 0.25, lHipOut: 1.0, rKnee: 0.45, rHipOut: 0.3, rFlat: 0.8,
      rShoulderSwing: 0.1, rShoulderOut: 1.5, rShoulderTwist: 0.15, rElbow: 1.7, swordTilt: 0.9,
      lShoulderSwing: 0.3, lShoulderOut: 1.3, lShoulderTwist: 0.3, lElbow: 0.3 });
  } },
  { t: 0.6, ease: 'in', pose: (o) => { // 加速→リリース: 腰が開き、胸が相手へ。右腕が頭の上から前へ振り抜かれる
    bset(o, { hipsYaw: 0.1, waistYaw: -0.25, neckYaw: 0.2, hipsPitch: 0.04, waistPitch: 0.5, hipsX: 0.05, lHipSwing: 0.1, lKnee: 0.15, lHipOut: 1.0, rHipSwing: 0.5, rKnee: 0.6, rHipOut: 0.3, rFlat: 0.2,
      rShoulderSwing: 2.5, rShoulderOut: 0.5, rShoulderTwist: 0.15, rElbow: 0.2, swordTilt: 1.45,
      lShoulderSwing: 0.7, lShoulderOut: 0.5, lShoulderTwist: 0.3, lElbow: 1.5 });
  } },
  { t: 0.76, ease: 'out', pose: (o) => { // フォロースルー: 上体が深く前へ倒れ、右腕は体の左へ巻き込む。後ろ足が前へ振り出される
    bset(o, { hipsYaw: 0.5, waistYaw: 0.4, neckYaw: -0.3, hipsPitch: 0.2, waistPitch: 0.6, hipsX: 0.08, lHipSwing: 0.2, lKnee: 0.3, lHipOut: 0.9, rHipSwing: 1.0, rKnee: 0.9, rHipOut: 0.2, rFlat: 0,
      rShoulderSwing: 1.2, rShoulderOut: -0.5, rShoulderTwist: 0.15, rElbow: 0.6, swordTilt: 1.2,
      lShoulderSwing: 0.4, lShoulderOut: 0.7, lShoulderTwist: 0.3, lElbow: 1.0 });
  } },
  { t: 1, ease: 'inout', pose: (o) => { // 守備の構え: 膝を曲げ、上体を前へ
    bset(o, { hipsYaw: 0.2, waistYaw: 0.15, neckYaw: 0.0, hipsPitch: 0.2, waistPitch: 0.5, lHipSwing: 0.5, lKnee: 0.8, lHipOut: 0.45, rHipSwing: 0.4, rKnee: 0.8, rHipOut: 0.45,
      rShoulderSwing: 0.5, rShoulderOut: 0.3, rElbow: 0.6, swordTilt: 1.0, lShoulderSwing: 0.5, lShoulderOut: 0.3, lElbow: 0.6 });
  } },
];
const batPitch = (ctx, o) => keyed(ctx.attackT, PITCH, o);
// 左腕で投げる版（必殺技の鉄球）
const batPitchL = (ctx, o) => {
  keyed(ctx.attackT, PITCH, o);
  mirrorPose(o);
  // バットは右肩にかついだまま（右腕は、バランスをとる程度に少しだけ動く）
  const sway = 0.15 * sin(ctx.attackT * PI);
  bset(o, { rShoulderSwing: 0.45 + sway, rShoulderOut: 0.4 + sway, rShoulderTwist: 0.1, rElbow: 1.95, swordTilt: 0.75, swordTwist: 0, swordRoll: 0 });
};

// ---- 必殺技: 鉄球を懐から取り出す（左手がジャケットの中へ → 引き抜いて、ボールをにぎる）----
const BALLDRAW = [
  { t: 0, pose: (o) => { bset(o, { hipsYaw: -0.3, waistYaw: -0.2, neckYaw: 0.5, waistPitch: 0.1, lKnee: 0.3, rKnee: 0.3, lHipOut: 0.3, rHipOut: 0.3,
    rShoulderSwing: 0.45, rShoulderOut: 0.4, rElbow: 1.95, swordTilt: 0.75, lShoulderSwing: 0.2, lShoulderOut: 0.3, lElbow: 0.5 }); } },
  { t: 0.35, ease: 'out', pose: (o) => { // 上体を少し沈めて、左手を右の胸（懐）へ深く差し入れる
    bset(o, { hipsYaw: -0.5, waistYaw: -0.45, neckYaw: 0.8, waistPitch: 0.4, hipsPitch: 0.1, neckPitch: 0.35, lKnee: 0.55, rKnee: 0.55, lHipOut: 0.4, rHipOut: 0.4, hipsX: -0.08,
      rShoulderSwing: 0.45, rShoulderOut: 0.4, rElbow: 1.95, swordTilt: 0.75, lShoulderSwing: 1.1, lShoulderOut: -1.05, lShoulderTwist: 0.8, lElbow: 2.4 });
  } },
  { t: 0.7, ease: 'in', pose: (o) => { // 一気に引き抜いて、胸を開き、ボールを前へ突き出す
    bset(o, { hipsYaw: -0.1, waistYaw: -0.05, neckYaw: 0.2, waistPitch: -0.1, hipsPitch: 0.0, neckPitch: -0.1, lKnee: 0.35, rKnee: 0.35, lHipOut: 0.35, rHipOut: 0.35, hipsX: 0.04,
      rShoulderSwing: 0.45, rShoulderOut: 0.4, rElbow: 1.95, swordTilt: 0.75, lShoulderSwing: 1.6, lShoulderOut: 0.2, lShoulderTwist: 0.2, lElbow: 0.9 });
  } },
  { t: 1, ease: 'out', pose: (o) => { // ボールを握りしめて、投球の構え（体を横へ向ける）
    bset(o, { hipsYaw: -0.5, waistYaw: -0.3, neckYaw: 0.8, waistPitch: 0.1, lKnee: 0.3, rKnee: 0.3, lHipOut: 0.2, rHipOut: 0.2,
      rShoulderSwing: 0.45, rShoulderOut: 0.4, rElbow: 1.95, swordTilt: 0.75, lShoulderSwing: 1.1, lShoulderOut: -0.1, lShoulderTwist: 0.3, lElbow: 1.7 });
  } },
];
const batBallDraw = (ctx, o) => keyed(ctx.attackT, BALLDRAW, o);

// ---- スキル2の最後の一撃: 大きく振りかぶる右のパンチ（腰の回転で打つ）。0.55 で当たる ----
const HAYMAKER = [
  { t: 0, pose: (o) => { // 構え（ボクシングのガード）
    bset(o, { hipsYaw: -0.4, waistYaw: -0.2, neckYaw: 0.5, waistPitch: 0.15, lHipSwing: 0.5, lKnee: 0.5, lHipOut: 0.3, rHipSwing: -0.25, rKnee: 0.4, rHipOut: 0.3,
      rShoulderSwing: 0.9, rShoulderOut: 0.2, rShoulderTwist: 0.6, rElbow: 2.0, lShoulderSwing: 1.1, lShoulderOut: 0.1, lShoulderTwist: 0.5, lElbow: 1.9 });
  } },
  { t: 0.35, ease: 'inout', pose: (o) => { // 体重を後ろへ。体をひねって右拳を大きく引く
    bset(o, { hipsYaw: -1.0, waistYaw: -0.55, neckYaw: 1.2, hipsPitch: 0.1, waistPitch: 0.25, hipsX: -0.14, lHipSwing: 0.6, lKnee: 0.7, lHipOut: 0.4, rHipSwing: -0.1, rKnee: 0.75, rHipOut: 0.35,
      rShoulderSwing: -0.3, rShoulderOut: 0.9, rShoulderTwist: 0.3, rElbow: 1.3, lShoulderSwing: 1.4, lShoulderOut: 0.1, lShoulderTwist: 0.5, lElbow: 1.0 });
  } },
  { t: 0.55, ease: 'in', pose: (o) => { // 腰の回転から、拳が真っすぐ伸びる。後ろ足はつま先立ち
    bset(o, { hipsYaw: 0.35, waistYaw: 0.2, neckYaw: -0.2, hipsPitch: 0.08, waistPitch: 0.3, hipsX: 0.05, lHipSwing: 0.4, lKnee: 0.25, lHipOut: 0.5, rHipSwing: 0.1, rKnee: 0.45, rHipOut: 0.3, rFlat: 0.1,
      rShoulderSwing: 1.55, rShoulderOut: -0.05, rShoulderTwist: 0.2, rElbow: 0.08, lShoulderSwing: 0.9, lShoulderOut: 0.3, lShoulderTwist: 0.5, lElbow: 1.7 });
  } },
  { t: 1, ease: 'out', pose: (o) => { // 振り抜いた余韻
    bset(o, { hipsYaw: 0.6, waistYaw: 0.35, neckYaw: -0.3, hipsPitch: 0.1, waistPitch: 0.3, hipsX: 0.08, lHipSwing: 0.4, lKnee: 0.3, lHipOut: 0.5, rHipSwing: 0.2, rKnee: 0.5, rHipOut: 0.3,
      rShoulderSwing: 1.3, rShoulderOut: -0.2, rShoulderTwist: 0.2, rElbow: 0.4, lShoulderSwing: 0.8, lShoulderOut: 0.3, lShoulderTwist: 0.5, lElbow: 1.6 });
  } },
];
const batHaymaker = (ctx, o) => keyed(ctx.attackT, HAYMAKER, o);

// ---- 戻ってきたバットを片手でキャッチ（attackT 0〜1）----
const batCatch = (ctx, o) => {
  const t = smooth(ctx.attackT);
  bset(o, { hipsYaw: -0.2 * t, waistYaw: -0.15 * t, neckYaw: 0.3 * t, waistPitch: 0.12, lHipSwing: 0.3, lKnee: 0.45 + 0.1 * t, lHipOut: 0.35, rHipSwing: -0.1, rKnee: 0.45, rHipOut: 0.35,
    rShoulderSwing: 0.8 + 0.9 * t, rShoulderOut: 0.35, rShoulderTwist: 0.15, rElbow: 0.9 - 0.5 * t, swordTilt: 1.0,
    lShoulderSwing: 0.2, lShoulderOut: 0.7 * t + 0.3, lElbow: 0.6 });
};

// ---- スキル4: バットを空中へ放る（バットフリップ）。0.55 で手を離す ----
const BTOSS = [
  { t: 0, pose: (o) => { bset(o, STANCE); bset(o, { rShoulderSwing: 0.45, rShoulderOut: 0.4, rElbow: 1.95, swordTilt: 0.75, lShoulderSwing: 0.2, lShoulderOut: 0.3, lElbow: 0.6, hipsYaw: -0.4, waistYaw: -0.3 }); } },
  { t: 0.3, ease: 'out', pose: (o) => { // 沈み込んで、バットを下へ引く（反動）
    bset(o, { hipsYaw: -0.6, waistYaw: -0.4, neckYaw: 0.8, hipsPitch: 0.18, waistPitch: 0.3, hipsX: -0.1, lHipSwing: 0.8, lKnee: 1.0, lHipOut: 0.35, rHipSwing: 0.2, rKnee: 1.0, rHipOut: 0.35,
      rShoulderSwing: -0.1, rShoulderOut: 0.35, rElbow: 0.5, swordTilt: 0.9, lShoulderSwing: 0.5, lShoulderOut: 0.5, lElbow: 0.5 });
  } },
  { t: 0.55, ease: 'in', pose: (o) => { // 跳び上がりながら、右腕を振り上げてバットを放す
    bset(o, { hipsYaw: 0.1, waistYaw: 0.2, neckYaw: -0.1, neckPitch: -0.4, hipsPitch: -0.04, waistPitch: -0.25, lift: 0.5, lHipSwing: 0.6, lKnee: 1.2, lHipOut: 0.2, lAnkle: -0.4, rHipSwing: 0.0, rKnee: 0.5, rHipOut: 0.2, rAnkle: -0.5,
      rShoulderSwing: 2.9, rShoulderOut: 0.15, rElbow: 0.1, swordTilt: 1.5, lShoulderSwing: 0.5, lShoulderOut: 0.9, lElbow: 0.3 });
  } },
  { t: 1, ease: 'out', pose: (o) => { // 着地して、空を見上げる（バットを目で追う）
    bset(o, { hipsYaw: 0.0, waistYaw: 0.1, neckPitch: -0.55, waistPitch: -0.12, lHipSwing: 0.3, lKnee: 0.5, lHipOut: 0.3, rHipSwing: 0.0, rKnee: 0.45, rHipOut: 0.3,
      rShoulderSwing: 2.7, rShoulderOut: 0.2, rElbow: 0.3, swordTilt: 1.5, lShoulderSwing: 0.3, lShoulderOut: 0.8, lElbow: 0.4 });
  } },
];
const batToss = (ctx, o) => keyed(ctx.attackT, BTOSS, o);

// ---- スキル4: 空中のバットへ跳び上がる（右腕を高く伸ばす）----
function batLeap(ctx, o) {
  o.ground = 0;
  bset(o, { hipsYaw: -0.1, waistYaw: -0.1, neckPitch: -0.45, waistPitch: -0.3, hipsPitch: -0.05,
    lHipSwing: 0.9, lKnee: 1.4, lHipOut: 0.2, lAnkle: -0.3, rHipSwing: 0.2, rKnee: 1.5, rHipOut: 0.2, rAnkle: -0.3,
    rShoulderSwing: 3.05, rShoulderOut: 0.1, rShoulderTwist: 0.15, rElbow: 0.08, swordTilt: 1.5,
    lShoulderSwing: -0.2, lShoulderOut: 0.9, lElbow: 0.4 });
}

// ---- スキル4: つかんだバットを、全身で叩きつける（attackT 0〜1。両手・頭上から真下へ）----
const SMASH = [
  { t: 0, pose: (o) => { o.ground = 0; bset(o, { waistPitch: -0.3, neckPitch: 0.3, lHipSwing: 0.7, lKnee: 1.3, rHipSwing: 0.2, rKnee: 1.3, lHipOut: 0.2, rHipOut: 0.2 }); twoHand(o, 3.0, 0.6, 1.4, 0.35); } },
  { t: 0.5, ease: 'in', pose: (o) => { o.ground = 0; bset(o, { waistPitch: 0.3, hipsPitch: 0.1, neckPitch: 0.1, lHipSwing: 0.5, lKnee: 0.9, rHipSwing: 0.4, rKnee: 1.0, lHipOut: 0.2, rHipOut: 0.2 }); twoHand(o, 2.0, 0.6, -0.5, 0.35); } },
  { t: 1, ease: 'in', pose: (o) => { o.ground = 0; bset(o, { waistPitch: 0.75, hipsPitch: 0.2, neckPitch: -0.2, lHipSwing: 0.8, lKnee: 1.1, rHipSwing: 0.6, rKnee: 1.2, lHipOut: 0.25, rHipOut: 0.25 }); twoHand(o, 1.3, 0.4, -1.45, 0.35); } },
];
const batSmash = (ctx, o) => keyed(ctx.attackT, SMASH, o);

// ============================================================
// 吸血牙（両手の爪）用のポーズ
// 爪の向き pitch: 0 = 水平に前、π/2 = 真上、負 = 下向き（swordTilt = 肩の振り + 肘 − pitch）。左手は daggerTilt。
// ============================================================
const clawR = (o, swing, out, twist, elbow, pitch) => {
  o.rShoulderSwing = swing; o.rShoulderOut = out; o.rShoulderTwist = twist; o.rElbow = elbow; o.swordTilt = swing + elbow - pitch;
};
const clawL = (o, swing, out, twist, elbow, pitch) => {
  o.lShoulderSwing = swing; o.lShoulderOut = out; o.lShoulderTwist = twist; o.lElbow = elbow; o.daggerTilt = swing + elbow - pitch;
};
// 獲物を狙う低い構え（脚）
const FSTANCE = (o) => bset(o, {
  hipsPitch: 0.12, waistPitch: 0.25, neckPitch: -0.12, hipsX: 0,
  lHipSwing: 0.3, lKnee: 0.65, lHipOut: 0.3, lFlat: 1, rHipSwing: -0.2, rKnee: 0.55, rHipOut: 0.3, rFlat: 1,
});
const fReady = (o) => { FSTANCE(o); clawR(o, 0.95, 0.4, 0.1, 1.1, 0.35); clawL(o, 0.95, 0.4, 0.1, 1.1, 0.35); };

// 持ち歩き: 爪は下げて、構えでは両手を前へ
export function carryFang(name, ctx, o) {
  const t = ctx.time;
  switch (name) {
    case 'stand':
      clawR(o, 0.25 + (o.rShoulderSwing - 0.03) * 0.5, 0.28, 0.1, 0.6, -0.45);
      clawL(o, 0.25 + (o.lShoulderSwing + 0.03) * 0.5, 0.28, 0.1, 0.6, -0.45);
      break;
    case 'fight': { // 背をまるめ、爪を前へ。ゆらゆらと獲物をうかがう
      const sway = sin(t * 2.6);
      FSTANCE(o);
      o.hipsRoll = 0.03 * sway; o.waistPitch += 0.02 * sway;
      clawR(o, 0.95 + 0.06 * sway, 0.4, 0.1, 1.1, 0.35 + 0.1 * sway);
      clawL(o, 0.95 - 0.06 * sway, 0.4, 0.1, 1.1, 0.35 - 0.1 * sway);
      break;
    }
    case 'walk': case 'run': case 'crouch': case 'land': case 'air':
      o.swordTilt = o.rShoulderSwing + o.rElbow + 0.45; // 腕の振りに合わせて、爪はいつも少し下向き
      o.daggerTilt = o.lShoulderSwing + o.lElbow + 0.45;
      break;
    default:
      break;
  }
}

// ---- 通常1: 前方向への噛みつき。沈み込んで首をのばし、全身で飛びかかる。0.5 で噛む ----
const F1 = [
  { t: 0, pose: fReady },
  { t: 0.2, ease: 'inout', pose: (o) => { // 反らして、爪を左右へ大きく開く（獲物に飛びかかる前のため）
    FSTANCE(o);
    bset(o, { hipsX: 0, hipsZ: -0.12, hipsPitch: 0.05, waistPitch: -0.12, neckPitch: -0.3, lKnee: 1.0, rKnee: 0.95, lHipSwing: 0.5, rHipSwing: 0.05 });
    clawR(o, 0.5, 1.25, 0.0, 0.5, 0.5); clawL(o, 0.5, 1.25, 0.0, 0.5, 0.5);
  } },
  { t: 0.42, ease: 'in', pose: (o) => { // 一気に飛びかかる: 体が前へ倒れ、首が突き出る
    FSTANCE(o);
    bset(o, { hipsZ: 0.2, hipsPitch: 0.3, waistPitch: 0.7, neckPitch: -0.5, lHipSwing: 0.8, lKnee: 0.45, rHipSwing: -0.5, rKnee: 0.6, rFlat: 0.3 });
    clawR(o, 1.55, 0.55, 0.0, 0.3, 0.2); clawL(o, 1.55, 0.55, 0.0, 0.3, 0.2);
  } },
  { t: 0.5, ease: 'out', pose: (o) => { // ガブッ: 顔が前へ。腕は獲物をつかむように
    FSTANCE(o);
    bset(o, { hipsZ: 0.26, hipsPitch: 0.34, waistPitch: 0.85, neckPitch: -0.55, lHipSwing: 0.85, lKnee: 0.4, rHipSwing: -0.55, rKnee: 0.55, rFlat: 0.2 });
    clawR(o, 1.45, 0.3, 0.2, 0.55, 0.0); clawL(o, 1.45, 0.3, 0.2, 0.55, 0.0);
  } },
  { t: 0.62, ease: 'inout', pose: (o) => { // 噛んだまま、首をふる
    FSTANCE(o);
    bset(o, { hipsZ: 0.24, hipsPitch: 0.34, waistPitch: 0.85, neckPitch: -0.5, neckYaw: 0.35, neckRoll: 0.3, lHipSwing: 0.85, lKnee: 0.4, rHipSwing: -0.55, rKnee: 0.55, rFlat: 0.2 });
    clawR(o, 1.4, 0.3, 0.2, 0.6, 0.0); clawL(o, 1.4, 0.3, 0.2, 0.6, 0.0);
  } },
  { t: 1, ease: 'out', pose: fReady },
];
const attackF1 = (ctx, o) => keyed(ctx.attackT, F1, o);

// ---- 通常2: 爪での斜め薙ぎ払い（右上から左下へ）。0.46 で爪が獲物を通る ----
const F2 = [
  { t: 0, pose: fReady },
  { t: 0.22, ease: 'inout', pose: (o) => { // 体を右へひねり、右の爪を頭の後ろへ引き上げる
    FSTANCE(o);
    bset(o, { hipsYaw: -0.4, waistYaw: -0.75, neckYaw: 0.9, hipsX: -0.08, waistPitch: 0.1, lKnee: 0.85, rKnee: 0.8 });
    clawR(o, 2.55, 0.85, 0.0, 0.8, 1.2); clawL(o, 0.85, 0.55, 0.2, 1.0, 0.4);
  } },
  { t: 0.46, ease: 'in', pose: (o) => { // 踏み込んで、爪を左下へ振り下ろす
    FSTANCE(o);
    bset(o, { hipsYaw: 0.4, waistYaw: 0.7, neckYaw: -0.4, hipsZ: 0.14, waistPitch: 0.42, hipsPitch: 0.14, lHipSwing: -0.3, lKnee: 0.4, lFlat: 0.4, rHipSwing: 0.7, rKnee: 0.5, rFlat: 1 });
    clawR(o, 1.1, -0.35, 0.3, 0.3, -0.35); clawL(o, 0.4, 0.8, 0.1, 0.8, 0.0);
  } },
  { t: 0.64, ease: 'out', pose: (o) => { // 振り抜き: 腕が体の左へ
    FSTANCE(o);
    bset(o, { hipsYaw: 0.65, waistYaw: 0.95, neckYaw: -0.8, hipsZ: 0.14, waistPitch: 0.5, hipsPitch: 0.16, lHipSwing: -0.35, lKnee: 0.45, lFlat: 0.3, rHipSwing: 0.8, rKnee: 0.6, rFlat: 1 });
    clawR(o, 0.6, -0.8, 0.4, 0.5, -0.9); clawL(o, 0.4, 0.8, 0.1, 0.8, 0.0);
  } },
  { t: 1, ease: 'out', pose: fReady },
];
const attackF2 = (ctx, o) => keyed(ctx.attackT, F2, o);

// ---- 通常3: 首に噛みつき、肉を引きちぎる。0.42 で噛みつき、0.64 で引きちぎる ----
const F3 = [
  { t: 0, pose: fReady },
  { t: 0.2, ease: 'inout', pose: (o) => { // 深く沈んで、両腕を獲物へのばす
    FSTANCE(o);
    bset(o, { hipsZ: -0.05, hipsPitch: 0.2, waistPitch: 0.5, neckPitch: -0.3, lHipSwing: 0.6, lKnee: 1.05, rHipSwing: 0.1, rKnee: 1.0 });
    clawR(o, 1.55, 0.75, 0.0, 0.4, 0.1); clawL(o, 1.55, 0.75, 0.0, 0.4, 0.1);
  } },
  { t: 0.38, ease: 'in', pose: (o) => { // 飛びついて、両腕で獲物を抱え込む。首は横にかしげる
    FSTANCE(o);
    bset(o, { hipsZ: 0.22, hipsPitch: 0.3, waistPitch: 0.75, neckPitch: -0.3, neckRoll: 0.5, neckYaw: 0.3, lHipSwing: 0.8, lKnee: 0.5, rHipSwing: -0.45, rKnee: 0.6, rFlat: 0.3 });
    clawR(o, 1.3, 0.15, 0.4, 1.2, 0.5); clawL(o, 1.3, 0.15, 0.4, 1.2, 0.5);
  } },
  { t: 0.46, ease: 'out', pose: (o) => { // ガブリ: 首に牙を立てる
    FSTANCE(o);
    bset(o, { hipsZ: 0.26, hipsPitch: 0.34, waistPitch: 0.92, neckPitch: 0.1, neckRoll: 0.55, neckYaw: 0.3, lHipSwing: 0.85, lKnee: 0.45, rHipSwing: -0.5, rKnee: 0.6, rFlat: 0.3 });
    clawR(o, 1.25, 0.1, 0.45, 1.3, 0.6); clawL(o, 1.25, 0.1, 0.45, 1.3, 0.6);
  } },
  { t: 0.56, ease: 'inout', pose: (o) => { // 食い込ませたまま、ぎりぎりと力をこめる
    FSTANCE(o);
    bset(o, { hipsZ: 0.26, hipsPitch: 0.36, waistPitch: 0.95, neckPitch: 0.12, neckRoll: 0.6, neckYaw: 0.45, lHipSwing: 0.85, lKnee: 0.5, rHipSwing: -0.5, rKnee: 0.65, rFlat: 0.3 });
    clawR(o, 1.2, 0.1, 0.5, 1.4, 0.6); clawL(o, 1.2, 0.1, 0.5, 1.4, 0.6);
  } },
  { t: 0.68, ease: 'in', pose: (o) => { // 引きちぎる: 上体と首を後ろへ思い切りのけぞらせ、横へ振る
    FSTANCE(o);
    bset(o, { hipsZ: 0.0, hipsX: -0.1, hipsPitch: 0.0, waistPitch: -0.25, neckPitch: -0.55, neckRoll: -0.5, neckYaw: -0.7, waistYaw: -0.4, lHipSwing: 0.5, lKnee: 0.75, rHipSwing: -0.1, rKnee: 0.7, rFlat: 0.7 });
    clawR(o, 0.7, 0.55, 0.2, 1.5, 0.9); clawL(o, 0.8, 0.55, 0.2, 1.4, 0.9);
  } },
  { t: 1, ease: 'out', pose: fReady },
];
const attackF3 = (ctx, o) => keyed(ctx.attackT, F3, o);

// ---- ジャンプ中の爪（attackFAir）: 空中で3回、爪を振り下ろす。0.2 / 0.5 / 0.8 に爪が出る ----
const airTuck = (o) => bset(o, { ground: 0, hipsPitch: 0.05, waistPitch: 0.2, neckPitch: -0.1, lHipSwing: 0.75, lKnee: 1.15, lHipOut: 0.2, lAnkle: -0.2, rHipSwing: 0.3, rKnee: 1.3, rHipOut: 0.2, rAnkle: -0.2 });
const FAIR = [
  { t: 0, pose: (o) => { airTuck(o); clawR(o, 2.2, 0.6, 0.0, 0.8, 1.2); clawL(o, 2.2, 0.6, 0.0, 0.8, 1.2); } },
  { t: 0.2, ease: 'in', pose: (o) => { airTuck(o); bset(o, { waistYaw: 0.35, hipsYaw: 0.2, waistPitch: 0.35 }); clawR(o, 1.15, 0.0, 0.2, 0.3, -0.4); clawL(o, 2.2, 0.6, 0.0, 0.8, 1.2); } },
  { t: 0.35, ease: 'out', pose: (o) => { airTuck(o); bset(o, { waistYaw: -0.3, hipsYaw: -0.15 }); clawR(o, 2.2, 0.6, 0.0, 0.8, 1.2); clawL(o, 2.2, 0.6, 0.0, 0.8, 1.2); } },
  { t: 0.5, ease: 'in', pose: (o) => { airTuck(o); bset(o, { waistYaw: -0.35, hipsYaw: -0.2, waistPitch: 0.35 }); clawL(o, 1.15, 0.0, 0.2, 0.3, -0.4); clawR(o, 2.2, 0.6, 0.0, 0.8, 1.2); } },
  { t: 0.65, ease: 'out', pose: (o) => { airTuck(o); bset(o, { waistYaw: 0.3, hipsYaw: 0.15 }); clawR(o, 2.2, 0.6, 0.0, 0.8, 1.2); clawL(o, 2.2, 0.6, 0.0, 0.8, 1.2); } },
  { t: 0.8, ease: 'in', pose: (o) => { airTuck(o); bset(o, { waistYaw: 0.4, hipsYaw: 0.25, waistPitch: 0.4 }); clawR(o, 1.1, 0.0, 0.2, 0.25, -0.5); clawL(o, 2.2, 0.6, 0.0, 0.8, 1.2); } },
  { t: 1, ease: 'out', pose: (o) => { airTuck(o); clawR(o, 1.5, 0.5, 0.1, 0.6, 0.2); clawL(o, 1.5, 0.5, 0.1, 0.6, 0.2); } },
];
const attackFAir = (ctx, o) => keyed(ctx.attackT, FAIR, o);

// ---- スキル1: 爪を赤く染める（両手を顔の前でこすり合わせ、爪を高くかかげる）----
const fangRaise = (ctx, o) => {
  const t = ctx.attackT;
  const up = smooth(t / 0.7);
  FSTANCE(o);
  bset(o, { waistPitch: 0.25 - 0.3 * up, neckPitch: -0.1 - 0.35 * up, lKnee: 0.65 + 0.2 * up, rKnee: 0.55 + 0.2 * up });
  clawR(o, 1.0 + 1.2 * up, 0.4 + 0.5 * up, 0.1, 1.1 - 0.4 * up, 0.5 + 0.7 * up + 0.05 * sin(ctx.time * 30));
  clawL(o, 1.0 + 1.2 * up, 0.4 + 0.5 * up, 0.1, 1.1 - 0.4 * up, 0.5 + 0.7 * up - 0.05 * sin(ctx.time * 30));
};

// ---- スキル1: 薙ぎ払い。attackT 0 → 1 で、0.4 に爪を振り抜いて斬撃が出る ----
const SWEEPA = [ // 右爪: 右上から左下へ斜めに
  { t: 0, pose: (o) => { FSTANCE(o); bset(o, { waistYaw: -0.55, hipsYaw: -0.3, neckYaw: 0.7 }); clawR(o, 2.4, 0.8, 0.0, 0.9, 1.1); clawL(o, 0.8, 0.5, 0.2, 1.0, 0.4); } },
  { t: 0.4, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { waistYaw: 0.6, hipsYaw: 0.35, neckYaw: -0.35, hipsZ: 0.1, waistPitch: 0.4, lHipSwing: 0.5, lKnee: 0.5 }); clawR(o, 1.1, -0.35, 0.3, 0.3, -0.4); clawL(o, 0.4, 0.8, 0.1, 0.8, 0.0); } },
  { t: 1, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { waistYaw: 0.9, hipsYaw: 0.5, neckYaw: -0.6, hipsZ: 0.1, waistPitch: 0.45, lHipSwing: 0.5, lKnee: 0.55 }); clawR(o, 0.6, -0.8, 0.4, 0.5, -0.9); clawL(o, 0.4, 0.8, 0.1, 0.8, 0.0); } },
];
const fangSweep1 = (ctx, o) => keyed(ctx.attackT, SWEEPA, o);
const fangSweep2 = (ctx, o) => { keyed(ctx.attackT, SWEEPA, o); mirrorPose(o); }; // 左爪: 左上から右下へ
const SWEEPC = [ // 両腕を水平に大きく薙ぐ
  { t: 0, pose: (o) => { FSTANCE(o); bset(o, { waistYaw: -0.8, hipsYaw: -0.4, neckYaw: 0.95, lKnee: 0.8, rKnee: 0.8 }); clawR(o, 1.55, 1.3, 0.0, 0.4, 0.2); clawL(o, 1.55, 1.3, 0.0, 0.4, 0.2); } },
  { t: 0.4, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { waistYaw: 0.7, hipsYaw: 0.4, neckYaw: -0.4, hipsZ: 0.12, waistPitch: 0.4, lHipSwing: 0.55, lKnee: 0.5 }); clawR(o, 1.5, 0.2, 0.3, 0.2, 0.0); clawL(o, 1.5, 0.2, 0.3, 0.2, 0.0); } },
  { t: 1, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { waistYaw: 1.0, hipsYaw: 0.5, neckYaw: -0.7, hipsZ: 0.12, waistPitch: 0.45, lHipSwing: 0.55, lKnee: 0.55 }); clawR(o, 1.5, -0.3, 0.4, 0.4, 0.0); clawL(o, 1.4, 0.6, 0.3, 0.4, 0.0); } },
];
const fangSweep3 = (ctx, o) => keyed(ctx.attackT, SWEEPC, o);

// ---- 蝙蝠になる前・戻ったあと: 両腕を顔の前で交差させ、体をちぢめる（マントに包まれる）----
const fangMorph = (ctx, o) => {
  const k = sin(clamp01(ctx.attackT) * PI);
  FSTANCE(o);
  bset(o, { hipsPitch: 0.2 + 0.15 * k, waistPitch: 0.5 + 0.4 * k, neckPitch: 0.3 * k, lKnee: 0.9 + 0.3 * k, rKnee: 0.85 + 0.3 * k, hipsRoll: 0.04 * sin(ctx.time * 45) * k });
  clawR(o, 2.0, -0.6 * k, 0.5, 2.0, 0.3); clawL(o, 2.0, -0.6 * k, 0.5, 2.0, 0.3);
};

// ---- スキル4: 足を蝙蝠にして宙に浮き、腕を大きく広げて回る ----
const fangSpin = (ctx, o) => {
  o.ground = 0;
  o.lift = 1.4;
  bset(o, { hipsPitch: 0.1, waistPitch: 0.3, neckPitch: 0.0, lHipSwing: 0.1, lKnee: 0.25, lHipOut: 0.25, lAnkle: -0.4, rHipSwing: -0.1, rKnee: 0.3, rHipOut: 0.25, rAnkle: -0.4 });
  const flutter = 0.08 * sin(ctx.time * 22);
  clawR(o, 1.5, 1.45 + flutter, 0.0, 0.15, 0.0); clawL(o, 1.5, 1.45 - flutter, 0.0, 0.15, 0.0);
};

// ---- 着地・再登場のため: 沈み込んで、ゆっくり構えへ（attackT 0 → 1）----
const fangLand = (ctx, o) => {
  const u = smooth(ctx.attackT);
  fReady(o);
  bset(o, { waistPitch: 0.25 + 0.5 * (1 - u), hipsPitch: 0.12 + 0.2 * (1 - u), lKnee: 0.65 + 0.5 * (1 - u), rKnee: 0.55 + 0.5 * (1 - u) });
};

// ---- 必殺技: 凶暴化（背を丸め、牙をむいて咆哮。attackT 0 → 1。震えながら爪を広げる）----
const fangBerserk = (ctx, o) => {
  const t = clamp01(ctx.attackT);
  const k = smooth(t / 0.6);
  const sh = 0.05 * sin(ctx.time * 55) * (0.4 + k);
  FSTANCE(o);
  bset(o, { hipsPitch: 0.3 * k, waistPitch: 0.55 * k - 0.2 * smooth((t - 0.55) / 0.3), neckPitch: -0.7 * smooth((t - 0.35) / 0.4), hipsX: sh, lKnee: 0.65 + 0.5 * k, rKnee: 0.55 + 0.5 * k, lHipOut: 0.3 + 0.2 * k, rHipOut: 0.3 + 0.2 * k, waistRoll: sh });
  const open = smooth((t - 0.35) / 0.4);
  clawR(o, 0.9 + 0.4 * open, 0.5 + 0.9 * open, 0.0, 0.9 - 0.4 * open, 0.3 + 0.5 * open);
  clawL(o, 0.9 + 0.4 * open, 0.5 + 0.9 * open, 0.0, 0.9 - 0.4 * open, 0.3 + 0.5 * open);
};

// ---- 必殺技: 重い牙の一撃。0.5 で噛みつく（attackT 0 → 1）----
const FSTRIKE = [
  { t: 0, pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.6, hipsPitch: 0.3, lKnee: 1.1, rKnee: 1.05 }); clawR(o, 1.3, 1.4, 0.0, 0.5, 0.5); clawL(o, 1.3, 1.4, 0.0, 0.5, 0.5); } },
  { t: 0.3, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: -0.15, waistPitch: -0.2, hipsPitch: 0.1, neckPitch: -0.5, lKnee: 1.2, rKnee: 1.15, lHipSwing: 0.6 }); clawR(o, 0.4, 1.5, 0.0, 0.5, 0.6); clawL(o, 0.4, 1.5, 0.0, 0.5, 0.6); } },
  { t: 0.5, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.3, hipsPitch: 0.4, waistPitch: 1.0, neckPitch: 0.0, neckRoll: 0.5, neckYaw: 0.25, lHipSwing: 0.9, lKnee: 0.4, rHipSwing: -0.55, rKnee: 0.6, rFlat: 0.2 }); clawR(o, 1.4, 0.1, 0.4, 1.2, 0.5); clawL(o, 1.4, 0.1, 0.4, 1.2, 0.5); } },
  { t: 0.7, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.3, hipsPitch: 0.4, waistPitch: 1.05, neckPitch: 0.1, neckRoll: 0.6, neckYaw: 0.5, lHipSwing: 0.9, lKnee: 0.45, rHipSwing: -0.55, rKnee: 0.65, rFlat: 0.2 }); clawR(o, 1.3, 0.1, 0.5, 1.3, 0.5); clawL(o, 1.3, 0.1, 0.5, 1.3, 0.5); } },
  { t: 1, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.2, waistPitch: 0.8, hipsPitch: 0.3, neckPitch: -0.2, lKnee: 0.8, rKnee: 0.7 }); clawR(o, 1.0, 0.6, 0.2, 0.9, 0.2); clawL(o, 1.0, 0.6, 0.2, 0.9, 0.2); } },
];
const attackFStrike = (ctx, o) => keyed(ctx.attackT, FSTRIKE, o);

// ---- 敵: 「ここはどこだ」とあたふたして、まわりを見回す（時間 ctx.time で動く）----
const lookAround = (ctx, o) => {
  const t = ctx.time;
  const head = sin(t * 2.6) * 1.1 + 0.3 * sin(t * 5.3);
  bset(o, { hipsYaw: 0.25 * sin(t * 2.6 - 0.6), waistYaw: 0.35 * sin(t * 2.6 - 0.3), neckYaw: head, neckPitch: -0.05 + 0.18 * sin(t * 3.1), hipsRoll: 0.05 * sin(t * 4), waistPitch: 0.06,
    lHipSwing: 0.25, lKnee: 0.4, lHipOut: 0.25, lFlat: 1, rHipSwing: -0.1, rKnee: 0.35, rHipOut: 0.25, rFlat: 1 });
  const wave = 0.5 + 0.5 * sin(t * 5.2);
  bset(o, { lShoulderSwing: 0.9 + 0.4 * wave, lShoulderOut: 0.9, lShoulderTwist: 0.3, lElbow: 1.2, rShoulderSwing: 1.1 - 0.4 * wave, rShoulderOut: 0.9, rShoulderTwist: 0.3, rElbow: 1.2 });
  bset(o, { hipsX: 0.05 * sin(t * 2.6) });
};


// ============================================================
// チェンソー用のポーズ
// 持ち歩き・構え・ジャンプ攻撃（叩きつけ）・必殺技の一部は、剣のポーズをそのまま使う（carrySaw）。
// 腕の向きの指定は、爪と同じ（clawR / clawL: 刃の向き pitch。0 = 水平に前、π/2 = 真上、負 = 下向き）。
// ============================================================
export const carrySaw = (name, ctx, o) => carrySword(name, ctx, o);
const sReady = (o) => { FSTANCE(o); clawR(o, 1.0, 0.25, 0.2, 1.2, 0.25); clawL(o, 1.1, 0.5, 0.1, 1.2, 0.3); };
const sShake = (ctx, o, k) => { const r = sin(ctx.time * 95) * 0.02 * k; o.rShoulderSwing += r; o.lShoulderSwing -= r; };

// ---- 通常1: 引き紐をぐいっと引いてエンジンをかけ、右上から左下へ斜めに斬る。0.5 で斬る ----
const S1 = [
  { t: 0, pose: sReady },
  { t: 0.12, ease: 'inout', pose: (o) => { // 左手を紐へのばし、チェンソーを低く構える
    FSTANCE(o); bset(o, { waistPitch: 0.3, hipsYaw: -0.15, waistYaw: -0.2, lKnee: 0.8, rKnee: 0.75 });
    clawR(o, 0.8, 0.3, 0.2, 1.0, -0.3); clawL(o, 1.4, 0.2, 0.3, 0.5, 0.0);
  } },
  { t: 0.28, ease: 'in', pose: (o) => { // 紐を思い切り後ろへ引く（体がひねられる）
    FSTANCE(o); bset(o, { waistPitch: 0.25, hipsYaw: -0.5, waistYaw: -0.55, neckYaw: 0.3, lKnee: 0.85, rKnee: 0.8 });
    clawR(o, 0.8, 0.3, 0.2, 1.0, -0.3); clawL(o, -0.4, 0.5, 0.4, 1.0, 0.0);
  } },
  { t: 0.38, ease: 'out', pose: (o) => { // 振りかぶる: チェンソーを右上へ
    FSTANCE(o); bset(o, { hipsYaw: -0.45, waistYaw: -0.75, neckYaw: 0.7, waistPitch: 0.1, lKnee: 0.85, rKnee: 0.8 });
    clawR(o, 2.55, 0.85, 0.0, 0.8, 1.2); clawL(o, 0.9, 0.55, 0.2, 1.0, 0.4);
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 踏み込んで、左下へ斬り下ろす
    FSTANCE(o); bset(o, { hipsYaw: 0.4, waistYaw: 0.7, neckYaw: -0.4, hipsZ: 0.16, waistPitch: 0.45, hipsPitch: 0.14, lHipSwing: -0.3, lKnee: 0.4, lFlat: 0.4, rHipSwing: 0.7, rKnee: 0.5, rFlat: 1 });
    clawR(o, 1.1, -0.35, 0.3, 0.3, -0.35); clawL(o, 0.4, 0.8, 0.1, 0.8, 0.0);
  } },
  { t: 0.66, ease: 'out', pose: (o) => { // 振り抜き
    FSTANCE(o); bset(o, { hipsYaw: 0.65, waistYaw: 0.95, neckYaw: -0.8, hipsZ: 0.16, waistPitch: 0.5, hipsPitch: 0.16, lHipSwing: -0.35, lKnee: 0.45, lFlat: 0.3, rHipSwing: 0.8, rKnee: 0.6, rFlat: 1 });
    clawR(o, 0.6, -0.8, 0.4, 0.5, -0.9); clawL(o, 0.4, 0.8, 0.1, 0.8, 0.0);
  } },
  { t: 1, ease: 'out', pose: sReady },
];
const attackS1 = (ctx, o) => { keyed(ctx.attackT, S1, o); sShake(ctx, o, 1); };

// ---- 通常2: 沈み込んで、一瞬で距離を詰め、チェンソーを相手の首元へ突き刺す。0.32 で刺さり、そのまま押しつける ----
const S2 = [
  { t: 0, pose: sReady },
  { t: 0.16, ease: 'inout', pose: (o) => { // 低く沈み、チェンソーを腰に引きつける
    FSTANCE(o); bset(o, { hipsZ: -0.12, hipsPitch: 0.3, waistPitch: 0.6, neckPitch: -0.2, lHipSwing: 0.6, lKnee: 1.15, rHipSwing: 0.1, rKnee: 1.1 });
    clawR(o, 0.55, 0.3, 0.2, 1.7, 0.15); clawL(o, 1.2, 0.5, 0.2, 1.0, 0.3);
  } },
  { t: 0.32, ease: 'in', pose: (o) => { // 飛び込み: 体が前へ倒れ、チェンソーが首の高さへ一直線
    FSTANCE(o); bset(o, { hipsZ: 0.38, hipsPitch: 0.45, waistPitch: 0.75, neckPitch: -0.45, lHipSwing: 0.95, lKnee: 0.4, rHipSwing: -0.7, rKnee: 0.5, rFlat: 0.2 });
    clawR(o, 1.62, 0.15, 0.2, 0.15, 1.9); clawL(o, 1.5, 0.45, 0.3, 0.4, 1.9);
  } },
  { t: 0.42, ease: 'out', pose: (o) => { // ぐっと押し込む
    FSTANCE(o); bset(o, { hipsZ: 0.42, hipsPitch: 0.5, waistPitch: 0.85, neckPitch: -0.45, lHipSwing: 1.0, lKnee: 0.4, rHipSwing: -0.75, rKnee: 0.5, rFlat: 0.2 });
    clawR(o, 1.66, 0.15, 0.2, 0.1, 1.95); clawL(o, 1.5, 0.45, 0.3, 0.4, 1.9);
  } },
  { t: 0.8, ease: 'inout', pose: (o) => { // 押しつけたまま、ぎりぎりと切り込む
    FSTANCE(o); bset(o, { hipsZ: 0.42, hipsPitch: 0.5, waistPitch: 0.9, neckPitch: -0.4, lHipSwing: 1.0, lKnee: 0.45, rHipSwing: -0.75, rKnee: 0.5, rFlat: 0.2 });
    clawR(o, 1.7, 0.15, 0.2, 0.1, 2.0); clawL(o, 1.5, 0.45, 0.3, 0.4, 1.9);
  } },
  { t: 1, ease: 'out', pose: sReady },
];
const attackS2 = (ctx, o) => { keyed(ctx.attackT, S2, o); const t = ctx.attackT; if (t > 0.4 && t < 0.82) { o.hipsX += 0.035 * sin(ctx.time * 80); o.waistRoll += 0.05 * sin(ctx.time * 70); } sShake(ctx, o, 1.6); };

// ---- 通常3: チェンソーを両手で持って、体ごと一回転して振り回す。0.3〜0.75 が回転斬り ----
const attackS3 = (ctx, o) => {
  const t = ctx.attackT;
  const wind = smooth(t / 0.28);
  const spin = smooth((t - 0.28) / 0.46);
  const rec = smooth((t - 0.74) / 0.26);
  FSTANCE(o);
  const a = wrap(-1.0 * wind + (2 * PI + 1.0) * spin);   // 回転の角度（-π〜π にまとめる。同じ向きなので、見た目は連続）
  bset(o, { hipsYaw: a, hipsPitch: 0.1, waistPitch: 0.2 * (1 - rec), lKnee: 0.8 - 0.2 * rec, rKnee: 0.75 - 0.2 * rec, lHipSwing: 0.4, rHipSwing: -0.1 });
  // 回している間は、腕を水平にのばして、チェンソーを横へ振り出す
  const out = 1 - rec;
  clawR(o, 1.55 * out + 1.0 * rec, 1.35 * out + 0.25 * rec, 0.0, 0.25 * out + 1.2 * rec, 0.0 * out + 0.25 * rec);
  clawL(o, 1.55 * out + 1.1 * rec, 1.35 * out + 0.5 * rec, 0.0, 0.3 * out + 1.2 * rec, 0.0 * out + 0.3 * rec);
  sShake(ctx, o, 2);
};

// ---- スキル1: ナイフを投げる（0.5 で放つ）----
const SKN = [
  { t: 0, pose: sReady },
  { t: 0.32, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: 0.25, waistYaw: 0.5, neckYaw: -0.3, lKnee: 0.8 }); clawR(o, 0.95, 0.3, 0.2, 1.2, 0.2); clawL(o, 2.5, 0.6, 0.0, 1.0, 1.0); } },
  { t: 0.5, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: -0.3, waistYaw: -0.55, neckYaw: 0.3, hipsZ: 0.15, waistPitch: 0.4, lHipSwing: 0.6, lKnee: 0.5 }); clawR(o, 0.95, 0.3, 0.2, 1.2, 0.2); clawL(o, 1.55, 0.2, 0.2, 0.15, 0.0); } },
  { t: 1, ease: 'out', pose: sReady },
];
const sawThrow = (ctx, o) => { keyed(ctx.attackT, SKN, o); sShake(ctx, o, 1); };

// ---- スキル1: チェンソーを頭上へかかげ、全身で振り下ろす（0.5 で叩きつける）----
const SOH = [
  { t: 0, pose: sReady },
  { t: 0.36, ease: 'inout', pose: (o) => { // のけぞって、チェンソーを高く
    FSTANCE(o); bset(o, { hipsZ: -0.1, hipsPitch: -0.1, waistPitch: -0.3, neckPitch: -0.2, lKnee: 0.9, rKnee: 0.85 });
    clawR(o, 3.0, 0.45, 0.0, 0.5, 1.4); clawL(o, 3.0, 0.45, 0.0, 0.5, 1.4);
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 叩きつける
    FSTANCE(o); bset(o, { hipsZ: 0.3, hipsPitch: 0.3, waistPitch: 1.0, neckPitch: -0.3, lHipSwing: 0.9, lKnee: 0.5, rHipSwing: -0.5, rKnee: 0.6, rFlat: 0.3 });
    clawR(o, 1.45, 0.1, 0.2, 0.3, 0.7); clawL(o, 1.45, 0.1, 0.2, 0.3, 0.7);
  } },
  { t: 0.75, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.3, hipsPitch: 0.3, waistPitch: 1.0, lHipSwing: 0.9, lKnee: 0.5, rHipSwing: -0.5, rKnee: 0.6, rFlat: 0.3 }); clawR(o, 1.4, 0.1, 0.2, 0.35, 0.65); clawL(o, 1.4, 0.1, 0.2, 0.35, 0.65); } },
  { t: 1, ease: 'out', pose: sReady },
];
const sawOverhead = (ctx, o) => { keyed(ctx.attackT, SOH, o); sShake(ctx, o, 1.4); };

// ---- スキル2: 足にチェンソーを生やす（沈み込んで、足をふるわせる。attackT 0 → 1）----
const sawLegGrow = (ctx, o) => {
  const k = smooth(ctx.attackT);
  FSTANCE(o);
  bset(o, { hipsPitch: 0.3 * k, waistPitch: 0.5 * k, neckPitch: -0.2, lKnee: 0.65 + 0.5 * k, rKnee: 0.55 + 0.5 * k, lHipOut: 0.3 + 0.2 * k, rHipOut: 0.3 + 0.2 * k, hipsX: 0.03 * sin(ctx.time * 80) * k });
  clawR(o, 1.0, 0.5 + 0.6 * k, 0.1, 1.0, 0.2); clawL(o, 1.0, 0.5 + 0.6 * k, 0.1, 1.0, 0.2);
};

// ---- スキル2・必殺技: 飛び蹴り。体が横になって宙を飛び、片足を前へ突き出す（attackT 0 → 1。0.5 で当たる）----
const sawKick = (ctx, o) => {
  const t = clamp01(ctx.attackT);
  const k = smooth(t / 0.3);
  o.ground = 0;
  o.lift = 1.6 * k;
  bset(o, { hipsPitch: 0.55 * k, waistPitch: 0.15, neckPitch: -0.25, rHipSwing: 1.75 * k, rKnee: 0.12, rHipOut: 0.1, rAnkle: -0.5, lHipSwing: -0.45 * k, lKnee: 0.9 * k, lHipOut: 0.15 });
  clawR(o, 0.9, 0.9 * k, 0.0, 0.5, 0.0); clawL(o, 0.9, 0.9 * k, 0.0, 0.5, 0.0);
};

// ---- スキル4: 足に歯車を生やす（沈み込んで、足を踏みならす。attackT 0 → 1）----
const sawGear = (ctx, o) => {
  const k = sin(clamp01(ctx.attackT) * PI);
  FSTANCE(o);
  bset(o, { hipsPitch: 0.15 + 0.15 * k, waistPitch: 0.3 + 0.3 * k, lKnee: 0.65 + 0.4 * k, rKnee: 0.55 + 0.4 * k, hipsX: 0.03 * sin(ctx.time * 70) * k });
  clawR(o, 0.9, 0.5, 0.1, 1.1, 0.0); clawL(o, 0.9, 0.5, 0.1, 1.1, 0.0);
};

// ============================================================
// 矢印（素手。矢印のステッカーを貼って戦う）用のポーズ
// ============================================================
const armR = (o, swing, out, twist, elbow) => { o.rShoulderSwing = swing; o.rShoulderOut = out; o.rShoulderTwist = twist; o.rElbow = elbow; };
const armL = (o, swing, out, twist, elbow) => { o.lShoulderSwing = swing; o.lShoulderOut = out; o.lShoulderTwist = twist; o.lElbow = elbow; };
// ボクサーの構え: 拳をあごの前へ
const aGuard = (o) => { FSTANCE(o); bset(o, { waistPitch: 0.1, neckPitch: -0.05 }); armR(o, 1.25, 0.25, 0.1, 1.9); armL(o, 1.35, 0.3, 0.1, 1.9); };

// 持ち歩き: 素手。構えでは拳をあごの前へ（ゆらゆらステップ）
export function carryArrow(name, ctx, o) {
  const t = ctx.time;
  switch (name) {
    case 'stand':
      armR(o, 0.1 + (o.rShoulderSwing - 0.03) * 0.5, 0.18, 0.0, 0.3);
      armL(o, 0.1 + (o.lShoulderSwing + 0.03) * 0.5, 0.18, 0.0, 0.3);
      break;
    case 'fight': {
      const b = sin(t * 5);
      aGuard(o);
      o.hipsX = 0.02 * b; o.hipsRoll = 0.03 * b; o.lKnee += 0.05 * b; o.rKnee -= 0.05 * b;
      o.rShoulderSwing += 0.06 * sin(t * 5 + 1); o.lShoulderSwing += 0.06 * sin(t * 5 + 2.5);
      break;
    }
    default: break;
  }
}

// ---- 通常1: 右腕に加速の矢印を貼って、全体重の右ストレート。0.5 で当たる ----
const ARW1 = [
  { t: 0, pose: aGuard },
  { t: 0.2, ease: 'inout', pose: (o) => { // 左手で、右の前腕に矢印をぺたり
    FSTANCE(o); bset(o, { waistYaw: -0.3, hipsYaw: -0.15, neckYaw: 0.4, waistPitch: 0.2, lKnee: 0.8, rKnee: 0.7 });
    armR(o, 1.0, 0.3, 0.2, 1.2); armL(o, 1.0, -0.9, 0.7, 1.5);
  } },
  { t: 0.38, ease: 'inout', pose: (o) => { // 体をひねって、右腕を大きく引く（矢印が光る）
    FSTANCE(o); bset(o, { hipsYaw: -0.7, waistYaw: -0.8, neckYaw: 1.0, hipsZ: -0.1, waistPitch: 0.15, lKnee: 0.95, rKnee: 0.8, lHipSwing: 0.4 });
    armR(o, 0.5, 0.6, 0.2, 1.8); armL(o, 1.3, 0.1, 0.1, 1.0);
  } },
  { t: 0.5, ease: 'in', pose: (o) => { // 腰の回転から、一気に右ストレート
    FSTANCE(o); bset(o, { hipsYaw: 0.5, waistYaw: 0.55, neckYaw: -0.3, hipsZ: 0.28, hipsPitch: 0.2, waistPitch: 0.4, lHipSwing: 0.95, lKnee: 0.5, rHipSwing: -0.5, rKnee: 0.5, rFlat: 0.3 });
    armR(o, 1.55, 0.0, 0.2, 0.08); armL(o, 0.9, 0.3, 0.1, 2.0);
  } },
  { t: 0.7, ease: 'out', pose: (o) => { // 振り抜いた余韻
    FSTANCE(o); bset(o, { hipsYaw: 0.7, waistYaw: 0.7, neckYaw: -0.45, hipsZ: 0.3, hipsPitch: 0.22, waistPitch: 0.45, lHipSwing: 1.0, lKnee: 0.55, rHipSwing: -0.55, rKnee: 0.55, rFlat: 0.3 });
    armR(o, 1.5, 0.0, 0.2, 0.15); armL(o, 0.9, 0.3, 0.1, 2.0);
  } },
  { t: 1, ease: 'out', pose: aGuard },
];
const attackA1 = (ctx, o) => keyed(ctx.attackT, ARW1, o);

// ---- 通常2: 床に加速の矢印を貼り（かがんで右手でぺたり）、猛ダッシュから飛び蹴り。0.62 で蹴りが当たる ----
const ARW2 = [
  { t: 0, pose: aGuard },
  { t: 0.2, ease: 'out', pose: (o) => { // かがんで、右手を床へ
    FSTANCE(o); bset(o, { hipsPitch: 0.3, waistPitch: 0.95, neckPitch: -0.3, lKnee: 1.2, rKnee: 1.1, lHipSwing: 0.7, rHipSwing: 0.2 });
    armR(o, 1.05, 0.15, 0.0, 0.2); armL(o, 0.5, 0.3, 0.0, 0.6);
  } },
  { t: 0.32, ease: 'in', pose: (o) => { // 走り出し: 前のめりに、腕を後ろへ
    FSTANCE(o); bset(o, { hipsPitch: 0.45, waistPitch: 0.55, neckPitch: -0.4, hipsZ: 0.2, lHipSwing: 1.0, lKnee: 1.0, rHipSwing: -0.8, rKnee: 0.5, rFlat: 0.2 });
    armR(o, -0.9, 0.2, 0.0, 0.4); armL(o, -0.9, 0.2, 0.0, 0.4);
  } },
  { t: 0.5, ease: 'inout', pose: (o) => { // 猛ダッシュ
    FSTANCE(o); bset(o, { hipsPitch: 0.5, waistPitch: 0.6, neckPitch: -0.45, hipsZ: 0.25, lHipSwing: -0.6, lKnee: 0.9, rHipSwing: 1.1, rKnee: 1.0, rFlat: 0.2, lFlat: 0.2 });
    armR(o, -1.0, 0.2, 0.0, 0.5); armL(o, -1.0, 0.2, 0.0, 0.5);
  } },
  { t: 0.62, ease: 'in', pose: (o) => { // 飛び蹴り: 上体をのけぞらせ、右脚をまっすぐ前へ
    FSTANCE(o); bset(o, { ground: 0, lift: 0.6, hipsPitch: -0.45, waistPitch: -0.25, neckPitch: 0.1, hipsZ: 0.3, rHipSwing: 1.5, rKnee: 0.1, rFlat: 0.0, rAnkle: -0.3, lHipSwing: 0.2, lKnee: 1.3, lFlat: 0.0 });
    armR(o, 0.4, 1.3, 0.0, 0.3); armL(o, 0.6, 1.2, 0.0, 0.3);
  } },
  { t: 0.8, ease: 'out', pose: (o) => { // 蹴り抜けて、着地へ
    FSTANCE(o); bset(o, { ground: 0, lift: 0.3, hipsPitch: -0.3, waistPitch: -0.1, hipsZ: 0.3, rHipSwing: 1.3, rKnee: 0.3, rFlat: 0.0, lHipSwing: 0.3, lKnee: 1.0, lFlat: 0.0 });
    armR(o, 0.6, 1.0, 0.0, 0.5); armL(o, 0.7, 1.0, 0.0, 0.5);
  } },
  { t: 1, ease: 'out', pose: aGuard },
];
const attackA2 = (ctx, o) => keyed(ctx.attackT, ARW2, o);

// ---- 通常3: 相手に下向き矢印をぺたりと貼って地面に押さえつけ、連続パンチ。0.3 で押さえつけ、0.4〜0.93 で6連打 ----
const A3A = [
  { t: 0, pose: aGuard },
  { t: 0.15, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: -0.08, waistPitch: -0.05, lKnee: 0.9, rKnee: 0.8 }); armR(o, 2.6, 0.4, 0.0, 0.5); armL(o, 1.3, 0.3, 0.1, 1.6); } },
  { t: 0.3, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.22, hipsPitch: 0.25, waistPitch: 0.85, neckPitch: -0.3, lHipSwing: 0.85, lKnee: 0.6, rHipSwing: -0.4, rKnee: 0.6, rFlat: 0.3 }); armR(o, 1.3, 0.0, 0.0, 0.3); armL(o, 1.5, 0.3, 0.1, 1.2); } },
];
function attackA3(ctx, o) {
  const t = ctx.attackT;
  if (t < 0.3) { keyed(t, A3A, o); return; }
  const rec = smooth((t - 0.93) / 0.07);
  const f = clamp01((t - 0.3) / 0.63);
  const s = sin(f * 6 * PI + PI * 0.5); // 右 → 左 → 右 ...（連打）
  FSTANCE(o);
  bset(o, { hipsZ: 0.22, hipsPitch: 0.25, waistPitch: 0.85 + 0.08 * abs(s), neckPitch: -0.3, lHipSwing: 0.85, lKnee: 0.6, rHipSwing: -0.4, rKnee: 0.6, rFlat: 0.3, waistYaw: 0.15 * s });
  armR(o, 1.65 - 0.5 * s, 0.0, 0.0, 0.5 + 0.5 * (1 + s) / 2);
  armL(o, 1.65 + 0.5 * s, 0.3, 0.1, 0.5 + 0.5 * (1 - s) / 2);
  if (rec > 0) { const g = {}; aGuard(g); for (const k of Object.keys(g)) o[k] += (g[k] - o[k]) * rec; }
}

// ---- 大砲（スキル1）: 両手で砲弾の矢印を貼って構え、0.5 で撃ち出す ----
const CANNON = [
  { t: 0, pose: aGuard },
  { t: 0.3, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.3, hipsZ: -0.1, lKnee: 1.0, rKnee: 0.95, lHipSwing: 0.6 }); armR(o, 1.15, 0.15, 0.2, 1.1); armL(o, 1.15, 0.15, 0.2, 1.1); } },
  { t: 0.5, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.42, hipsZ: 0.22, hipsPitch: 0.15, lKnee: 0.55, rKnee: 0.7, lHipSwing: 0.9, rHipSwing: -0.5, rFlat: 0.3 }); armR(o, 1.55, 0.0, 0.1, 0.1); armL(o, 1.55, 0.0, 0.1, 0.1); } },
  { t: 0.72, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.45, hipsZ: 0.22, hipsPitch: 0.18, lKnee: 0.55, rKnee: 0.7, lHipSwing: 0.9, rHipSwing: -0.5, rFlat: 0.3 }); armR(o, 1.5, 0.0, 0.1, 0.15); armL(o, 1.5, 0.0, 0.1, 0.15); } },
  { t: 1, ease: 'out', pose: aGuard },
];
const arrowCannon = (ctx, o) => keyed(ctx.attackT, CANNON, o);

// ---- かがんで矢印をぺたり（足・床・地面に貼る）。0.45 で貼る ----
const STICK = [
  { t: 0, pose: aGuard },
  { t: 0.45, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsPitch: 0.3, waistPitch: 1.0, neckPitch: -0.3, lKnee: 1.25, rKnee: 1.15, lHipSwing: 0.8, rHipSwing: 0.3 }); armR(o, 1.05, 0.15, 0.0, 0.2); armL(o, 1.0, 0.15, 0.0, 0.25); } },
  { t: 0.7, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsPitch: 0.3, waistPitch: 0.95, neckPitch: -0.3, lKnee: 1.25, rKnee: 1.15, lHipSwing: 0.8, rHipSwing: 0.3 }); armR(o, 1.05, 0.15, 0.0, 0.2); armL(o, 1.0, 0.15, 0.0, 0.25); } },
  { t: 1, ease: 'out', pose: aGuard },
];
const arrowStick = (ctx, o) => keyed(ctx.attackT, STICK, o);

// ---- 高く跳ぶ・叩きつけ（スキル2）----
const arrowJump = (ctx, o) => {
  bset(o, { ground: 0, hipsPitch: 0.05, waistPitch: -0.1, neckPitch: -0.2, lHipSwing: 0.7, lKnee: 1.2, lHipOut: 0.2, lAnkle: -0.3, rHipSwing: 0.4, rKnee: 1.3, rHipOut: 0.2, rAnkle: -0.3 });
  armR(o, 2.5, 0.35, 0.0, 0.6); armL(o, 2.5, 0.35, 0.0, 0.6);
};
const arrowDive = (ctx, o) => {
  bset(o, { ground: 0, hipsPitch: 0.1, waistPitch: 0.25, neckPitch: 0.2, lHipSwing: 0.15, lKnee: 0.15, lHipOut: 0.1, lAnkle: -0.5, rHipSwing: 0.05, rKnee: 0.1, rHipOut: 0.1, rAnkle: -0.5 });
  armR(o, 0.6, 1.0, 0.0, 0.6); armL(o, 0.6, 1.0, 0.0, 0.6);
};

// ---- 相手へ矢印を飛ばす・貼る（スキル4・必殺技）。0.5 で右手を突き出す ----
const SLAP = [
  { t: 0, pose: aGuard },
  { t: 0.3, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: -0.4, waistYaw: -0.45, neckYaw: 0.6, lKnee: 0.9, rKnee: 0.8 }); armR(o, 0.6, 0.6, 0.2, 1.7); armL(o, 1.3, 0.1, 0.1, 1.0); } },
  { t: 0.5, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: 0.35, waistYaw: 0.4, neckYaw: -0.2, hipsZ: 0.2, waistPitch: 0.35, lHipSwing: 0.9, lKnee: 0.5, rHipSwing: -0.5, rFlat: 0.3 }); armR(o, 1.55, 0.0, 0.2, 0.1); armL(o, 0.9, 0.3, 0.1, 2.0); } },
  { t: 0.75, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: 0.4, waistYaw: 0.45, hipsZ: 0.2, waistPitch: 0.4, lHipSwing: 0.9, lKnee: 0.5, rHipSwing: -0.5, rFlat: 0.3 }); armR(o, 1.5, 0.0, 0.2, 0.15); armL(o, 0.9, 0.3, 0.1, 2.0); } },
  { t: 1, ease: 'out', pose: aGuard },
];
const arrowSlap = (ctx, o) => keyed(ctx.attackT, SLAP, o);

// ---- 必殺技: 両手を頭の上に上げて、前向き矢印を貼る（attackT 0 → 1）----
const arrowRaise = (ctx, o) => {
  const u = smooth(ctx.attackT / 0.6);
  FSTANCE(o);
  bset(o, { waistPitch: 0.1 - 0.35 * u, neckPitch: -0.1 - 0.35 * u, lKnee: 0.65 + 0.2 * u, rKnee: 0.55 + 0.2 * u });
  armR(o, 1.25 + 1.65 * u, 0.25 + 0.1 * u, 0.1, 1.9 - 1.6 * u); armL(o, 1.35 + 1.55 * u, 0.3 + 0.1 * u, 0.1, 1.9 - 1.6 * u);
};
// ---- 人間砲弾: 腕をそろえてまっすぐ前へ飛ぶ ----
const arrowRush = (ctx, o) => {
  const f = 0.05 * sin(ctx.time * 40);
  bset(o, { ground: 0, lift: 2.4, hipsPitch: 0.6, waistPitch: 0.9, neckPitch: -0.9, lHipSwing: -0.5 + f, lKnee: 0.2, lAnkle: -0.6, rHipSwing: -0.6 - f, rKnee: 0.25, rAnkle: -0.6 });
  armR(o, 2.9, 0.05, 0.0, 0.1); armL(o, 2.9, 0.05, 0.0, 0.1);
};
// ---- 押さえつけられている相手（下向き矢印）----
const pressed = (ctx, o) => {
  const j = ctx.jolt ?? 0;
  bset(o, { hipsPitch: 0.3 + 0.1 * j, waistPitch: 0.7 + 0.15 * j, neckPitch: 0.4, lHipSwing: 0.5, lKnee: 1.0, lHipOut: 0.5, rHipSwing: 0.4, rKnee: 0.9, rHipOut: 0.5, hipsRoll: 0.08 * sin(ctx.time * 60) * j });
  armR(o, 0.8, 0.9, 0.0, 0.8); armL(o, 0.8, 0.9, 0.0, 0.8);
};

// ============================================================
// 擬音（素手。大声で言うと、その文字が出てくる）用のポーズ
// ============================================================
export function carryOnom(name, ctx, o) {
  const t = ctx.time;
  switch (name) {
    case 'stand':
      armR(o, 0.1 + (o.rShoulderSwing - 0.03) * 0.5, 0.18, 0.0, 0.3);
      armL(o, 0.1 + (o.lShoulderSwing + 0.03) * 0.5, 0.18, 0.0, 0.3);
      break;
    case 'fight': { // 両手をひらいて、息をすって（胸がふくらむ）、いつでも叫べる構え
      FSTANCE(o);
      const br = sin(t * 3.2);
      bset(o, { waistPitch: 0.04 + 0.02 * br, neckPitch: -0.12 });
      armR(o, 1.05 + 0.04 * br, 0.5, 0.1, 1.3); armL(o, 1.05 + 0.04 * br, 0.5, 0.1, 1.3);
      break;
    }
    default: break;
  }
}
const oFight = (o) => { FSTANCE(o); bset(o, { waistPitch: 0.04, neckPitch: -0.12 }); armR(o, 1.05, 0.5, 0.1, 1.3); armL(o, 1.05, 0.5, 0.1, 1.3); };

// ---- ドン: 息をすって（のけぞる）、両手で押し出す。0.36 で文字が出る ----
const OA1 = [
  { t: 0, pose: oFight },
  { t: 0.2, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: -0.1, waistPitch: -0.18, neckPitch: -0.4, lKnee: 0.95, rKnee: 0.9 }); armR(o, 0.55, 0.45, 0.0, 1.9); armL(o, 0.55, 0.45, 0.0, 1.9); } },
  { t: 0.36, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.22, hipsPitch: 0.15, waistPitch: 0.4, neckPitch: -0.1, lHipSwing: 0.85, lKnee: 0.5, rHipSwing: -0.5, rKnee: 0.6, rFlat: 0.3 }); armR(o, 1.55, 0.1, 0.1, 0.1); armL(o, 1.55, 0.1, 0.1, 0.1); } },
  { t: 0.6, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsZ: 0.2, hipsPitch: 0.14, waistPitch: 0.4, lHipSwing: 0.85, lKnee: 0.5, rHipSwing: -0.5, rKnee: 0.6, rFlat: 0.3 }); armR(o, 1.5, 0.1, 0.1, 0.15); armL(o, 1.5, 0.1, 0.1, 0.15); } },
  { t: 1, ease: 'out', pose: oFight },
];
const attackO1 = (ctx, o) => keyed(ctx.attackT, OA1, o);
// ---- グラグラ: 足を上げて、ドスンと踏みつける。0.38 で文字が地面へ ----
const OA2 = [
  { t: 0, pose: oFight },
  { t: 0.22, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { hipsX: -0.08, waistPitch: -0.1, neckPitch: -0.3, rHipSwing: 1.5, rKnee: 1.6, rHipOut: 0.2, lKnee: 0.4 }); armR(o, 2.0, 0.7, 0.0, 0.8); armL(o, 2.0, 0.7, 0.0, 0.8); } },
  { t: 0.38, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsPitch: 0.15, waistPitch: 0.55, neckPitch: -0.2, lKnee: 1.2, rHipSwing: 0.5, rKnee: 1.0, lHipOut: 0.5, rHipOut: 0.5 }); armR(o, 0.4, 1.0, 0.0, 0.5); armL(o, 0.4, 1.0, 0.0, 0.5); } },
  { t: 0.7, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsPitch: 0.1, waistPitch: 0.5, lKnee: 1.1, rKnee: 1.0, lHipOut: 0.5, rHipOut: 0.5 }); armR(o, 0.5, 1.0, 0.0, 0.5); armL(o, 0.5, 1.0, 0.0, 0.5); } },
  { t: 1, ease: 'out', pose: oFight },
];
function attackO2(ctx, o) {
  keyed(ctx.attackT, OA2, o);
  const t = ctx.attackT;
  if (t > 0.38 && t < 0.8) { const k = (1 - (t - 0.38) / 0.42); o.hipsRoll += 0.06 * sin(ctx.time * 70) * k; o.hipsX += 0.03 * sin(ctx.time * 63) * k; } // 地面がゆれて、体もグラグラ
}
// ---- メラメラ: 両手をこすって火をおこし、右手を突き出す。0.38 で文字が出る ----
const OA3 = [
  { t: 0, pose: oFight },
  { t: 0.2, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.22, neckPitch: 0.1, lKnee: 0.85, rKnee: 0.8 }); armR(o, 1.2, 0.0, 0.5, 2.0); armL(o, 1.2, 0.0, 0.5, 2.0); } },
  { t: 0.38, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: 0.3, waistYaw: 0.35, hipsZ: 0.2, waistPitch: 0.35, lHipSwing: 0.85, lKnee: 0.5, rHipSwing: -0.5, rFlat: 0.3 }); armR(o, 1.55, 0.0, 0.1, 0.1); armL(o, 0.7, 0.4, 0.1, 1.9); } },
  { t: 0.7, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { hipsYaw: 0.3, waistYaw: 0.35, hipsZ: 0.2, waistPitch: 0.35, lHipSwing: 0.85, lKnee: 0.5, rHipSwing: -0.5, rFlat: 0.3 }); armR(o, 1.5, 0.0, 0.1, 0.15); armL(o, 0.7, 0.4, 0.1, 1.9); } },
  { t: 1, ease: 'out', pose: oFight },
];
function attackO3(ctx, o) {
  keyed(ctx.attackT, OA3, o);
  const t = ctx.attackT;
  if (t > 0.05 && t < 0.36) { const r = sin(ctx.time * 50) * 0.1; o.rShoulderSwing += r; o.lShoulderSwing -= r; } // 手をこすり合わせる
}
// ---- スキル・必殺技の「叫び」: 口の横に手をあてて息をすい（0〜0.35）、腕をひろげて叫ぶ（0.5 で文字）----
const OSH = [
  { t: 0, pose: oFight },
  { t: 0.3, ease: 'inout', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: -0.12, neckPitch: -0.45, hipsZ: -0.08, lKnee: 0.8, rKnee: 0.75 }); armR(o, 2.0, 0.55, 0.0, 2.2); armL(o, 2.0, 0.55, 0.0, 2.2); } },
  { t: 0.5, ease: 'in', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.3, hipsZ: 0.2, neckPitch: -0.2, lHipSwing: 0.8, lKnee: 0.5, rHipSwing: -0.45, rFlat: 0.3 }); armR(o, 1.45, 0.9, 0.0, 0.2); armL(o, 1.45, 0.9, 0.0, 0.2); } },
  { t: 0.75, ease: 'out', pose: (o) => { FSTANCE(o); bset(o, { waistPitch: 0.3, hipsZ: 0.2, lHipSwing: 0.8, lKnee: 0.5, rHipSwing: -0.45, rFlat: 0.3 }); armR(o, 1.4, 0.9, 0.0, 0.25); armL(o, 1.4, 0.9, 0.0, 0.25); } },
  { t: 1, ease: 'out', pose: oFight },
];
const onomShout = (ctx, o) => keyed(ctx.attackT, OSH, o);

export const POSES = {
  attackS1, attackS2, attackS3, sawThrow, sawOverhead, sawLegGrow, sawKick, sawGear,
  attackO1, attackO2, attackO3, onomShout,
  attackA1, attackA2, attackA3, arrowCannon, arrowStick, arrowJump, arrowDive, arrowSlap, arrowRaise, arrowRush, pressed,
  attackF1, attackF2, attackF3, attackFAir, attackFStrike, fangRaise, fangSweep1, fangSweep2, fangSweep3, fangMorph, fangSpin, fangLand, fangBerserk, lookAround,
  attackB1, attackB2, attackB3, attackBP, attackBQ, batCall, batPitch, batPitchL, batBallDraw, batHaymaker, batCatch, batToss, batLeap, batSmash,
  ultDraw, ultThrow, ultSummon, ultWindup, ultDash, ultFinish, ultLeap, ultLand,
  stunned, lungeAim, lungeDash, lungeStrike,
  chargeStance,
  groundStab, stabCharge, stabPull,
  spinUp, throwSword, beckon, flurry, pullOut, kick, impaled, dragged, pummeled,
  stand, fight, walk, run, crouch, air, land, attack1, attack2, attack3, airSlam, hit,
  grab, liftCrouch, carry, throw: throwDown, struggle, thrown, down, brake,
};
