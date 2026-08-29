// Move every card's body into its `facts` room — the immutable half — across every book and both
// owners. Seth, 2026-08-29: "everything in the cards right now thats in the mutable field should
// move to the immutable one i know thats a lot of work but i dont want that to break."
//
//   node --experimental-strip-types bench/tofacts.ts            # DRY RUN, changes nothing
//   node --experimental-strip-types bench/tofacts.ts --write    # does it, after a backup
//
// WHY IT IS A MOVE AND NOT A COPY. `facts` and the body would hold the same words, and `bodyOf`
// sends both — so a copy puts every card in the prompt TWICE, on every call, for 461 cards. The
// body is the half that a chapter-end state replaces; the facts room is the half nothing rewrites.
// Leaving the words in the mutable one is exactly the loss this exists to prevent.
//
// WHAT AN EMPTY BODY MEANS AFTERWARDS, stated because it is the part that could bite:
//   - the PROMPT is unchanged in content. `bodyOf` joins the body and the open rooms, so the same
//     sentences arrive, once, under a `facts` label instead of bare.
//   - the CONTRADICTION CHECKER had to be fixed first, and was: `factsFor` read the body alone and
//     dropped an entry whose body was empty, so every migrated card would have silently stopped
//     being checked. It judges against the card as the model saw it now, rooms included.
//   - the SURFACE shows an empty description and the facts room filled. That is the shape from
//     here on: the body is what changes, `facts` is what does not.
//
// IDEMPOTENT. A card that already has a facts room is left alone, so running it twice is safe and
// running it after writing more cards moves only the new ones.

const WRITE = process.argv.includes('--write');
const db = await import('../src/db.ts');

const rows = db.db.prepare(`
  SELECT e.id, e.title, e.body, e.story_id, s.title AS story, s.owner_id AS owner
  FROM entries e JOIN stories s ON s.id = e.story_id
  ORDER BY s.owner_id, s.title, e.rowid`).all() as any[];

const has = new Set((db.db.prepare("SELECT entry_id FROM addons WHERE slot = 'facts'").all() as any[])
  .map((a) => a.entry_id));

// A CARD WITH CHAPTER STATES IS LEFT ALONE, and finding out why is the reason this was dry-run
// against a copy first. `resolveBody` returns the newest STATE's body when a card has one, not the
// base body — so moving the base body into `facts` on such a card puts the superseded description
// beside the one that superseded it, in every prompt, saying two different things about her. The
// diff against the pre-move backup showed exactly that: one extra bracketed line, the old Halsey
// under the current Halsey.
//
// Those cards need a judgement — which half of an old description is permanent and which was
// replaced on purpose — and that is the writer's, not a script's. They are named below so the
// decision is visible rather than skipped in silence.
const stated = new Set((db.db.prepare('SELECT DISTINCT entry_id FROM entry_states').all() as any[])
  .map((x) => x.entry_id));
const skipped = rows.filter((r) => String(r.body ?? '').trim() && !has.has(r.id) && stated.has(r.id));
const todo = rows.filter((r) => String(r.body ?? '').trim() && !has.has(r.id) && !stated.has(r.id));
const byOwner: Record<string, number> = {};
const byStory: Record<string, number> = {};
for (const r of todo) {
  byOwner[r.owner] = (byOwner[r.owner] ?? 0) + 1;
  byStory[`${r.owner} · ${r.story}`] = (byStory[`${r.owner} · ${r.story}`] ?? 0) + 1;
}

console.log(`\n  ${WRITE ? 'MOVING' : 'DRY RUN — nothing is written'}\n`);
console.log(`  ${rows.length} cards in the file, ${has.size} already have a facts room`);
console.log(`  ${todo.length} would move\n`);
for (const [k, n] of Object.entries(byStory).sort((a, b) => b[1] - a[1]))
  console.log(`    ${String(n).padStart(4)}  ${k}`);
console.log(`\n  by owner: ${Object.entries(byOwner).map(([o, n]) => `${o} ${n}`).join(', ')}`);
if (skipped.length) {
  console.log(`\n  ${skipped.length} card(s) LEFT ALONE because they carry chapter states — their`);
  console.log(`  body is already superseded per chapter, and moving it would put the old`);
  console.log(`  description beside the one that replaced it:`);
  for (const r of skipped) console.log(`    ${r.title}  (${r.story})`);
}
if (todo.length) {
  const e = todo[0]!;
  console.log(`\n  first one, as an example — ${e.title}:`);
  console.log(`    body now   ${JSON.stringify(String(e.body).slice(0, 92))}`);
  console.log(`    facts room ${JSON.stringify(String(e.body).slice(0, 92))}`);
  console.log(`    body after ""`);
}

if (!WRITE) {
  console.log(`\n  Nothing was changed. Run it with --write to do it, which backs up first.\n`);
  process.exit(0);
}

// A BACKUP BEFORE, NOT A HOPE AFTERWARDS. This rewrites the file somebody's novel is in.
const b = db.backup();
console.log(`\n  backed up to ${b.file} (${(b.bytes / 1048576).toFixed(1)}MB)`);

// ONE TRANSACTION, RAW. `upsertAddon` and `setAddonActive` run transactions of their own, so
// wrapping them in another is "cannot start a transaction within a transaction" — which is how the
// first attempt at this rolled back, harmlessly, on the preview copy. Doing it in SQL here means
// 461 cards move together or none of them do, which is the property that matters when the file is
// somebody's novel.
//
// Inserting active=1 directly is safe because no card has a facts room yet — that is the same
// condition `todo` is built on — so there is no sibling for the exclusivity rule to clear and
// nothing for `setAddonActive`'s transaction to do.
const { randomBytes } = await import('node:crypto');
const insert = db.db.prepare(`INSERT INTO addons (id,story_id,entry_id,slot,name,body,keys,active,created_at)
                              VALUES (?,?,?,'facts',?,?,'[]',1,?)`);
const blank = db.db.prepare('UPDATE entries SET body = ? WHERE id = ?');
let moved = 0;
const now = Date.now();
db.db.exec('BEGIN');
try {
  for (const r of todo) {
    // The room is named for the card, so the prompt reads "[Halsey: …]" the way the body did.
    insert.run('ad-' + randomBytes(4).toString('hex'), r.story_id, r.id, r.title, r.body, now);
    blank.run('', r.id);
    moved++;
  }
  db.db.exec('COMMIT');
} catch (e: any) { db.db.exec('ROLLBACK'); console.log(`  ROLLED BACK, nothing moved: ${e?.message}`); process.exit(1); }

console.log(`  moved ${moved}`);
const left = (db.db.prepare(`SELECT COUNT(*) n FROM entries WHERE TRIM(COALESCE(body,'')) <> ''`).get() as any).n;
console.log(`  cards still carrying a body: ${left}\n`);
