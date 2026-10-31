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
