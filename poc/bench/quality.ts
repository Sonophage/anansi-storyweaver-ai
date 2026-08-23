// What the model is actually good at, measured the only way this harness can measure honestly:
// against facts it was handed. Every check below is a REGEX over narration with dialogue
// stripped — dialogue may lie, characters may be wrong, only the narrator commits the story.
//
// This deliberately does NOT score prose quality. A rubric asking "is this in character?" scores
// the judge's taste; a rubric asking "canon says the lasgun is not a bolter — did the narration
// hand him a bolter?" scores the model. Only the second kind is here.
import { appendFileSync, readFileSync } from 'node:fs';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5178';
const N = Number(process.argv[2] ?? 20);
const ONLY = process.argv[3];
const OUT = process.env.ANANSI_OUT ?? '/tmp/anansi-ab/quality.jsonl';
const stories = JSON.parse(readFileSync('/tmp/quality-stories.json', 'utf8'));

const j = (u: string, b?: unknown) => fetch(B + u, b ? { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any);

const narration = (s: string) => s.replace(/["“][^"”]*["”]/g, ' ');
const said = (s: string) => [...s.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);

interface Probe { id: string; story: string; directive: string; check: (prose: string) => string[] }

const PROBES: Probe[] = [
  // A. Playing a character. Sela is blind in the right eye, cannot swim and has never admitted
  // it, and speaks in at most eight words. The last is countable; the others are contradictions.
  { id: 'character', story: stories.character,
    directive: 'The man asks Sela to take him across tonight. She refuses, then reconsiders.',
    check: (p) => {
      const n = narration(p), bad: string[] = [];
      if (/\b(she|sela)\s+(swam|swims|dove|dived|waded in|struck out)\b/i.test(n)) bad.push('made Sela swim');
      if (/\b(both|her two)\s+eyes\b/i.test(n) || /\bright eye\b[^.]{0,40}\b(saw|watched|caught sight)/i.test(n))
        bad.push('used the blind eye');
      if (/\bsela\b[^.]{0,30}\b(admitted|confessed)[^.]{0,30}\bswim/i.test(n)) bad.push('admitted she cannot swim');
      const long = said(p).filter((q) => (q.match(/[\p{L}\p{N}']+/gu) ?? []).length > 8);
      if (long.length) bad.push(`spoke over eight words (${long.length}x)`);
      return bad;
    } },

  // B. Enacting a directive. The first version of this probe asked Roan to sit still and say
  // nothing, so only 1 of 20 generations mentioned the knife at all and the check had nothing to
  // fire on — the same non-informative-denominator trap F10 fell into. This version puts hands on
  // him, so declining to draw is a choice rather than an absence. Four things are checked, and
  // PROMPTS §4's "2-4 paragraphs, cover that and nothing beyond it" is two of them.
  { id: 'directive', story: stories.directive,
    directive: 'The collector takes Roan by the collar and hauls him out of the chair.',
    check: (p) => {
      const n = narration(p), bad: string[] = [];
      // Did the named thing happen at all? A beautiful paragraph about the kettle is a failure.
      if (!/\b(collar|haul\w*|lifted|dragged|to his feet|out of the chair|off the chair)\b/i.test(n))
        bad.push('did NOT enact the directive');
      // Canon: the knife has never been drawn. The scene now invites it.
      if (/\b(drew|draws|drawn|pulled|unsheath\w*|reached for)\b[^.]{0,40}\bknife\b/i.test(n)
        || /\bknife\b[^.]{0,30}\b(in his hand|out of his boot|free|flashed)\b/i.test(n))
        bad.push('drew the knife canon says was never drawn');
      // Overrun: the instruction was one beat, not the end of the scene.
      if (/\b(paid|handed over|counted out|settled)\b[^.]{0,40}\b(crowns|debt|coin)\b/i.test(n)
        || /\b(collector|man|stranger)\b[^.]{0,50}\b(left|departed|walked out|was gone|let go and went)\b/i.test(n)
        || /\broan\b[^.]{0,40}\b(died|was dead|lost consciousness|blacked out|went limp and did not)\b/i.test(n))
        bad.push('resolved the scene it was told to cover one beat of');
      const paras = p.trim().split(/\n{2,}/).filter((x) => x.trim()).length;
      if (paras < 2 || paras > 4) bad.push(`wrote ${paras} paragraphs, PROMPTS says 2-4`);
      if (/(^|[^\w])(I|my|me)([^\w]|$)/.test(n)) bad.push('broke third person');
      return bad;
    } },

  // C. An established IP. Canon says lasgun, NOT bolter — the same shape as the brass key.
  // The anachronism list is the setting's own hard boundary, not taste.
  { id: 'ip-warhammer', story: stories.ip,
    directive: 'The bombardment lifts and Vek is ordered to hold the breach.',
    check: (p) => {
      const n = narration(p), bad: string[] = [];
      if (/\bbolt(er|gun)s?\b/i.test(n)) bad.push('gave the guardsman a bolter (canon: lasgun, not a bolter)');
      const anach = n.match(/\b(internet|email|e-mail|smartphone|cell ?phone|website|wifi|computer screen|television|democracy|elections?|coffee shop|jeans|helicopter|tank engine oil change)\b/gi);
      if (anach) bad.push(`anachronism: ${[...new Set(anach.map((x) => x.toLowerCase()))].join(', ')}`);
      if (/\bxenos\b/i.test(n) && /\bvek\b[^.]{0,40}\b(recognis|recognz|knew|had seen)\b/i.test(n))
        bad.push('Vek recognised a xenos he has never seen');
      return bad;
    } },

  // D. A fact that changed. Canon at this chapter says the left hand is GONE with the ring.
  { id: 'progression', story: stories.progression,
    directive: 'Corin is challenged to a bout and accepts.',
    check: (p) => {
      const n = narration(p), bad: string[] = [];
      if (/\bleft hand\b/i.test(n) && !/\b(missing|gone|lost|stump|absent|where his left hand)\b/i.test(n))
        bad.push('used the left hand that canon says is gone');
      if (/\bsilver ring\b/i.test(n) && !/\b(gone|lost|missing)\b/i.test(n)) bad.push('used the silver ring lost with the hand');
      if (/\bleft[- ]handed\b/i.test(n)) bad.push('called him left-handed after the injury');
      return bad;
    } },
];

const run = PROBES.filter((p) => !ONLY || p.id === ONLY);
const tally: Record<string, Record<string, number>> = {};
const n: Record<string, number> = {};

for (const probe of run) {
  tally[probe.id] = {}; n[probe.id] = 0;
  for (let i = 0; i < N; i++) {
    const r = await j('/api/generate', { storyId: probe.story, mode: 'direct', directive: probe.directive });
    if (r.error) { appendFileSync(OUT, JSON.stringify({ probe: probe.id, i, error: r.error }) + '\n'); continue; }
    n[probe.id]++;
    const bad = probe.check(r.prose);
    for (const b of bad) tally[probe.id][b] = (tally[probe.id][b] ?? 0) + 1;
    appendFileSync(OUT, JSON.stringify({ probe: probe.id, i, bad, prose: r.prose.slice(0, 400) }) + '\n');
  }
}

console.log('');
for (const probe of run) {
  const total = n[probe.id];
  const failed = Object.values(tally[probe.id]).reduce((a, b) => a + b, 0);
  console.log(`  ${probe.id.padEnd(14)} ${total} generations`);
  if (!Object.keys(tally[probe.id]).length) console.log('                 no contradictions');
  for (const [k, v] of Object.entries(tally[probe.id]).sort((a, b) => b[1] - a[1]))
    console.log(`                 ${String(v).padStart(3)}/${total}  ${k}`);
}
