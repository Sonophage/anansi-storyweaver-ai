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

export const SPICE = [
  'no sexual content', 'sensual, fades at the door', 'on the page, restrained',
  'direct and explicit', 'fully explicit',
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

// Block colours are shared so the meter reads the same on both surfaces.
export const BLOCK_COLOR = {
  SPINE: '#D9B26A', 'CANON-ALWAYS': '#7FB083', 'CANON-TRIGGERED': '#9A8B62',
  EARLIER: '#8A7BA8', PROSE: '#6E8AA0', TAIL: '#5E7A8E', DIRECTIVE: '#C99356', MODE: '#635E56',
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
  EARLIER:           ['Summaries in context',    'traj'],
  PROSE:             ['The prose above',         'doc'],
  DIRECTIVE:         ['Point of view & register', 'story'],
  TAIL:              ['Where you left off',      'doc'],
  MODE:              ['The mode you picked',     'doc'],
};
