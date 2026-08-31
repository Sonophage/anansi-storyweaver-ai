/** What a change in the MIDDLE of the prompt costs, which is the case appending never tests.
 *
 *  F16 proved appending is nearly free. Anansi's bad case is different: accepting a canon proposal
 *  INSERTS an entry into a block near the front, so every block behind it is reprocessed. F50
 *  measured that at a full cold prefill — 5,885 tokens, 7.4 seconds, with the first 1,200
 *  characters byte-identical — and found `--cache-reuse` changes it by nothing.
 *
 *  Call 3 is the control on the instrument, not decoration: the same prompt twice must come back
 *  at ~4 tokens, or the cache is not working and calls 1 and 2 mean nothing.
 *
 *    node --experimental-strip-types bench/reuse.ts [model]
 */
import * as db from '../src/db.ts';
import { model as defaultModel } from '../src/llama.ts';

const MODEL = process.argv[2] || defaultModel();
const HOST = process.env.LLAMA_URL ?? 'http://127.0.0.1:8080';
const F = (db.db.prepare(
  `SELECT body FROM passages WHERE selected = 1 AND length(body) > 300
   ORDER BY rowid DESC LIMIT 40`).all() as any[]).map((r) => r.body).join('\n\n');
if (F.length < 4000) {
  console.error(`only ${F.length} characters of prose in ${db.FILE} — this needs a written-in library`);
  process.exit(1);
}
const HEAD = F.slice(0, 1200);          // the stable prefix, where SPINE/VOICE/STYLE sit
const TAIL = F.slice(1200);             // the bulk: EARLIER, PROSE, TAIL
const INSERT = 'The bell in the west tower has not rung in eleven years, and the '
  + 'watch still writes it down every night as though it had. ';
const SYS = 'You are continuing a novel. Write narration only.';

const ask = async (body: string) => {
  const r = await fetch(`${HOST}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.85, max_tokens: 1,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: body }] }),
    signal: AbortSignal.timeout(300_000) });
  const j: any = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
  if (!j.timings) throw new Error('no timings in the reply — is this llama-server?');
  return j.timings;
};

const row = (n: string, t: any) => console.log(`  ${n.padEnd(38)} processed ${String(t.prompt_n).padStart(6)}`
  + ` tok in ${String(Math.round(t.prompt_ms)).padStart(6)} ms`);

console.log(`\n  ${MODEL} · ${db.FILE}\n`);
row('1 · original prompt, cold', await ask(`${HEAD}${TAIL}\n\nContinue.`));
const b = await ask(`${HEAD}${INSERT}${TAIL}\n\nContinue.`);
row('2 · one paragraph inserted mid-prompt', b);
row('3 · the same again (control)', await ask(`${HEAD}${INSERT}${TAIL}\n\nContinue.`));
console.log(`\n  the number under test is row 2: ${b.prompt_n} tokens reprocessed after the insert\n`);
