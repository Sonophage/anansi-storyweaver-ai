// One responsive surface. Replaces the separate desk and phone clients: the design puts the
// rail, the document and the 400px side panel in one shell, and turns the panel into a bottom
// sheet on a phone. Layout lives in app.html's CSS — this file decides state and content only,
// so a repaint does not rewrite every element's inline style.
import { api } from './api.js';
import { MODES, KINDS, SPICE, STORY_FIELDS, isSpeech, ago, esc, BLOCK_COLOR, BLOCK_ORIGIN, modelName, glyph, still, glyphRun } from './model.js';

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
  entryId: null, historyOf: null, models: null, allow: [], stats: null, ledgerKind: 'all', ledgerQ: '', ctxView: 'blocks',
  fieldHistory: null, confirmDelete: false, confirmDel: null, confirmStop: false, router: null, spark: null, ritual: null, setup: null,
  imp: { name: null, data: null, preview: null, into: '', busy: false, done: null },
  prompts: null,        // { defaults, yours } once fetched; the open editor is `promptOpen`
  promptOpen: null,
  found: null,          // the passage a search result sent you to, marked until you move on
  searchAll: false,     // inside a story, search that story only unless asked otherwise
  setupQ: '',           // filter over the ledger on the next-chapter setup page
  lore: null,           // the + Lore tray above the composer, when it is open
  talk: { turns: [], busy: false, search: false, draft: null, searchable: null },
  blank: null,          // the Start blank form, when it is open
};
let LIB = [], V = null, MANI = null, ACT = null, HITS = null, LEDGER = null, PROMPT = '';
let MANIERR = null;   // why there is no manifest, when there is none
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
//   threads   every thread in this story — characters, lore, items, rules. One word for one
//             thing: DECISIONS 6. 'Canon' stays the ENGINE's word, and shows only in Context.
//   context   what the model is about to be sent, and why
const SNAV = [
  ['story', '⚙', 'Story'], ['chapter', '❧', 'Chapter'],
  ['threads', '☙', 'Threads'], ['context', '◈', 'Context'],
  ['search', '⌕', 'Search'], ['teller', '◐', 'Storyteller'],
  ['anansi', '✻', 'Anansi'],
];
// Deep links and bookmarks still carry the old names, and so does a browser tab left open across
// the change. Cheaper to map them than to serve a blank panel.
const PANEL_WAS = { inspector: 'context', cast: 'threads', traj: 'chapter', queue: 'chapter', branches: 'chapter' };
const WNAV = [
  ['stories', '❋', 'My stories'], ['create', '✎', 'Create a story'],
  ['canon', '◈', 'Threads'], ['import', '↧', 'Import'], ['prefs', '◐', 'Preferences'],
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
    return ['Threads', LEDGER === null ? 'reading…'
      : `${n} ${n === 1 ? 'thread' : 'threads'} across ${books} ${books === 1 ? 'story' : 'stories'}`];
  },
  import: () => ['Import', 'Character cards, Anansi exports, AI Dungeon'],
  prefs: () => ['Preferences', 'llama-server, model, slot'],
};

// One list, so a new action cannot be added to the markup and forgotten here — and so the
// names are visible in one place next to the data-ui-* look attributes they must not collide with.
const ACTIONS = ['nav', 'rail', 'leave', 'open', 'chapter', 'panel', 'appearance', 'theme',
  'fontpick', 'sizepick', 'mode', 're', 'del', 'ed', 'hi', 'vp', 'vn', 'flagx',
  'savestory', 'summarize', 'extract', 'decide', 'branch', 'newentry', 'entry',
  'spark', 'blank', 'backup', 'savegen', 'hit', 'expand', 'saveentry', 'delentry', 'backentry',
  'kind', 'act', 'pickmodel', 'fork', 'restore', 'more', 'lkind', 'ctxview', 'goblock', 'invent',
  'editprompt', 'saveprompt', 'resetprompt', 'rollup', 'delarc',
  'reroll', 'addstate', 'delstate', 'fieldhistory', 'revertfield', 'exportdb',
  'delstory', 'send', 'accept-spark', 'drop-spark', 'ritual', 'pin', 'place', 'savesetup',
  'skipsetup', 'doimport', 'dropimport', 'openimported',
  'continue', 'tolore', 'usetake', 'newlore', 'lorekind', 'loreread',
  'dropblank', 'makeblank', 'addoutfit', 'deloutfit', 'wear', 'storymodel', 'router',
  'ask', 'usedraft', 'copydraft', 'clearchat'].map((k) => `[data-${k}]`).join(',');

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
      <span class="serif" style="font-size:15px; width:16px; flex:0 0 auto; color:${on ? 'var(--gold)' : 'var(--faint)'}">${g}</span>
      <span class="txt" style="font-size:14px; color:${on ? 'var(--ink-bright)' : 'var(--mute)'}">${esc(l)}</span></button>`;
  };
  const back = inStory
    ? `<button data-leave="1" style="margin:0 16px 12px; padding:9px 12px; border-radius:10px;
        border:1px solid var(--edge); display:flex; align-items:center; gap:10px; width:calc(100% - 32px)">
        <span style="color:var(--faint); font-size:13px; flex:0 0 auto">‹</span>
        <span class="txt" style="font-size:12.5px; color:var(--mute)">All stories</span></button>` : '';
  const tail = inStory
    ? `<div class="txt" style="padding:26px 12px 10px; font-size:10px; letter-spacing:.3em;
         text-transform:uppercase; color:var(--dim)">Chapters</div>
       ${V.chapters.map((c) => `<button data-chapter="${c.id}" style="padding:8px 12px; font-size:13px;
         border-radius:8px; white-space:nowrap; overflow:hidden; width:100%; text-overflow:ellipsis;
         color:${c.id === V.currentChapter.id ? 'var(--gold-lit)' : 'var(--faint)'}"><span class="txt">${
         esc(c.title || `Chapter ${c.index}`)}</span></button>`).join('')}`
    : (LIB.length ? `<div class="txt" style="padding:26px 12px 10px; font-size:10px; letter-spacing:.3em;
         text-transform:uppercase; color:var(--dim)">Open</div>
       ${LIB.slice(0, 4).map((s) => `<button data-open="${s.id}" style="padding:8px 12px; font-size:13px;
         color:var(--gold-lit); border-radius:8px; white-space:nowrap; overflow:hidden; width:100%; text-overflow:ellipsis"
         ><span class="txt">${esc(s.title)}</span></button>`).join('')}` : '');

  $('rail').innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; padding:26px 20px 20px; flex:0 0 auto">
      <img src="./web/icon.svg" alt="" style="width:24px; height:24px; border-radius:6px; display:block; flex:0 0 auto">
      <span class="serif txt" style="font-size:26px; color:var(--ink-bright)">Anansi</span>
      <button data-rail="1" style="margin-left:auto; color:var(--faint); font-size:17px; line-height:1;
        padding:2px 4px" aria-label="${S.rail ? 'Collapse the rail' : 'Expand the rail'}"
        >${overlay() ? '✕' : (S.rail ? '‹' : '›')}</button>
    </div>
    ${back}
    <div class="scroll" style="padding:0 16px; display:flex; flex-direction:column">${rows.map(item).join('')}${tail}</div>
    <div style="margin-top:auto; padding:14px 20px; border-top:1px solid var(--line); display:flex;
      align-items:center; gap:12px; white-space:nowrap; overflow:hidden">
      <span style="width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${SRV.slot ? 'var(--good)' : 'var(--warn)'}"></span>
      <span class="txt" style="display:flex; flex-direction:column; gap:2px">
        <span style="font-size:13px; color:var(--ink)" title="${esc(SRV.model || '')}"
          >${esc(modelName(SRV.model).name)}</span>
        <span style="font-size:11px; color:var(--dim)">${SRV.slot
          ? `slot ${SRV.slot.perSlot.toLocaleString()}` : 'llama-server asleep'}</span>
      </span></div>`;
}

// ---------- header ----------
/** What the book can no longer remember: the chapters whose summaries were dropped to fit.
 *
 *  Read off the manifest rather than recomputed, so it cannot disagree with what was actually sent.
 *  An arc block carries its range in its id; a chapter block carries the chapter's id, which
 *  V.chapters turns into a number.
 *
 *  This exists because the app knew and did not say. At chapter 120 fifty-two summaries are
 *  dropped, and until now the only place that admitted it was a dimmed row inside a panel — so a
 *  writer who had not opened that panel did not know part of their book had stopped reaching the
 *  model at all. */
function horizon() {
  if (!MANI || !V) return null;
  const idx = new Map(V.chapters.map((c) => [c.id, c.index]));
  const at = (b) => {
    const arc = /^arc-(\d+)-(\d+)$/.exec(b.id);
    return arc ? [Number(arc[1]), Number(arc[2])] : [idx.get(b.id), idx.get(b.id)];
  };
  const gone = MANI.blocks.filter((b) => b.kind === 'EARLIER' && b.state !== 'included')
    .flatMap((b) => { const [a, z] = at(b); return a == null ? [] : [[a, z]]; });
  if (!gone.length) return null;
  const from = Math.min(...gone.map(([a]) => a));
  const to = Math.max(...gone.map(([, z]) => z));
  // Chapters, not blocks: an arc that was dropped took its whole range with it.
  const chapters = gone.reduce((n, [a, z]) => n + (z - a + 1), 0);
  return { chapters, from, to };
}

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
      <!-- decoded below, after the element exists -->
    </div>
    <div style="margin-left:auto; display:flex; align-items:center; gap:10px; flex:0 0 auto">
      ${inStory ? `<span class="deskonly" style="font-size:12px; color:var(--chrome-dim)">${words.toLocaleString()} words</span>
      <button class="pill" data-reroll="1" ${S.busy ? 'disabled style="opacity:.5"' : ''}
        title="Re-roll the last passage, keeping the old take">${S.busy ? '…' : '↻'}<span
        class="deskonly" style="display:inline; margin-left:7px">Regenerate</span></button>
      ${noRoom
        ? `<button class="pill deskonly" data-panel="context"
            style="border-color:var(--bad); color:var(--bad)">No room</button>`
        : pct == null ? '' : `<button class="pill deskonly" data-panel="context">Context ${pct}%</button>`}
      ${(() => {
        const h = horizon();
        return h ? `<button class="pill deskonly" data-panel="context"
          style="border-color:rgba(217,178,106,.42); color:var(--gold-dim)"
          title="Their summaries no longer reach the model. Chapter → Acts collapses them into one."
          >${h.chapters} ${h.chapters === 1 ? 'chapter' : 'chapters'} not sent</button>` : '';
      })()}
      <button class="pill" data-appearance="1" aria-pressed="${S.appearance}"
        style="font-family:'Instrument Serif',serif; font-size:15px; line-height:1; padding:7px 13px">Aa</button>
      <button class="phoneonly" data-panel="chapter" style="font-size:19px; color:var(--chrome-dim)" aria-label="This chapter">⚙</button>`
      : `<button class="pill deskonly" data-open="new">New story</button>
         ${LIB.length ? `<button data-open="${LIB[0].id}" style="font-size:12px; letter-spacing:.1em;
           text-transform:uppercase; color:var(--on-gold); background:var(--gold); padding:9px 18px;
           border-radius:10px; font-weight:500; white-space:nowrap">Resume writing</button>` : ''}`}
    </div>`;
  // The title, and the line under it that names the chapter. Both are leaf spans holding nothing
  // but text, which is what decode() needs — it writes textContent.
  decode($('bar').querySelector('.serif'), 'title');
  decode($('bar').querySelector('.up'), 'sub');
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
      <span style="font-size:10px; letter-spacing:.26em; text-transform:uppercase; color:var(--dim)">Reading</span>
      <button data-appearance="0" style="margin-left:auto; color:var(--faint); font-size:12px" aria-label="Close">✕</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:7px">${themes.map(([k, l, sw]) => `
      <button data-theme="${k}" style="display:flex; align-items:center; gap:11px; padding:8px 10px;
        border-radius:11px; border:1px solid ${look.theme === k ? 'var(--gold)' : 'var(--chip)'}; width:100%">
        <span style="width:22px; height:22px; border-radius:7px; background:${sw};
          border:1px solid rgba(255,255,255,.08); flex:0 0 auto"></span>
        <span style="font-size:13px; color:${look.theme === k ? 'var(--ink)' : 'var(--mute)'}">${l}</span></button>`).join('')}</div>
    <div style="display:flex; flex-direction:column; gap:7px">${fonts.map(([k, l, fam]) => `
      <button class="chip" data-fontpick="${k}" aria-pressed="${look.font === k}"
        style="font-family:${fam}; font-size:15px">${l}</button>`).join('')}</div>
    <div style="display:flex; gap:7px">${['s', 'm', 'l'].map((k) => `
      <button class="chip" data-sizepick="${k}" aria-pressed="${look.size === k}"
        style="flex:1; text-align:center; padding:9px 0; letter-spacing:.1em; font-size:12.5px">${k.toUpperCase()}</button>`).join('')}</div>`;
}

// ---------- the document ----------
function passageHTML(p, newest) {
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
    ${v.length > 1 ? `<span style="display:flex; align-items:center; gap:4px; padding:8px 6px; font-size:12px; color:var(--faint)">
      <button data-vp="${p.id}">‹</button>${at}/${v.length}<button data-vn="${p.id}">›</button></span>` : ''}
    <button data-re="${p.id}"><span class="serif" style="color:var(--gold)">↻</span><span class="lbl-txt">Regenerate</span></button>
    <button data-ed="${p.id}"><span class="serif" style="color:var(--gold)">✎</span><span class="lbl-txt">Edit</span></button>
    <button data-hi="${p.id}"><span class="serif" style="color:var(--gold)">⌂</span><span class="lbl-txt">History</span></button>
    <button data-del="${p.id}" style="color:var(--bad)"><span class="serif">✕</span><span class="lbl-txt">${
      v.length > 1 ? `Delete take ${at}` : 'Delete'}</span></button></div>`;

  const body = spoken
    ? `<div class="who">${p.speaker ? esc(p.speaker)
         : mine ? `You · ${esc(V.story.persona || 'you')}` : esc(V.story.title)}</div>
       <div class="said" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>`
    : `<div class="narr" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>`;
  const flagged = flags.map((f) => {
    const e = V.entries.find((x) => x.id === f.entryId);
    // The reason is whatever the checker returned, and a reasoning model has put 3,321
    // characters in one. Clamped in CSS and expandable, never trusted to be a sentence.
    // Two different faults wear the same red line otherwise. `reached: false` means the engine
    // never sent that entry for this passage — the model could not have honoured it, and the fix
    // is a trigger word or always-on, not a rewrite. Saying "contradiction" there blames the
    // writer for the engine's omission.
    const unseen = f.reached === false;
    return `<button class="flag" data-flagx="${f.id}" aria-expanded="false" title="Click to expand · shift-click to dismiss">
      <span style="width:5px; height:5px; border-radius:50%; flex:0 0 auto; margin-top:6px;
        background:${unseen ? 'var(--warn)' : 'var(--bad)'}"></span>
      <span${unseen ? ' style="color:var(--warn)"' : ''}>${unseen
        ? `Never sent · ${esc(e?.title ?? 'canon')} contradicts this, and the model was not shown it`
        : `Contradiction · ${esc(e?.title ?? 'canon')}`}${f.reason ? ` — ${esc(f.reason)}` : ''}</span></button>`;
  }).join('');
  const cls = `block${mine ? ' you' : spoken ? ' speak' : ''}${p.id === S.found ? ' found' : ''}`
    + (newest ? ' newest' : '');
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
    ${ps.map((p, i) => passageHTML(p, i === ps.length - 1)).join('') || `<div class="narr" style="opacity:.6">${
      V.chapters.length > 1 ? 'Nothing in this chapter yet.' : 'Nothing written yet. The composer is below.'}</div>`}
    ${V.chapters.length > 1 ? `<div style="display:flex; align-items:center; gap:14px; padding:26px 0 4px;
      border-top:1px solid rgba(255,255,255,.05); margin-top:18px">
      ${step(prev, 'the beginning', 'l')}
      <span style="margin-left:auto"></span>
      ${step(next, 'the end', 'r')}</div>` : ''}`;
  if (tip) read.scrollTop = read.scrollHeight;
}

/** The story the composer was last drawn for. A draft belongs to its book: paging a chapter or
 *  opening a panel must not eat it, and opening a different book must not carry it across. */
let DOCK_FOR = null;

function drawDock() {
  if (!(S.place === 'story' && V)) { $('dock').hidden = true; DOCK_FOR = null; return; }
  $('dock').hidden = false;
  // Read the live box BEFORE it is replaced. drawDock sets innerHTML, so every caller — every
  // panel open, every chapter page, every mode switch — threw away whatever was half-written in
  // it. One handler had already grown its own save-and-restore, with a comment calling this "the
  // seventh instance of this same repaint bug"; this is that fix at the place they all pass
  // through, so there is one of it rather than seven.
  const live = $('input');
  const draft = live && DOCK_FOR === S.storyId
    ? { text: live.value, start: live.selectionStart, end: live.selectionEnd,
        focused: document.activeElement === live }
    : null;
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
      <button data-newlore="1" title="Write something down as canon, or read the chapter for facts"
        style="flex:0 0 auto">+ Thread</button>
      ${asWhom ? `<label class="deskonly" style="margin-left:auto; display:flex; align-items:center; gap:6px;
        font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--label); opacity:.75">
        as
        <select id="asWhom" style="background:none; border:0; color:var(--gold); font-size:11px;
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
  // And put the half-written line back, with the caret where it was — restoring the text but not
  // the selection moves the cursor to the end mid-sentence, which is its own small theft.
  if (draft?.text) {
    ta.value = draft.text;
    ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`;
    // The caret is restored whether or not the box had focus — clicking a panel moves focus to the
    // button, and coming back to a sentence with the cursor thrown to the end is the same theft in
    // miniature. Focus itself is only given back if it was there, so this never steals it.
    ta.setSelectionRange(draft.start ?? ta.value.length, draft.end ?? ta.value.length);
    if (draft.focused) ta.focus();
  }
  DOCK_FOR = S.storyId;
}

// ---------- side panel ----------
function drawSide() {
  const side = $('side');
  side.hidden = !S.panel || S.place !== 'story';
  if (side.hidden) return;
  $('sideHead').innerHTML = `
    <span class="serif" style="flex:1; font-size:20px; color:var(--ink-bright); white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis">${esc(TITLES[S.panel] ?? '')}</span>
    <button data-panel="" style="color:var(--gold); font-size:11px; letter-spacing:.12em; text-transform:uppercase">Close</button>`;
  decode($('sideHead').querySelector('.serif'), 'panel');
  $('sideBody').innerHTML = (PANELS[S.panel] ?? (() => ''))();
}

const PANELS = {
  entry: entryEditor,
  setup: setupPanel,
  history: historyPanel,
  context() {
    if (!MANI) return `<div class="hint">${MANIERR
      ? `The prompt could not be assembled: ${esc(MANIERR)}`
      : 'Open the composer once and the manifest appears here.'}</div>`;
    if (S.ctxView === 'prompt') {
      return `<div style="display:flex; flex-direction:column">
        ${ctxTabs()}
        <div class="hint" style="margin:0 0 10px">Exactly what the next call will send, in order.
          Nothing is added between here and the model.</div>
        <pre style="white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,monospace;
          font-size:11.5px; line-height:1.55; color:var(--narr); background:var(--field);
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
            <span style="font-size:13.5px; color:var(--ink)">There is no room for a prompt</span>
            <span class="hint" style="margin:0">${esc(MANI.overflowReason
              ?? "This story's context cap leaves nothing after the space reserved for the reply.")}</span></span></div>
        <div class="row"><span style="color:var(--ink)">Assembled anyway</span>
          <span class="tnum" style="margin-left:auto; color:var(--faint)">${MANI.totals.used.toLocaleString()} tokens</span></div>
        <div class="row"><span style="color:var(--ink)">Room for it</span>
          <span class="tnum" style="margin-left:auto; color:var(--bad)">none</span></div>
        <div class="hint">Raise the cap in Story &amp; chapter, or lower Max tokens under Storyteller.</div></div>`;
    }
    const budget = MANI.totals.budget;
    return `<div style="display:flex; flex-direction:column; gap:2px">
      ${ctxTabs()}
      <div style="display:flex; align-items:baseline; gap:10px; font-size:12.5px; color:var(--mute)">
        <span>Assembled for the next call</span>
        <span class="tnum" style="margin-left:auto; color:var(--faint)">${MANI.totals.used.toLocaleString()} / ${budget.toLocaleString()}</span></div>
      <div class="meter">${Object.entries(agg).map(([k, v]) =>
        `<i style="width:${(v / budget * 100).toFixed(2)}%; background:${BLOCK_COLOR[k] ?? 'var(--ink-ghost)'}"></i>`).join('')}</div>
      ${(() => {
        const h = horizon();
        if (!h) return '';
        return `<div style="display:flex; align-items:flex-start; gap:10px; padding:10px 0">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--gold-dim); margin-top:5px; flex:0 0 auto"></span>
          <span style="flex:1; display:flex; flex-direction:column; gap:4px">
            <span style="font-size:13px; color:var(--ink)">Chapters ${h.from}&ndash;${h.to} are past the horizon</span>
            <span class="hint" style="margin:0">Their summaries no longer reach the model, so it
              cannot draw on them or stay consistent with them.
              <strong>Chapter &rarr; Acts</strong> collapses a run of them into one summary that
              does fit.</span></span></div>`;
      })()}
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
        // Every block came from something editable. This is the way back to it, under the name it
        // has when you get there. Canon goes straight to the entry when there is only one to open
        // and to the list when there are several — the first of nine was an arbitrary place to land.
        const [label, dest] = BLOCK_ORIGIN[k] ?? [k, 'doc'];
        const to = dest !== 'canon' ? `${dest}:`
          : rows.length === 1 && rows[0].id ? `entry:${rows[0].id}` : 'threads:';
        return `<button class="row" data-goblock="${to}" style="width:100%; text-align:left">
          <span style="width:8px; height:8px; border-radius:2px; flex:0 0 auto; background:${BLOCK_COLOR[k] ?? 'var(--ink-ghost)'}"></span>
          <span style="color:var(--ink)">${esc(label)}</span>
          <span style="color:var(--gold); font-size:11.5px">${esc(why)}</span>
          <span class="tnum" style="margin-left:auto; color:var(--faint)">${v.toLocaleString()}</span></button>`;
      }).join('')}
      ${(() => {
        // One row per REASON, with a count. At 358 passages this was ninety-six identical
        // `PROSE / prose 60% ceiling` lines under the seven that say something, and a panel you
        // have to scroll past its own answer is a panel nobody reads (COUNCIL-04 #1). The tokens
        // are summed because "what came off, and how much" is the whole question being asked.
        const out = new Map();
        for (const b of MANI.blocks.filter((x) => x.state !== 'included')) {
          const key = `${b.kind}\u0000${b.reason ?? 'omitted'}`;
          const at = out.get(key) ?? { n: 0, tokens: 0 };
          out.set(key, { n: at.n + 1, tokens: at.tokens + (b.tokens ?? 0) });
        }
        return [...out].map(([key, { n, tokens }]) => {
          const [kind, reason] = key.split('\u0000');
          return `<div class="row" style="opacity:.55">
            <span style="width:8px; height:8px; border-radius:2px; flex:0 0 auto; background:var(--edge-lit)"></span>
            <span style="color:var(--mute)">${esc((BLOCK_ORIGIN[kind] ?? [kind])[0])}${
              n > 1 ? ` <span style="color:var(--faint)">&times;&thinsp;${n}</span>` : ''}</span>
            <span style="color:var(--bad); font-size:11.5px">${esc(reason)}</span>
            <span class="tnum" style="margin-left:auto; color:var(--faint)">${tokens.toLocaleString()}</span></div>`;
        }).join('');
      })()}
      <div class="hint" style="margin-top:14px">Canon is capped at 45% of the slot, earlier chapters at 25%,
        recent prose at 60%. The tail is never evicted. Click one of the rows above the line to reach
        what put it there; the dimmed rows are what came off, and lead nowhere.</div></div>`;
  },

  // Every card in this story, grouped by what kind of thing it is. This was `cast` and showed
  // characters only, so lore, items and rules had no home inside a story at all — the Worlds page
  // lists them across every story, which is a different question.
  threads() {
    if (S.entryId) return entryEditor();
    // The + Lore tray. Two ways a fact gets into canon and they belong next to each other: write
    // it yourself, or have the chapter read for what is already on the page. The second is the
    // ritual's extraction step on its own — "scan what we have" — without ending the chapter.
    if (S.lore) {
      const KIND_LABEL = { character: 'a character', lore: 'a place or a fact',
                           item: 'an object', rule: 'a rule of this world' };
      return `<div style="display:flex; flex-direction:column">
        <button class="btn ghost" data-newlore="1" style="margin-bottom:14px">&lsaquo; Back</button>
        <div class="lbl" style="letter-spacing:.26em; margin-top:0">Write it down</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px">
          ${KINDS.map((k) => `<button data-lorekind="${k}" style="flex:1 1 44%; text-align:center;
            font-size:11.5px; padding:8px 0; border-radius:10px;
            border:1px solid ${S.lore.kind === k ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
            background:${S.lore.kind === k ? 'rgba(217,178,106,.12)' : 'transparent'};
            color:${S.lore.kind === k ? 'var(--gold-lit)' : 'var(--mute)'}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
        </div>
        <button class="btn" data-newentry="${esc(S.lore.kind)}">New ${esc(KIND_LABEL[S.lore.kind] ?? S.lore.kind)}</button>
        <div class="hint">Opens an empty entry for you to fill in. Nothing reaches the model until
          it has a body.</div>
        ${inventTray(S.lore.kind, `Or have Anansi write ${esc(KIND_LABEL[S.lore.kind] ?? S.lore.kind)}`,
                     'a rival cartographer, or nothing at all and let it choose')}
        <div class="hint">It goes to the proposals queue under Chapter, like everything else Anansi
          offers. Nothing is canon until you accept it.</div>

        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Or read the chapter</div>
        <button class="btn ghost" data-loreread="1">Scan ${esc(V.currentChapter.title || `chapter ${V.currentChapter.index}`)} for facts</button>
        <div class="hint">Reads what is already on the page and proposes entries for it. Nothing is
          accepted automatically — proposals wait for you under Chapter. This is the ritual's third
          step, on its own, without ending the chapter.</div>
      </div>`;
    }
    const groups = [['character', 'Characters', 'character'], ['lore', 'Lore', 'lore'],
                    ['item', 'Items', 'item'], ['rule', 'Rules', 'rule']];
    const shown = groups.filter(([k]) => V.entries.some((e) => e.entryType === k));
    return `<div style="display:flex; flex-direction:column; gap:9px">
      ${shown.map(([k, label]) => `
        <div class="lbl" style="letter-spacing:.26em; margin-top:6px">${label}</div>
        ${V.entries.filter((e) => e.entryType === k).map((e) => entryCard(e)
          + ((e.outfits ?? []).length ? `<div style="display:flex; flex-wrap:wrap; gap:5px; margin:-4px 0 10px 2px">
            ${e.outfits.map((o) => `<button data-wear="${e.id}:${o.id}" class="tag"
              style="cursor:pointer; ${o.active
                ? 'border-color:rgba(217,178,106,.45); color:var(--gold)' : ''}">${esc(o.name)}</button>`).join('')}
            ${e.outfits.some((o) => o.active)
              ? `<button data-wear="${e.id}:" class="tag" style="cursor:pointer; color:var(--dim)">nothing</button>` : ''}
          </div>` : '')).join('')}`).join('')}
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
      ${current && !rows.includes(current) ? `<option value="${esc(current)}" selected>${esc(current)} — not a thread</option>` : ''}
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
      <label class="lbl">The model never writes</label>
      ${pick('lockedCharacter', cast.map((e) => e.title), V.story.lockedCharacter,
             'Nobody — it may write anyone')}
      <div class="hint">${V.story.lockedCharacter
        ? `No dialogue, no action, no gesture, and nothing about what ${esc(V.story.lockedCharacter)}
           feels or knows. It writes the world's answer and stops where they would act.`
        : `Name someone and the model will not write their dialogue, their actions or their inner
           state — it writes what happens around them instead. Usually the one you play.`}
        A separate setting from <em>You are</em> on purpose: you may hand yourself a different
        character for a scene without also handing over the one you were keeping.</div>
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
      <div class="lbl" style="letter-spacing:.26em; margin-top:26px; color:var(--bad)">Danger</div>
      <button class="btn ghost" data-delstory="1" style="color:var(--bad)">${
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
      <div style="font-size:12.5px; line-height:1.55; color:var(--mute); margin-bottom:9px">Nothing here is canon until you accept it.</div>
      <div style="display:flex; flex-direction:column; gap:9px">
      ${ps.map((p) => {
        const tone = p.kind === 'new' ? 'var(--good)' : p.kind === 'conflict' ? 'var(--bad)' : 'var(--warn)';
        return `<div class="card" style="gap:8px">
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-size:14.5px; color:var(--ink-bright)">${esc(p.title)}</span>
            <span class="up" style="margin-left:auto; font-size:9.5px; letter-spacing:.14em; color:${tone}">${esc(p.kind)}</span></div>
          <div style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(p.delta || p.body)}</div>
          <div style="display:flex; gap:7px">
            <button data-decide="accept" data-id="${p.id}" style="flex:1; text-align:center; padding:8px 0;
              border-radius:9px; background:var(--gold); color:var(--on-gold); font-size:11.5px; font-weight:500">Accept</button>
            <button data-decide="reject" data-id="${p.id}" style="width:38px; text-align:center; padding:8px 0;
              border-radius:9px; border:1px solid var(--chip); color:var(--faint); font-size:11.5px">✕</button></div></div>`;
      }).join('') || '<div class="hint" style="margin:0">Nothing proposed. Closing a chapter reads it for new facts.</div>'}
      <button class="btn ghost" data-extract="1" style="margin-top:6px">Read this chapter for facts</button></div>

      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Summaries in context</div>
      ${V.chapters.filter((c) => c.summary).map((c) => `<button class="card" aria-expanded="false"
        data-expand="1" style="margin-bottom:8px; text-align:left; width:100%">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(c.title || `Chapter ${c.index}`)}</span>
          <span style="margin-left:auto; font-size:11px; color:var(--faint)">covers to ${c.coversThrough ?? '—'}</span></div>
        <div class="clamp" style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(c.summary)}</div>
        ${c.summaryStale ? '<div class="hint" style="color:var(--bad)">Stale — excluded from the prompt until it is re-run.</div>' : ''}
      </button>`).join('') || '<div class="hint">No summaries yet. Closing a chapter writes one.</div>'}
      <button class="btn ghost" data-summarize="1">Summarise this chapter</button>

      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Acts</div>
      <div class="hint" style="margin:0 0 8px">One summary standing in for a run of chapters. A
        chapter summary is about 220 tokens and they never stop arriving — at chapter 120 they do
        not fit, and the oldest silently stop being sent. An act is what they collapse into.</div>
      ${(V.arcs ?? []).map((a) => `<div class="card" style="margin-bottom:8px; gap:5px">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(a.title || `Chapters ${a.fromChapter}–${a.toChapter}`)}</span>
          <span style="margin-left:auto; font-size:11px; color:var(--faint)">chapters ${a.fromChapter}&ndash;${a.toChapter}</span>
          <button data-delarc="${a.id}" style="color:var(--bad); font-size:12px" aria-label="Remove">✕</button></div>
        <div style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(a.summary)}</div></div>`).join('')}
      ${(() => {
        // The range is computed rather than typed. Two number boxes is a question the writer has
        // to answer about their own token budget; the oldest run that is not in an act yet is the
        // answer nearly every time, so the button just says which chapters it will take.
        const inArc = (i) => (V.arcs ?? []).some((a) => i >= a.fromChapter && i <= a.toChapter);
        const run = V.chapters
          .filter((c) => c.summary && !c.summaryStale && !inArc(c.index) && c.id !== V.currentChapter.id)
          .map((c) => c.index).sort((x, y) => x - y);
        if (run.length < 2) return `<div class="hint" style="margin:0">Two summarised chapters
          outside an act are needed before there is anything to roll up${
            (V.arcs ?? []).length ? '' : ', and closing a chapter is what writes a summary'}.</div>`;
        // Consecutive from the oldest — a gap means a chapter is unsummarised or already in an act.
        let last = run[0];
        for (const i of run.slice(1)) { if (i !== last + 1) break; last = i; }
        return `<button class="btn ghost" data-rollup="${run[0]}:${last}"${S.busy ? ' disabled' : ''}
          >Roll chapters ${run[0]}&ndash;${last} into one act</button>
          <div class="hint" style="margin:0">Their own summaries stop being sent and this stands in
            for them. Undo it by removing the act.</div>`;
      })()}

      <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Branches</div>
      <div style="display:flex; flex-direction:column; gap:9px">
      ${(V.branches ?? []).map((b) => `<div class="card" style="gap:6px;
        border-color:${b.active ? 'rgba(217,178,106,.34)' : 'var(--chip)'}">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(b.name)}${b.active ? ' · active' : ''}${
            b.isPrimary && b.name.toLowerCase() !== 'main' ? ' · main' : ''}</span>
          <span style="margin-left:auto; font-size:11px; color:var(--faint)">${
            b.forkOrdinal ? `from passage ${b.forkOrdinal}` : ''}</span></div>
        ${b.active ? '' : `<button data-branch="${b.id}" class="btn ghost" style="margin-top:4px">Switch to this branch</button>`}</div>`).join('')}
      </div>
      <div class="hint">Every read follows the active branch. Forking from a passage is on the
        passage's own menu.</div></div>`;
  },



  // The conversation. Ephemeral by choice: turns live in S.talk and go nowhere else, so there is
  // no table, no export question, and nothing for the round-trip invariant to cover.
  //
  // Nothing here writes. A thread goes to the proposals queue and waits; a directive is HANDED to
  // the composer, unsent and editable, because a conversation that could send is a conversation
  // that can write your book while you are thinking out loud.
  anansi() {
    // `searchable` comes off the story view, so the checkbox is right the moment the panel
    // opens. It used to start null and only learn the truth from the first answer, which meant
    // offering a switch that could not work and then taking it away.
    const t = { ...S.talk, searchable: V?.searchable ?? S.talk.searchable };
    return `<div style="display:flex; flex-direction:column; height:100%">
      <div style="flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-bottom:10px">
        ${t.turns.length ? t.turns.map((turn) => turn.you
          ? `<div style="align-self:flex-end; max-width:88%; padding:9px 13px; border-radius:14px 14px 4px 14px;
              background:rgba(217,178,106,.10); border:1px solid rgba(217,178,106,.22);
              font-size:13px; line-height:1.5; color:var(--ink)">${esc(turn.text)}</div>`
          : `<div style="max-width:94%; display:flex; flex-direction:column; gap:7px">
              <div style="font-size:13.5px; line-height:1.62; color:var(--ink); white-space:pre-wrap">${esc(turn.text)}</div>
              ${turn.sources?.length ? `<div style="display:flex; flex-direction:column; gap:3px">
                ${turn.sources.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"
                  style="font-size:11px; color:var(--gold-dim); text-decoration:none; overflow:hidden;
                  text-overflow:ellipsis; white-space:nowrap">[${i + 1}] ${esc(x.title || x.url)}</a>`).join('')}
              </div>` : ''}
              ${turn.proposed ? `<button class="tag" data-panel="chapter" style="align-self:flex-start; cursor:pointer;
                border-color:rgba(217,178,106,.4); color:var(--gold)">${turn.proposed} proposed &mdash; waiting under Chapter</button>` : ''}
              ${turn.meta ? `<div style="font-size:10.5px; color:var(--faint)">${esc(turn.meta)}</div>` : ''}
            </div>`).join('')
          : `<div class="hint" style="margin:0">Ask about the story, a character, what you have set up
              and not paid off. Anansi can also propose <strong>threads</strong>, and
              draft a <strong>directive</strong> to hand to the composer.<br><br>
              Nothing it offers goes anywhere until you accept it.</div>`}
        ${t.busy ? '<div class="hint" style="margin:0">Thinking&hellip;</div>' : ''}
      </div>

      ${t.draft ? `<div class="card" style="gap:8px; border-color:rgba(217,178,106,.34)">
        <div class="kind">A directive, for you to use or ignore</div>
        <div style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(t.draft)}</div>
        <div style="display:flex; gap:7px">
          <button class="btn ghost" data-usedraft="1" style="flex:1">Put it in the composer</button>
          <button class="btn ghost" data-copydraft="1" style="width:84px">Copy</button>
        </div>
        <div class="hint" style="margin:0">It arrives in Direct mode, unsent — read it before you send it.</div>
      </div>` : ''}

      <div style="display:flex; flex-direction:column; gap:8px; padding-top:10px; border-top:1px solid var(--line)">
        <textarea class="field" id="askBox" placeholder="Ask Anansi about this story&hellip;"
          style="min-height:64px; margin:0"></textarea>
        <div style="display:flex; align-items:center; gap:8px">
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:${
            t.searchable === false ? 'var(--faint)' : 'var(--mute)'}"
            title="${t.searchable === false ? 'Set ANANSI_SEARCH on the server to enable this' : 'Look it up on the web first'}">
            <input type="checkbox" data-websearch="1" ${t.search ? 'checked' : ''}
              ${t.searchable === false ? 'disabled' : ''}> Search the web
          </label>
          ${t.turns.length ? `<button data-clearchat="1" style="font-size:11px; color:var(--faint)">Clear</button>` : ''}
          <button class="btn" data-ask="1" ${t.busy ? 'disabled' : ''}
            style="margin-left:auto; width:auto; padding:0 22px; height:38px">${t.busy ? '&hellip;' : 'Ask'}</button>
        </div>
        ${t.searchable === false
          ? '<div class="hint" style="margin:0">Web search is off. It makes the only outbound request this app can make, so it stays off until <code>ANANSI_SEARCH</code> names a service you trust.</div>'
          : ''}
      </div>
    </div>`;
  },

  search() {
    // Inside a story, this searches THAT story. It used to span every book you own, which is the
    // wrong default in the one place you already know where you are — and it is how "add to
    // threads" could quietly put one in a different story.
    return `<div style="display:flex; flex-direction:column">
      <input class="field" id="q" value="${esc(S.query)}" placeholder="Search ${
        S.searchAll ? 'every story' : esc(V?.story.title ?? 'this story')}">
      <label style="display:flex; align-items:center; gap:8px; margin:10px 0 4px; font-size:12px; color:var(--mute)">
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
          text-transform:uppercase; color:var(--dim)">
          <span>${label}</span><span class="tnum" style="color:var(--gold-dim)">${value}</span></div>
        <input type="range" data-gen="${key}" min="0" max="${max}" step="${max > 2 ? 10 : 0.01}"
          value="${value}" style="width:100%; accent-color:var(--gold)">
        ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    return `<div style="display:flex; flex-direction:column">
      <div style="display:flex; align-items:flex-start; gap:12px; padding:0 0 4px">
        <span style="width:8px; height:8px; border-radius:50%; background:var(--warn); margin-top:5px; flex:0 0 auto"></span>
        <span style="flex:1; display:flex; flex-direction:column; gap:4px">
          <span style="font-size:13.5px; color:var(--ink)">These are shared, not per story</span>
          <span class="hint" style="margin:0">The sampler is one object for the whole server, so changing
            temperature here changes it for every story and every writer on this machine. The route
            takes a story id, which makes it look per-story; it is not. Per-story sampling needs
            PLAN-02's <code>engine_config</code>, which was never built.</span></span></div>
      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Model</div>
      ${S.models === null ? '<div class="hint" style="margin:0">Asking the router&hellip;</div>'
        : S.models.length === 0 ? '<div class="hint" style="margin:0">The router did not answer.</div>'
        : `<select class="field" data-storymodel="1">
            <option value="">Default &mdash; ${esc(modelName(V.defaultModel ?? SRV.model).name)}</option>
            ${S.models.map((m) => `<option value="${esc(m.id)}" ${V.story.model === m.id ? 'selected' : ''}
              >${esc([modelName(m.id).name, modelName(m.id).detail].filter(Boolean).join(' — '))}${
                m.status === 'loaded' ? ' · awake' : ''}</option>`).join('')}
          </select>
          <div class="hint">${V.story.model
            ? `This story is written by <code title="${esc(V.story.model)}">${esc(modelName(V.story.model).name)}</code>,
               whatever any other story uses.`
            : 'This story uses whatever Preferences is set to. Name one here and it stops moving when that does.'}
            The router holds three at once, so switching between them usually costs nothing &mdash; one that is
            asleep costs a load on the first call.</div>`}

      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Sampling</div>
      ${slider('Temperature', 'temperature', g.temperature ?? 0.85, 2,
        'Prose only. Structured roles run pinned at 0.2 — a loose sampler under a tight grammar writes valid JSON that says nothing.')}
      ${slider('Top-p', 'top_p', g.top_p ?? 0.95, 1, '')}
      ${slider('Max tokens', 'max_tokens', g.max_tokens ?? 900, 2000,
        'The ceiling on one passage. Raising it costs prefill on every call.')}
      <div style="display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-top:1px solid rgba(255,255,255,.04)">
        <span style="width:8px; height:8px; border-radius:50%; background:var(--bad); margin-top:5px; flex:0 0 auto"></span>
        <span style="flex:1; display:flex; flex-direction:column; gap:4px">
          <span style="font-size:13.5px; color:var(--ink)">Thinking is off, and not a setting</span>
          <span class="hint" style="margin:0">With it on this model spent the whole budget reasoning and
            returned no prose on three runs in four. The transport pins it off.</span></span></div>
      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">The five modes, in your words</div>
      ${(() => {
        // The shipped wording comes from the server, rendered by the engine itself, so the box
        // shows what it is actually replacing rather than a second copy that goes stale.
        if (!S.prompts) return '<div class="hint" style="margin:0">Reading them&hellip;</div>';
        const { defaults, yours } = S.prompts;
        return ['continue', 'speak', 'act', 'direct', 'narrate'].map((k) => {
          const mine = yours[k];
          const open = S.promptOpen === k;
          return `<div class="card" style="margin-bottom:7px; gap:6px;
              border-color:${mine ? 'rgba(217,178,106,.34)' : 'var(--chip)'}">
            <button data-editprompt="${k}" style="display:flex; align-items:center; gap:9px; width:100%; text-align:left">
              <span class="kind">${k[0].toUpperCase() + k.slice(1)}</span>
              ${mine ? '<span class="tag" style="border-color:rgba(217,178,106,.4); color:var(--gold)">yours</span>' : ''}
              <span style="margin-left:auto; color:var(--faint); font-size:12px">${open ? '\u2212' : '+'}</span>
            </button>
            ${open ? `<textarea class="field" data-prompttext style="min-height:132px; font-family:ui-monospace,monospace;
                font-size:11.5px; line-height:1.5">${esc(mine ?? defaults[k] ?? '')}</textarea>
              <div class="hint" style="margin:0">Replaces the whole instruction for this mode.
                ${k === 'direct' ? '<code>{{directive}}</code> is what you typed. ' : ''}${
                  k === 'speak' || k === 'act' ? '<code>{{speaker}}</code> is whoever you are speaking as. ' : ''}
                Empty it and press Save to go back to the shipped one.</div>
              <div style="display:flex; gap:7px">
                <button class="btn ghost" data-saveprompt="${k}" style="flex:1">Save</button>
                <button class="btn ghost" data-resetprompt="${k}" style="width:110px">Default</button>
              </div>` : ''}
          </div>`;
        }).join('');
      })()}
      <div class="hint">Global to you, not to a story, and they reach the model exactly as written —
        nothing is added between the box and the prompt. Read one in <strong>Context &rarr; Prompt
        sent</strong> before you trust it.</div>

      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">This story's calls</div>
      ${(ACT?.runs ?? []).slice(0, 3).map((r) => `<div class="row">
        <span style="color:var(--ink)">${esc(r.role ?? 'prose')}${r.error ? ' · failed' : ''}</span>
        <span class="tnum" style="margin-left:auto; color:var(--faint)">${
          r.promptTokens ? r.promptTokens.toLocaleString() + ' tok' : '—'}${
          r.prefillSeconds ? ` · ${r.prefillSeconds}s prefill` : ''}${
          r.seconds ? ` · ${r.seconds}s` : ''}</span></div>`).join('')
        || '<div class="hint">No calls logged for this story yet.</div>'}
      ${ACT?.worstPrefillSeconds ? `<div class="row"><span style="color:var(--ink)">Worst prefill</span>
        <span class="tnum" style="margin-left:auto; color:var(--faint)">${ACT.worstPrefillSeconds}s</span></div>` : ''}
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
      <span class="serif" style="font-size:21px; color:var(--ink-bright)">${esc(b.title)}</span>
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
        <span style="margin-left:auto; font-size:11px; color:var(--dim)">${esc(r.where ?? '')}</span></span>
      <span style="font-size:13.5px; line-height:1.5; color:var(--ink)">${esc((r.body ?? '').slice(0, 260))}</span></button>
    ${r.kind === 'Entry' ? '' : `<button data-tolore="${i}" style="align-self:flex-start; font-size:10.5px;
      letter-spacing:.14em; text-transform:uppercase; color:var(--gold); padding:2px 0">＋ Add to threads</button>`}
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
        <span style="font-size:14px; color:var(--ink-bright)">${esc(e.title)}</span>
        <span class="tag" style="margin-left:auto">${esc(e.activation === 'always_on' ? 'Always on' : 'Triggered')}</span></div>
      <div style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(e.body ?? '')}</div>
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
    <span style="flex:1; min-width:0; font-size:13px; color:${on(e) ? 'var(--ink)' : 'var(--mute)'};
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
      ${done.map((line) => `<div style="display:flex; align-items:center; gap:9px; font-size:12.5px; color:var(--mute)">
        <span style="width:6px; height:6px; border-radius:50%; background:var(--good); flex:0 0 auto"></span>
        ${esc(line)}</div>`).join('')}</div>` : ''}
    <div class="serif" style="font-size:21px; color:var(--ink-bright)">${esc(ch.title || `Chapter ${ch.index}`)}</div>
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
      : `<div class="hint" style="margin:0">${q ? 'Nothing matches that.' : 'No threads yet.'}</div>`}

    <div class="hint">Ticked means it is sent for this chapter whether or not anyone says its name.
      Unticking an always-on entry holds it back for this chapter only. Both cost or save their
      canon on every call, so tick what is actually in the room.</div>
    <div class="hint">The story's setting is in the spine on every call regardless
      &mdash; ${esc(V.story.setting || 'not set')}.</div>

    <button class="btn" data-savesetup="1" style="margin-top:16px">Save and write</button>
    <button class="btn ghost" data-skipsetup="1" style="margin-top:8px">Skip &mdash; just write</button>
  </div>`;
}

async function loadPrompts() {
  S.prompts = { defaults: {}, yours: {} };      // set first: a second open must not refetch
  const r = await api.prompts();
  if (!r.error) { S.prompts = { defaults: r.defaults ?? {}, yours: r.yours ?? {} }; paint(); }
}

function ctxTabs() {
  const t = (k, l) => `<button data-ctxview="${k}" style="flex:1; text-align:center; font-size:11.5px;
    padding:8px 0; border-radius:10px; border:1px solid ${S.ctxView === k ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
    background:${S.ctxView === k ? 'rgba(217,178,106,.12)' : 'transparent'};
    color:${S.ctxView === k ? 'var(--gold-lit)' : 'var(--mute)'}">${l}</button>`;
  return `<div style="display:flex; gap:6px; margin-bottom:14px">${t('blocks', 'Blocks')}${t('prompt', 'Prompt sent')}</div>`;
}

/** The same three controls wherever something can be invented: a line of direction, the web-search
 *  switch, and the button. No state in S: the direction and the switch are read off the DOM when
 *  the button is pressed, and the button reports its own progress in place — a paint() here would
 *  eat the sentence the writer had just typed into the box, which is COUNCIL-04's composer defect
 *  in a different panel. */
function inventTray(kind, label, placeholder) {
  const searchable = V?.searchable !== false;
  return `<div style="display:flex; flex-direction:column; gap:7px; margin-top:4px;
      padding-top:9px; border-top:1px solid var(--line)">
    <textarea class="field" data-invdir placeholder="${esc(placeholder)}"
      style="min-height:44px; font-size:12.5px"></textarea>
    <div style="display:flex; align-items:center; gap:9px">
      <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:${
        searchable ? 'var(--mute)' : 'var(--faint)'}"
        title="${searchable ? 'Look it up on the web first' : 'Set ANANSI_SEARCH on the server to enable this'}">
        <input type="checkbox" data-invsearch ${searchable ? '' : 'disabled'}> Search the web
      </label>
      <button class="btn ghost" data-invent="${esc(kind)}"
        style="margin-left:auto; width:auto; padding:0 16px; height:34px">${label}</button>
    </div>
  </div>`;
}

function entryEditor() {
  const e = V?.entries.find((x) => x.id === S.entryId);
  if (!e) return `<div class="hint">That entry is gone.</div>`;
  const chip = (on) => `border:1px solid ${on ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
    background:${on ? 'rgba(217,178,106,.12)' : 'transparent'}; color:${on ? 'var(--gold-lit)' : 'var(--mute)'}`;
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
    ${e.entryType === 'character' ? `
    <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Wardrobe</div>
    <div class="hint" style="margin:0 0 8px">A named outfit is a second bracket on this character
      while it is worn, so taking the plate off does not mean rewriting who she is. One at a time —
      the database enforces that, not the screen. Switch on the Threads panel.</div>
    ${(e.outfits ?? []).map((o) => `<div class="card" style="margin-bottom:8px;
      border-color:${o.active ? 'rgba(217,178,106,.34)' : 'var(--chip)'}">
      <div style="display:flex; align-items:center; gap:9px">
        <span class="kind">${esc(o.name)}${o.active ? ' · worn' : ''}</span>
        <button data-deloutfit="${o.id}" style="margin-left:auto; color:var(--bad); font-size:12px" aria-label="Remove">✕</button></div>
      <div style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(o.body)}</div></div>`).join('')}
    <div class="card" style="gap:7px">
      <input class="field" data-of="name" placeholder="Plate, court dress, travelling…">
      <textarea class="field" data-of="body" placeholder="What the model reads while it is worn"
        style="min-height:52px"></textarea>
      <button class="btn ghost" data-addoutfit="1">Add an outfit</button>
      ${inventTray('outfit', `Have Anansi dress ${esc(e.title)}`,
                   'mourning, or travelling light, or whatever you already had in mind')}
    </div>` : ''}

    <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Over time</div>
    <div class="hint" style="margin:0 0 8px">A fact can open at a later chapter. Before it opens it is
      hidden, or hinted at without saying what it is. Earlier chapters keep the body above.</div>
    ${(e.states ?? []).map((st) => `<div class="card" style="margin-bottom:8px">
      <div style="display:flex; align-items:center; gap:9px">
        <span class="kind">From chapter ${st.fromChapter}</span>
        <span style="margin-left:auto; font-size:9.5px; letter-spacing:.14em; text-transform:uppercase;
          color:var(--faint)">${esc(st.beforeMode ?? 'hide')} before</span>
        <button data-delstate="${st.id ?? ''}" style="color:var(--bad); font-size:12px" aria-label="Remove">✕</button></div>
      <div style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(st.body)}</div>
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
        <div class="clamp" style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(h.previous_value ?? '')}</div>
        <button class="btn ghost" data-revertfield="${h.id}" style="margin-top:6px">Put this back</button></div>`).join('')
        : '<div class="hint">No earlier versions of any field.</div>'}` : ''}
    <button class="btn" data-saveentry="1" style="margin-top:16px">Save</button>
    <button class="btn ghost" data-fieldhistory="1" style="margin-top:10px">${
      S.fieldHistory ? 'Hide field history' : 'Field history'}</button>
    <button class="btn ghost" data-delentry="1" style="margin-top:10px; color:var(--bad)">Delete this entry</button>
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
      border-color:${t.selected ? 'rgba(217,178,106,.34)' : 'var(--chip)'};
      opacity:${!t.selected && t.rejected ? '.62' : '1'}">
      <div style="display:flex; align-items:center; gap:9px">
        <span class="kind">Take ${i + 1}${t.selected ? ' · in the story' : t.rejected ? ' · passed over' : ''}</span>
        <span style="margin-left:auto; font-size:11px; color:var(--faint)">${
          t.author === 'human' ? 'yours' : 'Anansi'}${t.created_at ? ` · ${ago(t.created_at)}` : ''}</span></div>
      <div class="clamp" style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(t.body ?? '')}</div>
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
      <div class="clamp" style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(r.body ?? '')}</div>
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
      <span style="font-size:14.5px; color:var(--ink-bright)">${esc(e.title)}</span>
      <span class="tag" style="border-color:${gold ? 'rgba(217,178,106,.35)' : 'var(--chip)'};
        color:${gold ? 'var(--gold)' : 'var(--dim)'}">${pill}</span></div>
    <div class="kind">${esc(e.entryType ?? 'lore')}</div>
    <div style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(e.body ?? '')}</div></button>`;
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
        ${gold ? 'border-color:rgba(217,178,106,.35); color:var(--gold)' : ''}">${esc(t)}</span>`).join('')}</span>
      ${hero ? '<span class="tag" style="position:absolute; top:12px; right:14px; background:rgba(10,9,12,.6)">Last written</span>' : ''}
      <span class="serif" style="position:absolute; bottom:12px; left:16px; right:16px;
        font-size:${hero ? 34 : 23}px; line-height:1.05; color:var(--ink-bright)">${esc(s.title)}</span></span>
    <span style="display:block; padding:14px 16px 16px">
      <span style="display:block; font-size:${hero ? 13.5 : 12.5}px; line-height:1.5; color:var(--mute);
        font-style:italic; min-height:19px">${esc((s.premise || 'No premise yet.').slice(0, hero ? 200 : 110))}</span>
      <span style="display:flex; align-items:center; gap:11px; margin-top:10px; font-size:11px; color:var(--faint)">
        <span>${s.chapters ?? 0} ${s.chapters === 1 ? 'chapter' : 'chapters'}</span>
        <span style="opacity:.5">·</span><span>${s.entries ?? 0} threads</span>
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
      <div class="serif" style="font-size:30px; color:var(--ink-bright)">Nothing yet</div>
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
    // Start blank asks for the same things Spark fills in. It used to make `Untitled` and drop you
    // straight into the editor, which is the one moment you know least about the story and the
    // worst time to be given a blinking cursor.
    if (S.blank) {
      const f = (k, label, hint) => `<label class="lbl">${label}</label>
        <input class="field" data-bf="${k}" value="${esc(S.blank[k] ?? '')}">
        ${hint ? `<div class="hint">${hint}</div>` : ''}`;
      const area = (k, label, hint, ph) => `<label class="lbl">${label}</label>
        <textarea class="field" data-bf="${k}" placeholder="${esc(ph ?? '')}"
          style="min-height:88px">${esc(S.blank[k] ?? '')}</textarea>
        ${hint ? `<div class="hint">${hint}</div>` : ''}`;
      return `<div style="display:flex; flex-direction:column; gap:0; max-width:640px">
        <div class="serif" style="font-size:30px; line-height:1.08; color:var(--ink-bright)">Start it yourself</div>
        <div style="font-size:14px; line-height:1.65; color:var(--mute); margin:10px 0 6px">Everything here
          is editable afterwards, and everything here can be left empty. The title is the only one
          you will miss.</div>
        ${f('title', 'Title')}
        ${f('genre', 'Genre', 'Comma separated. Each one becomes its own tag on the shelf.')}
        ${area('premise', 'Premise', 'One or two sentences. It rides in the spine on every call.',
               'A broke ex-sergeant owes a moneylender more than he can pay…')}
        ${f('setting', 'Setting', 'Where it happens. Lore written later can replace this.')}
        <label class="lbl">Point of view</label>
        <select class="field" data-bf="pov">${POV.map((p) =>
          `<option value="${esc(p)}" ${p === S.blank.pov ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        ${area('writingStyle', 'Voice of the weave',
               'Paste a few hundred words of your own prose. A sample beats a description of one.',
               'Clipped and wet. Short sentences. Weather does the feeling…')}
        <label class="lbl">Spice</label>
        <select class="field" data-bf="spice">${SPICE.map((l, i) =>
          `<option value="${i + 1}" ${Number(S.blank.spice) === i + 1 ? 'selected' : ''}>${i + 1} · ${l}</option>`).join('')}</select>
        <div class="hint">Changeable per story at any time, and a written-out register can replace
          the level entirely under Story.</div>
        <div style="display:flex; gap:10px; margin-top:20px">
          <button class="btn" data-makeblank="1" style="width:auto; padding:0 28px; height:48px">Create the story</button>
          <button class="btn ghost" data-dropblank="1" style="width:auto; padding:0 22px; height:48px">Back</button>
        </div>
        <div class="hint">You are not asked for <em>who you are</em> or <em>where this is going</em>
          — both are drawn from things you have not written yet. They are on the Story panel once
          there is a cast and a ledger to draw from.</div>
      </div>`;
    }
    // POST /api/spark returns { story, entries } — a skeleton, not a created story. The page used
    // to look for r.storyId, find nothing, and repaint: ten seconds of waiting for no visible
    // result. SPEC 8.1 wants the skeleton editable before anything is written, so it lands here.
    return `<div class="split">
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; max-width:640px">
        <div class="serif" style="font-size:30px; line-height:1.08; color:var(--ink-bright)">Hand him one thread</div>
        <div style="font-size:14px; line-height:1.65; color:var(--mute)">Spark takes an idea and returns a skeleton.
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
          <span style="color:var(--ink)">${l}</span>
          <span style="margin-left:auto; color:var(--faint)">&mdash;</span></div>`).join('')}
        <div class="hint" style="margin-top:4px">Nothing is written until you accept it.</div>`}</div></div>`;
  },

  canon() {
    if (LEDGER === null) { loadLedger(); return `<div class="hint">Reading the threads…</div>`; }
    // Grouped by story, because a story IS its threads — entries are story-scoped in the schema
    // and there is no separate lorebook table. The search spans every story, which is the point:
    // it is for when you cannot remember which book an entry belongs to.
    // The filter bar is drawn once. Typing redraws #books only — rewriting the page on every
    // keystroke destroyed the input and swallowed the query, which is how "brass" found nothing.
    const chip = (on) => `border:1px solid ${on ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
      background:${on ? 'rgba(217,178,106,.12)' : 'transparent'}; color:${on ? 'var(--gold-lit)' : 'var(--mute)'}`;
    return `<div class="split" style="gap:28px">
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:16px">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          ${['all', ...KINDS].map((k) => `<button data-lkind="${k}" style="font-size:12px; padding:8px 16px;
            border-radius:999px; ${chip(k === S.ledgerKind)}">${k === 'all' ? 'Everything' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
          <input class="field" id="lq" value="${esc(S.ledgerQ)}" placeholder="Search every story"
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
        <div class="serif" style="font-size:26px; color:var(--ink)">${esc(d.source)}</div>
        <div class="row"><span style="color:var(--mute)">Canon entries</span>
          <span class="tnum" style="margin-left:auto; color:var(--ink)">${d.entries}${
            d.updated ? ` new, ${d.updated} updated` : ''}</span></div>
        <div class="row"><span style="color:var(--mute)">Passages</span>
          <span class="tnum" style="margin-left:auto; color:var(--ink)">${d.passages}</span></div>
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
          <div class="serif" style="font-size:26px; color:var(--ink)">${esc(P.source)}</div>
          <div class="hint" style="margin-top:4px">${esc(I.name)} &mdash; nothing has been written yet.</div>
        </div>
        <div class="split" style="gap:26px">
          <div style="flex:1; min-width:0">
            <div class="lbl">${P.entries.length} canon ${P.entries.length === 1 ? 'entry' : 'entries'}</div>
            ${P.entries.length ? P.entries.map((e) => `<div class="row">
                <span style="color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(e.title)}</span>
                <span class="chip" style="flex:0 0 auto">${esc(e.entryType)}</span>
                <span style="display:flex; gap:4px; flex-wrap:wrap; flex:0 1 auto">${
                  e.activation === 'always_on'
                    ? '<span style="font-size:10.5px; color:var(--dim)">always</span>'
                    : e.keys.length ? e.keys.map((k) => `<span class="tag">${esc(k)}</span>`).join('')
                    : '<span style="font-size:10.5px; color:var(--dim)">no keys</span>'}</span>
                <span class="tnum" style="margin-left:auto; font-size:10.5px; color:var(--dim); flex:0 0 auto">${e.chars}c</span>
              </div>`).join('')
              : '<div class="hint" style="margin:0">None in this file.</div>'}
          </div>
          <div class="aside">
            <div class="lbl" style="letter-spacing:.26em">Prose</div>
            <div class="row"><span style="color:var(--ink)">Passages</span>
              <span class="tnum" style="margin-left:auto; color:var(--faint)">${P.passages}</span></div>
            ${P.passages ? `<div class="row"><span style="color:var(--ink)">Yours</span>
              <span class="tnum" style="margin-left:auto; color:var(--faint)">${P.human}</span></div>` : ''}
            ${P.opening ? `<div class="lbl" style="margin-top:18px">Opens with</div>
              <div style="font-size:12.5px; line-height:1.6; color:var(--mute)">${esc(P.opening)}&hellip;</div>` : ''}
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
          <span class="serif" style="font-size:20px; color:var(--gold)">${g}</span>
          <span style="font-size:15px; color:var(--ink-bright)">${l}</span>
          <span style="font-size:12.5px; line-height:1.5; color:var(--mute)">${m}</span></div>`).join('')}</div>
      <label id="impdrop" class="dashed" style="min-height:0; padding:44px; flex-direction:column;
        gap:8px; text-align:center; cursor:pointer">
        <input type="file" id="impfile" accept=".json,.png,.md,.markdown,.txt,.db" hidden>
        <span class="serif" style="font-size:22px; color:var(--ink)">${
          I.busy ? 'Reading&hellip;' : 'Choose a file, or drop one here'}</span>
        <span style="font-size:12.5px; color:var(--faint)">You see what it would become before anything
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
          <span style="font-size:12px; color:var(--faint)">${slot ? 'Up' : 'Asleep or unreachable'}</span></div>
        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Model</div>
        ${S.models === null ? '<div class="hint" style="margin:0">Asking the router&hellip;</div>'
          : S.models.length === 0 ? '<div class="hint" style="margin:0">The router did not answer.</div>'
          : S.models.map((m) => `<button data-pickmodel="${esc(m.id)}" class="row"
              style="width:100%; text-align:left">
              <span style="width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${
                m.id === SRV.model ? 'var(--gold)' : m.status === 'unloaded' ? 'var(--edge-lit)' : 'var(--good)'}"></span>
              <span title="${esc(m.id)}" style="color:${m.id === SRV.model ? 'var(--ink)' : 'var(--mute)'};
                font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(modelName(m.id).name)}${
                  modelName(m.id).detail ? ` <span style="color:var(--faint); font-size:10.5px">${esc(modelName(m.id).detail)}</span>` : ''}</span>
              <span style="margin-left:auto; font-size:10.5px; color:var(--dim)">${esc(m.status)}</span></button>`).join('')}
        <div class="hint">Switching is process-wide, not per story &mdash; two writers share this server,
          so it changes for both. A sleeping model wakes on its first call.</div>
        ${S.allow?.length ? `<div class="hint">${S.allow.length} of the router's models
          ${S.allow.length === 1 ? 'is' : 'are'} allowed for Anansi:
          ${S.allow.map((a) => `<code>${esc(a)}</code>`).join(', ')}. Set with
          <code>ANANSI_MODELS</code> when the server starts — it is an operator's decision about
          the box, so it is not editable from here.</div>`
        : '<div class="hint">Every model the router serves is offered. Narrow it with <code>ANANSI_MODELS</code> — a comma-separated list of ids, <code>prefix*</code> allowed — when you start the server.</div>'}
        <div class="hint">Sampling, voice and spice belong to each story — they live under Storyteller, inside the story.
          A story can also name its own <strong>model</strong> there, and then it stops following this one.</div>

        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">The server itself</div>
        ${S.router ? `<div class="row"><span style="color:var(--ink)">llama-router</span>
            <span class="chip">${esc(S.router.state ?? '?')}</span>
            <span style="margin-left:auto; font-size:11px; color:var(--faint)">${
              S.router.since ? esc(String(S.router.since).replace(/^\w+ /, '')) : ''}</span></div>`
          : '<div class="hint" style="margin:0">Asking systemd&hellip;</div>'}
        <div style="display:flex; gap:7px; margin-top:10px">
          <button class="btn ghost" data-router="restart" style="flex:1">Restart it</button>
          <button class="btn ghost" data-router="stop" style="flex:1; color:var(--bad)">Release the models</button>
        </div>
        <div class="hint"><strong>Release</strong> stops the service, which is the only way to get the
          VRAM back immediately — the router has no unload call, it only sleeps on its own after 15
          minutes idle. Anansi cannot write while it is stopped; <strong>Restart</strong> brings it
          back and the next call loads what it needs. Both are shared: two writers, one server.</div>

        <div class="lbl" style="letter-spacing:.26em; margin-top:30px">What you have written</div>
        ${(() => {
          const t = S.stats;
          if (!t) return '<div class="hint" style="margin:0">Counting&hellip;</div>';
          const n = (v) => Number(v ?? 0).toLocaleString();
          const row = (l, v, sub) => `<div class="row"><span style="color:var(--ink)">${l}</span>
            ${sub ? `<span style="font-size:11px; color:var(--dim)">${sub}</span>` : ''}
            <span class="tnum" style="margin-left:auto; color:var(--faint)">${v}</span></div>`;
          // Thirty days of passages, drawn from the same rows. A sparkline rather than a number,
          // because "have I written this week" is a shape question.
          const max = Math.max(1, ...t.days.map((d) => d.n));
          const spark = t.days.length > 1 ? `<div style="display:flex; align-items:flex-end; gap:2px;
            height:34px; margin:10px 0 4px">${t.days.map((d) => `<span title="${esc(d.d)}: ${d.n}"
            style="flex:1; min-width:2px; height:${Math.max(6, d.n / max * 100)}%;
            background:${d.n ? 'var(--gold)' : 'var(--chip)'}; opacity:${d.n ? .75 : .35}; border-radius:1px"></span>`).join('')}</div>
            <div class="hint" style="margin:0 0 8px">Passages a day, most recent on the right.</div>` : '';
          return `${row('Words', n(t.words), 'in passages that are in the story')}
            ${row('Passages', n(t.passages), `${n(t.yours)} yours · ${n(t.anansi)} Anansi`)}
            ${row('Stories', n(t.stories), `${n(t.chapters)} chapters`)}
            ${row('Threads', n(t.entries), 'characters, lore, items, rules')}
            ${row('Takes not chosen', n(t.unchosen), 'kept, and not in the story')}
            ${row('Calls to the model', n(t.calls), t.failed ? `${n(t.failed)} failed` : 'none failed')}
            ${row('Time spent generating', t.minutes >= 60
              ? `${Math.floor(t.minutes / 60)}h ${t.minutes % 60}m` : `${t.minutes}m`)}
            ${spark}`;
        })()}
      </div>
      <div class="aside">
        <div class="lbl" style="letter-spacing:.26em">Slot</div>
        <div class="row"><span style="color:var(--ink)">Context per writer</span>
          <span class="tnum" style="margin-left:auto; color:var(--faint)">${slot ? slot.toLocaleString() : '—'}</span></div>
        <div class="row"><span style="color:var(--ink)">Canon cap</span>
          <span class="tnum" style="margin-left:auto; color:var(--faint)">45%</span></div>
        <div class="hint">${global && slots ? `${global.toLocaleString()} across ${slots} slots. The pool is
          shared, so two writers at full budget must both fit.` : ''}</div>
        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">This machine</div>
        <div class="row"><span style="color:var(--ink)">Snapshots</span>
          <span style="margin-left:auto; color:var(--faint)">12 kept · every 30 min</span></div>
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

async function loadRouter() {
  const r = await api.router('status', S.storyId ?? LIB[0]?.id);
  S.router = r.error ? { state: 'unreachable' } : r;
  if (S.wpage === 'prefs') drawPage();
}

async function loadStats() {
  const r = await api.stats();
  S.stats = r.error ? null : r;
  if (S.wpage === 'prefs') drawPage();
}

async function loadModels() {
  const r = await api.models();
  S.models = r.error ? [] : (r.models ?? []);
  S.allow = r.allow ?? [];
  if (r.active) SRV.model = r.active;
  if (S.wpage === 'prefs') drawPage();
  if (S.place === 'story' && S.panel === 'teller') drawSide();
  loadStats(); loadRouter();
}

async function loadLibrary() {
  const r = await api.library();
  if (r.error) return toast(r.error);
  LIB = r.stories ?? [];
  SRV = { model: r.model ?? null, slot: r.slot ?? null, gen: r.gen ?? {} };
}

/** The book most recently ASKED for, which is not the same as the one most recently answered.
 *  Opening two in quick succession — a click while the first is still in flight, or two hash
 *  changes — used to let the slower answer land last and win. */
let OPENING = null;

async function openStory(id) {
  OPENING = id;
  const r = await api.story(id);
  if (OPENING !== id) return;                   // superseded before the story even arrived
  if (r.error) return toast(r.error);
  V = r; S.storyId = id; S.place = 'story';
  if (S.models === null) loadModels();   // the Storyteller panel needs the list to offer one
  if (S.prompts === null) loadPrompts();

  SRV = { model: r.model ?? SRV.model, slot: r.slot ?? SRV.slot, gen: r.gen ?? SRV.gen };
  if (!S.panel && !overlay()) S.panel = 'context';   // the hash may already have chosen one
  const a = await api.activity(id);
  if (OPENING !== id) return;                   // and again: this is the second await, not the first
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
/** The passage as it is being written, at the end of the chapter you are reading.
 *
 *  It is NOT in the document — nothing is saved until the stream finishes and `accept` returns —
 *  so it lives outside `drawDoc`'s innerHTML and is removed by `unghost` either way. Streaming
 *  never calls paint(), so it cannot collide with a redraw, and it cannot eat a draft.
 *
 *  Scroll only when you were already at the bottom: yanking the page down while someone is
 *  reading an earlier paragraph is worse than not following the text. */
// ---------- the decode ----------
// One frame per character, left to right, spaces held so the shape of the line is legible from the
// first frame. Two places want it and they want it differently: a HEADER decodes once, when its
// text changes, and that is this function. STREAMING prose decodes at its frontier only — see
// frontier() in model.js, which is where the glyphs are. Scrambling a live 300-word passage whole
// would be unreadable, and the bureau only ever put this on short headers.
/** Titles already on screen, by slot, so a repaint that says the same thing does not re-run the
 *  animation. Every panel repaint replaces the element, so the memory cannot live on it. */
const DECODED = {};
function decode(el, slot) {
  const target = el?.textContent ?? '';
  if (!el || !target.trim() || DECODED[slot] === target) return;
  DECODED[slot] = target;
  // No rAF in the stub DOM the node suite renders against, and nothing to animate under
  // reduced motion. The element already holds the finished text either way.
  if (still() || typeof requestAnimationFrame !== 'function') return;
  // Two frames per character, not one: at 60fps a one-frame-per-character decode crossed a
  // 30-character title in half a second, which read as a flicker rather than as text arriving.
  const len = target.length, total = Math.max(10, len) * 2;
  let frame = 0;
  el.classList.add('decoding');
  const tick = () => {
    // A repaint during the animation throws this element away; its animation goes with it.
    if (!el.isConnected) return;
    const revealed = Math.floor((++frame / total) * len);
    let out = '';
    for (let i = 0; i < len; i++)
      out += target[i] === ' ' ? ' ' : i < revealed ? target[i] : glyph();
    // The glyphs go in an ATTRIBUTE and are painted by CSS over the top. The real title stays in
    // textContent the whole time, which is what a screen reader reads, what a copy takes, and what
    // a test asserting a header can see — writing glyphs into the text itself would have made every
    // assertion in panels.js a race against half a second of animation.
    el.dataset.glyphs = out;
    if (frame < total) requestAnimationFrame(tick);
    else { el.classList.remove('decoding'); delete el.dataset.glyphs; }
  };
  requestAnimationFrame(tick);
}

/** The block where the passage is going to land: a loader first, then the passage arriving.
 *
 *  One element for both states. The wait before the first token is 0.35s warm and 7.8s cold (F24),
 *  and a page that shows nothing for either reads as hung — which is what it was reported as.
 *
 *  Two text nodes, and the difference is the whole point: `settled` holds the prose, and once a
 *  character is in it, it never changes again. `head` holds the run of glyphs, and it is animated
 *  on a timer of its own rather than on delta arrival — a delta is a token, so anything driven by
 *  it runs at whatever rate the model is writing, which is uneven by nature.
 */
function ghost(text) {
  const col = $('col'); if (!col) return;
  let g = document.getElementById('ghost');
  if (!g) {
    g = document.createElement('div');
    g.id = 'ghost'; g.className = 'block ghost loading';
    const narr = g.appendChild(document.createElement('div'));
    narr.className = 'narr';
    // textContent on both, never innerHTML: this is untrusted model output arriving a fragment at
    // a time, and a half-written "<" would be a half-written tag.
    narr.appendChild(document.createElement('span')).className = 'settled';
    narr.appendChild(document.createElement('span')).className = 'head';
    col.appendChild(g);
    if (!still()) {
      // ~11 rolls a second. Fast enough to read as working, slow enough not to strobe, and
      // unrelated to how fast the tokens are coming.
      let last = 0;
      const tick = (t) => {
        const el = document.getElementById('ghost');
        if (!el) return;                       // the ghost went; so does its animation
        if (t - last > 88) { el.querySelector('.head').textContent = glyphRun(); last = t; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }
  if (text) g.classList.remove('loading');     // the first token ends the wait
  g.querySelector('.settled').textContent = text ?? '';
  const read = $('read');
  if (read && read.scrollHeight - read.scrollTop - read.clientHeight < 400) read.scrollTop = read.scrollHeight;
}
const unghost = () => document.getElementById('ghost')?.remove();

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
  // The story this was asked ABOUT, held across the await. A manifest takes a /tokenize round trip,
  // and a writer who switches books inside that window used to get the previous book's prompt
  // rendered under the new book's title — the Context panel describing something that is no longer
  // on screen, with nothing saying so.
  const asked = S.storyId;
  const r = await api.manifest({ storyId: asked, mode: S.mode,
    directive: $('input')?.value || undefined,
    speaker: S.mode === 'speak' || S.mode === 'act' ? (S.speaker || V.story.persona || undefined) : undefined });
  if (S.storyId !== asked) return;              // a different book is open; this answer is stale
  // A FAILED REQUEST CLEARS IT. It used to skip the assignment, so the panel went on showing the
  // last manifest that worked — the previous book's prompt under this book's title, which is the
  // same lie the guard above exists to prevent, arriving by a different road.
  //
  // An overflow is not that case: it comes back WITH a manifest and an error, and the panel has a
  // rendering for it. So the manifest decides, not the error.
  MANI = r.manifest ?? null;
  PROMPT = r.manifest ? (r.prompt ?? '') : '';
  MANIERR = r.manifest ? null : (r.error ?? null);
  drawBar();
  if (S.panel === 'context') drawSide();
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
    const w = await api.write(S.storyId, { body: typed, speaker: mode === 'speak' ? who : null,
      chapterId: V.currentChapter.id });
    if (w.error) return toast(w.error);
    clearComposer();
    // Refetch the chapter you are READING, not the last one — otherwise writing into chapter one
    // bounced you to the end of the book, which is where the passage used to go anyway.
    V = await api.story(S.storyId, V.currentChapter.id);
    paint();
  } else if (mode === 'direct' && !typed) {
    return toast('Say what happens next, or press Continue.');
  }

  S.busy = true; drawDock(); working(mode);
  // Your text is already on the page in the three modes above, so the model gets no directive —
  // it gets told whose line it is answering instead.
  let live = '';
  ghost('');   // the block appears now, loading, rather than when the first token lands
  const r = await api.generateLive({ storyId: S.storyId, mode, chapterId: V.currentChapter.id,
    directive: YOURS ? undefined : (typed || undefined), speaker: who },
    (d) => ghost(live += d));
  unghost();
  if (r.error) { S.busy = false; drawDock(); working(null); return toast(r.error); }
  MANI = r.manifest;
  // Kept as it arrives. Discard and Keep are gone: a take you dislike is one ⋯ away from
  // Regenerate or Delete, and both keep the history, so nothing is lost by committing it.
  const a2 = await api.accept(S.storyId, { body: r.prose, genId: r.genId, chapterId: V.currentChapter.id,
    directive: YOURS ? undefined : (typed || undefined) });
  S.busy = false; working(null);
  if (a2.error) return toast(a2.error);
  clearComposer();
  V = await api.story(S.storyId, V.currentChapter.id);
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
  // A reroll of the LAST passage writes at the bottom, so the ghost belongs there too. Rerolling
  // one further up would put it in the wrong place, so that one waits — the take replaces a
  // paragraph you can already see, which is a different kind of wait from a blank page.
  const atEnd = V.passages.filter((p) => !p.isBreak).at(-1)?.id === id;
  let live = '';
  const r = await api.generateLive({ storyId: S.storyId, mode: S.mode, regenerateOf: id, chapterId: V.currentChapter.id,
    speaker: S.mode === 'speak' || S.mode === 'act' ? (S.speaker || V.story.persona || undefined) : undefined },
    atEnd ? (d) => ghost(live += d) : () => {});
  unghost();
  if (r.error) { S.busy = false; drawDock(); drawBar(); working(null); return toast(r.error); }
  const a2 = await api.accept(S.storyId, { body: r.prose, genId: r.genId, variantOf: id, rejected: true,
    chapterId: V.currentChapter.id });
  S.busy = false; working(null);
  if (a2.error) { drawDock(); drawBar(); return toast(a2.error); }
  V = await api.story(S.storyId, V.currentChapter.id);
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
  if (d.newlore) {
    // Replaces New scene, which was removed with the mode set. Two ways to get a fact into the
    // ledger and they belong together: write it down yourself, or have the chapter read for what
    // is already on the page. The second is the ritual's extraction step, on its own.
    S.lore = S.lore ? null : { kind: 'character' };
    if (S.lore) { S.entryId = null; S.historyOf = null; S.panel = 'threads'; }
    syncHash(); paint();
    return;
  }
  if (d.rollup) {
    const [from, to] = String(d.rollup).split(':').map(Number);
    S.busy = true; paint(); working('direct');
    const r = await api.rollup(S.storyId, from, to);
    S.busy = false; working(null);
    if (r.error) { paint(); return toast(r.error); }
    V = await api.story(S.storyId, V.currentChapter.id); paint(); refreshManifest();
    return toast(`Chapters ${from}–${to} are one act now.`);
  }
  if (d.delarc) {
    const r = await api.delArc(S.storyId, d.delarc);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId, V.currentChapter.id); paint(); refreshManifest();
    return toast('The act is gone; those chapters send their own summaries again.');
  }

  if (d.editprompt) { S.promptOpen = S.promptOpen === d.editprompt ? null : d.editprompt; paint(); return; }
  if (d.saveprompt || d.resetprompt) {
    const key = d.saveprompt || d.resetprompt;
    // Reset is Save with nothing in it — the route deletes rather than storing blank, so there is
    // one path and no state where a mode is overridden with an empty string.
    const text = d.resetprompt ? '' : (document.querySelector('[data-prompttext]')?.value ?? '');
    const r = await api.savePrompt(key, text);
    if (r.error) return toast(r.error);
    S.prompts = { defaults: r.defaults ?? {}, yours: r.yours ?? {} };
    if (r.reset) S.promptOpen = null;
    paint(); refreshManifest();
    return toast(r.reset ? `${key} is back to the shipped wording.` : `${key} is yours now.`);
  }

  if (d.invent) {
    const dir = document.querySelector('[data-invdir]')?.value.trim() ?? '';
    const search = !!document.querySelector('[data-invsearch]')?.checked;
    const was = t.textContent;
    t.textContent = search ? 'Looking it up…' : 'Writing…'; t.disabled = true;
    working('direct');
    const r = await api.invent(S.storyId, { kind: d.invent, entryId: S.entryId || undefined,
      direction: dir || undefined, search });
    working(null); t.disabled = false; t.textContent = was;
    if (r.error) return toast(r.error);
    if (r.outfit) {
      // Straight into the form, unsaved. Add an outfit is still the writer's press — and filling
      // the fields rather than writing the row is the whole difference between this and a
      // generator that dresses her behind your back.
      const name = document.querySelector('[data-of="name"]');
      const body = document.querySelector('[data-of="body"]');
      if (name) name.value = r.outfit.name;
      if (body) body.value = r.outfit.body;
      return toast(`Written, not saved — read it, then press Add an outfit.`);
    }
    V = await api.story(S.storyId, V.currentChapter.id); paint();
    return toast(r.duplicate ? `The ledger already says that about ${r.title}.`
                             : `${r.title} proposed — waiting under Chapter.`);
  }

  if (d.addoutfit) {
    const name = document.querySelector('[data-of="name"]')?.value.trim();
    const body = document.querySelector('[data-of="body"]')?.value.trim();
    if (!name || !body) return toast('An outfit needs a name and something to wear.');
    const r = await api.saveOutfit(S.storyId, S.entryId, { name, body });
    if (r.error) return toast(r.error);
    V = r.entries ? r : await api.story(S.storyId);
    paint(); refreshManifest(); return;
  }
  if (d.deloutfit) {
    const r = await api.delOutfit(S.storyId, d.deloutfit);
    if (r.error) return toast(r.error);
    V = r.entries ? r : await api.story(S.storyId);
    paint(); refreshManifest(); return;
  }
  if (d.wear !== undefined) {
    // "entryId:outfitId", with an empty outfit id meaning take it all off. One attribute rather
    // than two, because the pair only ever travels together.
    const [entryId, outfitId] = String(d.wear).split(':');
    const worn = V.entries.find((x) => x.id === entryId)?.outfits?.find((o) => o.id === outfitId);
    // Clicking the one already worn takes it off, so the chips are a toggle rather than a trap.
    const r = await api.wear(S.storyId, entryId, worn?.active ? null : (outfitId || null));
    if (r.error) return toast(r.error);
    V = r.entries ? r : await api.story(S.storyId);
    paint(); refreshManifest(); return;
  }
  if (d.lorekind) { S.lore = { ...(S.lore ?? {}), kind: d.lorekind }; paint(); return; }
  if (d.loreread) {
    // The ritual's third step, reachable without ending the chapter — "scan what we have".
    working('reroll');
    toast('Reading this chapter for facts…');
    const x = await api.extract(S.storyId, V.currentChapter.id);
    working(null);
    if (x.error) return toast(x.error);
    V = await api.story(S.storyId);
    S.lore = null; S.panel = 'chapter'; syncHash(); paint();
    toast(`${x.added ?? 0} proposed as threads — nothing accepted yet.`);
    return;
  }
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
    // The save-and-restore that used to be here is gone: drawDock keeps the draft for every
    // caller now, which is where the fix belongs — this handler was the only one of seven that
    // had grown its own.
    S.mode = d.mode; drawDock();
    refreshManifest(); return;
  }
  if (d.re) { await regenerateInto(d.re); return; }
  if (d.reroll !== undefined) { await regenerateLast(); return; }
  if (d.send) { await generate(); return; }   // the button's only path; ⌘↵ is the shortcut
  if (d.del) {
    // Delete sits next to Regenerate, fired on one press and had no undo. The confirmation is done
    // in place rather than through paint(): a repaint drops the tray's aria-expanded, so on a phone
    // the second press would have nothing left to press. The toast is the part a phone can see —
    // .lbl-txt is hidden there, the tray is icons only.
    if (S.confirmDel !== d.del) {
      S.confirmDel = d.del;
      const lbl = t.querySelector('.lbl-txt'), was = lbl?.textContent;
      if (lbl) lbl.textContent = 'Press again';
      toast('Press Delete again to remove it.');
      setTimeout(() => { if (S.confirmDel === d.del) { S.confirmDel = null; if (lbl) lbl.textContent = was; } }, 4000);
      return;
    }
    S.confirmDel = null;
    const r = await api.delPassage(S.storyId, d.del); if (r.error) return toast(r.error);
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
    toast('Woven in. Give it trigger words so it fires.');
    return;
  }

  // --- the model is process-wide, so this is a Preferences action
  if (d.ask) {
    const box = $('askBox');
    const said = (box?.value ?? '').trim();
    if (!said || S.talk.busy) return;
    // The question goes up as yours before the answer comes back, so the window reads like a
    // conversation rather than a form that clears itself.
    S.talk = { ...S.talk, turns: [...S.talk.turns, { you: true, text: said }], busy: true, draft: null };
    drawSide(); working('direct');
    const r = await api.talk(S.storyId, {
      said, turns: S.talk.turns.slice(0, -1).map((t) => ({ you: t.you, text: t.text })),
      search: S.talk.search ? said : undefined,
    });
    working(null);
    S.talk.busy = false;
    if (r.error) { drawSide(); return toast(r.error); }
    S.talk.searchable = r.searchable ?? S.talk.searchable;
    S.talk.turns = [...S.talk.turns, { you: false, text: r.reply || '(nothing came back)',
      sources: r.sources ?? [], proposed: r.proposed ?? 0,
      meta: `${r.seconds}s · ${Number(r.tokens ?? 0).toLocaleString()} tokens of context` }];
    S.talk.draft = r.directive || null;
    // A thread that landed is a proposal, and the queue lives under Chapter.
    if (r.proposed) V = await api.story(S.storyId);
    paint();
    const b = $('askBox'); if (b) { b.value = ''; b.focus(); }
    return;
  }
  if (d.usedraft) {
    // HANDED to the composer, not sent. Direct mode, in the box, editable — the whole safety
    // property of this feature is that Anansi never presses send.
    const draft = S.talk.draft;
    if (!draft) return;
    S.mode = 'direct'; S.panel = null; S.talk.draft = null;
    syncHash(); paint();
    const input = $('input');
    if (input) { input.value = draft; input.focus();
      input.style.height = 'auto'; input.style.height = `${Math.min(140, input.scrollHeight)}px`; }
    toast('In the composer, unsent. Read it before you send it.');
    return;
  }
  if (d.copydraft) {
    if (!S.talk.draft) return;
    try { await navigator.clipboard.writeText(S.talk.draft); toast('Copied.'); }
    catch { toast('Could not reach the clipboard — select it and copy by hand.'); }
    return;
  }
  if (d.clearchat) { S.talk = { ...S.talk, turns: [], draft: null }; drawSide(); return; }
  if (d.storymodel !== undefined) { return; }   // handled on change, below
  if (d.router) {
    // Stopping is the destructive one — it takes the model away from whoever else is writing —
    // so it asks. Restart does not: it is what you press when something is already wrong.
    if (d.router === 'stop' && !S.confirmStop) {
      S.confirmStop = true; drawPage();
      return toast('Press again to stop the server. Nothing can generate until it is back.');
    }
    S.confirmStop = false;
    toast(d.router === 'stop' ? 'Stopping…' : 'Restarting…');
    const r = await api.router(d.router, S.storyId ?? LIB[0]?.id);
    if (r.error) { drawPage(); return toast(r.error); }
    S.router = r;
    // The model list is meaningless while the server is down, and stale once it comes back.
    S.models = null; drawPage();
    if (r.state === 'active') loadModels();
    toast(r.state === 'active' ? 'The server is up.' : 'The server is stopped. Restart it when you want to write.');
    return;
  }
  if (d.pickmodel) {
    if (d.pickmodel === SRV.model) return;
    const r = await api.setModel(d.pickmodel, S.storyId ?? LIB[0]?.id);
    if (r.error) return toast(r.error);
    SRV.model = r.active; paint(); toast(`Now writing with ${modelName(r.active).name}.`); return;
  }

  if (d.lkind) { S.ledgerKind = d.lkind; drawPage(); return; }
  if (d.ctxview) { S.ctxView = d.ctxview; drawSide(); return; }
  if (d.goblock !== undefined) {
    const [kind, id] = d.goblock.split(':');
    if (kind === 'entry' && id) { S.entryId = id; S.panel = 'entry'; }
    else if (kind === 'traj') S.panel = 'chapter';
    else if (kind === 'threads') { S.entryId = null; S.panel = 'threads'; }
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
      : `${x.added ?? 0} proposed as threads — nothing accepted yet`);

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
    toast(d.decide === 'accept' ? 'Woven in.' : 'Dropped.');
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
    toast(`Created with ${keep.length} threads.`);
    return;
  }
  if (d.blank) {
    // Was: create `Untitled` and drop you in the editor. Seth: "if were starting blank then the
    // user needs a screen to fill in all these things themselves". Spark fills these in for you;
    // starting blank should ask for the same ones rather than for none of them.
    S.blank = S.blank ?? { title: '', genre: '', premise: '', setting: '',
                           pov: 'third limited, past tense', writingStyle: '', spice: 2 };
    S.spark = null;
    drawPage();
    document.querySelector('[data-bf="title"]')?.focus();
    return;
  }
  if (d.dropblank) { S.blank = null; drawPage(); return; }
  if (d.makeblank) {
    // Read from the DOM here rather than from state on every keystroke: this form is the only
    // thing on the page, so nothing repaints it while you type and there is nothing to lose.
    const get = (k) => document.querySelector(`[data-bf="${k}"]`)?.value ?? '';
    const story = { title: get('title').trim() || 'Untitled', genre: get('genre').trim(),
      premise: get('premise').trim(), setting: get('setting').trim(),
      pov: get('pov'), writingStyle: get('writingStyle').trim(),
      spice: Number(get('spice')) || 2 };
    const r = await api.createStory(story);
    if (r.error) return toast(r.error);
    S.blank = null;
    await loadLibrary();
    await openStory(r.id ?? r.storyId);
    return;
  }
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
  if (e.target.dataset?.websearch) {
    // Never redraws the panel: the question you are part-way through typing lives in the DOM.
    S.talk.search = e.target.checked;
    return;
  }
  if (e.target.dataset?.storymodel) {
    const model = e.target.value || null;
    api.saveStory(S.storyId, { model }).then(async (r) => {
      if (r.error) return toast(r.error);
      V = await api.story(S.storyId);
      paint(); refreshManifest();
      toast(model ? `This story is written by ${model} now.` : 'Back to the default model.');
    });
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

document.addEventListener('keydown', (e) => {
  // Enter asks, Shift+Enter is a newline — the same bargain the composer makes.
  if (e.target?.id === 'askBox' && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    document.querySelector('[data-ask]')?.click();
  }
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
