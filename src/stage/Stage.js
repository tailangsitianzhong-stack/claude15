import * as THREE from 'three';
import { STAGE_CONFIG } from './config.js';

// 再現性のある乱数（シードが同じなら同じ壁になる）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 格闘ゲームの土台ステージ。
 * - 草原の床（単色）
 * - 外周を囲う、石ブロックが重なり合った乱雑な壁
 * - 外側はのっぺりした海
 * 返り値の `bounds` は壁の内側（キャラが動ける範囲, XZ）。
 */
export function createStage(options = {}) {
  const cfg = { ...STAGE_CONFIG, ...options, colors: { ...STAGE_CONFIG.colors, ...options.colors } };
  const rand = mulberry32(cfg.seed);
  const r = (min, max) => min + rand() * (max - min);
  const half = cfg.floorSize / 2;

  const group = new THREE.Group();
  group.name = 'Stage';

  // ---------- 草原の床 ----------
  const sideMat = new THREE.MeshStandardMaterial({ color: cfg.colors.dirt, roughness: 0.9 });
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.floorSize, cfg.floorThickness, cfg.floorSize),
    [
      sideMat, sideMat,
      new THREE.MeshStandardMaterial({ color: cfg.colors.grass, roughness: 0.85 }), // 上面
      sideMat, sideMat, sideMat,
    ],
  );
  floor.position.y = -cfg.floorThickness / 2; // 上面を y=0 に
  floor.receiveShadow = true;
  floor.name = 'GrassFloor';
  group.add(floor);

  // ---------- 石ブロックの乱雑な壁 ----------
  // 外周に沿って、大きさ・向き・傾きがバラバラな石ブロックを重ねて積む
  const stones = [];
  const wallMid = half - cfg.wallThickness / 2; // 壁帯の中心線
  const perimeter = 8 * wallMid;
  const S = cfg.stoneScale;
  const step = cfg.stoneStep;
  const wallInner = half - cfg.wallThickness;               // 壁の内側の面がこれより内へ入らないようにする
  const OUTWARD = [[0, -1], [1, 0], [0, 1], [-1, 0]];       // 4辺それぞれの、外向きの向き（x, z）
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const corner = new THREE.Vector3();
  for (let d = 0; d < perimeter; d += step) {
    // 周回距離 d → 四角形の外周上の点 (x, z) と向き
    const sideIdx = Math.floor(d / (2 * wallMid));
    const t = (d % (2 * wallMid)) - wallMid;
    const [x, z, angle] = [
      [t, -wallMid, 0],
      [wallMid, t, Math.PI / 2],
      [-t, wallMid, 0],
      [-wallMid, -t, Math.PI / 2],
    ][sideIdx];

    let y = -0.3 * S; // 少し床にめり込ませる
    while (y < cfg.wallHeight) {
      const sx = r(1.4, 3.2) * S;
      const sy = r(0.9, 2.0) * S;
      const sz = Math.min(r(1.2, 3) * S, cfg.wallThickness);
      const off = r(-0.6, 0.6) * S; // 壁の厚み方向のズレ
      const stone = {
        pos: new THREE.Vector3(
          x + (angle === 0 ? r(-0.4, 0.4) * S : off),
          y + sy / 2,
          z + (angle === 0 ? off : r(-0.4, 0.4) * S),
        ),
        rot: new THREE.Euler(r(-0.2, 0.2), angle + r(-0.35, 0.35), r(-0.2, 0.2)),
        scale: new THREE.Vector3(sx, sy, sz),
      };
      // 傾いた石は、壁の内側（闘技場の中）へ張り出すことがある。内側の面が wallInner より外に来るよう、外へずらす
      // （キャラやカメラが石にめり込まない）。外向きの法線 n に対する、8つの角の一番内側の位置で判定する
      q.setFromEuler(stone.rot);
      m.compose(stone.pos, q, stone.scale);
      let innermost = Infinity;
      for (const cx of [-0.5, 0.5]) for (const cy of [-0.5, 0.5]) for (const cz of [-0.5, 0.5]) {
        corner.set(cx, cy, cz).applyMatrix4(m);
        innermost = Math.min(innermost, corner.x * OUTWARD[sideIdx][0] + corner.z * OUTWARD[sideIdx][1]);
      }
      if (innermost < wallInner) {
        stone.pos.x += OUTWARD[sideIdx][0] * (wallInner - innermost);
        stone.pos.z += OUTWARD[sideIdx][1] * (wallInner - innermost);
      }
      stones.push(stone);
      y += sy * r(0.55, 0.8); // 下の石と重なるように積む
    }
  }

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, stones.length);
  walls.name = 'StoneWalls';
  const base = new THREE.Color(cfg.colors.stone);
  const c = new THREE.Color();
  stones.forEach((s, k) => {
    m.compose(s.pos, q.setFromEuler(s.rot), s.scale);
    walls.setMatrixAt(k, m);
    walls.setColorAt(k, c.copy(base).multiplyScalar(r(0.75, 1.1))); // 石ごとの濃淡
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // ---------- 海（のっぺり単色） ----------
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(cfg.seaSize, cfg.seaSize).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: cfg.colors.sea, roughness: 0.4 }),
  );
  sea.position.y = cfg.seaLevel;
  sea.receiveShadow = true;
  sea.name = 'Sea';
  group.add(sea);

  const inner = half - cfg.wallThickness - 0.5 * S; // 石の張り出し分の余裕を引く
  return {
    group,
    update() {},
    config: cfg,
    bounds: { minX: -inner, maxX: inner, minZ: -inner, maxZ: inner, floorY: 0 },
    // カメラが動ける範囲。壁の内側の面（wallInner）のすぐ手前まで。キャラの範囲より広く、壁際でもカメラを引ける
    cameraBounds: { minX: -(wallInner - 0.4), maxX: wallInner - 0.4, minZ: -(wallInner - 0.4), maxZ: wallInner - 0.4 },
  };
}
