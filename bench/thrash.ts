// Does switching stories cost a full prompt reprocess? Two tenants generate concurrently —
// the real deployment shape — in two arms:
//
//   sticky  each tenant stays on ONE story for the whole run
//   rotate  each tenant cycles its three stories
//
// The metric is llama.cpp's own timings.prompt_n: tokens it actually had to process, as
// opposed to the prompt's full length. A prefix served from the KV cache is not counted
// there, so prompt_n falling well below the prompt size IS the cache working. prompt_ms is
// reported alongside because wall time is what a writer feels, but prompt_n is the number
// that cannot be explained away by machine noise.
import { readFileSync, appendFileSync } from 'node:fs';

const LLAMA = process.env.LLAMA_URL ?? 'http://127.0.0.1:8080';
const APP = process.env.ANANSI_URL ?? 'http://127.0.0.1:5177';
const MODEL = process.env.ANANSI_MODEL ?? 'write-nt-qwen36-h';
const ARM = process.argv[2] ?? 'rotate';
const ROUNDS = Number(process.argv[3] ?? 3);
const OUT = process.env.ANANSI_OUT ?? `/tmp/anansi-ab/thrash-${ARM}.jsonl`;

const stories: { tenant: string; story: string; title: string }[] =
  JSON.parse(readFileSync('/tmp/anansi-thrash-stories.json', 'utf8'));

// Build every prompt up front so the arms differ ONLY in the order requests are sent.
const prompt = new Map<string, string>();
for (const s of stories) {
  const r = await fetch(`${APP}/api/manifest`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: s.story, mode: 'direct', directive: 'Keep going.' }) });
  prompt.set(s.story, (await r.json() as any).prompt);
}

async function send(tenant: string, s: { story: string; title: string }, i: number) {
  const t0 = Date.now();
  const r = await fetch(`${LLAMA}/v1/chat/completions`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt.get(s.story) }],
      max_tokens: 1, chat_template_kwargs: { enable_thinking: false } }) });
  const d = await r.json() as any;
  const row = { arm: ARM, tenant, i, title: s.title,
    promptTokens: d.usage?.prompt_tokens ?? null,
    processed: d.timings?.prompt_n ?? null,
    promptMs: d.timings?.prompt_ms ?? null,
    wallMs: Date.now() - t0, error: d.error?.message ?? null };
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  return row;
}

const tenants = [...new Set(stories.map((s) => s.tenant))];
await Promise.all(tenants.map(async (t) => {
  const mine = stories.filter((s) => s.tenant === t);
  for (let i = 0; i < ROUNDS * mine.length; i++)
    await send(t, ARM === 'sticky' ? mine[0] : mine[i % mine.length], i);
}));
console.log(`  ${ARM}: ${ROUNDS * 3} requests per tenant, ${tenants.length} tenants -> ${OUT}`);
