// WHO IS WATCHING A BOOK RIGHT NOW, and a way to tell them it moved.
//
// Seth, 2026-09-03: "the messages coming in isn't instant I have to refresh the page neither is the
// notification for co op both need a refresh. These need to be instant."
//
// Two writers in one book is the first thing this app has ever built where somebody else changes
// what is on your screen. Until now every repaint followed a press of your own, so nothing needed
// to arrive on its own and nothing did.
//
// A MODULE OF ITS OWN, and no HTTP in it. `db.ts` announces a change and `serve.ts` decides who may
// hear about it — keeping those apart is what lets the tests and the benches import db.ts and get a
// no-op, because nothing has subscribed.
//
// NOT A QUEUE. A listener that is not attached misses the event, which is correct: this says "the
// book moved, ask again", and a writer who was not connected asks on their next paint anyway. There
// is nothing here worth persisting and nothing to replay.
export interface Change { storyId: string; by: string | null; at: number }

type Listener = (c: Change) => void;
const listeners = new Set<Listener>();

/** Subscribe. Returns the unsubscribe, which the caller MUST run when the reader goes away — a
 *  listener held after its response is dead writes to a closed socket for the life of the process. */
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** WHO MADE THE CHANGE, carried so a writer is never told about their own press. Their page has
 *  already repainted from the answer to it, and refetching on top of that is a second round trip
 *  that can only arrive later and say the same thing.
 *
 *  Null when nothing set it: a scheduled job, an import, a bench. Null is not any writer, so
 *  everybody watching hears about it — which is right, because nobody's page has it yet. */
let by: string | null = null;
/** Whose press this is, for the rest of this tick. `serve.ts` sets it per request. */
export const asWriter = (id: string | null) => { by = id; };

export function changed(storyId: string): void {
  if (!listeners.size) return;
  const c: Change = { storyId, by, at: Date.now() };
  // A COPY, because a listener that unsubscribes inside its own call would otherwise mutate the set
  // being walked — which is exactly what a dropped connection does.
  for (const fn of [...listeners]) {
    try { fn(c); } catch { /* one bad reader must not stop the others being told */ }
  }
}

/** WHO HEARS ABOUT A CHANGE. A function rather than a condition inside the SSE handler, because it
 *  is the only rule on that path that can be wrong in a way nobody sees — and a closure holding a
 *  response object cannot be asked a question by a test.
 *
 *  TWO REASONS TO STAY QUIET, and they are different. Your own press: your page repainted from the
 *  answer to it, and this could only arrive later saying the same thing. A book you cannot open:
 *  the same gate every route is behind, asked again because this path does not go through the
 *  dispatcher that asks it.
 *
 *  `by` null is nobody's press — a scheduled job, an import — so everybody watching hears it.
 */
export const shouldTell = (c: Change, ownerId: string, canSee: boolean): boolean =>
  canSee && c.by !== ownerId;
