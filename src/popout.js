'use strict';
// Cửa sổ tách riêng của khung xem (tệp markdown / code / ảnh). Trang web & HTML mở thẳng URL, không qua trang này.
(async () => {
  const api = window.api, CG = window.CG;
  const q = new URLSearchParams(location.search);
  const p = q.get('path') || '';
  const theme = q.get('theme') || '';
  if (theme) document.documentElement.dataset.theme = theme;
  try { const st = await api.getSettings(); if (st && st.mdHl && st.mdHl !== 'default') document.documentElement.dataset.mdhl = st.mdHl; } catch {}
  const ext = (p.split('.').pop() || '').toLowerCase();
  document.getElementById('po-name').textContent = p.split(/[\\/]/).pop();
  document.getElementById('po-path').textContent = p;
  document.title = p.split(/[\\/]/).pop() + ' · Claude GUI';
  const body = document.getElementById('po-body');
  async function load() {
    const f = await api.readFile(p).catch((e) => ({ ok: false, error: e.message }));
    body.innerHTML = '';
    if (!f.ok) { body.textContent = f.error || 'Không đọc được tệp.'; return; }
    if (f.kind === 'image') { const i = document.createElement('img'); i.src = f.dataUrl; body.append(i); return; }
    if (f.kind !== 'text') { body.textContent = 'Không hiển thị được loại tệp này ở cửa sổ riêng.'; return; }
    if (/^(md|markdown|mdx)$/.test(ext)) { const md = document.createElement('div'); md.className = 'md'; CG.renderMd(md, f.text); body.append(md); return; }
    const pre = document.createElement('pre'); pre.className = 'code hljs';
    try { pre.innerHTML = window.hljs.highlightAuto(f.text.length < 400000 ? f.text : '').value || ''; if (!pre.innerHTML) pre.textContent = f.text; } catch { pre.textContent = f.text; }
    body.append(pre);
  }
  document.getElementById('po-reload').onclick = load;
  setInterval(async () => { const f = await api.readFile(p).catch(() => null); if (f && f.mtime && f.mtime !== load.m) { if (load.m) load(); load.m = f.mtime; } }, 2000);
  load();
})();
