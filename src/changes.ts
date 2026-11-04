/* CHANGES — what Talk may change when the writer asks, in one file (#97, ADR 0007).
 *
 * Asked means done, offered means chalked. A request the writer makes in Talk comes back from the
 * model as `changes`, and each one is checked here against the tale before anything is written:
 * the operation is on a closed list, the thread it names exists in this tale and is this tale's own,
 * and the room it names is one that thread's kind has. A change that fails any of those is not
 * applied; it comes back with the reason, in words, and the route says so in the reply.
 *
 * A VERTICAL SLICE, the `src/search.ts` pattern. This file owns the KNOWLEDGE: the schema fragment,
 * the closed list, how a name resolves to a thread, what a change says in the writer's words, and
 * what puts it back. It never opens the database and never defines the ownership clause. Applying a
 * checked change is the route's, through the db functions a hand-made edit uses (`upsertEntry`,
 * `upsertAddon`), so `last_editor`, the stale-summary rule and the ownership floor in those apply
 * to Talk exactly as they apply to the writer's own press. And the tale it checks against is the
 * one the route already read through the gate, so a name can only ever resolve to a thread of a
 * tale the writer may change.
 *
 * TWO GRAMMARS, ONE FILE. `checkAsked` is what the model may ask for. `checkUndo` is what an Undo
 * may do: put back the value that was there, or take away a thread, a pocket, an Over time entry or
 * a retirement Talk made. The only prose either touches is one passage the writer asked to change
 * (`passage.set`, #153), put back by its own Undo. The unmake operations are refused from the model
 * by name.
 *
 * WHAT HOLDS FOR AN UNDO, which the page sends back and so anyone can forge. It acts by id, on the
 * tale the route read through the gate, so it reaches only the writer's own tale. A put-back is
 * done only while the thing still holds what the Undo says Talk wrote (`wrote`), and it names the
 * pocket it writes over, so it never makes one; it never leaves a thread On a word with no words,
 * and an Over time entry goes back at its own scene, whatever scene the Undo names. A take-away is
 * done only while the thing holds exactly the text the Undo names and nothing else (no other
 * pocket, no Over time). It never takes away a thread's Always true pocket alone: no Undo leaves a
 * thread without one, so Talk's first Always true on a thread that had none gets no Undo. What does NOT hold: a forged Undo is not proved to be Talk's.
 * One that copies a thread's id, name and Always true can take away a thread the writer made, if
 * that thread has nothing else in it, and one that copies the current value can write any text
 * over it. Neither is more than the writer's own Delete or save can do to their own tale; the text
 * is not capped, because it puts back what the writer had, which can be longer than anything Talk
 * may write.
 */
import { ALL_SLOTS, KINDS, STRING_SLOTS, keysTakenBy, oneKeyword, slotsFor, plain, tidyGenre, wrapperNames } from './slots.ts';
import { retiredAt, pocketReach } from './context.ts';

/** What the model may ask for. #97 cut the path with the first two; #98 adds the rest; #128 adds a
 *  string, a pocket of the tale's own thread (ADR 0011), which no other operation reaches. Then the
 *  tale's own pockets, which no thread operation reaches either (Seth, 2026-10-29: Talk should do
 *  what it could not): where a string stands, the tale's rules (ADR 0005) and the writer's own
 *  instructions, each added, changed, or switched on or off. */
export const ASKED = ['thread.new', 'thread.set', 'thread.overtime', 'thread.wake', 'thread.retire',
  'tale.set', 'scene.set', 'string.set', 'string.stand', 'rule.set', 'rule.switch',
  'instruction.set', 'instruction.switch', 'passage.set', 'thread.rename'] as const;
/** What only an Undo may do, beside putting back old text. `pocket.unmake` takes away a rule or an
 *  instruction Talk added, which hang off no thread, so `room.unmake` (which finds a thread first)
 *  cannot reach them. */
export const UNMAKE = ['thread.unmake', 'room.unmake', 'state.unmake', 'retire.unmake', 'takeover.unmake',
  'pocket.unmake'] as const;
/** What an Undo may put back as it was: the asked operations that write over a value, by id. */
const PUT_BACK = ['thread.set', 'thread.overtime', 'thread.wake', 'tale.set', 'scene.set', 'string.stand',
  'rule.set', 'rule.switch', 'instruction.set', 'instruction.switch', 'passage.set', 'thread.rename'] as const;

/** THE TALE'S OWN FIELDS TALK MAY CHANGE, the story's own columns, as the writer names them. The
 *  voice is `writingStyle` and the style note `styleNote` in the story and in `db.updateStory`;
 *  `TALE_KEY` is the one copy of that, and the change carries the key so the route writes to it. */
const TALE_FIELDS = ['premise', 'setting', 'title', 'genre', 'voice', 'style_note'] as const;
const TALE_KEY: Record<string, string> = { premise: 'premise', setting: 'setting', title: 'title', genre: 'genre',
  voice: 'writingStyle', style_note: 'styleNote' };
/** WHERE A STRING STANDS, in the writer's words (GLOSSARY: Put in play / Set aside, Tied off / Let
 *  go), and what each is on the pocket: its switch and its mark, as `standString` on the page writes
 *  them through `db.upsertString`. */
const STANDS = ['in_play', 'set_aside', 'tied_off', 'let_go'] as const;
const STAND_MARK: Record<string, string> = { in_play: 'open', set_aside: 'open', tied_off: 'paid', let_go: 'dropped' };
/** A SCENE'S FIELDS TALK MAY CHANGE: its title and Heads toward (`authors_note` in the column). Opens
 *  with is not on it: the ticket names these two, and an opening is the writer's first beat. */
const SCENE_FIELDS = ['title', 'heads_toward'] as const;

/** #154 · One place a name is written: a passage, a pocket (a thread's, a string, a rule, an
 *  instruction) or one of the tale's own fields. `thread` is the pocket's thread, null for a rule or
 *  an instruction; `where` says it in the writer's words, for an Undo that leaves it. */
type Place = { kind: 'passage' | 'pocket' | 'thread' | 'scene' | 'tale'; id: string; before: string; after: string;
  thread?: string | null; slot?: string; name?: string; nameBefore?: string; keys?: string[]; where: string };

/** The schema fragment Talk's answer carries. Flat, one object per change: the grammar cannot say
 *  "these fields for this operation", and the checks below are what enforce that. */
export const CHANGES_SCHEMA = {
  type: 'array', maxItems: 4,
  items: {
    type: 'object',
    // IN THIS ORDER, everything a change names before its text. The local server compiles the schema
    // to a grammar that holds every optional key to the order declared here, so a key declared after
    // `text` shuts `text` out once it is written. `title` and `type` were after it, and a new thread
    // written as op, title, type could not carry an Always true at all: Seraphine, 2026-11-03.
    // test/changes.ts CHANGE-ORDER holds this.
    properties: {
      op: { type: 'string', enum: [...ASKED] },
      // thread.set: the thread by its name, as the writer and the model know it.
      thread: { type: 'string', maxLength: 80 },
      // thread.new: its name. string.set, string.stand, rule.*, instruction.*: the pocket's name.
      title: { type: 'string', maxLength: 80 },
      type: { type: 'string', enum: [...KINDS] },
      // string.set: a promise or an open question. Left out on a string the tale has, it keeps its own.
      kind: { type: 'string', enum: [...STRING_SLOTS] },
      // thread.set: the room, or `none` for its Always true.
      room: { type: 'string', enum: ['none', ...ALL_SLOTS] },
      // tale.set: which of the tale's own fields. scene.set: which of the scene's.
      field: { type: 'string', enum: [...new Set([...TALE_FIELDS, ...SCENE_FIELDS])] },
      // scene.set: the scene by its number. thread.overtime: the scene it holds from. None is the
      // scene the writer is in. thread.retire: the scene it is retired from; none is the next one.
      scene: { type: 'integer', minimum: 1 },
      // #153 · passage.set: the passage by its number in that scene, or by a quote of its own words.
      passage: { type: 'integer', minimum: 1 },
      quote: { type: 'string', maxLength: 200 },
      // string.stand: where the string stands now.
      stand: { type: 'string', enum: [...STANDS] },
      // rule.switch, instruction.switch: on or off.
      on: { type: 'boolean' },
      // thread.new, thread.wake and rule.set: Always on or On a word, and the wake words.
      activation: { type: 'string', enum: ['always_on', 'triggered'] },
      keys: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 40 } },
      // thread.overtime: what changed, in a few words.
      label: { type: 'string', maxLength: 60 },
      // thread.new, thread.set: the thread's pockets, each its room and its text, beside the change's
      // own text (Seraphine, 2026-11-03: a character is several pockets, and four changes were the
      // most one answer could carry). Before `text`, so the grammar reaches both.
      pockets: { type: 'array', maxItems: 6, items: { type: 'object',
        properties: { room: { type: 'string', enum: [...ALL_SLOTS] }, text: { type: 'string' } },
        required: ['room', 'text'] } },
      // thread.set: the new text of that room. thread.new: its Always true. thread.overtime: the
      // whole of where the thread stands from that scene on. tale.set, scene.set: the field's text.
      // NO maxLength (#144), F25's reason: the GBNF converter honours it and closes the string
      // mid-word with the JSON still valid. Seraphine's pockets were cut at 600 characters mid-word.
      text: { type: 'string' },
      // #99 · the search results this change was made from, by their numbers. The route puts their
      // links in the thread's notes; they never go in its text.
      sources: { type: 'array', maxItems: 3, items: { type: 'integer', minimum: 1 } },
      // #101 · in a tale that follows a World: `world` for the IP's canon, `tale` for the writer's own
      // version. Left out, it is a question (`aimOf`), and nothing in that answer is done.
      to: { type: 'string', enum: ['world', 'tale'] },
    },
    required: ['op'],
  },
} as const;

type Room = { id: string; slot: string; name: string; body: string; keys: string[]; active: boolean; activation?: string };
type Thread = { id: string; title: string; entryType: string; addons?: Room[]; sharedFrom?: string | null; body?: string;
  originId?: string | null;
  activation?: string; keys?: string[]; states?: State[];
  events?: { id: string; kind: string; fromChapter: number }[]; retiredAtChapter?: number | null };
type State = { id: string; fromChapter: number; body: string; label?: string | null; beforeMode?: string | null };
type Scene = { id: string; index: number; title?: string | null; authorsNote?: string | null };
/** A pocket of no thread: one of the tale's rules or the writer's own instructions, as the view has them. */
type Own = { id: string; name: string; body: string; keys?: string[]; active: boolean; activation?: 'always_on' | 'triggered' | 'off' };
/** A string as the view has it: its switch (`summoned`) and its mark (`status`, open, paid or dropped). */
type Str = { id: string; title: string; kind?: string; status?: string | null; summoned?: boolean };
/** The tale as the route read it through the gate: its threads, and since #98 its own fields, its
 *  scenes and the scene the writer is in. The later three are optional so a check that needs only
 *  threads can be handed only threads. */
export type Tale = { entries: Thread[]; story?: Record<string, any>;
  chapters?: Scene[]; at?: number;
  /** #128 · The tale's own thread, whose pockets are its strings; null until it is first needed. */
  taleThread?: Thread | null;
  /** The tale's rules and the writer's own instructions, and its strings with where each stands, by
   *  the view's own names, so the route hands them over as it read them. */
  taleRules?: Own[]; talePockets?: Own[]; strings?: Str[];
  /** #153 · The tale's passages on the branch being written, as the view has them. */
  passages?: { id: string; chapterId: string; body: string; isBreak?: boolean; author?: string }[] };

export type Change =
  | { op: 'thread.new'; title: string; type: string; always: string; keys: string[]; activation: string }
  /** `addon` is the room it writes over, null for one it makes; `before` is that room's text, null
   *  when there was none. On an Undo, `before` is the text being put back. */
  | { op: 'thread.set'; thread: string; title: string; room: string; addon: string | null;
      name: string; keys: string[]; text: string; before: string | null; undo?: true;
      /** #144 · `wake`: the pocket was Off and this request switches it on. `off`: an Undo puts it back Off. */
      wake?: true; off?: true }
  | { op: 'thread.unmake'; thread: string; title: string }
  /** #154 · A rename: `title` to `to`, the wake words after (`keys`) and before, and every place the
   *  name was written, each with its text before and after. On an Undo, `skipped` names the places
   *  the writer changed since, which are left as they are. */
  | { op: 'thread.rename'; thread: string; title: string; to: string; keys: string[]; keysBefore: string[];
      places: Place[]; skipped?: string[]; keepName?: boolean; keepKeys?: boolean; undo?: true }
  /** #153 · One passage, by id; `scene` and `n` say which, in the writer's words. TWO STEPS (Seth,
   *  2026-11-04): `note` is what the writer asked to change, and `text` is the passage the prose engine
   *  rewrote from it, filled in by the route before it is written. `author` is whose it was. */
  | { op: 'passage.set'; passage: string; scene: number; n: number; note: string; text: string; before: string;
      author: string; undo?: true }
  | { op: 'room.unmake'; thread: string; title: string; addon: string; room: string }
  /** `before` is the field's text before the change; on an Undo, the text being put back. `key` is
   *  the story's own name for the field (`TALE_KEY`), which the route writes to. */
  | { op: 'tale.set'; field: string; key: string; text: string; before: string; undo?: true }
  | { op: 'scene.set'; chapter: string; index: number; field: string; text: string; before: string; undo?: true }
  /** `before` is how it woke before the change; on an Undo, how it is being put back. */
  | { op: 'thread.wake'; thread: string; title: string; activation: string; keys: string[];
      before: { activation: string; keys: string[] }; undo?: true }
  /** `state` is the Over time entry it writes over, null for one it makes; `before` is all of that
   *  entry, null when there was none. On an Undo, the entry being put back. */
  | { op: 'thread.overtime'; thread: string; title: string; from: number; text: string; label: string | null;
      beforeMode: string; state: string | null; before: { body: string; label: string | null; beforeMode: string } | null;
      undo?: true }
  | { op: 'state.unmake'; thread: string; title: string; state: string; from: number }
  | { op: 'thread.retire'; thread: string; title: string; from: number }
  /** The retirement Talk dated, taken out of the thread's Over time: the thread is back as it was. */
  | { op: 'retire.unmake'; thread: string; title: string; event: string }
  /** #101 · The tale's copy of a World thread Talk took over, handed back: the World's is read again. */
  | { op: 'takeover.unmake'; thread: string; title: string; origin: string }
  /** #128 · A string: `thread` is the tale's thread, null when the tale has none yet (the route makes
   *  it); `addon` is the string it writes over, null for a new one, which is set up at scene `from`
   *  and put in play; `before` is that string's text, null when there was none. `wasKind` is the kind
   *  it had, when the change makes it the other one. */
  | { op: 'string.set'; thread: string | null; title: string; kind: string; name: string; addon: string | null;
      from: number | null; text: string; before: string | null; wasKind?: string }
  /** Where a string stands now (`stand`) and stood before (`was`). On an Undo, `stand` is the one put back. */
  | { op: 'string.stand'; addon: string; name: string; kind: string; stand: string; was: string; undo?: true }
  /** A rule or an instruction: `addon` is the one it writes over, null for a new one, which is made
   *  on; `before` is its text and wake words, null when there was none. An instruction has no words. */
  | { op: 'rule.set' | 'instruction.set'; addon: string | null; name: string; text: string; keys: string[];
      /** #134 · A rule's eye when Talk's change moves it: Always on, On a word, or new wake words. */
      activation?: 'always_on' | 'triggered';
      before: { text: string; keys: string[] } | null; undo?: true }
  | { op: 'rule.switch' | 'instruction.switch'; addon: string; name: string; on: boolean; undo?: true }
  /** A rule or an instruction Talk added, taken away by an Undo. */
  | { op: 'pocket.unmake'; addon: string; slot: string; name: string };
export type Checked = { ok: true; change: Change } | { ok: false; said: string; why: string };

const NOT_TALK = 'that is not something Talk can do. It changes the tale, its threads, its rules, instructions '
  + 'and strings, its scenes, and a passage when asked; it does not delete anything or write new prose.';

/** A name as both sides of a comparison read it: case, punctuation and a leading article gone. */
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  .replace(/^(the|a|an) /, '');
const words = (t: unknown) => norm(t).split(' ').filter(Boolean);
/** The room as the writer or the model says it. `none` and Always true are the thread's own text. */
const roomOf = (r: unknown) => {
  const x = String(r ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return !x || x === 'none' || x === 'always_true' ? 'facts' : x;
};
const roomLabel = (slot: string) => slot === 'facts' ? 'Always true' : slot === 'question' ? 'open question'
  : slot.replace(/_/g, ' ');
const clip = (t: string, n = 160) => t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
/** A web link, with the brackets a model puts round one. */
const LINK = /\s*[(\[<]?https?:\/\/[^\s)\]>]+[)\]>]?/g;
const an = (kind: string) => (/^[aeiou]/.test(kind) ? 'an ' : 'a ') + kind;

/** The things a name may mean, by `threadNamed`'s rule below: the exact name, else every one whose
 *  words hold all of the name's or are all in it. #128 · Shared with a string, found by its name. */
function byName<T>(xs: T[], name: unknown, nameOf: (x: T) => string): T[] {
  const want = norm(name);
  if (!want) return [];
  const exact = xs.filter((x) => norm(nameOf(x)) === want);
  if (exact.length) return exact;
  const w = new Set(words(name));
  return xs.filter((x) => {
    const ew = new Set(words(nameOf(x)));
    return [...w].every((y) => ew.has(y)) || [...ew].every((y) => w.has(y));
  });
}

/** WHICH THREAD A NAME MEANS. The exact name first. Failing that, a thread whose name holds every
 *  WORD of the one given, or whose words are all in it: "Morgott" is "Morgott, the Omen King", and
 *  "Ta" is nobody, though three names start with it. Two such threads is a question, not a guess:
 *  a change written at once to the wrong one is worse than one not done. */
function threadNamed(tale: Tale, name: unknown): { hit?: Thread; why?: string } {
  if (!norm(name)) return { why: 'it did not name a thread' };
  const near = byName(tale.entries, name, (e) => e.title);
  if (near.length === 1) return { hit: near[0] };
  if (near.length > 1) return { why: `more than one thread could be "${String(name).trim()}": `
    + `${near.map((e) => e.title).join(', ')}. Say which` };
  return { why: `there is no thread called "${String(name).trim()}" in this tale` };
}

/** The room of `t` a change to `slot` writes over: Always true is one per thread; a room a thread
 *  can have several of is the live one, else the newest — `roomOffer`'s rule in routes.ts, which
 *  a chalked change already follows. */
/** The pocket of a room a request writes over: the one On, else one On a word (#144: an On a word
 *  pocket is stored switched off, so it was passed over for an Off one), else the newest. */
const isOff = (a: Room) => (a.activation ?? (a.active ? 'always_on' : 'off')) === 'off';
const roomFor = (t: Thread, slot: string) => {
  const have = (t.addons ?? []).filter((a) => a.slot === slot);
  return have.find((a) => a.active) ?? have.find((a) => !isOff(a)) ?? have.at(-1) ?? null;
};

const hasRoom = (t: Thread, slot: string) => slotsFor(t.entryType).some((s) => s.name === slot);
const noRoom = (t: Thread, slot: string) => ALL_SLOTS.includes(slot)
  ? `${an(t.entryType)} has no ${roomLabel(slot)}` : `a thread has no ${roomLabel(slot)} pocket`;

/** One change the model returned, checked against the tale. */
export function checkAsked(raw: any, tale: Tale): Checked {
  // NO LINK IN THE TEXT (#99). A change made from a web page keeps that page's link in the thread's
  // notes, which the route writes from `sources`; a link the model pasted into the text itself is
  // taken out here, so it cannot ride into every prompt the thread reaches. Seth, 2026-09-01: "i dont
  // need anansi to post where the information is coming from like the url links."
  if (raw && typeof raw.text === 'string') raw = { ...raw, text: raw.text.replace(LINK, '').trim() };
  const op = String(raw?.op ?? '');
  const said = saidOf(raw);
  // A new kind is refused by name; a rename is done everywhere the name is written (#154).
  if (op === 'thread.rename' && String(raw.type ?? '').trim()) return { ok: false, said: `Make ${raw.thread} ${an(String(raw.type))}`,
    why: `Talk does not change a thread's kind. Do it on ${raw.thread}'s card, then ask again` };
  if (!(ASKED as readonly string[]).includes(op)) return { ok: false, said, why: NOT_TALK };
  if (op === 'thread.new') {
    const n = newThread(raw, tale);
    if ('why' in n) return { ok: false, said, why: n.why };
    const { title, type } = n;
    // ONE GOOD KEYWORD WHEN IT STARTS (Seth, 2026-11-01), by the rule a chalked new thread follows.
    const keys = oneKeyword(title, keysOf(raw.keys), keysTakenBy(tale.entries), type);
    // A CHARACTER NEVER LANDS ON A WORD FROM A MODEL'S ANSWER, the rule accepting a chalked thread
    // follows: a character who stops reaching the model does not fade, he vanishes. Anything else
    // waits for its word only when it has one; `upsertEntry` holds the same floor.
    const activation = type !== 'character' && raw.activation === 'triggered' && keys.length ? 'triggered' : 'always_on';
    return { ok: true, change: { op, title, type, always: alwaysOf(title, raw.text), keys, activation } };
  }
  if (op === 'tale.set') return taleSet(tale, raw, said, false);
  if (op === 'passage.set') return passageSet(tale, raw, said, false);
  if (op === 'scene.set') return sceneSet(tale, raw, said, false);
  if (op === 'string.set') return stringSet(tale, raw, said);
  if (op === 'string.stand') return standOn(tale, raw, said, false);
  if (op === 'rule.set' || op === 'instruction.set') return ownSet(tale, op, raw, said, false);
  if (op === 'rule.switch' || op === 'instruction.switch') return ownSwitch(tale, op, raw, said, false);
  const { hit, why } = threadNamed(tale, raw.thread);
  if (!hit) return { ok: false, said, why: why! };
  if (op === 'thread.wake') return wakeOn(hit, raw, said, false);
  if (op === 'thread.overtime') return overtimeOn(tale, hit, raw, said, false);
  if (op === 'thread.retire') return retireOn(tale, hit, raw, said);
  if (op === 'thread.rename') return renameOn(tale, hit, raw, said);
  return setOn(hit, roomOf(raw.room), String(raw.text ?? '').trim(), said, false);
}

/** THE CHANGES A MODEL SENT, AS `checkAsked` READS THEM: the one place a model's shape becomes the
 *  grammar's. Seraphine, 2026-11-03: the live answer sent one change four times, and four lines said
 *  "Not done" about it. A change sent twice is one change.
 *
 *  A THREAD'S POCKET MAY BE NAMED IN `field`, which a thread operation has no other use for: a replay
 *  of Seraphine on the real model named the voice there. And A NEW THREAD SENT ONCE PER POCKET is one
 *  new thread, with the text sent with no pocket (or `none`) as its Always true, then one thread.set
 *  per pocket on it, in the order sent, each checked against the tale as the one before left it. */
export function expandAsked(raws: unknown, tale: Tale): any[] {
  const seen = new Set<string>(), list: any[] = [];
  for (const raw of (Array.isArray(raws) ? raws : []) as any[]) {
    const key = JSON.stringify(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(raw);
  }
  const pocketOf = (r: any) => {
    const named = r?.room ?? (ALL_SLOTS.includes(String(r?.field ?? '')) ? r.field : undefined);
    return named == null ? null : roomOf(named);
  };
  const out: any[] = [], made = new Map<string, any>();
  for (const whole of list) {
    const op = String(whole?.op ?? '');
    // ONE CHANGE CARRYING ITS POCKETS, as the grammar offers it: each is a pocket change on the same
    // thread, after the change itself.
    const { pockets, ...raw } = whole ?? {};
    const name = String(raw.title ?? raw.thread ?? '').trim();
    const each = (op === 'thread.new' || op === 'thread.set') && name && Array.isArray(pockets)
      ? (pockets as any[]).map((p) => ({ op: 'thread.set', thread: op === 'thread.set' ? String(raw.thread ?? '').trim() : name,
          room: roomOf(p?.room), text: p?.text, ...(raw.to ? { to: raw.to } : {}) })) : [];
    if (op === 'thread.set') {
      const room = pocketOf(raw);
      const { field: _f, title: rename, type: kind, ...rest } = raw;
      // A NAME OR A KIND THAT IS NOT THE THREAD'S is a rename, which Talk does not do: it is refused
      // by name (`checkAsked`), and the text the change carried is still done.
      const t = threadNamed(tale, raw.thread).hit;
      const renamed = !!t && !!norm(rename) && norm(rename) !== norm(t.title);
      const rekind = !!t && !!String(kind ?? '').trim() && String(kind).trim() !== t.entryType;
      if (renamed || rekind) out.push({ op: 'thread.rename', thread: t!.title,
        ...(renamed ? { title: String(rename).trim() } : {}), ...(rekind ? { type: String(kind).trim() } : {}) });
      // A change that only carries pockets is those pockets, not an empty change to its Always true.
      // A change that only renames is the rename, not an empty change to its Always true too.
      // ONE WRITE PER ROOM (#144, Seraphine 2026-11-04): a change whose own room is also one of its
      // pockets wrote that room twice, two lines and two Undos for one pocket. The longer text is kept,
      // on the change itself; the same for two pockets naming one room.
      const len = (t: unknown) => String(t ?? '').trim().length;
      const rooms = new Map<string, any>();
      for (const p of each) { const had = rooms.get(p.room); if (!had || len(p.text) > len(had.text)) rooms.set(p.room, p); }
      const twin = room ? rooms.get(room) : null;
      if (twin) rooms.delete(room!);
      const text = twin && len(twin.text) > len(raw.text) ? twin.text : raw.text;
      const only = !String(text ?? '').trim() && (rooms.size > 0 || renamed || rekind);
      // Its name and kind are left on it when they are the thread's own, for the words a refusal uses.
      // The text and pockets a rename carried name the thread as it was; the route sends them to its
      // new name if the rename is done, and they land as they are if it is not.
      const base = renamed || rekind ? rest : { ...rest, ...(rename != null ? { title: rename } : {}), ...(kind != null ? { type: kind } : {}) };
      if (!only) out.push(room ? { ...base, room, text } : { ...base, text });
      out.push(...rooms.values());
      continue;
    }
    if (op !== 'thread.new' || !norm(name)) { out.push(whole); continue; }
    // #152 · A THREAD THE TALE ALREADY HAS, asked to be made, is a change to it: its text to its
    // Always true, its pockets to theirs, each marked so its line says it was there already.
    const have = threadNamed(tale, name).hit;
    if (have && norm(have.title) === norm(name)) {
      if (String(raw.text ?? '').trim()) out.push({ op: 'thread.set', thread: have.title, room: 'facts', text: raw.text, existed: true,
        ...(raw.to ? { to: raw.to } : {}), ...(raw.sources ? { sources: raw.sources } : {}) });
      for (const p of each) out.push({ ...p, thread: have.title, existed: true });
      continue;
    }
    const room = pocketOf(raw);
    const { field: _f, room: _r, text, ...about } = raw;
    let head = made.get(norm(name));
    if (!head) { head = { ...about, op, always: [] as unknown[] }; made.set(norm(name), head); out.push(head); }
    if (room && room !== 'facts') out.push({ op: 'thread.set', thread: name, room, text, ...(raw.to ? { to: raw.to } : {}) });
    else {
      // The first member that carries an Always true carries the thread's own keys and wake, too.
      if (!head.always.length) Object.assign(head, about, { op });
      head.always.push(text);
    }
    // A FACTS POCKET ON A NEW THREAD IS PART OF WHAT IT IS: it joins the Always true rather than
    // writing over it. Measured on the real model, two answers in two sent one beside the text.
    for (const p of each) (p.room === 'facts' ? head.always : out).push(p.room === 'facts' ? p.text : p);
  }
  // The parts of each new thread's Always true, joined in the order sent; none is no text.
  for (const head of made.values()) {
    const parts = (head.always as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean);
    delete head.always;
    if (parts.length) head.text = parts.join(' ');
  }
  return out;
}

/** The words a request to change a thread is made with, as the contract's examples say them. */
const ASKS = /\b(fill|write|add|change|update|make|give|set|put|flesh|expand|complete|rewrite|edit|fix)\b/i;
/** Whether the writer's message asks for a change, by `ASKS`: also what the answer reads to say a
 *  request was only offered (`talkReply` in routes.ts). */
export const asksForChange = (said: string) => ASKS.test(said);

/** A REQUEST THE MODEL SENT BACK AS AN OFFER. Seraphine, 2026-11-04: asked "fill out the seraphine
 *  card and fill her pockets", the real model answered with no change and one entry naming her, so
 *  the request was chalked as an offer (ADR 0007's other lane) and the reply said it was done. An
 *  entry is asked when the writer's message asks for a change in so many words (`ASKS`) and names a
 *  thread this tale has that the entry is about: it is that thread's change, its room from `field`
 *  and its text from `body`, and `expandAsked` and `checkAsked` take it from there like any other.
 *  Everything else stays an offer: a new thread, and a thread the writer only asked about.
 *
 *  WHICH THREAD WAS NAMED is `askedOf`'s question, the one asked rule (#152): by name, or by pronoun
 *  after the writer's message before it named the thread. Its ponytail holds the ceilings. */
const PRONOUN = /\b(she|her|hers|he|him|his|they|them|their|it|its)\b/i;
export function entriesAsked(entries: unknown, tale: Tale, said: string, before = ''): { asked: any[]; offered: any[] } {
  const list = (Array.isArray(entries) ? entries : []) as any[];
  if (!asksForChange(said)) return { asked: [], offered: list };
  const asked: any[] = [], offered: any[] = [];
  for (const e of list) {
    const t = threadNamed(tale, e?.title).hit;
    if (!t || !askedOf({ op: 'thread.set', thread: t.title }, tale, said, before)) { offered.push(e); continue; }
    // Its pockets, if it carried any, are that change's pockets (`expandAsked`).
    asked.push({ op: 'thread.set', thread: t.title, room: e.field ?? 'none', text: e.body,
      ...(Array.isArray(e.pockets) ? { pockets: e.pockets } : {}) });
  }
  return { asked, offered };
}

/** #152 · WHAT WAS ASKED, DECIDED BY THE APP (ADR 0014). The model puts a change in `changes` when it
 *  believes the writer asked for it; on 2026-11-04, asked for Seraphine's card, it also wrote two
 *  promises and an instruction nobody mentioned. So a change counts as asked only when the writer's
 *  own message names its thread or pocket, or asks for its kind ("add a promise", "the narration
 *  voice", "rename the tale"). The writer's message before it (`before`) counts only behind a pronoun
 *  ("fill out her card"), and Anansi's own words never count: him naming a thing is not the writer
 *  asking for it. The one place this rule lives; `entriesAsked` asks it too.
 *
 *  ponytail: names and kind words, by word. Ceilings: a thread named by a common word that is not on
 *  NOT_A_NAME ("Hope", "Will") counts whenever the word is said; a request in words not on these
 *  lists ("give her a sister") is offered rather than done; a pronoun reaches back one message only.
 *  Trigger: a writer finds a request offered, or a change made they did not ask for; then read the
 *  message against the thread's own text instead of word lists. */
const NOT_A_NAME = new Set(['the', 'and', 'for', 'with', 'from', 'old', 'new', 'one', 'two', 'her', 'his', 'its', 'who',
  'what', 'man', 'woman', 'lord', 'lady', 'king', 'queen', 'house', 'city', 'place']);
const nameWords = (name: unknown) => words(name).filter((w) => w.length > 2 && !NOT_A_NAME.has(w));
/** The verbs a change to prose is asked with. */
const EDIT_VERB = /\b(make|change|rewrite|edit|fix|cut|trim|tighten|shorten|lengthen|soften|sharpen|darken|warm|cool|redo|rework|turn|give)\b/;
const ASK_KIND: Record<string, RegExp> = {
  string: /\b(add|make|create|write|set up|new|another)\b[^.!?]*\b(promises?|questions?|strings?)\b|\bstrings?\b/,
  rule: /\brules?\b/,
  instruction: /\binstructions?\b/,
  scene: /\bscenes?\b[^.!?]*\b(title|rename|call|heads?|toward|towards)\b|\b(title|rename|call|heads?|toward|towards)\b[^.!?]*\bscenes?\b/,
  // A new thread asked for by what it is ("add the ferryman"); "make her slower" is not making one.
  newThread: /\b(add|create|introduce)\b|\bmake\b(?!\s+(her|him|them|it|me|us|this|that|his|its)\b)/,
};
/** The words a tale's own field is asked for by. Not "voice" alone: a character has one too, and the
 *  tale's voice outranks everything for register (F37). Not "called" alone: "what is she called?". */
const TALE_ASK: Record<string, RegExp> = {
  premise: /\bpremise\b/, setting: /\bsetting\b/, genre: /genre\b/, style_note: /\bstyle\b/,
  title: /\btitle\b|\brename (it|the (tale|story|book))\b/,
  voice: /\b(narration|narrator|narrative)\b|\b(tale|story)\W?s? voice\b|\bvoice of the (tale|story)\b|\brevoice\b/,
};
export function askedOf(raw: any, tale: Tale, said: string, before = ''): boolean {
  const own = String(said ?? '').toLowerCase();
  const heard = new Set(words(PRONOUN.test(own) ? `${own}\n${before}` : own));
  const named = (name: unknown) => nameWords(name).some((w) => heard.has(w));
  // A string, rule or instruction is often named after a thread ("Seraphine's Directive"): every word
  // of its name must be heard, or a request about Seraphine asks for every pocket that says her name.
  const whole = (name: unknown) => { const ws = nameWords(name); return ws.length > 0 && ws.every((w) => heard.has(w)); };
  const op = String(raw?.op ?? '');
  // Off the list, it is refused by `checkAsked` with its own reason ("not something Talk can do").
  if (!(ASKED as readonly string[]).includes(op)) return true;
  // #154 · A rename needs a word for naming as well as the name: "make her warmer" names Talia and
  // asks for no new name, and a model padding her title ("Talia the Ferrywoman") must not rename her.
  if (op === 'thread.rename') return named(threadNamed(tale, raw.thread).hit?.title ?? raw.thread)
    && /\b(rename[ds]?|renaming|call(ed|s)?|named|new name|goes by|go by|is now)\b/.test(own);
  if (op.startsWith('thread.')) {
    const t = threadNamed(tale, raw.thread ?? raw.title).hit;
    return named(t?.title ?? raw.thread ?? raw.title) || (op === 'thread.new' && ASK_KIND.newThread.test(own));
  }
  if (op.startsWith('string.')) return whole(raw.title) || ASK_KIND.string.test(own);
  if (op.startsWith('rule.')) return whole(raw.title) || ASK_KIND.rule.test(own);
  if (op.startsWith('instruction.')) return whole(raw.title) || ASK_KIND.instruction.test(own);
  if (op === 'tale.set') return TALE_ASK[String(raw.field)]?.test(own) ?? false;
  if (op === 'scene.set') return ASK_KIND.scene.test(own);
  // #153 · A passage is asked for with a verb of changing AND what prose is called, or by quoting
  // several of its words: "who is in this scene?" and "what's her best line?" ask for nothing, and a
  // name alone ("Morgott") is not a quote of a passage.
  if (op === 'passage.set') return (EDIT_VERB.test(own) && /\b(passages?|paragraphs?|prose|sentences?|lines?|scenes?)\b/.test(own))
    || (words(raw.quote).length >= 4 && squash(own).includes(squash(raw.quote)));
  return false;
}

/** A NEW THREAD'S NAME, KIND AND ALWAYS TRUE, checked the one way for a tale and a draft: it has a
 *  name, its kind is a kind, no thread already has that name, and it comes with an Always true. A
 *  thread with none would be made with nothing the model is told about it, and the reply would still
 *  say it was made. The text is read after the link is taken out and without a name in front of it,
 *  so a link or the name alone is no text. */
function newThread(raw: any, tale: Tale): { title: string; type: string } | { why: string } {
  const title = String(raw.title ?? raw.thread ?? '').trim();
  const type = String(raw.type ?? '').trim();
  if (!title) return { why: 'the new thread had no name' };
  if (!(KINDS as string[]).includes(type))
    return { why: `"${type || 'nothing'}" is not a kind of thread. A thread is ${KINDS.join(', ')}` };
  const twin = tale.entries.find((e) => norm(e.title) === norm(title));
  if (twin) return { why: `there is already a thread called ${twin.title}` };
  if (!alwaysOf(title, raw.text)) return { why: `it came with no Always true for ${title}` };
  return { title, type };
}

const keysOf = (k: unknown) => (Array.isArray(k) ? k : []).map((x) => String(x ?? '').trim()).filter(Boolean);
const sameKeys = (a: string[], b: string[]) =>
  [...new Set(a.map(norm))].sort().join('\n') === [...new Set(b.map(norm))].sort().join('\n');
const wakeWords = (activation: string, keys: string[]) => activation === 'triggered'
  ? `On a word${keys.length ? `: ${keys.join(', ')}` : ''}` : 'Always on';

/** #98 · HOW A THREAD WAKES: Always on, or On a word with its wake words. Shared by a request and an
 *  Undo. A request for On a word must leave the thread with words, its own or the ones it gave, or
 *  the thread never reaches the model again and looks fine on the screen (`upsertEntry`'s floor
 *  would quietly turn it Always on instead, and the line would say otherwise). Always on with no
 *  words given keeps the words it had, as the hand switch does. An Undo puts back what was there,
 *  with one exception: a thread that was On a word with no words is not put back that way, because
 *  that is a thread that never reaches the model, and an Undo may not do what a request may not.
 *  It is refused, and the thread stays as it is.
 *
 *  A CHARACTER MAY BE PUT ON A WORD HERE, unlike in a thread Talk makes: there the model chose; here
 *  the writer asked for it in so many words, as they could with the switch on the thread. */
function wakeOn(t: Thread, raw: any, said: string, undo: boolean): Checked {
  if (t.sharedFrom) return followed(t, said);
  const activation = String(raw?.activation ?? '');
  if (activation !== 'always_on' && activation !== 'triggered') return { ok: false, said,
    why: 'a thread is Always on or On a word' };
  const had = { activation: t.activation ?? 'always_on', keys: t.keys ?? [] };
  const w = raw?.wrote;
  if (undo && !(w && w.activation === had.activation && Array.isArray(w.keys) && sameKeys(keysOf(w.keys), had.keys)))
    return { ok: false, said, why: SINCE };
  const given = keysOf(raw.keys);
  const keys = undo ? given : given.length ? given : had.keys;
  if (activation === 'triggered' && !keys.length) return { ok: false, said,
    why: `On a word needs wake words, and ${t.title} has none${undo ? '' : '. Say which words'}` };
  if (!undo && activation === had.activation && sameKeys(keys, had.keys)) return { ok: false, said,
    why: `${t.title} is already ${wakeWords(had.activation, had.keys)}` };
  return { ok: true, change: { op: 'thread.wake', thread: t.id, title: t.title, activation, keys,
    before: undo ? { activation, keys } : had, ...(undo ? { undo: true as const } : {}) } };
}

/** #98 · AN OVER TIME ENTRY: where the thread stands from a scene on, the whole of it, with a short
 *  label. A request names the scene by number (none is the scene the writer is in), and it must be a
 *  scene the tale has (the ticket's rule). The database would take any number, and an entry dated
 *  past the last scene reaches no scene written so far, so the writer would read "done" for a change
 *  nothing they have written sees. Not scene 1: what
 *  holds from scene 1 is the thread itself, which thread.set changes. An entry already dated from
 *  that scene is written over, as `upsertState` does for the hand edit, and its Undo puts all of it
 *  back. An Undo names the entry by id. */
function overtimeOn(tale: Tale, t: Thread, raw: any, said: string, undo: boolean): Checked {
  if (t.sharedFrom) return followed(t, said);
  const text = String(raw?.text ?? '').trim();
  const label = String(raw?.label ?? '').trim() || null;
  if (undo) {
    const st = (t.states ?? []).find((s) => s.id === String(raw.state ?? ''));
    if (!st) return { ok: false, said, why: 'that Timeline entry is no longer in this tale' };
    const w = raw.wrote;
    if (!w || !stillWrote(w.body, st.body) || (w.label ?? null) !== (st.label ?? null)) return { ok: false, said, why: SINCE };
    // The entry goes back at its own scene. The scene in the body is not read: a real Undo names
    // the one the entry has, and a forged one naming another could move it to scene 1, or onto a
    // scene that already has an entry, leaving two dated from one scene.
    const from = st.fromChapter;
    const beforeMode = raw.beforeMode === 'hint' ? 'hint' : 'hide';
    return { ok: true, change: { op: 'thread.overtime', thread: t.id, title: t.title, from, text, label, beforeMode,
      state: st.id, before: { body: text, label, beforeMode }, undo: true } };
  }
  const sc = sceneAt(tale, raw?.scene, tale.at);
  if (!sc) return { ok: false, said, why: noScene(tale, raw?.scene) };
  if (sc.index === 1) return { ok: false, said, why: `The Timeline starts at scene 2. What holds from scene 1 is `
    + `${t.title}'s own text` };
  if (!text) return { ok: false, said, why: 'it came with no text' };
  const at = (t.states ?? []).find((s) => s.fromChapter === sc.index) ?? null;
  if (at && at.body.trim() === text) return { ok: false, said,
    why: `${t.title}'s Timeline from scene ${sc.index} already says that` };
  const beforeMode = at?.beforeMode === 'hint' ? 'hint' : 'hide';
  return { ok: true, change: { op: 'thread.overtime', thread: t.id, title: t.title, from: sc.index, text,
    label: label ?? at?.label ?? null, beforeMode, state: at?.id ?? null,
    before: at ? { body: at.body, label: at.label ?? null, beforeMode } : null } };
}

/** #98 · RETIRED, NEVER DELETED (ADR 0007). "Get rid of the letter" lands here: the thread stops
 *  reaching the model from a scene on, and every scene before it still has it. No scene named is the
 *  one after the scene the writer is in, the scene the Retire press on the thread uses, because what
 *  ends the thread happens during the scene being written. A scene named must be one the tale has,
 *  or that same next one. A thread already retired at that scene, by the engine's own rule, is
 *  refused: a second retirement would change nothing the writer could see, and its Undo would take
 *  away the wrong one. */
function retireOn(tale: Tale, t: Thread, raw: any, said: string): Checked {
  if (t.sharedFrom) return followed(t, said);
  const next = (tale.at ?? 1) + 1;
  const named = raw?.scene == null || raw.scene === '' ? null : Number(raw.scene);
  const from = named ?? next;
  if (named != null && named !== next && !sceneAt(tale, named)) return { ok: false, said, why: noScene(tale, raw.scene) };
  if (retiredAt(t as any, from) != null) return { ok: false, said,
    why: `${t.title} is already retired by scene ${from}` };
  return { ok: true, change: { op: 'thread.retire', thread: t.id, title: t.title, from } };
}

/** A THREAD THE TALE FOLLOWS lives in its World and is changed there. The screen draws it read-only
 *  here for the same reason; a change written through would change every tale that follows it. */
const followed = (t: Thread, said: string): Checked => ({ ok: false, said,
  why: `${t.title} belongs to ${t.sharedFrom}, which this tale follows. Change it there` });

/** AN UNDO PUTS BACK ONLY WHAT TALK WROTE. Each put-back Undo carries `wrote`, the value Talk left
 *  there, and is refused when the thing no longer holds it: the writer changed it since, and an Undo
 *  that put the old value back would write over their edit. The unmake operations compare `text` the
 *  same way. An Undo with no `wrote` proves nothing about what is there, so it is refused too. */
const SINCE = 'it has been changed since';

/** #154 · A RENAME, EVERYWHERE THE NAME IS WRITTEN (ADR 0014), asked in so many words: the thread, its
 *  wake words, every passage (narration and dialogue), every pocket of every thread, the tale's
 *  strings, rules and instructions, and its premise and setting. By whole word and case, so "Talian"
 *  and "talia" are left alone. A name of more than one word also swaps its first word ("Talia" in
 *  "Talia Venn"), the way prose calls people. One change, one card, one Undo.
 *
 *  ponytail: whole word and case. Ceiling: a first name that is also an ordinary word ("Will", "Hope")
 *  is swapped wherever it starts a sentence; the card lists every place so a wrong one can be seen.
 *  Trigger: a writer finds a wrong swap; then ask before swapping a first name that is a dictionary word. */
const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Every pair swapped AT ONCE, longest first, by whole word and case, and written as given: "$&" in a
 *  name is two characters, not a pattern. */
const swapIn = (text: string, pairs: [string, string][]) => {
  if (!pairs.length) return text;
  const to = new Map(pairs);
  const alt = [...to.keys()].sort((a, b) => b.length - a.length).map(escRe).join('|');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'gu'), (m) => to.get(m) ?? m);
};
/** A first word that is a title or an article, never a first name ("The Old Man", "Lady Ysolde"). */
const NOT_A_FIRST_NAME = new Set(['the', 'a', 'an', 'old', 'young', 'lord', 'lady', 'sir', 'dame', 'miss', 'mister', 'mr', 'mrs',
  'ms', 'dr', 'king', 'queen', 'prince', 'princess', 'father', 'mother', 'sister', 'brother', 'saint', 'st', 'captain', 'master']);
/** A first name that is also an everyday word: swapped only inside the whole name, never alone. */
const EVERYDAY = new Set(['will', 'hope', 'may', 'june', 'april', 'rose', 'mark', 'bill', 'grace', 'faith', 'joy', 'dawn', 'art',
  'ray', 'sky', 'storm', 'hunter', 'sunny', 'summer', 'autumn', 'winter', 'max', 'pat', 'sue', 'jack', 'frank', 'river', 'stone']);
const pairsOf = (from: string, to: string): [string, string][] => {
  const w = (t: string) => t.trim().split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}'\u2019-]+$/u, '')).filter(Boolean);
  const a = w(from), b = w(to), ok = (x: string) => x.length > 2 && !NOT_A_FIRST_NAME.has(x.toLowerCase()) && !EVERYDAY.has(x.toLowerCase());
  const out: [string, string][] = [[from.trim(), to.trim()]];
  // The first name alone, the way prose calls people ("Talia" in "Talia Venn").
  if (a.length > 1 && b.length && a[0] !== b[0] && ok(a[0])) out.push([a[0], b[0]]);
  // The surname alone, when only the surname changed ("Miss Venn" for "Talia Venn" to "Talia Cole").
  if (a.length > 1 && b.length > 1 && a[0] === b[0] && a.at(-1) !== b.at(-1) && ok(a.at(-1)!)) out.push([a.at(-1)!, b.at(-1)!]);
  return out;
};
function placesOf(tale: Tale, pairs: [string, string][]): Place[] {
  const out: Place[] = [];
  const scene = (chapterId: string) => (tale.chapters ?? []).find((c: any) => c.id === chapterId) as any;
  const ps = (tale.passages ?? []).filter((p) => !p.isBreak);
  for (const p of ps) {
    const after = swapIn(p.body, pairs);
    const n = ps.filter((x) => x.chapterId === p.chapterId).findIndex((x) => x.id === p.id) + 1;
    if (after !== p.body) out.push({ kind: 'passage', id: p.id, before: p.body, after, where: `scene ${scene(p.chapterId)?.index ?? '?'}, passage ${n}` });
  }
  // A POCKET, by its text and its name; it keeps its own wake words: its save writes them with its
  // text, and an empty list clears them.
  const pocket = (a: { id: string; slot?: string; name: string; body: string; keys?: string[] }, thread: string | null, of: string) => {
    const after = swapIn(a.body, pairs), name = swapIn(a.name, pairs);
    if (after !== a.body || name !== a.name) out.push({ kind: 'pocket', id: a.id, before: a.body, after, thread, slot: a.slot,
      name, nameBefore: a.name, keys: a.keys ?? [], where: `${of}'s ${a.name}` });
  };
  for (const e of tale.entries.filter((x) => !x.sharedFrom)) {
    // A thread's own text: where it stands, which reaches the model as the thread does.
    const body = String(e.body ?? ''), after = swapIn(body, pairs);
    if (after !== body) out.push({ kind: 'thread', id: e.id, before: body, after, where: `${e.title}'s text` });
    for (const a of e.addons ?? []) pocket(a, e.id, e.title);
  }
  for (const a of tale.taleThread?.addons ?? []) pocket(a, tale.taleThread!.id, 'the tale');
  for (const a of tale.taleRules ?? []) pocket({ ...a, slot: 'rule' }, null, 'the rule');
  for (const a of tale.talePockets ?? []) pocket({ ...a, slot: 'instruction' }, null, 'your instruction');
  for (const c of (tale.chapters ?? []) as Scene[]) for (const [f, label] of [['title', 'title'], ['authorsNote', 'heading']] as const) {
    const was = String(c[f] ?? ''), after = swapIn(was, pairs);
    if (after !== was) out.push({ kind: 'scene', id: `${c.id}:${f}`, before: was, after, where: `scene ${c.index}'s ${label}` });
  }
  for (const f of ['premise', 'setting'] as const) {
    const was = String(tale.story?.[f] ?? '');
    const after = swapIn(was, pairs);
    if (after !== was) out.push({ kind: 'tale', id: f, before: was, after, where: `the tale's ${f}` });
  }
  return out;
}
/** The text a place holds now, as the tale was read. */
function nowAt(tale: Tale, p: Place): string | undefined {
  if (p.kind === 'passage') return tale.passages?.find((x) => x.id === p.id)?.body;
  if (p.kind === 'tale') return tale.story?.[p.id];
  if (p.kind === 'thread') return String(tale.entries.find((e) => e.id === p.id)?.body ?? '');
  if (p.kind === 'scene') { const [id, f] = p.id.split(':'); return String(((tale.chapters ?? []).find((c: any) => c.id === id) as any)?.[f] ?? ''); }
  const all = [...tale.entries.flatMap((e) => e.addons ?? []), ...(tale.taleThread?.addons ?? []), ...(tale.taleRules ?? []), ...(tale.talePockets ?? [])];
  return all.find((a: any) => a.id === p.id)?.body;
}
const sameKeys2 = (a: unknown, b: unknown) => JSON.stringify([...(Array.isArray(a) ? a : [])].sort()) === JSON.stringify([...(Array.isArray(b) ? b : [])].sort());
function renameOn(tale: Tale, t: Thread, raw: any, said: string, undo = false): Checked {
  if (t.sharedFrom) return followed(t, said);
  const to = String((undo ? raw.to : raw.title) ?? '').trim();
  if (!to) return { ok: false, said, why: 'it gave no new name' };
  if (!undo) {
    const twin = tale.entries.find((e) => e.id !== t.id && norm(e.title) === norm(to));
    if (twin) return { ok: false, said, why: `there is already a thread called ${twin.title}` };
    const pairs = pairsOf(t.title, to);
    return { ok: true, change: { op: 'thread.rename', thread: t.id, title: t.title, to, places: placesOf(tale, pairs),
      keys: [...new Set((t.keys ?? []).map((k) => swapIn(k, pairs)))], keysBefore: t.keys ?? [] } };
  }
  // AN UNDO puts back every place still as Talk left it, and the name and wake words only while they
  // are still Talk's: renamed again or given new words, those are the writer's and are left.
  const all = (Array.isArray(raw.places) ? raw.places : []) as Place[];
  const kept = all.filter((p) => String(nowAt(tale, p) ?? '').trim() === String(p.before).trim());
  const keepName = norm(t.title) !== norm(raw.title), keepKeys = !sameKeys2(t.keys ?? [], raw.wroteKeys);
  return { ok: true, change: { op: 'thread.rename', thread: t.id, title: t.title, to, places: kept,
    keys: Array.isArray(raw.keys) ? raw.keys : [], keysBefore: t.keys ?? [], keepName, keepKeys,
    skipped: [...(keepName ? [`the name ${t.title}, renamed since`] : []), ...(keepKeys && !keepName ? ['its wake words, changed since'] : []),
      ...all.filter((p) => !kept.includes(p)).map((p) => p.where)], undo: true } };
}

/** #153 · ONE PASSAGE, EDITED WHEN ASKED (ADR 0014): found by its scene and its number there (breaks
 *  not counted; none is the scene being written), or by a quote of its own words, which must find
 *  exactly one. Talk names the passage and what to change (`text`, the writer's request); the route
 *  has the prose engine rewrite it from its real text, and writes that through the passage's own edit,
 *  so the old version is kept in its Alterations. An Undo puts the old text and author back only while
 *  the passage holds what Talk wrote. */
const squash = (t: unknown) => String(t ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/\s+/g, ' ').trim();
function passageSet(tale: Tale, raw: any, said: string, undo: boolean): Checked {
  const ps = (tale.passages ?? []).filter((p) => !p.isBreak && String(p.body ?? '').trim());
  const at = (p: { id: string; chapterId: string }) => {
    const ch = (tale.chapters ?? []).find((c: any) => c.id === p.chapterId) as any;
    return { scene: Number(ch?.index ?? 0), n: ps.filter((x) => x.chapterId === p.chapterId).findIndex((x) => x.id === p.id) + 1 };
  };
  if (undo) {
    const p = ps.find((x) => x.id === String(raw.passage ?? ''));
    if (!p) return { ok: false, said, why: 'that passage is no longer in this tale' };
    if (!stillWrote(raw.wrote, p.body)) return { ok: false, said, why: SINCE };
    return { ok: true, change: { op: 'passage.set', passage: p.id, ...at(p), note: '', text: String(raw.text ?? ''), before: p.body,
      author: String(raw.author ?? p.author ?? 'model'), undo: true } };
  }
  // What to change. The route puts the writer's own message here before the rewrite (#153).
  const note = String(raw.text ?? '').trim();
  let hit;
  if (String(raw.quote ?? '').trim()) {
    const q = squash(raw.quote);
    const found = ps.filter((p) => squash(p.body).includes(q));
    if (!found.length) return { ok: false, said, why: `no passage says "${String(raw.quote).trim()}"` };
    if (found.length > 1) return { ok: false, said, why: `more than one passage says "${String(raw.quote).trim()}". Quote more of it` };
    hit = found[0];
  } else if (raw.passage != null) {
    // No scene is the scene the writer is in, as every other change that names a scene reads it.
    const scene = raw.scene ?? tale.at;
    const ch = (tale.chapters ?? []).find((c: any) => Number(c.index) === Number(scene)) as any;
    hit = ch ? ps.filter((p) => p.chapterId === ch.id)[Number(raw.passage) - 1] : undefined;
    if (!hit) return { ok: false, said, why: `there is no passage ${raw.passage} in scene ${scene}` };
  } else return { ok: false, said, why: 'it names no passage: give the scene and its number, or quote it' };
  return { ok: true, change: { op: 'passage.set', passage: hit.id, ...at(hit), note, text: '', before: hit.body,
    author: String(hit.author ?? 'model') } };
}
const stillWrote = (wrote: unknown, now: unknown) => typeof wrote === 'string' && String(now ?? '').trim() === wrote.trim();

/** #98 · ONE OF THE TALE'S OWN FIELDS: its premise or setting, and since 2026-10-29 its title, genre,
 *  voice and style note. Shared by a request and an Undo; an Undo may put back an empty field,
 *  because that is what was there. A GENRE IS CHECKED AND REMEMBERED TIDIED, as `db.updateStory`
 *  stores it (`tidyGenre`): remembered as asked, "noir / gothic" would never match the "noir, gothic"
 *  stored, and its Undo would always be refused. */
function taleSet(tale: Tale, raw: any, said: string, undo: boolean): Checked {
  const field = String(raw?.field ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!(TALE_FIELDS as readonly string[]).includes(field)) return { ok: false, said,
    why: `Talk changes the tale's premise, setting, title, genre, voice or style note, not its ${field.replace(/_/g, ' ') || 'nothing'}` };
  const key = TALE_KEY[field];
  const asked = String(raw.text ?? '').trim();
  const text = field === 'genre' && !undo ? tidyGenre(asked) : asked;
  const before = String(tale.story?.[key] ?? '');
  if (undo && !stillWrote(raw.wrote, before)) return { ok: false, said, why: SINCE };
  if (!undo && !text) return { ok: false, said, why: 'it came with no text' };
  if (!undo && before.trim() === text) return { ok: false, said, why: `the tale's ${field.replace(/_/g, ' ')} already says that` };
  return { ok: true, change: { op: 'tale.set', field, key, text, before: undo ? text : before,
    ...(undo ? { undo: true as const } : {}) } };
}

/** #98 · A SCENE'S TITLE OR WHERE IT HEADS. A request names the scene by its number, the way the
 *  writer does, and no number is the scene they are in; an Undo names it by id. A number the tale has
 *  no scene for is refused, never read as the nearest one. */
function sceneSet(tale: Tale, raw: any, said: string, undo: boolean): Checked {
  const field = String(raw?.field ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!(SCENE_FIELDS as readonly string[]).includes(field)) return { ok: false, said,
    why: 'Talk changes a scene\'s title or where it heads, nothing else of it' };
  const scenes = tale.chapters ?? [];
  const sc = undo ? scenes.find((x) => x.id === String(raw.chapter ?? ''))
    : sceneAt(tale, raw.scene, tale.at);
  if (!sc) return { ok: false, said, why: undo ? 'that scene is no longer in this tale' : noScene(tale, raw.scene) };
  const text = String(raw.text ?? '').trim();
  const before = String((field === 'title' ? sc.title : sc.authorsNote) ?? '');
  if (undo && !stillWrote(raw.wrote, before)) return { ok: false, said, why: SINCE };
  if (!undo && !text) return { ok: false, said, why: 'it came with no text' };
  if (!undo && before.trim() === text) return { ok: false, said,
    why: `scene ${sc.index}'s ${field === 'title' ? 'title' : 'Heads toward'} already says that` };
  return { ok: true, change: { op: 'scene.set', chapter: sc.id, index: sc.index, field, text,
    before: undo ? text : before, ...(undo ? { undo: true as const } : {}) } };
}
/** #128 · A STRING OF THE TALE (ADR 0011): a promise or an open question, a pocket of the tale's own
 *  thread, by its name. A name the tale has rewrites that string's text, and its kind stays unless one
 *  is asked for: then it is made the other kind (`wasKind` is the old one), as the pocket panel's two
 *  kinds do, and the Undo puts the old kind back. A new name adds one,
 *  set up in the scene the writer is in. Its text is stored plain, as `setOn`'s is. */
function stringSet(tale: Tale, raw: any, said: string): Checked {
  const kind = raw?.kind == null || raw.kind === '' ? null : String(raw.kind).trim().toLowerCase();
  if (kind && !STRING_SLOTS.includes(kind)) return { ok: false, said, why: 'a string is a promise or an open question' };
  const title = String(raw?.title ?? raw?.thread ?? '').trim();
  if (!title) return { ok: false, said, why: 'the string had no name' };
  const t = tale.taleThread ?? null;
  const strings = (t?.addons ?? []).filter((a) => STRING_SLOTS.includes(a.slot));
  const near = byName(strings, title, (a) => a.name);
  if (near.length > 1) return { ok: false, said, why: `more than one string could be "${title}": `
    + `${near.map((a) => a.name).join(', ')}. Say which` };
  const cur = near[0] ?? null;
  // Seth, 2026-10-28: A STRING THE TALE HAS MAY BE MADE THE OTHER KIND, and then its text may be left out.
  const wasKind = cur && kind && kind !== cur.slot ? cur.slot : null;
  const slot = kind ?? cur?.slot ?? 'promise';
  const name = cur?.name ?? title;
  const text = plain(String(raw?.text ?? '').trim(), wrapperNames(slot, t?.title ?? 'The tale', name))
    || (wasKind ? cur!.body.trim() : '');
  if (!text) return { ok: false, said, why: 'it came with no text' };
  if (cur && !wasKind && cur.body.trim() === text) return { ok: false, said, why: `${name} already says that` };
  return { ok: true, change: { op: 'string.set', thread: t?.id ?? null, title: t?.title ?? 'The tale', kind: slot, name,
    addon: cur?.id ?? null, from: cur ? null : tale.at ?? null, text, before: cur ? cur.body : null,
    ...(wasKind ? { wasKind } : {}) } };
}

/** WHERE A STRING STANDS NOW, in the writer's words: tied off or let go by its mark, else in play
 *  while it is on and set aside while it is off. The page's `stringStand` reads it the same way. */
const standOf = (x: Str) => x.status === 'paid' ? 'tied_off' : x.status === 'dropped' ? 'let_go'
  : x.summoned ? 'in_play' : 'set_aside';
const standWords: Record<string, string> = { in_play: 'in play', set_aside: 'set aside', tied_off: 'tied off', let_go: 'let go' };
const stringLabel = (kind: string) => kind === 'question' ? 'open question' : 'promise';

/** A STRING PUT IN PLAY, SET ASIDE, TIED OFF OR LET GO (ADR 0011), by its name. Putting a tied-off or
 *  let-go string in play reopens it, as switching it on does on the page. A request for where it
 *  already stands is refused, as every "already says that" is. An Undo names it by id, and puts the
 *  old stand back only while it still stands where Talk left it. */
function standOn(tale: Tale, raw: any, said: string, undo: boolean): Checked {
  const stand = String(raw?.stand ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!(STANDS as readonly string[]).includes(stand)) return { ok: false, said,
    why: 'a string is in play, set aside, tied off or let go' };
  const strings = tale.strings ?? [];
  let cur: Str | undefined;
  if (undo) {
    cur = strings.find((x) => x.id === String(raw?.addon ?? ''));
    if (!cur) return { ok: false, said, why: 'that string is no longer in this tale' };
    if (standOf(cur) !== raw?.wrote) return { ok: false, said, why: SINCE };
  } else {
    const title = String(raw?.title ?? raw?.thread ?? '').trim();
    const near = byName(strings, title, (x) => x.title);
    if (!title) return { ok: false, said, why: 'it did not name a string' };
    if (near.length > 1) return { ok: false, said, why: `more than one string could be "${title}": `
      + `${near.map((x) => x.title).join(', ')}. Say which` };
    if (!near.length) return { ok: false, said, why: `there is no string called "${title}" in this tale` };
    cur = near[0];
    if (standOf(cur) === stand) return { ok: false, said, why: `${cur.title} is already ${standWords[stand]}` };
  }
  return { ok: true, change: { op: 'string.stand', addon: cur.id, name: cur.title, kind: cur.kind ?? 'promise', stand,
    was: undo ? stand : standOf(cur), ...(undo ? { undo: true as const } : {}) } };
}

/** THE TALE'S OWN POCKETS BY KIND: its rules (ADR 0005), a law the tale obeys, sent always or on its
 *  wake words; and the writer's own instructions ("Your own"), sent while on. Both hang off no
 *  thread (`db.TALE_OWN`), so no thread operation can reach them. */
const OWN_OF = { rule: { list: 'taleRules', label: 'rule', the: 'the rule', none: 'rule' },
  instruction: { list: 'talePockets', label: 'instruction of your own', the: 'your instruction', none: 'instruction of yours' } } as const;
const ownSlot = (op: string) => op.startsWith('rule.') ? 'rule' : 'instruction';
const ownList = (tale: Tale, slot: string): Own[] => (slot === 'rule' ? tale.taleRules : tale.talePockets) ?? [];

/** One of the tale's own pockets by its name, by `threadNamed`'s rule: the exact name, else the one
 *  whose words hold the name's. Two is a question. */
function ownNamed(tale: Tale, slot: 'rule' | 'instruction', name: string): { hit?: Own; why?: string } {
  const near = byName(ownList(tale, slot), name, (x) => x.name);
  if (near.length > 1) return { why: `more than one ${slot} could be "${name}": ${near.map((x) => x.name).join(', ')}. Say which` };
  return near.length ? { hit: near[0] } : {};
}

/** A RULE OR AN INSTRUCTION, ADDED OR CHANGED, by its name. A new name adds one, switched on, as the
 *  Thread tab's Add does; it needs text. A name the tale has rewrites its text, or for a rule its wake
 *  words, or both: words given replace its own, Always on takes them away, and On a word with no words
 *  given or kept is refused, as a thread's is (`wakeOn`). Text is stored plain (`db.upsertAddon` takes
 *  a wrapper off by the same rule, with no thread's name), so it is checked and remembered plain. An
 *  Undo names the pocket by id and puts back its text and words, while it holds what Talk wrote. */
function ownSet(tale: Tale, op: 'rule.set' | 'instruction.set', raw: any, said: string, undo: boolean): Checked {
  const slot = ownSlot(op) as 'rule' | 'instruction';
  const rule = slot === 'rule';
  if (undo) {
    const cur = ownList(tale, slot).find((x) => x.id === String(raw?.addon ?? ''));
    if (!cur) return { ok: false, said, why: `that ${slot} is no longer in this tale` };
    const w = raw?.wrote;
    if (!w || !stillWrote(w.text, cur.body) || (rule && !sameKeys(keysOf(w.keys), cur.keys ?? [])))
      return { ok: false, said, why: SINCE };
    const text = String(raw.text ?? ''), keys = rule ? keysOf(raw.keys) : [];
    return { ok: true, change: { op, addon: cur.id, name: cur.name, text, keys, before: { text, keys }, undo: true,
      ...(rule && !sameKeys(keys, cur.keys ?? []) ? { activation: keys.length ? 'triggered' as const : 'always_on' as const } : {}) } };
  }
  const title = String(raw?.title ?? raw?.thread ?? '').trim();
  if (!title) return { ok: false, said, why: `the ${slot} had no name` };
  const { hit: cur, why } = ownNamed(tale, slot, title);
  if (why) return { ok: false, said, why };
  const name = cur?.name ?? title;
  const text = plain(String(raw?.text ?? '').trim(), wrapperNames(slot, '', name)) || (cur?.body.trim() ?? '');
  if (!text) return { ok: false, said, why: 'it came with no text' };
  const had = cur?.keys ?? [];
  const given = rule ? keysOf(raw?.keys) : [];
  const keys = !rule || raw?.activation === 'always_on' ? [] : given.length ? given : had;
  if (rule && raw?.activation === 'triggered' && !keys.length) return { ok: false, said,
    why: `On a word needs wake words, and ${name} has none. Say which words` };
  if (cur && cur.body.trim() === text && sameKeys(keys, had)) return { ok: false, said, why: `${name} already says that` };
  // #134 · A RULE'S EYE moves with what Talk was asked: Always on is On, On a word is On a word, and
  // new wake words alone make it On a word (none, On), as they did before the eye. A rule that is Off
  // stays Off (`applyChange`).
  const activation = !rule ? undefined
    : raw?.activation === 'always_on' || raw?.activation === 'triggered' ? raw.activation as 'always_on' | 'triggered'
    : !cur || !sameKeys(keys, had) ? (keys.length ? 'triggered' : 'always_on') : undefined;
  return { ok: true, change: { op, addon: cur?.id ?? null, name, text, keys, ...(activation ? { activation } : {}),
    before: cur ? { text: cur.body, keys: had } : null } };
}

/** A RULE OR AN INSTRUCTION SWITCHED ON OR OFF, by its name, as its switch on the Thread tab does. An
 *  Undo names it by id and switches it back while it is still as Talk left it. */
function ownSwitch(tale: Tale, op: 'rule.switch' | 'instruction.switch', raw: any, said: string, undo: boolean): Checked {
  const slot = ownSlot(op) as 'rule' | 'instruction';
  if (raw?.on !== true && raw?.on !== false) return { ok: false, said, why: `say whether the ${slot} is on or off` };
  let cur: Own | undefined;
  if (undo) {
    cur = ownList(tale, slot).find((x) => x.id === String(raw?.addon ?? ''));
    if (!cur) return { ok: false, said, why: `that ${slot} is no longer in this tale` };
    if (cur.active !== raw.wrote) return { ok: false, said, why: SINCE };
  } else {
    const title = String(raw?.title ?? raw?.thread ?? '').trim();
    const { hit, why } = ownNamed(tale, slot, title);
    if (why) return { ok: false, said, why };
    if (!hit) return { ok: false, said, why: `there is no ${OWN_OF[slot].none} called "${title}" in this tale` };
    cur = hit;
    if (cur.active === raw.on) return { ok: false, said, why: `${cur.name} is already ${raw.on ? 'on' : 'off'}` };
  }
  return { ok: true, change: { op, addon: cur.id, name: cur.name, on: raw.on, ...(undo ? { undo: true as const } : {}) } };
}

/** WHAT TALK IS SHOWN OF THE TALE'S OWN POCKETS, so it can name them: every rule, instruction and
 *  string by name, with where it stands, and its text cut short. The prompt sends only the rules and
 *  instructions that are on, and only the strings in play, and none of them by name, so without this
 *  Talk could not name one to change, nor switch on one that is off. Empty when the tale has none.
 *  ponytail: the first 30 of each; a tale with more cannot have the rest named until a search is added. */
export function talesOwn(tale: Tale): string {
  const cut = (xs: any[]) => xs.slice(0, 30);
  const line = (name: string, state: string, body?: string) =>
    `- ${name} (${state})${body?.trim() ? `: ${clip(body.trim().replace(/\s+/g, ' '), 140)}` : ''}`;
  const parts = [
    // #134 · By the rule's eye. An Off rule says how it is sent once switched on: on its words if it has any.
    tale.taleRules?.length && `Rules:\n${cut(tale.taleRules).map((r) => { const reach = pocketReach({ ...r, slot: 'rule' });
      const words = r.keys ?? [];
      return line(r.name, `${reach === 'off' ? 'off' : 'on'}, ${reach === 'always_on' || (reach === 'off' && !words.length)
        ? 'always' : `on a word: ${words.join(', ')}`}`, r.body); }).join('\n')}`,
    tale.talePockets?.length && `The writer's own instructions:\n${cut(tale.talePockets).map((p) =>
      line(p.name, p.active ? 'on' : 'off', p.body)).join('\n')}`,
    tale.strings?.length && `Strings:\n${cut(tale.strings).map((x) =>
      line(x.title, `${an(stringLabel(x.kind ?? 'promise'))}, ${standWords[standOf(x)]}`, (x as any).body)).join('\n')}`,
  ].filter(Boolean);
  return parts.length ? `The tale's own, which a change names by name (on means sent to the model):\n${parts.join('\n')}` : '';
}

/** The scene a number names, or `dflt`'s when none is given. Never the nearest one. */
const sceneAt = (tale: Tale, n: unknown, dflt?: number) => {
  const want = n == null || n === '' ? dflt : Number(n);
  return (tale.chapters ?? []).find((x) => x.index === want);
};
const noScene = (tale: Tale, n: unknown) =>
  `there is no scene ${n ?? ''} in this tale; it has ${(tale.chapters ?? []).length}`;

/** A thread.set, once its thread is known. Shared by a request and an Undo, so the two cannot
 *  disagree about which rooms a thread has or which room a change lands in. */
function setOn(t: Thread, slot: string, text: string, said: string, undo: boolean, addon?: string | null,
               wrote?: unknown, wroteKind?: unknown): Checked {
  if (t.sharedFrom) return followed(t, said);
  if (!hasRoom(t, slot)) return { ok: false, said, why: noRoom(t, slot) };
  // A string Talk made the other kind is still that kind (`wroteKind`), and is put back as `slot`.
  const now = STRING_SLOTS.includes(slot) && STRING_SLOTS.includes(String(wroteKind)) ? String(wroteKind) : slot;
  if (undo && now !== slot && (t.addons ?? []).some((a) => a.id === addon && a.slot === slot))
    return { ok: false, said, why: SINCE };
  const cur = undo ? (t.addons ?? []).find((a) => a.id === addon && a.slot === now) ?? null : roomFor(t, slot);
  // A put-back names the pocket it writes over. With none named it would make one, and making a
  // pocket is a request's, checked as one; an Undo of a pocket Talk made is `room.unmake`.
  if (undo && !addon) return { ok: false, said, why: 'that Undo names no pocket to put back' };
  if (undo && !cur) return { ok: false, said, why: 'that pocket is no longer in this tale' };
  if (undo && cur && !stillWrote(wrote, cur.body)) return { ok: false, said, why: SINCE };
  const name = cur?.name ?? (slot === 'facts' ? 'facts' : t.title);
  // #110 · A REQUEST'S TEXT IS STORED PLAIN, so it is checked and remembered for the Undo as it will be
  // stored (`db.upsertAddon` takes the same wrapper off by the same rule). A put-back is the text that
  // was there, which the floor keeps as it is.
  if (!undo) text = plain(text, wrapperNames(slot, t.title, name));
  if (!undo && !text) return { ok: false, said, why: 'it came with no text' };
  if (!undo && cur && cur.body.trim() === text) return { ok: false, said,
    why: `${t.title}'s ${roomLabel(slot)} already says that` };
  // #144 · AN OFF POCKET WRITTEN ON REQUEST IS SWITCHED ON (Seraphine, 2026-11-04: her appearance was
  // Off, Talk filled it, and it never reached a passage). It takes nothing off in a one-at-a-time
  // kind: `roomFor` picks an On or On a word pocket of the room first, so an Off one is written only
  // when every pocket of that room is Off.
  const wake = !undo && !!cur && isOff(cur);
  return { ok: true, change: { op: 'thread.set', thread: t.id, title: t.title, room: slot,
    addon: cur?.id ?? null, name, keys: cur?.keys ?? [],
    text, before: undo ? text : cur ? cur.body : null, ...(undo ? { undo: true as const } : {}),
    ...(wake ? { wake: true as const } : {}) } };
}

/** One Undo, checked against the tale. By id, never by name: it names what was changed. */
export function checkUndo(raw: any, tale: Tale): Checked {
  const op = String(raw?.op ?? '');
  const said = 'Undo';
  if (!(PUT_BACK as readonly string[]).includes(op) && !(UNMAKE as readonly string[]).includes(op))
    return { ok: false, said, why: 'that is not something Undo can do' };
  if (op === 'tale.set') return taleSet(tale, raw, said, true);
  if (op === 'passage.set') return passageSet(tale, raw, said, true);
  if (op === 'thread.rename') { const t = tale.entries.find((e) => e.id === String(raw.thread ?? ''));
    return t ? renameOn(tale, t, raw, said, true) : { ok: false, said, why: 'that thread is no longer in this tale' }; }
  if (op === 'scene.set') return sceneSet(tale, raw, said, true);
  if (op === 'string.stand') return standOn(tale, raw, said, true);
  if (op === 'rule.set' || op === 'instruction.set') return ownSet(tale, op, raw, said, true);
  if (op === 'rule.switch' || op === 'instruction.switch') return ownSwitch(tale, op, raw, said, true);
  // A RULE OR INSTRUCTION TALK ADDED, taken away while it holds exactly the text Talk wrote. Looked for
  // in its own list only, so an Undo naming a rule never reaches an instruction or a thread's pocket.
  if (op === 'pocket.unmake') {
    const slot = raw?.slot === 'rule' ? 'rule' : raw?.slot === 'instruction' ? 'instruction' : null;
    const a = slot ? ownList(tale, slot).find((x) => x.id === String(raw.addon ?? '')) : undefined;
    if (!slot || !a) return { ok: false, said, why: 'that pocket is no longer in this tale' };
    if (a.body.trim() !== String(raw.text ?? '').trim()) return { ok: false, said,
      why: `${a.name} has changed since Talk made it. Delete it by hand if you mean to` };
    return { ok: true, change: { op: 'pocket.unmake', addon: a.id, slot, name: a.name } };
  }
  // #128 · THE TALE'S OWN THREAD only for one of its strings: a string put back, or one Talk added
  // taken away. Never its Always true, never the thread itself, which Talk did not make.
  const own = tale.taleThread && tale.taleThread.id === String(raw.thread ?? '') ? tale.taleThread : null;
  const aString = !!own && (op === 'thread.set' ? STRING_SLOTS.includes(roomOf(raw.room))
    : op === 'room.unmake' && (own.addons ?? []).some((a) => a.id === String(raw.addon ?? '') && STRING_SLOTS.includes(a.slot)));
  const t = tale.entries.find((e) => e.id === String(raw.thread ?? '')) ?? (aString ? own! : undefined);
  if (!t) return { ok: false, said, why: 'that thread is no longer in this tale' };
  const text = String(raw.text ?? '');
  if (op === 'thread.set') {
    const k = setOn(t, roomOf(raw.room), text, said, true, raw.addon ?? null, raw.wrote, raw.wroteKind);
    return k.ok && raw.off === true && k.change.op === 'thread.set' ? { ...k, change: { ...k.change, off: true } } : k;
  }
  if (op === 'thread.wake') return wakeOn(t, raw, said, true);
  if (op === 'thread.overtime') return overtimeOn(tale, t, raw, said, true);
  // TAKEN AWAY ONLY WHILE IT IS AS TALK MADE IT. The text it was made with rides in the Undo and is
  // compared with what is there now: a thread or room the writer has changed since is theirs, and
  // an Undo that claims Talk made a thread the writer wrote does not match its text.
  const changed = { ok: false as const, said, why: `${t.title} has changed since Talk made it. Delete it by hand if you mean to` };
  if (op === 'thread.unmake') {
    if (t.sharedFrom || norm(t.title) !== norm(raw.title)) return changed;
    const always = (t.addons ?? []).find((a) => a.slot === 'facts')?.body ?? '';
    // #144 · THE POCKETS TALK MADE WITH IT, by id and text, go with it: the thread's Undo waited until
    // each pocket's own Undo had been pressed. Any other pocket, or one changed since, is the writer's.
    const own = new Map((Array.isArray(raw.pockets) ? raw.pockets : []).map((p: any) => [String(p?.addon ?? ''), String(p?.text ?? '').trim()]));
    // An Over time entry made since is a change too (#98): taking the thread away would take it.
    if (always.trim() !== text.trim() || (t.addons ?? []).some((a) => a.slot !== 'facts' && own.get(a.id) !== a.body.trim())
      || (t.states ?? []).length) return changed;
    return { ok: true, change: { op, thread: t.id, title: t.title } };
  }
  // A retirement is taken back by its own dated event, and only a retirement: never an outfit, and
  // never a return the writer pressed. The thread is then as it was before Talk retired it.
  // #101 · A TAKE-OVER HANDED BACK, only while the copy is exactly as Talk left it (`fingerprint`):
  // anything the writer did to it since is theirs, and handing it back would throw it away.
  if (op === 'takeover.unmake') {
    if (!t.originId || t.sharedFrom) return { ok: false, said, why: `${t.title} is not one this tale took over` };
    if (fingerprint(t) !== String(raw.wrote ?? '')) return { ok: false, said, why: SINCE };
    return { ok: true, change: { op, thread: t.id, title: t.title, origin: t.originId } };
  }
  if (op === 'retire.unmake') {
    const ev = (t.events ?? []).find((x) => x.id === String(raw.event ?? '') && x.kind === 'retire');
    if (!ev) return { ok: false, said, why: 'that retirement is no longer in this tale' };
    return { ok: true, change: { op, thread: t.id, title: t.title, event: ev.id } };
  }
  if (op === 'state.unmake') {
    const st = (t.states ?? []).find((s) => s.id === String(raw.state ?? ''));
    if (!st) return { ok: false, said, why: 'that Timeline entry is no longer in this tale' };
    if (st.body.trim() !== text.trim()) return { ...changed,
      why: `${t.title}'s Timeline from scene ${st.fromChapter} has changed since Talk made it` };
    return { ok: true, change: { op, thread: t.id, title: t.title, state: st.id, from: st.fromChapter } };
  }
  const a = (t.addons ?? []).find((x) => x.id === String(raw.addon ?? ''));
  if (!a) return { ok: false, said, why: 'that pocket is no longer in this tale' };
  // A THREAD KEEPS ITS ALWAYS TRUE. A request cannot leave a thread without one, and neither may an
  // Undo. Taking one away would be right only for a thread that had none before Talk wrote it, and
  // nothing an Undo carries can show that: it is sent back by the page, so a forged one copies the
  // pocket's id and text exactly as a real one would. So it is refused for every thread, and
  // `undoFor` offers no Undo it would refuse.
  if (a.slot === 'facts') return { ok: false, said,
    why: `a thread keeps its Always true, so Undo does not take ${t.title}'s away. Change it by hand if you mean to` };
  if (a.body.trim() !== text.trim()) return { ...changed, why: `${t.title}'s ${roomLabel(a.slot)} has changed since Talk made it` };
  return { ok: true, change: { op: 'room.unmake', thread: t.id, title: t.title, addon: a.id, room: a.slot } };
}

/** What a change did, in the writer's words: one line in the conversation. */
export function wordsFor(c: Change): string {
  if (c.op === 'thread.rename') {
    const n = (k: string) => c.places.filter((p) => p.kind === k).length;
    const parts = [n('passage') && `${n('passage')} passage${n('passage') === 1 ? '' : 's'}`,
      n('pocket') && `${n('pocket')} pocket${n('pocket') === 1 ? '' : 's'}`, ...c.places.filter((p) => p.kind === 'tale').map((p) => `the ${p.id}`)].filter(Boolean);
    const where = parts.length ? `: ${parts.join(', ')}` : '';
    return c.undo ? `Put back the name ${c.to}${where}.${c.skipped?.length ? ` Left as they are, changed since: ${c.skipped.join('; ')}.` : ''}`
      : `Renamed ${c.title} to ${c.to}${where}.`;
  }
  if (c.op === 'passage.set') return c.undo ? `Put back passage ${c.n} of scene ${c.scene}.`
    : `Rewrote passage ${c.n} of scene ${c.scene} (${clip(c.note)}): \u201c${clip(c.text)}\u201d`;
  if (c.op === 'thread.new') return `Made a new thread: ${c.title}, ${an(c.type)}.`;
  if (c.op === 'thread.unmake') return `Took away ${c.title}.`;
  if (c.op === 'room.unmake') return `Took away ${c.title}'s ${roomLabel(c.room)}.`;
  if (c.op === 'state.unmake') return `Took away ${c.title}'s Timeline from scene ${c.from}.`;
  if (c.op === 'thread.retire') return `Retired ${c.title} from scene ${c.from}. It is kept, and can be brought back.`;
  if (c.op === 'retire.unmake') return `Brought back ${c.title}.`;
  if (c.op === 'takeover.unmake') return `Gave ${c.title} back to its World: this tale reads the World's version again.`;
  if (c.op === 'thread.overtime') return c.undo ? `Put back ${c.title}'s Timeline from scene ${c.from}.`
    : `${c.state ? 'Changed' : 'Added to'} ${c.title}'s Timeline from scene ${c.from}: “${clip(c.text)}”`;
  if (c.op === 'tale.set') return c.undo ? `Put back the tale's ${c.field.replace(/_/g, ' ')}.`
    : `Changed the tale's ${c.field.replace(/_/g, ' ')}: “${clip(c.text)}”`;
  if (c.op === 'thread.wake') return c.undo ? `Put back how ${c.title} wakes: ${wakeWords(c.activation, c.keys)}.`
    : c.activation === 'triggered' ? `${c.title} is On a word now: ${c.keys.join(', ')}.` : `${c.title} is Always on now.`;
  if (c.op === 'scene.set') return c.field === 'title'
    ? c.undo ? `Put back scene ${c.index}'s title.` : `Changed scene ${c.index}'s title: “${clip(c.text)}”`
    : c.undo ? `Put back where scene ${c.index} heads.` : `Changed where scene ${c.index} heads: “${clip(c.text)}”`;
  if (c.op === 'string.stand') {
    const s = `the ${stringLabel(c.kind)} ${c.name}`;
    if (c.undo) return `Put back where ${s} stood: ${standWords[c.stand]}.`;
    if (c.stand === 'in_play') return c.was === 'tied_off' || c.was === 'let_go' ? `Reopened ${s}: it is in play.` : `Put ${s} in play.`;
    return c.stand === 'set_aside' ? `Set ${s} aside.` : c.stand === 'tied_off' ? `Tied off ${s}.` : `Let go of ${s}.`;
  }
  if (c.op === 'rule.set' || c.op === 'instruction.set') {
    const o = OWN_OF[ownSlot(c.op) as 'rule' | 'instruction'];
    if (c.undo) return `Put back ${o.the} ${c.name}.`;
    if (!c.before) return `Added ${an(o.label)} to the tale, on: ${c.name}${c.keys.length ? `, on a word: ${c.keys.join(', ')}` : ''}.`;
    // In thread.wake's words, so a rule and a thread say the same thing about waking.
    const words = sameKeys(c.keys, c.before.keys) ? '' : c.keys.length ? ` ${c.name} is On a word now: ${c.keys.join(', ')}.`
      : ` ${c.name} is Always on now.`;
    return c.text.trim() === c.before.text.trim() ? words.trim() : `Changed ${o.the} ${c.name}: “${clip(c.text)}”${words}`;
  }
  if (c.op === 'rule.switch' || c.op === 'instruction.switch') {
    const o = OWN_OF[ownSlot(c.op) as 'rule' | 'instruction'];
    return c.undo ? `Put back ${o.the} ${c.name}: ${c.on ? 'on' : 'off'}.` : `Switched ${o.the} ${c.name} ${c.on ? 'on' : 'off'}.`;
  }
  if (c.op === 'pocket.unmake') return `Took away ${OWN_OF[c.slot as 'rule' | 'instruction'].the} ${c.name}.`;
  if (c.op === 'string.set' && c.wasKind) return `Made ${c.name} ${an(roomLabel(c.kind))}${
    c.text.trim() === (c.before ?? '').trim() ? '.' : `: “${clip(c.text)}”`}`;
  if (c.op === 'string.set') return c.addon ? `Changed the ${roomLabel(c.kind)} ${c.name}: “${clip(c.text)}”`
    : `Added ${an(roomLabel(c.kind))} to the tale, in play: ${c.name}.`;
  if (c.undo && STRING_SLOTS.includes(c.room)) return `Put back the ${roomLabel(c.room)} ${c.name}.`;
  if (c.undo) return `Put back ${c.title}'s ${roomLabel(c.room)}${c.off ? ', Off' : ''}.`;
  return `Changed ${c.title}'s ${roomLabel(c.room)}: “${clip(c.text)}”${c.wake ? ' It was Off; switched it on.' : ''}`;
}

/** #151 · WHICH CARD A CHANGE IS DRAWN ON (ADR 0014): one card per thread, so `key` is the thread for
 *  every change to one, and the tale, a scene, the strings, the rules and the writer's instructions
 *  each have a card of their own. `label` is the change's row on that card. */
export type Card = { key: string; title: string; label: string };
export function cardOf(c: Change, made: { thread?: string }): Card {
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (c.op === 'thread.new') return { key: made.thread ?? c.title, title: c.title, label: 'The thread' };
  if (c.op === 'thread.set') return STRING_SLOTS.includes(c.room)
    ? { key: 'strings', title: 'Strings', label: c.name }
    : { key: c.thread, title: c.title, label: cap(roomLabel(c.room)) };
  if (c.op === 'thread.wake') return { key: c.thread, title: c.title, label: 'How it wakes' };
  if (c.op === 'thread.overtime') return { key: c.thread, title: c.title, label: 'Timeline' };
  if (c.op === 'thread.retire') return { key: c.thread, title: c.title, label: 'Retired' };
  if (c.op === 'tale.set') return { key: 'tale', title: 'The tale', label: cap(c.field.replace(/_/g, ' ')) };
  if (c.op === 'thread.rename') return { key: c.thread, title: c.to, label: 'Renamed' };
  if (c.op === 'passage.set') return { key: `passage:${c.passage}`, title: `Scene ${c.scene}, passage ${c.n}`, label: 'The prose' };
  if (c.op === 'scene.set') return { key: `scene:${c.chapter}`, title: `Scene ${c.index}`, label: c.field === 'title' ? 'Title' : 'Heads toward' };
  if (c.op === 'string.set' || c.op === 'string.stand') return { key: 'strings', title: 'Strings', label: c.name };
  if (c.op === 'rule.set' || c.op === 'rule.switch') return { key: 'rules', title: 'Rules', label: c.name };
  if (c.op === 'instruction.set' || c.op === 'instruction.switch') return { key: 'instructions', title: 'Your instructions', label: c.name };
  return { key: 'other', title: 'Changed', label: '' };
}

/** #122 · WHAT A CHANGE LINE SHOWS AS A DIFF: the text the change replaced and the text it wrote,
 *  for the changes that rewrite text; null for the rest (a new thread has no before, a retirement
 *  rewrites nothing) and for an Undo, whose `before` is the text being put back. A pocket or an Over
 *  time entry it made had nothing before it, which reads as an empty side. */
export function textsOf(c: Change): { before: string; after: string } | null {
  if ((c as any).undo) return null;
  // A string made the other kind and nothing else rewrote no text.
  if (c.op === 'string.set' && c.wasKind && c.text.trim() === (c.before ?? '').trim()) return null;
  if (c.op === 'thread.set' || c.op === 'tale.set' || c.op === 'scene.set' || c.op === 'string.set' || c.op === 'passage.set')
    return { before: c.before ?? '', after: c.text };
  if (c.op === 'thread.rename') return { before: c.title, after: c.to };
  if (c.op === 'thread.overtime') return { before: c.before?.body ?? '', after: c.text };
  // A rule's words changed and not its text: the diff is of the words, as a thread's wake is.
  if (c.op === 'rule.set' || c.op === 'instruction.set') return c.before && c.text.trim() === c.before.text.trim()
    ? { before: wakeWords(c.before.keys.length ? 'triggered' : 'always_on', c.before.keys),
        after: wakeWords(c.keys.length ? 'triggered' : 'always_on', c.keys) }
    : { before: c.before?.text ?? '', after: c.text };
  if (c.op === 'thread.wake') return { before: wakeWords(c.before.activation, c.before.keys), after: wakeWords(c.activation, c.keys) };
  return null;
}

/** What was asked, in words, for a change that is refused before it means anything. */
function saidOf(raw: any): string {
  const name = String(raw?.thread ?? raw?.title ?? '').trim();
  if (raw?.op === 'thread.new') return `Make a new thread${name ? `: ${name}` : ''}`;
  if (raw?.op === 'scene.set') return `Change scene ${raw?.scene ?? 'this one'}`;
  if (raw?.op === 'string.set') return `Add or change the string ${name || 'with no name'}`;
  if (raw?.op === 'string.stand') return `Change where the string ${name || 'with no name'} stands`;
  if (raw?.op === 'rule.set') return `Add or change the rule ${name || 'with no name'}`;
  if (raw?.op === 'instruction.set') return `Add or change your instruction ${name || 'with no name'}`;
  if (raw?.op === 'rule.switch' || raw?.op === 'instruction.switch')
    return `Switch the ${raw.op === 'rule.switch' ? 'rule' : 'instruction'} ${name || 'with no name'} ${raw?.on ? 'on' : 'off'}`;
  if (raw?.op === 'thread.wake') return `Change how ${name || 'a thread'} wakes`;
  if (raw?.op === 'thread.retire') return `Retire ${name || 'a thread'}`;
  if (raw?.op === 'thread.overtime') return `Add to ${name || 'a thread'}'s Timeline${raw?.scene ? ` from scene ${raw.scene}` : ''}`;
  if (raw?.op === 'tale.set') return `Change the tale's ${String(raw?.field ?? '').trim().replace(/_/g, ' ') || 'own fields'}`;
  if (raw?.op === 'thread.set') return `Change ${name || 'a thread'}${raw?.room && roomOf(raw.room) !== 'facts'
    ? `'s ${roomLabel(roomOf(raw.room))}` : ''}`;
  return `${String(raw?.op ?? 'something') || 'something'}${name ? ` on ${name}` : ''}`;
}

/* #101 · TALK IN A TALE THAT FOLLOWS A WORLD (ADR 0006). The World holds the IP's canon for every
 * tale that follows it; the tale outranks it with its own thread of the same name. So a change the
 * writer asks for has two homes, and the model says which in `to`:
 *
 *   - `world`: the IP's canon. It goes to the World's thread, and every tale that follows it has it.
 *   - `tale`: the writer's own version. It goes to the tale's thread; a thread the tale only follows
 *     is taken over first (the tale gets its own copy, the World's is untouched), the same take-over
 *     the thread's own press makes.
 *   - neither: not clear. Nothing is guessed. The route applies nothing in that answer and asks in
 *     one line (`askWhich`).
 *
 * Only the threads the World has anything to do with are asked about: a thread the World has no
 * thread of the same name for, the premise and setting, and a scene are the tale's, whatever `to`
 * says. Over time and retiring are dated by a tale's scenes, and a World has none, so canon cannot
 * take them. `world` is the followed World only when the writer owns it (the route decides that):
 * with none, every change is the tale's, and the tale's own rule refuses a thread it only follows. */
export type World = { id: string; title: string; entries: Thread[] };
export type Aim = { to: 'tale' | 'world'; raw: any } | { to: 'takeover'; raw: any; origin: string }
  | { ask: string } | { refused: { said: string; why: string } };
export function aimOf(raw: any, tale: Tale, world: World | null): Aim {
  const op = String(raw?.op ?? '');
  const to = raw?.to === 'world' || raw?.to === 'tale' ? raw.to : null;
  if (!world || !op.startsWith('thread.')) return { to: 'tale', raw };
  if (op === 'thread.new') {
    const title = String(raw.title ?? raw.thread ?? '').trim();
    return to ? { to, raw } : { ask: title || 'the new thread' };
  }
  const { hit } = threadNamed(tale, raw.thread);
  if (!hit) return { to: 'tale', raw };
  // The World's thread this one is: the one it reads through, the one it was taken over from, or
  // one of the same name the tale wrote its own version of.
  const canon = world.entries.find((e) => e.id === (hit.sharedFrom ? hit.id : hit.originId))
    ?? world.entries.find((e) => norm(e.title) === norm(hit.title));
  if (!canon) return to === 'world' ? { refused: { said: saidOf(raw),
    why: `${world.title} has no thread called ${hit.title}; it is this tale's own` } } : { to: 'tale', raw };
  if (!to) return { ask: hit.title };
  if (to === 'world') {
    if (op === 'thread.overtime' || op === 'thread.retire') return { refused: { said: saidOf(raw),
      why: `a World has no scenes, so ${hit.title}'s Timeline and retiring are this tale's. Say it is your version` } };
    return { to, raw: { ...raw, thread: canon.title } };
  }
  return hit.sharedFrom ? { to: 'takeover', raw: { ...raw, thread: hit.title }, origin: hit.id } : { to, raw };
}

/** THE ONE LINE THAT ASKS, for every change in an answer the model did not place. */
export const askWhich = (names: string[], world: string) => {
  const who = [...new Set(names)];
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0];
  return `Nothing is changed yet: is that ${list} as ${world} has it, for every tale that follows it, or your own version, for this tale only?`;
};

/** EVERYTHING OF A THREAD A WRITER CAN CHANGE, as one string, so a take-over's Undo can tell whether
 *  the copy is still as Talk left it. Ids are left out: they are not the writer's. */
export function fingerprint(t: Thread): string {
  const sorted = (xs: string[]) => [...xs].sort();
  return JSON.stringify([t.title, t.entryType, t.activation ?? '', sorted(t.keys ?? []),
    sorted((t.addons ?? []).map((a) => JSON.stringify([a.slot, a.name, a.body, a.active, sorted(a.keys ?? [])]))),
    sorted((t.states ?? []).map((s) => JSON.stringify([s.fromChapter, s.body, s.label ?? null]))),
    sorted((t.events ?? []).map((e) => JSON.stringify([e.kind, e.fromChapter])))]);
}

/* #100 · THE DRAFT, WHILE A NEW TALE IS SET UP. The same rule, asked means done, on a tale that
 * does not exist yet: the wizard's draft, which the page holds and sends. Nothing here is written
 * anywhere; a checked change goes back to the page, which applies it to its own draft and holds
 * the Undo. So the list is the draft's own, and it is short:
 *
 *   - tale.set: the draft's title, premise, genre, setting or voice. Not the setting's scene: there
 *     are no scenes yet. And (#101) its World: the story or game it is set in, the box on the
 *     tale's own step. Setting it hands over to the World step, which the page runs on that box
 *     (`ipFollow`): it follows the writer's World of that name or looks the IP up. The route holds
 *     back the threads the same answer would have made or offered, because that step is the one
 *     way an IP's people are made.
 *   - thread.new, thread.set: as on a tale, against the draft's threads and their rooms.
 *   - thread.remove: removing a draft thread is allowed here, where a tale only retires one,
 *     because nothing has been saved: the thread is the page's, the press is one Undo away, and
 *     Discard throws the whole draft away anyway. The thread the writer plays stays while they play
 *     it, the rule the preview's own remove follows.
 *
 * A draft thread's Always true is its `body`, a plain description as the cast writes it (#110; POST
 * /api/stories moves it into `facts` at Start); its other rooms are `rooms[slot]`. */
const DRAFT_OPS = ['tale.set', 'thread.new', 'thread.set', 'thread.remove'] as const;
const DRAFT_FIELDS = ['title', 'premise', 'genre', 'setting', 'voice', 'world'] as const;
/** The draft's own name for each field: the voice is `writingStyle` in the wizard and the column.
 *  The one copy: `checkDraft` hands the key back with the change, and the route and the page both
 *  write to it. */
const DRAFT_KEY: Record<string, string> = { title: 'title', premise: 'premise', genre: 'genre', setting: 'setting',
  voice: 'writingStyle', world: 'world' };

/** The schema fragment the setup Talk's answer carries. Flat, as `CHANGES_SCHEMA` is, for the same
 *  reason. */
export const DRAFT_CHANGES_SCHEMA = {
  // Ten, not four (2026-10-30): "fill in the tale" sets five boxes and the threads in one answer.
  type: 'array', maxItems: 10,
  items: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: [...DRAFT_OPS] },
      // tale.set: which of the draft's fields.
      field: { type: 'string', enum: [...DRAFT_FIELDS] },
      // thread.set, thread.remove: the thread by its name.
      thread: { type: 'string', maxLength: 80 },
      // thread.set: the room, or `none` for its Always true.
      room: { type: 'string', enum: ['none', ...ALL_SLOTS] },
      // thread.new only. Before `text`, for CHANGES_SCHEMA's reason: the grammar keeps this order.
      title: { type: 'string', maxLength: 80 },
      type: { type: 'string', enum: [...KINDS] },
      // tale.set and thread.set: the whole new text. thread.new: its Always true.
      // No maxLength, per F25 (#144): the converter closes a capped string mid-word.
      text: { type: 'string' },
      // The search results this change was made from, by their numbers (#99).
      sources: { type: 'array', maxItems: 3, items: { type: 'integer', minimum: 1 } },
    },
    required: ['op'],
  },
} as const;

type DraftThread = { title: string; entryType?: string; body?: string; keys?: string[];
  rooms?: Record<string, { name?: string; body?: string; on?: boolean }>; keep?: boolean; notes?: string };
export type Draft = { story?: Record<string, any>; entries?: DraftThread[] };
export type DraftChange =
  /** `key` is where the draft keeps the field; `before` is its text before the change, for the
   *  page's Undo. */
  | { op: 'tale.set'; field: string; key: string; text: string; before: string }
  /** The thread as it goes into the draft, in the shape the cast writes one. */
  | { op: 'thread.new'; thread: { title: string; entryType: string; activation: string; body: string; keys: string[] } }
  /** `room` is `facts` for its Always true; `before` is that room's text, null when there was none.
   *  `body`, on Always true only, is the thread's whole body as the draft stores it: the plain text. */
  | { op: 'thread.set'; title: string; room: string; text: string; before: string | null; body?: string }
  | { op: 'thread.remove'; title: string };
export type DraftChecked = { ok: true; change: DraftChange } | { ok: false; said: string; why: string };

/** The draft's threads as `threadNamed` reads a tale's: the ones the writer kept, with a kind. An
 *  unticked thread is not in the draft, so a request cannot reach it. */
const draftTale = (d: Draft): Tale => ({ entries: (d.entries ?? []).filter((e) => e && e.keep !== false
  && String(e.title ?? '').trim()).map((e) => ({ id: e.title, title: String(e.title).trim(),
  entryType: String(e.entryType ?? 'character') })) });
/** #110 · A THREAD'S ALWAYS TRUE AS IT IS STORED: the plain description, without the `[Name: text]`
 *  wrapper or the name a model put in front of it, by the rule `db.upsertAddon` stores it by. The
 *  draft keeps it in that form too, so the writer sees only the description. */
const alwaysOf = (title: unknown, body: unknown) => plain(body, wrapperNames('facts', String(title ?? '').trim()));

/** One change the model returned during setup, checked against the draft the page sent. */
export function checkDraft(raw: any, draft: Draft): DraftChecked {
  if (raw && typeof raw.text === 'string') raw = { ...raw, text: raw.text.replace(LINK, '').trim() };
  const op = String(raw?.op ?? '');
  const said = op === 'thread.remove' ? `Remove ${String(raw?.thread ?? '').trim() || 'a thread'}`
    : op === 'tale.set' ? `Change the ${String(raw?.field ?? '').trim() || 'draft'}` : saidOf(raw);
  if (!(DRAFT_OPS as readonly string[]).includes(op)) return { ok: false, said,
    why: 'that is not something Talk can do while a tale is set up. It changes the draft\'s title, premise, '
      + 'genre, setting, voice and World, and its threads; there are no scenes or prose yet' };
  const st = draft.story ?? {};
  const text = String(raw.text ?? '').trim();
  if (op === 'tale.set') {
    const field = String(raw.field ?? '').trim().toLowerCase();
    if (!(DRAFT_FIELDS as readonly string[]).includes(field)) return { ok: false, said,
      why: `Talk changes the title, premise, genre, setting, voice or World, not the ${field || 'nothing'}` };
    const key = DRAFT_KEY[field];
    const before = String(st[key] ?? '');
    if (!text) return { ok: false, said, why: 'it came with no text' };
    if (before.trim() === text) return { ok: false, said, why: `the ${field} already says that` };
    return { ok: true, change: { op: 'tale.set', field, key, text, before } };
  }
  const tale = draftTale(draft);
  if (op === 'thread.new') {
    const n = newThread(raw, tale);
    if ('why' in n) return { ok: false, said, why: n.why };
    const { title, type } = n;
    // ALWAYS ON, keyed by its name, the way every thread the cast writes arrives: the preview tells
    // the writer a spark cast is always on, and a draft thread on a word the model chose would be the
    // one exception they were not told about.
    return { ok: true, change: { op: 'thread.new', thread: { title, entryType: type, activation: 'always_on',
      body: alwaysOf(title, text), keys: [title] } } };
  }
  const { hit, why } = threadNamed(tale, raw.thread);
  if (!hit) return { ok: false, said, why: why!.replace('in this tale', 'in the draft') };
  const t = (draft.entries ?? []).find((e) => e.keep !== false && String(e.title ?? '').trim() === hit.title)!;
  if (op === 'thread.remove') {
    const plays = String(st.persona ?? '').trim();
    if (plays && norm(plays) === norm(hit.title)) return { ok: false, said,
      why: `you play ${hit.title}, so their thread stays while you play them` };
    return { ok: true, change: { op: 'thread.remove', title: hit.title } };
  }
  const slot = roomOf(raw.room);
  if (!hasRoom(hit, slot)) return { ok: false, said, why: noRoom(hit, slot) };
  // An Always true is compared and shown without the name a model may have put in front of it, and
  // written as the draft stores it, so the page writes the very text checked here.
  const asked = slot === 'facts' ? alwaysOf(hit.title, text)
    : plain(text, wrapperNames(slot, hit.title, String(t.rooms?.[slot]?.name ?? slot)));
  if (!asked) return { ok: false, said, why: 'it came with no text' };
  const before = slot === 'facts' ? alwaysOf(t.title, t.body) || null : String(t.rooms?.[slot]?.body ?? '') || null;
  if ((before ?? '').trim() === asked) return { ok: false, said, why: `${hit.title}'s ${roomLabel(slot)} already says that` };
  return { ok: true, change: { op: 'thread.set', title: hit.title, room: slot, text: asked, before,
    ...(slot === 'facts' ? { body: asked } : {}) } };
}

/** What a draft change did, in the writer's words: one line in the conversation. */
export function draftWords(c: DraftChange): string {
  if (c.op === 'tale.set') return c.field === 'world' ? `Set in ${c.text}. Its World comes from your Worlds, or is looked up on The threads.`
    : `Changed the ${c.field}: “${clip(c.text)}”`;
  if (c.op === 'thread.new') return `Added a thread: ${c.thread.title}, ${an(c.thread.entryType)}.`;
  if (c.op === 'thread.remove') return `Removed ${c.title} from the draft.`;
  return `Changed ${c.title}'s ${roomLabel(c.room)}: “${clip(c.text)}”`;
}

/** THE CHANGE THAT PUTS THIS ONE BACK, built once it is applied: `made` holds the ids the write
 *  minted, which nothing knows before it. Returned with the change, and sent back by the Undo. */
export function undoFor(c: Change, made: { thread?: string; addon?: string; state?: string; event?: string }) {
  if (c.op === 'passage.set') return { op: 'passage.set', passage: c.passage, text: c.before, wrote: c.text, author: c.author };
  if (c.op === 'thread.rename') return { op: 'thread.rename', thread: c.thread, title: c.to, to: c.title, keys: c.keysBefore,
    wroteKeys: c.keys, places: c.places.map((p) => ({ ...p, before: p.after, after: p.before,
      ...(p.nameBefore != null ? { name: p.nameBefore, nameBefore: p.name } : {}) })) };
  if (c.op === 'thread.new') return { op: 'thread.unmake', thread: made.thread, title: c.title, text: c.always };
  if (c.op === 'thread.retire') return { op: 'retire.unmake', thread: c.thread, event: made.event };
  if (c.op === 'thread.overtime') return c.before
    ? { op: 'thread.overtime', thread: c.thread, state: c.state, scene: c.from, text: c.before.body,
        label: c.before.label, beforeMode: c.before.beforeMode, wrote: { body: c.text, label: c.label } }
    : { op: 'state.unmake', thread: c.thread, state: made.state, text: c.text };
  // `wrote` on each of these is what Talk left there, which the Undo checks is still there.
  if (c.op === 'tale.set') return { op: 'tale.set', field: c.field, text: c.before, wrote: c.text };
  if (c.op === 'string.stand') return { op: 'string.stand', addon: c.addon, stand: c.was, wrote: c.stand };
  // A rule or instruction Talk added is taken away; one it changed gets its text and words back.
  if (c.op === 'rule.set' || c.op === 'instruction.set') return c.before
    ? { op: c.op, addon: c.addon, text: c.before.text, keys: c.before.keys, wrote: { text: c.text, keys: c.keys } }
    : { op: 'pocket.unmake', slot: ownSlot(c.op), addon: made.addon, text: c.text };
  if (c.op === 'rule.switch' || c.op === 'instruction.switch') return { op: c.op, addon: c.addon, on: !c.on, wrote: c.on };
  if (c.op === 'scene.set') return { op: 'scene.set', chapter: c.chapter, field: c.field, text: c.before, wrote: c.text };
  if (c.op === 'thread.wake') return { op: 'thread.wake', thread: c.thread, ...c.before,
    wrote: { activation: c.activation, keys: c.keys } };
  // #128 · A string Talk added is taken away; one it changed is put back, as a pocket of the tale's thread.
  // One made the other kind is put back as the kind it was, while it is still the kind Talk left (`wroteKind`).
  if (c.op === 'string.set') return c.addon
    ? { op: 'thread.set', thread: c.thread, room: c.wasKind ?? c.kind, addon: c.addon, text: c.before, wrote: c.text,
        ...(c.wasKind ? { wroteKind: c.kind } : {}) }
    : { op: 'room.unmake', thread: made.thread, addon: made.addon, text: c.text };
  if (c.op !== 'thread.set') return null;
  // The first Always true on a thread that had none gets no Undo: `checkUndo` never takes one away.
  if (c.before == null) return c.room === 'facts' ? null
    : { op: 'room.unmake', thread: c.thread, addon: made.addon, text: c.text };
  return { op: 'thread.set', thread: c.thread, room: c.room, addon: c.addon, text: c.before, wrote: c.text,
    ...(c.wake ? { off: true } : {}) };
}

