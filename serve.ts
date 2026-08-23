// HTTP shell. Static files, body parsing, and dispatch into the route table.
// Everything with an opinion lives in src/routes.ts and src/story.ts.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { routes, OPEN_ROUTES, storyIdOf } from './src/routes.ts';
import type { Ctx } from './src/routes.ts';
import { slotContext, model } from './src/llama.ts';
import * as db from './src/db.ts';

const PORT = Number(process.env.ANANSI_PORT ?? 5174);
const HERE = new URL('.', import.meta.url).pathname;
// ponytail: one hardcoded owner. There is no Tailscale identity, no allowlist, and no second
// tenant — PLAN-02 §4 specifies `tailscale whois` on the peer IP, an env-var allowlist and a
// loopback bind. The isolation is already built and tested (test-scope.ts), so what remains is
// deciding WHO the request is, not what they may touch.
const OWNER = db.owner(process.env.ANANSI_USER ?? 'sonophage');

let slot = { global: 0, slots: 1, perSlot: 8192 };
try { slot = await slotContext(); } catch { /* model asleep; pages still load */ }

// Measured: with thinking on, this model spends its whole budget reasoning and returns
// no prose on most runs. See P0-FINDINGS F5.
let gen: Record<string, any> = {
  temperature: 0.85, top_p: 0.95, min_p: 0.05,
  dry_multiplier: 0, xtc_probability: 0, thinking: false, max_tokens: 900,
};

const PAGES: Record<string, string> = { '/': 'desk.html', '/phone': 'phone.html' };
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
      query: url.searchParams, owner: OWNER, slot, gen,
      setGen: (g) => { gen = { ...gen, ...g }; ctx.gen = gen; },
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
}).listen(PORT, '127.0.0.1', () => {
  const n = db.listStories(OWNER).length;
  console.log(`\n  Anansi        http://127.0.0.1:${PORT}         desk`);
  console.log(`                http://127.0.0.1:${PORT}/phone   phone`);
  console.log(`  model         ${model}`);
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
