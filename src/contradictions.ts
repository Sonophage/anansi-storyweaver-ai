// #117 · WHERE A NEW TALE'S DRAFT CONTRADICTS ITSELF, before the writer starts it. Try it on
// (`POST /api/spark/review`) reads the draft's threads, their pockets and the premise against each
// other; this file owns what a contradiction IS, the floor code can find on its own, and the check
// on what the model hands back. Pure: no database, no model, no route. The route sends the draft
// and the model's answer in and returns what comes out.
//
// A CONTRADICTION is two places in the draft that cannot both be true, and one fix: the whole new
// text for ONE of those two places. A place is the premise, or a thread's Always true, where it
// stands as the tale opens, or one of its pockets. The writer takes the fix (Use this) or leaves it;
// nothing here changes the draft.
import { slotsFor } from './slots.ts';

export type Place = { thread: string | null; part: string; says: string };
export type Contradiction = { one: Place; other: Place; fix: { thread: string | null; part: string; text: string };
  why: string; by: 'code' | 'model' };

/** Every part a place can name: the premise, a thread's Always true and where it stands, and the
 *  pockets. The schema's enum is built from this, so the two cannot drift. */
export const PARTS = ['premise', 'always_true', 'stands', 'appearance', 'atmosphere', 'consequences',
  'interiority', 'outfit', 'relationships', 'voice', 'what_it_does', 'who_is_here'] as const;

// An age, said one of three ways: "aged 40", "a 34-year-old" / "19 years old", or a bare number as
// its own clause ("<what they are>; 28; ..."), which is the ledger register's form. A number that is
// a sum, a year, a count or a room is none of those. Validated in test/talk.ts against numbers that
// are not ages as well as ones that are.
const AGE = /\baged?\s+(\d{1,3})\b|\b(\d{1,3})[- ]years?[- ]old\b|(?:^|;)\s*(\d{1,3})\s*(?=;|$)/gim;

/** The ages a text states, in order. */
export function agesSaid(text: unknown): number[] {
  return [...String(text ?? '').matchAll(AGE)].map((m) => Number(m[1] ?? m[2] ?? m[3])).filter((n) => n > 0 && n < 150);
}

const swapAge = (text: string, from: number, to: number) =>
  text.replace(AGE, (m, a, b, c) => Number(a ?? b ?? c) === from ? m.replace(String(from), String(to)) : m);

/** A draft thread's parts, Always true first: the order a reference age is taken in. */
function partsOf(e: any): [string, string][] {
  return [['always_true', String(e.body ?? '')], ['stands', String(e.stands ?? '')],
    ...Object.entries(e.rooms ?? {}).filter(([slot]) => slot !== 'facts')
      .map(([slot, p]: [string, any]) => [slot, String(p?.body ?? '')] as [string, string])]
    .filter(([, t]) => t.trim()) as [string, string][];
}

/** THE FLOOR CODE CAN FIND: one thread whose age is given two ways. The first age said, Always true
 *  first (ADR 0005: Always true is who it is), is taken as right, and the fix rewrites the other
 *  part with it. Across two threads nothing is a contradiction: they are two people. */
export function codeContradictions(cast: any[]): Contradiction[] {
  const out: Contradiction[] = [];
  for (const e of cast) {
    const parts = partsOf(e).map(([part, text]) => ({ part, text, ages: agesSaid(text) })).filter((p) => p.ages.length);
    if (!parts.length) continue;
    const ref = parts[0], age = ref.ages[0];
    for (const p of parts) {
      const other = p.ages.find((n) => n !== age);
      if (other === undefined) continue;
      out.push({ one: { thread: e.title, part: ref.part, says: String(age) }, other: { thread: e.title, part: p.part, says: String(other) },
        fix: { thread: e.title, part: p.part, text: swapAge(p.text, other, age) }, why: `${e.title}'s age is given two ways.`, by: 'code' });
    }
  }
  return out;
}

/** WHAT THE MODEL HANDS BACK, checked against the draft. Each place must name the premise, or a
 *  thread the draft has (any case) and a part its kind has; the fix must be one of the two places,
 *  with text; and never the held character's voice or interiority, which the model does not write
 *  (#84). Anything else is dropped, as is a pair code already found. */
export function modelContradictions(raw: unknown, cast: any[], held: string | null, already: Contradiction[] = []): Contradiction[] {
  const byName = new Map(cast.map((e: any) => [String(e.title ?? '').trim().toLowerCase(), e]));
  const place = (p: any) => {
    const part = String(p?.part ?? '');
    if (part === 'premise') return { thread: null, part };
    const e = byName.get(String(p?.thread ?? '').trim().toLowerCase());
    if (!e) return null;
    const ok = part === 'always_true' || part === 'stands'
      || slotsFor(e.entryType ?? 'character').some((sl) => sl.name === part && part !== 'facts');
    return ok ? { thread: String(e.title), part } : null;
  };
  const same = (a: any, b: any) => a.thread === b.thread && a.part === b.part;
  const isHeld = (t: string | null) => !!held && !!t && t.toLowerCase() === held.toLowerCase();
  const out: Contradiction[] = [];
  for (const c of (Array.isArray(raw) ? raw : []) as any[]) {
    const one = place(c?.one), other = place(c?.other), fix = place(c?.fix);
    const text = String(c?.fix?.text ?? '').trim();
    if (!one || !other || !fix || !text || same(one, other)) continue;
    if (!same(fix, one) && !same(fix, other)) continue;
    if (isHeld(fix.thread) && (fix.part === 'voice' || fix.part === 'interiority')) continue;
    if ([...already, ...out].some((x) => (same(x.one, one) && same(x.other, other)) || (same(x.one, other) && same(x.other, one)))) continue;
    out.push({ one: { ...one, says: String(c.one?.says ?? '').trim() }, other: { ...other, says: String(c.other?.says ?? '').trim() },
      fix: { ...fix, text }, why: String(c?.why ?? '').trim(), by: 'model' });
  }
  return out;
}
