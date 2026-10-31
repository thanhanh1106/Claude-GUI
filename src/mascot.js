'use strict';
// Linh vật robot mắt LED (bộ vẽ ở bot.js): biểu cảm theo việc Claude đang làm ở phiên đang xem, sắp hết / hết giới hạn,
// nhạc đang phát (đeo tai nghe, nhún theo âm lượng thật), trang phục ngày lễ (tự mặc đúng ngày), đạo cụ theo công cụ,
// gọi bạn khi phiên nào cần trả lời, ngữ cảnh đầy, đếm ngược lịch, giờ giấc & nhắc nghỉ, Pomodoro, lên cấp & phụ kiện.
// Đặt được ở 6 chỗ cố định hoặc tự do; kéo thả để đổi chỗ, chuột phải để chọn vị trí/cỡ/ẩn, bấm đúp mở menu nhanh.
// Khi app thu nhỏ / nằm ở khay: gửi trạng thái sang cửa sổ robot ngoài desktop (pet.js) qua main.js.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, h } = CG;
  const S = () => CG.S;
  const BK = window.BotKit;
  const { Bot, PROPS, ACC, COLORS, BW, now } = BK;
  const Seasons = window.Seasons;
  const MIN = 60e3;

  // =====================================================================
  // Nhạc đang phát (main.js → PowerShell đọc Windows Media + âm lượng loa)
  // =====================================================================
  const M = Object.assign(BK.M, { raw: 0, media: null, hist: [], watching: false });
  const MOODS = [
    ['sad', /buồn|sad|piano|ballad|acoustic|lonely|cry|khóc|chia tay|nhớ em|nhớ anh|mưa|\brain\b|slow|tears/i],
    ['edm', /remix|\bedm\b|dance|bass|house|vinahouse|phonk|trap|dubstep|club|party|techno|electro|rock|metal|drum|hardstyle/i],
    ['chill', /lo-?fi|chill|jazz|study|relax|ambient|caf[eé]|coffee|bossa|sleep|calm/i],
  ];
  function moodOf() {
    const s = M.media ? `${M.media.title || ''} ${M.media.artist || ''}` : '';
    for (const [k, re] of MOODS) if (re.test(s)) return k;
    // không đoán được từ tên bài: theo độ "sôi" của âm lượng ~6 giây gần nhất
    const hs = M.hist; if (hs.length < 30) return 'chill';
    const avg = hs.reduce((a, b) => a + b, 0) / hs.length, vari = hs.reduce((a, b) => a + (b - avg) ** 2, 0) / hs.length;
    return avg > .38 && vari > .012 ? 'edm' : avg < .12 ? 'sad' : 'chill';
  }
  function musicActive() {
    const c = cfg();
    const m = M.media;
    return !!(c.mascotMusic !== false && m && m.playing && (m.type !== 2 || c.mascotVideo));
  }
  function watchMedia(on) {
    if (on === M.watching) return;
    M.watching = on;
    api.mediaWatch(on).catch(() => {});
    if (!on) { M.media = null; M.on = false; }
  }
  api.onMediaLevel((v) => {
    if (v < 0) return;
    M.raw = Math.max(0, Math.min(1, (v - .04) / .6));
    M.hist.push(M.raw); if (M.hist.length > 96) M.hist.shift();
  });
  api.onMediaState((st) => { M.media = st; M.mood = moodOf(); });

  // =====================================================================
  // Cài đặt
  // =====================================================================
  const DEF = { mascot: 'robot', mascotPos: 'corner', mascotSize: 1, mascotMusic: true, mascotVideo: false, mascotFree: null,
    mascotPet: true, mascotCare: true, mascotBeep: false, mascotXp: 0, mascotWear: [], mascotColor: 'cyan', mascotGreet: '', mascotMorning: '',
    // nuôi robot (petlife.js) — mặc định tắt, bật trong Cài đặt
    mascotLife: false, mascotLifeApp: true, mascotLifeDesk: true, mascotLifeOut: true, mascotLifeBodyApp: false, mascotNeeds: true, mascotDnd: false, mascotForm: '' };
  const cfg = () => ({ ...DEF, ...((S().settings && S().settings.decor) || {}) });
  const reduced = () => !!(CG.decor && CG.decor.cfg().reduceMotion);
  // lưu lặng lẽ (không áp dụng lại toàn bộ giao diện) — cho XP, đã chào hôm nay…
  async function quietSave(patch) {
    const cur = (S().settings && S().settings.decor) || {};
    S().settings = await api.setSettings({ decor: { ...cur, ...patch } });
  }
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const hm = (d = new Date()) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút${s % 60 ? ` ${s % 60} giây` : ''}`; };
  function beep(kind) { if (cfg().mascotBeep && !M.on) BK.beep(kind); }

  // =====================================================================
  // Trang phục ngày lễ (tự mặc theo ngày trên máy, người dùng không chọn) + phụ kiện theo cấp
  // =====================================================================
  let evCache = { k: '', ev: null };
  function season() { if (R.forceEv !== undefined) return R.forceEv; const k = dayKey(); if (evCache.k !== k) evCache = { k, ev: Seasons ? Seasons.today() : null }; return evCache.ev; }
  function colorOf() { const c = cfg(), lv = BK.levelOf(c.mascotXp).lv, col = COLORS.find((x) => x.id === c.mascotColor && x.lv <= lv); return col || COLORS[0]; }
  function wearOf() { const c = cfg(), lv = BK.levelOf(c.mascotXp).lv; return (c.mascotWear || []).filter((id) => { const a = ACC.find((x) => x.id === id); return a && a.lv <= lv; }); }
  const escX = (x) => String(x).replace(/[<&>"]/g, (ch) => '&#' + ch.charCodeAt(0) + ';');
  function dressBot(b, prop) {
    const ev = season(), raw = prop && prop[0] === '<', o = BK.outfit(ev, wearOf(), raw ? null : prop), pv = b.pv || {};
    let back = o.back, front = o.front;
    const life = lifeOn() && b === R.bot;
    if (life) { const f = curForm(); back = PL.HEADS[kitCfg().head].back + (ev ? PL.evWrap(back) : f.back + back); front = ev ? PL.evWrap(front) : f.front + front; }
    b.dress(back, front, raw ? prop : o.prop.replace('{L}', escX(pv.L || '✉')).replace('{N}', escX(pv.N || '')));
    if (life && ev) PL.trimEv(b);
    const col = colorOf();
    b.ev = ev; b.base = ev ? ev.color : col.c || BK.CYAN; b.rainbow = !ev && col.id === 'rainbow';
  }

  // =====================================================================
  // Gắn vào app: trạng thái phiên → biểu cảm
  // =====================================================================
  const TOOL_FACE = [
    [/^(Read|Grep|Glob|LS|NotebookRead|mcp__.*(read|get|list|search|query|fetch).*)$/i, 'reading'],
    [/^(Edit|MultiEdit|Write|NotebookEdit)$/, 'writing'],
    [/^(WebSearch|WebFetch|web_search|web_fetch)$/i, 'web'],
    [/^(Task|Agent)$/, 'agents'],
    [/^(TodoWrite|ExitPlanMode|EnterPlanMode)$/, 'thinking'],
  ];
  const TOOL_WHY = { reading: 'Đang đọc', writing: 'Đang sửa code', web: 'Đang tra web', agents: 'Đang giao việc cho tác tử phụ', thinking: 'Đang lên kế hoạch', bash: 'Đang chạy lệnh' };
  // đạo cụ cầm tay theo biểu cảm
  const PROP_OF = { reading: 'reading', writing: 'writing', bash: 'bash', web: 'web', agents: 'agents', thinking: 'thinking', permission: 'wave', call: 'wave', countdown: 'clock', ring: 'ring', water: 'glass', yawn: 'nightcap', nod: 'nightcap', sun: 'sun', mail: 'mail', push: 'rocket', bug: 'net', box: 'box', sign: 'sign' };
  const R = {
    bot: null, wrap: null, fx: null, conv: null, out: false, rechargeUntil: 0, lastInput: Date.now(), why: '', anchor: '', slots: {}, raf: 0, last: now(), frame: 0,
    ov: null, s: 'idle', prop: null, activeSince: Date.now(), water: null, nightAsked: '', nightOff: '', sunUntil: 0, pomo: null, reliefUntil: 0, wasCompact: false,
    xpAdd: 0, xpTimer: 0, petBub: null, petActs: new Map(), lastPet: '', cdRing: 0,
    today: null, mail: null, badgeQ: [], dayBadgeT: 0,
  };

  function limits() {
    const rows = (CG.app && CG.app.planLimits && CG.app.planLimits()) || [];
    let p5 = 0, pw = 0, r5 = null, rw = null;
    for (const r of rows) {
      if (r.group === 'session') { if (r.pct >= p5) { p5 = r.pct; r5 = r.reset; } }
      else if (r.label === 'Tất cả model' || r.pct >= pw) { if (r.pct >= pw) { pw = r.pct; rw = r.reset; } }
    }
    return { p5, pw, r5, rw };
  }
  const resetText = (v) => (CG.app && CG.app.fmtReset && v ? CG.app.fmtReset(v).toLowerCase() : '');
  const convs = () => (CG.app && CG.app.convs ? CG.app.convs() : []);
  const ctxPct = (c) => (c && CG.app && CG.app.ctxPct ? CG.app.ctxPct(c) : 0);
  const B = (c) => c._bot || (c._bot = {});

  // lịch sắp chạy trong 5 phút tới (đếm ngược trên màn LED)
  function nextPlan() {
    const sc = CG.sched; if (!sc || !sc.nextFire) return null;
    let best = null;
    for (const p of sc.plans || []) {
      if (p.demo || !p.on) continue;
      const t = sc.nextFire(p);
      if (t && t - Date.now() < 5 * MIN && t > Date.now() - 2500 && (!best || t < best.t)) best = { t, name: p.name };
    }
    return best;
  }

  function derive() {
    const c = S().active;
    const L = limits();
    const out = L.p5 >= 100 || L.pw >= 100;
    if (R.out && !out) { R.rechargeUntil = Date.now() + 3300; onRecharged(); }
    R.out = out;
    const tint = L.pw >= 80 ? 'week' : L.p5 >= 80 ? '5h' : null;
    const title = c && c.title ? c.title : '';
    const nowMs = Date.now(), hr = new Date().getHours();
    let st = 'idle', why = 'Rảnh';
    const end = c && c.lastEnd, age = end ? nowMs - end.t : 1e9;
    const res = c && c._bot && c._bot.res && nowMs - c._bot.res.t < (c._bot.res.ms || (c._bot.res.kind === 'fail' ? 9000 : 4500)) ? c._bot.res : null;
    // thư Lark chưa xem (mọi phiên): robot cầm phong bì có chữ cái đầu tên người gửi
    const mail = CG.lark && CG.lark.mailbox ? CG.lark.mailbox()[0] || null : null;
    R.mail = mail;
    R.bot.pv = { L: mail ? (mail.name || '?').trim().charAt(0).toUpperCase() : '', N: res && res.n ? String(res.n) : '' };
    const waitOther = convs().find((x) => x !== c && x.perms && x.perms.size);
    const typing = document.activeElement && document.activeElement.id === 'input' && document.activeElement.value.trim();
    const pct = ctxPct(c);
    const plan = nextPlan();
    const care = cfg().mascotCare !== false;
    const ph = c && c.busy ? c.phase || 'think' : '';
    // vừa nén ngữ cảnh xong → "phù~"
    if (R.wasCompact && ph !== 'compact') { R.reliefUntil = nowMs + 2600; bubble('Phù~ nhẹ cả người', { ms: 2400 }); }
    R.wasCompact = ph === 'compact';
    R.callDir = 0;
    if (R.ov && nowMs < R.ov.until) { st = R.ov.s; why = R.ov.why || R.why.split('\n')[0]; }
    else if (out) { st = 'limitOut'; why = L.p5 >= 100 ? `Hết giới hạn 5 giờ · ${resetText(L.r5)} — mình ngủ chờ nhé` : `Hết giới hạn tuần · ${resetText(L.rw)}`; R.bot.cdEnd = +new Date(L.p5 >= 100 ? L.r5 : L.rw) || 0; }
    else if (nowMs < R.rechargeUntil) { st = 'recharged'; why = 'Giới hạn đã hồi, làm tiếp thôi!'; }
    else if (c && c.perms && c.perms.size) { st = 'permission'; why = 'Đang chờ bạn trả lời'; }
    else if (waitOther) { st = 'call'; why = `Phiên “${waitOther.title || 'khác'}” đang chờ bạn trả lời`; R.callDir = sideDir(); }
    else if (res) { st = { fail: 'bug', pass: 'pass', commit: 'commit', push: 'push', conflict: 'sweat', box: 'box', build: 'done' }[res.kind] || 'done'; why = res.msg; }
    else if (nowMs < R.reliefUntil) { st = 'relief'; why = 'Vừa nén xong ngữ cảnh'; }
    else if (c && c.busy) {
      if (ph === 'compact') { st = 'compact'; why = 'Đang nén ngữ cảnh'; }
      else if (ph.startsWith('tool:')) {
        const name = ph.slice(5); st = 'bash';
        for (const [re, f] of TOOL_FACE) if (re.test(name)) { st = f; break; }
        why = c.activity || `${TOOL_WHY[st]} (${name})`;
      } else if (ph === 'talk') { st = 'talking'; why = 'Đang trả lời'; }
      else { st = c.runningTasks && c.runningTasks.length ? 'agents' : 'thinking'; why = st === 'agents' ? `${c.runningTasks.length} tác vụ phụ đang chạy` : 'Đang suy nghĩ'; }
    } else if (c && c.working) { st = 'agents'; why = `${c.runningTasks.length} tác vụ phụ đang chạy nền`; }
    else if (end && end.kind === 'error' && age < 10000) { st = 'error'; why = 'Vừa gặp lỗi'; }
    else if (end && end.kind === 'stopped' && age < 5000) { st = 'stopped'; why = 'Đã dừng theo yêu cầu'; }
    else if (end && end.kind === 'done' && end.long && age < 8000) { st = 'celebrate'; why = 'Xong việc rồi!'; }
    else if (end && end.kind === 'done' && age < 4000) { st = 'done'; why = 'Xong'; }
    else if (mail) { st = 'mail'; why = `✉ ${mail.name} nhắn ${mail.n} tin${mail.title ? ` · phiên “${mail.title}”` : ''} — bấm vào mình để mở`; }
    else if (plan) {
      const left = plan.t - nowMs;
      if (left <= 0) { st = 'ring'; why = `Đang chạy lịch “${plan.name}”`; if (!R.cdRing) { R.cdRing = 1; R.bot.hop(); } }
      else { st = 'countdown'; why = `Lịch “${plan.name}” chạy lúc ${hm(new Date(plan.t))}`; R.bot.cdEnd = plan.t; R.cdRing = 0; }
    } else if (typing) { st = 'typing'; why = 'Đang nghe bạn gõ…'; }
    else if (pct >= .92) { st = 'stuffed'; why = `Ngữ cảnh đầy ${Math.round(pct * 100)}% — nên /compact`; }
    else if (pct >= .8) { st = 'puff'; why = `Ngữ cảnh đã dùng ${Math.round(pct * 100)}%`; }
    else if (tint) { st = tint === 'week' ? 'limitW' : L.p5 >= 92 ? 'tired' : 'limit5'; why = tint === 'week' ? `Giới hạn tuần đã dùng ${Math.round(L.pw)}% · ${resetText(L.rw)}` : `${L.p5 >= 92 ? 'Mệt lả rồi… ' : ''}Giới hạn 5 giờ đã dùng ${Math.round(L.p5)}% · ${resetText(L.r5)}`; }
    else if (R.pomo && R.pomo.phase === 'break') { st = 'stretch'; why = 'Pomodoro: đang nghỉ 5 phút'; }
    else if (R.water) { st = 'water'; why = 'Uống miếng nước nhé 💧'; }
    else if (nowMs < R.sunUntil) { st = 'sun'; why = 'Chào buổi sáng ☀'; }
    else if (care && (hr >= 23 || hr < 5) && R.nightOff !== nightKey()) { st = hr >= 23 ? 'yawn' : 'nod'; why = `Khuya rồi (${hm()}) 🌙`; }
    else if (nowMs - R.lastInput > 10 * MIN) { st = 'sleep'; why = 'Đang ngủ (rảnh lâu)'; }
    if (tint && !st.startsWith('limit') && st !== 'tired' && st !== 'idle') why += tint === 'week' ? ` · ⚠ giới hạn tuần ${Math.round(L.pw)}%` : ` · ⚠ giới hạn 5 giờ ${Math.round(L.p5)}%`;
    if (M.on && (st === 'idle' || st === 'sleep')) why = `Đang nghe nhạc${M.media && M.media.title ? `: ${M.media.title}` : ''} ♪`;
    const ev = season();
    if (st === 'idle' && ev) { st = 'costume'; if (!M.on) why = ev.say; }
    if (R.pomo && R.pomo.phase === 'work' && st === 'idle') why = `Pomodoro: còn ${Math.ceil((R.pomo.end - nowMs) / MIN)} phút`;
    // âm báo khi đổi sang trạng thái cần chú ý
    if (st !== R.s) { const k = { permission: 'ask', call: 'ask', celebrate: 'done', pass: 'done', error: 'err', bug: 'err' }[st]; if (k) beep(k); }
    R.s = st;
    R.prop = PROP_OF[st] || null;
    R.bot.tintKind = out ? null : tint;
    R.bot.callDir = R.callDir;
    R.why = why + (title ? `\n${title}` : '');
    if (!R.life) dressBot(R.bot, R.prop);
    R.bot.bar = R.pomo ? Math.max(0, (R.pomo.end - nowMs) / (R.pomo.end - R.pomo.start)) : null;
    R.wrap.classList.toggle('puff', pct >= .8 && pct < .92); R.wrap.classList.toggle('puff2', pct >= .92);
    if (R.life) R.conv = c;
    else if (c !== R.conv) { R.conv = c; if (st !== R.bot.s) R.bot.switchTo(st); }
    else R.bot.state(st);
    checkCtx(c, pct);
    markWaiting();
  }
  // phiên khác đang chờ: robot liếc về phía thanh bên (trái/phải tuỳ chỗ robot đứng)
  function sideDir() { const sb = $('#sidebar'); if (!sb || !R.wrap) return -6; const a = sb.getBoundingClientRect(), b = R.wrap.getBoundingClientRect(); return a.left + a.width / 2 < b.left ? -6 : 6; }
  function markWaiting() {
    const ids = new Set(convs().filter((x) => x !== S().active && x.perms && x.perms.size).map((x) => x.sid));
    for (const el of document.querySelectorAll('#session-list .sess[data-sid]')) el.classList.toggle('m-wait', ids.has(el.dataset.sid));
  }
  const nightKey = () => { const d = new Date(); if (d.getHours() < 12) d.setDate(d.getDate() - 1); return dayKey(d); };

  // =====================================================================
  // Ngữ cảnh đầy → gợi ý /compact (một lần cho mỗi lần vượt ngưỡng)
  // =====================================================================
  function checkCtx(c, pct) {
    if (!c) return;
    const b = B(c);
    if (pct < .8) b.ctxWarn = false;
    if (pct >= .92 && !b.ctxWarn && !c.busy && c === S().active) {
      b.ctxWarn = true;
      bubble([h('div', { text: `Ngữ cảnh đầy ${Math.round(pct * 100)}% rồi, no quá 😵` }), h('div', { class: 'mb-sub', text: 'Nén lại để Claude nhớ gọn và chạy nhanh hơn.' })],
        { cls: 'warn', ms: 20000, acts: [{ label: 'Chạy /compact', p: 1, run: () => runCompact(c) }, { label: 'Để sau' }] });
    }
  }
  function runCompact(c) {
    if (c !== S().active || c.busy) { CG.toast('Phiên đang bận, đợi Claude xong rồi gõ /compact nhé.'); return; }
    const inp = $('#input'); if (!inp) return;
    inp.value = '/compact'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    $('#btn-send').click();
  }

  // =====================================================================
  // Kết quả lệnh: test pass/fail, build, commit (đọc lệnh Bash và output)
  // =====================================================================
  const TEST_RE = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:jest|vitest|mocha|playwright\s+test)|pytest|py\.test|go\s+test|cargo\s+test|dotnet\s+test|jest|vitest|mocha|phpunit|rspec|(?:mvn|mvnw)\b.*\btest|gradlew?\b.*\btest|ctest|unittest)\b/i;
  const BUILD_RE = /\b(?:(?:npm|pnpm|yarn|bun)\s+run\s+build|cargo\s+build|dotnet\s+build|go\s+build|tsc\b|make\b|cmake\s+--build|(?:mvn|mvnw)\b.*\b(?:package|install|compile)|gradlew?\b.*\bbuild|msbuild|webpack|vite\s+build|electron-builder)/i;
  const COMMIT_RE = /\bgit\s+(?:-C\s+\S+\s+)?commit\b/i, PUSH_RE = /\bgit\s+(?:-C\s+\S+\s+)?push\b/i;
  const CONFLICT_RE = /\bCONFLICT \(|Automatic merge failed|fix conflicts and then|Merge conflict in|could not apply [0-9a-f]{6,}|needs merge\b/i;
  const EDIT_RE = /^(Edit|MultiEdit|Write|NotebookEdit)$/;
  const BIG_DIFF = 15;
  const stat = (ev, repo) => { if (api.statsAdd) api.statsAdd({ kind: 'ev', ev, repo }).catch(() => {}); };
  // thư mục repo của lệnh git: "cd X && git …" hoặc "git -C X …", không có thì là thư mục phiên
  function repoOfCmd(conv, cmd) {
    const m = /(?:^|&&|;|\n)\s*(?:cd|Set-Location|pushd)\s+(?:\/d\s+)?(["']?)([^"'&;\n]+?)\1\s*(?:&&|;|\n|$)/i.exec(cmd) || /\bgit\s+-C\s+(["']?)([^"'\s]+)\1/i.exec(cmd);
    return (m ? m[2].trim() : conv.cwd || '').replace(/[\\/]+$/, '');
  }
  function onToolResult(conv, card, b) {
    if (!card) return;
    // đếm tệp Claude sửa trong lượt (lượt sửa quá nhiều tệp → robot bê thùng nặng)
    if (EDIT_RE.test(card.name)) { const f = card.input && (card.input.file_path || card.input.notebook_path); if (f && !b.is_error) (B(conv).files = B(conv).files || new Set()).add(String(f).toLowerCase()); return; }
    if (!/^(Bash|PowerShell)$/.test(card.name)) return;
    const cmd = String((card.input && card.input.command) || '');
    const text = CG.resultText ? CG.resultText(b.content) : '';
    let res = null;
    if (/\bgit\b/i.test(cmd) && CONFLICT_RE.test(text)) {
      res = { kind: 'conflict', msg: 'Xung đột khi merge — toát mồ hôi 😰 cần gỡ conflict', ms: 9000 };
      stat('conflict');
    } else if (TEST_RE.test(cmd)) {
      const nf = /\b([1-9]\d*)\s+(?:failed|failing|failures?)\b/i.exec(text), np = /\b(\d+)\s+(?:passed|passing)\b/i.exec(text);
      const fail = b.is_error || !!nf || /\bFAIL(?:ED)?\b/.test(text);
      res = fail ? { kind: 'fail', msg: `Test fail${nf ? ` · ${nf[1]} lỗi` : ''} · cầm vợt đi bắt bọ 🐞` } : { kind: 'pass', msg: `Test pass${np ? ` · ${np[1]} test` : ''} 🎉` };
      stat(fail ? 'testFail' : 'testPass');
      if (!fail) addXp(10);
    } else if (BUILD_RE.test(cmd)) {
      res = b.is_error ? { kind: 'fail', msg: 'Build lỗi — cầm vợt đi bắt bọ 🐞' } : { kind: 'build', msg: 'Build xong 🔨' };
      stat(b.is_error ? 'buildFail' : 'build');
    } else if (!b.is_error && (COMMIT_RE.test(cmd) || PUSH_RE.test(cmd))) {
      const repo = repoOfCmd(conv, cmd);
      if (COMMIT_RE.test(cmd)) gitEvent(conv, 'commit', repo, true);
      if (PUSH_RE.test(cmd) && !/rejected|failed to push|error:/i.test(text)) gitEvent(conv, 'push', repo, true);
      return;
    }
    if (!res) return;
    B(conv).res = { ...res, t: Date.now() };
    if (res.kind === 'fail' || res.kind === 'pass') lifeEv(res.kind);
    if (conv === S().active && res.kind === 'pass' && R.fx && !reduced()) R.fx.once('confetti');
  }
  // commit → pháo hoa, push → tên lửa (gọi từ lệnh Bash của Claude hoặc từ khung Thay đổi)
  function gitEvent(conv, kind, repo, fromCmd) {
    stat(kind, kind === 'commit' ? String(repo || '').toLowerCase() : '');
    if (!fromCmd) addXp(0);
    const c = conv || S().active;
    if (!c) return;
    const name = repo ? (repo.split(/[\\/]/).pop() || repo) : '';
    // commit rồi push cùng lúc: tên lửa thắng
    const prev = B(c).res;
    if (kind === 'commit' && prev && prev.kind === 'push' && Date.now() - prev.t < 3000) return;
    B(c).res = kind === 'push' ? { kind: 'push', msg: `Đã push${name ? ` ${name}` : ''} lên remote 🚀`, t: Date.now(), ms: 5200 } : { kind: 'commit', msg: `Đã commit${name ? ` ${name}` : ''} 🎆`, t: Date.now(), ms: 4500 };
    if (c === S().active && kind === 'commit' && R.fx && !reduced()) R.fx.once('fireworks', 2600);
    lifeEv(kind);
    checkDayBadges(true);
  }
  // một lượt kết thúc (mọi phiên): XP, bóng nói cho robot ngoài desktop
  function onTurnEnd(conv, o) {
    if (!o.failed) addXp(o.long ? 6 : 1);
    if (!o.failed && !o.stopped) lifeEv(o.long ? 'long' : 'turn');
    const files = B(conv).files; B(conv).files = null;
    setTimeout(refreshToday, 1500);
    if (!o.failed && !conv.nb) {
      const hr = new Date().getHours();
      if (hr < 4) award('owl'); else if (hr < 6) award('early');
      if (o.ms > 30 * MIN) award('marathon');
      checkDayBadges();
    }
    if (!o.failed && files && files.size >= BIG_DIFF) {
      B(conv).res = { kind: 'box', msg: `Lượt này sửa ${files.size} tệp — nặng ghê 📦`, t: Date.now(), ms: 8000, n: files.size };
      if (conv === S().active) bubble([h('div', { text: `Lượt vừa rồi Claude sửa ${files.size} tệp 📦` }), h('div', { class: 'mb-sub', text: 'Diff lớn — nên xem lại trước khi commit.' })],
        { ms: 15000, acts: [{ label: 'Xem thay đổi', p: 1, run: () => CG.app.toggleDetails && CG.app.toggleDetails(true, 'session') }, { label: 'OK' }] });
    } else if (!o.failed && !o.stopped) costWarn(conv);
    if (o.stopped) return;
    const t = conv.title || 'Phiên';
    if (o.failed) petBubble({ id: 'err-' + conv.key, kind: 'err', title: '✕ Lỗi', text: `“${t}” vừa gặp lỗi`, conv, acts: [{ label: 'Mở phiên', p: 1, open: true }] });
    else if (!document.hasFocus()) petBubble({ id: 'done-' + conv.key, kind: 'done', title: '✓ Xong rồi!', text: `“${t}”${o.ms ? ` · ${dur(o.ms)}` : ''}`, conv, acts: [{ label: 'Mở phiên', p: 1, open: true }, { label: 'Để sau' }] });
  }
  function onRecharged() {
    const n = CG.sched ? (CG.sched.plans || []).filter((p) => p.on && !p.demo && /^reset/.test(p.trig && p.trig.type)).length : 0;
    const sub = n ? `${n} lịch đang chờ sẽ tự chạy` : '';
    bubble([h('div', { text: '🔋 Giới hạn đã hồi, làm tiếp thôi!' }), sub ? h('div', { class: 'mb-sub', text: sub }) : null], { ms: 6000 });
    petBubble({ id: 'recharge', kind: 'done', title: '🔋 Giới hạn đã hồi', text: sub || 'Làm tiếp thôi!', acts: [{ label: 'Mở app', p: 1, open: true }, { label: 'OK' }] });
    if (!document.hasFocus()) api.notify('Giới hạn đã hồi', sub || 'Claude GUI: dùng tiếp được rồi');
  }

  // =====================================================================
  // Ví token: số hôm nay (tooltip, menu nhanh) + nhắc khi phiên Opus/Fable quá dài
  // =====================================================================
  async function refreshToday() { if (!CG.usage) return; try { R.today = await CG.usage.today(); } catch {} }
  const walletLine = () => (R.today && R.today.turns ? `Hôm nay: ${CG.usage.usd(R.today.cost)} · ${CG.fmtTok(R.today.total)} token · ${R.today.turns} lượt` : '');
  function costWarn(conv) {
    const u = conv.lastUsage;
    if (!u || conv !== S().active || conv.nb || bub) return;
    const heavy = Object.keys(u.models || {}).find((n) => /opus|fable|mythos/i.test(n));
    if (!heavy) return;
    const ctx = conv.ctx || 0, b = B(conv);
    if (ctx < 250000 && u.cost < 2) return;
    if (b.costWarnAt && Date.now() - b.costWarnAt < 90 * MIN) return;
    b.costWarnAt = Date.now();
    const fam = /fable|mythos/i.test(heavy) ? 'Fable' : 'Opus';
    bubble([h('div', { text: `Phiên ${fam} này dài rồi — lượt vừa rồi ≈ ${CG.usage ? CG.usage.usd(u.cost) : '$' + u.cost.toFixed(2)} 💸` }),
      h('div', { class: 'mb-sub', text: `${ctx ? `Ngữ cảnh ~${CG.fmtTok(ctx)} token: ` : ''}mỗi lượt Claude đọc lại cả đoạn dài. Ghi kết luận vào Sổ tài liệu rồi sang phiên mới (hoặc /compact) sẽ rẻ và nhanh hơn.` })],
      { cls: 'warn', ms: 30000, acts: [{ label: 'Mở Sổ tài liệu', p: 1, run: () => CG.nb && CG.nb.toggle(true) }, { label: 'Chạy /compact', run: () => runCompact(conv) }, { label: 'Để sau' }] });
  }

  // =====================================================================
  // Thư Lark: gật đầu khi bên kia "Đã xem", nhắc khi chờ trả lời quá lâu
  // =====================================================================
  function onLarkRead(name) {
    R.ov = { s: 'ack', until: Date.now() + 2200, why: `${name} đã xem tin ✓✓` };
    if (R.bot) R.bot.hop();
    if (document.hasFocus() && !bub) bubble(`${name} đã xem tin của bạn ✓✓`, { ms: 3500 });
    award('mail');
  }
  const nudged = new Set(JSON.parse(localStorage.getItem('cg-nudged') || '[]'));
  function larkNudge() {
    if (!CG.lark || !CG.lark.waiting || bub || !document.hasFocus() || !R.bot) return;
    const w = CG.lark.waiting(40 * MIN).find((x) => !nudged.has(String(x.msg.id || x.msg.t)));
    if (!w) return;
    nudged.add(String(w.msg.id || w.msg.t));
    localStorage.setItem('cg-nudged', JSON.stringify([...nudged].slice(-200)));
    const mins = Math.round((Date.now() - w.msg.t) / MIN), ago = mins < 120 ? `${mins} phút` : `${Math.round(mins / 60)} giờ`;
    const short = String(w.msg.text || '').replace(/^[^:]{1,40}:\s*/, '').replace(/\s+/g, ' ').slice(0, 70);
    bubble([h('div', { text: `${w.name} chưa trả lời sau ${ago}${w.msg.read ? ' (đã xem)' : ''} 🤔` }), h('div', { class: 'mb-sub', text: `Nhắc lại ${w.name} không? Tin: “${short}${short.length >= 70 ? '…' : ''}”${w.title ? ` · phiên “${w.title}”` : ''}` })],
      { ms: 45000, acts: [{ label: `Nhắc lại ${w.name}`, p: 1, run: () => CG.lark.openDock(w.sid, w.openId, `Nhắc nhẹ: mình vẫn đang chờ bạn trả lời câu “${short}” ạ 🙏`) }, { label: 'Mở khung chat', run: () => CG.lark.openDock(w.sid, w.openId) }, { label: 'Để sau' }] });
  }

  // =====================================================================
  // Tổng kết cuối ngày + huy hiệu
  // =====================================================================
  const BADGES = [
    { id: 'owl', icon: '🦉', name: 'Cú đêm', desc: 'Có lượt chạy xong sau nửa đêm (0–4 giờ)' },
    { id: 'early', icon: '🐦', name: 'Chim sớm', desc: 'Có lượt chạy xong lúc 4–6 giờ sáng' },
    { id: 'triple', icon: '🎯', name: 'Commit 3 repo một lèo', desc: 'Commit ở 3 repo khác nhau trong một ngày' },
    { id: 'noopus', icon: '🌿', name: 'Không dùng Opus cả ngày', desc: 'Một ngày từ 10 lượt trở lên mà không dùng Opus/Fable' },
    { id: 'thrifty', icon: '🪙', name: 'Chi tiêu khéo', desc: 'Một ngày từ 20 lượt mà chi phí quy đổi dưới $3' },
    { id: 'green', icon: '✅', name: 'Test xanh', desc: '10 lần test pass trong một ngày' },
    { id: 'rocket', icon: '🚀', name: 'Phóng tàu', desc: 'Push 5 lần trong một ngày' },
    { id: 'tasks', icon: '🤖', name: 'Quản đốc', desc: 'Xong 5 task tự động / lịch trong một ngày' },
    { id: 'marathon', icon: '🏃', name: 'Lượt marathon', desc: 'Một lượt Claude chạy liền hơn 30 phút' },
    { id: 'streak7', icon: '🔥', name: 'Chuỗi 7 ngày', desc: 'Dùng Claude 7 ngày liên tiếp' },
    { id: 'mail', icon: '✉️', name: 'Bưu tá', desc: 'Nhắn người thật qua Lark và được xem tin' },
  ];
  const isoDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  async function award(id) {
    const x = BADGES.find((b) => b.id === id);
    const got = cfg().mascotBadges || {};
    if (!x || got[id] || R.awarding === id) return;
    R.awarding = id;
    await quietSave({ mascotBadges: { ...got, [id]: Date.now() } });
    R.awarding = null;
    addXp(30);
    R.badgeQ.push(x);
    if (!bub && document.hasFocus()) showBadge(R.badgeQ.shift());
  }
  function showBadge(x) {
    if (!x) return;
    if (R.bot) { R.ov = { s: 'celebrate', until: Date.now() + 2500, why: `Huy hiệu mới: ${x.name}` }; R.bot.hop(); }
    if (R.fx && !reduced()) R.fx.once('confetti', 1800);
    beep('level');
    bubble([h('div', { text: `🏅 Huy hiệu mới: ${x.icon} ${x.name}` }), h('div', { class: 'mb-sub', text: x.desc + ' · +30 XP' })], { ms: 9000, acts: [{ label: 'Xem huy hiệu', p: 1, run: panel }, { label: 'OK' }] });
  }
  function dayFacts(S2, k) {
    const d = (S2.days || {})[k];
    if (!d) return null;
    const ss = Object.values(d.s || {});
    let turns = 0, cost = 0, tok = 0, heavy = false;
    for (const x of ss) { turns += x.n; cost += x.c; for (const [n, u] of Object.entries(x.m || {})) { tok += (u.i || 0) + (u.o || 0) + (u.cr || 0) + (u.cw || 0); if (/opus|fable|mythos/i.test(n)) heavy = true; } }
    let streak = 0;
    for (let i = 0; i < 400; i++) { const dd = (S2.days || {})[isoDay(new Date(k + 'T12:00:00').getTime() - i * 864e5)]; if (dd && Object.values(dd.s || {}).some((x) => x.n)) streak++; else break; }
    const ev = d.ev || {};
    return { sessions: ss.length, turns, cost, tok, heavy, streak, commits: ev.commit || 0, push: ev.push || 0, tasks: ev.task || 0, pass: ev.testPass || 0, fail: (ev.testFail || 0) + (ev.buildFail || 0), conflict: ev.conflict || 0, repos: (d.repos || []).length };
  }
  // huy hiệu theo ngày: kiểm tra sau mỗi lượt / commit (thưa thôi), "không Opus" và "chi tiêu khéo" chỉ xét khi đã cuối ngày
  async function checkDayBadges(now, k = isoDay(), final) {
    if (!CG.usage || (!now && Date.now() - R.dayBadgeT < 3 * MIN)) return;
    R.dayBadgeT = Date.now();
    const f = dayFacts(await CG.usage.load(true), k);
    if (!f) return;
    if (f.repos >= 3) award('triple');
    if (f.pass >= 10) award('green');
    if (f.push >= 5) award('rocket');
    if (f.tasks >= 5) award('tasks');
    if (f.streak >= 7) award('streak7');
    if (final || new Date().getHours() >= 17) {
      if (f.turns >= 10 && !f.heavy) award('noopus');
      if (f.turns >= 20 && f.cost < 3) award('thrifty');
    }
  }
  function recapCheck() {
    if (!CG.usage || bub || !document.hasFocus() || !R.bot || cfg().mascotRecapOff) return;
    const d = new Date(), hr = d.getHours() + d.getMinutes() / 60, c = cfg(), today = isoDay();
    if (hr >= 17.5 && c.mascotRecap !== today) return void showRecap(today);
    // sáng hôm sau: chưa xem tổng kết hôm qua
    const y = isoDay(Date.now() - 864e5);
    if (hr >= 6 && hr < 12 && c.mascotRecap !== y && c.mascotRecap !== today && !R.recapSkip) { R.recapSkip = 1; showRecap(y); }
  }
  async function showRecap(k, manual) {
    const S2 = await CG.usage.load(true);
    const f = dayFacts(S2, k);
    if (!manual) await quietSave({ mascotRecap: k });
    if (!f || !f.turns) { if (manual) bubble('Ngày này chưa có lượt nào được ghi lại.', { ms: 4000 }); return; }
    await checkDayBadges(true, k, k !== isoDay());
    const label = k === isoDay() ? 'hôm nay' : k === isoDay(Date.now() - 864e5) ? 'hôm qua' : k.split('-').reverse().join('/');
    const line = (t) => h('div', { class: 'mb-sub', text: t });
    if (R.bot) { R.ov = { s: 'done', until: Date.now() + 2500, why: `Tổng kết ${label}` }; R.bot.hop(); }
    bubble([h('div', { text: `📒 Tổng kết ${label}` }),
      line(`${f.sessions} phiên · ${f.turns} lượt · ${CG.fmtTok(f.tok)} token · ${CG.usage.usd(f.cost)} (quy đổi)`),
      line([f.tasks ? `${f.tasks} task tự động xong` : '', f.commits ? `${f.commits} commit${f.repos > 1 ? ` (${f.repos} repo)` : ''}` : '', f.push ? `${f.push} push` : '', f.pass ? `${f.pass} lần test pass` : '', f.conflict ? `${f.conflict} lần conflict` : ''].filter(Boolean).join(' · ') || 'Chưa commit gì'),
      line(f.streak > 1 ? `🔥 Chuỗi ${f.streak} ngày liên tiếp` : 'Mai gặp lại nhé!'),
      lifeOn() && k === isoDay() ? h('div', { class: 'mb-sub mb-diary', text: '📔 Robot viết: “' + lifeDiaryLine(f) + '”' }) : null],
      { ms: 60000, acts: [{ label: 'Bảng chi phí', run: () => CG.usage.open(k === isoDay() ? 1 : 7) }, { label: 'Huy hiệu', run: panel }, { label: 'OK', p: 1 }] });
  }

  // =====================================================================
  // Thói quen: quyền cho phép lặp lại → gợi ý luật; câu gõ lặp lại → gợi ý lệnh tắt
  // =====================================================================
  const normP = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const hashS = (s) => { let x = 5381; for (const ch of s) x = (Math.imul(x, 33) ^ ch.codePointAt(0)) >>> 0; return x.toString(36) + s.length.toString(36); };
  async function onPrompt(conv, t) {
    if (!api.statsHabit || !t || t.length < 15 || t.length > 1500 || t.startsWith('/') || (CG.lark && t.startsWith(CG.lark.LK_MARK))) return;
    const key = hashS(normP(t));
    const x = await api.statsHabit('prompts', key, { text: t });
    if (!x || x.n < 3 || x.done || (x.n > 3 && x.n % 3)) return;
    setTimeout(() => {
      if (bub) return;
      bubble([h('div', { text: `Câu này bạn gõ lần thứ ${x.n} rồi 📝` }), h('div', { class: 'mb-sub', text: `“${t.replace(/\s+/g, ' ').slice(0, 90)}${t.length > 90 ? '…' : ''}” — lưu thành lệnh tắt, lần sau chỉ cần gõ /tên.` })],
        { ms: 40000, acts: [{ label: 'Lưu lệnh tắt…', p: 1, run: () => saveCmd(key, t) }, { label: 'Đừng gợi ý câu này', run: () => api.statsHabit('prompts', key, { mark: true }) }, { label: 'Để sau' }] });
    }, 2500);
  }
  async function saveCmd(key, text) {
    const slug = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-').filter(Boolean).slice(0, 3).join('-').slice(0, 30);
    const name = await CG.promptDialog('Tên lệnh tắt (gõ /tên để dùng)', slug, 'vd: review-pr');
    if (!name) return;
    let r = await api.claudeSaveCommand(name, text);
    if (!r.ok && r.exists && (await CG.confirmDialog('Đã có lệnh này', `Lệnh /${name} đã tồn tại. Ghi đè bằng câu này?`, 'Ghi đè'))) r = await api.claudeSaveCommand(name, text, true);
    if (!r.ok) { if (!r.exists) CG.toast(r.error, true); return; }
    api.statsHabit('prompts', key, { mark: true });
    addXp(5);
    CG.toast(`Đã lưu /${r.name} (${r.path}). Phiên mới gõ /${r.name} là dùng được.`);
    if (CG.app.loadInfo && S().active) CG.app.loadInfo(S().active.cwd, true);
  }
  async function onPermAllow(conv, sugs) {
    if (!api.statsHabit) return;
    const rules = [];
    for (const s of sugs || []) if (s && s.type === 'addRules' && s.behavior !== 'deny') for (const r of s.rules || []) rules.push(r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName);
    if (!rules.length) return;
    const key = rules.join(' | ');
    const x = await api.statsHabit('perms', key);
    if (!x || x.n < 3 || x.done || (x.n > 3 && x.n % 3)) return;
    const add = async (cwd) => {
      const r = await api.claudeAddAllow(rules, cwd);
      if (!r.ok) return CG.toast(r.error, true);
      api.statsHabit('perms', key, { mark: true });
      CG.toast(`Đã thêm luật luôn cho phép vào ${r.path}`);
    };
    bubble([h('div', { text: `Bạn đã bấm “Cho phép” ${x.n} lần cho cùng một việc 🔁` }), h('div', { class: 'mb-sub', text: `${CG.suggestionLabel ? CG.suggestionLabel(sugs) : ''} — thêm luật để lần sau khỏi hỏi?` }), h('code', { class: 'mb-code', text: rules.join(', ') })],
      { ms: 45000, acts: [{ label: 'Luôn cho phép (dự án này)', p: 1, run: () => add(conv.cwd) }, { label: 'Mọi dự án', run: () => add(null) }, { label: 'Đừng hỏi lại', run: () => api.statsHabit('perms', key, { mark: true }) }] });
  }

  // =====================================================================
  // Lên cấp
  // =====================================================================
  function addXp(n) {
    const before = BK.levelOf(cfg().mascotXp + R.xpAdd).lv;
    R.xpAdd += n;
    const after = BK.levelOf(cfg().mascotXp + R.xpAdd).lv;
    if (after > before) levelUp(after);
    clearTimeout(R.xpTimer);
    R.xpTimer = setTimeout(flushXp, after > before ? 100 : 20000);
  }
  async function flushXp() { if (!R.xpAdd) return; const add = R.xpAdd; R.xpAdd = 0; await quietSave({ mascotXp: (cfg().mascotXp || 0) + add }); }
  function levelUp(lv) {
    const got = [...ACC.filter((a) => a.lv === lv).map((a) => a.name.toLowerCase()), ...COLORS.filter((c) => c.lv === lv).map((c) => `màu mắt ${c.name.toLowerCase()}`)];
    if (R.bot) { R.ov = { s: 'celebrate', until: Date.now() + 3000, why: `Lên cấp ${lv}!` }; R.bot.hop(); }
    if (R.fx && !reduced()) R.fx.once('confetti', 2600);
    beep('level');
    bubble([h('div', { text: `⭐ Lên cấp ${lv}!` }), got.length ? h('div', { class: 'mb-sub', text: 'Mở khoá: ' + got.join(', ') }) : null],
      { ms: 7000, acts: got.length ? [{ label: 'Xem', p: 1, run: panel }] : null });
  }

  // =====================================================================
  // Giờ giấc & sức khoẻ (tắt được trong Cài đặt): khuya, chào sáng, uống nước, Pomodoro
  // =====================================================================
  function careTick() {
    if (!R.bot) return;
    const c = cfg(), d = new Date(), hr = d.getHours(), nowMs = Date.now();
    // Pomodoro
    if (R.pomo && nowMs >= R.pomo.end) {
      if (R.pomo.phase === 'work') {
        R.pomo = { phase: 'break', start: nowMs, end: nowMs + 5 * MIN }; R.bot.hop(); beep('done');
        bubble('Hết 25 phút rồi! Đứng dậy vươn vai, nghỉ 5 phút nha 🙆', { ms: 60000, acts: [{ label: 'Nghỉ', p: 1 }, { label: 'Làm thêm 1 lượt', run: () => pomo(true) }] });
        petBubble({ id: 'pomo', kind: 'done', title: '🍅 Hết 25 phút', text: 'Nghỉ 5 phút nha', acts: [{ label: 'OK', p: 1 }] });
      } else {
        R.pomo = null; beep('ask');
        bubble('Hết giờ nghỉ, làm tiếp nào 💪', { ms: 60000, acts: [{ label: 'Lượt 25 phút mới', p: 1, run: () => pomo(true) }, { label: 'Thôi' }] });
      }
    }
    larkNudge();
    recapCheck();
    if (R.badgeQ.length && !bub && document.hasFocus()) showBadge(R.badgeQ.shift());
    if (c.mascotCare === false) { R.water = null; return; }
    // khuya: nhắc một lần mỗi đêm
    if (hr >= 23 && R.nightAsked !== nightKey() && document.hasFocus() && !bub) {
      R.nightAsked = nightKey();
      bubble(`Khuya rồi (${hm(d)}) 🌙 Mai làm tiếp nhé?`, { ms: 30000, acts: [{ label: 'Ừ, tí nữa' }, { label: 'Đừng nhắc đêm nay', run: () => { R.nightOff = nightKey(); } }] });
    }
    // sáng: chào lần đầu mở app trong ngày (6–9 giờ)
    if (hr >= 6 && hr < 9 && c.mascotMorning !== dayKey() && document.hasFocus() && nowMs - R.lastInput < MIN && !bub) {
      quietSave({ mascotMorning: dayKey() });
      const L = limits();
      R.sunUntil = nowMs + 6000;
      bubble([h('div', { text: 'Chào buổi sáng ☀' }), L.pw ? h('div', { class: 'mb-sub', text: `Giới hạn tuần đã dùng ${Math.round(L.pw)}%` }) : null], { ms: 6000 });
    }
    // làm liên tục 2 tiếng → uống nước, vươn vai
    // (đợi bóng nói khác đóng rồi mới nhắc, để không đè mất)
    if (!R.water && !bub && nowMs - R.activeSince >= 120 * MIN && nowMs - R.lastInput < 2 * MIN && !(R.waterSnooze > nowMs)) {
      R.water = { t: nowMs };
      const done = (snooze) => { R.water = null; if (snooze) R.waterSnooze = Date.now() + 30 * MIN; else { R.activeSince = Date.now(); R.ov = { s: 'love', until: Date.now() + 1500 }; } };
      bubble('Bạn làm 2 tiếng liền rồi đó 💧 Uống miếng nước, đứng dậy vươn vai nhé!', { ms: 10 * MIN, onClose: () => { if (R.water) done(true); },
        acts: [{ label: 'Đã uống ✓', p: 1, run: () => done(false) }, { label: 'Nhắc lại sau 30 phút', run: () => done(true) }] });
    }
  }
  function pomo(on) {
    if (on) { R.pomo = { phase: 'work', start: Date.now(), end: Date.now() + 25 * MIN }; bubble('🍅 Tập trung 25 phút nào. Thanh dưới mắt mình là thời gian còn lại.', { ms: 4000 }); }
    else { R.pomo = null; bubble('Đã dừng Pomodoro', { ms: 2000 }); }
  }

  // =====================================================================
  // Bóng nói cạnh robot (một cái một lúc)
  // =====================================================================
  let bub = null;
  function bubble(content, o = {}) {
    if (!R.wrap || cfg().mascot === 'off') return;
    closeBubble(true);
    const el = h('div', { class: 'mbub ' + (o.cls || '') });
    const body = h('div', {}); typeof content === 'string' ? (body.textContent = content) : body.append(...[].concat(content).filter(Boolean));
    el.append(body, h('span', { class: 'mb-x', text: '✕', onclick: () => closeBubble() }));
    if (o.acts && o.acts.length) el.append(h('div', { class: 'mb-acts' }, o.acts.map((a) => h('button', { class: a.p ? 'p' : '', text: a.label, onclick: () => { closeBubble(true); if (a.run) a.run(); } }))));
    document.body.append(el);
    bub = { el, onClose: o.onClose };
    placeBubble();
    requestAnimationFrame(() => el.classList.add('on'));
    if (o.ms) bub.timer = setTimeout(() => closeBubble(), o.ms);
  }
  function closeBubble(silent) {
    if (!bub) return;
    const b = bub; bub = null; clearTimeout(b.timer);
    b.el.classList.remove('on'); setTimeout(() => b.el.remove(), 250);
    if (!silent && b.onClose) b.onClose();
  }
  function placeBubble() {
    if (!bub || !R.wrap) return;
    const r = R.wrap.getBoundingClientRect(), el = bub.el;
    if (R.wrap.style.visibility === 'hidden' || !r.width) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = '';
    const bw = el.offsetWidth, bh = el.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
    const up = r.top > bh + 70;
    el.classList.toggle('up', up); el.classList.toggle('down', !up);
    el.style.left = x + 'px';
    el.style.top = (up ? r.top - bh - Math.max(14, r.height * .55) : r.bottom + 12) + 'px';
    el.style.setProperty('--tail', Math.max(10, Math.min(bw - 22, r.left + r.width / 2 - x - 6)) + 'px');
  }

  // =====================================================================
  // Vị trí
  // =====================================================================
  const ANCHORS = {
    corner: { label: 'Góc khung chat (trên ô nhập)', w: 78 },
    peek: { label: 'Ló đầu sau ô nhập', w: 74 },
    composer: { label: 'Trong ô nhập, cạnh nút gửi', w: 38, fixed: true },
    title: { label: 'Thanh tiêu đề', w: 32, fixed: true },
    sidebar: { label: 'Cuối thanh bên', w: 92 },
    details: { label: 'Bảng chi tiết', w: 110 },
    free: { label: 'Tự do (kéo đến đâu nằm đó)', w: 78 },
  };
  const vis = (el) => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
  function slots() {
    const sl = R.slots;
    if (!sl.title || !sl.title.isConnected) { sl.title = h('span', { class: 'mslot mslot-title' }); const t = $('#chat-title'); if (t) t.before(sl.title); }
    if (!sl.composer || !sl.composer.isConnected) { sl.composer = h('span', { class: 'mslot mslot-comp' }); const m = $('#ctl-model'); if (m) m.before(sl.composer); }
    if (!sl.sidebar || !sl.sidebar.isConnected) { sl.sidebar = h('div', { class: 'mslot mslot-side' }, h('div', { class: 'mslot-text' })); const f = $('.sb-foot'); if (f) f.before(sl.sidebar); }
    if (!sl.details || !sl.details.isConnected) { sl.details = h('div', { class: 'mslot mslot-det' }, h('div', { class: 'mslot-text' })); const d = $('#details'); if (d) d.prepend(sl.details); }
    return sl;
  }
  // chỗ đặt thực tế (vị trí đã chọn mà đang bị ẩn — vd thanh bên/bảng chi tiết đóng — thì về góc chat)
  function effAnchor() {
    const a = cfg().mascotPos in ANCHORS ? cfg().mascotPos : 'corner';
    if (a === 'sidebar' && !vis($('#sidebar'))) return 'corner';
    if (a === 'details' && !vis($('#details'))) return 'corner';
    if ((a === 'corner' || a === 'peek' || a === 'composer') && !vis($('#composer'))) return vis($('#details')) ? 'details' : 'title';
    return a;
  }
  function target(k) {
    const a = ANCHORS[k], size = +cfg().mascotSize || 1;
    let w = a.fixed ? a.w : a.w * size;
    // ô nhập hẹp (khung xem + bảng chi tiết cùng mở) → robot ở góc chat thu nhỏ để không che chữ
    if (k === 'corner' || k === 'peek') { const cw = $('#composer') ? $('#composer').offsetWidth : 999; if (cw < 520) w = Math.max(40, Math.min(w, cw * .14)); }
    const hh = w * .76;
    const r = (el) => el.getBoundingClientRect();
    const sl = slots();
    if (k === 'corner') { const cw = r(vis($('#lark-dock')) ? $('#lark-dock') : $('#composer')); return { x: cw.right - w - 6, y: cw.top - hh - 12, w }; }
    if (k === 'peek') { const cw = r(vis($('#lark-dock')) ? $('#lark-dock') : $('#composer')); return { x: cw.right - w - 70, y: cw.top - hh * .52, w, clip: cw.top }; }
    if (k === 'composer') { const s = r(sl.composer); return { x: s.left + (s.width - w) / 2, y: s.top + s.height / 2 - hh / 2, w }; }
    if (k === 'title') { const s = r(sl.title); return { x: s.left + (s.width - w) / 2, y: s.top + s.height / 2 - hh / 2, w }; }
    if (k === 'sidebar') { const s = r(sl.sidebar), f = r($('.sb-foot')); const bx = s.height > 4 ? s : { left: f.left, width: f.width, top: f.top - hh - 30 }; return { x: bx.left + bx.width / 2 - w / 2, y: bx.top + 8, w }; }
    if (k === 'details') { const s = r(sl.details), d = r($('#details')); const bx = s.height > 4 ? s : { left: d.left, width: d.width, top: d.top }; return { x: bx.left + bx.width / 2 - w / 2, y: bx.top + 10, w }; }
    const f = cfg().mascotFree || { fx: .7, fy: .6 };
    return { x: Math.max(0, Math.min(innerWidth - w, f.fx * innerWidth)), y: Math.max(30, Math.min(innerHeight - hh, f.fy * innerHeight)), w };
  }
  function relayout(animate) {
    if (!R.wrap) return;
    if (R.life) { lifeRelayout(); return; }
    const k = effAnchor();
    const sl = slots();
    const size = +cfg().mascotSize || 1;
    document.body.classList.toggle('m-at-title', k === 'title');
    document.body.classList.toggle('m-at-comp', k === 'composer');
    sl.sidebar.classList.toggle('on', k === 'sidebar'); sl.details.classList.toggle('on', k === 'details');
    sl.sidebar.style.height = k === 'sidebar' ? Math.round(ANCHORS.sidebar.w * size * .76 + 34) + 'px' : '';
    sl.details.style.height = k === 'details' ? Math.round(ANCHORS.details.w * size * .76 + 40) + 'px' : '';
    const t = target(k);
    const prevK = R.anchor; R.anchor = k;
    if (animate && prevK && prevK !== k && !reduced()) {
      const p = R.wrap.getBoundingClientRect(), dx = t.x - p.left, dy = t.y - p.top;
      R.bot.lookAt = { x: Math.sign(dx) * Math.min(1, Math.abs(dx) / 300), y: Math.sign(dy) * Math.min(1, Math.abs(dy) / 300) };
      R.wrap.classList.add('fly');
      setTimeout(() => { R.bot.lookAt = null; R.bot.hop(); R.wrap.classList.remove('fly'); }, 600);
    }
    // trang Lịch & hàng đợi che cả khung chính → robot chỉ còn hiện nếu đang ở thanh bên
    const covered = !!document.querySelector('#sched-page:not(.hidden)') && k !== 'sidebar';
    R.wrap.style.visibility = covered ? 'hidden' : '';
    R.bot.scale = t.w / BW;
    R.wrap.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) scale(${t.w / BW})`;
    // ló sau ô nhập: cắt phần thân nằm dưới mép trên ô nhập
    R.wrap.style.clipPath = t.clip ? `inset(-90px -90px ${Math.max(0, (t.y + t.w * .76 - t.clip) / (t.w / BW))}px -90px)` : '';
    R.wrap.classList.toggle('peek', !!t.clip);
    R.small = t.w < 50;
    updateText();
    placeFx(t, covered);
    placeBubble();
  }
  function updateText() {
    const sl = R.slots, txt = R.why.split('\n')[0];
    for (const k of ['sidebar', 'details']) { const el = sl[k] && sl[k].querySelector('.mslot-text'); if (el && el.textContent !== txt) el.textContent = R.anchor === k ? txt : ''; }
  }
  async function setPos(k, extra) {
    await CG.decor.save({ mascotPos: k, ...(extra || {}) });
    relayout(true);
  }
  // hạt ngày lễ (tuyết, pháo hoa…) trong một khung nhỏ quanh robot
  function placeFx(t, covered) {
    const ev = season(), want = !!(ev && ev.fx) && !reduced() && !R.small && !covered;
    if (!R.fx) { const cv = h('canvas', { class: 'mfx' }); document.body.append(cv); R.fx = new BK.Fx(cv); }
    const cv = R.fx.cv, w = t.w * 2.6, hh = t.w * 2.2;
    if (!want && R.fx.kind && R.fx.kind !== 'confetti') { R.fx.kind = null; }
    if (want && !R.fx.kind) R.fx.kind = ev.fx;
    cv.style.display = covered ? 'none' : '';
    Object.assign(cv.style, { left: Math.round(t.x + t.w / 2 - w / 2) + 'px', top: Math.round(t.y + t.w * .76 - hh * .8) + 'px', width: Math.round(w) + 'px', height: Math.round(hh) + 'px' });
    const W = Math.round(w), H = Math.round(hh); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  // ----- kéo thả: hiện các ô có thể đặt, thả gần ô nào thì hít vào ô đó; lắc mạnh thì say xe
  function startDrag(e) {
    if (e.button !== 0) return;
    const r0 = R.wrap.getBoundingClientRect();
    const d = { ox: e.clientX - r0.left, oy: e.clientY - r0.top, x0: e.clientX, y0: e.clientY, lx: e.clientX, moved: false, ghosts: null, dir: 0, flips: 0 };
    const sc = R.bot.scale;
    const move = (ev) => {
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
      if (!d.moved) { d.moved = true; R.wrap.classList.add('drag'); R.wrap.style.clipPath = ''; hideTip(); closeBubble(true); d.ghosts = showGhosts(); }
      const x = ev.clientX - d.ox, y = ev.clientY - d.oy, ds = Math.max(sc, ANCHORS.free.w / BW);
      R.wrap.style.transform = `translate(${x}px, ${y}px) scale(${ds})`;
      const vx = ev.clientX - d.lx; d.lx = ev.clientX;
      const sg = Math.sign(vx); if (Math.abs(vx) > 6 && sg && sg !== d.dir) { d.dir = sg; d.flips++; }
      R.bot.extraTilt = Math.max(-18, Math.min(18, -vx * 1.4)); R.bot.lookAt = { x: Math.max(-1, Math.min(1, vx / 8)), y: -.4 };
      let best = null, bd = 80;
      for (const g of d.ghosts) { const dd = Math.hypot(g.cx - (x + BW * ds / 2), g.cy - (y + BW * ds * .38)); g.el.classList.remove('near'); if (dd < bd) { bd = dd; best = g; } }
      if (best) best.el.classList.add('near');
      d.best = best; d.x = x; d.y = y; d.ds = ds;
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      R.wrap.classList.remove('drag'); R.bot.extraTilt = 0; R.bot.lookAt = null;
      if (d.ghosts) d.ghosts.forEach((g) => g.el.remove());
      if (!d.moved) return;
      R.dragged = Date.now();
      R.bot.hop();
      if (d.flips >= 6) { R.ov = { s: 'dizzy', until: Date.now() + 2800, why: 'Say xe rồi…' }; beep('dizzy'); setTimeout(() => bubble('Ối… chóng mặt quá 🌀', { ms: 2400 }), 650); }
      if (d.best) setPos(d.best.k);
      else setPos('free', { mascotFree: { fx: d.x / innerWidth, fy: d.y / innerHeight } });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  function showGhosts() {
    const out = [];
    for (const k of Object.keys(ANCHORS)) {
      if (k === 'free') continue;
      if (k === 'sidebar' && !vis($('#sidebar'))) continue;
      if (k === 'details' && !vis($('#details'))) continue;
      if ((k === 'corner' || k === 'peek' || k === 'composer') && !vis($('#composer'))) continue;
      const t = target(k), hh = t.w * .76;
      const el = h('div', { class: 'mghost' }, h('span', { text: ANCHORS[k].label }));
      Object.assign(el.style, { left: t.x - 6 + 'px', top: t.y - 6 + 'px', width: t.w + 12 + 'px', height: hh + 12 + 'px' });
      document.body.append(el);
      out.push({ k, el, cx: t.x + t.w / 2, cy: t.y + hh / 2 });
    }
    return out;
  }
  // ----- chú thích khi rê chuột + menu chuột phải + menu nhanh (bấm đúp)
  let tip = null;
  function showTip() {
    if (!R.why || bub) return;
    hideTip();
    const r = R.wrap.getBoundingClientRect();
    const [a, b] = R.why.split('\n');
    const w = walletLine();
    tip = h('div', { class: 'mtip' }, h('div', { text: a }), b ? h('div', { class: 'mtip-sub', text: b }) : null, w ? h('div', { class: 'mtip-sub mtip-w', text: '🪙 ' + w }) : null);
    document.body.append(tip);
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
    tip.style.top = (r.top > th + 16 ? r.top - th - 8 : r.bottom + 8) + 'px';
  }
  function hideTip() { if (tip) { tip.remove(); tip = null; } }
  function optionItems() {
    const c = cfg();
    return [
      { label: R.pomo ? 'Dừng Pomodoro' : 'Bắt đầu Pomodoro 25 phút', onClick: () => pomo(!R.pomo) },
      { label: 'Robot của tôi (cấp, phụ kiện)…', onClick: panel },
      '-',
      { label: 'Phản ứng theo nhạc', checked: c.mascotMusic !== false, onClick: () => CG.decor.save({ mascotMusic: c.mascotMusic === false }) },
      { label: 'Ra desktop khi thu nhỏ app', checked: c.mascotPet !== false, onClick: () => CG.decor.save({ mascotPet: c.mascotPet === false }) },
      { label: 'Nhắc nghỉ (khuya, uống nước)', checked: c.mascotCare !== false, onClick: () => CG.decor.save({ mascotCare: c.mascotCare === false }) },
      { label: 'Tiếng bíp', checked: !!c.mascotBeep, onClick: () => CG.decor.save({ mascotBeep: !c.mascotBeep }).then(() => beep('love')) },
      { label: 'Ẩn linh vật', onClick: () => { CG.decor.save({ mascot: 'off' }); CG.toast('Đã ẩn linh vật. Bật lại trong Cài đặt → Giao diện & trang trí.'); } },
    ];
  }
  function ctxMenu(e) {
    e.preventDefault(); hideTip();
    const c = cfg(), cur = c.mascotPos;
    CG.menu(CG.pointAnchor(e.clientX, e.clientY), [
      { header: 'Vị trí' },
      ...Object.entries(ANCHORS).filter(([k]) => k !== 'free').map(([k, a]) => ({ label: a.label, checked: cur === k, onClick: () => setPos(k) })),
      '-', { header: 'Cỡ' },
      ...[[.8, 'Nhỏ'], [1, 'Vừa'], [1.25, 'Lớn']].map(([v, n]) => ({ label: n, checked: (+c.mascotSize || 1) === v, onClick: () => CG.decor.save({ mascotSize: v }).then(() => relayout(true)) })),
      '-', ...optionItems(),
    ], { checks: true });
  }
  function quickMenu(e) {
    hideTip();
    const L = limits(), busy = convs().find((x) => x !== S().active && (x.busy || (x.perms && x.perms.size)));
    const x = e.clientX, y = e.clientY;
    CG.menu(CG.pointAnchor(x, y), [
      { label: `Giới hạn: 5 giờ ${Math.round(L.p5)}% · tuần ${Math.round(L.pw)}%`, desc: 'Bấm để xem chi tiết', onClick: () => CG.app.showUsageDialog && CG.app.showUsageDialog() },
      CG.usage ? { label: '🪙 ' + (walletLine() || 'Chi phí & token hôm nay'), desc: 'Quy đổi theo giá API — bấm để xem theo model / dự án / phiên', onClick: () => CG.usage.open(1) } : null,
      R.mail ? { label: `✉ Mở tin của ${R.mail.name} (${R.mail.n})`, onClick: () => CG.lark.openDock(R.mail.sid, R.mail.openId) } : null,
      CG.sched ? { label: 'Mở Lịch & hàng đợi', onClick: () => CG.sched.open() } : null,
      busy ? { label: `Tới phiên “${busy.title || 'đang chạy'}”`, desc: busy.perms && busy.perms.size ? 'Đang chờ bạn trả lời' : 'Đang chạy', onClick: () => CG.app.activate(busy) } : null,
      '-', ...optionItems().slice(0, 2),
      { label: 'Vị trí, cỡ & tuỳ chọn khác…', onClick: () => setTimeout(() => ctxMenu({ preventDefault() {}, clientX: x, clientY: y }), 30) },
    ]);
  }

  // =====================================================================
  // "Robot của tôi": cấp, phụ kiện, màu mắt
  // =====================================================================
  function panel() {
    const stage = h('div', { class: 'mp-stage' });
    const info = h('div', {}), right = h('div', {});
    const box = h('div', { class: 'mpanel' }, h('div', {}, stage, info), right);
    const m = CG.modal('Robot của tôi', box, [h('button', { class: 'btn primary', text: 'Xong', onclick: () => m.close() })], { cls: 'm-wide' });
    const host = h('div', {}); stage.prepend(host);
    const b = createBot(host, 130);
    const draw = () => {
      const c = cfg(), L = BK.levelOf(c.mascotXp + R.xpAdd), ev = season();
      dressBot(b, null); b.state(ev ? 'costume' : 'idle');
      info.innerHTML = '';
      stage.querySelectorAll('.mp-lv, .mp-xp, .mp-bar').forEach((x) => x.remove());
      stage.append(h('div', { class: 'mp-lv', text: `Cấp ${L.lv}` }), h('div', { class: 'mp-xp', text: `${L.cur} / ${L.need} XP` }), h('div', { class: 'mp-bar' }, h('i', { style: { width: Math.round(L.cur / L.need * 100) + '%' } })));
      right.innerHTML = '';
      const wear = new Set(c.mascotWear || []);
      right.append(h('h4', { text: 'Phụ kiện' }), h('div', { class: 'mp-grid' }, ACC.map((a) => {
        const lock = a.lv > L.lv;
        return h('button', { class: wear.has(a.id) && !lock ? 'on' : '', disabled: lock, onclick: async () => { wear.has(a.id) ? wear.delete(a.id) : wear.add(a.id); await quietSave({ mascotWear: [...wear] }); draw(); } },
          a.name, h('small', { text: lock ? `mở ở cấp ${a.lv}` : wear.has(a.id) ? 'đang đeo' : 'bấm để đeo' }));
      })));
      right.append(h('h4', { text: 'Màu mắt' }), h('div', { class: 'mp-grid' }, COLORS.map((col) => {
        const lock = col.lv > L.lv, on = colorOf().id === col.id;
        return h('button', { class: on ? 'on' : '', disabled: lock, onclick: async () => { await quietSave({ mascotColor: col.id }); draw(); } },
          col.name, h('small', { text: lock ? `mở ở cấp ${col.lv}` : on ? 'đang dùng' : '●', style: !lock && col.c ? { color: `rgb(${col.c})` } : {} }));
      })));
      const got = c.mascotBadges || {};
      right.append(h('h4', { text: `Huy hiệu (${Object.keys(got).filter((k) => BADGES.some((x) => x.id === k)).length}/${BADGES.length})` }), h('div', { class: 'mp-badges' }, BADGES.map((x) => h('div', { class: 'mp-badge' + (got[x.id] ? ' on' : ''), title: x.desc + (got[x.id] ? ` · đạt ${new Date(got[x.id]).toLocaleDateString('vi-VN')}` : '') },
        h('span', { class: 'mp-bi', text: x.icon }), h('span', { class: 'mp-bn', text: x.name }), h('small', { text: got[x.id] ? new Date(got[x.id]).toLocaleDateString('vi-VN') : x.desc })))));
      if (lifeOn()) lifePanel(right, draw, b, host);
      right.append(h('div', { class: 'mp-note', text: `Lên cấp nhờ dùng app: +1 XP mỗi lượt xong, +6 lượt dài, +10 test pass, +20 lịch chạy xong, +30 mỗi huy hiệu. ${ev ? `Hôm nay là ${ev.name}: robot đang mặc đồ lễ, phụ kiện tạm cất tới hết ngày.` : 'Ngày lễ robot tự mặc đồ lễ (đè lên phụ kiện) tới hết ngày.'} Màu cảnh báo giới hạn luôn ưu tiên hơn màu tự chọn.` }));
    };
    draw();
  }

  // =====================================================================
  // Nuôi robot (petlife.js) — bật trong Cài đặt. Robot đi lại trên mép ô nhập, ngồi trên phiên ★, nhảy lên
  // phiên khác đang chờ, đứng lên thẻ xin quyền / câu hỏi, mang thư Lark tới gõ cửa, đi theo chữ khi Claude trả lời,
  // ăn ⚡ hạt năng lượng khi xong lượt, bắt bọ khi test fail… Rời app (thu nhỏ / sang cửa sổ khác) thì nhảy ra desktop.
  // =====================================================================
  const PL = window.PetLife;
  const lifeOn = () => { const c = cfg(); return !!(PL && R.bot !== undefined && c.mascot !== 'off' && c.mascotLife && !reduced()); };
  const kitCfg = () => PL.kitOf(cfg().mascotKit);
  function curForm() { const id = cfg().mascotForm || R.autoForm || 'base'; return PL.FORMS.find((f) => f.id === id) || PL.FORMS[0]; }
  const DECO = [['bed', '🛏️', 'Giường', 1], ['lamp', '🪔', 'Đèn đọc', 3], ['kb', '⌨️', 'Bàn phím mini', 5], ['plant', '🪴', 'Cây cảnh', 7], ['tv', '🖼️', 'Tranh treo', 9], ['cat', '🐈', 'Mèo con', 12]];
  const decoCfg = () => cfg().mascotDeco || ['bed', 'lamp', 'kb', 'plant'];
  Object.assign(R, { life: null, isOut: false, lifeHidden: false, alertDone: new Set(), alertStart: {}, lifeQ: [], lifeSeq: 0, lastKey: 0, lastWheel: 0, nSaved: Date.now(), autoForm: '', lifeDay: { k: '', beads: 0, bugs: 0, perch: 0 } });
  const lday = () => { const k = dayKey(); if (R.lifeDay.k !== k) R.lifeDay = { k, beads: 0, bugs: 0, perch: 0 }; return R.lifeDay; };
  // sàn chính = mép trên của khối nằm trên cùng ở chân khung chat (thanh tác vụ / khung Lark / ô nhập)
  function floorEl() { for (const s of ['#tasks-bar', '#child-bar', '#lark-dock', '#composer']) { const e = $(s); if (vis(e)) return e; } return null; }
  function permCardEl() {
    const c = S().active; if (!c || !c.perms || !c.perms.size) return null;
    const card = [...c.perms.values()].pop(), el = card && card.el;
    return el && el.isConnected && vis(el) ? el : null;
  }
  let platC = null, platT = 0;
  function appPlats() {
    const t = performance.now(); if (platC && t - platT < 25) return platC;
    const out = [], fl = floorEl(), cc = $('#chat-col');
    if (fl && cc) { const f = fl.getBoundingClientRect(), c = cc.getBoundingClientRect(); out.push({ y: f.top, x1: c.left, x2: c.right, el: fl, main: 1 }); }
    const sl = $('#session-list');
    if (vis(sl) && vis($('#sidebar'))) {
      const sr = sl.getBoundingClientRect();
      for (const el of sl.querySelectorAll('.sess.starred, .sess.m-wait')) { const q = el.getBoundingClientRect(); if (q.height && q.top > sr.top + 2 && q.bottom < sr.bottom - 2) out.push({ y: q.top, x1: q.left, x2: q.right, el, row: el.dataset.sid }); }
    }
    const pc = permCardEl(), sc = $('#scroller');
    if (pc && sc) { const q = pc.getBoundingClientRect(), r = sc.getBoundingClientRect(); if (q.top > r.top + 50 && q.top < r.bottom - 40) out.push({ y: q.top, x1: q.left, x2: Math.min(q.right, q.left + 560), el: pc }); }
    platC = out; platT = t; return out;
  }
  const QSIGN = '<g class="mcs-bob"><g transform="translate(214 -30) rotate(8)"><rect x="38" y="84" width="10" height="96" rx="3" fill="#a5794a"/><rect width="86" height="88" rx="14" fill="#5ab0ff" stroke="#2f7fd6" stroke-width="5"/><text x="43" y="68" text-anchor="middle" font-size="66" font-weight="900" fill="#fff" font-family="Segoe UI, sans-serif">?</text></g></g><circle cx="258" cy="150" r="13" fill="#2b313c" stroke="#454d5c" stroke-width="2"/>';
  // việc cần báo trong app → robot tự tới đúng chỗ
  function appAlert() {
    const c = S().active, nowMs = Date.now();
    if (cfg().mascotDnd) return null;
    if (R.summon && nowMs < R.summon.until) return R.summon;
    const fresh = (key, ms) => { if (R.alertDone.has(key)) return false; const t0 = R.alertStart[key] || (R.alertStart[key] = nowMs); if (nowMs - t0 > ms) { R.alertDone.add(key); return false; } return true; };
    if (c && c.perms && c.perms.size) {
      const [reqId, card] = [...c.perms.entries()].pop(), q = card && card.tool === 'AskUserQuestion';
      return { key: 'perm:' + c.key + ':' + reqId, face: 'permission', prop: q ? QSIGN : 'sign', dest: () => { const el = permCardEl(); return el ? appPlats().find((p) => p.el === el) || null : null; } };
    }
    const other = convs().find((x) => x !== c && x.perms && x.perms.size);
    if (other) {
      const key = 'call:' + other.sid + ':' + other.perms.size;
      if (fresh(key, 30000)) return { key, face: 'call', prop: 'sign', dest: () => appPlats().find((p) => p.row === other.sid) || null, onClick: () => CG.app.activate && CG.app.activate(other) };
    }
    const m = R.mail;
    if (m && CG.lark && CG.lark.openDock) {
      const key = 'mail:' + m.sid + ':' + m.openId + ':' + m.n;
      if (fresh(key, 25000)) return { key, face: 'mail', prop: 'mail', knock: true,
        tx: () => { const p = appPlats().find((x) => x.main); return p && R.life ? p.x2 - R.life.PW - 14 : null; },
        onClick: () => { R.alertDone.add(key); CG.lark.openDock(m.sid, m.openId); },
        onArrive: () => bubble(`✉ ${m.name} nhắn ${m.n} tin${m.title ? ` · “${m.title}”` : ''}`, { ms: 12000, acts: [{ label: 'Mở khung chat', p: 1, run: () => { R.alertDone.add(key); CG.lark.openDock(m.sid, m.openId); } }, { label: 'Để sau', run: () => R.alertDone.add(key) }] }) };
    }
    return null;
  }
  // chữ Claude đang trả lời: toạ độ x của cuối dòng cuối (robot đi theo); 'below' nếu bạn đang cuộn lên đọc
  function followX() {
    const c = S().active; if (!c || !c.busy || c.phase !== 'talk') return null;
    const sc = $('#scroller'); if (!sc) return null;
    if (sc.scrollTop + sc.clientHeight < sc.scrollHeight - 60) return 'below';
    const els = [...document.querySelectorAll('#conversations .md.streaming')].filter(vis); const el = els.pop(); if (!el) return null;
    let n = el; while (n && n.lastChild) n = n.lastChild;
    if (!n || n.nodeType !== 3 || !n.length) return null;
    const rg = document.createRange(); rg.setStart(n, Math.max(0, n.length - 1)); rg.setEnd(n, n.length);
    const r = rg.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    return r.width || r.height ? (r.bottom > sr.top && r.top < sr.bottom ? r.right : 'below') : null;
  }
  const AppWorld = {
    layer: document.body,
    size: () => Math.round(54 * (+cfg().mascotSize || 1)),
    compact: () => !cfg().mascotLifeBodyApp,
    plats: appPlats,
    bounds: () => ({ l: 0, r: innerWidth }),
    walk: () => { const cc = $('#chat-col'); if (!cc) return { l: 0, r: innerWidth }; const r = cc.getBoundingClientRect(); return { l: r.left + 8, r: r.right - 8 }; },
    home: (k) => (k === 'sleep' ? AppWorld.walk().l + 2 : null),
    ext: () => {
      const c = S().active, s = R.s;
      const work = !!(c && c.busy) && ['reading', 'writing', 'web', 'agents', 'thinking', 'bash', 'talking', 'compact'].includes(s);
      return { face: s, prop: PROP_OF[s] || null, work, sleep: s === 'sleep', out: R.out, cd: R.bot && R.bot.cdEnd };
    },
    busy: () => Date.now() - R.lastKey < 2500 || Date.now() - R.lastWheel < 3000,
    typing: () => { const i = $('#input'); if (!i || document.activeElement !== i || Date.now() - R.lastKey > 3000) return null; const r = i.getBoundingClientRect(); return r.left + Math.min(r.width - 10, 16 + (i.value.split('\n').pop() || '').length * 7); },
    follow: followX,
    perches: () => appPlats().filter((p) => p.row && p.el.classList.contains('starred')),
    dropTop: () => { const p = appPlats().find((x) => x.main); return p ? p.y - 260 : 0; },
    dnd: () => !!cfg().mascotDnd,
    say: (t, ms) => { if (!bub && document.hasFocus()) bubble(t, { ms }); },
    dress: (prop) => dressBot(R.bot, prop),
    xp: (n) => addXp(n),
    diary: (t) => addDiary(t),
    minis: true,
    bagExtra: () => [{ ic: '⋯', name: 'Menu robot', lv: 1, run: () => { const r = R.wrap.getBoundingClientRect(); quickMenu({ clientX: r.left + r.width / 2, clientY: r.top }); } }, { ic: '🏠', name: 'Robot của tôi', lv: 1, run: panel }],
    onClickBot: () => {
      if (followX() === 'below') { const sc = $('#scroller'); sc.scrollTop = sc.scrollHeight; R.bot.hop(); return true; }
      if (R.s === 'mail' && R.mail && CG.lark && CG.lark.openDock) { CG.lark.openDock(R.mail.sid, R.mail.openId); return true; }
      return false;
    },
    onGrab: () => closeBubble(true),
    onPerch: (g) => { if (g.el.classList.contains('starred')) lday().perch++; },
    onEat: (k) => { if (k === 'bead') lday().beads++; },
    onBug: () => { lday().bugs++; },
  };
  // bật / tắt bộ máy sống theo cài đặt
  function lifeApply() {
    const c = cfg(), want = lifeOn() && c.mascotLifeApp !== false && !!R.wrap;
    if (want && !R.life) {
      R.life = new PL.Life(AppWorld, R.wrap, R.bot);
      R.wrap.classList.add('m-life');
      const n = c.mascotN; R.life.N = PL.settle(n, n && n.t);
      const p = appPlats().find((x) => x.main);
      if (p) R.life.spawn(p.x2 - 140, p.y - 120); else R.life.spawn(innerWidth - 200, innerHeight - 200);
      R.wrap.style.clipPath = ''; R.wrap.classList.remove('peek', 'fly');
      refreshForm();
    } else if (!want && R.life) lifeStop(true);
    if (R.life) { R.life.setKit(kitCfg()); R.life.lv = BK.levelOf(c.mascotXp + R.xpAdd).lv; }
    if (R.bot) dressBot(R.bot, R.life ? R.life.prop || null : R.prop);
  }
  function lifeStop(keepWrap) {
    if (!R.life) return;
    lifeSaveN(true);
    R.life.destroy(); R.life = null; R.anchor = '';
    if (R.wrap) { R.wrap.classList.remove('m-life'); R.wrap.style.visibility = ''; }
    document.body.classList.remove('pl-away');
    if (keepWrap && R.bot) R.bot.extraTilt = 0;
  }
  function lifeSaveN(now) { if (!R.life || (!now && Date.now() - R.nSaved < 120000)) return; R.nSaved = Date.now(); quietSave({ mascotN: { ...R.life.N, t: Date.now() } }); }
  // robot đang ra desktop? (khớp với main.js: thu nhỏ / ẩn, hoặc sang cửa sổ khác)
  function outWanted() { const c = cfg(); return lifeOn() && c.mascotPet !== false && c.mascotLifeDesk !== false && (document.hidden || (c.mascotLifeOut !== false && !document.hasFocus())); }
  function lifeSync() {
    if (!R.life) return;
    const L = R.life, c = cfg();
    if (c.mascotNeeds === false) L.N = { no: 100, nl: 100, vui: 100, sach: 100 };
    L.lv = BK.levelOf(c.mascotXp + R.xpAdd).lv;
    const out = outWanted();
    if (out !== R.isOut) {
      R.isOut = out;
      if (out) { R.spawn = { x: window.screenX + L.st.x + L.PW / 2, y: window.screenY + L.bottom(), t: Date.now() }; closeBubble(true); L.closeBag(); }
      else {
        // quay lại app: nhảy từ mép dưới cửa sổ lên mép ô nhập
        const m = L.mainP();
        if (m) { L.st.y = innerHeight - L.TH * .4; L.st.ground = null; L.st.x = Math.max(m.x1, Math.min(m.x2 - L.PW, L.st.x)); L.jumpTo({ ...m, tx: L.st.x }); }
      }
    }
    if (!out) L.setAlert(appAlert());
    // khách chờ Claude làm lâu (> 3 phút) mà bạn đang rảnh → lôi bóng ra rủ chơi (mỗi lượt một lần)
    const a = S().active;
    if (!out && a && a.busy && a.turnStart && Date.now() - a.turnStart > 3 * MIN && Date.now() - R.lastInput > 60e3 && R.ballTurn !== a.turnStart && document.hasFocus()) {
      R.ballTurn = a.turnStart; L.throwBall(); bubble('Claude làm lâu ghê… chơi bóng với mình không ⚽ Bấm vào bóng để sút!', { ms: 7000 });
    }
    lifeSaveN();
    if (Date.now() - (R.formT || 0) > 10 * MIN) refreshForm();
  }
  function lifeRelayout() {
    document.body.classList.remove('m-at-title', 'm-at-comp');
    const sl = slots(); sl.sidebar.classList.remove('on'); sl.details.classList.remove('on'); sl.sidebar.style.height = ''; sl.details.style.height = '';
    R.anchor = 'life'; R.small = false;
    const covered = !!document.querySelector('#sched-page:not(.hidden)') || !floorEl();
    R.lifeHidden = covered;
    R.wrap.style.visibility = covered || R.isOut ? 'hidden' : '';
    document.body.classList.toggle('pl-away', covered || R.isOut); // robot mini, bóng, đồ ăn… ẩn theo robot chính
    R.wrap.style.clipPath = ''; R.wrap.classList.remove('peek');
    updateText(); placeBubble();
  }
  // sự kiện → robot trong app xử lý ngay; đang ở ngoài desktop thì để hàng đợi cho pet.js
  function lifeEv(kind) {
    if (!lifeOn()) return;
    const e = { id: ++R.lifeSeq, kind, t: Date.now() };
    if (R.life && !R.isOut && !R.lifeHidden) { e.h = 1; R.life.event(kind); }
    R.lifeQ = R.lifeQ.filter((x) => Date.now() - x.t < 30000).concat(e);
  }
  function lifePet() {
    const c = cfg();
    if (!lifeOn() || c.mascotLifeDesk === false) return null;
    const N = R.life ? R.life.N : PL.settle(c.mascotN, c.mascotN && c.mascotN.t);
    return { N, needs: c.mascotNeeds !== false, kit: kitCfg(), form: curForm().id, lv: BK.levelOf(c.mascotXp + R.xpAdd).lv, dnd: !!c.mascotDnd, deco: decoCfg(), outBlur: c.mascotLifeOut !== false,
      q: R.lifeQ.filter((x) => !x.h && Date.now() - x.t < 30000).map((x) => ({ id: x.id, kind: x.kind })), spawn: R.spawn || null, size: 84 };
  }
  function lifeFromPet(x) {
    if (x.N && R.life) R.life.N = { ...R.life.N, ...x.N };
    if (x.xp) addXp(x.xp);
    if (x.diary) addDiary(x.diary);
    if (x.eat === 'bead') lday().beads++;
    if (x.bug) lday().bugs++;
    if (x.N && !R.life) quietSave({ mascotN: { ...x.N, t: Date.now() } });
  }
  async function addDiary(t) {
    const d = new Date(), stamp = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm(d)}`;
    await quietSave({ mascotDiary: [...(cfg().mascotDiary || []), [stamp, String(t).slice(0, 200)]].slice(-60) });
  }
  function lifeDiaryLine(f) {
    const d = lday(), bits = [];
    if (f.turns) bits.push(`bạn chạy ${f.turns} lượt`);
    if (f.commits) bits.push(`${f.commits} commit`);
    const me = [d.beads ? `ăn ${d.beads} hạt năng lượng` : '', d.bugs ? `bắt ${d.bugs} con bọ` : '', d.perch ? `ngồi trên phiên ★ ${d.perch} lần` : ''].filter(Boolean);
    const hr = new Date().getHours();
    return `Hôm nay ${bits.join(', ') || 'mình ngồi chơi'}.${me.length ? ' Mình ' + me.join(', ') + '.' : ''} ${hr >= 22 ? 'Khuya rồi, đi ngủ thôi 🌙' : 'Mai gặp lại nha!'}`;
  }
  // Ctrl+Shift+P: gọi robot chạy tới con trỏ, mở menu nhanh
  function lifeSummon() {
    if (!R.life) return;
    R.summon = { key: 'summon:' + Date.now(), cursor: true, face: 'call', prop: 'wave', until: Date.now() + 12000,
      onArrive: () => { const r = R.wrap.getBoundingClientRect(); quickMenu({ clientX: r.left + r.width / 2, clientY: r.top }); R.summon.until = Date.now() + 1200; } };
    R.life.setAlert(R.summon);
  }
  // dạng tiến hoá tự động: dạng cao nhất đã đạt theo số liệu dùng
  async function refreshForm() {
    R.formT = Date.now();
    try { const st = api.statsGet ? await api.statsGet() : null; R.formProg = PL.formProgress(st, BK.levelOf(cfg().mascotXp + R.xpAdd).lv); const f = PL.bestForm(R.formProg); if (f !== R.autoForm) { R.autoForm = f; if (R.bot) dressBot(R.bot, R.life ? R.life.prop || null : R.prop); } } catch {}
  }
  // các mục nuôi robot trong bảng "Robot của tôi"
  function lifePanel(right, draw, pb, phost) {
    const c = cfg(), L = R.life, N = L ? L.N : PL.settle(c.mascotN, c.mascotN && c.mascotN.t), lv = BK.levelOf(c.mascotXp + R.xpAdd).lv;
    // xem thử thân hình trên robot trong bảng
    let rig = phost.querySelector('.pl-rig');
    if (!rig) { rig = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); rig.setAttribute('class', 'pl-rig'); phost.append(rig); pb.el.style.zIndex = 1; }
    const pr = PL.makeRig(rig), w = phost.offsetWidth || 130; pr.build(kitCfg(), w, false); rig.style.top = (w * .76 - 2) + 'px'; pr.pose({ ph: 0, t: 0, walking: false, arms: 'idle' });
    phost.style.marginBottom = (rig.getBoundingClientRect().height || 60) + 'px';
    right.append(h('h4', { text: 'Chăm sóc' }), h('div', { class: 'pl-needs' }, PL.NEEDS.map(([k, ic, name, col]) => h('div', { class: 'pl-need' }, h('span', { text: ic }), h('span', { text: name }),
      h('div', { class: 'pl-bar' }, h('i', { style: { width: Math.round(N[k]) + '%', background: N[k] < 25 ? '#ff5a5f' : col } })), h('small', { text: String(Math.round(N[k])) })))));
    const act = (label, fn) => h('button', { class: 'btn sm', text: label, disabled: !L, onclick: () => { fn(); setTimeout(draw, 300); } });
    right.append(h('div', { class: 'pl-acts' }, act('🍙 Cho ăn', () => L.drop('rice')), act('🧼 Tắm', () => L.bath()), act('💤 Đi ngủ', () => L.sleep()), act('⚽ Ném bóng', () => L.throwBall()), act('🎮 Bắt bọ 30 giây', () => L.startGame())),
      h('div', { class: 'mp-note', text: L ? 'Không chết, không phạt: đói / bẩn chỉ ỉu xìu và hiện icon nhỏ trên đầu. Xong lượt rơi ⚡ hạt năng lượng, commit thêm hạt, test fail có bọ để bắt.' : 'Bật "Đi lại trong app" trong Cài đặt để chăm robot ở đây.' }));
    // thân hình
    const kit = kitCfg(), setKit = async (k) => { await quietSave({ mascotKit: { ...kit, ...k } }); if (R.life) R.life.setKit(kitCfg()); dressBot(R.bot, R.life ? R.life.prop || null : R.prop); draw(); };
    right.append(h('h4', { text: 'Thân hình (ra desktop thì bung thân, tay, chân)' }),
      h('div', { class: 'mp-grid' }, PL.PRESETS.map((p) => h('button', { class: p.head === kit.head && p.body === kit.body && p.legs === kit.legs ? 'on' : '', onclick: () => setKit({ head: p.head, body: p.body, legs: p.legs }) }, `${p.ic} ${p.name}`))),
      ...[['head', 'Đầu', PL.HEADS], ['body', 'Thân + tay', PL.BODY], ['legs', 'Chân', PL.LEGS]].map(([k, name, list]) => h('div', { class: 'pl-kitrow' }, h('span', { text: name }),
        ...Object.entries(list).map(([id, o]) => h('button', { class: 'pl-chip' + (kit[k] === id ? ' on' : ''), text: o.name, onclick: () => setKit({ [k]: id }) })))));
    // tiến hoá
    const prog = R.formProg || {}, cur = c.mascotForm || '';
    right.append(h('h4', { text: 'Tiến hoá (theo thói quen của bạn)' }), h('div', { class: 'pl-forms' },
      h('button', { class: 'pl-form' + (!cur ? ' on' : ''), onclick: async () => { await quietSave({ mascotForm: '' }); dressBot(R.bot, R.life ? R.life.prop || null : R.prop); draw(); } }, h('b', { text: '✨ Tự động' }), h('small', { text: `Mặc dạng cao nhất đã đạt (${(PL.FORMS.find((f) => f.id === (R.autoForm || 'base')) || PL.FORMS[0]).name})` })),
      ...PL.FORMS.map((f) => { const pg = f.id === 'base' ? 1 : prog[f.id] || 0, lock = pg < 1;
        return h('button', { class: 'pl-form' + (cur === f.id ? ' on' : ''), disabled: lock, title: lock ? 'Chưa đạt: ' + f.cond : '', onclick: async () => { await quietSave({ mascotForm: f.id }); dressBot(R.bot, R.life ? R.life.prop || null : R.prop); draw(); } },
          h('b', { text: `${f.ic} ${f.name}` }), h('small', { text: `${f.cond} · ${Math.round(pg * 100)}%` }), h('i', { class: 'pl-pg' }, h('i', { style: { width: Math.round(pg * 100) + '%' } }))); })));
    // nhà ngoài desktop
    const on = new Set(decoCfg());
    right.append(h('h4', { text: 'Nhà ngoài desktop (cạnh taskbar)' }), h('div', { class: 'mp-grid' }, DECO.map(([k, ic, name, need]) => {
      const lock = need > lv;
      return h('button', { class: on.has(k) && !lock ? 'on' : '', disabled: lock, onclick: async () => { on.has(k) ? on.delete(k) : on.add(k); await quietSave({ mascotDeco: [...on] }); draw(); } }, `${ic} ${name}`, h('small', { text: lock ? `mở ở cấp ${need}` : on.has(k) ? 'đang bày' : 'cất' }));
    })));
    // nhật ký
    const di = (c.mascotDiary || []).slice(-8).reverse();
    right.append(h('h4', { text: 'Nhật ký robot' }), di.length ? h('div', { class: 'pl-diary' }, di.map(([d, t]) => h('div', {}, h('span', { text: t }), h('small', { text: d })))) : h('div', { class: 'mp-note', text: 'Chưa có dòng nào — robot tự ghi khi có chuyện đáng nhớ (lên cấp, tổng kết ngày, mang thư…).' }));
  }

  // =====================================================================
  // Robot ngoài desktop (cửa sổ riêng do main.js quản lý)
  // =====================================================================
  // bóng nói cho robot ngoài desktop: việc cần bạn trả lời (lấy từ thẻ xin quyền/câu hỏi) hoặc báo xong/lỗi
  function petBubble(b) { R.petBub = b ? { ...b, at: Date.now() } : null; }
  function permQuick() {
    for (const c of convs()) {
      if (!c.perms || !c.perms.size) continue;
      const [reqId, card] = [...c.perms.entries()][0];
      const q = card.quick || { title: 'Claude cần bạn xác nhận', acts: [] };
      return { id: 'perm-' + c.key + '-' + reqId, kind: 'ask', title: q.title, text: q.detail || '', sub: c.title || '', conv: c, acts: [...q.acts.map((a) => ({ label: a.label, p: a.p, run: a.run })), { label: 'Mở app', open: true }] };
    }
    return null;
  }
  function petSync() {
    if (!api.petState) return;
    const c = cfg();
    const on = c.mascot !== 'off' && c.mascotPet !== false && !!R.bot;
    if (on && document.hidden) derive(); // cửa sổ chính ẩn: decor.js không gọi sync → tự cập nhật
    let b = on ? permQuick() : null;
    if (!b && R.petBub && Date.now() - R.petBub.at < 30 * MIN) b = R.petBub;
    const st = !on ? null : b && b.kind === 'ask' ? 'permission' : b && b.kind === 'done' && Date.now() - b.at < 6000 ? 'celebrate' : b && b.kind === 'err' && Date.now() - b.at < 8000 ? 'error' : R.s;
    R.petActs = new Map();
    const bubble2 = b ? { id: b.id, kind: b.kind, title: b.title, text: b.text, sub: b.sub, acts: (b.acts || []).map((a, i) => { R.petActs.set(b.id + ':' + i, { a, b }); return { label: a.label, p: !!a.p }; }) } : null;
    const msg = on ? { on, s: st, why: R.why.split('\n')[0], ev: season() ? season().id : null, wear: wearOf(), color: colorOf().id, prop: PROP_OF[st] || null, pv: R.bot.pv || null, tint: R.bot.tintKind, bar: R.bot.bar, bubble: bubble2, life: lifePet() } : { on: false };
    const js = JSON.stringify(msg);
    if (js !== R.lastPet) { R.lastPet = js; api.petState(msg); }
  }
  if (api.onPetAction) api.onPetAction((x) => {
    if (x.life) { lifeFromPet(x.life); return; }
    if (x.dismiss) { if (R.petBub && R.petBub.id === x.id) R.petBub = null; return; }
    const it = R.petActs.get(x.id + ':' + x.i);
    if (!it) { if (x.open) api.showWindow(); return; }
    const { a, b } = it;
    if (a.run) a.run();
    if (a.open) { api.showWindow(); if (b.conv && b.conv !== S().active && CG.app.activate) CG.app.activate(b.conv); }
    if (R.petBub && R.petBub.id === b.id) R.petBub = null;
    petSync();
  });
  window.addEventListener('focus', () => { if (R.petBub && R.petBub.kind !== 'ask') R.petBub = null; });
  // nuôi robot: rời app → báo ngay chỗ robot đang đứng để robot ngoài desktop nhảy ra đúng chỗ đó
  window.addEventListener('blur', () => { if (R.life) { lifeSync(); relayout(); petSync(); } });
  window.addEventListener('focus', () => { if (R.life) { lifeSync(); relayout(); } });

  // =====================================================================
  // Vòng lặp vẽ (~30 khung/giây, dừng khi cửa sổ ẩn; Giảm hiệu ứng → đứng yên, cập nhật chậm)
  // =====================================================================
  // robot phụ (hộp "Có gì mới", khung hướng dẫn, bảng Robot của tôi) dùng chung bộ vẽ
  const extras = new Set();
  function createBot(parent, w) {
    parent.classList.add('mbot-host');
    Object.assign(parent.style, { width: w + 'px', height: Math.round(w * .76) + 'px' });
    const b = new Bot(parent);
    b.scale = w / BW;
    dressBot(b, null);
    extras.add(b);
    ensureLoop();
    return b;
  }
  function dropBot(b) { extras.delete(b); }
  function keepBot(b) { extras.add(b); ensureLoop(); }
  function ensureLoop() { if (!R.raf) { R.last = now(); R.raf = requestAnimationFrame(loop); } }
  function loop() {
    R.raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    for (const b of extras) if (!b.el.isConnected) extras.delete(b);
    if (!R.bot && !extras.size) { cancelAnimationFrame(R.raf); R.raf = 0; return; }
    const t = now();
    const rm = reduced(), minDt = rm ? .25 : 1 / 30;
    if (t - R.last < minDt) return;
    const dt = Math.min(.1, t - R.last); R.last = t;
    if (M.on) M.env = Math.max(M.raw, M.env * .82);
    if (R.life && !R.isOut && !R.lifeHidden) {
      R.life.tick(dt);
      const L = R.life; R.bot.scale = L.PW / BW;
      placeFx({ x: L.st.x, y: L.st.y, w: L.PW }, false);
    } else if (R.life && R.fx) R.fx.cv.style.display = 'none';
    if (R.bot) R.bot.tick(t, dt, rm);
    for (const b of extras) b.tick(t, dt, rm);
    if (R.fx && R.wrap) R.fx.step(dt, performance.now());
    if (bub) placeBubble();
    if (R.bot && M.on && !rm && Math.random() < dt * (M.mood === 'edm' ? 1.4 : .7)) note();
  }
  function note() {
    const r = R.wrap.getBoundingClientRect(); if (r.width < 30) return;
    const n = h('div', { class: 'mnote', text: '♪♫♩♬'[Math.floor(Math.random() * 4)] });
    const left = Math.random() < .5, sc = r.width / 240;
    n.style.fontSize = Math.max(11, 22 * sc) + 'px'; n.style.left = (left ? r.left - 8 : r.right) + 'px'; n.style.top = (r.top + r.height * .4) + 'px';
    n.style.setProperty('--mc', R.bot.el.style.getPropertyValue('--mc'));
    n.style.setProperty('--dx', (left ? -1 : 1) * (15 + Math.random() * 40) * Math.max(.4, sc) + 'px'); n.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
    document.body.append(n); setTimeout(() => n.remove(), 2400);
  }

  // =====================================================================
  // Bật/tắt + đồng bộ (decor.js gọi apply() khi đổi cài đặt, sync() mỗi 500ms)
  // =====================================================================
  function apply() {
    const c = cfg();
    const on = c.mascot && c.mascot !== 'off';
    if (!on) {
      lifeStop();
      if (R.wrap) { R.wrap.remove(); R.wrap = null; R.bot = null; }
      if (R.fx) { R.fx.cv.remove(); R.fx = null; }
      closeBubble(true);
      document.body.classList.remove('m-at-title', 'm-at-comp');
      for (const s of Object.values(R.slots)) s && s.classList.remove('on');
      watchMedia(false);
      petSync();
      return;
    }
    if (!R.wrap) {
      R.wrap = h('div', { class: 'mwrap' });
      R.bot = new Bot(R.wrap);
      document.body.append(R.wrap);
      R.wrap.addEventListener('pointerdown', (e) => { if (R.life) { hideTip(); R.life.grab(e); } else startDrag(e); });
      R.wrap.addEventListener('mouseenter', () => {
        showTip();
        if (R.life) { R.life.hover(true); return; }
        // giữ chuột 1,5 giây → được vuốt ve
        clearTimeout(R.petT); R.petT = setTimeout(() => { R.ov = { s: 'petted', until: Infinity, why: 'Được vuốt ve 🥰' }; hideTip(); beep('love'); }, 1500);
      });
      R.wrap.addEventListener('mouseleave', () => { hideTip(); clearTimeout(R.petT); if (R.life) R.life.hover(false); if (R.ov && R.ov.s === 'petted') R.ov = { s: 'done', until: Date.now() + 900 }; });
      R.wrap.addEventListener('contextmenu', ctxMenu);
      R.wrap.addEventListener('dblclick', (e) => { if (!R.life) quickMenu(e); });
      R.clicks = [];
      R.wrap.addEventListener('click', () => {
        if (R.life) return;
        if (R.dragged && Date.now() - R.dragged < 300) return;
        if (R.s === 'mail' && R.mail && CG.lark && CG.lark.openDock) { const m = R.mail; R.ov = { s: 'love', until: Date.now() + 1200 }; CG.lark.openDock(m.sid, m.openId); return; }
        const t = Date.now(); R.clicks = R.clicks.filter((x) => t - x < 1600); R.clicks.push(t);
        if (R.clicks.length >= 5) { R.clicks = []; R.ov = { s: 'dizzy', until: t + 2600, why: 'Chóng mặt quá…' }; beep('dizzy'); bubble('Đừng chọc nữa mà 😵‍💫', { ms: 2200 }); return; }
        if (R.ov && R.ov.s === 'dizzy' && t < R.ov.until) return;
        R.ov = { s: 'love', until: t + 1500 }; R.bot.hop();
      });
      R.anchor = '';
      ensureLoop();
      new ResizeObserver(() => relayout()).observe(document.body);
    }
    watchMedia(c.mascotMusic !== false);
    R.wrap.classList.toggle('m-reduce', reduced());
    lifeApply();
    for (const b of extras) dressBot(b, null);
    relayout();
    sync();
  }
  function sync() {
    if (!R.bot) return;
    M.on = musicActive();
    R.wrap.classList.toggle('music', M.on);
    if (!M.on) R.bot.el.style.setProperty('--beat', 0);
    derive();
    lifeSync();
    relayout();
    greet();
  }
  // ngày lễ: chào một lần trong ngày
  function greet() {
    if (document.hidden || !document.hasFocus()) return;
    // lần đầu chạy bản có tính năng mới: giới thiệu một lần
    if (!cfg().mascotIntro18 && !R.intro) {
      R.intro = 1; quietSave({ mascotIntro18: true });
      setTimeout(() => bubble([h('div', { text: 'Mình có đồ mới nè 🤖' }), h('div', { class: 'mb-sub', text: 'Ngày lễ mình tự mặc đồ lễ, thu nhỏ app thì mình ra góc màn hình báo bạn, cầm đồ nghề theo việc Claude làm, lên cấp để mở phụ kiện. Bấm đúp vào mình để mở menu nhanh.' })],
        { ms: 15000, acts: [{ label: 'Robot của tôi', p: 1, run: panel }, { label: 'OK' }] }), 2500);
      return;
    }
    const ev = season(); if (!ev) return;
    const k = dayKey() + ':' + ev.id;
    if (cfg().mascotGreet === k || R.greeted === k) return;
    R.greeted = k; quietSave({ mascotGreet: k });
    setTimeout(() => { bubble([h('div', { text: ev.say }), h('div', { class: 'mb-sub', text: `Hôm nay là ${ev.name} · robot tự mặc đồ lễ tới hết ngày` })], { ms: 7000 }); if (R.bot) R.bot.hop(); }, 1200);
  }
  // hoạt động của người dùng (để biết khi nào "ngủ" và đã làm liên tục bao lâu)
  for (const ev of ['keydown', 'pointerdown', 'wheel']) addEventListener(ev, () => { const t = Date.now(); if (t - R.lastInput > 10 * MIN) R.activeSince = t; R.lastInput = t; }, { passive: true, capture: true });
  addEventListener('input', (e) => { if (e.target && e.target.id === 'input' && R.bot) derive(); }, true);
  addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'input') { R.lastKey = Date.now(); if (R.life) R.life.putAway(); }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyP' && R.life && !R.isOut) { e.preventDefault(); lifeSummon(); }
  }, true);
  addEventListener('wheel', (e) => { if (e.target && e.target.closest && e.target.closest('#scroller')) R.lastWheel = Date.now(); }, { passive: true, capture: true });
  addEventListener('mousemove', (e) => {
    if (!R.wrap) return;
    const r = R.wrap.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    R.bot.mouse = Math.hypot(dx, dy) < 420 ? { x: Math.max(-1, Math.min(1, dx / 260)), y: Math.max(-1, Math.min(1, dy / 200)) } : null;
    if (R.life) R.life.pointer(e.clientX, e.clientY);
  }, { passive: true });
  addEventListener('resize', () => relayout());
  setInterval(careTick, 15000);
  setInterval(refreshToday, 120000);
  setTimeout(refreshToday, 4000);
  setInterval(petSync, 700);
  addEventListener('beforeunload', () => { if (R.xpAdd) flushXp(); if (R.life) lifeSaveN(true); });

  CG.mascot = {
    apply, sync, relayout, closeBubble, ANCHORS, setPos, createBot, dropBot, keep: keepBot, dress: dressBot, onToolResult, onTurnEnd, addXp, bubble, panel, pomo,
    gitEvent: (conv, kind, repo) => gitEvent(conv, kind, repo, false), onLarkRead, onPrompt, onPermAllow, award, recap: (k) => showRecap(k || isoDay(), true), BADGES,
    get state() { return R.bot && R.bot.s; }, get why() { return R.why; }, _R: R, lifeOn, lifeEv, get life() { return R.life; }, lifeSummon,
  };
})();
