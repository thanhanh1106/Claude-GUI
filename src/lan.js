'use strict';
// Máy thợ trong mạng LAN: máy chính gửi thẳng kế hoạch / dự án tự động sang Claude GUI ở máy khác (không cần chép tệp .cgpack),
// máy thợ nhập (đổi đường dẫn, ghi chú chuyển máy như pack.js), tuỳ chọn chạy luôn; máy chính hỏi tiến độ + bàn giao định kỳ.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, toast, modal, basename } = CG;
  const S = () => CG.S;
  const SC = () => CG.sched;
  const save = () => SC()._h.save();
  const render = () => SC()._h.render();
  const fmtT = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const ST = { wait: 'chờ', run: 'đang chạy', done: 'xong', skip: 'bỏ qua', err: 'lỗi', ask: 'cần xem', pause: 'tạm dừng', part: 'dở dang' };
  const RS = { running: 'Đang chạy', paused: 'Tạm dừng', done: 'Xong', idle: 'Chưa chạy' };
  const peers = () => S().settings.lanPeers || [];
  const savePeers = (list) => CG.saveSettings({ lanPeers: list });

  // =====================================================================
  // Phía MÁY THỢ: main hỏi renderer để nhập kế hoạch / đọc trạng thái
  // =====================================================================
  if (api.onLanReq) api.onLanReq(async ({ rid, kind, data }) => {
    let v;
    try { v = kind === 'import' ? await onImport(data) : kind === 'status' ? status(data.id) : { ok: false, error: 'Không rõ yêu cầu' }; } catch (e) { v = { ok: false, error: e.message }; }
    api.lanRes(rid, v);
  });
  async function onImport(d) {
    if (!CG.pack || !CG.pack._finish) return { ok: false, error: 'Máy thợ chưa sẵn sàng' };
    const p = CG.pack._finish(d.r, d.pk, d.map || {});
    p.lan = { from: d.sender, t: Date.now() };
    // chạy luôn chỉ khi git ở máy thợ đã có đúng commit của máy chính
    const gitBad = (d.r.git || []).filter((g) => g.from && g.from.head && !g.hasCommit);
    let started = false;
    if (d.autorun && !gitBad.length) {
      p.on = true; p.armedAt = Date.now();
      if (p.kind === 'project') p.proj.approved = true;
      p.run.note = `📡 Nhận từ máy ${(d.sender && d.sender.host) || '?'} lúc ${fmtT(Date.now())} — chạy luôn theo yêu cầu.`;
      save(); render();
      setTimeout(() => SC().runPlan(p, 0), 300);
      started = true;
    } else { p.run.note = `📡 Nhận từ máy ${(d.sender && d.sender.host) || '?'} lúc ${fmtT(Date.now())} — đang TẮT${gitBad.length ? ' (git chưa có commit của máy chính — pull trước)' : ''}. Xem ghi chú chuyển máy rồi bật để chạy.`; save(); render(); }
    const msg = `${(d.sender && d.sender.host) || 'Máy chính'} giao “${p.name}”${started ? ' — đang chạy' : ''}`;
    toast('📡 ' + msg);
    if (!document.hasFocus()) api.notify('Claude GUI · nhận việc từ máy khác', msg);
    if (CG.mascot && CG.mascot.bubble) CG.mascot.bubble([h('div', { text: '📡 Có việc mới từ máy khác' }), h('div', { class: 'mb-sub', text: msg })], { ms: 10000, acts: [{ label: 'Xem', p: 1, run: () => SC().open(p.id) }, { label: 'OK' }] });
    return { ok: true, id: p.id, name: p.name, started, gitWarn: gitBad.map((g) => `${g.label || g.key}: máy thợ chưa có commit ${String(g.from.head).slice(0, 8)} (nhánh ${g.from.branch})`), dead: d.r.dead || [] };
  }
  function status(id) {
    const p = (SC().plans || []).find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Máy thợ không còn kế hoạch này (đã xoá?)' };
    const r = p.run || {};
    const out = { ok: true, id, name: p.name, kind: p.kind, on: !!p.on, state: r.state || 'idle', note: r.note || '', t: Date.now() };
    if (p.kind === 'project') {
      const P = p.proj;
      out.tasks = P.tasks.map((t) => ({ id: t.id, title: t.title, st: t.st, cost: t.cost || 0 }));
      out.hold = P.hold ? { kind: P.hold.kind, reason: P.hold.reason || '', at: P.hold.at } : null;
      out.runDir = P.run;
      out.log = (P.log || []).slice(-6);
    } else out.tasks = (p.nodes || []).map((n, i) => ({ id: n.id, title: (n.prompt || '').split('\n').find((l) => l.trim() && !/^>|CHUYỂN MÁY/.test(l)) || `Bước ${i + 1}`, st: (r.st || [])[i] || 'wait' }));
    return out;
  }

  // =====================================================================
  // Phía MÁY CHÍNH: chọn máy thợ, đổi đường dẫn, gửi; theo dõi tiến độ
  // =====================================================================
  async function sendDialog(p) {
    if (p.run && p.run.state === 'running') return toast('Kế hoạch đang chạy — dừng trước khi giao sang máy khác.', true);
    const roots = CG.pack._rootsOf(p);
    let info = null, cur = peers()[0] || null;
    const body = h('div', { class: 'pk-imp lan-send' });
    const peerSel = h('select', { class: 'text-input' });
    const addr = h('input', { type: 'text', class: 'text-input mono', placeholder: 'Địa chỉ máy thợ: tên máy hoặc IP (vd MAY2 hoặc 192.168.1.70)' });
    const key = h('input', { type: 'text', class: 'text-input mono', placeholder: 'Khoá máy thợ (xem ở máy thợ: Cài đặt › Máy thợ LAN)' });
    const infoBox = h('div', { class: 'pk-muted' });
    const mapBox = h('div', { class: 'lan-map' });
    const auto = h('input', { type: 'checkbox' }); auto.checked = true;
    const inputs = {};
    const fillPeers = () => {
      peerSel.innerHTML = '';
      peerSel.append(...peers().map((x, i) => h('option', { value: String(i), text: `${x.name || x.url} · ${x.url}` })), h('option', { value: 'new', text: '+ Máy thợ mới…' }));
      const i = cur ? peers().findIndex((x) => x.url === cur.url) : -1;
      peerSel.value = i >= 0 ? String(i) : 'new';
      addr.value = cur ? cur.url : ''; key.value = cur ? cur.key : '';
    };
    peerSel.onchange = () => { cur = peerSel.value === 'new' ? null : peers()[+peerSel.value]; fillPeers(); info = null; drawMap(); if (cur) check(); };
    const check = async () => {
      if (!addr.value.trim() || !key.value.trim()) return toast('Nhập địa chỉ và khoá máy thợ.', true);
      infoBox.textContent = 'Đang kết nối…';
      const r = await api.lanCall({ url: addr.value.trim(), key: key.value.trim(), path: '/cg/info' });
      if (!r.ok) { info = null; infoBox.textContent = '✗ ' + r.error; infoBox.className = 'pk-warn-s'; drawMap(); return; }
      info = r; infoBox.className = 'pk-ok';
      infoBox.textContent = `✓ ${r.name} (${r.user}) · Claude GUI ${r.gui}`;
      const list = peers().filter((x) => x.url.toLowerCase() !== addr.value.trim().toLowerCase());
      cur = { name: r.name, url: addr.value.trim(), key: key.value.trim() };
      savePeers([cur, ...list].slice(0, 12));
      drawMap();
    };
    const drawMap = async () => {
      mapBox.innerHTML = '';
      if (!info) return;
      const dl = h('datalist', { id: 'lan-dirs' }, (info.dirs || []).map((d) => h('option', { value: d })));
      mapBox.append(dl, h('div', { class: 'pk-sec', text: `Thư mục ở máy ${info.name}` }));
      const marks = {};
      for (const r of roots) {
        const inp = h('input', { type: 'text', class: 'text-input mono', value: r.path, list: 'lan-dirs' });
        const mark = h('span', { class: 'pk-mark' });
        inputs[r.key] = inp; marks[r.key] = mark;
        inp.onchange = () => verify();
        mapBox.append(h('div', { class: 'pk-root' }, h('div', { class: 'pk-rl' }, h('b', { text: r.label }), h('span', { class: 'pk-old', text: 'máy này: ' + r.path })), h('div', { class: 'pk-rr' }, inp, mark)));
      }
      const verify = async () => {
        const ps = Object.values(inputs).map((x) => x.value.trim()).filter(Boolean);
        const r = await api.lanCall({ url: cur.url, key: cur.key, path: '/cg/exists', method: 'POST', body: { paths: ps } });
        for (const [k, inp] of Object.entries(inputs)) { const ok = r.ok && r.exists[inp.value.trim()]; marks[k].textContent = ok ? '✓' : '✗ không có'; marks[k].className = 'pk-mark ' + (ok ? 'ok' : 'bad'); }
      };
      verify();
    };
    fillPeers();
    body.append(
      h('div', { class: 'pk-head' }, h('b', { text: (p.kind === 'project' ? '🤖 ' : '🗓 ') + p.name }), h('div', { class: 'pk-muted', text: 'Gửi thẳng qua mạng LAN sang Claude GUI ở máy thợ — máy thợ phải bật “Nhận việc từ máy khác”.' })),
      peerSel, h('div', { class: 'pk-rr' }, addr, h('button', { class: 'btn sm', text: 'Kiểm tra', onclick: check })), key, infoBox, mapBox,
      h('label', { class: 'pk-ow' }, auto, ' Chạy luôn ở máy thợ (chỉ chạy nếu git bên đó đã có đúng commit; không thì để TẮT chờ bạn xem)'),
      h('p', { class: 'pk-muted', text: 'Máy này sẽ tắt kế hoạch để không chạy trùng, và theo dõi tiến độ + bàn giao từ máy thợ ngay trong trang kế hoạch.' }));
    let m = null;
    const go = async (btn) => {
      if (!info || !cur) return toast('Bấm “Kiểm tra” để kết nối máy thợ trước.', true);
      const map = {};
      for (const [k, inp] of Object.entries(inputs)) if (inp.value.trim()) map[k] = inp.value.trim();
      btn.disabled = true; btn.textContent = 'Đang gửi…';
      const plan = JSON.parse(JSON.stringify(p));
      delete plan.exported;
      const files = p.kind === 'project' ? [] : (p.nodes || []).flatMap((n) => (n.atts || []).filter((a) => a.kind === 'file' || a.kind === 'image').map((a) => a.path));
      const r = await api.lanSend({ peer: { url: cur.url, key: cur.key }, plan, roots, runDir: p.kind === 'project' ? p.proj.run : '', files, map, autorun: auto.checked });
      btn.disabled = false; btn.textContent = 'Gửi';
      if (!r.ok) return toast('Không gửi được: ' + (r.error || 'lỗi'), true);
      p.exported = { t: Date.now(), file: '', wasOn: !!p.on, worker: { name: info.name, url: cur.url, key: cur.key }, remoteId: r.id, started: !!r.started };
      p.on = false;
      p.run.note = `📡 Đã giao cho máy thợ ${info.name} lúc ${fmtT(Date.now())}${r.started ? ' — đang chạy bên đó' : ' — bên đó đang TẮT, chờ bật'}.`;
      save(); render();
      m.close();
      const warns = [...(r.gitWarn || []), ...(r.dead || []).slice(0, 5).map((x) => 'không có ở máy thợ: ' + x)];
      toast(`Đã giao “${p.name}” cho ${info.name}${r.started ? ' — đang chạy' : ''}.`);
      if (warns.length) modal('Đã giao — cần để ý', h('div', { class: 'pk-sum' }, h('ul', {}, warns.map((w) => h('li', { text: w })))), [h('button', { class: 'btn primary', text: 'OK', onclick: () => (document.getElementById('modal-root').innerHTML = '') })]);
      setTimeout(() => poll(p, true), 4000);
    };
    const sendBtn = h('button', { class: 'btn primary', text: 'Gửi' });
    sendBtn.onclick = () => go(sendBtn);
    m = modal('Giao cho máy thợ trong mạng LAN', body, [h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }), sendBtn], { cls: 'wide' });
    if (cur) check();
  }

  // hỏi tiến độ từ máy thợ; báo khi trạng thái đổi (xong / dừng chờ xem)
  async function poll(p, quiet) {
    const E = p.exported;
    if (!E || !E.worker || !E.remoteId) return;
    const r = await api.lanCall({ url: E.worker.url, key: E.worker.key, path: '/cg/status?id=' + encodeURIComponent(E.remoteId) });
    const prev = E.last;
    if (!r.ok) { E.lastErr = { t: Date.now(), error: r.error }; save(); if (!quiet) render(); return; }
    E.last = r; E.lastErr = null;
    const changed = !prev || prev.state !== r.state || !!prev.hold !== !!r.hold || (prev.tasks || []).filter((t) => t.st === 'done').length !== (r.tasks || []).filter((t) => t.st === 'done').length;
    save();
    if (changed) render();
    if (prev && (prev.state !== r.state || (!prev.hold && r.hold))) {
      const what = r.state === 'done' ? 'đã xong 🎉' : r.hold ? 'đang dừng — cần bạn xem' : RS[r.state] || r.state;
      const msg = `Máy thợ ${E.worker.name}: “${p.name}” ${what}`;
      toast('📡 ' + msg);
      if (!document.hasFocus()) api.notify('Claude GUI · máy thợ', msg);
      if (CG.mascot && CG.mascot.bubble) CG.mascot.bubble([h('div', { text: '📡 ' + msg }), r.note ? h('div', { class: 'mb-sub', text: r.note }) : null], { ms: 12000, acts: [{ label: 'Xem', p: 1, run: () => SC().open(p.id) }, { label: 'OK' }] });
    }
  }
  setInterval(() => {
    for (const p of (SC() && SC().plans) || []) if (p.exported && p.exported.worker && !(p.exported.last && p.exported.last.state === 'done')) poll(p, true);
  }, 60000);

  // khung theo dõi trong trang kế hoạch (pack.banner gọi khi kế hoạch đã giao cho máy thợ)
  function banner(p) {
    const E = p.exported, L = E.last;
    const done = L && L.tasks ? L.tasks.filter((t) => t.st === 'done' || t.st === 'skip').length : 0;
    const box = h('div', { class: 'pk-banner out lan-ban' },
      h('b', { text: `📡 Đã giao cho máy thợ ${E.worker.name} lúc ${fmtT(E.t)}` }),
      E.lastErr ? h('div', { class: 'pk-warn-s', text: `⚠ Không hỏi được máy thợ (${fmtT(E.lastErr.t)}): ${E.lastErr.error}` }) : null,
      L ? h('div', {}, `${RS[L.state] || L.state}${L.on ? '' : ' · đang TẮT'} · ${done}/${(L.tasks || []).length} ${p.kind === 'project' ? 'task' : 'bước'} xong · cập nhật ${fmtT(L.t)}`) : h('div', { class: 'pk-muted', text: 'Chưa có tin từ máy thợ.' }),
      L && L.hold ? h('div', { class: 'pk-warn-s', text: `⚠ Đang dừng (${L.hold.kind})${L.hold.reason ? ': ' + L.hold.reason.slice(0, 200) : ''} — xử lý ở máy thợ.` }) : null,
      L && L.note ? h('div', { class: 'pk-muted', text: L.note }) : null);
    if (L && L.tasks && L.tasks.length) box.append(h('details', {}, h('summary', { text: 'Danh sách task' }), h('ul', { class: 'lan-tasks' }, L.tasks.map((t, i) => h('li', { class: 'st-' + t.st, text: `${i + 1}. ${t.title} — ${ST[t.st] || t.st}` })))));
    if (L && L.handoffs && L.handoffs.length) box.append(h('details', {}, h('summary', { text: `Bàn giao mới nhất (${L.handoffs.length})` }), ...L.handoffs.map((x) => h('div', { class: 'lan-ho' }, h('div', { class: 'pk-muted', text: `${x.task} · ${fmtT(x.t)}` }), CG.mdEl(x.text)))));
    box.append(h('div', { class: 'row', style: 'display:flex;gap:6px;flex-wrap:wrap' },
      h('button', { class: 'btn sm', text: 'Cập nhật ngay', onclick: () => poll(p).then(render) }),
      h('button', { class: 'btn sm', text: 'Bỏ đánh dấu (chạy lại ở máy này)', onclick: () => { delete p.exported; p.run.note = ''; save(); render(); } })));
    return box;
  }

  // =====================================================================
  // Cài đặt → Máy thợ (LAN)
  // =====================================================================
  let lanInfoCache = null;
  if (api.onLanState) api.onLanState((x) => { lanInfoCache = x; if (document.querySelector('.st-content .lan-set') && CG.openSettings) CG.openSettings('lan'); });
  async function settingsPage(el, u) {
    const info = lanInfoCache = await api.lanInfo();
    const s = S().settings;
    const urls = info.addrs.map((a) => `${a}:${info.port}`);
    const copy = (t) => { navigator.clipboard.writeText(t); toast('Đã chép'); };
    const st = info.on ? `Đang nhận việc ở cổng ${info.port}` : info.want ? (info.error ? 'Lỗi: ' + info.error : 'Đang mở cổng…') : 'Đang tắt';
    el.append(h('div', { class: 'lan-set' }),
      u.group('Máy này làm máy thợ', 'Cho Claude GUI ở máy khác trong mạng LAN gửi thẳng kế hoạch / dự án tự động sang máy này chạy (không cần chép tệp). Máy kia cần địa chỉ và khoá bên dưới. Lần đầu bật, Windows có thể hỏi cho phép qua tường lửa — chọn mạng Riêng (Private).',
        u.row('Nhận việc từ máy khác', st, u.toggle(!!s.lanWorker, async (v) => { await u.set({ lanWorker: v }); await api.lanApply(); setTimeout(u.render, 400); })),
        u.row('Địa chỉ', 'Đưa một trong các địa chỉ này cho máy chính (tên máy không đổi khi đổi IP).', h('div', { class: 'lan-addrs' }, [`${info.host}:${info.port}`, ...urls].map((x) => h('button', { class: 'btn sm mono', title: 'Chép', text: x, onclick: () => copy(x) })))),
        u.row('Khoá', 'Ai có khoá này đều gửi được việc cho máy này chạy — chỉ đưa cho người tin tưởng.', h('div', { class: 'row', style: 'display:flex;gap:6px;align-items:center' },
          h('code', { class: 'lan-key', text: info.key }), h('button', { class: 'btn sm', text: 'Chép', onclick: () => copy(info.key) }),
          h('button', { class: 'btn sm', text: 'Đổi khoá', onclick: async () => { if (await CG.confirmDialog('Đổi khoá?', 'Máy chính đang dùng khoá cũ sẽ không gửi / theo dõi được nữa cho tới khi nhập khoá mới.', 'Đổi')) { await api.lanNewKey(); u.render(); } } })))),
      u.group('Máy thợ đã lưu', 'Dùng khi giao việc: trang kế hoạch › Giao cho máy thợ…',
        ...(peers().length ? peers().map((x, i) => u.row(x.name || x.url, x.url, h('button', { class: 'btn sm', text: 'Xoá', onclick: async () => { await savePeers(peers().filter((_, j) => j !== i)); u.render(); } }))) : [u.row('Chưa có', 'Thêm khi giao việc lần đầu (nhập địa chỉ + khoá rồi bấm Kiểm tra).', null)])));
  }

  CG.lan = { sendDialog, poll, banner, settingsPage, _status: status, _onImport: onImport };
})();
