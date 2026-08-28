// buildContext — pure. Plain objects in, a manifest out. No database, no network.
// Token counting is injected, which is what keeps it pure and testable with no model.

import { ORDER, CAPS, CANON_KINDS, CANON_CAP_FRAC, EARLIER_CEILING_FRAC, PROSE_CEILING_FRAC } from './blocks.ts';
import type { Block, Kind } from './blocks.ts';

export interface EntryState {
  fromChapter: number;             // the chapter this state opens at
  body: string;
  beforeMode?: 'hide' | 'hint';    // what happens ahead of it opening
  label?: string;
}
export interface Entry {
  id: string; title: string; body: string;
  entryType: 'character' | 'lore' | 'item' | 'rule';
  activation: 'always_on' | 'triggered';
  keys: string[];
  lastEditor: 'human' | 'model';   // decides arbitration (COUNCIL-03 S1)
  states?: EntryState[];           // canon over time — see resolveBody
  // The outfit being worn, if any. A second bracket rather than an edit to the body, so taking
  // the plate off does not require rewriting who she is. PLAN-04 04.
  wearing?: { name: string; body: string } | null;
  stickyFor?: number;              // stays active this many passages after it last fired
  properNouns?: boolean;           // names do not get folded — see fold()
}
export interface Chapter {
  id: string; index: number; title: string; summary?: string; authorsNote?: string;
  summaryStale?: boolean;   // covered prose changed since it was written — excluded, not trusted
  keepWhole?: boolean;      // pulled back in full: send this chapter's prose, not its summary
}
export interface Passage {
  id: string; ordinal: number; body: string; isBreak?: boolean;
  chapterId?: string;              // which chapter it belongs to — decides what stays whole
}
export interface Story {
  title: string; genre: string; premise: string; setting: string;
  pov: string; writingStyle: string; spice: 1 | 2 | 3 | 4 | 5;
  direction?: string;      // the destination. Rides SPINE — see PROMPTS rev 2 §3.
  spiceNote?: string | null;   // a written-out register, replacing the level's fixed line
  // The one the model never writes. Null on every story until somebody names one. A NAME rather
  // than an entry id, because a protagonist with no ledger entry is common in second person.
  lockedCharacter?: string | null;
}
export interface Arc {
  fromChapter: number; toChapter: number; title?: string; summary: string;
}
export interface Input {
  story: Story; chapters: Chapter[]; passages: Passage[]; entries: Entry[];
  arcs?: Arc[];                    // act-level summaries, replacing the chapters they cover
  mode: 'continue' | 'speak' | 'act' | 'direct' | 'narrate' | 'talk';
  directive?: string;
  // Who the last passage belongs to, for speak and act. The writer's own line is already on the
  // page when those two generate, so the model's job is to answer it — and it cannot do that
  // without being told whose line it is.
  speaker?: string;
  pins?: Record<string, 'force_in' | 'force_out'>;   // per-chapter overrides, SPEC §7.4 step 7
  /** A promise the story has made and not paid, and that the writer has put in play. Already
   *  filtered to summoned-and-open by story.ts — the engine does not know what a status means. */
  strings?: { title: string; body?: string; fromChapter?: number | null; owedBy?: number | null }[];
  // The writer's own wording for a mode, replacing the shipped one outright. Arrives HERE rather
  // than being read from a table down in the engine, because buildContext is pure below the line
  // in story.ts and this is a flag like any other.
  modePrompts?: Record<string, string>;
  currentChapter: Chapter;
  budget: number;          // per-slot context, minus output reserve and margin
  tailTokens?: number;     // DIRECTIVE sits this many tokens above the end. P0 finds it.
}

export interface Manifest {
  blocks: Block[];
  totals: { budget: number; used: number; unallocated: number };
  byKind: Record<string, number>;
  overflowed: boolean;
  overflowReason?: string;
}

/** The five levels, re-cut 2026-08-25. Seth: "the spice level prompts should be specific. and
 *  should stay that way. we should plan what the levels are appropriately."
 *
 *  Every level now says the same three things in the same order — what may be on the page, WHERE
 *  THE CAMERA STOPS, and how it is written — because the old lines said them in adjectives and an
 *  adjective is a thing the model reinterprets on every call. "Written with restraint" was read as
 *  "write around it"; "suggestion and aftermath over anatomy" is a craft note being asked to do a
 *  boundary's job. A level is a boundary. The craft belongs to the voice sample.
 *
 *  The ladder is where the camera stops: at the kiss, at the door, in the room, on the act, and
 *  nowhere. Each level is the one before it plus one step, so a story that moves up a level gets
 *  what it had and more, rather than a different register.
 */
const SPICE: Record<number, string> = {
  1: 'Register: no sexual content. Attraction, longing and a kiss may be on the page. The scene '
   + 'ends at the kiss.',
  2: 'Register: desire is on the page and sex is not. Write the wanting, the approach, and what is '
   + 'different afterwards. The camera stops at the door and picks up past it.',
  3: 'Register: sex happens on the page, in the same voice as the rest of the book — what passes '
   + 'between them, what is said, what changes. Bodies are present and not itemised. Adult '
   + 'characters only.',
  4: 'Register: sex is written directly, in plain words, with the acts named as they happen. It is '
   + 'a scene like any other and still has to move the story. Vocabulary follows the writing '
   + 'sample. Adult characters only.',
  5: 'Register: fully explicit, in unrestricted detail, for as long as the scene runs. Do not fade, '
   + 'summarise, cut away or skip ahead. Vocabulary follows the writing sample. Adult characters '
   + 'only.',
};

/** Five modes, and the distinction that matters runs through all of them: in `direct` the
 *  writer's text is an INSTRUCTION and never reaches the page; in `speak`, `act` and `narrate`
 *  the writer's text is already the last passage and the model's job is to answer it. Getting
 *  that backwards is what made typed dialogue vanish into the prompt. */
const MODE: Record<string, (d?: string, who?: string) => string> = {
  // The Continue button. No directive, because there is nowhere to type one — a steer with no
  // input is a parameter nobody can set.
  // NO PARAGRAPH COUNT. It said "the next 1-2 paragraphs" and F18 is what a named length does: the
  // model fills it. The scope words were already carrying the instruction — one beat, no time
  // skipped, nothing new unless the page set it up — and the last line replaces the number with
  // the permission the number was denying, which is to be short.
  continue: () => 'Carry the scene forward by one small beat, and stop.\n'
    + 'Do not skip time. Do not introduce a new character, location, or revelation unless the\n'
    + 'prose above set it up.\nStop when the beat is done, even if that is three sentences.',

  // The writer's line is ALREADY the last passage. The one instruction that earns its tokens is
  // not to keep talking in that character's voice.
  //
  // NO LIST. It said "speech, action, the room" and a checklist gets filled: reply, gesture,
  // weather, in that order, every time (COUNCIL-04). Three slots is a shape, and a shape the model
  // can see is a shape it will complete. What replaces it says the answer may be ONE thing.
  speak: (_d, who) => `The last passage is dialogue the writer has just spoken as ${who || 'the point-of-view character'}.\n`
    + 'Write what it lands on. It may land on one person, or on the room, or on nobody — any one of\n'
    + 'those is a whole answer and the scene is owed no other.\n'
    + `Do not put further words in ${who || 'that character'}'s mouth. Do not repeat the line back.`,

  // Same defect, and COUNCIL-04 did not name this one: "the consequence, the reaction, the world
  // answering" is the same three slots wearing different words.
  act: (_d, who) => `The last passage is what ${who || 'the point-of-view character'} has just done.\n`
    + 'Write the one thing that follows from it — what it costs, or what it gets.\n'
    + `Do not decide what ${who || 'that character'} does next. Do not restate the action.`,

  direct: (d) => `Write what happens next: ${d}\n\n`
    + 'Cover that and nothing beyond it. Do not narrate past the instruction, and do not resolve it\n'
    + 'faster than the scene wants. The length follows the instruction: a small one is a small\npassage.',

  // Not a writing mode. Anansi answers the writer rather than continuing the book, so this block
  // says what the material above IS — otherwise a model handed canon and prose does the thing it
  // has been doing all along and writes the next passage.
  talk: (d) => `The writer is talking to you about this story, not asking for prose.\n`
    + `Everything above is what you know about it. Do not continue the story.\n\n`
    + `They say: ${d ?? ''}`,

  // The one mode where the text above is the author's own prose rather than a request. Saying so
  // is the whole job: without it the model treats a paragraph of narration as an instruction and
  // writes about it instead of from it.
  narrate: () => 'The passage above was written by the author, not by you. It is the story itself, not an instruction.\n'
    + 'Continue from where it stops. Pick up mid-thought if the last line is unfinished.\n'
    + 'Do not rewrite it, summarise it, or comment on it. Stop at a natural beat, however few\n'
    + 'sentences that takes.',
};

/** The worn outfit, as a second bracket under whatever the body resolved to. */
const worn = (body: string, e: Entry): string => e.wearing?.body
  ? `${body}\n[${(e.title || '').trim() || 'They'} wears: ${e.wearing.body.trim()}]`
  : body;

/** The body as it stands at a given chapter.
 *
 *  Canon that cannot change is the wrong model for a novel: a static body either leaks a
 *  later fact when you are writing early, or describes a dead character as alive when you
 *  are writing late. States are anchored to a chapter and the last one at or before where
 *  you are writing is the one in force.
 *
 *  A state that has not opened yet is hidden — that is the whole point. `hint` is the
 *  exception: it tells the model something exists without saying what, so foreshadowing
 *  has somewhere to come from.
 *
 *  REPLACES, and does not append to, the base body. That is deliberate and it is the answer to
 *  "which shape does not confuse the model": only one description of a character ever reaches the
 *  prompt, so "she is alive" from the base and "she is dead" from chapter 20 can never arrive
 *  together. Appending would keep every durable fact and reintroduce exactly the contradictions the
 *  checker exists to catch.
 *
 *  The cost, and the trap for anything that WRITES a state: a state must be a complete description
 *  of the character as they now are, never a delta. A state that says only "her arm is broken"
 *  silently drops her eye colour, her role and her voice from that chapter onward, and the failure
 *  looks like the model forgetting rather than like a state being too short. Anything generating
 *  states — a chapter-end pass, an import, a proposal — must be seeded with the state currently in
 *  force and asked to return the whole of it, updated.
 *
 *  Nothing is lost by replacing: every state row stays in entry_states, entry_revisions logs field
 *  changes with a revert, and the surface shows the timeline. Only the PROMPT sees one.
 */
export function resolveBody(e: Entry, chapter: number): string {
  if (!e.states?.length) return e.body;
  const ordered = [...e.states].sort((a, b) => a.fromChapter - b.fromChapter);
  const inForce = ordered.filter((s) => s.fromChapter <= chapter).at(-1);
  const hints = ordered
    .filter((s) => s.fromChapter > chapter && s.beforeMode === 'hint')
    .map((s) => s.label?.trim() || 'something here is not yet known');
  return [inForce?.body ?? e.body, ...hints.map((h) => `[not yet known: ${h}]`)].join(' ');
}

// The proximity bound is BUILT (2026-08-25) — see `fires` below. The marker that stood here said
// to build it "when a real ledger actually false-fires", and COUNCIL-04 recorded two, from a
// 46-entry ledger where all 46 fired for an eight-person scene:
//
//     `iron bridge`  on  "The bridge was iron, and it was cold"
//     `Kade Ashford` on  Kade Ferrin and Lord Ashford, two passages apart
//
// ponytail: still no secondary keys, key_logic, exclusion keys or regex keys (SPEC §7.4). Those
// address a DIFFERENT failure from the one measured — a key that is right but wanted only in
// some contexts — and nothing has demonstrated that one yet.

/** The narration only: every quoted span removed.
 *
 *  Dialogue may lie, a character may be wrong, and only the narrator commits the story to a fact.
 *  Ignoring that produced a long run of false positives in the quality checks — a place name,
 *  another character's name, a line of dialogue read as a POV break — so anything reading a chapter
 *  to decide what is TRUE reads this instead of the raw text.
 *
 *  The checker in routes.ts does the same job differently: it keeps the text whole and filters the
 *  quotes the model came back with, because it needs the offsets. Not refactored into this — two
 *  callers with two genuinely different needs, and the checker's version is the tested one. */
export const narrationOnly = (text: string) =>
  String(text ?? '').replace(/["“][^"”]*["”]/g, ' ').replace(/[ \t]{2,}/g, ' ');

/** Fold an English word to a crude stem so "runs" and "running" meet.
 *
 *  Deliberately not Snowball. A real stemmer is a dependency and it collapses exactly the
 *  words a novel cannot afford to lose — Winter/wintered, Grace/graceful, Aldis/Aldi — which
 *  is why SPEC §7.4 exempts proper nouns from it at all. This handles the regular suffixes
 *  and nothing else. Irregular forms ("went" for "go") need their own key, and the UI says so.
 */
export function fold(w: string): string {
  // A fixed sequence, not a loop. English stacks plural-onto-gerund ("bindings") but does
  // not stack further, and a general loop over-strips: "clos" looks like a plural, so
  // "closed" folded to "clo" while "close" folded to "clos" and they never met.
  let t = w.toLowerCase();
  if (t.length < 4) return t;

  if (t.endsWith("'s")) t = t.slice(0, -2);

  // Plural, once.
  if (t.endsWith('ies') && t.length > 4) t = t.slice(0, -3) + 'y';
  else if (t.endsWith('es') && /(s|x|z|ch|sh)$/.test(t.slice(0, -2))) t = t.slice(0, -2);
  // A bare -s is not a plural on words that simply end in one: press, glass, crisis, focus.
  else if (t.endsWith('s') && !/(ss|us|is)$/.test(t) && t.length > 3) t = t.slice(0, -1);

  // Verb suffix, once, on whatever is left.
  for (const suf of ['ing', 'ed']) {
    if (!t.endsWith(suf) || t.length - suf.length < 3) continue;
    t = t.slice(0, -suf.length);
    // Porter: a doubled final consonant loses one, except ll / ss / zz where it is real.
    if (t.length > 3 && t.at(-1) === t.at(-2) && !'lsz'.includes(t.at(-1)!)) t = t.slice(0, -1);
    if (t.length > 2 && t.endsWith('i')) t = t.slice(0, -1) + 'y';
    break;
  }

  // Trailing e last, on both sides: "closed" gives "clos" and "close" gives "clos".
  return t.length > 3 && t.endsWith('e') ? t.slice(0, -1) : t;
}

/** How far apart the words of a multi-word key may sit and still be that key.
 *
 *  A two-word key spans 1 when the words are adjacent. SLACK 2 lets one or two words fall between
 *  them — "iron-shod bridge", "Kade of Ashford" — and refuses a whole clause. It is deliberately
 *  tight: the failure being fixed is words that merely co-occur, and every token of slack is
 *  another sentence they may co-occur across.
 */
const KEY_SLACK = 2;

/** Whole-word match over one window. Proper nouns match exactly, plus plural and possessive;
 *  everything else is folded on both sides so word forms meet.
 *
 *  A MULTI-WORD KEY MUST APPEAR IN ORDER AND CLOSE TOGETHER. It used to fire when every word
 *  appeared anywhere in the window, in any order, at any distance — so `iron bridge` fired on
 *  "The bridge was iron, and it was cold" and `Kade Ashford` fired on Kade Ferrin plus Lord
 *  Ashford two passages apart, for a character who was not in the scene. Both are real, both from
 *  COUNCIL-04's 46-entry ledger, and order alone would not have caught the second nor distance
 *  the first — which is why this is both.
 *
 *  Single-word keys are untouched: there is no order and no distance in one word.
 */
export function fires(entry: Entry, window: string): string[] {
  // The apostrophe is INSIDE the token class so `aldi's` survives as one word — but that also
  // keeps the ones at the EDGES, and a straight single quote is how a great deal of fiction marks
  // dialogue. So `'Aldi'` tokenised to `'aldi'` and matched nothing at either end, and `Aldis'` —
  // the possessive of a name already ending in s — missed its own entry. Curly quotes were never
  // affected, because they are not in the class at all, which is why this hid: the same line reads
  // correctly or not depending on which quote mark the writer's keyboard produced.
  // Trimmed at the edges only; an interior apostrophe is part of the word.
  const tokens = (window.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
    .map((t) => t.replace(/^'+|'+$/g, '')).filter(Boolean);
  const raw = new Set(tokens);
  const folded = tokens.map(fold);
  const proper = entry.properNouns ?? entry.entryType === 'character';
  // ponytail: on the proper-noun path a bare `key + 's'` makes `Aldi` fire on `Aldis`, which may be
  // a different name entirely. Deliberate, and Seth's call on 2026-08-27: a lore entry that fires
  // when it need not costs context; one that stays silent costs the fact. He wants the matches.
  // Ceiling: a story with two names one -s apart shares their entries. Upgrade path is a per-entry
  // opt-out, not a global tightening — do not "fix" this by dropping the bare plural.
  // Every position a part of the key sits at, so the span can be measured rather than guessed.
  const at = (p: string) => {
    const out: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const hit = proper
        ? tokens[i] === p || tokens[i] === p + 's' || tokens[i] === p + "'s"
        : folded[i] === fold(p);
      if (hit) out.push(i);
    }
    return out;
  };
  return entry.keys.filter((k) => {
    const parts = k.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    if (!parts.length) return false;
    if (parts.length === 1) return proper
      ? raw.has(parts[0]) || raw.has(parts[0] + 's') || raw.has(parts[0] + "'s")
      : folded.includes(fold(parts[0]));
    // Walk the parts in order, each time taking the EARLIEST position after the one before. That
    // is the tightest run the window allows, so if it is too wide, no run is narrow enough.
    const first = at(parts[0]);
    return first.some((start) => {
      let last = start;
      for (const p of parts.slice(1)) {
        const next = at(p).find((i) => i > last);
        if (next === undefined) return false;
        last = next;
      }
      return last - start <= parts.length - 1 + KEY_SLACK;
    });
  });
}

export function buildContext(input: Input, count: (s: string) => number): Manifest {
  const { story, chapters, passages, entries, currentChapter, budget } = input;
  const tailTokens = input.tailTokens ?? 200;
  const blocks: Block[] = [];
  /** Anchors never disappear. The parts marked `keep` are always sent; the rest is shortened
   *  from the end until the whole block fits, and the manifest says it was shortened. Losing
   *  point of view and register silently is far worse than losing the tail of a style sample —
   *  which is why the sample is the flex part of VOICE and never of DIRECTIVE. */
  const addAnchor = (kind: Kind, id: string, parts: { text: string; keep: boolean }[], cap: number) => {
    const live = parts.filter((p) => p.text.trim());
    let text = live.map((p) => p.text).join('\n');
    if (count(text) <= cap) { add(kind, id, text, 'anchor'); return; }
    const fixed = live.filter((p) => p.keep).map((p) => p.text).join('\n');
    const room = cap - count(fixed) - 1;
    const flex = live.filter((p) => !p.keep).map((p) => p.text).join('\n');
    let cut = flex;
    while (cut.length > 40 && count(cut) > room) cut = cut.slice(0, Math.floor(cut.length * 0.9));
    // Land on a boundary. Slicing by character ended a pasted voice sample mid-word, which reads
    // as a typo rather than an excerpt — and the same slice cuts the premise in SPINE.
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '),
                          cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    if (stop > cut.length * 0.5) cut = cut.slice(0, stop + 1);
    else { const sp = cut.lastIndexOf(' '); if (sp > 40) cut = cut.slice(0, sp); }
    const tail = /[.!?]$/.test(cut.trimEnd()) ? cut.trimEnd() : cut.trimEnd() + '…';
    const out = live.map((p) => (p.keep ? p.text : (count(flex) > room ? tail : p.text)))
      .filter((t) => t.trim()).join('\n');
    // PLAN-06 2b. This stamped "shortened" unconditionally, including when nothing was shortened —
    // and for DIRECTIVE nothing ever can be, because all four of its parts are `keep: true`, so
    // `flex` is empty and every part comes back unchanged. Reproduced at 274 tokens against a cap
    // of 250, carrying the reason for a trim that did not happen.
    //
    // The false reason is the whole defect: an anchor that is over its cap and CANNOT be cut is a
    // real overrun, and it was being reported as a successful trim. Harmless at today's sizes, and
    // the F28 lockout has already added ~78 tokens to DIRECTIVE. Say which of the two happened.
    // Giving a part `keep: false` was the other option in 2b and it is the larger one — it changes
    // what reaches the model, and every part of DIRECTIVE is there because something measured it.
    add(kind, id, out, out === text
      ? `anchor over ${cap} tokens and nothing in it may be cut`
      : `anchor shortened to ${cap} tokens`);
  };

  const add = (kind: Kind, id: string, text: string, reason: string, firedBy?: string[]) => {
    if (!text.trim()) return;
    blocks.push({ kind, id, text, tokens: count(text), state: 'included', reason, firedBy });
  };

  // SPINE — reference material at the top. Carries `direction` because a destination
  // is not a claim about *now*, so SPEC 7.1's argument against permanent bodies holding
  // temporal facts does not reach it (COUNCIL-03 S5 — the novelist won this).
  // Anchors are built from parts so that going over the cap shortens the LONG part rather
  // than deleting the block. Deleting SPINE loses the premise and the destination; deleting
  // DIRECTIVE loses point of view, register and the chapter's ending.
  addAnchor('SPINE', 'spine', [
    // The title stays. F12: dropping it was measured at n=30 per arm and made no difference
    // (96% vs 93% on the passages that named the key, CI [-15, +8]) — and neither arm
    // reproduced F9's actual failure once in sixty generations.
    { text: `${story.title} — ${story.genre}`, keep: true },
    { text: story.premise, keep: false },
    { text: `Setting: ${story.setting}`, keep: true },
    { text: story.direction ? `Where this is going: ${story.direction}` : '', keep: true },
  ], CAPS.SPINE!);

  // The sample is sent as PROSE, not as a bracketed value. `[Voice: <300 words>]` reads as a
  // description of a style rather than a specimen of one, and it was the only truncatable part
  // of DIRECTIVE, so it was sliced 10% at a time until it fit beside three things it does not
  // compete with. The instruction line is kept; the sample is what gets shortened, on a sentence.
  if (story.writingStyle?.trim()) addAnchor('VOICE', 'voice', [
    { text: "A sample of the writer's own prose. Match its rhythm, diction and register. "
          + 'It is not part of this story: never continue it, quote it, or take facts from it.',
      keep: true },
    { text: story.writingStyle.trim(), keep: false },
  ], CAPS.VOICE!);

  // Scan window for triggered entries. Sticky is derived by looking at the recent passages
  // one at a time rather than kept in a table: COUNCIL-03 showed a stored state row cannot
  // answer "what was true at ordinal 19" once the branch is at 45, and keying it by chapter
  // reset every window at each boundary — flicker at the most conspicuous paragraph in the book.
  //
  // The directive is IN the window. Found live on the first end-to-end run: the writer
  // steered "Aldis reaches into his coat", the key entry keyed on 'coat' did not fire
  // because prior prose never said the word, and the model then invented the key as
  // warm iron against canon that says cold brass. The instruction is the strongest
  // signal of what is about to be on the page; scanning only backwards misses it.
  const recent = [...passages.slice(-8).map((p) => p.body), input.directive ?? ''].join('\n');
  const windowFor = (n: number) => [...passages.slice(-(8 + n), passages.length - n)
    .map((p) => p.body), n === 0 ? (input.directive ?? '') : ''].join('\n');

  // Novelcrafter includes the point-of-view character unconditionally, and it is one line.
  const persona = (story as any).persona?.trim().toLowerCase();
  const isPov = (e: Entry) => !!persona && e.title.trim().toLowerCase() === persona;

  const pins = input.pins ?? {};
  for (const e of entries) {
    // force_out is a hard filter and is applied first here so nothing downstream can
    // resurrect it — SPEC §7.4 has it last in the sequence, which is the same outcome and
    // means it also beats force_in if a chapter somehow carries both.
    if (pins[e.id] === 'force_out') {
      blocks.push({ kind: e.activation === 'always_on' ? 'CANON-ALWAYS' : 'CANON-TRIGGERED',
        id: e.id, text: '', tokens: 0, state: 'omitted', reason: 'pinned out of this chapter' });
      continue;
    }
    // AFTER resolution, so a chapter-state replacing the body does not take the wardrobe with it.
    // It rides with the entry rather than in its own block, so it obeys the entry's own activation:
    // an always-on character carries it every call, a triggered one only when they fire.
    const body = worn(resolveBody(e, currentChapter.index), e);
    if (e.activation === 'always_on') {
      add('CANON-ALWAYS', e.id, body, 'always_on', ['always_on']);
    } else if (pins[e.id] === 'force_in') {
      // The fact matters in this scene even though nobody says its keyword.
      add('CANON-TRIGGERED', e.id, body, 'pinned in', ['pinned']);
    } else if (isPov(e)) {
      add('CANON-TRIGGERED', e.id, body, 'point of view', ['pov']);
    } else {
      const hit = fires(e, recent);
      if (hit.length) { add('CANON-TRIGGERED', e.id, body, 'keyword', hit); continue; }
      // Sticky is, in practice, "extend the scan window for this entry": the keyword has to
      // fall OUT of the 8-passage window before it does anything, and then it buys stickyFor
      // more. Characters default to 3, so a person mentioned eleven passages ago is still in
      // context and stops going quietly wrong the moment they are off the page.
      const sticky = e.stickyFor ?? (e.entryType === 'character' ? 3 : 0);
      for (let back = 1; back <= sticky; back++) {
        const then = fires(e, windowFor(back));
        if (then.length) { add('CANON-TRIGGERED', e.id, body, `sticky ${back} back`, ['sticky', ...then]); break; }
      }
    }
  }

  // EARLIER — every summary except the chapters still whole in PROSE, or the recent
  // chapter appears twice: a lossy summary beside the lossless prose it summarizes.
  //
  // WHERE THE PROSE STOPS. This was `currentChapter.index - 2` — the chapter you are in plus the
  // two before it, whole — until 2026-08-27, when Seth asked for the window to close at the
  // chapter boundary: "when starting a new chapter it should dump current context after the first
  // message, then rely on the summary, threads and strings, that way keeping everything small."
  //
  // The exception is the empty chapter. A new chapter with nothing in it yet has no prose of its
  // own to continue from, so the previous chapter stays whole until the first passage lands — cut
  // at the boundary itself, the opening of every chapter would be written from a summary and a
  // ledger with no sentence in front of it, and the seam between chapters is exactly where a book
  // can least afford that.
  //
  // Counted on passages that are not breaks: a chapter break is a real passage (so NEW SCENE has
  // something to fire on and ordinals stay dense), and it lands in the chapter being CLOSED. If it
  // ever moves, or a break is written into a fresh chapter, a `length > 0` check here would call an
  // empty chapter full and cut the previous one away underneath the opening passage.
  //
  // This makes the prompt SMALLER, in a prompt measured at 8,676 of 46,446 tokens with 87% of the
  // slot unused — so it does not buy room, and it was not asked for to buy room. What it buys is
  // what the model leans on: the chapter you are writing, plus what the book has written down about
  // itself. The tier it leans on is only worth leaning on because chapter close now fills it.
  const started = passages.some((p) => p.chapterId === currentChapter.id && !p.isBreak);
  const wholeFrom = started ? currentChapter.index : currentChapter.index - 1;

  // STRINGS. Only what the writer summoned, and phrased as a standing obligation rather than an
  // instruction: the model is being told what is owed, not told to pay it. "Do not resolve" is
  // there because a model handed an unresolved promise reaches for it — which is the writer's move
  // and the reason strings are writer-facing until summoned.
  const strings = (input.strings ?? []).filter((x) => x.title?.trim());
  if (strings.length) {
    add('STRING', 'strings',
      'Unpaid, and in play. Let them shape what the characters want and avoid; do not resolve one '
      + 'unless the writer asks for it.\n'
      + strings.map((x) => {
        const made = x.fromChapter ? `set up in chapter ${x.fromChapter}` : '';
        const owed = x.owedBy ? `owed by chapter ${x.owedBy}` : '';
        const when = [made, owed].filter(Boolean).join(', ');
        return `- ${x.title.trim()}${x.body?.trim() ? `: ${x.body.trim()}` : ''}${when ? ` (${when})` : ''}`;
      }).join('\n'),
      `${strings.length} summoned`);
  }

  // Arcs first: an act-level summary replaces the chapters it covers rather than joining
  // them. Without this tier EARLIER grows linearly with the book and eventually crowds out
  // the prose it exists to make room for.
  const arcs = [...(input.arcs ?? [])].sort((a, b) => a.fromChapter - b.fromChapter);
  const covered = (idx: number) => arcs.some((a) => idx >= a.fromChapter && idx <= a.toChapter
    && a.toChapter < wholeFrom);
  for (const a of arcs) {
    // An arc reaching into the whole-prose window is held back: the chapters it covers are
    // still being sent in full, so summarising them as well is the duplication §7.3 deleted.
    if (a.toChapter >= wholeFrom) continue;
    add('EARLIER', `arc-${a.fromChapter}-${a.toChapter}`,
      `Ch${a.fromChapter}-${a.toChapter}${a.title ? ` ${a.title}` : ''}: ${a.summary}`, 'arc');
  }

  for (const c of chapters) {
    if (c.index >= wholeFrom || !c.summary) continue;
    if (c.keepWhole) continue;   // its prose is being sent; a summary too would duplicate it
    if (covered(c.index)) continue;
    // SPEC §5: on hash mismatch a summary is flagged stale, excluded, and re-run. Left in,
    // it contradicts the prose it no longer describes in every later call, forever.
    if (c.summaryStale) {
      blocks.push({ kind: 'EARLIER', id: c.id, text: '', tokens: 0,
        state: 'omitted', reason: 'summary stale — covered prose changed' });
      continue;
    }
    add('EARLIER', c.id, `Ch${c.index} ${c.title}: ${c.summary}`, 'summary');
  }

  // PROSE / TAIL — only the chapters still whole. Everything older is represented by its
  // summary in EARLIER, and sending BOTH is what made the prompt grow without bound: at
  // 12,000 words the assembled context exceeded the budget and the guard refused every
  // generation, permanently. A summary that does not replace the prose it summarises is
  // not compression, it is duplication.
  const byId = new Map(chapters.map((c) => [c.id, c.index]));
  const pulled = new Set(chapters.filter((c) => c.keepWhole).map((c) => c.id));
  const whole = passages.filter((p) => {
    if (p.chapterId && pulled.has(p.chapterId)) return true;   // pulled back in full
    const idx = p.chapterId ? byId.get(p.chapterId) : undefined;
    return idx == null || idx >= wholeFrom;      // unknown chapter: keep it rather than lose it
  });


  let tail: Passage[] = [], acc = 0;
  for (let i = whole.length - 1; i >= 0; i--) {
    const t = count(whole[i].body);
    if (acc + t > tailTokens && tail.length) break;
    tail.unshift(whole[i]); acc += t;
  }
  const head = whole.slice(0, whole.length - tail.length);
  for (const p of head)
    add('PROSE', p.id, p.body, p.chapterId && pulled.has(p.chapterId) ? 'pulled back' : 'recent prose');

  // The lockout. One line, and it is a prohibition with a destination — a bare "do not write him"
  // gets worked around (he is described from outside, or the scene stalls waiting for him), so the
  // line has to say what the model IS for. F21 measured the model narrating the protagonist's
  // interior in 82.5% of generations with nothing in canon asking for it; this is the only thing
  // in the app that has ever aimed at that number.
  //
  // It rides DIRECTIVE rather than getting a block of its own: DIRECTIVE is the anchor that holds
  // the standing instructions, it is never evicted, and a fifth block for its ~78 tokens would need
  // a place in ORDER, a colour, a name in BLOCK_ORIGIN and a row in the Context panel.
  const locked = story.lockedCharacter?.trim();
  addAnchor('DIRECTIVE', 'directive', [
    { text: `[Writing: ${story.pov}]`, keep: true },
    { text: locked
      ? `[${locked} belongs to the writer: never write their dialogue, action, gesture or thought, `
        + `and never state what they feel, know or decide. Write the world's answer instead — what `
        + `the others say and do, what the room does, what happens to ${locked}. Stop where `
        + `${locked} would act.]`
      : '', keep: true },
    { text: currentChapter.authorsNote ? `[This chapter must end with: ${currentChapter.authorsNote}]` : '', keep: true },
    // A written-out register replaces the level's fixed line. Five lines cannot say
    // everything, and a story that needs a sixth should not have to pick the nearest.
    { text: `[${story.spiceNote?.trim() || SPICE[story.spice]}]`, keep: true },
  ], CAPS.DIRECTIVE!);

  for (const p of tail) add('TAIL', p.id, p.body, 'tail prose');

  // MODE. Omitted only for Narrate on an unfinished line — scoping this to one mode is
  // deliberate: Direct's directive and speak/act's "whose line is it" live ONLY in MODE, and
  // omitting it also drops the length instruction, which truncates, which looks unfinished,
  // which omits it again. It latches (COUNCIL-03 S7). Narrate inherits the exception because
  // it is the mode where the writer deliberately stops mid-sentence for the model to finish.
  const last = passages.at(-1)?.body ?? '';
  const unfinished = last.length > 0 && !/[.!?"'”’]\s*$/.test(last.trimEnd());
  if (!(input.mode === 'narrate' && unfinished)) {
    // A stale browser tab still sends the old mode names. Falling back to the neutral mode
    // beats a 500 from an undefined lookup, which is what a reload would otherwise produce.
    // The writer's own wording wins, with {{directive}} and {{speaker}} filled the same way the
    // shipped prompts fill them — an override without them is legal and simply mentions neither.
    const own = input.modePrompts?.[input.mode]?.trim();
    add('MODE', 'mode', own
      ? own.replace(/\{\{\s*directive\s*\}\}/g, input.directive ?? '')
           .replace(/\{\{\s*speaker\s*\}\}/g, input.speaker || 'the point-of-view character')
      : (MODE[input.mode] ?? MODE.continue)(input.directive, input.speaker),
      own ? `mode:${input.mode} · yours` : `mode:${input.mode}`);
  }

  // ponytail: ceilings and a hard refusal, no budget engine. No reservation, no trim ladder, no
  // eviction order, and no 'partial' block state — every block is included or omitted whole.
  // Deferred on measurement: prefill is fast (F1), the server refuses overflow rather than
  // truncating (F3), and summaries bound the context. PLAN-02 §7.2 holds the trigger condition.
  // ---- ceilings, then the guard ----
  const byKind: Record<string, number> = {};
  for (const b of blocks) byKind[b.kind] = (byKind[b.kind] ?? 0) + b.tokens;

  // addAnchor already fits each anchor to its cap, so this is a floor rather than a policy.
  // It used to delete the whole block, which is how a long writing sample silently removed
  // the point of view and the spice register from every call.
  /** Where an EARLIER block sits in the book, as a number. Chapter ids sort as strings — "c10"
   *  before "c2" — which is how a 120-chapter book ended up keeping chapters 6-9, 52-55 and
   *  96-99. Arcs are placed at the chapter they start from. */
  const chapterAt = new Map(chapters.map((c) => [c.id, c.index]));
  const earlierAt = (b: Block) => {
    const arc = /^arc-(\d+)-/.exec(b.id);
    return arc ? Number(arc[1]) : chapterAt.get(b.id) ?? 0;
  };

  /** How strongly a triggered canon block earned its place. Lower goes first.
   *
   *  Read off the reason the block already carries, so there is one source for why it is here and
   *  what it is worth. A sticky hold is weakest, and the further back it reaches the weaker it is:
   *  three passages ago is a person who has left the room. */
  const canonRank = (b: Block) => {
    const sticky = /^sticky (\d+) back$/.exec(b.reason);
    if (sticky) return 0 - Number(sticky[1]);       // -3 is weaker than -1
    if (b.reason === 'keyword') return 1;
    if (b.reason === 'point of view') return 2;
    if (b.reason === 'pinned in') return 3;
    return 4;                                        // always_on, and anything unrecognised
  };

  const evict = (kinds: Kind[], ceiling: number, label: string) => {
    let used = blocks.filter((b) => kinds.includes(b.kind) && b.state === 'included')
                     .reduce((n, b) => n + b.tokens, 0);
    if (used <= ceiling) return;
    // Lowest value goes first, and "lowest value" is a judgement each kind has to make for
    // itself. What it must never be is the order things happen to have been created in, which is
    // what it was: rows come back by rowid, so the protagonist Spark wrote first went before
    // yesterday's walk-on, and 120 chapters of summaries were dropped by the LEXICOGRAPHIC order
    // of their ids — c1, c10, c100, c11, c2 — which kept chapters 6-9, 52-55 and 96-99 and threw
    // away the rest (COUNCIL-04 #8, measured in F31).
    const cands = blocks
      // A chapter you asked for back is not a candidate. Evicting it first made the pull
      // silently do nothing, which is worse than refusing.
      .filter((b) => kinds.includes(b.kind) && b.state === 'included' && b.reason !== 'pulled back')
      .sort((a, b) => {
        if (a.kind !== b.kind) return CANON_KINDS.indexOf(b.kind) - CANON_KINDS.indexOf(a.kind);
        if (a.kind === 'PROSE') return 0;   // insertion order is already oldest-first
        if (a.kind === 'EARLIER') {
          // Arcs last: one covering thirty chapters is the densest thing in the block. Then
          // oldest first BY CHAPTER NUMBER, so what a long book forgets is its distant past
          // rather than a scatter of runs nobody chose.
          const arc = (x: typeof a) => (x.reason === 'arc' ? 1 : 0);
          return arc(a) - arc(b) || earlierAt(a) - earlierAt(b);
        }
        // Canon, within a kind. Every triggered block already says how it got here, and that is
        // exactly its strength: the writer pinning it beats the point-of-view character, which
        // beats a keyword in the current window, which beats a hold from three passages back.
        return canonRank(a) - canonRank(b);
      });
    for (const b of cands) {
      if (used <= ceiling) break;
      b.state = 'omitted'; b.reason = `${label} ceiling`; used -= b.tokens;
    }
  };
  evict(CANON_KINDS, Math.floor(budget * CANON_CAP_FRAC), 'canon 45%');
  evict(['EARLIER'], Math.floor(budget * EARLIER_CEILING_FRAC), 'EARLIER 25%');
  // Prose oldest-first. This is what lets a pulled-back chapter cost something rather than
  // overflow: the oldest passage in the recent window drops to make room, and the writer
  // gets the scene they asked for instead of a refusal. TAIL is excluded — the model has to
  // continue from something.
  evict(['PROSE'], Math.floor(budget * PROSE_CEILING_FRAC), 'prose 60%');

  const used = blocks.filter((b) => b.state === 'included').reduce((n, b) => n + b.tokens, 0);
  const over = used > budget;
  let overflowReason: string | undefined;
  if (over) {
    // Refuse, and name the block that would be dropped. Under context shift
    // llama-server drops from the HEAD, which is SPINE and canon — the one promise,
    // broken silently while the app reports success.
    const first = ORDER.map((k) => blocks.find((b) => b.kind === k && b.state === 'included'))
                       .find(Boolean);
    // A budget of zero means the story's own context cap is smaller than the space reserved for
    // the reply. Blaming SPINE there is misleading: nothing would fit, whatever was dropped.
    overflowReason = budget <= 0
      ? `this story's context cap leaves no room for a prompt — the reply alone is reserved ` +
        `${input.budget === 0 ? 'more than the cap' : 'most of it'}. Raise the cap, or lower the reply length.`
      : `over budget by ${used - budget} tokens; the server would drop ` +
        `${first?.kind}/${first?.id} from the head first`;
  }

  blocks.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return {
    blocks,
    totals: { budget, used, unallocated: Math.max(0, budget - used) },
    byKind, overflowed: over, overflowReason,
  };
}
