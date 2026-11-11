'use strict';
// Trang "Skill": xem mọi skill / lệnh / mà Claude Code nạp được (dự án, cá nhân, plugin, bộ skill của GUI, đồng bộ từ tài khoản),
// đọc mô tả + nội dung, sửa / tạo mới / xoá skill của dự án hoặc cá nhân, nhờ Claude soạn skill mới (qua CLI).
(() => {
  const api = window.api;
  const CG = window.CG;
  const { $, h, svg, icon, toast, confirmDialog, mdEl } = CG;
  const S = () => CG.S;

  const U = { page: null, open: false, items: [], sel: null, q: '', usage: null, edit: null, info: null, cwd: '' };
  const TAG = { proj: 'Dự án', me: 'Cá nhân', gui: 'Claude GUI', plug: 'Plugin', synced: 'Tài khoản' };
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
  const weak = (it) => !it.ro && words(it.desc) < 8;
  const key = (it) => it.file;
  const curCwd = () => { const c = S().active; return (c && !c.rs && c.cwd) || S().home || ''; };

  // ---------- dữ liệu ----------
  async function load(keepSel) {
    U.cwd = curCwd();
    const c = S().active;
    const r = await api.skList({ cwd: U.cwd, plugins: (c && c.initPlugins) || [] }).catch((e) => ({ ok: false, error: e.message }));
    if (!r || !r.ok) { toast('Không đọc được danh sách skill: ' + ((r && r.error) || ''), true); return; }
    U.info = r;
    U.items = r.items;
    if (!keepSel || !U.items.some((x) => key(x) === U.sel)) U.sel = U.items[0] ? key(U.items[0]) : null;
    render();
    if (!U.usage) api.skUsage().then((u) => { U.usage = u || {}; if (U.open) { renderList(); if (!U.edit) view(); } }).catch(() => {});
  }
  const usedOf = (it) => (U.usage ? U.usage[it.name] || 0 : null);

  // ---------- trang ----------
  function ensure() {
    if (U.page) return;
    U.page = h('div', { id: 'skills-page', class: 'skp hidden' });
    $('#main').append(U.page);
  }
  function openPage(name) {
    ensure();
    if (CG.sched && CG.sched._U && CG.sched._U.open) CG.sched.close();
    U.open = true;
    U.edit = null;
    U.page.classList.remove('hidden');
    $('#nav-skills') && $('#nav-skills').classList.add('active');
    if (name) U.want = name;
    load(true).then(() => { if (U.want) { const it = U.items.find((x) => x.name === U.want || x.base === U.want); U.want = null; if (it) { U.sel = key(it); render(); } } });
    render();
    if (CG.mascot) CG.mascot.relayout();
  }
  function closePage() {
    if (!U.page || !U.open) return;
    U.open = false;
    U.page.classList.add('hidden');
    $('#nav-skills') && $('#nav-skills').classList.remove('active');
    if (CG.mascot) CG.mascot.relayout();
  }
  function render() {
    if (!U.open || !U.page) return;
    const pg = U.page;
    pg.innerHTML = '';
    pg.append(h('div', { class: 'skp-hdr' },
      h('h2', { text: 'Skill' }),
      h('button', { class: 'btn primary sm', onclick: () => editor(null) }, icon('plus', 14), 'Skill mới'),
      h('button', { class: 'icon-btn sm', title: 'Đọc lại', html: svg('refresh', 15), onclick: () => { U.usage = null; load(true); } }),
      h('div', { class: 'spacer' }),
      h('span', { class: 'skp-scope', title: 'Skill của dự án lấy theo thư mục của phiên đang mở' }, 'Dự án: ', h('code', { text: U.cwd || '(chưa mở phiên)' })),
      h('button', { class: 'icon-btn', title: 'Đóng (Esc)', html: svg('x', 16), onclick: closePage })));
    U.listEl = h('div', { class: 'skp-items' });
    const search = h('input', { type: 'text', class: 'text-input', placeholder: 'Tìm theo tên / mô tả…', value: U.q, spellcheck: false });
    search.oninput = () => { U.q = search.value.toLowerCase(); renderList(); };
    U.mainEl = h('div', { class: 'skp-main' });
    pg.append(h('div', { class: 'skp-body' }, h('div', { class: 'skp-list' }, h('div', { class: 'skp-search' }, search), U.listEl), U.mainEl));
    renderList();
    if (U.edit) editorView(U.edit); else view();
  }
  function groups() {
    const out = [];
    const add = (id, label, path, items) => { if (items.length) out.push({ id, label, path, items }); };
    const I = U.q ? U.items.filter((x) => (x.name + ' ' + x.desc).toLowerCase().includes(U.q)) : U.items;
    for (const r of (U.info && U.info.projRoots) || []) add('p:' + r, 'Dự án', r.replace(/[\\/]\.claude$/, ''), I.filter((x) => x.src === 'proj' && x.group === r));
    add('me', 'Cá nhân (mọi dự án)', U.info ? U.info.home : '', I.filter((x) => x.src === 'me'));
    add('gui', 'Bộ skill Claude GUI', U.info && !U.info.guiOn ? 'đang tắt trong Cài đặt' : '', I.filter((x) => x.src === 'gui'));
    const plugs = [...new Set(I.filter((x) => x.src === 'plug').map((x) => x.group))];
    for (const p of plugs) add('pl:' + p, 'Plugin · ' + p, '', I.filter((x) => x.src === 'plug' && x.group === p));
    add('sy', 'Đồng bộ từ tài khoản Claude', 'anthropic-skills', I.filter((x) => x.src === 'synced'));
    return out;
  }
  function renderList() {
    const box = U.listEl;
    if (!box) return;
    box.innerHTML = '';
    const G = groups();
    if (!G.length) box.append(h('div', { class: 'skp-empty', text: U.q ? 'Không có skill nào khớp.' : 'Chưa có skill nào.' }));
    for (const g of G) {
      box.append(h('div', { class: 'skp-grp', title: g.path || '' }, h('span', { text: `${g.label} · ${g.items.length}` }), g.path ? h('span', { class: 'skp-path', text: g.path }) : null));
      for (const it of g.items) {
        const n = usedOf(it);
        const el = h('div', { class: 'skp-it' + (key(it) === U.sel && !U.edit ? ' on' : '') },
          h('div', { class: 'n' }, h('span', { class: 'ellipsis', text: it.kind === 'command' ? '/' + it.name : it.name }),
            it.kind === 'command' ? h('span', { class: 'skp-tag cmd', text: 'lệnh' }) : null,
            weak(it) ? h('span', { class: 'skp-tag weak', text: 'mô tả yếu', title: 'Mô tả quá ngắn — Claude khó biết khi nào nên dùng' }) : null,
            n ? h('span', { class: 'skp-used', text: n + '×', title: `Dùng ${n} lần trong 7 ngày qua` }) : null),
          h('div', { class: 'd', text: it.desc || '(chưa có mô tả)' }));
        el.onclick = () => { U.sel = key(it); U.edit = null; renderList(); view(); };
        box.append(el);
      }
    }
  }
  const selItem = () => U.items.find((x) => key(x) === U.sel);

  // ---------- xem một skill ----------
  async function view() {
    const m = U.mainEl;
    if (!m) return;
    const it = selItem();
    m.innerHTML = '';
    if (!it) { m.append(h('div', { class: 'skp-empty', text: 'Chọn một skill ở bên trái, hoặc bấm "Skill mới".' })); return; }
    const call = '/' + it.name;
    const n = usedOf(it);
    const acts = h('div', { class: 'skp-acts' },
      it.ro ? h('button', { class: 'btn sm', onclick: () => copyToMe(it) }, icon('copy', 13), 'Sao chép thành skill cá nhân để sửa')
        : h('button', { class: 'btn primary sm', onclick: () => editor(it) }, icon('pencil', 13), 'Sửa'),
      h('button', { class: 'btn sm', title: `Chèn ${call} vào ô chat của phiên đang mở`, onclick: () => useNow(it) }, icon('play', 13), 'Dùng trong phiên đang mở'),
      h('button', { class: 'btn sm', onclick: () => { closePage(); CG.viewer && CG.viewer.openFile(it.file); } }, icon('file', 13), 'Mở ở khung xem'),
      h('button', { class: 'btn sm', onclick: () => api.showItem(it.file) }, icon('folderOpen', 13), 'Thư mục'),
      it.ro ? null : h('button', { class: 'btn sm ghost skp-del', onclick: () => del(it) }, icon('trash', 13), 'Xoá'));
    m.append(
      h('h2', { class: 'skp-title' }, h('span', { text: it.kind === 'command' ? call : it.name }), h('span', { class: 'skp-tag ' + it.src, text: TAG[it.src] }), it.kind === 'command' ? h('span', { class: 'skp-tag cmd', text: 'lệnh /' }) : null),
      h('div', { class: 'skp-meta' },
        h('span', { class: 'skp-link', title: 'Hiện trong thư mục', onclick: () => api.showItem(it.file) }, icon('folder', 13), h('code', { text: it.file })),
        h('span', { text: n == null ? 'Đang đếm số lần dùng…' : n ? `Dùng ${n} lần / 7 ngày` : 'Chưa dùng trong 7 ngày' }),
        h('span', {}, 'Gọi tay: ', h('code', { text: call })),
        it.manual ? h('span', { class: 'skp-warn', text: 'Chỉ chạy khi gọi tay' }) : null),
      acts);
    if (it.ro) m.append(h('div', { class: 'skp-box skp-note' }, icon('lock', 14), h('span', { text: it.roWhy + '. Chỉ xem.' })));
    if (weak(it)) m.append(h('div', { class: 'skp-box skp-note warn' }, icon('alert', 14), h('span', {}, `Mô tả chỉ có ${words(it.desc)} từ — Claude dựa vào mô tả để tự quyết khi nào dùng skill. Nên ghi rõ "làm gì" + "Dùng khi …". `, h('a', { class: 'skp-a', text: 'Sửa mô tả', onclick: () => editor(it) }))));
    m.append(h('div', { class: 'skp-box' }, h('h4', { text: 'Mô tả · Claude đọc phần này để quyết định khi nào dùng' }), h('div', { class: 'skp-desc', text: it.desc || '(chưa có mô tả)' })));
    const filesBox = h('div', { class: 'skp-box' }, h('h4', { text: 'Tệp trong skill' }), h('div', { class: 'skp-files muted', text: 'Đang đọc…' }));
    const bodyBox = h('div', { class: 'skp-box' }, h('h4', { text: it.kind === 'command' ? 'Nội dung lệnh' : 'Nội dung SKILL.md' }), h('div', { class: 'muted', text: 'Đang đọc…' }));
    m.append(filesBox, bodyBox);
    const r = await api.skRead(it.file).catch((e) => ({ ok: false, error: e.message }));
    if (selItem() !== it || U.edit) return;
    if (!r.ok) { bodyBox.lastChild.textContent = 'Không đọc được: ' + r.error; return; }
    filesBox.lastChild.replaceWith(h('div', { class: 'skp-files' }, (r.files || []).map((f) => h('div', {}, icon(/\/…$/.test(f) ? 'folder' : 'file', 12), ' ' + f))));
    const body = r.text.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    bodyBox.lastChild.replaceWith(mdEl(body));
  }
  function useNow(it) {
    const c = S().active;
    if (!c) return toast('Chưa mở phiên nào.', true);
    closePage();
    const inp = $('#input');
    inp.value = `/${it.name} ` + inp.value.replace(/^\/\S+\s*/, '');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  }
  async function del(it) {
    const what = it.kind === 'command' ? `lệnh /${it.name}` : `skill "${it.name}" (cả thư mục ${it.dir})`;
    if (!(await confirmDialog('Xoá skill?', `Chuyển ${what} vào Thùng rác của Windows — khôi phục được từ đó.`, 'Xoá', true))) return;
    const r = await api.skDelete(it.file);
    if (!r.ok) return toast('Không xoá được: ' + r.error, true);
    toast('Đã chuyển vào Thùng rác.');
    load(false);
  }
  async function copyToMe(it) {
    const r = await api.skRead(it.file);
    if (!r.ok) return toast('Không đọc được: ' + r.error, true);
    editor(null, { text: r.text, name: it.base, scope: 'me', copyFrom: it.kind === 'skill' ? it.dir : '' });
  }

  // ---------- frontmatter ----------
  // bỏ ngoặc YAML: '…' ('' → ') · "…" (\" \\ \n)
  const unq = (v) => (v[0] === "'" ? v.slice(1, -1).replace(/''/g, "'") : v.slice(1, -1).replace(/\\(["\\n])/g, (_, c) => (c === 'n' ? '\n' : c)));
  function parse(t) {
    t = String(t || '').replace(/^﻿/, '');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
    const meta = [];
    if (m) {
      const lines = m[1].split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const r = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]);
        if (!r) { if (meta.length) meta[meta.length - 1].raw += '\n' + lines[i]; continue; }
        let v = r[2].trim(), raw = lines[i];
        if (/^[>|][-+]?$/.test(v)) {
          const buf = [];
          while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) { buf.push(lines[++i].trim()); raw += '\n' + lines[i]; }
          v = buf.join(v[0] === '>' ? ' ' : '\n').trim();
        } else if (/^(['"]).*\1$/.test(v)) v = unq(v);
        meta.push({ k: r[1], v, raw });
      }
    }
    return { meta, body: m ? t.slice(m[0].length) : t };
  }
  const yq = (v) => (/^[\s\-?:,[\]{}#&*!|>'"%@`]|: | #|^$|\n/.test(v) ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"' : v);
  function build(meta, set, body) {
    const out = [], done = new Set();
    for (const x of meta) {
      if (x.k in set) { if (set[x.k] !== '' && set[x.k] != null) out.push(`${x.k}: ${yq(String(set[x.k]))}`); done.add(x.k); } else out.push(x.raw);
    }
    for (const [k, v] of Object.entries(set)) if (!done.has(k) && v !== '' && v != null) out.push(`${k}: ${yq(String(v))}`);
    return (out.length ? '---\n' + out.join('\n') + '\n---\n\n' : '') + String(body || '').replace(/^\n+/, '');
  }

  // ---------- sửa / tạo mới ----------
  // it = skill đang sửa (null = tạo mới); pre = { text, name, scope, copyFrom } khi sao chép
  async function editor(it, pre) {
    let text = pre ? pre.text : '';
    if (it) { const r = await api.skRead(it.file); if (!r.ok) return toast('Không đọc được: ' + r.error, true); text = r.text; }
    if (!it && !pre) text = '';
    U.edit = { it, text, pre: pre || null };
    renderList();
    editorView(U.edit);
  }
  function editorView(E) {
    const m = U.mainEl;
    m.innerHTML = '';
    const it = E.it, isNew = !it;
    const P = parse(E.text);
    const get = (k) => (P.meta.find((x) => x.k === k) || {}).v || '';
    const hasProj = !!U.cwd;
    const nameIn = h('input', { type: 'text', class: 'text-input mono', value: it ? it.name : (E.pre && E.pre.name) || get('name'), spellcheck: false, placeholder: 'ten-skill' });
    if (!isNew) nameIn.disabled = true;
    const scope = (E.pre && E.pre.scope) || (hasProj ? 'proj' : 'me');
    const rProj = h('input', { type: 'radio', name: 'skp-w', checked: scope === 'proj', disabled: !hasProj });
    const rMe = h('input', { type: 'radio', name: 'skp-w', checked: scope === 'me' });
    const desc = h('textarea', { class: 'text-input', rows: 3, spellcheck: false, value: get('description') });
    desc.value = get('description');
    const cnt = h('span', { class: 'skp-cnt' });
    const upd = () => { const n = words(desc.value); cnt.textContent = n + ' từ' + (n < 12 ? ' · hơi ngắn' : ''); cnt.classList.toggle('warn', n < 12); };
    desc.oninput = () => { upd(); dirty = true; };
    upd();
    const manual = h('input', { type: 'checkbox', checked: String(get('disable-model-invocation')) === 'true' });
    const tools = h('input', { type: 'text', class: 'text-input mono', value: get('allowed-tools'), placeholder: 'để trống = không giới hạn · vd: Read, Grep, Bash(git *)', spellcheck: false });
    const body = h('textarea', { class: 'text-input mono skp-bodyin', rows: 16, spellcheck: false });
    body.value = P.body.replace(/^\n+/, '');
    let dirty = false;
    for (const x of [nameIn, tools, body]) x.addEventListener('input', () => { dirty = true; });
    const callHint = h('code', { text: '/' + (nameIn.value || 'ten-skill') });
    nameIn.addEventListener('input', () => { nameIn.value = nameIn.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); callHint.textContent = '/' + (nameIn.value || 'ten-skill'); });

    // nhờ Claude soạn (qua CLI)
    let ai = null;
    {
      const ask = h('input', { type: 'text', class: 'text-input', placeholder: isNew ? 'vd: mỗi khi tôi bảo "build client" thì build Unity cho Android rồi báo kích thước apk' : 'vd: thêm bước kiểm tra log trước khi báo xong', spellcheck: false });
      const go = h('button', { class: 'btn primary sm', text: 'Soạn' });
      const st = h('span', { class: 'muted skp-aist' });
      go.onclick = async () => {
        if (!ask.value.trim()) { ask.focus(); return; }
        go.disabled = true; st.textContent = 'Claude đang soạn… (Sonnet, qua CLI, thường 20–60 giây)';
        const cur = desc.value.trim() || body.value.trim() ? build(P.meta, { name: nameIn.value, description: desc.value.trim() }, body.value) : '';
        const r = await api.skDraft({ ask: ask.value.trim(), cwd: U.cwd, current: isNew && !E.pre ? (cur && body.value.trim() ? cur : '') : cur }).catch((e) => ({ ok: false, error: e.message }));
        go.disabled = false;
        if (!r.text) { st.textContent = ''; return toast('Không soạn được: ' + (r.error || ''), true); }
        const D = parse(r.text);
        const dv = (k) => (D.meta.find((x) => x.k === k) || {}).v || '';
        if (isNew && dv('name')) { nameIn.value = dv('name').toLowerCase().replace(/[^a-z0-9-]/g, '-'); callHint.textContent = '/' + nameIn.value; }
        if (dv('description')) desc.value = dv('description');
        body.value = D.body.replace(/^\n+/, '');
        upd(); dirty = true;
        st.textContent = r.ok ? 'Đã soạn xong — xem lại rồi bấm Lưu.' : 'Kết quả chưa đúng định dạng, kiểm tra lại trước khi lưu.';
      };
      ask.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) go.click(); };
      ai = h('div', { class: 'skp-ai' }, h('div', {}, icon('sparkles', 14), h('b', { text: isNew ? ' Nhờ Claude soạn giúp' : ' Nhờ Claude sửa giúp' }), h('span', { class: 'muted', text: ' — tả bằng một câu, Claude viết mô tả + nội dung; bạn duyệt rồi mới lưu' })), h('div', { class: 'skp-air' }, ask, go), st);
    }
    const save = h('button', { class: 'btn primary', text: 'Lưu' });
    save.onclick = async () => {
      const name = nameIn.value.trim();
      if (isNew && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) { toast('Tên chỉ gồm chữ thường, số, gạch ngang.', true); nameIn.focus(); return; }
      if (!desc.value.trim()) { toast('Cần có mô tả — Claude dựa vào nó để biết khi nào dùng skill.', true); desc.focus(); return; }
      const set = {};
      if (!it || it.kind === 'skill') set.name = isNew ? name : get('name') || it.base;
      Object.assign(set, { description: desc.value.trim().replace(/\s*\n\s*/g, ' '), 'disable-model-invocation': manual.checked ? 'true' : '', 'allowed-tools': tools.value.trim() });
      const meta = isNew && E.pre ? P.meta.filter((x) => x.k !== 'name') : P.meta;
      const text = build(meta, set, body.value.endsWith('\n') ? body.value : body.value + '\n');
      save.disabled = true;
      const r = await api.skSave(isNew ? { isNew: true, name, scope: rMe.checked ? 'me' : 'proj', cwd: U.cwd, text, copyFrom: E.pre && E.pre.copyFrom } : { file: it.file, text });
      save.disabled = false;
      if (!r.ok) return toast('Không lưu được: ' + r.error, true);
      toast(isNew ? `Đã tạo skill — phiên mở sau gọi được /${name}.` : 'Đã lưu.');
      dirty = false;
      U.edit = null;
      U.sel = r.file;
      load(true);
    };
    const cancel = h('button', { class: 'btn', text: 'Huỷ' });
    cancel.onclick = async () => { if (dirty && !(await confirmDialog('Bỏ thay đổi?', 'Những gì bạn vừa sửa chưa được lưu.', 'Bỏ', true))) return; U.edit = null; renderList(); view(); };
    m.append(
      h('h2', { class: 'skp-title', text: isNew ? (E.pre ? 'Sao chép thành skill cá nhân' : 'Skill mới') : 'Sửa · ' + (it.kind === 'command' ? '/' : '') + it.name }),
      h('div', { class: 'skp-meta' }, h('span', { text: isNew ? 'Lưu xong: các phiên mở sau gọi được ngay; phiên đang mở có thể cần mở lại mới nạp.' : it.file })),
      ai,
      h('div', { class: 'skp-box skp-ed' },
        h('label', { text: 'Tên' }), h('div', {}, nameIn, h('div', { class: 'skp-hint' }, 'chữ thường, số, gạch ngang — cũng là lệnh gọi tay ', callHint)),
        isNew ? h('label', { text: 'Lưu ở' }) : null,
        isNew ? h('div', { class: 'skp-radio' },
          h('label', {}, rProj, ' Dự án ', h('code', { text: hasProj ? U.cwd.replace(/[\\/]+$/, '') + '\\.claude\\skills' : '(chưa mở phiên)' }), h('span', { class: 'muted', text: ' — commit vào repo thì đồng đội cũng có' })),
          h('label', {}, rMe, ' Cá nhân ', h('code', { text: '~\\.claude\\skills' }), h('span', { class: 'muted', text: ' — mọi dự án, chỉ máy này' }))) : null,
        h('label', { text: 'Mô tả' }), h('div', {}, desc, h('div', { class: 'skp-hint row' }, h('span', { text: 'Ghi rõ skill làm gì + "Dùng khi …" (các câu người dùng hay nói). Claude chỉ thấy mô tả này khi quyết định có dùng skill hay không.' }), cnt)),
        h('label', { text: 'Tuỳ chọn' }), h('div', { class: 'skp-radio' }, h('label', {}, manual, ' Chỉ chạy khi tôi gọi ', h('code', { text: '/tên' }), ' (Claude không tự dùng)')),
        h('label', { text: 'Công cụ được dùng' }), h('div', {}, tools, h('div', { class: 'skp-hint', text: 'Các công cụ Claude được dùng mà không phải hỏi khi skill đang chạy (allowed-tools).' })),
        h('label', { text: 'Nội dung' }), h('div', {}, body, h('div', { class: 'skp-hint', text: 'Markdown: các bước làm, lệnh mẫu, lỗi hay gặp… Tệp phụ (script, tài liệu tham khảo) đặt cạnh SKILL.md trong thư mục skill.' }))),
      h('div', { class: 'skp-acts end' }, cancel, save));
    (isNew ? nameIn : desc).focus();
  }

  // ---------- thanh bên ----------
  function nav() {
    if ($('#nav-skills')) return;
    const after = $('#nav-sched') || $('#btn-new');
    if (!after) return;
    const b = h('button', { id: 'nav-skills', class: 'new-session nav-sched nav-skills', onclick: () => (U.open ? closePage() : openPage()) }, icon('book', 16), h('span', { text: 'Skill' }));
    after.after(b);
  }
  function init() {
    nav();
    setTimeout(nav, 1500); // #nav-sched tạo sau → đặt Skill ngay dưới nó
    setTimeout(() => { const s = $('#nav-sched'), k = $('#nav-skills'); if (s && k && s.nextElementSibling !== k) s.after(k); }, 1600);
    document.addEventListener('click', (e) => {
      if (!U.open) return;
      if (e.target.closest('#nav-sched, #btn-new') || (e.target.closest('#session-list') && !e.target.closest('#nav-skills'))) closePage();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && U.open && !document.querySelector('.popover, .modal-bg') && !U.edit) closePage();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300)); else setTimeout(init, 300);

  CG.skills = { open: openPage, close: closePage, get isOpen() { return U.open; }, _U: U };
})();
