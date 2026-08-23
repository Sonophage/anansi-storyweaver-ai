// P0 measurement 3 — which transport does this model actually want?
// PLAN-02 §3 locked raw /completion for prose on the anti-refusal argument. That holds,
// but this model is a reasoning model served with --jinja: raw completion skips the
// chat template, so it continues the document instead of answering, echoes the
// instruction back, and opens a visible <think> block.
import { buildContext } from '../src/context.ts';
import type { Input, Entry } from '../src/context.ts';
import { render, SYSTEM } from '../src/render.ts';
const HOST = 'http://127.0.0.1:8080', MODEL = 'write-nt-qwen36-h';
const post = async (p: string, b: unknown) => {
  const r = await fetch(HOST + p, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b), signal: AbortSignal.timeout(600_000) });
  if (!r.ok) throw new Error(`${p} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const { input } = await import('../test/fixture.ts');
const inp = input as Input; inp.budget = 22923;
const m = buildContext(inp, (s) => Math.ceil(s.length / 3.6));
const full = render(m);
const body = full.slice(SYSTEM.length);
const show = (label: string, s: string, extra = '') => {
  const think = /<think>/.test(s);
  const echo = /Write 2-4 paragraphs|Continue the passage/.test(s);
  const clean = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  console.log(`\n### ${label} ${extra}`);
  console.log(`   think-tag=${think}  echoes-instruction=${echo}  usable_chars=${clean.length}`);
  console.log(`   ${JSON.stringify(clean.slice(0, 200))}`);
};
// 1. raw /completion, no template
let r = await post('/completion', { model: MODEL, prompt: full, n_predict: 200, temperature: 0.85, cache_prompt: false });
show('raw /completion', r.content ?? '');
// 2. /apply-template then /completion
const at = await post('/apply-template', { model: MODEL,
  messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: body }] });
const templated = at.prompt ?? at.content ?? '';
r = await post('/completion', { model: MODEL, prompt: templated, n_predict: 200, temperature: 0.85, cache_prompt: false });
show('/apply-template -> /completion', r.content ?? '', `(template ${templated.length} chars)`);
// 3. chat completions
r = await post('/v1/chat/completions', { model: MODEL, temperature: 0.85, max_tokens: 200,
  messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: body }] });
const msg = r.choices?.[0]?.message ?? {};
show('/v1/chat/completions', msg.content ?? '', `(reasoning_content=${msg.reasoning_content ? msg.reasoning_content.length + ' chars, split out' : 'none'})`);
