// Persistence checks. Runs against a scratch database, never the real one.
// ESM imports hoist, so the env var must be set before db.ts is *loaded*, not merely
// before the import statement appears. A static import here would have opened the real
// database and run destructive tests against the actual book.
process.env.ANANSI_DB = '/tmp/anansi-test.db';
import assert from 'node:assert';
import { unlinkSync, readFileSync } from 'node:fs';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync('/tmp/anansi-test.db' + f); } catch {} }
const db = await import('../src/db.ts');
const slots = await import('../src/slots.ts');
const prompts = await import('../src/prompts.ts');

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${name}`); };

ok('the schema literal contains no backtick', () => {
  // Twice now a backtick inside a SQL comment has terminated the template literal holding
  // the schema, which fails as a TypeScript syntax error a long way from the cause.
  const src = readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8');
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
const story = await import('../src/story.ts');
const render = await import('../src/render.ts');

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

// PLAN-06 2a. The check this replaces divided a fixture by 2.74 and compared it to an estimate
// that divided by 2.8 — it asserted the constant against ITSELF, could not fail while those two
// numbers agreed, and reported the estimator "within 15%" for as long as it was 59% out against
// 147 real calls. A comment saying "measured against /tokenize" is not a measurement.
ok('the estimator errs high against measured tokens, and against the lowest model, not the median', () => {
  // Ground truth off the generation log, 2026-08-28, via bench/drift.ts: row g-d8a77e3c is a
  // prompt of 18,107 characters that the server charged 4,067 tokens for — 4.45 chars/token on
  // Qwen3.6-WNTH-35B-A3B-NN. estimate() reads only `.length`, so the fixture's job is its size.
  const CHARS = 18_107, CHARGED = 4_067;
  const est = story.estimate('x'.repeat(CHARS));
  assert.ok(est >= CHARGED,
    `estimate ${est} is UNDER the ${CHARGED} tokens the server actually charged for this many `
    + 'characters. Low is the dangerous direction: buildContext lets the prompt through and '
    + 'fits() refuses it afterwards, which the writer sees as an error instead of as a trim.');

  // The rule the constant is chosen by, asserted rather than described. bench/drift.ts measured
  // 4.28 chars/token on rp-t-glm47flash-h over 45 calls — the LOWEST of any model with ten or
  // more. A divisor above that estimates low for whoever is writing on that model, which is the
  // whole reason this is not simply set to the 4.45 median of the model in front of us.
  const divisor = CHARS / est;
  assert.ok(divisor <= 4.28,
    `the divisor in force is ${divisor.toFixed(2)}, above the lowest chars/token measured across `
    + 'models (4.28, rp-t-glm47flash-h, n=45). Pick the lowest and round down, never the median '
    + 'and never the model you happen to be using — two writers may be on two tokenizers.');
  assert.ok(divisor >= 3.5,
    `the divisor in force is ${divisor.toFixed(2)}, which re-creates the over-estimate 2a was: `
    + 'at 2.8 every ceiling evicted 59% earlier than the slot required.');
});

// PLAN-06 2d. SYSTEM is prepended by render() and is not a block, so buildContext never saw it
// and the ceilings were cut from room that was already spent. Worth saying what this did NOT fix:
// the 6% margin was quietly large enough to absorb SYSTEM, so nothing was overflowing. What was
// wrong was the number — `totals.budget` told the writer they had ~445 tokens they did not, and
// the 45%/25%/60% ceilings were fractions of that wrong number.
ok('SYSTEM is spent before the budget is offered, because it is on the wire either way', () => {
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const cap = 25024, reply = 900;
  const b = story.budgetFor({ maxContext: null }, slot, reply);
  const ifSystemWereFree = cap - Math.max(600, reply) - Math.floor(cap * 0.06);
  assert.strictEqual(ifSystemWereFree - b, story.estimate(render.SYSTEM),
    'the budget must be short by exactly SYSTEM. Without the deduction the engine believes it '
    + 'has room that render() has already spent, and every ceiling is a fraction of a number '
    + 'that was never true.');
  assert.ok(story.estimate(render.SYSTEM) > 300,
    'SYSTEM costs real tokens — if this ever reads near zero, SYSTEM has moved and the deduction '
    + 'is deducting nothing');
});

ok('regenerating a passage does not show the model the passages after it', () => {
  const s2 = db.createStory(o, { title: 'W' });
  // Distinctive bodies, not ordinary words. These were 'first'/'second'/'third'/'fourth', and the
  // day the default point of view became "second person, present tense" the prompt legitimately
  // contained the word `second` and this test failed for a reason that had nothing to do with it.
  // A substring assertion on a common word is a fixture waiting to lie either way round.
  const bodies = ['PASSAGE-ALPHA', 'PASSAGE-BRAVO', 'PASSAGE-CHARLIE', 'PASSAGE-DELTA'];
  const ids = bodies.map((b) => db.addPassage({ ...s2, storyId: s2.id, body: b }));
  const v = story.view(s2.id)!;
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const target = v.passages.find((p: any) => p.body === 'PASSAGE-BRAVO')!;
  const whole = story.assemble(v, slot, 'direct', 'go');
  const upTo  = story.assemble(v, slot, 'direct', 'go', target.ordinal);
  assert.ok(whole.prompt.includes('PASSAGE-DELTA'), 'a normal call sees the whole document');
  assert.ok(!upTo.prompt.includes('PASSAGE-DELTA'), 'a regenerate must not see the future');
  assert.ok(!upTo.prompt.includes('PASSAGE-BRAVO'), 'nor the passage it is replacing');
  assert.ok(upTo.prompt.includes('PASSAGE-ALPHA'), 'but must see what came before');
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

ok('firing decides what the model is TOLD — and since COUNCIL-04 #7, only that', () => {
  // It used to decide what gets VERIFIED as well: one rule doing two jobs, failing together, so a
  // character who never fired could be contradicted freely. The check reads the whole ledger now
  // and marks each flag with whether the entry reached the prompt (see test/mend.ts §5). What is
  // asserted here is the half that did not change: the MANIFEST still carries only what fired.
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

ok('deleting the selected take promotes a sibling instead of hiding the slot', () => {
  const s9 = db.createStory(o, { title: 'Takes' });
  const base = db.addPassage({ ...s9, storyId: s9.id, body: 'take one' });
  db.addVariant(s9.id, base, 'take two');
  const three = db.addVariant(s9.id, base, 'take three');   // addVariant selects the new one
  // The selected take is what the book is. Deleting it used to leave the slot with nothing
  // selected, and every read filters on selected = 1 — so 'take one' and 'take two' stayed in
  // the database and vanished from the story, with no screen able to reach them.
  db.delPassage(s9.id, three);
  const takes = [...db.variantsBySlot(s9.id).values()][0];
  assert.strictEqual(takes.length, 2, 'the siblings are still there');
  assert.strictEqual(takes.filter((x) => x.selected).length, 1, 'and one of them is now the book');
  assert.strictEqual(db.passagesOfChapter(s9.chapterId).length, 1,
    'so the chapter still has its passage — this is the assertion that went to zero');
  assert.strictEqual((db.passagesOfChapter(s9.chapterId)[0] as any).body, 'take two',
    'the newest survivor, not the oldest');
  // The last take of a slot has nothing to promote, and the passage goes for good.
  const only = db.passagesOfChapter(s9.chapterId)[0] as any;
  db.delPassage(s9.id, only.id);
  db.delPassage(s9.id, base);
  assert.strictEqual(db.passagesOfChapter(s9.chapterId).length, 0, 'deleting every take empties it');
  db.delStory(s9.id);
});

ok('a flag records whether the canon it contradicts ever reached the model', () => {
  const s8 = db.createStory(o, { title: 'Reached' });
  const pid = db.addPassage({ ...s8, storyId: s8.id, body: 'the key was silver' });
  db.addViolation(s8.id, { passageId: pid, entryId: 'e-1', quote: 'silver', reason: 'brass',
    confidence: 1, reached: true });
  db.addViolation(s8.id, { passageId: pid, entryId: 'e-2', quote: 'silver', reason: 'never sent',
    confidence: 1, reached: false });
  const rows = db.violationsOf(s8.id);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.find((r: any) => r.entry_id === 'e-1').reached, 1,
    'canon the model was shown and contradicted anyway');
  assert.strictEqual(rows.find((r: any) => r.entry_id === 'e-2').reached, 0,
    'canon the engine never sent — a different fault, fixed with a keyword rather than a rewrite');
  // Old rows predate the column and were all raised against canon that had fired, which is the
  // only kind the checker could see. The default has to say so rather than leave them null.
  db.addViolation(s8.id, { passageId: pid, entryId: 'e-3', quote: 'x', reason: 'y', confidence: 1 });
  assert.strictEqual(db.violationsOf(s8.id).find((r: any) => r.entry_id === 'e-3').reached, 1,
    'unspecified means it reached, which is what every stored row was');
  db.delStory(s8.id);
});

ok('ending a chapter is both writes or neither', () => {
  const s10 = db.createStory(o, { title: 'Ends' });
  db.addPassage({ ...s10, storyId: s10.id, body: 'one' });
  const before = db.chapters(s10.id);
  assert.strictEqual(before.length, 1);
  assert.strictEqual(before[0].status, 'open');

  // Make the INSERT fail by taking the id it is about to use. There is no other way in from
  // outside, and a rollback that is only reasoned about is a rollback nobody has seen.
  const clash = db.endChapter(s10.id, s10.branchId!, 'Two');
  assert.strictEqual(db.chapters(s10.id).length, 2, 'the normal path opens the next chapter');
  assert.strictEqual(db.chapters(s10.id).find((c: any) => c.id === clash.closed).status, 'closed',
    'and closes the one before it');

  // Now the failure. A branch id that does not exist trips the foreign key on the insert, after
  // the update to the current chapter has already run.
  const open = db.chapters(s10.id).find((c: any) => c.status === 'open');
  assert.throws(() => db.endChapter(s10.id, 'b-does-not-exist-at-all', 'Three'),
    'a bad branch must throw rather than half-finish');
  const after = db.chapters(s10.id);
  assert.strictEqual(after.length, 2, 'no chapter was opened');
  assert.strictEqual(after.find((c: any) => c.id === open.id).status, 'open',
    'and the one that was open is STILL open — without the transaction it was closed with no '
    + 'successor, which is a story you cannot write into and nothing on screen saying why');
  db.delStory(s10.id);
});

ok('a string is not an entry, and only a summoned one reaches the prompt', () => {
  const s11 = db.createStory(o, { title: 'Owed' });
  const id = db.upsertString(s11.id, { title: 'The letter', body: 'Unopened', fromChapter: 6, owedBy: 20 });
  assert.ok(id);
  // NOT in the ledger. An entry resolves by keyword and is sent as canon; a string stays true
  // while nobody says it, which is the opposite rule.
  assert.strictEqual(db.entriesOf(s11.id).length, 0, 'a string is not an entry');
  let x = db.stringsOf(s11.id)[0];
  assert.strictEqual(x.status, 'open');
  assert.strictEqual(x.summoned, 0, 'and it starts out of play — writer-facing until summoned');

  // Summoning is what puts it in the prompt, and story.ts is where that filter lives.
  db.upsertString(s11.id, { ...x, id: x.id, summoned: true });
  const v = story.view(s11.id)!;
  assert.strictEqual((v as any).strings[0].summoned, true, 'the view carries it');
  const { manifest } = story.assemble(v, { global: 100096, slots: 4, perSlot: 25024 }, 'direct');
  assert.ok(manifest.blocks.some((b) => b.kind === 'STRING'), 'and summoned, it reaches the prompt');

  // Paid is out of play whatever the flag says: a paid promise the model is still told about is
  // an instruction to pay it twice.
  db.upsertString(s11.id, { ...x, id: x.id, summoned: true, status: 'paid' });
  const paid = story.assemble(story.view(s11.id)!, { global: 100096, slots: 4, perSlot: 25024 }, 'direct');
  assert.ok(!paid.manifest.blocks.some((b) => b.kind === 'STRING'),
    'a paid string does not reach the prompt even while its summoned flag is set');

  db.delString(s11.id, x.id);
  assert.strictEqual(db.stringsOf(s11.id).length, 0);
  db.delStory(s11.id);
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
const { classify } = await import('../src/routes.ts');
if (classify) {
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
    classify(ledger, { title: t, body, keys })?.kind ?? 'none';
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

// A snapshot must include writes still sitting in the -wal. `cp` of the main file does not, and
// silently: it cost an A/B run where one arm was seeded and the other cp-ed from it, so that arm
// generated with no prose in context and the manifests differed by a whole block. Measured
// directly — cp saw none of the new rows, snapshot saw them all.
const { execSync } = await import('node:child_process');
const { DatabaseSync } = await import('node:sqlite');
const marker = `WAL-INVARIANT-${Date.now()}`;
// Its own story: the tests above this one delete theirs, so `s` no longer exists by here.
const walStory = db.createStory(o, { title: 'WAL' });
db.upsertEntry(walStory.id, o, { title: marker, body: '[in the wal]', entryType: 'lore',
  activation: 'triggered', keys: ['walinvariant'] });
for (const f of ['/tmp/anansi-wal-snapshot.db', '/tmp/anansi-wal-cp.db']) {
  try { unlinkSync(f); } catch { /* first run */ }
}
db.snapshot('/tmp/anansi-wal-snapshot.db');
execSync('cp /tmp/anansi-test.db /tmp/anansi-wal-cp.db');
const seenIn = (f: string) => {
  const q = new DatabaseSync(f, { readOnly: true });
  const c = (q.prepare('SELECT COUNT(*) c FROM entries WHERE title = ?').get(marker) as any).c;
  q.close(); return c;
};
ok('snapshot() carries a write still in the -wal, which cp does not', () => {
  assert.strictEqual(seenIn('/tmp/anansi-wal-snapshot.db'), 1,
    'snapshot() must capture a WAL-resident write — that is the whole reason it exists');
  // cp is not asserted at 0: a checkpoint may have landed between. The point is that snapshot()
  // never depends on one having landed.
});

// updateStory is PARTIAL. The client has always sent only the fields on screen — `savestory`
// collects the [data-story] elements that are rendered — and a full-row UPDATE bound undefined to
// every column the panel did not show. That made the Trajectory panel's Save, whose only field is
// `direction`, answer 500. Splitting Story and Chapter into separate panels would have spread it.
ok('a partial story save keeps every field it did not mention', () => {
  const o = db.owner('partial-save');
  const st = db.createStory(o, { title: 'Kept', genre: 'noir', premise: 'A test.',
    setting: 'Vantic', pov: 'third limited', persona: 'Aldis', writingStyle: 'clipped', spice: 3,
    direction: 'He keeps the debt.' });
  db.updateStory(st.id, { direction: 'He gives it up.' });
  const a = db.getStory(st.id);
  assert.strictEqual(a.direction, 'He gives it up.', 'the field sent must land');
  for (const [col, want] of [['title', 'Kept'], ['genre', 'noir'], ['setting', 'Vantic'],
                             ['persona', 'Aldis'], ['writing_style', 'clipped']] as const) {
    assert.strictEqual(a[col], want, `${col} must survive a save that did not mention it`);
  }
  assert.strictEqual(a.spice, 3, 'spice must survive too');
  // An explicit null is not the same as an absent key, or nothing could ever be cleared.
  db.updateStory(st.id, { maxContext: 700 });
  assert.strictEqual(db.getStory(st.id).max_context, 700);
  db.updateStory(st.id, { maxContext: null });
  assert.strictEqual(db.getStory(st.id).max_context, null, 'an explicit null must still clear');
  assert.strictEqual(db.getStory(st.id).title, 'Kept', 'and clearing one field keeps the others');
});

// Regenerating away from a take is a judgement about it, not just a replacement. Recorded and
// shown; deliberately NOT sent to the model — see the ponytail marker on rejectTake.
ok('a rejected take is marked, kept, and still steppable', () => {
  const o = db.owner('rejects');
  const st = db.createStory(o, { title: 'Takes' });
  const p1 = db.addPassage({ ...st, storyId: st.id, body: 'The first take.' });
  db.addVariant(st.id, p1, 'The second take.');
  db.rejectTake(st.id, p1);
  const takes = db.passageTakes(st.id, p1);
  assert.strictEqual(takes.length, 2, 'both takes stay in the slot');
  const first = takes.find((t: any) => t.id === p1);
  assert.strictEqual(first.rejected, 1, 'the one regenerated away from is marked');
  assert.strictEqual(first.selected, 0, 'and is not the one in the story');
  assert.strictEqual(takes.find((t: any) => t.id !== p1).rejected, 0, 'the new one is not marked');
  // Rejecting must not delete: SPEC 9 keeps every take, and "passed over" is a label, not a bin.
  assert.strictEqual(first.body, 'The first take.', 'and its text is untouched');
  // Another story's id cannot reach it.
  const other = db.createStory(db.owner('someone'), { title: 'Not yours' });
  db.rejectTake(other.id, takes[1].id);
  assert.strictEqual(db.passageTakes(st.id, p1).find((t: any) => t.id !== p1).rejected, 0,
    'a foreign story id must not mark another story\'s take');
});

// Every number on the dashboard was already in the database. This asserts they COUNT the right
// rows — words over selected passages only, so takes you did not choose are not credited as
// writing you did, and breaks are not counted as prose.
ok('writer stats count the right rows', () => {
  const o = db.owner('stats-writer');
  const st = db.createStory(o, { title: 'Counted' });
  db.addPassage({ ...st, storyId: st.id, body: 'one two three four five', author: 'model' });
  db.addPassage({ ...st, storyId: st.id, body: 'six seven', author: 'human' });
  db.addPassage({ ...st, storyId: st.id, body: 'SCENE', author: 'human', isBreak: true });
  const p = db.addPassage({ ...st, storyId: st.id, body: 'eight nine ten', author: 'model' });
  db.addVariant(st.id, p, 'seven words that were chosen instead here');   // 7 words
  db.upsertEntry(st.id, o, { title: 'Someone', body: '[a person]' });
  const t = db.writerStats(o);
  assert.strictEqual(t.stories, 1);
  assert.strictEqual(t.entries, 1);
  // addVariant selects the NEW take, so 'eight nine ten' is the one that lost.
  assert.strictEqual(t.passages, 3, 'two prose plus the winning take; the break is excluded');
  assert.strictEqual(t.yours, 1, 'the break is not counted as yours');
  assert.strictEqual(t.anansi, 2);
  assert.strictEqual(t.unchosen, 1, 'the take that lost is kept and counted separately');
  // 5 + 2 + 7 = 14. The losing take's three words must NOT be in here, or the dashboard credits
  // you with writing you threw away.
  assert.strictEqual(t.words, 14, `words over selected non-break passages only, got ${t.words}`);
  assert.ok(Array.isArray(t.days), 'and a per-day series to draw');
  // Another writer's work is not yours.
  assert.strictEqual(db.writerStats(db.owner('stats-nobody')).words, 0);
});

// Outfits. PLAN-04 04 chose named-and-switchable over a single "right now" line, and chose a
// partial unique index over application code — so the "one at a time" rule is asserted against
// the DATABASE, which is the thing that actually enforces it.
ok('exactly one outfit is worn at a time, enforced in SQL', () => {
  const o = db.owner('wardrobe');
  const st = db.createStory(o, { title: 'Wardrobe' });
  const e = db.upsertEntry(st.id, o, { title: 'Ilva Marren', body: '[Ilva Marren: 34, envoy]' });
  const plate = db.upsertOutfit(st.id, e, { name: 'Plate', body: 'the plate she took from the hall' });
  const court = db.upsertOutfit(st.id, e, { name: 'Court dress', body: 'grey silk, no house colours' });
  const worn = () => db.outfitsOf(st.id).filter((x: any) => x.active);
  assert.strictEqual(worn().length, 0, 'nothing is worn until something is put on');
  db.wearOutfit(st.id, e, plate);
  assert.deepStrictEqual(worn().map((x: any) => x.name), ['Plate']);
  db.wearOutfit(st.id, e, court);
  assert.deepStrictEqual(worn().map((x: any) => x.name), ['Court dress'],
    'switching takes the other one off — the unique index forbids two');
  assert.strictEqual(worn().length, 1);
  db.wearOutfit(st.id, e, null);
  assert.strictEqual(worn().length, 0, 'and null takes everything off');
  // A second character's outfit is not affected by the first's.
  const e2 = db.upsertEntry(st.id, o, { title: 'Marek', body: '[Marek: a moneylender]' });
  const coat = db.upsertOutfit(st.id, e2, { name: 'Coat', body: 'oiled canvas' });
  db.wearOutfit(st.id, e, plate);
  db.wearOutfit(st.id, e2, coat);
  assert.strictEqual(worn().length, 2, 'one each is two — the index is per character, not per story');
});

ok('an outfit cannot be hung off another story\'s character', () => {
  const mine = db.owner('wardrobe-mine'), theirs = db.owner('wardrobe-theirs');
  const a = db.createStory(mine, { title: 'Mine' });
  const b = db.createStory(theirs, { title: 'Theirs' });
  const e = db.upsertEntry(a.id, mine, { title: 'Someone', body: '[a person]' });
  assert.strictEqual(db.upsertOutfit(b.id, e, { name: 'X', body: 'y' }), null,
    'the composite lookup is the ownership check');
  assert.strictEqual(db.wearOutfit(b.id, e, 'o-nope'), null);
  assert.strictEqual(db.outfitsOf(a.id).length, 0);
});

// The whole point: it reaches the MODEL as a second bracket, and stops when taken off. This
// used to assert against entryText(), which is one layer above where the outfit is now applied —
// so it could not see the defect COUNCIL-04's debugger found: with a chapter-state in force,
// resolveBody() replaced the body wholesale and the outfit went with it. The panel still said
// "worn" and the character wrote naked. Assert on the block that actually reaches the prompt.
ok('the worn outfit rides with the entry into the prompt, state or no state', async () => {
  const o = db.owner('wardrobe-prompt');
  const st = db.createStory(o, { title: 'Worn' });
  const e = db.upsertEntry(st.id, o, { title: 'Ilva Marren', body: '[Ilva Marren: 34, envoy]' });
  const plate = db.upsertOutfit(st.id, e, { name: 'Plate', body: 'the plate she took from the hall.' });
  const slot = { global: 100096, slots: 4, perSlot: 25024 };
  const blockFor = (id: string) => {
    const { manifest } = story.assemble(story.view(st.id)!, slot, 'continue');
    return manifest.blocks.find((b: any) => b.id === id)!.text;
  };

  assert.strictEqual(blockFor(e), '[Ilva Marren: 34, envoy]', 'nothing worn, nothing added');
  db.wearOutfit(st.id, e, plate);
  assert.match(blockFor(e), /^\[Ilva Marren: 34, envoy\]\n\[Ilva Marren wears: the plate/,
    'worn, it is a second bracket under the body — not an edit to it');

  // The defect, as a test. A state in force rewrites the body; the outfit must outlive it.
  db.addPassage({ ...st, storyId: st.id, body: 'The hall was cold.' });
  db.upsertState(st.id, e, { fromChapter: 1, body: '[Ilva Marren: sworn to the Bell]' });
  const held = blockFor(e);
  assert.match(held, /sworn to the Bell/, 'the state is in force');
  assert.match(held, /\[Ilva Marren wears: the plate/,
    `a state must not silently undress her — got ${JSON.stringify(held)}`);

  // The wearer is the entry's OWN title, not its first word. Taking the first word turned
  // "The Murmur" and "The Rust Choir" — both real entries from an imported AI Dungeon story —
  // into "[The wears: ...]". The title is what the body already uses, so the two lines agree.
  const murmur = db.upsertEntry(st.id, o, { title: 'The Murmur', body: '[The Murmur: still and sharp]' });
  const coat = db.upsertOutfit(st.id, murmur, { name: 'Coat', body: 'a loose coat, lavender.' });
  db.wearOutfit(st.id, murmur, coat);
  const line = blockFor(murmur).split('\n')[1];
  assert.strictEqual(line, '[The Murmur wears: a loose coat, lavender.]',
    `a name beginning with an article must survive intact, got ${line}`);
  db.wearOutfit(st.id, e, null);
  assert.doesNotMatch(blockFor(e), /wears:/, 'taken off, it is gone again');
});

// Writing into an earlier chapter must land at the end of THAT chapter, not the end of the book.
// Ordinals are per branch and were taken from MAX(ordinal) over the whole branch, so a line
// written into chapter one was ordered after every later chapter — and then `drawDoc`, which
// groups by chapter, showed it inside chapter one while the model, which reads by ordinal, got it
// after chapter two. The document and the prompt disagreed about the order of the book.
ok('a passage written into an earlier chapter lands in that chapter, in order', async () => {
  const o = db.owner('ordinals');
  const st = db.createStory(o, { title: 'Order' });
  const { view } = await import('../src/story.ts');
  db.addPassage({ ...st, storyId: st.id, body: 'one A' });
  db.addPassage({ ...st, storyId: st.id, body: 'one B' });
  const ch1 = db.chapters(st.id)[0];
  const two = db.endChapter(st.id, st.branchId);
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: two.opened, body: 'two A' });
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: two.opened, body: 'two B' });
  const order = () => db.passagesOf(st.id).map((p: any) => p.body);
  assert.deepStrictEqual(order(), ['one A', 'one B', 'two A', 'two B'], 'the normal append still appends');

  const v = view(st.id, ch1.id)!;
  assert.strictEqual(v.currentChapter.index, 1, 'focusing an earlier chapter makes it the one you write into');
  db.addPassage({ storyId: st.id, branchId: v.branchId!, chapterId: v.currentChapter.id, body: 'one C' });
  assert.deepStrictEqual(order(), ['one A', 'one B', 'one C', 'two A', 'two B'],
    'it goes at the end of chapter one, and chapter two shifts up');

  // The two orders must agree, which is the whole point: the reader and the model see one book.
  const byChapter = db.chapters(st.id).flatMap((c: any) =>
    db.passagesOf(st.id).filter((p: any) => p.chapter_id === c.id).map((p: any) => p.body));
  assert.deepStrictEqual(byChapter, order(),
    'grouping by chapter and ordering by ordinal must produce the same book');

  // Ordinals stay unique and gapless, or the partial unique index would have refused the shift.
  const ords = db.passagesOf(st.id).map((p: any) => p.ordinal);
  assert.deepStrictEqual(ords, [1, 2, 3, 4, 5], `ordinals must stay dense, got ${ords}`);

  // And into an empty chapter in the middle: it takes the position the chapter occupies.
  const three = db.endChapter(st.id, st.branchId);
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: three.opened, body: 'three A' });
  const v1 = view(st.id, two.opened)!;
  db.addPassage({ storyId: st.id, branchId: v1.branchId!, chapterId: two.opened, body: 'two C' });
  assert.deepStrictEqual(order(), ['one A', 'one B', 'one C', 'two A', 'two B', 'two C', 'three A'],
    'a later write into chapter two still sits before chapter three');
});

// A story may name its own model. The router runs --models-max 3 --models-autoload, so this is a
// real choice rather than a wish: F22 measured the three writing presets at 86,349 MiB of 98,304
// at full context, and Seth's own service comment sizes them at 79,466 at 32k.
ok('a story can name its own model, and a partial save does not lose it', async () => {
  const { modelFor } = await import('../src/llama.ts');
  const o = db.owner('per-story-model');
  const a = db.createStory(o, { title: 'Default' });
  const b = db.createStory(o, { title: 'Its own' });
  const dflt = modelFor(db.getStory(a.id));
  assert.ok(dflt.length, 'a story naming none gets the process default');
  db.updateStory(b.id, { model: 'rp-nt-ornith-h' });
  assert.strictEqual(modelFor(db.getStory(b.id)), 'rp-nt-ornith-h', 'and one naming a model gets it');
  assert.strictEqual(modelFor(db.getStory(a.id)), dflt, 'without moving the other story');
  // updateStory is partial, so renaming must not quietly drop the model — the same fault that
  // made the Trajectory panel's Save answer 500.
  db.updateStory(b.id, { title: 'Renamed only' });
  assert.strictEqual(db.getStory(b.id).model, 'rp-nt-ornith-h', 'a save that does not mention it keeps it');
  db.updateStory(b.id, { model: null });
  assert.strictEqual(modelFor(db.getStory(b.id)), dflt, 'and clearing it goes back to the default');
});

// The chapter you are READING is the chapter you write into — asserted through the ROUTE, not
// just the db, because that is where it was broken. /api/write took viewOf(storyId) with no
// chapter, so it always resolved to chapters.at(-1): paging back to chapter one and typing put
// the passage at the end of the last chapter, off-screen, generated against the wrong context.
//
// It needs BOTH halves. The route has to pass the chapter, and addPassage has to place it at the
// end of THAT chapter rather than the end of the book. Either alone leaves it wrong.
ok('a write lands in the chapter you are reading, in the right place', async () => {
  const { routes } = await import('../src/routes.ts');
  const o = db.owner('which-chapter');
  const st = db.createStory(o, { title: 'Where' });
  db.addPassage({ ...st, storyId: st.id, body: 'one A' });
  const ch1 = db.chapters(st.id)[0];
  const two = db.endChapter(st.id, st.branchId);
  db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: two.opened, body: 'two A' });
  const ctx = (body: any) => ({ body: { storyId: st.id, ...body }, owner: o,
    query: new URLSearchParams(), slot: { perSlot: 50048 }, gen: {} }) as any;

  await routes['POST /api/write'](ctx({ body: 'into chapter one', chapterId: ch1.id }));
  await routes['POST /api/write'](ctx({ body: 'at the end' }));

  const rows = db.passagesOf(st.id).map((p: any) => {
    const c = db.chapters(st.id).find((x: any) => x.id === p.chapter_id);
    return `${c.idx}:${p.body}`;
  });
  assert.deepStrictEqual(rows, ['1:one A', '1:into chapter one', '2:two A', '2:at the end'],
    'naming a chapter writes into it, in order; naming none still appends at the end');
  // And the two orders agree, which is the property that matters: the reader and the model see
  // one book.
  assert.deepStrictEqual(db.passagesOf(st.id).map((p: any) => p.ordinal), [1, 2, 3, 4]);
});

ok('genre arrives comma-separated however it was punctuated, and a two-word tag survives', () => {
  const { tidyGenre } = db;
  assert.strictEqual(tidyGenre('noir, gothic, horror'), 'noir, gothic, horror', 'already tidy is left alone');
  assert.strictEqual(tidyGenre('noir / gothic and horror'), 'noir, gothic, horror',
    'slashes and a standalone "and" are separators too');
  assert.strictEqual(tidyGenre('  noir ;  GOTHIC ,noir '), 'noir, GOTHIC',
    'trimmed, and deduped case-insensitively on the first spelling');
  // The one that matters: a space is NOT a separator, or every two-word genre becomes two.
  assert.strictEqual(tidyGenre('dark fantasy, slow burn'), 'dark fantasy, slow burn',
    'a space inside a tag is part of the tag');
  assert.strictEqual(tidyGenre(null), '', 'nothing in, nothing out');

  // Applied on the way IN, not left to whoever reads the row. Read back through listStories
  // rather than trusting the return of createStory, which could be tidy while the row is not.
  const o = db.owner('genre-test');
  const made = db.createStory(o, { title: 'G', genre: 'noir / gothic and noir' });
  const row = db.listStories(o).find((r: any) => r.id === made.id) as any;
  assert.strictEqual(row.genre, 'noir, gothic', 'createStory stores the tidied form');
  db.updateStory(made.id, { genre: 'horror;dark fantasy' });
  const after = db.listStories(o).find((r: any) => r.id === made.id) as any;
  assert.strictEqual(after.genre, 'horror, dark fantasy', 'and so does every save after it');
});

ok('a story\'s persona and locked character follow a rename, and clear on a delete', () => {
  const me = db.owner('persona-test');
  const st = db.createStory(me, { title: 'The Reference' });
  const her = db.upsertEntry(st.id, me, { title: 'Ilva Marren', body: 'A courier.', entryType: 'character' });
  const him = db.upsertEntry(st.id, me, { title: 'Kade Ashford', body: 'A creditor.', entryType: 'character' });
  db.updateStory(st.id, { persona: 'Ilva Marren', lockedCharacter: 'Kade Ashford' });
  const read = () => db.listStories(me).find((r: any) => r.id === st.id) as any;
  assert.strictEqual(read().persona, 'Ilva Marren', 'the fixture is set up');

  // Renaming someone ELSE must not touch either reference — the update is scoped to the old title.
  db.upsertEntry(st.id, me, { id: him, title: 'Kade Ferrin', body: 'A creditor.', entryType: 'character' });
  assert.strictEqual(read().persona, 'Ilva Marren', "renaming another character leaves the persona alone");
  assert.strictEqual(read().locked_character, 'Kade Ferrin', 'and the locked character follows its own rename');

  // The one that was broken: the byline read "You · " and the lockout locked nobody.
  db.upsertEntry(st.id, me, { id: her, title: 'Ilva Kest', body: 'A courier.', entryType: 'character' });
  assert.strictEqual(read().persona, 'Ilva Kest', 'the persona follows the rename');

  // Another story naming the same title must not be dragged along.
  const other = db.createStory(me, { title: 'Elsewhere' });
  db.upsertEntry(other.id, me, { title: 'Ilva Kest', body: 'Someone else entirely.', entryType: 'character' });
  db.updateStory(other.id, { persona: 'Ilva Kest' });
  db.upsertEntry(st.id, me, { id: her, title: 'Ilva Vane', body: 'A courier.', entryType: 'character' });
  const otherRead = () => db.listStories(me).find((r: any) => r.id === other.id) as any;
  assert.strictEqual(otherRead().persona, 'Ilva Kest', "a rename in one story cannot reach another story's persona");

  // And a deleted character leaves an empty reference rather than a name nothing can explain.
  db.delEntry(st.id, her);
  assert.strictEqual(read().persona, null, 'deleting the character clears the persona');
  assert.strictEqual(read().locked_character, 'Kade Ferrin', 'and leaves the other reference standing');
});

ok('a persona naming nobody in the story is dropped, and one naming a real character is kept', () => {
  const me = db.owner('pincast-test');
  // The wizard's order: the persona is chosen a step BEFORE the cast is written, so it arrives on
  // the create call as a name and the entries follow it.
  const st = db.createStory(me, { title: 'The Cast', persona: 'Ilva Marren', lockedCharacter: 'Nobody At All' });
  db.upsertEntry(st.id, me, { title: 'Ilva Marren', body: 'A courier.', entryType: 'character' });
  const read = () => db.listStories(me).find((r: any) => r.id === st.id) as any;

  // Only what the MODEL proposed is policed. A persona the writer typed is left alone even when it
  // names nobody, because a protagonist is allowed to have no ledger entry.
  assert.deepStrictEqual(db.pinCast(st.id), [], 'with nothing proposed, nothing is policed');
  assert.strictEqual(read().locked_character, 'Nobody At All', 'a name the writer typed survives');

  const cleared = db.pinCast(st.id, ['Ilva Marren', 'Nobody At All']);
  assert.deepStrictEqual(cleared, ['Nobody At All'], 'it says what it cleared, and only that');
  assert.strictEqual(read().persona, 'Ilva Marren', 'a persona that names a real character is kept');
  assert.strictEqual(read().locked_character, null, 'and one that names nobody is dropped');

  // Idempotent: running it again must not clear the good one, which is the failure that would make
  // it unsafe to call on every save.
  assert.deepStrictEqual(db.pinCast(st.id, ['Ilva Marren', 'Nobody At All']), [],
    'a second run clears nothing');
  assert.strictEqual(read().persona, 'Ilva Marren', 'and leaves the kept one alone');

  // Scoped: a character of the same name in ANOTHER story does not rescue a dangling persona.
  const other = db.createStory(me, { title: 'Elsewhere', persona: 'Someone Elses Hero' });
  db.upsertEntry(st.id, me, { title: 'Someone Elses Hero', body: 'In the wrong book.', entryType: 'character' });
  assert.deepStrictEqual(db.pinCast(other.id, ['Someone Elses Hero']), ['Someone Elses Hero'],
    "a cast member of another story cannot satisfy this story's persona");
});

ok('auto-open is on by default, survives a partial save, and can be turned off', () => {
  const me = db.owner('autoopen-test');
  const st = db.createStory(me, { title: 'The Opening' });
  const read = () => story.view(st.id)!.story as any;
  assert.strictEqual(read().autoOpen, true, 'a new story asks the model for its first passage');

  // The failure this is really guarding: updateStory writes every column, so a save of some OTHER
  // field must not carry a falsy default through and switch this off behind the writer.
  db.updateStory(st.id, { title: 'The Opening, renamed' });
  assert.strictEqual(read().autoOpen, true, 'saving an unrelated field leaves it alone');

  db.updateStory(st.id, { autoOpen: false });
  assert.strictEqual(read().autoOpen, false, 'and it can be turned off');
  db.updateStory(st.id, { premise: 'Something else entirely.' });
  assert.strictEqual(read().autoOpen, false, 'off survives an unrelated save too');

  db.updateStory(st.id, { autoOpen: true });
  assert.strictEqual(read().autoOpen, true, 'and back on again');
});

ok('a flag on a take you rolled away from is not counted and not shown', () => {
  const me = db.owner('flag-test');
  const st = db.createStory(me, { title: 'The Flagged' });
  const first = db.addPassage({ ...st, storyId: st.id, body: 'She was the Murmur still.' });
  db.addViolation(st.id, { passageId: first, quote: 'She was the Murmur still.',
    reason: 'canon says otherwise', confidence: 0.9 });

  assert.strictEqual(db.violationsOf(st.id).length, 1, 'a flag on the passage on the page is shown');
  const counted = () => (db.listStories(me).find((r: any) => r.id === st.id) as any).flags;
  assert.strictEqual(counted(), 1, 'and counted on the shelf');

  // Roll it again: the old take stays in the database, unselected, and its flag goes with it. This
  // is the bug Seth hit — the shelf said one flag and the document had nothing to show, because the
  // prose it was about is no longer in the book.
  db.addVariant(st.id, first, 'She was no longer the Murmur.');
  const still = db.passagesOf(st.id).find((p: any) => p.id === first);
  assert.ok(!still, 'the old take is no longer the selected one');
  assert.strictEqual(db.violationsOf(st.id).length, 0, 'so its flag is not shown');
  assert.strictEqual(counted(), 0, 'and the shelf agrees with what the page can show');

  // Hidden, NOT deleted: an unselected take is one you can switch back to, and its flag is true
  // again if you do. Sweeping it would be the easy fix and the wrong one.
  assert.strictEqual(db.pruneViolations(0), 0, 'nothing swept it — it is filtered, not lost');
});

// The cover. The reason it is a side table and not a column is that listStories selects s.* — so
// the assertion that matters is not "it came back", it is "the shelf listing does not carry the
// bytes". Falsified by selecting sc.jpeg into that listing rather than sc.set_at: the shelf then
// carries the cover, and "the moment it was set" is the assertion that goes red first.
ok('a cover round-trips, and the shelf is told when it was set and never the bytes', () => {
  const me = db.owner('cover-owner');
  const st = db.createStory(me, { title: 'A book with a face' });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40_000, 7)]);

  assert.strictEqual(db.coverAt(st.id), null, 'a new story has no cover');
  assert.strictEqual(db.getCover(st.id), null, 'and no bytes to hand out');
  const row0: any = db.listStories(me).find((r: any) => r.id === st.id);
  assert.ok(!row0.cover, 'and the shelf says so');

  db.setCover(st.id, jpeg);
  assert.strictEqual(Buffer.from(db.getCover(st.id)!).length, jpeg.length, 'the bytes come back whole');
  assert.strictEqual(Buffer.compare(Buffer.from(db.getCover(st.id)!), jpeg), 0, 'and unchanged');

  const row: any = db.listStories(me).find((r: any) => r.id === st.id);
  assert.ok(typeof row.cover === 'number' && row.cover > 0,
    'the shelf gets the moment it was set, which is what the immutable URL is keyed on');
  // The whole point of the side table: 40KB of JPEG must not be sitting in the shelf listing.
  assert.ok(JSON.stringify(row).length < 4_000,
    `the shelf row is ${JSON.stringify(row).length} bytes — the cover is in it`);

  // Replacing bumps the version, so the URL the shelf builds is a different URL.
  const first = db.coverAt(st.id)!;
  db.setCover(st.id, Buffer.concat([jpeg, Buffer.from([0xff, 0xd9])]));
  assert.strictEqual(db.listStories(me).filter((r: any) => r.id === st.id).length, 1,
    'a replaced cover is one row, not two');
  assert.ok(db.coverAt(st.id)! >= first, 'and its version does not go backwards');

  db.delCover(st.id);
  assert.strictEqual(db.coverAt(st.id), null, 'removing it leaves no cover');
  assert.strictEqual(db.getCover(st.id), null, 'and no bytes');

  // The story is what owns it. Deleting the book must not leave a cover behind in the database
  // the backup then carries forever.
  db.setCover(st.id, jpeg);
  db.delStory(st.id, me);
  assert.strictEqual(db.coverAt(st.id), null, 'deleting the story takes its cover with it');
});

// The cover, used again at the head of every chapter. One image, one switch — Seth: "the chapter
// image would only pull from the hero so story and chapter share the same image."
ok('a book can ask for its cover at the head of every chapter, and it is off until it does', () => {
  const me = db.owner('hero-owner');
  const st = db.createStory(me, { title: 'A book with a plate' });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 0,
    'off by default — a picture at the head of each chapter is a choice about how a book reads, '
    + 'and turning it on for an existing book would be making that choice for somebody');

  db.updateStory(st.id, { chapterHero: true });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 1, 'and it turns on');
  // A partial save must not switch it off, the way it must not switch off a chapter's pull-back.
  db.updateStory(st.id, { title: 'Renamed' });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 1,
    'renaming the book leaves it alone');
  assert.strictEqual((db.getStory(st.id) as any).title, 'Renamed', 'and the rename lands');

  db.updateStory(st.id, { chapterHero: false });
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 0, 'and off again is a value too');

  // The sticky heading rides the same partial-save helper, and the pair is asserted TOGETHER: two
  // booleans written in one UPDATE are two chances to bind the wrong one to the wrong column, and
  // a swap would leave both individually plausible.
  db.updateStory(st.id, { chapterSticky: true });
  assert.strictEqual((db.getStory(st.id) as any).chapter_sticky, 1, 'the sticky heading turns on');
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 0,
    'and turning it on does not turn the cover-as-plate on with it');
  db.updateStory(st.id, { chapterHero: true });
  assert.strictEqual((db.getStory(st.id) as any).chapter_sticky, 1, 'nor the other way round');
  db.updateStory(st.id, { title: 'Renamed twice' });
  assert.strictEqual((db.getStory(st.id) as any).chapter_sticky, 1, 'and a rename leaves both alone');
  assert.strictEqual((db.getStory(st.id) as any).chapter_hero, 1);
});

// A partial chapter save must not switch off what it did not mention. `updateStory` has worked
// this way since it was written; this did not, and it clobbered the one column that decides
// whether a chapter's prose is pulled back into the prompt.
ok('renaming a chapter leaves its pull-back alone', () => {
  const me = db.owner('chapter-owner');
  const st = db.createStory(me, { title: 'A book with a chapter' });
  const ch = (db.chapters(st.id)[0] as any).id;

  db.updateChapter(st.id, ch, { title: 'One', authorsNote: 'End it in the rain.', keepWhole: true });
  assert.strictEqual((db.chapters(st.id)[0] as any).keep_whole, 1, 'the chapter is pulled back');

  // What every caller actually sends: a title and a note, and nothing about the window.
  db.updateChapter(st.id, ch, { title: 'One, renamed', authorsNote: 'End it in the rain.' });
  const after: any = db.chapters(st.id)[0];
  assert.strictEqual(after.title, 'One, renamed', 'the rename lands');
  assert.strictEqual(after.keep_whole, 1,
    'and the pull-back survives it — a partial save must not switch off what it did not mention');

  // And false is a value, not an omission: the writer must be able to let a chapter go again.
  db.updateChapter(st.id, ch, { keepWhole: false });
  assert.strictEqual((db.chapters(st.id)[0] as any).keep_whole, 0, 'releasing it works');
  assert.strictEqual((db.chapters(st.id)[0] as any).title, 'One, renamed',
    'and releasing it does not wipe the title either');
});

// The look: three layers, and the one that matters is that a book's look never becomes yours by
// being opened. That was the shape of the bug the split exists to prevent — the surface cached
// whatever was on screen, so reading a book with a green theme made green your default.
ok('a book\'s look layers over the writer\'s, and null is how it goes back to following', () => {
  const me = db.owner('look-owner');
  const st = db.createStory(me, { title: 'A book with a look' });

  assert.strictEqual(db.lookOf(me), null, 'a new writer has no default of their own');
  assert.strictEqual((db.getStory(st.id) as any).look, null, 'and a new book follows it');

  db.setLook(me, { theme: 'parchment', font: 'garamond', size: 'l', scale: '110' });
  assert.strictEqual(db.lookOf(me).theme, 'parchment', 'the default round-trips');
  assert.strictEqual((db.getStory(st.id) as any).look, null,
    'and setting it must not write anything onto a book');

  db.setStoryLook(st.id, me, { theme: 'ink', font: 'garamond', size: 'l', scale: '110' });
  assert.strictEqual(JSON.parse((db.getStory(st.id) as any).look).theme, 'ink', 'the book has its own');
  assert.strictEqual(db.lookOf(me).theme, 'parchment',
    'and giving a book one must not change the writer default — the whole point of the split');

  // Null is a value here, not an absence: it is the way back, and it is what every book written
  // before the column existed already holds.
  db.setStoryLook(st.id, me, null);
  assert.strictEqual((db.getStory(st.id) as any).look, null, 'null puts it back to following');
  assert.strictEqual(db.lookOf(me).theme, 'parchment', 'with the default still there to follow');

  // The look is per book, so it must leave with the book.
  db.setStoryLook(st.id, me, { theme: 'ink' });
  db.delStory(st.id, me);
  assert.strictEqual(db.getStory(st.id), undefined, 'the story is gone');
  assert.strictEqual(db.lookOf(me).theme, 'parchment', 'and the writer default outlives it');
});

// Takes: what a reroll inherits, and what deleting one actually deletes. Both of these were the
// same complaint from Seth — deleting a rerolled passage looked like it did nothing, because it
// removed the take on screen and promoted the next one.
ok('a take inherits the instruction, and a slot can be deleted whole', () => {
  const me = db.owner('take-owner');
  const st = db.createStory(me, { title: 'Four takes' });
  const first = db.addPassage({ storyId: st.id, branchId: st.branchId, chapterId: st.chapterId,
    body: 'He knocks once.', author: 'model', directive: 'have him lose his nerve' })!;

  const rowOf = (id: string) => db.passagesOf(st.id).find((p: any) => p.id === id)
    ?? { directive: db.passageDirective(st.id, id) };
  assert.strictEqual(db.passageDirective(st.id, first), 'have him lose his nerve',
    'the instruction is on the passage it produced');

  // A second take is another answer to the SAME question, so it carries the same instruction. It
  // used to be absent from addVariant's INSERT entirely, which meant a reroll of a directed
  // passage produced an undirected row and a second reroll had nothing to inherit.
  const second = db.addVariant(st.id, first, 'He knocks, and waits too long.')!;
  assert.strictEqual(db.passageDirective(st.id, second), 'have him lose his nerve',
    'and a take inherits it');
  const third = db.addVariant(st.id, second, 'He does not knock at all.')!;
  assert.strictEqual(db.passageDirective(st.id, third), 'have him lose his nerve',
    'and so does a take of a take, which is what a second reroll is');

  // One take at a time promotes a survivor, which is right: a slot always has one.
  assert.strictEqual(db.passagesOf(st.id).length, 1, 'the book shows one of the three');
  db.delPassage(st.id, third);
  assert.strictEqual(db.passagesOf(st.id).length, 1,
    'deleting the selected take leaves the slot filled — this is the behaviour that looked broken');

  // Which is exactly why the other intent has to be sayable.
  const gone = db.delSlot(st.id, second);
  assert.strictEqual(gone, 2, 'delSlot reports how many takes it took with it');
  assert.strictEqual(db.passagesOf(st.id).length, 0, 'and the passage is out of the book');
  assert.strictEqual(db.passageDirective(st.id, first), null, 'with no take of it left behind');

  // Scoped like every other read: a passage id is not a story id.
  const other = db.createStory(db.owner('take-stranger'), { title: 'Not yours' });
  const theirs = db.addPassage({ storyId: other.id, branchId: other.branchId,
    chapterId: other.chapterId, body: 'Theirs.', author: 'model', directive: 'a secret steer' })!;
  assert.strictEqual(db.passageDirective(st.id, theirs), null,
    'a foreign passage id yields no instruction');
  assert.strictEqual(db.delSlot(st.id, theirs), 0, 'and no foreign slot can be deleted through it');
  assert.strictEqual(db.passagesOf(other.id).length, 1, 'theirs is untouched');
});

// A mute is "not for this chapter", never "never again". That scope IS the feature: canon and
// prose fall out of step while a chapter is moving and agree again once it settles, so silencing
// an entry everywhere would hide a real contradiction in chapter nine because chapter three was
// messy. If this ever stops being chapter-scoped the checker goes quiet on a book-wide fact and
// nothing else in the suite would notice.
ok('a mute quiets one entry in one chapter, and neither the next chapter nor a lift keeps it', () => {
  const st = db.createStory(db.owner('muter'), { title: 'Drift' });
  db.addPassage({ ...st, storyId: st.id, body: 'The chapter has to have prose before it can end.' });
  db.endChapter(st.id, st.branchId, 'Two');
  const chapTwo = db.chapters(st.id).map((c: any) => c.id).find((id: string) => id !== st.chapterId);
  assert.ok(chapTwo, 'the fixture needs two distinct chapters or it proves nothing about scope');

  db.dismiss(st.id, 'mute', `${st.chapterId}:e-aldi`);
  assert.deepStrictEqual([...db.mutedIn(st.id, st.chapterId)], ['e-aldi'],
    'the entry is quiet in the chapter it was muted in');
  assert.deepStrictEqual([...db.mutedIn(st.id, chapTwo)], [],
    'and NOT in the next chapter — a mute that leaked forward would hide a real contradiction '
    + 'in a chapter the writer never silenced');

  // Another writer's mute is not yours, on the same chapter id shape.
  const other = db.createStory(db.owner('mute-stranger'), { title: 'Theirs' });
  db.dismiss(other.id, 'mute', `${other.chapterId}:e-aldi`);
  assert.deepStrictEqual([...db.mutedIn(st.id, chapTwo)], [], 'and never across stories');

  db.unmute(st.id, 'mute', `${st.chapterId}:e-aldi`);
  assert.deepStrictEqual([...db.mutedIn(st.id, st.chapterId)], [],
    'lifting it restores the checker — quiet, not deaf');
});

// PLAN-06 §2f. Three parsers existed and the AUTHORITATIVE one — the write path every route
// reaches — did `Array.isArray(e.keys) ? … : []`, so a comma-separated string was discarded
// whole rather than split. A model or an API client posting `"coat, iron bridge"` lost both keys
// and the entry looked perfect on screen: right title, right body, and it can never fire again.
//
// This was unassertable before it was unasserted: `grep -rn "keys" test/` showed EVERY fixture in
// this repo hands `keys` in as a pre-built array, which is the one shape the old code got right.
// Same trap as the tag-splitting fix whose fixture had no comma in it (.claude/CLAUDE.md).
// Falsified: restoring the old line turns the first assertion red at ['coat','iron bridge'] vs [].
ok('a comma-separated keys string is split on the write path, not discarded', () => {
  const own = db.owner('keysmith');
  const st = db.createStory(own, { title: 'Keys' });

  const keysIn = (id: string) =>
    JSON.parse((db.entriesOf(st.id).find((x: any) => x.id === id) as any).keys || '[]');

  const e = db.upsertEntry(st.id, own, { title: 'Wanderer', body: '[a coat]',
    activation: 'triggered', keys: 'coat, iron bridge' as any });
  assert.deepStrictEqual(keysIn(e), ['coat', 'iron bridge'],
    'a string of keys reaches the database as keys. Dropped, the entry is triggered with nothing '
    + 'that can trigger it — invisible to the model and indistinguishable from working.');

  // The bound is SPEC §7.1 and it runs on the same path. A one-character key fires on every
  // passage forever; a 33-character one is prose, not a key. Both are dropped, and the keys
  // beside them survive — a bad key must not take a good one with it.
  const b = db.upsertEntry(st.id, own, { title: 'Bounded', body: '[b]', activation: 'triggered',
    keys: `a, ${'x'.repeat(33)}, ${'y'.repeat(32)}, bridge` as any });
  assert.deepStrictEqual(keysIn(b), ['y'.repeat(32), 'bridge'], 'out-of-range keys go, in-range keys stay, 32 is inclusive');

  // NO CAP on the app path since 2026-08-29. SPEC §7.1's ten was a number nobody measured, and
  // after the normalisation below the widest card in a real 219-card export holds ten — so the
  // cap only ever cut duplicates. It survives as a PARAMETER for untrusted callers.
  const many = Array.from({ length: 14 }, (_, i) => `key${i}`);
  const c = db.upsertEntry(st.id, own, { title: 'Many', body: '[c]', keys: many });
  assert.strictEqual(keysIn(c).length, 14, 'every distinct key the writer gives is kept');
  assert.strictEqual(db.keysOf(many.join(','), 8).length, 8,
    'and the cap is still a parameter — import passes one, because that file is a stranger\'s. '
    + 'That import still PASSES it is asserted in test/import.ts against a real card.');

  // NORMALISATION. `fires` tokenises the key as well as the window, so `High`, `(High`, `High.`
  // and `"High` are four spellings of ONE trigger that all match identically. AI Dungeon writes
  // them by hand because its matcher is exact-string; ours is not. Measured on a real export:
  // 154 such duplicates across 644 keys, every one of them firing redundantly and inflating the
  // panel's count to a number no one could act on.
  assert.deepStrictEqual(db.keysOf('High, (High, High., "High, [High, High)'), ['High'],
    'punctuation variants of one word collapse to one key');
  assert.deepStrictEqual(db.keysOf('Erebus, erebus, EREBUS'), ['Erebus'],
    'the dedupe is case-insensitive and keeps the first spelling the writer used');

  // AND INTERIOR PUNCTUATION SURVIVES, which is the half that matters. The space is what makes
  // `High Gothic` a two-part key, and `fires` walks the parts as an ordered run — that is the
  // whole reason it does not fire on "high above". Strip inside and the fix becomes the bug.
  assert.deepStrictEqual(db.keysOf('High Gothic, (High Gothic)'), ['High Gothic'],
    'a multi-word key keeps its space, and its bracketed twin still dedupes against it');
  assert.deepStrictEqual(db.keysOf("Aldi's cart"), ["Aldi's cart"],
    'an interior apostrophe is part of the word, not edge punctuation');
});


// PLAN-06 2e, the half `bench/ledger-audit.ts` supports. `db.ts:881` names the class in its own
// words — "a triggered entry with no trigger words never reaches the model again and looks fine on
// the screen" — and the rule that prevents it lived in import.ts alone, on one of SIX paths into
// upsertEntry. The other five are the wizard, POST /api/entry, accept, the other importer, and
// copy-to-another-book. PLAN-06 asked for it at "the three proposal sites"; there is one floor.
ok('a triggered entry with no keys cannot land dark, unless the caller says it means it', () => {
  const own = db.owner('darkness');
  const st = db.createStory(own, { title: 'Dark' });
  const act = (id: string) =>
    (db.entriesOf(st.id).find((x: any) => x.id === id) as any).activation;

  // The defect. Nothing on any surface would show this entry as broken: right title, right body,
  // the word "Triggered" on its chip, and it can never fire.
  const dark = db.upsertEntry(st.id, own, { title: 'Unfireable', body: '[a fact]',
    activation: 'triggered', keys: [] });
  assert.strictEqual(act(dark), 'always_on',
    'a triggered entry with no keys is one that never reaches the model again. Always-on costs '
    + 'tokens; dark costs the fact itself, and says nothing.');

  // The opt-out, which is the whole reason this is a flag and not a silent correction. app.js
  // makes an entry from a highlighted passage and wants it dark: an always-on entry made from a
  // highlight would cost tokens on every call before anyone had finished writing it.
  const onPurpose = db.upsertEntry(st.id, own, { title: 'Not yet', body: '[a highlight]',
    activation: 'triggered', keys: [], allowNoKeys: true });
  assert.strictEqual(act(onPurpose), 'triggered',
    'allowNoKeys is how "not switched on yet" is said out loud. Without it the two meanings of '
    + 'triggered-with-no-keys share one state and the guard cannot tell them apart.');

  // And it is a per-call permission, not a column. If it ever reaches the schema it becomes a
  // thing to keep in sync on every read path.
  assert.ok(!('allowNoKeys' in (db.entriesOf(st.id).find((x: any) => x.id === onPurpose) as any)),
    'allowNoKeys must not be stored — it describes one call, not the entry');

  // A row already in that state is left alone. bench/ledger-audit.ts on the live library found 1
  // of 7 judgeable entries would go dark on a flip and 2 more were dark on the live window, so
  // migrating what is already there is not supported. Editing an unrelated field must not do it
  // by the back door either.
  db.upsertEntry(st.id, own, { id: onPurpose, title: 'Not yet, renamed', body: '[a highlight]',
    activation: 'triggered', keys: [] });
  assert.strictEqual(act(onPurpose), 'triggered',
    'a rename must not switch an entry on. The guard stops NEW darkness; it does not migrate old '
    + 'rows, because the probe says that flip loses facts.');

  // The guard must not reach an entry that CAN fire, which is the whole population it is for.
  const fine = db.upsertEntry(st.id, own, { title: 'Fireable', body: '[a fact]',
    activation: 'triggered', keys: ['iron bridge'] });
  assert.strictEqual(act(fine), 'triggered',
    'an entry with keys is left exactly as asked — a guard that flipped these would quietly make '
    + 'every triggered entry always-on and put the whole ledger in every prompt');
});

// ---- PLAN-08 Phase 2: addons, the class an outfit already was --------------------------------

ok('the exclusivity index and src/slots.ts name the same slots', () => {
  // A partial index cannot call into TypeScript, so the slot list is written twice: once as a SQL
  // literal and once in `src/slots.ts`. That is exactly the drift `slots.ts` exists to stop, so it
  // is asserted rather than trusted — add an exclusive slot to the module and forget the index and
  // the database silently stops enforcing it, with nothing on any screen to say so.
  const idx = (db.db.prepare(
    "SELECT sql FROM sqlite_master WHERE name = 'addons_one_active'").get() as any)?.sql ?? '';
  const inIndex = [...idx.matchAll(/'([a-z_]+)'/g)].map((m: any) => m[1]).sort();
  assert.deepStrictEqual(inIndex, [...slots.EXCLUSIVE_SLOTS].sort(),
    'the index and the module disagree about which slots hold one at a time');
});

ok('the extraction schema and src/slots.ts name the same slots', () => {
  // The third place the slot list is written, and the same argument as the index above: a
  // constrained decode has to state its enum as a literal, and a schema that interpolated the
  // module would change shape between calls, which makes it unreadable next to a log of them. So
  // it is written out and asserted — add a slot to the module and forget this and the model can
  // never propose into it, silently, with the feature looking built.
  const inSchema = [...(prompts.EXTRACT_SCHEMA as any).properties.entries.items.properties.field.enum]
    .filter((x: string) => x !== 'none').sort();
  assert.deepStrictEqual(inSchema, [...slots.ALL_SLOTS].sort(),
    'the extraction schema and the module disagree about which rooms exist');
});

{
  const sa = db.createStory(o, { title: 'Addons' });
  const who = db.upsertEntry(sa.id, o, { title: 'Wrenn', body: '[Wrenn: a fence]', keys: ['Wrenn'] });
  const mk = (slot: string, name: string, extra: any = {}) =>
    db.upsertAddon(sa.id, who, { slot, name, body: `[${name}]`, ...extra });

  ok('an exclusive slot holds one at a time, and the database is what says so', () => {
    const a = mk('appearance', 'before the fire')!;
    const b = mk('appearance', 'after the fire')!;
    db.setAddonActive(sa.id, a, true);
    db.setAddonActive(sa.id, b, true);
    const on = db.addonsOf(sa.id).filter((r: any) => r.slot === 'appearance' && r.active);
    assert.deepStrictEqual(on.map((r: any) => r.id), [b],
      'switching the second appearance on must take the first off — two appearances is not a state '
      + 'a card can be in, and leaving it to the screen means the next screen forgets');
    // FALSIFIED 2026-08-28 by disabling the clear in `setAddonActive`: this does not go red with a
    // wrong count, it dies with SQLITE constraint 2067 from `addons_one_active`. That is the proof
    // the comment on the index claims — the database is the enforcer and the transaction only
    // makes it usable, clearing the sibling instead of handing the writer a constraint error.
  });

  ok('  but a plural slot holds several at once, which is the whole point of the shape', () => {
    // Seth: "several can be triggered on at a time for specific ones." A card does not have one
    // relationship. If this passed by holding one, addons would be fields with extra steps.
    const r1 = mk('relationships', 'owes the Ambersand')!;
    const r2 = mk('relationships', 'raised by Halloran')!;
    db.setAddonActive(sa.id, r1, true);
    db.setAddonActive(sa.id, r2, true);
    const on = db.addonsOf(sa.id).filter((r: any) => r.slot === 'relationships' && r.active);
    assert.strictEqual(on.length, 2, 'both relationships should stay on');
  });

  ok('  and switching one off leaves its siblings alone', () => {
    const on = db.addonsOf(sa.id).filter((r: any) => r.slot === 'relationships' && r.active);
    db.setAddonActive(sa.id, on[0].id, false);
    const still = db.addonsOf(sa.id).filter((r: any) => r.slot === 'relationships' && r.active);
    assert.strictEqual(still.length, 1, 'turning one relationship off must not turn the other off');
  });

  ok('from_chapter survives, because it is what makes an arc survive', () => {
    // `outfits` has no from_chapter and addons are otherwise its shape, so this is the one field
    // most likely to be dropped by someone matching the older table. An exclusive slot plus a
    // chapter is a timeline: loyal at 2, not at 9, with the turn still readable between them.
    const id = mk('interiority', 'after the docks', { fromChapter: 9 })!;
    const row = db.addonsOf(sa.id).find((r: any) => r.id === id);
    assert.strictEqual(row.from_chapter, 9);
  });

  ok('an unknown slot is refused rather than stored', () => {
    assert.strictEqual(db.upsertAddon(sa.id, who, { slot: 'motivations', name: 'x', body: 'y' }), null,
      'free-text slots are how one book ends up with Motivation and motivations');
  });

  ok('an addon cannot be hung on another story\'s card', () => {
    const other = db.createStory(o, { title: 'Elsewhere' });
    assert.strictEqual(db.upsertAddon(other.id, who, { slot: 'voice', name: 'x', body: 'y' }), null,
      'the ownership gate is per row, not per route');
  });

  ok('a story-level addon needs no entry at all, which is where a string will live', () => {
    const id = db.upsertAddon(sa.id, null, { slot: 'history', name: 'the debt', body: '[owed]' });
    assert.ok(id, 'entry_id is nullable on purpose');
  });
}

// ---- PLAN-08 Phase 2: connections, retirement, and a proposal that can aim -------------------

{
  const se = db.createStory(o, { title: 'Edges' });
  const her  = db.upsertEntry(se.id, o, { title: 'Wrenn', body: '[Wrenn]', keys: ['Wrenn'] });
  const coat = db.upsertEntry(se.id, o, { title: 'the coat', body: '[a coat]',
    entryType: 'item', keys: ['coat'] });

  ok('a connection is DIRECTED, which is the whole design decision', () => {
    // Her coat should arrive when she does. She must NOT arrive because somebody said "coat".
    // Storing the pair without a direction rebuilds COUNCIL-04 #7's crowded scene by the back
    // door, and the direction cannot be recovered once a book has two hundred edges. So this
    // asserts the ABSENCE of the reverse, which is the half a presence check cannot see.
    assert.ok(db.linkEntries(se.id, her, coat), 'parent to child should link');
    const e = db.edgesOf(se.id);
    assert.strictEqual(e.length, 1);
    assert.strictEqual(e[0].parent_id, her);
    assert.strictEqual(e[0].child_id, coat);
    assert.strictEqual(e.some((x: any) => x.parent_id === coat), false,
      'the reverse edge must not exist merely because the pair is connected');
  });

  ok('  and the same connection cannot be made twice', () => {
    // Pressing connect twice would make the child arrive twice and count twice against the cap,
    // which is a bug nobody would think to look for.
    assert.strictEqual(db.linkEntries(se.id, her, coat), null);
    assert.strictEqual(db.edgesOf(se.id).length, 1);
  });

  ok('  but the reverse direction is a different edge and is allowed', () => {
    // Two people who know each other is a real shape. Refusing it would confuse "directed" with
    // "one connection per pair", which are not the same rule.
    assert.ok(db.linkEntries(se.id, coat, her));
    assert.strictEqual(db.edgesOf(se.id).length, 2);
    db.unlinkEntries(se.id, db.edgesOf(se.id).find((x: any) => x.parent_id === coat).id);
  });

  ok('  a card cannot pull itself in', () =>
    assert.strictEqual(db.linkEntries(se.id, her, her), null));

  ok('  and neither end may be another story\'s card', () => {
    const far = db.createStory(o, { title: 'Far' });
    const theirs = db.upsertEntry(far.id, o, { title: 'Nobody', body: '[x]' });
    assert.strictEqual(db.linkEntries(se.id, her, theirs), null, 'child from another book');
    assert.strictEqual(db.linkEntries(se.id, theirs, her), null, 'parent from another book');
  });

  ok('confidence defaults to a full pull and can be turned down', () => {
    // Stored, not yet spent: Phase 3 reads it in the eviction order, which is the only place an
    // inherited pull being worth less than a direct hit can mean anything.
    assert.strictEqual(db.edgesOf(se.id)[0].confidence, 1);
    const soft = db.linkEntries(se.id, coat, her, { confidence: 0.4, keys: ['wool'] })!;
    const row = db.edgesOf(se.id).find((x: any) => x.id === soft);
    assert.strictEqual(row.confidence, 0.4);
    assert.deepStrictEqual(JSON.parse(row.keys), ['wool'], 'an edge carries its own trigger words');
  });

  // The column had a reader from Phase 2 and no writer at all, so this used to reach for raw SQL.
  // It goes through `setRetired` now, which is what the surface and the accept path both call.
  const retiredAt = (id: string) => (db.db.prepare(
    'SELECT retired_at_chapter FROM entries WHERE id = ?').get(id) as any).retired_at_chapter;

  ok('an entry can be retired at a chapter, and brought back', () => {
    // A dead character, a burned building, a rule that stopped applying. Without this the ledger's
    // precision decays as the book grows, which is exactly when it is needed most.
    assert.strictEqual(db.setRetired(se.id, coat, 12), true);
    assert.strictEqual(retiredAt(coat), 12);
    // THE WAY BACK, in the same function and shipped the same day. `setPin`'s contract: null lifts
    // it. Without this the first wrong press is permanent and the writer's only undo is SQL.
    assert.strictEqual(db.setRetired(se.id, coat, null), true);
    assert.strictEqual(retiredAt(coat), null);
  });

  ok('  and an ordinary entry save does not disturb the threshold', () => {
    // The reason retirement is not a field on `upsertEntry`: that function writes `last_editor`,
    // which arbitration keys on, and it defaults every absent field across six callers — accept,
    // the wizard, both importers, copy. A retirement riding in there would be cleared by an
    // unrelated save, or a card would be marked human-edited by being brought back.
    db.setRetired(se.id, coat, 12);
    const e = db.entriesOf(se.id).find((x: any) => x.id === coat) as any;
    db.upsertEntry(se.id, o, { id: coat, title: e.title, body: 'a different coat entirely',
      entryType: e.entry_type, activation: e.activation, keys: [], lastEditor: 'model' });
    assert.strictEqual(retiredAt(coat), 12, 'the threshold survived a save that never mentioned it');
    db.setRetired(se.id, coat, null);
  });

  ok('saving a room does not silently clear its chapter anchors', () => {
    // The addon editor sends name, body and keys and nothing else, and these two were written as
    // `?? null` unconditionally — so every save of a room cleared both, which made the room editor
    // a de-facto un-retire button nobody knew was one and quietly undid the arc `from_chapter`
    // exists for. Found while building the entry-level retirement, from the other side.
    const ad = db.upsertAddon(se.id, her, { slot: 'interiority', name: 'her fear',
      body: 'will not cross the bridge', keys: [], fromChapter: 3, retiredAtChapter: 9 });
    db.upsertAddon(se.id, her, { id: ad, slot: 'interiority', name: 'her fear',
      body: 'will not cross the bridge at night', keys: [] });
    const row: any = db.addonsOf(se.id).find((x: any) => x.id === ad);
    assert.strictEqual(row.from_chapter, 3, 'the chapter it became true survived the save');
    assert.strictEqual(row.retired_at_chapter, 9, 'and so did the chapter it stops at');
    // An explicit null still clears, or there would be no way to undo one from the surface.
    db.upsertAddon(se.id, her, { id: ad, slot: 'interiority', name: 'her fear',
      body: 'x', keys: [], retiredAtChapter: null });
    assert.strictEqual((db.addonsOf(se.id).find((x: any) => x.id === ad) as any).retired_at_chapter,
      null, 'an explicit null lifts it, the way setPin and setRetired do');
  });

  ok('two proposals collide only when accepting them would write to the same place', () => {
    // "DUPLICATE" USED TO MEAN SAME CARD. At chapter end several passes each have something to say
    // about one person — her description, a new fact, one of her rooms, that she is finished — and
    // the queue called three of them duplicates of the first and dropped them on a `false` nobody
    // reads. Measured 2026-08-28: `remember`'s state landed and `extract`'s rewrite of the same
    // character was binned, on every close where both spoke. Two rooms of one card did it to each
    // other too, which the rooms feature had inherited on the day it was built.
    const s2 = db.createStory(o, { title: 'Collide' });
    const who = db.upsertEntry(s2.id, o, { title: 'Halsey', body: '[Halsey]', entryType: 'character' });
    const add = (p: any) => db.addProposal(s2.id,
      { title: 'Halsey', entry_id: who, body: 'x', entryType: 'character', kind: 'changed', ...p });

    // FOUR DIFFERENT PLACES, all of them allowed at once.
    assert.strictEqual(add({ kind: 'memory', entryType: 'state', keys: ['2'] }), true, 'her description');
    assert.strictEqual(add({}), true, 'a new fact about her — this is the one that was being lost');
    assert.strictEqual(add({ field: 'voice' }), true, 'her voice');
    assert.strictEqual(add({ field: 'relationships' }), true, 'and a relationship, separately');
    assert.strictEqual(add({ kind: 'retire', entryType: 'retire', keys: ['4'] }), true, 'and finished');
    assert.strictEqual(db.proposalsOf(s2.id).length, 5);

    // AND THE HALF THAT MATTERS MORE: the same place twice is still one offer, or re-running any
    // pass floods the queue — which is what the dedupe was built for in the first place.
    assert.strictEqual(add({}), false, 'the body again');
    assert.strictEqual(add({ kind: 'new' }), false,
      'and `new` is `changed` wearing another label — both write the body, so they must still collide');
    assert.strictEqual(add({ field: 'voice' }), false, 'the same room again');
    assert.strictEqual(add({ kind: 'retire', entryType: 'retire', keys: ['9'] }), false, 'finished again');
    assert.strictEqual(db.proposalsOf(s2.id).length, 5, 'nothing was added by the four refusals');
  });

  ok('  and the dedupe asks the same question the accept path does', () => {
    // One definition, two callers. If these drift, the dedupe is deciding about a write that does
    // not happen — the failure would be invisible in both directions.
    assert.strictEqual(db.proposalTarget({ entry_type: 'state' }), 'state');
    assert.strictEqual(db.proposalTarget({ entry_type: 'retire' }), 'retire');
    assert.strictEqual(db.proposalTarget({ entry_type: 'string' }), 'string');
    assert.strictEqual(db.proposalTarget({ entry_type: 'character', field: 'voice', entry_id: 'e1' }), 'room:voice');
    assert.strictEqual(db.proposalTarget({ entry_type: 'character' }), 'body');
    // A field with no card to hang it on is not a room — it is the body, which is what the accept
    // path does with it too.
    assert.strictEqual(db.proposalTarget({ entry_type: 'character', field: 'voice' }), 'body');
  });

  ok('a proposal can aim at a slot, and an invented one is refused at the column', () => {
    db.addProposal(se.id, { title: 'her fear', body: '[afraid of the water]', entryType: 'character',
      kind: 'new', field: 'interiority', activation: 'triggered', keys: ['water'] });
    db.addProposal(se.id, { title: 'her hope', body: '[wants out]', entryType: 'character',
      kind: 'new', field: 'Motivation', keys: ['out'] });
    const ps = db.proposalsOf(se.id);
    assert.strictEqual(ps.find((x: any) => x.title === 'her fear').field, 'interiority');
    assert.strictEqual(ps.find((x: any) => x.title === 'her fear').activation, 'triggered');
    assert.strictEqual(ps.find((x: any) => x.title === 'her hope').field, null,
      'a slot name the module does not know must not reach the column — that is how one book ends '
      + 'up with Motivation and motivations');
  });
}

// THE <think> STRIP, WHICH #26 NEARLY TOOK WITH IT. `clean` had two halves — the writer's own
// regexes and this — and ripping strip-from-output meant deleting one and keeping the other. The
// whole suite passed either way, because nothing anywhere asserted the surviving half; deleting it
// too would have shipped green and put reasoning tags in the prose the first time
// `enable_thinking: false` was missed on a reasoning model. Falsified by removing the replace: red.
{
  const { clean } = await import('../src/story.ts');
  ok('clean() strips <think>, every block of it, and leaves prose alone', () => {
    assert.equal(clean('<think>weighing it up</think>She did not answer.'), 'She did not answer.',
      'reasoning scaffolding never reaches the page');
    assert.equal(clean('Before.<think>a</think>Between.<think>b</think>After.'),
      'Before.Between.After.', 'every block, not just the first');
    assert.equal(clean('  She waited.  '), 'She waited.', 'prose with no scaffolding is only trimmed');
  });
}

console.log(`\n${n} checks passed`);
