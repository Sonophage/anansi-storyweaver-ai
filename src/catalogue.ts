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
import { FEATHERLESS, FEATHERLESS_AGENT } from './llama.ts';

/** `cost` is Featherless's `concurrency_cost`: how many of the plan's units one call takes. */
type CatalogueRow = { id: string; modelClass: string | null; context: number | null;
  cost: number | null };

export const CATALOGUE_TTL_MS = 24 * 60 * 60_000;
let cached: { at: number; rows: CatalogueRow[] } | null = null;

/** The whole catalogue, from the cache while it is younger than a day. `now` is a parameter only
 *  so a test can age the cache without waiting a day. */
export async function catalogue(now = Date.now()): Promise<CatalogueRow[]> {
  if (cached && now - cached.at < CATALOGUE_TTL_MS) return cached.rows;
  let r: Response;
  try {
    r = await fetch(`${FEATHERLESS}/models`,
      { headers: FEATHERLESS_AGENT, signal: AbortSignal.timeout(30_000) });
  } catch { throw new Error('cannot reach Featherless to read its catalogue'); }
  if (!r.ok) throw new Error(`the Featherless catalogue answered ${r.status}`);
  const d = await r.json() as any;
  // A field Featherless leaves out, or sends as something other than a positive number, is unknown.
  const pos = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const rows = (d.data ?? []).map((m: any) => ({
    id: String(m.id),
    modelClass: m.model_class ? String(m.model_class) : null,
    context: pos(m.context_length),
    cost: pos(m.concurrency_cost),
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
const MIN_CONTEXT = 16_384;

/** THE PLAN IS 4 UNITS, and every writer may choose a model that takes all of them (Seth,
 *  2026-10-25, opening them to Kia). Until then only the admin could, and every other writer was
 *  held to half the plan so the other could always write. While a 3- or 4-unit model runs, the
 *  other writer's call is refused with a 429: it waits through the retries in `llama.ts` and is
 *  then told Featherless is busy. That wait is the price, and it was chosen.
 *
 *  Why `row` cannot go on a shortlist, or null when it can. ONE PREDICATE for the search and the
 *  add, so the search never offers what the add would refuse. */
export function refusal(row: CatalogueRow): string | null {
  if (!row.context || row.context < MIN_CONTEXT)
    return `this model holds ${row.context ? row.context.toLocaleString('en') : 'an unknown number of'}`
      + ` tokens, and Anansi needs at least ${MIN_CONTEXT.toLocaleString('en')}`;
  return null;
}

/** The names the decensoring work goes by. Case-insensitive, anywhere in the id. */
const UNCENSORED = /heretic|abliterat|uncensor/i;
const isUncensored = (id: string) => UNCENSORED.test(id);

/** WEAVING, as the writer reads it. The order is the sort order: a model that never plans is ready
 *  to write the moment it answers, so it comes first. "not tried yet" is a guess and only a guess:
 *  the family is not in the table below, so nothing is known, and it sorts last because it may
 *  plan. The probe on add never stores it — once tried, a model has done one thing or the other. */
const WEAVING = ["doesn't weave", 'can switch', 'always weaves', 'not tried yet'] as const;
export type Weaving = typeof WEAVING[number];
const UNTRIED: Weaving = 'not tried yet';
/** The label of a model that plans whatever it is sent. Exported: the server reads a stored label
 *  against it to decide that such a model's book always weaves. */
export const ALWAYS_WEAVES: Weaving = 'always weaves';

/** THE GUESS, before anyone has called the model. One table, here; the search rows, the weaving
 *  filter and the sort all read it through `weavingGuess`, and the probe on add replaces it with
 *  what the model actually did (`weavingFound`). The test is Anansi's own switch: a model "can
 *  switch" only if its template honours `enable_thinking`, the one key Anansi sends.
 *
 *  BY NAME FIRST, because one class can hold two behaviours: `kimi-k2` holds Kimi-K2-Instruct and
 *  Kimi-K2-Thinking, `glm4-32b` holds GLM-4-0414 and the GLM-Z1 reasoner, and the R1 distills
 *  carry Llama and Qwen classes. An id that says it does NOT think (`no-think`, `NoThinking`,
 *  `non-thinking`) is left to its class. Magistral is named so its Mistral Small class does not
 *  file it as "doesn't weave": its plan is asked for in a system prompt (its card), Anansi writes
 *  that prompt and never includes it, so only trying it can say.
 *
 *  THEN BY CLASS. The class strings are Featherless's own `model_class`, read 2026-10-22; the label
 *  is from each family's chat template on Hugging Face, the same day:
 *    always: gpt-oss; MiniMax M2.x (the template opens a plan on every answer).
 *    can switch: Qwen 3.x, Gemma 4, GLM 4.5-4.7 (template reads `enable_thinking`), DeepSeek V4
 *      (`deepseek4-*`: V4.1's template takes `enable_thinking`; V4 and V4-Pro ship no template,
 *      and their card documents a non-think mode), Kimi K2.5/K2.6 (`kimi-k25`: the published
 *      template's key is `thinking`, but K2.6 sent `enable_thinking: false` through Featherless on
 *      2026-10-22 wrote with no plan, so the hosted one takes Anansi's key).
 *    doesn't weave: Kimi K2 Instruct, GLM-4-0414, Mistral Small, Llama 2 and 3.x and the older
 *      Mistral classes — no plan anywhere in their templates.
 *  Anything else is "not tried yet", never a confident "doesn't weave".
 *  ponytail: a hand-kept list of class names. Ceiling: a new family reads "not tried yet" until it
 *  is added here, and a hosted template that differs from the published one is guessed wrong; the
 *  probe still records the truth on add. Upgrade path is reading a capability field if Featherless
 *  ever publishes one. Trigger: a probe on add that stores a label other than its guess, or a
 *  family the writers search for that reads "not tried yet". */
const BY_NAME: [RegExp, Weaving][] = [
  [/(?<!no[-_ ]?|non[-_ ]?)think|(^|[^a-z0-9])r1([^a-z0-9]|$)|qwq|glm-?z1/i, ALWAYS_WEAVES],
  [/magistral/i, UNTRIED],
];
const BY_CLASS: [RegExp, Weaving][] = [
  [/^gpt-?oss|^minimax-m2/i, ALWAYS_WEAVES],
  [/^qwen3|^gemma4|^glm4[5-9]|^deepseek4-|^kimi-k25/i, 'can switch'],
  [/^kimi-k2$|^glm4-|^llama[23]|^mistral-(24b|v0|nemo)/i, "doesn't weave"],
];
const weavingGuess = (row: { id: string; modelClass: string | null }): Weaving => {
  const name = row.id.slice(row.id.indexOf('/') + 1);
  return BY_NAME.find(([re]) => re.test(name))?.[1]
    ?? BY_CLASS.find(([re]) => re.test(row.modelClass ?? ''))?.[1] ?? UNTRIED;
};

/** What the probe on add found. Asked with weaving off: any plan in the answer means the model
 *  cannot be switched off. No plan keeps the guess — an absent plan from a model guessed to always
 *  weave is more likely hidden by the provider than missing — except an untried guess, which the
 *  probe has now tried: told not to weave, it did not.
 *
 *  #61. `takes` is false when the model's template refused the switch and the probe answered
 *  without it. Such a model cannot be asked to weave, so a guess of "can switch" is not what it
 *  can do: with no plan it is stored as not weaving. */
export const weavingFound = (row: { id: string; modelClass: string | null },
  answer: { prose: string; reasoning: string }, takes = true): Weaving => {
  if (answer.reasoning.trim() || /<think>/i.test(answer.prose)) return ALWAYS_WEAVES;
  const guess = weavingGuess(row);
  return guess === UNTRIED || (!takes && guess === 'can switch') ? "doesn't weave" : guess;
};

/** The weight in the class name — `qwen3_5moe-35b` is 35b. Null for a class that does not say. */
const sizeClass = (modelClass: string | null): string | null =>
  /-(\d+(?:\.\d+)?b)\b/i.exec(modelClass ?? '')?.[1].toLowerCase() ?? null;

export type Found = { id: string; cost: number | null; context: number; weaving: Weaving;
  size: string | null };
type Query = { text?: string; size?: string; weaving?: string; uncensored?: boolean; cost?: string; tag?: string };

/** RESULTS ARE CAPPED. 778 uncensored models is a list nobody reads; a search narrows it.
 *  ponytail: a fixed cap with no paging. Ceiling: past the first 100 a writer must type more.
 *  Revisit when a writer cannot reach a model by typing more of its name. Upgrade path is an
 *  offset in the query. */
export const RESULT_CAP = 100;

/** THE SEARCH, pure: rows in, rows out. `prefix` is handed in so the ids that leave here are the
 *  ones the shortlist takes, without this file deciding what a remote id looks like. */
/** `tagsOf` answers a repo's tags from the tag index, or undefined for one not read yet; it is
 *  handed in so this stays pure. With a `tag` in the query the answer says how much of the search
 *  the index has read (`tagIndex`), and which repos it still has to read (`unread`, for the route). */
export function search(rows: CatalogueRow[], q: Query, prefix: string,
  tagsOf: (repo: string) => string[] | undefined = () => undefined) {
  const open = rows.filter((r) => !refusal(r));
  const text = (q.text ?? '').trim().toLowerCase();
  const tag = (q.tag ?? '').trim().toLowerCase();
  const candidates = open
    .filter((r) => q.uncensored === false || isUncensored(r.id))
    .filter((r) => !text || r.id.toLowerCase().includes(text))
    .map((r) => ({ repo: r.id, id: prefix + r.id, cost: r.cost, context: r.context as number,
      weaving: weavingGuess(r), size: sizeClass(r.modelClass) }))
    .filter((r) => !q.size || r.size === q.size.toLowerCase())
    .filter((r) => !q.weaving || r.weaving === q.weaving)
    // Units, exactly: a 1-unit model is one a writer can run beside another call on their own plan.
    .filter((r) => !q.cost || r.cost === Number(q.cost));
  // TAGS, over every candidate and not only a page of them: a part of a tag matches ("role" finds
  // roleplay). A candidate whose tags are not read yet is left out and counted, so the answer can
  // say how far the index has got.
  const unread = tag ? candidates.filter((r) => tagsOf(r.repo) === undefined).map((r) => r.repo) : [];
  const found: Found[] = candidates
    .filter((r) => !tag || (tagsOf(r.repo) ?? []).some((t) => t.toLowerCase().includes(tag)))
    .map(({ repo, ...r }) => r)
    .sort((a, b) => WEAVING.indexOf(a.weaving) - WEAVING.indexOf(b.weaving)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // The size choices come from what this writer could be shown at all, not from this search —
  // a menu that shrinks as you filter hides the way back.
  const sizes = [...new Set(open.map((r) => sizeClass(r.modelClass)).filter(Boolean) as string[])]
    .sort((a, b) => parseFloat(a) - parseFloat(b));
  // The unit choices likewise, from what this writer could be shown at all.
  const costs = [...new Set(open.map((r) => r.cost).filter((c): c is number => c != null))].sort((a, b) => a - b);
  // The weaving words go to the browser too, so the filter offers exactly the labels used here.
  return { models: found.slice(0, RESULT_CAP), total: found.length, sizes, costs, weavings: WEAVING,
    ...(tag ? { tagIndex: { read: candidates.length - unread.length, of: candidates.length }, unread } : {}) };
}

/* ---------- what a model is, from Hugging Face: tags, base model, the card's first paragraph ----------
 *
 * Featherless's catalogue says what a model costs and holds, and nothing about what it is for. The
 * repo it was published from says that: its tags, the model it was made from, and a model card. So
 * the server asks Hugging Face, the browser never does, and every answer is cached for a day, the
 * same as the catalogue.
 *
 * ONE FIXED HOST. The repo path comes from a catalogue row, never from the request as given, and it
 * must look like `owner/name`. A redirect is followed once and only to the same host — a renamed
 * repo answers with one — and a redirect anywhere else is treated as no answer. No key is sent:
 * the public metadata needs none, and the Featherless key is not Hugging Face's to see.
 *
 * ponytail: the caches are in-memory Maps with no size bound. Ceiling: at most one entry per
 * catalogue model (22,000), each a few hundred bytes. Upgrade path is an LRU if a process ever
 * holds far more. */
export const HUB = (process.env.ANANSI_HF_URL ?? 'https://huggingface.co').replace(/\/+$/, '');
const REPO = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;
export const isRepo = (id: string) => REPO.test(id) && !id.includes('..');

/** A model card past this many bytes is cut there; the first paragraph is near the top. */
const CARD_BYTES = 256 * 1024;

/** One GET on the hub. Null for "no answer worth having": a 4xx, a 5xx, a redirect off the host,
 *  a second redirect. Throws only when the hub cannot be reached, so that is not cached. */
async function hub(path: string, ms: number): Promise<string | null> {
  let url = HUB + path;
  for (let hop = 0; hop < 2; hop++) {
    let r: Response;
    try { r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(ms) }); }
    catch { throw new Error('cannot reach Hugging Face to describe this model'); }
    if (r.status >= 300 && r.status < 400) {
      let next: URL;
      try { next = new URL(r.headers.get('location') ?? '', url); } catch { return null; }
      if (next.origin !== new URL(HUB).origin) return null;
      url = next.href;
      continue;
    }
    if (!r.ok) return null;
    const text = await r.text();
    return text.slice(0, CARD_BYTES);
  }
  return null;
}

/** Tags the hub adds for its own machinery: file formats, libraries, the task. With every
 *  `key:value` tag (license, base_model, dataset, arxiv, region) they tell a writer nothing about
 *  what a model is for. */
const MACHINE = new Set(['transformers', 'safetensors', 'pytorch', 'gguf', 'mlx', 'onnx', 'text-generation',
  'text-generation-inference', 'conversational', 'endpoints_compatible', 'autotrain_compatible',
  'custom_code', 'image-text-to-text', 'tensorboard', 'merge', 'mergekit']);
const TAG_CAP = 8;

/** The tags a row shows. The author's own (`cardData.tags`) when there are any, since they are the
 *  ones written for a reader; else the hub's. Either way without the machinery and without
 *  two-letter language codes. */
function hubTags(info: any): string[] {
  const own = Array.isArray(info?.cardData?.tags) ? info.cardData.tags : [];
  const pick = own.length ? own : Array.isArray(info?.tags) ? info.tags : [];
  const seen = new Set<string>();
  return pick.map(String).filter((t: string) => {
    const k = t.toLowerCase();
    if (!t || t.includes(':') || MACHINE.has(k) || /^[a-z]{2}$/.test(k) || seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, TAG_CAP);
}

/** `cardData.base_model`, which the hub gives as a string or a list. */
const baseOf = (info: any): string[] =>
  [info?.cardData?.base_model].flat().filter((b) => typeof b === 'string' && b).slice(0, 3);

type HubInfo = { tags: string[]; base: string[] };
const infoCache = new Map<string, { at: number; info: HubInfo }>();
const cardCache = new Map<string, { at: number; about: string | null }>();

/** Tags and base model for one repo. A repo the hub does not answer for is cached as empty. */
async function hubInfo(repo: string): Promise<HubInfo> {
  const now = Date.now();
  const hit = infoCache.get(repo);
  if (hit && now - hit.at < CATALOGUE_TTL_MS) return hit.info;
  const raw = await hub(`/api/models/${repo}`, 10_000);
  let d: any = null;
  try { d = raw ? JSON.parse(raw) : null; } catch {}
  const info = { tags: hubTags(d), base: baseOf(d) };
  infoCache.set(repo, { at: now, info });
  return info;
}

/** THE TAG INDEX. Seth, 2026-10-25: "add the server tag index". A tag search covers every model the
 *  search could show, not only the page that was drawn, so the tags of all of them are read — in
 *  the background, a few at a time, from the same day-long cache the rows use. A search asks again
 *  while it reads, and the answer says how far it has got.
 *
 *  A repo the hub could not be reached for is held as "no tags" for ten minutes, not a day, so an
 *  outage does not leave a hole in the index until tomorrow and does not keep it reading for ever.
 *  ponytail: in memory, like the caches it reads from; a restart reads the tags again. Ceiling:
 *  with uncensored-only off the candidates are the whole catalogue (about 22,000), which is hours of
 *  reads. Upgrade: keep the index in the database. */
export const tagsKnown = (repo: string): string[] | undefined => {
  const hit = infoCache.get(repo);
  return hit && Date.now() - hit.at < CATALOGUE_TTL_MS ? hit.info.tags : undefined;
};
const INDEX_AT_ONCE = 4;
const indexQueue: string[] = [];
const indexing = new Set<string>();
let indexWorkers = 0;
export function indexTags(repos: string[]) {
  for (const r of repos) if (isRepo(r) && !indexing.has(r) && tagsKnown(r) === undefined) { indexing.add(r); indexQueue.push(r); }
  while (indexWorkers < INDEX_AT_ONCE && indexQueue.length) {
    indexWorkers++;
    (async () => {
      for (let r = indexQueue.shift(); r !== undefined; r = indexQueue.shift()) {
        try { await hubInfo(r); }
        catch { infoCache.set(r, { at: Date.now() - CATALOGUE_TTL_MS + 10 * 60_000, info: { tags: [], base: [] } }); }
        finally { indexing.delete(r); }
      }
      indexWorkers--;
    })();
  }
}

/** HOW MANY HUB READS RUN AT ONCE for a page of result rows. A cold page of 100 rows is about
 *  seventeen rounds; every later page with the same models is answered from the cache. */
const HUB_AT_ONCE = 6;

/** Tags for many repos at once, a few at a time. A repo the hub could not be reached for is left
 *  out rather than failing the rest. */
export async function hubTagsFor(repos: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const queue = [...repos];
  const worker = async () => {
    for (let r = queue.shift(); r !== undefined; r = queue.shift()) {
      try { out[r] = (await hubInfo(r)).tags; } catch {}
    }
  };
  await Promise.all(Array.from({ length: HUB_AT_ONCE }, worker));
  return out;
}

/** The expanded row: tags, base model, and the card's first real paragraph, or null without one. */
export async function hubCard(repo: string) {
  const now = Date.now();
  const info = await hubInfo(repo);
  const hit = cardCache.get(repo);
  let about: string | null;
  if (hit && now - hit.at < CATALOGUE_TTL_MS) about = hit.about;
  else {
    about = cardParagraph(await hub(`/${repo}/raw/main/README.md`, 15_000) ?? '');
    cardCache.set(repo, { at: now, about });
  }
  return { ...info, about };
}

/** A description is cut here, at a word. The first paragraph of most cards fits. */
const ABOUT_CAP = 600;
/** Fewer words than this is a caption, a credit or what is left of a banner, not a paragraph. */
const ABOUT_WORDS = 8;

/** THE FIRST REAL PARAGRAPH of a model card, as plain text, or null when there is none.
 *
 *  Model cards open with banners more often than with a sentence: front matter, a style block, a
 *  centred div of images, a heading, a row of badges, a callout, a table of quants. All of that is
 *  dropped. A block is a paragraph when, with its markup taken out, it is prose of some length —
 *  and if anything that looks like markup or CSS survives the stripping, the block is skipped
 *  rather than shown. A card with no such block has no description: the row shows its tags and
 *  base model alone, never raw markup. */
function cardParagraph(readme: string): string | null {
  let s = readme.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  s = s.replace(/^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '');
  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, '\n');
  s = s.replace(/<(style|script|svg|table|pre|code|details)\b[\s\S]*?<\/\1\s*>/gi, '\n');
  s = s.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, '\n');
  for (const block of s.split(/\n[ \t]*\n/)) {
    const raw = block.trim();
    if (!raw) continue;
    // A heading, a table, a list, a rule, a callout, an indented code block, a setext heading.
    if (/^(#{1,6}\s|\||[-*+]\s|\d+[.)]\s|[=*_-]{3,}\s*$|>\s*\[!|\[!|( {4}|\t))/.test(block.replace(/^\n+/, ''))
      || /\n[=-]{3,}\s*$/.test(raw)) continue;
    const text = raw
      .replace(/^>\s?/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)|!\[[^\]]*\]\[[^\]]*\]/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\*\*|__|~~|`/g, '')
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/\s+/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim();
    // Markup or CSS that survived: skip the block rather than show it.
    if (/[<>{}]/.test(text) || (text.match(/[\w-]+\s*:\s*[^;\s]+\s*;/g) ?? []).length >= 2) continue;
    if (text.split(' ').filter((w) => /\w/.test(w)).length < ABOUT_WORDS) continue;
    // Entities last, so an escaped angle bracket in prose is not mistaken for markup above.
    const plain = text.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => +n > 31 && +n <= 0x10ffff ? String.fromCodePoint(+n) : ' ')
      .replace(/&amp;/g, '&');
    if (plain.length <= ABOUT_CAP) return plain;
    const cut = plain.slice(0, ABOUT_CAP);
    return cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : ABOUT_CAP) + '…';
  }
  return null;
}
