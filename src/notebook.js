'use strict';
// Sổ tài liệu theo phiên (khung bên phải): hỏi nhanh tài liệu / design bằng model rẻ (mặc định Haiku · low).
// Trả lời chỉ trong phạm vi tài liệu đã gắn, kèm trích dẫn — kiểu NotebookLM.
// - Mỗi phiên chính có một phiên CLI "sổ" riêng: ẩn khỏi danh sách phiên nhưng vẫn ghi jsonl như mọi phiên.
// - Tài liệu nằm trong THƯ VIỆN dùng chung (userData/notebook/library.json): phiên khác tìm lại được ngay (miễn phí),
//   không phải nhờ agent đi tìm từ đầu. Không có thì sổ báo không có và xin người dùng tài liệu.
// - Phiên sổ chạy gọn cho rẻ: chỉ Read/Grep/Glob, chỉ nạp MCP mà nguồn cần (--strict-mcp-config), bỏ tool MCP dạng ghi,
//   system prompt riêng, không plugin, không gợi ý câu tiếp.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, $$, h, svg, icon, toast, menu, modal, promptDialog, confirmDialog, basename, dirname, relTime } = CG;
  const S = CG.S;

  // Tool MCP dạng ghi/sinh nội dung → bỏ khỏi phiên sổ (vừa an toàn vừa bớt token mô tả công cụ)
  const WRITE_RE = /^(create|update|delete|remove|upload|send|generate|add|set|use|export|import|html_to|weave|download|write|edit|post|put|patch|move|rename|run|execute|install|uninstall|play|stop|save|assign|apply|duplicate|parent|publish|submit|invoke)/i;
  const KEEP_RE = /^(create_session)$/;
  const FIGMA_DENY = ['add_code_connect_map', 'create_generative_plugin', 'create_new_file', 'create_shader', 'download_assets', 'export_video', 'generate_diagram',
    'generate_figma_design', 'generate_image', 'get_code_connect_map', 'get_code_connect_suggestions', 'get_context_for_code_connect', 'get_generative_plugin',
    'get_libraries', 'get_motion_context', 'get_shader', 'html_to_figma', 'list_file_shaders', 'list_generative_plugins', 'list_shaders', 'search_design_system',
    'send_code_connect_mappings', 'send_code_to_figma', 'update_generative_plugin', 'update_shader', 'upload_assets', 'use_figma', 'weave_cancel_tool_run',
    'weave_find_model', 'weave_get_model_run_output', 'weave_get_tool_inputs', 'weave_get_tool_run_output', 'weave_list_tools', 'weave_run_model', 'weave_run_tool', 'weave_upload_asset'];
  const MODELS = [['haiku', 'low', 'Haiku · low', 'Rẻ nhất — đủ cho tra cứu'], ['haiku', 'medium', 'Haiku · medium', ''], ['sonnet', 'low', 'Sonnet · low', 'Khi tài liệu khó hiểu'], ['sonnet', 'medium', 'Sonnet · medium', '']];
  const SEP = '\n\n---\n';
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isWin = (p) => /^[a-zA-Z]:[\\/]/.test(p || '');

  const NB = { ready: false, map: {}, lib: { topics: [] }, servers: null, cur: null, find: null, cands: null, stick: true, stat: {}, statT: 0 };

  // ---------- Lưu trữ ----------
  let saveT = 0, libT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => CG.saveSettings({ nb: NB.map }), 300); }
  function saveLib() { clearTimeout(libT); libT = setTimeout(() => api.nbLib('set', NB.lib), 200); }
  function ent(sid, create) {
    if (!sid) return null;
    let e = NB.map[sid];
    if (!e && create) e = NB.map[sid] = { sid: '', topics: [], open: false, view: 'qa', cost: 0, n: 0, t: Date.now() };
    return e;
  }
  const topic = (id) => NB.lib.topics.find((t) => t.id === id);
  const topicsOf = (e) => (e ? e.topics.map(topic).filter(Boolean) : []);
  const sourcesOf = (e) => topicsOf(e).flatMap((t) => t.sources || []);
  const parentConv = () => (S.active && !S.active.nb ? S.active : null);
  const convOf = (e) => (e && e.sid ? CG.app.convs().find((c) => c.sid === e.sid) : null);
  function hiddenSids() { const s = new Set(); for (const e of Object.values(NB.map)) { if (e.sid) s.add(e.sid); for (const a of e.alts || []) s.add(a); } return s; }
  function shownConv() {
    if (!NB.ready) return null;
    const e = ent(NB.cur);
    return e && e.open && (e.view || 'qa') === 'qa' ? convOf(e) : null;
  }
  // server MCP "tài liệu" dùng khi nhờ agent tìm (mặc định: gdd, figma, hoặc tên có doc/design/wiki…)
  function docServers() {
    const all = (NB.servers || []).map((s) => s.name);
    if (Array.isArray(S.settings.nbServers)) return S.settings.nbServers.filter((n) => all.includes(n));
    return all.filter((n) => /gdd|doc|design|wiki|notion|confluence|spec/i.test(n) && !/figma/i.test(n));
  }
  const figmaServer = () => ((NB.servers || []).find((s) => /figma\.com/i.test(s.url) || /figma/i.test(s.name)) || {}).name || 'figma';

  // ---------- Nguồn ----------
  const SRC_IC = { file: '📄', dir: '📁', gdd: '🎮', figma: '🎨', url: '🌐', ref: '🔌', text: '📋' };
  function srcLabel(s) {
    if (s.type === 'file') return s.title || basename(s.path);
    if (s.type === 'dir') return basename(s.path) + '/';
    if (s.type === 'gdd') return s.title || s.page || s.project;
    if (s.type === 'figma') return s.title || ('Figma ' + (s.nodeId || s.fileKey || ''));
    return s.title || s.url || s.ref || '?';
  }
  function srcLine(s, i) {
    const n = `[S${i + 1}]`;
    if (s.type === 'file') return `${n} Tệp: ${s.path}${s.title ? ` (${s.title})` : ''} — dùng Grep/Read`;
    if (s.type === 'dir') return `${n} Thư mục: ${s.path} — Glob **/*.md rồi Grep/Read`;
    if (s.type === 'gdd') return `${n} MCP ${s.server}: dự án "${s.project}"${s.page ? `, trang "${s.page}"` : ''}${s.title ? ` (${s.title})` : ''}${s.sha ? `, known_sha=${s.sha}` : ''} — search/find_in_page rồi read_page theo section/offset`;
    if (s.type === 'figma') return `${n} MCP ${s.server} (Figma): ${s.url || ''}${s.fileKey ? ` fileKey=${s.fileKey}` : ''}${s.nodeId ? ` nodeId=${s.nodeId}` : ''} — get_metadata trước, get_design_context khi cần chi tiết`;
    if (s.type === 'url') return `${n} Web: ${s.url} — WebFetch`;
    return `${n} MCP ${s.server || '?'}: ${s.ref}`;
  }
  function parseRef(text, server) {
    const t = String(text || '').trim();
    const fm = /figma\.com\/(?:design|file|board|make|proto)\/([\w-]+)(?:\/branch\/([\w-]+))?[^?]*(?:\?[^#]*node-id=([\d-:%A-Za-z]+))?/i.exec(t);
    if (fm) return { type: 'figma', server: figmaServer(), url: t, fileKey: fm[2] || fm[1], nodeId: fm[3] ? decodeURIComponent(fm[3]).replace('-', ':') : '', title: '' };
    if (/^https?:\/\//i.test(t) && !server) return { type: 'url', url: t };
    if (isWin(t) || t.startsWith('\\\\')) return { type: /\.\w{1,6}$/.test(t) ? 'file' : 'dir', path: t };
    const gm = /^([\w-]+)\s*[:/›>]\s*(.+)$/.exec(t);
    if ((server || '').toLowerCase().includes('gdd') && gm) return { type: 'gdd', server, project: gm[1], page: gm[2].trim(), title: '' };
    return { type: 'ref', server: server || '', ref: t };
  }

  // ---------- Quy tắc của phiên sổ (system prompt riêng, ghi một lần cho cả phiên) ----------
  function rules(cwd) {
    return [
      'Bạn là "Sổ tài liệu" trong Claude GUI — trợ lý tra cứu CHỈ ĐỌC, hoạt động như NotebookLM.',
      `Thư mục dự án: ${cwd}. Hôm nay: ${new Date().toISOString().slice(0, 10)}.`,
      'Quy tắc:',
      '1. Chỉ trả lời dựa trên các nguồn trong khối [Nguồn của sổ] gần nhất và các ghi chú đã ghim đi kèm. Không dùng kiến thức ngoài, không đoán, không bịa.',
      '2. Tra đúng chỗ cần, KHÔNG đọc cả tài liệu: Grep rồi Read có offset/limit; gdd: search hoặc find_in_page rồi read_page theo section/offset, luôn truyền known_sha nếu có; Figma: get_metadata trước, get_design_context khi cần chi tiết.',
      '3. Mỗi ý trong câu trả lời gắn số trích dẫn [1], [2]… Cuối câu trả lời có một dòng "Nguồn:" rồi mỗi dòng dạng: [n] <tên nguồn> › <vị trí: mục / đường-dẫn-tuyệt-đối:dòng / frame> — "<trích nguyên văn ngắn>".',
      '4. Không có trong nguồn → câu đầu tiên đúng là "Không có trong tài liệu." rồi gợi ý tài liệu nào có thể có. Có một phần → trả lời phần có và ghi rõ phần nào không có trong tài liệu.',
      '5. Các nguồn mâu thuẫn nhau → bắt đầu bằng "⚠ Mâu thuẫn:" và nêu từng bên kèm trích dẫn; không tự chọn bên nào.',
      '6. gdd báo tài liệu đã đổi (khối stale) → thêm dòng đầu "⚠ Tài liệu đã đổi: <trang>" rồi dùng bản mới.',
      '7. Khối [Phiên chính đang làm] chỉ là ngữ cảnh để hiểu câu hỏi, không phải nguồn.',
      '8. Ngắn gọn, đi thẳng vào câu hỏi, cùng ngôn ngữ với câu hỏi. Không sửa tệp, không chạy lệnh.',
      '9. Khi được nhờ [Tìm tài liệu]: chỉ xác định nguồn (trang/tệp/frame cụ thể), không đọc toàn văn, và kết thúc bằng khối ```nb-sources như yêu cầu.',
    ].join('\n');
  }
  function denyFor(servers) {
    const learned = S.settings.nbDeny || [];
    const out = [];
    for (const n of servers) {
      if (n === figmaServer()) for (const t of FIGMA_DENY) out.push(`mcp__${n}__${t}`);
      for (const t of learned) if (t.startsWith(`mcp__${n}__`)) out.push(t);
    }
    return [...new Set(out)];
  }
  function applySpawn(conv, e, searching) {
    // luôn có máy chủ tài liệu (gdd…) + máy chủ sổ đã từng dùng (lưu trong e.servers — khởi động lại app vẫn còn);
    // thiếu thì CLI gỡ công cụ khỏi phiên ("not_configured") và sổ không hỏi lại gdd được nữa
    const servers = new Set([...(e.servers || []), ...(conv.nbServers || []), ...docServers()]);
    const dirs = new Set(); let web = false;
    for (const s of sourcesOf(e)) {
      if (s.server) servers.add(s.server);
      if (s.type === 'file' && s.path) dirs.add(dirname(s.path));
      if (s.type === 'dir' && s.path) dirs.add(s.path);
      if (s.type === 'url') web = true;
    }
    if (searching) for (const n of docServers()) servers.add(n);
    const known = NB.servers ? new Set(NB.servers.map((x) => x.name)) : null;
    const ms = [...servers].filter((n) => n && (!known || known.has(n))).sort();
    conv.nbServers = ms; // chỉ thêm, không bớt — tránh khởi động lại phiên liên tục
    if (ms.some((n) => !(e.servers || []).includes(n))) { e.servers = [...new Set([...(e.servers || []), ...ms])]; save(); }
    const cwdL = (conv.cwd || '').toLowerCase();
    const addDirs = [...dirs].filter((d) => d && !d.toLowerCase().startsWith(cwdL));
    const opts = { lean: true, tools: ['Read', 'Grep', 'Glob', ...(web ? ['WebFetch'] : [])], mcpServers: ms, disallowedTools: denyFor(ms), systemPrompt: rules(conv.cwd) };
    const sig = JSON.stringify([opts.tools, ms, opts.disallowedTools, addDirs, conv.effort]);
    if (conv.nbSig !== sig) {
      conv.spawnOpts = opts;
      conv.allowedTools = [...ms.map((n) => 'mcp__' + n), ...(web ? ['WebFetch'] : [])];
      conv.addDirs = addDirs;
      if (conv.nbSig) conv.respawn = true;
      conv.nbSig = sig;
    }
  }
  function mark(c, parentSid) { c.nb = true; c.nbParent = parentSid; return c; }
  async function ensureConv(e, parentSid) {
    let c = convOf(e);
    if (c) return mark(c, parentSid);
    const p = parentConv();
    if (e.sid && e.ok) {
      // phiên sổ cũ (đã có lịch sử) → nạp lại, hiện các câu hỏi đáp trước
      c = await CG.app.openSession({ id: e.sid, cwd: e.cwd || (p && p.cwd), title: '📚 Sổ tài liệu' }, { background: true, onCreate: (x) => mark(x, parentSid) });
      if (c) { mark(c, parentSid); c.model = S.settings.nbModel || 'haiku'; c.effort = S.settings.nbEffort || 'low'; tidyAll(c); return c; }
    }
    if (!p) return null;
    c = await CG.app.createConv({ cwd: p.cwd, model: S.settings.nbModel || 'haiku', effort: S.settings.nbEffort || 'low', mode: 'default', title: '📚 Sổ · ' + (p.title || 'phiên') });
    mark(c, parentSid);
    e.sid = c.sid; e.cwd = c.cwd; e.ok = false;
    save();
    return c;
  }

  // ---------- Hỏi ----------
  function sourceBlock(e) {
    const tps = topicsOf(e);
    const lines = ['[Nguồn của sổ — chỉ trả lời trong phạm vi các nguồn này]'];
    let i = 0;
    for (const t of tps) {
      lines.push(`Tài liệu: ${t.name}${t.aliases && t.aliases.length ? ` (còn gọi: ${t.aliases.join(', ')})` : ''}`);
      for (const s of t.sources || []) lines.push('  ' + srcLine(s, i++));
    }
    const notes = tps.flatMap((t) => (t.notes || []).map((n) => ({ ...n, tp: t.name }))).slice(-12);
    if (notes.length) {
      lines.push('', 'Ghi chú đã ghim (câu trả lời đã kiểm chứng trước đây — dùng lại được, vẫn ghi nguồn gốc):');
      for (const n of notes) lines.push(`- H: ${n.q}\n  Đ: ${String(n.a).replace(/\s+/g, ' ').slice(0, 500)}`);
    }
    return lines.join('\n');
  }
  function mainCtx(p) {
    if (!p || S.settings.nbMainCtx === false) return '';
    const b = [...p.root.querySelectorAll('.msg-user .bubble')].pop();
    const last = b ? b.textContent.replace(/\s+/g, ' ').slice(0, 400) : '';
    return `[Phiên chính đang làm] ${p.title || ''}${last ? `\nTin nhắn gần nhất: ${last}` : ''}`;
  }
  const topicsSig = (e) => JSON.stringify(topicsOf(e).map((t) => [t.id, (t.sources || []).length, (t.notes || []).length, t.updated || 0]));
  async function ask(q, o = {}) {
    const sid = NB.cur, e = ent(sid, true);
    q = String(q || '').trim();
    if (!q) return;
    if (!topicsOf(e).length && !o.search) { e.open = true; e.view = 'docs'; render(); return find(q); }
    const c = await ensureConv(e, sid);
    if (!c) return toast('Chưa mở phiên nào.');
    const ctx = [];
    const sig = topicsSig(e);
    if (topicsOf(e).length && (e.sent !== sig || !c.started || o.resend)) { ctx.push(sourceBlock(e)); e.sent = sig; }
    const mc = o.search ? '' : mainCtx(parentConv());
    if (mc) ctx.push(mc);
    if (o.extra) ctx.push(o.extra);
    applySpawn(c, e, !!o.search);
    c.nbQ = o.display || q;
    c.nbSearch = o.search || null;
    if (o.model && o.model !== c.model) {
      c.nbRestore = c.model;
      c.model = o.model;
      if (await api.running(c.key)) c.control({ subtype: 'set_model', model: o.model });
    }
    e.view = 'qa'; e.open = true; e.n = (e.n || 0) + 1; e.t = Date.now();
    NB.stick = true;
    save();
    render();
    c.send(ctx.length ? q + SEP + ctx.join('\n\n') : q, o.display || q);
  }
  function searchMcp(q) {
    const e = ent(NB.cur, true);
    const srv = docServers();
    if (!srv.length) return toast('Chưa có máy chủ MCP tài liệu nào (⋯ → Máy chủ MCP dùng để tìm).', true);
    const local = NB.find && NB.find.q === q && NB.find.files ? NB.find.files.length : 0;
    const prompt = [`[Tìm tài liệu] Tìm tài liệu về: "${q}"`,
      `Máy chủ MCP được dùng: ${srv.join(', ')}. ${local ? `(Đã tìm thấy ${local} tệp .md trong dự án — không cần tìm lại tệp.)` : 'Tệp .md trong dự án đã quét: không thấy.'}`,
      'Cách tìm: gdd → list_projects rồi search(query) trong dự án phù hợp; các MCP khác dùng công cụ tìm/liệt kê của nó. Figma chỉ dùng khi đã có link.',
      'Chỉ xác định nguồn cụ thể (trang/frame), KHÔNG đọc toàn văn. Trả lời ngắn danh sách nguồn tìm được, rồi kết thúc bằng đúng một khối:',
      '```nb-sources',
      '[{"type":"gdd","server":"<tên server>","project":"<slug>","page":"<path trang>","title":"<tiêu đề>","sha":"<release.sha>","why":"<vì sao liên quan>"}]',
      '```',
      'type là "gdd" cho trang tài liệu của MCP kiểu gdd, "figma" (kèm url/fileKey/nodeId) hoặc "ref" (kèm "ref") cho MCP khác. Xếp nguồn liên quan nhất lên đầu, tối đa 8. Không tìm thấy thì để [].'].join('\n');
    NB.cands = { q, list: null, busy: true };
    ask(prompt, { search: q, display: `🔍 Tìm tài liệu: ${q}` });
  }

  // ---------- Tìm trong thư viện + tệp .md của dự án (tại máy, không tốn lượt) ----------
  function searchLib(q) {
    const terms = fold(q).split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 1);
    const cwd = ((parentConv() || {}).cwd || '').toLowerCase();
    const out = [];
    for (const t of NB.lib.topics) {
      const name = fold([t.name, ...(t.aliases || [])].join(' '));
      const more = fold((t.sources || []).map(srcLabel).join(' ') + ' ' + (t.summary || ''));
      let sc = 0;
      for (const w of terms) { if (name.includes(w)) sc += 3; else if (more.includes(w)) sc += 1; }
      if (terms.length > 1 && name.includes(terms.join(' '))) sc += 5;
      if (!terms.length) sc = 1;
      if ((t.dirs || []).some((d) => d.toLowerCase() === cwd)) sc += 0.5;
      if (sc >= Math.max(1, terms.length)) out.push({ t, sc });
    }
    return out.sort((a, b) => b.sc - a.sc || (b.t.updated || 0) - (a.t.updated || 0)).map((x) => x.t);
  }
  async function find(q) {
    q = String(q || '').trim();
    const e = ent(NB.cur, true);
    e.open = true; e.view = 'docs';
    if (!q) { NB.find = null; render(); return; }
    const p = parentConv();
    const r = NB.find = { q, lib: searchLib(q), files: null, sel: new Set() };
    render();
    const sc = p && p.cwd ? await api.nbScan(p.cwd, q) : { list: [] };
    if (NB.find !== r) return;
    r.files = (sc.list || []).slice(0, 15); r.total = sc.total || 0;
    r.files.slice(0, 3).forEach((f) => r.sel.add(f.path));
    render();
  }

  // ---------- Chủ đề / thư viện ----------
  function newTopic(name, sources) {
    const p = parentConv();
    const t = { id: uid(), name: name || 'Tài liệu', aliases: [], sources: sources || [], notes: [], questions: [], dirs: p && p.cwd ? [p.cwd] : [], created: Date.now(), updated: Date.now() };
    NB.lib.topics.push(t);
    saveLib();
    return t;
  }
  function attach(t) {
    const e = ent(NB.cur, true);
    if (!e.topics.includes(t.id)) e.topics.push(t.id);
    const p = parentConv();
    if (p && p.cwd && !(t.dirs || []).some((d) => d.toLowerCase() === p.cwd.toLowerCase())) { (t.dirs = t.dirs || []).push(p.cwd); saveLib(); }
    t.used = Date.now();
    e.view = 'qa'; NB.find = null;
    save(); saveLib(); render();
    toast(`Đã gắn tài liệu “${t.name}” — hỏi gì cũng được.`);
  }
  function detach(t) { const e = ent(NB.cur); if (!e) return; e.topics = e.topics.filter((x) => x !== t.id); save(); render(); }
  // thêm nguồn vào chủ đề: chủ đề chỉ định → chủ đề duy nhất đang gắn → tạo mới theo từ khoá đang tìm
  async function addSources(list, tp) {
    list = list.filter(Boolean);
    if (!list.length) return;
    const e = ent(NB.cur, true);
    let t = tp;
    if (!t) {
      const tps = topicsOf(e);
      if (NB.find && NB.find.q) t = null;
      else if (tps.length === 1) t = tps[0];
    }
    if (!t) {
      const name = (NB.find && NB.find.q) || (await promptDialog('Tên tài liệu (tính năng / chủ đề)', '', 'vd: Loạn chiến cửu châu'));
      if (!name) return;
      t = newTopic(name, []);
    }
    for (const s of list) {
      if (s.type === 'file' || s.type === 'dir') { const st = (await api.nbStat([s.path]))[s.path]; if (st) s.mtime = st.mtime; }
      s.added = Date.now();
      if (!(t.sources || []).some((x) => JSON.stringify({ ...x, added: 0, mtime: 0 }) === JSON.stringify({ ...s, added: 0, mtime: 0 }))) t.sources.push(s);
    }
    t.updated = Date.now();
    saveLib();
    attach(t);
  }
  async function pickFiles(tp) { const fs = await api.pickFiles({ title: 'Chọn tài liệu (.md, .txt…)', dir: (parentConv() || {}).cwd }); if (fs && fs.length) addSources(fs.map((f) => ({ type: 'file', path: f })), tp); }
  async function pickDir(tp) { const d = await api.pickDir((parentConv() || {}).cwd); if (d) addSources([{ type: 'dir', path: d }], tp); }
  function refDialog(tp) {
    const servers = NB.servers || [];
    const inp = h('input', { type: 'text', class: 'text-input', placeholder: 'Link Figma, trang gdd (vd genz/docs/08-pvp/loan-chien-cuu-chau.html), URL…' });
    const sel = h('select', { class: 'text-input' }, h('option', { value: '' }, 'Tự nhận (Figma link / URL web)'), servers.map((s) => h('option', { value: s.name }, `MCP: ${s.name}`)));
    const gs = servers.find((s) => /gdd/i.test(s.name));
    const m = modal('Thêm nguồn từ link / MCP', h('div', { class: 'nb-form' },
      h('label', {}, 'Link hoặc tham chiếu', inp),
      h('label', {}, 'Lấy qua', sel),
      h('div', { class: 'nb-muted' }, 'Trang gdd: ghi "<dự án>/<đường dẫn trang>" và chọn MCP gdd. Không chắc đường dẫn thì chỉ cần ghi tên trang — sổ sẽ tự tìm trong MCP đó khi hỏi.')), [
      h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }),
      h('button', { class: 'btn primary', text: 'Thêm', onclick: () => { const v = inp.value.trim(); if (!v) return; m.close(); addSources([parseRef(v, sel.value)], tp); } }),
    ]);
    inp.addEventListener('input', () => { if (gs && !/^https?:|^[a-zA-Z]:/.test(inp.value) && inp.value.includes('/') && !sel.value) sel.value = gs.name; });
    setTimeout(() => inp.focus(), 30);
  }
  function pasteDialog(tp) {
    const title = h('input', { type: 'text', class: 'text-input', placeholder: 'Tiêu đề (vd: Luật chơi Loạn chiến — bản designer gửi)' });
    const ta = h('textarea', { class: 'text-input', rows: 12, placeholder: 'Dán nội dung tài liệu vào đây…' });
    const m = modal('Dán nội dung tài liệu', h('div', { class: 'nb-form' }, title, ta), [
      h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }),
      h('button', { class: 'btn primary', text: 'Lưu', onclick: async () => {
        const text = ta.value.trim(); if (!text) return;
        const r = await api.nbLib('text', { id: uid(), text: (title.value ? `# ${title.value}\n\n` : '') + text });
        m.close();
        if (r.ok) addSources([{ type: 'file', path: r.path, title: title.value || 'Nội dung đã dán', pasted: true }], tp);
      } }),
    ], { cls: 'wide' });
    setTimeout(() => title.focus(), 30);
  }
  const addMenuItems = (tp) => [
    { label: 'Tệp tài liệu…', desc: '.md, .txt, .json…', icon: 'file', onClick: () => pickFiles(tp) },
    { label: 'Cả thư mục…', desc: 'mọi tệp .md bên trong', icon: 'folder', onClick: () => pickDir(tp) },
    { label: 'Link Figma / trang gdd / MCP…', icon: 'globe', onClick: () => refDialog(tp) },
    { label: 'Dán nội dung…', icon: 'copy', onClick: () => pasteDialog(tp) },
  ];

  // ---------- Câu trả lời: trích dẫn bấm được + nút thao tác ----------
  function turnRaw(turn) { return $$('.md[data-raw]', turn).filter((x) => x.parentElement === turn).map((x) => x.dataset.raw).join('\n\n'); }
  function parseCites(raw) {
    const map = {};
    const i = raw.search(/^\s*\**\s*Nguồn\s*\**\s*:?\s*\**\s*$/im);
    const tail = i >= 0 ? raw.slice(i) : raw;
    for (const m of tail.matchAll(/^\s*[-*]?\s*\[(\d{1,2})\]\s*(.+)$/gm)) map[m[1]] = m[2].trim();
    return map;
  }
  function linkCites(md, cites) {
    if (md._nbHtml === md.innerHTML) return;
    const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('code,pre,.nb-cite') ? NodeFilter.FILTER_REJECT : /\[\d{1,2}\]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      let last = 0;
      const v = n.nodeValue;
      for (const m of v.matchAll(/\[(\d{1,2})\]/g)) {
        if (!cites[m[1]]) continue;
        frag.append(v.slice(last, m.index));
        frag.append(h('span', { class: 'nb-cite', 'data-n': m[1], title: cites[m[1]], text: m[1], onclick: (ev) => citePop(ev.currentTarget, m[1], cites[m[1]]) }));
        last = m.index + m[0].length;
      }
      if (!last) continue;
      frag.append(v.slice(last));
      n.replaceWith(frag);
    }
    // danh sách "Nguồn:" cuối câu trả lời → chữ nhỏ
    for (const el of $$('p, li', md)) {
      if (/^\s*\**Nguồn\**\s*:?\s*$/i.test(el.textContent)) { el.classList.add('nb-srchead'); const nx = el.nextElementSibling; if (nx) nx.classList.add('nb-srclist'); }
      else if (/^\s*\**Nguồn\**\s*:/i.test(el.textContent) && !el.classList.contains('nb-srclist')) {
        el.classList.add('nb-srclist');
        $$('.nb-cite', el).forEach((c) => { const prev = c.previousSibling; if (!(prev && prev.nodeName === 'BR')) c.before(h('br')); });
      }
    }
    md._nbHtml = md.innerHTML;
  }
  function citePop(anchor, n, text) {
    const pm = /([a-zA-Z]:[\\/][^:"*?<>|\n]+?\.[\w]{1,8})(?::(\d+))?/.exec(text);
    CG.popover(anchor, (el, close) => {
      el.classList.add('nb-pop');
      el.append(...[h('div', { class: 'nb-pop-h' }, h('span', { class: 'nb-cite', text: n }), h('span', { class: 'ellipsis', text: 'Nguồn trích dẫn' })),
        h('div', { class: 'nb-pop-b', text }),
        pm ? h('button', { class: 'btn sm', onclick: () => { close(); CG.viewer.openFile(pm[1], pm[2] ? +pm[2] : 0); } }, icon('file', 13), ' Mở tệp gốc' + (pm[2] ? ` (dòng ${pm[2]})` : '')) : null].filter(Boolean));
    });
  }
  function questionOf(turn) {
    let el = turn.previousElementSibling;
    while (el && !el.classList.contains('msg-user')) el = el.previousElementSibling;
    const b = el && el.querySelector('.bubble');
    return b ? b.textContent.split(SEP)[0].trim() : '';
  }
  function enhance(conv, turn, final) {
    if (!turn) return;
    const raw = turnRaw(turn);
    if (!raw) return;
    const cites = parseCites(raw);
    for (const md of $$('.md[data-raw]', turn)) if (md.parentElement === turn && !md.classList.contains('streaming')) linkCites(md, cites);
    if (!final || turn._nbActs) return;
    turn._nbActs = true;
    const q = turn._nbQ || questionOf(turn);
    if (/^\s*\[Tìm tài liệu\]|^🔍/.test(q)) return;
    const none = /^\s*\**\s*Không có trong tài liệu/i.test(raw), conflict = /⚠\s*Mâu thuẫn/i.test(raw), changed = /⚠\s*Tài liệu đã đổi/i.test(raw);
    turn.classList.toggle('nb-none', none);
    turn.classList.toggle('nb-conflict', conflict);
    const e = ent(conv.nbParent);
    const bar = h('div', { class: 'nb-acts' },
      h('button', { class: 'btn sm', title: 'Đưa câu trả lời + nguồn vào ô nhập của phiên chính', onclick: () => insertToMain(q, raw) }, '↩ Chèn vào chat'),
      none ? null : h('button', { class: 'btn sm', title: 'Lưu vào ghi chú của tài liệu — phiên sau hỏi lại không tốn lượt', onclick: (ev) => pin(e, q, raw, ev.currentTarget) }, '📌 Ghim'),
      h('button', { class: 'btn sm' + (none || conflict ? ' nb-hot' : ''), title: 'Ghi thành câu hỏi cần designer / người viết tài liệu trả lời', onclick: (ev) => addQuestion(e, q, raw, none ? 'none' : conflict ? 'conflict' : 'ask', ev.currentTarget) }, '❓ Câu hỏi mở'),
      conv.model === 'sonnet' || turn._nbAlt ? null : h('button', { class: 'btn sm', title: 'Hỏi lại câu này bằng Sonnet trong một phiên riêng chỉ mang tài liệu + câu hỏi (không kéo theo lịch sử sổ nên rẻ hơn)', onclick: () => reask(conv, q, 'sonnet') }, '↻ Sonnet'),
      none ? h('button', { class: 'btn sm', title: 'Thêm tài liệu cho phần còn thiếu', onclick: (ev) => menu(ev.currentTarget, addMenuItems(null)) }, '+ Tài liệu') : null);
    turn.append(bar);
    if (changed) turn.classList.add('nb-changed');
  }
  async function reask(nbc, q, model) {
    const sid = nbc.nbParent, e = ent(sid);
    const p = parentConv();
    if (!e || !p) return;
    const c = await CG.app.createConv({ cwd: nbc.cwd, model, effort: 'low', mode: 'default', title: '📚 Sổ · hỏi lại' });
    mark(c, sid);
    (e.alts = e.alts || []).push(c.sid);
    if (e.alts.length > 20) e.alts = e.alts.slice(-20);
    applySpawn(c, e, false);
    const label = model[0].toUpperCase() + model.slice(1);
    nbc.renderUser(`${q}  · ↻ ${label}`);
    const turn = h('div', { class: 'turn' }, h('div', { class: 'note', text: `${label} đang tra lại trong phiên riêng…` }));
    nbc.append(turn);
    c.nbAlt = { nbc, turn, q, label };
    save();
    c.send(q + SEP + [sourceBlock(e), mainCtx(p)].filter(Boolean).join('\n\n'), q);
  }
  function tidyAll(conv) {
    // phiên sổ nạp từ lịch sử: ẩn khối nguồn/ngữ cảnh gửi kèm câu hỏi, gắn trích dẫn và nút cho câu trả lời cũ
    setTimeout(() => {
      for (const b of $$('.msg-user .bubble', conv.root)) {
        const t = b.textContent, i = t.indexOf(SEP);
        if (i > 0) { b.textContent = t.slice(0, i); b.title = t.slice(i + SEP.length); }
      }
      for (const t of $$('.turn', conv.root)) enhance(conv, t, true);
    }, 300);
  }
  function insertToMain(q, raw) {
    if (!parentConv()) return;
    CG.app.insertText(`\n[Theo sổ tài liệu] ${q}\n${raw.trim()}\n`);
    toast('Đã chèn vào ô nhập của phiên chính.');
  }
  function chooseTopic(e, anchor, cb) {
    const tps = topicsOf(e);
    if (tps.length <= 1) return cb(tps[0]);
    menu(anchor, [{ header: 'Lưu vào tài liệu' }, ...tps.map((t) => ({ label: t.name, icon: 'book', onClick: () => cb(t) }))]);
  }
  function pin(e, q, raw, anchor) {
    chooseTopic(e, anchor, (t) => {
      if (!t) return toast('Chưa gắn tài liệu nào.');
      (t.notes = t.notes || []).push({ id: uid(), q, a: raw.trim(), t: Date.now() });
      t.updated = Date.now(); saveLib(); render();
      if (anchor) { anchor.textContent = '✓ Đã ghim'; anchor.disabled = true; }
    });
  }
  function addQuestion(e, q, raw, kind, anchor) {
    chooseTopic(e, anchor, (t) => {
      if (!t) return toast('Chưa gắn tài liệu nào.');
      (t.questions = t.questions || []).push({ id: uid(), q, kind, a: raw.trim().slice(0, 1500), t: Date.now(), done: false });
      t.updated = Date.now(); saveLib(); render();
      if (anchor) { anchor.textContent = '✓ Đã ghi câu hỏi'; anchor.disabled = true; }
    });
  }

  // ---------- Hook từ app.js ----------
  let enT = 0;
  function afterRender(conv) {
    if (conv !== shownConv()) return;
    if (NB.stick) requestAnimationFrame(() => { const sc = $('#nb-scroller'); sc.scrollTop = sc.scrollHeight; });
    clearTimeout(enT);
    enT = setTimeout(() => { const t = [...$$('.turn', conv.root)].pop(); enhance(conv, t, false); }, 120);
  }
  function onBusy(conv) {
    if (NB.ready && conv.nbParent === NB.cur) { renderHead(ent(NB.cur)); updateComposer(); }
  }
  function onInit(conv, m) {
    // học tên các tool MCP dạng ghi để lần chạy sau bỏ khỏi phiên sổ
    const deny = new Set(S.settings.nbDeny || []);
    const n0 = deny.size;
    for (const t of m.tools || []) {
      const mm = /^mcp__(.+?)__(.+)$/.exec(t);
      if (mm && WRITE_RE.test(mm[2]) && !KEEP_RE.test(mm[2])) deny.add(t);
    }
    if (deny.size !== n0) CG.saveSettings({ nbDeny: [...deny] });
  }
  function onResult(conv, m, failed) {
    const e = ent(conv.nbParent);
    if (!e) return;
    if (conv.nbAlt) {
      // câu trả lời của phiên hỏi-lại → đưa vào khung sổ như một câu trả lời thường
      const { nbc, turn, label } = conv.nbAlt;
      const add = (conv.cost || 0) - (conv.nbCost0 || 0);
      if (add > 0) { e.cost = (e.cost || 0) + add; conv.nbCost0 = conv.cost; }
      const raw = (typeof m.result === 'string' && m.result.trim()) || turnRaw([...$$('.turn', conv.root)].pop() || h('div'));
      turn.innerHTML = '';
      turn._nbAlt = true;
      turn._nbQ = conv.nbAlt.q;
      if (failed || !raw) turn.append(h('div', { class: 'errbox', text: `${label} không trả lời được.` }));
      else { turn.append(CG.mdEl(raw), h('div', { class: 'nb-muted', text: `↻ ${label} · $${add.toFixed(4)}` })); enhance(nbc, turn, true); }
      if (NB.stick && nbc === shownConv()) requestAnimationFrame(() => { const sc = $('#nb-scroller'); sc.scrollTop = sc.scrollHeight; });
      api.stop(conv.key);
      save();
      if (conv.nbParent === NB.cur) render();
      return;
    }
    if (!failed) e.ok = true;
    const add = (conv.cost || 0) - (conv.nbCost0 || 0);
    if (add > 0) { e.cost = (e.cost || 0) + add; conv.nbCost0 = conv.cost; }
    if (conv.nbRestore) { const back = conv.nbRestore; conv.nbRestore = null; conv.model = back; conv.control({ subtype: 'set_model', model: back }); }
    const turn = [...$$('.turn', conv.root)].pop();
    if (turn) turn._nbQ = conv.nbQ;
    if (conv.nbSearch) {
      const q = conv.nbSearch;
      conv.nbSearch = null;
      const text = (typeof m.result === 'string' && m.result) || (turn ? turnRaw(turn) : '');
      const mm = /```nb-sources\s*([\s\S]*?)```/.exec(text);
      let list = [];
      try { list = mm ? JSON.parse(mm[1]) : []; } catch { list = []; }
      list = (Array.isArray(list) ? list : []).filter((x) => x && (x.page || x.ref || x.url || x.fileKey || x.project)).slice(0, 10);
      for (const x of list) { if (!x.server) x.server = x.type === 'figma' ? figmaServer() : docServers()[0]; if (!['gdd', 'figma', 'ref', 'url'].includes(x.type)) x.type = 'ref'; }
      NB.cands = { q, list, sel: new Set(list.slice(0, 3).map((_, i) => i)), failed };
      if (conv.nbParent === NB.cur) { e.view = 'docs'; }
      if (turn) turn._nbActs = true;
    } else setTimeout(() => enhance(conv, turn, true), 60);
    save();
    if (conv.nbParent === NB.cur) render();
  }
  // gdd trả khối stale → tài liệu đã đổi so với bản đã ghi nhớ; release.sha → ghi nhớ bản hiện tại
  function onToolResult(conv, card, b) {
    if (!card || !/^mcp__/.test(card.name || '')) return;
    const text = typeof b.content === 'string' ? b.content : (b.content || []).map((x) => x.text || '').join('');
    if (!/"release"\s*:/.test(text)) return;
    let j; try { j = JSON.parse(text); } catch { return; }
    const server = card.name.split('__')[1], proj = (card.input || {}).project;
    const e = ent(conv.nbParent);
    let changed = false;
    for (const t of topicsOf(e)) {
      for (const s of t.sources || []) {
        if (s.type !== 'gdd' || s.server !== server || (proj && s.project !== proj)) continue;
        if (j.stale && j.stale.currentSha && s.sha && s.sha !== j.stale.currentSha) { t.stale = { from: s.sha, to: j.stale.currentSha, t: Date.now() }; changed = true; }
        else if (!s.sha && j.release && j.release.sha) { s.sha = j.release.sha; changed = true; }
      }
    }
    if (changed) { saveLib(); if (conv.nbParent === NB.cur) render(); }
  }
  function onActivate(conv) {
    if (!NB.ready || conv.nb) return;
    NB.cur = conv.sid;
    NB.find = null; NB.cands = null;
    NB.stick = true;
    // MCP theo dự án (.mcp.json, ~/.claude.json projects) khác nhau giữa các thư mục
    if (conv.cwd && conv.cwd !== NB.serversCwd) { NB.serversCwd = conv.cwd; api.nbServers(conv.cwd).then((x) => { NB.servers = x || []; }); }
    render();
  }

  // ---------- Giao diện ----------
  function toggle(force) {
    const p = parentConv();
    if (!p) return;
    const e = ent(p.sid, true);
    e.open = force != null ? force : !e.open;
    if (e.open && !topicsOf(e).length && !e.sid) e.view = 'docs';
    save();
    render();
    if (e.open) setTimeout(() => (e.view === 'docs' ? $('#nb-find') : $('#nb-input')) && (e.view === 'docs' ? $('#nb-find') : $('#nb-input')).focus(), 50);
  }
  function render() {
    if (!NB.ready) return;
    const p = parentConv();
    if (p) NB.cur = p.sid;
    const e = ent(NB.cur);
    const open = !!(e && e.open && p);
    $('#nb-col').classList.toggle('hidden', !open);
    $('#nb-resize').classList.toggle('hidden', !open);
    const btn = $('#btn-nb');
    btn.classList.toggle('on', open);
    btn.classList.toggle('nb-has', !!(e && e.topics.length));
    if (open) {
      renderHead(e); renderTopics(e); renderTabs(e); renderPane(e); renderFoot(e); updateComposer();
      // mở lại sổ đã có lịch sử (sau khi khởi động lại app / đổi phiên) → nạp nền để thấy các câu hỏi đáp cũ
      if (e.sid && e.ok && !convOf(e) && !NB.loading) { NB.loading = true; ensureConv(e, NB.cur).finally(() => { NB.loading = false; render(); }); }
    }
    CG.app.placeConvs();
  }
  function renderHead(e) {
    const box = $('#nb-head');
    if (!box || !e) return;
    const c = convOf(e);
    const cur = MODELS.find((m) => m[0] === (S.settings.nbModel || 'haiku') && m[1] === (S.settings.nbEffort || 'low')) || MODELS[0];
    box.innerHTML = '';
    box.append(...[h('span', { class: 'nb-title' }, icon('book', 15), 'Sổ tài liệu'),
      c && c.busy ? h('span', { class: 'nb-busy' }, h('i'), c.nbSearch ? 'Đang tìm…' : c.perms.size ? 'Chờ bạn cho phép' : 'Đang tra…') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'nb-model', title: 'Model trả lời của sổ (áp dụng cho mọi sổ)', onclick: (ev) => menu(ev.currentTarget, MODELS.map((m) => ({ label: m[2], desc: m[3], checked: m === cur, onClick: () => setModel(m[0], m[1]) })), { checks: true }) }, cur[2], icon('chevronDown', 12)),
      h('button', { class: 'icon-btn sm', title: 'Tuỳ chọn', html: svg('moreH', 15), onclick: (ev) => moreMenu(ev.currentTarget, e) }),
      h('button', { class: 'icon-btn sm', title: 'Đóng sổ (Ctrl+Shift+L)', html: svg('x', 15), onclick: () => toggle(false) })].filter(Boolean));
  }
  async function setModel(model, effort) {
    CG.saveSettings({ nbModel: model, nbEffort: effort });
    S.settings.nbModel = model; S.settings.nbEffort = effort;
    for (const c of CG.app.convs()) {
      if (!c.nb) continue;
      if (c.model !== model) { c.model = model; if (await api.running(c.key)) c.control({ subtype: 'set_model', model }); }
      if (c.effort !== effort) { c.effort = effort; c.respawn = true; c.nbSig = ''; }
    }
    render();
  }
  function moreMenu(anchor, e) {
    const c = convOf(e);
    menu(anchor, [
      { label: 'Máy chủ MCP dùng để tìm…', desc: docServers().join(', ') || 'chưa chọn', icon: 'layers', onClick: serversDialog },
      { label: 'Biết phiên chính đang làm gì', desc: 'gửi kèm tên phiên + tin nhắn gần nhất (~100 token)', checked: S.settings.nbMainCtx !== false, onClick: () => { S.settings.nbMainCtx = S.settings.nbMainCtx === false; CG.saveSettings({ nbMainCtx: S.settings.nbMainCtx }); } },
      '-',
      { label: 'Làm mới hội thoại sổ', desc: 'giữ tài liệu & ghi chú, bắt đầu phiên sổ mới', icon: 'refresh', disabled: !e.sid || (c && c.busy), onClick: () => { e.sid = ''; e.ok = false; e.sent = ''; save(); render(); } },
      { label: 'Gửi lại danh sách nguồn ở câu sau', icon: 'list', disabled: !e.sid, onClick: () => { e.sent = ''; save(); } },
      '-',
      { label: 'Bỏ hết tài liệu khỏi phiên này', icon: 'x', disabled: !e.topics.length, onClick: () => { e.topics = []; save(); render(); } },
    ], { checks: true });
  }
  async function serversDialog() {
    const p = parentConv();
    NB.servers = await api.nbServers(p && p.cwd);
    const cur = new Set(docServers());
    const rows = NB.servers.map((s) => {
      const cb = h('input', { type: 'checkbox', checked: cur.has(s.name) });
      return { s, cb, el: h('label', { class: 'nb-check' }, cb, h('b', { text: s.name }), h('span', { class: 'nb-muted', text: `${s.type}${s.url ? ' · ' + s.url.replace(/^https?:\/\//, '').slice(0, 40) : ''}` })) };
    });
    const m = modal('Máy chủ MCP dùng để tìm tài liệu', h('div', { class: 'nb-form' },
      h('div', { class: 'nb-muted' }, 'Chỉ dùng khi bạn bấm "Nhờ tìm trên MCP". Khi hỏi, sổ chỉ nạp MCP mà tài liệu đã gắn cần tới — càng ít MCP càng rẻ (mô tả công cụ của mỗi MCP tốn hàng nghìn token mỗi lượt).'),
      rows.length ? rows.map((r) => r.el) : h('div', { class: 'nb-muted', text: 'Chưa cấu hình MCP nào (claude mcp add …).' })), [
      h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }),
      h('button', { class: 'btn primary', text: 'Lưu', onclick: () => { const v = rows.filter((r) => r.cb.checked).map((r) => r.s.name); S.settings.nbServers = v; CG.saveSettings({ nbServers: v }); m.close(); render(); } }),
    ]);
  }
  function renderTopics(e) {
    const box = $('#nb-topics');
    box.innerHTML = '';
    const tps = topicsOf(e);
    if (!tps.length) box.append(h('span', { class: 'nb-muted', text: 'Chưa gắn tài liệu nào cho phiên này' }));
    for (const t of tps) {
      box.append(h('span', { class: 'nb-chip' + (t.stale ? ' stale' : ''), title: (t.sources || []).map((s) => SRC_IC[s.type] + ' ' + srcLabel(s)).join('\n') + (t.stale ? '\n⚠ Tài liệu đã đổi' : '') },
        h('span', { class: 'nb-chip-n', text: t.name, onclick: () => { e.view = 'docs'; render(); } }),
        h('span', { class: 'nb-chip-c', text: (t.sources || []).length }),
        h('button', { class: 'nb-chip-x', title: 'Bỏ khỏi phiên này (vẫn còn trong thư viện)', html: svg('x', 11), onclick: () => detach(t) })));
    }
    box.append(h('button', { class: 'nb-chip add', onclick: () => { e.view = 'docs'; render(); setTimeout(() => $('#nb-find') && $('#nb-find').focus(), 30); } }, '+ Tài liệu'));
  }
  function renderTabs(e) {
    const tps = topicsOf(e);
    const nNotes = tps.reduce((a, t) => a + (t.notes || []).length, 0);
    const nQs = tps.reduce((a, t) => a + (t.questions || []).filter((q) => !q.done).length, 0);
    const box = $('#nb-tabs');
    box.innerHTML = '';
    for (const [k, label] of [['qa', 'Hỏi đáp'], ['docs', 'Tài liệu'], ['notes', `📌 Ghim${nNotes ? ` (${nNotes})` : ''}`], ['qs', `❓ Câu hỏi mở${nQs ? ` (${nQs})` : ''}`]]) {
      box.append(h('button', { class: (e.view || 'qa') === k ? 'on' : '', text: label, onclick: () => { e.view = k; save(); render(); } }));
    }
  }
  function staleBanner(e) {
    const tps = topicsOf(e).filter((t) => t.stale);
    if (!tps.length) return null;
    return h('div', { class: 'nb-box warn' }, h('b', {}, '⚠ Tài liệu đã đổi'),
      h('div', {}, tps.map((t) => `${t.name}: bản ${t.stale.from.slice(0, 7)} → ${t.stale.to.slice(0, 7)}`).join(' · ')),
      h('div', { class: 'nb-muted' }, 'Câu trả lời mới đã dùng bản mới. Ghi chú ghim trước thời điểm đổi có thể đã cũ (đánh dấu ⚠ ở tab Ghim).'),
      h('div', { class: 'nb-row' }, h('button', { class: 'btn sm primary', text: 'Đã hiểu — ghi nhớ bản mới', onclick: () => {
        for (const t of tps) { for (const s of t.sources) if (s.type === 'gdd' && s.sha === t.stale.from) s.sha = t.stale.to; t.changedAt = t.stale.t; t.stale = null; }
        saveLib(); e.sent = ''; save(); render();
      } })));
  }
  function renderPane(e) {
    const pane = $('#nb-pane');
    pane.innerHTML = '';
    const v = e.view || 'qa';
    $('#nb-convs').classList.toggle('hidden', v !== 'qa');
    if (v === 'qa') {
      const sb = staleBanner(e);
      if (sb) pane.append(sb);
      const c = convOf(e);
      if (!c || !c.count) {
        const tps = topicsOf(e);
        if (!tps.length) pane.append(h('div', { class: 'nb-empty' }, h('div', { class: 'nb-big', text: '📚' }), h('div', {}, 'Gõ tên tính năng / tài liệu cần tra vào ô dưới (vd: ', h('i', {}, 'Loạn chiến cửu châu'), ') — sổ tìm trong thư viện và các tệp .md của dự án trước, không tốn lượt.')));
        else pane.append(h('div', { class: 'nb-empty' }, h('div', {}, 'Hỏi bất cứ điều gì về ', h('b', {}, tps.map((t) => t.name).join(', ')), '. Sổ chỉ trả lời trong phạm vi tài liệu, kèm trích dẫn.'),
          h('div', { class: 'nb-sugg' }, ['Tóm tắt tài liệu này trong 5 ý chính', 'Liệt kê các quy tắc / con số quan trọng', 'Có điểm nào chưa rõ hoặc mâu thuẫn không?'].map((q) => h('button', { class: 'btn sm', text: q, onclick: () => ask(q) })))));
      }
      return;
    }
    if (v === 'docs') return renderDocs(e, pane);
    if (v === 'notes') return renderNotes(e, pane);
    if (v === 'qs') return renderQs(e, pane);
  }
  function srcRow(s, t) {
    return h('div', { class: 'nb-src' }, h('span', { text: SRC_IC[s.type] || '•' }),
      h('span', { class: 'ellipsis', title: srcLine(s, 0).slice(5), text: srcLabel(s) }),
      s.type === 'file' ? h('button', { class: 'icon-btn sm', title: 'Xem tệp', html: svg('eye', 13), onclick: () => CG.viewer.openFile(s.path) }) : null,
      s.url ? h('button', { class: 'icon-btn sm', title: 'Mở link', html: svg('external', 13), onclick: () => api.openExternal && api.openExternal(s.url) }) : null,
      t ? h('button', { class: 'icon-btn sm', title: 'Bỏ nguồn này', html: svg('x', 12), onclick: () => { t.sources = t.sources.filter((x) => x !== s); t.updated = Date.now(); saveLib(); render(); } }) : null);
  }
  function renderDocs(e, pane) {
    const inp = h('input', { id: 'nb-find', type: 'text', class: 'text-input', placeholder: 'Tìm tài liệu: tên tính năng / chủ đề…', value: (NB.find && NB.find.q) || '' });
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') find(inp.value); });
    pane.append(h('div', { class: 'nb-find' }, inp, h('button', { class: 'btn sm primary', text: 'Tìm', onclick: () => find(inp.value) })));
    const r = NB.find;
    if (r) {
      if (r.lib.length) {
        pane.append(h('div', { class: 'nb-sec', text: `Trong thư viện (${r.lib.length})` }));
        for (const t of r.lib.slice(0, 8)) pane.append(topicCard(e, t));
      }
      if (!r.files) pane.append(h('div', { class: 'nb-muted', text: 'Đang tìm trong các tệp .md của dự án…' }));
      else if (r.files.length) {
        pane.append(h('div', { class: 'nb-sec', text: `Tệp .md trong dự án khớp “${r.q}” (${r.files.length}/${r.total} tệp)` }));
        const box = h('div', { class: 'nb-box' });
        for (const f of r.files) {
          const cb = h('input', { type: 'checkbox', checked: r.sel.has(f.path), onchange: () => (cb.checked ? r.sel.add(f.path) : r.sel.delete(f.path)) });
          box.append(h('label', { class: 'nb-cand' }, cb, h('div', { class: 'nb-cand-b' }, h('b', { text: f.rel }), f.title ? h('span', { class: 'nb-muted', text: ' · ' + f.title }) : null, f.snip ? h('div', { class: 'nb-snip', text: '…' + f.snip + '…' }) : null)));
        }
        box.append(h('div', { class: 'nb-row' }, h('button', { class: 'btn sm primary', text: `Tạo tài liệu “${r.q}” từ tệp đã chọn`, onclick: () => {
          const pick = r.files.filter((f) => r.sel.has(f.path));
          if (!pick.length) return toast('Chưa chọn tệp nào.');
          addSources(pick.map((f) => ({ type: 'file', path: f.path, title: f.title || f.rel })), null);
        } })));
        pane.append(box);
      }
      if (r.files && !r.lib.length && !r.files.length) {
        pane.append(h('div', { class: 'nb-box no' }, h('b', {}, `Chưa có tài liệu về “${r.q}”`),
          h('div', { class: 'nb-muted' }, 'Không thấy trong thư viện và trong các tệp .md của dự án. Gửi cho mình tài liệu nhé:')));
      }
      if (r.files) {
        pane.append(h('div', { class: 'nb-row wrap' },
          h('span', { class: 'nb-muted', text: r.lib.length || r.files.length ? 'Không đúng? Thêm nguồn:' : '' }),
          addMenuItems(null).map((it) => h('button', { class: 'btn sm', onclick: it.onClick }, icon(it.icon, 13), ' ' + it.label.replace('…', '')))),
        h('div', { class: 'nb-row wrap' }, h('button', { class: 'btn sm', title: 'Nhờ model của sổ tìm trên ' + (docServers().join(', ') || 'MCP') + ' — tốn một lượt nhỏ', onclick: () => searchMcp(r.q) }, '🔍 Nhờ tìm trên MCP (' + (docServers().join(', ') || 'chưa chọn') + ')')));
      }
    }
    const cd = NB.cands;
    if (cd) {
      pane.append(h('div', { class: 'nb-sec', text: `Kết quả tìm trên MCP: “${cd.q}”` }));
      if (!cd.list) pane.append(h('div', { class: 'nb-muted' }, 'Đang tìm… (xem tiến trình ở tab Hỏi đáp)'));
      else if (!cd.list.length) pane.append(h('div', { class: 'nb-box no' }, h('b', {}, 'Không tìm thấy trên MCP.'), h('div', { class: 'nb-muted' }, 'Gửi link / tệp tài liệu cho mình bằng các nút ở trên.')));
      else {
        const box = h('div', { class: 'nb-box' });
        cd.list.forEach((x, i) => {
          const cb = h('input', { type: 'checkbox', checked: cd.sel.has(i), onchange: () => (cb.checked ? cd.sel.add(i) : cd.sel.delete(i)) });
          box.append(h('label', { class: 'nb-cand' }, cb, h('div', { class: 'nb-cand-b' }, h('b', { text: `${SRC_IC[x.type] || '🔌'} ${x.title || x.page || x.ref || x.url}` }),
            h('span', { class: 'nb-muted', text: ` · ${x.server || ''}${x.project ? ' / ' + x.project : ''}` }), x.why ? h('div', { class: 'nb-snip', text: x.why }) : null)));
        });
        box.append(h('div', { class: 'nb-row' }, h('button', { class: 'btn sm primary', text: `Lưu thành tài liệu “${cd.q}”`, onclick: () => {
          const pick = cd.list.filter((_, i) => cd.sel.has(i)).map((x) => { const s = { ...x }; delete s.why; return s; });
          if (!pick.length) return toast('Chưa chọn nguồn nào.');
          NB.cands = null;
          NB.find = { q: cd.q, lib: [], files: [], sel: new Set() };
          addSources(pick, null).then(() => { NB.find = null; });
        } })));
        pane.append(box);
      }
    }
    const tps = topicsOf(e);
    if (tps.length) {
      pane.append(h('div', { class: 'nb-sec', text: 'Đang gắn với phiên này' }));
      for (const t of tps) pane.append(topicCard(e, t, true));
    }
    const others = NB.lib.topics.filter((t) => !e.topics.includes(t.id) && !(r && r.lib.includes(t)));
    if (others.length) {
      const cwd = ((parentConv() || {}).cwd || '').toLowerCase();
      others.sort((a, b) => ((b.dirs || []).some((d) => d.toLowerCase() === cwd) ? 1 : 0) - ((a.dirs || []).some((d) => d.toLowerCase() === cwd) ? 1 : 0) || (b.used || b.updated || 0) - (a.used || a.updated || 0));
      pane.append(h('div', { class: 'nb-sec', text: `Thư viện (${NB.lib.topics.length} tài liệu)` }));
      for (const t of others.slice(0, 30)) pane.append(topicCard(e, t));
    }
  }
  function topicCard(e, t, attached) {
    const card = h('div', { class: 'nb-topic' + (attached ? ' on' : '') });
    const nN = (t.notes || []).length, nQ = (t.questions || []).filter((q) => !q.done).length;
    card.append(h('div', { class: 'nb-row' },
      h('b', { class: 'ellipsis', text: t.name }),
      h('span', { class: 'nb-muted', text: `${(t.sources || []).length} nguồn${nN ? ` · ${nN} ghim` : ''}${nQ ? ` · ${nQ} câu hỏi` : ''}` }),
      h('span', { class: 'spacer' }),
      attached ? h('button', { class: 'btn sm', title: 'Thêm nguồn', onclick: (ev) => menu(ev.currentTarget, addMenuItems(t)) }, '+ Nguồn')
        : h('button', { class: 'btn sm primary', text: 'Gắn', onclick: () => attach(t) }),
      h('button', { class: 'icon-btn sm', html: svg('moreH', 14), onclick: (ev) => menu(ev.currentTarget, [
        { label: 'Đổi tên…', icon: 'edit', onClick: async () => { const v = await promptDialog('Tên tài liệu', t.name); if (v) { t.name = v; t.updated = Date.now(); saveLib(); render(); } } },
        { label: 'Tên gọi khác…', desc: (t.aliases || []).join(', ') || 'giúp phiên khác tìm ra', icon: 'edit', onClick: async () => { const v = await promptDialog('Tên gọi khác (phân cách bằng dấu phẩy)', (t.aliases || []).join(', '), 'vd: LCCC, battle royale'); if (v != null) { t.aliases = v.split(',').map((x) => x.trim()).filter(Boolean); saveLib(); render(); } } },
        attached ? { label: 'Bỏ khỏi phiên này', icon: 'x', onClick: () => detach(t) } : null,
        '-',
        { label: 'Xoá khỏi thư viện', icon: 'trash', danger: true, onClick: async () => {
          if (!(await confirmDialog('Xoá tài liệu?', `Xoá “${t.name}” khỏi thư viện (kể cả ${nN} ghi chú ghim). Tệp gốc không bị đụng tới.`, 'Xoá', true))) return;
          NB.lib.topics = NB.lib.topics.filter((x) => x !== t);
          for (const x of Object.values(NB.map)) x.topics = x.topics.filter((id) => id !== t.id);
          saveLib(); save(); render();
        } },
      ]) })));
    if (attached || (t.sources || []).length <= 4) for (const s of t.sources || []) card.append(srcRow(s, attached ? t : null));
    else card.append(h('div', { class: 'nb-muted', text: (t.sources || []).map(srcLabel).join(' · ') }));
    return card;
  }
  async function fileStats(e) {
    const paths = sourcesOf(e).filter((s) => s.type === 'file' || s.type === 'dir').map((s) => s.path);
    if (!paths.length || Date.now() - NB.statT < 20000) return;
    NB.statT = Date.now();
    NB.stat = { ...NB.stat, ...(await api.nbStat(paths)) };
    render();
  }
  function noteStale(t, n) {
    if (t.changedAt && n.t < t.changedAt) return true;
    return (t.sources || []).some((s) => s.type === 'file' && NB.stat[s.path] && NB.stat[s.path].mtime > n.t);
  }
  function renderNotes(e, pane) {
    fileStats(e);
    const tps = topicsOf(e);
    let any = false;
    const q = fold(($('#nb-input') || {}).value || '');
    for (const t of tps) {
      const notes = (t.notes || []).slice().reverse();
      if (!notes.length) continue;
      any = true;
      pane.append(h('div', { class: 'nb-sec', text: t.name }));
      for (const n of notes) {
        const old = noteStale(t, n);
        const body = h('div', { class: 'nb-note-a md' });
        CG.renderMd(body, n.a);
        const card = h('div', { class: 'nb-note' + (old ? ' old' : '') + (q && fold(n.q + ' ' + n.a).includes(q) ? ' hit' : '') },
          h('div', { class: 'nb-row' }, h('b', { text: n.q }), h('span', { class: 'spacer' }), h('span', { class: 'nb-muted', text: relTime(n.t, true) })),
          old ? h('div', { class: 'nb-old', text: '⚠ Có thể cũ — tài liệu gốc đã đổi sau khi ghim' }) : null,
          body,
          h('div', { class: 'nb-row' },
            h('button', { class: 'btn sm', text: '↩ Chèn vào chat', onclick: () => insertToMain(n.q, n.a) }),
            old ? h('button', { class: 'btn sm', text: '↻ Hỏi lại', onclick: () => ask(n.q) }) : null,
            h('span', { class: 'spacer' }),
            h('button', { class: 'icon-btn sm', title: 'Bỏ ghim', html: svg('trash', 13), onclick: () => { t.notes = t.notes.filter((x) => x !== n); saveLib(); render(); } })));
        pane.append(card);
      }
    }
    if (!any) pane.append(h('div', { class: 'nb-empty' }, 'Chưa ghim gì. Bấm 📌 Ghim dưới câu trả lời hay — ghi chú gắn với tài liệu nên phiên khác dùng lại được, và sổ đọc ghi chú trước khi tra lại.'));
  }
  function renderQs(e, pane) {
    const tps = topicsOf(e);
    let any = false;
    const KIND = { none: 'Không có trong tài liệu', conflict: 'Tài liệu mâu thuẫn', ask: 'Cần hỏi lại' };
    for (const t of tps) {
      const qs = t.questions || [];
      if (!qs.length) continue;
      any = true;
      pane.append(h('div', { class: 'nb-row nb-sec' }, h('span', { text: t.name }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm', text: 'Xuất .md cho designer', onclick: () => exportQs(t) })));
      for (const q of qs) {
        const cb = h('input', { type: 'checkbox', checked: q.done, title: 'Đã có câu trả lời', onchange: () => { q.done = cb.checked; saveLib(); render(); } });
        pane.append(h('div', { class: 'nb-q' + (q.done ? ' done' : '') }, cb, h('div', { class: 'nb-cand-b' }, h('b', { text: q.q }), h('div', { class: 'nb-muted', text: `${KIND[q.kind] || ''} · ${relTime(q.t, true)}${q.lark ? ` · 📨 đã hỏi ${q.lark}` : ''}` }),
            q.answer ? h('div', { class: 'nb-snip', text: `💬 ${q.answer}` }) : null),
          !q.done && CG.lark ? h('button', { class: 'btn sm', title: 'Gửi câu hỏi này cho người thật qua Lark — trả lời về sẽ tự đánh dấu xong và ghim', text: '📨 Lark', onclick: () => larkAsk(t, q) }) : null,
          h('button', { class: 'icon-btn sm', title: 'Xoá', html: svg('trash', 13), onclick: () => { t.questions = t.questions.filter((x) => x !== q); saveLib(); render(); } })));
      }
    }
    if (!any) pane.append(h('div', { class: 'nb-empty' }, 'Chưa có câu hỏi mở. Câu nào tài liệu không có hoặc mâu thuẫn, bấm ❓ dưới câu trả lời để gom lại rồi xuất gửi designer.'));
  }
  function larkAsk(t, q) {
    const ctx = String(q.a || '').replace(/\n*\s*\**Nguồn\**\s*:[\s\S]*$/i, '').trim().slice(0, 700);
    CG.lark.compose({
      question: `${q.q}${ctx ? `\n\nTài liệu hiện ghi (${t.name}):\n${ctx}` : ''}`, title: t.name,
      nb: { parent: NB.cur, topicId: t.id, qid: q.id },
      onSent: (a) => { q.lark = a.to.name; saveLib(); render(); },
    });
  }
  // câu trả lời qua Lark cho câu hỏi mở → đánh dấu xong + ghim vào tài liệu (phiên sau hỏi lại có sẵn)
  function larkAnswer(a, who, text) {
    const t = topic(a.nb.topicId);
    if (!t) return;
    const q = (t.questions || []).find((x) => x.id === a.nb.qid);
    if (q) { q.done = true; q.answer = `${who}: ${text}`; }
    (t.notes = t.notes || []).push({ id: uid(), q: q ? q.q : a.q, a: `${who} trả lời qua Lark (${new Date().toLocaleString('vi-VN')}):\n\n${text}`, t: Date.now(), by: 'lark' });
    t.updated = Date.now();
    saveLib();
    const e = ent(a.nb.parent);
    if (e) e.sent = '';
    save();
    render();
  }
  async function exportQs(t) {
    const KIND = { none: 'Không có trong tài liệu', conflict: 'Tài liệu mâu thuẫn', ask: 'Cần làm rõ' };
    const open = (t.questions || []).filter((q) => !q.done);
    const text = [`# Câu hỏi về tài liệu: ${t.name}`, '', `_${new Date().toLocaleString('vi-VN')} · ${open.length} câu chưa có trả lời_`, '',
      ...open.map((q, i) => `## ${i + 1}. ${q.q}\n\n- Tình trạng: ${KIND[q.kind] || ''}\n\n<details><summary>Sổ đã tra được</summary>\n\n${q.a}\n\n</details>\n`),
      '## Nguồn đã tra', '', ...(t.sources || []).map((s) => `- ${SRC_IC[s.type] || ''} ${srcLabel(s)}`)].join('\n');
    const r = await api.nbLib('export', { name: 'cau-hoi-' + t.name, text });
    if (r.ok) CG.viewer.openFile(r.path); else toast(r.error || 'Không xuất được', true);
  }
  function renderFoot(e) {
    const box = $('#nb-foot');
    const c = convOf(e);
    box.innerHTML = '';
    box.append(h('span', { title: 'Chi phí thực tế mà CLI báo cho phiên sổ này' }, `💰 ${(e.cost || 0) < 0.01 ? '$' + (e.cost || 0).toFixed(4) : '$' + (e.cost || 0).toFixed(3)} · ${e.n || 0} câu`),
      h('span', { class: 'spacer' }),
      c && c.nbServers && c.nbServers.length ? h('span', { class: 'nb-muted', title: 'MCP đang nạp trong phiên sổ', text: 'MCP: ' + c.nbServers.join(', ') }) : h('span', { class: 'nb-muted', text: 'chỉ đọc' }));
  }
  function updateComposer() {
    const e = ent(NB.cur);
    if (!e) return;
    const c = convOf(e);
    const inp = $('#nb-input'), send = $('#nb-send');
    const has = topicsOf(e).length > 0;
    inp.placeholder = has ? (c && c.busy ? 'Nhắn thêm giữa chừng…' : 'Hỏi trong phạm vi tài liệu…  (Enter)') : 'Tìm tài liệu: gõ tên tính năng / chủ đề…  (Enter)';
    const stop = !!(c && c.busy && !inp.value.trim());
    send.classList.toggle('stop', stop);
    send.innerHTML = svg(stop ? 'stop' : 'arrowUp', 16);
    send.title = stop ? 'Dừng' : has ? 'Hỏi (Enter)' : 'Tìm (Enter)';
    send.disabled = !stop && !inp.value.trim();
  }
  // gõ câu hỏi → hiện ghi chú đã ghim khớp (đọc lại không tốn lượt)
  function noteHint() {
    const e = ent(NB.cur), inp = $('#nb-input'), box = $('#nb-hint');
    const q = fold(inp.value).split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length > 2);
    box.innerHTML = '';
    if (!e || q.length < 2) return box.classList.add('hidden');
    const hits = [];
    for (const t of topicsOf(e)) for (const n of t.notes || []) { const f = fold(n.q); const k = q.filter((w) => f.includes(w)).length; if (k >= Math.max(2, Math.ceil(q.length * 0.6))) hits.push({ n, k }); }
    hits.sort((a, b) => b.k - a.k);
    if (!hits.length) return box.classList.add('hidden');
    box.classList.remove('hidden');
    box.append(h('span', { class: 'nb-muted', text: '📌 Đã ghim:' }), ...hits.slice(0, 2).map(({ n }) => h('button', { class: 'nb-hint-b', title: 'Xem ghi chú (không tốn lượt)', text: n.q, onclick: () => { e.view = 'notes'; render(); } })));
  }
  function sendInput() {
    const e = ent(NB.cur, true), c = convOf(e), inp = $('#nb-input');
    const text = inp.value.trim();
    if (!text) { if (c && c.busy) c.interrupt(); return; }
    inp.value = '';
    autosize(); noteHint();
    if (!topicsOf(e).length) return find(text);
    ask(text);
  }
  function autosize() { const inp = $('#nb-input'); inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 140) + 'px'; }

  // ---------- Bôi đen chữ trong phiên chính → tra trong tài liệu ----------
  let selBtn = null;
  function hideSel() { if (selBtn) { selBtn.remove(); selBtn = null; } }
  function onSelect(ev) {
    if (ev.target.closest && ev.target.closest('.nb-selbtn')) return;
    setTimeout(() => {
      hideSel();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 2 || text.length > 400 || !sel.rangeCount) return;
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (!node || !node.closest('#conversations') || !parentConv()) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      selBtn = h('button', { class: 'nb-selbtn', style: { left: Math.max(8, r.left) + 'px', top: Math.max(8, r.top - 34) + 'px' } }, icon('book', 13), ' Tra trong tài liệu');
      selBtn.onmousedown = (e2) => e2.preventDefault();
      selBtn.onclick = () => {
        hideSel();
        const e = ent(NB.cur, true);
        e.open = true; save();
        if (topicsOf(e).length) ask(`Tài liệu nói gì về “${text}”?`);
        else { render(); find(text); }
      };
      document.body.append(selBtn);
    }, 10);
  }

  function bind() {
    $('#btn-nb').onclick = () => toggle();
    const inp = $('#nb-input');
    inp.addEventListener('input', () => { autosize(); updateComposer(); noteHint(); });
    inp.addEventListener('keydown', (ev) => {
      if (CG.listKeys && CG.listKeys(inp, ev)) return;
      if (ev.key === 'Enter' && !ev.isComposing) {
        const ctrlMode = S.settings.sendKey === 'ctrlEnter';
        if ((!ctrlMode && !ev.shiftKey && !ev.ctrlKey) || (ctrlMode && ev.ctrlKey)) { ev.preventDefault(); sendInput(); }
      }
      if (ev.key === 'Escape') { const c = convOf(ent(NB.cur)); if (c && c.busy) { ev.preventDefault(); c.interrupt(); } }
    });
    $('#nb-send').onclick = sendInput;
    const sc = $('#nb-scroller');
    sc.addEventListener('scroll', () => { NB.stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60; });
    document.addEventListener('mouseup', onSelect);
    document.addEventListener('mousedown', (ev) => { if (!(ev.target.closest && ev.target.closest('.nb-selbtn'))) hideSel(); }, true);
    $('#scroller').addEventListener('scroll', hideSel);
    document.addEventListener('keydown', (ev) => { if (ev.ctrlKey && ev.shiftKey && (ev.key === 'L' || ev.key === 'l')) { ev.preventDefault(); toggle(); } });
    // kéo đổi độ rộng khung sổ
    const col = $('#nb-col');
    col.style.width = (S.settings.nbWidth || 400) + 'px';
    $('#nb-resize').addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const x0 = ev.clientX, w0 = col.offsetWidth;
      document.body.classList.add('resizing-h');
      const sg = CG.paneSign ? CG.paneSign('nb') : 1;
      const move = (e2) => { col.style.width = Math.max(300, Math.min(900, w0 - (e2.clientX - x0) * sg)) + 'px'; };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('resizing-h'); CG.saveSettings({ nbWidth: col.offsetWidth }); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }
  async function init() {
    while (!S.settings) await new Promise((r) => setTimeout(r, 50));
    NB.map = S.settings.nb && typeof S.settings.nb === 'object' ? JSON.parse(JSON.stringify(S.settings.nb)) : {};
    // giữ tối đa 400 sổ gần nhất
    const keys = Object.keys(NB.map);
    if (keys.length > 400) keys.sort((a, b) => (NB.map[a].t || 0) - (NB.map[b].t || 0)).slice(0, keys.length - 400).forEach((k) => { if (!NB.map[k].sid) delete NB.map[k]; });
    const r = await api.nbLib('get');
    NB.lib = (r && r.lib) || { topics: [] };
    if (!Array.isArray(NB.lib.topics)) NB.lib.topics = [];
    bind();
    NB.ready = true;
    render();
    CG.app.renderSidebar();
    const p0 = parentConv();
    NB.serversCwd = p0 && p0.cwd;
    api.nbServers(NB.serversCwd || S.home).then((s) => { NB.servers = s || []; });
  }

  CG.nb = { larkAnswer, onActivate, onBusy, onResult, onInit, onToolResult, afterRender, hiddenSids, shownConv, toggle, ask, find, render, _NB: NB };
  init();
})();
