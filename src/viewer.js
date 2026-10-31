'use strict';
// Khung xem bên phải (giống bản desktop): xem tệp code (tô màu, số dòng), markdown, ảnh,
// trang web / localhost (tương tác được như trình duyệt) + xem ảnh phóng to (lightbox).
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, $$, h, svg, icon, toast, menu, popover, renderMd, basename, dirname, shortPath, samePath } = CG;
  const S = () => CG.S;

  const V = { open: false, tabs: [], cur: null, seq: 0 };
  const HL_MAX = 400 * 1024; // tô màu tối đa ~400KB, lớn hơn hiển thị chữ thường cho mượt
  const EXT_LANG = {
    csproj: 'xml', props: 'xml', targets: 'xml', axaml: 'xml', xaml: 'xml', config: 'xml', resx: 'xml', svg: 'xml', htm: 'xml', html: 'xml', vue: 'xml', svelte: 'xml',
    jsonl: 'json', cjs: 'javascript', mjs: 'javascript', jsx: 'javascript', tsx: 'typescript', mts: 'typescript', h: 'cpp', hpp: 'cpp', cc: 'cpp', toml: 'ini', cfg: 'ini', env: 'ini',
    gradle: 'groovy', ps1: 'powershell', psm1: 'powershell', bat: 'dos', cmd: 'dos', yml: 'yaml', txt: 'plaintext', log: 'plaintext',
  };
  const PREVIEW_EXT = new Set(['md', 'markdown', 'mdx', 'html', 'htm', 'svg']);
  const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  const isLocalHost = (u) => {
    try {
      const x = new URL(u);
      return /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[\w-]+\.local|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(x.hostname);
    } catch { return false; }
  };
  const normUrl = (s) => {
    s = String(s || '').trim();
    if (!s) return '';
    if (/^(https?|file):/i.test(s)) return s;
    if (/^[a-z]:[\\/]/i.test(s)) return fileUrl(s);
    if (/^\d+$/.test(s)) return 'http://localhost:' + s; // gõ "3000" → localhost:3000
    return (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|[\d.]+:\d+)/i.test(s) ? 'http://' : 'https://') + s;
  };
  // Thư mục gốc để hiểu đường dẫn tương đối: phiên ở khung phải hay khung chính
  const cwdFor = (el) => {
    const md = el && el.closest && el.closest('[data-base]');
    if (md) return md.dataset.base;
    const s = S();
    const c = el && el.closest && el.closest('#split-col') ? s.side : s.active;
    return (c && c.cwd) || s.home || '';
  };

  // Các tệp phiên đã đọc/sửa/tạo — để tìm ra tệp khi Claude chỉ ghi tên hoặc đường dẫn tương đối theo thư mục khác
  const hintsFor = (el) => {
    const s = S();
    const c = el && el.closest && el.closest('#split-col') ? s.side : s.active;
    return c && c.fileHints ? c.fileHints() : [];
  };

  // ---------- Khung & tab ----------
  function setOpen(on) {
    V.open = on;
    if (on && !V.sized) { V.sized = true; $('#viewer').style.width = ((S().settings || {}).viewerWidth || 46) + '%'; }
    $('#viewer').classList.toggle('hidden', !on);
    $('#viewer-resize').classList.toggle('hidden', !on);
    $('#btn-viewer').classList.toggle('on', on);
    if (on && !V.restored) { V.restored = true; if (!V.tabs.length) restoreTabs(); }
  }
  function toggle() { setOpen(!V.open); }

  function addTab(t) {
    t.id = ++V.seq;
    t.body = h('div', { class: 'vw-pane off' });
    $('#vw-body').append(t.body);
    V.tabs.push(t);
    return t;
  }
  function select(t) {
    V.cur = t;
    for (const x of V.tabs) x.body.classList.toggle('off', x !== t);
    $('.vw-empty', $('#vw-body')) && $('.vw-empty', $('#vw-body')).classList.toggle('hidden', !!t);
    renderTabs();
    renderBar();
    saveTabs();
  }
  function closeTab(t) {
    const i = V.tabs.indexOf(t);
    if (i < 0) return;
    V.tabs.splice(i, 1);
    if (t.path) api.unwatchFile(t.path);
    t.body.remove();
    if (V.cur === t) select(V.tabs[i] || V.tabs[i - 1] || null);
    else renderTabs();
    if (!V.tabs.length) { renderBar(); saveTabs(); }
  }
  function tabLabel(t) {
    if (t.kind === 'web') return t.title || (t.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || 'Trang web';
    return basename(t.path);
  }
  function renderTabs() {
    const list = $('#vw-tablist');
    list.innerHTML = '';
    for (const t of V.tabs) {
      const x = h('button', { class: 'icon-btn sm vw-tab-x', title: 'Đóng (Ctrl+W)', html: svg('x', 12) });
      x.onclick = (e) => { e.stopPropagation(); closeTab(t); };
      const el = h('div', { class: 'vw-tab' + (t === V.cur ? ' on' : ''), title: t.kind === 'web' ? t.url : t.path },
        icon(t.kind === 'web' ? 'globe' : t.fileKind === 'image' ? 'image' : t.fileKind === 'pdf' ? 'file' : t.ext === 'md' ? 'book' : 'code', 13),
        h('span', { class: 'ellipsis', text: tabLabel(t) }), x);
      el.onclick = () => select(t);
      el.onauxclick = (e) => { if (e.button === 1) closeTab(t); };
      list.append(el);
      if (t === V.cur) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
    // nút danh sách mọi tab (kèm số tab) — chọn được tab bị khuất khi mở nhiều
    const all = $('#vw-alltabs');
    all.classList.toggle('hidden', V.tabs.length < 2);
    all.innerHTML = svg('list', 15);
    all.append(h('span', { class: 'vw-n', text: V.tabs.length }));
  }
  function allTabsMenu() {
    menu($('#vw-alltabs'), [{ header: `${V.tabs.length} tab đang mở` }, ...V.tabs.map((t) => ({
      label: tabLabel(t), desc: t.kind === 'web' ? t.url : t.path, checked: t === V.cur,
      icon: t.kind === 'web' ? 'globe' : t.fileKind === 'image' ? 'image' : t.ext === 'md' ? 'book' : 'code', onClick: () => select(t),
    })), '-', { label: 'Đóng các tab khác', icon: 'x', disabled: V.tabs.length < 2 || !V.cur, onClick: () => { for (const t of V.tabs.filter((x) => x !== V.cur)) closeTab(t); } }], { checks: true });
  }
  function saveTabs() {
    try {
      localStorage.setItem('cg.viewerTabs', JSON.stringify({
        tabs: V.tabs.map((t) => (t.kind === 'web' ? { url: t.url } : { path: t.path })),
        cur: V.tabs.indexOf(V.cur),
      }));
    } catch {}
  }
  function restoreTabs() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem('cg.viewerTabs')); } catch {}
    if (!st || !Array.isArray(st.tabs)) return;
    const made = [];
    for (const x of st.tabs.slice(0, 12)) {
      if (x.url) made.push(openUrl(x.url, { noSelect: true }));
      else if (x.path) made.push(openFile(x.path, 0, { noSelect: true }));
    }
    Promise.all(made).then((ts) => { const t = ts[st.cur] || ts[ts.length - 1]; if (t) select(t); });
  }

  // ---------- Thanh công cụ của tab ----------
  function btn(ic, title, onclick, cls = '') {
    const b = h('button', { class: 'icon-btn sm ' + cls, title, html: svg(ic, 15) });
    b.onclick = onclick;
    return b;
  }
  function renderBar() {
    const bar = $('#vw-bar');
    bar.innerHTML = '';
    const t = V.cur;
    bar.classList.toggle('hidden', !t);
    if (!t) return;
    if (t.kind === 'web') {
      const wv = t.wv;
      t.back = btn('chevronLeft', 'Lùi', () => wv.canGoBack() && wv.goBack());
      t.fwd = btn('chevronRight', 'Tiến', () => wv.canGoForward() && wv.goForward());
      t.reload = btn('refresh', 'Tải lại (F5)', () => (t.loading ? wv.stop() : wv.reload()));
      t.urlIn = h('input', { class: 'vw-url', value: t.url, spellcheck: 'false', placeholder: 'localhost:3000 hoặc địa chỉ web…' });
      t.urlIn.onkeydown = (e) => {
        if (e.key === 'Enter') { const u = normUrl(t.urlIn.value); if (u) navigate(t, u); }
        if (e.key === 'Escape') t.urlIn.value = t.url;
      };
      t.urlIn.onfocus = () => t.urlIn.select();
      bar.append(t.back, t.fwd, t.reload, t.urlIn,
        btn('code', 'DevTools của trang', () => wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools()),
        btn('external', 'Mở bằng trình duyệt', () => api.openExternal(t.url)));
      updateNav(t);
      return;
    }
    const s = S();
    const base = (s.active && s.active.cwd) || '';
    const rel = shortPath(t.path, base);
    bar.append(h('span', { class: 'vw-crumb ellipsis', title: t.path }, ...rel.split(/[\\/]/).flatMap((p, i, a) => [h('span', { class: i === a.length - 1 ? 'last' : '', text: p }), i < a.length - 1 ? h('span', { class: 'sep', text: '›' }) : null])));
    bar.append(h('span', { class: 'spacer' }));
    if (t.info && t.info.kind === 'text') bar.append(h('span', { class: 'vw-meta', text: `${t.lines} dòng${t.info.truncated ? ' (đã cắt bớt)' : ''}` }));
    if (PREVIEW_EXT.has(t.ext) && t.info && t.info.kind === 'text') {
      const seg = h('div', { class: 'seg sm' },
        h('button', { class: t.mode === 'preview' ? 'on' : '', text: 'Xem trước', onclick: () => { t.mode = 'preview'; renderFile(t); renderBar(); } }),
        h('button', { class: t.mode === 'code' ? 'on' : '', text: 'Mã nguồn', onclick: () => { t.mode = 'code'; renderFile(t); renderBar(); } }));
      bar.append(seg);
    }
    bar.append(
      btn('refresh', 'Tải lại', () => loadFile(t, true)),
      btn('copy', 'Sao chép đường dẫn', () => { navigator.clipboard.writeText(t.path); toast('Đã sao chép đường dẫn'); }),
      btn('folderOpen', 'Hiện trong thư mục', () => api.showItem(t.path)),
      btn('external', 'Mở bằng ứng dụng mặc định', () => api.openPath(t.path)));
  }

  // ---------- Tệp ----------
  async function openFile(p, line, opts = {}) {
    setOpen(true);
    let t = V.tabs.find((x) => x.kind === 'file' && samePath(x.path, p));
    if (!t) {
      t = addTab({ kind: 'file', path: p, ext: (p.split('.').pop() || '').toLowerCase(), mode: null });
      t.mode = PREVIEW_EXT.has(t.ext) ? 'preview' : 'code';
      api.watchFile(p);
      await loadFile(t);
    }
    if (!opts.noSelect) select(t);
    if (line) requestAnimationFrame(() => gotoLine(t, line));
    return t;
  }
  // Đường dẫn bất kỳ trong tin nhắn (tương đối theo thư mục phiên)
  async function openPath(base, p, quiet, el) {
    const r = await api.resolveFile(base, p, hintsFor(el));
    if (!r || !r.ok) { if (!quiet) toast('Không tìm thấy tệp: ' + p, true); return false; }
    if (r.isDir) { api.openPath(r.path); return true; }
    await openFile(r.path, r.line);
    return true;
  }
  async function loadFile(t, keepScroll) {
    const sc = t.scroller;
    const pos = keepScroll && sc ? [sc.scrollTop, sc.scrollLeft] : null;
    const info = await api.readFile(t.path).catch((e) => ({ ok: false, error: e.message }));
    t.info = info;
    t.fileKind = info.kind;
    t.lines = info.kind === 'text' ? info.text.split('\n').length : 0;
    renderFile(t);
    if (pos && t.scroller) { t.scroller.scrollTop = pos[0]; t.scroller.scrollLeft = pos[1]; }
    if (t === V.cur) { renderTabs(); renderBar(); }
  }
  function renderFile(t) {
    const info = t.info || {};
    const b = t.body;
    b.innerHTML = '';
    t.scroller = null;
    t.previewWv = null;
    if (!info.ok) { b.append(h('div', { class: 'vw-msg', text: info.error || 'Không đọc được tệp.' })); return; }
    if (info.kind === 'image') {
      const img = h('img', { src: info.dataUrl, alt: basename(t.path) });
      const box = h('div', { class: 'vw-image' }, img, h('div', { class: 'vw-msg sm', text: `${basename(t.path)} · ${fmtSize(info.size)}` }));
      img.onload = () => { box.lastChild.textContent = `${basename(t.path)} · ${img.naturalWidth}×${img.naturalHeight} · ${fmtSize(info.size)}`; };
      b.append(box);
      t.scroller = box;
      return;
    }
    if (info.kind === 'pdf') {
      const wv = makeWebview(fileUrl(t.path));
      b.append(wv);
      t.previewWv = wv;
      return;
    }
    if (info.kind === 'binary' || info.kind === 'toolarge') {
      b.append(h('div', { class: 'vw-msg' }, info.kind === 'binary' ? 'Tệp nhị phân — không hiển thị được.' : 'Tệp quá lớn để xem.', h('br'),
        h('button', { class: 'btn sm', text: 'Mở bằng ứng dụng mặc định', onclick: () => api.openPath(t.path) })));
      return;
    }
    if (t.mode === 'preview' && (t.ext === 'html' || t.ext === 'htm' || t.ext === 'svg')) {
      // Qua máy chủ cục bộ (http://127.0.0.1) để module JS / fetch() chạy được như trên web thật
      const s = S();
      api.previewUrl(t.path, (s.active && s.active.cwd) || '').then((url) => {
        if (t.info !== info || t.mode !== 'preview') return;
        const wv = makeWebview(url || fileUrl(t.path));
        b.append(wv);
        t.previewWv = wv;
      });
      return;
    }
    if (t.mode === 'preview' && PREVIEW_EXT.has(t.ext)) {
      const md = h('div', { class: 'md vw-md' });
      md.dataset.base = dirname(t.path);
      renderMd(md, info.text);
      const box = h('div', { class: 'vw-scroll' }, md);
      b.append(box);
      t.scroller = box;
      return;
    }
    b.append(codeView(t, info.text));
  }
  function codeView(t, text) {
    const n = text.split('\n').length;
    const lang = EXT_LANG[t.ext] || t.ext;
    const code = h('code', { class: 'hljs' });
    if (text.length <= HL_MAX && lang && window.hljs && hljs.getLanguage(lang)) {
      try { code.innerHTML = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; } catch { code.textContent = text; }
    } else code.textContent = text;
    let nums = '';
    for (let i = 1; i <= n; i++) nums += i + '\n';
    const gutter = h('pre', { class: 'vw-ln', text: nums });
    const mark = h('div', { class: 'vw-mark hidden' });
    const box = h('div', { class: 'vw-code' }, gutter, h('pre', { class: 'vw-src' }, code), mark);
    t.scroller = box;
    t.mark = mark;
    // Bấm số dòng → tô dòng đó
    gutter.onclick = (e) => {
      const lh = lineH(box);
      const r = gutter.getBoundingClientRect();
      gotoLine(t, Math.floor((e.clientY - r.top - 12) / lh) + 1, true);
    };
    return box;
  }
  const lineH = (box) => parseFloat(getComputedStyle($('.vw-src', box)).lineHeight) || 19;
  function gotoLine(t, line, noScroll) {
    if (t.mode !== 'code' && PREVIEW_EXT.has(t.ext)) { t.mode = 'code'; renderFile(t); renderBar(); }
    const box = t.scroller;
    if (!box || !t.mark) return;
    const lh = lineH(box);
    t.mark.style.top = 12 + (line - 1) * lh + 'px';
    t.mark.style.height = lh + 'px';
    t.mark.classList.remove('hidden');
    if (!noScroll) box.scrollTop = Math.max(0, (line - 1) * lh - box.clientHeight / 3);
  }
  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  api.onFileChanged((p) => {
    for (const t of V.tabs) {
      if (t.kind !== 'file' || !samePath(t.path, p)) continue;
      if (t.previewWv) { try { t.previewWv.reload(); } catch {} } else loadFile(t, true);
    }
  });

  // ---------- Trang web ----------
  function makeWebview(url) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:preview');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('plugins', '');
    wv.setAttribute('src', url);
    wv.className = 'vw-web';
    return wv;
  }
  function openUrl(url, opts = {}) {
    url = normUrl(url);
    if (!url) return null;
    setOpen(true);
    let t = !opts.newTab && V.tabs.find((x) => x.kind === 'web' && x.url === url);
    if (!t) {
      t = addTab({ kind: 'web', url, title: '' });
      const wv = makeWebview(url);
      t.wv = wv;
      const err = h('div', { class: 'vw-err hidden' });
      t.body.append(wv, err);
      const sync = () => { try { t.url = wv.getURL() || t.url; } catch {} if (t === V.cur) { if (t.urlIn && document.activeElement !== t.urlIn) t.urlIn.value = t.url; updateNav(t); } saveTabs(); };
      wv.addEventListener('did-navigate', () => { err.classList.add('hidden'); sync(); });
      wv.addEventListener('did-navigate-in-page', sync);
      wv.addEventListener('page-title-updated', (e) => { t.title = e.title; renderTabs(); });
      wv.addEventListener('did-start-loading', () => { t.loading = true; updateNav(t); });
      wv.addEventListener('did-stop-loading', () => { t.loading = false; updateNav(t); });
      wv.addEventListener('did-finish-load', () => { t.retries = 0; err.classList.add('hidden'); });
      wv.addEventListener('did-fail-load', (e) => {
        if (!e.isMainFrame || e.errorCode === -3) return; // -3: bị huỷ (chuyển trang)
        // Server dev thường bật chậm hơn lúc Claude gửi link → tự thử lại trong ~1 phút
        const refused = [-102, -100, -101, -324, -118].includes(e.errorCode);
        const failedUrl = e.validatedURL || t.url;
        clearTimeout(t.retryTimer);
        const retry = refused && (t.retries || 0) < 30;
        if (retry) {
          t.retries = (t.retries || 0) + 1;
          t.retryTimer = setTimeout(() => { if (V.tabs.includes(t)) { try { wv.loadURL(failedUrl); } catch {} } }, 2000);
        }
        err.innerHTML = '';
        err.append(icon('globe', 28), h('div', { class: 'vw-err-t', text: `Không mở được ${failedUrl}` }),
          h('div', { class: 'vw-err-d', text: refused ? (retry ? `Máy chủ chưa chạy hoặc sai cổng — đang tự thử lại (${t.retries}/30)…` : 'Máy chủ chưa chạy hoặc sai cổng. Bật server rồi bấm Thử lại.') : `${e.errorDescription || 'Lỗi'} (${e.errorCode})` }),
          h('button', { class: 'btn sm', text: 'Thử lại', onclick: () => { t.retries = 0; err.classList.add('hidden'); try { wv.loadURL(failedUrl); } catch { wv.reload(); } } }));
        err.classList.remove('hidden');
      });
    }
    if (!opts.noSelect) select(t);
    return t;
  }
  function navigate(t, url) {
    t.url = url;
    try { t.wv.loadURL(url); } catch { t.wv.src = url; }
    saveTabs();
  }
  function updateNav(t) {
    if (t !== V.cur || !t.back) return;
    try { t.back.disabled = !t.wv.canGoBack(); t.fwd.disabled = !t.wv.canGoForward(); } catch {}
    t.reload.innerHTML = svg(t.loading ? 'x' : 'refresh', 15);
    t.reload.title = t.loading ? 'Dừng tải' : 'Tải lại (F5)';
  }
  api.onViewerOpenUrl((url) => openUrl(url, { newTab: true }));

  function askUrl() {
    const last = (V.tabs.slice().reverse().find((t) => t.kind === 'web') || {}).url || 'http://localhost:3000';
    CG.promptDialog('Mở trang web (vd localhost:5173, 3000, https://…)', last, 'localhost:3000').then((v) => { if (v) openUrl(v, { newTab: true }); });
  }

  // ---------- Mở nhanh tệp trong dự án (Ctrl+P) ----------
  async function quickOpen(anchor) {
    const s = S();
    const cwd = s.active && s.active.cwd;
    if (!cwd) return toast('Chưa chọn thư mục dự án.', true);
    setOpen(true);
    let files = [];
    popover(anchor || $('#vw-open'), (el, close) => {
      el.classList.add('vw-quick');
      const inp = h('input', { class: 'vw-quick-in', placeholder: `Tìm tệp trong ${basename(cwd)}…`, spellcheck: 'false' });
      const list = h('div', { class: 'vw-quick-list' });
      let idx = 0, items = [];
      const draw = () => {
        const q = inp.value.trim().toLowerCase().replace(/\\/g, '/');
        items = !q ? files.slice(0, 60) : files.map((f) => {
          const lf = f.toLowerCase(), b = lf.split('/').pop();
          const s2 = b.startsWith(q) ? 0 : b.includes(q) ? 1 : lf.includes(q) ? 2 : -1;
          return [s2, f];
        }).filter((x) => x[0] >= 0).sort((a, b) => a[0] - b[0] || a[1].length - b[1].length).slice(0, 60).map((x) => x[1]);
        idx = Math.min(idx, Math.max(0, items.length - 1));
        list.innerHTML = '';
        items.forEach((f, i) => {
          const row = h('div', { class: 'menu-item' + (i === idx ? ' sel' : '') }, icon('file', 14, 'mi-icon'),
            h('div', { class: 'mi-body' }, h('div', { class: 'mi-label ellipsis', text: f.split('/').pop() }), h('div', { class: 'mi-desc ellipsis', text: f })));
          row.onclick = () => { close(); openFile(cwd.replace(/[\\/]$/, '') + '\\' + f.replace(/\//g, '\\')); };
          list.append(row);
        });
        if (!items.length) list.append(h('div', { class: 'note', text: files.length ? 'Không có tệp khớp.' : 'Đang tải danh sách tệp…' }));
        const sel = list.children[idx];
        if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
      };
      inp.oninput = () => { idx = 0; draw(); };
      inp.onkeydown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); draw(); }
        if (e.key === 'Enter' && items[idx]) { e.preventDefault(); list.children[idx].click(); }
      };
      el.append(inp, list);
      draw();
      api.listFiles(cwd).then((f) => { files = f || []; draw(); });
      setTimeout(() => inp.focus(), 20);
    }, { place: 'bottom', align: 'right' });
  }

  // ---------- Bấm link / đường dẫn trong cuộc trò chuyện ----------
  // Trả về true nếu đã xử lý (app.js gọi trước khi tự mở link ra ngoài)
  function handleLink(a, e) {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      if (isLocalHost(href) && !e.ctrlKey) { openUrl(href, { newTab: true }); return true; }
      return false;
    }
    if (/^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) return true;
    openPath(cwdFor(a), href, false, a);
    return true;
  }
  const PATH_RE = /^(?:[a-zA-Z]:[\\/]|[\\/]|\.{1,2}[\\/]|~[\\/])?(?:[\w.@\-]+[\\/])*[\w.@\-]+\.[a-zA-Z][a-zA-Z0-9]{0,9}(?::\d+(?:[:-]\d+)?)?$/;
  CG.PATH_RE = PATH_RE;

  // ---------- Xem ảnh phóng to ----------
  const IMG_SEL = '.msg-user .imgs img, .result-imgs img, .md img, #attachments img, .vw-image img';
  function lightbox(img) {
    const root = img.closest('.conv') || img.closest('#vw-body') || document;
    const group = $$(IMG_SEL, root).filter((x) => x.src);
    let i = Math.max(0, group.indexOf(img));
    let scale = 1, fit = 1, tx = 0, ty = 0;
    const big = h('img', { class: 'lb-img', draggable: 'false' });
    const zoomLbl = h('span', { class: 'lb-zoom' });
    const counter = h('span', { class: 'lb-count' });
    const stage = h('div', { class: 'lb-stage' }, big);
    const apply = () => { big.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; zoomLbl.textContent = Math.round(scale * 100) + '%'; };
    const show = () => {
      big.onload = () => {
        const r = stage.getBoundingClientRect();
        fit = Math.min(1, (r.width - 40) / big.naturalWidth, (r.height - 40) / big.naturalHeight);
        scale = fit; tx = 0; ty = 0; apply();
      };
      big.src = group[i] ? group[i].src : img.src;
      counter.textContent = group.length > 1 ? `${i + 1} / ${group.length}` : '';
      prev.classList.toggle('hidden', group.length < 2);
      next.classList.toggle('hidden', group.length < 2);
    };
    const step = (d) => { if (group.length > 1) { i = (i + d + group.length) % group.length; show(); } };
    const prev = h('button', { class: 'lb-nav prev', html: svg('chevronLeft', 26), onclick: (e) => { e.stopPropagation(); step(-1); } });
    const next = h('button', { class: 'lb-nav next', html: svg('chevronRight', 26), onclick: (e) => { e.stopPropagation(); step(1); } });
    const copy = async () => {
      try {
        const c = document.createElement('canvas');
        c.width = big.naturalWidth; c.height = big.naturalHeight;
        c.getContext('2d').drawImage(big, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Đã sao chép ảnh');
      } catch (e) { toast('Không sao chép được ảnh: ' + e.message, true); }
    };
    const bar = h('div', { class: 'lb-bar' }, counter, h('span', { class: 'spacer' }),
      btn('maximize', 'Vừa khung / 100% (nhấp đúp ảnh)', (e) => { e.stopPropagation(); scale = scale === 1 ? fit : 1; tx = ty = 0; apply(); }), zoomLbl,
      btn('copy', 'Sao chép ảnh', (e) => { e.stopPropagation(); copy(); }),
      btn('x', 'Đóng (Esc)', (e) => { e.stopPropagation(); close(); }));
    const ov = h('div', { class: 'lightbox' }, stage, prev, next, bar);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    };
    document.addEventListener('keydown', onKey, true);
    stage.addEventListener('click', (e) => { if (e.target === stage) close(); });
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
      const ns = Math.max(0.05, Math.min(16, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      tx = cx - ((cx - tx) * ns) / scale; ty = cy - ((cy - ty) * ns) / scale; scale = ns;
      apply();
    }, { passive: false });
    big.addEventListener('dblclick', () => { scale = scale === 1 ? fit : 1; tx = ty = 0; apply(); });
    big.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const x0 = e.clientX - tx, y0 = e.clientY - ty;
      big.classList.add('drag');
      const mv = (ev) => { tx = ev.clientX - x0; ty = ev.clientY - y0; apply(); };
      const up = () => { big.classList.remove('drag'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
    document.body.append(ov);
    show();
  }

  // ---------- Gắn sự kiện ----------
  function bind() {
    $('#btn-viewer').onclick = toggle;
    $('#vw-close').onclick = () => setOpen(false);
    $('#vw-web').onclick = askUrl;
    $('#vw-open').onclick = () => quickOpen($('#vw-open'));
    $('#vw-alltabs').onclick = allTabsMenu;
    // lăn chuột dọc trên thanh tab → cuộn ngang
    $('#vw-tablist').addEventListener('wheel', (e) => { const l = e.currentTarget; if (l.scrollWidth <= l.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); l.scrollLeft += e.deltaY; }, { passive: false });
    const col = $('#viewer');
    $('#viewer-resize').addEventListener('mousedown', (e) => {
      e.preventDefault();
      const ws = col.parentElement, x0 = e.clientX, w0 = col.offsetWidth;
      document.body.classList.add('resizing-h');
      // webview nuốt sự kiện chuột khi kéo qua → tạm che
      const shield = h('div', { class: 'drag-shield' });
      document.body.append(shield);
      const move = (ev) => { col.style.width = Math.max(20, Math.min(78, ((w0 - (ev.clientX - x0)) / ws.clientWidth) * 100)) + '%'; };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing-h');
        shield.remove();
        CG.saveSettings && CG.saveSettings({ viewerWidth: Math.round(parseFloat(col.style.width)) });
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    // Ảnh → xem phóng to; mã nội dòng dạng đường dẫn tệp → mở trong khung xem
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const img = t.closest(IMG_SEL);
      if (img && !t.closest('.lightbox')) { e.preventDefault(); e.stopPropagation(); lightbox(img); return; }
      const code = t.closest('.md code.pathlike');
      if (code && !code.closest('pre')) { e.preventDefault(); openPath(cwdFor(code), code.textContent, false, code); }
    }, true);
    // Ảnh markdown dùng đường dẫn tệp tương đối (![](logo.png)) → nạp từ ổ đĩa theo thư mục của tệp/phiên
    document.addEventListener('error', async (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || img.dataset.localTried || !img.closest('.md')) return;
      const src = img.getAttribute('src') || '';
      if (!src || /^(https?|data|blob):/i.test(src)) return;
      img.dataset.localTried = '1';
      const r = await api.resolveFile(cwdFor(img), src).catch(() => null);
      if (!r || !r.ok || r.isDir) return;
      const f = await api.readFile(r.path).catch(() => null);
      if (f && f.kind === 'image') img.src = f.dataUrl;
    }, true);
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && !e.altKey && k === 'p') { e.preventDefault(); quickOpen(V.open ? $('#vw-open') : $('#btn-viewer')); }
      else if (e.ctrlKey && e.shiftKey && k === 'p') { e.preventDefault(); toggle(); }
      else if (e.ctrlKey && k === 'w' && V.open && V.cur && document.activeElement && document.activeElement.closest && document.activeElement.closest('#viewer')) { e.preventDefault(); closeTab(V.cur); }
      else if (e.key === 'F5' && V.cur && V.cur.kind === 'web' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#viewer')) { e.preventDefault(); V.cur.wv.reload(); }
    });
  }

  // Tự mở xem trước (Claude vừa tạo tệp / in địa chỉ localhost): chỉ giữ MỘT tab "tự mở".
  // Trùng tệp / cùng server đang mở → tải lại tab đó; thứ mới → mở tab mới rồi đóng tab tự mở cũ. Tab bạn tự mở không bị đụng tới.
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
  async function autoShow(o) {
    const org = o.url ? originOf(o.url) : '';
    const same = o.file ? V.tabs.find((x) => x.kind === 'file' && samePath(x.path, o.file)) : V.tabs.find((x) => x.kind === 'web' && x.wv && org && originOf(x.url) === org);
    if (same) {
      setOpen(true);
      if (same.kind === 'file') await loadFile(same, true);
      else { try { if (same.url === o.url) same.wv.reload(); else same.wv.loadURL(o.url).catch(() => {}); same.url = o.url; } catch {} }
      select(same);
      return same;
    }
    const old = V.tabs.filter((x) => x.auto);
    const t = o.file ? await openFile(o.file) : openUrl(o.url, { newTab: true });
    if (!t) return null;
    t.auto = true;
    for (const x of old) if (x !== t) closeTab(x);
    return t;
  }
  CG.viewer = { autoShow, toggle, setOpen, openFile, openPath, openUrl, quickOpen, handleLink, lightbox, isLocalHost, get state() { return V; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
