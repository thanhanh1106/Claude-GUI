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

  const RULE = 'This is a side question ("/btw") asked while the main conversation continues elsewhere. Answer briefly and directly from the conversation so far and by reading files if needed. Do not modify any files and do not continue the main task — just answer the question. Reply in the same language as the question.';

  function build() {
    const input = h('textarea', { class: 'btw-in', rows: 1, placeholder: 'Hỏi bên lề… (Enter gửi · Esc đóng)', spellcheck: 'false' });
    const model = h('select', { class: 'btw-model', title: 'Model trả lời câu hỏi bên lề' },
      h('option', { value: '', text: 'Theo phiên chính' }), h('option', { value: 'haiku', text: 'Haiku (rẻ)' }), h('option', { value: 'sonnet', text: 'Sonnet' }));
    model.value = (S().settings || {}).btwModel || '';
    model.onchange = () => { CG.saveSettings && CG.saveSettings({ btwModel: model.value }); if (B.conv && !B.conv.count) B.conv.model = model.value || (B.parent && B.parent.model) || 'default'; };
    const acts = h('div', { class: 'btw-acts hidden' },
      h('button', { class: 'btn xs', text: 'Chèn vào chat', title: 'Đưa câu trả lời cuối vào ô nhập của phiên chính', onclick: () => { const t = lastAnswer(); if (t && CG.app) { CG.app.insertText(t); toast('Đã chèn vào ô nhập'); } } }),
      h('button', { class: 'btn xs', text: 'Gửi vào phiên chính', title: 'Gửi câu hỏi + câu trả lời thành tin nhắn ở phiên chính', onclick: () => { const t = lastAnswer(); if (t && B.parent) { const msg = `Ghi chú từ câu hỏi bên lề:\nHỏi: ${B.lastQ || ''}\nĐáp: ${t}`; B.parent.send(msg, msg); toast('Đã gửi vào phiên chính'); } } }));
    const el = h('div', { id: 'btw', class: 'hidden' },
      h('div', { class: 'btw-head' }, icon('message', 14), h('b', { text: 'Hỏi bên lề' }), h('span', { class: 'btw-sub', text: 'đọc được phiên chính, không ghi vào đó' }), h('span', { class: 'spacer' }), model,
        h('button', { class: 'icon-btn sm', title: 'Đóng (Esc)', html: svg('x', 13), onclick: close })),
      h('div', { class: 'btw-body' }, h('div', { id: 'btw-convs' }), h('div', { class: 'btw-empty', text: 'Hỏi về việc phiên chính đang làm — vd "sao nó lại sửa tệp này?", "bước tiếp theo là gì?". Phiên chính vẫn chạy bình thường.' })),
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
    if (!p || !p.started || !p.sid) return toast('Mở một phiên đã có hội thoại rồi mới hỏi bên lề được.', true);
    if (p.btw || p.nb) return;
    if (!B.el) build();
    if (B.parent !== p) dispose(); // đổi phiên chính → bỏ cuộc hỏi bên lề cũ
    B.parent = p;
    B.el.classList.remove('hidden');
    B.el.querySelector('.btw-empty').classList.toggle('hidden', !!(B.conv && B.conv.count));
    if (CG.app) CG.app.placeConvs();
    setTimeout(() => B.input.focus(), 20);
  }
  function close() {
    if (!B.el) return;
    B.el.classList.add('hidden');
    dispose();
    if (CG.app) CG.app.placeConvs();
    const inp = $('#input'); if (inp) inp.focus();
  }
  // Đóng là bỏ (giống bản gốc): dừng tiến trình, gỡ khỏi danh sách phiên trong app. Tệp jsonl vẫn còn (đã ẩn).
  function dispose() {
    const c = B.conv;
    B.conv = null; B.lastQ = '';
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
      c = await CG.app.createConv({ cwd: p.cwd, model: B.model.value || p.model, effort: 'low', mode: 'default', title: '💬 Hỏi bên lề' });
      c.btw = true;
      c.btwParent = p.sid;
      c.addDirs = p.addDirs || [];
      c.spawnOpts = { forkFrom: p.sid, tools: ['Read', 'Grep', 'Glob'], appendPrompt: RULE, lean: true };
      B.conv = c;
      CG.app.placeConvs();
    }
    B.lastQ = text;
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
  function afterRender(c) { if (c === B.conv && B.el) { const b = B.el.querySelector('.btw-body'); b.scrollTop = b.scrollHeight; } }
  function onActivate(conv) { if (B.el && !B.el.classList.contains('hidden') && conv !== B.parent && conv !== B.conv) close(); }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === ';' || e.code === 'Semicolon')) { e.preventDefault(); if (B.el && !B.el.classList.contains('hidden')) close(); else open(); }
  });
  CG.btw = { open, close, ask, hiddenSids, shownConv, onInit, afterRender, onActivate };
})();
