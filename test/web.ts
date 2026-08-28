// Client modules ship straight to the browser, so a syntax error is a blank page with no
// server-side signal. Check them here rather than by opening a tab.
//
// `node --check` with module input parses without executing — no regex stripping, which is
// how the first version of this test managed to report failures that were its own fault.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert';

// Resolved from this file, not from the working directory. These paths used to be bare and
// the suite passed only when run from the project root — which stopped being true the moment
// the tests moved into their own folder.
const R = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(R + p, 'utf8');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };

for (const f of readdirSync(R + 'web').filter((x) => x.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'],
      { input: read(`web/${f}`), stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    const detail = [e.stderr, e.stdout].filter(Boolean).map(String).join('\n')
      .split('\n').filter((l: string) => l.trim()).slice(0, 5).join('\n      ');
    assert.fail(`web/${f} does not parse:\n      ${detail}`);
  }
  ok(`web/${f} parses`);
}

// Pages must reference modules that exist, and every api.* a surface calls must be defined.
const apiSrc = read('web/api.js');
const defined = new Set([...apiSrc.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
for (const page of ['app.html']) {
  const html = read(page);
  for (const m of html.matchAll(/src="\.\/([\w/.-]+)"/g)) { read(m[1]); ok(`${page} → ${m[1]}`); }
}
for (const f of ['web/app.js']) {
  const used = new Set([...read(f).matchAll(/\bapi\.(\w+)\(/g)].map((m) => m[1]));
  const missing = [...used].filter((u) => !defined.has(u));
  assert.deepStrictEqual(missing, [], `${f} calls api.${missing.join(', api.')} which api.js does not define`);
  ok(`${f} uses only defined api methods (${used.size})`);
}
// Every $('id') a surface READS must be rendered somewhere in that same surface or its page.
// This is the check that would have caught `f-pin`: Save read an element the desktop never
// drew, so every entry save threw after the write landed — silently, in an async handler.
// Council #3 called it "a field with no screen"; Council #4 called it "a screen with no wire".
for (const [js, html] of [['web/app.js', 'app.html']]) {
  const src = read(js) + read(html);
  const ids = new Set([...read(js).matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  const drawn = new Set([...src.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const orphans = [...ids].filter((id) => !drawn.has(id));
  assert.deepStrictEqual(orphans, [], `${js} reads ids nothing renders: ${orphans.join(', ')}`);
  ok(`${js} renders every id it reads (${ids.size})`);
}


// The click delegation walks up with closest(), so any data-* name it treats as an ACTION must
// never also be a state attribute on <html>. It was: data-theme and data-rail were both, so
// every click in the app matched <html>, toggled the rail, and repainted — which destroyed
// whatever field was being typed into. Nothing editable, and no test could see it.
{
  const js = read('web/app.js');
  const actions = new Set([...(js.match(/const ACTIONS = \[([\s\S]*?)\]/)?.[1] ?? '')
    .matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
  assert.ok(actions.size > 20, `could not read the ACTIONS list (${actions.size} found)`);

  // State attributes: what the page ships on <html>, plus what the code writes to root.dataset.
  const htmlTag = read('app.html').match(/<html\b[^>]*>/)![0];
  const onTag = [...htmlTag.matchAll(/\bdata-([a-z-]+)=/g)].map((m) => m[1]);
  const written = [...js.matchAll(/root\.dataset\.(\w+)/g)].map((m) =>
    m[1].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));
  const state = new Set([...onTag, ...written]);
  assert.ok(state.size >= 4, `expected the look attributes on <html> (${[...state]})`);

  const clash = [...state].filter((a) => actions.has(a));
  assert.deepStrictEqual(clash, [], `data-${clash.join(', data-')} is both a click action and a `
    + `state attribute on <html>; closest() will match <html> on every click in the app`);
  ok(`${actions.size} click actions, ${state.size} look attributes, no name used as both`);
}

// Every button must be clickable. The send button — the app's primary action — carried no action
// attribute and no listener, so the delegated handler matched nothing: mouse-unreachable, and on
// a phone unreachable at all because there is no ⌘↵. Third bug in that family, hence a lint.
// Verified red-capable by removing data-send: it names that button and nothing else.
{
  const js = read('web/app.js');
  const html = read('app.html');
  const acts = new Set([...(js.match(/const ACTIONS = \[([\s\S]*?)\]\.map/)?.[1] ?? '')
    .matchAll(/'([a-z-]+)'/g)].map((m) => m[1].replace(/-/g, '')));
  assert.ok(acts.size > 30, `only ${acts.size} actions parsed`);

  const tags = [...js.matchAll(/<button\b[^>]*>/g), ...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(tags.length > 30, `only ${tags.length} buttons found`);

  const dead = tags.filter((b) => {
    const data = [...b.matchAll(/data-([a-zA-Z-]+)=/g)].map((m) => m[1].toLowerCase().replace(/-/g, ''));
    if (data.some((d) => acts.has(d))) return false;
    const ids = [...b.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]);
    return !ids.some((i) => new RegExp(`\\$\\('${i}'\\)|getElementById\\('${i}'\\)`).test(js));
  });
  assert.deepStrictEqual(dead.map((d) => d.slice(0, 70)), [],
    'these buttons carry no action attribute and no listener, so clicking them does nothing');
  ok(`${tags.length} buttons, every one reachable by click`);

  // Every panel must be reachable. This repo's recurring failure is the half-built one: a feature
  // that exists, is tested, and has nothing that opens it — deleting desk.js once orphaned nine
  // api methods, five of which BUILD-STATE called "Done". Rearranging eight panels into six is the
  // same hazard: rename a panel and the nav row points at nothing, or retire a nav row and the
  // panel it opened becomes unreachable code that still passes its own tests.
  const panelNames = [...js.matchAll(/^  ([a-z]+)\(\) \{$/gm)].map((m) => m[1]);
  const navRows = (name: string) => {
    const at = js.indexOf(`const ${name} = [`);
    assert.ok(at > 0, `${name} must exist`);
    // Slice to the closing `];` at column 0 — SNAV carries comments and nested brackets, so
    // stopping at the first ] finds one row and calls the rest orphans.
    const body = js.slice(at, js.indexOf('\n];', at));
    return [...body.matchAll(/\['([a-z]+)',/g)].map((m) => m[1]);
  };
  const snav = navRows('SNAV'), wnav = navRows('WNAV');
  assert.deepStrictEqual(snav,
    ['search', 'waiting', 'story', 'chapter', 'threads', 'strings', 'context', 'teller'],
    'the panels in the order Seth asked for. Search went to the top on 2026-08-27 and Anansi came '
    + 'off the list the same day — it is a button on the composer row, because asking her something '
    + 'is a thing you do while writing rather than a place you navigate to. The PANEL is still '
    + 'there and data-panel="anansi" still opens it; only the nav row went.');

  // Opened by clicking a thing rather than by a nav row. Each is asserted to have a real opener,
  // so this list cannot become a dumping ground for panels nothing reaches.
  //
  // `anansi` joined them on 2026-08-27: it came off the rail and onto the composer row, so its
  // door is a `data-panel` button rather than a nav row. The opener asserted here is that button —
  // a panel in this list without one is exactly the unreachable-feature failure the list exists
  // to prevent, and "it used to be in the rail" is not an opener.
  const byClick = { entry: /S\.panel = 'entry'/, history: /S\.panel = 'history'/, setup: /S\.panel = 'setup'/,
                    // A BUTTON, not any occurrence. The first version of this was
                    // /data-panel="anansi"/, which matched the COMMENT in app.js explaining that
                    // the panel keeps its door — so the check passed while pointing that door
                    // somewhere else. A check that matches its own documentation is decorative.
                    anansi: /<button data-panel="anansi"/ };
  for (const [name, opens] of Object.entries(byClick)) {
    assert.ok(opens.test(js), `the ${name} panel is not in the rail, so something must set S.panel to it`);
  }
  const reachable = new Set([...snav, ...wnav, ...Object.keys(byClick)]);
  assert.deepStrictEqual(panelNames.filter((n) => !reachable.has(n)), [],
    'these panels exist but nothing opens them');
  // And the other way round: a nav row pointing at a panel that is not there renders an empty tray.
  assert.deepStrictEqual([...snav, ...wnav].filter((n) => !panelNames.includes(n)), [],
    'these nav rows point at a panel that does not exist');
  ok(`${panelNames.length} panels, ${snav.length} in the story rail and ${wnav.length} outside, none orphaned`);

  // Retired panel names still have to resolve, or every bookmark and open tab breaks.
  const was = js.slice(js.indexOf('const PANEL_WAS ='), js.indexOf('};', js.indexOf('const PANEL_WAS =')));
  for (const old of ['inspector', 'cast', 'traj', 'queue', 'branches']) {
    const m = new RegExp(`${old}: '([a-z]+)'`).exec(was);
    assert.ok(m, `the retired name ${old} must map somewhere`);
    assert.ok(reachable.has(m[1]), `${old} maps to ${m[1]}, which nothing opens`);
  }
  ok('five retired panel names still map to a panel that exists');

  // The allowlist is an operator's decision about the box, so it must NOT be reachable from a
  // client route — a writer who could set it in Preferences could set it back.
  const llama = readFileSync(new URL('../src/llama.ts', import.meta.url), 'utf8');
  assert.match(llama, /ANANSI_MODELS/, 'the allowlist reads an env var');
  assert.match(llama, /export const allowed\b/, 'and exposes a predicate the routes can use');
  assert.match(llama, /if \(!allowed\(id\)\)/, 'setModel refuses anything off the list');
  const routes = readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
  assert.ok(!/POST \/api\/(models|allow)/.test(routes),
    'nothing may write the allowlist over HTTP');
  ok('the model allowlist is set on the box, not over the wire');
}

// Every api method must have a caller, or be listed here with a reason. Deleting desk.js took
// the only UI for five features BUILD-STATE calls "Done" — progressions, pins, entry-field
// revert, export and arcs — and nothing noticed, because the engine and the routes were all
// still fine. Parity was asserted from "the new surface works", which is not the same question.
{
  const api = read('web/api.js');
  const app = read('web/app.js');
  const defined = [...api.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.ok(defined.length > 30, `only ${defined.length} api methods parsed`);

  // Deferred on purpose, each with the reason it is not wired yet.
  // A name in here is SKIPPED by the check below, so a stale entry is a hole: `rollup` and
  // `delArc` sat here after arcs got a surface, which meant deleting that surface again would
  // have gone unnoticed. Take a name out the moment it is wired.
  const DEFERRED: Record<string, string> = {
    delBranch: 'forking exists; deleting a branch has no screen yet',
  };
  const orphans = defined.filter((d) => !new RegExp(`\\bapi\\.${d}\\b`).test(app) && !(d in DEFERRED));
  assert.deepStrictEqual(orphans, [],
    `api.${orphans.join(', api.')} has no caller. Either wire it or add it to DEFERRED with a `
    + `reason — an engine feature with no surface is the failure mode this project keeps hitting.`);
  ok(`${defined.length} api methods, ${Object.keys(DEFERRED).length} deferred with reasons, no silent orphans`);

  // AND THE OTHER DIRECTION, which this check did not have until 2026-08-27. The half above asks
  // whether every api method has a caller. It cannot see a route that was born without one — and
  // that is exactly how `POST /api/remember` got here: finished, tested in test/memory.ts, driven
  // by nothing, so the one case it exists for (re-run the memory pass on a chapter that closed
  // while the router was down) could not be reached from any surface.
  //
  // A route reached only by `bench/` is fine and is listed; a route reached by nobody is the bug.
  const routeSrc = read('src/routes.ts');
  const declared = [...routeSrc.matchAll(/^\s*'(GET|POST|DELETE) (\/api\/[a-z/]+)'/gm)]
    .map((m) => m[2]);
  assert.ok(declared.length > 40, `only ${declared.length} routes parsed`);
  const NO_CLIENT: Record<string, string> = {
    // Driven by bench/checker.ts, which is how the contradiction checker is measured. The app
    // reaches the same code through accept, not through this route.
    '/api/check': 'bench/checker.ts drives it; the app runs the checker through accept',
  };
  const unreachable = [...new Set(declared)].filter((path) =>
    !api.includes(`'${path}'`) && !api.includes(`\`${path}`) && !api.includes(`${path}?`)
    && !(path in NO_CLIENT));
  assert.deepStrictEqual(unreachable, [],
    `${unreachable.join(', ')} — no method in web/api.js names this route, so no surface can `
    + `reach it. Wire it, or add it to NO_CLIENT with what does drive it. A route with no door `
    + `is the same failure as an api method with no caller, arriving from the other side.`);
  ok(`${[...new Set(declared)].length} routes, every one reachable from web/api.js or spoken for`);
}

// POST /api/proposal branches on `body.accept` and app.js was sending `decision: 'accept'`, so
// `c.body.accept` was undefined, upsertEntry was skipped, and the proposal was marked rejected.
// Clicking Accept discarded the fact. Narrow on purpose: a generic payload-contract check was
// built as bench/contracts.py, deleted 2026-08-25 — it flagged three false positives for every
// real one, because routes
// delegate to helpers and spread the body — not test-worthy, so this locks the one that bit.
{
  const js = read('web/app.js');
  const call = js.match(/api\.decide\(\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(call, 'app.js no longer calls api.decide — retire this check with it');
  assert.match(call, /\baccept\s*:/,
    'api.decide must send `accept`, which is the key POST /api/proposal reads. Sending anything '
    + 'else makes Accept silently reject the proposal.');
  assert.ok(!/\bdecision\s*:/.test(call), 'the route never reads `decision`');
  ok('Accept sends the key the proposal route actually reads');
}

// And the guard that makes it safe even if a name collides again.
assert.match(read('web/app.js'), /t === root \|\| t === document\.body/,
  'the delegation must refuse <html> and <body> as action targets');
ok('the delegation refuses html and body outright');

console.log(`\n${n} checks passed`);
