'use strict';
// Nuôi robot: thân / tay / chân, dạng tiến hoá, 4 chỉ số và "bộ máy sống" (vật lý + hành vi) dùng chung cho
// robot trong app (mascot.js — đi trên mép ô nhập, nhảy lên phiên ở thanh bên…) và robot ngoài desktop
// (pet.js — đi trên taskbar, leo thanh tiêu đề cửa sổ thật). Mỗi nơi đưa vào một "world" mô tả nền đứng, biên,
// con trỏ, việc Claude đang làm…; bộ máy lo phần còn lại.
(() => {
  const BK = window.BotKit;
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ===================== thân / tay / chân (toạ độ rig: rộng 100 đơn vị = bề ngang đầu) =====================
  const BODY = {
    none: { name: 'Không thân', h: 0 },
    box: { name: 'Thân hộp', h: 40, hips: [40, 60], sh: [[26, 10], [74, 10]],
      svg: '<rect x="44" y="0" width="12" height="7" fill="#2b313c"/><rect x="26" y="5" width="48" height="34" rx="9" fill="#161b23" stroke="#343b48" stroke-width="1.6"/><rect x="35" y="12" width="30" height="15" rx="4" fill="#0a0e14"/><circle class="led" cx="42" cy="19.5" r="3"/><rect class="led" x="49" y="16" width="12" height="2.2" rx="1" opacity=".55"/><rect class="led" x="49" y="21" width="8" height="2.2" rx="1" opacity=".55"/>',
      arm: (x) => `<rect x="${x - 4}" y="9" width="8" height="22" rx="4" fill="#2b313c" stroke="#454d5c" stroke-width="1.3"/><circle cx="${x}" cy="32" r="4.6" fill="#2b313c" stroke="#454d5c" stroke-width="1.3"/>` },
    round: { name: 'Thân tròn', h: 40, hips: [42, 58], sh: [[29, 13], [71, 13]],
      svg: '<rect x="45" y="0" width="10" height="6" fill="#2b313c"/><ellipse cx="50" cy="22" rx="24" ry="17.5" fill="#1b2029" stroke="#343b48" stroke-width="1.6"/><ellipse cx="50" cy="25" rx="13" ry="9" fill="#262d3a"/><path class="led" d="M50 29.5 l-4.6 -4.6 a2.7 2.7 0 0 1 4.6 -2.7 a2.7 2.7 0 0 1 4.6 2.7 z"/>',
      arm: (x) => `<ellipse cx="${x}" cy="21" rx="4.6" ry="9.5" fill="#2b313c" stroke="#454d5c" stroke-width="1.3"/>` },
    hoodie: { name: 'Áo hoodie', h: 42, hips: [40, 60], sh: [[27, 10], [73, 10]],
      svg: '<path d="M30 3 Q50 15 70 3 L70 9 Q50 20 30 9 Z" fill="#b45f42"/><path d="M27 8 Q50 1 73 8 L76 40 Q50 45 24 40 Z" fill="#d97757" stroke="#b45f42" stroke-width="1.6"/><path d="M46 10 V21 M54 10 V21" stroke="#f3e1d6" stroke-width="1.4"/><circle cx="46" cy="22" r="1.4" fill="#f3e1d6"/><circle cx="54" cy="22" r="1.4" fill="#f3e1d6"/><rect x="37" y="27" width="26" height="9" rx="3" fill="#c4664a"/>',
      arm: (x) => `<rect x="${x - 4.5}" y="9" width="9" height="23" rx="4.5" fill="#d97757" stroke="#b45f42" stroke-width="1.3"/><circle cx="${x}" cy="33.5" r="4.4" fill="#2b313c" stroke="#454d5c" stroke-width="1.3"/>` },
  };
  const LEGS = {
    feet: { name: 'Bàn chân nhỏ', h: 8, leg: (x, y) => `<rect x="${x - 8}" y="${y}" width="16" height="8" rx="4" fill="#11151c" stroke="#343b48" stroke-width="1.5"/>` },
    stick: { name: 'Chân khớp', h: 26, leg: (x, y) => `<path d="M${x} ${y} V${y + 19}" stroke="#454d5c" stroke-width="4.5" stroke-linecap="round"/><circle cx="${x}" cy="${y + 10}" r="2.6" fill="#2b313c" stroke="#5a6275" stroke-width="1"/><rect x="${x - 6}" y="${y + 18.5}" width="14" height="7" rx="3.5" fill="#11151c" stroke="#343b48" stroke-width="1.4"/>` },
    spring: { name: 'Lò xo', h: 25, leg: (x, y) => `<path d="M${x} ${y} l4 2.5 l-8 3 l8 3 l-8 3 l8 3 l-8 3 l4 2.5" fill="none" stroke="#9aa1b2" stroke-width="2.2" stroke-linejoin="round"/><ellipse cx="${x}" cy="${y + 21}" rx="7.5" ry="3.6" fill="#11151c" stroke="#343b48" stroke-width="1.4"/>` },
    wheel: { name: 'Bánh xe', h: 25, single: 1, leg: (x, y) => `<rect x="46" y="${y}" width="8" height="8" fill="#2b313c"/><circle cx="50" cy="${y + 14}" r="10" fill="#11151c" stroke="#5a6275" stroke-width="2.6"/><g class="spokes"><path d="M50 ${y + 6} V${y + 22} M42 ${y + 14} H58" stroke="#5a6275" stroke-width="2"/></g><circle cx="50" cy="${y + 14}" r="2.4" fill="#9aa1b2"/>` },
  };
  // đầu: vẽ ở lớp sau mặt, toạ độ mặt robot 240×182
  const HEADS = {
    plain: { name: 'Màn hình', back: '' },
    antenna: { name: 'Ăng-ten', back: '<path d="M120 4 V-46" stroke="#8b929e" stroke-width="7"/><circle class="mcs-blink" cx="120" cy="-54" r="13" fill="#ff5a5f"/><circle cx="-6" cy="91" r="16" fill="#2b313c" stroke="#454d5c" stroke-width="4"/><circle cx="246" cy="91" r="16" fill="#2b313c" stroke="#454d5c" stroke-width="4"/>' },
    ears: { name: 'Tai nghe', back: '<path d="M-9 56 C -9 -62, 249 -62, 249 56" fill="none" stroke="#454d5c" stroke-width="10"/><rect x="-26" y="46" width="32" height="90" rx="15" fill="#2b313c" stroke="#454d5c" stroke-width="5"/><rect x="234" y="46" width="32" height="90" rx="15" fill="#2b313c" stroke="#454d5c" stroke-width="5"/><rect x="-18" y="70" width="16" height="42" rx="7" fill="#d97757"/><rect x="242" y="70" width="16" height="42" rx="7" fill="#d97757"/>' },
    crt: { name: 'Tivi cổ', back: '<path d="M86 -10 L44 -80 M154 -10 L196 -80" stroke="#9aa1b2" stroke-width="6" stroke-linecap="round"/><circle cx="44" cy="-82" r="7" fill="#9aa1b2"/><circle cx="196" cy="-82" r="7" fill="#9aa1b2"/><rect x="-20" y="-18" width="280" height="216" rx="34" fill="#8a6a4a" stroke="#5c4530" stroke-width="6"/><circle cx="204" cy="190" r="6" fill="#2b2b2b"/><circle cx="224" cy="190" r="6" fill="#2b2b2b"/>' },
    helmet: { name: 'Mũ phi hành', back: '<path d="M-16 96 C -16 -66, 256 -66, 256 96 L256 150 C 256 216, -16 216, -16 150 Z" fill="#e8e9ee" stroke="#9aa1b2" stroke-width="6"/><rect x="102" y="-48" width="36" height="16" rx="6" fill="#d97757"/><circle cx="-16" cy="120" r="10" fill="#9aa1b2"/><circle cx="256" cy="120" r="10" fill="#9aa1b2"/>' },
  };
  const PRESETS = [
    { ic: '🧑‍💻', name: 'Robot văn phòng', head: 'antenna', body: 'box', legs: 'stick' },
    { ic: '🧡', name: 'Hoodie Claude', head: 'ears', body: 'hoodie', legs: 'stick' },
    { ic: '🫧', name: 'Bé tròn', head: 'plain', body: 'round', legs: 'feet' },
    { ic: '📺', name: 'Tivi lăn bánh', head: 'crt', body: 'box', legs: 'wheel' },
    { ic: '🌀', name: 'Phi hành gia lò xo', head: 'helmet', body: 'round', legs: 'spring' },
    { ic: '🙂', name: 'Gọn như cũ', head: 'plain', body: 'none', legs: 'feet' },
  ];
  const DEF_KIT = { head: 'antenna', body: 'box', legs: 'stick' };
  const kitOf = (k) => ({ head: HEADS[k && k.head] ? k.head : DEF_KIT.head, body: BODY[k && k.body] ? k.body : DEF_KIT.body, legs: LEGS[k && k.legs] ? k.legs : DEF_KIT.legs });

  // ===================== dạng tiến hoá (theo thói quen; toạ độ mặt 240×182) =====================
  const FORMS = [
    { id: 'base', ic: '🤖', name: 'Robot cơ bản', cond: 'Mặc định', back: '', front: '' },
    { id: 'owl', ic: '🦉', name: 'Cú đêm', cond: '5 đêm làm sau 23 giờ (30 ngày gần đây)',
      // bộ lông nâu ôm quanh màn hình, hai chỏm tai cong, cánh khép hai bên, mỏ nhỏ ở mép dưới
      back: '<path d="M-18 70 C -22 20, 8 -8, 46 -6 Q120 -26 194 -6 C 232 -8, 262 20, 258 70 C 262 140, 238 196, 196 210 Q120 232 44 210 C 2 196, -22 140, -18 70 Z" fill="#7b5634" stroke="#563820" stroke-width="5"/>'
        + '<path d="M40 -2 C 30 -30, 34 -60, 50 -82 C 58 -58, 74 -34, 96 -12 Z" fill="#8f6640" stroke="#563820" stroke-width="4" stroke-linejoin="round"/><path d="M200 -2 C 210 -30, 206 -60, 190 -82 C 182 -58, 166 -34, 144 -12 Z" fill="#8f6640" stroke="#563820" stroke-width="4" stroke-linejoin="round"/>'
        + '<path d="M52 -30 C 56 -46, 60 -56, 52 -70 M188 -30 C 184 -46, 180 -56, 188 -70" stroke="#c49a6c" stroke-width="4" fill="none" stroke-linecap="round"/>'
        + '<path d="M-14 84 C -40 110, -38 160, -8 196 C -2 160, 0 120, 6 96 Z M254 84 C 280 110, 278 160, 248 196 C 242 160, 240 120, 234 96 Z" fill="#6a4729" stroke="#563820" stroke-width="4" stroke-linejoin="round"/>'
        + '<path d="M-24 122 q8 8 16 0 M-26 146 q8 8 16 0 M248 122 q8 8 16 0 M250 146 q8 8 16 0" stroke="#a37b52" stroke-width="3" fill="none" stroke-linecap="round"/>',
      front: '<path d="M108 176 Q120 168 132 176 Q126 194 120 200 Q114 194 108 176 Z" fill="#ffb21a" stroke="#c9840a" stroke-width="3" stroke-linejoin="round"/>' },
    { id: 'tool', ic: '🧰', name: 'Thợ commit', cond: '50 commit',
      back: '<g transform="translate(-44 46)"><rect width="56" height="112" rx="14" fill="#3a6fd8" stroke="#2a54a8" stroke-width="4"/><rect x="8" y="58" width="40" height="34" rx="6" fill="#2a54a8"/><path d="M28 -6 v-26 m-10 0 h20" stroke="#aab4c3" stroke-width="8" stroke-linecap="round"/></g>',
      front: '<path d="M22 18 C 22 -52, 218 -52, 218 18 Z" fill="#ffc21a"/><rect x="2" y="8" width="236" height="20" rx="10" fill="#e0a800"/><rect x="110" y="-42" width="20" height="54" rx="6" fill="#e0a800"/>' },
    { id: 'light', ic: '🪶', name: 'Gọn nhẹ', cond: '70% token tuần này dùng Sonnet / Haiku',
      back: '',
      front: '<path d="M52 16 C 52 -40, 188 -40, 188 16 Z" fill="#4a7bd6"/><rect x="40" y="6" width="160" height="16" rx="8" fill="#e84a5f"/><rect x="116" y="-58" width="8" height="30" fill="#555"/><g class="pl-spin"><ellipse cx="120" cy="-60" rx="50" ry="8" fill="#ffd43b"/></g>' },
    { id: 'king', ic: '👑', name: 'Đại ca', cond: 'Cấp 15',
      back: '<g class="pl-cape"><path d="M-6 110 Q120 250 246 110 L232 236 Q120 286 8 236 Z" fill="#b3263a" stroke="#7d1726" stroke-width="4"/></g>',
      front: '<path d="M70 6 L76 -40 L100 -14 L120 -48 L140 -14 L164 -40 L170 6 Z" fill="#ffd43b" stroke="#e0a800" stroke-width="3"/><circle cx="120" cy="-20" r="7" fill="#e84a5f"/>' },
  ];
  // tiến độ từng dạng từ số liệu dùng (usage-stats.json) + cấp
  function formProgress(stats, lv) {
    const days = (stats && stats.days) || {}, keys = Object.keys(days).sort();
    const recent = (n) => keys.filter((k) => Date.now() - new Date(k).getTime() < n * 864e5);
    let nights = 0; for (const k of recent(30)) { const h = days[k].h || []; if ((h[23] || 0) + (h[0] || 0) + (h[1] || 0) + (h[2] || 0) > 0) nights++; }
    let commits = 0; for (const k of keys) commits += (days[k].ev && days[k].ev.commit) || 0;
    let light = 0, all = 0;
    for (const k of recent(7)) for (const s of Object.values(days[k].s || {})) for (const [m, u] of Object.entries(s.m || {})) { const t = (u.o || 0) + (u.i || 0); all += t; if (/sonnet|haiku/i.test(m)) light += t; }
    return { base: 1, owl: Math.min(1, nights / 5), tool: Math.min(1, commits / 50), light: all ? Math.min(1, light / all / .7) : 0, king: Math.min(1, (lv || 1) / 15) };
  }
  // dạng cao nhất đã đạt (thứ tự ưu tiên)
  const bestForm = (prog) => ['king', 'tool', 'owl', 'light'].find((id) => prog[id] >= 1) || 'base';

  // ===================== 4 chỉ số =====================
  const NEEDS = [['no', '🍙', 'No', '#f0a35a'], ['nl', '⚡', 'Năng lượng', '#ffd43b'], ['vui', '😊', 'Vui', '#ff7aa8'], ['sach', '🧼', 'Sạch', '#5ac8fa']];
  const RATE = { no: -10, nl: -7, vui: -5, sach: -3 }; // mỗi giờ
  const DEF_N = { no: 80, nl: 85, vui: 75, sach: 90 };
  // app tắt lâu: vẫn tụt nhưng không quá 6 giờ và không dưới 25 (nghỉ cuối tuần về không "hấp hối")
  function settle(N, t) {
    const n = { ...DEF_N, ...(N || {}) }, hrs = t ? Math.min(6, Math.max(0, (Date.now() - t) / 36e5)) : 0;
    for (const k of Object.keys(RATE)) n[k] = clamp(Math.min(n[k], Math.max(25, n[k] + RATE[k] * hrs)), 0, 100);
    return n;
  }
  const FOODS = { rice: ['🍙', 18, 2, 1, 'Cơm nắm'], noodle: ['🍜', 25, 3, 2, 'Mì'], cake: ['🍰', 45, 8, 4, 'Bánh to'], milktea: ['🧋', 15, 12, 6, 'Trà sữa'], sushi: ['🍣', 35, 6, 9, 'Sushi'], bead: ['⚡', 8, 1, 99, 'Hạt năng lượng'] };

  // ===================== rig: dựng + tạo dáng =====================
  function makeRig(svg) {
    const R = { legs: [], arms: [], spokes: null, kind: 'feet', single: false, units: 0 };
    R.build = (kit, w, compact) => {
      const B = BODY[compact ? 'none' : kit.body], L = LEGS[compact ? 'feet' : kit.legs];
      const hy = B.h ? B.h - 1 : 0, hips = L.single ? [50] : B.h ? B.hips : [36, 64], Hh = hy + L.h;
      let s = hips.map((x) => `<g class="lg">${L.leg(x, hy)}</g>`).join('');
      if (B.svg) s += B.svg + B.sh.map((p, i) => `<g class="am">${B.arm(p[0] + (i ? 4 : -4))}</g>`).join('');
      svg.setAttribute('viewBox', `0 0 100 ${Hh}`); svg.style.width = w + 'px'; svg.style.height = Hh * w / 100 + 'px'; svg.innerHTML = s;
      R.legs = [...svg.querySelectorAll('.lg')].map((el, i) => ({ el, x: hips[i], y: hy }));
      R.arms = [...svg.querySelectorAll('.am')].map((el, i) => ({ el, x: B.sh[i][0], y: B.sh[i][1], side: i ? 1 : -1 }));
      R.spokes = svg.querySelector('.spokes'); R.wy = hy + 14; R.single = !!L.single; R.kind = compact ? 'feet' : kit.legs;
      return Hh * w / 100;
    };
    // o: { ph, t, walking, arms: idle|swing|up|wave|cheer|out|knock|type|rest, dangle, roll }
    R.pose = (o) => {
      for (const l of R.legs) {
        const sg = l.x < 50 ? 1 : -1; let a = 0, dy = 0;
        if (R.kind === 'feet') dy = o.walking ? Math.max(0, Math.sin(o.ph) * sg) * -3 : 0;
        else if (!R.single) a = o.walking ? Math.sin(o.ph) * (R.kind === 'spring' ? 12 : 22) * sg : o.dangle ? Math.sin(o.t * 7 + sg) * 16 : 0;
        l.el.setAttribute('transform', `translate(0 ${dy.toFixed(2)}) rotate(${a.toFixed(1)} ${l.x} ${l.y})`);
      }
      if (R.spokes) R.spokes.setAttribute('transform', `rotate(${(o.roll || 0).toFixed(1)} 50 ${R.wy})`);
      for (const m of R.arms) {
        const s = m.side; let A;
        switch (o.arms) {
          case 'up': A = 150 + Math.sin(o.t * 9 + s) * 8; break;
          case 'wave': A = s > 0 ? 145 + Math.sin(o.t * 13) * 25 : 20; break;
          case 'cheer': A = 140 + Math.sin(o.t * 12 + s) * 22; break;
          case 'out': A = 45; break;
          case 'knock': A = s > 0 ? 95 + Math.sin(o.t * 22) * 22 : 8; break;
          case 'type': A = 28 + Math.sin(o.t * 26 + s * 2) * 7; break;
          case 'swing': A = 10 + Math.sin(o.ph + (s > 0 ? Math.PI : 0)) * 16; break;
          case 'rest': A = 2; break;
          default: A = 6 + Math.sin(o.t * 2 + s) * 3;
        }
        m.el.setAttribute('transform', `rotate(${(-s * A).toFixed(1)} ${m.x} ${m.y})`);
      }
    };
    return R;
  }

  // ===================== bộ máy sống =====================
  // world: {
  //   layer, size(), compact(), plats() → [{ y, x1, x2, el, main?, row? }], bounds() → { l, r }, walk() → { l, r } (chỗ đi dạo),
  //   home(kind) → x | null, ext() → { face, prop, work, sleep, out, cd }, busy(), dnd(), peek(), typing() → x | null,
  //   follow() → x | 'below' | null, perches() → [plat], dropTop(), say(text, ms), dress(prop), xp(n), diary(t), bagExtra(), onClickBot()
  // }
  const CHEER = new Set(['celebrate', 'pass', 'commit', 'done', 'push', 'recharged', 'sun', 'love']);
  const NEUTRAL = new Set(['idle', 'sit', 'perch', 'watch', 'waitScroll', 'dndsit']);
  class Life {
    constructor(w, wrap, bot) {
      this.w = w; this.wrap = wrap; this.bot = bot;
      this.rigEl = document.createElementNS(NS, 'svg'); this.rigEl.setAttribute('class', 'pl-rig'); wrap.append(this.rigEl);
      bot.el.style.zIndex = 1;
      this.rig = makeRig(this.rigEl);
      this.st = { x: 0, y: 0, vx: 0, vy: 0, ground: null, mode: 'fall', until: 0, target: 0, dir: 1, held: false, walkPh: 0, roll: 0, fallFrom: null };
      this.N = { ...DEF_N };
      this.items = []; this.minis = []; this.alert = null; this.mouse = null; this.mSpeed = 0; this.mLast = null;
      this.kit = { ...DEF_KIT }; this.PW = 60; this.TH = 50; this.key = ''; this.prop = undefined; this.face = '';
      this.nagT = 0; this.game = null; this.chaseUntil = 0; this.bathUntil = 0; this.lastT = performance.now(); this.lv = 1;
      this.shadow = document.createElement('div'); this.shadow.className = 'pl-shadow'; w.layer.append(this.shadow);
      this.thinkEl = document.createElement('div'); this.thinkEl.className = 'pl-think'; w.layer.append(this.thinkEl);
      this.layout(true);
    }
    destroy() { for (const it of this.items) it.el.remove(); for (const m of this.minis) m.el.remove(); this.shadow.remove(); this.thinkEl.remove(); this.closeBag(); this.rigEl.remove(); this.bot.el.style.zIndex = ''; this.bot.extraTilt = 0; }
    // cỡ / thân thay đổi → dựng lại rig, giữ nguyên chân chạm đất
    layout(force) {
      const PW = Math.round(this.w.size()), compact = !!this.w.compact(), key = PW + '|' + compact + '|' + JSON.stringify(this.kit);
      if (!force && key === this.key) return;
      const b = this.bottom(); this.key = key; this.PW = PW;
      const BW = BK.BW, rh = this.rig.build(this.kit, BW, compact);
      this.rigEl.style.top = (BW * .76 - 2) + 'px';
      this.TH = (BW * .76 - 2 + rh) * PW / BW;
      if (!force) this.st.y = b - this.TH;
    }
    setKit(k) { this.kit = kitOf(k); this.layout(); }
    bottom() { return this.st.y + this.TH; }
    // ---------- nền đứng ----------
    // nhận diện một nền: theo mã phiên (dòng ở thanh bên được vẽ lại liên tục → phần tử DOM đổi) hoặc theo phần tử
    pkey(p) { return p ? p.row || p.win || p.el : null; }
    support(x, y, only) {
      let best = null; const cx = x + this.PW * .5;
      for (const p of this.w.plats()) { if (only && this.pkey(p) !== only && !p.main) continue; if (cx >= p.x1 + 4 && cx <= p.x2 - 4 && p.y >= y - 2 && (!best || p.y < best.y)) best = p; }
      return best;
    }
    mainP() { return this.w.plats().find((p) => p.main) || null; }
    setMode(m, ms) { this.st.mode = m; this.st.until = performance.now() + (ms || 0); }
    spawn(x, y) { Object.assign(this.st, { x, y: y - this.TH, vx: 0, vy: 0, ground: null, fallFrom: null, jumpP: null, climbTo: null }); this.setMode('fall'); }
    // ---------- chọn việc tiếp theo ----------
    chooseNext() {
      const st = this.st, w = this.w, ext = this.ext || {}, N = this.N;
      st.food = st.bug = st.ball = null;
      if (w.peek && w.peek()) { st.target = w.bounds().r - this.PW; this.setMode('walk', 30000); st.after = 'dnd'; return; }
      if (w.dnd && w.dnd()) { const wk = w.walk(); st.target = wk.r - this.PW - 8; st.after = 'dnd'; this.setMode('walk', 30000); return; }
      if (this.alert) { this.goAlert(); return; }
      const fl = w.follow ? w.follow() : null;
      if (fl === 'below') { this.setMode('waitScroll', 1e9); return; }
      if (w.busy && w.busy()) { this.setMode(w.typing && w.typing() != null ? 'watch' : 'idle', 900); return; }
      if (ext.out || ext.sleep || N.nl < 12 || st.sleepWant) { if (N.nl < 12) st.sleepWant = true; this.goHome('sleep'); return; }
      if (ext.work) { this.setMode(fl != null && ext.face === 'talking' ? 'follow' : 'work', 1e9); return; }
      const food = this.items.find((i) => i.kind === 'food');
      if (food) { st.target = food.x - this.PW / 2 + 10; st.food = food; this.setMode('walk', 20000); return; }
      const bug = this.items.find((i) => i.kind === 'bug' && i.ground);
      if (bug) { st.target = bug.x - this.PW / 2; st.bug = bug; this.setMode('walk', 20000); return; }
      const ball = this.items.find((i) => i.kind === 'ball' && i.rest);
      if (ball && N.vui < 96) { st.target = ball.x - this.PW / 2; st.ball = ball; this.setMode('walk', 12000); return; }
      const r = Math.random(), lazy = N.nl < 40 || N.no < 25, g = st.ground;
      if (g && !g.main) {
        if (r < .55) { this.setMode('perch', rnd(5000, 11000)); if (w.onPerch) w.onPerch(g); }
        else { st.target = this.exitX(g); this.setMode('walk', 8000); }
        return;
      }
      const per = !lazy && w.perches ? w.perches() : [];
      if (per.length && r < .13) { this.climbTo(per[Math.floor(Math.random() * per.length)]); return; }
      const wk = w.walk();
      if (r < (lazy ? .25 : .5)) { st.target = clamp(rnd(wk.l, wk.r - this.PW), wk.l, Math.max(wk.l, wk.r - this.PW)); this.setMode('walk', 12000); }
      else if (r < .72) this.setMode('idle', rnd(2000, 5000));
      else if (r < .86) { const hr = new Date().getHours(); if ((hr >= 18 || hr < 6) && w.home('read') != null) this.goHome('read'); else this.setMode('sit', rnd(3000, 6000)); }
      else this.setMode('yawn', 2600);
    }
    // mép nền phụ để xuống sàn chính (bên nào bên dưới có sàn)
    exitX(g) {
      const m = this.mainP(), PW = this.PW;
      const L = g.x1 - PW * .7, Rr = g.x2 - PW * .3, ok = (x) => m && x + PW / 2 > m.x1 + 4 && x + PW / 2 < m.x2 - 4;
      if (ok(Rr) && !ok(L)) return Rr; if (ok(L) && !ok(Rr)) return L;
      return (this.st.x - g.x1 < g.x2 - this.st.x) ? L : Rr;
    }
    goHome(then) { const x = this.w.home(then); const wk = this.w.walk(); this.st.target = x != null ? x : wk.l + 4; this.st.after = then; this.setMode('walk', 30000); }
    climbTo(p) {
      const st = this.st, g = st.ground, B = this.w.bounds();
      st.climbTo = p;
      const lo = g ? Math.max(g.x1, B.l) : B.l, hi = g ? Math.min(g.x2 - this.PW, B.r - this.PW) : B.r - this.PW;
      st.target = clamp((p.x1 + p.x2) / 2 - this.PW / 2, lo, Math.max(lo, hi)); this.setMode('walk', 15000);
    }
    jumpTo(p) {
      const st = this.st, span = Math.max(0, p.x2 - p.x1 - this.PW);
      const tx = p.tx != null ? clamp(p.tx, p.x1, p.x1 + span) : p.x1 + span * rnd(.2, .8);
      const g = 2200, b0 = this.bottom(), apex = Math.min(b0, p.y) - (p.row ? 20 : 40);
      const vy = -Math.sqrt(2 * g * Math.max(4, b0 - apex)), tUp = -vy / g, tDown = Math.sqrt(2 * Math.max(1, p.y - apex) / g);
      Object.assign(st, { vy, vx: (tx - st.x) / (tUp + tDown), ground: null, fallFrom: null, jumpP: p });
      this.bot.hop(); this.setMode('fall');
    }
    // ---------- việc cần báo (do world đặt): chạy tới con trỏ / tới đúng chỗ ----------
    setAlert(a) {
      const k = a ? a.key : null, cur = this.alert;
      if (cur && k === cur.key) { Object.assign(cur, a); return; }
      this.alert = a || null;
      if (!a && cur && ['notice', 'knock'].includes(this.st.mode)) this.setMode('idle', 400);
      if (a && !this.st.held) { this.st.sleepWant = false; if (this.st.mode === 'sleep') this.setMode('wake', 600); else this.goAlert(); }
    }
    goAlert() {
      const a = this.alert, st = this.st, B = this.w.bounds();
      if (a.dest) { const d = a.dest(); if (!d) { this.setMode('notice', 1e9); return; } if (st.ground && this.pkey(st.ground) === this.pkey(d)) { this.arrive(); return; } this.climbTo(d); return; }
      const tx = a.tx ? a.tx() : a.cursor && this.mouse ? this.mouse.x - this.PW / 2 : null;
      if (tx == null) { this.arrive(); return; }
      st.target = clamp(tx, B.l, B.r - this.PW); this.setMode('walk', 9000);
    }
    arrive() { const a = this.alert; if (a.knock && !a.knocked) { a.knocked = 1; this.st.dir = 1; this.setMode('knock', 1800); return; } this.setMode('notice', 1e9); if (a.onArrive) a.onArrive(); }
    // ---------- đồ vật ----------
    mkItem(kind, ic, x, y, size, o = {}) {
      const el = document.createElement('div'); el.className = 'pl-item' + (o.click ? ' click hit' : ''); el.textContent = ic; el.style.fontSize = (size || 20) + 'px';
      this.w.layer.append(el);
      const it = { kind, el, x, y, vx: 0, vy: 0, ...o };
      this.items.push(it); return it;
    }
    rmItem(it) { this.items = this.items.filter((x) => x !== it); it.el.remove(); }
    drop(kind = 'rice', n = 1) {
      const m = this.mainP(); if (!m) return;
      const [ic, no, vui] = FOODS[kind] || FOODS.rice, wk = this.w.walk();
      for (let i = 0; i < n; i++) setTimeout(() => {
        const x = clamp(this.st.x + this.PW / 2 + rnd(-220, 220), wk.l + 10, wk.r - 30);
        this.mkItem('food', ic, x, this.w.dropTop ? this.w.dropTop() : m.y - 300, kind === 'bead' ? 16 : 22, { food: kind, no, vui });
        if (i === 0) setTimeout(() => { if (['idle', 'sit', 'walk', 'yawn', 'perch'].includes(this.st.mode) && !this.st.food) this.chooseNext(); }, 700);
      }, i * 260);
    }
    addBug(fromTop) {
      const m = this.mainP(); if (!m) return;
      const wk = this.w.walk(), x = fromTop ? rnd(wk.l + 20, wk.r - 40) : clamp(this.st.x + this.PW / 2 + rnd(-200, 200), wk.l + 10, wk.r - 30);
      const it = this.mkItem('bug', ['🐞', '🪲', '🐛'][Math.floor(Math.random() * 3)], x, fromTop ? (this.w.dropTop ? this.w.dropTop() : m.y - 300) : m.y - 18, 17,
        { click: !!this.game, ground: !fromTop, vx: (Math.random() < .5 ? -1 : 1) * rnd(25, 45), vy: fromTop ? rnd(60, 140) : 0, sway: rnd(0, 6) });
      if (this.game) it.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.squash(it, true); });
      if (!this.game && this.st.mode !== 'sleep') this.chooseNext();
    }
    squash(it, byUser) {
      if (!this.items.includes(it)) return; this.rmItem(it);
      if (this.game) { this.game[byUser ? 'me' : 'bot']++; if (this.w.onGame) this.w.onGame(this.game); }
    }
    throwBall() {
      const m = this.mainP(); if (!m) return;
      const wk = this.w.walk();
      const it = this.mkItem('ball', '⚽', clamp(this.st.x + this.PW / 2 + (Math.random() < .5 ? -1 : 1) * 150, wk.l + 10, wk.r - 30), m.y - 200, 20, { click: true, vx: rnd(-200, 200), vy: -200, rest: false, rot: 0 });
      it.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); it.vx = (it.x > this.st.x ? 1 : -1) * rnd(350, 650); it.vy = -rnd(500, 760); it.rest = false; this.add('vui', 3); });
      setTimeout(() => { if (['idle', 'sit', 'walk', 'perch'].includes(this.st.mode)) this.chooseNext(); }, 900);
    }
    putAway() { for (const it of this.items.filter((i) => i.kind === 'ball')) this.rmItem(it); this.st.ball = null; }
    startGame(sec = 30) {
      if (this.game) return;
      this.game = { end: performance.now() + sec * 1000, me: 0, bot: 0, next: 0 }; this.st.sleepWant = false; this.setMode('idle', 300);
      if (this.w.onGame) this.w.onGame(this.game);
    }
    endGame() {
      const g = this.game; this.game = null;
      for (const it of this.items.filter((i) => i.kind === 'bug')) this.rmItem(it);
      const tot = g.me + g.bot; this.add('vui', Math.min(30, 6 + tot)); this.w.xp(tot); this.bot.hop();
      this.w.say(`Hết giờ! Bạn bắt ${g.me}, mình bắt ${g.bot} 🎉`, 4000); if (tot >= 15) this.w.diary(`Cùng bạn bắt ${tot} con bọ trong 30 giây 🐞`);
      if (this.w.onGame) this.w.onGame(null); this.chooseNext();
    }
    add(k, d) { this.N[k] = clamp(this.N[k] + d, 0, 100); }
    bath() { this.st.sleepWant = false; this.bathUntil = performance.now() + 3200; this.setMode('bath', 3200); this.w.say('Mát quá~ 🫧', 2400); this.w.xp(2); }
    sleep() { this.st.sleepWant = true; this.goHome('sleep'); }
    petted(long) {
      if (this.st.mode === 'sleep') { this.w.say('Ưm… đang ngủ mà 😴', 1600); return; }
      this.add('vui', long ? 6 : 3); this.heart('💗'); this.setMode('petted', 1600); this.w.xp(1);
    }
    heart(ch) { const e = document.createElement('div'); e.className = 'pl-heart'; e.textContent = ch; e.style.left = (this.st.x + this.PW / 2 + rnd(-16, 10)) + 'px'; e.style.top = (this.st.y - 6) + 'px'; this.w.layer.append(e); setTimeout(() => e.remove(), 1300); }
    // sự kiện từ Claude / git
    event(kind) {
      if (kind === 'turn') this.drop('bead', 2);
      else if (kind === 'long') this.drop('bead', 3);
      else if (kind === 'commit') { this.drop('bead', 1); this.add('vui', 5); }
      else if (kind === 'pass') this.add('vui', 8);
      else if (kind === 'push') this.add('vui', 4);
      else if (kind === 'fail') this.addBug(false);
      else if (kind === 'auto') this.drop('bead', 4);
    }
    // ---------- túi đồ (bấm đúp) ----------
    openBag() {
      this.closeBag();
      const box = document.createElement('div'); box.className = 'pl-bag hit';
      const t = document.createElement('div'); t.className = 't'; t.textContent = 'Túi đồ · bấm để dùng'; box.append(t);
      const lv = this.lv || 1;
      const list = [...Object.entries(FOODS).filter(([k]) => k !== 'bead').map(([k, f]) => ({ ic: f[0], name: f[4], lv: f[3], run: () => this.drop(k, 1) })),
        { ic: '⚽', name: 'Bóng', lv: 1, run: () => this.throwBall() }, { ic: '🧼', name: 'Tắm', lv: 1, run: () => this.bath() }, { ic: '🛏️', name: 'Đi ngủ', lv: 1, run: () => this.sleep() },
        { ic: '🎮', name: 'Bắt bọ 30 giây', lv: 3, run: () => this.startGame() }, ...(this.w.bagExtra ? this.w.bagExtra() : [])];
      for (const it of list) {
        const b = document.createElement('button'); const lock = it.lv > lv; b.disabled = lock; b.textContent = it.ic; b.title = lock ? `${it.name} — mở ở cấp ${it.lv}` : it.name;
        if (lock) { const s = document.createElement('small'); s.textContent = it.lv; b.append(s); }
        b.addEventListener('click', (e) => { e.stopPropagation(); this.closeBag(); it.run(); }); box.append(b);
      }
      this.w.layer.append(box); this.bag = box; this.placeBag();
      this.bagOff = (e) => { if (this.bag && !this.bag.contains(e.target) && !this.wrap.contains(e.target)) this.closeBag(); };
      setTimeout(() => addEventListener('pointerdown', this.bagOff, true), 0);
    }
    closeBag() { if (this.bag) { this.bag.remove(); this.bag = null; removeEventListener('pointerdown', this.bagOff, true); } }
    placeBag() { if (!this.bag) return; const b = this.bag, bw = b.offsetWidth, bh = b.offsetHeight, B = this.w.bounds(); b.style.left = clamp(this.st.x + this.PW / 2 - bw / 2, B.l + 6, B.r - bw - 6) + 'px'; b.style.top = Math.max(6, this.st.y - bh - 14) + 'px'; }
    // ---------- kéo / ném / bấm ----------
    grab(e) {
      if (e.button !== 0) return;
      const st = this.st;
      try { this.wrap.setPointerCapture(e.pointerId); } catch {}
      const d = { dx: e.clientX - st.x, dy: e.clientY - st.y, hist: [{ x: e.clientX, y: e.clientY, t: performance.now() }], moved: 0, x0: e.clientX, y0: e.clientY };
      this.drag = d; this.closeBag();
      const mv = (ev) => {
        if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
        if (!st.held) { st.held = true; st.ground = null; this.wrap.classList.add('drag'); if (this.w.onGrab) this.w.onGrab(); }
        const B = this.w.bounds();
        st.x = clamp(ev.clientX - d.dx, B.l - 20, B.r - this.PW + 20); st.y = clamp(ev.clientY - d.dy, -10, (this.w.maxY ? this.w.maxY() : innerHeight) - this.TH);
        d.hist.push({ x: ev.clientX, y: ev.clientY, t: performance.now() }); if (d.hist.length > 6) d.hist.shift(); d.moved++;
      };
      const up = () => {
        removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); this.drag = null; this.wrap.classList.remove('drag');
        if (!st.held) { // bấm (không kéo)
          const t = performance.now();
          if (t - (this.lastClick || 0) < 350) { this.lastClick = 0; clearTimeout(this.clickT); this.openBag(); return; }
          this.lastClick = t;
          this.clickT = setTimeout(() => { if (this.lastClick !== t) return; if (this.w.onClickBot && this.w.onClickBot()) return; if (this.alert && this.alert.onClick) { this.alert.onClick(); return; } this.petted(); }, 300);
          return;
        }
        const a = d.hist[0], b = d.hist[d.hist.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
        st.vx = clamp((b.x - a.x) / dt, -1400, 1400); st.vy = clamp((b.y - a.y) / dt, -1400, 1400);
        st.dizzy = d.moved > 25 && Math.hypot(st.vx, st.vy) > 900;
        st.held = false; st.fallFrom = st.y; st.jumpP = null; this.setMode('fall');
        if (this.w.onDrop) this.w.onDrop();
      };
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    }
    hover(on) { clearTimeout(this.hoverT); if (on) this.hoverT = setTimeout(() => { if (!this.st.held) this.petted(true); }, 1100); }
    // con trỏ (để chạy tới báo, đuổi bắt, nhìn theo)
    pointer(x, y) {
      const t = performance.now(), st = this.st;
      if (this.mLast) { const v = Math.hypot(x - this.mLast.x, y - this.mLast.y) / Math.max(1, t - this.mLast.t) * 1000; this.mSpeed = this.mSpeed * .8 + v * .2; }
      this.mLast = { x, y, t }; this.mouse = { x, y };
      if (this.mSpeed > 2600 && this.N.vui > 55 && !this.alert && !(this.ext && this.ext.work) && !(this.w.busy && this.w.busy()) && !st.after && !st.sleepWant && !this.game && st.ground
        && ['idle', 'sit', 'walk'].includes(st.mode) && !st.food && !st.bug && Math.hypot(x - st.x - this.PW / 2, y - st.y) < 320 && !(this.w.dnd && this.w.dnd()) && t > this.chaseUntil) {
        this.chaseUntil = t + 9000; this.setMode('chase', 4500); this.w.say('Đuổi bắt hả? Chờ mình! 🐭', 1600);
      }
    }
    // ---------- mỗi khung hình ----------
    tick(dt, nowMs) {
      const now = nowMs || performance.now(), st = this.st, w = this.w, N = this.N;
      const ext = this.ext = w.ext ? w.ext() || {} : {};
      this.layout();
      // chỉ số
      const hrs = dt / 3600, sleeping = st.mode === 'sleep';
      this.add('no', RATE.no * hrs * (sleeping ? .5 : 1)); this.add('nl', (sleeping ? 30 : RATE.nl) * hrs);
      this.add('vui', RATE.vui * hrs * (N.no < 25 ? 2 : 1)); this.add('sach', (RATE.sach - (this.items.some((i) => i.kind === 'bug') && !this.game ? 8 : 0)) * hrs);
      if (sleeping && !ext.out && !ext.sleep && !this.alert && (!st.sleepWant || N.nl >= 95)) { st.sleepWant = false; this.setMode('wake', 1600); }
      const m0 = this.mainP(), B = w.bounds();
      // mini game
      if (this.game) { if (now > this.game.next) { this.game.next = now + rnd(350, 750); this.addBug(true); } if (now > this.game.end) this.endGame(); }
      // đồ vật
      for (const it of [...this.items]) {
        const f = m0 ? m0.y : innerHeight;
        if (it.kind === 'food') { if (!it.landed) { it.vy += 1400 * dt; it.y += it.vy * dt; if (it.y >= f - 24) { it.y = f - 24; it.landed = true; } } else it.y = f - 24; }
        else if (it.kind === 'bug') {
          if (!it.ground) { it.y += it.vy * dt; it.x += Math.sin(now / 300 + it.sway) * 40 * dt; if (it.y >= f - 17) { it.y = f - 17; it.ground = true; it.born = now; } }
          else { it.y = f - 17; it.x += it.vx * dt; const wk = w.walk(); if (it.x < wk.l + 4 || it.x > wk.r - 24) it.vx *= -1; if (this.game && now - it.born > 5000) { this.rmItem(it); continue; } }
          it.el.style.transform = `scaleX(${it.vx > 0 ? -1 : 1})`;
          if (this.game && Math.abs(it.x + 8 - (st.x + this.PW / 2)) < this.PW * .45 && Math.abs(it.y - (st.y + this.TH / 2)) < this.TH * .6) this.squash(it, false);
        } else if (it.kind === 'ball') {
          if (!it.rest) { it.vy += 1600 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vx * dt * 2; const g = f - 22; if (it.y > g) { it.y = g; it.vy *= -.55; it.vx *= .85; if (Math.abs(it.vy) < 60) { it.vy = 0; if (Math.abs(it.vx) < 15) { it.rest = true; it.vx = 0; } } } const wk = w.walk(); if (it.x < wk.l || it.x > wk.r - 24) { it.vx *= -.8; it.x = clamp(it.x, wk.l, wk.r - 24); } }
          else it.y = f - 22;
          it.el.style.transform = `rotate(${it.rot}deg)`;
        }
        it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px';
      }
      // tắm
      if (this.bathUntil > now) {
        if (Math.random() < .7) { const d = document.createElement('div'); d.className = 'pl-drop'; Object.assign(d.style, { left: (st.x + rnd(0, this.PW)) + 'px', top: (st.y - 40) + 'px' }); w.layer.append(d); d.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${this.TH + 40}px)`, opacity: .2 }], { duration: 500, easing: 'ease-in' }).onfinish = () => d.remove(); }
        this.add('sach', 60 * dt);
      }
      this.tickMinis(dt, now, ext);
      // vật lý
      if (!st.held) {
        if (!st.ground) {
          st.vy += 2200 * dt; st.x += st.vx * dt; st.y += st.vy * dt;
          if (st.x < B.l) { st.x = B.l; st.vx *= -.5; } if (st.x > B.r - this.PW) { st.x = B.r - this.PW; st.vx *= -.5; }
          // đang nhảy mà chỗ đáp biến mất (cuộn khỏi khung, phiên hết chờ…) → bỏ đích, lái về sàn chính thay vì rơi lọt ra ngoài
          if (st.jumpP && !w.plats().some((q) => this.pkey(q) === this.pkey(st.jumpP))) st.jumpP = null;
          if (!st.jumpP && m0 && st.vy > 0 && !this.support(st.x, this.bottom())) { const tx = clamp(st.x, m0.x1, m0.x2 - this.PW); if (Math.abs(tx - st.x) > 2) st.vx = clamp((tx - st.x) * 4, -900, 900); }
          const p = st.vy >= 0 ? this.support(st.x, this.bottom() - st.vy * dt - 1, st.jumpP && this.pkey(st.jumpP)) : null;
          if (p && this.bottom() >= p.y) {
            st.y = p.y - this.TH;
            if (st.vy > 520 && !st.jumpP) { st.vy *= -.32; st.vx *= .7; this.bot.hop(); }
            else {
              const far = (p.y - (st.fallFrom == null ? p.y : st.fallFrom)) > 260;
              if (st.jumpP) st.climbTo = null;
              Object.assign(st, { vy: 0, vx: 0, ground: p, jumpP: null });
              if (st.dizzy || far) { this.setMode('dizzy', 2200); w.say(st.dizzy ? 'Chóng mặt quáaa 😵‍💫' : 'Úi da!', 1800); this.add('vui', -2); st.dizzy = false; }
              else if (st.mode === 'fall') this.chooseNext();
            }
          } else if (st.vy > 0 && m0 && this.bottom() > m0.y + 40) {
            // lọt khỏi mọi nền → đặt lại lên sàn chính
            st.x = clamp(st.x, m0.x1, m0.x2 - this.PW); st.y = m0.y - this.TH - 1; st.vy = 0; st.jumpP = null;
          }
        } else {
          const p = this.support(st.x, this.bottom() - 4);
          if (!p || Math.abs(p.y - this.bottom()) > 5) { st.ground = null; st.fallFrom = st.mode === 'walk' ? null : st.y; this.setMode('fall'); }
          else { st.ground = p; st.y = p.y - this.TH; }
        }
      }
      // hành vi
      let face = 'idle', walking = false;
      const m = st.mode, a = this.alert;
      if (st.held) face = this.drag && this.drag.moved > 20 ? 'web' : 'stopped';
      else if (!st.ground) face = 'web';
      else if (m === 'walk' || m === 'chase' || m === 'follow') {
        const slow = N.no < 25 || N.nl < 30;
        let sp = (a ? 170 : slow ? 45 : 80) * (st.bug ? 1.7 : st.food ? 1.4 : 1) * (this.PW < 70 ? .85 : 1);
        if (m === 'chase') { sp = 210; if (this.mouse) st.target = clamp(this.mouse.x - this.PW / 2, B.l, B.r - this.PW); }
        if (m === 'follow') { sp = 130; const fx = w.follow ? w.follow() : null; if (typeof fx === 'number') { const wk = w.walk(); st.target = clamp(fx - this.PW / 2 + 4, wk.l, wk.r - this.PW); } }
        if (st.bug && this.items.includes(st.bug)) st.target = st.bug.x - this.PW / 2 + 6;
        if (st.ball && this.items.includes(st.ball)) st.target = st.ball.x - this.PW / 2 + (st.ball.x > st.x ? -10 : 10);
        if (a && !a.dest && !a.tx && a.cursor && this.mouse) st.target = clamp(this.mouse.x - this.PW / 2, B.l, B.r - this.PW);
        const g0 = st.ground, wantDown = g0 && !g0.main && (st.food || st.bug || st.ball || st.after || (a && !a.dest) || m === 'follow');
        if (wantDown && st.target + this.PW / 2 > g0.x1 && st.target + this.PW / 2 < g0.x2) st.target = this.exitX(g0);
        const d = st.target - st.x, reached = Math.abs(d) < 4;
        if (m === 'follow' && (!ext.work || typeof (w.follow && w.follow()) !== 'number')) this.chooseNext();
        else if (m === 'chase' && now > st.until) this.chooseNext();
        else if (m === 'walk' && (reached || now > st.until)) {
          if (st.food && this.items.includes(st.food)) { if (st.food.landed && st.ground.main) this.setMode('eat', st.food.food === 'bead' ? 800 : 1700); else if (st.ground.main) st.until = now + 400; else this.setMode('walk', 3000); }
          else if (st.bug && this.items.includes(st.bug)) this.setMode('catch', 1200);
          else if (st.ball && this.items.includes(st.ball)) { const b = st.ball; b.vx = (b.x > st.x + this.PW / 2 ? 1 : -1) * rnd(350, 600); b.vy = -rnd(300, 520); b.rest = false; st.ball = null; this.add('vui', 6); w.xp(1); this.heart('⚽'); this.setMode('cheer', 900); }
          else if (st.climbTo) { const p = w.plats().find((q) => this.pkey(q) === this.pkey(st.climbTo)); if (p) this.jumpTo(p); else { st.climbTo = null; this.chooseNext(); } }
          else if (a) { if (a.dest) this.goAlert(); else this.arrive(); }
          else if (st.after) { const af = st.after; st.after = null; if (af === 'sleep') this.setMode('sleep', 1e9); else if (af === 'dnd') this.setMode('dndsit', 1e9); else this.setMode('read', rnd(5000, 9000)); }
          else this.chooseNext();
        } else if (!reached) {
          const step = Math.min(Math.abs(d), sp * dt);
          st.dir = Math.sign(d); st.x += st.dir * step; st.roll += st.dir * step * 5; walking = true;
          face = m === 'chase' ? 'done' : m === 'follow' ? 'talking' : st.bug ? 'bug' : a ? a.face || 'call' : N.no < 25 ? 'limit5' : 'typing';
        } else face = m === 'follow' ? 'talking' : 'done';
      }
      if (!walking && st.ground && !st.held && m !== 'walk' && m !== 'chase' && m !== 'follow') {
        if (m === 'idle') { face = N.vui < 30 ? 'stopped' : 'idle'; if (now > st.until) this.chooseNext(); }
        else if (m === 'sit' || m === 'perch') { face = N.nl < 40 ? 'yawn' : 'done'; if (now > st.until) this.chooseNext(); }
        else if (m === 'watch') { face = 'typing'; if (now > st.until) this.chooseNext(); }
        else if (m === 'waitScroll') { face = 'idle'; if ((w.follow && w.follow()) !== 'below') this.chooseNext(); }
        else if (m === 'work') { face = ext.face || 'thinking'; if (!ext.work || (ext.face === 'talking' && typeof (w.follow && w.follow()) === 'number')) this.chooseNext(); }
        else if (m === 'knock') { face = a ? a.face || 'mail' : 'mail'; const k = Math.floor(now / 300); if (k !== st.kn) { st.kn = k; if (k % 2) this.pop('cốc', st.x + this.PW + 2, st.y + 6); } if (now > st.until) { this.setMode('notice', 1e9); if (a && a.onArrive) a.onArrive(); } }
        else if (m === 'notice') { face = a ? a.face || 'call' : 'idle'; if (!a) this.chooseNext(); }
        else if (m === 'read') { face = 'reading'; if (now > st.until) this.chooseNext(); }
        else if (m === 'yawn') { face = 'yawn'; if (now > st.until) this.chooseNext(); }
        else if (m === 'sleep') { face = ext.out ? 'limitOut' : 'sleep'; this.bot.cdEnd = ext.cd || 0; }
        else if (m === 'wake') { face = 'sun'; if (now > st.until) this.chooseNext(); }
        else if (m === 'dizzy') { face = 'dizzy'; if (now > st.until) this.chooseNext(); }
        else if (m === 'petted') { face = 'petted'; if (now > st.until) this.chooseNext(); }
        else if (m === 'cheer') { face = 'done'; if (now > st.until) this.chooseNext(); }
        else if (m === 'bath') { face = 'relief'; if (now > st.until) { N.sach = 100; this.chooseNext(); } }
        else if (m === 'dndsit') { face = 'sleep'; if (!(w.dnd && w.dnd()) && !(w.peek && w.peek())) this.chooseNext(); }
        else if (m === 'eat') {
          face = 'talking';
          if (now > st.until) {
            const f = st.food; st.food = null;
            if (f && this.items.includes(f)) { this.rmItem(f); this.add('no', f.no); this.add('vui', f.vui); w.xp(f.food === 'bead' ? 1 : 2); this.heart(f.food === 'bead' ? '⚡' : '😋'); if (f.food !== 'bead') w.say(f.no >= 40 ? 'Bánh to quá, ngon ghê! 🥳' : f.food === 'milktea' ? 'Trà sữa! Vui hẳn 🧋' : 'Măm măm~', 1600); if (w.onEat) w.onEat(f.food); }
            this.chooseNext();
          }
        } else if (m === 'catch') {
          face = 'bug';
          if (now > st.until) { const b = st.bug; st.bug = null; if (b) this.squash(b, false); if (!this.game) { this.add('vui', 10); w.xp(5); w.say('Bắt được con bọ rồi! 🐞✔', 2000); if (w.onBug) w.onBug(); } this.chooseNext(); }
        } else if (m === 'fall') this.chooseNext();
        else if (now > st.until) this.chooseNext();
      }
      // trong lúc chờ đứng yên: hiện biểu cảm việc Claude / trạng thái (giới hạn, thư, ngữ cảnh đầy…)
      if (NEUTRAL.has(st.mode) && !walking && st.ground && !st.held && ext.face && !['idle', 'sleep', 'costume'].includes(ext.face)) face = ext.face;
      else if (st.mode === 'idle' && ext.face === 'costume') face = 'costume';
      if (this.game && st.ground && !st.held && m !== 'catch') {
        const b = this.items.filter((x) => x.kind === 'bug' && x.ground).sort((p, q) => Math.abs(p.x - st.x) - Math.abs(q.x - st.x))[0];
        if (b && m !== 'walk') { st.bug = b; this.setMode('walk', 4000); }
      }
      if (this.bot.s !== face) this.bot.state(face);
      // đạo cụ cầm tay
      const prop = st.held || !st.ground ? null : a && ['notice', 'knock', 'walk'].includes(st.mode) ? a.prop || null : st.bug && (m === 'walk' || m === 'catch') ? 'net'
        : m === 'read' ? 'reading' : m === 'work' ? ext.prop || null : m === 'sleep' && !ext.out ? 'nightcap' : NEUTRAL.has(m) ? ext.prop || null : null;
      if (prop !== this.prop) { this.prop = prop; w.dress(prop); }
      // nhìn, nghiêng, tay chân
      const mouse = this.mouse, PW = this.PW;
      const tx = w.typing ? w.typing() : null;
      this.bot.lookAt = walking ? { x: st.dir * .8, y: .1 } : m === 'watch' && tx != null ? { x: clamp((tx - st.x - PW / 2) / 160, -1, 1), y: 1 } : m === 'waitScroll' ? { x: 0, y: 1 } : m === 'knock' ? { x: 1, y: 0 }
        : mouse && Math.hypot(mouse.x - st.x - PW / 2, mouse.y - st.y) < 360 && !['sleep', 'dndsit'].includes(m) ? { x: clamp((mouse.x - st.x - PW / 2) / 200, -1, 1), y: clamp((mouse.y - st.y - PW * .38) / 160, -1, 1) } : null;
      const legKind = this.rig.kind;
      st.walkPh += walking ? dt * (m === 'chase' || a ? 15 : N.no < 25 ? 7 : 11) : 0;
      const bob = walking ? Math.abs(Math.sin(st.walkPh)) * -(legKind === 'wheel' ? 0 : legKind === 'spring' ? 8 : 4) * PW / 84 : 0;
      this.bot.extraTilt = walking ? (legKind === 'wheel' ? st.dir * 5 : Math.sin(st.walkPh) * 4 * st.dir) : m === 'sleep' ? 6 : m === 'knock' ? Math.sin(now / 60) * 5 : m === 'watch' ? 5 : 0;
      const arms = st.held || !st.ground ? 'up' : m === 'knock' ? 'knock' : m === 'notice' || m === 'catch' ? 'wave' : CHEER.has(face) || m === 'wake' || m === 'cheer' ? 'cheer' : m === 'petted' ? 'out'
        : (m === 'work' && ['writing', 'bash', 'agents'].includes(face)) || m === 'eat' || m === 'watch' ? 'type' : ['sleep', 'dndsit'].includes(m) ? 'rest' : walking ? 'swing' : 'idle';
      this.rig.pose({ ph: st.walkPh, t: now / 1000, walking, arms, dangle: st.held || (!st.ground && st.vy < 0), roll: st.roll });
      const peek = w.peek && w.peek() && m === 'dndsit' ? PW * .55 : 0;
      this.wrap.style.transform = `translate(${(st.x + peek).toFixed(1)}px, ${(st.y + bob).toFixed(1)}px) scale(${PW / BK.BW})`;
      // bóng đổ + ý nghĩ trên đầu
      const cx = st.x + PW / 2, sp = st.ground ? st.ground : this.support(st.x, this.bottom()), gy = sp ? sp.y : this.bottom();
      const s = clamp(1 - Math.max(0, gy - this.bottom()) / 300, .3, 1);
      Object.assign(this.shadow.style, { left: (cx - PW * .3 * s) + 'px', top: (gy - 4) + 'px', width: PW * .6 * s + 'px', opacity: s * (peek ? 0 : 1) });
      const fl = w.follow ? w.follow() : null;
      const want = fl === 'below' && m === 'waitScroll' ? '⬇' : m === 'sleep' || this.alert || this.game || (w.dnd && w.dnd()) ? '' : N.no < 30 ? '🍙' : N.sach < 30 ? '🛁' : N.vui < 30 ? '🤚' : '';
      if (this.thinkEl.textContent !== want) this.thinkEl.textContent = want;
      this.thinkEl.classList.toggle('on', !!want);
      if (want) { this.thinkEl.style.left = (st.x + PW - 4) + 'px'; this.thinkEl.style.top = (st.y - 16) + 'px'; this.thinkEl.style.fontSize = Math.max(13, PW * .2) + 'px'; }
      if (want && want !== '⬇' && w.nag && now - this.nagT > 25 * 60e3 && !(w.busy && w.busy())) { this.nagT = now; w.say(N.no < 30 ? 'Đói bụng quá… cho mình ăn với 🥺' : N.sach < 30 ? 'Người mình dính bùn rồi, tắm cho mình nha' : 'Chơi với mình chút đi…', 3000); }
      if (this.bag) this.placeBag();
    }
    pop(t, x, y) { const e = document.createElement('div'); e.className = 'pl-pop'; e.textContent = t; e.style.left = x + 'px'; e.style.top = y + 'px'; this.w.layer.append(e); setTimeout(() => e.remove(), 950); }
    // robot mini đi tìm giúp khi Claude giao việc cho tác tử phụ
    tickMinis(dt, now, ext) {
      const want = this.w.minis && ext.face === 'agents' && this.st.mode === 'work' && this.st.ground && this.st.ground.main;
      if (want && !this.minis.length && now > (this.minisNext || 0)) {
        const wk = this.w.walk();
        for (let i = 0; i < 2; i++) {
          const el = document.createElement('div'); el.className = 'pl-mini'; this.w.layer.append(el);
          const h = document.createElement('div'); h.className = 'pl-mhost'; el.append(h);
          const mw = Math.max(28, this.PW * .55);
          const b = new BK.Bot(h); b.scale = mw / BK.BW; b.state('agents'); b.dress('', '', BK.outfit(null, [], 'web').prop);
          const mm = { el, bot: b, w: mw, x: this.st.x + this.PW / 2 - mw / 2, tx: 0, dir: 1, ph: rnd(0, 6) };
          mm.tx = clamp(mm.x + (i ? 1 : -1) * rnd(120, 260), wk.l, wk.r - mw); this.minis.push(mm);
        }
      }
      const m0 = this.mainP();
      for (const mm of [...this.minis]) {
        const home = this.st.x + this.PW / 2 - mm.w / 2;
        if (!want) mm.tx = home;
        const d = mm.tx - mm.x, moving = Math.abs(d) >= 3;
        if (!moving) { if (!want) { mm.el.remove(); this.minis.splice(this.minis.indexOf(mm), 1); this.minisNext = now + 20000; continue; } if (Math.random() < dt * 1.2) { const wk = this.w.walk(); mm.tx = rnd(wk.l, wk.r - mm.w); } }
        else { mm.dir = Math.sign(d); mm.x += mm.dir * Math.min(Math.abs(d), 150 * dt); mm.ph += dt * 16; }
        mm.bot.extraTilt = moving ? Math.sin(mm.ph) * 6 : 0; mm.bot.lookAt = { x: mm.dir * .8, y: .3 };
        const y = (m0 ? m0.y : innerHeight) - mm.w * .76 - 3 + (moving ? -Math.abs(Math.sin(mm.ph)) * 3 : 0);
        mm.el.style.transform = `translate(${mm.x}px, ${y}px) scale(${mm.w / BK.BW})`;
        mm.bot.tick(BK.now(), dt);
      }
    }
  }

  // trang phục ngày lễ khi robot có tay chân: chỉ giữ đồ đội / đeo trên đầu (mũ, kính…), ẩn đồ cầm tay / đặt dưới đất
  // (bí ngô, cờ, bóng bay, khăn quàng…) vì chúng vẽ theo chỗ tay / chân của robot kiểu cũ nên trông như rơi ra ngoài
  const evWrap = (svg) => (svg ? `<g class="pl-ev">${svg}</g>` : '');
  function trimEv(bot) {
    for (const g of bot.el.querySelectorAll('.pl-ev > *')) {
      const r = g.getBoundingClientRect(), m = g.parentNode.getScreenCTM && g.parentNode.getScreenCTM();
      if (!m || !r.width) continue;
      const p = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(m.inverse());
      g.style.display = p.x < -10 || p.x > 250 || p.y > 172 ? 'none' : '';
    }
  }

  window.PetLife = { BODY, LEGS, HEADS, PRESETS, FORMS, NEEDS, RATE, DEF_N, DEF_KIT, FOODS, kitOf, makeRig, formProgress, bestForm, settle, Life, evWrap, trimEv };
})();
