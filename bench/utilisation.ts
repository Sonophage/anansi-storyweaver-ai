// Block utilisation: did a block that reached the prompt do any work?
//
// PLAN-06 §3 "The commonality" — all three recall options add material to a prompt whose problem is
// not scarcity, and none of them can be judged because nothing has ever read the manifest back
// against the prose. `generations.manifest` stores every block whole for the newest 200 calls
// (db.ts:1472 nulls the rest) and `tieGeneration` (db.ts:855) joins the call to the take that was
// kept. This points `quoted()` at every included block instead of only canon bodies.
//
//   node --experimental-strip-types bench/utilisation.ts check    # the scorer, no model, no db
//   node --experimental-strip-types bench/utilisation.ts          # the baseline, read-only db
//
// What this measures and what it does not:
//
// - "Drew on" means a weighted 3-gram run shared between the block's text and the prose, on
//   quote-detect.ts's threshold. That is lexical lift, not influence. A block the model obeyed in
//   its own words scores zero here — quote-detect's own case list says so, and the MODE and
//   DIRECTIVE kinds are instructions that would be followed rather than echoed. Read a zero as
//   "no verbatim lift", never as "no effect".
// - Tokens are the manifest's own estimates. PLAN-06 §2a measures that estimator 30–48% high on
//   real prose, and §2d notes SYSTEM is absent from the manifest entirely, so `share` is the share
//   of manifest-counted tokens and not of the real prompt.
// - Prose is scored raw, not through `narrationOnly`. bench/quote.ts does the same: a lifted phrase
//   is a lift wherever it lands, and the failure this detector was built on ("pulls out a
//   weather-beaten Martin guitar") is a lift into a sentence, not a claim about the world. The
//   narration-only rule governs checks that decide what is TRUE. This decides what was reused.
// - quote-detect's `weighty` guard is doing real work at the canon end, and it cuts both ways.
//   Measured on this database 2026-08-27: eight of the fifty-one scorable generations share at
//   least one 3-gram with a canon body, and four of those runs look like genuine lifts — "copper
//   red curls", "jeans cuffed at the", "silver rings on", "the night lords" — every one rejected
//   because a 3-gram needs three tokens over three characters. So CANON's zero below is a zero AT
//   THE SHIPPED THRESHOLD, and the threshold is conservative. It is not re-tuned here: n=3 plus
//   the weight rule is the only setting quote-detect has both-direction cases for, and a second
//   scorer in a second file is how two classifiers start drifting apart.
import { DatabaseSync } from 'node:sqlite';
import { ORDER } from '../src/blocks.ts';
import { quoted } from './quote-detect.ts';

type Block = { kind: string; id?: string; text?: string; tokens?: number; state?: string };
type Scored = { kind: string; id: string; tokens: number; runs: number; longest: string };

/** Every INCLUDED block of one manifest, scored against the prose that call produced.
 *  Excluded blocks are dropped here and nowhere else, so the `check` cases below can prove it. */
export function scoreGeneration(manifest: { blocks?: Block[] }, prose: string): Scored[] {
  return (manifest.blocks ?? [])
    .filter((b) => b.state === 'included')
    .map((b) => {
      const q = quoted(prose, [String(b.text ?? '')]);
      return {
        kind: String(b.kind), id: String(b.id ?? ''), tokens: Number(b.tokens ?? 0),
        runs: q.runs, longest: q.longest,
      };
    });
}

/** Zero hits in n trials is a bound, not an absence — F12 called a 4% defect fixed on zero-in-sixty.
 *  Rule of three: the 95% upper bound is 3/n. */
const bound = (n: number) => `under ${(300 / n).toFixed(1)}%`;

// ---- the check. Nothing below the live-run line runs until this is green. ----

if (process.argv[2] === 'check') {
  // One synthetic generation. The prose lifts from the canon block and from the tail, obeys the
  // mode block without echoing it, and shares nothing with the spine.
  const PROSE = 'She shrugs off the thrifted military jacket and sets the Martin case against the '
    + 'wall. The rain had not let up since the sedan pulled away from the kerb.';
  const MANIFEST = {
    blocks: [
      { kind: 'CANON-ALWAYS', id: 'e-jacket', tokens: 40, state: 'included',
        text: '[Halsey: wearing a thrifted military jacket and carrying a weather-beaten Martin guitar.]' },
      { kind: 'CANON-ALWAYS', id: 'e-broker', tokens: 30, state: 'included',
        text: '[Ilse Vantar: a currency broker who keeps a ledger of favours in a locked drawer.]' },
      { kind: 'TAIL', id: 'p-prev', tokens: 60, state: 'included',
        text: 'The sedan pulled away from the kerb and left her standing in the rain.' },
      { kind: 'MODE', id: 'mode', tokens: 20, state: 'included',
        text: 'Write one passage. Do not summarise. End on an image, not a conclusion.' },
      { kind: 'SPINE', id: 'spine', tokens: 50, state: 'included',
        text: 'A noir romance about debt, radio towers, and the people who service them.' },
      { kind: 'CANON-TRIGGERED', id: 'e-evicted', tokens: 40, state: 'evicted',
        text: '[Halsey: wearing a thrifted military jacket and carrying a weather-beaten Martin guitar.]' },
    ],
  };

  // [block id, should it score, why]
  const CASES: [string, boolean, string][] = [
    ['e-jacket', true, 'the block the prose drew on — "thrifted military jacket" came back whole'],
    ['p-prev', true, 'the previous passage, lifted: "pulled away from the kerb"'],
    ['e-broker', false, 'a block in the same prompt that the prose never touched — if this scores, '
      + 'every block scores and the instrument reports the prompt as fully used'],
    ['mode', false, 'an instruction the prose obeyed without echoing — obedience is not lift, and '
      + 'reading this as "MODE did nothing" is the misreading the header warns about'],
    ['spine', false, 'shares only ordinary words with the prose'],
  ];

  const scored = scoreGeneration(MANIFEST, PROSE);
  const by = new Map(scored.map((s) => [s.id, s]));
  let bad = 0;
  const red = (why: string) => { bad++; console.log(`  RED  ${why}`); };

  for (const [id, want, why] of CASES) {
    const s = by.get(id);
    if (!s) { red(`${id} was not scored at all — ${why}`); continue; }
    if ((s.runs > 0) !== want)
      red(`${id} runs=${s.runs}, wanted ${want ? '>0' : '0'} — ${why}\n       ${JSON.stringify(s.longest)}`);
  }

  // The guard itself, asserted rather than assumed: an excluded block sitting in the manifest with
  // text the prose plainly lifted must not appear. Without this the filter can rot silently, and a
  // block that never reached the model would be counted as one the model used.
  if (by.has('e-evicted'))
    red('an evicted block was scored — only what was sent can have been used');

  // Empty prose must score nothing. A scorer that cannot report zero reports perfection.
  if (scoreGeneration(MANIFEST, '').some((s) => s.runs > 0))
    red('empty prose scored a hit — the detector cannot report zero');

  // The denominator rule, asserted on the aggregation and not only described in the report: a kind
  // present in no manifest is not a kind that failed.
  const present = scored.filter((s) => s.kind === 'CANON-TRIGGERED').length;
  if (present !== 0) red('CANON-TRIGGERED was included nowhere in the fixture, so it must not count');
  if (!bound(60).startsWith('under 5.0')) red(`the zero bound is wrong: 0 in 60 is ${bound(60)}`);

  console.log(bad ? `\n  ${bad} RED — do not believe a result from this`
                  : `\n  ${CASES.length + 4} cases, all green`);
  process.exit(bad ? 1 : 0);
}

// ---- the baseline. Read-only, no model, no writes. ----

const FILE = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
const db = new DatabaseSync(FILE, { readOnly: true });

const q = (sql: string) => db.prepare(sql);
const count = (sql: string) => Number((q(sql).get() as any).n);

const totalProse = count("SELECT COUNT(*) AS n FROM generations WHERE role = 'prose'");
const withManifest = count(
  "SELECT COUNT(*) AS n FROM generations WHERE role = 'prose' AND manifest IS NOT NULL");
const withPassage = count(
  "SELECT COUNT(*) AS n FROM generations WHERE role = 'prose' AND passage_id IS NOT NULL");

// PLAN-06 §3 says 110 rows have both a manifest and a tied passage, and 110 rows do. That is not
// the same as 110 scorable: `passage_id` carries no foreign key (db.ts:282), so a take deleted
// after its call leaves the id behind pointing at nothing. The join is the honest denominator.
const withBothColumns = count(
  "SELECT COUNT(*) AS n FROM generations WHERE role = 'prose' AND manifest IS NOT NULL"
  + ' AND passage_id IS NOT NULL');

const rows = q(`SELECT g.id, g.manifest, g.prompt_tokens, p.body
                  FROM generations g JOIN passages p ON p.id = g.passage_id
                 WHERE g.role = 'prose' AND g.manifest IS NOT NULL
                 ORDER BY g.created_at`).all() as any[];
const orphaned = withBothColumns - rows.length;

type Agg = {
  present: number;      // generations whose manifest included at least one block of this kind
  drew: number;         // ...of which the prose shared a run with at least one such block
  blocks: number; tokens: number; runs: number; longest: string; longestGen: string;
};
const kinds = new Map<string, Agg>();
const get = (k: string) => {
  let a = kinds.get(k);
  if (!a) kinds.set(k, a = { present: 0, drew: 0, blocks: 0, tokens: 0, runs: 0, longest: '', longestGen: '' });
  return a;
};

let scorable = 0, skipped = 0, allTokens = 0;
for (const r of rows) {
  let m: any;
  try { m = JSON.parse(r.manifest); } catch { skipped++; continue; }
  const prose = String(r.body ?? '').trim();
  const scored = prose ? scoreGeneration(m, prose) : [];
  if (!scored.length) { skipped++; continue; }
  scorable++;

  const here = new Map<string, { runs: number; tokens: number; blocks: number }>();
  for (const s of scored) {
    allTokens += s.tokens;
    const h = here.get(s.kind) ?? { runs: 0, tokens: 0, blocks: 0 };
    h.runs += s.runs; h.tokens += s.tokens; h.blocks++;
    here.set(s.kind, h);
    const a = get(s.kind);
    if (s.longest.length > a.longest.length) { a.longest = s.longest; a.longestGen = r.id; }
  }
  for (const [k, h] of here) {
    const a = get(k);
    a.present++; a.blocks += h.blocks; a.tokens += h.tokens; a.runs += h.runs;
    if (h.runs > 0) a.drew++;
  }
}

const pct = (x: number, of: number) => of ? `${(100 * x / of).toFixed(1)}%` : '—';
const n2 = (x: number) => x.toLocaleString('en-GB');

console.log(`\n  block utilisation — ${FILE}\n`);
console.log(`  ${totalProse} prose generations. ${withManifest} still hold a manifest (db.ts keeps`
  + ` the newest 200), ${withPassage} are tied to a passage.`);
console.log(`  ${withBothColumns} carry both — but ${orphaned} of those name a passage that no longer`
  + ` exists (a take deleted after the fact), so only ${rows.length} can be joined.`);
console.log(`  ${scorable} scored; ${skipped} skipped (unparseable manifest, empty passage, or no`
  + ` included block).`);
console.log(`\n  The denominator is per kind, not ${scorable}: a kind absent from a manifest is not`
  + ` a kind that failed.\n`);

const order = [...kinds.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
const head = ['kind', 'in gens', 'blocks/gen', 'tok/gen', 'share', 'drew', 'rate', 'runs/gen'];
const w = [17, 9, 11, 9, 8, 6, 12, 9];
console.log('  ' + head.map((h, i) => h.padEnd(w[i])).join(''));
for (const [k, a] of order) {
  const cells = [
    k,
    `${a.present}/${scorable}`,
    (a.blocks / a.present).toFixed(1),
    Math.round(a.tokens / a.present).toString(),
    pct(a.tokens, allTokens),
    `${a.drew}`,
    a.drew ? pct(a.drew, a.present) : bound(a.present),
    (a.runs / a.present).toFixed(2),
  ];
  console.log('  ' + cells.map((c, i) => c.padEnd(w[i])).join(''));
}

console.log('');
for (const [k, a] of order) {
  const rate = a.drew
    ? `shared a phrase with the prose in ${a.drew}/${a.present} (${pct(a.drew, a.present)})`
    : `shared a phrase with the prose in 0/${a.present} — ${bound(a.present)}, not zero`;
  const run = a.longest ? `longest shared run ${JSON.stringify(a.longest)} (${a.longestGen})`
    : 'no shared run of any length';
  console.log(`  ${k}: present in ${a.present}/${scorable} generations at`
    + ` ${Math.round(a.tokens / a.present)} tok/gen, ${pct(a.tokens, allTokens)} of manifest tokens;`
    + ` ${rate}; ${run}.`);
}
const unsent = ORDER.filter((k) => !kinds.has(k));
console.log(`\n  Never sent at all, so they cannot have failed and are not rated above:`
  + ` ${unsent.join(', ') || 'none'}.`);
console.log(`  "Drew on" is verbatim lift on quote-detect's threshold. A block obeyed in the model's`
  + ` own words scores zero here.\n`);
