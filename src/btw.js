'use strict';
// Hỏi bên lề (/btw, Ctrl+;) — giống bản desktop: hỏi nhanh một câu về việc đang làm mà không chen vào phiên chính.
// Chạy một phiên CLI rẽ nhánh (--resume <phiên chính> --fork-session) nên đọc được toàn bộ cuộc trò chuyện chính,
// chỉ có công cụ đọc. Phiên rẽ nhánh vẫn ghi jsonl như mọi phiên (để thống kê sử dụng), chỉ ẩn khỏi danh sách phiên.
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, h, svg, icon, toast } = CG;
  const S = () => CG.S;
  const B = { el: null, conv: null, parent: null };
  const KEY = 'cg.btwSids';
  const sids = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  function remember(sid) {
    const a = sids().filter((x) => x !== sid);
    a.push(sid);
    try { localStorage.setItem(KEY, JSON.stringify(a.slice(-500))); } catch {}
  }
  const hiddenSids = () => new Set(sids());
  const shownConv = () => (B.el && !B.el.classList.contains('hidden') ? B.conv : null);

  const SUGS = ['Đang làm tới đâu rồi, còn những bước nào?', 'Vừa rồi đã sửa những tệp nào, vì sao?', 'Có gì rủi ro hoặc cần mình quyết không?'];
  const RULE = 'This is a side question ("/btw") asked while the main conversation continues elsewhere. Answer briefly and directly from the conversation so far and by reading files if needed. Do not modify any files and do not continue the main task — just answer the question. The main session may still be running right now: a tool call at the end of the transcript that looks interrupted or has no result is most likely still in progress in the main session (the copy you see was taken mid-turn) — describe it as "đang chạy", not as failed or interrupted. Reply in the same language as the question.';

  function build() {
    const input = h('textarea', { class: 'btw-in', rows: 1, placeholder: 'Hỏi bên lề… (Enter gửi · Esc đóng)', spellcheck: 'false' });
    const model = h('select', { class: 'btw-model', title: 'Model trả lời câu hỏi bên lề' },
      h('option', { value: '', text: 'Theo phiên chính' }), h('option', { value: 'sonnet', text: 'Sonnet (rẻ hơn)' }), h('option', { value: 'haiku', text: 'Haiku (rẻ nhất)' }));
    model.value = (S().settings || {}).btwModel || '';
    model.onchange = () => { CG.saveSettings && CG.saveSettings({ btwModel: model.value }); if (B.conv && !B.conv.count) B.conv.model = model.value || (B.parent && B.parent.model) || 'default'; };
    const acts = h('div', { class: 'btw-acts hidden' },
      h('button', { class: 'btn xs', text: 'Chèn vào chat', title: 'Đưa câu trả lời cuối vào ô nhập của phiên chính', onclick: () => { const t = lastAnswer(); if (t && CG.app) { CG.app.insertText(t); toast('Đã chèn vào ô nhập'); } } }),
      h('button', { class: 'btn xs', text: 'Gửi vào phiên chính', title: 'Gửi câu hỏi + câu trả lời thành tin nhắn ở phiên chính (đang chạy thì Claude đọc ở bước kế tiếp)', onclick: () => { const t = lastAnswer(); if (t && B.parent) { const msg = `Ghi chú từ câu hỏi bên lề:\nHỏi: ${B.lastQ || ''}\nĐáp: ${t}`; B.parent.send(msg, msg); toast('Đã gửi vào phiên chính'); } } }),
      h('button', { class: 'btn xs', text: 'Mở thành phiên riêng', title: 'Giữ cuộc hỏi này thành một phiên bình thường trong danh sách (đủ công cụ, hỏi tiếp thoải mái)', onclick: detach }),
      h('button', { class: 'btn xs', text: 'Chép', onclick: () => { const t = lastAnswer(); if (t) { navigator.clipboard.writeText(t); toast('Đã chép câu trả lời'); } } }),
      h('span', { class: 'btw-meta' }));
    const el = h('div', { id: 'btw', class: 'hidden' },
      h('div', { class: 'btw-head' }, icon('message', 14), h('b', { text: 'Hỏi bên lề' }), h('span', { class: 'btw-sub', text: 'đọc được phiên chính, không ghi vào đó' }), h('span', { class: 'spacer' }), model,
        h('button', { class: 'icon-btn sm', title: 'Đóng (Esc)', html: svg('x', 13), onclick: close })),
      h('div', { class: 'btw-body' }, h('div', { id: 'btw-convs' }), h('div', { class: 'btw-empty' },
        h('div', { text: 'Claude đọc toàn bộ phiên chính tới lúc hỏi (kể cả lượt đang chạy) để trả lời. Phiên chính không bị dừng, không bị thêm gì. Chỉ đọc — không sửa tệp, không chạy lệnh.' }),
        h('div', { class: 'btw-ctx' }),
        h('div', { class: 'btw-sugs' }, SUGS.map((q) => h('button', { class: 'btw-sug', text: q, onclick: () => ask(q) }))))),
      acts, input);
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
    };
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
    $('#chat-col').append(el);
    Object.assign(B, { el, input, model, acts });
  }
  function lastAnswer() {
    const ts = B.conv ? [...B.conv.root.querySelectorAll('.turn')] : [];
    for (let i = ts.length - 1; i >= 0; i--) { const md = [...ts[i].querySelectorAll(':scope > .md')].pop(); if (md && md.textContent.trim()) return md.textContent.trim(); }
    return '';
  }
  function open() {
    const p = S().active;
    if (!p || !p.started || !p.sid || p.rs) return toast('Mở một phiên đã có hội thoại rồi mới hỏi bên lề được.', true);
    if (p.btw || p.nb) return;
    if (!B.el) build();
    if (B.parent !== p) dispose(); // đổi phiên chính → bỏ cuộc hỏi bên lề cũ
    B.parent = p;
    const big = (p.ctx || 0) > 190000;
    const hk = B.model.querySelector('option[value=haiku]');
    hk.disabled = big; hk.textContent = big ? 'Haiku — ngữ cảnh quá lớn' : 'Haiku (rẻ nhất)';
    if (big && B.model.value === 'haiku') B.model.value = 'sonnet';
    B.el.querySelector('.btw-ctx').textContent = (p.ctx ? `Ngữ cảnh phiên chính: ${Math.round(p.ctx / 1000)}k token · ` : '') + 'phần đã có được đọc lại từ cache nên rẻ hơn gửi mới.';
    B.el.classList.remove('hidden');
    syncBtn(S().active);
    B.el.querySelector('.btw-empty').classList.toggle('hidden', !!(B.conv && B.conv.count));
    if (CG.app) CG.app.placeConvs();
    setTimeout(() => B.input.focus(), 20);
  }
  function close() {
    if (!B.el) return;
    B.el.classList.add('hidden');
    dispose();
    if (CG.app) CG.app.placeConvs();
    syncBtn(S().active);
    const inp = $('#input'); if (inp) inp.focus();
  }
  // Giữ cuộc hỏi bên lề thành phiên thường: hiện trong danh sách, lượt sau chạy lại với đủ công cụ như mọi phiên
  async function detach() {
    const c = B.conv;
    if (!c || !c.sid) return;
    if (c.busy) return toast('Đợi trả lời xong đã…');
    B.conv = null;
    c.btw = false; c.btwParent = null; c.spawnOpts = null; c.persisted = true;
    const a = sids().filter((x) => x !== c.sid);
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {}
    api.stop(c.key);
    const t = '💬 ' + (B.firstQ || 'Hỏi bên lề').slice(0, 60);
    c.title = t;
    if (api.renameSession) await api.renameSession(c.sid, t).catch(() => {});
    if (CG.suggest && CG.suggest.linkChild && B.parent) { try { CG.suggest.linkChild(c.sid, B.parent.sid, t); } catch {} }
    close();
    CG.app.activate(c);
    if (CG.app.refreshSessions) CG.app.refreshSessions();
  }
  // Nút "Hỏi bên lề" cạnh ô chọn model — nổi bật khi phiên đang chạy (lúc hay thắc mắc nhất)
  function syncBtn(c) {
    let b = $('#ctl-btw');
    const ok = c && c.started && c.sid && !c.btw && !c.nb && !c.child && !c.rs && S().settings && S().settings.btwButton !== false;
    if (!ok) { if (b) b.classList.add('hidden'); return; }
    const anchor = $('#ctl-cost') || $('#ctl-model');
    if (!b) {
      b = h('button', { id: 'ctl-btw', class: 'ctl btw-btn', 'data-pop-anchor': '' });
      b.onclick = () => { if (B.el && !B.el.classList.contains('hidden')) close(); else open(); };
    }
    if (anchor && b.nextSibling !== anchor) anchor.before(b);
    const on = B.el && !B.el.classList.contains('hidden');
    b.classList.remove('hidden');
    b.classList.toggle('busy', !!c.busy && !on);
    b.classList.toggle('on', !!on);
    b.innerHTML = '';
    b.append(icon('message', 14), c.busy ? h('span', { text: 'Hỏi bên lề' }) : null);
    b.title = 'Hỏi bên lề (Ctrl+;) — hỏi về phiên này mà không làm gián đoạn';
  }
  // Đóng là bỏ (giống bản gốc): dừng tiến trình, gỡ khỏi danh sách phiên trong app. Tệp jsonl vẫn còn (đã ẩn).
  function dispose() {
    const c = B.conv;
    B.conv = null; B.lastQ = ''; B.firstQ = '';
    if (B.acts) B.acts.classList.add('hidden');
    if (!c) return;
    api.stop(c.key);
    c.root.remove();
    S().convs.delete(c.key);
  }
  async function ask(text) {
    text = String(text || '').trim();
    if (!text || !B.parent) return;
    let c = B.conv;
    if (c && c.busy) return toast('Đang trả lời câu trước…');
    if (!c) {
      const p = B.parent;
      // lượt đầu của phiên mới: CLI chỉ ghi hội thoại ra đĩa khi bắt đầu gọi model (khởi động + nạp MCP có thể mất ~30 giây)
      if (p.busy && !p.turnText && !p.turnTools && !(p.cost > 0) && p.count <= 3) return toast('Phiên chính đang khởi động, chưa có hội thoại để đọc — đợi Claude bắt đầu trả lời rồi hỏi nhé.', true);
      c = await CG.app.createConv({ cwd: p.cwd, model: B.model.value || p.model, effort: 'low', mode: 'default', title: '💬 Hỏi bên lề' });
      c.btw = true;
      c.btwParent = p.sid;
      c.addDirs = p.addDirs || [];
      c.spawnOpts = { forkFrom: p.sid, tools: ['Read', 'Grep', 'Glob'], appendPrompt: RULE, lean: true };
      B.conv = c;
      CG.app.placeConvs();
    }
    B.lastQ = text;
    if (!B.firstQ) B.firstQ = text;
    B.t0 = Date.now();
    B.input.value = ''; B.input.style.height = 'auto';
    B.el.querySelector('.btw-empty').classList.add('hidden');
    await c.send(text, text);
    B.acts.classList.remove('hidden');
  }
  // app.js gọi khi phiên rẽ nhánh khởi động xong: đã có id riêng → lần chạy lại (nếu có) resume chính nó
  function onInit(c, m) {
    if (c.spawnOpts && c.spawnOpts.forkFrom) { const o = { ...c.spawnOpts }; delete o.forkFrom; c.spawnOpts = o; }
    if (m.session_id) remember(m.session_id);
  }
  // cuộn theo câu trả lời
  function afterRender(c) {
    if (c !== B.conv || !B.el) return;
    const b = B.el.querySelector('.btw-body'); b.scrollTop = b.scrollHeight;
    const m = B.el.querySelector('.btw-meta');
    if (m) m.textContent = c.busy ? 'đang đọc phiên…' : [c.model && c.model !== 'default' ? c.model : '', B.t0 ? Math.max(1, Math.round((Date.now() - B.t0) / 1000)) + ' giây' : '', c.cost ? '≈ $' + c.cost.toFixed(2) : ''].filter(Boolean).join(' · ');
  }
  function onActivate(conv) { if (B.el && !B.el.classList.contains('hidden') && conv !== B.parent && conv !== B.conv) close(); }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === ';' || e.code === 'Semicolon')) { e.preventDefault(); if (B.el && !B.el.classList.contains('hidden')) close(); else open(); }
  });
  CG.btw = { open, close, ask, hiddenSids, shownConv, onInit, afterRender, onActivate, syncBtn, detach };
})();
