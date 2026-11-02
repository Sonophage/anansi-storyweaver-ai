// #122 · ONE WORD-LEVEL DIFF for every thread and Voice change: `wordDiff` and its rendering
// `diffHTML`, both in web/model.js. Run alone:
//   node --experimental-strip-types test/diff.ts
//
// Each case is checked BOTH WAYS, a→b and b→a, and every result against the one property any diff
// must hold whatever it chose to mark: the kept and removed pieces spell the old text exactly, and
// the kept and added pieces spell the new text exactly. The cases are the ones a word diff is not
// written for: punctuation, a repeated word, a moved sentence, an empty side, identical text.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const { wordDiff, diffHTML, historyPairs } = await import('../web/model.js');

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

const spell = (d: any[], keep: string) => d.filter((x) => x.op === '=' || x.op === keep).map((x) => x.text).join('');
const marked = (d: any[], op: string) => d.filter((x) => x.op === op).map((x) => x.text.trim()).filter(Boolean);
/** The property, in both directions, and a diff never marks a piece of nothing. */
const holds = (a: string, b: string, name: string) => {
  for (const [x, y] of [[a, b], [b, a]]) {
    const d = wordDiff(x, y);
    assert.strictEqual(spell(d, '-'), x, `${name}: kept and removed spell the old text`);
    assert.strictEqual(spell(d, '+'), y, `${name}: kept and added spell the new text`);
    assert.ok(d.every((p: any) => p.text.length > 0), `${name}: no empty piece`);
    // Pieces of the same kind are joined, so a change reads as one run, not a word at a time.
    assert.ok(d.every((p: any, i: number) => i === 0 || d[i - 1].op !== p.op), `${name}: runs are joined`);
  }
};

ok('DIFF-SAME: identical text is one kept piece, nothing marked', () => {
  const t = 'Wren keeps the key on a cord.';
  holds(t, t, 'same');
  assert.deepStrictEqual(wordDiff(t, t), [{ op: '=', text: t }]);
});

ok('DIFF-EMPTY: an empty side is all added one way and all removed the other', () => {
  const t = 'The ferryman takes no coin.';
  holds('', t, 'empty');
  assert.deepStrictEqual(wordDiff('', t), [{ op: '+', text: t }]);
  assert.deepStrictEqual(wordDiff(t, ''), [{ op: '-', text: t }]);
  assert.deepStrictEqual(wordDiff('', ''), []);
});

ok('DIFF-WORD: one word swapped is that word, and the rest is kept', () => {
  const a = 'Wren keeps the silver key.', b = 'Wren keeps the iron key.';
  holds(a, b, 'word');
  assert.deepStrictEqual(marked(wordDiff(a, b), '-'), ['silver']);
  assert.deepStrictEqual(marked(wordDiff(a, b), '+'), ['iron']);
});

ok('DIFF-PUNCT: a changed stop is the stop, not the word it is stuck to', () => {
  const a = 'She ran.', b = 'She ran!';
  holds(a, b, 'punct');
  assert.deepStrictEqual(marked(wordDiff(a, b), '-'), ['.']);
  assert.deepStrictEqual(marked(wordDiff(a, b), '+'), ['!']);
  // A comma added inside a sentence marks only the comma.
  const c = wordDiff('Yes she did', 'Yes, she did');
  holds('Yes she did', 'Yes, she did', 'comma');
  assert.deepStrictEqual(marked(c, '+'), [',']);
  assert.deepStrictEqual(marked(c, '-'), []);
  // An apostrophe belongs to its word: "don't" is one word, not three.
  assert.deepStrictEqual(marked(wordDiff("I don't know", "I won't know"), '-'), ["don't"]);
  assert.deepStrictEqual(marked(wordDiff("I don't know", "I won't know"), '+'), ["won't"]);
  // And a word with a stop after it is still that word: only the word changes.
  assert.deepStrictEqual(marked(wordDiff('the grey coat.', 'the red coat.'), '-'), ['grey']);
  assert.deepStrictEqual(marked(wordDiff('He left.', 'He left again.'), '+'), ['again']);
});

ok('DIFF-REPEAT: a repeated word removed once marks one of them, not all', () => {
  const a = 'the the cat sat on the mat', b = 'the cat sat on the mat';
  holds(a, b, 'repeat');
  const d = wordDiff(a, b);
  assert.deepStrictEqual(marked(d, '-'), ['the']);
  assert.deepStrictEqual(marked(d, '+'), []);
  holds('no no no', 'no', 'repeat-three');
  assert.strictEqual(marked(wordDiff('no no no', 'no'), '-').join(' ').split(/\s+/).length, 2);
});

ok('DIFF-MOVED: a moved sentence is removed where it was and added where it went', () => {
  const s1 = 'The river is cold.', s2 = 'Wren cannot swim.', s3 = 'The ferry is late.';
  const a = `${s1} ${s2} ${s3}`, b = `${s2} ${s3} ${s1}`;
  holds(a, b, 'moved');
  const d = wordDiff(a, b);
  assert.ok(marked(d, '-').join(' ').includes('river is cold'), 'the moved sentence is marked removed');
  assert.ok(marked(d, '+').join(' ').includes('river is cold'), 'and marked added');
  assert.ok(!marked(d, '-').join(' ').includes('swim') && !marked(d, '+').join(' ').includes('swim'),
    'the sentences that stayed in order are kept');
});

ok('DIFF-WHOLE: wholly different text reads as one removal and one addition', () => {
  const a = 'A tall man in grey.', b = 'Her sister, older.';
  holds(a, b, 'whole');
  // A shared space between two changed words is not a kept piece of its own: it would split the
  // change into word, space, word, which reads as noise on a phone.
  assert.ok(!wordDiff('the cat', 'a dog').some((p: any) => p.op === '=' && !p.text.trim()),
    'a lone shared space is folded into the change');
});

ok('DIFF-LINES: line breaks are kept as they were', () => {
  const a = 'One.\nTwo.\n\nThree.', b = 'One.\nTwo, then.\n\nThree.';
  holds(a, b, 'lines');
  assert.deepStrictEqual(marked(wordDiff(a, b), '+'), [', then']);
});

ok('DIFF-NULL: a missing side reads as empty, never as "null"', () => {
  assert.deepStrictEqual(wordDiff(null, 'x'), [{ op: '+', text: 'x' }]);
  assert.deepStrictEqual(wordDiff('x', undefined), [{ op: '-', text: 'x' }]);
});

ok('DIFF-BIG: a long text still diffs, and still spells both sides', () => {
  const words = Array.from({ length: 4000 }, (_, i) => `w${i % 97}`);
  const a = words.join(' '), b = [...words.slice(0, 2000), 'CHANGED', ...words.slice(2001)].join(' ');
  holds(a, b, 'big');
  assert.deepStrictEqual(marked(wordDiff(a, b), '+'), ['CHANGED']);
  // Past the table's ceiling (nothing shared to trim): all removed, all added, and still exact.
  // A word they share in the middle is not looked for there: the ceiling is a choice, held here.
  const p = Array.from({ length: 2500 }, (_, i) => i === 1250 ? 'shared' : `a${i}`).join(' ');
  const q = Array.from({ length: 2500 }, (_, i) => i === 1250 ? 'shared' : `b${i}`).join(' ');
  holds(p, q, 'past the ceiling');
  assert.deepStrictEqual(wordDiff(p, q).map((x: any) => x.op), ['-', '+']);
  // Under it, in the middle of a long text with no shared start or end: the LCS walk itself.
  const r = Array.from({ length: 600 }, (_, i) => `w${i % 37}`);
  const s = ['X', ...r.slice(0, 300), 'Y', ...r.slice(300), 'Z'];
  holds(r.join(' '), s.join(' '), 'long middle');
  assert.deepStrictEqual(marked(wordDiff(r.join(' '), s.join(' ')), '+'), ['X', 'Y', 'Z']);
});

ok('DIFF-HTML: a Was / Now switch over the text, the changed words marked in each, escaped', () => {
  // Seth chose the switch on 2026-10-29 (design canvas, option D): one paragraph at a time, Now first,
  // the words that changed marked in place so they stand out as it flips. <del> and <ins> stay, so a
  // screen reader still hears which is which.
  const h = diffHTML('Wren keeps the <silver> key.', 'Wren keeps the iron key & cord.');
  assert.ok(/^<div class="diff" data-view="now">/.test(h), 'DIFF-NOW-FIRST: one wrapper, opening on Now');
  assert.match(h, /<button[^>]*data-diffview="was"[^>]*aria-pressed="false"[^>]*>Was<\/button>/, 'DIFF-SWITCH: a Was press');
  assert.match(h, /<button[^>]*data-diffview="now"[^>]*aria-pressed="true"[^>]*>Now<\/button>/, '  and a Now press, pressed');
  const now = h.match(/<p class="dnow">([\s\S]*?)<\/p>/)?.[1] ?? '', was = h.match(/<p class="dwas">([\s\S]*?)<\/p>/)?.[1] ?? '';
  assert.ok(now.includes('<ins>iron</ins>') && !now.includes('<del>'), 'DIFF-NOW: Now is the new text, the added words marked');
  assert.ok(was.includes('<del>&lt;silver&gt;</del>') && !was.includes('<ins>'), 'DIFF-WAS: Was is the old text, the removed words marked, escaped');
  assert.ok(now.includes('&amp;'), 'kept and added text escaped too');
  assert.ok(!/<del>|<ins>|data-diffview/.test(diffHTML('same', 'same')), 'identical text has no marks and no switch');
  assert.match(diffHTML('', 'a'), /<p class="dwas"><span class="dnone">Nothing yet<\/span><\/p>/, 'DIFF-EMPTY: an empty Was says so');
  assert.match(diffHTML('a', ''), /<p class="dnow"><span class="dnone">Nothing<\/span><\/p>/, '  and an empty Now');
});

// NO MARKS SINCE 2026-11-01 (Seth: "the underlined diffed view no longer needs to be there since we
// have the was and now buttons"). Until then the changed words sat on the accent's line, and this
// checked that line against every theme's paper. Now each view is plain text, in the text's own ink.
ok('DIFF-PLAIN: the changed words carry no line, no accent and no colour of their own', () => {
  const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  const marks = css.match(/\.diff (?:ins|del)[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(marks.length, 'the rule for the marks is there');
  for (const m of marks) assert.doesNotMatch(m, /box-shadow|underline|var\(--(?:gold|dim)\)/, `no line: ${m}`);
  assert.doesNotMatch(css.match(/\.diff[^{]*\{[^}]*\}/g)!.join(''), /#[0-9a-f]{3,8}\b|rgba?\(/i, 'and no literal colour');
});

// ALTERATIONS: each earlier version against the one that replaced it. The rows come newest first,
// as `db.entryHistory` sends them, so a field's next version is the nearest NEWER row for the same
// field, or the thread as it is now. Written against rows shaped like the database's, mixed fields.
ok('HIST-PAIRS: each version is read against the one that came after it', () => {
  const e = { title: 'Wren', body: 'She keeps the iron key.', keys: ['Wren', 'the girl'],
    addons: [{ id: 'a1', slot: 'voice', body: 'Clipped, dry.' }], outfits: [{ id: 'o1', slot: 'outfit', body: 'A grey coat.' }] };
  const rows = [
    { id: 'r1', field: 'body', previous_value: 'She keeps the silver key.' },
    { id: 'r2', field: 'pocket:a1', previous_value: 'Clipped.' },
    { id: 'r3', field: 'keys', previous_value: '["Wren"]' },
    { id: 'r4', field: 'body', previous_value: 'She keeps a key.' },
    { id: 'r5', field: 'pocket:gone', previous_value: 'Hums when nervous.' },
    { id: 'r6', field: 'pocket:o1', previous_value: 'A red coat.' },
    { id: 'r7', field: 'title', previous_value: 'Wren Halloway' },
    { id: 'r8', field: 'body', previous_value: 'A key.' },
  ];
  const h = historyPairs(rows, e);
  assert.deepStrictEqual(h.map((x: any) => x.id), rows.map((r) => r.id), 'every row, in the order given');
  const by = Object.fromEntries(h.map((x: any) => [x.id, [x.was, x.now]]));
  assert.deepStrictEqual(by.r1, ['She keeps the silver key.', 'She keeps the iron key.'], 'newest body against the thread now');
  assert.deepStrictEqual(by.r4, ['She keeps a key.', 'She keeps the silver key.'], 'older body against the newer version, not the thread now');
  assert.deepStrictEqual(by.r8, ['A key.', 'She keeps a key.'], 'the oldest against the NEAREST newer version');
  assert.deepStrictEqual(by.r2, ['Clipped.', 'Clipped, dry.'], 'a pocket against the pocket now');
  assert.deepStrictEqual(by.r6, ['A red coat.', 'A grey coat.'], 'an outfit is a pocket too');
  assert.deepStrictEqual(by.r3, ['Wren', 'Wren, the girl'], 'wake words read as words, not JSON');
  assert.deepStrictEqual(by.r7, ['Wren Halloway', 'Wren'], 'the name');
  assert.deepStrictEqual(by.r5, ['Hums when nervous.', null], 'a deleted pocket has nothing after it to read against');
  assert.deepStrictEqual(historyPairs([], e), []);
  assert.deepStrictEqual(historyPairs(null, e), []);
  // No thread in hand (it was deleted under the screen): every row stands alone, none invented.
  assert.deepStrictEqual(historyPairs([rows[0]], null).map((x: any) => x.now), [null]);
});

console.log(`\n  ${n} diff checks passed`);
