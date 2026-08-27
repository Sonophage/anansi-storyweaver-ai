// Put "The Silver Key" into a database if it is not already there.
//
// The scenarios all begin by looking that story up by title, and it used to be a story living
// in the working anansi.db — so the moment its owner deleted it, six scenarios started dying on
// line one. run.sh scored that as green, because zero assertions is zero failures. The ground
// truth for a test suite cannot be a row someone edits by hand, so it is built here instead,
// from the same fixture the engine tests use.
//
//   node --experimental-strip-types test/ui/seed.ts /path/to/db
import { input } from '../fixture.ts';

const file = process.argv[2];
if (!file) { console.error('usage: seed.ts <db path>'); process.exit(1); }
process.env.ANANSI_DB = file;
const db = await import('../../src/db.ts');

const me = db.owner('sonophage');
if (db.listStories(me).some((s: any) => s.title === input.story.title)) {
  console.log(`  ${input.story.title} already there`);
  process.exit(0);
}

// `persona` is a UI-level field the engine fixture does not carry — buildContext never reads a
// main character's NAME, only the point of view. The surfaces need it: it fills the "You are"
// control, and it is who Speak and Act default to. Without it the seeded story has no
// protagonist, which is a legitimate state but not the one most assertions are about.
const made = db.createStory(me, { ...input.story, persona: 'Aldis Fen' });
// Chapter one exists already; the fixture's later chapters are opened in order so the summaries
// land on closed chapters, which is the state the scenarios read.
let chapterId = made.chapterId;
for (const [i, c] of input.chapters.entries()) {
  db.updateChapter(made.id, chapterId, { title: c.title, authorsNote: c.authorsNote ?? '' });
  if (c.summary) db.setSummary(chapterId, c.summary, 1, `seed-${i}`);
  if (i < input.chapters.length - 1) chapterId = db.endChapter(made.id, made.branchId).opened;
}
for (const p of input.passages) {
  db.addPassage({ storyId: made.id, branchId: made.branchId, chapterId, body: p.body, author: 'model' });
}
// The engine fixture titles its entries by id ('e-aldis'), because nothing below the prompt
// reads a title. The UI does: the "You are" dropdown is filled from the cast by name. So the
// name is taken from the front of the body, which is where the fixture actually puts it.
for (const e of input.entries) {
  const name = (e.body.match(/^\[([^:\]]+)[:\]]/) ?? [, e.title])[1].trim();
  db.upsertEntry(made.id, me, { title: name, body: e.body, entryType: e.entryType,
    activation: e.activation, keys: e.keys, lastEditor: 'human' });
}
// ONE PROPOSAL, PLANTED. `handlers.js` tests Accept by firing a real /api/extract and working
// whatever the model proposed — so on a run where the model was busy, loading, or simply proposed
// nothing, that block silently did not execute and the scenario reported 39 ok instead of 40 with
// no red. A count that moves with the mood of a live model cannot tell "the accept path is broken"
// from "the router was busy", and `.claude/CLAUDE.md` records handlers' drifting count as
// undiagnosed. This is the diagnosis: the ground truth was a model call.
//
// Planted here, so Accept always has something to accept. The scenario still runs extraction first
// and works whatever that adds — this only guarantees the queue is never empty.
db.addProposal(made.id, { kind: 'new', chapterId, title: 'The Vantic Rain',
  body: '[The Vantic Rain: it has not stopped in three days, and the gutters have given up.]',
  entryType: 'lore', keys: ['rain'] });

console.log(`  seeded ${input.story.title}: ${input.chapters.length} chapters, `
  + `${input.passages.length} passages, ${input.entries.length} entries, persona Aldis Fen, `
  + `1 planted proposal`);
