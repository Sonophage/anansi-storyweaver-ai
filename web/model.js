// One description of the editable shape. Written when there were two surfaces; app.html is the
// only consumer since desk and phone were deleted on 2026-08-23. It stays a separate module
// because it is data, not behaviour — the field list, the mode labels, the block colours.
// Continue is not in here: it is a button, not a mode. It sends immediately with nothing typed,
// so it has no placeholder and no selected state to hold.
//
// The four that are left differ in what happens to what you type. Speak, Act and Narrate put it
// on the page as yours and the model answers it. Direct never puts it on the page at all — it is
// an instruction. That difference is the one people get wrong, so the placeholders say it.
export const MODES = [
  ['speak',   'Speak',   (p) => `Say it as ${p || 'yourself'}…`],
  ['act',     'Act',     (p) => `What ${p || 'you'} do…`],
  ['direct',  'Direct',  () => 'Tell Anansi what happens next…'],
  ['narrate', 'Narrate', () => 'Write it yourself. Anansi carries on from it…'],
];

export const KINDS = ['character', 'lore', 'item', 'rule'];

// The labels on the dropdown. They name where the camera stops, because that is what the level
// IS — the lines these stand for are in src/context.ts and they say the same thing at length.
export const SPICE = [
  'nothing sexual — ends at the kiss', 'desire, not sex — stops at the door',
  'on the page, in the book\u2019s voice', 'direct, and the acts named', 'fully explicit',
];

export const STORY_FIELDS = [
  { k: 'title',        label: 'Title' },
  { k: 'genre',        label: 'Genre' },
  { k: 'premise',      label: 'Premise', area: true },
  { k: 'setting',      label: 'Setting' },
  { k: 'pov',          label: 'Point of view' },
  { k: 'persona',      label: 'You are', hint: 'The character you speak as in Speak mode.' },
  { k: 'writingStyle', label: 'Voice of the weave', area: true,
    hint: 'Paste a few hundred words of your own prose. A sample beats a description of one.' },
  { k: 'direction',    label: 'Where this is going', area: true,
    hint: 'Aims the story without disclosing it. Never restated to the reader.' },
  { k: 'stripPatterns', label: 'Strip from output', hint: 'One regex per line. Local models leak scaffolding.' },
];

export const isSpeech = (t) => /^["“]/.test(String(t).trim());
export const ago = (t) => { const d = (Date.now() - t) / 864e5;
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${Math.floor(d)} days ago`; };
// Escapes quotes as well as tags: this is interpolated into value="..." attributes on both
// surfaces, so a character named  The "Bell"  used to truncate its own name field on edit.
export const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

// The router answers with two kinds of id and both read as machine noise on a page about a book:
// short aliases from presets.ini — write-nt-qwen36-h — and raw Hugging Face paths like
// HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF:32K, which is 64 characters of it.
//
// A transform rather than a lookup table, so a preset added tonight is named tonight without an
// edit here. `detail` carries what the name drops, and every surface keeps the raw id in a title
// attribute — the id is what you type into ANANSI_MODEL and what the router answers to.
//
// THINKING IS NEVER DROPPED. `t` versus `nt` is the difference between prose and 900 tokens of
// reasoning and no prose at all, so it is spelled out rather than left as a letter.
const FAMILY = { qwen36: 'Qwen3.6', qwen38: 'Qwen3.8', tcap27: 'ThinkingCap 27B', ornith: 'Ornith' };
const ROLE = { write: 'Write', rp: 'Roleplay', agentic: 'Agentic' };
export const modelName = (id) => {
  if (!id) return { name: 'no model', detail: '', id: '' };
  const alias = /^(write|rp|agentic)-(n?t)-([a-z0-9]+)-([a-z0-9]+)$/.exec(id);
  if (alias) {
    const [, role, think, family, tail] = alias;
    return { id, name: `${ROLE[role]} \u00b7 ${FAMILY[family] ?? family}`,
             detail: [think === 't' ? 'thinking' : 'no thinking',
                      tail === 'h' ? 'uncensored' : tail].join(' \u00b7 ') };
  }
  const [repo, quant] = id.split(':');
  const org = repo.includes('/') ? repo.split('/')[0].toLowerCase() : '';
  // The org name is often repeated inside the repo name as well, and once is enough.
  const name = (repo.split('/').pop() ?? repo).replace(/[-_]?GGUF$/i, '')
    .split(/[-_]+/).filter((w) => w.toLowerCase() !== org).join(' ');
  return { id, name, detail: quant ?? '' };
};

// Block colours are shared so the meter reads the same on both surfaces.
export const BLOCK_COLOR = {
  SPINE: '#D9B26A', 'CANON-ALWAYS': '#7FB083', 'CANON-TRIGGERED': '#9A8B62',
  STRING: '#B07C9E', EARLIER: '#8A7BA8', PROSE: '#6E8AA0', TAIL: '#5E7A8E',
  DIRECTIVE: '#C99356', MODE: '#635E56',
};

// Every Context row is a way back to the thing that made it, so the row is named for what that
// thing is called WHERE IT LIVES. The engine's kinds — SPINE, CANON-ALWAYS — named nothing you
// could find once you arrived: you clicked CANON-ALWAYS and landed on a panel that says Threads,
// and a row called VOICE opened a field called Voice of the weave. Label and destination sit on
// one line here so they cannot drift apart again. The kinds are still the engine's own words and
// still the ones in the prompt, the manifest and src/blocks.ts — this is the surface only.
export const BLOCK_ORIGIN = {
  SPINE:             ['Premise & setting',       'story'],
  VOICE:             ['Voice of the weave',      'story'],
  'CANON-ALWAYS':    ['Threads, always on',      'canon'],
  'CANON-TRIGGERED': ['Threads, on a keyword',   'canon'],
  STRING:            ['Strings you summoned',    'strings'],
  EARLIER:           ['Summaries in context',    'traj'],
  PROSE:             ['The prose above',         'doc'],
  DIRECTIVE:         ['Point of view & register', 'story'],
  TAIL:              ['Where you left off',      'doc'],
  MODE:              ['The mode you picked',     'doc'],
};

// The decode, ported from the bureau's own effect (astro-bureau-blog, the last script in
// src/layouts/Base.astro): text resolves out of random glyphs rather than fading in. The glyph
// set and the writing head live here because they are pure, which makes them the half worth a test.
export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>*';
export const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The writing head of a streamed passage: ONE run of glyphs, and it never touches the prose.
 *
 *  The first version scrambled the last sixteen characters of the text itself, re-rolled on every
 *  delta. Two things were wrong with it. The prose moved after it had settled, which is the last
 *  thing prose should do; and a delta is a token, so the effect ran at whatever rate the model
 *  happened to be writing — bursty, uneven, and clunky exactly when the model sped up.
 *
 *  A run appended AFTER the text has neither problem. What is written stays written, and the run
 *  is animated on its own clock, so the model's token rate has nothing to do with how it looks.
 */
export const HEAD = 9;
export const glyphRun = (n = HEAD) => Array.from({ length: n }, glyph).join('');

// ---------------------------------------------------------------------------
// THEMES. One row per theme, and every token below is derived from it.
//
// Straight from the design's own theme() function, and the reason it is a table rather than nine
// blocks of CSS is written into that design: "a new theme cannot ship half-applied — which is how
// the rail and the panel stayed near-black on Parchment while the document turned to paper." The
// app had exactly that shape before this: three hand-written blocks, and the light one had to
// restate the greys and the gold by hand or render dark text on light ground.
// ---------------------------------------------------------------------------
export const THEMES = {
  obsidian:  { label: 'Obsidian',  dark: 1, swatch: '#0A0A0C', ink: '#EAE3D6', paper: '#0A0A0C', rail: '#0C0C0E', sheet: '#100F12',
               accent: '#D9B26A', warn: '#C8705A', good: '#7FB083', speak: 'rgba(180,150,220,.5)',
               wash: 'radial-gradient(50% 40% at 25% 0%, rgba(150,105,195,.22), transparent 70%), linear-gradient(180deg,#131019,#09090B 45%)' },
  ink:       { label: 'Ink',       dark: 1, swatch: '#0B0B0C', ink: '#E4E0D8', paper: '#0B0B0C', rail: '#0C0C0D', sheet: '#101012',
               accent: '#D9B26A', warn: '#C8705A', good: '#7FB083', speak: 'rgba(190,185,175,.34)',
               wash: 'linear-gradient(180deg,#0E0E10,#08080A 60%)' },
  parchment: { label: 'Parchment', dark: 0, swatch: '#EFE7D8', ink: '#2E2A24', paper: '#EFE7D8', rail: '#E6DCC8', sheet: '#F3EDE1',
               accent: '#6B5220', warn: '#8C3F28', good: '#3F6B47', speak: 'rgba(110,80,140,.5)',
               wash: 'radial-gradient(60% 40% at 25% 0%, rgba(150,105,195,.07), transparent 70%), linear-gradient(180deg,#F3EDE1,#EAE1D0 60%)' },
  cyberpunk: { label: 'Cyberpunk', dark: 1, swatch: '#07090E', ink: '#DFEBF2', paper: '#07090E', rail: '#080B11', sheet: '#0B1018',
               accent: '#54D8CF', warn: '#E0568C', good: '#54D8CF', speak: 'rgba(224,86,140,.42)',
               wash: 'radial-gradient(60% 45% at 80% 0%, rgba(224,86,140,.18), transparent 68%), radial-gradient(50% 40% at 10% 10%, rgba(84,216,207,.14), transparent 70%), linear-gradient(180deg,#0A1018,#06080C 55%)' },
  fantasy:   { label: 'Fantasy',   dark: 1, swatch: '#0A0D0B', ink: '#E7E2D2', paper: '#0A0D0B', rail: '#0B0F0C', sheet: '#0F1411',
               accent: '#C8A961', warn: '#B4693F', good: '#7FA86B', speak: 'rgba(140,175,130,.42)',
               wash: 'radial-gradient(55% 42% at 22% 0%, rgba(110,150,105,.18), transparent 70%), linear-gradient(180deg,#101710,#080B09 50%)' },
  grimdark:  { label: 'Grimdark',  dark: 1, swatch: '#0C0C0C', ink: '#D2CFCA', paper: '#0C0C0C', rail: '#0B0B0B', sheet: '#111111',
               accent: '#A8674F', warn: '#9E4632', good: '#6E8069', speak: 'rgba(160,150,145,.3)',
               wash: 'linear-gradient(180deg,#121211,#090909 65%)' },
  novelist:  { label: 'Novelist',  dark: 0, swatch: '#F6F3EC', ink: '#22201D', paper: '#F6F3EC', rail: '#EDE9DF', sheet: '#FBF9F3',
               accent: '#8C2F22', warn: '#8C2F22', good: '#3C6B45', speak: 'rgba(60,58,54,.3)',
               wash: 'linear-gradient(180deg,#FBF9F3,#F1EDE4 70%)' },
  scifi:     { label: 'Sci-fi',    dark: 1, swatch: '#08090C', ink: '#DCE4EC', paper: '#08090C', rail: '#090B0F', sheet: '#0D1015',
               accent: '#8FB8D9', warn: '#D98A6A', good: '#7FB8A8', speak: 'rgba(143,184,217,.36)',
               wash: 'radial-gradient(60% 40% at 50% 0%, rgba(143,184,217,.13), transparent 72%), linear-gradient(180deg,#0C1016,#07080B 55%)' },
  romance:   { label: 'Romance',   dark: 1, swatch: '#140E13', ink: '#F0E2E4', paper: '#140E13', rail: '#160F15', sheet: '#1B131A',
               accent: '#D98AA0', warn: '#C4667C', good: '#8FB89C', speak: 'rgba(217,138,160,.4)',
               wash: 'radial-gradient(60% 45% at 28% 0%, rgba(190,110,140,.22), transparent 70%), linear-gradient(180deg,#1D1420,#100B10 55%)' },
};

/** Blend two hex colours. The design's own mix(), unchanged. */
const mix = (hex, over, a) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex), [r2, g2, b2] = p(over);
  const f = (x, y) => Math.round(x + (y - x) * a);
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`;
};

/** Every custom property a theme sets, derived from its row.
 *
 *  "toward" brightens the ink; "away" fades it toward the paper. Fading toward black on a light
 *  theme is what made every hint sentence a mid-grey on cream — the design says so in as many
 *  words, and the app had the bug it describes.
 */
export function themeVars(key) {
  const S = THEMES[key] || THEMES.obsidian;
  const toward = S.dark ? '#FFFFFF' : '#000000';
  const away = S.paper;
  return {
    '--doc-bg': S.paper, '--doc-wash': S.wash, '--rail': S.rail, '--sheet': S.sheet,
    '--body': S.ink, '--ink': S.ink,
    '--ink-bright': mix(S.ink, toward, .35),
    '--narr': mix(S.ink, away, .16),
    // A hint is the sentence telling you what a control does, so it clears 4.5:1 by construction
    // rather than by inspection. Paper is bright, so ink fades faster against it: a light theme
    // needs a shorter fade to hold the contrast a dark one gets for free.
    '--label': mix(S.ink, away, S.dark ? .34 : .2),
    '--mute': mix(S.ink, away, S.dark ? .34 : .2),
    '--dim': mix(S.ink, away, S.dark ? .5 : .32),
    '--faint': mix(S.ink, away, S.dark ? .5 : .32),
    '--ink-ghost': mix(S.ink, away, S.dark ? .62 : .44),
    '--rule': S.dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.11)',
    '--line': S.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)',
    '--edge': mix(S.rail, toward, .11),
    '--edge-lit': mix(S.rail, toward, .22),
    '--chip': mix(S.rail, toward, .14),
    '--field': mix(S.sheet, away, .35),
    '--gold': S.accent, '--gold-dim': mix(S.accent, away, .22),
    '--gold-lit': mix(S.accent, toward, .3),
    '--on-gold': S.dark ? '#100D08' : '#FBF6EA',
    // The app keeps three states where the design has two: `warn` is the amber one that says
    // "look at this", `bad` is the red one that says "this is wrong". The design's single warn is
    // the red; amber is derived from the accent so it stays inside the theme.
    '--bad': S.warn, '--good': S.good, '--warn': mix(S.accent, away, .12),
    '--you-rule': mix(S.accent, S.paper, .5), '--speak-rule': S.speak,
    '--head': mix(S.ink, away, .42),
    '--dock': `linear-gradient(180deg,${S.paper}00,${S.paper}EB 40%)`,
    '--chrome': 'transparent',
    '--chrome-ink': mix(S.ink, toward, .35),
    '--chrome-dim': mix(S.ink, away, .42),
    '--chrome-line': S.dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)',
    '--panel-line': mix(S.rail, toward, .14),
  };
}
