// HTTP shell. Static files, body parsing, and dispatch into the route table.
// Everything with an opinion lives in src/routes.ts and src/story.ts.
import { createServer as serveHTTP } from 'node:http';
import { createServer as serveHTTPS } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { routes, OPEN_ROUTES, storyIdOf } from './src/routes.ts';
import type { Ctx } from './src/routes.ts';
import { slotContext, model } from './src/llama.ts';
import * as db from './src/db.ts';

const PORT = Number(process.env.ANANSI_PORT ?? 5174);
// Loopback unless told otherwise. Set ANANSI_HOST to the tailnet address to let a second writer
// in: whois needs the peer's real IP, so a `tailscale serve` proxy in front of this would make
// every request arrive as 127.0.0.1, which is to say as you.
const HOST = process.env.ANANSI_HOST ?? '127.0.0.1';

// TLS, from a `tailscale cert` pair. Native rather than a `tailscale serve` proxy in front, and
// that is the whole reason this exists: the proxy dials from loopback, so every peer would arrive
// as 127.0.0.1 and whois would answer with the desk's identity for all of them.
//
// Both or neither, and a configured-but-unreadable cert is a hard stop. Falling back to plain HTTP
// because a file moved is a downgrade nobody would notice until it mattered.
const CERT = process.env.ANANSI_CERT, KEY = process.env.ANANSI_KEY;
if (!!CERT !== !!KEY) {
  console.error('  ANANSI_CERT and ANANSI_KEY must be set together, or neither.');
  process.exit(2);
}
const TLS = CERT ? { cert: readFileSync(CERT), key: readFileSync(KEY!) } : null;
const HERE = new URL('.', import.meta.url).pathname;

// Who the request is. PLAN-02 §4 asked for `tailscale whois` on the peer IP, an env-var allowlist
// and a loopback bind, and that is what this is. The isolation was already built and proven with
// two owners (test/scope.ts); this is the other half — deciding WHO is asking.
//
// ANANSI_ALLOW is `login` or `login=account`, comma separated. The pair form is here because a
// tailnet login is an email while this database's first owner is `sonophage`: mapping one onto the
// other beats renaming the row that owns every book. Unset means no whois and one owner, exactly
// as before, and a tailnet peer is refused even when the port is open to them.
const ALLOW = new Map((process.env.ANANSI_ALLOW ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  .map((e) => { const i = e.indexOf('='); return (i < 0 ? [e, e] : [e.slice(0, i), e.slice(i + 1)]) as [string, string]; }));
const DESK = process.env.ANANSI_USER ?? 'sonophage';
// Who may stop the router. The desk unless told otherwise — one account, because "may I stop a
// service the other writer is mid-generation on" is not a question ownership can answer.
const ADMIN = process.env.ANANSI_ADMIN ?? DESK;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const run = promisify(execFile);
const whois = new Map<string, { login: string | null; at: number }>();
const MISS_TTL = 60_000;   // how long a "no identity" answer is trusted

// ponytail: a hit is cached for the life of the process and keyed on IP, so the ceiling is that
// reassigning a tailnet address mid-run keeps the old identity; a restart clears it.
//
// A MISS expires after a minute, and that is not symmetry for its own sake. Under systemd this can
// start before tailscaled answers, and a permanent negative cache would then hold the first peer to
// knock as "nobody" until the next restart — with nothing in the log saying why. The TTL also keeps
// a peer with no identity from spawning a process per request.
async function loginOf(ip: string): Promise<string | null> {
  const hit = whois.get(ip);
  if (hit && (hit.login !== null || Date.now() - hit.at < MISS_TTL)) return hit.login;
  let login: string | null = null;
  try {
    const { stdout } = await run('tailscale', ['whois', '--json', ip], { timeout: 3000 });
    login = JSON.parse(stdout)?.UserProfile?.LoginName ?? null;
  } catch { /* not a tailnet peer, or tailscaled is not answering. No identity, so no entry. */ }
  whois.set(ip, { login, at: Date.now() });
  return login;
}

/** The owner behind a request, or null for anyone this server will not answer.
 *
 *  Loopback is the desk: anyone reaching it already has the database file, so there is nothing for
 *  an allowlist to defend. It is still checked against ANANSI_ALLOW, and that is deliberate — a
 *  gate that cannot refuse the machine it runs on cannot be tested from that machine, and an
 *  untestable gate is decorative. The desk passes by its ACCOUNT, which is the value side of the
 *  pair, because that is the name the database knows it by. */
//
//  ponytail: this rule is what a reverse proxy would break, and it would break it OPEN. Put Caddy
//  on 443 for port-free names (anansi.example.dev) and every request arrives from 127.0.0.1, so the
//  second writer resolves to the desk — her own library replaced by yours, admin true, ANANSI_ALLOW
//  never consulted, and nothing logged. The Tailscale grant still passes; it is the identity layer
//  that goes blind.
//
//  SETH, 2026-08-29, asked directly: *"i basically did identity through tailscale. so identity is
//  email. and device locked. we dont share devices so this should be fine. later ill do a domain
//  with a port only she can access and lock everything else down."* So the identity that matters is
//  the tailnet login resolved below, and the loopback branch is only ever meant to be HIM at this
//  keyboard. The plan is a locked port, not a shared front door.
//
//  Which is why the guard below is a refusal and not a header parse: the day something does front
//  this, the failure is silent and everyone becomes the desk. A refusal is loud, names this line,
//  and costs nothing while nothing proxies.
//
//  Three upgrades, in order of laziness: (1) leave Anansi off the proxy and let it keep its own port
//  and cert; (2) TCP passthrough with PROXY protocol, so TLS still terminates here and the real peer
//  IP rides in a header node has to parse; (3) trust X-Forwarded-For from loopback only — about five
//  lines, and the loopback branch below MUST be deleted in the same change or a missing header still
//  resolves to the desk. Do not land (3) by halves; nothing looks broken and everyone is you.
async function ownerOf(ip: string, headers?: Record<string, unknown>): Promise<string | null> {
  // FAIL CLOSED IF SOMETHING IS IN FRONT. A forwarded header on a request that reached loopback
  // means the peer address is a proxy's, not the writer's, and the branch below would hand that
  // request the desk's whole library. Nothing on a tailnet sends these, so this is inert today and
  // becomes the difference between a locked door and an open one on the day it is not.
  if (headers && LOOPBACK.has(ip)
    && ['x-forwarded-for', 'x-real-ip', 'forwarded'].some((h) => headers[h] != null)) return null;
  if (LOOPBACK.has(ip)) {
    if (ALLOW.size && ![...ALLOW.values()].includes(DESK)) return null;
    return db.owner(DESK);
  }
  if (!ALLOW.size) return null;
  const login = await loginOf(ip);
  const account = login && ALLOW.get(login);
  return account ? db.owner(account) : null;
}

let slot = { global: 0, slots: 1, perSlot: 8192 };
try { slot = await slotContext(); } catch { /* model asleep; pages still load */ }

// Measured: with thinking on, this model spends its whole budget reasoning and returns
// no prose on most runs. See P0-FINDINGS F5.
const GEN: Record<string, any> = {
  temperature: 0.85, top_p: 0.95, min_p: 0.05,
  // 450, not 900. Two effects, and the second is the one that matters: a passage arrives in half
  // the time, and the budget engine reserves half as much, so the prompt gets those tokens back.
  // Raise it per session under Storyteller when a scene actually needs the room.
  dry_multiplier: 0, xtc_probability: 0, thinking: false, max_tokens: 450,
};
// Per owner, not per process. Two writers sharing one sampler would share max_tokens with it, and
// the context budget reserves against that number — one of them raising it would quietly shrink the
// other's prompt. routes.ts already calls this account-wide; this is what makes that true.
const gens = new Map<string, Record<string, any>>();
// The writer's fallback model, same reasoning. A story that names its own still wins; this is only
// what a story with none falls back to, so switching model cannot land on the other's prose.
const models = new Map<string, string>();

// One responsive surface. desk.html and phone.html were deleted on 2026-08-23 once app.html
// reached parity; /phone stays mapped so an installed phone home-screen icon keeps working.
const PAGES: Record<string, string> = { '/': 'app.html', '/phone': 'app.html' };
const MIME: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const readBody = (req: any) => new Promise<any>((ok, no) => {
  let b = ''; req.on('data', (c: any) => (b += c));
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } });
});
const send = (res: any, code: number, body: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
};

const handler = async (req: any, res: any) => {
  const url = new URL(req.url!, 'http://x');
  const p = url.pathname;
  try {
    // Before the pages, not only before the API: a request this server will not answer should not
    // get the app shell either.
    const OWNER = await ownerOf(req.socket.remoteAddress ?? '', req.headers as any);
    if (!OWNER) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not a writer here\n');
    }
    if (PAGES[p]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(HERE + PAGES[p], 'utf8'));
    }
    if (/^\/(web\/)?[\w.-]+\.(js|css|svg|webmanifest)$/.test(p)) {
      // no-cache, because these are read off disk on every request and the whole point of that is
      // that an edit is live without a restart. With no freshness header at all a phone caches
      // heuristically, so a fix that IS on disk keeps looking like a fix that does not work — and
      // "it still does not open" is indistinguishable from a stale bundle. There is no build step
      // and no content hash to put in the URL, so the header is the only place to say it.
      res.writeHead(200, { 'Content-Type': `${MIME[extname(p)]}; charset=utf-8`,
        'Cache-Control': 'no-cache' });
      return res.end(await readFile(HERE + p.slice(1), 'utf8'));
    }
    const key = `${req.method} ${p}`;
    const handler = routes[key];
    if (!handler) return send(res, 404, { error: 'not found' });
    // Stop. The writer's Stop button aborts their fetch; that closes this connection; this
    // aborts the call to llama-server. Without the last hop the model keeps generating into a
    // slot nobody is reading from — there are two slots, so a writer who stops and immediately
    // starts again is racing their own abandoned generation for the cache.
    //
    // `writableEnded` is what separates the two ways a response closes: a normal finish, and a
    // client that went away. Aborting on both would abort every request as it succeeded.
    const gone = new AbortController();
    res.on('close', () => { if (!res.writableEnded) gone.abort(); });
    const ctx: Ctx = {
      signal: gone.signal,
      body: req.method === 'GET' ? {} : await readBody(req),
      query: url.searchParams, owner: OWNER, slot, gen: gens.get(OWNER) ?? GEN,
      setGen: (g) => { const next = { ...(gens.get(OWNER) ?? GEN), ...g }; gens.set(OWNER, next); ctx.gen = next; },
      defaultModel: models.get(OWNER) ?? null,
      setDefaultModel: (id) => { models.set(OWNER, id); ctx.defaultModel = id; },
      // What the OTHER writers are currently set to. The map lives here, so the release policy in
      // routes.ts cannot answer this on its own — and getting it wrong means taking a model out
      // from under somebody mid-book.
      otherDefaults: () => [...models.entries()]
        .filter(([who]) => who !== OWNER).map(([, id]) => id).filter(Boolean),
      admin: OWNER === db.owner(ADMIN),
    };

    // One gate, fail closed. A route that names a story must be a story you own; a route
    // that names none must be on the open list. Adding a route without thinking about
    // scope therefore fails loudly rather than leaking quietly.
    if (!OPEN_ROUTES.has(key)) {
      const sid = storyIdOf(ctx.body, ctx.query);
      if (!sid) return send(res, 400, { error: 'this request must name a story' });
      if (!db.ownsStory(sid, OWNER)) return send(res, 404, { error: 'no such story' });
    }
    const out = await handler(ctx);
    // NDJSON, not SSE: EventSource cannot POST, and every generation carries a body. One JSON
    // object per line — `{d}` for a delta, and the last line is exactly what the non-streaming
    // route would have returned, so the client's success path is unchanged.
    //
    // The 200 goes out before any work, so an error after that point cannot be a status code;
    // it arrives as the final line and the client checks `.error` as it always has.
    if (out && out.__stream) {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      // ponytail: no backpressure, and this now fronts a real network — a phone on the tailnet
      // rather than only loopback. Deltas are a few bytes each, so the ceiling is a slow peer on
      // a long generation; honour res.write's false and wait for 'drain' when that shows up.
      const send = (o: unknown) => res.write(JSON.stringify(o) + '\n');
      try { send(await out.__stream(send)); }
      catch (e: any) { send({ error: e?.message ?? String(e) }); }
      return res.end();
    }
    if (out && out.__raw) {
      // A download when it names a filename, and inline otherwise — a cover is fetched by an <img>,
      // which an attachment disposition turns into a save dialog. Every export keeps the charset it
      // has always had; an image is the only thing that must not carry one.
      const { type, filename, body, headers } = out.__raw;
      res.writeHead(200, {
        'Content-Type': type.startsWith('image/') ? type : `${type}; charset=utf-8`,
        ...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
        ...headers });
      return res.end(body);
    }
    send(res, 200, out);
  } catch (e: any) {
    // Any HTTP-shaped code a route names, not only 404. It was `code === 404 ? 404 : 500`, which
    // silently turned routes.ts's deliberate 400s into 500s — a client cannot tell "you asked for
    // something impossible" from "the server broke" when both arrive as the same number.
    const code = typeof e?.code === 'number' && e.code >= 400 && e.code < 600 ? e.code : 500;
    send(res, code, { error: e?.message ?? String(e) });
  }
};

(TLS ? serveHTTPS(TLS, handler) : serveHTTP(handler)).listen(PORT, HOST, () => {
  const n = db.listStories(db.owner(DESK)).length;
  console.log(`\n  Anansi        http${TLS ? 's' : ''}://${HOST}:${PORT}`);
  console.log(`  writers       ${ALLOW.size ? [...ALLOW.keys()].join(', ') : `${DESK} (loopback only)`}`);
  console.log(`  admin         ${ADMIN}`);
  console.log(`  model         ${model()}`);
  console.log(`  context       ${slot.global} / ${slot.slots} slots = ${slot.perSlot} per slot`);
  console.log(`  library       ${n} ${n === 1 ? 'story' : 'stories'}`);
  // A snapshot on boot and every 30 minutes. The database is the only copy of the book,
  // and PLAN-02 deleted Neon without booking anything to replace its durability.
  const swept = db.pruneViolations();
  if (swept) console.log(`  swept         ${swept} orphaned or low-confidence flags`);
  const snapshot = () => { try { const b = db.backup();
    console.log(`  backup        ${(b.bytes / 1024).toFixed(0)} KB, keeping 12`);
  } catch (e: any) { console.error('  backup failed:', e?.message); } };
  snapshot(); setInterval(snapshot, 30 * 60_000).unref();

  // ONLY THE REAL LIBRARY MANAGES THE SHARED DIRECTORIES.
  //
  // Both copies below write to fixed absolute paths under /data, and every server that boots writes
  // to them — including the twelve throwaway servers `test/ui/run.sh` starts per run, and every
  // scratch server a probe spins up. On 2026-08-28 that filled /data/anansi-books with 167 exports
  // of `Alice's Book` and rotated thirteen of the fourteen off-disk backup slots to 274 KB test
  // fixtures, evicting the real 4 MB copies. The near backups were never hit, because those live
  // beside whichever database is open; only the absolute paths were.
  //
  // So: a server pointed at a database that is not the primary library does not touch them. It is
  // not the library's custodian and its backups are noise. Loud once, because a real server that
  // has somehow stopped backing up must not be quiet about it.
  // resolve() on both sides: ANANSI_DB may be set to the primary library by a relative path, and a
  // string compare would call that server a stranger and silently stop backing the real book up.
  const PRIMARY = resolve(db.FILE) === resolve(new URL('./anansi.db', import.meta.url).pathname);
  if (!PRIMARY) console.log(`  shared copies skipped — ${db.FILE} is not the primary library`);

  // AND A COPY ON ANOTHER DISK. Every snapshot above lands beside `anansi.db`: that protects
  // against corruption and against a bad edit, and against nothing that takes the filesystem. The
  // open item since PLAN-02 deleted Neon was not backup, it was backup somewhere else.
  //
  // `/data` is a different device — nvme0n1p2, xfs — where the repository is on the root
  // filesystem. Say what that buys precisely: it survives losing this filesystem and does NOT
  // survive losing the machine. Off-site is a further step and is not this one.
  //
  // Six-hourly rather than half-hourly, keeping fourteen: the near copy is the one you reach for
  // after a bad edit, and this is the one you reach for after a disk. Different jobs, different
  // rhythms.
  //
  // Silent when the directory cannot be written, because a box without /data must still boot —
  // but LOUD once, on the first attempt, so a backup that is not happening is never quiet.
  const FAR = process.env.ANANSI_BACKUP_DIR ?? '/data/anansi-backups';
  if (PRIMARY && FAR && FAR !== 'off') {
    let farSaid = false;
    const far = () => { try {
      const b = db.backup(FAR, 14);
      if (!farSaid) { console.log(`  off-disk      ${FAR}, ${(b.bytes / 1024 / 1024).toFixed(1)} MB, keeping 14`); farSaid = true; }
    } catch (e: any) {
      if (!farSaid) { console.error(`  off-disk backup FAILED at ${FAR}: ${e?.message} — set ANANSI_BACKUP_DIR, or 'off' to stop asking`); farSaid = true; }
    } };
    far(); setInterval(far, 6 * 60 * 60_000).unref();
  }

  // AND EACH BOOK ON ITS OWN, once a day. The two above copy the whole database, which is what you
  // restore when a disk goes. A per-story export is a different artefact: it opens on its own,
  // imports into another Anansi through src/import.ts, and is the one you would hand to someone.
  // Daily rather than six-hourly because it is not a fresher copy of the same thing.
  //
  // Seth, 2026-08-27: "export story to data once a day. no off machine backup." So this stops at
  // /data — a different device, nvme0n1p2 — and buys exactly what the copy above buys: it survives
  // losing this filesystem and does NOT survive losing the machine. Nothing here is off-site.
  //
  // Same failure manners as the copy above: loud once, so an export that is not happening is never
  // quiet. Verified: an unwritable directory prints "0 written, 1 FAILED ... EACCES" and the server
  // carries on. Per story, because one unwritable book must not stop the rest.
  //
  // One trap, found by testing the failure path: mkdirSync(..., {recursive:true}) HANGS rather than
  // throwing under /proc on this kernel, and a sync hang here blocks the event loop, so the server
  // boots to silence and never answers. Real paths (/root, a missing root dir) throw EACCES at once.
  // If this ever appears to hang at boot, look at ANANSI_EXPORT_DIR before looking at the router.
  const BOOKS = process.env.ANANSI_EXPORT_DIR ?? '/data/anansi-books';
  if (PRIMARY && BOOKS && BOOKS !== 'off') {
    let booksSaid = false;
    const books = () => {
      let done = 0; const failed: string[] = [];
      for (const st of db.allStoriesForExport()) {
        try { db.exportStory(st.id, st.ownerId, BOOKS); done++; }
        catch (e: any) { failed.push(`${st.title}: ${e?.message}`); }
      }
      if (!booksSaid) {
        if (failed.length) console.error(`  book export  ${done} written, ${failed.length} FAILED at ${BOOKS} — ${failed[0]}`);
        else console.log(`  book export   ${BOOKS}, ${done} ${done === 1 ? 'book' : 'books'}, daily`);
        booksSaid = true;
      }
    };
    books(); setInterval(books, 24 * 60 * 60_000).unref();
  }
  console.log('');
});
