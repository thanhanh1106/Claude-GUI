// Máy chủ cập nhật qua HTTP cho mạng nội bộ — máy khác không cần tài khoản như thư mục chia sẻ (SMB).
// Chỉ phục vụ latest.json và các tệp .exe trong thư mục phát hành, chỉ đọc.
//   /                      → trang tải bản mới nhất
//   /latest.json           → thông tin phiên bản (app dùng để tự cập nhật)
//   /download, /ClaudeGUI-latest.exe, tên exe không còn → chuyển tới exe mới nhất
// Chạy: node scripts/update-server.js [thư mục] [cổng]   (mặc định C:\ClaudeGUI-Release, 8765)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(process.argv[2] || 'C:\\ClaudeGUI-Release');
const PORT = +(process.argv[3] || 8765);

const latest = () => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'latest.json'), 'utf8')); } catch { return null; } };
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(res, l) {
  const body = l
    ? `<h1>Claude GUI ${esc(l.version)}</h1><p>${esc(l.notes)}</p><p><a class="btn" href="/${encodeURIComponent(l.file)}">Tải ${esc(l.file)}</a></p>
       <p class="sub">Tải về → chạy (Windows cảnh báo thì bấm <b>More info → Run anyway</b>). Cần cài và đăng nhập Claude CLI trước.<br>
       App tự cập nhật từ <code>http://${esc(res.req.headers.host)}</code>.</p>`
    : '<h1>Chưa có bản phát hành</h1>';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Claude GUI</title><style>
    body{font-family:system-ui,sans-serif;max-width:620px;margin:60px auto;padding:0 20px;color:#222;background:#faf9f5}
    h1{font-weight:600}.btn{display:inline-block;background:#d97757;color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:600}
    .sub{color:#666;font-size:14px;line-height:1.6}code{background:#eee;padding:1px 5px;border-radius:4px}</style>${body}`);
}

function sendFile(req, res, name) {
  const file = path.join(DIR, name);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': name.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ...(name.endsWith('.exe') ? { 'Content-Disposition': `attachment; filename="${name}"` } : {}),
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let name = '';
  try { name = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/+/, '')); } catch {}
  if (!name || name === 'index.html') return page(res, latest());
  if (name === 'latest.json') return sendFile(req, res, name);
  if (/^[\w.-]+\.exe$/i.test(name) && fs.existsSync(path.join(DIR, name))) return sendFile(req, res, name);
  // download, ClaudeGUI-latest.exe, ClaudeGUI-x.y.z-portable.exe, exe bản cũ đã xoá… → exe mới nhất
  if (/^(download|[\w.-]+\.exe)$/i.test(name)) {
    const l = latest();
    if (l && l.file) { res.writeHead(302, { Location: '/' + encodeURIComponent(l.file) }); return res.end(); }
  }
  res.writeHead(404); res.end('not found');
}).on('error', (e) => { console.error(e.message); process.exit(1); })
  .listen(PORT, '0.0.0.0', () => console.log(`Claude GUI update server: http://0.0.0.0:${PORT}/ → ${DIR}`));
