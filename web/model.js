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

/** The shelf order: archived books last, everything else left where listStories put it.
 *
 *  A stable partition rather than a sort key, because the server already ordered by updated_at and
 *  the only thing archiving changes is "not first". Here rather than in app.js so it can be tested:
 *  an archived book taking the hero slot is the bug, and the hero is `[0]` of this. */
export const shelfOrder = (list) => [...(list ?? [])].sort((a, b) =>
  (a?.status === 'archived' ? 1 : 0) - (b?.status === 'archived' ? 1 : 0));

/** What is waiting across the whole shelf, and which book each kind is mostly in.
 *
 *  The shelf is the only screen that can see across books, and until now it could not see INTO one:
 *  a proposal not accepted, a promise not paid, a flag not looked at all live inside a story and
 *  were invisible from the outside. This is what the strip above the hero is made of.
 *
 *  Archived books are left out on purpose. Putting one away is the act that means "stop showing me
 *  this", and a strip that then nags about its unpaid promises has not listened. */
export const waiting = (list) => {
  const live = (list ?? []).filter((s) => s && s.status !== 'archived');
  const kind = (key, one, many, panel) => {
    const total = live.reduce((n, s) => n + (Number(s[key]) || 0), 0);
    if (!total) return null;
    // The book with the most of them, so one press goes where the work is rather than to a list.
    const where = live.reduce((a, b) => ((Number(b[key]) || 0) > (Number(a[key]) || 0) ? b : a));
    return { key, total, panel, storyId: where.id, storyTitle: where.title,
             label: `${total} ${total === 1 ? one : many}` };
  };
  return [
    kind('proposed', 'thread proposed', 'threads proposed', 'chapter'),
    kind('unpaid', 'promise unpaid', 'promises unpaid', 'strings'),
    kind('flags', 'flag', 'flags', 'chapter'),
  ].filter(Boolean);
};

// The labels on the dropdown. They name where the camera stops, because that is what the level
// IS — the lines these stand for are in src/context.ts and they say the same thing at length.
export const SPICE = [
  'nothing sexual — ends at the kiss', 'desire, not sex — stops at the door',
  'on the page, in the book\u2019s voice', 'direct, and the acts named', 'fully explicit',
];

/** #20. Six bare strings with no hint anywhere, in three places. Spice already does this properly
 *  — a prose label per level — and "we need examples so that its easy to understand how something
 *  would be written" is asking for the same treatment. One line of the thing itself beats any
 *  description of it. */
export const POV_EXAMPLE = {
  'first person, present tense':   'I come up the stair and the rain comes with me.',
  'first person, past tense':      'I came up the stair and the rain came with me.',
  'second person, present tense':  'You come up the stair and the rain comes with you.',
  'third limited, present tense':  'She comes up the stair and the rain comes with her.',
  'third limited, past tense':     'She came up the stair and the rain came with her.',
  'third omniscient, past tense':  'She came up the stair; below her, the porter already knew.',
};

export const STORY_FIELDS = [
  { k: 'title',        label: 'Title' },
  { k: 'genre',        label: 'Genre' },
  { k: 'premise',      label: 'Premise', area: true },
  { k: 'setting',      label: 'Setting' },
  { k: 'pov',          label: 'Point of view' },
  { k: 'persona',      label: 'You are', hint: 'The character you speak as in Speak mode.' },
  // #18. These were ONE field with a wrapper that called it a sample while every story in the
  // library held instructions. The hint was wrong in the same way and is now true of each half.
  { k: 'writingStyle', label: 'Voice of the weave', area: true,
    hint: 'How the narration behaves, as instructions. This is the half F37 measured: on its own '
        + 'line, naming narration, with the forms spelled out.' },
  { k: 'voiceSample',  label: 'A sample of your prose', area: true,
    hint: 'Optional. A few hundred words of your own writing to match the rhythm of. Never '
        + 'continued, quoted, or taken as fact — and it is the part that gets shortened if the '
        + 'block runs over.' },
  { k: 'styleNote',    label: 'How this book is written', area: true,
    hint: 'This book\'s genre flavour, kept apart from the voice: romance and science fiction are '
        + 'not the same writing style. It gets its own block under the voice.' },
  { k: 'direction',    label: 'Where this is going', area: true,
    hint: 'Aims the story without disclosing it. Never restated to the reader.' },
];

export const isSpeech = (t) => /^["“]/.test(String(t).trim());

/** A passage as a book sets it: paragraphs, and speech getting its own.
 *
 *  Print gives every turn of dialogue a paragraph of its own, and a model that writes narration and
 *  a line of speech in one run reads as a wall. The rule is conservative on purpose — it breaks
 *  before a quotation mark that opens after a sentence has ended, and nowhere else. A quote mid
 *  sentence ("the sign said <em>closed</em>, so she left") is not a new paragraph and must not
 *  become one.
 *
 *  Returns an array of paragraphs. The caller renders them; nothing here knows about HTML, which is
 *  what lets it be tested without a DOM. */
export const bookParagraphs = (body) => String(body ?? '')
  .split(/\n\s*\n|\n/)
  .flatMap((para) => para
    // Before an opening quote that begins a sentence: after . ! ? … and a space, or at the start.
    .split(/(?<=[.!?…][)"'\u201d]?\s)(?=["\u201c])/u)
    .map((s) => s.trim()))
  .filter(Boolean);
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

// THE CONVENTION THE PRESETS WERE RENAMED TO ON 2026-08-27, written down at the head of
// presets.ini: MODEL-VERSION-CODE-SIZE, e.g. Qwen3.6-WNTH-35B-A3B-NN. Everything the id knows is
// in the CODE segment, which is the only all-caps one:
//
//   RP roleplay · W writing · A agentic     NT no thinking · T thinking     H decensored
//
// H ABSENT DOES NOT MEAN CENSORED. presets.ini is explicit: absent means trained open and never
// censored (Wayfarer-2, Muse), which is a different claim from "it refuses" and the surface must
// not turn one into the other. The -NN suffix is the novel-writing tier from the 2026-08-27 prose
// bakeoff — the three that scored write 8/10 — and it is a claim about PROSE, not roleplay.
//
// Before this, an id in the new convention fell through to the Hugging-Face branch below and came
// out as "Qwen3.6 WNTH 35B A3B NN": every fact still encoded, none of it read.
const CODE = /^(RP|W|A)(NT|T)(H?)$/;
const PURPOSE = { RP: 'Roleplay', W: 'Write', A: 'Agentic' };
/** The options for a story's model select, in order.
 *
 *  A story pinned to a model the router no longer offers used to produce NO selected option — the
 *  browser then falls back to showing the first one, which is "Default", while the hint underneath
 *  still says the story is pinned. The two disagreed on screen, and worse, choosing Default fired
 *  no `change` event, because from the browser's side the value had not changed. So the pin could
 *  not be cleared from the one control that exists to clear it.
 *
 *  That is exactly what happened to `The Shadow's Debt`: it was pinned to `rp-t-glm47flash-h` while
 *  that preset existed, the router's whole preset list was rewritten on 2026-08-27, and the story
 *  has answered `400 model not found` ever since with no way out of it through the surface.
 *
 *  A pin that is no longer on offer therefore gets an option OF ITS OWN, selected, and says why it
 *  is there. Keeping it selectable is deliberate: it is what the story is actually set to, and a
 *  control must show the state it edits before it can be trusted to change it. */
export const modelOptions = (models, pinned) => {
  const list = (models ?? []).map((m) => ({ value: m.id, status: m.status, gone: false }));
  const orphan = pinned && !list.some((o) => o.value === pinned)
    ? [{ value: pinned, status: null, gone: true }] : [];
  return [{ value: '', status: null, gone: false }, ...orphan, ...list]
    .map((o) => ({ ...o, selected: o.value === (pinned ?? '') }));
};

export const modelName = (id) => {
  if (!id) return { name: 'no model', detail: '', id: '', bits: [], size: '' };
  const alias = /^(write|rp|agentic)-(n?t)-([a-z0-9]+)-([a-z0-9]+)$/.exec(id);
  if (alias) {
    const [, role, think, family, tail] = alias;
    const bits = [think === 't' ? 'thinking' : 'no thinking', tail === 'h' ? 'uncensored' : tail];
    return { id, name: `${ROLE[role]} \u00b7 ${FAMILY[family] ?? family}`,
             detail: bits.join(' \u00b7 '), bits, size: '' };
  }
  // A Hugging-Face path is not in the convention and must not be read as one — it is tried first
  // so a repo or quant segment can never be mistaken for a CODE.
  if (!id.includes('/') && !id.includes(':')) {
    const parts = id.split('-');
    const at = parts.findIndex((p) => CODE.test(p));
    if (at > 0) {
      const [, role, think, heretic] = CODE.exec(parts[at]);
      const tail = parts.slice(at + 1);
      const size = tail.filter((t) => t !== 'NN').join('-');
      // BITS ARE THE BADGES AND THE SIZE IS NOT ONE. Three surfaces put these beside a name in a
      // strip that is already `nowrap` with an ellipsis on it, and "35B-A3B" is the longest of them
      // and the least of what Seth asked to see there: purpose, uncensored, and the novel tier.
      // The size is still in `detail`, which is what the Storyteller's options are built from.
      //
      // "NO THINKING" IS GONE, "THINKING" IS NOT. Seth, 2026-08-29: "you can remove the no thinking
      // label". It rode on eight of the ten presets and said nothing while it did — the transport
      // pins `enable_thinking: false` on every call, so a model that does not think is the normal
      // case and a badge for it is a badge on almost everything. THE OTHER HALF STAYS, and the
      // house rule it comes from is unchanged: a `T` model is the difference between a passage and
      // 900 tokens of reasoning and no prose at all, and GLM-4.7-Flash honours the switch while
      // Huihui-ThinkingCap's is UNTESTED on its architecture. Silence here means "nothing to
      // watch"; the word means "watch this one".
      const bits = [PURPOSE[role]];
      if (think === 'T') bits.push('thinking');
      // Never "censored" for the other case. See the note above CODE.
      bits.push(heretic ? 'uncensored' : 'trained open');
      if (tail.includes('NN')) bits.push('novel tier');
      // The size goes back in for the one-line `detail`, where the Storyteller's options are built
      // from it — before the tier, which is the last thing the id says.
      const tier = bits.indexOf('novel tier');
      const cut = tier < 0 ? bits.length : tier;
      const detail = [...bits.slice(0, cut), size, ...bits.slice(cut)].filter(Boolean).join(' \u00b7 ');
      return { id, name: parts.slice(0, at).join(' '), detail, bits, size };
    }
  }
  const [repo, quant] = id.split(':');
  const org = repo.includes('/') ? repo.split('/')[0].toLowerCase() : '';
  // The org name is often repeated inside the repo name as well, and once is enough.
  const name = (repo.split('/').pop() ?? repo).replace(/[-_]?GGUF$/i, '')
    .split(/[-_]+/).filter((w) => w.toLowerCase() !== org).join(' ');
  return { id, name, detail: quant ?? '', bits: quant ? [quant] : [], size: '' };
};

/** WHAT A MODEL IS GOOD AT, which is the one thing #25 asks for that nothing can derive.
 *
 *  Everything else on the panel is read: the router says what exists, presets.ini says the context,
 *  the generations table says the speed, and `modelName` decodes purpose and thinking out of the id
 *  itself. This is the remainder — and every line of it is lifted from the stanza comments in
 *  /data/models/presets.ini, which is where the A/Bs that put each model on the box are written
 *  down. Nothing here is a vibe about a model; if it is not in that file it is not on this panel.
 *
 *  KEYED BY THE FAMILY `modelName` DECODES, not by the whole id, so a re-quant or a size change
 *  keeps its blurb. A family that is not here shows no blurb rather than a guess — the same rule
 *  `modelFacts` follows for a model nobody has written with.
 *
 *  ponytail: a hand-written map, so the 2026-08-27 rename would have emptied it silently rather
 *  than loudly. If the presets are renamed again, grep this map. Upgrade path if that gets old:
 *  a `blurb =` key per stanza in presets.ini, read by src/presets.ts alongside ctx-size.
 */
export const BLURB = {
  'Qwen3.6': 'The house default. 35B with 3B active, so it writes at roughly twelve times the '
    + 'speed of the dense models here and still scored write 8/10 in the 2026-08-27 bakeoff. Its '
    + 'one documented quirk is person: it was the only model in that bakeoff that did not hold '
    + 'the person constraint.',
  'Gemma 4': 'Write 8/10 and roleplay 7/10 in the 2026-08-27 bakeoff, and the only model in it '
    + 'that violated no constraint at all. Same prose score as Qwen3.6 at a fraction of the speed.',
  'Artemis 1.1': 'The same Gemma 4 base, decensored by roleplay finetune rather than by ablation '
    + '— it is on the box so that the method is the only variable between the two. Best '
    + 'register match in the 2026-08-27 bakeoff.',
  'GLM 4.7 Flash': 'A thinking model that honours enable_thinking:false, verified on this box '
    + '2026-08-26. Left on, it returned 3,741 characters of reasoning and empty prose to a '
    + 'two-sentence ask. Anansi sends the switch on every call.',
  'Ornith 1.0': 'The same architecture and quant as Qwen3.6, abliterated rather than finetuned, '
    + 'carried as the controlled test where ablation is the only variable. Ablation removes '
    + 'refusals; it does not move a model’s prose.',
  'Harbinger': 'Mistral-Small 24B, trained by LatitudeGames for multi-turn adventure — this '
    + 'is what AI Dungeon serves on its premium tier. In the bakeoff it wrote in AI Dungeon’s '
    + 'frame rather than the card’s, and omitted the header the write task required.',
  'Wayfarer 2': 'Mistral-Nemo 12B, trained on text adventures where a character can fail and take '
    + 'injury; nothing else here is trained for that. Held at 32k rather than its advertised 128k. '
    + 'It returned 392 words against a 600–800 floor in the bakeoff.',
  'Muse': 'The same Nemo 12B base as Wayfarer-2, trained instead for long emotional narrative and '
    + 'relational continuity, with the common AI cliches stripped from its data. Beside '
    + 'Wayfarer-2 so the finetune is the only variable.',
  'Qwen3.8': 'A HauhauCS uncensored finetune rather than an ablation. 27.8B dense, so every '
    + 'parameter moves per token: 12.7 tok/s measured against Qwen3.6’s 51.9. It earns its '
    + 'place on vision and on a newer base, never on throughput.',
  'Huihui ThinkingCap': 'An abliterated Qwen3.6 27B with speculative decoding. It emits think '
    + 'blocks, and enable_thinking:false is UNTESTED on this architecture — which for prose '
    + 'is the difference between a passage and nothing at all.',
};

// Block colours are shared so the meter reads the same on both surfaces.
// VOICE was missing from here and from nowhere else — BLOCK_ORIGIN twelve lines below has always
// carried it. app.js reads this as `BLOCK_COLOR[k] ?? 'var(--ink-ghost)'`, so the sample of the
// writer's own prose was painted in the colour that means "a kind I have no entry for", on the
// meter and on its legend dot. bench/utilisation measured it present in 61 of 61 scored
// generations at 8.4% of the prompt: not an edge case, every call.
//
// The colour is chosen by LIGHTNESS, not by hue. VOICE sits between SPINE and CANON-ALWAYS in
// ORDER, so those two are what it is actually seen against, and both are light (L 73 and 67). A
// hue-only choice would have put a teal beside a green — the one pair a deuteranope cannot
// separate — so this is dark enough that lightness alone tells them apart, and the check below
// asserts that rather than trusting the eye that picked it.
export const BLOCK_COLOR = {
  SPINE: '#D9B26A', VOICE: '#5C5480', STYLE: '#3F6B6E', 'CANON-ALWAYS': '#7FB083', 'CANON-TRIGGERED': '#9A8B62',
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
  STYLE:             ['How this book is written', 'story'],
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
    // #14. One accent per press, so reading back tells you what produced each passage. Derived
    // from values every theme already tunes rather than four more columns in the table above —
    // nineteen themes, and a theme that ships three of four accents is the half-applied failure
    // THEMES exists to prevent. Speak keeps the colour speech already had; Direct keeps the one
    // the directed margin already had, so nothing on screen changes hue for the two modes that
    // were already distinguishable.
    '--m-speak': S.speak, '--m-act': S.good,
    '--m-direct': mix(S.accent, away, .22), '--m-narrate': S.warn,
    // (--speak-tint / --act-tint lived here. Removed 2026-08-27: only one of the pair was
    // visible, so the row read as broken rather than as distinguishing the two modes.)
    '--head': mix(S.ink, away, .42),
    '--dock': `linear-gradient(180deg,${S.paper}00,${S.paper}EB 40%)`,
    '--chrome': 'transparent',
    '--chrome-ink': mix(S.ink, toward, .35),
    '--chrome-dim': mix(S.ink, away, .42),
    '--chrome-line': S.dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)',
    '--panel-line': mix(S.rail, toward, .14),
  };
}

// ---------------------------------------------------------------------------
// MARKS. Every one a fragment of the orb-web in web/icon.svg — its rings and its spokes — drawn
// at one hairline weight.
//
// From the design, and its reason is in the note that ships with it: these replace "glyphs
// scavenged from six Unicode blocks". A ⚙ and a ❧ and a ◐ come from three different centuries and
// three different hands, and no amount of sizing makes them a set. A ring, a half-ring and a ring
// with a hub do.
// ---------------------------------------------------------------------------
export const MARK = {
  // THE WHOLE WEB, the seven strokes of web/icon.svg at this box size: four threads and three
  // rings. `web` below is three strokes of it and stays what it is — a corner of a web reads as a
  // menu, and the whole thing reads as her. Circles are arcs so `mark()` can draw them: it splits
  // on a capital M and hands each piece to a <path>, which a <circle> cannot ride in.
  webfull:  'M10 3.6 10 16.4M3.6 10 16.4 10M5.4 5.4 14.6 14.6M14.6 5.4 5.4 14.6'
          + 'M10 7.8A2.2 2.2 0 1 1 10 12.2A2.2 2.2 0 1 1 10 7.8'
          + 'M10 5.6A4.4 4.4 0 1 1 10 14.4A4.4 4.4 0 1 1 10 5.6'
          + 'M10 3.6A6.4 6.4 0 1 1 10 16.4A6.4 6.4 0 1 1 10 3.6',
  story:    'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3',
  chapter:  'M3 10A7 7 0 0 1 17 10M10 10V3.2',
  // THREADS AND PREFS MOVED TO THE COMPOSER, 2026-08-28, and the menu took new ones. Seth: "allow
  // the maximize icon to be the threads icon and the send icon to be the preferences icon. then
  // change those out in the menu since we'll be using it here." The strands and the dial are now
  // `expand` and `send`; the rows that lost them get shapes from the same hand — two linked rings
  // for threads, because a thread is a thing joined to another thing, and two rails with handles
  // for preferences, because that is what a setting looks like when it is not a scavenged gear.
  expand:   'M10 10 3.6 6.2M10 10 16.4 6.2M10 10 10 17.4',
  send:     'M4.4 13.6A7 7 0 1 1 15.6 13.6M10 10V17.6',
  threads:  'M7 6.5A3.5 3.5 0 1 1 7 13.5A3.5 3.5 0 1 1 7 6.5M13 6.5A3.5 3.5 0 1 1 13 13.5A3.5 3.5 0 1 1 13 6.5',
  strings:  'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3M10 10 16.4 6.2',
  context:  'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3M10 6.8A3.2 3.2 0 1 1 10 13.2A3.2 3.2 0 1 1 10 6.8',
  search:   'M11.8 5.2A3.6 3.6 0 1 1 11.8 12.4A3.6 3.6 0 1 1 11.8 5.2M9.2 11.4 4.4 16.2',
  teller:   'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3M10 10V3M10 10H17M10 10V17M10 10H3',
  anansi:   'M10 3.6A6.4 6.4 0 1 1 10 16.4L5.6 17.4 6.6 13.6A6.4 6.4 0 0 1 10 3.6M7.4 10h5.2',
  stories:  'M6.5 5.2A2.9 2.9 0 1 1 6.5 11A2.9 2.9 0 1 1 6.5 5.2M13.5 5.2A2.9 2.9 0 1 1 13.5 11A2.9 2.9 0 1 1 13.5 5.2M10 11.6A2.9 2.9 0 1 1 10 17.4A2.9 2.9 0 1 1 10 11.6',
  create:   'M4.2 4.2 15.8 15.8M15.8 4.2 4.2 15.8',
  import:   'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3M10 3.6V11M10 11 7.3 8.3M10 11 12.7 8.3',
  prefs:    'M3.2 7.6H16.8M3.2 12.4H16.8M7.6 5.4V9.8M12.4 10.2V14.6',
  reading:  'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3M10 3V17',
  // Help. A quadrant of the orb-web itself — three radials and two spirals — which is the house
  // metaphor rather than a question mark borrowed from somebody else's icon set.
  web:      'M10 10 5.05 5.05M10 10 10 3M10 10 14.95 5.05'
          + 'M7.17 7.17A4 4 0 0 1 12.83 7.17M5.05 5.05A7 7 0 0 1 14.95 5.05',
  // Reading mode. An open book: one spine, two leaves falling away from it.
  book:     'M10 5.6V16.2M10 5.6C8.1 4.4 5.6 4.1 3.7 4.3V14.8C5.6 14.6 8.1 14.9 10 16.2'
          + 'M10 5.6C11.9 4.4 14.4 4.1 16.3 4.3V14.8C14.4 14.6 11.9 14.9 10 16.2',
  menu:     'M3 6.5h14M3 10h14M3 13.5h14',
  chevron:  'M8 5.5 13 10 8 14.5',
};

/** One mark, at one weight. `size` is the box; the stroke never changes with it — that is what
 *  "one hairline weight" means and what a scavenged glyph set can never do. */
export const mark = (name, size = 19, colour = 'currentColor') =>
  `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="${colour}"
    stroke-width="1.1" stroke-linecap="round" aria-hidden="true"
    style="flex:0 0 auto; overflow:visible">${
      (MARK[name] ?? MARK.story).split('M').filter(Boolean)
        .map((d) => `<path d="M${d}"></path>`).join('')}</svg>`;

/** A line from the chapter's own prose, to stand at its head.
 *
 *  The design's band carries an epigraph and its note says it is "pulled from its own prose". Two
 *  rules make that work rather than merely happen:
 *
 *  NOT FROM THE FIRST PASSAGE. The first passage is directly under the band, and quoting a line
 *  the reader is about to read four inches later is not an epigraph, it is a stutter.
 *
 *  SHORT AND WHOLE. Between 24 and 90 characters, ending in a full stop, and never a line of
 *  dialogue — a character's words are theirs, and hoisting them to the head of a chapter puts the
 *  narrator's authority behind something somebody merely said. Earliest wins among equals, so the
 *  same chapter always shows the same line.
 *
 *  Returns '' when the chapter has not earned one, which is most chapters at their beginning.
 */
export const epigraphOf = (passages) => {
  const after = (passages ?? []).slice(1);
  let best = '';
  for (const p of after) {
    const prose = String(p?.body ?? '').replace(/["“][^"”]*["”]/g, ' ');
    for (const m of prose.matchAll(/[^.!?]+[.!?]/g)) {
      const line = m[0].trim();
      if (line.length < 24 || line.length > 90) continue;
      if (/["“”]/.test(line)) continue;
      if (!best || line.length < best.length) best = line;
    }
  }
  return best;
};

/** WHAT THE APP KNOWS ABOUT A MODEL, which until #25 was nothing.
 *
 *  `GET /api/models` returned `{id, status}` and everything else on screen was string surgery on
 *  the id. It now merges three sources that each know one thing and none of which knows the others:
 *  the router says which models exist and whether they are loaded, `presets.ini` says a model's own
 *  ctx-size and how many slots it is cut into, and the app's own `generations` table says how fast
 *  each one has actually written.
 *
 *  PER-SLOT, NEVER THE WHOLE WINDOW. `ctx-size` is divided ACROSS slots, so the number that matters
 *  to a writer is the quotient — checks.md called it "context window divided by half". Showing
 *  100,000 for a model serving two writers overstates the budget by double.
 *
 *  THE RUN COUNT RIDES WITH A THIN SPEED. 63 tok/s off two calls and off two hundred are different
 *  claims and a screen that cannot say which is asserting more than it knows, so under five calls
 *  the count is shown beside it. A model nobody has written with says nothing rather than a guess.
 *
 *  Here rather than in `web/app.js` so it can be checked: app.js is imported for its side effects
 *  and exports nothing, so a rule that lives in it can only be tested by driving the whole rail. */
export function modelFacts(m) {
  const bits = [];
  if (m?.perSlot) bits.push(`${Math.round(m.perSlot / 1000)}k each`);
  if (m?.tps) bits.push(`${m.tps} tok/s${m.runs < 5 ? ` (${m.runs})` : ''}`);
  return bits.join(' · ');
}
