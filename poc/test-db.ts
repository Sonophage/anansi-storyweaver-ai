// Persistence checks. Runs against a scratch database, never the real one.
// ESM imports hoist, so the env var must be set before db.ts is *loaded*, not merely
// before the import statement appears. A static import here would have opened the real
// database and run destructive tests against the actual book.
process.env.ANANSI_DB = '/tmp/anansi-test.db';
import assert from 'node:assert';
import { unlinkSync, readFileSync } from 'node:fs';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync('/tmp/anansi-test.db' + f); } catch {} }
const db = await import('./src/db.ts');

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

ok('the schema literal contains no backtick', () => {
  // Twice now a backtick inside a SQL comment has terminated the template literal holding
  // the schema, which fails as a TypeScript syntax error a long way from the cause.
  const src = readFileSync(new URL('./src/db.ts', import.meta.url), 'utf8');
  // The schema is the db.exec literal containing CREATE TABLE — not simply the first one,
  // which is a one-line DROP and is what an earlier version of this check matched.
  const lit = [...src.matchAll(/db\.exec\(`([\s\S]*?)`\);/g)]
    .map((m) => m[1]).find((t) => t.includes('CREATE TABLE'));
  assert.ok(lit, 'the schema literal should be findable');
  assert.strictEqual(lit!.includes('`'), false,
    'a backtick in the schema ends the template literal early');
  // And SQL comments are `--`. A `//` in here parses as TypeScript and fails as SQL.
  assert.strictEqual(/^\s*\/\//m.test(lit!), false,
    'the schema uses SQL comments, not JavaScript ones');
});
const o = db.owner('test');
const s = db.createStory(o, { title: 'T', premise: 'p' });
const p1 = db.addPassage({ ...s, storyId: s.id, body: 'one' });

ok('a story is created with a primary branch and an open chapter', () => {
  assert.ok(s.branchId && s.chapterId);
  assert.strictEqual(db.chapters(s.id).length, 1);
});
ok('variants share an ordinal and only one is selected', () => {
  db.addVariant(s.id, p1, 'two'); db.addVariant(s.id, p1, 'three');
  // Asserted through the grouped query production actually uses, not a per-passage helper.
  const slots = db.variantsBySlot(s.id);
  const takes = [...slots.values()][0];
  assert.strictEqual(takes.length, 3);
  assert.strictEqual(takes.filter((x) => x.selected).length, 1);
  assert.strictEqual(slots.size, 1, 'three takes, one slot');
});
ok('every edit is kept and revert restores without losing the current text', () => {
  db.editPassage(s.id, p1, 'edited');
  const h = db.passageHistory(s.id, p1);
  assert.ok(h.length >= 1);
  db.revertPassage(s.id, p1, h[0].id);
  assert.ok(db.passageHistory(s.id, p1).length > h.length, 'the reverted-from text is itself kept');
});
ok('a summary goes stale only when the SELECTED prose changes', () => {
  const ch = db.chapters(s.id)[0] as any;
  db.setSummary(ch.id, 'sum', 1, db.proseHash(db.passagesOfChapter(ch.id).map((x: any) => x.body)));
  assert.strictEqual(db.summaryStale(db.chapters(s.id)[0]), false);

  // Editing a discarded variant must NOT invalidate the summary — it covers the selected
  // prose, and p1 is no longer selected after the variants test above.
  db.editPassage(s.id, p1, 'a discarded take, edited');
  assert.strictEqual(db.summaryStale(db.chapters(s.id)[0]), false,
    'a variant nobody chose cannot make a summary stale');

  // Editing what the reader actually sees must.
  const live = db.passagesOfChapter(ch.id)[0] as any;
  db.editPassage(s.id, live.id, 'the selected prose, changed');
  assert.strictEqual(db.summaryStale(db.chapters(s.id)[0]), true);
});
ok('ending a chapter closes the old one and opens the next', () => {
  const r = db.endChapter(s.id, s.branchId, 'Two');
  assert.strictEqual(r.idx, 2);
  assert.strictEqual((db.chapters(s.id)[0] as any).status, 'closed');
});
ok('entries upsert by row existence, not by whether an id was passed', () => {
  db.upsertEntry(s.id, o, { id: 'e-fixed', title: 'A', body: '[A]', keys: ['a'] });
  db.upsertEntry(s.id, o, { id: 'e-fixed', title: 'A2', body: '[A]', keys: ['a'] });
  assert.strictEqual(db.entriesOf(s.id).length, 1);
  assert.strictEqual((db.entriesOf(s.id)[0] as any).title, 'A2');
});
ok('deleting a story cascades', () => {
  db.delStory(s.id);
  assert.strictEqual(db.listStories(o).length, 0);
  assert.strictEqual(db.passagesOf(s.id).length, 0);
});
ok('backup writes a readable snapshot', () => {
  const b = db.backup('/tmp/anansi-test-backups', 3);
  assert.ok(b.bytes > 0);
});


// --- regressions for the bugs found in the 2026-08-23 review ---
const story = await import('./src/story.ts');

ok('the reserve scales with the budget and with the reply length', () => {
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  // The 6% margin follows the budget in use, not the slot: a story capped at 4,000 used to
  // lose 1,501 to a margin sized for 25,024.
  const small = story.budgetFor({ maxContext: 4000 }, slot);
  const full = story.budgetFor({ maxContext: null }, slot);
  assert.ok(full > small && full < 25024);
  assert.ok(small > 4000 * 0.6, `a 4000-token story kept only ${small}`);

  // And the output reserve follows max_tokens, because the guard only counts the prompt.
  // A longer reply with a constant reserve ran prompt+output past the slot, green.
  const short = story.budgetFor({ maxContext: null }, slot, 600);
  const long = story.budgetFor({ maxContext: null }, slot, 2000);
  assert.strictEqual(short - long, 1400, 'every extra reply token costs a prompt token');
});

ok('the estimator is within 15% of real tokens on prose', () => {
  const prose = 'The rain had not stopped for three days and the gutters ran black with it. '.repeat(20);
  const est = story.estimate(prose);
  // Measured against /tokenize: ~2.74 chars per token on this model and this kind of text.
  const real = prose.length / 2.74;
  assert.ok(Math.abs(est - real) / real < 0.15, `estimate ${est} vs ~${Math.round(real)}`);
});

ok('regenerating a passage does not show the model the passages after it', () => {
  const s2 = db.createStory(o, { title: 'W' });
  const ids = ['first', 'second', 'third', 'fourth']
    .map((b) => db.addPassage({ ...s2, storyId: s2.id, body: b }));
  const v = story.view(s2.id)!;
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const target = v.passages.find((p: any) => p.body === 'second')!;
  const whole = story.assemble(v, slot, 'direct', 'go');
  const upTo  = story.assemble(v, slot, 'direct', 'go', target.ordinal);
  assert.ok(whole.prompt.includes('fourth'), 'a normal call sees the whole document');
  assert.ok(!upTo.prompt.includes('fourth'), 'a regenerate must not see the future');
  assert.ok(!upTo.prompt.includes('second'), 'nor the passage it is replacing');
  assert.ok(upTo.prompt.includes('first'), 'but must see what came before');
  db.delStory(s2.id);
});

ok('variants survive the grouped query', () => {
  const s3 = db.createStory(o, { title: 'G' });
  const a = db.addPassage({ ...s3, storyId: s3.id, body: 'take one' });
  db.addVariant(s3.id, a, 'take two');
  db.addPassage({ ...s3, storyId: s3.id, body: 'a later passage' });
  const v = story.view(s3.id)!;
  const first = v.passages.find((p: any) => p.body === 'take two')!;
  assert.strictEqual(first.variants.length, 2, 'both takes are grouped onto the slot');
  assert.strictEqual(v.passages.find((p: any) => p.body === 'a later passage')!.variants.length, 1);
  db.delStory(s3.id);
});

ok('only canon that reached the prompt is a candidate for checking', () => {
  // The checker's input is the manifest, not the ledger. An entry that never fired must
  // not be checked, or a passage gets flagged for contradicting canon it was never shown.
  const s6 = db.createStory(o, { title: 'C' });
  db.addPassage({ ...s6, storyId: s6.id, body: 'He kept his hand on the coat all the way down.' });
  db.upsertEntry(s6.id, o, { title: 'the key', body: '[the key: brass]',
    activation: 'triggered', keys: ['coat'] });
  db.upsertEntry(s6.id, o, { title: 'the compact', body: '[the compact: signed in Ghelvane]',
    activation: 'triggered', keys: ['zither'] });
  const v = story.view(s6.id)!;
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const { manifest } = story.assemble(v, slot, 'direct');
  const reached = manifest.blocks
    .filter((b) => b.kind.startsWith('CANON') && b.state === 'included').map((b) => b.id);
  assert.strictEqual(reached.length, 1, 'one of the two entries fired');
  const fired = v.entries.find((e) => e.id === reached[0])!;
  assert.strictEqual(fired.title, 'the key');
  db.delStory(s6.id);
});

ok('deleting a passage takes its canon flags with it', () => {
  const s4 = db.createStory(o, { title: 'F' });
  const pid = db.addPassage({ ...s4, storyId: s4.id, body: 'the key was silver' });
  db.addViolation(s4.id, { passageId: pid, entryId: 'e-x', quote: 'silver',
    reason: 'canon says brass', confidence: 1 });
  assert.strictEqual(db.violationsOf(s4.id).length, 1);
  db.delPassage(s4.id, pid);
  assert.strictEqual(db.violationsOf(s4.id).length, 0, 'a flag must not outlive its passage');
  db.delStory(s4.id);
});

ok('the sweep removes orphans and anything under the confidence floor', () => {
  const s5 = db.createStory(o, { title: 'S' });
  const pid = db.addPassage({ ...s5, storyId: s5.id, body: 'x' });
  db.addViolation(s5.id, { passageId: pid, quote: 'a', reason: 'r', confidence: 0.2 });
  db.addViolation(s5.id, { passageId: pid, quote: 'b', reason: 'r', confidence: 0.9 });
  db.addViolation(s5.id, { passageId: 'p-gone', quote: 'c', reason: 'r', confidence: 0.9 });
  assert.strictEqual(db.pruneViolations(0.6), 2, 'the low one and the orphan');
  assert.strictEqual(db.violationsOf(s5.id).length, 1);
  db.delStory(s5.id);
});

// Entity resolution. Exercised directly because model output is not reproducible.
const { classifyFor } = await import('./src/routes.ts');
if (classifyFor) {
  const F = (who: string) => JSON.stringify({ title: who, body: who, keys: who });
  const ledger = [
    { id: 'e1', title: 'Aldis Fen', body: '[Aldis Fen: sergeant]', last_editor: 'human',
      field_editors: F('human'), keys: '[]' },
    { id: 'e2', title: 'Marek Vale', body: '[Marek Vale: lender]', last_editor: 'model',
      field_editors: F('model'), keys: '[]' },
    { id: 'e3', title: 'the Silver Key', body: '[key: brass]', last_editor: 'human',
      field_editors: F('human'), keys: '["key"]' },
    // Renamed by hand, body still the model's: the body is not yours to defend yet.
    { id: 'e4', title: 'Old Tom', body: '[Old Tom: boatman]', last_editor: 'human',
      field_editors: JSON.stringify({ title: 'human', body: 'model', keys: 'model' }), keys: '[]' },
  ];
  const kind = (t: string, body = 'x', keys: string[] = []) =>
    classifyFor(ledger, { title: t, body, keys })?.kind ?? 'none';
  ok('a shortened name resolves to the existing entry', () =>
    assert.strictEqual(kind('Aldis'), 'conflict'));
  ok('a model-written entry proposes as changed, not conflict', () =>
    assert.strictEqual(kind('Marek'), 'changed'));
  ok('a genuinely new subject is new', () =>
    assert.strictEqual(kind('The Bell'), 'new'));
  ok('a keyword naming another character does not resolve to them', () =>
    assert.strictEqual(kind('The Bell', 'x', ['bell', 'Aldis', 'Marek']), 'new'));
  ok('an identical body proposes nothing', () =>
    assert.strictEqual(kind('Aldis Fen', '[Aldis Fen: sergeant]'), 'none'));
  ok('articles do not defeat matching', () =>
    assert.strictEqual(kind('Silver Key'), 'conflict'));
  ok('a conflict means the BODY was yours, not just the title', () =>
    assert.strictEqual(kind('Old Tom'), 'changed',
      'renaming an entry must not freeze a body you never wrote'));
}


ok('forking copies the path so far and leaves the parent alone', () => {
  const s7 = db.createStory(o, { title: 'Fork' });
  const ids = ['one', 'two', 'three'].map((b) =>
    db.addPassage({ ...s7, storyId: s7.id, body: b }));
  db.addVariant(s7.id, ids[1], 'two, differently');   // a discarded take on the parent
  const at = 2;

  const b2 = db.forkBranch(s7.id, s7.branchId, at, 'the other way')!;
  assert.ok(b2, 'fork returned a branch');
  db.setActiveBranch(s7.id, b2);

  const onFork = db.passagesOf(s7.id).map((p: any) => p.body);
  assert.deepStrictEqual(onFork, ['one', 'two, differently'],
    'the fork carries the SELECTED prose up to the fork point, and nothing after it');

  // Write on the fork, then check the parent is untouched — the whole reason for copy-on-write.
  db.addPassage({ storyId: s7.id, branchId: b2, chapterId: db.chapters(s7.id)[0].id, body: 'a different three' });
  assert.strictEqual(db.passagesOf(s7.id).length, 3);

  db.setActiveBranch(s7.id, s7.branchId);
  assert.deepStrictEqual(db.passagesOf(s7.id).map((p: any) => p.body),
    ['one', 'two, differently', 'three'], 'the parent still has its own three passages');
  db.delStory(s7.id);
});

ok('the first path cannot be deleted, a fork can', () => {
  const s8 = db.createStory(o, { title: 'B' });
  db.addPassage({ ...s8, storyId: s8.id, body: 'x' });
  const f = db.forkBranch(s8.id, s8.branchId, 1, 'other')!;
  assert.strictEqual(db.deleteBranch(s8.id, s8.branchId), false, 'the trunk stays');
  db.setActiveBranch(s8.id, f);
  assert.strictEqual(db.deleteBranch(s8.id, f), true);
  assert.strictEqual(db.activeBranchOf(s8.id), s8.branchId, 'and you land back on the trunk');
  db.delStory(s8.id);
});

console.log(`\n${n} checks passed`);
