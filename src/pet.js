'use strict';
// Robot ngoài desktop: cửa sổ trong suốt luôn nổi, hiện khi app chính thu nhỏ / nằm ở khay.
// Nhận trạng thái từ main (mascot.js gửi), hiện bóng nói (xong việc, Claude hỏi, xin quyền…) và gửi lại thao tác.
(() => {
  const BK = window.BotKit, $ = (s) => document.querySelector(s);
  const bot = new BK.Bot($('#wrap'));
  bot.scale = 100 / BK.BW;
  let st = { on: false }, hidden = '', hit = false, shownId = '';

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render() {
    if (!st.on) return;
    const ev = st.ev && window.Seasons ? window.Seasons.EVENTS.find((e) => e.id === st.ev) : null;
    const o = BK.outfit(ev, st.wear, st.prop);
    const pv = st.pv || {}, esc = (x) => String(x).replace(/[<&>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
    bot.dress(o.back, o.front, o.prop.replace('{L}', esc(pv.L || '✉')).replace('{N}', esc(pv.N || '')));
    const col = BK.COLORS.find((c) => c.id === st.color) || BK.COLORS[0];
    bot.ev = ev; bot.base = ev ? ev.color : col.c || BK.CYAN; bot.rainbow = !ev && col.id === 'rainbow';
    bot.tintKind = st.tint || null; bot.bar = st.bar == null ? null : st.bar;
    if (st.s) bot.state(st.s);
    $('#tip').textContent = st.why || '';
    // bóng nói
    const b = st.bubble, box = $('#bub');
    if (!b || b.id === hidden) { box.classList.remove('on'); return; }
    if (b.id !== shownId) {
      shownId = b.id; box.innerHTML = '';
      box.className = 'hit ' + (b.kind || '');
      const x = el('span', 'x', '✕'); x.onclick = () => { hidden = b.id; box.classList.remove('on'); window.pet.action({ id: b.id, dismiss: true }); };
      box.append(x, el('b', '', b.title || ''));
      if (b.text) box.append(b.kind === 'ask' && /[\/:$]|^\S+\s+-/.test(b.text) ? el('code', '', b.text) : el('div', 't', b.text));
      if (b.sub) box.append(el('div', 's', b.sub));
      if (b.acts && b.acts.length) {
        const acts = el('div', 'acts');
        b.acts.forEach((a, i) => { const btn = el('button', a.p ? 'p' : '', a.label); btn.onclick = () => { hidden = b.id; box.classList.remove('on'); window.pet.action({ id: b.id, i }); }; acts.append(btn); });
        box.append(acts);
      }
      if (b.kind === 'ask' || b.kind === 'done') bot.hop();
    }
    requestAnimationFrame(() => box.classList.add('on'));
  }
  window.pet.onState((s) => {
    const was = st.on; st = s || { on: false };
    if (st.on && st.life) { lifeState(); return; }
    if (life) lifeOff();
    if (st.on && !was) { document.body.classList.add('enter'); setTimeout(() => { document.body.classList.remove('enter'); bot.hop(); }, 60); }
    render();
  });

  // =====================================================================
  // Nuôi robot (bật trong Cài đặt): cửa sổ phủ cả vùng làm việc, robot đi trên mép taskbar, leo lên thanh tiêu đề
  // các cửa sổ đang mở (main.js gửi vị trí), về "nhà" cạnh khay hệ thống để ngủ / đọc sách. Dùng chung bộ máy petlife.js với robot trong app.
  // =====================================================================
  const PL = window.PetLife;
  let life = null, lwrap = null, lbot = null, lprop = null, seen = new Set(), wasVis = false, shown = false, lastSpawn = 0, sayT = 0, nT = 0;
  const D = { wins: [], byId: new Map(), full: false, platC: null, platT: 0, deco: null };
  const LIFE_WORK = ['reading', 'writing', 'web', 'agents', 'thinking', 'bash', 'talking', 'compact'];
  const DECO = { bed: ['🛏️', 170, 48], lamp: ['🪔', 228, 36], kb: ['⌨️', 282, 30], plant: ['🪴', 66, 42], tv: ['🖼️', 165, 36, 92], cat: ['🐈', 330, 34] };
  const send = (o) => window.pet.action({ life: o });
  function deskPlats() {
    const t = performance.now(); if (D.platC && t - D.platT < 30) return D.platC;
    const W = innerWidth, H = innerHeight, out = [{ y: H, x1: 0, x2: W, el: 'floor', main: 1 }], ws = D.wins;
    // mép trên mỗi cửa sổ (bỏ đoạn bị cửa sổ nằm trên che), bỏ cửa sổ phóng to / sát mép trên
    for (let i = 0; i < ws.length; i++) {
      const r = ws[i], y = Math.round(r.y);
      if (y < 40 || y > H - 90 || r.x + r.w < 0 || r.x > W) continue;
      let segs = [[Math.max(0, r.x), Math.min(W, r.x + r.w)]];
      for (let j = 0; j < i && segs.length; j++) {
        const o = ws[j]; if (o.y > y + 2 || o.y + o.h < y - 2) continue;
        const a = o.x, b = o.x + o.w;
        segs = segs.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.min(e, a)], [Math.max(s, b), e]].filter(([p, q]) => q - p > 0)));
      }
      segs.forEach(([s, e], k) => { if (e - s >= 90) out.push({ y, x1: s, x2: e, el: 'w' + r.id + ':' + k, win: r.id }); });
    }
    D.platC = out; D.platT = t; return out;
  }
  const decoOn = () => (st.life && st.life.deco) || [];
  function homeX(k) {
    const on = decoOn(), W = innerWidth, PW = life ? life.PW : 84;
    if (k === 'sleep') return on.includes('bed') ? W - DECO.bed[1] - PW / 2 + 16 : W - PW - 30;
    if (k === 'read') return on.includes('lamp') ? W - DECO.lamp[1] - PW + 6 : null;
    return null;
  }
  const DeskWorld = {
    layer: document.body,
    size: () => (st.life && st.life.size) || 84,
    compact: () => false,
    plats: deskPlats,
    bounds: () => ({ l: 0, r: innerWidth }),
    walk: () => ({ l: 0, r: innerWidth - 20 }),
    maxY: () => innerHeight,
    home: homeX,
    ext: () => { const s = st.s || 'idle'; return { face: s, prop: st.prop || null, work: LIFE_WORK.includes(s), sleep: s === 'sleep', out: s === 'limitOut', cd: 0 }; },
    perches: () => deskPlats().filter((p) => p.win && p.y > 120 && p.x2 - p.x1 > 140),
    dropTop: () => innerHeight - 320,
    dnd: () => !!(st.life && st.life.dnd),
    peek: () => D.full,
    say,
    dress: (prop) => { lprop = prop; dressLife(); },
    xp: (n) => send({ xp: n }),
    diary: (t) => send({ diary: t }),
    minis: true,
    nag: true,
    bagExtra: () => [{ ic: '🪟', name: 'Mở Claude GUI', lv: 1, run: () => window.pet.action({ open: true }) }],
    onClickBot: () => {
      const b = st.bubble;
      if (b && b.id === hidden) { hidden = ''; shownId = ''; lifeBubble(); return true; }
      if (st.s === 'mail') { window.pet.action({ open: true }); return true; }
      return false;
    },
    onEat: (k) => { if (k === 'bead') send({ eat: 'bead' }); },
    onBug: () => send({ bug: 1 }),
  };
  function dressLife() {
    if (!lbot || !st.life) return;
    const ev = st.ev && window.Seasons ? window.Seasons.EVENTS.find((e) => e.id === st.ev) : null;
    const raw = lprop && lprop[0] === '<', o = BK.outfit(ev, st.wear, raw ? null : lprop), pv = st.pv || {};
    const esc = (x) => String(x).replace(/[<&>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
    const kit = PL.kitOf(st.life.kit), f = PL.FORMS.find((x) => x.id === st.life.form) || PL.FORMS[0];
    lbot.dress(PL.HEADS[kit.head].back + (ev ? PL.evWrap(o.back) : f.back + o.back), ev ? PL.evWrap(o.front) : f.front + o.front, raw ? lprop : o.prop.replace('{L}', esc(pv.L || '✉')).replace('{N}', esc(pv.N || '')));
    if (ev) PL.trimEv(lbot);
    const col = BK.COLORS.find((c) => c.id === st.color) || BK.COLORS[0];
    lbot.ev = ev; lbot.base = ev ? ev.color : col.c || BK.CYAN; lbot.rainbow = !ev && col.id === 'rainbow';
    lbot.tintKind = st.tint || null; lbot.bar = st.bar == null ? null : st.bar;
  }
  function drawDeco() {
    const key = JSON.stringify(decoOn()) + innerWidth + 'x' + innerHeight;
    if (D.deco && D.deco.key === key) return;
    if (D.deco) D.deco.el.remove();
    const box = el('div', 'pl-home'); D.deco = { el: box, key };
    for (const k of decoOn()) {
      const d = DECO[k]; if (!d) continue;
      const e = el('div', 'pl-deco', d[0]); e.style.fontSize = d[2] + 'px'; e.style.left = (innerWidth - d[1]) + 'px'; e.style.top = (innerHeight - (d[3] || 0) - d[2] * 1.15) + 'px';
      box.append(e);
    }
    document.body.append(box);
  }
  function lifeOn() {
    document.body.classList.add('life'); document.body.classList.remove('enter');
    lwrap = el('div', 'lwrap hit'); document.body.append(lwrap);
    lbot = new BK.Bot(lwrap); lbot.scale = DeskWorld.size() / BK.BW;
    life = new PL.Life(DeskWorld, lwrap, lbot);
    life.N = { ...PL.DEF_N, ...(st.life.N || {}) };
    lprop = null; dressLife();
    lwrap.addEventListener('pointerdown', (e) => { hideTip(); life.grab(e); });
    lwrap.addEventListener('mouseenter', () => { life.hover(true); showTip(); });
    lwrap.addEventListener('mouseleave', () => { life.hover(false); hideTip(); });
    life.spawn(innerWidth - 320, innerHeight - 260);
  }
  function lifeOff() {
    if (!life) return;
    send({ N: life.N });
    life.destroy(); life = null; lwrap.remove(); lwrap = lbot = null;
    if (D.deco) { D.deco.el.remove(); D.deco = null; }
    document.body.classList.remove('life'); $('#bub').classList.remove('on'); $('#say').classList.remove('on');
    $('#bub').style.left = $('#bub').style.top = '';
  }
  function lifeState() {
    if (!life) lifeOn();
    const L = st.life;
    life.setKit(L.kit); life.lv = L.lv || 1;
    if (L.needs === false) life.N = { no: 100, nl: 100, vui: 100, sach: 100 };
    lbot.scale = DeskWorld.size() / BK.BW;
    dressLife(); drawDeco();
    // sự kiện xảy ra lúc robot đang ngoài desktop (xong lượt, commit, test fail…)
    if (shown && wasVis && L.spawn && L.spawn.t !== lastSpawn && Date.now() - L.spawn.t < 3000) lifeEnter(); // chỗ nhảy ra tới muộn hơn lúc hiện cửa sổ
    for (const e of L.q || []) if (!seen.has(e.id)) { seen.add(e.id); if (shown) life.event(e.kind); }
    lifeBubble();
    $('#tip').textContent = st.why || '';
  }
  // vừa ra desktop: nhảy ra từ đúng chỗ robot đứng trong app (toạ độ màn hình), lấy chỉ số mới nhất
  function lifeEnter() {
    const L = st.life, sp = L.spawn;
    life.N = L.needs === false ? { no: 100, nl: 100, vui: 100, sach: 100 } : { ...life.N, ...(L.N || {}) };
    if (sp && sp.t !== lastSpawn && Date.now() - sp.t < 8000) {
      lastSpawn = sp.t;
      const x = sp.x - window.screenX - life.PW / 2, y = sp.y - window.screenY;
      if (x > -life.PW && x < innerWidth && y > 0 && y < innerHeight + 40) { life.spawn(Math.max(0, Math.min(innerWidth - life.PW, x)), Math.min(innerHeight, y)); life.st.vy = -620; life.bot.hop(); return; }
    }
    if (!life.st.ground) life.spawn(innerWidth - 320, innerHeight - 260);
  }
  // bóng nói (việc cần bạn trả lời / xong / lỗi) bám theo robot; Claude hỏi → robot chạy tới chỗ con trỏ
  function lifeBubble() {
    const b = st.bubble, box = $('#bub');
    if (!b || b.id === hidden) { box.classList.remove('on'); life.setAlert(null); return; }
    if (b.id !== shownId) {
      shownId = b.id; box.innerHTML = '';
      box.className = 'hit ' + (b.kind || '');
      const x = el('span', 'x', '✕'); x.onclick = () => { hidden = b.id; box.classList.remove('on'); life.setAlert(null); window.pet.action({ id: b.id, dismiss: true }); };
      box.append(x, el('b', '', b.title || ''));
      if (b.text) box.append(b.kind === 'ask' && /[\/:$]|^\S+\s+-/.test(b.text) ? el('code', '', b.text) : el('div', 't', b.text));
      if (b.sub) box.append(el('div', 's', b.sub));
      const acts = el('div', 'acts');
      (b.acts || []).forEach((a, i) => { const btn = el('button', a.p ? 'p' : '', a.label); btn.onclick = () => { hidden = b.id; box.classList.remove('on'); life.setAlert(null); window.pet.action({ id: b.id, i }); }; acts.append(btn); });
      if (acts.childNodes.length) box.append(acts);
      if (b.kind === 'ask' || b.kind === 'done') lbot.hop();
    }
    life.setAlert(b.kind === 'ask' ? { key: 'ask:' + b.id, cursor: true, face: 'permission', prop: 'sign', onClick: () => window.pet.action({ open: true }) } : null);
    requestAnimationFrame(() => box.classList.add('on'));
  }
  function say(t, ms) {
    if (!life || $('#bub').classList.contains('on')) return;
    const s = $('#say'); s.textContent = t; s.classList.add('on');
    clearTimeout(sayT); sayT = setTimeout(() => s.classList.remove('on'), ms || 2500);
  }
  const showTip = () => { if (st.why && !$('#bub').classList.contains('on') && !$('#say').classList.contains('on')) $('#tip').classList.add('on'); };
  const hideTip = () => $('#tip').classList.remove('on');
  // đặt bóng nói / lời nói / gợi ý ngay trên đầu robot
  function placeOver(e, gap) {
    if (!e.classList.contains('on')) return;
    const w = e.offsetWidth, hh = e.offsetHeight, cx = life.st.x + life.PW / 2;
    const x = Math.max(6, Math.min(innerWidth - w - 6, cx - w / 2)), y = Math.max(6, life.st.y - hh - gap);
    e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.setProperty('--ax', Math.max(12, Math.min(w - 26, cx - x - 7)) + 'px');
  }
  window.pet.onVis((v) => { shown = v; });
  window.__petLife = () => life; // cho bản kiểm thử (main.js chỉ gọi khi chạy kịch bản thử)
  window.pet.onWins((d) => {
    if (!life || !d) return;
    // robot đang đứng trên cửa sổ bị kéo đi → đi theo
    const g = life.st.ground, nm = new Map(d.wins.map((w) => [w.id, w]));
    if (g && g.win && !life.st.held) {
      const o = D.byId.get(g.win), n = nm.get(g.win);
      if (o && n && (o.x !== n.x || o.y !== n.y) && Math.abs(n.y - o.y) < 400) { life.st.x += n.x - o.x; life.st.y += n.y - o.y; life.st.ground = null; life.st.vy = 0; life.st.jumpP = null; life.st.climbTo = null; }
    }
    D.wins = d.wins; D.byId = nm; D.full = !!d.full; D.platC = null;
  });

  // chuột xuyên qua vùng trống: chỉ nhận chuột khi trỏ vào robot / bóng nói
  addEventListener('mousemove', (e) => {
    const on = !!(e.target && e.target.closest && e.target.closest('.hit')) || !!(life && life.drag);
    if (on !== hit) { hit = on; window.pet.hit(on); if (!life) $('#tip').classList.toggle('on', on && !!e.target.closest('#host') && !$('#bub').classList.contains('on')); }
    if (life) { life.pointer(e.clientX, e.clientY); return; }
    const r = $('#host').getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    bot.mouse = { x: Math.max(-1, Math.min(1, dx / 200)), y: Math.max(-1, Math.min(1, dy / 160)) };
  });
  addEventListener('mouseleave', () => { if (hit && !(life && life.drag)) { hit = false; window.pet.hit(false); } $('#tip').classList.remove('on'); });
  // kéo robot đi chỗ khác; bấm (không kéo) → mở lại app
  let down = null;
  $('#host').addEventListener('pointerdown', (e) => { if (e.button !== 0) return; down = { x: e.screenX, y: e.screenY }; window.pet.drag(true); });
  addEventListener('pointerup', (e) => {
    if (life && hit && !(e.target && e.target.closest && e.target.closest('.hit'))) { hit = false; window.pet.hit(false); }
    if (!down) return;
    window.pet.drag(false);
    const moved = Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4; down = null;
    if (moved) bot.hop(); else window.pet.action({ open: true });
  });

  let last = BK.now();
  (function loop() {
    requestAnimationFrame(loop);
    const t = BK.now(); if (t - last < 1 / 30) return;
    const dt = Math.min(.1, t - last); last = t;
    if (life) {
      const vis = shown;
      if (vis && !wasVis) lifeEnter();
      if (!vis && wasVis) send({ N: life.N });
      wasVis = vis;
      if (!vis) return;
      if (st.life && st.life.needs === false) life.N = { no: 100, nl: 100, vui: 100, sach: 100 };
      life.tick(dt); lbot.tick(t, dt, false);
      for (const id of ['#bub', '#say']) placeOver($(id), 16);
      placeOver($('#tip'), 10);
      if (performance.now() - nT > 15000) { nT = performance.now(); send({ N: life.N }); }
    } else if (st.on) bot.tick(t, dt, false);
  })();
})();
