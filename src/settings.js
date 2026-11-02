'use strict';
// Trang Cài đặt (toàn màn hình, điều hướng bên trái) — lưu ngay khi thay đổi.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, h, svg, icon, logo, toast, confirmDialog, MODES, EFFORTS, effortLabel } = CG;
  const S = () => CG.S;

  const SECTIONS = [
    ['general', 'Chung', 'settings'],
    ['look', 'Giao diện & trang trí', 'palette'],
    ['code', 'Claude Code', 'code'],
    ['permissions', 'Quyền', 'shield'],
    ['extensions', 'MCP & mở rộng', 'plug'],
    ['lark', 'Lark (hỏi người thật)', 'message'],
    ['lan', 'Máy thợ (LAN)', 'monitor'],
    ['account', 'Tài khoản & sử dụng', 'user'],
    ['updates', 'Cập nhật', 'download'],
    ['shortcuts', 'Phím tắt', 'keyboard'],
    ['about', 'Giới thiệu', 'info'],
  ];
  let current = 'general';
  let savedFlash = null;

  const motionOn = () => !(CG.decor && CG.decor.cfg().reduceMotion);
  CG.openSettings = (section) => { if (section) current = section; render(); };
  // Đóng: thu nhỏ + mờ đi 140 ms rồi mới gỡ (mở lại giữa chừng thì huỷ)
  CG.closeSettings = () => {
    const root = $('#settings-root');
    CG.onUpdates = null;
    const sh = root.querySelector('.settings');
    if (!sh || !motionOn()) { root.innerHTML = ''; return; }
    if (sh._closing) return;
    sh._closing = sh.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.985)' }], { duration: 140, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    const gone = () => { if (sh._closing && sh.isConnected) root.innerHTML = ''; };
    sh._closing.onfinish = gone;
    setTimeout(gone, 220); // cửa sổ ẩn thì animation không chạy → vẫn đóng
  };

  async function set(patch) {
    CG.S.settings = await api.setSettings(patch);
    if (savedFlash) { savedFlash.classList.add('show'); clearTimeout(savedFlash._t); savedFlash._t = setTimeout(() => savedFlash.classList.remove('show'), 1400); }
    return CG.S.settings;
  }

  // ---------- Components ----------
  const group = (title, desc, ...rows) => h('div', { class: 'st-group' }, title ? h('div', { class: 'st-group-title', text: title }) : null, desc ? h('div', { class: 'st-group-desc', text: desc }) : null, h('div', { class: 'st-card' }, ...rows));
  const row = (label, desc, control, opts = {}) => h('div', { class: 'st-row' + (opts.stack ? ' stack' : '') }, h('div', { class: 'st-text' }, h('div', { class: 'st-label', text: label }), desc ? h('div', { class: 'st-desc' }, desc) : null), control ? h('div', { class: 'st-ctl' }, control) : null);
  function toggle(checked, onChange) {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!checked;
    input.onchange = () => onChange(input.checked);
    return h('label', { class: 'switch' }, input, h('span', { class: 'slider' }));
  }
  function select(options, value, onChange) {
    const s = h('select', { class: 'st-select' }, options.map(([v, l]) => h('option', { value: v, text: l })));
    s.value = value;
    s.onchange = () => onChange(s.value);
    return s;
  }
  function seg(options, value, onChange) {
    const box = h('div', { class: 'seg' });
    for (const [v, l] of options) box.append(h('button', { class: v === value ? 'on' : '', text: l, onclick: () => { $$(box).forEach((b) => b.classList.remove('on')); onChange(v); render(); } }));
    return box;
  }
  const $$ = (box) => [...box.children];
  function text(value, onSave, opts = {}) {
    const i = h(opts.area ? 'textarea' : 'input', { type: 'text', class: 'text-input' + (opts.mono ? ' mono' : ''), placeholder: opts.placeholder || '', spellcheck: 'false', rows: opts.rows || 3 });
    i.value = value || '';
    const save = () => { if (i.value !== (value || '')) { value = i.value; onSave(i.value); } };
    i.onchange = save;
    if (!opts.area) i.onkeydown = (e) => { if (e.key === 'Enter') i.blur(); };
    return i;
  }
  function effortSlider(value, onChange) {
    const idx = value ? EFFORTS.findIndex((e) => e.v === value) : 2;
    const lbl = h('span', { class: 'eff-val', text: value ? effortLabel(value) : 'Theo CLI' });
    const range = h('input', { type: 'range', min: 0, max: EFFORTS.length - 1, step: 1, value: Math.max(0, idx), class: 'eff-range' + (value ? '' : ' dim') });
    const paint = () => range.style.setProperty('--p', (range.value / (EFFORTS.length - 1)) * 100 + '%');
    paint();
    range.oninput = () => { lbl.textContent = EFFORTS[+range.value].label; range.classList.remove('dim'); paint(); };
    range.onchange = () => onChange(EFFORTS[+range.value].v);
    const reset = h('button', { class: 'link-btn', text: 'Dùng mặc định của CLI', onclick: () => { onChange(''); render(); } });
    return h('div', { class: 'eff st-eff' }, h('div', { class: 'eff-head' }, h('span', { class: 'eff-title', text: 'Mức effort' }), lbl), range, h('div', { class: 'eff-ticks' }, EFFORTS.map((e) => h('span', { text: e.label }))), value ? reset : null);
  }
  const btn = (label, onClick, cls = '') => h('button', { class: 'btn ' + cls, onclick: onClick }, label);

  // Bộ chủ đề: [id, tên, màu xem trước {bg, side, surf, acc, text}]
  const THEMES = [
    ['system', 'Theo hệ thống', null],
    ['light', 'Claude sáng', { bg: '#faf9f5', side: '#f3f1ea', surf: '#ffffff', acc: '#c96442', text: '#1f1e1d' }],
    ['dark', 'Claude tối', { bg: '#262624', side: '#1f1e1d', surf: '#30302e', acc: '#d97757', text: '#f2f1ec' }],
    ['tokyo', 'Tokyo Night', { bg: '#1a1b26', side: '#16161e', surf: '#24283b', acc: '#7aa2f7', text: '#c0caf5' }],
    ['mocha', 'Catppuccin Mocha', { bg: '#1e1e2e', side: '#181825', surf: '#313244', acc: '#cba6f7', text: '#cdd6f4' }],
    ['dracula', 'Dracula', { bg: '#282a36', side: '#21222c', surf: '#343746', acc: '#bd93f9', text: '#f8f8f2' }],
    ['nord', 'Nord', { bg: '#2e3440', side: '#272c36', surf: '#3b4252', acc: '#88c0d0', text: '#eceff4' }],
    ['rosepine', 'Rosé Pine', { bg: '#191724', side: '#15131f', surf: '#1f1d2e', acc: '#ebbcba', text: '#e0def4' }],
    ['ghdark', 'GitHub Dark', { bg: '#0d1117', side: '#010409', surf: '#161b22', acc: '#2f81f7', text: '#e6edf3' }],
    ['ghlight', 'GitHub Light', { bg: '#ffffff', side: '#f6f8fa', surf: '#ffffff', acc: '#0969da', text: '#1f2328' }],
    ['latte', 'Catppuccin Latte', { bg: '#eff1f5', side: '#e6e9ef', surf: '#ffffff', acc: '#8839ef', text: '#4c4f69' }],
    ['solarized', 'Solarized Light', { bg: '#fdf6e3', side: '#eee8d5', surf: '#fffbef', acc: '#268bd2', text: '#073642' }],
    ['onedark', 'One Dark Pro', { bg: '#282c34', side: '#21252b', surf: '#2c313a', acc: '#61afef', text: '#dcdfe4' }],
    ['gruvbox', 'Gruvbox Dark', { bg: '#282828', side: '#1d2021', surf: '#32302f', acc: '#fe8019', text: '#ebdbb2' }],
    ['gruvlight', 'Gruvbox Light', { bg: '#fbf1c7', side: '#f2e5bc', surf: '#fff8dc', acc: '#af3a03', text: '#3c3836' }],
    ['monokai', 'Monokai Pro', { bg: '#2d2a2e', side: '#221f22', surf: '#363337', acc: '#ffd866', text: '#fcfcfa' }],
    ['ayumirage', 'Ayu Mirage', { bg: '#1f2430', side: '#191e2a', surf: '#242936', acc: '#ffcc66', text: '#cccac2' }],
    ['ayulight', 'Ayu Light', { bg: '#fcfcfc', side: '#f3f4f5', surf: '#ffffff', acc: '#f07f2a', text: '#3a3f44' }],
    ['everforest', 'Everforest', { bg: '#2d353b', side: '#272e33', surf: '#343f44', acc: '#a7c080', text: '#d3c6aa' }],
    ['kanagawa', 'Kanagawa', { bg: '#1f1f28', side: '#16161d', surf: '#2a2a37', acc: '#7e9cd8', text: '#dcd7ba' }],
    ['synthwave', "Synthwave '84", { bg: '#262335', side: '#1e1a2e', surf: '#2e2a45', acc: '#ff7edb', text: '#f4eee4' }],
    ['cyberpunk', 'Cyberpunk', { bg: '#0d0d12', side: '#08080c', surf: '#15151d', acc: '#fcee0a', text: '#f0f0e8' }],
    ['material', 'Material Ocean', { bg: '#0f111a', side: '#090b10', surf: '#1a1c25', acc: '#80cbc4', text: '#d4dcef' }],
    ['sakura', 'Sakura', { bg: '#fff7f9', side: '#fdeef3', surf: '#ffffff', acc: '#d94f87', text: '#4a3640' }],
    ['matcha', 'Matcha', { bg: '#f6f8f1', side: '#ecf0e2', surf: '#ffffff', acc: '#5b8a3a', text: '#2f3a28' }],
    ['hicontrast', 'Tương phản cao', { bg: '#000000', side: '#000000', surf: '#0a0a0a', acc: '#ffd400', text: '#ffffff' }],
  ];
  function themePreview(p) {
    if (!p) {
      return h('div', { class: 'tp-split' }, themePreview(THEMES[1][2]), themePreview(THEMES[2][2]));
    }
    return h('div', { class: 'tp', style: { background: p.bg } },
      h('div', { class: 'tp-side', style: { background: p.side } }, h('i', { style: { background: p.acc } }), h('b', { style: { background: p.text } }), h('b', { style: { background: p.text } })),
      h('div', { class: 'tp-main' },
        h('b', { class: 'w70', style: { background: p.text } }), h('b', { class: 'w90', style: { background: p.text } }), h('b', { class: 'w50', style: { background: p.text } }),
        h('div', { class: 'tp-box', style: { background: p.surf } }, h('i', { style: { background: p.acc } }))));
  }
  function themePicker(value) {
    const grid = h('div', { class: 'theme-grid' });
    for (const [id, name, p] of THEMES) {
      const card = h('button', { class: 'theme-card' + (id === value ? ' on' : ''), title: name }, themePreview(p), h('span', { class: 'tc-name' }, id === value ? icon('check', 13) : null, name));
      card.onclick = async () => { await set({ theme: id }); CG.applyTheme(id); render(); };
      grid.append(card);
    }
    return grid;
  }

  // ---------- Page ----------
  // Khung (điều hướng + vùng nội dung) dựng một lần khi mở; chuyển mục / đổi tuỳ chọn chỉ thay phần nội dung
  // (trước đây dựng lại cả trang + chạy fadein mỗi lần → cả màn hình nháy, lộ khung chat phía sau, video thu nhỏ chớp đen).
  function shellFor(root) {
    const sh = root.querySelector('.settings');
    if (sh && sh._closing) { sh._closing.cancel(); sh._closing = null; }
    if (sh && sh._nav) return { sh, fresh: false };
    root.innerHTML = '';
    savedFlash = h('span', { class: 'st-saved', text: '✓ Đã lưu' });
    const pill = h('div', { class: 'st-pill' });
    const nav = h('nav', { class: 'st-nav has-pill' }, h('div', { class: 'st-nav-title' }, logo(18), 'Cài đặt'), pill,
      SECTIONS.map(([k, l, ic]) => h('button', { 'data-k': k, onclick: () => { if (current !== k) { current = k; render(); } } }, icon(ic, 15), h('span', { text: l }), h('span', { class: 'update-dot hidden' }))));
    const content = h('div', { class: 'st-content' });
    const s2 = h('div', { class: 'settings' }, nav, content, h('div', { class: 'st-top' }, savedFlash, h('button', { class: 'icon-btn', html: svg('x', 18), title: 'Đóng (Esc)', onclick: CG.closeSettings })));
    Object.assign(s2, { _nav: nav, _pill: pill, _content: content });
    root.append(s2);
    if (motionOn()) for (const [el, dx] of [[nav, -10], [content, 0]]) el.animate([{ opacity: 0, transform: `translate(${dx}px, ${dx ? 0 : 8}px) scale(${dx ? 1 : .99})` }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return { sh: s2, fresh: true };
  }
  // ảnh / video thu nhỏ giống hệt bản cũ → dùng lại phần tử cũ (không nạp lại, không chớp đen)
  function keepMedia(oldEl, newEl) {
    if (!oldEl) return;
    const olds = [...oldEl.querySelectorAll('video, img')];
    for (const n of newEl.querySelectorAll('video, img')) {
      const i = olds.findIndex((o) => o.tagName === n.tagName && o.src && o.src === n.src);
      if (i < 0) continue;
      const o = olds.splice(i, 1)[0];
      o.className = n.className; o.style.cssText = n.style.cssText;
      n.replaceWith(o);
      if (o.tagName === 'VIDEO') requestAnimationFrame(() => o.play().catch(() => {}));
    }
  }
  function render() {
    const root = $('#settings-root');
    const { sh, fresh } = shellFor(root);
    const content = sh._content;
    const same = !fresh && sh.dataset.section === current;
    const scrollTop = content.scrollTop;
    // điều hướng: mục đang chọn + viên chọn trượt theo
    let onBtn = null;
    for (const b of sh._nav.querySelectorAll('button[data-k]')) {
      const on = b.dataset.k === current;
      b.classList.toggle('on', on);
      if (on) onBtn = b;
      const dot = b.querySelector('.update-dot');
      if (dot) dot.classList.toggle('hidden', !(b.dataset.k === 'updates' && ((S().updates.cli && S().updates.cli.newer) || (S().updates.gui && S().updates.gui.newer))));
    }
    if (onBtn) {
      sh._pill.style.transition = fresh || !motionOn() ? 'none' : '';
      Object.assign(sh._pill.style, { top: onBtn.offsetTop + 'px', height: onBtn.offsetHeight + 'px' });
    }
    const inner = h('div', { class: 'st-inner' }, h('h1', { text: SECTIONS.find((s) => s[0] === current)[1] }));
    PAGES[current](inner);
    const old = content.firstElementChild;
    keepMedia(old, inner);
    content.replaceChildren(inner);
    sh.dataset.section = current;
    root.dataset.section = current;
    CG.onUpdates = current === 'updates' ? () => { if ($('#settings-root').firstChild) render(); } : null;
    if (same) { content.scrollTop = scrollTop; return; }
    content.scrollTop = 0;
    // chuyển mục: chỉ phần nội dung hiện dần + trượt nhẹ (cột điều hướng đứng yên)
    if (!fresh && motionOn()) inner.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 170, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  // chỗ tải chậm: giữ sẵn chỗ bằng khối xương đúng chiều cao, dữ liệu về thì hiện mờ dần (không đẩy các dòng khác)
  const skel = (n, hgt = 40) => h('div', { class: 'st-skel-box' }, Array.from({ length: n }, () => h('div', { class: 'st-skel-row', style: `height:${hgt}px` }, h('div', { class: 'skel', style: 'width:42%' }), h('div', { class: 'skel', style: 'width:22%' }))));
  const reveal = (el) => { if (motionOn()) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); };

  const PAGES = {
    lark(el) { if (CG.lark) CG.lark.settingsPage(el, { group, row, toggle, select, text, set, render }); },
    lan(el) { if (CG.lan) CG.lan.settingsPage(el, { group, row, toggle, select, text, set, render }); },
    general(el) {
      const s = S().settings;
      el.append(
        group('Giao diện', 'Chủ đề, ảnh nền, màu nhấn và hiệu ứng nằm ở mục "Giao diện & trang trí".',
          row('Hiệu ứng chữ mượt', 'Chữ của Claude hiện dần đều đặn thay vì nhảy từng cụm.', toggle(s.smoothStream !== false, (v) => set({ smoothStream: v }))),
          row('Bộ skill của Claude GUI', 'Lên kế hoạch & tự lập lịch nhiều task (mỗi task model/effort riêng), làm task có bàn giao ngữ cảnh, xin đổi lịch khi kế hoạch sai. Chỉ nạp cho phiên mở từ GUI. Áp dụng cho phiên mở sau khi đổi.',
            h('div', { class: 'row', style: 'gap:8px;display:flex;align-items:center' }, h('button', { class: 'btn sm', text: 'Xem', onclick: () => CG.autopilot && CG.autopilot.skillsDialog() }), toggle(s.guiSkills !== false, (v) => set({ guiSkills: v })))),
          row('Gợi ý câu nhắn tiếp theo', 'Sau mỗi lượt, Claude đoán câu bạn sẽ nhắn tiếp và hiện mờ trong ô nhập — bấm Tab để dùng, Enter để gửi. Áp dụng cho phiên mở sau khi đổi.', toggle(s.promptSuggestions !== false, (v) => set({ promptSuggestions: v }))),
          row('Cỡ chữ', 'Phóng to/thu nhỏ toàn bộ giao diện.', (() => {
            const val = h('span', { class: 'muted', text: Math.round((s.zoom || 1) * 100) + '%' });
            const r = h('input', { type: 'range', min: 0.8, max: 1.4, step: 0.05, value: s.zoom || 1, class: 'plain-range' });
            r.oninput = () => { val.textContent = Math.round(r.value * 100) + '%'; api.setZoom(+r.value); };
            r.onchange = () => set({ zoom: +r.value });
            return h('div', { class: 'row' }, r, val);
          })()),
          row('Chế độ xem hội thoại', 'Có thể đổi nhanh bằng Ctrl+O.', select([['normal', 'Bình thường'], ['thinking', 'Suy nghĩ (mở phần suy nghĩ)'], ['verbose', 'Chi tiết'], ['summary', 'Tóm tắt']], s.viewMode || 'normal', (v) => set({ viewMode: v }).then(() => CG.app.applyViewMode()))),
          row('Nhóm phiên ở thanh bên', null, select([['project', 'Theo dự án (thư mục)'], ['date', 'Theo thời gian']], s.groupBy || 'project', (v) => set({ groupBy: v }).then(() => CG.app.renderSidebar())))),
        group('Nhập liệu', null,
          row('Phím gửi', null, select([['enter', 'Enter gửi, Shift+Enter xuống dòng'], ['ctrlEnter', 'Ctrl+Enter gửi, Enter xuống dòng']], s.sendKey || 'enter', (v) => set({ sendKey: v }).then(() => CG.app.updateComposer()))),
          row('Tin gửi giữa chừng là bổ sung', 'Tin bạn gửi khi Claude đang làm được coi là ngữ cảnh thêm: Claude tiếp thu rồi làm tiếp việc đang dở, không bỏ ngang. Muốn bỏ việc cũ thì dùng "Đổi hướng" ở nút ▴ cạnh nút gửi.', toggle(s.midTurnContinue !== false, (v) => set({ midTurnContinue: v }))),
          row('Dừng có tóm tắt', 'Khi bấm Dừng/Esc lúc Claude đang dùng công cụ, Claude trả lời thêm một đoạn ngắn: đã xong gì, còn dở gì, file nào đang sửa dở.', toggle(s.stopSummary !== false, (v) => set({ stopSummary: v }))),
          row('Tự chạy tiếp khi giới hạn hồi', 'Phiên đang làm mà hết giới hạn 5 giờ / tuần → hiện thẻ đếm ngược, tới giờ hồi tự gửi lời nhắn làm tiếp (bỏ tick trên thẻ nếu không muốn).', toggle(s.autoContinue !== false, (v) => set({ autoContinue: v }))),
          row('Hỏi bên lề (/btw, Ctrl+;)', 'Model trả lời câu hỏi bên lề. "Theo phiên chính" dùng lại bộ nhớ đệm của phiên nên thường rẻ và đúng ngữ cảnh hơn.', select([['', 'Theo phiên chính'], ['haiku', 'Haiku (rẻ)'], ['sonnet', 'Sonnet']], s.btwModel || '', (v) => set({ btwModel: v }))),
          row('Claude gợi ý việc ngoài phạm vi', 'Đang làm mà thấy lỗi / lỗ hổng ngoài phạm vi việc hiện tại, Claude không tự sửa mà hiện thẻ có lý do + bằng chứng: Mở phiên mới, Làm ở đây hoặc Lưu vào Lịch & hàng đợi để sửa sau. Áp dụng cho phiên mở sau khi đổi.', toggle(s.suggestTasks !== false, (v) => set({ suggestTasks: v }))),
          row('Quy trình nhóm: sửa lỗi ở nhánh git riêng', 'Việc gợi ý mở phiên mới / chạy từ hàng đợi sẽ tự tạo nhánh riêng (fix/…, từ nhánh mặc định) trong worktree riêng. "Làm ở đây" hiện cảnh báo vì sửa thẳng trên nhánh đang làm.', toggle(s.branchPolicy !== false, (v) => set({ branchPolicy: v }))),
          row('Cho các phiên nhắn / đọc nhau', 'Claude trong một phiên có thể liệt kê, đọc và nhắn sang phiên khác (công cụ claude-gui). Tin nhắn tới hiện thành thẻ, bạn bấm Gửi mới tới Claude ở phiên đó. Gõ @ trong ô nhập để nhắc một phiên.', toggle(s.crossSession !== false, (v) => set({ crossSession: v })))),
        group('Terminal', 'Terminal tích hợp mở bằng nút >_ trên thanh tiêu đề hoặc Ctrl+`. Mỗi phiên có terminal riêng tại thư mục của phiên.',
          row('Shell', 'Áp dụng cho terminal mở mới (hoặc bấm "Khởi động lại" trong terminal).', select([['auto', 'Tự chọn (PowerShell 7 nếu có)'], ['powershell', 'Windows PowerShell'], ['pwsh', 'PowerShell 7 (pwsh)'], ['cmd', 'Command Prompt (cmd)'], ['gitbash', 'Git Bash']], s.terminalShell || 'auto', (v) => set({ terminalShell: v })))),
        group('Lịch & hàng đợi', 'Hẹn giờ mở phiên / gửi prompt và xếp nhiều bước nối đuôi (mục "Lịch & hàng đợi" ở thanh bên).',
          row('Giữ máy không ngủ khi sắp có lịch', 'Chặn máy ngủ khi có lịch chạy trong 30 phút tới hoặc kế hoạch đang chạy (màn hình vẫn tắt được). Lịch bị lỡ vì máy tắt chỉ chạy bù một lần, trong vòng 7 ngày.', toggle(s.keepAwake !== false, (v) => set({ keepAwake: v }))),
          row('Thu xuống khay khi còn lịch chờ', 'Đóng cửa sổ lúc có lịch chưa chạy thì app chạy tiếp dưới khay hệ thống để tới giờ vẫn mở phiên. Tắt đi thì đóng cửa sổ là thoát hẳn.', toggle(s.trayOnClose !== false, (v) => set({ trayOnClose: v }))),
          row('Hướng dẫn', null, h('div', { class: 'row' }, btn('Xem lại hướng dẫn', () => { CG.closeSettings(); CG.sched.open(); setTimeout(() => CG.sched.tour(), 250); }), btn('Có gì mới', () => { CG.closeSettings(); CG.sched.whatsNew(true); })))),
        group('Khung xem', null,
          row('Tự lưu khi sửa tệp trong khung xem', 'Bấm ✎ Sửa trên tab tệp để sửa trực tiếp. Tắt đi thì có nút Lưu / Huỷ (Ctrl+S vẫn lưu).', toggle(s.viewerAutoSave !== false, (v) => set({ viewerAutoSave: v }))),
          row('Tự mở khung xem bên cạnh', 'Claude tạo tệp web / md / pdf / ảnh hoặc chạy web localhost → mở luôn ở khung xem trong app (giống bản desktop), không mở sang trình duyệt ngoài.', toggle(s.autoPreview !== false, (v) => set({ autoPreview: v })))),
        group('Thông báo', 'Thông báo Windows chỉ hiện khi cửa sổ không được chọn.',
          row('Khi Claude xong việc', null, toggle(s.notifyDone, (v) => set({ notifyDone: v }))),
          row('Khi Claude cần bạn xác nhận', 'Xin quyền, câu hỏi, duyệt kế hoạch.', toggle(s.notifyPermission, (v) => set({ notifyPermission: v })))),
      );
    },

    look(el) {
      const s = S().settings;
      const D = CG.decor;
      const c = D.cfg();
      const sv = (patch) => D.save(patch).then(() => render());
      const b = c.bg ? { ...D.BG_DEFAULT, ...c.bg } : null;
      // --- Ảnh nền
      const thumb = h('div', { class: 'bg-thumb' }, b ? null : 'Chưa có ảnh nền');
      if (b) {
        const url = 'file:///' + encodeURI(b.path.replace(/\\/g, '/')).replace(/#/g, '%23');
        thumb.append(b.kind === 'video' ? h('video', { src: url, muted: true, autoplay: true, loop: true }) : h('img', { src: url }));
        // Vùng đang dùng làm nền (đã cắt, hoặc gợi ý tự động)
        const cr = b.fit !== 'contain' && (b.crop && b.crop.w > 0 ? b.crop : null);
        if (cr) thumb.append(h('div', { class: 'focal crop', style: { left: cr.x * 100 + '%', top: cr.y * 100 + '%', width: cr.w * 100 + '%', height: cr.h * 100 + '%' } }));
      }
      const pick = async () => {
        const r = await api.pickBackground();
        if (!r) return;
        if (r.error) return toast(r.error, true);
        await sv({ bg: { ...D.BG_DEFAULT, ...(c.bg || {}), path: r.path, kind: r.kind, name: r.name, focal: null, crop: null, fit: 'crop' } });
        // Chọn xong mở luôn khung cắt (đợi ảnh nạp + phân tích chủ thể để có gợi ý)
        setTimeout(() => D.openCropper().then(() => render()), 600);
      };
      const crop = () => D.openCropper().then(() => render());
      const setBg = (patch) => sv({ bg: { ...b, ...patch } });
      const range = (val, min, max, step, onSet, fmt) => {
        const out = h('span', { class: 'muted', text: fmt(val) });
        const r = h('input', { type: 'range', min, max, step, value: val, class: 'plain-range' });
        r.oninput = () => { out.textContent = fmt(+r.value); onSet(+r.value, true); };
        r.onchange = () => onSet(+r.value, false);
        return h('div', { class: 'row' }, r, out);
      };
      // Kéo thanh trượt: xem trực tiếp, thả ra mới lưu
      const live = (k) => (v, dragging) => {
        if (dragging) {
          if (k === 'strength') document.documentElement.style.setProperty('--bg-veil', String(1 - v / 100));
          if (k === 'blur') document.documentElement.style.setProperty('--bg-blur', v + 'px');
          return;
        }
        setBg({ [k]: v });
      };
      const cropped = b && b.crop && b.crop.w > 0;
      const bgGroup = group('Ảnh nền', 'Ảnh tĩnh, ảnh động (GIF, WebP, APNG) hoặc video (MP4, WebM). Bấm "Cắt ảnh…" để tự chọn đúng phần ảnh muốn hiện sau vùng chat; khi chưa cắt, app gợi ý vùng cắt theo chủ thể trong ảnh.',
        h('div', { class: 'bg-pick' }, thumb, h('div', { class: 'bg-side' },
          h('div', { class: 'bg-name', text: b ? b.name || b.path.split(/[\\/]/).pop() : 'Chọn một ảnh để làm nền cho cửa sổ.' }),
          b ? h('div', { class: 'muted', text: b.fit === 'contain' ? 'Đang hiện toàn bộ ảnh.' : cropped ? 'Đang dùng vùng bạn đã cắt (khung trắng).' : 'Đang dùng vùng cắt gợi ý tự động — bấm "Cắt ảnh…" để tự chọn.' }) : null,
          h('div', { class: 'row' }, b ? btn('Cắt ảnh…', crop, 'primary') : null, btn(b ? 'Đổi ảnh…' : 'Chọn ảnh / video…', pick, b ? '' : 'primary'), b ? btn('Bỏ ảnh nền', () => sv({ bg: null })) : null))),
        b ? row('Cách hiển thị', 'Theo vùng cắt: phần ảnh trong khung cắt phủ kín vùng hiển thị. Toàn bộ ảnh: không cắt, phần thừa lấp bằng bản nhoè của ảnh.', select([['crop', 'Theo vùng cắt'], ['contain', 'Toàn bộ ảnh']], b.fit === 'contain' ? 'contain' : 'crop', (v) => setBg({ fit: v }))) : null,
        b ? row('Vùng hiển thị', 'Ảnh nằm sau vùng chat (thanh bên giữ màu nền) hay trải khắp cửa sổ.', select([['chat', 'Vùng chat'], ['window', 'Cả cửa sổ']], b.area === 'window' ? 'window' : 'chat', (v) => setBg({ area: v }))) : null,
        b ? row('Độ rõ ảnh', 'Cao = ảnh rõ hơn, thấp = chữ dễ đọc hơn.', range(b.strength, 10, 95, 1, live('strength'), (v) => v + '%')) : null,
        b ? row('Độ nhoè', null, range(b.blur, 0, 24, 1, live('blur'), (v) => v + 'px')) : null,
        b ? row('Kính mờ', 'Thanh bên, ô nhập, thẻ công cụ trong suốt mờ để thấy ảnh phía sau.', toggle(b.glass !== false, (v) => setBg({ glass: v }))) : null,
        b ? row('Làm dịu vùng chữ', 'Phủ một lớp nền nhẹ sau cột hội thoại cho chữ luôn dễ đọc.', toggle(b.calm !== false, (v) => setBg({ calm: v }))) : null);
      // --- Tự đổi ảnh nền theo giờ: kho ảnh, mỗi ảnh có vùng cắt riêng
      const R = D.rot, rc = R.cfg(), poolArr = (c.bgPool || []).filter((p) => p && p.path);
      const svRot = (patch) => sv({ bgRot: { ...rc, ...patch } });
      const svPool = (list) => sv({ bgPool: list });
      const fUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
      const newId = () => 'bp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const addFiles = async () => {
        const rs = await api.pickBackgrounds();
        const ok = (rs || []).filter((r) => r && r.path), bad = (rs || []).filter((r) => r && r.error);
        if (bad.length) toast(bad.map((r) => r.error).join(' · '), true);
        if (!ok.length) return;
        const have = new Set(poolArr.map((p) => p.path));
        const add = ok.filter((r) => !have.has(r.path)).map((r) => ({ id: newId(), path: r.path, kind: r.kind, name: r.name, crop: null, area: (b && b.area) || 'chat', slot: null }));
        // lần đầu: đưa luôn ảnh đang làm nền vào kho để không mất
        const first = !poolArr.length && b && !add.some((x) => x.path === b.path) ? [{ id: newId(), path: b.path, kind: b.kind, name: b.name, crop: b.crop || null, area: b.area || 'chat', focal: b.focal || null, slot: null }] : [];
        await svPool([...poolArr, ...first, ...add]);
        if (add.length === 1) setTimeout(() => D.openCropper(S().settings.decor.bgPool.find((p) => p.id === add[0].id)).then(() => render()), 300);
        else toast(`Đã thêm ${add.length} ảnh vào kho — bấm ✂ trên từng ảnh để cắt.`);
      };
      const addCurrent = () => svPool([...poolArr, { id: newId(), path: b.path, kind: b.kind, name: b.name, crop: b.crop || null, area: b.area || 'chat', focal: b.focal || null, slot: null }]);
      const move = (i, d) => { const L = [...poolArr], j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; svPool(L); };
      const showing = (p) => !!(b && b.path === p.path);
      const tile = (p, i) => {
        const cr = p.crop && p.crop.w > 0 ? p.crop : null;
        const pos = cr ? `${Math.round((cr.x + cr.w / 2) * 100)}% ${Math.round((cr.y + cr.h / 2) * 100)}%` : '50% 50%';
        const media = p.kind === 'video' ? h('video', { src: fUrl(p.path) + '#t=0.5', muted: true, preload: 'metadata' }) : h('img', { src: fUrl(p.path), loading: 'lazy' });
        media.style.objectPosition = pos;
        const hours = h('select', { class: 'bp-slot', title: 'Dùng ảnh này từ mấy giờ (chế độ theo khung giờ)', onchange: (e) => svPool(poolArr.map((x) => (x.id === p.id ? { ...x, slot: e.target.value === '' ? null : +e.target.value } : x))) },
          h('option', { value: '', text: '— giờ' }), [...Array(24)].map((_, hr) => h('option', { value: hr, text: hr + 'h', selected: p.slot === hr })));
        return h('div', { class: 'bp-tile' + (showing(p) ? ' on' : ''), title: p.name || '' }, media,
          h('span', { class: 'bp-n', text: (rc.mode === 'seq' ? i + 1 + ' · ' : '') + (cr ? '✂ đã cắt' : 'tự cắt') }),
          p.kind === 'video' ? h('span', { class: 'bp-live', text: '▶ live' }) : null,
          rc.mode === 'slot' ? hours : null,
          h('div', { class: 'bp-acts' },
            h('button', { title: 'Dùng ngay', text: '👁', onclick: () => R.show(p).then(() => render()) }),
            h('button', { title: 'Cắt ảnh này', text: '✂', onclick: () => D.openCropper(p).then(() => render()) }),
            rc.mode === 'seq' ? h('button', { title: 'Lên trước', text: '◀', onclick: () => move(i, -1) }) : null,
            rc.mode === 'seq' ? h('button', { title: 'Ra sau', text: '▶', onclick: () => move(i, 1) }) : null,
            h('button', { title: 'Bỏ khỏi kho (không xoá ảnh nền đang dùng)', text: '✕', onclick: () => svPool(poolArr.filter((x) => x.id !== p.id)) })));
      };
      const slotBar = () => {
        const bar = h('div', { class: 'bp-tl' });
        for (let hr = 0; hr < 24; hr++) {
          const p = R.slotPick(poolArr, hr);
          bar.append(h('div', { class: hr === new Date().getHours() ? 'now' : '', title: `${hr}h → ${p ? p.name || '' : 'chưa gán ảnh'}`, style: !p ? {} : p.kind === 'video' ? { background: `hsl(${(poolArr.indexOf(p) * 67) % 360} 45% 45%)` } : { backgroundImage: `url("${fUrl(p.path)}")` } }));
        }
        return h('div', { class: 'pad' }, bar, h('div', { class: 'bp-tlx' }, ['0h', '6h', '12h', '18h', '24h'].map((t) => h('span', { text: t }))));
      };
      const nextAt = rc.on && rc.mode !== 'slot' && rc.every > 0 && rc.last ? new Date(rc.last + rc.every * 60e3) : null;
      const rotGroup = group('Tự đổi ảnh nền theo giờ', 'Gom nhiều ảnh / video vào kho, app tự đổi tuần tự, ngẫu nhiên hoặc theo khung giờ trong ngày. Mỗi ảnh có vùng cắt riêng (bấm ✂). Độ rõ, độ nhoè, kính mờ dùng chung theo mục Ảnh nền ở trên.',
        row('Bật tự đổi', poolArr.length < 2 && rc.mode !== 'slot' ? 'Cần ít nhất 2 ảnh trong kho.' : nextAt ? `Lần đổi tới: khoảng ${String(nextAt.getHours()).padStart(2, '0')}:${String(nextAt.getMinutes()).padStart(2, '0')}.` : null, toggle(!!rc.on, (v) => svRot({ on: v, last: v ? Date.now() : rc.last }))),
        row('Cách đổi', rc.mode === 'slot' ? 'Chọn giờ bắt đầu ở góc mỗi ảnh. Ảnh không gán giờ thì không dùng ở chế độ này.' : null, select([['seq', 'Tuần tự (theo thứ tự trong kho)'], ['rand', 'Ngẫu nhiên'], ['slot', 'Theo khung giờ trong ngày']], rc.mode, (v) => svRot({ mode: v, seen: [] }))),
        rc.mode !== 'slot' ? row('Đổi mỗi', null, select([['5', '5 phút'], ['15', '15 phút'], ['30', '30 phút'], ['60', '1 giờ'], ['120', '2 giờ'], ['240', '4 giờ'], ['0', 'Mỗi lần mở app']], String(rc.every), (v) => svRot({ every: +v, last: Date.now() }))) : null,
        rc.mode === 'rand' ? row('Không lặp lại', 'Ngẫu nhiên nhưng xem hết kho rồi mới quay lại ảnh cũ.', toggle(rc.noRep !== false, (v) => svRot({ noRep: v, seen: [] }))) : null,
        row('Hiệu ứng chuyển', null, select([['fade', 'Mờ dần'], ['zoom', 'Mờ dần + phóng nhẹ'], ['none', 'Đổi ngay']], rc.fx, (v) => svRot({ fx: v }))),
        row('Đợi rảnh mới đổi', 'Không đổi lúc bạn đang gõ hoặc Claude đang trả lời chữ — để không giật mắt.', toggle(rc.idle !== false, (v) => svRot({ idle: v }))),
        rc.mode === 'slot' && poolArr.length ? slotBar() : null,
        h('div', { class: 'bp-grid' }, poolArr.map(tile), h('button', { class: 'bp-tile bp-add', onclick: addFiles }, h('span', { text: '＋' }), h('small', { text: 'Thêm ảnh / video' }))),
        h('div', { class: 'row pad' },
          b && !poolArr.some((p) => p.path === b.path) ? btn('Thêm ảnh nền đang dùng vào kho', addCurrent) : null,
          poolArr.length > 1 ? btn('Đổi ngay ▶', () => R.show(R.pick(1)).then(() => render())) : null));
      // --- Màu nhấn
      const SW = ['', '#d97757', '#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#ff5ca8'];
      const color = h('input', { type: 'color', value: c.accent || '#d97757', title: 'Chọn màu bất kỳ' });
      color.onchange = () => sv({ accent: color.value });
      const accentRow = h('div', { class: 'accent-row' }, SW.map((v) => h('button', {
        class: 'accent-sw' + ((c.accent || '') === v ? ' on' : ''), title: v || 'Theo chủ đề',
        style: { background: v || 'conic-gradient(#d97757, #61afef, #a7c080, #ff7edb, #d97757)' }, onclick: () => sv({ accent: v }),
      })), color);
      // --- Tự đổi chủ đề
      const at = c.autoTheme;
      const themeOpts = THEMES.filter((t) => t[0] !== 'system').map((t) => [t[0], t[1]]);
      const reTheme = () => CG.applyTheme(S().settings.theme);
      const time = (v, k) => { const i = h('input', { type: 'time', class: 'text-input time-in', value: v }); i.onchange = () => sv({ autoTheme: { ...at, [k]: i.value } }).then(reTheme); return i; };
      const sd = c.sound;
      const sndRow = (label, k) => row(label, null, h('div', { class: 'row' }, toggle(sd[k], (v) => sv({ sound: { ...sd, [k]: v } })), btn('Nghe thử', () => D.preview.tone(k))));
      el.append(
        group('Chủ đề', 'Màu cho toàn bộ ứng dụng, khối code và terminal.' + (at.on ? ' Đang bật tự đổi chủ đề theo giờ (xem bên dưới).' : ''), h('div', { class: 'pad' }, themePicker(s.theme || 'system'))),
        group('Màu nhấn', 'Màu của nút, link, viền… — dùng chung với mọi chủ đề.', row('Màu', null, accentRow)),
        bgGroup,
        rotGroup,
        group('Hiệu ứng', null,
          row('Viền cầu vồng khi Claude đang làm', 'Viền ô nhập chạy màu trong lúc Claude làm việc.', toggle(c.busyBorder, (v) => sv({ busyBorder: v }))),
          row('Logo động', 'Logo Claude khi đang chạy.', select([['off', 'Bình thường'], ['rainbow', 'Cầu vồng'], ['glow', 'Phát sáng']], c.logoFx, (v) => sv({ logoFx: v }))),
          row('Khi Claude làm xong', 'Chỉ với lượt chạy trên 15 giây, ở phiên đang xem.', h('div', { class: 'row' },
            select([['off', 'Không'], ['confetti', 'Pháo giấy 🎉'], ['bloom', 'Logo nở hoa 🌸']], c.doneFx, (v) => sv({ doneFx: v })),
            btn('Thử', () => { if (c.doneFx === 'bloom') D.preview.bloom(); else D.preview.confetti(); }))),
          row('Bong bóng tin nhắn gradient', 'Tin nhắn của bạn có nền chuyển màu theo màu nhấn.', toggle(c.gradBubble, (v) => sv({ gradBubble: v }))),
          row('Vệt sáng theo con trỏ', null, toggle(c.cursorTrail, (v) => sv({ cursorTrail: v }))),
          row('Giảm hiệu ứng', 'Tắt mọi chuyển động (ảnh động chỉ hiện khung đầu, video dừng). Hiệu ứng luôn tự dừng khi cửa sổ bị ẩn.' + (D.osReduced() ? ' Lưu ý: Windows trên máy này đang tắt hiệu ứng hoạt ảnh — app vẫn chạy hiệu ứng theo lựa chọn ở đây.' : ''), toggle(c.reduceMotion, (v) => sv({ reduceMotion: v })))),
        group('Linh vật robot', 'Robot mắt LED biểu cảm theo việc Claude đang làm ở phiên đang xem: suy nghĩ, đọc tệp, sửa code, chờ bạn, xong việc, sắp hết giới hạn… Kéo robot để đổi chỗ, chuột phải để chọn nhanh, rê chuột để xem nó đang báo gì.',
          row('Hiện linh vật', null, toggle(c.mascot !== 'off', (v) => sv({ mascot: v ? 'robot' : 'off' }))),
          c.mascot !== 'off' ? row('Vị trí', null, select(Object.entries(CG.mascot.ANCHORS).map(([k, a]) => [k, a.label]), c.mascotPos || 'corner', (v) => sv({ mascotPos: v }))) : null,
          c.mascot !== 'off' ? row('Cỡ', null, select([['0.8', 'Nhỏ'], ['1', 'Vừa'], ['1.25', 'Lớn']], String(c.mascotSize || 1), (v) => sv({ mascotSize: +v }))) : null,
          c.mascot !== 'off' ? row('Phản ứng theo nhạc', 'Đang phát nhạc trên máy (Spotify, trình duyệt, trình phát…) thì robot đeo tai nghe và nhún theo nhịp. App chỉ đọc tên bài và mức âm lượng, không điều khiển gì.', toggle(c.mascotMusic !== false, (v) => sv({ mascotMusic: v }))) : null,
          c.mascot !== 'off' && c.mascotMusic !== false ? row('Kể cả khi xem video', 'Mặc định chỉ phản ứng với nhạc.', toggle(!!c.mascotVideo, (v) => sv({ mascotVideo: v }))) : null,
          c.mascot !== 'off' ? row('Ra desktop khi thu nhỏ app', 'Thu nhỏ app hoặc app nằm ở khay: robot ra ngồi góc màn hình, báo khi Claude xong việc / hỏi bạn / xin quyền; trả lời nhanh ngay trong bóng nói. Bấm robot để mở lại app, kéo để đổi chỗ.', toggle(c.mascotPet !== false, (v) => sv({ mascotPet: v }))) : null,
          c.mascot !== 'off' ? row('Nhắc nghỉ ngơi', 'Sau 23 giờ đội mũ ngủ và nhắc nghỉ, chào buổi sáng, làm liên tục 2 tiếng thì nhắc uống nước. Pomodoro bật ở menu chuột phải của robot.', toggle(c.mascotCare !== false, (v) => sv({ mascotCare: v }))) : null,
          c.mascot !== 'off' ? row('Tiếng bíp', 'Tiếng bíp nhỏ kiểu R2-D2 khi xong việc dài, cần bạn trả lời, gặp lỗi, được vuốt ve. Không kêu khi đang nghe nhạc.', toggle(!!c.mascotBeep, (v) => sv({ mascotBeep: v }))) : null,
          c.mascot !== 'off' ? row('Robot của tôi', 'Cấp, phụ kiện mở theo cấp và màu mắt. Ngày lễ robot tự mặc đồ lễ.', h('button', { class: 'btn sm', text: 'Mở…', onclick: () => CG.mascot.panel() })) : null),
        c.mascot !== 'off' ? group('Nuôi robot', 'Robot có thân, tay chân và tự đi lại: đứng trên mép ô nhập, ngồi trên phiên ★, nhảy lên thẻ xin quyền, đi theo chữ khi Claude trả lời, ăn ⚡ khi xong lượt, bắt bọ khi test fail… Rời app thì nhảy ra desktop, đi trên taskbar và leo lên thanh tiêu đề cửa sổ. Mặc định tắt — ai không thích robot chạy lung tung thì cứ để tắt.',
          row('Bật nuôi robot', c.reduceMotion ? 'Đang bật "Giảm hiệu ứng" nên robot sẽ đứng yên như cũ.' : null, toggle(!!c.mascotLife, (v) => sv({ mascotLife: v }))),
          c.mascot !== 'off' && c.mascotLife ? row('Đi lại trong app', 'Tắt thì robot trong app đứng yên ở vị trí cũ, chỉ đi lại khi ra desktop.', toggle(c.mascotLifeApp !== false, (v) => sv({ mascotLifeApp: v }))) : null,
          c.mascot !== 'off' && c.mascotLife && c.mascotLifeApp !== false ? row('Hiện thân và chân trong app', 'Mặc định trong app chỉ hiện đầu + chân ngắn cho gọn; ra desktop luôn hiện đủ.', toggle(!!c.mascotLifeBodyApp, (v) => sv({ mascotLifeBodyApp: v }))) : null,
          c.mascot !== 'off' && c.mascotLife ? row('Ra desktop', 'Thu nhỏ app thì robot đi lại trên taskbar, leo lên thanh tiêu đề các cửa sổ đang mở, về nhà cạnh khay hệ thống để ngủ. App chỉ đọc vị trí cửa sổ, không đọc nội dung.' + (c.mascotPet === false ? ' (Cần bật "Ra desktop khi thu nhỏ app" ở trên.)' : ''), toggle(c.mascotLifeDesk !== false, (v) => sv({ mascotLifeDesk: v }))) : null,
          c.mascot !== 'off' && c.mascotLife && c.mascotLifeDesk !== false ? row('Ra cả khi chuyển sang cửa sổ khác', 'Không cần thu nhỏ: bấm sang app khác là robot nhảy ra desktop, quay lại Claude GUI thì nhảy vào.', toggle(c.mascotLifeOut !== false, (v) => sv({ mascotLifeOut: v }))) : null,
          c.mascot !== 'off' && c.mascotLife ? row('Đói, buồn ngủ, vui, sạch', 'Không chết, không phạt: thiếu thì robot chỉ ỉu xìu và hiện icon nhỏ trên đầu. Tắt thì chỉ số luôn đầy.', toggle(c.mascotNeeds !== false, (v) => sv({ mascotNeeds: v }))) : null,
          c.mascot !== 'off' && c.mascotLife ? row('Đừng làm phiền', 'Robot ra góc ngồi ngủ, không chạy tới báo việc.', toggle(!!c.mascotDnd, (v) => sv({ mascotDnd: v }))) : null,
          c.mascot !== 'off' && c.mascotLife ? row('Chăm robot', 'Cho ăn, tắm, chọn đầu / thân / chân, tiến hoá, đồ trong nhà, nhật ký. Bấm đúp vào robot để mở túi đồ; Ctrl+Shift+P gọi robot tới con trỏ.', h('button', { class: 'btn sm', text: 'Mở…', onclick: () => CG.mascot.panel() })) : null) : null,
        group('Âm thanh', 'Âm thanh nhẹ, tạo trực tiếp (không cần tệp).',
          row('Bật âm thanh', null, toggle(sd.on, (v) => sv({ sound: { ...sd, on: v } }))),
          sd.on ? row('Âm lượng', null, range(Math.round(sd.vol * 100), 5, 100, 5, (v, drag) => { if (!drag) sv({ sound: { ...sd, vol: v / 100 } }); }, (v) => v + '%')) : null,
          sd.on ? sndRow('Khi gửi tin nhắn', 'send') : null,
          sd.on ? sndRow('Khi Claude xong', 'done') : null,
          sd.on ? sndRow('Khi cần bạn xác nhận', 'perm') : null),
        group('Tự đổi chủ đề theo giờ', 'Ban ngày dùng một chủ đề, buổi tối dùng chủ đề khác.',
          row('Bật', null, toggle(at.on, (v) => sv({ autoTheme: { ...at, on: v } }).then(reTheme))),
          at.on ? row('Ban ngày', null, h('div', { class: 'row' }, select(themeOpts, at.light, (v) => sv({ autoTheme: { ...at, light: v } }).then(reTheme)), 'từ', time(at.from, 'from'))) : null,
          at.on ? row('Buổi tối', null, h('div', { class: 'row' }, select(themeOpts, at.dark, (v) => sv({ autoTheme: { ...at, dark: v } }).then(reTheme)), 'từ', time(at.to, 'to'))) : null),
      );
    },

    code(el) {
      // PR / MR: GitHub dùng GitHub CLI (gh) đã đăng nhập; GitLab (kể cả server nội bộ) dùng link + Personal Access Token
      function gitGroup(s) {
        const out = h('div', { class: 'test-out' });
        const url = text('', () => {}, { mono: true, placeholder: 'https://gitlab.congty.vn' });
        const tok = h('input', { type: 'password', class: 'text-input mono', placeholder: 'Personal Access Token (quyền api)', autocomplete: 'off' });
        api.gitlabGet().then((g) => { const i = url.querySelector ? url.querySelector('input') || url : url; i.value = g.url || ''; tok.placeholder = g.hasToken ? '•••••••• (đã lưu — nhập để thay)' : 'Personal Access Token (quyền api)'; });
        const urlIn = () => (url.querySelector ? url.querySelector('input') || url : url);
        const saveBtn = btn('Lưu & kiểm tra', async () => {
          out.textContent = 'Đang kiểm tra…';
          const r = await api.gitlabSet({ url: urlIn().value, token: tok.value, test: true });
          tok.value = '';
          out.textContent = r.ok ? `✓ Kết nối được — tài khoản ${r.user}` : '✗ ' + (r.error || 'Không kết nối được');
          if (CG.parity) CG.parity.refreshPr(true);
        });
        return group('Git: pull request / merge request', 'Chip PR/MR trên thanh tiêu đề: trạng thái CI, góp ý review, "Tự sửa CI & góp ý" (Claude đọc log CI + góp ý rồi sửa, push), "Merge khi sẵn sàng". GitHub dùng GitHub CLI (gh) đã đăng nhập.',
          row('Link GitLab server', 'Repo có remote trùng máy chủ này sẽ dùng GitLab API (merge request).', urlIn(), { stack: true }),
          row('Token GitLab', 'Tạo ở GitLab › Preferences › Access Tokens, quyền "api". Lưu mã hoá trên máy này.', h('div', { class: 'row' }, tok, saveBtn), { stack: true }),
          out,
          row('Hiện chip PR / MR', null, toggle(s.prChip !== false, (v) => set({ prChip: v }).then(() => CG.parity && CG.parity.refreshPr(true)))),
          row('Tự lưu trữ phiên khi PR / MR đã merge hoặc đóng', 'Kiểm tra khi bạn mở phiên đó.', toggle(!!s.autoArchiveMerged, (v) => set({ autoArchiveMerged: v }))));
      }
      const s = S().settings;
      const models = (S().info && S().info.models) || [{ value: 'default', displayName: 'Mặc định' }];
      const cliOut = h('div', { class: 'test-out' });
      el.append(
        group('Mặc định cho phiên mới', 'Bạn vẫn đổi được cho từng phiên ở ô nhập liệu.',
          row('Model', null, select(models.map((m) => [m.value, m.value === 'default' ? 'Mặc định (theo CLI)' : m.displayName]), s.model || 'default', (v) => set({ model: v }))),
          row('Effort', 'Mức độ suy nghĩ. Cao hơn = kỹ hơn nhưng chậm và tốn hơn.', effortSlider(s.effort, (v) => set({ effort: v })), { stack: true }),
          row('Chế độ quyền', 'Chế độ được nhớ riêng cho từng thư mục (trừ Lập kế hoạch).', select(MODES.filter((m) => m.v !== 'bypassPermissions' || s.allowBypass).map((m) => [m.v, m.label]), s.permissionMode || 'default', (v) => set({ permissionMode: v, modeByFolder: {} })))),
        group('Hành vi', null,
          row('Luôn trả lời bằng tiếng Việt', 'Thêm chỉ dẫn vào system prompt của mỗi phiên.', toggle(s.replyVietnamese, (v) => set({ replyVietnamese: v }))),
          row('Cho phép chế độ “Bỏ qua quyền”', 'Hiện chế độ bypassPermissions trong menu. Claude sẽ không hỏi trước khi sửa tệp hay chạy lệnh — chỉ bật nếu bạn hiểu rủi ro và chính sách team cho phép.',
            toggle(s.allowBypass, async (v) => {
              if (v && !(await confirmDialog('Bật chế độ Bỏ qua quyền?', 'Ở chế độ này Claude có thể sửa tệp và chạy lệnh mà không hỏi bạn. Chỉ dùng trong môi trường bạn hoàn toàn tin tưởng.', 'Bật', true))) return render();
              await set({ allowBypass: v });
              CG.app.updateComposer();
            })),
          row('System prompt bổ sung', 'Được thêm vào cuối system prompt (--append-system-prompt).', text(s.appendSystemPrompt, (v) => set({ appendSystemPrompt: v }), { area: true, rows: 3, placeholder: 'vd: Viết comment code bằng tiếng Anh.' }), { stack: true })),
        gitGroup(s),
        group('Claude CLI', 'Mọi yêu cầu đều chạy qua CLI này nên đăng nhập, settings, hooks, MCP và chính sách của team vẫn được áp dụng.',
          row('Đường dẫn CLI', 'Mặc định "claude" (tìm trong PATH và ~/.local/bin).', h('div', { class: 'row' },
            text(s.cliPath || 'claude', (v) => set({ cliPath: v.trim() || 'claude' }), { mono: true }),
            btn('Kiểm tra', async () => { cliOut.textContent = 'Đang kiểm tra…'; const r = await api.cliVersion(); cliOut.textContent = (r.ok ? '✓ ' : '✗ ') + (r.text || '') + (r.path ? '\n' + r.path : ''); })), { stack: true }),
          cliOut,
          row('Thư mục bổ sung', 'Mỗi dòng một thư mục, Claude được phép truy cập thêm (--add-dir).', text((s.addDirs || []).join('\n'), (v) => set({ addDirs: v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) }), { area: true, rows: 2, mono: true, placeholder: 'D:\\Data' }), { stack: true }),
          row('Biến môi trường', 'Mỗi dòng KEY=VALUE, truyền cho tiến trình claude.', text(s.envVars, (v) => set({ envVars: v }), { area: true, rows: 3, mono: true, placeholder: 'HTTPS_PROXY=http://proxy:8080' }), { stack: true }),
          row('Tham số CLI bổ sung', 'Thêm vào mỗi lần chạy claude, vd: --mcp-config mcp.json', text(s.extraArgs, (v) => set({ extraArgs: v }), { mono: true }), { stack: true }),
          h('div', { class: 'st-note', text: 'Thay đổi ở mục này áp dụng cho phiên mới, hoặc phiên cũ khi tiến trình CLI được khởi động lại.' })),
        group('Tệp cấu hình', null,
          row('Cài đặt người dùng của Claude Code', '~/.claude/settings.json', btn('Mở', async () => api.openPath((await api.claudeSettings()).path))),
          row('Chỉ dẫn chung (CLAUDE.md)', '~/.claude/CLAUDE.md — áp dụng cho mọi dự án', btn('Mở thư mục', async () => api.openPath((await api.appInfo()).claudeDir)))),
      );
    },

    async permissions(el) {
      const box = h('div', {}, skel(1, 60), skel(3), skel(2));
      el.append(box);
      const cs = await api.claudeSettings();
      reveal(box);
      const perm = { allow: [], ask: [], deny: [], ...((cs.data && cs.data.permissions) || {}) };
      const lists = { allow: [...(perm.allow || [])], ask: [...(perm.ask || [])], deny: [...(perm.deny || [])] };
      box.innerHTML = '';
      let dirty = false;
      const saveBtn = btn('Lưu thay đổi', async () => {
        try { await api.writePermissions(lists); dirty = false; saveBtn.disabled = true; toast('Đã lưu quyền vào ~/.claude/settings.json (bản cũ: settings.json.bak). Áp dụng cho phiên mới.'); CG.app.reloadClaudeSettings(); }
        catch (e) { toast('Lưu thất bại: ' + e.message, true); }
      }, 'primary');
      saveBtn.disabled = true;
      const markDirty = () => { dirty = true; saveBtn.disabled = false; };
      const make = (key, title, desc, cls) => {
        const chips = h('div', { class: 'rule-list' });
        const paint = () => {
          chips.innerHTML = '';
          if (!lists[key].length) chips.append(h('div', { class: 'note', text: 'Chưa có quy tắc.' }));
          lists[key].forEach((r, i) => chips.append(h('div', { class: 'rule ' + cls }, h('code', { text: r }), h('button', { class: 'icon-btn sm', html: svg('x', 12), title: 'Xóa', onclick: () => { lists[key].splice(i, 1); markDirty(); paint(); } }))));
        };
        paint();
        const input = h('input', { type: 'text', class: 'text-input mono', placeholder: 'vd: Bash(npm run test:*)  ·  Read(./secrets/**)  ·  WebFetch(domain:github.com)' });
        const add = () => { const v = input.value.trim(); if (v && !lists[key].includes(v)) { lists[key].push(v); markDirty(); paint(); } input.value = ''; };
        input.onkeydown = (e) => { if (e.key === 'Enter') add(); };
        return group(title, desc, chips, h('div', { class: 'row rule-add' }, input, btn('Thêm', add)));
      };
      box.append(
        h('div', { class: 'st-intro' }, 'Quy tắc quyền của Claude Code (giống lệnh /permissions trong terminal). Lưu tại ', h('code', { text: cs.path }), '. Quy tắc riêng của từng dự án nằm trong .claude/settings.json của dự án đó.'),
        make('allow', 'Luôn cho phép', 'Claude dùng các công cụ này mà không hỏi.', 'ok'),
        make('ask', 'Luôn hỏi', 'Claude luôn hỏi trước, kể cả ở chế độ tự chấp nhận.', 'warn'),
        make('deny', 'Luôn chặn', 'Claude không bao giờ được dùng.', 'err'),
        h('div', { class: 'row', style: 'justify-content:flex-end;gap:8px' }, btn('Mở tệp', () => api.openPath(cs.path)), saveBtn));
      void dirty;
    },

    extensions(el) {
      const info = S().info || {};
      const mcpBox = h('div', { title: 'Đang kiểm tra máy chủ MCP (claude mcp list)…' }, skel(Math.max(2, (S().mcpCount || 3)), 46));
      const loadMcp = async () => {
        const r = await api.mcpList();
        S().mcpCount = r.servers.length;
        mcpBox.innerHTML = '';
        reveal(mcpBox);
        if (!r.servers.length) mcpBox.append(h('pre', { class: 'pre', text: r.raw || 'Chưa cấu hình máy chủ MCP nào.' }));
        for (const sv of r.servers) mcpBox.append(h('div', { class: 'list-row' }, h('span', { class: 'dot ' + (sv.ok ? 'ok' : 'err') }), h('div', { class: 'lr-body' }, h('div', { class: 'lr-title', text: sv.name }), h('div', { class: 'lr-desc mono', text: sv.target })), h('span', { class: 'muted', text: sv.status })));
      };
      loadMcp();
      const cmds = (info.commands || []);
      const q = h('input', { type: 'text', class: 'text-input', placeholder: `Tìm trong ${cmds.length} lệnh & kỹ năng…` });
      const cmdList = h('div', { class: 'scroll-list' });
      const paint = () => {
        const s = q.value.trim().toLowerCase();
        cmdList.innerHTML = '';
        for (const c of cmds.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.description || '').toLowerCase().includes(s)).slice(0, 300)) {
          cmdList.append(h('div', { class: 'list-row' }, h('div', { class: 'lr-body' }, h('div', { class: 'lr-title mono', text: '/' + c.name + (c.argumentHint ? ' ' + c.argumentHint : '') }), h('div', { class: 'lr-desc', text: c.description || '' }))));
        }
      };
      q.oninput = paint;
      paint();
      const agents = info.agents || [];
      el.append(
        group('Máy chủ MCP', 'Cấu hình bằng lệnh `claude mcp add` hoặc tệp .mcp.json của dự án.', mcpBox, h('div', { class: 'row', style: 'padding:10px 14px' }, btn('Kiểm tra lại', () => { mcpBox.replaceChildren(skel(Math.max(2, (S().mcpCount || 3)), 46)); loadMcp(); }), btn('Mở terminal: claude mcp', () => api.openTerminal(S().active && S().active.cwd, ['mcp', '--help'])))),
        group('Lệnh & kỹ năng', 'Gõ / trong ô nhập để dùng. Danh sách phụ thuộc vào thư mục dự án đang mở.', h('div', { style: 'padding:10px 14px 0' }, q), cmdList),
        group('Tác tử phụ (subagents)', null, agents.length ? h('div', { class: 'scroll-list' }, agents.map((a) => h('div', { class: 'list-row' }, h('div', { class: 'lr-body' }, h('div', { class: 'lr-title', text: a.name }), h('div', { class: 'lr-desc', text: (a.description || '').slice(0, 220) }))))) : h('div', { class: 'note pad', text: 'Không có.' })),
        info.available_output_styles ? group('Kiểu trả lời (output style)', 'Đổi bằng lệnh /output-style trong phiên.', h('div', { class: 'chips pad' }, info.available_output_styles.map((s) => h('span', { class: 'chip' + (s === info.output_style ? ' on' : ''), text: s })))) : null,
      );
    },

    account(el) {
      const a = (S().info && S().info.account) || {};
      const usageBox = h('div', { class: 'pad' });
      const drawUsage = () => { usageBox.innerHTML = ''; usageBox.append(CG.app.usageRows(S().active, { breakdown: true })); };
      drawUsage();
      CG.onUsageChanged = () => { if (usageBox.isConnected) drawUsage(); };
      el.append(
        group('Tài khoản', 'Thông tin lấy trực tiếp từ Claude CLI.',
          row('Email', null, h('span', { class: 'mono', text: a.email || '—' })),
          row('Tổ chức', null, h('span', { text: a.organization || '—' })),
          row('Gói', null, h('span', { text: a.subscriptionType || '—' })),
          row('Nhà cung cấp API', null, h('span', { text: a.apiProvider || '—' })),
          row('Đăng nhập', 'Mở terminal để chạy lệnh đăng nhập/đăng xuất của Claude CLI.', h('div', { class: 'row' }, btn('Đăng nhập lại', () => api.openTerminal(null, ['auth', 'login'])), btn('Đăng xuất', () => api.openTerminal(null, ['auth', 'logout']), 'danger')))),
        group('Mức sử dụng', 'Lấy từ Claude CLI (cùng dữ liệu với lệnh /usage). Tự cập nhật sau mỗi lượt trả lời.', usageBox),
      );
      CG.app.fetchUsage(false);
    },

    updates(el) {
      const s = S().settings;
      const U = S().updates || {};
      const gui = U.gui, cli = U.cli;
      const log = h('pre', { class: 'pre update-log hidden' });
      const guiStatus = !gui ? 'Chưa kiểm tra.' : !gui.configured ? 'Chưa cấu hình nguồn cập nhật.' : gui.error ? 'Lỗi: ' + gui.error : gui.newer ? `Có bản mới ${gui.latest}` : `Đang dùng bản mới nhất (${gui.latest || gui.current}).`;
      const guiSrc = gui && gui.source ? (gui.fallback ? `Nguồn bạn đặt không trả lời — đang dùng nguồn dự phòng ${gui.source}` : `Nguồn: ${gui.source}`) : null;
      const cliStatus = !cli ? 'Chưa kiểm tra.' : cli.error && !cli.latest ? 'Không lấy được bản mới nhất: ' + cli.error : cli.newer ? `Có bản mới ${cli.latest}` : `Đang dùng bản mới nhất (${cli.current}).`;
      const checkBtn = btn('Kiểm tra ngay', async () => { checkBtn.disabled = true; checkBtn.textContent = 'Đang kiểm tra…'; await CG.checkUpdates(false); render(); }, '');
      const runCli = btn('Cập nhật Claude CLI', async () => {
        if ([...S().convs.values()].some((c) => c.busy) && !(await confirmDialog('Claude đang chạy', 'Có phiên đang chạy. Cập nhật CLI có thể thất bại khi tệp đang được dùng. Vẫn tiếp tục?', 'Tiếp tục'))) return;
        runCli.disabled = true;
        log.classList.remove('hidden');
        log.textContent = '$ claude update\n';
        const off = api.onUpdateLog((l) => { log.textContent += CG.stripAnsi(l) + '\n'; log.scrollTop = log.scrollHeight; });
        const r = await api.cliUpdateRun();
        off();
        log.textContent += r.code === 0 ? '\n✓ Hoàn tất.' : `\n✗ Thất bại (mã ${r.code}).`;
        S().updates.cli = await api.cliUpdateInfo();
        runCli.disabled = false;
        CG.app.loadInfo(S().active && S().active.cwd, true);
      }, cli && cli.newer ? 'primary' : '');
      const installGui = gui && gui.newer ? btn(gui.portable ? `Cập nhật lên ${gui.latest} & khởi động lại` : `Tải bản ${gui.latest}`, async () => {
        if (!gui.portable) { /^https?:/.test(gui.url) ? api.openExternal(gui.url) : api.showItem(gui.url); return; }
        const n = [...S().convs.values()].filter((c) => c.busy).length;
        if (n) {
          const m = CG.modal('Claude đang chạy tác vụ', h('div', { text: `Có ${n} phiên đang chạy. Cập nhật cần đóng app nên các tác vụ này sẽ bị dừng. Lịch chờ chạy vẫn được giữ, mở lại là chạy tiếp.` }), [
            h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }),
            h('button', { class: 'btn', text: 'Dừng tác vụ & cập nhật', onclick: async () => { m.close(); try { toast('Đang tải bản cập nhật…'); await api.guiUpdateInstall(gui, { force: true }); } catch (e) { toast(e.message, true); } } }),
            h('button', { class: 'btn primary', text: 'Tự cập nhật khi xong', onclick: async () => { m.close(); try { await api.guiUpdateInstall(gui, { later: true }); toast(`Sẽ tự cập nhật lên ${gui.latest} khi các phiên chạy xong.`); } catch (e) { toast(e.message, true); } } }),
          ]);
          return;
        }
        if (!(await confirmDialog('Cập nhật Claude GUI?', `Ứng dụng sẽ tải bản ${gui.latest}, đóng lại và tự mở bản mới.`, 'Cập nhật'))) return;
        try {
          toast('Đang tải bản cập nhật…');
          const r = await api.guiUpdateInstall(gui);
          if (r && r.busy) { await api.guiUpdateInstall(gui, { later: true }); toast(`Có phiên vừa chạy — sẽ tự cập nhật lên ${gui.latest} khi xong.`); }
        } catch (e) { toast(e.message, true); }
      }, 'primary') : null;
      el.append(
        group('Claude GUI (ứng dụng này)', null,
          row('Phiên bản', S().appInfo && S().appInfo.portable ? 'Bản portable' : S().appInfo && S().appInfo.packaged ? 'Bản đóng gói' : 'Chạy từ mã nguồn', h('span', { class: 'mono', text: (S().appInfo && S().appInfo.version) || '' })),
          row('Trạng thái', guiSrc ? h('span', {}, guiStatus, h('br'), h('span', { class: 'muted', text: guiSrc })) : guiStatus, h('div', { class: 'row' }, installGui, checkBtn)),
          gui && gui.newer && gui.notes ? h('div', { class: 'pad' }, CG.mdEl(gui.notes)) : null,
          row('Nguồn cập nhật', h('span', {}, 'Để trống = nguồn mặc định của nhóm: thử lần lượt ', h('code', { text: 'http://ADMIN:8765' }), ' (tên máy chủ — không đổi khi đổi mạng), ', h('code', { text: '192.168.1.18' }), ', ', h('code', { text: '192.168.1.66' }), ', ', h('code', { text: '192.168.1.35' }), '. Nguồn bạn đặt không trả lời thì cũng tự thử các nguồn này. Cũng nhận URL chứa latest.json, thư mục chung ', h('code', { text: '\\\\server\\share' }), ' hoặc GitHub ', h('code', { text: 'owner/repo' }), '.'), text(s.updateSource, (v) => set({ updateSource: v.trim() }).then(() => CG.checkUpdates(false)), { mono: true, placeholder: 'để trống = tự dò nguồn của nhóm' }), { stack: true }),
          row('Tự kiểm tra cập nhật', 'Khi mở ứng dụng và mỗi 6 giờ.', toggle(s.autoCheckUpdates, (v) => set({ autoCheckUpdates: v })))),
        group('Claude Code CLI', 'Phiên bản Claude Code mà GUI dùng để chạy mọi yêu cầu.',
          row('Phiên bản đang dùng', cli && cli.path ? cli.path : null, h('span', { class: 'mono', text: (cli && cli.current) || (S().info && S().info.claude_code_version) || '—' })),
          row('Bản mới nhất', cliStatus, h('div', { class: 'row' }, runCli)),
          log,
          row('Tự động cập nhật CLI', 'Tự chạy `claude update` khi có bản mới và không có phiên nào đang chạy.', toggle(s.autoUpdateCli, (v) => set({ autoUpdateCli: v }))),
          row('Có gì mới', 'Nhật ký thay đổi của Claude Code.', btn('Xem changelog', () => api.openExternal('https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md')))),
      );
    },

    shortcuts(el) {
      el.append(group(null, null, h('div', { class: 'kbd-list pad' }, (CG.SHORTCUTS || []).map(([k, d]) => h('div', { class: 'kbd-row' }, h('span', { text: d }), h('span', {}, k.split(' / ').map((g, i) => [i ? ' / ' : '', ...g.split(' ').map((x) => h('kbd', { text: x }))])))))));
    },

    about(el) {
      const ai = S().appInfo || {};
      el.append(
        h('div', { class: 'about-hero' }, logo(56), h('div', {}, h('div', { class: 'about-name', text: 'Claude GUI' }), h('div', { class: 'muted', text: `Phiên bản ${ai.version || ''} · Electron ${ai.electron || ''}` }))),
        h('p', { class: 'st-intro', text: 'Giao diện desktop thân thiện cho Claude Code. Mọi yêu cầu đều chạy qua Claude Code CLI trên máy này (giao thức stream-json), nên đăng nhập, quyền, hooks, MCP và chính sách của team được áp dụng y như khi dùng terminal. Lịch sử phiên dùng chung với CLI và có thể tiếp tục bằng claude --resume.' }),
        group('Thư mục dữ liệu', null,
          row('Cài đặt của GUI', ai.settingsFile, btn('Mở', () => api.showItem(ai.settingsFile))),
          row('Dữ liệu Claude Code', ai.claudeDir, btn('Mở', () => api.openPath(ai.claudeDir)))),
        h('p', { class: 'st-note', text: 'Biểu tượng Claude là nhãn hiệu của Anthropic (nguồn SVG: Wikimedia Commons). Ứng dụng này là công cụ nội bộ, không phải sản phẩm chính thức của Anthropic.' }),
      );
    },
  };
})();
