const { createCanvas } = require('canvas');
const fs = require('fs');

function createIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#6366f1';
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();
  
  // Book icon
  ctx.fillStyle = 'white';
  const s = size * 0.5;
  const x = (size - s) / 2;
  const y = (size - s) / 2;
  ctx.fillRect(x, y, s * 0.7, s);
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x + s * 0.1, y + s * 0.15, s * 0.5, s * 0.05);
  ctx.fillRect(x + s * 0.1, y + s * 0.28, s * 0.5, s * 0.05);
  ctx.fillRect(x + s * 0.1, y + s * 0.41, s * 0.4, s * 0.05);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
}

createIcon(192, '192.png');
createIcon(512, '512.png');
console.log('Icons created');
