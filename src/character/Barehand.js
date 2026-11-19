// 素手の歩き・小走り・走り・ジャンプ（踏み切り → 空中 → 着地）。
//
// Claude13 の poses.js（walk / run / crouch / air / land）を土台に、素手のために細かく作り直したもの。
// 追加した点:
//   - 歩き : かかと着地（つま先を上げる）→ 荷重で膝がわずかに曲がる → 立脚中期で伸びる → つま先で蹴る、の足首・膝の動き。
//            骨盤の回旋・左右の傾き・体重移動、胸の逆ねじれ、頭は水平を保つ。腕は力を抜いてふり、手は軽く曲げる
//   - 走り : 前傾、肘は約 90 度、握りこぶし、蹴った足を尻へ引きつける、両足が浮く滞空。後ろへ引く腕は肘を開いて大きく
//   - 小走り: 歩きと走りの中間（加速・減速の途中で自然につながる）
//   - ジャンプ: ため（しゃがみ）→ 踏み切り（全身を伸ばして足首で蹴る）→ 上昇 → 頂点 → 落下 → 着地（沈み込み → 立ち直り）
//            立ち幅と、走りながらの跳び（脚を前後に開いて大股で跳ぶ。前に出す脚は踏み切った時の脚）で別の姿勢
//
// ctx（Animator）から読む値:
//   phase    歩き・走りの周期位置（移動距離に合わせて進める）   runK    0 = 立ち（歩き）… 1 = 走りながら
//   airU     空中の縦速度 +1（踏み切り直後）→ 0（頂点）→ -1（着地直前）
//   jumpT    踏み切り・着地の進み具合 0 → 1                     leadSide  前へ出す脚 +1 = 左 / -1 = 右
//   landK    着地の衝撃の強さ 0〜1
import { POSES, makePose, resetPose, lerpPose, lobe, plateau, smooth, SIDES } from './poses.js';

const { sin, cos, PI, max, min, abs } = Math;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => min(1, max(0, x));

const tmpA = makePose();
const tmpB = makePose();

// ============================================================
// 立ち: 元の立ちに、力を抜いた手（軽く曲げる）だけ足す
// ============================================================
const baseStand = POSES.stand;
function stand(ctx, o) {
  baseStand(ctx, o);
  o.lWristBend = o.rWristBend = 0.16;
}

// ============================================================
// 歩き: 1 周期 = 左右 1 歩ずつ。位相 0 で左脚が体の真下を前へ通過
//   脚の位相 q: 0 = 前へ振り出し中 / π/2 = かかと着地 / π = 立脚中期（体の真下）/ 3π/2 = つま先で蹴り出し
// ============================================================
function walk(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  const cL = cos(p);

  for (const [k, off] of SIDES) {
    const q = p + off;
    const s = sin(q);
    // 股関節: 前への振り出しは大きく、後ろへの蹴りは少し控えめ
    o[k + 'HipSwing'] = 0.06 + (s > 0 ? 0.5 : 0.4) * s;
    // 膝: 着地で伸びきる → 荷重で少し曲がる（衝撃吸収）→ 立脚中期で伸びる → 蹴り出しから遊脚で大きく曲がる
    o[k + 'Knee'] = 0.05
      + 1.05 * lobe(q, -0.75, 1.75)
      + 0.2 * lobe(q, 2.25, 0.7);
    // 立脚中は靴底を地面に（接地ははかかとから）。遊脚の途中はつま先を引き上げて地面を擦らない
    o[k + 'Flat'] = max(plateau(q, 2.85, 1.75, 1.1), 0.8 * lobe(q, 0.2, 1.5));
    // 足首: かかと着地でつま先を上げ、蹴り出しの直前でつま先を伸ばす
    o[k + 'Ankle'] = 0.2 * lobe(q, 1.45, 0.5) - 0.38 * lobe(q, 4.4, 0.7);
    o[k + 'HipOut'] = 0.03;
    o[k + 'HipTwist'] = 0.06 + 0.03 * lobe(q, 1.5, 1.2); // 着地の脚のつま先が少し外へ
    // 腕: 反対の脚と一緒に前へ。前へ出るほど肘が曲がり、後ろでは伸びる。手は軽く曲げる
    const a = -s;
    o[k + 'ShoulderSwing'] = 0.05 + (a > 0 ? 0.42 : 0.36) * a;
    o[k + 'Elbow'] = 0.3 + 0.25 * a;
    o[k + 'ShoulderOut'] = 0.06 + 0.02 * (1 - abs(a));
    o[k + 'ShoulderTwist'] = 0.22;
    o[k + 'WristBend'] = 0.2 + 0.12 * a;
  }

  // 骨盤は前に出る脚の側が前へ回り、胸は逆へねじれる。頭は正面を保つ
  o.hipsYaw = -0.1 * sL;
  o.waistYaw = 0.23 * sL;
  o.neckYaw = -(o.hipsYaw + o.waistYaw) * 0.85;
  // 遊脚側の骨盤が少し下がり、体重は立脚側へ寄る。胸は逆に傾き、頭は水平を保つ
  o.hipsRoll = -0.04 * cL;
  o.waistRoll = 0.055 * cL;
  o.neckRoll = -(o.hipsRoll + o.waistRoll) * 0.8;
  o.hipsX = -0.055 * cL;
  o.hipsPitch = 0.03 + 0.012 * cos(2 * p);   // 1 歩ごとに骨盤が小さく上下に傾く
  o.waistPitch = 0.05 + 0.015 * cos(2 * p);
  o.neckPitch = -0.06 - 0.01 * cos(2 * p);   // 頭の小さなうなずき（上下動を打ち消す）
}

// ============================================================
// 走り: 前傾、肘約 90 度の大きな腕振り、握りこぶし、蹴った足を尻へ引きつける。両足が浮く滞空あり
// ============================================================
function run(ctx, o) {
  const p = ctx.phase;
  const sL = sin(p);
  const cL = cos(p);

  for (const [k, off] of SIDES) {
    const q = p + off;
    const s = sin(q);
    o[k + 'HipSwing'] = 0.28 + (s > 0 ? 0.88 : 0.8) * s; // もも上げは高く、後ろへの蹴りは控えめ
    o[k + 'Knee'] = 0.32
      + 1.3 * lobe(q, -0.55, 1.45)   // 蹴った後、かかとを尻へ引きつける
      + 0.55 * lobe(q, 0.85, 1.2);   // もも上げ中もスネは畳んだまま
    // 接地は体の真下で短く。前へ運ぶ間はつま先を引き上げて地面を擦らない
    o[k + 'Flat'] = max(0.85 * lobe(q, PI + 0.2, 1.0), 0.6 * lobe(q, 0.6, 1.3));
    o[k + 'Ankle'] = -0.28 * lobe(q, -1.2, 1.0) + 0.12 * lobe(q, 1.4, 0.6); // 蹴り出しでつま先を伸ばし、着地前に少し上げる
    o[k + 'HipOut'] = 0.02;
    o[k + 'HipTwist'] = 0.05;
    const a = -s;
    // 腕: 前へは肘を畳んで拳を肩の高さへ、後ろへは肘を開いて大きく引く
    o[k + 'ShoulderSwing'] = 0.15 + (a > 0 ? 0.95 : 0.82) * a;
    o[k + 'Elbow'] = 1.5 + 0.3 * a;
    o[k + 'ShoulderOut'] = 0.1 + 0.1 * max(0, -a); // 後ろへ引くとき肘が少し外へ
    o[k + 'ShoulderTwist'] = 0.38;
    o[k + 'WristBend'] = 0.5 + 0.1 * a;             // 握りこぶし
  }

  o.hipsYaw = -0.16 * sL;
  o.waistYaw = 0.4 * sL;
  o.neckYaw = -(o.hipsYaw + o.waistYaw) * 0.9;
  o.hipsRoll = -0.05 * cL;
  o.waistRoll = 0.07 * cL;
  o.neckRoll = -(o.hipsRoll + o.waistRoll) * 0.8;
  o.hipsX = -0.04 * cL;
  o.hipsPitch = 0.12;
  o.waistPitch = 0.25 + 0.035 * cos(2 * p);
  o.neckPitch = -0.26;                              // 体は前傾でも視線は前へ
  // 片足が体の真下にある短い間だけ接地し、それ以外は両足が浮いて放物線を描く
  o.ground = max(plateau(p, 0.2, 0.75, 0.3), plateau(p, 0.2 + PI, 0.75, 0.3));
  o.hipsFree = -0.05 + 0.3 * (lobe(p, 1.77, 1.1) + lobe(p, 1.77 + PI, 1.1));
}

// ============================================================
// 小走り: 歩きと走りの中間（前傾・腕振り・滞空が半分）。加速の途中や、ゆっくり走るとき
// ============================================================
function jog(ctx, o) {
  resetPose(tmpA);
  resetPose(tmpB);
  walk(ctx, tmpA);
  run(ctx, tmpB);
  lerpPose(o, tmpA, tmpB, 0.55);
  for (const k of ['l', 'r']) o[k + 'WristBend'] = 0.36 + (tmpB[k + 'WristBend'] - 0.5) * 0.5; // こぶしは軽く握る
  o.ground = max(plateau(ctx.phase, 0.2, 0.9, 0.35), plateau(ctx.phase, 0.2 + PI, 0.9, 0.35)); // 滞空は短め
  o.hipsFree = 0.55 * tmpB.hipsFree;
}

// ============================================================
// ジャンプ 1: ため（しゃがみ）。膝を曲げて体を沈め、腕を後ろへ引いて力をためる
//   jumpT 0 → 1。走りながらのときは浅く（勢いを止めない）
// ============================================================
function jumpCrouch(ctx, o) {
  const r = ctx.runK;
  const d = smooth(ctx.jumpT) * (1 - 0.5 * r); // 沈み込みの深さ
  o.hipsPitch = lerp(0.03, 0.2, d);
  o.waistPitch = lerp(0.05, 0.5, d);
  o.neckPitch = lerp(-0.06, -0.42, d);
  const lead = ctx.leadSide > 0 ? 'l' : 'r';
  for (const [k] of SIDES) {
    const front = k === lead ? 1 : 0; // 走りながらは、前に出す脚を少し前へ置く
    o[k + 'HipSwing'] = lerp(0.04, 0.95, d) + 0.25 * r * front * d;
    o[k + 'Knee'] = lerp(0.07, 1.45, d);
    o[k + 'HipOut'] = lerp(0.055, 0.1, d);
    o[k + 'HipTwist'] = 0.1;
    o[k + 'Flat'] = 1;
    o[k + 'Ankle'] = 0;
    o[k + 'ShoulderSwing'] = lerp(0.05, -0.95, d);   // 腕を後ろへ振り上げる
    o[k + 'ShoulderOut'] = lerp(0.07, 0.2, d);
    o[k + 'ShoulderTwist'] = 0.2;
    o[k + 'Elbow'] = lerp(0.2, 0.4, d);
    o[k + 'WristBend'] = 0.25;
  }
}

// ============================================================
// ジャンプ 2: 踏み切り。膝・股関節を一気に伸ばし、足首で床を蹴り、腕を前上へ振り上げる
//   jumpT 0 → 1。最後に足が床を離れる（ground → 0）
// ============================================================
function jumpPush(ctx, o) {
  const t = ctx.jumpT;
  const e = smooth(t);
  const r = ctx.runK;
  const lead = ctx.leadSide > 0 ? 'l' : 'r';
  o.hipsPitch = lerp(0.2, -0.04, e);
  o.waistPitch = lerp(0.5, -0.08, e);
  o.neckPitch = lerp(-0.42, -0.15, e);
  for (const [k] of SIDES) {
    const isLead = k === lead;
    // 立ち: 両脚で伸びる。走り: 踏み切る脚は後ろへ蹴り、前に出す脚は膝を高く引き上げる
    const kneeStand = lerp(1.45, 0.12, e), hipStand = lerp(0.95, -0.05, e);
    const kneeRun = isLead ? lerp(1.3, 1.25, e) : lerp(1.45, 0.25, e);
    const hipRun = isLead ? lerp(1.0, 1.1, e) : lerp(0.9, -0.45, e);
    o[k + 'HipSwing'] = lerp(hipStand, hipRun, r);
    o[k + 'Knee'] = lerp(kneeStand, kneeRun, r);
    o[k + 'HipOut'] = lerp(0.1, 0.05, e);
    o[k + 'HipTwist'] = 0.1;
    // 足首: かかとが浮いて、つま先で蹴る
    o[k + 'Flat'] = isLead && r > 0.5 ? 0 : 1 - smooth((t - 0.35) / 0.5);
    o[k + 'Ankle'] = -0.7 * smooth((t - 0.3) / 0.6);
    // 腕: 後ろ → 前上へ。走りながらは脚と逆の腕が前へ
    const armSwingStand = lerp(-0.95, 2.2, e);
    const armSwingRun = isLead ? lerp(-0.6, -0.1, e) : lerp(-0.6, 1.5, e);
    o[k + 'ShoulderSwing'] = lerp(armSwingStand, armSwingRun, r);
    o[k + 'ShoulderOut'] = lerp(0.2, 0.25, e);
    o[k + 'ShoulderTwist'] = 0.2;
    o[k + 'Elbow'] = lerp(0.4, lerp(0.3, 1.3, r), e);
    o[k + 'WristBend'] = lerp(0.25, 0.2 + 0.3 * r, e);
  }
  o.ground = 1 - smooth((t - 0.7) / 0.3); // 蹴り終わる最後に離れる
  o.hipsFree = 0;
}

// ============================================================
// ジャンプ 3: 空中。airU（+1 → 0 → -1）で 上昇 → 頂点 → 落下 を滑らかにつなぐ。
//   runK で、立ち幅の姿勢（腕を振り上げ、膝を抱え込む）と、走りの大股の姿勢（脚を前後に開く）を混ぜる
// ============================================================
// 立ち（rise / apex / fall）と走り（rise / apex / fall）の姿勢を、前に出す脚 lead・後ろの脚 trail で書く。
// どちらも「空中の左右対称でない形」: 片足が少し遅れる
function airKey(o, phase, r, lead, trail) {
  const set = (field, stand, run) => { o[field] = lerp(stand, run, r); };
  if (phase === 'rise') {
    set('waistPitch', -0.1, 0.12); set('neckPitch', -0.15, -0.2); set('hipsPitch', -0.04, 0.1);
    set(lead + 'HipSwing', 0.05, 0.95); set(lead + 'Knee', 0.12, 0.7);
    set(trail + 'HipSwing', -0.22, -0.5); set(trail + 'Knee', 0.2, 1.35);
    for (const k of [lead, trail]) { set(k + 'Ankle', -0.55, k === lead ? -0.2 : -0.6); set(k + 'HipOut', 0.04, 0.04); }
    // 腕: 立ちは両腕を高く。走りは脚と逆の腕を前へ、同じ側の腕を後ろへ
    set(lead + 'ShoulderSwing', 2.3, -0.5); set(lead + 'Elbow', 0.3, 1.1); set(lead + 'ShoulderOut', 0.22, 0.2);
    set(trail + 'ShoulderSwing', 2.3, 1.7); set(trail + 'Elbow', 0.3, 1.3); set(trail + 'ShoulderOut', 0.22, 0.12);
    for (const k of [lead, trail]) { set(k + 'ShoulderTwist', 0.2, 0.35); set(k + 'WristBend', 0.2, 0.5); }
  } else if (phase === 'apex') {
    set('waistPitch', 0.14, 0.2); set('neckPitch', -0.05, -0.2); set('hipsPitch', 0, 0.06);
    // 立ち: 膝を抱え込む。走り: 大股に開いて滞空（脚を前後へ伸ばす）
    set(lead + 'HipSwing', 1.4, 1.15); set(lead + 'Knee', 1.75, 0.35);
    set(trail + 'HipSwing', 0.95, -0.7); set(trail + 'Knee', 1.85, 1.05);
    for (const k of [lead, trail]) { set(k + 'Ankle', -0.2, -0.25); set(k + 'HipOut', 0.1, 0.08); }
    set(lead + 'ShoulderSwing', 1.25, -0.25); set(lead + 'Elbow', 0.7, 1.0); set(lead + 'ShoulderOut', 0.75, 0.3);
    set(trail + 'ShoulderSwing', 1.25, 1.35); set(trail + 'Elbow', 0.7, 1.15); set(trail + 'ShoulderOut', 0.75, 0.3);
    for (const k of [lead, trail]) { set(k + 'ShoulderTwist', 0.2, 0.3); set(k + 'WristBend', 0.2, 0.45); }
  } else { // fall: 着地へ向けて足を伸ばす
    set('waistPitch', 0.16, 0.18); set('neckPitch', 0.12, -0.1); set('hipsPitch', 0.04, 0.08);
    set(lead + 'HipSwing', 0.38, 1.0); set(lead + 'Knee', 0.5, 0.35);
    set(trail + 'HipSwing', 0.12, 0.35); set(trail + 'Knee', 0.3, 0.85);
    for (const k of [lead, trail]) { set(k + 'Ankle', -0.3, k === lead ? 0.1 : -0.3); set(k + 'HipOut', 0.12, 0.1); }
    // 腕は、立ちでは横上へ開いてバランス。走りでは脚と逆に振りながら下ろす
    set(lead + 'ShoulderSwing', 0.45, 0.3); set(lead + 'Elbow', 0.55, 1.0); set(lead + 'ShoulderOut', 1.25, 0.6);
    set(trail + 'ShoulderSwing', 0.45, 0.9); set(trail + 'Elbow', 0.55, 1.1); set(trail + 'ShoulderOut', 1.25, 0.5);
    for (const k of [lead, trail]) { set(k + 'ShoulderTwist', 0.3, 0.35); set(k + 'WristBend', 0.2, 0.4); }
  }
}

function air(ctx, o) {
  const u = max(-1, min(1, ctx.airU));
  const r = clamp01(ctx.runK);
  const lead = ctx.leadSide > 0 ? 'l' : 'r';
  const trail = lead === 'l' ? 'r' : 'l';
  resetPose(tmpA);
  resetPose(tmpB);
  airKey(tmpA, 'apex', r, lead, trail);
  airKey(tmpB, u >= 0 ? 'rise' : 'fall', r, lead, trail);
  lerpPose(o, tmpA, tmpB, smooth(abs(u)));
  // 体のねじり: 走りながらは、前に出す脚の側の腰が前へ出て、胸は逆へ
  const tw = 0.12 * r * (ctx.leadSide > 0 ? 1 : -1);
  o.hipsYaw = -tw;
  o.waistYaw = 2 * tw;
  o.neckYaw = -tw;
  o.hipsRoll = 0.03 * r * (ctx.leadSide > 0 ? -1 : 1);
  o.ground = 0;
  o.hipsFree = 0;
}

// ============================================================
// ジャンプ 4: 着地。足が着いた瞬間から沈み込み（衝撃を吸収）→ 立ち直る
//   jumpT 0 → 1。landK（落下の強さ）が大きいほど深く沈む。走りながらは前傾のまま、片足を前に着いて走りへつなぐ
// ============================================================
function land(ctx, o) {
  const t = ctx.jumpT;
  const r = clamp01(ctx.runK);
  // 沈み込みの深さ: 最初の 35% で一気に沈み、残りでゆっくり立ち直る（立ちの姿勢まで完全には戻らない = 次の動きへつながる）
  const down = t < 0.35 ? smooth(t / 0.35) : 1 - 0.88 * smooth((t - 0.35) / 0.65);
  const d = down * (0.5 + 0.5 * clamp01(ctx.landK));
  const lead = ctx.leadSide > 0 ? 'l' : 'r';
  o.hipsPitch = lerp(0.16, 0.14, r) * d + 0.02;
  o.waistPitch = lerp(0.06 + 0.38 * d, 0.14 + 0.26 * d, r);
  o.neckPitch = lerp(-0.28 * d, -0.22 - 0.1 * d, r);
  for (const [k] of SIDES) {
    const isLead = k === lead;
    const hipStand = 0.1 + 0.8 * d, kneeStand = 0.12 + 1.18 * d;
    const hipRun = isLead ? 0.45 + 0.4 * d : -0.05 + 0.5 * d;
    const kneeRun = isLead ? 0.35 + 0.65 * d : 0.55 + 0.6 * d;
    o[k + 'HipSwing'] = lerp(hipStand, hipRun, r);
    o[k + 'Knee'] = lerp(kneeStand, kneeRun, r);
    o[k + 'HipOut'] = 0.04 + 0.12 * d;
    o[k + 'HipTwist'] = 0.12;
    o[k + 'Flat'] = 1;
    o[k + 'Ankle'] = 0;
    // 腕: 立ちは前下へ出してバランス。走りは腕振りへ戻る
    const armStand = 0.1 + 0.5 * d;
    const armRun = isLead ? -0.2 + 0.2 * d : 0.9 - 0.2 * d;
    o[k + 'ShoulderSwing'] = lerp(armStand, armRun, r);
    o[k + 'ShoulderOut'] = lerp(0.1 + 0.4 * d, 0.15, r);
    o[k + 'ShoulderTwist'] = 0.25;
    o[k + 'Elbow'] = lerp(0.3 + 0.45 * d, 1.3, r);
    o[k + 'WristBend'] = lerp(0.2, 0.45, r);
  }
}

Object.assign(POSES, { stand, walk, jog, run, crouch: jumpCrouch, push: jumpPush, air, land });
