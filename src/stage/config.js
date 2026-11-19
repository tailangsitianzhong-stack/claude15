// ステージの寸法設定（ワールド単位）
export const STAGE_CONFIG = {
  floorSize: 64,       // 床（島）の一辺（面積は初期の4倍）
  floorThickness: 3,   // 床の厚み
  wallThickness: 8,    // 石壁の帯の太さ（外周から内側へ）
  wallHeight: 12,      // 石壁のおおよその高さ
  stoneScale: 3,       // 石ブロックの大きさ倍率
  stoneStep: 4.5,      // 外周に沿って石を置く間隔（大きいほど総数が減る）
  seaLevel: -1.2,      // 海面の高さ（床の上面が y=0）
  seaSize: 600,        // 海の広さ
  seed: 1337,          // 石の配置・色ムラ用の乱数シード
  colors: {
    grass: 0x4fa83d,
    dirt: 0x7a5232,
    stone: 0x8f8f8f,
    sea: 0x2e7fd0,
  },
};
