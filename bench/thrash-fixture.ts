// Two tenants, three stories each — the deployment shape, built to ask one question: does
// switching stories cost a full prompt reprocess? Prose is filler because the KV cache does
// not care whether it is good, only whether the prefix matches. Every story gets DISTINCT
// text: identical filler would share a prefix and the cache would hit across stories, which
// would measure nothing.
import { unlinkSync } from 'node:fs';
const DB = process.env.ANANSI_DB ?? '/tmp/anansi-thrash.db';
for (const s of ['', '-wal', '-shm']) { try { unlinkSync(DB + s); } catch {} }
process.env.ANANSI_DB = DB;
const db = await import('../src/db.ts');

const PASSAGES = Number(process.argv[2] ?? 150);
const WORLDS = [
  ['Ashvale', 'Corvin Hale', 'a drowned cathedral', 'saltglass'],
  ['Brackmoor', 'Ilsa Renn', 'the clockmakers guild', 'brasswork'],
  ['Cindermouth', 'Tobias Ward', 'a burning library', 'ashfall'],
  ['Dunhollow', 'Mira Sault', 'the salt mines', 'blackrock'],
  ['Everdim', 'Rook Vance', 'a sunless orchard', 'moonfruit'],
  ['Fenmarch', 'Ada Crowe', 'the reed parliament', 'greenwater'],
];

const out: any[] = [];
for (const [ti, tenant] of ['tenant-a', 'tenant-b'].entries()) {
  const owner = db.owner(tenant);
  for (let s = 0; s < 3; s++) {
    const [place, who, thing, stuff] = WORLDS[ti * 3 + s];
    const story = db.createStory(owner, {
      title: `${place} Chronicle`, genre: 'fantasy',
      premise: `${who} returns to ${place} to find ${thing} waiting.`,
      setting: place, pov: 'third limited, past tense',
      writingStyle: `Plain sentences, ${stuff} imagery, no adverbs.`,
    });
    for (const [t, b, act] of [
      [who, `[${who}: raised in ${place}, keeps a ${stuff} token, never sleeps indoors]`, 'always_on'],
      [place, `[${place}: built over ${thing}. The ${stuff} there is worth more than coin]`, 'always_on'],
      [thing, `[${thing}: sealed for ${20 + s} years. Opening it is a capital crime in ${place}]`, 'triggered'],
    ] as const) db.upsertEntry(story.id, owner, { title: t, body: b, activation: act });

    for (let p = 0; p < PASSAGES; p++)
      db.addPassage({ ...story, storyId: story.id, author: 'model',
        body: `${who} crossed the ${stuff} flats below ${place}, counting ${p} paces between the ` +
              `markers. ${thing} lay somewhere east, and the light off the ${stuff} made it hard ` +
              `to judge distance. Nobody had come this way since the seal, and the ground showed it.` });
    out.push({ tenant, story: story.id, title: `${place} Chronicle` });
  }
}
console.log(JSON.stringify(out));
