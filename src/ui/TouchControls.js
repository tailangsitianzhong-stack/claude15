// スマホ横画面用の操作UI（Claude13 の TouchControls.js から、スティックとジャンプボタンだけ取り出したもの。位置・大きさ・動きは同じ）
//  - 画面の左側（左 45%・上から 30% より下）: 触れた場所に出るスティック。倒した量で歩く速さが変わり、外周近くまで倒し切ると走る。
//    指を離すと左下の定位置に戻る
//  - 右下: ジャンプボタン。Claude13 では攻撃ボタン（--btn）の左にあるので、その分の場所をあけた位置に置く
// 画面のそれ以外の場所をドラッグするとカメラが回る（main.js が担当）。

const RUN_THRESHOLD = 0.92; // これ以上倒すと走る
const DEAD_ZONE = 0.12;

const CSS = `
#touch-ui { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#touch-ui.hidden { display: none; }
#stick-zone { position: absolute; left: 0; top: 30%; bottom: 0; width: 45%;
  pointer-events: auto; touch-action: none; }
#stick-base { position: absolute; width: var(--stick); height: var(--stick); margin: calc(var(--stick) / -2) 0 0 calc(var(--stick) / -2);
  border-radius: 50%; background: rgba(20, 30, 45, 0.28); border: 3px solid rgba(255, 255, 255, 0.55);
  box-sizing: border-box; transition: opacity 0.15s, border-color 0.1s, background 0.1s; opacity: 0.55; }
#stick-base.active { opacity: 1; }
#stick-base.run { border-color: #ffb43a; background: rgba(255, 150, 30, 0.22); }
#stick-base::after { /* 走りになる境目の目安 */
  content: ''; position: absolute; inset: 8%; border-radius: 50%; border: 2px dashed rgba(255, 255, 255, 0.25); }
#stick-knob { position: absolute; left: 50%; top: 50%; width: 44%; height: 44%; margin: -22% 0 0 -22%;
  border-radius: 50%; background: rgba(255, 255, 255, 0.9); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
#stick-base.run #stick-knob { background: #ffd27a; }
#run-label { position: absolute; left: 50%; top: -1.6em; transform: translateX(-50%);
  font: 700 13px/1 system-ui, sans-serif; color: #ffd27a; text-shadow: 0 1px 2px #000a;
  opacity: 0; transition: opacity 0.1s; white-space: nowrap; }
#stick-base.run #run-label { opacity: 1; }

/* ジャンプ: Claude13 と同じ位置（攻撃ボタン --btn の左に、一回り小さく）。攻撃ボタンの場所はあけてある */
#jump-btn { position: absolute; width: var(--btn2); height: var(--btn2);
  right: calc(28px + env(safe-area-inset-right) + var(--btn) + 16px); bottom: calc(26px + env(safe-area-inset-bottom));
  border-radius: 50%; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle at 50% 35%, rgba(90, 170, 255, 0.95), rgba(30, 100, 210, 0.95));
  border: 4px solid rgba(255, 255, 255, 0.85); box-sizing: border-box;
  box-shadow: 0 4px 0 rgba(5, 40, 110, 0.6), 0 6px 14px rgba(0, 0, 0, 0.3);
  display: grid; place-items: center; transition: transform 0.05s, box-shadow 0.05s; }
#jump-btn.pressed { transform: translateY(3px) scale(0.94); box-shadow: 0 1px 0 rgba(5, 40, 110, 0.6), 0 2px 6px rgba(0, 0, 0, 0.3); }
#jump-btn svg { width: 54%; height: 54%; }
`;

// ジャンプのアイコン（上向きの二重矢印）
const JUMP_SVG = `
<svg class="icon-jump" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="14,34 32,14 50,34" stroke="#0a2f73" stroke-width="13"/>
  <polyline points="14,52 32,32 50,52" stroke="#0a2f73" stroke-width="13"/>
  <polyline points="14,34 32,14 50,34" stroke="#ffffff" stroke-width="7"/>
  <polyline points="14,52 32,32 50,52" stroke="#ffffff" stroke-width="7"/>
</svg>`;

export class TouchControls {
  constructor() {
    this.x = 0;              // スティックの横（右 +）
    this.y = 0;              // スティックの縦（上 = 前 +）
    this.run = false;
    this.jumpQueued = false; // ジャンプが押された（読み取られるまで保持）
    this.enabled = false;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'touch-ui';
    this.root.classList.add('hidden');
    this.root.innerHTML = `
      <div id="stick-zone"><div id="stick-base"><span id="run-label">RUN</span><div id="stick-knob"></div></div></div>
      <div id="jump-btn" role="button" aria-label="ジャンプ">${JUMP_SVG}</div>`;
    document.body.appendChild(this.root);
    this.zone = this.root.querySelector('#stick-zone');
    this.base = this.root.querySelector('#stick-base');
    this.knob = this.root.querySelector('#stick-knob');
    this.jumpBtn = this.root.querySelector('#jump-btn');

    this.bindStick();
    this.bindJump();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));

    // タッチ操作の端末なら表示。PC でも画面に触れたら表示に切り替える
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root.classList.remove('hidden');
    this.resize(); // 表示してから位置を計算する（非表示中は大きさが 0 のため）
  }

  // 画面の短い辺に合わせてスティックとボタンの大きさを決める（Claude13 と同じ式）
  resize() {
    const short = Math.min(innerWidth, innerHeight);
    this.stickSize = Math.round(Math.max(110, Math.min(170, short * 0.36)));
    this.root.style.setProperty('--stick', `${this.stickSize}px`);
    const btn = Math.round(Math.max(84, Math.min(130, short * 0.27))); // 攻撃ボタンの大きさ（ジャンプの位置と大きさの基準）
    this.root.style.setProperty('--btn', `${btn}px`);
    this.root.style.setProperty('--btn2', `${Math.round(btn * 0.76)}px`);
    this.restPos();
  }

  // 触れていないときのスティックの位置（左下）
  restPos() {
    const r = this.zone.getBoundingClientRect();
    this.home = { x: this.stickSize * 0.5 + 40, y: r.height - this.stickSize * 0.5 - 30 };
    if (this.stickId == null) this.placeBase(this.home.x, this.home.y);
  }

  placeBase(x, y) {
    this.origin = { x, y };
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
  }

  bindStick() {
    this.stickId = null;
    const local = (e) => {
      const r = this.zone.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.stickId != null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      // 触れた場所にスティックを出す（画面の端ではみ出さないよう寄せる）
      const p = local(e);
      const r = this.zone.getBoundingClientRect();
      const half = this.stickSize / 2;
      this.placeBase(Math.max(half + 8, Math.min(r.width - half, p.x)), Math.max(half, Math.min(r.height - half - 8, p.y)));
      this.base.classList.add('active');
      this.moveStick(p);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      this.moveStick(local(e));
    });
    const end = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.x = this.y = 0;
      this.run = false;
      this.knob.style.transform = '';
      this.base.classList.remove('active', 'run');
      this.placeBase(this.home.x, this.home.y);
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  moveStick(p) {
    const radius = this.stickSize * 0.5;
    let dx = p.x - this.origin.x;
    let dy = p.y - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx *= radius / len; dy *= radius / len; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const mag = Math.min(1, len / radius);
    if (mag < DEAD_ZONE) {
      this.x = this.y = 0;
      this.run = false;
    } else {
      // 遊びの分を差し引いて 0〜1 に直す（ゆっくり歩きから使えるように）
      const k = (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / mag;
      this.x = (dx / radius) * k;
      this.y = (-dy / radius) * k;
      this.run = mag >= RUN_THRESHOLD;
    }
    this.base.classList.toggle('run', this.run);
  }

  // ジャンプが押されていたら true を返し、押された記録を消す（1回の押下で1回だけ跳ぶ）
  takeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  bindJump() {
    const ids = new Set();
    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ids.add(e.pointerId);
      this.jumpBtn.setPointerCapture(e.pointerId);
      this.jumpQueued = true;
      this.jumpBtn.classList.add('pressed');
      navigator.vibrate?.(8);
    });
    const end = (e) => { ids.delete(e.pointerId); if (ids.size === 0) this.jumpBtn.classList.remove('pressed'); };
    this.jumpBtn.addEventListener('pointerup', end);
    this.jumpBtn.addEventListener('pointercancel', end);
    this.jumpBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
