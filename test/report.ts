// Reporting a bug, and the promise the report makes on its own face: no prose leaves the machine.
//
//   node --experimental-strip-types test/report.ts
//
// `gh` is injected, so this files nothing and needs no network. What is under test is what would be
// handed to it — including the whole argv, because "no prose is included" is a claim about the bytes
// that leave, not about the paragraph that describes them.
import assert from 'node:assert';

const DB = '/tmp/anansi-report.db';
const { unlinkSync } = await import('node:fs');
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

const { fileBug, compose } = await import('../src/report.ts');

let n = 0;
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

const PROSE = 'The radiator hisses, a wet rattling cough that pushes the damp out of the corners.';
const PREMISE = 'A solitary observer in a rain-slicked city who recognises desperation.';

// ---- 1. what would actually be handed to gh ----
{
  let saw: string[] = [];
  const fake = async (_cmd: string, args: string[]) => { saw = args; return { stdout: 'https://github.com/x/y/issues/7' }; };
  const r = await fileBug({
    said: 'The tray opens behind the scrim on my phone.',
    who: 'kia', storyId: 's-abc', chapterIndex: 4,
    agent: 'Mozilla/5.0 (Linux; Android 14)', model: 'write-nt-qwen36-h',
    slot: { global: 100096, slots: 2, perSlot: 50048 }, lastError: null,
  } as any, fake as any);

  assert.strictEqual(r.url, 'https://github.com/x/y/issues/7', 'the issue url comes back');
  const argv = saw.join(' ');
  assert.ok(argv.includes('issue') && argv.includes('create'), 'it files an issue');
  assert.ok(argv.includes('The tray opens behind the scrim on my phone.'), "the writer's own words go in");
  assert.ok(argv.includes('kia'), 'and who reported it, or a second writer is indistinguishable from the first');
  assert.ok(argv.includes('s-abc'), 'the story is named by id');
  ok('a report carries the words, the account and the story id');
}

// ---- 2. the promise on its face: no prose, however much of it is lying around ----
{
  let saw: string[] = [];
  const fake = async (_c: string, args: string[]) => { saw = args; return { stdout: 'u' }; };
  // Everything a careless version might reach for, passed in as an EXTRA field. The type does not
  // have these; the point is that adding them at a call site cannot smuggle them out.
  await fileBug({ said: 'It broke.', who: 'sonophage', storyId: 's-abc',
    prose: PROSE, premise: PREMISE, entries: [PROSE] } as any, fake as any);
  const argv = saw.join(' ');
  assert.ok(!argv.includes(PROSE), 'no passage text leaves the machine');
  assert.ok(!argv.includes(PREMISE), 'nor the premise');
  assert.ok(!argv.includes('radiator'), 'nor a word of it');
  ok('the prose does not leave, whatever the caller passes');
}

// ---- 3. the stale-server line, which is the reason this is worth having at all ----
{
  const build = { head: 'abc1234', subject: 'a commit', dirty: false };
  const hour = 3600000;
  const started = Date.parse('2026-08-26T10:00:00Z');
  const older = compose({ said: 'x', who: 'me' } as any, { ...build, committed: started + hour } as any, started);
  const newer = compose({ said: 'x', who: 'me' } as any, { ...build, committed: started - hour } as any, started);
  assert.match(older, /stale server/, 'HEAD newer than the running server says so, loudly');
  assert.doesNotMatch(newer, /stale server/,
    'and a server newer than HEAD does not — the warning has to be able to stay quiet');
  ok('a report against a server older than HEAD says so without being asked');
}

// ---- 4. it refuses an empty report, and never loses a written one ----
{
  const never = (async () => { throw new Error('should not run'); }) as any;
  const empty = await fileBug({ said: '   ', who: 'me' } as any, never);
  assert.match(String(empty.error), /say what went wrong/, 'an empty report is refused before gh is touched');

  const broken = (async () => { throw Object.assign(new Error('gh: not logged in'), { stderr: 'gh: not logged in' }); }) as any;
  const r = await fileBug({ said: 'Something I typed carefully.', who: 'me' } as any, broken);
  assert.ok(r.error, 'a gh failure is reported');
  assert.ok(r.body.includes('Something I typed carefully.'),
    'and the composed report comes back, so nothing the writer typed is lost to it');
  ok('an empty report is refused, and a failed one still hands back what was written');
}

console.log(`\n${n} checks passed`);
