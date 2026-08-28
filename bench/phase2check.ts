// The two things Phase 2 shipped that no suite could reach: the accept path's activation, which
// needs a running server, and whether the model answers EXTRACT's new required `activation` at
// all, which needs the model. Nothing else is exercised here, on purpose.
//
// IT EARNED ITS KEEP ON THE FIRST RUN. `EXTRACT_SCHEMA` asked for an activation, `proposals` had
// the column, `db.addProposal` validated it — and every proposal still landed `null`, because the
// two builders in `src/routes.ts` never passed the field through. Three green suites had no way to
// see that: the schema was right, the column was right, and the wire between them was missing.
//
//   node --experimental-strip-types test/ui/seed.ts /tmp/anansi-p2.db
//   ANANSI_PORT=5183 ANANSI_DB=/tmp/anansi-p2.db \
//     ANANSI_LLAMA_UNIT=anansi-test-nonexistent.service node --experimental-strip-types serve.ts &
//   node --experimental-strip-types bench/phase2check.ts
//
// Part A needs no model and is the accept path's only guard; it is NOT in `test/all.ts`, because
// that would make every run boot a server for one assertion. If the accept path grows a second
// rule, move A into a suite rather than adding to this file.
process.env.ANANSI_DB = '/tmp/anansi-p2.db';
// The database is SEEDED before this runs and must not be wiped here — that line was copied in
// from test/db.ts and deleted the fixture out from under the server on the first attempt.
const db = await import('../src/db.ts');
const B = process.env.ANANSI_URL ?? 'http://127.0.0.1:5183';
let red = 0;
const ok = (l: string, g: boolean) => { if (!g) red++; console.log('  ' + (g ? 'ok  ' : 'RED ') + l); };
const post = (p: string, body: any) => fetch(B + p, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as any);

const story = db.db.prepare('SELECT id, title FROM stories LIMIT 1').get() as any;
const sid = story.id;
console.log(`\n  story: ${story.title} (${sid})\n`);

// ---- A. the accept path honours a proposal's activation, except for characters ---------------
console.log('  A. the accept path');
const act = (title: string) => (db.db.prepare(
  'SELECT activation FROM entries WHERE story_id = ? AND title = ?').get(sid, title) as any)?.activation;

db.addProposal(sid, { title: 'The tide law', body: '[the tide runs backwards at the third bell]',
  entryType: 'rule', kind: 'new', keys: ['tide', 'third bell'], activation: 'always_on' });
db.addProposal(sid, { title: 'A lamplighter', body: '[a lamplighter: keeps to the north bank]',
  entryType: 'character', kind: 'new', keys: ['lamplighter'], activation: 'triggered' });
db.addProposal(sid, { title: 'The north bank', body: '[the north bank: gas lamps, no watch]',
  entryType: 'lore', kind: 'new', keys: ['north bank'] });

const open = db.proposalsOf(sid);
await post('/api/proposal', { storyId: sid, ids: open.map((p: any) => p.id), accept: true });

ok(`a rule that asked to be always-on lands always-on (${act('The tide law')})`,
   act('The tide law') === 'always_on');
// The one the evidence forbids. ledger-audit: 1 in 12 would go dark and 2 more are safe on the
// record but dark on the next call, so a MODEL may not make a character triggered. A writer still
// can, by hand, on the screen where the trigger words are now visible.
ok(`  a character that asked to be triggered is overridden to always-on (${act('A lamplighter')})`,
   act('A lamplighter') === 'always_on');
ok(`  and a proposal with no activation still falls back on its type (${act('The north bank')})`,
   act('The north bank') === 'triggered');

// ---- B. does the model answer the new required field, on a real call? -------------------------
console.log('\n  B. one real extraction — the constrained decode with a new required enum');
db.db.prepare('DELETE FROM proposals WHERE story_id = ?').run(sid);
const t0 = Date.now();
const r = await post('/api/extract', { storyId: sid });
const secs = ((Date.now() - t0) / 1000).toFixed(0);
if (r?.error) { ok(`the extract call came back without an error (${r.error})`, false); }
else {
  const ps = db.proposalsOf(sid);
  console.log(`  ${ps.length} proposals in ${secs}s`);
  for (const p of ps) console.log(`    ${p.entry_type.padEnd(10)} ${String(p.activation).padEnd(10)} `
    + `${p.title}  keys=${p.keys}`);
  // ONE RUN. This is not a rate and must not be read as one — it answers "does the decode return
  // the field at all", which is a yes/no that one call can settle, and nothing else.
  ok(`every proposal carries an activation from the enum (${ps.length} proposals, one run)`,
     ps.length > 0 && ps.every((p: any) => p.activation === 'always_on' || p.activation === 'triggered'));
  const titleOnly = ps.filter((p: any) => {
    const k = JSON.parse(p.keys || '[]');
    return k.length === 1 && String(k[0]).toLowerCase() === String(p.title).toLowerCase();
  });
  // F27 said every invented key repeats the title. The prompt now says a key is a word that
  // appears in the prose. Reported, NOT asserted: one run cannot bound that rate, and asserting it
  // would be a check that passes or fails on the weather.
  console.log(`  keys that are only the title repeated: ${titleOnly.length} of ${ps.length}`
    + ` — reported, not asserted; one run bounds nothing (F10)`);
}
console.log(red ? `\n  ${red} RED\n` : '\n  both green\n');
process.exit(red ? 1 : 0);
