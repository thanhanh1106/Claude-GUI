'use strict';
// Dự án tự động: Claude (phiên điều phối, model mạnh) lên kế hoạch → ghi .claude-gui/runs/<id>/plan.json → GUI mở màn duyệt
// trong Lịch & hàng đợi (kế hoạch loại "project") → mỗi task chạy một phiên mới với model/effort riêng, nhận context.md +
// bàn giao của task trước → task xin đổi lịch / design đổi → hàng đợi dừng, phiên điều phối soạn bản sửa, người dùng duyệt.
// Mọi bước đều chạy qua Claude CLI như khi người dùng tự gõ.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, svg, icon, toast, modal, confirmDialog, promptDialog, basename, MODES, EFFORTS } = CG;
  const S = () => CG.S;
  const A = () => CG.app;
  const SC = () => CG.sched;

  // trọng số chi phí tương đối theo giá output/MTok (Haiku 5.5 $0.5 · Sonnet 5.5 $10 · Opus 5.5 $20 · Fable 5.1 $50)
  const W = { haiku: 1, sonnet: 20, opus: 40, fable: 100 };
  const EW = { low: 0.6, medium: 1, high: 1.6, xhigh: 2, max: 2.6 };
  const MODELS = [['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus'], ['fable', 'Fable']];
  const MN = Object.fromEntries(MODELS);
  const POLICY = { ask: ['Luôn hỏi tôi', 'dừng hàng đợi chờ duyệt'], minor: ['Tự nhờ planner soạn', 'tự gửi cho phiên điều phối, tôi chỉ duyệt bản sửa'], auto: ['Để planner tự quyết', 'áp dụng bản sửa luôn, chỉ báo kết quả'] };
  const TST = { wait: ['○', 'chờ'], run: ['', 'đang chạy'], done: ['✓', 'xong'], err: ['✕', 'lỗi'], ask: ['?', 'cần bạn xem'], part: ['◐', 'dừng giữa chừng'], skip: ['–', 'bỏ qua'], pause: ['⏸', 'tạm dừng'] };
  const isDone = (t) => t.st === 'done' || t.st === 'skip';
  const RUN_RE = /^(.*[\\/]\.claude-gui[\\/]runs[\\/][^\\/]+)[\\/]plan\.json$/i;
  const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const join = (...a) => a.filter(Boolean).map((x, i) => (i ? String(x).replace(/^[\\/]+/, '') : String(x).replace(/[\\/]+$/, ''))).join('\\');
  const up = (p, n) => { let x = String(p).replace(/[\\/]+$/, ''); for (let i = 0; i < n; i++) x = x.replace(/[\\/][^\\/]*$/, ''); return x; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const readText = async (f) => { const r = await api.apFs('read', f).catch(() => null); return r && r.ok ? r : null; };
  const writeText = (f, t) => api.apFs('write', f, t);
  const plans = () => (SC() ? SC().plans : []);
  const projects = () => plans().filter((p) => p.kind === 'project');
  const save = () => SC() && SC()._h.save();
  const render = () => SC() && SC()._h.render();
  function notify(title, body, bub) {
    if (!document.hasFocus()) api.notify(title, body);
    if (bub && CG.mascot && CG.mascot.bubble) try { CG.mascot.bubble([h('div', { text: title }), h('div', { class: 'mb-sub', text: body })], { ms: 7000 }); } catch {}
  }
  const log = (p, text) => { const L = (p.proj.log = p.proj.log || []); L.push({ t: Date.now(), text }); if (L.length > 60) L.splice(0, L.length - 60); };

  // =====================================================================
  // plan.json → task
  // =====================================================================
  const okModel = (m) => { m = String(m || '').toLowerCase(); return MODELS.some(([v]) => v === m) ? m : (/haiku/.test(m) ? 'haiku' : /sonnet/.test(m) ? 'sonnet' : /fable/.test(m) ? 'fable' : /opus/.test(m) ? 'opus' : 'sonnet'); };
  const okEff = (e) => (EFFORTS.some((x) => x.v === e) ? e : 'medium');
  function parseTasks(j) {
    const seen = new Set();
    return (Array.isArray(j.tasks) ? j.tasks : []).map((x, i) => {
      let id = String(x.id || 't' + (i + 1)).replace(/[^\w.-]/g, '').slice(0, 24) || 't' + (i + 1);
      while (seen.has(id)) id += '_';
      seen.add(id);
      return {
        id, phase: +x.phase || 1, title: String(x.title || x.name || `Task ${i + 1}`).slice(0, 200), prompt: String(x.prompt || ''),
        acc: String(x.acceptance || x.acc || ''), model: okModel(x.model), effort: okEff(x.effort), size: Math.max(1, Math.min(5, +x.size || 2)),
        why: String(x.why || ''), deps: (Array.isArray(x.deps) ? x.deps : []).map(String), cp: !!x.checkpoint, cont: !!x.continue,
        status: x.status ? String(x.status) : '', st: 'wait', sid: '',
      };
    }).map((t, _i, all) => { t.deps = t.deps.filter((d) => d !== t.id && all.some((y) => y.id === d)); return t; });
  }
  const toJsonTask = (t) => ({ id: t.id, phase: t.phase, title: t.title, prompt: t.prompt, acceptance: t.acc, model: t.model, effort: t.effort, size: t.size, why: t.why, deps: t.deps, checkpoint: t.cp, continue: t.cont, ...(t.st !== 'wait' ? { status: t.st } : {}) });
  async function writePlanJson(p) {
    const P = p.proj;
    const j = { version: 1, name: p.name, goal: P.goal, dir: P.dir, addDirs: P.addDirs, phases: P.phases, mcp: P.mcp, tasks: P.tasks.map(toJsonTask) };
    P.selfWrite = Date.now();
    await writeText(join(P.run, 'plan.json'), JSON.stringify(j, null, 2));
  }

  // agent ghi plan.json → tạo / cập nhật dự án
  function onToolResult(c, card) {
    if (!card || !['Write', 'Edit', 'MultiEdit'].includes(card.name)) return;
    const inp = card.input || {};
    const m = RUN_RE.exec(String(inp.file_path || inp.path || ''));
    if (m) setTimeout(() => onPlanFile(c, m[1]).catch((e) => console.error('autopilot', e)), 150);
  }
  async function onPlanFile(c, runDir) {
    const r = await readText(join(runDir, 'plan.json'));
    if (!r) return;
    let j;
    try { j = JSON.parse(r.text); } catch (e) { toast('plan.json chưa đúng JSON: ' + e.message, true); return; }
    const tasks = parseTasks(j);
    if (!tasks.length) return;
    let p = projects().find((x) => norm(x.proj.run) === norm(runDir));
    if (!p) {
      p = newProject(c, runDir, j, tasks);
      SC()._D.plans.unshift(p);
      api.apExclude(p.proj.dir).catch(() => {});
      log(p, `Phiên “${c.title || 'lập kế hoạch'}” đề xuất ${tasks.length} task`);
      save(); render();
      card(c, p, 'new');
      notify('Claude GUI · kế hoạch đề xuất', `${p.name}: ${tasks.length} task — mở để duyệt`, true);
      return;
    }
    const P = p.proj;
    if (c.sid && !P.plannerSid) P.plannerSid = c.sid;
    Object.assign(P, { goal: j.goal || P.goal, phases: Array.isArray(j.phases) && j.phases.length ? j.phases : P.phases, mcp: Array.isArray(j.mcp) ? j.mcp.map(String) : P.mcp });
    if (j.name) p.name = String(j.name).slice(0, 80);
    if (!P.approved) {
      // bản nháp chưa duyệt: thay luôn
      P.tasks = tasks.map((t) => ({ ...t, st: t.status === 'done' ? 'done' : 'wait' }));
      P.hold = null;
      log(p, 'Phiên điều phối cập nhật bản nháp' + (j.change ? ': ' + j.change : ''));
      save(); render(); card(c, p, 'upd');
      return;
    }
    // đang chạy dở → bản sửa lịch, chờ duyệt
    P.pending = { tasks, change: String(j.change || ''), at: Date.now(), from: c.sid };
    log(p, 'Phiên điều phối gửi bản sửa lịch' + (j.change ? ': ' + j.change : ''));
    if (P.policy === 'auto') { applyPending(p); toast(`Đã tự áp dụng bản sửa lịch cho “${p.name}”`); if (p.run.state !== 'running') run(p); return; }
    hold(p, { kind: 'pending' }, 'Bản sửa lịch đã sẵn sàng — xem và duyệt');
    card(c, p, 'pending');
  }
  function newProject(c, runDir, j, tasks) {
    const st = S().settings;
    const dir = j.dir && typeof j.dir === 'string' ? j.dir : (c.cwd || up(runDir, 3));
    const sched = SC();
    const p = sched._newPlan({ name: String(j.name || basename(runDir)).slice(0, 80) });
    Object.assign(p, {
      kind: 'project', nodes: [], on: true,
      proj: {
        run: runDir, dir, addDirs: Array.isArray(j.addDirs) ? j.addDirs.map(String) : [], goal: String(j.goal || ''),
        phases: Array.isArray(j.phases) && j.phases.length ? j.phases : [{ id: 1, name: 'Giai đoạn 1' }],
        mcp: Array.isArray(j.mcp) ? j.mcp.map(String) : [], tasks: tasks.map((t) => ({ ...t, st: 'wait' })),
        plannerSid: c.sid, plannerTitle: c.title || '', approved: false, policy: st.apPolicy || 'ask', mode: 'acceptEdits',
        designCheck: st.apDesignCheck !== false, checkedPhases: [], hold: null, pending: null, log: [],
      },
    });
    p.trig = { ...p.trig, type: 'now' };
    return p;
  }
  // thẻ trong khung chat của phiên lập kế hoạch
  function card(c, p, kind) {
    if (!c || !c.addToTurn) return;
    const P = p.proj;
    const t = { new: [`Kế hoạch đề xuất: ${p.name} · ${P.tasks.length} task`, 'Claude GUI nhận ra plan.json — mở để sửa prompt / model / effort trước khi chạy', 'Mở để duyệt'],
      upd: [`Đã cập nhật kế hoạch: ${p.name} · ${P.tasks.length} task`, 'Bản nháp trong Lịch & hàng đợi đã được thay bằng bản mới', 'Mở'],
      pending: [`Bản sửa lịch: ${p.name}`, 'Hàng đợi đang tạm dừng — xem thay đổi rồi áp dụng', 'Xem bản sửa'] }[kind];
    c.addToTurn(h('div', { class: 'ap-card' }, h('span', { class: 'ic', html: svg('clock', 22) }),
      h('div', { class: 'tx' }, h('b', { text: t[0] }), h('small', { text: t[1] })),
      h('button', { class: 'btn primary sm', text: t[2], onclick: () => SC().open(p.id) })));
  }

  // =====================================================================
  // Chạy
  // =====================================================================
  const running = new Set();
  function hold(p, hd, note) {
    const P = p.proj;
    P.hold = { ...hd, at: Date.now() };
    p.run.state = 'paused'; p.run.resumeAt = 0; p.run.note = note || '';
    save(); render();
    notify('Claude GUI · dự án tạm dừng', `${p.name}: ${note || ''}`, true);
    return 'stop';
  }
  const phaseName = (P, id) => ((P.phases || []).find((x) => +x.id === +id) || {}).name || `Giai đoạn ${id}`;
  function nextTask(P) {
    for (const t of P.tasks) {
      if (isDone(t) || t.st === 'ask' || t.st === 'err' || t.st === 'part') continue;
      if (t.deps.every((d) => { const x = P.tasks.find((y) => y.id === d); return !x || isDone(x); })) return t;
    }
    return null;
  }
  async function run(p) {
    if (running.has(p.id)) return;
    const P = p.proj, r = p.run;
    running.add(p.id);
    P.approved = true; P.hold = null;
    r.state = 'running'; r.note = ''; r.resumeAt = 0;
    log(p, 'Bắt đầu / chạy tiếp');
    save(); render();
    try {
      for (;;) {
        if (!p.on || r.state !== 'running') break;
        if (P.designReq) { await askPlannerDesign(p); break; }
        const t = nextTask(P);
        if (!t) {
          const left = P.tasks.filter((x) => !isDone(x));
          if (!left.length) {
            r.state = 'done'; r.endAt = Date.now(); r.note = '';
            log(p, 'Xong toàn bộ task');
            notify('Claude GUI · xong dự án', p.name, true);
            if (CG.mascot && CG.mascot.addXp) CG.mascot.addXp(30);
            if (CG.mascot && CG.mascot.lifeEv) CG.mascot.lifeEv('auto');
          } else hold(p, { kind: 'blocked' }, `Còn ${left.length} task chưa chạy được (task phụ thuộc chưa xong / cần bạn xem).`);
          break;
        }
        // kiểm tra design trước khi sang giai đoạn mới (giai đoạn đầu vừa đọc lúc lập kế hoạch)
        const firstPhase = Math.min(...P.tasks.map((x) => +x.phase || 1));
        if (P.designCheck && +t.phase !== firstPhase && !(P.checkedPhases || []).includes(+t.phase)) {
          (P.checkedPhases = P.checkedPhases || []).push(+t.phase);
          const ch = await designCheck(p, t.phase);
          if (r.state !== 'running') break;
          if (ch && ch.changed) { hold(p, { kind: 'designchg', items: ch.items, phase: t.phase }, `Design đã đổi từ lúc lập kế hoạch (${ch.items.length} chỗ) — xem trước khi chạy ${phaseName(P, t.phase)}.`); break; }
        }
        const res = await runTask(p, t);
        if (res === 'stop') break;
      }
    } catch (e) {
      console.error(e);
      hold(p, { kind: 'err', text: e.message }, 'Lỗi: ' + e.message);
    }
    running.delete(p.id);
    save(); render();
  }
  async function buildTaskPrompt(p, t) {
    const P = p.proj, i = P.tasks.indexOf(t), N = P.tasks.length;
    const ctx = await readText(join(P.run, 'context.md'));
    const hos = [];
    for (const d of t.deps) {
      const x = P.tasks.find((y) => y.id === d);
      const ho = await readText(join(P.run, 'handoff', d + '.md'));
      if (ho) hos.push(`### ${d}${x ? ' — ' + x.title : ''}\n${ho.text.slice(0, 6000)}`);
    }
    return `🤖 ${p.name} · ${i + 1}/${N}: ${t.title}
[Dự án tự động "${p.name}" — task ${t.id}] Dùng skill claude-gui:lam-task. Thư mục chạy (RUN): ${P.run}
Thư mục dự án: ${P.dir}

## Bức tranh tổng (RUN/context.md)
${ctx ? ctx.text.slice(0, 20000) : '(chưa có context.md)'}

## Bàn giao của các task trước
${hos.length ? hos.join('\n\n') : '(không có — task này không phụ thuộc task nào)'}

## Nhiệm vụ
${t.prompt}

## Tiêu chí xong
${t.acc || '(tự đánh giá theo nhiệm vụ)'}

Khi xong (kể cả chưa đạt): ghi bàn giao vào ${join(P.run, 'handoff', t.id + '.md')} đúng mẫu của skill lam-task (có dòng "Đạt tiêu chí: có | một phần | không").
Nếu thấy kế hoạch sai: dùng skill claude-gui:xin-doi-lich (ghi ${join(P.run, 'replan', t.id + '.json')}) rồi dừng.`;
  }
  const accOf = (text) => { const m = /Đạt tiêu chí\s*:\s*\**\s*(có|một phần|không)/i.exec(text || ''); return m ? m[1].toLowerCase() : ''; };
  async function runTask(p, t) {
    const P = p.proj, r = p.run, H = SC()._h;
    const i = P.tasks.indexOf(t);
    const resume = (t.st === 'pause' || t.st === 'run') && t.sid;
    t.st = 'run'; t.t0 = t.t0 && resume ? t.t0 : Date.now(); r.idx = i;
    save(); render();
    let c;
    const prev = i > 0 ? P.tasks[i - 1] : null;
    if (resume) c = await A().convFor(t.sid);
    else if (t.cont && prev && prev.sid) {
      c = await A().convFor(prev.sid);
      if (c) { await H.waitIdle(c); c.model = t.model; c.effort = t.effort; c.respawn = true; }
    }
    if (!c) c = await A().createConv({ cwd: P.dir, model: t.model, effort: t.effort, mode: P.mode, addDirs: P.addDirs, allowedTools: P.mcp });
    if (!resume) c.title = `🤖 ${p.name} · ${i + 1}. ${t.title}`.slice(0, 100);
    t.sid = c.sid;
    if (A().renderSidebar) A().renderSidebar();
    const startT = Date.now();
    if (resume) await c.send('Làm tiếp phần việc còn dở của task này cho xong (giới hạn đã hồi / app vừa mở lại), rồi ghi bàn giao như đã dặn.', 'Làm tiếp phần còn dở');
    else await c.send(await buildTaskPrompt(p, t), `🤖 Task ${i + 1}/${P.tasks.length}: ${t.title}`);
    log(p, `Chạy task ${i + 1}: ${t.title} (${MN[t.model]} · ${CG.effortLabel(t.effort)})`);
    save(); render();
    let end = await H.waitEnd(c, startT);
    t.cost = typeof c.cost === 'number' ? c.cost : t.cost;
    // hết giới hạn giữa chừng → tạm dừng, sched tự chạy tiếp khi giới hạn hồi
    if (end.kind === 'error' && H.limitOut()) {
      const L = H.limits(), x = L.s && L.s.pct >= 100 ? L.s : L.w;
      t.st = 'pause'; r.state = 'paused'; r.resumeAt = x && x.reset ? x.reset + 60e3 : Date.now() + 30 * 60e3;
      r.note = `Hết giới hạn ở task ${i + 1}. Tự chạy tiếp lúc ${H.fmtTime(r.resumeAt)}.`;
      log(p, r.note); notify('Claude GUI · tạm dừng dự án', `${p.name}: ${r.note}`);
      save(); render();
      return 'stop';
    }
    if (end.kind === 'stopped' && !P.designReq) { t.st = 'part'; return hold(p, { kind: 'stopped', task: t.id }, `Task ${i + 1} đã bị dừng tay.`); }
    if (end.kind === 'error') { t.st = 'err'; return hold(p, { kind: 'err', task: t.id }, `Task ${i + 1} gặp lỗi.`); }
    // xin đổi lịch?
    const rp = await readText(join(P.run, 'replan', t.id + '.json'));
    let rj = null;
    if (rp && rp.mtime >= t.t0 - 2000) { try { rj = JSON.parse(rp.text); } catch { rj = { reason: rp.text }; } }
    // bàn giao: chưa ghi thì nhắc một lần
    let ho = await readText(join(P.run, 'handoff', t.id + '.md'));
    if ((!ho || ho.mtime < t.t0 - 2000) && !rj) {
      const s2 = Date.now();
      await c.send(`Bạn chưa ghi bàn giao. Ghi ngay vào ${join(P.run, 'handoff', t.id + '.md')} theo mẫu của skill lam-task (có dòng "Đạt tiêu chí: có | một phần | không"), không làm thêm việc gì khác.`, 'Nhắc ghi bàn giao');
      end = await H.waitEnd(c, s2);
      ho = await readText(join(P.run, 'handoff', t.id + '.md'));
    }
    t.cost = typeof c.cost === 'number' ? c.cost : t.cost;
    const acc = ho ? accOf(ho.text) : '';
    t.acc2 = acc; t.t1 = Date.now();
    if (P.designReq) { t.st = acc === 'có' ? 'done' : 'part'; save(); return 'next'; }
    if (rj) {
      t.st = 'ask';
      log(p, `Task ${i + 1} xin đổi lịch: ${String(rj.reason || '').slice(0, 140)}`);
      const hd = { kind: 'replan', task: t.id, reason: String(rj.reason || ''), proposal: String(rj.proposal || ''), severity: String(rj.severity || 'block'), done: String(rj.done || '') };
      if (P.policy !== 'ask') { P.hold = { ...hd, at: Date.now() }; await askPlanner(p, replanText(p, hd)); return 'stop'; }
      return hold(p, hd, `Task ${i + 1} xin đổi lịch.`);
    }
    if (acc === 'không' || acc === 'một phần') { t.st = 'ask'; return hold(p, { kind: 'acc', task: t.id, acc, text: ho.text.slice(0, 3000) }, `Task ${i + 1}: bàn giao ghi “chưa đạt tiêu chí” (${acc}).`); }
    t.st = 'done';
    if (api.statsAdd) api.statsAdd({ kind: 'ev', ev: 'task' }).catch(() => {});
    log(p, `Xong task ${i + 1}${ho ? '' : ' (không có bàn giao)'}`);
    save(); render();
    if (t.cp) return hold(p, { kind: 'cp', task: t.id }, `Điểm dừng chờ duyệt sau task ${i + 1}.`);
    return 'next';
  }
  function stop(p) {
    const P = p.proj, r = p.run;
    const t = P.tasks.find((x) => x.st === 'run');
    const c = t && t.sid && A().convs().find((x) => x.sid === t.sid);
    if (c && c.busy) c.interrupt();
    if (t) t.st = 'part';
    r.state = 'idle'; r.resumeAt = 0; r.note = 'Đã dừng.';
    running.delete(p.id);
    log(p, 'Người dùng dừng dự án');
    save(); render();
  }
  function status(p) {
    const P = p.proj, r = p.run;
    const done = P.tasks.filter(isDone).length;
    if (!P.approved) return `Bản nháp · ${P.tasks.length} task — chờ duyệt`;
    if (r.state === 'running') { const t = P.tasks.find((x) => x.st === 'run'); return t ? `Đang chạy task ${P.tasks.indexOf(t) + 1}/${P.tasks.length}` : (P.hold && P.hold.kind === 'check' ? 'Đang kiểm tra design' : 'Đang chạy'); }
    if (r.state === 'paused') return P.hold ? (P.hold.kind === 'planning' ? 'Chờ phiên điều phối soạn bản sửa' : 'Tạm dừng — cần bạn xem') : (r.resumeAt ? `Tạm dừng · chạy tiếp ${SC()._h.fmtTime(r.resumeAt)}` : 'Tạm dừng');
    if (r.state === 'done') return `Xong ${done}/${P.tasks.length} task`;
    return `${done}/${P.tasks.length} task xong`;
  }

  // =====================================================================
  // Phiên điều phối: sửa lịch / design đổi / góp ý
  // =====================================================================
  function stateList(P) {
    return P.tasks.map((t, i) => `- ${t.id} (${t.st === 'wait' ? 'chưa chạy' : t.st === 'run' ? 'đang chạy' : t.st === 'done' ? 'done' : t.st === 'skip' ? 'bỏ qua' : t.st === 'part' ? 'dừng giữa chừng' : t.st === 'ask' ? 'chờ xem lại' : t.st}) ${i + 1}. ${t.title} [${t.model}/${t.effort}]`).join('\n');
  }
  function replanText(p, hd) {
    const t = p.proj.tasks.find((x) => x.id === hd.task);
    return `Task ${hd.task}${t ? ` (“${t.title}”)` : ''} xin đổi lịch (mức: ${hd.severity}).\nLý do: ${hd.reason}\n${hd.proposal ? 'Đề xuất của task: ' + hd.proposal + '\n' : ''}${hd.done ? 'Phần task đã làm: ' + hd.done + '\n' : ''}Bàn giao của task: ${join(p.proj.run, 'handoff', hd.task + '.md')}`;
  }
  async function plannerConv(p) {
    const P = p.proj;
    let c = P.plannerSid ? await A().convFor(P.plannerSid).catch(() => null) : null;
    if (!c) {
      c = await A().createConv({ cwd: P.dir, model: 'opus', effort: 'high', mode: P.mode, addDirs: P.addDirs, allowedTools: P.mcp });
      c.title = `📐 Điều phối · ${p.name}`;
      P.plannerSid = c.sid;
      if (A().renderSidebar) A().renderSidebar();
    }
    return c;
  }
  async function askPlanner(p, why, display) {
    const P = p.proj;
    await writePlanJson(p);
    const c = await plannerConv(p);
    P.hold = { kind: 'planning', at: Date.now(), why: (display || why).slice(0, 400) };
    p.run.state = 'paused'; p.run.resumeAt = 0; p.run.note = 'Đang chờ phiên điều phối soạn bản sửa lịch.';
    log(p, 'Gửi phiên điều phối: ' + (display || why).slice(0, 120));
    save(); render();
    await SC()._h.waitIdle(c);
    await c.send(`🗓 Sửa kế hoạch · ${p.name}
[Claude GUI · sửa kế hoạch dự án "${p.name}"] Dùng skill claude-gui:lap-ke-hoach (phần "Khi được yêu cầu soạn lại kế hoạch"). Thư mục chạy (RUN): ${P.run}
Kế hoạch hiện tại: ${join(P.run, 'plan.json')} (GUI vừa ghi lại, có trạng thái từng task). Bàn giao: ${join(P.run, 'handoff')}

Trạng thái task:
${stateList(P)}

${why}

Ghi lại toàn bộ ${join(P.run, 'plan.json')} (giữ id task cũ; task "done" giữ nguyên; thêm trường "change"). Cập nhật context.md nếu quyết định / design thay đổi. Không tự làm task.`, display || '🗓 Nhờ soạn lại kế hoạch');
    notify('Claude GUI · đã gửi phiên điều phối', `${p.name}: chờ bản sửa lịch`);
  }
  async function askPlannerDesign(p) {
    const P = p.proj, d = P.designReq;
    P.designReq = null;
    const src = await readText(join(P.run, 'design', 'sources.json'));
    await askPlanner(p, `Yêu cầu / design đã thay đổi. Người dùng báo: ${d.text || '(không ghi chú)'}${d.items && d.items.length ? '\nGUI phát hiện các thay đổi:\n' + d.items.map((x) => '- ' + x).join('\n') : ''}
${src ? `Nguồn design đã ghi: ${join(P.run, 'design', 'sources.json')} — lấy bản mới qua MCP, so với bản đã ghi (cả các tệp XML trong design/figma/), chỉ đọc lại phần đã đổi.` : 'Chưa có design/sources.json — đọc design mới từ nguồn người dùng nêu.'}
Task đã xong mà bị ảnh hưởng → thêm task sửa lại (không mở lại phiên cũ). Task chưa chạy → viết lại prompt hoàn chỉnh theo design mới. Cập nhật context.md lên phiên bản design mới (lịch sử thay đổi) và sources.json.`, `🎨 Design / yêu cầu thay đổi: ${(d.text || '').slice(0, 120)}`);
  }
  function diffTasks(oldT, newT) {
    const om = new Map(oldT.map((t) => [t.id, t])), nm = new Map(newT.map((t) => [t.id, t]));
    const KEYS = ['title', 'prompt', 'model', 'effort', 'acc', 'deps', 'cp'];
    return {
      add: newT.filter((t) => !om.has(t.id)),
      del: oldT.filter((t) => !nm.has(t.id) && !isDone(t)),
      chg: newT.filter((t) => om.has(t.id) && !isDone(om.get(t.id)) && KEYS.some((k) => JSON.stringify(om.get(t.id)[k]) !== JSON.stringify(t[k])))
        .map((t) => ({ t, keys: KEYS.filter((k) => JSON.stringify(om.get(t.id)[k]) !== JSON.stringify(t[k])) })),
    };
  }
  function applyPending(p) {
    const P = p.proj, pd = P.pending;
    if (!pd) return;
    const om = new Map(P.tasks.map((t) => [t.id, t])), nm = new Set(pd.tasks.map((t) => t.id));
    const res = pd.tasks.map((n) => {
      const o = om.get(n.id);
      if (o && isDone(o)) return o;
      if (o && o.st === 'run') return { ...n, st: 'run', sid: o.sid, t0: o.t0 };
      return { ...n, st: 'wait', sid: '' };
    });
    P.tasks = [...P.tasks.filter((o) => isDone(o) && !nm.has(o.id)), ...res];
    P.pending = null; P.hold = null;
    log(p, 'Áp dụng bản sửa lịch' + (pd.change ? ': ' + pd.change : ''));
    save(); render();
  }

  // =====================================================================
  // Kiểm tra design có đổi không (trước mỗi giai đoạn)
  // =====================================================================
  const nodeFile = (id) => String(id).replace(/[:;]/g, '-') + '.xml';
  const normXml = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  async function designCheck(p, phase) {
    const P = p.proj;
    const src = await readText(join(P.run, 'design', 'sources.json'));
    if (!src) return null;
    let sj; try { sj = JSON.parse(src.text); } catch { return null; }
    const frames = (sj.figma && Array.isArray(sj.figma.frames)) ? sj.figma.frames : [];
    if (!frames.length && !(sj.gdd && sj.gdd.sha)) return null;
    P.hold = { kind: 'check', phase }; save(); render();
    log(p, `Kiểm tra design trước ${phaseName(P, phase)}`);
    const tools = [...new Set([...(P.mcp || []), 'mcp__figma__get_metadata', 'mcp__gdd__get_changes'])];
    const c = await A().createConv({ cwd: P.dir, model: 'haiku', effort: 'low', mode: 'acceptEdits', addDirs: P.addDirs, allowedTools: tools });
    c.title = `🔎 Kiểm tra design · ${p.name}`;
    if (A().renderSidebar) A().renderSidebar();
    const t0 = Date.now();
    await c.send(`🔎 Kiểm tra design · ${p.name}
[Claude GUI · kiểm tra design] Không sửa code, không làm việc gì khác.
Đọc ${join(P.run, 'design', 'sources.json')}.
${sj.gdd && sj.gdd.sha ? `- Tài liệu thiết kế: gọi công cụ get_changes của MCP tài liệu (project "${sj.gdd.project || ''}", since_sha "${sj.gdd.sha}"). Ghi lại sha mới và tên các trang đã đổi (chỉ các trang liên quan: ${(sj.gdd.pages || []).join(', ') || 'tất cả'}).\n` : ''}${frames.length ? `- Figma (fileKey ${sj.figma.fileKey}): với mỗi frame gọi get_metadata(fileKey, nodeId) và ghi NGUYÊN VĂN kết quả XML vào ${join(P.run, 'design', 'check')}\\<nodeId thay ':' bằng '-'>.xml. Các frame: ${frames.map((f) => `${f.name || ''} ${f.nodeId}`).join('; ')}.\n` : ''}Cuối cùng ghi ${join(P.run, 'design', 'check.json')}: {"gdd": {"sha": "<sha mới>", "changed": true|false, "pages": ["trang đã đổi"]}, "figma": {"checked": ["nodeId"], "errors": ["…"]}} rồi kết thúc, trả lời một dòng.`, '🔎 Kiểm tra design có đổi không');
    await SC()._h.waitEnd(c, t0);
    P.hold = null;
    const items = [];
    const ck = await readText(join(P.run, 'design', 'check.json'));
    let cj = null; if (ck && ck.mtime >= t0 - 2000) { try { cj = JSON.parse(ck.text); } catch {} }
    if (cj && cj.gdd && (cj.gdd.changed || (cj.gdd.sha && sj.gdd && cj.gdd.sha !== sj.gdd.sha && (cj.gdd.pages || []).length))) {
      for (const pg of cj.gdd.pages || []) items.push(`Tài liệu “${pg}” đã sửa (${(sj.gdd.sha || '').slice(0, 7)} → ${String(cj.gdd.sha || '').slice(0, 7)})`);
      if (!(cj.gdd.pages || []).length) items.push(`Tài liệu thiết kế có thay đổi (${(sj.gdd.sha || '').slice(0, 7)} → ${String(cj.gdd.sha || '').slice(0, 7)})`);
    }
    for (const f of frames) {
      const a = await readText(join(P.run, 'design', 'figma', nodeFile(f.nodeId)));
      const b = await readText(join(P.run, 'design', 'check', nodeFile(f.nodeId)));
      if (a && b && b.mtime >= t0 - 2000 && normXml(a.text) !== normXml(b.text)) items.push(`Figma “${f.name || f.nodeId}”: cấu trúc frame đã đổi`);
    }
    P.lastCheck = { at: Date.now(), phase, items, gddSha: cj && cj.gdd && cj.gdd.sha };
    log(p, items.length ? `Design đã đổi: ${items.length} chỗ` : 'Design không đổi');
    save(); render();
    return { changed: items.length > 0, items };
  }
  // "Ghi nhận bản mới, không sửa lịch": lấy kết quả kiểm tra làm mốc mới
  async function acceptDesign(p) {
    const P = p.proj;
    const src = await readText(join(P.run, 'design', 'sources.json'));
    if (!src) return;
    let sj; try { sj = JSON.parse(src.text); } catch { return; }
    for (const f of (sj.figma && sj.figma.frames) || []) await api.apFs('copy', join(P.run, 'design', 'check', nodeFile(f.nodeId)), join(P.run, 'design', 'figma', nodeFile(f.nodeId))).catch(() => {});
    if (sj.gdd && P.lastCheck && P.lastCheck.gddSha) sj.gdd.sha = P.lastCheck.gddSha;
    await writeText(join(P.run, 'design', 'sources.json'), JSON.stringify(sj, null, 2));
    log(p, 'Ghi nhận bản design mới làm mốc (không sửa lịch)');
  }

  // =====================================================================
  // Giao diện (vẽ trong trang Lịch & hàng đợi)
  // =====================================================================
  const UI = { open: new Set(), focus: null, srcCache: new Map() };
  document.addEventListener('focusin', (e) => { const k = e.target && e.target.dataset && e.target.dataset.apk; if (k) UI.focus = { k, t: Date.now() }; });
  document.addEventListener('input', (e) => { const k = e.target && e.target.dataset && e.target.dataset.apk; if (k) UI.focus = { k, t: Date.now(), s: e.target.selectionStart, e: e.target.selectionEnd }; });
  document.addEventListener('focusout', (e) => { const k = e.target && e.target.dataset && e.target.dataset.apk; if (k && e.relatedTarget) UI.focus = null; });
  const cost = (ts) => ts.reduce((s, t) => s + (W[t.model] || 20) * (EW[t.effort] || 1) * (t.size || 2), 0);
  const fmtU = (v) => (v >= 100 ? Math.round(v) : v.toFixed(1));
  const taskNo = (P, id) => P.tasks.findIndex((x) => x.id === id) + 1;

  function renderFlow(flow, p) {
    const P = p.proj, r = p.run;
    flow.classList.add('ap-flow');
    const head = h('div', { class: 'sc-flow-h ap-head' }, h('h3', { class: 'ellipsis', text: '🤖 ' + p.name }), h('span', { class: 'ap-pill ' + (r.state === 'running' ? 'run' : P.hold ? 'warn' : ''), text: status(p) }));
    const B = (txt, fn, cls, ic) => h('button', { class: 'btn sm ' + (cls || ''), onclick: fn }, ic ? icon(ic, 13) : null, txt);
    if (!P.approved) head.append(B('Duyệt & chạy', () => approve(p), 'primary', 'check'));
    else if (r.state === 'running') head.append(B('Dừng', () => stop(p), '', 'square'));
    else if (!P.pending && !(P.hold && (P.hold.kind === 'planning' || P.hold.kind === 'check')) && (r.state !== 'done' || P.tasks.some((t) => !isDone(t)))) head.append(B(r.state === 'paused' || r.state === 'idle' ? 'Chạy tiếp' : 'Chạy', () => { P.hold = null; run(p); }, P.hold ? '' : 'primary', 'play'));
    head.append(B('Cập nhật yêu cầu / design', () => designDialog(p), '', 'edit'));
    head.append(h('button', { class: 'icon-btn sm', title: 'Thêm', html: svg('more', 15), onclick: (e) => CG.menu(e.currentTarget, [
      { label: 'Góp ý cho Claude sửa kế hoạch…', icon: 'message', onClick: () => feedback(p) },
      { label: 'Mở phiên điều phối', icon: 'bot', disabled: !P.plannerSid, onClick: () => openSess(P.plannerSid) },
      { label: 'Mở plan.md', icon: 'file', onClick: () => CG.viewer && CG.viewer.openFile(join(P.run, 'plan.md')) },
      { label: 'Mở context.md', icon: 'file', onClick: () => CG.viewer && CG.viewer.openFile(join(P.run, 'context.md')) },
      CG.lan ? { label: 'Giao cho máy thợ (LAN)…', desc: 'Gửi thẳng qua mạng LAN cho Claude GUI máy khác chạy, theo dõi tiến độ + bàn giao tại đây', icon: 'monitor', disabled: r.state === 'running', onClick: () => CG.lan.sendDialog(p) } : null,
      CG.pack ? { label: 'Xuất sang máy khác…', desc: 'Đóng gói dự án (kế hoạch + thư mục RUN) để chạy ở Claude GUI máy khác', icon: 'download', disabled: r.state === 'running', onClick: () => CG.pack.exportPlan(p) } : null,
      '-',
      { label: 'Xoá dự án khỏi lịch', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('Xoá dự án?', `“${p.name}” bị xoá khỏi Lịch & hàng đợi. Tệp trong .claude-gui và các phiên đã chạy vẫn còn.`, 'Xoá')) { if (r.state === 'running') stop(p); SC()._D.plans = SC()._D.plans.filter((x) => x !== p); SC()._U.sel = null; save(); render(); } } },
    ]) }));
    flow.append(head);
    if (CG.pack) { const b = CG.pack.banner(p); if (b) flow.append(b); }
    flow.append(track(p));
    if (P.hold || P.pending) flow.append(holdBox(p));
    else if (r.note) flow.append(h('div', { class: 'sc-note', text: r.note }));
    flow.append(h('div', { class: 'ap-grid' }, side(p), tasksView(p)));
    // giữ chỗ đang gõ khi trang vẽ lại
    if (UI.focus && Date.now() - UI.focus.t < 120000) {
      const f = UI.focus, el = flow.querySelector(`[data-apk="${f.k}"]`);
      if (el) setTimeout(() => { el.focus(); if (f.s != null) try { el.setSelectionRange(f.s, f.e); } catch {} }, 0);
    }
  }
  // thanh tiến độ có robot nhỏ đi dọc theo; dừng chờ duyệt / xin đổi lịch → giơ biển "cần bạn xem"
  const TB = { host: null, bot: null };
  function track(p) {
    const P = p.proj, r = p.run;
    const live = P.tasks.filter((t) => t.st !== 'skip');
    const done = live.filter((t) => isDone(t)).length, n = live.length || 1;
    const runT = live.find((t) => t.st === 'run');
    const frac = Math.min(1, (done + (runT && r.state === 'running' ? .5 : 0)) / n);
    const hold = !!(P.hold && P.hold.kind !== 'planning' && P.hold.kind !== 'check');
    const st = hold || P.pending ? 'sign' : r.state === 'done' ? 'celebrate' : r.state === 'running' ? 'writing' : r.state === 'paused' ? 'sleep' : 'idle';
    const bar = h('div', { class: 'ap-trk-bar' }, h('i', { style: { width: Math.round(frac * 100) + '%' } }));
    const wrap = h('div', { class: 'ap-trk' + (st === 'writing' ? ' walk' : '') + (hold ? ' hold' : '') });
    if (CG.mascot && CG.mascot.createBot && (S().settings.decor || {}).mascot !== 'off') {
      if (!TB.host) { TB.host = h('div', { class: 'ap-trk-bot', title: '' }); TB.bot = CG.mascot.createBot(TB.host, 64); }
      if (!TB.bot.el.isConnected) CG.mascot.keep && CG.mascot.keep(TB.bot);
      CG.mascot.dress(TB.bot, st === 'sign' ? 'sign' : st === 'writing' ? 'writing' : null);
      TB.bot.state(st);
      TB.host.style.left = `calc(${Math.round(frac * 100)}% - 32px)`;
      // nuôi robot: kéo xe đẩy chở các task đã xong
      const lifeOn = CG.mascot.lifeOn && CG.mascot.lifeOn();
      let cart = TB.host.querySelector('.ap-cart');
      if (lifeOn && !cart) { cart = h('span', { class: 'ap-cart' }, '🛒', h('b')); TB.host.append(cart); }
      if (cart) { cart.hidden = !lifeOn; cart.lastChild.textContent = done || ''; }
      TB.host.title = hold ? 'Dự án đang dừng — cần bạn xem' : r.state === 'running' ? `Đang làm task ${runT ? live.indexOf(runT) + 1 : done + 1}/${live.length}` : '';
      TB.host.onclick = hold ? () => { const hb = document.querySelector('.ap-flow .ap-alert'); if (hb) hb.scrollIntoView({ behavior: 'smooth', block: 'center' }); } : null;
      wrap.append(TB.host);
    }
    wrap.append(bar, h('div', { class: 'ap-trk-lbl', text: `${done}/${live.length} task xong${hold ? ' · cần bạn xem' : ''}` }));
    return wrap;
  }
  async function approve(p) {
    const P = p.proj;
    if (!P.tasks.length) return toast('Chưa có task nào');
    P.approved = true; p.on = true; p.armedAt = Date.now();
    log(p, 'Người dùng duyệt kế hoạch');
    await writePlanJson(p).catch(() => {});
    if (p.trig.type === 'now') run(p);
    else { p.run.state = 'idle'; p.run.note = 'Đã duyệt — chờ tới lúc chạy.'; save(); render(); toast('Đã duyệt. Dự án sẽ chạy theo lịch đã chọn.'); }
  }
  async function openSess(sid) { const c = await A().convFor(sid); SC().close(); if (c) A().activate(c); }

  function side(p) {
    const P = p.proj;
    const box = (title, ...kids) => h('div', { class: 'ap-box' }, h('h4', { text: title }), ...kids);
    const live = P.tasks.filter((t) => t.st !== 'skip');
    const c = cost(live), o = live.reduce((s, t) => s + W.opus * EW.high * (t.size || 2), 0);
    const by = {}; for (const t of live) by[t.model] = (by[t.model] || 0) + (W[t.model] || 20) * (EW[t.effort] || 1) * (t.size || 2);
    const real = P.tasks.reduce((s, t) => s + (t.cost || 0), 0);
    const el = h('div', { class: 'ap-side' });
    el.append(box('Mục tiêu', h('div', { class: 'ap-goal', text: P.goal || '(không ghi)' }),
      h('div', { class: 'ap-path', title: P.dir }, icon('folder', 12), h('span', { class: 'ellipsis', text: P.dir })),
      h('div', { class: 'ap-path', title: P.run }, icon('file', 12), h('a', { class: 'gp-link', text: 'context.md', onclick: () => CG.viewer && CG.viewer.openFile(join(P.run, 'context.md')) }), ' · ', h('a', { class: 'gp-link', text: 'plan.md', onclick: () => CG.viewer && CG.viewer.openFile(join(P.run, 'plan.md')) }))));
    el.append(box('Chi phí ước tính (tương đối)',
      h('div', { class: 'ap-row' }, h('span', { text: 'Theo đề xuất' }), h('b', { text: fmtU(c) + ' đơn vị' })),
      h('div', { class: 'ap-cbar' }, ['haiku', 'sonnet', 'opus', 'fable'].map((m) => (by[m] ? h('i', { class: 'm-' + m, style: `width:${Math.max(0.6, by[m] / o * 100).toFixed(1)}%`, title: `${MN[m]}: ${fmtU(by[m])}` }) : null))),
      h('div', { class: 'ap-row' }, h('span', { text: 'Nếu chạy hết bằng Opus · cao' }), h('b', { text: fmtU(o) + ' đơn vị' })),
      h('div', { class: 'ap-row ok' }, h('span', { text: 'Tiết kiệm khoảng' }), h('b', { text: Math.max(0, Math.round((1 - c / o) * 100)) + '%' })),
      h('div', { class: 'ap-legend' }, MODELS.map(([m, n]) => { const k = live.filter((t) => t.model === m).length; return k ? h('span', { class: 'm-' + m, text: `${n} ×${k}` }) : null; })),
      real ? h('div', { class: 'ap-row' }, h('span', { text: 'Đã dùng (theo CLI)' }), h('b', { text: '$' + real.toFixed(2) })) : null,
      h('div', { class: 'note', text: 'Giá tương đối của model (Haiku 1 · Sonnet 20 · Opus 40 · Fable 100, theo giá output) × hệ số effort × độ lớn task. Chỉ để so sánh.' })));
    // khi nào chạy
    const trigSel = h('select', { class: 'gp-sel' }, [['now', 'Ngay khi duyệt / bấm chạy'], ['reset5', 'Khi giới hạn 5 giờ hồi'], ['at', 'Vào lúc…']].map(([v, t]) => h('option', { value: v, text: t, selected: p.trig.type === v })));
    trigSel.onchange = () => { if (trigSel.value === 'at') { SC()._U.node = 'trig'; p.trig.type = 'at'; render(); return; } p.trig.type = trigSel.value; p.armedAt = Date.now(); p.run.firedAt = 0; save(); render(); };
    el.append(box('Khi nào chạy', trigSel, p.trig.type !== 'now' ? h('div', { class: 'note', text: SC()._h.trigText(p) }) : null,
      h('div', { class: 'note', text: 'Hết giới hạn giữa chừng → tự tạm dừng, chạy tiếp khi giới hạn hồi.' })));
    el.append(box('Khi task muốn đổi lịch', h('div', { class: 'ap-pol' }, Object.entries(POLICY).map(([k, [a, b]]) => h('label', { class: P.policy === k ? 'on' : '', onclick: () => { P.policy = k; api.setSettings({ apPolicy: k }); save(); render(); } }, a, h('small', { text: b }))))));
    // nguồn design
    const srcEl = h('div', { class: 'ap-src' }, h('span', { class: 'note', text: 'Đang đọc…' }));
    readText(join(P.run, 'design', 'sources.json')).then((r) => {
      srcEl.innerHTML = '';
      let sj = null; if (r) try { sj = JSON.parse(r.text); } catch {}
      if (!sj) { srcEl.append(h('div', { class: 'note', text: 'Chưa ghi nguồn design (design/sources.json). Kiểm tra tự động chỉ chạy khi có tệp này.' })); return; }
      if (sj.figma && sj.figma.frames) srcEl.append(h('div', {}, '🎨 ', h('b', { text: 'Figma' }), ` · ${sj.figma.frames.length} frame: ${sj.figma.frames.map((f) => f.name || f.nodeId).join(', ')}`));
      if (sj.gdd) srcEl.append(h('div', {}, '📚 ', h('b', { text: 'Tài liệu thiết kế' }), ` · ${(sj.gdd.pages || []).join(', ')} — bản ${String(sj.gdd.sha || '?').slice(0, 7)}`));
      if (sj.other) srcEl.append(h('div', { class: 'note', text: sj.other }));
    });
    const dc = h('input', { type: 'checkbox', checked: P.designCheck !== false });
    dc.onchange = () => { P.designCheck = dc.checked; api.setSettings({ apDesignCheck: dc.checked }); save(); };
    el.append(box('Nguồn design', srcEl, h('label', { class: 'ap-ck' }, dc, ' Tự kiểm tra design trước mỗi giai đoạn ', h('span', { class: 'ap-m m-haiku', text: 'Haiku · thấp' })),
      P.lastCheck ? h('div', { class: 'note', text: `Lần kiểm tra gần nhất: ${SC()._h.fmtTime(P.lastCheck.at)} — ${P.lastCheck.items.length ? P.lastCheck.items.length + ' thay đổi' : 'không đổi'}` } ) : null));
    // MCP + quyền
    const mcpList = h('div', { class: 'ap-mcp' });
    const drawMcp = () => {
      mcpList.innerHTML = '';
      if (!P.mcp.length) mcpList.append(h('div', { class: 'note', text: 'Không có (task không cần MCP).' }));
      P.mcp.forEach((m, k) => mcpList.append(h('div', { class: 'ap-mrow' }, h('code', { text: m }), h('button', { class: 'icon-btn sm', title: 'Bỏ', html: svg('x', 12), onclick: () => { P.mcp.splice(k, 1); save(); drawMcp(); } }))));
    };
    drawMcp();
    const add = h('button', { class: 'btn sm', onclick: async () => { const v = await promptDialog('Cho phép công cụ MCP', '', 'vd mcp__figma__get_screenshot hoặc mcp__gdd (cả server)'); if (v && /^mcp__[\w-]+(__[\w-]+)?$/.test(v.trim())) { P.mcp.push(v.trim()); save(); drawMcp(); } else if (v) toast('Tên phải dạng mcp__server hoặc mcp__server__tool', true); } }, icon('plus', 12), 'Thêm');
    const modeSel = h('select', { class: 'gp-sel' }, MODES.filter((m) => m.v !== 'plan' && (m.v !== 'bypassPermissions' || S().settings.allowBypass)).map((m) => h('option', { value: m.v, text: m.label, selected: P.mode === m.v })));
    modeSel.onchange = () => { P.mode = modeSel.value; save(); };
    el.append(box('MCP được cho phép khi chạy', mcpList, add, h('div', { class: 'note', text: 'Chỉ nên cho phép công cụ chỉ đọc (lấy design). Công cụ khác vẫn hỏi bạn khi cần.' })));
    el.append(box('Quyền khi chạy', modeSel, h('div', { class: 'note', text: 'Lệnh ngoài danh sách cho phép vẫn hỏi → robot gọi bạn.' })));
    if ((P.log || []).length) el.append(box('Nhật ký', h('div', { class: 'ap-log' }, P.log.slice(-10).reverse().map((x) => h('div', {}, h('span', { text: SC()._h.fmtTime(x.t).slice(0, 5) }), ' ', x.text)))));
    return el;
  }

  function tasksView(p) {
    const P = p.proj, el = h('div', { class: 'ap-tasks' });
    const phases = [...new Set(P.tasks.map((t) => +t.phase || 1))].sort((a, b) => a - b);
    for (const ph of phases) {
      const ts = P.tasks.filter((t) => (+t.phase || 1) === ph);
      el.append(h('div', { class: 'ap-ph' }, h('b', { text: phaseName(P, ph) }), h('small', { text: `${ts.length} task · ${ts.filter(isDone).length} xong` })));
      for (const t of ts) el.append(taskEl(p, t));
    }
    const addB = h('button', { class: 'btn sm', onclick: () => { const t = { id: 't' + Date.now().toString(36).slice(-4), phase: phases[phases.length - 1] || 1, title: 'Task mới', prompt: '', acc: '', model: 'sonnet', effort: 'medium', size: 2, why: 'Thêm tay', deps: [], cp: false, cont: false, st: 'wait', sid: '' }; P.tasks.push(t); UI.open.add(t.id); save(); render(); } }, icon('plus', 13), 'Thêm task');
    el.append(h('div', { class: 'ap-end' }, addB));
    return el;
  }
  function taskEl(p, t) {
    const P = p.proj, i = P.tasks.indexOf(t), open = UI.open.has(t.id), edit = t.st !== 'run' && !isDone(t);
    const st = TST[t.st] || TST.wait;
    const sel = (opts, val, fn, cls) => { const s = h('select', { class: 'ap-sel ' + (cls || ''), disabled: !edit }, opts.map(([v, l]) => h('option', { value: v, text: l, selected: v === val }))); s.onclick = (e) => e.stopPropagation(); s.onchange = () => { fn(s.value); save(); render(); }; return s; };
    const head = h('div', { class: 'ap-th' },
      h('span', { class: 'ap-dot ' + t.st }, t.st === 'run' ? h('span', { class: 'spinner' }) : t.st === 'wait' ? String(i + 1) : st[0]),
      h('div', { class: 'ap-tt' }, h('b', { text: t.title }), h('small', {}, t.why ? h('i', { text: t.why }) : null, t.st !== 'wait' ? h('span', { class: 'ap-stt', text: ' · ' + st[1] + (t.acc2 && t.st === 'done' && t.acc2 !== 'có' ? ` (${t.acc2})` : '') }) : null)),
      h('span', { class: 'ap-dep', text: t.deps.length ? 'sau ' + t.deps.map((d) => '#' + taskNo(P, d)).join(', ') : 'bắt đầu ngay' }),
      sel(MODELS, t.model, (v) => { t.model = v; }, 'm-' + t.model),
      sel(EFFORTS.map((e) => [e.v, 'effort ' + e.label.toLowerCase()]), t.effort, (v) => { t.effort = v; }),
      t.cp ? h('span', { class: 'ap-cp', title: 'Dừng chờ duyệt sau task này', text: '⏸' }) : null);
    head.onclick = () => { open ? UI.open.delete(t.id) : UI.open.add(t.id); render(); };
    const el = h('div', { class: 'ap-task' + (open ? ' open' : '') + ' s-' + t.st }, head);
    if (open) {
      const ta = h('textarea', { class: 'ap-prompt', 'data-apk': 'pr-' + t.id, disabled: !edit, placeholder: 'Prompt của task…' }); ta.value = t.prompt;
      ta.oninput = () => { t.prompt = ta.value; save(); };
      const tt = h('input', { type: 'text', class: 'ap-in', 'data-apk': 'ti-' + t.id, disabled: !edit, value: t.title }); tt.oninput = () => { t.title = tt.value; save(); };
      const acc = h('input', { type: 'text', class: 'ap-in', 'data-apk': 'ac-' + t.id, disabled: !edit, value: t.acc, placeholder: 'Tiêu chí xong' }); acc.oninput = () => { t.acc = acc.value; save(); };
      const ck = (k, label) => { const x = h('input', { type: 'checkbox', checked: !!t[k], disabled: !edit }); x.onchange = () => { t[k] = x.checked; save(); render(); }; return h('label', { class: 'ap-ck' }, x, ' ' + label); };
      const depBtn = h('button', { class: 'btn xs', disabled: !edit, onclick: (e) => CG.menu(e.currentTarget, P.tasks.filter((x) => x !== t).map((x) => ({ label: `#${taskNo(P, x.id)} ${x.title}`, checked: t.deps.includes(x.id), onClick: () => { t.deps = t.deps.includes(x.id) ? t.deps.filter((d) => d !== x.id) : [...t.deps, x.id]; save(); render(); } })), { checks: true }) }, 'Phụ thuộc…');
      const acts = [];
      if (t.sid) acts.push(h('button', { class: 'btn xs', text: 'Mở phiên', onclick: () => openSess(t.sid) }));
      acts.push(h('button', { class: 'btn xs', text: 'Bàn giao', onclick: () => CG.viewer && CG.viewer.openFile(join(P.run, 'handoff', t.id + '.md')) }));
      if (t.st !== 'run' && t.st !== 'wait') acts.push(h('button', { class: 'btn xs', text: 'Chạy lại task', title: 'Đặt lại thành "chờ" — chạy bằng phiên mới khi dự án chạy tiếp', onclick: () => { t.st = 'wait'; t.sid = ''; save(); render(); } }));
      if (t.st === 'wait' || t.st === 'ask' || t.st === 'err' || t.st === 'part') acts.push(h('button', { class: 'btn xs', text: 'Bỏ qua task', onclick: () => { t.st = 'skip'; save(); render(); } }));
      if (t.st === 'wait') acts.push(h('button', { class: 'btn xs danger-text', text: 'Xoá task', onclick: () => { P.tasks.splice(P.tasks.indexOf(t), 1); for (const x of P.tasks) x.deps = x.deps.filter((d) => d !== t.id); save(); render(); } }));
      el.append(h('div', { class: 'ap-td' },
        h('div', { class: 'ap-kv' }, h('span', { text: 'Tên task' }), tt, h('span', { text: 'Tiêu chí xong' }), acc,
          h('span', { text: 'Độ lớn' }), sel([1, 2, 3, 4, 5].map((n) => [String(n), String(n)]), String(t.size || 2), (v) => { t.size = +v; }),
          h('span', { text: 'Phiên' }), h('span', { class: 'note', text: t.cont ? 'Nối tiếp phiên của task trước' : `Phiên mới · đọc context.md${t.deps.length ? ' + bàn giao của ' + t.deps.map((d) => '#' + taskNo(P, d)).join(', ') : ''}` })),
        ta,
        h('div', { class: 'ap-acts' }, ck('cp', 'Dừng chờ duyệt sau task này'), ck('cont', 'Nối tiếp phiên của task trước'), depBtn, h('span', { class: 'spacer' }), ...acts)));
    }
    return el;
  }

  // ----- hộp "cần bạn xem"
  function holdBox(p) {
    const P = p.proj, hd = P.hold || { kind: 'pending' };
    const t = hd.task ? P.tasks.find((x) => x.id === hd.task) : null;
    const tn = t ? `Task ${P.tasks.indexOf(t) + 1} (${MN[t.model]} · ${CG.effortLabel(t.effort).toLowerCase()}) — “${t.title}”` : '';
    const box = h('div', { class: 'ap-alert ' + hd.kind });
    const B = (txt, fn, cls) => h('button', { class: 'btn sm ' + (cls || ''), text: txt, onclick: fn });
    const resume = () => { P.hold = null; run(p); };
    const openT = t && t.sid ? B('Mở phiên task', () => openSess(t.sid)) : null;
    if (P.pending) {
      const d = diffTasks(P.tasks, P.pending.tasks);
      box.classList.add('pending');
      box.append(h('h3', {}, '🗓 Bản sửa lịch từ phiên điều phối'), P.pending.change ? h('blockquote', { text: P.pending.change }) : null,
        h('div', { class: 'ap-df' },
          ...d.add.map((x) => h('div', { class: 'p', text: `+ ${x.title} — ${MN[x.model]} · ${CG.effortLabel(x.effort).toLowerCase()}` })),
          ...d.chg.map(({ t: x, keys }) => h('div', { class: 'c', text: `~ #${taskNo(P, x.id)} ${x.title} — sửa ${keys.map((k) => ({ title: 'tên', prompt: 'prompt', model: 'model', effort: 'effort', acc: 'tiêu chí', deps: 'phụ thuộc', cp: 'điểm dừng' }[k])).join(', ')}` })),
          ...d.del.map((x) => h('div', { class: 'm', text: `− #${taskNo(P, x.id)} ${x.title}` })),
          !d.add.length && !d.chg.length && !d.del.length ? h('div', { class: 'note', text: 'Không có thay đổi task (có thể chỉ cập nhật context.md).' }) : null),
        h('div', { class: 'ap-row2' }, B('Áp dụng & chạy tiếp', () => { applyPending(p); run(p); }, 'primary'), B('Áp dụng, chưa chạy', () => applyPending(p)),
          B('Mở phiên điều phối', () => openSess(P.pending.from || P.plannerSid)), B('Bỏ bản sửa', () => { P.pending = null; P.hold = { kind: 'blocked' }; save(); render(); }, 'danger-text')));
      return box;
    }
    const K = {
      replan: () => [h('h3', {}, '🔁 Task xin đổi lịch'), h('div', { class: 'who', text: tn }), h('blockquote', { text: hd.reason }), hd.proposal ? h('div', { class: 'note', text: 'Đề xuất của task: ' + hd.proposal }) : null,
        h('div', { class: 'ap-row2' }, B('Nhờ phiên điều phối soạn bản sửa', () => askPlanner(p, replanText(p, hd), `🔁 Task ${hd.task} xin đổi lịch`), 'primary'), B('Bỏ qua, chạy lại task đó', () => { t.st = 'wait'; t.sid = ''; resume(); }), B('Bỏ qua task, chạy tiếp', () => { t.st = 'skip'; resume(); }), openT)],
      acc: () => [h('h3', {}, '⚠ Task chưa đạt tiêu chí'), h('div', { class: 'who', text: `${tn} — bàn giao ghi “${hd.acc}”` }), h('pre', { class: 'ap-pre', text: hd.text || '' }),
        h('div', { class: 'ap-row2' }, B('Coi như xong, chạy tiếp', () => { t.st = 'done'; resume(); }, 'primary'), B('Chạy lại bằng phiên mới', () => { t.st = 'wait'; t.sid = ''; resume(); }), B('Nhờ phiên điều phối sửa lịch', () => askPlanner(p, `Task ${hd.task} chưa đạt tiêu chí (${hd.acc}). Xem bàn giao ${join(P.run, 'handoff', hd.task + '.md')} rồi sửa kế hoạch cho phù hợp.`, `⚠ Task ${hd.task} chưa đạt tiêu chí`)), openT)],
      err: () => [h('h3', {}, '✕ Task gặp lỗi'), h('div', { class: 'who', text: tn || hd.text || '' }),
        h('div', { class: 'ap-row2' }, t ? B('Chạy lại bằng phiên mới', () => { t.st = 'wait'; t.sid = ''; resume(); }, 'primary') : B('Chạy tiếp', resume, 'primary'), t ? B('Bỏ qua task, chạy tiếp', () => { t.st = 'skip'; resume(); }) : null, openT)],
      stopped: () => [h('h3', {}, '⏹ Task bị dừng giữa chừng'), h('div', { class: 'who', text: tn }),
        h('div', { class: 'ap-row2' }, t && t.sid ? B('Làm tiếp trong phiên đó', () => { t.st = 'pause'; resume(); }, 'primary') : null, B('Chạy lại bằng phiên mới', () => { t.st = 'wait'; t.sid = ''; resume(); }), B('Bỏ qua task', () => { t.st = 'skip'; resume(); }), openT)],
      cp: () => [h('h3', {}, '⏸ Điểm dừng chờ duyệt'), h('div', { class: 'who', text: `Xong ${tn}. Xem kết quả rồi chạy tiếp.` }),
        h('div', { class: 'ap-row2' }, B('Chạy tiếp', resume, 'primary'), openT, t ? B('Xem bàn giao', () => CG.viewer && CG.viewer.openFile(join(P.run, 'handoff', t.id + '.md'))) : null)],
      designchg: () => [h('h3', {}, '🎨 Design đã đổi từ lúc lập kế hoạch'), h('div', { class: 'who', text: `Phát hiện tự động trước ${phaseName(P, hd.phase)} · các task sau chưa chạy` }),
        h('div', { class: 'ap-df' }, (hd.items || []).map((x) => h('div', { class: 'c', text: '~ ' + x }))),
        h('div', { class: 'ap-row2' }, B('Phân tích & đề xuất sửa lịch', () => { P.designReq = { text: 'Phát hiện tự động trước ' + phaseName(P, hd.phase), items: hd.items }; askPlannerDesign(p); }, 'primary'),
          B('Bỏ qua, chạy tiếp', resume), B('Ghi nhận bản mới, không sửa lịch', async () => { await acceptDesign(p); resume(); }))],
      planning: () => [h('h3', {}, h('span', { class: 'spinner' }), ' Đang chờ phiên điều phối soạn bản sửa lịch'), h('div', { class: 'who', text: hd.why || '' }),
        h('div', { class: 'note', text: 'Phiên điều phối ghi lại plan.json xong thì bản sửa hiện ở đây để bạn duyệt. Nó có thể hỏi lại bạn trong phiên đó.' }),
        h('div', { class: 'ap-row2' }, B('Mở phiên điều phối', () => openSess(P.plannerSid), 'primary'), B('Huỷ, chạy tiếp như cũ', () => { P.hold = null; save(); render(); }))],
      check: () => [h('h3', {}, h('span', { class: 'spinner' }), ' Đang kiểm tra design có đổi không'), h('div', { class: 'who', text: `Haiku · thấp — trước ${phaseName(P, hd.phase)}` })],
      blocked: () => [h('h3', {}, '⏸ Tạm dừng'), h('div', { class: 'who', text: p.run.note || 'Một số task cần bạn xem (đánh dấu ? hoặc ✕ trong danh sách).' }), h('div', { class: 'ap-row2' }, B('Chạy tiếp', resume, 'primary'))],
    };
    box.append(...(K[hd.kind] || K.blocked)().filter(Boolean));
    return box;
  }

  // ----- cập nhật yêu cầu / design
  function designDialog(p) {
    const P = p.proj;
    const runT = P.tasks.find((t) => t.st === 'run');
    const ta = h('textarea', { class: 'ap-dlg-ta', placeholder: 'Vd: Design màn Shop trên Figma vừa cập nhật, xem lại giúp. (Design có MCP thì chỉ cần một câu — phiên điều phối tự lấy bản mới.)' });
    let pol = 'finish';
    const seg = h('div', { class: 'ap-pol' }, [['finish', 'Cho task đang chạy làm xong', 'phần làm dở được đánh giá lại khi sửa lịch'], ['stop', 'Dừng task đang chạy ở điểm an toàn', 'agent ghi bàn giao phần đã làm rồi dừng']].map(([k, a, b]) => {
      const l = h('label', { class: k === pol ? 'on' : '', onclick: () => { pol = k; seg.querySelectorAll('label').forEach((x) => x.classList.toggle('on', x === l)); } }, a, h('small', { text: b })); return l; }));
    const atts = [];
    const attBox = h('div', { class: 'ap-atts' });
    const pick = h('button', { class: 'btn sm', onclick: async () => { for (const f of await api.pickFiles({ title: 'Ảnh / tệp design' })) { atts.push(f); attBox.append(h('span', { class: 'chip', text: basename(f) })); } } }, icon('paperclip', 13), 'Đính kèm tệp');
    let m = null;
    const go = async () => {
      const text = ta.value.trim() + (atts.length ? '\nTệp đính kèm:\n' + atts.map((f) => '- ' + f).join('\n') : '');
      if (!text) return toast('Ghi vài chữ về thay đổi');
      m.close();
      P.designReq = { text };
      log(p, 'Người dùng báo yêu cầu / design thay đổi');
      const c = runT && runT.sid && A().convs().find((x) => x.sid === runT.sid);
      if (c && c.busy && p.run.state === 'running') {
        if (pol === 'stop') await c.send(`Dừng lại ngay ở điểm an toàn: yêu cầu / design vừa thay đổi. Ghi bàn giao phần đã làm vào ${join(P.run, 'handoff', runT.id + '.md')} (Đạt tiêu chí: một phần) rồi kết thúc lượt, không làm tiếp.`, '⏹ Dừng ở điểm an toàn (design thay đổi)');
        toast(pol === 'stop' ? 'Đã báo task đang chạy dừng lại — xong sẽ gửi phiên điều phối' : 'Task đang chạy làm xong sẽ gửi phiên điều phối');
        save(); render();
      } else askPlannerDesign(p);
    };
    m = modal('Cập nhật yêu cầu / design', h('div', { class: 'ap-dlg' },
      h('div', { class: 'note', text: 'Thay đổi được giao cho phiên điều phối (model mạnh): so design cũ–mới, cập nhật context.md, đề xuất sửa lịch để bạn duyệt. Không gửi thẳng vào phiên đang chạy.' }),
      ta, h('div', { class: 'ap-row2' }, pick, attBox),
      runT ? h('div', {}, h('div', { class: 'ap-lb', text: `Task đang chạy: #${P.tasks.indexOf(runT) + 1} ${runT.title} (${MN[runT.model]})` }), seg) : null),
    [h('button', { class: 'btn', text: 'Huỷ', onclick: () => m.close() }), h('button', { class: 'btn primary', text: 'Gửi cho phiên điều phối', onclick: go })], { cls: 'm-wide' });
    setTimeout(() => ta.focus(), 50);
  }
  async function feedback(p) {
    const v = await promptDialog('Góp ý cho Claude sửa kế hoạch', '', 'Vd: gộp task 3 vào task 2; task server dùng Opus…');
    if (!v || !v.trim()) return;
    await askPlanner(p, 'Góp ý của người dùng về kế hoạch: ' + v.trim(), '💬 Góp ý kế hoạch: ' + v.trim().slice(0, 100));
  }

  // nút "Lên kế hoạch & lập lịch" ở menu gửi
  function planFromComposer() {
    const inp = document.querySelector('#input');
    const text = inp.value.trim();
    const c = S().active;
    inp.value = `📐 Lên kế hoạch & lập lịch: ${text}\n\n(Dùng skill claude-gui:lap-ke-hoach${c && c.cwd ? ` — thư mục dự án: ${c.cwd}` : ''}.)`;
    inp.dispatchEvent(new Event('input'));
    document.querySelector('#btn-send').click();
  }
  async function skillsDialog() {
    const r = await api.apSkills();
    const body = h('div', { class: 'ap-sk' },
      h('div', { class: 'note', text: r.supported ? `Bộ skill v${r.version || '?'} — nạp cho mọi phiên mở từ GUI bằng --plugin-dir (không đụng ~/.claude/skills).` : 'Bản Claude CLI đang dùng chưa hỗ trợ --plugin-dir — cập nhật CLI để dùng bộ skill.' }),
      ...(r.skills || []).map((s) => h('details', { class: 'ap-skd' }, h('summary', {}, h('code', { text: s.name }), h('span', { class: 'note', text: ' — ' + s.desc.slice(0, 160) })), h('pre', { class: 'ap-pre', text: s.text }))));
    const m = modal('Bộ skill của Claude GUI', body, [h('button', { class: 'btn', text: 'Đóng', onclick: () => m.close() })], { cls: 'm-wide' });
  }

  CG.autopilot = { onToolResult, run, stop, status, renderFlow, planFromComposer, skillsDialog, _onPlanFile: onPlanFile, _designCheck: designCheck, _applyPending: applyPending };
})();
