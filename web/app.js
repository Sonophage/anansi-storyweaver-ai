// One responsive surface. Replaces the separate desk and phone clients: the design puts the
// rail, the document and the 400px side panel in one shell, and turns the panel into a bottom
// sheet on a phone. Layout lives in app.html's CSS — this file decides state and content only,
// so a repaint does not rewrite every element's inline style.
import { api } from './api.js';
import { HELP } from './help.js';
import { MODES, KINDS, SPICE, STORY_FIELDS, isSpeech, ago, esc, BLOCK_COLOR, BLOCK_ORIGIN, modelName, modelOptions, glyph, still, glyphRun, THEMES, themeVars, mark, MARK, epigraphOf, shelfOrder, waiting, bookParagraphs } from './model.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const phone = () => matchMedia('(max-width:719px)').matches;

/** A web, and what it opens. Both together on purpose: a caller cannot put the icon somewhere and
 *  forget the text, and the text cannot appear without something to shut it again.
 *
 *  It opens IN PLACE, under the control it belongs to. A help page is one you navigate away to and
 *  do not come back from. */
const helpMark = (slug) => {
  const h = HELP[slug];
  if (!h) return '';
  const open = S.help === slug;
  return `<button data-help="${slug}" aria-expanded="${open}" aria-label="What ${esc(h.title)} is"
    style="display:inline-flex; vertical-align:-2px; margin-left:6px; padding:1px; flex:0 0 auto;
      color:${open ? 'var(--gold)' : 'var(--faint)'}">${mark('web', 13)}</button>`;
};

const helpBody = (slug) => {
  const h = HELP[slug];
  if (!h || S.help !== slug) return '';
  return `<div class="card" data-helpbody="${slug}" style="margin:0 0 14px; gap:7px;
      font-size:12.5px; line-height:1.6; color:var(--mute); border-color:rgba(217,178,106,.28)">
      <div style="font-size:10px; letter-spacing:.1em; font-variant-caps:all-small-caps;
        color:var(--gold-dim)">${esc(h.title)}</div>${h.body}</div>`;
};

/** Both halves, for the field-level ones where the label is not clipped and the body can sit right
 *  under it. The panel-level four are split, because a panel heading is nowrap and decode() owns it. */
const help = (slug) => helpMark(slug) + helpBody(slug);

/** Which panels ARE their own concept. The rest of the webs live beside a field. */
const PANEL_HELP = { threads: 'threads', strings: 'strings', context: 'context', anansi: 'anansi' };
const overlay = () => matchMedia('(max-width:1099px)').matches;

// ---------- appearance: yours by default, the book's when it says so ----------
//
// Three layers, and keeping them apart is the whole of this. SHIPPED is what a writer who has
// never touched it sees. MYLOOK is that writer's own default, held on the SERVER — it was
// per browser until 2026-08-27, which made a phone and the desk two unrelated sets of
// preferences belonging to one person, and a cleared browser a lost one. `look` is what is
// actually on screen: the open book's look over MYLOOK.
//
// localStorage still exists and now caches ONE thing — MYLOOK — so the first paint has something
// before /api/stories answers. It must never cache `look`: opening a book with its own green
// theme would then make green your default the next time you started the app.
// THE ONE PREFERENCE THAT MUST NOT FOLLOW YOU. Everything in `look` is held on the server so a
// phone and the desk are one person's settings — that was the fix on 2026-08-27. A hardware
// keyboard is the opposite: it is a fact about the MACHINE, not the writer. Synced, turning it on
// at the desk would make a phone refocus the composer after every press and hold the soft keyboard
// open over the prose. So it lives in localStorage alone and never rides /api/stories.
const HW = 'anansi.hwkb';
let hwkb = false;
try { hwkb = localStorage.getItem(HW) === '1'; } catch { /* no storage */ }
/** The layout must stop reflowing for a keyboard that is not there.
 *
 *  `interactive-widget=resizes-content` is right for a touch device: the soft keyboard shrinks the
 *  layout viewport so the composer sits on top of it instead of under it. With a hardware keyboard
 *  it is the whole problem — Android still reports a widget (a suggestion strip, or the soft
 *  keyboard flickering up and away), the layout resizes for it, and the dock moves each time.
 *  `overlays-content` says: do not resize for it, let it cover what it covers. With no soft
 *  keyboard there is nothing to cover, so the dock simply stops moving.
 *
 *  Chrome re-reads this meta when it changes, so it can be a runtime setting rather than a reload. */
const applyHwkb = () => {
  const m = document.querySelector('meta[name="viewport"]');
  if (!m) return;
  m.setAttribute('content', m.getAttribute('content')
    .replace(/interactive-widget=[a-z-]+/, `interactive-widget=${hwkb ? 'overlays-content' : 'resizes-content'}`));
};
const setHwkb = (on) => { hwkb = on; try { localStorage.setItem(HW, on ? '1' : '0'); } catch { /* no storage */ } applyHwkb(); };
applyHwkb();

const LOOK = 'anansi.look';
const LOOK_KEYS = ['theme', 'font', 'size', 'scale'];
const SHIPPED = { theme: 'obsidian', font: 'serif', size: 'm', scale: '100' };
const MYLOOK = { ...SHIPPED };
// Wrapped because a private window throws on access rather than returning null.
try { Object.assign(MYLOOK, JSON.parse(localStorage.getItem(LOOK) || '{}')); } catch { /* no storage */ }
let look = { ...MYLOOK };
/** The cache, and only ever of the default. */
const cacheMine = () => {
  try { localStorage.setItem(LOOK, JSON.stringify(MYLOOK)); } catch { /* no storage */ }
};
/** Resolve what should be on screen: the book's look, over yours. `own` null means follow. */
function resolveLook(own) {
  look = { ...MYLOOK, ...(own ?? {}) };
  applyLook();
}
function applyLook() {
  root.dataset.uiTheme = look.theme; root.dataset.uiFont = look.font; root.dataset.uiSize = look.size;
  root.dataset.uiScale = look.scale ?? '100';
  // Every colour, derived from the theme's one row and written as custom properties. It replaced
  // three hand-written CSS blocks — which is why there were three themes and not nine, and why
  // the light one had to restate the greys and the gold by hand to avoid dark text on cream.
  // data-ui-theme stays: rules that are not colours still key on it, and so do the tests.
  const vars = themeVars(look.theme);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEMES[look.theme]?.paper ?? '#0A0A0C');
}

// ---------- state ----------
const S = {
  place: 'workspace', wpage: 'stories', panel: null, mode: 'speak', speaker: null, bigInput: false, arrived: null, seam: null,
  rail: !overlay(), storyId: null, busy: false, appearance: false, query: '',
  // WHICH menu the rail is showing, which is not the same question as where you are. The menu
  // button asks for the workspace one from inside a story; the story's name asks for the story
  // one. Set to 'story' on open and back to 'workspace' on leave, so the default still follows
  // you and only a deliberate press disagrees with it.
  railView: 'workspace',
  entryId: null, historyOf: null, models: null, allow: [], stats: null, ledgerKind: 'all', ledgerQ: '', ctxView: 'blocks',
  fieldHistory: null, confirmDelete: false, confirmDel: null, confirmStop: false, router: null, spark: null, ritual: null, setup: null,
  naming: false,        // Anansi is naming the chapter — declared, because an undefined field is a field nobody can find
  ctxOpen: false,       // the reading under the context bar, which is shut until the bar is pressed
  chaptersFor: null,    // the passage whose tray is showing the chapter list
  memoing: null,        // the passage being turned into a thread, while Anansi is thinking
  newsBusy: false, newsError: null,   // What changed, while Anansi is writing it
  modelMenu: false,     // the model list, open under the rail's footer

  imp: { name: null, data: null, preview: null, into: '', busy: false, done: null },
  lookTab: 'theme',     // which of Theme / Font / Size / UI the Aa menu is showing
  // Reading mode. Session-only on purpose: persisted, it would come back after a reload as a
  // composer that will not take a keystroke and no memory of why.
  reading: false,
  help: null,          // which web is open, if any
  // The bug report, kept in state so a repaint mid-typing does not eat it — the same lesson the
  // composer's draft taught seven times.
  bug: '', bugSending: false, bugUrl: null, bugError: null, lastError: null,
  prompts: null,        // { defaults, yours } once fetched; the open editor is `promptOpen`
  promptOpen: null,
  found: null,          // the passage a search result sent you to, marked until you move on
  searchAll: false,     // inside a story, search that story only unless asked otherwise
  setupQ: '',           // filter over the ledger on the next-chapter setup page
  lore: null,           // the + Lore tray above the composer, when it is open
  talk: { turns: [], busy: false, search: false, draft: null, searchable: null },
  blank: null,          // the Start blank form, when it is open
};
let LIB = [], V = null, MANI = null, MANI_EXACT = false, ACT = null, HITS = null, LEDGER = null, PROMPT = '';
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
//   strings   promises the story has made and not paid — what the ledger does NOT hold. It sits
//             under Threads at Seth's direction: the two are the same question asked twice, one
//             about what is true and one about what is owed, and reading them apart is the point.
// The middle field is a MARK now, not a character. Every one is a fragment of the orb-web at one
// hairline weight; the ⚙ ❧ ☙ ⟡ ◈ ⌕ ◐ ✻ they replace came from six Unicode blocks and never sat
// together as a set however they were sized.
const SNAV = [
  // Search first, at Seth's direction: it is the row you reach for when you are looking rather
  // than deciding, and a thing you look for is a thing you want at the top of the list.
  ['search', 'search', 'Search'],
  // Everything this book is waiting on, in one place — see the panel for why one place matters.
  ['waiting', 'threads', 'Waiting'],
  ['story', 'story', 'Story'], ['chapter', 'chapter', 'Chapter'],
  ['threads', 'threads', 'Threads'], ['strings', 'strings', 'Strings'],
  ['context', 'context', 'Context'],
  ['teller', 'teller', 'Storyteller'],
];
// Anansi came OFF this list on 2026-08-27. It is a button on the composer row, beside + Thread —
// asking her something is a thing you do while writing, not a place you navigate to, and having
// it in both put the same door in two rooms. The PANEL still exists and `data-panel="anansi"`
// still opens it; only the nav row is gone.
// Deep links and bookmarks still carry the old names, and so does a browser tab left open across
// the change. Cheaper to map them than to serve a blank panel.
const PANEL_WAS = { inspector: 'context', cast: 'threads', traj: 'chapter', queue: 'chapter', branches: 'chapter' };
const WNAV = [
  ['stories', 'stories', 'My stories'], ['create', 'create', 'Create a story'],
  ['canon', 'threads', 'Threads'], ['import', 'import', 'Import'],
  ['prefs', 'prefs', 'Preferences'],
  // Above Report an issue, which is where Seth put it: the two are the same conversation from
  // opposite ends — here is what changed, and here is what is wrong with it.
  ['news', 'book', 'What changed'], ['bug', 'bug', 'Report an issue'],
];
const TITLES = Object.fromEntries(SNAV.map(([k, , l]) => [k, l]));
// Panels the rail does not list: they open by clicking a thing, not a nav row. Being in here is
// what makes a panel REACHABLE BY HASH as well as titled — `readHash` validates the name against
// this map, so a panel missing from it has its deep link dropped and replaced by the default.
//
// `anansi` joined them on 2026-08-27 when it came off the rail for the composer row. Leaving it
// out broke `#<story>/anansi` silently: the link resolved to the default panel and the header had
// no title. Same shape as the retired names that had to be mapped BEFORE the validity check
// rather than after — a panel that exists and cannot be addressed is half a panel.
TITLES.entry = 'Ledger entry';
TITLES.history = 'History';
TITLES.setup = 'The next chapter';
TITLES.anansi = 'Anansi';
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
  news: () => ['What changed', 'written by Anansi, from the work itself'],
  bug: () => ['Report an issue', 'filed on the repo, without the prose'],
};

// One list, so a new action cannot be added to the markup and forgotten here — and so the
// names are visible in one place next to the data-ui-* look attributes they must not collide with.
// `more` left this list with the ⋯ handle it named. The tray opens on a double click now, which
// is its own native event and not a delegated action at all.
const ACTIONS = ['nav', 'rail', 'railview', 'leave', 'open', 'chapter', 'panel', 'appearance', 'theme',
  'fontpick', 'sizepick', 'scalepick', 'archive', 'readmode', 'sparkstep', 'spadd', 'spvoice', 'sendbug', 'home', 'owed', 'help',
  'mode', 're', 'del', 'ed', 'hi', 'vp', 'vn', 'flagx', 'mute', 'unmute', 'hwkb', 'bigin',
  'savestory', 'summarize', 'extract', 'decide', 'branch', 'newentry', 'entry',
  'spark', 'blank', 'backup', 'savegen', 'hit', 'expand', 'saveentry', 'delentry', 'backentry',
  'kind', 'act', 'pickmodel', 'fork', 'restore', 'lkind', 'ctxview', 'goblock', 'invent',
  'editprompt', 'saveprompt', 'resetprompt', 'rollup', 'delarc',
  'newstring', 'delstring', 'summon', 'stringstatus', 'looktab', 'askfill',
  'reroll', 'addstate', 'delstate', 'fieldhistory', 'revertfield', 'exportdb',
  'delstory', 'send', 'accept-spark', 'drop-spark', 'ritual', 'pin', 'place', 'savesetup',
  'skipsetup', 'doimport', 'dropimport', 'openimported',
  'continue', 'tolore', 'usetake', 'newlore', 'lorekind', 'loreread',
  'dropblank', 'makeblank', 'addoutfit', 'deloutfit', 'wear', 'storymodel', 'router',
  'ask', 'usedraft', 'copydraft', 'clearchat', 'copyentry', 'delcover',
  'saveoutfit', 'savestate', 'delall', 'stop', 'lookmine', 'lookfollow',
  'pullback', 'remember', 'name', 'ctxopen', 'chapters', 'memo', 'news',
  'dismiss', 'goflag', 'dropflag', 'modelmenu'].map((k) => `[data-${k}]`).join(',');

let toastT = null, searchT = null, foundT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---------- rail ----------
function drawRail() {
  // Which menu, not where you are. Inside a story the rail can be showing either one.
  const inStory = S.place === 'story' && V;
  const storyMenu = inStory && S.railView === 'story';
  const rows = storyMenu ? SNAV : WNAV;
  const active = storyMenu ? S.panel : S.wpage;
  const item = ([k, g, l]) => {
    const on = k === active;
    return `<button data-nav="${k}" style="display:flex; align-items:center; gap:13px; padding:11px 12px;
      border-radius:var(--r); margin-bottom:3px; white-space:nowrap; overflow:hidden; width:100%;
      background:${on ? 'rgba(217,178,106,.08)' : 'transparent'};
      border:1px solid ${on ? 'rgba(217,178,106,.22)' : 'transparent'}">
      <span style="width:19px; height:19px; display:flex; align-items:center; justify-content:center;
        flex:0 0 auto; color:${on ? 'var(--gold)' : 'var(--faint)'}">${mark(g)}</span>
      <span class="txt" style="font-size:14px; color:${on ? 'var(--ink-bright)' : 'var(--mute)'}">${esc(l)}</span></button>`;
  };
  // "Anansi's web" used to sit here as the way out of a story. It went on 2026-08-27: the menu
  // button in the bar opens the workspace menu from anywhere, which is the same one press, and two
  // doors to one room is one door too many — the argument that removed the hamburger, arriving
  // again. Seth: "anansies web can be removed from the story menu since we already have a button
  // that pulls up the main menu and its the same amount of clicks."
  const back = '';
  const tail = storyMenu
    ? `<div class="txt" style="padding:26px 12px 10px; font-size:10px; letter-spacing:.3em;
         font-variant-caps:all-small-caps; color:var(--dim)">Chapters</div>
       ${V.chapters.map((c) => `<button data-chapter="${c.id}" style="padding:8px 12px; font-size:13px;
         border-radius:var(--r); white-space:nowrap; overflow:hidden; width:100%; text-overflow:ellipsis;
         color:${c.id === V.currentChapter.id ? 'var(--gold-lit)' : 'var(--faint)'}"><span class="txt">${
         esc(c.title || `Chapter ${c.index}`)}</span></button>`).join('')}`
    : (LIB.length ? `<div class="txt" style="padding:26px 12px 10px; font-size:10px; letter-spacing:.3em;
         font-variant-caps:all-small-caps; color:var(--dim)">Open</div>
       ${LIB.slice(0, 4).map((s) => `<button data-open="${s.id}" style="padding:8px 12px; font-size:13px;
         color:var(--gold-lit); border-radius:var(--r); white-space:nowrap; overflow:hidden; width:100%; text-overflow:ellipsis"
         ><span class="txt">${esc(s.title)}</span></button>`).join('')}` : '');

  $('rail').innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; padding:26px 20px 20px; flex:0 0 auto">
      <button data-home="1" aria-label="Anansi — back to my stories"
        style="display:flex; align-items:center; gap:10px; padding:0; text-align:left">
        <img src="./web/icon.svg" alt="" style="width:24px; height:24px; border-radius:var(--r); display:block; flex:0 0 auto">
        <span class="serif txt" style="font-size:26px; color:var(--ink-bright)">Anansi</span>
      </button>
      <button data-rail="1" style="margin-left:auto; color:var(--faint); display:flex;
        align-items:center; justify-content:center; padding:6px 8px"
        aria-label="${S.rail ? 'Close the menu' : 'Open the menu'}"
        ><span style="display:flex; transform:rotate(${phone() ? 90 : (S.rail ? 180 : 0)}deg);
          transition:transform var(--t-slow) var(--ease-out)">${mark('chevron', 16)}</span></button>
    </div>
    ${back}
    <!-- flex:1 with min-height:0 is what makes overflow-y:auto actually engage. A flex child's
         min-height is auto by default, so it refuses to shrink below its content and GROWS instead
         of scrolling — the list ran off the bottom of a rail that is overflow:hidden, and on a
         phone, where the rail is the whole screen, the chapters simply were not reachable. -->
    <div class="scroll" style="flex:1; min-height:0; padding:0 16px; display:flex; flex-direction:column"
      >${rows.map(item).join('')}${tail}</div>
    <!-- The model, and the place to change it. It was a label: the one thing on this rail that
         named something you can act on and could not be acted on. Preferences still holds the
         allowlist, the router's state and the stop/restart — this is the switch, where you are
         already looking when you wonder what is writing. -->
    <button data-modelmenu="1" aria-expanded="${!!S.modelMenu}"
      style="margin-top:auto; padding:14px 20px; border-top:1px solid var(--line); display:flex;
      align-items:center; gap:12px; white-space:nowrap; overflow:hidden; width:100%; text-align:left">
      <span style="width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${SRV.slot ? 'var(--good)' : 'var(--warn)'}"></span>
      <span class="txt" style="display:flex; flex-direction:column; gap:2px; min-width:0">
        <span style="font-size:13px; color:var(--ink); overflow:hidden; text-overflow:ellipsis"
          title="${esc(SRV.model || '')}">${esc(modelName(SRV.model).name)}</span>
        <span style="font-size:11px; color:var(--dim)">${SRV.slot
          ? `slot ${SRV.slot.perSlot.toLocaleString()}` : 'llama-server asleep'}</span>
      </span></button>
    ${S.modelMenu ? `<div class="scroll" style="max-height:46vh; border-top:1px solid var(--line);
      padding:8px 12px 12px; display:flex; flex-direction:column; gap:2px">
      ${S.models === null ? '<div class="hint" style="margin:0">Asking the router&hellip;</div>'
        : S.models.length === 0 ? emptyModels()
        : S.models.map((m) => `<button data-pickmodel="${esc(m.id)}"
            style="display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:var(--r);
            width:100%; text-align:left; background:${m.id === SRV.model ? 'rgba(217,178,106,.10)' : 'transparent'}">
            <span style="width:6px; height:6px; border-radius:50%; flex:0 0 auto; background:${
              m.id === SRV.model ? 'var(--gold)' : m.status === 'unloaded' ? 'var(--edge-lit)' : 'var(--good)'}"></span>
            <span class="txt" style="font-size:12.5px; min-width:0; overflow:hidden; text-overflow:ellipsis;
              color:${m.id === SRV.model ? 'var(--gold-lit)' : 'var(--mute)'}">${esc(modelName(m.id).name)}</span>
          </button>`).join('')}
      <div class="hint" style="margin:6px 0 0">Yours, not the box's — a story that names its own
        model still wins. Switching releases the one you were on.</div>
    </div>` : ''}`;
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

/** How much of this model's context the next call is already spoken for, or null when there is
 *  no manifest to say. ONE definition, because it is now drawn in two places — the pill in the
 *  chrome and the meter in the running head — and two of these would drift the first time the
 *  budget changed shape.
 *
 *  A zero budget is a state, not a number. Dividing by it gave "Context Infinity%", the way the
 *  un-clamped version gave "Context -168%". */
function contextPct() {
  return MANI && MANI.totals.budget > 0
    ? Math.round(MANI.totals.used / MANI.totals.budget * 100) : null;
}

/** The meter under the header, and the readout it opens.
 *
 *  Its own function because it is its own strip: `drawBar` owns the header, `drawDoc` owns the
 *  document, and this sits between them. Everything in the readout used to be in one or the other
 *  — the word count beside the story title, the context percentage as a pill, which chapter you
 *  are on inside a running head that is invisible until you scroll. Seth wanted one bar across the
 *  window and the numbers behind a press, so this is the one place that draws them. */
function drawMeter() {
  const bar = $('ctxbar'), read = $('ctxread');
  if (!bar || !read) return;
  const inStory = S.place === 'story' && V;
  const pct = contextPct();
  // NO ROOM IS NOT NO BAR. A budget of zero — the slot unknown because llama-server is unreachable,
  // or a prompt that will not fit — makes `contextPct` null, and hiding the meter for it took the
  // bar away at exactly the moment it says the most. Full and red, with the reason in the reading.
  const noRoom = !!MANI && MANI.totals.budget <= 0;
  if (!inStory || !MANI) { bar.hidden = true; read.hidden = true; return; }
  const fill = pct == null ? 100 : Math.min(100, pct);

  const ch = V.currentChapter;
  const at = V.chapters.findIndex((c) => c.id === ch.id);
  const words = V.passages.filter((p) => p.chapterId === ch.id)
    .reduce((n, p) => n + (String(p.body).match(/\S+/g) || []).length, 0);
  const h = horizon();

  bar.hidden = false;
  bar.className = (pct == null || pct >= 100) ? 'full' : '';
  bar.setAttribute('aria-expanded', String(!!S.ctxOpen));
  bar.dataset.ctxopen = S.ctxOpen ? '0' : '1';
  bar.setAttribute('aria-label', pct == null
    ? 'No room — the prompt does not fit' : `Context ${pct}% of what this model can hold`);
  bar.title = pct == null
    ? 'No room. Press for what is in it.'
    : `${pct}% of this model's context is spoken for. Press for the reading.`;
  bar.innerHTML = `<i style="width:${fill}%"></i>`;

  read.hidden = !S.ctxOpen;
  if (!S.ctxOpen) return;
  read.innerHTML = `
    <span>chapter ${at + 1} of ${V.chapters.length}</span>
    <span class="tnum">${words.toLocaleString()} words</span>
    <span class="tnum" style="color:${(pct == null || pct >= 100) ? 'var(--bad)' : 'var(--gold-dim)'}">${
      pct == null ? (noRoom ? 'no room' : 'context unknown') : `context ${pct}%`}</span>
    ${h ? `<span style="color:var(--gold-dim)">${h.chapters} ${
      h.chapters === 1 ? 'chapter' : 'chapters'} not sent</span>` : ''}
    <button data-panel="context" style="margin-left:auto">what is in it &rsaquo;</button>`;
}

function drawBar() {
  const inStory = S.place === 'story' && V;
  const pct = contextPct();
  const noRoom = !!MANI && MANI.totals.budget <= 0;
  const words = inStory ? V.passages.reduce((n, p) => n + (String(p.body).match(/\S+/g) || []).length, 0) : 0;
  // THE BOOK AND THE MODEL. The chapter and the count live in the running head inside the
  // document now, where they scroll with the prose they describe — carrying them here too said
  // the chapter's name twice inside sixty pixels.
  // THE BOOK AND THE MODEL. The chapter and the count live in the running head inside the
  // document now, where they scroll with the prose they describe — carrying them here too said
  // the chapter's name twice inside sixty pixels.
  //
  // The CHAPTER under the book, since 2026-08-27. It was the model's name — a fact about the box,
  // sitting in the one place on screen that is about the writing. The chapter is what you are in;
  // the model is in the rail's footer, where it can also be changed.
  const [title, sub] = inStory
    ? [V.story.title, V.currentChapter.title || `Chapter ${V.currentChapter.index}`]
    : (WTITLES[S.wpage] || WTITLES.stories)();
  $('bar').innerHTML = `
    <div style="flex:1 1 auto; min-width:100px; display:flex; flex-direction:column; gap:3px; overflow:hidden">
      ${inStory ? `<button data-railview="story" aria-label="This story's menu"
        style="display:block; text-align:left; padding:0; max-width:100%; overflow:hidden">` : ''}
      <span class="serif" style="font-size:23px; line-height:1; color:var(--chrome-ink);
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block">${esc(title)}</span>
      ${inStory ? '</button>' : ''}
      ${sub ? `<span class="up" style="font-size:10.5px; color:var(--label); white-space:nowrap;
        overflow:hidden; text-overflow:ellipsis">${esc(sub)}</span>` : ''}
      <!-- decoded below, after the element exists -->
    </div>
    <div style="margin-left:auto; display:flex; align-items:center; gap:10px; flex:0 0 auto">
      ${inStory ? `${noRoom
        // A refusal stays in the header. "No room" is not a reading, it is the app saying it
        // cannot write — that has to be visible without pressing anything.
        ? `<button class="pill deskonly" data-panel="context"
            style="border-color:var(--bad); color:var(--bad)">No room</button>` : ''}
      ${(() => {
        const h = horizon();
        return h ? `<button class="pill deskonly" data-panel="context"
          style="border-color:rgba(217,178,106,.42); color:var(--gold-dim)"
          title="Their summaries no longer reach the model. Chapter → Acts collapses them into one."
          >${h.chapters} ${h.chapters === 1 ? 'chapter' : 'chapters'} not sent</button>` : '';
      })()}
      <button class="pill" data-readmode="${S.reading ? '0' : '1'}" aria-pressed="${S.reading}"
        aria-label="${S.reading ? 'Leave reading mode' : 'Reading mode'}"
        title="${S.reading ? 'Leave reading mode' : 'Read without the composer, and without the prose taking taps'}"
        style="display:flex; align-items:center; padding:6px 11px; color:${S.reading ? 'var(--gold)' : 'var(--chrome-dim)'}"
        >${mark('book', 17)}</button>
      <button class="pill" data-appearance="1" aria-pressed="${S.appearance}"
        style="font-family:'Instrument Serif',serif; font-size:15px; line-height:1; padding:7px 13px">Aa</button>
`
      : `<button class="pill deskonly" data-open="new">New story</button>
         ${LIB.length ? `<button data-open="${LIB[0].id}" style="font-size:12px; letter-spacing:.1em;
           font-variant-caps:all-small-caps; color:var(--on-gold); background:var(--gold); padding:9px 18px;
           border-radius:var(--r); font-weight:500; white-space:nowrap">Resume writing</button>` : ''}`}
      <!-- OUTSIDE the in-story branch, and that is the whole point. The first version of this put it
           inside, so with the hamburger gone there was no way into the menu from the shelf at all —
           a hole, not a missing nicety. One door to the menu, on every screen. -->
      <!-- Same glyph size and same padding as Reading mode beside it. At 19 against the book's 17
           it sat a little large and a little wide, and three controls in a row show that. -->
      <button class="pill phoneonly" data-railview="workspace" aria-label="Menu"
        style="display:flex; align-items:center; padding:6px 11px; color:var(--chrome-dim)"
        >${mark('web', 17)}</button>
    </div>`;
  // The title, and the line under it that names the chapter. Both are leaf spans holding nothing
  // but text, which is what decode() needs — it writes textContent.
  decode($('bar').querySelector('.serif'), 'title');
  decode($('bar').querySelector('.up'), 'sub');
}

/** Why the model list is empty, and they are not the same why.
 *
 *  It said "The router did not answer" for both, and on 2026-08-27 that sent Seth looking at a
 *  service that was working perfectly: the router served fourteen models and `ANANSI_MODELS` was
 *  still `write-*,rp-*` from before the presets were renamed, so `allowed()` filtered every one of
 *  them out. An allowlist that matches nothing is a configuration problem with a one-line fix, and
 *  telling somebody to restart a healthy server instead is the wrong instruction twice over.
 *
 *  `allow` comes back on the same response for exactly this — it was already being sent so the
 *  screen could say WHY only three of eight were listed, and nothing read it when the answer was
 *  none of them. */
function emptyModels() {
  const allow = S.allow ?? [];
  if (!allow.length) {
    return `<div class="hint" style="margin:0">The router did not answer, or it serves nothing.
      Preferences can restart it.</div>`;
  }
  return `<div class="hint" style="margin:0; color:var(--warn)">The router answered, and your
    allowlist matched none of it. <code>ANANSI_MODELS</code> is
    <code>${esc(allow.join(', '))}</code> &mdash; if the models on the box were renamed, this is
    the line to change. Unset it to offer everything the router serves.</div>`;
}

function drawAppearance() {
  const el = $('appearance');
  el.hidden = !S.appearance;
  if (!S.appearance) return;
  // From the table, so a theme added there appears here without a second list to keep in step.
  const themes = Object.entries(THEMES);
  // The last four are system stacks, so the list does not add a font to download. See app.html.
  const fonts = [['serif', 'Instrument Serif', "'Instrument Serif',Georgia,serif"],
                 ['sans', 'IBM Plex Sans', "'IBM Plex Sans',sans-serif"],
                 ['book', 'Iowan / Palatino', "'Iowan Old Style',Palatino,Georgia,serif"],
                 ['garamond', 'Garamond', "Garamond,Baskerville,'Times New Roman',serif"],
                 ['system', 'System', "system-ui,-apple-system,'Segoe UI',sans-serif"],
                 ['mono', 'Monospace', "ui-monospace,Menlo,Consolas,monospace"]];
  const tabs = [['theme', 'Theme'], ['font', 'Font'], ['size', 'Size'], ['scale', 'UI']];
  const tab = S.lookTab ?? 'theme';

  // THE SWATCH IS A DISC, HALF PAPER AND HALF ACCENT. Six of the nine themes are near-black —
  // #0A0A0C, #0B0B0C, #07090E, #0A0D0B, #0C0C0C, #08090C — so a circle of the paper alone gave six
  // circles nobody could tell apart.
  //
  // Split down the VERTICAL, not on a diagonal. A 135° cut at 52% put a corner-shaped wedge in the
  // frame and the eye read the whole thing as a folded square however round the element was. A
  // straight vertical edge through the middle reads as one disc in two colours, which is what it
  // is. Bigger too — 26px, because two colours in 22px with a border between them is mud.
  const swatch = (t) => `<span style="width:26px; height:26px; border-radius:50%; flex:0 0 auto;
    display:block; overflow:hidden;
    background:linear-gradient(90deg, ${t.swatch} 0 50%, ${t.accent} 50% 100%);
    box-shadow:inset 0 0 0 1px ${t.dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.2)'}"></span>`;

  const body = tab === 'theme'
    ? `<div style="display:flex; flex-direction:column; gap:7px">${themes.map(([k, t]) => `
        <button data-theme="${k}" style="display:flex; align-items:center; gap:11px; padding:8px 10px;
          border-radius:var(--r); border:1px solid ${look.theme === k ? 'var(--gold)' : 'var(--chip)'}; width:100%">
          ${swatch(t)}
          <span style="font-size:13px; color:${look.theme === k ? 'var(--ink)' : 'var(--mute)'}">${esc(t.label)}</span>
        </button>`).join('')}</div>`
    : tab === 'font'
    ? `<div style="display:flex; flex-direction:column; gap:7px">${fonts.map(([k, l, fam]) => `
        <button class="chip" data-fontpick="${k}" aria-pressed="${look.font === k}"
          style="font-family:${fam}; font-size:15px">${l}</button>`).join('')}</div>`
    : tab === 'size'
    ? `<div style="display:flex; flex-direction:column; gap:7px">
        <div style="display:flex; gap:5px">${['xs', 's', 'm', 'l', 'xl'].map((k) => `
          <button class="chip" data-sizepick="${k}" aria-pressed="${look.size === k}"
            style="flex:1; text-align:center; padding:9px 0; letter-spacing:.08em; font-size:11.5px">${k.toUpperCase()}</button>`).join('')}</div>
        <span class="hint" style="margin:0">The prose and the column it sits in.</span></div>`
    // A separate axis: Size moves the prose, UI moves the chrome around it.
    : `<div style="display:flex; flex-direction:column; gap:7px">
        <div style="display:flex; gap:5px">${[['90', 'S'], ['100', 'M'], ['110', 'L'], ['125', 'XL']].map(([k, l]) => `
          <button class="chip" data-scalepick="${k}" aria-pressed="${(look.scale ?? '100') === k}"
            style="flex:1; text-align:center; padding:9px 0; letter-spacing:.08em; font-size:11.5px">${l}</button>`).join('')}</div>
        <span class="hint" style="margin:0">The rail, the panels and the buttons. Leaves the prose alone.</span></div>`;

  // WHICH of the two you are changing. Inside a book these controls set that book's look; on the
  // shelf they set your default. Said out loud, because the same four tabs doing two different
  // things with no label is how you restyle every book you own while meaning to restyle one.
  const inStory = S.place === 'story' && S.storyId;
  const ownLook = inStory && V?.look && Object.keys(V.look).length > 0;

  el.innerHTML = `
    <div class="sheet-head" style="display:flex; align-items:center; gap:10px">
      <span style="font-size:10px; letter-spacing:.1em; font-variant-caps:all-small-caps; color:var(--dim)">${
        inStory ? 'This book' : 'Every book'}</span>
      <button data-appearance="0" style="margin-left:auto; color:var(--faint); font-size:12px" aria-label="Close">✕</button>
    </div>
    <div style="display:flex; gap:6px">${tabs.map(([k, l]) => `
      <button data-looktab="${k}" aria-pressed="${tab === k}" style="flex:1; text-align:center;
        padding:7px 0; font-size:11.5px; border-radius:var(--r);
        border:1px solid ${tab === k ? 'var(--gold)' : 'var(--chip)'};
        background:${tab === k ? 'rgba(217,178,106,.10)' : 'transparent'};
        color:${tab === k ? 'var(--gold-lit)' : 'var(--mute)'}">${l}</button>`).join('')}</div>
    ${body}
    ${inStory ? `<div style="display:flex; flex-direction:column; gap:6px; padding-top:11px;
      border-top:1px solid var(--line)">
      <span class="hint" style="margin:0">${ownLook
        ? 'This book has a look of its own.'
        : 'This book follows your default. Changing anything above gives it one.'}</span>
      <div style="display:flex; gap:6px">
        <button class="btn ghost" data-lookmine="1" style="flex:1; font-size:12px">Make this my default</button>
        ${ownLook ? '<button class="btn ghost" data-lookfollow="1" style="flex:1; font-size:12px">Follow my default</button>' : ''}
      </div></div>` : ''}
    <div style="display:flex; flex-direction:column; gap:6px; padding-top:11px;
      border-top:1px solid var(--line)">
      <span style="font-size:10px; letter-spacing:.1em; font-variant-caps:all-small-caps;
        color:var(--dim)">This device</span>
      <button data-hwkb="1" aria-pressed="${hwkb}" style="display:flex; align-items:center; gap:10px;
        text-align:left; padding:9px 11px; border-radius:var(--r);
        border:1px solid ${hwkb ? 'var(--gold)' : 'var(--chip)'};
        background:${hwkb ? 'rgba(217,178,106,.10)' : 'transparent'}">
        <span style="font-size:12.5px; color:${hwkb ? 'var(--gold-lit)' : 'var(--mute)'}">Hardware keyboard</span>
        <span style="margin-left:auto; font-size:10.5px; color:var(--faint)">${hwkb ? 'on' : 'off'}</span>
      </button>
      <span class="hint" style="margin:0">Keeps the caret in the box, so you can keep typing after
        a press instead of reaching back for it. This one stays on this device — a phone has no
        hardware keyboard, and there it would only hold the on-screen one open over the prose.</span>
    </div>`;
}

// ---------- the document ----------
/** `opening` is the first passage of the chapter: it carries the drop cap, and only when it is
 *  narration — a drop cap on a line of dialogue sets a quotation mark two inches tall. */
function passageHTML(p, newest, opening) {
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
  // THE ⋯ IS GONE, 2026-08-27. A double tap opens the tray and has since F34's fix, so the dot
  // row was a second door to the same place — sitting over the prose on every passage, on hover on
  // the desk and permanently on a phone. Seth: "remove the three dots from the reponse box. we have
  // double tap now."
  //
  // READING MODE keeps the tray but not all of it. The composer is gone there and the prose does
  // not take taps, so the actions that WRITE have nothing to write into: what is left is the three
  // that make sense while reading — roll this again, take it somewhere else, go to another chapter.
  const acts = `<div class="acts">
    ${v.length > 1 ? `<span class="wr" style="display:flex; align-items:center; gap:4px; padding:8px 6px; font-size:12px; color:var(--faint)">
      <button data-vp="${p.id}">‹</button>${at}/${v.length}<button data-vn="${p.id}">›</button></span>` : ''}
    <button data-re="${p.id}"><span class="serif" style="color:var(--gold)">↻</span><span class="lbl-txt">Regenerate</span></button>
    <!-- "Remember this." The writer's own recall: the model has forgotten something that happened,
         so you point at the passage it happened in. It goes to Anansi as an INSTRUCTION rather than
         as prose to continue or a line somebody said, comes back as facts rather than as sentences
         (F36), and lands in the queue with the chapter it came from. -->
    <button class="wr" data-memo="${p.id}" ${S.memoing === p.id ? 'disabled' : ''}><span class="serif"
      style="color:var(--gold)">✦</span><span class="lbl-txt">${
      S.memoing === p.id ? 'Asking&hellip;' : 'Remember this'}</span></button>
    <button class="wr" data-ed="${p.id}"><span class="serif" style="color:var(--gold)">✎</span><span class="lbl-txt">Edit</span></button>
    <button class="wr" data-hi="${p.id}"><span class="serif" style="color:var(--gold)">⌂</span><span class="lbl-txt">History</span></button>
    <!-- Branching was BUILT and unreachable: "Branch from this passage" sat at the bottom of the
         History panel, below the edits list, three steps in and under the fold. Seth reported it as
         a missing feature. It is here now, where you already are when you are thinking about this
         passage. The button in History stays — the two are the same action. -->
    <button data-fork="${p.id}"><span class="serif" style="color:var(--gold)">⑂</span><span class="lbl-txt">Branch</span></button>
    <!-- Where you can go from here, while reading. A toggle rather than a list, because a book of
         forty chapters is forty rows in a tray that is meant to be glanced at. -->
    <button data-chapters="${p.id}" class="readonly"><span class="serif" style="color:var(--gold)">§</span><span
      class="lbl-txt">Skip to chapter</span></button>
    ${S.chaptersFor === p.id ? `<div class="chaplist">${V.chapters.map((c) => `<button data-chapter="${c.id}"
      ${c.id === V.currentChapter.id ? 'aria-current="true"' : ''}>${esc(c.title || `Chapter ${c.index}`)}</button>`).join('')}</div>` : ''}
    <button class="wr" data-del="${p.id}" style="color:var(--bad)"><span class="serif">✕</span><span class="lbl-txt">${
      v.length > 1 ? `Delete take ${at}` : 'Delete'}</span></button>
    <!-- Deleting a rerolled passage removed the take on screen and promoted the next one, so the
         block stayed put holding different words — four presses to remove a passage rerolled three
         times, each one looking like it had failed. Only shown when there IS more than one take;
         with one, Delete above already is all of them. -->
    ${v.length > 1 ? `<button class="wr" data-delall="${p.id}" style="color:var(--bad)"><span class="serif">⌫</span><span
      class="lbl-txt">Delete all ${v.length} takes</span></button>` : ''}</div>`;

  const body = spoken
    ? `<div class="who">${p.speaker ? esc(p.speaker)
         : mine ? `You · ${esc(V.story.persona || 'you')}` : esc(V.story.title)}</div>
       <div class="said" data-edit="${p.id}">${esc(p.body)}</div>`
    : `<div class="narr" data-edit="${p.id}" data-raw="${esc(p.body)}">${
         // Paragraphs for READING. Edit swaps this back to the raw text — see the handler — because
         // textContent over <p> children concatenates with nothing between them, and a save would
         // glue the whole passage into one line.
         bookParagraphs(p.body).map((para) => `<p>${esc(para)}</p>`).join('')}</div>`;
  const flagged = flags.map((f) => {
    const e = V.entries.find((x) => x.id === f.entryId);
    // The reason is whatever the checker returned, and a reasoning model has put 3,321
    // characters in one. Clamped in CSS and expandable, never trusted to be a sentence.
    // Two different faults wear the same red line otherwise. `reached: false` means the engine
    // never sent that entry for this passage — the model could not have honoured it, and the fix
    // is a trigger word or always-on, not a rewrite. Saying "contradiction" there blames the
    // writer for the engine's omission.
    const unseen = f.reached === false;
    // THE WAY OUT IS A BUTTON, NOT A MODIFIER. Dismissing used to be shift-click on this line, and
    // a phone has no shift key — so on the surface Seth writes on there was no way to clear a flag
    // at all without opening the Waiting panel. Expanding reveals two real presses instead.
    // Buttons cannot nest, so the flag stays the expander and the actions are its sibling.
    return `<button class="flag" data-flagx="${f.id}" aria-expanded="false" title="Show what to do about it">
      <span style="width:5px; height:5px; border-radius:50%; flex:0 0 auto; margin-top:6px;
        background:${unseen ? 'var(--warn)' : 'var(--bad)'}"></span>
      <span${unseen ? ' style="color:var(--warn)"' : ''}>${unseen
        ? `Never sent · ${esc(e?.title ?? 'canon')} contradicts this, and the model was not shown it`
        : `Contradiction · ${esc(e?.title ?? 'canon')}`}${f.reason ? ` — ${esc(f.reason)}` : ''}</span></button>
      <div class="flagacts">
        <button data-dropflag="${f.id}">Dismiss this one</button>
        ${f.entryId ? `<button data-mute="${f.entryId}">Ignore ${esc(e?.title ?? 'it')} in this chapter</button>` : ''}
      </div>`;
  }).join('');
  // Only on the last passage, because "carry on from here" and "roll this again" both mean the
  // end of the page. On any earlier passage Regenerate still lives in its ⋯ tray, where it has
  // always been — this is the same action given a door you do not have to open.
  const carry = newest ? `<div class="carry">
    <button data-re="${p.id}" ${S.busy ? 'disabled' : ''}><span class="serif"
      style="color:var(--gold)">↻</span> Regenerate</button>
    <button data-continue="1" ${S.busy ? 'disabled' : ''}
      title="Carry on with no prompt">Continue &rsaquo;</button></div>` : '';

  const cls = `block${mine ? ' you' : spoken ? ' speak' : ''}${p.directed && !mine ? ' directed' : ''}${p.id === S.found ? ' found' : ''}${p.id === S.arrived ? ' arrived' : ''}`
    // The drop cap goes on plain model narration only. Not on speech — a two-inch quotation mark
    // is not a drop cap — and not on the writer's own passages, which are set differently: on
    // Sutera the first passage is the writer's and is right-aligned, so a left-floated capital
    // sat on its own with the text running away from it.
    + (newest ? ' newest' : '') + (opening && !spoken && !mine ? ' opening' : '');
  return `<div class="${cls}">${body}${acts}${flagged}</div>${carry}`;
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
  const words = ps.reduce((n, p) => n + (String(p.body).match(/\S+/g) || []).length, 0);

  // The chapter opens with a band: what number it is, what it is called, and a line out of its own
  // prose. Then a rule, and the prose itself begins with a drop cap. A chapter used to start with
  // a 10px label and go straight into the paragraph, which reads as a feed rather than a book.
  const epi = epigraphOf(ps);
  // The cover again, at the head of the chapter, when the book asks for it. Same picture, same
  // scrim and same serif as the shelf card — a second treatment of one image is two things to keep
  // in step. Single quotes inside the url(), because this sits in a style="…" attribute and a
  // double quote ends that attribute at `background:url(`, which cost the shelf both its cover
  // and its gradient once already.
  // THE COVER, BEHIND THE PROSE. Two shapes, and the story picks: a plate at the head of the
  // chapter that scrolls away with it, or — since 2026-08-27 — the picture staying put while the
  // prose moves over it, faded left to right into the page.
  //
  // The sticky one is drawn OUTSIDE the column, as a backdrop of #doc, because a sticky element
  // inside a scroller can only stay within its own parent: put in #col it would scroll away with
  // the chapter it belongs to, which is the thing it exists not to do.
  const wantsCover = V.story.chapterHero && V.cover;
  const stick = wantsCover && V.story.chapterSticky;
  const back = $('backdrop');
  if (back) {
    back.hidden = !stick;
    if (stick) {
      // The image at the story's own strength, and the gradient over it going LEFT TO RIGHT from
      // nothing to the page's own colour — so the picture is whole down one side and the prose
      // reads off paper down the other. The end colour is the theme's token and not a literal:
      // nine themes, and web/model.js exists because 162 raw hexes meant a theme was only ever
      // half applied.
      back.innerHTML = `<i style="background-image:url('${api.coverUrl(S.storyId, V.cover)}');
        opacity:${Math.max(0, Math.min(100, V.story.coverOpacity ?? 30)) / 100}"></i><u></u>`;
    } else back.innerHTML = '';
  }
  const plate = wantsCover && !stick
    ? `<div class="plate" style="background:url('${api.coverUrl(S.storyId, V.cover)}') center/cover no-repeat">
        <span class="fade"></span>
        <span class="serif plate-title">${esc(ch.title || `Chapter ${ch.index}`)}</span></div>`
    : '';
  // The reading column opens 40px down, which is right when a chapter begins with a text band and
  // wrong when it begins with a picture: the gap reads as dead space above the image rather than
  // as air above a title. Seth: "theres alot of space that can be removed ... its only there with
  // the header". The class says which of the two this chapter is.
  $('doc')?.classList.toggle('plated', !!plate);
  $('doc')?.classList.toggle('behind', !!stick);
  col.innerHTML = `
    ${plate}
    <div class="band">
      <div style="font-size:11.5px; letter-spacing:.1em; font-variant-caps:all-small-caps; color:var(--label)">
        Chapter ${ch.index}</div>
      ${plate ? '' : `<div class="serif band-title">${esc(ch.title || `Chapter ${ch.index}`)}</div>`}
      ${epi ? `<div class="band-epi"><i></i><span class="serif">${esc(epi)}</span></div>` : ''}
      <div class="band-rule"></div>
    </div>
    ${ps.map((p, i) => passageHTML(p, i === ps.length - 1, i === 0)).join('') || `<div class="narr" style="opacity:.6">${
      V.chapters.length > 1 ? 'Nothing in this chapter yet.' : 'Nothing written yet. The composer is below.'}</div>`}
`;
  if (tip) read.scrollTop = read.scrollHeight;

  // THE RUNNING HEAD IS GONE, 2026-08-27. It opened on scroll, moved the prose down to make room
  // for itself, and by then said only the chapter's name — everything else in it had moved to the
  // reading under the context bar. Seth: "on scroll theres chapter bar that gets triggered. remove
  // that." A strip that appears while you are reading is a strip that interrupts reading.
  // The column was just rebuilt, so no tray survived it. The scrim has to know, or a repaint
  // while one was open leaves the backdrop up over a page with nothing modal on it.
  syncTray();
}

/** Ask Anansi what this chapter is called and what it has to do, and put the answer in the boxes.
 *
 *  Into `S.setup` rather than into the DOM, because the panel renders from state — ticking a
 *  character repaints it, and an answer written straight into the inputs would be thrown away by
 *  the next repaint, which is the same fault the composer's draft taught seven times. */
async function nameChapter(chapterId) {
  if (S.naming) return;
  S.naming = true; drawSide();
  const r = await api.proposeChapter(S.storyId, chapterId);
  S.naming = false;
  // An answer with no title is not an answer. Checking only `r.error` wrote `undefined` into
  // the title box, and the next read of it threw on `.trim()` — the panel stopped rendering at
  // all. Found by the stub DOM answering this route with {}, which is exactly what a route that
  // half-fails does.
  if (r.error || !r.title) { drawSide(); return toast(r.error || 'nothing usable came back'); }
  // Whatever is already typed WINS. This fires on its own when both boxes are empty, and a writer
  // who started typing in the seconds it took is a writer whose words must not be replaced.
  const ch = V?.chapters.find((c) => c.id === chapterId);
  const live = { title: document.querySelector('[data-setup="title"]')?.value ?? '',
                 note: document.querySelector('[data-setup="note"]')?.value ?? '' };
  const typed = live.title.trim() && live.title.trim() !== `Chapter ${ch?.index}` ? live.title.trim() : '';
  S.setup = { title: typed || r.title, note: live.note.trim() || r.note };
  drawSide();
  toast('Anansi suggests. Both boxes are yours to change, and nothing is saved until you press Save.');
}

/** A look change, and the only thing that decides where it is saved: whether a book is open.
 *
 *  Inside a story it is that BOOK's look, and the whole set is pinned rather than the difference
 *  from your default — "this book has its own look" is a thing a writer can hold in their head,
 *  where "this book overrides two of the four, so changing your default moves the other two"
 *  is not. Outside one it is your default.
 *
 *  Painted before it is saved. The setting is already applied by the time the round trip starts,
 *  so a slow answer never shows as a control that did not respond. */
async function changeLook(patch) {
  Object.assign(look, patch);
  applyLook(); drawAppearance();
  const inStory = S.place === 'story' && S.storyId;
  if (!inStory) {
    Object.assign(MYLOOK, patch); cacheMine();
    const r = await api.saveLook({ look: MYLOOK });
    return void (r.error && toast(r.error));
  }
  const own = {}; for (const k of LOOK_KEYS) own[k] = look[k];
  const r = await api.saveLook({ storyId: S.storyId, look: own });
  if (r.error) return void toast(r.error);
  V = r;
  // The shelf card and the panel both read V, and the story panel says whether this book has a
  // look of its own — so the first change has to repaint it, or the row stays saying it follows.
  drawAppearance();
}

/** The generation in flight, or null. Held here rather than passed around because the thing that
 *  stops it — the Stop button — is nowhere near the thing that started it, and both are one press
 *  apart in the same corner of the screen. */
let STOP = null;

/** The story the composer was last drawn for. A draft belongs to its book: paging a chapter or
 *  opening a panel must not eat it, and opening a different book must not carry it across. */
let DOCK_FOR = null;

function drawDock() {
  if (!(S.place === 'story' && V)) { $('dock').hidden = true; DOCK_FOR = null; return; }
  $('dock').hidden = false;
  $('dock').classList.toggle('big', !!S.bigInput);
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

  // WHO you are speaking or acting as, on its own row above the mode rail and spanning the dock
  // rather than the column. It sat at the right-hand end of the rail, where it read as one more
  // mode and ran out of room the moment a name was long — Seth: "right now its awkwardly placed".
  // Outside #dockCol, which is capped at the column width; this is the full window.
  // The mode on the root element, so the stylesheet can tint the speaker strip and its own mode
  // button from one rule each — two inline styles would have to agree about a colour, and the pair
  // reading as one lifted block depends on them being exactly the same one.
  //
  // SET HERE, not in applyLook. Switching mode calls drawDock and nothing else, so an attribute
  // written in applyLook went stale the moment you pressed a different mode: Act kept its tinted,
  // rounded background after you had left it. This function is the one that draws the row, so the
  // attribute and the row cannot disagree.
  //
  // `uiMode`, NOT `mode`. `data-mode` is already a click action on the four buttons, and a name
  // doing two jobs is the bug BUILD-STATE's table opens with — `data-theme` was both the look on
  // <html> and an action, so `closest()` matched <html> on every click and nothing was editable.
  root.dataset.uiMode = S.mode;

  const asRow = $('asRow');
  if (asRow) {
    asRow.hidden = !asWhom;
    // EMPTIED, not just hidden. Leaving the select in the DOM behind `hidden` left Direct and
    // Narrate carrying a speaker control that a presence check can still find and a keyboard can
    // still reach — and those two modes have no speaker by definition: an instruction is not
    // spoken by anyone. The inverse of the lie `visible()` exists to catch.
    if (!asWhom) asRow.innerHTML = '';
    // The label says which of the two summoned it. "speaking as" over Act, or "acting as" over
    // Speak, is the row describing a mode you are not in.
    // The label at one end and the name at the other, with the whole window between them:
    // `justify-content:space-between` on a strip that is the full width, rather than a huddle
    // pushed to one side.
    else asRow.innerHTML = `<div class="inner"><span>${
      S.mode === 'act' ? 'acting as' : 'speaking as'}</span>
      <select id="asWhom">
        <option value=""${S.speaker ? '' : ' selected'}>${esc(me)}</option>
        ${cast.filter((e) => e.title !== me).map((e) => `<option value="${esc(e.title)}"${
          e.title === S.speaker ? ' selected' : ''}>${esc(e.title)}</option>`).join('')}
      </select></div>`;
  }

  $('dockCol').innerHTML = `
    <div id="modes">
      ${MODES.map(([k, label]) => `<button data-mode="${k}" aria-pressed="${k === S.mode}">${label}</button>`).join('')}
      <!-- Neither of these is a mode, and in the same run as Speak/Act/Direct/Narrate they read as
           a fifth and sixth one. The margin does the separating. -->
      <button data-newlore="1" title="Write something down as canon, or read the chapter for facts"
        style="flex:0 0 auto; margin-left:auto">+ Thread</button>
      <button data-panel="anansi" aria-pressed="${S.panel === 'anansi'}" title="Ask Anansi about this story"
        style="flex:0 0 auto">Anansi</button>
    </div>
    <div id="inputRow">
      <textarea id="input" rows="1" placeholder="${esc(placeholder(who))}"></textarea>
      <button data-bigin="1" aria-pressed="${S.bigInput}" title="${S.bigInput
        ? 'Back to the page' : 'Write in a full screen, and still read what you wrote'}"
        aria-label="${S.bigInput ? 'Close the full-screen composer' : 'Open the full-screen composer'}"
        style="flex:0 0 auto; color:var(--faint); font-size:13px; padding-bottom:2px">${
          S.bigInput ? '\u2921' : '\u2922'}</button>
      <span class="deskonly" style="font-size:10.5px; color:var(--label); opacity:.55; padding-bottom:3px">&crarr;</span>
      <!-- One button, two jobs, and it is the same button on purpose: the place your eye is
           already on when the model is writing is the place you last pressed. A separate Stop
           somewhere else is a Stop you hunt for while the passage you did not want gets longer. -->
      ${S.busy
        ? `<button id="send" data-stop="1" class="stopping" aria-label="Stop writing"
            title="Stop, and keep what you typed">&#9632;</button>`
        : `<button id="send" data-send="1" aria-label="Send">&uarr;</button>`}
    </div>`;
  const ta = $('input');
  // Fit to the text and let CSS clamp it. The cap used to be written twice — `140` here and
  // `max-height:140px` in the stylesheet — which is two numbers for one decision, and the pair
  // that drifted apart this morning was a breakpoint. Expanded, the box is flexed to the panel
  // and an inline height would fight it.
  const fit = () => { if (S.bigInput) { ta.style.height = ''; return; }
    ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => {
    // Enter sends. It used to need Cmd/Ctrl, which meant the button was the only way to send —
    // in a box you type one line into, that is the wrong default round.
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); generate(); }
  });
  // And put the half-written line back, with the caret where it was — restoring the text but not
  // the selection moves the cursor to the end mid-sentence, which is its own small theft.
  if (draft?.text) {
    ta.value = draft.text;
    fit();
    // The caret is restored whether or not the box had focus — clicking a panel moves focus to the
    // button, and coming back to a sentence with the cursor thrown to the end is the same theft in
    // miniature.
    ta.setSelectionRange(draft.start ?? ta.value.length, draft.end ?? ta.value.length);
  }
  // FOCUS IS NOT A PROPERTY OF THE TEXT. This lived inside the block above, so an EMPTY box that
  // had the caret in it lost focus on every repaint — and a repaint follows almost every action.
  // On a phone that closes the keyboard; `interactive-widget=resizes-content` then grows the
  // layout viewport back and the whole dock drops, so the next tap reopens the keyboard and it
  // rises again. Seth: "the place where i type moves everytime i go to input". Measured before the
  // fix: empty + focused + repaint left document.activeElement on <body>; with text it survived.
  // preventScroll, on both. focus() scrolls the element into view by default, and on a page whose
  // reading column is the scroller that yanks the document — which is the "input box moves" Seth
  // reported a second time AFTER the repaint fix, because that fix made focus() run more often,
  // not less. The box is already on screen; it is the dock. Nothing needs scrolling to reach it.
  if (draft?.focused) ta.focus({ preventScroll: true });
  // HARDWARE KEYBOARD: the caret comes back on its own. Pressing a button moves focus to that
  // button, and a repaint then throws the button away — leaving focus on <body> and the writer
  // reaching for the mouse to get back into the box. With a physical keyboard there is no soft
  // keyboard to force open, so returning the caret costs nothing and saves the reach.
  // Narrow on purpose: only when NOTHING is focused. Focus sitting in a panel's own field is
  // someone editing a thread, and stealing it mid-word would be a worse bug than the one this
  // fixes.
  else if (hwkb && (document.activeElement === document.body || !document.activeElement)) ta.focus({ preventScroll: true });
  DOCK_FOR = S.storyId;
}

// ---------- side panel ----------
/** Any textarea marked `grow` fits its own content, up to its max-height.
 *
 *  One place rather than per field: the composer grew its own for the same reason and the ledger
 *  editor did not, which is how a thread body ended up two thirds below the fold. Called after the
 *  panel renders and on every keystroke, and it reads `scrollHeight` off a height of `auto` — the
 *  measurement is meaningless against the height it is about to replace.
 */
function growFields(root) {
  for (const t of root.querySelectorAll('textarea.grow')) {
    const fit = () => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };
    fit();
    if (!t.dataset.grew) { t.dataset.grew = '1'; t.addEventListener('input', fit); }
  }
}

function drawSide() {
  const side = $('side');
  side.hidden = !S.panel || S.place !== 'story';
  if (side.hidden) return;
  $('sideHead').innerHTML = `
    <span class="serif" style="font-size:20px; color:var(--ink-bright); white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis">${esc(TITLES[S.panel] ?? '')}</span>
    ${/* OUTSIDE the heading span, and deliberately: decode() writes textContent on that span, so a
          button inside it is destroyed on the next repaint. Its body goes at the top of #sideBody
          instead, because the span is nowrap and would clip it. */
      PANEL_HELP[S.panel] ? helpMark(PANEL_HELP[S.panel]) : ''}
    <span style="flex:1"></span>
    <button data-panel="" style="color:var(--gold); font-size:11px; letter-spacing:.12em; font-variant-caps:all-small-caps">Close</button>`;
  decode($('sideHead').querySelector('.serif'), 'panel');
  $('sideBody').innerHTML = (PANEL_HELP[S.panel] ? helpBody(PANEL_HELP[S.panel]) : '')
    + (PANELS[S.panel] ?? (() => ''))();
  // After the markup, because a textarea has no scrollHeight until it is in the document.
  growFields($('sideBody'));
}

/** One proposal, with the two decisions it carries. Lifted out of the Chapter panel on
 *  2026-08-27 so Waiting can offer the same card rather than a second copy of it — this repo's
 *  own recurring failure is two renderings of one thing drifting apart, and Accept is the last
 *  place that should happen: `POST /api/proposal` reads the BOX, not the model's wording, so a
 *  copy without the textarea would quietly accept something different from what is on screen. */
function proposalCard(p) {
  const tone = p.kind === 'new' ? 'var(--good)' : p.kind === 'conflict' ? 'var(--bad)' : 'var(--warn)';
  return `<div class="card" style="gap:8px">
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-size:14.5px; color:var(--ink-bright)">${esc(p.title)}</span>
            <span class="up" style="margin-left:auto; font-size:9.5px; letter-spacing:.1em; color:${tone}">${esc(p.kind)}</span></div>
          <!-- The delta says what CHANGED and the body is what gets written. Showing the delta OR
               the body meant that for a conflict or an update the text about to enter canon was
               never on screen at all: you accepted a summary and got a paragraph you had not read.
               Both now, and the one that lands is editable. POST /api/proposal has honoured an
               incoming body since it was written; nothing ever sent it. -->
          ${p.delta && p.delta.trim() !== (p.body ?? '').trim()
            ? `<div style="font-size:12px; line-height:1.45; color:var(--faint)">${esc(p.delta)}</div>` : ''}
          <textarea class="field" data-pbody="${p.id}" aria-label="What ${esc(p.title)} will say"
            style="margin:0; min-height:76px; font-size:12.5px; line-height:1.5">${esc(p.body ?? '')}</textarea>
          ${p.entryType === 'state' ? `<div style="font-size:11px; color:var(--faint)">In force from chapter ${
            esc(JSON.parse(p.keys || '[]')[0] ?? '?')}</div>` : ''}
          <div style="display:flex; gap:7px">
            <button data-decide="accept" data-id="${p.id}" style="flex:1; text-align:center; padding:8px 0;
              border-radius:var(--r); background:var(--gold); color:var(--on-gold); font-size:11.5px; font-weight:500">Accept</button>
            <button data-decide="reject" data-id="${p.id}" style="width:38px; text-align:center; padding:8px 0;
              border-radius:var(--r); border:1px solid var(--chip); color:var(--faint); font-size:11.5px">✕</button></div></div>`;
}

const PANELS = {
  entry: entryEditor,
  /** Everything this book is waiting on, in one place.
   *
   *  Each part of it was already on the surface somewhere — proposals under Chapter, promises
   *  under Strings, flags beside the passage they are about, the horizon on a bar — which is
   *  exactly the problem: four panels to find out whether anything wanted you.
   *
   *  Reads `V.waiting`, computed by the engine, so this panel and the shelf cannot disagree about
   *  whether a book is owed anything.
   */
  waiting() {
    const w = V?.waiting;
    if (!w) return '<div class="hint">Nothing to show yet.</div>';
    const h = horizon();
    // EVERY DECISION IS TAKEN HERE. It listed counts and sent you elsewhere to act on them, which
    // is four journeys to answer "does anything want me" — the thing this panel exists to end.
    // Each list is the SAME renderer the panel it came from uses, so Accept here and Accept there
    // are one behaviour rather than two that drift.
    const props = V.proposals ?? [];
    const owed = (V.strings ?? []).filter((x) => x.status === 'open');
    const flags = (V.violations ?? []).filter((f) => f.status !== 'dismissed');

    const section = (title, hint, inner) => `<div class="lbl" style="letter-spacing:.1em; margin-top:18px">${
      esc(title)}</div><div class="hint" style="margin:0 0 8px">${esc(hint)}</div>${inner}`;

    const rows = [];
    if (props.length) rows.push(section(
      `${props.length} thread${props.length === 1 ? '' : 's'} proposed`,
      'Nothing is canon until you accept it, and the box is what gets written.',
      `<div style="display:flex; flex-direction:column; gap:9px">${props.map(proposalCard).join('')}</div>`));

    if (owed.length) rows.push(section(
      `${owed.length} promise${owed.length === 1 ? '' : 's'} unpaid`,
      'Summoning one puts it in front of the model. Until then it is yours alone.',
      owed.map((x) => `<div class="card" style="margin-bottom:8px; gap:6px">
        <div style="display:flex; align-items:center; gap:9px">
          <span style="font-size:14px; color:var(--ink-bright)">${esc(x.title)}</span>
          <span class="up" style="margin-left:auto; font-size:9.5px; letter-spacing:.1em; color:var(--faint)">${
            x.fromChapter ? `set up in ${x.fromChapter}` : ''}${x.owedBy ? ` · owed by ${x.owedBy}` : ''}</span></div>
        ${x.body ? `<div style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(x.body)}</div>` : ''}
        <div style="display:flex; gap:7px">
          <button data-summon="${x.id}" style="flex:1; text-align:center; padding:8px 0; border-radius:var(--r);
            ${x.summoned ? 'background:var(--gold); color:var(--on-gold)' : 'border:1px solid var(--chip); color:var(--mute)'};
            font-size:11.5px">${x.summoned ? 'In play — put it away' : 'Summon it'}</button>
          <button data-stringstatus="${x.id}" style="width:96px; text-align:center; padding:8px 0;
            border-radius:var(--r); border:1px solid var(--chip); color:var(--faint); font-size:11.5px">Paid</button>
        </div></div>`).join('')));

    if (flags.length) rows.push(section(
      `${flags.length} contradiction${flags.length === 1 ? '' : 's'} flagged`,
      'The checker read the prose against canon. Dismissing one leaves the prose alone.',
      flags.map((f) => {
        const e = V.entries.find((x) => x.id === f.entryId);
        const unseen = f.reached === false;
        return `<div class="card" style="margin-bottom:8px; gap:6px;
          border-color:${unseen ? 'rgba(217,178,106,.34)' : 'rgba(200,80,80,.34)'}">
          <div class="kind" style="color:${unseen ? 'var(--warn)' : 'var(--bad)'}">${unseen
            ? `never sent · ${esc(e?.title ?? 'canon')}` : `contradiction · ${esc(e?.title ?? 'canon')}`}</div>
          ${f.reason ? `<div class="clamp" style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(f.reason)}</div>` : ''}
          <div style="display:flex; gap:7px">
            <button data-goflag="${f.passageId}" style="flex:1; text-align:center; padding:8px 0;
              border-radius:var(--r); border:1px solid var(--chip); color:var(--mute); font-size:11.5px">Show me the passage</button>
            <button data-dropflag="${f.id}" style="width:96px; text-align:center; padding:8px 0;
              border-radius:var(--r); border:1px solid var(--chip); color:var(--faint); font-size:11.5px">Dismiss</button>
          </div>
          ${f.entryId ? `<button data-mute="${f.entryId}" style="text-align:left; padding:7px 0 0;
            color:var(--faint); font-size:11px">Ignore ${esc(e?.title ?? 'this')} for the rest of this chapter</button>` : ''}
          </div>`;
      }).join('')));

    // THE WAY BACK. A mute you cannot see is deafness. Every entry quieted in this chapter is
    // listed here with the press that lifts it, so "not for now" never silently becomes "never".
    const muted = (V.muted ?? []).map((id) => V.entries.find((x) => x.id === id)).filter(Boolean);
    if (muted.length) rows.push(section(
      `${muted.length} quieted in this chapter`,
      'The checker is not reading the prose against these while the chapter moves. Lift one and it is.',
      muted.map((m) => `<div class="card" style="margin-bottom:8px; flex-direction:row; align-items:center; gap:9px">
        <span style="font-size:13px; color:var(--mute)">${esc(m.title)}</span>
        <button data-unmute="${m.id}" style="margin-left:auto; padding:7px 12px; border-radius:var(--r);
          border:1px solid var(--chip); color:var(--faint); font-size:11.5px">Listen again</button></div>`).join('')));

    // The two that are COMPUTED rather than stored, and so can be waved away. The ref carries the
    // state that made each worth saying, so this is "not for this", never "never again".
    const off = [];
    for (const c of (w.stale ?? [])) off.push({ kind: 'stale', ref: c.ref,
      title: `${c.title || `Chapter ${c.index}`} has a stale summary`,
      body: 'Its prose changed after the summary was written, so it is left out of the prompt until '
          + 'it is written again.' });
    if (h) off.push({ kind: 'horizon', ref: String(h.to),
      title: `${h.chapters} chapter${h.chapters === 1 ? '' : 's'} no longer reach the model`,
      body: `Chapters ${h.from} to ${h.to}. Their summaries do not fit any more — Chapter, then `
          + 'Acts, collapses a run of them into one.' });

    if (!rows.length && !off.length) {
      // In her own voice, at Seth's asking: an empty panel that says nothing is indistinguishable
      // from a broken one.
      return `<div class="card" style="gap:6px">
        <div class="kind">nothing is waiting</div>
        <div style="font-size:13.5px; line-height:1.6; color:var(--mute)">Nothing is owed and
          nothing is arguing with itself. The book is quiet &mdash; which is not the same as
          finished. Go and make me something to worry about.</div></div>`;
    }

    return `${rows.join('')}
      ${off.map((d) => `<div class="card" style="margin-bottom:9px; gap:5px">
        <div class="kind">${esc(d.title)}</div>
        <div style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(d.body)}</div>
        <button data-dismiss="${d.kind}" data-ref="${esc(d.ref)}"
          style="align-self:flex-start; font-size:11.5px; color:var(--faint); margin-top:3px"
          >Not now &mdash; ask me again if it changes</button></div>`).join('')}`;
  },
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
          border:1px solid var(--chip); border-radius:var(--r); padding:12px 13px; margin:0"
          >${esc(PROMPT || '(assembling…)')}</pre>
        <div class="hint">${PROMPT ? `${PROMPT.length.toLocaleString()} characters sent` : ''}</div></div>`;
    }
    const inc = MANI.blocks.filter((b) => b.state === 'included');
    const agg = {};
    for (const b of inc) agg[b.kind] = (agg[b.kind] ?? 0) + b.tokens;
    // The total above the meter is the tokenizer's when we have it; the SEGMENTS are per-block
    // estimates and there is no per-block exact number to have. Scaled so they add up to the
    // total printed beside them — a bar whose pieces overshoot the number they are a breakdown
    // of is a bar that reads as broken. The split between kinds is proportional and unchanged.
    const rawSum = Object.values(agg).reduce((n, v) => n + v, 0);
    const scale = MANI_EXACT && rawSum ? MANI.totals.used / rawSum : 1;
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
        <span class="tnum" style="margin-left:auto; color:var(--faint)" data-exact="${MANI_EXACT ? 1 : 0}"
          title="${MANI_EXACT ? 'Counted by the model\u2019s own tokenizer'
            : 'Estimated \u2014 the model is not answering, so this is characters divided by a constant'}"
          >${MANI.totals.used.toLocaleString()} / ${budget.toLocaleString()}${MANI_EXACT ? '' : ' (est.)'}</span></div>
      <div class="meter">${Object.entries(agg).map(([k, v]) =>
        `<i style="width:${(v * scale / budget * 100).toFixed(2)}%; background:${BLOCK_COLOR[k] ?? 'var(--ink-ghost)'}"></i>`).join('')}</div>
      ${(() => {
        const h = horizon();
        if (!h) return '';
        return `<div style="display:flex; align-items:flex-start; gap:10px; padding:10px 0">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--gold-dim); margin-top:5px; flex:0 0 auto"></span>
          <span style="flex:1; display:flex; flex-direction:column; gap:4px">
            <span style="font-size:13px; color:var(--ink)">Chapters ${h.from}&ndash;${h.to} are past the horizon${helpMark('horizon')}</span>
            ${helpBody('horizon')}
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
          <span style="width:8px; height:8px; border-radius:var(--r-tight); flex:0 0 auto; background:${BLOCK_COLOR[k] ?? 'var(--ink-ghost)'}"></span>
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
            <span style="width:8px; height:8px; border-radius:var(--r-tight); flex:0 0 auto; background:var(--edge-lit)"></span>
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
        <div class="lbl" style="letter-spacing:.1em; margin-top:0">Write it down</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px">
          ${KINDS.map((k) => `<button data-lorekind="${k}" style="flex:1 1 44%; text-align:center;
            font-size:11.5px; padding:8px 0; border-radius:var(--r);
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

        <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Or read the chapter</div>
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
        <div class="lbl" style="letter-spacing:.1em; margin-top:6px">${label}</div>
        ${V.entries.filter((e) => e.entryType === k).map((e) => entryCard(e)
          + ((e.outfits ?? []).length ? `<div style="display:flex; flex-wrap:wrap; gap:5px; margin:-4px 0 10px 2px">
            ${e.outfits.map((o) => `<button data-wear="${e.id}:${o.id}" class="tag"
              style="cursor:pointer; ${o.active
                ? 'border-color:rgba(217,178,106,.45); color:var(--gold)' : ''}">${esc(o.name)}</button>`).join('')}
            ${e.outfits.some((o) => o.active)
              ? `<button data-wear="${e.id}:" class="tag" style="cursor:pointer; color:var(--dim)">nothing</button>` : ''}
          </div>` : '')).join('')}`).join('')}
      ${shown.length ? '' : '<div class="hint" style="margin:0">Nothing written down yet. Canon is what the model is told and never allowed to contradict.</div>'}
      <div class="lbl" style="letter-spacing:.1em; margin-top:18px">Add</div>
      <div style="display:flex; flex-wrap:wrap; gap:7px">
        ${groups.map(([k, , one]) => `<button class="btn ghost" data-newentry="${k}"
          style="flex:1 1 44%; white-space:nowrap">New ${one}</button>`).join('')}
      </div>
      <!-- This panel is ONE story's threads, because entries are story-scoped in the schema. The
           page that spans every book already existed and had no door from inside a story: you had
           to leave first, and then know that Threads out there means something wider than Threads
           in here. -->
      <button class="btn ghost" data-leave="canon" style="margin-top:14px">Every book's threads</button>
      <div class="hint">${V.entries.length} in this story. The wider list spans every book you have,
        and is where to look when you cannot remember which one a thread is in.</div></div>`;
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
      ${fields.map((f) => `<label class="lbl">${f.label}${f.k === 'writingStyle' ? helpMark('voice') : ''}</label>
        ${f.k === 'writingStyle' ? helpBody('voice') : ''}
        ${f.area ? `<textarea class="field" data-story="${f.k}">${esc(V.story[f.k] ?? '')}</textarea>`
                 : `<input class="field" data-story="${f.k}" value="${esc(V.story[f.k] ?? '')}">`}
        ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}`).join('')}
      <label class="lbl">Setting</label>
      ${pick('setting', lore.map((e) => e.title), V.story.setting, 'Not set')}
      <div class="hint">Drawn from the lore and items in this story's ledger.</div>
      <label class="lbl">Point of view</label>
      ${pick('pov', POV, V.story.pov, 'Not set')}
      <label class="lbl">You are${helpMark('persona')}</label>
      ${helpBody('persona')}
      ${pick('persona', cast.map((e) => e.title), V.story.persona, 'Nobody — narrate only')}
      <div class="hint">The character you speak as in Speak mode. Drawn from the cast.</div>
      <label class="lbl">The model never writes${helpMark('locked')}</label>
      ${helpBody('locked')}
      ${pick('lockedCharacter', cast.map((e) => e.title), V.story.lockedCharacter,
             'Nobody — it may write anyone')}
      <div class="hint">${V.story.lockedCharacter
        ? `No dialogue, no action, no gesture, and nothing about what ${esc(V.story.lockedCharacter)}
           feels or knows. It writes the world's answer and stops where they would act.`
        : `Name someone and the model will not write their dialogue, their actions or their inner
           state — it writes what happens around them instead. Usually the one you play.`}
        A separate setting from <em>You are</em> on purpose: you may hand yourself a different
        character for a scene without also handing over the one you were keeping.</div>
      <label class="lbl">Spice${helpMark('spice')}</label>
      ${helpBody('spice')}
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

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">The cover</div>
      ${V.cover ? `<img src="${api.coverUrl(S.storyId, V.cover)}" alt=""
        style="width:100%; height:120px; object-fit:cover; border-radius:var(--r); border:1px solid var(--edge)">` : ''}
      <div style="display:flex; gap:7px; margin-top:${V.cover ? '7px' : '0'}">
        <label class="btn ghost" style="flex:1; display:flex; align-items:center; justify-content:center; cursor:pointer">
          ${V.cover ? 'Replace it' : 'Choose an image'}
          <input type="file" accept="image/*" data-cover="1" hidden></label>
        ${V.cover ? '<button class="btn ghost" data-delcover="1" style="flex:0 0 auto">Remove</button>' : ''}
      </div>
      <div class="hint">Shrunk to 900px wide in the browser and stored in the database, not on disk
        — the nightly backup is one file, and a path would leave the covers out of it.</div>
      ${V.cover ? `<label style="display:flex; align-items:center; gap:9px; margin-top:11px; cursor:pointer">
        <input type="checkbox" data-story="chapterHero" ${V.story.chapterHero ? 'checked' : ''}>
        <span style="font-size:13px; color:var(--ink)">Use it at the head of every chapter</span></label>
      <div class="hint">The same picture, as a plate above each chapter's title. There is no second
        image to choose &mdash; a chapter shows the cover or nothing.</div>` : ''}

      ${V.cover && V.story.chapterHero ? `<label style="display:flex; align-items:center; gap:9px; margin-top:12px; cursor:pointer">
        <input type="checkbox" data-story="chapterSticky" ${V.story.chapterSticky ? 'checked' : ''}>
        <span style="font-size:13px; color:var(--ink)">Keep it behind the prose while you read</span></label>
      <div class="hint">It stays put and the writing moves over it, fading left to right into the
        page. Instead of a plate at the head of the chapter that scrolls away with it.</div>
      ${V.story.chapterSticky ? `<label class="lbl" style="letter-spacing:.1em; margin-top:12px">How much of it shows</label>
        <div style="display:flex; align-items:center; gap:12px">
          <input type="range" min="0" max="100" step="5" style="flex:1"
            data-story="coverOpacity" value="${V.story.coverOpacity ?? 30}">
          <span class="tnum" style="font-size:12px; color:var(--faint); width:38px; text-align:right"
            >${V.story.coverOpacity ?? 30}%</span></div>
        <div class="hint">At full strength a picture under text is unreadable and at nothing it is
          not there. Save to see it.</div>` : ''}` : ''}

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Take it with you</div>
      <div style="display:flex; gap:7px">
        <a class="btn ghost" href="${api.exportUrl(S.storyId, 'markdown')}" download
          style="flex:1; text-decoration:none">Markdown</a>
        <a class="btn ghost" href="${api.exportUrl(S.storyId, 'json')}" download
          style="flex:1; text-decoration:none">JSON</a>
      </div>
      <button class="btn ghost" data-exportdb="1" style="margin-top:7px">As a standalone database</button>
      <div class="hint">The database leaves as one file and comes back through Import. Markdown and
        JSON are for reading elsewhere.</div>
      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Put it away</div>
      <button class="btn ghost" data-archive="${V.story.status === 'archived' ? 'in_progress' : 'archived'}">${
        V.story.status === 'archived' ? 'Take it off the shelf-end' : 'Archive this story'}</button>
      <div class="hint">${V.story.status === 'archived'
        ? 'It goes back among the others, in the order you last wrote in it.'
        : 'It stays on the shelf, dimmed and last. Nothing is deleted and nothing leaves the prompt.'}</div>

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px; color:var(--bad)">Danger</div>
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
    // Thread proposals only. A string is a different kind of offer and lands where strings live —
    // accepting one there is the same press, next to what it is about to join.
    const ps = (V.proposals ?? []).filter((p) => p.entryType !== 'string');
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
      <div class="hint">Closes it, summarises it, reads it for new facts, remembers what it did to the
        people in it, and opens the next.</div>

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">What this chapter added</div>
      <div style="font-size:12.5px; line-height:1.55; color:var(--mute); margin-bottom:9px">Nothing here is canon until you accept it.</div>
      <div style="display:flex; flex-direction:column; gap:9px">
      ${ps.map(proposalCard).join('') || '<div class="hint" style="margin:0">Nothing proposed. Closing a chapter reads it for new facts and for what it did to the people in it.</div>'}
      ${(V.proposals ?? []).some((p) => p.entryType === 'string')
        ? `<button class="btn ghost" data-panel="strings" style="margin-top:6px">${
            (V.proposals ?? []).filter((p) => p.entryType === 'string').length} string${
            (V.proposals ?? []).filter((p) => p.entryType === 'string').length === 1 ? '' : 's'
          } proposed &mdash; they wait under Strings</button>` : ''}
      <button class="btn ghost" data-extract="1" style="margin-top:6px">Read this chapter for facts</button>
      <!-- POST /api/remember was finished, tested, and reachable from nowhere until 2026-08-27.
           Closing a chapter runs it; this is the way back when the router was down at the time,
           which is the one case the route was written for. -->
      <button class="btn ghost" data-remember="1" style="margin-top:6px">Remember what it did to the
        people in it</button></div>

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Summaries in context</div>
      <div class="hint" style="margin:0 0 8px">The chapter you are writing goes to the model whole.
        Everything before it goes as the summaries below &mdash; so if the model has forgotten
        something that happened back there, <b>pull that chapter back</b> and its prose is sent
        instead of its summary, until you let it go again.</div>
      ${V.chapters.filter((c) => c.summary).map((c) => `<div class="card"
        style="margin-bottom:8px; ${c.keepWhole ? 'border-color:var(--gold-dim);' : ''}">
        <button aria-expanded="false" data-expand="1" style="text-align:left; width:100%">
          <div style="display:flex; align-items:center; gap:9px">
            <span class="kind">${esc(c.title || `Chapter ${c.index}`)}</span>
            <span style="margin-left:auto; font-size:11px; color:var(--faint)">covers to ${c.coversThrough ?? '—'}</span></div>
          <div class="clamp" style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(c.summary)}</div>
        </button>
        ${c.summaryStale ? '<div class="hint" style="color:var(--bad)">Stale — excluded from the prompt until it is re-run.</div>' : ''}
        <button data-pullback="${c.id}" data-on="${c.keepWhole ? '0' : '1'}"
          style="font-size:11.5px; text-align:left; color:${c.keepWhole ? 'var(--gold)' : 'var(--faint)'}"
          >${c.keepWhole
            ? '&check; Sent whole &mdash; press to let it go back to its summary'
            : 'Pull this chapter back &mdash; send its prose, not its summary'}</button>
      </div>`).join('') || '<div class="hint">No summaries yet. Closing a chapter writes one.</div>'}
      <button class="btn ghost" data-summarize="1">Summarise this chapter</button>

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Acts</div>
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

      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Branches</div>
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
          ? `<div style="align-self:flex-end; max-width:88%; padding:9px 13px; border-radius:var(--r) 14px 4px 14px;
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
          : (() => {
            // The empty state was two paragraphs of explanation over a panel-height void. It said
            // what Anansi could do in prose and then left you to compose the question yourself.
            //
            // Four openings instead, each one a thing it is actually built to do: answer from the
            // ledger, say what the story does not say, notice an unpaid promise, draft a directive.
            // Tapping one FILLS the box and does not send it — the panel's own rule is that
            // nothing happens until you choose it, and a suggestion that sent itself would be the
            // first thing to break it.
            const cast = (V.entries ?? []).filter((e) => e.entryType === 'character');
            const who = cast[0]?.title;
            const asks = [
              ['strings', 'What has this story set up and not paid off?'],
              who && ['threads', `Who is ${who}, and what do we know for certain?`],
              ['search', 'What has the story never said outright?'],
              ['chapter', 'Set up the next scene for me.'],
            ].filter(Boolean);
            return `<div style="display:flex; flex-direction:column; gap:10px">
              <div class="hint" style="margin:0">Anansi has your canon, your chapter summaries and
                the last few passages. It answers from those, says so when they do not say, and
                offers <strong>threads</strong>, <strong>strings</strong> and a
                <strong>directive</strong> &mdash; none of which go anywhere until you accept them.</div>
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:2px">
                ${asks.map(([m, q]) => `<button data-askfill="${esc(q)}" style="display:flex;
                  align-items:flex-start; gap:11px; text-align:left; width:100%; padding:10px 12px;
                  border-radius:var(--r); border:1px solid var(--chip); color:var(--mute); font-size:13px;
                  line-height:1.45">
                  <span style="color:var(--gold-dim); display:flex; padding-top:1px">${mark(m, 16)}</span>
                  <span>${esc(q)}</span></button>`).join('')}
              </div>
            </div>`;
          })()}
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
          ? `<div class="hint" style="margin:0">Off until <code>ANANSI_SEARCH</code> names a service
             you trust &mdash; it is the only outbound request this app can make.</div>`
          : ''}
      </div>
    </div>`;
  },

  /** The promises this story has made and not paid.
   *
   *  Writer-facing by default: a string only reaches the model when it is SUMMONED, because a
   *  model handed an unresolved promise reaches for it, and paying it off is the writer's move.
   *  F20 is the precedent — restating canon near the generation point measured at nothing over 850
   *  generations an arm, and a standing list of open promises is that idea in a new coat. */
  strings() {
    const all = V.strings ?? [];
    const open = all.filter((x) => x.status === 'open');
    const done = all.filter((x) => x.status !== 'open');
    const here = V.currentChapter.index;
    const row = (x) => {
      const since = x.fromChapter ? here - x.fromChapter : null;
      const late = x.owedBy != null && here > x.owedBy;
      return `<div class="card" style="margin-bottom:8px; gap:6px; border-color:${
        x.summoned ? 'rgba(217,178,106,.42)' : late ? 'var(--bad)' : 'var(--chip)'}">
        <div style="display:flex; align-items:baseline; gap:9px">
          <span class="kind">${esc(x.title)}</span>
          ${x.summoned ? '<span class="tag" style="border-color:rgba(217,178,106,.4); color:var(--gold)">in play</span>' : ''}
          <span style="margin-left:auto; font-size:11px; color:${late ? 'var(--bad)' : 'var(--faint)'}">${
            x.status !== 'open' ? esc(x.status)
            : late ? `owed by ${x.owedBy}, and it is chapter ${here}`
            : since != null ? `${since === 0 ? 'set up this chapter' : `${since} ${since === 1 ? 'chapter' : 'chapters'} ago`}`
            : ''}</span></div>
        ${x.body ? `<div style="font-size:12.5px; line-height:1.5; color:var(--mute)">${esc(x.body)}</div>` : ''}
        <div style="display:flex; gap:6px; flex-wrap:wrap">
          <button class="btn ghost" data-summon="${x.id}" style="width:auto; padding:0 12px; height:30px; font-size:10.5px">${
            x.summoned ? 'Put it away' : 'Put it in play'}</button>
          ${x.status === 'open'
            ? `<button class="btn ghost" data-stringstatus="${x.id}:paid" style="width:auto; padding:0 12px; height:30px; font-size:10.5px">Paid off</button>
               <button class="btn ghost" data-stringstatus="${x.id}:dropped" style="width:auto; padding:0 12px; height:30px; font-size:10.5px">Let it go</button>`
            : `<button class="btn ghost" data-stringstatus="${x.id}:open" style="width:auto; padding:0 12px; height:30px; font-size:10.5px">Still open</button>`}
          <button data-delstring="${x.id}" style="margin-left:auto; color:var(--bad); font-size:12px" aria-label="Remove">✕</button>
        </div></div>`;
    };
    return `<div style="display:flex; flex-direction:column">
      <div class="hint" style="margin:0 0 12px">A string is something the story has promised and not
        paid &mdash; the letter nobody has opened, the debt nobody has called in. It is yours to see,
        not the model's, until you <strong>put one in play</strong>: only then does it reach the
        prompt, and even then it is told what is owed rather than told to pay it.</div>
      ${(() => {
        // Anansi's offers, where the strings are rather than in the Chapter queue with the thread
        // proposals. Same buttons, same route, same "nothing until you accept it" — a promise it
        // spotted belongs next to the promises you already know about.
        const mine = (V.proposals ?? []).filter((p) => p.entryType === 'string');
        if (!mine.length) return '';
        return `<div class="lbl" style="letter-spacing:.1em; margin-top:0">Anansi noticed</div>
          <div class="hint" style="margin:0 0 8px">Nothing is tied until you accept it.</div>
          ${mine.map((p) => `<div class="card" style="margin-bottom:8px; gap:8px;
            border-color:rgba(217,178,106,.28)">
            <div style="display:flex; align-items:center; gap:8px">
              <span style="font-size:14px; color:var(--ink-bright)">${esc(p.title)}</span>
              <span style="margin-left:auto; font-size:11px; color:var(--faint)">${
                p.keys?.[0] ? `set up in chapter ${esc(p.keys[0])}` : ''}</span></div>
            <textarea class="field" data-pbody="${p.id}" aria-label="What ${esc(p.title)} promises"
              style="margin:0; min-height:64px; font-size:12.5px; line-height:1.5">${esc(p.body ?? '')}</textarea>
            <div style="display:flex; gap:7px">
              <button data-decide="accept" data-id="${p.id}" style="flex:1; text-align:center; padding:8px 0;
                border-radius:var(--r); background:var(--gold); color:var(--on-gold); font-size:11.5px; font-weight:500">Tie it</button>
              <button data-decide="reject" data-id="${p.id}" style="width:38px; text-align:center; padding:8px 0;
                border-radius:var(--r); border:1px solid var(--chip); color:var(--faint); font-size:11.5px">✕</button>
            </div></div>`).join('')}
          <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Owed</div>`;
      })()}
      ${open.length ? open.map(row).join('') : '<div class="hint" style="margin:0">Nothing owed yet.</div>'}
      ${done.length ? `<div class="lbl" style="letter-spacing:.1em; margin-top:22px">Tied off</div>
        ${done.map(row).join('')}` : ''}
      <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Tie a new one</div>
      <input class="field" data-st2="title" placeholder="The letter he has not opened">
      <textarea class="field" data-st2="body" placeholder="What was promised, and to whom"
        style="min-height:52px; margin-top:6px"></textarea>
      <div style="display:flex; gap:6px; margin-top:6px">
        <input class="field" data-st2="fromChapter" value="${here}" placeholder="From chapter" style="flex:1">
        <input class="field" data-st2="owedBy" placeholder="Owed by chapter" style="flex:1">
      </div>
      <button class="btn" data-newstring="1" style="margin-top:8px">Tie it</button>
      <div class="hint">Anansi proposes these too &mdash; they arrive in the queue under Chapter with
        everything else it offers.</div>
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
        <div style="display:flex; justify-content:space-between; font-size:11px; letter-spacing:.1em;
          font-variant-caps:all-small-caps; color:var(--dim)">
          <span>${label}</span><span class="tnum" style="color:var(--gold-dim)">${value}</span></div>
        <input type="range" data-gen="${key}" min="0" max="${max}" step="${max > 2 ? 10 : 0.01}"
          value="${value}" style="width:100%; accent-color:var(--gold)">
        ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    return `<div style="display:flex; flex-direction:column">
      <div style="display:flex; align-items:flex-start; gap:12px; padding:0 0 4px">
        <span style="width:8px; height:8px; border-radius:50%; background:var(--warn); margin-top:5px; flex:0 0 auto"></span>
        <span style="flex:1; display:flex; flex-direction:column; gap:4px">
          <span style="font-size:13.5px; color:var(--ink)">These are shared, not per story</span>
          <span class="hint" style="margin:0">The sampler belongs to you, not to the server: changing
            it here changes it for every story YOU write and leaves the other writer alone. The route
            takes a story id, which makes it look per-story; it is not. Per-story sampling needs
            PLAN-02's <code>engine_config</code>, which was never built.</span></span></div>
      <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Model</div>
      ${S.models === null ? '<div class="hint" style="margin:0">Asking the router&hellip;</div>'
        : S.models.length === 0 ? emptyModels()
        : `<select class="field" data-storymodel="1">
            ${modelOptions(S.models, V.story.model).map((o) => `<option value="${esc(o.value)}"${
              o.selected ? ' selected' : ''}>${
              !o.value ? `Default &mdash; ${esc(modelName(V.defaultModel ?? SRV.model).name)}`
              : o.gone ? `${esc(modelName(o.value).name)} &mdash; the router no longer offers this`
              : `${esc([modelName(o.value).name, modelName(o.value).detail].filter(Boolean).join(' — '))}${
                  o.status === 'loaded' ? ' · awake' : ''}`}</option>`).join('')}
          </select>
          <div class="hint">${V.story.model
            ? `This story is written by <code title="${esc(V.story.model)}">${esc(modelName(V.story.model).name)}</code>,
               whatever any other story uses.`
            : 'This story uses whatever Preferences is set to. Name one here and it stops moving when that does.'}
            The router holds three at once, so switching between them usually costs nothing &mdash; one that is
            asleep costs a load on the first call.</div>`}

      <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Sampling</div>
      ${slider('Surprise', 'temperature', g.temperature ?? 0.85, 2,
        'How far the model will reach for a less obvious word. Prose only — structured roles run pinned at 0.2, because a loose sampler under a tight grammar writes valid JSON that says nothing.')}
      ${slider('Focus', 'top_p', g.top_p ?? 0.95, 1,
        'How much of the field it considers at all. Lower is tighter and more predictable.')}
      ${slider('Passage length', 'max_tokens', g.max_tokens ?? 900, 2000,
        'The ceiling on one passage. Raising it costs prefill on every call.')}
      <div style="display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-top:1px solid rgba(255,255,255,.04)">
        <span style="width:8px; height:8px; border-radius:50%; background:var(--bad); margin-top:5px; flex:0 0 auto"></span>
        <span style="flex:1; display:flex; flex-direction:column; gap:4px">
          <span style="font-size:13.5px; color:var(--ink)">Thinking is off, and not a setting</span>
          <span class="hint" style="margin:0">With it on this model spent the whole budget reasoning and
            returned no prose on three runs in four. The transport pins it off.</span></span></div>
      <div class="lbl" style="letter-spacing:.1em; margin-top:22px">The five modes, in your words</div>
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

      <div class="lbl" style="letter-spacing:.1em; margin-top:22px">This story's calls</div>
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
      <button data-open="${sid}" style="margin-left:auto; font-size:11px; letter-spacing:.1em;
        font-variant-caps:all-small-caps; color:var(--gold)">Open story</button></div>
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
      letter-spacing:.1em; font-variant-caps:all-small-caps; color:var(--gold); padding:2px 0">＋ Add to threads</button>`}
  </div>`).join('');
}

/** The skeleton the spark returned, in five steps, with nothing written until it is accepted.
 *
 *  Five screens rather than one scroll for one reason that is structural and not cosmetic: `persona`
 *  and `lockedCharacter` are character TITLES, so they cannot be chosen until a cast exists. That
 *  is why picking who you play used to be three screens — you accepted, the cast was written, and
 *  only then could you name one. Cast is step 3 and You is step 4, and the dependency is the order.
 *
 *  Accept is on every step, not only the last. Everything here is already filled in by the spark, so
 *  gating five screens would turn one press into five for anyone who trusts it. Guide, not gate.
 *
 *  The fields are harvested into S.spark on every move, because a step that is not rendered is not
 *  in the DOM — the single-scroll version could read every value at accept time and this cannot. */
const STEPS = [
  ['The book', 'What it is.'],
  ['The world', 'Where it happens, and how it is told.'],
  ['The cast', 'Who is in it. You can add your own.'],
  ['You', 'Who you play, and who the model never writes.'],
  ['The voice', 'How the prose sounds, and who opens it.'],
];

/** Read whatever this step has on screen back into state. Called before every move, including
 *  Accept: an edit on the step you are standing on is lost otherwise. */
function harvestSpark() {
  if (!S.spark) return;
  for (const el of document.querySelectorAll('[data-sp]')) {
    const k = el.dataset.sp;
    S.spark.story[k] = k === 'spice' ? Number(el.value) || 2 : el.value;
  }
  for (const c of document.querySelectorAll('[data-spcast]')) {
    const e = S.spark.entries[Number(c.dataset.spcast)];
    if (e) e.keep = c.checked;
  }
  for (const t of document.querySelectorAll('[data-spbody]')) {
    const e = S.spark.entries[Number(t.dataset.spbody)];
    if (e) e.body = t.value;
  }
  // Renaming somebody here has to carry what points AT them, or the next step offers a name the
  // cast no longer contains and the persona quietly becomes Nobody. Same failure the server fixes
  // for a rename after the story exists; this is the half hour before it exists.
  for (const n of document.querySelectorAll('[data-spname]')) {
    const e = S.spark.entries[Number(n.dataset.spname)];
    if (!e) continue;
    const was = e.title, now = n.value;
    if (was === now) continue;
    e.title = now;
    // The spark seeds keys with the character's own name, so a rename strands the trigger too.
    e.keys = (e.keys ?? []).map((k) => (k === was ? now : k));
    for (const k of ['persona', 'lockedCharacter'])
      if (S.spark.story[k] === was) S.spark.story[k] = now;
    // And what Anansi PROPOSED moves with it, or the server polices a name that no longer exists
    // and drops a persona the writer only renamed.
    S.spark.proposed = (S.spark.proposed ?? []).map((x) => (x === was ? now : x));
  }
}

/** The cast as it stands: everything still ticked. Step 4 offers these and nothing else, because a
 *  persona naming somebody you just dropped is the exact stranding pinCast exists to catch. */
const sparkCast = () => (S.spark?.entries ?? [])
  .filter((e) => e.keep !== false && (e.title ?? '').trim());

function sparkReview() {
  const s = S.spark.story ?? {};
  const step = S.sparkStep ?? 1;
  const row = (k, label, value, hint) => `<label class="lbl">${label}</label>
    <input class="field" data-sp="${k}" value="${esc(value ?? '')}">
    ${hint ? `<div class="hint">${hint}</div>` : ''}`;
  const area = (k, label, value, hint, min) => `<label class="lbl">${label}</label>
    <textarea class="field" data-sp="${k}" style="min-height:${min ?? 70}px">${esc(value ?? '')}</textarea>
    ${hint ? `<div class="hint">${hint}</div>` : ''}`;
  const pickOne = (k, label, options, value, none, hint) => `<label class="lbl">${label}</label>
    <select class="field" data-sp="${k}">
      <option value="">${esc(none)}</option>
      ${options.map((o) => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>${hint ? `<div class="hint">${hint}</div>` : ''}`;

  const cast = sparkCast();
  const body = step === 1
    ? `${row('title', 'Title', s.title)}
       ${row('genre', 'Genre', s.genre, 'Comma separated. Each one becomes its own tag on the shelf.')}
       ${area('premise', 'Premise', s.premise, 'It rides in the spine on every call.', 110)}`
    : step === 2
    ? `${row('setting', 'Setting', s.setting, 'Where it happens. Lore written later can replace this.')}
       <label class="lbl">Point of view</label>
       <select class="field" data-sp="pov">${POV.map((o) =>
         `<option value="${esc(o)}" ${o === s.pov ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
       <label class="lbl">Spice</label>
       <select class="field" data-sp="spice">${SPICE.map((l, i) =>
         `<option value="${i + 1}" ${Number(s.spice) === i + 1 ? 'selected' : ''}>${i + 1} &middot; ${esc(l)}</option>`).join('')}</select>
       <div class="hint">Changeable per story at any time, and a written-out register can replace the
         level entirely under Story.</div>`
    : step === 3
    ? `<div class="hint" style="margin:0 0 10px">${S.spark.entries.length} proposed. Untick anyone you
         do not want; nothing is written until you accept.</div>
       ${S.spark.entries.map((e, i) => `<div class="card" style="margin-bottom:7px; gap:7px">
         <div style="display:flex; align-items:center; gap:8px">
           <input class="field" data-spname="${i}" value="${esc(e.title)}" placeholder="Their name"
             style="margin:0; font-size:14px; color:var(--ink-bright)">
           <span class="tag" style="flex:0 0 auto">${esc(e.activation === 'always_on' ? 'Always on' : 'Triggered')}</span></div>
         <textarea class="field" data-spbody="${i}" placeholder="[Name: what they are, what they want, what it costs]"
           style="margin:0; min-height:64px; font-size:12.5px; line-height:1.45">${esc(e.body ?? '')}</textarea>
         <label style="display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--faint)">
           <input type="checkbox" data-spcast="${i}" ${e.keep === false ? '' : 'checked'}> keep this one</label></div>`).join('')}
       <button class="btn ghost" data-spadd="1" style="margin-top:6px">&#65291; Write one of your own</button>`
    : step === 4
    ? (cast.length
        ? `${pickOne('persona', 'You are', cast.map((e) => e.title), s.persona, 'Nobody \u2014 narrate only',
             'The character you speak as in Speak mode. Anansi proposed one; it is yours to change.')}
           ${pickOne('lockedCharacter', 'The model never writes', cast.map((e) => e.title), s.lockedCharacter,
             'Nobody \u2014 it may write everyone',
             'No dialogue, no action, no interior for them. Usually the one you play.')}
           <div class="hint">Both are offered from the cast you kept on the last step, because a name
             that is not in the book points at nobody.</div>`
        : `<div class="hint" style="margin:0">You kept nobody, so there is no one to play yet. That is
             a real answer &mdash; a story narrated from outside has no persona, and you can name one
             on the Story panel once there is a cast.</div>`)
    : `${area('writingStyle', 'Voice of the weave', s.writingStyle,
         'A sample beats a description of one. Yours is filled in already.', 150)}
       ${S.prompts?.voice ? `<div style="display:flex; gap:7px; margin:-4px 0 10px">
         <button class="btn ghost" data-spvoice="mine" style="flex:1; font-size:11.5px">Use my default voice</button>
         <button class="btn ghost" data-spvoice="shipped" style="flex:1; font-size:11.5px">Use the shipped one</button>
       </div>` : ''}
       ${area('direction', 'Where this is going', s.direction,
         'Aims the story without disclosing it. Never restated to the reader. Safe to leave empty.', 80)}
       <label style="display:flex; align-items:center; gap:9px; font-size:12.5px; color:var(--mute); margin-top:14px">
         <input type="checkbox" data-sp-open="1" ${S.spark.autoOpen === false ? '' : 'checked'}>
         Let the model write the opening passage</label>
       <div class="hint">And the first passage of every chapter after it. Changeable per story under
         Storyteller.</div>`;

  return `<div style="display:flex; gap:5px; margin-bottom:14px">${STEPS.map(([t], i) => `
      <button data-sparkstep="${i + 1}" aria-pressed="${step === i + 1}" style="flex:1; height:5px;
        border-radius:99px; background:${i + 1 <= step ? 'var(--gold)' : 'var(--chip)'}"
        aria-label="${esc(t)}"></button>`).join('')}</div>
    <div class="lbl" style="letter-spacing:.1em; margin:0">${step} of ${STEPS.length} &middot; ${esc(STEPS[step - 1][0])}</div>
    <div class="hint" style="margin:2px 0 12px">${esc(STEPS[step - 1][1])}</div>
    ${body}
    <div style="display:flex; gap:8px; margin-top:18px">
      ${step > 1 ? `<button class="btn ghost" data-sparkstep="${step - 1}" style="flex:0 0 96px">Back</button>` : ''}
      ${step < STEPS.length
        ? `<button class="btn" data-sparkstep="${step + 1}" style="flex:1">Next</button>`
        : ''}
    </div>
    <button class="btn${step < STEPS.length ? ' ghost' : ''}" data-accept-spark="1"
      style="margin-top:8px">Accept and start writing</button>
    <button class="btn ghost" data-drop-spark="1" style="margin-top:8px">Throw it back</button>
    <div class="hint">Nothing has been written yet. Accepting creates the story and its ledger.</div>`;
}

/** The new chapter's setup. Three fields, none of them new machinery: the beat is the chapter's
 *  author's note and already rides in DIRECTIVE; who is present is a force_in pin, which is what
 *  pins are actually for — "a fact that matters in a scene where nobody says its keyword"; and
 *  where is a pinned lore entry or the story's own setting. Skippable on purpose: a blank beat is
 *  a real choice, and some chapters are written to find out what happens. */
/** Chapters this session has already asked Anansi to name. The ask fires from the render, the way
 *  the cross-book ledger's fetch does — and a render that fetches without a guard renders again on
 *  the answer and asks forever. Per chapter id, so paging back and forth does not re-ask, and NOT
 *  persisted: a fresh session on a chapter still blank is a chapter worth offering again. */
const NAMED = new Set();

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
    gap:10px; width:100%; padding:9px 11px; border-radius:var(--r); margin-bottom:5px; text-align:left;
    border:1px solid ${on(e) ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
    background:${on(e) ? 'rgba(217,178,106,.10)' : 'transparent'}">
    <span style="width:14px; flex:0 0 auto; color:${on(e) ? 'var(--gold)' : 'var(--faint)'}">${on(e) ? '✓' : '·'}</span>
    <span style="flex:1; min-width:0; font-size:13px; color:${on(e) ? 'var(--ink)' : 'var(--mute)'};
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(e.title)}</span>
    <span style="flex:0 0 auto; font-size:10px; letter-spacing:.12em; font-variant-caps:all-small-caps;
      color:var(--label); opacity:.7">${why(e)}</span></button>`;

  const cast = V.entries.filter((e) => e.entryType === 'character' && match(e));
  const places = V.entries.filter((e) => (e.entryType === 'lore' || e.entryType === 'item') && match(e));
  const done = V.ritualDone;
  // Rendered from state, not from the DOM. Ticking a character repaints this panel, and reading
  // the inputs back afterwards found them freshly rebuilt and empty — so the beat you had just
  // typed was gone. Same fault as the search boxes and the click delegation, in a third place.
  const form = S.setup ?? { title: ch.title ?? '', note: ch.authorsNote ?? '' };
  // A chapter opens on two empty fields, and an empty field on a panel you did not ask for is a
  // field that stays empty — while the note is the one thing in this app that rides near the
  // generation point on every call. So Anansi fills them in, once. Seth: "chapter information
  // should be autofilled by the model and accepted by you, on every new chapter and not only the
  // first." Proposed, never saved: Save is still yours.
  //
  // "Untouched" is NOT "title is empty". `endChapter` opens the next chapter titled `Chapter N`
  // (db.ts:933), so a fresh chapter always has a title and the first version of this test never
  // fired once — the driver saw "Chapter 4" in the box, called it filled, and reported the note
  // empty. A title that is exactly this chapter's own number is the placeholder, not a name.
  const placeholder = !form.title.trim() || form.title.trim() === `Chapter ${ch.index}`;
  if (!S.naming && !NAMED.has(ch.id) && placeholder && !form.note.trim()) {
    NAMED.add(ch.id);
    nameChapter(ch.id);
  }
  return `<div style="display:flex; flex-direction:column">
    ${done ? `<div style="display:flex; flex-direction:column; gap:6px; padding-bottom:16px">
      ${done.map((line) => `<div style="display:flex; align-items:center; gap:9px; font-size:12.5px; color:var(--mute)">
        <span style="width:6px; height:6px; border-radius:50%; background:var(--good); flex:0 0 auto"></span>
        ${esc(line)}</div>`).join('')}</div>` : ''}
    <div class="serif" style="font-size:21px; color:var(--ink-bright)">${esc(ch.title || `Chapter ${ch.index}`)}</div>
    <div class="hint" style="margin:6px 0 0">Nothing here is required. Leave it and write.</div>

    <label class="lbl">Title</label>
    <input class="field" data-setup="title" value="${esc(form.title)}" placeholder="${
      S.naming ? 'Anansi is naming it…' : 'Untitled'}">

    <label class="lbl">What happens next</label>
    <textarea class="field" data-setup="note" style="min-height:80px"
      placeholder="${S.naming ? 'and saying what it has to do…' : 'Where this chapter has to end up'}"
      >${esc(form.note)}</textarea>
    <button class="btn ghost" data-name="${ch.id}" ${S.naming ? 'disabled' : ''} style="margin-top:7px">${
      S.naming ? 'Thinking&hellip;' : (!placeholder || form.note.trim())
        ? 'Have Anansi suggest another' : 'Have Anansi name it'}</button>
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
  if (!r.error) { S.prompts = { defaults: r.defaults ?? {}, yours: r.yours ?? {}, voice: r.voice ?? null }; paint(); }
}

function ctxTabs() {
  const t = (k, l) => `<button data-ctxview="${k}" style="flex:1; text-align:center; font-size:11.5px;
    padding:8px 0; border-radius:var(--r); border:1px solid ${S.ctxView === k ? 'rgba(217,178,106,.42)' : 'var(--chip)'};
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
      style="flex:1; text-align:center; font-size:11.5px; padding:8px 0; border-radius:var(--r);
      ${chip(k === e.entryType)}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <label class="lbl">When it reaches the model</label>
    <div style="display:flex; gap:6px">${[['always_on', 'Always on'], ['triggered', 'On a keyword']]
      .map(([k, l]) => `<button data-act="${k}" style="flex:1; text-align:center; font-size:11.5px;
      padding:8px 0; border-radius:var(--r); ${chip(k === e.activation)}">${l}</button>`).join('')}</div>
    <label class="lbl">Info</label>
    <!-- GROWS. It was a fixed 96px box, and an invented thread's body went from 60-120 words to
         120-200 on 2026-08-27 — so two thirds of a body sat below the fold in a field that gave no
         sign there was more. Measured: 656 characters, 94px of box, 283px of content. Nothing was
         lost, it scrolled, and it read as cut off, which is what Seth reported. Capped so a very
         long one still leaves the buttons under it reachable. -->
    <textarea class="field grow" data-f="body" style="min-height:150px; max-height:52vh"
      >${esc(e.body ?? '')}</textarea>
    <div class="hint">This is what the model reads. Bracket form keeps it short: [Name: trait, trait].</div>
    <label class="lbl">Trigger words</label>
    <input class="field" data-f="keys" value="${esc((e.keys ?? []).join(', '))}"
      ${e.activation === 'always_on' ? 'disabled style="opacity:.5"' : ''}>
    <div class="hint">${e.activation === 'always_on'
      ? 'Always-on entries need none — they are sent on every call.'
      : (e.keys ?? []).length
        ? 'Comma separated, up to ten. A whole word in recent prose or in your directive fires it.'
        : '<strong>This entry cannot reach the model yet.</strong> Triggered with no trigger words '
          + 'never fires, and nothing else on this screen would tell you. Comma separated, up to '
          + 'ten — a whole word in recent prose or in your directive fires it.'}</div>
    <label class="lbl">Your notes</label>
    <textarea class="field" data-f="notes" style="min-height:64px">${esc(e.notes ?? '')}</textarea>
    <div class="hint">Never sent to the model. The engine's entry type has no such field.</div>
    ${e.entryType === 'character' ? `
    <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Wardrobe</div>
    <div class="hint" style="margin:0 0 8px">A named outfit is a second bracket on this character
      while it is worn, so taking the plate off does not mean rewriting who she is. One at a time —
      the database enforces that, not the screen.</div>
    <!-- Wearing one used to be possible ONLY on the Threads list, and this panel said so in a
         sentence. So the screen that holds the wardrobe could not put anything on, the cross-book
         page had no chips at all, and the outfits themselves were read-only even though
         upsertOutfit has updated by id since it was written. Both live here now, on the thing
         they act on. -->
    ${(e.outfits ?? []).map((o) => `<div class="card" style="margin-bottom:8px; gap:7px;
      border-color:${o.active ? 'rgba(217,178,106,.34)' : 'var(--chip)'}">
      <div style="display:flex; align-items:center; gap:9px">
        <input class="field" data-ofn="${o.id}" value="${esc(o.name)}" aria-label="Outfit name"
          style="margin:0; font-size:13px; color:var(--ink-bright)">
        <button data-deloutfit="${o.id}" style="flex:0 0 auto; color:var(--bad); font-size:12px" aria-label="Remove">✕</button></div>
      <textarea class="field" data-ofb="${o.id}" aria-label="What the model reads while it is worn"
        style="margin:0; min-height:52px; font-size:12.5px; line-height:1.45">${esc(o.body)}</textarea>
      <div style="display:flex; gap:7px">
        <button class="btn ghost" data-wear="${e.id}:${o.id}" style="flex:1; ${o.active
          ? 'border-color:rgba(217,178,106,.45); color:var(--gold)' : ''}">${
          o.active ? 'Worn — take it off' : 'Wear this'}</button>
        <button class="btn ghost" data-saveoutfit="${o.id}" style="flex:0 0 auto">Save</button></div></div>`).join('')}
    <div class="card" style="gap:7px">
      <input class="field" data-of="name" placeholder="Plate, court dress, travelling…">
      <textarea class="field" data-of="body" placeholder="What the model reads while it is worn"
        style="min-height:52px"></textarea>
      <button class="btn ghost" data-addoutfit="1">Add an outfit</button>
      ${inventTray('outfit', `Have Anansi dress ${esc(e.title)}`,
                   'mourning, or travelling light, or whatever you already had in mind')}
    </div>` : ''}

    <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Over time${helpMark('states')}</div>
    ${helpBody('states')}
    <div class="hint" style="margin:0 0 8px">A fact can open at a later chapter. Before it opens it is
      hidden, or hinted at without saying what it is. Earlier chapters keep the body above.</div>
    <!-- Editable for the same reason: upsertState has updated by id since it was written, and the
         only way to correct a wrong chapter number was to delete the override and type it again. -->
    ${(e.states ?? []).map((st) => `<div class="card" style="margin-bottom:8px; gap:7px">
      <div style="display:flex; align-items:center; gap:7px">
        <input class="field" data-stf="${st.id ?? ''}" type="number" min="1" value="${st.fromChapter}"
          aria-label="From chapter" style="margin:0; width:92px">
        <select class="field" data-stm="${st.id ?? ''}" aria-label="Before that chapter" style="margin:0">
          <option value="hide" ${(st.beforeMode ?? 'hide') === 'hide' ? 'selected' : ''}>hidden before</option>
          <option value="hint" ${st.beforeMode === 'hint' ? 'selected' : ''}>hinted before</option></select>
        <button data-delstate="${st.id ?? ''}" style="margin-left:auto; color:var(--bad); font-size:12px" aria-label="Remove">✕</button></div>
      <textarea class="field" data-stb="${st.id ?? ''}" aria-label="What is true from that chapter on"
        style="margin:0; min-height:56px; font-size:12.5px; line-height:1.45">${esc(st.body)}</textarea>
      <input class="field" data-stl="${st.id ?? ''}" value="${esc(st.label ?? '')}"
        placeholder="If hinted, what the reader may sense" style="margin:0">
      <button class="btn ghost" data-savestate="${st.id ?? ''}">Save this change</button></div>`).join('')}
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
    ${S.fieldHistory ? `<div class="lbl" style="letter-spacing:.1em; margin-top:22px">Field history</div>
      ${S.fieldHistory.length ? S.fieldHistory.map((h) => `<div class="card" style="margin-bottom:8px">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(h.field)}</span>
          <span style="margin-left:auto; font-size:11px; color:var(--faint)">${h.replaced_at ? ago(h.replaced_at) : ''}${
            h.replaced_by ? ` &middot; ${esc(h.replaced_by)}` : ''}</span></div>
        <div class="clamp" style="font-size:12.5px; line-height:1.45; color:var(--mute)">${esc(h.previous_value ?? '')}</div>
        <button class="btn ghost" data-revertfield="${h.id}" style="margin-top:6px">Put this back</button></div>`).join('')
        : '<div class="hint">No earlier versions of any field.</div>'}` : ''}
    ${copyElsewhere(e)}
    <button class="btn" data-saveentry="1" style="margin-top:16px">Save</button>
    <button class="btn ghost" data-fieldhistory="1" style="margin-top:10px">${
      S.fieldHistory ? 'Hide field history' : 'Field history'}</button>
    <button class="btn ghost" data-delentry="1" style="margin-top:10px; color:var(--bad)">Delete this entry</button>
  </div>`;
}

/** Send this card to another of your books, or pull it out of one — the same operation, and which
 *  it is depends only on which book you happen to be standing in.
 *
 *  It copies. Nothing here changes and nothing is linked afterwards: two books that share a
 *  character diverge the moment either is edited, which is what a writer reusing a card between
 *  two books wants and is also the only version that needs no machinery to stay true.
 *
 *  LIB, not a fetch. The library is already loaded at boot and holds the writer's own stories, so
 *  the list on this screen cannot offer a book that is not theirs — the server checks both ends
 *  again, and the point of doing it here is that the menu has nothing wrong in it to pick. */
function copyElsewhere(e) {
  const others = LIB.filter((s) => s.id !== S.storyId);
  return `<div class="lbl" style="letter-spacing:.1em; margin-top:22px">Another book</div>
    ${others.length ? `<div class="hint" style="margin:0 0 8px">Copies ${esc(e.title)} into another of
      your books, with its trigger words. What it does NOT carry is the timeline: a change over time
      is anchored to a chapter number, and chapter seven there is not chapter seven here.</div>
    <div class="card" style="gap:7px">
      <select class="field" data-cf="into">${others.map((s2) =>
        `<option value="${esc(s2.id)}">${esc(s2.title)}</option>`).join('')}</select>
      <button class="btn ghost" data-copyentry="1">Copy it there</button></div>`
    : `<div class="hint" style="margin:0">You have one book. A card can be copied into another when
      there is another.</div>`}`;
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

    <div class="lbl" style="letter-spacing:.1em; margin-top:0">${takes.length > 1
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
          <span style="font-size:10px; letter-spacing:.1em; font-variant-caps:all-small-caps;
            color:var(--label); opacity:.7; align-self:center">Written against</span>
          ${names.map((nm) => `<span class="tag">${esc(nm)}</span>`).join('')
            || `<span class="tag">${t.canon.length} entries since removed</span>`}</div>`;
      })()}
      ${t.selected ? '' : `<button class="btn ghost" data-usetake="${t.id}" style="margin-top:8px">Put this one in the story</button>`}
    </div>`).join('')
      : '<div class="hint">One take. Regenerate on a passage keeps the old one and both appear here.</div>'}

    <div class="lbl" style="letter-spacing:.1em; margin-top:22px">Edits</div>
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

const STATUS = { in_progress: 'Writing', draft: 'Draft', finished: 'Finished', archived: 'Archived' };
// The pill is the genre when there is one, because that is the tag worth seeing on a shelf;
// status only shows when a story is finished or parked.
function storyCard(s, i, hero) {
  // Genre is comma-separated and always has been — an AI Dungeon import writes its tag list
  // straight into it, so a card read "horror, nsfw" inside a single pill. One tag per pill.
  const tags = String(s.genre ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  const gold = !!tags.length || s.status === 'in_progress';
  if (!tags.length) tags.push(STATUS[s.status] || 'Writing');
  // Archived is dimmed rather than hidden: it is still your book and still one tap away.
  return `<button class="storycard${hero ? ' hero' : ''}" data-open="${s.id}"
    style="${s.status === 'archived' ? 'opacity:.42; filter:saturate(.5)' : ''}">
    <span class="art" style="display:block; background:${
      // Single quotes: this whole thing goes inside style="…", and a double quote in the URL ends
      // the attribute at `background:url(` — which is exactly what it did, and the card lost both
      // its cover and its gradient.
      s.cover ? `url('${api.coverUrl(s.id, s.cover)}') center/cover no-repeat, ${ART[i % ART.length]}`
              : ART[i % ART.length]}">
      <span class="fade"></span>
      <span style="position:absolute; top:12px; left:14px; display:flex; gap:5px; flex-wrap:wrap;
        max-width:70%">${tags.map((t) => `<span class="tag" style="background:rgba(10,9,12,.6);
        ${gold ? 'border-color:rgba(217,178,106,.35); color:var(--gold)' : ''}">${esc(t)}</span>`).join('')}</span>
      ${hero ? '<span class="tag" style="position:absolute; top:12px; right:14px; background:rgba(10,9,12,.6)">Last written</span>' : ''}
      <span class="serif" style="position:absolute; bottom:12px; left:16px; right:16px;
        font-size:${hero ? 30 : 21}px; line-height:1.05; color:var(--ink-bright)">${esc(s.title)}</span></span>
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
  /** What changed, in the writer's words. Anansi writes it from the commit log and it is cached on
   *  the commit it was written from, so it updates itself on every commit with no hook and no build
   *  step. The fetch is fired from the render the way the cross-book ledger's is, guarded so an
   *  answer that repaints does not ask again. */
  news() {
    if (NEWS === null && !S.newsBusy) { S.newsBusy = true; loadNews(); }
    if (S.newsBusy && !NEWS) return '<div class="hint">Anansi is reading the work&hellip;</div>';
    if (!NEWS) return `<div class="hint">${esc(S.newsError ?? 'Nothing to say yet.')}</div>
      <button class="btn ghost" data-news="1" style="margin-top:12px; width:auto; padding:0 22px">Try again</button>`;
    // Every batch, newest first. A batch covers the commits since the batch before it, so this is
    // the whole history rather than only the latest run — which is the difference between release
    // notes and a status line.
    const batches = (NEWS.all?.length ? NEWS.all : [NEWS]);
    return `<div class="split"><div style="flex:1; min-width:0">
      <div class="hint" style="margin:0 0 14px">Written by Anansi from the work itself, not from a
        list somebody kept — so it is her reading of it, and the commits remain the record. A new
        batch is written whenever the app changes.</div>
      ${batches.map((b, i) => `<div style="margin-bottom:${i === batches.length - 1 ? 0 : 26}px">
        <div class="serif" style="font-size:${i ? 19 : 25}px; line-height:1.15; color:var(--ink-bright)">${
          esc(b.headline ?? '')}</div>
        ${b.at ? `<div class="kind" style="margin-top:4px">${ago(b.at)}</div>` : ''}
        ${(b.entries ?? []).map((e) => `<div class="card" style="margin-top:10px; gap:5px">
          <div class="kind">${esc(e.title ?? '')}</div>
          <div style="font-size:13.5px; line-height:1.6; color:var(--mute)">${esc(e.body ?? '')}</div>
        </div>`).join('')}
      </div>`).join('')}
      <button class="btn ghost" data-news="1" ${S.newsBusy ? 'disabled' : ''}
        style="margin-top:18px; width:auto; padding:0 22px">${
        S.newsBusy ? 'Reading&hellip;' : 'Read what has changed since'}</button>
    </div></div>`;
  },
  stories() {
    if (!LIB.length) return `<div class="split"><div style="flex:1">
      <div class="serif" style="font-size:30px; color:var(--ink-bright)">Nothing yet</div>
      <div class="hint">Start one and it becomes the hero of this page.</div>
      <button class="btn" data-open="new" style="width:auto; padding:0 28px; height:48px; margin-top:16px">Create a story</button>
    </div></div>`;
    // listStories is ordered by updated_at, so the first row is the one written into last. It
    // gets the hero; adding a story is the next thing on the page, then the rest. Archived books
    // sink to the end first, so an archived book never takes the hero slot.
    const [hero, ...rest] = shelfOrder(LIB);
    // What is waiting, across every book. The shelf is the only screen that can see across them, and
    // until this it could not see into one — so coming back after a day told you nothing about what
    // you had left half-done.
    // BY BOOK, not by item. It listed every waiting thing across every story, which on a shelf of
    // four books is a wall of chips saying the same three words — Seth: "instead of saying
    // everything for every story just bring up the titles of the stories that have notifications".
    // The book's own Waiting panel is where the detail belongs, and that is where this goes.
    const byBook = new Map();
    for (const w of waiting(LIB)) {
      const at = byBook.get(w.storyId) ?? { title: w.storyTitle, n: 0 };
      at.n += 1; byBook.set(w.storyId, at);
    }
    const books = [...byBook.entries()];
    return `<div style="display:flex; flex-direction:column; gap:22px">
      <div style="display:flex; gap:7px; flex-wrap:wrap; align-items:center">
        <span style="font-size:10px; letter-spacing:.1em; font-variant-caps:all-small-caps;
          color:var(--dim)">Waiting for you</span>
        ${books.length
          ? books.map(([id, b]) => `<button class="chip" data-owed="${esc(id)}" data-owedpanel="waiting"
              style="font-size:11.5px; padding:5px 11px">${esc(b.title)}
              <span style="color:var(--faint)"> &middot; ${b.n}</span></button>`).join('')
          // Said out loud, in her voice. An empty row is indistinguishable from a broken one, and
          // this row is the one a writer checks first on coming back.
          : `<span style="font-size:11.5px; color:var(--faint); font-style:italic">nothing is
              asking for you &mdash; which is either peace or a warning, and I never know which</span>`}
      </div>
      ${storyCard(hero, 0, true)}
      <!-- A button, not a card. The dashed cell was a book-shaped hole in a shelf of books, and it
           took a column from the ones that are real. The bar's New story pill is deskonly, so this
           is also the only one a phone sees. -->
      <button class="btn" data-open="new"
        style="width:auto; align-self:start; padding:0 22px; height:44px">＋ New story</button>
      ${rest.length ? `<div class="grid">
        ${rest.map((s, i) => storyCard(s, i + 1, false)).join('')}
      </div>` : ''}</div>`;
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
      <div class="aside" style="border:1px solid var(--edge); border-radius:var(--r); background:var(--rail); padding:20px 22px">
        <div class="lbl" style="letter-spacing:.1em">What comes back</div>
        ${S.spark ? sparkReview() : `${['Title', 'Genre', 'Point of view', 'Spice', 'Cast'].map((l) => `<div class="row">
          <span style="color:var(--ink)">${l}</span>
          <span style="margin-left:auto; color:var(--faint)">&mdash;</span></div>`).join('')}
        <div class="hint" style="margin-top:4px">Nothing is written until you accept it.</div>`}</div></div>`;
  },

  canon() {
    if (LEDGER === null) { loadLedger(); return `<div class="hint">Reading the threads…</div>`; }
    // A phone turns .split into a column, so the editor beside the list is BELOW the list — every
    // book's threads above it. Pressing one opened it off screen, which reads exactly like nothing
    // happening. Same answer as the story panel: the editor replaces the list, and ‹ Back returns.
    if (phone() && S.entryId && V) return `<div style="max-width:640px">${entryEditor()}</div>`;
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
            border-radius:var(--r-pill); ${chip(k === S.ledgerKind)}">${k === 'all' ? 'Everything' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
          <input class="field" id="lq" value="${esc(S.ledgerQ)}" placeholder="Search every story"
            style="margin-left:auto; max-width:280px">
        </div>
        <div id="books" style="display:flex; flex-direction:column; gap:16px">${ledgerBooks()}</div>
        ${V ? `<button class="dashed" data-newentry="lore" style="min-height:90px">New entry in ${esc(V.story.title)}</button>` : ''}
      </div>
      <div class="aside" style="border:1px solid var(--edge); border-radius:var(--r);
        background:var(--rail); padding:20px 22px">
        ${S.entryId && V ? entryEditor()
          : '<div class="hint" style="margin:0">Pick a thread to read or change it. Its book opens here as you press it — you do not have to find it on the shelf first.</div>'}
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
        <div class="lbl" style="letter-spacing:.1em">Imported</div>
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
          <div class="lbl" style="letter-spacing:.1em">Read as</div>
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
            <div class="lbl" style="letter-spacing:.1em">Prose</div>
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
        <div style="border:1px solid var(--chip); border-radius:var(--r); padding:22px 20px;
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

  bug() {
    return `<div style="display:flex; flex-direction:column; max-width:640px">
      <div class="serif" style="font-size:30px; line-height:1.08; color:var(--ink-bright)">Report an issue</div>
      <div style="font-size:14px; line-height:1.65; color:var(--mute); margin:10px 0 16px">What went
        wrong, and what you were doing when it did. One line is enough &mdash; the report brings the
        rest with it.</div>
      <textarea class="field" data-bug="1" style="min-height:132px"
        placeholder="The tray opened behind the scrim when I double-tapped a paragraph on my phone."
        >${esc(S.bug ?? '')}</textarea>
      <button class="btn" data-sendbug="1" style="margin-top:12px; width:auto; padding:0 28px; height:46px">${
        S.bugSending ? 'Filing&hellip;' : 'File it'}</button>
      ${S.bugUrl ? `<div class="hint" style="color:var(--good)">Filed &mdash;
        <a href="${esc(S.bugUrl)}" target="_blank" rel="noreferrer"
           style="color:var(--gold)">${esc(S.bugUrl.replace(/^https:\/\/github\.com\//, ''))}</a></div>` : ''}
      ${S.bugError ? `<div class="hint" style="color:var(--bad)">${esc(S.bugError)}<br>
        Nothing you wrote is lost &mdash; it is still in the box.</div>` : ''}
      <div class="lbl" style="letter-spacing:.1em; margin-top:26px">What goes with it</div>
      <div class="hint" style="margin:0">The commit that is running and whether the server is older
        than it &mdash; which is the thing that has cost a round trip on every round of reports so
        far. The model, the slot size, the surface you are on, and the story's <em>id</em>.</div>
      <div class="hint"><strong>Not the prose.</strong> Not a passage, not the premise, not a ledger
        entry. The story is named by id and nothing else, and the report says so on its own face.</div>
      <div class="hint">Filed through <code>gh</code>, so no token lives in this app.</div>
    </div>`;
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
        <div class="lbl" style="letter-spacing:.1em; margin-top:26px">Model</div>
        ${S.models === null ? '<div class="hint" style="margin:0">Asking the router&hellip;</div>'
          : S.models.length === 0 ? emptyModels()
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

        <div class="lbl" style="letter-spacing:.1em; margin-top:26px">The server itself</div>
        ${S.router ? `<div class="row"><span style="color:var(--ink)">llama-router</span>
            <span class="chip">${esc(S.router.state ?? '?')}</span>
            <span style="margin-left:auto; font-size:11px; color:var(--faint)">${
              S.router.since ? esc(String(S.router.since).replace(/^\w+ /, '')) : ''}</span></div>`
          : '<div class="hint" style="margin:0">Asking systemd&hellip;</div>'}
        <div style="display:flex; gap:7px; margin-top:10px">
          <button class="btn ghost" data-router="restart" style="flex:1">Restart it</button>
          <button class="btn ghost" data-router="stop" style="flex:1; color:var(--bad)">Release the models</button>
        </div>
        <div class="hint"><strong>Release</strong> stops the whole service and takes every model down
          with it. Switching your model below already releases the one you were on, so you rarely need
          this — it is for getting the card back for something that is not Anansi. Anansi cannot write
          while it is stopped; <strong>Restart</strong> brings it back and the next call loads what it
          needs. Both are shared: two writers, one server.</div>

        <div class="lbl" style="letter-spacing:.1em; margin-top:30px">What you have written</div>
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
            background:${d.n ? 'var(--gold)' : 'var(--chip)'}; opacity:${d.n ? .75 : .35}; border-radius:var(--r-tight)"></span>`).join('')}</div>
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
        <div class="lbl" style="letter-spacing:.1em">Slot</div>
        <div class="row"><span style="color:var(--ink)">Context per writer</span>
          <span class="tnum" style="margin-left:auto; color:var(--faint)">${slot ? slot.toLocaleString() : '—'}</span></div>
        <div class="row"><span style="color:var(--ink)">Canon cap</span>
          <span class="tnum" style="margin-left:auto; color:var(--faint)">45%</span></div>
        <div class="hint">${global && slots ? `${global.toLocaleString()} across ${slots} slots. The pool is
          shared, so two writers at full budget must both fit.` : ''}</div>
        <div class="lbl" style="letter-spacing:.1em; margin-top:26px">This machine</div>
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
  drawRail(); drawBar(); drawMeter(); drawAppearance(); drawPage(); drawSide();
  if (S.place === 'story' && V) { drawDoc(); drawDock(); } else { $('dock').hidden = true; }
}

/** The notes, and the error if there are none. Kept beside LEDGER because it is the same shape of
 *  thing: fetched once, rendered from, and null until it arrives. */
let NEWS = null;
async function loadNews(refresh) {
  S.newsBusy = true; S.newsError = null; drawPage();
  const r = await api.whatsnew(refresh);
  S.newsBusy = false;
  // Notes AND an error can both come back: the model was down, and what is on screen is what was
  // written for an older commit — still true about everything up to it, and better than a blank.
  NEWS = r.notes ? { ...r.notes, all: r.all ?? null } : null;
  S.newsError = r.error ?? null;
  drawPage();
  if (r.error && r.notes) toast(`Showing what is written — ${r.error}`);
  else if (r.written) toast(`Read ${r.read} commit${r.read === 1 ? '' : 's'}.`);
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
  // The server is the authority on your default; the cache was only there to paint before this
  // answered. A writer on a second device gets their own settings rather than the shipped ones.
  if (r.look && Object.keys(r.look).length) { Object.assign(MYLOOK, r.look); cacheMine(); }
  // Resolve unconditionally, and NOT only when the server sent a default. This is also the line
  // that takes a book's look back off when you leave it — `leaveTo` sets place to workspace and
  // calls this, so a writer with no default of their own still gets the shelf back to shipped
  // rather than keeping the theme of whichever book they just closed.
  resolveLook(S.place === 'story' ? V?.look : null);
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
  // Opening a book puts the rail on that book's menu. The menu button is how you get back to the
  // workspace one without leaving the story.
  S.railView = 'story';
  // And puts on the book's own look, if it has one. `V.look` null means follow the writer.
  resolveLook(V.look);
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
 *  One text node now. It used to be two — `settled` for the prose as it streamed and `head` for
 *  the glyphs at the frontier — and `settled` went when the streaming did; a span that can never
 *  hold a character is not a state, it is a leftover. `head` is animated on a timer of its own
 *  rather than on delta arrival, which is why it kept its clock when the deltas stopped reaching
 *  the page: a delta is a token, so anything driven by one runs at whatever uneven rate the model
 *  happens to be writing at.
 */
let unplace = null;
function ghost() {
  const doc = $('doc'), read = $('read'); if (!doc || !read) return;
  let g = document.getElementById('ghost');
  if (!g) {
    g = document.createElement('div');
    g.id = 'ghost'; g.className = 'veil';
    // OVER THE PAGE, NOT IN IT. As a block at the end of the column it was one more paragraph in
    // the document, and the document is what you are reading while you wait. A veil says the book
    // is busy without pretending to be part of it.
    //
    // Sized to #read rather than to #doc, and that is the whole care in this function: #doc also
    // holds the header and the composer, and a veil over the composer is a veil over Stop.
    // Positioned against #doc — which is `position:relative` and is NOT the scroller — so it holds
    // still while the prose behind it scrolls.
    const place = () => { g.style.top = `${read.offsetTop}px`; g.style.height = `${read.offsetHeight}px`; };
    place();
    unplace = () => removeEventListener('resize', place);
    addEventListener('resize', place);
    const narr = g.appendChild(document.createElement('div'));
    narr.className = 'narr';
    // textContent on both, never innerHTML: this is untrusted model output arriving a fragment at
    // a time, and a half-written "<" would be a half-written tag.
    narr.appendChild(document.createElement('span')).className = 'head';
    doc.appendChild(g);
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
}

const unghost = () => { unplace?.(); unplace = null; document.getElementById('ghost')?.remove(); };

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
  // THE EXACT COUNT WAS ALREADY IN THIS RESPONSE. `/api/manifest` does a /tokenize round trip and
  // has returned `exact` beside the manifest since the route was written; nothing ever read it, so
  // the bar drew `totals.used` — the ESTIMATE — and inherited both of PLAN-06's meter defects at
  // once: the estimator running high (2a) and SYSTEM missing from the sum (2d), measured together
  // at 1.28x by bench/drift.ts. Neither can reach the bar if the bar uses the tokenizer's answer.
  //
  // The generate path has always been right, which is why this never looked like a fixed offset:
  // routes.ts:258 overwrites totals.used with the same number, so the bar was exact after a
  // generation and 1.28x out on the next repaint.
  //
  // `exact` is null when the model is asleep. Then the estimate is all there is, and the panel
  // says so rather than presenting a guess in the same typeface as a measurement.
  //
  // COPIED, not mutated in place. Writing the exact count back into `r.manifest` edits the
  // server's own answer, which is invisible in a browser (a fresh parse per response) and not
  // invisible at all to a test whose stub hands back the same object every time — it clobbered
  // the fixture's estimate with the exact one and the check could no longer tell them apart.
  MANI_EXACT = !!MANI && typeof r.exact === 'number';
  if (MANI_EXACT) MANI = { ...MANI, totals: { ...MANI.totals, used: r.exact } };
  PROMPT = r.manifest ? (r.prompt ?? '') : '';
  MANIERR = r.manifest ? null : (r.error ?? null);
  drawBar(); drawMeter();
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
/** The story or chapter whose opening the model has been asked for, once.
 *
 *  A one-shot rather than a standing rule, and that distinction is the whole of it: "auto-open any
 *  empty chapter" would regenerate the opening every time you opened a story you had deliberately
 *  left blank. This is set by the two acts that create an empty chapter — accepting a spark, and
 *  ending one — and consumed immediately. */
let OPEN_WANTED = null;

/** Ask for the opening passage through the ORDINARY generate path.
 *
 *  Nothing about this is a second engine: it is the Continue button, pressed for you. The passage
 *  streams with the writing head, the budget check and the contradiction repair, because it IS the
 *  one generation path rather than a copy of it that would drift the day either changed. */
async function openingPassage() {
  const want = OPEN_WANTED;
  OPEN_WANTED = null;
  if (!want || !V || V.id !== want) return;
  if (V.story.autoOpen === false) return;
  // Only into a chapter with no prose in it. A scene break is not prose.
  if ((V.passages ?? []).some((p) => !p.isBreak)) return;
  await generate('continue');
}

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

  // The seam: the last thing on the page BEFORE the model writes. Read here rather than earlier,
  // because for Speak and Act your own line has already landed by now, and that line is the one
  // you would be reading from.
  S.seam = V?.passages?.filter((p) => !p.isBreak).at(-1)?.id ?? null;
  S.busy = true; drawDock(); working(mode);
  // Your text is already on the page in the three modes above, so the model gets no directive —
  // it gets told whose line it is answering instead.
  ghost();   // the roller, from the press until accept returns
  STOP = new AbortController();
  const r = await api.generateLive({ storyId: S.storyId, mode, chapterId: V.currentChapter.id,
    directive: YOURS ? undefined : (typed || undefined), speaker: who },
    () => {}, STOP.signal);
  STOP = null;
  unghost();
  // Stopped. The half-written passage goes with the ghost — you stopped it because you did not
  // want it — and nothing is accepted, so there is no take and no history entry. What you typed
  // is untouched either way: in the box for Direct, and already on the page for Speak/Act/Narrate,
  // where it is YOUR line and was never the model's to take back.
  if (r.aborted) {
    S.busy = false; drawDock(); working(null);
    // Continue is the mode with nothing typed, so "what you typed is still there" would be a
    // sentence about a box the writer left empty.
    return toast(YOURS ? 'Stopped. Your line is still on the page.'
                 : typed ? 'Stopped. What you typed is still in the box.'
                 : 'Stopped. Nothing was written.');
  }
  if (r.error) { S.busy = false; drawDock(); working(null); return toast(r.error); }
  MANI = r.manifest;
  MANI_EXACT = true;    // routes.ts:258 replaced totals.used with count(prompt) before sending it
  // Kept as it arrives. Discard and Keep are gone: a take you dislike is one ⋯ away from
  // Regenerate or Delete, and both keep the history, so nothing is lost by committing it.
  const a2 = await api.accept(S.storyId, { body: r.prose, genId: r.genId, chapterId: V.currentChapter.id,
    directive: YOURS ? undefined : (typed || undefined) });
  S.busy = false; working(null);
  if (a2.error) return toast(a2.error);
  clearComposer();
  V = await api.story(S.storyId, V.currentChapter.id);
  arrive();
  paint(); pinToSeam(); refreshManifest(); refreshHistory();
}

/** Mark the newest passage so it fades in once, and only once. The flag is cleared on a timer
 *  rather than at the end of the animation because every later repaint would otherwise re-add the
 *  class and replay it — a paragraph that fades in again every time you open a panel. */
function arrive() {
  const last = V?.passages?.filter((p) => !p.isBreak).at(-1);
  if (!last) return;
  S.arrived = last.id;
  // Longer than the 1.5s reveal, so a repaint mid-animation cannot strip the class and snap the
  // text visible half way across.
  setTimeout(() => { if (S.arrived === last.id) S.arrived = null; }, 1700);
}

/** THE END OF WHAT YOU WERE READING, NOT THE TOP OF WHAT ARRIVED.
 *
 *  The first version put the new passage's first line at the very top of the screen. Seth: "what
 *  you wrote doesnt work. what would work is to shoot back to the end of the last entry before the
 *  new one arrives. that will already be where i would start reading."
 *
 *  He is right, and the difference is not cosmetic. The seam is the last line of the entry you had
 *  already read. Pinning the NEW passage to the top pushes that line off the screen, so the first
 *  thing you do is scroll back up to see what the model was answering. Pinning the seam leaves it
 *  in view with the new prose starting underneath it — where the eye already is.
 *
 *  It also deletes the tail hack the first version needed: that one had to invent empty space below
 *  the last passage before the top of it could ever reach the top of the screen. This scrolls to a
 *  point that already has a whole passage underneath it, so there is nothing to pad. */
function pinToSeam() {
  const read = $('read'); if (!read || !S.seam) return;
  const el = document.querySelector(`[data-edit="${S.seam}"]`)?.closest('.block');
  if (!el) return;
  // A little above the fold, so the line you stopped on is still on screen rather than exactly at
  // the edge. `behavior:'auto'` because #read carries scroll-behavior:smooth, and a half-second
  // travel races the 1.5s wipe.
  const PEEK = 72;
  const top = read.scrollTop + (el.getBoundingClientRect().bottom - read.getBoundingClientRect().top) - PEEK;
  read.scrollTo({ top, behavior: 'auto' });
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
  STOP = new AbortController();
  const r = await api.generateLive({ storyId: S.storyId, mode: S.mode, regenerateOf: id, chapterId: V.currentChapter.id,
    speaker: S.mode === 'speak' || S.mode === 'act' ? (S.speaker || V.story.persona || undefined) : undefined },
    atEnd ? (d) => ghost(live += d) : () => {}, STOP.signal);
  STOP = null;
  unghost();
  // Stopping a re-roll leaves the take you already had selected, because nothing was accepted.
  if (r.aborted) {
    S.busy = false; drawDock(); drawBar(); working(null);
    return toast('Stopped. The take you had is untouched.');
  }
  if (r.error) { S.busy = false; drawDock(); drawBar(); working(null); return toast(r.error); }
  const a2 = await api.accept(S.storyId, { body: r.prose, genId: r.genId, variantOf: id, rejected: true,
    chapterId: V.currentChapter.id });
  S.busy = false; working(null);
  if (a2.error) { drawDock(); drawBar(); return toast(a2.error); }
  V = await api.story(S.storyId, V.currentChapter.id);
  paint(); refreshManifest(); refreshHistory();
  toast(r.reusedDirective
    ? `New take on your instruction: ${String(r.reusedDirective).slice(0, 90)}`
    : 'New take kept. Both are in History, with the canon each was written against.');
}



/** The ⋯ tray. One open at a time, and the scrim is raised while one is.
 *
 *  Done in place rather than through paint() for the reason the Delete confirmation is: a repaint
 *  rebuilds #col and drops aria-expanded, so any repaint shuts the tray. Which is fine as long as
 *  the scrim goes with it — a backdrop with nothing on top of it is a page that has stopped
 *  answering. syncTray() is what keeps the two in step, and drawDoc calls it for the repaint case.
 *
 *  `blk` null shuts whatever is open; the same block twice is a toggle. */
const syncTray = () => {
  root.dataset.tray = document.querySelector('.block[aria-expanded="true"]') ? '1' : '0';
};
function openTray(blk) {
  const already = blk?.getAttribute('aria-expanded') === 'true';
  for (const b of document.querySelectorAll('.block[aria-expanded="true"]')) b.setAttribute('aria-expanded', 'false');
  if (blk && !already) blk.setAttribute('aria-expanded', 'true');
  syncTray();
}

/** A double click, and on a phone a double tap, opens the paragraph's tray.
 *
 *  A second way in rather than a replacement: the ⋯ handle is what must always work, and F34
 *  measured how little finger movement it takes to lose a tap on this surface, so nothing here
 *  gets to depend on the delegated `click` firing. `dblclick` is its own native event and arrives
 *  on its own account.
 *
 *  ponytail: measured on emulated touch only — `page.mobile()` plus real touch pairs, where the
 *  browser does synthesise dblclick from two taps. A real Android that still has double-tap-to-zoom
 *  may swallow the second tap as a zoom gesture instead, and nothing here can tell. Ceiling: the
 *  ⋯ handle is the guaranteed way in and this is the shortcut. If it turns out not to fire on a
 *  real device the upgrade is a tap-count recogniser on pointerup — which is F34's fix and wants
 *  agreeing first, because the guard that swallows the native click is what makes Delete run twice.
 *
 *  No preventDefault. The passages are contenteditable and a double click there selects a word;
 *  the selection stays under the sheet and is still there when it closes, which is what someone
 *  who double-clicked a word and then pressed Edit would expect. */
document.addEventListener('dblclick', (e) => {
  // Reading mode used to refuse this outright. It opens the tray now — CSS hides everything in it
  // that writes, so what is left is Regenerate, Branch and the chapter list. Seth: "in reading mode
  // double clicking should work but it should only have regenerate, branch, and a skip to chapter".
  // `#col .block` still has `pointer-events:none` while reading, so this is the only way in, which
  // is the point: taps in the prose do nothing and a deliberate double still reaches the tray.
  const blk = e.target.closest('#col .block');
  if (!blk || e.target.closest('.acts')) return;
  openTray(blk);
});

// ---------- the tap that the browser threw away ----------
//
// F34: a tap whose finger moves more than about 20px is reclassified as a scroll and `click` never
// fires. Measured on this surface — 14px still opens a story, 24px does nothing — and on a 3x phone
// 24 CSS px is a few millimetres of thumb on a 307px-tall card. It kills the shelf, the tray actions
// and the panel buttons alike, because all of them arrive through the one delegated click below.
//
// So: watch the touch, and if the browser is not going to deliver the click, deliver it.
//
// THE GUARD IS THE WHOLE RISK, and it is why this waited for Seth to say yes. Delete take and Delete
// this story are two-press confirmations — fire one twice and the second press is the deletion. The
// ordering below is what makes that impossible, in this order and no other:
//
//   1. dispatch inside DISPATCHING, so the handler knows this one is ours and acts on it;
//   2. set SYNTH only AFTER the dispatch returns, so our own event cannot be swallowed by it;
//   3. any native click on the same control within 700ms is then dropped, which is the one the
//      browser might still send for a movement near the threshold.
//
// Below 10px is left alone: the browser fires click itself there and synthesising would be the
// double. Above 60px was a scroll and is not a tap at all.
let TAP = null;         // the touch in progress, if it started on something actionable
let SYNTH = null;       // { el, at } — a click we just delivered ourselves
let DISPATCHING = false;

/** Where the page is, so a gesture that MOVED it can be told from one that did not. This is the
 *  strongest signal there is: the browser only takes the click away when it decided to scroll, and
 *  if it scrolled, the writer was scrolling. */
const scrollNow = () => (($('read')?.scrollTop ?? 0) + (document.scrollingElement?.scrollTop ?? 0));

document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') { TAP = null; return; }
  const t = e.target.closest(ACTIONS);
  TAP = (t && t !== root && t !== document.body)
    ? { el: t, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0,
        at: Date.now(), scroll: scrollNow(), step: 0, stepAt: Date.now() }
    : null;
}, true);

// Tracked here rather than read at the end, because the end is the problem: once the browser decides
// the touch was a scroll it sends POINTERCANCEL, and a cancel carries no useful coordinates. The
// first version of this listened for pointerup only and never ran at all — the very case it exists
// for is the one where pointerup does not come.
document.addEventListener('pointermove', (e) => {
  if (!TAP || e.pointerType === 'mouse') return;
  // The size of the LAST step and when it happened, which is how a finger that has come to rest is
  // told from one still travelling when it lifts.
  TAP.step = Math.hypot(e.clientX - TAP.lx, e.clientY - TAP.ly);
  TAP.stepAt = Date.now();
  TAP.lx = e.clientX; TAP.ly = e.clientY;
  TAP.moved = Math.max(TAP.moved, Math.hypot(e.clientX - TAP.x, e.clientY - TAP.y));
}, true);

const endTap = (e) => {
  const s = TAP; TAP = null;
  if (!s || e.pointerType === 'mouse') return;
  if (Date.now() - s.at > 700) return;                            // a long press is not a tap
  // THREE tests, and the first version had only the loosest of them. Seth: "i cant scroll without
  // opening something" — a 40px scroll that began on a story card was inside the old 10-to-60 band
  // and opened it.
  //
  //  1. under 10px the browser fires click itself, and synthesising would be the double;
  //  2. over 30px is a scroll. 60 was far too generous: F34 measured the browser giving up around
  //     20, so a fumbled press lives just above that and nowhere near 60;
  //  3. THE PAGE MUST NOT HAVE MOVED, and the finger must have come to rest. The browser only takes
  //     the click away when it decided to scroll — so if anything scrolled, the writer was
  //     scrolling, whatever the distance says. And a finger still travelling when it lifts is a
  //     flick, not a press that wandered.
  // ponytail: neither of the next two lines is independently covered by a check. The 45px case in
  // phone.js stays green with the ceiling at 200 and the scroll check deleted, so something else
  // refuses that gesture and these two are belt to the braces that ARE falsified — the recogniser,
  // the double-fire guard and the flick rule. If a real press is ever wrongly refused, 30 is the
  // number to raise, and the way to earn a check for it is a control on a surface that cannot
  // scroll, which this fixture does not have.
  if (s.moved <= 10 || s.moved > 30) return;
  if (Math.abs(scrollNow() - s.scroll) > 2) return;
  if (s.step > 4 && Date.now() - s.stepAt < 120) return;
  // Still over the control it started on. elementFromPoint rather than e.target, because a cancel's
  // target is not where the finger is.
  const over = document.elementFromPoint(s.lx, s.ly);
  if (!over || over.closest(ACTIONS) !== s.el) return;
  DISPATCHING = true;
  s.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  DISPATCHING = false;
  SYNTH = { el: s.el, at: Date.now() };
};
document.addEventListener('pointerup', endTap, true);
document.addEventListener('pointercancel', endTap, true);

/** Leave whatever story is open for a workspace page. One body, two callers: the rail's back
 *  button and any workspace row pressed while a story is open. A second copy of this drifted
 *  within a day the last time the rail grew a door. */
async function leaveTo(page) {
  S.place = 'workspace'; S.wpage = page;
  // The look goes back to yours below, in loadLibrary — it resolves against S.place, which has
  // just changed. A second resolveLook here was the same call twice and neither could fail.
  // Leaving puts the rail back on the workspace menu. Without this the rail kept the story menu
  // for a story that is no longer open, and its Chapters list named a closed book's chapters.
  S.railView = 'workspace';
  S.panel = null; S.entryId = null;
  if (overlay()) S.rail = false;
  LEDGER = null;
  await loadLibrary();
  paint();
  if (page === 'prefs' && S.models === null) loadModels();
}

// ---------- one delegated listener ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest(ACTIONS);
  // The native click for a tap we already delivered. Dropping it is what stops a two-press
  // confirmation being satisfied by one finger.
  if (!DISPATCHING && SYNTH && SYNTH.el === t && Date.now() - SYNTH.at < 700) { SYNTH = null; return; }
  // <html> and <body> can never be an action. They carry the look and the rail state, and a
  // closest() that walked up to them turned every click in the app into a rail toggle.
  if (t === root || t === document.body) return;
  if (!t) { if (S.appearance && !e.target.closest('#appearance')) { S.appearance = false; drawAppearance(); drawBar(); } return; }
  const d = t.dataset;

  if (d.expand) { t.setAttribute('aria-expanded', t.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); return; }
  // The chapter list inside a passage's tray. Toggled per passage rather than globally, so opening
  // it on one passage and then another does not leave two open.
  if (d.chapters) {
    // drawDoc REBUILDS #col, and a rebuilt block has no aria-expanded — so redrawing to show the
    // list shut the tray the list lives in, and it could never be seen. The note above openTray
    // says this outright: any repaint shuts the tray. So the tray is re-opened on the same passage
    // afterwards, by id, because the element it was opened on no longer exists.
    S.chaptersFor = S.chaptersFor === d.chapters ? null : d.chapters;
    const on = d.chapters;
    drawDoc();
    const blk = document.querySelector(`[data-edit="${on}"]`)?.closest('.block')
      ?? document.querySelector(`[data-chapters="${on}"]`)?.closest('.block');
    if (blk) blk.setAttribute('aria-expanded', 'true');
    syncTray();
    return;
  }
  if (d.modelmenu) {
    S.modelMenu = !S.modelMenu;
    // The list is fetched lazily everywhere else too — opening the menu is the first moment
    // anybody needs it in the rail.
    if (S.modelMenu && S.models === null) loadModels();
    paint(); return;
  }
  if (d.news) { await loadNews(true); return; }
  if (d.dismiss) {
    const r = await api.dismiss(S.storyId, d.dismiss, d.ref ?? '');
    if (r.error) return toast(r.error);
    V = r; paint();
    return toast('Put away. It comes back if it changes.');
  }
  if (d.memo) {
    if (S.memoing) return;
    S.memoing = d.memo; drawDoc(); syncTray();
    toast('Asking Anansi what to remember from this…');
    const r = await api.memo(S.storyId, d.memo);
    S.memoing = null;
    if (r.error) { drawDoc(); return toast(r.error); }
    V = await api.story(S.storyId, V.currentChapter.id);
    // Straight to the queue it landed in, because a proposal you cannot see is a proposal you will
    // not work — the same reason extraction's count is reported rather than swallowed.
    S.panel = 'chapter'; syncHash(); paint();
    return toast(r.proposed
      ? `"${r.title}" is waiting in the chapter queue, from chapter ${r.chapter}. Nothing is canon yet.`
      : r.note ?? 'already proposed');
  }
  if (d.rail !== undefined) { S.rail = !S.rail; paint(); return; }
  // Two doors, one rail. `data-railview` says WHICH menu you asked for: the menu button asks for
  // the workspace, the story's own name asks for the story. Asking for the menu already open and
  // showing shuts it; asking for the other one swaps the rail over instead of closing it, which
  // is what makes them two doors rather than one toggle drawn twice.
  if (d.railview) {
    const want = d.railview;
    if (S.rail && S.railView === want) S.rail = false;
    else { S.railView = want; S.rail = true; }
    paint();
    return;
  }
  if (d.continue) { await generate('continue'); return; }
  // Abort only. Everything that has to be put back — the ghost, the busy flag, the composer —
  // is put back by whichever call was in flight, on its own aborted path, so there is exactly
  // one place that knows how to end a generation.
  if (d.stop) { STOP?.abort(); return; }
  // The hatch. The prose window closes at the chapter boundary, so this is the only way back to a
  // chapter the model has stopped seeing — `keep_whole` has been honoured by the engine since it
  // was written and had no control anywhere.
  if (d.ctxopen !== undefined) { S.ctxOpen = d.ctxopen === '1'; drawMeter(); return; }
  if (d.name) { await nameChapter(d.name); return; }
  if (d.pullback) {
    const r = await api.saveChapter(S.storyId, d.pullback, { keepWhole: d.on === '1' });
    if (r.error) return toast(r.error);
    V = r; paint(); refreshManifest();
    return toast(d.on === '1'
      ? 'Sent whole. Its prose goes to the model instead of its summary.'
      : 'Let go. It is back to its summary.');
  }
  if (d.newlore) {
    // Replaces New scene, which was removed with the mode set. Two ways to get a fact into the
    // ledger and they belong together: write it down yourself, or have the chapter read for what
    // is already on the page. The second is the ritual's extraction step, on its own.
    S.lore = S.lore ? null : { kind: 'character' };
    if (S.lore) { S.entryId = null; S.historyOf = null; S.panel = 'threads'; }
    syncHash(); paint();
    return;
  }
  if (d.newstring) {
    const get = (f) => document.querySelector(`[data-st2="${f}"]`)?.value?.trim();
    if (!get('title')) return toast('A string needs something to call it.');
    const r = await api.saveString(S.storyId, { title: get('title'), body: get('body'),
      fromChapter: Number(get('fromChapter')) || null, owedBy: Number(get('owedBy')) || null });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId, V.currentChapter.id); paint();
    return toast('Tied. It is yours until you put it in play.');
  }
  if (d.summon) {
    const x = (V.strings ?? []).find((s2) => s2.id === d.summon);
    const r = await api.saveString(S.storyId, { ...x, summoned: !x?.summoned });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId, V.currentChapter.id); paint(); refreshManifest();
    return toast(x?.summoned ? 'Put away. The model stops being told about it.'
                             : 'In play. It reaches the prompt from the next call.');
  }
  if (d.stringstatus) {
    const [id, status] = String(d.stringstatus).split(':');
    const x = (V.strings ?? []).find((s2) => s2.id === id);
    // Paying one off takes it out of play as well: a paid promise the model is still told about is
    // an instruction to pay it twice.
    const r = await api.saveString(S.storyId, { ...x, status, summoned: status === 'open' && x?.summoned });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId, V.currentChapter.id); paint(); refreshManifest(); return;
  }
  if (d.delstring) {
    const r = await api.delString(S.storyId, d.delstring);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId, V.currentChapter.id); paint(); refreshManifest(); return;
  }

  if (d.askfill !== undefined) {
    // Fills the box, never sends. The panel's rule is that nothing happens until you choose it.
    const box = document.getElementById('askBox');
    if (box) { box.value = d.askfill; box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
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
  if (d.saveoutfit) {
    const name = document.querySelector(`[data-ofn="${d.saveoutfit}"]`)?.value.trim();
    const body = document.querySelector(`[data-ofb="${d.saveoutfit}"]`)?.value.trim();
    if (!name || !body) return toast('An outfit needs a name and something to wear.');
    // The id is what makes this an edit rather than a second outfit — upsertOutfit branches on it,
    // and it checks the row belongs to this story before it writes.
    const r = await api.saveOutfit(S.storyId, S.entryId, { id: d.saveoutfit, name, body });
    if (r.error) return toast(r.error);
    V = r.entries ? r : await api.story(S.storyId);
    paint(); refreshManifest(); toast('Saved.'); return;
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
    // Which list the row came from is `S.railView`, the same state drawRail used to draw it —
    // not `S.place`, which since the two menus split can say "story" while the rail is showing
    // the workspace. Reading the wrong one put My stories and Import inside the story as panels
    // that do not exist.
    if (S.place === 'story' && S.railView === 'story') {
      S.panel = PANEL_WAS[d.nav] ?? d.nav; S.entryId = null; S.historyOf = null; syncHash();
      if (overlay()) S.rail = false;
      paint();
      if (d.nav === 'search') $('q')?.focus();
      return;
    }
    // A workspace row from inside a story is a departure, and it is the same departure the back
    // button makes — so it goes through the one handler that already knows how, rather than a
    // second copy of it that would drift.
    return void await leaveTo(d.nav);
  }
  if (d.leave) { await leaveTo(d.leave === '1' ? 'stories' : d.leave); return; }
  if (d.panel !== undefined) { S.panel = d.panel || null; syncHash(); paint(); return; }
  if (d.appearance !== undefined) { S.appearance = d.appearance === '1' ? !S.appearance : false; drawAppearance(); drawBar(); return; }
  if (d.looktab) { S.lookTab = d.looktab; drawAppearance(); return; }
  if (d.theme) return void changeLook({ theme: d.theme });
  if (d.fontpick) return void changeLook({ font: d.fontpick });
  if (d.sizepick) return void changeLook({ size: d.sizepick });
  if (d.scalepick) return void changeLook({ scale: d.scalepick });
  // Take the book's look as your own, everywhere. The book keeps it as well — this is a copy
  // upwards, not a move, so pressing it does not change what is in front of you.
  if (d.lookmine) {
    Object.assign(MYLOOK, look); cacheMine(); drawAppearance();
    const r = await api.saveLook({ look: MYLOOK });
    if (r.error) return toast(r.error);
    return toast('Saved as your default for every book.');
  }
  // And back. Null is the value that means follow, so this is a write rather than a delete.
  if (d.lookfollow) {
    const r = await api.saveLook({ storyId: S.storyId, look: null });
    if (r.error) return toast(r.error);
    V = r; resolveLook(null); drawAppearance(); paint();
    return toast('This book follows your default again.');
  }
  // The attribute is written here rather than in applyLook: reading mode is not part of the look
  // and does not belong in the bag that gets persisted.
  if (d.readmode !== undefined) {
    S.reading = d.readmode === '1';
    root.dataset.reading = S.reading ? '1' : '0';
    drawBar();
    return;
  }

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
  if (d.del || d.delall) {
    // Delete sits next to Regenerate, fired on one press and had no undo. The confirmation is done
    // in place rather than through paint(): a repaint drops the tray's aria-expanded, so on a phone
    // the second press would have nothing left to press. The toast is the part a phone can see —
    // .lbl-txt is hidden there, the tray is icons only.
    const id = d.del || d.delall, every = !!d.delall;
    // The key carries WHICH delete is armed, or confirming "this take" would fire "all of them".
    const key = (every ? 'all:' : 'one:') + id;
    if (S.confirmDel !== key) {
      S.confirmDel = key;
      const lbl = t.querySelector('.lbl-txt'), was = lbl?.textContent;
      if (lbl) lbl.textContent = 'Press again';
      toast(every ? 'Press again to remove every take of this passage.'
                  : 'Press Delete again to remove it.');
      setTimeout(() => { if (S.confirmDel === key) { S.confirmDel = null; if (lbl) lbl.textContent = was; } }, 4000);
      return;
    }
    S.confirmDel = null;
    const r = await api.delPassage(S.storyId, id, every); if (r.error) return toast(r.error);
    // The panel may be showing the very passage that just went.
    if (S.historyOf?.id === id) { S.historyOf = null; S.panel = 'context'; }
    V = await api.story(S.storyId); paint(); refreshHistory();
    if (every) toast(`${r.deleted ?? 0} take${r.deleted === 1 ? '' : 's'} gone. The passage is out of the book.`);
    return; }
  if (d.vp || d.vn) { const p = V.passages.find((x) => x.id === (d.vp || d.vn)); const v = p?.variants ?? [];
    const at = v.findIndex((x) => x.selected); const next = v[at + (d.vn ? 1 : -1)];
    if (next) { await api.pickVariant(S.storyId, next.id); V = await api.story(S.storyId);
      paint(); refreshHistory(); } return; }
  if (d.goflag) {
    // The passage the flag is about, marked when you land on it — the same road a search hit takes.
    S.found = d.goflag; S.panel = null; syncHash(); paint();
    setTimeout(() => document.querySelector(`[data-edit="${d.goflag}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    return;
  }
  if (d.dropflag) {
    const r = await api.dismissFlag(S.storyId, d.dropflag);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId, V.currentChapter.id); paint();
    return toast('Dismissed. The prose is untouched.');
  }
  if (d.flagx) {
    // Expanding is all this does now. Dismissing was shift-click here, which no touch screen can
    // reach; it is a labelled button in the row the expander opens.
    t.setAttribute('aria-expanded', t.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    return;
  }
  if (d.hwkb) { setHwkb(!hwkb); drawAppearance(); return toast(hwkb
    ? 'The caret comes back to the box on this device.' : 'The caret stays where you put it.'); }
  if (d.bigin) { S.bigInput = !S.bigInput; drawDock(); $('input')?.focus(); return; }
  if (d.mute) {
    V = await api.mute(S.storyId, V.currentChapter.id, d.mute, false); paint();
    return toast('Quiet for this chapter. Lift it in Waiting.');
  }
  if (d.unmute) {
    V = await api.mute(S.storyId, V.currentChapter.id, d.unmute, true); paint();
    return toast('Listening again.');
  }

  if (d.entry) { S.entryId = d.entry; S.fieldHistory = null;
    if (S.place === 'story' && S.panel !== 'threads') S.panel = 'entry';
    // The cross-book page lists threads from every story and the editor beside it reads from the
    // OPEN one, so pressing a thread in a book you had not opened set S.entryId and then rendered
    // the "pick an entry" hint again — the press did nothing, and said nothing either. Load the
    // book the thread belongs to, and stay on the page: the split is a list next to an editor
    // because browsing many books' threads is the whole point of it.
    else if (S.place === 'workspace') {
      const owner = (LEDGER ?? []).find((x) => x.id === d.entry);
      if (owner && owner.story !== S.storyId) {
        const r = await api.story(owner.story);
        if (r.error) return toast(r.error);
        V = r; S.storyId = owner.story;
      }
    }
    paint(); return; }
  if (d.copyentry) {
    const into = document.querySelector('[data-cf="into"]')?.value;
    if (!into) return toast('Pick a book to copy it into.');
    const r = await api.copyEntry(S.storyId, into, S.entryId);
    if (r.error) return toast(r.error);
    // No repaint: nothing in THIS book changed, and rebuilding the panel under someone who is
    // mid-edit in a field is how the seventh instance of the repaint bug got written.
    return toast(`Copied into ${LIB.find((s2) => s2.id === into)?.title ?? 'the other book'}. `
      + 'Nothing here changed, and the two are not linked.');
  }
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
    // `allowNoKeys`: the guard in db.upsertEntry turns a keyless `triggered` entry always-on so
    // nothing lands dark by accident, and this chip is the one place where the two-step is the
    // ONLY route — the trigger-words field above is disabled while an entry is always-on, so a
    // writer has to switch first and type second. Without the flag the switch bounces straight
    // back and a triggered entry cannot be made at all. A human pressing "On a keyword" with the
    // chip and the hint in front of them is not the silence 2e is about.
    const patch = { ...e, id: e.id, keys: e.keys ?? [], allowNoKeys: true };
    if (d.kind) patch.entryType = d.kind; else patch.activation = d.act;
    const r = await api.saveEntry(S.storyId, patch);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest(); return;
  }
  if (d.saveentry) {
    const e = V.entries.find((x) => x.id === S.entryId); if (!e) return;
    const get = (f) => document.querySelector(`[data-f="${f}"]`)?.value;
    // `db.keysOf` is authoritative and re-parses this on the way in; the same bound is mirrored
    // here only so the box does not show a key the server is about to drop. SPEC §7.1: ten, 2-32.
    const keys = String(get('keys') ?? '').split(',').map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 32).slice(0, 10);
    // Same reason as the chips: the writer is looking at the entry. Emptying the keys box and
    // saving leaves it triggered-and-dark, which the hint below now says out loud — better than
    // silently switching it always-on and changing what every call sends without being asked.
    const r = await api.saveEntry(S.storyId, { ...e, id: e.id, title: get('title') ?? e.title,
      body: get('body') ?? e.body, notes: get('notes') ?? e.notes, keys, allowNoKeys: true });
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
    // Shut the tray first. It is a sheet over the middle of the content now, so leaving it up
    // hides the very paragraph the cursor was just put in. Every other action in the tray either
    // repaints — which shuts it through drawDoc — or is Delete, which is waiting for a second press.
    openTray(null);
    const el = document.querySelector(`[data-edit="${d.ed}"]`);
    if (!el) return;
    // Editable HERE and nowhere else. Every passage used to carry contenteditable all the time, so
    // on a phone a tap in the prose put a caret in it and raised the keyboard — you were editing
    // without having asked to, which is what Seth reported. Edit is the only door in now, and blur
    // shuts it again.
    // Hand back the RAW text to edit. What is on screen is paragraphs, and editing those directly
    // would save a passage with every paragraph break removed, because textContent puts nothing
    // between block children.
    if (el.dataset.raw !== undefined && el.querySelector('p')) el.textContent = el.dataset.raw;
    el.setAttribute('contenteditable', 'plaintext-only');
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
    // `allowNoKeys` is the opt-out for the guard in `db.upsertEntry`, which otherwise turns a
    // keyless `triggered` entry always-on so it cannot go dark by accident. Here dark is the
    // point — see the two lines above — so the intent is stated rather than left to be inferred
    // from a state that means the opposite everywhere else.
    const res = await api.saveEntry(S.storyId, { id: '', title, body, entryType: 'lore',
      activation: 'triggered', keys: [], allowNoKeys: true, lastEditor: 'human' });
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
    SRV.model = r.active; S.modelMenu = false; loadModels(); paint();
    // What happened to the one you were on. Said out loud because the alternative — a model that
    // silently stays resident, or one that silently goes — is the difference between "why is the
    // card full" and "why did that take 45 seconds", and neither question has an answer on screen.
    const name = (id) => modelName(id).name;
    return toast(r.released ? `Now writing with ${name(r.active)}. ${name(r.released)} released.`
      : r.kept ? `Now writing with ${name(r.active)}. ${name(r.kept.split(' — ')[0])} kept — ${r.kept.split(' — ')[1]}.`
      : `Now writing with ${name(r.active)}.`);
  }

  if (d.lkind) { S.ledgerKind = d.lkind; drawPage(); return; }
  if (d.ctxview) { S.ctxView = d.ctxview; drawSide(); return; }
  if (d.goblock !== undefined) {
    const [kind, id] = d.goblock.split(':');
    if (kind === 'entry' && id) { S.entryId = id; S.panel = 'entry'; }
    else if (kind === 'traj') S.panel = 'chapter';
    else if (kind === 'threads') { S.entryId = null; S.panel = 'threads'; }
    else if (kind === 'strings') S.panel = 'strings';
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
  if (d.savestate !== undefined) {
    if (!d.savestate) return toast('That change has no id to save.');
    const get = (a) => document.querySelector(`[data-${a}="${d.savestate}"]`)?.value;
    const from = Number(get('stf'));
    if (!from || !String(get('stb') ?? '').trim()) return toast('A chapter number and a body, at least.');
    const r = await api.saveState(S.storyId, S.entryId, { id: d.savestate, fromChapter: from,
      body: get('stb'), beforeMode: get('stm'), label: get('stl') || null });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest(); toast('Saved.'); return;
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
  // Archiving is a status change and nothing else — no separate table, no hiding, and the same
  // route that saves every other story field. Reversible by pressing it again.
  // Pressing the same web again shuts it, so the icon is a toggle rather than a one-way door.
  if (d.help) { S.help = S.help === d.help ? null : d.help; paint(); return; }
  // One press goes to the work, not to a list of where the work might be.
  if (d.owed) {
    await openStory(d.owed);
    S.panel = d.owedpanel || 'chapter';
    syncHash(); paint();
    return;
  }
  // The logo goes home. It looked like a heading and was the one thing on every screen that did
  // nothing when pressed.
  if (d.home) {
    S.place = 'workspace'; S.wpage = 'stories'; S.panel = null; S.storyId = null; V = null;
    await loadLibrary(); syncHash(); paint();
    return;
  }
  if (d.sendbug) {
    const said = document.querySelector('[data-bug]')?.value ?? '';
    if (!said.trim()) return toast('Say what went wrong first.');
    S.bug = said; S.bugSending = true; S.bugUrl = null; S.bugError = null; paint();
    const r = await api.bug({ said, storyId: S.storyId ?? null,
      chapterIndex: V?.currentChapter?.index ?? null,
      agent: navigator.userAgent, lastError: S.lastError ?? null });
    S.bugSending = false;
    if (r.url) { S.bugUrl = r.url; S.bug = ''; toast('Filed.'); }
    // The report is handed back on failure, so a gh that is offline or logged out costs the
    // writer nothing they typed. It stays in the box.
    else { S.bugError = r.error ?? 'could not file it'; toast(r.error ?? 'could not file it'); }
    paint();
    return;
  }
  if (d.delcover) {
    const r = await api.delCover(S.storyId);
    if (r.error) return toast(r.error);
    V = r; await loadLibrary(); paint();
    toast('Cover removed. The card goes back to its gradient.');
    return;
  }
  if (d.archive) {
    const r = await api.saveStory(S.storyId, { status: d.archive });
    if (r.error) return toast(r.error);
    V = r; await loadLibrary(); paint();
    toast(d.archive === 'archived' ? 'Archived. It sits at the end of the shelf.' : 'Back on the shelf.');
    return;
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
    // A checkbox carries its answer in `checked`, not in `value` — `el.value` on an unchecked box
    // is the string "on", which is truthy, so reading it the same way as a text field saves every
    // switch as ON whichever way the writer left it.
    document.querySelectorAll('[data-story]').forEach((el) => {
      patch[el.dataset.story] = el.type === 'checkbox' ? el.checked : el.value;
    });
    // A range carries a string, and `Number('') || 0` on an untouched one would save 0 — which is
    // a picture turned off rather than a picture left alone. It is always present when it renders,
    // so the cast is all it needs; the clamp lives in db.updateStory where every caller passes.
    if (patch.coverOpacity !== undefined) patch.coverOpacity = Number(patch.coverOpacity);
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
    // Steps 1 to 3 are ONE call. The route summarises on close by itself, remembers what the
    // chapter did to the people in it, and — since 2026-08-27 — reads it for facts, all on the
    // same terms: "on close rather than on a button nobody remembers". This used to make the
    // extract call itself, which after the move would have run the extractor twice.
    S.ritual = 'Closing, summarising, reading it for facts…'; paint();
    const r = await api.endChapter(S.storyId, {});
    if (r.error) { S.ritual = null; working(null); paint(); return toast(r.error); }
    V = await api.story(S.storyId);
    const summary = V.chapters.find((c) => c.id === closing.id)?.summary;
    const steps = [summary ? `Summarised ${closing.title || 'the chapter'} in ${summary.split(/\s+/).length} words`
                           : 'Closed, but the summary did not come back'];

    // What the close already found. Nothing is accepted — SPEC 8.2, and it is the rule that makes
    // the ledger worth trusting. `extracted` null means the model was down when it closed, which
    // a chapter is allowed to do; the standalone button is still there to run it again.
    const x = r.extracted;
    steps.push(!x ? 'Could not read it for facts — the button on this panel will try again'
      : x.error ? `Could not read it for facts: ${x.error}`
      : `${x.added ?? 0} proposed as threads — nothing accepted yet`);

    // Step 4: the next chapter's setup, skippable.
    V = await api.story(S.storyId);
    V.ritualDone = steps;
    S.ritual = null; working(null);
    S.panel = 'setup';
    syncHash(); paint(); refreshManifest();
    // The new chapter is empty, so the same switch that opens a story opens this one.
    if (V.story.autoOpen !== false) { OPEN_WANTED = S.storyId; await openingPassage(); }
    return;
  }
  if (d.summarize) { toast('Summarising…'); const r = await api.summarize(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error); V = await api.story(S.storyId); paint(); return; }
  if (d.extract) { toast('Reading the chapter…'); const r = await api.extract(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error); V = await api.story(S.storyId); paint();
    toast(`${r.added ?? 0} proposed.`); return; }
  if (d.remember) {
    toast('Reading it for what it did to the people in it…');
    const r = await api.remember(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint();
    // `remembered: 0` is a real answer and not a failure: nobody in the chapter changed, or the
    // cast is empty. Saying "0 proposed" beats a silence that reads as a button that did nothing.
    return toast(`${r.remembered ?? 0} proposed — nothing accepted yet.`);
  }
  if (d.decide) {
    // The route branches on `accept`, not on a verb. Sending `decision: 'accept'` left
    // c.body.accept undefined, so Accept took the reject path and threw the fact away.
    // Read BEFORE the accept: the proposal is gone from the view once it lands, and the word for
    // what just happened depends on which kind it was. "Woven in" is the threads word.
    const was = (V.proposals ?? []).find((p) => p.id === d.id);
    // What is in the box, not what the model said — they are the same until the writer changes it.
    // Only sent on accept: the route ignores a body on reject, and sending one would say the
    // rejected wording mattered.
    // ponytail: an edit lives in the DOM until Accept, so a repaint mid-edit loses it — the same
    // hazard the composer's draft-keeping solves. Keep it in S if that ever bites.
    const edited = document.querySelector(`[data-pbody="${d.id}"]`)?.value;
    const r = await api.decide({ storyId: S.storyId, id: d.id, accept: d.decide === 'accept',
      ...(d.decide === 'accept' && edited != null ? { body: edited } : {}) });
    if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); refreshManifest();
    toast(d.decide !== 'accept' ? 'Dropped.'
      : was?.entryType === 'string' ? 'Tied. It is yours until you put it in play.' : 'Woven in.');
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
    S.spark = { story: r.story ?? {}, entries: r.entries ?? [], autoOpen: true,
      // What Anansi proposed, kept as it arrived. The server polices ONLY these names, so an edit
      // here must not rewrite them — a persona the writer types is theirs and is never dropped.
      proposed: [r.story?.persona, r.story?.lockedCharacter].filter(Boolean) };
    S.sparkStep = 1;
    if (S.prompts === null) loadPrompts();   // step 5 offers the writer's own voice
    paint();
    toast(`${(r.entries ?? []).length} in the cast. Nothing written yet.`);
    return;
  }
  if (d.dropSpark) { S.spark = null; S.sparkStep = 1; paint(); return; }
  // Every move harvests first: a step that is not rendered is not in the DOM, so an edit on the
  // step being left would be lost the moment it stops being drawn.
  if (d.sparkstep) { harvestSpark(); S.sparkStep = Number(d.sparkstep); paint(); return; }
  if (d.spadd) {
    harvestSpark();
    S.spark.entries.push({ title: '', body: '', entryType: 'character',
      activation: 'always_on', keys: [], keep: true });
    paint();
    document.querySelector(`[data-spname="${S.spark.entries.length - 1}"]`)?.focus();
    return;
  }
  if (d.spvoice) {
    harvestSpark();
    const v = S.prompts?.voice;
    if (!v) return toast('Still reading your voice.');
    S.spark.story.writingStyle = d.spvoice === 'mine' ? (v.inUse ?? v.shipped) : v.shipped;
    paint();
    toast(d.spvoice === 'mine' ? 'Your voice.' : 'The shipped voice.');
    return;
  }
  if (d.acceptSpark) {
    // From STATE, not from the DOM: accept is available on every step, so most of these fields are
    // not on screen when it is pressed. harvestSpark folds in whatever is.
    harvestSpark();
    const openBox = document.querySelector('[data-sp-open]');
    if (openBox) S.spark.autoOpen = openBox.checked;
    const s = S.spark.story;
    // sparkCast already drops the nameless — one rule, one place. It was filtered here too, and a
    // check that a blank card never reaches the ledger stayed green with either filter deleted,
    // which is a check proving nothing.
    const keep = sparkCast().map(({ keep: _k, ...e }) => e);
    const r = await api.createStory({
      title: s.title || 'Untitled', genre: s.genre, premise: s.premise,
      setting: s.setting, pov: s.pov, spice: Number(s.spice) || 2,
      writingStyle: s.writingStyle, direction: s.direction,
      persona: s.persona || null, lockedCharacter: s.lockedCharacter || null,
      // Only what Anansi proposed is policed server-side. A name typed here is never dropped.
      proposedCast: S.spark.proposed ?? [],
      entries: keep,
    });
    if (r.error) return toast(r.error);
    // auto_open defaults on in the column, so this is only ever a call to turn it OFF.
    if (S.spark.autoOpen === false) await api.saveStory(r.id, { autoOpen: false });
    const wantOpen = S.spark.autoOpen !== false;
    const dropped = r.droppedCast ?? [];
    S.spark = null; S.sparkStep = 1;
    await loadLibrary();
    await openStory(r.id);
    if (wantOpen) OPEN_WANTED = r.id;
    toast(dropped.length
      ? `Created. ${dropped.join(' and ')} was not in the cast, so it was left unset.`
      : `Created with ${keep.length} threads.`);
    if (wantOpen) await openingPassage();
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

$('scrim').addEventListener('click', () => {
  // The tray is what is on top of the scrim, so it is what a tap on the scrim shuts.
  if (root.dataset.tray === '1') return openTray(null);
  S.rail = false; paint();
});
$('side').addEventListener('click', (e) => { if (phone() && e.target === $('side')) { S.panel = null; paint(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.bigInput) { S.bigInput = false; drawDock(); $('input')?.focus(); return; }
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

// A cover, shrunk before it is sent. 900px wide is what the hero card can use; anything larger is
// bytes in a database that back up every night for no visible gain. `createImageBitmap` decodes off
// the main thread and needs no <img> in the document to do it.
async function readCover(f) {
  if (!f) return;
  // Before the decode, not after it: a camera original spends its time here, and a toast that
  // says "shrinking" once the shrinking is done reports the past.
  toast('Shrinking the cover…');
  let bmp;
  try { bmp = await createImageBitmap(f); }
  catch { return toast('could not read that image'); }
  // Fitted into a box, not scaled by width alone: a tall panorama at 900px wide is still millions
  // of pixels, and it would come out the far side of the route's 1MB ceiling with nothing the
  // writer could do about it. Never enlarged — the 1 in the min is what stops a small image being
  // blown up into a soft one.
  // Portrait, since the cards and the chapter backdrop both became 3:4 on 2026-08-27 — the long
  // edge is now the tall one, and 900 across was cut for a banner. 1100 x 1600 lands near 220KB at
  // 0.82, well under the route's 1MB ceiling and sharp on a desk-width backdrop.
  const k = Math.min(1, 1100 / bmp.width, 1600 / bmp.height);
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  // JPEG and not PNG: a photograph as PNG is several megabytes, and the route only accepts JPEG
  // for that reason. 0.82 is where a 900px cover lands around 150KB.
  const r = await api.setCover(S.storyId, c.toDataURL('image/jpeg', 0.82));
  if (r.error) return toast(r.error);
  V = r; await loadLibrary(); paint();
  toast('Cover set.');
}

document.addEventListener('change', (e) => {
  if (e.target.dataset?.cover) return void readCover(e.target.files?.[0]);
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
  // Shut the door behind you. Left open, the next tap anywhere in that paragraph starts editing
  // again with no Edit pressed, which is the bug this half fixes.
  e.target.removeAttribute('contenteditable');
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
