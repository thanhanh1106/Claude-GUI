'use strict';
// Thu nhỏ khung xem / terminal thành ô nhỏ nổi ở góc, vẫn chạy trực tiếp (giống nút minimize của bản desktop).
// Không chuyển phần tử sang chỗ khác (webview sẽ tải lại) — giữ nguyên kích thước, chỉ đặt position: fixed + scale.
(() => {
  const CG = window.CG;
  const api = window.api;
  const { $, h, svg, icon, toast } = CG;
  const S = () => CG.S;
  const TILE_W = 330, TILE_H = 300, GAP = 12;
  const MS = 'cg.miniPanes';
  const store = (() => { try { return JSON.parse(localStorage.getItem(MS)) || {}; } catch { return {}; } })();
  const st = { vwKeys: new Set(store.vw || []), term: !!store.term, corner: store.corner || 'br' };
  const save = () => { try { localStorage.setItem(MS, JSON.stringify({ vw: [...st.vwKeys].slice(-50), term: st.term, corner: st.corner })); } catch {} };
  const els = {};
  const vk = () => { const k = CG.viewer && CG.viewer.state && CG.viewer.state.key; return k == null ? '_' : String(k); };
  const panes = () => [els.vw, els.term].filter((p) => p && p.el.classList.contains('cg-mini'));

  function cover(p, label) {
    const c = h('div', { class: 'mini-cover', title: 'Bấm để mở lại · kéo để đổi góc' }, h('div', { class: 'mini-lbl' }, icon(p.kind === 'vw' ? 'globe' : 'terminal', 13), h('span', { class: 'ellipsis', text: label }), h('span', { class: 'mini-x', html: svg('maximize', 13) })));
    let down = null;
    c.onmousedown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r = p.el.getBoundingClientRect();
      down = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, drag: false };
      const move = (ev) => {
        const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
        if (!down.drag && Math.hypot(dx, dy) < 5) return;
        down.drag = true;
        p.el.style.left = down.l + dx + 'px'; p.el.style.top = down.t + dy + 'px';
      };
      const up = (ev) => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        if (!down.drag) { restore(p.kind); return; }
        const cx = ev.clientX, cy = ev.clientY;
        st.corner = (cy < innerHeight / 2 ? 't' : 'b') + (cx < innerWidth / 2 ? 'l' : 'r');
        save(); layout();
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    };
    return c;
  }
  function label(p) {
    if (p.kind === 'term') return ($('#term-title') && $('#term-title').textContent) || 'Terminal';
    const t = CG.viewer && CG.viewer.state && CG.viewer.state.cur;
    if (!t) return 'Khung xem';
    return t.kind === 'web' ? (t.title || t.url || 'Trang web') : t.kind === 'panel' ? t.label : String(t.path || '').split(/[\\/]/).pop();
  }
  function shrink(p) {
    const el = p.el;
    if (el.classList.contains('cg-mini') || el.classList.contains('hidden')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 30) return;
    p.w = r.width; p.h = r.height; p.s = Math.min(1, TILE_W / r.width, TILE_H / r.height);
    el.style.setProperty('--mini-w', r.width + 'px');
    el.style.setProperty('--mini-h', r.height + 'px');
    el.style.setProperty('--mini-s', p.s);
    el.classList.add('cg-mini');
    if (!p.cover) p.cover = cover(p, '');
    p.cover.querySelector('.mini-lbl span.ellipsis').textContent = label(p);
    el.append(p.cover);
    if (p.kind === 'vw') { const rz = $('#viewer-resize'); if (rz) rz.classList.add('mini-hide'); }
    layout();
  }
  function unshrink(p) {
    const el = p.el;
    if (!el.classList.contains('cg-mini')) return;
    el.classList.remove('cg-mini', 'mini-alert');
    el.style.left = el.style.top = '';
    if (p.cover) p.cover.remove();
    if (p.kind === 'vw') { const rz = $('#viewer-resize'); if (rz) rz.classList.remove('mini-hide'); }
    if (p.kind === 'term') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    layout();
  }
  // xếp các ô nhỏ vào góc đã chọn (chồng lên nhau theo chiều dọc)
  function layout() {
    const list = panes();
    const right = st.corner.endsWith('r'), bottom = st.corner.startsWith('b');
    let off = bottom ? 96 : 56;
    for (const p of list) {
      const w = p.w * p.s, hh = p.h * p.s;
      p.el.style.left = (right ? innerWidth - w - 18 : 18) + 'px';
      p.el.style.top = (bottom ? innerHeight - off - hh : off) + 'px';
      off += hh + GAP;
    }
  }
  function minimize(kind) {
    const p = els[kind];
    if (!p) return;
    if (kind === 'vw') st.vwKeys.add(vk()); else st.term = true;
    save();
    shrink(p);
  }
  function restore(kind) {
    const p = els[kind];
    if (!p) return;
    if (kind === 'vw') st.vwKeys.delete(vk()); else st.term = false;
    save();
    unshrink(p);
  }
  // gọi khi đổi phiên / mở / đóng khung: khung xem nhớ thu nhỏ theo từng phiên, terminal dùng chung
  function sync() {
    const v = els.vw;
    if (v) {
      const want = st.vwKeys.has(vk()) && !v.el.classList.contains('hidden');
      if (want) { if (!v.el.classList.contains('cg-mini')) requestAnimationFrame(() => shrink(v)); else if (v.cover) v.cover.querySelector('.mini-lbl span.ellipsis').textContent = label(v); }
      else unshrink(v);
    }
    const t = els.term;
    if (t) {
      if (st.term && !t.el.classList.contains('hidden')) { if (!t.el.classList.contains('cg-mini')) requestAnimationFrame(() => shrink(t)); }
      else unshrink(t);
    }
  }
  function init() {
    const vw = $('#viewer'), tp = $('#term-panel');
    if (vw) {
      els.vw = { kind: 'vw', el: vw };
      const b = h('button', { id: 'vw-min', class: 'icon-btn sm', title: 'Thu nhỏ thành ô nhỏ ở góc (vẫn chạy)', html: svg('minus', 15) });
      b.onclick = () => minimize('vw');
      $('#vw-close').before(b);
    }
    if (tp) {
      els.term = { kind: 'term', el: tp };
      const b = h('button', { id: 'term-min', class: 'icon-btn sm', title: 'Thu nhỏ thành ô nhỏ ở góc (vẫn chạy)', html: svg('minus', 14) });
      b.onclick = () => minimize('term');
      $('#term-close').before(b);
      // terminal đang thu nhỏ mà in ra lỗi → ô nhỏ viền đỏ
      api.onPtyData((id, d) => {
        if (!tp.classList.contains('cg-mini')) return;
        if (/\b(error|exception|failed|fatal|traceback)\b|lỗi/i.test(String(d).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''))) tp.classList.add('mini-alert');
      });
    }
    // khung bị ẩn / hiện (đổi phiên, đóng khung, bật terminal…) → đồng bộ
    const mo = new MutationObserver(() => sync());
    if (vw) mo.observe(vw, { attributes: true, attributeFilter: ['class'] });
    if (tp) mo.observe(tp, { attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', () => layout());
    setTimeout(sync, 800);
  }
  CG.minipane = { minimize, restore, sync, layout, get state() { return st; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
