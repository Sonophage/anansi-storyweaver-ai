// The five modes, structurally — everything that can be checked without waiting on a
// generation. What each mode DOES when you press send is in model.js, which is slow on purpose.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/modes.js
//
// The distinction under test is the one that broke: in Direct your text is an instruction and
// never reaches the page; in Speak, Act and Narrate your text IS the next passage.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
// A second book, made BEFORE the app loads so the client's library contains it from the first paint.
// Made later and navigated to by hash, the app does not know the id, lands on the workspace, and
// drawDock returns early leaving the hidden composer holding its old value — which reads exactly
// like "the draft carried across" and is not that at all. Reloading to refresh the library is not an
// option either: the draft under test lives in the page.
const other = await page.eval(`(async () => {
  const r = await (await fetch('/api/stories')).json();
  const had = r.stories.find(x => x.title === 'Another Book Entirely');
  if (had) return had.id;
  const made = await (await fetch('/api/stories', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Another Book Entirely' }) })).json();
  return made.id ?? null; })()`);
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");
const modeBlock = (mode, speaker, directive) => page.eval(
  "(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',"
  + "mode:" + JSON.stringify(mode) + (speaker ? ",speaker:" + JSON.stringify(speaker) : '')
  + (directive ? ",directive:" + JSON.stringify(directive) : '') + "})})).json();"
  + " return r.manifest.blocks.find(b => b.kind === 'MODE')?.text ?? ''; })()");

await page.goto(B + "/#" + sid);

// ---- 1. the five buttons, and what kind of thing each one is
for (const label of ['Speak', 'Act', 'Direct', 'Narrate'])
  ok(`${label} is on the bar`, await page.visible(`#modes [data-mode]`)
     && /./.test(await page.text('#modes') || '') && (await page.text('#modes') || '').includes(label));
// Continue left the mode row on 2026-08-27 for the end of the page. Asserted from both sides:
// gone from here, present there — one without the other passes while it is in both places.
ok("Continue is off the mode row", !(await page.eval("!!document.querySelector('#modes [data-continue]')")));
ok("  and on the last passage instead", await page.visible('#col .block:last-of-type ~ .carry, #col .carry [data-continue]'));
ok("New scene is gone from the bar", !/New scene/.test(await page.text('#modes') || ''));
// Continue sends with nothing typed, so it is an action. A mode you can select but never type
// into is the shape that made "Continue" need an empty box pressed twice.
ok("Continue is an action, not a selectable mode", await page.eval(
  "!!document.querySelector('[data-continue]') && !document.querySelector('[data-mode=\"continue\"]')"));
ok("Speak is selected by default", await page.eval(
  "document.querySelector('[data-mode=\"speak\"]')?.getAttribute('aria-pressed') === 'true'"));

// ---- 2. the two lines he asked to lose
const dock = (await page.text('#dockCol') || '');
ok("'Each take is kept' is gone", !/Each take is kept/.test(dock));
ok("the last-take line is gone", !/Last take|Ready$/m.test(dock));
ok("  and #takeRow is not rendered at all", await page.eval("!document.getElementById('takeRow')"));

// ---- 3. Enter. This asserted "plain Enter is wired to send" and went red on 2026-08-31, when
// Enter became a newline and the send button became the only thing that sends. The rule was
// re-tested in test/ui/composer.js in that same commit — with real CDP key events, because the
// question is what the browser reports on `e.shiftKey`, and behind a detector that is validated by
// pressing send first. This block was left behind asserting the old contract.
//
// DELETED RATHER THAN REWRITTEN. A second copy here would be a second place to update the next
// time the composer's keys change, and it would be the weaker of the two — it asked the handler
// whether it had called preventDefault rather than whether anything was sent.

// ---- 4. switching mode must not eat the line. Seventh instance of this bug.
await page.click('[data-mode="direct"]');
await page.eval("(() => { document.getElementById('input').value = ''; return 1; })()");
await page.type('#input', 'She puts the key on the table.');
await page.click('[data-mode="speak"]');
await wait(400);
const carried = await page.eval("document.getElementById('input')?.value");
ok(`switching mode keeps what you typed (${JSON.stringify(carried)})`,
   carried === 'She puts the key on the table.');
await page.eval("(() => { document.getElementById('input').value = ''; return 1; })()");

// ---- 5. Speak and Act happen AS someone, and the cast is offered
ok("Speak offers who you are speaking as", await page.visible('#asWhom'));
const opts = await page.eval("[...document.querySelectorAll('#asWhom option')].map(o => o.text).join('|')");
console.log("  as whom: " + opts);
ok("  defaulting to the point-of-view character", await page.eval(
  "document.querySelector('#asWhom').selectedOptions[0].value === ''"));
ok(`  and offering the cast (${opts.split('|').length} options)`, opts.split('|').length > 1);
await page.click('[data-mode="direct"]');
await wait(300);
ok("Direct has no 'as whom' — an instruction is not spoken by anyone", !(await page.visible('#asWhom')));
await page.click('[data-mode="narrate"]');
await wait(300);
ok("  nor does Narrate", !(await page.visible('#asWhom')));

// ---- 6. what each mode actually tells the model
const cont = await modeBlock('continue', null, 'IGNORE ME');
ok("Continue asks for the next beat", /one small beat/.test(cont));
ok("  and names no paragraph count — F18: a named length is a length it fills",
   !/\d\s*-\s*\d\s+paragraphs/.test(cont));
ok("  and carries no directive, because it has no box", !/IGNORE ME/.test(cont));

const direct = await modeBlock('direct', null, 'He drops the key.');
// Matched on the directive and the colon that introduces it, not on the line's opening verb: Seth
// reworded that to "Re write what happens based on this:" on 2026-09-01, and what this asserts is
// that the typed text REACHES the template that carries a directive.
ok("Direct passes your text as an instruction", /based on this: He drops the key\./.test(direct));

const speak = await modeBlock('speak', 'Aldis Fen');
ok(`Speak names who spoke (${JSON.stringify(speak.slice(0, 62))})`, /spoken as Aldis Fen/.test(speak));
ok("  and forbids answering in their voice", /Do not put further words in Aldis Fen/.test(speak));

const act = await modeBlock('act', 'Marek');
ok("Act names who acted", /what Marek has just done/.test(act));
ok("  and forbids deciding their next move", /Do not decide what Marek does next/.test(act));

const narr = await modeBlock('narrate');
ok("Narrate tells the model the prose above is the author's", /written by the author, not by you/.test(narr));
ok("  and not to rewrite it", /Do not rewrite it/.test(narr));

// A stale tab still sends the retired names. A 500 from an undefined lookup is a worse answer
// than the neutral mode.
const stale = await modeBlock('cowrite');
ok(`a retired mode name degrades instead of erroring (${JSON.stringify(stale.slice(0, 34))})`,
   /one small beat/.test(stale));

// ---- 7. the speaker reaches the prompt through the UI's own selector, not just the API
await page.click('[data-mode="speak"]');
await wait(300);
const cast = await page.eval("[...document.querySelectorAll('#asWhom option')].map(o => o.value).filter(Boolean)[0]");
if (cast) {
  await page.eval("(() => { const el = document.getElementById('asWhom'); el.value = "
    + JSON.stringify(cast) + "; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
  await wait(900);
  ok(`picking someone else changes the placeholder (${JSON.stringify(cast)})`,
     (await page.eval("document.getElementById('input')?.placeholder") || '').includes(cast));
  ok("  and the line you were writing survives it",
     (await page.eval("document.getElementById('input')?.value")) === '');
} else { ok("the cast offers someone other than you", false); }

// ---- 8. the working bar does not move the composer
// It cannot live inside #dockCol (drawDock() sets innerHTML), so it is a flex sibling. As a row
// sibling at width:100% it shoved the composer off the right edge for the whole 20-40s call.
const dockBox = () => page.eval("(() => { const d = document.getElementById('dockCol').getBoundingClientRect();"
  + " return [Math.round(d.left), Math.round(d.right), Math.round(d.width)]; })()");
const quiet = await dockBox();
await page.eval("(() => { const w = document.getElementById('working'); w.hidden = false; w.dataset.work = 'speak'; return 1; })()");
await wait(150);
const busy = await dockBox();
ok(`the composer stays put while the bar runs (${quiet} -> ${busy})`, String(quiet) === String(busy));
ok("  and the bar lines up with the column",
   Math.abs((await page.eval("Math.round(document.getElementById('working').getBoundingClientRect().left)")) - busy[0]) <= 1);

// ---- 9. the five modes, in the writer's own words
// Global to the writer, a full replace, and empty is the reset. The thing that matters is that it
// reaches the PROMPT — an editor that saves a box nobody reads is worse than no editor.
await page.goto(B + "/#" + sid + "/teller");
await wait(900);
const promptRows = await page.eval("[...document.querySelectorAll('[data-editprompt]')].map(b => b.dataset.editprompt).join(',')");
ok(`Storyteller offers all five modes to rewrite (${promptRows})`, promptRows === 'continue,speak,act,direct,narrate');
await page.click('[data-editprompt="speak"]');
await wait(300);
ok("  opening one shows the shipped wording to edit",
   (await page.eval("document.querySelector('[data-prompttext]')?.value") || '').includes('whole answer'));
await page.eval("(() => { document.querySelector('[data-prompttext]').value = 'ANSWER AS THE ROOM DOES, for {{speaker}}.'; return 1; })()");
await page.click('[data-saveprompt="speak"]');
await wait(900);
const own = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'speak'})})).json();"
  + " return r.prompt; })()");
ok("  and what you wrote is what the model is sent", /ANSWER AS THE ROOM DOES/.test(own));
ok("  with the placeholder filled, not left in", !/\{\{speaker\}\}/.test(own));
ok("  and none of the shipped wording left", !/whole answer/.test(own));
// Default is Save with nothing in it, so there is one path back. The editor is still open after a
// save — clicking the header again here would toggle it shut.
ok("  the editor stays open after saving", await page.visible('[data-resetprompt="speak"]'));
await page.click('[data-resetprompt="speak"]');
await wait(900);
const back = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'speak'})})).json();"
  + " return r.prompt; })()");
ok("  Default puts the shipped wording back", /whole answer/.test(back) && !/ANSWER AS THE ROOM/.test(back));

// ---- 10. the composer keeps what you were writing
// COUNCIL-04 #11, and the last of the smaller seven. drawDock sets innerHTML, so every repaint —
// a panel opening, a chapter turning, a mode changing — threw the half-written line away. One
// handler had grown its own save-and-restore with a comment calling it "the seventh instance of
// this same repaint bug"; the fix is now in drawDock, where all seven pass through.
await page.goto(B + "/#" + sid);
await wait(900);
const typed = 'half a sentence I have not finished';
await page.eval(`(() => { const t = document.getElementById('input');
  t.value = ${JSON.stringify(typed)}; t.focus();
  t.setSelectionRange(7, 7); return 1; })()`);

await page.click('[data-panel="context"]');
await wait(700);
ok("opening a panel does not eat the draft",
   (await page.eval("document.getElementById('input')?.value")) === typed);
ok("  and the caret is where you left it",
   (await page.eval("document.getElementById('input')?.selectionStart")) === 7);

ok("there is a second book to carry the draft into", !!other);

await page.eval("(() => { document.querySelector('[data-mode=\"act\"]')?.click(); return 1; })()");
await wait(500);
ok("changing mode does not eat it either",
   (await page.eval("document.getElementById('input')?.value")) === typed);

// Chapter paging, which is the other case the finding named.
const paged = await page.eval("(() => { const b = document.querySelector('[data-chapter]'); if (!b) return null;"
  + " b.click(); return 1; })()");
await wait(800);
if (paged) {
  ok("turning to another chapter does not eat it",
     (await page.eval("document.getElementById('input')?.value")) === typed);
} else {
  ok("turning to another chapter does not eat it (no other chapter to turn to)", true);
}

// But a draft belongs to ITS book. Carrying it into another one would be worse than losing it.
//
// This assertion sat behind `if (other)` with no else, and `other` was whatever second book happened
// to be in the library — which was a snapshot of the real anansi.db. The day that library emptied it
// stopped running and the scenario still reported green, 46 checks becoming 45. It is the check
// behind "open a different story and the line is gone", which is a walk item.
if (other) {
  await page.eval("(() => { document.getElementById('input').dataset.probe = 'before'; return 1; })()");
  await page.eval(`(() => { location.hash = '#' + ${JSON.stringify(other)}; return 1; })()`);
  await wait(1400);
  // WHICH book is open, as well as what is in the box: "the draft carried across" and "the app never
  // opened the other book" look identical from the value alone, and only one of them is a bug.
  const landed = await page.eval("(() => ({ hash: location.hash,"
    + " onStory: !!document.querySelector('#col'),"
    + " box: document.getElementById('input')?.value ?? null }))()");
  ok(`  and it actually opened the other book (${JSON.stringify(landed.hash)})`,
     landed.hash.includes(other) && landed.onStory);
  ok(`  and opening a different book does not carry it across (${JSON.stringify(landed.box)})`,
     landed.box === '');
}

// THE CARET SURVIVES A REPAINT WHETHER OR NOT ANYTHING IS TYPED YET. drawDock replaces the
// composer with innerHTML on almost every action, and focus restoration used to live inside
// `if (draft?.text)` — so an EMPTY box with the caret in it lost focus every time. On a phone that
// closes the keyboard, the layout viewport grows back under interactive-widget=resizes-content,
// and the dock drops; the next tap raises it again. Seth reported it as "the place where i type
// moves everytime i go to input". The empty case is the one that regressed, so it is asserted
// first and separately — a check that only tried text would have stayed green through the bug.
{
  const seen = [];
  for (const [label, text] of [["empty", ""], ["typed", "half a line"]]) {
    await page.eval("(() => { const t = document.getElementById('input');"
      + " t.value = " + JSON.stringify(text) + "; t.dispatchEvent(new Event('input')); t.focus(); return 1; })()");
    await wait(120);
    await page.eval("(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); return 1; })()");
    await wait(400);
    seen.push([label, await page.eval("(() => document.activeElement === document.getElementById('input'))()")]);
  }
  for (const [label, kept] of seen) ok(`the caret survives a repaint in a ${label} composer`, kept);

  // And the other side of it: restoring focus must not GRAB it. A composer that steals the caret
  // back on every repaint would fight every button press on the page.
  await page.eval("(() => { const t = document.getElementById('input'); t.value = ''; t.blur(); document.body.focus(); return 1; })()");
  await page.eval("(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); return 1; })()");
  await wait(400);
  ok('and a composer nobody was in is left alone',
     await page.eval("(() => document.activeElement !== document.getElementById('input'))()"));
}

// A CAPPED BOX IS RIGHT FOR A LINE AND WRONG FOR A PARAGRAPH. Past the cap you are writing into a
// six-line window with the top of your own sentence out of sight. The expanded composer is the
// same dock flexed to the screen, so the mode rail comes with it — asserted, because building a
// SECOND composer that drifts from the first is the obvious wrong way to do this and would look
// identical from a height measurement alone.
{
  const LONG = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long thing being written.`).join(' ');
  await page.eval("(() => { const t = document.getElementById('input');"
    + " t.value = " + JSON.stringify(LONG) + "; t.dispatchEvent(new Event('input')); return 1; })()");
  await wait(250);
  const capped = await page.eval("(() => { const t = document.getElementById('input');"
    + " return { boxH: Math.round(t.getBoundingClientRect().height), content: Math.round(t.scrollHeight) }; })()");
  ok(`a long draft is clamped and scrolls in place (${capped.boxH}px of ${capped.content}px)`,
     capped.content > capped.boxH + 2);

  await page.eval("(() => { document.querySelector('[data-bigin]').click(); return 1; })()");
  await wait(500);
  const big = await page.eval("(() => { const t = document.getElementById('input'); const m = document.getElementById('modes');"
    + " return { boxH: Math.round(t.getBoundingClientRect().height), text: t.value.length,"
    + "   dockH: Math.round(document.getElementById('dock').getBoundingClientRect().height), vh: innerHeight,"
    + "   rail: !!m && m.getBoundingClientRect().height > 0 }; })()");
  ok(`expanded, the composer fills the screen (${big.dockH}px of ${big.vh}px)`, big.dockH >= big.vh - 2);
  ok(`  and the box grew with it (${capped.boxH}px -> ${big.boxH}px)`, big.boxH > capped.boxH);
  ok('  and the mode rail came with it rather than being left behind', big.rail);
  ok('  and expanding did not cost a character of the draft', big.text === LONG.length);

  // "if i unfocus it shouldnt lose my text. i.e. if i need to read the last passage or something."
  await page.eval("(() => { document.getElementById('input').blur(); return 1; })()");
  await page.eval("(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); return 1; })()");
  await wait(400);
  ok('leaving the box to read the page and coming back keeps every character',
     await page.eval("(() => document.getElementById('input').value.length)()") === LONG.length);

  await page.eval("(() => { document.querySelector('[data-bigin]').click();"
    + " const t = document.getElementById('input'); t.value = ''; t.dispatchEvent(new Event('input')); return 1; })()");
  await wait(300);
}

// ---- #14. THE ACCENT SAYS WHICH PRESS WROTE IT, and the last passage wears it all the way round.
// Seth: "separate the accent color based on what the response was ... that way when the user reads
// back through it they can differentiate what was triggered by what action." Written through
// /api/write rather than by pressing send, because the accent is about what was STORED — this
// scenario is the one that runs without a generation.
{
  const put = (body, mode) => page.eval(`(async () => { await fetch('/api/write', { method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ storyId:'${sid}', body:${JSON.stringify(body)}, mode:${JSON.stringify(mode)} }) });
    return 1; })()`);
  await put('He said nothing for a while.', 'narrate');
  await put('She crossed the room.', 'act');
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
  await wait(600);

  const seen = await page.eval(`(() => {
    const resolve = (v) => { const el = document.createElement('span');
      el.style.color = v; document.body.appendChild(el);
      const c = getComputedStyle(el).color; el.remove(); return c; };
    const b = [...document.querySelectorAll('#col .block')];
    const last = b[b.length - 1], prev = b[b.length - 2];
    const cs = (e) => e && getComputedStyle(e);
    const L = cs(last), P = cs(prev);
    return {
      lastCls: last?.className ?? '', prevCls: prev?.className ?? '',
      lastOutline: L?.outlineColor, lastAccent: L?.getPropertyValue('--m').trim(),
      lastLeft: L?.borderLeftColor, lastPad: L?.paddingLeft,
      prevLeft: P?.borderLeftColor, prevPad: P?.paddingLeft,
      // RESOLVED TO THE SAME COLOUR SPACE, or this compares nothing. getComputedStyle gives
      // outlineColor as rgb(); reading --chip off the root gives the raw token, a hex. The two are
      // never equal, so the "not the faint chip" assertion below passed with the rule deleted —
      // caught by falsifying it. A probe element makes the browser resolve the token the same way.
      chip: resolve('var(--chip)'), accent: resolve('var(--m-act)') }; })()`);
  ok(`the last passage carries its press (${seen.lastCls.split(' ').filter(c => c.startsWith('m-')).join()})`,
     /\bm-act\b/.test(seen.lastCls));
  ok(`  and the one before it carries its own (${seen.prevCls.split(' ').filter(c => c.startsWith('m-')).join()})`,
     /\bm-narrate\b/.test(seen.prevCls));
  // THE TWO HALVES OF WHAT HE ASKED FOR, asserted separately: the box is the accent rather than the
  // faint chip, and the side line is gone from it because the accent is now the whole shape.
  ok(`  the last one is boxed in its own accent, not the faint chip (${seen.lastOutline})`,
     !!seen.lastOutline && seen.lastOutline === seen.accent && seen.lastOutline !== seen.chip);
  ok(`  with no second line down its side (${seen.lastLeft})`, /rgba\(0, 0, 0, 0\)|transparent/.test(seen.lastLeft || ''));
  // And the one above it is the single line — the state everything returns to as the page grows.
  ok(`  while the one above it is the one line (${seen.prevLeft})`,
     !!seen.prevLeft && !/rgba\(0, 0, 0, 0\)|transparent/.test(seen.prevLeft));
  // THE PROSE MUST NOT MOVE when a passage stops being the newest. The side line is made
  // transparent and the padding kept for exactly this; dropping either would shift every passage
  // 16px the moment a newer one landed.
  ok(`  and the prose does not shift when it moves up (${seen.lastPad} then ${seen.prevPad})`,
     seen.lastPad === seen.prevPad);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
