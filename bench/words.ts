// THE OLD WORDS STILL ON SCREEN. GLOSSARY.md names, for every term, the words a screen must not use
// for it (_Avoid_). test/ui/shots.js records the words on every surface (text.json beside the
// shots). This counts each avoided word in that record and says where it is.
//
//   bash test/ui/run.sh shots                                  # writes the record
//   node --experimental-strip-types bench/words.ts             # ~/.cache/anansi-v2/shots/text.json
//   node --experimental-strip-types bench/words.ts some/text.json
//   node --experimental-strip-types bench/words.ts s-waiting   # one surface, string by string
//   node --experimental-strip-types bench/words.ts check       # the detector's own cases
//
// The count is distinct strings, so it is the work left rather than how often the rail repeats.
//
// A term's own name is taken out of the text before counting, so "Pattern book" does not count as
// the avoided "book", and "Stale" does not count as the avoided "stale" of Out of date. Prose is
// not in the record at all (shots.js leaves `#col .block` out): a writer's words are theirs.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

type Term = { names: string[]; avoid: string[] };

/** Every term and its _Avoid_ list, read from GLOSSARY.md. A parenthesis is a note, not a word. */
export function terms(md: string): Term[] {
  const out: Term[] = [];
  let names: string[] | null = null;
  for (const line of md.split('\n')) {
    const head = line.match(/^\*\*(.+?)\*\*:\s*$/);
    if (head) { names = head[1].split(' / ').map((s) => s.trim()); continue; }
    const av = line.match(/^_Avoid_:\s*(.+)$/);
    if (av && names) {
      out.push({ names, avoid: av[1].replace(/\([^)]*\)/g, '').split(',').map((s) => s.trim()).filter(Boolean) });
      names = null;
    }
  }
  return out;
}

/** Phrases that contain an avoided word and are right anyway: names of formats from elsewhere.
 *  Story Cards are AI Dungeon's, named on the Import page as that app names them. */
const ALLOW = ['character card', 'Story Cards'];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(s)}(?![\\p{L}\\p{N}])`, 'giu');

/** How often each avoided word appears in `lines`, with every term's own name taken out first. */
export function count(all: Term[], lines: string[]) {
  const strip = [...all.flatMap((t) => t.names), ...ALLOW].sort((a, b) => b.length - a.length);
  const hits: { term: string; avoid: string; n: number }[] = [];
  const clean = lines.map((l) => strip.reduce((s, name) => s.replace(word(name), ' '), l));
  for (const t of all) for (const a of t.avoid) {
    const n = clean.reduce((k, l) => k + (l.match(word(a))?.length ?? 0), 0);
    if (n) hits.push({ term: t.names.join(' / '), avoid: a, n });
  }
  return hits;
}

const here = dirname(fileURLToPath(import.meta.url));
const glossary = () => terms(readFileSync(join(here, '..', 'GLOSSARY.md'), 'utf8'));

if (process.argv[2] === 'check') {
  const T = terms('**Tale**:\nWhat you write.\n_Avoid_: story, book\n\n**Pattern book**:\nPrompts.\n_Avoid_: the web\n'
    + '**Voice / Your voice**:\nHow it sounds.\n_Avoid_: register (except for spice), voice of the weave\n');
  assert.deepStrictEqual(T.map((t) => t.names), [['Tale'], ['Pattern book'], ['Voice', 'Your voice']], 'terms and their names');
  assert.deepStrictEqual(T[2].avoid, ['register', 'voice of the weave'], 'a parenthesis is a note, not a word');
  const n = (lines: string[]) => Object.fromEntries(count(T, lines).map((h) => [h.avoid, h.n]));
  assert.deepStrictEqual(n(['New story', 'My stories']), { story: 1 }, 'whole words only: "stories" is not "story"');
  assert.deepStrictEqual(n(['Open the Pattern book']), {}, "a term's own name does not count as its avoided word");
  assert.deepStrictEqual(n(['A book, a Book, BOOK']), { book: 3 }, 'any case');
  assert.deepStrictEqual(n(['Storybook', 'bookish']), {}, 'not inside another word');
  assert.deepStrictEqual(n(['Import a character card']), {}, 'an allowed phrase is not a hit');
  assert.deepStrictEqual(n(['Open The Web']), { 'the web': 1 }, 'phrases match as phrases');
  assert.ok(glossary().length > 30, 'the real glossary parses into its terms');
  console.log('  ok  words: 9 cases, both directions');
} else if (process.argv[2] && !process.argv[2].endsWith('.json')) {
  // ONE SURFACE, string by string: the worklist for that screen.
  const file = join(process.env.HOME ?? '', '.cache/anansi-v2/shots/text.json');
  const lines: string[] = JSON.parse(readFileSync(file, 'utf8'))[process.argv[2]] ?? [];
  const all = glossary();
  for (const l of new Set(lines)) {
    const hit = count(all, [l]);
    if (hit.length) console.log(`  [${hit.map((h) => `${h.avoid}→${h.term}`).join('; ')}]  ${l}`);
  }
} else {
  const file = process.argv[2] ?? join(process.env.HOME ?? '', '.cache/anansi-v2/shots/text.json');
  // What changed is left out: its old entries are history, written in the words of their day.
  const record: Record<string, string[]> = Object.fromEntries(Object.entries(
    JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>).filter(([s]) => s !== 'w-news'));
  const all = glossary();
  // DISTINCT STRINGS, not occurrences: the rail is on every surface, and one label counted forty
  // times is still one label to change. The count is the work left.
  const rows = count(all, [...new Set(Object.values(record).flat())]).sort((a, b) => b.n - a.n);
  const where = (avoid: string) => Object.entries(record)
    .filter(([, lines]) => count(all.map((t) => ({ ...t, avoid: t.avoid.filter((a) => a === avoid) })), lines).length)
    .map(([s]) => s);
  for (const r of rows) {
    const w = where(r.avoid);
    console.log(`  ${String(r.n).padStart(4)}  "${r.avoid}" → ${r.term}   ${w.slice(0, 4).join(', ')}${w.length > 4 ? ` +${w.length - 4}` : ''}`);
  }
  console.log(`\n  ${rows.reduce((k, r) => k + r.n, 0)} old words in distinct strings, on ${Object.keys(record).length} surfaces (What changed left out)`);
}
