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

/** THE PLAN IS 4 UNITS, and a model that costs 4 takes all of it: while one writer uses it the
 *  other cannot write at all. Only the admin, who pays for the plan, may choose that. A row that
 *  does not say its cost is treated as the worst case — the gate fails closed. */
const WHOLE_PLAN = 4;

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
const isUncensored = (id: string) => UNCENSORED.test(id);

/** WEAVING, as the writer reads it. The order is the sort order: a model that never plans is ready
 *  to write the moment it answers, so it comes first. */
const WEAVING = ["doesn't weave", 'can switch', 'always weaves'] as const;
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
const weavingGuess = (modelClass: string | null): Weaving =>
  GUESS.find(([re]) => re.test(modelClass ?? ''))?.[1] ?? "doesn't weave";

/** What the probe on add found. Asked with weaving off: any plan in the answer means the model
 *  cannot be switched off. No plan keeps the class guess — an absent plan from a model guessed to
 *  always weave is more likely hidden by the provider than missing. */
export const weavingFound = (modelClass: string | null, answer: { prose: string; reasoning: string }):
  Weaving => (answer.reasoning.trim() || /<think>/i.test(answer.prose)) ? 'always weaves'
    : weavingGuess(modelClass);

/** The weight in the class name — `qwen3_5moe-35b` is 35b. Null for a class that does not say. */
const sizeClass = (modelClass: string | null): string | null =>
  /-(\d+(?:\.\d+)?b)\b/i.exec(modelClass ?? '')?.[1].toLowerCase() ?? null;

export type Found = { id: string; cost: number | null; context: number; weaving: Weaving;
  size: string | null };
type Query = { text?: string; size?: string; weaving?: string; uncensored?: boolean };

/** RESULTS ARE CAPPED. 778 uncensored models is a list nobody reads; a search narrows it.
 *  ponytail: a fixed cap with no paging. Ceiling: past the first 100 a writer must type more.
 *  Revisit when a writer cannot reach a model by typing more of its name. Upgrade path is an
 *  offset in the query. */
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
