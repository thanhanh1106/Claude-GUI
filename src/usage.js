'use strict';
// Bảng chi phí & token: đọc usage-stats.json (main ghi theo từng lượt) → theo ngày / model / dự án / phiên,
// kèm ước tính "nếu cả phần Opus/Fable chạy bằng Sonnet". Gói Max/Pro: đây là chi phí quy đổi theo giá API, không phải tiền bị trừ.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { h, modal, basename, fmtTok } = CG;

  // giá $/1M token (input, output, ghi cache 5 phút, đọc cache) — giá API công khai của Anthropic
  const PRICE = {
    fable: { label: 'Fable', i: 10, o: 50, cw: 12.5, cr: 0.25 },
    opus: { label: 'Opus', i: 4, o: 20, cw: 5, cr: 0.2 },
    sonnet: { label: 'Sonnet', i: 2, o: 10, cw: 2.5, cr: 0.2 },
    haiku: { label: 'Haiku', i: 0.1, o: 0.5, cw: 0.125, cr: 0.01 },
  };
  const family = (name) => (/fable|mythos/i.test(name) ? 'fable' : /opus/i.test(name) ? 'opus' : /sonnet/i.test(name) ? 'sonnet' : /haiku/i.test(name) ? 'haiku' : 'other');
  const priceOf = (u, f) => { const p = PRICE[f]; return p ? (u.i * p.i + u.o * p.o + u.cw * p.cw + u.cr * p.cr) / 1e6 : u.c; };
  const usd = (n) => (n >= 100 ? '$' + n.toFixed(0) : n >= 1 ? '$' + n.toFixed(2) : n > 0 ? '$' + n.toFixed(3) : '$0');
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const prettyModel = (n) => String(n).replace(/^claude-/, '').replace(/-(\d+)-(\d+)/, ' $1.$2').replace(/-(\d+)$/, ' $1').replace(/\[1m\]/, ' (1M)');

  let cache = null, cacheT = 0;
  async function load(force) {
    if (!force && cache && Date.now() - cacheT < 4000) return cache;
    cache = await api.statsGet().catch(() => ({ days: {} }));
    cacheT = Date.now();
    return cache;
  }

  // gộp số liệu N ngày gần nhất (days = 1 → hôm nay)
  function summarize(S, days) {
    const keys = [];
    for (let i = days - 1; i >= 0; i--) keys.push(dayKey(Date.now() - i * 864e5));
    const out = { keys, perDay: [], models: {}, projects: {}, sessions: {}, cost: 0, turns: 0, tok: { i: 0, o: 0, cr: 0, cw: 0 }, ev: {}, asSonnet: 0, heavy: 0 };
    for (const k of keys) {
      const d = (S.days || {})[k];
      let dc = 0;
      if (d) {
        for (const [sid, x] of Object.entries(d.s || {})) {
          const ss = (out.sessions[sid] = out.sessions[sid] || { sid, t: x.t, cwd: x.cwd, c: 0, n: 0, tok: 0, fams: new Set() });
          if (x.t) ss.t = x.t;
          ss.c += x.c; ss.n += x.n;
          const pk = (x.cwd || '').toLowerCase();
          const pr = (out.projects[pk] = out.projects[pk] || { cwd: x.cwd, c: 0, n: 0, sess: new Set() });
          pr.c += x.c; pr.n += x.n; pr.sess.add(sid);
          out.turns += x.n;
          for (const [name, u] of Object.entries(x.m || {})) {
            const f = family(name);
            const mm = (out.models[name] = out.models[name] || { name, fam: f, i: 0, o: 0, cr: 0, cw: 0, c: 0 });
            for (const t of ['i', 'o', 'cr', 'cw', 'c']) mm[t] += u[t] || 0;
            for (const t of ['i', 'o', 'cr', 'cw']) out.tok[t] += u[t] || 0;
            ss.tok += (u.i || 0) + (u.o || 0) + (u.cr || 0) + (u.cw || 0);
            ss.fams.add(f);
            out.cost += u.c || 0; dc += u.c || 0;
            // nếu dùng Sonnet: giữ nguyên phần Sonnet/Haiku, tính lại phần Opus/Fable theo giá Sonnet
            if (f === 'opus' || f === 'fable') { out.asSonnet += priceOf(u, 'sonnet'); out.heavy += u.c || 0; } else out.asSonnet += u.c || 0;
          }
        }
        for (const [e, n] of Object.entries(d.ev || {})) out.ev[e] = (out.ev[e] || 0) + n;
      }
      out.perDay.push({ k, c: dc });
    }
    return out;
  }

  // số liệu hôm nay cho robot (ví token) — gọi thường xuyên nên có cache ngắn
  async function today() {
    const s = summarize(await load(true), 1);
    return { cost: s.cost, turns: s.turns, tok: s.tok, total: s.tok.i + s.tok.o + s.tok.cr + s.tok.cw, out: s.tok.o, models: s.models, ev: s.ev, sessions: Object.keys(s.sessions).length };
  }

  const bar = (frac) => h('div', { class: 'us-bar' }, h('i', { style: `width:${Math.max(frac > 0 ? 2 : 0, Math.round(frac * 100))}%` }));
  const tile = (label, value, sub) => h('div', { class: 'us-tile' }, h('div', { class: 'us-tl', text: label }), h('div', { class: 'us-tv', text: value }), sub ? h('div', { class: 'us-ts', text: sub }) : null);

  function dayChart(perDay) {
    const max = Math.max(...perDay.map((d) => d.c), 0.0001);
    const W = 640, H = 120, gap = 2, bw = Math.max(3, (W - gap * (perDay.length - 1)) / perDay.length);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 16}`);
    svg.setAttribute('class', 'us-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Chi phí quy đổi theo ngày');
    const tip = h('div', { class: 'us-tip hidden' });
    perDay.forEach((d, i) => {
      const x = i * (bw + gap), bh = d.c > 0 ? Math.max(3, (d.c / max) * H) : 0;
      const g = document.createElementNS(ns, 'g');
      const hit = document.createElementNS(ns, 'rect');
      Object.entries({ x, y: 0, width: bw + gap, height: H + 16, fill: 'transparent' }).forEach(([k, v]) => hit.setAttribute(k, v));
      const r = document.createElementNS(ns, 'path');
      const y = H - bh, rr = Math.min(4, bw / 2, bh);
      // bo 4px ở đầu cột, đáy vuông bám trục
      r.setAttribute('d', bh ? `M${x},${H} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${H} Z` : '');
      r.setAttribute('class', 'us-col' + (i === perDay.length - 1 ? ' now' : ''));
      g.append(hit, r);
      if (perDay.length <= 10 || i % Math.ceil(perDay.length / 8) === 0 || i === perDay.length - 1) {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', x + bw / 2); t.setAttribute('y', H + 13); t.setAttribute('class', 'us-ax');
        t.textContent = d.k.slice(8) + '/' + d.k.slice(5, 7);
        g.append(t);
      }
      g.onmouseenter = () => { tip.textContent = `${d.k.slice(8)}/${d.k.slice(5, 7)}: ${usd(d.c)}`; tip.classList.remove('hidden'); tip.style.left = `${((x + bw / 2) / W) * 100}%`; r.classList.add('hov'); };
      g.onmouseleave = () => { tip.classList.add('hidden'); r.classList.remove('hov'); };
      svg.append(g);
    });
    const base = document.createElementNS(ns, 'line');
    Object.entries({ x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5, class: 'us-base' }).forEach(([k, v]) => base.setAttribute(k, v));
    svg.append(base);
    return h('div', { class: 'us-chartbox' }, svg, tip);
  }

  async function open(range = 7) {
    const S = await load(true);
    const body = h('div', { class: 'us' });
    const m = modal('Chi phí & token', body, [h('button', { class: 'btn', text: 'Đóng', onclick: () => m.close() })], { cls: 'us-modal' });
    const tabs = h('div', { class: 'us-tabs' });
    const view = h('div', { class: 'us-view' });
    body.append(tabs, view);
    const draw = (days) => {
      tabs.innerHTML = '';
      for (const [d, l] of [[1, 'Hôm nay'], [7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày']]) tabs.append(h('button', { class: 'us-tab' + (d === days ? ' on' : ''), text: l, onclick: () => draw(d) }));
      const s = summarize(S, days);
      view.innerHTML = '';
      const totTok = s.tok.i + s.tok.o + s.tok.cr + s.tok.cw;
      const save = s.cost - s.asSonnet;
      view.append(
        h('div', { class: 'us-tiles' },
          tile('Chi phí quy đổi (giá API)', usd(s.cost), `${s.turns} lượt · ${Object.keys(s.sessions).length} phiên`),
          tile('Token', fmtTok(totTok), `vào ${fmtTok(s.tok.i)} · ra ${fmtTok(s.tok.o)} · cache đọc ${fmtTok(s.tok.cr)}`),
          tile('Nếu phần Opus/Fable chạy bằng Sonnet', usd(s.asSonnet), s.heavy > 0 ? `rẻ hơn ${usd(save)} (${Math.round((save / Math.max(s.cost, 1e-9)) * 100)}%) — chất lượng có thể khác` : 'Chưa dùng Opus/Fable')),
        h('div', { class: 'us-note', text: 'Gói Max/Pro không trừ tiền theo số này — đây là chi phí quy đổi theo giá API để so sánh mức dùng giữa các model, dự án và phiên. Số liệu chỉ tính các lượt chạy qua Claude GUI trên máy này (từ bản 1.16.0).' }),
      );
      if (days > 1) view.append(h('div', { class: 'us-sec', text: 'Theo ngày' }), dayChart(s.perDay));
      const models = Object.values(s.models).sort((a, b) => b.c - a.c);
      const maxM = Math.max(...models.map((x) => x.c), 1e-9);
      view.append(h('div', { class: 'us-sec', text: 'Theo model' }), models.length ? h('table', { class: 'us-tab-t' },
        h('thead', {}, h('tr', {}, ...['Model', 'Vào', 'Ra', 'Cache đọc', 'Cache ghi', 'Chi phí', 'Nếu Sonnet', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...models.map((x) => h('tr', {},
          h('td', { text: prettyModel(x.name) }), h('td', { text: fmtTok(x.i) }), h('td', { text: fmtTok(x.o) }), h('td', { text: fmtTok(x.cr) }), h('td', { text: fmtTok(x.cw) }),
          h('td', { class: 'num', text: usd(x.c) }), h('td', { class: 'num muted', text: x.fam === 'opus' || x.fam === 'fable' ? usd(priceOf(x, 'sonnet')) : '—' }), h('td', { class: 'us-bc' }, bar(x.c / maxM)))))) : h('div', { class: 'us-empty', text: 'Chưa có lượt nào trong khoảng này.' }));
      const projs = Object.values(s.projects).sort((a, b) => b.c - a.c).slice(0, 12);
      const maxP = Math.max(...projs.map((x) => x.c), 1e-9);
      if (projs.length) view.append(h('div', { class: 'us-sec', text: 'Theo dự án' }), h('table', { class: 'us-tab-t' },
        h('thead', {}, h('tr', {}, ...['Dự án', 'Phiên', 'Lượt', 'Chi phí', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...projs.map((x) => h('tr', { title: x.cwd || '' }, h('td', { text: basename(x.cwd) || '(không rõ)' }), h('td', { text: String(x.sess.size) }), h('td', { text: String(x.n) }), h('td', { class: 'num', text: usd(x.c) }), h('td', { class: 'us-bc' }, bar(x.c / maxP)))))));
      const sess = Object.values(s.sessions).sort((a, b) => b.c - a.c).slice(0, 10);
      if (sess.length) view.append(h('div', { class: 'us-sec', text: 'Phiên tốn nhất' }), h('table', { class: 'us-tab-t' },
        h('thead', {}, h('tr', {}, ...['Phiên', 'Dự án', 'Model', 'Lượt', 'Token', 'Chi phí'].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...sess.map((x) => {
          const tr = h('tr', { class: 'us-click', title: 'Mở phiên này' }, h('td', { text: x.t || x.sid.slice(0, 8) }), h('td', { text: basename(x.cwd) }), h('td', { text: [...x.fams].map((f) => (PRICE[f] || { label: f }).label).join(', ') }), h('td', { text: String(x.n) }), h('td', { text: fmtTok(x.tok) }), h('td', { class: 'num', text: usd(x.c) }));
          tr.onclick = () => { if (CG.app && CG.app.openSession) { m.close(); CG.app.openSession({ id: x.sid, cwd: x.cwd, title: x.t }); } };
          return tr;
        }))));
    };
    draw(range);
  }

  CG.usage = { open, today, summarize, load, family, priceOf, PRICE, usd };
})();
