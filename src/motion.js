'use strict';
// Hiệu ứng chuyển động (kiểu "Trượt mềm"): chuyển phiên, viên chọn ở thanh bên trượt theo, tiêu đề đổi chữ,
// tin nhắn bay từ ô nhập lên, thẻ công cụ mở/thu mượt, bảng chi tiết trượt vào, cây phiên con mở dần.
// Tắt hết khi bật "Giảm hiệu ứng". Hộp thoại / thông báo nhỏ dùng CSS (styles.css).
(() => {
  const CG = window.CG;
  const { $ } = CG;
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const on = () => !(CG.decor && CG.decor.cfg().reduceMotion) && !document.hidden;
  const anim = (el, kf, o) => { try { return el.animate(kf, { easing: EASE, ...o }); } catch { return null; } };

  // ----- chuyển phiên: gọi before() trước khi đổi, after() sau khi đã dựng xong phiên mới
  function before() {
    const a = document.querySelector('#session-list .sess.active');
    return { pill: a ? a.getBoundingClientRect() : null };
  }
  function after(conv, cap) {
    if (!on()) return;
    // viên chọn trượt từ phiên cũ sang phiên mới
    const nu = document.querySelector('#session-list .sess.active');
    if (cap && cap.pill && nu) {
      const r = nu.getBoundingClientRect();
      if (Math.abs(r.top - cap.pill.top) > 2 && r.height > 0) {
        // chèn vào đầu danh sách (vẽ dưới các dòng phiên), toạ độ theo danh sách đang cuộn
        const list = $('#session-list'), lr = list.getBoundingClientRect();
        if (getComputedStyle(list).position === 'static') list.style.position = 'relative';
        const ghost = document.createElement('div');
        ghost.className = 'm-pill';
        Object.assign(ghost.style, { left: r.left - lr.left + list.scrollLeft + 'px', top: r.top - lr.top + list.scrollTop + 'px', width: r.width + 'px', height: r.height + 'px' });
        list.prepend(ghost);
        nu.classList.add('m-pill-hide');
        const a = anim(ghost, [{ transform: `translateY(${cap.pill.top - r.top}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.25,.5,1)' });
        const done = () => { ghost.remove(); nu.classList.remove('m-pill-hide'); };
        if (a) a.onfinish = a.oncancel = done; else done();
      }
    }
    // tiêu đề: chữ mới trôi lên
    const t = $('#chat-title');
    if (t) anim(t, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
    // nội dung: các khối đang thấy hiện lần lượt từ dưới lên (so le 35ms)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const sc = $('#scroller');
      if (!conv || !conv.root || !sc) return;
      const vr = sc.getBoundingClientRect();
      const kids = [...conv.root.children].filter((k) => { const r = k.getBoundingClientRect(); return r.height > 0 && r.bottom > vr.top && r.top < vr.bottom; }).slice(-8);
      kids.forEach((k, i) => anim(k, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 40 + 35 * i, fill: 'backwards' }));
    }));
  }

  // ----- tin nhắn vừa gửi bay từ ô nhập lên đúng chỗ
  function fly(el) {
    if (!on() || !el) return;
    const b = el.querySelector('.bubble') || el, src = $('#input');
    if (!src) return;
    requestAnimationFrame(() => {
      const to = b.getBoundingClientRect(), from = src.getBoundingClientRect();
      if (!to.height) return;
      anim(b, [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(.96)`, opacity: .35 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1.05)' });
    });
  }

  // ----- thẻ công cụ mở/thu: chiều cao chạy mượt (gọi sau khi đã toggle class 'open')
  function tool(el) {
    if (!on()) return;
    const body = el.querySelector(':scope > .tool-body');
    if (!body) return;
    if (el.classList.contains('open')) {
      const hh = body.scrollHeight;
      anim(body, [{ height: '0px', opacity: 0, overflow: 'hidden' }, { height: hh + 'px', opacity: 1, overflow: 'hidden' }], { duration: Math.min(320, 160 + hh / 6) });
    } else {
      // đã ẩn bằng CSS → dựng lại tạm để thu dần
      el.classList.add('open', 'm-closing');
      const hh = body.scrollHeight;
      const a = anim(body, [{ height: hh + 'px', opacity: 1, overflow: 'hidden' }, { height: '0px', opacity: 0, overflow: 'hidden' }], { duration: Math.min(260, 140 + hh / 8) });
      const done = () => el.classList.remove('open', 'm-closing');
      if (a) a.onfinish = a.oncancel = done; else done();
    }
  }

  // ----- bảng chi tiết trượt vào, các thẻ hiện so le
  function details(opening) {
    if (!on() || !opening) return;
    const d = $('#details');
    if (!d) return;
    anim(d, [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    [...d.querySelectorAll('#details-body > .d-card')].slice(0, 6).forEach((c, i) => anim(c, [{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 60 + 45 * i, fill: 'backwards' }));
  }

  // ----- cây phiên con vừa mở: các dòng con hiện dần
  function tree(rows) {
    if (!on()) return;
    rows.forEach((r, i) => anim(r, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: 28 * i, fill: 'backwards' }));
  }

  CG.motion = { on, before, after, fly, tool, details, tree };
})();

// =====================================================================
// 1.19 · Bộ animation bổ sung (demo/animations.html). Chỉ gắn vào DOM có sẵn bằng MutationObserver —
// không đổi logic của app. Tắt hết khi "Giảm hiệu ứng" / cửa sổ ẩn (CG.motion.on()); CSS ở anim.css.
// Nguyên tắc rẻ: lọc bản ghi mutation thật sớm theo target, không animate khi một đợt thêm > 3 khối
// (đang dựng lịch sử) hoặc body có class m-hist, chỉ animate transform / opacity trừ vài chỗ một lần.
// =====================================================================
(() => {
  const CG = window.CG;
  const M = CG.motion;
  const on = () => M.on();
  const EASE = 'cubic-bezier(.2,.8,.2,1)', SPRING = 'cubic-bezier(.3,1.5,.5,1)', OUT = 'cubic-bezier(.4,0,1,1)';
  const A = (el, kf, d, o = {}) => { try { return el.animate(kf, { duration: d, easing: o.easing || EASE, fill: o.fill || 'none', delay: o.delay || 0, iterations: o.iterations || 1 }); } catch { return null; } };
  const $ = (s, r = document) => r.querySelector(s);
  const isEl = (n) => n && n.nodeType === 1;
  const watch = (el, fn, opt) => { if (!el) return null; const o = new MutationObserver(fn); o.observe(el, opt); return o; };
  const hist = () => document.body.classList.contains('m-hist');
  const check = (sz) => (CG.svg ? CG.svg('check', sz) : '✓');
  // vẽ nét dấu tick (svg check của lib.js) bằng stroke-dashoffset
  function drawTick(root, delay = 0) {
    if (!root) return;
    for (const p of root.querySelectorAll('path, polyline, line')) { p.setAttribute('pathLength', '1'); p.style.strokeDasharray = '1'; A(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], 320, { delay, fill: 'backwards' }); }
  }
  // số đếm dần lên (giữ tiền tố / hậu tố quanh con số đầu tiên)
  function countUp(el, d = 500) {
    const m = /^(\D*)(\d+)(.*)$/s.exec(el.textContent || '');
    if (!m || !on()) return;
    const to = +m[2];
    if (to < 2) return;
    const t0 = performance.now();
    const step = (t) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - t0) / d);
      el.textContent = m[1] + Math.round(to * (1 - Math.pow(1 - k, 3))) + m[3];
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------
  // Danh sách có khoá → FLIP (dòng đổi chỗ trượt mượt), dòng mới hiện vào, dòng mất trượt ra (bóng ma)
  // Lưu toạ độ (theo nội dung của root, không phụ thuộc cuộn) sau mỗi lần dựng lại; lần dựng sau so sánh.
  // ---------------------------------------------------------------------
  function flipList(root, o) {
    let snap = new Map();
    const take = () => {
      const rr = root.getBoundingClientRect(), m = new Map();
      for (const el of root.querySelectorAll(o.sel)) {
        const k = o.key(el);
        if (!k || m.has(k)) continue;
        const r = el.getBoundingClientRect();
        m.set(k, { top: r.top - rr.top + root.scrollTop, left: r.left - rr.left + root.scrollLeft, w: r.width, h: r.height, info: o.info ? o.info(el) : null });
      }
      return m;
    };
    const touches = (nodes) => { for (const n of nodes) if (isEl(n) && (n.matches(o.sel) || n.querySelector(o.sel))) return true; return false; };
    function scan(recs) {
      if (recs && !recs.some((r) => r.type === 'childList' && (touches(r.addedNodes) || touches(r.removedNodes)))) return;
      const prev = snap;
      if (!root.isConnected || root.offsetParent === null) { snap = new Map(); return; }
      const now = take();
      snap = now;
      if (!prev.size || !on() || (o.skip && o.skip())) return;
      const added = [], gone = [];
      for (const k of now.keys()) if (!prev.has(k)) added.push(k);
      for (const k of prev.keys()) if (!now.has(k)) gone.push(k);
      if (added.length + gone.length > (o.maxChange || 30)) return;
      const rr = root.getBoundingClientRect();
      const els = new Map();
      for (const el of root.querySelectorAll(o.sel)) { const k = o.key(el); if (k && !els.has(k)) els.set(k, el); }
      let moved = 0;
      for (const [k, el] of els) {
        const p = prev.get(k), n = now.get(k);
        if (!p) continue;
        const dx = p.left - n.left, dy = p.top - n.top;
        if ((Math.abs(dy) > 1 || Math.abs(dx) > 1) && Math.abs(dy) < 900 && moved++ < 60) A(el, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], o.dur || 300);
        if (o.change) o.change(el, p.info, n.info);
      }
      if (o.enter && added.length <= (o.maxEnter || 2)) added.forEach((k, i) => { const el = els.get(k); if (el) o.enter(el, i, now.get(k)); });
      if (o.bulkEnter && added.length > (o.maxEnter || 2)) o.bulkEnter(added.map((k) => els.get(k)).filter(Boolean), prev, now);
      if (o.leave && gone.length && gone.length <= 2 && recs) {
        for (const r of recs) for (const n of r.removedNodes) {
          if (!isEl(n)) continue;
          const cands = n.matches(o.sel) ? [n] : [...n.querySelectorAll(o.sel)];
          for (const el of cands) { const k = o.key(el); if (gone.includes(k)) o.leave(el, prev.get(k), rr); }
        }
      }
    }
    return { scan, reset: () => { snap = new Map(); } };
  }
  // bóng ma của phần tử vừa bị gỡ: đặt lại đúng chỗ cũ (tuyệt đối trong root), không nhận chuột, mờ dần rồi bỏ
  function ghostAt(root, el, p, kf, d) {
    el.classList.remove('active', 'on', 'sel');
    el.removeAttribute('data-sid');
    el.classList.add('m-ghost');
    Object.assign(el.style, { position: 'absolute', top: p.top + 'px', left: p.left + 'px', width: p.w + 'px', height: p.h + 'px', margin: '0', pointerEvents: 'none', zIndex: '0' });
    root.append(el);
    const a = A(el, kf, d, { easing: OUT, fill: 'forwards' });
    const done = () => el.remove();
    if (a) { a.onfinish = a.oncancel = done; setTimeout(done, d + 150); } else done();
  }

  // ---------------------------------------------------------------------
  // Hộp thoại / menu: hiệu ứng lúc đóng. Mọi cách đóng (close(), Esc, innerHTML = '') đều đi qua việc gỡ
  // khỏi DOM → bắt bằng observer, đưa phần tử sang lớp #m-ghosts (đổi tên class để không ai query trúng),
  // giữ nguyên dáng bằng style tính sẵn rồi mờ dần.
  // ---------------------------------------------------------------------
  let ghosts = null;
  const ghostLayer = () => { if (!ghosts || !ghosts.isConnected) { ghosts = document.createElement('div'); ghosts.id = 'm-ghosts'; document.body.append(ghosts); } return ghosts; };
  const FREEZE = ['position', 'left', 'top', 'right', 'bottom', 'width', 'height', 'minWidth', 'maxWidth', 'maxHeight', 'zIndex', 'backgroundColor', 'backgroundImage', 'border', 'borderRadius', 'boxShadow', 'padding', 'display', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'overflow', 'color', 'fontSize', 'fontWeight', 'margin'];
  function freeze(el) { const cs = getComputedStyle(el); const s = {}; for (const k of FREEZE) s[k] = cs[k]; Object.assign(el.style, s, { animation: 'none' }); }
  function rename(el, from, to) { if (el.classList.contains(from)) { el.classList.remove(from); el.classList.add(to); } }
  function closeGhost(el, kind) {
    const L = ghostLayer();
    L.append(el);
    if (kind === 'modal') {
      const box = el.querySelector('.modal');
      const subs = box ? [...box.querySelectorAll(':scope > h2')] : [];
      freeze(el); if (box) freeze(box); subs.forEach(freeze);
      rename(el, 'modal-bg', 'm-g-bg'); if (box) rename(box, 'modal', 'm-g-modal');
      A(el, [{ opacity: 1 }, { opacity: 0 }], 180, { easing: OUT, fill: 'forwards' });
      const a = A(box || el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], 160, { easing: OUT, fill: 'forwards' });
      setTimeout(() => el.remove(), 200);
      return a;
    }
    freeze(el);
    rename(el, 'popover', 'm-g-pop'); rename(el, 'menu', 'm-g-menu');
    A(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-3px) scale(.98)' }], 110, { easing: OUT, fill: 'forwards' });
    setTimeout(() => el.remove(), 130);
  }
  // menu vừa mở: các mục hiện so le
  function menuIn(el) {
    const items = [...el.querySelectorAll(':scope > .menu-item, :scope > .menu-header, :scope > .menu-sep')].slice(0, 16);
    items.forEach((it, i) => A(it, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], 150, { delay: 12 * i, fill: 'backwards' }));
  }
  // thanh hạn mức đầy dần + số % đếm lên (khi popover / hộp thoại mức sử dụng mở)
  function barsIn(root) {
    const bars = [...root.querySelectorAll('.ubar > i')].slice(0, 12);
    bars.forEach((b, i) => { const w = b.style.width; if (w && w !== '0%') A(b, [{ width: '0%' }, { width: w }], 600, { delay: 80 * i, fill: 'backwards' }); });
    if (bars.length) [...root.querySelectorAll('.u-row .u-val')].slice(0, 12).forEach((v, i) => setTimeout(() => countUp(v, 600), 80 * i));
  }
  watch(document.body, (recs) => {
    for (const r of recs) {
      if (on()) for (const n of r.removedNodes) if (isEl(n) && n.classList.contains('popover') && !n.isConnected) closeGhost(n, 'pop');
      if (on()) for (const n of r.addedNodes) if (isEl(n) && n.classList.contains('popover')) { if (n.classList.contains('menu')) menuIn(n); barsIn(n); }
    }
  }, { childList: true });
  watch($('#modal-root'), (recs) => {
    if (!on()) return;
    for (const r of recs) {
      for (const n of r.removedNodes) if (isEl(n) && n.classList.contains('modal-bg') && !n.isConnected) closeGhost(n, 'modal');
      for (const n of r.addedNodes) if (isEl(n) && n.classList.contains('modal-bg')) barsIn(n);
    }
  }, { childList: true });

  // ---------------------------------------------------------------------
  // Thanh bên: FLIP khi phiên chèn / đổi chỗ, dòng mới hiện vào, dòng bị lưu trữ trượt ra,
  // chấm chạy → tick xanh, huy hiệu nảy, tên phiên tự đổi, nhóm dự án mở ra (dòng hiện so le)
  // ---------------------------------------------------------------------
  const BADGES = ['s-lark', 's-vw', 's-xs', 's-ar'];
  const sessKey = (el) => (el.classList.contains('grp-head') ? 'g:' + (el.title || '') + '|' + ((el.querySelector('.g-name') || {}).textContent || '') : el.dataset.sid ? 's:' + el.dataset.sid : null);
  function sessInfo(el) {
    if (el.classList.contains('grp-head')) return { col: el.classList.contains('collapsed') };
    const st = el.querySelector(':scope > .st');
    return { st: st ? st.className : '', title: (el.querySelector('.s-title') || {}).textContent || '', b: BADGES.filter((c) => el.querySelector(':scope > .' + c)).join(' ') };
  }
  function sessDone(row) {
    const st = row.querySelector(':scope > .st');
    if (!st) return;
    const m = document.createElement('span');
    m.className = 'm-done';
    m.innerHTML = check(11) + '<i></i>';
    Object.assign(m.style, { left: st.offsetLeft + st.offsetWidth / 2 - 8 + 'px', top: st.offsetTop + st.offsetHeight / 2 - 8 + 'px' });
    row.append(m);
    A(m.querySelector('svg'), [{ transform: 'scale(.3)' }, { transform: 'none' }], 400, { easing: SPRING });
    drawTick(m);
    A(m.querySelector('i'), [{ transform: 'scale(.6)', opacity: 0.9 }, { transform: 'scale(2.2)', opacity: 0 }], 600, { fill: 'forwards' });
    A(m, [{ opacity: 1 }, { opacity: 0 }], 400, { delay: 1400, fill: 'forwards' });
    setTimeout(() => m.remove(), 1900);
  }
  const SB = $('#session-list') && flipList($('#session-list'), {
    sel: '.sess[data-sid], .grp-head',
    key: sessKey, info: sessInfo, maxChange: 40,
    skip: () => { const q = $('#session-search'); return !!(q && q.value.trim()); },
    change(el, a, b) {
      if (!a || !b || el.classList.contains('grp-head')) return;
      if (a.title && b.title && a.title !== b.title) { const t = el.querySelector('.s-title'); if (t) A(t, [{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }], 300); }
      if (/\b(run|wait)\b/.test(a.st) && !/\b(run|wait)\b/.test(b.st)) sessDone(el);
      for (const c of BADGES) if (b.b.includes(c) && !a.b.includes(c)) { const x = el.querySelector(':scope > .' + c); if (x) A(x, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], 350, { easing: SPRING }); }
    },
    enter(el) { if (!el.classList.contains('grp-head')) { el.classList.add('m-new'); setTimeout(() => el.classList.remove('m-new'), 1100); } },
    // nhóm vừa mở ra → các dòng của nhóm hiện so le (nhóm khác đã trượt xuống nhờ FLIP)
    bulkEnter(els, prev) {
      for (const head of document.querySelectorAll('#session-list .grp-head:not(.collapsed)')) {
        const p = prev.get(sessKey(head));
        if (!p || !p.info || !p.info.col) continue;
        let n = head.nextElementSibling, i = 0;
        while (n && !n.classList.contains('grp-head') && i < 14) { A(n, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], 200, { delay: 30 * i, fill: 'backwards' }); n = n.nextElementSibling; i++; }
      }
    },
    leave(el, p) { if (!el.classList.contains('grp-head')) ghostAt($('#session-list'), el, p, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-40px)' }], 240); },
  });
  if (SB) watch($('#session-list'), SB.scan, { childList: true, subtree: true });

  // ---------------------------------------------------------------------
  // Khung chat: khối mới trồi lên, thẻ xin quyền, thẻ lỗi rung, số +/− đếm, diff vừa sửa loé, chip "tin mới"
  // ---------------------------------------------------------------------
  const sc = $('#scroller');
  let unseen = 0, chip = null;
  function chipEl() {
    if (chip && chip.isConnected) return chip;
    const col = $('#chat-col');
    if (!col) return null;
    chip = document.createElement('button');
    chip.className = 'm-newchip hidden';
    chip.innerHTML = '<span class="m-ar">↓</span><span class="m-lb"></span>';
    chip.onclick = () => { sc.scrollTo({ top: sc.scrollHeight, behavior: on() ? 'smooth' : 'auto' }); };
    col.append(chip);
    return chip;
  }
  // Không đọc layout sau khi DOM khung chat đổi (phiên lớn → forced layout hàng trăm ms): khoảng cách tới đáy
  // và chiều cao ô nhập chỉ đo trong sự kiện cuộn (throttle 120 ms, bỏ qua lúc đang nạp lịch sử);
  // observer chỉ dùng giá trị đã lưu.
  let dist = 0, cwH = 80, scT = 0;
  function measure() {
    scT = 0;
    if (!sc) return;
    if (hist()) { scT = setTimeout(measure, 150); return; } // đang nạp lịch sử: đo lại sau
    dist = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
    const cw = $('#composer-wrap');
    if (cw) cwH = cw.offsetHeight;
    paintChip();
  }
  function paintChip() {
    const c = chipEl();
    if (!c || !sc) return;
    if (dist < 120) unseen = 0;
    const show = !document.querySelector('#main.hero') && (unseen > 0 || dist > 1400);
    if (show) {
      c.querySelector('.m-lb').textContent = unseen > 0 ? `${unseen} tin mới` : 'Xuống cuối';
      c.style.bottom = cwH + 12 + 'px';
    }
    if (show === !c.classList.contains('hidden')) return;
    c.classList.toggle('hidden', !show);
    if (show && on()) {
      A(c, [{ opacity: 0, transform: 'translate(-50%, 18px) scale(.8)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], 350, { easing: SPRING });
      if (unseen) A(c.querySelector('.m-ar'), [{ transform: 'none' }, { transform: 'translateY(3px)' }, { transform: 'none' }], 700, { iterations: 3, delay: 350 });
    }
  }
  if (sc) sc.addEventListener('scroll', () => { if (!scT) scT = setTimeout(measure, 120); }, { passive: true });

  function permIn(el) {
    A(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], 300);
    A(el, [{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent)' }, { boxShadow: '0 0 0 5px color-mix(in srgb, var(--accent) 35%, transparent)' }, { boxShadow: '0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent)' }], 900, { delay: 250 });
  }
  // thẻ xin quyền đã trả lời: thu thành một dòng — mờ / trượt nhẹ (không đo chiều cao để tránh forced layout)
  function permDone(el) {
    A(el, [{ opacity: 0.4, transform: 'scaleY(.92)', transformOrigin: 'top' }, { opacity: 1, transform: 'none', transformOrigin: 'top' }], 240);
    const ic = el.querySelector('.perm-title .ic');
    if (ic) A(ic, [{ transform: 'scale(.3)' }, { transform: 'none' }], 380, { easing: SPRING, delay: 120, fill: 'backwards' });
  }
  function shake(el) {
    A(el, [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }], 400, { easing: 'ease-out' });
    A(el, [{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--err) 45%, transparent)' }, { boxShadow: '0 0 0 0 transparent' }], 700);
  }
  function flashDiff(d) { d.classList.add('m-flash'); setTimeout(() => d.classList.remove('m-flash'), 1000); }
  const conversations = $('#conversations');
  watch(conversations, (recs) => {
    if (hist()) return;
    const live = on();
    const blocks = [];
    for (const r of recs) {
      const t = r.target;
      if (r.type === 'attributes') { if (live && t.classList.contains('perm') && t.classList.contains('done') && !/\bdone\b/.test(r.oldValue || '')) permDone(t); continue; }
      if (!r.addedNodes.length) continue;
      const cl = t.classList;
      if (cl.contains('turn') || cl.contains('conv')) { for (const n of r.addedNodes) if (isEl(n)) blocks.push(n); continue; }
      if (!live) continue;
      if (cl.contains('t-stat')) { for (const n of r.addedNodes) if (isEl(n) && n.classList.contains('cnt')) { n.querySelectorAll('.add, .del').forEach((x) => countUp(x, 500)); const card = n.closest('.tool'); if (card) card._mFresh = Date.now(); } continue; }
      if (cl.contains('md-part') || cl.contains('md')) continue; // chữ đang stream: bỏ qua thật sớm
      const card = t.closest && t.closest('.tool');
      if (card && card._mFresh && Date.now() - card._mFresh < 8000) for (const n of r.addedNodes) if (isEl(n)) { const d = n.matches('.diff') ? n : n.querySelector('.diff'); if (d) flashDiff(d); }
    }
    if (!blocks.length || blocks.length > 3 || hist()) return;
    if (document.getElementById('main').classList.contains('hero')) return;
    let fresh = 0;
    // lượt mới chỉ chứa thẻ xin quyền / thẻ lỗi → dùng hiệu ứng riêng của thẻ thay cho "trồi lên" của cả lượt
    for (const b of blocks) if (blocks.includes(b.parentElement) && (b.classList.contains('perm') || b.classList.contains('errbox'))) { blocks.splice(blocks.indexOf(b.parentElement), 1); break; }
    for (const b of blocks) {
      if (blocks.includes(b.parentElement)) continue;
      // phiên đang ẩn: kiểm tra bằng class (không đọc layout)
      const cv = b.classList.contains('conv') ? b : b.closest('.conv');
      if (!cv || cv.classList.contains('hidden') || cv.parentElement !== conversations) continue;
      fresh++;
      if (!live || b.classList.contains('msg-user') || b.querySelector(':scope > .msg-user')) continue;
      if (b.classList.contains('perm') && !b.classList.contains('done')) permIn(b);
      else if (b.classList.contains('errbox')) { A(b, [{ opacity: 0 }, { opacity: 1 }], 160); shake(b); }
      else if (!b.classList.contains('msg-actions')) A(b, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 220);
    }
    if (fresh && sc && dist > 120) { unseen += fresh; paintChip(); }
  }, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  // ---------------------------------------------------------------------
  // Chữ đang stream: vài ký tự cuối mờ dần như mực đang thấm (gọi từ SmoothText.render, rất rẻ:
  // chỉ tách 1 nút chữ cuối). active = còn chữ chờ hiện; hết chờ thì tự gỡ sau 140 ms.
  // ---------------------------------------------------------------------
  function ink(tail, active) {
    if (!tail) return;
    clearTimeout(tail._mInk);
    if (!active || !on()) return;
    const w = document.createTreeWalker(tail, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = w.nextNode())) if (n.nodeValue.trim()) last = n;
    if (!last || last.parentElement.closest('pre, code, .katex')) return;
    const v = last.nodeValue.replace(/\s+$/, '');
    if (v.length < 2) return;
    const k = Math.min(6, v.length);
    const part = last.splitText(v.length - k);
    const sp = document.createElement('span');
    sp.className = 'm-ink';
    part.replaceWith(sp);
    sp.append(part);
    tail._mInk = setTimeout(() => { if (sp.isConnected) sp.replaceWith(...sp.childNodes); }, 140);
  }

  // ---------------------------------------------------------------------
  // Việc cần làm (bảng chi tiết): việc vừa xong → tick nảy + gạch ngang chạy; Git: tệp bay sang "Đã stage"
  // ---------------------------------------------------------------------
  const todoSt = new Map();
  function scanTodos(root) {
    const lis = root.querySelectorAll('.todos li');
    if (!lis.length) return;
    const seen = new Map();
    for (const li of lis) {
      const key = (li.textContent || '').trim();
      const st = li.classList.contains('completed') ? 'completed' : li.classList.contains('in_progress') ? 'in_progress' : 'pending';
      const was = todoSt.get(key);
      seen.set(key, st);
      if (st === 'completed' && was && was !== 'completed' && on()) {
        const box = li.querySelector('.box');
        if (box) { A(box, [{ transform: 'scale(.3)' }, { transform: 'none' }], 380, { easing: SPRING }); drawTick(box); }
        li.classList.add('m-strk'); setTimeout(() => li.classList.remove('m-strk'), 700);
      }
    }
    if (seen.size) { todoSt.clear(); for (const [k, v] of seen) todoSt.set(k, v); }
  }
  const GP = $('#details') && flipList($('#details'), { sel: '.gp-f', key: (el) => el.title || null, maxChange: 30, dur: 320 });
  watch($('#details'), (recs) => {
    if (!recs.some((r) => r.addedNodes.length)) return;
    scanTodos($('#details'));
    if (GP) GP.scan(recs);
  }, { childList: true, subtree: true });

  // ---------------------------------------------------------------------
  // Ô nhập: giãn mượt khi cao lên (thu nhỏ thì tức thì — tránh đo sai chiều cao trong lúc đang chạy)
  // ---------------------------------------------------------------------
  const inp = $('#input');
  let lastH = inp ? parseFloat(inp.style.height) || 0 : 0;
  watch(inp, () => {
    const hh = parseFloat(inp.style.height) || 0;
    if (on() && lastH && hh - lastH > 4 && hh - lastH < 400) A(inp, [{ height: lastH + 'px' }, { height: hh + 'px' }], 120);
    if (hh) lastH = hh;
  }, { attributes: true, attributeFilter: ['style'] });

  // nút Gửi ↔ Dừng: biểu tượng xoay vào; vòng chạy quanh nút khi đang làm là CSS (.send.stop::after)
  const send = $('#btn-send');
  let wasStop = send ? send.classList.contains('stop') : false;
  watch(send, () => {
    const st = send.classList.contains('stop');
    if (st === wasStop) return;
    wasStop = st;
    const s = send.querySelector('svg');
    if (s && on()) A(s, [{ transform: `rotate(${st ? 90 : -90}deg) scale(.3)`, opacity: 0 }, { transform: 'none', opacity: 1 }], 240, { easing: SPRING });
  }, { attributes: true, attributeFilter: ['class'] });

  // chế độ / model: chữ mới trôi lên khi đổi
  for (const id of ['#ctl-mode-name', '#ctl-model-name']) {
    const el = $(id);
    if (!el) continue;
    let last = el.textContent;
    watch(el, () => {
      const v = el.textContent;
      if (v === last) return;
      const had = last;
      last = v;
      if (had && on()) A(el, [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], 220);
    }, { childList: true, characterData: true, subtree: true });
  }

  // tệp đính kèm: chip mới phóng vào, chip bị bỏ co lại (bóng ma tại chỗ cũ, các chip khác tự dồn)
  const atts = $('#attachments');
  const attKey = (el) => el.title || (el.querySelector('img') || {}).src || el.textContent;
  let attPrev = [];
  watch(atts, (recs) => {
    if (recs.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => isEl(n) && n.classList.contains('m-ghost')))) return;
    const cur = [...atts.children].filter((c) => !c.classList.contains('m-ghost'));
    const keys = cur.map(attKey);
    const prev = attPrev;
    attPrev = keys;
    if (!on() || !prev.length && keys.length > 2) return;
    const fresh = cur.filter((c, i) => !prev.includes(keys[i]));
    if (fresh.length <= 3) fresh.forEach((c, i) => A(c, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], 260, { easing: SPRING, delay: 60 * i, fill: 'backwards' }));
    const goneKeys = prev.filter((k) => !keys.includes(k));
    if (goneKeys.length !== 1 || keys.length === 0) return;
    for (const r of recs) for (const n of r.removedNodes) {
      if (!isEl(n) || attKey(n) !== goneKeys[0]) continue;
      const idx = prev.indexOf(goneKeys[0]);
      n.classList.add('m-ghost');
      n.style.pointerEvents = 'none';
      atts.insertBefore(n, cur[idx] || null);
      const w = n.offsetWidth;
      const a = A(n, [{ opacity: 1, transform: 'none', maxWidth: w + 'px', marginRight: '0px' }, { opacity: 0, transform: 'scale(.6)', maxWidth: '0px', marginRight: '-8px' }], 180, { easing: OUT, fill: 'forwards' });
      const done = () => n.remove();
      if (a) { a.onfinish = a.oncancel = done; setTimeout(done, 330); } else done();
      return;
    }
  }, { childList: true });

  // menu "/" và "@": các mục hiện so le khi mở; nền mục đang chọn trượt theo phím mũi tên
  const ac = $('#ac-menu');
  let acPill = null, acOpen = false;
  function paintAcPill(anim) {
    const sel = ac.querySelector(':scope > .menu-item.sel');
    if (!on() || !sel) { if (acPill) acPill.remove(); acPill = null; if (ac.classList.contains('m-has-pill')) ac.classList.remove('m-has-pill'); return; }
    if (!acPill || !acPill.isConnected) { acPill = document.createElement('div'); acPill.className = 'm-acpill'; ac.prepend(acPill); anim = false; }
    if (!ac.classList.contains('m-has-pill')) ac.classList.add('m-has-pill');
    const top = sel.offsetTop, hh = sel.offsetHeight, old = parseFloat(acPill.style.top);
    acPill.style.top = top + 'px'; acPill.style.height = hh + 'px';
    if (anim && !isNaN(old) && old !== top) A(acPill, [{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], 140);
  }
  const hid = (v) => /\bhidden\b/.test(v || '');
  // bỏ qua mutation do chính đoạn này gây ra (thêm / bỏ nền chọn, class m-has-pill) → không lặp vô hạn
  const mine = (r) => (r.type === 'childList' ? [...r.addedNodes, ...r.removedNodes].every((n) => isEl(n) && n.classList.contains('m-acpill'))
    : r.target === ac ? hid(r.oldValue) === ac.classList.contains('hidden') : r.target.classList.contains('m-acpill'));
  watch(ac, (recs) => {
    if (recs.every(mine)) return;
    const open = !ac.classList.contains('hidden');
    if (open && !acOpen && on()) [...ac.querySelectorAll(':scope > .menu-item')].slice(0, 12).forEach((it, i) => A(it, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 180, { delay: 18 * i, fill: 'backwards' }));
    if (open && !acOpen && on()) A(ac, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 180);
    const onlySel = recs.every((r) => r.type === 'attributes' && r.target !== ac);
    acOpen = open;
    if (open) paintAcPill(onlySel); else if (acPill) { acPill.remove(); acPill = null; }
  }, { childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });

  // ---------------------------------------------------------------------
  // Khung xem trước: giãn ra khi mở; tab mới giãn ra, tab đóng thì các tab còn lại trượt lấp chỗ;
  // tệp tự lưu: "Đã lưu" bật vào khi lưu xong
  // ---------------------------------------------------------------------
  const vw = $('#viewer');
  let vwHidden = vw ? vw.classList.contains('hidden') : true;
  watch(vw, (recs) => {
    for (const r of recs) {
      const t = r.target;
      if (t === vw) {
        const hid = vw.classList.contains('hidden');
        if (hid !== vwHidden && !hid && on()) {
          const w = vw.getBoundingClientRect().width;
          if (w > 0) A(vw, [{ width: '0px', minWidth: '0px', opacity: 0.3 }, { width: w + 'px', minWidth: '0px', opacity: 1 }], 260);
        }
        vwHidden = hid;
      } else if (t.classList.contains('vw-saved') && t.classList.contains('ok') && !/\bok\b/.test(r.oldValue || '') && on()) {
        A(t, [{ opacity: 0, transform: 'translateX(-4px) scale(.9)' }, { opacity: 1, transform: 'none' }], 260, { easing: SPRING });
      }
    }
  }, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
  const tabs = $('#vw-tablist');
  const TB = tabs && flipList(tabs, {
    sel: '.vw-tab', key: (el) => el.title || null, maxChange: 8, dur: 200,
    enter(el) { A(el, [{ maxWidth: '0px', opacity: 0, paddingLeft: '0px', paddingRight: '0px' }, { maxWidth: '200px', opacity: 1 }], 180); },
  });
  if (TB) watch(tabs, TB.scan, { childList: true });

  M.ink = ink;
  M.countUp = countUp;
  M.drawTick = drawTick;
  M.flipList = flipList;
})();
