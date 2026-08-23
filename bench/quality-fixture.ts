// Fixtures for the capability evals. Each story is built so that the thing being measured has a
// RIGHT ANSWER visible in the canon — a rubric that asks "is this good writing?" measures the
// judge's taste. These ask "does the prose contradict a fact the model was handed?", which is
// the same question F9 asks and the only one this harness can answer honestly.
import { unlinkSync } from 'node:fs';
const DB = process.env.ANANSI_DB ?? '/tmp/anansi-quality.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
const db = await import('../src/db.ts');
const o = db.owner('seth');
const out: Record<string, any> = {};

// --- A. Playing a character. Three constraints, each independently checkable in narration.
{
  const s = db.createStory(o, { title: 'The Ferryman', genre: 'folk horror',
    premise: 'A ferryman who cannot swim is asked to cross at night.',
    setting: 'A river town, no electricity', pov: 'third limited, past tense', persona: 'Sela',
    writingStyle: 'Plain, cold, concrete.' });
  db.upsertEntry(s.id, o, { title: 'Sela', entryType: 'character', activation: 'always_on',
    body: '[Sela: the ferryman. Blind in the right eye. Cannot swim and has never admitted it. ' +
          'Speaks only in short flat sentences, never more than eight words at a time]' });
  db.upsertEntry(s.id, o, { title: 'The river', entryType: 'lore', activation: 'always_on',
    body: '[The Hesk: runs east to west. Freezes solid by midwinter. Nothing crosses it after dark]' });
  db.addPassage({ ...s, storyId: s.id, author: 'human',
    body: 'The lamps were out along the bank. Sela coiled the rope and watched the man come down the steps.' });
  out.character = s.id;
}

// --- B. Enacting a directive without overrunning it.
{
  const s = db.createStory(o, { title: 'The Debt', genre: 'noir',
    premise: 'A collector arrives early.', setting: 'A cold city',
    pov: 'third limited, past tense', writingStyle: 'Terse.' });
  db.upsertEntry(s.id, o, { title: 'Roan', entryType: 'character', activation: 'always_on',
    body: '[Roan: owes eleven crowns. Keeps a knife in his boot and has never drawn it]' });
  db.addPassage({ ...s, storyId: s.id, author: 'human',
    body: 'Roan heard the knock and did not get up. The kettle went on ticking as it cooled.' });
  out.directive = s.id;
}

// --- C. An established IP. Canon states the setting's own facts; the eval asks whether the
// prose stays inside them and admits no anachronism.
{
  const s = db.createStory(o, { title: 'Sentry of Cadia', genre: 'grimdark military science fiction',
    premise: 'An Astra Militarum sentry holds a wall on a besieged world.',
    setting: 'Warhammer 40,000. The Imperium of Man, 41st millennium.',
    pov: 'third limited, past tense', writingStyle: 'Grim, procedural, no irony.' });
  for (const [t, b] of [
    ['Trooper Vek', '[Trooper Vek: Astra Militarum, 118th Cadian. Carries a lasgun, not a bolter — ' +
      'bolters are for Space Marines. Prays to the God-Emperor. Has never seen a xenos]'],
    ['The Imperium', '[The Imperium of Man: rules by the Emperor on the Golden Throne. Technology is ' +
      'maintained by the Adeptus Mechanicus as sacred ritual, not engineering. There is no internet, ' +
      'no democracy, and faith is law]'],
    ['The siege', '[Cadia: under siege. Vox is the only comms. Warp travel is the only way off-world]'],
  ]) db.upsertEntry(s.id, o, { title: t, body: b, entryType: 'lore', activation: 'always_on' });
  db.addPassage({ ...s, storyId: s.id, author: 'human',
    body: 'The wall shook again and dust came down through the lumen-glare. Vek counted the seconds between impacts.' });
  out.ip = s.id;
}

// --- D. A fact that changed. The entry's body is true from chapter one; a state anchored at
// chapter three replaces it. Generating in chapter four must respect the NEW fact.
{
  const s = db.createStory(o, { title: 'The Hand', genre: 'fantasy',
    premise: 'A duellist adapts.', setting: 'A city of schools',
    pov: 'third limited, past tense', writingStyle: 'Plain.' });
  const id = db.upsertEntry(s.id, o, { title: 'Corin', entryType: 'character', activation: 'always_on',
    body: '[Corin: duellist. Fights left-handed. Wears a silver ring on the left thumb]' });
  db.upsertState(s.id, id, { fromChapter: 3,
    body: '[Corin: duellist. LOST THE LEFT HAND at the bridge in chapter three. Fights right-handed ' +
          'now, badly. The silver ring is gone with the hand]' });
  // Walk forward so the open chapter sits past the anchor and the NEW body is the one resolved.
  for (let i = 1; i <= 3; i++) db.endChapter(s.id, s.branchId);
  db.addPassage({ ...s, storyId: s.id, author: 'human',
    body: 'Corin came up the steps into the salle and the others stopped their bouts to look.' });
  out.progression = s.id;
}

// --- E. Noticing something new. The prose introduces a place and a person that are NOT in the
// ledger; extraction should propose both.
{
  const s = db.createStory(o, { title: 'The Long Market', genre: 'fantasy',
    premise: 'A courier walks a city.', setting: 'A port city',
    pov: 'third limited, past tense', writingStyle: 'Plain.' });
  db.upsertEntry(s.id, o, { title: 'Wren', entryType: 'character', activation: 'always_on',
    body: '[Wren: a courier. Fast, incurious, paid by the delivery]' });
  for (const body of [
    'Wren took the parcel south through the Long Market, where the awnings were sewn shut against the rain.',
    'At the far end stood the Sallow Gate, older than the wall around it, its arch carved with a hundred small faces.',
    'A woman was waiting under it. She gave her name as Ismene Faal and said she had been expecting the parcel since Tuesday.',
    'Wren handed it over. Ismene Faal broke the seal with her thumb and did not look up again.',
  ]) db.addPassage({ ...s, storyId: s.id, author: 'model', body });
  out.extraction = s.id;
}

console.log(JSON.stringify(out));
