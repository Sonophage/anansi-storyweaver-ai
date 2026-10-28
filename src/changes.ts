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
 * may do: put back the text that was there (a `thread.set` by id), or take away a thread or a room
 * Talk made. Neither list contains a delete of anything the writer made, or any prose: removing is
 * only an Undo's, and only while the thing is exactly as Talk made it, so a forged Undo cannot
 * remove a thread the writer wrote. The unmake operations are refused from the model by name.
 */
import { ALL_SLOTS, KINDS, slotsFor } from './slots.ts';

/** What the model may ask for. #97 cuts the path with these two; the later tickets add to it. */
export const ASKED = ['thread.new', 'thread.set'] as const;
/** What only an Undo may do, beside putting back old text. */
const UNMAKE = ['thread.unmake', 'room.unmake'] as const;

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
      // thread.set: the new text of that room. thread.new: its Always true.
      text: { type: 'string', maxLength: 600 },
      // thread.new only.
      title: { type: 'string', maxLength: 80 },
      type: { type: 'string', enum: [...KINDS] },
      keys: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 40 } },
      activation: { type: 'string', enum: ['always_on', 'triggered'] },
    },
    required: ['op'],
  },
} as const;

type Room = { id: string; slot: string; name: string; body: string; keys: string[]; active: boolean };
type Thread = { id: string; title: string; entryType: string; addons?: Room[]; sharedFrom?: string | null };
export type Tale = { entries: Thread[] };

export type Change =
  | { op: 'thread.new'; title: string; type: string; always: string; keys: string[]; activation: string }
  /** `addon` is the room it writes over, null for one it makes; `before` is that room's text, null
   *  when there was none. On an Undo, `before` is the text being put back. */
  | { op: 'thread.set'; thread: string; title: string; type: string; room: string; addon: string | null;
      name: string; keys: string[]; text: string; before: string | null; undo?: true }
  | { op: 'thread.unmake'; thread: string; title: string }
  | { op: 'room.unmake'; thread: string; title: string; addon: string; room: string };
export type Checked = { ok: true; change: Change } | { ok: false; said: string; why: string };

const NOT_TALK = 'that is not something Talk can do. It changes threads; it does not delete them or touch prose.';

/** A name as both sides of a comparison read it: case, punctuation and a leading article gone. */
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  .replace(/^(the|a|an) /, '');
const words = (t: unknown) => norm(t).split(' ').filter(Boolean);
/** The room as the writer or the model says it. `none` and Always true are the thread's own text. */
const roomOf = (r: unknown) => {
  const x = String(r ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return !x || x === 'none' || x === 'always_true' ? 'facts' : x;
};
export const roomLabel = (slot: string) => slot === 'facts' ? 'Always true' : slot.replace(/_/g, ' ');
const clip = (t: string, n = 160) => t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
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
  ? `${an(t.entryType)} has no ${roomLabel(slot)}` : `there is no ${roomLabel(slot)} on a thread`;

/** One change the model returned, checked against the tale. */
export function checkAsked(raw: any, tale: Tale): Checked {
  const op = String(raw?.op ?? '');
  const said = saidOf(raw);
  if (!(ASKED as readonly string[]).includes(op)) return { ok: false, said, why: NOT_TALK };
  if (op === 'thread.new') {
    const title = String(raw.title ?? raw.thread ?? '').trim();
    const type = String(raw.type ?? '').trim();
    if (!title) return { ok: false, said, why: 'the new thread had no name' };
    if (!(KINDS as string[]).includes(type)) return { ok: false, said,
      why: `"${type || 'nothing'}" is not a kind of thread. A thread is ${KINDS.join(', ')}` };
    const twin = tale.entries.find((e) => norm(e.title) === norm(title));
    if (twin) return { ok: false, said, why: `there is already a thread called ${twin.title}` };
    const keys = (Array.isArray(raw.keys) ? raw.keys : []).map((k: unknown) => String(k ?? '').trim()).filter(Boolean);
    // A CHARACTER NEVER LANDS ON A WORD FROM A MODEL'S ANSWER, the rule accepting a chalked thread
    // follows: a character who stops reaching the model does not fade, he vanishes. Anything else
    // waits for its word only when it has one; `upsertEntry` holds the same floor.
    const activation = type !== 'character' && raw.activation === 'triggered' && keys.length ? 'triggered' : 'always_on';
    return { ok: true, change: { op, title, type, always: String(raw.text ?? '').trim(), keys, activation } };
  }
  const { hit, why } = threadNamed(tale, raw.thread);
  if (!hit) return { ok: false, said, why: why! };
  return setOn(hit, roomOf(raw.room), String(raw.text ?? '').trim(), said, false);
}

/** A thread.set, once its thread is known. Shared by a request and an Undo, so the two cannot
 *  disagree about which rooms a thread has or which room a change lands in. */
function setOn(t: Thread, slot: string, text: string, said: string, undo: boolean, addon?: string | null): Checked {
  // A THREAD THE TALE FOLLOWS lives in its World and is changed there. The screen draws it
  // read-only here for the same reason; a change written through would change every tale that
  // follows that World.
  if (t.sharedFrom) return { ok: false, said, why: `${t.title} belongs to ${t.sharedFrom}, which this tale `
    + 'follows. Change it there' };
  if (!hasRoom(t, slot)) return { ok: false, said, why: noRoom(t, slot) };
  const cur = undo ? (t.addons ?? []).find((a) => a.id === addon && a.slot === slot) ?? null : roomFor(t, slot);
  if (undo && addon && !cur) return { ok: false, said, why: 'that room is no longer in this tale' };
  if (!undo && !text) return { ok: false, said, why: 'it came with no text' };
  if (!undo && cur && cur.body.trim() === text) return { ok: false, said,
    why: `${t.title}'s ${roomLabel(slot)} already says that` };
  return { ok: true, change: { op: 'thread.set', thread: t.id, title: t.title, type: t.entryType, room: slot,
    addon: cur?.id ?? null, name: cur?.name ?? (slot === 'facts' ? 'facts' : t.title), keys: cur?.keys ?? [],
    text, before: undo ? text : cur ? cur.body : null, ...(undo ? { undo: true as const } : {}) } };
}

/** One Undo, checked against the tale. By id, never by name: it names what was changed. */
export function checkUndo(raw: any, tale: Tale): Checked {
  const op = String(raw?.op ?? '');
  const said = 'Undo';
  if (op !== 'thread.set' && !(UNMAKE as readonly string[]).includes(op))
    return { ok: false, said, why: 'that is not something Undo can do' };
  const t = tale.entries.find((e) => e.id === String(raw.thread ?? ''));
  if (!t) return { ok: false, said, why: 'that thread is no longer in this tale' };
  const text = String(raw.text ?? '');
  if (op === 'thread.set') return setOn(t, roomOf(raw.room), text, said, true, raw.addon ?? null);
  // TAKEN AWAY ONLY WHILE IT IS AS TALK MADE IT. The text it was made with rides in the Undo and is
  // compared with what is there now: a thread or room the writer has changed since is theirs, and
  // an Undo that claims Talk made a thread the writer wrote does not match its text.
  const changed = { ok: false as const, said, why: `${t.title} has changed since Talk made it. Delete it by hand if you mean to` };
  if (op === 'thread.unmake') {
    if (t.sharedFrom || norm(t.title) !== norm(raw.title)) return changed;
    const always = (t.addons ?? []).find((a) => a.slot === 'facts')?.body ?? '';
    if (always.trim() !== text.trim() || (t.addons ?? []).some((a) => a.slot !== 'facts')) return changed;
    return { ok: true, change: { op, thread: t.id, title: t.title } };
  }
  const a = (t.addons ?? []).find((x) => x.id === String(raw.addon ?? ''));
  if (!a) return { ok: false, said, why: 'that room is no longer in this tale' };
  if (a.body.trim() !== text.trim()) return { ...changed, why: `${t.title}'s ${roomLabel(a.slot)} has changed since Talk made it` };
  return { ok: true, change: { op: 'room.unmake', thread: t.id, title: t.title, addon: a.id, room: a.slot } };
}

/** What a change did, in the writer's words: one line in the conversation. */
export function wordsFor(c: Change): string {
  if (c.op === 'thread.new') return `Made a new thread: ${c.title}, ${an(c.type)}.`;
  if (c.op === 'thread.unmake') return `Took away ${c.title}.`;
  if (c.op === 'room.unmake') return `Took away ${c.title}'s ${roomLabel(c.room)}.`;
  if (c.undo) return `Put back ${c.title}'s ${roomLabel(c.room)}.`;
  return `Changed ${c.title}'s ${roomLabel(c.room)}: “${clip(c.text)}”`;
}

/** What was asked, in words, for a change that is refused before it means anything. */
function saidOf(raw: any): string {
  const name = String(raw?.thread ?? raw?.title ?? '').trim();
  if (raw?.op === 'thread.new') return `Make a new thread${name ? `: ${name}` : ''}`;
  if (raw?.op === 'thread.set') return `Change ${name || 'a thread'}${raw?.room && roomOf(raw.room) !== 'facts'
    ? `'s ${roomLabel(roomOf(raw.room))}` : ''}`;
  return `${String(raw?.op ?? 'something') || 'something'}${name ? ` on ${name}` : ''}`;
}

/** THE CHANGE THAT PUTS THIS ONE BACK, built once it is applied: `made` holds the ids the write
 *  minted, which nothing knows before it. Returned with the change, and sent back by the Undo. */
export function undoFor(c: Change, made: { thread?: string; addon?: string }) {
  if (c.op === 'thread.new') return { op: 'thread.unmake', thread: made.thread, title: c.title, text: c.always };
  if (c.op !== 'thread.set') return null;
  if (c.before == null) return { op: 'room.unmake', thread: c.thread, addon: made.addon, text: c.text };
  return { op: 'thread.set', thread: c.thread, room: c.room, addon: c.addon, text: c.before };
}

