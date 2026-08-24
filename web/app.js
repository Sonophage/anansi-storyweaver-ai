// One responsive surface. Replaces the separate desk and phone clients: the design puts the
// rail, the document and the 400px side panel in one shell, and turns the panel into a bottom
// sheet on a phone. Layout lives in app.html's CSS — this file decides state and content only,
// so a repaint does not rewrite every element's inline style.
import { api } from './api.js';
import { MODES, KINDS, SPICE, STORY_FIELDS, isSpeech, ago, esc, BLOCK_COLOR } from './model.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const phone = () => matchMedia('(max-width:719px)').matches;
const overlay = () => matchMedia('(max-width:1099px)').matches;

// ---------- appearance, remembered per browser ----------
// Wrapped because a private window throws on access rather than returning null.
const LOOK = 'anansi.look';
const look = { theme: 'obsidian', font: 'serif', size: 'm' };
try { Object.assign(look, JSON.parse(localStorage.getItem(LOOK) || '{}')); } catch { /* no storage */ }
function applyLook() {
  root.dataset.uiTheme = look.theme; root.dataset.uiFont = look.font; root.dataset.uiSize = look.size;
  try { localStorage.setItem(LOOK, JSON.stringify(look)); } catch { /* no storage */ }
}

// ---------- state ----------
const S = {
  place: 'workspace', wpage: 'stories', panel: null, mode: 'speak', speaker: null,
  rail: !overlay(), storyId: null, busy: false, appearance: false, query: '',
  entryId: null, historyOf: null, models: null, ledgerKind: 'all', ledgerQ: '', ctxView: 'blocks',
  fieldHistory: null, confirmDelete: false, spark: null, ritual: null, setup: null,
  imp: { name: null, data: null, preview: null, into: '', busy: false, done: null },
  found: null,          // the passage a search result sent you to, marked until you move on
  searchAll: false,     // inside a story, search that story only unless asked otherwise
  setupQ: '',           // filter over the ledger on the next-chapter setup page
};
let LIB = [], V = null, MANI = null, ACT = null, HITS = null, LEDGER = null, PROMPT = '';
// model, slot, gen and budget ride along on /api/stories and /api/story — there is no
// separate status route, and activity returns only generation rows.
let SRV = { model: null, slot: null, gen: {} };

// Hardcoded on purpose: point of view is a craft decision with a small set of real answers.
const POV = ['first person, present tense', 'first person, past tense',
  'second person, present tense', 'third limited, present tense',
  'third limited, past tense', 'third omniscient, past tense'];

// Six rows, in this order, at Seth's direction. What used to be eight had Story and Chapter in
// one panel and then three more panels — Trajectory, What the chapter added, Branches — that are
// all chapter-scoped, so the chapter's business was spread across four rows.
//
//   story     the book: what it is, who is in it, how it reads, and taking it with you
//   chapter   the one you are writing: its name, its ending, where this is going, what it
//             added, its branches, and closing it
//   threads   every card in this story — characters, lore, items, rules
//   context   what the model is about to be sent, and why
const SNAV = [
  ['story', '⚙', 'Story'], ['chapter', '❧', 'Chapter'],
  ['threads', '☙', 'Threads'], ['context', '◈', 'Context'],
  ['search', '⌕', 'Search'], ['teller', '◐', 'Storyteller'],
];
// Deep links and bookmarks still carry the old names, and so does a browser tab left open across
// the change. Cheaper to map them than to serve a blank panel.
const PANEL_WAS = { inspector: 'context', cast: 'threads', traj: 'chapter', queue: 'chapter', branches: 'chapter' };
const WNAV = [
  ['stories', '❋', 'My stories'], ['create', '✎', 'Create a story'],
  ['canon', '◈', 'Worlds & lorebooks'], ['import', '↧', 'Import'], ['prefs', '◐', 'Preferences'],
];
const TITLES = Object.fromEntries(SNAV.map(([k, , l]) => [k, l]));
// Two panels the rail does not list: they open by clicking a thing, not a nav row.
TITLES.entry = 'Ledger entry';
TITLES.history = 'History';
TITLES.setup = 'The next chapter';
const WTITLES = {
  stories: () => [`My stories`, `${LIB.length} ${LIB.length === 1 ? 'story' : 'stories'}`],
  create: () => ['Create a story', 'Spark a skeleton, or start blank'],
  canon: () => {
    // Counts the whole ledger, not the open story — the page shows every book. It used to say
    // "open a story first" while listing entries from four of them.
    const n = LEDGER?.length ?? 0;
    const books = new Set((LEDGER ?? []).map((e) => e.story)).size;
    return ['Worlds & lorebooks', LEDGER === null ? 'reading…'
      : `${n} ${n === 1 ? 'entry' : 'entries'} across ${books} ${books === 1 ? 'lorebook' : 'lorebooks'}`];
  },
  import: () => ['Import', 'Character cards, Anansi exports, AI Dungeon'],
  prefs: () => ['Preferences', 'llama-server, model, slot'],
};

// One list, so a new action cannot be added to the markup and forgotten here — and so the
// names are visible in one place next to the data-ui-* look attributes they must not collide with.
const ACTIONS = ['nav', 'rail', 'leave', 'open', 'chapter', 'panel', 'appearance', 'theme',
  'fontpick', 'sizepick', 'mode', 'take', 're', 'del', 'ed', 'hi', 'vp', 'vn', 'flagx',
  'savestory', 'summarize', 'extract', 'decide', 'branch', 'newentry', 'entry',
  'spark', 'blank', 'backup', 'savegen', 'hit', 'expand', 'saveentry', 'delentry', 'backentry',
  'kind', 'act', 'pickmodel', 'fork', 'restore', 'more', 'lkind', 'ctxview', 'goblock',
  'reroll', 'addstate', 'delstate', 'fieldhistory', 'revertfield', 'exportdb',
  'delstory', 'send', 'accept-spark', 'drop-spark', 'ritual', 'pin', 'place', 'savesetup',
  'skipsetup', 'doimport', 'dropimport', 'openimported',
  'continue', 'tolore', 'usetake'].map((k) => `[data-${k}]`).join(',');

let toastT = null, searchT = null, foundT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---------- rail ----------
function drawRail() {
  const inStory = S.place === 'story' && V;
  const rows = inStory ? SNAV : WNAV;
  const active = inStory ? S.panel : S.wpage;
  const item = ([k, g, l]) => {
    const on = k === active;
    return `<button data-nav="${k}" style="display:flex; align-items:center; gap:13px; padding:11px 12px;
      border-radius:11px; margin-bottom:3px; white-space:nowrap; overflow:hidden; width:100%;
      background:${on ? 'rgba(217,178,106,.08)' : 'transparent'};
      border:1px solid ${on ? 'rgba(217,178,106,.22)' : 'transparent'}">
      <span class="serif" style="font-size:15px; width:16px; flex:0 0 auto; color:${on ? '#D9B26A' : '#78726A'}">${g}</span>
      <span class="txt" style="font-size:14px; color:${on ? '#F3ECE0' : '#8A8478'}">${esc(l)}</span></button>`;
  };
  const back = inStory
    ? `<button data-leave="1" style="margin:0 16px 12px; padding:9px 12px; border-radius:10px;
        border:1px solid var(--edge); display:flex; align-items:center; gap:10px; width:calc(100% - 32px)">
        <span style="color:#78726A; font-size:13px; flex:0 0 auto">‹</span>
        <span class="txt" style="font-size:12.5px; color:#8A8478">All stories</span></button>` : '';
  const tail = inStory
    ? `<div class="txt" style="padding:26px 12px 10px; font-size:10px; letter-spacing:.3em;
         text-transform:uppercase; color:#6E6961">Chapters</div>
       ${V.chapters.map((c) => `<button data-chapter="${c.id}" style="padding:8px 12px; font-size:13px;
         border-radius:8px; white-space:nowrap; overflow:hidden; width:100%; text-overflow:ellipsis;
         color:${c.id === V.currentChapter.id ? '#E0C48C' : '#78726A'}"><span class="txt">${
         esc(c.title || `Chapter ${c.index}`)}</span></button>`).join('')}`
    : (LIB.length ? `<div class="txt" style="padding:26px 12px 10px; font-size:10px; letter-spacing:.3em;
         text-transform:uppercase; color:#6E6961">Open</div>
       ${LIB.slice(0, 4).map((s) => `<button data-open="${s.id}" style="padding:8px 12px; font-size:13px;
         color:#E0C48C; border-radius:8px; white-space:nowrap; overflow:hidden; width:100%; text-overflow:ellipsis"
         ><span class="txt">${esc(s.title)}</span></button>`).join('')}` : '');

  $('rail').innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; padding:26px 20px 20px; flex:0 0 auto">
      <img src="./web/icon.svg" alt="" style="width:24px; height:24px; border-radius:6px; display:block; flex:0 0 auto">
      <span class="serif txt" style="font-size:26px; color:#F3ECE0">Anansi</span>
      <button data-rail="1" style="margin-left:auto; color:#78726A; font-size:17px; line-height:1;
        padding:2px 4px" aria-label="${S.rail ? 'Collapse the rail' : 'Expand the rail'}"
        >${overlay() ? '✕' : (S.rail ? '‹' : '›')}</button>
    </div>
    ${back}
    <div class="scroll" style="padding:0 16px; display:flex; flex-direction:column">${rows.map(item).join('')}${tail}</div>
    <div style="margin-top:auto; padding:14px 20px; border-top:1px solid var(--line); display:flex;
      align-items:center; gap:12px; white-space:nowrap; overflow:hidden">
      <span style="width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${SRV.slot ? 'var(--good)' : 'var(--warn)'}"></span>
      <span class="txt" style="display:flex; flex-direction:column; gap:2px">
        <span style="font-size:13px; color:#EAE3D6">${esc(SRV.model || 'no model')}</span>
        <span style="font-size:11px; color:#6E6961">${SRV.slot
          ? `slot ${SRV.slot.perSlot.toLocaleString()}` : 'llama-server asleep'}</span>
      </span></div>`;
}

// ---------- header ----------
function drawBar() {
  const inStory = S.place === 'story' && V;
  // A zero budget is a state, not a number. Dividing by it gave "Context Infinity%", the way
  // the un-clamped version gave "Context -168%".
  const pct = MANI && MANI.totals.budget > 0
    ? Math.round(MANI.totals.used / MANI.totals.budget * 100) : null;
  const noRoom = !!MANI && MANI.totals.budget <= 0;
  const words = inStory ? V.passages.reduce((n, p) => n + (String(p.body).match(/\S+/g) || []).length, 0) : 0;
  const [title, sub] = inStory
    ? [V.story.title, V.currentChapter.title || `Chapter ${V.currentChapter.index}`]
    : (WTITLES[S.wpage] || WTITLES.stories)();
  $('bar').innerHTML = `
    <button id="burger" data-rail="1" aria-label="Menu">☰</button>
    <div style="flex:1 1 auto; min-width:100px; display:flex; flex-direction:column; gap:3px; overflow:hidden">
      <span class="serif" style="font-size:23px; line-height:1; color:var(--chrome-ink);
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(title)}</span>
      <span class="up" style="font-size:10.5px; color:var(--label); white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis">${esc(sub)}</span>
    </div>
    <div style="margin-left:auto; display:flex; align-items:center; gap:10px; flex:0 0 auto">
      ${inStory ? `<span class="deskonly" style="font-size:12px; color:var(--chrome-dim)">${words.toLocaleString()} words</span>
      <button class="pill" data-reroll="1" ${S.busy ? 'disabled style="opacity:.5"' : ''}
        title="Re-roll the last passage, keeping the old take">${S.busy ? '…' : '↻'}<span
        class="deskonly" style="display:inline; margin-left:7px">Regenerate</span></button>
      ${noRoom
        ? `<button class="pill deskonly" data-panel="context"
            style="border-color:#C8705A; color:#C8705A">No room</button>`
        : pct == null ? '' : `<button class="pill deskonly" data-panel="context">Context ${pct}%</button>`}
      <button class="pill" data-appearance="1" aria-pressed="${S.appearance}"
        style="font-family:'Instrument Serif',serif; font-size:15px; line-height:1; padding:7px 13px">Aa</button>
      <button class="phoneonly" data-panel="chapter" style="font-size:19px; color:var(--chrome-dim)" aria-label="This chapter">⚙</button>`
      : `<button class="pill deskonly" data-open="new">New story</button>
         ${LIB.length ? `<button data-open="${LIB[0].id}" style="font-size:12px; letter-spacing:.1em;
           text-transform:uppercase; color:#100D08; background:var(--gold); padding:9px 18px;
           border-radius:10px; font-weight:500; white-space:nowrap">Resume writing</button>` : ''}`}
    </div>`;
}

function drawAppearance() {
  const el = $('appearance');
  el.hidden = !S.appearance;
  if (!S.appearance) return;
  const themes = [['obsidian', 'Obsidian', 'linear-gradient(140deg,#1A1622,#0A0A0C)'],
                  ['ink', 'Ink', 'linear-gradient(140deg,#141416,#0A0A0B)'],
                  ['parchment', 'Parchment', 'linear-gradient(140deg,#F3EDE1,#DED3BF)']];
  const fonts = [['serif', 'Instrument Serif', "'Instrument Serif',Georgia,serif"],
                 ['sans', 'IBM Plex Sans', "'IBM Plex Sans',sans-serif"]];
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px">
      <span style="font-size:10px; letter-spacing:.26em; text-transform:uppercase; color:#6E6961">Reading</span>
      <button data-appearance="0" style="margin-left:auto; color:#78726A; font-size:12px" aria-label="Close">✕</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:7px">${themes.map(([k, l, sw]) => `
      <button data-theme="${k}" style="display:flex; align-items:center; gap:11px; padding:8px 10px;
        border-radius:11px; border:1px solid ${look.theme === k ? '#D9B26A' : '#2A2721'}; width:100%">
        <span style="width:22px; height:22px; border-radius:7px; background:${sw};
          border:1px solid rgba(255,255,255,.08); flex:0 0 auto"></span>
        <span style="font-size:13px; color:${look.theme === k ? '#EAE3D6' : '#8A8478'}">${l}</span></button>`).join('')}</div>
    <div style="display:flex; flex-direction:column; gap:7px">${fonts.map(([k, l, fam]) => `
      <button class="chip" data-fontpick="${k}" aria-pressed="${look.font === k}"
        style="font-family:${fam}; font-size:15px">${l}</button>`).join('')}</div>
    <div style="display:flex; gap:7px">${['s', 'm', 'l'].map((k) => `
      <button class="chip" data-sizepick="${k}" aria-pressed="${look.size === k}"
        style="flex:1; text-align:center; padding:9px 0; letter-spacing:.1em; font-size:12.5px">${k.toUpperCase()}</button>`).join('')}</div>`;
}

// ---------- the document ----------
function passageHTML(p) {
  if (p.isBreak) return `<div class="scenebreak"><i></i><span class="up" style="font-size:10px;
    color:var(--label); opacity:.8">${esc(p.body || 'Scene')}</span><i></i></div>`;
  const mine = p.author === 'human';
  // Authorship is not the same question as whether this is dialogue. It used to be — Speak was
  // the only way a human passage got written, and a Speak passage is always a line — but Act and
  // Narrate write human passages that are narration, and styling those as speech with a "You ·"
  // chip is the opposite of Narrate's whole point. A passage is spoken if it has a named voice
  // or opens on a quote; who wrote it only decides the label.
  const spoken = !!p.speaker || isSpeech(p.body);
  const flags = (V.violations ?? []).filter((f) => f.passageId === p.id);
  const v = p.variants ?? [];
  const at = v.findIndex((x) => x.selected) + 1;
  const acts = `<button class="more" data-more="${p.id}" aria-label="Actions">⋯</button>
    <div class="acts">
    ${v.length > 1 ? `<span style="display:flex; align-items:center; gap:4px; padding:8px 6px; font-size:12px; color:#78726A">
      <button data-vp="${p.id}">‹</button>${at}/${v.length}<button data-vn="${p.id}">›</button></span>` : ''}
    <button data-re="${p.id}"><span class="serif" style="color:#D9B26A">↻</span><span class="lbl-txt">Regenerate</span></button>
    <button data-ed="${p.id}"><span class="serif" style="color:#D9B26A">✎</span><span class="lbl-txt">Edit</span></button>
    <button data-hi="${p.id}"><span class="serif" style="color:#D9B26A">⌂</span><span class="lbl-txt">History</span></button>
    <button data-del="${p.id}" style="color:#C8705A"><span class="serif">✕</span><span class="lbl-txt">Delete</span></button></div>`;

  const body = spoken
    ? `<div class="who">${p.speaker ? esc(p.speaker)
         : mine ? `You · ${esc(V.story.persona || 'you')}` : esc(V.story.title)}</div>
       <div class="said" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>`
    : `<div class="narr" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>`;
  const flagged = flags.map((f) => {
    const e = V.entries.find((x) => x.id === f.entryId);
    // The reason is whatever the checker returned, and a reasoning model has put 3,321
    // characters in one. Clamped in CSS and expandable, never trusted to be a sentence.
    return `<button class="flag" data-flagx="${f.id}" aria-expanded="false" title="Click to expand · shift-click to dismiss">
      <span style="width:5px; height:5px; border-radius:50%; background:#C8705A; flex:0 0 auto; margin-top:6px"></span>
      <span>Contradiction · ${esc(e?.title ?? 'canon')}${f.reason ? ` — ${esc(f.reason)}` : ''}</span></button>`;
  }).join('');
  const cls = `block${mine ? ' you' : spoken ? ' speak' : ''}${p.id === S.found ? ' found' : ''}`;
  return `<div class="${cls}">${body}${acts}${flagged}</div>`;
}

function drawDoc() {
  const read = $('read'), col = $('col');
  const tip = read.scrollHeight - read.scrollTop - read.clientHeight < 140;
  // ONE chapter at a time. Every chapter in one scroll was fine at three passages and is not at
  // 358: you cannot jump to a chapter, and the browser holds the whole book in the DOM. The
  // engine has focused a chapter since it was written — view(storyId, focusChapterId) — and the
  // rail already sets it. Only this function had never used it.
  const ch = V.currentChapter;
  const ps = V.passages.filter((p) => p.chapterId === ch.id);
  const at = V.chapters.findIndex((c) => c.id === ch.id);
  const prev = V.chapters[at - 1], next = V.chapters[at + 1];
  const words = ps.reduce((n, p) => n + (String(p.body).match(/\S+/g) || []).length, 0);
  const step = (c, label, side) => c
    ? `<button data-chapter="${c.id}" style="font-size:11px; letter-spacing:.14em;
        text-transform:uppercase; color:var(--gold); white-space:nowrap; max-width:44%;
        overflow:hidden; text-overflow:ellipsis">${side === 'l' ? '&lsaquo; ' : ''}${
        esc(c.title || `Chapter ${c.index}`)}${side === 'r' ? ' &rsaquo;' : ''}</button>`
    : `<span style="font-size:11px; color:var(--faint); letter-spacing:.14em; text-transform:uppercase">${label}</span>`;

  col.innerHTML = `
    <div style="display:flex; align-items:baseline; gap:12px; font-size:10.5px;
      letter-spacing:.28em; text-transform:uppercase; color:var(--label)">
      <span>${esc(ch.title || `Chapter ${ch.index}`)}</span>
      <span style="letter-spacing:.1em; text-transform:none; opacity:.7">chapter ${at + 1} of ${V.chapters.length}</span>
      ${words ? `<span style="margin-left:auto; letter-spacing:.1em; text-transform:none; opacity:.7">${words.toLocaleString()} words</span>` : ''}
    </div>
    ${ps.map(passageHTML).join('') || `<div class="narr" style="opacity:.6">${
      V.chapters.length > 1 ? 'Nothing in this chapter yet.' : 'Nothing written yet. The composer is below.'}</div>`}
    ${V.chapters.length > 1 ? `<div style="display:flex; align-items:center; gap:14px; padding:26px 0 4px;
      border-top:1px solid rgba(255,255,255,.05); margin-top:18px">
      ${step(prev, 'the beginning', 'l')}
      <span style="margin-left:auto"></span>
      ${step(next, 'the end', 'r')}</div>` : ''}`;
  if (tip) read.scrollTop = read.scrollHeight;
}

function drawDock() {
  if (!(S.place === 'story' && V)) { $('dock').hidden = true; return; }
  $('dock').hidden = false;
  const [, , placeholder] = MODES.find((m) => m[0] === S.mode) ?? MODES[0];
  // Speak and Act happen AS someone. Everyone else in the story is fair game, which is what the
  // `speaker` column on a passage has always been for — there was simply no way to set it.
  const asWhom = S.mode === 'speak' || S.mode === 'act';
  const cast = V.entries.filter((e) => e.entryType === 'character');
  const me = V.story.persona || 'you';
  const who = S.speaker || me;

  $('dockCol').innerHTML = `
    <div id="modes">
      <button data-continue="1" ${S.busy ? 'disabled' : ''} title="Carry on with no prompt">Continue</button>
      ${MODES.map(([k, label]) => `<button data-mode="${k}" aria-pressed="${k === S.mode}">${label}</button>`).join('')}
      ${asWhom ? `<label class="deskonly" style="margin-left:auto; display:flex; align-items:center; gap:6px;
        font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--label); opacity:.75">
        as
        <select id="asWhom" style="background:none; border:0; color:#D9B26A; font-size:11px;
          letter-spacing:.06em; text-transform:none; max-width:150px">
          <option value=""${S.speaker ? '' : ' selected'}>${esc(me)}</option>
          ${cast.filter((e) => e.title !== me).map((e) => `<option value="${esc(e.title)}"${
            e.title === S.speaker ? ' selected' : ''}>${esc(e.title)}</option>`).join('')}
        </select></label>` : ''}
    </div>
    <div id="inputRow">
      <textarea id="input" rows="1" placeholder="${esc(placeholder(who))}"></textarea>
      <span class="deskonly" style="font-size:10.5px; color:var(--label); opacity:.55; padding-bottom:3px">&crarr;</span>
      <button id="send" data-send="1" ${S.busy ? 'disabled' : ''} aria-label="Send">${S.busy ? '…' : '↑'}</button>
    </div>`;
  const ta = $('input');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; });
  ta.addEventListener('keydown', (e) => {
    // Enter sends. It used to need Cmd/Ctrl, which meant the button was the only way to send —
    // in a box you type one line into, that is the wrong default round.
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); generate(); }
  });
}

// ---------- side panel ----------
function drawSide() {
  const side = $('side');
  side.hidden = !S.panel || S.place !== 'story';
  if (side.hidden) return;
  $('sideHead').innerHTML = `
    <span class="serif" style="flex:1; font-size:20px; color:#F3ECE0; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis">${esc(TITLES[S.panel] ?? '')}</span>
    <button data-panel="" style="color:#D9B26A; font-size:11px; letter-spacing:.12em; text-transform:uppercase">Close</button>`;
  $('sideBody').innerHTML = (PANELS[S.panel] ?? (() => ''))();
}

const PANELS = {
  entry: entryEditor,
  setup: setupPanel,
  history: historyPanel,
  context() {
    if (!MANI) return `<div class="hint">Open the composer once and the manifest appears here.</div>`;
    if (S.ctxView === 'prompt') {
      return `<div style="display:flex; flex-direction:column">
        ${ctxTabs()}
        <div class="hint" style="margin:0 0 10px">Exactly what the next call will send, in order.
          Nothing is added between here and the model.</div>
        <pre style="white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,monospace;
          font-size:11.5px; line-height:1.55; color:#C6BFB2; background:var(--field);
          border:1px solid var(--chip); border-radius:11px; padding:12px 13px; margin:0"
          >${esc(PROMPT || '(assembling…)')}</pre>
        <div class="hint">${PROMPT ? `${PROMPT.length.toLocaleString()} characters sent` : ''}</div></div>`;
    }
    const inc = MANI.blocks.filter((b) => b.state === 'included');
    const agg = {};
    for (const b of inc) agg[b.kind] = (agg[b.kind] ?? 0) + b.tokens;
    if (MANI.totals.budget <= 0) {
      // `budget || 1` used to make this render as "406 / 1" with a meter drawn against nothing.
      return `<div style="display:flex; flex-direction:column">
        ${ctxTabs()}
        <div style="display:flex; align-items:flex-start; gap:12px; padding:12px 0">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--bad); margin-top:5px; flex:0 0 auto"></span>
          <span style="flex:1; display:flex; flex-direction:column; gap:5px">
            <span style="font-size:13.5px; color:#EAE3D6">There is no room for a prompt</span>
            <span class="hint" style="margin:0">${esc(MANI.overflowReason
              ?? "This story's context cap leaves nothing after the space reserved for the reply.")}</span></span></div>
        <div class="row"><span style="color:#EAE3D6">Assembled anyway</span>
          <span class="tnum" style="margin-left:auto; color:#78726A">${MANI.totals.used.toLocaleString()} tokens</span></div>
        <div class="row"><span style="color:#EAE3D6">Room for it</span>
          <span class="tnum" style="margin-left:auto; color:var(--bad)">none</span></div>
        <div class="hint">Raise the cap in Story &amp; chapter, or lower Max tokens under Storyteller.</div></div>`;
    }
    const budget = MANI.totals.budget;
    return `<div style="display:flex; flex-direction:column; gap:2px">
      ${ctxTabs()}
      <div style="display:flex; align-items:baseline; gap:10px; font-size:12.5px; color:#8A8478">
        <span>Assembled for the next call</span>
        <span class="tnum" style="margin-left:auto; color:#78726A">${MANI.totals.used.toLocaleString()} / ${budget.toLocaleString()}</span></div>
      <div class="meter">${Object.entries(agg).map(([k, v]) =>
        `<i style="width:${(v / budget * 100).toFixed(2)}%; background:${BLOCK_COLOR[k] ?? '#635E56'}"></i>`).join('')}</div>
      ${(() => {
        // Compact now, where the number that makes you want it is. Summarising is what actually
        // shrinks a long book — the open chapter's prose collapses into a few lines and the
        // PROSE block stops carrying it — and it was only reachable from the Chapter panel,
        // which is not where you are when you notice the meter filling up.
        const prose = (agg.PROSE ?? 0) + (agg.TAIL ?? 0);
        const pct = Math.round(MANI.totals.used / budget * 100);
        if (!prose) return '';
        return `<button class="btn ghost" data-summarize="1" style="margin:10px 0 2px">Compact now</button>
          <div class="hint" style="margin:0 0 8px">Summarises the open chapter, so its prose stops
            being sent line by line. Prose is ${prose.toLocaleString()} of the
            ${MANI.totals.used.toLocaleString()} tokens here${pct >= 70
              ? ' — and you are at ' + pct + '% of the budget.' : '.'}</div>`;
      })()}
      ${Object.entries(agg).map(([k, v]) => {
        const rows = inc.filter((b) => b.kind === k);
        const why = rows.map((b) => b.firedBy?.join(', ') || b.reason).filter(Boolean)[0] ?? '';
        // Every block came from something editable. This is the way back to it.
        const to = k.startsWith('CANON') ? `entry:${rows[0]?.id ?? ''}`
          : k === 'EARLIER' ? 'traj:' : k === 'PROSE' || k === 'TAIL' ? 'doc:' : 'story:';
        return `<button class="row" data-goblock="${to}" style="width:100%; text-align:left">
          <span style="width:8px; height:8px; border-radius:2px; flex:0 0 auto; background:${BLOCK_COLOR[k] ?? '#635E56'}"></span>
          <span style="color:#EAE3D6">${esc(k)}</span>
          <span style="color:#D9B26A; font-size:11.5px">${esc(why)}</span>
          <span class="tnum" style="margin-left:auto; color:#78726A">${v.toLocaleString()}</span></button>`;
      }).join('')}
      ${MANI.blocks.filter((b) => b.state !== 'included').map((b) => `<div class="row" style="opacity:.55">
        <span style="width:8px; height:8px; border-radius:2px; flex:0 0 auto; background:#3A372F"></span>
        <span style="color:#8A8478">${esc(b.kind)}</span>
        <span style="color:#C8705A; font-size:11.5px">${esc(b.reason ?? 'omitted')}</span></div>`).join('')}
      <div class="hint" style="margin-top:14px">Canon is capped at 45% of the slot, earlier chapters at 25%,
        recent prose at 60%. The tail is never evicted. Click a row to reach what put it there.</div></div>`;
  },

  // Every card in this story, grouped by what kind of thing it is. This was `cast` and showed
  // characters only, so lore, items and rules had no home inside a story at all — the Worlds page
  // lists them across every story, which is a different question.
  threads() {
    if (S.entryId) return entryEditor();
    const groups = [['character', 'Characters', 'character'], ['lore', 'Lore', 'lore'],
                    ['item', 'Items', 'item'], ['rule', 'Rules', 'rule']];
    const shown = groups.filter(([k]) => V.entries.some((e) => e.entryType === k));
    return `<div style="display:flex; flex-direction:column; gap:9px">
      ${shown.map(([k, label]) => `
        <div class="lbl" style="letter-spacing:.26em; margin-top:6px">${label}</div>
        ${V.entries.filter((e) => e.entryType === k).map((e) => entryCard(e)).join('')}`).join('')}
      ${shown.length ? '' : '<div class="hint" style="margin:0">Nothing written down yet. Canon is what the model is told and never allowed to contradict.</div>'}
      <div class="lbl" style="letter-spacing:.26em; margin-top:18px">Add</div>
      <div style="display:flex; flex-wrap:wrap; gap:7px">
        ${groups.map(([k, , one]) => `<button class="btn ghost" data-newentry="${k}"
          style="flex:1 1 44%; white-space:nowrap">New ${one}</button>`).join('')}
      </div></div>`;
  },

  story() {
    // Setting comes from the lore already written down and You-are from the cast, so neither is
    // free text drifting away from the ledger. A value the ledger does not hold is kept and
    // labelled rather than silently dropped.
    const lore = V.entries.filter((e) => e.entryType === 'lore' || e.entryType === 'item');
    const cast = V.entries.filter((e) => e.entryType === 'character');
    const pick = (key, rows, current, blank) => `<select class="field" data-story="${key}">
      <option value="">${blank}</option>
      ${rows.map((r) => `<option value="${esc(r)}" ${r === current ? 'selected' : ''}>${esc(r)}</option>`).join('')}
      ${current && !rows.includes(current) ? `<option value="${esc(current)}" selected>${esc(current)} — not in the ledger</option>` : ''}
    </select>`;
    const fields = STORY_FIELDS.filter((f) => !['direction', 'setting', 'pov', 'persona'].includes(f.k));
    return `<div style="display:flex; flex-direction:column">
      ${fields.map((f) => `<label class="lbl">${f.label}</label>
        ${f.area ? `<textarea class="field" data-story="${f.k}">${esc(V.story[f.k] ?? '')}</textarea>`
                 : `<input class="field" data-story="${f.k}" value="${esc(V.story[f.k] ?? '')}">`}
        ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}`).join('')}
      <label class="lbl">Setting</label>
      ${pick('setting', lore.map((e) => e.title), V.story.setting, 'Not set')}
      <div class="hint">Drawn from the lore and items in this story's ledger.</div>
      <label class="lbl">Point of view</label>
      ${pick('pov', POV, V.story.pov, 'Not set')}
      <label class="lbl">You are</label>
      ${pick('persona', cast.map((e) => e.title), V.story.persona, 'Nobody — narrate only')}
      <div class="hint">The character you speak as in Speak mode. Drawn from the cast.</div>
      <label class="lbl">Spice</label>
      ${(() => {
        // Six options, not five plus a box. The written override was on screen always, which made
        // it noise on every story that does not use it. A story is on a level OR on a written
        // register, never both, so the sixth option IS the switch.
        const custom = !!V.story.spiceNote?.trim();
        return `<select class="field" data-story="spice">${SPICE.map((l, i) =>
          `<option value="${i + 1}" ${!custom && Number(V.story.spice) === i + 1 ? 'selected' : ''}>${i + 1} · ${l}</option>`).join('')}
          <option value="custom" ${custom ? 'selected' : ''}>Custom — say it yourself</option></select>
        <div id="spiceCustom" ${custom ? '' : 'hidden'}>
          <label class="lbl">The register, in your words</label>
          <textarea class="field" data-story="spiceNote"
            placeholder="e.g. explicit, but never coy about it — the vocabulary of the writing sample"
            >${esc(V.story.spiceNote ?? '')}</textarea>
          <div class="hint">This replaces the level entirely — it is the register line the model receives.</div>
        </div>`;
      })()}
      <button class="btn" data-savestory="1" style="margin-top:16px">Save</button>
      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Take it with you</div>
      <div style="display:flex; gap:7px">
        <a class="btn ghost" href="${api.exportUrl(S.storyId, 'markdown')}" download
          style="flex:1; text-decoration:none">Markdown</a>
        <a class="btn ghost" href="${api.exportUrl(S.storyId, 'json')}" download
          style="flex:1; text-decoration:none">JSON</a>
      </div>
      <button class="btn ghost" data-exportdb="1" style="margin-top:7px">As a standalone database</button>
      <div class="hint">The database leaves as one file and comes back through Import. Markdown and
        JSON are for reading elsewhere.</div>
      <div class="lbl" style="letter-spacing:.26em; margin-top:26px; color:#C8705A">Danger</div>
      <button class="btn ghost" data-delstory="1" style="color:#C8705A">${
        S.confirmDelete ? 'Press again to delete this story for good' : 'Delete this story'}</button>
      <div class="hint">${S.confirmDelete
        ? 'Every chapter, passage and ledger entry goes with it. Snapshots in backups/ still have it.'
        : 'Export it first if you might want it back.'}</div></div>`;
  },

  // The chapter you are writing, whole: its name, how it has to end, where the story is going,
  // what it proposed for the ledger, its branches, and closing it. Four rows became one.
  chapter() {
    const ch = V.currentChapter;
    const ps = V.proposals ?? [];
    return `<div style="display:flex; flex-direction:column">
      <label class="lbl">Name</label>
      <input class="field" data-chapter-title="1" value="${esc(ch.title ?? '')}"
        placeholder="Chapter ${ch.index}">
      <label class="lbl">This chapter must end with</label>
      <textarea class="field" data-chapter-note="1">${esc(ch.authorsNote ?? '')}</textarea>
      <div class="hint">Reaches the model as the chapter's brief. It is not shown to the reader.</div>
      <label class="lbl">Where this is going</label>
      <textarea class="field serif" data-story="direction" style="font-style:italic; font-size:15.5px;
        min-height:96px; line-height:1.6">${esc(V.story.direction ?? '')}</textarea>
      <div class="hint">Aims the story without disclosing it. Never restated to the reader.</div>
      <button class="btn" data-savestory="1" style="margin-top:14px">Save</button>
      <button class="btn ghost" data-ritual="1" style="margin-top:10px">${
        S.ritual ? esc(S.ritual) : 'End this chapter'}</button>
      <div class="hint">Closes it, summarises it, reads it for new facts, and opens the next.</div>

      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">What this chapter added</div>
      <div style="font-size:12.5px; line-height:1.55; color:#8A8478; margin-bottom:9px">Nothing here is canon until you accept it.</div>
      <div style="display:flex; flex-direction:column; gap:9px">
      ${ps.map((p) => {
        const tone = p.kind === 'new' ? 'var(--good)' : p.kind === 'conflict' ? '#C8705A' : 'var(--warn)';
        return `<div class="card" style="gap:8px">
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-size:14.5px; color:#F3ECE0">${esc(p.title)}</span>
            <span class="up" style="margin-left:auto; font-size:9.5px; letter-spacing:.14em; color:${tone}">${esc(p.kind)}</span></div>
          <div style="font-size:12.5px; line-height:1.45; color:#8A8478">${esc(p.delta || p.body)}</div>
          <div style="display:flex; gap:7px">
            <button data-decide="accept" data-id="${p.id}" style="flex:1; text-align:center; padding:8px 0;
              border-radius:9px; background:#D9B26A; color:#100D08; font-size:11.5px; font-weight:500">Accept</button>
            <button data-decide="reject" data-id="${p.id}" style="width:38px; text-align:center; padding:8px 0;
              border-radius:9px; border:1px solid #2A2721; color:#78726A; font-size:11.5px">✕</button></div></div>`;
      }).join('') || '<div class="hint" style="margin:0">Nothing proposed. Closing a chapter reads it for new facts.</div>'}
      <button class="btn ghost" data-extract="1" style="margin-top:6px">Read this chapter for facts</button></div>

      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Summaries in context</div>
      ${V.chapters.filter((c) => c.summary).map((c) => `<button class="card" aria-expanded="false"
        data-expand="1" style="margin-bottom:8px; text-align:left; width:100%">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(c.title || `Chapter ${c.index}`)}</span>
          <span style="margin-left:auto; font-size:11px; color:#78726A">covers to ${c.coversThrough ?? '—'}</span></div>
        <div class="clamp" style="font-size:12.5px; line-height:1.5; color:#8A8478">${esc(c.summary)}</div>
        ${c.summaryStale ? '<div class="hint" style="color:#C8705A">Stale — excluded from the prompt until it is re-run.</div>' : ''}
      </button>`).join('') || '<div class="hint">No summaries yet. Closing a chapter writes one.</div>'}
      <button class="btn ghost" data-summarize="1">Summarise this chapter</button>

      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Branches</div>
      <div style="display:flex; flex-direction:column; gap:9px">
      ${(V.branches ?? []).map((b) => `<div class="card" style="gap:6px;
        border-color:${b.active ? 'rgba(217,178,106,.34)' : '#2A2721'}">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(b.name)}${b.active ? ' · active' : ''}${
            b.isPrimary && b.name.toLowerCase() !== 'main' ? ' · main' : ''}</span>
          <span style="margin-left:auto; font-size:11px; color:#78726A">${
            b.forkOrdinal ? `from passage ${b.forkOrdinal}` : ''}</span></div>
        ${b.active ? '' : `<button data-branch="${b.id}" class="btn ghost" style="margin-top:4px">Switch to this branch</button>`}</div>`).join('')}
      </div>
      <div class="hint">Every read follows the active branch. Forking from a passage is on the
        passage's own menu.</div></div>`;
  },



  search() {
    // Inside a story, this searches THAT story. It used to span every book you own, which is the
    // wrong default in the one place you already know where you are — and it is how "add to the
    // lore book" could quietly put an entry in a different story's ledger.
    return `<div style="display:flex; flex-direction:column">
      <input class="field" id="q" value="${esc(S.query)}" placeholder="Search ${
        S.searchAll ? 'every story' : esc(V?.story.title ?? 'this story')}">
      <label style="display:flex; align-items:center; gap:8px; margin:10px 0 4px; font-size:12px; color:#8A8478">
        <input type="checkbox" id="searchAll" ${S.searchAll ? 'checked' : ''}>
        Look in my other stories too</label>
      <div class="hint" style="margin-bottom:14px">A LIKE scan over prose, entries and summaries. Fine at this size.</div>
      <div id="hits">${searchHits()}</div></div>`;
  },

  teller() {
    const g = V.gen ?? SRV.gen ?? {};
    const slider = (label, key, value, max, hint) => `
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px">
        <div style="display:flex; justify-content:space-between; font-size:11px; letter-spacing:.16em;
          text-transform:uppercase; color:#6E6961">
          <span>${label}</span><span class="tnum" style="color:#BCA97F">${value}</span></div>
        <input type="range" data-gen="${key}" min="0" max="${max}" step="${max > 2 ? 10 : 0.01}"
          value="${value}" style="width:100%; accent-color:#D9B26A">
        ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    return `<div style="display:flex; flex-direction:column">
      <div style="display:flex; align-items:flex-start; gap:12px; padding:0 0 4px">
        <span style="width:8px; height:8px; border-radius:50%; background:var(--warn); margin-top:5px; flex:0 0 auto"></span>
        <span style="flex:1; display:flex; flex-direction:column; gap:4px">
          <span style="font-size:13.5px; color:#EAE3D6">These are shared, not per story</span>
          <span class="hint" style="margin:0">The sampler is one object for the whole server, so changing
            temperature here changes it for every story and every writer on this machine. The route
            takes a story id, which makes it look per-story; it is not. Per-story sampling needs
            PLAN-02's <code>engine_config</code>, which was never built.</span></span></div>
      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Sampling</div>
      ${slider('Temperature', 'temperature', g.temperature ?? 0.85, 2,
        'Prose only. Structured roles run pinned at 0.2 — a loose sampler under a tight grammar writes valid JSON that says nothing.')}
      ${slider('Top-p', 'top_p', g.top_p ?? 0.95, 1, '')}
      ${slider('Max tokens', 'max_tokens', g.max_tokens ?? 900, 2000,
        'The ceiling on one passage. Raising it costs prefill on every call.')}
      <div style="display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-top:1px solid rgba(255,255,255,.04)">
        <span style="width:8px; height:8px; border-radius:50%; background:#C8705A; margin-top:5px; flex:0 0 auto"></span>
        <span style="flex:1; display:flex; flex-direction:column; gap:4px">
          <span style="font-size:13.5px; color:#EAE3D6">Thinking is off, and not a setting</span>
          <span class="hint" style="margin:0">With it on this model spent the whole budget reasoning and
            returned no prose on three runs in four. The transport pins it off.</span></span></div>
      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">This story's calls</div>
      ${(ACT?.runs ?? []).slice(0, 3).map((r) => `<div class="row">
        <span style="color:#EAE3D6">${esc(r.role ?? 'prose')}${r.error ? ' · failed' : ''}</span>
        <span class="tnum" style="margin-left:auto; color:#78726A">${
          r.promptTokens ? r.promptTokens.toLocaleString() + ' tok' : '—'}${
          r.prefillSeconds ? ` · ${r.prefillSeconds}s prefill` : ''}${
          r.seconds ? ` · ${r.seconds}s` : ''}</span></div>`).join('')
        || '<div class="hint">No calls logged for this story yet.</div>'}
      ${ACT?.worstPrefillSeconds ? `<div class="row"><span style="color:#EAE3D6">Worst prefill</span>
        <span class="tnum" style="margin-left:auto; color:#78726A">${ACT.worstPrefillSeconds}s</span></div>` : ''}
      <button class="btn" data-savegen="1" style="margin-top:16px">Save</button></div>`;
  },
};

/** The grouped, filtered list, kept out of canon() so a keystroke never rewrites the input. */
function ledgerBooks() {
  const q = S.ledgerQ.trim().toLowerCase();
  const kept = (LEDGER ?? []).filter((e) =>
    (S.ledgerKind === 'all' || e.entryType === S.ledgerKind) &&
    (!q || `${e.title} ${e.body} ${(e.keys || []).join(' ')}`.toLowerCase().includes(q)));
  const books = new Map();
  for (const e of kept) {
    if (!books.has(e.story)) books.set(e.story, { title: e.storyTitle, rows: [] });
    books.get(e.story).rows.push(e);
  }
  return [...books.entries()].map(([sid, b]) => `<div style="display:flex; flex-direction:column; gap:10px">
    <div style="display:flex; align-items:baseline; gap:10px">
      <span class="serif" style="font-size:21px; color:#F3ECE0">${esc(b.title)}</span>
      <span class="up" style="font-size:10px; color:var(--dim)">${b.rows.length} ${b.rows.length === 1 ? 'entry' : 'entries'}</span>
      <button data-open="${sid}" style="margin-left:auto; font-size:11px; letter-spacing:.14em;
        text-transform:uppercase; color:var(--gold)">Open story</button></div>
    <div class="grid">${b.rows.map(entryCard).join('')}</div></div>`).join('')
    || `<div class="hint">${q || S.ledgerKind !== 'all' ? 'Nothing matches that.' : 'No entries yet.'}</div>`;
}

/** Same reason: the search input must survive its own keystrokes. */
function searchHits() {
  if (HITS === null) return '';
  if (!HITS.length) return '<div class="hint">Nothing matched.</div>';
  // A hit knows what it IS, not just which story it is in: the id and the kind decide where
  // clicking lands you. Before, every result did the same thing — opened the story — so finding
  // the passage was the reader's job again.
  return HITS.map((r, i) => `<div style="display:flex; flex-direction:column; gap:5px; padding:11px 0;
    border-bottom:1px solid rgba(255,255,255,.04)">
    <button data-hit="${esc(r.storyId ?? '')}" data-hitid="${esc(r.id ?? '')}"
      data-hitkind="${esc(r.kind ?? 'Prose')}" style="display:flex; flex-direction:column; gap:5px;
      width:100%; text-align:left">
      <span style="display:flex; align-items:center; gap:10px; width:100%">
        <span class="kind" style="font-size:9.5px">${esc(r.kind ?? 'Prose')}</span>
        <span style="margin-left:auto; font-size:11px; color:#6E6961">${esc(r.where ?? '')}</span></span>
      <span style="font-size:13.5px; line-height:1.5; color:#EAE3D6">${esc((r.body ?? '').slice(0, 260))}</span></button>
    ${r.kind === 'Entry' ? '' : `<button data-tolore="${i}" style="align-self:flex-start; font-size:10.5px;
      letter-spacing:.14em; text-transform:uppercase; color:var(--gold); padding:2px 0">＋ Add to the lore book</button>`}
  </div>`).join('');
}

/** The skeleton spark returned, editable, with nothing written until it is accepted. */
function sparkReview() {
  const s = S.spark.story ?? {};
  const cast = S.spark.entries ?? [];
  const row = (k, label, value) => `<label class="lbl">${label}</label>
    <input class="field" data-sp="${k}" value="${esc(value ?? '')}">`;
  return `${row('title', 'Title', s.title)}
    ${row('genre', 'Genre', s.genre)}
    <label class="lbl">Premise</label>
    <textarea class="field" data-sp="premise" style="min-height:70px">${esc(s.premise ?? '')}</textarea>
    ${row('setting', 'Setting', s.setting)}
    ${row('pov', 'Point of view', s.pov)}
    <label class="lbl">Spice</label>
    <select class="field" data-sp="spice">${SPICE.map((l, i) =>
      `<option value="${i + 1}" ${Number(s.spice) === i + 1 ? 'selected' : ''}>${i + 1} &middot; ${l}</option>`).join('')}</select>
    <label class="lbl">Voice of the weave</label>
    <textarea class="field" data-sp="writingStyle" style="min-height:56px">${esc(s.writingStyle ?? '')}</textarea>
    <div class="lbl" style="letter-spacing:.26em; margin-top:18px">Cast &mdash; ${cast.length} proposed</div>
    ${cast.map((e, i) => `<div class="card" style="margin-bottom:7px">
      <div style="display:flex; align-items:center; gap:8px">
        <span style="font-size:14px; color:#F3ECE0">${esc(e.title)}</span>
        <span class="tag" style="margin-left:auto">${esc(e.activation === 'always_on' ? 'Always on' : 'Triggered')}</span></div>
      <div style="font-size:12.5px; line-height:1.45; color:#8A8478">${esc(e.body ?? '')}</div>
      <label style="display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--faint); margin-top:4px">
        <input type="checkbox" data-spcast="${i}" checked> keep this one</label></div>`).join('')}
    <button class="btn" data-accept-spark="1" style="margin-top:14px">Accept and start writing</button>
    <button class="btn ghost" data-drop-spark="1" style="margin-top:8px">Throw it back</button>
    <div class="hint">Nothing has been written yet. Accepting creates the story and its ledger.</div>`;
}

/** The new chapter's setup. Three fields, none of them new machinery: the beat is the chapter's
 *  author's note and already rides in DIRECTIVE; who is present is a force_in pin, which is what
 *  pins are actually for — "a fact that matters in a scene where nobody says its keyword"; and
 *  where is a pinned lore entry or the story's own setting. Skippable on purpose: a blank beat is
 *  a real choice, and some chapters are written to find out what happens. */
function setupPanel() {
  const ch = V?.currentChapter;
  if (!ch) return '<div class="hint">No chapter open.</div>';
  const pin = new Map((V.pins ?? []).filter((p) => p.chapterId === ch.id).map((p) => [p.entryId, p.mode]));
  // In this chapter or not, for every entry — including always-on ones. `force_out` is applied
  // FIRST in context.ts, before the always-on branch, so turning one off has always worked in the
  // engine; the panel simply never offered it and listed them as "no ticking needed" instead.
  const on = (e) => pin.get(e.id) === 'force_out' ? false
    : e.activation === 'always_on' ? true : pin.get(e.id) === 'force_in';
  const why = (e) => pin.get(e.id) === 'force_out' ? 'held back'
    : e.activation === 'always_on' ? 'always on' : pin.get(e.id) === 'force_in' ? 'pinned in'
    : 'on its keywords';

  const q = (S.setupQ ?? '').trim().toLowerCase();
  const match = (e) => !q || `${e.title} ${e.body} ${(e.keys ?? []).join(' ')}`.toLowerCase().includes(q);
  const row = (e, act) => `<button ${act === 'place' ? `data-place="${e.id}"` : `data-pin="${e.id}"`}
    style="display:flex; align-items:center;
    gap:10px; width:100%; padding:9px 11px; border-radius:11px; margin-bottom:5px; text-align:left;
    border:1px solid ${on(e) ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
    background:${on(e) ? 'rgba(217,178,106,.10)' : 'transparent'}">
    <span style="width:14px; flex:0 0 auto; color:${on(e) ? 'var(--gold)' : 'var(--faint)'}">${on(e) ? '✓' : '·'}</span>
    <span style="flex:1; min-width:0; font-size:13px; color:${on(e) ? '#EAE3D6' : 'var(--mute)'};
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(e.title)}</span>
    <span style="flex:0 0 auto; font-size:10px; letter-spacing:.12em; text-transform:uppercase;
      color:var(--label); opacity:.7">${why(e)}</span></button>`;

  const cast = V.entries.filter((e) => e.entryType === 'character' && match(e));
  const places = V.entries.filter((e) => (e.entryType === 'lore' || e.entryType === 'item') && match(e));
  const done = V.ritualDone;
  // Rendered from state, not from the DOM. Ticking a character repaints this panel, and reading
  // the inputs back afterwards found them freshly rebuilt and empty — so the beat you had just
  // typed was gone. Same fault as the search boxes and the click delegation, in a third place.
  const form = S.setup ?? { title: ch.title ?? '', note: ch.authorsNote ?? '' };
  return `<div style="display:flex; flex-direction:column">
    ${done ? `<div style="display:flex; flex-direction:column; gap:6px; padding-bottom:16px">
      ${done.map((line) => `<div style="display:flex; align-items:center; gap:9px; font-size:12.5px; color:#8A8478">
        <span style="width:6px; height:6px; border-radius:50%; background:var(--good); flex:0 0 auto"></span>
        ${esc(line)}</div>`).join('')}</div>` : ''}
    <div class="serif" style="font-size:21px; color:#F3ECE0">${esc(ch.title || `Chapter ${ch.index}`)}</div>
    <div class="hint" style="margin:6px 0 0">Nothing here is required. Leave it and write.</div>

    <label class="lbl">Title</label>
    <input class="field" data-setup="title" value="${esc(form.title)}" placeholder="Untitled">

    <label class="lbl">What happens next</label>
    <textarea class="field" data-setup="note" style="min-height:80px"
      placeholder="Where this chapter has to end up">${esc(form.note)}</textarea>
    <div class="hint">${form.note.trim() ? 'Rides near the generation point on every call.'
      : '<strong>Not set.</strong> Rides near the generation point when it is.'}</div>

    <label class="lbl">In this chapter</label>
    <input class="field" id="setupQ" value="${esc(S.setupQ ?? '')}"
      placeholder="Find someone or something in this story's ledger">

    <div class="lbl" style="letter-spacing:.2em; margin-top:14px; opacity:.8">Who</div>
    ${cast.length ? cast.map((e) => row(e, 'pin')).join('')
      : `<div class="hint" style="margin:0">${q ? 'Nobody matches that.' : 'No characters yet.'}</div>`}

    <div class="lbl" style="letter-spacing:.2em; margin-top:14px; opacity:.8">Where, and what</div>
    ${places.length ? places.map((e) => row(e, 'place')).join('')
      : `<div class="hint" style="margin:0">${q ? 'Nothing matches that.' : 'Nothing in the ledger yet.'}</div>`}

    <div class="hint">Ticked means it is sent for this chapter whether or not anyone says its name.
      Unticking an always-on entry holds it back for this chapter only. Both cost or save their
      canon on every call, so tick what is actually in the room.</div>
    <div class="hint">The story's setting is in the spine on every call regardless
      &mdash; ${esc(V.story.setting || 'not set')}.</div>

    <button class="btn" data-savesetup="1" style="margin-top:16px">Save and write</button>
    <button class="btn ghost" data-skipsetup="1" style="margin-top:8px">Skip &mdash; just write</button>
  </div>`;
}

function ctxTabs() {
  const t = (k, l) => `<button data-ctxview="${k}" style="flex:1; text-align:center; font-size:11.5px;
    padding:8px 0; border-radius:10px; border:1px solid ${S.ctxView === k ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
    background:${S.ctxView === k ? 'rgba(217,178,106,.12)' : 'transparent'};
    color:${S.ctxView === k ? '#E0C48C' : 'var(--mute)'}">${l}</button>`;
  return `<div style="display:flex; gap:6px; margin-bottom:14px">${t('blocks', 'Blocks')}${t('prompt', 'Prompt sent')}</div>`;
}

function entryEditor() {
  const e = V?.entries.find((x) => x.id === S.entryId);
  if (!e) return `<div class="hint">That entry is gone.</div>`;
  const chip = (on) => `border:1px solid ${on ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
    background:${on ? 'rgba(217,178,106,.12)' : 'transparent'}; color:${on ? '#E0C48C' : 'var(--mute)'}`;
  return `<div style="display:flex; flex-direction:column">
    <button class="btn ghost" data-backentry="1" style="margin-bottom:14px">&lsaquo; Back</button>
    <label class="lbl">Name</label>
    <input class="field" data-f="title" value="${esc(e.title ?? '')}">
    <label class="lbl">Type</label>
    <div style="display:flex; gap:6px">${KINDS.map((k) => `<button data-kind="${k}"
      style="flex:1; text-align:center; font-size:11.5px; padding:8px 0; border-radius:10px;
      ${chip(k === e.entryType)}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <label class="lbl">When it reaches the model</label>
    <div style="display:flex; gap:6px">${[['always_on', 'Always on'], ['triggered', 'On a keyword']]
      .map(([k, l]) => `<button data-act="${k}" style="flex:1; text-align:center; font-size:11.5px;
      padding:8px 0; border-radius:10px; ${chip(k === e.activation)}">${l}</button>`).join('')}</div>
    <label class="lbl">Info</label>
    <textarea class="field" data-f="body" style="min-height:96px">${esc(e.body ?? '')}</textarea>
    <div class="hint">This is what the model reads. Bracket form keeps it short: [Name: trait, trait].</div>
    <label class="lbl">Trigger words</label>
    <input class="field" data-f="keys" value="${esc((e.keys ?? []).join(', '))}"
      ${e.activation === 'always_on' ? 'disabled style="opacity:.5"' : ''}>
    <div class="hint">${e.activation === 'always_on'
      ? 'Always-on entries need none — they are sent on every call.'
      : 'Comma separated, up to ten. A whole word in recent prose or in your directive fires it.'}</div>
    <label class="lbl">Your notes</label>
    <textarea class="field" data-f="notes" style="min-height:64px">${esc(e.notes ?? '')}</textarea>
    <div class="hint">Never sent to the model. The engine's entry type has no such field.</div>
    <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Over time</div>
    <div class="hint" style="margin:0 0 8px">A fact can open at a later chapter. Before it opens it is
      hidden, or hinted at without saying what it is. Earlier chapters keep the body above.</div>
    ${(e.states ?? []).map((st) => `<div class="card" style="margin-bottom:8px">
      <div style="display:flex; align-items:center; gap:9px">
        <span class="kind">From chapter ${st.fromChapter}</span>
        <span style="margin-left:auto; font-size:9.5px; letter-spacing:.14em; text-transform:uppercase;
          color:var(--faint)">${esc(st.beforeMode ?? 'hide')} before</span>
        <button data-delstate="${st.id ?? ''}" style="color:#C8705A; font-size:12px" aria-label="Remove">✕</button></div>
      <div style="font-size:12.5px; line-height:1.45; color:#8A8478">${esc(st.body)}</div>
      ${st.label ? `<div class="hint" style="margin:2px 0 0">hint: ${esc(st.label)}</div>` : ''}</div>`).join('')}
    <div class="card" style="gap:7px">
      <div style="display:flex; gap:7px">
        <input class="field" data-st="fromChapter" type="number" min="1" placeholder="Chapter" style="width:96px">
        <select class="field" data-st="beforeMode">
          <option value="hide">hidden before</option>
          <option value="hint">hinted before</option>
        </select></div>
      <textarea class="field" data-st="body" placeholder="What is true from that chapter on" style="min-height:56px"></textarea>
      <input class="field" data-st="label" placeholder="If hinted, what the reader may sense">
      <button class="btn ghost" data-addstate="1">Add a change over time</button></div>
    ${S.fieldHistory ? `<div class="lbl" style="letter-spacing:.26em; margin-top:22px">Field history</div>
      ${S.fieldHistory.length ? S.fieldHistory.map((h) => `<div class="card" style="margin-bottom:8px">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(h.field)}</span>
          <span style="margin-left:auto; font-size:11px; color:var(--faint)">${h.replaced_at ? ago(h.replaced_at) : ''}${
            h.replaced_by ? ` &middot; ${esc(h.replaced_by)}` : ''}</span></div>
        <div class="clamp" style="font-size:12.5px; line-height:1.45; color:#8A8478">${esc(h.previous_value ?? '')}</div>
        <button class="btn ghost" data-revertfield="${h.id}" style="margin-top:6px">Put this back</button></div>`).join('')
        : '<div class="hint">No earlier versions of any field.</div>'}` : ''}
    <button class="btn" data-saveentry="1" style="margin-top:16px">Save</button>
    <button class="btn ghost" data-fieldhistory="1" style="margin-top:10px">${
      S.fieldHistory ? 'Hide field history' : 'Field history'}</button>
    <button class="btn ghost" data-delentry="1" style="margin-top:10px; color:#C8705A">Delete this entry</button>
  </div>`;
}

function historyPanel() {
  const rows = S.historyOf?.rows ?? [];
  const takes = S.historyOf?.takes ?? [];
  const pid = S.historyOf?.id;
  // Two histories, and only one of them used to be here. Regenerating writes a NEW take into the
  // slot; editing replaces text and writes a revision. This panel showed revisions only, so a
  // passage re-rolled five times reported "not been edited" and the takes were reachable only
  // through a stepper inside a hover tray.
  return `<div style="display:flex; flex-direction:column">
    <button class="btn ghost" data-backentry="1" style="margin-bottom:14px">&lsaquo; Back</button>

    <div class="lbl" style="letter-spacing:.26em; margin-top:0">${takes.length > 1
      ? `${takes.length} takes` : 'Takes'}</div>
    ${takes.length > 1 ? takes.map((t, i) => `<div class="card" style="margin-bottom:9px;
      border-color:${t.selected ? 'rgba(217,178,106,.34)' : '#2A2721'}">
      <div style="display:flex; align-items:center; gap:9px">
        <span class="kind">Take ${i + 1}${t.selected ? ' · in the story' : ''}</span>
        <span style="margin-left:auto; font-size:11px; color:#78726A">${
          t.author === 'human' ? 'yours' : 'Anansi'}${t.created_at ? ` · ${ago(t.created_at)}` : ''}</span></div>
      <div class="clamp" style="font-size:12.5px; line-height:1.5; color:#8A8478">${esc(t.body ?? '')}</div>
      ${(() => {
        // What canon was in the prompt that produced THIS take. Two takes in one slot came from
        // two different prompts — a keyword that fired for one and not the other changes what the
        // model knew — and nothing recorded which. Named from the current ledger, so renaming an
        // entry does not leave an old name frozen in a log.
        const names = (t.canon ?? []).map((id) => V.entries.find((e) => e.id === id)?.title)
          .filter(Boolean);
        if (!(t.canon ?? []).length) return '';
        return `<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:7px">
          <span style="font-size:10px; letter-spacing:.14em; text-transform:uppercase;
            color:var(--label); opacity:.7; align-self:center">Written against</span>
          ${names.map((nm) => `<span class="tag">${esc(nm)}</span>`).join('')
            || `<span class="tag">${t.canon.length} entries since removed</span>`}</div>`;
      })()}
      ${t.selected ? '' : `<button class="btn ghost" data-usetake="${t.id}" style="margin-top:8px">Put this one in the story</button>`}
    </div>`).join('')
      : '<div class="hint">One take. Regenerate on a passage keeps the old one and both appear here.</div>'}

    <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Edits</div>
    <div class="hint" style="margin:0 0 10px">Text that was replaced by hand. Restoring keeps the
      current version in the list too, so nothing is lost.</div>
    ${rows.map((r) => `<div class="card" style="margin-bottom:9px">
      <div class="kind">${r.replaced_at ? ago(r.replaced_at) : ''}</div>
      <div class="clamp" style="font-size:12.5px; line-height:1.5; color:#8A8478">${esc(r.body ?? '')}</div>
      <button class="btn ghost" data-restore="${r.id}" style="margin-top:8px">Restore this version</button>
    </div>`).join('') || '<div class="hint">No edits &mdash; this passage has not been changed by hand.</div>'}

    ${pid ? `<button class="btn ghost" data-fork="${pid}" style="margin-top:14px">Branch from this passage</button>
      <div class="hint">A branch copies the book up to here and leaves the original untouched.</div>` : ''}
  </div>`;
}

function entryCard(e) {
  const act = e.activation ?? 'always_on';
  const pill = act === 'always_on' ? 'Always on' : 'Triggered';
  const gold = act === 'always_on';
  return `<button class="card" data-entry="${e.id}" style="text-align:left; width:100%">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
      <span style="font-size:14.5px; color:#F3ECE0">${esc(e.title)}</span>
      <span class="tag" style="border-color:${gold ? 'rgba(217,178,106,.35)' : '#2A2721'};
        color:${gold ? '#D9B26A' : '#6E6961'}">${pill}</span></div>
    <div class="kind">${esc(e.entryType ?? 'lore')}</div>
    <div style="font-size:12.5px; line-height:1.45; color:#8A8478">${esc(e.body ?? '')}</div></button>`;
}

// ---------- workspace pages ----------
function drawPage() {
  const show = S.place === 'workspace';
  $('page').hidden = !show;
  $('read').hidden = show;
  if (!show) return;
  $('page').innerHTML = (WPAGES[S.wpage] ?? WPAGES.stories)();
}

const STATUS = { in_progress: 'Writing', draft: 'Draft', finished: 'Finished' };
// The pill is the genre when there is one, because that is the tag worth seeing on a shelf;
// status only shows when a story is finished or parked.
function storyCard(s, i, hero) {
  // Genre is comma-separated and always has been — an AI Dungeon import writes its tag list
  // straight into it, so a card read "horror, nsfw" inside a single pill. One tag per pill.
  const tags = String(s.genre ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  const gold = !!tags.length || s.status === 'in_progress';
  if (!tags.length) tags.push(STATUS[s.status] || 'Writing');
  return `<button class="storycard${hero ? ' hero' : ''}" data-open="${s.id}">
    <span class="art" style="display:block; height:${hero ? 190 : 130}px; background:${ART[i % ART.length]}">
      <span class="fade"></span>
      <span style="position:absolute; top:12px; left:14px; display:flex; gap:5px; flex-wrap:wrap;
        max-width:70%">${tags.map((t) => `<span class="tag" style="background:rgba(10,9,12,.6);
        ${gold ? 'border-color:rgba(217,178,106,.35); color:#D9B26A' : ''}">${esc(t)}</span>`).join('')}</span>
      ${hero ? '<span class="tag" style="position:absolute; top:12px; right:14px; background:rgba(10,9,12,.6)">Last written</span>' : ''}
      <span class="serif" style="position:absolute; bottom:12px; left:16px; right:16px;
        font-size:${hero ? 34 : 23}px; line-height:1.05; color:#F3ECE0">${esc(s.title)}</span></span>
    <span style="display:block; padding:14px 16px 16px">
      <span style="display:block; font-size:${hero ? 13.5 : 12.5}px; line-height:1.5; color:#8A8478;
        font-style:italic; min-height:19px">${esc((s.premise || 'No premise yet.').slice(0, hero ? 200 : 110))}</span>
      <span style="display:flex; align-items:center; gap:11px; margin-top:10px; font-size:11px; color:#78726A">
        <span>${s.chapters ?? 0} ${s.chapters === 1 ? 'chapter' : 'chapters'}</span>
        <span style="opacity:.5">·</span><span>${s.entries ?? 0} in the ledger</span>
        <span style="opacity:.5">·</span><span>${s.passages ?? 0} passages</span>
        <span style="margin-left:auto">${s.updated_at ? ago(s.updated_at) : ''}</span></span></span>
  </button>`;
}

const ART = [
  'radial-gradient(70% 90% at 25% 20%, rgba(150,105,195,.55), transparent 70%), linear-gradient(140deg,#221B2E,#0F0D14)',
  'radial-gradient(70% 90% at 30% 30%, rgba(70,150,160,.5), transparent 70%), linear-gradient(140deg,#101E22,#0B0D0F)',
  'radial-gradient(70% 90% at 20% 25%, rgba(170,60,70,.45), transparent 70%), linear-gradient(140deg,#20141A,#0C0A0C)',
];

const WPAGES = {
  stories() {
    if (!LIB.length) return `<div class="split"><div style="flex:1">
      <div class="serif" style="font-size:30px; color:#F3ECE0">Nothing yet</div>
      <div class="hint">Start one and it becomes the hero of this page.</div>
      <button class="btn" data-open="new" style="width:auto; padding:0 28px; height:48px; margin-top:16px">Create a story</button>
    </div></div>`;
    // listStories is ordered by updated_at, so the first row is the one written into last. It
    // gets the hero; adding a story is the next thing on the page, then the rest.
    const [hero, ...rest] = LIB;
    return `<div style="display:flex; flex-direction:column; gap:22px">
      ${storyCard(hero, 0, true)}
      <div class="grid">
        <button class="dashed" data-open="new" style="min-height:170px">＋ New story</button>
        ${rest.map((s, i) => storyCard(s, i + 1, false)).join('')}
      </div></div>`;
  },

  create() {
    // POST /api/spark returns { story, entries } — a skeleton, not a created story. The page used
    // to look for r.storyId, find nothing, and repaint: ten seconds of waiting for no visible
    // result. SPEC 8.1 wants the skeleton editable before anything is written, so it lands here.
    return `<div class="split">
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; max-width:640px">
        <div class="serif" style="font-size:30px; line-height:1.08; color:#F3ECE0">Hand him one thread</div>
        <div style="font-size:14px; line-height:1.65; color:#8A8478">Spark takes an idea and returns a skeleton.
          Every field stays editable, and the cast comes back as ledger entries you accept or drop.</div>
        <textarea id="idea" class="field serif" placeholder="Six houses have one winter to sign a peace none of them wants…"
          style="font-size:17px; line-height:1.6; min-height:130px"></textarea>
        <div class="hint">A sentence is enough. A paragraph is better.</div>
        <div style="display:flex; gap:12px; padding-top:6px; flex-wrap:wrap">
          <button class="btn" data-spark="1" style="width:auto; padding:0 28px; height:48px">Spark a skeleton</button>
          <button class="btn ghost" data-blank="1" style="width:auto; padding:0 24px; height:48px">Start blank</button></div>
      </div>
      <div class="aside" style="border:1px solid var(--edge); border-radius:18px; background:var(--rail); padding:20px 22px">
        <div class="lbl" style="letter-spacing:.26em">What comes back</div>
        ${S.spark ? sparkReview() : `${['Title', 'Genre', 'Point of view', 'Spice', 'Cast'].map((l) => `<div class="row">
          <span style="color:#EAE3D6">${l}</span>
          <span style="margin-left:auto; color:#78726A">&mdash;</span></div>`).join('')}
        <div class="hint" style="margin-top:4px">Nothing is written until you accept it.</div>`}</div></div>`;
  },

  canon() {
    if (LEDGER === null) { loadLedger(); return `<div class="hint">Reading the ledger…</div>`; }
    // Grouped by story, because a story IS the lorebook — entries are story-scoped in the schema
    // and there is no separate lorebook table. The search spans every story, which is the point:
    // it is for when you cannot remember which book an entry belongs to.
    // The filter bar is drawn once. Typing redraws #books only — rewriting the page on every
    // keystroke destroyed the input and swallowed the query, which is how "brass" found nothing.
    const chip = (on) => `border:1px solid ${on ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
      background:${on ? 'rgba(217,178,106,.12)' : 'transparent'}; color:${on ? '#E0C48C' : 'var(--mute)'}`;
    return `<div class="split" style="gap:28px">
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:16px">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          ${['all', ...KINDS].map((k) => `<button data-lkind="${k}" style="font-size:12px; padding:8px 16px;
            border-radius:999px; ${chip(k === S.ledgerKind)}">${k === 'all' ? 'Everything' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
          <input class="field" id="lq" value="${esc(S.ledgerQ)}" placeholder="Search every lorebook"
            style="margin-left:auto; max-width:280px">
        </div>
        <div id="books" style="display:flex; flex-direction:column; gap:16px">${ledgerBooks()}</div>
        ${V ? `<button class="dashed" data-newentry="lore" style="min-height:90px">New entry in ${esc(V.story.title)}</button>` : ''}
      </div>
      <div class="aside" style="border:1px solid var(--edge); border-radius:18px;
        background:var(--rail); padding:20px 22px">
        ${S.entryId && V ? entryEditor()
          : '<div class="hint" style="margin:0">Pick an entry to read or change it. Editing needs its story open — use Open story first.</div>'}
      </div></div>`;
  },

  import() {
    const I = S.imp, P = I.preview;
    const KINDS_IN = [['❐', 'Character card', 'V1, V2 and V3 cards, PNG or JSON'],
      ['❋', 'Anansi export', 'A story that left as a standalone .db'],
      ['↧', 'AI Dungeon', 'Story cards, or an adventure exported as markdown']];

    if (I.done) {
      const d = I.done;
      return `<div style="display:flex; flex-direction:column; gap:18px; max-width:640px">
        <div class="lbl" style="letter-spacing:.26em">Imported</div>
        <div class="serif" style="font-size:26px; color:#EAE3D6">${esc(d.source)}</div>
        <div class="row"><span style="color:#8A8478">Canon entries</span>
          <span class="tnum" style="margin-left:auto; color:#EAE3D6">${d.entries}${
            d.updated ? ` new, ${d.updated} updated` : ''}</span></div>
        <div class="row"><span style="color:#8A8478">Passages</span>
          <span class="tnum" style="margin-left:auto; color:#EAE3D6">${d.passages}</span></div>
        ${(d.notes ?? []).map((n) => `<div class="hint">${esc(n)}</div>`).join('')}
        <div style="display:flex; gap:10px; margin-top:6px">
          <button data-openimported="${esc(d.storyId)}" class="btn primary">Open the story</button>
          <button data-dropimport="1" class="btn">Import another</button></div></div>`;
    }

    if (P) {
      // Everything shown here comes from src/import.ts, which is the only parser. The screen
      // used to read files itself, so what it promised and what an import did were two
      // different programs — BUILD-STATE 3b.
      const into = LIB.find((x) => x.id === I.into);
      return `<div style="display:flex; flex-direction:column; gap:20px; max-width:900px">
        <div>
          <div class="lbl" style="letter-spacing:.26em">Read as</div>
          <div class="serif" style="font-size:26px; color:#EAE3D6">${esc(P.source)}</div>
          <div class="hint" style="margin-top:4px">${esc(I.name)} &mdash; nothing has been written yet.</div>
        </div>
        <div class="split" style="gap:26px">
          <div style="flex:1; min-width:0">
            <div class="lbl">${P.entries.length} canon ${P.entries.length === 1 ? 'entry' : 'entries'}</div>
            ${P.entries.length ? P.entries.map((e) => `<div class="row">
                <span style="color:#EAE3D6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(e.title)}</span>
                <span class="chip" style="flex:0 0 auto">${esc(e.entryType)}</span>
                <span style="display:flex; gap:4px; flex-wrap:wrap; flex:0 1 auto">${
                  e.activation === 'always_on'
                    ? '<span style="font-size:10.5px; color:#6E6961">always</span>'
                    : e.keys.length ? e.keys.map((k) => `<span class="tag">${esc(k)}</span>`).join('')
                    : '<span style="font-size:10.5px; color:#6E6961">no keys</span>'}</span>
                <span class="tnum" style="margin-left:auto; font-size:10.5px; color:#6E6961; flex:0 0 auto">${e.chars}c</span>
              </div>`).join('')
              : '<div class="hint" style="margin:0">None in this file.</div>'}
          </div>
          <div class="aside">
            <div class="lbl" style="letter-spacing:.26em">Prose</div>
            <div class="row"><span style="color:#EAE3D6">Passages</span>
              <span class="tnum" style="margin-left:auto; color:#78726A">${P.passages}</span></div>
            ${P.passages ? `<div class="row"><span style="color:#EAE3D6">Yours</span>
              <span class="tnum" style="margin-left:auto; color:#78726A">${P.human}</span></div>` : ''}
            ${P.opening ? `<div class="lbl" style="margin-top:18px">Opens with</div>
              <div style="font-size:12.5px; line-height:1.6; color:#8A8478">${esc(P.opening)}&hellip;</div>` : ''}
          </div>
        </div>
        ${(P.notes ?? []).map((n) => `<div class="hint">${esc(n)}</div>`).join('')}
        <div>
          <div class="lbl">Where it goes</div>
          <select id="impinto" class="field" style="max-width:460px">
            <option value=""${I.into ? '' : ' selected'}>A new story &mdash; ${esc(P.story?.title ?? 'untitled')}</option>
            ${LIB.map((x) => `<option value="${esc(x.id)}"${x.id === I.into ? ' selected' : ''}
              >Into ${esc(x.title)}</option>`).join('')}
          </select>
          <div class="hint">AI Dungeon exports one adventure as two files &mdash; the story cards and
            the prose. Bring the second one into the story the first one made, rather than ending up
            with two halves in the library. Entries match by title, so re-importing an edited card
            updates it instead of leaving two.</div>
        </div>
        <div style="display:flex; gap:10px">
          <button data-doimport="1" class="btn primary" ${I.busy ? 'disabled' : ''}>${
            I.busy ? 'Importing&hellip;' : into ? `Add to ${esc(into.title)}` : 'Create the story'}</button>
          <button data-dropimport="1" class="btn">Pick a different file</button></div></div>`;
    }

    return `<div style="display:flex; flex-direction:column; gap:22px; max-width:900px">
      <div class="grid">${KINDS_IN.map(([g, l, m]) => `
        <div style="border:1px solid var(--chip); border-radius:18px; padding:22px 20px;
          background:var(--rail); display:flex; flex-direction:column; gap:11px">
          <span class="serif" style="font-size:20px; color:#D9B26A">${g}</span>
          <span style="font-size:15px; color:#F3ECE0">${l}</span>
          <span style="font-size:12.5px; line-height:1.5; color:#8A8478">${m}</span></div>`).join('')}</div>
      <label id="impdrop" class="dashed" style="min-height:0; padding:44px; flex-direction:column;
        gap:8px; text-align:center; cursor:pointer">
        <input type="file" id="impfile" accept=".json,.png,.md,.markdown,.txt,.db" hidden>
        <span class="serif" style="font-size:22px; color:#EAE3D6">${
          I.busy ? 'Reading&hellip;' : 'Choose a file, or drop one here'}</span>
        <span style="font-size:12.5px; color:#78726A">You see what it would become before anything
          is written.</span></label></div>`;
  },

  prefs() {
    const slot = SRV.slot?.perSlot, global = SRV.slot?.global, slots = SRV.slot?.slots;
    return `<div class="split" style="max-width:1000px; gap:28px">
      <div style="flex:1; min-width:0">
        <div class="lbl">llama-server</div>
        <div class="field" style="font-family:ui-monospace,monospace">http://127.0.0.1:8080</div>
        <div style="display:flex; align-items:center; gap:9px; margin-top:10px">
          <span style="width:8px; height:8px; border-radius:50%; background:${slot ? 'var(--good)' : 'var(--warn)'}"></span>
          <span style="font-size:12px; color:#78726A">${slot ? 'Up' : 'Asleep or unreachable'}</span></div>
        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Model</div>
        ${S.models === null ? '<div class="hint" style="margin:0">Asking the router&hellip;</div>'
          : S.models.length === 0 ? '<div class="hint" style="margin:0">The router did not answer.</div>'
          : S.models.map((m) => `<button data-pickmodel="${esc(m.id)}" class="row"
              style="width:100%; text-align:left">
              <span style="width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${
                m.id === SRV.model ? '#D9B26A' : m.status === 'unloaded' ? '#3A372F' : 'var(--good)'}"></span>
              <span style="color:${m.id === SRV.model ? '#EAE3D6' : '#8A8478'}; font-family:ui-monospace,monospace;
                font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(m.id)}</span>
              <span style="margin-left:auto; font-size:10.5px; color:#6E6961">${esc(m.status)}</span></button>`).join('')}
        <div class="hint">Switching is process-wide, not per story &mdash; two writers share this server,
          so it changes for both. A sleeping model wakes on its first call.</div>
        <div class="hint">Sampling, voice and spice belong to each story — they live under Storyteller, inside the story.</div>
      </div>
      <div class="aside">
        <div class="lbl" style="letter-spacing:.26em">Slot</div>
        <div class="row"><span style="color:#EAE3D6">Context per writer</span>
          <span class="tnum" style="margin-left:auto; color:#78726A">${slot ? slot.toLocaleString() : '—'}</span></div>
        <div class="row"><span style="color:#EAE3D6">Canon cap</span>
          <span class="tnum" style="margin-left:auto; color:#78726A">45%</span></div>
        <div class="hint">${global && slots ? `${global.toLocaleString()} across ${slots} slots. The pool is
          shared, so two writers at full budget must both fit.` : ''}</div>
        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">This machine</div>
        <div class="row"><span style="color:#EAE3D6">Snapshots</span>
          <span style="margin-left:auto; color:#78726A">12 kept · every 30 min</span></div>
        <div class="hint">Snapshots land on the same disk. Off-machine backup is still on you.</div>
        <button class="btn ghost" data-backup="1" style="margin-top:14px">Snapshot now</button></div></div>`;
  },
};

// ---------- actions ----------
function syncHash() {
  const want = S.place === 'story' && S.storyId ? `#${S.storyId}${S.panel ? `/${S.panel}` : ''}` : '';
  if (location.hash !== want) history.replaceState(null, '', want || location.pathname);
}

function paint() {
  applyLook();
  root.dataset.uiRail = S.rail ? 'open' : 'closed';
  drawRail(); drawBar(); drawAppearance(); drawPage(); drawSide();
  if (S.place === 'story' && V) { drawDoc(); drawDock(); } else { $('dock').hidden = true; }
}

async function loadLedger() {
  const r = await api.ledger();
  LEDGER = r.error ? [] : (r.entries ?? []);
  if (S.wpage === 'canon') drawPage();
}

async function loadModels() {
  const r = await api.models();
  S.models = r.error ? [] : (r.models ?? []);
  if (r.active) SRV.model = r.active;
  if (S.wpage === 'prefs') drawPage();
}

async function loadLibrary() {
  const r = await api.library();
  if (r.error) return toast(r.error);
  LIB = r.stories ?? [];
  SRV = { model: r.model ?? null, slot: r.slot ?? null, gen: r.gen ?? {} };
}

async function openStory(id) {
  const r = await api.story(id);
  if (r.error) return toast(r.error);
  V = r; S.storyId = id; S.place = 'story';
  
  SRV = { model: r.model ?? SRV.model, slot: r.slot ?? SRV.slot, gen: r.gen ?? SRV.gen };
  if (!S.panel && !overlay()) S.panel = 'context';   // the hash may already have chosen one
  const a = await api.activity(id);
  ACT = a.error ? null : a;
  paint();
  refreshManifest();
}

/** The History panel holds its own copy of the passage's takes and edits, fetched when it was
 *  opened. Anything that changes the passage after that — a regenerate, an accept, an edit, a
 *  delete — left it showing what was true when you opened it. Edits appeared to update because
 *  reopening the panel refetches; takes did not, because you regenerate with the panel already
 *  open. The id survives: selecting another take flips `selected` but does not delete the row. */
/** Show that a call is in flight, and which one. A generation is 20-40 seconds against a local
 *  model; a composer that just goes quiet reads as a hung page. `kind` colours the bar, because
 *  the five actions do different things and the wait is long enough to forget which you pressed. */
function working(kind) {
  const el = $('working');
  if (!el) return;
  if (kind) { el.dataset.work = kind; el.hidden = false; }
  else { el.hidden = true; delete el.dataset.work; }
}

async function refreshHistory() {
  if (S.panel !== 'history' || !S.historyOf?.id) return;
  const h = await api.history({ story: S.storyId, passage: S.historyOf.id });
  if (h.error) return;
  S.historyOf = { ...S.historyOf, rows: h.passage ?? [], takes: h.takes ?? [] };
  drawSide();
}

async function refreshManifest() {
  if (!V) return;
  const r = await api.manifest({ storyId: S.storyId, mode: S.mode,
    directive: $('input')?.value || undefined,
    speaker: S.mode === 'speak' || S.mode === 'act' ? (S.speaker || V.story.persona || undefined) : undefined });
  if (!r.error) { MANI = r.manifest; PROMPT = r.prompt ?? ''; drawBar();
    if (S.panel === 'context') drawSide(); }
}

/** Clearing the value leaves the inline height behind, so a box grown by a long directive stayed
 *  tall and empty. */
function clearComposer() {
  const ta = $('input');
  if (!ta) return;
  ta.value = '';
  ta.style.height = '';
}

/** Send. `mode` is passed explicitly only by the Continue button, which is not a selected mode.
 *
 *  The split that matters: in Direct your text is an INSTRUCTION and is never written down. In
 *  Speak, Act and Narrate your text IS the next passage — it goes on the page as yours, and then
 *  the model answers it. Getting that wrong is what made typed dialogue disappear into the
 *  prompt: whatever mode you were in, your words only ever became a directive. */
async function generate(mode = S.mode) {
  if (S.busy || !V) return;
  const typed = $('input')?.value.trim() ?? '';
  const YOURS = mode === 'speak' || mode === 'act' || mode === 'narrate';
  // Who it is, for the prompt. Act does NOT set the passage's speaker column — that column
  // means "a named voice" and drives speech styling, and an action is narration.
  const who = mode === 'speak' || mode === 'act' ? (S.speaker || V.story.persona || undefined) : undefined;

  if (YOURS) {
    if (!typed) return toast(mode === 'narrate'
      ? 'Write the passage first — Narrate puts your own prose on the page.'
      : 'Type what you want to say first, or press Continue.');
    const w = await api.write(S.storyId, { body: typed, speaker: mode === 'speak' ? who : null });
    if (w.error) return toast(w.error);
    clearComposer();
    V = await api.story(S.storyId);
    paint();
  } else if (mode === 'direct' && !typed) {
    return toast('Say what happens next, or press Continue.');
  }

  S.busy = true; drawDock(); working(mode);
  // Your text is already on the page in the three modes above, so the model gets no directive —
  // it gets told whose line it is answering instead.
  const r = await api.generate({ storyId: S.storyId, mode,
    directive: YOURS ? undefined : (typed || undefined), speaker: who });
  if (r.error) { S.busy = false; drawDock(); working(null); return toast(r.error); }
  MANI = r.manifest;
  // Kept as it arrives. Discard and Keep are gone: a take you dislike is one ⋯ away from
  // Regenerate or Delete, and both keep the history, so nothing is lost by committing it.
  const a2 = await api.accept(S.storyId, { body: r.prose, genId: r.genId,
    directive: YOURS ? undefined : (typed || undefined) });
  S.busy = false; working(null);
  if (a2.error) return toast(a2.error);
  clearComposer();
  V = await api.story(S.storyId);
  paint(); refreshManifest(); refreshHistory();
}

/** Re-roll the last passage, keeping the old take as a variant. */
async function regenerateLast() {
  const last = V?.passages.filter((p) => !p.isBreak).at(-1);
  if (!last) return toast('Nothing to regenerate yet.');
  await regenerateInto(last.id);
}

async function regenerateInto(id) {
  if (S.busy) return;
  S.busy = true; drawDock(); drawBar(); working('reroll');
  const r = await api.generate({ storyId: S.storyId, mode: S.mode, regenerateOf: id,
    speaker: S.mode === 'speak' || S.mode === 'act' ? (S.speaker || V.story.persona || undefined) : undefined });
  if (r.error) { S.busy = false; drawDock(); drawBar(); working(null); return toast(r.error); }
  const a2 = await api.accept(S.storyId, { body: r.prose, genId: r.genId, variantOf: id });
  S.busy = false; working(null);
  if (a2.error) { drawDock(); drawBar(); return toast(a2.error); }
  V = await api.story(S.storyId);
  paint(); refreshManifest(); refreshHistory();
  toast('New take kept. Both are in History, with the canon each was written against.');
}



// ---------- one delegated listener ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest(ACTIONS);
  // <html> and <body> can never be an action. They carry the look and the rail state, and a
  // closest() that walked up to them turned every click in the app into a rail toggle.
  if (t === root || t === document.body) return;
  if (!t) { if (S.appearance && !e.target.closest('#appearance')) { S.appearance = false; drawAppearance(); drawBar(); } return; }
  const d = t.dataset;

  if (d.expand) { t.setAttribute('aria-expanded', t.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); return; }
  if (d.more) {
    const blk = t.closest('.block');
    const open = blk.getAttribute('aria-expanded') === 'true';
    for (const b of document.querySelectorAll('.block[aria-expanded="true"]')) b.setAttribute('aria-expanded', 'false');
    blk.setAttribute('aria-expanded', open ? 'false' : 'true');
    return;
  }
  if (d.rail !== undefined) { S.rail = !S.rail; paint(); return; }
  if (d.continue) { await generate('continue'); return; }
  if (d.nav) {
    if (S.place === 'story') { S.panel = PANEL_WAS[d.nav] ?? d.nav; S.entryId = null; S.historyOf = null; syncHash(); }
    else S.wpage = d.nav;
    if (overlay()) S.rail = false;
    paint();
    if (d.nav === 'search') $('q')?.focus();
    if (d.nav === 'prefs' && S.models === null) loadModels();
    return;
  }
  if (d.leave) { S.place = 'workspace'; S.wpage = 'stories'; S.panel = null; S.entryId = null;
    LEDGER = null; await loadLibrary(); paint(); return; }
  if (d.panel !== undefined) { S.panel = d.panel || null; syncHash(); paint(); return; }
  if (d.appearance !== undefined) { S.appearance = d.appearance === '1' ? !S.appearance : false; drawAppearance(); drawBar(); return; }
  if (d.theme) { look.theme = d.theme; applyLook(); drawAppearance(); return; }
  if (d.fontpick) { look.font = d.fontpick; applyLook(); drawAppearance(); return; }
  if (d.sizepick) { look.size = d.sizepick; applyLook(); drawAppearance(); return; }

  if (d.open === 'new') { S.place = 'workspace'; S.wpage = 'create'; paint(); return; }
  if (d.open) { await openStory(d.open); return; }
  if (d.chapter) { const r = await api.story(S.storyId, d.chapter); if (!r.error) { V = r; paint(); } return; }

  if (d.mode) {
    // Switching mode rebuilds the dock, which rebuilds the textarea. Carry what is typed across:
    // deciding "this is dialogue, not an instruction" after writing the line is the normal way
    // round, and losing the line for it is the seventh instance of this same repaint bug.
    const kept = $('input')?.value ?? '';
    S.mode = d.mode; drawDock();
    if (kept && $('input')) { $('input').value = kept; $('input').focus(); }
    refreshManifest(); return;
  }
  if (d.re) { await regenerateInto(d.re); return; }
  if (d.reroll !== undefined) { await regenerateLast(); return; }
  if (d.send) { await generate(); return; }   // the button's only path; ⌘↵ is the shortcut
  if (d.del) { const r = await api.delPassage(S.storyId, d.del); if (r.error) return toast(r.error);
    // The panel may be showing the very passage that just went.
    if (S.historyOf?.id === d.del) { S.historyOf = null; S.panel = 'context'; }
    V = await api.story(S.storyId); paint(); refreshHistory(); return; }
  if (d.vp || d.vn) { const p = V.passages.find((x) => x.id === (d.vp || d.vn)); const v = p?.variants ?? [];
    const at = v.findIndex((x) => x.selected); const next = v[at + (d.vn ? 1 : -1)];
    if (next) { await api.pickVariant(S.storyId, next.id); V = await api.story(S.storyId);
      paint(); refreshHistory(); } return; }
  if (d.flagx) {
    // Expanding is the common intent; dismissing is destructive, so it takes a modifier.
    if (e.shiftKey) { await api.dismissFlag(S.storyId, d.flagx); V = await api.story(S.storyId); paint(); }
    else t.setAttribute('aria-expanded', t.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    return;
  }

  if (d.entry) { S.entryId = d.entry; S.fieldHistory = null;
    if (S.place === 'story' && S.panel !== 'threads') S.panel = 'entry';
    paint(); return; }
  if (d.backentry) { S.entryId = null; S.historyOf = null;
    if (S.panel === 'entry' || S.panel === 'history') S.panel = 'threads';
    paint(); return; }
  if (d.newentry) {
    const r = await api.saveEntry(S.storyId, { id: '', title: 'Untitled',
      body: '[Untitled: ]', entryType: d.newentry, activation: 'always_on', keys: [] });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId);
    // saveEntry does not report the new id, so take the newest row of that name.
    S.entryId = V.entries.filter((x) => x.title === 'Untitled').at(-1)?.id ?? null;
    if (S.place === 'story' && S.panel !== 'threads') S.panel = 'entry';
    paint(); return;
  }
  if (d.kind || d.act) {
    // Type and activation are chips, so they save immediately rather than waiting for Save —
    // the trigger-words field enables and disables on activation and must repaint to show it.
    const e = V.entries.find((x) => x.id === S.entryId); if (!e) return;
    const patch = { ...e, id: e.id, keys: e.keys ?? [] };
    if (d.kind) patch.entryType = d.kind; else patch.activation = d.act;
    const r = await api.saveEntry(S.storyId, patch);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest(); return;
  }
  if (d.saveentry) {
    const e = V.entries.find((x) => x.id === S.entryId); if (!e) return;
    const get = (f) => document.querySelector(`[data-f="${f}"]`)?.value;
    const keys = String(get('keys') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const r = await api.saveEntry(S.storyId, { ...e, id: e.id, title: get('title') ?? e.title,
      body: get('body') ?? e.body, notes: get('notes') ?? e.notes, keys });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); toast('Saved.'); refreshManifest(); return;
  }
  if (d.delentry) {
    const r = await api.delEntry(S.storyId, S.entryId);
    if (r.error) return toast(r.error);
    S.entryId = null; if (S.panel === 'entry') S.panel = 'threads';
    V = await api.story(S.storyId); paint(); refreshManifest(); return;
  }

  // --- edit: the passage is already contenteditable and saves on blur. This puts the caret in it.
  if (d.ed) {
    const el = document.querySelector(`[data-edit="${d.ed}"]`);
    if (!el) return;
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    toast('Editing. Click away to save.');
    return;
  }

  // --- history
  if (d.hi) {
    const r = await api.history({ story: S.storyId, passage: d.hi });
    if (r.error) return toast(r.error);
    S.historyOf = { id: d.hi, rows: r.passage ?? [], takes: r.takes ?? [] };
    S.panel = 'history'; paint(); return;
  }
  if (d.usetake) {
    const r = await api.pickVariant(S.storyId, d.usetake);
    if (r.error) return toast(r.error);
    V = r.passages ? r : await api.story(S.storyId);
    S.historyOf = { ...S.historyOf, id: d.usetake };
    paint(); await refreshHistory();
    toast('That take is in the story now.'); return;
  }
  if (d.restore) {
    const r = await api.revert({ storyId: S.storyId, passageId: S.historyOf?.id, revisionId: d.restore });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); S.panel = 'context'; S.historyOf = null;
    paint(); toast('Restored.'); return;
  }
  if (d.fork) {
    const r = await api.fork(S.storyId, d.fork, `from ${new Date().toLocaleDateString()}`);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); S.panel = 'chapter'; S.historyOf = null;
    paint(); toast('Branched. You are on the new branch.'); return;
  }

  // --- a search hit belongs to a story, which may not be the open one
  if (d.hit !== undefined) {
    const id = t.dataset.hitid || '', kind = (t.dataset.hitkind || 'Prose').toLowerCase();
    if (d.hit && d.hit !== S.storyId) await openStory(d.hit);
    if (!id) return;
    if (kind === 'entry') { S.entryId = id; S.panel = 'threads'; syncHash(); paint(); return; }
    if (kind === 'summary') { S.panel = 'chapter'; syncHash(); paint(); return; }
    // Prose. Mark it, redraw the document so the mark lands, then bring it into view. The mark
    // clears itself: a permanent highlight on whatever you last searched for becomes furniture.
    S.found = id;
    // The document shows one chapter now, so a hit in another one is not on the page at all.
    // Focus its chapter first, or the mark is drawn into a chapter you are not looking at.
    const hit = (V.passages ?? []).find((p) => p.id === id);
    if (hit && hit.chapterId !== V.currentChapter.id) {
      const r = await api.story(S.storyId, hit.chapterId);
      if (!r.error) V = r;
    }
    S.panel = null; syncHash(); paint();
    const el = document.querySelector(`.block.found`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else toast('That passage is on another branch.');
    clearTimeout(foundT);
    foundT = setTimeout(() => { S.found = null; if (V) drawDoc(); }, 6000);
    return;
  }
  if (d.tolore !== undefined) {
    const r = (HITS ?? [])[Number(d.tolore)];
    if (!r) return;
    if (r.storyId !== S.storyId) await openStory(r.storyId);
    // Named from the text so it is findable, and opened straight away so it gets finished. It
    // lands as triggered-with-no-keys deliberately: an always-on entry made from a highlight
    // would quietly cost tokens on every call from now on, before anyone had looked at it.
    const body = String(r.body ?? '').trim().slice(0, 600);
    const title = (body.split(/[.!?\n]/)[0] || body).trim().slice(0, 48) || 'Untitled';
    const res = await api.saveEntry(S.storyId, { id: '', title, body, entryType: 'lore',
      activation: 'triggered', keys: [], lastEditor: 'human' });
    if (res.error) return toast(res.error);
    V = res.entries ? res : await api.story(S.storyId);
    const made = [...(V.entries ?? [])].reverse().find((e) => e.title === title);
    S.entryId = made?.id ?? null; S.panel = 'threads'; syncHash(); paint();
    toast('Added to the lore book. Give it trigger words so it fires.');
    return;
  }

  // --- the model is process-wide, so this is a Preferences action
  if (d.pickmodel) {
    if (d.pickmodel === SRV.model) return;
    const r = await api.setModel(d.pickmodel);
    if (r.error) return toast(r.error);
    SRV.model = r.active; paint(); toast(`Now writing with ${r.active}.`); return;
  }

  if (d.lkind) { S.ledgerKind = d.lkind; drawPage(); return; }
  if (d.ctxview) { S.ctxView = d.ctxview; drawSide(); return; }
  if (d.goblock !== undefined) {
    const [kind, id] = d.goblock.split(':');
    if (kind === 'entry' && id) { S.entryId = id; S.panel = 'entry'; }
    else if (kind === 'traj') S.panel = 'chapter';
    else if (kind === 'story') S.panel = 'story';
    else { S.panel = null; }
    syncHash(); paint(); return;
  }

  if (d.addstate) {
    const get = (f) => document.querySelector(`[data-st="${f}"]`)?.value;
    const from = Number(get('fromChapter'));
    if (!from || !String(get('body') ?? '').trim()) return toast('A chapter number and a body, at least.');
    const r = await api.saveState(S.storyId, S.entryId,
      { fromChapter: from, body: get('body'), beforeMode: get('beforeMode'), label: get('label') || null });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest(); toast('Added.'); return;
  }
  if (d.delstate !== undefined) {
    if (!d.delstate) return toast('That change has no id to remove.');
    const r = await api.delState(S.storyId, d.delstate);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest(); return;
  }
  if (d.fieldhistory) {
    if (S.fieldHistory) { S.fieldHistory = null; paint(); return; }
    const r = await api.history({ story: S.storyId, entry: S.entryId });
    if (r.error) return toast(r.error);
    S.fieldHistory = r.entry ?? []; paint(); return;
  }
  if (d.revertfield) {
    const r = await api.revertField({ storyId: S.storyId, entryId: S.entryId, revisionId: d.revertfield });
    if (r.error) return toast(r.error);
    S.fieldHistory = null; V = await api.story(S.storyId);
    paint(); refreshManifest(); toast('Put back.'); return;
  }
  if (d.exportdb) {
    const r = await api.exportStoryDb(S.storyId);
    toast(r.error ?? `Written to ${r.file}`); return;
  }
  if (d.delstory) {
    if (!S.confirmDelete) { S.confirmDelete = true; paint();
      setTimeout(() => { if (S.confirmDelete) { S.confirmDelete = false; paint(); } }, 6000); return; }
    const r = await api.deleteStory(S.storyId);
    if (r.error) return toast(r.error);
    S.confirmDelete = false; S.place = 'workspace'; S.wpage = 'stories';
    S.storyId = null; V = null; LEDGER = null;
    await loadLibrary(); paint(); toast('Deleted.'); return;
  }

  if (d.pin !== undefined || d.place !== undefined) {
    const id = d.pin ?? d.place;
    const e = V.entries.find((x) => x.id === id);
    const mode = (V.pins ?? []).find((p) => p.chapterId === V.currentChapter.id && p.entryId === id)?.mode;
    // One control, two mechanisms, because "in this chapter" means different things depending on
    // how the entry reaches the prompt. A triggered entry is pushed IN with force_in; an always-on
    // one is already in, so the only move is to hold it OUT with force_out. context.ts applies
    // force_out before the always-on branch, so this has always worked — nothing offered it.
    const next = e?.activation === 'always_on'
      ? (mode === 'force_out' ? null : 'force_out')
      : (mode === 'force_in' ? null : 'force_in');
    const r = await api.setPin(S.storyId, V.currentChapter.id, id, next);
    if (r.error) return toast(r.error);
    const done = V.ritualDone;
    V = await api.story(S.storyId); V.ritualDone = done;
    paint(); refreshManifest(); return;
  }
  if (d.savesetup) {
    const title = S.setup?.title ?? document.querySelector('[data-setup="title"]')?.value ?? '';
    const note = S.setup?.note ?? document.querySelector('[data-setup="note"]')?.value ?? '';
    const r = await api.saveChapter(S.storyId, V.currentChapter.id, { title, authorsNote: note });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId);
    S.setup = null; S.panel = 'context'; syncHash(); paint(); refreshManifest();
    toast(note.trim() ? 'Set. Write when ready.' : 'Saved. No beat set, which is fine.');
    return;
  }
  if (d.skipsetup) { S.setup = null; S.panel = 'context'; syncHash(); paint(); return; }

  if (d.savestory) {
    const patch = {};
    document.querySelectorAll('[data-story]').forEach((el) => { patch[el.dataset.story] = el.value; });
    // The sixth spice option is a switch, not a level. On `custom` the stored level is left alone
    // and the written line is what the engine reads; on a level the written line is cleared, or it
    // would go on silently overriding the level the writer just chose.
    if (patch.spice === 'custom') delete patch.spice;
    else if (patch.spice !== undefined) patch.spiceNote = '';
    const r = await api.saveStory(S.storyId, patch);
    if (r.error) return toast(r.error);
    const ct = document.querySelector('[data-chapter-title]'), cn = document.querySelector('[data-chapter-note]');
    if (ct) await api.saveChapter(S.storyId, V.currentChapter.id, { title: ct.value, authorsNote: cn?.value ?? '' });
    V = await api.story(S.storyId); paint(); toast('Saved.'); refreshManifest(); return;
  }
  if (d.ritual) {
    if (S.ritual) return;                       // already running
    working('reroll');
    const closing = V.currentChapter;
    // Step 1 and 2 are one call: the route summarises on close by itself, deliberately —
    // "on close rather than on a button nobody remembers".
    S.ritual = 'Closing and summarising…'; paint();
    const r = await api.endChapter(S.storyId, {});
    if (r.error) { S.ritual = null; working(null); paint(); return toast(r.error); }
    V = await api.story(S.storyId);
    const summary = V.chapters.find((c) => c.id === closing.id)?.summary;
    const steps = [summary ? `Summarised ${closing.title || 'the chapter'} in ${summary.split(/\s+/).length} words`
                           : 'Closed, but the summary did not come back'];

    // Step 3: read it for facts. Nothing is accepted — SPEC 8.2, and it is the rule that makes
    // the ledger worth trusting.
    S.ritual = 'Reading it for new facts…'; paint();
    const x = await api.extract(S.storyId, closing.id);
    steps.push(x.error ? `Could not read it for facts: ${x.error}`
      : `${x.added ?? 0} proposed for the ledger — nothing accepted yet`);

    // Step 4: the next chapter's setup, skippable.
    V = await api.story(S.storyId);
    V.ritualDone = steps;
    S.ritual = null; working(null);
    S.panel = 'setup';
    syncHash(); paint(); refreshManifest();
    return;
  }
  if (d.summarize) { toast('Summarising…'); const r = await api.summarize(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error); V = await api.story(S.storyId); paint(); return; }
  if (d.extract) { toast('Reading the chapter…'); const r = await api.extract(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error); V = await api.story(S.storyId); paint();
    toast(`${r.added ?? 0} proposed.`); return; }
  if (d.decide) {
    // The route branches on `accept`, not on a verb. Sending `decision: 'accept'` left
    // c.body.accept undefined, so Accept took the reject path and threw the fact away.
    const r = await api.decide({ storyId: S.storyId, id: d.id, accept: d.decide === 'accept' });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest();
    toast(d.decide === 'accept' ? 'Accepted into the ledger.' : 'Dropped.');
    return;
  }
  if (d.branch) { const r = await api.switchBranch(S.storyId, d.branch); if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); return; }

  if (d.spark) {
    const idea = $('idea')?.value.trim();
    if (!idea) return toast('Give him a thread first.');
    toast('Spinning…');
    const r = await api.spark(idea);
    if (r.error) return toast(r.error);
    // A skeleton, not a story. It goes on screen to be edited or thrown back.
    S.spark = { story: r.story ?? {}, entries: r.entries ?? [] };
    paint();
    toast(`${(r.entries ?? []).length} in the cast. Nothing written yet.`);
    return;
  }
  if (d.dropSpark) { S.spark = null; paint(); return; }
  if (d.acceptSpark) {
    const get = (k) => document.querySelector(`[data-sp="${k}"]`)?.value;
    const keep = [...document.querySelectorAll('[data-spcast]')]
      .filter((c) => c.checked).map((c) => S.spark.entries[Number(c.dataset.spcast)]).filter(Boolean);
    const r = await api.createStory({
      title: get('title') || 'Untitled', genre: get('genre'), premise: get('premise'),
      setting: get('setting'), pov: get('pov'), spice: Number(get('spice')) || 2,
      writingStyle: get('writingStyle'), entries: keep,
    });
    if (r.error) return toast(r.error);
    S.spark = null;
    await loadLibrary();
    await openStory(r.id);
    toast(`Created with ${keep.length} in the ledger.`);
    return;
  }
  if (d.blank) { const r = await api.createStory({ title: 'Untitled' }); if (r.error) return toast(r.error);
    await loadLibrary(); await openStory(r.id ?? r.storyId); return; }
  if (d.backup) { const r = await api.backup(S.storyId ?? LIB[0]?.id); toast(r.error ?? 'Snapshot written.'); return; }
  if (d.dropimport) { S.imp = { name: null, data: null, preview: null, into: '', busy: false, done: null }; drawPage(); return; }
  if (d.openimported) { await openStory(d.openimported); return; }
  if (d.doimport) {
    if (!S.imp.data || S.imp.busy) return;
    S.imp.busy = true; drawPage();
    const r = await api.runImport(S.imp.name, S.imp.data, S.imp.into);
    S.imp.busy = false;
    if (r.error) { drawPage(); return toast(r.error); }
    await loadLibrary();
    // The bytes are dropped here. Holding a 1.6MB base64 string in state after it has been
    // written is the kind of thing that makes a long session feel haunted.
    S.imp = { ...S.imp, done: r, preview: null, data: null };
    drawPage();
    return;
  }
  if (d.savegen) {
    const gen = {};
    document.querySelectorAll('[data-gen]').forEach((el) => { gen[el.dataset.gen] = Number(el.value); });
    const r = await api.settings(S.storyId, gen); toast(r.error ?? 'Saved.'); return;
  }
});

$('scrim').addEventListener('click', () => { S.rail = false; paint(); });
$('side').addEventListener('click', (e) => { if (phone() && e.target === $('side')) { S.panel = null; paint(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (S.appearance) { S.appearance = false; drawAppearance(); drawBar(); } else if (S.panel && overlay()) { S.panel = null; paint(); } }
});
// A picked file is read here and parsed on the SERVER. The client deliberately has no parser
// of its own: two importers was the conflict BUILD-STATE 3b recorded, and the tested one wins.
async function readImport(f) {
  if (!f) return;
  S.imp = { name: f.name, data: null, preview: null, into: '', busy: true, done: null };
  drawPage();
  const data = await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => res(null);
    r.readAsDataURL(f);
  });
  S.imp.busy = false;
  if (!data) { drawPage(); return toast('could not read that file'); }
  const p = await api.importPreview(f.name, data);
  if (p.error) { drawPage(); return toast(p.error); }
  S.imp = { ...S.imp, data, preview: p };
  drawPage();
}

document.addEventListener('change', (e) => {
  if (e.target.dataset?.story === 'spice') {
    const box = $('spiceCustom');
    if (box) box.hidden = e.target.value !== 'custom';
    return;
  }
  // Never redraws the dock: the placeholder is the only thing that depends on this, and a
  // repaint here would empty the line you are part-way through writing.
  if (e.target.id === 'searchAll') {
    S.searchAll = e.target.checked;
    const q = $('q');
    if (q) q.placeholder = `Search ${S.searchAll ? 'every story' : (V?.story.title ?? 'this story')}`;
    if (S.query.trim()) api.search(S.query, S.searchAll ? undefined : S.storyId)
      .then((r) => { HITS = r.error ? [] : (r.results ?? []); if ($('hits')) $('hits').innerHTML = searchHits(); });
    return;
  }
  if (e.target.id === 'asWhom') {
    S.speaker = e.target.value || null;
    const [, , ph] = MODES.find((m) => m[0] === S.mode) ?? MODES[0];
    if ($('input')) $('input').placeholder = ph(S.speaker || V?.story.persona || 'you');
    refreshManifest();
    return;
  }
  if (e.target.id === 'impfile') { readImport(e.target.files?.[0]); return; }
  if (e.target.id === 'impinto') { S.imp.into = e.target.value; drawPage(); }
});
// The drop target is dashed and says "drop one here", so it accepts drops. dragover must be
// prevented or the browser navigates to the file instead of handing it over.
document.addEventListener('dragover', (e) => { if (e.target.closest?.('#impdrop')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!e.target.closest?.('#impdrop')) return;
  e.preventDefault();
  readImport(e.dataTransfer?.files?.[0]);
});

document.addEventListener('input', (e) => {
  // Neither branch may redraw its own input. Both write only their results container.
  if (e.target.id === 'setupQ') {
    S.setupQ = e.target.value;
    // drawSide rebuilds the whole panel including this box, so restore the caret rather than
    // repainting blind — the eighth instance of this same repaint-eats-input fault.
    const at = e.target.selectionStart;
    drawSide();
    const box = $('setupQ');
    if (box) { box.focus(); box.setSelectionRange(at, at); }
    return;
  }
  if (e.target.dataset?.setup) {
    S.setup = { title: document.querySelector('[data-setup="title"]')?.value ?? '',
                note: document.querySelector('[data-setup="note"]')?.value ?? '' };
    return;
  }
  if (e.target.id === 'lq') {
    S.ledgerQ = e.target.value;
    if ($('books')) $('books').innerHTML = ledgerBooks();
    return;
  }
  if (e.target.id === 'q') {
    S.query = e.target.value;
    clearTimeout(searchT);
    searchT = setTimeout(async () => {
      const r = await api.search(S.query, S.searchAll ? undefined : S.storyId);
      HITS = r.error ? [] : (r.results ?? []);
      if ($('hits')) $('hits').innerHTML = searchHits();
    }, 220);
  }
});
document.addEventListener('blur', async (e) => {
  const id = e.target?.dataset?.edit;
  if (!id || id === 'pending') return;
  const body = e.target.textContent;
  const p = V?.passages.find((x) => x.id === id);
  if (!p || p.body === body) return;
  const r = await api.editPassage(S.storyId, id, body);
  if (r.error) return toast(r.error);
  V = await api.story(S.storyId);
  refreshHistory();
}, true);
matchMedia('(max-width:1099px)').addEventListener('change', () => { S.rail = !overlay(); paint(); });

// ---------- boot ----------
// #<storyId> opens a story; #<storyId>/<panel> opens it with that panel showing. Deep links
// are how a panel gets shared, bookmarked, or screenshotted.
function readHash() {
  const [id, panel] = location.hash.slice(1).split('/');
  // The old name is mapped BEFORE the validity check, not after. The check is against the current
  // TITLES, so a retired name was dropped to null here and then quietly replaced by the default
  // panel — which made the alias downstream dead code for the one case it exists for.
  const to = panel && (PANEL_WAS[panel] ?? panel);
  return { id, panel: to && TITLES[to] ? to : null };
}

async function route() {
  const { id, panel } = readHash();
  if (id && LIB.some((s) => s.id === id)) {
    if (panel) S.panel = panel;   // readHash has already mapped any retired name
    if (S.storyId === id) { paint(); } else { await openStory(id); }
  } else { S.place = 'workspace'; S.storyId = null; V = null; paint(); }
}

// Changing only the hash does not reload, so a pasted deep link into an open tab did nothing.
window.addEventListener('hashchange', route);

(async () => {
  applyLook();
  await loadLibrary();
  await route();
})();
