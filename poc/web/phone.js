import { api } from './api.js';
import { MODES, KINDS, SPICE, isSpeech, ago, esc, BLOCK_COLOR } from './model.js';

const pinOf = (entryId) => (V?.pins ?? [])
  .find((p) => p.entryId === entryId && p.chapterId === V.currentChapter.id)?.mode ?? null;

// Anansi phone client — Anansi.dc.html, wired to the persistent engine.
const $ = (id) => document.getElementById(id);

let V = null, GEN = null, MANI = null, LIB = [], pending = null, mode = 'direct', busy = false;
let storyId = localStorage.getItem('anansi.story') || null;


// ---------------- feed ----------------
function block(p, isPending) {
  const mine = p.author === 'human';
  const cls = isPending ? ' pend' : '';
  const flags = (V.violations ?? []).filter((f) => f.passageId === p.id);
  const flagged = flags.length ? `<div style="margin-top:7px">${flags.map((f) => {
    const e = V.entries.find((x) => x.id === f.entryId);
    return `<button data-flag="${f.id}" style="display:block;width:100%;text-align:left;
      font:11px/1.45 var(--sans);color:#C97A6A;background:rgba(201,122,106,.08);
      border:1px solid rgba(201,122,106,.3);border-radius:9px;padding:7px 10px;margin-bottom:4px">
      ⚑ ${esc(e?.title ?? 'canon')}: ${esc(f.reason ?? '')}</button>`; }).join('')}</div>` : '';
  if (p.isBreak) return `<div class="rule"><i></i><span>${esc(p.body || 'Scene break')}</span><i></i></div>`;
  if (mine || p.speaker || isSpeech(p.body)) {
    const who = mine ? `You · ${esc(V.story.persona || 'you')}` : esc(p.speaker || V.story.title);
    return `<div class="turn${mine ? ' you' : ''}${cls}">
      <div class="who">${mine ? '' : '<span class="dot"></span>'}${who}</div>
      <div class="bub" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>${flagged}</div>`;
  }
  return `<div><div class="narr${cls}" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>${flagged}</div>`;
}
function drawFeed() {
  const f = $('feed');
  const atTip = f.scrollHeight - f.scrollTop - f.clientHeight < 120;
  f.innerHTML = V.passages.map((p) => block(p, false)).join('')
    + (pending ? block({ id: '_p', body: pending, author: 'model' }, true) : '')
    + (busy ? `<div class="rule"><i></i><span>Anansi is weaving</span><i></i></div>` : '');
  f.querySelectorAll('[data-flag]').forEach((b) => b.onclick = async () => {
    V = await api.dismissFlag(storyId, b.dataset.flag); drawFeed(); });
  f.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('blur', async () => {
    const body = el.innerText.trim(), p = V.passages.find((x) => x.id === el.dataset.edit);
    if (!p || body === p.body) return;
    V = await api.editPassage(storyId, p.id, body); refresh();
  }));
  // Only follow the tip if you were already at it. Fixing a typo in chapter two used to
  // throw you to the last line of the book, because every edit calls refresh().
  if (atTip) { f.scrollTop = f.scrollHeight; }
}
function drawModes() {
  $('modes').innerHTML = MODES.map(([v, l]) =>
    `<button class="mode" data-m="${v}" aria-pressed="${v === mode}">${l}</button>`).join('');
  $('modes').querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { mode = b.dataset.m; drawModes();
    $('input').placeholder = mode === 'cowrite' ? `Write as ${V.story.persona || 'yourself'}…`
      : mode === 'direct' ? 'What happens next…'
      : mode === 'newscene' ? 'Where the new scene opens…' : 'Steer, or leave blank…'; });
}
const payload = (regenerateOf) => ({ storyId, mode,
  directive: mode === 'cowrite' ? '' : $('input').value, regenerateOf });

async function refresh() {
  const r = await api.manifest(payload());
  MANI = r.manifest; MANI.exact = r.exact;
  $('title').textContent = V.story.title;
  const b = (V.branches ?? []).find((x) => x.active);
  $('chap').textContent = `Chapter ${V.currentChapter.index} · ${V.currentChapter.title}`
    + (b && !b.isPrimary ? ` · ⑂ ${b.name}` : '');
  drawFeed();
}
async function openStoryId(sid) {
  storyId = sid; localStorage.setItem('anansi.story', sid);
  V = await api.story(sid); GEN = V.gen;
  $('sheet').classList.remove('on'); drawModes(); await refresh();
}

// ---------------- boot ----------------
async function boot() {
  setInterval(() => $('clock').textContent =
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 1000);
  const d = await api.library(); LIB = d.stories; GEN = d.gen;
  if (!LIB.length) return openOnboarding();
  await openStoryId(LIB.find((s) => s.id === storyId) ? storyId : LIB[0].id);
}

// ---------------- composer ----------------
$('send').onclick = async () => {
  if (busy || !V) return;
  const text = $('input').value.trim();
  if (mode === 'cowrite' && text) {
    // Speak = Co-Write as your character. Your prose is committed as yours, then continued from.
    V = await api.write(storyId, { body: text, speaker: V.story.persona || null });
    $('input').value = ''; $('input').style.height = 'auto';
  }
  busy = true; $('send').disabled = true; drawFeed();
  const r = await api.generate(payload());
  busy = false; $('send').disabled = false;
  if (r.error) { pending = null; drawFeed();
    return sheet('The thread broke', `<div class="err">${esc(r.error)}</div>
      <button class="big" id="again">Try again</button>
      <button class="big ghost" onclick="document.getElementById('pclose').click()">Close</button>`,
      () => $('again').onclick = () => { $('sheet').classList.remove('on'); $('send').click(); });
  }
  MANI = r.manifest; pending = r.prose; $('acts').hidden = false;
  if (mode !== 'cowrite') $('input').value = '';
  drawFeed();
};
$('input').addEventListener('input', (e) => {
  e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; });
$('keep').onclick = async () => {
  V = await api.accept(storyId, { body: pending, directive: $('input').value || null });
  pending = null; $('acts').hidden = true; refresh(); };
$('discard').onclick = () => { pending = null; $('acts').hidden = true; drawFeed(); };
$('regen').onclick = () => { pending = null; $('acts').hidden = true; $('send').click(); };

// ---------------- sheets ----------------
function sheet(title, html, after) {
  $('pt').textContent = title; $('pb').innerHTML = html; $('sheet').classList.add('on'); after?.();
}
$('pclose').onclick = () => $('sheet').classList.remove('on');
$('sheet').onclick = (e) => { if (e.target === $('sheet')) $('sheet').classList.remove('on'); };
const go = (map) => $('pb').querySelectorAll('[data-go]').forEach((b) => b.onclick = () => map[b.dataset.go]());

// 1 MAIN MENU / 5 IN-CHAT MENU
$('menuBtn').onclick = () => {
  const fired = MANI ? MANI.blocks.filter((b) => b.state === 'included' && b.firedBy
    && !b.firedBy.includes('always_on')).length : 0;
  sheet(V.story.title, `
    <div class="eyebrow">Chapter ${V.currentChapter.index} · ${V.entries.length} entries · ${V.passages.length} passages</div>
    <div class="grp">Story</div>
    <button class="row" data-go="cast"><span class="g">◈</span><span class="l">Cast &amp; lorebook</span><span class="v">${V.entries.length}</span></button>
    <button class="row" data-go="story"><span class="g">✦</span><span class="l">Story settings</span></button>
    <button class="row" data-go="chapter"><span class="g">§</span><span class="l">Chapter</span><span class="v">${esc(V.currentChapter.title)}</span></button>
    <button class="row" data-go="branches"><span class="g">⑂</span><span class="l">Branches &amp; rewind</span><span class="v">${V.branches.length}</span></button>
    <div class="grp">The chapter</div>
    <button class="row" data-go="queue"><span class="g">⚖</span><span class="l">What the chapter added</span><span class="v">${V.proposals?.length ?? 0}</span></button>
    <div class="grp">Context</div>
    <button class="row" data-go="ctx"><span class="g">▤</span><span class="l">What the model can see</span><span class="v">${fired} fired</span></button>
    <div class="grp">Library</div>
    <button class="row" data-go="lib"><span class="g">▤</span><span class="l">My stories</span><span class="v">${LIB.length}</span></button>
    <button class="row" data-go="new"><span class="g">✎</span><span class="l">Create a story</span></button>
    <button class="row" data-go="search"><span class="g">⌕</span><span class="l">Search</span></button>
    <button class="row" data-go="import"><span class="g">⇩</span><span class="l">Import</span></button>`,
    () => go({ queue: openQueue, cast: openCast, story: openStory, chapter: openChapter, ctx: openContext,
      branches: openBranches, lib: openLibrary, new: openCreate, search: openSearch, import: openImport }));
};
$('setBtn').onclick = () => openSettings();

// 2 STORY SELECTOR / 13 EMPTY LIBRARY
async function openLibrary() {
  LIB = (await api.library()).stories;
  if (!LIB.length) return openOnboarding();
  sheet('My stories', LIB.map((s) => `
    <div class="ent" data-s="${s.id}">
      <div class="n">${esc(s.title)} ${s.id === storyId ? '<span class="pill on">open</span>' : ''}</div>
      <div class="k">${esc(s.genre || 'untitled genre')} · ${s.status.replace('_', ' ')}</div>
      <div class="d">${s.chapters} ch · ${s.passages} passages · ${s.entries} entries · ${ago(s.updated_at)}</div>
    </div>`).join('') + `<button class="big" id="nw">+ New story</button>`,
    () => { $('nw').onclick = openCreate;
      $('pb').querySelectorAll('[data-s]').forEach((c) => c.onclick = () => openStoryId(c.dataset.s)); });
}

// 12 ONBOARDING
function openOnboarding() {
  sheet('All stories were his once.', `
    <p class="note" style="font-size:13px">Anansi keeps what you pin. A fact set in chapter one still
    reaches the model in chapter fifty — not because it remembers, but because you told it to.</p>
    <div class="grp">Begin</div>
    <button class="row" data-go="new"><span class="g">✎</span><span class="l">Write my own</span></button>
    <button class="row" data-go="import"><span class="g">⇩</span><span class="l">I already have stories to import</span></button>`,
    () => go({ new: openCreate, import: openImport }));
}

// 6 CREATE A STORY  (+ 11 ORIGINAL PROMPT — the spark)
function openCreate(sparked) {
  sheet('New story', `
    <label>Start from an idea</label>
    <textarea id="idea" rows="2" placeholder="A lighthouse keeper starts receiving replies in her own handwriting."></textarea>
    <button class="big ghost" id="spark">Spark it</button>
    <p class="note" id="sparkout">Fills the fields below. Nothing is created until you accept.</p>
    <label>Title</label><input id="n-title" placeholder="Untitled" value="${esc(sparked?.story?.title ?? '')}">
    <label>Genre</label><input id="n-genre" placeholder="fantasy noir" value="${esc(sparked?.story?.genre ?? '')}">
    <label>Premise</label><textarea id="n-prem" placeholder="What is the situation, and what is at stake?">${esc(sparked?.story?.premise ?? '')}</textarea>
    <label>Setting</label><input id="n-set" value="${esc(sparked?.story?.setting ?? '')}">
    <label>Point of view</label><input id="n-pov" value="${esc(sparked?.story?.pov ?? 'third limited, past tense')}">
    <label>You are</label><input id="n-persona" placeholder="the character you speak as">
    <label>Voice of the weave</label><textarea id="n-style" placeholder="Paste a few hundred words of your own prose.">${esc(sparked?.story?.writingStyle ?? '')}</textarea>
    <label>Where this is going</label><textarea id="n-dir"></textarea>
    <label>Opening scene</label><textarea id="n-open" placeholder="Optional. The first passage."></textarea>
    ${sparked?.entries?.length ? `<div class="grp">Cast the spark proposes</div>
      ${sparked.entries.map((e) => `<div class="ent" style="cursor:default"><div class="n">${esc(e.title)}</div>
        <div class="d">${esc(e.body)}</div></div>`).join('')}` : ''}
    <button class="big" id="mk">Begin weaving</button>`,
    () => {
    $('spark').onclick = async () => {
      const idea = $('idea').value.trim(); if (!idea) return;
      $('spark').textContent = 'sparking…'; $('spark').disabled = true;
      const r = await api.spark(idea);
      if (r.error) { $('sparkout').textContent = r.error; $('spark').textContent = 'Spark it';
        $('spark').disabled = false; return; }
      openCreate(r); $('idea').value = idea;
    };
    $('mk').onclick = async () => {
      const made = await api.createStory({
        title: $('n-title').value || 'Untitled', genre: $('n-genre').value, premise: $('n-prem').value,
        setting: $('n-set').value, pov: $('n-pov').value, persona: $('n-persona').value,
        writingStyle: $('n-style').value, direction: $('n-dir').value, opening: $('n-open').value,
        spice: sparked?.story?.spice ?? 2, entries: sparked?.entries ?? [] });
      LIB = (await api.library()).stories; openStoryId(made.id); }; });
}

// 28 EXTRACTION QUEUE — nothing here is canon until you say so.
function openQueue() {
  const ps = V.proposals ?? [];
  const n = (k) => ps.filter((p) => p.kind === k).length;
  const ch = V.chapters.find((c) => c.id === ps[0]?.chapterId) ?? V.currentChapter;
  sheet(ps.length ? `What chapter ${ch.index} added` : 'What the chapter added', `
    ${ps.length ? `<p class="note">${n('new')} new · ${n('changed')} changed · ${n('conflict')} conflict
      · <b>nothing is canon yet</b></p>` : ''}
    ${ps.length ? ps.map((p) => `<div class="ent" style="cursor:default">
      <div class="n">${esc(p.title)}
        <span class="pill ${p.kind === 'conflict' ? '' : 'on'}"${p.kind === 'conflict'
          ? ' style="color:#C97A6A;border-color:rgba(201,122,106,.4)"' : ''}>${p.kind}</span></div>
      <div class="d">${esc(p.body)}</div>
      ${p.delta ? `<div class="k">${esc(p.delta)}</div>` : ''}
      <div style="display:flex;gap:7px;margin-top:9px">
        <button class="big" style="margin:0;flex:1" data-ok="${p.id}">Accept</button>
        <button class="big ghost" style="margin:0;flex:0 0 92px" data-no="${p.id}">Dismiss</button>
      </div></div>`).join('')
      : `<p class="note">Nothing waiting. Read a chapter to see what it added.</p>`}
    ${n('new') + n('changed') ? `<button class="big" id="all">Accept all but the conflict${n('conflict') > 1 ? 's' : ''}</button>` : ''}
    <div class="grp">Read a chapter</div>
    ${V.chapters.map((c) => `<button class="big ghost" data-rx="${c.id}">Chapter ${c.index} — ${esc(c.title)}</button>`).join('')}`,
    () => {
      $('pb').querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => {
        V = await api.decide({ storyId, id: b.dataset.ok, accept: true }); openQueue(); refresh(); });
      $('pb').querySelectorAll('[data-no]').forEach((b) => b.onclick = async () => {
        V = await api.decide({ storyId, id: b.dataset.no, accept: false }); openQueue(); refresh(); });
      if ($('all')) $('all').onclick = async () => {
        V = await api.decide({ storyId, accept: true,
          ids: ps.filter((p) => p.kind !== 'conflict').map((p) => p.id) }); openQueue(); refresh(); };
      $('pb').querySelectorAll('[data-rx]').forEach((b) => b.onclick = async () => {
        b.textContent = 'reading…'; b.disabled = true;
        const r = await api.extract(storyId, b.dataset.rx);
        if (r.error) { b.textContent = r.error; return; }
        V = await api.story(storyId); openQueue(); });
    });
}

// 7 LOREBOOK / 15 CAST
function openCast() {
  sheet('Lorebook', V.entries.map((e) => `
    <div class="ent" data-e="${e.id}">
      <div class="n">${esc(e.title)}
        <span class="pill ${e.activation === 'always_on' ? 'on' : ''}">${e.activation === 'always_on' ? 'always' : 'when mentioned'}</span>
        ${e.lastEditor === 'human' ? '<span class="pill on">yours</span>' : ''}
        ${pinOf(e.id) === 'force_in' ? '<span class="pill on">forced in</span>' : ''}
        ${pinOf(e.id) === 'force_out' ? '<span class="pill" style="color:#C97A6A;border-color:rgba(201,122,106,.4)">kept out</span>' : ''}</div>
      <div class="k">${e.entryType}${e.keys.length ? ' · ' + esc(e.keys.join(', ')) : ''}${
        e.states?.length ? ` · ${e.states.length} later state${e.states.length > 1 ? 's' : ''}` : ''}</div>
      <div class="d">${esc(e.body.slice(0, 110))}</div></div>`).join('')
    + `<button class="big ghost" id="addE">+ New entry</button>`,
    () => { $('addE').onclick = () => openEntry({ id: '', title: 'New entry',
        body: '[Name: attribute, attribute]', entryType: 'character', activation: 'always_on', keys: [] });
      $('pb').querySelectorAll('[data-e]').forEach((c) => c.onclick =
        () => openEntry(V.entries.find((x) => x.id === c.dataset.e))); });
}
// 8 EDIT LORE ENTRY
function openEntry(e) {
  let keys = [...e.keys];
  const draw = () => sheet(e.id ? 'Lore entry' : 'New entry', `
    <label>Name</label><input id="f-title" value="${esc(e.title)}">
    <label>Kind</label><select id="f-kind">${KINDS.map((k) => `<option ${k === e.entryType ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <label>Entry</label><textarea id="f-body">${esc(e.body)}</textarea>
    <label>Notes to yourself</label><textarea id="f-notes">${esc(e.notes ?? '')}</textarea>
    <p class="note">Never sent to the model. Spoilers, questions, things to decide later.</p>
    <label>When</label><select id="f-act">
      <option value="always_on" ${e.activation === 'always_on' ? 'selected' : ''}>Always in context</option>
      <option value="triggered" ${e.activation === 'triggered' ? 'selected' : ''}>When mentioned</option></select>
    <label>In chapter ${V.currentChapter.index}</label>
    <select id="f-pin">
      <option value="" ${!pinOf(e.id) ? 'selected' : ''}>Follow the rules above</option>
      <option value="force_in" ${pinOf(e.id) === 'force_in' ? 'selected' : ''}>Always include, this chapter</option>
      <option value="force_out" ${pinOf(e.id) === 'force_out' ? 'selected' : ''}>Keep out, this chapter</option>
    </select>
    <p class="note">This chapter only. Keeping something out is how a reveal stays sealed
    while the fact still exists in the ledger.</p>
    <label>Trigger threads</label>
    <div class="keys">${keys.map((k, i) => `<span class="key">${esc(k)}<button data-k="${i}">✕</button></span>`).join('')}
      <input id="f-key" placeholder="+ add" style="width:110px;padding:5px 11px;border-radius:999px"></div>
    <p class="note">A thread fires when its words appear in recent prose — or in what you just typed.</p>
    <button class="big" id="save">Save</button>
    ${e.id ? `<button class="big ghost" id="tl">Canon over time${
      e.states?.length ? ` · ${e.states.length}` : ''}</button>` : ''}
    ${e.id ? '<button class="big ghost" id="eh">History</button>' : ''}
    ${e.id ? '<button class="big ghost danger" id="del">Delete entry</button>' : ''}`, () => {
    if ($('tl')) $('tl').onclick = () => openTimeline(e);
    if ($('eh')) $('eh').onclick = () => openEntryHistory(e);
    $('pb').querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { keys.splice(+b.dataset.k, 1); draw(); });
    $('f-key').onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.value.trim()) { keys.push(ev.target.value.trim()); draw(); } };
    $('save').onclick = async () => { V = await api.saveEntry(storyId, {
      id: e.id, title: $('f-title').value, body: $('f-body').value, notes: $('f-notes').value,
      entryType: $('f-kind').value, activation: $('f-act').value, keys }); openCast(); refresh(); };
    if ($('del')) $('del').onclick = async () => {
      V = await api.delEntry(storyId, e.id); openCast(); refresh(); };
  });
  draw();
}
// Every change to a ledger entry, per field, with a way back.
async function openEntryHistory(e) {
  const { entry } = await api.history({ story: storyId, entry: e.id });
  const now = { title: e.title, body: e.body, keys: JSON.stringify(e.keys) };
  sheet(`${e.title} — history`, `
    ${['title', 'body', 'keys'].map((f) => `
      <div class="grp">${f}</div>
      <div class="ent" style="cursor:default"><div class="k">now</div>
        <div class="d">${esc(now[f])}</div></div>
      ${entry.filter((r) => r.field === f).map((r) => `
        <div class="ent" data-r="${r.id}">
          <div class="k">${new Date(r.replaced_at).toLocaleString()} · by ${esc(r.replaced_by ?? '?')}</div>
          <div class="d">${esc(r.previous_value ?? '')}</div>
          <div class="k" style="color:var(--gold)">Restore this</div></div>`).join('')
        || '<p class="note">No earlier versions of this field.</p>'}`).join('')}
    <button class="big ghost" id="bk">← Entry</button>`, () => {
    $('bk').onclick = () => openEntry(V.entries.find((x) => x.id === e.id) ?? e);
    $('pb').querySelectorAll('[data-r]').forEach((b) => b.onclick = async () => {
      V = await api.revertField({ storyId, entryId: e.id, revisionId: b.dataset.r });
      openEntryHistory(V.entries.find((x) => x.id === e.id)); refresh(); });
  });
}

// 27 PROGRESSION — canon over time
function openTimeline(e) {
  const states = [...(e.states ?? [])].sort((a, b) => a.fromChapter - b.fromChapter);
  const here = V.currentChapter.index;
  const span = (s, i) => states[i + 1]
    ? (s.fromChapter === states[i + 1].fromChapter - 1 ? `Ch. ${s.fromChapter}`
       : `Ch. ${s.fromChapter} — ${states[i + 1].fromChapter - 1}`)
    : `Ch. ${s.fromChapter}+`;
  const stateOf = (s, i) => here < s.fromChapter
    ? (s.beforeMode === 'hint' ? 'Hinted' : 'Sealed')
    : (!states[i + 1] || here < states[i + 1].fromChapter ? 'In force' : 'Superseded');
  sheet(e.title, `
    <p class="note">Writing before a state opens cannot see it. That is what stops chapter 3
    leaking chapter 7.</p>
    <div class="ent" style="cursor:default"><div class="n">Base
      <span class="pill ${states.length && here >= states[0].fromChapter ? '' : 'on'}">${
        states.length && here >= states[0].fromChapter ? 'Superseded' : 'In force'}</span></div>
      <div class="d">${esc(e.body)}</div></div>
    ${states.map((s, i) => `<div class="ent" style="cursor:default">
      <div class="n">${span(s, i)}
        <span class="pill ${stateOf(s, i) === 'In force' ? 'on' : ''}">${stateOf(s, i)}</span>
        ${s.beforeMode === 'hint' ? '<span class="pill">hint before</span>' : ''}</div>
      <div class="d">${esc(s.body)}</div>
      ${s.label ? `<div class="k">hint: ${esc(s.label)}</div>` : ''}
      <div style="display:flex;gap:7px;margin-top:9px">
        <button class="big ghost" style="margin:0;flex:1" data-ed="${s.id}">Edit</button>
        <button class="big ghost" style="margin:0;flex:0 0 88px" data-rm="${s.id}">Remove</button>
      </div></div>`).join('')}
    <button class="big" id="add">Add a later state</button>
    <button class="big ghost" id="bk">← Entry</button>`, () => {
    $('bk').onclick = () => openEntry(V.entries.find((x) => x.id === e.id) ?? e);
    $('add').onclick = () => editState(e, {});
    $('pb').querySelectorAll('[data-ed]').forEach((b) => b.onclick =
      () => editState(e, states.find((s) => s.id === b.dataset.ed)));
    $('pb').querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      V = await api.delState(storyId, b.dataset.rm);
      openTimeline(V.entries.find((x) => x.id === e.id)); refresh(); });
  });
}

function editState(e, st) {
  sheet(st.id ? 'Later state' : 'Add a later state', `
    <label>Opens at chapter</label>
    <input id="st-c" type="number" min="1" value="${st.fromChapter ?? V.currentChapter.index}">
    <label>What is true from then on</label><textarea id="st-b">${esc(st.body ?? '')}</textarea>
    <label>Before it opens</label><select id="st-m">
      <option value="hide" ${st.beforeMode !== 'hint' ? 'selected' : ''}>Hide entirely</option>
      <option value="hint" ${st.beforeMode === 'hint' ? 'selected' : ''}>Hint only</option></select>
    <label>The hint</label><input id="st-l" value="${esc(st.label ?? '')}"
      placeholder="something here is not yet known">
    <p class="note">A hint says something exists without saying what. It never discloses the
    state itself.</p>
    <button class="big" id="sv">Save</button>
    <button class="big ghost" id="bk">← Timeline</button>`, () => {
    $('bk').onclick = () => openTimeline(V.entries.find((x) => x.id === e.id) ?? e);
    $('sv').onclick = async () => {
      V = await api.saveState(storyId, e.id, { id: st.id, fromChapter: +$('st-c').value,
        body: $('st-b').value, beforeMode: $('st-m').value, label: $('st-l').value });
      openTimeline(V.entries.find((x) => x.id === e.id)); refresh(); };
  });
}

// 9 EDIT STORY
function openStory() {
  const st = V.story;
  sheet('Story settings', `
    <label>Title</label><input id="s-title" value="${esc(st.title)}">
    <label>Genre</label><input id="s-genre" value="${esc(st.genre)}">
    <label>Premise</label><textarea id="s-prem">${esc(st.premise)}</textarea>
    <label>Setting</label><input id="s-set" value="${esc(st.setting)}">
    <label>Point of view</label><input id="s-pov" value="${esc(st.pov)}">
    <label>You are</label><input id="s-persona" value="${esc(st.persona ?? '')}" placeholder="the character you speak as">
    <label>Voice of the weave</label><textarea id="s-style">${esc(st.writingStyle)}</textarea>
    <p class="note">Paste a few hundred words of your own prose. A sample beats a description of one.</p>
    <label>Where this is going</label><textarea id="s-dir">${esc(st.direction ?? '')}</textarea>
    <p class="note">Aims the story without disclosing it. Never restated to the reader.</p>
    <label>Register</label><select id="s-spice">${[1,2,3,4,5].map((n) => `<option value="${n}" ${n === st.spice ? 'selected' : ''}>${n} — ${
      ['no sexual content','sensual, fades at the door','on the page, restrained','direct and explicit','fully explicit'][n-1]}</option>`).join('')}</select>
    <label>Status</label><select id="s-status">${['in_progress','finished','draft'].map((v) =>
      `<option value="${v}" ${v === st.status ? 'selected' : ''}>${v.replace('_',' ')}</option>`).join('')}</select>
    <button class="big" id="ssave">Save</button>
    <button class="big ghost danger" id="sdel">Delete story</button>`, () => {
    $('ssave').onclick = async () => {
      V = await api.saveStory(storyId, { ...st,
        title: $('s-title').value, genre: $('s-genre').value, premise: $('s-prem').value,
        setting: $('s-set').value, pov: $('s-pov').value, persona: $('s-persona').value,
        writingStyle: $('s-style').value, direction: $('s-dir').value,
        spice: +$('s-spice').value, status: $('s-status').value });
      $('sheet').classList.remove('on'); refresh(); };
    $('sdel').onclick = async () => {
      if (!confirm(`Delete "${st.title}" and everything in it?`)) return;
      await api.deleteStory(storyId);
      localStorage.removeItem('anansi.story'); storyId = null; boot(); };
  });
}
// 17 CHAPTER BREAK
function openChapter() {
  const c = V.currentChapter;
  sheet(`Chapter ${c.index}`, `
    <label>Title</label><input id="c-title" value="${esc(c.title)}">
    <label>This chapter must end with</label><textarea id="c-beat">${esc(c.authorsNote ?? '')}</textarea>
    <p class="note">Rides the style directive near the end of the prompt, where instructions land hardest.</p>
    <button class="big" id="csave">Save</button>
    <div class="grp">End this chapter</div>
    <label>Break note (optional)</label><input id="c-note" placeholder="Three weeks later">
    <label>Next chapter title</label><input id="c-next" placeholder="Chapter ${c.index + 1}">
    <button class="big ghost" id="cend">End chapter ${c.index}, begin ${c.index + 1}</button>`, () => {
    $('csave').onclick = async () => {
      V = await api.saveChapter(storyId, c.id, { title: $('c-title').value, authorsNote: $('c-beat').value });
      $('sheet').classList.remove('on'); refresh(); };
    $('cend').onclick = async () => {
      V = await api.endChapter(storyId, { note: $('c-note').value, nextTitle: $('c-next').value });
      $('sheet').classList.remove('on'); refresh(); };
  });
}
// 14 BRANCHES
function openBranches() {
  sheet('Branches', (V.branches ?? []).map((b) => `
    <div class="ent" style="cursor:default">
      <div class="n">${esc(b.name)}
        ${b.isPrimary ? '<span class="pill">first path</span>' : ''}
        ${b.active ? '<span class="pill on">writing here</span>' : ''}</div>
      <div class="k">${b.forkOrdinal ? `forked after passage ${b.forkOrdinal}` : 'the trunk'}</div>
      <div style="display:flex;gap:7px;margin-top:9px">
        ${b.active ? '' : `<button class="big ghost" style="margin:0;flex:1" data-go="${b.id}">Write here</button>`}
        ${b.isPrimary ? '' : `<button class="big ghost" style="margin:0;flex:0 0 88px" data-rm="${b.id}">Discard</button>`}
      </div></div>`).join('')
    + `<button class="big" id="forkNow">Fork from the last passage</button>
       <p class="note">A fork copies the prose up to that point. The ledger is shared, because a
       fact is true on every path.</p>`, () => {
    $('pb').querySelectorAll('[data-go]').forEach((b) => b.onclick = async () => {
      V = await api.switchBranch(storyId, b.dataset.go); refresh(); openBranches(); });
    $('pb').querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      V = await api.delBranch(storyId, b.dataset.rm); refresh(); openBranches(); });
    $('forkNow').onclick = async () => {
      const last = V.passages.at(-1); if (!last) return;
      V = await api.fork(storyId, last.id, 'another way'); refresh(); openBranches(); };
  });
}

// 18 SEARCH
function openSearch() {
  sheet('Search', `<input id="q" placeholder="Search your prose" autofocus><div id="hits"></div>`, () => {
    let t; $('q').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      const term = $('q').value.trim();
      if (term.length < 2) return $('hits').innerHTML = '';
      const { results } = await api.search(term);
      $('hits').innerHTML = results.length ? results.map((r) => {
        const i = r.body.toLowerCase().indexOf(term.toLowerCase());
        const s = esc(r.body.slice(Math.max(0, i - 40), i + 90));
        return `<div class="ent" data-j="${r.story_id}"><div class="k">${esc(r.story)} · ch ${r.chapter}</div>
          <div class="d">…${s}…</div></div>`; }).join('')
        : `<p class="note">Nothing found.</p>`;
      $('hits').querySelectorAll('[data-j]').forEach((c) => c.onclick = () => openStoryId(c.dataset.j));
    }, 220); };
  });
}
// 20 IMPORT
function openImport() {
  sheet('Import', `
    <p class="note">Paste a SillyTavern character card or lorebook (JSON), or plain prose to bring a
    manuscript in as passages.</p>
    <label>Paste</label><textarea id="im" style="min-height:150px"></textarea>
    <button class="big" id="imgo">Import</button><div id="imout"></div>`, () => {
    $('imgo').onclick = async () => {
      const raw = $('im').value.trim(); if (!raw) return;
      let n = 0;
      try {
        const j = JSON.parse(raw);
        const data = j.data ?? j;
        if (data.name) { await api.saveEntry(storyId, { id: '', title: data.name,
          body: `[${data.name}: ${(data.description ?? '').slice(0, 400)}]`, entryType: 'character',
          activation: 'always_on', keys: [data.name] }); n++; }
        for (const e of data.character_book?.entries ?? data.entries ?? []) {
          await api.saveEntry(storyId, { id: '', title: e.name ?? e.comment ?? 'entry',
            body: e.content ?? '', entryType: 'lore', activation: e.constant ? 'always_on' : 'triggered',
            keys: e.keys ?? e.key ?? [] }); n++; }
        $('imout').innerHTML = `<p class="note">Imported ${n} entr${n === 1 ? 'y' : 'ies'}.</p>`;
      } catch {
        for (const para of raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
          await api.write(storyId, { body: para }); n++; }
        $('imout').innerHTML = `<p class="note">Imported ${n} passages.</p>`;
      }
      V = await api(`/api/story?story=${storyId}`); refresh();
    };
  });
}
// 19 CONNECTIONS + 16 SETTINGS
function openSettings() {
  sheet('Settings', `
    <div class="grp">Weaving</div>
    <label>Thinking</label><select id="g-think">
      <option value="0" ${!GEN.thinking ? 'selected' : ''}>Off — straight to prose</option>
      <option value="1" ${GEN.thinking ? 'selected' : ''}>On — reasons first</option></select>
    <p class="note">Measured: with thinking on, this model spent its whole budget reasoning and
    returned no prose on three runs of four. Off is 2.5× faster.</p>
    <label>Temperature <span class="v" id="tv">${GEN.temperature}</span></label>
    <input type="range" id="g-temp" min="0" max="1.4" step="0.05" value="${GEN.temperature}">
    <label>Top-p</label><input id="g-topp" type="number" step="0.01" value="${GEN.top_p}">
    <label>Min-p</label><input id="g-minp" type="number" step="0.01" value="${GEN.min_p}">
    <label>DRY repetition penalty</label><input id="g-dry" type="number" step="0.1" value="${GEN.dry_multiplier}">
    <label>Reply length (tokens)</label><input id="g-max" type="number" step="50" value="${GEN.max_tokens}">
    <div class="grp">Connection</div>
    <div class="row" style="cursor:default"><span class="g">◈</span><span class="l" id="cx">…</span></div>
    <label>Context budget for this story</label>
    <input id="g-ctx" type="number" step="512" value="${V?.story.maxContext ?? ''}" placeholder="max for this slot">
    <button class="big" id="gsave">Save</button>`, () => {
    $('g-temp').oninput = (e) => $('tv').textContent = e.target.value;
    api.library().then((d) => $('cx').textContent =
      `${d.model} · ${d.slot.global} / ${d.slot.slots} slots = ${d.slot.perSlot} per slot`);
    $('gsave').onclick = async () => {
      GEN = (await api.settings(storyId, { thinking: $('g-think').value === '1',
        temperature: +$('g-temp').value, top_p: +$('g-topp').value, min_p: +$('g-minp').value,
        dry_multiplier: +$('g-dry').value, max_tokens: +$('g-max').value })).gen;
      const mc = parseInt($('g-ctx').value, 10);
      if (V) V = await api('/api/story', 'POST', { id: storyId,
        story: { ...V.story, maxContext: Number.isFinite(mc) ? mc : null } });
      $('sheet').classList.remove('on'); refresh(); };
  });
}
// the screen the canvas does not have
function openContext() {
  const m = MANI; if (!m) return;
  const C = BLOCK_COLOR;
  const agg = {}; m.blocks.filter((b) => b.state === 'included')
    .forEach((b) => agg[b.kind] = (agg[b.kind] ?? 0) + b.tokens);
  sheet('What the model can see', `
    <div class="meter">${Object.entries(agg).map(([k, v]) =>
      `<i style="width:${(v / m.totals.budget * 100).toFixed(2)}%;background:${C[k] ?? '#555'}"></i>`).join('')}</div>
    <div class="eyebrow">${m.totals.used} of ${m.totals.budget} tokens${m.exact ? ` · ${m.exact} exact` : ''}</div>
    ${m.overflowed ? `<div class="err">${esc(m.overflowReason)}</div>` : ''}
    ${m.blocks.map((b) => `<div class="row" style="cursor:default;opacity:${b.state === 'included' ? 1 : .4}">
      <span class="g" style="color:${C[b.kind] ?? '#555'}">●</span>
      <span class="l">${b.kind.toLowerCase().replace('canon-','')} · ${esc(b.id)}
        ${b.firedBy && !b.firedBy.includes('always_on') ? `<span style="color:var(--gold)"> ← ${esc(b.firedBy.join(', '))}</span>` : ''}
        ${b.state !== 'included' ? `<span class="err"> ${esc(b.reason)}</span>` : ''}</span>
      <span class="v">${b.tokens}</span></div>`).join('')}
    <p class="note">Nothing here was written by the model. Every line is a fact you pinned or a
    keyword that fired, and the number is what it cost.</p>`);
}
boot();
