// Client modules ship straight to the browser, so a syntax error is a blank page with no
// server-side signal. Check them here rather than by opening a tab.
//
// `node --check` with module input parses without executing — no regex stripping, which is
// how the first version of this test managed to report failures that were its own fault.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert';

// Resolved from this file, not from the working directory. These paths used to be bare and
// the suite passed only when run from the project root — which stopped being true the moment
// the tests moved into their own folder.
const R = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(R + p, 'utf8');

let n = 0;
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

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
    // A THIRD WAY OF BEING REACHABLE, added 2026-08-28. A button can also be picked up by a
    // dedicated listener that matches it with `closest('[data-x]')` rather than by the delegated
    // click handler and its allowlist. The @ menu does exactly that, and on purpose: it takes
    // `mousedown`, because a click would move focus out of the textarea and take the caret with
    // it. The check's premise was "an action attribute or an id listener" and that was one short.
    // `closest(` or `closest?.(` — the listener guards against a non-Element target.
    if (data.some((d) => new RegExp(`closest\\??\\.?\\('\\[data-${d}\\]'\\)`).test(js))) return false;
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
  // `setup` moved from an assignment to a BUTTON on 2026-08-28: the chapter's own screen now hands
  // you on to the next chapter rather than the close teleporting you there. Asserted in the button
  // form for the reason spelled out below, which is the stronger of the two.
  // `ritual` is the chapter's own screen, opened from the Chapter panel's door.
  const byClick = { entry: /S\.panel = 'entry'/, history: /S\.panel = 'history'/,
                    setup: /<button class="btn ghost" data-panel="setup"/,
                    ritual: /S\.panel = 'ritual'/,
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

  // A RETIRED CARD MUST BE VISIBLE SOMEWHERE. It stops reaching the model for the rest of the book
  // and the Threads screen draws it like any other, so without the way back a wrong press is
  // invisible AND permanent. Sliced to the waiting panel on purpose — the same argument the mutes
  // carry, and asserting it anywhere in the file would pass on a comment about it.
  {
    const w = js.slice(js.indexOf('  waiting() {'), js.indexOf('\n  },', js.indexOf('  waiting() {')));
    assert.match(w, /<button data-unretire="/,
      'a finished thread must be liftable from Waiting, the way a mute is');
    assert.match(w, /retiredAtChapter/, 'and it must read the threshold off the view, not guess');
    ok('a finished thread is listed in Waiting with the press that brings it back');
  }

  // THE BROWSER HARNESS'S OWN SILENCE, MADE AUDIBLE.
  //
  // `test/ui/run.sh` is run by hand and its results lived only in the terminal, so `buttons` and
  // `handlers` sat dead for weeks — dying on their first click, reporting nothing — while the last
  // line of a run still read "all scenarios green" over sixteen of eighteen. Nothing in the repo
  // could say otherwise. This does not make the browser run; it makes not running it, and running
  // it and finding a corpse, both visible from the suite that DOES run.
  //
  // Deliberately three different answers, because they are three different states:
  //   - no file at all       a NOTE. A fresh clone has never run it and that is not a defect.
  //   - a scenario is stale  a NOTE. Information about this machine, not about the code.
  //   - a recorded death     a FAILURE. A known corpse being carried is exactly what went wrong.
  //
  // NOT a static check that every `data-*` selector in test/ui/ exists in web/app.js. That is the
  // obvious fix and it would NOT have caught this: `data-act` does exist in app.js, it just moved
  // behind a press when the card grew a face. The failure was ordering, not absence. A guard that
  // cannot fire on the thing it was built for reports perfection — F17, pointed at ourselves.
  {
    const RESULTS = process.env.ANANSI_UI_RESULTS ?? '/tmp/anansi-ui-results.json';
    const scenarios = readdirSync(new URL('./ui/', import.meta.url))
      .filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort();
    let rec: Record<string, any> | null = null;
    try { rec = JSON.parse(readFileSync(RESULTS, 'utf8')).scenarios ?? {}; } catch { rec = null; }

    if (!rec) {
      console.log(`  note  the browser harness has never run on this machine —`
        + ` ${scenarios.length} scenarios unaccounted for (test/ui/run.sh)`);
    } else {
      const dead = Object.values(rec).filter((r: any) => r.died || r.red > 0)
        .map((r: any) => `${r.name} (${r.died ? `died after ${r.ok} ok` : `${r.red} red`})`);
      const never = scenarios.filter((n) => !rec![n]);
      // Staleness against the surface itself: change app.js and every recorded result is a
      // statement about a version of the app that no longer exists.
      const appAt = Math.floor(statSync(new URL('../web/app.js', import.meta.url)).mtimeMs / 1000);
      const stale = Object.values(rec).filter((r: any) => r.at < appAt).map((r: any) => r.name);
      if (never.length) console.log(`  note  never run here: ${never.join(', ')}`);
      if (stale.length) console.log(`  note  older than web/app.js: ${stale.join(', ')}`);
      assert.deepStrictEqual(dead, [],
        `the browser harness recorded ${dead.length} broken scenario(s): ${dead.join(', ')}. `
        + `A recorded death is a known corpse being carried — fix it, or delete the scenario and `
        + `say why. Re-run test/ui/run.sh to clear this.`);
      ok(`the browser harness recorded ${Object.keys(rec).length} scenario(s), none broken`);
    }
  }

  // #29. The weave's fade and the hold that has to outlast it live in two files, and the failure
  // when they disagree is invisible: the veil walks out while the letters are still going, so the
  // effect happens off-screen and looks like it was never built. Asserted as an INEQUALITY rather
  // than two numbers, so either can be tuned and only a real inversion goes red.
  {
    const css = readFileSync(R + 'app.html', 'utf8');
    const fade = /--t-weave:\s*([\d.]+)s/.exec(css);
    assert.ok(fade, 'the weave has a fade duration of its own, not the shared --t-slow');
    const hold = /return (\d+);\s*\/\/ long enough to read it/.exec(read('web/app.js'));
    assert.ok(hold, 'and solve() returns the hold before the veil leaves');
    assert.ok(Number(hold![1]) > Number(fade![1]) * 1000,
      `the hold (${hold![1]}ms) must outlast the fade (${Number(fade![1]) * 1000}ms), or the `
      + `letters are still going when the veil starts leaving and nobody sees it`);
    assert.doesNotMatch(css.slice(css.indexOf('.wrow i {'), css.indexOf('.wrow i {') + 200),
      /--t-slow/, 'and it no longer borrows the token every other motion shares');
    ok(`the weave's letters fade for ${fade![1]}s inside a ${hold![1]}ms hold`);
  }

  // A COMMENT CANNOT BE ALLOWED TO CLOSE THE STRING. web/app.js's markup carries HTML comments
  // INSIDE template literals, so one backtick — or one interpolation — ends the string early: the
  // file still loads and the function throws when it is called, which renders a panel as nothing.
  // IT IS A LOCATOR, NOT THE GUARD, and the falsification says so: breaking a comment on purpose
  // turns the PARSE check above red first, because a closed string is a syntax error and that
  // check runs earlier. What this adds is the answer to "where" — a parse failure in a 5,000-line
  // file names a line that is nowhere near the comment that caused it. Worth its ten lines because
  // on 2026-08-29 the same mistake was made three times in one sitting, twice in markup and once
  // in a prompt, and the third one cost the least because the parser pointed straight at it.
  {
    const bad = [...read('web/app.js').matchAll(/<!--[\s\S]*?-->/g)]
      .filter((m) => m[0].includes('`') || m[0].includes('${'))
      .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 60));
    assert.deepStrictEqual(bad, [],
      `an HTML comment inside a template literal carries a backtick or an interpolation, which `
      + `closes the string: ${bad.join(' | ')}`);
    ok('no HTML comment in the markup can close the string it lives in');
  }

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

// A BACKTICK INSIDE AN HTML COMMENT CLOSES THE TEMPLATE IT SITS IN.
//
// Three times on 2026-08-27 a comment written to explain a bit of markup was written INSIDE the
// template literal that produces it, with a name in backticks — and a backtick ends the template.
// `node --check` passes, because what is left still parses as valid JavaScript; the page simply
// stops rendering. The last one emptied the rail and the header completely and the node suites
// stayed green, because the stub DOM never runs the real drawRail template.
//
// src/db.ts has "the schema literal contains no backtick" for exactly this reason, on the SQL. It
// is the same trap and this is the same guard, on the markup.
{
  const js = read('web/app.js');
  const bad = [...js.matchAll(/<!--[\s\S]*?-->/g)]
    .filter((m) => m[0].includes('`'))
    .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 60));
  assert.deepStrictEqual(bad, [],
    'an HTML comment carries a backtick, which closes the template literal it is written inside. '
    + 'Use plain words for the name — node --check will not catch this and neither will the stub.');
  ok(`no HTML comment in app.js carries a backtick (${(js.match(/<!--/g) ?? []).length} comments)`);
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
  // A BACKTICK IN AN HTML COMMENT IS FATAL, and it fails a long way from the cause. app.js builds
  // its markup with template literals, so the comments inside that markup are inside the string:
  // one backtick closes it early and what follows parses as code. The file still LOADS — the
  // parse check above only catches the cases that are also syntax errors — and the function throws
  // at call time, so a panel renders as nothing at all with no error until somebody opens it.
  // Four times on 2026-08-28, every one while quoting an identifier in the house style. The same
  // trap is guarded for the SQL schema in test/db.ts; this is the other half.
  {
    const marked = [...app.matchAll(/<!--[\s\S]*?-->/g)]
      .filter((m) => m[0].includes('`'))
      .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 70));
    assert.deepStrictEqual(marked, [],
      'a backtick inside an HTML comment ends the template literal that holds the markup — '
      + 'quote identifiers with "double quotes" in there');
    ok('no HTML comment in web/app.js carries a backtick');
  }

  const DEFERRED: Record<string, string> = {
    delBranch: 'forking exists; deleting a branch has no screen yet',
    // PLAN-08 Phase 3, 2026-08-28. The engine reads addons and the routes write them; the editor
    // that would call these is the next slice and is what Seth asked for in the same sitting —
    // the card's face, the anchors per slot, and Anansi filling any of them. Deferred with a date
    // rather than wired to a half-drawn screen. If this entry is still here in a week, the guard
    // was right and the surface was never built.
    saveAddon: 'PLAN-08: the addon editor is the next slice (2026-08-28)',
    addonOn:   'PLAN-08: the addon editor is the next slice (2026-08-28)',
    delAddon:  'PLAN-08: the addon editor is the next slice (2026-08-28)',
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
    // #23 took the router controls off Preferences, which was their only door. The route stays: it
    // is an OPERATOR action, admin-gated, and test/scope.ts proves the gate with two owners — "may
    // I stop a service the other writer is mid-generation on" is not a question ownership can
    // answer, and that check is worth more than the buttons were. Deleting the route would have
    // deleted the gate test with it.
    '/api/router': 'an operator action with no surface since #23; test/scope.ts proves its gate',
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

// The theme panel is a menu, and every menu overlays the screen below `overlay()`'s breakpoint —
// that is where #rail and #side stop being columns and become drawers over the doc. The panel's
// full-screen rule carried its own number, 719, while overlay() said 1099, so on any window
// between them every other menu overlaid and the theme panel alone stayed a 274px card pinned in
// the top-right corner. Seth's window is in that band; that is how he found it. Two numbers for
// one decision drift apart silently — nothing renders wrong, it just renders the desk shape.
{
  const bp = read('web/app.js').match(/const overlay = \(\) => matchMedia\('\(max-width:(\d+)px\)'\)/)?.[1];
  assert.ok(bp, 'overlay() no longer reads as a max-width media query — retire this check with it');
  const html = read('app.html');
  // `position:absolute` since 2026-08-28, not fixed — the panel moved out of #doc and became a
  // child of #shell, which is itself `position:fixed; inset:0`. A fixed element is only fixed to
  // the viewport while no ancestor makes itself its containing block, and transform, filter,
  // backdrop-filter, perspective, will-change, contain and `zoom` all do. On Seth's Android it
  // rendered as a band between the header and the composer. Absolute inside a fixed shell has no
  // such dependency. What this check is really about is the BREAKPOINT agreeing with overlay(),
  // so it matches either positioning and asserts inset:0 as the thing that means full screen.
  const rule = html.match(/@media \(max-width:(\d+)px\) \{[\s\S]{0,400}?#appearance \{[\s\S]{0,400}?position:(?:fixed|absolute); inset:0/);
  assert.ok(rule, 'no media query makes #appearance a full-screen panel any more — it needs to be '
    + 'position:absolute or fixed with inset:0 inside the overlay breakpoint');
  assert.strictEqual(rule[1], bp,
    `#appearance goes full-screen at ${rule[1]}px but overlay() calls it an overlay at ${bp}px. `
    + `Between those widths every other menu overlays the screen and the theme panel stays a desk `
    + `card in the corner. They are one decision; give them one number.`);
  ok(`the theme panel overlays at the same width every other menu does (${bp}px)`);
}


// ---------------------------------------------------------------------------------------------
// PAIRED VOCABULARIES. One table, walked both ways.
//
// COUNCIL-05 seat 6: four separate defects this week were one defect — two things that must agree,
// and only one of them guarded. `BLOCK_ORIGIN` was walked against the engine's kinds and its
// neighbour `BLOCK_COLOR`, declared twelve lines away in the same file, was not; `VOICE` had been
// missing from it long enough to be painted as an unrecognised kind on 61 of 61 measured calls.
// The api-method→caller direction was guarded and route→method was not, which is how
// `POST /api/remember` shipped with no door. In none of those was the instrument missing. It
// covered one side.
//
// So the fix is not another check. It is ONE PLACE that names every vocabulary shared across
// files, so adding a value to any of them tells you every map you have not updated. Add a row
// here when you add a vocabulary; the cost of forgetting is exactly what this file is for.
{
  const blocks = await import('../src/blocks.ts');
  const render = await import('../src/render.ts');
  const model = await import('../web/model.js');
  const context = read('src/context.ts');
  const prompts = read('src/prompts.ts');

  /** `whole` must cover every name in `vocab`; `subset` may cover fewer but may not invent one. */
  const pairs: [string, string[], Record<string, unknown> | string[], 'whole' | 'subset', string][] = [
    ['blocks.ts ORDER -> web/model.js BLOCK_COLOR', blocks.ORDER, (model as any).BLOCK_COLOR, 'whole',
      'app.js paints an unlisted kind with var(--ink-ghost), the colour that means "a kind I have '
      + 'no entry for" — so the block is on the meter, sized correctly, and looks like a bug'],
    ['blocks.ts ORDER -> web/model.js BLOCK_ORIGIN', blocks.ORDER, (model as any).BLOCK_ORIGIN, 'whole',
      'the Context row would be named for the engine kind rather than for the panel it opens'],
    ['blocks.ts ORDER -> render.ts TAG', blocks.ORDER, (render as any).TAG ?? {}, 'subset',
      'a tag is optional — PROSE and TAIL carry none — but a TAG for a kind that does not exist '
      + 'wraps nothing and the prompt silently loses a section'],
    ['blocks.ts ORDER -> blocks.ts CAPS', blocks.ORDER, blocks.CAPS as any, 'subset',
      'a cap on a kind that is not in ORDER is a cap that never applies'],
    ['blocks.ts ORDER -> blocks.ts CANON_KINDS', blocks.ORDER, blocks.CANON_KINDS, 'subset',
      'the eviction sort ranks by CANON_KINDS.indexOf, and a kind missing from ORDER sorts to -1'],
  ];

  for (const [what, vocab, map, mode, why] of pairs) {
    const covered = new Set(Array.isArray(map) ? map : Object.keys(map));
    if (mode === 'whole') {
      const missing = vocab.filter((k) => !covered.has(k));
      assert.deepStrictEqual(missing, [], `${what}: missing ${missing.join(', ')}. ${why}`);
    }
    const invented = [...covered].filter((k) => !vocab.includes(k as any));
    assert.deepStrictEqual(invented, [],
      `${what}: names ${invented.join(', ')}, which is not a block kind. ${why}`);
  }

  // The type and the order are two lists of the same thing, in two syntaxes, in one file.
  const declared = [...(read('src/blocks.ts').match(/export type Kind =[\s\S]*?;/)?.[0] ?? '')
    .matchAll(/'([A-Z-]+)'/g)].map((m) => m[1]);
  assert.ok(declared.length > 5, `only ${declared.length} kinds parsed out of the Kind union`);
  assert.deepStrictEqual([...declared].sort(), [...blocks.ORDER].sort(),
    'the Kind union and ORDER disagree. A kind missing from ORDER sorts to indexOf -1, which puts '
    + 'it ahead of SPINE at the head of the prompt — silently, and in every call.');

  // Entry types: the surface list, the engine's union, and the grammar the model answers with.
  const engineKinds = [...(context.match(/entryType: ('[a-z]+'( \| )?)+/)?.[0] ?? '')
    .matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const schemaKinds = [...(prompts.match(/type: \{ type: 'string', enum: \[[^\]]+\]/)?.[0] ?? '')
    .matchAll(/'([a-z]+)'/g)].map((m) => m[1]).filter((k) => k !== 'string');
  assert.ok(engineKinds.length === 4 && schemaKinds.length === 4,
    `parsed ${engineKinds.length} engine kinds and ${schemaKinds.length} schema kinds; both are 4`);
  assert.deepStrictEqual([...(model as any).KINDS].sort(), [...engineKinds].sort(),
    "web/model.js KINDS and context.ts's Entry.entryType disagree — the editor would offer a type "
    + 'the engine does not know, or hide one it does');
  assert.deepStrictEqual([...schemaKinds].sort(), [...engineKinds].sort(),
    'EXTRACT_SCHEMA\'s enum and the engine disagree. The grammar decides what the model CAN say, '
    + 'so a type only in the schema arrives and renders as nothing; one only in the engine can '
    + 'never be proposed at all.');

  // AND THE COLOURS ARE A VOCABULARY TOO. A kind present in BLOCK_COLOR but indistinguishable
  // from the segment beside it is covered on paper and invisible in the bar.
  //
  // A FLOOR, NOT A DESIGN STANDARD, and the difference matters. The first version of this asked
  // for 1.2:1 of luminance between neighbours and THREE existing pairs failed it — which makes it
  // a redesign of Seth's palette wearing a check's clothes, and a check that needs three
  // exemptions on its first run is one that gets silenced. So it asks only that two adjacent
  // segments not be the SAME lightness, which is a correctness floor: identical luminance means
  // one bar in greyscale, and hue is the axis colour blindness takes away. The wider question —
  // three adjacent pairs in this meter are separated by hue alone — is a design call and is
  // written down in COUNCIL-05 rather than enforced here.
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  //
  // GRANDFATHERED, one pair, named rather than silenced. `CANON-TRIGGERED` and `STRING` are
  // identical in luminance (1.00:1) and were long before this check existed. They are left alone
  // for a measured reason: `bench/utilisation.ts` scored 61 generations and BOTH kinds were sent
  // in ZERO of them, so the two segments have never yet appeared in a meter together. That stops
  // being true the moment PLAN-06 §2e makes the triggered tier fire — which is when this pair
  // needs a real answer and not an exemption. A name in this list is SKIPPED, so a stale entry is
  // a hole, the same way `DEFERRED` above is.
  const GRANDFATHERED = new Set(['CANON-TRIGGERED|STRING']);
  const colour = (model as any).BLOCK_COLOR as Record<string, string>;

  // Distinctness first, and separately from adjacency — because ADJACENT IN `ORDER` is not the
  // same as adjacent in the bar. The meter only draws the kinds a call actually contains, so which
  // segments touch depends on what was sent: CANON-TRIGGERED and STRING have never been sent at
  // all, which means their neighbours touch instead. Found by giving PROSE and TAIL the same hex
  // and watching the adjacency rule stay green — DIRECTIVE sits between them in ORDER and nothing
  // else looked. Two kinds sharing a colour is wrong whatever the order does.
  const seen = new Map<string, string>();
  for (const [kind, hex] of Object.entries(colour)) {
    const first = seen.get(hex.toLowerCase());
    assert.ok(!first, `${kind} and ${first} are both ${hex}. Two kinds cannot share a colour: the `
      + 'meter draws only the kinds a call contains, so any two of them can end up touching, and '
      + 'the legend gives them the same dot whether they touch or not.');
    seen.set(hex.toLowerCase(), kind);
  }
  for (let i = 1; i < blocks.ORDER.length; i++) {
    const [a, b] = [blocks.ORDER[i - 1], blocks.ORDER[i]];
    if (GRANDFATHERED.has(`${a}|${b}`)) continue;
    const ratio = (Math.max(lum(colour[a]), lum(colour[b])) + 0.05)
      / (Math.min(lum(colour[a]), lum(colour[b])) + 0.05);
    assert.ok(ratio >= 1.05,
      `${a} and ${b} are adjacent segments of one meter and are the same lightness `
      + `(${ratio.toFixed(2)}:1). In greyscale that is one bar, and hue is the axis colour `
      + 'blindness takes away. Move one of them.');
  }

  // The exemption itself, asserted. If somebody fixes that pair the entry above becomes a lie that
  // silences a check nobody knows is silenced — so it has to keep being true to stay.
  for (const pair of GRANDFATHERED) {
    const [a, b] = pair.split('|');
    const ratio = (Math.max(lum(colour[a]), lum(colour[b])) + 0.05)
      / (Math.min(lum(colour[a]), lum(colour[b])) + 0.05);
    assert.ok(ratio < 1.05,
      `${pair} is grandfathered in the adjacency check and no longer needs to be — it is now `
      + `${ratio.toFixed(2)}:1. Take it out of GRANDFATHERED; an exemption that is not doing `
      + 'anything is a silenced check waiting for the next colour change.');
  }

  ok(`${pairs.length + 3} shared vocabularies agree, walked both ways, block colours are all distinct `
    + `and adjacent ones differ by lightness (${GRANDFATHERED.size} pair grandfathered, still failing)`);
}

// Two `@keyframes` of one name is not a syntax error, and not a visible one either: the later
// declaration silently wins for every rule that references the name. `breathe` was declared twice
// in app.html — .7-to-.28 for the veil's head and 1-to-.62 for #send.stopping — so the veil never
// pulsed at the amplitude written for it, and nothing said so. PLAN-07 bug 3.
{
  const css = read('app.html');
  const names = [...css.matchAll(/@keyframes\s+([A-Za-z_-][\w-]*)/g)].map((m) => m[1]);
  const dupes = [...new Set(names.filter((x, i) => names.indexOf(x) !== i))];
  assert.deepStrictEqual(dupes, [],
    `@keyframes declared twice: ${dupes.join(', ')}. The later one wins for every rule that names `
    + 'it, so one of the two animations runs at the wrong values and nothing in the page says so.');

  // The same mistake from the other side: a renamed keyframe leaves `animation:oldname` pointing
  // at nothing, the element simply stops moving, and no error appears anywhere.
  const used = [...css.matchAll(/animation:\s*([A-Za-z_-][\w-]*)/g)].map((m) => m[1])
    .filter((x) => !['none', 'inherit', 'initial', 'unset'].includes(x));
  const missing = [...new Set(used)].filter((x) => !names.includes(x));
  assert.deepStrictEqual(missing, [],
    `animation: ${missing.join(', ')} — named by a rule and defined by no @keyframes. The element `
    + 'does not animate and nothing reports it.');
  ok(`${names.length} @keyframes, each declared once, and every name a rule animates exists`);
}

console.log(`\n${n} checks passed`);
