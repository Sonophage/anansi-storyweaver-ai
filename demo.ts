/** The demo library: an account that is not yours, with two books in it and cards to show.
 *
 *  Seth, 2026-08-31: "create a dummy account with two stories and cards that i can access from my
 *  backend so when im showing things its not showing my stories and so that i can test things
 *  without messing up my account."
 *
 *  It is a REAL account, not a mode: ownership in this app is a column and every route is gated on
 *  it, so a demo library that is a separate owner needs no new scope, no flag on a story and no
 *  branch in a route. That is the whole reason it is done this way.
 *
 *    node --experimental-strip-types demo.ts          # build it if it is not there
 *    node --experimental-strip-types demo.ts --reset  # throw it away and build it again
 *
 *  TO REACH IT, add the login to ANANSI_ALLOW in .env and restart:
 *
 *    ANANSI_ALLOW=...existing...,demo@example.com=demo
 *
 *  The pair form is `login=account`: whoever signs in as that login lands in this library and
 *  cannot see yours, because `ownsStory` is asked on every route that names a book.
 *
 *  Nothing here calls the model. Every word below is written down, so a demo is the same demo
 *  every time and a broken one is one command from clean.
 */
import * as db from './src/db.ts';

const RESET = process.argv.includes('--reset');
const LOGIN = process.env.ANANSI_DEMO ?? 'demo';
const me = db.owner(LOGIN);

const existing = db.listStories(me);
if (existing.length && !RESET) {
  console.log(`\n  the ${LOGIN} library already has ${existing.length} book(s):`);
  for (const s of existing) console.log(`    ${s.title}`);
  console.log('\n  --reset to throw them away and build them again\n');
  process.exit(0);
}
for (const s of existing) db.delStory(s.id, me);
if (existing.length) console.log(`  cleared ${existing.length} book(s)`);

type Card = { title: string; body: string; kind?: string; keys?: string[] };
const book = (story: any, cards: Card[], prose: string[]) => {
  const made = db.createStory(me, story);
  for (const c of cards) {
    db.upsertEntry(made.id, me, {
      id: '', title: c.title, body: c.body,
      entryType: c.kind ?? 'character',
      // Triggered when it carries keys, always-on when it does not — the same rule the app uses,
      // so a demo shows the ledger behaving the way it really behaves.
      activation: c.keys?.length ? 'triggered' : 'always_on',
      keys: c.keys ?? [], lastEditor: 'human',
    });
  }
  for (const body of prose) db.addPassage({ storyId: made.id, branchId: made.branchId,
    chapterId: made.chapterId, body, author: 'human' });
  console.log(`  ${story.title}: ${cards.length} cards, ${prose.length} passages`);
  return made;
};

book({
  title: 'The Tin Orchard',
  genre: 'literary fantasy',
  premise: 'A grafter who can splice memory into fruit is asked to make a man forget his daughter.',
  setting: 'Ovist, a terraced hill town, at the end of a failing harvest',
  pov: 'third limited, past tense',
  persona: 'Wren Halloway',
  writingStyle: 'Write the narration plain and unhurried. Let a season do the feeling. '
    + 'No adverbs on dialogue tags.',
  styleNote: 'Quiet fantasy. The magic is agricultural and nobody finds it remarkable.',
  spice: 1,
}, [
  { title: 'Wren Halloway', body: '[Wren Halloway: 41, grafter, third generation, hands scarred '
      + 'from the knife, has never spliced a memory she was asked to remove]' },
  { title: 'Emmory Fisk', body: '[Emmory Fisk: the man asking, a widower, patient in a way that '
      + 'frightens people, pays in advance]' },
  { title: 'The orchard', kind: 'place', body: '[The tin orchard: forty trees on the north '
      + 'terrace, grafted for memory rather than fruit, the crop is bitter and nobody eats it]' },
  { title: 'The graft rule', kind: 'rule', body: '[A graft takes what it is given and gives it '
      + 'back changed. Nothing spliced comes out the way it went in.]' },
  { title: 'The daughter', kind: 'lore', keys: ['daughter', 'Isolde'],
    body: '[Isolde Fisk: nineteen, left Ovist two winters ago and has not written. '
      + 'Emmory will not say her name aloud.]' },
], [
  'The last of the light came off the terraces in bands, and Wren Halloway worked by it because '
    + 'the lamp made the knife look worse than it was.',
  '"You want it out," she said. "You do not want it changed. Those are two different jobs and I '
    + 'only do the one."',
]);

book({
  title: 'Salt and Signal',
  genre: 'near-future thriller',
  premise: 'A lighthouse keeper starts receiving weather reports for a coast that does not exist.',
  setting: 'The Fennick light, on a headland the mainland has stopped maintaining',
  pov: 'first person, present tense',
  persona: 'Dalia Roque',
  writingStyle: 'Write the narration in short paragraphs. Keep the sentences flat and technical '
    + 'until they are not.',
  styleNote: 'Procedural on the surface. The dread is in what is logged, not what is said.',
  spice: 0,
}, [
  { title: 'Dalia Roque', body: '[Dalia Roque: 36, keeper for four years, logs everything, '
      + 'trusts instruments over people and knows it is a fault]' },
  { title: 'The Fennick light', kind: 'place', body: '[The Fennick light: automated in name only, '
      + 'the automation failed in the first winter and nobody came to fix it]' },
  { title: 'Coast that does not exist', kind: 'lore', keys: ['Ardmore', 'the reports'],
    body: '[The reports name Ardmore Bank, its tides and its wind. No chart carries it. '
      + 'The figures are internally consistent.]' },
  { title: 'Logging rule', kind: 'rule', body: '[Dalia logs every transmission verbatim, '
      + 'including the ones she does not believe. She has never broken this.]' },
], [
  'The report comes in at 03:12, the way it has every night this week, and I write it down before '
    + 'I let myself think about it.',
  'Ardmore Bank. Wind northeast, fourteen knots. Visibility good. There is no Ardmore Bank.',
]);

console.log(`\n  the ${LOGIN} library is ready — ${db.listStories(me).length} books, owned by `
  + `${LOGIN}, invisible to every other account.`);
console.log(`  reach it by adding to ANANSI_ALLOW in .env:  <their-login>=${LOGIN}\n`);
