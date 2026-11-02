'use strict';
// Các tính năng theo bản desktop gốc: góp ý từng dòng trên diff, thẻ /code-review, chip ngữ cảnh đính kèm.
(() => {
  const CG = window.CG;
  const { $, $$, h, svg, icon, toast, basename } = CG;
  const S = () => CG.S;
  const convs = () => (CG.app ? CG.app.convs() : []);
  const convOfEl = (el) => { const root = el && el.closest && el.closest('.conv'); return (root && convs().find((c) => c.root === root)) || S().active; };
  const isAbs = (p) => /^[a-zA-Z]:[\\/]|^[\\/]/.test(p || '');
  const joinP = (a, b) => (isAbs(b) || !a ? b : a.replace(/[\\/]+$/, '') + '\\' + String(b).replace(/\//g, '\\'));
  const rel = (c, p) => { const cwd = (c && c.cwd || '').replace(/[\\/]+$/, '').toLowerCase(); return p && cwd && p.toLowerCase().startsWith(cwd + '\\') ? p.slice(cwd.length + 1) : p; };

  // =====================================================================
  // 3 · Góp ý từng dòng trên diff → gom lại, Ctrl+Enter gửi một lần
  // =====================================================================
  const CM = new Map(); // khoá phiên → [{ id, file, ln, code, text, el }]
  let seq = 0;
  const ROW_SEL = '.diff[data-file] .dl:not(.gap), .gp-hb[data-file] .gp-dl:not(.m)';
  const listOf = (c) => { if (!CM.has(c.key)) CM.set(c.key, []); return CM.get(c.key); };
  document.addEventListener('mouseover', (e) => {
    const row = e.target.closest && e.target.closest(ROW_SEL);
    if (!row || row.querySelector(':scope > .dl-cm-btn')) return;
    row.classList.add('cm-row');
    const b = h('button', { class: 'dl-cm-btn', title: 'Góp ý dòng này cho Claude', text: '+' });
    b.onclick = (ev) => { ev.stopPropagation(); addComment(row); };
    row.prepend(b);
  });
  function rowInfo(row) {
    const box = row.closest('[data-file]');
    let ln = row.dataset.ln;
    if (!ln) { // dòng bị xoá: lấy số dòng của dòng còn lại gần nhất phía sau / trước
      for (let n = row.nextElementSibling; n && !ln; n = n.nextElementSibling) ln = n.dataset && n.dataset.ln;
      for (let n = row.previousElementSibling; n && !ln; n = n.previousElementSibling) ln = n.dataset && n.dataset.ln;
    }
    const txt = row.querySelector('.txt');
    let code = (txt ? txt.textContent : row.textContent.replace(/^\+/, '')).replace(/\s+$/, '');
    if (!txt) code = code.slice(1);
    const del = row.classList.contains('del') || row.classList.contains('d');
    return { file: box.dataset.file, ln: +ln || 0, code: code.trim().slice(0, 200), del };
  }
  function editorFor(c, it) {
    const ta = h('textarea', { rows: 2, placeholder: `Góp ý cho dòng ${it.ln || '?'}… (Ctrl+Enter gửi tất cả góp ý)` });
    ta.value = it.text;
    ta.oninput = () => { it.text = ta.value; paintBar(); };
    ta.onkeydown = (e) => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); sendAll(c); }
      else if (e.key === 'Escape' && !ta.value.trim()) { e.preventDefault(); removeComment(c, it); }
      e.stopPropagation();
    };
    const el = h('div', { class: 'diff-cmt', 'data-cm': it.id }, ta,
      h('div', { class: 'row' }, h('span', { text: `${basename(it.file)}:${it.ln || '?'}${it.del ? ' (dòng bị xoá)' : ''}` }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn xs', text: 'Bỏ', onclick: () => removeComment(c, it) })));
    it.el = el;
    return el;
  }
  function addComment(row) {
    const c = convOfEl(row);
    if (!c) return;
    const inf = rowInfo(row);
    const L = listOf(c);
    let it = L.find((x) => x.file === inf.file && x.ln === inf.ln && x.code === inf.code);
    if (!it) { it = { id: 'cm' + ++seq, text: '', ...inf }; L.push(it); }
    if (!it.el || !it.el.isConnected) row.after(editorFor(c, it));
    it.el.querySelector('textarea').focus();
    paintBar();
  }
  function removeComment(c, it) {
    const L = listOf(c);
    const i = L.indexOf(it);
    if (i >= 0) L.splice(i, 1);
    if (it.el) it.el.remove();
    paintBar();
  }
  function sendAll(c) {
    const L = listOf(c).filter((x) => x.text.trim());
    if (!L.length) return toast('Chưa có góp ý nào có nội dung.');
    const msg = 'Góp ý của tôi cho các thay đổi — sửa theo từng góp ý:\n\n' + L.map((x, i) =>
      `${i + 1}. ${rel(c, x.file)}:${x.ln || '?'}${x.del ? ' (dòng đã xoá)' : ''}${x.code ? ` — \`${x.code.replace(/`/g, "'")}\`` : ''}\n   → ${x.text.trim()}`).join('\n');
    for (const x of listOf(c)) if (x.el) x.el.remove();
    CM.set(c.key, []);
    paintBar();
    if (c !== S().active && CG.app) CG.app.activate(c);
    c.send(msg, msg);
    toast(`Đã gửi ${L.length} góp ý cho Claude`);
  }
  // Thanh "N góp ý chưa gửi" trên ô nhập của phiên đang xem
  function paintBar() {
    const c = S().active;
    let bar = $('#cm-pending');
    const L = c ? listOf(c) : [];
    const n = L.filter((x) => x.text.trim()).length;
    if (!L.length) { if (bar) bar.remove(); return; }
    if (!bar) { bar = h('div', { id: 'cm-pending' }); const comp = $('#composer'); if (!comp) return; comp.prepend(bar); }
    bar.innerHTML = '';
    bar.append(icon('message', 13), h('span', { text: `${L.length} góp ý trên diff${n < L.length ? ` (${L.length - n} chưa gõ)` : ''}` }), h('span', { class: 'spacer' }),
      h('button', { class: 'btn xs primary', text: `Gửi ${n} góp ý (Ctrl+Enter)`, disabled: !n, onclick: () => sendAll(c) }),
      h('button', { class: 'btn xs', text: 'Bỏ hết', onclick: () => { for (const x of L) if (x.el) x.el.remove(); CM.set(c.key, []); paintBar(); } }));
  }
  // bảng Thay đổi vẽ lại → gắn lại ô góp ý vào đúng dòng
  new MutationObserver(() => {
    const c = S().active;
    if (!c) return;
    for (const it of listOf(c)) {
      if (it.el && it.el.isConnected) continue;
      const box = [...$$('[data-file]')].find((b) => b.dataset.file === it.file && (b.closest('#details') || b.closest('.conv') === c.root));
      if (!box) continue;
      const row = [...box.querySelectorAll('[data-ln]')].find((r) => +r.dataset.ln === it.ln);
      if (row) row.after(editorFor(c, it));
    }
  }).observe(document.body, { childList: true, subtree: true });

  // =====================================================================
  // 6 · Thẻ /code-review (CLI báo kết quả qua công cụ ReportFindings)
  // =====================================================================
  const SEV = (f) => {
    const s = `${f.category || ''} ${f.severity || ''}`.toLowerCase();
    if (/critical|high|security|correct|bug|crash|data/.test(s) || f.verdict === 'CONFIRMED') return ['hi', 'Cao'];
    if (/simpl|style|nit|clean|reuse|efficien|altitude|low/.test(s)) return ['lo', 'Nhẹ'];
    return ['md', 'Vừa'];
  };
  function reviewCard(c, inp) {
    const F = (inp && Array.isArray(inp.findings) ? inp.findings : []).slice(0, 32);
    const box = h('div', { class: 'rv-card' });
    const fixMsg = (list) => 'Sửa các vấn đề sau từ code review (xong thì chạy lại build / test liên quan):\n\n' + list.map((f, i) =>
      `${i + 1}. ${f.file}${f.line ? ':' + f.line : ''} — ${f.summary}${f.failure_scenario ? `\n   Tình huống lỗi: ${f.failure_scenario}` : ''}`).join('\n');
    const items = F.map((f) => {
      const [k, lbl] = SEV(f);
      const done = () => { row.classList.add('done'); acts.innerHTML = ''; acts.append(h('span', { class: 'rv-loc', text: '✓ đã giao Claude sửa' })); };
      const acts = h('div', { class: 'rv-acts' },
        f.file ? h('button', { class: 'btn xs', text: 'Xem trong tệp', title: 'Mở tệp đúng dòng ở khung xem', onclick: () => CG.viewer && CG.viewer.openFile(joinP(c.cwd, f.file), f.line || 0) }) : null,
        h('button', { class: 'btn xs', text: 'Sửa lỗi này', onclick: () => { c.send(fixMsg([f]), `Sửa vấn đề từ code review: ${f.short_summary || f.summary}`); done(); } }));
      const row = h('div', { class: 'rv-i' }, h('span', { class: 'rv-sev ' + k, text: lbl }),
        h('div', {}, h('b', { text: f.short_summary || f.summary || '' }), h('div', { class: 'rv-loc', text: `${f.file || ''}${f.line ? ':' + f.line : ''}${f.category ? ' · ' + f.category : ''}` }),
          f.short_summary && f.summary ? h('div', { text: f.summary }) : null,
          f.failure_scenario ? h('div', { class: 'rv-loc', text: 'Tình huống: ' + f.failure_scenario }) : null), acts);
      row._f = f; row._done = done;
      return row;
    });
    box.append(h('div', { class: 'rv-h' }, icon('search', 14), h('span', { text: F.length ? `Code review · ${F.length} vấn đề` : 'Code review · không có vấn đề nào' }), h('span', { class: 'spacer' }),
      F.length > 1 ? h('button', { class: 'btn xs primary', text: 'Sửa tất cả', onclick: () => { const left = items.filter((r) => !r.classList.contains('done')); if (!left.length) return; c.send(fixMsg(left.map((r) => r._f)), `Sửa ${left.length} vấn đề từ code review`); left.forEach((r) => r._done()); } }) : null),
      ...items);
    return box;
  }

  // =====================================================================
  // 7 · Phiên nói chuyện với nhau (MCP nội bộ của GUI gọi sang đây)
  // =====================================================================
  const api = window.api;
  const hiddenIds = () => { const s = new Set(); if (CG.nb) for (const x of CG.nb.hiddenSids()) s.add(x); if (CG.btw) for (const x of CG.btw.hiddenSids()) s.add(x); return s; };
  function sessionList(exceptKey) {
    const hid = hiddenIds();
    const live = new Map(convs().filter((c) => c.sid && !c.nb && !c.btw && !c.child).map((c) => [c.sid, c]));
    const me = convs().find((c) => c.key === exceptKey);
    const map = new Map();
    for (const d of S().all || []) if (!hid.has(d.id)) map.set(d.id, { id: d.id, title: d.title, cwd: d.cwd, mtime: d.mtime });
    for (const c of live.values()) if (c.count && !map.has(c.sid)) map.set(c.sid, { id: c.sid, title: c.title || 'Phiên mới', cwd: c.cwd, mtime: c.lastActive });
    return [...map.values()].filter((x) => !me || x.id !== me.sid).map((x) => {
      const c = live.get(x.id);
      return { ...x, status: c ? (c.busy ? 'đang chạy' : 'đang mở, rảnh') : 'đã đóng', mtime: Math.max(x.mtime || 0, (c && c.lastActive) || 0) };
    }).sort((a, b) => b.mtime - a.mtime);
  }
  function resolveSession(q, exceptKey) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return null;
    const L = sessionList(exceptKey);
    return L.find((x) => x.id.toLowerCase() === q) || L.find((x) => x.id.toLowerCase().startsWith(q.replace(/^#/, ''))) || L.find((x) => (x.title || '').toLowerCase().includes(q)) || null;
  }
  async function deliver(fromKey, id, message) {
    const from = convs().find((c) => c.key === fromKey);
    const c = await CG.app.convFor(id);
    if (!c) return { error: 'Không mở được phiên đích' };
    const fromTitle = (from && from.title) || 'phiên khác';
    const body = h('div', { class: 'xs-body', text: message });
    const card = h('div', { class: 'xs-card' },
      h('div', { class: 'xs-h' }, icon('message', 13), h('b', { text: `Tin nhắn từ phiên “${fromTitle}”` }), h('span', { class: 'spacer' }), h('span', { class: 'muted', text: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) })),
      body,
      h('div', { class: 'row', style: 'gap:6px' },
        h('button', { class: 'btn xs primary', text: 'Gửi cho Claude ở phiên này', onclick: () => { card.classList.add('done'); c.xsPending = Math.max(0, (c.xsPending || 1) - 1); const t = `[Tin nhắn từ phiên Claude khác: “${fromTitle}”${from && from.sid ? ` (id ${from.sid.slice(0, 8)})` : ''}]\n${message}`; c.send(t, t); CG.app.renderSidebar(); } }),
        from ? h('button', { class: 'btn xs', text: 'Mở phiên gửi', onclick: () => CG.app.activate(from) }) : null,
        h('button', { class: 'btn xs', text: 'Bỏ', onclick: () => { card.classList.add('done'); c.xsPending = Math.max(0, (c.xsPending || 1) - 1); CG.app.renderSidebar(); } })));
    c.closeTurn && c.closeTurn();
    c.append(card);
    c.xsPending = (c.xsPending || 0) + 1;
    CG.app.renderSidebar();
    if (c !== S().active) toast(`Phiên “${fromTitle}” vừa nhắn cho phiên “${c.title || 'khác'}”`);
    if (!document.hasFocus()) api.notify('Claude GUI · tin nhắn giữa phiên', `${fromTitle} → ${c.title || 'phiên khác'}`);
    return { ok: true };
  }
  if (api.onXsReq) api.onXsReq(async (id, op, a) => {
    let r = {};
    try {
      if (op === 'list') r = { items: sessionList(a.key).slice(0, Math.max(1, Math.min(50, +a.limit || 20))).map((x) => ({ id: x.id, title: x.title, folder: x.cwd, status: x.status, last_active: new Date(x.mtime).toISOString() })) };
      else if (op === 'resolve') { const x = resolveSession(a.session, a.key); r = x ? { id: x.id, title: x.title } : { error: `Không tìm thấy phiên "${a.session}". Gọi list_sessions để xem danh sách.` }; }
      else if (op === 'send') r = await deliver(a.key, a.id, a.message);
    } catch (e) { r = { error: e.message }; }
    api.xsReply(id, r);
  });
  // @phiên trong ô nhập → kèm các lượt cuối của phiên đó làm ngữ cảnh khi gửi
  const MENTION_RE = /@phiên:([0-9a-f]{8})(?:\(([^)]*)\))?/g;
  async function expandMentions(text) {
    const ids = [...String(text || '').matchAll(MENTION_RE)];
    if (!ids.length) return text;
    let add = '';
    for (const [, short, title] of ids) {
      const x = sessionList().find((s) => s.id.startsWith(short));
      if (!x) continue;
      const tail = await api.sessionTail(x.id, 16).catch(() => '');
      if (tail) add += `\n\n[Ngữ cảnh từ phiên “${title || x.title}” (id ${x.id}) — các lượt gần nhất. Cần thêm thì dùng công cụ read_session / send_to_session của claude-gui]\n${tail.length > 12000 ? '…' + tail.slice(-12000) : tail}`;
    }
    return text + add;
  }
  function mentionItems(q) {
    q = String(q || '').toLowerCase();
    const L = sessionList(S().active && S().active.key);
    return (q ? L.filter((x) => (x.title || '').toLowerCase().includes(q)) : L).slice(0, q ? 6 : 4).map((x) => ({ sess: x }));
  }

  // =====================================================================
  // 10 · PR (GitHub) / MR (GitLab): chip trạng thái + tự sửa CI & góp ý + merge khi sẵn sàng
  // =====================================================================
  const PR = { cache: new Map(), seq: 0 };
  const CI_TXT = { success: ['good', 'CI ✓'], passed: ['good', 'CI ✓'], failed: ['bad', 'CI ✗'], running: ['wait', 'CI …'], pending: ['wait', 'CI …'], created: ['wait', 'CI …'], canceled: ['bad', 'CI huỷ'], manual: ['wait', 'CI chờ tay'] };
  async function refreshPr(force) {
    const chip = $('#pr-chip');
    if (!chip) return;
    const c = S().active;
    const cwd = c && c.cwd;
    if (!cwd || (S().settings || {}).prChip === false || c.nb || c.btw) { chip.classList.add('hidden'); return; }
    const hit = PR.cache.get(cwd);
    if (hit) paintPr(c, hit.info);
    if (!force && hit && Date.now() - hit.t < 120e3) return;
    const seq = ++PR.seq;
    const info = await api.prInfo(cwd).catch(() => ({ kind: 'error' }));
    PR.cache.set(cwd, { t: Date.now(), info });
    if (seq !== PR.seq || S().active !== c) return;
    paintPr(c, info);
    // tự lưu trữ phiên khi PR/MR của nhánh đã merge hoặc đóng (Cài đặt → Git)
    if (info.num && (info.state === 'merged' || info.state === 'closed') && (S().settings || {}).autoArchiveMerged && c.sid && !c.busy) {
      const k = 'cg.prArchived.' + c.sid;
      if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); CG.app.archiveSession(c.sid, true); toast(`MR/PR đã ${info.state === 'merged' ? 'merge' : 'đóng'} — đã lưu trữ phiên này`); }
    }
  }
  function paintPr(c, info) {
    const chip = $('#pr-chip');
    const show = info && (info.num || (info.none && info.branch && !/^(main|master|develop|dev)$/i.test(info.branch)));
    chip.classList.toggle('hidden', !show);
    if (!show) return;
    chip.innerHTML = '';
    const sym = info.kind === 'gitlab' ? '!' : '#';
    if (!info.num) { chip.append(icon('git', 12), h('span', { text: info.kind === 'gitlab' ? 'Tạo MR' : 'Tạo PR' })); chip.title = `Nhánh ${info.branch} chưa có ${info.kind === 'gitlab' ? 'merge request' : 'pull request'}`; }
    else {
      const ci = CI_TXT[info.ci] || null;
      chip.append(icon('git', 12), h('span', { text: `${sym}${info.num}` }));
      if (info.state === 'merged') chip.append(h('span', { class: 'good', text: '· đã merge' }));
      else if (info.state === 'closed') chip.append(h('span', { class: 'bad', text: '· đã đóng' }));
      else {
        if (ci) chip.append(h('span', { class: ci[0], text: '· ' + ci[1] }));
        if (info.reviews) chip.append(h('span', { class: 'wait', text: `· ${info.reviews} góp ý` }));
        if (info.autoMerge) chip.append(h('span', { class: 'good', text: '· tự merge' }));
      }
      chip.title = `${info.title}\n${info.branch} → ${info.target || ''}`;
    }
    chip.onclick = () => prMenu(c, info);
  }
  function prMenu(c, info) {
    const name = info.kind === 'gitlab' ? 'merge request' : 'pull request';
    const items = [];
    if (!info.num) {
      items.push({ header: `Nhánh ${info.branch} chưa có ${name}` }, { label: `Tạo ${name}…`, icon: 'plus', onClick: async () => {
        const t = await CG.promptDialog(`Tiêu đề ${name}`, c.title || info.branch, info.branch);
        if (!t) return;
        const r = await api.prCreate(c.cwd, t);
        if (r && r.ok) { toast(`Đã tạo ${name}`); refreshPr(true); } else toast('Không tạo được: ' + ((r && r.error) || 'lỗi'), true);
      } });
    } else {
      items.push({ header: `${info.kind === 'gitlab' ? '!' : '#'}${info.num} · ${info.title}`.slice(0, 80) },
        { label: 'Tự sửa CI & góp ý review', desc: 'Gom log CI lỗi + góp ý chưa giải quyết, giao Claude sửa rồi push', icon: 'tool', disabled: info.state !== 'opened', onClick: async () => {
          toast('Đang lấy log CI và góp ý…');
          const r = await api.prFix(c.cwd);
          if (!r || r.error) return toast((r && r.error) || 'Không lấy được thông tin', true);
          c.send(r.prompt, `Tự sửa CI & góp ý review của ${name} ${info.kind === 'gitlab' ? '!' : '#'}${info.num}`);
        } },
        { label: info.autoMerge ? 'Đã bật merge khi sẵn sàng' : 'Merge khi sẵn sàng', desc: info.kind === 'gitlab' ? 'Tự merge khi pipeline xanh' : 'Bật auto-merge (squash) khi CI xanh và được duyệt', icon: 'check', disabled: info.autoMerge || info.state !== 'opened', onClick: async () => {
          const r = await api.prMerge(c.cwd);
          if (r && r.ok) { toast('Đã bật merge khi sẵn sàng'); refreshPr(true); } else toast('Không bật được: ' + ((r && r.error) || 'lỗi'), true);
        } },
        { label: info.kind === 'gitlab' ? 'Mở trên GitLab' : 'Mở trên GitHub', icon: 'external', onClick: () => api.openExternal(info.url) });
    }
    items.push('-', { label: 'Làm mới', icon: 'refresh', onClick: () => refreshPr(true) });
    CG.menu($('#pr-chip'), items);
  }
  setInterval(() => { if (document.hasFocus()) refreshPr(); }, 150e3);

  // =====================================================================
  // 8 · Bố cục: kéo đầu khung (Xem trước, Sổ tài liệu, khung phải) sang trái / phải vùng chat
  // =====================================================================
  const PANES = {
    viewer: { pane: '#viewer', head: '.vw-tabs', name: 'Khung xem trước' },
    nb: { pane: '#nb-col', head: '#nb-head', name: 'Sổ tài liệu' },
    split: { pane: '#split-col', head: '.split-head', name: 'Khung phải (chia đôi)' },
  };
  const sides = () => ((S().settings || {}).paneSide || {});
  CG.paneSign = (k) => (sides()[k] === 'left' ? -1 : 1);
  function applySides() {
    const ws = document.querySelector('.workspace');
    if (!ws) return;
    for (const k of Object.keys(PANES)) ws.classList.toggle('pl-' + k, sides()[k] === 'left');
  }
  function setSide(k, side) {
    const v = { ...sides(), [k]: side };
    S().settings.paneSide = v;
    if (CG.saveSettings) CG.saveSettings({ paneSide: v });
    applySides();
    toast(`${PANES[k].name}: đặt bên ${side === 'left' ? 'trái' : 'phải'} vùng chat`);
  }
  function bindPane(k) {
    const P = PANES[k], head = $(P.head);
    if (!head || head._pd) return;
    head._pd = true;
    head.classList.add('pane-drag-handle');
    head.title = (head.title ? head.title + '\n' : '') + 'Kéo đầu khung sang trái / phải vùng chat để đổi chỗ · chuột phải để chọn';
    head.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.vw-tab, input, textarea')) return;
      e.preventDefault();
      CG.menu({ x: e.clientX, y: e.clientY, getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) }, [
        { header: P.name },
        { label: 'Đặt bên trái vùng chat', icon: 'chevronLeft', checked: sides()[k] === 'left', onClick: () => setSide(k, 'left') },
        { label: 'Đặt bên phải vùng chat', icon: 'chevronRight', checked: sides()[k] !== 'left', onClick: () => setSide(k, 'right') },
      ], { checks: true });
    });
    head.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('button, input, textarea, select, a, .vw-tab')) return;
      const x0 = e.clientX, y0 = e.clientY;
      let zones = null, hit = null;
      const chat = $('#chat-col').getBoundingClientRect();
      const move = (ev) => {
        if (!zones) {
          if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 8) return;
          document.body.classList.add('resizing-h');
          const mk = (side, left) => { const z = h('div', { class: 'pane-drop' }); Object.assign(z.style, { left: left + 'px', top: chat.top + 'px', width: chat.width * 0.32 + 'px', height: chat.height + 'px' }); z.dataset.side = side; document.body.append(z); return z; };
          zones = [mk('left', chat.left), mk('right', chat.right - chat.width * 0.32)];
        }
        hit = zones.find((z) => { const r = z.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; }) || null;
        for (const z of zones) z.style.opacity = z === hit ? '1' : '.45';
      };
      const up = () => {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
        document.body.classList.remove('resizing-h');
        if (zones) { zones.forEach((z) => z.remove()); if (hit && hit.dataset.side !== (sides()[k] === 'left' ? 'left' : 'right')) setSide(k, hit.dataset.side); }
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
    });
  }
  (async () => {
    while (!S().settings) await new Promise((r) => setTimeout(r, 100));
    applySides();
    for (const k of Object.keys(PANES)) bindPane(k);
    setTimeout(() => { for (const k of Object.keys(PANES)) bindPane(k); }, 3000); // đầu Sổ tài liệu dựng muộn
  })();

  CG.parity = { refreshPr, paintBar, reviewCard, sendComments: sendAll, comments: (c) => listOf(c), mentionItems, expandMentions, sessionList };
})();
