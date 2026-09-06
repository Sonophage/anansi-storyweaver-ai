// A dead-code and half-built sweep. Static, read-only, no model and no database.
//
//   node --experimental-strip-types bench/sweep.ts
//
// It answers five questions the two harnesses do not, and it answers them by parsing the tree
// rather than by believing a comment:
//
//   1. exported and never named outside its own file — over-exported rather than dead, usually:
//      a module-private helper wearing `export`, which widens the surface nobody meant to widen
//   2. a `data-*` action in the ACTIONS allowlist with no handler, or a handler for an action the
//      allowlist does not admit — the second is worse, because the delegated listener drops it
//      silently and the button simply does nothing
//   3. an element id used from JS that app.html does not contain
//   4. a CSS id selector in app.html that no element and no JS ever names
//   5. a localStorage key written and never read, or read and never written
//
// It PRINTS rather than throws. Some of these have legitimate answers — a helper used only by
// tests, an id created at runtime — and a sweep that failed the build on every one of them would
// be turned off within a week. `test/web.ts` is where the rules that must hold live.
import { readFileSync, readdirSync } from 'node:fs';

const R = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(R + p, 'utf8');
const srcFiles = readdirSync(R + 'src').filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`);
const webFiles = readdirSync(R + 'web').filter((f) => f.endsWith('.js')).map((f) => `web/${f}`);
const testFiles = readdirSync(R + 'test').filter((f) => f.endsWith('.ts')).map((f) => `test/${f}`);
const benchFiles = readdirSync(R + 'bench').filter((f) => f.endsWith('.ts')).map((f) => `bench/${f}`);
const uiFiles = readdirSync(R + 'test/ui').filter((f) => f.endsWith('.js')).map((f) => `test/ui/${f}`);

const all = [...srcFiles, ...webFiles, ...testFiles, ...benchFiles, ...uiFiles,
  'serve.ts', 'run.ts', 'app.html'];
const body = new Map(all.map((f) => [f, read(f)]));
let findings = 0;
const say = (head: string, lines: string[]) => {
  if (!lines.length) { console.log(`  ${head}: none`); return; }
  findings += lines.length;
  console.log(`  ${head}: ${lines.length}`);
  for (const l of lines) console.log(`     ${l}`);
};

console.log('\n  sweep — dead code and half-built, parsed from the tree\n');

// ---- 1. exports nothing imports ----
{
  const dead: string[] = [];
  for (const f of [...srcFiles, ...webFiles]) {
    const names = [...body.get(f)!.matchAll(/^export (?:async )?(?:const|function|class|type|interface) (\w+)/gm)]
      .map((m) => m[1]);
    for (const n of names) {
      // Used anywhere but its own file. A bare word match is deliberately generous: this is a
      // sweep that prints, and a false NEGATIVE is cheaper here than a false positive.
      // This file does not count as a use. It named `Arc` in a comment explaining the type case
      // and promptly reported Arc as used — a sweep reading its own prose as evidence.
      const used = all.some((g) => g !== f && g !== 'bench/sweep.ts'
        && new RegExp(`\\b${n}\\b`).test(body.get(g)!));
      // A TYPE exported and unused elsewhere costs nothing at runtime, and one named inside an
      // exported interface — `Input.arcs?: Arc[]` — is legitimately public even if nobody has
      // constructed one yet. Marked rather than lumped in with functions, which are real surface.
      const isType = new RegExp(`^export (?:type|interface) ${n}\\b`, 'm').test(body.get(f)!);
      if (!used) dead.push(`${n}  (${f})${isType ? '  — a type, so runtime surface is unchanged' : ''}`);
    }
  }
  say('exported and never named outside its own file', dead);
}

// ---- 2. the ACTIONS allowlist against the handlers ----
{
  const app = body.get('web/app.js')!;
  // ACTIONS is a flat array of names, later joined into a selector — not a Set. The first version
  // of this parse looked for `new Set([...])`, matched nothing, and reported 123 handlers as
  // silently dropped in an app that plainly works. Validate the detector before believing it.
  // The array ends `].map(k => ...)` and NOT with `];`, so a pattern anchored on `];` runs past it
  // into the next statement and swallows whatever quoted strings it finds — five of them, reported
  // as admitted actions nothing handles. Second time the parse was the thing that was wrong here.
  /* AND THE COMMENTS COME OUT BEFORE THE NAMES GO IN. Third time the parse was the thing that was
   * wrong here, and it is the same fault section 1 already records against itself: the sweep read
   * its own source's prose as evidence.
   *
   * `ACTIONS` carries a parenthetical saying which name LEFT it — `('help' left this list on
   * 2026-09-03. The webs are drawn by tipMark now…)` — written precisely so a reader does not go
   * looking for a live action called help. Harvesting quoted words out of the raw slice picked
   * `'help'` straight back out of that sentence and reported `data-help` as an admitted action
   * nothing handles. The comment that exists to prevent the confusion CAUSED it.
   *
   * A note naming a retired action is the normal way this file is maintained, so this will happen
   * again every time one is removed. Stripping is the fix, not editing the comment.
   *
   * Line comments and block comments both, and it is safe on this slice specifically because every
   * entry is a bare quoted lowercase name — there is no string here that can contain a `//`. */
  const slice = (app.match(/const ACTIONS = \[[\s\S]*?\]\s*(?:\.|;)/)?.[0] ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const listed = new Set([...slice.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]));
  if (!listed.size) throw new Error('ACTIONS parsed as empty — the sweep would report every '
    + 'handler as unreachable. Fix the parse, do not read the output.');
  // AND THE STRIP MUST NOT EAT THE LIST. An over-greedy comment pattern would leave a short but
  // non-empty set and the guard above would pass it, so assert the size against the raw slice:
  // the two differ by exactly the names quoted inside comments, which has been one for a year.
  const rawNames = new Set([...(app.match(/const ACTIONS = \[[\s\S]*?\]\s*(?:\.|;)/)?.[0] ?? '')
    .matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]));
  if (rawNames.size - listed.size > 5) throw new Error(`the comment strip removed `
    + `${rawNames.size - listed.size} names from ACTIONS — that is a broken pattern, not prose. `
    + 'Fix the parse, do not read the output.');
  // `if (d.foo` / `if (d.foo !== undefined` / `d.foo)` in the delegated handler.
  const handled = new Set([...app.matchAll(/\bd\.([a-z0-9]+)\b/g)].map((m) => m[1]));
  /* THE DELEGATED HANDLER IS NOT THE ONLY READER, and assuming it was is what made this call
   * `data-atpick` a dead control. The @-picker rows carry `data-atpick="3"` and are read by their
   * OWN listener — `e.target.closest('[data-atpick]')`, then `b.dataset.atpick` — which is the
   * right shape for a control inside a menu that owns its own keyboard handling, and is invisible
   * to a scan that only knows about `d.foo`.
   *
   * So the dead-control question below asks "read ANYWHERE", not "read by the delegated handler".
   * The first check keeps `handled`, because an action admitted to ACTIONS and ignored by the
   * delegated listener is a real fault whatever else reads the attribute. */
  const readAnywhere = new Set([...handled,
    ...[...app.matchAll(/\[data-([a-z0-9]+)\]/g)].map((m) => m[1]),
    ...[...app.matchAll(/\.dataset\.([a-z0-9]+)\b/g)].map((m) => m[1])]);
  const marked = new Set([...app.matchAll(/data-([a-z0-9]+)=/g)].map((m) => m[1]));
  say('in ACTIONS, no handler reads it',
    [...listed].filter((a) => !handled.has(a)).map((a) => `data-${a}`));
  // Read by a handler and not in ACTIONS is USUALLY correct and not a fault: these are payloads
  // riding on a button whose action IS admitted — `data-owed="s-1" data-owedpanel="waiting"`, one
  // action and one argument. Listed rather than hidden, because the same shape is what a genuinely
  // unreachable button looks like, and only reading it tells the two apart. The check below is the
  // one that decides.
  say('read by a handler as a payload, not admitted as an action (expected — read each)',
    [...handled].filter((a) => !listed.has(a) && marked.has(a)).map((a) => `data-${a}`));
  // Only on a BUTTON. Most data-* attributes in this app are field markers a querySelector reads
  // (`[data-f="keys"]`, `[data-sp…]`, `[data-st…]`) and were never meant to be clicked; listing
  // them as dead buttons buried the two or three that matter under forty that never were.
  const onButton = new Set([...app.matchAll(/<button[^>]*?data-([a-z0-9]+)=/g)].map((m) => m[1]));
  say('a button carries it, ACTIONS does not admit it and nothing reads it — a dead control',
    [...onButton].filter((a) => !listed.has(a) && !readAnywhere.has(a)).map((a) => `data-${a}`));
}

// ---- 3. element ids JS reaches for that the page does not have ----
{
  const html = body.get('app.html')!;
  const inHtml = new Set([...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));
  const app = body.get('web/app.js')!;
  const wanted = new Set([
    ...[...app.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]),
    ...[...app.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]),
  ]);
  // Ids the app creates itself at runtime are not missing; they are just not in the shell.
  // Created at runtime counts as created: `ghost()` builds its node with `.id = 'ghost'`, which
  // the markup form of this pattern does not see.
  const made = new Set([
    ...[...app.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]),
    ...[...app.matchAll(/\.id ?= ?'([\w-]+)'/g)].map((m) => m[1]),
  ]);
  say('reached from JS, absent from app.html and never created at runtime',
    [...wanted].filter((i) => !inHtml.has(i) && !made.has(i)));
}

// ---- 4. CSS id selectors nothing ever is ----
{
  const html = body.get('app.html')!;
  const css = html.slice(0, html.indexOf('</style>') + 1);
  // Not hex colours. The first version matched #D9B26A and #EAE3D6 as id selectors and reported
  // nine of them as styling elements that do not exist — a detector reading the palette.
  const styled = new Set([...css.matchAll(/#([a-zA-Z][\w-]*)/g)].map((m) => m[1])
    .filter((x) => !/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(x)));
  const exists = new Set([
    ...[...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]),
    ...[...body.get('web/app.js')!.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]),
    ...[...body.get('web/app.js')!.matchAll(/id = '([\w-]+)'/g)].map((m) => m[1]),
  ]);
  say('styled by id, no element ever carries it', [...styled].filter((i) => !exists.has(i)));
}

// ---- 5. localStorage keys, both directions ----
{
  const app = body.get('web/app.js')!;
  const written = new Set([...app.matchAll(/setItem\('([\w.]+)'/g)].map((m) => m[1]));
  const readK = new Set([...app.matchAll(/getItem\('([\w.]+)'/g)].map((m) => m[1]));
  say('written to localStorage, never read back', [...written].filter((k) => !readK.has(k)));
  say('read from localStorage, never written', [...readK].filter((k) => !written.has(k)));
}

console.log(findings
  ? `\n  ${findings} to look at. None of these is automatically a defect — read each one.\n`
  : '\n  nothing found.\n');
