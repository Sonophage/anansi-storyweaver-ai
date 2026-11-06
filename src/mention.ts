// WHICH THREADS COME IN WHEN THE SCENE NAMES THEM, AND ON WHAT WORD (Seth, 2026-11-05: "all cards mention
// only by default, including current stories ... I'll have her turn on anything she actually wants on").
// A thread that is always on goes on a word, the tale's own keyword matcher's (`fires`), so it comes in
// when the scene names it. Kia's tales had 397 threads always on, most from a Tidy accept that turned
// them on (fixed 2026-11-01, e442482), and every call and every hem sent them all.
//
// ITS NAME IS ONE OF ITS WORDS, or a thread can go dark: bench/ledger-audit.ts found 734 threads whose
// keywords no passage writes ("Morgott the Grace-Given" on "Grace"). A thread keeps its own words when
// the prose writes one; else it gains its name (`candidates`), the form the prose writes where it writes
// one, so a thread not named yet comes in the first time a scene names it (Seth: "flip them too"). A
// thread with no word to wake on at all stays on, and the writer is told. Not the tale's thread, the
// writer's character, or the Hands off one while the switch is on: they are in every scene.
// ponytail: a thread the prose calls by another name ("the Omen King" for Morgott) does not come in.
// Trigger: Kia missing one in a scene; she turns it on with its eye, or gives it that word.
//
// Pure: no database, no model. `db.mentionApply` writes what this plans, and keeps what it replaced.
import { fires } from './context.ts';
import { commonWord, keysTakenBy } from './slots.ts';

export type Thread = { id: string; title: string; entryType: string; activation: string; keys: string[]; properNouns?: boolean };
export type Flip = { id: string; title: string; keys: string[]; named: boolean };
export type Kept = { id: string; title: string; why: string };

/** The words worth trying, best first. A person by their name: the given name (the first word that can be one) and the
 *  whole name before any comma or note in brackets, never an honorific ("Sir" of "Sir Gideon Ofnir") or a word of an epithet ("Red" of "Magnus the Red", "Pale" of
 *  "Mortarion, The Pale King"). A thing by its whole name where it has more than one word (a key of
 *  several words fires only on all of them, in order, so "Gravesite Plain" never wakes on "plain", nor
 *  "Iron Warriors" and "Iron Hands" both on "iron"), or its one word. A single word is three letters or
 *  more, not a common word (`commonWord`) and not another person's name (`others`).
 *  ponytail: a common word the list lacks ("plain") can still key a one-word name. Trigger: a thread
 *  waking on an everyday word after the flip; then score words against the tale's narration. */
const candidates = (e: Thread, others: string[]) => {
  const name = e.title.split(',')[0].replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an)\s+/i, '');
  const words = name.match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const taken = new Set(others.map((o) => o.toLowerCase()));
  const fit = (w: string) => w.length >= 3 && !commonWord(w) && !taken.has(w.toLowerCase());
  const whole = words.length > 1 ? [name] : [];
  if (e.entryType === 'character') return [...words.filter(fit).slice(0, 1), ...whole];
  return words.length === 1 ? words.filter(fit) : whole;
};

/** WHO IS IN EVERY SCENE, so is never put on a word: the writer's own character, and the Hands off one
 *  while the switch is on (unsaved counts as on, as the prompt reads it). One rule for a new thread's
 *  save (`upsertEntry`) and for the flip below, so the two cannot disagree. Names compare as written,
 *  case and spacing aside. */
export function staysOn(title: string, story: { persona?: string | null; lockedCharacter?: string | null; lockoutOn?: boolean | null }) {
  const low = (x: unknown) => String(x ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const t = low(title);
  if (!t) return null;
  if (t === low(story.persona)) return 'your character';
  if (story.lockoutOn !== false && t === low(story.lockedCharacter)) return 'the Hands off character';
  return null;
}

export function mentionPlan(threads: Thread[], prose: string,
    story: { persona?: string | null; lockedCharacter?: string | null; lockoutOn?: boolean | null }) {
  const flip: Flip[] = [], kept: Kept[] = [];
  for (const e of threads) {
    if (e.activation !== 'always_on') continue;
    if (e.entryType === 'tale') { kept.push({ id: e.id, title: e.title, why: 'the tale itself' }); continue; }
    const who = staysOn(e.title, story);
    if (who) { kept.push({ id: e.id, title: e.title, why: who }); continue; }
    const wakes = (keys: string[]) => !!prose.trim() && fires({ ...e, keys } as any, prose).length > 0;
    if (e.keys.length && wakes(e.keys)) { flip.push({ id: e.id, title: e.title, keys: e.keys, named: true }); continue; }
    // NOT NAMED YET IS STILL ON ITS NAME (Seth, 2026-11-05, "flip them too"): it comes in the first time a
    // scene names it. Its own words stay; its name is added unless they already hold it.
    const rest = threads.filter((x) => x.id !== e.id && x.entryType !== 'tale');
    const has = new Set(e.keys.map((k) => k.toLowerCase()));
    const names = candidates(e, keysTakenBy(rest));
    const written = names.find((w) => wakes([w]));
    const word = written ?? (names.some((w) => has.has(w.toLowerCase())) ? undefined : names[0]);
    const keys = word ? [...e.keys, word] : e.keys;
    if (keys.length) flip.push({ id: e.id, title: e.title, keys, named: !!written });
    else kept.push({ id: e.id, title: e.title, why: 'no word to wake on: name it a keyword, or leave it on' });
  }
  return { flip, kept };
}
