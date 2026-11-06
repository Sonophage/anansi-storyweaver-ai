// A TALE CUT BACK TO ONE POINT, ON A SCRATCH SERVER. The setup that bench/modes-read.ts,
// bench/act-react.ts, bench/narrate-replay.ts and bench/direct-echo.ts each had a copy of: copy the
// library, pin the model on the tale, delete everything after the point, reopen its scene, start a
// server on the copy, and confirm it serves that tale, on that model, at that scene, before any take.
//
// NEVER THE LIVE LIBRARY: the copy is made with VACUUM INTO from a read-only connection, and the server
// is started on the copy, never on `source`.
//
// WHY THE SCENE IS REOPENED: a hemmed scene is closed, and the app opens a fresh one after a closed last
// scene, so without it the takes would be written into an empty new scene.
//
//   node --experimental-strip-types bench/scene.ts check     # the cut, on a scratch library, no model
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { rmSync, appendFileSync } from 'node:fs';

export type Point = { chapter: number; after: number; title?: string; login?: string };

/** Copy `source` to `file` and cut the tale back to the point. `edit` runs on the open copy last, for
 *  an arm's own change (its wording in the copy's saved prompts). Returns the tale's id and owner. */
export function copyAt(source: string, file: string, at: Point, model: string,
                       edit?: (d: DatabaseSync, st: { id: string; owner_id: string }) => void) {
  for (const x of ['', '-wal', '-shm']) rmSync(file + x, { force: true });
  const src = new DatabaseSync(source, { readOnly: true }); src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); src.close();
  const d = new DatabaseSync(file);
  try {
    d.exec('PRAGMA foreign_keys = ON');
    const st = d.prepare('SELECT s.id, s.owner_id FROM stories s JOIN users u ON u.id = s.owner_id WHERE s.title = ? AND u.login = ?')
      .get(at.title ?? 'ENCORE', at.login ?? 'sonophage') as any;
    if (!st) throw new Error(`no tale "${at.title ?? 'ENCORE'}" of ${at.login ?? 'sonophage'} in ${source}`);
    d.prepare('UPDATE stories SET model = ? WHERE id = ?').run(model, st.id);
    const ch = d.prepare('SELECT id FROM chapters WHERE story_id = ? AND idx = ?').get(st.id, at.chapter) as any;
    if (!ch) throw new Error(`the tale has no scene ${at.chapter}`);
    // THE POINT: later scenes go, and this scene's passages after the cut.
    d.prepare('DELETE FROM passages WHERE story_id = ? AND (chapter_id IN (SELECT id FROM chapters WHERE story_id = ? AND idx > ?) OR (chapter_id = ? AND ordinal > ?))')
      .run(st.id, st.id, at.chapter, ch.id, at.after);
    d.prepare('DELETE FROM chapters WHERE story_id = ? AND idx > ?').run(st.id, at.chapter);
    d.prepare("UPDATE chapters SET status = 'open' WHERE id = ?").run(ch.id);
    edit?.(d, st);
    return { storyId: st.id as string, ownerId: st.owner_id as string };
  } finally { d.close(); }
}

/** Start a server on the copy, wait for it, and confirm it serves the tale on `model` at the point.
 *  `j(path)` is a GET, `j(path, body)` a POST; a failed fetch comes back as `{ error }`. */
export async function serveAt(file: string, port: number, model: string, at: Point, storyId: string, log: string,
                             cwd = new URL('..', import.meta.url).pathname) {
  // `cwd` is the checkout whose code serves: another worktree is how an arm runs code from before a change.
  const kid = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], { cwd,
    stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ANANSI_PORT: String(port), ANANSI_DB: file, ANANSI_MODEL: model,
      ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key', ANANSI_ALLOW: '' } });
  kid.stderr!.on('data', (b) => appendFileSync(log, b));
  const j = (u: string, b?: unknown) => fetch(`http://127.0.0.1:${port}${u}`, b
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any, (e) => ({ error: String(e) }));
  const kill = () => { kid.kill(); };
  let up = false;
  for (let i = 0; i < 90 && !up; i++) { up = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
  if (!up) { kill(); throw new Error(`no server on ${port}; see ${log}`); }
  const v = await j(`/api/story?story=${storyId}`);
  if (v.story?.model !== model || v.currentChapter?.index !== at.chapter) {
    kill(); throw new Error(`port ${port} serves the tale on ${v.story?.model}, scene ${v.currentChapter?.index}`);
  }
  return { j, kill };
}

if (import.meta.main && process.argv[2] === 'check') {
  const assert = (await import('node:assert')).default;
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  // A tiny library with the tables the cut touches, so the check needs neither the real one nor a model.
  const dir = mkdtempSync(join(tmpdir(), 'anansi-scene-'));
  const src = join(dir, 'src.db'), out = join(dir, 'out.db');
  const s = new DatabaseSync(src);
  s.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT);
    CREATE TABLE stories (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT, model TEXT);
    CREATE TABLE chapters (id TEXT PRIMARY KEY, story_id TEXT, idx INTEGER, status TEXT);
    CREATE TABLE passages (id TEXT PRIMARY KEY, story_id TEXT, chapter_id TEXT, ordinal INTEGER);
    INSERT INTO users VALUES ('u1','sonophage'),('u2','kia');
    INSERT INTO stories VALUES ('s1','u1','ENCORE',NULL),('s2','u2','ENCORE',NULL);
    INSERT INTO chapters VALUES ('c1','s1',1,'closed'),('c2','s1',2,'closed'),('c3','s1',3,'open'),('k1','s2',1,'open'),('k2','s2',2,'open');
    INSERT INTO passages VALUES ('p1','s1','c1',1),('p2','s1','c2',5),('p3','s1','c2',6),('p4','s1','c3',7),('k','s2','k1',9);`);
  s.close();
  let edited = '';
  const got = copyAt(src, out, { chapter: 2, after: 5 }, 'M', (_d, st) => { edited = st.id; });
  const d = new DatabaseSync(out, { readOnly: true });
  assert.deepStrictEqual(got, { storyId: 's1', ownerId: 'u1' }, 'SCENE-WHOSE: the tale of the named writer, not another\'s of the same title');
  assert.deepStrictEqual((d.prepare('SELECT id FROM passages ORDER BY id').all() as any[]).map((r) => r.id), ['k', 'p1', 'p2'],
    'SCENE-CUT: passages after the point and in later scenes go; earlier ones and another writer\'s stay');
  assert.deepStrictEqual((d.prepare("SELECT id FROM chapters WHERE story_id = 's1' ORDER BY idx").all() as any[]).map((r) => r.id), ['c1', 'c2'],
    'SCENE-LATER: later scenes go');
  assert.strictEqual((d.prepare("SELECT status FROM chapters WHERE id = 'c2'").get() as any).status, 'open', 'SCENE-OPEN: the point\'s scene is reopened');
  assert.strictEqual((d.prepare("SELECT model FROM stories WHERE id = 's1'").get() as any).model, 'M', 'SCENE-MODEL: the model is pinned on the tale');
  assert.strictEqual(edited, 's1', 'SCENE-EDIT: the arm\'s edit runs on the copy');
  d.close();
  const raw = new DatabaseSync(src, { readOnly: true });
  assert.strictEqual((raw.prepare('SELECT count(*) n FROM passages').get() as any).n, 5, 'SCENE-SOURCE: the source is untouched');
  raw.close();
  assert.throws(() => copyAt(src, out, { chapter: 9, after: 0 }, 'M'), /no scene 9/, 'SCENE-MISSING: a point that is not there says so');
  rmSync(dir, { recursive: true, force: true });
  console.log('  ok  scene: the copy is cut back to the point, reopened, and the source is left alone');
}
