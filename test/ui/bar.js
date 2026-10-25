// needs: fake-router
// The bottom of the writing screen (#71): three buttons once a passage has landed, the composer
// behind Continue, hold for Talk, and ✦ for three ideas.
//
//   bash test/ui/run.sh bar
//
// Seth, 2026-10-25: "[ ⟳ ] [ continue ] [ ✦ ]". Tap Continue writes at once and opens the composer;
// hold it and the same box and Send go to Talk; while Anansi writes it is Stop; when the passage
// lands the bottom folds back. ✦ asks the tale's model for three ideas and the one picked goes in
// the box. Asserted on a phone, by touch, and then on the Titan's 360 by 360 square.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 60, ms = 100) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};
const shown = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
  return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'
    && e.getBoundingClientRect().height > 0; })()`);
const barButtons = () => page.eval(`[...document.querySelectorAll('#nextrow > button')]
  .filter((b) => b.getBoundingClientRect().height > 0).map((b) => b.dataset.re ? 're' : b.id === 'cont' ? 'cont' : b.dataset.idea ? 'idea' : '?')`);
// A press that does not throw when the thing is missing, so a broken behaviour goes red on its own
// named assertion instead of ending the scenario there.
const press = (sel) => page.eval(`(() => { document.querySelector(${JSON.stringify(sel)})?.click(); return 1; })()`);

await page.mobile();
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
const models = () => page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.filter((p) => p.author === 'model').length)()`);

// ---- a tale with no prose yet: the composer is the whole bottom, as it was
const empty = await page.eval(`(async () => {
  const r = await (await fetch('/api/stories', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ title:'Nothing Yet', genre:'test', premise:'x', pov:'third past', autoOpen:false }) })).json();
  return r.storyId ?? r.id ?? r.story?.id; })()`);
await page.goto(B + "/#" + empty);
await until("!!document.getElementById('input')");
ok("BAR-NONE: a scene with no passage has no three buttons", !(await shown('#nextbar')));
ok("  and the box is on screen to write the first one", await shown('#input'));
await page.eval(`fetch('/api/write', { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ storyId:'${empty}', body:'The first line, by hand.' }) }).then((r) => r.json())`);
await page.goto(B + "/#" + empty);
await until("!!document.getElementById('nextbar')");
ok(`BAR-AFTER: once a passage has landed, the bottom is three buttons (${JSON.stringify(await barButtons())})`,
   JSON.stringify(await barButtons()) === '["re","cont","idea"]');

// ---- the tale with prose: folded
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
ok(`BAR-THREE: the three buttons, Reweave, Continue and ✦ (${JSON.stringify(await barButtons())})`,
   JSON.stringify(await barButtons()) === '["re","cont","idea"]');
ok("BAR-FOLDED: and the mode row, the box and Send are behind them",
   !(await shown('#modes')) && !(await shown('#input')) && !(await shown('#send')));

// ---- the hold hint, and no callout or selection on the button. The count is reset first: the
// loads above used some of it.
await page.eval("(() => { localStorage.setItem('anansi.holdhint', '0'); return 1; })()");
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
ok("HINT: Continue says it can be held, the first few times", /hold to talk/.test(await page.eval("document.querySelector('#cont .holdhint')?.textContent ?? ''")));
ok("NOCALLOUT: the button's text cannot be selected",
   (await page.eval("getComputedStyle(document.getElementById('cont')).userSelect")) === 'none');
// Read off the page's own source: Chrome drops a property it does not know from the parsed
// stylesheet, and -webkit-touch-callout is Safari's.
ok("NOCALLOUT: and the iOS callout is off in the stylesheet",
   await page.eval("fetch('/').then((r) => r.text()).then((t) => /#nextrow > button \\{[^}]*-webkit-touch-callout:none/.test(t))"));
ok("NOCALLOUT: and a long press opens no menu",
   await page.eval("!document.getElementById('cont').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))"));

// ---- the handle opens the composer without writing anything
const m0 = await models();
await page.click('#nextbar .grab');
ok("GRAB: the handle opens the composer", (await shown('#input')) && (await shown('#modes')));
ok("  and writes nothing", (await models()) === m0);
await page.click('#nextbar .grab');
ok("  and folds it again", !(await shown('#input')));

// ---- tap Continue: written at once, the composer opens, the big button is Stop
await page.click('#cont');
ok("TAP-WRITES: a tap on Continue writes the next passage at once",
   await until("!!document.querySelector('#col > #ghost.inlive')"));
ok("TAP-OPENS: and the whole composer opens to steer the one after",
   (await shown('#modes')) && (await shown('#input')) && (await shown('#send')));
ok("STOP: while Anansi writes, the big button is Stop",
   await page.eval("(() => { const c = document.getElementById('cont'); return !!c && c.dataset.stop === '1' && /Stop/.test(c.textContent); })()"));
ok("LANDS: the passage lands", await until("!document.getElementById('ghost')", 120));
ok(`  (${m0} -> ${await models()} passages by Anansi)`, (await models()) === m0 + 1);
ok("FOLDS: and the bottom folds back to the three buttons",
   await until("!document.querySelector('#inputRow') || getComputedStyle(document.getElementById('inputRow')).display === 'none'", 40)
   && JSON.stringify(await barButtons()) === '["re","cont","idea"]');

// ---- Stop, from the big button
await page.click('#cont');
await until("!!document.querySelector('#col > #ghost.inlive')");
await press('#cont[data-stop]');
ok("STOP-STOPS: the big Stop takes the passage being written away", await until("!document.getElementById('ghost')", 40));
// (Not "and nothing was added": the fake router writes the whole passage in one chunk, so Stop can
// arrive after it has landed. test/ui/inline.js makes the same call.)
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");

// ---- hold Continue: Talk, in the same box
const m1 = await models();
await page.hold('#cont', 900);
ok("HOLD-TALKS: holding Continue turns the composer to Talk",
   await page.eval("document.getElementById('dock').classList.contains('talking')"));
ok("  and writes nothing", (await models()) === m1 && !(await page.eval("!!document.getElementById('ghost')")));
ok("HOLD-HIDES: the mode and threads row hides", !(await shown('#modes')));
ok("HOLD-SAME-BOX: the same box and Send are on screen, for Anansi",
   (await shown('#input')) && (await shown('#send'))
   && /Ask Anansi/.test(await page.eval("document.getElementById('input').placeholder")));
ok("HINT-GOES: once a hold has worked, the hint is gone", !(await page.eval("!!document.querySelector('#cont .holdhint')")));
await page.eval(`(() => { const i = document.getElementById('input'); i.value = 'Who keeps the silver key?';
  i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await press('#send');
ok("HOLD-SENDS-TO-TALK: Send asks Anansi, and the question is in the Talk drawer",
   await until("location.hash.endsWith('/anansi') && (document.getElementById('sideBody')?.textContent ?? '').includes('Who keeps the silver key?')", 40));
ok("  and no passage was written", (await models()) === m1);
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
ok("HINT-STAYS-GONE: after a hold the hint does not come back on the next load",
   !(await page.eval("!!document.querySelector('#cont .holdhint')")));

// ---- Talk without a hold: on the dial
await page.click('#nextbar .grab');
await page.mode('talk');
ok("TALK-DIAL: Talk to Anansi on the dial turns the composer to Talk",
   await page.eval("document.getElementById('dock').classList.contains('talking')"));
await press('#talkhead [data-dockwrite]');
await wait(200);
ok("  and Back to writing turns it back", (await shown('#modes'))
   && !(await page.eval("document.getElementById('dock').classList.contains('talking')")));

// ---- the keyboard: Alt+T, and typing opens the folded bar
await page.click('#nextbar .grab');
await page.eval("(() => { document.activeElement?.blur(); return 1; })()");
await page.key('t', 84, 1);
ok("KEY-ALT-T: Alt+T turns the composer to Talk",
   await page.eval("document.getElementById('dock').classList.contains('talking')"));
await page.key('Escape', 27);
ok("  and Esc leaves it", !(await page.eval("document.getElementById('dock').classList.contains('talking')")));
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
await page.eval("(() => { document.activeElement?.blur(); return 1; })()");
await page.key('H', 72);
ok("KEY-TYPE-OPENS: typing with the bar folded opens the composer and the letter lands in it",
   (await shown('#input')) && (await page.eval("document.getElementById('input').value")) === 'H');
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");

// ---- ✦: three ideas, one picked into the box
await page.click('[data-idea]');
ok("IDEA-THREE: ✦ shows Anansi's three ideas",
   await until("document.querySelectorAll('#ideas .idea').length === 3", 60));
ok("  with the words that came back", (await page.eval("document.querySelectorAll('#ideas .idea')[1]?.textContent ?? ''")).includes('second fake idea'));
await press('#ideas .idea:nth-child(2)');
await wait(250);
ok("IDEA-PICK: picking one puts it in the box, the composer open",
   (await shown('#input')) && (await page.eval("document.getElementById('input').value")).includes('second fake idea'));
ok("  in Direct, unsent", (await page.eval("document.querySelector('[data-modesel]').value")) === 'direct'
   && !(await page.eval("!!document.getElementById('ghost')")));
ok("  and the choices go", !(await page.eval("!!document.getElementById('ideas')")));

// ---- 44px to the finger, at 390 wide and on the 360 square
const sizes = () => page.eval(`[...document.querySelectorAll('#nextrow > button, #nextbar .grab, #ideas .idea')]
  .filter((b) => b.getBoundingClientRect().height > 0)
  .map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height),
    n: b.getAttribute('aria-label') || b.textContent.trim().slice(0, 12) }; })`);
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
await page.click('[data-idea]');
await until("document.querySelectorAll('#ideas .idea').length === 3", 60);
let small = (await sizes()).filter((x) => x.w < 44 || x.h < 44);
ok(`TARGETS-390: every button on the bar is 44px both ways at 390 wide (${JSON.stringify(small)})`,
   small.length === 0 && (await sizes()).length === 7);
await page.viewport(360, 360);
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
small = (await sizes()).filter((x) => x.w < 44 || x.h < 44);
ok(`TARGETS-360: and on the 360 square (${JSON.stringify(small)})`, small.length === 0 && (await sizes()).length === 4);
ok("  and all three are on screen there", await page.eval(`[...document.querySelectorAll('#nextrow > button')]
  .every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0; })`));

// ---- and the hint stops after a few loads even with no hold
await page.eval("(() => { localStorage.setItem('anansi.holdhint', '0'); return 1; })()");
for (let i = 0; i < 5; i++) await page.goto(B + "/#" + sid);
ok("HINT-FEW-SHOWN: on the fifth load the hint is still said",
   !!(await page.eval("!!document.querySelector('#cont .holdhint')")));
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
ok("HINT-FEW: a sixth load later the hint has stopped, hold or no hold",
   !(await page.eval("!!document.querySelector('#cont .holdhint')")));

console.log(red ? `\n  ${red} RED` : "\n  all green");
