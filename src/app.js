'use strict';
// Claude GUI — giao diện chính. Toàn bộ tương tác với Claude đi qua Claude Code CLI (stream-json) ở main process.
(() => {
  const api = window.api;
  const CG = window.CG;
  const {
    $, $$, h, svg, icon, logo, hydrate, basename, dirname, samePath, shortPath, fmtTok, stripAnsi, stripReminders, relTime,
    rid, renderMd, copyBtn, mdEl, MODES, EFFORTS, effortLabel, toolMeta, toolSummary, rowsView, patchRows, patchCounts,
    unifiedRows, hunksFromStrings, todoView, toolInputView, resultView, resultText, permTitle, suggestionLabel, popover, closePopover,
    menu, pointAnchor, toast, modal, confirmDialog, promptDialog,
  } = CG;

  const STOP_SUMMARY_TAG = '[Claude GUI · dừng giữa chừng]';
  // Nhãn cho tin gửi khi Claude đang làm — quy tắc đi kèm nằm trong system prompt (main.js MID_RULE)
  const MID_TAG = '[Gửi thêm trong lúc bạn đang làm]';
  const AUTO_PREVIEW_EXT = new Set(['html', 'htm', 'md', 'markdown', 'mdx', 'pdf', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp']);
  const midStrip = (t) => (t.startsWith(MID_TAG) ? t.slice(MID_TAG.length).replace(/^\s+/, '') : t);
  function withMidTag(content) {
    if (typeof content === 'string') return MID_TAG + ' ' + content;
    const arr = content.slice(), i = arr.findIndex((b) => b.type === 'text');
    if (i >= 0) arr[i] = { ...arr[i], text: MID_TAG + ' ' + arr[i].text }; else arr.unshift({ type: 'text', text: MID_TAG });
    return arr;
  }
  const STOP_SUMMARY_LABEL = '⏹ Đã dừng — tóm tắt phần đã làm';
  const STOP_SUMMARY_PROMPT = `${STOP_SUMMARY_TAG} Người dùng vừa bấm Dừng. KHÔNG làm tiếp và KHÔNG gọi công cụ nào. ` +
    'Trả lời thật ngắn (tối đa ~6 gạch đầu dòng), cùng ngôn ngữ với cuộc trò chuyện, theo 3 mục: ' +
    '**Đã xong** — những gì đã hoàn thành; **Còn dở** — bước đang làm/chưa làm; ' +
    '**File đang sửa dở** — file đã thay đổi nhưng chưa hoàn chỉnh (ghi "không có" nếu không có). Không hỏi lại người dùng.';
  const VERBS = ['Đang suy nghĩ', 'Đang cân nhắc', 'Đang phân tích', 'Đang xử lý', 'Đang nghiền ngẫm', 'Đang tìm cách', 'Đang làm việc'];
  const LOCAL_COMMANDS = [
    { name: 'clear', description: 'Bắt đầu phiên mới (GUI)', local: true },
    { name: 'new', description: 'Bắt đầu phiên mới (GUI)', local: true },
    { name: 'btw', description: 'Hỏi bên lề (Ctrl+;): hỏi nhanh về việc đang làm, không chen vào phiên chính', local: true },
    { name: 'usage', description: 'Mức sử dụng gói: giới hạn 5 giờ, hàng tuần, giờ làm mới, điều gì đang dùng nhiều', local: true },
  ];
  const SUGGESTIONS = [
    ['search', 'Giải thích cấu trúc dự án này'],
    ['bug', 'Tìm lỗi tiềm ẩn trong code'],
    ['book', 'Viết README cho dự án'],
    ['git', 'Review các thay đổi gần đây (git)'],
  ];
  const FALLBACK_MODELS = [
    { value: 'default', displayName: 'Mặc định' }, { value: 'opus', displayName: 'Opus' },
    { value: 'sonnet', displayName: 'Sonnet' }, { value: 'haiku', displayName: 'Haiku' },
  ];
  const VIEW_MODES = [['normal', 'Bình thường', 'Thu gọn công cụ, hiện đầy đủ câu trả lời'], ['thinking', 'Suy nghĩ', 'Mở sẵn phần suy nghĩ của Claude, thẻ công cụ vẫn thu gọn'], ['verbose', 'Chi tiết', 'Mở mọi công cụ và phần suy nghĩ'], ['summary', 'Tóm tắt', 'Ẩn các bước, chỉ hiện câu trả lời']];

  // ---------- State ----------
  const S = {
    settings: null, home: '', appInfo: null, info: null, infoError: null,
    convs: new Map(), active: null, all: [], ext: [], extMap: new Map(),
    attachments: [], rate: null, stick: true, ac: null, files: new Map(),
    claudeSettings: {}, updates: {}, expanded: new Set(), treeAll: new Set(), filter: 'all',
    changesTab: 'session', diffView: null, order: [],
  };
  const els = {};
  CG.S = S;
  CG.api = api;

  const saveSettings = async (patch) => { S.settings = await api.setSettings(patch); return S.settings; };
  CG.saveSettings = saveSettings;
  const models = () => (S.info && S.info.models && S.info.models.length ? S.info.models : FALLBACK_MODELS);
  const modelInfo = (v) => models().find((m) => m.value === v);
  // "Mặc định" = model trong ~/.claude/settings.json nếu có, nếu không thì mặc định của CLI
  function defaultModelInfo() {
    const cs = S.claudeSettings || {};
    if (cs.model) {
      const m = modelInfo(cs.model) || models().find((x) => x.resolvedModel === cs.model);
      if (m) return m;
    }
    const d = modelInfo('default');
    return (d && d.resolvedModel && models().find((x) => x.resolvedModel === d.resolvedModel && x.value !== 'default')) || d;
  }
  function modelLabel(v) {
    if (v === 'default') { const d = defaultModelInfo(); return d && d.value !== 'default' ? d.displayName : 'Mặc định'; }
    const m = modelInfo(v);
    return m ? m.displayName : v;
  }
  function defaultEffort(modelValue) {
    const cs = S.claudeSettings || {};
    const m = !modelValue || modelValue === 'default' ? defaultModelInfo() : modelInfo(modelValue);
    const resolved = m && m.resolvedModel;
    return (resolved && cs.modelSettings && cs.modelSettings[resolved] && cs.modelSettings[resolved].effortLevel) || S.settings.effort || cs.effortLevel || 'high';
  }
  const modeFor = (dir) => (S.settings.modeByFolder && S.settings.modeByFolder[(dir || '').toLowerCase()]) || S.settings.permissionMode || 'default';
  const isArchived = (id) => (S.settings.archived || []).includes(id);

  // ---------- Hiện chữ mượt khi Claude đang gõ ----------
  // CLI gửi chữ theo từng cụm không đều → hiện dần với tốc độ thích ứng (tồn càng nhiều chạy càng nhanh).
  // Các đoạn đã xong (trước dòng trống cuối, ngoài khối code) chỉ dựng markdown 1 lần; mỗi khung hình
  // chỉ dựng lại đoạn đang gõ dở.
  function stableCut(text) {
    let fence = false, cut = 0, pos = 0;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^\s{0,3}(```|~~~)/.test(ln)) fence = !fence;
      pos += ln.length + 1;
      // dòng trống ngoài code, và dòng kế tiếp đã có, bắt đầu bằng ký tự không phải khoảng trắng
      if (!fence && ln.trim() === '' && i + 1 < lines.length && /^\S/.test(lines[i + 1])) cut = pos;
    }
    return Math.min(cut, text.length);
  }
  class SmoothText {
    constructor(el, onFrame) {
      this.el = el;
      this.onFrame = onFrame;
      this.target = '';
      this.shown = 0;
      this.raf = 0;
      this.last = 0;
      this.done = null;
      this.stableLen = 0;
      this.stable = h('div', { class: 'md-part' });
      this.tail = h('div', { class: 'md-part tail' });
      el.append(this.stable, this.tail);
    }
    set(text) { this.target = text; this.kick(); }
    finish(text, cb) { if (text != null && text.length >= this.shown) this.target = text; this.done = cb; this.kick(); }
    cancel() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.done = null; }
    kick() { if (!this.raf) this.raf = requestAnimationFrame((t) => this.tick(t)); }
    tick(now) {
      this.raf = 0;
      if (!this.el.isConnected) { this.shown = this.target.length; }
      const dt = this.last ? Math.min(80, now - this.last) : 16;
      this.last = now;
      const backlog = this.target.length - this.shown;
      if (backlog > 0) {
        // ký tự/giây: tối thiểu ~70, tăng theo phần còn tồn; khi đã có bản cuối thì xả nhanh hơn
        const cps = this.done ? Math.max(500, backlog * 5) : Math.max(70, backlog * 2.4);
        let to = Math.min(this.target.length, this.shown + Math.max(1, Math.round((cps * dt) / 1000)));
        const code = this.target.charCodeAt(to - 1);
        if (code >= 0xd800 && code <= 0xdbff) to++;
        this.shown = to;
        this.render();
      }
      if (this.shown < this.target.length) this.kick();
      else {
        this.last = 0;
        if (this.done) { const cb = this.done; this.done = null; cb(); }
      }
      if (this.onFrame) this.onFrame();
    }
    render() {
      const text = this.target.slice(0, this.shown);
      const cut = stableCut(text);
      if (cut > this.stableLen) {
        const tmp = h('div');
        renderMd(tmp, text.slice(this.stableLen, cut), true);
        this.stable.append(...tmp.childNodes);
        this.stableLen = cut;
      }
      renderMd(this.tail, text.slice(this.stableLen), true);
      if (CG.motion && CG.motion.ink) CG.motion.ink(this.tail, this.shown < this.target.length);
    }
  }

  // ---------- Conversation ----------
  class Conv {
    constructor({ key, sid, cwd, persisted, title }) {
      Object.assign(this, { key, sid, cwd, persisted: !!persisted, title: title || '' });
      this.model = S.settings.model || 'default';
      this.effort = S.settings.effort || '';
      this.mode = modeFor(cwd);
      if (this.mode === 'bypassPermissions' && !S.settings.allowBypass) this.mode = 'default';
      this.worktree = false;
      this.root = h('div', { class: 'conv hidden' });
      els.convs.append(this.root);
      this.count = 0;
      this.turn = null;
      this.live = [];
      this.liveIdx = new Map();
      this.tools = new Map();
      this.perms = new Map();
      // Tác tử phụ / lệnh nền do CLI báo qua system task_started/progress/notification
      this.tasks = new Map();
      this.queue = [];
      this.stderr = [];
      this.edits = new Map();
      this.todos = null;
      this.busy = false;
      this.cost = 0;
      this.costBase = 0;
      this.ctx = 0;
      this.ctxWindow = 0;
      this.outTokens = 0;
      this.msgBase = 0;
      this.lastActive = Date.now();
      this.activity = '';
      this.modelName = '';
      this.git = null;
      this.pid = null;
      // Lịch sử: chỉ dựng DOM cho phần cuối, phần cũ hơn dựng dần khi cuộn lên
      this.hist = null;
      this.histStart = 0;
      this.loader = null;
      this.replaying = false;
      this.renderingOlder = false;
      S.convs.set(key, this);
      this.refreshGit();
    }
    get started() { return this.count > 0 || this.persisted; }
    fileHints() {
      const set = new Set(this.edits.keys());
      for (const c of this.tools.values()) { const p = c.input && (c.input.file_path || c.input.notebook_path || c.input.path); if (typeof p === 'string') set.add(p); }
      return [...set].map((p) => (/^[a-zA-Z]:[\\/]|^[\\/]/.test(p) ? p : (this.cwd || '') + '\\' + p));
    }
    get runningTasks() { return [...this.tasks.values()].filter(taskRunning); }
    // Phiên còn việc: đang trả lời, hoặc lượt chính đã xong nhưng tác tử phụ/lệnh nền vẫn chạy
    get working() { return this.busy || this.runningTasks.length > 0; }
    async refreshGit() {
      const cwd = this.cwd;
      const g = cwd ? await api.gitInfo(cwd) : { repo: false };
      if (cwd !== this.cwd) return;
      this.git = g;
      if (this === S.active) { updateTitlebar(); updateComposer(); }
    }

    // --- rendering primitives
    append(node) { this.root.append(node); this.count++; afterRender(this); }
    ensureTurn() {
      if (!this.turn) { this.turn = h('div', { class: 'turn' }); this.append(this.turn); }
      return this.turn;
    }
    addToTurn(node) { this.ensureTurn().append(node); this.count++; afterRender(this); }
    noteStep(el) {
      const t = this.ensureTurn();
      if (!el.isConnected || el.parentElement !== t) return;
      if (!t._chip) {
        t._steps = 0;
        t._chip = h('button', { class: 'steps-chip', onclick: () => t.classList.toggle('show-steps') });
        t.insertBefore(t._chip, el);
      }
      t._steps++;
      t._chip.innerHTML = '';
      t._chip.append(icon('layers', 13), `${t._steps} bước`, icon('chevronDown', 12));
    }
    closeTurn() {
      const t = this.turn;
      this.turn = null;
      if (!t || t._actions) return;
      const texts = () => $$('.md[data-raw]', t).filter((e) => e.parentElement === t).map((e) => e.dataset.raw).join('\n\n');
      if (!texts()) return;
      t._actions = true;
      t.append(h('div', { class: 'msg-actions' }, copyBtn(texts, 'Sao chép câu trả lời')));
    }
    addNote(text) { this.addToTurn(h('div', { class: 'note', text })); }
    addError(text) { this.addToTurn(h('div', { class: 'errbox', text })); }
    // Hết giới hạn 5 giờ / tuần giữa chừng → thẻ đếm ngược + ô "Tự chạy tiếp khi giới hạn hồi" (giống bản desktop)
    async limitCard(text) {
      const at0 = limitResetAt(text);
      const on = !this.managed && S.settings.autoContinue !== false;
      const msg = h('input', { class: 'lim-msg', value: 'Giới hạn sử dụng đã hồi. Hãy làm tiếp phần việc còn dở cho xong.', spellcheck: 'false' });
      const ck = h('input', { type: 'checkbox' });
      ck.checked = on;
      const left = h('b', { class: 'lim-left' }), atEl = h('b');
      // vòng đếm ngược quanh biểu tượng đồng hồ (phần còn lại co dần), tới giờ gửi thì loé xanh
      const ring = h('div', { class: 'lim-ring', html: '<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg" pathLength="100" stroke-dasharray="100" transform="rotate(-90 18 18)"/></svg>' }, icon('clock', 14));
      const bar = ring.querySelector('.fg');
      const card = h('div', { class: 'limit-card' },
        h('div', { class: 'lim-t' }, ring, h('span', { text: /tuần|week/i.test(text) ? 'Đã hết giới hạn tuần' : 'Đã hết giới hạn sử dụng' }), h('span', { class: 'spacer' }), h('span', { class: 'lim-at' }, 'hồi lúc ', atEl, ' · còn ', left)),
        this.managed ? h('div', { class: 'note', text: 'Phiên này do Lịch & hàng đợi / dự án tự động điều khiển — kế hoạch sẽ tự chạy tiếp khi giới hạn hồi.' })
          : h('label', { class: 'chk' }, ck, ' Tự chạy tiếp khi giới hạn hồi'),
        this.managed ? null : h('div', { class: 'lim-row' }, h('span', { class: 'muted', text: 'Lời nhắn sẽ gửi:' }), msg,
          h('button', { class: 'btn sm', text: 'Gửi ngay', onclick: () => { const t = msg.value.trim(); if (t) { autoResOff(this); this.send(t, t); } } })),
        h('div', { class: 'note lim-raw', text: text.slice(0, 300) }));
      this.addToTurn(card);
      const st = { at: at0 || Date.now() + 30 * 60e3, guess: !at0, t0: Date.now(), on: on && !this.managed, msg: msg.value, card, left, atEl, bar };
      this.autoRes = st;
      ck.onchange = () => { st.on = ck.checked; saveAutoRes(); renderSidebar(); };
      msg.oninput = () => { st.msg = msg.value; saveAutoRes(); };
      paintAutoRes(this);
      saveAutoRes();
      renderSidebar();
      // giờ hồi chưa rõ (số liệu gói cũ) → lấy số liệu mới rồi tính lại
      if (!at0) { await fetchUsage(true).catch(() => {}); const t = limitResetAt(text); if (t && this.autoRes === st) { st.at = t; st.guess = false; paintAutoRes(this); saveAutoRes(); } }
    }

    renderUser(text, images, opts = {}) {
      this.closeTurn();
      const lk = CG.lark && text && text.startsWith(CG.lark.LK_MARK);
      const el = h('div', { class: 'msg-user' + (opts.cmd ? ' cmd' : '') + (opts.queued ? ' queued' : '') + (lk ? ' lark' : '') });
      if (images && images.length) el.append(h('div', { class: 'imgs' }, images.map((src) => h('img', { src }))));
      if (text) el.append(h('div', { class: 'bubble', text }));
      if (opts.queued) el.append(h('div', { class: 'queued-tag', text: 'Đã gửi giữa lượt — Claude sẽ đọc ở bước kế tiếp' }));
      else if (opts.mid) el.append(h('div', { class: 'queued-tag', text: '↳ gửi giữa lượt' }));
      const rsTag = !opts.history && (this._rsTag || (this._rsFrom ? '🏠 gửi từ ' + this._rsFrom : ''));
      if (rsTag) el.append(h('div', { class: 'queued-tag rs-from', text: rsTag }));
      if (text) el.append(h('div', { class: 'msg-actions' }, copyBtn(() => text)));
      this.append(el);
      if (!opts.history) S.stick = true;
      return el;
    }

    // --- sending
    async send(content, displayText, images) {
      // phiên mở từ máy khác (truy cập từ xa): gửi sang máy đang chạy phiên
      if (this.rs) return CG.remote.send(this, content, displayText, images);
      if (CG.remote) CG.remote.userSent(this, displayText != null ? displayText : typeof content === 'string' ? content : '', images);
      this.suggestion = '';
      // Đang chạy: ghi thẳng vào CLI — CLI chèn tin vào lượt hiện tại (giữa các bước công cụ),
      // hoặc mở lượt mới ngay sau đó nếu lượt đã tới bước trả lời cuối (result có queued_turn_count)
      // "Đổi hướng" (menu ▴ cạnh nút gửi): dừng lượt đang chạy (không tóm tắt) rồi gửi tin này
      if (this.busy && this.redirectNext) {
        this.redirectNext = false;
        const el = this.renderUser(displayText, images, { queued: true });
        const tag = el.querySelector('.queued-tag'); if (tag) tag.textContent = 'Đổi hướng — đang dừng việc cũ…';
        if (this === S.active && CG.motion) CG.motion.fly(el);
        this.pendingRedirect = { content, displayText, el };
        this.interrupt();
        return;
      }
      this.redirectNext = false;
      if (this.busy) {
        const el = this.renderUser(displayText, images, { queued: true });
        if (this === S.active && CG.motion) CG.motion.fly(el);
        this.queue.push({ el });
        this.stopSummary = false;
        if (CG.lark) content = CG.lark.hint(content, displayText, this);
        const ok = await api.write(this.key, { type: 'user', message: { role: 'user', content: withMidTag(content) }, parent_tool_use_id: null, session_id: this.sid });
        if (!ok) { this.addError('Không gửi được tin nhắn tới Claude CLI (tiến trình đã đóng).'); el.classList.remove('queued'); }
        return;
      }
      const first = this.count === 0;
      const uel = this.renderUser(displayText, images);
      if (this === S.active && CG.motion) CG.motion.fly(uel);
      if (first) { onConvStarted(this); }
      this.dispatch(content, displayText);
    }
    async dispatch(content, displayText) {
      if (!this.title) { this.title = (displayText || 'Hình ảnh').replace(/\s+/g, ' ').slice(0, 80); updateTitlebar(); }
      const idle = !this.busy;
      this.setBusy(true);
      if (CG.decor) CG.decor.onSend();
      try { await this.ensureProc(idle); } catch (e) { this.addError(e.message); this.setBusy(false); return; }
      if (CG.lark) content = CG.lark.hint(content, displayText, this);
      if (CG.pack && CG.pack.moveNote) content = CG.pack.moveNote(this, content);
      const ok = await api.write(this.key, { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: this.sid });
      if (!ok) { this.addError('Không gửi được tin nhắn tới Claude CLI (tiến trình đã đóng).'); this.setBusy(false); }
      this.lastActive = Date.now();
      renderSidebar();
    }
    async ensureProc(idle) {
      // chỉ dẫn hệ thống đã đổi (cài đặt Lark, trả lời tiếng Việt…) → khởi động lại CLI khi đang rảnh (resume giữ nguyên lịch sử)
      if (idle && !this.respawn && (await api.stale(this.key))) this.respawn = true;
      if (this.respawn && (await api.running(this.key))) await api.stop(this.key);
      this.respawn = false;
      if (await api.running(this.key)) return;
      this.stderr = [];
      this.costBase = this.cost;
      this.muPrev = null;
      const r = await api.ensure(this.key, {
        cwd: this.cwd, sessionId: this.sid, resume: this.persisted, worktree: this.worktree,
        model: this.model, effort: this.effort, permissionMode: this.mode, agent: this.agent || '', addDirs: this.addDirs || [], allowedTools: this.allowedTools || [], ...(this.spawnOpts || {}),
      });
      if (!r.ok) throw new Error(r.error || 'Không khởi động được Claude CLI');
      if (r.pid) this.pid = r.pid;
    }
    control(request) { if (this.rs) return Promise.resolve(false); return api.write(this.key, { type: 'control_request', request_id: rid(), request }); }
    // Số liệu ngữ cảnh chính xác như lệnh /context của CLI: tổng token, ngưỡng tối đa (đã tính auto-compact
    // trong settings, vd 500k), %, và từng phần (system prompt, công cụ, MCP, skill, tin nhắn…)
    async fetchContext() {
      if (this.rs || this.ctxReq || !(await api.running(this.key))) return;
      this.ctxReq = 'ctx-' + rid();
      api.write(this.key, { type: 'control_request', request_id: this.ctxReq, request: { subtype: 'get_context_usage' } });
      setTimeout(() => { this.ctxReq = null; }, 8000);
    }
    respond(requestId, response) {
      if (this.rs) return CG.remote.respond(this, requestId, response);
      api.write(this.key, { type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
    }
    interrupt() {
      if (this.rs) return CG.remote.stop(this);
      if (!this.busy) return;
      this.interrupting = true;
      for (const p of [...this.perms.values()]) p.cancel('Đã dừng');
      // Dừng có tóm tắt: lượt đã đụng tới công cụ thì sau khi dừng hỏi Claude tóm tắt phần đã làm / còn dở
      this.wantSummary = S.settings.stopSummary !== false && !this.summarizing && !this.pendingRedirect && this.turnTools > 0;
      this.control({ subtype: 'interrupt' });
      clearTimeout(this.intTimer);
      this.intTimer = setTimeout(async () => {
        if (!this.busy) return;
        await api.stop(this.key);
        this.addNote('Đã dừng (buộc tắt tiến trình CLI).');
        this.cleanupLive();
        this.setBusy(false);
        this.flushRedirect();
      }, 6000);
    }
    setBusy(v) {
      this.busy = v;
      if (CG.remote) CG.remote.busyChanged(this);
      if (v) {
        this.suggestion = '';
        this.turnStart = Date.now();
        this.outTokens = 0;
        this.turnText = false;
        this.turnTools = 0;
        this.activity = '';
        this.phase = 'think';
        this.lastEnd = null;
        this.verb = VERBS[Math.floor(Math.random() * VERBS.length)];
      } else {
        this.interrupting = false;
        clearTimeout(this.intTimer);
      }
      api.setBusy([...S.convs.values()].filter((c) => c.working).map((c) => c.key));
      if (this === S.active) { updateComposer(); updateIndicator(); }
      else if (this === S.side) updateSide();
      if (this.nb && CG.nb) CG.nb.onBusy(this);
      renderSidebar();
    }

    // --- events from CLI
    handle(m) {
      if (CG.remote && !this.rs) CG.remote.emit(this, m);
      switch (m.type) {
        case 'system': return this.onSystem(m);
        case 'stream_event':
          if (m.parent_tool_use_id) return;
          // Tác tử phụ chạy nền xong → CLI tự mở lượt mới để đọc kết quả: hiện là đang chạy
          if (!this.busy && m.event && m.event.type === 'message_start') this.setBusy(true);
          this.onStream(m.event);
          return;
        case 'assistant': return this.onAssistant(m);
        case 'user': return this.onUser(m);
        case 'result': return this.onResult(m);
        case 'control_request': return this.onControlRequest(m);
        case 'control_cancel_request': { const p = this.perms.get(m.request_id); if (p) p.cancel('Đã hủy'); return; }
        case 'control_response': return this.onControlResponse(m);
        case 'rate_limit_event': S.rate = m.rate_limit_info; renderUsageRing(); maybeRefreshUsage(); return;
        case 'prompt_suggestion':
          // Câu nhắn tiếp theo mà CLI đoán — hiện mờ trong ô nhập, Tab để dùng
          this.suggestion = this.busy ? '' : String(m.suggestion || '').trim();
          if (this === S.active) updateComposer();
          else if (this === S.side) updateSide();
          return;
      }
    }
    onSystem(m) {
      if (m.subtype === 'init') {
        this.persisted = true;
        if (m.session_id) this.sid = m.session_id;
        if (m.cwd && !samePath(m.cwd, this.cwd)) { this.cwd = m.cwd; this.refreshGit(); }
        if (m.model) this.modelName = m.model;
        if (m.permissionMode && MODES.some((x) => x.v === m.permissionMode)) this.mode = m.permissionMode;
        if (this.nb && CG.nb) CG.nb.onInit(this, m);
        if (this.btw && CG.btw) CG.btw.onInit(this, m);
        if (this === S.active) { updateTitlebar(); updateComposer(); }
      } else if (m.subtype === 'compact_boundary') {
        this.closeTurn();
        const md = m.compact_metadata || {};
        this.append(h('div', { class: 'divider', text: 'Đã nén ngữ cảnh cuộc trò chuyện' + (md.pre_tokens && md.post_tokens ? `  ·  ${fmtTok(md.pre_tokens)} → ${fmtTok(md.post_tokens)}` : '') }));
        // Sau khi nén, ngữ cảnh giảm ngay — không chờ lần gọi model tiếp theo
        if (md.post_tokens) { this.ctx = md.post_tokens; if (this === S.active) ctxChanged(); }
        this.fetchContext();
      } else if (/^task_(started|progress|updated|notification)$/.test(m.subtype)) {
        this.onTask(m);
      } else if (m.subtype === 'status') {
        this.activity = m.status === 'compacting' ? 'Đang nén ngữ cảnh' : '';
        this.phase = m.status === 'compacting' ? 'compact' : this.phase === 'compact' ? 'think' : this.phase;
      } else if (m.subtype === 'api_retry') {
        this.activity = `Lỗi API, đang thử lại${m.attempt ? ` (lần ${m.attempt})` : ''}`;
      }
    }
    onTask(m) {
      if (m.ambient || !m.task_id) return;
      let t = this.tasks.get(m.task_id);
      if (!t) {
        if (m.subtype === 'task_notification' || m.subtype === 'task_updated') return;
        t = { id: m.task_id, start: Date.now(), status: 'running', tools: 0, tokens: 0 };
        this.tasks.set(m.task_id, t);
      }
      if (m.tool_use_id) t.toolUseId = m.tool_use_id;
      if (m.description) t.desc = m.description;
      if (m.subtype === 'task_started' && m.description) t.title = m.description;
      if (m.subagent_type) t.agent = m.subagent_type;
      if (m.task_type) t.type = m.task_type;
      if (m.workflow_name) t.workflow = m.workflow_name;
      if (m.is_backgrounded != null) t.bg = !!m.is_backgrounded;
      const u = m.usage;
      if (u) {
        if (u.tool_uses != null) t.tools = u.tool_uses;
        if (u.total_tokens != null) t.tokens = u.total_tokens;
        if (u.duration_ms) t.start = (t.end || Date.now()) - u.duration_ms;
      }
      if (m.last_tool_name) t.last = m.last_tool_name;
      if (m.summary) t.summary = m.summary;
      if (m.subtype === 'task_updated' && m.patch) {
        const p = m.patch;
        if (p.status) t.status = p.status;
        if (p.description) t.desc = p.description;
        if (p.error) t.error = String(p.error);
        if (p.end_time) t.end = p.end_time;
      }
      if (m.subtype === 'task_notification') {
        t.status = m.status || 'completed';
        if (!t.end) t.end = Date.now();
        t.last = '';
      }
      if (!taskRunning(t) && !t.end) t.end = Date.now();
      const card = t.toolUseId && this.tools.get(t.toolUseId);
      if (card && card.setTask) card.setTask(t);
      if (this === S.active) { renderTasks(); updateIndicator(); }
      else if (this === S.side) updateSide();
      if (m.subtype === 'task_started' || m.subtype === 'task_notification') {
        api.setBusy([...S.convs.values()].filter((c) => c.working).map((c) => c.key));
        renderSidebar();
      }
    }
    stopTask(id) {
      if (this.rs) return;
      api.write(this.key, { type: 'control_request', request_id: 'gui-' + rid(), request: { subtype: 'stop_task', task_id: id } });
    }
    onStream(ev) {
      switch (ev.type) {
        case 'message_start':
          this.phase = 'think';
          this.liveIdx = new Map();
          this.msgBase = this.outTokens;
          this.ensureTurn();
          break;
        case 'content_block_start': {
          const b = ev.content_block || {};
          let L = null;
          if (b.type === 'text') {
            L = { kind: 'text', el: h('div', { class: 'md streaming' }), text: '' };
            if (S.settings.smoothStream !== false) L.smooth = new SmoothText(L.el, () => afterRender(this));
            this.addToTurn(L.el);
            this.activity = '';
            this.phase = 'talk';
          } else if (b.type === 'thinking') {
            const body = h('div', { class: 'md' });
            L = { kind: 'thinking', text: '', body, el: h('details', { class: 'thinking', open: true }, h('summary', {}, icon('chevronRight', 13), 'Suy nghĩ'), body) };
            this.activity = '';
            this.phase = 'think';
          } else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
            const meta = toolMeta(b.name);
            L = { kind: 'tool_use', id: b.id, el: h('div', { class: 'tool' }, h('div', { class: 'tool-head' }, icon(meta.icon, 15, 't-icon'), h('span', { class: 't-name', text: meta.label }), h('span', { class: 't-sum', text: 'đang chuẩn bị…' }), h('span', { class: 't-stat' }, h('span', { class: 'spinner' })))) };
            this.addToTurn(L.el);
            this.activity = `Đang dùng ${meta.label}`;
            this.phase = 'tool:' + b.name;
            this.phaseInfo = '';
          }
          if (L) { this.live.push(L); this.liveIdx.set(ev.index, L); }
          break;
        }
        case 'content_block_delta': {
          const L = this.liveIdx.get(ev.index);
          const d = ev.delta || {};
          if (!L) break;
          if (d.type === 'text_delta' && L.kind === 'text') {
            L.text += d.text;
            this.turnText = true;
            if (L.smooth) L.smooth.set(L.text);
            else if (!L.raf) L.raf = requestAnimationFrame(() => { L.raf = 0; if (L.el.classList.contains('streaming')) { renderMd(L.el, L.text, true); afterRender(this); } });
          } else if (d.type === 'thinking_delta' && L.kind === 'thinking') {
            L.text += d.thinking;
            if (!L.el.isConnected && L.text.trim()) this.addToTurn(L.el);
            L.body.textContent = L.text;
            afterRender(this);
          }
          break;
        }
        case 'message_delta':
          if (ev.usage && ev.usage.output_tokens) this.outTokens = this.msgBase + ev.usage.output_tokens;
          break;
      }
    }
    takeLive(kind, id) {
      const i = this.live.findIndex((l) => l.kind === kind && (!id || !l.id || l.id === id));
      return i < 0 ? null : this.live.splice(i, 1)[0];
    }
    onAssistant(m) {
      const msg = m.message;
      if (!msg) return;
      if (m.parent_tool_use_id) return this.onSubagent(m.parent_tool_use_id, msg);
      const older = this.renderingOlder;
      if (!older && msg.model && msg.model !== '<synthetic>') this.modelName = msg.model;
      const u = !older && msg.usage;
      if (u) {
        const c = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        if (c) {
          this.ctx = c + (u.output_tokens || 0);
          // Cập nhật ngay sau mỗi lần gọi model (trước đây chỉ vẽ lại khi xong cả lượt → lượt dài thấy đứng yên)
          if (this === S.active && !this.replaying) ctxChanged();
        }
      }
      for (const b of msg.content || []) {
        if (b.type === 'text') {
          const L = this.replaying ? null : this.takeLive('text');
          if (!b.text || !b.text.trim()) { if (L) { if (L.smooth) L.smooth.cancel(); L.el.remove(); } continue; }
          if (L && L.raf) cancelAnimationFrame(L.raf);
          const el = L ? L.el : h('div', { class: 'md' });
          el.dataset.raw = b.text;
          const text = b.text;
          const finalize = () => { el.classList.remove('streaming'); renderMd(el, text); afterRender(this); };
          // Chữ đang hiện dần thì để chạy nốt rồi mới dựng bản cuối (tô màu code...)
          if (L && L.smooth && L.el.isConnected) L.smooth.finish(text, finalize);
          else finalize();
          if (!L) this.addToTurn(el);
          this.turnText = true;
        } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
          const L = this.replaying ? null : this.takeLive('thinking');
          const text = b.thinking || (L && L.text) || '';
          if (L && L.el.isConnected) { L.el.open = showThinking(); if (text) L.body.textContent = text; }
          else if (text.trim()) {
            this.addToTurn(h('details', { class: 'thinking', open: showThinking() }, h('summary', {}, icon('chevronRight', 13), 'Suy nghĩ'), h('div', { class: 'md', text })));
          }
        } else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const L = this.replaying ? null : this.takeLive('tool_use', b.id);
          const card = this.toolCard(b);
          if (L && L.el.isConnected) L.el.replaceWith(card.el); else this.addToTurn(card.el);
          this.noteStep(card.el);
          if (this.busy && !this.replaying) this.activity = `Đang dùng ${toolMeta(b.name).label}`;
        }
      }
      if (this === S.active) renderUsageRing();
      afterRender(this);
    }
    onSubagent(parentId, msg) {
      const card = this.tools.get(parentId);
      if (!card) return;
      for (const b of msg.content || []) {
        if (b.type === 'tool_use') card.addSub(`${toolMeta(b.name).label}  ${toolSummary(b.name, b.input, this.cwd)}`);
      }
    }
    onUser(m, hist) {
      if (m.parent_tool_use_id) return;
      const content = m.message && m.message.content;
      if (typeof content === 'string') { if (hist) this.historyUserText(content, m); return; }
      const texts = [], imgs = [];
      for (const b of content || []) {
        if (b.type === 'tool_result') {
          const card = this.tools.get(b.tool_use_id);
          if (card) {
            card.setResult(b.content, b.is_error);
            if (!b.is_error) this.trackEdit(card, m.tool_use_result || m.toolUseResult);
            if (!b.is_error && !hist && !this.replaying) this.autoPreview(card, b.content);
            if (!b.is_error) { const su = serverUrl(card, b.content); if (su) card.previewBtn(su); } // như nút Open của bản desktop
            if (!hist && !this.replaying && CG.mascot && CG.mascot.onToolResult) CG.mascot.onToolResult(this, card, b);
            if (!hist && !this.replaying && !b.is_error && CG.autopilot) CG.autopilot.onToolResult(this, card);
            if (!hist && !this.replaying && this.nb && CG.nb) CG.nb.onToolResult(this, card, b);
          }
        } else if (hist && b.type === 'text') texts.push(b.text);
        else if (hist && b.type === 'image' && b.source && b.source.data) imgs.push(`data:${b.source.media_type};base64,${b.source.data}`);
      }
      if (hist && (texts.length || imgs.length)) {
        if (texts.length && !imgs.length) return this.historyUserText(texts.join('\n'), m);
        const t0 = texts.join('\n');
        this.renderUser(midStrip(stripReminders(t0)), imgs, { history: true, mid: t0.startsWith(MID_TAG) || !!m.midTurn });
      }
    }
    editInfo(name, inp, tur) {
      if (!['Edit', 'MultiEdit', 'Write'].includes(name)) return null;
      inp = inp || {};
      const file = (tur && tur.filePath) || inp.file_path;
      if (!file) return null;
      let hunks = tur && Array.isArray(tur.structuredPatch) && tur.structuredPatch.length ? tur.structuredPatch : null;
      if (!hunks) {
        if (name === 'Write') hunks = hunksFromStrings(tur && tur.type === 'update' ? tur.originalFile || '' : '', (inp.content || '').replace(/\r?\n$/, ''));
        else if (name === 'Edit') hunks = hunksFromStrings(inp.old_string, inp.new_string);
        else hunks = (inp.edits || []).flatMap((e) => hunksFromStrings(e.old_string, e.new_string));
      }
      return { file, hunks, created: !!(tur && tur.type === 'create') };
    }
    addEdit(r, quiet) {
      const e = this.edits.get(r.file) || { path: r.file, add: 0, del: 0, hunks: [], created: r.created };
      const c = patchCounts(r.hunks);
      e.add += c.add;
      e.del += c.del;
      e.hunks.push(...r.hunks);
      this.edits.set(r.file, e);
      if (CG.git) CG.git.track(this, r.file, quiet); // tệp thuộc repo nào → repo đó thành một tab trong bảng Thay đổi
      if (!quiet && this === S.active) { updateTitlebar(); refreshDetails(); }
    }
    trackEdit(card, tur) {
      const r = this.editInfo(card.name, card.input, tur);
      if (!r) return;
      // Phần lịch sử cũ đã được tính trong scanHistory — chỉ vẽ diff lên thẻ
      if (!this.renderingOlder) this.addEdit(r, this.replaying);
      card.showPatch(r.hunks);
    }
    // Giống bản desktop: Claude tạo tệp xem được (web, md, pdf, ảnh) hoặc chạy web localhost → mở luôn ở khung xem bên cạnh
    autoPreview(card, content) {
      if (S.settings.autoPreview === false || !CG.viewer) return;
      const inp = card.input || {};
      // phiên chạy nền: tab vào đúng phiên này (khung không bật lên), mở phiên ra mới thấy
      const key = this.key, bg = this !== S.active;
      const keepFocus = !bg && document.activeElement === els.input;
      // khung xem mở ra mà cột chat bị bóp quá hẹp → cất bảng chi tiết đi
      const done = () => { if (bg) return; if (keepFocus) els.input.focus(); requestAnimationFrame(() => { if (S.settings.showDetails && $('#chat-col').offsetWidth < 380) toggleDetails(false); }); };
      if (card.name === 'Write' || card.name === 'Edit' || card.name === 'MultiEdit' || card.name === 'NotebookEdit') {
        const f = inp.file_path || inp.notebook_path;
        const ext = f ? (f.split('.').pop() || '').toLowerCase() : '';
        if (!AUTO_PREVIEW_EXT.has(ext)) return;
        const open = CG.viewer.hasFile(key, f);
        // tệp mới ghi → mở (thay tab tự mở trước đó); sửa tệp đã mở sẵn → tab tự tải lại (watchFile)
        if (card.name === 'Write' && !open) CG.viewer.autoShow({ file: f, key }).then(done, () => {});
        return;
      }
      const url = serverUrl(card, content);
      if (!url) return;
      this.previewed = this.previewed || new WeakSet();
      // cùng một lệnh in địa chỉ nhiều lần thì chỉ xử lý một lần; lần chạy sau (Claude sửa rồi chạy lại) → tải lại tab
      if (this.previewed.has(card)) return;
      this.previewed.add(card);
      // cùng server đã có tab → tải lại / chuyển sang địa chỉ mới; server khác → mở tab mới, đóng tab tự mở cũ
      CG.viewer.autoShow({ url, key }).then(done, () => {});
    }
    historyUserText(t, m) {
      if (m.isMeta) return;
      if (m.isCompactSummary) { this.closeTurn(); this.append(h('div', { class: 'divider', text: 'Tóm tắt các phần trước của cuộc trò chuyện' })); return; }
      const cmd = /<command-name>(.*?)<\/command-name>/s.exec(t);
      if (cmd) {
        const args = (/<command-args>(.*?)<\/command-args>/s.exec(t) || [])[1] || '';
        return this.renderUser(`${cmd[1].trim()} ${args.trim()}`.trim(), [], { cmd: true, history: true });
      }
      const out = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(t) || /<bash-stdout>([\s\S]*?)<\/bash-stdout>/.exec(t);
      if (out) { const s = stripAnsi(out[1]).trim(); if (s) this.addToTurn(h('div', { class: 'sysline', text: s })); return; }
      if (/^\s*<(local-command-caveat|bash-stderr|task-notification)/.test(t)) return;
      const bash = /<bash-input>([\s\S]*?)<\/bash-input>/.exec(t);
      if (bash) return this.renderUser('! ' + bash[1], [], { cmd: true, history: true });
      if (/^\[Request interrupted by user/.test(t.trim())) { this.addNote('Đã dừng.'); return; }
      if (t.trim().startsWith(STOP_SUMMARY_TAG)) return this.renderUser(STOP_SUMMARY_LABEL, [], { cmd: true, history: true });
      const mid = t.startsWith(MID_TAG) || !!m.midTurn;
      const clean = midStrip(stripReminders(t));
      if (clean) this.renderUser(clean, [], { history: true, mid });
    }
    cleanupLive() {
      for (const L of this.live) {
        if (L.raf) cancelAnimationFrame(L.raf);
        if (L.smooth) L.smooth.cancel();
        if (L.kind === 'text' && L.text) { L.el.classList.remove('streaming'); L.el.dataset.raw = L.text; renderMd(L.el, L.text); }
        else if (L.el.isConnected && !(L.kind === 'thinking' && L.text)) L.el.remove();
      }
      this.live = [];
      this.liveIdx = new Map();
      for (const c of this.tools.values()) if (!c.done) c.stopped();
    }
    onResult(m) {
      this.cleanupLive();
      // total_cost_usd là tổng cộng dồn của tiến trình CLI hiện tại
      if (typeof m.total_cost_usd === 'number') this.cost = (this.costBase || 0) + m.total_cost_usd;
      if (m.modelUsage) {
        const ws = Object.values(m.modelUsage).map((x) => x && x.contextWindow).filter(Boolean);
        if (ws.length) this.ctxWindow = Math.max(...ws);
      }
      this.recordUsage(m);
      const failed = m.is_error || (m.subtype && m.subtype !== 'success');
      const stopped = failed && this.interrupting;
      // cách lượt vừa kết thúc (linh vật đọc để biểu cảm: ăn mừng / buồn / giật mình)
      this.lastEnd = { kind: stopped ? 'stopped' : failed ? 'error' : 'done', long: Date.now() - (this.turnStart || Date.now()) > 15000, t: Date.now() };
      this.summarizing = false;
      if (failed) {
        const errText = (typeof m.result === 'string' && m.result) || (m.errors || []).join('\n') || `Lỗi: ${m.subtype}`;
        if (this.interrupting) this.addNote('Đã dừng theo yêu cầu của bạn.');
        else if (isLimitHit(errText)) this.limitCard(errText);
        else this.addError(errText);
      } else if (!this.turnText && typeof m.result === 'string' && m.result.trim()) {
        this.addToTurn(mdEl(m.result));
      }
      this.closeTurn();
      // Còn tin gửi giữa lượt chưa xử lý → CLI tự mở lượt kế tiếp: giữ trạng thái đang chạy
      if (!failed && m.queued_turn_count > 0) { this.setBusy(true); return; }
      for (const q of this.queue) { q.el.classList.remove('queued'); const tag = q.el.querySelector('.queued-tag'); if (tag) tag.textContent = '↳ gửi giữa lượt'; }
      this.queue = [];
      const long = Date.now() - (this.turnStart || Date.now()) > 15000;
      if (CG.mascot && CG.mascot.onTurnEnd) CG.mascot.onTurnEnd(this, { failed, stopped, long, ms: Date.now() - (this.turnStart || Date.now()) });
      if (CG.git) CG.git.onTurnEnd(this);
      this.setBusy(false);
      if (CG.suggest) CG.suggest.onTurnEnd(this, m, failed);
      if (this.nb && CG.nb) CG.nb.onResult(this, m, failed);
      if (!this.nb && !failed && CG.lark) CG.lark.onResult(this, m);
      if (this.flushRedirect()) return;
      if (stopped && this.wantSummary) { this.wantSummary = false; this.askStopSummary(); return; }
      this.wantSummary = false;
      if (!failed && this === S.active && CG.decor) CG.decor.onDone(long);
      this.fetchContext();
      if (this === S.active) { renderUsageRing(); refreshDetails(); }
      maybeRefreshUsage();
      if (!document.hasFocus() && S.settings.notifyDone && !this.nb) api.notify('Claude đã xong', this.title || 'Phiên');
      scheduleSessionsRefresh();
    }
    // Ghi số liệu lượt vừa xong (token + chi phí quy đổi theo từng model) cho bảng chi phí / ví token / nhật ký cuối ngày.
    // modelUsage và total_cost_usd là số cộng dồn của tiến trình CLI → lấy hiệu so với lần trước.
    recordUsage(m) {
      try {
        const mu = m.modelUsage || {};
        const cum = {};
        for (const [name, u] of Object.entries(mu)) if (u) cum[name] = { i: u.inputTokens || 0, o: u.outputTokens || 0, cr: u.cacheReadInputTokens || 0, cw: u.cacheCreationInputTokens || 0, c: u.costUSD || 0 };
        const sumC = Object.values(cum).reduce((a, x) => a + x.c, 0);
        const total = typeof m.total_cost_usd === 'number' ? m.total_cost_usd : null;
        // nếu tổng costUSD khớp total_cost_usd (cộng dồn) thì trừ lần trước; nếu không thì coi là số của riêng lượt này
        const isCum = total != null && Math.abs(sumC - total) < 1e-6 + total * 1e-6;
        const prev = (isCum && this.muPrev) || {};
        const models = {};
        for (const [name, x] of Object.entries(cum)) {
          const p = prev[name] || {}, d = {};
          let any = false;
          for (const k of Object.keys(x)) { d[k] = x[k] >= (p[k] || 0) ? x[k] - (p[k] || 0) : x[k]; if (d[k]) any = true; }
          if (any) models[name] = d;
        }
        this.muPrev = isCum ? cum : null;
        const cost = Object.values(models).reduce((a, x) => a + x.c, 0);
        const rec = { kind: 'turn', sid: this.sid, title: this.title || '', cwd: this.cwd || '', nb: !!this.nb, cost, models, ms: Date.now() - (this.turnStart || Date.now()) };
        this.lastUsage = rec;
        if (Object.keys(models).length && !this.rs) api.statsAdd(rec).catch(() => {});
      } catch {}
    }
    flushRedirect() {
      const r = this.pendingRedirect;
      if (!r) return false;
      this.pendingRedirect = null;
      this.wantSummary = false;
      r.el.classList.remove('queued');
      const tag = r.el.querySelector('.queued-tag'); if (tag) tag.textContent = '↪ đổi hướng';
      this.dispatch(r.content, r.displayText);
      return true;
    }
    // Giống GUI chính: dừng xong thì Claude chạy thêm một đoạn ngắn để báo lại việc đang dở
    askStopSummary() {
      this.summarizing = true;
      this.renderUser(STOP_SUMMARY_LABEL, null, { cmd: true });
      this.dispatch(STOP_SUMMARY_PROMPT, STOP_SUMMARY_LABEL);
    }
    onExit(info) {
      if (info && info.pid && this.pid && info.pid !== this.pid) return;
      this.pid = null;
      for (const p of [...this.perms.values()]) p.cancel('CLI đã đóng');
      for (const t of this.runningTasks) this.onTask({ subtype: 'task_notification', task_id: t.id, status: 'stopped' });
      if (this.busy) {
        if (this.interrupting) this.addNote('Đã dừng.');
        else {
          this.lastEnd = { kind: 'error', t: Date.now() };
          const tail = this.stderr.slice(-15).join('\n');
          this.addError(`Claude CLI đã thoát (mã ${info.code ?? info.signal}).` + (tail ? '\n\n' + tail : ''));
        }
        this.cleanupLive();
        this.closeTurn();
        this.setBusy(false);
        this.flushRedirect();
      } else if (info.code && this.stderr.length) {
        this.addError(`Claude CLI đã thoát (mã ${info.code}).\n\n` + this.stderr.slice(-15).join('\n'));
      }
    }
    onControlResponse(m) {
      const r = m.response || {};
      if (String(r.request_id || '').startsWith('ctx-')) {
        if (r.request_id === this.ctxReq) this.ctxReq = null;
        const x = r.response;
        if (r.subtype === 'success' && x && x.totalTokens != null) {
          this.ctx = x.totalTokens;
          if (x.maxTokens) this.ctxMax = x.maxTokens;
          this.ctxCats = (x.categories || []).filter((k) => k.kind === 'used' && k.tokens > 0);
          if (this === S.active) ctxChanged();
        }
        return;
      }
      if (r.subtype === 'error' && String(r.request_id || '').startsWith('gui-')) toast(r.error || 'CLI báo lỗi', true);
      if (r.subtype === 'success' && String(r.request_id || '').startsWith('init-') && r.response && r.response.commands) {
        S.info = { ...(S.info || {}), ...r.response };
        renderAccount();
      }
    }
    onControlRequest(m) {
      const r = m.request || {};
      if (r.subtype === 'can_use_tool') return this.permRequest(m.request_id, r);
      if (this.rs) return;
      api.write(this.key, { type: 'control_response', response: { subtype: 'error', request_id: m.request_id, error: `GUI không hỗ trợ yêu cầu ${r.subtype}` } });
    }

    // --- tool cards
    toolCard(b) {
      const name = b.name, inp = b.input || {};
      const meta = toolMeta(name);
      const stat = h('span', { class: 't-stat' }, h('span', { class: 'spinner' }));
      const summary = toolSummary(name, inp, this.cwd);
      const sum = h('span', { class: 't-sum ellipsis', text: summary, title: summary });
      // Tên tệp trên thẻ Read/Edit/Write… → bấm để xem tệp trong khung xem
      const fp = inp.file_path || inp.notebook_path;
      if (fp && typeof fp === 'string') {
        sum.classList.add('file-link');
        sum.title = 'Xem tệp: ' + fp;
        sum.onclick = (e) => { e.stopPropagation(); CG.viewer.openPath(this.cwd, fp); };
      }
      const head = h('div', { class: 'tool-head' }, icon(meta.icon, 15, 't-icon'), h('span', { class: 't-name', text: meta.label }), sum, stat, icon('chevronRight', 14, 't-chev'));
      const inputBox = h('div');
      const resBox = h('div');
      const body = h('div', { class: 'tool-body' }, inputBox, resBox);
      const sub = h('div', { class: 'tool-sub hidden' });
      const el = h('div', { class: 'tool' + (S.settings.viewMode === 'verbose' ? ' open' : '') }, head, sub, body);
      // /code-review: kết quả báo qua công cụ ReportFindings → thẻ danh sách vấn đề có nút xử lý (giống bản desktop)
      if (name === 'ReportFindings' && CG.parity) { el.classList.add('rv-tool'); el.insertBefore(CG.parity.reviewCard(this, inp), sub); }
      // Claude gợi ý việc ngoài phạm vi (MCP nội bộ claude-gui) → thẻ Mở phiên mới / Làm ở đây / Lưu vào hàng đợi
      if (name === 'mcp__claude-gui__suggest_task' && CG.suggest) { el.classList.add('rv-tool', 'sg-tool'); el.insertBefore(CG.suggest.card(this, inp), sub); }
      if (name === 'mcp__claude-gui__withdraw_task' && CG.suggest) { el.classList.add('sg-tool-w'); CG.suggest.withdraw(this, inp); }
      // Nội dung thẻ (diff, output) chỉ dựng khi mở ra — phiên dài có hàng nghìn thẻ công cụ
      let built = false, result = null, patch = null;
      const renderInput = () => {
        inputBox.innerHTML = '';
        if (patch) inputBox.append(h('div', { class: 'diff-file', text: shortPath(inp.file_path, this.cwd) }), rowsView(patchRows(patch), 500, inp.file_path));
        else inputBox.append(toolInputView(name, inp, this.cwd));
      };
      const renderResult = () => {
        resBox.innerHTML = '';
        if (!result) return;
        const v = resultView(name, result.content, result.isError);
        if (v) resBox.append(h('div', { class: 'lbl', text: result.isError ? 'Lỗi' : 'Kết quả' }), v);
      };
      const build = () => { if (built) return; built = true; renderInput(); renderResult(); };
      el._build = build;
      head.onclick = () => { build(); el.classList.toggle('open'); if (CG.motion) CG.motion.tool(el); };
      if (['Edit', 'MultiEdit', 'Write', 'TodoWrite'].includes(name)) el.classList.add('open');
      // Thẻ mở sẵn: dựng ở khung hình sau, khi kết quả/diff (nếu có ngay) đã về — tránh dựng 2 lần
      if (el.classList.contains('open')) requestAnimationFrame(build);
      if (name === 'TodoWrite' && !this.renderingOlder) { this.todos = inp.todos || []; if (this === S.active && !this.replaying) refreshDetails(); }
      let subCount = 0, prog = null;
      const card = {
        el, name, input: inp, done: false, task: null,
        setResult: (content, isError) => {
          card.done = true;
          result = { content, isError };
          if (built) renderResult();
          // Tác tử chạy nền: kết quả này chỉ là "đã khởi chạy" — vẫn quay cho tới khi tác tử xong
          if (card.task && taskRunning(card.task)) return;
          stat.innerHTML = '';
          stat.append(isError ? icon('x', 14, 't-err') : icon('check', 14, 't-ok'));
          if (subCount) stat.prepend(h('span', { text: `${subCount} bước` }));
          if (isError) { el.classList.add('error'); sum.classList.add('t-err'); }
          sub.classList.add('hidden');
        },
        // Tiến độ tác tử phụ (số công cụ, token, thời gian, công cụ đang dùng) ngay dưới tiêu đề thẻ
        // Nút "Phiên con" trên thẻ tác tử → mở transcript của tác tử phụ
        linkChild: (ch) => {
          if (card.childBtn) return;
          card.childBtn = h('button', { class: 't-child', title: 'Xem toàn bộ những gì tác tử phụ này đã làm', onclick: (e) => { e.stopPropagation(); if (this.rs) CG.remote.openChild(this, ch); else openSession(ch); } }, icon('bot', 12), 'Phiên con');
          stat.before(card.childBtn);
        },
        setTask: (t) => {
          card.task = t;
          if (t.type === 'local_agent' && this.sid) card.linkChild({ id: `${this.sid}/agent-${t.id}`, agentId: t.id, parentId: this.sid, cwd: this.cwd, title: t.title || t.desc || 'Tác tử phụ', agentType: t.agent || '', child: true });
          const run = taskRunning(t);
          if (!prog) { prog = h('div', { class: 'tool-prog' }); head.after(prog); }
          prog.className = 'tool-prog ' + (run ? 'run' : t.status === 'completed' ? 'ok' : 'bad');
          const line = taskLine(t);
          if (prog.textContent !== line) prog.textContent = line;
          if (run) {
            if (!stat.querySelector('.spinner')) { stat.innerHTML = ''; stat.append(h('span', { class: 'spinner' })); }
            return;
          }
          stat.innerHTML = '';
          stat.append(t.status === 'completed' ? icon('check', 14, 't-ok') : icon('x', 14, 't-err'));
          sub.classList.add('hidden');
        },
        showPatch: (hunks) => {
          const c = patchCounts(hunks);
          stat.prepend(h('span', { class: 'cnt' }, h('span', { class: 'add', text: '+' + c.add }), ' ', h('span', { class: 'del', text: '−' + c.del })));
          patch = hunks;
          if (built) renderInput();
        },
        previewBtn: (url) => {
          if (card.pvBtn) { card.pvBtn.title = 'Mở xem trước: ' + url; card.pvUrl = url; return; }
          card.pvUrl = url;
          card.pvBtn = h('button', { class: 't-child t-pv', title: 'Mở xem trước: ' + url, onclick: (e) => { e.stopPropagation(); CG.viewer.openUrl(card.pvUrl); } }, icon('globe', 12), 'Mở xem trước');
          stat.before(card.pvBtn);
        },
        stopped: () => { card.done = true; stat.innerHTML = ''; stat.append(h('span', { text: 'đã dừng' })); },
        addSub: (text) => {
          subCount++;
          sub.classList.remove('hidden');
          sub.append(h('div', { text: '↳ ' + text }));
          while (sub.childNodes.length > 5) sub.firstChild.remove();
          afterRender(this);
        },
      };
      this.tools.set(b.id, card);
      this.turnTools = (this.turnTools || 0) + 1;
      if (this._created) this._created.push(card);
      return card;
    }

    // --- permission / question / plan cards
    permRequest(reqId, r) {
      const name = r.tool_name, inp = r.input || {};
      let card;
      if (name === 'AskUserQuestion') card = this.questionCard(reqId, r);
      else if (name === 'ExitPlanMode') card = this.planCard(reqId, r);
      else card = this.permCard(reqId, r);
      card.tool = name;
      card.raw = { request_id: reqId, request: r };
      this.perms.set(reqId, card);
      const tc = r.tool_use_id && this.tools.get(r.tool_use_id);
      if (tc) { card.toolWasOpen = tc.el.classList.contains('open'); tc.el.classList.remove('open'); card.toolCard = tc; }
      this.activity = 'Đang chờ bạn trả lời';
      if (CG.decor) CG.decor.onPermission();
      this.addToTurn(card.el);
      S.stick = true;
      afterRender(this);
      renderSidebar();
      if (this === S.active && card.focus && !els.input.value.trim()) setTimeout(card.focus, 30);
      if (!document.hasFocus() && S.settings.notifyPermission) api.notify('Claude cần bạn xác nhận', name === 'AskUserQuestion' ? 'Claude có câu hỏi cho bạn' : permTitle(name, inp, this.cwd));
    }
    finishPerm(reqId, card, label, ok) {
      if (CG.remote) CG.remote.permDone(this, reqId, label, ok);
      this.perms.delete(reqId);
      if (card.toolCard && card.toolWasOpen && ok) { card.toolCard.el._build(); card.toolCard.el.classList.add('open'); }
      card.el.className = 'perm done';
      card.el.innerHTML = '';
      card.el.append(h('div', { class: 'perm-title' }, icon(ok ? 'check' : 'x', 15, ok ? 't-ok' : 't-err'), h('span', { text: label })));
      if (this.busy) this.activity = '';
      renderSidebar();
    }
    permCard(reqId, r) {
      const name = r.tool_name, inp = r.input || {};
      const el = h('div', { class: 'perm' });
      const card = { el };
      const title = permTitle(name, inp, this.cwd);
      el.append(h('div', { class: 'perm-title' }, icon('shield', 16), h('span', { text: title })));
      if ((name === 'Bash' || name === 'PowerShell') && inp.description) el.append(h('div', { class: 'perm-reason', text: inp.description }));
      const reason = typeof r.decision_reason === 'string' ? r.decision_reason : r.decision_reason && r.decision_reason.reason;
      if (reason) el.append(h('div', { class: 'perm-reason', text: reason }));
      el.append(h('div', {}, toolInputView(name, inp, this.cwd)));
      const reasonInput = h('input', { class: 'perm-input', placeholder: 'Hoặc bảo Claude làm khác đi… (Enter để gửi)' });
      const allow = h('button', { class: 'btn primary' }, icon('check', 14), 'Cho phép');
      const deny = h('button', { class: 'btn danger' }, 'Từ chối', h('kbd', { text: 'Esc' }));
      const sugs = r.permission_suggestions || [];
      const always = sugs.length ? h('button', { class: 'btn', text: suggestionLabel(sugs) }) : null;
      el.append(h('div', { class: 'perm-actions' }, allow, always, deny), h('div', { class: 'perm-actions' }, reasonInput));
      allow.onclick = () => {
        this.respond(reqId, { behavior: 'allow', updatedInput: inp }); this.finishPerm(reqId, card, 'Đã cho phép: ' + title.replace(/^Claude muốn /, ''), true);
        // thói quen: cùng một quyền cho phép lặp lại nhiều lần → robot gợi ý thêm luật "luôn cho phép"
        if (sugs.length && CG.mascot && CG.mascot.onPermAllow) CG.mascot.onPermAllow(this, sugs);
      };
      if (always) always.onclick = () => {
        this.respond(reqId, { behavior: 'allow', updatedInput: inp, updatedPermissions: sugs });
        const sm = sugs.find((s) => s.type === 'setMode');
        if (sm) { this.mode = sm.mode; if (this === S.active) updateComposer(); }
        this.finishPerm(reqId, card, 'Đã cho phép (luôn): ' + suggestionLabel(sugs).replace(/^Luôn cho phép /, ''), true);
      };
      const doDeny = (msg) => {
        this.respond(reqId, msg
          ? { behavior: 'deny', message: 'Người dùng từ chối thao tác này và yêu cầu: ' + msg, interrupt: false }
          : { behavior: 'deny', message: 'Người dùng đã từ chối thao tác này.', interrupt: true });
        this.finishPerm(reqId, card, msg ? `Đã từ chối — “${msg}”` : 'Đã từ chối: ' + title.replace(/^Claude muốn /, ''), false);
        if (msg) this.renderUserInline(msg);
      };
      deny.onclick = () => doDeny('');
      reasonInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing && reasonInput.value.trim()) { e.preventDefault(); doDeny(reasonInput.value.trim()); } };
      card.deny = () => doDeny('');
      card.cancel = (label) => { this.respond(reqId, { behavior: 'deny', message: 'Đã hủy', interrupt: true }); this.finishPerm(reqId, card, label || 'Đã hủy', false); };
      card.focus = () => allow.focus();
      // trả lời nhanh từ robot ngoài desktop
      card.quick = { title: '🔐 ' + title, detail: String(inp.command || inp.file_path || inp.url || inp.description || '').slice(0, 160), acts: [{ label: 'Cho phép', p: 1, run: () => allow.click() }, { label: 'Từ chối', run: () => doDeny('') }] };
      return card;
    }
    renderUserInline(text) {
      this.addToTurn(h('div', { class: 'msg-user', style: 'align-self:flex-end' }, h('div', { class: 'bubble', text })));
    }
    questionCard(reqId, r) {
      const inp = r.input || {};
      const qs = inp.questions || [];
      const el = h('div', { class: 'perm' });
      const card = { el };
      el.append(h('div', { class: 'perm-title' }, icon('help', 16), h('span', { text: qs.length > 1 ? 'Claude có vài câu hỏi cho bạn' : 'Claude có câu hỏi cho bạn' })));
      const state = qs.map(() => ({ sel: new Set(), other: null }));
      const submit = () => {
        const answers = {};
        qs.forEach((q, i) => {
          const vals = [...state[i].sel];
          const o = state[i].other.value.trim();
          if (o) vals.push(o);
          answers[q.question] = vals.join(', ');
        });
        this.respond(reqId, { behavior: 'allow', updatedInput: { ...inp, answers } });
        this.finishPerm(reqId, card, 'Đã trả lời: ' + Object.values(answers).filter(Boolean).join(' · '), true);
      };
      qs.forEach((q, i) => {
        const opts = h('div', { class: 'q-opts' });
        for (const o of q.options || []) {
          const b = h('button', { class: 'q-opt' }, h('span', { text: o.label }), o.description ? h('span', { class: 'd', text: o.description }) : null);
          b.onclick = () => {
            const st = state[i].sel;
            if (q.multiSelect) { st.has(o.label) ? st.delete(o.label) : st.add(o.label); b.classList.toggle('on'); }
            else {
              st.clear(); st.add(o.label);
              $$('.q-opt', opts).forEach((x) => x.classList.remove('on'));
              b.classList.add('on');
              if (qs.length === 1) submit();
            }
          };
          opts.append(b);
        }
        state[i].other = h('input', { class: 'perm-input', placeholder: 'Câu trả lời khác…' });
        state[i].other.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } };
        el.append(h('div', { class: 'q-block' }, q.header ? h('div', { class: 'q-head', text: q.header }) : null, h('div', { class: 'q-text', text: q.question }), opts, state[i].other));
      });
      const sendB = h('button', { class: 'btn primary', text: 'Gửi câu trả lời' });
      const skip = h('button', { class: 'btn', text: 'Bỏ qua' });
      sendB.onclick = submit;
      skip.onclick = () => { this.respond(reqId, { behavior: 'deny', message: 'Người dùng bỏ qua câu hỏi.', interrupt: false }); this.finishPerm(reqId, card, 'Đã bỏ qua câu hỏi', false); };
      el.append(h('div', { class: 'perm-actions' }, sendB, skip));
      card.deny = () => skip.click();
      card.cancel = (label) => { this.respond(reqId, { behavior: 'deny', message: 'Đã hủy', interrupt: true }); this.finishPerm(reqId, card, label || 'Đã hủy', false); };
      card.focus = () => { const f = el.querySelector('.q-opt'); if (f) f.focus(); };
      const q0 = qs[0];
      card.quick = { title: '❓ ' + (qs.length === 1 && q0 ? q0.question : 'Claude có vài câu hỏi cho bạn'), acts: [] };
      // một câu, chọn một → trả lời ngay trong bóng nói của robot ngoài desktop
      if (qs.length === 1 && q0 && !q0.multiSelect) card.quick.acts = (q0.options || []).slice(0, 4).map((o, i) => ({ label: o.label, p: !i, run: () => { const b = el.querySelectorAll('.q-opt')[i]; if (b) b.click(); } }));
      return card;
    }
    planCard(reqId, r) {
      const inp = r.input || {};
      const el = h('div', { class: 'perm' });
      const card = { el };
      el.append(h('div', { class: 'perm-title' }, icon('map', 16), h('span', { text: 'Claude đã lập xong kế hoạch. Bắt đầu thực hiện?' })));
      if (inp.plan) el.append(h('div', { class: 'plan-box' }, mdEl(inp.plan)));
      const go = h('button', { class: 'btn primary', text: 'Duyệt & tự động sửa tệp' });
      const goAsk = h('button', { class: 'btn', text: 'Duyệt, nhưng hỏi trước khi sửa' });
      const keep = h('button', { class: 'btn', text: 'Tiếp tục lập kế hoạch' });
      const fb = h('input', { class: 'perm-input', placeholder: 'Góp ý cho kế hoạch… (Enter để gửi)' });
      const approve = (mode) => {
        this.respond(reqId, { behavior: 'allow', updatedInput: inp, updatedPermissions: [{ type: 'setMode', mode, destination: 'session' }] });
        this.mode = mode;
        if (this === S.active) updateComposer();
        this.finishPerm(reqId, card, mode === 'acceptEdits' ? 'Đã duyệt kế hoạch — tự động sửa tệp' : 'Đã duyệt kế hoạch', true);
      };
      go.onclick = () => approve('acceptEdits');
      goAsk.onclick = () => approve('default');
      const reject = (msg) => {
        this.respond(reqId, msg
          ? { behavior: 'deny', message: 'Người dùng muốn chỉnh kế hoạch: ' + msg, interrupt: false }
          : { behavior: 'deny', message: 'Người dùng muốn tiếp tục lập kế hoạch.', interrupt: true });
        this.finishPerm(reqId, card, msg ? `Góp ý kế hoạch — “${msg}”` : 'Chưa duyệt kế hoạch', false);
        if (msg) this.renderUserInline(msg);
      };
      keep.onclick = () => reject(fb.value.trim());
      fb.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing && fb.value.trim()) { e.preventDefault(); reject(fb.value.trim()); } };
      el.append(h('div', { class: 'perm-actions' }, go, goAsk, keep), h('div', { class: 'perm-actions' }, fb));
      card.deny = () => reject('');
      card.cancel = (label) => { this.respond(reqId, { behavior: 'deny', message: 'Đã hủy', interrupt: true }); this.finishPerm(reqId, card, label || 'Đã hủy', false); };
      card.focus = () => go.focus();
      card.quick = { title: '🗺 Claude đã lập xong kế hoạch. Bắt đầu thực hiện?', acts: [{ label: 'Duyệt & tự sửa tệp', p: 1, run: () => go.click() }, { label: 'Duyệt, hỏi từng bước', run: () => goAsk.click() }] };
      return card;
    }

    replay(entries) {
      const created = [];
      this._created = created;
      this.replaying = true;
      try {
        for (const e of entries) {
          try {
            if (e.type === 'assistant') this.onAssistant(e);
            else if (e.type === 'user') this.onUser(e, true);
            else if (e.subtype === 'compact_boundary') {
              this.closeTurn();
              const md = e.compact_metadata || e.compactMetadata || {};
              const pre = md.pre_tokens || md.preTokens, post = md.post_tokens || md.postTokens;
              this.append(h('div', { class: 'divider', text: 'Đã nén ngữ cảnh cuộc trò chuyện' + (pre && post ? `  ·  ${fmtTok(pre)} → ${fmtTok(post)}` : '') }));
              if (post && !this.renderingOlder) this.ctx = post;
            }
            if (e.cwd && !this.cwd) this.cwd = e.cwd;
          } catch (err) { console.error('replay', err, e); }
        }
      } finally { this._created = null; this.replaying = false; }
      for (const c of created) if (!c.done) c.stopped();
      this.closeTurn();
    }

    // --- lịch sử dài: dựng DOM theo từng đoạn
    loadHistory(entries, chunk) {
      this.hist = entries;
      const start = histChunkStart(entries, entries.length, chunk);
      this.scanHistory(entries, start);
      this.histStart = start;
      this.replay(entries.slice(start));
      while (!this.count && this.histStart > 0) this.renderOlder();
      this.updateLoader();
    }
    // Phần chưa dựng DOM: vẫn tính thay đổi tệp + todo cho bảng chi tiết
    scanHistory(entries, end) {
      const uses = new Map();
      for (let i = 0; i < end; i++) {
        const e = entries[i];
        const c = e.message && e.message.content;
        if (!Array.isArray(c)) continue;
        if (e.type === 'assistant') {
          for (const b of c) {
            if (b.type !== 'tool_use') continue;
            if (b.name === 'TodoWrite') this.todos = (b.input && b.input.todos) || [];
            else if (b.name === 'Edit' || b.name === 'MultiEdit' || b.name === 'Write') uses.set(b.id, b);
          }
        } else if (e.type === 'user') {
          for (const b of c) {
            if (b.type !== 'tool_result' || b.is_error || !uses.has(b.tool_use_id)) continue;
            const u = uses.get(b.tool_use_id);
            try { const r = this.editInfo(u.name, u.input, e.toolUseResult); if (r) this.addEdit(r, true); } catch {}
          }
        }
      }
    }
    hasOlder() { return (this.hist && this.histStart > 0) || !!(this.remote && this.remote.end > 0); }
    // Dựng đoạn lịch sử liền trước phần đang hiển thị (lấy từ phần cuối đã có, hoặc xin tiến trình chính)
    renderOlder(chunk) {
      if (this.hist && this.histStart > 0) {
        const end = this.histStart, start = histChunkStart(this.hist, end, chunk);
        this.histStart = start;
        this.prependEntries(this.hist.slice(start, end));
        return true;
      }
      const r = this.remote;
      if (!r || r.end <= 0 || this.remoteBusy) return false;
      this.remoteBusy = true;
      this.updateLoader();
      (this.rs ? CG.remote.api(this) : api).historyChunk(r.id, r.cwd, r.offset, r.end).then((res) => {
        this.remoteBusy = false;
        if (S.convs.get(this.key) !== this) return;
        r.end = res && res.entries && res.entries.length ? res.start : 0;
        if (res && res.entries && res.entries.length) this.prependEntries(res.entries);
        else this.updateLoader();
      }, (e) => { this.remoteBusy = false; console.error(e); this.updateLoader(); });
      return true;
    }
    prependEntries(entries) {
      const box = h('div');
      const saved = { root: this.root, turn: this.turn };
      this.root = box;
      this.turn = null;
      this.renderingOlder = true;
      try { this.replay(entries); }
      finally { this.root = saved.root; this.turn = saved.turn; this.renderingOlder = false; }
      const sc = this === S.side ? $('#split-scroller') : els.scroller, active = this === S.active || this === S.side;
      const h0 = sc.scrollHeight, t0 = sc.scrollTop;
      const nodes = [...box.childNodes];
      if (this.loader && this.loader.parentNode === this.root) this.loader.after(...nodes); else this.root.prepend(...nodes);
      this.updateLoader();
      if (active) sc.scrollTop = t0 + (sc.scrollHeight - h0);
      if (S.settings.viewMode === 'verbose') this.buildAllTools(nodes);
    }
    // Phần đầu tệp (cũ hơn) đọc nền trong tiến trình chính; ở đây chỉ nhận tóm tắt (thay đổi tệp, todo)
    async fetchOlder(it, offset) {
      this.olderLoading = true;
      this.updateLoader();
      let sum = null;
      try { sum = await (this.rs ? CG.remote.api(this) : api).loadSessionOlder(it.id, it.cwd, offset); } catch (e) { console.error(e); }
      this.olderLoading = false;
      if (S.convs.get(this.key) !== this) return;
      if (sum && sum.count) {
        // Tính lại Thay đổi theo đúng thứ tự: phần cũ trước, phần đã có sau
        const newer = this.edits;
        this.edits = new Map();
        for (const rec of sum.edits || []) { try { const x = this.editInfo(rec.name, rec.input, rec.tur); if (x) this.addEdit(x, true); } catch {} }
        for (const e of newer.values()) {
          const x = this.edits.get(e.path);
          if (x) { x.add += e.add; x.del += e.del; x.hunks.push(...e.hunks); } else this.edits.set(e.path, e);
        }
        if (!this.todos && sum.todos) this.todos = sum.todos;
        this.remote = { id: it.id, cwd: it.cwd, offset, end: sum.count, count: sum.count };
      }
      this.updateLoader();
      if (this === S.active) {
        updateTitlebar();
        refreshDetails();
        if (this.hasOlder() && els.scroller.scrollTop < 300) this.renderOlder();
      }
    }
    updateLoader() {
      const more = this.hasOlder();
      const busy = this.olderLoading || this.remoteBusy;
      if (!more && !busy) { if (this.loader) this.loader.remove(); return; }
      if (!this.loader) {
        this.loader = h('button', { class: 'hist-more' });
        this.loader.onclick = () => this.renderOlder();
      }
      this.loader.innerHTML = '';
      if (busy && !(this.hist && this.histStart > 0)) this.loader.append(h('span', { class: 'spinner' }), 'Đang tải lịch sử cũ hơn…');
      else {
        const left = (this.histStart || 0) + (this.remote ? this.remote.end : 0);
        const total = ((this.hist && this.hist.length) || 0) + (this.remote ? this.remote.count : 0);
        this.loader.append(icon('chevronUp', 14), `Hiện tin nhắn cũ hơn  ·  còn ${Math.max(1, Math.round((left / Math.max(1, total)) * 100))}% lịch sử`);
      }
      this.loader.disabled = busy && !(this.hist && this.histStart > 0);
      if (this.root.firstChild !== this.loader) this.root.prepend(this.loader);
    }
    buildAllTools(nodes) {
      for (const n of nodes || [this.root]) {
        if (!n.querySelectorAll) continue;
        if (n.classList && n.classList.contains('tool') && n._build) n._build();
        for (const t of n.querySelectorAll('.tool')) if (t._build) t._build();
      }
    }
  }

  // Chia lịch sử thành đoạn ~HIST_CHUNK mục, chỉ cắt ở chỗ an toàn (đầu một lượt hỏi
  // hoặc đầu một tin nhắn assistant ngay sau kết quả công cụ) để tool_use và tool_result không bị tách.
  const HIST_CHUNK = 150;
  const isToolResultEntry = (e) => Array.isArray(e.message && e.message.content) && e.message.content.some((b) => b && b.type === 'tool_result');
  function histChunkStart(entries, end, chunk) {
    let i = Math.max(0, end - (chunk || HIST_CHUNK));
    while (i > 0) {
      const e = entries[i], p = entries[i - 1];
      if (e.type === 'system') break;
      if (e.type === 'user' && !isToolResultEntry(e)) break;
      if (e.type === 'assistant' && p && p.type === 'user') break;
      i--;
    }
    return i;
  }

  // ---------- Scrolling ----------
  let scrollRaf = 0;
  let sideRaf = 0;
  function afterRender(conv) {
    if (conv && conv.nb) { if (CG.nb) CG.nb.afterRender(conv); return; }
    if (conv && conv.btw) { if (CG.btw) CG.btw.afterRender(conv); return; }
    if (conv && conv === S.side && !conv.renderingOlder) {
      if (S.sideStick && !sideRaf) sideRaf = requestAnimationFrame(() => { sideRaf = 0; const s = $('#split-scroller'); s.scrollTop = s.scrollHeight; });
      return;
    }
    if (conv && (conv !== S.active || conv.renderingOlder)) return;
    if (!S.stick || scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; els.scroller.scrollTop = els.scroller.scrollHeight; });
  }

  // ---------- Hero (phiên mới) ----------
  function updateHero() {
    const c = S.active;
    const hero = !c || c.count === 0;
    els.main.classList.toggle('hero', hero);
    if (!hero) return;
    const hr = new Date().getHours();
    $('#welcome-title').textContent = hr < 11 ? 'Chào buổi sáng! Hôm nay mình làm gì?' : hr < 18 ? 'Chào buổi chiều! Hôm nay mình làm gì?' : 'Chào buổi tối! Mình giúp gì được?';
    const err = $('#welcome-error');
    if (S.infoError) {
      err.classList.remove('hidden');
      err.innerHTML = '';
      err.append(h('div', { text: 'Không kết nối được Claude CLI:\n' + S.infoError }), h('button', { class: 'btn', text: 'Mở cài đặt', onclick: () => CG.openSettings('code') }));
    } else err.classList.add('hidden');
    const rec = $('#hero-recent');
    rec.innerHTML = '';
    const nbHidden = CG.nb ? CG.nb.hiddenSids() : null;
    const btwHidden = CG.btw ? CG.btw.hiddenSids() : null;
    const list = S.all.filter((s) => c && samePath(s.cwd, c.cwd) && !isArchived(s.id) && !(nbHidden && nbHidden.has(s.id)) && !(btwHidden && btwHidden.has(s.id))).slice(0, 4);
    if (list.length) {
      rec.append(h('div', { class: 'hero-rec-title' }, `Phiên gần đây trong `, h('b', { text: basename(c.cwd) })));
      for (const it of list) {
        rec.append(h('button', { class: 'hero-rec', onclick: () => openSession(it) }, icon('clock', 14), h('span', { class: 'ellipsis', text: it.title }), h('span', { class: 'when', text: relTime(it.mtime) })));
      }
    }
  }

  // ---------- Titlebar ----------
  function updateTitlebar() {
    const c = S.active;
    if (!c) return;
    els.title.textContent = c.title || (c.count ? 'Phiên chưa đặt tên' : 'Phiên mới');
    document.title = (c.title ? c.title + ' — ' : '') + 'Claude GUI';
    const started = c.count > 0;
    $('#tb-folder').classList.toggle('hidden', !started || !c.cwd);
    $('#tb-folder-name').textContent = basename(c.cwd);
    $('#tb-folder').title = c.cwd + '\n(Bấm để mở thư mục)';
    const br = $('#tb-branch');
    if (c.git && c.git.repo && c.git.branch) { br.classList.remove('hidden'); br.lastChild.textContent = c.git.branch; } else br.classList.add('hidden');
    let add = 0, del = 0;
    for (const e of c.edits.values()) { add += e.add; del += e.del; }
    const ch = $('#btn-changes');
    ch.classList.toggle('hidden', !c.edits.size);
    $('#changes-count').innerHTML = '';
    $('#changes-count').append(h('span', { class: 'add', text: '+' + add }), ' ', h('span', { class: 'del', text: '−' + del }));
    $('#btn-session-menu').classList.toggle('hidden', !started);
    $('#btn-details').classList.toggle('on', !!S.settings.showDetails);
    if (CG.remote) CG.remote.titleChip(c);
  }

  // ---------- Composer ----------
  function updateComposer() {
    const c = S.active;
    if (!c) return;
    $('#composer').classList.toggle('hidden', !!c.child);
    const cb = $('#child-bar');
    cb.classList.toggle('hidden', !c.child);
    if (c.child) {
      const p = parentOf(c);
      const t = p && [...S.convs.values()].find((x) => x.sid === c.parentId);
      const task = t && t.tasks.get(c.agentId);
      cb.innerHTML = '';
      cb.append(icon('bot', 15), h('div', { class: 'cb-text' },
        h('div', { class: 'cb-title ellipsis', text: `Phiên con${c.agentType ? ` · ${c.agentType}` : ''} — chỉ xem` }),
        h('div', { class: 'cb-sub ellipsis', text: task ? taskLine(task) : `Tác tử phụ của: ${p.title || 'phiên cha'}` })),
        h('button', { class: 'btn sm', text: 'Về phiên cha', onclick: () => openSession(p) }));
      return;
    }
    const editableDir = c.count === 0 && !c.persisted;
    const fb = $('#ctl-folder');
    fb.disabled = !editableDir;
    fb.classList.toggle('static', !editableDir);
    $('#ctl-folder-name').textContent = c.cwd ? basename(c.cwd) : 'Chọn thư mục';
    fb.title = (c.cwd || '') + (editableDir ? '\nBấm để đổi thư mục cho phiên mới' : '');
    $('#ctl-worktree').classList.toggle('hidden', !c.worktree);
    const mm = MODES.find((x) => x.v === c.mode) || MODES[0];
    const mb = $('#ctl-mode');
    mb.className = 'ctl mode ' + mm.cls;
    $('#ctl-mode-icon').innerHTML = svg(mm.icon, 14);
    $('#ctl-mode-name').textContent = mm.label;
    $('#ctl-model-name').textContent = `${modelLabel(c.model)} · ${effortLabel(c.effort || defaultEffort(c.model))}`;
    const send = els.send;
    const stopMode = c.busy && !els.input.value.trim() && !S.attachments.length;
    send.classList.toggle('stop', stopMode);
    send.innerHTML = svg(stopMode ? 'stop' : 'arrowUp', 16);
    send.title = stopMode ? 'Dừng (Esc)' : c.busy ? 'Gửi bổ sung — Claude đọc ngay ở bước kế tiếp' : 'Gửi (Enter)';
    send.disabled = !stopMode && !els.input.value.trim() && !S.attachments.length;
    const sugg = !c.busy && c.suggestion && !els.input.value ? c.suggestion : '';
    els.input.placeholder = sugg ? sugg
      : c.busy ? 'Nhắn bổ sung — Claude sẽ đọc ngay trong lúc đang làm…'
      : c.count === 0
      ? 'Giao việc cho Claude…  (@ để nhắc tệp, / để xem lệnh)'
      : (S.settings.sendKey === 'ctrlEnter' ? 'Nhắn tiếp cho Claude…  (Ctrl+Enter để gửi)' : 'Nhắn tiếp cho Claude…  (Shift+Enter xuống dòng)');
    $('#composer').classList.toggle('has-sugg', !!sugg);
    renderUsageRing();
  }

  // Mẫu số = ngưỡng mà CLI dùng (đã tính auto-compact window trong settings), giống /context
  const ctxWindowOf = (c) => {
    if (c.ctxMax) return c.ctxMax;
    const model = c.ctxWindow || (/\[1m\]/i.test(c.model || '') || c.ctx > 200000 ? 1000000 : 200000);
    const auto = +((S.claudeSettings && S.claudeSettings.autoCompactWindow) || 0);
    return auto > 0 ? Math.min(model, auto) : model;
  };
  function renderUsageRing() {
    const c = S.active;
    const b = $('#ctl-usage');
    if (!c) return;
    const pct = c.ctx ? Math.min(1, c.ctx / ctxWindowOf(c)) : 0;
    const r = 7, C = 2 * Math.PI * r;
    const col = pct > 0.85 ? 'var(--err)' : pct > 0.65 ? 'var(--warn)' : 'var(--accent)';
    b.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="${r}" fill="none" stroke="var(--border-strong)" stroke-width="2.4"/><circle cx="10" cy="10" r="${r}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 10 10)"/></svg>`;
    const lim = planLimits();
    const ses = lim.find((x) => x.group === 'session'), wk = lim.find((x) => x.group === 'weekly');
    b.title = [`Ngữ cảnh ${Math.round(pct * 100)}%`, ses ? `Phiên 5 giờ ${Math.round(ses.pct)}%` : '', wk ? `Tuần ${Math.round(wk.pct)}%` : ''].filter(Boolean).join(' · ');
  }
  let ctxRaf = 0;
  function ctxChanged() {
    if (ctxRaf) return;
    ctxRaf = requestAnimationFrame(() => { ctxRaf = 0; renderUsageRing(); if (S.usagePop) S.usagePop(); });
  }
  function bar(pct, cls = '') { return h('div', { class: 'ubar ' + cls }, h('i', { style: { width: Math.max(0, Math.min(100, Math.round(pct * 100))) + '%' } })); }

  // --- Giới hạn gói (5 giờ / hàng tuần) từ `get_usage` của CLI; dự phòng: rate_limit_event trong luồng
  function limitLabel(l) {
    if (l.kind === 'session') return 'Phiên hiện tại';
    if (l.kind === 'weekly_all') return 'Tất cả model';
    const sc = l.scope || {};
    const name = (sc.model && (sc.model.display_name || sc.model.id)) || (sc.surface && (sc.surface.display_name || sc.surface.id || (typeof sc.surface === 'string' ? sc.surface : '')));
    return name ? `Chỉ ${name}` : String(l.kind || 'Giới hạn').replace(/_/g, ' ');
  }
  function planLimits() {
    const rl = S.usage && S.usage.data && S.usage.data.rate_limits;
    const out = [];
    if (rl && Array.isArray(rl.limits) && rl.limits.length) {
      for (const l of rl.limits) out.push({ group: l.group || (l.kind === 'session' ? 'session' : 'weekly'), label: limitLabel(l), pct: +l.percent || 0, reset: l.resets_at, severity: l.severity });
    } else if (rl) {
      if (rl.five_hour) out.push({ group: 'session', label: 'Phiên hiện tại', pct: rl.five_hour.utilization || 0, reset: rl.five_hour.resets_at });
      if (rl.seven_day) out.push({ group: 'weekly', label: 'Tất cả model', pct: rl.seven_day.utilization || 0, reset: rl.seven_day.resets_at });
      for (const [k, n] of [['seven_day_opus', 'Opus'], ['seven_day_sonnet', 'Sonnet']]) if (rl[k]) out.push({ group: 'weekly', label: 'Chỉ ' + n, pct: rl[k].utilization || 0, reset: rl[k].resets_at });
    } else {
      const w = S.rate && S.rate.unifiedWindows;
      for (const [k, g, label] of [['five_hour', 'session', 'Phiên hiện tại'], ['seven_day', 'weekly', 'Tất cả model']]) {
        if (w && w[k] && typeof w[k].utilization === 'number') out.push({ group: g, label, pct: w[k].utilization * 100, reset: w[k].resetsAt ? w[k].resetsAt * 1000 : null });
      }
    }
    return out;
  }
  // ---------- Tự chạy tiếp khi giới hạn hồi ----------
  const LIMIT_RE = /usage limit|hit your (?:\w+ )*limits?|limit (?:reached|exceeded)|out of (?:extra )?usage|hết giới hạn/i;
  const isLimitHit = (t) => LIMIT_RE.test(String(t || '')) || planLimits().some((r) => r.pct >= 99.5 && (r.group === 'session' || r.group === 'weekly'));
  // giờ hồi: giới hạn đang chạm 100% (từ get_usage / rate_limit_event), không có thì đọc trong câu lỗi ("resets 2:20pm", "|1730000000")
  function limitResetAt(text) {
    let at = 0;
    for (const r of planLimits()) if (r.pct >= 99.5 && r.reset) { const t = new Date(r.reset).getTime(); if (t > Date.now() && t > at) at = t; }
    if (at) return at + 60e3;
    const s = String(text || '');
    const ep = /\|(\d{10})\b/.exec(s);
    if (ep) return +ep[1] * 1000 + 60e3;
    const m = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(s);
    if (m) {
      let hh = +m[1];
      if (m[3]) { hh = hh % 12; if (m[3].toLowerCase() === 'pm') hh += 12; }
      const d = new Date(); d.setHours(hh, +(m[2] || 0), 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d.getTime() + 60e3;
    }
    return 0;
  }
  const AR_KEY = 'cg.autoRes';
  const readAR = () => { try { return JSON.parse(localStorage.getItem(AR_KEY) || '{}') || {}; } catch { return {}; } };
  function saveAutoRes() {
    const o = readAR();
    for (const c of S.convs.values()) if (c.autoRes && c.sid) o[c.sid] = { at: c.autoRes.at, on: c.autoRes.on, msg: c.autoRes.msg };
    try { localStorage.setItem(AR_KEY, JSON.stringify(o)); } catch {}
  }
  function autoResOff(c) {
    if (c.autoRes && c.autoRes.card) c.autoRes.card.classList.add('done');
    c.autoRes = null;
    const o = readAR(); delete o[c.sid];
    try { localStorage.setItem(AR_KEY, JSON.stringify(o)); } catch {}
    renderSidebar();
  }
  const autoResWaiting = (sid) => { const v = readAR()[sid]; return !!(v && v.on); };
  const fmtLeft = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
  function paintAutoRes(c) {
    const a = c.autoRes;
    if (!a || !a.card) return;
    const p2 = (n) => String(n).padStart(2, '0'), d = new Date(a.at);
    a.atEl.textContent = `${p2(d.getHours())}:${p2(d.getMinutes())}${d.toDateString() !== new Date().toDateString() ? ` ${d.getDate()}/${d.getMonth() + 1}` : ''}${a.guess ? ' (ước tính)' : ''}`;
    a.left.textContent = fmtLeft(a.at - Date.now());
    a.bar.style.strokeDashoffset = Math.min(100, ((Date.now() - a.t0) / Math.max(1, a.at - a.t0)) * 100);
  }
  // mỗi giây: cập nhật đồng hồ; tới giờ → gửi lời nhắn vào đúng phiên (kể cả phiên đã đóng / app vừa mở lại)
  let arBusy = false;
  setInterval(async () => {
    for (const c of S.convs.values()) if (c.autoRes) paintAutoRes(c);
    if (arBusy || !S.settings) return;
    const st = readAR();
    const due = Object.entries(st).filter(([, v]) => v.on && v.at <= Date.now());
    if (!due.length) return;
    arBusy = true;
    try {
      for (const [sid, v] of due) {
        const c = CG.app && (await CG.app.convFor(sid).catch(() => null));
        if (!c) { const o = readAR(); delete o[sid]; localStorage.setItem(AR_KEY, JSON.stringify(o)); continue; }
        if (c.busy) continue;
        const msgText = (v.msg || '').trim() || 'Giới hạn sử dụng đã hồi. Hãy làm tiếp phần việc còn dở cho xong.';
        autoResOff(c);
        await c.send(msgText, msgText + ' · tự gửi khi giới hạn hồi');
        if (!document.hasFocus()) api.notify('Claude GUI · chạy tiếp', `${c.title || 'Phiên'}: giới hạn đã hồi, đã tự gửi lời nhắn chạy tiếp.`);
        await new Promise((r) => setTimeout(r, 4000)); // nhiều phiên cùng chờ → gửi cách nhau
      }
    } finally { arBusy = false; }
  }, 1000);
  function fmtReset(v) {
    const d = new Date(v);
    if (!v || isNaN(d)) return '';
    const mins = Math.round((d - Date.now()) / 60000);
    if (mins <= 0) return 'Đã làm mới';
    if (mins < 60) return `Làm mới sau ${mins} phút`;
    if (mins < 24 * 60) { const hh = Math.floor(mins / 60), mm = mins % 60; return `Làm mới sau ${hh} giờ${mm ? ` ${mm} phút` : ''}`; }
    const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
    const p2 = (n) => String(n).padStart(2, '0');
    return `Làm mới ${wd} ${p2(d.getDate())}/${p2(d.getMonth() + 1)} lúc ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function limitRow(r) {
    const pct = Math.max(0, Math.min(100, r.pct));
    const cls = r.severity === 'critical' || r.severity === 'exceeded' || pct >= 90 ? 'err' : r.severity === 'warning' || pct >= 75 ? 'warn' : '';
    return h('div', { class: 'u-row' },
      h('div', { class: 'u-head' }, h('span', { text: r.label }), h('span', { class: 'u-val', text: `${Math.round(pct)}% đã dùng` })),
      bar(pct / 100, cls),
      r.reset ? h('div', { class: 'u-sub', text: fmtReset(r.reset) }) : null);
  }
  // Sau mỗi lượt trả lời: cập nhật % giới hạn gói (hỏi qua phiên CLI đang chạy, tối đa 1 lần/phút)
  function maybeRefreshUsage() {
    if (S.usage && Date.now() - S.usage.t < 60000) return;
    fetchUsage(true);
  }
  let usageFetching = false;
  async function fetchUsage(force) {
    if (usageFetching) return;
    usageFetching = true;
    S.usageLoading = true;
    try {
      const u = await api.planUsage(!!force);
      if (u && u.data) S.usage = u;
      S.usageError = u && u.error ? u.error : null;
    } catch (e) { S.usageError = e.message; }
    usageFetching = false;
    S.usageLoading = false;
    onUsageChanged();
  }
  function onUsageChanged() {
    renderUsageRing();
    if (S.settings.showDetails) refreshDetails();
    if (S.usagePop) S.usagePop();
    if (CG.onUsageChanged) CG.onUsageChanged();
  }
  // opts.breakdown: thêm phân bổ 7 ngày + tín dụng (trang Cài đặt)
  function usageRows(c, opts = {}) {
    const box = h('div', { class: 'usage-rows' });
    if (c) {
      const win = ctxWindowOf(c);
      const pct = c.ctx ? c.ctx / win : 0;
      box.append(h('div', { class: 'u-row' }, h('div', { class: 'u-head' }, h('span', { text: 'Ngữ cảnh' }), h('span', { class: 'u-val', text: c.ctx ? `${fmtTok(c.ctx)} / ${fmtTok(win)} (${Math.round(pct * 100)}%)` : 'chưa có' })), bar(pct, pct > 0.85 ? 'err' : pct > 0.65 ? 'warn' : '')));
      if (c.ctxMax && win < 1000000 && (c.ctxWindow || 0) > win) box.append(h('div', { class: 'u-note', text: `Tự nén khi chạm ${fmtTok(win)} (auto-compact trong cài đặt)` }));
      // Chi tiết như /context: phần nào đang chiếm ngữ cảnh
      if (c.ctxCats && c.ctxCats.length) {
        const VI = { system_prompt: 'System prompt', system_tools: 'Công cụ hệ thống', mcp_instructions: 'Hướng dẫn MCP', mcp_tools: 'Công cụ MCP', skills: 'Skill', messages: 'Tin nhắn', memory_files: 'CLAUDE.md / memory', custom_agents: 'Tác tử tuỳ chỉnh' };
        box.append(h('div', { class: 'u-cats' }, c.ctxCats.slice().sort((a, b) => b.tokens - a.tokens).map((k) =>
          h('div', { class: 'u-cat' }, h('span', { text: VI[k.id] || k.name }), h('span', { class: 'u-val', text: fmtTok(k.tokens) })))));
      }
    }
    const d = S.usage && S.usage.data;
    const rl = d && d.rate_limits;
    const lim = planLimits();
    if (lim.length) {
      for (const [g, title] of [['session', 'Giới hạn phiên (5 giờ)'], ['weekly', 'Giới hạn hàng tuần'], ['other', 'Giới hạn khác']]) {
        const rows = lim.filter((x) => (g === 'other' ? x.group !== 'session' && x.group !== 'weekly' : x.group === g));
        if (!rows.length) continue;
        box.append(h('div', { class: 'u-group', text: title }), ...rows.map(limitRow));
      }
    } else if (d && d.rate_limits_available === false) {
      box.append(h('div', { class: 'note', text: 'Tài khoản này không có giới hạn theo gói (vd. đang dùng API key).' }));
    } else {
      box.append(h('div', { class: 'note', text: S.usageError ? 'Không lấy được mức sử dụng: ' + S.usageError : 'Đang tải mức sử dụng gói…' }));
    }
    const sp = rl && rl.spend;
    if (sp && sp.enabled && sp.used) {
      const f = (m) => (m && typeof m.amount_minor === 'number' ? (m.amount_minor / Math.pow(10, m.exponent || 2)).toFixed(2) + ' ' + (m.currency || '') : '');
      box.append(h('div', { class: 'u-group', text: 'Tín dụng bổ sung' }), h('div', { class: 'u-row' }, h('div', { class: 'u-head' }, h('span', { text: 'Đã dùng' }), h('span', { class: 'u-val', text: f(sp.used) + (sp.limit ? ' / ' + f(sp.limit) : '') })), typeof sp.percent === 'number' ? bar(sp.percent / 100) : null));
    }
    if (opts.breakdown && rl && rl.seven_day_breakdown && Array.isArray(rl.seven_day_breakdown.rows)) {
      box.append(h('div', { class: 'u-group', text: 'Phân bổ mức dùng 7 ngày' }));
      const names = { claude_code: 'Claude Code', chat: 'Trò chuyện', cowork: 'Cowork', other: 'Khác' };
      for (const r of rl.seven_day_breakdown.rows) box.append(h('div', { class: 'u-head u-break' }, h('span', { text: names[r.key] || r.display_name || r.key }), h('span', { class: 'u-val', text: `${Math.round(r.percent || 0)}%` })));
    }
    const foot = h('div', { class: 'u-foot' });
    if (c && c.cost) foot.append(h('div', { text: `Chi phí phiên này (ước tính theo giá API): $${c.cost.toFixed(c.cost < 1 ? 3 : 2)}` }));
    const upd = h('div', { class: 'u-upd' }, h('span', { text: S.usageLoading ? 'Đang cập nhật…' : S.usage && S.usage.t ? `Cập nhật lúc ${new Date(S.usage.t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : '' }));
    if (!S.usageLoading) upd.append(h('button', { class: 'link-btn', text: 'Làm mới', onclick: (e) => { e.stopPropagation(); fetchUsage(true); onUsageChanged(); } }));
    foot.append(upd);
    box.append(foot);
    return box;
  }
  // ---------- Cửa sổ /usage (giống bản desktop: giới hạn gói + điều gì đang dùng nhiều) ----------
  const BEHAVIORS = {
    long_context: ['Ngữ cảnh dài', 'Nhiều yêu cầu gửi kèm ngữ cảnh rất lớn. Dùng /compact hoặc mở phiên mới khi đổi việc.'],
    always_on_context: ['Ngữ cảnh luôn nạp sẵn', 'CLAUDE.md, công cụ MCP, skill… được gửi kèm mọi yêu cầu. Bớt MCP/skill không dùng.'],
    cache_miss: ['Trượt bộ nhớ đệm', 'Prompt không dùng lại được cache (thường do nghỉ lâu giữa các tin nhắn).'],
    subagent_heavy: ['Dùng nhiều tác tử phụ', 'Tác tử phụ (Agent/Task) chạy song song tốn thêm lượt.'],
    high_parallel: ['Chạy song song nhiều', 'Nhiều phiên/tác tử chạy cùng lúc.'],
    cron: ['Tác vụ định kỳ', 'Các lệnh /loop, lịch chạy tự động.'],
    max_effort: ['Effort tối đa', 'Mức suy nghĩ max tốn nhiều token hơn — hạ effort cho việc đơn giản.'],
    workflow: ['Workflow nhiều tác tử', 'Các workflow điều phối nhiều tác tử.'],
    large_tool_results: ['Kết quả công cụ lớn', 'Đọc tệp lớn / output lệnh dài làm phình ngữ cảnh.'],
  };
  function showUsageDialog() {
    const c = S.active;
    const body = h('div', { class: 'usage-dlg' });
    const m = CG.modal(null, body, [], { cls: 'usage-modal' });
    let full = null, loading = true, err = null, range = 'week';
    const fmtNum = (n) => (n || 0).toLocaleString('vi-VN');
    const bigRow = (r) => {
      const pct = Math.max(0, Math.min(100, r.pct));
      const cls = r.severity === 'critical' || pct >= 90 ? 'err' : r.severity === 'warning' || pct >= 75 ? 'warn' : '';
      return h('div', { class: 'ud-limit' },
        h('div', { class: 'ud-l' }, h('div', { class: 'ud-name', text: r.label }), h('div', { class: 'ud-reset', text: r.reset ? fmtReset(r.reset) : '' })),
        h('div', { class: 'ud-bar' }, bar(pct / 100, cls)),
        h('div', { class: 'ud-pct', text: `${Math.round(pct)}% đã dùng` }));
    };
    const render = () => {
      if (!body.isConnected && body.parentNode) return;
      body.innerHTML = '';
      const d = (full && full.data) || (S.usage && S.usage.data) || null;
      const plan = (d && d.subscription_type) || (S.info && S.info.account && S.info.account.subscriptionType) || '';
      const refresh = h('button', { class: 'icon-btn sm', title: 'Làm mới', html: svg('refresh', 15), onclick: load });
      body.append(h('div', { class: 'ud-head' },
        h('h2', { text: 'Mức sử dụng' }), plan ? h('span', { class: 'ud-plan', text: /^max|pro|team|enterprise/i.test(plan) ? 'Claude ' + plan[0].toUpperCase() + plan.slice(1) : plan }) : null,
        h('span', { class: 'spacer' }), loading ? h('span', { class: 'spinner' }) : refresh,
        h('button', { class: 'icon-btn sm', title: 'Đóng (Esc)', html: svg('x', 15), onclick: m.close })));
      // Giới hạn gói
      const lim = planLimits();
      const sec1 = h('div', { class: 'ud-sec' });
      if (lim.length) {
        for (const [g, title] of [['session', 'Giới hạn sử dụng gói'], ['weekly', 'Giới hạn hàng tuần']]) {
          const rows = lim.filter((x) => (g === 'session' ? x.group === 'session' : x.group !== 'session'));
          if (!rows.length) continue;
          sec1.append(h('div', { class: 'ud-title', text: title }), ...rows.map(bigRow));
        }
      } else sec1.append(h('div', { class: 'note', text: err ? 'Không lấy được mức sử dụng: ' + err : d && d.rate_limits_available === false ? 'Tài khoản này không có giới hạn theo gói (vd. dùng API key).' : 'Đang tải…' }));
      const sp = d && d.rate_limits && d.rate_limits.spend;
      if (sp && sp.enabled && sp.used) {
        const f = (x) => (x && typeof x.amount_minor === 'number' ? (x.amount_minor / Math.pow(10, x.exponent || 2)).toFixed(2) + ' ' + (x.currency || '') : '—');
        sec1.append(h('div', { class: 'ud-title', text: 'Tín dụng bổ sung' }), bigRow({ label: `Đã dùng ${f(sp.used)}${sp.limit ? ' / ' + f(sp.limit) : ''}`, pct: sp.percent || 0 }));
      }
      body.append(sec1);
      // Phiên này
      if (c) {
        const ses = full && full.key === c.key && d && d.session;
        const win = ctxWindowOf(c);
        const stats = [
          ['Ngữ cảnh', c.ctx ? `${fmtTok(c.ctx)} / ${fmtTok(win)} (${Math.round((c.ctx / win) * 100)}%)` : 'chưa có'],
          ['Chi phí ước tính', `$${((ses && ses.total_cost_usd) || c.cost || 0).toFixed(3)}`],
        ];
        if (ses) {
          stats.push(['Thời gian API', `${Math.round((ses.total_api_duration_ms || 0) / 1000)} giây`], ['Dòng code', `+${fmtNum(ses.total_lines_added)} / −${fmtNum(ses.total_lines_removed)}`]);
          for (const [mn, u] of Object.entries(ses.model_usage || {})) stats.push([mn.replace(/^claude-/, ''), `${fmtTok((u.inputTokens || 0) + (u.cacheReadInputTokens || 0) + (u.cacheCreationInputTokens || 0))} vào · ${fmtTok(u.outputTokens || 0)} ra`]);
        }
        body.append(h('div', { class: 'ud-sec' }, h('div', { class: 'ud-title', text: 'Phiên này' }),
          h('div', { class: 'ud-stats' }, stats.map(([k, v]) => h('div', { class: 'ud-stat' }, h('span', { text: k }), h('b', { text: v }))))));
      }
      // Điều gì đang dùng nhiều
      const bh = d && d.behaviors;
      const sec3 = h('div', { class: 'ud-sec' });
      const tabs = h('div', { class: 'seg sm' },
        h('button', { class: range === 'day' ? 'on' : '', text: 'Hôm nay', onclick: () => { range = 'day'; render(); } }),
        h('button', { class: range === 'week' ? 'on' : '', text: '7 ngày', onclick: () => { range = 'week'; render(); } }));
      sec3.append(h('div', { class: 'ud-title row' }, h('span', { text: 'Điều gì đang dùng nhiều nhất' }), h('span', { class: 'spacer' }), tabs));
      const w = bh && bh[range];
      if (!w) sec3.append(h('div', { class: 'note', text: loading ? 'Đang phân tích các phiên gần đây…' : 'Chưa có dữ liệu phân tích.' }));
      else {
        sec3.append(h('div', { class: 'ud-sub', text: `${fmtNum(w.request_count)} yêu cầu · ${fmtNum(w.session_count)} phiên trên máy này` }));
        for (const b of w.behaviors || []) {
          const [name, tip] = BEHAVIORS[b.key] || [b.key, ''];
          sec3.append(h('div', { class: 'ud-beh' },
            h('div', { class: 'u-head' }, h('span', { text: name }), h('span', { class: 'u-val', text: `${Math.round(b.pct)}% mức dùng · ${fmtNum(b.count)} yêu cầu` })),
            bar(b.pct / 100, b.pct >= 75 ? 'warn' : ''), tip ? h('div', { class: 'u-sub', text: tip }) : null));
        }
        const groups = [['skills', 'Skill'], ['agents', 'Tác tử'], ['mcp_servers', 'MCP server'], ['plugins', 'Plugin']].filter(([k]) => (w[k] || []).length);
        if (groups.length) {
          sec3.append(h('div', { class: 'ud-tags' }, groups.flatMap(([k, lbl]) => w[k].map((x) => h('span', { class: 'ud-tag', title: lbl }, h('i', { text: lbl }), ` ${x.name} · ${Math.round(x.pct)}%`)))));
        }
      }
      body.append(sec3);
      const t = (full && full.t) || (S.usage && S.usage.t);
      body.append(h('div', { class: 'ud-foot', text: (t ? `Cập nhật lúc ${new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ` : '') + 'Dữ liệu lấy qua Claude CLI (giống lệnh /usage), không tốn lượt dùng.' }));
    };
    async function load() {
      loading = true; err = null; render();
      try {
        const r = await api.planUsageFull(c && c.key);
        if (r && r.data) { full = r; S.usage = { t: r.t, data: r.data }; }
        if (r && r.error) err = r.error;
      } catch (e) { err = e.message; }
      loading = false;
      render();
      renderUsageRing();
    }
    render();
    load();
  }
  function usagePopover() {
    const c = S.active;
    const st = popover($('#ctl-usage'), (el, close, state) => {
      el.classList.add('pad', 'usage-pop');
      const render = () => {
        if (!el.isConnected && el.parentNode) return;
        el.innerHTML = '';
        el.append(h('div', { class: 'pop-title row' }, h('span', { text: 'Mức sử dụng' }), h('span', { class: 'spacer' }),
          h('button', { class: 'link-btn', text: 'Chi tiết (/usage)', onclick: () => { close(); showUsageDialog(); } })), usageRows(c));
        if (c && c.persisted && !c.busy) el.append(h('button', { class: 'btn sm', text: 'Nén ngữ cảnh (/compact)', onclick: () => { close(); c.send('/compact', '/compact'); } }));
        if (el.isConnected) state.reposition();
      };
      S.usagePop = render;
      render();
      if (c) c.fetchContext();
    }, { place: 'top', align: 'right', onClose: () => { S.usagePop = null; } });
    if (st) fetchUsage(false);
  }

  function modeMenu() {
    const c = S.active;
    const items = [{ header: 'Chế độ quyền  ·  Shift+Tab để đổi nhanh' }];
    for (const m of MODES) {
      if (m.v === 'bypassPermissions' && !S.settings.allowBypass) continue;
      items.push({ label: m.label, desc: m.desc, icon: m.icon, checked: c.mode === m.v, danger: m.danger, onClick: () => setMode(m.v) });
    }
    if (!S.settings.allowBypass) items.push('-', { label: 'Bật chế độ "Bỏ qua quyền" trong Cài đặt…', icon: 'settings', onClick: () => CG.openSettings('code') });
    menu($('#ctl-mode'), items, { checks: true, place: 'top' });
  }
  function setMode(mode) {
    const c = S.active;
    if (!c) return;
    c.mode = mode;
    // Nhớ chế độ theo thư mục (trừ Lập kế hoạch — chỉ áp dụng cho phiên hiện tại)
    if (mode !== 'plan' && c.cwd) saveSettings({ modeByFolder: { ...(S.settings.modeByFolder || {}), [c.cwd.toLowerCase()]: mode } });
    api.running(c.key).then((r) => { if (r) c.control({ subtype: 'set_permission_mode', mode }); });
    updateComposer();
  }

  function modelPopover(focusEffort) {
    const c = S.active;
    popover($('#ctl-model'), (el, close) => {
      el.classList.add('model-pop');
      el.append(h('div', { class: 'menu-header', text: 'Model' }));
      const mkRow = (m) => {
        const name = m.value === 'default' ? `Mặc định (${modelLabel('default')})` : m.displayName;
        const desc = m.value === 'default' ? (S.claudeSettings && S.claudeSettings.model ? 'Theo cài đặt Claude Code của bạn' : 'Model khuyên dùng') : (m.description || '').replace(/^.*?·\s*/, '');
        const row = h('div', { class: 'menu-item' + (c.model === m.value ? ' checked' : '') },
          h('span', { class: 'mi-check', html: c.model === m.value ? svg('check', 14) : '' }),
          h('div', { class: 'mi-body' }, h('div', { class: 'mi-label', text: name }), desc ? h('div', { class: 'mi-desc', text: desc }) : null));
        row.onclick = () => { setModel(m.value); close(); };
        return row;
      };
      const main = models().filter((m) => !/^claude-/.test(m.value));
      const older = models().filter((m) => /^claude-/.test(m.value));
      main.forEach((m) => el.append(mkRow(m)));
      if (older.length) {
        const showOld = older.some((m) => m.value === c.model);
        const box = h('div', { class: showOld ? '' : 'hidden' }, older.map(mkRow));
        const tgl = h('div', { class: 'menu-item more-models' }, h('span', { class: 'mi-check' }), h('div', { class: 'mi-body' }, h('div', { class: 'mi-label', text: `Model khác (${older.length})` })), icon(showOld ? 'chevronDown' : 'chevronRight', 14, 'mi-icon'));
        tgl.onclick = (e) => { e.stopPropagation(); box.classList.toggle('hidden'); tgl.lastChild.innerHTML = svg(box.classList.contains('hidden') ? 'chevronRight' : 'chevronDown', 14); };
        el.append(tgl, box);
      }
      el.append(h('div', { class: 'menu-sep' }));
      const cur = c.effort || defaultEffort(c.model);
      const supported = (modelInfo(c.model) || {}).supportedEffortLevels;
      const idx = Math.max(0, EFFORTS.findIndex((e) => e.v === cur));
      const val = h('span', { class: 'eff-val', text: effortLabel(cur) + (c.effort ? '' : ' (mặc định)') });
      const range = h('input', { type: 'range', min: 0, max: EFFORTS.length - 1, step: 1, value: idx, class: 'eff-range' });
      const paint = () => range.style.setProperty('--p', (range.value / (EFFORTS.length - 1)) * 100 + '%');
      paint();
      range.oninput = () => {
        let v = +range.value;
        if (supported && !supported.includes(EFFORTS[v].v)) v = EFFORTS.findIndex((e) => supported.includes(e.v));
        val.textContent = EFFORTS[v].label;
        paint();
      };
      range.onchange = () => { setEffort(EFFORTS[+range.value].v); val.textContent = EFFORTS[+range.value].label; };
      const ticks = h('div', { class: 'eff-ticks' }, EFFORTS.map((e, i) => h('span', { text: e.label, onclick: () => { range.value = i; range.oninput(); range.onchange(); } })));
      const reset = h('button', { class: 'link-btn', text: 'Đặt về mặc định', onclick: () => { setEffort(''); close(); } });
      el.append(h('div', { class: 'eff' },
        h('div', { class: 'eff-head' }, h('span', { class: 'eff-title' }, icon('gauge', 14), 'Effort'), val),
        h('div', { class: 'eff-desc', text: 'Kéo để chọn mức độ suy nghĩ: cao hơn = kỹ hơn nhưng chậm và tốn hơn.' }),
        range, ticks, c.effort ? reset : null));
      if (focusEffort) setTimeout(() => range.focus(), 20);
    }, { place: 'top', align: 'right' });
  }
  // Model/effort riêng của từng phiên, nhớ qua các lần mở app (lựa chọn gần nhất cũng là mặc định cho phiên mới)
  const SESS_PREFS = 'cg.sessPrefs';
  function sessPrefs() {
    try { return JSON.parse(localStorage.getItem(SESS_PREFS)) || {}; } catch { return {}; }
  }
  function saveSessPref(c) {
    try {
      const all = sessPrefs();
      delete all[c.sid];
      all[c.sid] = { model: c.model, effort: c.effort || '', t: Date.now() };
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete all[k];
      localStorage.setItem(SESS_PREFS, JSON.stringify(all));
    } catch {}
  }
  function setModel(v) {
    const c = S.active;
    c.model = v;
    saveSessPref(c);
    saveSettings({ model: v });
    api.running(c.key).then((r) => { if (r) c.control({ subtype: 'set_model', model: v }); });
    updateComposer();
  }
  function setEffort(v) {
    const c = S.active;
    c.effort = v;
    saveSessPref(c);
    saveSettings({ effort: v });
    api.running(c.key).then((r) => { if (r) { c.respawn = true; toast('Effort mới áp dụng từ tin nhắn tiếp theo.'); } });
    updateComposer();
  }

  function recentDirs() {
    const out = [];
    const add = (d) => { if (d && !out.some((x) => samePath(x, d))) out.push(d); };
    (S.settings.recentDirs || []).forEach(add);
    S.all.forEach((s) => add(s.cwd));
    return out.slice(0, 12);
  }
  function folderMenu() {
    const c = S.active;
    if (!c || c.count > 0 || c.persisted) return;
    const items = [{ header: 'Thư mục dự án' }];
    for (const d of recentDirs()) items.push({ label: basename(d) || d, desc: d, icon: 'folder', checked: samePath(d, c.cwd), onClick: () => setConvDir(c, d) });
    items.push('-', { label: 'Chọn thư mục khác…', icon: 'folderOpen', onClick: async () => { const d = await api.pickDir(c.cwd); if (d) setConvDir(c, d); } });
    const repo = c.git && c.git.repo;
    items.push('-', {
      label: 'Chạy trong git worktree riêng', icon: 'branch', checked: c.worktree, disabled: !repo,
      desc: repo ? 'Tạo nhánh và thư mục làm việc tách biệt cho phiên này' : 'Chỉ dùng được khi thư mục là git repo',
      onClick: () => { c.worktree = !c.worktree; updateComposer(); },
    });
    menu($('#ctl-folder'), items, { checks: true, place: 'top', cls: 'paths' });
  }
  function setConvDir(c, dir) {
    c.cwd = dir;
    c.worktree = false;
    c.mode = modeFor(dir);
    if (c.mode === 'bypassPermissions' && !S.settings.allowBypass) c.mode = 'default';
    c.git = null;
    c.refreshGit();
    saveSettings({ lastDir: dir });
    updateComposer();
    updateHero();
    loadInfo(dir);
    if (TERM.open && S.active === c) syncTerminal(false);
  }
  function onConvStarted(c) {
    const recent = [c.cwd, ...(S.settings.recentDirs || []).filter((d) => !samePath(d, c.cwd))].slice(0, 15);
    saveSettings({ recentDirs: recent, lastDir: c.cwd });
    updateHero();
    updateComposer();
    updateTitlebar();
  }

  function plusMenu() {
    menu($('#btn-plus'), [
      { label: 'Thêm tệp hoặc ảnh', icon: 'paperclip', onClick: () => $('#file-input').click() },
      { label: 'Nhắc tới tệp', desc: 'Chèn @đường-dẫn để Claude đọc tệp', icon: 'at', kbd: '@', onClick: () => insertAtCaret('@') },
      { label: 'Lệnh slash', desc: 'Kỹ năng, lệnh tùy chỉnh, /compact…', icon: 'slash', kbd: '/', onClick: () => { if (!els.input.value.trim()) { els.input.value = '/'; } els.input.focus(); onInput(); } },
    ], { place: 'top' });
  }
  function insertAtCaret(text) {
    const t = els.input;
    const s = t.selectionStart, e = t.selectionEnd;
    const before = t.value.slice(0, s);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    t.value = before + pad + text + t.value.slice(e);
    t.selectionStart = t.selectionEnd = s + pad.length + text.length;
    t.focus();
    onInput();
  }

  // ---------- Autocomplete (/ lệnh, @ tệp) ----------
  // Đặt height='auto' để đo làm ô nhập về đầu (scrollTop = 0) → gõ dài/xuống dòng thì dòng đang gõ bị khuất.
  // Giữ vị trí cuộn, đưa con trỏ vào tầm nhìn, và giữ hội thoại bám đáy khi ô nhập cao lên.
  function keepCaretVisible(t, prevTop) {
    t.scrollTop = prevTop;
    if (t.scrollHeight <= t.clientHeight) return;
    if (t.selectionEnd >= t.value.length) { t.scrollTop = t.scrollHeight; return; }
    // Con trỏ ở giữa: ước lượng dòng của con trỏ bằng một bản sao ẩn
    const m = autosize.mirror || (autosize.mirror = h('div', { 'aria-hidden': 'true' }));
    const cs = getComputedStyle(t);
    m.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;box-sizing:${cs.boxSizing};width:${t.clientWidth}px;font:${cs.font};line-height:${cs.lineHeight};padding:${cs.padding};letter-spacing:${cs.letterSpacing}`;
    m.textContent = t.value.slice(0, t.selectionEnd) + '​';
    if (!m.isConnected) document.body.append(m);
    const y = m.scrollHeight, lh = parseFloat(cs.lineHeight) || 22;
    if (y > t.scrollTop + t.clientHeight) t.scrollTop = y - t.clientHeight + 4;
    else if (y - lh < t.scrollTop) t.scrollTop = Math.max(0, y - lh - 4);
  }
  function autosize() {
    const t = els.input;
    const sc = els.scroller;
    const stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
    const top = t.scrollTop;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, window.innerHeight * 0.4) + 'px';
    keepCaretVisible(t, top);
    if (stick) sc.scrollTop = sc.scrollHeight;
  }
  function allCommands() {
    const local = new Set(LOCAL_COMMANDS.map((c) => c.name));
    return [...LOCAL_COMMANDS, ...((S.info && S.info.commands) || []).filter((c) => !c.name.startsWith('_') && !local.has(c.name))];
  }
  async function getFiles(cwd) {
    const c = S.files.get(cwd);
    if (c && Date.now() - c.t < 30000) return c.files;
    const files = await api.listFiles(cwd);
    S.files.set(cwd, { t: Date.now(), files });
    return files;
  }
  function rankFiles(files, q) {
    q = q.toLowerCase().replace(/\\/g, '/');
    if (!q) return files.slice().sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length).slice(0, 50);
    const scored = [];
    for (const f of files) {
      const lf = f.toLowerCase();
      const base = lf.split('/').pop();
      let s = -1;
      if (base.startsWith(q)) s = 0;
      else if (base.includes(q)) s = 1;
      else if (lf.includes(q)) s = 2;
      else {
        let i = 0;
        for (const ch of lf) if (ch === q[i]) i++;
        if (i === q.length) s = 3;
      }
      if (s >= 0) scored.push([s, f.length, f]);
    }
    return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 50).map((x) => x[2]);
  }
  let acSeq = 0;
  async function updateAc() {
    const t = els.input;
    const v = t.value, caret = t.selectionStart;
    const sm = /^\/(\S*)$/.exec(v);
    if (sm && caret === v.length) {
      const q = sm[1].toLowerCase();
      let items = allCommands().filter((c) => c.name.toLowerCase().includes(q) || (c.aliases || []).some((a) => a.toLowerCase().includes(q)));
      items.sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
      return showAc({ type: 'slash', items: items.slice(0, 60) });
    }
    const mm = /(^|\s)@([^\s@]*)$/.exec(v.slice(0, caret));
    const c = S.active;
    if (mm && c && c.cwd) {
      const seq = ++acSeq;
      const files = await getFiles(c.cwd);
      if (seq !== acSeq) return;
      const sess = CG.parity ? CG.parity.mentionItems(mm[2]) : [];
      return showAc({ type: 'mention', items: [...sess, ...rankFiles(files, mm[2])], start: caret - mm[2].length - 1, end: caret });
    }
    closeAc();
  }
  function showAc(ac) {
    if (!ac.items.length) return closeAc();
    const prevIdx = S.ac && S.ac.type === ac.type ? S.ac.idx : 0;
    S.ac = { ...ac, idx: Math.min(prevIdx, ac.items.length - 1) };
    const m = els.ac;
    m.innerHTML = '';
    m.append(h('div', { class: 'menu-header', text: ac.type === 'slash' ? 'Lệnh' : 'Tệp trong dự án' }));
    ac.items.forEach((it, i) => {
      let row;
      if (ac.type === 'slash') {
        row = h('div', { class: 'menu-item ac-row' + (i === S.ac.idx ? ' sel' : ''), title: [('/' + it.name + ' ' + (it.argumentHint || '')).trim(), it.description || ''].join('\n') },
          h('span', { class: 'ac-name', text: '/' + it.name }),
          it.argumentHint ? h('span', { class: 'ac-hint', text: it.argumentHint }) : null,
          h('span', { class: 'ac-desc', text: it.description || '' }));
      } else if (it.sess) {
        row = h('div', { class: 'menu-item ac-row' + (i === S.ac.idx ? ' sel' : ''), title: `Nhắc tới phiên: ${it.sess.title}\n${it.sess.cwd || ''}` },
          icon('message', 14, 'mi-icon'), h('span', { class: 'ac-name', text: it.sess.title }), h('span', { class: 'ac-desc', text: `${basename(it.sess.cwd || '')} · ${it.sess.status}` }));
      } else {
        const parts = it.split('/');
        row = h('div', { class: 'menu-item ac-row' + (i === S.ac.idx ? ' sel' : ''), title: it },
          icon('file', 14, 'mi-icon'), h('span', { class: 'ac-name', text: parts.pop() }), h('span', { class: 'ac-desc', text: parts.join('/') }));
      }
      row.onmousedown = (e) => { e.preventDefault(); pickAc(i); };
      m.append(row);
    });
    m.classList.remove('hidden');
    const sel = m.querySelectorAll('.ac-row')[S.ac.idx];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function closeAc() { els.ac.classList.add('hidden'); S.ac = null; }
  function pickAc(i) {
    const ac = S.ac;
    if (!ac) return;
    const it = ac.items[i];
    const t = els.input;
    if (ac.type === 'slash') t.value = '/' + it.name + ' ';
    else {
      const ins = it.sess ? `@phiên:${it.sess.id.slice(0, 8)}(${(it.sess.title || '').replace(/[()\n]/g, ' ').slice(0, 40).trim()}) ` : '@' + it + ' ';
      t.value = t.value.slice(0, ac.start) + ins + t.value.slice(ac.end);
      t.selectionStart = t.selectionEnd = ac.start + ins.length;
    }
    closeAc();
    autosize();
    updateComposer();
    t.focus();
  }
  function onInput() { autosize(); updateAc(); updateComposer(); }

  // ---------- Danh sách trong ô nhập (giống bản desktop) ----------
  // "- ", "* ", "1. ", "1) ", "- [ ] " → xuống dòng tự thêm dấu/số tiếp theo; mục trống + xuống dòng → thoát danh sách
  const LIST_RE = /^(\s*)(?:([-*+•])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;
  function typeText(ta, text) {
    ta.focus();
    // execCommand giữ được Ctrl+Z và tự phát sự kiện input
    if (!(text ? document.execCommand('insertText', false, text) : document.execCommand('delete'))) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }
  function listLine(ta) {
    const v = ta.value, s = ta.selectionStart;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', s);
    if (le < 0) le = v.length;
    const m = LIST_RE.exec(v.slice(ls, le));
    return m ? { m, ls, le, before: v.slice(ls, s), after: v.slice(s, le) } : null;
  }
  function listNewline(ta) {
    if (ta.selectionStart !== ta.selectionEnd) return false;
    const L = listLine(ta);
    if (!L || L.before.length < L.m[0].length) return false;
    const { m } = L;
    if (L.before.length === m[0].length && !L.after.trim()) {
      // Mục rỗng → bỏ dấu đầu dòng, kết thúc danh sách
      ta.setSelectionRange(L.ls, L.le);
      typeText(ta, '');
      return true;
    }
    const marker = m[3] ? +m[3] + 1 + m[4] : m[2];
    typeText(ta, '\n' + m[1] + marker + m[5] + (m[6] ? '[ ] ' : ''));
    return true;
  }
  function listIndent(ta, out) {
    const L = listLine(ta);
    if (!L) return false;
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (out) {
      const n = L.m[1].startsWith('\t') ? 1 : Math.min(2, /^ */.exec(L.m[1])[0].length);
      if (!n) return true;
      ta.setSelectionRange(L.ls, L.ls + n);
      typeText(ta, '');
      ta.setSelectionRange(Math.max(L.ls, s - n), Math.max(L.ls, e - n));
    } else {
      ta.setSelectionRange(L.ls, L.ls);
      typeText(ta, '  ');
      ta.setSelectionRange(s + 2, e + 2);
    }
    return true;
  }
  CG.listKeys = (ta, e) => {
    if (e.isComposing) return false;
    const ctrlMode = S.settings.sendKey === 'ctrlEnter';
    const newline = e.key === 'Enter' && (ctrlMode ? !e.ctrlKey : e.shiftKey && !e.ctrlKey);
    if (newline && listNewline(ta)) { e.preventDefault(); return true; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && listIndent(ta, e.shiftKey)) { e.preventDefault(); return true; }
    return false;
  };

  async function addFiles(files) {
    for (const f of files) {
      if (/^image\/(png|jpeg|gif|webp)$/.test(f.type) && f.size < 5 * 1024 * 1024) {
        const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        S.attachments.push({ kind: 'image', mime: f.type, data: String(url).split(',')[1], url, name: f.name });
      } else {
        const p = api.pathForFile(f);
        if (p) S.attachments.push({ kind: 'file', path: p, name: f.name || basename(p) });
        else toast('Không đọc được tệp ' + (f.name || ''), true);
      }
    }
    renderAttachments();
  }
  function renderAttachments() {
    const box = els.atts;
    box.innerHTML = '';
    box.classList.toggle('hidden', !S.attachments.length);
    S.attachments.forEach((a, i) => {
      const x = h('button', { class: 'x', html: svg('x', 12), title: 'Bỏ', onclick: () => { S.attachments.splice(i, 1); renderAttachments(); } });
      if (a.kind === 'image') box.append(h('div', { class: 'att', title: a.name }, h('img', { src: a.url }), x));
      else if (a.kind === 'ctx') box.append(h('div', { class: 'ctx-chip', title: a.text }, a.url ? h('img', { src: a.url, style: 'height:18px;max-width:40px;border-radius:3px' }) : icon('code', 13), h('span', { class: 'ellipsis', text: a.name }), x));
      else box.append(h('div', { class: 'att file', title: a.path }, icon('file', 14), h('span', { text: a.name }), x));
    });
    updateComposer();
  }

  async function submit() {
    if (S.active && S.active.child) return;
    const c = S.active;
    if (!c) return;
    const text = els.input.value;
    const atts = S.attachments;
    if (!text.trim() && !atts.length) { if (c.busy) c.interrupt(); return; }
    if (!c.cwd) { toast('Hãy chọn thư mục dự án trước.', true); return folderMenu(); }
    const t = text.trim();
    if (/^\/(clear|new)\s*$/.test(t)) { els.input.value = ''; autosize(); closeAc(); newSession(c.cwd); return; }
    // /btw <câu hỏi> → hỏi bên lề (không chen vào phiên chính)
    const btwM = /^\/btw(?:\s+([\s\S]*))?$/.exec(t);
    if (btwM && CG.btw) { els.input.value = ''; autosize(); closeAc(); updateComposer(); CG.btw.open(); if (btwM[1] && btwM[1].trim()) CG.btw.ask(btwM[1]); return; }
    if (/^\/usage\s*$/.test(t)) { els.input.value = ''; autosize(); closeAc(); updateComposer(); showUsageDialog(); return; }
    els.input.value = '';
    S.attachments = [];
    renderAttachments();
    autosize();
    closeAc();
    const files = atts.filter((a) => a.kind === 'file').map((a) => a.path);
    let finalText = text.replace(/\s+$/, '');
    if (CG.parity && /@phiên:/.test(finalText)) finalText = await CG.parity.expandMentions(finalText);
    if (files.length) finalText = (finalText ? finalText + '\n\n' : '') + 'Tệp đính kèm:\n' + files.map((f) => '- ' + f).join('\n');
    // ngữ cảnh đính kèm (phần tử chọn trên trang web…): mô tả dạng chữ + ảnh chụp vùng đó
    for (const a of atts.filter((x) => x.kind === 'ctx')) finalText = (finalText ? finalText + '\n\n' : '') + a.text;
    const images = atts.filter((a) => a.kind === 'image' || (a.kind === 'ctx' && a.data));
    let content;
    if (!images.length) content = finalText;
    else {
      content = images.map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } }));
      if (finalText) content.push({ type: 'text', text: finalText });
    }
    let display = finalText;
    // thói quen: câu gõ đi gõ lại → robot gợi ý lưu thành lệnh tắt
    if (!files.length && !images.length && CG.mascot && CG.mascot.onPrompt) CG.mascot.onPrompt(c, t);
    if (CG.lark) ({ content, display } = CG.lark.bundle(c, content, finalText));
    await c.send(content, display, images.map((a) => a.url));
    updateComposer();
  }

  // ---------- Tác tử phụ / tác vụ nền ----------
  const TASK_DONE_KEEP = 90 * 1000;
  function taskRunning(t) { return t.status === 'running' || t.status === 'pending'; }
  function fmtDur(secs) { return secs >= 3600 ? `${Math.floor(secs / 3600)}g ${Math.floor(secs / 60) % 60}p` : secs >= 60 ? `${Math.floor(secs / 60)}p ${secs % 60}s` : `${secs}s`; }
  function taskKind(t) {
    if (t.type === 'local_bash') return 'Lệnh nền';
    if (t.type === 'local_workflow') return t.workflow ? `Workflow ${t.workflow}` : 'Workflow';
    if (t.type === 'remote_agent') return 'Tác tử từ xa';
    if (t.type && t.type.startsWith('monitor')) return 'Theo dõi';
    return t.agent && t.agent !== 'general-purpose' ? `Tác tử ${t.agent}` : 'Tác tử phụ';
  }
  function taskStatusText(t) {
    if (taskRunning(t)) return t.bg ? 'Đang chạy nền' : 'Đang chạy';
    return { completed: 'Xong', failed: 'Lỗi' }[t.status] || 'Đã dừng';
  }
  // Lệnh chạy server in ra địa chỉ localhost → địa chỉ đó; server chạy nền chưa in gì → đoán cổng từ lệnh
  function serverUrl(card, content) {
    if (!/^(Bash|PowerShell|BashOutput|TaskOutput|Monitor)$/.test(card.name)) return '';
    const inp = card.input || {};
    const txt = resultText(content) + '\n' + (inp.command || '');
    const m = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?(?:\/[^\s'"`<>)\]]*)?/i.exec(txt);
    let url = m && m[0].replace(/0\.0\.0\.0/, 'localhost').replace(/[.,;:]+$/, '');
    // server chạy nền (run_in_background) chưa in địa chỉ: đoán cổng từ lệnh (http.server 8000, --port 3000, -p 5173)
    if (!url && inp.run_in_background && inp.command) {
      const pm = /http\.server\s+(\d{2,5})|--port[= ](\d{2,5})|\s-p\s+(\d{2,5})\b|\bPORT=(\d{2,5})/.exec(inp.command);
      if (pm && /(serve|server|dev|start|vite|next|http\.server|live-server|webpack|preview|flask|uvicorn|rails)/i.test(inp.command)) url = 'http://localhost:' + (pm[1] || pm[2] || pm[3] || pm[4]);
    }
    return url || '';
  }
  function taskLine(t) {
    const secs = Math.max(0, Math.floor(((taskRunning(t) ? Date.now() : t.end || Date.now()) - t.start) / 1000));
    return [taskStatusText(t), t.tools ? `${t.tools} công cụ` : '', t.tokens ? `${fmtTok(t.tokens)} tokens` : '', fmtDur(secs),
      taskRunning(t) && t.last ? `đang dùng ${toolMeta(t.last).label}` : ''].filter(Boolean).join(' · ');
  }
  function renderTasks() {
    const bar = $('#tasks-bar');
    const c = S.active;
    const now = Date.now();
    const list = c ? [...c.tasks.values()].filter((t) => taskRunning(t) || now - (t.end || 0) < TASK_DONE_KEEP) : [];
    if (!list.length) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    if (bar._conv !== c) { bar._conv = c; bar._rows = new Map(); $('.tb-list', bar).innerHTML = ''; }
    const run = list.filter(taskRunning).length;
    const head = run ? `${run} tác vụ đang chạy` + (list.length > run ? ` · ${list.length - run} vừa xong` : '') : `${list.length} tác vụ vừa xong`;
    $('.tb-title', bar).textContent = head;
    $('.tb-dot', bar).className = 'tb-dot ' + (run ? 'run' : 'done');
    // Thu gọn: hiện tác vụ đang chạy gần nhất ngay trên thanh
    const cur = list.filter(taskRunning).sort((a, b) => b.start - a.start)[0];
    $('.tb-cur', bar).textContent = cur ? `${cur.desc || taskKind(cur)}${cur.last ? ` · ${toolMeta(cur.last).label}` : ''}` : '';
    const box = $('.tb-list', bar);
    const keep = new Set();
    for (const t of list.sort((a, b) => (taskRunning(b) - taskRunning(a)) || b.start - a.start)) {
      keep.add(t.id);
      let r = bar._rows.get(t.id);
      if (!r) {
        r = { st: h('span', { class: 'tb-st' }), name: h('span', { class: 'tb-name ellipsis' }), meta: h('span', { class: 'tb-meta' }),
          stop: h('button', { class: 'icon-btn sm tb-stop', html: svg('stop', 12), title: 'Dừng tác vụ này', onclick: (e) => { e.stopPropagation(); c.stopTask(t.id); } }) };
        r.el = h('div', { class: 'tb-row', title: t.desc || '' }, r.st, h('span', { class: 'tb-kind', text: taskKind(t) }), r.name, r.meta, r.stop);
        // Bấm → cuộn tới thẻ công cụ đã tạo tác vụ
        r.el.onclick = () => { const card = t.toolUseId && c.tools.get(t.toolUseId); if (card && card.el.isConnected) { card.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.el.classList.add('flash'); setTimeout(() => card.el.classList.remove('flash'), 1200); } };
        bar._rows.set(t.id, r);
      }
      const running = taskRunning(t);
      const stc = running ? 'run' : t.status === 'completed' ? 'ok' : 'bad';
      if (r.stc !== stc) { r.stc = stc; r.st.className = 'tb-st ' + stc; r.st.innerHTML = running ? '<span class="spinner"></span>' : svg(stc === 'ok' ? 'check' : 'x', 13); }
      r.name.textContent = t.desc || taskKind(t);
      const meta = taskLine(t).replace(/^[^·]+·\s*/, '');
      if (r.meta.textContent !== meta) r.meta.textContent = meta;
      r.stop.classList.toggle('hidden', !running);
      box.append(r.el);
    }
    for (const [id, r] of bar._rows) if (!keep.has(id)) { r.el.remove(); bar._rows.delete(id); }
  }
  function tickTasks() {
    for (const c of [S.active, S.side]) {
      if (!c) continue;
      for (const t of c.runningTasks) { const card = t.toolUseId && c.tools.get(t.toolUseId); if (card && card.setTask) card.setTask(t); }
    }
    // Phiên con đang xem: cập nhật dòng tiến độ của tác tử
    const a = S.active;
    if (a && a.child) {
      const par = [...S.convs.values()].find((x) => x.sid === a.parentId);
      const task = par && par.tasks.get(a.agentId);
      const sub = $('#child-bar .cb-sub');
      if (task && sub && sub.textContent !== taskLine(task)) sub.textContent = taskLine(task);
    }
    renderTasks();
  }

  // ---------- Indicator ----------
  function updateIndicator() {
    const c = S.active;
    const ind = els.indicator;
    if (c && !c.busy && c.runningTasks.length) {
      // Lượt chính đã xong nhưng tác tử phụ vẫn chạy nền — Claude sẽ tự tiếp tục khi chúng xong
      const run = c.runningTasks;
      ind.classList.remove('hidden');
      $('.ind-text', ind).textContent = `Đang chờ ${run.length} ${run.every((t) => t.type === 'local_bash') ? 'lệnh nền' : 'tác vụ chạy nền'}…`;
      const secs = Math.floor((Date.now() - Math.min(...run.map((t) => t.start))) / 1000);
      const tok = run.reduce((s, t) => s + (t.tokens || 0), 0);
      $('.ind-meta', ind).textContent = `(${fmtDur(secs)}${tok ? ` · ${fmtTok(tok)} tokens` : ''})`;
      $('.ind-hint', ind).textContent = 'Claude sẽ tự tiếp tục khi xong';
      $('.logo', ind).classList.add('spin');
      return;
    }
    if (!c || !c.busy) { ind.classList.add('hidden'); return; }
    ind.classList.remove('hidden');
    const secs = Math.floor((Date.now() - c.turnStart) / 1000);
    const waiting = c.perms.size > 0;
    $('.ind-text', ind).textContent = (waiting ? 'Đang chờ bạn trả lời' : c.activity || c.verb) + '…';
    const t = secs >= 60 ? `${Math.floor(secs / 60)}p ${secs % 60}s` : `${secs}s`;
    const nt = c.runningTasks.length;
    $('.ind-meta', ind).textContent = `(${t}${c.outTokens ? ` · ↓ ${fmtTok(c.outTokens)} tokens` : ''}${nt ? ` · ${nt} tác vụ phụ đang chạy` : ''})`;
    $('.ind-hint', ind).textContent = c.summarizing ? 'Đang tóm tắt sau khi dừng · Esc để dừng hẳn'
      : c.queue.length ? `${c.queue.length} tin bổ sung đã gửi · Esc để dừng` : 'Gõ để bổ sung giữa chừng · Esc để dừng';
    $('.logo', ind).classList.toggle('spin', !waiting);
  }

  // ---------- Sidebar ----------
  function sessionItems() {
    const q = els.search.value.trim().toLowerCase();
    const showArchived = S.filter === 'archived';
    const map = new Map();
    const nbHidden = CG.nb ? CG.nb.hiddenSids() : null;
    const btwHidden = CG.btw ? CG.btw.hiddenSids() : null;
    for (const d of S.all) if (!(nbHidden && nbHidden.has(d.id)) && !(btwHidden && btwHidden.has(d.id))) map.set(d.id, { ...d });
    for (const c of S.convs.values()) {
      if (!c.count || c.child || c.nb || c.btw || c.rs) continue;
      const it = map.get(c.sid) || { id: c.sid, title: c.title || 'Phiên mới', cwd: c.cwd, mtime: c.lastActive };
      if (c.title) it.title = c.title;
      if (c.cwd) it.cwd = c.cwd;
      it.mtime = Math.max(it.mtime || 0, c.lastActive);
      it.conv = c;
      map.set(c.sid, it);
    }
    let arr = [...map.values()].filter((it) => isArchived(it.id) === showArchived);
    // phiên con mở từ thẻ gợi ý việc: nằm dưới phiên cha (nếu phiên cha đang trong danh sách)
    if (CG.suggest) { const ids = new Set(arr.map((it) => it.id)); arr = arr.filter((it) => { const p = CG.suggest.parentOf(it.id); return !p || !ids.has(p) || !!q; }); }
    if (S.filter === 'running') arr = arr.filter((it) => (it.conv && it.conv.working) || S.extMap.has(it.id));
    if (q) arr = arr.filter((it) => it.title.toLowerCase().includes(q) || (it.cwd || '').toLowerCase().includes(q));
    return arr.sort((a, b) => b.mtime - a.mtime);
  }
  // ---------- Cây phiên con (tác tử phụ của phiên) ----------
  const treeState = (() => { try { return JSON.parse(localStorage.getItem('cg.tree')) || {}; } catch { return {}; } })();
  function childrenOf(it) {
    const map = new Map();
    for (const ch of it.children || []) map.set(ch.agentId, { ...ch, parentId: it.id, cwd: it.cwd, child: true });
    const c = it.conv;
    if (c) for (const t of c.tasks.values()) {
      if (t.type !== 'local_agent') continue;
      const x = map.get(t.id) || { id: `${it.id}/agent-${t.id}`, agentId: t.id, title: t.title || t.desc || 'Tác tử phụ', agentType: t.agent || '', mtime: t.start, parentId: it.id, cwd: it.cwd, child: true };
      x.task = t;
      x.running = taskRunning(t);
      if (x.running) x.mtime = Date.now();
      map.set(t.id, x);
    }
    if (CG.suggest) for (const k of CG.suggest.kidsOf(it.id)) map.set('sp:' + k.id, k);
    return [...map.values()].sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.mtime - a.mtime);
  }
  function treeOpen(it, kids) {
    if (it.id in treeState) return treeState[it.id];
    return kids.some((k) => k.running || k.fresh) || !!(S.active && S.active.child && S.active.parentId === it.id);
  }
  function childRow(ch, last) {
    const active = S.active && S.active.sid === ch.id;
    const side = S.side && S.side.sid === ch.id;
    const t = ch.task;
    const row = h('div', { class: 'sess child' + (active ? ' active' : '') + (side ? ' side' : '') + (last ? ' last' : ''), 'data-parent': ch.parentId || '',
      title: [ch.title, ch.agentType ? `Tác tử: ${ch.agentType}` : '', t ? taskLine(t) : '', relTime(ch.mtime)].filter(Boolean).join('\n') },
      h('span', { class: 'st ' + (ch.running ? 'run' : '') }, ch.running ? null : icon(ch.spawned ? 'branch' : 'bot', 12)),
      h('span', { class: 's-title ellipsis', text: ch.title }),
      ch.agentType && ch.agentType !== 'general-purpose' ? h('span', { class: 's-proj ellipsis', text: ch.agentType }) : null,
      ch.spawned && ch.branch ? h('span', { class: 's-proj ellipsis', text: ch.branch, title: 'Nhánh git riêng' }) : null,
      h('span', { class: 's-time', text: ch.running ? 'đang chạy' : relTime(ch.mtime, true) }));
    row.onclick = (e) => { if (e.ctrlKey) openSide(ch); else openSession(ch); };
    row.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); openSide(ch); } };
    row.oncontextmenu = (e) => {
      e.preventDefault();
      menu(pointAnchor(e.clientX, e.clientY), [
        { label: 'Mở phiên con', icon: 'bot', onClick: () => openSession(ch) },
        { label: 'Mở ở khung bên phải', icon: 'columns', onClick: () => openSide(ch) },
        { label: 'Đi tới phiên cha', icon: 'chevronLeft', onClick: () => openSession({ ...ch, ...(S.all.find((x) => x.id === ch.parentId) || {}), id: ch.parentId, child: false }) },
      ]);
    };
    return row;
  }
  // Thêm dòng phiên + (nếu mở) các phiên con bên dưới
  function appendSess(list, it, showProject) {
    const kids = childrenOf(it);
    const open = kids.length && treeOpen(it, kids);
    list.append(sessRow(it, showProject, kids, open));
    S.order.push(it);
    if (!open) return;
    const all = S.treeAll.has(it.id);
    const shown = all ? kids : kids.slice(0, 8);
    const box = h('div', { class: 'sess-kids' });
    shown.forEach((k, i) => box.append(childRow(k, i === shown.length - 1 && kids.length <= shown.length)));
    if (kids.length > shown.length) box.append(h('button', { class: 'show-more kid', text: `Hiện thêm ${kids.length - shown.length} phiên con`, onclick: () => { S.treeAll.add(it.id); renderSidebar(); } }));
    list.append(box);
  }
  function sessRow(it, showProject, kids = [], open = false) {
    const c = it.conv;
    const ext = S.extMap.get(it.id);
    const bg = c && !c.busy ? c.runningTasks.length : 0;
    const st = c && c.busy ? (c.perms.size ? 'wait' : 'run') : bg ? 'run bg' : ext ? 'ext' : '';
    const active = S.active && S.active.sid === it.id && S.active.count;
    const more = h('button', { class: 's-more icon-btn sm', html: svg('moreH', 14), title: 'Tùy chọn' });
    const side = S.side && S.side.sid === it.id;
    const starred = isStarred(it.id);
    const star = h('button', { class: 's-star' + (starred ? ' on' : ''), text: starred ? '★' : '☆', title: starred ? 'Bỏ đánh dấu' : 'Đánh dấu — ghim lên đầu danh sách' });
    star.onclick = (e) => { e.stopPropagation(); toggleStar(it.id); };
    const row = h('div', { class: 'sess' + (active ? ' active' : '') + (side ? ' side' : '') + (starred ? ' starred' : ''), title: `${it.title}\n${it.cwd || ''}\n${relTime(it.mtime)}${bg ? `\n${bg} tác vụ đang chạy nền` : ''}${ext ? `\nĐang mở ở terminal khác (${ext.status === 'busy' ? 'đang chạy' : 'rảnh'})` : ''}` },
      h('span', { class: 'st ' + st }, st === 'ext' ? icon('terminal', 11) : null),
      h('span', { class: 's-title ellipsis', text: it.title }),
      CG.remote && CG.remote.isShared(it.id) ? h('span', { class: 's-rs' + (CG.remote.watching(it.id).length ? ' live' : ''), text: '📡', title: CG.remote.watching(it.id).length ? 'Đang được xem từ: ' + CG.remote.watching(it.id).join(', ') : 'Đang chia sẻ — máy có token thấy & điều khiển được' }) : null,
      c && c.xsPending ? h('span', { class: 's-xs', title: `${c.xsPending} tin nhắn từ phiên khác đang chờ bạn xem`, html: svg('message', 12) }) : null,
      autoResWaiting(it.id) ? h('span', { class: 's-ar', title: 'Đang chờ giới hạn hồi để tự chạy tiếp', html: svg('clock', 12) }) : null,
      CG.viewer && CG.viewer.fresh(c ? c.key : it.id) ? h('span', { class: 's-vw', title: 'Có xem trước mới (tệp / trang web Claude vừa tạo) — mở phiên để xem' }) : null,
      CG.lark && CG.lark.unread(it.id) ? h('span', { class: 's-lark', text: String(CG.lark.unread(it.id)), title: 'Tin Lark chưa xem' }) : null,
      showProject && it.cwd ? h('span', { class: 's-proj ellipsis', text: basename(it.cwd) }) : null,
      kids.length ? h('button', {
        class: 's-kids' + (open ? ' open' : '') + (kids.some((k) => k.running) ? ' run' : ''), title: `${kids.length} phiên con (tác tử phụ) — bấm để ${open ? 'thu gọn' : 'mở'}`,
        onclick: (e) => {
          e.stopPropagation(); treeState[it.id] = !open; try { localStorage.setItem('cg.tree', JSON.stringify(treeState)); } catch {} renderSidebar();
          if (!open && CG.motion) CG.motion.tree([...document.querySelectorAll(`#session-list .sess.child[data-parent="${CSS.escape(it.id)}"]`)]);
        },
      }, icon('chevronRight', 11), h('span', { text: kids.length })) : null,
      h('span', { class: 's-time', text: relTime(it.mtime, true) }),
      star, more);
    more.onclick = (e) => { e.stopPropagation(); sessionMenu(it, more); };
    // Ctrl+bấm hoặc bấm chuột giữa → mở ở khung bên phải
    row.dataset.sid = it.id;
    if (!c) { row.onmouseenter = () => { clearTimeout(row._pf); row._pf = setTimeout(() => prefetchTail(it), 120); }; row.onmouseleave = () => clearTimeout(row._pf); }
    row.onclick = (e) => { if (e.target.closest('.s-more, .s-star')) return; if (e.ctrlKey) openSide(it); else openSession(it); };
    row.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); openSide(it); } };
    row.oncontextmenu = (e) => { e.preventDefault(); sessionMenu(it, pointAnchor(e.clientX, e.clientY)); };
    return row;
  }
  // ---------- Đánh dấu sao (ghim phiên hay dùng lên đầu) ----------
  const starList = () => (Array.isArray(S.settings.starred) ? S.settings.starred : []);
  const isStarred = (id) => starList().includes(id);
  function toggleStar(id, on) {
    const cur = starList().filter((x) => x !== id);
    const want = on != null ? on : !isStarred(id);
    saveSettings({ starred: want ? [id, ...cur] : cur }).then(renderSidebar);
    toast(want ? '★ Đã đánh dấu — phiên được ghim lên đầu danh sách' : 'Đã bỏ đánh dấu');
  }
  function renderSidebar() {
    const list = els.sessions;
    let arr = sessionItems();
    list.innerHTML = '';
    S.order = [];
    if (CG.remote && S.filter === 'all') CG.remote.renderGroup(list);
    if (S.filter !== 'all') {
      list.append(h('div', { class: 'filter-pill' }, icon('filter', 12), S.filter === 'running' ? 'Đang chạy' : 'Đã lưu trữ', h('button', { class: 'icon-btn sm', html: svg('x', 12), onclick: () => { S.filter = 'all'; renderSidebar(); } })));
    }
    if (!arr.length) {
      list.append(h('div', { class: 'sess-empty', text: els.search.value.trim() ? 'Không tìm thấy phiên nào.' : S.filter === 'archived' ? 'Chưa có phiên nào được lưu trữ.' : 'Chưa có phiên nào. Bấm “Phiên mới” để bắt đầu.' }));
      return;
    }
    const collapsed = new Set(S.settings.collapsedGroups || []);
    // phiên đánh dấu sao: ghim lên đầu (thứ tự theo lúc đánh dấu, mới nhất trên cùng), không lặp lại ở nhóm bên dưới
    const starIds = starList();
    const stars = arr.filter((it) => starIds.includes(it.id)).sort((a, b) => starIds.indexOf(a.id) - starIds.indexOf(b.id));
    if (stars.length) {
      const isCol = collapsed.has('__star');
      const head = h('div', { class: 'grp-head star-head' + (isCol ? ' collapsed' : '') }, icon('chevronDown', 13, 'g-chev'), h('span', { class: 'g-star', text: '★' }),
        h('span', { class: 'g-name ellipsis', text: 'Đã đánh dấu' }), h('span', { class: 'g-count', text: stars.length }));
      head.onclick = () => { const set = new Set(S.settings.collapsedGroups || []); set.has('__star') ? set.delete('__star') : set.add('__star'); saveSettings({ collapsedGroups: [...set] }).then(renderSidebar); };
      list.append(head);
      if (!isCol) for (const it of stars) appendSess(list, it, true);
      arr = arr.filter((it) => !starIds.includes(it.id));
      if (!arr.length) return;
    }
    if (S.settings.groupBy === 'project' && !els.search.value.trim()) {
      const groups = new Map();
      for (const it of arr) {
        const k = (it.cwd || '').toLowerCase() || '(khác)';
        if (!groups.has(k)) groups.set(k, { key: k, cwd: it.cwd, items: [] });
        groups.get(k).items.push(it);
      }
      for (const g of groups.values()) {
        const isCol = collapsed.has(g.key);
        const running = g.items.some((it) => (it.conv && it.conv.working));
        const head = h('div', { class: 'grp-head' + (isCol ? ' collapsed' : ''), title: g.cwd || '' },
          icon('chevronDown', 13, 'g-chev'), icon('folder', 14, 'g-icon'),
          h('span', { class: 'g-name ellipsis', text: basename(g.cwd) || 'Khác' }),
          running ? h('span', { class: 'st run' }) : null,
          h('span', { class: 'g-count', text: g.items.length }),
          g.cwd ? h('button', { class: 'icon-btn sm g-new', title: 'Phiên mới trong thư mục này', html: svg('plus', 14), onclick: (e) => { e.stopPropagation(); newSession(g.cwd); } }) : null);
        head.onclick = () => {
          const set = new Set(S.settings.collapsedGroups || []);
          set.has(g.key) ? set.delete(g.key) : set.add(g.key);
          saveSettings({ collapsedGroups: [...set] }).then(renderSidebar);
        };
        head.oncontextmenu = (e) => {
          e.preventDefault();
          if (!g.cwd) return;
          menu(pointAnchor(e.clientX, e.clientY), [
            { label: 'Phiên mới trong thư mục này', icon: 'plus', onClick: () => newSession(g.cwd) },
            { label: 'Mở thư mục', icon: 'folderOpen', onClick: () => api.openPath(g.cwd) },
            { label: 'Mở terminal tại đây', icon: 'terminal', onClick: () => api.openTerminal(g.cwd) },
          ]);
        };
        list.append(head);
        if (isCol) continue;
        const expanded = S.expanded.has(g.key);
        const shown = expanded ? g.items : g.items.slice(0, 6);
        for (const it of shown) appendSess(list, it, false);
        if (g.items.length > shown.length) list.append(h('button', { class: 'show-more', text: `Hiện thêm ${g.items.length - shown.length} phiên`, onclick: () => { S.expanded.add(g.key); renderSidebar(); } }));
        else if (expanded && g.items.length > 6) list.append(h('button', { class: 'show-more', text: 'Thu gọn', onclick: () => { S.expanded.delete(g.key); renderSidebar(); } }));
      }
    } else {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const groups = [['Hôm nay', startToday], ['Hôm qua', startToday - 86400000], ['7 ngày qua', startToday - 7 * 86400000], ['30 ngày qua', startToday - 30 * 86400000], ['Cũ hơn', -Infinity]];
      let gi = -1;
      for (const it of arr) {
        const g = groups.findIndex(([, t]) => it.mtime >= t);
        if (g !== gi) { gi = g; list.append(h('div', { class: 'sess-group', text: groups[g][0] })); }
        appendSess(list, it, true);
      }
    }
  }
  function filterMenu() {
    menu($('#btn-sb-filter'), [
      { header: 'Nhóm theo' },
      { label: 'Dự án (thư mục)', icon: 'folder', checked: S.settings.groupBy === 'project', onClick: () => saveSettings({ groupBy: 'project' }).then(renderSidebar) },
      { label: 'Thời gian', icon: 'clock', checked: S.settings.groupBy === 'date', onClick: () => saveSettings({ groupBy: 'date' }).then(renderSidebar) },
      '-',
      { header: 'Hiển thị' },
      { label: 'Tất cả phiên', checked: S.filter === 'all', onClick: () => { S.filter = 'all'; renderSidebar(); } },
      { label: 'Đang chạy', checked: S.filter === 'running', onClick: () => { S.filter = 'running'; renderSidebar(); } },
      { label: 'Đã lưu trữ', icon: 'archive', checked: S.filter === 'archived', onClick: () => { S.filter = 'archived'; renderSidebar(); } },
      '-',
      { label: 'Làm mới danh sách', icon: 'refresh', onClick: () => refreshSessions(true) },
      { label: 'Nhập phiên từ máy khác…', desc: '.cgsession', icon: 'download', onClick: () => CG.pack && CG.pack.importSession() },
      { label: 'Thêm phiên từ máy khác…', desc: 'mở phiên đang chạy ở máy khác bằng token', icon: 'globe', onClick: () => CG.remote && CG.remote.addDialog() },
    ], { checks: true });
  }
  function sessionMenu(it, anchor) {
    const arch = isArchived(it.id);
    const conv = it.conv || [...S.convs.values()].find((c) => c.sid === it.id);
    menu(anchor, [
      { label: 'Mở ở khung bên phải', desc: 'Ctrl+bấm', icon: 'columns', disabled: !!(S.active && S.active.sid === it.id) || !!(S.side && S.side.sid === it.id), onClick: () => openSide(it) },
      '-',
      { label: isStarred(it.id) ? 'Bỏ đánh dấu sao' : 'Đánh dấu sao (ghim lên đầu)', icon: 'sparkles', onClick: () => toggleStar(it.id) },
      ...(CG.lark && CG.lark.closedPeople ? CG.lark.closedPeople(it.id).map((p) => ({ label: `Mở lại chat Lark với ${p.name}`, icon: 'message', onClick: async () => { if (!S.active || S.active.sid !== it.id) await openSession(it); CG.lark.reopen(it.id, p.openId); } })) : []),
      { label: 'Đổi tên', icon: 'pencil', onClick: () => renameSession(it.id, it.title) },
      { label: 'Tiếp tục trong terminal', desc: 'claude --resume', icon: 'terminal', disabled: !(conv ? conv.persisted : true), onClick: () => api.openTerminal(it.cwd, ['--resume', it.id]) },
      { label: 'Mở thư mục', icon: 'folderOpen', disabled: !it.cwd, onClick: () => api.openPath(it.cwd) },
      { label: 'Sao chép session ID', icon: 'copy', onClick: () => { navigator.clipboard.writeText(it.id); toast('Đã sao chép session ID'); } },
      ...(CG.remote ? CG.remote.menuItems(it) : []),
      { label: 'Xuất sang máy khác…', desc: '.cgsession', icon: 'upload', disabled: !CG.pack || !(conv ? conv.persisted : true), onClick: () => CG.pack.exportSession(it) },
      '-',
      { label: arch ? 'Bỏ lưu trữ' : 'Lưu trữ', icon: 'archive', onClick: () => archiveSession(it.id, !arch) },
      { label: 'Xóa phiên', icon: 'trash', danger: true, onClick: () => deleteSession(it) },
    ]);
  }
  async function renameSession(id, current) {
    const conv = [...S.convs.values()].find((c) => c.sid === id);
    const title = await promptDialog('Đổi tên phiên', current || (conv && conv.title) || '', 'Tên phiên');
    if (!title) return;
    if (!conv || conv.persisted) {
      const ok = await api.renameSession(id, title);
      if (!ok && !conv) return toast('Không tìm thấy tệp phiên để đổi tên.', true);
    }
    if (conv) conv.title = title;
    const d = S.all.find((x) => x.id === id);
    if (d) d.title = title;
    updateTitlebar();
    renderSidebar();
  }
  async function archiveSession(id, on) {
    const set = new Set(S.settings.archived || []);
    on ? set.add(id) : set.delete(id);
    await saveSettings({ archived: [...set] });
    toast(on ? 'Đã lưu trữ phiên (xem trong bộ lọc “Đã lưu trữ”).' : 'Đã bỏ lưu trữ phiên.');
    renderSidebar();
  }
  async function deleteSession(it) {
    const ok = await confirmDialog('Xóa phiên?', `“${it.title}” sẽ được chuyển vào Thùng rác. Bạn có thể khôi phục từ Thùng rác nếu cần.`, 'Xóa', true);
    if (!ok) return;
    const conv = it.conv || [...S.convs.values()].find((c) => c.sid === it.id);
    if (conv && conv === S.side) closeSide();
    if (conv) { await api.stop(conv.key); disposeTerminal(conv); conv.root.remove(); S.convs.delete(conv.key); }
    await api.deleteSession(it.id);
    S.all = S.all.filter((x) => x.id !== it.id);
    if (isStarred(it.id)) saveSettings({ starred: starList().filter((x) => x !== it.id) });
    if (!S.active || S.active === conv) newSession(it.cwd);
    renderSidebar();
    toast('Đã chuyển phiên vào Thùng rác.');
  }
  function sessionMenuForActive() {
    const c = S.active;
    if (!c) return;
    const vm = S.settings.viewMode;
    menu($('#btn-session-menu'), [
      { label: isStarred(c.sid) ? 'Bỏ đánh dấu sao' : 'Đánh dấu sao (ghim lên đầu)', icon: 'sparkles', disabled: !c.count && !c.persisted, onClick: () => toggleStar(c.sid) },
      ...(CG.lark && CG.lark.closedPeople ? CG.lark.closedPeople(c.sid).map((p) => ({ label: `Mở lại chat Lark với ${p.name}`, icon: 'message', onClick: () => CG.lark.reopen(c.sid, p.openId) })) : []),
      { label: 'Đổi tên', icon: 'pencil', onClick: () => renameSession(c.sid, c.title) },
      '-',
      { header: 'Chế độ xem (Ctrl+O)' },
      ...VIEW_MODES.map(([v, l, d]) => ({ label: l, desc: d, checked: vm === v, onClick: () => setViewMode(v) })),
      '-',
      { label: 'Tiếp tục trong terminal', desc: 'claude --resume', icon: 'terminal', disabled: !c.persisted || c.busy, onClick: () => api.openTerminal(c.cwd, ['--resume', c.sid]) },
      { label: 'Mở thư mục', icon: 'folderOpen', onClick: () => api.openPath(c.cwd) },
      { label: 'Sao chép session ID', icon: 'copy', onClick: () => { navigator.clipboard.writeText(c.sid); toast('Đã sao chép: ' + c.sid); } },
      '-',
      { label: isArchived(c.sid) ? 'Bỏ lưu trữ' : 'Lưu trữ', icon: 'archive', onClick: () => archiveSession(c.sid, !isArchived(c.sid)) },
      { label: 'Xóa phiên', icon: 'trash', danger: true, onClick: () => deleteSession({ id: c.sid, title: c.title || 'Phiên', cwd: c.cwd, conv: c }) },
    ], { checks: true });
  }

  let refreshTimer = 0;
  function scheduleSessionsRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshSessions, 1500); }
  async function refreshSessions(toastIt) {
    S.all = await api.allSessions();
    renderSidebar();
    if (S.active && S.active.count === 0) updateHero();
    if (toastIt === true) toast(`Đã tải ${S.all.length} phiên trên máy này.`);
  }
  async function refreshExternal() {
    try {
      S.ext = await api.activeSessions();
      S.extMap = new Map(S.ext.map((x) => [x.sessionId, x]));
      renderSidebar();
    } catch {}
  }

  // ---------- Details panel ----------
  function toggleDetails(force, tab) {
    const on = force != null ? force : !S.settings.showDetails;
    if (tab) S.changesTab = tab;
    S.diffView = null;
    saveSettings({ showDetails: on }).then(() => { refreshDetails(); updateTitlebar(); if (CG.motion) CG.motion.details(on); if (CG.mascot) CG.mascot.relayout(true); });
  }
  function card(title, right, ...body) {
    return h('div', { class: 'd-card' }, h('div', { class: 'd-card-head' }, h('span', { class: 'd-card-title', text: title }), h('span', { class: 'spacer' }), right), ...body);
  }
  function envRow(label, value, onClick, ic) {
    return h('div', { class: 'env-row' + (onClick ? ' click' : ''), onclick: onClick || null, title: typeof value === 'string' ? value : '' },
      h('span', { class: 'env-l', text: label }), h('span', { class: 'env-v ellipsis' }, ic ? icon(ic, 13) : null, value));
  }
  function fileRow(path, add, del, onClick, tag) {
    return h('div', { class: 'f-row', onclick: onClick, title: path },
      icon('file', 14, 'f-icon'),
      h('span', { class: 'f-name ellipsis', text: basename(path) }),
      h('span', { class: 'f-dir ellipsis', text: dirname(path) }),
      tag ? h('span', { class: 'f-tag', text: tag }) : null,
      h('span', { class: 'f-cnt' }, h('span', { class: 'add', text: '+' + add }), ' ', h('span', { class: 'del', text: '−' + del })));
  }
  function refreshDetails() {
    const panel = els.details;
    if (!S.settings.showDetails) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const c = S.active;
    const body = $('#details-body');
    // đang gõ trong bảng (vd nội dung commit) thì giữ con trỏ sau khi vẽ lại
    const fa = body.contains(document.activeElement) ? document.activeElement : null;
    body.innerHTML = '';
    if (!c) return;
    if (fa) requestAnimationFrame(() => { if (fa.isConnected && document.activeElement !== fa) fa.focus(); });
    if (S.diffView) {
      const dv = S.diffView;
      body.append(
        h('div', { class: 'dv-head' },
          h('button', { class: 'icon-btn sm', html: svg('chevronLeft', 16), title: 'Quay lại', onclick: () => { S.diffView = null; refreshDetails(); } }),
          h('span', { class: 'dv-title ellipsis', text: dv.title, title: dv.full || dv.title }),
          dv.full ? h('button', { class: 'icon-btn sm', html: svg('external', 14), title: 'Mở tệp', onclick: () => api.openPath(dv.full) }) : null),
        dv.rows ? rowsView(dv.rows, 4000, dv.full) : h('div', { class: 'note', text: 'Đang tải diff…' }));
      return;
    }
    // Thay đổi: "Phiên này" + mỗi repo có tệp Claude sửa (và repo của thư mục phiên) là một tab
    const repo = c.git && c.git.repo;
    const rtabs = CG.git ? CG.git.tabsFor(c) : [];
    if (S.changesTab === 'git') S.changesTab = rtabs.length ? rtabs[0].key : 'session';
    if (S.changesTab !== 'session' && !rtabs.some((r) => r.key === S.changesTab)) S.changesTab = 'session';
    const tabs = h('div', { class: 'seg gp-tabs' },
      h('button', { class: S.changesTab === 'session' ? 'on' : '', text: 'Phiên này', onclick: () => { S.changesTab = 'session'; refreshDetails(); } }),
      rtabs.map((r) => h('button', {
        class: (S.changesTab === r.key ? 'on' : '') + (r.fresh && Date.now() - r.fresh < 2500 ? ' gp-fresh' : ''), 'data-repo': r.key, title: r.top,
        onclick: () => { S.changesTab = r.key; refreshDetails(); },
      }, icon('branch', 12), h('span', { text: r.name }), r.branch ? h('span', { class: 'gp-br', text: r.branch }) : null, h('span', { class: 'gp-n', text: r.count || '' }))));
    const list = h('div', { class: 'f-list' });
    if (S.changesTab !== 'session' && CG.git) {
      list.append(CG.git.view(c, rtabs.find((r) => r.key === S.changesTab).top));
    } else {
      if (!c.edits.size) list.append(h('div', { class: 'note', text: 'Claude chưa sửa tệp nào trong phiên này.' }));
      for (const e of c.edits.values()) {
        list.append(fileRow(shortPath(e.path, c.cwd), e.add, e.del, () => { S.diffView = { title: shortPath(e.path, c.cwd), full: e.path, rows: patchRows(e.hunks) }; refreshDetails(); }, e.created ? 'mới' : ''));
      }
    }
    let add = 0, del = 0;
    for (const e of c.edits.values()) { add += e.add; del += e.del; }
    body.append(card('Thay đổi', c.edits.size ? h('span', { class: 'f-cnt' }, h('span', { class: 'add', text: '+' + add }), ' ', h('span', { class: 'del', text: '−' + del })) : null, tabs, list));
    // Việc cần làm
    if (c.todos && c.todos.length) {
      const done = c.todos.filter((t) => t.status === 'completed').length;
      body.append(card('Việc cần làm', h('span', { class: 'muted', text: `${done}/${c.todos.length}` }), todoView(c.todos)));
    }
    // Môi trường
    const mm = MODES.find((x) => x.v === c.mode) || MODES[0];
    body.append(card('Môi trường', null,
      envRow('Máy', 'Máy này (cục bộ, qua Claude CLI)', null, 'monitor'),
      envRow('Thư mục', c.cwd || '—', c.cwd ? () => api.openPath(c.cwd) : null, 'folder'),
      repo ? envRow('Nhánh', c.git.branch + (c.worktree ? ' (worktree)' : ''), null, 'branch') : null,
      envRow('Model', c.modelName ? modelLabel(c.model) + ` (${c.modelName.replace(/^claude-/, '')})` : modelLabel(c.model), null, 'sparkles'),
      envRow('Effort', effortLabel(c.effort || defaultEffort(c.model)), null, 'gauge'),
      envRow('Chế độ', mm.label, null, mm.icon),
      c.persisted ? envRow('Session ID', c.sid, () => { navigator.clipboard.writeText(c.sid); toast('Đã sao chép session ID'); }, 'copy') : null,
      S.info && S.info.claude_code_version ? envRow('Claude CLI', S.info.claude_code_version, null, 'terminal') : null));
    // Sử dụng
    body.append(card('Sử dụng', null, usageRows(c)));
  }

  // ---------- View mode ----------
  // Chế độ "Suy nghĩ" (giống bản desktop): mở sẵn phần suy nghĩ, thẻ công cụ vẫn thu gọn
  const showThinking = () => S.settings.viewMode === 'verbose' || S.settings.viewMode === 'thinking';
  function applyViewMode() {
    const vm = S.settings.viewMode || 'normal';
    els.convs.className = 'view-' + vm;
    $('#split-convs').className = 'view-' + vm;
    for (const c of S.active ? [S.active, S.side].filter(Boolean) : []) {
      $$('details.thinking', c.root).forEach((d) => (d.open = showThinking()));
      if (vm === 'verbose') $$('.tool', c.root).forEach((t) => { if (t._build) t._build(); t.classList.add('open'); });
    }
  }
  function setViewMode(v) {
    S.settings.viewMode = v;
    applyViewMode();
    saveSettings({ viewMode: v });
    toast('Chế độ xem: ' + VIEW_MODES.find((x) => x[0] === v)[1]);
  }

  // ---------- Conversations ----------
  function activate(conv) {
    const prev = S.active;
    const mcap = prev && prev !== conv && CG.motion ? CG.motion.before() : null;
    // Mỗi phiên giữ hộp chat riêng (chữ đang gõ dở, tệp đính kèm, vị trí con trỏ)
    if (prev !== conv) {
      if (prev) prev.draft = { text: els.input.value, atts: S.attachments, sel: [els.input.selectionStart, els.input.selectionEnd] };
      const d = conv.draft || { text: '', atts: [] };
      els.input.value = d.text || '';
      S.attachments = d.atts || [];
      if (d.sel) { els.input.selectionStart = d.sel[0]; els.input.selectionEnd = d.sel[1]; }
      renderAttachments();
      autosize();
    }
    // Chọn đúng phiên đang ở khung phải → hai khung đổi chỗ
    if (S.side && conv === S.side) S.side = prev && prev !== conv && prev.count ? prev : null;
    S.active = conv;
    S.diffView = null;
    placeConvs();
    if (S.side !== S.sideShown) updateSide(true);
    closeAc();
    closePopover();
    updateTitlebar();
    updateHero();
    updateComposer();
    updateIndicator();
    renderSidebar();
    refreshDetails();
    if (S.settings.viewMode === 'verbose') conv.buildAllTools();
    S.stick = true;
    els.scroller.scrollTop = els.scroller.scrollHeight;
    // Các lượt ngoài màn hình được bỏ qua khi dựng (content-visibility) nên chiều cao có thể đổi sau 1 khung hình
    requestAnimationFrame(() => { if (S.active === conv && S.stick) els.scroller.scrollTop = els.scroller.scrollHeight; });
    els.input.focus();
    if (TERM.open) syncTerminal(false);
    if (conv.cwd && conv.cwd !== S.infoCwd) loadInfo(conv.cwd);
    if (mcap) CG.motion.after(conv, mcap);
    if (CG.nb) CG.nb.onActivate(conv);
    if (CG.lark) CG.lark.onActivate(conv);
    if (CG.viewer) CG.viewer.useSession(conv.key);
    if (CG.btw) CG.btw.onActivate(conv);
    if (CG.parity) { CG.parity.paintBar(); CG.parity.refreshPr(); }
  }
  async function newSession(dir) {
    dir = dir || (S.active && S.active.cwd) || S.settings.lastDir || S.home;
    let conv = [...S.convs.values()].find((c) => c.count === 0 && !c.busy && !c.persisted);
    if (!conv) {
      const id = await api.uuid();
      conv = new Conv({ key: id, sid: id, cwd: dir });
    } else if (!samePath(conv.cwd, dir)) setConvDir(conv, dir);
    activate(conv);
  }
  // opts.background: chỉ tạo + tải lịch sử, không đưa lên khung chính (dùng cho khung phải khi chia đôi)
  async function openSession(it, opts = {}) {
    let conv = [...S.convs.values()].find((c) => c.sid === it.id && !c.rs);
    if (!conv) {
      const cwd = it.cwd && (await api.dirExists(it.cwd)) ? it.cwd : '';
      conv = new Conv({ key: it.id, sid: it.id, cwd: cwd || it.cwd || S.home, persisted: true, title: it.title });
      if (it.child) Object.assign(conv, { child: true, parentId: it.parentId, agentId: it.agentId, agentType: it.agentType });
      const pref = !it.child && sessPrefs()[it.id];
      if (pref) { if (pref.model) conv.model = pref.model; conv.effort = pref.effort || ''; }
      if (opts.onCreate) opts.onCreate(conv);
      const fg = !opts.background;
      if (fg) activate(conv);
      // Phiên chưa có trong bộ nhớ: viên chọn + tiêu đề đổi ngay; chờ quá 150 ms thì hiện khối xương (vệt sáng chạy bằng
      // transform nên vẫn mượt khi đang dựng nội dung); nạp xong mới cho nội dung hiện so le — không chạy hiệu ứng trên khung trống.
      let sk = null;
      const skT = fg ? setTimeout(() => { if (!conv.count && S.active === conv) { sk = convSkeleton(); conv.root.append(sk); } }, 150) : 0;
      if (fg) document.body.classList.add('m-hist');
      // Đọc phần cuối tệp trước (hiện ngay), phần cũ hơn đọc nền — đã đọc sẵn lúc rê chuột thì lấy luôn
      const tail = (await takePrefetch(it)) || (await api.loadSessionTail(it.id, it.cwd));
      clearTimeout(skT);
      if (sk) sk.remove();
      // lần đầu chỉ dựng ~1 màn hình (40 mục) cho nhanh; phần cũ hơn dựng khi cuộn lên
      conv.loadHistory(tail.entries, fg ? 40 : 0);
      if (tail.offset > 0) conv.fetchOlder(it, tail.offset);
      // Tiếp tục bằng đúng model mà phiên này đang dùng (lựa chọn trong GUI mới hơn lịch sử thì ưu tiên lựa chọn đó)
      const used = conv.modelName && models().find((m) => m.value !== 'default' && m.resolvedModel === conv.modelName);
      if (used && !(pref && pref.model && pref.t > (it.mtime || 0))) conv.model = used.value;
      if (!cwd && it.cwd) conv.addNote(`Thư mục ${it.cwd} không còn tồn tại — không thể tiếp tục phiên này ở đúng thư mục.`);
      const impN = !it.child && CG.pack && CG.pack.importedNote && CG.pack.importedNote(it.id);
      if (impN) conv.addNote(impN);
      if (!conv.count) conv.append(h('div', { class: 'note', text: it.child ? 'Tác tử phụ chưa ghi gì — nội dung sẽ hiện khi nó chạy.' : 'Phiên này chưa có tin nhắn hiển thị được. Bạn vẫn có thể tiếp tục.' }));
      if (it.child) watchChild(conv);
      else for (const ch of it.children || []) {
        const card = ch.toolUseId && conv.tools.get(ch.toolUseId);
        if (card && card.linkChild) card.linkChild({ ...ch, parentId: it.id, cwd: it.cwd, child: true });
      }
      const ext = S.extMap.get(it.id);
      if (ext) conv.addNote(`⚠ Phiên này đang mở ở một terminal khác (PID ${ext.pid}). Gửi tin nhắn từ đây cùng lúc có thể gây xung đột.`);
      conv.closeTurn();
      conv.lastActive = it.mtime || Date.now();
      if (conv === S.side) {
        updateSide();
        const sc = $('#split-scroller');
        for (let n = 0; n < 4 && S.side === conv && conv.histStart > 0 && sc.scrollHeight <= sc.clientHeight + 200; n++) conv.renderOlder();
        sc.scrollTop = sc.scrollHeight;
      }
      // Người dùng đã bấm sang phiên khác trong lúc đang tải → không giật về phiên này
      if (opts.background || S.active !== conv) { if (fg) document.body.classList.remove('m-hist'); return conv; }
      activate(conv);
      // Phiên ngắn trên màn hình lớn: dựng thêm cho đầy khung
      for (let n = 0; n < 6 && S.active === conv && conv.histStart > 0 && els.scroller.scrollHeight <= els.scroller.clientHeight + 200; n++) conv.renderOlder(40);
      els.scroller.scrollTop = els.scroller.scrollHeight;
      conv.openedAt = Date.now();
      revealConv(conv);
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('m-hist')));
      return conv;
    }
    if (!opts.background) activate(conv);
    return conv;
  }

  function convSkeleton() {
    const sk = h('div', { class: 'conv-skel' },
      h('div', { class: 'skel u' }), h('div', { class: 'skel', style: 'width:88%' }), h('div', { class: 'skel', style: 'width:70%' }),
      h('div', { class: 'skel card' }), h('div', { class: 'skel card' }), h('div', { class: 'skel', style: 'width:80%' }), h('div', { class: 'skel', style: 'width:62%' }),
      h('div', { class: 'skel u' }), h('div', { class: 'skel', style: 'width:84%' }), h('div', { class: 'skel card' }));
    if (CG.motion && CG.motion.on()) sk.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    return sk;
  }
  // nội dung vừa nạp: các khối đang thấy hiện so le từ dưới lên (sau khi đã dựng xong, không trong lúc đang bận)
  function revealConv(conv) {
    if (!CG.motion || !CG.motion.on()) return;
    requestAnimationFrame(() => {
      if (S.active !== conv) return;
      const vr = els.scroller.getBoundingClientRect();
      const kids = [...conv.root.children].filter((k) => { const r = k.getBoundingClientRect(); return r.height > 0 && r.bottom > vr.top && r.top < vr.bottom; }).slice(-8);
      kids.forEach((k, i) => k.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 30 + 35 * i, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' }));
    });
  }
  // Rê chuột lên một phiên ~120 ms → đọc trước phần cuối của nó (giữ 8 phiên gần nhất) để bấm vào là hiện ngay
  const PF = new Map();
  function prefetchTail(it) {
    if (!it || it.child || [...S.convs.values()].some((c) => c.sid === it.id)) return;
    const x = PF.get(it.id);
    if (x && x.mtime === it.mtime && Date.now() - x.t < 120000) return;
    PF.delete(it.id);
    PF.set(it.id, { mtime: it.mtime, t: Date.now(), p: api.loadSessionTail(it.id, it.cwd).catch(() => null) });
    while (PF.size > 8) PF.delete(PF.keys().next().value);
  }
  function takePrefetch(it) {
    const x = PF.get(it.id);
    PF.delete(it.id);
    if (!x || x.mtime !== it.mtime || Date.now() - x.t > 120000) return null;
    return x.p;
  }

  // Phiên con đang chạy: tệp transcript lớn dần → tải lại phần hiển thị khi tệp đổi (theo dõi bằng fs.watch)
  const childWatch = new Map(); // file -> conv
  async function watchChild(conv) {
    const f = await api.sessionFile(conv.sid, conv.cwd);
    // Tác tử vừa khởi chạy có thể chưa kịp tạo tệp
    if (!f) { if ((conv.watchTries = (conv.watchTries || 0) + 1) < 30) setTimeout(() => { watchChild(conv); reloadChild(conv); }, 2000); return; }
    conv.file = f;
    childWatch.set(f.toLowerCase(), conv);
    api.watchFile(f);
  }
  api.onFileChanged((p) => {
    const conv = childWatch.get(String(p).toLowerCase());
    if (!conv) return;
    clearTimeout(conv.reloadTimer);
    conv.reloadTimer = setTimeout(() => reloadChild(conv), 400);
  });
  async function reloadChild(conv) {
    if (conv.reloading) { conv.reloadAgain = true; return; }
    conv.reloading = true;
    try {
      const tail = await (conv.rs ? CG.remote.api(conv) : api).loadSessionTail(conv.sid, conv.cwd);
      const sc = conv === S.side ? $('#split-scroller') : els.scroller;
      const shown = conv === S.active || conv === S.side;
      const atBottom = !shown || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
      const top = sc.scrollTop;
      conv.root.innerHTML = '';
      Object.assign(conv, { count: 0, turn: null, tools: new Map(), edits: new Map(), live: [], hist: null, histStart: 0 });
      conv.loadHistory(tail.entries);
      if (tail.offset > 0) conv.fetchOlder({ id: conv.sid, cwd: conv.cwd }, tail.offset);
      conv.closeTurn();
      if (shown) sc.scrollTop = atBottom ? sc.scrollHeight : top;
    } finally {
      conv.reloading = false;
      if (conv.reloadAgain) { conv.reloadAgain = false; reloadChild(conv); }
    }
  }
  function parentOf(conv) {
    const it = S.all.find((x) => x.id === conv.parentId);
    return it || { id: conv.parentId, cwd: conv.cwd, title: 'Phiên cha' };
  }

  async function loadInfo(cwd, refresh) {
    S.infoCwd = cwd;
    const info = await api.cliInfo(cwd, refresh);
    if (cwd !== S.infoCwd) return;
    if (info && info.error) S.infoError = info.error;
    else { S.info = info; S.infoError = null; }
    renderAccount();
    updateComposer();
    updateHero();
    refreshDetails();
  }
  function renderAccount() {
    const a = S.info && S.info.account;
    $('#acc-email').textContent = a && a.email ? a.email : S.infoError ? '⚠ Chưa kết nối CLI' : 'Đang kết nối…';
    $('#acc-plan').textContent = a ? [a.subscriptionType, S.info.claude_code_version ? 'CLI ' + S.info.claude_code_version : ''].filter(Boolean).join(' · ') : '';
    $('#avatar').textContent = a && a.email ? a.email[0].toUpperCase() : '?';
    $('#btn-account').title = a ? `${a.email}\n${a.organization || ''}` : '';
  }
  function accountMenu() {
    const a = S.info && S.info.account;
    const up = (S.updates.cli && S.updates.cli.newer) || (S.updates.gui && S.updates.gui.newer);
    menu($('#btn-account'), [
      a ? { header: a.email } : null,
      { label: 'Cài đặt', icon: 'settings', kbd: 'Ctrl ,', onClick: () => CG.openSettings() },
      { label: up ? 'Có bản cập nhật — xem ngay' : 'Kiểm tra cập nhật…', icon: 'download', onClick: () => checkUpdates(true) },
      { label: 'Phím tắt', icon: 'keyboard', kbd: 'Ctrl /', onClick: showShortcuts },
      { label: 'Mở thư mục ~/.claude', icon: 'folderOpen', onClick: async () => api.openPath((await api.appInfo()).claudeDir) },
      '-',
      { label: 'Tài khoản & mức sử dụng', icon: 'user', onClick: () => CG.openSettings('account') },
      { label: 'Chi phí & token theo ngày', icon: 'gauge', onClick: () => CG.usage && CG.usage.open(7) },
      { label: 'Giới thiệu', icon: 'info', onClick: () => CG.openSettings('about') },
    ], { place: 'top' });
  }

  // ---------- Updates ----------
  async function checkUpdates(manual) {
    if (manual) CG.openSettings('updates');
    const [cli, gui] = await Promise.all([api.cliUpdateInfo().catch((e) => ({ error: e.message })), api.guiUpdateCheck().catch((e) => ({ error: e.message }))]);
    S.updates = { cli, gui, t: Date.now() };
    const any = (cli && cli.newer) || (gui && gui.newer);
    $('#update-dot').classList.toggle('hidden', !any);
    if (CG.onUpdates) CG.onUpdates();
    if (!manual && any) {
      if (cli && cli.newer && S.settings.autoUpdateCli && ![...S.convs.values()].some((c) => c.busy)) {
        toast(`Đang tự cập nhật Claude CLI ${cli.current} → ${cli.latest}…`);
        const r = await api.cliUpdateRun();
        toast(r.code === 0 ? 'Đã cập nhật Claude CLI. Phiên mới sẽ dùng bản mới.' : 'Cập nhật Claude CLI thất bại — xem Cài đặt › Cập nhật.', r.code !== 0);
        S.updates.cli = await api.cliUpdateInfo();
        $('#update-dot').classList.toggle('hidden', !((S.updates.cli && S.updates.cli.newer) || (gui && gui.newer)));
      } else {
        const what = [cli && cli.newer ? `Claude CLI ${cli.latest}` : '', gui && gui.newer ? `Claude GUI ${gui.latest}` : ''].filter(Boolean).join(' và ');
        toast(`Có bản cập nhật: ${what}. Mở menu tài khoản để cập nhật.`);
      }
    }
  }
  CG.checkUpdates = checkUpdates;
  CG.renderSidebar = () => renderSidebar();

  // ---------- Shortcuts ----------
  const SHORTCUTS = [
    ['Ctrl N', 'Phiên mới'], ['Ctrl Tab / Ctrl Shift Tab', 'Phiên kế tiếp / trước'], ['Ctrl K', 'Tìm phiên'],
    ['Enter / Shift Enter', 'Gửi / xuống dòng'], ['Esc', 'Dừng Claude, từ chối yêu cầu đang chờ'], ['Shift Tab', 'Đổi chế độ quyền'],
    ['Ctrl Shift M', 'Menu chế độ quyền'], ['Ctrl Shift I', 'Chọn model'], ['Ctrl Shift E', 'Chỉnh effort'],
    ['Ctrl O', 'Đổi chế độ xem (Bình thường / Suy nghĩ / Chi tiết / Tóm tắt)'], ['Ctrl ;', 'Hỏi bên lề (/btw) — không chen vào phiên chính'], ['Ctrl Shift S', 'Chọn phần tử trên trang ở khung xem để đính vào chat'], ['Ctrl Shift D', 'Bảng Thay đổi'], ['Ctrl `', 'Ẩn/hiện terminal tích hợp'], ['Ctrl \\', 'Chia đôi màn hình (mở/đóng khung phải)'], ['Tab', 'Dùng câu gợi ý trong ô nhập'], ['Ctrl P', 'Mở nhanh tệp trong khung xem'], ['Ctrl Shift B', 'Ẩn/hiện khung xem trước (mỗi phiên một bộ tab riêng)'],
    ['Ctrl B', 'Ẩn/hiện thanh bên'], ['Ctrl ,', 'Cài đặt'], ['Ctrl /', 'Danh sách phím tắt'], ['@', 'Nhắc tới tệp'], ['/', 'Lệnh slash'], ['F12', 'DevTools'],
  ];
  function showShortcuts() {
    modal('Phím tắt', h('div', { class: 'kbd-list' }, SHORTCUTS.map(([k, d]) => h('div', { class: 'kbd-row' }, h('span', { text: d }), h('span', {}, k.split(' / ').map((g, i) => [i ? ' / ' : '', ...g.split(' ').map((x) => h('kbd', { text: x }))]))))), [], { cls: 'wide' });
  }
  CG.SHORTCUTS = SHORTCUTS;

  // ---------- Terminal tích hợp (xterm.js + node-pty, mỗi phiên một terminal tại thư mục của phiên) ----------
  const TERM = { open: false, byConv: new Map(), byId: new Map() };
  function termTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const bg = v('--term-bg', v('--code-bg', '#1e1e1c'));
    const m = /^#([0-9a-f]{6})$/i.exec(bg);
    const n = m ? parseInt(m[1], 16) : 0;
    const light = ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255 > 0.55;
    // Nền sáng: bảng màu ANSI đậm hơn (mặc định của xterm dành cho nền tối, chữ vàng/trắng sẽ khó đọc)
    const LIGHT_ANSI = {
      black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#7d4e00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
      brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
    };
    return {
      background: bg, foreground: v('--text', '#eee'),
      cursor: v('--accent', '#d97757'), cursorAccent: bg,
      selectionBackground: v('--term-sel', 'rgba(128,128,128,.35)'),
      ...(light ? LIGHT_ANSI : {}),
    };
  }
  function termFor(c) {
    let t = TERM.byConv.get(c.key);
    if (t) return t;
    const el = h('div', { class: 'term-inst' });
    $('#term-host').append(el);
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace', fontSize: 13, lineHeight: 1.15,
      cursorBlink: true, scrollback: 8000, theme: termTheme(), allowTransparency: false, windowsPty: { backend: 'conpty' },
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(el);
    t = { term, fit, el, id: 'term-' + c.key, conv: c, alive: false, starting: false, shell: '' };
    term.onData((d) => {
      if (t.alive) api.ptyWrite(t.id, d);
      else if (d === '\r' && !t.starting) startPty(t);
    });
    term.onResize(({ cols, rows }) => { if (t.alive) api.ptyResize(t.id, cols, rows); });
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.key === '`') return false; // để app ẩn/hiện terminal
      if (e.ctrlKey && !e.shiftKey && k === 'c' && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); return false; }
      if (e.ctrlKey && (k === 'v' || (e.shiftKey && k === 'v'))) {
        navigator.clipboard.readText().then((s) => { if (s && t.alive) api.ptyWrite(t.id, s.replace(/\r?\n/g, '\r')); });
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && k === 'c') { if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()); return false; }
      return true;
    });
    TERM.byConv.set(c.key, t);
    TERM.byId.set(t.id, t);
    return t;
  }
  async function startPty(t) {
    t.starting = true;
    try { t.fit.fit(); } catch {}
    const r = await api.ptyCreate(t.id, t.conv.cwd, t.term.cols, t.term.rows);
    t.starting = false;
    if (!r || !r.ok) { t.term.writeln('\x1b[31m' + ((r && r.error) || 'Không mở được terminal') + '\x1b[0m'); return; }
    t.alive = true;
    t.shell = r.shell;
    t.cwd = r.cwd;
    updateTermTitle();
  }
  function updateTermTitle() {
    const t = S.active && TERM.byConv.get(S.active.key);
    $('#term-title').textContent = t && t.cwd ? `${t.shell || 'Terminal'}  ·  ${t.cwd}` : 'Terminal';
  }
  async function restartPty(t) {
    await api.ptyKill(t.id);
    t.alive = false;
    t.term.reset();
    return startPty(t);
  }
  function syncTerminal(focus) {
    if (!TERM.open || !S.active) return;
    const c = S.active;
    const t = termFor(c);
    for (const x of TERM.byConv.values()) x.el.classList.toggle('hidden', x !== t);
    requestAnimationFrame(() => {
      try { t.fit.fit(); } catch {}
      // Phiên mới đổi thư mục dự án → terminal mở lại tại thư mục mới
      if (t.alive && t.cwd && c.cwd && !samePath(t.cwd, c.cwd) && !c.count && !c.persisted) restartPty(t);
      else if (!t.alive && !t.starting) startPty(t);
      if (focus) t.term.focus();
    });
    updateTermTitle();
  }
  function toggleTerminal(on) {
    TERM.open = on != null ? on : !TERM.open;
    $('#term-panel').classList.toggle('hidden', !TERM.open);
    $('#btn-terminal').classList.toggle('on', TERM.open);
    if (TERM.open) syncTerminal(true);
    else els.input.focus();
  }
  function disposeTerminal(conv) {
    const t = TERM.byConv.get(conv.key);
    if (!t) return;
    api.ptyKill(t.id);
    t.term.dispose();
    t.el.remove();
    TERM.byConv.delete(conv.key);
    TERM.byId.delete(t.id);
  }
  function bindTerminal() {
    const panel = $('#term-panel');
    panel.style.height = (S.settings.terminalHeight || 280) + 'px';
    api.onPtyData((id, d) => { const t = TERM.byId.get(id); if (t) t.term.write(d); });
    api.onPtyExit((id, code) => {
      const t = TERM.byId.get(id);
      if (!t) return;
      t.alive = false;
      t.term.writeln(`\r\n\x1b[2m[Terminal đã thoát (mã ${code}) — nhấn Enter để mở lại]\x1b[0m`);
    });
    $('#btn-terminal').onclick = () => toggleTerminal();
    $('#term-close').onclick = () => toggleTerminal(false);
    $('#term-external').onclick = () => S.active && api.openTerminal(S.active.cwd);
    $('#term-restart').onclick = async () => {
      const t = S.active && TERM.byConv.get(S.active.key);
      if (!t) return;
      restartPty(t).then(() => t.term.focus());
    };
    // Kéo mép trên để đổi chiều cao
    $('#term-resize').addEventListener('mousedown', (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = panel.offsetHeight;
      document.body.classList.add('resizing-v');
      const move = (ev) => { panel.style.height = Math.max(120, Math.min(window.innerHeight * 0.75, h0 + (y0 - ev.clientY))) + 'px'; };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing-v');
        saveSettings({ terminalHeight: panel.offsetHeight });
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    new ResizeObserver(() => {
      if (!TERM.open || !S.active) return;
      const t = TERM.byConv.get(S.active.key);
      if (t) { try { t.fit.fit(); } catch {} }
    }).observe($('#term-host'));
  }
  function applyTermTheme() { const th = termTheme(); for (const t of TERM.byConv.values()) t.term.options.theme = th; }

  // ---------- Chia đôi màn hình: khung phải theo dõi / nhắn một phiên khác song song ----------
  S.side = null;
  S.sideShown = null;
  S.sideStick = true;
  // Gốc DOM của phiên ở khung phải nằm trong #split-convs, các phiên còn lại ở khung chính
  function placeConvs() {
    const host = $('#split-convs'), nbHost = $('#nb-convs');
    const nbc = CG.nb ? CG.nb.shownConv() : null;
    const btwc = CG.btw ? CG.btw.shownConv() : null, btwHost = $('#btw-convs');
    for (const c of S.convs.values()) {
      const side = c === S.side;
      const parent = c === btwc && btwHost ? btwHost : c === nbc ? nbHost : side ? host : els.convs;
      if (c.root.parentNode !== parent) parent.append(c.root);
      c.root.classList.toggle('hidden', !(side || c === S.active || c === nbc || c === btwc));
    }
  }
  function sideAutosize() {
    const inp = $('#split-input');
    const sc = $('#split-scroller');
    const stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
    const top = inp.scrollTop;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 160) + 'px';
    keepCaretVisible(inp, top);
    if (stick) sc.scrollTop = sc.scrollHeight;
  }
  function updateSide(full) {
    const c = S.side;
    const on = !!c;
    const col = $('#split-col'), M = CG.motion;
    $('#split-resize').classList.toggle('hidden', !on);
    if (!on) { if (M && M.paneOut) M.paneOut(col, () => col.classList.add('hidden')); else col.classList.add('hidden'); }
    else { const anim = M && M.paneWillOpen ? M.paneWillOpen(col) : false; col.classList.remove('hidden'); if (anim && M.paneIn) M.paneIn(col); }
    $('#btn-split').classList.toggle('on', on);
    const inp = $('#split-input');
    if (full) {
      S.sideShown = c;
      inp.value = c && c.draft ? c.draft.text || '' : '';
      sideAutosize();
    }
    if (!c) return;
    $('#split-title').textContent = c.title || 'Phiên';
    const waiting = c.perms.size > 0;
    const bg = c.runningTasks.length;
    $('#split-dot').className = 'st ' + (c.busy ? (waiting ? 'wait' : 'run') : bg ? 'run bg' : '');
    let status = c.cwd ? basename(c.cwd) : '';
    if (!c.busy && bg) status = `Đang chờ ${bg} tác vụ chạy nền…`;
    if (c.busy) {
      const secs = Math.floor((Date.now() - (c.turnStart || Date.now())) / 1000);
      status = `${waiting ? 'Đang chờ bạn trả lời' : c.activity || c.verb || 'Đang làm'}… ${secs >= 60 ? `${Math.floor(secs / 60)}p ${secs % 60}s` : secs + 's'}`;
    }
    const stEl = $('#split-status');
    if (stEl.textContent !== status) stEl.textContent = status;
    stEl.classList.toggle('wait', c.busy && waiting);
    const sugg = !c.busy && c.suggestion && !inp.value ? c.suggestion : '';
    inp.placeholder = sugg || (c.busy ? 'Nhắn bổ sung giữa chừng…' : 'Nhắn phiên này…  (Enter gửi, Esc dừng)');
    $('.split-composer').classList.toggle('has-sugg', !!sugg);
    $('.split-composer').classList.toggle('hidden', !!c.child);
    const send = $('#split-send');
    const stop = c.busy && !inp.value.trim();
    if (send._stop !== stop) { send._stop = stop; send.classList.toggle('stop', stop); send.innerHTML = svg(stop ? 'stop' : 'arrowUp', 16); send.title = stop ? 'Dừng (Esc)' : 'Gửi (Enter)'; }
    send.disabled = !stop && !inp.value.trim();
  }
  function setSide(conv) {
    if (!conv || conv === S.active) return;
    S.side = conv;
    S.sideStick = true;
    placeConvs();
    updateSide(true);
    if (S.settings.viewMode === 'verbose') conv.buildAllTools();
    requestAnimationFrame(() => { const s = $('#split-scroller'); s.scrollTop = s.scrollHeight; });
    renderSidebar();
  }
  async function openSide(it) {
    if (!it) return;
    if (S.active && S.active.sid === it.id) return toast('Phiên này đang ở khung chính.');
    const have = [...S.convs.values()].find((c) => c.sid === it.id);
    if (have) return setSide(have);
    await openSession(it, { background: true, onCreate: setSide });
  }
  function closeSide() {
    if (!S.side) return;
    S.side = null;
    placeConvs();
    updateSide(true);
    renderSidebar();
    els.input.focus();
  }
  function sideMenu(anchor) {
    const items = sessionItems().filter((it) => !(S.active && S.active.sid === it.id) && !(S.side && S.side.sid === it.id));
    // Phiên đang chạy lên đầu
    items.sort((a, b) => (b.conv && b.conv.busy ? 1 : 0) - (a.conv && a.conv.busy ? 1 : 0));
    if (!items.length) return toast('Chưa có phiên nào khác để mở song song.');
    menu(anchor, [
      { header: 'Mở phiên ở khung bên phải' },
      ...items.slice(0, 14).map((it) => ({
        label: it.title, desc: `${it.cwd ? basename(it.cwd) + ' · ' : ''}${it.conv && it.conv.busy ? 'đang chạy' : relTime(it.mtime)}`,
        icon: it.conv && it.conv.busy ? 'circleDot' : 'clock', onClick: () => openSide(it),
      })),
      ...(S.side ? ['-', { label: 'Đóng khung bên phải', icon: 'x', onClick: closeSide }] : []),
    ]);
  }
  function sendSide() {
    const c = S.side;
    if (!c) return;
    const inp = $('#split-input');
    const text = inp.value.trim();
    if (!text) { if (c.busy) c.interrupt(); return; }
    inp.value = '';
    c.draft = { ...(c.draft || {}), text: '', sel: null };
    S.sideStick = true;
    c.send(text, text);
    sideAutosize();
    updateSide();
  }
  function bindSplit() {
    const col = $('#split-col'), inp = $('#split-input'), sc = $('#split-scroller');
    col.style.width = (S.settings.splitWidth || 46) + '%';
    $('#btn-split').onclick = () => (S.side ? closeSide() : sideMenu($('#btn-split')));
    $('#split-close').onclick = closeSide;
    $('#split-swap').onclick = () => S.side && activate(S.side);
    $('#split-title').onclick = () => S.side && activate(S.side);
    $('#split-pick').onclick = () => sideMenu($('#split-pick'));
    $('#split-send').onclick = sendSide;
    inp.addEventListener('input', () => {
      if (S.side) S.side.draft = { ...(S.side.draft || { atts: [] }), text: inp.value };
      sideAutosize();
      updateSide();
    });
    inp.addEventListener('keydown', (e) => {
      const c = S.side;
      if (CG.listKeys(inp, e)) return;
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !inp.value && c && c.suggestion && !c.busy) {
        e.preventDefault();
        inp.value = c.suggestion;
        inp.dispatchEvent(new Event('input'));
        return;
      }
      if (e.key === 'Enter' && !e.isComposing) {
        const ctrlMode = S.settings.sendKey === 'ctrlEnter';
        if ((!ctrlMode && !e.shiftKey && !e.ctrlKey) || (ctrlMode && e.ctrlKey)) { e.preventDefault(); sendSide(); }
      }
    });
    sc.addEventListener('scroll', () => {
      S.sideStick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
      const c = S.side;
      if (c && c.hasOlder() && sc.scrollTop < 500 && !S.loadingOlderSide) {
        S.loadingOlderSide = true;
        requestAnimationFrame(() => { try { if (S.side === c) c.renderOlder(); } finally { S.loadingOlderSide = false; } });
      }
    });
    // Kéo đường chia để đổi độ rộng hai khung
    $('#split-resize').addEventListener('mousedown', (e) => {
      e.preventDefault();
      const ws = col.parentElement, x0 = e.clientX, w0 = col.offsetWidth;
      const total = ws.clientWidth - ($('#details').classList.contains('hidden') ? 0 : $('#details').offsetWidth);
      document.body.classList.add('resizing-h');
      const sg = CG.paneSign ? CG.paneSign('split') : 1;
      const move = (ev) => { col.style.width = Math.max(22, Math.min(75, ((w0 - (ev.clientX - x0) * sg) / total) * 100)) + '%'; };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing-h');
        saveSettings({ splitWidth: Math.round(parseFloat(col.style.width)) });
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  // ---------- Chủ đề ----------
  const CUSTOM_THEMES = ['tokyo', 'mocha', 'dracula', 'nord', 'rosepine', 'ghdark', 'solarized', 'latte', 'ghlight',
    'onedark', 'gruvbox', 'gruvlight', 'monokai', 'ayumirage', 'ayulight', 'everforest', 'kanagawa', 'synthwave', 'cyberpunk', 'material', 'sakura', 'matcha', 'hicontrast'];
  function applyTheme(theme) {
    // Tự đổi chủ đề theo giờ (Cài đặt › Giao diện) → chủ đề thực tế có thể khác chủ đề đã lưu
    if (CG.decor) theme = CG.decor.resolveTheme(theme || 'system');
    api.setNativeTheme(theme || 'system');
    if (CUSTOM_THEMES.includes(theme)) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    // đợi CSS (prefers-color-scheme đổi theo Windows/nativeTheme) rồi cập nhật màu terminal
    setTimeout(applyTermTheme, 60);
  }
  CG.applyTheme = applyTheme;
  // kiểu làm nổi tiêu đề / chữ đậm / đầu mục trong markdown (mặc định: không thêm gì)
  const MD_HL = ['accent', 'marker', 'chip', 'contrast', 'level'];
  function applyMdHl(v) { if (MD_HL.includes(v)) document.documentElement.dataset.mdhl = v; else delete document.documentElement.dataset.mdhl; }
  CG.applyMdHl = applyMdHl;
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(applyTermTheme, 30));

  // ---------- Wiring ----------
  function bind() {
    bindTerminal();
    bindSplit();
    api.onEvent((key, m) => { const c = S.convs.get(key); if (c) { try { c.handle(m); } catch (e) { console.error(e, m); } } });
    api.onStderr((key, line) => { const c = S.convs.get(key); console.warn('[cli]', line); if (c) { c.stderr.push(line); if (c.stderr.length > 200) c.stderr.shift(); } });
    api.onExit((key, info) => { const c = S.convs.get(key); if (c) c.onExit(info || {}); });
    api.onUsage((u) => { if (u && u.data) { S.usage = u; S.usageError = null; onUsageChanged(); } });
    api.onStarted((key, info) => { const c = S.convs.get(key); if (c && info && info.pid) c.pid = info.pid; console.log('[cli start]', info && info.args); });

    const ta = els.input;
    ta.addEventListener('input', onInput);
    ta.addEventListener('click', () => { if (S.ac && S.ac.type === 'mention') updateAc(); });
    ta.addEventListener('keydown', (e) => {
      const ac = S.ac;
      if (ac && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        ac.idx = (ac.idx + (e.key === 'ArrowDown' ? 1 : -1) + ac.items.length) % ac.items.length;
        return showAc(ac);
      }
      if (ac && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.isComposing))) { e.preventDefault(); return pickAc(ac.idx); }
      if (ac && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return closeAc(); }
      // Danh sách: xuống dòng tự thêm "- " / số tiếp theo; Tab / Shift+Tab thụt lề dòng danh sách
      if (CG.listKeys(ta, e)) return;
      // Tab: dán câu gợi ý vào ô nhập (Enter để gửi)
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !ta.value && S.active && S.active.suggestion && !S.active.busy) {
        e.preventDefault();
        ta.value = S.active.suggestion;
        ta.setSelectionRange(ta.value.length, ta.value.length);
        autosize();
        updateComposer();
        return;
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const order = ['default', 'acceptEdits', 'plan', ...(S.settings.allowBypass ? ['bypassPermissions'] : [])];
        const i = order.indexOf(S.active.mode);
        setMode(order[(i + 1) % order.length]);
        toast('Chế độ: ' + MODES.find((m) => m.v === S.active.mode).label);
        return;
      }
      if (e.key === 'Enter' && !e.isComposing) {
        const ctrlMode = S.settings.sendKey === 'ctrlEnter';
        if ((!ctrlMode && !e.shiftKey && !e.ctrlKey) || (ctrlMode && e.ctrlKey)) { e.preventDefault(); submit(); }
      }
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) closeAc(); }, 150));
    ta.addEventListener('paste', (e) => {
      const files = [...((e.clipboardData && e.clipboardData.files) || [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    els.send.onclick = () => {
      const c = S.active;
      if (c && c.busy && !els.input.value.trim() && !S.attachments.length) c.interrupt();
      else submit();
    };
    $('#btn-plus').onclick = plusMenu;
    $('#file-input').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
    $('#ctl-folder').onclick = folderMenu;
    $('#ctl-mode').onclick = modeMenu;
    $('#ctl-model').onclick = () => modelPopover(false);
    $('#ctl-usage').onclick = usagePopover;

    $('#btn-new').onclick = () => newSession();
    $('#btn-sb-filter').onclick = filterMenu;
    $('#btn-settings').onclick = () => CG.openSettings();
    $('#btn-account').onclick = accountMenu;
    $('#chat-title').onclick = () => { const c = S.active; if (c && c.count) renameSession(c.sid, c.title); };
    $('#btn-session-menu').onclick = sessionMenuForActive;
    $('#tb-folder').onclick = () => S.active && api.openPath(S.active.cwd);
    $('#btn-changes').onclick = () => toggleDetails(true, 'session');
    $('#btn-details').onclick = () => toggleDetails();
    const toggleSidebar = () => $('#app').classList.toggle('sb-hidden');
    $('#btn-hide-sidebar').onclick = toggleSidebar;
    $('#btn-show-sidebar').onclick = toggleSidebar;
    els.search.addEventListener('input', renderSidebar);

    els.scroller.addEventListener('scroll', () => {
      const s = els.scroller;
      S.stick = s.scrollHeight - s.scrollTop - s.clientHeight < 60;
      // Cuộn gần lên đầu → dựng thêm đoạn lịch sử cũ hơn
      const c = S.active;
      // (vừa mở phiên: cuộn do chính app đặt vị trí → không tự dựng thêm, tránh khựng ngay lúc hiện nội dung)
      if (c && c.hasOlder() && s.scrollTop < 500 && !S.loadingOlder && !(c.openedAt && Date.now() - c.openedAt < 900) && !document.body.classList.contains('m-hist')) {
        S.loadingOlder = true;
        requestAnimationFrame(() => { try { if (S.active === c) c.renderOlder(); } finally { S.loadingOlder = false; } });
      }
    });

    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      // localhost / đường dẫn tệp → khung xem trong app; web ngoài → trình duyệt
      if (CG.viewer && CG.viewer.handleLink(a, e)) return;
      if (/^https?:\/\//i.test(href)) api.openExternal(href);
    });

    let dragDepth = 0;
    const overlay = $('#drop-overlay');
    window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; overlay.classList.remove('hidden'); } });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; overlay.classList.add('hidden'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      overlay.classList.add('hidden');
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      const fs0 = [...e.dataTransfer.files];
      const sess = fs0.find((f) => /\.cgsession$/i.test(f.name));
      if (sess && CG.pack) return CG.pack.importSession(api.pathForFile(sess));
      addFiles(fs0);
    });

    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const inSettings = !!$('#settings-root').firstChild;
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); return CG.openSettings(); }
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); return showShortcuts(); }
      if (inSettings) { if (e.key === 'Escape') CG.closeSettings(); return; }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); return toggleTerminal(); }
      if (e.ctrlKey && e.key === '\\') { e.preventDefault(); return S.side ? closeSide() : sideMenu($('#btn-split')); }
      // Esc trong khung phải → dừng phiên của khung phải
      if (e.key === 'Escape' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#split-col')) {
        if (S.side && S.side.busy && !$('#modal-root').firstChild) { e.preventDefault(); S.side.interrupt(); }
        return;
      }
      // Đang gõ trong terminal: phím tắt của app (Esc, Ctrl+B, Ctrl+K…) thuộc về terminal
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#term-panel')) return;
      if (e.ctrlKey && !e.shiftKey && k === 'n') { e.preventDefault(); newSession(); }
      else if (e.ctrlKey && k === 'tab') {
        e.preventDefault();
        const list = S.order;
        if (!list.length) return;
        const i = list.findIndex((it) => S.active && it.id === S.active.sid);
        const n = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
        if (n) openSession(n);
      }
      else if (e.ctrlKey && !e.shiftKey && k === 'k') { e.preventDefault(); $('#app').classList.remove('sb-hidden'); els.search.focus(); els.search.select(); }
      else if (e.ctrlKey && !e.shiftKey && k === 'b') { e.preventDefault(); toggleSidebar(); }
      else if (e.ctrlKey && !e.shiftKey && k === 'o') { e.preventDefault(); const order = VIEW_MODES.map((x) => x[0]); setViewMode(order[(order.indexOf(S.settings.viewMode) + 1) % order.length]); }
      else if (e.ctrlKey && e.shiftKey && k === 'd') { e.preventDefault(); toggleDetails(!S.settings.showDetails || !!S.diffView, 'session'); }
      else if (e.ctrlKey && e.shiftKey && k === 'm') { e.preventDefault(); modeMenu(); }
      else if (e.ctrlKey && e.shiftKey && k === 'i') { e.preventDefault(); modelPopover(false); }
      else if (e.ctrlKey && e.shiftKey && k === 'e') { e.preventDefault(); modelPopover(true); }
      else if (e.key === 'Escape') {
        if ($('#modal-root').firstChild) { $('#modal-root').innerHTML = ''; return; }
        const c = S.active;
        if (!c) return;
        const pending = [...c.perms.values()];
        if (pending.length) { e.preventDefault(); pending[pending.length - 1].deny(); return; }
        if (c.busy) { e.preventDefault(); c.interrupt(); }
      }
    });

    $('#suggestions').append(...SUGGESTIONS.map(([ic, text]) => h('button', { class: 'suggestion', onclick: () => { els.input.value = text; onInput(); els.input.focus(); } }, icon(ic, 14), text)));

    $('#tasks-bar .tb-chev').innerHTML = svg('chevronDown', 12);
    $('#tasks-bar .tb-head').onclick = () => $('#tasks-bar').classList.toggle('open');
    setInterval(() => { updateIndicator(); tickTasks(); if (S.side) updateSide(); }, 500);
    setInterval(() => { if (!document.hidden) refreshSessions(); }, 30000);
    setInterval(() => { if (!document.hidden) refreshExternal(); }, 15000);
    // Có phiên CLI đang chạy thì làm mới mức dùng gói mỗi 5 phút (không tốn thêm tiến trình)
    setInterval(() => { if ([...S.convs.values()].some((c) => c.pid)) fetchUsage(true); }, 5 * 60 * 1000);
    setInterval(() => { if (S.settings.autoCheckUpdates) checkUpdates(false); }, 6 * 3600 * 1000);
    window.addEventListener('focus', () => scheduleSessionsRefresh());
  }

  CG.app = {
    loadInfo, refreshSessions, renderSidebar, updateComposer, refreshDetails, applyViewMode, newSession, openSession, usageRows, fetchUsage,
    showUsageDialog, toggleTerminal, setModel, setEffort, openSide, closeSide,
    planLimits, fmtReset, models, activate, toggleDetails,
    ctxPct: (c) => (c && c.ctx ? Math.min(1, c.ctx / ctxWindowOf(c)) : 0),
    // tạo phiên mới chạy nền (không chuyển khung chính sang) — dùng cho lịch / hàng đợi
    createConv: async (o) => {
      const id = await api.uuid();
      const conv = new Conv({ key: id, sid: id, cwd: o.cwd });
      if (o.model) conv.model = o.model;
      if (o.effort) conv.effort = o.effort;
      if (o.mode) conv.mode = o.mode === 'bypassPermissions' && !S.settings.allowBypass ? 'acceptEdits' : o.mode;
      if (o.agent) conv.agent = o.agent;
      if (o.addDirs && o.addDirs.length) conv.addDirs = o.addDirs;
      if (o.allowedTools && o.allowedTools.length) conv.allowedTools = o.allowedTools;
      if (o.title) conv.title = o.title;
      return conv;
    },
    // phiên đã có (đang mở trong app hoặc chỉ có trong lịch sử) → Conv, nạp nền nếu cần
    convFor: async (sid) => {
      let c = [...S.convs.values()].find((x) => x.sid === sid && !x.rs);
      if (c) return c;
      const it = (S.all || []).find((x) => x.id === sid);
      if (!it) return null;
      await openSession(it, { background: true });
      return [...S.convs.values()].find((x) => x.sid === sid) || null;
    },
    convs: () => [...S.convs.values()],
    rawConv: (o) => new Conv(o),
    reloadChild: (c) => reloadChild(c),
    archiveSession: (id, on) => archiveSession(id, on),
    addAttachment: (a) => { S.attachments.push(a); renderAttachments(); els.input.focus(); },
    placeConvs,
    // chèn chữ vào ô nhập của phiên chính (sổ tài liệu → "Chèn vào chat")
    insertText: (text) => insertAtCaret(text),
    reloadClaudeSettings: async () => { S.claudeSettings = (await api.claudeSettings()).data || {}; updateComposer(); },
  };

  async function init() {
    Object.assign(els, {
      main: $('#main'), convs: $('#conversations'), scroller: $('#scroller'), indicator: $('#indicator'),
      input: $('#input'), send: $('#btn-send'), sessions: $('#session-list'), search: $('#session-search'),
      title: $('#chat-title'), ac: $('#ac-menu'), atts: $('#attachments'), details: $('#details'),
    });
    hydrate();
    S.settings = await api.getSettings();
    S.home = await api.home();
    S.appInfo = await api.appInfo();
    api.setZoom(S.settings.zoom || 1);
    applyTheme(S.settings.theme);
    applyMdHl(S.settings.mdHl);
    try { S.claudeSettings = (await api.claudeSettings()).data || {}; } catch {}
    applyViewMode();
    bind();
    let dir = '';
    for (const d of [S.settings.lastDir, S.settings.cwd, ...(S.settings.recentDirs || [])]) {
      if (d && (await api.dirExists(d))) { dir = d; break; }
    }
    if (!dir) dir = S.home;
    await newSession(dir);
    refreshSessions();
    refreshExternal();
    if (S.settings.autoCheckUpdates) setTimeout(() => checkUpdates(false), 8000);
  }

  window.__gui = S; // tiện debug (F12)
  init();
})();
