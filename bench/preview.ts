// A PHONE PREVIEW OF A WORKTREE, as one command. A copy of the worktree's tracked files in /tmp, a
// test database of its own, and a server on the tailnet address that a phone can open.
//
//   node --experimental-strip-types bench/preview.ts <worktree> <port>               # start or refresh
//   node --experimental-strip-types bench/preview.ts <worktree> <port> --fake-model  # with fake text
//   node --experimental-strip-types bench/preview.ts <port> --stop                   # stop it
//   node --experimental-strip-types bench/preview.ts check                           # its own cases
//
// It was done by hand: copy `git ls-files` into /tmp, find the old server's pid with `ss`, read its
// /proc/<pid>/environ, kill it, start again with eleven env vars. Three refreshes and one improvised
// second preview in one session on 2026-10-25, each one a chance to kill the wrong server.
//
// Run it again to refresh: it stops the server(s) it started, copies the files again, keeps the
// database, and starts again. Everything lives in /tmp/anansi-preview-<port>/: the copy in app/,
// preview.db, serve.log, and pids.json, which names what it started.
//
// WITHOUT --fake-model the model address refuses at once, so every model call fails the way it does
// with the model down. WITH it, test/ui/router.ts answers instead: fake text, no GPU.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { request } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert';

/** The tailnet address the phone reaches, and the name on the certificate. The live server serves
 *  the same Let's Encrypt pair; serve.ts turns TLS on when ANANSI_CERT and ANANSI_KEY are both set.
 *  The name resolves to the tailnet address, so the URL is the name, not the address. */
const HOST = process.env.ANANSI_HOST ?? '100.118.90.114';
const NAME = 'anansi.sonophage.dev';
const TLS_DIR = '/home/sonophage/anansi/tls/certificates';
const CERT = process.env.ANANSI_CERT ?? `${TLS_DIR}/${NAME}.crt`;
const KEY = process.env.ANANSI_KEY ?? `${TLS_DIR}/${NAME}.key`;

/** Ports that belong to something else: the live server, test/ui/run.sh, and test/scope.ts.
 *  A preview there would be stopped by, or would stop, the thing that owns it. */
const TAKEN: Array<[number, number, string]> = [
  [5174, 5174, 'the live server'], [5179, 5179, 'test/ui/run.sh'],
  [5187, 5190, 'test/scope.ts'], [5194, 5196, 'test/scope.ts'],
];

export function refuse(port: string): string | null {
  const n = Number(port);
  if (!/^\d+$/.test(port) || n < 1024 || n > 65535) return `${port} is not a port from 1024 to 65535`;
  for (const [a, b, who] of TAKEN) if (n >= a && n <= b) return `${n} belongs to ${who}`;
  return null;
}

export const dirFor = (port: string) => join(tmpdir(), `anansi-preview-${port}`);
/** ALWAYS a file under the preview's own directory. Never the live anansi.db, by construction:
 *  nothing here takes a database path from the caller or from the environment. */
export const dbFor = (port: string) => join(dirFor(port), 'preview.db');

/** The server's environment, built from nothing. The caller's ANANSI_* are NOT inherited: run from
 *  test/all.ts, ANANSI_DB is set; run from a shell with the live .env loaded, every one is. */
export function envFor(port: string, llama: string): Record<string, string> {
  const db = dbFor(port);
  assert.ok(db.startsWith(dirFor(port) + '/') && !db.endsWith('anansi.db'), `refusing database ${db}`);
  return {
    PATH: process.env.PATH ?? '/usr/bin', HOME: process.env.HOME ?? '/tmp', LANG: process.env.LANG ?? 'C.UTF-8',
    ANANSI_PREVIEW: dirFor(port),                  // the mark stop() looks for before it kills
    ANANSI_DB: db, ANANSI_PORT: port, ANANSI_HOST: HOST, ANANSI_CERT: CERT, ANANSI_KEY: KEY,
    ANANSI_USER: 'sonophage', ANANSI_ALLOW: 'zlovlokvi@gmail.com=sonophage',
    ANANSI_LLAMA: llama,
    // Preferences can stop and restart the router unit. Point it at one that does not exist, with
    // or without the fake, so a press on the phone can never take the real model down.
    ANANSI_LLAMA_UNIT: 'anansi-test-nonexistent.service',
    ANANSI_BACKUP_DIR: 'off', ANANSI_EXPORT_DIR: 'off',
    // Never the real Featherless or Hugging Face: no key, and an address that refuses.
    ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key',
    ANANSI_FEATHERLESS_URL: 'http://127.0.0.1:9/v1', ANANSI_HF_URL: 'http://127.0.0.1:9',
  };
}

/** Is the process with this environ one this script started for this port? Both marks, or no. */
export function owns(environ: string, port: string): boolean {
  const vars = new Set(environ.split('\0'));
  return vars.has(`ANANSI_PORT=${port}`) && vars.has(`ANANSI_PREVIEW=${dirFor(port)}`);
}

const alive = (pid: number) => existsSync(`/proc/${pid}`);
const environOf = (pid: number) => { try { return readFileSync(`/proc/${pid}/environ`, 'latin1'); } catch { return ''; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stop what pids.json names, each one only after its environ says it is ours. */
async function stop(port: string) {
  const file = join(dirFor(port), 'pids.json');
  let pids: Record<string, number> = {};
  try { pids = JSON.parse(readFileSync(file, 'utf8')).pids ?? {}; } catch { console.log(`  nothing recorded for ${port}`); return; }
  for (const [what, pid] of Object.entries(pids)) {
    if (!alive(pid)) { console.log(`  ${what} (pid ${pid}) is not running`); continue; }
    if (!owns(environOf(pid), port)) { console.log(`  ${what} (pid ${pid}) is NOT this preview's — left alone`); continue; }
    process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 50 && alive(pid); i++) await sleep(100);
    if (alive(pid) && owns(environOf(pid), port)) process.kill(pid, 'SIGKILL');
    for (let i = 0; i < 20 && alive(pid); i++) await sleep(100);
    console.log(`  ${what} (pid ${pid}) ${alive(pid) ? 'did NOT stop' : 'stopped'}`);
  }
  rmSync(file, { force: true });
}

/** Copy the worktree's tracked files, as they are on disk now, into a fresh app/. A tracked file
 *  deleted in the worktree is skipped; an untracked file is not copied. */
function sync(worktree: string, app: string) {
  const files = execFileSync('git', ['-C', worktree, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  rmSync(app, { recursive: true, force: true });
  let n = 0;
  for (const f of files) {
    const from = join(worktree, f);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(app, f)), { recursive: true });
    copyFileSync(from, join(app, f)); n++;
  }
  return n;
}

const free = (port: number) => new Promise<boolean>((done) => {
  const s = createServer().once('error', () => done(false)).listen(port, HOST, () => s.close(() => done(true)));
});

/** Up when it answers at all. A 403 is up: this machine is a tailnet peer the allowlist may not name. */
const answers = (port: string) => new Promise<number | null>((done) => {
  const r = request({ host: HOST, port: Number(port), path: '/', servername: NAME, rejectUnauthorized: false, timeout: 2000 },
    (res) => { res.resume(); done(res.statusCode ?? 0); });
  r.on('error', () => done(null)).on('timeout', () => { r.destroy(); done(null); });
  r.end();
});

function start(cmd: string[], cwd: string, env: Record<string, string>, log: string) {
  const fd = openSync(log, 'a');
  // detached: a session of its own (setsid), so the preview outlives the shell that started it.
  const child = spawn(process.execPath, ['--experimental-strip-types', ...cmd], { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  return child.pid!;
}

async function main(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const pos = argv.filter((a) => !a.startsWith('--'));
  const port = pos[pos.length - 1] ?? '';
  const no = refuse(port);
  if (no) { console.error(`  refused: ${no}`); process.exit(2); }
  const dir = dirFor(port);
  if (flags.has('--stop')) return stop(port);

  const worktree = resolve(pos[0] ?? '');
  if (pos.length !== 2 || !existsSync(join(worktree, '.git'))) {
    console.error('  usage: bench/preview.ts <worktree> <port> [--fake-model]   |   <port> --stop'); process.exit(2);
  }
  for (const f of [CERT, KEY]) if (!existsSync(f)) { console.error(`  no TLS file at ${f} (set ANANSI_CERT and ANANSI_KEY)`); process.exit(2); }

  mkdirSync(dir, { recursive: true });
  await stop(port);
  if (!(await free(Number(port)))) { console.error(`  refused: ${HOST}:${port} is in use by something this script did not start`); process.exit(2); }
  const app = join(dir, 'app');
  console.log(`  copied        ${sync(worktree, app)} tracked files from ${worktree}`);
  if (!existsSync(dbFor(port))) {
    execFileSync(process.execPath, ['--experimental-strip-types', 'test/ui/seed.ts', dbFor(port)], { cwd: app, stdio: 'ignore' });
    console.log(`  seeded        ${dbFor(port)}`);
  } else console.log(`  kept          ${dbFor(port)}`);

  const pids: Record<string, number> = {};
  let llama = 'http://127.0.0.1:9';
  if (flags.has('--fake-model')) {
    const portFile = join(dir, 'router.port');
    rmSync(portFile, { force: true });
    pids.router = start(['test/ui/router.ts', portFile], app, envFor(port, llama), join(dir, 'router.log'));
    for (let i = 0; i < 50 && !(existsSync(portFile) && readFileSync(portFile, 'utf8').trim()); i++) await sleep(200);
    const rp = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim() : '';
    if (!rp) { writeFileSync(join(dir, 'pids.json'), JSON.stringify({ pids })); await stop(port); console.error('  the fake router never came up; see router.log'); process.exit(1); }
    llama = `http://127.0.0.1:${rp}`;
  }
  pids.serve = start(['serve.ts'], app, envFor(port, llama), join(dir, 'serve.log'));
  writeFileSync(join(dir, 'pids.json'), JSON.stringify({ worktree, port, fakeModel: flags.has('--fake-model'), pids }, null, 1));

  // Forty seconds, as test/scope.ts waits: node parses the whole tree with no build step first.
  let status: number | null = null;
  for (let i = 0; i < 80 && status === null && alive(pids.serve); i++) { await sleep(500); status = await answers(port); }
  if (status === null) {
    console.error(`  the server did not answer on ${HOST}:${port}. Last of serve.log:`);
    console.error(readFileSync(join(dir, 'serve.log'), 'utf8').split('\n').slice(-12).join('\n'));
    await stop(port); process.exit(1);
  }
  console.log(`  model         ${flags.has('--fake-model') ? `fake, ${llama}` : 'none (refuses at once)'}`);
  console.log(`  serving       https://${NAME}:${port}/   (bound to ${HOST}, answered ${status})`);
  console.log(`  stop          node --experimental-strip-types bench/preview.ts ${port} --stop`);
}

if (process.argv[2] === 'check') {
  let n = 0;
  const t = (ok: unknown, msg: string) => { assert.ok(ok, msg); n++; };
  for (const p of ['5174', '5179', '5187', '5188', '5190', '5194', '5196'])
    t(refuse(p), `${p} must be refused`);
  for (const p of ['5301', '5302', '5186', '5191', '5193', '5197'])
    t(refuse(p) === null, `${p} must be allowed`);
  for (const p of ['', 'abc', '80', '70000', '5301x'])
    t(refuse(p), `"${p}" is not a port and must be refused`);

  // The caller's database never reaches the server: test/all.ts sets ANANSI_DB for every bench run.
  const was = process.env.ANANSI_DB;
  process.env.ANANSI_DB = '/home/sonophage/Documents/repositories/sonophage/anansi/anansi.db';
  const env = envFor('5301', 'http://127.0.0.1:9');
  process.env.ANANSI_DB = was;
  t(env.ANANSI_DB === join(tmpdir(), 'anansi-preview-5301', 'preview.db'), 'the database is the preview\'s own');
  t(env.ANANSI_LLAMA_UNIT === 'anansi-test-nonexistent.service', 'the real router unit is out of reach');
  t(env.ANANSI_FEATHERLESS_KEY_FILE === '/nonexistent/featherless.key', 'no Featherless key');
  t(env.ANANSI_PORT === '5301', 'the port is the one asked for');

  // Ownership, both directions: our own environ passes; the live server's, another port's, and one
  // without the mark do not.
  const env0 = (e: Record<string, string>) => Object.entries(e).map(([k, v]) => `${k}=${v}`).join('\0') + '\0';
  t(owns(env0(env), '5301'), 'a preview owns the server it started');
  t(!owns(env0(env), '5302'), 'and not one on another port');
  t(!owns(env0({ ...env, ANANSI_PREVIEW: '' }), '5301'), 'and not one without the mark');
  t(!owns('ANANSI_PORT=5174\0ANANSI_HOST=0.0.0.0\0', '5174'), 'and never the live server');
  console.log(`  ok  preview: ${n} cases, both directions`);
} else {
  await main(process.argv.slice(2));
}
