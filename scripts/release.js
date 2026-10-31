// Tạo dist/latest.json cho tính năng tự cập nhật của Claude GUI.
// Dùng: npm run release  [-- "Ghi chú phát hành"]  [-- --publish "\\server\share\ClaudeGUI"]
// Sau đó chép latest.json + file .exe vào thư mục chung (hoặc dùng --publish để chép tự động),
// rồi đặt "Nguồn cập nhật" trong Cài đặt › Cập nhật trỏ tới thư mục đó.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dist = path.join(root, 'dist');
const file = `ClaudeGUI-${pkg.version}-portable.exe`;
if (!fs.existsSync(path.join(dist, file))) {
  console.error(`Không thấy dist/${file}. Hãy chạy "npm run dist" trước.`);
  process.exit(1);
}
const args = process.argv.slice(2);
const pi = args.indexOf('--publish');
const publishTo = pi >= 0 ? args[pi + 1] : null;
// npm trên Windows chạy script qua cmd.exe và có thể chèn dấu ^ (ký tự thoát của cmd) vào ghi chú → bỏ đi
const notes = args.filter((_a, i) => pi < 0 || (i !== pi && i !== pi + 1)).join(' ').replace(/\^(.?)/g, '$1').trim();
const latest = { version: pkg.version, file, notes, date: new Date().toISOString() };
fs.writeFileSync(path.join(dist, 'latest.json'), JSON.stringify(latest, null, 2));
console.log('Đã tạo dist/latest.json:', latest);
if (publishTo) {
  fs.mkdirSync(publishTo, { recursive: true });
  fs.copyFileSync(path.join(dist, file), path.join(publishTo, file));
  fs.copyFileSync(path.join(dist, 'latest.json'), path.join(publishTo, 'latest.json'));
  console.log('Đã phát hành tới', publishTo);
}
