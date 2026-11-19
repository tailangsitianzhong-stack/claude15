import * as THREE from 'three';
import { RIG } from './rig.js';
import { POSES, carrySword, carryBat, carryFang, carryArrow, carryOnom, carrySaw, makePose, resetPose, lerpPose, copyPose } from './poses.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const tmp = new THREE.Vector3();

// 下半身として扱う項目（移動しながら攻撃するとき、ここだけ歩き・走りのサイクルに置き換える）
const LOWER = [
  'hipsX', 'hipsZ', 'hipsFree', 'lift', 'ground', 'hipsPitch', 'hipsYaw', 'hipsRoll',
  ...['l', 'r'].flatMap((k) => ['HipSwing', 'HipOut', 'HipTwist', 'Knee', 'Ankle', 'Flat'].map((f) => k + f)),
];
const locoWalk = makePose();
const locoRun = makePose();

/**
 * ポーズの再生係。
 *  - play(name, fade): 今の姿勢から fade 秒かけて次のモーションへなめらかに切り替える
 *  - phase: 歩き・走りの周期位置（コントローラが移動距離に合わせて進める）
 *  - airU : ジャンプ中の縦速度（+1 上昇 → -1 落下）
 *  - 足が地面に着くように、毎フレーム靴底の位置から腰の高さを決める（めり込み・浮き防止）
 */
export class Animator {
  constructor({ group, joints, soles, scale, armed = false }) {
    this.armed = armed;      // 剣を持っているか（持ち歩き方が変わる）
    this.attackT = 0;        // 攻撃モーションの進み具合 0 → 1
    this.hitT = 0;           // 被弾モーションの進み具合 0 → 1
    this.trailOn = false;    // 剣の軌跡を出している最中か
    this.lean = 0;           // 慣性による前後の傾き（現在値）。leanTarget へバネのように追従する
    this.bank = 0;           // 慣性による左右の傾き
    this.leanTarget = 0;
    this.bankTarget = 0;
    this.leanV = 0;
    this.bankV = 0;
    this.settle = false;
    this.loco = 0;           // 移動しながらの攻撃: 下半身を歩き・走りのサイクルにする度合い（0〜1、なめらかに変わる）
    this.locoTarget = 0;     // その目標（コントローラが毎フレーム決める）
    this.runK = 0;           // 歩き（0）と走り（1）のどちらのサイクルか（なめらかに変わる）
    this.runTarget = 0;
    this.spin = 0;           // スキル: 剣を振り回した角度
    this.jolt = 0;           // 殴られた直後に 1、すぐ 0 へ戻る（受ける側のポーズ用）
    this.joltSide = 1;       // どちら側から殴られたか（+1 / -1）
    this.group = group;
    this.joints = joints;
    this.soles = soles;
    this.scale = scale;

    this.name = 'stand';
    this.time = Math.random() * 10; // キャラごとに呼吸のタイミングをずらす
    this.phase = 0;
    this.airU = 0;
    this.debug = null; // { name, phase, airU, time } を入れるとその姿勢で固定（確認用）

    this.pose = makePose();     // 表示中の姿勢
    this.target = makePose();   // 再生中モーションの姿勢
    this.from = makePose();     // 切り替え開始時の姿勢
    this.fade = 1;              // 0 → 1
    this.fadeTime = 0;

    this.evaluate(this.name, this.pose);
    this.apply(this.pose);
  }

  // settle: true にすると、目標の姿勢を少し行き過ぎてから戻る（構え直すときの「揺り戻し」）
  play(name, fade = 0.15, settle = false) {
    if (name === this.name) return;
    this.name = name;
    this.settle = settle;
    copyPose(this.from, this.pose);
    this.fade = fade > 0 ? 0 : 1;
    this.fadeTime = fade;
  }

  evaluate(name, out) {
    resetPose(out);
    POSES[name](this, out);
    if (this.armed === 'bat') carryBat(name, this, out);
    else if (this.armed === 'fang') carryFang(name, this, out);
    else if (this.armed === 'saw') carrySaw(name, this, out);
    else if (this.armed === 'arrow') carryArrow(name, this, out);
    else if (this.armed === 'onom') carryOnom(name, this, out);
    else if (this.armed) carrySword(name, this, out);
    if (this.loco > 0.001 && name.startsWith('attack')) this.blendLocomotion(out);
    return out;
  }

  // 移動しながらの攻撃: 上半身は攻撃の振りのまま、腰から下を歩き・走りのサイクルに置き換える。
  // 腰の向きが変わる分は、胸で打ち消して、上半身の向きが攻撃モーションで作った向きのまま動かないようにする
  blendLocomotion(out) {
    const w = this.loco;
    resetPose(locoWalk);
    POSES.walk(this, locoWalk);
    resetPose(locoRun);
    POSES.run(this, locoRun);
    const yaw = out.hipsYaw + out.waistYaw;
    const pitch = out.hipsPitch + out.waistPitch;
    const roll = out.hipsRoll + out.waistRoll;
    for (const f of LOWER) {
      const target = locoWalk[f] + (locoRun[f] - locoWalk[f]) * this.runK;
      out[f] += (target - out[f]) * w;
    }
    out.waistYaw = yaw - out.hipsYaw;
    out.waistPitch = pitch - out.hipsPitch;
    out.waistRoll = roll - out.hipsRoll;
  }

  update(dt) {
    this.time += dt;
    this.jolt *= Math.exp(-13 * dt);
    const wantLoco = this.name.startsWith('attack') ? this.locoTarget : 0;
    this.loco += (wantLoco - this.loco) * (1 - Math.exp(-14 * dt));
    this.runK += (this.runTarget - this.runK) * (1 - Math.exp(-9 * dt));
    // 傾きは少し揺れながら目標へ落ち着くバネ（止まった直後に体が揺り戻す）
    const h = Math.min(dt, 0.033);
    this.leanV += ((this.leanTarget - this.lean) * 140 - this.leanV * 15) * h;
    this.lean += this.leanV * h;
    this.bankV += ((this.bankTarget - this.bank) * 140 - this.bankV * 17) * h;
    this.bank += this.bankV * h;
    if (this.debug) {
      const d = this.debug;
      const saved = [this.phase, this.airU, this.time, this.attackT, this.hitT];
      this.phase = d.phase ?? 0;
      this.airU = d.airU ?? 0;
      this.time = d.time ?? 0;
      this.attackT = d.attackT ?? 0;
      this.hitT = d.hitT ?? 0;
      this.evaluate(d.name, this.pose);
      [this.phase, this.airU, this.time, this.attackT, this.hitT] = saved;
      this.apply(this.pose);
      return;
    }
    this.evaluate(this.name, this.target);
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeTime);
      const f = this.fade;
      const c = 1.35; // 行き過ぎの強さ
      const k = this.settle ? 1 + (c + 1) * Math.pow(f - 1, 3) + c * Math.pow(f - 1, 2) : f * f * (3 - 2 * f);
      lerpPose(this.pose, this.from, this.target, k);
    } else {
      copyPose(this.pose, this.target);
    }
    this.apply(this.pose);
  }

  apply(p) {
    const j = this.joints;

    // 慣性: 加速・減速で体が前後に傾き、曲がるときは内側へ傾く（モーションの上に重ねる）
    const L = this.lean;
    const B = this.bank;
    j.hips.rotation.set(p.hipsPitch + L * 0.45, p.hipsYaw, p.hipsRoll + B * 0.5);
    j.waist.rotation.set(p.waistPitch + L * 0.55, p.waistYaw, p.waistRoll + B * 0.5);
    j.neck.rotation.set(p.neckPitch - L * 0.5, p.neckYaw, p.neckRoll - B * 0.6); // 頭は水平を保とうとする

    // side: 左 = +1, 右 = -1
    this.applyLimbs(p, 'l', 1, j.lShoulder, j.lElbow, j.lHip, j.lKnee, j.lAnkle);
    this.applyLimbs(p, 'r', -1, j.rShoulder, j.rElbow, j.rHip, j.rKnee, j.rAnkle);
    j.rWrist.rotation.set(p.swordTilt, p.swordTwist, p.swordRoll);
    j.lWrist.rotation.set(p.daggerTilt, 0, 0);

    // ---- 接地: 一番低い靴底が地面（ルートの高さ）に来るよう腰を上下させる ----
    j.hips.position.set(p.hipsX, RIG.hipY, p.hipsZ);
    let hipY = RIG.hipY + p.hipsFree;
    if (p.ground > 0) {
      this.group.updateWorldMatrix(true, true);
      let minY = Infinity;
      for (const s of this.soles) {
        tmp.copy(s.point).applyMatrix4(s.ankle.matrixWorld);
        if (tmp.y < minY) minY = tmp.y;
      }
      this.group.getWorldPosition(tmp);
      const soleY = (minY - tmp.y) / this.scale; // リグ単位での一番低い靴底の高さ
      const groundedY = RIG.hipY - soleY;
      hipY += (groundedY - hipY) * p.ground;
    }
    j.hips.position.y = hipY + p.lift;
  }

  applyLimbs(p, k, side, shoulder, elbow, hip, knee, ankle) {
    shoulder.rotation.set(-p[k + 'ShoulderSwing'], -side * p[k + 'ShoulderTwist'], side * p[k + 'ShoulderOut']);
    elbow.rotation.x = -p[k + 'Elbow'];
    hip.rotation.set(-p[k + 'HipSwing'], side * p[k + 'HipTwist'], side * p[k + 'HipOut']);
    knee.rotation.x = p[k + 'Knee'];
    // 足首: 接地中(Flat=1)はスネの傾きを打ち消して靴底を水平に保つ
    const shinPitch = p.hipsPitch + this.lean * 0.45 - p[k + 'HipSwing'] + p[k + 'Knee'];
    ankle.rotation.x = clamp(-shinPitch * p[k + 'Flat'] - p[k + 'Ankle'], -1.1, 1.1);
  }
}
