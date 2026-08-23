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
for (const page of ['app.html', 'desk.html', 'phone.html']) {
  const html = read(page);
  for (const m of html.matchAll(/src="\.\/([\w/.-]+)"/g)) { read(m[1]); ok(`${page} → ${m[1]}`); }
}
for (const f of ['web/app.js', 'web/desk.js', 'web/phone.js']) {
  const used = new Set([...read(f).matchAll(/\bapi\.(\w+)\(/g)].map((m) => m[1]));
  const missing = [...used].filter((u) => !defined.has(u));
  assert.deepStrictEqual(missing, [], `${f} calls api.${missing.join(', api.')} which api.js does not define`);
  ok(`${f} uses only defined api methods (${used.size})`);
}
// Every $('id') a surface READS must be rendered somewhere in that same surface or its page.
// This is the check that would have caught `f-pin`: Save read an element the desktop never
// drew, so every entry save threw after the write landed — silently, in an async handler.
// Council #3 called it "a field with no screen"; Council #4 called it "a screen with no wire".
for (const [js, html] of [['web/app.js', 'app.html'], ['web/desk.js', 'desk.html'], ['web/phone.js', 'phone.html']]) {
  const src = read(js) + read(html);
  const ids = new Set([...read(js).matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
  const drawn = new Set([...src.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const orphans = [...ids].filter((id) => !drawn.has(id));
  assert.deepStrictEqual(orphans, [], `${js} reads ids nothing renders: ${orphans.join(', ')}`);
  ok(`${js} renders every id it reads (${ids.size})`);
}

console.log(`\n${n} checks passed`);
