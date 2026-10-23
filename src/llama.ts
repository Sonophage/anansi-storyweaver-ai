// llama-server client. Everything the engine needs from the outside world lives here,
// so buildContext itself stays pure.

import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const HOST = process.env.ANANSI_LLAMA ?? 'http://127.0.0.1:8080';
// The DEFAULT model, for a story that names none. Every call already carried a model name — the
// only reason switching was process-wide is that this one variable answered for everybody.
//
// A story can now name its own (`stories.model`), and the router is configured for it: the
// service runs `--models-max 3 --models-autoload`, and F22 measured the three writing presets at
// 86,349 MiB of 98,304 at full context, so a switch between them usually costs nothing. A story
// naming a model that is asleep pays one load on its first call.
// Renamed on the router 2026-08-27 — the whole preset list was rewritten and `write-nt-qwen36-h`
// stopped existing, so every call answered `400 model not found` until this changed. ANANSI_MODEL
// still wins; this is only what a box with nothing set falls back to.
let MODEL = process.env.ANANSI_MODEL ?? 'Qwen3.6-WNTH-35B-A3B-NN';

/** Which model a call should use: the story's own, or the default.
 *
 *  Synchronous, so it cannot ask the router anything. A local id must pass the allowlist; a remote
 *  id must pass `remoteOk`, which the caller supplies because only it knows the shortlists and
 *  whether a key is set. An id that fails falls through: the pin to the default, the default to
 *  MODEL. Whether the router actually serves a local id is checked when the story is SAVED
 *  (`POST /api/story`), so a stored value was real at the time it was chosen. A model retired from
 *  presets.ini afterwards will fail at generation with the router's own message, which names it. */
export const modelFor = (story?: { model?: string | null } | null, dflt?: string | null,
                         remoteOk: (id: string, pinned: boolean) => boolean = () => false): string => {
  // THE ALLOWLIST GOVERNS LOCAL MODELS ONLY. A remote id is allowed when the caller says it is on
  // the right writer's shortlist and a key is configured — this module cannot know either, so the
  // question is handed in. `pinned` says whose shortlist: a book's pin is checked against the
  // book's OWNER, a default against the writer asking. The default answer is no, so a caller that
  // forgets to ask gets the local default and never a remote model nobody chose.
  const fits = (id: string, pinned: boolean) => isRemote(id) ? remoteOk(id, pinned) : allowed(id);
  return story?.model && fits(story.model, true) ? story.model
    : (dflt && fits(dflt, false) ? dflt : MODEL);
};

/* ---- REMOTE MODELS: one adapter, Featherless only (docs/adr/0001) ----
 *
 * A remote id is the Featherless id behind a fixed prefix that no local preset uses, and it is
 * stored that way everywhere — writer default, book pin, generation row — so the prefix alone
 * decides where a call goes. Local ids go to the router exactly as before.
 *
 * NEVER A FALLBACK. A remote call that fails reports why; nothing here retries it on another
 * model, because a passage written by a model the writer did not choose is the one failure a
 * writer cannot see. */
export const REMOTE_PREFIX = 'featherless:';
export const isRemote = (id?: string | null): boolean => !!id && id.startsWith(REMOTE_PREFIX);
const remoteName = (id: string) => id.slice(REMOTE_PREFIX.length);

/** The base URL, `/v1` included. An env var so the test suite can point it at a fake. */
export const FEATHERLESS = (process.env.ANANSI_FEATHERLESS_URL ?? 'https://api.featherless.ai/v1')
  .replace(/\/+$/, '');
/** EVERY FEATHERLESS REQUEST NAMES ITSELF. Measured 2026-10-22 against the live API: the catalogue
 *  answers Node's default `fetch` User-Agent ("node") with a 404 and anything that names itself
 *  with a 200. Every fake passed without it, because no fake looked at the header. */
export const FEATHERLESS_AGENT = { 'User-Agent': 'Anansi' };
/** THE KEY LIVES IN A FILE, never in the repo or the database, and is read on each call rather than
 *  once at boot: a key added or rotated while the server runs is picked up without a restart, and
 *  a box with no file simply has no remote models — not an error at boot. */
const KEY_FILE = process.env.ANANSI_FEATHERLESS_KEY_FILE
  ?? `${process.env.HOME ?? ''}/.config/anansi/featherless.key`;
const featherlessKey = (): string | null => {
  try { return readFileSync(KEY_FILE, 'utf8').trim() || null; } catch { return null; }
};
export const remoteReady = () => !!featherlessKey();
/** Whatever Featherless says goes through this before it can reach a toast, a log line or a
 *  generation row. Its own error text has no reason to carry the key; this is the floor for the
 *  day it does. */
const redact = (s: string) => {
  const k = featherlessKey();
  return k ? s.split(k).join('[key]') : s;
};

/** WHAT FEATHERLESS DOCUMENTS, and nothing else goes. The writer's sampler carries llama.cpp-only
 *  keys — `dry_multiplier`, `xtc_probability` — and app-only ones like `target_words`; a key a
 *  provider does not know is at best ignored and at worst a 400 on every passage. `text` is the
 *  tokenize body's one field. */
const DOCUMENTED = new Set(['model', 'messages', 'text', 'temperature', 'top_p', 'top_k', 'min_p',
  'presence_penalty', 'frequency_penalty', 'repetition_penalty', 'stop', 'max_tokens', 'seed',
  'stream', 'stream_options', 'chat_template_kwargs', 'response_format']);

/** THE 429 RETRY. One key serves both writers, so they share one plan's units, and Featherless
 *  refuses with 429 when a call would go over. Two writers colliding for a moment is the common
 *  case, so three retries across about twenty seconds, then the writer is told plainly. The env
 *  var exists only so the test suite can shrink the wait. */
const BACKOFF = (process.env.ANANSI_FEATHERLESS_BACKOFF_MS ?? '2000,6000,12000')
  .split(',').map(Number).filter((n) => n >= 0);
const FEATHERLESS_BUSY = 'Featherless is busy, try again';
/** #64 · AT CAPACITY, SAID INSIDE A STREAM. Featherless can answer 200, open the stream, and then
 *  send an `error` object whose message is "<model> is temporarily at capacity. Please try again
 *  shortly." (Kia, 2026-10-22 20:23 and 20:24). Only the message was seen, so the message is what
 *  is matched; the up-front 503's code is taken too, in case the stream ever carries it. */
const atCapacity = (e: any) => e?.code === 'capacity_exhausted' || /\bat capacity\b/i.test(String(e?.message ?? ''));
const FEATHERLESS_LATE = 'Featherless did not answer in time. A model it is loading can take a '
  + 'minute — try again.';

/** The wait between tries, cut short by the writer pressing Stop. Stopped, it rejects with an
 *  AbortError, and a caller checks only that name. The call's ceiling can end the same wait, and
 *  that is not a stop: it says Featherless ran out of time, as a ceiling during the request does. */
const pause = (ms: number, signal?: AbortSignal) => sleep(ms, undefined, { signal }).catch((e) => {
  if (signal?.reason?.name === 'TimeoutError') throw new Error(FEATHERLESS_LATE);
  throw e;
});

/** #61 · WHETHER A REMOTE MODEL'S CHAT TEMPLATE TAKES THE WEAVING SWITCH, as the probe on add found
 *  and the shortlist stored. Some refuse it outright: Featherless answered
 *  `vprilepskii/Harbinger-24B-biprojected-norm-preserving-abliterated` with a 400 ("The request was
 *  rejected as invalid") for any body carrying `chat_template_kwargs` — `enable_thinking: false`,
 *  `thinking: false`, even `{}` — and a normal completion without it (seen live 2026-10-22). This
 *  module cannot read the shortlist (db.ts imports it), so whoever can hands the question in, as
 *  `modelFor`'s caller does. Unasked, every model takes it: what was sent before this existed. */
let takesSwitch: (id: string) => boolean = () => true;
export const askSwitchWith = (fn: (id: string) => boolean) => { takesSwitch = fn; };

/** One POST to Featherless, with the key, retried on 429 and at capacity, and on nothing else.
 *
 *  THE FIELD IS LEFT OFF HERE, for every call to a model whose template refuses it: a passage,
 *  Talk, an invention and every other call that follows the book's model, whichever of them set it
 *  and whichever left it to `chat`'s default. Decided from the stored fact, never by sending it and
 *  seeing. `weaveSwitch` (never sent) overrides the fact for the probe, which is how it learns it. */
async function featherless(path: string, body: Record<string, any>, signal?: AbortSignal,
                           first = 0): Promise<Response & { attempt: number }> {
  const key = featherlessKey();
  if (!key) throw new Error("Featherless isn't set up on this server — there is no key file");
  const payload = Object.fromEntries(Object.entries(body).filter(([k]) => DOCUMENTED.has(k)));
  payload.model = remoteName(String(body.model));
  if (!(body.weaveSwitch ?? takesSwitch(String(body.model)))) delete payload.chat_template_kwargs;
  // `first` and the `attempt` on the answer let a caller that finds capacity INSIDE the stream go on
  // with the same schedule rather than start a fresh one (#64).
  for (let attempt = first; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(FEATHERLESS + path, { method: 'POST', signal, body: JSON.stringify(payload),
        headers: { ...FEATHERLESS_AGENT, 'Content-Type': 'application/json', Authorization: `Bearer ${key}` } });
    } catch (e: any) {
      if (e?.name === 'TimeoutError') throw new Error(FEATHERLESS_LATE);
      if (e?.name === 'AbortError') throw new Error('the call was cancelled');
      throw new Error('cannot reach Featherless. This machine may be offline.');
    }
    if (res.ok) return Object.assign(res, { attempt });
    // AT CAPACITY IS BUSY TOO. Featherless says a model is full with a 503 whose body carries
    // `capacity_exhausted` (seen live 2026-10-22 on two models). It passes in moments, as a 429
    // does, so it waits on the same schedule and ends in the same words. Any other 503 is not it.
    let error: any = null;
    if (res.status === 429) await res.body?.cancel().catch(() => {});
    else try { error = JSON.parse(await res.text())?.error; } catch { /* unreadable, or not JSON */ }
    if (res.status === 429 || (res.status === 503 && error?.code === 'capacity_exhausted')) {
      if (attempt < BACKOFF.length) { await pause(BACKOFF[attempt], signal); continue; }
      throw new Error(FEATHERLESS_BUSY);
    }
    // ITS MESSAGE, NOT ITS BODY. The status and what Featherless says went wrong, redacted and
    // bounded; the raw body is never echoed to a writer.
    const said = String(error?.message ?? '');
    // The status rides on the error, so the probe on add can tell a refusal from a failure.
    throw Object.assign(new Error(`Featherless answered ${res.status}${said ? `: ${redact(said).slice(0, 200)}` : ''}`),
      { status: res.status });
  }
}

/** `fetch`, with a message that says which thing is unreachable and what to do about it.
 *
 *  Node's own is `fetch failed`, and that string went all the way to a toast in the composer.
 *  The router sleeps after 15 minutes (`--sleep-idle-seconds 900`), so a call failing at all is
 *  most often the writer coming back to a machine that has put the model away — which is the one
 *  case where "fetch failed" is both the likeliest message and the least useful one. */
export async function reach(url: string, init: RequestInit): Promise<Response> {
  try { return await fetch(url, init); }
  catch (e: any) {
    // AbortSignal.timeout fires TimeoutError; a caller cancelling fires AbortError. Neither
    // means the server is missing, and saying so would send someone to restart a running one.
    if (e?.name === 'TimeoutError')
      throw new Error(`llama-server at ${HOST} did not answer in time. A model that was asleep can `
        + 'take a minute to load — try again, or check Preferences.');
    if (e?.name === 'AbortError') throw new Error('the call was cancelled');
    throw new Error(`cannot reach llama-server at ${HOST}. It is not running, or it is still `
      + 'starting. Preferences → Restart it.');
  }
}

async function post(path: string, body: any, ms = 900_000): Promise<any> {
  // A remote model's call goes to Featherless, whose paths are the router's without the `/v1`.
  if (isRemote(body?.model))
    return (await featherless(path.replace(/^\/v1/, ''), body, AbortSignal.timeout(ms))).json();
  const res = await reach(HOST + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function tokenize(content: string, model = MODEL): Promise<number[]> {
  return (await post('/tokenize', { model, content })).tokens;
}

/** The exact count, from whichever server will run the prompt. Featherless takes `{model, text}`
 *  and answers `{count}` rather than the router's token list (probed 2026-10-21), so the number
 *  means the same either way and the budget guard in `generate` runs before a remote call too. */
export async function count(content: string, model = MODEL): Promise<number> {
  if (isRemote(model))
    return Number((await (await featherless('/tokenize', { model, text: content },
      AbortSignal.timeout(120_000))).json()).count);
  return (await tokenize(content, model)).length;
}

/** Per-slot context. NOT what /props reports directly.
 *
 *  Measured on build b10485: `default_generation_settings.n_ctx` is the GLOBAL value
 *  (100096) and top-level `n_ctx` is absent, while `total_slots` is 4. So the real
 *  per-slot ceiling is n_ctx / total_slots = 25024, and any plan that trusts the
 *  reported number budgets 4x what it has. */
export async function slotContext(): Promise<{ global: number; slots: number; perSlot: number }> {
  const res = await reach(`${HOST}/props?model=${encodeURIComponent(MODEL)}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`/props answered ${res.status}`);
  const p = await res.json();
  const global = p?.default_generation_settings?.n_ctx ?? p?.n_ctx ?? 0;
  const slots = p?.total_slots ?? 0;
  // A router with no model loaded answers with nulls. Defaulting those to zero produced a
  // NEGATIVE budget and every generation refused for the life of the process — and
  // bench/overflow.log records exactly that response against this endpoint.
  if (!global || !slots) throw new Error('/props gave no usable context size');
  // Dividing looks like it wastes half the machine and it does not. kv_unified is on, so the
  // cache is ONE shared pool: a single request really can draw the whole 100,096 — measured,
  // a 71,423-token prompt generates fine. But the pool is shared, and oversubscribing it does
  // not queue or degrade. Two concurrent 71k requests both died on HTTP 500 "Context size has
  // been exceeded" after 150 seconds — the second request does not wait its turn, it takes the
  // first one down with it. Two tenants over Tailscale is the whole deployment, so the budget
  // has to hold when both write at once. global/slots minus budgetFor's reserve is what makes
  // that true. Raise this only if you also make concurrent generation impossible.
  return { global, slots, perSlot: Math.floor(global / slots) };
}

/** THE SLOT SIZE, ASKED UNTIL IT IS ANSWERED — not once at boot and then believed forever.
 *
 *  WHAT THIS COST, 2026-09-11. `serve.ts` read `slotContext()` once before it listened and fell
 *  back to `perSlot: 8192` when it threw. It throws whenever the router has the model asleep, which
 *  is any boot after a quiet stretch — and the fallback then stood for the LIFE OF THE PROCESS.
 *  One such boot ran for 33 hours on 8,192, so `budgetFor` handed every book 6,245 tokens instead
 *  of 45,590 and a writer was refused with *"over budget by 1015 tokens"* naming `SPINE` as what
 *  would be dropped. Nothing was wrong with the book; it had a seventh of the room it should have
 *  had, and nothing anywhere said so. The boot banner printed the wrong number too.
 *
 *  ASKED AGAIN ON DEMAND, NOT ON A TIMER. The number matters at the moment a prompt is built, and a
 *  request is the only evidence anybody wants one. A timer would wake a sleeping model to ask it a
 *  question nobody is waiting on — and `/props` does load the model, which is F13's shared cache
 *  and 26 GiB of it.
 *
 *  IT DOES NOT BLOCK THE REQUEST THAT TRIGGERS IT. `/props` waits up to 30 seconds and loads a
 *  sleeping model; awaiting that on a page load trades a silent wrong number for a visible
 *  half-minute hang, which is the worse of the two. So the asking request answers with what is
 *  known and the next one gets the truth — in practice the shelf and the book-open that come before
 *  any Continue are more than enough, and the floor is one retryable refusal rather than 33 hours.
 *
 *  ONCE IT ANSWERS IT IS FIXED. A router does not change its context size under a running model,
 *  so a successful read is never repeated; only the fallback keeps asking, and only every
 *  `SLOT_RETRY_MS`, or a router that is down is asked once per request for 30 seconds each.
 *
 *  `ask` and `now` are parameters ONLY so `test/engine.ts` can drive this without a router. */
export const SLOT_FALLBACK = { global: 0, slots: 1, perSlot: 8192 };
export const SLOT_RETRY_MS = 60_000;
let known: { global: number; slots: number; perSlot: number } = SLOT_FALLBACK;
let askedAt = -Infinity;
/** Whether the number below was ever actually read off the router, as opposed to being the floor
 *  we assume when it will not say. The boot banner says which, so a server running on the fallback
 *  is visible in the journal instead of being a number nobody questions. */
export const slotIsKnown = () => known !== SLOT_FALLBACK;

/** THE ONLY PLACE `known` IS WRITTEN, and that is deliberate: boot and the retry are two callers of
 *  one assignment rather than two copies of it. A failure leaves the fallback standing, which is
 *  what every caller already handles. */
async function readSlot(ask: () => Promise<typeof known>) {
  try { known = await ask(); }
  catch { /* asleep, or down. The fallback is the honest answer until it is not. */ }
  return known;
}

/** Boot. Waited on, because nothing is listening yet and the banner is about to make a claim. */
export const slotFirstRead = (ask: () => Promise<typeof known> = slotContext) => {
  askedAt = Date.now();
  return readSlot(ask);
};

/** Every request after. Returns what is known and, while that is still the fallback, asks again in
 *  the background — see the header for why it does not block the caller. */
export function slotNow(ask: () => Promise<typeof known> = slotContext, now = Date.now()) {
  if (known === SLOT_FALLBACK && now - askedAt >= SLOT_RETRY_MS) {
    askedAt = now;
    void readSlot(ask).then(() => {
      if (slotIsKnown())
        console.log(`  context       ${known.global} / ${known.slots} slots = ${known.perSlot} per `
          + 'slot (read late — the model was asleep when the server started)');
    });
  }
  return known;
}

/** For the test only: forget what was read, so a case can start from the fallback. */
export const forgetSlot = () => { known = SLOT_FALLBACK; askedAt = -Infinity; };

/** Prose transport.
 *
 *  MEASURED, not assumed. PLAN-02 §3 locked raw `/completion` on the anti-refusal
 *  argument. Against this model that is wrong: it is a reasoning model served with
 *  --jinja, so raw completion skips the chat template, continues the document instead
 *  of answering, and emits its reasoning inline. `/apply-template` -> `/completion` is
 *  worse: the reasoning arrives as plain prose ("Here's a thinking process:") with no
 *  tag to strip. Only `/v1/chat/completions` has the server parse reasoning into a
 *  separate `reasoning_content` field, which is the difference between strippable and
 *  not. See bench/transports.ts and docs/findings/P0-FINDINGS.md.
 *
 *  Cost: no raw buffer control, so DIRECTIVE-at-depth is bounded by the template.
 *  Revisit if a non-reasoning model is chosen. */
/** Read one llama-server SSE body, handing each delta to `onDelta` as it lands.
 *
 *  Exported for `test/stream.ts`, which drives it from a fake server: a `data:` line split
 *  across two network reads is the classic way a hand-written SSE reader loses a token, and
 *  that case cannot be produced by asking the real model nicely. */
export async function readSSE(res: Response, onDelta: (d: string) => void, cap = Infinity) {
  const out = { prose: '', reasoning: '', usage: {} as any, timings: {} as any, finish: '' };
  const reader = res.body!.getReader();
  let chunks = 0;
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    // Only whole lines. Half a `data:` frame is not JSON, and the rest of it is in the next read.
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let o: any;
      try { o = JSON.parse(payload); } catch { continue; }
      // llama-server reports a mid-stream failure in-band, after a 200. Silently returning the
      // prose written so far would present a truncated passage as a finished one.
      // The code rides on the error, so a caller can tell "at capacity" from any other failure.
      if (o.error) throw Object.assign(new Error(o.error.message ?? JSON.stringify(o.error)),
        { code: o.error.code });
      const d = o.choices?.[0]?.delta ?? {};
      // #62 · PAST THE CAP, THE STREAM IS OVER, and it ends the way the server ending it at the cap
      // would have: `length`, which `generate` already trims to the last sentence and flags as cut.
      // Cancelling the body closes the connection, so the far end stops writing too. Counted in
      // content chunks, one per token as a streaming server sends them: the stream carries no
      // running token count, and `usage` arrives only at the end, too late to stop anything. A
      // server that packs several tokens into one chunk is stopped later than the cap, never
      // sooner, so a take that ends on its own under the cap is never cut by this.
      if (d.content && ++chunks > cap) {
        out.finish = 'length';
        await reader.cancel().catch(() => {});
        return { ...out, prose: out.prose.trim() };
      }
      if (d.content) { out.prose += d.content; onDelta(d.content); }
      // The plan, under either name: llama-server says `reasoning_content`, Featherless `reasoning`.
      const plan = d.reasoning_content ?? d.reasoning;
      if (plan) out.reasoning += plan;
      // Both ride on the final chunk, and only when stream_options asked for usage.
      if (o.usage) out.usage = o.usage;
      if (o.timings) out.timings = o.timings;
      // WHY THE PASSAGE ENDED, which nothing in this app read until 2026-08-30 — so a take the
      // ceiling cut off mid-word and a take the model finished arrived on the page identical.
      // Not on the same chunk as usage: `finish_reason` lands on the last CONTENT chunk, and the
      // usage-only chunk after it carries `choices: []`. Taken whenever it appears.
      if (o.choices?.[0]?.finish_reason) out.finish = o.choices[0].finish_reason;
    }
  }
  return { ...out, prose: out.prose.trim() };
}

/** `onDelta` turns the same call into a stream. Everything else — the model, the sampler,
 *  thinking off by default, the return shape — is identical, so `generate` has one code path and
 *  the caller decides whether the writer is watched or waited for. */
export async function chat(system: string, body: string, opts: Record<string, unknown> = {},
                           onDelta?: (d: string) => void, stop?: AbortSignal, ceilingMs = 900_000) {
  if (onDelta) {
    const payload: Record<string, any> = {
      model: MODEL, temperature: 0.85, top_p: 0.95, max_tokens: 900,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: system }, { role: 'user', content: body }],
      ...opts,
      // Last, so no caller can turn streaming off while asking for deltas. include_usage is
      // what puts the token counts on the final chunk; without it logGeneration records nulls.
      stream: true, stream_options: { include_usage: true },
    };
    // The timeout is the ceiling; `stop` is the writer pressing Stop. Either one ends the call,
    // and `any` is what lets the second exist WITHOUT giving up the first. Writing this as
    // `stop ?? timeout` also stops on Stop, passes an obvious test, and quietly removes the
    // ceiling from every generation a writer is watching — which is all of them.
    //
    // `ceilingMs` is a parameter for exactly one reason: without it the ceiling cannot be
    // tested, because nothing is going to wait fifteen minutes to find out it is gone. No
    // caller passes it but the check in test/stream.ts.
    const signal = stop ? AbortSignal.any([AbortSignal.timeout(ceilingMs), stop])
                        : AbortSignal.timeout(ceilingMs);
    const remote = isRemote(payload.model);
    const on = String(payload.model);
    // #64 · AT CAPACITY BEFORE THE FIRST WORD IS TRIED AGAIN, on the schedule the 503 uses and
    // sharing its tries, so a mix of the two still ends in the same words after the same four calls.
    // After a word has reached the page it is a failure like any other mid-stream one: a passage
    // is never silently restarted under the writer's eyes. Only a remote call loops.
    for (let tries = 0; ; tries++) {
      const res = remote ? await featherless('/chat/completions', payload, signal, tries)
        : await reach(HOST + '/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), signal });
      if (!res.ok) throw new Error(`/v1/chat/completions ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (remote) tries = (res as any).attempt;
      let wrote = false;
      enter(on);
      // The cap is Anansi's to keep only on a remote call: Featherless was seen running past it
      // (#62), and the local router honours it itself, so a local stream is read to its end.
      try {
        return await readSSE(res, (d) => { wrote = true; onDelta(d); },
          remote ? Number(payload.max_tokens) || 900 : Infinity);
      } catch (e: any) {
        if (!remote || e?.name === 'AbortError' || stop?.aborted) throw e;
        if (!wrote && atCapacity(e)) {
          if (tries < BACKOFF.length) { await pause(BACKOFF[tries], signal); continue; }
          throw new Error(FEATHERLESS_BUSY);
        }
        // A remote stream that fails after the 200 is still Featherless talking: its words are
        // redacted like any other answer of its, and the take fails rather than landing half-written.
        throw new Error(`Featherless stopped mid-passage: ${redact(String(e?.message ?? e)).slice(0, 200)}`);
      } finally { leave(on); }
    }
  }
  const r = await post('/v1/chat/completions', {
    model: MODEL, temperature: 0.85, top_p: 0.95, max_tokens: 900,
    // Chain-of-thought off. MEASURED: with thinking on, this model spent the entire
    // 900-token budget reasoning and returned zero prose on 3 of 4 runs (3.5k chars of
    // reasoning, nothing else), at 15s. Off: 5.9s, zero reasoning, 1292 chars of prose.
    // `reasoning_budget: 0` and a `/no_think` suffix both fail silently on this build —
    // only the template kwarg works. A prose engine has no use for visible CoT, so this is the
    // default; a weaving call turns it on through `opts`, which is spread last, with the plan's
    // room added to its cap (F60), and the plan is never shown.
    chat_template_kwargs: { enable_thinking: false },
    messages: [{ role: 'system', content: system }, { role: 'user', content: body }],
    ...opts,
  });
  const m = r.choices?.[0]?.message ?? {};
  return {
    prose: (m.content ?? '').trim(),
    reasoning: m.reasoning_content ?? m.reasoning ?? '',   // the plan under either name, as in readSSE
    usage: r.usage ?? {},
    timings: r.timings ?? {},
    // Same field, same meaning, on the path with no writer watching. Both paths return it or
    // `generate` would trim a streamed take and silently keep a waited-for one truncated.
    finish: r.choices?.[0]?.finish_reason ?? '',
  };
}

/** Structured roles. json_schema compiles to a grammar server-side, and the sampler is
 *  pinned low: a prose temperature under a tight grammar walks low-probability legal paths
 *  and produces valid JSON that says nothing. */
export async function structured(system: string, body: string, schema: unknown, opts = {}) {
  const r = await post('/v1/chat/completions', {
    model: MODEL, temperature: 0.2, top_p: 0.9, max_tokens: 1200,
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: { name: 'out', schema, strict: true } },
    messages: [{ role: 'system', content: system }, { role: 'user', content: body }],
    ...opts,
  });
  const m = r.choices?.[0]?.message ?? {};
  const txt = m.content ?? '{}';
  // The usage and the plan ride back with the answer, so a weaving caller can record the plan's
  // LENGTH. The plan text goes no further than that caller: it is never shown and never stored.
  const said = { usage: r.usage ?? {}, reasoning: m.reasoning_content ?? m.reasoning ?? '' };
  try { return { data: JSON.parse(txt), raw: txt, ...said }; }
  catch { return { data: null, raw: txt, error: 'model returned unparseable JSON', ...said }; }
}

/** One retry, for the failure a grammar cannot prevent.
 *
 *  A grammar constrains the token stream; it does not guarantee termination. Running into
 *  max_tokens mid-object yields truncated, unparseable JSON — a mechanical failure, and
 *  exactly the case a retry fixes. This was dropped on the argument that retries only
 *  address semantic failure, and the first real check call hit it. */
/** `usable` is what "it worked" means for a caller that needs more than parseable JSON.
 *
 *  A constrained decode cannot return the wrong SHAPE, which is why this only retried on a parse
 *  failure. It can still return an empty one: JSON Schema's `required` means the key is PRESENT,
 *  not that it holds anything, so `{"title": "The Iron Bridge", "note": ""}` satisfies
 *  CHAPTER_SCHEMA completely. That reached a writer on 2026-08-28 as a named chapter with a blank
 *  beat and a toast saying Anansi had suggested one — `test/ui/ritual.js` caught it, and only
 *  because it asserts a LENGTH rather than the field's presence.
 *
 *  Optional, and the default is exactly the old behaviour, so no other caller changes: an empty
 *  string is a legitimate answer in most of these schemas and a retry costs ~7s. */
export async function structuredRetry(system: string, body: string, schema: unknown, opts = {},
                                      usable?: (d: any) => boolean) {
  const good = (r: any) => !!r.data && (!usable || usable(r.data));
  const first = await structured(system, body, schema, opts);
  if (good(first)) return first;
  // Double what was asked, never a flat 2000: the failure being retried is an object that ran out
  // of room, so a caller who already asked for more than 2000 would have been retried with LESS
  // and the retry could only fail harder. Callers that name no budget keep the old number.
  const asked = Number((opts as any).max_tokens) || 1000;
  // A WEAVING CALL IS RETRIED AT THE SAME CAP, WEAVING OFF. Its cap already carries the plan's room,
  // and its prompt was budgeted against exactly that cap: doubled, Talk's 7,400 becomes 14,800 and
  // the slot is oversubscribed, which this server answers with a 500 to every writer sharing it.
  // What ran out of room was most likely the plan (F23), so the retry makes none and the whole cap
  // goes to the answer. The plan that WAS made is what the row records, so its length is kept.
  const weaving = (opts as any).chat_template_kwargs?.enable_thinking === true;
  const tried = await structured(system, body, schema, weaving
    ? { ...opts, temperature: 0.1, chat_template_kwargs: { enable_thinking: false } }
    : { ...opts, max_tokens: Math.max(2000, asked * 2), temperature: 0.1 });
  const again = weaving ? { ...tried, usage: first.usage, reasoning: first.reasoning, retried: true } : tried;
  // A second empty answer is reported as empty rather than as a parse failure. The caller asked
  // for something specific and did not get it twice; saying "unparseable" would send whoever
  // reads the error looking at the wrong thing.
  if (usable && again.data && !usable(again.data))
    return { ...again, error: 'the model answered twice with a field this call cannot use' };
  return again;
}

/** The active model. A getter, not a const — a const captured the value at import and every
 *  caller would have kept reporting the model the server booted with. */
export const model = () => MODEL;

/** Models the router will serve, with whether each is resident. */
/** The allowlist. The router serves everything in presets.ini — coding models, vision models,
 *  a 27B thinker — and most of them have no business writing fiction. ANANSI_MODELS is a
 *  comma-separated list of ids or prefixes; unset means every model the router offers.
 *
 *  It is an env var rather than a setting in the database on purpose: "which models may this app
 *  use" is an operator's decision about the box, and a writer who could edit it in Preferences
 *  could edit it back. Set it beside ANANSI_PORT when you start the server. */
const ALLOW = (process.env.ANANSI_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const allowed = (id: string) =>
  !ALLOW.length || ALLOW.some((a) => id === a || (a.endsWith('*') && id.startsWith(a.slice(0, -1))));
export const allowList = () => [...ALLOW];

/** How many generations are in flight, per model. The unload policy needs it: pulling a model out
 *  from under a call in progress is the one mistake here that reaches somebody's prose.
 *
 *  Incremented and decremented around the streaming and non-streaming chat calls only. Structured
 *  roles are not counted — they are short, and a summary re-run is cheap where a lost passage is
 *  not, so counting them would only ever refuse a release that was safe. */
const inFlight = new Map<string, number>();
export const busyOn = (id: string) => inFlight.get(id) ?? 0;
const enter = (id: string) => inFlight.set(id, busyOn(id) + 1);
const leave = (id: string) => {
  const n = busyOn(id) - 1;
  if (n > 0) inFlight.set(id, n); else inFlight.delete(id);
};

/** Whether the model a writer has just switched AWAY from can be released now.
 *
 *  Pure, and separate from the call that does it, because every clause here is a way to take a
 *  model out from under somebody and none of them is obvious from the request that triggers it.
 *  The router holds three (`--models-max 3`) and sleeps them at 900 seconds on its own, so the
 *  only thing this buys is immediacy — which means a wrong answer costs more than it saves.
 *
 *    bootDefault   — every writer with no choice of their own falls back to it
 *    otherDefaults — what the OTHER writers are currently set to
 *    storiesOnIt   — any book pinned to it, whoever owns it: `modelFor` puts the story first
 *    busy          — a generation in flight on it
 */
export function releasable(previous: string, o: {
  active: string; bootDefault: string | null; otherDefaults: string[];
  storiesOnIt: number; busy: number;
}): { ok: boolean; why: string } {
  if (!previous || previous === o.active) return { ok: false, why: 'not a switch' };
  if (previous === o.bootDefault) return { ok: false, why: 'it is the fallback for every writer' };
  if (o.otherDefaults.includes(previous)) return { ok: false, why: 'another writer is on it' };
  if (o.storiesOnIt > 0) return { ok: false, why: `${o.storiesOnIt} book(s) name it` };
  if (o.busy > 0) return { ok: false, why: 'a generation is running on it' };
  return { ok: true, why: 'nothing else is using it' };
}

/** Give the VRAM back now rather than at `--sleep-idle-seconds`.
 *
 *  MEASURED 2026-08-27 on build b10566: `POST /models/unload` with `{model}` exists and answers
 *  400 "model is not found" for an id it does not serve. `libllama-server-impl.so` carries
 *  `/models/load` and `/models/unload` in its route table. The comment that used to be here said
 *  the router had no unload endpoint, and the Preferences screen said so too; both were written
 *  against an older build and were wrong by the time anybody read them.
 *
 *  Never throws. A release that fails is a model that sleeps in 900 seconds instead, which is
 *  what happened before this existed — so it is not worth failing a writer's model switch over. */
export async function unload(id: string): Promise<{ ok: boolean; error?: string }> {
  // The floor, whatever the caller: a remote model was never loaded here.
  if (isRemote(id)) return { ok: false, error: 'a remote model is not loaded on this machine' };
  try {
    const r = await reach(`${HOST}/models/unload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: id }), signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e?.message ?? String(e) }; }
}

/** Release the models, or bring the router back.
 *
 *  Per MODEL, use `unload` above. This stops the whole unit, which is what you want before running
 *  something else on the GPU: it takes every model down at once and does not come back on its own.
 *
 *  It is a `--user` unit, so no privilege escalation is involved. The command is a fixed list with
 *  the unit name hardcoded — nothing from a request reaches a shell, and `execFile` takes an
 *  argument array rather than a command line, so there is no shell to reach.
 *
 *  Gated in routes.ts. The server no longer binds to loopback only, so the gate is the whole of
 *  it — see routes.ts on why an ownership check is not the same as an admin check. */
const UNIT = process.env.ANANSI_LLAMA_UNIT ?? 'llama-router.service';
export async function router(action: 'stop' | 'start' | 'restart' | 'status') {
  const { execFile } = await import('node:child_process');
  const run = (args: string[]) => new Promise<{ out: string; code: number }>((res) => {
    execFile('systemctl', args, { timeout: 20_000 },
      (err: any, stdout: string, stderr: string) =>
        res({ out: (stdout || stderr || '').trim(), code: err?.code ?? 0 }));
  });
  if (action === 'status') {
    const a = await run(['--user', 'is-active', UNIT]);
    const t = await run(['--user', 'show', UNIT, '-p', 'ExecMainStartTimestamp', '--value']);
    return { unit: UNIT, state: a.out || 'unknown', since: t.out || null };
  }
  const r = await run(['--user', action, UNIT]);
  const a = await run(['--user', 'is-active', UNIT]);
  return { unit: UNIT, action, state: a.out || 'unknown', ok: r.code === 0,
           message: r.out || null };
}

export async function models(): Promise<{ id: string; status: string }[]> {
  const r = await reach(`${HOST}/v1/models`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`/v1/models answered ${r.status}`);
  const d = await r.json() as any;
  const all = (d.data ?? []).map((m: any) => ({ id: String(m.id), status: m.status?.value ?? 'unknown' }))
    .filter((m: any) => allowed(m.id));
  // `-NN` FIRST, at Seth's direction. It is his tag on the presets, not anything this app knows
  // about — so it is a sort key and nothing else: if it stops meaning something the list simply
  // falls back to alphabetical, which is what the rest of it already is. The router answers in
  // its own order, which is neither.
  const nn = (id: string) => /(^|[-_.])NN($|[-_.:])/i.test(id);
  return all.sort((a: any, b: any) =>
    (nn(b.id) ? 1 : 0) - (nn(a.id) ? 1 : 0) || a.id.localeCompare(b.id));
}

/** Is this a model a client may name? Refuses anything the router does not list, so a client
 *  cannot point the engine at an arbitrary string. Returns the id so callers read as an
 *  assignment. */
export async function checkModel(id: string): Promise<string> {
  // `models()` is already filtered, so this refuses anything off the allowlist as well as
  // anything the router does not serve — one check, and the two failures read differently.
  if (!allowed(id)) throw new Error(`"${id}" is not on this app's model allowlist`);
  const known = await models();
  if (!known.some((m) => m.id === id)) throw new Error(`the router does not serve "${id}"`);
  return id;
}

/** Switch the model this PROCESS falls back to when neither the writer nor the story names one.
 *  Not what `POST /api/model` calls any more — one writer's choice must not land on the other's
 *  prose. Kept for a caller that genuinely means the boot default. */
export async function setModel(id: string): Promise<string> {
  MODEL = await checkModel(id);
  return MODEL;
}

// ---- Fetch: the one outbound request this app makes ----

/** OFF unless configured. `ANANSI_SEARCH` is a URL template with `{q}` in it, pointing at
 *  whatever you trust — your own SearXNG, a public one, any JSON search endpoint. No third party
 *  is chosen for you, and with it unset the app makes no outbound request at all, which is what
 *  local-first has meant here until now.
 *
 *      ANANSI_SEARCH='http://127.0.0.1:8888/search?q={q}&format=json'
 *
 *  What comes back is a stranger's text. It reaches the model only as SOURCE MATERIAL to propose
 *  entries from, never as instructions, and every proposal carries the URL it came from —
 *  `src/import.ts` learned that lesson on character cards and it applies harder to a web page. */
export const searchConfigured = () => !!process.env.ANANSI_SEARCH;

/** An http(s) URL, or undefined. Not a validator of anything else: it exists so an image row cannot
 *  carry a `data:` or `file:` URL into the surface, where it would be offered as something to fetch. */
const httpish = (u: unknown): string | undefined => {
  const s = String(u ?? '');
  return /^https?:\/\//i.test(s) ? s : undefined;
};

export type Found = { title: string; url: string; text: string; img?: string; thumb?: string };

/** `kind` is 'text' by default and every existing caller passes nothing, so they are unchanged.
 *
 *  IMAGES ARE THE SAME ENDPOINT WITH A CATEGORY, not a second integration. SearXNG answers
 *  `&categories=images` with the same envelope plus `img_src`, `thumbnail_src` and `resolution` —
 *  1,602 rows for one query, measured 2026-09-01 against the local instance.
 *
 *  THE CATEGORY IS APPENDED, and that assumes ANANSI_SEARCH is a query-string URL. It is, for
 *  SearXNG and for every JSON search endpoint I know of, and `{cat}` is honoured first for anything
 *  that needs it elsewhere in the URL. A template with no `?` gets the category as the first
 *  parameter rather than a broken URL.
 *
 *  ponytail: one category name, SearXNG's. Ceiling: an endpoint that calls it something else gets
 *  text results back for an image query rather than an error, because a wrong category is a filter
 *  that matched nothing and not a failure. Upgrade path is a second template variable.
 */
/** ONE SITE, ASKED FOR IN THE QUERY. Seth, 2026-09-01: *"we neeed instructions for how to search a
 *  specific site like pinterest or something for images."*
 *
 *  MEASURED BEFORE IT WAS DOCUMENTED, because the obvious answer is wrong. `site:pinterest.com` in
 *  the query DOES reach the engines and DOES change the ranking — but it does not filter. On this
 *  instance, on 2026-09-01: `site:pinterest.com gothic canal city` returned 204 rows of which 15 of
 *  the first 40 were pinterest, the rest from dreamstime, unsplash, artic and an icon CDN. SearXNG
 *  merges eight engines and only some of them honour the operator, so promising a filter in the UI
 *  would have been a promise the search does not keep.
 *
 *  So the operator is kept in the query — the engines that honour it rank better for it — AND the
 *  rows are filtered here on the way back, which is what makes the promise true. Matched on the
 *  PAGE's host, not the picture's: a pinterest result is a pinterest.com page serving an image from
 *  i.pinimg.com, and filtering on the image host would drop every one of them. */
const SITE = /\bsite:([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/i;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; } };

export async function webSearch(q: string, n = 5, kind: 'text' | 'images' = 'text',
                                skip = 0): Promise<Found[]> {
  const tpl = process.env.ANANSI_SEARCH;
  if (!tpl) throw new Error('web search is not configured — set ANANSI_SEARCH to a URL template with {q} in it');
  const only = (SITE.exec(q)?.[1] ?? '').toLowerCase();
  let url = tpl.replace('{q}', encodeURIComponent(q.slice(0, 300)));
  if (kind === 'images') {
    url = url.includes('{cat}') ? url.replace('{cat}', 'images')
      : url + (url.includes('?') ? '&' : '?') + 'categories=images';
  } else if (url.includes('{cat}')) {
    url = url.replace('{cat}', 'general');
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000),
    headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`search answered ${r.status}`);
  const d = await r.json() as any;
  // SearXNG says `results`; most others say one of these. Nothing is assumed about the shape
  // beyond "an array of things with a title, a url and some text".
  const rows: any[] = d.results ?? d.items ?? d.data ?? d.organic ?? (Array.isArray(d) ? d : []);
  /* FILTERED BEFORE IT IS SLICED, which is a correction and not a tidy-up. It sliced to `n` first
   * and filtered after, so every dropped row came out of the writer's twelve — a query answering
   * four icons and eight photographs showed eight pictures and an unexplained gap.
   *
   * `skip` IS AN OFFSET INTO THIS RANKING, not a page of the engines. Seth: "is there a way to scan
   * more images from a search like to do the next batch of images." Images answer deep — 1,615 rows
   * for one query on 2026-09-01, 275 for a narrow one — so walking the list this way costs one
   * request per press.
   *
   * IT CAN STILL REPEAT A ROW, and the caller has to expect that: each press is a fresh request and
   * eight engines do not rank identically twice. Measured on 2026-09-01, offset 0 against offset 12:
   * 1 row of 12 came back in both. So the surface dedupes on the image URL as it appends rather than
   * trusting the offset — an offset into a list that is re-ranked under you is a hint, not an index.
   *
   * ponytail: page 1 only. When a narrow query runs out the writer is told there is no more, which
   * is true of that query's first page and not of the engines. SearXNG takes `pageno` and the
   * template could carry `{page}`; do that if a real query is ever seen to run dry. */
  return rows.map((x: any) => ({
    title: String(x.title ?? x.name ?? '').slice(0, 200),
    url: String(x.url ?? x.link ?? x.href ?? ''),
    // Bounded hard. A page is a stranger's text and the budget engine is downstream of this.
    text: String(x.content ?? x.snippet ?? x.description ?? x.text ?? '').slice(0, 1200),
    // Only on an image result, and only when it is an http(s) URL — anything else is not something
    // the proxy will fetch, so carrying it would offer the writer a picture that cannot arrive.
    ...(kind === 'images' ? {
      img: httpish(x.img_src ?? x.image ?? x.thumbnail_src),
      thumb: httpish(x.thumbnail_src ?? x.thumbnail ?? x.img_src),
    } : {}),
  })).filter((x) => x.url && (x.title || x.text))
    // An image row with no picture on it is a row that cannot do the one thing it is for.
    .filter((x) => kind !== 'images' || !!x.img)
    // NOR CAN AN SVG. `POST /api/image` decides the type from the BYTES and accepts JPEG, PNG, WEBP
    // and GIF — an SVG fails that check, so an icon in the grid is a picture the writer can press
    // and only get an error from. This instance runs the `lucide` icon set as an image engine, which
    // is where they come from: 24 of one query's rows on 2026-09-01.
    .filter((x) => kind !== 'images' || !/\.svgx?(\?|$)/i.test(x.img ?? ''))
    // One site, when the query asked for one. See SITE above for why this is not left to the engines.
    .filter((x) => !only || hostOf(x.url) === only || hostOf(x.url).endsWith('.' + only))
    .slice(Math.max(0, skip), Math.max(0, skip) + n);
}
