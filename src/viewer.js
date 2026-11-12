'use strict';
// Khung xem bên phải (giống bản desktop): xem tệp code (tô màu, số dòng), markdown, ảnh,
// trang web / localhost (tương tác được như trình duyệt) + xem ảnh phóng to (lightbox).
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, $$, h, svg, icon, toast, menu, popover, renderMd, basename, dirname, shortPath, samePath } = CG;
  const S = () => CG.S;

  // Giống bản desktop: MỖI PHIÊN có bộ tab xem trước riêng (tab, tab đang chọn, khung mở hay đóng).
  // Đổi phiên → khung đổi theo; phiên chưa từng có xem trước → khung đóng. V.tabs / V.cur luôn là của phiên đang xem.
  const SETS = new Map(); // khoá phiên → { key, tabs, cur, open, t }
  const newSet = (key) => ({ key, tabs: [], cur: null, open: false, t: Date.now() });
  let CUR = newSet(null);
  const V = {
    seq: 0,
    get tabs() { return CUR.tabs; },
    get cur() { return CUR.cur; },
    set cur(t) { CUR.cur = t; },
    get open() { return CUR.open; },
    get key() { return CUR.key; },
  };
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

  // Phiên ở máy khác (Truy cập từ xa): tệp nằm ở máy gốc → đọc qua kết nối (chỉ xem, không sửa). t.rs = id liên kết
  const convOf = (key) => (key != null && S().convs ? S().convs.get(key) : null);
  const rsLinkOf = (key) => { const c = convOf(key); return (c && c.rs && c.rs.link) || ''; };
  const rsOfEl = (el) => {
    if (!el || !el.closest) return '';
    const md = el.closest('[data-rs]');
    if (md) return md.dataset.rs;
    if (el.closest('#viewer')) return '';
    const s = S();
    const c = el.closest('#split-col') ? s.side : s.active;
    return (c && c.rs && c.rs.link) || '';
  };
  const rsNameOf = (link) => { for (const c of (S().convs || new Map()).values()) if (c.rs && c.rs.link === link) return c.rs.name || 'máy kia'; return 'máy kia'; };
  const FS = (rs) => (rs ? {
    read: (p) => api.rsFile({ link: rs, op: 'read', p }),
    resolve: (b, p, hints) => api.rsFile({ link: rs, op: 'resolve', base: b, p, hints }),
    preview: (p, base) => api.rsPreviewUrl({ link: rs, p, base }),
  } : { read: (p) => api.readFile(p), resolve: (b, p, hints) => api.resolveFile(b, p, hints), preview: (p, base) => api.previewUrl(p, base) });
  // thư mục gốc để xem trước HTML: thư mục của phiên sở hữu tab (tab từ xa) hoặc phiên đang xem
  const baseOf = (t) => { if (t.rs) { const c = convOf(t.set && t.set.key); return (c && c.cwd) || ''; } const s = S(); return (s.active && s.active.cwd) || ''; };

  // Các tệp phiên đã đọc/sửa/tạo — để tìm ra tệp khi Claude chỉ ghi tên hoặc đường dẫn tương đối theo thư mục khác
  const hintsFor = (el) => {
    const s = S();
    const c = el && el.closest && el.closest('#split-col') ? s.side : s.active;
    return c && c.fileHints ? c.fileHints() : [];
  };

  // ---------- Khung & tab ----------
  function showPane(on) {
    if (on && !V.sized) { V.sized = true; $('#viewer').style.width = ((S().settings || {}).viewerWidth || 46) + '%'; }
    const vw = $('#viewer'), M = CG.motion;
    $('#viewer-resize').classList.toggle('hidden', !on);
    $('#btn-viewer').classList.toggle('on', on);
    // mở: trượt vào · đóng: trượt ra rồi mới ẩn (mở lại giữa chừng thì huỷ)
    if (!on) { if (M && M.paneOut) M.paneOut(vw, () => vw.classList.add('hidden')); else vw.classList.add('hidden'); return; }
    const anim = M && M.paneWillOpen ? M.paneWillOpen(vw) : false;
    vw.classList.remove('hidden');
    if (anim && M.paneIn) M.paneIn(vw);
  }
  function setOpen(on) {
    CUR.open = on;
    showPane(on);
    saveTabs(CUR);
  }
  function toggle() { setOpen(!CUR.open); }

  function addTab(t, st = CUR) {
    t.id = ++V.seq;
    t.set = st;
    t.body = h('div', { class: 'vw-pane off' });
    $('#vw-body').append(t.body);
    st.tabs.push(t);
    if (t.kind === 'file' && !t.rs) api.watchFile(t.path);
    return t;
  }
  // Tab chỉ dựng nội dung (đọc tệp / tạo webview) khi được xem — phiên chạy nền, tab khôi phục không tốn gì
  function materialize(t) {
    if (!t || t.loaded) return;
    t.loaded = true;
    if (t.kind === 'panel') t.render(t.body); else if (t.kind === 'web') buildWeb(t); else loadFile(t);
  }
  function unload(t) {
    if (!t.loaded) return;
    clearTimeout(t.retryTimer);
    t.loaded = false;
    t.body.innerHTML = '';
    t.wv = t.previewWv = t.scroller = t.mark = null;
    t.info = null;
  }
  function select(t) {
    const st = t ? t.set : CUR;
    st.cur = t;
    if (st !== CUR) { saveTabs(st); return; } // phiên đang ẩn: chỉ ghi nhớ, mở phiên đó ra mới thấy
    for (const x of CUR.tabs) x.body.classList.toggle('off', x !== t);
    materialize(t);
    $('.vw-empty', $('#vw-body')) && $('.vw-empty', $('#vw-body')).classList.toggle('hidden', !!t);
    renderTabs();
    renderBar();
    saveTabs(CUR);
  }
  function closeTab(t) {
    const st = t.set;
    const i = st.tabs.indexOf(t);
    if (i < 0) return;
    st.tabs.splice(i, 1);
    if (t.path && !t.rs) api.unwatchFile(t.path);
    clearTimeout(t.retryTimer);
    t.body.remove();
    if (st !== CUR) { if (st.cur === t) st.cur = st.tabs[i] || st.tabs[i - 1] || null; saveTabs(st); return; }
    if (V.cur === t) select(V.tabs[i] || V.tabs[i - 1] || null);
    else renderTabs();
    if (!V.tabs.length) { renderBar(); saveTabs(CUR); }
  }
  function tabLabel(t) {
    if (t.kind === 'panel') return t.label;
    if (t.kind === 'web') return t.title || (t.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || 'Trang web';
    return (t.rs ? '🏢 ' : '') + basename(t.path);
  }
  function renderTabs() {
    const list = $('#vw-tablist');
    list.innerHTML = '';
    for (const t of V.tabs) {
      const x = h('button', { class: 'icon-btn sm vw-tab-x', title: 'Đóng (Ctrl+W)', html: svg('x', 12) });
      x.onclick = (e) => { e.stopPropagation(); closeTab(t); };
      const el = h('div', { class: 'vw-tab' + (t === V.cur ? ' on' : '') + (t.kind === 'panel' ? ' vw-ptab' : '') + (t.rs ? ' vw-rtab' : ''), title: t.kind === 'panel' ? t.label : t.kind === 'web' ? t.url : t.path + (t.rs ? ` · tệp ở máy ${rsNameOf(t.rs)} (chỉ xem)` : '') },
        icon(t.kind === 'panel' ? t.icon : t.kind === 'web' ? 'globe' : t.fileKind === 'image' ? 'image' : t.fileKind === 'pdf' ? 'file' : t.ext === 'md' ? 'book' : 'code', 13),
        h('span', { class: 'ellipsis', text: tabLabel(t) }), t.kind === 'panel' && t.badge ? h('span', { class: 'vw-badge', text: t.badge }) : null, x);
      el.onclick = () => select(t);
      el.onauxclick = (e) => { if (e.button === 1) closeTab(t); };
      if (t.kind === 'file') el.oncontextmenu = (e) => { e.preventDefault(); fileMenu(t, el); };
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
      icon: t.kind === 'panel' ? t.icon : t.kind === 'web' ? 'globe' : t.fileKind === 'image' ? 'image' : t.ext === 'md' ? 'book' : 'code', onClick: () => select(t),
    })), '-', { label: 'Đóng các tab khác', icon: 'x', disabled: V.tabs.length < 2 || !V.cur, onClick: () => { for (const t of V.tabs.filter((x) => x !== V.cur)) closeTab(t); } }], { checks: true });
  }
  // Lưu theo phiên (giữ ~50 phiên gần nhất) → mở lại phiên cũ, kể cả sau khi tắt app, vẫn thấy đúng các tab của nó
  const STORE = 'cg.viewerSets', STORE_MAX = 50;
  try { localStorage.removeItem('cg.viewerTabs'); } catch {} // tab dùng chung của bản cũ — không biết thuộc phiên nào nên bỏ
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  function saveTabs(st = CUR) {
    if (!st.key) return;
    try {
      const all = readStore();
      st.t = Date.now();
      if (!st.tabs.length && !st.open) delete all[st.key];
      else {
        const keep = st.tabs.filter((t) => t.kind !== 'panel'); // tab tự dựng (Gợi ý…) không lưu — mở lại từ chat
        all[st.key] = { tabs: keep.map((t) => (t.kind === 'web' ? { url: t.url, auto: t.auto || undefined } : { path: t.path, rs: t.rs || undefined, auto: t.auto || undefined })), cur: keep.indexOf(st.cur), open: st.open && keep.length > 0, t: st.t };
      }
      const keys = Object.keys(all);
      if (keys.length > STORE_MAX) keys.sort((a, b) => (all[b].t || 0) - (all[a].t || 0)).slice(STORE_MAX).forEach((k) => delete all[k]);
      localStorage.setItem(STORE, JSON.stringify(all));
    } catch {}
  }
  function setFor(key) {
    let st = SETS.get(key);
    if (st) return st;
    st = newSet(key);
    SETS.set(key, st);
    const x = readStore()[key];
    if (x && Array.isArray(x.tabs)) {
      st.open = !!x.open;
      for (const o of x.tabs.slice(0, 12)) {
        if (o.url) addTab({ kind: 'web', url: o.url, title: '', auto: !!o.auto }, st);
        else if (o.path) addTab({ kind: 'file', path: o.path, rs: o.rs || '', ext: (o.path.split('.').pop() || '').toLowerCase(), mode: null, auto: !!o.auto }, st);
      }
      for (const t of st.tabs) if (t.kind === 'file') t.mode = PREVIEW_EXT.has(t.ext) ? 'preview' : 'code';
      st.cur = st.tabs[x.cur] || st.tabs[st.tabs.length - 1] || null;
    }
    return st;
  }
  // Trang web / xem trước HTML, PDF của phiên đang ẩn chỉ giữ chạy cho 3 phiên gần nhất, còn lại dỡ ra (quay lại thì tự tải)
  const LIVE_MAX = 3;
  function trimLive() {
    const live = [...SETS.values()].filter((s) => s !== CUR && s.tabs.some((t) => t.loaded)).sort((a, b) => b.t - a.t);
    for (const s of live.slice(LIVE_MAX - 1)) for (const t of s.tabs) unload(t);
  }
  // app.js gọi mỗi khi đổi phiên đang xem
  function useSession(key) {
    key = key || null;
    if (key === CUR.key) return;
    for (const t of CUR.tabs) t.body.classList.add('off');
    CUR.t = Date.now();
    CUR = setFor(key);
    CUR.t = Date.now();
    for (const t of CUR.tabs) t.body.classList.toggle('off', t !== CUR.cur);
    materialize(CUR.cur);
    $('.vw-empty', $('#vw-body')) && $('.vw-empty', $('#vw-body')).classList.toggle('hidden', !!CUR.cur);
    showPane(CUR.open);
    renderTabs();
    renderBar();
    trimLive();
    if (CUR.fresh) { CUR.fresh = false; if (CG.renderSidebar) CG.renderSidebar(); }
  }
  // Phiên chạy nền có thứ xem trước mới chưa xem → chấm báo ở thanh bên
  const fresh = (key) => { const st = SETS.get(key); return !!(st && st.fresh && st !== CUR); };

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
    bar.classList.toggle('hidden', !t || t.kind === 'panel');
    if (!t || t.kind === 'panel') return;
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
      t.pickBtn = btn('target', 'Chọn phần tử trên trang để đính vào chat (Ctrl+Shift+S)', () => pickElement(t));
      bar.append(t.back, t.fwd, t.reload, t.urlIn, t.pickBtn,
        btn('code', 'DevTools của trang', () => wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools()),
        btn('external', 'Mở bằng trình duyệt', () => api.openExternal(t.url)));
      updateNav(t);
      return;
    }
    const base = baseOf(t);
    const rel = shortPath(t.path, base);
    if (t.rs) bar.append(h('span', { class: 'vw-rs', text: '🏢 ' + rsNameOf(t.rs), title: `Tệp ở máy ${rsNameOf(t.rs)} — lấy qua Truy cập từ xa, chỉ xem` }));
    bar.append(h('span', { class: 'vw-crumb ellipsis', title: t.path }, ...rel.split(/[\\/]/).flatMap((p, i, a) => [h('span', { class: i === a.length - 1 ? 'last' : '', text: p }), i < a.length - 1 ? h('span', { class: 'sep', text: '›' }) : null])));
    bar.append(h('span', { class: 'spacer' }));
    if (t.info && t.info.kind === 'text') bar.append(h('span', { class: 'vw-meta', text: `${t.lines} dòng${t.info.truncated ? ' (đã cắt bớt)' : ''}` }));
    if (PREVIEW_EXT.has(t.ext) && t.info && t.info.kind === 'text') {
      const seg = h('div', { class: 'seg sm' },
        h('button', { class: t.mode === 'preview' ? 'on' : '', text: 'Xem trước', onclick: () => { t.mode = 'preview'; renderFile(t); renderBar(); } }),
        h('button', { class: t.mode === 'code' ? 'on' : '', text: 'Mã nguồn', onclick: () => { t.mode = 'code'; renderFile(t); renderBar(); } }));
      bar.append(seg);
    }
    if (t.mode === 'preview' && /^(html?|svg)$/.test(t.ext)) { t.pickBtn = btn('target', 'Chọn phần tử trên trang để đính vào chat (Ctrl+Shift+S)', () => pickElement(t)); bar.append(t.pickBtn); }
    const editable = t.info && t.info.kind === 'text' && !t.info.truncated && !t.rs;
    if (editable) {
      if (t.editing) {
        t.savedEl = h('span', { class: 'vw-saved' + (t.dirty ? '' : ' ok'), text: t.dirty ? (autoSave() ? 'Đang sửa…' : 'Chưa lưu') : '✓ Đã lưu' });
        bar.append(t.savedEl);
        if (!autoSave()) bar.append(h('button', { class: 'btn xs primary', text: 'Lưu (Ctrl+S)', onclick: () => saveEdit(t) }), h('button', { class: 'btn xs', text: 'Huỷ', onclick: () => { t.dirty = false; t.editing = false; loadFile(t, true); } }));
      }
      bar.append(h('button', { class: 'btn xs' + (t.editing ? ' primary' : ''), text: t.editing ? '✓ Xong' : '✎ Sửa', title: t.editing ? 'Thoát chế độ sửa' : 'Sửa tệp ngay tại đây (tự lưu)', onclick: () => toggleEdit(t) }));
    }
    bar.append(
      btn('refresh', 'Tải lại', () => loadFile(t, true)),
      btn('moreH', 'Thêm…', (e) => fileMenu(t, e.currentTarget)));
  }
  // Menu tệp (nút ⋯ hoặc chuột phải tab): đính vào chat, mở bằng trình sửa khác, hiện trong thư mục, sao chép đường dẫn
  async function fileMenu(t, anchor) {
    if (t.rs) return menu(anchor, [
      { label: 'Đính vào chat (làm ngữ cảnh)', icon: 'paperclip', onClick: () => attachToChat(t) },
      { label: 'Sao chép đường dẫn (ở máy ' + rsNameOf(t.rs) + ')', icon: 'copy', onClick: () => { navigator.clipboard.writeText(t.path); toast('Đã sao chép đường dẫn'); } },
    ]);
    const eds = await api.listEditors().catch(() => []);
    menu(anchor, [
      { label: 'Đính vào chat (làm ngữ cảnh)', icon: 'paperclip', onClick: () => attachToChat(t) },
      ...eds.map((e) => ({ label: 'Mở bằng ' + e.name, icon: 'external', onClick: () => api.openWith(e.id, t.path, t.markLine || 0) })),
      { label: 'Mở bằng ứng dụng mặc định', icon: 'external', onClick: () => api.openPath(t.path) },
      { label: 'Hiện trong thư mục', icon: 'folderOpen', onClick: () => api.showItem(t.path) },
      { label: 'Sao chép đường dẫn', icon: 'copy', onClick: () => { navigator.clipboard.writeText(t.path); toast('Đã sao chép đường dẫn'); } },
    ]);
  }
  function attachToChat(t) {
    const base = baseOf(t);
    const r = base && t.path.toLowerCase().startsWith(base.replace(/[\\/]+$/, '').toLowerCase() + '\\') ? t.path.slice(base.replace(/[\\/]+$/, '').length + 1) : t.path;
    if (CG.app) CG.app.insertText('@' + (/\s/.test(r) ? `"${r}"` : r) + ' ');
    toast('Đã đính tệp vào ô nhập');
  }
  // Tách tab đang xem ra cửa sổ riêng (vd đặt sang màn hình thứ 2); tab vẫn còn ở đây
  async function popOut(t) {
    if (!t) return toast('Chưa có tab nào để tách.', true);
    if (t.kind === 'panel') return toast('Tab này không tách ra cửa sổ riêng được.', true);
    const title = tabLabel(t) + ' · Claude GUI';
    if (t.kind === 'web') return api.popout({ url: t.url, title });
    if (t.rs) {
      if (t.fileKind !== 'pdf' && !/^(html?|svg)$/.test(t.ext)) return toast('Tệp ở máy khác chỉ tách ra được với HTML / SVG / PDF.', true);
      const u = await FS(t.rs).preview(t.path, baseOf(t));
      return u ? api.popout({ url: u, title }) : toast('Không lấy được tệp từ máy kia.', true);
    }
    if (t.fileKind === 'pdf') return api.popout({ url: fileUrl(t.path), title });
    if (/^(html?|svg)$/.test(t.ext)) { const s = S(); const u = await api.previewUrl(t.path, (s.active && s.active.cwd) || ''); return api.popout({ url: u || fileUrl(t.path), title }); }
    api.popout({ path: t.path, theme: document.documentElement.dataset.theme || '' });
  }

  // ---------- Dev servers (.claude/launch.json, giống menu Dev servers của bản desktop) ----------
  const LAUNCH_HELP = 'Hãy tạo tệp .claude/launch.json ở thư mục gốc dự án này để Claude GUI bật được dev server. Đọc package.json / cấu hình dự án để biết lệnh chạy, rồi ghi theo định dạng:\n{\n  "configurations": [\n    { "name": "web", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173, "autoPort": true },\n    { "name": "docs", "url": "http://localhost:8000" }\n  ]\n}\nCác trường: name, runtimeExecutable, runtimeArgs, cwd (tương đối), env, port, autoPort, url. Chỉ ghi các server thật sự có trong dự án.';
  function serversMenu(anchor) {
    const c = S().active;
    if (c && c.rs) return toast(`Dev server của phiên này chạy ở máy ${c.rs.name} — chưa xem được từ máy này.`, true);
    const root = c && c.cwd;
    if (!root) return toast('Chưa chọn thư mục dự án.', true);
    popover(anchor, (el, close) => {
      el.classList.add('srv-pop');
      const draw = async () => {
        const L = await api.devList(root);
        el.innerHTML = '';
        el.append(h('div', { class: 'menu-header', text: `.claude/launch.json · ${basename(root)}` }));
        if (L.error) el.append(h('div', { class: 'note', text: L.error }));
        for (const it of L.items || []) {
          const on = it.state === 'up' || it.state === 'starting';
          el.append(h('div', { class: 'srv-row', title: it.cmd || it.url },
            h('span', { class: 'srv-dot' + (it.state === 'up' ? ' on' : it.state === 'exited' || it.state === 'error' ? ' err' : '') }),
            h('span', { class: 'ellipsis' }, h('b', { text: it.name }), h('span', { class: 'muted', text: it.state === 'starting' ? ' · đang bật…' : it.state === 'exited' ? ` · đã dừng (mã ${it.code})` : it.urlOnly ? ' · server ngoài' : '' })),
            h('span', { class: 'muted', style: 'font-size:12px', text: it.port ? ':' + it.port : '' }),
            h('span', { class: 'row', style: 'gap:4px' },
              it.state === 'up' && it.url ? h('button', { class: 'btn xs', text: 'Xem', onclick: () => { close(); openUrl(it.url, { newTab: false }); } }) : null,
              !it.urlOnly && (it.state === 'exited' || it.state === 'error' || on) ? h('button', { class: 'btn xs', text: 'Log', onclick: async () => { const t = await api.devLog(root, it.name); close(); const m = CG.modal('Log · ' + it.name, h('pre', { class: 'srv-log', text: t || '(chưa có)' }), [h('button', { class: 'btn', text: 'Đóng', onclick: () => m.close() })]); } }) : null,
              on && !it.urlOnly ? h('button', { class: 'btn xs', text: '■ Tắt', onclick: () => api.devStop(root, it.name).then(draw) })
                : h('button', { class: 'btn xs primary', text: '▶ Bật', onclick: async () => { const p = api.devStart(root, it.name); setTimeout(draw, 300); const r = await p; draw(); if (r && r.ok && r.url) autoShow({ url: r.url, key: c.key }); else if (r && r.error) toast(r.error, true); } }))));
        }
        if (!L.items || !L.items.length) el.append(h('div', { class: 'note', style: 'max-width:300px', text: L.exists ? 'launch.json chưa có cấu hình nào.' : 'Dự án chưa có .claude/launch.json — bấm "Thiết lập" để Claude tự dò và viết.' }));
        el.append(h('div', { class: 'menu-sep' }),
          h('div', { class: 'menu-item', onclick: () => { close(); c.send(LAUNCH_HELP, 'Thiết lập dev servers (.claude/launch.json)'); } }, icon('plus', 14, 'mi-icon'), h('span', { text: L.exists ? 'Nhờ Claude cập nhật launch.json' : 'Thiết lập… (Claude tự dò và viết launch.json)' })),
          L.exists ? h('div', { class: 'menu-item', onclick: () => { close(); openFile(L.file); } }, icon('file', 14, 'mi-icon'), h('span', { text: 'Mở launch.json' })) : null,
          (L.items || []).some((x) => x.state === 'up' || x.state === 'starting') ? h('div', { class: 'menu-item', onclick: () => api.devStop(root).then(draw) }, icon('square', 14, 'mi-icon'), h('span', { text: 'Tắt tất cả' })) : null);
      };
      V.srvPop = el; V.srvDraw = draw;
      draw();
    }, { place: 'bottom', align: 'right' });
  }

  // ---------- Chọn phần tử trên trang (giống bản desktop, Ctrl+Shift+S) ----------
  // Tiêm script vào webview: rê chuột thấy khung cam + nhãn, bấm để chọn (Esc huỷ) → thông tin phần tử + ảnh chụp vùng đó
  const PICK_JS = `new Promise((done) => {
    if (window.__cgPick) { window.__cgPick(null); }
    const box = document.createElement('div'), tag = document.createElement('div');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #ff7a45;background:rgba(255,122,69,.12);border-radius:3px;transition:all .05s';
    tag.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#ff7a45;color:#fff;font:11px Consolas,monospace;padding:1px 6px;border-radius:4px';
    document.documentElement.append(box, tag);
    const old = document.documentElement.style.cursor; document.documentElement.style.cursor = 'crosshair';
    const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
    const sel = (el) => { const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 5; e = e.parentElement) { if (e.id) { p.unshift('#' + CSS.escape(e.id)); break; } let s = e.tagName.toLowerCase(); const cl = [...e.classList].slice(0, 2).map((c) => '.' + CSS.escape(c)).join(''); s += cl; const par = e.parentElement; if (par) { const same = [...par.children].filter((x) => x.tagName === e.tagName); if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'; } p.unshift(s); } return p.join(' > '); };
    let cur = null;
    const move = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); if (!el || el === cur) return; cur = el; const r = el.getBoundingClientRect(); Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); tag.textContent = desc(el) + ' · ' + Math.round(r.width) + '×' + Math.round(r.height); tag.style.left = Math.max(0, r.left) + 'px'; tag.style.top = Math.max(0, r.top - 18) + 'px'; };
    const end = (v) => { removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true); removeEventListener('mousedown', stop, true); removeEventListener('mouseup', stop, true); box.remove(); tag.remove(); document.documentElement.style.cursor = old; window.__cgPick = null; done(v); };
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    const click = (e) => { stop(e); const el = cur || e.target; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      const st = {}; for (const k of ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding', 'margin', 'border', 'border-radius', 'display', 'position', 'width', 'height', 'gap', 'opacity']) { const v = cs.getPropertyValue(k); if (v && v !== 'normal' && v !== 'none' && v !== 'auto' && v !== '0px') st[k] = v; }
      let html = el.outerHTML; if (html.length > 700) html = html.slice(0, 700) + '…';
      box.remove(); tag.remove();
      setTimeout(() => end({ desc: desc(el), selector: sel(el), text: (el.innerText || el.value || el.placeholder || '').trim().slice(0, 160), html, style: st, rect: { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(r.width), height: Math.round(r.height) }, url: location.href }), 30); };
    const key = (e) => { if (e.key === 'Escape') { stop(e); end(null); } };
    window.__cgPick = end;
    addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true); addEventListener('mousedown', stop, true); addEventListener('mouseup', stop, true);
  })`;
  async function pickElement(t) {
    const wv = t.kind === 'web' ? t.wv : t.previewWv;
    if (!wv) return toast('Trang chưa tải xong.', true);
    if (t.picking) { try { await wv.executeJavaScript('window.__cgPick && window.__cgPick(null)'); } catch {} return; }
    t.picking = true;
    if (t.pickBtn) t.pickBtn.classList.add('on-pick');
    toast('Rê chuột lên trang rồi bấm vào phần tử cần đính (Esc để huỷ)');
    try { wv.focus(); } catch {}
    let info = null;
    try { info = await wv.executeJavaScript(PICK_JS, true); } catch (e) { toast('Không chọn được phần tử: ' + e.message, true); }
    t.picking = false;
    if (t.pickBtn) t.pickBtn.classList.remove('on-pick');
    if (!info) return;
    // ảnh chụp đúng vùng phần tử (thêm chút lề), tối đa ~1200px
    let url = '', data = '';
    try {
      const r = info.rect, pad = 6;
      if (r.width > 2 && r.height > 2) {
        let img = await wv.capturePage({ x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(r.width + pad * 2, 1600), height: Math.min(r.height + pad * 2, 1200) });
        const sz = img.getSize(); if (sz.width > 1200) img = img.resize({ width: 1200 });
        url = img.toDataURL(); data = url.split(',')[1];
      }
    } catch {}
    const style = Object.entries(info.style || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
    const text = [`Phần tử đã chọn trên trang ${info.url}:`, `- Selector: ${info.selector}`, info.text ? `- Chữ: "${info.text}"` : '', `- Kích thước: ${info.rect.width}×${info.rect.height} tại (${info.rect.x}, ${info.rect.y})`, style ? `- Style: ${style}` : '', `- HTML: ${info.html}`, url ? '- (kèm ảnh chụp vùng phần tử)' : ''].filter(Boolean).join('\n');
    if (CG.app && CG.app.addAttachment) CG.app.addAttachment({ kind: 'ctx', name: `<${info.desc}>${info.text ? ' "' + info.text.slice(0, 24) + '"' : ''}`, text, url, data, mime: 'image/png' });
    toast('Đã đính phần tử vào ô nhập');
  }

  // ---------- Sửa tệp (tự lưu, báo xung đột khi Claude / chương trình khác sửa cùng lúc) ----------
  const autoSave = () => (S().settings || {}).viewerAutoSave !== false;
  function toggleEdit(t) {
    if (t.editing && t.dirty) saveEdit(t);
    t.editing = !t.editing;
    renderFile(t); renderBar();
    if (t.editing && t.editor) t.editor.focus();
  }
  async function saveEdit(t, force) {
    if (!t.editor) return;
    clearTimeout(t.saveT);
    let text = t.editor.value;
    if (t.crlf) text = text.replace(/\r?\n/g, '\r\n');
    const r = await api.writeFile(t.path, text, force ? 0 : t.info.mtime, t.bom);
    if (r && r.ok) {
      t.info.mtime = r.mtime; t.info.text = t.editor.value; t.dirty = false; t.ownWrite = Date.now();
      if (t.conflictEl) { t.conflictEl.remove(); t.conflictEl = null; }
      if (t.savedEl) { t.savedEl.textContent = '✓ Đã lưu'; t.savedEl.classList.add('ok'); }
      return true;
    }
    if (r && r.conflict) { showConflict(t); return false; }
    toast('Không lưu được: ' + ((r && r.error) || 'lỗi'), true);
    return false;
  }
  function showConflict(t) {
    if (t.conflictEl && t.conflictEl.isConnected) return;
    t.conflictEl = h('div', { class: 'vw-conflict' }, icon('alert', 14), h('span', { text: 'Tệp vừa bị sửa ở nơi khác (vd Claude) trong lúc bạn đang sửa.' }), h('span', { class: 'spacer' }),
      h('button', { class: 'btn xs', text: 'Giữ bản của tôi', title: 'Ghi đè bằng nội dung đang sửa', onclick: () => saveEdit(t, true) }),
      h('button', { class: 'btn xs', text: 'Lấy bản mới', title: 'Bỏ phần đang sửa, nạp nội dung mới nhất', onclick: () => { t.dirty = false; t.conflictEl = null; loadFile(t, true); } }));
    const box = t.body.querySelector('.vw-editbox');
    if (box) box.prepend(t.conflictEl);
  }
  function editView(t, text) {
    const ta = h('textarea', { class: 'vw-edit', spellcheck: 'false', wrap: 'off' });
    ta.value = text;
    t.crlf = /\r\n/.test(text);
    t.bom = !!(t.info && t.info.bom);
    if (t.crlf) ta.value = text.replace(/\r\n/g, '\n');
    ta.oninput = () => {
      t.dirty = true;
      if (t.savedEl) { t.savedEl.textContent = autoSave() ? 'Đang sửa…' : 'Chưa lưu'; t.savedEl.classList.remove('ok'); }
      clearTimeout(t.saveT);
      if (autoSave()) t.saveT = setTimeout(() => saveEdit(t), 1000);
    };
    ta.onkeydown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveEdit(t); }
      else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end'); ta.oninput(); }
    };
    t.editor = ta;
    const box = h('div', { class: 'vw-editbox' }, ta);
    if (t.conflictEl) box.prepend(t.conflictEl);
    return box;
  }

  // ---------- Tệp ----------
  // opts.set: bộ tab của phiên khác (phiên chạy nền) — chỉ ghi nhận, không bật khung lên
  async function openFile(p, line, opts = {}) {
    const st = opts.set || CUR;
    if (st === CUR) setOpen(true); else st.open = true;
    const rs = opts.rs || '';
    let t = st.tabs.find((x) => x.kind === 'file' && samePath(x.path, p) && (x.rs || '') === rs);
    if (!t) {
      t = addTab({ kind: 'file', path: p, rs, ext: (p.split('.').pop() || '').toLowerCase(), mode: null }, st);
      t.mode = PREVIEW_EXT.has(t.ext) ? 'preview' : 'code';
      if (st === CUR) { t.loaded = true; await loadFile(t); }
    }
    if (!opts.noSelect) select(t);
    if (line) requestAnimationFrame(() => gotoLine(t, line));
    return t;
  }
  // Đường dẫn bất kỳ trong tin nhắn (tương đối theo thư mục phiên)
  // o.rs: phiên ở máy khác (không truyền → đoán theo phần tử được bấm)
  async function openPath(base, p, quiet, el, o = {}) {
    const rs = o.rs != null ? o.rs || '' : rsOfEl(el);
    const r = await FS(rs).resolve(base, p, hintsFor(el));
    if (!r || !r.ok) { if (!quiet) toast(rs && r && r.error ? r.error : 'Không tìm thấy tệp: ' + p, true); return false; }
    if (r.isDir) { if (rs) toast('Đây là thư mục ở máy ' + rsNameOf(rs) + '.', true); else api.openPath(r.path); return true; }
    await openFile(r.path, r.line, { rs });
    return true;
  }
  async function loadFile(t, keepScroll) {
    const sc = t.scroller;
    const pos = keepScroll && sc ? [sc.scrollTop, sc.scrollLeft] : null;
    const info = await FS(t.rs).read(t.path).catch((e) => ({ ok: false, error: e.message }));
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
      const put = (u) => { if (t.info !== info) return; const wv = makeWebview(u); b.append(wv); t.previewWv = wv; };
      if (t.rs) FS(t.rs).preview(t.path, '').then((u) => (u ? put(u) : b.append(h('div', { class: 'vw-msg', text: 'Không lấy được tệp từ máy kia.' }))));
      else put(fileUrl(t.path));
      return;
    }
    if (info.kind === 'binary' || info.kind === 'toolarge') {
      b.append(h('div', { class: 'vw-msg' }, info.kind === 'binary' ? 'Tệp nhị phân — không hiển thị được.' : 'Tệp quá lớn để xem.', h('br'),
        t.rs ? null : h('button', { class: 'btn sm', text: 'Mở bằng ứng dụng mặc định', onclick: () => api.openPath(t.path) })));
      return;
    }
    t.editor = null;
    if (t.editing && info.kind === 'text') { b.append(editView(t, info.text)); return; }
    if (t.mode === 'preview' && (t.ext === 'html' || t.ext === 'htm' || t.ext === 'svg')) {
      // Qua máy chủ cục bộ (http://127.0.0.1) để module JS / fetch() chạy được như trên web thật (tệp từ xa: máy chủ đó lấy từ máy gốc)
      FS(t.rs).preview(t.path, baseOf(t)).then((url) => {
        if (t.info !== info || t.mode !== 'preview') return;
        if (!url && t.rs) { b.append(h('div', { class: 'vw-msg', text: 'Không lấy được tệp từ máy kia.' })); return; }
        const wv = makeWebview(url || fileUrl(t.path));
        b.append(wv);
        t.previewWv = wv;
      });
      return;
    }
    if (t.mode === 'preview' && PREVIEW_EXT.has(t.ext)) {
      const md = h('div', { class: 'md vw-md' });
      md.dataset.base = dirname(t.path);
      if (t.rs) md.dataset.rs = t.rs;
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
    t.markLine = line;
    const lh = lineH(box);
    t.mark.style.top = 12 + (line - 1) * lh + 'px';
    t.mark.style.height = lh + 'px';
    t.mark.classList.remove('hidden');
    if (!noScroll) box.scrollTop = Math.max(0, (line - 1) * lh - box.clientHeight / 3);
  }
  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  api.onFileChanged((p) => {
    for (const t of [...new Set([...SETS.values(), CUR])].flatMap((s) => s.tabs)) {
      if (t.kind !== 'file' || !t.loaded || !samePath(t.path, p)) continue;
      if (t.editing) {
        if (t.ownWrite && Date.now() - t.ownWrite < 1500) continue; // chính mình vừa lưu
        if (t.dirty) { showConflict(t); continue; }
      }
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
    const st = opts.set || CUR;
    if (st === CUR) setOpen(true); else st.open = true;
    let t = !opts.newTab && st.tabs.find((x) => x.kind === 'web' && x.url === url);
    if (!t) {
      t = addTab({ kind: 'web', url, title: '' }, st);
      if (st === CUR) { t.loaded = true; buildWeb(t); }
    }
    if (!opts.noSelect) select(t);
    return t;
  }
  function buildWeb(t) {
    {
      const url = t.url;
      const wv = makeWebview(url);
      t.wv = wv;
      const err = h('div', { class: 'vw-err hidden' });
      t.body.append(wv, err);
      const sync = () => { try { t.url = wv.getURL() || t.url; } catch {} if (t === V.cur) { if (t.urlIn && document.activeElement !== t.urlIn) t.urlIn.value = t.url; updateNav(t); } saveTabs(t.set); };
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
          t.retryTimer = setTimeout(() => { if (t.set.tabs.includes(t) && t.wv === wv) { try { wv.loadURL(failedUrl); } catch {} } }, 2000);
        }
        err.innerHTML = '';
        err.append(icon('globe', 28), h('div', { class: 'vw-err-t', text: `Không mở được ${failedUrl}` }),
          h('div', { class: 'vw-err-d', text: refused ? (retry ? `Máy chủ chưa chạy hoặc sai cổng — đang tự thử lại (${t.retries}/30)…` : 'Máy chủ chưa chạy hoặc sai cổng. Bật server rồi bấm Thử lại.') : `${e.errorDescription || 'Lỗi'} (${e.errorCode})` }),
          h('button', { class: 'btn sm', text: 'Thử lại', onclick: () => { t.retries = 0; err.classList.add('hidden'); try { wv.loadURL(failedUrl); } catch { wv.reload(); } } }));
        err.classList.remove('hidden');
      });
    }
  }
  function navigate(t, url) {
    t.url = url;
    try { t.wv.loadURL(url); } catch { t.wv.src = url; }
    saveTabs(t.set);
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
    if (s.active.rs) return toast(`Mở nhanh chưa dùng được với phiên ở máy ${s.active.rs.name} — bấm vào tên tệp trong chat để xem.`, true);
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
      const rl = isLocalHost(href) && rsOfEl(a);
      if (rl && /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(href)) { toast(`Địa chỉ này chạy ở máy ${rsNameOf(rl)} — chưa xem được từ máy này.`, true); return true; }
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
    $('#vw-srv').onclick = () => serversMenu($('#vw-srv'));
    $('#vw-pop').onclick = () => popOut(V.cur);
    api.onDevState(() => { if (V.srvPop && V.srvPop.isConnected && V.srvDraw) V.srvDraw(); });
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
      const sg = CG.paneSign ? CG.paneSign('viewer') : 1; // khung đặt bên trái chat → kéo ngược chiều
      const move = (ev) => { col.style.width = Math.max(20, Math.min(78, ((w0 - (ev.clientX - x0) * sg) / ws.clientWidth) * 100)) + '%'; };
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
      const F = FS(rsOfEl(img));
      const r = await F.resolve(cwdFor(img), src).catch(() => null);
      if (!r || !r.ok || r.isDir) return;
      const f = await F.read(r.path).catch(() => null);
      if (f && f.kind === 'image') img.src = f.dataUrl;
    }, true);
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && !e.altKey && k === 'p') { e.preventDefault(); quickOpen(V.open ? $('#vw-open') : $('#btn-viewer')); }
      else if (e.ctrlKey && e.shiftKey && (k === 'p' || k === 'b')) { e.preventDefault(); toggle(); } // Ctrl+Shift+B như bản desktop
      else if (e.ctrlKey && k === 'w' && V.open && V.cur && document.activeElement && document.activeElement.closest && document.activeElement.closest('#viewer')) { e.preventDefault(); closeTab(V.cur); }
      else if (e.ctrlKey && e.shiftKey && k === 's' && V.open && V.cur && (V.cur.wv || V.cur.previewWv)) { e.preventDefault(); pickElement(V.cur); }
      else if (e.key === 'F5' && V.cur && V.cur.kind === 'web' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#viewer')) { e.preventDefault(); V.cur.wv.reload(); }
    });
  }

  // Tự mở xem trước (Claude vừa tạo tệp / in địa chỉ localhost): chỉ giữ MỘT tab "tự mở".
  // Trùng tệp / cùng server đang mở → tải lại tab đó; thứ mới → mở tab mới rồi đóng tab tự mở cũ. Tab bạn tự mở không bị đụng tới.
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
  // o.key: phiên tạo ra thứ cần xem. Phiên đang xem → mở khung ngay; phiên chạy nền → ghi vào bộ tab của phiên đó
  // (khung không bật lên giữa chừng), chấm báo ở thanh bên; mở phiên đó ra thì khung tự mở với tab ấy.
  async function autoShow(o) {
    const st = o.key == null || o.key === CUR.key ? CUR : setFor(o.key);
    const bg = st !== CUR;
    const org = o.url ? originOf(o.url) : '';
    const rs = rsLinkOf(st.key);
    const same = o.file ? st.tabs.find((x) => x.kind === 'file' && samePath(x.path, o.file) && (x.rs || '') === rs) : st.tabs.find((x) => x.kind === 'web' && org && originOf(x.url) === org);
    if (same) {
      if (bg) { st.open = true; st.fresh = true; if (o.url) same.url = o.url; unload(same); select(same); CG.renderSidebar && CG.renderSidebar(); return same; }
      setOpen(true);
      if (!same.loaded) select(same);
      else if (same.kind === 'file') await loadFile(same, true);
      else { try { if (same.url === o.url) same.wv.reload(); else same.wv.loadURL(o.url).catch(() => {}); same.url = o.url; } catch {} }
      select(same);
      return same;
    }
    const old = st.tabs.filter((x) => x.auto);
    const t = o.file ? await openFile(o.file, 0, { set: st, rs }) : openUrl(o.url, { newTab: true, set: st });
    if (!t) return null;
    t.auto = true;
    for (const x of old) if (x !== t) closeTab(x);
    saveTabs(st);
    if (bg) { st.fresh = true; CG.renderSidebar && CG.renderSidebar(); }
    return t;
  }
  // Tab tự dựng nội dung (vd "Gợi ý" của suggest.js): o = { key, id, label, icon, badge, render(body), show, rerender, create }
  //  show: mở khung + chọn tab (phiên đang ẩn: chỉ ghi nhớ + chấm báo) · rerender: dựng lại nội dung · create:false → chỉ cập nhật nếu đã có
  function panel(o) {
    const st = o.key == null || o.key === CUR.key ? CUR : setFor(o.key);
    let t = st.tabs.find((x) => x.kind === 'panel' && x.pid === o.id);
    if (!t) {
      if (o.create === false) return null;
      t = addTab({ kind: 'panel', pid: o.id, label: o.label, icon: o.icon || 'sparkles', render: o.render }, st);
    }
    if (o.label) t.label = o.label;
    if (o.render) t.render = o.render;
    if ('badge' in o) t.badge = o.badge;
    if (o.rerender && t.loaded) t.render(t.body);
    if (o.show) {
      if (st === CUR) { setOpen(true); select(t); }
      else { st.open = true; st.cur = t; st.fresh = true; CG.renderSidebar && CG.renderSidebar(); }
    } else if (st === CUR && CUR.open) renderTabs();
    return t;
  }
  // Tab tệp đang mở trong phiên (để app.js biết sửa tệp đã mở thì chỉ cần tự tải lại)
  const hasFile = (key, f) => { const st = key == null || key === CUR.key ? CUR : SETS.get(key); return !!(st && st.tabs.some((t) => t.kind === 'file' && samePath(t.path, f))); };
  // Phiên ở máy khác vừa ghi / sửa tệp f (không theo dõi được tệp bên đó) → tải lại tab đúng tệp đó, và trang HTML/SVG
  // đang xem trước mà f nằm trong thư mục của nó (vd sửa style.css của demo)
  function rsTouched(key, f) {
    const st = key == null || key === CUR.key ? CUR : SETS.get(key);
    if (!st || !f) return;
    const k = String(f).replace(/\//g, '\\').toLowerCase();
    for (const t of st.tabs) {
      if (t.kind !== 'file' || !t.rs || !t.loaded) continue;
      const same = samePath(t.path, f);
      const d = dirname(t.path).replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '') + '\\';
      if (!same && !(t.previewWv && k.startsWith(d))) continue;
      clearTimeout(t.rsT);
      t.rsT = setTimeout(() => { if (t.previewWv && !same) { try { t.previewWv.reloadIgnoringCache(); } catch {} } else loadFile(t, true); }, 250);
    }
  }
  CG.viewer = { panel, autoShow, rsTouched, toggle, setOpen, openFile, openPath, openUrl, quickOpen, handleLink, lightbox, isLocalHost, useSession, fresh, hasFile, get state() { return V; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
