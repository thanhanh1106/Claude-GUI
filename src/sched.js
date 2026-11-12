'use strict';
// Lịch & hàng đợi: hẹn giờ mở phiên / gửi prompt, nối nhiều bước thành chuỗi (bước này xong thì bước sau tự chạy),
// tự chạy khi giới hạn 5 giờ / tuần hồi, hoặc ngay sau khi một phiên đang chạy xong. Mọi bước chạy qua Claude CLI
// như khi người dùng tự gõ (vẫn ghi vào ~/.claude/projects). Lưu ở schedules.json (main.js).
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, h, svg, icon, toast, menu, modal, confirmDialog, promptDialog, basename, MODES, EFFORTS } = CG;
  const S = () => CG.S;
  const A = () => CG.app;

  // =====================================================================
  // Dữ liệu
  // =====================================================================
  const D = { plans: [], loaded: false };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const TRIGS = { now: 'Chạy khi bấm "Chạy ngay"', at: 'Vào lúc (một lần)', repeat: 'Lặp lại theo giờ', reset5: 'Khi giới hạn 5 giờ hồi', resetW: 'Khi giới hạn tuần hồi', after: 'Sau khi một phiên xong' };
  const CONDS = { ok: 'khi xong (thành công)', any: 'khi xong (kể cả lỗi)', wait: 'xong rồi chờ thêm vài phút', reset: 'khi giới hạn 5 giờ hồi' };
  const ST = { wait: ['○', 'chờ', ''], run: ['', 'đang chạy', 'run'], done: ['✓', 'xong', 'done'], err: ['✕', 'lỗi', 'err'], skip: ['–', 'bỏ qua', ''], pause: ['⏸', 'tạm dừng', 'pause'] };
  const p2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())} ${DAYS[d.getDay()]} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
  const fmtLeft = (t) => { const m = Math.round((t - Date.now()) / 60000); if (m <= 0) return 'sắp chạy'; if (m < 60) return `còn ${m} phút`; if (m < 1440) return `còn ${Math.floor(m / 60)} giờ ${m % 60 ? (m % 60) + ' phút' : ''}`.trim(); return `còn ${Math.round(m / 1440)} ngày`; };

  function newNode(kind, o = {}) {
    const st = S().settings;
    return { id: uid(), kind, prompt: '', atts: [], cwd: (S().active && S().active.cwd) || st.lastDir || '', mode: 'acceptEdits', agent: '', model: '', effort: '', target: 'prev', targetTitle: '', cond: 'ok', waitMin: 10, ...o };
  }
  function newPlan(o = {}) {
    const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
    return { id: uid(), name: 'Kế hoạch mới', on: true, created: Date.now(),
      trig: { type: 'at', date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: `${p2(d.getHours())}:00`, days: [1, 2, 3, 4, 5], minLeft: 0, everyReset: false, missed: 'run', sess: null },
      nodes: [newNode('new')], run: { state: 'idle', st: [], sids: [] }, ...o };
  }
  async function load() {
    const r = await api.schedLoad().catch((e) => ({ error: e.message }));
    if (r && r.error) toast('Không đọc được lịch: ' + r.error, true);
    D.plans = (r && Array.isArray(r.plans) ? r.plans : []).filter((p) => p && p.id);
    // app tắt giữa lúc đang chạy → không chạy tiếp ngầm được (phiên CLI đã đóng): tạm dừng, người dùng bấm "Chạy tiếp"
    for (const p of D.plans) {
      p.run = p.run || { state: 'idle', st: [], sids: [] };
      if (p.run.state === 'running') { p.run.state = 'paused'; p.run.note = 'App đã tắt khi kế hoạch đang chạy — bấm "Chạy tiếp" để làm nốt.'; p.run.st = (p.run.st || []).map((x) => (x === 'run' ? 'pause' : x)); }
      if (p.run.state === 'waiting' && !p.run.resumeAt) { p.run.state = 'paused'; p.run.note = 'App đã tắt khi đang chờ bước kế — bấm "Chạy tiếp".'; }
      p.run.runId = '';
      if (p.kind === 'project' && p.proj && p.proj.hold && p.proj.hold.kind === 'check') p.proj.hold = null;
    }
    D.loaded = true;
    if (!(r && r.error)) save(true);
  }
  let saveT = null;
  // phiên do lịch chạy (từng bước, task dự án, phiên điều phối) → báo main để máy đã kết nối cũng thấy
  // sid -> { plan, pid, label, k } — k để xếp thứ tự trong nhóm của kế hoạch (điều phối trước, rồi theo bước / task)
  function schedSids() {
    const out = {};
    const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    for (const p of D.plans) {
      if (p.demo) continue;
      const add = (sid, label, k) => { if (sid && !out[sid]) out[sid] = { plan: p.name, pid: p.id, label, k }; };
      if (p.kind === 'project' && p.proj) {
        if (p.proj.plannerSid) add(p.proj.plannerSid, 'Phiên điều phối', 0);
        (p.proj.tasks || []).forEach((t, i) => add(t.sid, `#${i + 1} ${cut(t.title, 60)}`, i + 1));
      }
      ((p.run && p.run.sids) || []).forEach((sid, i) => add(sid, `Bước ${i + 1}${p.nodes && p.nodes[i] && p.nodes[i].prompt ? ': ' + cut(p.nodes[i].prompt, 50) : ''}`, i + 1));
    }
    return out;
  }
  let lastSids = '';
  function pushSids() { const m = schedSids(), k = JSON.stringify(m); if (k !== lastSids && api.rsSchedSids) { lastSids = k; api.rsSchedSids(m); } }
  function save(now) {
    clearTimeout(saveT);
    const go = () => { pushSids(); api.schedSave({ plans: D.plans.filter((p) => !p.demo) }).then((ok) => { if (ok === false && !save.warned) { save.warned = true; toast('Không lưu được lịch (schedules.json) — kiểm tra quyền ghi thư mục dữ liệu.', true); } }).catch(() => {}); api.schedPending(pendingCount()); };
    if (now) go(); else saveT = setTimeout(go, 300);
  }
  const pendingCount = () => D.plans.filter((p) => !p.demo && p.on && (p.run.state === 'running' || p.run.state === 'waiting' || p.run.state === 'paused' || nextFire(p) != null || p.trig.type === 'after' || p.trig.type.startsWith('reset'))).length;

  // =====================================================================
  // Giới hạn (giờ hồi lấy từ cùng nguồn với bảng Sử dụng)
  // =====================================================================
  function limits() {
    const rows = (A() && A().planLimits && A().planLimits()) || [];
    let s = null, w = null;
    for (const r of rows) {
      const t = r.reset ? new Date(r.reset).getTime() : 0;
      if (r.group === 'session') { if (!s || r.pct > s.pct) s = { pct: r.pct, reset: t }; }
      else if (r.label === 'Tất cả model' || !w || r.pct > w.pct) { if (!w || r.label === 'Tất cả model' || r.pct > w.pct) w = { pct: r.pct, reset: t }; }
    }
    return { s, w };
  }
  const resetLabel = (t) => (t ? fmtTime(t) : 'chưa rõ (mở bảng Sử dụng để cập nhật)');

  // =====================================================================
  // Khi nào chạy
  // =====================================================================
  function nextFire(p) {
    const t = p.trig, r = p.run;
    if (!p.on) return null;
    if (t.type === 'at') { if (r.firedAt) return null; const v = new Date(`${t.date}T${t.time || '00:00'}`).getTime(); return isNaN(v) ? null : v; }
    if (t.type === 'repeat') {
      if (!t.days || !t.days.length) return null;
      const base = Math.max(r.firedAt || 0, p.armedAt || p.created || 0);
      const [hh, mm] = (t.time || '08:00').split(':').map(Number);
      for (let i = 0; i < 9; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i); d.setHours(hh, mm, 0, 0);
        if (d.getTime() > base && t.days.includes(d.getDay())) return d.getTime();
      }
      return null;
    }
    if (t.type === 'reset5' || t.type === 'resetW') {
      const L = limits(), x = t.type === 'reset5' ? L.s : L.w;
      if (!x || !x.reset) return null;
      if (r.firedReset && r.firedReset >= x.reset) return null; // đã chạy cho lần hồi này
      if (r.firedAt && !t.everyReset) return null;
      return x.reset + 30e3; // chờ 30 giây sau giờ hồi cho chắc
    }
    return null;
  }
  function trigText(p) {
    const t = p.trig;
    if (t.type === 'at') return `⏰ ${t.time} ngày ${(t.date || '').split('-').reverse().slice(0, 2).join('/')}`;
    if (t.type === 'repeat') return `🔁 ${t.time} ${(t.days || []).slice().sort().map((d) => DAYS[d]).join(', ')} hằng tuần`;
    if (t.type === 'reset5' || t.type === 'resetW') { const L = limits(), x = t.type === 'reset5' ? L.s : L.w; return `♻ Khi giới hạn ${t.type === 'reset5' ? '5 giờ' : 'tuần'} hồi (${x && x.reset ? fmtTime(x.reset) : '?'})${t.minLeft ? ` · chỉ khi đã dùng ≤ ${100 - t.minLeft}%` : ''}`; }
    if (t.type === 'after') return `⛓ Sau khi phiên “${(t.sess && t.sess.title) || '?'}” xong`;
    return '▶ Chạy khi bấm';
  }
  function statusText(p) {
    const r = p.run;
    if (p.kind === 'project' && CG.autopilot) return p.on ? CG.autopilot.status(p) : 'Đang tắt';
    if (!p.on) return 'Đang tắt';
    if (r.state === 'running') return `Đang chạy bước ${(r.idx || 0) + 1}/${p.nodes.length}`;
    if (r.state === 'paused') return r.resumeAt ? `Tạm dừng · chạy tiếp ${fmtLeft(r.resumeAt)}` : 'Tạm dừng';
    if (r.state === 'waiting') return r.resumeAt ? `Chờ bước kế · ${fmtLeft(r.resumeAt)}` : 'Đang chờ';
    if (r.state === 'error' && !nextFire(p)) return 'Lỗi — xem chi tiết';
    if (p.trig.type === 'after') return 'Chờ phiên đó xong';
    const n = nextFire(p);
    if (n) return `Lần tới: ${fmtTime(n)} (${fmtLeft(n)})`;
    if (r.state === 'done') return `Đã chạy xong lúc ${fmtTime(r.endAt || r.firedAt)}`;
    if (p.trig.type === 'reset5' || p.trig.type === 'resetW') return 'Chờ biết giờ hồi giới hạn';
    return p.trig.type === 'now' ? 'Bấm "Chạy ngay" để chạy' : 'Không còn lần chạy nào';
  }

  // =====================================================================
  // Chạy
  // =====================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const running = new Map(); // id kế hoạch -> mã lần chạy
  function tick() {
    if (!D.loaded) return;
    const now = Date.now();
    for (const p of D.plans) {
      if (p.demo || !p.on || running.has(p.id)) continue;
      if (p.kind === 'project' && (!p.proj.approved || p.run.state === 'running')) continue;
      const r = p.run;
      // tạm dừng có hẹn giờ chạy tiếp (chờ vài phút / chờ giới hạn hồi)
      if ((r.state === 'paused' || r.state === 'waiting') && r.resumeAt && now >= r.resumeAt) { r.resumeAt = 0; runPlan(p, r.idx || 0, true); continue; }
      if (r.state === 'paused' || r.state === 'waiting') continue;
      if (p.trig.type === 'after') {
        const sid = p.trig.sess && p.trig.sess.id;
        const c = sid && A().convs().find((x) => x.sid === sid);
        // chạy một lần cho mỗi lần đặt lịch (trước đây lượt do chính hàng đợi gửi vào phiên đó lại kích hoạt nó → gửi lặp vô hạn)
        if (r.firedAt || r.state === 'done' || r.state === 'error') continue;
        if (c && !c.busy && !c.working && c.lastEnd && c.lastEnd.t > (p.armedAt || p.created)) { if (planReady(p)) fire(p); else noteNotReady(p); }
        continue;
      }
      const t = nextFire(p);
      if (t == null || now < t) continue;
      // lỡ giờ (app tắt / máy ngủ) quá 3 phút — giống bản desktop: chỉ chạy bù MỘT lần, và chỉ khi lỡ trong 7 ngày gần nhất
      const late = now - t > 180e3 && (p.trig.type === 'at' || p.trig.type === 'repeat');
      if (late && (p.trig.missed === 'skip' || now - t > 7 * 864e5)) { r.firedAt = now; r.note = `Bỏ qua lần lỡ lúc ${fmtTime(t)} (${p.trig.missed === 'skip' ? 'theo cài đặt' : 'quá 7 ngày'}).`; save(); render(); continue; }
      if (late && p.trig.missed === 'ask') {
        // lặp lại: đã có lần mới hơn cũng bị lỡ → bỏ lần cũ, xét lần mới nhất (không để một lần lỡ chặn cả tuần)
        if (p.trig.type === 'repeat') { const keep = r.firedAt; r.firedAt = t; const n2 = nextFire(p); if (n2 != null && n2 <= now) { save(); continue; } r.firedAt = keep; }
        if (r.missedAt !== t) { r.missedAt = t; r.note = `Bị lỡ lúc ${fmtTime(t)} (app tắt / máy ngủ) — bấm "Chạy bù" hoặc "Bỏ qua".`; save(); render(); notify('Claude GUI · lịch bị lỡ', `${p.name}: lỡ lúc ${fmtTime(t)} — mở Lịch & hàng đợi để chạy bù.`); }
        continue;
      }
      if (late) { r.note = `Chạy bù lần lỡ lúc ${fmtTime(t)} (app tắt / máy ngủ).`; notify('Claude GUI · chạy bù lịch', `${p.name}: lỡ lúc ${fmtTime(t)}, đang chạy bù.`); }
      if (!planReady(p)) { noteNotReady(p); continue; }
      if (p.trig.type.startsWith('reset') && p.trig.minLeft) {
        // chỉ chạy khi giới hạn sau khi hồi còn đủ: lấy số liệu mới rồi quyết định cho đúng lần hồi này
        if (!p._fetching) {
          p._fetching = true;
          const oldReset = t - 30e3;
          Promise.resolve(A().fetchUsage(true)).catch(() => {}).finally(() => {
            p._fetching = false;
            if (!p.on || running.has(p.id) || (r.firedReset && r.firedReset >= oldReset)) return;
            const L = limits(), x = p.trig.type === 'reset5' ? L.s : L.w;
            r.firedReset = oldReset; r.firedAt = Date.now();
            if (x && x.pct > 100 - p.trig.minLeft) { r.note = `Bỏ qua lần hồi ${fmtTime(oldReset)}: giới hạn đã dùng ${Math.round(x.pct)}% (cần còn ít nhất ${p.trig.minLeft}%).`; save(); render(); return; }
            runPlan(p, 0);
          });
        }
        continue;
      }
      fire(p);
    }
    api.schedPending(pendingCount());
    // Giữ máy không ngủ khi đang chạy kế hoạch hoặc có lịch trong 30 phút tới (chỉ chặn ngủ, màn hình vẫn tắt được)
    if (api.schedAwake) {
      const soon = S().settings && S().settings.keepAwake !== false && D.plans.some((p) => !p.demo && p.on && (running.has(p.id) || p.run.state === 'running' || (() => { const n = nextFire(p); return n != null && n - now < 30 * 60e3; })()));
      if (soon !== tick.awake) { tick.awake = soon; api.schedAwake(soon); }
    }
  }
  function noteNotReady(p) { const n = 'Chưa chạy: có bước chưa có prompt — bấm vào bước đó để viết.'; if (p.run.note !== n) { p.run.note = n; save(); render(); } }
  function markReset(p) { const L = limits(), x = p.trig.type === 'reset5' ? L.s : L.w; if (x) p.run.firedReset = x.reset; }
  function fire(p) {
    p.run.firedAt = Date.now();
    if (p.trig.type.startsWith('reset')) markReset(p);
    runPlan(p, 0);
  }
  async function buildContent(node) {
    let text = (node.prompt || '').trim();
    const files = node.atts.filter((a) => a.kind === 'file').map((a) => a.path);
    const dirs = node.atts.filter((a) => a.kind === 'dir' || a.kind === 'repo').map((a) => a.path);
    if (files.length) text += (text ? '\n\n' : '') + 'Tệp đính kèm:\n' + files.map((f) => '- ' + f).join('\n');
    if (dirs.length) text += (text ? '\n\n' : '') + 'Thư mục / repo liên quan:\n' + dirs.map((f) => '- ' + f).join('\n');
    const imgs = [];
    for (const a of node.atts.filter((x) => x.kind === 'image')) { const d = await api.fileDataUrl(a.path).catch(() => null); if (d) imgs.push(d); else text += `\n- ${a.path}`; }
    // node.display: dòng hiển thị gọn trong chat (vd yêu cầu commit từ khung Thay đổi — prompt thật rất dài)
    if (!imgs.length) return { content: text, display: node.display || text, urls: [] };
    const content = imgs.map((d) => ({ type: 'image', source: { type: 'base64', media_type: d.mime, data: d.data } }));
    if (text) content.push({ type: 'text', text });
    return { content, display: text, urls: imgs.map((d) => `data:${d.mime};base64,${d.data}`) };
  }
  // chờ phiên rảnh hẳn (kể cả tác tử phụ / lệnh nền), alive() = false → thôi chờ
  async function waitIdle(c, maxMs, alive) {
    const t0 = Date.now();
    while ((c.busy || c.working || (c.perms && c.perms.size)) && Date.now() - t0 < (maxMs || 6 * 3600e3)) { if (alive && !alive()) return; await sleep(1500); }
  }
  // chờ lượt gửi lúc startT kết thúc. Bấm Dừng (kể cả khi phiên tự hỏi tóm tắt sau khi dừng) → kind 'stopped';
  // hết giới hạn → limit + resetAt lấy từ chính lỗi CLI (không dựa vào số liệu Sử dụng có thể cũ)
  async function waitEnd(c, startT, alive) {
    for (;;) {
      await sleep(1200);
      if (alive && !alive()) return { kind: 'stopped', aborted: true };
      if (!c.busy && c.lastEnd && c.lastEnd.t >= startT) {
        const e = { ...c.lastEnd };
        if (c.lastStopAt && c.lastStopAt >= startT) e.kind = 'stopped';
        return e;
      }
      if (!c.busy && !c.pid && Date.now() - startT > 20000 && !(c.lastEnd && c.lastEnd.t >= startT)) return { kind: 'error' };
    }
  }
  const limitOut = () => { const L = limits(); return (L.s && L.s.pct >= 99.5) || (L.w && L.w.pct >= 99.5); };
  function notify(title, body) { if (!document.hasFocus()) api.notify(title, body); }

  // bước có nội dung để gửi chưa (kế hoạch tạo từ mẫu / trống mà chưa viết prompt thì không chạy)
  const nodeReady = (n) => !!((n.prompt || '').trim() || (n.atts && n.atts.length));
  const planReady = (p) => p.kind === 'project' || p.nodes.every(nodeReady);
  async function runPlan(p, from, resume) {
    if (p.kind === 'project') return CG.autopilot && CG.autopilot.run(p);
    if (running.has(p.id)) return;
    const r = p.run;
    const bad = p.nodes.findIndex((n, k) => k >= from && !nodeReady(n) && !(resume && k === from && r.resumeNote));
    if (bad >= 0) { r.state = 'error'; r.note = `Bước ${bad + 1} chưa có prompt — bấm vào bước đó để viết rồi chạy lại.`; save(); render(); return; }
    // mỗi lần chạy một mã riêng: bấm Dừng / tắt / xoá kế hoạch → vòng cũ tự thoát ở lần chờ kế, không chạy chồng với vòng mới
    const my = uid();
    running.set(p.id, my);
    r.runId = my;
    if (!resume || !r.st || r.st.length !== p.nodes.length) { r.st = p.nodes.map(() => 'wait'); r.sids = []; }
    r.state = 'running'; r.note = ''; r.idx = from; r.resumeAt = 0;
    save(); render();
    notify('Claude GUI · bắt đầu kế hoạch', p.name);
    const alive = () => r.runId === my && r.state === 'running' && p.on && D.plans.includes(p);
    const release = () => { if (running.get(p.id) === my) running.delete(p.id); };
    let ok = true;
    try {
      for (let i = from; i < p.nodes.length; i++) {
        if (!alive()) { ok = false; break; }
        while (r.st.length < p.nodes.length) r.st.push('wait'); // hàng đợi được thêm bước trong lúc chạy
        const node = p.nodes[i];
        r.idx = i; r.st[i] = 'run'; save(); render();
        // phiên cho bước này
        let c = null;
        let resumed = resume && i === from && r.sids[i];
        if (resumed) c = await A().convFor(r.sids[i]);
        if (c) { /* phiên của bước đang dở */ }
        else if (node.kind === 'new') {
          resumed = false;
          if (!node.cwd) throw new Error(`Bước ${i + 1}: chưa chọn thư mục dự án`);
          const dirs = node.atts.filter((a) => a.kind === 'dir' || (a.kind === 'repo' && /^[a-zA-Z]:[\\/]|^\//.test(a.path))).map((a) => a.path);
          // việc gợi ý lưu vào hàng đợi (quy trình "sửa lỗi ở nhánh riêng"): tạo worktree trên nhánh mới rồi chạy ở đó
          let cwd = node.cwd;
          if (node.branch) {
            const w = await api.gitWorktree({ cwd: node.cwd, branch: node.branch, base: node.base });
            if (!w || !w.ok) throw new Error(`Bước ${i + 1}: không tạo được nhánh ${node.branch} — ${(w && w.error) || ''}`);
            cwd = w.path;
          }
          c = await A().createConv({ cwd, model: node.model, effort: node.effort, mode: node.mode, agent: node.agent, addDirs: dirs, title: node.title });
          if (p.suggest && CG.suggest) CG.suggest.linkChild(c.sid, p.suggest.from, node.title || p.name, node.branch);
        } else {
          resumed = false;
          const sid = node.target === 'prev' ? (i > 0 ? r.sids[i - 1] : p.trig.sess && p.trig.sess.id) : node.target;
          if (!sid) throw new Error(`Bước ${i + 1}: không có phiên để nối tiếp`);
          c = await A().convFor(sid);
          if (!c) throw new Error(`Bước ${i + 1}: không tìm thấy phiên để nối tiếp`);
          await waitIdle(c, 0, alive);
          if (!alive()) { ok = false; break; }
          // chỉ khởi động lại CLI khi effort / quyền thật sự khác (khởi động lại làm mất tác tử phụ đang chạy nền)
          const mode = node.mode === 'bypassPermissions' && !S().settings.allowBypass ? 'acceptEdits' : node.mode;
          if (node.effort && node.effort !== c.effort) { c.effort = node.effort; c.respawn = true; }
          if (mode && mode !== c.mode) { c.mode = mode; c.respawn = true; }
        }
        if (!alive()) { ok = false; break; }
        r.sids[i] = c.sid;
        c.managed = true; // kế hoạch tự chạy tiếp khi giới hạn hồi
        const startT = Date.now();
        if (resumed) {
          r.resumeNote = '';
          await c.send('Hãy làm tiếp phần việc còn dở của yêu cầu trước cho xong.', 'Làm tiếp phần việc còn dở');
        } else {
          r.resumeNote = '';
          const b = await buildContent(node);
          if (node.kind === 'new' && !c.title) c.title = `⏰ ${p.name}: ${(node.prompt || '').replace(/\s+/g, ' ').slice(0, 60)}`;
          await c.send(b.content, b.display, b.urls);
        }
        save(); render();
        const end = await waitEnd(c, startT, alive);
        if (!alive()) { ok = false; break; }
        // hết giới hạn giữa chừng → tạm dừng, tự chạy tiếp khi giới hạn hồi
        if (end.kind === 'error' && (end.limit || limitOut())) {
          r.st[i] = 'pause'; r.state = 'paused'; r.resumeAt = resumeTime(end); r.resumeNote = true;
          r.note = `Hết giới hạn ở bước ${i + 1}. Tự chạy tiếp lúc ${fmtTime(r.resumeAt)}.`;
          notify('Claude GUI · tạm dừng kế hoạch', `${p.name}: hết giới hạn, sẽ chạy tiếp lúc ${fmtTime(r.resumeAt)}`);
          ok = false; break;
        }
        r.st[i] = end.kind === 'done' ? 'done' : end.kind === 'stopped' ? 'skip' : 'err';
        // xong thì tạo Merge Request / PR cho nhánh riêng (Claude đã push theo hướng dẫn trong prompt)
        if (end.kind === 'done' && node.finish === 'mr' && node.branch) {
          const pr = await api.prCreate(c.cwd, node.title || node.branch).catch((e) => ({ ok: false, error: e.message }));
          r.note = pr && pr.ok ? `Đã tạo MR / PR: ${pr.url}` : `Chưa tạo được MR / PR: ${(pr && pr.error) || ''}`;
          if (pr && pr.ok) notify('Claude GUI · đã tạo MR', `${p.name}: ${pr.url}`);
        }
        save(); render();
        if (end.kind === 'stopped') { r.state = 'idle'; r.note = `Bước ${i + 1} đã bị dừng tay — các bước sau không chạy. Bấm "Chạy" để chạy lại từ đầu.`; r.st = r.st.map((x) => (x === 'wait' ? 'skip' : x)); ok = false; break; }
        if (end.kind !== 'done' && node.cond !== 'any') { r.state = 'error'; r.note = `Bước ${i + 1} gặp lỗi — các bước sau không chạy.`; ok = false; notify('Claude GUI · kế hoạch dừng', `${p.name}: ${r.note}`); break; }
        if (i < p.nodes.length - 1 && (node.cond === 'wait' || node.cond === 'reset')) {
          const L = limits();
          r.resumeAt = node.cond === 'wait' ? Date.now() + (+node.waitMin || 10) * 60e3 : (L.s && L.s.reset && L.s.reset > Date.now() ? L.s.reset + 60e3 : Date.now() + 3600e3);
          r.state = 'waiting'; r.idx = i + 1; r.note = '';
          save(); render(); release();
          return;
        }
      }
    } catch (e) {
      if (r.runId === my) {
        r.state = 'error'; r.note = e.message; ok = false;
        if (r.st[r.idx] === 'run') r.st[r.idx] = 'err';
        notify('Claude GUI · kế hoạch lỗi', `${p.name}: ${e.message}`);
      }
    }
    release();
    if (r.runId !== my) return; // đã bấm Dừng / chạy lại — vòng mới lo phần còn lại
    // tắt kế hoạch giữa chừng → không để kẹt ở "đang chạy"
    if (!ok && r.state === 'running') { r.state = 'idle'; r.note = p.on ? 'Đã dừng.' : 'Đã tắt kế hoạch giữa chừng — các bước sau không chạy.'; r.st = r.st.map((x) => (x === 'run' || x === 'wait' ? 'skip' : x)); }
    if (ok) {
      r.state = 'done'; r.endAt = Date.now(); r.note = '';
      if (CG.mascot && CG.mascot.addXp) CG.mascot.addXp(20);
      if (api.statsAdd) api.statsAdd({ kind: 'ev', ev: 'task' }).catch(() => {});
      notify('Claude GUI · xong kế hoạch', p.name);
      // lặp lại / mỗi lần giới hạn hồi: sẵn sàng cho lần sau ("Vào lúc" / "Sau khi phiên xong" / hàng đợi: chạy một lần)
      if (p.trig.type === 'repeat' || (p.trig.type.startsWith('reset') && p.trig.everyReset)) r.state = 'idle';
    }
    save(); render();
  }
  // giờ chạy tiếp sau khi hết giới hạn: giờ hồi CLI báo trong lỗi, không thì giờ hồi của bảng Sử dụng; luôn ở tương lai
  function resumeTime(end) {
    const L = limits();
    const x = L.w && L.w.pct >= 99.5 && !(L.s && L.s.pct >= 99.5) ? L.w : L.s;
    let at = end && end.resetAt ? end.resetAt + 60e3 : x && x.reset ? x.reset + 60e3 : 0;
    if (!at || at < Date.now() + 60e3) at = Date.now() + 30 * 60e3;
    return at;
  }
  function stopPlan(p) {
    if (p.kind === 'project') return CG.autopilot && CG.autopilot.stop(p);
    const r = p.run;
    r.runId = ''; // vòng đang chạy (kể cả đang chờ phiên rảnh) tự thoát, không gửi thêm gì
    r.state = 'idle'; r.resumeAt = 0; r.resumeNote = ''; r.note = 'Đã dừng.';
    r.st = (r.st || []).map((x) => (x === 'run' || x === 'pause' ? 'skip' : x));
    const sid = r.sids && r.sids[r.idx || 0];
    const c = sid && A().convs().find((x) => x.sid === sid && !x.rs);
    if (c && c.busy) c.interrupt();
    running.delete(p.id);
    save(); render();
  }
  const busyPlan = (p) => ['running', 'waiting', 'paused'].includes(p.run.state);

  // =====================================================================
  // Trang giao diện
  // =====================================================================
  const U = { page: null, sel: null, node: null, drawer: null, open: false };
  function ensurePage() {
    if (U.page) return;
    U.page = h('div', { id: 'sched-page', class: 'sched hidden' });
    $('#main').append(U.page);
  }
  function openPage(planId) {
    ensurePage();
    if (CG.skills) CG.skills.close();
    if (CG.remote && CG.remote.closeSched) CG.remote.closeSched();
    U.open = true;
    if (planId) U.sel = planId;
    if (!U.sel || !D.plans.find((p) => p.id === U.sel)) U.sel = D.plans[0] && D.plans[0].id;
    U.page.classList.remove('hidden');
    $('#nav-sched') && $('#nav-sched').classList.add('active');
    render();
    if (CG.mascot) CG.mascot.relayout();
  }
  function closePage() {
    if (!U.page) return;
    U.open = false; U.node = null;
    U.page.classList.add('hidden');
    $('#nav-sched') && $('#nav-sched').classList.remove('active');
    if (CG.mascot) CG.mascot.relayout();
  }
  const sel = () => D.plans.find((p) => p.id === U.sel);

  function render() {
    renderNav();
    if (!U.open || !U.page) return;
    const pg = U.page;
    const keepScroll = pg.querySelector('.sc-flow') ? pg.querySelector('.sc-flow').scrollTop : 0;
    const oldDr = pg.querySelector('.sc-drawer');
    const drKey = `${U.sel}:${U.node}`;
    const keepDr = oldDr && oldDr._key === drKey && oldDr._dirty ? oldDr : null;
    if (keepDr) keepDr.remove();
    pg.innerHTML = '';
    const L = limits();
    const lim = (x, n) => h('div', { class: 'sc-lim' + (x && x.pct >= 100 ? ' bad' : x && x.pct >= 80 ? ' warn' : '') },
      h('div', {}, `Giới hạn ${n}: `, h('b', { text: x ? Math.round(x.pct) + '%' : '?' }), ' · hồi ', h('b', { text: x && x.reset ? fmtTime(x.reset) : '?' })),
      h('div', { class: 'sc-bar' }, h('i', { style: `width:${Math.min(100, x ? x.pct : 0)}%` })));
    pg.append(h('div', { class: 'sc-hdr' },
      h('h2', { text: 'Lịch & hàng đợi' }),
      CG.remote && CG.remote.schedSwitch ? CG.remote.schedSwitch(null) : null,
      h('button', { class: 'btn primary sm', id: 'sc-new', onclick: () => templates() }, icon('plus', 14), 'Kế hoạch mới'),
      CG.pack ? h('button', { class: 'btn sm', title: 'Nhập kế hoạch / dự án tự động xuất từ Claude GUI ở máy khác (tệp .cgpack)', onclick: () => CG.pack.importPlan() }, icon('download', 13), 'Nhập') : null,
      h('button', { class: 'icon-btn sm', id: 'sc-help', title: 'Xem hướng dẫn', html: '?', onclick: () => tour() }),
      h('div', { class: 'spacer' }),
      h('div', { class: 'sc-lims' }, lim(L.s, '5 giờ'), lim(L.w, 'tuần')),
      h('button', { class: 'icon-btn', title: 'Đóng (Esc)', html: svg('x', 16), onclick: closePage })));
    const body = h('div', { class: 'sc-body' });
    const list = h('div', { class: 'sc-plans' });
    if (!D.plans.length) list.append(h('div', { class: 'sc-empty' }, h('div', { text: 'Chưa có kế hoạch nào.' }), h('button', { class: 'btn primary sm', text: 'Tạo từ mẫu', onclick: () => templates() })));
    for (const p of D.plans) {
      const tog = h('span', { class: 'sc-tog' + (p.on ? ' on' : ''), title: p.on ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật' });
      const card = h('div', { class: 'sc-plan' + (p.id === U.sel ? ' on' : '') + (p.run.state === 'running' ? ' running' : '') },
        h('div', { class: 'nm' }, h('span', { class: 'ellipsis', text: (p.demo ? '[Ví dụ] ' : '') + p.name }), tog),
        h('div', { class: 'tr', text: trigText(p) }),
        h('div', { class: 'meta' }, h('span', { text: p.kind === 'project' ? `🤖 ${p.proj.tasks.length} task` : `${p.nodes.length} bước` }), h('span', { class: 'ellipsis', text: statusText(p) })));
      card.onclick = (e) => {
        if (e.target === tog) { p.on = !p.on; if (p.on) p.armedAt = Date.now(); else if (busyPlan(p) || running.has(p.id)) { stopPlan(p); p.run.note = 'Đã tắt.'; } save(); render(); return; }
        U.sel = p.id; U.node = null; render();
      };
      list.append(card);
    }
    body.append(list);
    const flow = h('div', { class: 'sc-flow' });
    const p = sel();
    if (p && p.kind === 'project') { if (CG.autopilot) CG.autopilot.renderFlow(flow, p); }
    else if (p) renderFlow(flow, p);
    body.append(flow);
    pg.append(body);
    if (U.node != null && p) {
      const d = keepDr || drawer(p);
      if (!keepDr) { d._key = drKey; const dirty = () => { d._dirty = true; }; d.addEventListener('input', dirty); d.addEventListener('change', dirty); d.addEventListener('click', (e) => { if (e.target.closest('.days, .seg, .att, .chip')) dirty(); }); }
      pg.append(d);
    }
    flow.scrollTop = keepScroll;
  }
  function renderFlow(flow, p) {
    const r = p.run;
    const head = h('div', { class: 'sc-flow-h' }, h('h3', { class: 'ellipsis', text: p.name }));
    if (r.state === 'running' || r.state === 'waiting' || (r.state === 'paused' && r.resumeAt)) head.append(h('button', { class: 'btn sm', onclick: () => stopPlan(p) }, icon('square', 13), 'Dừng'));
    else head.append(h('button', { class: 'btn sm', id: 'sc-run', onclick: () => { if (!p.demo) runPlan(p, r.state === 'paused' ? r.idx || 0 : 0, r.state === 'paused'); else demoRun(p); } }, icon('play', 13), r.state === 'paused' ? 'Chạy tiếp' : 'Chạy ngay'));
    head.append(h('button', { class: 'btn sm', onclick: () => { const c = JSON.parse(JSON.stringify(p)); Object.assign(c, { id: uid(), name: p.name + ' (bản sao)', demo: false, on: false, run: { state: 'idle', st: [], sids: [] }, created: Date.now(), armedAt: Date.now() }); toast('Đã nhân bản — bản sao đang TẮT, xem lại giờ chạy rồi bật.'); c.nodes.forEach((n) => n.id = uid()); D.plans.unshift(c); U.sel = c.id; save(); render(); } }, 'Nhân bản'));
    if (CG.pack && !p.demo) head.append(h('button', { class: 'btn sm', title: 'Đóng gói kế hoạch để chạy ở Claude GUI máy khác', onclick: () => CG.pack.exportPlan(p) }, 'Xuất…'));
    if (CG.lan && !p.demo) head.append(h('button', { class: 'btn sm', title: 'Gửi thẳng qua mạng LAN cho Claude GUI ở máy thợ chạy, theo dõi tiến độ tại đây', onclick: () => CG.lan.sendDialog(p) }, 'Giao máy thợ…'));
    head.append(h('button', { class: 'btn sm danger-text', onclick: async () => { if (p.demo || await confirmDialog('Xoá kế hoạch?', `“${p.name}” sẽ bị xoá. Các phiên đã chạy vẫn còn trong lịch sử.`, 'Xoá')) { if (busyPlan(p) || running.has(p.id)) stopPlan(p); D.plans = D.plans.filter((x) => x !== p); U.sel = D.plans[0] && D.plans[0].id; U.node = null; save(); render(); } } }, 'Xoá'));
    flow.append(head);
    if (CG.pack) { const b = CG.pack.banner(p); if (b) flow.append(b); }
    if (r.note) flow.append(h('div', { class: 'sc-note ' + (r.state === 'error' ? 'err' : '') , text: r.note }));
    if (r.missedAt && p.trig.missed === 'ask' && nextFire(p) === r.missedAt) flow.append(h('div', { class: 'row', style: 'gap:8px;margin:-4px 0 10px' },
      h('button', { class: 'btn sm primary', text: 'Chạy bù ngay', onclick: () => { r.missedAt = 0; r.note = 'Chạy bù theo yêu cầu.'; fire(p); render(); } }),
      h('button', { class: 'btn sm', text: 'Bỏ qua lần này', onclick: () => { r.missedAt = 0; r.firedAt = Date.now(); r.note = ''; save(); render(); } })));
    const trig = h('div', { class: 'sc-node trig' + (U.node === 'trig' ? ' sel' : '') },
      h('div', { class: 'top' }, h('span', { class: 'tag trg', text: 'Kích hoạt' }), h('span', { class: 'st', text: statusText(p) })),
      h('div', { class: 'pr', text: trigText(p) + (p.trig.type === 'at' || p.trig.type === 'repeat' ? ` · app đang tắt lúc đó: ${p.trig.missed === 'skip' ? 'bỏ qua' : p.trig.missed === 'ask' ? 'hỏi trước khi chạy bù' : 'chạy bù khi mở lại'}` : '') }));
    trig.onclick = () => { U.node = 'trig'; render(); };
    flow.append(trig);
    p.nodes.forEach((n, i) => {
      const prevSt = i === 0 ? (r.state !== 'idle' && r.st && r.st[0] && r.st[0] !== 'wait') : r.st && r.st[i - 1] === 'done';
      flow.append(link(p, i, i === 0 ? 'khi kích hoạt' : CONDS[p.nodes[i - 1].cond].replace('vài', String(p.nodes[i - 1].waitMin || 10)), prevSt));
      flow.append(nodeCard(p, n, i));
    });
    flow.append(link(p, p.nodes.length, '', false, true));
    flow.append(h('div', { class: 'sc-end' }, h('button', { class: 'btn sm', onclick: () => addNode(p, p.nodes.length) }, icon('plus', 13), 'Thêm bước')));
  }
  function link(p, i, cond, lit, last) {
    const add = h('button', { class: 'add', title: 'Chèn bước ở đây', html: svg('plus', 13), onclick: (e) => { e.stopPropagation(); addNode(p, i); } });
    return h('div', { class: 'sc-link' + (lit ? ' lit' : '') + (last ? ' last' : '') }, cond ? h('span', { class: 'cond', text: cond }) : null, add);
  }
  function addNode(p, i) {
    if (busyPlan(p)) return toast('Kế hoạch đang chạy / tạm dừng — bấm Dừng trước khi thêm bước.', true);
    p.nodes.splice(i, 0, newNode('cont', i === 0 ? { kind: 'new' } : {}));
    if (p.run.st && p.run.st.length) p.run.st.splice(i, 0, 'wait');
    U.node = i; save(); render();
  }
  function nodeCard(p, n, i) {
    const st = ST[(p.run.st && p.run.st[i]) || 'wait'] || ST.wait;
    const chips = [];
    if (n.kind === 'new') chips.push(['folder', n.cwd ? basename(n.cwd) : '(chưa chọn thư mục)'], ['bot', n.agent || 'agent mặc định'], ['sparkles', n.model ? modelName(n.model) : 'model mặc định']);
    if (n.branch) chips.push(['branch', `nhánh ${n.branch}${n.base ? ' từ ' + n.base : ''}${n.finish === 'mr' ? ' · push + MR' : ' · commit'}`]);
    else chips.push(['cornerDownRight', n.target === 'prev' ? (i === 0 ? `phiên “${(p.trig.sess && p.trig.sess.title) || '?'}”` : 'phiên của bước trước') : `phiên “${n.targetTitle || n.target.slice(0, 8)}”`]);
    chips.push(['zap', modeName(n.mode)], ['gauge', n.effort ? CG.effortLabel(n.effort) : 'effort mặc định']);
    const el = h('div', { class: 'sc-node' + (U.node === i ? ' sel' : '') + (st[2] ? ' ' + st[2] : '') },
      h('div', { class: 'top' }, h('span', { class: 'tag ' + n.kind, text: n.kind === 'new' ? 'Phiên mới' : 'Nối tiếp phiên' }), h('span', { class: 'idx', text: `Bước ${i + 1}` }),
        h('span', { class: 'st ' + st[2] }, st[2] === 'run' ? h('span', { class: 'spinner' }) : st[0], ' ' + st[1])),
      h('div', { class: 'pr', text: n.prompt || '(chưa có prompt — bấm để sửa)' }),
      h('div', { class: 'chips' }, chips.map(([ic, t]) => h('span', { class: 'chip' }, icon(ic, 12), h('span', { class: 'ellipsis', text: t }))),
        n.atts.map((a) => h('span', { class: 'chip att' }, icon(a.kind === 'image' ? 'image' : a.kind === 'dir' ? 'folder' : a.kind === 'repo' ? 'branch' : 'paperclip', 12), h('span', { class: 'ellipsis', text: basename(a.path) || a.path })))));
    // bước đã chạy: bấm "Mở phiên" để xem
    const sid = p.run.sids && p.run.sids[i];
    if (sid && !p.demo) el.append(h('button', { class: 'btn xs sc-open', text: 'Mở phiên', onclick: (e) => { e.stopPropagation(); openSess(sid); } }));
    el.onclick = () => { U.node = i; render(); };
    return el;
  }
  async function openSess(sid) {
    const c = await A().convFor(sid);
    closePage();
    if (c) A().activate(c);
  }
  const modelName = (v) => { const m = (A().models() || []).find((x) => x.value === v); return m ? m.displayName || v : v; };
  const modeName = (v) => (MODES.find((m) => m.v === v) || {}).label || 'Hỏi trước';

  // ----- bảng sửa
  function drawer(p) {
    const isTrig = U.node === 'trig';
    const box = h('div', { class: 'sc-drawer' });
    const bodyEl = h('div', { class: 'db' });
    let saveFn = () => {};
    const closeD = () => { U.node = null; render(); };
    box.append(h('div', { class: 'dh' }, h('h3', { text: isTrig ? 'Kích hoạt kế hoạch' : `Sửa bước ${U.node + 1}` }), h('div', { class: 'spacer' }), h('button', { class: 'icon-btn sm', html: svg('x', 15), onclick: closeD })));
    box.append(bodyEl);
    const foot = h('div', { class: 'df' }, h('button', { class: 'btn primary', id: 'sc-save', text: 'Lưu', onclick: () => { if (saveFn() !== false) { save(); closeD(); } } }));
    if (!isTrig) {
      const i = U.node;
      foot.append(h('button', { class: 'btn', text: 'Nhân bản', onclick: () => { if (busyPlan(p)) return toast('Kế hoạch đang chạy / tạm dừng — bấm Dừng trước.', true); const n = JSON.parse(JSON.stringify(p.nodes[i])); n.id = uid(); p.nodes.splice(i + 1, 0, n); if (p.run.st && p.run.st.length) p.run.st.splice(i + 1, 0, 'wait'); save(); closeD(); } }));
      foot.append(h('div', { class: 'spacer' }));
      foot.append(h('button', { class: 'btn danger-text', text: 'Xoá bước', disabled: p.nodes.length < 2, onclick: () => { if (busyPlan(p)) return toast('Kế hoạch đang chạy / tạm dừng — bấm Dừng trước khi xoá bước.', true); p.nodes.splice(i, 1); if (p.run.st) p.run.st.splice(i, 1); if (p.run.sids) p.run.sids.splice(i, 1); save(); closeD(); } }));
      saveFn = nodeForm(bodyEl, p, p.nodes[i], i);
    } else saveFn = trigForm(bodyEl, p);
    box.append(foot);
    return box;
  }
  const field = (label, ...kids) => h('div', { class: 'f' }, label ? h('label', { text: label }) : null, ...kids);
  const selectEl = (opts, val, id) => { const s = h('select', { id: id || null }); for (const [v, t, dis] of opts) s.append(h('option', { value: v, text: t, selected: v === val, disabled: !!dis })); return s; };
  function seg(opts, val, onPick, id) {
    const box = h('div', { class: 'seg', id: id || null });
    for (const [v, t] of opts) { const b = h('button', { class: v === val ? 'on' : '', text: t, onclick: () => { box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(v); } }); box.append(b); }
    return box;
  }
  function nodeForm(el, p, n, i) {
    let kind = n.kind;
    const atts = n.atts.slice();
    const st = S().settings;
    const dirs = [n.cwd, ...(st.recentDirs || [])].filter((d, k, a) => d && a.indexOf(d) === k);
    const cwdSel = selectEl([...dirs.map((d) => [d, d]), ['__pick', 'Chọn thư mục khác…']], n.cwd);
    cwdSel.onchange = async () => { if (cwdSel.value !== '__pick') return; const d = await api.pickDir(n.cwd); if (d) { cwdSel.prepend(h('option', { value: d, text: d })); cwdSel.value = d; loadAgents(); } else cwdSel.value = n.cwd || dirs[0] || ''; };
    const agentSel = selectEl([['', 'Mặc định (không dùng agent riêng)']], n.agent);
    const loadAgents = async () => {
      const list = await api.listAgents(cwdSel.value).catch(() => []);
      const cur = agentSel.value || n.agent;
      agentSel.innerHTML = '';
      agentSel.append(h('option', { value: '', text: 'Mặc định (không dùng agent riêng)' }));
      for (const a of list) agentSel.append(h('option', { value: a.name, text: a.name + (a.desc ? ' — ' + a.desc.slice(0, 50) : ''), selected: a.name === cur }));
      if (cur && !list.some((a) => a.name === cur)) agentSel.append(h('option', { value: cur, text: cur + ' (không tìm thấy)', selected: true }));
    };
    loadAgents();
    const modelSel = selectEl([['', 'Mặc định'], ...(A().models() || []).filter((m) => m.value !== 'default').map((m) => [m.value, m.displayName || m.value])], n.model);
    const modeSel = selectEl(MODES.map((m) => [m.v, m.label + (m.v === 'bypassPermissions' && !st.allowBypass ? ' (chưa bật trong Cài đặt)' : ''), m.v === 'bypassPermissions' && !st.allowBypass]), n.mode, 'sc-mode');
    const effSel = selectEl([['', 'Mặc định'], ...EFFORTS.map((e) => [e.v, e.label])], n.effort);
    const condSel = selectEl(Object.entries(CONDS), n.cond, 'sc-cond');
    const waitIn = h('input', { type: 'number', min: 1, max: 1440, value: n.waitMin || 10, class: 'sc-wait' });
    // nối tiếp vào phiên nào
    const tgt = [];
    if (i > 0) tgt.push(['prev', `Phiên của bước ${i}`]);
    else if (p.trig.type === 'after' && p.trig.sess) tgt.push(['prev', `Phiên “${p.trig.sess.title}” (phiên kích hoạt)`]);
    for (const s of (S().all || []).filter((x) => !x.child).slice(0, 40)) tgt.push([s.id, (s.title || s.id).slice(0, 70)]);
    if (n.target !== 'prev' && !tgt.some(([v]) => v === n.target)) tgt.push([n.target, n.targetTitle || n.target]);
    const tgtSel = selectEl(tgt, n.target === 'prev' && !tgt.length ? '' : n.target);
    const ta = h('textarea', { id: 'sc-prompt', placeholder: 'Việc cần Claude làm… (có thể dùng /lệnh, @đường-dẫn như khi chat)', value: n.prompt });
    ta.value = n.prompt || '';
    const attBox = h('div', { class: 'atts' });
    const drawAtts = () => {
      attBox.innerHTML = '';
      atts.forEach((a, k) => attBox.append(h('span', { class: 'chip' }, icon(a.kind === 'image' ? 'image' : a.kind === 'dir' ? 'folder' : a.kind === 'repo' ? 'branch' : 'paperclip', 12), h('span', { class: 'ellipsis', text: basename(a.path) || a.path, title: a.path }),
        h('button', { class: 'x', html: svg('x', 11), title: 'Bỏ', onclick: () => { atts.splice(k, 1); drawAtts(); } }))));
    };
    drawAtts();
    const IMG = /\.(png|jpe?g|gif|webp)$/i;
    const attRow = h('div', { class: 'row', id: 'sc-attrow' },
      h('button', { class: 'btn sm', onclick: async () => { for (const f of await api.pickFiles({ title: 'Chọn tệp, ảnh hoặc video' })) atts.push({ kind: IMG.test(f) ? 'image' : 'file', path: f }); drawAtts(); } }, icon('paperclip', 13), 'Tệp / ảnh / video'),
      h('button', { class: 'btn sm', onclick: async () => { const d = await api.pickDir(cwdSel.value); if (d) { atts.push({ kind: 'dir', path: d }); drawAtts(); } } }, icon('folder', 13), 'Thư mục'),
      h('button', { class: 'btn sm', onclick: async () => { const v = await promptDialog('Repo liên quan', '', 'Đường dẫn repo trên máy hoặc địa chỉ git (https://…, git@…)'); if (v && v.trim()) { atts.push({ kind: 'repo', path: v.trim() }); drawAtts(); } } }, icon('branch', 13), 'Repo'));
    const onlyNew = [field('Thư mục dự án', cwdSel), h('div', { class: 'two' }, field('Agent', agentSel), field('Model', modelSel))];
    const onlyCont = [field('Nối tiếp vào', tgtSel, h('div', { class: 'hint', text: 'Prompt được gửi thẳng vào phiên đó, Claude làm tiếp với toàn bộ ngữ cảnh cũ. Phiên đang bận thì chờ nó xong rồi mới gửi.' }))];
    const waitRow = field('Chờ (phút)', waitIn);
    const apply = () => { onlyNew.forEach((x) => x.classList.toggle('hidden', kind !== 'new')); onlyCont.forEach((x) => x.classList.toggle('hidden', kind !== 'cont')); waitRow.classList.toggle('hidden', condSel.value !== 'wait'); };
    condSel.onchange = apply;
    el.append(
      field('Loại bước', seg([['new', '＋ Mở phiên mới'], ['cont', '↪ Nối tiếp phiên']], kind, (v) => { kind = v; apply(); }, 'sc-kind')),
      ...onlyCont,
      field('Prompt', ta, attRow, attBox),
      ...onlyNew,
      h('div', { class: 'two', id: 'sc-opts' }, field('Chế độ quyền', modeSel), field('Effort', effSel)),
      h('div', { class: 'two', id: 'sc-condbox' }, field('Bước kế tiếp chạy', condSel), waitRow),
      h('div', { class: 'hint', text: 'Chế độ "Hỏi trước" thì bước sẽ dừng chờ bạn bấm cho phép (có thông báo Windows). Chạy qua đêm không ai trông thì chọn "Tự chấp nhận sửa" hoặc "Tự động". Hết giới hạn giữa chừng: kế hoạch tạm dừng và tự chạy tiếp khi giới hạn hồi.' }));
    apply();
    setTimeout(() => ta.focus(), 50);
    return () => {
      if (kind === 'new' && (!cwdSel.value || cwdSel.value === '__pick')) { toast('Chọn thư mục dự án cho bước này.', true); return false; }
      const tv = tgtSel.value;
      Object.assign(n, { kind, prompt: ta.value, atts, cwd: cwdSel.value, agent: agentSel.value, model: modelSel.value, mode: modeSel.value, effort: effSel.value, cond: condSel.value, waitMin: +waitIn.value || 10,
        target: kind === 'cont' ? tv || 'prev' : 'prev', targetTitle: kind === 'cont' && tv !== 'prev' ? (tgtSel.selectedOptions[0] || {}).text || '' : '' });
      if (kind === 'new' && n.cwd) { const rec = [n.cwd, ...(st.recentDirs || []).filter((d) => d !== n.cwd)].slice(0, 15); api.setSettings({ recentDirs: rec }); }
    };
  }
  function trigForm(el, p) {
    const t = p.trig;
    let type = t.type;
    const days = new Set(t.days || [1, 2, 3, 4, 5]);
    const name = h('input', { type: 'text', value: p.name });
    const typeSel = selectEl(Object.entries(TRIGS), type, 'sc-trigtype');
    const date = h('input', { type: 'date', value: t.date || '' }), time = h('input', { type: 'time', value: t.time || '09:00' });
    const rtime = h('input', { type: 'time', value: t.time || '08:30' });
    const dayBox = h('div', { class: 'days' }, DAYS.map((d, k) => { const b = h('button', { class: days.has(k) ? 'on' : '', text: d, onclick: () => { days.has(k) ? days.delete(k) : days.add(k); b.classList.toggle('on'); } }); return b; }));
    const minLeft = h('input', { type: 'number', min: 0, max: 100, value: t.minLeft || 0 });
    const every = h('input', { type: 'checkbox', checked: !!t.everyReset });
    const L = limits();
    const sessList = [...A().convs().filter((c) => c.count && c.busy), ...A().convs().filter((c) => c.count && !c.busy)];
    const sessSel = selectEl(sessList.map((c) => [c.sid, (c.busy ? '● ' : '') + (c.title || c.sid).slice(0, 70)]), t.sess && t.sess.id);
    if (t.sess && !sessList.some((c) => c.sid === t.sess.id)) sessSel.append(h('option', { value: t.sess.id, text: t.sess.title, selected: true }));
    const missed = selectEl([['run', 'Chạy bù một lần khi mở app (lỡ trong 7 ngày)'], ['ask', 'Hỏi trước khi chạy bù'], ['skip', 'Bỏ qua lần đó']], t.missed || 'run');
    const blocks = {
      at: field('Thời điểm', h('div', { class: 'two' }, date, time)),
      repeat: h('div', {}, field('Giờ', rtime), field('Các ngày', dayBox)),
      reset: h('div', {}, h('div', { class: 'hint', text: `Giới hạn 5 giờ hồi lúc ${resetLabel(L.s && L.s.reset)}, giới hạn tuần hồi ${resetLabel(L.w && L.w.reset)}. Giờ hồi cập nhật liên tục, kế hoạch tự dời theo.` }),
        field('Chỉ chạy nếu sau khi hồi còn ít nhất (% giới hạn, 0 = luôn chạy)', minLeft), h('label', { class: 'chk' }, every, ' Chạy lại mỗi lần giới hạn hồi')),
      after: field('Phiên cần chờ', sessSel, h('div', { class: 'hint', text: 'Phiên đó xong lượt hiện tại thì bước 1 chạy (bước 1 có thể "Nối tiếp phiên" để gửi tiếp vào chính phiên đó). ● = đang chạy.' })),
      missed: field('Nếu app đang tắt đúng lúc đó', missed),
    };
    const apply = () => {
      blocks.at.classList.toggle('hidden', type !== 'at'); blocks.repeat.classList.toggle('hidden', type !== 'repeat');
      blocks.reset.classList.toggle('hidden', !type.startsWith('reset')); blocks.after.classList.toggle('hidden', type !== 'after');
      blocks.missed.classList.toggle('hidden', type !== 'at' && type !== 'repeat');
    };
    typeSel.onchange = () => { type = typeSel.value; apply(); };
    el.append(field('Tên kế hoạch', name), field('Kích hoạt', typeSel), blocks.at, blocks.repeat, blocks.reset, blocks.after, blocks.missed,
      h('div', { class: 'hint', text: 'Có lịch chờ chạy thì khi đóng cửa sổ, app thu xuống khay hệ thống để tới giờ vẫn chạy được (tắt trong Cài đặt).' }));
    apply();
    return () => {
      if (type === 'after' && !sessSel.value) { toast('Chưa có phiên nào để chờ. Mở một phiên trước.', true); return false; }
      if (type === 'repeat' && !days.size) { toast('Chọn ít nhất một ngày.', true); return false; }
      p.name = name.value.trim() || 'Kế hoạch';
      const prevType = t.type;
      const before = JSON.stringify([t.type, t.date, t.time, (t.days || []).slice().sort(), t.sess && t.sess.id, t.minLeft, t.everyReset]);
      Object.assign(t, { type, date: date.value, time: type === 'repeat' ? rtime.value : time.value, days: [...days].sort(), minLeft: +minLeft.value || 0, everyReset: every.checked, missed: missed.value,
        sess: type === 'after' ? { id: sessSel.value, title: ((sessSel.selectedOptions[0] || {}).text || '').replace(/^● /, '') } : t.sess });
      // đổi giờ / đổi kiểu / đổi phiên → coi như lịch mới (chỉ đổi tên thì không chạy lại)
      const changed = before !== JSON.stringify([t.type, t.date, t.time, (t.days || []).slice().sort(), t.sess && t.sess.id, t.minLeft, t.everyReset]);
      if (changed) {
        p.armedAt = Date.now();
        p.run.firedAt = 0; p.run.firedReset = 0; p.run.missedAt = 0;
        if (p.run.state === 'done' || p.run.state === 'error') { p.run.state = 'idle'; p.run.note = ''; }
        if (type === 'at') { const v = new Date(`${t.date}T${t.time || '00:00'}`).getTime(); if (v < Date.now() - 60e3) toast('Giờ đã chọn đã qua — kế hoạch sẽ chạy ngay (chạy bù).'); }
      } else if (prevType !== type) p.armedAt = Date.now();
    };
  }

  // =====================================================================
  // Thanh bên + menu gửi ▾ ở ô chat
  // =====================================================================
  function renderNav() {
    let nav = $('#nav-sched');
    if (!nav) {
      const nb = $('#btn-new');
      if (!nb) return;
      nav = h('button', { id: 'nav-sched', class: 'new-session nav-sched', onclick: () => (U.open ? closePage() : openPage()) },
        icon('clock', 16), h('span', { text: 'Lịch & hàng đợi' }), h('span', { class: 'nav-new hidden', text: 'MỚI' }), h('span', { class: 'nav-count hidden' }));
      nb.after(nav);
    }
    const n = D.plans.filter((p) => p.on && !p.demo).length, runningN = D.plans.filter((p) => p.run.state === 'running').length;
    const cnt = nav.querySelector('.nav-count');
    cnt.textContent = runningN ? `${runningN} đang chạy` : n || '';
    cnt.classList.toggle('hidden', !n && !runningN);
    cnt.classList.toggle('run', !!runningN);
    nav.querySelector('.nav-new').classList.toggle('hidden', !!S().settings.schedTourDone);
  }
  function sendMoreMenu() {
    const c = S().active;
    const text = $('#input').value.trim();
    const atts = S().attachments || [];
    const has = !!(text || atts.length);
    const nodeAtts = () => atts.map((a) => (a.kind === 'image' ? (a.path ? { kind: 'image', path: a.path } : null) : { kind: 'file', path: a.path })).filter(Boolean);
    const lostImg = atts.some((a) => a.kind === 'image' && !a.path);
    const clear = () => { $('#input').value = ''; S().attachments = []; $('#input').dispatchEvent(new Event('input')); A().updateComposer(); };
    const busy = c && (c.busy || c.working);
    menu($('#btn-send-more'), [
      { label: 'Gửi ngay', desc: busy ? 'Claude đang làm: tin được gửi bổ sung giữa chừng' : null, icon: 'arrowUp', kbd: 'Enter', disabled: !has, onClick: () => $('#btn-send').click() },
      busy ? { label: 'Đổi hướng', desc: 'Dừng việc đang làm, rồi làm theo tin này', icon: 'cornerDownRight', disabled: !has, onClick: () => { redirect(c); } } : null,
      '-',
      { label: 'Xếp sau việc hiện tại', desc: busy ? 'Phiên này xong lượt đang chạy thì tự gửi tin này' : 'Phiên đang rảnh — gửi ngay là được', icon: 'listPlus', disabled: !has || !busy || !c.count, onClick: () => { queueAfter(c, text, nodeAtts()); clear(); } },
      { label: 'Lên lịch gửi…', desc: 'Gửi vào phiên này theo giờ / khi giới hạn hồi', icon: 'clock', disabled: !has || !c || !c.count, onClick: () => { scheduleSend(c, text, nodeAtts()); clear(); } },
      S().settings.guiSkills !== false && CG.autopilot ? { label: 'Lên kế hoạch & lập lịch', desc: 'Claude lên kế hoạch chi tiết, hỏi rồi chia thành nhiều task (mỗi task model/effort riêng) để bạn duyệt', icon: 'layers', disabled: !has || busy, onClick: () => CG.autopilot.planFromComposer() } : null,
      CG.lark ? { label: 'Hỏi qua Lark…', desc: 'Gửi nội dung đang gõ thành câu hỏi cho người thật (designer…) qua bot Lark — câu trả lời quay về phiên này', icon: 'message', disabled: !has, onClick: () => { CG.lark.compose({ question: text }); clear(); } } : null,
      { label: 'Mở phiên mới sau khi xong…', desc: busy ? 'Phiên này xong thì mở phiên mới với tin này' : 'Lên lịch mở phiên mới với tin này', icon: 'plus', disabled: !has || !c, onClick: () => { newAfter(c, text, nodeAtts(), busy); clear(); } },
      lostImg ? { header: 'Ảnh dán từ clipboard không đưa vào lịch được — hãy đính kèm bằng tệp' } : null,
      '-',
      { label: 'Mở Lịch & hàng đợi', icon: 'clock', onClick: () => openPage() },
    ], { place: 'top' });
  }
  function redirect(c) {
    // gửi bằng nút như bình thường nhưng đánh dấu: dừng lượt hiện tại (không tóm tắt) rồi gửi tin này
    c.redirectNext = true;
    $('#btn-send').click();
  }
  // hàng đợi "sau khi phiên này xong" còn bước chưa gửi (đang chờ hoặc đang chạy)
  const pendingQueue = (c) => D.plans.find((x) => !x.demo && x.on && x.queue && x.trig.type === 'after' && x.trig.sess && x.trig.sess.id === c.sid && x.run.state !== 'done' && x.run.state !== 'error');
  function queueAfter(c, text, atts, o = {}) {
    // gộp vào hàng đợi đang chờ / đang chạy của phiên (vòng chạy đọc lại số bước sau mỗi bước)
    let p = pendingQueue(c);
    const node = newNode('cont', { prompt: text, atts, target: 'prev', mode: c.mode, cwd: c.cwd, ...(o.display ? { display: o.display } : {}) });
    if (p) { p.nodes.push(node); if (p.run.st && p.run.st.length) p.run.st.push('wait'); }
    else {
      p = newPlan({ name: `Hàng đợi: ${(c.title || 'phiên').slice(0, 40)}`, queue: true, nodes: [node] });
      p.trig = { ...p.trig, type: 'after', sess: { id: c.sid, title: c.title || c.sid } };
      p.armedAt = Date.now();
      D.plans.unshift(p);
    }
    save(); render();
    if (!o.quiet) toast(`Đã xếp vào hàng đợi (bước ${p.nodes.length}). Phiên này xong thì tự gửi.`);
    return p;
  }
  // việc Claude gợi ý (thẻ trong chat) → kế hoạch một bước "Phiên mới", có thể chạy trên nhánh git riêng
  function addSuggest(o) {
    const node = newNode('new', { prompt: o.prompt, display: '🛠 ' + o.title, title: o.title, cwd: o.cwd, mode: o.mode || 'acceptEdits', model: o.model || '', branch: o.branch || '', base: o.base || '', finish: o.finish || '' });
    const p = newPlan({ name: '🛠 ' + String(o.title || 'Việc gợi ý').slice(0, 70), nodes: [node], suggest: { from: o.fromSid, fromTitle: o.fromTitle } });
    if (o.when === 'after') p.trig = { ...p.trig, type: 'after', sess: { id: o.fromSid, title: o.fromTitle || o.fromSid } };
    else if (o.when === 'reset5') p.trig = { ...p.trig, type: 'reset5' };
    else if (o.when === 'at') p.trig = { ...p.trig, type: 'at' };
    else p.trig = { ...p.trig, type: 'now' };
    p.armedAt = Date.now();
    D.plans.unshift(p); save(); render();
    if (o.when === 'at') { openPage(p.id); U.node = 'trig'; render(); }
    return p;
  }
  function scheduleSend(c, text, atts) {
    const p = newPlan({ name: `Gửi hẹn giờ: ${(c.title || 'phiên').slice(0, 40)}`, nodes: [newNode('cont', { prompt: text, atts, target: c.sid, targetTitle: c.title || c.sid, mode: c.mode, cwd: c.cwd })] });
    D.plans.unshift(p); save();
    openPage(p.id); U.node = 'trig'; render();
  }
  function newAfter(c, text, atts, busy) {
    const p = newPlan({ name: `Phiên mới sau: ${(c.title || 'phiên').slice(0, 40)}`, nodes: [newNode('new', { prompt: text, atts, cwd: c.cwd, mode: c.mode, model: c.model === 'default' ? '' : c.model, effort: c.effort })] });
    if (busy && c.count) { p.trig = { ...p.trig, type: 'after', sess: { id: c.sid, title: c.title || c.sid } }; p.armedAt = Date.now(); }
    D.plans.unshift(p); save();
    openPage(p.id); U.node = busy ? 0 : 'trig'; render();
  }
  function installComposer() {
    if ($('#btn-send-more')) return;
    const send = $('#btn-send');
    if (!send) return;
    const b = h('button', { id: 'btn-send-more', class: 'icon-btn sm send-more', title: 'Cách gửi khác: xếp hàng, hẹn giờ, đổi hướng… (Ctrl+Shift+Enter)', html: svg('chevronUp', 14), 'data-pop-anchor': '' });
    b.onclick = (e) => { e.stopPropagation(); sendMoreMenu(); };
    send.before(b);
    addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter' && document.activeElement === $('#input')) { e.preventDefault(); e.stopPropagation(); sendMoreMenu(); }
      if (e.key === 'Escape' && U.open && !document.querySelector('.popover, .modal-bg, .t-modal-bg') && !T.on) { if (U.node != null) { U.node = null; render(); } else closePage(); }
    }, true);
  }

  // =====================================================================
  // Kế hoạch mẫu
  // =====================================================================
  const TPL = [
    { n: '🌙 Chạy qua đêm', d: 'Hẹn 23:00: mở phiên làm việc lớn, rồi nối tiếp viết test và tóm tắt thay đổi.', make: () => { const p = newPlan({ name: 'Chạy qua đêm' }); const d = new Date(); if (d.getHours() >= 23) d.setDate(d.getDate() + 1);
      p.trig = { ...p.trig, type: 'at', date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time: '23:00' };
      p.nodes = [newNode('new', { prompt: '' }), newNode('cont', { prompt: 'Viết test cho phần vừa làm, chạy và sửa đến khi pass.' }), newNode('cont', { prompt: 'Tóm tắt các thay đổi vào CHANGELOG.md (không commit, không push).', cond: 'any' })]; return p; } },
    { n: '♻ Khi giới hạn hồi', d: 'Tự chạy ngay khi giới hạn 5 giờ hồi, để không phí lượt dùng.', make: () => { const p = newPlan({ name: 'Khi giới hạn hồi' }); p.trig = { ...p.trig, type: 'reset5' }; return p; } },
    { n: '🔁 Việc định kỳ', d: 'Ví dụ 8:30 sáng thứ 2: tổng hợp commit tuần trước thành báo cáo.', make: () => { const p = newPlan({ name: 'Báo cáo định kỳ' }); p.trig = { ...p.trig, type: 'repeat', time: '08:30', days: [1] }; p.nodes = [newNode('new', { prompt: 'Tổng hợp các commit tuần trước thành báo cáo ngắn (theo người, theo tính năng).', mode: 'default' })]; return p; } },
    { n: '⛓ Nối đuôi phiên đang chạy', d: 'Phiên đang chạy xong thì gửi tiếp prompt vào chính phiên đó.', make: () => { const p = newPlan({ name: 'Nối đuôi phiên' }); const c = S().active; p.trig = { ...p.trig, type: 'after', sess: c && c.count ? { id: c.sid, title: c.title || c.sid } : null }; p.nodes = [newNode('cont', { prompt: '' })]; return p; } },
  ];
  function templates() {
    let m = null;
    const close = () => m && m.close();
    const body = h('div', { class: 'tpl' }, TPL.map((t) => h('div', { onclick: () => { close(); const p = t.make(); p.armedAt = Date.now(); D.plans.unshift(p); save(); openPage(p.id); U.node = 'trig'; render(); } }, h('b', { text: t.n }), h('span', { text: t.d }))));
    m = modal('Tạo kế hoạch', h('div', {}, h('div', { class: 'hint', style: 'margin-bottom:8px', text: 'Chọn một mẫu rồi sửa lại theo ý, hoặc tạo kế hoạch trống.' }), body),
      [h('button', { class: 'btn', text: 'Đóng', onclick: () => close() }), h('button', { class: 'btn primary', text: 'Kế hoạch trống', onclick: () => { close(); const p = newPlan(); p.armedAt = Date.now(); D.plans.unshift(p); save(); openPage(p.id); U.node = 'trig'; render(); } })], { cls: 'sc-tpl-modal' });
  }

  // =====================================================================
  // Có gì mới + hướng dẫn (8 bước, robot dẫn đường)
  // =====================================================================
  const NEWS = {
    '1.7.0': [
      ['clock', 'Lịch & hàng đợi', 'Hẹn giờ cho Claude chạy, xếp nhiều prompt nối đuôi, tự chạy khi giới hạn hồi.', true],
      ['bot', 'Linh vật robot mới', 'Mắt LED biểu cảm theo việc Claude đang làm, đeo tai nghe khi bạn mở nhạc. Kéo để đổi chỗ.', true],
      ['eye', 'Tự mở khung xem', 'Claude tạo trang web, md, pdf hay chạy localhost → hiện luôn bên cạnh.', false],
      ['message', 'Nhắn bổ sung giữa chừng', 'Claude tiếp thu rồi làm tiếp việc đang dở, không bỏ ngang.', false],
      ['sparkles', 'Hiệu ứng chuyển phiên', 'Chuyển phiên, gửi tin, mở bảng đều mượt hơn.', false],
    ],
  };
  async function whatsNew(force) {
    const info = await api.appInfo().catch(() => null);
    const v = info && info.version;
    const st = S().settings;
    const items = NEWS[v] || (force ? NEWS['1.7.0'] : null);
    if (!items) return;
    if (!force && st.seenVersion === v) return;
    api.setSettings({ seenVersion: v }).then((s) => { S().settings = s; });
    const bot = h('div', { class: 'wn-bot' });
    const body = h('div', { class: 'wn' },
      h('div', { class: 'wn-top' }, bot, h('div', {}, h('h2', { text: 'Claude GUI vừa được cập nhật' }), h('div', { class: 'hint', text: `Phiên bản ${v || ''} · có ${items.length} điểm mới` }))),
      items.map(([ic, t, d, hl]) => h('div', { class: 'wn-f' + (hl ? ' hl' : '') }, icon(ic, 18, 'wn-ic'), h('div', {}, h('b', { text: t }), h('span', { text: d })))));
    let m = null;
    const close = () => m && m.close();
    m = modal(null, body, [
      h('button', { class: 'btn', text: 'Để sau', onclick: () => { close(); renderNav(); } }),
      h('button', { class: 'btn primary', text: 'Xem hướng dẫn Lịch & hàng đợi (1 phút)', onclick: () => { close(); openPage(); setTimeout(tour, 250); } }),
    ], { cls: 'wn-modal' });
    if (CG.mascot && CG.mascot.createBot) { const b = CG.mascot.createBot(bot, 96); b.state('love'); setTimeout(() => b.state('done'), 1500); }
  }

  const T = { on: false };
  const nodesEl = () => [...document.querySelectorAll('#sched-page .sc-node:not(.trig)')];
  const STEPS = [
    { el: () => $('#nav-sched'), face: 'done', title: 'Mục mới: Lịch & hàng đợi',
      text: 'Hẹn giờ cho Claude làm việc và <b>xếp nhiều prompt nối đuôi</b>: bước này xong thì bước sau tự chạy, kể cả khi bạn không ngồi máy. Có lịch chờ thì đóng cửa sổ app thu xuống khay để tới giờ vẫn chạy.' },
    { el: () => $('#sched-page .sc-plans'), face: 'reading', title: 'Danh sách kế hoạch',
      text: 'Mỗi thẻ ghi cách kích hoạt và lần chạy tới. Gạt công tắc để tạm tắt. Phía trên là <b>giờ hồi giới hạn 5 giờ và tuần</b>: kế hoạch có thể chạy đúng lúc đó để không phí lượt.' },
    { el: () => $('#sched-page .sc-node.trig'), face: 'thinking', title: 'Kích hoạt: khi nào chạy',
      text: 'Giờ cụ thể, lặp theo thứ trong tuần, khi giới hạn hồi, hoặc <b>ngay sau khi một phiên đang chạy xong</b>. Bấm vào để đổi bất kỳ lúc nào.' },
    { el: () => nodesEl()[0], face: 'writing', title: 'Mỗi bước là một prompt',
      text: '<b class="t-new">Thẻ cam</b> mở phiên mới (thư mục, agent, model, effort). <b class="t-cont">Thẻ xanh</b> nối tiếp phiên trước, giữ nguyên ngữ cảnh. Chạy xong, bấm "Mở phiên" trên thẻ để xem.' },
    { el: () => nodesEl()[1], face: 'permission', wait: 'click', title: 'Thử nào!',
      text: '<span class="t-act">Bấm vào bước 2</span> để mở bảng sửa. Lịch đã lên rồi vẫn sửa được.' },
    { el: () => $('#sched-page .sc-drawer .db'), face: 'idle', title: 'Sửa một bước',
      text: 'Đổi <b>loại bước</b>, viết prompt, <b>đính kèm</b> tệp / ảnh / video / thư mục / repo, chọn <b>chế độ quyền, effort</b> và <b>khi nào sang bước sau</b>. Chạy qua đêm thì chọn "Tự chấp nhận sửa" để Claude không dừng chờ bạn.' },
    { el: () => document.querySelectorAll('#sched-page .sc-link')[2], face: 'permission', wait: 'add', pre: () => { U.node = null; render(); U.page.classList.add('tour-show'); }, title: 'Chèn thêm bước',
      text: 'Rê chuột lên đường nối giữa hai bước sẽ hiện nút ＋. <span class="t-act">Bấm ＋ để chèn một bước</span>.' },
    { el: () => $('#btn-send-more'), face: 'celebrate', last: true, pre: () => { U.page.classList.remove('tour-show'); U.node = null; closePage(); }, title: 'Từ ô chat cũng được 🎉',
      text: 'Đang chat mà muốn xếp việc tiếp theo thì bấm <b>▴</b> cạnh nút gửi (<kbd>Ctrl+Shift+Enter</kbd>): xếp sau việc hiện tại, hẹn giờ, hoặc mở phiên mới sau khi xong. Xem lại hướng dẫn bằng nút <b>?</b> trên trang Lịch.' },
  ];
  function demoPlan() {
    const p = newPlan({ name: 'Đêm nay refactor (ví dụ)', demo: true, on: false });
    p.nodes = [newNode('new', { prompt: 'Refactor module network/: tách PacketHandler thành từng file theo opcode, giữ nguyên hành vi. Chạy build sau mỗi bước.', effort: 'high' }),
      newNode('cont', { prompt: 'Viết test cho các handler vừa tách, chạy và sửa đến khi pass.' }),
      newNode('cont', { prompt: 'Tóm tắt thay đổi vào CHANGELOG.md (không push).', cond: 'any', effort: 'low' })];
    p.trig = { ...p.trig, type: 'at', time: '23:00' };
    return p;
  }
  function tour() {
    if (T.on) return;
    openPage();
    // luôn dùng kế hoạch ví dụ (không lưu) để người dùng bấm thử thoải mái
    const demo = demoPlan();
    D.plans.unshift(demo); U.sel = demo.id; U.node = null; render();
    T.on = true; T.demo = demo; T.i = 0;
    T.blocks = [0, 1, 2, 3].map(() => { const d = h('div', { class: 't-block' }); document.body.append(d); return d; });
    T.hole = h('div', { class: 't-hole' }); document.body.append(T.hole);
    T.botBox = h('div', { class: 't-bot' });
    T.title = h('h4'); T.text = h('p'); T.dots = h('div', { class: 'dots' }, STEPS.map(() => h('i')));
    T.back = h('button', { class: 'btn sm', text: '←', onclick: () => { if (!U.open) openPage(T.demo.id); go(T.i - 1); } });
    T.next = h('button', { class: 'btn primary sm', onclick: () => (STEPS[T.i].last ? (endTour(true), templates()) : go(T.i + 1)) });
    T.tip = h('div', { class: 't-tip' }, h('div', { class: 'hd' }, T.botBox, T.title), T.text,
      h('div', { class: 'ft' }, T.dots, h('button', { class: 'btn sm ghost', text: 'Bỏ qua', onclick: () => endTour(true) }), T.back, T.next));
    document.body.append(T.tip);
    T.bot = CG.mascot && CG.mascot.createBot ? CG.mascot.createBot(T.botBox, 60) : null;
    addEventListener('resize', layoutTour); T.scroll = () => layoutTour(); document.addEventListener('scroll', T.scroll, true);
    T.key = (e) => { if (!T.on) return; if (e.key === 'Escape') { e.stopPropagation(); endTour(true); } else if (e.key === 'ArrowRight' && !STEPS[T.i].wait) T.next.click(); else if (e.key === 'ArrowLeft' && T.i > 0) T.back.click(); };
    addEventListener('keydown', T.key, true);
    go(0);
  }
  function go(n) {
    if (!T.on || n < 0 || n >= STEPS.length) return;
    if (T.cleanup) T.cleanup(); T.cleanup = null;
    T.i = n; const s = STEPS[n];
    if (s.pre) s.pre();
    setTimeout(() => {
      const el = s.el(); if (!el) return go(n + 1);
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center' });
      T.title.textContent = s.title; T.text.innerHTML = s.text;
      [...T.dots.children].forEach((d, j) => d.classList.toggle('on', j === n));
      T.back.style.visibility = n ? '' : 'hidden';
      T.next.style.display = s.wait ? 'none' : ''; T.next.textContent = s.last ? 'Xong · chọn kế hoạch mẫu' : 'Tiếp →';
      T.hole.classList.toggle('pulse', !!s.wait);
      if (T.bot) T.bot.switchTo(s.face);
      if (s.wait) {
        const target = s.wait === 'add' ? el.querySelector('.add') : el;
        const hnd = () => setTimeout(() => go(n + 1), s.wait === 'add' ? 120 : 260);
        target.addEventListener('click', hnd, { once: true, capture: true });
        T.cleanup = () => target.removeEventListener('click', hnd, { capture: true });
      }
      layoutTour(); setTimeout(layoutTour, 360);
    }, s.pre ? 300 : 30);
  }
  function layoutTour() {
    if (!T.on) return;
    const el = STEPS[T.i].el(); if (!el) return;
    const p = 6, r = el.getBoundingClientRect(), x = r.left - p, y = r.top - p, w = r.width + p * 2, hh = r.height + p * 2, W = innerWidth, H = innerHeight;
    Object.assign(T.hole.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
    const B = T.blocks;
    Object.assign(B[0].style, { left: 0, top: 0, width: W + 'px', height: Math.max(0, y) + 'px' });
    Object.assign(B[1].style, { left: 0, top: y + hh + 'px', width: W + 'px', height: Math.max(0, H - y - hh) + 'px' });
    Object.assign(B[2].style, { left: 0, top: y + 'px', width: Math.max(0, x) + 'px', height: hh + 'px' });
    Object.assign(B[3].style, { left: x + w + 'px', top: y + 'px', width: Math.max(0, W - x - w) + 'px', height: hh + 'px' });
    const tw = 360, th = T.tip.offsetHeight, g = 14;
    const opts = [['r', W - (x + w) - g], ['l', x - g], ['b', H - (y + hh) - g], ['t', y - g]], need = { r: tw, l: tw, b: th, t: th };
    const side = (opts.find(([k, v]) => v >= need[k]) || opts.sort((a, b) => b[1] - a[1])[0])[0];
    let tx, ty;
    if (side === 'r') { tx = x + w + g; ty = y + hh / 2 - th / 2; } else if (side === 'l') { tx = x - g - tw; ty = y + hh / 2 - th / 2; }
    else if (side === 'b') { tx = x + w / 2 - tw / 2; ty = y + hh + g; } else { tx = x + w / 2 - tw / 2; ty = y - g - th; }
    tx = Math.max(10, Math.min(W - tw - 10, tx)); ty = Math.max(10, Math.min(H - th - 10, ty));
    T.tip.style.left = tx + 'px'; T.tip.style.top = ty + 'px';
    if (T.bot) { const dx = x + w / 2 - (tx + 36), dy = y + hh / 2 - (ty + 28), d = Math.hypot(dx, dy) || 1; T.bot.lookAt = { x: dx / d, y: dy / d * .8 }; }
  }
  function endTour(done) {
    if (!T.on) return;
    if (T.cleanup) T.cleanup();
    T.on = false;
    [...T.blocks, T.hole, T.tip].forEach((x) => x.remove());
    if (T.bot && CG.mascot.dropBot) CG.mascot.dropBot(T.bot);
    removeEventListener('resize', layoutTour); document.removeEventListener('scroll', T.scroll, true); removeEventListener('keydown', T.key, true);
    if (U.page) U.page.classList.remove('tour-show');
    D.plans = D.plans.filter((p) => !p.demo);
    U.sel = D.plans[0] && D.plans[0].id; U.node = null;
    if (done) api.setSettings({ schedTourDone: true }).then((s) => { S().settings = s; renderNav(); });
    render();
  }
  // chạy mô phỏng (kế hoạch ví dụ)
  function demoRun(p) {
    p.run.st = p.nodes.map(() => 'wait'); p.run.state = 'running';
    let i = 0;
    const step = () => { if (i > 0) p.run.st[i - 1] = 'done'; if (i < p.nodes.length) { p.run.st[i] = 'run'; p.run.idx = i; } else p.run.state = 'done'; render(); if (i++ < p.nodes.length) setTimeout(step, 1300); };
    step();
  }

  // =====================================================================
  // Khởi động
  // =====================================================================
  const boot = setInterval(async () => {
    if (!S() || !S().settings || !$('#btn-new')) return;
    clearInterval(boot);
    await load();
    renderNav();
    installComposer();
    setInterval(tick, 10000);
    setInterval(() => { if (U.open && !T.on && U.node == null) render(); }, 30000);
    setTimeout(tick, 3000);
    // đổi phiên ở thanh bên → đóng trang Lịch
    $('#session-list').addEventListener('click', () => { if (U.open && !T.on) closePage(); }, true);
    $('#btn-new').addEventListener('click', () => { if (U.open) closePage(); }, true);
    setTimeout(() => whatsNew(false), 1500);
  }, 100);

  // ----- máy đã kết nối xem / điều khiển lịch (remote.js gọi qua rs:req) -----
  function remoteSnapshot() {
    if (!D.loaded) return { ok: false, error: 'Lịch ở máy kia chưa tải xong' };
    const L = limits();
    return { ok: true, limits: L, t: Date.now(), plans: D.plans.filter((p) => !p.demo).map((p) => {
      const r = p.run || {};
      const o = { id: p.id, name: p.name, kind: p.kind || 'plan', on: !!p.on, trig: trigText(p), status: statusText(p), state: r.state || 'idle', note: r.note || '', idx: r.idx || 0, resumeAt: r.resumeAt || 0,
        busy: busyPlan(p) || running.has(p.id), missed: !!(r.missedAt && p.trig.missed === 'ask' && nextFire(p) === r.missedAt) };
      if (o.kind === 'project' && CG.autopilot && p.proj) o.proj = CG.autopilot.remoteView(p);
      else o.steps = (p.nodes || []).map((n, i) => ({ kind: n.kind, prompt: String(n.prompt || '').slice(0, 600), st: (r.st && r.st[i]) || 'wait', sid: (r.sids && r.sids[i]) || '', where: n.kind === 'new' ? (n.cwd ? basename(n.cwd) : '') : n.target === 'prev' ? (i ? 'phiên của bước trước' : (p.trig.sess && p.trig.sess.title) || '') : n.targetTitle || '', model: n.model || '', cond: CONDS[n.cond] ? CONDS[n.cond].replace('vài', String(n.waitMin || 10)) : '' }));
      return o;
    }) };
  }
  async function remoteAct(d) {
    const p = D.plans.find((x) => x.id === d.id && !x.demo);
    if (!p) return { ok: false, error: 'Không còn kế hoạch này' };
    const r = p.run;
    if (p.kind === 'project' && CG.autopilot && !['toggle'].includes(d.act)) return CG.autopilot.remoteAct(p, d.act, d.arg || {});
    switch (d.act) {
      case 'toggle': p.on = !p.on; if (p.on) p.armedAt = Date.now(); else if (busyPlan(p) || running.has(p.id)) { if (p.kind === 'project' && CG.autopilot) CG.autopilot.stop(p); else stopPlan(p); p.run.note = 'Đã tắt.'; } save(); render(); break;
      case 'run': if (busyPlan(p) && r.state !== 'paused') return { ok: false, error: 'Kế hoạch đang chạy' }; runPlan(p, r.state === 'paused' ? r.idx || 0 : 0, r.state === 'paused'); break;
      case 'stop': stopPlan(p); break;
      case 'missedRun': r.missedAt = 0; r.note = 'Chạy bù theo yêu cầu (từ máy khác).'; fire(p); render(); break;
      case 'missedSkip': r.missedAt = 0; r.firedAt = Date.now(); r.note = ''; save(); render(); break;
      default: return { ok: false, error: 'Không rõ thao tác' };
    }
    return { ok: true };
  }
  setTimeout(pushSids, 3000);
  CG.sched = { queueAfter, remoteSnapshot, remoteAct, sidMap: schedSids, planRunning: (pid) => { const p = D.plans.find((x) => x.id === pid); return !!(p && (p.run.state === 'running' || running.has(p.id))); }, addSuggest, pendingQueue, _h: { save, render, waitEnd, waitIdle, limitOut, limits, fmtTime, trigText, resumeTime }, _newPlan: newPlan, nextFire, open: openPage, close: closePage, tour, whatsNew, templates, _go: go, _end: endTour, get plans() { return D.plans; }, runPlan, tick, _D: D, _U: U };
})();
