// THE PROMPT AUDIT OF 2026-11-11, MEASURED. Commit 018c1f0 made two prompt changes with no number behind
// them, and this is the A/B for each, against the shipped code as the control, all three arms at once:
//
//   B  the shipped code (this checkout): DIRECTIVE after TAIL in a <rules> fence, no Voice Modulation.
//   O  B with the old ORDER: DIRECTIVE ahead of the prose, unfenced. Only src/blocks.ts and the TAG.
//   M  B with the Voice Modulation paragraph back in SYSTEM. Only src/render.ts.
//
// O and M run from worktrees holding that one edit (ARM_ORDER, ARM_MOD); `serveAt`'s `cwd` is the seam.
//
// THE POINT is the one that showed the failure: The Door Between Us, scene 4, after Seth's own passage
// "He puts the phone down and turns on his laptop... while he waits for her response." (ordinal 70). The
// take that followed it acted for Seth all through ("He minimizes the chat window... He picks up the
// mug") and named what he felt ("It is easier than thinking about..."). Mode narrate, as it was.
//
//   node --experimental-strip-types bench/prompt-audit.ts check        # the detectors, no model
//   ARM_ORDER=../anansi-arm-order ARM_MOD=../anansi-arm-mod \
//     node --experimental-strip-types bench/prompt-audit.ts run 60     # takes per arm
//   node --experimental-strip-types bench/prompt-audit.ts report
//
// THE DETECTORS ARE FLOORS. Seth is the only man in the scene, so a narration sentence whose subject is
// "He" or "Seth" followed by a verb is him acting. A verb outside the list is missed, never invented.
// NEVER THE LIVE LIBRARY: each arm is a copy cut back to the point (bench/scene.ts).
import { mkdirSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fisher, poisson, per1000 } from './stats.ts';
import { copyAt, serveAt } from './scene.ts';
import { FORMS } from './lockout-book.ts';
import { strip } from './interiority-verdict.ts';

// Present-tense office and kitchen verbs the lockout list does not carry; this scene is full of them.
const MORE = ['minimize', 'click', 'pick', 'drink', 'sip', 'glance', 'stare', 'read', 'scroll', 'tap', 'press',
  'rub', 'type', 'delete', 'pour', 'grab', 'check', 'flip', 'slide', 'place', 'pocket', 'stretch', 'stand',
  'pace', 'reread', 'switch', 'shut', 'lock', 'unlock', 'drop', 'touch', 'trace', 'thumb', 'swipe', 'hit', 'send']
  .flatMap((v) => [v, `${v}s`, `${v}ed`, `${v}d`, `${v}es`, v.replace(/e$/, '') + 'ing']);
const VERBS = [...new Set([...FORMS, ...MORE, 'drank', 'read', 'sent', 'shut', 'stood', 'took', 'put', 'set', 'let'])];
const WHO = '(?:He|Seth)';
const ADV = '(?:\\w+ly\\s+|just\\s+|then\\s+|still\\s+|finally\\s+|only\\s+)?';
const ACT = new RegExp(`(?:^|[.!?;:—–]\\s*|\\n\\s*|,\\s*and\\s+)${WHO}\\s+${ADV}(?:${VERBS.join('|')})\\b`, 'g');
const INNER = new RegExp(`\\b${WHO}\\s+${ADV}(?:thinks|thought|wonders|wondered|knows|knew|feels|felt|imagines|imagined`
  + `|remembers|remembered|wants|wanted|realizes|realised|realises|realized|decides|decided|hopes|hoped|fears|feared`
  + `|understands|understood|tells himself|told himself)\\b`, 'i');
// A NAMED FEELING in narration: the voice's "Narration never names an emotion".
const NAMED = /\b(afraid|fear|anxious|anxiety|nervous|nervousness|longing|lonely|loneliness|relief|relieved|guilt|guilty|shame|ashamed|dread|hopeful|joy|happy|happiness|sad|sadness|grief|yearning|jealous\w*|embarrass\w*|frustrat\w*|disappoint\w*|excite\w*|vulnerab\w*|desperat\w*|tension|anticipation|unease|uneasy|contentment|giddy|elation)\b/gi;
// The voice's own list, "breath catching or thinning, hearts pounding, chests tightening, jaws clenching,
// a weight settling, silence stretching thick", in the forms the model writes them.
const STOCK = /\b(breath (?:catch|hitch|thin)\w*|heart (?:pound|race|hammer|skip|thud|lurch)\w*|chest (?:tighten|constrict)\w*|jaw (?:clench|tighten)\w*|weight settl\w*|silence (?:stretch|thicken)\w*|thick silence|throat (?:tighten|close)\w*|stomach (?:drop|knot|flip|twist)\w*)\b/i;

export const score = (prose: string) => {
  const narr = strip(String(prose ?? '')).replace(/\*[^*\n]+\*/g, ' ');   // texts in italics are dialogue here
  const acts = (narr.match(ACT) ?? []).length, named = (narr.match(NAMED) ?? []).length;
  return { words: (narr.match(/\w+/g) ?? []).length, acts, acted: acts > 0, inner: INNER.test(narr),
    named, naming: named > 0, stock: STOCK.test(narr) };
};

const mode = import.meta.main ? process.argv[2] : 'imported';

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  // FROM THE TAKE THAT FAILED (generation g-04b0e55e's prompt, its TAIL), verbatim.
  assert.ok(score('He minimizes the chat window.').acted, 'AUDIT-ACT-TAIL: "He minimizes the chat window"');
  assert.ok(score('He picks up the mug. The coffee is cold.').acted, 'AUDIT-ACT-PICK: "He picks up the mug"');
  assert.ok(score('He drinks it anyway, the bitterness sharp on his tongue.').acted, 'AUDIT-ACT-DRINK');
  assert.strictEqual(score('He sets the mug down and looks at the phone again.').acts, 1, 'AUDIT-ACT-ONE: one sentence, one act');
  assert.ok(score('He imagines her there, in Osaka.').inner, 'AUDIT-INNER-IMAGINE: "He imagines her there"');
  assert.ok(score('Seth wonders if she is awake.').inner, 'AUDIT-INNER-NAME');
  // Outside the failing take: other people, objects, dialogue, texts, pronoun-free sentences.
  assert.ok(!score('She sends a photo. The radiator ticks.').acted, 'AUDIT-ACT-SHE: Kisa acting is not Seth');
  assert.ok(!score('"He picks up the phone," she says.').acted, 'AUDIT-ACT-QUOTE: quoted words are dialogue');
  assert.ok(!score('*He picks up the phone*, she types.').acted, 'AUDIT-ACT-TEXT: an italic text message is dialogue');
  assert.ok(!score('The phone lights up. His coffee goes cold.').acted, 'AUDIT-ACT-OBJECT: things happening around him');
  assert.ok(!score('The heavy door opens.').acted, 'AUDIT-ACT-WORD: "he" inside another word is not him');
  // Feelings: named, and the voice's stock list.
  assert.ok(score('A slow relief moves through the kitchen.').naming, 'AUDIT-NAMED: relief named');
  assert.ok(!score('The kitchen is cold and the kettle ticks.').naming, 'AUDIT-NAMED-NOT: a room is not a feeling');
  assert.ok(!score('"I\'m so nervous," she says.').naming, 'AUDIT-NAMED-QUOTE: a character may name it aloud');
  assert.ok(score('His breath catches.').stock && score('Her heart pounds against her ribs.').stock, 'AUDIT-STOCK');
  assert.ok(!score('He breathes out.').stock, 'AUDIT-STOCK-NOT: breathing is not a stock reaction');
  console.log('  ok  prompt-audit: the detectors flag Seth acting, his interior, named feelings and stock reactions, and not the rest');
  process.exit(0);
}

const MODEL = 'Ornith-1.0-RPNTH-35B';
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-prompt-audit';
const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
const POINT = { chapter: 4, after: 70, title: 'The Door Between Us', login: 'sonophage' };
const HERE = new URL('..', import.meta.url).pathname;
const ARMS = [
  { key: 'B', port: 5301, cwd: HERE },
  { key: 'O', port: 5302, cwd: resolve(process.env.ARM_ORDER ?? '../anansi-arm-order') + '/' },
  { key: 'M', port: 5303, cwd: resolve(process.env.ARM_MOD ?? '../anansi-arm-mod') + '/' },
];

if (mode === 'run') {
  const n = Number(process.argv[3] ?? 60);
  mkdirSync(OUT, { recursive: true });
  rmSync(join(OUT, 'takes.jsonl'), { force: true });
  // EACH ARM'S PROMPT IS CHECKED for the one thing it changes, before any take.
  const servers = await Promise.all(ARMS.map(async (arm) => {
    const file = join(OUT, `arm-${arm.key}.db`);
    const { storyId } = copyAt(SOURCE, file, POINT, MODEL);
    const { j, kill } = await serveAt(file, arm.port, MODEL, POINT, storyId, join(OUT, `serve-${arm.key}.log`), arm.cwd);
    const body = { storyId, mode: 'narrate' };
    const prompt = String((await j('/api/manifest', body)).prompt ?? '');
    const tail = prompt.lastIndexOf('while he waits for her response'), dir = prompt.indexOf('[Writing:');
    const ok = tail > 0 && dir > 0 && {
      B: dir > tail && prompt.includes('<rules>') && !prompt.includes('Voice Modulation'),
      O: dir < tail && !prompt.includes('<rules>') && !prompt.includes('Voice Modulation'),
      M: dir > tail && prompt.includes('<rules>') && prompt.includes('Voice Modulation'),
    }[arm.key];
    if (!ok) { console.error(`arm ${arm.key}: its prompt does not carry its change (tail ${tail}, directive ${dir})`); kill(); return null; }
    return { arm, j, kill, body };
  }));
  if (servers.some((s) => !s)) { servers.forEach((s) => s?.kill()); process.exit(1); }
  // ONE AT A TIME PER ARM: three slots of Ornith's four, so one stays free for the live library.
  await Promise.all(servers.map(async (s) => {
    for (let k = 0; k < n; k++) {
      const r = await s!.j('/api/generate', s!.body);
      appendFileSync(join(OUT, 'takes.jsonl'), JSON.stringify({ arm: s!.arm.key, i: k, prose: r.prose ?? null, error: r.error ?? null }) + '\n');
    }
    s!.kill();
    console.log(`  arm ${s!.arm.key}: ${n} takes`);
  }));
  process.exit(0);
}

if (mode === 'report') {
  const rows = readFileSync(join(OUT, 'takes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const arm = (key: string) => {
    const got = rows.filter((r) => r.arm === key && r.prose).map((r) => score(r.prose));
    const c = (f: 'acted' | 'inner' | 'naming' | 'stock') => got.filter((x) => x[f]).length;
    return { key, n: got.length, errors: rows.filter((r) => r.arm === key && !r.prose).length,
      words: got.reduce((a, x) => a + x.words, 0), acts: got.reduce((a, x) => a + x.acts, 0),
      named: got.reduce((a, x) => a + x.named, 0), acted: c('acted'), inner: c('inner'), naming: c('naming'), stock: c('stock') };
  };
  const B = arm('B');
  for (const T of [arm('O'), arm('M')]) {
    console.log(`\n  ${T.key === 'O' ? 'ORDER — O (old order) against B (shipped)' : 'SYSTEM — M (Voice Modulation back) against B (shipped)'}`);
    console.log(`    takes        ${T.key} ${T.n} (${T.errors} errors) · B ${B.n} (${B.errors} errors) · words ${T.words} · ${B.words}`);
    for (const f of ['acted', 'inner', 'naming', 'stock'] as const) {
      const p = fisher(T[f], T.n - T[f], B[f], B.n - B[f]);
      console.log(`    ${f.padEnd(7)}  ${T.key} ${(T[f] / T.n * 100).toFixed(1)}% (${T[f]}/${T.n})  B ${(B[f] / B.n * 100).toFixed(1)}% (${B[f]}/${B.n})  p = ${p.toFixed(4)}${p < 0.05 ? '  *' : ''}`);
    }
    for (const f of ['acts', 'named'] as const) {
      const p = poisson(T[f], T.words, B[f], B.words);
      console.log(`    ${f.padEnd(7)}  per 1,000 words  ${T.key} ${per1000(T[f], T.words)}  B ${per1000(B[f], B.words)}  p = ${p.toFixed(4)}${p < 0.05 ? '  *' : ''}`);
    }
  }
  console.log('\n  Floors, anchored on "He"/"Seth" and a verb list. Say "under X%", never "fixed".');
  process.exit(0);
}

if (mode !== 'imported') { console.error('usage: bench/prompt-audit.ts check | run [n] | report'); process.exit(2); }
