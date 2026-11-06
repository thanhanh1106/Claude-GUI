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
  let live = new Map(); // sid -> [tên máy đang xem]
  const loadShared = () => api.rsShares().then((l) => { shared = new Set((l || []).map((x) => x.sid)); A() && A().renderSidebar(); }).catch(() => {});
  loadShared();
  if (api.onRsLive) api.onRsLive((list) => {
    live = new Map((list || []).map((x) => [x.sid, x.names]));
    if (A()) { A().renderSidebar(); const c = S().active; if (c) titleChip(c); }
  });
  const isShared = (sid) => shared.has(sid);
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
  async function onReq(kind, d) {
    // máy chủ đã kiểm token; danh sách ở đây có thể chưa kịp làm mới
    if (!shared.has(d.sid)) { await loadShared(); if (!shared.has(d.sid)) return { ok: false, error: 'Phiên không còn được chia sẻ' }; }
    if (kind === 'state') {
      const c = localConv(d.sid);
      return { ok: true, open: !!c, busy: !!(c && c.busy), title: c ? c.title : '', cwd: c ? c.cwd : '', perms: c ? [...c.perms.values()].map((p) => p.raw).filter(Boolean) : [] };
    }
    let c = localConv(d.sid);
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
    if (kind === 'stop') { c.interrupt(); c.addNote(`Dừng từ ${d.from || 'máy khác'}.`); return { ok: true }; }
    return { ok: false, error: 'Không rõ yêu cầu' };
  }

  // bật / tắt / đổi token
  async function setShare(it, on, renew) {
    if (on) {
      const info = await api.rsInfo();
      if (!info.want) {
        const go = await CG.confirmDialog('Bật Truy cập từ xa?', 'Máy này chưa cho máy khác kết nối. Bật để máy có token mở được phiên này (mở cổng ' + info.port + ', chỉ nhận kết nối trong Tailscale / mạng nội bộ).', 'Bật');
        if (!go) return;
        await CG.saveSettings({ rsOn: true });
        await api.rsApply();
      }
    }
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
    const on = shared.has(it.id);
    return [
      { label: on ? 'Tắt chia sẻ cho máy khác' : 'Cho máy khác thấy & điều khiển', desc: on ? '📡 đang chia sẻ · thu hồi token' : 'qua Tailscale, máy kia cần token', icon: 'globe', onClick: () => setShare(it, !on) },
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
    if (shared.has(c.sid)) el.append(h('span', { class: 'rs-chip on', title: 'Máy có token thấy & điều khiển được phiên này — bấm để xem token / tắt', onclick: (e) => { e.stopPropagation(); CG.menu(e.currentTarget, menuItems({ id: c.sid, title: c.title })); } }, '📡 Đang chia sẻ'));
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
    for (const id of [...links.keys()]) if (!keep.has(id)) { links.delete(id); api.rsDisconnect(id); }
    for (const L of list) {
      const cur = links.get(L.id);
      links.set(L.id, { ...(cur || { state: 'connecting', info: null }), ...L });
      if (!cur) { api.rsConnect(L.id); refreshInfo(L.id); }
    }
    A() && A().renderSidebar();
  }
  setTimeout(loadLinks, 1500);
  async function refreshInfo(id) {
    const L = links.get(id);
    if (!L) return;
    const r = await api.rsCall({ link: id, path: '/rs/info', ms: 10000 });
    if (r.ok) { L.info = r; L.title = r.title || L.title; L.cwd = r.cwd || L.cwd; L.name = r.name || L.name; L.busy = r.busy; if (L.state !== 'online') L.state = 'online'; }
    else if (r.status === 401) L.state = 'revoked';
    else if (L.state !== 'online') L.state = 'offline';
    A().renderSidebar();
    const c = S().active; if (c) titleChip(c);
  }
  setInterval(() => { for (const id of links.keys()) refreshInfo(id); }, 30000);
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
    if (m.type === 'gui_perm_done') { const card = c.perms.get(m.request_id); if (card) c.finishPerm(m.request_id, card, m.label || 'Đã xử lý ở máy kia', !!m.ok); return; }
    if (m.type && m.type.startsWith('gui_')) return;
    c.handle(m);
  });

  // mở phiên từ xa: dựng Conv như phiên thường, lịch sử lấy từ máy kia
  async function openRemote(L, it) {
    const key = convKey(L, it.id);
    let conv = S().convs.get(key);
    if (conv) { A().activate(conv); titleChip(conv); return conv; }
    conv = A().rawConv({ key, sid: it.id, cwd: it.cwd || L.cwd || '', persisted: true, title: it.title || L.title });
    conv.rs = { link: L.id, name: L.name || L.host };
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
      const info = await api.rsCall({ link: L.id, path: '/rs/info', ms: 10000 });
      if (info.ok) {
        L.info = info;
        if (info.busy) conv.setBusy(true);
        for (const p of info.perms || []) if (p && p.request_id && !conv.perms.has(p.request_id)) conv.permRequest(p.request_id, p.request);
        conv.rsChildren = info.children || [];
        for (const ch of conv.rsChildren) { const card = ch.toolUseId && conv.tools.get(ch.toolUseId); if (card && card.linkChild) card.linkChild({ ...ch, parentId: it.id, child: true }); }
      }
    } else watchChild(L, conv);
    A().activate(conv);
    const sc = document.getElementById('scroller'); if (sc) sc.scrollTop = sc.scrollHeight;
    titleChip(conv);
    return conv;
  }
  function watchChild(L, conv) {
    const t = setInterval(() => {
      if (S().convs.get(conv.key) !== conv) return clearInterval(t);
      if (S().active === conv || S().side === conv) A().reloadChild(conv);
    }, 3000);
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
  function renderGroup(list) {
    if (!links.size) return;
    const byHost = new Map();
    for (const L of links.values()) { const k = L.host || L.name; if (!byHost.has(k)) byHost.set(k, []); byHost.get(k).push(L); }
    for (const arr of byHost.values()) {
      const on = arr.some((L) => L.state === 'online');
      list.append(h('div', { class: 'grp-head rs-head', title: `Phiên trên máy ${arr[0].name} (qua Tailscale / LAN)` },
        h('span', { class: 'rs-dot ' + (on ? 'on' : 'off') }), h('span', { class: 'g-name ellipsis', text: '🏢 ' + (arr[0].name || arr[0].host) }), h('span', { class: 'g-count', text: arr.length })));
      for (const L of arr) {
        const c = rsConv(L, L.sid);
        const busy = c ? c.busy : L.busy;
        const wait = c && c.perms.size;
        const active = S().active && S().active.key === convKey(L, L.sid);
        const row = h('div', { class: 'sess rs-sess' + (active ? ' active' : '') + (L.state === 'revoked' ? ' rs-dead' : ''), title: `${L.title}\n${L.cwd || ''}\nMáy ${L.name} · ${L.state === 'online' ? 'đang kết nối' : L.state === 'revoked' ? 'đã ngừng chia sẻ' : 'mất kết nối'}` },
          h('span', { class: 'st ' + (busy ? (wait ? 'wait' : 'run') : '') }),
          h('span', { class: 's-title ellipsis', text: L.title || '(phiên)' }),
          h('span', { class: 's-time', text: L.state === 'revoked' ? '✕' : L.state === 'online' ? '' : '…' }));
        row.onclick = () => (L.state === 'revoked' ? linkMenu(L, row) : openRemote(L, { id: L.sid, title: L.title, cwd: L.cwd }));
        row.oncontextmenu = (e) => { e.preventDefault(); linkMenu(L, CG.pointAnchor(e.clientX, e.clientY)); };
        list.append(row);
        const kids = (c && c.rsChildren) || (L.info && L.info.children) || [];
        if (kids.length) {
          const box = h('div', { class: 'sess-kids' });
          for (const k of kids.slice(0, 8)) {
            const ka = S().active && S().active.key === convKey(L, k.id);
            const kr = h('div', { class: 'sess child' + (ka ? ' active' : ''), title: k.title }, h('span', { class: 'st' }), h('span', { class: 's-title ellipsis', text: '↳ ' + (k.title || k.agentId) }));
            kr.onclick = () => openRemote(L, { ...k, child: true, parentId: L.sid, cwd: L.cwd });
            box.append(kr);
          }
          list.append(box);
        }
      }
    }
  }
  function linkMenu(L, anchor) {
    CG.menu(anchor, [
      { label: 'Mở', icon: 'message', disabled: L.state === 'revoked', onClick: () => openRemote(L, { id: L.sid, title: L.title, cwd: L.cwd }) },
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
    const body = h('div', { class: 'rs-add' },
      h('label', { class: 'rs-lbl', text: 'Địa chỉ máy đang chạy phiên' }), addr,
      peers.length ? h('div', { class: 'rs-peers' }, h('span', { class: 'pk-muted', text: 'Máy trong Tailscale của bạn: ' }), ...peers.map((p) => h('button', { class: 'btn sm' + (p.online ? '' : ' dim'), title: `${p.dns || p.host} · ${p.ip}${p.online ? '' : ' · đang offline'}`, text: (p.online ? '● ' : '○ ') + p.host, onclick: () => { addr.value = p.host; } }))) : null,
      h('label', { class: 'rs-lbl', text: 'Token của phiên' }), tok,
      h('div', { class: 'pk-muted', text: 'Lấy ở máy kia: chuột phải phiên → “Cho máy khác thấy & điều khiển” (hoặc “Xem / sao chép token”).' }),
      !ts.running ? h('div', { class: 'pk-warn' }, '⚠ Máy này chưa vào Tailscale — chỉ kết nối được máy cùng mạng LAN. ', h('a', { href: '#', text: 'Hướng dẫn cài Tailscale', onclick: (e) => { e.preventDefault(); m.close(); CG.openSettings('remote'); } })) : null,
      msg);
    const go = async () => {
      msg.textContent = 'Đang kết nối…'; msg.className = 'rs-msg';
      const r = await api.rsAddLink({ addr: addr.value.trim(), token: tok.value.trim() });
      if (!r.ok) { msg.textContent = '✗ ' + (r.status === 401 ? 'Token không đúng hoặc phiên đã ngừng chia sẻ.' : r.error); msg.className = 'rs-msg bad'; return; }
      m.close();
      await loadLinks();
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
  async function settingsPage(el, u) {
    const info = await api.rsInfo();
    const s = S().settings;
    const ts = info.tailscale || {};
    const shares = await api.rsShares();
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
          step(4, shares.length > 0, 'Máy công ty: chia sẻ phiên muốn mở từ nhà', h('div', {}, 'Chuột phải phiên ở thanh bên → “Cho máy khác thấy & điều khiển” → Sao chép token. Gửi token cho chính bạn (ghi chú riêng, email cá nhân…), đừng dán vào nhóm chat chung.')),
          step(5, links.size > 0, 'Máy ở nhà: thêm phiên bằng token', h('div', {}, 'Mở Claude GUI → nút lọc ở thanh bên → “Thêm phiên từ máy khác…” → địa chỉ là tên máy công ty trong Tailscale', myAddr ? [' (máy này: ', h('code', { text: myAddr }), ')'] : '', ' + token → Kết nối. Phiên hiện ở nhóm 🏢 trên thanh bên.'),
            h('button', { class: 'btn sm', style: 'margin-top:6px', text: 'Thêm phiên từ máy khác…', onclick: () => addDialog() })))),
      u.group('Máy này cho máy khác kết nối', 'Bật ở máy chạy phiên (máy công ty). Chỉ phiên bạn bật chia sẻ mới mở được từ xa, và máy kia phải có token của đúng phiên đó.',
        u.row('Cho máy khác kết nối', st + ' · chỉ nhận kết nối trong Tailscale / mạng nội bộ', u.toggle(!!s.rsOn, async (v) => { await u.set({ rsOn: v }); await api.rsApply(); setTimeout(u.render, 400); })),
        u.row('Máy khác được duyệt quyền', 'Tắt → máy kia chỉ xem, nhắn và Dừng; thẻ xin quyền (chạy lệnh, sửa tệp…) phải duyệt ngay tại máy này.', u.toggle(s.rsAllowPerm !== false, (v) => u.set({ rsAllowPerm: v }))),
        u.row('Địa chỉ máy này', 'Nhập ở máy kia (tên Tailscale không đổi khi đổi mạng).', h('div', { class: 'lan-addrs' }, [myAddr, ts.ip, info.host].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).map((x) => h('button', { class: 'btn sm mono', title: 'Chép', text: x, onclick: () => copy(x) })))),
        ...(shares.length ? shares.map((x) => u.row('📡 ' + (x.title || x.sid.slice(0, 8)), `Chia sẻ từ ${fmtT(x.t)}${x.viewers.length ? ' · đang xem: ' + x.viewers.join(', ') : ''}`, h('div', { style: 'display:flex;gap:6px' },
          h('button', { class: 'btn sm', text: 'Chép token', onclick: () => copy(x.token) }),
          h('button', { class: 'btn sm', text: 'Thu hồi', onclick: async () => { await api.rsShare({ sid: x.sid, on: false }); await loadShared(); u.render(); } }))))
          : [u.row('Phiên đang chia sẻ', 'Chưa có — chuột phải một phiên ở thanh bên → “Cho máy khác thấy & điều khiển”.', null)])),
      u.group('Phiên từ máy khác (máy này đang xem)', 'Các phiên đã thêm bằng token — hiện ở nhóm 🏢 trên thanh bên.',
        ...(links.size ? [...links.values()].map((L) => u.row(`🏢 ${L.name} · ${L.title || ''}`, `${L.addr} · ${L.state === 'online' ? 'đang kết nối' : L.state === 'revoked' ? 'token hết hiệu lực' : 'mất kết nối'}`,
          h('button', { class: 'btn sm', text: 'Gỡ', onclick: async () => { await api.rsRemoveLink(L.id); await loadLinks(); u.render(); } })))
          : [u.row('Chưa có', 'Thêm bằng token lấy ở máy kia.', h('button', { class: 'btn sm', text: 'Thêm…', onclick: () => addDialog() }))])),
    );
  }

  CG.remote = {
    emit, userSent, permDone, busyChanged, isShared, watching, menuItems, titleChip, setShare, showToken,
    renderGroup, openRemote, openChild, send, respond, stop, api: rsApi, addDialog, settingsPage, _links: links, _shared: () => shared, reload: loadLinks,
  };
})();
