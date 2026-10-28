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
import { ALL_SLOTS, KINDS, slotsFor } from './slots.ts';
import { retiredAt } from './context.ts';

/** What the model may ask for. #97 cut the path with the first two; #98 adds the rest. */
export const ASKED = ['thread.new', 'thread.set', 'thread.overtime', 'thread.wake', 'thread.retire',
  'tale.set', 'scene.set'] as const;
/** What only an Undo may do, beside putting back old text. */
export const UNMAKE = ['thread.unmake', 'room.unmake', 'state.unmake', 'retire.unmake'] as const;
/** What an Undo may put back as it was: the asked operations that write over a value, by id. */
const PUT_BACK = ['thread.set', 'thread.overtime', 'thread.wake', 'tale.set', 'scene.set'] as const;

/** THE TALE'S OWN FIELDS TALK MAY CHANGE. Until the tale's thread is built (GLOSSARY), its premise
 *  and setting are the story's own columns, and these are the two. Rules are rule threads today, so
 *  they are changed through the thread operations. */
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
      // thread.new only.
      title: { type: 'string', maxLength: 80 },
      type: { type: 'string', enum: [...KINDS] },
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
    },
    required: ['op'],
  },
} as const;

type Room = { id: string; slot: string; name: string; body: string; keys: string[]; active: boolean };
type Thread = { id: string; title: string; entryType: string; addons?: Room[]; sharedFrom?: string | null;
  activation?: string; keys?: string[]; states?: State[];
  events?: { id: string; kind: string; fromChapter: number }[]; retiredAtChapter?: number | null };
type State = { id: string; fromChapter: number; body: string; label?: string | null; beforeMode?: string | null };
type Scene = { id: string; index: number; title?: string | null; authorsNote?: string | null };
/** The tale as the route read it through the gate: its threads, and since #98 its own fields, its
 *  scenes and the scene the writer is in. The later three are optional so a check that needs only
 *  threads can be handed only threads. */
export type Tale = { entries: Thread[]; story?: { premise?: string | null; setting?: string | null };
  chapters?: Scene[]; at?: number };

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
  | { op: 'retire.unmake'; thread: string; title: string; event: string };
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
const roomLabel = (slot: string) => slot === 'facts' ? 'Always true' : slot.replace(/_/g, ' ');
const clip = (t: string, n = 160) => t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
/** A web link, with the brackets a model puts round one. */
const LINK = /\s*[(\[<]?https?:\/\/[^\s)\]>]+[)\]>]?/g;
const an = (kind: string) => (/^[aeiou]/.test(kind) ? 'an ' : 'a ') + kind;

/** WHICH THREAD A NAME MEANS. The exact name first. Failing that, a thread whose name holds every
 *  WORD of the one given, or whose words are all in it: "Morgott" is "Morgott, the Omen King", and
 *  "Ta" is nobody, though three names start with it. Two such threads is a question, not a guess:
 *  a change written at once to the wrong one is worse than one not done. */
function threadNamed(tale: Tale, name: unknown): { hit?: Thread; why?: string } {
  const want = norm(name);
  if (!want) return { why: 'it did not name a thread' };
  const exact = tale.entries.filter((e) => norm(e.title) === want);
  if (exact.length === 1) return { hit: exact[0] };
  const w = new Set(words(name));
  const near = exact.length ? exact : tale.entries.filter((e) => {
    const ew = new Set(words(e.title));
    return [...w].every((x) => ew.has(x)) || [...ew].every((x) => w.has(x));
  });
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
    return { ok: true, change: { op, title, type, always: String(raw.text ?? '').trim(), keys, activation } };
  }
  if (op === 'tale.set') return taleSet(tale, raw, said, false);
  if (op === 'scene.set') return sceneSet(tale, raw, said, false);
  const { hit, why } = threadNamed(tale, raw.thread);
  if (!hit) return { ok: false, said, why: why! };
  if (op === 'thread.wake') return wakeOn(hit, raw, said, false);
  if (op === 'thread.overtime') return overtimeOn(tale, hit, raw, said, false);
  if (op === 'thread.retire') return retireOn(tale, hit, raw, said);
  return setOn(hit, roomOf(raw.room), String(raw.text ?? '').trim(), said, false);
}

/** A NEW THREAD'S NAME AND KIND, checked the one way for a tale and a draft: it has a name, its kind
 *  is a kind, and no thread already has that name. */
function newThread(raw: any, tale: Tale): { title: string; type: string } | { why: string } {
  const title = String(raw.title ?? raw.thread ?? '').trim();
  const type = String(raw.type ?? '').trim();
  if (!title) return { why: 'the new thread had no name' };
  if (!(KINDS as string[]).includes(type))
    return { why: `"${type || 'nothing'}" is not a kind of thread. A thread is ${KINDS.join(', ')}` };
  const twin = tale.entries.find((e) => norm(e.title) === norm(title));
  if (twin) return { why: `there is already a thread called ${twin.title}` };
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
               wrote?: unknown): Checked {
  if (t.sharedFrom) return followed(t, said);
  if (!hasRoom(t, slot)) return { ok: false, said, why: noRoom(t, slot) };
  const cur = undo ? (t.addons ?? []).find((a) => a.id === addon && a.slot === slot) ?? null : roomFor(t, slot);
  // A put-back names the pocket it writes over. With none named it would make one, and making a
  // pocket is a request's, checked as one; an Undo of a pocket Talk made is `room.unmake`.
  if (undo && !addon) return { ok: false, said, why: 'that Undo names no pocket to put back' };
  if (undo && !cur) return { ok: false, said, why: 'that pocket is no longer in this tale' };
  if (undo && cur && !stillWrote(wrote, cur.body)) return { ok: false, said, why: SINCE };
  if (!undo && !text) return { ok: false, said, why: 'it came with no text' };
  if (!undo && cur && cur.body.trim() === text) return { ok: false, said,
    why: `${t.title}'s ${roomLabel(slot)} already says that` };
  return { ok: true, change: { op: 'thread.set', thread: t.id, title: t.title, room: slot,
    addon: cur?.id ?? null, name: cur?.name ?? (slot === 'facts' ? 'facts' : t.title), keys: cur?.keys ?? [],
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
  const t = tale.entries.find((e) => e.id === String(raw.thread ?? ''));
  if (!t) return { ok: false, said, why: 'that thread is no longer in this tale' };
  const text = String(raw.text ?? '');
  if (op === 'thread.set') return setOn(t, roomOf(raw.room), text, said, true, raw.addon ?? null, raw.wrote);
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
  if (c.op === 'thread.overtime') return c.undo ? `Put back ${c.title}'s Over time from scene ${c.from}.`
    : `${c.state ? 'Changed' : 'Added to'} ${c.title}'s Over time from scene ${c.from}: “${clip(c.text)}”`;
  if (c.op === 'tale.set') return c.undo ? `Put back the tale's ${c.field}.`
    : `Changed the tale's ${c.field}: “${clip(c.text)}”`;
  if (c.op === 'thread.wake') return c.undo ? `Put back how ${c.title} wakes: ${wakeWords(c.activation, c.keys)}.`
    : c.activation === 'triggered' ? `${c.title} is On a word now: ${c.keys.join(', ')}.` : `${c.title} is Always on now.`;
  if (c.op === 'scene.set') return c.field === 'title'
    ? c.undo ? `Put back scene ${c.index}'s title.` : `Changed scene ${c.index}'s title: “${clip(c.text)}”`
    : c.undo ? `Put back where scene ${c.index} heads.` : `Changed where scene ${c.index} heads: “${clip(c.text)}”`;
  if (c.undo) return `Put back ${c.title}'s ${roomLabel(c.room)}.`;
  return `Changed ${c.title}'s ${roomLabel(c.room)}: “${clip(c.text)}”`;
}

/** What was asked, in words, for a change that is refused before it means anything. */
function saidOf(raw: any): string {
  const name = String(raw?.thread ?? raw?.title ?? '').trim();
  if (raw?.op === 'thread.new') return `Make a new thread${name ? `: ${name}` : ''}`;
  if (raw?.op === 'scene.set') return `Change scene ${raw?.scene ?? 'this one'}`;
  if (raw?.op === 'thread.wake') return `Change how ${name || 'a thread'} wakes`;
  if (raw?.op === 'thread.retire') return `Retire ${name || 'a thread'}`;
  if (raw?.op === 'thread.overtime') return `Add to ${name || 'a thread'}'s Over time${raw?.scene ? ` from scene ${raw.scene}` : ''}`;
  if (raw?.op === 'tale.set') return `Change the tale's ${String(raw?.field ?? '').trim() || 'premise or setting'}`;
  if (raw?.op === 'thread.set') return `Change ${name || 'a thread'}${raw?.room && roomOf(raw.room) !== 'facts'
    ? `'s ${roomLabel(roomOf(raw.room))}` : ''}`;
  return `${String(raw?.op ?? 'something') || 'something'}${name ? ` on ${name}` : ''}`;
}

/* #100 · THE DRAFT, WHILE A NEW TALE IS SET UP. The same rule, asked means done, on a tale that
 * does not exist yet: the wizard's draft, which the page holds and sends. Nothing here is written
 * anywhere; a checked change goes back to the page, which applies it to its own draft and holds
 * the Undo. So the list is the draft's own, and it is short:
 *
 *   - tale.set: the draft's title, premise, genre, setting or voice. Not the setting's scene: there
 *     are no scenes yet.
 *   - thread.new, thread.set: as on a tale, against the draft's threads and their rooms.
 *   - thread.remove: removing a draft thread is allowed here, where a tale only retires one,
 *     because nothing has been saved: the thread is the page's, the press is one Undo away, and
 *     Discard throws the whole draft away anyway. The thread the writer plays stays while they play
 *     it, the rule the preview's own remove follows.
 *
 * A draft thread's Always true is its `body`, in the `[Name: text]` form the cast writes it in
 * (POST /api/stories moves it into `facts` at Start); its other rooms are `rooms[slot]`. */
const DRAFT_OPS = ['tale.set', 'thread.new', 'thread.set', 'thread.remove'] as const;
const DRAFT_FIELDS = ['title', 'premise', 'genre', 'setting', 'voice'] as const;
/** The draft's own name for each field: the voice is `writingStyle` in the wizard and the column.
 *  The one copy: `checkDraft` hands the key back with the change, and the route and the page both
 *  write to it. */
const DRAFT_KEY: Record<string, string> = { title: 'title', premise: 'premise', genre: 'genre', setting: 'setting',
  voice: 'writingStyle' };

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
   *  `body`, on Always true only, is the thread's whole body as the draft stores it, `[Name: text]`. */
  | { op: 'thread.set'; title: string; room: string; text: string; before: string | null; body?: string }
  | { op: 'thread.remove'; title: string };
export type DraftChecked = { ok: true; change: DraftChange } | { ok: false; said: string; why: string };

/** The draft's threads as `threadNamed` reads a tale's: the ones the writer kept, with a kind. An
 *  unticked thread is not in the draft, so a request cannot reach it. */
const draftTale = (d: Draft): Tale => ({ entries: (d.entries ?? []).filter((e) => e && e.keep !== false
  && String(e.title ?? '').trim()).map((e) => ({ id: e.title, title: String(e.title).trim(),
  entryType: String(e.entryType ?? 'character') })) });
/** A draft thread's Always true, out of the `[Name: text]` it is written in, or out of text a model
 *  sent with the name in front of it already. */
const alwaysOf = (title: unknown, body: unknown) => {
  const own = String(body ?? '').trim().replace(/^\[|\]$/g, '').trim();
  const name = String(title ?? '').trim();
  return own.toLowerCase().startsWith(name.toLowerCase() + ':') ? own.slice(name.length + 1).trim() : own;
};
/** And back into that form, with one name at the front however the text arrived. */
const draftBody = (title: string, text: string) => `[${title}: ${alwaysOf(title, text)}]`;

/** One change the model returned during setup, checked against the draft the page sent. */
export function checkDraft(raw: any, draft: Draft): DraftChecked {
  if (raw && typeof raw.text === 'string') raw = { ...raw, text: raw.text.replace(LINK, '').trim() };
  const op = String(raw?.op ?? '');
  const said = op === 'thread.remove' ? `Remove ${String(raw?.thread ?? '').trim() || 'a thread'}`
    : op === 'tale.set' ? `Change the ${String(raw?.field ?? '').trim() || 'draft'}` : saidOf(raw);
  if (!(DRAFT_OPS as readonly string[]).includes(op)) return { ok: false, said,
    why: 'that is not something Talk can do while a tale is set up. It changes the draft\'s title, premise, '
      + 'genre, setting and voice, and its threads; there are no scenes or prose yet' };
  const st = draft.story ?? {};
  const text = String(raw.text ?? '').trim();
  if (op === 'tale.set') {
    const field = String(raw.field ?? '').trim().toLowerCase();
    if (!(DRAFT_FIELDS as readonly string[]).includes(field)) return { ok: false, said,
      why: `Talk changes the title, premise, genre, setting or voice, not the ${field || 'nothing'}` };
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
      body: draftBody(title, text), keys: [title] } } };
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
  const asked = slot === 'facts' ? alwaysOf(hit.title, text) : text;
  if (!asked) return { ok: false, said, why: 'it came with no text' };
  const before = slot === 'facts' ? alwaysOf(t.title, t.body) || null : String(t.rooms?.[slot]?.body ?? '') || null;
  if ((before ?? '').trim() === asked) return { ok: false, said, why: `${hit.title}'s ${roomLabel(slot)} already says that` };
  return { ok: true, change: { op: 'thread.set', title: hit.title, room: slot, text: asked, before,
    ...(slot === 'facts' ? { body: draftBody(hit.title, asked) } : {}) } };
}

/** What a draft change did, in the writer's words: one line in the conversation. */
export function draftWords(c: DraftChange): string {
  if (c.op === 'tale.set') return `Changed the ${c.field}: “${clip(c.text)}”`;
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
  if (c.op !== 'thread.set') return null;
  // The first Always true on a thread that had none gets no Undo: `checkUndo` never takes one away.
  if (c.before == null) return c.room === 'facts' ? null
    : { op: 'room.unmake', thread: c.thread, addon: made.addon, text: c.text };
  return { op: 'thread.set', thread: c.thread, room: c.room, addon: c.addon, text: c.before, wrote: c.text };
}

