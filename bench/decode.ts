/** Decode speed for one model, measured on this library's own prose.
 *
 *  Speculative decoding, a quant swap, a new preset: all of them change the same number, and until
 *  F49 there was no way to read it off in under an hour. The metric is llama.cpp's own
 *  `timings.predicted_per_second`, which is what F16 used and excludes anything served from cache.
 *
 *  The fixture is real passages out of the database rather than a committed sample, for the reason
 *  F49 turned on: speculative acceptance depends on what the text actually looks like, and lorem
 *  ipsum would have measured a different model. Nothing is written; it reads.
 *
 *  The first call is discarded. It pays the cold prefill — ~7.3s against ~0.33s warm on the
 *  writing model — and averaging that in is how F24's two numbers got hidden inside one.
 *
 *    node --experimental-strip-types bench/decode.ts [model] [trials]
 *
 *  ponytail: one model per run, sequential. A simultaneous A/B would contend for the one GPU and
 *  make both arms slower, which is the opposite of what bench/ab.ts protects against for prose
 *  quality. Run it once per arm and compare medians; the spread tells you if that is fair.
 */
import * as db from '../src/db.ts';
import { model as defaultModel } from '../src/llama.ts';

const MODEL = process.argv[2] || defaultModel();
const TRIALS = Number(process.argv[3] ?? 6);
const HOST = process.env.LLAMA_URL ?? 'http://127.0.0.1:8080';
const SYS = 'You are continuing a novel. Write narration only. Do not summarise, do not explain.';

// Enough real prose to sit where a real prompt sits. 40 passages lands around 6k tokens, which is
// the same order as a working book's context and well inside every preset's slot.
const prose = db.db.prepare(
  `SELECT body FROM passages WHERE selected = 1 AND length(body) > 300
   ORDER BY rowid DESC LIMIT 40`).all().map((r: any) => r.body).join('\n\n');
if (prose.length < 4000) {
  console.error(`only ${prose.length} characters of prose in ${db.FILE} — this needs a written-in library`);
  process.exit(1);
}

const one = async () => {
  const r = await fetch(`${HOST}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, temperature: 0.85, top_p: 0.95, max_tokens: 400,
      // F5/F23: mandatory. With thinking on this measures a different thing, or nothing.
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'system', content: SYS },
                 { role: 'user', content: `${prose}\n\nContinue from here.` }],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const j: any = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
  if (!j.timings) throw new Error('no timings in the reply — is this llama-server?');
  return j.timings;
};

const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

console.log(`\n  ${MODEL} · ${TRIALS} trials on ${(prose.length / 1024).toFixed(1)} KB of ${db.FILE}\n`);
const dec: number[] = [];
for (let i = 0; i <= TRIALS; i++) {
  const t = await one();
  const d = +(t.predicted_per_second ?? 0).toFixed(1);
  if (i) dec.push(d);
  console.log(`  ${(i ? `t${i}` : 'warmup').padEnd(7)} decode ${String(d).padStart(6)} tok/s   `
    + `prefill ${String(t.prompt_n).padStart(6)} tok / ${String(Math.round(t.prompt_ms ?? 0)).padStart(6)} ms`
    + (i ? '' : '   (discarded — cold)'));
}
// The spread is reported because F49 needed it: arm A varied by 0.8 tok/s and arm B by 4.9, and
// that difference was the evidence for WHY speculation lost, not just that it did.
console.log(`\n  median ${med(dec)} tok/s   spread ${(Math.max(...dec) - Math.min(...dec)).toFixed(1)}`
  + `   range ${Math.min(...dec).toFixed(1)}–${Math.max(...dec).toFixed(1)}\n`);
