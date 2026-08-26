// HTTP shell. Static files, body parsing, and dispatch into the route table.
// Everything with an opinion lives in src/routes.ts and src/story.ts.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { routes, OPEN_ROUTES, storyIdOf } from './src/routes.ts';
import type { Ctx } from './src/routes.ts';
import { slotContext, model } from './src/llama.ts';
import * as db from './src/db.ts';

const PORT = Number(process.env.ANANSI_PORT ?? 5174);
// Loopback unless told otherwise. Set ANANSI_HOST to the tailnet address to let a second writer
// in: whois needs the peer's real IP, so a `tailscale serve` proxy in front of this would make
// every request arrive as 127.0.0.1, which is to say as you.
const HOST = process.env.ANANSI_HOST ?? '127.0.0.1';
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
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const run = promisify(execFile);
const whois = new Map<string, string | null>();   // peer ip -> tailnet login, null when it has none

// ponytail: cached for the life of the process and keyed on IP. A tailnet address is stable for the
// life of a node, so the ceiling is that reassigning one mid-run keeps the old identity; a restart
// clears it, and a TTL is the upgrade if that ever bites.
async function loginOf(ip: string): Promise<string | null> {
  if (whois.has(ip)) return whois.get(ip)!;
  let login: string | null = null;
  try {
    const { stdout } = await run('tailscale', ['whois', '--json', ip], { timeout: 3000 });
    login = JSON.parse(stdout)?.UserProfile?.LoginName ?? null;
  } catch { /* not a tailnet peer, or tailscaled is not answering. No identity, so no entry. */ }
  whois.set(ip, login);
  return login;
}

/** The owner behind a request, or null for anyone this server will not answer.
 *
 *  Loopback is the desk: anyone reaching it already has the database file, so there is nothing for
 *  an allowlist to defend. It is still checked against ANANSI_ALLOW, and that is deliberate — a
 *  gate that cannot refuse the machine it runs on cannot be tested from that machine, and an
 *  untestable gate is decorative. The desk passes by its ACCOUNT, which is the value side of the
 *  pair, because that is the name the database knows it by. */
async function ownerOf(ip: string): Promise<string | null> {
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

createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://x');
  const p = url.pathname;
  try {
    // Before the pages, not only before the API: a request this server will not answer should not
    // get the app shell either.
    const OWNER = await ownerOf(req.socket.remoteAddress ?? '');
    if (!OWNER) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not a writer here\n');
    }
    if (PAGES[p]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(HERE + PAGES[p], 'utf8'));
    }
    if (/^\/(web\/)?[\w.-]+\.(js|css|svg|webmanifest)$/.test(p)) {
      res.writeHead(200, { 'Content-Type': `${MIME[extname(p)]}; charset=utf-8` });
      return res.end(await readFile(HERE + p.slice(1), 'utf8'));
    }
    const key = `${req.method} ${p}`;
    const handler = routes[key];
    if (!handler) return send(res, 404, { error: 'not found' });
    const ctx: Ctx = {
      body: req.method === 'GET' ? {} : await readBody(req),
      query: url.searchParams, owner: OWNER, slot, gen: gens.get(OWNER) ?? GEN,
      setGen: (g) => { const next = { ...(gens.get(OWNER) ?? GEN), ...g }; gens.set(OWNER, next); ctx.gen = next; },
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
      const { type, filename, body } = out.__raw;
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"` });
      return res.end(body);
    }
    send(res, 200, out);
  } catch (e: any) {
    send(res, e?.code === 404 ? 404 : 500, { error: e?.message ?? String(e) });
  }
}).listen(PORT, HOST, () => {
  const n = db.listStories(db.owner(DESK)).length;
  console.log(`\n  Anansi        http://${HOST}:${PORT}`);
  console.log(`  writers       ${ALLOW.size ? [...ALLOW.keys()].join(', ') : `${DESK} (loopback only)`}`);
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
  console.log('');
});
