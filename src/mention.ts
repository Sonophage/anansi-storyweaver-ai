// WHICH THREADS COME IN WHEN THE SCENE NAMES THEM, AND ON WHAT WORD (Seth, 2026-11-05: "all cards mention
// only by default, including current stories ... I'll have her turn on anything she actually wants on").
// A thread that is always on goes on a word, the tale's own keyword matcher's (`fires`), so it comes in
// when the scene names it. Kia's tales had 397 threads always on, most from a Tidy accept that turned
// them on (fixed 2026-11-01, e442482), and every call and every hem sent them all.
//
// THE PROSE DECIDES THE WORD, or a thread goes dark: bench/ledger-audit.ts found 734 threads whose
// keywords no passage writes ("Morgott the Grace-Given" on "Grace"). A thread keeps its own words when
// the prose writes one; else it gains its whole name, or a word of a person's name, where the prose
// writes it (`candidates`); else it stays on, and the writer is told. Not the tale's thread, the writer's character, or the Hands off one while the
// switch is on: they are in every scene.
//
// Pure: no database, no model. `db.mentionApply` writes what this plans, and keeps what it replaced.
import { fires } from './context.ts';
import { commonWord, keysTakenBy } from './slots.ts';

export type Thread = { id: string; title: string; entryType: string; activation: string; keys: string[]; properNouns?: boolean };
export type Flip = { id: string; title: string; keys: string[]; added: string | null };
export type Kept = { id: string; title: string; why: string };

/** The words worth trying, best first. A person by their name: the given name (the first word) and the
 *  whole name before any comma, never a word of an epithet ("Red" of "Magnus the Red", "Pale" of
 *  "Mortarion, The Pale King"). A thing by its whole name where it has more than one word (a key of
 *  several words fires only on all of them, in order, so "Gravesite Plain" never wakes on "plain", nor
 *  "Iron Warriors" and "Iron Hands" both on "iron"), or its one word. A single word is three letters or
 *  more, not a common word (`commonWord`) and not another person's name (`others`).
 *  ponytail: a common word the list lacks ("plain") can still key a one-word name. Trigger: a thread
 *  waking on an everyday word after the flip; then score words against the tale's narration. */
const candidates = (e: Thread, others: string[]) => {
  const name = e.title.split(',')[0].trim().replace(/^(the|a|an)\s+/i, '');
  const words = name.match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const taken = new Set(others.map((o) => o.toLowerCase()));
  const fit = (w: string) => w.length >= 3 && !commonWord(w) && !taken.has(w.toLowerCase());
  const whole = words.length > 1 ? [name] : [];
  if (e.entryType === 'character') return [...words.slice(0, 1).filter(fit), ...whole];
  return words.length === 1 ? words.filter(fit) : whole;
};

export function mentionPlan(threads: Thread[], prose: string,
    story: { persona?: string | null; lockedCharacter?: string | null; lockoutOn?: boolean | null }) {
  const flip: Flip[] = [], kept: Kept[] = [];
  const low = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const own = low(story.persona), off = story.lockoutOn === false ? '' : low(story.lockedCharacter);
  for (const e of threads) {
    if (e.activation !== 'always_on') continue;
    if (e.entryType === 'tale') { kept.push({ id: e.id, title: e.title, why: 'the tale itself' }); continue; }
    if (own && low(e.title) === own) { kept.push({ id: e.id, title: e.title, why: 'your character' }); continue; }
    if (off && low(e.title) === off) { kept.push({ id: e.id, title: e.title, why: 'the Hands off character' }); continue; }
    if (!prose.trim()) { kept.push({ id: e.id, title: e.title, why: 'never named: the tale has no prose yet' }); continue; }
    const wakes = (keys: string[]) => fires({ ...e, keys } as any, prose).length > 0;
    if (e.keys.length && wakes(e.keys)) { flip.push({ id: e.id, title: e.title, keys: e.keys, added: null }); continue; }
    const rest = threads.filter((x) => x.id !== e.id && x.entryType !== 'tale');
    const word = candidates(e, keysTakenBy(rest)).find((w) => wakes([w]));
    if (word) flip.push({ id: e.id, title: e.title, keys: [...e.keys, word], added: word });
    else kept.push({ id: e.id, title: e.title, why: 'never named in the prose' });
  }
  return { flip, kept };
}
