// The Account pages' own routes (2026-10-27): a writer's name and picture, and whether their own
// Featherless key file is there. Owner-scoped: every read and write takes c.owner.
//
//   node --experimental-strip-types test/account.ts
import assert from 'node:assert';
import { unlinkSync, mkdtempSync, writeFileSync } from 'node:fs';

const DB = '/tmp/anansi-account.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;
const KEYS = mkdtempSync('/tmp/anansi-account-keys-');
delete process.env.ANANSI_FEATHERLESS_KEY_FILE;
process.env.ANANSI_FEATHERLESS_KEY_DIR = KEYS;
const db = await import('../src/db.ts');
const { routes, OPEN_ROUTES } = await import('../src/routes.ts');
const { asPayer } = await import('../src/llama.ts');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const alice = db.owner('alice'), bob = db.owner('bob');
const ctx = (owner: string, body: any = {}, query = '') => ({ owner, body, query: new URLSearchParams(query) }) as any;
const as = (login: string, f: () => any) => asPayer(login, f);

for (const r of ['GET /api/me', 'POST /api/me', 'POST /api/me/avatar', 'GET /api/me/avatar', 'DELETE /api/me/avatar'])
  assert.ok(OPEN_ROUTES.has(r) && routes[r], `${r} exists and is open: it names no story`);
ok('the account routes exist and name no story');

let me = as('alice', () => routes['GET /api/me'](ctx(alice)));
assert.deepStrictEqual([me.login, me.name, me.avatar, me.featherless.ready], ['alice', 'alice', null, false],
  'a new writer: their login as their name, no picture, no key');
assert.strictEqual(me.featherless.file, `${KEYS}/featherless-alice.key`, 'and where their key file goes');
writeFileSync(`${KEYS}/featherless-alice.key`, 'fl-A\n');
assert.strictEqual(as('alice', () => routes['GET /api/me'](ctx(alice))).featherless.ready, true, 'the file makes it ready');
assert.strictEqual(as('bob', () => routes['GET /api/me'](ctx(bob))).featherless.ready, false, "and it is alice's, not bob's");
ok("the page says whether this writer's own key file is there, and where it goes");

me = routes['POST /api/me'](ctx(alice, { name: '  Alice Vane  ' }));
assert.strictEqual(me.name, 'Alice Vane', 'a name is saved trimmed');
assert.strictEqual(routes['GET /api/me'](ctx(bob)).name, 'bob', "and only on the writer's own account");
assert.throws(() => routes['POST /api/me'](ctx(alice, { name: '   ' })), /name/, 'an empty name is refused');
ok('a writer names themselves, and nobody else');

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
me = routes['POST /api/me/avatar'](ctx(alice, { dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') }));
assert.ok(me.avatar, 'the picture is set and the answer says when');
const got = routes['GET /api/me/avatar'](ctx(alice));
assert.deepStrictEqual(Buffer.from(got.__raw.body), jpeg, 'and comes back byte for byte');
assert.throws(() => routes['GET /api/me/avatar'](ctx(bob)), /picture/, 'bob has none, and cannot read hers');
assert.throws(() => routes['POST /api/me/avatar'](ctx(alice, { dataUrl: 'data:image/jpeg;base64,' + Buffer.from('<svg>').toString('base64') })),
  /JPEG/, 'a file that is not a JPEG is refused');
routes['DELETE /api/me/avatar'](ctx(alice));
assert.strictEqual(routes['GET /api/me'](ctx(alice)).avatar, null, 'and it can be taken off');
ok("a writer's picture is theirs alone, checked at the door, and removable");

console.log(`\n${n} checks passed`);
