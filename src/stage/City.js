import * as THREE from 'three';

// ===== 縮尺 =====
// キャラ（scale 0.15）の身長は約 0.74 ワールド単位。これを身長 1.75m とみなすと、1 単位 ≒ 2.365m。
// 建物・道路・看板などの実寸（メートル）は、すべて m() で単位に直して使う。
export const M = 1 / 2.365;
export const m = (v) => v * M;
const FH = m(3.6);        // 1 階分の高さ（3.6m）
const TILE_W = m(12.8);   // 窓テクスチャ 1 枚 = 横 4 スパン（3.2m ×4）
const TILE_H = m(10.8);   //                     縦 3 階
const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif';

// ---------- 材質・テクスチャ ----------
const matCache = new Map();
function std(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }));
  return matCache.get(k);
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 外壁の窓テクスチャ（4 スパン × 3 階）。乱数に依存させない（毎回同じ見た目）
const FACADES = {
  glass:    { wall: '#2f3e50', win: ['#6fa8dc', '#4f86b8', '#8fc1e8', '#3f6f9e'], mx: 6,  my: 8,  frame: '#1d2733' },
  dark:     { wall: '#1c232c', win: ['#35506b', '#2b445c', '#456482', '#223a50'], mx: 6,  my: 8,  frame: '#10151b' },
  concrete: { wall: '#d6cfc0', win: ['#4d6c8c', '#5d7d9d', '#415d7a'], mx: 30, my: 34, frame: '#f2eee4' },
  brick:    { wall: '#9a5a44', win: ['#2b3846', '#34445a'], mx: 32, my: 36, frame: '#e9e2d4' },
  white:    { wall: '#efede7', win: ['#3d5873', '#4a6684', '#355068'], mx: 26, my: 30, frame: '#9aa0a6', balcony: true },
};
const facadeCache = {};
function facadeMat(variant) {
  if (facadeCache[variant]) return facadeCache[variant];
  const f = FACADES[variant];
  const bays = 4, floors = 3, cw = 128, ch = 144;
  const c = canvas(bays * cw, floors * ch), g = c.getContext('2d');
  g.fillStyle = f.wall; g.fillRect(0, 0, c.width, c.height);
  let seed = 7 + variant.length * 13;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let j = 0; j < floors; j++) for (let i = 0; i < bays; i++) {
    const x = i * cw + f.mx, y = j * ch + f.my, w = cw - 2 * f.mx, h = ch - 2 * f.my;
    g.fillStyle = f.frame; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    const col = f.win[Math.floor(rnd() * f.win.length)];
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, col); grd.addColorStop(1, '#1b2a3a');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.62, y); g.lineTo(x + w * 0.17, y + h); g.fill(); // 空の映り込み
    if (f.balcony) { g.fillStyle = '#c9ced3'; g.fillRect(x - 8, y + h - 10, w + 16, 12); }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let j = 0; j < floors; j++) g.fillRect(0, (j + 1) * ch - 3, c.width, 3); // 床スラブの線
  const mat = new THREE.MeshStandardMaterial({ map: toTex(c, true), roughness: variant === 'glass' || variant === 'dark' ? 0.3 : 0.85, metalness: variant === 'glass' ? 0.2 : 0 });
  return (facadeCache[variant] = mat);
}

// 看板の文字テクスチャ
function signTex(text, { bg = '#d32f2f', fg = '#fff', w = 512, h = 128, vertical = false, border = true } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = fg; g.lineWidth = Math.max(4, Math.min(w, h) * 0.05); g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) {
    const chars = [...text], step = h / (chars.length + 0.6);
    g.font = `900 ${Math.min(w * 0.7, step * 0.9)}px ${FONT}`;
    chars.forEach((ch, i) => g.fillText(ch, w / 2, step * (i + 0.8)));
  } else {
    let size = h * 0.62; g.font = `900 ${size}px ${FONT}`;
    while (g.measureText(text).width > w * 0.88 && size > 10) { size -= 4; g.font = `900 ${size}px ${FONT}`; }
    g.fillText(text, w / 2, h / 2 + 2);
  }
  return toTex(c);
}
const SIGNS = [
  ['ラーメン', '#c62828', '#fff59d'], ['HOTEL', '#1a237e', '#ffd54f'], ['CAFE', '#4e342e', '#ffe0b2'], ['BANK', '#004d40', '#e0f2f1'],
  ['PIZZA', '#e65100', '#fff'], ['24H MART', '#0d47a1', '#fff'], ['カラオケ', '#6a1b9a', '#ffeb3b'], ['BOOKS', '#2e7d32', '#f1f8e9'],
  ['DRUG', '#00838f', '#fff'], ['SUSHI', '#212121', '#ff8a80'], ['GYM', '#37474f', '#ffee58'], ['ゲーム', '#ad1457', '#fff'],
];
const ADS = [
  ['BLOCK FIGHTER', '#1a237e', '#ffd54f'], ['NEW!  SALE', '#b71c1c', '#fff'], ['COLA  COLD', '#c62828', '#fff'], ['TRAVEL', '#006064', '#fff59d'], ['MOBILE 5G', '#311b92', '#b9f6ca'],
];

// ---------- 小さな作図の道具 ----------
function mesh(geo, mat, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = receive;
  return o;
}
// 底面が y（基準）に乗る箱
function box(parent, w, h, d, mat, x, y, z, opt) {
  const o = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, opt);
  parent.add(o); return o;
}
function cyl(parent, rt, rb, h, mat, x, y, z, seg = 16, opt) {
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z, opt);
  parent.add(o); return o;
}
// 窓の模様が階の高さにそろうようにした箱（yBase = 地面からこの箱の底面までの高さ）
function facadeBox(parent, w, h, d, variant, x, yBase, z, topColor = 0x6b6e73) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) continue;
    const u = Math.abs(n.getZ(i)) > 0.5 ? (p.getX(i) + w / 2) / TILE_W : (p.getZ(i) + d / 2) / TILE_W;
    uv.setXY(i, u, (p.getY(i) + h / 2 + yBase) / TILE_H);
  }
  const side = facadeMat(variant), top = std(topColor);
  const o = mesh(g, [side, side, top, top, side, side], x, yBase + h / 2, z);
  parent.add(o); return o;
}
function facadeCylinder(parent, r, h, variant, x, yBase, z) {
  const g = new THREE.CylinderGeometry(r, r, h, 32, 1, false);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const circ = 2 * Math.PI * r;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) continue;
    uv.setXY(i, Math.round(circ / TILE_W) * uv.getX(i), (p.getY(i) + h / 2 + yBase) / TILE_H);
  }
  const side = facadeMat(variant), top = std(0x6b6e73);
  const o = mesh(g, [side, top, top], x, yBase + h / 2, z);
  parent.add(o); return o;
}

const FRONT_ANGLE = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 };

// ---------- 街の本体 ----------
export function createCity({ rand }) {
  const group = new THREE.Group();
  group.name = 'City';
  const colliders = []; // 建物の足跡（XZ の範囲と高さ）
  const trees = [];     // 木の位置（最後にまとめて 1 つの InstancedMesh にする）
  const r = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const ROAD_C = 17.5, RW = 6;                   // 道路の中心線の位置と幅（14m ほど。片側 1 車線 + 駐車帯）
  const EDGE = 50;                               // 街区の外側の端
  const BLK = [[-EDGE, -ROAD_C - RW / 2], [-ROAD_C + RW / 2, ROAD_C - RW / 2], [ROAD_C + RW / 2, EDGE]]; // 3 つの街区の x（z も同じ）
  const SW = 1.5;                                // 歩道の幅（3.5m）

  function addCollider(cx, cz, w, d, h) { colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height: h }); }

  // --- 街区（歩道の台）---
  const slabMat = std(0xb8b5ad, { roughness: 0.95 });
  function slab(x0, x1, z0, z1, mat = slabMat, y = 0, h = 0.07) {
    box(group, x1 - x0, h, z1 - z0, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, { cast: false });
  }
  for (const [ax0, ax1] of BLK) for (const [az0, az1] of BLK) slab(ax0, ax1, az0, az1);

  // --- 道路の白線・横断歩道・停止線 ---
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const yel = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const centers = [-ROAD_C, ROAD_C];
  const mk = new THREE.Matrix4();
  { // 中央線（点線）と、横断歩道のしま
    const dashes = [], stripes = [];
    for (const c of centers) for (let t = -EDGE; t < EDGE; t += 3.2) {
      if (centers.some((k) => Math.abs(t + 0.6 - k) < 5.2)) continue; // 交差点の中は引かない
      dashes.push([c, t + 0.6, 0], [t + 0.6, c, 1]);
    }
    for (const cx of centers) for (const cz of centers) {
      for (const sgn of [-1, 1]) {
        for (let k = -2.5; k <= 2.5; k += 1) { // x 方向の道の入口の横断歩道（道を横切る）
          stripes.push([cx + sgn * 4.2, cz + k, 0]);
          stripes.push([cx + k, cz + sgn * 4.2, 1]);
        }
      }
    }
    const dashGeo = new THREE.BoxGeometry(1.3, 0.01, 0.07);
    const dm = new THREE.InstancedMesh(dashGeo, yel, dashes.length);
    dashes.forEach(([x, z, rot], i) => { mk.makeRotationY(rot ? Math.PI / 2 : 0).setPosition(x, 0.011, z); dm.setMatrixAt(i, mk); });
    dm.receiveShadow = true; group.add(dm);
    const stripeGeo = new THREE.BoxGeometry(1.5, 0.01, 0.4);
    const sm = new THREE.InstancedMesh(stripeGeo, paint, stripes.length);
    stripes.forEach(([x, z, rot], i) => { mk.makeRotationY(rot ? Math.PI / 2 : 0).setPosition(x, 0.011, z); sm.setMatrixAt(i, mk); });
    sm.receiveShadow = true; group.add(sm);
  }

  // =============== 建物 ===============
  // opt: { x, z, w, d, floors, variant, front: '+z'|'-z'|'+x'|'-x', sign, blade, billboard, shop }
  function building(o) {
    const g = new THREE.Group();
    const H = o.floors * FH;
    facadeBox(g, o.w, H, o.d, o.variant, 0, 0, 0);
    // 屋上の縁と設備
    box(g, o.w + 0.1, m(1.0), o.d + 0.1, std(0x8d9096), 0, H, 0, { cast: false });
    const roofY = H + m(1.0);
    for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) box(g, r(0.5, 1.2), r(0.3, 0.7), r(0.5, 1.2), std(0xb0b4b8), r(-o.w * 0.3, o.w * 0.3), roofY, r(-o.d * 0.3, o.d * 0.3));
    if (o.floors >= 6 && rand() < 0.8) { // 給水タンク
      const tx = r(-o.w * 0.25, o.w * 0.25), tz = r(-o.d * 0.25, o.d * 0.25);
      cyl(g, m(1.4), m(1.4), m(2.6), std(0x8a7f70), tx, roofY + m(1.2), tz, 12);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.05, m(1.2), 0.05, std(0x555), tx + dx * m(1), roofY, tz + dz * m(1), { cast: false });
    }
    if (o.floors >= 8) cyl(g, 0.03, 0.05, m(9), std(0xcc3333), o.w * 0.3, roofY, o.d * 0.2, 6, { cast: false }); // アンテナ
    // 1 階: 店のガラス・入口・看板
    if (o.shop !== false) {
      const sf = box(g, o.w + 0.04, FH * 0.95, o.d + 0.04, std(0x24323f, { roughness: 0.2, metalness: 0.3 }), 0, 0, 0, { cast: false });
      sf.material = std(0x24323f, { roughness: 0.2, metalness: 0.3 });
      const dz = o.d / 2 + 0.03;
      box(g, m(2.2), m(2.5), 0.1, std(0x10161c), r(-o.w * 0.2, o.w * 0.2), 0, dz, { cast: false });  // ドア（2.5m）
      box(g, m(4.2), 0.07, m(1.9), std(0xe0e0e0), 0, FH * 0.8, dz + m(0.9)); // ひさし
      const [txt, bg, fg] = o.sign ?? pick(SIGNS);
      const sw = Math.min(o.w * 0.8, m(12)), sh = m(1.4);
      const s = mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: signTex(txt, { bg, fg, w: 512, h: Math.round(512 * sh / sw) }) }), 0, FH * 1.0 + sh / 2 + 0.02, o.d / 2 + 0.05, { receive: false });
      g.add(s);
    }
    // 袖看板（壁から突き出た縦看板）
    if (o.blade) {
      const [txt, bg, fg] = pick(SIGNS);
      const bw = m(1.4), bh = m(5.5);
      const tex = signTex(txt.slice(0, 5), { bg, fg, w: 128, h: 512, vertical: true });
      const bm = [new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex }), std(0x333), std(0x333), std(0x333), std(0x333)];
      const bx = o.w / 2 - m(1.5);
      g.add(mesh(new THREE.BoxGeometry(0.12, bh, bw), bm, bx, FH * 1.5 + bh / 2, o.d / 2 + bw / 2, { receive: false }));
    }
    // 屋上看板（広告）
    if (o.billboard) {
      const [txt, bg, fg] = pick(ADS);
      const pw = Math.min(o.w * 0.85, m(14)), ph = m(5.5);
      const tex = signTex(txt, { bg, fg, w: 1024, h: Math.round(1024 * ph / pw) });
      const faces = [std(0x444), std(0x444), std(0x444), std(0x444), new THREE.MeshBasicMaterial({ map: tex }), std(0x555)];
      const by = roofY + m(2.5);
      g.add(mesh(new THREE.BoxGeometry(pw, ph, 0.15), faces, 0, by + ph / 2, o.d / 2 - m(1.2)));
      for (const sx of [-0.4, 0, 0.4]) box(g, 0.08, m(2.6), 0.08, std(0x555), sx * pw, roofY, o.d / 2 - m(1.2));
    }
    g.rotation.y = FRONT_ANGLE[o.front ?? '+z'];
    g.position.set(o.x, 0.07, o.z);
    group.add(g);
    const sw = Math.abs(Math.sin(g.rotation.y)) > 0.5;
    addCollider(o.x, o.z, sw ? o.d : o.w, sw ? o.w : o.d, H);
    return g;
  }

  // 超高層: 低層の基壇 + 段のついた塔 + 先端のアンテナ
  function skyscraper(o) {
    const g = new THREE.Group();
    const pw = o.w * 1.15, pd = o.d * 1.15, podF = 3;
    facadeBox(g, pw, podF * FH, pd, 'concrete', 0, 0, 0);
    const tiers = [[1, o.floors], [0.78, Math.round(o.floors * 0.35)], [0.55, Math.round(o.floors * 0.2)]];
    let y = podF * FH, total = 0;
    tiers.forEach(([k, f], i) => {
      const h = (i === 0 ? f : f) * FH;
      facadeBox(g, o.w * k, h, o.d * k, o.variant, 0, y, 0);
      y += h; total = y;
      box(g, o.w * k + 0.1, m(0.8), o.d * k + 0.1, std(0x30343a), 0, y, 0, { cast: false });
      y += m(0.8);
    });
    cyl(g, 0.04, 0.12, m(22), std(0xd0d4d8), 0, y, 0, 8); // 尖塔
    cyl(g, 0.03, 0.03, m(4), std(0xe53935), 0, y + m(22), 0, 6, { cast: false });
    // 基壇の看板と入口
    const [txt, bg, fg] = o.sign ?? pick(SIGNS);
    const sw = pw * 0.7, sh = m(1.6);
    g.add(mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: signTex(txt, { bg, fg, w: 512, h: Math.round(512 * sh / sw) }) }), 0, FH * 2.55, pd / 2 + 0.03, { receive: false }));
    box(g, m(5), m(3.4), 0.1, std(0x10161c), 0, 0, pd / 2 + 0.03, { cast: false });
    box(g, m(7), 0.08, m(2.2), std(0xdadada), 0, m(3.7), pd / 2 + m(1.1));
    g.rotation.y = FRONT_ANGLE[o.front ?? '+z'];
    g.position.set(o.x, 0.07, o.z);
    group.add(g);
    const swp = Math.abs(Math.sin(g.rotation.y)) > 0.5;
    addCollider(o.x, o.z, swp ? pd : pw, swp ? pw : pd, total);
    return g;
  }

  function roundTower(o) {
    const g = new THREE.Group();
    facadeCylinder(g, o.r, o.floors * FH, o.variant, 0, 0, 0);
    cyl(g, o.r + 0.12, o.r + 0.12, m(1), std(0x30343a), 0, o.floors * FH, 0, 32, { cast: false });
    const top = o.floors * FH + m(1);
    cyl(g, o.r * 0.55, o.r * 0.55, m(5), std(0x9aa3ab), 0, top, 0, 24); // 屋上の塔屋
    cyl(g, 0.04, 0.08, m(15), std(0xd0d4d8), 0, top + m(5), 0, 8);
    // 低層の円形基壇 + 入口
    cyl(g, o.r * 1.25, o.r * 1.25, FH * 1.2, std(0xd6cfc0), 0, 0, 0, 32);
    for (let i = 0; i < 3; i++) { // 大きな看板（巻き付け）
      const [txt, bg, fg] = SIGNS[(i * 4) % SIGNS.length];
      const sg = new THREE.Mesh(new THREE.CylinderGeometry(o.r + 0.2, o.r + 0.2, m(2.2), 16, 1, true, i * 2.1 + 0.3, 1.4),
        new THREE.MeshBasicMaterial({ map: signTex(txt, { bg, fg, w: 512, h: 128 }), side: THREE.DoubleSide }));
      sg.position.y = o.floors * FH * (0.35 + i * 0.25); g.add(sg);
    }
    g.position.set(o.x, 0.07, o.z);
    group.add(g);
    addCollider(o.x, o.z, o.r * 2.5, o.r * 2.5, o.floors * FH);
  }

  // 東京タワー風の鉄塔（高さ 約 150m）
  function lattice(cx, cz, Hm = 150, spreadM = 36) {
    const g = new THREE.Group();
    const Ht = m(Hm), half = m(spreadM / 2);
    const red = std(0xe4471a, { roughness: 0.6 }), white = std(0xf1efe9, { roughness: 0.6 });
    const up = new THREE.Vector3(0, 1, 0);
    function beam(a, b, t, mat) {
      const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
      const o = mesh(new THREE.BoxGeometry(t, len, t), mat, 0, 0, 0);
      o.position.copy(a).addScaledVector(dir, 0.5);
      o.quaternion.setFromUnitVectors(up, dir.normalize());
      g.add(o);
    }
    const fr = [0, 0.18, 0.34, 0.5, 0.68, 0.82];
    const sp = (f) => 0.55 + (half - 0.55) * Math.pow(1 - f / 0.9, 1.6);
    for (let i = 0; i < fr.length - 1; i++) {
      const mat = i % 2 ? white : red;
      const s0 = sp(fr[i]), s1 = sp(fr[i + 1]), y0 = fr[i] * Ht, y1 = fr[i + 1] * Ht;
      const c = (s, y, sx, sz) => new THREE.Vector3(sx * s, y, sz * s);
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beam(c(s0, y0, sx, sz), c(s1, y1, sx, sz), 0.2, mat);
      const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4];
        beam(c(s1, y1, ax, az), c(s1, y1, bx, bz), k % 2 ? 0.09 : 0.1, mat); // 太さを変え、角で重なる面が同じ高さにならないようにする
        beam(c(s0, y0, ax, az), c(s1, y1, bx, bz), 0.06, mat); // X 字の補強
        beam(c(s0, y0, bx, bz), c(s1, y1, ax, az), 0.06, mat);
      }
    }
    for (const [f, hm] of [[0.34, 5], [0.7, 4]]) { // 展望台
      const s = sp(f);
      box(g, s * 2 + 1.0, m(hm), s * 2 + 1.0, red, 0, f * Ht - m(hm) / 2, 0);
      box(g, s * 2 + 1.4, 0.1, s * 2 + 1.4, white, 0, f * Ht + m(hm) / 2 - 0.08, 0); // 上面を 0.02 高くして、赤い箱の天面と重ならないように
    }
    cyl(g, 0.05, 0.3, Ht * 0.18, white, 0, Ht * 0.82, 0, 8);
    cyl(g, 0.02, 0.05, Ht * 0.1, red, 0, Ht * 0.97, 0, 6);
    // 足元の広場と、入口
    g.position.set(cx, 0.07, cz);
    group.add(g);
    addCollider(cx, cz, half * 2 + 0.6, half * 2 + 0.6, Ht);
  }

  // =============== 戸建て ===============
  const WALLS = [0xf3efe6, 0xe7d9bd, 0xcfe0d6, 0xdcc8b8, 0xe9e2f0, 0xf1e0c5];
  const ROOFS = [0x8e3b32, 0x3f4a5a, 0x5b4636, 0x2f6f5a, 0x6a3b6e];
  let winMat = null;
  function houseWindowMat() {
    if (winMat) return winMat;
    const c = canvas(64, 80), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 80);
    const grd = g.createLinearGradient(0, 6, 0, 74); grd.addColorStop(0, '#9cc7ea'); grd.addColorStop(1, '#456a8e');
    g.fillStyle = grd; g.fillRect(6, 6, 52, 68);
    g.fillStyle = '#ffffff'; g.fillRect(30, 6, 4, 68); g.fillRect(6, 38, 52, 4);
    winMat = new THREE.MeshStandardMaterial({ map: toTex(c), roughness: 0.3 });
    return winMat;
  }
  function house(x, z, front) {
    const g = new THREE.Group();
    const w = m(11), d = m(8.5), floors = rand() < 0.65 ? 2 : 1, h = floors * m(2.9);
    const wall = pick(WALLS), roofC = pick(ROOFS), garage = rand() < 0.5;
    box(g, w, h, d, std(wall), 0, 0, 0);
    box(g, w + 0.04, m(0.35), d + 0.04, std(0x7a7a78), 0, 0, 0, { cast: false }); // 基礎
    // 切妻屋根（棟は横方向）
    const rh = m(2.8), over = m(0.5);
    const sh = new THREE.Shape(); sh.moveTo(-d / 2 - over, 0); sh.lineTo(d / 2 + over, 0); sh.lineTo(0, rh); sh.closePath();
    const rg = new THREE.ExtrudeGeometry(sh, { depth: w + over * 2, bevelEnabled: false });
    rg.translate(0, 0, -(w + over * 2) / 2);
    const roof = mesh(rg, std(roofC, { roughness: 0.7 }), 0, h, 0); roof.rotation.y = Math.PI / 2; g.add(roof);
    box(g, m(0.9), m(1.6), m(0.9), std(0x8a6a5a), r(-w * 0.3, w * 0.3), h + rh * 0.35, -d * 0.1, { cast: true }); // 煙突
    // 窓とドア
    const wm = houseWindowMat(), ww = m(1.4), wh = m(1.6);
    const place = (px, py, pz, ry) => { const p = mesh(new THREE.PlaneGeometry(ww, wh), wm, px, py + wh / 2, pz, { cast: false }); p.rotation.y = ry; g.add(p); };
    for (let f = 0; f < floors; f++) {
      const py = f * m(2.9) + m(0.9);
      for (const sx of [-0.3, 0.3]) if (!(f === 0 && sx > 0)) place(sx * w, py, d / 2 + 0.02, 0);
      place(0, py, -d / 2 - 0.02, Math.PI);
      place(w / 2 + 0.02, py, 0, Math.PI / 2);
      if (!garage) place(-w / 2 - 0.02, py, 0, -Math.PI / 2); // ガレージを付けた側の壁には窓を付けない（埋まって見えなくなる）
    }
    box(g, m(1.0), m(2.05), 0.06, std(0x5a3b2a), w * 0.3, 0, d / 2 + 0.03, { cast: false }); // ドア 2.05m
    box(g, m(1.8), m(0.2), m(1.0), std(0x9a9a98), w * 0.3, 0, d / 2 + m(0.5)); // 玄関ポーチ
    if (garage) { // ガレージ
      const gw = m(3.2);
      box(g, gw, m(2.5), d * 0.9, std(wall), -w / 2 - gw / 2, 0, 0);
      box(g, gw + 0.1, 0.08, d * 0.9 + 0.1, std(roofC), -w / 2 - gw / 2, m(2.5), 0);
      box(g, gw * 0.8, m(2.1), 0.06, std(0xcfd2d6), -w / 2 - gw / 2, 0, d * 0.45 + 0.03, { cast: false });
    }
    g.rotation.y = FRONT_ANGLE[front];
    g.position.set(x, 0.1, z);
    group.add(g);
    const swp = Math.abs(Math.sin(g.rotation.y)) > 0.5;
    addCollider(x, z, swp ? d : w, swp ? w : d, h + rh);
  }

  // 住宅地の街区（上下 2 列の家 + 中央の遊歩道）
  function residential(bx0, bx1, bz0, bz1) {
    slab(bx0 + SW, bx1 - SW, bz0 + SW, bz1 - SW, std(0x6fae52, { roughness: 1 }), 0.07, 0.03);
    const ix0 = bx0 + SW, ix1 = bx1 - SW, iz0 = bz0 + SW, iz1 = bz1 - SW;
    const n = 4, lotW = (ix1 - ix0) / n, lotD = 9.5;
    for (const row of [0, 1]) {
      const front = row === 0 ? '-z' : '+z';
      for (let i = 0; i < n; i++) {
        const lx = ix0 + lotW * (i + 0.5);
        const hz = row === 0 ? iz0 + 2.6 + m(8.5) / 2 : iz1 - 2.6 - m(8.5) / 2;
        house(lx, hz, front);
        // 前庭の低い塀（門のすき間つき）
        const fz = row === 0 ? iz0 + 0.3 : iz1 - 0.3, wallMat = std(0xe8e4da);
        box(group, lotW * 0.62, m(1.0), 0.08, wallMat, lx - lotW * 0.19, 0.1, fz, { cast: false });
        box(group, lotW * 0.18, m(1.0), 0.08, wallMat, lx + lotW * 0.4, 0.1, fz, { cast: false });
        // 玄関までの小道
        box(group, 0.4, 0.02, 2.4, std(0xc9c3b5), lx + (front === '+z' ? -1 : 1) * 0, 0.1, row === 0 ? iz0 + 1.5 : iz1 - 1.5, { cast: false });
        if (rand() < 0.6) trees.push({ x: lx + lotW * 0.32, z: row === 0 ? iz0 + 1.6 : iz1 - 1.6, s: r(0.6, 0.9) });
        if (rand() < 0.4) trees.push({ x: lx - lotW * 0.4, z: row === 0 ? iz1 - lotD * 2 + 7 : iz0 + lotD * 2 - 7, s: r(0.7, 1.0) });
      }
    }
    // 中央の遊歩道（アスファルト）と木々
    const midZ = (iz0 + iz1) / 2;
    slab(ix0, ix1, midZ - 1.2, midZ + 1.2, std(0x6a6c70), 0.1, 0.02);
    for (let i = 0; i < 8; i++) trees.push({ x: ix0 + (i + 0.5) * (ix1 - ix0) / 8, z: midZ + (i % 2 ? -1 : 1) * 2.4, s: r(0.8, 1.1) });
  }

  // =============== 公園（中央の街区）===============
  function park() {
    const [x0, x1] = BLK[1], [z0, z1] = BLK[1];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0x4fa83d, { roughness: 1 }), 0.07, 0.03);
    const pathMat = std(0xd9cfb4, { roughness: 1 });
    slab(-1.3, 1.3, z0 + SW, z1 - SW, pathMat, 0.1, 0.02);   // 十字の園路
    slab(x0 + SW, x1 - SW, -1.3, 1.3, pathMat, 0.1, 0.025); // 縦の園路より 0.005 高くして、交差部分の面が同じ高さにならないようにする
    // 中央の広場（戦いの舞台）: 舗装の円と模様
    const plaza = mesh(new THREE.CylinderGeometry(7, 7, 0.04, 48), std(0xcdbfa0, { roughness: 1 }), 0, 0.12, 0, { cast: false });
    group.add(plaza);
    group.add(mesh(new THREE.TorusGeometry(5.4, 0.12, 6, 64).rotateX(Math.PI / 2).scale(1, 0.25, 1), std(0x8a7a5c), 0, 0.14, 0, { cast: false }));
    group.add(mesh(new THREE.TorusGeometry(3.0, 0.1, 6, 64).rotateX(Math.PI / 2).scale(1, 0.25, 1), std(0x8a7a5c), 0, 0.14, 0, { cast: false }));
    // 噴水（北西の隅）
    const fx = -8.5, fz = -8.5;
    cyl(group, m(4.5), m(4.5), m(0.7), std(0xbdb6a6), fx, 0.1, fz, 32);
    cyl(group, m(4.0), m(4.0), 0.02, std(0x4aa8e8, { roughness: 0.15, metalness: 0.1 }), fx, 0.1 + m(0.6), fz, 32, { cast: false });
    cyl(group, m(0.5), m(0.7), m(1.8), std(0xbdb6a6), fx, 0.1, fz, 12);
    cyl(group, m(0.1), m(0.5), m(1.2), std(0xd8f0ff, { transparent: true, opacity: 0.7 }), fx, 0.1 + m(1.8), fz, 10, { cast: false });
    addCollider(fx, fz, m(9), m(9), m(2.5));
    // ベンチ（広場のまわり）
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, bx = Math.cos(a) * 8, bz = Math.sin(a) * 8;
      const bench = new THREE.Group();
      box(bench, m(1.8), m(0.08), m(0.5), std(0x8a5a2f), 0, m(0.45), 0);
      box(bench, m(1.7), m(0.45), m(0.06), std(0x8a5a2f), 0, m(0.5), -m(0.25));
      for (const sx of [-0.4, 0.4]) box(bench, m(0.08), m(0.45), m(0.45), std(0x333333), m(1.8) * sx, 0, 0, { cast: false });
      bench.position.set(bx, 0.1, bz); bench.rotation.y = -a + Math.PI / 2; group.add(bench);
    }
    // 遊具: ブランコと滑り台（南東の隅）
    const px = 8.5, pz = 8.5, steel = std(0xd84a3a);
    const sw = new THREE.Group();
    for (const sx of [-1, 1]) { // A 字の脚
      for (const sz of [-1, 1]) {
        const leg = cyl(sw, 0.04, 0.04, m(2.7), steel, sx * m(2.2), 0, sz * m(0.9), 6);
        leg.rotation.x = sz * 0.28; leg.rotation.set(sz * 0.0, 0, 0);
      }
    }
    box(sw, m(4.8), 0.08, 0.08, steel, 0, m(2.6), 0, { cast: false });
    for (const sx of [-0.8, 0.8]) {
      for (const dx of [-0.2, 0.2]) box(sw, 0.02, m(2.1), 0.02, std(0x333), sx * m(1.1) + dx * m(0.4), m(0.5), 0, { cast: false });
      box(sw, m(0.5), 0.04, m(0.25), std(0x222), sx * m(1.1), m(0.5), 0);
    }
    sw.position.set(px - 3, 0.1, pz); group.add(sw);
    const sl = new THREE.Group();
    box(sl, m(1.2), m(0.1), m(1.2), std(0x3a78c9), 0, m(2.0), 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sl, 0.04, m(2.0), 0.04, steel, sx * m(0.55), 0, sz * m(0.55), { cast: false });
    const ramp = box(sl, m(0.9), 0.05, m(3.0), std(0xf0c030), 0, 0, 0); ramp.position.set(0, m(1.0) + 0.02, m(2.1)); ramp.rotation.x = -0.55;
    sl.position.set(px + 2.5, 0.1, pz - 1.5); group.add(sl);
    box(group, m(3), m(0.3), m(3), std(0xe8d28a), px + 2.5, 0.1, pz + 3.5, { cast: false }); // 砂場
    addCollider(px - 3, pz, m(5), m(2), m(2.7)); addCollider(px + 2.5, pz - 1.5 + 1, m(1.4), m(4.5), m(2.2));
    // 木
    const spots = [[-11, -3], [-11, 4], [11, -5], [11, 5], [-4, -11], [5, -11], [-5, 11], [3, 12], [12, -10], [-12, 11], [11, 11], [-12, -12]];
    spots.forEach(([x, z]) => trees.push({ x, z, s: r(0.9, 1.3) }));
    // 公園の入口の標識
    const [txt, bg, fg] = ['PARK  公園', '#1b5e20', '#fff'];
    const pm = new THREE.MeshBasicMaterial({ map: signTex(txt, { bg, fg, w: 512, h: 160 }), side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const s = new THREE.Group();
      for (const sx of [-1, 1]) box(s, 0.06, m(2.6), 0.06, std(0x666), sx * m(1.3), 0, 0, { cast: false });
      s.add(mesh(new THREE.PlaneGeometry(m(3.2), m(1.0)), pm, 0, m(2.1), 0.04, { cast: false }));
      s.position.set(0, 0.1, side * (z1 - SW - 0.6)); s.rotation.y = side > 0 ? 0 : Math.PI;
      group.add(s);
    }
  }

  // =============== 各街区に建物を置く ===============
  residential(BLK[0][0], BLK[0][1], BLK[0][0], BLK[0][1]);   // 北西: 住宅地
  residential(BLK[2][0], BLK[2][1], BLK[2][0], BLK[2][1]);   // 南東: 住宅地
  park();

  { // 北: 超高層ビル群（南の公園に正面を向ける）
    const [x0, x1] = BLK[1], [z0, z1] = BLK[0];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0xcfcabd), 0.07, 0.02);
    skyscraper({ x: -6.5, z: -30, w: 10.5, d: 10.5, floors: 24, variant: 'glass', front: '+z', sign: ['BANK', '#004d40', '#e0f2f1'] });
    skyscraper({ x: 7, z: -31, w: 9.5, d: 9.5, floors: 36, variant: 'dark', front: '+z', sign: ['24H MART', '#0d47a1', '#fff'] });
    skyscraper({ x: 0, z: -44, w: 12, d: 7, floors: 16, variant: 'glass', front: '+z', sign: ['HOTEL', '#1a237e', '#ffd54f'] });
    for (const t of [[-12, -22.5], [12, -22.5], [-12, -48], [12, -48]]) trees.push({ x: t[0], z: t[1], s: 0.9 });
  }
  { // 南: 高層・ホテル・商店
    const [x0, x1] = BLK[1], [z0, z1] = BLK[2];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0xcfcabd), 0.07, 0.02);
    skyscraper({ x: -6.5, z: 31, w: 10.5, d: 10.5, floors: 30, variant: 'glass', front: '-z', sign: ['BOOKS', '#2e7d32', '#f1f8e9'] });
    building({ x: 7, z: 30, w: 10, d: 9, floors: 14, variant: 'white', front: '-z', sign: ['HOTEL', '#7b1fa2', '#ffecb3'], blade: true, billboard: true });
    building({ x: -8.8, z: 45, w: 8, d: 6, floors: 4, variant: 'brick', front: '-z', blade: true });
    building({ x: 0, z: 45, w: 8, d: 6, floors: 3, variant: 'concrete', front: '-z', blade: true });
    building({ x: 8.8, z: 45, w: 8, d: 6, floors: 5, variant: 'white', front: '-z', blade: true });
  }
  { // 西: 中層ビルの並び（東の大通りに正面）
    const [x0, x1] = BLK[0], [z0, z1] = BLK[1];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0xcfcabd), 0.07, 0.02);
    building({ x: -36, z: -9.1, w: 8.2, d: 24, floors: 8, variant: 'concrete', front: '+x', blade: true, billboard: true });
    building({ x: -36, z: 0.2, w: 9, d: 24, floors: 10, variant: 'brick', front: '+x', blade: true });
    building({ x: -36, z: 9.5, w: 8.2, d: 24, floors: 6, variant: 'white', front: '+x', blade: true });
  }
  { // 北東: 鉄塔の広場
    const [x0, x1] = BLK[2], [z0, z1] = BLK[0];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0xd9d4c6), 0.07, 0.02);
    lattice(36, -34, 150, 36);
    building({ x: 28, z: -47, w: 10, d: 6, floors: 2, variant: 'white', front: '+z', sign: ['CAFE', '#4e342e', '#ffe0b2'] });
    building({ x: 44, z: -47, w: 8, d: 6, floors: 2, variant: 'brick', front: '+z', sign: ['SUSHI', '#212121', '#ff8a80'] });
    for (const t of [[26, -24], [46, -24], [24, -34], [48, -34]]) trees.push({ x: t[0], z: t[1], s: 1 });
  }
  { // 東: 円筒の塔と中層ビル
    const [x0, x1] = BLK[2], [z0, z1] = BLK[1];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0xcfcabd), 0.07, 0.02);
    roundTower({ x: 38, z: -6, r: 5.5, floors: 22, variant: 'glass' });
    building({ x: 36, z: 8, w: 11, d: 14, floors: 9, variant: 'dark', front: '-x', blade: true, billboard: true, sign: ['ゲーム', '#ad1457', '#fff'] });
  }
  { // 南西: 百貨店と駐車場
    const [x0, x1] = BLK[0], [z0, z1] = BLK[2];
    slab(x0 + SW, x1 - SW, z0 + SW, z1 - SW, std(0xcfcabd), 0.07, 0.02);
    building({ x: -34, z: 27, w: 24, d: 11, floors: 6, variant: 'concrete', front: '-z', sign: ['DEPARTMENT', '#b71c1c', '#fff'], billboard: true, blade: true });
    slab(-47.5, -22, 34, 48.5, std(0x55575c), 0.09, 0.02);   // 駐車場
    const lineMat = paint;
    for (let i = 0; i < 9; i++) box(group, 0.06, 0.01, m(5), lineMat, -46 + i * 2.9, 0.115, 40.5, { cast: false });
    for (let i = 0; i < 9; i++) box(group, 0.06, 0.01, m(5), lineMat, -46 + i * 2.9, 0.115, 46, { cast: false });
  }

  // =============== 街の備品 ===============
  // --- 街路灯 ---
  const poleMat = std(0x4a4f55, { roughness: 0.6 }), lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4c8 });
  function lamp(x, z, rot) {
    const g = new THREE.Group();
    cyl(g, 0.035, 0.05, m(7.5), poleMat, 0, 0, 0, 8, { receive: false });
    box(g, m(1.8), 0.05, 0.05, poleMat, m(0.8), m(7.4), 0, { cast: false });
    g.add(mesh(new THREE.BoxGeometry(m(0.8), 0.04, m(0.3)), lampMat, m(1.7), m(7.35), 0, { cast: false, receive: false }));
    g.position.set(x, 0.07, z); g.rotation.y = rot; group.add(g);
  }
  for (const [ax0, ax1] of BLK) for (const [az0, az1] of BLK) {
    for (let t = ax0 + 6; t < ax1 - 3; t += 12) { lamp(t, az0 + 0.7, 0); lamp(t + 6, az1 - 0.7, Math.PI); }
    for (let t = az0 + 6; t < az1 - 3; t += 12) { lamp(ax0 + 0.7, t, Math.PI / 2); lamp(ax1 - 0.7, t + 6, -Math.PI / 2); }
  }

  // --- 信号機 ---
  function signal(x, z, face) {
    const g = new THREE.Group();
    cyl(g, 0.04, 0.05, m(5.2), poleMat, 0, 0, 0, 8, { receive: false });
    box(g, m(3.4), 0.05, 0.05, poleMat, m(1.6), m(5.0), 0, { cast: false }); // 腕
    for (const [dx, c] of [[m(1.8), 0xff3b2f], [m(2.0), 0xffc107], [m(2.2), 0x2ecc71]]) g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: c }), dx, m(4.85), 0.0, { cast: false, receive: false }));
    box(g, m(0.95), m(0.4), m(0.3), std(0x222), m(2.0), m(4.65), 0, { cast: false });
    g.position.set(x, 0.07, z); g.rotation.y = face; group.add(g);
  }
  for (const cx of centers) for (const cz of centers) {
    const o = RW / 2 + 0.3;
    signal(cx - o, cz - o, 0);                   // 腕が +x（道路の上）へ
    signal(cx + o, cz + o, Math.PI);             // 腕が -x へ
    signal(cx + o, cz - o, Math.PI / 2 + Math.PI); // 腕が +z 方向へ
    signal(cx - o, cz + o, Math.PI / 2);          // 腕が -z 方向へ
  }

  // --- 道路標識・自販機・バス停・ポスト・ゴミ箱・消火栓 ---
  function roadSign(x, z, kind, rot) {
    const g = new THREE.Group();
    cyl(g, 0.025, 0.025, m(2.6), poleMat, 0, 0, 0, 6, { receive: false });
    const geo = kind === 'stop' ? new THREE.CircleGeometry(m(0.4), 3).rotateZ(Math.PI / 2 * 0 + Math.PI / 2 * 1.0 - Math.PI / 2 + Math.PI) : new THREE.CircleGeometry(m(0.4), 20);
    const col = kind === 'stop' ? 0xd32f2f : kind === 'limit' ? 0xffffff : 0x1565c0;
    const face = mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }), 0, m(2.4), 0.03, { cast: false, receive: false });
    g.add(face);
    if (kind === 'limit') g.add(mesh(new THREE.RingGeometry(m(0.3), m(0.4), 20), new THREE.MeshBasicMaterial({ color: 0xd32f2f, side: THREE.DoubleSide }), 0, m(2.4), 0.035, { cast: false, receive: false }));
    g.position.set(x, 0.07, z); g.rotation.y = rot; group.add(g);
  }
  roadSign(-20.9, -9, 'stop', Math.PI / 2); roadSign(20.9, 9, 'limit', -Math.PI / 2);
  roadSign(-9, 20.9, 'limit', 0); roadSign(9, -20.9, 'blue', Math.PI);
  roadSign(-14, -20.9, 'blue', Math.PI); roadSign(14, 20.9, 'stop', 0);

  function vending(x, z, rot, col) {
    const g = new THREE.Group();
    box(g, m(0.9), m(1.8), m(0.75), std(col), 0, 0, 0);
    box(g, m(0.65), m(1.1), 0.02, new THREE.MeshBasicMaterial({ color: 0xcfeaff }), 0, m(0.5), m(0.38), { cast: false });
    g.position.set(x, 0.07, z); g.rotation.y = rot; group.add(g);
  }
  vending(-21.5, 12.2, Math.PI / 2, 0xe53935); vending(-21.5, 13.2, Math.PI / 2, 0x1e88e5);
  vending(21.5, -12, -Math.PI / 2, 0x43a047); vending(13, 21.5, 0, 0xfb8c00);

  function busStop(x, z, rot) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) box(g, 0.05, m(2.5), 0.05, poleMat, sx * m(1.7), 0, 0, { cast: false });
    box(g, m(3.8), 0.06, m(1.3), std(0x2a6ebd), 0, m(2.5), 0);
    box(g, m(3.4), m(1.3), 0.03, new THREE.MeshStandardMaterial({ color: 0xaad4f5, transparent: true, opacity: 0.45 }), 0, m(0.9), -m(0.55), { cast: false });
    box(g, m(1.6), m(0.1), m(0.4), std(0x777), 0, m(0.45), -m(0.3), { cast: false });
    cyl(g, 0.025, 0.025, m(3), poleMat, m(2.4), 0, 0, 6, { receive: false });
    g.add(mesh(new THREE.PlaneGeometry(m(0.8), m(0.8)), new THREE.MeshBasicMaterial({ map: signTex('BUS', { bg: '#1565c0', fg: '#fff', w: 128, h: 128 }), side: THREE.DoubleSide }), m(2.4), m(2.9), 0.04, { cast: false, receive: false })); // 板は柱の手前に出す（柱に埋めない）
    g.position.set(x, 0.07, z); g.rotation.y = rot; group.add(g);
  }
  busStop(-8, 20.9 + 0.5, 0); busStop(8, -20.9 - 0.5, Math.PI);
  { const pb = new THREE.Group(); cyl(pb, m(0.35), m(0.35), m(1.3), std(0xd32f2f), 0, 0, 0, 14); cyl(pb, m(0.38), m(0.38), m(0.12), std(0x222), 0, m(1.3), 0, 14); pb.position.set(21.6, 0.07, 12); group.add(pb); }
  for (const [x, z] of [[-21.5, 4], [21.5, -4], [4, -21.5], [-4, 21.5], [15, 21.6], [-15, -21.6]]) cyl(group, m(0.3), m(0.28), m(0.9), std(0x4b5a50), x, 0.07, z, 10);
  for (const [x, z] of [[-21.4, -4], [21.4, 4], [-4, 21.4], [4, -21.4]]) { cyl(group, m(0.12), m(0.14), m(0.7), std(0xd32f2f), x, 0.07, z, 8); box(group, m(0.5), m(0.08), m(0.1), std(0xd32f2f), x, 0.07 + m(0.45), z, { cast: false }); }

  // =============== 車 ===============
  const CAR_COLORS = [0xd32f2f, 0x1565c0, 0xf5f5f5, 0x212121, 0xfbc02d, 0x2e7d32, 0x9e9e9e, 0xff7043];
  function car(x, z, rot, color) {
    const g = new THREE.Group();
    const L = m(4.4), W = m(1.75), body = std(color, { roughness: 0.35, metalness: 0.3 });
    box(g, L, m(0.7), W, body, 0, m(0.3), 0);
    box(g, L * 0.52, m(0.6), W * 0.92, std(color, { roughness: 0.35, metalness: 0.3 }), -L * 0.04, m(1.0), 0);
    box(g, L * 0.5, m(0.5), W * 0.94, new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.15 }), -L * 0.04, m(1.03), 0, { cast: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = cyl(g, m(0.33), m(0.33), m(0.22), std(0x1a1a1a), sx * L * 0.32, m(0.0), sz * W * 0.46, 12);
      w.rotation.x = Math.PI / 2; w.position.y = m(0.33);
    }
    box(g, 0.02, m(0.2), W * 0.7, new THREE.MeshBasicMaterial({ color: 0xfff4c8 }), L / 2 + 0.005, m(0.5), 0, { cast: false });
    box(g, 0.02, m(0.2), W * 0.7, new THREE.MeshBasicMaterial({ color: 0xff3030 }), -L / 2 - 0.005, m(0.5), 0, { cast: false });
    g.position.set(x, 0.0, z); g.rotation.y = rot; group.add(g);
    const sw = Math.abs(Math.sin(rot)) > 0.5;
    addCollider(x, z, sw ? W : L, sw ? L : W, m(1.5));
  }
  const taken = [];
  function carAt(x, z, rot) {
    if (taken.some(([a, b]) => Math.hypot(a - x, b - z) < 2.6)) return;
    taken.push([x, z]); car(x, z, rot, pick(CAR_COLORS));
  }
  for (const c of centers) for (let t = -EDGE + 4; t < EDGE - 3; t += 3.9) {
    if (centers.some((k) => Math.abs(t - k) < 6.5)) continue;
    const roll = rand();
    if (roll < 0.3) { carAt(c + 1.3, t, Math.PI / 2); }          // 走行中（x 一定の道を +z 向き）
    else if (roll < 0.5) { carAt(c - 1.3, t, -Math.PI / 2); }
    else if (roll < 0.62) { carAt(c + 2.25, t, Math.PI / 2); }  // 路肩に駐車
    if (rand() < 0.3) carAt(t, c + 1.3, 0);                      // 走行中（z 一定の道を +x 向き）
    else if (rand() < 0.3) carAt(t, c - 1.3, Math.PI);
    else if (rand() < 0.2) carAt(t, c - 2.25, Math.PI);
  }
  for (let i = 0; i < 9; i++) for (const zz of [38, 43.5]) if (rand() < 0.6) car(-44.5 + i * 2.9 + 1.4, zz + 0.4, Math.PI / 2, pick(CAR_COLORS));
  { // バス
    const bus = new THREE.Group(), L = m(10.5), W = m(2.5);
    box(bus, L, m(2.8), W, std(0x2e7d32, { roughness: 0.4 }), 0, m(0.4), 0);
    box(bus, L * 0.96, m(0.9), W + 0.01, new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.15 }), 0, m(1.7), 0, { cast: false });
    box(bus, L * 0.98, m(0.35), W + 0.012, std(0xf5f5f5), 0, m(1.2), 0, { cast: false });
    for (const sx of [-0.32, 0.3]) for (const sz of [-1, 1]) { const w = cyl(bus, m(0.5), m(0.5), m(0.3), std(0x1a1a1a), sx * L, 0, sz * W * 0.46, 12); w.rotation.x = Math.PI / 2; w.position.y = m(0.5); }
    bus.position.set(-ROAD_C - 1.3, 0, -32); bus.rotation.y = Math.PI / 2; group.add(bus); // 西の通りを南向きに停車中
    addCollider(-ROAD_C - 1.3, -32, W, L, m(3.2));
  }

  // =============== 木（InstancedMesh）===============
  // 街路樹（歩道沿い）も加える
  for (const [ax0, ax1] of BLK) for (const [az0, az1] of BLK) {
    for (let t = ax0 + 4; t < ax1 - 2; t += 9) { trees.push({ x: t, z: az0 + 1.0, s: 0.7 }); trees.push({ x: t + 4.5, z: az1 - 1.0, s: 0.7 }); }
  }
  const trunkGeo = new THREE.CylinderGeometry(m(0.22), m(0.3), m(3), 6).translate(0, m(1.5), 0);
  const leafGeo = new THREE.IcosahedronGeometry(m(2.4), 1).translate(0, m(4.6), 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, std(0x6b4a2f), trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), trees.length);
  const col = new THREE.Color();
  trees.forEach((t, i) => {
    mk.makeScale(t.s, t.s, t.s).setPosition(t.x, 0.07, t.z);
    trunks.setMatrixAt(i, mk); leaves.setMatrixAt(i, mk);
    leaves.setColorAt(i, col.setHSL(0.27 + rand() * 0.06, 0.5, 0.28 + rand() * 0.12));
  });
  trunks.castShadow = leaves.castShadow = true; leaves.receiveShadow = true;
  group.add(trunks, leaves);

  // =============== 当たり判定・地面の高さ（見えている全ての物体から自動で作る）===============
  // キャラ（身長 0.74）が触れる物は全て塞ぐ。段差 STEP 以下の低い物は乗り越える地面として扱う。
  //   solids  : 立体の当たり判定。箱は向きつき（OBB）、円柱は円
  //   patches : 歩ける地面の高さ（歩道・芝・園路・広場など）
  const solids = [], patches = [];
  const STEP = 0.3, BODY = 0.74;
  group.updateMatrixWorld(true);
  const inst = new THREE.Matrix4(), w4 = new THREE.Matrix4(), tmp = new THREE.Vector3(), sc = new THREE.Vector3(), qq = new THREE.Quaternion(), ps = new THREE.Vector3();
  const eul = new THREE.Euler();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, type = g.type;
    if (type === 'IcosahedronGeometry' || type === 'TorusGeometry' || type === 'PlaneGeometry' || type === 'CircleGeometry' || type === 'RingGeometry' || type === 'ExtrudeGeometry') return; // 枝葉・輪・看板の板・屋根は当たらない（屋根は頭上）
    g.computeBoundingBox();
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++) {
      w4.copy(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(k, inst); w4.multiply(inst); }
      w4.decompose(ps, qq, sc);
      eul.setFromQuaternion(qq, 'YXZ');
      const bb = g.boundingBox, hx = (bb.max.x - bb.min.x) / 2 * sc.x, hy = (bb.max.y - bb.min.y) / 2 * sc.y, hz = (bb.max.z - bb.min.z) / 2 * sc.z;
      tmp.set((bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2, (bb.max.z + bb.min.z) / 2).applyMatrix4(w4);
      const tilted = Math.abs(eul.x) > 0.05 || Math.abs(eul.z) > 0.05;
      const rx = tilted ? Math.abs(Math.cos(eul.y)) * hx + Math.abs(Math.sin(eul.y)) * hz : hx, rz = tilted ? Math.abs(Math.sin(eul.y)) * hx + Math.abs(Math.cos(eul.y)) * hz : hz;
      const top = tmp.y + hy * (tilted ? 1.6 : 1), low = tmp.y - hy * (tilted ? 1.6 : 1);
      if (low >= BODY) continue;                  // 頭より上にある物（看板・ひさし・屋根・街灯の灯り）は通り抜けられる
      if (hx * hz < 1e-5 && type === 'BoxGeometry') continue;
      if (top <= STEP) {                          // 低い物 = 乗り越える地面
        if (top > 0.02) patches.push(type === 'CylinderGeometry' ? { disc: true, x: tmp.x, z: tmp.z, r: hx, top } : { x: tmp.x, z: tmp.z, hx: rx, hz: rz, rot: tilted ? 0 : eul.y, top });
        continue;
      }
      if (type === 'CylinderGeometry') solids.push({ circle: true, x: tmp.x, z: tmp.z, r: Math.max(hx, 0.07), height: top });
      else solids.push({ x: tmp.x, z: tmp.z, hx: Math.max(rx, 0.05), hz: Math.max(rz, 0.05), rot: tilted ? 0 : eul.y, height: top });
    }
  });

  return { group, colliders, solids, patches };
}
