// Hướng dẫn lần đầu cho Lịch & hàng đợi: hộp "Có gì mới" → tour từng bước (robot dẫn đường) → chọn kế hoạch mẫu.
// Trong app thật: hiện khi settings.lastSeenVersion < phiên bản có tính năng; nút ? để xem lại.
(function () {
  const css = document.createElement('style');
  css.textContent = `
  .newdot { font-size:10px; background:#3ff2ff; color:#06222a; border-radius:5px; padding:0 5px; font-weight:700; margin-left:4px; }
  .t-block { position:fixed; z-index:900; background:rgba(5,7,12,.62); transition:all .35s cubic-bezier(.2,.8,.2,1); }
  .t-hole { position:fixed; z-index:901; border-radius:12px; pointer-events:none; box-shadow:0 0 0 2px #3ff2ff, 0 0 24px 4px rgba(63,242,255,.35); transition:all .35s cubic-bezier(.2,.8,.2,1); }
  .t-hole.pulse { animation:tpulse 1.4s ease-in-out infinite; }
  @keyframes tpulse { 50% { box-shadow:0 0 0 2px #3ff2ff, 0 0 34px 10px rgba(63,242,255,.55); } }
  .t-tip { position:fixed; z-index:902; width:360px; background:#1f232c; color:#e8eaf0; border:1px solid #3a4152; border-radius:14px; padding:14px 16px 12px; box-shadow:0 20px 50px rgba(0,0,0,.5); transition:left .35s cubic-bezier(.2,.8,.2,1), top .35s cubic-bezier(.2,.8,.2,1), opacity .2s; font-size:13.5px; }
  .t-tip .hd { display:flex; gap:12px; align-items:center; margin-bottom:6px; }
  .t-tip .bot { flex:none; width:64px; height:49px; }
  .t-tip h4 { margin:0; font-size:15px; }
  .t-tip p { margin:0 0 10px; color:#c3c8d4; line-height:1.5; }
  .t-tip .act { color:#3ff2ff; font-weight:600; }
  .t-tip .ft { display:flex; align-items:center; gap:8px; }
  .t-tip .dots { display:flex; gap:4px; margin-right:auto; } .t-tip .dots i { width:6px; height:6px; border-radius:50%; background:#3a4152; } .t-tip .dots i.on { background:#3ff2ff; }
  .t-tip button { background:#2a2f3d; border:1px solid #3a4152; color:#e8eaf0; border-radius:8px; padding:5px 12px; cursor:pointer; font:inherit; font-size:13px; }
  .t-tip button.pri { background:#d97757; border-color:#d97757; color:#fff; }
  .t-tip .skip { background:none; border:0; color:#8a90a0; padding:5px 4px; }
  .t-modal-bg { position:fixed; inset:0; z-index:950; background:rgba(5,7,12,.66); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; animation:tfade .25s; }
  @keyframes tfade { from { opacity:0 } }
  .t-modal { width:560px; background:#1f232c; color:#e8eaf0; border:1px solid #3a4152; border-radius:18px; padding:22px 24px; box-shadow:0 30px 80px rgba(0,0,0,.6); animation:tpop .35s cubic-bezier(.2,1.2,.4,1); }
  @keyframes tpop { from { transform:scale(.94) translateY(10px); opacity:0 } }
  .t-modal .top { display:flex; gap:16px; align-items:center; margin-bottom:12px; }
  .t-modal h2 { margin:0; font-size:20px; } .t-modal .ver { color:#8a90a0; font-size:13px; }
  .t-feat { display:grid; grid-template-columns:34px 1fr; gap:4px 10px; padding:9px 0; border-top:1px solid #2c313d; }
  .t-feat .ic { font-size:20px; grid-row:span 2; text-align:center; }
  .t-feat b { font-size:14px; } .t-feat span { color:#aab1c0; font-size:13px; }
  .t-feat.hl b::after { content:"MỚI"; font-size:10px; background:#3ff2ff; color:#06222a; border-radius:5px; padding:0 5px; margin-left:6px; vertical-align:2px; }
  .t-modal .ft { display:flex; gap:10px; justify-content:flex-end; margin-top:14px; }
  .t-modal button { background:#2a2f3d; border:1px solid #3a4152; color:#e8eaf0; border-radius:9px; padding:8px 14px; cursor:pointer; font:inherit; }
  .t-modal button.pri { background:#d97757; border-color:#d97757; color:#fff; }
  .tpl { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; }
  .tpl div { border:1px solid #3a4152; border-radius:12px; padding:11px 12px; cursor:pointer; background:#232733; transition:border-color .15s, transform .15s; }
  .tpl div:hover { border-color:#3ff2ff; transform:translateY(-2px); }
  .tpl b { display:block; margin-bottom:3px; } .tpl span { color:#aab1c0; font-size:12.5px; }
  .tour-show .add { opacity:1 !important; }`;
  if (location.hash.includes('notrans')) css.textContent += '.t-block,.t-hole,.t-tip,.drawer{transition:none!important}';
  document.head.append(css);

  const $ = (s) => document.querySelector(s);
  const nodes = () => document.querySelectorAll('.flow .node:not(.trig)');
  const T = {}; let i = 0, steps = [], guide = null, cleanup = null;

  // ----- các bước
  const STEPS = [
    { el: '#navSched', face: 'done', title: 'Mục mới: Lịch & hàng đợi',
      text: 'Ở đây bạn <b>hẹn giờ</b> cho Claude làm việc và <b>xếp nhiều prompt nối đuôi nhau</b>: bước này xong thì bước sau tự chạy, kể cả khi bạn không ngồi máy.' },
    { el: '.lim', face: 'thinking', title: 'App biết khi nào giới hạn hồi',
      text: 'Kế hoạch có thể tự chạy <b>đúng lúc giới hạn 5 giờ hoặc giới hạn tuần hồi</b>, để không phí lượt dùng. Hết giới hạn giữa chừng thì tạm dừng, hồi lại tự chạy tiếp.' },
    { el: '#plans', face: 'reading', title: 'Danh sách kế hoạch',
      text: 'Mỗi thẻ ghi cách kích hoạt và lần chạy tới. Gạt công tắc để <b>tạm tắt</b> mà không phải xoá. Bấm vào thẻ để xem chuỗi bước bên phải.' },
    { el: '.flow .node.trig', face: 'idle', title: 'Node Kích hoạt: khi nào chạy',
      text: 'Chọn giờ cụ thể, lặp theo thứ trong tuần, khi giới hạn hồi, hoặc <b>ngay sau khi một phiên đang chạy xong</b>. Bấm vào node này để đổi.' },
    { el: () => nodes()[0], face: 'writing', title: 'Mỗi bước là một prompt',
      text: '<b style="color:#e0895f">Thẻ cam</b> mở phiên mới (chọn thư mục, agent, model, effort). <b style="color:#5aa9e6">Thẻ xanh</b> nối tiếp phiên trước nên giữ nguyên ngữ cảnh. Bước sau chỉ chạy khi bước trước xong.' },
    { el: () => nodes()[1], face: 'permission', wait: 'click', title: 'Thử nào!',
      text: '<span class="act">Bấm vào bước 2</span> để mở bảng sửa. Lịch đã lên rồi vẫn sửa được bất kỳ bước nào.' },
    { el: '#kind', face: 'idle', pre: () => ensureDrawer(1), title: 'Đổi loại bước',
      text: 'Chuyển giữa <b>Mở phiên mới</b> và <b>Nối tiếp phiên</b>. Các ô bên dưới đổi theo: phiên mới thì có thư mục, agent, model; nối tiếp thì chọn phiên để nối vào.' },
    { el: '#attRow', face: 'reading', pre: () => ensureDrawer(1), title: 'Đính kèm như khi chat',
      text: 'Thêm tệp, ảnh, video, thư mục phụ hoặc repo. Gõ <b>@</b> trong prompt để nhắc tệp, <b>/</b> để dùng lệnh hoặc skill.' },
    { el: '#optGrid', face: 'thinking', pre: () => ensureDrawer(1), title: 'Quyền và effort',
      text: 'Chạy qua đêm không ai trông thì chọn <b>Tự sửa tệp</b> hoặc <b>Bỏ qua quyền</b>, để Claude không dừng lại chờ bạn bấm cho phép.' },
    { el: '#condBox', face: 'idle', pre: () => ensureDrawer(1), title: 'Khi nào sang bước sau',
      text: 'Khi xong thành công, khi xong kể cả lỗi, chờ thêm vài phút, hoặc chờ giới hạn hồi rồi mới chạy tiếp.' },
    { el: () => document.querySelectorAll('.flow .link')[2], face: 'permission', wait: 'add', pre: () => { closeDrawer(); renderFlow(); document.body.classList.add('tour-show'); }, title: 'Chèn thêm bước',
      text: 'Rê chuột lên đường nối giữa hai bước sẽ hiện nút ＋. <span class="act">Bấm ＋ để chèn một bước mới</span> vào giữa.' },
    { el: '#drawer', face: 'done', wait: 'save', pre: () => document.body.classList.remove('tour-show'), title: 'Bước mới đã được chèn',
      text: 'Gõ prompt cho bước này rồi <span class="act">bấm Lưu</span>. Bước mới mặc định nối tiếp phiên của bước trước.' },
    { el: '#sim', face: 'agents', title: 'Thử trước khi tin',
      text: '<b>Mô phỏng chạy</b> để xem thứ tự các bước, hoặc <b>Chạy ngay</b> để chạy thật luôn. Bước đang chạy hiện trong thanh bên như phiên bình thường: bấm vào xem, nhắn bổ sung hay dừng đều được.' },
    { el: '.fake-comp', face: 'typing', title: 'Từ ô chat cũng được',
      text: 'Đang chat mà muốn xếp việc tiếp theo thì bấm <b>▾</b> cạnh nút gửi: xếp sau việc hiện tại, hẹn giờ gửi, hoặc mở phiên mới sau khi xong. Không cần mở trang này.' },
    { el: '#helpBtn', face: 'celebrate', last: true, title: 'Xong rồi! 🎉',
      text: 'Muốn xem lại hướng dẫn thì bấm nút <b>?</b> này. Bắt đầu bằng một kế hoạch mẫu nhé?' },
  ];
  function ensureDrawer(n) { if (!$('#drawer').classList.contains('open') || selNode !== n) { selPlan = plans[0]; renderPlans(); openDrawer(n); } }
  const elOf = (s) => typeof s.el === 'function' ? s.el() : $(s.el);

  // ----- hộp thoại "Có gì mới"
  function welcome() {
    const bg = document.createElement('div'); bg.className = 't-modal-bg';
    bg.innerHTML = `<div class="t-modal"><div class="top"><div class="bot" style="width:110px;height:84px"></div><div><h2>Claude GUI vừa được cập nhật</h2><div class="ver">Phiên bản 1.7.0 · có 4 điểm mới</div></div></div>
      <div class="t-feat hl"><div class="ic">⏰</div><b>Lịch & hàng đợi</b><span>Hẹn giờ cho Claude chạy, xếp nhiều prompt nối đuôi, tự chạy khi giới hạn hồi.</span></div>
      <div class="t-feat hl"><div class="ic">🤖</div><b>Linh vật robot mới</b><span>Mắt LED biểu cảm theo việc Claude đang làm, đeo tai nghe khi bạn mở nhạc.</span></div>
      <div class="t-feat"><div class="ic">💬</div><b>Nhắn bổ sung giữa chừng</b><span>Claude tiếp thu rồi làm tiếp việc đang dở, không bỏ ngang.</span></div>
      <div class="t-feat"><div class="ic">✨</div><b>Hiệu ứng chuyển phiên</b><span>Chuyển phiên, gửi tin, mở bảng đều mượt hơn.</span></div>
      <div class="ft"><button id="tLater">Để sau</button><button class="pri" id="tGo">Xem hướng dẫn Lịch & hàng đợi (1 phút)</button></div></div>`;
    document.body.append(bg);
    const b = Emo.create(bg.querySelector('.bot'), { w: 110, follow: true }); b.state('love'); setTimeout(() => b.state('done'), 1600);
    bg.querySelector('#tLater').onclick = () => { bg.remove(); flashHelp(); };
    bg.querySelector('#tGo').onclick = () => { bg.remove(); start(); };
  }
  function flashHelp() { $('#helpBtn').animate([{ boxShadow: '0 0 0 0 rgba(63,242,255,.8)' }, { boxShadow: '0 0 0 12px rgba(63,242,255,0)' }], { duration: 900, iterations: 3 }); }

  // ----- tour
  function start() {
    closeDrawer(); selPlan = plans[0]; selNode = null; renderPlans(); renderFlow(); scrollTo({ top: 0 });
    T.blocks = [0, 1, 2, 3].map(() => { const d = document.createElement('div'); d.className = 't-block'; document.body.append(d); return d; });
    T.hole = document.createElement('div'); T.hole.className = 't-hole'; document.body.append(T.hole);
    T.tip = document.createElement('div'); T.tip.className = 't-tip'; document.body.append(T.tip);
    T.tip.innerHTML = '<div class="hd"><div class="bot"></div><h4></h4></div><p></p><div class="ft"><div class="dots"></div><button class="skip">Bỏ qua</button><button class="back">←</button><button class="pri next">Tiếp →</button></div>';
    T.tip.querySelector('.dots').innerHTML = STEPS.map(() => '<i></i>').join('');
    guide = Emo.create(T.tip.querySelector('.bot'), { w: 64, follow: false, click: false });
    T.tip.querySelector('.skip').onclick = end;
    T.tip.querySelector('.back').onclick = () => go(i - 1);
    T.tip.querySelector('.next').onclick = () => STEPS[i].last ? (end(), templates()) : go(i + 1);
    addEventListener('resize', layout); addEventListener('scroll', layout, true);
    addEventListener('keydown', key);
    go(0);
  }
  function key(e) { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight' && !STEPS[i].wait) T.tip.querySelector('.next').click(); if (e.key === 'ArrowLeft' && i > 0) go(i - 1); }
  function end() {
    if (cleanup) cleanup(); cleanup = null;
    [...(T.blocks || []), T.hole, T.tip].forEach((x) => x && x.remove()); T.blocks = null;
    document.body.classList.remove('tour-show');
    removeEventListener('resize', layout); removeEventListener('scroll', layout, true); removeEventListener('keydown', key);
    $('.newdot') && $('.newdot').remove();
  }
  function go(n) {
    if (n < 0 || n >= STEPS.length) return;
    if (cleanup) cleanup(); cleanup = null;
    i = n; const s = STEPS[i];
    if (s.pre) s.pre();
    setTimeout(() => {
      const el = elOf(s); if (!el) return go(i + 1);
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      T.tip.querySelector('h4').textContent = s.title; T.tip.querySelector('p').innerHTML = s.text;
      T.tip.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j === i));
      T.tip.querySelector('.back').style.visibility = i ? '' : 'hidden';
      const nx = T.tip.querySelector('.next'); nx.style.display = s.wait ? 'none' : ''; nx.textContent = s.last ? 'Chọn kế hoạch mẫu' : 'Tiếp →';
      T.hole.classList.toggle('pulse', !!s.wait);
      guide.switchTo(s.face, '', 'blink');
      if (s.wait) armWait(s, el);
      layout(); setTimeout(layout, 380);
    }, s.pre ? 360 : 0);
  }
  // chờ người dùng tự bấm đúng chỗ
  function armWait(s, el) {
    if (s.wait === 'click') { const h = () => setTimeout(() => go(i + 1), 250); el.addEventListener('click', h, { once: true }); cleanup = () => el.removeEventListener('click', h); }
    if (s.wait === 'add') { const b = el.querySelector('.add'); const h = () => setTimeout(() => go(i + 1), 120); b.addEventListener('click', h, { once: true }); cleanup = () => b.removeEventListener('click', h); }
    if (s.wait === 'save') { const b = $('#dsave'); const h = () => setTimeout(() => { guide.state('celebrate'); go(i + 1); }, 150); b.addEventListener('click', h, { once: true }); cleanup = () => b.removeEventListener('click', h); }
  }
  function layout() {
    if (!T.blocks) return;
    const el = elOf(STEPS[i]); if (!el) return;
    const p = 6, r = el.getBoundingClientRect(), x = r.left - p, y = r.top - p, w = r.width + p * 2, h = r.height + p * 2;
    Object.assign(T.hole.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    const B = T.blocks, W = innerWidth, H = innerHeight;
    Object.assign(B[0].style, { left: 0, top: 0, width: W + 'px', height: Math.max(0, y) + 'px' });
    Object.assign(B[1].style, { left: 0, top: y + h + 'px', width: W + 'px', height: Math.max(0, H - y - h) + 'px' });
    Object.assign(B[2].style, { left: 0, top: y + 'px', width: Math.max(0, x) + 'px', height: h + 'px' });
    Object.assign(B[3].style, { left: x + w + 'px', top: y + 'px', width: Math.max(0, W - x - w) + 'px', height: h + 'px' });
    // đặt khung lời dẫn ở phía còn nhiều chỗ nhất
    const tw = 360, th = T.tip.offsetHeight, g = 16;
    const opts = [['r', W - (x + w) - g], ['l', x - g], ['b', H - (y + h) - g], ['t', y - g]];
    const need = { r: tw, l: tw, b: th, t: th };
    const side = (opts.find(([k, v]) => v >= need[k]) || opts.sort((a, b) => b[1] - a[1])[0])[0];
    let tx, ty;
    if (side === 'r') { tx = x + w + g; ty = y + h / 2 - th / 2; } else if (side === 'l') { tx = x - g - tw; ty = y + h / 2 - th / 2; }
    else if (side === 'b') { tx = x + w / 2 - tw / 2; ty = y + h + g; } else { tx = x + w / 2 - tw / 2; ty = y - g - th; }
    tx = Math.max(10, Math.min(W - tw - 10, tx)); ty = Math.max(10, Math.min(H - th - 10, ty));
    T.tip.style.left = tx + 'px'; T.tip.style.top = ty + 'px';
    // robot nhìn về phía chỗ đang nói tới
    const dx = x + w / 2 - (tx + 40), dy = y + h / 2 - (ty + 30), d = Math.hypot(dx, dy) || 1;
    guide.look(dx / d, dy / d * .8);
  }

  // ----- kế hoạch mẫu
  const TPL = [
    { n: '🌙 Chạy qua đêm', d: 'Hẹn 23:00: mở phiên làm việc lớn, rồi nối tiếp viết test và tóm tắt.', make: () => ({ name: 'Chạy qua đêm', trig: { type: 'at', date: '2026-10-28', time: '23:00', missed: 'run' },
      nodes: [nd('new', 'Việc chính cần làm…'), nd('cont', 'Viết test cho phần vừa làm, chạy đến khi pass.'), nd('cont', 'Tóm tắt thay đổi và commit (không push).', 'any')] }) },
    { n: '♻ Khi giới hạn hồi', d: 'Tự chạy ngay khi giới hạn 5 giờ hồi, để không phí lượt.', make: () => ({ name: 'Khi giới hạn hồi', trig: { type: 'reset5', minLeft: 0 }, nodes: [nd('new', 'Việc cần làm khi giới hạn hồi…')] }) },
    { n: '🔁 Báo cáo định kỳ', d: 'Mỗi sáng thứ 2 lúc 8:30 tổng hợp commit tuần trước.', make: () => ({ name: 'Báo cáo định kỳ', trig: { type: 'repeat', time: '08:30', days: [1] }, nodes: [nd('new', 'Tổng hợp commit tuần trước thành báo cáo ngắn.')] }) },
    { n: '⛓ Nối đuôi phiên đang chạy', d: 'Phiên hiện tại xong thì gửi tiếp prompt vào chính phiên đó.', make: () => ({ name: 'Nối đuôi phiên', trig: { type: 'after', sess: 'Thêm lịch chạy phiên' }, nodes: [nd('cont', 'Việc làm tiếp sau khi phiên đó xong…')] }) },
  ];
  function nd(kind, prompt, cond) { return { kind, prompt, dir: 'ClaudeGUI', mode: 'acceptEdits', agent: 'mặc định', model: 'Opus', effort: 'cao', atts: [], cond: cond || 'ok', st: 'wait' }; }
  function templates() {
    const bg = document.createElement('div'); bg.className = 't-modal-bg';
    bg.innerHTML = `<div class="t-modal"><div class="top"><div class="bot" style="width:80px;height:61px"></div><div><h2>Bắt đầu từ mẫu</h2><div class="ver">Chọn một mẫu rồi sửa lại theo ý. Muốn tự làm từ đầu thì bấm "Kế hoạch trống".</div></div></div>
      <div class="tpl">${TPL.map((t, j) => `<div data-j="${j}"><b>${t.n}</b><span>${t.d}</span></div>`).join('')}</div>
      <div class="ft"><button id="tClose">Đóng</button><button id="tBlank">Kế hoạch trống</button></div></div>`;
    document.body.append(bg);
    const b = Emo.create(bg.querySelector('.bot'), { w: 80 }); b.state('done');
    bg.querySelectorAll('.tpl div').forEach((d) => d.onclick = () => { const p = { id: Date.now(), on: true, ...TPL[+d.dataset.j].make() }; plans.unshift(p); selPlan = p; bg.remove(); renderPlans(); renderFlow(); openDrawer('trig'); });
    bg.querySelector('#tBlank').onclick = () => { bg.remove(); $('#newPlan').click(); };
    bg.querySelector('#tClose').onclick = () => bg.remove();
  }

  $('#helpBtn').onclick = start;
  $('#replayNew').onclick = welcome;
  // lần đầu mở (giả lập "vừa cập nhật lên 1.7.0")
  const m = /step=(-?\d+)/.exec(location.hash);
  if (m) setTimeout(() => { if (+m[1] < 0) welcome(); else if (+m[1] >= 99) templates(); else { start(); setTimeout(() => go(+m[1]), 200); } }, 300);
  else if (!location.hash.includes('noTour')) setTimeout(welcome, 400);
  window.__tour = { start, go, welcome, templates };
})();
