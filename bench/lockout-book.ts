// Does the lockout hold in a REAL book? F58's answer to F57 was that the staged fixture had defined
// the effect out of existence; this is the other half of that argument — the same question asked of
// prose somebody actually wrote.
//
//   node --experimental-strip-types bench/lockout-book.ts check           # detectors, no model
//   node --experimental-strip-types bench/lockout-book.ts base            # the stored prose
//   ANANSI_URL=…:5301 ANANSI_OUT=/tmp/a  … lockout-book.ts run 200 &      # control
//   ANANSI_URL=…:5302 ANANSI_OUT=/tmp/b  … lockout-book.ts run 200 &      # treatment
//   ARM_A=… ARM_B=… CTL=/tmp/a TRT=/tmp/b … lockout-book.ts report
//
// A SEPARATE FILE FROM bench/lockout.ts ON PURPOSE. That harness produced F28 and F51-F58 and its
// fixture, its directive and its verb list are the definition of those numbers. Editing it to fit a
// different book would silently move published findings. Nothing here is comparable to them and it
// does not pretend to be.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { strip } from './interiority-verdict.ts';

const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5174';
const TITLE = process.env.BOOK ?? 'Into the Blue';
const WHO = process.env.LOCKED ?? 'Seth';
const OUTDIR = process.env.ANANSI_OUT ?? '/tmp/anansi-lockout-book';
// Puts the scene forward and says nothing about what the locked character does. A directive naming
// him, or telling him to act, would BE the writer writing him — the case the lockout exists for —
// and would make the arms incomparable. Overridable, because the right one depends on the book.
const DIRECTIVE = process.env.DIRECTIVE ?? "Halsey's voice breaks and the room goes quiet.";

/* PRESENT TENSE AND PAST, and this is not a detail — it is the reason a real book needs its own
 * detector. `bench/lockout.ts` carries a past-tense verb list ('reached', 'turned', 'stood'),
 * because its fixture is past tense. "Into the Blue" is written in PRESENT: its own prose says
 * "Seth stops typing." Run the shipped detector over this book and it reports zero defects in a
 * book that is full of them — a check that cannot fire reporting perfection, which is this
 * project's first rule of measurement failing in the most ordinary way possible. */
const STEMS = ['reach','turn','stand','step','walk','take','draw','put','pull','push','open','close',
  'move','run','lift','set','cross','raise','look','watch','nod','shake','grip','hold','strike','hit',
  'fire','sit','rise','lean','kneel','wait','stop','start','go','come','give','let','make','count',
  'shift','straighten','spit','swallow','blink','breathe','type','smile','laugh','speak','say','leave',
  'answer','ask','listen','点'].filter((s) => /^[a-z]+$/.test(s));
export const FORMS = STEMS.flatMap((v) => [v, `${v}s`, `${v}ed`, `${v}d`, `${v}es`]);
const NAME = WHO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ACTED = new RegExp(`\\b${NAME}\\s+(?:had\\s+|has\\s+|then\\s+|slowly\\s+|just\\s+)?(?:${FORMS.join('|')})\\b`, 'i');
const TOLD = new RegExp(`\\b${NAME}\\s+(?:had\\s+|has\\s+)?(?:felt|feels|knew|knows|feared|fears|hoped|hopes`
  + `|wondered|wonders|realised|realises|realized|realizes|remembered|remembers|understood|understands`
  + `|suspected|suspects|decided|decides|wants|wanted|thinks|thought)\\b`, 'i');
// Attribution on a quote. Runs on the WHOLE prose: quoted speech is the thing being counted.
const ATTRIB = 'says|said|asks|asked|mutters|muttered|murmurs|murmured|whispers|whispered|replies|replied|answers|answered|adds|added|breathes|breathed';
const SPOKE = [
  new RegExp(`["”][\\s,;:—–-]{0,3}\\b${NAME}\\b[\\s,]{0,3}(?:\\w+\\s){0,1}\\b(?:${ATTRIB})\\b`, 'i'),
  new RegExp(`["”][\\s,;:—–-]{0,3}\\b(?:${ATTRIB})\\b\\s+\\b${NAME}\\b`, 'i'),
  new RegExp(`\\b${NAME}\\b[^.!?"“]{0,30}\\b(?:${ATTRIB})\\b[^"“]{0,12}["“]`, 'i'),
];

export const score = (prose: string) => {
  const narr = strip(prose);
  return {
    about: new RegExp(NAME, 'i').test(narr),
    acted: ACTED.test(narr),
    told: TOLD.test(narr),
    spoke: SPOKE.some((r) => r.test(String(prose))),
    words: (narr.match(/\w+/g) ?? []).length,
    // Density needs a count, not a boolean: at a 50% base rate a binary loses most of the signal.
    acts: (narr.match(new RegExp(ACTED.source, 'gi')) ?? []).length,
    names: (narr.match(new RegExp(NAME, 'gi')) ?? []).length,
  };
};

/* THE DETECTOR IS VALIDATED BEFORE ANY RESULT IS BELIEVED, both directions, and one of these cases
 * is lifted verbatim out of the book so the fixture cannot be accused of inventing the defect. */
const CASES: [string, Partial<ReturnType<typeof score>>, string][] = [
  ['Seth stops typing.', { acted: true }, 'PRESENT tense — the real line from Into the Blue'],
  ['Seth reached for the glass.', { acted: true }, 'past tense still counted'],
  ['Seth crosses the room and takes the cup.', { acted: true }, 'two verbs, still one flagged run'],
  ['Halsey stops typing.', { acted: false }, 'another character acting is not him'],
  ['"Seth, stop," she says.', { acted: false, spoke: false }, 'his name inside dialogue is not narration'],
  ['The room stops breathing.', { acted: false, about: false }, 'no name, nothing'],
  ['Seth is tired.', { acted: false }, 'a state is not an action'],
  ['His hand stops.', { acted: false, about: false }, 'a pronoun is never counted — the floor rule'],
  ['"I am not going," Seth says.', { spoke: true }, 'attribution after the quote'],
  ['Seth says, "I am not going."', { spoke: true }, 'attribution before the quote'],
  ['"Not tonight," she tells Seth, who says nothing.', { spoke: false }, 'someone speaking TO him is not him speaking'],
  ['Seth knows what she means.', { told: true }, 'the narrator stating his interior, present tense'],
  ['Seth wondered what she meant.', { told: true }, 'and past'],
  ['Halsey knows what she means.', { told: false }, 'her interior is not his'],
];

/* IMPORTED, IT IS THE DETECTOR AND NOTHING ELSE. `bench/lockout-cheap.ts` reads `score` and `FORMS`
 * from here, and without this an importer's own `check` would run this file's check and exit, and
 * any other argument would start an arm against a live server. */
const CMD = import.meta.main ? process.argv[2] : 'imported';

if (CMD === 'check') {
  let bad = 0;
  for (const [text, want, why] of CASES) {
    const got: any = score(text);
    for (const [k, v] of Object.entries(want))
      if (got[k] !== v) { console.log(`  RED  ${k}=${got[k]}, wanted ${v} — ${why}\n       ${JSON.stringify(text)}`); bad++; }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this`
                  : `\n  ${CASES.length} cases, all green — ${CASES.filter(([, w]) => Object.values(w).some(Boolean)).length} must flag, `
                    + `${CASES.filter(([, w]) => !Object.values(w).some(Boolean)).length} must not`);
  process.exit(bad ? 1 : 0);
}

const j = (u: string, b?: unknown, m = 'POST') => fetch(B + u, b ? { method: m,
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any);

/* THE BASELINE, out of the prose already in the book. No model call, no arms — just what the app
 * has actually produced for this writer under whatever settings were in force when it did. */
if (CMD === 'base') {
  const db = await import('../src/db.ts');
  // `q` is module-private in db.ts, deliberately. Find the book the way the app does: every owner's
  // shelf, then by title — which also means this cannot read a book nobody on the box owns.
  const shelves = db.storiesPerOwner() as any[];
  let sid = '', owner = '';
  for (const w of shelves) {
    const o = db.owner(w.login);
    const hit = (db.listStories(o) as any[]).find((x) => x.title === TITLE);
    if (hit) { sid = hit.id; owner = w.login; break; }
  }
  if (!sid) { console.error(`no story "${TITLE}" in any shelf on this database`); process.exit(1); }
  const ps = (db.passagesOf(sid) as any[]).filter((p) => p.selected && !p.is_break && p.body?.trim());
  const by: Record<string, any> = {};
  for (const p of ps) {
    const k = p.author ?? '?'; const s = score(p.body);
    by[k] ??= { n: 0, about: 0, acted: 0, told: 0, spoke: 0, words: 0, acts: 0 };
    by[k].n++; by[k].words += s.words; by[k].acts += s.acts;
    for (const f of ['about', 'acted', 'told', 'spoke'] as const) if (s[f]) by[k][f]++;
  }
  console.log(`\n  "${TITLE}" — locked character: ${WHO}. Prose already in the book, owner ${owner}.\n`);
  for (const [k, v] of Object.entries(by)) {
    const pc = (x: number) => `${(x / v.n * 100).toFixed(0)}% (${x}/${v.n})`;
    console.log(`  ${k.toUpperCase()} — ${v.n} passages, ${v.words} words of narration`);
    console.log(`     names him   ${pc(v.about)}`);
    console.log(`     ACTS as him ${pc(v.acted)}   ·  ${(v.acts / v.words * 1000).toFixed(2)} per 1,000 words`);
    console.log(`     speaks      ${pc(v.spoke)}`);
    console.log(`     interior    ${pc(v.told)}\n`);
  }
  console.log('  Every rate is a FLOOR: the counters are anchored on his NAME, never a pronoun.');
  process.exit(0);
}

if (CMD === 'report') {
  const { fisher, poisson, per1000 } = await import('./stats.ts');
  const arms = ([[process.env.ARM_A ?? 'control', process.env.CTL!],
                 [process.env.ARM_B ?? 'treatment', process.env.TRT!]] as [string, string][])
    .map(([label, dir]) => {
      const rows = readFileSync(`${dir}/run.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
        .filter((r: any) => !r.error);
      // RE-SCORED from the stored prose, never from the fields written at generation time.
      const s = rows.map((r: any) => score(String(r.prose ?? '')));
      return { label, n: rows.length, s,
               words: s.reduce((a, b) => a + b.words, 0),
               acts: s.reduce((a, b) => a + b.acts, 0),
               about: s.filter((x) => x.about).length,
               acted: s.filter((x) => x.acted).length,
               spoke: s.filter((x) => x.spoke).length,
               told: s.filter((x) => x.told).length };
    });
  const [A, C] = arms;
  console.log(`\n  "${TITLE}" · locked ${WHO} · directive: ${JSON.stringify(DIRECTIVE)}\n`);
  for (const a of arms) console.log(`  ${a.label}: ${a.n} usable, ${a.words} words of narration`);
  console.log('\n  DENSITY — per 1,000 words of narration, the comparable metric.');
  const den = (f: 'acts') => {
    const p = poisson(A[f], A.words, C[f], C.words);
    console.log(`    his action   ${per1000(A[f], A.words)} -> ${per1000(C[f], C.words)}`
      + `   (${A[f]} vs ${C[f]} events)   p = ${p.toFixed(4)}${p < 0.05 ? '  *' : ''}`);
  };
  den('acts');
  console.log('\n  BINARY — of every run, not only the ones that name him.');
  for (const f of ['about', 'acted', 'spoke', 'told'] as const) {
    const p = fisher(A[f], A.n - A[f], C[f], C.n - C[f]);
    console.log(`    ${f.padEnd(6)} ${(A[f] / A.n * 100).toFixed(1)}% (${A[f]}/${A.n}) -> `
      + `${(C[f] / C.n * 100).toFixed(1)}% (${C[f]}/${C.n})   p = ${p.toFixed(4)}${p < 0.05 ? '  *' : ''}`);
  }
  console.log('\n  Every rate is a FLOOR — anchored on his name, never a pronoun. Say "under X%".');
  process.exit(0);
}

// ---- an arm ----
if (CMD !== 'imported') {
const n = Number(process.argv[3] ?? 20);
mkdirSync(OUTDIR, { recursive: true });
const OUT = `${OUTDIR}/run.jsonl`;
const { stories } = await j('/api/stories', undefined, 'GET');
const story = stories.find((s: any) => s.title === TITLE);
if (!story) { console.error(`no story "${TITLE}" on ${B}`); process.exit(1); }
for (let i = 0; i < n; i++) {
  let row: Record<string, unknown>;
  try {
    const r = await j('/api/generate', { storyId: story.id, mode: 'direct', directive: DIRECTIVE });
    row = r.error ? { i, error: String(r.error) }
                  : { i, seconds: r.seconds, ...score(r.prose), prose: r.prose };
  } catch (e: any) { row = { i, error: `${e?.name ?? 'error'}: ${e?.message ?? e}` }; }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
}
console.log(`  ${n} done -> ${OUT}`);
}
