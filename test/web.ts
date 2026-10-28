// Client modules ship straight to the browser, so a syntax error is a blank page with no
// server-side signal. Check them here rather than by opening a tab.
//
// `node --check` with module input parses without executing — no regex stripping, which is
// how the first version of this test managed to report failures that were its own fault.
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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

// A BACKTICK INSIDE AN HTML COMMENT IN THE MARKUP CLOSES THE TEMPLATE LITERAL IT LIVES IN.
//
// Every panel in `web/app.js` is built inside a template literal, and the house style quotes
// identifiers in backticks — so an explanatory comment written in that style, inside markup, ends
// the string early. It has cost this project five sittings: three on 2026-08-28 and two more on
// 2026-08-29, all of them while writing a comment about the code rather than the code.
//
// It fails a long way from the cause. The parser reports `Missing } in template expression` or
// `Unexpected identifier` at whatever word follows the stray backtick, which is usually well above
// or below the comment that did it, and `src/db.ts` has the same hazard with SQL comments in its
// schema literal — `test/db.ts` has guarded that half since it happened twice. This is the other
// half, and it was missing.
//
// FIRST, ABOVE THE PARSE CHECK BELOW. A stray backtick usually does break parsing, and that
// check then reports `Unexpected identifier` at whatever word follows it — a line a long way
// from the comment that caused it. This one names the comment and its line. It is also the
// wider net: the record from 2026-08-28 has a backtick leaving the file parseable and breaking
// the panel only when it was called, which nothing below would catch at all. Both 2026-08-29
// hits did break parsing — that half is demonstrated, this half is taken from the record.
//
// Scoped to HTML comments on purpose. A backtick in ordinary markup or in a `//` comment outside a
// template literal is fine, and a lint that refused every backtick in the file would refuse the
// language it is written in.
{
  const js = read('web/app.js');
  const bad = [...js.matchAll(/<!--[\s\S]*?-->/g)]
    .filter((m) => m[0].includes('`'))
    .map((m) => `line ${js.slice(0, m.index).split('\n').length}: ${m[0].slice(0, 60)}…`);
  assert.deepStrictEqual(bad, [],
    'a backtick inside an HTML comment closes the template literal that comment lives in, and the '
    + 'panel then renders as nothing at all. Quote identifiers with "double quotes" in markup '
    + 'comments');

  // THE SIBLING BREAK, 2026-09-01. An HTML comment written BETWEEN a tag's attributes ends at its
  // own `-->`, and that `>` closes the TAG — every attribute after it renders as visible text next
  // to the control. It happened to the reading-mode button in the top bar and Seth saw the raw
  // `style="..."` beside the icon.
  //
  // The button lint below cannot see this: its `<button\b[^>]*>` stops at the `>` in `-->`, and the
  // slice it took still held `data-readmode`, so the broken button read as perfectly reachable.
  // Verified red-capable by moving that comment back inside the tag: it names that line and no
  // other. Same net over app.html, where the same markup is written by hand.
  for (const file of ['web/app.js', 'app.html']) {
    const src = read(file);
    const inside = [...src.matchAll(/<[a-zA-Z][^>]*?<!--/g)]
      .map((m) => `${file} line ${src.slice(0, m.index).split('\n').length}`);
    assert.deepStrictEqual(inside, [],
      'an HTML comment between a tag\'s attributes closes that tag at its own terminator, and the '
      + 'rest of the attributes render as text. Put the comment above the tag');
  }
  ok('no HTML comment sits between a tag\'s attributes');

  // AND THE OTHER HALF OF THE SAME MORNING. A comment that QUOTES a comment terminator ends there,
  // and every word after it is drawn on the page. Both breaks put raw markup in the top bar beside
  // the reading-mode button; the check above caught neither, because by the time it runs the file
  // it is reading already parses as a comment that closed early and legally.
  //
  // The tell is what FOLLOWS the close. Every one of the 101 comments across these two files is
  // followed by `<` or by `${` and by nothing else — markup resuming, or a template hole. Anything
  // else means the comment ended in the middle of a sentence, and the sentence is now on screen.
  //
  // THE ALLOWED SET IS EXACTLY THOSE TWO, measured rather than guessed. A first draft of this also
  // allowed a quote character, on the reasoning that a comment might end beside one — and a quoted
  // terminator leaves a quote as the very next character, so the check passed on the broken file it
  // was written for. Verified red-capable afterwards by putting that terminator back: it names that
  // line and no other.
  for (const file of ['web/app.js', 'app.html']) {
    const src = read(file);
    const leaked = [...src.matchAll(/<!--[\s\S]*?-->/g)]
      .filter((m) => {
        const after = /^\s*(\S)/.exec(src.slice(m.index + m[0].length));
        return after != null && after[1] !== '<' && after[1] !== '$';
      })
      .map((m) => `${file} line ${src.slice(0, m.index).split('\n').length}`);
    assert.deepStrictEqual(leaked, [],
      'this HTML comment closes with text still to come — most likely it quotes a comment '
      + 'terminator. Everything after that point renders on the page. Describe the terminator in '
      + 'words instead of writing it');
  }
  ok('no HTML comment closes early and leaks its own words onto the page');
  // #49 · NO BUTTON SAYS IT IS THINKING. The glossary keeps "thinking" off the page: a call that
  // weaves says Weaving, and one that does not says Asking. Read over the whole script, comments
  // included, because a busy word is a string and a comment quoting one is as easy to copy back.
  {
    const busy = [...js.matchAll(/thinking(&hellip;|\u2026|\\u2026)/gi)].map((m) => m[0]);
    assert.deepStrictEqual(busy, [], 'BUSY-WORDS: a busy button says Asking or Weaving, never Thinking');
    // The detector, against the shapes it must catch.
    for (const s of ['Thinking&hellip;', 'thinking\u2026', 'Thinking\\u2026'])
      assert.ok(/thinking(&hellip;|\u2026|\\u2026)/i.test(s), `the detector catches ${s}`);
  }
  ok('no busy button says Thinking');
  // COUNCIL 09 §1 · EVERY MODEL CALL FROM A BUTTON GOES THROUGH ONE IN-FLIGHT GUARD.
  //
  // Four handlers fired a model pass behind a toast and nothing else, on the panel a writer reaches
  // BECAUSE a pass came back blank — so the visitor most likely to press twice. The router does not
  // queue (`.claude/CLAUDE.md`, measured): two concurrent fit, a third kills both with HTTP 500.
  //
  // ASSERTED IN SOURCE AND NOT IN A BROWSER, because proving it in a browser needs a model and this
  // suite deliberately needs none. It is a weaker check than a driver pressing twice and it is the
  // one that can run before every commit. Falsify by unwrapping any one of the five: the handler
  // whose name is dropped is printed, not a count.
  {
    // `spark` and `acceptSpark` joined this list on 2026-08-30, which is the day they became true.
    // They were the two Council 09 §1 flagged and nobody had read, and reading them found no guard
    // at all: a double press on Accept sent two POST /api/stories and created TWO BOOKS. They were
    // deliberately kept OUT of this list while that was so — naming a handler here without reading
    // it is how a check comes to report perfection — and they are in it now because they are fixed.
    // `addshort` joined on 2026-10-22 (#51): adding a remote model makes one probe call to it.
    const guarded = ['summarize', 'extract', 'refinished', 'remember', 'invent',
                     'spark', 'acceptSpark', 'addshort'];
    // A handler may hand its press to one named function, which a weaving refusal's row calls too
    // (`invent` and `inventAgain`, #56): then that function is the one that must hold the guard, and
    // it is read in the handler's place. One hop only, and only for a handler with no api call of
    // its own before it hands off.
    const looseIn = (src: string, names: string[]) => names.filter((k) => {
      const reach = (head: string) => new RegExp(`${head}[\\s\\S]{0,900}?api\\.\\w+\\(`).exec(src)?.[0];
      const hop = new RegExp(`if \\(d\\.${k}[^\n]*\\) \\{[^{}]*?return (\\w+)\\([^;]*;\\s*\\}`).exec(src);
      const m = hop && !/api\.\w+\(/.test(hop[0]) ? reach(`async function ${hop[1]}\\(`) : reach(`if \\(d\\.${k}[^\n]*\\)`);
      return !m || !/whileWorking\(/.test(m);
    });
    // The detector, both directions of the hop: a handler that hands its press to a function with
    // no guard is caught, and one whose function holds the guard is not.
    const hopTo = (body: string) => `if (d.invent) { return inventAgain(d.invent); }\n`
      + `async function inventAgain(k, t) {\n${body}\n}`;
    assert.deepStrictEqual(looseIn(hopTo('  const r = await api.invent(k);'), ['invent']), ['invent'],
      'HOP-DETECTOR: a hop to a function that calls the model with no whileWorking is caught');
    assert.deepStrictEqual(looseIn(hopTo('  const r = await whileWorking(t, "Writing", () => api.invent(k));'), ['invent']), [],
      'HOP-DETECTOR: and a hop to one that holds the guard is not');
    const loose = looseIn(js, guarded);
    assert.deepStrictEqual(loose, [],
      'a button that calls the model must go through whileWorking(), or a second press is a second '
      + 'request and the router answers 500 rather than queueing');
    ok(`${guarded.length} model calls from a button, every one behind the in-flight guard`);
  }

  // #28 · THE WIZARD GUARDS ITS OWN, THROUGH STATE RATHER THAN THROUGH whileWorking().
  //
  // Two idioms, and which one is right depends on whether the panel repaints mid-call. The wizard
  // repaints — every one of these calls ends in paint() — so a disabled attribute written by
  // whileWorking would be thrown away by the next render. They hold a flag on S.spark instead and
  // return early on re-entry, and the button reads that flag for its own disabled state.
  //
  // `spark` AND `acceptSpark` ARE DELIBERATELY NOT ON THIS LIST, and that is not an oversight to be
  // tidied by adding them. Both were read on 2026-08-30 answering docs/checklist.md's open item:
  // NEITHER GUARDS. A double press on "Accept and start writing" sends two requests and creates two
  // stories. Naming them here would make this check report perfection over a live defect, which is
  // the exact failure that item was written about. They belong in the list on the day they are
  // fixed and not before.
  //
  // IT LOOKS FOR THE EARLY RETURN, NOT FOR THE FLAG. The first version of this check searched the
  // window for `S.spark.<flag>` and passed with the guard deleted, because the line that SETS the
  // flag two statements later matched it just as well. Falsified by unwrapping `sprecast`: it
  // stayed green. A check that cannot go red is decorative.
  {
    const spark: [string, string][] = [
      ['spwritecast', 'if (d.spwritecast) {'],
      ['spreroll', 'if (d.spreroll) {'],
      ['spreview', 'if (d.spreview) {'],
      ['sprecast', 'if (d.sprecast !== undefined) {'],
      // Its handler is one line and delegates; the guard lives in the function, with the call.
      ['spstyle', 'async function sparkStyle('],
      // #40 stage 2. One field of the skeleton, asked again — same rule, same reason: this panel
      // repaints, so the guard has to be state rather than a disabled attribute.
      ['spfield', 'if (d.spfield) {'],
    ];
    const loose = spark.filter(([k, start]) => {
      const at = js.indexOf(start);
      if (at < 0) return true;
      const call = js.indexOf('api.', at);
      if (call < 0) return true;
      return !/if \([^)]*S\.spark[^)]*\) return;/.test(js.slice(at, call));
    }).map(([k]) => k);
    assert.deepStrictEqual(loose, [],
      'a wizard button that calls the model must return early while one of its own calls is in '
      + 'flight — the router does not queue, and this panel repaints, so the guard has to be state');
    ok(`${spark.length} model calls in the wizard, every one guarded through S.spark`);
  }

  // #28 · "WHERE THIS IS GOING" STAYS GONE. It was on two panels and in four prompts, and it came
  // out of all of them on 2026-08-30 — Seth: "no ones going to use it. ive asked."
  //
  // The column was dropped on 2026-10-25. test/engine.ts asserts the prompt half from the other
  // end — a story carrying a destination whose SPINE does not.
  {
    const surfaces = [...js.matchAll(/data-(?:story|sp|bf)="direction"/g)].map((m) => m[0]);
    assert.deepStrictEqual(surfaces, [], 'no surface may offer the destination field again');
    assert.ok(!/'direction'/.test(read('web/model.js')),
      'and STORY_FIELDS must not list it, or the Story panel grows the box back');
    ok('the destination field is gone from every surface');
  }

  // COUNCIL 09 §7 · NOTHING IN THE APP IS SMALLER THAN 11px. The floor was 9.5px in all-small-caps
  // — roughly a 7px x-height — on the chip that says what a proposal IS. The UI-scale control is a
  // per-device escape hatch and not an answer to a default nobody can read.
  {
    const tiny = [...(js + read('app.html') + read('web/model.js') + read('web/help.js'))
      .matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => Number(m[1])).filter((n) => n < 11);
    assert.deepStrictEqual(tiny, [], 'type below the 11px floor');
    ok('no type in the app is set below 11px');
  }

  /* EVERY LABEL STILL HAS ITS CONTROL — added 2026-09-03, during the sweep that made it necessary.
   *
   * Folding an explanation means rewriting the three lines around a control: the label gets a mark,
   * a card goes above it, and the old sentence under it is deleted. Delete one line too many and
   * the CONTROL goes with it — the label renders, the panel renders, every suite passes, and the
   * box is simply not there. That happened twice while this sweep was being done and both times it
   * was caught by reading the diff, which is not a method.
   *
   * Asserted as a source-level pairing because `for` and `id` are often written from the same
   * template expression — `f-story-${'$'}{f.k}` on both sides — so comparing the strings catches a
   * deleted control without needing to render every screen the app has.
   *
   * The suite already checks the other direction: that every field HAS a name. That check passes
   * happily when the field is gone, because a field that does not exist is not unnamed. */
  {
    const both = js + read('app.html') + read('web/model.js');
    const fors = new Set([...both.matchAll(/\sfor="([^"]+)"/g)].map((m) => m[1]));
    const ids = new Set([...both.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const orphans = [...fors].filter((f) => !ids.has(f));
    assert.deepStrictEqual(orphans, [],
      `label(s) pointing at a control that is not there: ${orphans.join(', ')}`);
    assert.ok(fors.size > 15, `and the scan really found labels — ${fors.size} of them`);
    ok(`every label points at a control that exists (${fors.size} of them)`);
  }

  /* ONE SPELLING OF THE LABEL STYLE — Seth, 2026-09-03: "the labels are all weird lets make it all
   * caps locked instead."
   *
   * The app has now worn three: `all-small-caps`, then `small-caps` for one round, now real
   * capitals. `text-transform:uppercase` is the one that stands, and the two it replaced must be
   * gone rather than merely outnumbered — the style is written inline in web/app.js at two dozen
   * call sites as well as in the stylesheet, so the failure is never one label looking wrong. It is
   * somebody adding a twenty-sixth next month with an old value copied off the line above it, and
   * two spellings living side by side for months. Nothing about a screenshot catches that.
   *
   * AND THE RESETS COUNT AS THE STYLE. Two rules exist to take the treatment OFF something — the
   * open list of names under the composer, and the first-run buttons that read as sentences. Both
   * named the old property, which stopped undoing anything the moment the style moved. A leftover
   * mention anywhere in the CSS is either a label that did not move or a reset that no longer
   * resets, and both are worth a red. (The old property is spelled only inside the regexes below —
   * this scan reads those files as text, and a name in a comment counts as a rule.) */
  {
    const both = js + read('app.html') + read('web/model.js') + read('web/help.js');
    const old = [...both.matchAll(/font-variant-caps:\s*(?!normal)/g)].length;
    assert.strictEqual(old, 0,
      `${old} label(s) still use font-variant-caps — the app uppercases with text-transform now`);
    const stale = [...both.matchAll(/font-variant-caps:\s*normal/g)].length;
    assert.strictEqual(stale, 0,
      `${stale} reset(s) still undo font-variant-caps, which no longer sets the label style`);
    // AND THE STYLE IS ACTUALLY THERE. A check for an absence passes just as well when the property
    // has been deleted everywhere, which would be labels in plain sentence case — a different bug
    // that the two assertions above would call success.
    //
    // `.lbl` IS NAMED, not just counted. A total across both files was the first version of this and
    // it survived deleting the property from every rule in app.html, because two dozen inline copies
    // in web/app.js kept the number up — so the one rule every heading in the app hangs off could
    // have gone and the check would still have been green. Breaking it on purpose is what showed
    // that; the count stays as the second half, for the inline ones.
    const sheet = read('app.html');
    assert.match(sheet, /\.lbl\s*\{[^}]*text-transform:\s*uppercase/,
      'the .lbl rule itself must set it — every heading in the app hangs off that one rule');
    const kept = [...both.matchAll(/text-transform:\s*uppercase/g)].length;
    assert.ok(kept > 20, `and the labels really are capitalised — found ${kept}`);

    /* THE TWO EXCEPTIONS, PINNED. Seth, 2026-09-03: "everything should be upper cased. except the
     * menu and the info." Both are places a sweep would naturally catch next time — the rail's
     * Chapters heading looks exactly like a label, and the info card's title IS one — so the
     * exception has to be written down somewhere a future sweep runs into. Here is that place.
     *
     * The rail's rows were never uppercased and are not asserted: there is nothing to keep them
     * from, and an assertion about markup that has never had the property is one that cannot fail. */
    // The heading's style moved into the `.railhead` rule on 2026-10-27; the check reads it there.
    assert.match(js, /<div class="txt railhead">Scenes<\/div>/, "the rail's Scenes heading is still drawn");
    const railHead = read('app.html').match(/\.railhead \{[^}]*\}/)?.[0] ?? '';
    assert.ok(railHead, "and its rule is in the stylesheet");
    assert.doesNotMatch(railHead, /uppercase/,
      "the rail is the menu, and the menu is excepted — its Chapters heading stays as written");
    // THE TITLE'S OWN STYLE, matched exactly rather than a window of characters after `tipCard`.
    // The first version sliced 460 chars from the function name, and the comment explaining the
    // exception is itself about that long — so the window stopped short of the line it was meant to
    // read and the check passed with the title uppercased. Breaking it on purpose is what showed
    // that, and a fixed window is the wrong tool whenever a comment can grow.
    // A BUTTON IS NOT A LABEL, and that is the third exception. `.lbl`, `.kind`, `.tag` and `.up`
    // name things in two or three words; a button says what will happen, often in a sentence, and
    // capitals strip the word-shape that makes a sentence readable at a glance.
    // EVERY `.btn {` RULE, not the first one found. There are three of them and the first in the
    // file is a transitions block with no case property at all — matching one and reading it meant
    // the check passed with the real rule uppercased. Caught by breaking it on purpose.
    const btnRules = [...sheet.matchAll(/\.btn \{[^}]*\}/g)].map((m) => m[0]);
    assert.ok(btnRules.length >= 2, `the .btn rules are still there — found ${btnRules.length}`);
    for (const r of btnRules)
      assert.doesNotMatch(r, /text-transform:\s*uppercase/,
        `a button reads as a sentence, so it is not uppercased: ${r.slice(0, 60)}`);

    const tipTitle = js.match(/<div style="([^"]*)">\$\{esc\(title\)\}<\/div>/)?.[1] ?? null;
    assert.ok(tipTitle, 'the info card still draws its title');
    assert.doesNotMatch(tipTitle!, /uppercase/,
      'an info card is prose, and its title is the first line of it — not another label shouting');

    // AND THE TWO HEADING SHAPES THAT ARE NOT `.lbl`, named because the count above cannot see them:
    // a fold's <summary> and the next-chapter step chips. Both were missed by the first sweep for
    // the same reason — they are labels that do not carry the class every other label carries.
    assert.match(sheet, /details\.fold > summary \{[^}]*text-transform:\s*uppercase/,
      "a fold's heading is a label too — Over time, Brings in with it, Another book");
    assert.match(js, /data-setupstep="\$\{k\}"[\s\S]{0,220}text-transform:uppercase/,
      'and so are the next-chapter step chips');
    ok(`every label is set in real capitals, one spelling (${kept}), menu and info excepted`);
  }

  /* THE MARGIN RULES ARE THICK ENOUGH TO TELL APART. Seth, 2026-09-01: "the lines beside the text
   * the accented ones are 2px too thin its hard to differentiate."
   *
   * Asserted as a FLOOR on every accent rule rather than on one of them: there are four — your own
   * line, a spoken one, a directed one, and the four mode colours — and thickening three of them is
   * the version of this fix that looks done and still has a hairline in it. The colours differ from
   * each other by lightness in several themes, which is exactly when width does the work. */
  {
    const css = read('app.html');
    const thin = [...css.matchAll(/\.block\.[a-z-]+[^{]*\{[^}]*border-left:\s*(\d+)px[^}]*\}/g)]
      .filter((m) => Number(m[1]) < 3).map((m) => m[0].replace(/\s+/g, ' ').slice(0, 70));
    const group = /\.block:is\([^)]*\)\s*\{[^}]*border-left:\s*(\d+)px/.exec(css);
    if (group && Number(group[1]) < 3) thin.push(group[0].replace(/\s+/g, ' ').slice(0, 70));
    assert.deepStrictEqual(thin, [],
      'an accent rule down the margin is under 3px, which is the width that made them hard to tell '
      + 'apart in the first place');
    ok(`every margin accent is at least 3px`);

    /* AND A PRESSABLE THING IS NOT ON `--edge`. Seth, 2026-09-01: "continue is missing a border i
     * believe" — measured in a browser it was not missing, it was `--edge` on a near-black page and
     * read as absent. `.btn.ghost`, `.chip`, the trays and the sheets are all on `--chip`; the two
     * buttons under the last passage were the only pressable things a step dimmer than that.
     * `--edge` keeps the large surfaces it was chosen for, so this names the button rules rather
     * than banning the token. */
    const dim = [...css.matchAll(/(\.carry button|\.btn\.ghost|\.chip)\s*\{[^}]*border:\s*1px solid var\(--edge\)/g)]
      .map((m) => m[1]);
    assert.deepStrictEqual(dim, [],
      'a button is bordered with --edge, which is a step dimmer than every other pressable thing '
      + 'in the app and reads as having no border at all');
    ok('no pressable control is bordered with the dimmest token');

    /* EVERY PRESS THAT WRITES A PASSAGE HAS AN ACCENT, and there are FIVE of them. Seth,
     * 2026-09-01: "everything else has a colored border but not continue."
     *
     * It was a hole rather than a decision. The class is chosen from `MODES`, which is the composer's
     * four BUTTONS — Continue is a press beside them rather than one of them, so the passage it
     * writes fell through and got no mark at all. It is also the most common passage in a book, so
     * the one shape with nothing down its margin was the one you see most.
     *
     * WALKED IN EVERY DIRECTION, because this broke by being three things that had to agree and were
     * not asserted together: the colour is derived in `themeVars`, the rule that reads it is in the
     * stylesheet, and the class is written in `web/app.js`. Any one of them alone is a mark that
     * does not appear. */
    const PRESSES = ['speak', 'act', 'direct', 'narrate', 'continue'];
    // The rule that turns `--m` into the line down the margin. Anchored on `.block:is(` so it cannot
    // pick up the newest-passage ring, which is a different selector with the same shape.
    const accentGroup = /(?:^|\n)\.block:is\(([^)]*)\)/.exec(css)?.[1] ?? '';
    const vars = read('web/model.js');
    const missing: string[] = [];
    for (const k of PRESSES) {
      if (!vars.includes(`'--m-${k}'`)) missing.push(`themeVars has no --m-${k}`);
      // MATCHED ON THE DECLARATION, not on `.block.m-X`. The accent had to reach the two buttons
      // under the last passage as well on 2026-09-02, so the selector became
      // `:is(.block, .carry).m-X` and this went red over a rule that had only moved. What makes a
      // rule an accent rule is that it sets --m to that press's colour.
      if (!new RegExp(`\\.m-${k}\\s*\\{\\s*--m:\\s*var\\(--m-${k}\\)`).test(css))
        missing.push(`no rule reads --m-${k}`);
      // THE GROUP ITSELF, extracted, not "the token appears somewhere in the file". Matching it
      // loosely found the ring's own `.m-continue)` twelve lines below and reported the group as
      // covered while it was not — caught by deleting it and watching this stay green.
      if (!accentGroup.includes(`.m-${k}`)) missing.push(`.m-${k} is not in the accent group`);
    }
    assert.deepStrictEqual(missing, [],
      'a press that writes a passage has no accent down its margin, which is how Continue went '
      + 'unmarked for as long as it did');
    // AND THE NEWEST PASSAGE'S RING FOLLOWS THE SAME LIST, or the accent vanishes for the one
    // passage a writer is looking at hardest.
    // The passage being written inline shares the rule, so it lands in the box it was written in.
    const ring = /#col :is\(\.block\.newest, #ghost\.inlive\):is\(([^)]*)\)/.exec(css)?.[1] ?? '';
    for (const k of PRESSES) {
      assert.ok(ring.includes(`.m-${k}`), `the newest passage's ring does not cover ${k}`);
    }
    ok(`all ${PRESSES.length} presses carry an accent, in the theme, the rule and the ring`);
  }

  const comments = (js.match(/<!--[\s\S]*?-->/g) ?? []).length;
  assert.ok(comments > 20, `expected the markup comments to be found (${comments})`);
  ok(`${comments} html comments in the markup, none carrying a backtick`);
}

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
  // `chapters` joined on 2026-09-02, directly after `chapter` — Seth: "instead of the chapter list
  // being where it is make it it's own panel." Chapter is the one you are IN and Chapters is all of
  // them, so they sit together and in that order.
  assert.deepStrictEqual(snav,
    ['story', 'chapter', 'chapters', 'search', 'threads', 'waiting', 'strings', 'anansi', 'context', 'teller'],
    'the panels in the order Seth asked for. Since 2026-10-27 Tale is first and the rest go by theme: '
    + 'the writing, what the tale remembers, Anansi, the model. Search was first from 2026-08-27.');

  // Opened by clicking a thing rather than by a nav row. Each is asserted to have a real opener,
  // so this list cannot become a dumping ground for panels nothing reaches.
  //
  // `anansi` joined them on 2026-08-27: it came off the rail and onto the composer row, so its
  // door is a `data-panel` button rather than a nav row. The opener asserted here is that button —
  // a panel in this list without one is exactly the unreachable-feature failure the list exists
  // to prevent, and "it used to be in the rail" is not an opener.
  // `setup` moved from an assignment to a BUTTON on 2026-08-28, when `fa9a631` gave the ritual a
  // screen of its own: before that the close teleported you to setup and there was no report to
  // land on. BOTH are true again since Council 07 — the close assigns `S.panel = 'setup'`, because
  // the verb pressed was END and what follows ending a chapter is starting one, AND the report
  // keeps a button back to it. The BUTTON is what is asserted, for the reason spelled out below:
  // it is the stronger of the two and an assignment can be added without a door existing.
  // `ritual` is the chapter's own screen, opened from the Chapter panel's door and from the row at
  // the top of setup that says what the close found.
  const byClick = { entry: /S\.panel = 'entry'/, history: /S\.panel = 'history'/,
                    setup: /<button class="btn ghost(?: [^"]*)?" data-panel="setup"/,
                    ritual: /S\.panel = 'ritual'/,
                    // #25. Its door is a row in the rail's model list, which is why the opener is
                    // `data-modelinfo` and not `data-panel`: the row has to say WHICH model, and a
                    // panel that opened on whatever was already selected would be the wrong one
                    // every time you pressed a row that was not the current model. In the BUTTON
                    // form for the reason spelled out above — app.js explains this panel in a
                    // comment, and a check that matches its own documentation is decorative.
                    model: /<button data-modelinfo=/,
                    // #51. Its door is the last row of the same list, and its handler names it.
                    findmodel: /<button data-findmodel="1"[\s\S]*S\.panel = 'findmodel'/,
                    // #76. A button in Tale → Keep.
                    updates: /<button[^>]* data-panel="updates"/,
                    // Account → Your books (2026-10-27): Import, Export and What you have written
                    // left the menu for Account, and their doors are buttons there.
                    import: /<button class="card plate full-left" data-nav="import">/,
                    forge: /<button class="card plate full-left" data-nav="forge">/,
                    prefs: /<button class="card plate full-left" data-nav="prefs">/ };
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
    // #74: on the Workbench deck, as an upkeep card (`upkeepCards`), since upkeep became cards.
    const w = js.slice(js.indexOf('function upkeepCards() {'), js.indexOf('\n}\n', js.indexOf('function upkeepCards() {')));
    assert.match(w, /<button class="btn(?: [^"]*)?" data-unretire="/,
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
    // Per checkout, the same name `test/ui/run.sh` derives from the checkout's real path.
    const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
    const RESULTS = process.env.ANANSI_UI_RESULTS
      ?? `/tmp/anansi-ui-results-${createHash('sha256').update(root).digest('hex').slice(0, 8)}.json`;
    const scenarios = readdirSync(new URL('./ui/', import.meta.url))
      .filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort();
    let rec: Record<string, any> | null = null;
    try { rec = JSON.parse(readFileSync(RESULTS, 'utf8')).scenarios ?? {}; } catch { rec = null; }

    if (!rec) {
      console.log(`  note  the browser harness has never run on this machine —`
        + ` ${scenarios.length} scenarios unaccounted for (test/ui/run.sh)`);
    } else {
      // ONLY SCENARIOS THAT STILL EXIST. The record outlives a deleted scenario file, so "delete the
      // scenario and say why" (the message below) left its red in place for ever: a scratch probe
      // deleted on 2026-10-26 failed this suite with no file left to rerun. Gone is a note, not a corpse.
      const gone = Object.keys(rec).filter((n) => !scenarios.includes(n));
      if (gone.length) console.log(`  note  recorded but no longer a scenario: ${gone.join(', ')}`);
      const dead = Object.values(rec).filter((r: any) => scenarios.includes(r.name) && (r.died || r.red > 0))
        .map((r: any) => `${r.name} (${r.died ? `died after ${r.ok} ok` : `${r.red} red`})`);
      const never = scenarios.filter((n) => !rec![n]);
      // Staleness against the surface itself: change app.js and every recorded result is a
      // statement about a version of the app that no longer exists.
      const appAt = Math.floor(statSync(new URL('../web/app.js', import.meta.url)).mtimeMs / 1000);
      const stale = Object.values(rec).filter((r: any) => scenarios.includes(r.name) && r.at < appAt).map((r: any) => r.name);
      if (never.length) console.log(`  note  never run here: ${never.join(', ')}`);
      if (stale.length) console.log(`  note  older than web/app.js: ${stale.join(', ')}`);
      assert.deepStrictEqual(dead, [],
        `the browser harness recorded ${dead.length} broken scenario(s): ${dead.join(', ')}. `
        + `A recorded death is a known corpse being carried — fix it, or delete the scenario and `
        + `say why. Re-run test/ui/run.sh to clear this.`);
      ok(`the browser harness recorded ${Object.keys(rec).length} scenario(s), none broken`);
    }
  }

  // #29's weave check is GONE, with the thing it guarded. It asserted that `solve()`'s hold
  // outlasted `--t-weave`, so the ANANSI resolve could be seen before the veil left. The six-by-
  // eleven grid was removed on 2026-09-02 — the glyphs are a field where the prose lands now, and a
  // field with no columns cannot spell down one — so `solve()` and the resolve went with it.
  //
  // Deleted rather than repointed, deliberately. A check kept alive over a removed feature is a
  // reason to keep dead code, and the next person to read it learns about a resolve that does not
  // happen. What replaced it is asserted where it can actually fail: `test/ui/veil.js` drives a
  // real generation and measures the glyph field being consumed by the words.

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
  assert.match(llama, /if \(!allowed\(id\)\)/, 'checkModel refuses anything off the list');
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
    // Issue #34, 2026-08-31. Seth: "Name a worl and it's button should be removed from threads."
    // The strip that made a world book is off the Threads page and nothing replaced it, at his
    // call — PARKED, not deleted, so that bringing it back is one function rather than a route, a
    // method and a screen. Everything underneath still works: `POST /api/world` is live, existing
    // world books draw on Threads and keep their tag, and `storyFollowing` never cared whether the
    // book it follows is one. What has no door is making a NEW one.
    newWorld: 'issue #34: the Name-a-world strip came off Threads and nothing replaced it (2026-08-31)',
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
// ---- THE GENERATION PERSISTS ONLY WHEN A WRITER IS WATCHING (bugs.md #9, 2026-09-01).
//
// `generate()` lands the passage itself now, unclaimed, so a browser that goes away does not lose it.
// That write MUST be gated on `onDelta` — present exactly when a writer is streaming — because every
// harness in `bench/` calls POST /api/generate NON-streaming, hundreds of times, and never accepts.
// Ungated, F51 through F55 would each append 650 passages to the one story they measure and the arm
// would be writing its own book underneath the measurement.
//
// STRUCTURAL, and that is stated rather than hidden: driving the real route needs a live model, which
// test/all.ts must not require. So this asserts the SHAPE of the guard. It is weaker than a
// behavioural check and it is the strongest thing available without llama-server — and the invariant
// is worth a weak check, because the failure is silent and corrupts findings rather than crashing.
{
  const src = read('src/routes.ts');
  const i = src.indexOf('let landed: string | null = null;');
  assert.ok(i > 0, 'the persist block has moved — find it and re-point this check');
  const block = src.slice(i, i + 900);
  assert.match(block, /if \(onDelta && prose\.trim\(\)\)/,
    'the persist is gated on onDelta — without it every bench run appends to the story it measures');
  // And the row it writes must be unclaimed, or the writer never gets offered it.
  assert.match(block, /claimed: false/, 'and it lands unclaimed');
  // The non-streaming path must reach no db write of its own inside generate.
  const before = src.slice(src.indexOf('async function generate('), i);
  assert.doesNotMatch(before, /db\.addPassage\(/,
    'nothing in generate writes a passage before the guarded block');
  ok('a generation persists only when a writer is streaming, and lands unclaimed');
}

/* A LIT BUTTON SAYS IT IS LIT (2026-09-01). Fourteen button groups drew a selected state as a
 * colour and told a screen reader nothing, so which theme, which kind, which view was chosen was
 * visible and not readable.
 *
 * THE ATTRIBUTE MUST REUSE THE CONDITION THE COLOUR USES, and that is the actual check here rather
 * than "has an aria-pressed". Adding these, I wrote `S.loreKind` for the lore chips where the style
 * reads `S.lore.kind` — a field that does not exist. The attribute would have been permanently
 * false under a button that looked lit, which is worse than no attribute: it states the opposite of
 * what is on screen, confidently. Caught by reading each tag against its own style, not by any test,
 * which is why there is now a test.
 *
 * Scoped to the five that were fixed. A sixth group added later will not be caught by this, and that
 * is honest rather than ideal: the general form needs a parser, and a regex over markup is what
 * BUILD-STATE 3b warns about ("Do not audit a surface with a pattern; read the object").
 */
{
  const js = read('web/app.js');
  // The third column is the literal the tag opens with, for the groups whose key is not `${k}`.
  // Added 2026-09-01 with two more groups, which is the extension the note above said this check
  // would not catch on its own — so it was widened rather than left to be honest about a gap.
  const groups: [string, string, string?][] = [
    ['theme', 'look.theme'],
    ['ctxview', 'S.ctxView'],
    ['setupkind', 'kind'],
    ['lorekind', 'kind'],
    ['spkind', 'on'],
    // The outfit chips under a character on the Threads list. Worn is a BORDER COLOUR and the label
    // is the coat's name either way, so aria is the only place the state can live.
    ['wear', 'o.active', '<button data-wear="${e.id}:${o.id}" class="tag"'],
    // The cross-book thread picker: chosen is a border and a background, and nothing in the label.
    ['seedpick', 'on', '<button data-seedpick="${esc(e.id)}"'],
  ];
  const wrong: string[] = [];
  for (const [key, state, open] of groups) {
    const at = js.indexOf(open ?? `<button data-${key}="\${k}"`);
    if (at < 0) { wrong.push(`${key}: tag not found — re-point this check`); continue; }
    const tag = js.slice(at, at + 420);
    const press = /aria-pressed="\$\{([^}]+)\}"/.exec(tag);
    if (!press) { wrong.push(`${key}: no aria-pressed`); continue; }
    // The state the COLOUR is decided by has to be the state the attribute is decided by. Compared
    // on the identifier rather than the whole expression, because `a === b` and `b === a` are both
    // written in this file and both are correct.
    if (!press[1].includes(state)) wrong.push(`${key}: aria-pressed reads ${press[1]}, colour reads ${state}`);
  }
  assert.deepStrictEqual(wrong, [],
    'a button group\'s aria-pressed must be decided by the same state its colour is, or it tells a '
    + 'screen reader the opposite of what is on screen');
  ok(`${groups.length} button groups say which one is chosen, from the state that colours them`);
}

/** EVERY FIELD IN THE APP HAS A NAME, and this is the check that keeps it that way.
 *
 *  `<label class="lbl">Spice</label>` followed by a select LOOKS labelled and is not: with no
 *  `for`/`id` there is nothing joining them, so the control has no accessible name and tapping the
 *  word does not focus it. Sixty-eight controls were in that state on 2026-09-01. Three ways to be
 *  named, and all three count:
 *
 *    - `aria-label` on the control — for the boxes with no visible label at all
 *    - `id` matched by a `for` somewhere in the file — the pairing, for the ones that do
 *    - WRAPPED in a label — `<label><input type="checkbox"> Hold them back</label>` needs neither,
 *      and every checkbox in this app is written that way
 *
 *  THE POINT IS THE REGRESSION, not the sixty-eight. Fixing them once is an afternoon; the next
 *  control arrives unnamed unless something refuses it, and nothing did. So this asserts an empty
 *  list rather than a count going down.
 *
 *  COMMENTS ARE STRIPPED FIRST, and that is not tidiness: two of the sixty-eight were the word
 *  select inside a `//` comment explaining how a picker works, and a checker that reports those
 *  teaches you to skim its output.
 *
 *  IT DOES NOT CHECK THAT IDS ARE UNIQUE, and that is deliberate rather than missing. `seedq` and
 *  `idea` each appear twice — the wizard and the blank-book form, the two halves of the create page
 *  — and only one of the two is ever mounted, which the note at the `idea` box already states. The
 *  helper ids look duplicated too (`f-sp-${k}` three times) and are the input, textarea and select
 *  branches of one helper, of which exactly one renders per key. Asserting uniqueness here would
 *  need to know which screen is mounted, so it would report four things that are fine. */
{
  const raw = read('web/app.js');
  // Blank out comments, keeping the byte count so reported line numbers stay true.
  const blanked = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const fors = new Set([...raw.matchAll(/\bfor="([^"]+)"/g)].map((m) => m[1]));
  const nameless: string[] = [];
  for (const m of blanked.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m.group?.[0] ?? m[0];
    if (/type="(hidden|file)"/.test(tag)) continue;
    if (/aria-label(?:ledby)?="/.test(tag)) continue;
    const id = /\bid="([^"]+)"/.exec(tag);
    if (id && fors.has(id[1])) continue;
    // Wrapped? A label that opens before this control and closes after it names it.
    const open = blanked.lastIndexOf('<label', m.index!);
    const shut = open < 0 ? -1 : blanked.indexOf('</label>', open);
    if (open >= 0 && shut > m.index!) continue;
    const line = raw.slice(0, m.index!).split('\n').length;
    nameless.push(`line ${line}: ${tag.replace(/\s+/g, ' ').slice(0, 96)}`);
  }
  assert.deepStrictEqual(nameless, [],
    'these controls have no accessible name: no aria-label, no id paired to a for=, and not wrapped '
    + 'in a label. A visible word above a box is not a label unless something joins them');
  ok(`every field in the app has a name — aria-label, a paired for/id, or a wrapping label`);
}
/** A CARD PULLED OFF THE WEB IS NOT AN INVENTION, and the prompt is what carries that (2026-09-02).
 *
 *  Seth asked for threads from an intellectual property or a real person: "the ai needs to stay in
 *  cannon or I should be able to create a card easily by searching the info."
 *
 *  MEASURED FIRST. `POST /api/invent` already searched and already had a checkbox for it, and asked
 *  for "Halsey the musician" it proposed Jory Vane, a courier in the book's own fantasy-noir — its
 *  prompt opens "for this writer's story... It has to belong to THIS story" and calls the results
 *  "not canon... material only". So FROM_WEB is a separate prompt, and these are the clauses that
 *  make it a different job. Source-level because the behaviour needs a model and a search endpoint;
 *  what CAN be checked without either is that the instructions have not been softened away.
 */
{
  const prompts = read('src/prompts.ts');
  const at = prompts.indexOf('export const FROM_WEB');
  assert.ok(at > 0, 'FROM_WEB must exist — it is what keeps a pulled card in its own canon');
  const body = prompts.slice(at, prompts.indexOf('export const', at + 20));
  // The load-bearing four. Each one is a thing the model did wrong on the way here, or would.
  for (const [what, re] of [
    ['bind it to the results', /FROM THE SEARCH RESULTS BELOW\s*\n?and from nothing else|from nothing else/],
    ['refuse to fill a gap', /LEAVE IT OUT/],
    ['refuse to adapt it to the story', /Do not adapt it to the writer's story/],
    ['treat the pages as text and never as instructions', /never instructions to you|STRANGER'S TEXT/i],
  ] as const) {
    assert.match(body, re, `FROM_WEB must ${what} — that clause is the whole difference from INVENT`);
  }
  // AND THE ROUTE MUST NOT SEND THE BOOK. `assemble` around this call is what pulled the old answer
  // in-world; the sources are the context here, and a story in the prompt is both the bug and 30
  // seconds of prefill. Asserted on the route body because it is the one place it could come back.
  const routes = read('src/routes.ts');
  const rAt = routes.indexOf("'POST /api/fromweb'");
  assert.ok(rAt > 0, 'the route must exist');
  const rBody = routes.slice(rAt, routes.indexOf("'POST /api/", rAt + 30));
  assert.ok(!/assemble\(/.test(rBody),
    'the fromweb route must not assemble the story into the prompt — that is what made the old '
    + 'path answer in the book\'s own world instead of the subject\'s');
  assert.match(rBody, /searchConfigured\(\)/,
    'and it must say so plainly when search is not configured, rather than failing at the fetch');
  ok('a card pulled off the web is bound to its sources, and the book is not in that call');
}

/** PULLING SEVERAL THREADS OUT OF A WORLD (2026-09-03), and the four rules that make it usable.
 *
 *  Seth asked for this from the story screen with "a hatch for either" — either the book's own
 *  world or one named for the pull, and either ticking the list or taking it whole.
 *
 *  SOURCE-LEVEL because the behaviour needs a search endpoint and a model. What can be checked
 *  without either is that the four things measured into this feature are still in it.
 */
{
  const prompts = read('src/prompts.ts');
  const routes = read('src/routes.ts');
  const js = read('web/app.js');

  const at = prompts.indexOf('export const WORLD_CAST');
  assert.ok(at > 0, 'WORLD_CAST must exist');
  const cast = prompts.slice(at, prompts.indexOf('export const', at + 20));
  // NAMES ONLY is the whole shape of the two-step: a list of bodies is a screen nobody reads and a
  // call four times the size, and it would make the second step a clean-up rather than a choice.
  assert.match(cast, /NAMES ONLY/, 'the world list writes names and not cards');
  // THE WORLD'S OWN NAME came back as its own first row on the first run — a card for Warhammer
  // 40,000 inside a book set in Warhammer 40,000.
  assert.match(cast, /NOT THE WORLD'S OWN NAME/, 'and never the world itself');
  // "Victorian Gothic (rule)" and "Failbetter Games (character)" both came back before this clause.
  assert.match(cast, /NOT A GENRE AND NOT A PRODUCT/, 'and not a genre or a product');

  const rAt = routes.indexOf("'POST /api/world/cast'");
  assert.ok(rAt > 0, 'the route must exist');
  const rBody = routes.slice(rAt, routes.indexOf("'POST /api/", rAt + 30));
  // MEASURED: a world's name is a product's name, so bare returns the shop — Amazon for Warhammer,
  // Steam and GOG for Sunless Sea, IMDb for Dune. With "wiki" all three land on the fandom wikis.
  assert.match(rBody, /webSearch\(`\$\{world\} wiki`/,
    'the world list searches for the wiki, or it lists the merchandise');
  // IT WRITES NOTHING. That is what makes the second step a choice; a route that proposed here
  // would put six cards in the queue before the writer had seen the list.
  assert.ok(!/addProposal|upsertEntry/.test(rBody),
    'the world list must write nothing at all — the writer picks, and the pull writes');

  // ONE AT A TIME. F13: the model has two slots and oversubscribing the shared cache does not
  // queue, both requests die with an HTTP 500. Six pulls in parallel would be six failures, so the
  // loop is sequential and this is the check that keeps it that way.
  const loop = js.slice(js.indexOf('if (d.worldpull)'), js.indexOf('if (d.fromweb)'));
  assert.ok(loop.length > 200, 'the pull loop must be findable');
  // MATCHED WITH ITS PARENTHESIS. Without it this caught the loop's own comment, which says "a
  // Promise.all here would turn six pulls into six failures" — a check failing on the sentence
  // explaining why the thing it forbids is forbidden.
  assert.ok(!/Promise\.all(?:Settled)?\s*\(/.test(loop),
    'the world pull must stay sequential — F13, two slots, and a parallel batch dies with 500s');
  assert.match(loop, /for \(const f of want\)/, 'which is what a plain loop over the ticked ones is');
  ok('the world list names things, writes nothing, searches the wiki, and pulls one at a time');
}


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
  // #80: five kinds since Places split out of Lore.
  assert.ok(engineKinds.length === 5 && schemaKinds.length === 5,
    `parsed ${engineKinds.length} engine kinds and ${schemaKinds.length} schema kinds; both are 5`);
  assert.deepStrictEqual([...schemaKinds].sort(), [...engineKinds].sort(),
    'the extraction schema and the engine disagree about which kinds of thread exist');
  assert.deepStrictEqual([...(model as any).KINDS].sort(), [...engineKinds].sort(),
    "web/model.js KINDS and context.ts's Entry.entryType disagree — the editor would offer a type "
    + 'the engine does not know, or hide one it does');
  // THE THREADS LIST'S THREE LOOKS ARE MARKS THAT EXIST. `mark()` draws a plain ring for a name it
  // does not know, so a look renamed on one side only would show a circle on every card and pass
  // every check that reads the look's name. Read off the one line that picks the look.
  const looks = [...(read('web/app.js').match(/const look = on \? [^;]+;/)?.[0] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.strictEqual(looks.length, 3, `parsed ${looks.length} looks out of threadPlate; it has 3`);
  assert.deepStrictEqual(looks.filter((k) => !((model as any).MARK ?? {})[k]), [],
    'a look in threadPlate names a mark web/model.js does not have, and would draw as a plain ring');
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

// ONE STALE CHECK FOR EVERY READ THAT SENDS A CHAPTER SUMMARY TO THE MODEL (#42). Four readers, and
// until #42 two of them checked staleness and two did not, so a summary held back from the writing
// prompt still reached chapter proposals and a question that named its chapter. Two things that
// must agree, and only one of them guarded -- the shape the paired-vocabularies block above names.
//
// Each reader is located by anchors in its own source and must call `summaryReaches`. A raw
// `.summaryStale` read anywhere in routes.ts, or a second one in context.ts, is a reader deciding
// for itself, so it fails here too. A missing anchor fails rather than skipping: a check that
// cannot find its target reports green otherwise.
{
  const sources: Record<string, string> = { context: read('src/context.ts'), routes: read('src/routes.ts') };
  const region = (file: string, from: string, to: string) => {
    const s = sources[file], a = s.indexOf(from);
    assert.ok(a >= 0, `${file}: anchor "${from}" not found -- the reader moved; update this guard`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b >= 0, `${file}: end anchor "${to}" not found after "${from}"`);
    return s.slice(a, b);
  };
  const readers: [string, string][] = [
    ['the writing prompt (EARLIER)',
      region('context', 'for (const c of chapters) {', "add('EARLIER', c.id")],
    ['the act roll-up', region('routes', "'POST /api/rollup'", 'db.addArc(')],
    ['chapter proposals', region('routes', 'async function suggestScene(', 'WHAT HAS HAPPENED')],
    ['a chapter named in a question', region('routes', "m?.kind === 'chapter'", "m?.kind === 'book'")],
  ];
  for (const [who, src] of readers)
    assert.ok(src.includes('summaryReaches('),
      `${who} sends chapter summaries without the shared stale check (summaryReaches)`);
  const raw = (s: string) => (s.match(/\.summaryStale\b/g) ?? []).length;
  assert.strictEqual(raw(sources.routes), 0,
    'routes.ts reads .summaryStale directly -- a reader deciding staleness for itself');
  assert.strictEqual(raw(sources.context), 1,
    'context.ts reads .summaryStale outside summaryReaches -- the one read allowed is its own');
  ok(`${readers.length} readers of chapter summaries use one stale check`);
}

// THE WORD BOUNDS UNDER THE TWO EDITORS ARE THE PROMPTS' BOUNDS (#43, #44). The client warns past
// what the summary and act prompts ask the model for, and says so; the numbers live in both places,
// so a prompt retuned without the client would leave the warning naming a bound nothing uses. Every
// call of either prompt is read, and a missing one fails rather than skipping.
{
  const app = read('web/app.js'), routes = read('src/routes.ts');
  const client = app.match(/const SUMMARY_WORDS = (\d+), ACT_WORDS = (\d+);/);
  assert.ok(client, 'web/app.js: the SUMMARY_WORDS / ACT_WORDS line moved; update this guard');
  const calls = (re: RegExp) => [...routes.matchAll(re)].map((m) => Number(m[1]));
  const summary = calls(/\bSUMMARY\((\d+)\)/g), act = calls(/\bARC\(\s*\w+\s*,\s*\w+\s*,\s*(\d+)\s*\)/g);
  assert.ok(summary.length && act.length,
    `src/routes.ts: found ${summary.length} SUMMARY(n) and ${act.length} ARC(from, to, n) calls; expected both`);
  for (const n of summary) assert.strictEqual(Number(client![1]), n,
    `the summary editor warns past ${client![1]} words, the summary prompt asks for ${n}`);
  for (const n of act) assert.strictEqual(Number(client![2]), n,
    `the act editor warns past ${client![2]} words, the act prompt asks for ${n}`);
  ok(`the editors' word bounds match the prompts (${client![1]}, ${client![2]})`);
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


/* THE CODE MUST BE SELF-CONTAINED. Seth, 2026-09-07: "the code should be self-contained."
 *
 * There are 148 citations of PLAN-*, SPEC and COUNCIL-* in the source, and they are FINE: almost
 * every one is a provenance tag on a comment that already states the thing — "PLAN-08. The wardrobe
 * moved into `addons` as the `outfit` slot", "SPEC §7.1's 2-32 bound", "SPEC §5: on hash mismatch a
 * summary is flagged stale". You can read the code without opening anything.
 *
 * What is NOT fine is a comment that DEFERS meaning: "PLAN-02 §7.2 holds the trigger condition."
 * There was exactly one of those and it was load-bearing — the sentence beside it named overflow as
 * the reason the budget engine was deferred, while §7.2 says in as many words that the trigger is
 * NOT overflow. Nobody caught it for weeks because checking meant leaving the file.
 *
 * A document can be archived, renamed, superseded or wrong. A comment that points at one instead of
 * carrying its own meaning inherits every one of those failure modes. This check keeps the count at
 * zero, and it is deliberately narrow: it bans the DEFERRING PHRASES, not the citations.
 */
{
  const defers = /\b(holds the|see (?:PLAN|SPEC|COUNCIL)|read (?:PLAN|SPEC|COUNCIL)|per (?:PLAN|SPEC)|described in|specified in|refer to)\b/i;
  const cite = /(PLAN-0[0-9]|SPEC §|COUNCIL-[0-9])/;
  const bad: string[] = [];
  for (const f of ['src/context.ts', 'src/db.ts', 'src/routes.ts', 'src/story.ts', 'src/prompts.ts',
                   'src/blocks.ts', 'src/render.ts', 'src/import.ts', 'src/search.ts', 'serve.ts',
                   'web/app.js', 'web/model.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\n');
    src.forEach((line, i) => {
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      // The check describes itself in prose, so it must not flag its own explanation.
      if (isComment && cite.test(line) && defers.test(line) && !/THE TRIGGER, WRITTEN OUT HERE/.test(line))
        bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepStrictEqual(bad, [],
    'a comment must carry its own meaning, not point at a document for it:\n  ' + bad.join('\n  '));
  ok('no comment defers its meaning to a document — the code reads without opening one');
}

/** THE STYLESHEET'S BRACES BALANCE. 2026-10-25: a stray `}` left after an edit ended the
 *  stylesheet's next rule early, so `#inputRow` lost its flex and the full-screen composer's box
 *  stayed one line tall; browsers drop what they cannot parse and say nothing. Comments are taken
 *  out first, and a depth that goes below zero is named by its line. */
{
  const html = read('app.html');
  const at = html.indexOf('<style>'), css = html.slice(at, html.indexOf('</style>', at));
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  let depth = 0; const wrong: string[] = [];
  bare.split('\n').forEach((line, i) => {
    for (const ch of line) { if (ch === '{') depth++; else if (ch === '}') depth--;
      if (depth < 0) { wrong.push(`app.html <style> line ${i + 1}: a } with nothing open`); depth = 0; } }
  });
  if (depth !== 0) wrong.push(`app.html <style>: ${depth} { never closed`);
  assert.deepStrictEqual(wrong, [], 'the stylesheet\'s braces must balance, or the rules after the break are lost');
  ok('the stylesheet\'s braces balance');
}

// ---- FIVE SERIF, FIVE SANS, FIVE EASY TO READ (2026-10-27), AND EACH ONE DRAWN. A pick with no
// `html[data-ui-font=…] .narr` rule sets the prose in whatever the page fell back to, and a fetched
// face that is not a pick, or a pick that is fetched and not listed, are the two halves disagreeing.
{
  const app = read('web/app.js'), css = read('app.html');
  const block = app.slice(app.indexOf('  const fonts = ['), app.indexOf("  const tabs = [['theme'"));
  const groups = [...block.matchAll(/\['(Serif|Sans|Easy to read)', \[([\s\S]*?)\]\]\]/g)];
  const picks = groups.map((g) => [...g[2].matchAll(/\['([a-z]+)', '/g)].map((m) => m[1]));
  assert.deepStrictEqual(groups.map((g) => g[1]), ['Serif', 'Sans', 'Easy to read'], 'three groups, in that order');
  assert.deepStrictEqual(picks.map((p) => p.length), [5, 5, 5], 'five fonts in each');
  const all = picks.flat();
  for (const k of all) assert.match(css, new RegExp(`html\\[data-ui-font="${k}"\\] \\.narr \\{ font-family:`),
    `the ${k} pick has a rule that sets the prose in it`);
  const web = app.slice(app.indexOf('const WEBFONTS = {'), app.indexOf('};', app.indexOf('const WEBFONTS = {')));
  for (const k of [...web.matchAll(/\b([a-z]+): '/g)].map((m) => m[1]))
    assert.ok(all.includes(k), `the fetched face ${k} is one of the picks`);
  const was = app.slice(app.indexOf('const FONT_WAS = {'), app.indexOf('};', app.indexOf('const FONT_WAS = {')));
  for (const [, from, to] of was.matchAll(/\b([a-z]+): '([a-z]+)'/g)) {
    assert.ok(all.includes(to), `a look saved with ${from} reads as a font that is listed`);
    assert.ok(!all.includes(from), `and ${from} itself is gone from the list`);
  }
  ok('fifteen fonts in three groups, each with its rule, and the old ones mapped onto them');
}

console.log(`\n${n} checks passed`);
