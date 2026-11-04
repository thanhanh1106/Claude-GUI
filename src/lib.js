'use strict';
// Tiện ích dùng chung cho giao diện: DOM, icon, markdown, diff, hiển thị công cụ, menu bật lên, toast.
(() => {
  const CG = (window.CG = window.CG || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
    return e;
  }

  // ---------- Icons (nét kiểu Lucide) ----------
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    folderOpen: '<path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    folderPlus: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M12 11v6M9 14h6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    panelRight: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
    swap: '<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    filePlus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
    fileDiff: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 10h6M12 7v6M9 17h6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    todo: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
    map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>',
    git: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="8" r="3"/><path d="M6 9v6M18 11a6 6 0 0 1-6 6H9"/>',
    branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    circleDot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
    circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    moreH: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    slash: '<path d="M22 2 2 22"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    cornerDownRight: '<path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    listPlus: '<path d="M11 12H3M16 6H3M16 18H3M18 9v6M21 12h-6"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  };
  const svg = (n, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;
  const icon = (n, s = 16, cls = '') => h('span', { class: 'ic ' + cls, html: svg(n, s) });

  // Biểu tượng Claude chính thức (nguồn: Wikimedia Commons, "Claude AI symbol.svg")
  const CLAUDE_PATH = 'm19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z';
  const logoSvg = (size) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="currentColor"><path d="${CLAUDE_PATH}"/></svg>`;
  const logo = (size = 20, cls = '') => h('span', { class: 'logo ' + cls, html: logoSvg(size) });

  function hydrate(root = document) {
    for (const e of $$('[data-icon]', root)) if (!e.firstChild) e.innerHTML = svg(e.dataset.icon, +e.dataset.size || 16);
    for (const e of $$('[data-logo]', root)) if (!e.firstChild) e.innerHTML = logoSvg(+e.dataset.logo || 20);
  }

  // ---------- Định dạng ----------
  const basename = (p) => (p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p || '';
  const dirname = (p) => (p || '').replace(/[\\/]+$/, '').split(/[\\/]/).slice(0, -1).join('\\');
  const samePath = (a, b) => (a || '').replace(/[\\/]+$/, '').toLowerCase() === (b || '').replace(/[\\/]+$/, '').toLowerCase();
  function shortPath(p, cwd) {
    if (!p) return '';
    const n = (s) => s.replace(/\//g, '\\').toLowerCase();
    if (cwd && n(p).startsWith(n(cwd).replace(/\\?$/, '\\'))) return p.slice(cwd.replace(/[\\/]?$/, '').length + 1);
    return p;
  }
  const fmtTok = (n) => (n < 1000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M');
  const stripAnsi = (s) => String(s || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const stripReminders = (s) => String(s || '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/\s*\[Claude GUI: Lark is connected[\s\S]*?is outdated\.\]/g, '').replace(/\[Claude GUI · CHUYỂN MÁY\][\s\S]*?\[\/CHUYỂN MÁY\]\s*/g, '').trim();
  function relTime(ms, short) {
    const d = (Date.now() - ms) / 1000;
    if (short) {
      if (d < 60) return 'vừa xong';
      if (d < 3600) return Math.floor(d / 60) + ' ph';
      if (d < 86400) return Math.floor(d / 3600) + ' giờ';
      if (d < 86400 * 7) return Math.floor(d / 86400) + ' ngày';
      return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }
    if (d < 60) return 'vừa xong';
    if (d < 3600) return Math.floor(d / 60) + ' phút trước';
    if (d < 86400) return Math.floor(d / 3600) + ' giờ trước';
    if (d < 86400 * 30) return Math.floor(d / 86400) + ' ngày trước';
    return new Date(ms).toLocaleDateString('vi-VN');
  }
  const firstLine = (s) => String(s || '').split('\n')[0];
  const rid = () => 'gui-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  // ---------- Markdown ----------
  marked.use({ gfm: true, breaks: false });
  // `src/app.js`, `README.md`, `Models\Bot.cs:42`… trong câu trả lời → bấm được để mở tệp
  const PATH_LIKE = /^(?:[a-zA-Z]:[\\/]|[\\/]|\.{1,2}[\\/]|~[\\/])?(?:[\w.@\-]+[\\/])*[\w.@\-]+\.[a-zA-Z][a-zA-Z0-9]{0,9}(?::\d+(?:[:-]\d+)?)?$/;
  // Mặc định DOMPurify xoá href dạng C:\… và file:///… (coi "C:" là giao thức lạ) → link tệp của Claude bấm không ra gì.
  // Cho phép thêm file: và ổ đĩa Windows; javascript: vẫn bị chặn.
  const MD_PURIFY = { ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|file):|[a-z]:(?:[\\/]|%5c)|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i };
  // marked không nhận link có khoảng trắng: [x](C:\My Folder\a.md) → bọc <…> để thành link hợp lệ
  const fixLinks = (t) => t.replace(/\]\(((?:[a-zA-Z]:[\\/]|file:\/\/\/?|\.{0,2}[\\/])[^()<>\n]*?\s[^()<>\n]*?)\)/g, (m, u) => `](<${u}>)`);
  function renderMd(target, text, streaming) {
    target.innerHTML = DOMPurify.sanitize(marked.parse(fixLinks(text || '')), MD_PURIFY);
    if (!streaming) for (const c of target.querySelectorAll('code')) if (c.parentElement.tagName !== 'PRE' && c.textContent.length < 260 && PATH_LIKE.test(c.textContent)) c.classList.add('pathlike');
    for (const pre of $$('pre', target)) {
      const code = pre.querySelector('code');
      const lang = ((code && code.className.match(/language-([\w+#-]+)/)) || [])[1] || '';
      if (code && !streaming) {
        try {
          if (lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
          else if (code.textContent.length < 20000) code.innerHTML = hljs.highlightAuto(code.textContent).value;
          code.classList.add('hljs');
        } catch {}
      }
      const wrap = h('div', { class: 'codeblock' }, h('div', { class: 'code-bar' }, h('span', { text: lang }), copyBtn(() => (code || pre).textContent)));
      pre.replaceWith(wrap);
      wrap.append(pre);
    }
  }
  function copyBtn(getText, title = 'Sao chép') {
    const b = h('button', { class: 'icon-btn sm', title, html: svg('copy', 14) });
    b.onclick = async (e) => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(getText()); } catch {}
      const M = CG.motion, anim = M && M.on && M.on();
      clearTimeout(b._t);
      b.innerHTML = svg('check', 14);
      b.classList.add('m-copied');
      // icon chép → dấu tick được vẽ ra (nảy nhẹ), 1.5 giây sau trở lại
      if (anim) { const s = b.querySelector('svg'); if (s) s.animate([{ transform: 'scale(.4)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' }); if (M.drawTick) M.drawTick(b); }
      b._t = setTimeout(() => { b.innerHTML = svg('copy', 14); b.classList.remove('m-copied'); if (anim && b.firstChild && b.firstChild.animate) b.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); }, 1500);
    };
    return b;
  }
  function mdEl(text) { const d = h('div', { class: 'md' }); renderMd(d, text); d.dataset.raw = text; return d; }

  // ---------- Hằng số ----------
  const MODES = [
    { v: 'default', label: 'Hỏi trước', desc: 'Hỏi trước khi sửa tệp và chạy lệnh', icon: 'hand', cls: '' },
    { v: 'acceptEdits', label: 'Tự chấp nhận sửa', desc: 'Tự động chấp nhận sửa tệp và các lệnh tệp phổ biến', icon: 'edit', cls: 'edits' },
    { v: 'plan', label: 'Lập kế hoạch', desc: 'Khám phá và đề xuất kế hoạch, không sửa mã nguồn', icon: 'map', cls: 'plan' },
    { v: 'auto', label: 'Tự động', desc: 'Bộ phân loại chạy nền tự kiểm tra từng thao tác', icon: 'sparkles', cls: 'auto' },
    { v: 'bypassPermissions', label: 'Bỏ qua quyền', desc: 'Không hỏi gì cả — chỉ dùng khi bạn hoàn toàn tin tưởng', icon: 'zap', cls: 'warn', danger: true },
  ];
  const EFFORTS = [
    { v: 'low', label: 'Thấp' }, { v: 'medium', label: 'Vừa' }, { v: 'high', label: 'Cao' },
    { v: 'xhigh', label: 'Rất cao' }, { v: 'max', label: 'Tối đa' },
  ];
  const effortLabel = (v) => (EFFORTS.find((e) => e.v === v) || {}).label || v;

  const TOOLS = {
    Bash: ['terminal', 'Bash'], PowerShell: ['terminal', 'PowerShell'], BashOutput: ['terminal', 'Đọc output'], KillShell: ['terminal', 'Dừng shell'],
    Read: ['file', 'Đọc'], Write: ['filePlus', 'Ghi tệp'], Edit: ['edit', 'Sửa'], MultiEdit: ['edit', 'Sửa'], NotebookEdit: ['edit', 'Sửa notebook'],
    Glob: ['search', 'Tìm tệp'], Grep: ['search', 'Tìm kiếm'], LS: ['folder', 'Liệt kê'],
    WebFetch: ['globe', 'Tải trang'], WebSearch: ['globe', 'Tìm trên web'],
    Task: ['bot', 'Tác tử phụ'], Agent: ['bot', 'Tác tử phụ'], TodoWrite: ['todo', 'Danh sách việc'],
    Skill: ['sparkles', 'Kỹ năng'], AskUserQuestion: ['help', 'Câu hỏi'], ExitPlanMode: ['map', 'Kế hoạch'], EnterPlanMode: ['map', 'Lập kế hoạch'],
    ToolSearch: ['search', 'Nạp công cụ'], Monitor: ['eye', 'Theo dõi'],
  };
  function toolMeta(name) {
    if (TOOLS[name]) return { icon: TOOLS[name][0], label: TOOLS[name][1] };
    const m = /^mcp__(.+?)__(.+)$/.exec(name || '');
    if (m) return { icon: 'plug', label: `${m[1].replace(/^claude_ai_/, '')} › ${m[2]}` };
    return { icon: 'tool', label: name };
  }
  function toolSummary(name, inp, cwd) {
    inp = inp || {};
    switch (name) {
      case 'Bash': case 'PowerShell': return inp.description || firstLine(inp.command);
      case 'Read': {
        const r = inp.offset ? ` (dòng ${inp.offset}${inp.limit ? '–' + (inp.offset + inp.limit) : ''})` : '';
        return shortPath(inp.file_path, cwd) + r;
      }
      case 'Write': case 'Edit': case 'MultiEdit': return shortPath(inp.file_path, cwd);
      case 'NotebookEdit': return shortPath(inp.notebook_path, cwd);
      case 'Glob': return inp.pattern + (inp.path ? '  trong ' + shortPath(inp.path, cwd) : '');
      case 'Grep': return `"${inp.pattern}"` + (inp.path ? '  trong ' + shortPath(inp.path, cwd) : '') + (inp.glob ? '  ' + inp.glob : '');
      case 'WebFetch': return inp.url;
      case 'WebSearch': return inp.query;
      case 'Task': case 'Agent': return [inp.subagent_type, inp.description].filter(Boolean).join(' · ');
      case 'TodoWrite': {
        const t = inp.todos || [];
        return `${t.filter((x) => x.status === 'completed').length}/${t.length} xong`;
      }
      case 'Skill': return inp.skill || inp.command || '';
      case 'AskUserQuestion': return (inp.questions || []).map((q) => q.header || q.question).join(', ');
      default: {
        const v = Object.values(inp).find((x) => typeof x === 'string');
        return v ? firstLine(v).slice(0, 140) : '';
      }
    }
  }

  // ---------- Diff ----------
  function lineDiff(a, b) {
    const A = a === '' ? [] : a.split('\n'), B = b === '' ? [] : b.split('\n');
    let p = 0;
    while (p < A.length && p < B.length && A[p] === B[p]) p++;
    let s = 0;
    while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
    const a2 = A.slice(p, A.length - s), b2 = B.slice(p, B.length - s);
    const out = [];
    if (p > 3) out.push(['…', `${p - 3} dòng không đổi`]);
    for (const l of A.slice(Math.max(0, p - 3), p)) out.push([' ', l]);
    const n = a2.length, m = b2.length;
    if (n * m > 400000) {
      for (const l of a2) out.push(['-', l]);
      for (const l of b2) out.push(['+', l]);
    } else {
      const W = m + 1, dp = new Int32Array((n + 1) * W);
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
        dp[i * W + j] = a2[i] === b2[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) { out.push([' ', a2[i]]); i++; j++; }
        else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) out.push(['-', a2[i++]]);
        else out.push(['+', b2[j++]]);
      }
      while (i < n) out.push(['-', a2[i++]]);
      while (j < m) out.push(['+', b2[j++]]);
    }
    for (const l of A.slice(A.length - s, Math.min(A.length, A.length - s + 3))) out.push([' ', l]);
    if (s > 3) out.push(['…', `${s - 3} dòng không đổi`]);
    return out;
  }
  // file: đường dẫn đầy đủ của tệp → bật góp ý từng dòng (rê chuột vào dòng → nút +)
  function rowsView(rows, maxLines = 800, file) {
    const box = h('div', { class: 'diff' });
    if (file) box.dataset.file = file;
    rows.slice(0, maxLines).forEach(([t, l, ln]) => {
      if (t === '…' || t === '@') return box.append(h('div', { class: 'dl gap', text: (t === '@' ? '' : '⋯ ') + l }));
      const row = h('div', { class: 'dl ' + (t === '+' ? 'add' : t === '-' ? 'del' : 'ctx') },
        ln != null ? h('span', { class: 'ln', text: ln }) : null,
        h('span', { class: 'sign', text: t }), h('span', { class: 'txt', text: l || ' ' }));
      if (ln) row.dataset.ln = ln;
      box.append(row);
    });
    if (rows.length > maxLines) box.append(h('div', { class: 'dl gap', text: `⋯ còn ${rows.length - maxLines} dòng` }));
    return box;
  }
  const diffView = (oldS, newS, maxLines) => rowsView(lineDiff(oldS || '', newS || ''), maxLines);
  // structuredPatch của CLI: [{oldStart, oldLines, newStart, newLines, lines: ['-a', '+b', ' c']}]
  function patchRows(hunks) {
    const rows = [];
    for (const hk of hunks || []) {
      rows.push(['@', `@@ -${hk.oldStart},${hk.oldLines} +${hk.newStart},${hk.newLines} @@`]);
      let ln = hk.newStart;
      for (const l of hk.lines || []) {
        const t = l[0] === '+' ? '+' : l[0] === '-' ? '-' : ' ';
        if (l.startsWith('\\')) continue;
        rows.push([t, l.slice(1), t === '-' ? '' : ln]);
        if (t !== '-') ln++;
      }
    }
    return rows;
  }
  function patchCounts(hunks) {
    let add = 0, del = 0;
    for (const hk of hunks || []) for (const l of hk.lines || []) { if (l[0] === '+') add++; else if (l[0] === '-') del++; }
    return { add, del };
  }
  function unifiedRows(text) {
    const rows = [];
    let ln = 0;
    for (const l of String(text || '').split('\n')) {
      if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(l)) continue;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
      if (m) { ln = +m[1]; rows.push(['@', l]); continue; }
      if (l.startsWith('\\')) continue;
      const t = l[0] === '+' ? '+' : l[0] === '-' ? '-' : ' ';
      rows.push([t, l.slice(1), t === '-' ? '' : ln || '']);
      if (t !== '-' && ln) ln++;
    }
    while (rows.length && rows[rows.length - 1][1] === '' && rows[rows.length - 1][0] === ' ') rows.pop();
    return rows;
  }
  // Tạo hunk giả từ old/new khi CLI không gửi structuredPatch
  function hunksFromStrings(oldS, newS) {
    const rows = lineDiff(oldS || '', newS || '').filter(([t]) => t !== '…');
    return [{ oldStart: 1, oldLines: rows.filter((r) => r[0] !== '+').length, newStart: 1, newLines: rows.filter((r) => r[0] !== '-').length, lines: rows.map(([t, l]) => t + l) }];
  }

  function todoView(todos) {
    const ul = h('ul', { class: 'todos' });
    for (const t of todos || []) {
      const ic = t.status === 'completed' ? 'circleCheck' : t.status === 'in_progress' ? 'circleDot' : 'circle';
      ul.append(h('li', { class: t.status }, icon(ic, 15, 'box'), h('span', { text: t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content })));
    }
    return ul;
  }

  function preBlock(text, cls = '', limit = 8000) {
    text = stripAnsi(text);
    const pre = h('pre', { class: 'pre ' + cls });
    if (text.length <= limit) { pre.textContent = text; return pre; }
    pre.textContent = text.slice(0, limit);
    const more = h('button', { class: 'more-btn', text: `Xem toàn bộ (${text.length.toLocaleString('vi-VN')} ký tự)` });
    more.onclick = (e) => { e.stopPropagation(); pre.textContent = text; more.remove(); };
    return h('div', {}, pre, more);
  }

  function toolInputView(name, inp, cwd) {
    inp = inp || {};
    const f = document.createDocumentFragment();
    switch (name) {
      case 'Bash': case 'PowerShell':
        f.append(preBlock(inp.command || '', 'cmd'));
        break;
      case 'Edit':
        f.append(h('div', { class: 'diff-file', text: shortPath(inp.file_path, cwd) + (inp.replace_all ? '  (thay tất cả)' : '') }), diffView(inp.old_string, inp.new_string));
        break;
      case 'MultiEdit':
        f.append(h('div', { class: 'diff-file', text: shortPath(inp.file_path, cwd) }));
        for (const e of inp.edits || []) f.append(diffView(e.old_string, e.new_string), h('div', { style: 'height:6px' }));
        break;
      case 'Write': {
        const content = (inp.content || '').replace(/\r?\n$/, '');
        f.append(h('div', { class: 'diff-file', text: shortPath(inp.file_path, cwd) + `  (${content ? content.split('\n').length : 0} dòng)` }), diffView('', content, 400));
        break;
      }
      case 'TodoWrite': f.append(todoView(inp.todos)); break;
      case 'ExitPlanMode': f.append(mdEl(inp.plan || '')); break;
      case 'Task': case 'Agent':
        f.append(h('div', { class: 'lbl', text: 'Yêu cầu cho tác tử' }), preBlock(inp.prompt || '', '', 3000));
        break;
      case 'WebFetch': f.append(preBlock(`${inp.url}\n\n${inp.prompt || ''}`.trim())); break;
      case 'Read': f.append(preBlock(inp.file_path || '')); break;
      default: f.append(preBlock(JSON.stringify(inp, null, 2)));
    }
    return f;
  }

  function resultText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((c) => (c.type === 'text' ? c.text : '')).filter(Boolean).join('\n');
    return content ? JSON.stringify(content, null, 2) : '';
  }
  function resultView(name, content, isError) {
    const quiet = ['Edit', 'MultiEdit', 'Write', 'TodoWrite', 'ExitPlanMode', 'NotebookEdit', 'EnterPlanMode'];
    if (!isError && quiet.includes(name)) return null;
    const f = document.createDocumentFragment();
    const imgs = Array.isArray(content) ? content.filter((c) => c.type === 'image' && c.source && c.source.data) : [];
    const text = stripReminders(resultText(content));
    if ((name === 'Task' || name === 'Agent') && !isError) f.append(mdEl(text));
    else if (text) f.append(preBlock(text, isError ? 'err' : ''));
    if (imgs.length) {
      const box = h('div', { class: 'result-imgs' });
      for (const im of imgs) box.append(h('img', { src: `data:${im.source.media_type};base64,${im.source.data}` }));
      f.append(box);
    }
    if (!f.childNodes.length) f.append(h('div', { class: 'note', text: '(không có output)' }));
    return f;
  }

  function permTitle(name, inp, cwd) {
    inp = inp || {};
    const p = inp.file_path || inp.notebook_path;
    switch (name) {
      case 'Bash': return 'Claude muốn chạy lệnh Bash';
      case 'PowerShell': return 'Claude muốn chạy lệnh PowerShell';
      case 'Write': return `Claude muốn ghi tệp ${basename(p)}`;
      case 'Edit': case 'MultiEdit': case 'NotebookEdit': return `Claude muốn sửa ${basename(p)}`;
      case 'Read': return `Claude muốn đọc ${shortPath(p, cwd)}`;
      case 'WebFetch': { let host = inp.url; try { host = new URL(inp.url).host; } catch {} return `Claude muốn truy cập ${host}`; }
      case 'WebSearch': return `Claude muốn tìm trên web: “${inp.query}”`;
      default: return `Claude muốn dùng công cụ ${toolMeta(name).label}`;
    }
  }
  function suggestionLabel(sugs) {
    const s = sugs && sugs[0];
    if (!s) return '';
    if (s.type === 'setMode') return s.mode === 'acceptEdits' ? 'Cho phép mọi chỉnh sửa trong phiên' : `Chuyển sang chế độ ${s.mode}`;
    if (s.type === 'addRules' || s.type === 'replaceRules') {
      const r = (s.rules || [])[0];
      if (r) return `Luôn cho phép ${r.toolName}${r.ruleContent ? `(${r.ruleContent})` : ''}`;
    }
    if (s.type === 'addDirectories') return 'Luôn cho phép thư mục này';
    return 'Luôn cho phép';
  }

  // ---------- Popover / menu ----------
  let openPop = null;
  function closePopover() {
    if (openPop) { const p = openPop; openPop = null; p.el.remove(); if (p.onClose) p.onClose(); }
  }
  function popover(anchor, build, opts = {}) {
    // Bấm lại vào nút đang mở menu → đóng menu
    if (openPop && openPop.anchor === anchor && anchor instanceof Element) { closePopover(); return null; }
    closePopover();
    const el = h('div', { class: 'popover ' + (opts.cls || '') });
    const state = { el, anchor, onClose: opts.onClose };
    // Đặt lại vị trí (gọi lại được khi nội dung popover thay đổi kích thước)
    state.reposition = () => {
      if (!el.isConnected) return;
      const r = anchor.getBoundingClientRect();
      const W = el.offsetWidth, H = el.offsetHeight;
      let left = opts.align === 'right' ? r.right - W : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
      let top = opts.place === 'top' ? r.top - H - 6 : r.bottom + 6;
      if (top + H > window.innerHeight - 8) top = r.top - H - 6;
      if (top < 8) top = Math.min(r.bottom + 6, window.innerHeight - H - 8);
      el.style.left = left + 'px';
      el.style.top = Math.max(8, top) + 'px';
    };
    openPop = state;
    build(el, closePopover, state);
    document.body.append(el);
    state.reposition();
    return state;
  }
  document.addEventListener('mousedown', (e) => {
    if (openPop && !openPop.el.contains(e.target) && !(e.target.closest && e.target.closest('[data-pop-anchor]'))) closePopover();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPop) { e.stopPropagation(); e.preventDefault(); closePopover(); } }, true);
  window.addEventListener('blur', () => closePopover());
  window.addEventListener('resize', () => closePopover());

  // items: [{ label, desc, icon, checked, danger, disabled, kbd, onClick } | '-' | { header }]
  function menu(anchor, items, opts = {}) {
    return popover(anchor, (el, close) => {
      el.classList.add('menu');
      for (const it of items) {
        if (!it) continue;
        if (it === '-') { el.append(h('div', { class: 'menu-sep' })); continue; }
        if (it.header) { el.append(h('div', { class: 'menu-header', text: it.header })); continue; }
        if (it.element) { el.append(it.element); continue; }
        const row = h('div', { class: 'menu-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '') + (it.checked ? ' checked' : ''), title: it.title || '' },
          opts.checks ? h('span', { class: 'mi-check', html: it.checked ? svg('check', 14) : '' }) : null,
          it.icon ? icon(it.icon, 15, 'mi-icon') : null,
          h('div', { class: 'mi-body' }, h('div', { class: 'mi-label ellipsis', text: it.label }), it.desc ? h('div', { class: 'mi-desc', text: it.desc }) : null),
          it.kbd ? h('kbd', { text: it.kbd }) : null);
        if (!it.disabled) row.onclick = (e) => { e.stopPropagation(); close(); it.onClick && it.onClick(); };
        el.append(row);
      }
    }, opts);
  }
  const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }) });

  // ---------- Toast / modal ----------
  function toast(text, kind) {
    const box = document.getElementById('toasts');
    if ([...box.children].some((x) => !x.classList.contains('m-out') && x.textContent === String(text))) return;
    const t = h('div', { class: 'toast ' + (kind === true ? 'error' : kind || '') , text });
    box.append(t);
    // tắt: trượt lên + mờ, các thông báo bên dưới dồn lên theo (tắt hiệu ứng → gỡ ngay)
    setTimeout(() => {
      const M = CG.motion;
      if (!M || !M.on || !M.on() || !t.animate || !t.isConnected) return t.remove();
      t.classList.add('m-out');
      const a = t.animate([{ opacity: 1, transform: 'none', marginTop: '0px' }, { opacity: 0, transform: 'translateY(-8px) scale(.96)', marginTop: -(t.offsetHeight + 8) + 'px' }], { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      a.onfinish = a.oncancel = () => t.remove();
      setTimeout(() => t.remove(), 400); // cửa sổ bị ẩn giữa chừng → animation dừng, vẫn gỡ
    }, kind === true || kind === 'error' ? 6000 : 3200);
  }
  function modal(title, body, actions, opts = {}) {
    const root = document.getElementById('modal-root');
    const close = () => { root.innerHTML = ''; };
    const box = h('div', { class: 'modal ' + (opts.cls || '') }, title ? h('h2', { text: title }) : null, body, actions && actions.length ? h('div', { class: 'modal-actions' }, actions) : null);
    const bg = h('div', { class: 'modal-bg' }, box);
    bg.onmousedown = (e) => { if (e.target === bg) close(); };
    root.innerHTML = '';
    root.append(bg);
    return { close, box };
  }
  function confirmDialog(title, text, okLabel = 'Đồng ý', danger) {
    return new Promise((resolve) => {
      let m;
      const ok = h('button', { class: 'btn ' + (danger ? 'danger-solid' : 'primary'), text: okLabel, onclick: () => { m.close(); resolve(true); } });
      const cancel = h('button', { class: 'btn', text: 'Hủy', onclick: () => { m.close(); resolve(false); } });
      m = modal(title, h('p', { class: 'modal-text', text }), [cancel, ok]);
      ok.focus();
    });
  }
  function promptDialog(title, value, placeholder) {
    return new Promise((resolve) => {
      let m;
      const input = h('input', { type: 'text', class: 'text-input', value: value || '', placeholder: placeholder || '' });
      const ok = h('button', { class: 'btn primary', text: 'Lưu', onclick: () => { m.close(); resolve(input.value.trim()); } });
      const cancel = h('button', { class: 'btn', text: 'Hủy', onclick: () => { m.close(); resolve(null); } });
      input.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) ok.click(); };
      m = modal(title, input, [cancel, ok]);
      input.focus();
      input.select();
    });
  }

  Object.assign(CG, {
    $, $$, h, svg, icon, P, logo, logoSvg, hydrate,
    basename, dirname, samePath, shortPath, fmtTok, stripAnsi, stripReminders, relTime, firstLine, rid,
    renderMd, copyBtn, mdEl, MODES, EFFORTS, effortLabel, toolMeta, toolSummary,
    lineDiff, rowsView, diffView, patchRows, patchCounts, unifiedRows, hunksFromStrings,
    todoView, preBlock, toolInputView, resultText, resultView, permTitle, suggestionLabel,
    popover, closePopover, menu, pointAnchor, toast, modal, confirmDialog, promptDialog,
  });
})();
