// llama-server client. Everything the engine needs from the outside world lives here,
// so buildContext itself stays pure.

const HOST = process.env.ANANSI_LLAMA ?? 'http://127.0.0.1:8080';
// Mutable so Preferences can switch it. The router serves several models and every call names
// one, so switching is just a different string — but it is process-wide, not per story, and two
// tenants share this process. Whoever changes it changes it for both.
let MODEL = process.env.ANANSI_MODEL ?? 'write-nt-qwen36-h';

async function post(path: string, body: unknown, ms = 900_000): Promise<any> {
  const res = await fetch(HOST + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function tokenize(content: string): Promise<number[]> {
  return (await post('/tokenize', { model: MODEL, content })).tokens;
}

export async function count(content: string): Promise<number> {
  return (await tokenize(content)).length;
}

/** Per-slot context. NOT what /props reports directly.
 *
 *  Measured on build b10485: `default_generation_settings.n_ctx` is the GLOBAL value
 *  (100096) and top-level `n_ctx` is absent, while `total_slots` is 4. So the real
 *  per-slot ceiling is n_ctx / total_slots = 25024, and any plan that trusts the
 *  reported number budgets 4x what it has. */
export async function slotContext(): Promise<{ global: number; slots: number; perSlot: number }> {
  const res = await fetch(`${HOST}/props?model=${encodeURIComponent(MODEL)}`, {
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
export async function chat(system: string, body: string, opts: Record<string, unknown> = {}) {
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
  return structured(system, body, schema, { ...opts, max_tokens: 2000, temperature: 0.1 });
}

/** The active model. A getter, not a const — a const captured the value at import and every
 *  caller would have kept reporting the model the server booted with. */
export const model = () => MODEL;

/** Models the router will serve, with whether each is resident. */
export async function models(): Promise<{ id: string; status: string }[]> {
  const r = await fetch(`${HOST}/v1/models`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`/v1/models answered ${r.status}`);
  const d = await r.json() as any;
  return (d.data ?? []).map((m: any) => ({ id: String(m.id), status: m.status?.value ?? 'unknown' }));
}

/** Switch the active model. Refuses anything the router does not list, so a client cannot
 *  point the engine at an arbitrary string. */
export async function setModel(id: string): Promise<string> {
  const known = await models();
  if (!known.some((m) => m.id === id)) throw new Error(`the router does not serve "${id}"`);
  MODEL = id;
  return MODEL;
}
