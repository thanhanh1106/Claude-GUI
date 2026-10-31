'use strict';
// Bộ vẽ robot mắt LED dùng chung cho linh vật trong app (mascot.js) và robot ngoài desktop (pet.js).
// BotKit.Bot: một robot; BotKit.STATES: biểu cảm; BotKit.PROPS: đạo cụ cầm tay; BotKit.ACC / COLORS: phụ kiện, màu mắt theo cấp.
(() => {
  const GW = 48, GH = 30, BW = 120;
  const BASE = { x: 0, y: 0, w: 11, h: 12, r: .38, lid: 0, lidAng: 0, happy: 0, heart: 0, cross: 0, spiral: 0, star: 0, bright: 1 };
  const CYAN = [63, 242, 255], AMBER = [255, 188, 70], ORANGE = [255, 132, 62], RED = [255, 84, 84];
  const lo = document.createElement('canvas'); lo.width = GW; lo.height = GH;
  const lx = lo.getContext('2d', { willReadFrequently: true });
  const now = () => performance.now() / 1000;
  // nhạc đang phát: mascot.js ghi vào (on, env, mood); robot nào cũng đọc chung
  const M = { on: false, env: 0, mood: 'chill' };
  const pix = (c, pts) => pts.forEach(([x, y, w = 1, h = 1]) => c.fillRect(x, y, w, h));
  const digits = (c, s) => (window.Seasons ? window.Seasons.ledDigits(c, s) : c.fillText(s, 24, 15));

  const STATES = {
    idle: { sp: 6, set(b, t) { b.eyes({}); const k = Math.floor(t / 3.2) % 5; b.T.gx = [0, -4, 0, 3, 0][k]; b.T.gy = [0, -1, 0, 1, 0][k]; } },
    typing: { sp: 8, set(b, t) { b.eyes({ h: 13, w: 11.5 }); b.T.gx = Math.sin(t * 3) * 1.2; b.T.gy = 4; } },
    thinking: { sp: 4, set(b, t) { b.eyes({ lid: .18, h: 11 }); const s = Math.sin(t * .9); b.T.gx = s * 4; b.T.gy = -4 + Math.abs(s); const n = Math.floor(t * 2.2) % 4; if (n) b.glyph({ k: 'text', s: '·'.repeat(n), dy: -1 }); } },
    talking: { sp: 10, set(b, t) { b.eyes({ h: 11.5 + Math.abs(Math.sin(t * 7)) * 1.5, happy: .15 }); b.T.gx = Math.sin(t * .8) * 1.5; b.T.gy = 1; } },
    reading: { sp: 14, set(b, t) { b.eyes({ h: 7, w: 12, r: .5 }); const ph = (t * .9) % 1; b.T.gx = -5 + ph * 10; b.T.gy = 2 + Math.floor((t * .9) % 4); } },
    writing: { sp: 18, set(b, t) { b.eyes({ lid: .32, lidAng: .32, h: 11 }); b.T.gx = Math.round(Math.sin(t * 9)) * .8; b.T.gy = 3; } },
    bash: { sp: 6, set(b, t) { b.eyes({ lid: .45, lidAng: -.1 }, { lid: .05 }); b.T.gx = 4 + Math.sin(t * 2) * .6; b.T.gy = 1; } },
    web: { sp: 7, set(b, t) { b.eyes({ w: 12.5, h: 13.5, r: .6 }); b.T.gx = Math.cos(t * 2.2) * 4; b.T.gy = Math.sin(t * 2.2) * 2.5; } },
    agents: { sp: 9, set(b, t) { b.eyes({ lid: .12 }); b.T.gx = [-6, 0, 6, 0][Math.floor(t / .9) % 4]; } },
    permission: { sp: 7, set(b, t) { b.T.col = AMBER; b.eyes({ w: 12.5, h: 14, r: .9 }); b.T.tilt = .16 + Math.sin(t * 5) * .05; b.T.gx = b.callDir || 0; b.glyph({ k: 'text', s: Math.floor(t * 3) % 2 ? '!' : '?', dy: Math.sin(t * 4) }); } },
    call: { sp: 9, set(b, t) { b.T.col = AMBER; b.eyes({ w: 12.5, h: 14, r: .9 }); b.T.tilt = Math.sin(t * 5) * .08; b.T.gx = b.callDir || 0; if (Math.floor(t * 3) % 2) b.glyph({ k: 'text', s: '!' }); } },
    done: { sp: 10, set(b) { b.eyes({ happy: 1, h: 11 }); b.T.gy = -1; } },
    celebrate: { sp: 10, noBlink: true, set(b, t) { b.eyes((t % 3) < 1.5 ? { star: 1 } : { heart: 1 }); } },
    error: { sp: 9, set(b, t) { if ((t % 4) < 1.4) { b.eyes({ cross: 1 }); b.T.col = RED; } else { b.eyes({ lid: .42, lidAng: -.38, h: 10, bright: .8 }); b.T.gy = 3; } } },
    stopped: { sp: 12, set(b, t) { const a = t < .7; a ? b.eyes({ w: 13, h: 15, r: .8 }) : b.eyes({ lid: .3, lidAng: -.2, h: 9 }); b.T.gx = a ? 0 : -5; b.T.gy = a ? -1 : 3; } },
    compact: { sp: 8, set(b, t) { b.eyes({ spiral: 1 }); b.T.gx = Math.sin(t * 3) * 1.5; } },
    sleep: { sp: 3, noBlink: true, set(b, t) { b.eyes({ h: 1.6, w: 10, r: .5, bright: .55 }); b.T.gy = 3 + Math.sin(t * 1.2) * .6; const z = ['z', 'zZ', 'zZz', ''][Math.floor(t * 1.3) % 4]; if (z) b.glyph({ k: 'text', s: z, dy: -Math.sin(t) * 1.5 }); } },
    love: { sp: 10, noBlink: true, set(b) { b.eyes({ heart: 1 }); } },
    limit5: { sp: 4, set(b, t) { b.T.col = AMBER; const yawn = (t % 7) > 5.6; b.eyes(yawn ? { lid: .6, h: 6, w: 12 } : { lid: .42, h: 10 }); b.T.gy = 2; b.T.gx = Math.sin(t * .5) * 1.5; b.glyph({ k: 'bat', v: .2, blink: true }); } },
    limitW: { sp: 10, set(b, t) { b.T.col = ORANGE; b.eyes({ lid: .3, lidAng: -.35, h: 11 }); b.T.gx = Math.sin(t * 23) * .5 + (Math.floor(t / 1.6) % 2 ? -3 : 3); b.T.gy = 1; b.glyph({ k: 'drop', p: (t % 1.8) / 1.8 }); } },
    // hết giới hạn: pin cạn xen kẽ đồng hồ đếm ngược tới lúc hồi (H:MM khi còn trên 1 giờ, MM:SS khi dưới)
    limitOut: { sp: 5, noBlink: true, set(b, t) {
      b.T.col = RED; b.eyes({ h: .5, w: 1, bright: .5 });
      const s = b.cdEnd ? Math.max(0, Math.ceil((b.cdEnd - Date.now()) / 1000)) : 0;
      if (s > 0 && (t % 6) >= 3) { const txt = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; b.glyph({ k: 'cdo', draw: (c) => digits(c, txt) }); }
      else b.glyph({ k: 'bigbat', v: .1, blink: true });
    } },
    recharged: { sp: 8, set(b, t) { if (t < 1.6) { b.eyes({ h: .5, w: 1 }); b.glyph({ k: 'bigbat', v: Math.min(1, t / 1.3) }); } else { b.eyes({ happy: 1, h: 11 }); if (!b._hopped) { b._hopped = 1; b.hop(); } } } },
    // ----- mới
    costume: { sp: 8, set(b, t) { b.ev && b.ev.face ? b.ev.face(b, t, new Date()) : STATES.idle.set(b, t); } },
    petted: { sp: 9, noBlink: true, set(b, t) { b.eyes({ happy: 1, h: 10, w: 12 }); b.T.tilt = Math.sin(t * 2.2) * .12; b.glyph({ k: 'blush', draw: (c) => { c.globalAlpha *= .8; pix(c, [[7, 22, 6, 2], [35, 22, 6, 2]]); } }); } },
    dizzy: { sp: 9, noBlink: true, set(b, t) { b.eyes({ spiral: 1 }); b.T.tilt = Math.sin(t * 5) * .15; } },
    yawn: { sp: 4, set(b, t) { const k = t % 6; if (k > 4.4) { b.eyes({ happy: 1, h: 7, w: 12 }); b.glyph({ k: 'text', s: '~', dy: 1 }); } else b.eyes({ lid: .5, h: 9, bright: .75 }); b.T.gy = 2; } },
    nod: { sp: 3, set(b, t) { const k = t % 5; if (k < 3.2) { b.eyes({ h: 1.6, w: 10, r: .5, bright: .55 }); b.T.gy = 2 + k * 1.2; } else { b.eyes({ w: 13, h: 15, r: .8 }); b.T.gy = -1; } } },
    puff: { sp: 7, set(b, t) { b.eyes({ w: 12.5, h: 9, lid: .15, happy: .25 }); b.T.gy = 1; b.glyph({ k: 'drop', p: (t % 1.6) / 1.6 }); } },
    stuffed: { sp: 7, set(b, t) { b.T.col = AMBER; b.eyes({ w: 13, h: 7, happy: .45 }); b.T.gx = Math.sin(t * 9) * .4; b.glyph({ k: 'drop', p: (t % 1.1) / 1.1 }); } },
    relief: { sp: 8, set(b) { b.eyes({ happy: 1, h: 10, w: 12 }); b.glyph({ k: 'text', s: '~', dy: -1 }); } },
    countdown: { sp: 10, noBlink: true, set(b, t) { b.eyes({ h: 0, w: 0 }); const s = Math.max(0, Math.ceil((b.cdEnd - Date.now()) / 1000)); const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; b.glyph({ k: 'cd', draw: (c) => { if (s <= 3 && Math.floor(t * 4) % 2) return; digits(c, txt); } }); } },
    ring: { sp: 12, set(b, t) { b.eyes({ w: 13, h: 15, r: .9 }); b.T.gx = Math.sin(t * 40) * 1.2; } },
    stretch: { sp: 5, set(b, t) { b.eyes({ happy: 1, h: 9, w: 12.5 }); b.T.tilt = Math.sin(t * 1.6) * .22; b.T.gy = -2; } },
    water: { sp: 7, set(b) { b.eyes({ happy: .5, w: 12, h: 12 }); b.T.gx = 3; b.T.gy = 1; } },
    sun: { sp: 6, set(b, t) { b.eyes(t < 1.2 ? { h: 1.6, w: 10 } : { happy: 1, h: 11 }); b.T.gy = -2; } },
    bug: { sp: 9, set(b, t) {
      b.eyes({ lid: .42, lidAng: -.38, h: 10, bright: .8 }); b.T.gx = Math.sin(t * 2.4) * 4; b.T.gy = 2;
      const x = Math.round(3 + ((t * 7) % 34)), y = Math.round(2 + Math.abs(Math.sin(t * .9)) * 17), f = Math.floor(t * 8) % 2;
      const B = ['0' + (f ? '1' : '0') + '0' + (f ? '0' : '1'), '11110', '01111', '11110', '0' + (f ? '0' : '1') + '0' + (f ? '1' : '0')];
      b.glyph({ k: 'bug', draw: (c) => B.forEach((r, j) => [...r].forEach((v, i) => v === '1' && c.fillRect(x + i * 2, y + j * 2, 2, 2))) });
    } },
    pass: { sp: 10, noBlink: true, set(b, t) { if (t < 1.6) { b.eyes({ h: 0, w: 0 }); b.glyph({ k: 'chk', draw: (c) => { c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(16, 15); c.lineTo(22, 21); c.lineTo(33, 8); c.stroke(); } }); } else b.eyes((t % 2) < 1 ? { star: 1 } : { happy: 1, h: 11 }); } },
    commit: { sp: 10, set(b, t) { b.eyes({ happy: 1, h: 11 }); if (t < 2) b.glyph({ k: 'text', s: '✓' }); } },
    // ----- 1.16: thư Lark, git, việc lớn, giới hạn
    mail: { sp: 8, set(b, t) { b.eyes({ happy: .5, h: 12, w: 12 }); b.T.gx = 3; b.T.gy = 1; b.T.tilt = Math.sin(t * 2.4) * .06; if (Math.floor(t * 1.6) % 2) b.glyph({ k: 'env', draw: (c) => { const x = 35, y = 1; c.strokeRect(x + .5, y + .5, 10, 7); c.beginPath(); c.moveTo(x + .5, y + .5); c.lineTo(x + 5.5, y + 4.5); c.lineTo(x + 10.5, y + .5); c.stroke(); } }); } },
    ack: { sp: 12, set(b, t) { b.eyes({ happy: 1, h: 11 }); b.T.gy = t < 1.6 ? Math.abs(Math.sin(t * 6)) * 4 - 1 : -1; } },
    push: { sp: 10, noBlink: true, set(b, t) { b.eyes(t < 1.4 ? { w: 13, h: 15, r: .8 } : (t % 1.2) < .6 ? { star: 1 } : { happy: 1, h: 11 }); b.T.gy = -4; } },
    sweat: { sp: 11, set(b, t) { b.T.col = AMBER; b.eyes({ w: 12.5, h: 14, r: .9 }, { w: 11, h: 12, r: .9 }); b.T.gx = Math.sin(t * 13) * 1.2; b.T.tilt = Math.sin(t * 3) * .05; b.glyph({ k: 'drop', p: (t % .9) / .9 }); } },
    box: { sp: 6, set(b, t) { b.eyes({ lid: .38, lidAng: .3, h: 9 }); b.T.gy = 3 + Math.sin(t * 7) * .7; b.T.tilt = Math.sin(t * 1.3) * .05; if ((t % 3) > 2) b.glyph({ k: 'drop', p: ((t % 3) - 2) }); } },
    tired: { sp: 3, set(b, t) { b.T.col = AMBER; const k = t % 8; b.eyes(k > 6.6 ? { lid: .7, h: 5, w: 12 } : { lid: .55, h: 8, bright: .75 }); b.T.gy = 3; b.T.tilt = Math.sin(t * .7) * .08; b.glyph({ k: 'bat', v: .08, blink: true }); } },
    sign: { sp: 8, set(b, t) { b.T.col = AMBER; b.eyes({ w: 12, h: 13, r: .8 }); b.T.gx = Math.sin(t * 1.5) * 2; b.T.gy = -1; } },
  };

  // ----- đạo cụ (toạ độ theo mặt robot 240×182; vùng vẽ -60…300 × -90…240)
  const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="#2b313c" stroke="#454d5c" stroke-width="2"/>`;
  const PROPS = {
    reading: { svg: `<g><circle cx="70" cy="91" r="35" fill="rgba(160,220,255,.06)" stroke="#c9a86a" stroke-width="6"/><circle cx="170" cy="91" r="35" fill="rgba(160,220,255,.06)" stroke="#c9a86a" stroke-width="6"/><path d="M105 88 q15 -10 30 0" stroke="#c9a86a" stroke-width="6" fill="none"/><path d="M35 86 L4 76 M205 86 L236 76" stroke="#c9a86a" stroke-width="5"/></g>` },
    writing: { hand: 1, svg: `<g class="mcs-tap"><g transform="translate(236 70) rotate(28)"><rect x="0" y="0" width="14" height="86" rx="3" fill="#ffc21a"/><rect x="0" y="0" width="14" height="12" fill="#ff8fb1"/><rect x="0" y="12" width="14" height="5" fill="#b9bec8"/><path d="M0 86 L7 104 L14 86Z" fill="#f2d7a6"/><path d="M5 98 L7 104 L9 98Z" fill="#222"/></g></g>${hand(252, 150)}` },
    bash: { hand: 1, svg: `<g class="mcs-turn"><g transform="translate(262 96) rotate(-30)"><rect x="-6" y="-4" width="12" height="70" rx="5" fill="#aab4c3"/><path d="M-20 -14 a20 20 0 1 1 40 0 l-10 0 l0 -12 l-20 0 l0 12 z" fill="#aab4c3"/></g></g>${hand(252, 150)}` },
    web: { svg: `<g class="mcs-scan"><g transform="translate(130 70)"><circle r="34" fill="rgba(170,230,255,.13)" stroke="#9aa6b8" stroke-width="7"/><path d="M24 24 L60 62" stroke="#6b4a2b" stroke-width="12" stroke-linecap="round"/></g></g>` },
    agents: { hand: 1, svg: `<g transform="translate(240 40) rotate(-20)"><path d="M0 20 L60 -6 L60 62 L0 36 Z" fill="#ff5a5f"/><rect x="-14" y="16" width="16" height="24" rx="3" fill="#d9434a"/><path d="M76 4 q12 24 0 48 M88 -6 q18 34 0 68" stroke="#fff" stroke-width="3" fill="none" class="mcs-blink"/></g>${hand(246, 130)}` },
    thinking: { hand: 1, svg: `<g transform="translate(232 76) rotate(8)"><rect width="58" height="76" rx="5" fill="#a5794a"/><rect x="5" y="9" width="48" height="62" fill="#f4f1e8"/><rect x="18" y="-4" width="22" height="12" rx="3" fill="#8b929e"/><path d="M11 24 h30 M11 36 h36 M11 48 h24" stroke="#9aa1b2" stroke-width="3"/><path d="M10 22 l3 3 l5 -6" stroke="#2fa84f" stroke-width="2.5" fill="none"/></g>${hand(246, 150)}` },
    wave: { svg: `<g class="mcs-wave-hand"><circle cx="262" cy="40" r="15" fill="#2b313c" stroke="#454d5c" stroke-width="2"/><path d="M252 30 l-4 -12 M262 26 l0 -13 M272 30 l4 -12" stroke="#454d5c" stroke-width="5" stroke-linecap="round"/></g>` },
    clock: { hand: 1, svg: `<g><g transform="translate(246 96)"><circle cx="26" cy="30" r="26" fill="#e8e9ee" stroke="#d6262f" stroke-width="5"/><circle cx="8" cy="6" r="8" fill="#d6262f"/><circle cx="44" cy="6" r="8" fill="#d6262f"/><path d="M26 30 v-15 M26 30 l10 6" stroke="#222" stroke-width="3" stroke-linecap="round"/></g></g>${hand(252, 150)}` },
    glass: { hand: 1, svg: `<g transform="translate(236 92) rotate(-6)"><path d="M0 0 h40 l-5 64 h-30 z" fill="rgba(170,220,255,.35)" stroke="#cfe6ff" stroke-width="3"/><path d="M3 24 h34 l-3 38 h-28 z" fill="#5ab0ff" opacity=".7"/></g>${hand(250, 156)}` },
    nightcap: { hat: 1, svg: `<path d="M30 0 C 60 -60, 170 -70, 214 -22 C 236 0, 250 30, 262 66 L 244 70 C 232 36, 210 8, 190 -2 Z" fill="#4b5fb3"/><path d="M60 -40 l4 4 M120 -54 l4 4 M170 -40 l4 4 M90 -20 l4 4 M200 -14 l4 4" stroke="#ffd43b" stroke-width="4" stroke-linecap="round"/><rect x="18" y="-12" width="206" height="26" rx="13" fill="#e8e9ee"/><circle cx="256" cy="74" r="14" fill="#e8e9ee"/>` },
    sun: { svg: `<g class="mcs-bob"><circle cx="-26" cy="-46" r="22" fill="#ffd43b"/>${[...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return `<path d="M${(-26 + Math.cos(a) * 30).toFixed(1)} ${(-46 + Math.sin(a) * 30).toFixed(1)} L${(-26 + Math.cos(a) * 40).toFixed(1)} ${(-46 + Math.sin(a) * 40).toFixed(1)}" stroke="#ffd43b" stroke-width="5" stroke-linecap="round"/>`; }).join('')}</g>` },
  };
  PROPS.ring = { hand: 1, svg: PROPS.clock.svg.replace('<g><g', '<g class="mcs-turn"><g') };
  // {L}, {N}, {T}: chữ cái người gửi, số tệp, dòng chữ — mascot.js thay khi mặc đồ
  Object.assign(PROPS, {
    mail: { hand: 1, svg: `<g class="mcs-bob"><g transform="translate(206 70) rotate(-10)"><rect width="118" height="80" rx="7" fill="#f4f1e8" stroke="#c9b991" stroke-width="4"/><path d="M3 4 L59 46 L115 4" fill="none" stroke="#c9b991" stroke-width="4"/><circle cx="59" cy="52" r="20" fill="#d6262f"/><text x="59" y="61" text-anchor="middle" font-size="26" font-weight="800" fill="#fff" font-family="Segoe UI, sans-serif">{L}</text></g></g>${hand(246, 150)}` },
    rocket: { svg: `<g class="mcs-rocket"><g transform="translate(250 30)"><path d="M0 -40 C 16 -24 18 6 12 26 H -12 C -18 6 -16 -24 0 -40 Z" fill="#e8e9ee" stroke="#9aa1b2" stroke-width="3"/><circle cy="-8" r="7" fill="#5ab0ff" stroke="#3b6fc4" stroke-width="2"/><path d="M-12 12 L-24 30 L-12 26 Z M12 12 L24 30 L12 26 Z" fill="#d6262f"/><path class="mcs-flame" d="M-8 28 Q0 60 8 28 Z" fill="#ffb21a"/></g></g>` },
    net: { hand: 1, svg: `<g class="mcs-swat"><g transform="translate(246 150) rotate(-35)"><rect x="-4" y="-110" width="8" height="110" rx="3" fill="#a5794a"/><ellipse cx="0" cy="-138" rx="30" ry="34" fill="rgba(255,255,255,.12)" stroke="#d9dde6" stroke-width="5"/><path d="M-26 -150 L26 -126 M-26 -126 L26 -150 M-30 -138 H30 M0 -172 V-104" stroke="#d9dde6" stroke-width="1.5" opacity=".7"/></g></g>${hand(246, 150)}` },
    box: { svg: `<g class="mcs-heave"><g transform="translate(60 150)"><rect width="120" height="74" rx="4" fill="#c58b4e" stroke="#8a5a2b" stroke-width="4"/><path d="M0 18 H120" stroke="#8a5a2b" stroke-width="3"/><rect x="48" y="0" width="24" height="18" fill="#e7c08a"/><text x="60" y="56" text-anchor="middle" font-size="26" font-weight="800" fill="#4a2f12" font-family="Segoe UI, sans-serif">{N}</text></g></g>${hand(52, 178)}${hand(188, 178)}` },
    sign: { svg: `<g class="mcs-bob"><g transform="translate(200 -40) rotate(6)"><rect x="66" y="96" width="10" height="110" rx="3" fill="#a5794a"/><rect width="142" height="100" rx="10" fill="#ffd43b" stroke="#c9a400" stroke-width="5"/><text x="71" y="42" text-anchor="middle" font-size="27" font-weight="900" fill="#3a2a00" font-family="Segoe UI, sans-serif">CẦN BẠN</text><text x="71" y="80" text-anchor="middle" font-size="27" font-weight="900" fill="#3a2a00" font-family="Segoe UI, sans-serif">XEM</text></g></g>${hand(266, 150)}` },
    coin: { hand: 1, svg: `<g class="mcs-bob"><g transform="translate(236 104)"><circle r="26" fill="#ffd43b" stroke="#e0a800" stroke-width="5"/><text y="9" text-anchor="middle" font-size="26" font-weight="800" fill="#a87a00" font-family="Segoe UI, sans-serif">$</text></g></g>${hand(250, 150)}` },
  });

  // ----- phụ kiện mở theo cấp (người dùng tự chọn đeo) + màu mắt
  const ACC = [
    { id: 'bow', name: 'Nơ', lv: 2, svg: `<g transform="translate(196 -6) rotate(18)"><path d="M0 0 L-26 -16 L-26 16 Z M0 0 L26 -16 L26 16 Z" fill="#ff5a8a"/><circle r="7" fill="#e0386e"/></g>` },
    { id: 'ears', name: 'Tai mèo', lv: 3, back: 1, svg: `<path d="M28 20 L44 -42 L94 4 Z M146 4 L196 -42 L212 20 Z" fill="#2f3542"/><path d="M44 8 L50 -24 L76 2 Z M164 2 L190 -24 L196 8 Z" fill="#ff8fb1"/>` },
    { id: 'antenna', name: 'Ăng-ten', lv: 4, back: 1, svg: `<path d="M120 2 L120 -46" stroke="#8b929e" stroke-width="5"/><circle class="mcs-blink" cx="120" cy="-52" r="10" fill="#ff5a5f"/>` },
    { id: 'beanie', name: 'Mũ len', lv: 5, hat: 1, svg: `<path d="M18 16 C 20 -66, 220 -66, 222 16 Z" fill="#4a7bd6"/>${[40, 70, 100, 130, 160, 190].map((x) => `<path d="M${x} -20 v30" stroke="#3a64b8" stroke-width="5"/>`).join('')}<rect x="10" y="2" width="220" height="24" rx="10" fill="#e8e9ee"/><circle cx="120" cy="-56" r="16" fill="#e8e9ee"/>` },
    { id: 'shades', name: 'Kính râm', lv: 6, eyes: 1, svg: `<path d="M30 70 h80 v20 q0 26 -40 26 q-40 0 -40 -26z M130 70 h80 v20 q0 26 -40 26 q-40 0 -40 -26z" fill="rgba(10,10,14,.72)" stroke="#111" stroke-width="5"/><path d="M110 76 h20" stroke="#111" stroke-width="6"/><path d="M40 78 l18 -4" stroke="#fff" stroke-width="3" opacity=".4"/>` },
    { id: 'scarf', name: 'Khăn len', lv: 8, svg: `<path d="M18 168 Q 120 200 222 168 L 226 186 Q 120 220 14 186 Z" fill="#2fa84f"/><path d="M178 186 l14 40 l22 -8 l-16 -38z" fill="#258a40"/>` },
    { id: 'crown', name: 'Vương miện', lv: 15, hat: 1, svg: `<path d="M70 4 L76 -40 L100 -14 L120 -48 L140 -14 L164 -40 L170 4 Z" fill="#ffd43b" stroke="#e0a800" stroke-width="3"/>` },
  ];
  const COLORS = [
    { id: 'cyan', name: 'Xanh ngọc', lv: 1, c: CYAN }, { id: 'purple', name: 'Tím', lv: 3, c: [178, 140, 255] }, { id: 'green', name: 'Xanh lá', lv: 5, c: [110, 240, 140] },
    { id: 'pink', name: 'Hồng', lv: 7, c: [255, 140, 190] }, { id: 'white', name: 'Trắng', lv: 10, c: [240, 244, 255] }, { id: 'rainbow', name: 'Cầu vồng', lv: 20, c: null },
  ];
  const rainbow = (t) => { const h = (t * 40) % 360, f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (.62 - .38 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
  // cấp từ tổng XP: lên cấp l → l+1 cần 100 + 60·l
  function levelOf(xp) { let l = 1, need = 160; xp = Math.max(0, xp || 0); while (xp >= need) { xp -= need; l++; need = 100 + 60 * l; } return { lv: l, cur: xp, need }; }

  const PHONES = `<svg viewBox="0 0 300 250"><path d="M24 150 C 14 -28, 286 -28, 276 150" fill="none" stroke="#5a60c4" stroke-width="15" stroke-linecap="round"/>
    <rect x="2" y="112" width="40" height="92" rx="20" fill="#363a86"/><rect x="258" y="112" width="40" height="92" rx="20" fill="#363a86"/>
    <rect class="m-ring" x="9" y="121" width="26" height="74" rx="13" fill="none" stroke="#5ab0ff" stroke-width="4"/><rect class="m-ring" x="265" y="121" width="26" height="74" rx="13" fill="none" stroke="#5ab0ff" stroke-width="4"/></svg>`;
  const NS = 'http://www.w3.org/2000/svg';
  function layer(cls) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'mcs ' + cls); s.setAttribute('viewBox', '-60 -90 360 330'); s._v = ''; return s; }

  class Bot {
    constructor(parent) {
      this.el = document.createElement('div'); this.el.className = 'mbot';
      this.el.innerHTML = `<div class="mbot-ph">${PHONES}</div><div class="mbot-face"><canvas></canvas></div>`;
      this.back = layer('mcs-back'); this.front = layer('mcs-front'); this.prop = layer('mcs-prop');
      this.el.prepend(this.back); this.el.append(this.front, this.prop);
      parent.append(this.el);
      this.cv = this.el.querySelector('canvas'); this.glowCv = document.createElement('canvas');
      this.P = { L: { ...BASE }, R: { ...BASE }, gx: 0, gy: 0, tilt: 0, col: CYAN.slice(), G: null, gkey: '', ga: 0 };
      this.T = { L: { ...BASE }, R: { ...BASE }, gx: 0, gy: 0, tilt: 0, col: CYAN.slice() };
      this.s = 'idle'; this.t0 = now(); this.blinkT = -9; this.nextBlink = now() + 1; this.forceBlink = 0; this.hopT = -9;
      this.lookAt = null; this.mouse = null; this.tintKind = null; this.extraTilt = 0; this.base = CYAN; this.bar = null; this.ev = null; this.rainbow = false;
    }
    eyes(o, oR) { Object.assign(this.T.L, BASE, o); Object.assign(this.T.R, BASE, o, oR || {}); }
    glyph(g) { this.G = g; }
    state(s) { if (!STATES[s] || s === this.s) return; this.s = s; this.t0 = now(); this._hopped = 0; if (s === 'done' || s === 'celebrate' || s === 'pass' || s === 'commit') this.hop(); }
    switchTo(s) { this.forceBlink = now() + .16; setTimeout(() => this.state(s), 150); }
    hop() { this.hopT = now(); }
    // lớp trang phục: chỉ đụng DOM khi nội dung đổi
    dress(back, front, prop) {
      for (const [el, v] of [[this.back, back || ''], [this.front, front || ''], [this.prop, prop || '']]) if (el._v !== v) { el._v = v; el.innerHTML = v; }
    }
    tick(t, dt, snap) {
      const st = STATES[this.s], T = this.T, P = this.P;
      T.tilt = 0; T.gx = 0; T.gy = 0; this.G = null;
      T.col = this.tintKind === 'week' ? ORANGE : this.tintKind === '5h' ? AMBER : this.rainbow ? rainbow(t) : this.base;
      // thời gian trong trạng thái không được âm (đổi trạng thái giữa khung hình → t0 có thể muộn hơn t một chút;
      // idle đọc mảng theo Math.floor(t) → chỉ số -1 → undefined → mắt thành NaN và mất hẳn)
      st.set(this, Math.max(0, t - this.t0));
      if (!Number.isFinite(T.gx)) T.gx = 0;
      if (!Number.isFinite(T.gy)) T.gy = 0;
      if (!Number.isFinite(T.tilt)) T.tilt = 0;
      let bob = 0, sway = 0;
      if (M.on) {
        const m = M.mood;
        if (['idle', 'sleep', 'done', 'typing', 'costume'].includes(this.s)) {
          if (m === 'edm') this.eyes({ happy: .9, h: 11 + M.env * 4, w: 11 + M.env * 2 });
          else if (m === 'chill') this.eyes({ happy: .55, lid: .25, h: 10 });
          else this.eyes({ lid: .4, lidAng: -.3, h: 9, bright: .85 });
          T.gx = 0; T.gy = 0; this.G = null;
        }
        bob = m === 'edm' ? M.env * 14 : m === 'chill' ? M.env * 6 : 0;
        sway = m === 'sad' ? Math.sin(t * 1.1) * .06 : m === 'chill' ? Math.sin(t * 4.2) * .05 : Math.sin(t * 6.7) * .03;
        this.el.style.setProperty('--beat', M.env.toFixed(3));
      }
      if (this.lookAt) { T.gx = this.lookAt.x * 6; T.gy = this.lookAt.y * 4; }
      else if (this.mouse && (this.s === 'idle' || this.s === 'costume') && !M.on) { T.gx = this.mouse.x * 5; T.gy = this.mouse.y * 3; }
      if (!this.G && this.tintKind && !this.s.startsWith('limit') && (t % 6) < 2) this.G = { k: 'drop', p: (t % 6) / 2 };
      const k = snap ? 1 : 1 - Math.exp(-dt * st.sp);
      for (const side of ['L', 'R']) for (const key in BASE) P[side][key] += (T[side][key] - P[side][key]) * k;
      P.gx += (T.gx - P.gx) * k; P.gy += (T.gy - P.gy) * k; P.tilt += (T.tilt - P.tilt) * k;
      for (let i = 0; i < 3; i++) P.col[i] += (T.col[i] - P.col[i]) * (snap ? 1 : 1 - Math.exp(-dt * 4));
      // lỡ có giá trị hỏng (NaN) thì nhảy thẳng tới đích thay vì giữ NaN mãi
      if (!Number.isFinite(P.gx + P.gy + P.tilt)) { P.gx = T.gx; P.gy = T.gy; P.tilt = T.tilt; }
      if (!P.col.every(Number.isFinite)) P.col = (T.col || CYAN).slice();
      for (const side of ['L', 'R']) for (const key in BASE) if (!Number.isFinite(P[side][key])) P[side][key] = Number.isFinite(T[side][key]) ? T[side][key] : BASE[key];
      const key = this.G ? this.G.k + (this.G.s || '') : '';
      if (key !== P.gkey) { P.ga -= dt * 6; if (P.ga <= 0 || snap) { P.gkey = key; P.G = this.G; P.ga = snap ? 1 : 0; } }
      else { P.G = this.G; P.ga = Math.min(1, P.ga + dt * 5); }
      if (t > this.nextBlink && !st.noBlink && !snap) { this.blinkT = t; this.nextBlink = t + 2.2 + Math.random() * 4; if (Math.random() < .2) this.nextBlink = t + .35; }
      const bt = t - this.blinkT; this.blink = bt < .07 ? bt / .07 : bt < .16 ? 1 - (bt - .07) / .09 : 0;
      if (this.forceBlink > t) this.blink = 1;
      const ht = t - this.hopT, hy = snap ? 0 : ht < .6 ? -Math.sin(ht / .6 * Math.PI) * 18 : 0;
      const breathe = snap ? 0 : Math.sin(t * 1.6) * 1.5;
      this.el.style.transform = `translateY(${breathe + hy - bob}px) rotate(${P.tilt * 30 + sway * 57 + this.extraTilt}deg)`;
      this.el.style.setProperty('--mc', P.col.map(Math.round).join(','));
      this.el.style.setProperty('--glow', M.on ? M.env : 0);
      this.render(t);
    }
    render(t) {
      const P = this.P, cv = this.cv, ctx = cv.getContext('2d');
      // canvas vẽ theo kích thước thật trên màn hình (sau khi phóng/thu) để LED luôn nét
      const sc = this.scale || 1;
      const W = Math.max(1, Math.round(BW * sc * devicePixelRatio)), H = Math.max(1, Math.round(BW * .76 * sc * devicePixelRatio));
      if (cv.width !== W || cv.height !== H) { cv.width = this.glowCv.width = W; cv.height = this.glowCv.height = H; }
      lx.clearRect(0, 0, GW, GH);
      lx.save(); lx.translate(GW / 2, GH / 2); lx.rotate(P.tilt * .5); lx.translate(-GW / 2, -GH / 2);
      eye(lx, P, P.L, -1, t, this.blink); eye(lx, P, P.R, 1, t, this.blink);
      if (P.G && P.ga > .02) drawGlyph(lx, P.G, P.ga, t);
      lx.restore();
      // thanh tiến độ dưới mắt (Pomodoro)
      if (this.bar != null) { lx.fillStyle = '#fff'; lx.globalAlpha = .28; lx.fillRect(8, 27, 32, 2); lx.globalAlpha = 1; lx.fillRect(8, 27, Math.max(1, Math.round(32 * this.bar)), 2); }
      const px = lx.getImageData(0, 0, GW, GH).data, g = this.glowCv.getContext('2d');
      const cell = Math.min(W / GW, H / GH), ox = (W - cell * GW) / 2, oy = (H - cell * GH) / 2;
      const tiny = cell < 2.2, gap = tiny ? 0 : cell * .12, s = cell - gap * 2;
      const [r, gg, bb] = P.col.map(Math.round);
      ctx.clearRect(0, 0, W, H); g.clearRect(0, 0, W, H);
      const br = Math.max(P.L.bright, P.R.bright);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const a = px[(j * GW + i) * 4 + 3] / 255, x = ox + i * cell + gap, y = oy + j * cell + gap;
        if (a > .3) { const c = `rgba(${r},${gg},${bb},${Math.min(1, a * 1.15) * br})`; ctx.fillStyle = g.fillStyle = c; ctx.fillRect(x, y, s, s); g.fillRect(x - cell * .1, y - cell * .1, s + cell * .2, s + cell * .2); }
        else if (!tiny) { ctx.fillStyle = `rgba(${r},${gg},${bb},.045)`; ctx.fillRect(x, y, s, s); }
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = `blur(${Math.max(1.5, cell * 1.3)}px)`; ctx.globalAlpha = .9; ctx.drawImage(this.glowCv, 0, 0); ctx.restore();
    }
  }
  function eye(ctx, P, e, side, t, blink) {
    const cx = GW / 2 + side * 10 + e.x + P.gx, cy = GH / 2 + e.y + P.gy, hh = Math.max(.6, e.h * (1 - blink * .92));
    ctx.save(); ctx.translate(cx, cy);
    const main = 1 - Math.max(e.heart, e.cross, e.spiral, e.star);
    if (main > .02 && e.w > .05) {
      ctx.globalAlpha = main; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(-e.w / 2, -hh / 2, e.w, hh, Math.max(0, Math.min(Math.min(e.w, hh) * e.r, hh / 2, e.w / 2))); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      if (e.lid > .01) { const a = -e.lidAng * side, yy = -hh / 2 + e.lid * hh; ctx.beginPath(); ctx.moveTo(-e.w, yy - Math.tan(a) * e.w); ctx.lineTo(e.w, yy + Math.tan(a) * e.w); ctx.lineTo(e.w, -hh * 2); ctx.lineTo(-e.w, -hh * 2); ctx.fill(); }
      if (e.happy > .01) { ctx.beginPath(); ctx.ellipse(0, hh * .5 + (1 - e.happy) * hh * 1.3, e.w * .42, hh * .78, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    if (e.heart > .02) { ctx.globalAlpha = e.heart; const s = 5.6 * (.9 + .12 * Math.sin(t * 8)); ctx.beginPath(); ctx.moveTo(0, s * .9); ctx.bezierCurveTo(-s * 1.6, -s * .1, -s * .9, -s * 1.3, 0, -s * .45); ctx.bezierCurveTo(s * .9, -s * 1.3, s * 1.6, -s * .1, 0, s * .9); ctx.fill(); }
    if (e.cross > .02) { ctx.globalAlpha = e.cross; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4.5, -4.5); ctx.lineTo(4.5, 4.5); ctx.moveTo(4.5, -4.5); ctx.lineTo(-4.5, 4.5); ctx.stroke(); }
    if (e.spiral > .02) { ctx.globalAlpha = e.spiral; ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 46; i++) { const a = i * .36 + t * 7 * side, rr = i * .12; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(0, 0); } ctx.stroke(); }
    if (e.star > .02) { ctx.globalAlpha = e.star; ctx.rotate(t * 1.5); ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 2.4 : 6; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawGlyph(c, G, a, t) {
    c.save(); c.globalAlpha = a; c.fillStyle = c.strokeStyle = '#fff'; c.lineWidth = 1;
    const off = G.blink && Math.floor(t * 2.5) % 2;
    if (G.draw) G.draw(c, t, a);
    else if (G.k === 'text') { c.font = 'bold 9px Consolas, monospace'; c.textAlign = 'center'; c.fillText(G.s, GW / 2 + 15, 8 + (G.dy || 0)); }
    else if (G.k === 'bat' || G.k === 'bigbat') {
      const big = G.k === 'bigbat', w = big ? 20 : 10, hh = big ? 11 : 6, x = big ? GW / 2 - 11 : GW / 2 + 8, y = big ? GH / 2 - 6 : 1;
      c.lineWidth = big ? 1.6 : 1; c.strokeRect(x + .5, y + .5, w, hh); c.fillRect(x + w + 1, y + hh / 2 - (big ? 2 : 1), big ? 2 : 1.5, big ? 5 : 3);
      if (!off) c.fillRect(x + 2, y + 2, Math.max(1, (w - 3) * G.v), hh - 3);
    } else if (G.k === 'drop') {
      const x = GW / 2 + 17.5, y = 3 + G.p * 9; c.globalAlpha = a * (1 - G.p * .5);
      c.beginPath(); c.moveTo(x, y - 3); c.quadraticCurveTo(x + 2.7, y + 1, x, y + 2.5); c.quadraticCurveTo(x - 2.7, y + 1, x, y - 3); c.fill();
    }
    c.restore();
  }

  // ----- hạt quanh robot ngày lễ: tuyết, pháo hoa, cánh hoa, tim, giấy màu, dơi (canvas do nơi gọi đặt)
  class Fx {
    constructor(cv) { this.cv = cv; this.kind = null; this.ps = []; }
    spawn(W, H) {
      const k = this.kind, R = Math.random;
      if (k === 'snow') return { x: R() * W, y: -5, vx: (R() - .5) * 12, vy: 18 + R() * 22, r: 1 + R() * 2.2, c: '#fff' };
      if (k === 'petals' || k === 'petals-pink') return { x: R() * W, y: -8, vx: 6 + R() * 12, vy: 14 + R() * 16, r: 2.6 + R() * 2, c: k === 'petals' ? (R() < .8 ? '#ffd21f' : '#ff6b3d') : (R() < .6 ? '#ff8fb1' : '#fff'), rot: R() * 6, petal: 1 };
      if (k === 'hearts') return { x: R() * W, y: H + 8, vx: (R() - .5) * 10, vy: -(16 + R() * 14), r: 3.5 + R() * 3, c: '#ff4d7a', heart: 1 };
      if (k === 'confetti') return { x: R() * W, y: -6, vx: (R() - .5) * 30, vy: 30 + R() * 30, r: 2 + R() * 2, c: ['#ff5a5f', '#ffd43b', '#5ac8fa', '#8b5cf6', '#58c95f'][Math.floor(R() * 5)], rot: R() * 6, rect: 1 };
      if (k === 'bats') return { x: -20, y: 10 + R() * H * .5, vx: 40 + R() * 30, vy: (R() - .5) * 10, r: 5 + R() * 3, c: '#2a1f3d', bat: 1, ph: R() * 6 };
      return null;
    }
    burst(W, H) {
      const x = W * (.15 + Math.random() * .7), y = H * (.1 + Math.random() * .3), col = ['#ffd43b', '#ff5a5f', '#5ac8fa', '#fff', '#ff8a1f'][Math.floor(Math.random() * 5)];
      for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, s = 30 + Math.random() * 40; this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.4, life: 1.2, c: col, g: 1 }); }
    }
    once(kind, ms = 2200) { const prev = this.kind; this.kind = kind; clearTimeout(this._t); this._t = setTimeout(() => { if (this.kind === kind) this.kind = prev === kind ? null : prev; }, ms); }
    step(dt, nowMs) {
      const cv = this.cv, W = cv.width, H = cv.height, c = cv.getContext('2d');
      c.clearRect(0, 0, W, H);
      if (!this.kind && !this.ps.length) return;
      if (this.kind === 'fireworks') { if (Math.random() < dt * .7) this.burst(W, H); }
      else if (this.kind && this.ps.length < (this.kind === 'bats' ? 3 : 30) && Math.random() < dt * (this.kind === 'bats' ? .5 : this.kind === 'confetti' ? 30 : 8)) { const p = this.spawn(W, H); if (p) this.ps.push(p); }
      this.ps = this.ps.filter((p) => (p.life == null || p.life > 0) && p.y < H + 20 && p.y > -30 && p.x < W + 30);
      for (const p of this.ps) {
        p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) { p.vy += 40 * dt; p.vx *= .98; p.life -= dt; } if (p.rot != null) p.rot += dt * 3;
        c.save(); c.globalAlpha = p.g ? Math.max(0, p.life) : .85; c.fillStyle = p.c; c.translate(p.x, p.y);
        if (p.petal) { c.rotate(p.rot); c.beginPath(); c.ellipse(0, 0, p.r, p.r * .55, 0, 0, 7); c.fill(); }
        else if (p.rect) { c.rotate(p.rot); c.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); }
        else if (p.heart) { const s = p.r; c.beginPath(); c.moveTo(0, s * .9); c.bezierCurveTo(-s * 1.6, -s * .1, -s * .9, -s * 1.3, 0, -s * .45); c.bezierCurveTo(s * .9, -s * 1.3, s * 1.6, -s * .1, 0, s * .9); c.fill(); }
        else if (p.bat) { const f = Math.sin(nowMs / 90 + p.ph) * p.r * .6; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-p.r, -f - 2, -p.r * 2, -f); c.quadraticCurveTo(-p.r, 2, 0, 3); c.quadraticCurveTo(p.r, 2, p.r * 2, -f); c.quadraticCurveTo(p.r, -f - 2, 0, 0); c.fill(); }
        else { c.beginPath(); c.arc(0, 0, p.r, 0, 7); c.fill(); }
        c.restore();
      }
    }
  }

  // ----- tiếng bíp kiểu R2-D2 (tổng hợp, rất nhỏ)
  let actx = null;
  const BEEPS = { done: [[880, .07], [1320, .07], [1760, .12]], ask: [[1200, .06], [900, .06], [1400, .1]], err: [[420, .12], [300, .18]], love: [[1500, .05], [2000, .05], [1700, .05], [2300, .09]], dizzy: [[1800, .05], [600, .05], [1500, .05], [500, .08]], level: [[880, .06], [1100, .06], [1320, .06], [1760, .16]] };
  function beep(kind) {
    const seq = BEEPS[kind]; if (!seq) return;
    try {
      actx = actx || new AudioContext(); let t = actx.currentTime + .01;
      for (const [f, d] of seq) { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.15, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.04, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .02); t += d + .025; }
    } catch {}
  }

  // ghép trang phục: ngày lễ (tự mặc, đè phụ kiện) hoặc phụ kiện người dùng chọn + đạo cụ theo việc đang làm
  function outfit(ev, wear, propKey) {
    let pr = propKey && PROPS[propKey];
    let back = '', front = '';
    if (ev) {
      back = ev.back || ''; front = ev.front || '';
      if (pr && ((pr.hand && ev.hand) || pr.hat)) pr = null;
    } else {
      const on = ACC.filter((a) => (wear || []).includes(a.id) && !(pr && pr.hat && a.hat) && !(propKey === 'reading' && a.eyes));
      back = on.filter((a) => a.back).map((a) => a.svg).join('');
      front = on.filter((a) => !a.back).map((a) => a.svg).join('');
    }
    return { back, front, prop: pr ? pr.svg : '' };
  }

  window.BotKit = { outfit, Bot, Fx, STATES, PROPS, ACC, COLORS, M, BW, CYAN, AMBER, levelOf, beep, rainbow, now };
})();
