'use strict';
// Chuyển kế hoạch / dự án tự động sang Claude GUI ở máy khác: Xuất → tệp .cgpack (kế hoạch + thư mục RUN + đính kèm + trạng thái git)
// → máy kia Nhập: chọn lại thư mục gốc, GUI đổi đường dẫn trong kế hoạch / context.md và ghi chú "chuyển máy" ở đầu để agent
// bên đó biết: xuất từ đâu, nhập vào đâu, đường dẫn nào có thể không còn, phiên cũ không có, git cần ở commit nào.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, icon, toast, modal, basename } = CG;
  const SC = () => CG.sched;
  const save = () => SC()._h.save();
  const render = () => SC()._h.render();
  const fmtT = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const low = (x) => String(x || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const under = (p, root) => low(p) === low(root) || low(p).startsWith(low(root) + '\\');

  // thư mục gốc của kế hoạch (để máy kia chọn lại) + tệp đính kèm cần mang theo
  function rootsOf(p) {
    if (p.kind === 'project') {
      const P = p.proj;
      const r = [{ key: 'dir', path: P.dir, label: 'Thư mục dự án' }, ...(P.addDirs || []).map((d, i) => ({ key: 'add' + i, path: d, label: 'Thư mục thêm' }))];
      if (P.run && !r.some((x) => under(P.run, x.path))) r.push({ key: 'run', path: P.run, label: 'Thư mục chạy (RUN)' });
      return r;
    }
    const m = new Map();
    for (const n of p.nodes || []) {
      if (n.cwd) m.set(low(n.cwd), n.cwd);
      for (const a of n.atts || []) if ((a.kind === 'dir' || a.kind === 'repo') && /^[a-zA-Z]:[\\/]/.test(a.path)) m.set(low(a.path), a.path);
    }
    return [...m.values()].map((d, i) => ({ key: 'r' + i, path: d, label: 'Thư mục làm việc' }));
  }
  const filesOf = (p) => (p.kind === 'project' ? [] : (p.nodes || []).flatMap((n) => (n.atts || []).filter((a) => a.kind === 'file' || a.kind === 'image').map((a) => a.path)));

  // tệp sinh ra khi build (bin/obj) và thư mục .claude-gui không tính là "chưa commit"
  const realDirty = (g) => ((g && g.dirty) || []).filter((x) => !/[\\/](bin|obj)([\\/]|$)|\.claude-gui[\\/]/i.test(x));
  function gitWarn(g) {
    if (!g) return [];
    const w = [];
    if (g.ahead > 0) w.push(`${g.ahead} commit chưa push lên ${g.upstream || 'remote'}`);
    if (!g.upstream && g.branch && g.branch !== 'HEAD') w.push(`nhánh ${g.branch} chưa có trên remote (chưa push lần nào)`);
    const dirty = realDirty(g);
    if (dirty.length) w.push(`${dirty.length} tệp sửa chưa commit: ${dirty.slice(0, 5).map((x) => x.slice(3)).join(', ')}${dirty.length > 5 ? '…' : ''}`);
    return w;
  }

  // ---------- Xuất ----------
  async function exportPlan(p, out) {
    if (p.run && p.run.state === 'running') return toast('Kế hoạch đang chạy — dừng trước khi xuất.', true);
    const plan = JSON.parse(JSON.stringify(p));
    delete plan.exported;
    const r = await api.packExport({ plan, roots: rootsOf(p), runDir: p.kind === 'project' ? p.proj.run : '', files: filesOf(p), out });
    if (!r.ok) { if (!r.canceled) toast(r.error || 'Không xuất được.', true); return; }
    // tắt ở máy này để không chạy trùng với máy kia
    p.exported = { t: Date.now(), file: r.file, wasOn: !!p.on };
    p.on = false;
    p.run.note = `📦 Đã xuất sang máy khác lúc ${fmtT(p.exported.t)} (${basename(r.file)}) — đã tắt ở máy này để không chạy trùng.`;
    save(); render();
    const warns = r.roots.flatMap((x) => gitWarn(x.git).map((w) => `${x.label} (${x.path}): ${w}`));
    modal('Đã xuất', h('div', { class: 'pk-sum' },
      h('p', {}, 'Tệp: ', h('code', { text: r.file }), ` · ${size(r.size)} · ${r.files} tệp kèm theo.`),
      h('p', { text: 'Chép tệp này sang máy kia (USB, ổ mạng…), mở Claude GUI bên đó → Lịch & hàng đợi → Nhập.' }),
      warns.length ? h('div', { class: 'pk-warn' }, h('b', { text: '⚠ Git — máy kia sẽ không có phần này nếu bạn không push:' }), h('ul', {}, warns.map((w) => h('li', { text: w })))) : h('p', { class: 'pk-ok', text: '✓ Git sạch — máy kia chỉ cần pull đúng nhánh.' }),
      r.skipped.length ? h('div', { class: 'pk-warn' }, h('b', { text: 'Không đóng gói (quá lớn / thư mục bị loại trừ):' }), h('ul', {}, r.skipped.slice(0, 10).map((x) => h('li', { text: x })))) : null,
      h('p', { class: 'pk-muted', text: 'Không gói lịch sử phiên: các phiên đã chạy vẫn ở máy này. Kế hoạch ở máy này đã được tắt; bật lại nếu muốn chạy ở đây.' }),
    ), [h('button', { class: 'btn', text: 'Mở thư mục chứa', onclick: () => api.showItem ? api.showItem(r.file) : api.openPath(r.file.replace(/[\\/][^\\/]+$/, '')) }), h('button', { class: 'btn primary', text: 'Xong', onclick: () => document.getElementById('modal-root').innerHTML = '' })]);
  }

  // ---------- Nhập ----------
  async function importPlan(file) {
    const pk = await api.packOpen(file);
    if (!pk.ok) { if (!pk.canceled) toast(pk.error || 'Không mở được gói.', true); return; }
    const inputs = {};
    const rows = pk.roots.map((r) => {
      const inp = h('input', { type: 'text', class: 'text-input mono', value: r.here ? r.path : '', placeholder: 'Chọn thư mục tương ứng ở máy này' });
      const mark = h('span', { class: 'pk-mark' });
      const chk = async () => { const v = inp.value.trim(); mark.textContent = v ? ((await api.pathExists(v)) ? '✓' : '✗ không có') : ''; mark.className = 'pk-mark ' + (mark.textContent === '✓' ? 'ok' : 'bad'); };
      inp.oninput = chk; chk();
      inputs[r.key] = inp;
      const g = r.git;
      return h('div', { class: 'pk-root' },
        h('div', { class: 'pk-rl' }, h('b', { text: r.label }), h('span', { class: 'pk-old', title: 'Đường dẫn ở máy cũ', text: r.path })),
        h('div', { class: 'pk-rr' }, inp, h('button', { class: 'btn sm', text: 'Chọn…', onclick: async () => { const d = await api.pickDir(inp.value || undefined); if (d) { inp.value = d; chk(); } } }), mark),
        g ? h('div', { class: 'pk-git' }, `git: ${g.branch || '?'} @ ${(g.head || '').slice(0, 8)}${g.remote ? ' · ' + g.remote : ''}`, ...gitWarn(g).map((w) => h('div', { class: 'pk-warn-s', text: '⚠ máy cũ: ' + w }))) : null);
    });
    const P = pk.plan;
    const tasks = pk.kind === 'project' ? P.proj.tasks : P.nodes;
    // MCP mà kế hoạch cần (vd gdd) — máy này chưa cấu hình thì báo trước
    const need = [...new Set((pk.kind === 'project' ? P.proj.mcp || [] : []).map((x) => String(x).replace(/^mcp__/, '').split('__')[0]).filter(Boolean))];
    const mcpBox = h('div');
    if (need.length) api.nbServers(pk.roots[0] && pk.roots[0].path).then((list) => {
      const have = new Set((list || []).map((x) => x.name));
      const miss = need.filter((n) => !have.has(n));
      mcpBox.append(miss.length ? h('div', { class: 'pk-warn' }, h('b', { text: `⚠ Máy này chưa có MCP: ${miss.join(', ')}` }), h('div', { text: 'Task cần các máy chủ này — cài trước khi chạy (claude mcp add …, hoặc chép cấu hình từ máy cũ).' }))
        : h('div', { class: 'pk-ok', text: `✓ Đã có MCP cần dùng: ${need.join(', ')}` }));
    }).catch(() => {});
    const ow = h('input', { type: 'checkbox' });
    const body = h('div', { class: 'pk-imp' },
      h('div', { class: 'pk-head' }, h('b', { text: (pk.kind === 'project' ? '🤖 ' : '🗓 ') + P.name }),
        h('div', { class: 'pk-muted', text: `Xuất từ máy ${pk.from.host} (${pk.from.user}) lúc ${fmtT(pk.from.t)} · Claude GUI ${pk.from.gui} · ${tasks.length} ${pk.kind === 'project' ? 'task' : 'bước'} · ${pk.files.length} tệp` })),
      h('div', { class: 'pk-sec', text: 'Thư mục ở máy này (để trống = giữ đường dẫn cũ)' }), ...rows, mcpBox,
      pk.kind === 'project' ? h('label', { class: 'pk-ow' }, ow, ' Ghi đè thư mục RUN nếu máy này đã có (mặc định giữ bản đang có)') : null,
      pk.skipped.length ? h('div', { class: 'pk-warn' }, h('b', { text: 'Máy cũ không đóng gói:' }), h('ul', {}, pk.skipped.slice(0, 8).map((x) => h('li', { text: x })))) : null,
      h('p', { class: 'pk-muted', text: 'Sau khi nhập, kế hoạch ở trạng thái TẮT. Đầu context.md / prompt có ghi chú chuyển máy và các đường dẫn có thể không còn, để Claude ở máy này không nhầm.' }));
    let m = null;
    const go = async () => {
      const map = {};
      for (const [k, inp] of Object.entries(inputs)) if (inp.value.trim()) map[k] = inp.value.trim();
      const r = await api.packImport({ file: pk.file, map, overwrite: ow.checked });
      if (!r.ok) return toast(r.error || 'Không nhập được.', true);
      const plan = finish(r, pk, map);
      m.close();
      SC().open(plan.id);
      toast(`Đã nhập “${plan.name}” — xem ghi chú chuyển máy rồi bật / duyệt để chạy.`);
    };
    m = modal('Nhập kế hoạch từ máy khác', body, [h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }), h('button', { class: 'btn primary', text: 'Nhập', onclick: go })], { cls: 'wide' });
  }

  // ghi chú đặt ở đầu context.md (dự án) / đầu prompt từng bước (kế hoạch thường)
  function noteText(r, pk, map) {
    const moved = pk.roots.filter((x) => map[x.key] && low(map[x.key]) !== low(x.path)).map((x) => `${x.path} → ${map[x.key]}`);
    const g = r.git.map((x) => {
      const a = `${x.label || x.key}: máy cũ ở nhánh ${x.from.branch} @ ${(x.from.head || '').slice(0, 10)}${x.from.ahead > 0 ? ` (${x.from.ahead} commit chưa push)` : ''}${realDirty(x.from).length ? `, ${realDirty(x.from).length} tệp sửa chưa commit` : ''}`;
      const b = x.here ? `máy này đang ở ${x.here.branch} @ ${(x.here.head || '').slice(0, 10)}${x.hasCommit ? '' : ' — CHƯA CÓ commit của máy cũ (cần fetch / pull / checkout trước khi làm)'}` : 'máy này không thấy repo git ở thư mục đó';
      return `${a}; ${b}.`;
    });
    return [
      `> ⚠ **CHUYỂN MÁY** — xuất từ máy **${pk.from.host}** (${pk.from.user}) lúc ${fmtT(pk.from.t)}, nhập vào máy **${r.me.host}** (${r.me.user}) lúc ${fmtT(Date.now())}.`,
      moved.length ? `> - Thư mục đã đổi (đã thay trong kế hoạch / tệp RUN): ${moved.join('; ')}` : '> - Giữ nguyên đường dẫn thư mục như máy cũ.',
      r.dead.length ? `> - Các đường dẫn sau KHÔNG có ở máy này — đừng dựa vào, cần thì hỏi người dùng: ${r.dead.slice(0, 25).join('; ')}${r.dead.length > 25 ? ` (+${r.dead.length - 25})` : ''}` : '> - Mọi đường dẫn tuyệt đối trong kế hoạch đều có ở máy này.',
      '> - Các phiên Claude đã chạy ở máy cũ (phiên điều phối, phiên task) KHÔNG có ở máy này; bàn giao chỉ còn trong RUN/handoff.',
      ...g.map((x) => '> - Git ' + x),
      '',
    ].join('\n');
  }
  function finish(r, pk, map) {
    const p = r.plan;
    const D = SC()._D;
    const note = noteText(r, pk, map);
    p.id = Math.random().toString(36).slice(2, 10);
    p.on = false;
    delete p.exported;
    p.imported = { t: Date.now(), from: pk.from, to: r.me, file: pk.file, dead: r.dead, git: r.git.map((x) => ({ label: x.label, branch: x.from.branch, head: x.from.head, hasCommit: x.hasCommit, here: x.here && x.here.branch })), oldPlanner: p.proj && p.proj.plannerSid || '' };
    p.run = { state: 'idle', st: [], sids: [], note: `📦 Nhập từ máy ${pk.from.host} lúc ${fmtT(Date.now())} — đang TẮT. Xem ghi chú chuyển máy rồi bật / duyệt để chạy.` };
    if (p.kind === 'project') {
      const P = p.proj;
      P.plannerSid = '';
      P.hold = null; P.pending = null;
      for (const t of P.tasks) if (t.st === 'run' || t.st === 'pause') { t.st = 'wait'; t.sid = ''; }
      (P.log = P.log || []).push({ t: Date.now(), text: `Nhập từ máy ${pk.from.host} (gói ${basename(pk.file)})` });
      // ghi chú ở đầu context.md — mọi task và phiên điều phối mới đều đọc tệp này trước
      if (r.runDir) prependNote(r.runDir + '\\context.md', note);
    } else {
      for (const n of p.nodes || []) { n.id = Math.random().toString(36).slice(2, 10); if (n.prompt) n.prompt = note.replace(/^> ?/gm, '') + '\n' + n.prompt; }
    }
    D.plans.unshift(p);
    SC()._U.sel = p.id;
    save(); render();
    return p;
  }
  async function prependNote(file, note) {
    const r = await api.apFs('read', file).catch(() => null);
    const old = r && r.ok ? r.text : '';
    await api.apFs('write', file, note + '\n' + old.replace(/^(> ⚠ \*\*CHUYỂN MÁY\*\*[\s\S]*?\n\n)/, ''));
  }

  // khung trạng thái chuyển máy trong trang kế hoạch
  function banner(p) {
    if (p.imported) {
      const I = p.imported;
      return h('div', { class: 'pk-banner in' }, h('b', { text: `📦 Nhập từ máy ${I.from.host} (${I.from.user}) lúc ${fmtT(I.t)}` }),
        I.dead && I.dead.length ? h('details', {}, h('summary', { text: `${I.dead.length} đường dẫn không có ở máy này` }), h('ul', {}, I.dead.slice(0, 30).map((x) => h('li', { text: x })))) : h('div', { text: 'Mọi đường dẫn đều có ở máy này.' }),
        ...(I.git || []).filter((g) => !g.hasCommit).map((g) => h('div', { class: 'pk-warn-s', text: `⚠ ${g.label}: máy này chưa có commit ${String(g.head).slice(0, 8)} (nhánh ${g.branch}) — pull / checkout trước khi chạy.` })));
    }
    if (p.exported && p.exported.worker && CG.lan) return CG.lan.banner(p);
    if (p.exported) return h('div', { class: 'pk-banner out' }, h('b', { text: `📦 Đã xuất sang máy khác lúc ${fmtT(p.exported.t)}` }), h('div', { class: 'pk-muted', text: p.exported.file }),
      h('button', { class: 'btn sm', text: 'Bỏ đánh dấu (chạy lại ở máy này)', onclick: () => { delete p.exported; p.run.note = ''; save(); render(); } }));
    return null;
  }

  // ---------- Chuyển MỘT PHIÊN sang máy khác (.cgsession) ----------
  // Máy kia nhập → phiên hiện thẳng trong danh sách, chat tiếp được (--resume, đủ ngữ cảnh). Tin nhắn đầu tiên sau khi nhập
  // tự kèm ghi chú CHUYỂN MÁY (thư mục cũ → mới, đường dẫn không còn, git) để Claude dùng đúng đường dẫn ở máy này.
  let IMP = {};
  const loadImp = () => api.sessImported().then((m) => { IMP = m || {}; }).catch(() => {});
  loadImp();
  const NOTE_A = '[Claude GUI · CHUYỂN MÁY]';
  const NOTE_B = '[/CHUYỂN MÁY]';

  async function exportSession(it) {
    const conv = CG.app.convs().find((c) => c.sid === it.id);
    if (conv && conv.busy) return toast('Phiên đang chạy — chờ xong lượt rồi xuất.', true);
    const r = await api.sessExport({ id: it.id, cwd: it.cwd });
    if (!r.ok) { if (!r.canceled) toast(r.error || 'Không xuất được.', true); return; }
    const warns = gitWarn(r.git);
    const m = modal('Đã xuất phiên', h('div', { class: 'pk-sum' },
      h('p', {}, h('b', { text: r.title || it.title || '' })),
      h('p', {}, 'Tệp: ', h('code', { text: r.file }), ` · ${size(r.size)} (lịch sử ${size(r.raw)}, ${r.files} tệp).`),
      h('p', { text: 'Chép tệp sang máy kia, mở Claude GUI bên đó → nút lọc ở thanh bên → Nhập phiên từ máy khác… (hoặc kéo tệp vào cửa sổ). Phiên hiện ngay trong danh sách; tin nhắn đầu tiên ở máy đó tự kèm ghi chú đổi đường dẫn.' }),
      r.git ? (warns.length ? h('div', { class: 'pk-warn' }, h('b', { text: `⚠ Git (${r.cwd}) — máy kia sẽ không có phần này nếu bạn không push:` }), h('ul', {}, warns.map((w) => h('li', { text: w }))))
        : h('p', { class: 'pk-ok', text: `✓ Git sạch (${r.git.branch} @ ${String(r.git.head).slice(0, 8)}) — máy kia chỉ cần pull đúng nhánh.` })) : null,
      r.skipped.length ? h('div', { class: 'pk-warn' }, h('b', { text: 'Không đóng gói (quá lớn):' }), h('ul', {}, r.skipped.slice(0, 8).map((x) => h('li', { text: x })))) : null,
      h('p', { class: 'pk-muted', text: 'Phiên ở máy này vẫn giữ nguyên. Nếu chat tiếp ở cả hai máy thì hai bản sẽ tách nhau — nên chỉ chat tiếp ở một máy.' }),
    ), [h('button', { class: 'btn', text: 'Mở thư mục chứa', onclick: () => api.showItem ? api.showItem(r.file) : api.openPath(r.file.replace(/[\\/][^\\/]+$/, '')) }), h('button', { class: 'btn primary', text: 'Xong', onclick: () => m.close() })]);
  }

  async function importSession(file) {
    const pk = await api.sessOpen(file);
    if (!pk.ok) { if (!pk.canceled) toast(pk.error || 'Không mở được tệp.', true); return; }
    const inp = h('input', { type: 'text', class: 'text-input mono', value: pk.here ? pk.cwd : '', placeholder: 'Thư mục tương ứng ở máy này' });
    const mark = h('span', { class: 'pk-mark' });
    const chk = async () => { const v = inp.value.trim(); const ok = !!v && (await api.pathExists(v)); mark.textContent = v ? (ok ? '✓' : '✗ không có') : ''; mark.className = 'pk-mark ' + (ok ? 'ok' : 'bad'); return ok; };
    inp.oninput = chk; chk();
    const g = pk.git;
    const body = h('div', { class: 'pk-imp' },
      h('div', { class: 'pk-head' }, h('b', { text: '💬 ' + (pk.title || '(Không có tiêu đề)') }),
        h('div', { class: 'pk-muted', text: `Xuất từ máy ${pk.from.host} (${pk.from.user}) lúc ${fmtT(pk.from.t)} · Claude GUI ${pk.from.gui} · lịch sử ${size(pk.size)}${pk.files > 1 ? ` · ${pk.files - 1} tệp tác tử phụ` : ''}` })),
      h('div', { class: 'pk-sec', text: 'Thư mục làm việc ở máy này' }),
      h('div', { class: 'pk-root' },
        h('div', { class: 'pk-rl' }, h('b', { text: 'Thư mục làm việc' }), h('span', { class: 'pk-old', title: 'Đường dẫn ở máy cũ', text: pk.cwd })),
        h('div', { class: 'pk-rr' }, inp, h('button', { class: 'btn sm', text: 'Chọn…', onclick: async () => { const d = await api.pickDir(inp.value || undefined); if (d) { inp.value = d; chk(); } } }), mark),
        g ? h('div', { class: 'pk-git' }, `git máy cũ: ${g.branch || '?'} @ ${(g.head || '').slice(0, 8)}${g.remote ? ' · ' + g.remote : ''}`, ...gitWarn(g).map((w) => h('div', { class: 'pk-warn-s', text: '⚠ ' + w }))) : null),
      pk.exists ? h('div', { class: 'pk-warn' }, h('b', { text: 'Máy này đã có phiên này.' }), h('div', { text: 'Chỉ cập nhật được khi bản nhập là bản chat tiếp của bản đang có (không mất gì); nếu hai bản đã tách nhau thì sẽ không ghi đè.' })) : null,
      h('p', { class: 'pk-muted', text: 'Phiên giữ nguyên lịch sử và id. Tin nhắn đầu tiên bạn gửi sẽ tự kèm ghi chú chuyển máy (thư mục cũ → mới, đường dẫn không có ở máy này, git) để Claude dùng đúng đường dẫn ở đây.' }));
    let m = null;
    const go = async () => {
      if (!(await chk())) return toast('Chọn thư mục làm việc có ở máy này.', true);
      const r = await api.sessImport({ file: pk.file, cwd: inp.value.trim() });
      if (!r.ok) return toast(r.error || 'Không nhập được.', true);
      m.close();
      await loadImp();
      await CG.app.refreshSessions();
      const it = (CG.S.all || []).find((x) => x.id === r.id);
      if (it) await CG.app.openSession(it);
      toast(r.mode === 'same' ? 'Phiên này đã có sẵn ở máy này (giống hệt).' : `${r.mode === 'update' ? 'Đã cập nhật' : 'Đã nhập'} “${r.title || 'phiên'}” — nhắn tiếp là Claude dùng đường dẫn ở máy này.`);
    };
    m = modal('Nhập phiên từ máy khác', body, [h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }), h('button', { class: 'btn primary', text: 'Nhập', onclick: go })], { cls: 'wide' });
  }

  // ghi chú cho Claude, kèm vào tin nhắn đầu tiên sau khi nhập (một lần)
  function moveText(I) {
    const L = [`${NOTE_A} Phiên này được xuất từ máy ${I.from.host} (${I.from.user}) lúc ${fmtT(I.from.t)} và nhập vào máy ${I.me.host} (${I.me.user}) lúc ${fmtT(I.t)}. Lịch sử phía trên là ở máy cũ.`];
    if (I.oldCwd && low(I.oldCwd) !== low(I.cwd)) L.push(`- Thư mục làm việc đã đổi: ${I.oldCwd} → ${I.cwd}. Mọi đường dẫn bắt đầu bằng ${I.oldCwd} trong lịch sử, từ giờ dùng ${I.cwd} thay thế.`);
    else L.push(`- Thư mục làm việc giữ nguyên: ${I.cwd}.`);
    if (I.deadCount) L.push(`- ${I.deadCount} đường dẫn trong lịch sử KHÔNG có ở máy này (sau khi đã đổi thư mục gốc) — đừng dựa vào, cần thì hỏi người dùng: ${I.dead.slice(0, 25).join('; ')}${I.deadCount > 25 ? ` (+${I.deadCount - 25})` : ''}`);
    if (I.git) {
      const a = `máy cũ ở nhánh ${I.git.branch} @ ${String(I.git.head || '').slice(0, 10)}${I.git.ahead > 0 ? ` (${I.git.ahead} commit chưa push)` : ''}${I.git.dirty ? `, ${I.git.dirty} tệp sửa chưa commit (máy này KHÔNG có các thay đổi đó)` : ''}`;
      const b = I.here ? `máy này đang ở ${I.here.branch} @ ${String(I.here.head || '').slice(0, 10)}${I.hasCommit ? '' : ' — CHƯA CÓ commit của máy cũ (cần fetch / pull / checkout, hỏi người dùng trước)'}` : 'máy này không thấy repo git ở thư mục đó';
      L.push(`- Git: ${a}; ${b}.`);
    }
    L.push('- Nội dung tệp đã đọc / sửa ở máy cũ có thể khác bản ở máy này — đọc lại trước khi sửa.', NOTE_B);
    return L.join('\n');
  }
  function moveNote(conv, content) {
    const I = conv && !conv.child && IMP[conv.sid];
    if (!I || I.noted) return content;
    I.noted = true;
    api.sessNoted(conv.sid);
    const note = moveText(I) + '\n\n';
    if (typeof content === 'string') return note + content;
    const arr = [...content];
    const i = arr.findIndex((b) => b.type === 'text');
    if (i >= 0) arr[i] = { ...arr[i], text: note + arr[i].text }; else arr.unshift({ type: 'text', text: note.trim() });
    return arr;
  }
  // dòng thông báo khi mở phiên đã nhập
  function importedNote(sid) {
    const I = IMP[sid];
    if (!I) return '';
    const dir = I.oldCwd && low(I.oldCwd) !== low(I.cwd) ? ` · thư mục ${I.oldCwd} → ${I.cwd}` : '';
    return `📦 Phiên nhập từ máy ${I.from.host} lúc ${fmtT(I.t)}${dir}.` + (I.noted ? '' : ' Tin nhắn tiếp theo sẽ tự kèm ghi chú chuyển máy để Claude dùng đường dẫn ở máy này.')
      + (I.git && I.hasCommit === false ? ` ⚠ Máy này chưa có commit ${String(I.git.head).slice(0, 8)} (nhánh ${I.git.branch}).` : '');
  }

  CG.pack = { exportPlan, importPlan, banner, _rootsOf: rootsOf, _finish: finish, exportSession, importSession, moveNote, importedNote, _imp: () => IMP };
})();
