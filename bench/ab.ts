// One arm of the F14 A/B. Writes a JSONL line per generation so a poller can watch progress
// and so a run that dies partway is still worth something.
import { appendFileSync } from 'node:fs';
import { FIXTURE, DIRECTIVE, verdict } from './verdict.ts';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const ARM = process.argv[2] ?? 'unnamed';
const N = Number(process.argv[3] ?? 10);
const OUT = process.env.ANANSI_OUT ?? `/tmp/anansi-ab/${ARM}.jsonl`;

const j = (u: string, b?: unknown) => fetch(B + u, b ? { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any);

const { stories } = await j('/api/stories');
const story = stories.find((s: any) => s.title === FIXTURE) ?? stories[0];

for (let i = 0; i < N; i++) {
  let row: Record<string, unknown>;
  try {
    const r = await j('/api/generate', { storyId: story.id, mode: 'direct', directive: DIRECTIVE });
    row = r.error
      ? { i, arm: ARM, error: String(r.error) }
      : { i, arm: ARM, seconds: r.seconds, ...verdict(r.prose) };
  } catch (e: any) {
    // A dead server must not end the arm — the poller decides whether to stop the run.
    row = { i, arm: ARM, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` };
  }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
}
