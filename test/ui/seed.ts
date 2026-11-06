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

// A SECOND BOOK, WITH AN ACT IN IT, made first so The Silver Key stays the book touched last. An act
// is only ever written by a roll-up, which is a model call, and a scenario that waits on the model
// tests the router's mood (see the planted proposal below). Kept out of The Silver Key because an act
// over its chapters one and two would replace their summaries in every prompt the other scenarios
// read. Chapter three is current, so the act covers the two chapters behind it.
{
  const acts = db.createStory(me, { title: 'A Tale In Chapters', premise: 'For editing a chapter.' });
  db.endChapter(acts.id, acts.branchId);
  db.endChapter(acts.id, acts.branchId);
  // #47. The act is built from these two summaries, then chapter two is summarised again, so the act
  // opens out of date naming it. The same write `summarise()` ends in, without the model in front.
  const [one, two] = db.chapters(acts.id);
  const sum = (id: string, text: string) => db.setSummary(id, text, 0, db.proseHash([]), 'model');
  sum(one.id, 'Aldis borrows from Marek against the key.');
  sum(two.id, 'Aldis learns the vault is below the waterline.');
  db.addArc(acts.id, { branchId: acts.branchId, fromChapter: 1, toChapter: 2, title: 'Short to Water',
    summary: 'Aldis borrows from Marek against the key, and learns the vault is below the waterline.' });
  sum(two.id, 'Aldis learns the vault floods at every tide.');
  // #76. ONE LINE ON ITS UPDATE REPORT, as a migration writes one: the backup first, then the line,
  // naming a thread. Here and not in The Silver Key, whose report the scenarios read as empty.
  db.upsertEntry(acts.id, me, { id: 'e-report-aldis', title: 'Aldis Fen', body: '[Aldis Fen: a sergeant]',
    entryType: 'character' });
  db.beforeRewrite();
  db.noteUpdate(acts.id, 'His Facts moved into Always true.', 'e-report-aldis');
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
  if (c.summary) db.setSummary(chapterId, c.summary, 1, `seed-${i}`, 'model');
  if (i < input.chapters.length - 1) chapterId = db.endChapter(made.id, made.branchId).opened;
}
// THE LAST ONE IS DIRECTED, and it is the only passage in this fixture that is. A passage carries
// the instruction it was written from, and that instruction is what the re-roll sheet opens for
// editing — so without one, every check of that sheet is a check of a thing that cannot appear.
// Added 2026-09-02, when the sheet became a centred surface and needed driving like the tray.
const DIRECTED = 'She finds the key, and does not say so.';
for (const [i, p] of input.passages.entries()) {
  const last = i === input.passages.length - 1;
  db.addPassage({ storyId: made.id, branchId: made.branchId, chapterId, body: p.body,
    author: 'model', ...(last ? { mode: 'direct', directive: DIRECTED } : {}) });
}
// The engine fixture titles its entries by id ('e-aldis'), because nothing below the prompt
// reads a title. The UI does: the "You are" dropdown is filled from the cast by name. So the
// name is taken from the front of the body, which is where the fixture actually puts it.
const ids: Record<string, string> = {};
for (const e of input.entries) {
  const name = (e.body.match(/^\[([^:\]]+)[:\]]/) ?? [, e.title])[1].trim();
  // A library as it stands, so each thread keeps its setting (`keepOn`): only a thread made in the app
  // starts on a word (2026-11-05).
  ids[name] = db.upsertEntry(made.id, me, { title: name, body: e.body, entryType: e.entryType,
    activation: e.activation, keys: e.keys, lastEditor: 'human' }, { keepOn: true });
}
// MAREK HAS POCKETS AND A CHANGE OVER TIME, so the Pockets and Over time tabs of a thread have
// something on them in the screenshots (test/ui/shots.js opens Marek for those). Marek and not
// Aldis: handlers.js adds Aldis's first outfit and first state and counts exactly one of each.
// NONE OF IT REACHES A PROMPT, so no other scenario reads a different prompt: the pocket is
// written and left off, the outfit is not worn, and the state opens at scene 4, after the
// current scene 3, hidden until then.
const marek = ids['Marek Vale'];
const pocket = db.upsertAddon(made.id, marek, { slot: 'relationships', name: 'Aldis',
  body: 'Marek likes Aldis, which is why he lent to him, and why he will not forgive him.' });
const outfit = db.upsertOutfit(made.id, marek, { name: 'The grey coat',
  body: 'A long grey coat, dry at the hem whatever the weather.' });
const later = db.upsertState(made.id, marek, { fromChapter: 4, label: 'After the bell',
  body: '[Marek Vale: moneylender, courteous, and for the first time seen outside in the rain]' });
if (!marek || !pocket || !outfit || !later) {
  console.error(`  seed: Marek's pocket, outfit or state was refused (${marek} ${pocket} ${outfit} ${later})`);
  process.exit(1);
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
  + `1 planted proposal, a pocket, an outfit and a later state on Marek Vale, and A Tale In Chapters with one act`);
