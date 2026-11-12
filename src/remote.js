'use strict';
// Truy cập phiên từ máy khác (qua Tailscale / LAN).
// • Máy chạy phiên: chuột phải phiên → "Cho máy khác thấy & điều khiển" → token riêng của phiên. Sự kiện CLI của phiên được
//   đẩy sang máy đang xem; thao tác từ xa (nhắn, duyệt quyền, dừng) chạy ở đây như người dùng bấm, nên hai bên luôn khớp.
// • Máy xem (vd ở nhà): "Thêm phiên bằng token…" → phiên hiện ở nhóm 🏢 <máy> trên thanh bên, mở ra là khung chat như thường
//   (Conv có .rs = liên kết) — dựng lịch sử từ máy kia, nhận sự kiện trực tiếp, gửi tin / duyệt / dừng qua máy kia.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, toast, modal, basename, svg } = CG;
  const S = () => CG.S;
  const A = () => CG.app;
  const fmtT = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const copy = (t) => { navigator.clipboard.writeText(t); toast('Đã chép'); };

  // =====================================================================
  // MÁY CHẠY PHIÊN
  // =====================================================================
  let shared = new Set();
  let pubs = new Set(); // phiên công khai cho máy đã kết nối
  let devs = []; // máy đã kết nối tới máy này
  let live = new Map(); // sid -> [tên máy đang xem]
  const loadShared = () => Promise.all([api.rsShares(), api.rsDevices ? api.rsDevices() : []]).then(([l, d]) => {
    shared = new Set((l || []).map((x) => x.sid));
    tokSids = new Set((l || []).filter((x) => x.token).map((x) => x.sid));
    pubs = new Set((l || []).filter((x) => x.pub).map((x) => x.sid));
    devs = d || [];
    A() && A().renderSidebar();
  }).catch(() => {});
  loadShared();
  if (api.onRsLive) api.onRsLive((list) => {
    live = new Map((list || []).map((x) => [x.sid, x.names]));
    if (A()) { A().renderSidebar(); const c = S().active; if (c) titleChip(c); }
  });
  const isShared = (sid) => shared.has(sid);
  let tokSids = new Set();
  const hasToken = (sid) => tokSids.has(sid);
  const watching = (sid) => live.get(sid) || [];

  // đẩy sự kiện của phiên chia sẻ sang máy đang xem (chỉ khi có máy đang xem)
  function emit(conv, m) { if (!conv.rs && live.has(conv.sid)) api.rsEmit(conv.sid, m); }
  function userSent(conv, text, images) { if (!conv.rs && live.has(conv.sid)) api.rsEmit(conv.sid, { type: 'gui_user', text: text || '', images: (images || []).slice(0, 6), from: conv._rsFrom || '', via: conv._rsVia || '' }); }
  function permDone(conv, reqId, label, ok) { if (!conv.rs && live.has(conv.sid)) api.rsEmit(conv.sid, { type: 'gui_perm_done', request_id: reqId, label, ok }); }
  function busyChanged(conv) { if (!conv.rs && live.has(conv.sid)) api.rsEmit(conv.sid, { type: 'gui_busy', v: !!conv.busy }); }

  const localConv = (sid) => A().convs().find((c) => c.sid === sid && !c.rs);
  if (api.onRsReq) api.onRsReq(async ({ rid, kind, data }) => {
    let v;
    try { v = await onReq(kind, data || {}); } catch (e) { v = { ok: false, error: e.message }; }
    api.rsRes(rid, v);
  });
  const ACT_VI = { toggle: 'bật / tắt', run: 'chạy', stop: 'dừng', approve: 'duyệt & chạy', apply: 'áp dụng bản sửa', applyRun: 'áp dụng bản sửa & chạy tiếp', dropPending: 'bỏ bản sửa', resume: 'chạy tiếp', taskRetry: 'chạy lại task', taskSkip: 'bỏ qua task', taskDone: 'coi task là xong', taskCont: 'làm tiếp task', askPlanner: 'nhờ phiên điều phối sửa lịch', skipCheck: 'bỏ qua kiểm tra design', recheck: 'kiểm tra lại plan.json', designAccept: 'ghi nhận design mới', designAnalyze: 'phân tích design đổi', missedRun: 'chạy bù', missedSkip: 'bỏ qua lần lỡ' };
  const stateOf = (c, sid) => {
    const pref = !c && sid && A().sessPrefOf ? A().sessPrefOf(sid) : null;
    return { open: !!c, busy: !!(c && c.busy), title: c ? c.title : '', cwd: c ? c.cwd : '', model: c ? c.model : (pref && pref.model) || '', effort: c ? c.effort || '' : (pref && pref.effort) || '', modelName: c ? c.modelName || '' : '' };
  };
  // phiên chia sẻ đổi model / effort ở máy này → máy đang xem cập nhật theo
  function prefChanged(c) { if (!c.rs && live.has(c.sid)) api.rsEmit(c.sid, { type: 'gui_pref', model: c.model, effort: c.effort || '' }); }
  async function onReq(kind, d) {
    // máy đã kết nối hỏi danh sách phiên công khai
    if (kind === 'states') { const v = {}; for (const sid of d.sids || []) v[sid] = stateOf(localConv(sid), sid); return { ok: true, v }; }
    if (kind === 'sched') return CG.sched ? CG.sched.remoteSnapshot() : { ok: false, error: 'Lịch chưa sẵn sàng' };
    if (kind === 'schedAct') {
      if (!CG.sched) return { ok: false, error: 'Lịch chưa sẵn sàng' };
      const v = await CG.sched.remoteAct(d);
      if (v.ok) { const p = CG.sched.plans.find((x) => x.id === d.id); toast(`🏠 ${d.from || 'Máy khác'} điều khiển lịch: ${ACT_VI[d.act] || d.act}${p ? ' · ' + p.name : ''}`); }
      return v;
    }
    // máy chủ đã kiểm token; danh sách ở đây có thể chưa kịp làm mới
    const inSched = () => !!(CG.sched && CG.sched.sidMap && CG.sched.sidMap()[d.sid]);
    if (!shared.has(d.sid) && !inSched()) { await loadShared(); if (!shared.has(d.sid) && !inSched()) return { ok: false, error: 'Phiên không còn được chia sẻ' }; }
    if (kind === 'state') {
      const c = localConv(d.sid);
      return { ok: true, ...stateOf(c, d.sid), perms: c ? [...c.perms.values()].map((p) => p.raw).filter(Boolean) : [] };
    }
    let c = localConv(d.sid);
    if (kind === 'pref' && !c) c = await A().convFor(d.sid);
    if (kind === 'send') {
      if (!c) c = await A().convFor(d.sid);
      if (!c) return { ok: false, error: 'Không mở được phiên ở máy này' };
      if (c.child) return { ok: false, error: 'Phiên con chỉ xem được' };
      c._rsFrom = d.from || 'máy khác';
      c._rsVia = d.via || '';
      try { await c.send(d.content, d.display, d.images || []); } finally { c._rsFrom = ''; c._rsVia = ''; }
      return { ok: true };
    }
    if (!c) return { ok: false, error: 'Phiên đang không chạy ở máy này' };
    if (kind === 'perm') {
      const card = c.perms.get(d.request_id);
      if (!card) return { ok: false, error: 'Thẻ này đã được xử lý' };
      const r = d.response || {};
      const ok = r.behavior === 'allow';
      const lbl = r.updatedInput && r.updatedInput.answers ? 'Đã trả lời' : ok ? (r.updatedPermissions ? 'Đã cho phép (luôn)' : 'Đã cho phép') : 'Đã từ chối';
      c.respond(d.request_id, r);
      c.finishPerm(d.request_id, card, `${lbl} — từ ${d.from || 'máy khác'}`, ok);
      return { ok: true };
    }
    if (kind === 'pref') { A().applyPref(c, { model: d.model, effort: d.effort }); c.addNote(`${d.model ? 'Model' : 'Effort'} đổi từ ${d.from || 'máy khác'}.`); return { ok: true }; }
    if (kind === 'stop') { c.interrupt(); c.addNote(`Dừng từ ${d.from || 'máy khác'}.`); return { ok: true }; }
    return { ok: false, error: 'Không rõ yêu cầu' };
  }

  async function ensureOn(why) {
    const info = await api.rsInfo();
    if (info.want) return true;
    const go = await CG.confirmDialog('Bật Truy cập từ xa?', `Máy này chưa cho máy khác kết nối. Bật để ${why} (mở cổng ${info.port}, chỉ nhận kết nối trong Tailscale / mạng nội bộ).`, 'Bật');
    if (!go) return false;
    await CG.saveSettings({ rsOn: true });
    await api.rsApply();
    return true;
  }
  // công khai: mọi máy đã kết nối tới máy này thấy & điều khiển được phiên, không cần token
  async function setPublic(it, on) {
    if (on && !(await ensureOn('máy đã kết nối thấy phiên này'))) return;
    const r = await api.rsPublish({ sid: it.id, title: it.title, on });
    if (!r.ok) return toast(r.error || 'Không làm được.', true);
    await loadShared();
    const c = S().active; if (c) titleChip(c);
    const names = devs.map((x) => x.name).join(', ');
    if (!on) return toast('Đã thôi công khai — máy đã kết nối không thấy phiên này nữa (máy có token riêng vẫn xem được).');
    toast(devs.length ? `Đã công khai — ${names} thấy phiên này ở nhóm 🏢 trên thanh bên.` : 'Đã công khai. Chưa có máy nào kết nối tới máy này — máy kết nối lần đầu bằng token của một phiên bất kỳ, sau đó tự thấy mọi phiên công khai.', !devs.length);
  }
  // bật / tắt / đổi token
  async function setShare(it, on, renew) {
    if (on && !(await ensureOn('máy có token mở được phiên này'))) return;
    const r = await api.rsShare({ sid: it.id, title: it.title, on, renew });
    if (!r.ok) return toast(r.error || 'Không làm được.', true);
    await loadShared();
    const c = S().active; if (c) titleChip(c);
    if (!on) return toast('Đã tắt chia sẻ — máy khác không xem / điều khiển phiên này được nữa.');
    showToken(it, r.token, r.renewed);
  }
  async function showToken(it, token, renewed) {
    if (!token) { const l = await api.rsShares(); const x = l.find((y) => y.sid === it.id); token = x && x.token; }
    if (!token) return toast('Phiên này chưa chia sẻ.', true);
    const info = await api.rsInfo();
    const ts = info.tailscale || {};
    const addr = ts.dns ? ts.dns.split('.')[0] : ts.ip || info.host;
    const m = modal('🔑 Token của phiên', h('div', { class: 'rs-tok' },
      h('div', { class: 'rs-tok-t', text: it.title || '' }),
      renewed ? h('div', { class: 'pk-warn', text: 'Đã tạo token mới — token cũ hết hiệu lực, máy đang dùng token cũ bị ngắt ngay.' }) : null,
      h('div', { class: 'rs-tok-row' }, h('code', { class: 'rs-tok-code', text: token }), h('button', { class: 'btn primary sm', text: 'Sao chép', onclick: () => copy(token) })),
      h('div', { class: 'rs-tok-row' }, h('span', { class: 'pk-muted', text: 'Địa chỉ máy này:' }), h('code', { text: addr }), ts.ip && addr !== ts.ip ? h('code', { text: ts.ip }) : null, h('button', { class: 'btn sm', text: 'Chép', onclick: () => copy(addr) })),
      !ts.running ? h('div', { class: 'pk-warn' }, '⚠ Máy này chưa vào Tailscale — ở ngoài công ty sẽ không kết nối được. ', h('a', { href: '#', text: 'Xem hướng dẫn', onclick: (e) => { e.preventDefault(); m.close(); CG.openSettings('remote'); } })) : null,
      !info.on ? h('div', { class: 'pk-warn', text: '⚠ Truy cập từ xa đang tắt / lỗi: ' + (info.error || 'chưa mở cổng') }) : null,
      h('p', { class: 'pk-muted', text: 'Ở máy kia: thanh bên → nút lọc → “Thêm phiên từ máy khác…” → dán địa chỉ + token. Có token là xem & điều khiển được phiên này và các phiên con — chỉ gửi cho chính bạn, đừng dán vào nhóm chat chung.' })),
    [h('button', { class: 'btn', text: '↻ Đổi token', onclick: () => { m.close(); setShare(it, true, true); } }), h('button', { class: 'btn primary', text: 'Xong', onclick: () => m.close() })]);
  }
  function menuItems(it) {
    if (!it || !it.id || (S().active && S().active.rs && S().active.sid === it.id && !localConv(it.id))) return [];
    const pub = pubs.has(it.id);
    const on = hasToken(it.id);
    const names = devs.map((x) => x.name);
    return [
      { label: pub ? 'Thôi công khai cho máy đã kết nối' : 'Công khai cho máy đã kết nối', desc: names.length ? (pub ? '📡 ' : '') + names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') + ' thấy & điều khiển' : 'chưa có máy nào kết nối tới máy này', icon: 'monitor', onClick: () => setPublic(it, !pub) },
      { label: on ? 'Tắt chia sẻ bằng token' : 'Chia sẻ bằng token…', desc: on ? 'thu hồi token' : 'cho máy chưa kết nối: máy kia cần token', icon: 'globe', onClick: () => setShare(it, !on) },
      ...(on ? [{ label: 'Xem / sao chép token', icon: 'copy', onClick: () => showToken(it) }, { label: 'Đổi token (thu hồi token cũ)', icon: 'refresh', onClick: () => setShare(it, true, true) }] : []),
    ];
  }
  // chip trên thanh tiêu đề: 📡 Đang chia sẻ · 🏠 <máy> đang xem · 🏢 <máy> (khi đang xem phiên từ xa)
  function titleChip(c) {
    let el = document.getElementById('tb-rs');
    if (!el) { el = h('span', { id: 'tb-rs', class: 'rs-chips' }); const br = document.getElementById('tb-branch'); if (br) br.after(el); else return; }
    el.innerHTML = '';
    if (c.rs) {
      const L = links.get(c.rs.link);
      const st = L ? L.state : 'offline';
      el.append(h('span', { class: 'rs-chip remote ' + st, title: `Phiên chạy trên máy ${c.rs.name}${L && L.cwd ? '\n' + L.cwd : ''}` }, '🏢 ', c.rs.name, st === 'online' ? null : h('span', { text: st === 'revoked' ? ' · đã ngừng chia sẻ' : ' · mất kết nối' })));
      return;
    }
    if (!c.count && !c.persisted) return;
    const w = watching(c.sid);
    if (w.length) el.append(h('span', { class: 'rs-chip watch', title: 'Máy đang mở phiên này từ xa' }, '🏠 ', w.join(', '), ' đang xem'));
    if (shared.has(c.sid)) el.append(h('span', { class: 'rs-chip on', title: (pubs.has(c.sid) ? 'Máy đã kết nối thấy & điều khiển được phiên này' : 'Máy có token thấy & điều khiển được phiên này') + ' — bấm để đổi', onclick: (e) => { e.stopPropagation(); CG.menu(e.currentTarget, menuItems({ id: c.sid, title: c.title })); } }, pubs.has(c.sid) ? '📡 Công khai' : '📡 Đang chia sẻ'));
  }

  // =====================================================================
  // MÁY XEM (ở nhà)
  // =====================================================================
  let me = { id: '', host: '' };
  api.rsClient().then((x) => { me = x || me; }).catch(() => {});
  const links = new Map(); // id -> { ...link, state, info }
  async function loadLinks() {
    const list = await api.rsLinks().catch(() => []);
    const keep = new Set(list.map((L) => L.id));
    for (const id of [...links.keys()]) if (!id.startsWith('h:') && !keep.has(id)) { links.delete(id); api.rsDisconnect(id); }
    for (const L of list) {
      const cur = links.get(L.id);
      links.set(L.id, { ...(cur || { state: 'connecting', info: null }), ...L });
      if (!cur) refreshInfo(L.id);
    }
    A() && A().renderSidebar();
  }
  setTimeout(loadLinks, 1500);

  // máy đã kết nối (nhớ sau lần vào bằng token đầu tiên): tự hiện mọi phiên bên đó "Công khai cho máy đã kết nối"
  const hosts = new Map(); // id -> { ...máy, state, n }
  async function loadHosts() {
    const list = await (api.rsHosts ? api.rsHosts() : Promise.resolve([])).catch(() => []);
    const keep = new Set(list.map((H) => H.id));
    for (const id of [...hosts.keys()]) if (!keep.has(id)) { hosts.delete(id); dropPub(id, new Set()); }
    for (const H of list) { const cur = hosts.get(H.id); hosts.set(H.id, { ...(cur || { state: 'connecting', n: 0 }), ...H }); }
    await Promise.all(list.map((H) => refreshHost(H.id)));
    A() && A().renderSidebar();
  }
  const tokLinkFor = (host, sid) => [...links.values()].find((L) => !L.pub && L.host === host && L.sid === sid);
  function dropPub(hid, keepSids) {
    for (const [id, L] of [...links.entries()]) {
      if (!L.pub || L.hostId !== hid || keepSids.has(L.sid)) continue;
      disconnect(id); links.delete(id);
      const c = rsConv(L, L.sid);
      if (c) { c.addNote(`Máy ${L.name} đã thôi công khai phiên này.`); c.setBusy(false); }
    }
  }
  async function refreshHost(hid) {
    const H = hosts.get(hid);
    if (!H) return;
    const r = await api.rsHostList(hid).catch((e) => ({ ok: false, error: e.message }));
    if (!hosts.has(hid)) return;
    if (!r.ok) {
      H.state = r.status === 401 ? 'revoked' : 'offline'; H.error = r.error;
      if (r.status === 401) dropPub(hid, new Set());
      else for (const L of links.values()) if (L.pub && L.hostId === hid && !streaming.has(L.id)) L.state = 'offline';
      A().renderSidebar(); return;
    }
    H.state = 'online'; H.name = r.name || H.name; H.sched = !!r.sched;
    if (RQ.hid === hid && r.sched === false) { closeSched(); toast(`Máy ${H.name} đã tắt xem Lịch & hàng đợi từ xa.`, true); }
    const sids = new Set();
    for (const s of r.sessions || []) {
      if (tokLinkFor(H.host, s.sid)) continue; // đã có liên kết bằng token
      sids.add(s.sid);
      const id = `h:${hid}:${s.sid}`;
      const cur = links.get(id);
      // trạng thái lấy theo danh sách; chỉ phiên đang mở xem mới giữ luồng trực tiếp (streaming) và tự báo trạng thái
      links.set(id, { ...(cur || { info: null }), state: cur && streaming.has(id) ? cur.state : 'online', id, pub: true, hostId: hid, addr: H.addr, name: H.name, host: H.host, sid: s.sid, title: s.title || (cur && cur.title) || '', cwd: s.cwd || (cur && cur.cwd) || '', busy: s.busy, plan: s.plan || '', pid: s.pid || '', label: s.label || '', k: s.k || 0 });
    }
    dropPub(hid, sids);
    H.n = sids.size;
    A().renderSidebar();
  }
  setTimeout(loadHosts, 1800);
  // cửa sổ thu nhỏ / bị che → thôi hỏi định kỳ; hiện lại thì hỏi ngay
  setInterval(() => { if (!document.hidden) for (const id of hosts.keys()) refreshHost(id); }, 15000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    hiddenAt = document.hidden ? Date.now() : 0;
    if (document.hidden) return;
    for (const id of hosts.keys()) refreshHost(id);
    const c = S().active; if (c && c.rs && c.rsStale) revive(c);
  });
  if (api.onRsHosts) api.onRsHosts(() => loadHosts());
  async function forgetHost(H) {
    if (!(await CG.confirmDialog('Quên máy này?', `Máy này sẽ không tự thấy các phiên công khai của ${H.name} nữa (muốn kết nối lại phải dùng token). Liên kết bằng token đã thêm vẫn giữ.`, 'Quên', true))) return;
    await api.rsForget(H.id);
    hosts.delete(H.id);
    dropPub(H.id, new Set());
    A().renderSidebar();
  }
  function hostMenu(H, anchor) {
    CG.menu(anchor, [
      { header: `${H.name} · ${H.addr}` },
      { label: 'Làm mới danh sách phiên', icon: 'refresh', onClick: () => refreshHost(H.id).then(() => toast(H.state === 'online' ? `✓ ${H.name}: ${H.n} phiên công khai` : H.state === 'revoked' ? `${H.name} đã gỡ máy này — kết nối lại bằng token` : 'Không kết nối được: ' + (H.error || ''), H.state !== 'online')) },
      { label: 'Mở Lịch & hàng đợi của máy này', icon: 'clock', disabled: !H.sched, desc: H.sched ? '' : 'máy kia chưa cho xem từ xa', onClick: () => openSched(H.id) },
      { label: 'Thêm phiên bằng token…', icon: 'plus', onClick: () => addDialog({ addr: H.addr }) },
      '-',
      { label: 'Quên máy này', icon: 'trash', danger: true, onClick: () => forgetHost(H) },
    ]);
  }
  async function refreshInfo(id) {
    const L = links.get(id);
    if (!L) return;
    const r = await api.rsCall({ link: id, path: '/rs/info', ms: 10000 });
    if (r.ok) { L.info = r; L.title = r.title || L.title; L.cwd = r.cwd || L.cwd; L.name = r.name || L.name; L.busy = r.busy; if (L.state !== 'online') L.state = 'online'; applyRemotePref(rsConv(L, L.sid), r); }
    else if (r.status === 401) L.state = 'revoked';
    else if (L.state !== 'online') L.state = 'offline';
    A().renderSidebar();
    const c = S().active; if (c) titleChip(c);
  }
  // hỏi thông tin định kỳ: chỉ liên kết token (phiên công khai đã có danh sách của máy) và khi cửa sổ đang hiện
  setInterval(() => { if (!document.hidden) for (const [id, L] of links) if (!L.pub) refreshInfo(id); }, 30000);
  // ---- luồng trực tiếp: chỉ mở cho phiên đang mở xem; phiên mở mà bỏ đó > 3 phút (không xem) thì đóng luồng,
  // quay lại xem thì tải lại lịch sử + nối lại (rsStale) ----
  const streaming = new Set();
  function connect(id) { if (streaming.has(id)) return; streaming.add(id); api.rsConnect(id); }
  function disconnect(id) { streaming.delete(id); api.rsDisconnect(id); }
  const IDLE_MS = 3 * 60000;
  setInterval(() => {
    const now = Date.now(), s = S();
    const want = new Set();
    const away = document.hidden && hiddenAt && now - hiddenAt > 60000; // cửa sổ ẩn / bị che hơn 1 phút
    for (const c of s.convs.values()) {
      if (!c.rs || c.child) continue;
      if ((c === s.active || c === s.side) && !document.hidden) c.rsSeen = now;
      if (!c.rsStale && (away || now - (c.rsSeen || now) >= IDLE_MS)) c.rsStale = true;
      if (!c.rsStale) want.add(c.rs.link);
    }
    for (const id of [...streaming]) if (!want.has(id)) disconnect(id);
  }, 20000);
  async function syncInfo(L, conv) {
    const info = await api.rsCall({ link: L.id, path: '/rs/info', ms: 10000 });
    if (!info.ok) return null;
    L.info = info;
    applyRemotePref(conv, info);
    if (!!info.busy !== !!conv.busy) conv.setBusy(!!info.busy);
    for (const p of info.perms || []) if (p && p.request_id && !conv.perms.has(p.request_id)) conv.permRequest(p.request_id, p.request);
    return info;
  }
  // phiên đã đóng luồng vì bỏ lâu → mở lại: nối luồng, tải lại phần cuối lịch sử, lấy trạng thái
  async function revive(conv) {
    if (!conv || !conv.rs || !conv.rsStale || conv.rsReviving) return;
    const L = links.get(conv.rs.link);
    if (!L) return;
    conv.rsReviving = true; conv.rsStale = false; conv.rsSeen = Date.now();
    connect(L.id);
    try { await A().reloadChild(conv); await syncInfo(L, conv); } finally { conv.rsReviving = false; }
  }
  function touched(conv) { if (conv && conv.rs && !conv.child) { conv.rsSeen = Date.now(); if (conv.rsStale) revive(conv); } }
  const convKey = (L, sid) => `rs:${L.id}:${sid}`;
  const rsConv = (L, sid) => S().convs.get(convKey(L, sid));
  if (api.onRsState) api.onRsState(({ link, state }) => {
    const L = links.get(link);
    if (!L) return;
    const was = L.state;
    L.state = state;
    if (state === 'online' && was !== 'online') refreshInfo(link);
    const c = rsConv(L, L.sid);
    if (c && state === 'revoked' && was !== 'revoked') { c.addNote(`Máy ${L.name} đã ngừng chia sẻ phiên này (hoặc đã đổi token) — không xem / điều khiển được nữa.`); c.setBusy(false); }
    if (c && state === 'online' && was === 'offline') c.addNote(`Đã kết nối lại với máy ${L.name}.`);
    A().renderSidebar();
    if (S().active) titleChip(S().active);
  });
  if (api.onRsEv) api.onRsEv(({ link, ev }) => {
    const L = links.get(link);
    if (!L || !ev || !ev.m) return;
    const m = ev.m;
    if (m.type === 'gui_busy') { L.busy = m.v; A().renderSidebar(); }
    if (m.type === 'gui_revoked') return; // luồng sẽ đóng → rs:state 'revoked' báo cho phiên
    const c = rsConv(L, L.sid);
    if (!c || !c.rsReady) return;
    if (m.type === 'gui_busy') { if (c.busy !== !!m.v) c.setBusy(!!m.v); if (!m.v) { c.cleanupLive && c.cleanupLive(); } return; }
    if (m.type === 'gui_user') {
      if (m.via && m.via === me.id) return; // tin chính máy này gửi — đã hiện rồi
      c._rsTag = m.from ? `🏠 gửi từ ${m.from}` : `🏢 gửi tại máy ${L.name}`;
      c.renderUser(m.text, m.images || []);
      c._rsTag = '';
      A().afterRender && A().afterRender(c);
      return;
    }
    if (m.type === 'gui_pref') { applyRemotePref(c, m); return; }
    if (m.type === 'gui_perm_done') { const card = c.perms.get(m.request_id); if (card) c.finishPerm(m.request_id, card, m.label || 'Đã xử lý ở máy kia', !!m.ok); return; }
    if (m.type && m.type.startsWith('gui_')) return;
    c.handle(m);
  });

  function applyRemotePref(c, x) {
    if (!c || !x) return;
    if (x.model) c.model = x.model;
    if (x.effort != null) c.effort = x.effort || '';
    if (x.modelName) c.modelName = x.modelName;
    if (S().active === c) A().updateComposer();
  }
  async function setPref(c, o) {
    const r = await api.rsCall({ link: c.rs.link, path: '/rs/pref', method: 'POST', body: o, ms: 20000 });
    if (!r.ok) toast('Máy ' + c.rs.name + ' không đổi được: ' + r.error, true);
    else toast(`Đã đổi ${o.model ? 'model' : 'effort'} của phiên ở máy ${c.rs.name}${o.effort != null ? ' — áp dụng từ tin nhắn tiếp theo' : ''}.`);
  }
  // mở phiên từ xa: dựng Conv như phiên thường, lịch sử lấy từ máy kia
  async function openRemote(L, it) {
    const key = convKey(L, it.id);
    let conv = S().convs.get(key);
    if (conv) { A().activate(conv); titleChip(conv); return conv; }
    conv = A().rawConv({ key, sid: it.id, cwd: it.cwd || L.cwd || '', persisted: true, title: it.title || L.title });
    conv.rs = { link: L.id, name: L.name || L.host };
    conv.rsSeen = Date.now();
    if (!it.child) connect(L.id);
    if (it.child) Object.assign(conv, { child: true, parentId: it.parentId, agentId: it.agentId, agentType: it.agentType });
    A().activate(conv);
    const r = await api.rsCall({ link: L.id, path: '/rs/hist', method: 'POST', body: { fn: 'loadSessionTail', args: [it.id] }, ms: 30000 });
    if (S().convs.get(key) !== conv) return conv;
    if (!r.ok) { conv.addNote(`Không tải được lịch sử từ máy ${L.name}: ${r.error}`); return conv; }
    const tail = r.v || { entries: [] };
    conv.loadHistory(tail.entries || [], 40);
    if (tail.offset > 0) conv.fetchOlder({ id: it.id, cwd: '' }, tail.offset);
    conv.closeTurn();
    conv.addNote(it.child ? `🏢 Tác tử phụ của phiên trên máy ${L.name} — chỉ xem.` : `🏢 Phiên đang chạy trên máy ${L.name}${L.cwd ? ' · ' + L.cwd : ''} — lệnh và tệp đều ở máy đó. Tin bạn gửi, duyệt quyền, Dừng đều tác động thẳng vào phiên bên đó.`);
    conv.rsReady = true;
    if (!it.child) {
      const info = await syncInfo(L, conv);
      if (info) {
        conv.rsChildren = info.children || [];
        for (const ch of conv.rsChildren) { const card = ch.toolUseId && conv.tools.get(ch.toolUseId); if (card && card.linkChild) card.linkChild({ ...ch, parentId: it.id, child: true }); }
      }
    } else watchChild(L, conv);
    A().activate(conv);
    const sc = document.getElementById('scroller'); if (sc) sc.scrollTop = sc.scrollHeight;
    titleChip(conv);
    return conv;
  }
  // tác tử phụ ở máy kia: hỏi kích thước tệp (vài chục byte) mỗi 3 giây, chỉ tải lại khi tệp đổi
  function watchChild(L, conv) {
    let last = null, n = 0;
    const t = setInterval(async () => {
      if (S().convs.get(conv.key) !== conv) return clearInterval(t);
      if (document.hidden || !(S().active === conv || S().side === conv) || conv._fz) return;
      conv._fz = true;
      const r = await api.rsCall({ link: L.id, path: '/rs/fsize', method: 'POST', body: { id: conv.sid }, ms: 8000 }).catch(() => null);
      conv._fz = false;
      if (!r) return;
      if (!r.ok) { if (r.status === 404 && /Không có/.test(r.error || '') && ++n % 3 === 0) A().reloadChild(conv); return; } // máy kia bản cũ
      const k = r.size + ':' + r.mtime;
      if (last !== null && k !== last) A().reloadChild(conv);
      last = k;
    }, 3000);
  }
  // "Tải đầy đủ" kết quả công cụ đã bị lược bớt khi gửi sang
  async function fullResult(conv, tid) {
    if (!conv || !conv.rs) return null;
    const r = await api.rsCall({ link: conv.rs.link, path: '/rs/toolres', method: 'POST', body: { id: conv.sid, tid }, ms: 60000 });
    if (!r.ok) { toast('Không tải được: ' + (r.status === 404 && /Không có/.test(r.error || '') ? 'máy kia cần cập nhật Claude GUI' : r.error), true); return null; }
    return r;
  }
  function openChild(parent, ch) {
    const L = links.get(parent.rs.link);
    if (L) openRemote(L, { ...ch, child: true, parentId: parent.sid });
  }
  // các hàm đọc lịch sử, gọi sang máy kia (cùng chữ ký với api.*)
  function rsApi(conv) {
    const call = (fn) => async (id, _cwd, ...rest) => { const r = await api.rsCall({ link: conv.rs.link, path: '/rs/hist', method: 'POST', body: { fn, args: [id, ...rest] }, ms: 30000 }); if (!r.ok) throw new Error(r.error); return r.v; };
    return { loadSessionTail: call('loadSessionTail'), loadSessionOlder: call('loadSessionOlder'), historyChunk: call('historyChunk') };
  }
  // Conv từ xa: gửi / duyệt / dừng → sang máy kia
  async function send(conv, content, displayText, images) {
    const L = links.get(conv.rs.link);
    if (conv.child) return toast('Phiên con chỉ xem được — nhắn ở phiên cha.', true);
    if (!L || L.state === 'revoked') return toast('Máy kia đã ngừng chia sẻ phiên này.', true);
    const el = conv.renderUser(displayText != null ? displayText : typeof content === 'string' ? content : '', images || []);
    if (CG.motion && conv === S().active) CG.motion.fly(el);
    if (!conv.busy) conv.setBusy(true);
    A().renderSidebar();
    const r = await api.rsCall({ link: conv.rs.link, path: '/rs/send', method: 'POST', body: { content, display: displayText, images: images || [] }, ms: 60000 });
    if (!r.ok) { conv.addError('Không gửi được sang máy ' + conv.rs.name + ': ' + r.error); conv.setBusy(false); }
  }
  async function respond(conv, requestId, response) {
    const r = await api.rsCall({ link: conv.rs.link, path: '/rs/perm', method: 'POST', body: { request_id: requestId, response }, ms: 20000 });
    if (!r.ok) conv.addError('Máy ' + conv.rs.name + ' không nhận lựa chọn: ' + r.error);
  }
  async function stop(conv) {
    if (conv.child) return;
    const r = await api.rsCall({ link: conv.rs.link, path: '/rs/stop', method: 'POST', body: {}, ms: 15000 });
    if (!r.ok) toast('Không dừng được: ' + r.error, true);
  }

  // thanh bên: nhóm 🏢 <máy> cho các phiên đã thêm bằng token
  // ★ đánh dấu phiên của máy khác (lưu ở máy này)
  const RS_STAR = 'cg.rsStars';
  let rsStars = (() => { try { return JSON.parse(localStorage.getItem(RS_STAR)) || []; } catch { return []; } })();
  const starKey = (L) => `${L.host || L.name}|${L.sid}`;
  const isStar = (L) => rsStars.includes(starKey(L));
  function toggleStar(L) {
    const k = starKey(L);
    rsStars = rsStars.includes(k) ? rsStars.filter((x) => x !== k) : [k, ...rsStars].slice(0, 200);
    try { localStorage.setItem(RS_STAR, JSON.stringify(rsStars)); } catch {}
    A().renderSidebar();
  }
  function machineMap() {
    const byHost = new Map();
    for (const H of hosts.values()) byHost.set(H.host || H.name, []);
    for (const L of links.values()) {
      if (L.pub && tokLinkFor(L.host, L.sid)) continue;
      const k = L.host || L.name; if (!byHost.has(k)) byHost.set(k, []); byHost.get(k).push(L);
    }
    return byHost;
  }
  // tab ở thanh bên: mỗi máy khác một tab (máy này do app.js vẽ)
  function machines() {
    const out = [];
    for (const [hk, arr] of machineMap()) {
      const H = [...hosts.values()].find((x) => (x.host || x.name) === hk);
      const run = arr.filter((L) => { const c = rsConv(L, L.sid); return c ? c.busy : L.busy; }).length;
      const wait = arr.some((L) => { const c = rsConv(L, L.sid); return c && c.perms.size; });
      out.push({ key: hk, name: (H && H.name) || (arr[0] && (arr[0].name || arr[0].host)) || hk, online: arr.some((L) => L.state === 'online') || !!(H && H.state === 'online'), count: arr.length, run, wait });
    }
    return out;
  }
  function renderGroup(list, only) {
    if (!links.size && !hosts.size) return;
    const byHost = machineMap();
    for (const [hk, arr] of byHost) {
      if (only && hk !== only) continue;
      const H = [...hosts.values()].find((x) => (x.host || x.name) === hk);
      const nm = (H && H.name) || (arr[0] && (arr[0].name || arr[0].host)) || hk;
      const on = arr.some((L) => L.state === 'online') || (H && H.state === 'online');
      const head = h('div', { class: 'grp-head rs-head', title: `Phiên trên máy ${nm} (qua Tailscale / LAN)${H ? '\nMáy đã kết nối — tự hiện các phiên bên đó công khai · chuột phải để làm mới / quên' : ''}` },
        h('span', { class: 'rs-dot ' + (on ? 'on' : 'off') }), h('span', { class: 'g-name ellipsis', text: '🏢 ' + nm }), h('span', { class: 'g-count', text: arr.length || '' }));
      if (H) head.oncontextmenu = (e) => { e.preventDefault(); hostMenu(H, CG.pointAnchor(e.clientX, e.clientY)); };
      list.append(head);
      const runningOf = (L) => { const c = rsConv(L, L.sid); return c ? c.busy : L.busy; };
      const first = arr.filter((L) => !L.plan), rest = arr.filter((L) => L.plan);
      if (!first.length && !rest.length && H && !(H.sched && H.state === 'online')) {
        list.append(h('div', { class: 'rs-none', text: H.state === 'revoked' ? `${nm} đã gỡ máy này — chuột phải tiêu đề → Thêm phiên bằng token` : H.state === 'online' ? 'Chưa có phiên công khai — ở máy kia chuột phải phiên → “Công khai cho máy đã kết nối”' : H.state === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối (máy tắt / Tailscale chưa bật)' }));
      }
      const one = (L) => {
        const c = rsConv(L, L.sid);
        const busy = c ? c.busy : L.busy;
        const wait = c && c.perms.size;
        const active = S().active && S().active.key === convKey(L, L.sid);
        const starred = isStar(L);
        const star = h('button', { class: 's-star' + (starred ? ' on' : ''), text: starred ? '★' : '☆', title: starred ? 'Bỏ đánh dấu' : 'Đánh dấu — ghim lên đầu' });
        star.onclick = (e) => { e.stopPropagation(); toggleStar(L); };
        // phiên con (tác tử phụ): thu gọn như ở máy này, bấm "› N" để mở
        const kids = (c && c.rsChildren) || (L.info && L.info.children) || [];
        const kidsOpen = kids.length && kidOpen.has(starKey(L));
        const kidsBtn = kids.length ? h('button', { class: 's-kids' + (kidsOpen ? ' open' : ''), title: `${kids.length} phiên con (tác tử phụ) — bấm để ${kidsOpen ? 'thu gọn' : 'mở'}`,
          onclick: (e) => { e.stopPropagation(); const k = starKey(L); kidOpen.has(k) ? kidOpen.delete(k) : kidOpen.add(k); A().renderSidebar(); } }, CG.icon('chevronRight', 11), h('span', { text: kids.length })) : null;
        const row = h('div', { class: 'sess rs-sess' + (L.plan && !L._top ? ' sched-sess' : '') + (starred ? ' starred' : '') + (active ? ' active' : '') + (L.state === 'revoked' ? ' rs-dead' : ''), title: `${L.label ? L.label + '\n' : ''}${L.title}\n${L.cwd || ''}${L.plan ? '\n📅 ' + L.plan : ''}\nMáy ${L.name} · ${L.state === 'online' ? 'đang kết nối' : L.state === 'revoked' ? 'đã ngừng chia sẻ' : 'mất kết nối'}` },
          h('span', { class: 'st ' + (busy ? (wait ? 'wait' : 'run') : '') }),
          h('span', { class: 's-title ellipsis', text: L.label || L.title || '(phiên)' }),
          kidsBtn, h('span', { class: 's-time', text: L.state === 'revoked' ? '✕' : L.state === 'online' ? '' : '…' }), star);
        row.onclick = () => (L.state === 'revoked' ? linkMenu(L, row) : openRemote(L, { id: L.sid, title: L.title, cwd: L.cwd }));
        row.oncontextmenu = (e) => { e.preventDefault(); linkMenu(L, CG.pointAnchor(e.clientX, e.clientY)); };
        list.append(row);
        if (kids.length && kidsOpen) {
          const box = h('div', { class: 'sess-kids' });
          for (const k of kids.slice(0, 8)) {
            const ka = S().active && S().active.key === convKey(L, k.id);
            const kr = h('div', { class: 'sess child' + (ka ? ' active' : ''), title: k.title }, h('span', { class: 'st' }), h('span', { class: 's-title ellipsis', text: '↳ ' + (k.title || k.agentId) }));
            kr.onclick = () => openRemote(L, { ...k, child: true, parentId: L.sid, cwd: L.cwd });
            box.append(kr);
          }
          list.append(box);
        }
      };
      // phiên đã đánh dấu ★ lên đầu
      const stars = arr.filter(isStar).sort((a, b) => rsStars.indexOf(starKey(a)) - rsStars.indexOf(starKey(b)));
      if (stars.length) {
        list.append(h('div', { class: 'grp-head star-head rs-star-head' }, h('span', { class: 'g-star', text: '★' }), h('span', { class: 'g-name ellipsis', text: 'Đã đánh dấu' }), h('span', { class: 'g-count', text: stars.length })));
        for (const L of stars) { L._top = true; one(L); L._top = false; }
        if (first.some((L) => !isStar(L)) || (H && H.sched)) list.append(h('div', { class: 'rs-sep' }));
      }
      for (const L of first) if (!isStar(L)) one(L);
      if (H && H.sched && H.state === 'online') {
        const exp = (schedOpen.has(H.id) || rest.some(runningOf)) && !schedShut.has(H.id);
        const row = h('div', { class: 'sess rs-sess rs-qrow' + (RQ.hid === H.id ? ' active' : ''), title: `Lịch & hàng đợi của máy ${nm} — xem, chạy / dừng, duyệt bản sửa` },
          h('span', { class: 'rs-qic', text: '📅' }), h('span', { class: 's-title ellipsis', text: 'Lịch & hàng đợi' }), rest.some(runningOf) ? h('span', { class: 'st run' }) : null,
          rest.length ? h('span', { class: 'rs-qexp', title: exp ? 'Ẩn phiên do lịch chạy' : 'Hiện phiên do lịch chạy (theo kế hoạch)', text: `${rest.length} phiên ${exp ? '▾' : '▸'}` }) : null);
        row.onclick = (e) => { if (e.target.closest('.rs-qexp')) { exp ? (schedOpen.delete(H.id), schedShut.add(H.id)) : (schedOpen.add(H.id), schedShut.delete(H.id)); A().renderSidebar(); return; } openSched(H.id); };
        list.append(row);
        if (exp) {
          const byPlan = new Map();
          for (const L of rest) { const k = L.pid || L.plan; if (!byPlan.has(k)) byPlan.set(k, { k, name: L.plan, items: [] }); byPlan.get(k).items.push(L); }
          for (const g of byPlan.values()) {
            const pk = H.id + ':' + g.k, run = g.items.some(runningOf);
            const pe = planOpen.has(pk) || (run && !planShut.has(pk));
            const sub = h('div', { class: 'grp-head sched-plan rs-plan' + (pe ? '' : ' collapsed'), title: `Kế hoạch “${g.name}” trên máy ${nm}` }, CG.icon('chevronDown', 12, 'g-chev'),
              h('span', { class: 'g-name ellipsis', text: g.name }), run ? h('span', { class: 'st run' }) : null, h('span', { class: 'g-count', text: g.items.length }));
            sub.onclick = () => { if (pe) { planOpen.delete(pk); planShut.add(pk); } else { planOpen.add(pk); planShut.delete(pk); } A().renderSidebar(); };
            list.append(sub);
            if (pe) for (const L of g.items.sort((a, b) => (a.k || 0) - (b.k || 0))) if (!isStar(L)) one(L);
          }
        }
      }
    }
  }
  const schedOpen = new Set(), schedShut = new Set(), planOpen = new Set(), planShut = new Set(), kidOpen = new Set();
  function linkMenu(L, anchor) {
    if (L.pub) {
      const H = hosts.get(L.hostId);
      return CG.menu(anchor, [
        { label: 'Mở', icon: 'message', onClick: () => openRemote(L, { id: L.sid, title: L.title, cwd: L.cwd }) },
        { label: isStar(L) ? 'Bỏ đánh dấu' : 'Đánh dấu ★', icon: 'check', onClick: () => toggleStar(L) },
        { label: 'Kiểm tra kết nối', icon: 'refresh', onClick: () => refreshInfo(L.id).then(() => toast(L.state === 'online' ? `✓ Kết nối được máy ${L.name}` : 'Không kết nối được', L.state !== 'online')) },
        ...(H ? ['-', { label: 'Máy ' + H.name + '…', icon: 'monitor', onClick: () => hostMenu(H, anchor) }] : []),
      ]);
    }
    CG.menu(anchor, [
      { label: 'Mở', icon: 'message', disabled: L.state === 'revoked', onClick: () => openRemote(L, { id: L.sid, title: L.title, cwd: L.cwd }) },
      { label: isStar(L) ? 'Bỏ đánh dấu' : 'Đánh dấu ★', icon: 'check', onClick: () => toggleStar(L) },
      { label: 'Dán token mới…', icon: 'refresh', onClick: () => addDialog({ addr: L.addr }) },
      { label: 'Kiểm tra kết nối', icon: 'refresh', onClick: () => refreshInfo(L.id).then(() => toast(L.state === 'online' ? `✓ Kết nối được máy ${L.name}` : L.state === 'revoked' ? 'Token không còn hiệu lực' : 'Không kết nối được', L.state !== 'online')) },
      '-',
      { label: 'Gỡ khỏi máy này', icon: 'trash', danger: true, onClick: async () => { await api.rsRemoveLink(L.id); const c = rsConv(L, L.sid); if (c && S().active === c) A().newSession(); await loadLinks(); } },
    ]);
  }
  async function addDialog(pre = {}) {
    const ts = (await api.rsInfo().catch(() => ({}))).tailscale || {};
    const addr = h('input', { type: 'text', class: 'text-input mono', value: pre.addr || '', placeholder: 'vd may-cong-ty hoặc 100.x.x.x' });
    const tok = h('input', { type: 'text', class: 'text-input mono', value: '', placeholder: 'cgs_XXXXXX-XXXXXX-XXXXXX-XXXXXX' });
    const msg = h('div', { class: 'rs-msg' });
    const peers = (ts.peers || []).filter((p) => p.os === 'windows' || p.os === 'macOS' || p.os === 'linux');
    const known = [...hosts.values()];
    const body = h('div', { class: 'rs-add' },
      h('label', { class: 'rs-lbl', text: 'Địa chỉ máy đang chạy phiên' }), addr,
      known.length ? h('div', { class: 'rs-peers' }, h('span', { class: 'pk-muted', text: 'Máy đã kết nối: ' }), ...known.map((H) => h('button', { class: 'btn sm', title: `${H.addr} · ${H.n || 0} phiên công khai`, text: '🏢 ' + H.name, onclick: () => { addr.value = H.addr; tok.focus(); } }))) : null,
      peers.length ? h('div', { class: 'rs-peers' }, h('span', { class: 'pk-muted', text: 'Máy trong Tailscale của bạn: ' }), ...peers.map((p) => h('button', { class: 'btn sm' + (p.online ? '' : ' dim'), title: `${p.dns || p.host} · ${p.ip}${p.online ? '' : ' · đang offline'}`, text: (p.online ? '● ' : '○ ') + p.host, onclick: () => { addr.value = p.host; } }))) : null,
      h('label', { class: 'rs-lbl', text: 'Token của phiên' }), tok,
      h('div', { class: 'pk-muted', text: 'Lấy ở máy kia: chuột phải phiên → “Chia sẻ bằng token…”. Kết nối được một lần là hai máy nhớ nhau: sau đó ở máy kia chỉ cần chuột phải phiên → “Công khai cho máy đã kết nối”, không cần token nữa.' }),
      !ts.running ? h('div', { class: 'pk-warn' }, '⚠ Máy này chưa vào Tailscale — chỉ kết nối được máy cùng mạng LAN. ', h('a', { href: '#', text: 'Hướng dẫn cài Tailscale', onclick: (e) => { e.preventDefault(); m.close(); CG.openSettings('remote'); } })) : null,
      msg);
    const go = async () => {
      msg.textContent = 'Đang kết nối…'; msg.className = 'rs-msg';
      const r = await api.rsAddLink({ addr: addr.value.trim(), token: tok.value.trim() });
      if (!r.ok) { msg.textContent = '✗ ' + (r.status === 401 ? 'Token không đúng hoặc phiên đã ngừng chia sẻ.' : r.error); msg.className = 'rs-msg bad'; return; }
      m.close();
      await loadLinks();
      loadHosts();
      const L = links.get(r.link.id);
      if (L) { L.state = 'online'; L.info = r.info; openRemote(L, { id: L.sid, title: L.title, cwd: L.cwd }); }
      toast(`Đã thêm phiên “${r.link.title}” từ máy ${r.link.name}.`);
    };
    tok.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    const m = modal('Thêm phiên từ máy khác', body, [h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }), h('button', { class: 'btn primary', text: 'Kết nối', onclick: go })]);
    setTimeout(() => (pre.addr ? tok : addr).focus(), 50);
  }

  // =====================================================================
  // CÀI ĐẶT › Truy cập từ xa (kèm hướng dẫn Tailscale)
  // =====================================================================
  // Lưu lượng thật (byte trên dây, sau nén) — tự cập nhật 2 giây / lần khi trang đang mở
  const fmtB = (n) => (n < 1024 ? Math.round(n) + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
  function trafficGroup(u) {
    const now = h('span', { class: 'rs-tr', text: '…' });
    const tot = h('span', { class: 'pk-muted', text: '' });
    const tick = async () => {
      if (!now.isConnected) return clearInterval(t);
      const x = api.rsTraffic ? await api.rsTraffic().catch(() => null) : null;
      if (!x) return;
      now.textContent = `↑ ${fmtB(x.r10.up)}/s · ↓ ${fmtB(x.r10.down)}/s`;
      tot.textContent = `trung bình 1 phút: ↑ ${fmtB(x.r60.up)}/s · ↓ ${fmtB(x.r60.down)}/s · từ lúc mở app: ↑ ${fmtB(x.up)} · ↓ ${fmtB(x.down)} · ${x.viewers} máy đang xem phiên của máy này · ${x.streams} luồng đang nhận`;
    };
    const t = setInterval(tick, 2000);
    setTimeout(tick, 50);
    const s = S().settings;
    return u.group('Lưu lượng & chế độ nhẹ', 'Đo thật trên dây (đã nén). Máy xem chỉ nhận trực tiếp phiên đang mở xem; phiên mở mà bỏ đó hơn 3 phút hoặc cửa sổ bị ẩn hơn 1 phút thì tự ngắt, quay lại xem là tự nối lại.',
      u.row('Lưu lượng Truy cập từ xa (10 giây gần nhất)', tot, now),
      u.row('Chế độ nhẹ', 'Bật ở máy đang được remote desktop (Moonlight, Parsec, RDP…) hoặc máy yếu: tắt ảnh nền, làm mờ, hiệu ứng, robot; chữ Claude gõ vẽ lại ~4 lần/giây thay vì mỗi khung hình → màn hình ít thay đổi, luồng video remote nhẹ hơn.',
        u.toggle(!!s.liteMode, async (v) => { await CG.decor.setLite(v); u.render(); })));
  }
  async function settingsPage(el, u) {
    const info = await api.rsInfo();
    const s = S().settings;
    const ts = info.tailscale || {};
    const shares = await api.rsShares();
    const devList = api.rsDevices ? await api.rsDevices() : [];
    const st = info.on ? `Đang mở cổng ${info.port}` : info.want ? (info.error ? 'Lỗi: ' + info.error : 'Đang mở cổng…') : 'Đang tắt';
    const myAddr = ts.dns ? ts.dns.split('.')[0] : '';
    const ext = (url) => h('a', { href: '#', text: url.replace(/^https?:\/\//, ''), onclick: (e) => { e.preventDefault(); api.openExternal ? api.openExternal(url) : copy(url); } });
    const step = (n, done, title, ...body) => h('div', { class: 'rs-step' + (done ? ' done' : '') }, h('div', { class: 'rs-n', text: done ? '✓' : String(n) }), h('div', { class: 'rs-sb' }, h('div', { class: 'rs-st', text: title }), ...body));
    const tsState = !ts.installed ? h('span', { class: 'rs-bad', text: '✗ Máy này chưa cài Tailscale' })
      : !ts.running ? h('span', { class: 'rs-bad', text: '⚠ Đã cài nhưng chưa đăng nhập / đang tắt' })
      : h('span', { class: 'rs-ok', text: `✓ Đã vào Tailscale: ${myAddr || ts.host} (${ts.ip})${ts.user ? ' · ' + ts.user : ''}` });
    const peers = (ts.peers || []).filter((p) => p.os !== 'iOS' && p.os !== 'android');
    el.append(
      u.group('Hướng dẫn: mở phiên ở công ty từ máy ở nhà', 'Hai máy nối với nhau qua Tailscale — mạng riêng, mã hoá, đi thẳng giữa các máy của bạn, không phải mở cổng ra Internet. Mỗi máy làm một lần.',
        h('div', { class: 'rs-guide' },
          h('div', { class: 'rs-now' }, tsState, h('button', { class: 'btn sm', text: 'Kiểm tra lại', onclick: () => u.render() })),
          step(1, ts.installed, 'Cài Tailscale trên CẢ HAI máy (công ty và nhà)', h('div', {}, 'Tải bản Windows ở ', ext('https://tailscale.com/download/windows'), ', cài như phần mềm bình thường (Next → Install).')),
          step(2, ts.running, 'Đăng nhập CÙNG MỘT tài khoản ở cả hai máy', h('div', {}, 'Bấm biểu tượng Tailscale ở khay hệ thống (góc phải thanh tác vụ) → Log in → chọn Google / Microsoft… Hai máy phải cùng tài khoản thì mới thấy nhau.'),
            ts.running && peers.length ? h('div', { class: 'rs-peers' }, h('span', { class: 'pk-muted', text: 'Các máy cùng tài khoản: ' }), ...peers.map((p) => h('span', { class: 'rs-peer' + (p.online ? ' on' : ''), title: `${p.dns} · ${p.ip}`, text: (p.online ? '● ' : '○ ') + p.host }))) : null),
          step(3, !!s.rsOn && info.on, 'Máy công ty: bật “Cho máy khác kết nối” (ngay bên dưới)', h('div', {}, 'Lần đầu Windows có thể hỏi cho Claude GUI dùng mạng — chọn Cho phép (Allow). Để máy không tự ngủ khi bạn về: Settings › System › Power › Screen and sleep → “Never” khi cắm điện.')),
          step(4, shares.length > 0 || devList.length > 0, 'Máy công ty: lấy token của một phiên (chỉ lần đầu)', h('div', {}, 'Chuột phải phiên ở thanh bên → “Chia sẻ bằng token…” → Sao chép token. Gửi token cho chính bạn (ghi chú riêng, email cá nhân…), đừng dán vào nhóm chat chung.')),
          step(5, links.size > 0 || hosts.size > 0, 'Máy ở nhà: kết nối bằng token (chỉ lần đầu)', h('div', {}, 'Mở Claude GUI → nút lọc ở thanh bên → “Thêm phiên từ máy khác…” → địa chỉ là tên máy công ty trong Tailscale', myAddr ? [' (máy này: ', h('code', { text: myAddr }), ')'] : '', ' + token → Kết nối. Hai máy nhớ nhau từ đây.'),
            h('button', { class: 'btn sm', style: 'margin-top:6px', text: 'Thêm phiên từ máy khác…', onclick: () => addDialog() })),
          step(6, shares.some((x) => x.pub), 'Từ đó trở đi: máy công ty chuột phải phiên → “Công khai cho máy đã kết nối”', h('div', {}, 'Máy ở nhà tự thấy phiên ở nhóm 🏢 trên thanh bên (cập nhật mỗi 15 giây), xem và điều khiển được, không cần token. Thôi công khai thì máy kia mất phiên đó ngay.')))),
      trafficGroup(u),
      u.group('Máy này cho máy khác kết nối', 'Bật ở máy chạy phiên (máy công ty). Chỉ phiên bạn công khai (cho máy đã kết nối) hoặc chia sẻ bằng token (máy kia cần token của đúng phiên đó) mới mở được từ xa.',
        u.row('Cho máy khác kết nối', st + ' · chỉ nhận kết nối trong Tailscale / mạng nội bộ', u.toggle(!!s.rsOn, async (v) => { await u.set({ rsOn: v }); await api.rsApply(); setTimeout(u.render, 400); })),
        u.row('Máy đã kết nối xem & điều khiển Lịch & hàng đợi', 'Máy đã kết nối mở được trang Lịch & hàng đợi của máy này (chạy, dừng, bật / tắt, duyệt bản sửa…) và thấy luôn các phiên do lịch chạy ở nhóm 🏢. Sửa nội dung kế hoạch vẫn chỉ làm ở máy này.', u.toggle(s.rsSchedRemote !== false, (v) => u.set({ rsSchedRemote: v }))),
        u.row('Máy khác được duyệt quyền', 'Tắt → máy kia chỉ xem, nhắn và Dừng; thẻ xin quyền (chạy lệnh, sửa tệp…) phải duyệt ngay tại máy này.', u.toggle(s.rsAllowPerm !== false, (v) => u.set({ rsAllowPerm: v }))),
        u.row('Địa chỉ máy này', 'Nhập ở máy kia (tên Tailscale không đổi khi đổi mạng).', h('div', { class: 'lan-addrs' }, [myAddr, ts.ip, info.host].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).map((x) => h('button', { class: 'btn sm mono', title: 'Chép', text: x, onclick: () => copy(x) })))),
        ...(shares.length ? shares.map((x) => u.row('📡 ' + (x.title || x.sid.slice(0, 8)), `${[x.pub ? 'công khai cho máy đã kết nối' : '', x.token ? 'chia sẻ bằng token' : ''].filter(Boolean).join(' + ')} · từ ${fmtT(x.t)}${x.viewers.length ? ' · đang xem: ' + x.viewers.join(', ') : ''}`, h('div', { style: 'display:flex;gap:6px' },
          x.token ? h('button', { class: 'btn sm', text: 'Chép token', onclick: () => copy(x.token) }) : null,
          x.pub ? h('button', { class: 'btn sm', text: 'Thôi công khai', onclick: async () => { await api.rsPublish({ sid: x.sid, on: false }); await loadShared(); u.render(); } }) : null,
          x.token ? h('button', { class: 'btn sm', text: 'Thu hồi token', onclick: async () => { await api.rsShare({ sid: x.sid, on: false }); await loadShared(); u.render(); } }) : null)))
          : [u.row('Phiên đang chia sẻ', 'Chưa có — chuột phải một phiên ở thanh bên → “Công khai cho máy đã kết nối” hoặc “Chia sẻ bằng token…”.', null)])),
      u.group('Máy đã kết nối tới máy này', 'Máy từng vào bằng token được nhớ lại: chúng tự thấy & điều khiển mọi phiên bạn “Công khai cho máy đã kết nối”. Gỡ một máy → máy đó mất quyền ngay (muốn vào lại phải dùng token).',
        ...(devList.length ? devList.map((d) => u.row((d.live ? '● ' : '○ ') + d.name, `Kết nối lần đầu ${fmtT(d.t)}${d.last ? ' · lần cuối ' + fmtT(d.last) : ''}${d.live ? ' · đang xem' : ''}`,
          h('button', { class: 'btn sm', text: 'Gỡ', onclick: async () => { if (!(await CG.confirmDialog('Gỡ máy ' + d.name + '?', 'Máy đó không xem / điều khiển được các phiên công khai nữa, bị ngắt ngay.', 'Gỡ', true))) return; await api.rsUnpair(d.id); await loadShared(); u.render(); } })))
          : [u.row('Chưa có', 'Máy khác kết nối lần đầu bằng token của một phiên bất kỳ thì sẽ hiện ở đây.', null)])),
      u.group('Máy đã kết nối (máy này xem được)', 'Máy bạn từng kết nối tới — các phiên bên đó công khai tự hiện ở nhóm 🏢 trên thanh bên.',
        ...(hosts.size ? [...hosts.values()].map((H) => u.row(`🏢 ${H.name}`, `${H.addr} · ${H.state === 'online' ? `đang kết nối · ${H.n || 0} phiên công khai` : H.state === 'revoked' ? 'máy kia đã gỡ máy này' : 'mất kết nối'}`,
          h('button', { class: 'btn sm', text: 'Quên', onclick: async () => { await forgetHost(H); u.render(); } })))
          : [u.row('Chưa có', 'Kết nối bằng token một lần là máy được nhớ ở đây.', h('button', { class: 'btn sm', text: 'Thêm…', onclick: () => addDialog() }))])),
      u.group('Phiên thêm bằng token (máy này đang xem)', 'Các phiên đã thêm bằng token — hiện ở nhóm 🏢 trên thanh bên.',
        ...([...links.values()].some((L) => !L.pub) ? [...links.values()].filter((L) => !L.pub).map((L) => u.row(`🏢 ${L.name} · ${L.title || ''}`, `${L.addr} · ${L.state === 'online' ? 'đang kết nối' : L.state === 'revoked' ? 'token hết hiệu lực' : 'mất kết nối'}`,
          h('button', { class: 'btn sm', text: 'Gỡ', onclick: async () => { await api.rsRemoveLink(L.id); await loadLinks(); u.render(); } })))
          : [u.row('Chưa có', 'Thêm bằng token lấy ở máy kia.', h('button', { class: 'btn sm', text: 'Thêm…', onclick: () => addDialog() }))])),
    );
  }

  // =====================================================================
  // LỊCH & HÀNG ĐỢI CỦA MÁY ĐÃ KẾT NỐI (máy nhà xem / điều khiển lịch ở máy công ty)
  // =====================================================================
  const RQ = { page: null, hid: null, data: null, sel: null, timer: null, err: '', open: new Set(), busy: false };
  const TSTR = { wait: ['○', 'chờ', ''], run: ['', 'đang chạy', 'run'], done: ['✓', 'xong', 'done'], err: ['✕', 'lỗi', 'err'], skip: ['–', 'bỏ qua', ''], pause: ['⏸', 'tạm dừng', 'pause'], ask: ['?', 'cần bạn xem', 'err'], part: ['◐', 'dừng giữa chừng', 'pause'] };
  const fmtHM = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`; };
  function schedSwitch(cur) {
    const hs = [...hosts.values()].filter((H) => H.sched !== false);
    if (!hs.length) return null;
    return h('div', { class: 'seg sm rs-sw', title: 'Xem Lịch & hàng đợi của máy khác (máy đã kết nối)' },
      h('button', { class: !cur ? 'on' : '', text: 'Máy này', onclick: () => { if (cur) { closeSched(); CG.sched.open(); } } }),
      ...hs.map((H) => h('button', { class: cur === H.id ? 'on' : '', title: H.addr, text: '🏢 ' + H.name, onclick: () => { if (cur !== H.id) openSched(H.id); } })));
  }
  function openSched(hid) {
    if (CG.sched && CG.sched._U && CG.sched._U.open) CG.sched.close();
    if (CG.skills && CG.skills.isOpen) CG.skills.close();
    if (!RQ.page) { RQ.page = h('div', { id: 'rsched-page', class: 'sched rsq hidden' }); document.getElementById('main').append(RQ.page); }
    if (RQ.hid !== hid) { RQ.data = null; RQ.sel = null; RQ.err = ''; }
    RQ.hid = hid;
    RQ.page.classList.remove('hidden');
    renderSched();
    loadSched();
    clearInterval(RQ.timer);
    RQ.timer = setInterval(() => { if (!RQ.busy && document.visibilityState === 'visible') loadSched(); }, 4000);
  }
  function closeSched() {
    if (!RQ.page || RQ.page.classList.contains('hidden')) return;
    RQ.page.classList.add('hidden');
    clearInterval(RQ.timer);
    RQ.hid = null;
  }
  async function loadSched() {
    const hid = RQ.hid;
    if (!hid) return;
    const r = await api.rsHostSched({ id: hid }).catch((e) => ({ ok: false, error: e.message }));
    if (RQ.hid !== hid) return;
    if (!r.ok) { RQ.err = r.status === 401 ? 'Máy kia đã gỡ máy này — kết nối lại bằng token.' : r.error || 'Không kết nối được'; }
    else { RQ.err = ''; RQ.data = r; if (!RQ.sel || !r.plans.some((p) => p.id === RQ.sel)) RQ.sel = r.plans[0] && r.plans[0].id; }
    renderSched();
  }
  async function act(p, a, arg, label) {
    RQ.busy = true;
    const r = await api.rsHostSched({ id: RQ.hid, plan: p.id, act: a, arg }).catch((e) => ({ ok: false, error: e.message }));
    RQ.busy = false;
    if (!r.ok) toast('Máy kia không làm được: ' + (r.error || ''), true);
    else { toast(label ? `✓ ${label}` : '✓ Đã gửi sang máy kia'); if (a === 'recheck' && !r.changed) toast('plan.json chưa đổi từ lúc gửi phiên điều phối.'); }
    await loadSched();
    setTimeout(loadSched, 1500);
  }
  // mở phiên của bước / task ở máy kia (tạo liên kết nếu danh sách chưa kịp có)
  function openHostSess(sid, title) {
    const H = hosts.get(RQ.hid);
    if (!H || !sid) return;
    const id = `h:${H.id}:${sid}`;
    let L = links.get(id) || tokLinkFor(H.host, sid);
    if (!L) { L = { id, pub: true, hostId: H.id, addr: H.addr, name: H.name, host: H.host, sid, title: title || '', cwd: '', state: 'online', info: null }; links.set(id, L); }
    closeSched();
    openRemote(L, { id: sid, title: L.title || title, cwd: L.cwd });
  }
  function renderSched() {
    const pg = RQ.page;
    if (!pg || pg.classList.contains('hidden')) return;
    const H = hosts.get(RQ.hid) || { name: '?' };
    const keep = pg.querySelector('.sc-flow') ? pg.querySelector('.sc-flow').scrollTop : 0;
    pg.innerHTML = '';
    const d = RQ.data;
    const lim = (x, n) => h('div', { class: 'sc-lim' + (x && x.pct >= 100 ? ' bad' : x && x.pct >= 80 ? ' warn' : '') },
      h('div', {}, `${n}: `, h('b', { text: x ? Math.round(x.pct) + '%' : '?' }), ' · hồi ', h('b', { text: x && x.reset ? fmtHM(x.reset) : '?' })),
      h('div', { class: 'sc-bar' }, h('i', { style: `width:${Math.min(100, x ? x.pct : 0)}%` })));
    pg.append(h('div', { class: 'sc-hdr' },
      h('h2', { text: 'Lịch & hàng đợi' }), schedSwitch(RQ.hid),
      h('button', { class: 'icon-btn sm', title: 'Tải lại', html: svg('refresh', 15), onclick: () => loadSched() }),
      h('div', { class: 'spacer' }),
      d && d.limits ? h('div', { class: 'sc-lims', title: 'Giới hạn của tài khoản bên máy ' + H.name }, lim(d.limits.s, '5 giờ'), lim(d.limits.w, 'tuần')) : null,
      h('button', { class: 'icon-btn', title: 'Đóng (Esc)', html: svg('x', 16), onclick: closeSched })));
    if (RQ.err) pg.append(h('div', { class: 'sc-note err rs-qerr', text: `🏢 ${H.name}: ${RQ.err}` }));
    if (!d) { pg.append(h('div', { class: 'sc-empty', text: RQ.err ? '' : `Đang tải lịch từ máy ${H.name}…` })); return; }
    const body = h('div', { class: 'sc-body' });
    const list = h('div', { class: 'sc-plans' });
    list.append(h('div', { class: 'rs-qhint', text: `🏢 Lịch đang chạy trên máy ${H.name}. Bấm Chạy / Dừng / duyệt ở đây là máy đó làm; sửa nội dung kế hoạch thì làm ở máy đó.` }));
    if (!d.plans.length) list.append(h('div', { class: 'sc-empty', text: 'Máy kia chưa có kế hoạch nào.' }));
    for (const p of d.plans) {
      const tog = h('span', { class: 'sc-tog' + (p.on ? ' on' : ''), title: p.on ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật' });
      const card = h('div', { class: 'sc-plan' + (p.id === RQ.sel ? ' on' : '') + (p.state === 'running' ? ' running' : '') },
        h('div', { class: 'nm' }, h('span', { class: 'ellipsis', text: p.name }), tog),
        h('div', { class: 'tr', text: p.trig }),
        h('div', { class: 'meta' }, h('span', { text: p.kind === 'project' ? `🤖 ${p.proj.tasks.length} task` : `${p.steps.length} bước` }), h('span', { class: 'ellipsis', text: p.status })));
      card.onclick = (e) => { if (e.target === tog) { act(p, 'toggle', null, p.on ? 'Đã tắt kế hoạch' : 'Đã bật kế hoạch'); return; } RQ.sel = p.id; renderSched(); };
      list.append(card);
    }
    body.append(list);
    const flow = h('div', { class: 'sc-flow' });
    const p = d.plans.find((x) => x.id === RQ.sel);
    if (p) (p.kind === 'project' ? projView : planView)(flow, p, H);
    body.append(flow);
    pg.append(body);
    flow.scrollTop = keep;
  }
  const B = (txt, fn, cls, ic) => h('button', { class: 'btn sm ' + (cls || ''), onclick: fn }, ic ? CG.icon(ic, 13) : null, txt);
  function planView(flow, p) {
    const head = h('div', { class: 'sc-flow-h' }, h('h3', { class: 'ellipsis', text: p.name }));
    if (p.state === 'running' || p.state === 'waiting' || (p.state === 'paused' && p.resumeAt)) head.append(B('Dừng', () => act(p, 'stop', null, 'Đã dừng'), '', 'square'));
    else head.append(B(p.state === 'paused' ? 'Chạy tiếp' : 'Chạy ngay', () => act(p, 'run', null, 'Đã chạy'), 'primary', 'play'));
    flow.append(head);
    if (p.note) flow.append(h('div', { class: 'sc-note ' + (p.state === 'error' ? 'err' : ''), text: p.note }));
    if (p.missed) flow.append(h('div', { class: 'row', style: 'gap:8px;margin:-4px 0 10px' }, B('Chạy bù ngay', () => act(p, 'missedRun', null, 'Đã chạy bù'), 'primary'), B('Bỏ qua lần này', () => act(p, 'missedSkip'))));
    flow.append(h('div', { class: 'sc-node trig' }, h('div', { class: 'top' }, h('span', { class: 'tag trg', text: 'Kích hoạt' }), h('span', { class: 'st', text: p.status })), h('div', { class: 'pr', text: p.trig })));
    p.steps.forEach((n, i) => {
      if (i > 0 && p.steps[i - 1].cond) flow.append(h('div', { class: 'sc-link' + (p.steps[i - 1].st === 'done' ? ' lit' : '') }, h('span', { class: 'cond', text: p.steps[i - 1].cond })));
      else flow.append(h('div', { class: 'sc-link' }, h('span', { class: 'cond', text: i ? '' : 'khi kích hoạt' })));
      const st = TSTR[n.st] || TSTR.wait;
      const el = h('div', { class: 'sc-node' + (st[2] ? ' ' + st[2] : '') },
        h('div', { class: 'top' }, h('span', { class: 'tag ' + n.kind, text: n.kind === 'new' ? 'Phiên mới' : 'Nối tiếp phiên' }), h('span', { class: 'idx', text: `Bước ${i + 1}` }),
          h('span', { class: 'st ' + st[2] }, st[2] === 'run' ? h('span', { class: 'spinner' }) : st[0], ' ' + st[1])),
        h('div', { class: 'pr', text: n.prompt || '(chưa có prompt)' }),
        h('div', { class: 'chips' }, n.where ? h('span', { class: 'chip' }, CG.icon(n.kind === 'new' ? 'folder' : 'cornerDownRight', 12), h('span', { class: 'ellipsis', text: n.where })) : null,
          n.sid ? h('button', { class: 'btn xs', text: 'Mở phiên', onclick: (e) => { e.stopPropagation(); openHostSess(n.sid, `${p.name} · bước ${i + 1}`); } }) : null));
      flow.append(el);
    });
  }
  function projView(flow, p) {
    const P = p.proj;
    flow.classList.add('ap-flow');
    const head = h('div', { class: 'sc-flow-h ap-head' }, h('h3', { class: 'ellipsis', text: '🤖 ' + p.name }), h('span', { class: 'ap-pill ' + (p.state === 'running' ? 'run' : P.hold ? 'warn' : ''), text: P.status }));
    if (!P.approved) head.append(B('Duyệt & chạy', () => act(p, 'approve', null, 'Đã duyệt'), 'primary', 'check'));
    else if (p.state === 'running' || (p.state === 'paused' && p.resumeAt)) head.append(B('Dừng', () => act(p, 'stop', null, 'Đã dừng'), '', 'square'));
    else if (!P.pending && !(P.hold && (P.hold.kind === 'planning' || P.hold.kind === 'check')) && (p.state !== 'done' || P.tasks.some((t) => t.st !== 'done' && t.st !== 'skip'))) head.append(B(p.state === 'paused' || p.state === 'idle' ? 'Chạy tiếp' : 'Chạy', () => act(p, 'run', null, 'Đã chạy'), P.hold ? '' : 'primary', 'play'));
    if (P.plannerSid) head.append(B('Phiên điều phối', () => openHostSess(P.plannerSid, p.name + ' · điều phối'), '', 'bot'));
    flow.append(head);
    const live = P.tasks.filter((t) => t.st !== 'skip'), done = live.filter((t) => t.st === 'done').length;
    flow.append(h('div', { class: 'ap-trk' }, h('div', { class: 'ap-trk-bar' }, h('i', { style: { width: Math.round((done / (live.length || 1)) * 100) + '%' } })), h('div', { class: 'ap-trk-lbl', text: `${done}/${live.length} task xong` })));
    const hd = P.hold;
    if (P.pending) {
      flow.append(h('div', { class: 'ap-alert pending' }, h('h3', {}, '🗓 Bản sửa lịch từ phiên điều phối'), P.pending.change ? h('blockquote', { text: P.pending.change }) : null,
        h('div', { class: 'ap-df' }, P.pending.lines.length ? P.pending.lines.map((x) => h('div', { class: x[0] === '+' ? 'p' : x[0] === '~' ? 'c' : 'm', text: x })) : h('div', { class: 'note', text: 'Không có thay đổi task.' })),
        h('div', { class: 'ap-row2' }, B('Áp dụng & chạy tiếp', () => act(p, 'applyRun', null, 'Đã áp dụng & chạy tiếp'), 'primary'), B('Áp dụng, chưa chạy', () => act(p, 'apply', null, 'Đã áp dụng')),
          P.plannerSid ? B('Mở phiên điều phối', () => openHostSess(P.plannerSid, p.name + ' · điều phối')) : null, B('Bỏ bản sửa', () => act(p, 'dropPending', null, 'Đã bỏ bản sửa'), 'danger-text'))));
    } else if (hd) {
      const openT = hd.sid ? B('Mở phiên task', () => openHostSess(hd.sid, hd.who)) : null;
      const T = (a, label, cls) => B(label, () => act(p, a, { task: hd.task }, label), cls);
      const K = {
        replan: () => [h('h3', {}, '🔁 Task xin đổi lịch'), h('div', { class: 'who', text: hd.who }), h('blockquote', { text: hd.reason }), hd.proposal ? h('div', { class: 'note', text: 'Đề xuất của task: ' + hd.proposal }) : null, [B('Nhờ phiên điều phối soạn bản sửa', () => act(p, 'askPlanner', null, 'Đã gửi phiên điều phối'), 'primary'), T('taskRetry', 'Bỏ qua, chạy lại task đó'), T('taskSkip', 'Bỏ qua task, chạy tiếp'), openT]],
        acc: () => [h('h3', {}, '⚠ Task chưa đạt tiêu chí'), h('div', { class: 'who', text: `${hd.who} — bàn giao ghi “${hd.acc}”` }), hd.text ? h('pre', { class: 'ap-pre', text: hd.text }) : null, [T('taskDone', 'Coi như xong, chạy tiếp', 'primary'), T('taskRetry', 'Chạy lại bằng phiên mới'), B('Nhờ phiên điều phối sửa lịch', () => act(p, 'askPlanner', null, 'Đã gửi phiên điều phối')), openT]],
        err: () => [h('h3', {}, '✕ Task gặp lỗi'), h('div', { class: 'who', text: hd.who || hd.text }), [hd.task ? T('taskRetry', 'Chạy lại bằng phiên mới', 'primary') : B('Chạy tiếp', () => act(p, 'resume', null, 'Đã chạy tiếp'), 'primary'), hd.task ? T('taskSkip', 'Bỏ qua task, chạy tiếp') : null, openT]],
        stopped: () => [h('h3', {}, '⏹ Task bị dừng giữa chừng'), h('div', { class: 'who', text: hd.who }), [hd.sid ? T('taskCont', 'Làm tiếp trong phiên đó', 'primary') : null, T('taskRetry', 'Chạy lại bằng phiên mới'), T('taskSkip', 'Bỏ qua task'), openT]],
        cp: () => [h('h3', {}, '⏸ Điểm dừng chờ duyệt'), h('div', { class: 'who', text: `Xong ${hd.who}. Xem kết quả rồi chạy tiếp.` }), [B('Chạy tiếp', () => act(p, 'resume', null, 'Đã chạy tiếp'), 'primary'), openT]],
        designchg: () => [h('h3', {}, '🎨 Design đã đổi từ lúc lập kế hoạch'), h('div', { class: 'ap-df' }, hd.items.map((x) => h('div', { class: 'c', text: '~ ' + x }))), [B('Phân tích & đề xuất sửa lịch', () => act(p, 'designAnalyze', null, 'Đã gửi phiên điều phối'), 'primary'), B('Bỏ qua, chạy tiếp', () => act(p, 'resume', null, 'Đã chạy tiếp')), B('Ghi nhận bản mới, không sửa lịch', () => act(p, 'designAccept', null, 'Đã ghi nhận'))]],
        planning: () => [h('h3', {}, h('span', { class: 'spinner' }), ' Đang chờ phiên điều phối soạn bản sửa lịch'), h('div', { class: 'who', text: hd.reason }),
          hd.answered ? h('div', { class: 'pk-warn', text: `Phiên điều phối đã trả lời lúc ${fmtHM(hd.answered)} nhưng chưa ghi lại plan.json — có thể nó đang hỏi lại bạn.` }) : null,
          [P.plannerSid ? B('Mở phiên điều phối', () => openHostSess(P.plannerSid, p.name + ' · điều phối'), 'primary') : null, B('Kiểm tra lại plan.json', () => act(p, 'recheck')), B('Huỷ, chạy tiếp như cũ', () => act(p, 'resume', null, 'Đã chạy tiếp'))]],
        check: () => [h('h3', {}, h('span', { class: 'spinner' }), ' Đang kiểm tra design có đổi không'), [!P.checking ? B('Bỏ qua kiểm tra, chạy tiếp', () => act(p, 'skipCheck', null, 'Đã chạy tiếp'), 'primary') : null]],
        blocked: () => [h('h3', {}, '⏸ Tạm dừng'), h('div', { class: 'who', text: p.note || 'Một số task cần bạn xem.' }), [B('Chạy tiếp', () => act(p, 'resume', null, 'Đã chạy tiếp'), 'primary')]],
      };
      const parts = (K[hd.kind] || K.blocked)();
      const btns = parts.pop();
      flow.append(h('div', { class: 'ap-alert ' + hd.kind }, ...parts.filter(Boolean), h('div', { class: 'ap-row2' }, ...btns.filter(Boolean))));
    } else if (p.note) flow.append(h('div', { class: 'sc-note', text: p.note }));
    if (P.goal) flow.append(h('div', { class: 'ap-box rs-qgoal' }, h('h4', { text: 'Mục tiêu' }), h('div', { class: 'ap-goal', text: P.goal }), P.dir ? h('div', { class: 'ap-path' }, CG.icon('folder', 12), h('span', { class: 'ellipsis', text: P.dir })) : null));
    const el = h('div', { class: 'ap-tasks' });
    for (const ph of P.phases) {
      const ts = P.tasks.filter((t) => t.phase === ph.ph);
      el.append(h('div', { class: 'ap-ph' }, h('b', { text: ph.name }), h('small', { text: `${ts.length} task · ${ts.filter((t) => t.st === 'done' || t.st === 'skip').length} xong` })));
      for (const t of ts) {
        const st = TSTR[t.st] || TSTR.wait, open = RQ.open.has(t.id);
        const th = h('div', { class: 'ap-th' },
          h('span', { class: 'ap-dot ' + t.st }, t.st === 'run' ? h('span', { class: 'spinner' }) : t.st === 'wait' ? String(t.no) : st[0]),
          h('div', { class: 'ap-tt' }, h('b', { text: t.title }), h('small', {}, t.why ? h('i', { text: t.why }) : null, t.st !== 'wait' ? h('span', { class: 'ap-stt', text: ' · ' + st[1] }) : null)),
          h('span', { class: 'ap-m', text: `${t.model} · ${t.effort || ''}` }));
        th.onclick = () => { open ? RQ.open.delete(t.id) : RQ.open.add(t.id); renderSched(); };
        const row = h('div', { class: 'ap-task' + (open ? ' open' : '') + ' s-' + t.st }, th);
        if (open) {
          const acts = [];
          if (t.sid) acts.push(h('button', { class: 'btn xs', text: 'Mở phiên', onclick: () => openHostSess(t.sid, `#${t.no} ${t.title}`) }));
          if (t.st !== 'run' && t.st !== 'wait') acts.push(h('button', { class: 'btn xs', text: 'Chạy lại task', onclick: () => act(p, 'taskRetry', { task: t.id, only: true }, `Task #${t.no} sẽ chạy lại khi dự án chạy tiếp`) }));
          if (['wait', 'ask', 'err', 'part'].includes(t.st)) acts.push(h('button', { class: 'btn xs', text: 'Bỏ qua task', onclick: () => act(p, 'taskSkip', { task: t.id, only: true }, `Đã bỏ qua task #${t.no}`) }));
          row.append(h('div', { class: 'ap-td' }, h('div', { class: 'ap-acts' }, h('span', { class: 'spacer' }), ...acts)));
        }
        el.append(row);
      }
    }
    flow.append(el);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && RQ.hid && !document.querySelector('.popover, .modal-bg')) closeSched(); });
  document.addEventListener('click', (e) => { if (RQ.hid && (e.target.closest('#nav-sched, #nav-skills, #btn-new') || (e.target.closest('#session-list') && !e.target.closest('.rs-qrow')))) closeSched(); }, true);

  CG.remote = {
    openSched, closeSched, schedSwitch, setPref, prefChanged, machines, fullResult, touched, revive, _streaming: streaming,
    emit, userSent, permDone, busyChanged, isShared, watching, menuItems, titleChip, setShare, setPublic, showToken, _hosts: hosts, reloadHosts: loadHosts,
    renderGroup, openRemote, openChild, send, respond, stop, api: rsApi, addDialog, settingsPage, _links: links, _shared: () => shared, reload: loadLinks,
  };
})();
