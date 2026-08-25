// llama-server client. Everything the engine needs from the outside world lives here,
// so buildContext itself stays pure.

const HOST = process.env.ANANSI_LLAMA ?? 'http://127.0.0.1:8080';
// The DEFAULT model, for a story that names none. Every call already carried a model name — the
// only reason switching was process-wide is that this one variable answered for everybody.
//
// A story can now name its own (`stories.model`), and the router is configured for it: the
// service runs `--models-max 3 --models-autoload`, and F22 measured the three writing presets at
// 86,349 MiB of 98,304 at full context, so a switch between them usually costs nothing. A story
// naming a model that is asleep pays one load on its first call.
let MODEL = process.env.ANANSI_MODEL ?? 'write-nt-qwen36-h';

/** Which model a call should use: the story's own, or the default.
 *
 *  Synchronous, so it cannot ask the router anything — it only enforces the allowlist. Whether the
 *  router actually serves the id is checked when the story is SAVED (`POST /api/story`), so a
 *  stored value was real at the time it was chosen. A model retired from presets.ini afterwards
 *  will fail at generation with the router's own message, which names it. */
export const modelFor = (story?: { model?: string | null } | null): string =>
  story?.model && allowed(story.model) ? story.model : MODEL;

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

async function post(path: string, body: unknown, ms = 900_000): Promise<any> {
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

export async function count(content: string, model = MODEL): Promise<number> {
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
export async function readSSE(res: Response, onDelta: (d: string) => void) {
  const out = { prose: '', reasoning: '', usage: {} as any, timings: {} as any };
  const reader = res.body!.getReader();
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
      if (o.error) throw new Error(o.error.message ?? JSON.stringify(o.error));
      const d = o.choices?.[0]?.delta ?? {};
      if (d.content) { out.prose += d.content; onDelta(d.content); }
      if (d.reasoning_content) out.reasoning += d.reasoning_content;
      // Both ride on the final chunk, and only when stream_options asked for usage.
      if (o.usage) out.usage = o.usage;
      if (o.timings) out.timings = o.timings;
    }
  }
  return { ...out, prose: out.prose.trim() };
}

/** `onDelta` turns the same call into a stream. Everything else — the model, the sampler,
 *  thinking off, the return shape — is identical, so `generate` has one code path and the
 *  caller decides whether the writer is watched or waited for. */
export async function chat(system: string, body: string, opts: Record<string, unknown> = {},
                           onDelta?: (d: string) => void) {
  if (onDelta) {
    const res = await reach(HOST + '/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, temperature: 0.85, top_p: 0.95, max_tokens: 900,
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: 'system', content: system }, { role: 'user', content: body }],
        ...opts,
        // Last, so no caller can turn streaming off while asking for deltas. include_usage is
        // what puts the token counts on the final chunk; without it logGeneration records nulls.
        stream: true, stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(900_000),
    });
    if (!res.ok) throw new Error(`/v1/chat/completions ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return readSSE(res, onDelta);
  }
  const r = await post('/v1/chat/completions', {
    model: MODEL, temperature: 0.85, top_p: 0.95, max_tokens: 900,
    // Chain-of-thought off. MEASURED: with thinking on, this model spent the entire
    // 900-token budget reasoning and returned zero prose on 3 of 4 runs (3.5k chars of
    // reasoning, nothing else), at 15s. Off: 5.9s, zero reasoning, 1292 chars of prose.
    // `reasoning_budget: 0` and a `/no_think` suffix both fail silently on this build —
    // only the template kwarg works. A prose engine has no use for visible CoT.
    chat_template_kwargs: { enable_thinking: false },
    messages: [{ role: 'system', content: system }, { role: 'user', content: body }],
    ...opts,
  });
  const m = r.choices?.[0]?.message ?? {};
  return {
    prose: (m.content ?? '').trim(),
    reasoning: m.reasoning_content ?? '',
    usage: r.usage ?? {},
    timings: r.timings ?? {},
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
  const txt = r.choices?.[0]?.message?.content ?? '{}';
  try { return { data: JSON.parse(txt), raw: txt }; }
  catch { return { data: null, raw: txt, error: 'model returned unparseable JSON' }; }
}

/** One retry, for the failure a grammar cannot prevent.
 *
 *  A grammar constrains the token stream; it does not guarantee termination. Running into
 *  max_tokens mid-object yields truncated, unparseable JSON — a mechanical failure, and
 *  exactly the case a retry fixes. This was dropped on the argument that retries only
 *  address semantic failure, and the first real check call hit it. */
export async function structuredRetry(system: string, body: string, schema: unknown, opts = {}) {
  const first = await structured(system, body, schema, opts);
  if (first.data) return first;
  // Double what was asked, never a flat 2000: the failure being retried is an object that ran out
  // of room, so a caller who already asked for more than 2000 would have been retried with LESS
  // and the retry could only fail harder. Callers that name no budget keep the old number.
  const asked = Number((opts as any).max_tokens) || 1000;
  return structured(system, body, schema,
    { ...opts, max_tokens: Math.max(2000, asked * 2), temperature: 0.1 });
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

/** Release the models, or bring the router back.
 *
 *  The router has no unload endpoint — it sleeps on `--sleep-idle-seconds`, 900 on this box, and
 *  that is the only automatic release. Stopping the unit is the way to get the VRAM back NOW,
 *  which is what you want before running something else on the GPU.
 *
 *  It is a `--user` unit, so no privilege escalation is involved. The command is a fixed list with
 *  the unit name hardcoded — nothing from a request reaches a shell, and `execFile` takes an
 *  argument array rather than a command line, so there is no shell to reach.
 *
 *  Gated in routes.ts, and the server binds to 127.0.0.1 only. */
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
  return (d.data ?? []).map((m: any) => ({ id: String(m.id), status: m.status?.value ?? 'unknown' }))
    .filter((m: any) => allowed(m.id));
}

/** Switch the active model. Refuses anything the router does not list, so a client cannot
 *  point the engine at an arbitrary string. */
export async function setModel(id: string): Promise<string> {
  // `models()` is already filtered, so this refuses anything off the allowlist as well as
  // anything the router does not serve — one check, and the two failures read differently.
  if (!allowed(id)) throw new Error(`"${id}" is not on this app's model allowlist`);
  const known = await models();
  if (!known.some((m) => m.id === id)) throw new Error(`the router does not serve "${id}"`);
  MODEL = id;
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

export async function webSearch(q: string, n = 5): Promise<{ title: string; url: string; text: string }[]> {
  const tpl = process.env.ANANSI_SEARCH;
  if (!tpl) throw new Error('web search is not configured — set ANANSI_SEARCH to a URL template with {q} in it');
  const url = tpl.replace('{q}', encodeURIComponent(q.slice(0, 300)));
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000),
    headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`search answered ${r.status}`);
  const d = await r.json() as any;
  // SearXNG says `results`; most others say one of these. Nothing is assumed about the shape
  // beyond "an array of things with a title, a url and some text".
  const rows: any[] = d.results ?? d.items ?? d.data ?? d.organic ?? (Array.isArray(d) ? d : []);
  return rows.slice(0, n).map((x: any) => ({
    title: String(x.title ?? x.name ?? '').slice(0, 200),
    url: String(x.url ?? x.link ?? x.href ?? ''),
    // Bounded hard. A page is a stranger's text and the budget engine is downstream of this.
    text: String(x.content ?? x.snippet ?? x.description ?? x.text ?? '').slice(0, 1200),
  })).filter((x) => x.url && (x.title || x.text));
}
