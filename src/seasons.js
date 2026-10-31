// Trang phục theo ngày lễ cho linh vật robot. Tự mặc đúng ngày, người dùng không chọn.
// Seasons.today(date) → sự kiện đang diễn ra (hoặc null). Seasons.EVENTS: toàn bộ danh sách. Seasons.lunar(date) → [ngày, tháng, năm, nhuận] âm lịch (múi giờ +7).
(function () {
  // ---------------- Âm lịch Việt Nam (thuật toán Hồ Ngọc Đức, múi giờ +7) ----------------
  const TZ = 7, PI = Math.PI, INT = Math.floor;
  function jd(dd, mm, yy) { const a = INT((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3; return dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045; }
  function newMoon(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + .0001178 * T2 - .000000155 * T3 + .00033 * Math.sin((166.56 + 132.87 * T - .009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - .0000333 * T2 - .00000347 * T3, Mp = 306.0253 + 385.81691806 * k + .0107306 * T2 + .00001236 * T3, F = 21.2964 + 390.67050646 * k - .0016528 * T2 - .00000239 * T3;
    let C1 = (.1734 - .000393 * T) * Math.sin(M * dr) + .0021 * Math.sin(2 * dr * M) - .4068 * Math.sin(Mp * dr) + .0161 * Math.sin(dr * 2 * Mp) - .0004 * Math.sin(dr * 3 * Mp)
      + .0104 * Math.sin(dr * 2 * F) - .0051 * Math.sin(dr * (M + Mp)) - .0074 * Math.sin(dr * (M - Mp)) + .0004 * Math.sin(dr * (2 * F + M))
      - .0004 * Math.sin(dr * (2 * F - M)) - .0006 * Math.sin(dr * (2 * F + Mp)) + .001 * Math.sin(dr * (2 * F - Mp)) + .0005 * Math.sin(dr * (2 * Mp + M));
    const dt = T < -11 ? .001 + .000839 * T + .0002261 * T2 - .00000845 * T3 - .000000081 * T * T3 : -.000278 + .000265 * T + .000262 * T2;
    return INT(Jd1 + C1 - dt + .5 + TZ / 24);
  }
  function sunLong(jdn) {
    const T = (jdn - 2451545.5 - TZ / 24) / 36525, T2 = T * T, dr = PI / 180;
    const M = 357.5291 + 35999.0503 * T - .0001559 * T2 - .00000048 * T * T2, L0 = 280.46645 + 36000.76983 * T + .0003032 * T2;
    let L = (L0 + (1.9146 - .004817 * T - .000014 * T2) * Math.sin(dr * M) + (.019993 - .000101 * T) * Math.sin(dr * 2 * M) + .00029 * Math.sin(dr * 3 * M)) * dr;
    L -= PI * 2 * INT(L / (PI * 2)); return INT(L / PI * 6);
  }
  function month11(yy) { const k = INT((jd(31, 12, yy) - 2415021) / 29.530588853); const nm = newMoon(k); return sunLong(nm) >= 9 ? newMoon(k - 1) : nm; }
  function leapOff(a11) { const k = INT((a11 - 2415021.076998695) / 29.530588853 + .5); let last, i = 1, arc = sunLong(newMoon(k + i)); do { last = arc; i++; arc = sunLong(newMoon(k + i)); } while (arc !== last && i < 14); return i - 1; }
  function lunar(d) {
    const dd = d.getDate(), mm = d.getMonth() + 1, yy = d.getFullYear(), n = jd(dd, mm, yy);
    const k = INT((n - 2415021.076998695) / 29.530588853);
    let ms = newMoon(k + 1); if (ms > n) ms = newMoon(k);
    let a11 = month11(yy), b11 = a11, ly;
    if (a11 >= ms) { ly = yy; a11 = month11(yy - 1); } else { ly = yy + 1; b11 = month11(yy + 1); }
    const day = n - ms + 1, diff = INT((ms - a11) / 29);
    let leap = 0, mon = diff + 11;
    if (b11 - a11 > 365) { const lo = leapOff(a11); if (diff >= lo) { mon = diff + 10; if (diff === lo) leap = 1; } }
    if (mon > 12) mon -= 12;
    if (mon >= 11 && diff < 4) ly -= 1;
    return [day, mon, ly, leap];
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const al = (d) => lunar(d);
  const isAL = (d, day, mon) => { const [a, b, , l] = al(d); return !l && a === day && b === mon; };
  const isDL = (d, day, mon) => d.getDate() === day && d.getMonth() + 1 === mon;
  // ngày thứ 256 trong năm (Ngày lập trình viên)
  const dayOfYear = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 864e5);

  // ---------------- Hình vẽ (toạ độ theo mặt robot 240×182, vùng vẽ -60…300 × -90…240) ----------------
  const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="#2b313c" stroke="#454d5c" stroke-width="2"/>`;
  const flagVN = `<g class="cs-wave-root"><line x1="252" y1="168" x2="262" y2="-40" stroke="#c9a86a" stroke-width="5" stroke-linecap="round"/>
    <g class="cs-wave"><path d="M262 -40 Q 300 -50 342 -38 L 342 18 Q 300 6 262 16 Z" fill="#da251d"/>
    <polygon fill="#ffde00" points="${star(302, -12, 14, 5.6)}"/></g></g>${hand(252, 150)}`;
  function star(cx, cy, R, r, n = 5, rot = -90) { const p = []; for (let i = 0; i < n * 2; i++) { const a = (rot + i * 180 / n) * PI / 180, rr = i % 2 ? r : R; p.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1)); } return p.join(' '); }
  const partyHat = `<g transform="rotate(14 170 0)"><defs><linearGradient id="csParty" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff5aa5"/><stop offset=".25" stop-color="#ff5aa5"/><stop offset=".25" stop-color="#ffd43b"/><stop offset=".5" stop-color="#ffd43b"/><stop offset=".5" stop-color="#5ac8fa"/><stop offset=".75" stop-color="#5ac8fa"/><stop offset=".75" stop-color="#8b5cf6"/></linearGradient></defs>
    <path d="M140 6 L172 -78 L204 6 Q172 16 140 6Z" fill="url(#csParty)"/><circle cx="172" cy="-80" r="10" fill="#fff"/></g>`;
  const santa = `<path d="M26 -2 C 50 -78, 172 -92, 222 -36 C 240 -16, 250 16, 258 44 L 236 52 C 228 30, 214 6, 196 -6 Z" fill="#d6262f"/>
    <path d="M196 -6 C 214 6, 228 30, 236 52" fill="none" stroke="#a51b23" stroke-width="3" opacity=".6"/>
    <rect x="12" y="-14" width="216" height="30" rx="15" fill="#f6f6f6"/><circle cx="252" cy="54" r="15" fill="#f6f6f6"/>`;
  const witch = `<ellipse cx="120" cy="2" rx="122" ry="15" fill="#2a1f3d"/><path d="M62 0 L128 -92 Q142 -110 160 -98 Q146 -96 140 -84 L180 0 Z" fill="#33264a"/>
    <path d="M70 -14 L176 -14 L180 0 L64 0 Z" fill="#ff8a1f"/><rect x="112" y="-18" width="18" height="16" rx="3" fill="none" stroke="#ffd43b" stroke-width="3"/>`;
  const pumpkin = `<g transform="translate(-46 128)"><path d="M28 2 q 6 -14 14 -12" stroke="#3d7a34" stroke-width="6" fill="none" stroke-linecap="round"/>
    <ellipse cx="30" cy="34" rx="34" ry="30" fill="#f57c1f"/><ellipse cx="30" cy="34" rx="14" ry="30" fill="#ff9636"/><path d="M14 30 l8 -8 l8 8z M38 30 l8 -8 l8 8z" fill="#3a1600"/><path d="M14 44 q16 12 32 0 l-6 3 l-4 -3 l-6 4 l-6 -4 l-4 3z" fill="#3a1600"/></g>`;
  const nonLa = `<path d="M-14 12 L120 -78 L254 12 Q120 34 -14 12 Z" fill="#ead39a"/><path d="M-14 12 Q120 34 254 12" fill="none" stroke="#b99a55" stroke-width="3"/>
    ${[-40, -20, 0, 20, 40].map((o) => `<path d="M120 -78 L${120 + o * 3.2} ${18 + Math.abs(o) * -.12}" stroke="#c9ad6c" stroke-width="1.6" opacity=".7"/>`).join('')}
    <path d="M40 18 Q 40 110 84 176" fill="none" stroke="#d1495b" stroke-width="3"/>`;
  const helmet = `<path d="M12 14 C 14 -76, 226 -76, 228 14 Z" fill="#ffc21a"/><rect x="-4" y="6" width="248" height="16" rx="8" fill="#f2ad00"/><path d="M104 -52 h32 v60 h-32z" fill="#ffd451"/>`;
  const wrench = (x, y, r = -35) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-6" y="-4" width="12" height="70" rx="5" fill="#aab4c3"/><path d="M-20 -14 a20 20 0 1 1 40 0 l-10 0 l0 -12 l-20 0 l0 12 z" fill="#aab4c3"/></g>`;
  const balloons = `${[[284, -54, '#ff5a5f'], [318, -14, '#5ac8fa'], [262, -2, '#ffd43b']].map(([x, y, c], i) => `<g class="cs-bob" style="animation-delay:${-i * .7}s"><path d="M250 150 Q ${x - 10} ${y + 90} ${x} ${y + 34}" stroke="#ddd" stroke-width="1.5" fill="none"/><ellipse cx="${x}" cy="${y}" rx="24" ry="30" fill="${c}"/><ellipse cx="${x - 8}" cy="${y - 10}" rx="6" ry="9" fill="#fff" opacity=".35"/></g>`).join('')}${hand(250, 150)}`;
  const starLantern = `<line x1="250" y1="150" x2="296" y2="22" stroke="#a7834f" stroke-width="5" stroke-linecap="round"/>
    <g class="cs-swing"><line x1="296" y1="22" x2="296" y2="40" stroke="#a7834f" stroke-width="2"/><polygon class="cs-glow" points="${star(296, 78, 40, 17)}" fill="#e8342f" stroke="#ffd43b" stroke-width="3"/>
    <polygon points="${star(296, 78, 15, 6.5)}" fill="#ffe27a"/><path d="M296 118 l-8 26 M296 118 l8 26" stroke="#ffd43b" stroke-width="3"/></g>${hand(250, 150)}`;
  const moon = `<circle cx="-24" cy="-50" r="34" fill="#ffe9a6" opacity=".9"/><circle cx="-14" cy="-58" r="6" fill="#e9d38c"/><circle cx="-36" cy="-40" r="4" fill="#e9d38c"/>`;
  const carp = `<g class="cs-bob"><g transform="translate(250 30) rotate(-18)"><path d="M0 0 C 20 -26, 70 -26, 86 0 C 70 24, 20 26, 0 0Z" fill="#ffb21f"/><path d="M84 0 l28 -22 l-6 22 l6 22z" fill="#ff8a1f"/>
    <path d="M30 -18 q10 -16 26 -12" fill="#ff8a1f"/><circle cx="16" cy="-4" r="4" fill="#3a1600"/>${[34, 48, 62].map((x) => `<path d="M${x} -12 q6 12 0 24" stroke="#e08a00" fill="none" stroke-width="2"/>`).join('')}</g></g>`;
  const lixi = `<g transform="translate(236 104) rotate(12)"><rect width="46" height="66" rx="5" fill="#d8232a"/><path d="M0 4 L23 26 L46 4" fill="none" stroke="#ffd43b" stroke-width="2.5"/><circle cx="23" cy="42" r="10" fill="#ffd43b"/><text x="23" y="47" font-size="12" font-weight="700" text-anchor="middle" fill="#d8232a">Lộc</text></g>${hand(250, 150)}`;
  const maiBranch = `<path d="M-40 -60 C 10 -40, 30 -70, 80 -76 M10 -50 C 20 -30 0 -20 -20 -6" stroke="#6b4a2b" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${[[-30, -58], [6, -50], [40, -70], [76, -78], [-14, -12], [10, -36]].map(([x, y]) => flower(x, y, '#ffd21f', '#e36b00')).join('')}`;
  function flower(x, y, c, mid, r = 7) { let s = ''; for (let i = 0; i < 5; i++) { const a = i * 72 * PI / 180; s += `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="${r * .75}" fill="${c}"/>`; } return s + `<circle cx="${x}" cy="${y}" r="${r * .5}" fill="${mid}"/>`; }
  const bouquet = (cols) => `<g transform="translate(232 70)"><path d="M10 40 L38 124 L66 40 Z" fill="#f4e6d0" stroke="#d9c4a1" stroke-width="2"/>
    ${[[18, 32], [40, 22], [62, 34], [28, 10], [52, 6]].map(([x, y], i) => `<path d="M${x} ${y + 12} L 38 100" stroke="#3d7a34" stroke-width="2.5"/>` + rose(x, y, cols[i % cols.length])).join('')}
    <path d="M30 96 q8 8 16 0" stroke="#e85a8a" stroke-width="5" fill="none"/></g>${hand(262, 182)}`;
  function rose(x, y, c) { return `<circle cx="${x}" cy="${y}" r="12" fill="${c}"/><path d="M${x - 6} ${y} a6 6 0 1 1 12 0 a4 4 0 1 1 -8 0" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`; }
  const groucho = `<g><path d="M24 50 q34 -22 66 0 M150 50 q32 -22 66 0" stroke="#2a1c12" stroke-width="10" fill="none" stroke-linecap="round"/>
    <circle cx="70" cy="91" r="33" fill="rgba(255,255,255,.05)" stroke="#111" stroke-width="7"/><circle cx="170" cy="91" r="33" fill="rgba(255,255,255,.05)" stroke="#111" stroke-width="7"/>
    <path d="M103 88 q17 -8 34 0" stroke="#111" stroke-width="7" fill="none"/>
    <path d="M108 104 q12 -6 24 0 q10 30 -12 34 q-22 -4 -12 -34z" fill="#f2b8a0"/><path d="M80 150 q40 -24 80 0 q-40 8 -80 0z" fill="#2a1c12"/></g>`;
  const sprout = `<path d="M120 -2 C 120 -30, 124 -46, 130 -58" stroke="#3fae4a" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path class="cs-leaf" d="M128 -44 C 150 -70, 176 -66, 182 -52 C 166 -36, 146 -36, 128 -44Z" fill="#58c95f"/><path class="cs-leaf2" d="M124 -30 C 104 -56, 80 -52, 74 -40 C 90 -24, 108 -24, 124 -30Z" fill="#46b84d"/>`;
  const saber = `<g transform="rotate(18 252 150)"><rect x="244" y="120" width="16" height="50" rx="3" fill="#8b929e"/><rect x="244" y="130" width="16" height="4" fill="#3b414c"/><rect x="244" y="142" width="16" height="4" fill="#3b414c"/>
    <rect class="cs-saber" x="246" y="-50" width="12" height="172" rx="6" fill="#d7ffe0"/></g>${hand(254, 156)}`;
  const capCode = `<path d="M24 6 C 30 -66, 210 -66, 216 6 Z" fill="#23272f"/><path d="M196 2 Q 250 -2 272 18 Q 236 18 200 14Z" fill="#1a1d23"/><text x="120" y="-20" font-family="Consolas,monospace" font-weight="700" font-size="30" text-anchor="middle" fill="#3ff2ff">&lt;/&gt;</text>`;
  const banhChung = `<g transform="translate(232 96) rotate(-8)"><rect width="62" height="62" rx="5" fill="#3f8f3a"/><rect x="5" y="5" width="52" height="52" rx="3" fill="#57a94f"/>
    <path d="M0 21 h62 M0 41 h62 M21 0 v62 M41 0 v62" stroke="#e9dcb4" stroke-width="3"/></g>${hand(252, 160)}`;
  const heartBalloon = `<g class="cs-bob"><path d="M250 150 Q 270 80 290 30" stroke="#ddd" stroke-width="1.5" fill="none"/><path d="M290 32 C 250 0, 262 -40, 290 -22 C 318 -40, 330 0, 290 32Z" fill="#ff4d7a"/></g>${hand(250, 150)}`;
  const roseClip = `<g transform="translate(16 18)">${rose(0, 0, '#e8436b')}<path d="M8 8 l14 10" stroke="#3d7a34" stroke-width="3"/><path d="M14 10 q10 -10 16 0 q-8 6 -16 0" fill="#58a94f"/></g>`;
  const scarfRed = `<path d="M18 168 Q 120 200 222 168 L 226 186 Q 120 220 14 186 Z" fill="#d8232a"/><path d="M178 186 l14 40 l22 -8 l-16 -38z" fill="#c21a20"/>`;
  const piePi = `<g transform="translate(236 118)"><ellipse cx="34" cy="30" rx="34" ry="14" fill="#c98a3c"/><ellipse cx="34" cy="24" rx="34" ry="14" fill="#e6b26a"/><path d="M34 24 L66 20 A34 14 0 0 1 52 36 Z" fill="#8a2a2a"/></g>`;
  const teacher = `<g transform="translate(0 0)"><rect x="236" y="120" width="56" height="42" rx="3" fill="#2f5fb3" transform="rotate(-10 264 140)"/><rect x="240" y="124" width="48" height="34" fill="#f4f1e8" transform="rotate(-10 264 140)"/><path d="M264 124 v34" stroke="#2f5fb3" stroke-width="2" transform="rotate(-10 264 140)"/></g>${hand(254, 160)}`;

  // ---------------- Danh sách sự kiện ----------------
  // when(d): đúng ngày (lịch dương hoặc âm). face: biểu cảm khi rảnh. color: màu LED. fx: hiệu ứng hạt.
  const E = [
    { id: 'newyear', prio: 2, name: 'Tết Dương lịch', date: '31/12 – 1/1', when: (d) => isDL(d, 31, 12) || isDL(d, 1, 1), front: partyHat, fx: 'fireworks', color: [255, 214, 90],
      face: (b, t, d) => { if ((t % 6) < 2.2) { b.eyes({ h: 0, w: 0, bright: 1 }); b.glyph({ k: 'yr', draw: (c) => ledText(c, String(isDL(d || new Date(), 31, 12) ? (d || new Date()).getFullYear() + 1 : (d || new Date()).getFullYear()), 13) }); } else b.eyes({ star: 1 }); }, say: 'Chúc mừng năm mới! 🎉' },
    { id: 'taoquan', name: 'Ông Công Ông Táo', date: '23 tháng Chạp (âm)', when: (d) => isAL(d, 23, 12), back: carp, color: [255, 190, 70], face: (b) => b.eyes({ happy: .8, h: 11 }), say: 'Tiễn ông Táo cưỡi cá chép về trời 🐟' },
    { id: 'tet', prio: 2, name: 'Tết Nguyên Đán', date: 'Giao thừa – mùng 3 (âm)', when: (d) => { const x = al(addDays(d, 1)); if (x[0] === 1 && x[1] === 1 && !x[3]) return true; const [a, m, , l] = al(d); return !l && m === 1 && a <= 3; },
      back: maiBranch, front: scarfRed + lixi, fx: 'petals', color: [255, 200, 60], face: (b, t) => b.eyes((t % 5) < 3.6 ? { happy: 1, h: 11 } : { heart: 1 }), say: 'Chúc mừng năm mới, an khang thịnh vượng! 🧧' },
    { id: 'valentine', name: 'Valentine', date: '14/2', when: (d) => isDL(d, 14, 2), front: heartBalloon, fx: 'hearts', color: [255, 110, 170], face: (b) => b.eyes({ heart: 1 }), say: 'Happy Valentine ❤' },
    { id: 'women', name: 'Quốc tế Phụ nữ', date: '8/3', when: (d) => isDL(d, 8, 3), front: bouquet(['#ff4d7a', '#ff8fb1', '#ffd43b']), fx: 'petals-pink', color: [255, 140, 190], face: (b) => b.eyes({ happy: 1, h: 11 }), say: 'Chúc mừng ngày 8/3 💐' },
    { id: 'pi', prio: 0, name: 'Ngày số Pi', date: '14/3', when: (d) => isDL(d, 14, 3), front: piePi, color: [140, 220, 255], face: (b, t) => { if ((t % 5) < 2) { b.eyes({ h: 0, w: 0 }); b.glyph({ k: 'pi', draw: (c) => ledText(c, 'π', 22) }); } else b.eyes({ happy: .6 }); }, say: 'π = 3.14159… 🥧' },
    { id: 'april', prio: 0, name: 'Cá tháng Tư', date: '1/4', when: (d) => isDL(d, 1, 4), front: groucho, color: [120, 255, 160], face: (b, t) => { b.eyes({ happy: .5 }); b.T.tilt = Math.sin(t * 2) * .1; }, say: 'Không ai nhận ra tôi đâu 🥸' },
    { id: 'hung', name: 'Giỗ Tổ Hùng Vương', date: '10/3 (âm)', when: (d) => isAL(d, 10, 3), front: banhChung, color: [255, 214, 90], face: (b) => b.eyes({ happy: .7, h: 11 }), say: 'Giỗ Tổ Hùng Vương 10/3' },
    { id: 'earth', prio: 0, name: 'Ngày Trái Đất', date: '22/4', when: (d) => isDL(d, 22, 4), front: sprout, color: [110, 240, 140], face: (b) => b.eyes({ happy: .8, h: 11 }), say: 'Ngày Trái Đất 🌱' },
    { id: 'r304', prio: 2, name: 'Giải phóng miền Nam', date: '30/4', when: (d) => isDL(d, 30, 4), front: flagVN, fx: 'fireworks', color: [255, 214, 64], face: (b, t) => b.eyes((t % 4) < 2.6 ? { happy: 1, h: 11 } : { star: 1 }), say: 'Mừng 30/4 🇻🇳' },
    { id: 'labor', name: 'Quốc tế Lao động', date: '1/5', when: (d) => isDL(d, 1, 5), front: helmet + wrench(258, 112) + hand(252, 150), color: [255, 200, 60], face: (b, t) => { b.eyes({ lid: .25, lidAng: .25, h: 11 }); b.T.gx = Math.sin(t * 2) * 2; }, say: 'Mừng 1/5, hôm nay nghỉ nhé 👷' },
    { id: 'starwars', prio: 0, name: 'Star Wars Day', date: '4/5', when: (d) => isDL(d, 4, 5), front: saber, color: [120, 255, 150], face: (b) => b.eyes({ lid: .3, lidAng: .3, h: 11 }), say: 'May the 4th be with you' },
    { id: 'kids', name: 'Quốc tế Thiếu nhi', date: '1/6', when: (d) => isDL(d, 1, 6), front: balloons, fx: 'confetti', color: [120, 230, 255], face: (b) => b.eyes({ w: 13, h: 14, r: .9, happy: .3 }), say: 'Chúc mừng 1/6 🎈' },
    { id: 'vulan', name: 'Lễ Vu Lan', date: 'Rằm tháng 7 (âm)', when: (d) => isAL(d, 15, 7), front: roseClip, color: [255, 170, 190], face: (b) => b.eyes({ happy: .5, lid: .15, h: 10 }), say: 'Mùa Vu Lan báo hiếu 🌹' },
    { id: 'r29', prio: 2, name: 'Quốc khánh', date: '2/9', when: (d) => isDL(d, 2, 9), front: flagVN, fx: 'fireworks', color: [255, 214, 64], face: (b, t) => b.eyes((t % 4) < 2.6 ? { happy: 1, h: 11 } : { star: 1 }), say: 'Mừng Quốc khánh 2/9 🇻🇳' },
    { id: 'dev', prio: 0, name: 'Ngày Lập trình viên', date: 'Ngày thứ 256 (13/9, năm nhuận 12/9)', when: (d) => dayOfYear(d) === 256, front: capCode, color: [63, 242, 255], face: (b, t) => { if ((t % 5) < 2) { b.eyes({ h: 0, w: 0 }); b.glyph({ k: 'bin', draw: (c) => ledText(c, '256', 16) }); } else b.eyes({ lid: .2 }); }, say: 'Happy Programmer\'s Day — 2⁸ 💻' },
    { id: 'trungthu', prio: 2, name: 'Tết Trung thu', date: 'Rằm tháng 8 (âm)', when: (d) => isAL(d, 15, 8), back: moon, front: starLantern, color: [255, 190, 80], face: (b) => b.eyes({ happy: .8, h: 11 }), say: 'Trung thu vui vẻ 🏮' },
    { id: 'vnwomen', name: 'Phụ nữ Việt Nam', date: '20/10', when: (d) => isDL(d, 20, 10), front: nonLa + bouquet(['#ff4d7a', '#ffffff', '#ff8fb1']), fx: 'petals-pink', color: [255, 140, 190], face: (b) => b.eyes({ happy: 1, h: 11 }), say: 'Chúc mừng 20/10 💐' },
    { id: 'halloween', name: 'Halloween', date: '31/10', when: (d) => isDL(d, 31, 10), front: witch, back: pumpkin, fx: 'bats', color: [255, 140, 40], face: (b, t) => { const k = (t % 5); k < 3.4 ? b.eyes({ lid: .35, lidAng: .4, h: 11 }) : b.eyes({ w: 13, h: 15, r: .9 }); b.T.gx = Math.sin(t * 1.3) * 3; }, say: 'Trick or treat! 🎃' },
    { id: 'teacher', name: 'Nhà giáo Việt Nam', date: '20/11', when: (d) => isDL(d, 20, 11), front: teacher, color: [150, 210, 255], face: (b, t) => { b.eyes({ h: 7, w: 12, r: .5 }); b.T.gx = -4 + ((t * .8) % 1) * 8; b.T.gy = 2; }, say: 'Tri ân thầy cô 20/11 📖' },
    { id: 'xmas', prio: 2, name: 'Giáng sinh', date: '24 – 25/12', when: (d) => isDL(d, 24, 12) || isDL(d, 25, 12), front: santa, fx: 'snow', color: [255, 255, 255], face: (b, t) => b.eyes((t % 5) < 3.5 ? { happy: .9, h: 11 } : { star: 1 }), say: 'Merry Christmas 🎄' },
  ];
  // chữ số điểm ảnh 3×5 (phóng 2 lần) cho màn LED 48×30: nét hơn font thường ở độ phân giải thấp
  const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', ':': '0101010' };
  function ledDigits(c, str, cx = 24, cy = 15, k = 2) {
    const ws = [...str].map((ch) => (ch === ':' ? 1 : 3) * k), W = ws.reduce((a, b) => a + b, 0) + (str.length - 1) * k;
    let x = Math.round(cx - W / 2); const y = Math.round(cy - 2.5 * k);
    [...str].forEach((ch, i) => { const bits = DIG[ch], w = ch === ':' ? 1 : 3; if (bits) for (let j = 0; j < bits.length; j++) if (bits[j] === '1') c.fillRect(x + (j % w) * k, y + Math.floor(j / w) * k, k, k); x += ws[i] + k; });
  }
  function ledText(c, s, size) { if (/^[0-9:]+$/.test(s)) return ledDigits(c, s); c.font = `bold ${size}px Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 24, 16); }

  // trùng ngày (vd Tết trùng Valentine) → dịp lớn thắng
  // trang phục đã có đồ cầm tay → robot không cầm thêm đạo cụ công cụ (cờ lê, bút…)
  for (const e of E) e.hand = /#2b313c/.test((e.front || '') + (e.back || ''));
  function today(d = new Date()) { let best = null; for (const e of E) if (e.when(d) && (!best || (e.prio ?? 1) > (best.prio ?? 1))) best = e; return best; }
  // ngày dương gần nhất (trong 400 ngày tới) của một sự kiện
  function nextDate(e, from = new Date()) { for (let i = 0; i < 400; i++) { const d = addDays(from, i); if (e.when(d)) return d; } return null; }

  window.Seasons = { EVENTS: E, today, nextDate, lunar, ledDigits };
})();
