'use strict';
// Cài đặt → Lark: hướng dẫn tạo bot trên Lark Developer, từng bước có hình minh hoạ (vẽ lại màn hình bằng HTML, khoanh chỗ cần bấm)
(() => {
  const CG = window.CG;
  const { h } = CG;
  const api = window.api;
  const DEV = 'https://open.larksuite.com/app';
  const NAV = [
    ['Basic Info', ['Credentials & Basic Info']],
    ['Features', ['Add Features', 'Bot']],
    ['Development Configuration', ['Permissions & Scopes', 'Events & Callbacks']],
    ['App Versions', ['Version Management & Release']],
  ];

  // [quyền, tên tiếng Anh trên Lark, công dụng, bắt buộc]
  const SCOPES = [
    ['im:message:send_as_bot', 'Send messages as an app', 'Bắt buộc · gửi tin', true],
    ['im:message.p2p_msg:readonly', 'Read private messages sent to the bot', 'Bắt buộc · nhận tin trả lời', true],
    ['im:message:readonly', 'Read messages in private and group chats', 'Bắt buộc · tải ảnh / tệp người kia gửi', true],
    ['contact:user.id:readonly', 'Obtain user ID via email or mobile number', 'Bắt buộc · tìm người theo email (nút Kiểm tra)', true],
    ['im:resource', 'Read and upload images or other files', 'Tuỳ chọn · gửi / nhận ảnh, video, tệp', false],
    ['im:message.group_at_msg:readonly', 'Read group chat messages mentioning the bot', 'Tuỳ chọn · hỏi trong nhóm', false],
  ];

  // ---- mảnh vẽ ----
  const hl = (el, on) => { if (on) el.classList.add('lg-hl'); return el; };
  const btn = (t, on, pri) => hl(h('span', { class: 'lg-btn' + (pri ? ' pri' : ''), text: t }), on);
  const field = (label, val, on, mono) => h('div', { class: 'lg-field' }, h('span', { class: 'lg-lab', text: label }), hl(h('span', { class: 'lg-val' + (mono ? ' mono' : ''), text: val }), on));
  const note = (t) => h('div', { class: 'lg-note', text: t });
  const radio = (t, on, sub) => hl(h('div', { class: 'lg-radio' + (on ? ' on' : '') }, h('i'), h('div', {}, h('b', { text: t }), sub ? h('div', { class: 'lg-sub', text: sub }) : null)), on);
  function win(active, body, opts = {}) {
    const nav = h('div', { class: 'lg-nav' }, h('div', { class: 'lg-app' }, h('span', { class: 'lg-ico', text: 'C' }), h('b', { text: 'Claude' })),
      ...NAV.map(([g, items]) => h('div', { class: 'lg-grp' }, h('div', { class: 'lg-gt', text: g }), ...items.map((it) => hl(h('div', { class: 'lg-ni' + (it === active ? ' on' : ''), text: it }), it === active)))));
    return h('div', { class: 'lg-win' },
      h('div', { class: 'lg-bar' }, h('i'), h('i'), h('i'), h('span', { class: 'lg-url', text: opts.url || 'open.larksuite.com/app/cli_xxxx/' + (opts.path || '') })),
      h('div', { class: 'lg-body' + (opts.full ? ' full' : '') }, opts.full ? null : nav, h('div', { class: 'lg-main' }, ...body)));
  }

  const STEPS = [
    {
      t: 'Tạo app tự tạo (Custom App)',
      d: ['Mở Lark Developer, đăng nhập bằng tài khoản Lark công ty.', 'Bấm Create Custom App, đặt tên app (vd “Claude”) — đây là tên bot người nhận sẽ thấy. Mô tả và icon tuỳ ý.'],
      link: true,
      pic: () => win('', [
        h('div', { class: 'lg-row sp' }, h('b', { class: 'lg-h', text: 'Developer Console' }), btn('Create Custom App', true, true)),
        h('div', { class: 'lg-modal' },
          h('b', { text: 'Create Custom App' }),
          field('App name', 'Claude', true), field('Description', 'Bot hỏi đáp của Claude GUI'), field('App icon', '🟦 (tuỳ chọn)'),
          h('div', { class: 'lg-row end' }, btn('Cancel'), btn('Create', false, true))),
      ], { full: true, url: 'open.larksuite.com/app' }),
    },
    {
      t: 'Bật tính năng Bot',
      d: ['Vào Add Features (mục Features).', 'Ở thẻ Bot bấm Add. Sau đó menu bên trái có thêm mục “Bot”.'],
      pic: () => win('Add Features', [
        h('b', { class: 'lg-h', text: 'Add Features' }),
        h('div', { class: 'lg-cards' },
          hl(h('div', { class: 'lg-card' }, h('div', { class: 'lg-ct', text: '🤖 Bot' }), h('div', { class: 'lg-sub', text: 'Interact with users in chats' }), btn('Add', true, true)), true),
          h('div', { class: 'lg-card dim' }, h('div', { class: 'lg-ct', text: '🌐 Web App' }), h('div', { class: 'lg-sub', text: 'Không cần' }), btn('Add')),
          h('div', { class: 'lg-card dim' }, h('div', { class: 'lg-ct', text: '🧩 Workplace Widget' }), h('div', { class: 'lg-sub', text: 'Không cần' }), btn('Add'))),
      ], { path: 'feature' }),
    },
    {
      t: 'Cấp quyền (Permissions & Scopes)',
      d: ['Vào Permissions & Scopes → Add permission scopes. Ô tìm kiếm của Lark nhận từng quyền một: bấm 📋 cạnh mỗi quyền để chép, dán vào ô tìm, tick rồi thêm.',
        '3 quyền đầu là BẮT BUỘC. 2 quyền sau là tuỳ chọn: im:resource để gửi / nhận ảnh, video, tệp trong khung chat; group_at_msg nếu muốn hỏi trong group chat (người kia phải @bot).',
        'Thiếu quyền nào thì khi dùng tới, Claude GUI sẽ báo đúng tên quyền đó — thêm vào rồi phát hành version mới.',
        'Trang có nút Batch import / Import thì bấm “Chép JSON nhập hàng loạt” rồi dán một lần là đủ 3 quyền bắt buộc.'],
      pic: () => win('Permissions & Scopes', [
        h('div', { class: 'lg-row sp' }, h('b', { class: 'lg-h', text: 'Permissions & Scopes' }), btn('Add permission scopes', true, true)),
        h('div', { class: 'lg-table' },
          ...SCOPES.map(([k, en, vi, must]) => h('div', { class: 'lg-tr' + (must ? ' must' : '') }, h('span', { class: 'lg-ok', text: '✓' }), h('div', {}, h('code', { text: k }), h('div', { class: 'lg-sub', text: en })),
            h('span', { class: 'lg-tag' + (must ? ' must' : ''), text: vi }),
            h('button', { class: 'lg-cp', title: 'Chép ' + k, text: '📋', onclick: () => { navigator.clipboard.writeText(k); CG.toast('Đã chép ' + k); } })))),
      ], { path: 'auth' }),
      extra: () => [
        h('button', { class: 'btn sm', text: 'Chép 3 quyền bắt buộc (mỗi dòng một quyền)', onclick: () => { navigator.clipboard.writeText(SCOPES.filter((x) => x[3]).map((x) => x[0]).join('\n')); CG.toast('Đã chép 3 quyền bắt buộc.'); } }),
        h('button', { class: 'btn sm', text: 'Chép JSON nhập hàng loạt', title: 'Dùng với nút Batch import trên trang Permissions & Scopes (nếu có)', onclick: () => { navigator.clipboard.writeText(JSON.stringify({ scopes: { tenant: SCOPES.filter((x) => x[3]).map((x) => x[0]), user: [] } }, null, 2)); CG.toast('Đã chép JSON.'); } }),
      ],
    },
    {
      t: 'Nhận tin nhắn (Events & Callbacks)',
      d: ['Vào Events & Callbacks → Event configuration → Subscription mode: chọn “Receive events through persistent connection” (kết nối dài — không cần server công khai), bấm Save.',
        'Bấm Add Events, tìm “Message received” (im.message.receive_v1) rồi thêm. Nên thêm cả “Message read” (im.message.message_read_v1) để khung chat hiện “Đã xem” khi người kia đọc tin. Lark có hỏi thêm quyền cho sự kiện nào thì đồng ý thêm.',
        'Nếu Lark báo chưa thấy kết nối khi Save: làm bước 6 trước (dán App ID / Secret vào Claude GUI để bot kết nối), rồi quay lại Save.'],
      pic: () => win('Events & Callbacks', [
        h('b', { class: 'lg-h', text: 'Event configuration' }),
        h('div', { class: 'lg-box' }, h('div', { class: 'lg-sub', text: 'Subscription mode' }),
          radio('Receive events through persistent connection', true, 'Recommended · no public URL needed'),
          radio('Send events to developer server', false)),
        h('div', { class: 'lg-row sp' }, h('b', { text: 'Added events' }), btn('Add Events', true, true)),
        h('div', { class: 'lg-table' }, hl(h('div', { class: 'lg-tr must' }, h('span', { class: 'lg-ok', text: '✓' }), h('div', {}, h('b', { text: 'Message received' }), h('div', { class: 'lg-sub' }, h('code', { text: 'im.message.receive_v1' }))), h('span', { class: 'lg-tag must', text: 'Bắt buộc' })), true),
          hl(h('div', { class: 'lg-tr' }, h('span', { class: 'lg-ok', text: '✓' }), h('div', {}, h('b', { text: 'Message read' }), h('div', { class: 'lg-sub' }, h('code', { text: 'im.message.message_read_v1' }))), h('span', { class: 'lg-tag', text: 'Nên có · “Đã xem”' })), true)),
      ], { path: 'event' }),
    },
    {
      t: 'Phạm vi dùng & phát hành',
      d: ['Vào Version Management & Release → Create a version: điền số phiên bản (1.0.0), ghi chú.',
        'Availability (phạm vi dùng): chọn những người sẽ dùng / được hỏi — bạn, designer… Người ngoài phạm vi thì bot không nhắn được.',
        'Save → Submit for release. Admin tổ chức (HR/IT) duyệt trong Lark Admin; báo họ tên app. Duyệt xong bot hiện trong Lark.',
        'Quyền, sự kiện và phạm vi dùng chỉ có hiệu lực SAU KHI version được duyệt. Trong lúc app còn “Pending release”, Claude GUI có thể báo “Bot thiếu quyền … (99991672)” dù bạn đã thêm — chờ duyệt xong là hết.',
        'Mỗi lần đổi quyền, sự kiện hay phạm vi dùng phải tạo version mới và phát hành lại.'],
      pic: () => win('Version Management & Release', [
        h('b', { class: 'lg-h', text: 'Create a version' }),
        field('App version', '1.0.0'), field('Update notes', 'Bot hỏi đáp cho dev / game design'),
        h('div', { class: 'lg-field' }, h('span', { class: 'lg-lab', text: 'Availability' }), hl(h('span', { class: 'lg-val' }, h('span', { class: 'lg-chip', text: '👤 Thành Anh' }), h('span', { class: 'lg-chip', text: '👤 Hùng' }), h('span', { class: 'lg-chip add', text: '+ Add' })), true)),
        h('div', { class: 'lg-row end' }, btn('Save', false), btn('Submit for release', true, true)),
        note('→ Admin duyệt: “App release request approved”'),
      ], { path: 'version' }),
    },
    {
      t: 'Lấy App ID & App Secret → dán vào Claude GUI',
      d: ['Vào Credentials & Basic Info, chép App ID và App Secret.', 'Dán vào mục “Bot Lark” ở trên (App Secret tự dán, đừng gửi qua chat với Claude), chọn đúng máy chủ (Lark quốc tế hoặc Feishu), bấm Lưu & kết nối → trạng thái “Đã kết nối”.'],
      pic: () => win('Credentials & Basic Info', [
        h('b', { class: 'lg-h', text: 'App Credentials' }),
        hl(field('App ID', 'cli_a1b2c3d4e5f6g7h8', false, true), true),
        hl(h('div', { class: 'lg-field' }, h('span', { class: 'lg-lab', text: 'App Secret' }), h('span', { class: 'lg-val mono', text: '••••••••••••••••' }), btn('Copy'), btn('Reset')), true),
        h('div', { class: 'lg-arrow', text: '⬇ dán vào Claude GUI' }),
        h('div', { class: 'lg-gui' }, field('App ID', 'cli_a1b2c3d4e5f6g7h8', false, true), field('App Secret', '•••••••• đã lưu'), h('div', { class: 'lg-row end' }, h('span', { class: 'lg-pill', text: 'Đã kết nối' }), btn('Lưu & kết nối', true, true))),
      ], { path: 'baseinfo' }),
    },
    {
      t: 'Danh bạ & thử hỏi',
      d: ['Ở mục Danh bạ: thêm người (tên, vai trò, email tài khoản Lark), bấm Kiểm tra → ✓ là bot tìm thấy.',
        'Trong một phiên, bảo Claude kiểu “hỏi Hùng qua Lark: …” → hiện thẻ → bấm Gửi qua Lark.',
        'Người kia nhắn lại (bao nhiêu tin cũng được) → tin hiện ở khung Lark trên ô nhập. Bấm “Phân tích” để Claude đọc cả cụm trong một lượt, hoặc nhắn thẳng lại cho họ ngay trong khung (không tốn token).'],
      pic: () => win('', [
        h('div', { class: 'lg-gui' },
          h('div', { class: 'lg-row' }, h('span', { class: 'lg-val', text: 'Hùng' }), h('span', { class: 'lg-val', text: 'Game Designer' }), h('span', { class: 'lg-val mono', text: 'hung@cty.com' }), h('span', { class: 'lg-ok', text: '✓' }), btn('Kiểm tra', true))),
        h('div', { class: 'lg-dock' },
          h('div', { class: 'lg-row' }, h('span', { class: 'lg-ico l', text: 'L' }), h('span', { class: 'lg-chip on', text: 'Hùng  3' }), h('span', { class: 'lg-sp' }), btn('Phân tích (3 tin)', true, true)),
          h('div', { class: 'lg-msg me', text: '❓ Đấu giá bang có mấy item?' }),
          h('div', { class: 'lg-msg', text: 'tàng bảo đồ có' }), h('div', { class: 'lg-msg', text: 'thẻ may mắn có' }), h('div', { class: 'lg-msg', text: 'có hết nhé' }),
          h('div', { class: 'lg-in', text: 'Nhắn thẳng cho Hùng qua bot…' })),
        h('div', { class: 'lg-compose', text: 'Giao việc cho Claude…' }),
      ], { full: true, url: 'Claude GUI' }),
    },
  ];

  const TROUBLE = [
    ['“app id not exists” / không kết nối được', 'Sai App ID, hoặc chọn nhầm máy chủ (app tạo trên larksuite.com thì chọn Lark, trên feishu.cn thì chọn Feishu).'],
    ['Kiểm tra danh bạ ra ✗', 'Email không đúng tài khoản Lark, người đó khác tổ chức, hoặc chưa nằm trong Availability — thêm vào rồi tạo version mới.'],
    ['Gửi được nhưng không thấy tin trả lời', 'Thiếu sự kiện im.message.receive_v1, chưa chọn persistent connection, thiếu quyền im:message.p2p_msg:readonly, hoặc chưa phát hành version có các thay đổi đó. Claude GUI phải đang mở thì mới nhận tin.'],
    ['“Bot thiếu quyền …” (99991672)', 'Thiếu quyền ở bước 3, hoặc đã thêm nhưng version chưa được duyệt (app còn “Pending release”) — chờ admin duyệt.'],
    ['Nhiều máy cùng dùng một app', 'Mỗi tin trả lời chỉ đến một máy đang kết nối (ngẫu nhiên). Mỗi người nên tạo app riêng, hoặc chỉ một máy bật Lark.'],
  ];

  function guide() {
    let i = 0;
    const root = h('div', { class: 'lg' });
    const draw = () => {
      const s = STEPS[i];
      root.innerHTML = '';
      root.append(
        h('div', { class: 'lg-steps' }, STEPS.map((x, k) => h('button', { class: 'lg-step' + (k === i ? ' on' : k < i ? ' done' : ''), title: x.t, onclick: () => { i = k; draw(); } }, h('span', { text: String(k + 1) }), h('em', { text: x.t })))),
        h('div', { class: 'lg-text' },
          h('div', { class: 'lg-title', text: `Bước ${i + 1}/${STEPS.length} · ${s.t}` }),
          h('ol', {}, s.d.map((t) => h('li', { text: t }))),
          h('div', { class: 'lg-row' },
            s.link ? h('button', { class: 'btn sm', text: 'Mở Lark Developer ↗', onclick: () => api.openExternal(DEV) }) : null,
            s.extra ? s.extra() : null)),
        s.pic(),
        h('div', { class: 'lg-row end' },
          h('button', { class: 'btn sm', text: '← Trước', disabled: i === 0, onclick: () => { i--; draw(); } }),
          h('button', { class: 'btn sm primary', text: i === STEPS.length - 1 ? 'Xem lại từ đầu' : 'Tiếp →', onclick: () => { i = (i + 1) % STEPS.length; draw(); } })),
        h('details', { class: 'lg-trouble' }, h('summary', { text: 'Gặp lỗi? Các lỗi hay gặp' }),
          ...TROUBLE.map(([q, a]) => h('div', { class: 'lg-tq' }, h('b', { text: q }), h('div', { text: a })))));
    };
    draw();
    return root;
  }
  CG.larkGuide = guide;
})();
