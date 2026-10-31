'use strict';
// Trang trí: ảnh/ảnh động/video nền (tự tìm chủ thể để cắt bố cục), màu nhấn tự chọn, hiệu ứng khi xong việc,
// logo động, viền cầu vồng khi đang chạy, vệt sáng con trỏ, bong bóng gradient, âm thanh, tự đổi chủ đề theo giờ, linh vật.
// Mọi hiệu ứng động tắt được ("Giảm hiệu ứng") và tự dừng khi cửa sổ bị ẩn.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, h } = CG;
  const S = () => CG.S;

  const DEFAULTS = {
    bg: null, // { path, kind, name, strength, blur, fit, place, glass, calm, focal }
    bgPool: [], // kho tự đổi ảnh nền: [{ id, path, kind, name, crop, area, focal, slot }] — mỗi ảnh có vùng cắt riêng
    bgRot: null, // { on, mode: seq | rand | slot, every (phút, 0 = mỗi lần mở app), fx, noRep, idle, cur, last, seen }
    accent: '',
    doneFx: 'off', // off | confetti | bloom
    logoFx: 'off', // off | rainbow | glow
    busyBorder: true,
    cursorTrail: false,
    gradBubble: false,
    sound: { on: false, vol: 0.5, send: true, done: true, perm: true },
    autoTheme: { on: false, light: 'sakura', dark: 'onedark', from: '06:00', to: '18:00' },
    mascot: 'robot', // off | robot (mascot.js) — 'cat' cũ coi như robot
    mascotPos: 'corner', mascotSize: 1, mascotMusic: true,
    reduceMotion: false,
  };
  const BG_DEFAULT = { strength: 40, blur: 0, fit: 'crop', area: 'chat', glass: true, calm: true };
  const cfg = () => {
    const d = (S().settings && S().settings.decor) || {};
    return { ...DEFAULTS, ...d, sound: { ...DEFAULTS.sound, ...(d.sound || {}) }, autoTheme: { ...DEFAULTS.autoTheme, ...(d.autoTheme || {}) } };
  };
  async function save(patch) {
    const cur = (S().settings && S().settings.decor) || {};
    S().settings = await api.setSettings({ decor: { ...cur, ...patch } });
    apply();
    return cfg();
  }
  // Chỉ công tắc "Giảm hiệu ứng" của app quyết định. Không theo prefers-reduced-motion của Windows: máy tắt
  // "Animation effects" / chọn "Best performance" / qua Remote Desktop đều báo reduce → hiệu ứng người dùng bật bị tắt ngầm.
  const reduced = () => !!cfg().reduceMotion;
  const osReduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');

  // =====================================================================
  // Ảnh nền
  // =====================================================================
  const BG = { layer: null, media: null, veil: null, src: '', iw: 0, ih: 0, focal: null, ro: null };
  function ensureLayer() {
    if (BG.layer) return;
    BG.media = h('div', { id: 'bg-media' });
    BG.veil = h('div', { id: 'bg-veil' });
    BG.layer = h('div', { id: 'bg-layer', 'aria-hidden': 'true' }, BG.media, BG.veil);
    document.body.prepend(BG.layer);
    BG.ro = new ResizeObserver(() => layoutBg());
    const col = $('#chat-col');
    if (col) BG.ro.observe(col);
    window.addEventListener('resize', () => layoutBg());
    document.addEventListener('visibilitychange', () => {
      const v = BG.media.querySelector('video');
      if (v) { if (document.hidden || reduced()) v.pause(); else v.play().catch(() => {}); }
      // Ảnh động không chạy khi khung bị ẩn → không tốn CPU
      BG.media.style.visibility = document.hidden ? 'hidden' : '';
    });
    // Ảnh nền động hay bị đứng: Chromium tự dừng video (cửa sổ bị che hết, tiết kiệm pin, giải mã bị kẹt) hoặc play() bị từ chối
    // một lần là không ai gọi lại → mỗi 3 giây kiểm tra: đáng lẽ phải chạy mà đang dừng / khung hình không nhích thì cho chạy lại.
    const kick = () => {
      const v = BG.media.querySelector('video');
      if (!v || document.hidden || reduced() || v.readyState < 2) { BG.vt = null; return; }
      if (v.paused || v.ended) { v.play().catch(() => {}); BG.vt = null; return; }
      if (BG.vt != null && v.currentTime === BG.vt) {
        // giải mã bị kẹt: tua nhẹ để trình phát nạp lại khung hình (không load() lại — sẽ chèn video thêm lần nữa)
        if (++BG.stuck >= 2) { BG.stuck = 0; try { v.currentTime = (v.currentTime + 0.05) % (v.duration || 1e9); } catch {} v.play().catch(() => {}); }
      } else BG.stuck = 0;
      BG.vt = v.currentTime;
    };
    BG.stuck = 0;
    setInterval(kick, 3000);
    window.addEventListener('focus', kick);
  }
  function applyBg() {
    const c = cfg();
    const b = c.bg && c.bg.path ? { ...BG_DEFAULT, ...c.bg } : null;
    document.body.classList.toggle('has-bg', !!b);
    if (!b) { if (BG.layer) { BG.media.innerHTML = ''; BG.src = ''; } return; }
    ensureLayer();
    const root = document.documentElement.style;
    root.setProperty('--bg-veil', String(1 - b.strength / 100));
    root.setProperty('--bg-blur', b.blur + 'px');
    document.body.classList.toggle('bg-glass', b.glass !== false);
    document.body.classList.toggle('bg-calm', b.calm !== false);
    const key = b.path + '|' + b.kind + '|' + reduced();
    if (BG.src === key) {
      // Chọn lại đúng ảnh đang dùng → giữ kết quả phân tích chủ thể
      if (BG.focal && !(b.focal && b.focal.v === 3)) { save({ bg: { ...c.bg, focal: BG.focal } }); return; }
      layoutBg();
      return;
    }
    BG.src = key;
    const fxK = rotCfg().fx;
    if (BG.media.childNodes.length && !reduced() && fxK !== 'none') {
      if (BG.old) BG.old.remove();
      const old = h('div', { class: 'bg-old' });
      old.append(...BG.media.childNodes);
      BG.layer.insertBefore(old, BG.media); // nằm dưới ảnh mới
      BG.old = old;
      BG.media.classList.add('swap');
      BG.media.classList.toggle('zoom', fxK === 'zoom');
      setTimeout(() => { if (BG.old === old) { old.remove(); BG.old = null; } }, 10000); // ảnh mới không nạp được thì cũng bỏ ảnh cũ
    }
    BG.media.innerHTML = '';
    BG.focal = b.focal && b.focal.v === 3 ? b.focal : null;
    const url = fileUrl(b.path);
    const ready = (el, iw, ih) => {
      if (!BG.src.startsWith(b.path)) return;
      BG.iw = iw; BG.ih = ih;
      // Giảm hiệu ứng: ảnh động → chỉ khung đầu
      if (reduced() && b.kind === 'image' && /\.(gif|webp|apng|png)$/i.test(b.path)) {
        const cv = h('canvas', { width: iw, height: ih });
        try { cv.getContext('2d').drawImage(el, 0, 0); el = cv; } catch {}
      }
      el.classList.add('bg-el');
      BG.media.innerHTML = '';
      // Lớp lấp phía sau (dùng khi đặt trọn ảnh): bản thu nhỏ của khung đầu, kéo giãn + làm nhoè
      const fill = h('canvas', { class: 'bg-fill hidden', width: 48, height: Math.max(8, Math.round(48 * ih / iw)) });
      try { fill.getContext('2d').drawImage(el, 0, 0, fill.width, fill.height); } catch {}
      BG.fill = fill;
      BG.el = el;
      BG.media.append(fill, el);
      if (!BG.focal) {
        BG.focal = analyzeFocal(el, iw, ih);
        if (BG.focal) save({ bg: { ...c.bg, focal: BG.focal } });
      }
      layoutBg();
      BG.media.classList.add('in');
      if (BG.old) { const o = BG.old; BG.old = null; setTimeout(() => { o.remove(); BG.media.classList.remove('swap', 'zoom'); }, 1600); }
    };
    BG.media.classList.remove('in');
    if (b.kind === 'video') {
      const v = h('video', { muted: true, loop: true, playsinline: true, preload: 'auto' });
      v.muted = true;
      v.autoplay = !reduced();
      v.onloadeddata = () => { ready(v, v.videoWidth, v.videoHeight); if (!reduced() && !document.hidden) v.play().catch(() => {}); };
      v.onerror = () => CG.toast('Không phát được video nền.', true);
      v.src = url;
    } else {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => ready(img, img.naturalWidth, img.naturalHeight);
      img.onerror = () => CG.toast('Không mở được ảnh nền: ' + b.path, true);
      img.src = url;
    }
  }

  // Tìm chủ thể của ảnh: so màu với nền (lấy từ viền ảnh) + độ tương phản cạnh, rồi chọn ô có "điểm" cao nhất.
  // Trả về toạ độ chuẩn hoá 0..1: tâm (cx, cy) và khung (x0, y0, x1, y1) của chủ thể.
  function analyzeFocal(el, iw, ih) {
    try {
      const W = 120, H = Math.max(8, Math.round((W * ih) / iw));
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(el, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      // Màu nền: các màu phổ biến nhất trên viền ảnh
      const bins = new Map();
      const addBin = (x, y) => { const [r, gg, b] = px(x, y); const k = (r >> 4) << 8 | (gg >> 4) << 4 | (b >> 4); const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += gg; e.b += b; bins.set(k, e); };
      for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) addBin(x, y);
      for (let y = 2; y < H - 2; y++) for (const x of [0, 1, W - 2, W - 1]) addBin(x, y);
      const total = [...bins.values()].reduce((s, e) => s + e.n, 0);
      const pal = [...bins.values()].sort((a, b) => b.n - a.n).filter((e) => e.n / total > 0.08).slice(0, 3).map((e) => [e.r / e.n, e.g / e.n, e.b / e.n]);
      const uniform = pal.length > 0 && bins.size < total * 0.6;
      const lum = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, gg, b] = px(x, y); lum[y * W + x] = 0.299 * r + 0.587 * gg + 0.114 * b; }
      const score = new Float32Array(W * H);
      let avgL = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const [r, gg, b] = px(x, y);
          avgL += lum[i];
          const edge = Math.min(1, (Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + W] - lum[i - W])) / 120);
          const sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
          let s;
          if (uniform) {
            const dist = Math.min(...pal.map((p) => Math.hypot(r - p[0], gg - p[1], b - p[2]))) / 200;
            s = Math.pow(Math.min(1, dist), 1.5) * (0.55 + 0.45 * edge);
          } else {
            const cb = 1 - Math.hypot(x / W - 0.5, y / H - 0.45) * 1.2;
            s = edge * 0.55 + sat * 0.25 + Math.max(0, cb) * 0.2;
          }
          score[i] = s;
        }
      }
      avgL /= (W - 2) * (H - 2);
      // Ảnh tích phân → ô (45% x 75%) có tổng điểm lớn nhất = vùng chủ thể
      const I = new Float64Array((W + 1) * (H + 1));
      for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += score[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
      const sum = (x0, y0, x1, y1) => I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      const all = sum(0, 0, W, H) || 1;
      let best = null;
      for (const [fw, fh] of [[0.45, 0.75], [0.35, 0.6], [0.6, 0.85]]) {
        const ww = Math.round(W * fw), wh = Math.round(H * fh);
        for (let y = 0; y + wh <= H; y += 2) for (let x = 0; x + ww <= W; x += 2) {
          // điểm theo mật độ, ưu tiên nhẹ ô to hơn
          const v = sum(x, y, x + ww, y + wh) / all * (0.75 + 0.25 * fw);
          if (!best || v > best.v) best = { v, x, y, ww, wh };
        }
      }
      // Trong ô tốt nhất (nới 15%): tâm có trọng số + khung chứa 90% điểm
      const ex = Math.round(best.ww * 0.15), ey = Math.round(best.wh * 0.15);
      const X0 = Math.max(0, best.x - ex), Y0 = Math.max(0, best.y - ey), X1 = Math.min(W, best.x + best.ww + ex), Y1 = Math.min(H, best.y + best.wh + ey);
      const colS = new Float64Array(W), rowS = new Float64Array(H);
      let tot = 0, mx = 0, my = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const s = score[y * W + x]; colS[x] += s; rowS[y] += s; tot += s; mx += s * x; my += s * y; }
      // Toàn bộ nội dung đáng chú ý (G): khung chứa 90% điểm của cả ảnh — gồm cả chữ trên ảnh meme
      const gc = new Float64Array(W), gr = new Float64Array(H);
      let gt = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = score[y * W + x]; gc[x] += v; gr[y] += v; gt += v; }
      const gq = (arr, n, p) => { let acc = 0; for (let i = 0; i < n; i++) { acc += arr[i]; if (acc >= gt * p) return i; } return n - 1; };
      const G = gt ? { gx0: gq(gc, W, 0.05) / W, gx1: (gq(gc, W, 0.95) + 1) / W, gy0: gq(gr, H, 0.05) / H, gy1: (gq(gr, H, 0.95) + 1) / H } : {};
      if (!tot) return { v: 3, cx: 0.5, cy: 0.5, x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.8, dark: avgL < 110 };
      const q = (arr, a, b, p) => { let acc = 0; for (let i = a; i < b; i++) { acc += arr[i]; if (acc >= tot * p) return i; } return b - 1; };
      return {
        ...G, v: 3, cx: mx / tot / W, cy: my / tot / H,
        x0: q(colS, X0, X1, 0.05) / W, x1: (q(colS, X0, X1, 0.95) + 1) / W,
        y0: q(rowS, Y0, Y1, 0.05) / H, y1: (q(rowS, Y0, Y1, 0.95) + 1) / H,
        dark: avgL < 110,
      };
    } catch (e) { console.warn('focal', e); return null; }
  }

  // Vùng hiển thị nền: 'chat' = cột chat (phải thanh bên, dưới thanh tiêu đề), 'window' = cả cửa sổ
  function targetRect(area) {
    if (area === 'window') return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    // Toàn vùng bên phải thanh bên (thanh tiêu đề, chat, bảng chi tiết, khung chia đôi) — ảnh tràn qua tất cả
    const r = ($('#main') || document.body).getBoundingClientRect();
    return r.width > 50 ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  const aspectOf = (area) => { const t = targetRect(area); return t.width / Math.max(1, t.height); };
  // Khung cắt gợi ý (toạ độ chuẩn hoá theo ảnh) cho tỉ lệ A (rộng/cao, theo pixel):
  // lớn nhất có thể, căn theo toàn bộ nội dung đáng chú ý, rồi dịch để không cắt chủ thể quá 10%.
  function suggestCrop(A, iw = BG.iw, ih = BG.ih, f = BG.focal) {
    let w = 1, hh = (iw / A) / ih;
    if (hh > 1) { hh = 1; w = (ih * A) / iw; }
    if (!f) return { x: (1 - w) / 2, y: (1 - hh) / 2, w, h: hh };
    const gx = f.gx1 ? (f.gx0 + f.gx1) / 2 : f.cx, gy = f.gy1 ? (f.gy0 + f.gy1) / 2 : f.cy;
    let x = Math.min(1 - w, Math.max(0, gx - w / 2)), y = Math.min(1 - hh, Math.max(0, gy - hh / 2));
    const fix = (pos, size, a, b) => {
      const tol = (b - a) * 0.1;
      if (pos > a + tol) pos = a + tol;
      if (pos + size < b - tol) pos = b - tol - size;
      return Math.min(1 - size, Math.max(0, pos));
    };
    x = fix(x, w, f.x0, f.x1);
    y = fix(y, hh, f.y0, f.y1);
    return { x, y, w, h: hh };
  }
  // Đặt ảnh: vùng cắt (người dùng chọn, hoặc gợi ý) phủ kín vùng hiển thị; "Vừa khung" = thấy toàn bộ ảnh
  function layoutBg() {
    const el = BG.el;
    const c = cfg();
    if (!el || !BG.iw || !c.bg) return;
    const b = { ...BG_DEFAULT, ...c.bg };
    const iw = BG.iw, ih = BG.ih;
    const T = targetRect(b.area);
    let s, ox, oy, fill;
    if (b.fit === 'contain') {
      s = Math.min(T.width / iw, T.height / ih);
      ox = T.left + (T.width - iw * s) / 2;
      oy = T.top + (T.height - ih * s) / 2;
      fill = true;
    } else {
      const cr = b.crop && b.crop.w > 0 ? b.crop : suggestCrop(T.width / T.height);
      s = Math.max(T.width / (cr.w * iw), T.height / (cr.h * ih));
      ox = T.left + T.width / 2 - (cr.x + cr.w / 2) * iw * s;
      oy = T.top + T.height / 2 - (cr.y + cr.h / 2) * ih * s;
      // Vùng cắt sát mép ảnh + tỉ lệ khác vùng hiển thị → dịch lại để ảnh luôn phủ kín (không lộ mép, không lộ phần lấp nhoè)
      ox = Math.min(T.left, Math.max(T.left + T.width - iw * s, ox));
      oy = Math.min(T.top, Math.max(T.top + T.height - ih * s, oy));
      // ảnh không phủ hết cửa sổ (vd sau thanh bên) → lấp bằng bản nhoè
      fill = ox > 0.5 || oy > 0.5 || ox + iw * s < window.innerWidth - 0.5 || oy + ih * s < window.innerHeight - 0.5;
    }
    el.style.width = iw * s + 'px';
    el.style.height = ih * s + 'px';
    el.style.transform = `translate(${Math.round(ox)}px, ${Math.round(oy)}px)`;
    if (BG.fill) BG.fill.classList.toggle('hidden', !fill);
    BG.last = { s, ox, oy, fill };
  }
  CG.bgDebug = () => ({ focal: BG.focal, iw: BG.iw, ih: BG.ih, last: BG.last, style: BG.el && BG.el.style.cssText });

  // =====================================================================
  // Trình cắt ảnh nền
  // =====================================================================
  function openCropper(target) {
    const c = cfg();
    const src = target || c.bg;
    if (!src || !src.path) return Promise.resolve(false);
    const b = { ...BG_DEFAULT, ...(c.bg || {}), ...src };
    const isCur = !!(c.bg && c.bg.path === b.path);
    const url = fileUrl(b.path);
    const media = b.kind === 'video' ? h('video', { src: url, muted: true, preload: 'auto' }) : h('img', { src: url, draggable: 'false' });
    if (b.kind === 'video') { media.muted = true; media.addEventListener('loadeddata', () => { try { media.currentTime = 0.05; } catch {} }); }
    const stage = h('div', { class: 'cr-stage' }, media);
    const box = h('div', { class: 'cr-box' }, h('i', { class: 'g1' }), h('i', { class: 'g2' }), h('i', { class: 'g3' }), h('i', { class: 'g4' }),
      ...['nw', 'ne', 'sw', 'se'].map((k) => h('span', { class: 'cr-h ' + k, 'data-h': k })));
    stage.append(box);
    const prev = h('canvas', { class: 'cr-prev' });
    const info = h('div', { class: 'cr-info' });
    let area = b.area === 'window' ? 'window' : 'chat';
    let mode = area; // chat | window | free
    let iw = 0, ih = 0, ds = 1, crop = null, focal = isCur ? BG.focal : (src.focal || null);
    const ratio = () => (mode === 'free' ? null : aspectOf(mode));
    const clamp = () => {
      crop.w = Math.min(1, Math.max(0.05, crop.w)); crop.h = Math.min(1, Math.max(0.05, crop.h));
      crop.x = Math.min(1 - crop.w, Math.max(0, crop.x)); crop.y = Math.min(1 - crop.h, Math.max(0, crop.y));
    };
    // Giữ tỉ lệ A (pixel) quanh tâm, không vượt ảnh
    const fitRatio = (cx, cy, w) => {
      const A = ratio();
      if (!A) return;
      let hh = (w * iw) / A / ih;
      if (hh > 1) { hh = 1; w = (ih * A) / iw; }
      if (w > 1) { w = 1; hh = (iw / A) / ih; }
      crop = { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
      clamp();
    };
    let raf = 0;
    const draw = () => {
      raf = 0;
      if (!crop) return;
      Object.assign(box.style, { left: crop.x * iw * ds + 'px', top: crop.y * ih * ds + 'px', width: crop.w * iw * ds + 'px', height: crop.h * ih * ds + 'px' });
      // Xem trước: mô phỏng cửa sổ app (thanh bên + vùng chat) với vùng đã cắt
      const W = window.innerWidth, H = window.innerHeight;
      const PW = 240, PH = Math.round((PW * H) / W), k = PW / W;
      if (prev.width !== PW) { prev.width = PW; prev.height = PH; }
      const g = prev.getContext('2d');
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#222';
      g.fillRect(0, 0, PW, PH);
      const T = targetRect(mode === 'free' ? area : mode);
      const sc = Math.max(T.width / (crop.w * iw), T.height / (crop.h * ih));
      const ox = T.left + T.width / 2 - (crop.x + crop.w / 2) * iw * sc, oy = T.top + T.height / 2 - (crop.y + crop.h / 2) * ih * sc;
      try { g.save(); g.beginPath(); g.rect(T.left * k, T.top * k, T.width * k, T.height * k); g.clip(); g.drawImage(media, ox * k, oy * k, iw * sc * k, ih * sc * k); g.restore(); } catch {}
      g.globalAlpha = 1 - b.strength / 100;
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#222';
      g.fillRect(0, 0, PW, PH);
      g.globalAlpha = 1;
      const col = ($('#chat-col') || document.body).getBoundingClientRect();
      g.fillStyle = 'rgba(128,128,128,.35)';
      g.fillRect(0, 0, col.left * k, PH); // thanh bên
      const cw = Math.min(col.width - 56, 820) * k, cx = (col.left + col.width / 2) * k - cw / 2;
      g.fillStyle = 'rgba(128,128,128,.55)';
      for (let i = 0; i < 4; i++) g.fillRect(cx + (i % 2 ? cw * 0.35 : 0), PH * (0.18 + i * 0.14), cw * (i % 2 ? 0.65 : 0.8), 4);
      g.fillRect(cx, PH - 26, cw, 16); // ô nhập
      info.textContent = `${Math.round(crop.w * iw)} × ${Math.round(crop.h * ih)} px · ${mode === 'free' ? 'tự do' : 'tỉ lệ ' + ratio().toFixed(2)}`;
    };
    const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const init = () => {
      iw = media.naturalWidth || media.videoWidth; ih = media.naturalHeight || media.videoHeight;
      if (!iw || !ih) return;
      ds = Math.min(760 / iw, 430 / ih);
      Object.assign(stage.style, { width: iw * ds + 'px', height: ih * ds + 'px' });
      if (!focal) focal = analyzeFocal(media, iw, ih);
      crop = b.crop && b.crop.w > 0 ? { ...b.crop } : suggestCrop(ratio() || aspectOf(area), iw, ih, focal);
      draw();
    };
    if (b.kind === 'video') media.addEventListener('seeked', init, { once: true }); else media.onload = init;
    if (media.complete && media.naturalWidth) setTimeout(init);
    // Kéo khung / kéo góc
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      if (!crop) return;
      e.preventDefault();
      const hd = e.target.dataset && e.target.dataset.h;
      const r = stage.getBoundingClientRect();
      const px = (e.clientX - r.left) / ds / iw, py = (e.clientY - r.top) / ds / ih;
      const inside = px >= crop.x && px <= crop.x + crop.w && py >= crop.y && py <= crop.y + crop.h;
      if (!hd && !inside) { crop.x = px - crop.w / 2; crop.y = py - crop.h / 2; clamp(); redraw(); }
      drag = { hd, px, py, c0: { ...crop } };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = stage.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / ds / iw)), py = Math.min(1, Math.max(0, (e.clientY - r.top) / ds / ih));
      const c0 = drag.c0;
      if (!drag.hd) { crop.x = c0.x + px - drag.px; crop.y = c0.y + py - drag.py; clamp(); redraw(); return; }
      // góc đối diện đứng yên
      const fx = drag.hd.includes('w') ? c0.x + c0.w : c0.x, fy = drag.hd.includes('n') ? c0.y + c0.h : c0.y;
      let w = Math.max(0.05, Math.abs(px - fx)), hh = Math.max(0.05, Math.abs(py - fy));
      const A = ratio();
      if (A) {
        // theo chiều kéo nhiều hơn, chiều kia tính theo tỉ lệ
        const hFromW = (w * iw) / A / ih;
        if (hFromW >= hh) hh = hFromW; else w = (hh * ih * A) / iw;
        const maxW = drag.hd.includes('w') ? fx : 1 - fx, maxH = drag.hd.includes('n') ? fy : 1 - fy;
        const k = Math.min(1, maxW / w, maxH / hh);
        w *= k; hh *= k;
      }
      crop = { x: drag.hd.includes('w') ? fx - w : fx, y: drag.hd.includes('n') ? fy - hh : fy, w, h: hh };
      clamp();
      redraw();
    });
    const end = () => { drag = null; };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // Lăn chuột: phóng to / thu nhỏ quanh tâm khung
    stage.addEventListener('wheel', (e) => {
      if (!crop) return;
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.08 : 0.925;
      const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
      if (ratio()) fitRatio(cx, cy, crop.w * f);
      else { crop = { x: cx - (crop.w * f) / 2, y: cy - (crop.h * f) / 2, w: crop.w * f, h: crop.h * f }; clamp(); }
      redraw();
    }, { passive: false });
    stage.addEventListener('dblclick', () => { crop = suggestCrop(ratio() || aspectOf(area), iw, ih, focal); redraw(); });
    // Thanh công cụ
    const segBtns = [];
    const seg = h('div', { class: 'seg sm' }, [['chat', 'Vùng bên phải thanh bên'], ['window', 'Cả cửa sổ'], ['free', 'Tự do']].map(([v, l]) => {
      const bt = h('button', { class: v === mode ? 'on' : '', text: l, onclick: () => {
        mode = v;
        if (v !== 'free') area = v;
        segBtns.forEach((x) => x.classList.toggle('on', x === bt));
        if (crop && ratio()) fitRatio(crop.x + crop.w / 2, crop.y + crop.h / 2, crop.w);
        redraw();
      } });
      segBtns.push(bt);
      return bt;
    }));
    const tool = (label, fn) => h('button', { class: 'btn sm', text: label, onclick: fn });
    const bar = h('div', { class: 'cr-bar' }, seg, h('span', { class: 'spacer' }),
      tool('Gợi ý tự động', () => { crop = suggestCrop(ratio() || aspectOf(area), iw, ih, focal); redraw(); }),
      tool('Lấy tối đa', () => { if (ratio()) fitRatio(crop.x + crop.w / 2, crop.y + crop.h / 2, 1); else crop = { x: 0, y: 0, w: 1, h: 1 }; redraw(); }));
    const body = h('div', { class: 'cr-body' }, bar, h('div', { class: 'cr-main' }, stage,
      h('div', { class: 'cr-side' }, h('div', { class: 'cr-lbl', text: 'Xem trước' }), prev, info,
        h('div', { class: 'cr-tip', text: 'Kéo khung để di chuyển · kéo góc để đổi cỡ · lăn chuột để phóng to/thu nhỏ · nhấp đúp để về gợi ý tự động. Phần trong khung là phần hiện bên phải thanh bên (chat + bảng chi tiết).' }))));
    return new Promise((resolve) => {
      let m;
      const cancel = h('button', { class: 'btn', text: 'Huỷ', onclick: () => { m.close(); resolve(false); } });
      const ok = h('button', { class: 'btn primary', text: 'Áp dụng', onclick: async () => {
        m.close();
        const cr = crop ? { x: +crop.x.toFixed(4), y: +crop.y.toFixed(4), w: +crop.w.toFixed(4), h: +crop.h.toFixed(4) } : null;
        const now = cfg(), patch = {};
        // vùng cắt lưu theo từng ảnh: ảnh trong kho giữ vùng cắt riêng, ảnh đang làm nền cập nhật luôn
        if ((now.bgPool || []).some((p) => p.path === b.path)) patch.bgPool = now.bgPool.map((p) => (p.path === b.path ? { ...p, crop: cr, area, focal: focal || p.focal || null } : p));
        if (isCur || !target) { const cur = now.bg || b; patch.bg = { ...cur, crop: cr, area, fit: 'crop', focal: focal || cur.focal }; }
        await save(patch);
        resolve(true);
      } });
      m = CG.modal('Cắt ảnh nền' + (target && target.name ? ' — ' + target.name : ''), body, [cancel, ok], { cls: 'cropper' });
    });
  }

  // =====================================================================
  // Tự đổi ảnh nền theo giờ: kho ảnh (mỗi ảnh có vùng cắt riêng), đổi tuần tự / ngẫu nhiên / theo khung giờ
  // =====================================================================
  const ROT_DEF = { on: false, mode: 'seq', every: 30, fx: 'fade', noRep: true, idle: true };
  const rotCfg = () => ({ ...ROT_DEF, ...(cfg().bgRot || {}) });
  const poolList = () => (cfg().bgPool || []).filter((p) => p && p.path);
  // theo khung giờ: ảnh có giờ bắt đầu lớn nhất ≤ giờ hiện tại (trước ảnh sớm nhất thì lấy ảnh muộn nhất của hôm trước)
  function slotPick(list, hr) {
    const s = list.filter((p) => p.slot != null).sort((a, b) => a.slot - b.slot);
    if (!s.length) return null;
    let best = s[s.length - 1];
    for (const p of s) if (p.slot <= hr) best = p;
    return best;
  }
  function rotPick(dir = 1) {
    const r = rotCfg(), L = poolList();
    if (!L.length) return null;
    if (r.mode === 'slot') return slotPick(L, new Date().getHours());
    const ci = L.findIndex((p) => p.id === r.cur);
    if (r.mode === 'seq' || L.length === 1) return L[(ci + dir + L.length) % L.length] || L[0];
    let cand = L.filter((p) => p.id !== r.cur && (!r.noRep || !(r.seen || []).includes(p.id)));
    if (!cand.length) cand = L.filter((p) => p.id !== r.cur); // xem hết kho → vòng mới
    return cand[Math.floor(Math.random() * cand.length)];
  }
  async function rotShow(p) {
    if (!p) return;
    const c = cfg(), r = rotCfg(), L = poolList();
    let seen = r.mode === 'rand' ? [...new Set([...(r.seen || []), p.id])] : [];
    if (seen.length >= L.length) seen = [p.id];
    await save({
      bg: { ...BG_DEFAULT, ...(c.bg || {}), path: p.path, kind: p.kind, name: p.name, crop: p.crop || null, area: p.area || (c.bg && c.bg.area) || 'chat', fit: 'crop', focal: p.focal || null },
      bgRot: { ...r, cur: p.id, last: Date.now(), seen },
    });
  }
  let rotKey = 0;
  addEventListener('keydown', (e) => { if (e.target && e.target.id === 'input') rotKey = Date.now(); }, true);
  // đang gõ / Claude đang trả lời chữ → đợi rảnh rồi mới đổi cho khỏi giật mắt
  const rotBusy = () => { const a = S().active; return Date.now() - rotKey < 5000 || !!(a && a.busy && a.phase === 'talk'); };
  function rotTick(startup) {
    const r = rotCfg(), L = poolList(), c = cfg();
    if (!r.on || !L.length || !S().settings) return;
    const cur = L.find((p) => p.id === r.cur), showing = !!(cur && c.bg && c.bg.path === cur.path);
    if (r.mode === 'slot') {
      const p = slotPick(L, new Date().getHours());
      if (p && !(p.id === r.cur && showing) && (startup || !r.idle || !rotBusy())) rotShow(p);
      return;
    }
    if (L.length === 1) { if (!showing) rotShow(L[0]); return; }
    const due = r.every > 0 ? Date.now() - (r.last || 0) >= r.every * 60e3 : startup;
    if (!due || (!startup && r.idle && rotBusy())) return;
    rotShow(rotPick(1));
  }
  setInterval(() => { if (!document.hidden) rotTick(false); }, 20000);

  // =====================================================================
  // Màu nhấn tự chọn
  // =====================================================================
  function applyAccent() {
    const a = cfg().accent;
    const st = document.documentElement.style;
    if (!a || !/^#[0-9a-f]{6}$/i.test(a)) { for (const k of ['--accent', '--accent-hover', '--accent-soft', '--on-accent', '--logo']) st.removeProperty(k); return; }
    const n = parseInt(a.slice(1), 16);
    const L = ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
    st.setProperty('--accent', a);
    st.setProperty('--accent-hover', `color-mix(in srgb, ${a} 84%, ${L > 0.6 ? '#000' : '#fff'})`);
    st.setProperty('--accent-soft', `color-mix(in srgb, ${a} 15%, transparent)`);
    st.setProperty('--on-accent', L > 0.62 ? '#1a1a1a' : '#ffffff');
    st.setProperty('--logo', a);
  }

  // =====================================================================
  // Hiệu ứng
  // =====================================================================
  function overlayCanvas(cls) {
    const cv = h('canvas', { class: 'fx-canvas ' + cls });
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    document.body.append(cv);
    return { cv, g };
  }
  const accentColors = () => {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--accent').trim(), cs.getPropertyValue('--logo').trim(), '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'].filter(Boolean);
  };
  // Pháo giấy bắn từ ô nhập
  function confetti() {
    const { cv, g } = overlayCanvas('confetti');
    const comp = ($('#composer') || document.body).getBoundingClientRect();
    const cols = accentColors();
    const P = [];
    for (let i = 0; i < 140; i++) {
      const left = i % 2 === 0;
      P.push({ x: left ? comp.left + 20 : comp.right - 20, y: comp.top, vx: (left ? 1 : -1) * (2 + Math.random() * 7), vy: -(7 + Math.random() * 9),
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 6, hh: 3 + Math.random() * 5, c: cols[i % cols.length], round: Math.random() < 0.3 });
    }
    const t0 = performance.now();
    const step = (t) => {
      const age = (t - t0) / 1000;
      g.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of P) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1.4) / 0.8); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2.4, 0, 6.3); g.fill(); } else g.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh);
        g.restore();
      }
      if (age < 2.3) requestAnimationFrame(step); else cv.remove();
    };
    requestAnimationFrame(step);
  }
  // Logo Claude nở hoa trên ô nhập
  function bloom() {
    const comp = ($('#composer') || document.body).getBoundingClientRect();
    const el = h('div', { class: 'fx-bloom' }, CG.logo(90));
    el.style.left = comp.left + comp.width / 2 - 45 + 'px';
    el.style.top = comp.top - 110 + 'px';
    for (let i = 0; i < 8; i++) el.append(h('i', { style: { '--a': i * 45 + 'deg' } }));
    document.body.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  // Vệt sáng theo con trỏ
  const TRAIL = { cv: null, g: null, pts: [], raf: 0, hue: 0 };
  function onMove(e) {
    if (!TRAIL.cv) return;
    TRAIL.hue = (TRAIL.hue + 4) % 360;
    TRAIL.pts.push({ x: e.clientX, y: e.clientY, life: 1, hue: TRAIL.hue, r: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8 + 0.4 });
    if (TRAIL.pts.length > 90) TRAIL.pts.shift();
    if (!TRAIL.raf) TRAIL.raf = requestAnimationFrame(drawTrail);
  }
  function drawTrail() {
    const g = TRAIL.g;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of TRAIL.pts) {
      p.life -= 0.035; p.x += p.vx; p.y += p.vy;
      if (p.life <= 0) continue;
      g.beginPath();
      g.fillStyle = `hsla(${p.hue}, 95%, 65%, ${p.life * 0.85})`;
      g.shadowColor = `hsla(${p.hue}, 95%, 60%, ${p.life})`;
      g.shadowBlur = 8;
      g.arc(p.x, p.y, p.r * p.life + 0.5, 0, 6.3);
      g.fill();
    }
    TRAIL.pts = TRAIL.pts.filter((p) => p.life > 0);
    TRAIL.raf = TRAIL.pts.length ? requestAnimationFrame(drawTrail) : 0;
  }
  function applyTrail(on) {
    if (on && !TRAIL.cv) {
      const o = overlayCanvas('trail');
      TRAIL.cv = o.cv; TRAIL.g = o.g;
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('resize', resizeTrail);
    } else if (!on && TRAIL.cv) {
      TRAIL.cv.remove(); TRAIL.cv = null; TRAIL.pts = [];
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', resizeTrail);
    }
  }
  function resizeTrail() { if (!TRAIL.cv) return; const dpr = devicePixelRatio || 1; TRAIL.cv.width = innerWidth * dpr; TRAIL.cv.height = innerHeight * dpr; TRAIL.g.setTransform(dpr, 0, 0, dpr, 0, 0); }

  // =====================================================================
  // Âm thanh (tổng hợp bằng WebAudio, không cần tệp)
  // =====================================================================
  let actx = null;
  function tone(seq) {
    const sd = cfg().sound;
    if (!sd.on) return;
    try {
      actx = actx || new AudioContext();
      const t0 = actx.currentTime + 0.01;
      for (const [f, at, dur, type] of seq) {
        const o = actx.createOscillator(), gn = actx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f, t0 + at);
        gn.gain.setValueAtTime(0.0001, t0 + at);
        gn.gain.exponentialRampToValueAtTime(0.18 * sd.vol + 0.0001, t0 + at + 0.012);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(gn).connect(actx.destination);
        o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      }
    } catch {}
  }
  const SOUNDS = {
    send: [[880, 0, 0.08], [1320, 0.05, 0.1]],
    done: [[1046.5, 0, 0.22], [1318.5, 0.09, 0.22], [1568, 0.18, 0.35]],
    perm: [[988, 0, 0.14, 'triangle'], [988, 0.2, 0.18, 'triangle']],
    meow: [[740, 0, 0.12, 'triangle'], [600, 0.08, 0.2, 'triangle']],
  };

  // =====================================================================
  // Tự đổi chủ đề theo giờ
  // =====================================================================
  const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : 0; };
  function resolveTheme(base) {
    const at = cfg().autoTheme;
    if (!at.on) return base;
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    const a = toMin(at.from), b = toMin(at.to);
    const day = a <= b ? m >= a && m < b : m >= a || m < b;
    return day ? at.light : at.dark;
  }
  let lastAuto = null;
  setInterval(() => {
    if (!S().settings) return;
    const eff = resolveTheme(S().settings.theme || 'system');
    if (cfg().autoTheme.on && eff !== lastAuto) CG.applyTheme(S().settings.theme);
  }, 60 * 1000);

  // =====================================================================
  // Áp dụng + móc vào vòng đời phiên
  // =====================================================================
  function apply() {
    const c = cfg();
    const rm = reduced();
    const bc = document.body.classList;
    bc.toggle('fx-reduce', rm);
    bc.toggle('fx-border', !!c.busyBorder);
    bc.toggle('fx-bubble', !!c.gradBubble);
    bc.toggle('logo-rainbow', c.logoFx === 'rainbow' && !rm);
    bc.toggle('logo-glow', c.logoFx === 'glow' && !rm);
    applyAccent();
    applyBg();
    applyTrail(!!c.cursorTrail && !rm);
    if (CG.mascot) CG.mascot.apply();
    sync();
  }
  // Gọi định kỳ (500ms) và khi trạng thái phiên đổi
  function sync() {
    const c = S().active;
    const comp = $('#composer');
    if (comp) comp.classList.toggle('working', !!(c && c.working));
    if (CG.mascot) CG.mascot.sync();
  }
  function onSend() { if (cfg().sound.send) tone(SOUNDS.send); }
  function onPermission() { if (cfg().sound.perm) tone(SOUNDS.perm); sync(); }
  // Claude xong một lượt (của phiên đang xem); long = lượt chạy đủ lâu để đáng ăn mừng
  function onDone(long) {
    const c = cfg();
    if (c.sound.done) tone(SOUNDS.done);
    if (!long || document.hidden || reduced()) return;
    if (c.doneFx === 'confetti') confetti();
    else if (c.doneFx === 'bloom') bloom();
  }

  CG.decor = { cfg, save, apply, sync, onSend, onDone, onPermission, resolveTheme, analyzeFocal, layoutBg, openCropper, suggestCrop, osReduced,
    rot: { cfg: rotCfg, pick: rotPick, show: rotShow, tick: rotTick, slotPick, DEF: ROT_DEF }, preview: { confetti, bloom, tone: (k) => { const sd = cfg().sound; if (!sd.on) return; tone(SOUNDS[k]); } }, DEFAULTS, BG_DEFAULT };
  // Cài đặt đã có (init của app.js chạy bất đồng bộ) → áp dụng khi sẵn sàng
  const boot = setInterval(() => { if (S() && S().settings) { clearInterval(boot); apply(); setTimeout(() => rotTick(true), 1500); } }, 50);
  setInterval(() => { if (!document.hidden) sync(); }, 500);
})();
