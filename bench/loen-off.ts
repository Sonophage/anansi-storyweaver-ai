// Turn the old script off on every tale one login owns. Seth, 2026-11-03: "turn it off for Kia".
//
//   node --experimental-strip-types bench/loen-off.ts <login>   # the library ANANSI_DB names, or the default
//   node --experimental-strip-types bench/loen-off.ts check     # the self-check, on a scratch library
//
// The write is `db.loenOffFor`, scoped to the tales the login OWNS: a tale it only writes in is left
// to its owner. It moves nothing on the shelf, makes no account, and a second run changes nothing.
// The writer can turn it back on, per tale, on the Tale tab.

import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = process.argv[2];
if (!arg) { console.error('usage: bench/loen-off.ts <login> | check'); process.exit(2); }

if (arg === 'check') {
  // A scratch library, named before src/db.ts is loaded: it opens its file at import.
  const dir = mkdtempSync(join(tmpdir(), 'anansi-loen-off-'));
  process.env.ANANSI_DB = join(dir, 'check.db');
  try {
    const db = await import('../src/db.ts');
    const kia = db.owner('kia'), seth = db.owner('seth');
    const a = db.createStory(kia, { title: 'Hers', premise: 'p' });
    const b = db.createStory(seth, { title: 'His', premise: 'p' });
    assert.strictEqual(db.loenOffFor('nobody'), null, 'an unknown login changes nothing');
    assert.deepStrictEqual(db.loenOffFor('kia'), ['Hers'], 'it turns off the login\'s own tale');
    assert.strictEqual((db.getStory(a.id) as any).loen, 0, '  and it is off');
    assert.strictEqual((db.getStory(b.id) as any).loen, 1, 'another login\'s tale is left on');
    assert.deepStrictEqual(db.loenOffFor('kia'), [], 'a second run changes nothing');
    console.log('  ok  bench/loen-off.ts: one login\'s own tales, once');
  } finally { rmSync(dir, { recursive: true, force: true }); }
} else {
  const db = await import('../src/db.ts');
  const off = db.loenOffFor(arg);
  if (off === null) { console.error(`no account with the login ${JSON.stringify(arg)} in ${db.FILE}`); process.exit(1); }
  console.log(`${db.FILE}: the old script is off on ${off.length} more of ${arg}'s tales${off.length ? `: ${off.join(', ')}` : ''}`);
}
