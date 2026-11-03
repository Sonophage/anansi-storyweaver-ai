// One description of the editable shape. Written when there were two surfaces; app.html is the
// only consumer since desk and phone were deleted on 2026-08-23. It stays a separate module
// because it is data, not behaviour — the field list, the mode labels, the block colours.
// Continue is not in here: it is a button, not a mode. It sends immediately with nothing typed,
// so it has no placeholder and no selected state to hold.
//
// The four that are left differ in what happens to what you type. Speak, Act and Narrate put it
// on the page as yours and the model answers it. Direct never puts it on the page at all — it is
// an instruction. That difference is the one people get wrong, so the placeholders say it.
/* THE HINT SAYS WHAT GOES IN THE BOX. Seth, 2026-09-02: "the help hints in the input box should be
 * rewritten so they make sense". Two of them did not: "Say it as Wren Halloway" is the dial's job
 * now that the dial reads Speak and her name is beside it, and "What Wren Halloway do" was
 * ungrammatical for every value the field has ever held except the word `you` — the name is third
 * person and the verb was written for the second. Each one is a phrase for the thing you type,
 * and the two that take a name have a form for the name and a form for yourself. */
export const MODES = [
  ['speak',   'Speak',   (p) => p ? `The words ${p} says…` : 'The words you say…'],
  ['act',     'Act',     (p) => p ? `What ${p} does…` : 'What you do…'],
  ['direct',  'Direct',  () => 'Tell Anansi what happens next…'],
  ['narrate', 'Narrate', () => 'Write the passage yourself — Anansi carries on from it…'],
  /* CO-OP IS A MODE. Seth, 2026-09-03: "co op would be a mode though. because either of us could
   * call the ai for the next beat if needed (writers block)" — so it is one of the choices in How
   * you are writing, held until you change it, rather than a press you make once.
   *
   * IT IS THE ONE MODE THAT NEVER CALLS THE MODEL. What you type goes on the page and the turn
   * passes; when you are stuck you change the dial to Direct and ask for a beat, and the move stays
   * with you because you have not written yet.
   *
   * Being in MODES gets it the placeholder, the margin accent and the origin chip — all three of
   * which it wants, because the whole point is seeing who wrote what. `EDITABLE_PROMPTS` in
   * story.ts is its own list and does not read this one, so no prompt template is invented for a
   * mode that never sends one.
   *
   * THE COMPOSER HIDES IT unless the book has a second writer: see drawDock. A mode that hands the
   * turn to nobody is a mode that does nothing. */
  ['coop', 'Co-op', (p) => p ? `Your part of the scene, then it is ${p}'s move…`
                             : 'Your part of the scene, then it is their move…'],
];

// #80. A copy of `slots.KINDS` (the browser cannot import the .ts); test/db.ts holds them equal.
export const KINDS = ['character', 'place', 'lore', 'item'];

/** A THREAD'S WAKE WORDS FROM WHAT WAS TYPED, by the rules of `keysOf` in src/db.ts, which re-parses
 *  them on the way in and is the authority. The Alter screen's chips use this so a chip never shows
 *  a word the save would drop or split: a comma list splits, each word is trimmed of the spaces and
 *  punctuation round it (quotes included), 2 to 32 characters is kept, and a word already there in
 *  any case is not added twice — the first spelling stays. test/web.ts runs both on the same edge
 *  cases and fails if they disagree, which is what keeps this a copy of one parser and not a second.
 *  `cap` is the screen's limit (ten, SPEC §7.1); the database takes the list as given. */
export const keysFrom = (k, cap = Infinity) => {
  const seen = new Set();
  return (Array.isArray(k) ? k : String(k ?? '').split(','))
    .map((x) => String(x ?? '').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((x) => x.length >= 2 && x.length <= 32)
    .filter((x) => !seen.has(x.toLowerCase()) && (seen.add(x.toLowerCase()), true))
    .slice(0, cap);
};

/** #134 · A copy of `pocketReach` in `src/context.ts` (the browser cannot import the .ts): a pocket's
 *  `activation`, or, on a row with none, on is On, off with wake words is On a word, off without is
 *  Off; a rule on is On a word with wake words and On without, and off is Off. test/db.ts runs every
 *  case through both and through the SQL copies. */
export const pocketReach = (a) => {
  if (a.activation) return a.activation;
  const words = (a.keys ?? []).length > 0;
  if (a.slot === 'rule') return a.active ? (words ? 'triggered' : 'always_on') : 'off';
  return a.active ? 'always_on' : words ? 'triggered' : 'off';
};

/** The four kinds as GROUPS, which is how every row that offers them reads: you are filtering or
 *  asking for characters, not for character. #22 named them on the cross-shelf page and #21 needs
 *  the same words in the wizard — one map, because two would drift on the first rename. */
export const KIND_PLURAL = { character: 'Characters', place: 'Places', lore: 'Lore', item: 'Items', rule: 'Rules' };

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
 *  a proposal not accepted and a promise not paid both live inside a story and were invisible
 *  from the outside. This is what the strip above the hero is made of.
 *
 *  Archived books are left out on purpose. Putting one away is the act that means "stop showing me
 *  this", and a strip that then nags about its unpaid promises has not listened. */
export const waiting = (list, me = null) => {
  // Archived books are left out for the reason below; world books are left out because they hold
  // no prose and nothing can be waiting in them.
  const live = (list ?? []).filter((s) => s && s.status !== 'archived' && !s.is_world);
  const kind = (key, one, many, panel) => {
    const total = live.reduce((n, s) => n + (Number(s[key]) || 0), 0);
    if (!total) return null;
    // The book with the most of them, so one press goes where the work is rather than to a list.
    const where = live.reduce((a, b) => ((Number(b[key]) || 0) > (Number(a[key]) || 0) ? b : a));
    return { key, total, panel, storyId: where.id, storyTitle: where.title,
             label: `${total} ${total === 1 ? one : many}` };
  };
  /* YOUR MOVE, in a book you write with somebody. Seth, 2026-09-03: "if she writes then it waiting
   * on me and that top glow would tell me to look at the shared account."
   *
   * FIRST IN THE LIST, because it is the only kind here that another person is waiting on. A
   * proposal keeps until you feel like it; a turn is somebody sitting on their hands.
   *
   * `me` is null on every caller that does not know who is asking — the shelf strip has never
   * needed to — and a null reader is owed nothing rather than owed everything. */
  const mine = me ? live.filter((s) => s.turn && s.turn === me) : [];
  return [
    mine.length ? { key: 'turn', total: mine.length, panel: null,
      storyId: mine[0].id, storyTitle: mine[0].title,
      label: mine.length === 1 ? `your move in ${mine[0].title}` : `your move in ${mine.length} tales` } : null,
    kind('proposed', 'thread chalked', 'threads chalked', 'chapter'),
    // CHALKED THREADS ONLY, not open strings (Seth, 2026-10-29: "why is there a glowing line at the
    // top of my screen if there's nothing in my workbench?"). A string in play is part of the tale,
    // not something waiting on the writer, and since 0afb91d it is not a Workbench card either.
  ].filter(Boolean);
};

/** WHAT IS NEW ON THE WORKBENCH, for the mark in the header (Seth, 2026-10-29: "we need a
 *  notification in the header for when the Workbench has new additions").
 *
 *  A card's PARTS are what can be added to it. A chalked group's key is its ids joined, so it
 *  changes when one of them is sewn in; its parts are the ids, and losing one adds nothing. Any other
 *  card is its own key, plus whatever it has chalked: a hemmed scene seen while it ran and since
 *  chalked something has had something added. */
const partsOf = (c) => {
  const ids = (c?.ps ?? []).map((p) => p.id);
  return c?.kind === 'chalk' ? ids : [c?.key, ...ids];
};
/** Every part on the bench now: what is written down as seen when the writer opens it. */
export const benchParts = (cards) => (cards ?? []).flatMap(partsOf);
/** How many cards hold a part not in `seen`. */
export const benchUnseen = (cards, seen) =>
  (cards ?? []).filter((c) => partsOf(c).some((k) => !seen.has(k))).length;

// The labels on the dropdown. They name where the camera stops, because that is what the level
// IS — the lines these stand for are in src/context.ts and they say the same thing at length.
export const SPICE = [
  'nothing sexual — ends at the kiss', 'desire, not sex — stops at the door',
  'on the page, in the tale\u2019s voice', 'direct, with everything named', 'fully explicit',
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

/** #84 · WHAT A VOICE SAYS ABOUT PERSON AND TENSE, against the tale's point of view. A Voice that
 *  says "first person, present tense" over a third-person tale tells the model two things (#81).
 *
 *  ONLY A STATEMENT COUNTS: "first person", "close third", "past tense". The word "you" does not,
 *  because a Voice is written TO the model ("You keep the sentences short"); neither does anything
 *  inside quotes (dialogue may say anything) or a person named to forbid it ("never second person").
 *  One function, for the wizard's preview now and Tale settings later. Returns each sentence that
 *  disagrees, with what it says. */
const PERSON = [['first', /\bfirst[\s-]+person\b/i], ['second', /\bsecond[\s-]+person\b/i],
  ['third', /\bthird[\s-]+person\b|\b(?:close|limited)\s+third\b|\bthird[\s-]+(?:limited|omniscient)\b/i]];
const TENSE = [['present', /\bpresent[\s-]+tense\b/i], ['past', /\bpast[\s-]+tense\b/i]];
const sentencesOf = (line) => line.split(/(?<=[.!?])\s+(?=\S)/);
// Clause by clause, and within a clause only what follows a negation is silenced: "never second
// person" says nothing, "first person with no filter words" still says first person.
function says(sentence) {
  const out = { person: null, tense: null };
  for (let clause of sentence.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g, ' ').split(/[,;:]/)) {
    clause = clause.split(/\b(?:never|not|no|avoid|don't)\b/i)[0];
    out.person ??= PERSON.find(([, re]) => re.test(clause))?.[0] ?? null;
    out.tense ??= TENSE.find(([, re]) => re.test(clause))?.[0] ?? null;
  }
  return out;
}
export function voiceClash(voice, pov) {
  const want = says(String(pov ?? ''));
  const out = [];
  for (const line of String(voice ?? '').split('\n')) for (const sentence of sentencesOf(line)) {
    const got = says(sentence);
    const person = got.person && want.person && got.person !== want.person;
    const tense = got.tense && want.tense && got.tense !== want.tense;
    if (person || tense) out.push({ sentence: sentence.replace(/^\s*[-*]\s*/, '').trim(),
      said: [person ? `${got.person} person` : '', tense ? `${got.tense} tense` : ''].filter(Boolean).join(', ') });
  }
  return out;
}
/** The fix: the Voice without the sentences `voiceClash` names, and otherwise as it was. A line left
 *  with nothing but its list mark goes too. */
export function withoutClash(voice, pov) {
  const lines = String(voice ?? '').split('\n');
  return lines.map((line) => {
    const kept = sentencesOf(line).filter((sn) => !voiceClash(sn, pov).length);
    return kept.length === sentencesOf(line).length ? line : kept.join(' ');
  }).filter((line, i) => line === lines[i] || !/^\s*[-*]?\s*$/.test(line)).join('\n');
}

export const STORY_FIELDS = [
  { k: 'title',        label: 'Title' },
  { k: 'genre',        label: 'Genre' },
  { k: 'premise',      label: 'Premise', area: true },
  { k: 'setting',      label: 'Setting' },
  { k: 'pov',          label: 'Point of view' },
  { k: 'persona',      label: 'You play', hint: 'The character you speak as in Speak mode.' },
  // #18. These were ONE field with a wrapper that called it a sample while every story in the
  // library held instructions. The hint was wrong in the same way and is now true of each half.
  { k: 'writingStyle', label: 'Voice', area: true,
    hint: 'How the narration behaves, as instructions. This is the half F37 measured: on its own '
        + 'line, naming narration, with the forms spelled out. Leave it empty and the tale is '
        + 'written in the house voice \u2014 there is no such thing as a tale with none.' },
  { k: 'styleNote',    label: 'Genre flavour', area: true,
    hint: 'This tale\'s genre flavour, kept apart from the voice: romance and science fiction are '
        + 'not the same writing style. It is sent on its own, under the voice.' },
];

export const isSpeech = (t) => /^["“]/.test(String(t).trim());

/** The room to add under the page so it can scroll `want` px: anchorLive's count. `content` is the
 *  page's real height, NOT `scrollHeight`, which is never less than `client` (the screen): counted
 *  from it, a page shorter than the screen got too little room and the header stopped short of the
 *  top (measured 2026-10-28: wanted 438px of scroll, could scroll 309). Rounded up, never negative. */
export const roomBelow = (want, content, client) => Math.max(0, Math.ceil(want - (content - client)));

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
/** ONE CHUNK OF STREAMED NARRATION INTO PARAGRAPHS, the way `bookParagraphs` (web/model.js) sets the
 *  landed passage: a new paragraph at every line break (blank lines collapse), and before an opening
 *  quote that starts a sentence. Leading space at a paragraph's start is dropped, as the landed
 *  paragraphs are trimmed. Each word's own text is kept on its span (`inkRaw`) and the span is
 *  filled by `inkAccent`, escaped and accented as the landed passage is. The rules above read the
 *  kept text, never what is shown, which has lost its asterisks. Returns the spans it made, for the
 *  ink-in animation. */
export function inkParagraphs(el, chunk, doc = globalThis.document) {
  const made = [];
  let p = el.lastElementChild?.tagName === 'P' ? el.lastElementChild : null;
  const open = () => { p = doc.createElement('p'); el.append(p); return p; };
  const raw = () => [...p.children].map((s) => s.inkRaw ?? '').join('');
  for (const part of String(chunk).split(/(\n)/)) {
    if (part === '\n') { if (p && raw().trim()) p.dataset.closed = '1'; continue; }
    let piece = part;
    if (!piece) continue;
    const fresh = !p || p.dataset.closed === '1'
      || (/^\s*["“]/.test(piece) && /[.!?…][)"'”]?\s$/.test(raw()));
    if (fresh) { piece = piece.replace(/^\s+/, ''); if (!piece) continue; open(); }
    else if (!raw()) piece = piece.replace(/^\s+/, '');
    if (!piece) continue;
    const sp = doc.createElement('span');
    sp.inkRaw = piece;
    p.append(sp);
    made.push(sp);
  }
  inkAccent(el);
  return made;
}

/** THE PASSAGE BEING WRITTEN, ACCENTED AS IT WILL LAND. Every word's span is refilled from the
 *  whole text so far, through the same `accent` the landed passage goes through, each span holding
 *  its own share of the markup. `el` holds paragraphs of word spans (narration, `inkParagraphs`) or
 *  word spans alone (a line of speech, and the full-screen veil); every span carries its own text as
 *  `inkRaw`. Only a span whose markup changed is written, so a word already on the page is not
 *  touched and its ink-in animation is not restarted.
 *
 *  The last paragraph is unfinished (`done: false` until the passage is), so a quote or asterisk
 *  that has opened is shown open: the asterisk is hidden and the words styled from the moment the
 *  word arrives, and nothing changes when its closer does. The one thing that does change is a mark
 *  that never closes: it is shown literal again once its paragraph is over, which is the first
 *  moment that can be known. So a stray asterisk in the last paragraph comes back as the passage
 *  finishes, and nowhere else does anything on screen change after its word arrived. */
export function inkAccent(el, { done = false } = {}) {
  // ponytail: re-reads the whole passage on every word, so the work grows with the square of its
  // length. Fine at a passage's few thousand characters; if a long passage stutters while it
  // streams, read only the last two paragraphs (earlier ones can no longer change).
  const slots = [];
  let text = '';
  const cuts = [];
  const take = (s) => { cuts.push(text.length); slots.push(s); text += esc(s.inkRaw ?? ''); };
  [...el.children].forEach((c, i) => {
    if (c.tagName !== 'P') return take(c);
    // A paragraph break is a newline in the text accent reads, and a piece of its own to drop.
    if (i) { cuts.push(text.length); slots.push(null); text += '\n'; }
    [...c.children].forEach(take);
  });
  if (!slots.length) return;
  accent(text, { done, cuts }).forEach((h, i) => {
    const s = slots[i];
    if (s && s.inkHTML !== h) { s.inkHTML = h; s.innerHTML = h; }
  });
}

export const ago = (t) => { const d = (Date.now() - t) / 864e5;
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${Math.floor(d)} days ago`; };

/** How long since a book was touched, at the resolution the shelf needs.
 *
 *  NOT an extension of `ago()`, which is day-precision and has to stay that way: `src/news.ts`
 *  stamps a release at noon UTC on purpose, so an hour-precise `ago()` would render a release
 *  written this morning as happening in three hours' time. A release is a date. A book was
 *  touched at a moment, and "4 hours ago" is the difference between coming back to the same
 *  sitting and coming back to a different day.
 *
 *  Clamps at zero rather than counting forwards: a clock that moved backwards is not something
 *  the shelf should narrate.
 */
export const touchedAgo = (t) => {
  if (!t) return '';
  const mins = Math.max(0, (Date.now() - Number(t)) / 6e4);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};
/** COPY PROMPT (2026-10-30): the messages a Talk answer was sent, as plain text that reads in a text
 *  box. Each role by the name the page gives it: the system message, then the writer and Anansi. */
const SPEAKER = { system: 'SYSTEM', user: 'WRITER', assistant: 'ANANSI' };
export const promptText = (messages) => (messages ?? [])
  .map((m) => `${SPEAKER[m.role] ?? String(m.role).toUpperCase()}:\n${m.content}`).join('\n\n');

// Escapes quotes as well as tags: this is interpolated into value="..." attributes on both
// surfaces, so a character named  The "Bell"  used to truncate its own name field on edit.
export const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

/** QUOTED SPEECH AND ASTERISK EMPHASIS, ACCENTED. Seth, 2026-10-29: "things between quotations or
 *  asterisks or double asterisks should be accented".
 *
 *  Takes text that has ALREADY been through `esc` and returns it with four tags added: a quote
 *  becomes `<span class="q">` with its marks kept, `**x**` becomes `<strong>` and `*x*` becomes `<em>`
 *  with their asterisks removed. Nothing else is added and nothing is unescaped, so marking cannot
 *  let markup through: the text holds no `<` and no raw `"` by the time it gets here, and `&quot;`
 *  is read as one unit, so the six characters "&quot;" typed in a passage arrive as `&amp;quot;`
 *  and are not a quote. Display only: the stored passage, the prompt and Alter keep the asterisks.
 *
 *  A newline ends a paragraph and everything open closes there. What is still open at the end of a
 *  paragraph is LEFT LITERAL — an unmatched mark never styles the rest of the text — with one
 *  exception, the printer's rule for speech that runs over paragraphs: the quote is not closed, and
 *  the next paragraph opens with a quote mark. Then this paragraph's part is styled to its end.
 *
 *  `done: false` is for a passage still being written: its LAST paragraph is unfinished, so what is
 *  open there is shown open (asterisks hidden, words styled) rather than literal. That is what keeps
 *  a streamed asterisk from showing and then vanishing when its closer arrives.
 *
 *  `cuts` are offsets into the text; with them it returns an array, one complete piece of markup
 *  per stretch between cuts. That is how each streamed word carries its own share (`inkAccent`).
 *
 *  Which marks count. A curly quote says which way it faces. A straight one, and an asterisk, opens
 *  when it has text after it and no letter or digit before it, and closes when it has text before
 *  it and no letter or digit after it — so "5 * 3", a lone *, snake*case and 6" are all literal.
 *  Apostrophes and single quotes (' and ’) are never quote marks. Three or more asterisks are
 *  literal. */
export function accent(text, { done = true, cuts = null } = {}) {
  const OPEN = { q: '<span class="q">', em: '<em>', strong: '<strong>' };
  const CLOSE = { q: '</span>', em: '</em>', strong: '</strong>' };
  const lines = String(text ?? '').split('\n');
  const word = (u) => u != null && /^[\p{L}\p{N}]$/u.test(u);
  const blank = (u) => u == null || /^\s$/.test(u);
  // Does this paragraph begin with an opening quote? The printer's continued-speech rule.
  const opensQuote = (s) => /^\s*(\u201c|&quot;)\S/.test(s ?? '');
  // For each unit of the text (a character, or a whole entity such as &quot;): the tags before it,
  // what it shows, and the tags after it.
  const out = [];
  lines.forEach((line, li) => {
    const units = line.match(/&[#\w]+;|[\s\S]/gu) ?? [];
    const base = out.length;
    for (const u of units) out.push({ pre: [], t: u, post: [], src: u.length });
    const stack = [];
    // Open `a` and close it after unit `b`, hiding both sets of asterisks. `b` null is the end of
    // the paragraph, where there is no closer to hide.
    const pair = (a, b, kind) => {
      out[base + a.i].pre.push(kind);
      if (kind !== 'q') for (let k = 0; k < a.len; k++) out[base + a.i + k].t = '';
      if (b == null) { out[base + units.length - 1].post.push(kind); return; }
      out[base + b].post.unshift(kind);
      if (kind !== 'q') for (let k = 0; k < a.len; k++) out[base + b - k].t = '';
    };
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u === '*') {
        let len = 1; while (units[i + len] === '*') len++;
        const prev = units[i - 1], next = units[i + len];
        const canOpen = !blank(next) && !word(prev), canClose = !blank(prev) && !word(next);
        const kind = len === 1 ? 'em' : len === 2 ? 'strong' : null;
        const at = kind && canClose ? stack.findLastIndex((s) => s.kind === kind) : -1;
        if (at >= 0) { pair(stack[at], i + len - 1, kind); stack.length = at; }
        else if (kind && canOpen) stack.push({ kind, i, len });
        i += len - 1;
        continue;
      }
      const curlyOpen = u === '\u201c', curlyClose = u === '\u201d';
      if (!curlyOpen && !curlyClose && u !== '&quot;') continue;
      const prev = units[i - 1], next = units[i + 1];
      const canOpen = curlyOpen || (u === '&quot;' && !blank(next) && !word(prev));
      const canClose = curlyClose || (u === '&quot;' && !blank(prev) && !word(next));
      const at = stack.findIndex((s) => s.kind === 'q');
      if (canClose && at >= 0) { pair(stack[at], i, 'q'); stack.length = at; }
      // A second opening quote while one is open: the first was never closed, so it is literal.
      else if (canOpen) { if (at >= 0) stack.length = at; stack.push({ kind: 'q', i, len: 1 }); }
    }
    // What is still open at the end of the paragraph, closed innermost first.
    const nextLine = lines.slice(li + 1).find((l) => l.trim());
    const keep = !done && li === lines.length - 1 ? stack
      : stack.filter((s) => s.kind === 'q' && opensQuote(nextLine));
    keep.toReversed().forEach((s) => pair(s, null, s.kind));
    if (li < lines.length - 1) out.push({ pre: [], t: '\n', post: [], src: 1 });
  });
  if (!cuts) return out.map((u) => u.pre.map((k) => OPEN[k]).join('') + u.t + u.post.map((k) => CLOSE[k]).join('')).join('');
  // One piece per cut. What is open at a cut is closed at the end of the piece before it and opened
  // again at the start of the piece after, so every piece is complete markup on its own.
  const pieces = [];
  let cur = '', at = 0, c = 0;
  const open = [], marks = [...cuts].sort((a, b) => a - b);
  for (const u of out) {
    for (; c < marks.length && marks[c] <= at; c++) if (marks[c] > 0) {
      pieces.push(cur + open.toReversed().map((k) => CLOSE[k]).join(''));
      cur = open.map((k) => OPEN[k]).join('');
    }
    for (const k of u.pre) { cur += OPEN[k]; open.push(k); }
    cur += u.t;
    for (const k of u.post) { cur += CLOSE[k]; open.pop(); }
    at += u.src;
  }
  return [...pieces, cur];
}

/* #122 · ONE WORD-LEVEL DIFF for every place a thread or a Voice changes: a thread's Alterations,
 * the Workbench cards, Talk's change lines, the Voice choice. Seth, 2026-10-28: "we need some
 * diffing for thread changes and in this case the voice". One function and one rendering
 * (`diffHTML`), so the four places cannot disagree about what changed.
 *
 * A TOKEN is a word (letters and digits, with an apostrophe inside it: "don't" is one word), one
 * mark of punctuation, or a run of white space. Punctuation is its own token so "ran." to "ran!"
 * marks the stop and not the word. The longest common run of tokens is kept; what is left of the
 * old text is removed, what is left of the new is added. A moved sentence therefore reads as
 * removed where it was and added where it went, which is what happened to the text.
 *
 * The result is a list of `{ op, text }`, op `=` kept, `-` removed, `+` added. Kept and removed
 * spell the old text exactly, kept and added the new; test/diff.ts holds that both ways. Within one
 * changed stretch the removed text comes first, then the added, each as one piece, and a single
 * space shared between two changed words is folded into the change, so "the cat" to "a dog" reads
 * as one removal and one addition, not word, space, word. */
const DIFF_TOKEN = /\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;
// ponytail: an O(n·m) table, capped at four million cells (a 2,000-word stretch changed against
// another) after the shared start and end are trimmed off; past that the stretch is shown as all
// removed and all added. A Myers diff if a real thread ever reaches it.
const DIFF_CELLS = 4e6;
export function wordDiff(a, b) {
  const x = String(a ?? '').match(DIFF_TOKEN) ?? [], y = String(b ?? '').match(DIFF_TOKEN) ?? [];
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const xs = x.slice(pre, x.length - suf), ys = y.slice(pre, y.length - suf);
  const n = xs.length, m = ys.length, w = m + 1;
  const toks = x.slice(0, pre).map((text) => ({ op: '=', text }));
  if (n * m > DIFF_CELLS) {
    toks.push(...xs.map((text) => ({ op: '-', text })), ...ys.map((text) => ({ op: '+', text })));
  } else {
    // L[i][j]: the longest common run of xs[i..] and ys[j..].
    const L = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i * w + j] = xs[i] === ys[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (xs[i] === ys[j]) { toks.push({ op: '=', text: xs[i] }); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) toks.push({ op: '-', text: xs[i++] });
      else toks.push({ op: '+', text: ys[j++] });
    }
    while (i < n) toks.push({ op: '-', text: xs[i++] });
    while (j < m) toks.push({ op: '+', text: ys[j++] });
  }
  toks.push(...x.slice(x.length - suf).map((text) => ({ op: '=', text })));
  // A lone shared space between two changes belongs to the change: removed and added both.
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const fold = t.op === '=' && !t.text.trim() && toks[k - 1] && toks[k - 1].op !== '=' && toks[k + 1] && toks[k + 1].op !== '=';
    if (fold) out.push({ op: '-', text: t.text }, { op: '+', text: t.text });
    else out.push(t);
  }
  // Join: each kept stretch as one piece, each changed stretch as its removal then its addition.
  const pieces = [];
  for (let k = 0; k < out.length;) {
    if (out[k].op === '=') {
      let text = '';
      while (k < out.length && out[k].op === '=') text += out[k++].text;
      pieces.push({ op: '=', text });
    } else {
      let del = '', add = '';
      while (k < out.length && out[k].op !== '=') { if (out[k].op === '-') del += out[k].text; else add += out[k].text; k++; }
      if (del) pieces.push({ op: '-', text: del });
      if (add) pieces.push({ op: '+', text: add });
    }
  }
  return pieces;
}

/** THE ONE RENDERING of a diff, as a Was / Now switch (Seth, 2026-10-29: option D of the design
 *  canvas). It opens on Now, the text as it will read, with the added words in `<ins>`; Was is the
 *  text as it read, with the removed words in `<del>`. Unmarked on screen since 2026-11-01 (Seth: the
 *  Was and Now buttons are how the change is seen); the tags stay for a screen reader. Both views are drawn and the wrapper's
 *  `data-view` picks one in the stylesheet, so a press (`data-diffview`, app.js) repaints nothing.
 *  Identical text is plain text with no switch. All escaped; it wraps anywhere, so a long word cannot
 *  push a 390px phone sideways. */
export const diffHTML = (a, b) => {
  const parts = wordDiff(a, b);
  if (!parts.some((p) => p.op !== '=')) return `<div class="diff"><p class="dnow">${esc(b)}</p></div>`;
  const side = (keep, tag, none) => {
    const html = parts.filter((p) => p.op === '=' || p.op === keep)
      .map((p) => (p.op === '=' ? esc(p.text) : `<${tag}>${esc(p.text)}</${tag}>`)).join('');
    return html.trim() ? html : `<span class="dnone">${none}</span>`;
  };
  return `<div class="diff" data-view="now"><div class="diffswitch" role="group" aria-label="Show the text before or after">`
    + `<button type="button" data-diffview="was" aria-pressed="false">Was</button>`
    + `<button type="button" data-diffview="now" aria-pressed="true">Now</button></div>`
    + `<p class="dnow">${side('+', 'ins', 'Nothing')}</p><p class="dwas">${side('-', 'del', 'Nothing yet')}</p></div>`;
};

/** #122 · A THREAD'S ALTERATIONS AS PAIRS: each earlier version (`was`) and the version that replaced
 *  it (`now`). `rows` is `db.entryHistory`, newest first, so a field's next version is the nearest
 *  newer row for that field, else the thread as it stands. Wake words are stored as JSON and read
 *  here as the words. `now` is null when there is nothing to read against: a pocket since deleted,
 *  or no thread in hand. */
export function historyPairs(rows, e) {
  const list = Array.isArray(rows) ? rows : [];
  const shown = (field, v) => {
    if (v == null) return null;
    if (field !== 'keys') return String(v);
    if (Array.isArray(v)) return v.join(', ');
    try { const k = JSON.parse(v); return Array.isArray(k) ? k.join(', ') : String(v); } catch { return String(v); }
  };
  const current = (field) => {
    if (!e) return null;
    if (String(field).startsWith('pocket:')) {
      const id = String(field).slice(7);
      return [...(e.addons ?? []), ...(e.outfits ?? [])].find((a) => a.id === id)?.body ?? null;
    }
    return typeof e[field] === 'string' || Array.isArray(e[field]) ? e[field] : null;
  };
  return list.map((h, k) => {
    let next;
    for (let j = k - 1; j >= 0; j--) if (list[j].field === h.field) { next = list[j].previous_value; break; }
    return { ...h, was: shown(h.field, h.previous_value) ?? '', now: shown(h.field, next === undefined ? current(h.field) : next) };
  });
}

// The router answers with two kinds of id and both read as machine noise on a page about a book:
// short aliases from presets.ini — write-nt-qwen36-h — and raw Hugging Face paths like
// HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF:32K, which is 64 characters of it.
//
// A transform rather than a lookup table, so a preset added tonight is named tonight without an
// edit here. `detail` carries what the name drops, and every surface keeps the raw id in a title
// attribute — the id is what you type into ANANSI_MODEL and what the router answers to.
//
// THINKING IS NEVER DROPPED. `t` versus `nt` is the difference between prose and 900 tokens of
// reasoning and no prose at all, so it is spelled out rather than left as a letter, in the
// writer's word for it (#49): "weaves" and "doesn't weave". Only the shown words; the ids keep
// their T and NT.
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
 *  browser then falls back to showing the first one, which is "Default" ("Your model" now), while the hint underneath
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
  // `ready` is false only on a remote model when the server has no Featherless key: it is listed,
  // so the pin is visible, and cannot be chosen.
  const list = (models ?? []).map((m) => ({ value: m.id, status: m.status, gone: false,
    ready: m.ready !== false }));
  const orphan = pinned && !list.some((o) => o.value === pinned)
    ? [{ value: pinned, status: null, gone: true }] : [];
  return [{ value: '', status: null, gone: false }, ...orphan, ...list]
    .map((o) => ({ ...o, selected: o.value === (pinned ?? '') }));
};

// A title that is only the scene's number, in any of the forms Anansi has stored: empty, "Scene 3",
// "Chapter 3", or "Chapter Three" (new tales were created with "Chapter One" until 2026-10-24).
const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const numbered = (t, n) => {
  const v = String(t ?? '').trim().toLowerCase();
  return !v || v === `chapter ${n}` || v === `scene ${n}` || (!!NUMBER_WORDS[n] && v === `chapter ${NUMBER_WORDS[n]}`);
};
export const sceneName = (c) => (c && !numbered(c.title, c.index) ? c.title.trim() : `Scene ${c?.index ?? ''}`);


/** HOW A MODEL PLANS, in the writer's words: "never plans", "can plan", "always plans" (Seth,
 *  2026-10-24). The catalogue and the shortlist store "weaves" (the server's values, kept in the
 *  database and sent back as the filter). Only the shown words change; the value stays. */
export const spinWord = (w) => ({ "doesn't weave": 'never plans', 'can switch': 'can plan',
  'always weaves': 'always plans' })[w] ?? w;

export const modelName = (id) => {
  if (!id) return { name: 'no model', detail: '', id: '', bits: [], size: '' };
  const alias = /^(write|rp|agentic)-(n?t)-([a-z0-9]+)-([a-z0-9]+)$/.exec(id);
  if (alias) {
    const [, role, think, family, tail] = alias;
    const bits = [think === 't' ? 'plans' : 'never plans', tail === 'h' ? 'uncensored' : tail];
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
      if (think === 'T') bits.push('plans');
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
  // A remote id is a Featherless repo path behind REMOTE_PREFIX, which says where the model runs
  // and is not part of its name. Split on the colon as it stands and every remote model would be
  // called "featherless".
  const [repo, quant] = (whereRuns(id).remote ? id.slice(REMOTE_PREFIX.length) : id).split(':');
  const org = repo.includes('/') ? repo.split('/')[0].toLowerCase() : '';
  // The org name is often repeated inside the repo name as well, and once is enough.
  const name = (repo.split('/').pop() ?? repo).replace(/[-_]?GGUF$/i, '')
    .split(/[-_]+/).filter((w) => w.toLowerCase() !== org).join(' ');
  return { id, name, detail: quant ?? '', bits: quant ? [quant] : [], size: '' };
};

/** THE PREFIX ON EVERY REMOTE MODEL'S ID: the server's `REMOTE_PREFIX`, which test/app.ts holds
 *  this equal to. The browser decides remote-ness through `whereRuns` and nowhere else. */
export const REMOTE_PREFIX = 'featherless:';

/** WHERE A MODEL RUNS, AND WHETHER IT IS AWAKE (#53). The prefix decides the source, here as on
 *  the server. A local model is awake only when the router says `loaded`: one still loading, or
 *  one the router cannot describe, is not yet writing at speed. A remote model is always shown
 *  awake, because Featherless shows no sleeping state a writer could act on. */
export const whereRuns = (id, status) => {
  const remote = String(id ?? '').startsWith(REMOTE_PREFIX);
  const awake = remote || status === 'loaded';
  return { remote, awake, glyph: remote ? 'feather' : 'spider',
    words: remote ? 'remote, on Featherless' : `local, ${awake ? 'awake' : 'asleep'}` };
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
  'Qwen3.6': 'The house model. 35B with 3B active, so it writes at roughly twelve times the '
    + 'speed of the dense models here and still scored write 8/10 in the 2026-08-27 bakeoff. Its '
    + 'one documented quirk is person: it was the only model in that bakeoff that did not hold '
    + 'the person constraint.',
  'Gemma 4': 'Write 8/10 and roleplay 7/10 in the 2026-08-27 bakeoff, and the only model in it '
    + 'that violated no constraint at all. Same prose score as Qwen3.6 at a fraction of the speed.',
  'Artemis 1.1': 'The same Gemma 4 base, decensored by roleplay finetune rather than by ablation '
    + '— it is on the box so that the method is the only variable between the two. Best '
    + 'register match in the 2026-08-27 bakeoff.',
  'GLM 4.7 Flash': 'A model that plans first, and honours enable_thinking:false, the switch that stops it, verified on this box '
    + '2026-08-26. Left planning, it returned 3,741 characters of plan and empty prose to a '
    + 'two-sentence ask. Anansi sends the switch on every call.',
  'Ornith 1.0': 'The same architecture and quant as Qwen3.6, abliterated rather than finetuned, '
    + 'carried as the controlled test where ablation is the only variable. Ablation removes '
    + 'refusals; it does not move a model’s prose.',
  'Harbinger': 'Mistral-Small 24B, trained by LatitudeGames for multi-turn adventure — this '
    + 'is what AI Dungeon serves on its premium tier. In the bakeoff it wrote in AI Dungeon’s '
    + 'frame rather than the character card’s, and omitted the header the write task required.',
  'Wayfarer 2': 'Mistral-Nemo 12B, trained on text adventures where a character can fail and take '
    + 'injury; nothing else here is trained for that. Held at 32k rather than its advertised 128k. '
    + 'It returned 392 words against a 600–800 floor in the bakeoff.',
  'Muse': 'The same Nemo 12B base as Wayfarer-2, trained instead for long emotional narrative and '
    + 'relational continuity, with the common AI cliches stripped from its data. Beside '
    + 'Wayfarer-2 so the finetune is the only variable.',
  'Qwen3.8': 'A HauhauCS uncensored finetune rather than an ablation. 27.8B dense, so every '
    + 'parameter moves per token: 12.7 tok/s measured against Qwen3.6’s 51.9. It earns its '
    + 'place on vision and on a newer base, never on throughput.',
  'Huihui ThinkingCap': 'An abliterated Qwen3.6 27B with speculative decoding. It plans in the '
    + 'open, and enable_thinking:false is UNTESTED on this architecture — which for prose '
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
/** A THREAD'S KIND, AS A COLOUR (Seth, 2026-11-01): the bar of threads sent now and the counts under
 *  it. Fixed, as BLOCK_COLOR is, so one kind is one colour on every theme. */
export const KIND_COLOR = { character: '#D98B6A', place: '#7FB083', lore: '#9A86C8', item: '#6FA3C0' };

/** THE THREADS A CALL HOLDS, off its manifest: in the kinds' order and always-on first within a kind,
 *  each with whether a word woke it. A thread pushed out for room is not here, and neither is one the
 *  list has no row for. ONE PREDICATE for the bar under a tale's header and the library's hero
 *  (2026-11-02), which reads its kinds off the manifest route rather than a tale's thread list. */
export const sentOf = (mani, entries) => {
  if (!mani) return [];
  const byId = new Map((entries ?? []).map((e) => [e.id, e]));
  return mani.blocks.filter((b) => b.state === 'included' && (b.kind === 'CANON-ALWAYS' || b.kind === 'CANON-TRIGGERED') && byId.has(b.id))
    .map((b) => ({ e: byId.get(b.id), word: b.kind === 'CANON-TRIGGERED' }))
    .sort((a, b) => KINDS.indexOf(a.e.entryType) - KINDS.indexOf(b.e.entryType) || Number(a.word) - Number(b.word));
};

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
  VOICE:             ['Voice',                   'story'],
  STYLE:             ['Genre flavour',           'story'],
  'CANON-ALWAYS':    ['Threads, always on',      'canon'],
  'CANON-TRIGGERED': ['Threads, on a word',      'canon'],
  STRING:            ['Strings in play',         'strings'],
  EARLIER:           ['Scene summaries',         'traj'],
  PROSE:             ['The prose above',         'doc'],
  DIRECTIVE:         ['Point of view & register', 'story'],
  TAIL:              ['Where you left off',      'doc'],
  MODE:              ['The mode you picked',     'doc'],
};

// The decode, ported from the bureau's own effect (astro-bureau-blog, the last script in
// src/layouts/Base.astro): text resolves out of random glyphs rather than fading in. The glyph
// set lives here because it is pure.
export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>*';
export const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// THEMES. One row per theme, and every token below is derived from it.
//
// Straight from the design's own theme() function, and the reason it is a table rather than nine
// blocks of CSS is written into that design: "a new theme cannot ship half-applied — which is how
// the rail and the panel stayed near-black on Parchment while the document turned to paper." The
// app had exactly that shape before this: three hand-written blocks, and the light one had to
// restate the greys and the gold by hand or render dark text on light ground.
// ---------------------------------------------------------------------------
/* EVERY THEME WEARS AN ARCANE NAME (Seth, 2026-11-03: "rename every theme's label to an arcane
 * name"). The label is what Look shows; the key is what a saved look holds, so a key never changes.
 * Each is the tarot card whose colour and temper the theme has:
 *   arcana    The Magician's Gold   I, will made into gold-work; the shipped theme, black and gilt.
 *   grimdark  The Tower             XVI, ruin and ash, lit by copper fire.
 *   scifi     The Star              XVII, cold blue light over still water.
 *   romance   The Lovers            VI, the rose of two people choosing each other.
 *   silver    The Moon              XVIII, moonlight: silver and graphite, no colour at all.
 *   amethyst  The High Priestess    II, the violet of the veil and what is kept behind it.
 *   crimson   The Emperor           IV, Aries and Mars: red, the colour of rule and of war.
 *   emerald   The Empress           III, Venus: green, the growing world.
 * INK LEFT ON 2026-11-03: Arcana is the same black with the same gold, so a look saved as Ink reads as
 * Arcana (THEME_WAS, below). Arcana's styling is under every theme, so a row is colours only. */
export const THEMES = {
  /* ARCANA (Seth, 2026-11-03): "black grey and gold ... the gold and filigree ... the texture of
   * things ... tarot, arcane", painted like a watercolour brush, with art deco in the ornament. The
   * shipped theme. Since the same day its frames, ornament and faces are the app's under every theme
   * (app.html, the ARCANA block), so this row, like every other, is colours only. */
  arcana:    { label: "The Magician's Gold", dark: 1, swatch: '#0B0B0C', ink: '#E6E2DA', paper: '#0B0B0C', rail: '#0C0C0E', sheet: '#111113',
               accent: '#C8A252', warn: '#C8705A', good: '#8FAE9A', speak: 'rgba(196,192,184,.34)',
               wash: 'linear-gradient(180deg,#0E0E10,#08080A 60%)' },
  grimdark:  { label: 'The Tower',   dark: 1, swatch: '#0C0C0C', ink: '#D2CFCA', paper: '#0C0C0C', rail: '#0B0B0B', sheet: '#111111',
               /* #AA6A53, a shade up from #A8674F (2026-11-03): the words on its press measured 4.36:1. */
               accent: '#AA6A53', warn: '#9E4632', good: '#6E8069', speak: 'rgba(160,150,145,.3)',
               wash: 'linear-gradient(180deg,#121211,#090909 65%)' },
  scifi:     { label: 'The Star',    dark: 1, swatch: '#08090C', ink: '#DCE4EC', paper: '#08090C', rail: '#090B0F', sheet: '#0D1015',
               accent: '#8FB8D9', warn: '#D98A6A', good: '#7FB8A8', speak: 'rgba(143,184,217,.36)',
               wash: 'radial-gradient(60% 40% at 50% 0%, rgba(143,184,217,.13), transparent 72%), linear-gradient(180deg,#0C1016,#07080B 55%)' },
  romance:   { label: 'The Lovers',  dark: 1, swatch: '#140E13', ink: '#F0E2E4', paper: '#140E13', rail: '#160F15', sheet: '#1B131A',
               accent: '#D98AA0', warn: '#C4667C', good: '#8FB89C', speak: 'rgba(217,138,160,.4)',
               wash: 'radial-gradient(60% 45% at 28% 0%, rgba(190,110,140,.22), transparent 70%), linear-gradient(180deg,#1D1420,#100B10 55%)' },
  /* SILVER: graphite and silver, no colour. The accent is silver; only `good` and `warn` keep a trace
   * of hue, because a state has to be told apart and the two model circles need a hue to turn. */
  silver:    { label: 'The Moon',    dark: 1, swatch: '#0C0C0D', ink: '#E2E3E6', paper: '#0C0C0D', rail: '#0D0D0F', sheet: '#131315',
               accent: '#C3C7CF', warn: '#B98479', good: '#8EA79B', speak: 'rgba(205,207,212,.34)',
               wash: 'radial-gradient(60% 40% at 50% 0%, rgba(200,204,212,.10), transparent 72%), linear-gradient(180deg,#111113,#09090A 60%)' },
  /* AMETHYST: violet on a near-black with violet in it. */
  amethyst:  { label: 'The High Priestess', dark: 1, swatch: '#0F0B13', ink: '#ECE4F2', paper: '#0F0B13', rail: '#110C16', sheet: '#16111C',
               accent: '#B99BE8', warn: '#D7748E', good: '#8DBBA2', speak: 'rgba(185,155,232,.38)',
               wash: 'radial-gradient(60% 45% at 50% 0%, rgba(150,110,210,.18), transparent 70%), linear-gradient(180deg,#17111D,#0B080E 55%)' },
  /* CRIMSON: red on a near-black with red in it. `warn`, the colour that says something is wrong,
   * is amber here, because a red one would be the accent. */
  crimson:   { label: 'The Emperor', dark: 1, swatch: '#110A0A', ink: '#F0E3E0', paper: '#110A0A', rail: '#130B0B', sheet: '#191010',
               accent: '#E2645C', warn: '#E09A58', good: '#8FB89C', speak: 'rgba(226,100,92,.36)',
               wash: 'radial-gradient(60% 45% at 50% 0%, rgba(190,50,45,.20), transparent 70%), linear-gradient(180deg,#1A0F0F,#0C0707 55%)' },
  /* EMERALD: green on a near-black with green in it. `good`, the awake and done colour, leans to
   * teal so it is not the accent. */
  emerald:   { label: 'The Empress', dark: 1, swatch: '#08100D', ink: '#E2EEE8', paper: '#08100D', rail: '#09120F', sheet: '#0E1814',
               accent: '#52C793', warn: '#DA7A5C', good: '#8CC2C6', speak: 'rgba(82,199,147,.36)',
               wash: 'radial-gradient(60% 45% at 50% 0%, rgba(50,160,110,.18), transparent 70%), linear-gradient(180deg,#0E1915,#060B09 55%)' },
};

/** THE APP'S DISPLAY FACES: thin deco capitals for titles, a geometric sans for labels (Arcana, Seth,
 *  2026-11-03). Every theme's, since the ornament is every theme's; fetched once by `loadFaces`. The
 *  prose keeps whatever font the writer chose. */
export const FACES = 'Poiret+One&family=Josefin+Sans:wght@400;600';

/** THE PAPER'S GRAIN, the painted canvas laid over every theme's own page wash: neutral light and
 *  shade, no colour of its own, so it is the same paper under any colour set. */
const GRAIN = "url('/web/arcana-canvas.svg') center / cover no-repeat";

/** A POCKET'S RANK IN ITS SUIT (Seth, 2026-11-03: "pockets are the Minor Arcana"). The nth pocket of
 *  one kind on a thread, counted as a suit is: Ace, II to X, then Page, Knight, Queen and King for 11
 *  to 14, and past the King the numerals run on. The suit itself is the kind's, in the one table in
 *  app.html (`--suit`, keyed on data-arcana). */
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export const roman = (n) => ROMAN.reduce((out, [v, r]) => { while (n >= v) { out += r; n -= v; } return out; }, '');
export const minorRank = (n) => (n === 1 ? 'Ace' : n >= 11 && n <= 14 ? ['Page', 'Knight', 'Queen', 'King'][n - 11] : roman(n));

/** THEMES THAT LEFT THE LIST, and the one each look now reads as (2026-11-02: Obsidian, Parchment,
 *  Cyberpunk, Fantasy and Novelist removed at Seth's word). A look saved on a device, a tale or a
 *  writer's default still names the old key; any key not in THEMES reads as Arcana, the shipped one
 *  (2026-11-03; it was Ink). Ink itself left on 2026-11-03: Arcana is its black and its gold. */
const THEME_WAS = { cyberpunk: 'scifi', ink: 'arcana' };
export const themeNow = (key) => (THEMES[key] ? key : THEME_WAS[key] ?? 'arcana');

/** Blend two hex colours. The design's own mix(), unchanged. */
const mix = (hex, over, a) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex), [r2, g2, b2] = p(over);
  const f = (x, y) => Math.round(x + (y - x) * a);
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`;
};

/** THE SAME COLOUR AT FULL STRENGTH — the theme's hue with its transparency dropped.
 *
 *  `mix` above reads `#rrggbb` and nothing else, which is why the four press accents are used raw:
 *  a theme is free to give one of them an `rgba()`, and every `speak` in the table is one, because
 *  it was chosen as a THREE-PIXEL RULE. As a rule it reads. As 11px text it measured 1.82:1
 *  against the dock on 2026-09-02, where 4.5 is the floor — so the composer's mode dial, which
 *  wears the accent of the press it is showing, could not use the token as it stands.
 *
 *  DROPPED, NOT COMPOSITED, and the first version of this did composite it onto the paper: that
 *  reproduces exactly what the eye already sees behind a translucent rule — rgb(98,41,67) — and
 *  measured the same 1.82:1. Alpha is the thing making it unreadable, so alpha is the thing that
 *  goes. At full strength the same colour measures 5.58:1.
 *
 *  An already-opaque colour comes back untouched, which is every other accent in every shipped
 *  theme: act, direct and narrate measured 5.58 to 11.48 and none of them changes by a byte.
 */
const opaque = (c) => {
  const n = String(c).match(/[\d.]+/g)?.map(Number);
  if (String(c).startsWith('#')) return c;
  if (!n || n.length < 4) return c;
  return `rgb(${n[0]},${n[1]},${n[2]})`;
};

/** THE SAME COLOUR ON THE FAR SIDE OF THE WHEEL: its hue turned 180 degrees, its saturation and
 *  lightness kept. Reads `#rrggbb`, like `mix`, which is what every theme's `good` is. */
const opposite = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2, d = hi - lo;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h0 = !d ? 0 : hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const h = ((h0 * 60 + 360) % 360 + 180) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `rgb(${[R, G, B].map((v) => Math.round((v + m) * 255)).join(',')})`;
};

/** A COLOUR THAT IS NONE OF THE OTHERS (2026-10-29, for Woven). Seth: what the model writes "shouldn't
 *  conform to any used accent from the actions". The theme table has no column for it, and each
 *  theme's accents sit in different places on the wheel, so it is searched for, not picked: around
 *  the wheel in 15-degree steps at three lightnesses, every candidate that reads as a mark on the
 *  paper (3:1, the floor for a line that is not text), and the one farthest from the nearest colour
 *  in `avoid`. Deterministic: the same theme gives the same colour every time. */
const rgbOf = (c) => {
  const s = String(c).trim();
  if (s.startsWith('#')) return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  return (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
};
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const hsl = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [R, G, B].map((v) => Math.round((v + m) * 255));
};
const apart = (avoid, paper, dark) => {
  const bg = lum(rgbOf(paper)), others = avoid.map(rgbOf);
  let best = null, far = -1;
  for (const l of dark ? [0.58, 0.66, 0.74] : [0.3, 0.38, 0.46])
    for (let h = 0; h < 360; h += 15) {
      const c = hsl(h, 0.42, l), y = lum(c);
      if ((Math.max(y, bg) + 0.05) / (Math.min(y, bg) + 0.05) < 3) continue;
      const near = Math.min(...others.map((o) => Math.hypot(c[0] - o[0], c[1] - o[1], c[2] - o[2])));
      if (near > far) { far = near; best = c; }
    }
  return `rgb(${best.join(',')})`;
};
/** A COLOUR THAT READS AS SMALL TEXT: `c` leaned toward `ink` in 5% steps until it clears 4.5:1 on
 *  every one of `grounds`. The colour itself when it already does; the ink if nothing short of it does. */
const legible = (c, ink, grounds) => {
  const a = rgbOf(c), b = rgbOf(ink), ys = grounds.map((g) => lum(rgbOf(g)));
  for (let i = 0; i <= 20; i++) {
    const m = a.map((v, j) => Math.round(v + (b[j] - v) * i / 20)), y = lum(m);
    if (ys.every((g) => (Math.max(y, g) + 0.05) / (Math.min(y, g) + 0.05) >= 4.5)) return `rgb(${m.join(',')})`;
  }
  return ink;
};

/** Every custom property a theme sets, derived from its row.
 *
 *  "toward" brightens the ink; "away" fades it toward the paper. Fading toward black on a light
 *  theme is what made every hint sentence a mid-grey on cream — the design says so in as many
 *  words, and the app had the bug it describes.
 */
export function themeVars(key) {
  const S = THEMES[themeNow(key)];
  const toward = S.dark ? '#FFFFFF' : '#000000';
  const away = S.paper;
  const woven = apart([opaque(S.speak), opaque(S.good), mix(S.accent, away, .22), opaque(S.warn),
    mix(S.ink, away, S.dark ? .42 : .28), mix(S.good, toward, .12), mix(S.accent, S.ink, .15)], S.paper, S.dark);
  return {
    '--doc-bg': S.paper, '--doc-wash': `${GRAIN}, ${S.wash}`, '--rail': S.rail, '--sheet': S.sheet,
    '--body': S.ink, '--ink': S.ink,
    '--ink-bright': mix(S.ink, toward, .35),
    '--narr': mix(S.ink, away, .16),
    // A hint is the sentence telling you what a control does, so it clears 4.5:1 by construction
    // rather than by inspection. Paper is bright, so ink fades faster against it: a light theme
    // needs a shorter fade to hold the contrast a dark one gets for free.
    '--label': mix(S.ink, away, S.dark ? .34 : .2),
    '--mute': mix(S.ink, away, S.dark ? .34 : .2),
    // 11px text wears these two ("hold to talk", "on this machine", the help marks), so they clear
    // 4.5:1 too, on the paper, the sheet and the rail. At .5 and .32 they measured 3.70:1 on
    // grimdark's sheet (UX review, 2026-10-29); .42 and .26 is the least fade that clears every
    // theme, and it stays fainter than `--label`. test/app.ts checks all three grounds.
    '--dim': mix(S.ink, away, S.dark ? .42 : .26),
    '--faint': mix(S.ink, away, S.dark ? .42 : .26),
    '--ink-ghost': mix(S.ink, away, S.dark ? .62 : .44),
    '--rule': S.dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.11)',
    '--line': S.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)',
    '--edge': mix(S.rail, toward, .11),
    '--edge-lit': mix(S.rail, toward, .22),
    '--chip': mix(S.rail, toward, .14),
    '--field': mix(S.sheet, away, .35),
    '--gold': S.accent, '--gold-dim': mix(S.accent, away, .22),
    '--gold-lit': mix(S.accent, toward, .3),
    /* ACCENTED PROSE (2026-10-29, `accent`): quoted speech and **strong** in `--accent-said`, *em*
     * in `--accent-soft`. Both lean the accent toward the ink, which is what keeps them readable as
     * body text: grimdark's own accent measures 4.39:1 on its paper, and `--gold-dim` (toward the
     * paper) measured 3.10 there and 3.72 on parchment. 15% ink clears 5.2:1 on every theme; the
     * soft one is 40% ink, so it is nearer the prose colour and higher still. test/app.ts checks
     * 4.5 on every theme. */
    '--accent-said': mix(S.accent, S.ink, .15), '--accent-soft': mix(S.accent, S.ink, .4),
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
    /* THE SAME FOUR AS INK. The margin rules use the four above at 3px, where a translucent one
     * reads; the composer's dial wears them as 11px text, where obsidian's speak measured 1.82:1.
     * See `opaque`: only the transparency is dropped, so these are the same colours and not new
     * ones, and three of the four are byte-identical to the line above in every shipped theme. */
    '--m-speak-ink': opaque(S.speak), '--m-act-ink': opaque(S.good),
    '--m-direct-ink': mix(S.accent, away, .22), '--m-narrate-ink': opaque(S.warn),
    /* A FIFTH, 2026-09-01. Seth: "for continues border i mean the accent border at the side
     * everything else has a colored border but not continue."
     *
     * He is right and it was a hole rather than a decision: the class is chosen from `MODES`, which
     * is the FOUR BUTTONS in the composer, and Continue is a press beside them rather than one of
     * them — so a passage it wrote fell through and got no accent at all. It is also the most common
     * passage in any book, so the one shape with no mark was the one you see most.
     *
     * Derived like the other four rather than added to the theme table, for the reason above them:
     * nineteen themes, and one that ships four of five accents is the half-applied failure THEMES
     * exists to prevent. Off the INK rather than off the accent, and that is the argument for this
     * colour: the other four say a writer chose something, and Continue is the model carrying on by
     * itself. It should read as the page's own voice, not as a fifth decision. */
    '--m-continue': mix(S.ink, away, S.dark ? .42 : .28),
    /* A SIXTH, for a passage written by the other person in a co-op book. Off the GOOD colour
     * rather than off the ink or the accent, and that is the argument for it: the other five say
     * which press produced a passage, and this one says a second writer did — it should read as a
     * different hand, not as a different setting. */
    '--m-coop': mix(S.good, toward, .12),
    /* WOVEN, what the model wrote, whatever press asked for it (2026-10-29). Not an action, so not
     * an action's colour: the colour farthest from all six press accents and from the accent the
     * prose highlights speech in (`apart`). Its own label is "Woven". */
    '--m-woven': woven,
    /* ITS WORDS, the chip over the passage (UX review, 2026-10-29). The bar was searched for at the
     * 3:1 a line needs, and the chip is 11px text: 2.67:1 on parchment. The same colour leaned
     * toward the ink until it reads as text on the paper and the sheet (`legible`). */
    '--m-woven-ink': legible(woven, S.ink, [S.paper, S.sheet]),
    /* WHERE A MODEL RUNS (#53): the circle on every model row. Local is the theme's own `good`,
     * the colour the awake dot already had, so a local model looks as it did. Remote is that same
     * colour turned to the far side of the colour wheel, at the same saturation and lightness, so
     * the two are as far apart in hue as a theme allows and the remote one reads as well on the
     * rail as the local one does. No theme's existing colours could serve: in five of the nine,
     * two of the accent, the speech colour and `good` share a hue. */
    '--src-local': S.good, '--src-remote': opposite(S.good),
    // (--speak-tint / --act-tint lived here. Removed 2026-08-27: only one of the pair was
    // visible, so the row read as broken rather than as distinguishing the two modes.)
    // (--head, --dock and --panel-line lived here. Removed 2026-09-05: no rule anywhere named any
    //  of them. Checked with `grep -rn 'var(--head)' app.html web/` and the same for the other two,
    //  all three of which matched NOTHING — not read off a document, which had them listed as an
    //  open question guarded by a hardcoded list. That list is `NEEDED` in test/app.ts and it is a
    //  COMPLETENESS check — every theme must set every token in it — so it never guarded these
    //  three against removal, it only required all nine themes to keep computing them.
    //
    //  `--dock` is the one worth naming. app.html carried a note saying it "survives for the big
    //  composer, which IS the page", and that stopped being true when the background moved to
    //  `#ghost.veil` — recorded thirty lines further down in app.html's own past tense, "It was
    //  `--dock`". The token outlived its last rule and the comment outlived the token.)
    '--chrome': 'transparent',
    '--chrome-ink': mix(S.ink, toward, .35),
    '--chrome-dim': mix(S.ink, away, .42),
    '--chrome-line': S.dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)',
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
  // menu, and the whole thing reads as his. Circles are arcs so `mark()` can draw them: it splits
  // on a capital M and hands each piece to a <path>, which a <circle> cannot ride in.
  webfull:  'M10 3.6 10 16.4M3.6 10 16.4 10M5.4 5.4 14.6 14.6M14.6 5.4 5.4 14.6'
          + 'M10 7.8A2.2 2.2 0 1 1 10 12.2A2.2 2.2 0 1 1 10 7.8'
          + 'M10 5.6A4.4 4.4 0 1 1 10 14.4A4.4 4.4 0 1 1 10 5.6'
          + 'M10 3.6A6.4 6.4 0 1 1 10 16.4A6.4 6.4 0 1 1 10 3.6',
  story:    'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3',
  chapter:  'M3 10A7 7 0 0 1 17 10M10 10V3.2',
  // This scene: the Scenes glyph flipped top to bottom, so the two rows that shared one icon can be
  // told apart. Seth 2026-10-25: "flip the icon for this scene vertically in the menu".
  scene:    'M3 10A7 7 0 0 0 17 10M10 10V16.8',
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
  // A THREAD'S MARK in the Threads list (v2 redesign, 2026-10-25): an open eye for always on, a shut
  // one with three lashes for on a word and asleep, and `eyeheard` below for on a word and woken. The shut eye is the same lower lid, so the two
  // read as one eye opening and closing and not as two unrelated marks.
  eye:      'M2.6 10C4.8 6.6 7.2 5.2 10 5.2S15.2 6.6 17.4 10C15.2 13.4 12.8 14.8 10 14.8S4.8 13.4 2.6 10'
          + 'M10 8A2 2 0 1 1 10 12A2 2 0 1 1 10 8',
  eyeshut:  'M2.6 9C4.8 11.6 7.2 12.8 10 12.8S15.2 11.6 17.4 9'
          + 'M5.4 11.4 4.3 13.2M10 12.8V15M14.6 11.4 15.7 13.2',
  // ON A WORD AND WOKEN: the open eye with a speech mark for its pupil, because the thread heard
  // its word (Seth, 2026-10-25). The same outline as `eye`, so the three read as one eye, and the
  // quote is two dots with tails, big enough to stay a quote at the card's 22px on the Titan.
  eyeheard: 'M2.6 10C4.8 6.6 7.2 5.2 10 5.2S15.2 6.6 17.4 10C15.2 13.4 12.8 14.8 10 14.8S4.8 13.4 2.6 10'
          + 'M8.6 10.5A0.75 0.75 0 1 1 8.6 12A0.75 0.75 0 1 1 8.6 10.5M7.9 11.2C7.8 9.8 8.4 8.8 9.4 8.3'
          + 'M11.6 10.5A0.75 0.75 0 1 1 11.6 12A0.75 0.75 0 1 1 11.6 10.5M10.9 11.2C10.8 9.8 11.4 8.8 12.4 8.3',
  // OFF (Seth, 2026-11-01; for the whole tale since 2026-11-02): the open eye, struck through.
  eyeoff:   'M2.6 10C4.8 6.6 7.2 5.2 10 5.2S15.2 6.6 17.4 10C15.2 13.4 12.8 14.8 10 14.8S4.8 13.4 2.6 10'
          + 'M10 8A2 2 0 1 1 10 12A2 2 0 1 1 10 8M3.6 3.6 16.4 16.4',
  // A plus, not an X: the X read as Close on the menu (second usability check, 2026-10-25).
  create:   'M10 3.5v13M3.5 10h13',
  import:   'M10 3A7 7 0 1 1 10 17A7 7 0 1 1 10 3M10 3.6V11M10 11 7.3 8.3M10 11 12.7 8.3',
  prefs:    'M3.2 7.6H16.8M3.2 12.4H16.8M7.6 5.4V9.8M12.4 10.2V14.6',
  // Help. A quadrant of the orb-web itself — three radials and two spirals — which is the house
  // metaphor rather than a question mark borrowed from somebody else's icon set.
  web:      'M10 10 5.05 5.05M10 10 10 3M10 10 14.95 5.05'
          + 'M7.17 7.17A4 4 0 0 1 12.83 7.17M5.05 5.05A7 7 0 0 1 14.95 5.05',
  // Reading mode. An open book: one spine, two leaves falling away from it.
  book:     'M10 5.6V16.2M10 5.6C8.1 4.4 5.6 4.1 3.7 4.3V14.8C5.6 14.6 8.1 14.9 10 16.2'
          + 'M10 5.6C11.9 4.4 14.4 4.1 16.3 4.3V14.8C14.4 14.6 11.9 14.9 10 16.2',
  menu:     'M3 6.5h14M3 10h14M3 13.5h14',
  // REPORT AN ISSUE: a beetle, head, shell split down the back, three legs a side and two feelers
  // (UX review, 2026-10-29). The row named `bug` from the start and no mark had the name, so it
  // fell back to `story`, the same plain circle as the tale's Tale row.
  bug:      'M10 3.8A1.6 1.6 0 1 1 10 7A1.6 1.6 0 1 1 10 3.8'
          + 'M10 7.4C12.6 7.4 13.6 9.6 13.6 12C13.6 14.8 12 16.6 10 16.6C8 16.6 6.4 14.8 6.4 12C6.4 9.6 7.4 7.4 10 7.4'
          + 'M10 9V16.6M6.6 10 4 8.6M6.4 12.4H3.6M6.8 14.6 4.4 16.4M13.4 10 16 8.6M13.6 12.4H16.4M13.2 14.6 15.6 16.4'
          + 'M9 4.2 7.6 2.6M11 4.2 12.4 2.6',
  // THE DEMO LIBRARY: books standing on a shelf, one leaning (UX review, 2026-10-29). It wore the
  // open book, which What changed wears on the same menu.
  shelf:    'M2.8 16.4H17.2M4.4 16.4V5.6H7.2V16.4M8.6 16.4V7.6H11V16.4M12.4 16.4 14.6 7 17 7.6 14.8 16.4',
  // The Workbench: a bench top on two legs, a tool resting on it (2026-10-28; it shared Threads' rings).
  workbench: 'M2.8 9.4H17.2M4.6 9.4V16.2M15.4 9.4V16.2M4.6 13H15.4M7 9.4V6.6H11.4V9.4',
  // Tidy this thread: a broom (#126; three wavy strands until 2026-10-28, which read as water or a
  // menu). A handle down to a binding, and the head fanned out under it with two bristle strokes.
  tidy:     'M15.4 3.2 10 8.6M8.6 7.2 11.4 10'
          + 'M8.6 7.2C6.8 8.6 4.8 9.6 3.2 10.6M11.4 10C10.2 12 9 14.4 7.8 16.4M3.2 10.6C4.4 13 5.6 14.8 7.8 16.4'
          + 'M9.4 8.4 5 12.6M10.4 9.4 6.6 14.6',
  chevron:  'M8 5.5 13 10 8 14.5',
  // WHERE A MODEL RUNS (#53). They ride beside the source circle on the menu rows, the strip and
  // the Storyteller, so the source never rests on colour alone. Drawn for 15px, which is where they
  // sit: a spider is a head, a body and four bent legs a side, few enough strokes that the legs
  // still read as legs at menu size. Local is the spider because the house is his.
  spider:   'M10 5.4A1.5 1.5 0 1 1 10 8.4A1.5 1.5 0 1 1 10 5.4'
          + 'M10 8.6A2.8 2.8 0 1 1 10 14.2A2.8 2.8 0 1 1 10 8.6'
          + 'M8.8 7.2 6.4 5.2 5.6 2.8M7.6 9.8 5 8.4 2.8 9M7.4 11.6 4.8 12.2 3 14.6M8.2 13.4 6.6 15.4 6.4 17.8'
          + 'M11.2 7.2 13.6 5.2 14.4 2.8M12.4 9.8 15 8.4 17.2 9M12.6 11.6 15.2 12.2 17 14.6M11.8 13.4 13.4 15.4 13.6 17.8',
  // Remote is the feather: it comes from somewhere else, by air. A shaft, the two edges of its
  // vane meeting at the tip, and one notch cut into the vane so it reads as a feather and not a leaf.
  feather:  'M4 16.8C7.6 13 11.4 8.8 16.2 3.4'
          + 'M16.2 3.4C11.6 4.2 7.8 7.6 7.2 13.4M16.2 3.4C16.2 8.2 13 11.8 7.2 13.4'
          + 'M12.2 7.6 14.8 8.2',
  // THE QUILL, the middle of the bar at the foot of the writing screen (#71, round two): the button
  // that opens the box to write in. A feather like the one above, cut as a pen: a longer vane with
  // two barbs, and a split nib where the shaft ends. Its own mark and not `feather`, because
  // `feather` already means a remote model on the menu rows and the strip, and one mark with two
  // meanings on one screen is a mark that means neither.
  quill:    'M5.2 14.8C8.4 11 12 7.2 16.4 3.6'
          + 'M16.4 3.6C12.2 4 8.6 7 7.6 12.4M16.4 3.6C16.6 8 13.6 11.4 7.6 12.4'
          + 'M11.6 6.6 13.4 7.4M10 8.6 11.8 9.6'
          + 'M5.2 14.8 3.4 16.6M3.4 16.6 4.6 17.2M3.4 16.6 2.8 15.4',
  // A BULB, for Anansi's ideas (#71, round two): a round glass on a neck, two rings of the base,
  // and the filament as one short stroke. Drawn from the same arcs as `story`.
  bulb:     'M7.4 12.6A4.6 4.6 0 1 1 12.6 12.6L12.2 14.2H7.8L7.4 12.6'
          + 'M8.2 15.8H11.8M8.8 17.4H11.2M8.8 10.2 10 11.6 11.2 10.2',
};

/** One mark, at one weight. `size` is the box; the stroke never changes with it — that is what
 *  "one hairline weight" means and what a scavenged glyph set can never do. */
export const mark = (name, size = 19, colour = 'currentColor') =>
  `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="${colour}"
    stroke-width="1.1" stroke-linecap="round" aria-hidden="true"
    style="flex:0 0 auto; overflow:visible">${
      (MARK[name] ?? MARK.story).split('M').filter(Boolean)
        .map((d) => `<path d="M${d}"></path>`).join('')}</svg>`;

/** A passage with every quoted span taken out of it.

 *  Dialogue may lie and characters may be wrong; only the narrator commits the story. Every
 *  quality check in this repo strips speech before it reads anything, and so must every surface
 *  that lifts a line OUT of a passage and prints it somewhere the narrator would stand — a
 *  chapter's epigraph, the shelf's left-off line. Ignoring this produced a long run of false
 *  positives once: a place name, another character's name, a line of dialogue read as a POV break.
 *
 *  ONE definition, because there are now two callers. It was written inline inside `epigraphOf`,
 *  and the shelf needed the same rule — a second copy of a regex this fiddly is a guarantee the
 *  two surfaces will disagree about what counts as speech.
 *
 *  ponytail: the closing class is `["\u201d]` while the opening one is `["\u201c]`, so a passage
 *  that opens and closes with the SAME curly quote is not stripped. Every passage this app writes
 *  is straight-quoted or properly paired; the upgrade is a paired-delimiter scan if an import ever
 *  brings in the other convention.
 */
// Module-private: `leftOffLine` below is the only caller, in this file. Same over-export narrowing as
// `claimedOrigins` in db.ts \u2014 exported, named nowhere outside, so the surface was wider than meant.
const narrationOf = (body) => String(body ?? '').replace(/["\u201c][^"\u201d]*["\u201d]/g, ' ');

/** The last sentences of NARRATION in a passage tail, for the shelf.

 *  `last_body` from `listStories` is the end of the newest passage, prefixed with an ellipsis by
 *  the query when it had to cut. That prefix is why the first match is dropped: `[^.!?]+[.!?]`
 *  happily matches the half-sentence the cut left behind, and printing it starts the writer's own
 *  prose in the middle of a word.
 *
 *  REJECTS WHOLE SENTENCES rather than stripping spans, which is where this differs from
 *  `narrationOf` above and why it does not simply call it. Stripping `"Not tonight," he said.`
 *  leaves ` he said.` — an attribution with its dialogue removed, which then passes every test
 *  and prints on the card as the last thing the writer wrote. A sentence that contains speech is
 *  speech, so the whole sentence goes. The lowercase test catches the same fragment arriving from
 *  a passage that had already been stripped upstream.
 *
 *  Returns '' when the tail is all speech. That is a real state and the caller has to say so out
 *  loud — falling back to the dialogue would print the exact thing this refused.
 */
export const leftOffLine = (body, sentences = 1) => {
  const raw = String(body ?? '');
  const whole = [...raw.matchAll(/[^.!?]+[.!?]/g)].map((m) => m[0].trim());
  if (raw.startsWith('\u2026')) whole.shift();
  return whole.filter((l) => l && !/["\u201c\u201d]/.test(l) && /^[^a-z]/.test(l))
    .slice(-sentences).join(' ');
};

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
    const prose = narrationOf(p?.body);
    for (const m of prose.matchAll(/[^.!?]+[.!?]/g)) {
      const line = m[0].trim();
      if (line.length < 24 || line.length > 90) continue;
      if (/["“”]/.test(line)) continue;
      if (!best || line.length < best.length) best = line;
    }
  }
  return best;
};

/** THE FIRST DRAFT OF A COVER PROMPT, built from the book's own fields. #17.
 *
 *  WRITTEN BY CODE, NOT BY THE MODEL. It is a join of two fields the story already holds, and the
 *  house rule is that if code can answer, code answers — a model call here would cost a load and a
 *  wait to produce a sentence with no judgement in it. The box is editable, so the writer's own
 *  wording beats both.
 *
 *  THE PREMISE IS NOT IN IT, DELIBERATELY. This string leaves the machine: it goes in the URL to
 *  pollinations.ai. A genre and a place are the kind of thing a cover says out loud anyway; the
 *  premise is the book. Only the FIRST sentence of the setting, for the same reason and because
 *  `setting` is four to eight sentences by its own prompt and a URL is not a paragraph.
 *
 *  Returns '' for a story with neither field, and the tray then asks for words rather than sending
 *  a prompt made only of the boilerplate.
 */
export const coverPrompt = (story) => {
  // The split keeps the stop that ended the sentence, and the join below adds another one.
  const place = String(story?.setting ?? '').trim().split(/(?<=[.!?])\s+/)[0].trim()
    .replace(/[.\s]+$/, '');
  const genre = String(story?.genre ?? '').trim();
  if (!place && !genre) return '';
  return [place, genre, 'book cover illustration, painted, no lettering']
    .filter(Boolean).join('. ').slice(0, 300);
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
/** IS THIS BOOK PINNED TO A MODEL THAT IS GONE? #18 §5.
 *
 *  The preset list was renamed on 2026-08-27 and every old id answers `400 model not found`. A book
 *  carrying one is broken and nothing said so outside the Storyteller panel, so it stayed broken
 *  until somebody happened to open both.
 *
 *  ONLY EVER ANSWERED WHEN THE LIST IS KNOWN. `models` is null until something asks the router, and
 *  reading "not asked yet" as "not offered" would put a red mark on every book on the shelf for the
 *  second before the answer lands — the loudest possible way to be wrong. An empty list is the
 *  router being down, or an allowlist matching nothing, which is not this book's fault either.
 *
 *  A book with no pin uses whatever the writer is set to and cannot be broken this way.
 *
 *  Here rather than in `web/app.js` so it can be checked: app.js is imported for its side effects
 *  and exports nothing, so a rule that lives in it can only be tested by driving the whole rail —
 *  and the case that matters most, the list not having arrived, cannot be staged from out there. */
export const pinIsDead = (pin, models) => !!pin && Array.isArray(models) && models.length > 0
  && !models.some((m) => m?.id === pin);

/** THIS WRITER'S MODEL LIST, PLUS THE BOOK'S OWN PIN ROW. A guest in a shared book sees their own
 *  models and their own shortlist, never the owner's, so a book the owner pinned to a remote model
 *  would read as pinned to one nobody offers. The server sends that pin as a row (`pin`) when it is
 *  on the owner's shortlist; the shelf and the Storyteller picker both read the list through this,
 *  so they agree with what writes the book. A list not asked for yet stays null. */
export const withPin = (models, pin) =>
  !pin || !Array.isArray(models) || models.some((m) => m?.id === pin.id) ? models : [...models, pin];

/** `plain` is the writer's version: words instead of tokens (about three words to four tokens), and
 *  no sample count. The admin keeps the machine's numbers. */
export function modelFacts(m, plain = false) {
  const bits = [];
  if (plain) {
    if (m?.perSlot) bits.push(`reads ~${Math.round(m.perSlot * 0.75 / 1000)}k words`);
    if (m?.tps) bits.push(`~${Math.max(1, Math.round(m.tps * 0.75))} words a second`);
    return bits.join(' · ');
  }
  if (m?.perSlot) bits.push(`${Math.round(m.perSlot / 1000)}k each`);
  if (m?.tps) bits.push(`${m.tps} tok/s${m.runs < 5 ? ` (${m.runs})` : ''}`);
  return bits.join(' · ');
}
