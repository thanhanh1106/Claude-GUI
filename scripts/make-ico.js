// Tạo assets/icon.ico nhiều kích thước (16…256, nén PNG) từ assets/icon.png — chạy bằng Electron để có bộ thu nhỏ chất lượng cao:
//   node_modules\electron\dist\electron.exe scripts\make-ico.js
'use strict';
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const src = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
  const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
  // Cỡ ≤48 lưu dạng bitmap (DIB 32-bit) — mọi API Windows đều đọc được; cỡ lớn lưu PNG cho gọn
  const dib = (img, s) => {
    const bgra = img.toBitmap(); // BGRA, từ trên xuống
    const maskRow = Math.ceil(s / 32) * 4;
    const hdr = Buffer.alloc(40);
    hdr.writeUInt32LE(40, 0); hdr.writeInt32LE(s, 4); hdr.writeInt32LE(s * 2, 8);
    hdr.writeUInt16LE(1, 12); hdr.writeUInt16LE(32, 14); hdr.writeUInt32LE(s * s * 4 + maskRow * s, 20);
    const px = Buffer.alloc(s * s * 4);
    for (let y = 0; y < s; y++) bgra.copy(px, (s - 1 - y) * s * 4, y * s * 4, (y + 1) * s * 4); // DIB từ dưới lên
    return Buffer.concat([hdr, px, Buffer.alloc(maskRow * s)]);
  };
  const pngs = sizes.map((s) => { const img = src.resize({ width: s, height: s, quality: 'best' }); return s <= 48 ? dib(img, s) : img.toPNG(); });
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += pngs[i].length;
  });
  const out = path.join(__dirname, '..', 'assets', 'icon.ico');
  fs.writeFileSync(out, Buffer.concat([head, ...pngs]));
  console.log('Đã tạo', out, off, 'bytes');
  app.quit();
});
