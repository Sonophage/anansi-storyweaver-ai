/* Do the comments still describe the code?
 *
 *   node --experimental-strip-types bench/stale.ts
 *
 * 38% of this tree is comment and they are the reason it is workable -- they carry the WHY and the
 * arguments that were settled. But they drift like any other prose, and a stale comment is worse
 * than none: it is authoritative and it is touching the code. Three were found wrong in one day on
 * 2026-09-06 -- a note claiming a CSS token "survives for the big composer" weeks after nothing
 * referenced it, a note saying three columns were unread when two had been read for a fortnight, and
 * a harness header calling itself read-only directly above the line explaining that it is not.
 *
 * WHAT IT DOES. Pulls every `backticked` identifier out of every comment and asks whether that
 * name exists anywhere in the tree outside comments. A name that appears only in prose is either
 * something that was deleted and the comment was not, or a word in backticks that was never code.
 *
 * IT PRINTS, IT DOES NOT THROW, and it will never be empty: plenty of legitimate backticks name
 * SQL keywords, env vars, shell commands and file paths. It is a list to read, not a gate. The
 * ratio is the signal -- a name that once existed and now does not is the interesting case.
 *
 * VALIDATED BOTH WAYS, per the rule this repo learned the hard way: the self-check below plants a
 * name that cannot exist and one that certainly does, and asserts the scan separates them. Without
 * that, a scan whose extraction silently matched nothing would report a perfectly clean tree.
 */
import { readFileSync, readdirSync } from 'node:fs';

const R = new URL('../', import.meta.url).pathname;
const files = [
  ...readdirSync(R + 'src').filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`),
  ...readdirSync(R + 'web').filter((f) => f.endsWith('.js')).map((f) => `web/${f}`),
  'serve.ts', 'run.ts', 'status.ts',
];
const body = new Map(files.map((f) => [f, readFileSync(R + f, 'utf8')]));

/** Comment text only, and code text only, kept apart -- the whole question is whether a name lives
 *  in one and not the other. Block comments, line comments and SQL `--` comments all count. */
const split = (src: string) => {
  const comments: string[] = [];
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => { comments.push(m); return ' '; })
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => { comments.push(m); return ' '; })
    .replace(/^\s*--[^\n]*/gm, (m) => { comments.push(m); return ' '; });
  return { comments: comments.join('\n'), code };
};

const parts = new Map([...body].map(([f, src]) => [f, split(src)]));
const allCode = [...parts.values()].map((p) => p.code).join('\n');

// Names that are not code and never were: SQL, shell, HTTP, env vars, file paths, prose in ticks.
const NOISE = /^(?:[A-Z_]{2,}|\d|.{1,2}$|https?:|\/|[a-z]+\.(md|ts|js|db|html|sh|json)$)/;
const KEYWORDS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'WHERE', 'NULL', 'true',
  'false', 'null', 'undefined', 'string', 'number', 'boolean', 'void', 'any', 'const', 'let']);

const findings: { file: string; name: string; n: number }[] = [];
for (const [f, { comments }] of parts) {
  const seen = new Set<string>();
  for (const m of comments.matchAll(/`([A-Za-z_$][\w$.]{2,40})`/g)) {
    const raw = m[1];
    const name = raw.split('.').pop()!;                 // `db.keysOf` -> keysOf
    if (seen.has(raw) || NOISE.test(raw) || KEYWORDS.has(name) || name.length < 3) continue;
    seen.add(raw);
    const used = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(allCode);
    if (!used) findings.push({ file: f, name: raw, n: 0 });
  }
}

if (process.argv[2] === 'check') {
  // A name that cannot exist must be flagged; a name that certainly does must not.
  const probe = (comment: string) => {
    const { comments } = split(comment);
    const out: string[] = [];
    for (const m of comments.matchAll(/`([A-Za-z_$][\w$.]{2,40})`/g)) {
      const raw = m[1], nm = raw.split('.').pop()!;
      if (NOISE.test(raw) || KEYWORDS.has(nm) || nm.length < 3) continue;
      if (!new RegExp(`\\b${nm}\\b`).test(allCode)) out.push(raw);
    }
    return out;
  };
  const cases: [string, string[], string][] = [
    ['// see `zzNoSuchSymbolAnywhere` for why', ['zzNoSuchSymbolAnywhere'], 'a deleted name is flagged'],
    ['// see `buildContext` for why', [], 'a live name is not flagged'],
    ['/* `zzGoneToo` and `narrationOnly` */', ['zzGoneToo'], 'mixed: only the dead one'],
    ['// no backticks here at all', [], 'nothing to say'],
  ];
  let bad = 0;
  for (const [text, want, why] of cases) {
    const got = probe(text);
    if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`  RED  ${JSON.stringify(text)} -> ${JSON.stringify(got)}, wanted ${JSON.stringify(want)} (${why})`); bad++; }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this`
                  : `\n  ${cases.length} cases, all green — the scan tells a deleted name from a live one`);
  process.exit(bad ? 1 : 0);
}

console.log('\n  stale comment scan — backticked names that exist in prose and nowhere in the code\n');
const byFile = new Map<string, string[]>();
for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f.name]);
for (const [f, names] of [...byFile].sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${f.padEnd(18)} ${names.length.toString().padStart(3)}  ${names.slice(0, 8).join(', ')}${names.length > 8 ? ' …' : ''}`);

const total = findings.length;
const ticked = [...parts.values()].reduce((a, p) => a + [...p.comments.matchAll(/`[^`]+`/g)].length, 0);
console.log(`\n  ${total} unresolved of ${ticked} backticked spans in comments`
  + ` (${(total / Math.max(ticked, 1) * 100).toFixed(1)}%).`);
console.log('  Most are SQL, env vars, paths or prose in ticks. Read them; a name that USED to be'
  + '\n  code is the one that matters.\n');
