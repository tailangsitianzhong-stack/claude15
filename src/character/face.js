import * as THREE from 'three';

// 顔は「絵を1枚貼っただけ」のデカール。背景透過のキャンバスに描く。
export function faceTexture(style = 'smile') {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineCap = 'round';

  // 目（縦長の楕円）
  const eye = (x) => {
    ctx.beginPath();
    ctx.ellipse(x, 52, 7, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  eye(44);
  eye(84);

  ctx.lineWidth = 7;
  ctx.beginPath();
  if (style === 'angry') {
    // つり眉 + への字口
    ctx.moveTo(30, 30); ctx.lineTo(54, 40);
    ctx.moveTo(98, 30); ctx.lineTo(74, 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 104, 20, Math.PI * 1.2, Math.PI * 1.8);
  } else {
    // にっこり口
    ctx.arc(64, 70, 26, Math.PI * 0.2, Math.PI * 0.8);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
