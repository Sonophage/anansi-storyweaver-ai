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

export type CatalogueRow = { id: string; modelClass: string | null; context: number | null };

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
  }));
  cached = { at: now, rows };
  return rows;
}

/** One model by its Featherless id (no prefix), or null when the catalogue does not list it. */
export const catalogueEntry = async (featherlessId: string) =>
  (await catalogue()).find((m) => m.id === featherlessId) ?? null;
