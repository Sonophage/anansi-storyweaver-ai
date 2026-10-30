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
 * a retirement Talk made. Neither list touches prose. The unmake operations are refused from the
 * model by name.
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
import { ALL_SLOTS, KINDS, STRING_SLOTS, slotsFor, plain, wrapperNames } from './slots.ts';
import { retiredAt } from './context.ts';

/** What the model may ask for. #97 cut the path with the first two; #98 adds the rest; #128 adds a
 *  string, a pocket of the tale's own thread (ADR 0011), which no other operation reaches. */
export const ASKED = ['thread.new', 'thread.set', 'thread.overtime', 'thread.wake', 'thread.retire',
  'tale.set', 'scene.set', 'string.set'] as const;
/** What only an Undo may do, beside putting back old text. */
export const UNMAKE = ['thread.unmake', 'room.unmake', 'state.unmake', 'retire.unmake', 'takeover.unmake'] as const;
/** What an Undo may put back as it was: the asked operations that write over a value, by id. */
const PUT_BACK = ['thread.set', 'thread.overtime', 'thread.wake', 'tale.set', 'scene.set'] as const;

/** THE TALE'S OWN FIELDS TALK MAY CHANGE: its premise and setting, the story's own columns.
 *  ponytail: Talk cannot add or change a rule. Rules were threads, reached by the thread operations,
 *  until 2026-10-29 (ADR 0005); they are pockets of the tale now and no operation reaches them. Add
 *  a `rule.set` beside `string.set` when a writer asks Talk for a rule and it cannot do it. */
const TALE_FIELDS = ['premise', 'setting'] as const;
/** A SCENE'S FIELDS TALK MAY CHANGE: its title and Heads toward (`authors_note` in the column). Opens
 *  with is not on it: the ticket names these two, and an opening is the writer's first beat. */
const SCENE_FIELDS = ['title', 'heads_toward'] as const;

/** The schema fragment Talk's answer carries. Flat, one object per change: the grammar cannot say
 *  "these fields for this operation", and the checks below are what enforce that. */
export const CHANGES_SCHEMA = {
  type: 'array', maxItems: 4,
  items: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: [...ASKED] },
      // thread.set: the thread by its name, as the writer and the model know it.
      thread: { type: 'string', maxLength: 80 },
      // thread.set: the room, or `none` for its Always true.
      room: { type: 'string', enum: ['none', ...ALL_SLOTS] },
      // thread.set: the new text of that room. thread.new: its Always true. thread.overtime: the
      // whole of where the thread stands from that scene on. tale.set, scene.set: the field's text.
      text: { type: 'string', maxLength: 600 },
      // thread.overtime: what changed, in a few words.
      label: { type: 'string', maxLength: 60 },
      // thread.new, and string.set: the string's name.
      title: { type: 'string', maxLength: 80 },
      type: { type: 'string', enum: [...KINDS] },
      // string.set: a promise or an open question. Left out on a string the tale has, it keeps its own.
      kind: { type: 'string', enum: [...STRING_SLOTS] },
      // thread.new, and thread.wake: Always on or On a word, and the wake words.
      keys: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 40 } },
      activation: { type: 'string', enum: ['always_on', 'triggered'] },
      // tale.set: which of the tale's own fields. scene.set: which of the scene's.
      field: { type: 'string', enum: [...TALE_FIELDS, ...SCENE_FIELDS] },
      // scene.set: the scene by its number. thread.overtime: the scene it holds from. None is the
      // scene the writer is in. thread.retire: the scene it is retired from; none is the next one.
      scene: { type: 'integer', minimum: 1 },
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

type Room = { id: string; slot: string; name: string; body: string; keys: string[]; active: boolean };
type Thread = { id: string; title: string; entryType: string; addons?: Room[]; sharedFrom?: string | null;
  originId?: string | null;
  activation?: string; keys?: string[]; states?: State[];
  events?: { id: string; kind: string; fromChapter: number }[]; retiredAtChapter?: number | null };
type State = { id: string; fromChapter: number; body: string; label?: string | null; beforeMode?: string | null };
type Scene = { id: string; index: number; title?: string | null; authorsNote?: string | null };
/** The tale as the route read it through the gate: its threads, and since #98 its own fields, its
 *  scenes and the scene the writer is in. The later three are optional so a check that needs only
 *  threads can be handed only threads. */
export type Tale = { entries: Thread[]; story?: { premise?: string | null; setting?: string | null };
  chapters?: Scene[]; at?: number;
  /** #128 · The tale's own thread, whose pockets are its strings; null until it is first needed. */
  taleThread?: Thread | null };

export type Change =
  | { op: 'thread.new'; title: string; type: string; always: string; keys: string[]; activation: string }
  /** `addon` is the room it writes over, null for one it makes; `before` is that room's text, null
   *  when there was none. On an Undo, `before` is the text being put back. */
  | { op: 'thread.set'; thread: string; title: string; room: string; addon: string | null;
      name: string; keys: string[]; text: string; before: string | null; undo?: true }
  | { op: 'thread.unmake'; thread: string; title: string }
  | { op: 'room.unmake'; thread: string; title: string; addon: string; room: string }
  /** `before` is the field's text before the change; on an Undo, the text being put back. */
  | { op: 'tale.set'; field: string; text: string; before: string; undo?: true }
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
      from: number | null; text: string; before: string | null; wasKind?: string };
export type Checked = { ok: true; change: Change } | { ok: false; said: string; why: string };

const NOT_TALK = 'that is not something Talk can do. It changes the tale, its threads and its scenes; '
  + 'it does not delete anything or touch prose.';

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
const roomFor = (t: Thread, slot: string) => {
  const have = (t.addons ?? []).filter((a) => a.slot === slot);
  return have.find((a) => a.active) ?? have.at(-1) ?? null;
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
  if (!(ASKED as readonly string[]).includes(op)) return { ok: false, said, why: NOT_TALK };
  if (op === 'thread.new') {
    const n = newThread(raw, tale);
    if ('why' in n) return { ok: false, said, why: n.why };
    const { title, type } = n;
    const keys = keysOf(raw.keys);
    // A CHARACTER NEVER LANDS ON A WORD FROM A MODEL'S ANSWER, the rule accepting a chalked thread
    // follows: a character who stops reaching the model does not fade, he vanishes. Anything else
    // waits for its word only when it has one; `upsertEntry` holds the same floor.
    const activation = type !== 'character' && raw.activation === 'triggered' && keys.length ? 'triggered' : 'always_on';
    return { ok: true, change: { op, title, type, always: alwaysOf(title, raw.text), keys, activation } };
  }
  if (op === 'tale.set') return taleSet(tale, raw, said, false);
  if (op === 'scene.set') return sceneSet(tale, raw, said, false);
  if (op === 'string.set') return stringSet(tale, raw, said);
  const { hit, why } = threadNamed(tale, raw.thread);
  if (!hit) return { ok: false, said, why: why! };
  if (op === 'thread.wake') return wakeOn(hit, raw, said, false);
  if (op === 'thread.overtime') return overtimeOn(tale, hit, raw, said, false);
  if (op === 'thread.retire') return retireOn(tale, hit, raw, said);
  return setOn(hit, roomOf(raw.room), String(raw.text ?? '').trim(), said, false);
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
    if (!st) return { ok: false, said, why: 'that Over time entry is no longer in this tale' };
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
  if (sc.index === 1) return { ok: false, said, why: `Over time starts at scene 2. What holds from scene 1 is `
    + `${t.title}'s own text` };
  if (!text) return { ok: false, said, why: 'it came with no text' };
  const at = (t.states ?? []).find((s) => s.fromChapter === sc.index) ?? null;
  if (at && at.body.trim() === text) return { ok: false, said,
    why: `${t.title}'s Over time from scene ${sc.index} already says that` };
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
const stillWrote = (wrote: unknown, now: unknown) => typeof wrote === 'string' && String(now ?? '').trim() === wrote.trim();

/** #98 · THE TALE'S PREMISE OR SETTING. Shared by a request and an Undo; an Undo may put back an
 *  empty field, because that is what was there. */
function taleSet(tale: Tale, raw: any, said: string, undo: boolean): Checked {
  const field = String(raw?.field ?? '').trim().toLowerCase();
  if (!(TALE_FIELDS as readonly string[]).includes(field)) return { ok: false, said,
    why: `Talk changes the tale's premise or its setting, not its ${field || 'nothing'}` };
  const text = String(raw.text ?? '').trim();
  const before = String((tale.story as any)?.[field] ?? '');
  if (undo && !stillWrote(raw.wrote, before)) return { ok: false, said, why: SINCE };
  if (!undo && !text) return { ok: false, said, why: 'it came with no text' };
  if (!undo && before.trim() === text) return { ok: false, said, why: `the tale's ${field} already says that` };
  return { ok: true, change: { op: 'tale.set', field, text, before: undo ? text : before,
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
  return { ok: true, change: { op: 'thread.set', thread: t.id, title: t.title, room: slot,
    addon: cur?.id ?? null, name, keys: cur?.keys ?? [],
    text, before: undo ? text : cur ? cur.body : null, ...(undo ? { undo: true as const } : {}) } };
}

/** One Undo, checked against the tale. By id, never by name: it names what was changed. */
export function checkUndo(raw: any, tale: Tale): Checked {
  const op = String(raw?.op ?? '');
  const said = 'Undo';
  if (!(PUT_BACK as readonly string[]).includes(op) && !(UNMAKE as readonly string[]).includes(op))
    return { ok: false, said, why: 'that is not something Undo can do' };
  if (op === 'tale.set') return taleSet(tale, raw, said, true);
  if (op === 'scene.set') return sceneSet(tale, raw, said, true);
  // #128 · THE TALE'S OWN THREAD only for one of its strings: a string put back, or one Talk added
  // taken away. Never its Always true, never the thread itself, which Talk did not make.
  const own = tale.taleThread && tale.taleThread.id === String(raw.thread ?? '') ? tale.taleThread : null;
  const aString = !!own && (op === 'thread.set' ? STRING_SLOTS.includes(roomOf(raw.room))
    : op === 'room.unmake' && (own.addons ?? []).some((a) => a.id === String(raw.addon ?? '') && STRING_SLOTS.includes(a.slot)));
  const t = tale.entries.find((e) => e.id === String(raw.thread ?? '')) ?? (aString ? own! : undefined);
  if (!t) return { ok: false, said, why: 'that thread is no longer in this tale' };
  const text = String(raw.text ?? '');
  if (op === 'thread.set') return setOn(t, roomOf(raw.room), text, said, true, raw.addon ?? null, raw.wrote, raw.wroteKind);
  if (op === 'thread.wake') return wakeOn(t, raw, said, true);
  if (op === 'thread.overtime') return overtimeOn(tale, t, raw, said, true);
  // TAKEN AWAY ONLY WHILE IT IS AS TALK MADE IT. The text it was made with rides in the Undo and is
  // compared with what is there now: a thread or room the writer has changed since is theirs, and
  // an Undo that claims Talk made a thread the writer wrote does not match its text.
  const changed = { ok: false as const, said, why: `${t.title} has changed since Talk made it. Delete it by hand if you mean to` };
  if (op === 'thread.unmake') {
    if (t.sharedFrom || norm(t.title) !== norm(raw.title)) return changed;
    const always = (t.addons ?? []).find((a) => a.slot === 'facts')?.body ?? '';
    // An Over time entry made since is a change too (#98): taking the thread away would take it.
    if (always.trim() !== text.trim() || (t.addons ?? []).some((a) => a.slot !== 'facts')
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
    if (!st) return { ok: false, said, why: 'that Over time entry is no longer in this tale' };
    if (st.body.trim() !== text.trim()) return { ...changed,
      why: `${t.title}'s Over time from scene ${st.fromChapter} has changed since Talk made it` };
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
  if (c.op === 'thread.new') return `Made a new thread: ${c.title}, ${an(c.type)}.`;
  if (c.op === 'thread.unmake') return `Took away ${c.title}.`;
  if (c.op === 'room.unmake') return `Took away ${c.title}'s ${roomLabel(c.room)}.`;
  if (c.op === 'state.unmake') return `Took away ${c.title}'s Over time from scene ${c.from}.`;
  if (c.op === 'thread.retire') return `Retired ${c.title} from scene ${c.from}. It is kept, and can be brought back.`;
  if (c.op === 'retire.unmake') return `Brought back ${c.title}.`;
  if (c.op === 'takeover.unmake') return `Gave ${c.title} back to its World: this tale reads the World's version again.`;
  if (c.op === 'thread.overtime') return c.undo ? `Put back ${c.title}'s Over time from scene ${c.from}.`
    : `${c.state ? 'Changed' : 'Added to'} ${c.title}'s Over time from scene ${c.from}: “${clip(c.text)}”`;
  if (c.op === 'tale.set') return c.undo ? `Put back the tale's ${c.field}.`
    : `Changed the tale's ${c.field}: “${clip(c.text)}”`;
  if (c.op === 'thread.wake') return c.undo ? `Put back how ${c.title} wakes: ${wakeWords(c.activation, c.keys)}.`
    : c.activation === 'triggered' ? `${c.title} is On a word now: ${c.keys.join(', ')}.` : `${c.title} is Always on now.`;
  if (c.op === 'scene.set') return c.field === 'title'
    ? c.undo ? `Put back scene ${c.index}'s title.` : `Changed scene ${c.index}'s title: “${clip(c.text)}”`
    : c.undo ? `Put back where scene ${c.index} heads.` : `Changed where scene ${c.index} heads: “${clip(c.text)}”`;
  if (c.op === 'string.set' && c.wasKind) return `Made ${c.name} ${an(roomLabel(c.kind))}${
    c.text.trim() === (c.before ?? '').trim() ? '.' : `: “${clip(c.text)}”`}`;
  if (c.op === 'string.set') return c.addon ? `Changed the ${roomLabel(c.kind)} ${c.name}: “${clip(c.text)}”`
    : `Added ${an(roomLabel(c.kind))} to the tale, in play: ${c.name}.`;
  if (c.undo && STRING_SLOTS.includes(c.room)) return `Put back the ${roomLabel(c.room)} ${c.name}.`;
  if (c.undo) return `Put back ${c.title}'s ${roomLabel(c.room)}.`;
  return `Changed ${c.title}'s ${roomLabel(c.room)}: “${clip(c.text)}”`;
}

/** #122 · WHAT A CHANGE LINE SHOWS AS A DIFF: the text the change replaced and the text it wrote,
 *  for the changes that rewrite text; null for the rest (a new thread has no before, a retirement
 *  rewrites nothing) and for an Undo, whose `before` is the text being put back. A pocket or an Over
 *  time entry it made had nothing before it, which reads as an empty side. */
export function textsOf(c: Change): { before: string; after: string } | null {
  if ((c as any).undo) return null;
  // A string made the other kind and nothing else rewrote no text.
  if (c.op === 'string.set' && c.wasKind && c.text.trim() === (c.before ?? '').trim()) return null;
  if (c.op === 'thread.set' || c.op === 'tale.set' || c.op === 'scene.set' || c.op === 'string.set')
    return { before: c.before ?? '', after: c.text };
  if (c.op === 'thread.overtime') return { before: c.before?.body ?? '', after: c.text };
  if (c.op === 'thread.wake') return { before: wakeWords(c.before.activation, c.before.keys), after: wakeWords(c.activation, c.keys) };
  return null;
}

/** What was asked, in words, for a change that is refused before it means anything. */
function saidOf(raw: any): string {
  const name = String(raw?.thread ?? raw?.title ?? '').trim();
  if (raw?.op === 'thread.new') return `Make a new thread${name ? `: ${name}` : ''}`;
  if (raw?.op === 'scene.set') return `Change scene ${raw?.scene ?? 'this one'}`;
  if (raw?.op === 'string.set') return `Add or change the string ${name || 'with no name'}`;
  if (raw?.op === 'thread.wake') return `Change how ${name || 'a thread'} wakes`;
  if (raw?.op === 'thread.retire') return `Retire ${name || 'a thread'}`;
  if (raw?.op === 'thread.overtime') return `Add to ${name || 'a thread'}'s Over time${raw?.scene ? ` from scene ${raw.scene}` : ''}`;
  if (raw?.op === 'tale.set') return `Change the tale's ${String(raw?.field ?? '').trim() || 'premise or setting'}`;
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
      why: `a World has no scenes, so ${hit.title}'s Over time and retiring are this tale's. Say it is your version` } };
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
  type: 'array', maxItems: 4,
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
      // tale.set and thread.set: the whole new text. thread.new: its Always true.
      text: { type: 'string', maxLength: 1200 },
      // thread.new only.
      title: { type: 'string', maxLength: 80 },
      type: { type: 'string', enum: [...KINDS] },
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
  if (c.op === 'thread.new') return { op: 'thread.unmake', thread: made.thread, title: c.title, text: c.always };
  if (c.op === 'thread.retire') return { op: 'retire.unmake', thread: c.thread, event: made.event };
  if (c.op === 'thread.overtime') return c.before
    ? { op: 'thread.overtime', thread: c.thread, state: c.state, scene: c.from, text: c.before.body,
        label: c.before.label, beforeMode: c.before.beforeMode, wrote: { body: c.text, label: c.label } }
    : { op: 'state.unmake', thread: c.thread, state: made.state, text: c.text };
  // `wrote` on each of these is what Talk left there, which the Undo checks is still there.
  if (c.op === 'tale.set') return { op: 'tale.set', field: c.field, text: c.before, wrote: c.text };
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
  return { op: 'thread.set', thread: c.thread, room: c.room, addon: c.addon, text: c.before, wrote: c.text };
}

