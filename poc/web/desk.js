// Desktop surface — D1..D15 from the canvas. Rail, centred 720 reading column,
// hover actions per passage, inspector as a right panel. Shares api.js / model.js.
import { api } from './api.js';
import { MODES, KINDS, SPICE, STORY_FIELDS, isSpeech, ago, esc, BLOCK_COLOR } from './model.js';

const pinOf = (entryId) => (V?.pins ?? [])
  .find((p) => p.entryId === entryId && p.chapterId === V.currentChapter.id)?.mode ?? null;

const $ = (id) => document.getElementById(id);
let V = null, GEN = null, MANI = null, LIB = [], pending = null, over = null;
let mode = 'direct', busy = false, panel = null;
let storyId = localStorage.getItem('anansi.story') || null;
let focusChapter = null;   // the chapter you are working in; null means the tip

const NAV = [
  ['stories', '❋', 'My stories'], ['create', '✎', 'Create a story'],
  ['cast',    '☙', 'Characters'], ['canon',  '◈', 'Worlds & lorebooks'],
  ['import',  '↧', 'Import'],     ['search', '⌕', 'Search'],
  ['story',   '⚙', 'Story & chapter'], ['traj', '→', 'Trajectory'],
  ['queue',   '⚖', 'What the chapter added'],
  ['branches','⑂', 'Branches'],
  ['prefs',   '◐', 'Preferences'],
];

// ---------- prose ----------
function blockHTML(p, isPending) {
  const mine = p.author === 'human';
  const flags = (V.violations ?? []).filter((f) => f.passageId === p.id);
  if (p.isBreak) return `<div class="brk"><i></i><span>${esc(p.body || 'scene break')}</span><i></i></div>`;
  const tools = isPending ? '' : actionsHTML(p);
  const inner = mine || p.speaker || isSpeech(p.body)
    ? `<div class="turn${mine ? ' you' : ''}">
         <div class="who">${mine ? '' : '<span class="dot"></span>'}${
           mine ? `You · ${esc(V.story.persona || 'you')}` : esc(p.speaker || V.story.title)}</div>
         <div class="bub" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>${tools}</div>`
    : `<div style="position:relative"><div class="narr" contenteditable="plaintext-only"
         data-edit="${p.id}">${esc(p.body)}</div>${tools}</div>`;
  const flagged = flags.length ? `<div class="flagrow">${flags.map((f) => {
    const e = V.entries.find((x) => x.id === f.entryId);
    return `<button class="flag" data-flag="${f.id}" title="dismiss">⚑ ${
      esc(e?.title ?? 'canon')}: ${esc(f.reason ?? '')}</button>`; }).join('')}</div>` : '';
  return `<div class="blk${isPending ? ' pend' : ''}">${inner}${flagged}</div>`;
}

function actionsHTML(p) {
  const v = p.variants ?? [];
  const at = v.findIndex((x) => x.selected) + 1;
  return `<div class="acts">
    ${v.length > 1 ? `<span class="vstep"><button data-vp="${p.id}">‹</button>${at}/${v.length}<button data-vn="${p.id}">›</button></span>` : ''}
    <button data-re="${p.id}"><span class="g">↻</span>Regenerate</button>
    <button data-ed="${p.id}"><span class="g">✎</span>Edit text</button>
    <button data-br="${p.id}"><span class="g">⑂</span>Branch from here</button>
    <button data-hi="${p.id}"><span class="g">↺</span>History</button>
    <button class="del" data-del="${p.id}">Delete</button></div>`;
}

function drawDoc() {
  const sc = $('scroll');
  const atTip = !sc || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120;
  // Chapter headings, so the manuscript reads as a document and the rail has somewhere to
  // scroll to. Without them the column was a flat list of passages with no visible structure.
  const words = (t) => (String(t).match(/\S+/g) || []).length;
  const byCh = new Map(V.chapters.map((c) => [c.id, []]));
  for (const p of V.passages) (byCh.get(p.chapterId) ?? []).push(p);
  const html = V.chapters.map((c) => {
    const ps = byCh.get(c.id) ?? [];
    const w = words(ps.map((p) => p.body).join(' '));
    return `<div class="chead" id="ch-${c.id}"><span>${esc(c.title)}</span><i></i>
        <span class="cw">${w.toLocaleString()} words${c.status === 'closed' ? ' · closed' : ''}${
          c.summaryStale ? ' · summary stale' : ''}</span></div>`
      + (ps.length ? ps.map((p) => blockHTML(p, false)).join('')
                   : `<p class="hint">Nothing written here yet.</p>`);
  }).join('');
  $('col').innerHTML = html
    + (pending ? blockHTML({ id: '_p', body: pending, author: 'model' }, true) : '')
    + (busy ? `<div class="telling"><i></i><span>Anansi is telling it</span><i></i></div>` : '');
  $('wc').textContent = `${words(V.passages.map((p) => p.body).join(' ')).toLocaleString()} words`;
  const c = $('col');
  c.querySelectorAll('[data-edit]').forEach((n) => n.addEventListener('blur', async () => {
    const body = n.innerText.trim(), p = V.passages.find((x) => x.id === n.dataset.edit);
    if (!p || body === p.body) return; V = await api.editPassage(storyId, p.id, body); refresh();
  }));
  c.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () =>
    c.querySelector(`[data-edit="${b.dataset.ed}"]`)?.focus());
  c.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    V = await api.delPassage(storyId, b.dataset.del); refresh(); });
  c.querySelectorAll('[data-re]').forEach((b) => b.onclick = () => { pending = null; run(b.dataset.re); });
  c.querySelectorAll('[data-hi]').forEach((b) => b.onclick = () => history_(b.dataset.hi));
  c.querySelectorAll('[data-br]').forEach((b) => b.onclick = () => forkHere(b.dataset.br));
  const step = async (id, d) => {
    const p = V.passages.find((x) => x.id === id); if (!p) return;
    const i = p.variants.findIndex((x) => x.selected);
    V = await api.pickVariant(storyId, p.variants[(i + d + p.variants.length) % p.variants.length].id);
    refresh();
  };
  c.querySelectorAll('[data-flag]').forEach((b) => b.onclick = async () => {
    V = await api.dismissFlag(storyId, b.dataset.flag); drawDoc(); });
  c.querySelectorAll('[data-vp]').forEach((b) => b.onclick = () => step(b.dataset.vp, -1));
  c.querySelectorAll('[data-vn]').forEach((b) => b.onclick = () => step(b.dataset.vn, +1));
  // Only follow the tip if you were already at it. Fixing a typo in chapter two used to
  // throw you to the last line of the book, because every edit calls refresh().
  if (atTip) { $('scroll').scrollTop = $('scroll').scrollHeight; }
}

// ---------- rail ----------
function drawRail() {
  const open = V.proposals?.length ?? 0;
  $('nav').innerHTML = NAV.map(([k, g, l]) =>
    `<button class="nav ${panel === k ? 'on' : ''}" data-n="${k}"><span class="g">${g}</span>${l}${
      k === 'queue' && open ? `<span class="pill on" style="margin-left:auto">${open}</span>` : ''}</button>`).join('');
  $('nav').querySelectorAll('[data-n]').forEach((b) => b.onclick = () => PANELS[b.dataset.n]());
  $('chaps').innerHTML = V.chapters.map((c) => `<button class="chap ${
    c.id === V.currentChapter.id ? 'on' : ''}" data-c="${c.id}" id="ch-nav-${c.id}">${esc(c.title)}${
    c.id === V.currentChapter.id ? ' · current' : ''}${
    c.summaryStale ? ' <span style="color:var(--warn)">· stale</span>' : ''}</button>`).join('');
  // Clicking a chapter goes to it — sets it as the working chapter, scrolls the column to
  // it, and points every chapter-scoped panel at it. It used to open the CURRENT chapter's
  // settings regardless, so the only table of contents in the product led nowhere.
  $('chaps').querySelectorAll('[data-c]').forEach((b) => b.onclick = async () => {
    focusChapter = b.dataset.c === V.chapters.at(-1)?.id ? null : b.dataset.c;
    V = await api.story(storyId, focusChapter ?? undefined);
    await refresh();
    $(`ch-${b.dataset.c}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- composer ----------
function drawModes() {
  $('modes').innerHTML = MODES.map(([v, l]) =>
    `<button class="mode" data-m="${v}" aria-pressed="${v === mode}">${l}</button>`).join('');
  $('modes').querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    mode = b.dataset.m; drawModes(); });
  $('input').placeholder = MODES.find(([v]) => v === mode)[2](V?.story.persona);
}
const payload = (regenerateOf) => ({ storyId, mode, chapterId: focusChapter ?? undefined,
  directive: mode === 'cowrite' ? '' : $('input').value, regenerateOf });

async function run(overId) {
  if (busy) return;
  const text = $('input').value.trim();
  if (mode === 'cowrite' && text && !overId) {
    V = await api.write(storyId, { body: text, speaker: V.story.persona || null });
    $('input').value = ''; drawDoc();
  }
  busy = true; $('send').disabled = true; $('status').textContent = ''; drawDoc();
  const r = await api.generate(payload(overId));
  busy = false; $('send').disabled = false;
  if (r.error) {
    MANI = r.manifest; pending = null; drawDoc();
    $('status').innerHTML = '';
    $('col').insertAdjacentHTML('beforeend', `<div class="broke"><b>The thread broke</b>
      <button class="hbtn" id="try">Try again</button></div><p class="err">${esc(r.error)}</p>`);
    $('try').onclick = () => run(overId);
    return;
  }
  MANI = r.manifest; pending = r.prose; over = overId ?? null; $('after').hidden = false;
  $('status').textContent = `${r.seconds}s${r.reasoning ? ` · ${r.reasoning} chars reasoning` : ''}`;
  drawDoc(); paintContext();
}
$('send').onclick = () => run(null);
$('input').addEventListener('input', (e) => {
  e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 170) + 'px'; });
$('input').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(null); } });
$('keep').onclick = async () => {
  V = await api.accept(storyId, { body: pending, variantOf: over, directive: $('input').value || null });
  pending = null; over = null; $('after').hidden = true;
  if (mode !== 'cowrite') $('input').value = ''; refresh(); };
$('discard').onclick = () => { pending = null; over = null; $('after').hidden = true; drawDoc(); };
$('regen').onclick = () => { const o = over; pending = null; run(o); };

// ---------- side panel ----------
function open_(title, html, after) {
  $('st').textContent = title; $('sb').innerHTML = html;
  $('side').classList.add('on'); after?.(); drawRail();
}
$('sclose').onclick = () => { $('side').classList.remove('on'); panel = null; drawRail(); };
$('inspBtn').onclick = () => PANELS.inspector();
// It looked like a button and did nothing; now it opens the thing it describes.
$('ctxPct').onclick = () => PANELS.inspector();

const PANELS = {
  inspector() { panel = 'inspector'; paintContext(true); },
  stories: async () => { panel = 'stories';
    LIB = (await api.library()).stories;
    open_('My stories', LIB.map((s) => `<button class="card" data-s="${s.id}">
      <div class="n">${esc(s.title)} ${s.id === storyId ? '<span class="pill on">open</span>' : ''}</div>
      <div class="k">${esc(s.genre || '—')} · ${s.status.replace('_', ' ')}</div>
      <div class="d">${s.chapters} ch · ${s.passages} passages · ${s.entries} entries · ${ago(s.updated_at)}</div>
      </button>`).join(''), () => $('sb').querySelectorAll('[data-s]')
        .forEach((b) => b.onclick = () => load(b.dataset.s)));
  },
  // Adventure mode is DROPPED, not deferred (Seth, 2026-08-23). the-idea.md asked for it and
  // COUNCIL-02's novelist called it the mode they would click twice out of curiosity: three
  // options generated to a formula are the model's dramaturgy, not the writer's. No
  // passage_options table, no second call, nothing to build later.
  // ponytail: design screens D9 (chapter close), D10 (flags list), D14 (first run) are not
  // built as their own surfaces — chapter close lives inside Story & chapter, and flags are
  // inline on the passage rather than collected anywhere.
  create() { panel = 'create';
    let sparked = null;
    const form = () => `
      <label>Start from an idea</label>
      <textarea id="idea" placeholder="A lighthouse keeper starts receiving replies in her own handwriting."></textarea>
      <button class="btn ghost" id="spark">Spark it</button>
      <p class="hint" id="sparkout">Fills the fields below. Nothing is created until you accept,
      and every field stays yours to change.</p>
      ${STORY_FIELDS.map((f) => `<label>${f.label}</label>
        ${f.area ? `<textarea id="n-${f.k}">${esc(sparked?.story?.[f.k] ?? '')}</textarea>`
                 : `<input id="n-${f.k}" value="${esc(sparked?.story?.[f.k] ?? '')}">`}
        ${f.hint ? `<p class="hint">${f.hint}</p>` : ''}`).join('')}
      <label>Register</label><select id="n-spice">${SPICE.map((t, i) =>
        `<option value="${i + 1}" ${i + 1 === (sparked?.story?.spice ?? 2) ? 'selected' : ''}>${i + 1} — ${t}</option>`).join('')}</select>
      ${sparked?.entries?.length ? `<div class="grp">Cast the spark proposes</div>
        ${sparked.entries.map((e, i) => `<div class="card" style="cursor:default">
          <div class="n">${esc(e.title)}</div><div class="d">${esc(e.body)}</div>
          <button class="btn ghost" style="margin:6px 0 0" data-drop="${i}">Drop</button></div>`).join('')}` : ''}
      <label>Opening scene</label><textarea id="n-open"></textarea>
      <button class="btn" id="mk">Begin weaving</button>`;
    const bind = () => {
      $('spark').onclick = async () => {
        const idea = $('idea').value.trim();
        if (!idea) return;
        $('spark').textContent = 'sparking…'; $('spark').disabled = true;
        const r = await api.spark(idea);
        if (r.error) { $('sparkout').textContent = r.error; $('spark').textContent = 'Spark it';
          $('spark').disabled = false; return; }
        sparked = r; open_('The first thread', form(), () => { bind(); $('idea').value = idea; });
      };
      $('sb').querySelectorAll('[data-drop]').forEach((b) => b.onclick = () => {
        sparked.entries.splice(+b.dataset.drop, 1);
        const idea = $('idea').value; open_('The first thread', form(), () => { bind(); $('idea').value = idea; });
      });
      $('mk').onclick = async () => {
        const st = { opening: $('n-open').value, spice: +$('n-spice').value };
        for (const f of STORY_FIELDS) st[f.k] = $(`n-${f.k}`).value;
        // The spark's cast arrives as entries, not as canon it wrote behind your back.
        const made = await api.createStory({ ...st, title: st.title || 'Untitled',
          entries: sparked?.entries ?? [] });
        LIB = (await api.library()).stories; load(made.id);
      };
    };
    open_('The first thread', form(), bind);
  },
  cast()  { panel = 'cast';  ledger('character', 'Characters'); },
  canon() { panel = 'canon'; ledger(null, 'Worlds & lorebooks'); },
  story() { panel = 'story'; storyPanel(); },
  traj()  { panel = 'traj';  trajectory(); },
  prefs() { panel = 'prefs'; prefs(); },
  queue() { panel = 'queue'; queue(); },
  branches() { branches(); },
  search() { panel = 'search';
    open_('Search', `<input id="q" placeholder="Search your prose" autofocus><div id="hits"></div>`, () => {
      let t; $('q').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
        const term = $('q').value.trim(); if (term.length < 2) return $('hits').innerHTML = '';
        const { results } = await api.search(term);
        $('hits').innerHTML = results.length ? results.map((r) => {
          const i = r.body.toLowerCase().indexOf(term.toLowerCase());
          return `<button class="card" data-j="${r.story_id}"><div class="k">${esc(r.story)} · ch ${r.chapter}</div>
            <div class="d">…${esc(r.body.slice(Math.max(0, i - 50), i + 110))}…</div></button>`; }).join('')
          : `<p class="hint">Nothing found.</p>`;
        $('hits').querySelectorAll('[data-j]').forEach((b) => b.onclick = () => load(b.dataset.j));
      }, 220); }; });
  },
  import() { panel = 'import';
    open_('Import', `<p class="hint">Paste a SillyTavern character card or lorebook as JSON, or plain
      prose to bring a manuscript in as passages.</p>
      <label>Paste</label><textarea id="im" style="min-height:170px"></textarea>
      <button class="btn" id="go">Import</button><div id="out"></div>`, () => $('go').onclick = async () => {
      const raw = $('im').value.trim(); if (!raw) return; let n = 0;
      try {
        const d = JSON.parse(raw).data ?? JSON.parse(raw);
        if (d.name) { await api.saveEntry(storyId, { id: '', title: d.name,
          body: `[${d.name}: ${(d.description ?? '').slice(0, 400)}]`, entryType: 'character',
          activation: 'always_on', keys: [d.name] }); n++; }
        for (const e of d.character_book?.entries ?? d.entries ?? []) {
          await api.saveEntry(storyId, { id: '', title: e.name ?? e.comment ?? 'entry',
            body: e.content ?? '', entryType: 'lore',
            activation: e.constant ? 'always_on' : 'triggered', keys: e.keys ?? e.key ?? [] }); n++; }
        $('out').innerHTML = `<p class="hint">Imported ${n} entries.</p>`;
      } catch {
        for (const para of raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
          await api.write(storyId, { body: para }); n++; }
        $('out').innerHTML = `<p class="hint">Imported ${n} passages.</p>`;
      }
      V = await api.story(storyId); refresh(); });
  },
};

function paintContext(openPanel) {
  const m = MANI;
  if (m) {
    const pct = Math.round(m.totals.used / m.totals.budget * 100);
    $('ctxPct').textContent = `Context ${pct}%`;
  }
  if (!openPanel && panel !== 'inspector') return;
  if (!m) return open_('What Anansi knows', `<p class="hint">Type something to see what would be sent.</p>`);
  const agg = {}; m.blocks.filter((b) => b.state === 'included')
    .forEach((b) => agg[b.kind] = (agg[b.kind] ?? 0) + b.tokens);
  open_('What Anansi knows', `
    <div style="font-family:var(--serif);font-size:26px;color:var(--ink)">${m.totals.used.toLocaleString()}
      <span style="font-size:15px;color:var(--mute)"> / ${m.totals.budget.toLocaleString()}</span></div>
    <div class="bar">${Object.entries(agg).map(([k, v]) =>
      `<i style="width:${(v / m.totals.budget * 100).toFixed(2)}%;background:${BLOCK_COLOR[k] ?? '#555'}"></i>`).join('')}</div>
    ${Object.entries(agg).map(([k, v]) => `<div class="lrow"><span style="color:${BLOCK_COLOR[k]}">●</span>
      <span>${k.toLowerCase().replace('canon-', '')}</span>
      <span class="n">${Math.round(v / m.totals.budget * 100)}%</span></div>`).join('')}
    ${m.overflowed ? `<div class="err">${esc(m.overflowReason)}</div>` : ''}
    <div class="grp">Every fact, and why</div>
    ${m.blocks.map((b) => `<div class="lrow ${b.state === 'included' ? '' : 'off'}">
      <span>${esc(b.id)}</span>
      ${b.firedBy && !b.firedBy.includes('always_on') ? `<span class="why">← ${esc(b.firedBy.join(', '))}</span>` : ''}
      ${b.state !== 'included' ? `<span class="err">${esc(b.reason)}</span>` : ''}
      <span class="n">${b.tokens}</span></div>`).join('')}
    <p class="hint">Nothing here was written by the model. Every line is a fact you pinned or a
    keyword that fired, and the number is what it cost.</p>`);
}

// Every edit is kept. Restoring is itself an edit, so nothing is ever lost either way.
async function history_(passageId) {
  panel = 'history';
  const { passage } = await api.history({ story: storyId, passage: passageId });
  const cur = V.passages.find((p) => p.id === passageId);
  open_('History', `
    <div class="card"><div class="k">Now</div><div class="d">${esc(cur?.body ?? '')}</div></div>
    ${passage.length ? passage.map((r) => `<button class="card" data-r="${r.id}">
        <div class="k">${new Date(r.replaced_at).toLocaleString()}</div>
        <div class="d">${esc(r.body.slice(0, 300))}</div>
        <div class="k" style="color:var(--gold)">Restore this</div></button>`).join('')
      : '<p class="hint">No earlier versions. Edits from here on are kept.</p>'}`,
    () => $('sb').querySelectorAll('[data-r]').forEach((b) => b.onclick = async () => {
      V = await api.revert({ storyId, passageId, revisionId: b.dataset.r });
      refresh(); history_(passageId); }));
}

function ledger(filter, title) {
  const list = V.entries.filter((e) => !filter || e.entryType === filter);
  open_(title, list.map((e) => `<button class="card" data-e="${e.id}">
    <div class="n">${esc(e.title)}
      <span class="pill ${e.activation === 'always_on' ? 'on' : ''}">${e.activation === 'always_on' ? 'always' : 'when mentioned'}</span>
      ${e.lastEditor === 'human' ? '<span class="pill on">yours</span>' : ''}
      ${pinOf(e.id) === 'force_in' ? '<span class="pill on">forced in</span>' : ''}
      ${pinOf(e.id) === 'force_out' ? '<span class="pill" style="color:var(--warn);border-color:rgba(200,112,90,.4)">kept out</span>' : ''}</div>
    <div class="k">${e.entryType}${e.keys.length ? ' · ' + esc(e.keys.join(', ')) : ''}${
      e.states?.length ? ` · ${e.states.length} later state${e.states.length > 1 ? 's' : ''}` : ''}</div>
    <div class="d">${esc(e.body.slice(0, 130))}</div></button>`).join('')
    + `<button class="btn ghost" id="add">+ New entry</button>`, () => {
    $('add').onclick = () => entry_({ id: '', title: 'New entry', body: '[Name: attribute, attribute]',
      entryType: filter ?? 'lore', activation: 'always_on', keys: [] }, title, filter);
    $('sb').querySelectorAll('[data-e]').forEach((b) => b.onclick =
      () => entry_(V.entries.find((x) => x.id === b.dataset.e), title, filter)); });
}

function entry_(e, back, filter) {
  let keys = [...e.keys];
  const draw = () => open_(e.id ? 'Lore entry' : 'New entry', `
    <label>Name</label><input id="f-t" value="${esc(e.title)}">
    <label>Kind</label><select id="f-k">${KINDS.map((k) => `<option ${k === e.entryType ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <label>Entry</label><textarea id="f-b">${esc(e.body)}</textarea>
    <label>Notes to yourself</label><textarea id="f-n">${esc(e.notes ?? '')}</textarea>
    <p class="hint">Never sent to the model. Spoilers, questions, things to decide later.</p>
    <label>When</label><select id="f-a">
      <option value="always_on" ${e.activation === 'always_on' ? 'selected' : ''}>Always in context</option>
      <option value="triggered" ${e.activation === 'triggered' ? 'selected' : ''}>When mentioned</option></select>
    <label>In chapter ${V.currentChapter.index}</label>
    <select id="f-pin">
      <option value="" ${!pinOf(e.id) ? 'selected' : ''}>Follow the rules above</option>
      <option value="force_in" ${pinOf(e.id) === 'force_in' ? 'selected' : ''}>Always include, this chapter</option>
      <option value="force_out" ${pinOf(e.id) === 'force_out' ? 'selected' : ''}>Keep out, this chapter</option>
    </select>
    <p class="hint">This chapter only. Keeping something out is how a reveal stays sealed while
    the fact still exists in the ledger.</p>
    <label>Trigger threads</label>
    <div class="keys">${keys.map((k, i) => `<span class="key">${esc(k)}<button data-k="${i}">✕</button></span>`).join('')}
      <input id="f-key" placeholder="+ add" style="width:112px;padding:4px 10px;border-radius:999px"></div>
    <p class="hint">Fires when these words appear in recent prose — or in what you just typed.</p>
    <button class="btn" id="sv">Save</button>
    ${e.id ? `<button class="btn ghost" id="tl">Canon over time${
      e.states?.length ? ` · ${e.states.length}` : ''}</button>` : ''}
    ${e.id ? '<button class="btn ghost" id="eh">History</button>' : ''}
    <button class="btn ghost" id="bk">← ${esc(back)}</button>
    ${e.id ? '<button class="btn ghost danger" id="dl">Delete entry</button>' : ''}`, () => {
    if ($('tl')) $('tl').onclick = () => timeline(e, back, filter);
    if ($('eh')) $('eh').onclick = () => entryHistory(e, back, filter);
    $('bk').onclick = () => ledger(filter, back);
    $('sb').querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { keys.splice(+b.dataset.k, 1); draw(); });
    $('f-key').onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.value.trim()) { keys.push(ev.target.value.trim()); draw(); } };
    $('sv').onclick = async () => { V = await api.saveEntry(storyId, { id: e.id, title: $('f-t').value,
      body: $('f-b').value, notes: $('f-n').value,
        entryType: $('f-k').value, activation: $('f-a').value, keys });
      const saved = V.entries.find((x) => x.title === $('f-t').value) ?? e;
      if (saved.id) V = await api.setPin(storyId, V.currentChapter.id, saved.id, $('f-pin').value || null);
      ledger(filter, back); refresh(); };
    if ($('dl')) $('dl').onclick = async () => { V = await api.delEntry(storyId, e.id); ledger(filter, back); refresh(); };
  });
  draw();
}

/** Every change to a ledger entry, per field, with a way back.
 *  The provenance is the point: a field the model last wrote is not the same as one you did. */
async function entryHistory(e, back, filter) {
  const { entry } = await api.history({ story: storyId, entry: e.id });
  const now = { title: e.title, body: e.body, keys: JSON.stringify(e.keys) };
  open_(`${esc(e.title)} — history`, `
    ${['title', 'body', 'keys'].map((f) => `
      <div class="grp">${f}</div>
      <div class="card" style="cursor:default"><div class="k">now</div>
        <div class="d">${esc(now[f])}</div></div>
      ${entry.filter((r) => r.field === f).map((r) => `
        <button class="card" data-r="${r.id}">
          <div class="k">${new Date(r.replaced_at).toLocaleString()} · replaced by ${esc(r.replaced_by ?? '?')}</div>
          <div class="d">${esc(r.previous_value ?? '')}</div>
          <div class="k" style="color:var(--gold)">Restore this</div></button>`).join('')
        || '<p class="hint">No earlier versions of this field.</p>'}`).join('')}
    <button class="btn ghost" id="bk">← Entry</button>`, () => {
    $('bk').onclick = () => entry_(V.entries.find((x) => x.id === e.id) ?? e, back, filter);
    $('sb').querySelectorAll('[data-r]').forEach((b) => b.onclick = async () => {
      V = await api.revertField({ storyId, entryId: e.id, revisionId: b.dataset.r });
      entryHistory(V.entries.find((x) => x.id === e.id), back, filter); refresh(); });
  });
}

async function forkHere(passageId) {
  const p = V.passages.find((x) => x.id === passageId);
  const name = prompt(`Fork the story after "${(p?.body ?? '').slice(0, 40)}…"\n\nName this path:`,
    'the other way');
  if (name === null) return;
  V = await api.fork(storyId, passageId, name);
  refresh(); branches();
}

/** The paths through the story. Forking duplicates rows rather than sharing them, so writing
 *  on one cannot rewrite another — canon stays shared, because a fact is true on every path. */
function branches() {
  panel = 'branches';
  open_('Branches', (V.branches ?? []).map((b) => `
    <div class="card" style="cursor:default">
      <div class="n">${esc(b.name)}
        ${b.isPrimary ? '<span class="pill">first path</span>' : ''}
        ${b.active ? '<span class="pill on">writing here</span>' : ''}</div>
      <div class="k">${b.forkOrdinal ? `forked after passage ${b.forkOrdinal}` : 'the trunk'}</div>
      <div style="display:flex;gap:8px;margin-top:9px">
        ${b.active ? '' : `<button class="btn ghost" style="margin:0;flex:1" data-go="${b.id}">Write here</button>`}
        ${b.isPrimary ? '' : `<button class="btn ghost" style="margin:0;flex:0 0 92px" data-rm="${b.id}">Discard</button>`}
      </div></div>`).join('')
    + `<p class="hint">Hover any passage and choose <b>Branch from here</b> to fork. The new path
       copies the prose up to that point; the ledger is shared, because a fact is true on every
       path. Discarded takes, history and flags stay with the passages they belong to.</p>`, () => {
    $('sb').querySelectorAll('[data-go]').forEach((b) => b.onclick = async () => {
      V = await api.switchBranch(storyId, b.dataset.go); refresh(); branches(); });
    $('sb').querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      if (!confirm('Discard this path and everything written on it?')) return;
      V = await api.delBranch(storyId, b.dataset.rm); refresh(); branches(); });
  });
}

// Screen 27 — canon over time. Each state opens at a chapter; the one in force is the last
// at or before where you are writing. States ahead of you are hidden, or hinted.
function timeline(e, back, filter) {
  const states = [...(e.states ?? [])].sort((a, b) => a.fromChapter - b.fromChapter);
  const here = V.currentChapter.index;
  const span = (s, i) => {
    const next = states[i + 1];
    return next ? (s.fromChapter === next.fromChapter - 1 ? `Ch. ${s.fromChapter}`
      : `Ch. ${s.fromChapter} — ${next.fromChapter - 1}`) : `Ch. ${s.fromChapter}+`;
  };
  const stateOf = (s, i) => {
    const next = states[i + 1];
    if (here < s.fromChapter) return s.beforeMode === 'hint' ? 'Hinted' : 'Sealed';
    return !next || here < next.fromChapter ? 'In force' : 'Superseded';
  };
  open_(esc(e.title), `
    <p class="hint">The base body stands until the first state opens. Writing before a state
    opens cannot see it — that is what stops chapter 3 leaking chapter 7.</p>
    <div class="card" style="cursor:default">
      <div class="n">Base <span class="pill ${states.length && here >= states[0].fromChapter ? '' : 'on'}">${
        states.length && here >= states[0].fromChapter ? 'Superseded' : 'In force'}</span></div>
      <div class="d">${esc(e.body)}</div></div>
    ${states.map((s, i) => `<div class="card" style="cursor:default">
      <div class="n">${span(s, i)}
        <span class="pill ${stateOf(s, i) === 'In force' ? 'on' : ''}">${stateOf(s, i)}</span>
        ${s.beforeMode === 'hint' ? '<span class="pill">hint before</span>' : ''}</div>
      <div class="d">${esc(s.body)}</div>
      ${s.label ? `<div class="k">hint: ${esc(s.label)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:9px">
        <button class="btn ghost" style="margin:0;flex:1" data-ed="${s.id}">Edit</button>
        <button class="btn ghost" style="margin:0;flex:0 0 90px" data-rm="${s.id}">Remove</button>
      </div></div>`).join('')}
    <button class="btn" id="add">Add a later state</button>
    <button class="btn ghost" id="bk">← Entry</button>`, () => {
    $('bk').onclick = () => entry_(V.entries.find((x) => x.id === e.id) ?? e, back, filter);
    $('add').onclick = () => editState(e, {}, back, filter);
    $('sb').querySelectorAll('[data-ed]').forEach((b) => b.onclick =
      () => editState(e, states.find((s) => s.id === b.dataset.ed), back, filter));
    $('sb').querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      V = await api.delState(storyId, b.dataset.rm);
      timeline(V.entries.find((x) => x.id === e.id), back, filter); refresh(); });
  });
}

function editState(e, st, back, filter) {
  open_(st.id ? 'Later state' : 'Add a later state', `
    <label>Opens at chapter</label>
    <input id="st-c" type="number" min="1" value="${st.fromChapter ?? V.currentChapter.index}">
    <label>What is true from then on</label><textarea id="st-b">${esc(st.body ?? '')}</textarea>
    <label>Before it opens</label><select id="st-m">
      <option value="hide" ${st.beforeMode !== 'hint' ? 'selected' : ''}>Hide entirely</option>
      <option value="hint" ${st.beforeMode === 'hint' ? 'selected' : ''}>Hint only</option></select>
    <label>The hint</label><input id="st-l" value="${esc(st.label ?? '')}"
      placeholder="something here is not yet known">
    <p class="hint">A hint tells the model something exists without saying what, so
    foreshadowing has somewhere to come from. It never discloses the state itself.</p>
    <button class="btn" id="sv">Save</button>
    <button class="btn ghost" id="bk">← Timeline</button>`, () => {
    $('bk').onclick = () => timeline(V.entries.find((x) => x.id === e.id) ?? e, back, filter);
    $('sv').onclick = async () => {
      V = await api.saveState(storyId, e.id, { id: st.id, fromChapter: +$('st-c').value,
        body: $('st-b').value, beforeMode: $('st-m').value, label: $('st-l').value });
      timeline(V.entries.find((x) => x.id === e.id), back, filter); refresh(); };
  });
}

function storyPanel() {
  const st = V.story, c = V.currentChapter;
  open_('Story & chapter', STORY_FIELDS.filter((f) => f.k !== 'direction').map((f) => `
    <label>${f.label}</label>${f.area ? `<textarea id="s-${f.k}">${esc(st[f.k] ?? '')}</textarea>`
      : `<input id="s-${f.k}" value="${esc(st[f.k] ?? '')}">`}
    ${f.hint ? `<p class="hint">${f.hint}</p>` : ''}`).join('')
    + `<label>Register</label><select id="s-spice">${SPICE.map((t, i) =>
        `<option value="${i + 1}" ${i + 1 === st.spice ? 'selected' : ''}>${i + 1} — ${t}</option>`).join('')}</select>
    <div class="grp">Chapter ${c.index}</div>
    <label>Title</label><input id="c-t" value="${esc(c.title)}">
    <label>This chapter must end with</label><textarea id="c-b">${esc(c.authorsNote ?? '')}</textarea>
    <p class="hint">Rides the style directive near the end of the prompt, where instructions land hardest.</p>
    <button class="btn" id="sv">Save</button>
    <label>Keep this chapter whole</label>
    <select id="c-kw">
      <option value="" ${c.keepWhole ? '' : 'selected'}>Compact it — send the summary</option>
      <option value="1" ${c.keepWhole ? 'selected' : ''}>Pull it back — send the prose</option>
    </select>
    <p class="hint">A summary records what happened and drops how it read. Pull a chapter back
    when you are writing against its voice; the recent window shrinks to pay for it.</p>

    <div class="grp">Close the chapter</div>
    <label>Break note</label><input id="c-n" placeholder="Three weeks later">
    <label>Next chapter title</label><input id="c-x" placeholder="Chapter ${c.index + 1}">
    <button class="btn ghost" id="sum">Summarise chapter ${c.index}</button>
    ${c.summary ? `<p class="hint">${c.summaryStale
        ? '<b style="color:var(--warn)">Stale — the prose changed since this was written, so it is being kept out of the prompt.</b> '
        : '<b>Summary:</b> '}${esc(c.summary)}</p>` : ''}
    <button class="btn ghost" id="end">End chapter ${c.index}</button>
    <div class="grp">Your words</div>
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none;line-height:1"
       href="${api.exportUrl(storyId, 'md')}" download>Export as Markdown</a>
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none;line-height:1"
       href="${api.exportUrl(storyId, 'json')}" download>Export as JSON</a>
    <button class="btn ghost" id="bk">Back up now</button>
    <p class="hint" id="bkout">Snapshots run on start and every 30 minutes into <code>poc/backups/</code>.</p>
    <button class="btn ghost danger" id="del">Delete story</button>`, () => {
    $('bk').onclick = async () => { const b = await api.backup(storyId);
      $('bkout').textContent = `Snapshot written — ${(b.bytes / 1024).toFixed(0)} KB, keeping the newest 12.`; };
    $('sv').onclick = async () => {
      const s = { ...st, spice: +$('s-spice').value };
      for (const f of STORY_FIELDS) if (f.k !== 'direction') s[f.k] = $(`s-${f.k}`).value;
      V = await api.saveStory(storyId, s);
      V = await api.saveChapter(storyId, c.id,
        { title: $('c-t').value, authorsNote: $('c-b').value, keepWhole: $('c-kw').value === '1' });
      refresh(); storyPanel(); };
    $('sum').onclick = async () => { $('sum').textContent = 'summarising…'; $('sum').disabled = true;
      const r = await api.summarize(storyId, c.id);
      if (r.error) $('sum').textContent = r.error; else { V = r; storyPanel(); refresh(); } };
    $('end').onclick = async () => { V = await api.endChapter(storyId,
      { note: $('c-n').value, nextTitle: $('c-x').value }); refresh(); storyPanel(); };
    $('del').onclick = async () => { if (!confirm(`Delete "${st.title}"?`)) return;
      await api.deleteStory(storyId); localStorage.removeItem('anansi.story'); storyId = null; boot(); };
  });
}

// D6 — where the book is going, and the summaries that remember where it has been
function trajectory() {
  const st = V.story;
  open_('Trajectory', `
    <label>Where this is going</label><textarea id="t-d" style="min-height:110px">${esc(st.direction ?? '')}</textarea>
    <p class="hint">Aims the story without disclosing it. Sits with the premise at the top of every
    call, and is never restated to the reader.</p>
    <button class="btn" id="sv">Save</button>
    <div class="grp">Acts</div>
    ${(V.arcs ?? []).length ? (V.arcs ?? []).map((a) => `<div class="card" style="cursor:default">
        <div class="n">Chapters ${a.fromChapter}–${a.toChapter}
          <span class="pill on">act</span></div>
        <div class="d">${esc(a.summary)}</div>
        <button class="btn ghost" style="margin:6px 0 0" data-arc="${a.id}">Unroll</button>
      </div>`).join('')
      : '<p class="hint">None yet. Once a book has a dozen summarised chapters, rolling the early ones into an act keeps the opening in context instead of letting it fall off the end.</p>'}
    <div class="row" style="display:flex;gap:8px;align-items:flex-end">
      <div style="flex:1"><label>From chapter</label><input id="rf" type="number" min="1" value="1"></div>
      <div style="flex:1"><label>To</label><input id="rt" type="number" min="2"
        value="${Math.max(2, V.currentChapter.index - 3)}"></div>
    </div>
    <button class="btn ghost" id="roll">Roll these into one act</button>
    <p class="hint" id="rollout"></p>

    <div class="grp">What is remembered</div>
    ${V.chapters.map((c) => `<div class="card"><div class="n">${esc(c.title)}
      <span class="pill ${c.summaryStale ? '' : c.summary ? 'on' : ''}" ${
        c.summaryStale ? 'style="color:var(--warn);border-color:rgba(200,112,90,.4)"' : ''}>${
        c.summaryStale ? 'stale' : c.summary ? 'summarised' : 'not yet'}</span></div>
      <div class="d">${c.summary ? esc(c.summary) : 'Old chapters collapse to a summary; recent ones stay whole.'}</div>
      </div>`).join('')}`, () => {
    $('sv').onclick = async () => {
      V = await api.saveStory(storyId, { ...st, direction: $('t-d').value }); refresh(); trajectory(); };
    $('roll').onclick = async () => {
      $('roll').textContent = 'rolling up…'; $('roll').disabled = true;
      const r = await api.rollup(storyId, +$('rf').value, +$('rt').value);
      if (r.error) { $('rollout').textContent = r.error; $('roll').textContent = 'Roll these into one act';
        $('roll').disabled = false; return; }
      V = r; trajectory(); refresh(); };
    $('sb').querySelectorAll('[data-arc]').forEach((b) => b.onclick = async () => {
      V = await api.delArc(storyId, b.dataset.arc); trajectory(); refresh(); });
  });
}

// Screen 28 — "what the chapter added". Nothing here is canon until you say so.
// A conflict is a model proposal against a body you pinned; it is excluded from bulk accept.
function queue() {
  const ps = V.proposals ?? [];
  const n = (k) => ps.filter((p) => p.kind === k).length;
  const ch = V.chapters.find((c) => c.id === ps[0]?.chapterId) ?? V.currentChapter;
  const KIND = { new: 'new', changed: 'changed', conflict: 'conflict' };
  open_(ps.length ? `What chapter ${ch.index} added` : 'What the chapter added', `
    ${ps.length ? `<p class="hint">${n('new')} new · ${n('changed')} changed · ${n('conflict')} conflict
      · <b>nothing is canon yet</b></p>` : ''}
    ${ps.length ? ps.map((p) => `
      <div class="card" style="cursor:default">
        <div class="n">${esc(p.title)}
          <span class="pill ${p.kind === 'conflict' ? '' : 'on'}"${
            p.kind === 'conflict' ? ' style="color:var(--warn);border-color:rgba(200,112,90,.4)"' : ''
          }>${KIND[p.kind]}</span>
          <span class="pill">${esc(p.entryType)}</span></div>
        <div class="d">${esc(p.body)}</div>
        ${p.delta ? `<div class="k" style="color:${p.kind === 'conflict' ? 'var(--warn)' : 'var(--mute)'}">${esc(p.delta)}</div>` : ''}
        ${p.keys.length ? `<div class="k">${esc(p.keys.join(', '))}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" style="margin:0;flex:1" data-ok="${p.id}">Accept</button>
          <button class="btn ghost" style="margin:0;flex:1" data-ed="${p.id}">Edit</button>
          <button class="btn ghost" style="margin:0;flex:0 0 96px" data-no="${p.id}">Dismiss</button>
        </div></div>`).join('')
      : `<p class="hint">Nothing waiting. Read a chapter to see what it added to the world.</p>`}
    ${n('new') + n('changed') ? `<button class="btn" id="all">Accept all but the ${
      n('conflict') ? 'conflict' + (n('conflict') > 1 ? 's' : '') : 'conflicts'}</button>` : ''}
    <div class="grp">Read a chapter</div>
    ${V.chapters.map((c) => `<button class="btn ghost" data-rx="${c.id}">Read chapter ${c.index} — ${esc(c.title)}</button>`).join('')}`,
    () => {
      $('sb').querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => {
        V = await api.decide({ storyId, id: b.dataset.ok, accept: true }); queue(); refresh(); });
      $('sb').querySelectorAll('[data-no]').forEach((b) => b.onclick = async () => {
        V = await api.decide({ storyId, id: b.dataset.no, accept: false }); queue(); refresh(); });
      $('sb').querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => {
        const p = ps.find((x) => x.id === b.dataset.ed);
        open_('Edit before accepting', `
          <label>Name</label><input id="q-t" value="${esc(p.title)}">
          <label>Entry</label><textarea id="q-b" style="min-height:120px">${esc(p.body)}</textarea>
          <p class="hint">${esc(p.delta ?? '')}</p>
          <button class="btn" id="q-ok">Accept as edited</button>
          <button class="btn ghost" id="q-bk">← Back</button>`, () => {
          $('q-bk').onclick = queue;
          $('q-ok').onclick = async () => {
            V = await api.decide({ storyId, id: p.id, accept: true, body: $('q-b').value });
            queue(); refresh(); }; }); });
      if ($('all')) $('all').onclick = async () => {
        const ids = ps.filter((p) => p.kind !== 'conflict').map((p) => p.id);
        V = await api.decide({ storyId, ids, accept: true }); queue(); refresh(); };
      $('sb').querySelectorAll('[data-rx]').forEach((b) => b.onclick = async () => {
        b.textContent = 'reading…'; b.disabled = true;
        const r = await api.extract(storyId, b.dataset.rx);
        if (r.error) { b.textContent = r.error; return; }
        V = await api.story(storyId); queue(); drawRail(); });
    });
}

function prefs() {
  open_('Preferences', `
    <div class="grp">Weaving</div>
    <label>Thinking</label><select id="g-th">
      <option value="0" ${!GEN.thinking ? 'selected' : ''}>Off — straight to prose</option>
      <option value="1" ${GEN.thinking ? 'selected' : ''}>On — reasons first</option></select>
    <p class="hint">Measured: with thinking on, this model spent its whole budget reasoning and
    returned no prose on three runs of four. Off is 2.5× faster.</p>
    <label>Temperature <span id="tv">${GEN.temperature}</span></label>
    <input type="range" id="g-t" min="0" max="1.4" step="0.05" value="${GEN.temperature}">
    <label>Top-p</label><input id="g-p" type="number" step="0.01" value="${GEN.top_p}">
    <label>Min-p</label><input id="g-m" type="number" step="0.01" value="${GEN.min_p}">
    <label>DRY repetition penalty</label><input id="g-d" type="number" step="0.1" value="${GEN.dry_multiplier}">
    <label>Reply length (tokens)</label><input id="g-x" type="number" step="50" value="${GEN.max_tokens}">
    <div class="grp">Connection</div><p class="hint" id="cx"></p>
    <div class="grp">What the model has been doing</div>
    <div id="act"><p class="hint">loading…</p></div>
    <label>Context budget for this story</label>
    <input id="g-c" type="number" step="512" value="${V.story.maxContext ?? ''}" placeholder="max for this slot">
    <button class="btn" id="sv">Save</button>`, () => {
    $('g-t').oninput = (e) => $('tv').textContent = e.target.value;
    api.library().then((d) => $('cx').textContent =
      `${d.model} · ${d.slot.global.toLocaleString()} across ${d.slot.slots} slots = ${d.slot.perSlot.toLocaleString()} per slot`);
    api.activity(storyId).then((a) => {
      const rows = a.runs.slice(0, 12);
      $('act').innerHTML = rows.length ? `
        <p class="hint">Worst prefill ${a.worstPrefillSeconds ?? '—'}s${
          a.failures ? ` · ${a.failures} failed` : ''}. The budget engine earns its place when
          this gets slow — see PLAN-02 §7.2.</p>
        ${rows.map((r) => `<div class="lrow"><span>${esc(r.role)}</span>
          ${r.error ? '<span class="err">failed</span>' : ''}
          <span class="n">${r.promptTokens ?? '—'} tok · ${r.prefillSeconds ?? '—'}s prefill · ${r.seconds ?? '—'}s</span>
          </div>`).join('')}` : '<p class="hint">Nothing generated yet.</p>';
    });
    $('sv').onclick = async () => {
      GEN = (await api.settings(storyId, { thinking: $('g-th').value === '1', temperature: +$('g-t').value,
        top_p: +$('g-p').value, min_p: +$('g-m').value, dry_multiplier: +$('g-d').value,
        max_tokens: +$('g-x').value })).gen;
      const mc = parseInt($('g-c').value, 10);
      V = await api.saveStory(storyId, { ...V.story, maxContext: Number.isFinite(mc) ? mc : null });
      refresh(); }; });
}

// ---------- shell ----------
async function refresh() {
  const r = await api.manifest(payload());
  MANI = r.manifest; MANI.exact = r.exact;
  $('title').textContent = V.story.title;
  $('chap').textContent = `Chapter ${V.currentChapter.index} · ${V.currentChapter.title}`;
  // If you are not on the first path, say so — nothing is more disorienting than editing a
  // fork you have forgotten you are on.
  const b = (V.branches ?? []).find((x) => x.active);
  $('branchTag').hidden = !b || b.isPrimary;
  if (b && !b.isPrimary) $('branchTag').textContent = `⑂ ${b.name}`;
  drawDoc(); drawRail(); paintContext();
}
async function load(sid) {
  storyId = sid; localStorage.setItem('anansi.story', sid);
  V = await api.story(sid); GEN = V.gen;
  $('side').classList.remove('on'); panel = null;
  drawModes(); await refresh();
}
async function boot() {
  const d = await api.library(); LIB = d.stories; GEN = d.gen;
  if (!LIB.length) { const made = await api.createStory({ title: 'Untitled' });
    LIB = (await api.library()).stories; }
  await load(LIB.find((s) => s.id === storyId) ? storyId : LIB[0].id);
}
boot();
