// 体の寸法（scale=1 のとき。身長 約4.95）
export const RIG = {
  hipY: 2.05,                    // 股関節の高さ = 脚の長さ
  legX: 0.39, legW: 0.72, legD: 0.74,
  thigh: 1.0, shin: 0.8, footH: 0.25, footD: 0.95, footZ: 0.1,
  pelvis: [1.54, 0.55, 0.76],
  waistUp: 0.4,                  // 股関節 → 腰関節
  chest: [1.6, 1.5, 0.8], chestTop: 1.35, // 腰関節 → 胸の上端
  head: 1.15,
  armW: 0.6, upperArm: 0.95, forearm: 0.65, hand: 0.3,
  shoulderDrop: 0.28,            // 肩関節は腕の上端からこれだけ下
  jointOverlap: 0.22,            // 子パーツを親の中へ伸ばす量（曲げたときの隙間埋め）
};
