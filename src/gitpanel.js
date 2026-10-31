'use strict';
// Bảng "Thay đổi" theo repo: Claude sửa tệp thuộc repo nào thì repo đó tự thành một tab (kèm repo của thư mục phiên).
// Trong tab: nhánh, ↑↓, pull/push, stage thủ công (cả từng đoạn), commit tay, ✨ gợi ý nội dung, giao Claude commit theo luật
// (phiên nền chọn model/effort hoặc phiên hiện tại, ghi chú cho agent), và cây git.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, svg, icon, basename, toast, confirmDialog, promptDialog } = CG;
  const S = () => CG.S;
  const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const join = (top, rel) => top.replace(/[\\/]+$/, '') + '\\' + String(rel).replace(/\//g, '\\');
  const R = new Map(); // gốc repo → trạng thái hiển thị

  // =====================================================================
  // Dò repo theo tệp Claude sửa
  // =====================================================================
  const pend = new Map(); // conv → { files:Set, quiet, t }
  function track(conv, file, quiet) {
    if (!file) return;
    let p = pend.get(conv);
    if (!p) { p = { files: new Set(), quiet: true }; pend.set(conv, p); }
    p.files.add(file); if (!quiet) p.quiet = false;
    clearTimeout(p.t); p.t = setTimeout(() => flush(conv), quiet ? 600 : 250);
  }
  async function flush(conv) {
    const p = pend.get(conv); if (!p) return; pend.delete(conv);
    const map = await api.gitRepoOf([...p.files]).catch(() => ({}));
    conv.repos = conv.repos || new Map();
    let added = false;
    for (const top of Object.values(map)) {
      if (!top) continue;
      if (!conv.repos.has(norm(top))) { conv.repos.set(norm(top), { top, name: basename(top), fresh: !p.quiet ? Date.now() : 0 }); added = true; }
      const st = R.get(norm(top)); if (st && st.status) refresh(st);
    }
    if (added && !p.quiet && conv === S().active && CG.app) CG.app.refreshDetails();
  }
  // các tab repo của phiên: repo của thư mục phiên + repo có tệp Claude sửa
  function tabsFor(c) {
    const out = new Map();
    if (c.git && c.git.repo && c.git.top) out.set(norm(c.git.top), { top: c.git.top, name: basename(c.git.top), fresh: 0 });
    for (const [k, v] of c.repos || []) out.set(k, v);
    return [...out.values()].map((r) => { const st = state(r.top); return { ...r, key: norm(r.top), branch: st.status && st.status.branch, count: st.status ? countFiles(st.status) : null }; });
  }
  const countFiles = (s) => new Set(s.files.map((f) => f.path)).size;

  // =====================================================================
  // Trạng thái repo
  // =====================================================================
  function state(top) {
    const k = norm(top);
    let st = R.get(k);
    if (!st) { st = { top, key: k, status: null, log: [], loading: false, view: null, sel: null, msg: '', el: h('div', { class: 'gp' }), t: 0 }; R.set(k, st); }
    return st;
  }
  async function refresh(st, quiet) {
    if (st.loading) { st.again = true; return; }
    st.loading = true; if (!quiet) draw(st);
    const [status, log] = await Promise.all([api.gitStatus(st.top).catch((e) => ({ ok: false, error: e.message })), api.gitLog(st.top, 80).catch(() => [])]);
    st.status = status.ok ? status : null; st.err = status.ok ? '' : status.error || 'Không đọc được trạng thái git';
    st.log = log; st.loading = false; st.t = Date.now();
    if (st.view) await loadDiff(st);
    draw(st);
    // số tệp trên tab
    if (CG.app && S().active) { const tb = document.querySelector(`.d-card .seg button[data-repo="${CSS.escape(st.key)}"] .gp-n`); if (tb) tb.textContent = status.ok ? countFiles(status) || '' : ''; }
    if (st.again) { st.again = false; refresh(st, true); }
  }
  async function act(st, a, args, okMsg) {
    const r = await api.gitAct(st.top, a, args || {}).catch((e) => ({ ok: false, out: e.message }));
    if (!r.ok) toast((r.out || 'Lỗi git').split('\n').slice(-3).join('\n'), true);
    else if (okMsg) toast(okMsg);
    // robot: commit → pháo hoa, push → tên lửa (cả khi commit/push từ khung Thay đổi)
    if (r.ok && (a === 'commit' || a === 'push') && CG.mascot && CG.mascot.gitEvent) CG.mascot.gitEvent(st.conv, a, st.top);
    await refresh(st, true);
    return r;
  }
  // repo đang mở trong bảng chi tiết (của phiên đang xem)
  function view(c, top) {
    const st = state(top);
    st.conv = c;
    if (!st.status && !st.loading && !st.err) refresh(st);
    else if (Date.now() - st.t > 8000 && !st.loading) refresh(st, true);
    if (!st.el.childNodes.length) draw(st);
    return st.el;
  }
  // phiên vừa xong một lượt → cập nhật các repo nó đụng tới
  function onTurnEnd(conv) {
    for (const r of tabsFor(conv)) { const st = R.get(r.key); if (st && st.status) refresh(st, true); }
  }
  window.addEventListener('focus', () => { for (const st of R.values()) if (st.el.isConnected) refresh(st, true); });

  // =====================================================================
  // Vẽ
  // =====================================================================
  function draw(st) {
    const el = st.el;
    const fa = document.activeElement, keep = fa && el.contains(fa) ? { id: fa.dataset.k, s: fa.selectionStart, e: fa.selectionEnd } : null;
    el.innerHTML = '';
    if (st.err && !st.status) { el.append(h('div', { class: 'note', text: st.err }), h('button', { class: 'link-btn', text: 'Thử lại', onclick: () => refresh(st) })); return; }
    if (!st.status) { el.append(h('div', { class: 'note', text: 'Đang đọc git…' })); return; }
    if (st.view) el.append(diffView(st));
    else el.append(bar(st), commitBox(st), agentBox(st), lists(st), graphBox(st));
    if (keep && keep.id) { const t = el.querySelector(`[data-k="${keep.id}"]`); if (t) { t.focus(); try { t.setSelectionRange(keep.s, keep.e); } catch {} } }
  }
  function bar(st) {
    const s = st.status;
    const br = h('button', { class: 'gp-chip', title: 'Đổi / tạo nhánh' }, icon('branch', 12), h('span', { class: 'ellipsis', text: s.branch }), svg ? h('span', { html: svg('chevronDown', 11) }) : null);
    br.onclick = () => branchMenu(st, br);
    return h('div', { class: 'gp-bar' }, br,
      h('span', { class: 'gp-ab', title: s.upstream ? `So với ${s.upstream}: ${s.ahead} commit chưa đẩy lên, ${s.behind} commit chưa kéo về` : 'Nhánh chưa có upstream', text: s.upstream ? `↑${s.ahead} ↓${s.behind}` : 'chưa có upstream' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', text: 'Pull', disabled: !s.behind, title: 'git pull --ff-only', onclick: () => act(st, 'pull', null, 'Đã pull') }),
      h('button', { class: 'btn sm', text: 'Push', disabled: !(s.ahead || !s.upstream), title: 'git push', onclick: () => act(st, 'push', null, 'Đã push') }),
      h('button', { class: 'icon-btn sm', title: 'Làm mới (git fetch + status)', html: svg('refresh', 14), onclick: async () => { await act(st, 'fetch'); } }),
      st.loading ? h('span', { class: 'spinner' }) : null);
  }
  async function branchMenu(st, anchor) {
    const r = await api.gitAct(st.top, 'branches');
    const cur = st.status.branch;
    CG.menu(anchor, [
      { header: 'Chuyển nhánh' },
      ...(r.list || []).map((b) => ({ label: b, checked: b === cur, onClick: () => b !== cur && act(st, 'checkout', { ref: b }, `Đã chuyển sang ${b}`) })),
      '-', { label: 'Tạo nhánh mới…', icon: 'plus', onClick: async () => { const n = await promptDialog('Tên nhánh mới', '', 'feature/…'); if (n) act(st, 'newBranch', { name: n }, `Đã tạo và chuyển sang ${n}`); } },
    ], { checks: true });
  }
  function commitBox(st) {
    const staged = st.status.files.filter((f) => f.staged);
    const ta = h('textarea', { class: 'gp-msg', 'data-k': 'msg', rows: 2, placeholder: 'Nội dung commit (Ctrl+Enter để commit)…' });
    ta.value = st.msg || '';
    ta.oninput = () => { st.msg = ta.value; };
    ta.onkeydown = (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); doCommit(st); } };
    const sug = h('button', { class: 'btn sm', title: 'Claude (Haiku) đọc diff đã stage rồi viết nội dung commit theo phong cách của repo' }, '✨ Gợi ý nội dung');
    sug.onclick = async () => {
      if (!staged.length) return toast('Stage tệp trước đã');
      sug.disabled = true; sug.textContent = 'Đang viết…';
      const r = await api.gitSuggest(st.top).catch((e) => ({ ok: false, out: e.message }));
      if (r.ok) { st.msg = r.out; draw(st); } else { toast(r.out || 'Không gợi ý được', true); sug.disabled = false; sug.textContent = '✨ Gợi ý nội dung'; }
    };
    const go = h('button', { class: 'btn sm primary', disabled: !staged.length, text: staged.length ? `Commit (${new Set(staged.map((f) => f.path)).size})` : 'Commit', onclick: () => doCommit(st) });
    const more = h('button', { class: 'btn sm primary gp-more', disabled: !staged.length, html: svg('chevronDown', 12), title: 'Thêm' });
    more.onclick = () => CG.menu(more, [
      { label: 'Commit & Push', onClick: () => doCommit(st, { push: true }) },
      { label: 'Sửa commit trước (amend)', desc: 'Gộp phần đã stage vào commit gần nhất', onClick: async () => { if (!st.msg) { const m = await api.gitAct(st.top, 'headMsg'); st.msg = m.out || ''; draw(st); toast('Đã điền nội dung commit trước — sửa rồi chọn amend lần nữa'); return; } doCommit(st, { amend: true }); } },
    ]);
    return h('div', { class: 'gp-commit' }, ta, h('div', { class: 'gp-row' }, sug, h('span', { class: 'spacer' }), h('span', { class: 'gp-split' }, go, more)));
  }
  async function doCommit(st, o = {}) {
    const msg = (st.msg || '').trim();
    if (!st.status.files.some((f) => f.staged)) return toast('Chưa stage tệp nào');
    if (!msg) return toast('Nhập nội dung commit hoặc bấm ✨ Gợi ý');
    const r = await act(st, 'commit', { msg, amend: !!o.amend }, o.amend ? 'Đã sửa commit trước' : 'Đã commit');
    if (r.ok) { st.msg = ''; if (o.push) await act(st, 'push', null, 'Đã push'); draw(st); if (CG.mascot && CG.mascot.addXp) CG.mascot.addXp(2); }
  }

  // ----- danh sách tệp: đã stage / chưa stage (ô chọn để stage)
  function claudeSet(st) {
    const out = new Set();
    for (const c of CG.app ? CG.app.convs() : []) for (const p of (c.edits || new Map()).keys()) out.add(norm(p));
    return out;
  }
  function lists(st) {
    const files = st.status.files, cl = claudeSet(st);
    const isCl = (f) => cl.has(norm(join(st.top, f.path)));
    const staged = files.filter((f) => f.staged), un = files.filter((f) => !f.staged);
    const row = (f) => {
      const cb = h('input', { type: 'checkbox', title: f.staged ? 'Bỏ stage' : 'Stage' }); cb.checked = f.staged;
      cb.onclick = (e) => { e.stopPropagation(); act(st, f.staged ? 'unstage' : 'stage', { files: [f.path] }); };
      const nm = f.path.split('/').pop(), dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      const r = h('div', { class: 'f-row gp-f', title: f.path }, cb, h('span', { class: 'gp-st st-' + f.st, text: f.st }), h('span', { class: 'f-name ellipsis', text: nm }), h('span', { class: 'f-dir ellipsis', text: dir }),
        isCl(f) ? h('span', { class: 'gp-cl', title: 'Claude sửa tệp này trong phiên', text: '✳ Claude' }) : null,
        h('span', { class: 'f-cnt' }, h('span', { class: 'add', text: '+' + f.add }), ' ', h('span', { class: 'del', text: '−' + f.del })));
      r.onclick = () => { st.view = { file: f.path, untracked: !!f.untracked }; loadDiff(st).then(() => draw(st)); draw(st); };
      return r;
    };
    const link = (t, fn) => h('a', { class: 'gp-link', text: t, onclick: fn });
    const clUn = un.filter(isCl);
    return h('div', {},
      h('div', { class: 'gp-gh' }, h('span', { text: `Đã stage (${staged.length})` }), h('span', { class: 'spacer' }), staged.length ? link('Bỏ stage hết', () => act(st, 'unstage', { files: [...new Set(staged.map((f) => f.path))] })) : null),
      staged.length ? h('div', { class: 'f-list' }, staged.map(row)) : h('div', { class: 'note', text: 'Tích ô bên trái tệp để stage.' }),
      h('div', { class: 'gp-gh' }, h('span', { text: `Thay đổi (${un.length})` }), h('span', { class: 'spacer' }),
        clUn.length ? link('Stage tệp ✳ Claude', () => act(st, 'stage', { files: [...new Set(clUn.map((f) => f.path))] })) : null, clUn.length && un.length ? ' · ' : null,
        un.length ? link('Stage hết', () => act(st, 'stage', { files: [...new Set(un.map((f) => f.path))] })) : null),
      un.length ? h('div', { class: 'f-list' }, un.map(row)) : h('div', { class: 'note', text: 'Không còn thay đổi chưa stage.' }));
  }

  // ----- diff một tệp: stage / bỏ stage / hoàn tác từng đoạn
  async function loadDiff(st) {
    const v = st.view; if (!v) return;
    if (v.untracked) { const d = await api.gitFileDiff(st.top, v.file, false, true); v.text = d.text || ''; return; }
    const [u, s] = await Promise.all([api.gitFileDiff(st.top, v.file, false), api.gitFileDiff(st.top, v.file, true)]);
    v.un = parsePatch(u.patch || ''); v.st = parsePatch(s.patch || '');
  }
  function parsePatch(p) {
    const lines = p.replace(/\n$/, '').split('\n'), head = [], hunks = [];
    let cur = null;
    for (const l of lines) {
      if (l.startsWith('@@')) { cur = { h: l, lines: [] }; hunks.push(cur); }
      else if (cur) cur.lines.push(l);
      else if (l) head.push(l);
    }
    return { head: head.join('\n'), hunks };
  }
  const hunkPatch = (P, hk) => `${P.head}\n${hk.h}\n${hk.lines.join('\n')}\n`;
  function diffView(st) {
    const v = st.view;
    const f = st.status.files.filter((x) => x.path === v.file);
    const stagedAll = f.length && f.every((x) => x.staged);
    const cb = h('input', { type: 'checkbox' }); cb.checked = !!stagedAll;
    cb.onclick = () => act(st, stagedAll ? 'unstage' : 'stage', { files: [v.file] }).then(() => loadDiff(st)).then(() => draw(st));
    const box = h('div', { class: 'gp-diffv' },
      h('div', { class: 'dv-head' }, h('button', { class: 'icon-btn sm', html: svg('chevronLeft', 16), title: 'Quay lại', onclick: () => { st.view = null; draw(st); } }),
        h('span', { class: 'dv-title ellipsis', text: v.file, title: join(st.top, v.file) }),
        h('button', { class: 'icon-btn sm', html: svg('external', 14), title: 'Mở tệp trong khung xem', onclick: () => CG.viewer && CG.viewer.openFile(join(st.top, v.file)) }),
        h('label', { class: 'gp-lbl' }, cb, ' stage cả tệp')));
    if (v.untracked) { box.append(h('div', { class: 'note', text: 'Tệp mới (chưa theo dõi) — stage cả tệp.' }), hunkEl({ h: '@@ tệp mới @@', lines: (v.text || '').split('\n').slice(0, 3000).map((l) => '+' + l) }, [])); return box; }
    const sec = (title, P, btns) => {
      if (!P || !P.hunks.length) return null;
      return h('div', {}, h('div', { class: 'gp-gh', text: title }), ...P.hunks.map((hk) => hunkEl(hk, btns(P, hk))));
    };
    box.append(...[
      sec('Chưa stage', v.un, (P, hk) => [
        h('button', { class: 'btn sm', text: 'Stage', title: 'Stage riêng đoạn này', onclick: () => act(st, 'apply', { patch: hunkPatch(P, hk), cached: true }) }),
        h('button', { class: 'btn sm', text: 'Hoàn tác', title: 'Bỏ thay đổi của đoạn này trong tệp', onclick: async () => { if (await confirmDialog('Hoàn tác đoạn này?', 'Thay đổi của đoạn này trong tệp sẽ mất (không lấy lại được).', 'Hoàn tác', true)) act(st, 'apply', { patch: hunkPatch(P, hk), reverse: true }, 'Đã hoàn tác đoạn'); } }),
      ]),
      sec('Đã stage', v.st, (P, hk) => [h('button', { class: 'btn sm', text: 'Bỏ stage', title: 'Bỏ stage riêng đoạn này', onclick: () => act(st, 'apply', { patch: hunkPatch(P, hk), cached: true, reverse: true }) })]),
    ].filter(Boolean));
    if ((!v.un || !v.un.hunks.length) && (!v.st || !v.st.hunks.length)) box.append(h('div', { class: 'note', text: v.un ? 'Không có khác biệt nội dung (có thể chỉ đổi quyền tệp / xuống dòng).' : 'Đang tải diff…' }));
    return box;
  }
  function hunkEl(hk, btns) {
    const body = h('div', { class: 'gp-hb' });
    for (const l of hk.lines.slice(0, 2000)) {
      const k = l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : l[0] === '\\' ? 'm' : '';
      body.append(h('div', { class: 'gp-dl ' + k, text: l || ' ' }));
    }
    return h('div', { class: 'gp-hunk' }, h('div', { class: 'gp-hh' }, h('span', { class: 'ellipsis', text: hk.h }), h('span', { class: 'spacer' }), ...btns), body);
  }

  // =====================================================================
  // Giao Claude commit
  // =====================================================================
  const MODELS = [['haiku', 'Haiku — rẻ, nhanh'], ['sonnet', 'Sonnet — khéo hơn'], ['opus', 'Opus'], ['fable', 'Fable']];
  const EFF = [['low', 'Thấp'], ['medium', 'Vừa'], ['high', 'Cao'], ['max', 'Tối đa']];
  const RULES = { repo: 'Theo luật của repo (CLAUDE.md / commitlint / lịch sử)', conv: 'Conventional Commits (feat/fix/chore…)', split: 'Tách nhiều commit theo từng việc', one: 'Gộp thành một commit' };
  const RULE_TXT = {
    repo: 'Làm theo quy ước commit của repo: đọc CLAUDE.md, commitlint / .gitmessage nếu có, và theo phong cách 20 commit gần nhất (git log --oneline -20).',
    conv: 'Dùng Conventional Commits: <type>(<scope>): <mô tả>, type là feat/fix/refactor/docs/chore/test/style/perf.',
    split: 'Tách thành nhiều commit, mỗi commit một việc (một tính năng, một lỗi, một lần dọn dẹp). Tệp cùng một việc gom chung; tệp chứa nhiều việc thì stage từng đoạn (git add -p hoặc git apply --cached).',
    one: 'Gộp tất cả thành một commit với nội dung tóm tắt đủ ý.',
  };
  const CHIPS = [
    ['Tách theo việc', 'Tách theo việc: mỗi tính năng / mỗi lỗi một commit, các tệp cùng một việc gom chung'],
    ['Tách từng đoạn', 'Tệp sửa cho nhiều việc thì stage từng đoạn cho đúng commit'],
    ['Bỏ qua dist, log, .env', 'Không commit dist/, *.log, .env, tệp tạm'],
    ['Tiếng Việt', 'Nội dung commit viết tiếng Việt'],
    ['Mã task', 'Thêm mã task vào đầu nội dung, ví dụ [SABO-123]'],
    ['Hỏi trước khi commit', 'Chưa chắc thì hỏi lại tôi trước khi commit'],
  ];
  const AG_DEF = { where: 'bg', model: 'haiku', effort: 'low', rule: 'repo', note: '', remember: true, only: true, push: false };
  function ag(st) {
    if (!st.ag) { const saved = ((S().settings && S().settings.gitAgent) || {})[st.key]; st.ag = { ...AG_DEF, ...(saved || {}) }; }
    return st.ag;
  }
  async function saveAg(st) {
    const all = { ...((S().settings && S().settings.gitAgent) || {}) };
    if (st.ag.remember) all[st.key] = { ...st.ag }; else delete all[st.key];
    S().settings = await api.setSettings({ gitAgent: all });
  }
  function agFiles(st) {
    const cl = claudeSet(st), a = ag(st);
    const seen = new Map();
    for (const f of st.status.files) if (!a.only || cl.has(norm(join(st.top, f.path)))) { const x = seen.get(f.path) || { ...f }; if (seen.has(f.path)) { x.add += f.add; x.del += f.del; } seen.set(f.path, x); }
    return [...seen.values()];
  }
  function buildPrompt(st) {
    const a = ag(st), files = agFiles(st), s = st.status;
    const note = a.note.trim() ? 'Ghi chú của người dùng:\n' + a.note.trim().split('\n').filter(Boolean).map((l) => '  - ' + l).join('\n') + '\n' : '';
    return `Commit các thay đổi trong repo ${st.top} (nhánh ${s.branch}).
Chỉ đụng tới các tệp sau${a.only ? ' (Claude sửa trong phiên)' : ''}:
${files.map((f) => `  ${f.st} ${f.path}  (+${f.add} −${f.del})`).join('\n') || (a.only ? '  (chưa có tệp ✳ Claude sửa — bỏ tích "chỉ tệp ✳ Claude sửa" để lấy mọi thay đổi)' : '  (không có tệp)')}
Luật: ${RULE_TXT[a.rule]}
${note}Trước khi commit: xem git diff từng tệp; không commit tệp bí mật (.env, khoá), tệp build hay tệp ngoài danh sách. ${a.push ? 'Commit xong thì git push.' : 'Không push.'}
Xong thì liệt kê các commit đã tạo (mã + nội dung).`;
  }
  // vài tin nhắn gần nhất của phiên (để phiên nền hiểu vì sao có các thay đổi)
  function recentAsks(c) {
    const els = c && c.root ? [...c.root.querySelectorAll('.msg-user .bubble')].slice(-3) : [];
    return els.map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 400)).filter(Boolean);
  }
  function agentBox(st) {
    const a = ag(st), bg = a.where === 'bg';
    const c = st.conv;
    const pre = h('pre', { class: 'gp-pre', text: buildPrompt(st) });
    const upd = () => { pre.textContent = buildPrompt(st); saveAg(st); };
    const seg = (v, t, sub) => h('button', { class: a.where === v ? 'on' : '', onclick: () => { a.where = v; saveAg(st); draw(st); } }, t, h('small', { text: sub }));
    const sel = (key, opts, fmt) => { const s = h('select', { class: 'gp-sel', onchange: () => { a[key] = s.value; upd(); } }, opts.map(([v, l]) => h('option', { value: v, text: fmt ? fmt(l) : l }))); s.value = a[key]; return s; };
    const note = h('textarea', { class: 'gp-note', 'data-k': 'note', rows: 2, placeholder: 'Dặn thêm Claude, ví dụ: tách thành nhiều commit theo từng việc; app.js có cả sửa lỗi lẫn tính năng thì tách từng đoạn…' });
    note.value = a.note; note.oninput = () => { a.note = note.value; upd(); };
    const ck = (key, label, title) => { const i = h('input', { type: 'checkbox' }); i.checked = !!a[key]; i.onchange = () => { a[key] = i.checked; upd(); }; return h('label', { class: 'gp-lbl', title: title || '' }, i, ' ' + label); };
    const go = h('button', { class: 'btn sm primary', text: 'Giao việc', onclick: () => runAgent(st, go) });
    const det = h('details', { class: 'gp-det' }, h('summary', { text: 'Xem lời nhắn sẽ gửi Claude' }), pre);
    if (st.detOpen) det.open = true;
    det.ontoggle = () => { st.detOpen = det.open; };
    return h('div', { class: 'gp-agent' },
      h('div', { class: 'gp-at' }, '🤖 Giao Claude commit'),
      h('div', { class: 'gp-lb', text: 'Chạy ở' }),
      h('div', { class: 'gp-seg' }, seg('bg', 'Phiên nền riêng', 'chọn model/effort · không tốn ngữ cảnh phiên này'), seg('cur', 'Phiên hiện tại', 'biết vì sao sửa · dùng model của phiên')),
      bg ? h('div', { class: 'gp-two' }, sel('model', MODELS), sel('effort', EFF, (l) => 'Effort: ' + l)) : null,
      h('div', { class: 'gp-hint', text: bg ? 'Phiên nền nhận danh sách tệp ✳ và vài tin nhắn gần nhất của phiên này để hiểu bối cảnh.' : 'Dùng model và effort đang chọn của phiên. Nội dung commit sát ý định hơn, nhưng tốn ngữ cảnh và phải chờ phiên rảnh.' }),
      h('div', { class: 'gp-lb', text: 'Luật' }), sel('rule', Object.entries(RULES)),
      h('div', { class: 'gp-lb', text: 'Ghi chú cho agent' }), note,
      h('div', { class: 'gp-chips' }, CHIPS.map(([k, t]) => h('span', { title: t, text: '+ ' + k, onclick: () => { if (!a.note.includes(t)) a.note = (a.note.trim() ? a.note.trim() + '\n' : '') + t; upd(); draw(st); } }))),
      h('div', { class: 'gp-row' }, ck('only', 'chỉ tệp ✳ Claude sửa'), ck('push', 'rồi push'), ck('remember', 'nhớ cho repo này', 'Lần sau tự điền lại ghi chú và lựa chọn cho repo này'), h('span', { class: 'spacer' }), go),
      det);
  }
  async function runAgent(st, btn) {
    const a = ag(st), files = agFiles(st);
    if (!files.length) return toast(a.only ? 'Không có tệp ✳ Claude sửa nào chưa commit (bỏ tích "chỉ tệp ✳ Claude sửa" để commit cả tệp khác)' : 'Không có thay đổi để commit');
    let prompt = buildPrompt(st);
    const display = `🤖 Commit ${files.length} tệp trong ${basename(st.top)} · ${RULES[a.rule].split(' (')[0].toLowerCase()}${a.note.trim() ? ' · có ghi chú' : ''}${a.push ? ' · rồi push' : ''}`;
    const c = st.conv;
    btn.disabled = true;
    try {
      if (a.where === 'cur') {
        if (!c) throw new Error('Không có phiên');
        // phiên bận (hoặc đã có việc chờ trong hàng đợi) → xếp hàng, phiên xong lượt thì tự gửi — giao liên tiếp nhiều repo vẫn đúng thứ tự
        if ((c.busy || (CG.sched && CG.sched.pendingQueue && CG.sched.pendingQueue(c))) && CG.sched && CG.sched.queueAfter) {
          const p = CG.sched.queueAfter(c, prompt, [], { display, quiet: true });
          toast(`Phiên đang bận — đã xếp yêu cầu commit ${basename(st.top)} vào hàng đợi (bước ${p.nodes.length}). Phiên xong việc thì tự gửi.`);
          watchDone(c, st, true);
          return;
        }
        await c.send(prompt, display);
      } else {
        const asks = recentAsks(c);
        if (asks.length) prompt += `\n\nBối cảnh (các yêu cầu gần nhất của người dùng trong phiên đã sửa các tệp này):\n${asks.map((x) => '  - ' + x).join('\n')}`;
        const nc = await CG.app.createConv({ cwd: st.top, model: a.model, effort: a.effort, mode: c ? c.mode : undefined });
        nc.title = `🤖 Commit ${basename(st.top)}`;
        await nc.send(prompt, display);
        if (CG.app.renderSidebar) CG.app.renderSidebar();
        toast(`Đã giao cho phiên nền “${nc.title}” (${a.model}, effort ${a.effort}) — xem ở thanh bên`);
        watchDone(nc, st);
      }
    } catch (e) { toast('Không giao được: ' + e.message, true); }
    finally { btn.disabled = false; }
  }
  // long: việc trong hàng đợi có thể chạy lâu sau → mỗi lần phiên xong một lượt thì làm mới khung, theo dõi tới 3 giờ
  function watchDone(conv, st, long) {
    const t0 = Date.now();
    let last = t0;
    const iv = setInterval(() => {
      if (Date.now() - t0 > (long ? 180 : 30) * 60e3) return clearInterval(iv);
      if (!conv.busy && conv.lastEnd && conv.lastEnd.t >= last) {
        last = Date.now(); refresh(st, true);
        if (!long || !(CG.sched && CG.sched.pendingQueue && CG.sched.pendingQueue(conv))) clearInterval(iv);
      }
    }, 2000);
  }

  // =====================================================================
  // Cây git
  // =====================================================================
  const LC = ['#5aa8ff', '#d97757', '#5fd38d', '#c792ea', '#e6b450', '#4fd1c5'];
  function lanes(log) {
    const L = [], rows = [];
    for (const c of log) {
      let li = L.indexOf(c.id); if (li < 0) { li = L.indexOf(null); if (li < 0) li = L.length; L[li] = c.id; }
      const before = L.slice();
      L[li] = c.parents[0] || null;
      for (const p of c.parents.slice(1)) if (!L.includes(p)) { let k = L.indexOf(null); if (k < 0) k = L.length; L[k] = p; }
      const merges = []; before.forEach((x, i) => { if (x === c.id && i !== li) { merges.push(i); L[i] = null; } });
      while (L.length && L[L.length - 1] == null) L.pop();
      rows.push({ c, li, before, after: L.slice(), merges });
    }
    return rows;
  }
  function graph(st, log, big) {
    const rows = lanes(log), H = 34, W = 12;
    const maxL = Math.min(10, Math.max(1, ...rows.map((r) => Math.max(r.before.length, r.after.length))));
    const w = maxL * W + 8, X = (i) => 7 + Math.min(i, maxL - 1) * W;
    const box = h('div', { class: 'gp-graph' + (big ? ' big' : '') });
    const render = () => { box.innerHTML = ''; rows.forEach(drawRow); };
    const drawRow = (row, ri) => {
      let s = `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">`;
      const ln = (i, y1, y2) => `<line x1="${X(i)}" y1="${y1}" x2="${X(i)}" y2="${y2}" stroke="${LC[i % 6]}" stroke-width="2"/>`;
      row.before.forEach((x, i) => { if (x && !row.merges.includes(i) && i !== row.li) s += ln(i, 0, H); });
      if (row.before[row.li] === row.c.id && ri) s += ln(row.li, 0, H / 2);
      row.merges.forEach((i) => { s += `<path d="M${X(i)} 0 C ${X(i)} ${H / 2}, ${X(row.li)} ${H / 4}, ${X(row.li)} ${H / 2}" stroke="${LC[i % 6]}" stroke-width="2" fill="none"/>`; });
      row.after.forEach((x, i) => { if (!x) return; if (i === row.li) s += ln(i, H / 2, H); else if (row.before[i] !== x) s += `<path d="M${X(row.li)} ${H / 2} C ${X(row.li)} ${H * .8}, ${X(i)} ${H * .7}, ${X(i)} ${H}" stroke="${LC[i % 6]}" stroke-width="2" fill="none"/>`; });
      const head = row.c.refs.some((x) => x.startsWith('HEAD'));
      s += `<circle cx="${X(row.li)}" cy="${H / 2}" r="${head ? 5 : 4}" fill="${head ? 'var(--surface)' : LC[row.li % 6]}" stroke="${LC[row.li % 6]}" stroke-width="2"/></svg>`;
      const refs = row.c.refs.map((x) => { const k = x.startsWith('HEAD') ? 'head' : x.startsWith('tag: ') ? 'tag' : /^origin\//.test(x) || x.includes('/') ? 'rm' : 'br'; return h('span', { class: 'gp-ref ' + k, text: x.replace('HEAD -> ', '● ').replace('tag: ', '') }); });
      const open = st.sel === row.c.id;
      const line = h('div', { class: 'gp-gl' + (open ? ' sel' : ''), title: `${row.c.id.slice(0, 10)} · ${row.c.au} · ${new Date(row.c.t).toLocaleString('vi-VN')}\n${row.c.msg}` },
        h('span', { html: s }), h('div', { class: 'gp-tx' }, h('div', { class: 'gp-m' }, ...refs, row.c.msg), h('div', { class: 'gp-mt', text: `${row.c.id.slice(0, 7)} · ${row.c.au} · ${CG.relTime(row.c.t)}` })));
      line.onclick = async () => { st.sel = open ? null : row.c.id; st.selInfo = null; render(); if (!open) { const r = await api.gitAct(st.top, 'show', { ref: row.c.id }); if (st.sel === row.c.id) { st.selInfo = r.out || ''; render(); } } };
      box.append(line);
      if (open) {
        const cont = `<svg width="${w}" viewBox="0 0 ${w} 10" preserveAspectRatio="none">${row.after.map((x, i) => (x ? `<line x1="${X(i)}" y1="0" x2="${X(i)}" y2="10" stroke="${LC[i % 6]}" stroke-width="2" vector-effect="non-scaling-stroke"/>` : '')).join('')}</svg>`;
        const lines = (st.selInfo || '').split('\n').filter((l) => /^\d+|^-\t/.test(l)).slice(0, 40).map((l) => { const [a, d, p] = l.split('\t'); return h('div', {}, h('span', { text: p }), ' ', h('span', { class: 'add', text: '+' + a }), ' ', h('span', { class: 'del', text: '−' + d })); });
        const lk = (t, fn) => h('a', { class: 'gp-link', text: t, onclick: fn });
        box.append(h('div', { class: 'gp-cf' }, h('span', { class: 'gp-cfl', html: cont }), h('div', { class: 'gp-cfiles' },
          st.selInfo == null ? h('div', { text: 'Đang tải…' }) : lines.length ? lines : h('div', { text: '(không có tệp)' }),
          h('div', { class: 'gp-cfa' },
            lk('Checkout', async () => { if (await confirmDialog('Checkout commit này?', `HEAD sẽ chuyển sang ${row.c.id.slice(0, 7)} (trạng thái tách rời). Thay đổi chưa commit có thể chặn thao tác.`, 'Checkout')) act(st, 'checkout', { ref: row.c.id }, 'Đã checkout'); }), ' · ',
            lk('Tạo nhánh từ đây', async () => { const n = await promptDialog('Tên nhánh mới (từ ' + row.c.id.slice(0, 7) + ')', '', 'feature/…'); if (n) act(st, 'newBranch', { name: n, from: row.c.id }, `Đã tạo nhánh ${n}`); }), ' · ',
            lk('Sao chép mã', () => { navigator.clipboard.writeText(row.c.id); toast('Đã sao chép ' + row.c.id.slice(0, 7)); })))));
      }
    };
    render();
    return box;
  }
  function graphBox(st) {
    const big = h('a', { class: 'gp-link', text: 'Mở lớn ↗', onclick: () => bigGraph(st) });
    return h('div', { class: 'gp-hist' }, h('div', { class: 'gp-gh' }, h('span', { text: 'Lịch sử (cây git)' }), h('span', { class: 'spacer' }), big),
      st.log.length ? graph(st, st.log.slice(0, 40)) : h('div', { class: 'note', text: 'Chưa có commit nào.' }));
  }
  async function bigGraph(st) {
    const holder = h('div', { class: 'gp-bigwrap' }, h('div', { class: 'note', text: 'Đang tải…' }));
    const m = CG.modal(`Cây git — ${basename(st.top)} (${st.status.branch})`, holder, [h('button', { class: 'btn primary', text: 'Đóng', onclick: () => m.close() })], { cls: 'm-wide gp-modal' });
    const log = await api.gitLog(st.top, 400);
    holder.innerHTML = ''; holder.append(graph(st, log, true));
  }

  CG.git = { track, tabsFor, view, refresh: (top) => refresh(state(top)), onTurnEnd, _R: R };
})();
