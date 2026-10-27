// Each writer's own Featherless key (#70, decided 2026-10-27): a file per writer, the book's owner
// pays for a shared book, and a writer with no file of their own has no remote models, only the
// local one. No server and no network: this checks which file a call reads.
//
//   node --experimental-strip-types test/keys.ts
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';

const DIR = mkdtempSync('/tmp/anansi-keys-');
writeFileSync(`${DIR}/featherless-seth.key`, 'fl-SETH\n');
delete process.env.ANANSI_FEATHERLESS_KEY_FILE;
process.env.ANANSI_FEATHERLESS_KEY_DIR = DIR;
const { remoteReady, asPayer, keyPathFor } = await import('../src/llama.ts');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

assert.strictEqual(remoteReady(), false, 'outside any request nobody pays, so nothing remote is ready');
assert.strictEqual(asPayer('seth', () => remoteReady()), true, "Seth's own file makes his calls ready");
assert.strictEqual(asPayer('kia', () => remoteReady()), false, 'a writer with no file of her own has none');
assert.strictEqual(await asPayer('seth', async () => { await new Promise((r) => setTimeout(r, 5)); return remoteReady(); }),
  true, 'and the payer holds across an await, which a streamed generation is');
ok('a call reads the payer\'s own key file, and only theirs');

assert.strictEqual(keyPathFor('seth'), `${DIR}/featherless-seth.key`, 'the file is named for the login');
assert.strictEqual(keyPathFor('../../etc/passwd'), null, 'a login that is not a plain name names no file');
assert.strictEqual(keyPathFor('hellrigelkc@gmail.com'), `${DIR}/featherless-hellrigelkc@gmail.com.key`,
  'an email login is a plain name');
ok('a login is a file name only when it is a plain one');

process.env.ANANSI_FEATHERLESS_KEY_FILE = '/nonexistent/featherless.key';
assert.strictEqual(asPayer('seth', () => remoteReady()), false, 'the one-file override wins, which is how every suite stays offline');
ok('ANANSI_FEATHERLESS_KEY_FILE still overrides every writer');

console.log(`\n${n} checks passed`);
