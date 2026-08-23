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

// POST /api/proposal branches on `body.accept` and app.js was sending `decision: 'accept'`, so
// `c.body.accept` was undefined, upsertEntry was skipped, and the proposal was marked rejected.
// Clicking Accept discarded the fact. Narrow on purpose: a generic payload-contract check was
// built (bench/contracts.py) and flagged three false positives for every real one, because routes
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
