// 素手のプレイヤー操作: 歩く・小走り・走る・ジャンプ（ため → 踏み切り → 空中 → 着地）。
// Claude13 の Controller.js の移動まわり（歩幅を移動距離に合わせる・慣性の傾き・踏み切り〜着地）を土台にしている。
// 速さの単位は「リグ単位」（キャラの縮尺 scale を掛ける前。身長が約 5）。
const TWO_PI = Math.PI * 2;
const angleDiff = (a, b) => { const d = a - b; return d - TWO_PI * Math.round(d / TWO_PI); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const MOVE = {
  walkSpeed: 9.2,      // 歩き（毎秒）
  runSpeed: 24,        // 走り（Shift）
  accel: 90,           // 加速
  decel: 120,          // 減速
  airControl: 0.35,    // 空中での加減速の効き
  turnRate: 14,        // 向きを変える速さ
  // 歩き・走り 1 周期（2 歩）で進む距離。足の運びを移動距離に合わせて、足が滑って見えないようにする
  walkStride: 5.9,
  jogStride: 9.6,
  runStride: 13.5,
  jogFrom: 12,         // この速さ以上で小走り
  runFrom: 18,         // この速さ以上で走り
  jumpHeight: 4.2,     // 身長の約 0.85 倍
  gravity: 62,
  crouchTime: 0.11,    // ため
  pushTime: 0.07,      // 踏み切り（足が床を離れるまで）
  landTime: 0.22,      // 着地の沈み込みと立ち直り
  radius: 0.2,         // 当たり判定の半径（ワールド単位）
  step: 0.2,           // 乗り越えられる段差（ワールド単位）
};

export class PlayerController {
  /**
   * @param character createCharacter() の返り値
   * @param stage     createStage() の返り値（resolve / groundY を使う）
   */
  constructor(character, stage) {
    this.c = character;
    this.stage = stage;
    this.S = character.scale;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.state = 'ground'; // 'ground' | 'crouch' | 'push' | 'air' | 'land'
    this.timer = 0;
    this.total = 1;
    this.jumpBuffer = 0;
    this.lead = 1;         // 次に前へ出す脚（立ち幅跳びでは左右交互）
    this.fallV = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vz) / this.S; } // リグ単位

  /** cmd: { x, z（進みたい向き。長さ 0〜1）, run, jump } */
  update(dt, cmd) {
    const { group, animator } = this.c;
    const S = this.S, st = this.stage;
    const len = Math.hypot(cmd.x, cmd.z);
    const moving = len > 0.01;
    const dirX = moving ? cmd.x / len : 0, dirZ = moving ? cmd.z / len : 0;
    this.jumpBuffer = cmd.jump ? 0.12 : Math.max(0, this.jumpBuffer - dt); // 着地直前の入力も拾う

    // ---- 水平移動 ----
    const top = (cmd.run ? MOVE.runSpeed : MOVE.walkSpeed) * Math.min(1, len) * S;
    const control = this.state === 'air' ? MOVE.airControl : this.state === 'ground' ? 1 : 0.6;
    const tx = moving ? dirX * top : 0, tz = moving ? dirZ * top : 0;
    const rate = (moving ? MOVE.accel : MOVE.decel) * S * control * dt;
    const pvx = this.vx, pvz = this.vz, pYaw = group.rotation.y;
    const dx = tx - this.vx, dz = tz - this.vz, dist = Math.hypot(dx, dz);
    if (dist <= rate) { this.vx = tx; this.vz = tz; } else { this.vx += (dx / dist) * rate; this.vz += (dz / dist) * rate; }

    const px = group.position.x, pz = group.position.z;
    const r = st.resolve(px + this.vx * dt, pz + this.vz * dt, MOVE.radius);
    // 壁や建物に当たったら、当たった向きの速度を消す（押し付けたまま走り続けない）
    if (dt > 0) { this.vx = (r.x - px) / dt * (Math.abs(r.x - px - this.vx * dt) > 1e-6 ? 0.5 : 1); this.vz = (r.z - pz) / dt * (Math.abs(r.z - pz - this.vz * dt) > 1e-6 ? 0.5 : 1); }
    group.position.x = r.x; group.position.z = r.z;

    // 進む向きへなめらかに振り向く
    if (moving) group.rotation.y += angleDiff(Math.atan2(dirX, dirZ), group.rotation.y) * (1 - Math.exp(-MOVE.turnRate * dt));

    const speed = this.speed;
    const gy = st.groundY(group.position.x, group.position.z);

    // ---- 慣性の傾き: 加速で前のめり、減速でのけぞり、曲がるときは内側へ ----
    if (this.state === 'ground' && dt > 0) {
      const fx = Math.sin(group.rotation.y), fz = Math.cos(group.rotation.y);
      const accel = ((this.vx - pvx) * fx + (this.vz - pvz) * fz) / dt / S;
      animator.leanTarget = clamp(accel / MOVE.accel * 0.26, -0.3, 0.3);
      animator.bankTarget = clamp(angleDiff(group.rotation.y, pYaw) / dt * 0.022 * Math.min(1, speed / MOVE.walkSpeed), -0.28, 0.28);
    } else { animator.leanTarget = 0; animator.bankTarget = 0; }

    // 走りの度合い（ジャンプ・着地の姿勢の混ぜ具合）。歩きの速さで 0、走りの速さで 1
    animator.runTarget = clamp((speed - MOVE.walkSpeed * 1.1) / (MOVE.runSpeed * 0.7 - MOVE.walkSpeed * 1.1), 0, 1);

    // 歩き・走りの位相は進んだ距離に比例して進める（地上のときだけ）
    const gait = speed >= MOVE.runFrom ? 'run' : speed >= MOVE.jogFrom ? 'jog' : 'walk';
    const stride = gait === 'run' ? MOVE.runStride : gait === 'jog' ? MOVE.jogStride : MOVE.walkStride;
    if (this.state === 'ground') animator.phase = (animator.phase + (TWO_PI * speed * dt) / stride) % TWO_PI;

    const v0 = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight) * S; // 踏み切りの初速
    const startJump = () => {
      this.lead = speed > MOVE.walkSpeed * 1.2 ? (Math.sin(animator.phase) >= 0 ? 1 : -1) : -this.lead; // 走りながらは、いま前へ出ている脚が前に
      animator.leadSide = this.lead;
    };

    switch (this.state) {
      case 'ground': {
        // 足元の高さへなめらかに追従（段差・歩道の縁石）。大きく落ちたときは空中へ
        if (group.position.y - gy > MOVE.step) { this.state = 'air'; this.vy = 0; animator.play('air', 0.12); animator.airU = 0; break; }
        group.position.y += (gy - group.position.y) * (1 - Math.exp(-40 * dt));
        if (this.jumpBuffer > 0) {
          this.jumpBuffer = 0;
          startJump();
          if (speed > MOVE.walkSpeed * 1.3) { this.state = 'push'; this.timer = this.total = MOVE.pushTime; animator.play('push', 0.04); }
          else { this.state = 'crouch'; this.timer = this.total = MOVE.crouchTime; animator.play('crouch', 0.07); }
          animator.jumpT = 0;
        } else if (speed > 0.4) {
          if (animator.name === 'stand') animator.phase = 0; // 歩き出しは左足から
          animator.play(gait, animator.name === 'stand' ? 0.16 : 0.2);
        } else {
          const recover = animator.name === 'land';
          animator.play('stand', recover ? 0.3 : 0.22);
        }
        break;
      }
      case 'crouch': {
        this.timer -= dt;
        animator.jumpT = clamp(1 - this.timer / this.total, 0, 1);
        if (this.timer <= 0) { this.state = 'push'; this.timer = this.total = MOVE.pushTime; animator.jumpT = 0; animator.play('push', 0.03); }
        break;
      }
      case 'push': {
        this.timer -= dt;
        animator.jumpT = clamp(1 - this.timer / this.total, 0, 1);
        if (this.timer <= 0) { this.state = 'air'; this.vy = v0; animator.airU = 1; animator.play('air', 0.05); }
        break;
      }
      case 'air': {
        this.vy -= MOVE.gravity * S * dt;
        group.position.y += this.vy * dt;
        animator.airU = clamp(this.vy / v0, -1, 1);
        const g2 = st.groundY(group.position.x, group.position.z);
        if (group.position.y <= g2 && this.vy < 0) {
          group.position.y = g2;
          animator.landK = clamp(-this.vy / (v0 * 1.1), 0.15, 1); // 高いところから落ちるほど深く沈む
          this.vy = 0;
          this.state = 'land';
          this.total = this.timer = MOVE.landTime * (speed > MOVE.walkSpeed * 1.3 ? 0.65 : 1); // 走りながらなら素早く立て直す
          animator.jumpT = 0;
          animator.play('land', 0.04);
        }
        break;
      }
      case 'land': {
        group.position.y += (gy - group.position.y) * (1 - Math.exp(-40 * dt));
        this.timer -= dt;
        animator.jumpT = clamp(1 - this.timer / this.total, 0, 1);
        if (this.jumpBuffer > 0 && animator.jumpT > 0.5) { this.state = 'ground'; } // 沈み込みの後半からは連続ジャンプできる
        else if (this.timer <= 0) this.state = 'ground';
        break;
      }
    }
  }
}
