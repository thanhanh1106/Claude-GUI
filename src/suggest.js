'use strict';
// Claude gợi ý việc ngoài phạm vi (công cụ suggest_task của MCP nội bộ claude-gui, giống "Start a task that Claude suggests"
// của bản desktop): thẻ trong chat với lý do + bằng chứng → Mở phiên mới (phiên con, có thể trên nhánh git riêng) /
// Làm ở đây / Lưu vào Lịch & hàng đợi để sửa sau. Trạng thái từng việc lưu ở localStorage (cg.suggest), quan hệ cha–con ở cg.spawned.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, icon, toast } = CG;
  const S = () => CG.S;
  const A = () => CG.app;
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
  const ST = load('cg.suggest');
  const KIDS = load('cg.spawned');
  const saveST = () => { try { localStorage.setItem('cg.suggest', JSON.stringify(ST)); } catch {} };
  const saveK = () => { try { localStorage.setItem('cg.spawned', JSON.stringify(KIDS)); } catch {} };
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const keyOf = (c, t) => (c.sid || c.key) + '|' + norm(t.title);
  const SEV = { high: ['hi', 'Nghiêm trọng'], medium: ['md', 'Trung bình'], low: ['lo', 'Nhỏ'] };
  const WHEN = [['now', 'Khi tôi bấm "Chạy ngay" trong lịch'], ['after', 'Sau khi phiên này xong việc'], ['reset5', 'Khi giới hạn 5 giờ hồi'], ['at', 'Vào lúc… (chọn giờ)']];
  const policy = () => S().settings.branchPolicy !== false;
  const cards = new Set(); // { el, paint } đang hiện
  const convOf = (sid) => A().convs().find((x) => x.sid === sid);
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
  const cleanBranch = (b, t) => (/^[\w.\/-]+$/.test(String(b || '')) ? b : 'fix/' + slug(t.title));

  // ---------- bằng chứng: đoạn code đúng dòng, bấm tên tệp để mở ----------
  function evidence(c, ev) {
    return (Array.isArray(ev) ? ev : []).slice(0, 4).map((e) => {
      const start = Math.max(1, +e.start_line || 1);
      const lines = String(e.code || '').replace(/\s+$/, '').split('\n').slice(0, 12);
      const hl = +e.highlight_line || 0;
      const f = h('div', { class: 'sg-ev-f', text: `${e.file}${hl || start ? ':' + (hl || start) : ''}`, title: 'Mở trong khung xem' });
      f.onclick = () => CG.viewer && CG.viewer.openPath(c.cwd, `${e.file}:${hl || start}`);
      return h('div', { class: 'sg-ev' }, f, h('pre', {}, lines.map((l, i) => h('span', { class: start + i === hl ? 'hl' : '' }, h('i', { text: String(start + i) }), l))));
    });
  }

  // ---------- thẻ ----------
  function card(c, inp) {
    const tasks = (inp && Array.isArray(inp.tasks) ? inp.tasks : []).filter((t) => t && t.title);
    const el = h('div', { class: 'sg-card' });
    if (!tasks.length) return el;
    const items = tasks.map((t) => ({ t, key: keyOf(c, t), branch: cleanBranch(t.branch, t) }));
    if (!c._sg) c._sg = [];
    const xb = h('button', { class: 'icon-btn sm sg-x', title: 'Bỏ gợi ý', html: CG.svg('x', 14) });
    const head = h('div', { class: 'sg-head' }, icon('sparkles', 13), h('span', { text: tasks.length > 1 ? `Claude gợi ý ${tasks.length} việc ngoài phạm vi` : 'Claude gợi ý một việc ngoài phạm vi' }), xb);
    el.append(head);
    const foot = tasks.length > 1 ? h('div', { class: 'sg-foot' },
      h('button', { class: 'btn sm sg-q', onclick: () => saveAll() }, icon('clock', 13), 'Lưu tất cả vào hàng đợi'),
      h('button', { class: 'btn sm primary', onclick: () => startAll() }, `Mở tất cả (${tasks.length} phiên song song)`)) : null;
    for (const it of items) {
      it.el = h('div', { class: 'sg-item' + (tasks.length === 1 ? ' exp' : '') });
      el.append(it.el);
      c._sg.push(it);
      build(c, it);
    }
    if (foot) el.append(foot);
    const open = () => items.filter((it) => !ST[it.key]);
    xb.onclick = () => { for (const it of open()) ST[it.key] = { st: 'dismissed', t: Date.now() }; saveST(); paintAll(); };
    async function startAll() { for (const it of open()) await start(c, it, defaults(c, it)); }
    function saveAll() { const n = open().length; for (const it of open()) queue(c, it, { when: 'now', branch: it.branch, base: '', finish: 'commit', model: '', mode: 'acceptEdits' }, true); if (n) toast(`Đã lưu ${n} việc vào Lịch & hàng đợi${policy() ? ', mỗi việc một nhánh riêng' : ''}.`); }
    function paintAll() {
      for (const it of items) paint(c, it);
      const left = open().length;
      if (foot) foot.classList.toggle('hidden', left < 2);
      xb.classList.toggle('hidden', !left);
      if (rec.strip) rec.strip.classList.toggle('done', !left);
      if (rec.keep) badge(c);
    }
    const rec = { el, paint: paintAll, items, c };
    el._sgRec = rec;
    cards.add(rec);
    el._sgPaint = paintAll;
    paintAll();
    return el;
  }
  const defaults = (c, it) => ({ useBranch: policy() && !!c.git, branch: it.branch, base: '', model: '', mode: '', report: false });

  function build(c, it) {
    const t = it.t, [sc, sl] = SEV[t.severity] || SEV.medium;
    const row = h('div', { class: 'sg-sum' }, icon('chevronRight', 13, 'sg-chev'),
      h('div', { class: 'sg-sum-t' }, h('div', { class: 'sg-title' }, h('span', { class: 'rv-sev ' + sc, text: sl }), h('span', { text: t.title })), h('div', { class: 'sg-sub', text: t.summary || '' })),
      t.category ? h('span', { class: 'sg-cat', text: t.category }) : null);
    row.onclick = () => { if (!ST[it.key]) it.el.classList.toggle('exp'); };
    const prompt = h('div', { class: 'sg-prompt', text: t.prompt || '' });
    const more = h('button', { class: 'linkish sg-more', text: 'Xem prompt sẽ gửi cho phiên mới ▾' });
    more.onclick = () => { it.el.classList.toggle('pr'); more.textContent = it.el.classList.contains('pr') ? 'Thu gọn prompt ▴' : 'Xem prompt sẽ gửi cho phiên mới ▾'; };
    const dl = h('dl', { class: 'sg-why' },
      h('dt', { text: 'Vì sao là vấn đề' }), h('dd', {}, CG.mdEl ? CG.mdEl(t.why || '') : t.why),
      h('dt', { text: 'Bằng chứng' }), h('dd', {}, evidence(c, t.evidence)),
      h('dt', { text: 'Ảnh hưởng' }), h('dd', {}, CG.mdEl ? CG.mdEl(t.impact || '') : t.impact),
      h('dt', { text: 'Vì sao không sửa ở đây' }), h('dd', {}, CG.mdEl ? CG.mdEl(t.why_not_here || '') : t.why_not_here),
      h('dt', { text: 'Hướng sửa' }), h('dd', {}, CG.mdEl ? CG.mdEl(t.fix || '') : t.fix));
    const panels = h('div');
    // cảnh báo nổi thành bong bóng phía trên nút (không chiếm chỗ trong hàng → không đẩy nút chạy khỏi con trỏ)
    const warn = policy() && c.git ? h('span', { class: 'sg-bub', text: `⚠ Làm ở đây sẽ sửa thẳng trên nhánh đang làm${c.git.branch ? ' (' + c.git.branch + ')' : ''}, trái quy trình nhóm.` }) : null;
    const bHere = h('span', { class: 'sg-here' }, h('button', { class: 'btn sm', text: 'Làm ở đây', onclick: () => doHere(c, it) }), warn);
    const btns = h('div', { class: 'sg-btns' },
      h('button', { class: 'btn sm', text: 'Tuỳ chọn', onclick: () => panel(c, it, panels, 'opt') }),
      bHere,
      h('button', { class: 'btn sm sg-q', onclick: () => panel(c, it, panels, 'q') }, icon('clock', 13), 'Lưu vào hàng đợi'),
      h('button', { class: 'btn sm primary', text: 'Mở phiên mới', onclick: (e) => { e.currentTarget.disabled = true; start(c, it, it.opt ? it.opt() : defaults(c, it)).then((ok) => { if (!ok) e.target.disabled = false; }); } }));
    it.body = h('div', { class: 'sg-body' }, h('div', {}, h('div', { class: 'sg-in' }, dl, more, prompt, panels, btns)));
    it.state = h('div', { class: 'sg-state hidden' });
    it.el.append(row, it.body, it.state);
  }

  // Tuỳ chọn (trước khi mở phiên mới) / Lưu vào hàng đợi
  async function panel(c, it, box, kind) {
    const was = box.dataset.k;
    box.innerHTML = ''; box.dataset.k = '';
    it.opt = null;
    if (was === kind) return;
    box.dataset.k = kind;
    const sel = (opts, v) => { const s = h('select', {}, opts.map(([a, b]) => h('option', { value: a, text: b }))); s.value = v; return s; };
    const models = [['', 'Theo phiên này'], ...A().models().filter((m) => m.value !== 'default').map((m) => [m.value, m.displayName || m.value])];
    const modes = [['', 'Theo phiên này'], ...CG.MODES.filter((m) => m.v !== 'bypassPermissions' || S().settings.allowBypass).map((m) => [m.v, m.label])];
    const repo = !!c.git;
    const bn = h('input', { type: 'text', class: 'mono', value: it.branch, spellcheck: false });
    const base = h('select', {}, h('option', { value: '', text: 'nhánh mặc định' }));
    if (repo) api.gitBases(c.cwd).then((r) => { if (!r || !r.ok) return; base.innerHTML = ''; for (const b of r.branches) base.append(h('option', { value: b, text: b + (b === r.def ? ' (mặc định)' : b === r.current ? ' (đang làm)' : '') })); base.value = r.def; }).catch(() => {});
    const g = h('div', { class: 'sg-panel' });
    if (kind === 'opt') {
      const m = sel(models, ''), md = sel(modes, '');
      const useB = h('input', { type: 'checkbox', checked: repo && policy(), disabled: !repo });
      const rep = h('input', { type: 'checkbox' });
      g.append(h('h4', { text: 'Tuỳ chọn khi mở phiên mới' }),
        h('label', { text: 'Model' }), m, h('label', { text: 'Quyền' }), md,
        h('label', { text: 'Nhánh git' }), h('div', { class: 'sg-r' }, useB, h('span', { text: 'nhánh riêng' }), bn, h('span', { text: 'từ' }), base),
        h('span', { class: 'sg-hint', text: repo ? 'Chạy trong worktree riêng (.claude/worktrees/…) nên không đụng tới tệp của phiên đang làm.' : 'Thư mục này không phải repo git — phiên mới chạy ngay trong thư mục.' }),
        h('label', { text: 'Báo kết quả về' }), h('div', { class: 'sg-r' }, rep, h('span', { text: 'hiện tóm tắt trong phiên này khi phiên con xong' })));
      it.opt = () => ({ useBranch: useB.checked, branch: bn.value.trim(), base: base.value, model: m.value, mode: md.value, report: rep.checked });
    } else {
      const w = sel(WHEN, 'now'), fin = h('input', { type: 'checkbox' }), m = sel([['', 'Theo phiên này'], ...models.slice(1)], 'sonnet'), md = sel(modes.slice(1), 'acceptEdits');
      const save = h('button', { class: 'btn sm primary', text: 'Lưu vào hàng đợi', onclick: () => queue(c, it, { when: w.value, branch: repo ? bn.value.trim() : '', base: base.value, finish: fin.checked ? 'mr' : 'commit', model: m.value, mode: md.value }) });
      g.append(h('h4', {}, icon('clock', 13), ' Lưu vào Lịch & hàng đợi để sửa sau'),
        h('label', { text: 'Khi nào chạy' }), w,
        h('label', { text: 'Nhánh git' }), repo ? h('div', { class: 'sg-r' }, bn, h('span', { text: 'tạo từ' }), base) : h('span', { class: 'muted', text: 'không phải repo git' }),
        repo ? h('span', { class: 'sg-hint', text: 'Lúc chạy: tạo worktree riêng trên nhánh này, Claude chỉ sửa và commit ở đó.' }) : null,
        h('label', { text: 'Xong thì' }), h('div', { class: 'sg-r' }, h('span', { text: '✓ commit' }), repo ? fin : null, repo ? h('span', { text: 'push & tạo Merge Request / PR' }) : null),
        h('label', { text: 'Model / quyền' }), h('div', { class: 'sg-r' }, m, md),
        h('div', { class: 'sg-acts' }, h('button', { class: 'btn sm', text: 'Huỷ', onclick: () => panel(c, it, box, kind) }), save));
    }
    box.append(g);
  }

  // ---------- hành động ----------
  const headerFor = (c, t) => `[Việc tách ra từ phiên "${(c.title || 'phiên').slice(0, 80)}" — phiên này không thấy cuộc trò chuyện đó, chỉ có mô tả dưới đây]\n\n`;
  const branchNote = (b, finish) => b ? `\n\n---\nBạn đang ở một git worktree riêng trên nhánh \`${b}\`. Chỉ sửa trong nhánh này. Xong việc thì chạy kiểm tra, rồi commit lên nhánh \`${b}\` với message rõ ràng${finish === 'mr' ? `, sau đó \`git push -u origin ${b}\` (GUI sẽ tự tạo Merge Request / PR)` : ' (không push)'}.` : '';

  async function start(c, it, o) {
    const t = it.t;
    let cwd = c.cwd, branch = '';
    if (o.useBranch && c.git) {
      if (!/^[\w.\/-]+$/.test(o.branch || '')) { toast('Tên nhánh không hợp lệ.', true); return false; }
      toast(`Đang tạo nhánh ${o.branch}…`);
      const w = await api.gitWorktree({ cwd: c.cwd, branch: o.branch, base: o.base }).catch((e) => ({ ok: false, error: e.message }));
      if (!w || !w.ok) { toast('Không tạo được nhánh riêng: ' + ((w && w.error) || ''), true); return false; }
      cwd = w.path; branch = o.branch;
    }
    const kid = await A().createConv({ cwd, model: o.model || (c.model !== 'default' ? c.model : ''), mode: o.mode || c.mode, effort: c.effort, title: t.title });
    KIDS[kid.sid] = { parent: c.sid, title: t.title, branch, report: !!o.report, t: Date.now(), key: it.key };
    ST[it.key] = { st: 'started', child: kid.sid, branch, t: Date.now() };
    saveK(); saveST(); paintKey(it.key);
    kid.send(headerFor(c, t) + t.prompt + branchNote(branch), `🛠 ${t.title}${branch ? ` · nhánh ${branch}` : ''}`).catch(() => {});
    A().renderSidebar();
    toast(`Đã mở phiên con${branch ? ' trên nhánh ' + branch : ''} — phiên này vẫn làm tiếp.`);
    return true;
  }
  function doHere(c, it) {
    const t = it.t;
    const text = `Làm luôn việc bạn vừa gợi ý trong phiên này: **${t.title}**\n\n${t.prompt}`;
    ST[it.key] = { st: 'here', t: Date.now() }; saveST(); paintKey(it.key);
    if (c.busy && CG.sched && CG.sched.queueAfter) CG.sched.queueAfter(c, text, [], { display: 'Làm ở đây: ' + t.title });
    else c.send(text, 'Làm ở đây: ' + t.title).catch(() => {});
  }
  function queue(c, it, o, quiet) {
    if (!CG.sched || !CG.sched.addSuggest) return toast('Lịch & hàng đợi chưa sẵn sàng.', true);
    const t = it.t;
    if (o.branch && !/^[\w.\/-]+$/.test(o.branch)) return toast('Tên nhánh không hợp lệ.', true);
    const branch = c.git ? o.branch : '';
    const p = CG.sched.addSuggest({ title: t.title, prompt: headerFor(c, t) + t.prompt + branchNote(branch, o.finish), cwd: c.cwd, branch, base: o.base, finish: branch ? o.finish : '', model: o.model, mode: o.mode, when: o.when, fromSid: c.sid, fromTitle: c.title || '' });
    ST[it.key] = { st: 'queued', plan: p.id, branch, when: o.when, t: Date.now() }; saveST(); paintKey(it.key);
    if (!quiet) toast(`Đã lưu vào Lịch & hàng đợi${branch ? ' — sẽ chạy trên nhánh ' + branch : ''}.`);
  }

  // ---------- trạng thái từng việc ----------
  // thẻ nằm trong tab "Gợi ý" (keep) có thể tạm rời DOM khi tab bị dỡ → vẫn giữ để vẽ lại trạng thái
  const alive = (r) => r.el.isConnected || (r.keep && (r.c._sgList || []).some((e) => e.rec === r));
  function paintKey(key) { for (const r of cards) if (alive(r)) r.paint(); else cards.delete(r); }
  function paint(c, it) {
    const s = ST[it.key];
    it.el.classList.toggle('done', !!s);
    it.body.classList.toggle('hidden', !!s);
    it.state.classList.toggle('hidden', !s);
    if (!s) return;
    it.el.classList.remove('exp');
    it.el.classList.toggle('gone', s.st === 'withdrawn' || s.st === 'dismissed');
    const st = it.state; st.innerHTML = '';
    const link = (text, fn) => h('a', { class: 'sg-link', text, onclick: fn });
    if (s.st === 'started') {
      const kid = convOf(s.child), rec = KIDS[s.child] || {};
      const run = kid && kid.working;
      const done = !run && (rec.end || (kid && kid.lastEnd));
      st.append(h('span', { class: 'st ' + (run ? 'run' : '') }, run ? null : done ? icon('check', 12) : null),
        h('span', { class: 'sg-st-t' }, run ? 'Đang chạy trong phiên mới' : done ? (rec.ok === false ? 'Phiên con dừng / lỗi' : 'Phiên con đã xong') : 'Đã mở phiên mới', s.branch ? h('code', { text: s.branch }) : null),
        link('Mở phiên ›', () => openKid(s.child)));
      if (done && rec.summary && rec.report) st.append(h('div', { class: 'sg-st-sum', text: rec.summary }));
    } else if (s.st === 'here') st.append(h('span', { text: '↳ Đã chuyển thành tin nhắn trong phiên này' }));
    else if (s.st === 'queued') {
      const p = CG.sched && CG.sched.plans.find((x) => x.id === s.plan);
      const ran = p && p.run && p.run.sids && p.run.sids[0];
      st.append(icon('clock', 13), h('span', { class: 'sg-st-t' }, p ? (p.run.state === 'done' ? 'Đã chạy xong từ hàng đợi' : p.run.state === 'running' ? 'Đang chạy từ hàng đợi' : 'Đã lưu vào Lịch & hàng đợi') : 'Đã lưu vào hàng đợi (kế hoạch đã bị xoá)', s.branch ? h('code', { text: s.branch }) : null),
        ran ? link('Mở phiên ›', () => openKid(ran)) : p ? link('Mở lịch ›', () => CG.sched.open(p.id)) : null);
    } else if (s.st === 'withdrawn') st.append(h('span', { text: '⊘ Claude đã rút lại gợi ý này' + (s.reason ? ': ' + s.reason : '') }));
    else st.append(h('span', { class: 'muted', text: 'Đã bỏ gợi ý này' }));
  }
  async function openKid(sid) {
    const c = convOf(sid);
    if (c) return A().activate(c);
    const it = (S().all || []).find((x) => x.id === sid);
    if (it) return A().openSession(it);
    toast('Chưa tìm thấy phiên này (có thể chưa ghi gì).', true);
  }
  // phiên con đang chạy → cập nhật chấm trạng thái trên thẻ
  setInterval(() => { for (const r of cards) { if (!alive(r)) { cards.delete(r); continue; } if (r.el.querySelector('.sg-state:not(.hidden)')) r.paint(); } }, 1500);

  // ---------- trong chat: dải một dòng · thẻ đầy đủ nằm ở tab "Gợi ý" của khung xem bên phải ----------
  const inlineMode = () => S().settings.sgInline === true;
  const openCount = (c) => (c._sgList || []).reduce((n, e) => n + e.rec.items.filter((it) => !ST[it.key]).length, 0);
  function badge(c) { if (CG.viewer && CG.viewer.panel) CG.viewer.panel({ key: c.key, id: 'sg', badge: openCount(c) || '', create: false }); }
  function tool(c, inp, live) {
    const el = card(c, inp);
    const rec = el._sgRec;
    if (inlineMode() || !rec || !CG.viewer || !CG.viewer.panel) return el;
    const L = c._sgList || (c._sgList = []);
    const k = rec.items.map((it) => it.key).join('\n');
    const ent = { k, el, rec };
    const old = L.findIndex((x) => x.k === k); // vẽ lại lịch sử → thay thẻ cũ, không nhân đôi
    if (old >= 0) L[old] = ent; else if (c.renderingOlder) L.unshift(ent); else L.push(ent);
    rec.keep = true;
    const t0 = rec.items[0].t, [sc, sl] = SEV[t0.severity] || SEV.medium, n = rec.items.length;
    const strip = h('div', { class: 'sg-strip', title: 'Xem chi tiết ở tab "Gợi ý" bên phải' }, icon('sparkles', 14, 'sg-strip-ic'), h('span', { class: 'rv-sev ' + sc, text: sl }),
      h('span', { class: 'sg-strip-t' }, h('b', { text: t0.title }), n > 1 ? h('span', { class: 'muted', text: ` · và ${n - 1} việc khác` }) : t0.summary ? h('span', { class: 'muted', text: ' — ' + t0.summary }) : null),
      h('span', { class: 'sg-strip-go', text: 'Xem ở khung bên ›' }));
    strip.onclick = () => show(c, ent);
    rec.strip = strip;
    rec.paint();
    if (live) show(c, ent, true); else badge(c);
    return strip;
  }
  function renderPanel(c, body) {
    body.innerHTML = '';
    const L = (c._sgList || []).slice().reverse(); // mới nhất trên cùng
    const f = c._sgFilter || 'open';
    const all = L.flatMap((e) => e.rec.items), nOpen = all.filter((it) => !ST[it.key]).length;
    const chip = (v, label) => h('span', { class: 'sg-chip' + (f === v ? ' on' : ''), text: label, onclick: () => { c._sgFilter = v; renderPanel(c, body); } });
    const bar = h('div', { class: 'sg-pbar' }, chip('open', `Chưa xử lý (${nOpen})`), chip('done', `Đã xử lý (${all.length - nOpen})`), chip('all', `Tất cả (${all.length})`));
    const list = h('div', { class: 'sg-plist' });
    let shown = 0;
    for (const e of L) {
      let vis = 0;
      for (const it of e.rec.items) { const ok = f === 'all' || (f === 'open' ? !ST[it.key] : !!ST[it.key]); it.el.classList.toggle('hidden', !ok); vis += ok ? 1 : 0; }
      e.el.classList.toggle('hidden', !vis);
      shown += vis;
      list.append(e.el);
    }
    const empty = !shown ? h('div', { class: 'sg-pempty', text: f === 'open' ? (all.length ? 'Đã xử lý hết các gợi ý của phiên này.' : 'Phiên này chưa có gợi ý nào.') : 'Không có gợi ý nào ở mục này.' }) : null;
    body.append(h('div', { class: 'sg-pane' }, bar, list, empty));
  }
  function show(c, ent, auto) {
    const s = S();
    if (!auto && c !== s.active && A().activate) A().activate(c); // bấm dải ở khung chia đôi → đưa phiên ra khung chính
    // Claude vừa gợi ý: chỉ tự bật tab khi khung xem không bận việc khác (đang xem tệp / web thì chỉ cập nhật số trên tab)
    const V = CG.viewer.state;
    const busyView = auto && c === s.active && V.open && V.cur && V.cur.kind !== 'panel';
    CG.viewer.panel({ key: c.key, id: 'sg', label: 'Gợi ý', icon: 'sparkles', badge: openCount(c) || '', render: (b) => renderPanel(c, b), show: !busyView, rerender: true });
    if (!ent || auto) return;
    for (const x of ent.rec.items) x.el.classList.remove('hidden');
    ent.el.classList.remove('hidden');
    const it = ent.rec.items.find((x) => !ST[x.key]);
    if (it) it.el.classList.add('exp');
    requestAnimationFrame(() => { ent.el.scrollIntoView({ block: 'start', behavior: 'smooth' }); ent.el.classList.remove('sg-flash'); void ent.el.offsetWidth; ent.el.classList.add('sg-flash'); });
  }

  // Claude rút lại gợi ý (công cụ withdraw_task)
  function withdraw(c, inp) {
    const n = norm(inp && inp.title);
    if (!n) return;
    for (const it of c._sg || []) {
      const tn = norm(it.t.title);
      if ((tn === n || tn.includes(n) || n.includes(tn)) && !ST[it.key]) { ST[it.key] = { st: 'withdrawn', reason: String((inp && inp.reason) || '').slice(0, 200), t: Date.now() }; saveST(); }
    }
    paintKey();
  }

  // phiên con xong lượt → nhớ tóm tắt, báo về phiên cha nếu được yêu cầu
  function onTurnEnd(conv, m, failed) {
    const rec = KIDS[conv.sid];
    if (!rec) return;
    rec.end = Date.now(); rec.ok = !failed;
    rec.summary = String((m && typeof m.result === 'string' && m.result) || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    saveK(); paintKey();
    if (!rec.report || rec.reported) return;
    rec.reported = true; saveK();
    const par = convOf(rec.parent);
    if (par) {
      const a = h('a', { class: 'sg-link', text: 'Mở phiên ›', onclick: () => openKid(conv.sid) });
      par.append(h('div', { class: 'sg-report' + (failed ? ' err' : '') }, h('b', { text: failed ? '✕ Phiên con dừng / lỗi: ' : '✓ Phiên con xong: ' }), h('span', { text: rec.title + (rec.branch ? ` (nhánh ${rec.branch})` : '') + (rec.summary ? ' — ' + rec.summary : '') }), ' ', a));
    }
  }

  // ---------- thanh bên: phiên con nằm dưới phiên cha ----------
  function kidsOf(pid) {
    const out = [];
    for (const [sid, r] of Object.entries(KIDS)) {
      if (r.parent !== pid) continue;
      const c = convOf(sid), d = (S().all || []).find((x) => x.id === sid);
      if (!c && !d) continue; // chưa ghi gì / đã xoá
      out.push({ id: sid, title: (c && c.title) || (d && d.title) || r.title, cwd: (d && d.cwd) || (c && c.cwd), mtime: Math.max((d && d.mtime) || 0, (c && c.lastActive) || 0, r.t || 0), spawned: true, branch: r.branch, running: !!(c && c.working), fresh: Date.now() - (r.t || 0) < 15 * 60e3, parentId: pid });
    }
    return out;
  }
  const parentOf = (sid) => (KIDS[sid] ? KIDS[sid].parent : null);
  // phiên chạy từ hàng đợi (việc gợi ý đã lưu) cũng nằm dưới phiên đã gợi ý
  function linkChild(sid, parent, title, branch) { if (!sid || !parent || KIDS[sid]) return; KIDS[sid] = { parent, title, branch: branch || '', t: Date.now() }; saveK(); }

  CG.suggest = { card, tool, withdraw, onTurnEnd, kidsOf, parentOf, linkChild };
})();
