// buildContext — pure. Plain objects in, a manifest out. No database, no network.
// Token counting is injected, which is what keeps it pure and testable with no model.

import { ORDER, CAPS, CANON_KINDS, CANON_CAP_FRAC, EARLIER_CEILING_FRAC, PROSE_CEILING_FRAC } from './blocks.ts';
import type { Block, Kind } from './blocks.ts';
import { EXCLUSIVE_SLOTS, plain, wrapperNames } from './slots.ts';

interface EntryState {
  fromChapter: number;             // the chapter this state opens at
  body: string;
  beforeMode?: 'hide' | 'hint';    // what happens ahead of it opening
  label?: string;
}
export interface Entry {
  id: string; title: string; body: string;
  entryType: 'character' | 'place' | 'lore' | 'item';
  activation: 'always_on' | 'triggered' | 'off';
  keys: string[];
  lastEditor: 'human' | 'model';   // decides arbitration (COUNCIL-03 S1)
  states?: EntryState[];           // canon over time — see resolveBody
  // (`wearing` was here. Removed 2026-08-29 with #18 §4: it was written by `view()` on every
  //  entry and read by nothing — `buildContext` never touched it and `render.ts`'s `entryText` is
  //  a bare `return e.body`. The coat reaches the model as the `outfit` room like any other, and
  //  `rooms()` below is the one place that decides it says "wears" rather than naming the coat.)
  stickyFor?: number;              // stays active this many passages after it last fired
  properNouns?: boolean;           // names do not get folded — see fold()
  retiredAtChapter?: number;       // finished: a dead character, a burned building. PLAN-08
  addons?: Addon[];                // the rooms of the card — PLAN-08 Phase 2
  /** #79. The dated half of Over time that is not text: an outfit put on or taken off, the thread
   *  retired or brought back, each from a scene on. See `wornAt` and `retiredAt`. */
  events?: { kind: 'wear' | 'unwear' | 'retire' | 'return'; addonId?: string | null; fromChapter: number }[];
  /** The World this thread is followed from, when it is a World's (ADR 0006). Null on a tale's own. */
  sharedFrom?: string | null;
}
/** A room of a card: an appearance, a relationship, a voice. What an outfit already was,
 *  generalised — see `src/slots.ts`. Several of the plural slots can be live at once. */
interface Addon {
  id: string; slot: string; name: string; body: string;
  keys: string[];
  active?: boolean;                // the writer pinned it on; kept in step with `activation` (db.ts, #134)
  /** #134 · Off, On a word, or On, a thread's three. Absent on a row from before the column: then it
   *  is what that row behaved as: on if `active`, else On a word with wake words, Off without (`pocketReach`). */
  activation?: 'always_on' | 'triggered' | 'off';
  fromChapter?: number;            // not true until this chapter
  retiredAtChapter?: number;
}
/** One terminal mark, so a writer's sentence and ours do not collide. Used by the chapter brief,
 *  where both halves put an instruction of ours directly after a sentence of theirs. */
const stop = (t: string) => { const s = t.trim(); return /[.!?…]$/.test(s) ? s : `${s}.`; };

export interface Chapter {
  id: string; index: number; title: string; summary?: string; authorsNote?: string;
  opensWith?: string;       // how the chapter starts. Sent only while it has no prose yet — see DIRECTIVE
  summaryStale?: boolean;   // covered prose changed since it was written — excluded, not trusted
  keepWhole?: boolean;      // pulled back in full: send this chapter's prose, not its summary
}
/** MAY THIS CHAPTER'S SUMMARY REACH THE MODEL. One answer for every read that sends one: the
 *  writing prompt, the act roll-up, chapter proposals and a chapter named in a question. Until
 *  #42 only the first two checked staleness, so a summary held back from the prompt still rode
 *  into "What has happened" and into a question, describing prose the book no longer has.
 *  `test/web.ts` fails if any of the four stops calling this. */
export const summaryReaches = (c: Pick<Chapter, 'summary' | 'summaryStale'>) =>
  !!c.summary && !c.summaryStale;
export interface Passage {
  id: string; ordinal: number; body: string; isBreak?: boolean;
  chapterId?: string;              // which chapter it belongs to — decides what stays whole
  /** Who wrote it. `story.ts` has put this on every passage since the view was written and the
   *  engine has never declared it, so it arrived and was invisible — which is F51's whole
   *  mechanism: the recent-prose block is a flat run of text with no marking of who wrote what,
   *  the lockout forbids writing the locked character, and the prose two hundred tokens later
   *  shows recent examples of exactly that with no way to tell they are the writer's. */
  author?: 'human' | 'model' | string;
  /** Written by the model to the writer's order (it carries a directive). Marked like the writer's
   *  own under a lockout: the order may have the locked character act, and unmarked it reads back
   *  as the model's own habit. Prompt audit, 2026-10-27. */
  directed?: boolean;
}
export interface Story {
  title: string; genre: string; premise: string; setting: string;
  /** #125. Where the tale stands at the scene being written, when the writer has sewn one in. */
  stands?: string;
  /** #75. The tale's own pockets, switched on: instructions for the whole tale ("keep it a slow burn"). */
  pockets?: string[];
  /** ADR 0005 · The tale's rules that are not Off: laws the tale obeys, pockets of its own thread
   *  since 2026-10-29. #134 · By its eye: On is sent always, On a word when one of its words comes
   *  up. With no eye given, a rule is On with no wake words and On a word with them (`pocketReach`). */
  rules?: { id: string; name: string; body: string; keys?: string[]; activation?: 'always_on' | 'triggered' | 'off' }[];
  pov: string; writingStyle: string; spice: 1 | 2 | 3 | 4 | 5;
  /** The world or intellectual property the book belongs to, and what is true in it. Both ride in
   *  SPINE: the name is identity and is kept, the note is furniture and is trimmable. */
  world?: string; worldNote?: string;
  /** The lockout's own switch. Undefined and true both mean on. */
  lockoutOn?: boolean;
  /** #18. `writingStyle` is the INSTRUCTION — what every story in the library already holds.
   *  `styleNote` is this book's own genre flavour, which gets its own block under VOICE.
   *  (`voiceSample`, a specimen of the writer's prose, was here. Removed 2026-08-30, COUNCIL-06
   *  ship 4 — see the note where VOICE is built.) */
  styleNote?: string;
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
  /** TALK READS WHAT IS ASKED (Seth, 2026-10-30: "it should only really look through everything
   *  based on what I've prompted it"). The writer's question and the conversation so far, apart from
   *  the rest of the directive. Set by the Talk route only: when it is, an always-on thread is sent
   *  when this or the last passages name it, and the others are listed by name in the MODE block. */
  reach?: string;
  // Who the last passage belongs to, for speak and act. The writer's own line is already on the
  // page when those two generate, so the model's job is to answer it — and it cannot do that
  // without being told whose line it is.
  speaker?: string;
  pins?: Record<string, 'force_in' | 'force_out' | 'mention'>;   // per-chapter overrides, SPEC §7.4 step 7
  /** F53. Mark the writer's OWN passages in the prose the model is continuing, so the lockout has
   *  something concrete to point at rather than a rule contradicted by recent examples.
   *
   *  Only ever applied while a lockout is actually in force — that is the case it was measured for,
   *  and it keeps a new marker out of every other book's prompt. Flagged because it is under
   *  measurement, and because F35 is the standing warning: give this model new vocabulary and it
   *  turns it into section headers, so the marker leaking into output is itself a thing to count. */
  proseAuthor?: boolean;
  /** Directed connections between cards, PLAN-08 Phase 2's `entry_edges`. PARENT PULLS CHILD AND
   *  NEVER THE REVERSE: her coat arrives when she does, and she must not arrive because somebody
   *  said "coat". `confidence` is what an inherited pull is worth against a direct keyword hit —
   *  spent in the eviction order, which is the only place it can mean anything — and `keys` are
   *  the edge's own trigger words, per #5. */
  edges?: { parentId: string; childId: string; confidence?: number; keys?: string[] }[];
  /** A string the tale carries (a promise, or an open question, #127) that the writer has switched on. Already
   *  filtered to on-and-open by story.ts — the engine does not know what a status means. */
  strings?: { title: string; body?: string; fromChapter?: number | null; owedBy?: number | null; kind?: string }[];
  // The writer's own wording for a mode, replacing the shipped one outright. Arrives HERE rather
  // than being read from a table down in the engine, because buildContext is pure below the line
  // in story.ts and this is a flag like any other.
  modePrompts?: Record<string, string>;
  /** WHEN YOU REWEAVE: the writer's own framing for the What didn't work note, as saved, set only
   *  on a reweave and resolved above the line in story.ts. Sent in the MODE block after the mode's
   *  instruction, and only when there is a note. Empty or absent sends the shipped `REWEAVE`; a
   *  saved value from before the later 2026-10-29 change is repaired by `reweaveOf`. NOT MEASURED. */
  reweave?: string;
  /** WHAT DID NOT WORK in the take being replaced, in the writer's words from the Reweave box. Set
   *  only on a reweave. The take itself is NOT sent (docs/adr/0012), so the note must stand alone:
   *  empty sends nothing, and the reweave's prompt is the one that wrote the passage, to the byte. */
  whatFailed?: string;
  /** Roughly how long the writer wants a passage, in words. Zero or absent is "let her decide",
   *  and then NOTHING about length reaches the model — which is the shipped default.
   *
   *  READ F18 AND F29 BEFORE TOUCHING THIS. A named length is a length the model fills: F29
   *  measured Continue's median at 685 chars with "the next 1-2 paragraphs" in the prompt and 291
   *  without it. So this is a floor as much as a target, it is off unless the writer turns it on,
   *  and `test/engine.ts` asserts both that the shipped modes still name no length and that this
   *  one appears only when it is set. */
  targetWords?: number;
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
  // 1 and 2 said "The scene ends at the kiss" and "picks up past it" until 2026-10-29: an order to
  // end a scene, and a skip in time, beside SYSTEM's "never resolve a scene" and Continue's "do not
  // skip time". Seth approved the camera wording, which is the ladder this comment describes.
  1: 'Register: no sexual content. Attraction, longing and a kiss may be on the page. The camera '
   + 'stops at the kiss.',
  2: 'Register: desire is on the page and sex is not. Write the wanting, the approach, and what is '
   + 'different afterwards. The camera stops at the door; skip past it only at a scene break.',
  3: 'Register: sex happens on the page, in the same voice as the rest of the book — what passes '
   + 'between them, what is said, what changes. Bodies are present and not itemised. Adult '
   + 'characters only.',
  4: 'Register: sex is written directly, in plain words, with the acts named as they happen. It is '
   + 'a scene like any other and still has to move the story. Vocabulary follows the voice. Adult '
   + 'characters only.',
  // "for as long as the scene runs" until 2026-10-29: an order to keep writing, in the same prompt
  // as the length limit, and every book in the library is at this level.
  5: 'Register: fully explicit, in unrestricted detail. Do not fade, summarise, cut away or skip '
   + 'ahead. Stop at the passage\'s length: a scene can go on in the next passage. Vocabulary follows '
   + 'the voice. Adult characters only.',
};

/** THE FIRST PASSAGE OF A SCENE THAT HAS AN OPENING, in Continue's place (see where MODE is sent). */
const OPENING = 'Write the first beat of a new scene, and stop.\n'
  + 'The scene above has ended. Open where and when "How this chapter opens" says, even if that is\n'
  + 'another place or a later day. Do not continue the scene above, and do not repeat or summarise it.\n'
  + 'Stop when the beat is done, however short that is.';
/** The same, as one line after another mode's own words. */
const OPENING_LINE = 'This passage begins a new scene. Open it as "How this chapter opens" above says, not where the prose above ends.';

/** THE FIVE WRITING MODES' SHIPPED WORDING, as templates, filled exactly as a writer's own wording is
 *  ({{speaker}}, {{directive}}, {{words}} the slider, {{last}} the newest passage, quoted at the end and
 *  taken out of the prose so it is sent once). A writer's own wording for a mode replaces it whole.
 *
 *  SETH'S WORDING IS THE DEFAULT (2026-11-06: "make the new ones on mine the default"), as he had it
 *  that day, Act's "reacts to" included (F75). It replaced the 2026-10-31 shipped set, which was his
 *  earlier wording: that Act said "Rewrite it so that it fits the narrative", against his standard for
 *  Act. NOT MEASURED against the wording before it, except Act's one change.
 *  ONE PHRASE HELD BACK, as on 2026-10-31: his Continue ends "even if that is three sentences", and F18
 *  measured that a length named in the prompt is a length the model fills. The shipped line keeps the
 *  permission to be short without the number; his saved wording keeps his.
 *  In `direct` the writer's text is an INSTRUCTION and never reaches the page; in `speak`, `act` and
 *  `narrate` it is already the newest passage and the model answers it. Getting that backwards is what
 *  made typed dialogue vanish into the prompt. */
export const MODE_WORDING: Record<string, string> = {
  continue: "Write what happens next in the scene, from everything in the story so far: the prose, the threads, and where each one stands.\n"
    + "Carry the scene forward by one full beat, and stop.\n"
    + "Start where the last thing that happened ends. Do not repeat, rephrase or summarise anything already written.\n"
    + "Do not skip time. Do not introduce a new character, location, or revelation unless the story so far set it up.\n"
    + "Something must change by the end of the beat: what someone wants, knows, or holds over another.\n"
    + "Keep each character true to their thread: their voice, their wants, their limits.\n"
    + "Choose the particular over the general: a detail only this place and these people would have, never a stock phrase.\n"
    + "Let what matters stay under the surface: people say less than they mean.\n"
    + "Stop when the beat lands, however short that is.\n"
    + "Write no more than {{words}} words. Stop sooner if the beat is done.\n"
    + "\n"
    + "The last thing that happened: {{last}}",
  speak: "{{speaker}} has just spoken a line of dialogue, given at the end.\n"
    + "Write how another character in the scene answers it: what they say back, a reaction, or a silence that says something. One answer is a whole answer.\n"
    + "Do not put further words in {{speaker}}'s mouth, and do not decide what {{speaker}} does next. Do not repeat, quote or paraphrase the line.\n"
    + "Something must change by the end of the beat: what someone wants, knows, or holds over another.\n"
    + "Keep each character true to their thread: their voice, their wants, their limits.\n"
    + "Choose the particular over the general: a detail only this place and these people would have, never a stock phrase.\n"
    + "Let what matters stay under the surface: people say less than they mean.\n"
    + "Write no more than {{words}} words. Stop sooner if the beat is done.\n"
    + "\n"
    + "What {{speaker}} just said: {{last}}",
  act: "{{speaker}} has just taken an action, given at the end. It has already happened: do not write it again or describe it a second time.\n"
    + "Write how another character in the scene reacts to it with an action of their own. They may speak as they do it, but their reaction is something they do.\n"
    + "Do not decide what {{speaker}} does or says next.\n"
    + "Something must change by the end of the beat: what someone wants, knows, or holds over another.\n"
    + "Keep each character true to their thread: their voice, their wants, their limits.\n"
    + "Choose the particular over the general: a detail only this place and these people would have, never a stock phrase.\n"
    + "Let what matters stay under the surface: people say less than they mean.\n"
    + "Answer with a deed, not a glance: begin with what they do.\n"
    + "Write no more than {{words}} words. Stop sooner if the beat is done.\n"
    + "\n"
    + "What {{speaker}} just did: {{last}}",
  direct: "The writer has written a short synopsis of what should happen next. Rewrite it as one full beat of the story: prose, in the voice of the scene, played out in the moment rather than summarised.\n"
    + "Everything the synopsis says happens must happen. Add no event it does not ask for, and do not go past where it ends.\n"
    + "Start where the story so far ends. Do not repeat or rebuild what is already written.\n"
    + "Something must change by the end of the beat: what someone wants, knows, or holds over another.\n"
    + "Keep each character true to their thread: their voice, their wants, their limits.\n"
    + "Choose the particular over the general: a detail only this place and these people would have, never a stock phrase.\n"
    + "Let what matters stay under the surface: people say less than they mean.\n"
    + "Write no more than {{words}} words. Stop sooner if the beat is done.\n"
    + "\n"
    + "The synopsis: {{directive}}",
  narrate: "The writer has just written what happens, given at the end. It is the story itself, not an instruction.\n"
    + "Continue from where it stops. Pick up mid-thought if its last line is unfinished.\n"
    + "Do not rewrite it, repeat it, summarise it, or comment on it. Match its voice.\n"
    + "Carry on what the writer started and raise its pressure: by the end something has changed, in what someone wants, knows, or holds over another.\n"
    + "Keep each character true to their thread: their voice, their wants, their limits.\n"
    + "Choose the particular over the general: a detail only this place and these people would have, never a stock phrase.\n"
    + "Let what matters stay under the surface: people say less than they mean.\n"
    + "Stop at a natural beat, however few sentences that takes.\n"
    + "Write no more than {{words}} words. Stop sooner if the beat is done.\n"
    + "\n"
    + "What the writer just wrote: {{last}}",
};

/** Talk's frame. Not a writing mode, so it has no template and no writer's wording. */
const MODE: Record<string, (d?: string, who?: string) => string> = {
  /* THERE IS NO `regenerate` HERE, AND THAT IS THE POINT. One lived here from 2026-09-01 to
   * 2026-09-18 — "Write this passage again. Same moment, same canon, a different take on it." —
   * and it named something the prompt does not contain. A re-roll of passage N is assembled from
   * the passages BEFORE N (`assemble`, `ordinal < upToOrdinal`), because a new take must not be
   * written with knowledge of what came after it. So the last passage the model could see was
   * N-1, and "this passage" resolved to that: press Regenerate and the model rewrote the passage
   * BEFORE the one you pressed it on. In a book where the writer narrates and the model answers,
   * that handed her back her own paragraph every single time.
   *
   * A re-roll re-runs the instruction the passage was written with instead — see `inherit` in
   * routes.ts. The prompt is then identical to the one that produced the passage, which is the
   * only thing "again" can honestly mean when the passage itself is not in the prompt. */
  // Not a writing mode. Anansi answers the writer rather than continuing the book, so this block
  // says what the material above IS — otherwise a model handed canon and prose does the thing it
  // has been doing all along and writes the next passage.
  // "Talking to you", not "about this story" (Seth, 2026-10-30: asked "Who are you?", Anansi answered
  // with a speech about the story). NOT MEASURED.
  talk: (d) => `The writer is talking to you, not asking for prose.\n`
    + `Everything above is what you know about their story. Do not continue the story.\n\n`
    + `They say: ${d ?? ''}`,
};

/** The wording a mode is sent with: the writer's own for it, else the shipped template. A request with
 *  a mode that is not one (a stale tab's old name) gets Continue's, as it always has; Talk has none. */
function wordingOf(mode: string, mine?: Record<string, string>) {
  if (mode === 'talk') return undefined;
  const key = MODE_WORDING[mode] ? mode : 'continue';
  return (MODE_WORDING[mode] ? mine?.[key]?.trim() : '') || MODE_WORDING[key];
}

/* WHEN YOU REWEAVE: the frame around the writer's What didn't work note, sent after the passage's
 * own instruction on a reweave that has a note, and never when it has none (docs/adr/0012). It is
 * Account → Writing → When you reweave, and this is the shipped wording that box starts from and
 * Reset puts back. The writer edits the WORDING; the engine inserts the VALUE:
 *   {{whatfailed}} the writer's note, inserted as typed.
 *
 * THE TAKE BEING REPLACED IS NOT SENT. From earlier on 2026-10-29 it was, framed as the version
 * being replaced, with a `{{replaced}}` placeholder. On Seth's tale (scene 2, ordinal 34) GLM-4-32B
 * on Featherless first wrote a continuation of the replaced take, and on the next reweave returned
 * that take byte for byte, on a fresh seed. So this wording has to make sense without the take: it
 * says the last version is not shown, and asks for what the note describes to be avoided.
 * SHAPES, NO EXAMPLES: the real model copies quoted text, so nothing here is a sample sentence.
 * NOT MEASURED against the plain reweave; owed an A/B (bench/ab.ts, two arms at once). */
export const REWEAVE = '[A note from the writer on what did not work the last time this passage was written. '
  + 'That attempt is not shown. Do what the note asks, and avoid what it describes: {{whatfailed}}]';

/** THE NOTE FRAME IN FORCE for a saved value. REPAIRED ON READ, never rewritten in the table:
 *  - empty: the shipped `REWEAVE`;
 *  - holds `{{replaced}}`: saved between 17ff4fa and the later 2026-10-29 change, written around a
 *    take that is no longer sent, so its fence lines would name a text that is not there. The
 *    shipped `REWEAVE`;
 *  - holds no `{{whatfailed}}`: a line saved before 17ff4fa (it was added after the frame then), or
 *    a save without the placeholder. It goes after the shipped `REWEAVE`, so the note keeps its
 *    frame and the writer's words are still sent, after the note, where the old line went;
 *  - otherwise the writer's own.
 *  The editor shows the same repair, so Save stores what is sent. */
export const reweaveOf = (saved?: string | null) => {
  const t = saved?.trim();
  if (!t || /\{\{\s*replaced\s*\}\}/.test(t)) return REWEAVE;
  return /\{\{\s*whatfailed\s*\}\}/.test(t) ? t : `${REWEAVE}\n${t}`;
};

/** IN FORCE AT THIS CHAPTER. Not yet true, or finished — the same two questions `resolveBody` asks
 *  of a state, asked of an addon. An addon with no `fromChapter` has always been true. */
const live = (a: Addon, at: number) =>
  (a.fromChapter == null || a.fromChapter <= at)
  && (a.retiredAtChapter == null || a.retiredAtChapter > at);

/** The rooms of the card that are open right now, each as its own bracket under the body.
 *
 *  TWO WAYS IN, AND THEY ARE A UNION — not a new rule. `active` is the writer pinning it on; keys
 *  are it arriving on its own. That is exactly what an entry already does with `force_in` or a
 *  keyword at the loop below, so there is no second firing semantics to keep in step.
 *
 *  THE OUTFIT SLOT IS A ROOM LIKE ANY OTHER NOW. It was skipped here until 2026-08-28 because the
 *  surface still wrote the older `outfits` table and reading the migration's copies as well would
 *  have put the coat in the prompt twice. The surface writes addons, so `worn()` and that skip are
 *  both gone and there is one table, one firing path and one way in.
 *
 *  IT KEEPS ITS OWN SENTENCE, and that is not decoration: "[Aldis wears: wool, shiny cuffs]" says
 *  she has it ON, and "[the grey coat: wool, shiny cuffs]" says only that the coat exists. The
 *  wardrobe is the one slot where the room's NAME is not what the model needs to be told.
 *
 *  `fires` is the shipped matcher with the addon's keys swapped in, never a second copy of it:
 *  the fold, the proper-noun exemption and multi-word order all have to behave the same here or a
 *  relationship fires on a rule a character would not. */
/** #79 · THE LAST OF THESE EVENTS TO HAVE HAPPENED BY A SCENE, in the order they were written within
 *  a scene. Undefined when none has, which is different from "none were ever written". */
const lastBy = (e: Entry, kinds: string[], at: number) =>
  (e.events ?? []).filter((x) => kinds.includes(x.kind) && x.fromChapter <= at)
    .map((x, i) => ({ x, i })).sort((a, b) => a.x.fromChapter - b.x.fromChapter || a.i - b.i).at(-1)?.x;

/** #79 · THE OUTFIT WORN AT A SCENE: the one put on most recently by then, or null. A thread with no
 *  wear events yet (written before they were dated) is wearing what its switch says. */
export function wornAt(e: Entry, at: number): string | null {
  if (!(e.events ?? []).some((x) => x.kind === 'wear' || x.kind === 'unwear'))
    return (e.addons ?? []).find((a) => a.slot === 'outfit' && a.active)?.id ?? null;
  const last = lastBy(e, ['wear', 'unwear'], at);
  return last?.kind === 'wear' ? last.addonId ?? null : null;
}

/** #79 · THE SCENE A THREAD WAS RETIRED AT, IF IT STILL IS AT THIS ONE: retired and not brought back
 *  since. A thread with no dated retirement reads its `retiredAtChapter`, as before. */
export function retiredAt(e: Entry, at: number): number | null {
  if (!(e.events ?? []).some((x) => x.kind === 'retire' || x.kind === 'return'))
    return e.retiredAtChapter != null && e.retiredAtChapter <= at ? e.retiredAtChapter : null;
  const last = lastBy(e, ['retire', 'return'], at);
  return last?.kind === 'retire' ? last.fromChapter : null;
}

/** #109 · A STORED DESCRIPTION WITH THE OLD WRAPPER TAKEN OFF, so the frame is the only one (ADR 0008):
 *  `slots.plain`, the rule the floor that stores a pocket uses too (#110), so storage and the prompt
 *  agree on what a wrapper is. Framing a wrapped body as it is gives `[What …: [Aldis Fen: …]]`.
 *  Here the lines are also trimmed and blank ones dropped, which the prompt wants and a writer's box
 *  does not. Read-only: what is stored does not change. */
const unwrapped = (body: string, names: string[]): string =>
  plain(body, names).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

/** #93 · A POCKET'S TEXT AS A PROMPT SHOWS IT UNFRAMED, by its kind and name: the thread-change ask
 *  (routes.ts `remember`), whose answer names pockets by kind. The same strip `rooms` frames, so an
 *  old wrapper is never shown twice. */
export const pocketText = (e: Entry, a: { slot: string; name?: string | null; body: string }): string =>
  unwrapped(a.body, wrapperNames(a.slot, (e.title || '').trim(), (a.name || '').trim()));

/** #109 · THE FRAME EACH POCKET KIND READS UNDER, for the kinds in `SLOTS` that had none (outfit,
 *  voice and interiority are framed in `rooms` itself). NOT MEASURED, every one: owed an A/B
 *  against the generic `[label: text]` form before anyone calls it an improvement. */
const FRAMES: Record<string, (who: string) => string> = {
  appearance:    (who) => `What ${who} looks like`,
  relationships: (who) => `How ${who} stands with others`,
  atmosphere:    (who) => `The feel of ${who}`,
  who_is_here:   (who) => `Who is found at ${who}`,
  what_it_does:  (who) => `What ${who} does`,
  consequences:  (who) => `What follows when ${who} is broken`,
};
/** #127 · ADR 0011. THE FRAME EACH KIND OF STRING READS UNDER, the tale's thread's pockets in `SLOTS`,
 *  heading its kind's list in the STRING block. Moved, not written new: the promise keeps the block's
 *  own words from before kinds ("Unpaid, and in play … do not resolve one unless the writer asks for
 *  it") with the scene brief's "can be pressed on" (CHAPTER); the open question takes the brief's
 *  #116 words (OPEN QUESTIONS, keep it in view, complicate it, never answer it).
 *  NOT MEASURED: the split into two frames has not been run against the single frame it replaced.
 *  #128 · Also each kind's rule when Ask Anansi writes a string (`prompts.ts` INVENT): one wording. */
export const STRING_FRAMES: Record<'promise' | 'question', string> = {
  promise: 'Unpaid promises, in play. Let them shape what the characters want and avoid; one may be pressed '
    + 'toward payment, but do not resolve one unless the writer asks for it.',
  question: 'Open questions the tale lives on, in play. Keep each one in view; a scene may complicate one, '
    + 'never answer it.',
};

/** #134 · HOW A POCKET REACHES THE MODEL: its `activation`, or, on a row with none, by the one rule
 *  for the old switch: on is On, off with wake words is On a word, off without is Off (an off pocket
 *  with no word to wake it was never sent). A rule of the tale was sent another way: on is On a word
 *  with wake words and On without, and off is Off. The same rule is written in SQL in `src/db.ts`
 *  (`oldSwitchSQL`) and in `web/model.js`; test/db.ts runs every case through each copy. */
export const pocketReach = (a: { activation?: Addon['activation']; active?: boolean; keys?: string[]; slot?: string }):
  'always_on' | 'triggered' | 'off' => {
  if (a.activation) return a.activation;
  const words = (a.keys ?? []).length > 0;
  if (a.slot === 'rule') return a.active ? (words ? 'triggered' : 'always_on') : 'off';
  return a.active ? 'always_on' : words ? 'triggered' : 'off';
};

/** The framed kinds that are exclusive in `SLOTS`: one per thread, so a label tells nothing apart. */
const SOLO = new Set(EXCLUSIVE_SLOTS);

const rooms = (e: Entry, at: number, window: string, locked = '', tells = false): string[] =>
  (e.addons ?? [])
    // ALWAYS TRUE IS NOT A POCKET (#77, ADR 0005). It is stored as the `facts` addon and read by
    // `alwaysTrue` below, ahead of everything; every other room keeps the order the view gave it.
    .filter((a) => a.slot !== 'facts')
    .filter((a) => live(a, at))
    // An outfit is worn by the dated wardrobe (#79, `wornAt`), not by a switch that only knows now,
    // and still arrives on its own words. Every other pocket by its activation (#134): On always, On
    // a word when a word fires, Off never, not even on its word.
    .filter((a) => {
      const hit = () => fires({ ...e, keys: a.keys ?? [] }, window).length > 0;
      if (a.slot === 'outfit') return wornAt(e, at) === a.id || hit();
      const reach = pocketReach(a);
      return reach === 'always_on' || (reach === 'triggered' && hit());
    })
    .map((a) => {
      const who = (e.title || '').trim();
      // ONE STRIP FOR EVERY WRAPPED ROOM. 43 of the live library's non-facts rooms are stored as
      // `[short sentences; …]` — that is the form `src/forge.ts` teaches a foreign model to write a
      // card in, so it is the normal case and not a data error. Wrapping the wrapper gives
      // `[How she got here: [bought The Monarch…]]`, which is the `[You: [You: …]]` defect Always
      // true was written to avoid, arriving through eleven other slots instead. `unwrapped` is the one
      // strip, Always true's and every pocket's, and it says why it refuses anything ambiguous.
      const label = (a.name || '').trim();
      const body = unwrapped(a.body, wrapperNames(a.slot, who, label));

      if (a.slot === 'outfit') return `[${who || 'They'} wears: ${body}]`;
      // VOICE IS THE SECOND SLOT WHERE THE ROOM'S NAME IS NOT WHAT THE MODEL NEEDS TO BE TOLD, and
      // the argument is the outfit's one line above, applied to the other room it fits.
      //
      // `[voice: clipped, never swears]` is a NOTE ABOUT how she sounds. F37 measured that exact
      // distinction and it is the largest effect in P0-FINDINGS: the same rule buried in a line
      // bought 10.7%, and written as an instruction on its own line, naming the thing to produce
      // with the forms spelled out, it holds at ~98%. Every character voice in the library was
      // arriving in the losing shape — a description filed between `[interiority: …]` and
      // `[relationships: …]` inside a canon card.
      //
      // It names DIALOGUE, not the character, because that is the half F37 says has to be explicit:
      // the room governs what comes out of their mouth and nothing about the narration around it.
      //
      // NOTHING IS CLAIMED FOR IT YET. `bench/cast.ts` is the detector and its baseline is 11
      // chapters, which decides nothing — this is F37's shape applied to the one place that was
      // not using it, and it is owed a measurement before anyone calls it a fix.
      // #73. AND THE NARRATION KEEPS OUT OF HOW THEY SOUND. "The letters thick with her accent even in
      // digital form" was the narration saying a voice pocket back. NOT MEASURED: owed the #73 voice A/B.
      // SCOPED TO SOUND since 2026-10-27. It read "Show it only in what they say; the narration never
      // names or describes it", which made EVERYTHING in the pocket dialogue-only — and a voice pocket
      // written the old way holds who someone is as well (Kia's Talia: her whole personality). For a
      // viewpoint character that forbade the narration her inner life, and her tale went flat the
      // day it shipped (10-26) with nothing else changed. Seth's accent case is still covered.
      // THE LOCKED CHARACTER'S VOICE IS NOT FRAMED AS DIALOGUE TO WRITE (prompt audit, 2026-10-27):
      // the frame asked for his dialogue while his pocket and the lockout forbade it. Bare instead.
      // #119 · AND IN FIRST OR SECOND PERSON IT IS NOT SENT AT ALL. He is the narrator there, and
      // DIRECTIVE's narrator line carries the whole Hands-off rule; a pocket saying "never write
      // what he thinks" beside narration that is his thought was a second rule against the first.
      if (a.slot === 'voice' && locked && who.toLowerCase() === locked.toLowerCase())
        return tells ? '' : `[${body.replace(/[.\s]+$/, '')}]`;
      if (a.slot === 'voice') return `[When ${who || 'they'} speaks, write the dialogue this way: ${
        body.replace(/[.\s]+$/, '')}. The narration never names how they sound.]`;

      // INTERIORITY IS THE THIRD ROOM WHOSE NAME IS NOT WHAT THE MODEL NEEDS TO BE TOLD, and its
      // own definition in `src/forge.ts` is why: "What they will not say out loud, AND WHAT THEY DO
      // INSTEAD of saying it." That second clause is the behaviour half, and `[Product or predator:
      // Feels real only when holding the knife…]` says nothing about what that text is for.
      //
      // IT DOES NOT RESTATE THE CRAFT RULE. `DEFAULT_VOICE` already carries "Show an interior state
      // through speech, posture or action, never by naming it" — repeating it here would be a rule
      // the writer cannot delete by editing their own voice, which is the trap `render.ts` sets out
      // at length. The frame names the target; the voice keeps the craft.
      //
      // AND IT KEEPS THE WRITER'S LABEL, WHERE VOICE DROPS IT. That is not a style choice, it is
      // `SLOTS`: voice is exclusive and there is only ever one, so "How she sounds" adds nothing.
      // Interiority is not — a character carries three at once, and the live library's labels are
      // what tell them apart ("Product or predator", "The life that stops at the door"). Dropping
      // them would render three rooms under three identical frames.
      if (a.slot === 'interiority') {
        const tail = label && !(who && label.toLowerCase() === who.toLowerCase()) ? ` — ${label}` : '';
        return `[What ${who || 'they'} will not say, and what they do instead${tail}: ${body}]`;
      }

      // #109 · EVERY OTHER KIND IN `SLOTS` HAS ITS OWN FRAME (ADR 0008): the thread's name and what
      // the text is for, in the shape of the three above. Exclusive kinds drop the label, as voice
      // does; the rest keep it after a dash, as interiority does, and for interiority's reason.
      // NOT MEASURED: each is owed an A/B against the generic `[label: text]` form as a control.
      const head = FRAMES[a.slot];
      if (head) {
        const own = label.toLowerCase();
        const tail = !SOLO.has(a.slot) && label && own !== who.toLowerCase()
          && own !== a.slot && own !== a.slot.replace(/_/g, ' ') ? ` — ${label}` : '';
        return `[${head(who || 'this thread')}${tail}: ${body}]`;
      }

      // A LABEL THAT REPEATS THE CARD'S OWN TITLE IS NOT A LABEL. Two `role` rooms in the live
      // library are named after their character, so Seth's card arrived carrying `[Seth: protagonist,
      // a loner…]` from facts and `[Seth: abducted; hooded; dragged from apartment…]` from role,
      // with nothing to say which was which. Falling back to the room's own name says at least
      // what kind of fact it is, which is what a canon room needs — these are what is TRUE, and
      // SYSTEM's "canon is what is true, never how to say it" is why they get a label and not an
      // instruction the way voice and interiority do.
      //
      // #109 · AND IT NAMES THE THREAD (ADR 0008). This is where the writer's own pockets and the
      // folded kinds land: no kind says what the text is for, so the plain frame is the thread and
      // the label. NOT MEASURED: owed an A/B against the bare `[label: text]` form it replaced.
      const frame = !label || (who && label.toLowerCase() === who.toLowerCase())
        ? a.slot.replace(/_/g, ' ') : label;
      return `[${who ? `${who} — ` : ''}${frame}: ${body}]`;
    });

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
/** #78 · THE OVER TIME ENTRY IN FORCE AT A SCENE: the latest to have opened, or undefined when none
 *  has and the thread's own text (where it stands from scene 1) is. The one rule for it: the model
 *  is sent through `resolveBody`, and the screens are told through the story view's `nowStateId`. */
export const stateInForce = (e: Entry, chapter: number) =>
  [...(e.states ?? [])].sort((a, b) => a.fromChapter - b.fromChapter).filter((s) => s.fromChapter <= chapter).at(-1);

export function resolveBody(e: Entry, chapter: number): string {
  if (!e.states?.length) return e.body;
  const ordered = [...e.states].sort((a, b) => a.fromChapter - b.fromChapter);
  const inForce = stateInForce(e, chapter);
  const hints = ordered
    .filter((s) => s.fromChapter > chapter && s.beforeMode === 'hint')
    .map((s) => s.label?.trim() || 'something here is not yet known');
  return [inForce?.body ?? e.body, ...hints.map((h) => `[not yet known: ${h}]`)].join(' ');
}

/** #77 · WHO OR WHAT THE THREAD IS, which does not change through the tale (ADR 0005). Stored as the
 *  `facts` addon, so this is the one reader of it as Always true. It returns the stored text; the
 *  prompt reads it through `framedAlwaysTrue` below (#109). A body stored the old way IS the card
 *  format (`[Seth: protagonist…]`), and wrapping that once produced `[You: [You: …]]`. Not
 *  switched or woken like a pocket: a thread's Always true goes wherever the thread goes. */
export const alwaysTrue = (e: Entry): string =>
  ((e.addons ?? []).find((a) => a.slot === 'facts')?.body ?? '').trim();

/** #109 · ALWAYS TRUE AS THE MODEL READS IT (ADR 0008): the stored description, framed with the
 *  thread's name. `alwaysTrue` above stays the stored text, for the prompts that show it to be
 *  edited. NOT MEASURED: the frame is owed an A/B against the bare form before it is called a fix. */
const framedAlwaysTrue = (e: Entry): string => {
  const who = (e.title || '').trim();
  const body = unwrapped(alwaysTrue(e), wrapperNames('facts', who));
  return body ? `[What is always true of ${who || 'this thread'}: ${body}]` : '';
};

/** #114 · WHERE IT STANDS AS THE MODEL READS IT (ADR 0008): the thread's own text, or the Over time
 *  entry in force, framed `[Seth: …]` with the thread's name. That is the form the finders stored it
 *  in until #114, so a thread the update took the wrapper off reads to the model exactly as it did;
 *  one stored plain all along gains the frame. NOT MEASURED: the frame on those is owed an A/B
 *  against the bare form before it is called a fix. A body still stored wrapped (a copy from before
 *  the update) is unwrapped first, so it is never framed twice. The hints `resolveBody` adds for
 *  entries not yet open follow it, unframed, as they always did. */
const framedStands = (e: Entry, at: number): string => {
  const who = (e.title || '').trim();
  const body = unwrapped(stateInForce(e, at)?.body ?? e.body ?? '', [who]);
  const hints = resolveBody({ ...e, body: '', states: (e.states ?? []).map((s) => ({ ...s, body: '' })) }, at).trim();
  return [body ? `[${who ? `${who}: ` : ''}${body}]` : '', hints].filter(Boolean).join(' ');
};

/** THE CARD AS THE MODEL SEES IT: what is in force at this chapter, plus every room switched on.
 *
 *  This exists because reading `resolveBody` alone stopped being the same thing as reading the card
 *  on 2026-08-29, when every body in the library moved into a `facts` room. The canon check's reader
 *  (deleted 2026-10-28) was fixed that morning and the other three callers were not, so the memory
 *  pass spent a chapter end asking
 *  the model what had changed about "Halloran: " — the name, a colon, and nothing. It answered by
 *  writing a whole description and filing it under `facts`, which is the correct answer to the
 *  question it was actually asked. The defect read as the model ignoring its instructions.
 *
 *  With no window, only rooms that are switched ON are included; pass the chapter's text and rooms
 *  whose keys fire come too, which is what the prompt builder wants and a cast list does not. */
export const cardText = (e: Entry, at: number, window = '', locked = '', tells = false) =>
  [framedAlwaysTrue(e), framedStands(e, at), ...rooms(e, at, window, locked, tells)].map((x) => x.trim()).filter(Boolean).join('\n');

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
 *  to decide what is TRUE reads this instead of the raw text. `quotedSpans` below is the shared
 *  half for a caller that needs the offsets; what each caller does with the spans is its own. */
/** ONE PATTERN, TWO SHAPES, because the bug was in the pattern and it was written out twice.
 *
 *  A generation that hits the token ceiling stops mid-line, leaving an opening quote with no
 *  partner. Until 2026-08-30 the pattern required a closing quote, so that final unterminated span
 *  was NOT recognised as dialogue and every quality check read it as narration — the one thing
 *  this function exists to prevent. `bench/council06.ts` measured 8 of 60 generations ending that
 *  way, and 46 passages in the live library are in that state right now.
 *
 *  `(?:["”]|$)` lets the end of the text close a span. Measured against all 1,986 live passages:
 *  46 change and all 46 are the trailing case. A line-anchored version was tried first and is NOT
 *  what shipped — it fixes four more but breaks four real speeches that carry a newline inside
 *  them, which is a worse trade.
 *
 *  A QUOTE THAT OPENS ENDS ANY SPAN STILL OPEN (#93). Every caller joins a scene's passages and then
 *  strips, so one passage cut off mid-speech used to run its span into the next passage and close
 *  on that passage's first OPENING quote; every quote after it paired the wrong way round, the
 *  narration was stripped and the dialogue kept (The Lands Between, scene 7). A straight quote now
 *  reads its neighbours: it opens at the start of a line, or after a space, bracket or dash with
 *  text after it; anywhere else it closes. Curly quotes say which they are. A span ends at a closing
 *  quote, or just before an opening one, or at the end. Stopping at a blank line instead was tried
 *  and is NOT what shipped: in the library a passage often stops mid-speech and the next one carries
 *  it on ("I approve of his" / "survival instinct."), and that rule reads the carried half as
 *  narration. Measured on 2026-10-30 against the latest export of all 35 books (1,917 passages, 69 scenes
 *  joined): 14 passages and 5 joined scenes change, and every changed line was read: the narration
 *  gained is narration and the text lost is speech. A speech over two paragraphs, each opened and
 *  only the last closed, is now read right as well.
 *
 *  ITS CEILING, so a pass is not read as proof: an unterminated speech still takes the narration
 *  after it, up to the next opening quote. A closing quote with a space each side of it reads as
 *  closing, and one with a space before it and text after it ("Stop! "he said) reads as opening.
 *  Speech typed with no quotes at all (a writer's own turn) is narration to this, and nothing here
 *  can tell it apart. Single-quote and em-dash dialogue are not seen at all (COUNCIL-06 §6, trap 1). */
const OPENS = String.raw`(?:“|(?<![^\n])"|(?<![^\s(\[{—–-])"(?=\S))`;
const QUOTED = () => new RegExp(String.raw`${OPENS}[^"“”]*(?:(?=${OPENS})|["”]|$)`, 'g');

/** The quoted spans as offsets, for a caller that needs to know WHERE rather than get the text
 *  back without them (`bench/cast.ts`). One pattern, so the offsets and the strip cannot disagree. */
export const quotedSpans = (text: string): [number, number][] =>
  [...String(text ?? '').matchAll(QUOTED())].map((m) => [m.index!, m.index! + m[0].length]);

export const narrationOnly = (text: string) =>
  String(text ?? '').replace(QUOTED(), ' ').replace(/[ \t]{2,}/g, ' ');

/** A text's narration as words: lower case, letters, digits and apostrophes only. The one tokeniser
 *  for the echo measures in bench/ (bench/echo.ts) and for `openingOf`, so a take the app calls a
 *  same opening is one the bench counts as one. */
export const narrationWords = (text: string) =>
  narrationOnly(text).toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? [];

/** A take's opening: its first five narration words, or '' under five. F66 measured a reroll
 *  starting with the rejected take's opening in 16% of rerolls, and every repeat read by eye copied
 *  the opening and then went elsewhere. Five words, the echo detector's phrase length: two takes
 *  that share them were not opened apart. */
export const openingOf = (text: string) => {
  const w = narrationWords(text);
  return w.length < 5 ? '' : w.slice(0, 5).join(' ');
};

/** The facts in a piece of ledger text, as a set: the names and the numbers.
 *
 *  Used for two different jobs that ask the same question — did the FACTS change, or only the
 *  wording? `bench/compact.ts` asks it of a rewrite, to refuse one that dropped a name while
 *  shortening. `db.staleSummariesFor` asks it of a card edit, to decide whether the chapter
 *  summaries describing that card are now lying.
 *
 *  ponytail: lexical, so it catches a DROP and not a DISTORTION. "thirty-four" for "34" reads as
 *  a change; a fact restated in other words reads as no change. The upgrade path is a model call
 *  asking what was lost, which costs one call per comparison — worth it only if this misses things
 *  in practice. Both callers FLAG rather than act, which is the right way round for that ceiling. */
/** A CAPITALISED WORD IS A NAME WHEN IT APPEARS SOMEWHERE A SENTENCE DOES NOT BEGIN.
 *
 *  This was a stopword list until 2026-08-30 and the list was the wrong shape. It held back 89 of
 *  the first 140 rewrites in the full compaction — 64% — on words like `Upon`, `During`, `Unlike`,
 *  `Instead`, `Despite`. Every one of those is a word that can open a sentence, and no list is
 *  ever finished, because ANY word can open a sentence.
 *
 *  The positional rule needs no list. `Emperor` earns its place because the text also says "the
 *  Emperor's forces"; `During` never appears anywhere but at a full stop. Checked against the 348
 *  over-band rooms in the two imported books, both directions: all 17 real proper nouns kept
 *  (Emperor, Legion, Imperium, Primarchs, Astartes, Mechanicus, Warp, Unification, Wars...) and
 *  all 12 sentence-openers dropped. No misses either way.
 *
 *  THE LABEL IS ADDED BACK BY NAME. The card's own name lives at the front — `[Halsey: 34, ...]` —
 *  which is a position a sentence begins in, so the positional rule alone would ignore the one
 *  fact that matters most. It costs one regex and it closes the hole the rest of the rule opens.
 *
 *  The old list's documented ceiling is gone with it: a character NAMED for a common word is now
 *  visible, because it is the position that decides and not the spelling. `The Anagram of Ash`
 *  carried a card called "You" this morning, which the list could not see at all. */
const labelOf = (t: string): string[] => {
  const m = /^\s*\[?\s*([^:\]\n]{1,60}?)\s*:/.exec(t);
  return m ? (m[1]!.match(/\b[A-Z][a-z]{2,}\b/g) ?? []) : [];
};

const namesIn = (t: string): string[] => {
  // THE POSITION IS COMPUTED FROM THE TEXT, not read off an optional capture group. The first
  // version put `(^|[.;:!?—\n[(]\s*)?` in front of the word and asked whether the group had
  // participated — and at index 0 V8 reports it as `undefined` even though `^` is what matched
  // there, so the single most certain sentence-opening in the string read as mid-clause. Slicing
  // is longer and cannot be wrong about it.
  const seen = new Map<string, boolean>();
  for (const m of t.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
    const w = m[1]!;
    const before = t.slice(0, m.index!);
    const opens = /^\s*$/.test(before) || /[.;:!?—\n[(]\s*$/.test(before);
    if (!seen.has(w)) seen.set(w, true);
    if (!opens) seen.set(w, false);
  }
  return [...seen].filter(([, onlyAtStart]) => !onlyAtStart).map(([w]) => w);
};

export const factsIn = (t: string): string[] => {
  const text = String(t ?? '');
  return [...new Set([
    // `\d[\d,.:-]*\d|\d` and NOT `\d[\d,.:-]*`: the greedy form swallows the comma after a
    // number, so "34," is compared against "34" and a repunctuated fact reads as lost.
    ...(text.match(/\d[\d,.:-]*\d|\d/g) ?? []),
    ...labelOf(text),
    ...namesIn(text),
  ])];
};

export const factsLost = (before: string, after: string): string[] =>
  factsIn(before).filter((k) => !after.includes(k));

/** THERE IS NO `factsChanged`, and the reason is worth keeping. The two-way version was written
 *  first — a card that GAINED a name has also stopped matching what was written before it — and
 *  it fired on punctuation: rewriting "34, owes Marek" as "34. Owes Marek" capitalises a verb,
 *  which reads as a new name, which reads as a changed fact, on an edit that changed nothing.
 *  No stopword list fixes that; any word can start a sentence.
 *
 *  So the question both callers actually ask is the one-way one above, and `db.staleSummariesFor`
 *  narrows it further: a summary is stale only when a fact IT MENTIONS has left the card. That is
 *  the condition under which a summary is actually lying, and it cannot be reached by
 *  repunctuation. */

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

/** #56 · WHETHER A WEAVING CALL FITS: the same book assembled twice, once with the normal reply
 *  reserve (`normal`) and once with the weaving one (`woven`), which differ only in budget.
 *
 *  Null when weaving costs the book nothing. Otherwise the blocks the normal assembly kept and the
 *  weaving one left out, and whether the weaving prompt overflows outright. The engine has no
 *  'partial' state (see Block in blocks.ts), so "a block made partial or omitted" is exactly
 *  "omitted, or the prompt overflowed".
 *
 *  A book that overflows WITHOUT weaving is not refused here: that is the overflow error the call
 *  already gives, and weaving has nothing to do with it. Pure, like `buildContext`: the caller
 *  assembles both and decides what to do with the answer. */
export function weaveFit(normal: Manifest, woven: Manifest): { drops: Block[]; overflows: boolean } | null {
  if (normal.overflowed) return null;
  const kept = new Set(normal.blocks.filter((b) => b.state === 'included').map((b) => `${b.kind}\u0000${b.id}`));
  const drops = woven.blocks.filter((b) => b.state !== 'included' && kept.has(`${b.kind}\u0000${b.id}`));
  return drops.length || woven.overflowed ? { drops, overflows: woven.overflowed } : null;
}

/** The cards a closing chapter may be ASKED to finish. PLAN-08 Phase 4.
 *
 *  A gate in front of the model, not a decision. Three refusals, and each one is a defect that
 *  would otherwise be invisible:
 *
 *  NAMED BY THIS CHAPTER. A card the closing chapter never mentions cannot be judged finished by
 *  reading it — there is no sentence to judge. Offering the whole ledger is how a scan retires a
 *  character it read no line about. The title is appended to the keys because
 *  `bench/ledger-audit.ts` measured the live library on 2026-08-28: eleven of twelve entries carry
 *  keys that are only their own title back, and one carries none at all, so asking `fires` alone
 *  would make a keyless card invisible here and shrink the denominator in silence. Two characters
 *  minimum on the append — SPEC §7.1's floor, owned by `db.keysOf` and restated rather than
 *  imported because this module has no database below it and never will.
 *
 *  A PLACE IS NEVER FINISHED; IT CHANGES. Seth, 2026-08-29: *"locations usually get revisited. the
 *  end of chapter should update that its closed or in ruins or burnt or destroyed."* F40 measured
 *  the scan finishing a building the prose called "closed for the last time" three times out of
 *  three, in both arms, while correctly leaving a man who walked out alone — it reads a shut
 *  building as gone and a person walking away as offstage. Both readings are defensible; the
 *  answer is that the question was wrong. A burned gate still exists, still gets walked through,
 *  and the model needs to know it is a ruin NOW — which is what `lore`'s `history` and `appearance`
 *  rooms are for, and what a per-field proposal already writes into them.
 *
 *  Items go with places, and for a nearer reason than it looks: a melted key is still a thing the
 *  story refers to, and what it WAS is its `provenance`. Only a person and a law stop being
 *  subjects at all.
 *
 *  ALREADY CARRYING A THRESHOLD. Whatever number is on it, the writer chose it. Re-proposing it
 *  every close turns the queue into noise, and a model revising somebody's decision is not a
 *  proposal, it is an argument.
 *
 *  NEVER THE POINT-OF-VIEW CHARACTER. `buildContext` applies the retirement branch BEFORE its
 *  `isPov` branch, so a retired persona card is omitted from every prompt with nothing on screen
 *  saying so — the protagonist quietly stops being described. The writer may still do it by hand;
 *  the scan must never suggest it.
 *
 *  Lives here rather than in `routes.ts` so that `bench/` and `test/engine.ts` can both reach it:
 *  importing it from there would pull `src/db.ts`, which opens the database writable and migrates
 *  it at module load, which is the objection `bench/ledger-audit.ts` already records. */
export function retirable(entries: Entry[], window: string, persona?: string | null): Entry[] {
  const who = String(persona ?? '').trim().toLowerCase();
  return entries.filter((e) => {
    // People only. A rule was the other kind that could end, until rules became pockets of the tale.
    if (e.entryType !== 'character') return false;
    // NEVER A WORLD'S THREAD: other tales follow it, so one tale's scene cannot end it (ADR 0006).
    if (e.sharedFrom) return false;
    if (e.retiredAtChapter != null) return false;
    if (who && e.title.trim().toLowerCase() === who) return false;
    const title = e.title.trim();
    const keys = title.length >= 2 ? [...e.keys, title] : e.keys;
    return fires({ ...e, keys }, window).length > 0;
  });
}

/** AN ACT'S BLOCK ID, and the one reader of it. An act's EARLIER block carries the chapters it
 *  stands for in its id, so the engine's placement and a refusal that counts what dropped out read
 *  the range one way. The writer and the reader sit together because they must agree. */
const actId = (from: number, to: number) => `arc-${from}-${to}`;
export const actSpan = (id: string): { from: number; to: number } | null => {
  const m = /^arc-(\d+)-(\d+)$/.exec(id);
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
};

export function buildContext(input: Input, count: (s: string) => number): Manifest {
  const { story, chapters, passages, entries, currentChapter, budget } = input;
  const tailTokens = input.tailTokens ?? 200;
  const blocks: Block[] = [];
  /** Anchors never disappear. The parts marked `keep` are always sent; the rest is shortened
   *  from the end until the whole block fits, and the manifest says it was shortened. Losing
   *  point of view and register silently is far worse than losing the tail of a setting — which
   *  is why SPINE's setting is a flex part and nothing in VOICE or DIRECTIVE is. A block whose
   *  parts are all `keep` cannot trim; it refuses, and says so. */
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

  // SPINE — reference material at the top.
  //
  // IT CARRIED `direction` UNTIL 2026-08-30 and no longer does. COUNCIL-03 §5 had won it a place
  // here — a destination is not a claim about *now*, so SPEC 7.1's argument against permanent
  // bodies holding temporal facts did not reach it — but the field itself came out of the app at
  // Seth's direction: "no ones going to use it. ive asked." A block cannot carry a box nobody
  // fills. The column is still in the schema and still holds what two books wrote in it; nothing
  // reads it.
  //
  // Anchors are built from parts so that going over the cap shortens the LONG part rather
  // than deleting the block. Deleting SPINE loses the premise; deleting DIRECTIVE loses point of
  // view, register and the chapter's ending.
  addAnchor('SPINE', 'spine', [
    // The title stays. F12: dropping it was measured at n=30 per arm and made no difference
    // (96% vs 93% on the passages that named the key, CI [-15, +8]) — and neither arm
    // reproduced F9's actual failure once in sixty generations.
    { text: `${story.title} — ${story.genre}`, keep: true },
    // COUNCIL-06 · THE PREMISE IS NOT THE THING TO CUT FIRST. It was the only trimmable part of
    // SPINE, and the setting beside it was never trimmed — which is backwards on the evidence of
    // the live library: on `The Geometry of Absence` the premise is ~340 characters naming who the
    // book is about, and `Setting:` is ~1,100 characters of atmosphere naming nobody. Under budget
    // pressure the block would discard the only text that says whose story this is and keep the
    // furniture.
    //
    // It also matters more since the POV branch below. A first-person book whose premise is cut is
    // a book where the model is told the narrator's name in DIRECTIVE and has nothing else that
    // says who anyone is.
    //
    // The setting is recoverable and the premise is not: a place has lore entries and CANON blocks
    // of its own, and the premise exists in exactly one place. Nothing in the live library is over
    // this cap — measured wrong once, from a stale snapshot, and the correction matters: `The
    // Geometry of Absence` assembles ~716 tokens of spine and WAS being cut at 400 on every call.
    // So this swap changed a live prompt rather than a hypothetical one; before it, that book lost
    // its premise, and after it, its setting. The cap went to 1000 in the same sitting, which is
    // what stops either from being cut at all.
    /* THE WORLD THIS BOOK BELONGS TO, next to the genre because it is the same kind of fact: what
     * kind of book this is. Seth, 2026-09-02: "Is there a way in the story under the world tab I
     * could add what world or ip it belongs to? And have it hold some info about the world that
     * way". A book set in Warhammer 40,000 or on the Unterzee needs the model to know that before
     * it knows anything else, and until now the only way to say it was to write it into the premise
     * or to build a second book to follow.
     *
     * `keep: true` ON THE NAME, `keep: false` ON THE NOTE, and that split is the same one the
     * premise and the setting already make in this block: the name is identity and survives any
     * budget, the paragraph is recoverable furniture. A book whose world got trimmed to nothing
     * would be written as generic fantasy, which is the failure this exists to prevent. */
    { text: story.world?.trim() ? `This book is set in ${story.world.trim()}.` : '', keep: true },
    // #125 · ADR 0010. WHERE THE TALE STANDS, once the writer has sewn one in: the paragraph in
    // force at this scene, in the premise's place and kept as the premise was. The premise was true
    // on page one and reads to the model as the present; this moves with the tale. Resolved above
    // the purity line (`story.ts`) and handed in on `story.stands`. Without one, the premise.
    // NOT MEASURED: owed an A/B against the premise-only prompt (ADR 0010).
    { text: story.stands?.trim() || story.premise, keep: true },
    { text: story.worldNote?.trim()
      ? `About ${story.world?.trim() || 'that world'}: ${story.worldNote.trim()}` : '', keep: false },
    { text: `Setting: ${story.setting}`, keep: false },
    // #75 · THE TALE'S OWN POCKETS, with the tale's identity: instructions for telling all of it. Kept
    // like the premise, because a rule for the whole tale that is trimmed is a rule that stops.
    ...(story.pockets ?? []).map((t) => String(t ?? '').trim()).filter(Boolean)
      .map((t) => ({ text: `[For the whole tale: ${t.replace(/^\[|\]$/g, '')}]`, keep: true })),
  ], CAPS.SPINE!);

  /** ANANSI READS THE BOOK; HE DOES NOT WRITE IT.
   *
   *  VOICE, STYLE and DIRECTIVE are instructions to a prose engine, and `talk` is the one mode
   *  that is not writing prose. Sent to the chat they do not sit there quietly: F37's whole
   *  finding is that the voice field outranks everything for register, and it lands in the USER
   *  message, below the canon and next to the ask, while Anansi's own persona is the system
   *  message. Seth, 2026-08-30, on replies that came back clipped and out of register: *"the
   *  anansi chatbot should have a seperate voice from anything in the book. it can of course read
   *  the thread and narrative but it shouldnt be affected by it."*
   *
   *  Measured on a live manifest before this gate: 506 tokens of VOICE telling him "short,
   *  declarative sentences… calm, slightly detached", and a DIRECTIVE carrying
   *  `[Writing: first person, present tense]` and the spice register, on a call that writes no
   *  prose at all.
   *
   *  HE KEEPS THE KNOWLEDGE. SPINE, canon, the chapter summaries and the recent passages are
   *  what he answers FROM and none of them are gated here. What goes is the craft.
   *
   *  `POST /api/invent` rides this mode too and is meant to. A card body is a note of fact for
   *  the writing model to read later, so the book's own finished prose sitting in the call that
   *  writes one is F36's surface exactly — and F36 says a finished-English line in a prompt comes
   *  back verbatim in the book, by a route no check can see.
   *
   *  The POV and the persona are the one thing DIRECTIVE was carrying that is a FACT rather than
   *  an instruction, and dropping it here would leave the chat with nothing that says who is
   *  telling the story. `POST /api/talk` puts that back in its own words — see the note there. */
  const prose = input.mode !== 'talk';

  // VOICE — the register, sent as an instruction and nothing else.
  //
  // #18 split this field in two because one wrapper was lying about both halves: it labelled
  // whatever sat in `writingStyle` "a sample of the writer's own prose… never continue it", while
  // what every story in the library actually holds is a page of INSTRUCTIONS. F37 measured that
  // the instruction phrasing is what buys the 98% — on its own line, naming narration, with the
  // forms spelled out — so telling the model that a page of rules is a specimen to imitate was
  // the wrong frame for the thing that works. The split kept both. Ship 4 kept only the half
  // that was measured:
  //
  // COUNCIL-06 ship 4 · THE PROSE SAMPLE IS GONE, and F36 is the argument. A finished-English line
  // sitting in every prompt is lifted verbatim into the prose — that finding is a weather-beaten
  // Martin guitar coming out of a coat pocket because the entry saying she carries one was in the
  // prompt — and the contradiction check (deleted 2026-10-28) could not see that class at all. A whole paragraph of
  // the writer's finished prose is the largest possible version of that surface.
  //
  // The wrapper said "never continue it, quote it, or take facts from it", which is exactly the
  // shape of instruction F36 measured as not holding. And nobody was using it: `voice_sample` was
  // empty on all nine books in the live library and had never been measured.
  //
  // VOICE is one part now, and that part is `keep: true` — so like DIRECTIVE the anchor can no
  // longer trim, only refuse. That is the trade: the register can never be silently shortened.
  if (prose && story.writingStyle?.trim()) addAnchor('VOICE', 'voice', [
    { text: story.writingStyle.trim(), keep: true },
  ], CAPS.VOICE!);

  // STYLE — how THIS book is written, under the voice and not part of it. #18: the voice is the
  // universal register and this is the genre flavour, and romance and science fiction are not the
  // same writing style. Its own block rather than a fold into VOICE, which would put it in
  // competition for the same 500 tokens the prose sample already loses — and not DIRECTIVE, where
  // every part is `keep: true` so the block cannot trim and can only refuse.
  if (prose && (story as any).styleNote?.trim()) addAnchor('STYLE', 'style', [
    { text: `How this book is written: ${(story as any).styleNote.trim()}`, keep: false },
  ], CAPS.STYLE!);

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
  //
  // THIS SCENE'S PROSE ONLY (Seth, 2026-11-01: "the active cards should only be what's been mentioned
  // and what's pinned ... it still had cards from before"). The window used to run back across the
  // scene break, so a new scene opened with the last scene's cast awake. COUNCIL-03 kept it across
  // on purpose, against a flicker at the boundary; the writer's word is that a scene starts with who
  // its brief names and wakes the rest by naming them. A passage with no scene on it counts as this one.
  const scene = passages.filter((p) => !p.chapterId || p.chapterId === currentChapter.id);
  const recent = [...scene.slice(-8).map((p) => p.body), input.directive ?? ''].join('\n');
  const windowFor = (n: number) => [...scene.slice(-(8 + n), scene.length - n)
    .map((p) => p.body), n === 0 ? (input.directive ?? '') : ''].join('\n');
  // A WAKE WORD THAT IS ANOTHER THREAD'S NAME wakes that thread, not this one: Lisa's held "Halsey",
  // and every line about Halsey sent Lisa too.
  const titled = new Set(entries.map((e) => e.title.trim().toLowerCase()));
  const ownKeys = (e: Entry) => (e.keys ?? []).filter((k) => {
    const n = k.trim().toLowerCase();
    return n === e.title.trim().toLowerCase() || !titled.has(n);
  });

  // Novelcrafter includes the point-of-view character unconditionally, and it is one line.
  const persona = (story as any).persona?.trim().toLowerCase();
  const isPov = (e: Entry) => !!persona && e.title.trim().toLowerCase() === persona;

  /** The card as it reaches the model: the body in force at this chapter, the coat, and every
   *  room that is open. ONE DEFINITION, because a card pulled in by its parent below must carry
   *  exactly what a card that fired on its own carries — two copies of this is how the inherited
   *  pull would quietly arrive as a bare spine.
   *
   *  The rooms ride WITH the entry rather than as blocks of their own, so an addon obeys the
   *  entry's activation exactly as an outfit already does: an always-on card carries its open
   *  rooms every call, a triggered one only when it fires.
   *
   *  ponytail: EVICTION DROPS A WHOLE CARD, NEVER ITS ROOMS FIRST. F39 measured it — canon peaks
   *  at 2% of its 45% ceiling across the library today, and a COUNCIL-04 #7 scene (46 cards firing
   *  at once, the worst on record) with five rooms on every one of them would want about 60% of
   *  that ceiling. So a per-room trim is a mechanism for a pressure nothing has produced, and it
   *  would have to choose between a spine and a room with no evidence about which the model misses
   *  more. Ceiling: at roughly 77 simultaneous cards with five rooms each, the ceiling fills and
   *  whole cards start disappearing rather than thinning. TRIGGER: `bench/weight.ts` reporting the
   *  ceiling dropping a card at any position, or `fills` under about 50 cards. Upgrade path when
   *  it fires: trim rooms before spines — a card without its rooms still tells the model who is in
   *  the scene, and a dropped card leaves it inventing them. */
  // EMPTIES DROPPED BEFORE THE JOIN. A card whose permanent half has moved into its `facts` room
  // has an empty body, and joining that with the rooms put a blank line at the top of every one of
  // them — 461 cards, one wasted line each.
  // FIRST OR SECOND PERSON, read once: DIRECTIVE's narrator line and the cards' lock pocket (#119)
  // must agree about it.
  const firstOrSecond = /^\s*(first|second) person/i.test(story.pov ?? '');
  const bodyOf = (e: Entry) => cardText(e, currentChapter.index, recent,
    story.lockoutOn === false ? '' : story.lockedCharacter?.trim() ?? '', firstOrSecond);

  const pins = input.pins ?? {};
  // See `reach`. The question and the page decide; the rest of the directive (the tale's own
  // pockets by name, the World's thread list) is excluded, or every thread it names would wake.
  const reach = input.reach != null
    ? [...passages.slice(-8).map((p) => p.body), input.reach].join('\n') : null;
  const unasked: string[] = [];
  for (const e of entries) {
    // OFF IS ARCHIVED, FOR THE WHOLE TALE (Seth, 2026-11-02), and it comes before every pin: a thread
    // set off is not sent on its word, not always, and not when a scene's brief pins it in.
    if (e.activation === 'off') {
      blocks.push({ kind: 'CANON-TRIGGERED', id: e.id, text: '', tokens: 0, state: 'omitted', reason: 'set off' });
      continue;
    }
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
    // FINISHED THREADS DO NOT FIRE. A dead character or a burned building that keeps arriving
    // costs room and contradicts the page, and the ledger's precision decays exactly as the book
    // gets long enough to need it. Recorded as an omission with a reason rather than dropped
    // silently, the same as a pin, so the manifest can still answer for it.
    const gone = retiredAt(e, currentChapter.index);
    if (gone != null) {
      blocks.push({ kind: e.activation === 'always_on' ? 'CANON-ALWAYS' : 'CANON-TRIGGERED',
        id: e.id, text: '', tokens: 0, state: 'omitted',
        reason: `retired at chapter ${gone}` });
      continue;
    }
    const body = bodyOf(e);
    // MENTION ONLY, IN THIS SCENE (Seth, 2026-11-01): an always-on thread the scene's brief did not
    // name is sent as a thread on a word is, for this scene. Its name wakes it as well as its keys,
    // since an always-on thread often has none. Never the point of view.
    const mention = pins[e.id] === 'mention' && e.activation === 'always_on' && !isPov(e);
    const woken = { ...e, keys: mention ? [...ownKeys(e), e.title] : ownKeys(e) };
    if (e.activation === 'always_on' && !mention && reach != null && pins[e.id] !== 'force_in' && !isPov(e)
      && !fires(e, reach).length) {
      blocks.push({ kind: 'CANON-ALWAYS', id: e.id, text: '', tokens: 0, state: 'omitted',
        reason: 'not named in what was asked' });
      unasked.push(e.title);
    } else if (e.activation === 'always_on' && !mention) {
      add('CANON-ALWAYS', e.id, body, 'always_on', ['always_on']);
    } else if (pins[e.id] === 'force_in') {
      // The fact matters in this scene even though nobody says its keyword.
      add('CANON-TRIGGERED', e.id, body, 'pinned in', ['pinned']);
    } else if (isPov(e)) {
      add('CANON-TRIGGERED', e.id, body, 'point of view', ['pov']);
    } else {
      const hit = fires(woken, recent);
      if (hit.length) { add('CANON-TRIGGERED', e.id, body, 'keyword', hit); continue; }
      // TALK WAKES IT ON THE QUESTION TOO (2026-11-05), as it sends an always-on thread the question
      // names: new threads land on a word, so a question about one would otherwise not reach it.
      const asked = reach != null ? fires(woken, reach) : [];
      if (asked.length) { add('CANON-TRIGGERED', e.id, body, 'named in what was asked', asked); continue; }
      // Sticky is, in practice, "extend the scan window for this entry": the keyword has to
      // fall OUT of the 8-passage window before it does anything, and then it buys stickyFor
      // more. Characters default to 3, so a person mentioned eleven passages ago is still in
      // context and stops going quietly wrong the moment they are off the page.
      const sticky = e.stickyFor ?? (e.entryType === 'character' ? 3 : 0);
      let held = false;
      for (let back = 1; back <= sticky; back++) {
        const then = fires(woken, windowFor(back));
        if (then.length) { add('CANON-TRIGGERED', e.id, body, `sticky ${back} back`, ['sticky', ...then]); held = true; break; }
      }
      // And Talk lists it by name with the other threads it did not send, so Anansi can ask for it.
      if (!held && reach != null) unasked.push(e.title);
    }
  }

  // THE TALE'S RULES (ADR 0005), in canon where rule threads were until 2026-10-29, so a rule is
  // budgeted and evicted as it was: always when it is On, and On a word when one of its words fires
  // in the same window a thread's do (#134, its eye). Framed with its name, as a thread's Always true is.
  for (const r of story.rules ?? []) {
    const name = String(r.name ?? '').trim();
    const said = unwrapped(String(r.body ?? ''), [name]).trim();
    if (!said) continue;
    const text = `[A rule of this tale${name ? `, ${name}` : ''}: ${said}]`;
    const reach = pocketReach({ ...r, slot: 'rule', active: true });
    if (reach === 'off') continue;
    if (reach === 'always_on') { add('CANON-ALWAYS', r.id, text, 'rule', ['rule']); continue; }
    const hit = fires({ id: r.id, title: name, body: '', entryType: 'lore', activation: 'triggered',
      keys: r.keys!, lastEditor: 'human' } as Entry, recent);
    if (hit.length) add('CANON-TRIGGERED', r.id, text, 'keyword', hit);
  }

  // THE INHERITED PULL — PLAN-08 Phase 3. `entry_edges` has been written since Phase 2 and read by
  // nothing; this is where `confidence` gets spent.
  //
  // PARENT PULLS CHILD AND NEVER THE REVERSE. Her coat arrives when she does; she does not arrive
  // because somebody said "coat". That direction is the whole design decision behind the table —
  // see its own comment in `src/db.ts` — and an undirected walk here would rebuild COUNCIL-04 #7's
  // crowded scene through the back door with the schema still looking correct.
  //
  // TWO WAYS AN EDGE FIRES, and they are the same union an entry and an addon already use: the
  // parent reached the prompt, or the EDGE's own keys hit the window (#5, "also triggerable by
  // their own trigger word"). `fires` is the shipped matcher with the edge's keys swapped in,
  // never a second copy, so the fold, the proper-noun exemption and multi-word order behave here
  // exactly as they do on the card itself.
  //
  // ANYTHING THAT ALREADY HAS A BLOCK IS LEFT ALONE, included or omitted. That is what stops a
  // pull from resurrecting a card the writer pinned out or a thread that is finished — a rule the
  // two `continue`s above would otherwise state and this loop would silently undo.
  //
  // ponytail: ONE HOP. A pulls B pulls C leaves C out, because this reads what the direct pass
  // placed and not what it places. Deliberate: a walk needs a cycle guard — A→B and B→A are two
  // legal rows — and a depth nobody has measured, and no book here has yet shown a two-hop chain.
  // Upgrade path is a bounded walk with a seen-set in this loop, not a recursive helper.
  const placed = new Set(blocks.filter((b) => b.state === 'included').map((b) => b.id));
  const settled = new Set(blocks.map((b) => b.id));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  for (const edge of input.edges ?? []) {
    const child = entryById.get(edge.childId);
    if (!child || settled.has(edge.childId)) continue;
    const hits = edge.keys?.length ? fires({ ...child, keys: edge.keys }, recent) : [];
    if (!placed.has(edge.parentId) && !hits.length) continue;
    // Clamped rather than trusted: `confidence` is a REAL column a route can be handed, and a
    // value outside 0..1 would sort an inherited pull above a keyword or below every sticky hold.
    const conf = Math.min(1, Math.max(0, edge.confidence ?? 1));
    const why = placed.has(edge.parentId)
      ? (entryById.get(edge.parentId)?.title?.trim() || edge.parentId)
      : "the edge's own words";
    // The reason carries BOTH why it is here and what it is worth, because `canonRank` reads the
    // reason — one source for the two, the same bargain the sticky walk already makes.
    add('CANON-TRIGGERED', child.id, bodyOf(child), `inherited ${conf.toFixed(2)} from ${why}`,
        ['edge', ...hits]);
    settled.add(child.id);
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

  // STRINGS. Only the ones the writer switched on, and phrased as a standing obligation rather than
  // an instruction: the model is being told what is owed, not told to pay it. "Do not resolve" is
  // there because a model handed an unresolved promise reaches for it — which is the writer's move
  // and the reason strings are writer-facing until they are on.
  // #127 · ADR 0011. Each kind under its own frame (`STRING_FRAMES`), promises first, a kind with
  // none left out. A string with no kind is a promise, as `db.stringKind` reads one.
  const strings = (input.strings ?? []).filter((x) => x.title?.trim());
  if (strings.length) {
    const line = (x: typeof strings[number]) => {
      const made = x.fromChapter ? `set up in chapter ${x.fromChapter}` : '';
      const owed = x.owedBy ? `owed by chapter ${x.owedBy}` : '';
      const when = [made, owed].filter(Boolean).join(', ');
      return `- ${x.title.trim()}${x.body?.trim() ? `: ${x.body.trim()}` : ''}${when ? ` (${when})` : ''}`;
    };
    add('STRING', 'strings',
      (['promise', 'question'] as const).map((kind) => {
        const mine = strings.filter((x) => (x.kind === 'question' ? 'question' : 'promise') === kind);
        return mine.length ? `${STRING_FRAMES[kind]}\n${mine.map(line).join('\n')}` : '';
      }).filter(Boolean).join('\n'),
      `${strings.length} in play`);
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
    add('EARLIER', actId(a.fromChapter, a.toChapter),
      `Ch${a.fromChapter}-${a.toChapter}${a.title ? ` ${a.title}` : ''}: ${a.summary}`, 'arc');
  }

  for (const c of chapters) {
    if (c.index >= wholeFrom || !c.summary) continue;
    if (c.keepWhole) continue;   // its prose is being sent; a summary too would duplicate it
    if (covered(c.index)) continue;
    // SPEC §5: on hash mismatch a summary is flagged stale, excluded, and re-run. Left in,
    // it contradicts the prose it no longer describes in every later call, forever. A summary
    // is known to exist here, so the shared check fails only on stale.
    if (!summaryReaches(c)) {
      blocks.push({ kind: 'EARLIER', id: c.id, text: '', tokens: 0,
        state: 'omitted', reason: 'summary out of date — not sent until it is written again' });
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
  // F53. One short bracketed line above the writer's own passages, in the app's existing bracket
  // idiom — canon entries and the lockout line are already written this way, so it is not new
  // vocabulary. TAIL is marked as well as PROSE: the writer's most recent lines are usually in the
  // tail, which is exactly the position that makes them read as precedent.
  //
  // Gated on the lockout being in force. Marking authorship in every book's prompt is a much larger
  // change than the one being measured, and it would be measured by nothing.
  const lockedNow = story.lockoutOn === false ? '' : story.lockedCharacter?.trim();
  const marking = !!input.proseAuthor && !!lockedNow;
  // A directed passage is the model's prose to the writer's order. NOT MEASURED: F53 measured the
  // writer's own passages only; this is owed a bench/lockout-book.ts A/B.
  // A SCENE BREAK IS SAID, never sent as an empty passage (Seth, 2026-10-30: a new scene "in a new
  // place days later" came back as more of the scene before). It reached the model as a blank, and
  // with the lockout on as a blank marked the writer's own, so nothing above the opening said the
  // scene before it was over. NOT MEASURED.
  const mark = (p: Passage) => p.isBreak ? `[The scene ends here.${p.body?.trim() ? ` ${p.body.trim()}` : ''}]`
    : !marking ? p.body
    : p.author === 'human' ? `[the writer's own, not yours]\n${p.body}`
    : p.directed ? `[written to the writer's order, not yours]\n${p.body}` : p.body;
  for (const p of head)
    add('PROSE', p.id, mark(p), p.chapterId && pulled.has(p.chapterId) ? 'pulled back' : 'recent prose');

  // The lockout. One line, and it is a prohibition with a destination — a bare "do not write him"
  // gets worked around (he is described from outside, or the scene stalls waiting for him), so the
  // line has to say what the model IS for. F21 measured the model narrating the protagonist's
  // interior in 82.5% of generations with nothing in canon asking for it; this is the only thing
  // in the app that has ever aimed at that number.
  //
  // It rides DIRECTIVE rather than getting a block of its own: DIRECTIVE is the anchor that holds
  // the standing instructions, it is never evicted, and a fifth block for its ~78 tokens would need
  // a place in ORDER, a colour, a name in BLOCK_ORIGIN and a row in the Context panel.
  // THE SWITCH, not just the name. Turning the lockout off used to mean clearing who it names and
  // remembering to put them back; `lockoutOn` suspends it and keeps the name. Undefined counts as
  // on, so every story written before the column existed behaves exactly as it did.
  const locked = story.lockoutOn === false ? '' : story.lockedCharacter?.trim();
  /** COUNCIL-06 · THE LOCKOUT WAS AIMED AT THE WRONG TARGET IN FIVE OF NINE BOOKS.
   *
   *  F28 measured this line and it works — acted 76% → 25% (p = 0.0005), spoke 20% → 0%. It was
   *  measured in THIRD PERSON, and it was being sent in first and second person too, where it says
   *  the opposite of the line above it. Rendered live on `The Geometry of Absence`:
   *
   *      [Writing: first person, present tense]
   *      [Elias belongs to the writer: never write their dialogue, action, gesture or thought…]
   *
   *  …followed by the prose it must continue: *"I text her immediately… The phone in my hand
   *  buzzes once. I look down."* Write as Elias, never write Elias, here is Elias — a mandate, a
   *  prohibition and a counter-example, in that order, in one block. Five of the nine books in the
   *  live library were in that state; a sixth renders `[You belongs to the writer… Stop where You
   *  would act.]` because its persona is the word "You".
   *
   *  IN FIRST OR SECOND PERSON THE NARRATION IS THE PROTAGONIST'S BY CONSTRUCTION. "I look down"
   *  is an action and a thought and cannot be forbidden without forbidding the grammar. So the
   *  lockout is not weakened there — it is replaced by the rule that actually applies to that
   *  grammar: the narrator is named, and the firewall moves to everyone ELSE's interior, which is
   *  the half that can be broken in any person.
   *
   *  #119 NARROWS THAT FOR A HANDS-OFF NARRATOR. Senses and memory stay the model's; what he says,
   *  does and decides is the writer's, and the model stops where he would speak, act or choose.
   *  A narrator the writer only plays (persona, no Hands off) keeps the line as it was.
   *
   *  The third-person text is UNCHANGED, byte for byte. It is the one instruction in this stack
   *  with a strong measured effect and it is not being reworded in the same commit that moves it.
   */
  const teller = locked || (story as any).persona?.trim();
  // Not in the chat. Every part of this block is an order to a prose engine — the tense, the
  // lockout, the chapter's ending, the register — and `talk` writes no prose. See `prose` above.
  if (prose) addAnchor('DIRECTIVE', 'directive', [
    { text: `[Writing: ${story.pov}]`, keep: true },
    { text: firstOrSecond && locked
      // #119 · THE HANDS-OFF NARRATOR. The line below asked the model to write what he "senses,
      // remembers or decides" while his lock pocket forbade what he "says, does, thinks or decides".
      // One rule now, and the lock pocket is not sent here (`rooms`): the writer decides, and the
      // narration goes around what the writer wrote. NOT MEASURED.
      ? `[${locked} is telling this story. The narration is ${locked}'s: write what ${locked} senses `
        + `and remembers. What ${locked} says, does and decides is the writer's: narrate around what `
        + `the writer wrote, never decide it for ${locked}, and stop where ${locked} would speak, act `
        + `or choose. Every other character is written from outside — what they say, do and leave `
        + `behind. Never state what anyone but ${locked} thinks, feels or intends; where ${locked} can `
        + `only guess, write the guess as a guess.]`
      : firstOrSecond && teller
      ? `[${teller} is telling this story. The narration is ${teller}'s: write only what ${teller} `
        + `senses, remembers or decides. Every other character is written from outside — what they `
        + `say, do and leave behind. Never state what anyone but ${teller} thinks, feels or intends; `
        + `where ${teller} can only guess, write the guess as a guess.]`
      : locked
      // Three rewordings of this line were measured: an extra clause (F52), the name in place of
      // the pronoun (F54) and the name in noun form (F55). None was shown to beat it (F52, F55,
      // F57-F59), so they were deleted rather than kept as switches.
      ? `[${locked} belongs to the writer: never write their dialogue, action, gesture or thought, `
        + `and never state what they feel, know or decide. Write the world's answer instead — what `
        + `the others say and do, what the room does, what happens to ${locked}. Stop where `
        + `${locked} would act.]`
      : '', keep: true },
    /* THE CHAPTER'S BRIEF, IN TWO HALVES THAT REACH THE MODEL DIFFERENTLY (2026-09-02).
     *
     * `stop()` is why the writer's own sentence is not simply interpolated: both of these put a
     * sentence of ours after a sentence of theirs, and a box that already ends in a full stop gave
     * "keeps the debt.. That is" — seen in a real prompt on the day this shipped. One terminal mark
     * or the other, never both, and never none.
     *
     * It was one box, worded "This chapter must end with", riding here on every single call for the
     * whole length of the chapter. Seth: "the where this is going should be how does this start and
     * where does it end. the start should be used as information for the very first scene and the
     * where is this going is only used as a suggestion for the direction of the chapter, not
     * something used by the ai at every beat. it tries to end the chapter early if it uses it that
     * way."
     *
     * HOW IT STARTS goes in ONLY while the chapter has no prose. `started` is the same flag the
     * whole-prose window is computed from, forty lines up: once one passage exists, the opening is
     * on the page and the instruction has been carried out. Left in, it would keep asking for an
     * opening in the middle of a chapter.
     *
     * WHERE IT ENDS is named as a direction rather than as a requirement. The old wording put a
     * demand ("must end with") next to the generation point on every beat, which is the shape that
     * makes a model close a chapter it has just opened. Naming it as the far end AND saying it is
     * not this passage's business is the change; F37 is the reason it is worded on its own line and
     * spells the thing out rather than hinting at it.
     *
     * NOT MEASURED. Whether this stops the early wrap-up is a claim about model behaviour and
     * nothing here has run an A/B on it — bench/ab.ts is how that would be answered, two servers
     * against one router with the arms live at the same time. What IS true is that the demand no
     * longer arrives on every call, which is the mechanism Seth described. */
    { text: !started && currentChapter.opensWith?.trim()
      ? `[How this chapter opens: ${stop(currentChapter.opensWith)} This is the first passage of `
        + `the chapter — begin there.]`
      : '', keep: true },
    { text: currentChapter.authorsNote?.trim()
      ? `[Where this chapter is going, eventually: ${stop(currentChapter.authorsNote)} That is the `
        + `chapter's direction, not this passage's business: do not steer toward it, close it out or `
        + `wrap the chapter up here. Write only the next passage.]`
      : '', keep: true },
    // A written-out register replaces the level's fixed line. Five lines cannot say
    // everything, and a story that needs a sixth should not have to pick the nearest.
    { text: `[${story.spiceNote?.trim() || SPICE[story.spice]}]`, keep: true },
  ], CAPS.DIRECTIVE!);

  // SENT ONCE (Seth, 2026-11-02: "remove the duplicate"). When the writer's own wording for this mode
  // quotes the newest passage at its end ({{last}}, filled in MODE below), that passage leaves the
  // story's prose and is said to have moved. Not when an empty scene opens on Continue: the opening's
  // own words replace the writer's there, and {{last}} is not sent. NOT MEASURED.
  // NOR A SCENE BREAK: it has no words of its own, so taken out of the prose it left the scene ending on
  // nothing and {{last}} quoting an empty line. It stays in the prose, and {{last}} says it the same way.
  const ownHere = wordingOf(input.mode, input.modePrompts);
  const quoted = !!ownHere && /\{\{\s*last\s*\}\}/.test(ownHere)
    && !(input.mode === 'continue' && !started && !!currentChapter.opensWith?.trim())
    && !scene.at(-1)?.isBreak
    ? scene.at(-1)?.id : undefined;
  for (const p of tail) {
    if (p.id === quoted) {
      blocks.push({ kind: 'TAIL', id: p.id, text: '', tokens: 0, state: 'omitted', reason: 'quoted at the end of the instruction' });
      continue;
    }
    add('TAIL', p.id, mark(p), 'tail prose');
  }

  // MODE. Omitted only for Narrate on an unfinished line — scoping this to one mode is
  // deliberate: Direct's directive and speak/act's "whose line is it" live ONLY in MODE, and
  // omitting it also drops the STOP instruction ("stop when the beat is done", "stop at a natural
  // beat"), so the passage runs on, looks unfinished, and omits it again. It latches
  // (COUNCIL-03 S7). Narrate inherits the exception because it is the mode where the writer
  // deliberately stops mid-sentence for the model to finish.
  //
  // This used to say "the length instruction", which was true when the modes carried "the next
  // 1-2 paragraphs" and stopped being true when F29 deleted it. Reworded 2026-08-30: the wording
  // outlived the thing it named, which is how a comment starts lying.
  const last = passages.at(-1)?.body ?? '';
  const unfinished = last.length > 0 && !/[.!?"'”’]\s*$/.test(last.trimEnd());
  // ponytail: a reweave of a Narrate passage that answered an unfinished line sends no MODE block,
  // so it sends no What didn't work note either. Revisit if writers reweave mid-sentence
  // answers and say the note is ignored: the frame would need a wording that keeps the mid-thought.
  if (!(input.mode === 'narrate' && unfinished)) {
    // A stale browser tab still sends the old mode names. Falling back to the neutral mode
    // beats a 500 from an undefined lookup, which is what a reload would otherwise produce.
    // The writer's own wording wins, with {{directive}} and {{speaker}} filled the same way the
    // shipped prompts fill them — an override without them is legal and simply mentions neither.
    /* A RE-ROLL HAS NO INSTRUCTION OF ITS OWN. It arrives here as the mode the passage was written
     * with — the route resolves that from the row, because which press wrote a passage is not
     * something this side of the purity line can see. The key switch that used to sit here sent
     * re-rolls to a wording that named a passage the prompt leaves out; see the note where
     * `MODE.regenerate` used to be. */
    const key = input.mode;
    // ONLY A REAL MODE'S NAME finds an override. The map holds keys that are not modes (`voice`,
    // `anansi`, `reweave`, the library), and a request naming one as its mode must not send that
    // text as the whole instruction.
    const own = MODE_WORDING[key] ? input.modePrompts?.[key]?.trim() || undefined : undefined;
    const wording = wordingOf(key, input.modePrompts);
    // AN EMPTY SCENE OPENS AS ITS OPENING SAYS, and the mode says so last (Seth, 2026-10-30: "the opening
    // has nothing to do with what we said"). DIRECTIVE carries the opening, but the mode sits nearest
    // the generation point, and Continue's own words, the shipped ones and his, say "start where the
    // last line above ends" and "do not skip time": the last line above is the scene before, and the
    // nearest instruction wins (F37). A line added after them lost to them on the live tale the same
    // day, so for Continue the opening REPLACES the mode's words; another mode keeps its own (it
    // carries the writer's direction) and gets the line. Not for Talk, and only while the scene has
    // no prose and has an opening, the condition DIRECTIVE's own line uses. NOT MEASURED.
    const opening = !started && input.mode !== 'talk' && !!currentChapter.opensWith?.trim();
    // {{words}} IS THE SLIDER (Seth, 2026-11-02), in the shipped wording (since 2026-11-06) and in any
    // writer's that writes it. With the slider off the line holding it is dropped, so no wording names a
    // length unasked (F18, guarded in test/engine.ts). Where it is written, the line under THE LENGTH
    // TARGET below is not added; a writer's wording without it still gets that line.
    const target = Number(input.targetWords) || 0;
    const WORDS = /\{\{\s*words\s*\}\}/;
    const ownWords = !!wording && WORDS.test(wording);
    const said = opening && key === 'continue' ? OPENING
      : wording
      ? (target > 0 ? wording : wording.split('\n').filter((l) => !WORDS.test(l)).join('\n'))
           .replace(new RegExp(WORDS.source, 'g'), String(target))
           .replace(/\{\{\s*directive\s*\}\}/g, input.directive ?? '')
           .replace(/\{\{\s*speaker\s*\}\}/g, input.speaker || 'the point-of-view character')
           // {{last}} IS THE NEWEST PASSAGE OF THE SCENE, quoted (Seth, 2026-11-02: "the directive
           // for all of them should be at the end"), so a wording can give the instruction first and
           // what it works on last, rather than pointing "above". Last, and by a function, so the
           // passage goes in as written: a `$&` or a `{{directive}}` in the prose is not filled.
           // MARKED AS IN THE PROSE (`mark`): the writer's own under a lockout (F53), a break as a break.
           // Taken out of the prose it lost that mark, and the lockout its example of whose line it is.
           .replace(/\{\{\s*last\s*\}\}/g, () => { const p = scene.at(-1); return p ? mark(p) : ''; })
      : MODE.talk!(input.directive, input.speaker);
    /* WHAT DID NOT WORK, after the instruction, in the When you reweave wording: the writer's from
     * Account → Writing, or the shipped one (docs/adr/0012). THE TAKE BEING REPLACED IS NOT SENT,
     * in any form. For one day (2026-10-29) it was, framed as the version being replaced, and GLM-4-32B
     * on Featherless first continued it and then gave it back byte for byte. With no note, nothing is
     * added, and the prompt is the one that wrote the passage.
     *
     * A FUNCTION as the replacement, so a note holding `{{whatfailed}}` or `$&` goes in as written. */
    const failed = input.whatFailed?.trim() || undefined;
    const mine = failed ? input.reweave?.trim() : undefined;
    const frame = failed ? reweaveOf(mine).replace(/\{\{\s*whatfailed\s*\}\}/g, () => failed) : '';
    // TALK'S OTHER THREADS BY NAME (see `reach`): Anansi knows they exist, and can ask for one.
    const others = unasked.length ? `The tale's other threads, not sent because nothing in the question or on `
      + `the page names them: ${unasked.join(', ')}. If an answer needs one, say which, and the writer can name it.` : '';
    const text = [others, said, frame, opening && key !== 'continue' ? OPENING_LINE : ''].filter(Boolean).join('\n');
    // THE LENGTH TARGET, and everything about where it sits is deliberate.
    //
    // For a writer's wording with no {{words}} in it; the shipped wording holds the same line itself.
    // Never with the slider off: F18/F29, a named length is a length the model fills, and
    // `test/engine.ts` guards both directions. It rides in an existing block rather
    // than a new one for the reason `story.ts` already gave for SYSTEM and `context.ts:548` for
    // DIRECTIVE: a block needs a place in ORDER, a colour, a BLOCK_ORIGIN name and a panel row.
    //
    // ON ITS OWN LINE, per F37: the same rule buried in a long line bought 10.7%, and alone on a
    // line it held at ~98%.
    //
    // The second clause is the whole difference between a target and a quota. F29's lesson was
    // that removing the number gave back "the permission the number was denying, which is to be
    // short" — so the permission is stated alongside the number instead of being traded for it.
    //
    // A LIMIT, NOT AN AIM, since 2026-10-29. "Aim for roughly N words" read as a starting point: the
    // local model ran a median 1.44 times the slider over 439 passages. NOT MEASURED against it.
    // Off for `talk`: Anansi answering the writer is not a passage and has its own bound.
    add('MODE', 'mode', target > 0 && input.mode !== 'talk' && !(ownWords && said !== OPENING)
      ? `${text}\nWrite no more than ${target} words. Stop sooner if the beat is done.` : text,
      `mode:${key}${own ? ' · yours' : ''}${failed ? ' · what did not work' : ''}${mine ? ' · your reweave' : ''}`);
  }

  // ponytail: ceilings and a hard refusal, no budget engine. No reservation, no trim ladder, and no
  // 'partial' block state — every block is included or omitted whole. THERE IS an eviction order
  // now and this comment denied it until 2026-08-29: F31 and F32 built one, and `evict` below
  // sorts canon by how it earned its place, EARLIER by chapter number and PROSE oldest-first.
  // Deferred on measurement: prefill is fast (F1), the server refuses overflow rather than
  // truncating (F3), and summaries bound the context.
  //
  /* THE TRIGGER, WRITTEN OUT HERE RATHER THAN CITED. This line said "PLAN-02 §7.2 holds the trigger
   * condition" and that was the only citation in the tree that made you go and read a document to
   * know what the code meant. Worse, the sentence beside it named the wrong test.
   *
   * §7.2's actual words: **the trigger is NOT overflow.** "With canon above prose, one ledger edit
   * invalidates the KV prefix, so the pain arrives as PREFILL GOT SLOW, and it will be misread as a
   * hardware problem. The named trigger is: first prefill above N seconds, or first call where the
   * prefix moved and the guard fired."
   *
   * So "nothing has overflowed" — the reason given for deferring, here and in every build-state
   * document since — has never been the question. Overflow was explicitly ruled out as the signal
   * by the plan that deferred the work.
   *
   * AND SOMETHING BEARING ON IT WAS MEASURED ON 2026-09-07, though it is not proof. Across 759
   * prose runs: p50 9.7 s, p90 44.5 s, p99 115.3 s, and the latency tracks the gap since the last
   * generation — 8.1 s while writing continuously, 20.7 s after 1-5 minutes, 33.2 s after 5-15.
   * That is the shape §7.2 describes: the prefix moving and the cost landing on prefill. What it is
   * NOT is a measurement of prefill itself — `latency_ms` covers the whole call, generation
   * included, so this is consistent with the trigger rather than a reading of it.
   *
   * To settle it, measure prefill alone (the router reports it) against the same gap buckets. If
   * prefill is what moves, the trigger has fired and this engine is owed. Nobody has run that, and
   * for as long as that is true this comment is the honest state of the question. */
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
  const earlierAt = (b: Block) => actSpan(b.id)?.from ?? chapterAt.get(b.id) ?? 0;

  /** How strongly a triggered canon block earned its place. Lower goes first.
   *
   *  Read off the reason the block already carries, so there is one source for why it is here and
   *  what it is worth. A sticky hold is weakest, and the further back it reaches the weaker it is:
   *  three passages ago is a person who has left the room. */
  const canonRank = (b: Block) => {
    const sticky = /^sticky (\d+) back$/.exec(b.reason);
    if (sticky) return 0 - Number(sticky[1]);       // -3 is weaker than -1
    // An inherited pull lands in the gap between the two: strictly below any direct keyword hit,
    // and above a sticky hold, with `confidence` ordering the pulls among themselves. A pull at
    // full confidence is worth 0; one at zero confidence is worth exactly a one-passage hold,
    // which is the floor and is why the value is clamped where it is written.
    const pull = /^inherited ([\d.]+) from /.exec(b.reason);
    if (pull) return Number(pull[1]) - 1;           // (-1, 0]
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
