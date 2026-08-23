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
  root.dataset.theme = look.theme; root.dataset.font = look.font; root.dataset.size = look.size;
  try { localStorage.setItem(LOOK, JSON.stringify(look)); } catch { /* no storage */ }
}

// ---------- state ----------
const S = {
  place: 'workspace', wpage: 'stories', panel: null, mode: 'cowrite',
  rail: !overlay(), storyId: null, busy: false, pending: null, appearance: false, query: '',
};
let LIB = [], V = null, MANI = null, ACT = null, HITS = null;
// model, slot, gen and budget ride along on /api/stories and /api/story — there is no
// separate status route, and activity returns only generation rows.
let SRV = { model: null, slot: null, gen: {} };

const SNAV = [
  ['inspector', '◈', 'Context'], ['cast', '☙', 'Characters'],
  ['story', '⚙', 'Story & chapter'], ['traj', '→', 'Trajectory'],
  ['queue', '⚖', 'What the chapter added'], ['branches', '⑂', 'Branches'],
  ['search', '⌕', 'Search'], ['teller', '◐', 'Storyteller'],
];
const WNAV = [
  ['stories', '❋', 'My stories'], ['create', '✎', 'Create a story'],
  ['canon', '◈', 'Worlds & lorebooks'], ['import', '↧', 'Import'], ['prefs', '◐', 'Preferences'],
];
const TITLES = Object.fromEntries(SNAV.map(([k, , l]) => [k, l]));
const WTITLES = {
  stories: () => [`My stories`, `${LIB.length} ${LIB.length === 1 ? 'story' : 'stories'}`],
  create: () => ['Create a story', 'Spark a skeleton, or start blank'],
  canon: () => ['Worlds & lorebooks', V ? `${V.entries.length} entries` : 'Open a story first'],
  import: () => ['Import', 'Character cards, Anansi exports, AI Dungeon'],
  prefs: () => ['Preferences', 'llama-server, model, slot'],
};

let toastT = null;
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
      <button data-rail="1" style="margin-left:auto; color:#78726A; font-size:15px" aria-label="Collapse"
        >${overlay() ? '✕' : (S.rail ? '⟨' : '⟩')}</button>
    </div>
    ${back}
    <div class="scroll" style="padding:0 16px; display:flex; flex-direction:column">${rows.map(item).join('')}${tail}</div>
    <div style="margin-top:auto; padding:14px 20px; border-top:1px solid var(--line); display:flex;
      align-items:center; gap:12px; white-space:nowrap; overflow:hidden">
      <span style="width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${SRV.slot ? '#7FB083' : '#C99356'}"></span>
      <span class="txt" style="display:flex; flex-direction:column; gap:2px">
        <span style="font-size:13px; color:#EAE3D6">${esc(SRV.model || 'no model')}</span>
        <span style="font-size:11px; color:#6E6961">${SRV.slot
          ? `slot ${SRV.slot.perSlot.toLocaleString()}` : 'llama-server asleep'}</span>
      </span></div>`;
}

// ---------- header ----------
function drawBar() {
  const inStory = S.place === 'story' && V;
  const pct = MANI ? Math.round(MANI.totals.used / MANI.totals.budget * 100) : null;
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
      ${pct == null ? '' : `<button class="pill deskonly" data-panel="inspector">Context ${pct}%</button>`}
      <button class="pill" data-appearance="1" aria-pressed="${S.appearance}"
        style="font-family:'Instrument Serif',serif; font-size:15px; line-height:1; padding:7px 13px">Aa</button>
      <button class="pill deskonly" data-panel="inspector" aria-pressed="${S.panel === 'inspector'}">Inspector</button>
      <button class="phoneonly" data-panel="story" style="font-size:19px; color:var(--chrome-dim)" aria-label="Story settings">⚙</button>`
      : `<button class="pill" data-open="new">New story</button>
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
function passageHTML(p, pending) {
  if (p.isBreak) return `<div class="scenebreak"><i></i><span class="up" style="font-size:10px;
    color:var(--label); opacity:.8">${esc(p.body || 'Scene')}</span><i></i></div>`;
  const mine = p.author === 'human';
  const spoken = mine || p.speaker || isSpeech(p.body);
  const flags = (V.violations ?? []).filter((f) => f.passageId === p.id);
  const v = p.variants ?? [];
  const at = v.findIndex((x) => x.selected) + 1;
  const acts = pending ? '' : `<div class="acts">
    ${v.length > 1 ? `<span style="display:flex; align-items:center; gap:4px; padding:8px 6px; font-size:12px; color:#78726A">
      <button data-vp="${p.id}">‹</button>${at}/${v.length}<button data-vn="${p.id}">›</button></span>` : ''}
    <button data-re="${p.id}"><span class="serif" style="color:#D9B26A">↻</span>Regenerate</button>
    <button data-ed="${p.id}"><span class="serif" style="color:#D9B26A">✎</span>Edit</button>
    <button data-hi="${p.id}"><span class="serif" style="color:#D9B26A">⌂</span>History</button>
    <button data-del="${p.id}" style="color:#C8705A">Delete</button></div>`;
  const body = spoken
    ? `<div class="who">${mine ? `You · ${esc(V.story.persona || 'you')}` : esc(p.speaker || V.story.title)}</div>
       <div class="said" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>`
    : `<div class="narr" contenteditable="plaintext-only" data-edit="${p.id}">${esc(p.body)}</div>`;
  const flagged = flags.map((f) => {
    const e = V.entries.find((x) => x.id === f.entryId);
    return `<button class="flag" data-flag="${f.id}" title="Dismiss">
      <span style="width:5px; height:5px; border-radius:50%; background:#C8705A; flex:0 0 auto"></span>
      Contradiction · ${esc(e?.title ?? 'canon')}${f.reason ? ` — ${esc(f.reason)}` : ''}</button>`;
  }).join('');
  const cls = `block${pending ? ' pending' : mine ? ' you' : spoken ? ' speak' : ''}`;
  return `<div class="${cls}">${body}${acts}${flagged}</div>`;
}

function drawDoc() {
  const read = $('read'), col = $('col');
  const tip = read.scrollHeight - read.scrollTop - read.clientHeight < 140;
  const byChapter = new Map(V.chapters.map((c) => [c.id, []]));
  for (const p of V.passages) (byChapter.get(p.chapterId) ?? byChapter.set(p.chapterId, []).get(p.chapterId)).push(p);
  let html = '';
  for (const c of V.chapters) {
    const ps = byChapter.get(c.id) ?? [];
    if (!ps.length && c.id !== V.currentChapter.id) continue;
    const w = ps.reduce((n, p) => n + (String(p.body).match(/\S+/g) || []).length, 0);
    html += `<div style="display:flex; align-items:baseline; gap:12px; font-size:10.5px;
      letter-spacing:.28em; text-transform:uppercase; color:var(--label)">
      <span>${esc(c.title || `Chapter ${c.index}`)}</span>
      <span style="margin-left:auto; letter-spacing:.1em; text-transform:none; opacity:.7">${w.toLocaleString()} words</span></div>`;
    html += ps.map((p) => passageHTML(p, false)).join('');
  }
  if (S.pending) html += passageHTML({ ...S.pending, id: 'pending' }, true);
  col.innerHTML = html || `<div class="narr" style="opacity:.6">Nothing written yet. The composer is below.</div>`;
  if (tip) read.scrollTop = read.scrollHeight;
}

function drawDock() {
  if (!(S.place === 'story' && V)) { $('dock').hidden = true; return; }
  $('dock').hidden = false;
  const [, , placeholder] = MODES.find((m) => m[0] === S.mode) ?? MODES[0];
  const take = S.pending
    ? `<span class="act" data-take="discard">Discard</span>
       <span class="act" data-take="regen">Regenerate</span>
       <span class="act keep" data-take="keep">Keep</span>`
    : `<span class="act" style="opacity:.45">Discard</span>
       <span class="act" style="opacity:.45">Regenerate</span>
       <span class="act" style="opacity:.45">Keep</span>`;
  $('dockCol').innerHTML = `
    <div id="modes">${MODES.map(([k, label]) => `<button data-mode="${k}" aria-pressed="${k === S.mode}">${label}</button>`).join('')}
      <span class="deskonly up" style="margin-left:auto; font-size:10.5px; letter-spacing:.16em;
        color:var(--label); opacity:.6; white-space:nowrap">${
        ACT?.last ? `Telling · ${ACT.last}` : 'Telling'}</span></div>
    <div id="inputRow">
      <textarea id="input" rows="1" placeholder="${esc(placeholder(V.story.persona))}"></textarea>
      <span class="deskonly" style="font-size:10.5px; color:var(--label); opacity:.55; padding-bottom:3px">⌘↵</span>
      <button id="send" ${S.busy ? 'disabled' : ''} aria-label="Send">${S.busy ? '…' : '↑'}</button>
    </div>
    <div id="takeRow">
      <span style="font-size:11px; color:var(--label); opacity:.7; white-space:nowrap">${
        S.busy ? 'Telling…' : S.pending ? 'A take is waiting' : ACT?.last ? `Last take · ${ACT.last}` : 'Ready'}</span>
      <span style="margin-left:auto; display:flex; align-items:center; gap:20px">${take}</span>
    </div>`;
  const ta = $('input');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); }
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
  inspector() {
    if (!MANI) return `<div class="hint">Open the composer once and the manifest appears here.</div>`;
    const inc = MANI.blocks.filter((b) => b.state === 'included');
    const agg = {};
    for (const b of inc) agg[b.kind] = (agg[b.kind] ?? 0) + b.tokens;
    const budget = MANI.totals.budget || 1;
    return `<div style="display:flex; flex-direction:column; gap:2px">
      <div style="display:flex; align-items:baseline; gap:10px; font-size:12.5px; color:#8A8478">
        <span>Assembled for the next call</span>
        <span class="tnum" style="margin-left:auto; color:#78726A">${MANI.totals.used.toLocaleString()} / ${budget.toLocaleString()}</span></div>
      <div class="meter">${Object.entries(agg).map(([k, v]) =>
        `<i style="width:${(v / budget * 100).toFixed(2)}%; background:${BLOCK_COLOR[k] ?? '#635E56'}"></i>`).join('')}</div>
      ${Object.entries(agg).map(([k, v]) => {
        const why = inc.filter((b) => b.kind === k).map((b) => b.firedBy?.join(', ') || b.reason).filter(Boolean)[0] ?? '';
        return `<div class="row">
          <span style="width:8px; height:8px; border-radius:2px; flex:0 0 auto; background:${BLOCK_COLOR[k] ?? '#635E56'}"></span>
          <span style="color:#EAE3D6">${esc(k)}</span>
          <span style="color:#D9B26A; font-size:11.5px">${esc(why)}</span>
          <span class="tnum" style="margin-left:auto; color:#78726A">${v.toLocaleString()}</span></div>`;
      }).join('')}
      ${MANI.blocks.filter((b) => b.state !== 'included').map((b) => `<div class="row" style="opacity:.55">
        <span style="width:8px; height:8px; border-radius:2px; flex:0 0 auto; background:#3A372F"></span>
        <span style="color:#8A8478">${esc(b.kind)}</span>
        <span style="color:#C8705A; font-size:11.5px">${esc(b.reason ?? 'omitted')}</span></div>`).join('')}
      <div class="hint" style="margin-top:14px">Canon is capped at 45% of the slot, earlier chapters at 25%,
        recent prose at 60%. The tail is never evicted.</div></div>`;
  },

  cast() {
    const cast = V.entries.filter((e) => e.entryType === 'character');
    return `<div style="display:flex; flex-direction:column; gap:9px">
      ${cast.map((e) => entryCard(e)).join('') || '<div class="hint">No characters yet.</div>'}
      <button class="btn ghost" data-newentry="character" style="margin-top:8px">New character</button></div>`;
  },

  story() {
    const fields = STORY_FIELDS.filter((f) => f.k !== 'direction');
    return `<div style="display:flex; flex-direction:column">
      ${fields.map((f) => `<label class="lbl">${f.label}</label>
        ${f.area ? `<textarea class="field" data-story="${f.k}">${esc(V.story[f.k] ?? '')}</textarea>`
                 : `<input class="field" data-story="${f.k}" value="${esc(V.story[f.k] ?? '')}">`}
        ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}`).join('')}
      <label class="lbl">Spice</label>
      <select class="field" data-story="spice">${SPICE.map((l, i) =>
        `<option value="${i + 1}" ${Number(V.story.spice) === i + 1 ? 'selected' : ''}>${i + 1} · ${l}</option>`).join('')}</select>
      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">${esc(V.currentChapter.title || `Chapter ${V.currentChapter.index}`)}</div>
      <input class="field" data-chapter-title="1" value="${esc(V.currentChapter.title ?? '')}">
      <label class="lbl">This chapter must end with</label>
      <textarea class="field" data-chapter-note="1">${esc(V.currentChapter.authorsNote ?? '')}</textarea>
      <button class="btn" data-savestory="1" style="margin-top:16px">Save</button>
      <button class="btn ghost" data-endchapter="1" style="margin-top:10px">End chapter here</button></div>`;
  },

  traj() {
    return `<div style="display:flex; flex-direction:column">
      <label class="lbl">Where this is going</label>
      <textarea class="field serif" data-story="direction" style="font-style:italic; font-size:15.5px;
        min-height:110px; line-height:1.6">${esc(V.story.direction ?? '')}</textarea>
      <div class="hint">Aims the story without disclosing it. Never restated to the reader.</div>
      <button class="btn" data-savestory="1" style="margin-top:14px">Save</button>
      <div class="lbl" style="letter-spacing:.26em; margin-top:22px">Chapter summaries in context</div>
      ${V.chapters.filter((c) => c.summary).map((c) => `<div class="card" style="margin-bottom:8px">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(c.title || `Chapter ${c.index}`)}</span>
          <span style="margin-left:auto; font-size:11px; color:#78726A">covers to ${c.coversThrough ?? '—'}</span></div>
        <div style="font-size:12.5px; line-height:1.5; color:#8A8478">${esc(c.summary)}</div>
        ${c.summaryStale ? '<div class="hint" style="color:#C8705A">Stale — excluded from the prompt until it is re-run.</div>' : ''}
      </div>`).join('') || '<div class="hint">No summaries yet. Closing a chapter writes one.</div>'}
      <button class="btn ghost" data-summarize="1">Summarise this chapter</button></div>`;
  },

  queue() {
    const ps = V.proposals ?? [];
    return `<div style="display:flex; flex-direction:column; gap:9px">
      <div style="font-size:12.5px; line-height:1.55; color:#8A8478">Nothing here is canon until you accept it.</div>
      ${ps.map((p) => {
        const tone = p.kind === 'new' ? '#7FB083' : p.kind === 'conflict' ? '#C8705A' : '#C99356';
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
      }).join('') || '<div class="hint">Nothing proposed. Closing a chapter reads it for new facts.</div>'}
      <button class="btn ghost" data-extract="1" style="margin-top:6px">Read this chapter for facts</button></div>`;
  },

  branches() {
    return `<div style="display:flex; flex-direction:column; gap:9px">
      ${(V.branches ?? []).map((b) => `<div class="card" style="gap:6px;
        border-color:${b.active ? 'rgba(217,178,106,.34)' : '#2A2721'}">
        <div style="display:flex; align-items:center; gap:9px">
          <span class="kind">${esc(b.name)}${b.active ? ' · active' : ''}${b.isPrimary ? ' · main' : ''}</span>
          <span style="margin-left:auto; font-size:11px; color:#78726A">${
            b.forkOrdinal ? `from passage ${b.forkOrdinal}` : ''}</span></div>
        ${b.active ? '' : `<button data-branch="${b.id}" class="btn ghost" style="margin-top:4px">Switch to this branch</button>`}</div>`).join('')}
      <div class="hint">Branch rows are real and every read follows the active branch. Forking from a
        passage is on the passage's own menu.</div></div>`;
  },

  search() {
    return `<div style="display:flex; flex-direction:column">
      <input class="field" id="q" value="${esc(S.query)}" placeholder="Search your prose">
      <div class="hint" style="margin-bottom:14px">A LIKE scan over prose, entries and summaries. Fine at this size.</div>
      ${(HITS ?? []).map((r) => `<button data-hit="${esc(r.storyId ?? '')}" style="display:flex;
        flex-direction:column; gap:5px; padding:11px 0; border-bottom:1px solid rgba(255,255,255,.04); width:100%">
        <span style="display:flex; align-items:center; gap:10px; width:100%">
          <span class="kind" style="font-size:9.5px">${esc(r.kind ?? 'Prose')}</span>
          <span style="margin-left:auto; font-size:11px; color:#6E6961">${esc(r.where ?? '')}</span></span>
        <span style="font-size:13.5px; line-height:1.5; color:#EAE3D6">${esc(r.body ?? r.snippet ?? '')}</span></button>`).join('')}
      ${HITS && !HITS.length ? '<div class="hint">Nothing matched.</div>' : ''}</div>`;
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
      <div style="font-size:12.5px; line-height:1.55; color:#8A8478">These belong to this story. Change them
        mid-chapter and only what comes next is affected.</div>
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

const ART = [
  'radial-gradient(70% 90% at 25% 20%, rgba(150,105,195,.55), transparent 70%), linear-gradient(140deg,#221B2E,#0F0D14)',
  'radial-gradient(70% 90% at 30% 30%, rgba(70,150,160,.5), transparent 70%), linear-gradient(140deg,#101E22,#0B0D0F)',
  'radial-gradient(70% 90% at 20% 25%, rgba(170,60,70,.45), transparent 70%), linear-gradient(140deg,#20141A,#0C0A0C)',
];

const WPAGES = {
  stories() {
    return `<div class="grid">${LIB.map((s, i) => `
      <button class="storycard" data-open="${s.id}">
        <span class="art" style="display:block; background:${ART[i % ART.length]}">
          <span class="fade"></span>
          <span class="tag" style="position:absolute; top:12px; left:14px; background:rgba(10,9,12,.6)">${esc(s.status ?? 'in_progress')}</span>
          <span class="serif" style="position:absolute; bottom:12px; left:16px; right:16px; font-size:23px;
            line-height:1.1; color:#F3ECE0">${esc(s.title)}</span></span>
        <span style="display:block; padding:14px 16px 16px">
          <span style="display:block; font-size:12.5px; line-height:1.5; color:#8A8478; font-style:italic;
            min-height:19px">${esc((s.last ?? '').slice(0, 110))}</span>
          <span style="display:flex; align-items:center; gap:11px; margin-top:10px">
            <span style="flex:1; height:2px; background:#2A2721; border-radius:2px; overflow:hidden">
              <span style="display:block; width:${Math.min(100, (s.words ?? 0) / 800)}%; height:100%;
                background:linear-gradient(90deg,#8A6D2E,#E0C48C)"></span></span>
            <span style="font-size:11px; color:#78726A">${s.updatedAt ? ago(s.updatedAt) : ''}</span></span></span>
      </button>`).join('')}
      <button class="dashed" data-open="new">New story</button></div>`;
  },

  create() {
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
        ${['Title', 'Genre', 'Point of view', 'You are', 'Spice', 'Cast'].map((l) => `<div class="row">
          <span style="color:#EAE3D6">${l}</span>
          <span style="margin-left:auto; color:#78726A">—</span></div>`).join('')}
        <div class="hint" style="margin-top:4px">Nothing is written until you accept it.</div></div></div>`;
  },

  canon() {
    if (!V) return `<div class="hint">Open a story and its ledger appears here.</div>`;
    return `<div class="grid">${V.entries.map(entryCard).join('')}
      <button class="dashed" data-newentry="lore" style="min-height:120px">New entry</button></div>`;
  },

  import() {
    // ponytail: this page describes the importers in src/import.ts, which no client calls yet —
    // BUILD-STATE 3b records the two-importer conflict. Wiring it is deliberately not part of
    // the UI overhaul; the resolution is to make src/import.ts the engine first.
    return `<div style="display:flex; flex-direction:column; gap:22px; max-width:900px">
      <div class="grid">${[['❐', 'Character card', 'V1, V2 and V3 cards, PNG or JSON'],
        ['❋', 'Anansi export', 'A story that left as a standalone database'],
        ['↧', 'AI Dungeon', 'Adventures and world info']].map(([g, l, m]) => `
        <div style="border:1px solid var(--chip); border-radius:18px; padding:22px 20px;
          background:var(--rail); display:flex; flex-direction:column; gap:11px">
          <span class="serif" style="font-size:20px; color:#D9B26A">${g}</span>
          <span style="font-size:15px; color:#F3ECE0">${l}</span>
          <span style="font-size:12.5px; line-height:1.5; color:#8A8478">${m}</span></div>`).join('')}</div>
      <div class="dashed" style="min-height:0; padding:44px; flex-direction:column; gap:8px; text-align:center">
        <span class="serif" style="font-size:22px; color:#EAE3D6">Not wired yet</span>
        <span style="font-size:12.5px; color:#78726A">The parsers exist and are tested. The screen that
          feeds them is the next piece.</span></div></div>`;
  },

  prefs() {
    const slot = SRV.slot?.perSlot, global = SRV.slot?.global, slots = SRV.slot?.slots;
    return `<div class="split" style="max-width:1000px; gap:28px">
      <div style="flex:1; min-width:0">
        <div class="lbl">llama-server</div>
        <div class="field" style="font-family:ui-monospace,monospace">http://127.0.0.1:8080</div>
        <div style="display:flex; align-items:center; gap:9px; margin-top:10px">
          <span style="width:8px; height:8px; border-radius:50%; background:${slot ? '#7FB083' : '#C99356'}"></span>
          <span style="font-size:12px; color:#78726A">${slot ? 'Up' : 'Asleep or unreachable'}</span></div>
        <div class="lbl" style="letter-spacing:.26em; margin-top:26px">Model</div>
        <div class="row"><span style="color:#EAE3D6">Loaded</span>
          <span style="margin-left:auto; color:#78726A; font-family:ui-monospace,monospace">${esc(SRV.model ?? '—')}</span></div>
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
function paint() {
  applyLook();
  root.dataset.rail = S.rail ? 'open' : 'closed';
  drawRail(); drawBar(); drawAppearance(); drawPage(); drawSide();
  if (S.place === 'story' && V) { drawDoc(); drawDock(); } else { $('dock').hidden = true; }
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
  if (!S.panel && !overlay()) S.panel = 'inspector';
  const a = await api.activity(id);
  ACT = a.error ? null : a;
  paint();
  refreshManifest();
}

async function refreshManifest() {
  if (!V) return;
  const r = await api.manifest({ storyId: S.storyId, mode: S.mode, directive: $('input')?.value || undefined });
  if (!r.error) { MANI = r.manifest; drawBar(); if (S.panel === 'inspector') drawSide(); }
}

async function generate() {
  if (S.busy || !V) return;
  const directive = $('input')?.value.trim() ?? '';
  if (S.mode === 'cowrite' && directive) {
    const r = await api.write(S.storyId, { body: directive, author: 'human' });
    if (r.error) return toast(r.error);
    $('input').value = '';
    V = await api.story(S.storyId); paint(); return;
  }
  S.busy = true; drawDock();
  const r = await api.generate({ storyId: S.storyId, mode: S.mode, directive: directive || undefined });
  S.busy = false;
  if (r.error) { drawDock(); return toast(r.error); }
  MANI = r.manifest;
  S.pending = { body: r.prose, author: 'model', isBreak: false, speaker: null, variants: [] };
  ACT = { ...(ACT ?? {}), last: `${r.seconds}s` };
  paint();
}

async function keepTake() {
  if (!S.pending) return;
  const r = await api.accept(S.storyId, { body: S.pending.body, directive: $('input')?.value || undefined });
  if (r.error) return toast(r.error);
  S.pending = null; $('input') && ($('input').value = '');
  V = await api.story(S.storyId);
  paint(); refreshManifest();
}

// ---------- one delegated listener ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-nav],[data-rail],[data-leave],[data-open],[data-chapter],[data-panel],'
    + '[data-appearance],[data-theme],[data-fontpick],[data-sizepick],[data-mode],[data-take],[data-re],'
    + '[data-del],[data-ed],[data-hi],[data-vp],[data-vn],[data-flag],[data-savestory],[data-endchapter],'
    + '[data-summarize],[data-extract],[data-decide],[data-branch],[data-newentry],[data-entry],'
    + '[data-spark],[data-blank],[data-backup],[data-savegen],[data-hit]');
  if (!t) { if (S.appearance && !e.target.closest('#appearance')) { S.appearance = false; drawAppearance(); drawBar(); } return; }
  const d = t.dataset;

  if (d.rail !== undefined) { S.rail = !S.rail; paint(); return; }
  if (d.nav) { if (S.place === 'story') S.panel = d.nav; else S.wpage = d.nav;
    if (overlay()) S.rail = false; paint(); if (d.nav === 'search') $('q')?.focus(); return; }
  if (d.leave) { S.place = 'workspace'; S.wpage = 'stories'; S.panel = null; await loadLibrary(); paint(); return; }
  if (d.panel !== undefined) { S.panel = d.panel || null; paint(); return; }
  if (d.appearance !== undefined) { S.appearance = d.appearance === '1' ? !S.appearance : false; drawAppearance(); drawBar(); return; }
  if (d.theme) { look.theme = d.theme; applyLook(); drawAppearance(); return; }
  if (d.fontpick) { look.font = d.fontpick; applyLook(); drawAppearance(); return; }
  if (d.sizepick) { look.size = d.sizepick; applyLook(); drawAppearance(); return; }

  if (d.open === 'new') { S.place = 'workspace'; S.wpage = 'create'; paint(); return; }
  if (d.open) { await openStory(d.open); return; }
  if (d.chapter) { const r = await api.story(S.storyId, d.chapter); if (!r.error) { V = r; paint(); } return; }

  if (d.mode) { S.mode = d.mode; drawDock(); refreshManifest(); return; }
  if (d.take === 'discard') { S.pending = null; paint(); return; }
  if (d.take === 'regen') { S.pending = null; generate(); return; }
  if (d.take === 'keep') { await keepTake(); return; }

  if (d.re) { S.pending = null; const r = await api.generate({ storyId: S.storyId, mode: S.mode, regenerateOf: d.re });
    if (r.error) return toast(r.error);
    const a = await api.accept(S.storyId, { body: r.prose, variantOf: d.re });
    if (a.error) return toast(a.error);
    V = await api.story(S.storyId); paint(); return; }
  if (d.del) { const r = await api.delPassage(S.storyId, d.del); if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); return; }
  if (d.vp || d.vn) { const p = V.passages.find((x) => x.id === (d.vp || d.vn)); const v = p?.variants ?? [];
    const at = v.findIndex((x) => x.selected); const next = v[at + (d.vn ? 1 : -1)];
    if (next) { await api.pickVariant(S.storyId, next.id); V = await api.story(S.storyId); paint(); } return; }
  if (d.flag) { await api.dismissFlag(S.storyId, d.flag); V = await api.story(S.storyId); paint(); return; }

  if (d.savestory) {
    const patch = {};
    document.querySelectorAll('[data-story]').forEach((el) => { patch[el.dataset.story] = el.value; });
    const r = await api.saveStory(S.storyId, patch);
    if (r.error) return toast(r.error);
    const ct = document.querySelector('[data-chapter-title]'), cn = document.querySelector('[data-chapter-note]');
    if (ct) await api.saveChapter(S.storyId, V.currentChapter.id, { title: ct.value, authorsNote: cn?.value ?? '' });
    V = await api.story(S.storyId); paint(); toast('Saved.'); refreshManifest(); return;
  }
  if (d.endchapter) { const r = await api.endChapter(S.storyId, {}); if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); toast('Chapter closed.'); return; }
  if (d.summarize) { toast('Summarising…'); const r = await api.summarize(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error); V = await api.story(S.storyId); paint(); return; }
  if (d.extract) { toast('Reading the chapter…'); const r = await api.extract(S.storyId, V.currentChapter.id);
    if (r.error) return toast(r.error); V = await api.story(S.storyId); paint();
    toast(`${r.added ?? 0} proposed.`); return; }
  if (d.decide) { await api.decide({ storyId: S.storyId, id: d.id, decision: d.decide });
    V = await api.story(S.storyId); paint(); return; }
  if (d.branch) { const r = await api.switchBranch(S.storyId, d.branch); if (r.error) return toast(r.error);
    V = await api.story(S.storyId); paint(); return; }

  if (d.spark) { const idea = $('idea')?.value.trim(); if (!idea) return toast('Give him a thread first.');
    toast('Spinning…'); const r = await api.spark(idea); if (r.error) return toast(r.error);
    await loadLibrary(); if (r.storyId) await openStory(r.storyId); else paint(); return; }
  if (d.blank) { const r = await api.createStory({ title: 'Untitled' }); if (r.error) return toast(r.error);
    await loadLibrary(); await openStory(r.id ?? r.storyId); return; }
  if (d.backup) { const r = await api.backup(S.storyId ?? LIB[0]?.id); toast(r.error ?? 'Snapshot written.'); return; }
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
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { S.query = e.target.value; clearTimeout(toastT);
    setTimeout(async () => { const r = await api.search(S.query); if (!r.error) { HITS = r.results ?? []; drawSide(); } }, 220); }
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
}, true);
matchMedia('(max-width:1099px)').addEventListener('change', () => { S.rail = !overlay(); paint(); });

// ---------- boot ----------
(async () => {
  applyLook();
  await loadLibrary();
  const hash = location.hash.slice(1);
  if (hash && LIB.some((s) => s.id === hash)) await openStory(hash);
  else paint();
})();
