// HTTP shell. Static files, body parsing, and dispatch into the route table.
// Everything with an opinion lives in src/routes.ts and src/story.ts.
import { createServer as serveHTTP } from 'node:http';
import { createServer as serveHTTPS } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzip as gzipCB } from 'node:zlib';
import { extname, resolve } from 'node:path';
import { routes, OPEN_ROUTES, storyIdOf } from './src/routes.ts';
import { payFor } from './src/llama.ts';
import type { Ctx } from './src/routes.ts';
import { slotNow, slotFirstRead, slotIsKnown, model } from './src/llama.ts';
import { capFor } from './src/story.ts';
import * as db from './src/db.ts';
// `bus`, not `live`: this file already has a `live` Map of the generations in flight.
import * as bus from './src/live.ts';

const PORT = Number(process.env.ANANSI_PORT ?? 5174);
// A dev server serves the same app.html as the live one from the same source, and two identical
// windows on two ports is how a scratch edit lands in a real book. Set ANANSI_DEV to stamp the
// shell, which is the only thing that shows the banner in app.html.
const DEV = !!process.env.ANANSI_DEV;
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
/* THE LIVE GENERATION PER WRITER, so `POST /api/stop` has something to cancel.
 *
 * Needed because a closed connection no longer cancels anything (see the note by `gone` below):
 * Stop used to be `STOP?.abort()` on the fetch and nothing else, which made "the writer changed
 * their mind" and "the phone lost signal" the same event. Now only this cancels.
 *
 * KEYED BY OWNER, one deep. The composer disables itself while a call is in flight, so two at once
 * would be a re-roll racing a Continue — and if that ever happens, stopping the newer one is the
 * behaviour a writer expects from a button they just pressed. */
const live = new Map<string, AbortController>();
const whois = new Map<string, { login: string | null; at: number }>();
const MISS_TTL = 60_000;   // how long a "no identity" answer is trusted
// And how long a HIT is trusted. It used to be the life of the process, so a tailnet address that
// changed hands kept its old identity until a restart — and the failure that produces is one
// writer answering as another, silently, which is the one class this file exists to prevent. Ten
// minutes bounds it, and costs one `tailscale whois` per peer per ten minutes: a process spawn on
// a request that already waits on a model.
const HIT_TTL = 600_000;
//
// A MISS expires after a minute, and that is not symmetry for its own sake. Under systemd this can
// start before tailscaled answers, and a permanent negative cache would then hold the first peer to
// knock as "nobody" until the next restart — with nothing in the log saying why. The TTL also keeps
// a peer with no identity from spawning a process per request.
async function loginOf(ip: string): Promise<string | null> {
  const hit = whois.get(ip);
  if (hit && Date.now() - hit.at < (hit.login !== null ? HIT_TTL : MISS_TTL)) return hit.login;
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

// Read here so the banner below has a number, and asked again on every request until the router
// answers — see `slotNow` in src/llama.ts for what the single boot-time read cost on 2026-09-11.
// The await is only this one, before anything listens; the retry never blocks a request.
await slotFirstRead();

// The writer's sampler. No weaving key: whether a call weaves is the BOOK's switch and the call's
// role, decided in routes.ts. A per-writer `thinking: false` sat here until #55 and nothing in the
// app ever set it; at this sampler's ceiling it would have brought back F5, a whole budget spent
// planning and no prose.
const GEN: Record<string, any> = {
  temperature: 0.85, top_p: 0.95, min_p: 0.05,
  // THE CEILING IS NOT THE SETTING, and for five days it was. This said 450 on the argument that a
  // passage arrives in half the time and the budget engine reserves half as much — and the log
  // says what it actually bought: 41 of 181 prose runs at that cap ended exactly ON it, mid-word.
  // The model is never told the number, so it cannot land under it; lowering the ceiling never
  // shortened a passage (average 290 at 450 against 335 at 900), it only chopped a quarter of
  // them. See `capFor` in src/story.ts for the whole table.
  //
  // `target_words` is now what the writer sets and the only one of the two she ever sees. Zero is
  // "let her decide": no number reaches the model, which is the behaviour F29 measured and is
  // still the default. `max_tokens` is derived from it and exists only to stop a runaway.
  dry_multiplier: 0, xtc_probability: 0,
  target_words: 0, max_tokens: capFor(0),
};
// Per owner, not per process. Two writers sharing one sampler would share max_tokens with it, and
// the context budget reserves against that number — one of them raising it would quietly shrink the
// other's prompt. routes.ts already calls this account-wide; this is what makes that true.
const gens = new Map<string, Record<string, any>>();
// Which writers are currently looking at the demo library rather than their own. Real owner ids,
// and the only thing that can ever be looked at is the one account below.
const demoViewers = new Set<string>();
const demoOwner = () => db.owner(process.env.ANANSI_DEMO ?? 'demo');
// The writer's fallback model lived HERE, in a Map, until 2026-08-31 — which meant every restart
// of this process put both writers back on the process default, silently. It is a column on their
// row now (`users.default_model`), read and written through db, because it survives a reboot and
// because it decides which model is woken when they open the app.
//
// A story that names its own model still wins; this is only what a story with none falls back to,
// so switching model cannot land on the other writer's prose.

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

/* THE SHELL, COMPRESSED. Everything static here is read off disk per request — see the no-cache
 * notes at both call sites, which is the property the whole path exists for — and `web/app.js` is
 * 727 KB of it. A cold load was ~955 KB across app.html, app.js, model.js, api.js and help.js,
 * every time, and the second writer reaches this over a tailnet on a phone.
 *
 * Measured on the live tree: app.js 743,906 -> 238,245, app.html 138,592 -> 45,910. About a third.
 *
 * `no-cache` IS UNCHANGED AND THAT IS THE POINT. This decides what crosses the wire, not how fresh
 * it is, so an edit is still live without a restart and a phone still cannot serve a stale bundle.
 *
 * NO BROTLI. It compresses better and costs several times the CPU at these sizes, and nothing here
 * is cached, so every request would pay the difference to save a tenth of the bytes once.
 *
 * ponytail: gzipped per request rather than cached on mtime. It runs on libuv's threadpool so it
 * never blocks the loop, and at two writers that is free. Ceiling: the CPU of one compress per
 * static file per cold load. Upgrade path is a Map keyed on path + mtimeMs — about six lines —
 * and it is worth writing the day this serves more than a handful of people. */
const gzip = promisify(gzipCB);
const sendText = async (req: any, res: any, type: string, body: string) => {
  const head: Record<string, string> = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
  // A client that did not ask gets the bytes as they are. Vary rides on BOTH answers, because a
  // cache that saw the uncompressed one first must not hand it to a client that did ask.
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')))
    { res.writeHead(200, { ...head, Vary: 'Accept-Encoding' }); return res.end(body); }
  const buf = await gzip(body);
  res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
  res.end(buf);
};

const handler = async (req: any, res: any) => {
  // Declared out here because the `finally` at the bottom has to see it: the registration happens
  // deep inside the try, after the owner is resolved and the route is known.
  const generatingRef = { on: false, owner: '' };
  const url = new URL(req.url!, 'http://x');
  const p = url.pathname;
  try {
    // Before the pages, not only before the API: a request this server will not answer should not
    // get the app shell either.
    const REAL = await ownerOf(req.socket.remoteAddress ?? '', req.headers as any);
    // THE DEMO LIBRARY, AS A SWITCH. Seth, 2026-08-31: "can we do the demo account as a switch in
    // my menu both accounts should be able to reach it." A writer who has flipped it is served the
    // demo account's library instead of their own for as long as it is on.
    //
    // IT CAN RESOLVE TO EXACTLY ONE ACCOUNT AND THE CLIENT NEVER NAMES IT. The only thing the
    // toggle carries is on or off; `demoOwner()` is computed here. That is the whole of its
    // safety — an account name over the wire would be a request to be somebody, and every route in
    // this app is gated on who you are.
    //
    // In memory rather than on the row: it is a way of LOOKING at the app, not a fact about the
    // writer, and a restart putting everyone back in their own library is the right failure.
    const OWNER = REAL && demoViewers.has(REAL) ? demoOwner() : REAL;
    if (!OWNER || !REAL) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not a writer here\n');
    }
    /* THE LIVE CHANNEL. Seth, 2026-09-03: what the other writer does "needs to be instant."
     *
     * SSE AND NOT NDJSON, which is the opposite call from the generation stream forty lines below —
     * and for the reason that one gives. It refuses EventSource because it must POST a body. This
     * carries no body, so EventSource is exactly right, and what it brings is the half that matters
     * on a laptop that sleeps: the browser reconnects on its own, for ever, with no code here.
     *
     * IT SAYS "ASK AGAIN", NEVER WHAT CHANGED. The client refetches through the routes it already
     * has, so nothing on this path can hand a writer a row the gate would refuse — and there is one
     * ownership question in this app rather than two.
     *
     * BEFORE THE ROUTE TABLE, because it holds the response open for hours and the dispatcher below
     * ends every request it handles.
     */
    if (p === '/api/live') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(': open\n\n');
      const push = (o: unknown) => {
        if (res.writableEnded) return false;
        try { res.write(`data: ${JSON.stringify(o)}\n\n`); return true; } catch { return false; }
      };
      const off = bus.onChange((c) => {
        // The rule is in live.ts so it can be asked a question by a test — see shouldTell. The
        // ownership half is evaluated HERE because it is a database question, and lazily, so a
        // change in a book this reader cannot open costs one comparison rather than a query.
        if (c.by === OWNER) return;
        if (!bus.shouldTell(c, OWNER, db.ownsStory(c.storyId, OWNER))) return;
        push({ storyId: c.storyId, at: c.at });
      });
      // A COMMENT LINE, NOT AN EVENT. Something has to cross an idle connection or a proxy or a
      // sleeping phone drops it silently, and a `:` line is ignored by EventSource rather than
      // waking the client for nothing.
      const beat = setInterval(() => { if (!push || res.writableEnded) return; try { res.write(': beat\n\n'); } catch { /* gone */ } }, 25_000);
      const shut = () => { off(); clearInterval(beat); };
      req.on('close', shut); req.on('error', shut); res.on('close', shut);
      return;
    }

    if (PAGES[p]) {
      // no-cache, FOR THE SAME REASON THE JS BRANCH BELOW SAYS IT: these are read off disk on every
      // request so an edit is live without a restart, and with no freshness header at all a phone
      // caches heuristically. The JS branch has carried this header and that comment since it was
      // written; this one did not, so the page could be a day old while its script was current.
      //
      // It cost a real diagnosis on 2026-09-01. Seth reported "no target set" still on screen hours
      // after the line was deleted, and the string did not exist anywhere in the tree — the page in
      // front of him predated the commit. Half a stale surface is worse than a wholly stale one:
      // "it still says X" and "X is not in the code" are both true and point nowhere.
      const html = await readFile(HERE + PAGES[p], 'utf8');
      // Anchored to the whole line: a CSS comment up in app.html's head says ``zoom` on <body>`, and
      // a plain string replace stamps THAT and leaves the real tag alone. It did, on the first try.
      return sendText(req, res, 'text/html; charset=utf-8',
        DEV ? html.replace(/^<body>$/m, '<body data-dev>') : html);
    }
    // THE ICON WAS ALREADY THERE AND ALREADY SERVED — app.html has declared it since it was
    // written and `/web/icon.svg` answers 200 with image/svg+xml. What did NOT answer is the bare
    // path: a browser that ignores <link rel="icon">, a link preview, a feed reader and some PWA
    // install paths all ask for /favicon.ico and got a 404. Aliased rather than duplicated as a
    // real .ico, because two icon files are two things to keep in step with one design.
    if (p === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(await readFile(HERE + 'web/icon.svg', 'utf8'));
    }
    if (/^\/(web\/)?[\w.-]+\.(js|css|svg|webmanifest)$/.test(p)) {
      // no-cache, because these are read off disk on every request and the whole point of that is
      // that an edit is live without a restart. With no freshness header at all a phone caches
      // heuristically, so a fix that IS on disk keeps looking like a fix that does not work — and
      // "it still does not open" is indistinguishable from a stale bundle. There is no build step
      // and no content hash to put in the URL, so the header is the only place to say it.
      // READ FIRST, THEN THE HEADERS. This wrote the 200 and read the file afterwards, so a path
      // that matches the pattern and does not exist on disk — /app.js, say, when the file is at
      // /web/app.js — threw ENOENT with the headers already gone. The catch at the bottom then
      // tried to send a 500 over them, which throws INSIDE the catch, which nothing catches: the
      // process died. An unauthenticated GET for any missing .js took the app down for both
      // writers, and a link preview or a crawler asking once was enough. Found 2026-09-02 by a
      // curl for the wrong path immediately after a restart, in the journal as ERR_HTTP_HEADERS_SENT.
      let file: string;
      try { file = await readFile(HERE + p.slice(1), 'utf8'); }
      catch { return send(res, 404, { error: 'not found' }); }
      return sendText(req, res, `${MIME[extname(p)]}; charset=utf-8`, file);
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
    /* A CLOSED CONNECTION NO LONGER CANCELS THE GENERATION, and that is bugs.md #9.
     *
     * This used to read `res.on('close', () => { if (!res.writableEnded) gone.abort(); })`, so a
     * browser going away aborted the call to llama-server — the passage was not written and thrown
     * away, it was CUT OFF. Seth: "i should be able to send and go elsewhere since the command
     * already sent." It could not, because hanging up WAS the cancel.
     *
     * The deeper problem was that it could not be anything else: Stop was `STOP?.abort()` on the
     * fetch and nothing more, so "the writer changed their mind" and "the radio died in a lift"
     * arrived at this line as the same event. There is a `POST /api/stop` now and it is the only
     * thing that cancels; a dropped reader is just a reader who stopped reading, and `generate`
     * persists what it finishes writing.
     *
     * `res.on('close')` still matters for the WRITE side — see the stream branch, which stops
     * pushing into a socket nobody is holding. */
    const gone = new AbortController();
    let readerGone = false;
    res.on('close', () => { readerGone = true; });
    // Only the generation route registers: it is the only one long enough to want stopping, and a
    // registry that held every request would have `/api/stop` cancelling a story fetch.
    const generating = key === 'POST /api/generate';
    if (generating) { live.set(OWNER, gone); generatingRef.on = true; generatingRef.owner = OWNER; }
    const ctx: Ctx = {
      signal: gone.signal,
      // Abort THIS writer's generation. Theirs and no one else's — the map is keyed by owner, so a
      // second writer's call is unreachable from here by construction rather than by a check.
      stopLive: () => { const c = live.get(OWNER); if (!c) return false; c.abort(); return true; },
      body: req.method === 'GET' ? {} : await readBody(req),
      // NOT a value captured at boot. `slotNow` returns what is known and asks the router again in
      // the background while it is still the fallback, so a server that started with the model
      // asleep corrects itself on the next request instead of running the whole process on 8,192.
      query: url.searchParams, owner: OWNER, slot: slotNow(), gen: gens.get(OWNER) ?? GEN,
      setGen: (g) => { const next = { ...(gens.get(OWNER) ?? GEN), ...g }; gens.set(OWNER, next); ctx.gen = next; },
      defaultModel: db.defaultModelOf(OWNER),
      setDefaultModel: (id) => { db.setDefaultModel(OWNER, id); ctx.defaultModel = id; },
      // What the OTHER writers are currently set to. The map lives here, so the release policy in
      // routes.ts cannot answer this on its own — and getting it wrong means taking a model out
      // from under somebody mid-book.
      otherDefaults: () => db.otherDefaultModels(OWNER),
      /* WHO ELSE COULD BE CALLED INTO A BOOK. The allowlist lives out here, so routes.ts cannot
       * answer this on its own — the same reason `otherDefaults` is a function on the context.
       *
       * LOGINS AND THEIR ACCOUNTS, and the route only ever resolves a login THROUGH this list. The
       * client names a person, never an account: an account name over the wire is a request to be
       * somebody, which is the argument the demo switch above already makes. A login that is not
       * on this list resolves to nothing and the route refuses it.
       *
       * REAL, not OWNER: while the demo library is on, you are looking at somebody else's shelf and
       * the people you may write with are still yours. */
      /* THE NAME IS THE ACCOUNT, THE HANDLE IS THE LOGIN. ANANSI_ALLOW is `login=account` and the
       * login is a tailnet email — so a picker built from logins offers "hellrigelkc@gmail.com"
       * for the writer every other surface in this app calls `kia`. The client shows `name` and
       * sends `login`; the route still resolves the login through this list, so what crosses the
       * wire is unchanged and an account name is still never a request to be somebody. */
      mates: () => [...ALLOW.entries()]
        .map(([login, account]) => ({ login, name: account, id: db.owner(account) }))
        .filter((m) => m.id !== REAL),
      // THE REAL IDENTITY DECIDES THIS, never the demo one. Admin is who may stop the router;
      // borrowing the demo library must not borrow that, and the demo account must never grant it.
      admin: REAL === db.owner(ADMIN),
      demo: demoViewers.has(REAL),
      setDemo: (on: boolean) => { if (on) demoViewers.add(REAL); else demoViewers.delete(REAL); },
    };

    // One gate, fail closed. A route that names a story must be a story you own; a route
    // that names none must be on the open list. Adding a route without thinking about
    // scope therefore fails loudly rather than leaking quietly.
    if (!OPEN_ROUTES.has(key)) {
      const sid = storyIdOf(ctx.body, ctx.query);
      if (!sid) return send(res, 400, { error: 'this request must name a story' });
      if (!db.ownsStory(sid, OWNER)) return send(res, 404, { error: 'no such story' });
    }
    /* WHOSE PRESS THIS IS, for the live channel. Set here rather than threaded through every write:
     * `touch()` in db.ts is what announces a change and it has twenty-five callers, none of which
     * knows who is asking. Node runs one request at a time through this point, so a module-level
     * value is the whole of what is needed — and it is set on EVERY request rather than only the
     * writes, so a change can never be attributed to whoever pressed something last. */
    /* CLEARED WHEN THE REQUEST IS DONE, and NOT when the handler returns. A streaming route returns
     * `{__stream}` immediately and does its work below — so clearing it here attributed the
     * writer's own passage to NOBODY, pushed it back to them mid-generation, and repainted the
     * reading column while the veil was still holding the take. test/ui/veil.js caught it on the
     * one assertion that exists for exactly that: "the passage did NOT land on the page while the
     * veil was up". Nothing else in the tree could have.
     *
     * The clear still has to happen: `by` is module state, and a change with no request behind it —
     * the nightly export, a scheduled job — would otherwise inherit whoever pressed something last
     * and be suppressed for the one writer most likely to be watching. */
    bus.asWriter(OWNER);
    // WHOSE FEATHERLESS PLAN PAYS (#70, 2026-10-27): the book's owner when the request names one,
    // so a guest writing in a shared book is on the owner's plan, else the writer asking. Set after
    // the gate above, so a story id here is one this writer may use. See `payFor` in llama.ts.
    {
      const sid = storyIdOf(ctx.body, ctx.query);
      // ONLY A BOOK THIS WRITER MAY USE. Open routes skip the gate above, and a story id on one of
      // them must not put a stranger's plan behind this writer's calls.
      payFor(db.loginOf((sid && db.ownsStory(sid, OWNER) && db.storyOwner(sid)) || OWNER));
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
      // NO BACKPRESSURE, AND MEASURED 2026-08-29 RATHER THAN FEARED. `res.write` returning false
      // does not lose anything — node queues it — so the only cost of ignoring it is memory held
      // for a slow peer, and the whole stream is bounded: ~5KB of deltas for a 900-token
      // generation, plus a final line that is the non-streaming response, 91KB for the largest
      // book in this library. About 96KB held for a phone on a bad connection is not a hazard, and
      // honouring 'drain' would mean making `send` awaited through every producer that calls it.
      //
      // ponytail: bounded by what is streamed, not by a guard. Ceiling: a route that streams
      // something UNBOUNDED — an export, a whole-book download — at which point the memory is the
      // file. Upgrade path is to make `send` async and await it in the producers, and the trigger
      // is a new `__stream` route whose payload is not a story view.
      // A DROPPED READER IS NOT AN ERROR. Writing to a closed response throws
      // ERR_STREAM_DESTROYED, which would have taken the handler down mid-generation and lost the
      // passage the whole change exists to keep — so the producer goes on producing and this simply
      // stops pushing. The generation finishes and persists itself.
      const send = (o: unknown) => {
        if (readerGone || res.writableEnded) return;
        try { res.write(JSON.stringify(o) + '\n'); } catch { /* the reader went away mid-write */ }
      };
      try { send(await out.__stream(send)); }
      catch (e: any) { send({ error: e?.message ?? String(e) }); }
      if (!res.writableEnded) res.end();
      return;
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
    // AND NEVER SEND TWICE, whatever threw. The static path above was one way to get here after the
    // headers had gone; the streaming route is another, because it writes SSE for as long as the
    // model talks and can fail at any point in that. `send` would call writeHead on a response
    // that is already open, throw from inside this catch, and take the process with it — so a
    // per-request fault became an outage for everybody. There is nowhere left to put the error but
    // the log, so it goes there and the connection is closed.
    if (res.headersSent) {
      console.error(`${req.method} ${req.url} failed after responding:`, e?.message ?? e);
      return res.end();
    }
    send(res, code, { error: e?.message ?? String(e) });
  } finally {
    // ALWAYS, and in a `finally` rather than on each exit: there are four ways out of the block
    // above — stream, raw, json, throw — and a registry that leaked one entry would leave the next
    // Stop aborting a controller for a call that already finished. `delete` of an absent key is
    // free, so this needs no guard beyond the flag.
    if (generatingRef.on) live.delete(generatingRef.owner);
    // The live channel's attribution, cleared HERE for the same reason and by the same argument:
    // the streaming route is one of those four ways out, and it does its work long after the
    // handler returned. See the note where it is set.
    bus.asWriter(null);
  }
};

(TLS ? serveHTTPS(TLS, handler) : serveHTTP(handler)).listen(PORT, HOST, () => {
  const shelves = db.storiesPerOwner();
  const n = shelves.reduce((t, w) => t + w.n, 0);
  console.log(`\n  Anansi        http${TLS ? 's' : ''}://${HOST}:${PORT}`);
  console.log(`  writers       ${ALLOW.size ? [...ALLOW.keys()].join(', ') : `${DESK} (loopback only)`}`);
  console.log(`  admin         ${ADMIN}`);
  console.log(`  model         ${model()}`);
  // SAYS WHICH NUMBER THIS IS. The banner printed `0 / 1 slots = 8192 per slot` as though it were
  // the router's answer, and that line was on screen for the 33 hours the bug lasted. A floor we
  // assumed and a number we read are different claims and now read differently.
  const s = slotNow();
  console.log(slotIsKnown()
    ? `  context       ${s.global} / ${s.slots} slots = ${s.perSlot} per slot`
    : `  context       ${s.perSlot} per slot — ASSUMED, the router did not answer. Asking again `
      + 'on the next request.');
  // WHOSE, when there is more than one writer. This counted only the DESK writer's shelf and
  // called it the library, so a two-writer box under-reported by however many books the other
  // writer had, and looked exactly like rows going missing.
  console.log(`  library       ${n} ${n === 1 ? 'story' : 'stories'}`
    + (shelves.length > 1 ? ` · ${shelves.map((w) => `${w.login} ${w.n}`).join(', ')}` : ''));
  // A snapshot on boot and every 30 minutes. The database is the only copy of the book,
  // and PLAN-02 deleted Neon without booking anything to replace its durability.
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
  // `/data` is a different device — nvme1n1p2, xfs — where the repository is on the root
  // filesystem. Say what that buys precisely: it survives losing this filesystem and does NOT
  // survive losing the machine. Off-site is a further step and is not this one.
  //
  // Six-hourly rather than half-hourly, keeping fourteen: the near copy is the one you reach for
  // after a bad edit, and this is the one you reach for after a disk. Different jobs, different
  // rhythms.
  //
  // Silent when the directory cannot be written, because a box without /data must still boot —
  // but LOUD once, on the first attempt, so a backup that is not happening is never quiet.
  const FAR = process.env.ANANSI_BACKUP_DIR ?? '/data/anansi/backups';
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
  // /data — a different device, nvme1n1p2 — and buys exactly what the copy above buys: it survives
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
  const BOOKS = process.env.ANANSI_EXPORT_DIR ?? '/data/anansi/books';
  if (PRIMARY && BOOKS && BOOKS !== 'off') {
    let booksSaid = false;
    const books = () => {
      let done = 0; const failed: string[] = [];
      for (const st of db.allStoriesForExport()) {
        // KEEP FOURTEEN PER BOOK. This kept everything until 2026-09-06 and ran on every BOOT as
        // well as daily, so /data/anansi-books had reached 823 files and 3.6 GB, 109 of them copies
        // of one book. `backup()` beside it has pruned since it was written; this never did.
        //
        // Fourteen matches the off-disk whole-database copy above, and for the same argument: this
        // is the one you reach for after losing a filesystem, and fourteen of them is a fortnight.
        // Per book, not per directory — see the nesting trap named at the prune itself.
        try { db.exportStory(st.id, st.ownerId, BOOKS, 14); done++; }
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
