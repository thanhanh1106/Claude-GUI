// Linh vật robot mắt LED — bộ vẽ dùng chung cho các demo.
// Emo.create(parent, { w, follow, color }) → bot: state(name, why), switchTo(name, why, style), look(x, y), tint('5h'|'week'|null), hop(), el
// Emo.music('chill'|'edm'|'sad'|null) — nhạc dùng chung cho mọi robot (giống nhạc đang phát trên máy)
(function () {
  const GW = 48, GH = 30;
  const BASE = { x: 0, y: 0, w: 11, h: 12, r: .38, lid: 0, lidAng: 0, happy: 0, heart: 0, cross: 0, spiral: 0, star: 0, bright: 1 };
  const CYAN = [63, 242, 255], AMBER = [255, 188, 70], ORANGE = [255, 132, 62], RED = [255, 84, 84];
  const lo = document.createElement('canvas'); lo.width = GW; lo.height = GH;
  const lx = lo.getContext('2d', { willReadFrequently: true });
  const now = () => performance.now() / 1000;

  const css = document.createElement('style');
  css.textContent = `
  .emo { --w: 240; position:relative; width:calc(var(--w) * 1px); height:calc(var(--w) * .76px); transform-origin:50% 85%; will-change:transform; cursor:pointer; user-select:none; }
  .emo-face { position:absolute; inset:0; border-radius:30% / 38%; overflow:hidden;
    background:radial-gradient(120% 95% at 50% 35%, #111823 0%, #06090e 62%, #030407 100%);
    border:calc(max(1, var(--w) * .008) * 1px) solid var(--emo-rim, #343b48);
    box-shadow: 0 calc(var(--w) * .05px) calc(var(--w) * .14px) rgba(0,0,0,.45), 0 0 calc(var(--w) * .09px) rgba(var(--emo-c), calc(.10 + var(--emo-glow, 0) * .25)); }
  .emo-face::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
    background:linear-gradient(160deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.02) 30%, transparent 42%); }
  .emo canvas { position:absolute; inset:0; width:100%; height:100%; }
  .emo-ph { position:absolute; z-index:3; left:-13%; right:-13%; top:-22%; bottom:22%; pointer-events:none; opacity:0; transform:translateY(-55%) scale(.92); transition:transform .7s cubic-bezier(.3,1.5,.5,1), opacity .35s; }
  .emo.music .emo-ph { opacity:1; transform:none; }
  .emo-ph svg { width:100%; height:100%; overflow:visible; }
  .emo-ring { opacity:calc(.5 + var(--beat, 0) * .5); filter:drop-shadow(0 0 calc(var(--w) * .025px * (.4 + var(--beat, 0))) #5aa8ff); }
  .emo-note { position:fixed; z-index:9999; pointer-events:none; color:rgb(var(--emo-c)); text-shadow:0 0 8px rgb(var(--emo-c)); animation:emoNote 2.3s ease-out forwards; }
  @keyframes emoNote { from { transform:translate(0,0); opacity:0 } 15% { opacity:1 } to { transform:translate(var(--dx), -110px) rotate(var(--rot)); opacity:0 } }`;
  document.head.append(css);

  const PHONES = `<svg viewBox="0 0 300 250"><defs><linearGradient id="emoBand" x1="0" x2="1"><stop offset="0" stop-color="#3b3f8f"/><stop offset=".5" stop-color="#6e74d8"/><stop offset="1" stop-color="#3b3f8f"/></linearGradient></defs>
    <path d="M24 150 C 14 -28, 286 -28, 276 150" fill="none" stroke="url(#emoBand)" stroke-width="15" stroke-linecap="round"/>
    <rect x="2" y="112" width="40" height="92" rx="20" fill="#363a86"/><rect x="258" y="112" width="40" height="92" rx="20" fill="#363a86"/>
    <rect class="emo-ring" x="9" y="121" width="26" height="74" rx="13" fill="none" stroke="#5ab0ff" stroke-width="4"/><rect class="emo-ring" x="265" y="121" width="26" height="74" rx="13" fill="none" stroke="#5ab0ff" stroke-width="4"/></svg>`;

  // ================= Trạng thái =================
  const S = {
    idle: { name: 'Rảnh', why: 'Không có việc: chớp mắt, liếc quanh, nhìn theo chuột.', sp: 6,
      set(b, t) { b.eyes({}); const k = Math.floor(t / 3.2) % 5; b.T.gx = [0, -4, 0, 3, 0][k]; b.T.gy = [0, -1, 0, 1, 0][k]; } },
    typing: { name: 'Bạn đang gõ', why: 'Bạn gõ trong ô chat: nhìn xuống ô nhập, chăm chú.', sp: 8,
      set(b, t) { b.eyes({ h: 13, w: 11.5 }); b.T.gx = Math.sin(t * 3) * 1.2; b.T.gy = 4; } },
    thinking: { name: 'Đang suy nghĩ', why: 'Claude đang nghĩ: liếc lên, hơi nheo, có "…".', sp: 4,
      set(b, t) { b.eyes({ lid: .18, h: 11 }); const s = Math.sin(t * .9); b.T.gx = s * 4; b.T.gy = -4 + Math.abs(s); const n = Math.floor(t * 2.2) % 4; if (n) b.glyph({ k: 'text', s: '·'.repeat(n), dy: -1 }); } },
    reading: { name: 'Đang đọc tệp', why: 'Read / Grep / Glob: mắt dẹt, quét từng dòng.', sp: 14,
      set(b, t) { b.eyes({ h: 7, w: 12, r: .5 }); const ph = (t * .9) % 1; b.T.gx = -5 + ph * 10; b.T.gy = 2 + Math.floor((t * .9) % 4); } },
    writing: { name: 'Đang sửa code', why: 'Edit / Write: cau mày quyết tâm, nhìn xuống, giật nhẹ như gõ phím.', sp: 18,
      set(b, t) { b.eyes({ lid: .32, lidAng: .32, h: 11 }); b.T.gx = Math.round(Math.sin(t * 9)) * .8; b.T.gy = 3; } },
    bash: { name: 'Đang chạy lệnh', why: 'Bash: một mắt nheo, liếc sang chờ kết quả.', sp: 6,
      set(b, t) { b.eyes({ lid: .45, lidAng: -.1 }, { lid: .05 }); b.T.gx = 4 + Math.sin(t * 2) * .6; b.T.gy = 1; } },
    web: { name: 'Đang tra web', why: 'WebSearch / WebFetch: mắt to tò mò, đảo vòng.', sp: 7,
      set(b, t) { b.eyes({ w: 12.5, h: 13.5, r: .6 }); b.T.gx = Math.cos(t * 2.2) * 4; b.T.gy = Math.sin(t * 2.2) * 2.5; } },
    agents: { name: 'Chỉ huy tác tử phụ', why: 'Có subagent chạy nền: liếc trái phải canh từng đứa.', sp: 9,
      set(b, t) { b.eyes({ lid: .12 }); b.T.gx = [-6, 0, 6, 0][Math.floor(t / .9) % 4]; } },
    permission: { name: 'Chờ bạn cấp quyền', why: 'Hộp xin quyền / câu hỏi: mắt tròn nhìn bạn, nghiêng đầu, "?".', sp: 7,
      set(b, t) { b.eyes({ w: 12.5, h: 14, r: .9 }); b.T.tilt = .16; b.glyph({ k: 'text', s: '?', dy: Math.sin(t * 4) }); } },
    done: { name: 'Xong việc', why: 'Lượt xong, thành công: cười tít ^^.', sp: 10,
      set(b) { b.eyes({ happy: 1, h: 11 }); b.T.gy = -1; } },
    celebrate: { name: 'Xong việc dài', why: 'Lượt > 15 giây xong ngon: mắt sao rồi tim, nhảy mừng.', sp: 10,
      set(b, t) { b.eyes((t % 3) < 1.5 ? { star: 1 } : { heart: 1 }); } },
    error: { name: 'Gặp lỗi', why: 'CLI / công cụ lỗi: mắt X đỏ rồi buồn rũ.', sp: 9,
      set(b, t) { if ((t % 4) < 1.4) { b.eyes({ cross: 1 }); b.T.col = RED; } else { b.eyes({ lid: .42, lidAng: -.38, h: 10, bright: .8 }); b.T.gy = 3; } } },
    stopped: { name: 'Bị dừng giữa chừng', why: 'Bạn bấm Dừng: giật mình, rồi ngượng nhìn đi chỗ khác.', sp: 12,
      set(b, t) { const a = (t % 3.5) < .7; a ? b.eyes({ w: 13, h: 15, r: .8 }) : b.eyes({ lid: .3, lidAng: -.2, h: 9 }); b.T.gx = a ? 0 : -5; b.T.gy = a ? -1 : 3; } },
    compact: { name: 'Đang nén ngữ cảnh', why: '/compact: mắt xoáy ốc chóng mặt.', sp: 8,
      set(b, t) { b.eyes({ spiral: 1 }); b.T.gx = Math.sin(t * 3) * 1.5; } },
    sleep: { name: 'Ngủ', why: 'Rảnh lâu > 10 phút: mắt vạch, "Zzz".', sp: 3, noBlink: true,
      set(b, t) { b.eyes({ h: 1.6, w: 10, r: .5, bright: .55 }); b.T.gy = 3 + Math.sin(t * 1.2) * .6; const z = ['z', 'zZ', 'zZz', ''][Math.floor(t * 1.3) % 4]; if (z) b.glyph({ k: 'text', s: z, dy: -Math.sin(t) * 1.5 }); } },
    love: { name: 'Được khen / bấm vào', why: 'Bạn bấm vào robot hoặc khen: mắt tim.', sp: 10, noBlink: true,
      set(b) { b.eyes({ heart: 1 }); } },
    limit5: { name: 'Sắp hết giới hạn 5 giờ', why: 'Đã dùng ≥ 80% giới hạn 5 giờ: mắt hổ phách, mí nặng trĩu, cục pin yếu nhấp nháy, thỉnh thoảng ngáp.', sp: 4,
      set(b, t) { b.T.col = AMBER; const yawn = (t % 7) > 5.6; b.eyes(yawn ? { lid: .6, h: 6, w: 12 } : { lid: .42, h: 10 }); b.T.gy = 2; b.T.gx = Math.sin(t * .5) * 1.5; b.glyph({ k: 'bat', v: .2, blink: true }); } },
    limitW: { name: 'Sắp hết giới hạn tuần', why: 'Đã dùng ≥ 80% giới hạn tuần: mắt cam, lo lắng run run, toát mồ hôi.', sp: 10,
      set(b, t) { b.T.col = ORANGE; b.eyes({ lid: .3, lidAng: -.35, h: 11 }); b.T.gx = Math.sin(t * 23) * .5 + (Math.floor(t / 1.6) % 2 ? -3 : 3); b.T.gy = 1; b.glyph({ k: 'drop', p: (t % 1.8) / 1.8 }); } },
    limitOut: { name: 'Hết giới hạn', why: 'Chạm 100%: mắt tắt gần hết, pin cạn đỏ nhấp nháy, chờ tới giờ hồi.', sp: 5, noBlink: true,
      set(b) { b.T.col = RED; b.eyes({ h: .5, w: 1, bright: .5 }); b.glyph({ k: 'bigbat', v: .1, blink: true }); } },
    recharged: { name: 'Giới hạn vừa hồi', why: 'Tới giờ hồi: pin sạc đầy dần rồi mắt cười, nhún một cái.', sp: 8,
      set(b, t) { if (t < 1.6) { b.eyes({ h: .5, w: 1 }); b.glyph({ k: 'bigbat', v: Math.min(1, t / 1.3) }); } else { b.eyes({ happy: 1, h: 11 }); if (!b._hopped) { b._hopped = 1; b.hop(); } } } },
  };

  // ================= Robot =================
  const bots = [];
  class Bot {
    constructor(parent, o = {}) {
      this.base = o.color || CYAN;
      this.el = document.createElement('div'); this.el.className = 'emo'; this.el.style.setProperty('--w', o.w || 240);
      this.el.innerHTML = `<div class="emo-ph">${PHONES}</div><div class="emo-face"><canvas></canvas></div>`;
      parent.append(this.el);
      this.cv = this.el.querySelector('canvas'); this.glowCv = document.createElement('canvas');
      this.P = { L: { ...BASE }, R: { ...BASE }, gx: 0, gy: 0, tilt: 0, col: this.base.slice(), G: null, gkey: '', ga: 0 };
      this.T = { L: { ...BASE }, R: { ...BASE }, gx: 0, gy: 0, tilt: 0, col: this.base.slice() };
      this.s = 'idle'; this.t0 = now(); this.blinkT = -9; this.nextBlink = now() + 1; this.forceBlink = 0; this.hopT = -9; this.turnT = -9;
      this.lookAt = null; this.mouse = null; this.tintKind = null; this.snap = !!o.snap;
      if (o.follow !== false) addEventListener('mousemove', (e) => {
        const r = this.el.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
        this.mouse = Math.hypot(dx, dy) < 420 ? { x: Math.max(-1, Math.min(1, dx / 260)), y: Math.max(-1, Math.min(1, dy / 200)) } : null;
      });
      if (o.click !== false) this.el.addEventListener('click', () => { if (this.el._dragged) return; const prev = this.s, why = this.why; this.state('love'); this.hop(); setTimeout(() => this.s === 'love' && this.state(prev, why), 1500); });
      bots.push(this);
    }
    eyes(o, oR) { Object.assign(this.T.L, BASE, o); Object.assign(this.T.R, BASE, o, oR || {}); }
    glyph(g) { this.G = g; }
    state(s, why) { if (!S[s]) return; if (s !== this.s) { this.s = s; this.t0 = now(); this._hopped = 0; if (['done', 'celebrate'].includes(s)) this.hop(); } this.why = why; if (this.onState) this.onState(s, why); }
    switchTo(s, why, style) {
      if (style === 'morph') return this.state(s, why);
      this.forceBlink = now() + (style === 'turn' ? .12 : .16);
      if (style === 'turn') { this.turnT = now(); this.P.gx = -10; }
      setTimeout(() => this.state(s, why), style === 'turn' ? 200 : 150);
    }
    look(x, y) { this.lookAt = x == null ? null : { x, y }; }
    tint(k) { this.tintKind = k; }
    hop() { this.hopT = now(); }
    tick(t, dt) {
      const st = S[this.s], T = this.T, P = this.P;
      T.tilt = 0; T.gx = 0; T.gy = 0; this.G = null;
      T.col = this.tintKind === 'week' ? ORANGE : this.tintKind === '5h' ? AMBER : this.base;
      st.set(this, t - this.t0);
      let bob = 0, sway = 0;
      if (M.on) {
        const m = M.mood;
        if (['idle', 'sleep', 'done'].includes(this.s)) {
          if (m === 'edm') this.eyes({ happy: .9, h: 11 + M.env * 4, w: 11 + M.env * 2 });
          else if (m === 'chill') this.eyes({ happy: .55, lid: .25, h: 10 });
          else this.eyes({ lid: .4, lidAng: -.3, h: 9, bright: .85 });
          T.gx = 0; T.gy = 0; this.G = null;
        }
        bob = m === 'edm' ? M.env * 14 : m === 'chill' ? M.env * 6 : 0;
        sway = m === 'sad' ? Math.sin(t * 1.1) * .06 : m === 'chill' ? Math.sin(t * Math.PI * 80 / 60) * .05 : Math.sin(t * Math.PI * 128 / 60) * .03;
        this.el.style.setProperty('--beat', M.env.toFixed(3));
      }
      if (this.lookAt) { T.gx = this.lookAt.x * 6; T.gy = this.lookAt.y * 4; }
      else if (this.mouse && this.s === 'idle' && !M.on) { T.gx = this.mouse.x * 5; T.gy = this.mouse.y * 3; }
      if (!this.G && this.tintKind && !this.s.startsWith('limit') && (t % 6) < 2) this.G = { k: 'drop', p: (t % 6) / 2 };
      const k = this.snap ? 1 : 1 - Math.exp(-dt * st.sp);
      for (const side of ['L', 'R']) for (const key in BASE) P[side][key] += (T[side][key] - P[side][key]) * k;
      P.gx += (T.gx - P.gx) * k; P.gy += (T.gy - P.gy) * k; P.tilt += (T.tilt - P.tilt) * k;
      for (let i = 0; i < 3; i++) P.col[i] += (T.col[i] - P.col[i]) * (this.snap ? 1 : 1 - Math.exp(-dt * 4));
      const key = this.G ? this.G.k + (this.G.s || '') : '';
      if (key !== P.gkey) { P.ga -= dt * 6; if (P.ga <= 0 || this.snap) { P.gkey = key; P.G = this.G; P.ga = this.snap ? 1 : 0; } }
      else { P.G = this.G; P.ga = Math.min(1, P.ga + dt * 5); }
      if (t > this.nextBlink && !st.noBlink) { this.blinkT = t; this.nextBlink = t + 2.2 + Math.random() * 4; if (Math.random() < .2) this.nextBlink = t + .35; }
      const bt = t - this.blinkT; this.blink = bt < .07 ? bt / .07 : bt < .16 ? 1 - (bt - .07) / .09 : 0;
      if (this.forceBlink > t) this.blink = 1;
      const sc = (+this.el.style.getPropertyValue('--w') || 240) / 240;
      const ht = t - this.hopT, hy = ht < .6 ? -Math.sin(ht / .6 * Math.PI) * 18 : 0;
      const tt = t - this.turnT, turn = tt < .55 ? Math.sin(tt / .55 * Math.PI) : 0;
      const extra = this.extraTilt || 0;
      this.el.style.transform = `translateY(${(Math.sin(t * 1.6) * 1.5 + hy - bob) * sc}px) rotate(${P.tilt * 30 + sway * 57 + extra}deg) scaleX(${1 - turn * .12})`;
      this.el.style.setProperty('--emo-c', P.col.map(Math.round).join(','));
      this.el.style.setProperty('--emo-glow', M.on ? M.env : 0);
      this.render(t);
    }
    render(t) {
      const P = this.P, cv = this.cv, ctx = cv.getContext('2d');
      const W = Math.round(cv.clientWidth * devicePixelRatio), H = Math.round(cv.clientHeight * devicePixelRatio);
      if (!W || !H) return;
      if (cv.width !== W || cv.height !== H) { cv.width = this.glowCv.width = W; cv.height = this.glowCv.height = H; }
      lx.clearRect(0, 0, GW, GH);
      lx.save(); lx.translate(GW / 2, GH / 2); lx.rotate(P.tilt * .5); lx.translate(-GW / 2, -GH / 2);
      eye(lx, P, P.L, -1, t, this.blink); eye(lx, P, P.R, 1, t, this.blink);
      if (P.G && P.ga > .02) drawGlyph(lx, P.G, P.ga, t);
      lx.restore();
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
    const cx = GW / 2 + side * 10 + e.x + P.gx, cy = GH / 2 + e.y + P.gy, h = Math.max(.6, e.h * (1 - blink * .92));
    ctx.save(); ctx.translate(cx, cy);
    const main = 1 - Math.max(e.heart, e.cross, e.spiral, e.star);
    if (main > .02) {
      ctx.globalAlpha = main; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(-e.w / 2, -h / 2, e.w, h, Math.min(Math.min(e.w, h) * e.r, h / 2, e.w / 2)); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      if (e.lid > .01) { const a = -e.lidAng * side, yy = -h / 2 + e.lid * h; ctx.beginPath(); ctx.moveTo(-e.w, yy - Math.tan(a) * e.w); ctx.lineTo(e.w, yy + Math.tan(a) * e.w); ctx.lineTo(e.w, -h * 2); ctx.lineTo(-e.w, -h * 2); ctx.fill(); }
      if (e.happy > .01) { ctx.beginPath(); ctx.ellipse(0, h * .5 + (1 - e.happy) * h * 1.3, e.w * .42, h * .78, 0, 0, Math.PI * 2); ctx.fill(); }
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
      const big = G.k === 'bigbat', w = big ? 20 : 10, h = big ? 11 : 6, x = big ? GW / 2 - 11 : GW / 2 + 8, y = big ? GH / 2 - 6 : 1;
      c.lineWidth = big ? 1.6 : 1; c.strokeRect(x + .5, y + .5, w, h); c.fillRect(x + w + 1, y + h / 2 - (big ? 2 : 1), big ? 2 : 1.5, big ? 5 : 3);
      if (!off) c.fillRect(x + 2, y + 2, Math.max(1, (w - 3) * G.v), h - 3);
    } else if (G.k === 'drop') {
      const x = GW / 2 + 17.5, y = 3 + G.p * 9; c.globalAlpha = a * (1 - G.p * .5);
      c.beginPath(); c.moveTo(x, y - 3); c.quadraticCurveTo(x + 2.7, y + 1, x, y + 2.5); c.quadraticCurveTo(x - 2.7, y + 1, x, y - 3); c.fill();
    }
    c.restore();
  }

  // ================= Nhạc (tổng hợp bằng WebAudio, phân tích âm lượng để lấy nhịp) =================
  const M = { on: false, env: 0 };
  let AC = null;
  function music(mood) {
    if (M.on) { clearInterval(M.timer); const o = M.out; o.gain.setTargetAtTime(0, AC.currentTime, .05); setTimeout(() => o.disconnect(), 400); M.on = false; M.env = 0; }
    bots.forEach((b) => { b.el.classList.toggle('music', !!mood); b.el.style.setProperty('--beat', 0); });
    if (!mood) return;
    AC = AC || new AudioContext();
    const out = AC.createGain(); out.gain.value = .5; const an = AC.createAnalyser(); an.fftSize = 1024; out.connect(an); an.connect(AC.destination);
    const buf = new Float32Array(an.fftSize), bpm = mood === 'edm' ? 128 : mood === 'chill' ? 80 : 62, beat = 60 / bpm;
    let nextT = AC.currentTime + .05, step = 0;
    const kick = (t, v) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .18); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(g); g.connect(out); o.start(t); o.stop(t + .32); };
    const hat = (t, v) => { const b = AC.createBuffer(1, AC.sampleRate * .05, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'highpass'; f.frequency.value = 7000; s.buffer = b; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .05); s.connect(f); f.connect(g); g.connect(out); s.start(t); };
    const tone = (t, f, d, v, type) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + .05); };
    const CH = { chill: [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 207.7, 246.9]], sad: [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 196, 261.6], [164.8, 196, 246.9]], edm: [[110], [87.3], [98], [82.4]] };
    M.timer = setInterval(() => {
      while (nextT < AC.currentTime + .2) {
        const bar = Math.floor(step / 8) % 4, s8 = step % 8, half = beat / 2;
        if (mood === 'edm') { if (s8 % 2 === 0) kick(nextT, .95); else { hat(nextT, .35); tone(nextT, CH.edm[bar][0], half * .9, .22, 'sawtooth'); } }
        else if (mood === 'chill') { if (s8 === 0 || s8 === 5) kick(nextT, .55); if (s8 % 2) hat(nextT, .12); if (s8 === 0) CH.chill[bar].forEach((f) => tone(nextT, f, beat * 3.6, .07)); }
        else { if (s8 % 2 === 0) tone(nextT, CH.sad[bar][(s8 / 2) % 3] * 2, beat * 1.8, .16, 'sine'); if (s8 === 0) tone(nextT, CH.sad[bar][0] / 2, beat * 3.8, .14, 'sine'); }
        nextT += half; step++;
      }
    }, 50);
    Object.assign(M, { on: true, mood, out, level() { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.min(1, Math.sqrt(s / buf.length) * (mood === 'sad' ? 4 : 2.6)); } });
  }
  function note(b) {
    const n = document.createElement('div'); n.className = 'emo-note'; n.textContent = '♪♫♩♬'[Math.floor(Math.random() * 4)];
    const r = b.el.getBoundingClientRect(), left = Math.random() < .5, sc = r.width / 240;
    n.style.fontSize = Math.max(11, 22 * sc) + 'px'; n.style.left = (left ? r.left - 8 : r.right) + 'px'; n.style.top = (r.top + r.height * .4) + 'px';
    n.style.setProperty('--emo-c', b.el.style.getPropertyValue('--emo-c'));
    n.style.setProperty('--dx', (left ? -1 : 1) * (15 + Math.random() * 40) * Math.max(.4, sc) + 'px'); n.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
    document.body.append(n); setTimeout(() => n.remove(), 2400);
  }

  let last = now();
  function loop() {
    const t = now(), dt = Math.min(.05, t - last); last = t;
    if (M.on) { M.env = Math.max(M.level(), M.env * .9); }
    for (const b of bots) { if (!b.el.isConnected || !b.el.offsetParent) continue; b.tick(t, dt); if (M.on && Math.random() < dt * (M.mood === 'edm' ? 1.6 : .8)) note(b); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.Emo = { create: (p, o) => new Bot(p, o), music, STATES: S, get musicOn() { return M.on ? M.mood : null; } };
})();
