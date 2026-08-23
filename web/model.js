// One description of the editable shape. Add a field here and both surfaces get it.
export const MODES = [
  ['cowrite',  'Speak',     (p) => `Write as ${p || 'yourself'}…`],
  ['direct',   'Direct',    () => 'What happens next…'],
  ['fullauto', 'Continue',  () => 'Steer, or leave blank…'],
  ['newscene', 'New scene', () => 'Where the new scene opens…'],
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
