/* THE FEATHERLESS CATALOGUE — what remote models exist, and what each one can hold.
 *
 * A slice in the sense `src/search.ts` sets out: it owns the KNOWLEDGE about the catalogue and
 * never opens the database or defines the ownership gate. The shortlist that records a writer's
 * choices lives in `db.ts`; this file only answers "is this a real model, and how much context
 * does it take".
 *
 * FETCHED THROUGH THE SERVER, CACHED FOR A DAY, IN MEMORY. `GET /v1/models` is public — no key is
 * sent, so the key is never on a request that does not need it — and it lists more than 22,000
 * models, so it is asked once a day and not once per add. The browser never talks to Featherless.
 *
 * ponytail: the cache is per process and the whole list is held. Ceiling: a restart refetches,
 * and a catalogue many times larger would want a disk cache. Upgrade path is writing the list to
 * a file beside the key with its fetch time.
 */
import { FEATHERLESS } from './llama.ts';

/** `cost` is Featherless's `concurrency_cost`: how many of the plan's units one call takes. */
export type CatalogueRow = { id: string; modelClass: string | null; context: number | null;
  cost: number | null };

export const CATALOGUE_TTL_MS = 24 * 60 * 60_000;
let cached: { at: number; rows: CatalogueRow[] } | null = null;

/** The whole catalogue, from the cache while it is younger than a day. `now` is a parameter only
 *  so a test can age the cache without waiting a day. */
export async function catalogue(now = Date.now()): Promise<CatalogueRow[]> {
  if (cached && now - cached.at < CATALOGUE_TTL_MS) return cached.rows;
  let r: Response;
  try { r = await fetch(`${FEATHERLESS}/models`, { signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('cannot reach Featherless to read its catalogue'); }
  if (!r.ok) throw new Error(`the Featherless catalogue answered ${r.status}`);
  const d = await r.json() as any;
  const rows = (d.data ?? []).map((m: any) => ({
    id: String(m.id),
    modelClass: m.model_class ? String(m.model_class) : null,
    context: Number.isFinite(Number(m.context_length)) && Number(m.context_length) > 0
      ? Number(m.context_length) : null,
    cost: Number.isFinite(Number(m.concurrency_cost)) && Number(m.concurrency_cost) > 0
      ? Number(m.concurrency_cost) : null,
  }));
  cached = { at: now, rows };
  return rows;
}

/** One model by its Featherless id (no prefix), or null when the catalogue does not list it. */
export const catalogueEntry = async (featherlessId: string) =>
  (await catalogue()).find((m) => m.id === featherlessId) ?? null;

/* ---------- what a writer may see, and in what order ---------- */

/** THE FLOOR. Anansi's prompt for one passage is a few thousand tokens before the book is in it,
 *  and a model that holds less than this refuses every passage once the book has any length. A row
 *  that does not say what it holds is under the floor too: budgeting needs the number. */
export const MIN_CONTEXT = 16_384;

/** THE PLAN IS 4 UNITS, and a model that costs 4 takes all of it: while one writer uses it the
 *  other cannot write at all. Only the admin, who pays for the plan, may choose that. A row that
 *  does not say its cost is treated as the worst case — the gate fails closed. */
export const WHOLE_PLAN = 4;

/** Why `row` cannot go on this writer's shortlist, or null when it can. ONE PREDICATE for the
 *  search and the add, so the search never offers what the add would refuse. */
export function refusal(row: CatalogueRow, admin: boolean): string | null {
  if (!row.context || row.context < MIN_CONTEXT)
    return `this model holds ${row.context ? row.context.toLocaleString('en') : 'an unknown number of'}`
      + ` tokens, and Anansi needs at least ${MIN_CONTEXT.toLocaleString('en')}`;
  if (!admin && (row.cost == null || row.cost >= WHOLE_PLAN))
    return 'this model takes the whole Featherless plan, and only the admin can add one';
  return null;
}

/** The names the decensoring work goes by. Case-insensitive, anywhere in the id. */
const UNCENSORED = /heretic|abliterat|uncensor/i;
export const isUncensored = (id: string) => UNCENSORED.test(id);

/** WEAVING, as the writer reads it. The order is the sort order: a model that never plans is ready
 *  to write the moment it answers, so it comes first. */
export const WEAVING = ["doesn't weave", 'can switch', 'always weaves'] as const;
export type Weaving = typeof WEAVING[number];

/** THE GUESS, from the model's class, before anyone has called it. One table, here. The probe on
 *  add replaces it with what the model actually did (`weavingFound`).
 *    always: gpt-oss and the R1-style reasoners plan whatever they are told.
 *    can switch: Qwen 3.x, Gemma 4 and GLM 4.5+ honour `enable_thinking`.
 *  Anything else — the older Llama and Mistral classes, and a class this table has not met — is
 *  guessed as not weaving.
 *  ponytail: a hand-kept list of class names. Ceiling: a new reasoning family is guessed wrong
 *  until it is added here; the probe still records the truth on add. Upgrade path is reading a
 *  capability field if Featherless ever publishes one. */
const GUESS: [RegExp, Weaving][] = [
  [/^gpt-oss|r1\b|^qwq|think/i, 'always weaves'],
  [/^qwen3|^gemma4|^glm4[5-9]/i, 'can switch'],
];
export const weavingGuess = (modelClass: string | null): Weaving =>
  GUESS.find(([re]) => re.test(modelClass ?? ''))?.[1] ?? "doesn't weave";

/** What the probe on add found. Asked with weaving off: any plan in the answer means the model
 *  cannot be switched off. No plan keeps the class guess — an absent plan from a model guessed to
 *  always weave is more likely hidden by the provider than missing. */
export const weavingFound = (modelClass: string | null, answer: { prose: string; reasoning: string }):
  Weaving => (answer.reasoning.trim() || /<think>/i.test(answer.prose)) ? 'always weaves'
    : weavingGuess(modelClass);

/** The weight in the class name — `qwen3_5moe-35b` is 35b. Null for a class that does not say. */
export const sizeClass = (modelClass: string | null): string | null =>
  /-(\d+(?:\.\d+)?b)\b/i.exec(modelClass ?? '')?.[1].toLowerCase() ?? null;

export type Found = { id: string; cost: number | null; context: number; weaving: Weaving;
  size: string | null };
export type Query = { text?: string; size?: string; weaving?: string; uncensored?: boolean };

/** RESULTS ARE CAPPED. 778 uncensored models is a list nobody reads; a search narrows it.
 *  ponytail: a fixed cap with no paging. Ceiling: past the first 100 a writer must type more.
 *  Upgrade path is an offset in the query. */
export const RESULT_CAP = 100;

/** THE SEARCH, pure: rows in, rows out. `prefix` is handed in so the ids that leave here are the
 *  ones the shortlist takes, without this file deciding what a remote id looks like. */
export function search(rows: CatalogueRow[], q: Query, admin: boolean, prefix: string) {
  const open = rows.filter((r) => !refusal(r, admin));
  const text = (q.text ?? '').trim().toLowerCase();
  const found: Found[] = open
    .filter((r) => q.uncensored === false || isUncensored(r.id))
    .filter((r) => !text || r.id.toLowerCase().includes(text))
    .map((r) => ({ id: prefix + r.id, cost: r.cost, context: r.context as number,
      weaving: weavingGuess(r.modelClass), size: sizeClass(r.modelClass) }))
    .filter((r) => !q.size || r.size === q.size.toLowerCase())
    .filter((r) => !q.weaving || r.weaving === q.weaving)
    .sort((a, b) => WEAVING.indexOf(a.weaving) - WEAVING.indexOf(b.weaving)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // The size choices come from what this writer could be shown at all, not from this search —
  // a menu that shrinks as you filter hides the way back.
  const sizes = [...new Set(open.map((r) => sizeClass(r.modelClass)).filter(Boolean) as string[])]
    .sort((a, b) => parseFloat(a) - parseFloat(b));
  // The weaving words go to the browser too, so the filter offers exactly the labels used here.
  return { models: found.slice(0, RESULT_CAP), total: found.length, sizes, weavings: WEAVING };
}
