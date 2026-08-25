// Persistence checks. Runs against a scratch database, never the real one.
// ESM imports hoist, so the env var must be set before db.ts is *loaded*, not merely
// before the import statement appears. A static import here would have opened the real
// database and run destructive tests against the actual book.
process.env.ANANSI_DB = '/tmp/anansi-test.db';
import assert from 'node:assert';
import { unlinkSync, readFileSync } from 'node:fs';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync('/tmp/anansi-test.db' + f); } catch {} }
const db = await import('../src/db.ts');

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
const { classifyFor } = await import('../src/routes.ts');
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

// The whole point: it reaches the model as a SECOND bracket, and stops when taken off.
ok('the worn outfit rides with the entry into the prompt', async () => {
  const o = db.owner('wardrobe-prompt');
  const st = db.createStory(o, { title: 'Worn' });
  const e = db.upsertEntry(st.id, o, { title: 'Ilva Marren', body: '[Ilva Marren: 34, envoy]' });
  const plate = db.upsertOutfit(st.id, e, { name: 'Plate', body: 'the plate she took from the hall.' });
  const { entryText } = await import('../src/render.ts');
  const { view } = await import('../src/story.ts');
  const text = () => entryText(view(st.id)!.entries.find((x: any) => x.id === e) as any);
  assert.strictEqual(text(), '[Ilva Marren: 34, envoy]', 'nothing worn, nothing added');
  db.wearOutfit(st.id, e, plate);
  assert.match(text(), /^\[Ilva Marren: 34, envoy\]\n\[Ilva Marren wears: the plate/,
    'worn, it is a second bracket under the body — not an edit to it');
  // The wearer is the entry's OWN title, not its first word. Taking the first word turned
  // "The Murmur" and "The Rust Choir" — both real entries from an imported AI Dungeon story —
  // into "[The wears: ...]". The title is what the body already uses, so the two lines agree.
  const murmur = db.upsertEntry(st.id, o, { title: 'The Murmur', body: '[The Murmur: still and sharp]' });
  const coat = db.upsertOutfit(st.id, murmur, { name: 'Coat', body: 'a loose coat, lavender.' });
  db.wearOutfit(st.id, murmur, coat);
  const line = entryText(view(st.id)!.entries.find((x: any) => x.id === murmur) as any).split('\n')[1];
  assert.strictEqual(line, '[The Murmur wears: a loose coat, lavender.]',
    `a name beginning with an article must survive intact, got ${line}`);
  db.wearOutfit(st.id, e, null);
  assert.strictEqual(text(), '[Ilva Marren: 34, envoy]', 'taken off, it is gone again');
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

console.log(`\n${n} checks passed`);
