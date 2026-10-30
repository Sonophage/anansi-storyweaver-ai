// needs: fake-router
// The bottom of the writing screen (#71): three marks once a passage has landed, the box behind the
// quill, hold the quill for Talk, ✦ to continue, and the bulb under the last passage for ideas.
//
//   bash test/ui/run.sh bar
//
// Seth's second round, 2026-10-25: "[↻] [🪶] [✦]", marks only. ↻ reweaves. The quill in its circle
// opens the box and writes nothing; held, the box and Send go to Talk, and the "hold to talk" hint
// sits under it. ✦ continues with no box, and is Stop while he writes with the box folded. With
// the box up, Send writes (an empty box continues) and is the one Stop. The three ideas are a bulb
// under the last passage. In the header the tale's title opens its Threads and ⋯ opens the menu,
// and the Threads dial above the box is gone. Asserted on a phone, by touch, and on the Titan's
// 360 by 360 square.
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
const barButtons = () => page.eval(`[...document.querySelectorAll('#nextrow button')]
  .filter((b) => b.getBoundingClientRect().height > 0)
  .map((b) => b.dataset.re ? 're' : b.dataset.dockopen ? 'quill' : b.dataset.continue ? 'cont' : b.dataset.stop ? 'stop' : '?')`);
// A press that does not throw when the thing is missing, so a broken behaviour goes red on its own
// named assertion instead of ending the scenario there.
const press = (sel) => page.eval(`(() => { document.querySelector(${JSON.stringify(sel)})?.click(); return 1; })()`);
const folded = () => page.eval("!!document.getElementById('dock')?.classList.contains('folded')");
const talking = () => page.eval("!!document.getElementById('dock')?.classList.contains('talking')");
const open = async () => { await page.goto(B + "/#" + sid); await until("!!document.getElementById('nextbar')"); };

await page.mobile();
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
const models = () => page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.filter((p) => p.author === 'model').length)()`);

// ---- a tale with no prose yet: the box is the whole bottom, as it was
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
   JSON.stringify(await barButtons()) === '["re","quill","cont"]');

// ---- the tale with prose: folded, three marks, no words
await page.eval("(() => { localStorage.setItem('anansi.holdhint', '0'); return 1; })()");
await open();
ok(`BAR-THREE: ↻, the quill and ✦, in that order (${JSON.stringify(await barButtons())})`,
   JSON.stringify(await barButtons()) === '["re","quill","cont"]');
ok("BAR-FOLDED: and the mode row, the box and Send are behind them",
   !(await shown('#modes')) && !(await shown('#input')) && !(await shown('#send')));
const words = await page.eval("[...document.querySelectorAll('#nextrow button')].map((b) => b.textContent.trim()).join('|')");
ok(`ICONS-ONLY: the buttons carry marks, not words (${JSON.stringify(words)})`, !/[A-Za-z]/.test(words));
ok("QUILL-MARK: the middle is a quill drawn in the marks' own hand, in a circle",
   await page.eval(`(() => { const q = document.getElementById('quill'); if (!q) return false;
     const r = q.getBoundingClientRect(); return q.querySelectorAll('svg path').length >= 6
       && getComputedStyle(q).borderRadius === '50%' && Math.abs(r.width - r.height) < 1; })()`));

// ---- the hold hint, under the circle, and no callout or selection on it
ok("HINT: the quill says it can be held, the first few times",
   /hold to talk/.test(await page.eval("document.querySelector('.quillcell .holdhint')?.textContent ?? ''")));
// ABOVE since 2026-10-25 (Seth): a thumb on the circle covers whatever is under it.
ok("HINT-ABOVE: and the hint sits above the circle",
   await page.eval(`(() => { const q = document.getElementById('quill'), h = document.querySelector('.quillcell .holdhint');
     if (!q || !h) return false; const a = q.getBoundingClientRect(), b = h.getBoundingClientRect();
     return b.bottom <= a.top + 1 && Math.abs((b.left + b.right) / 2 - (a.left + a.right) / 2) < 3; })()`));
// NO GROUND UNDER THE BAR: between the buttons a tale's picture shows through, so nothing from the
// dock down to the row paints a background. The buttons keep their own fills.
const grounds = await page.eval(`['#dock', '#dockCol', '#nextbar', '#nextrow', '#nextrow .quillcell'].map((q) => {
  const e = document.querySelector(q), c = e && getComputedStyle(e);
  return c ? q + ' ' + c.backgroundColor + ' ' + c.backgroundImage : q + ' missing'; })`);
ok(`BAR-TRANSPARENT: the bar's own background is transparent (${JSON.stringify(grounds)})`,
   grounds.every((g) => / rgba\(0, 0, 0, 0\) none$/.test(g)));
ok("BUTTONS-FILLED: and the three buttons keep their own fills",
   await page.eval(`[...document.querySelectorAll('#nextrow button')].every((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)')`));
ok("NOCALLOUT: the quill's text cannot be selected",
   (await page.eval("getComputedStyle(document.getElementById('quill')).userSelect")) === 'none');
// Read off the page's own source: Chrome drops a property it does not know from the parsed
// stylesheet, and -webkit-touch-callout is Safari's.
ok("NOCALLOUT: and the iOS callout is off in the stylesheet",
   await page.eval("fetch('/').then((r) => r.text()).then((t) => /#nextrow \\.quillcell > button \\{[^}]*-webkit-touch-callout:none/.test(t))"));
ok("NOCALLOUT: and a long press opens no menu",
   await page.eval("!document.getElementById('quill').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))"));

// ---- the quill opens the box and writes nothing; tapped again it folds
const m0 = await models();
await page.click('#quill');
ok("QUILL-OPENS: a tap on the quill opens the box and everything around it",
   (await shown('#input')) && (await shown('#modes')) && (await shown('#send')));
await wait(600);
ok("QUILL-WRITES-NOTHING: and writes nothing", (await models()) === m0 && !(await page.eval("!!document.getElementById('ghost')")));

// ---- one state or the other: with the box up the bar is hidden, and every way of folding it works
ok("BAR-HIDDEN-UP: with the box up the three buttons are hidden", !(await shown('#nextbar')));
ok("FOLD-CONTROL: a ⌄ on the box's top edge, 44px to the finger",
   await page.eval(`(() => { const f = document.getElementById('fold'); if (!f) return false;
     const r = f.getBoundingClientRect(), d = document.getElementById('dock').getBoundingClientRect();
     return r.width >= 44 && r.height >= 44 && r.top < d.top && r.bottom > d.top; })()`));
await page.eval(`(() => { const i = document.getElementById('input'); i.value = 'half a line, unsent';
  i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await press('#fold'); await wait(250);
ok("FOLD-TAP: the ⌄ folds the box", await folded());
ok("BAR-BACK: and the three buttons come back", await shown('#nextbar') && JSON.stringify(await barButtons()) === '["re","quill","cont"]');
ok("  and nothing was written", (await models()) === m0 && !(await page.eval("!!document.getElementById('ghost')")));
await press('#quill'); await wait(250);
ok("DRAFT-SURVIVES-FOLD: the half-written line is still in the box when it comes back",
   (await page.eval("document.getElementById('input').value")) === 'half a line, unsent');
await page.key('Escape', 27);
ok("FOLD-ESC: Esc folds the box", await folded());
await press('#quill'); await wait(250);
await press('#col .band'); await wait(250);
ok("FOLD-PROSE: a tap on the page above folds the box", await folded());
await press('#quill'); await wait(250);
await page.eval("(() => { const i = document.getElementById('input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()");
await page.mode('talk');
ok("TALK-UP: with the box up, Talk is on the mode dial", await talking());
await page.key('Escape', 27);
await page.key('Escape', 27);
ok("  and Esc leaves Talk, then folds", !(await talking()) && (await folded()));

await open();

// ---- ✦ continues with no box, and is Stop while he writes
await page.click('#cont');
ok("CONT-WRITES: ✦ writes the next passage at once", await until("!!document.querySelector('#col > #ghost.inlive')"));
ok("CONT-NO-BOX: and leaves the box folded", await folded());
ok("STOP-FOLDED: while he writes with the box folded, ✦ is Stop",
   await page.eval("(() => { const c = document.getElementById('cont'); return !!c && c.dataset.stop === '1' && /Stop/.test(c.textContent); })()"));
ok("LANDS: the passage lands", await until("!document.getElementById('ghost')", 120));
ok(`  (${m0} -> ${await models()} passages by Anansi)`, (await models()) === m0 + 1);
ok("  and the bar is back to the three", JSON.stringify(await barButtons()) === '["re","quill","cont"]');
await page.click('#cont');
await until("!!document.querySelector('#col > #ghost.inlive')");
await press('#cont[data-stop]');
ok("STOP-STOPS: the folded Stop takes the passage being written away", await until("!document.getElementById('ghost')", 40));
// (Not "and nothing was added": the fake router writes the whole passage in one chunk, so Stop can
// arrive after it has landed. test/ui/inline.js makes the same call.)
await open();

// ---- the box up: Send writes, an empty box continues, and Send is the one Stop
const m1 = await models();
await page.click('#quill');
await page.eval("(() => { const i = document.getElementById('input'); i.value = ''; return 1; })()");
await press('#send');
ok("SEND-EMPTY-CONTINUES: Send with an empty box makes Anansi write",
   await until("!!document.querySelector('#col > #ghost.inlive')"));
// SEND FOLDS THE BOX AT THE PRESS (Seth, 2026-10-26), not when the passage lands, so the Stop is ✦.
ok("SEND-FOLDS: Send folds the box back to the three buttons at once", await folded());
ok("ONE-STOP: while he writes, the one Stop on screen is ✦",
   await page.eval("(() => { const v = [...document.querySelectorAll('#dock [data-stop]')].filter((b) => b.offsetParent); return v.length === 1 && v[0].id === 'cont'; })()"));
// FADED LIKE ↻ (Seth, 2026-10-26): the Stop wears the disabled ↻'s fade, and still takes a press.
ok("STOP-FADED: and it is faded like ↻ beside it",
   await page.eval("(() => { const s = document.querySelector('#cont[data-stop]'), r = document.querySelector('#nextrow [data-re]');"
     + " return !!s && !!r && r.disabled && !s.disabled && getComputedStyle(s).opacity === getComputedStyle(r).opacity; })()"));
ok("  and lands", await until("!document.getElementById('ghost')", 120) && (await models()) === m1 + 1);
ok("FOLDS: and the box stays folded with the three buttons", await until("document.getElementById('dock').classList.contains('folded')", 40));

// ---- hold the quill: Talk, in the same box
await open();
const m2 = await models();
await page.hold('#quill', 900);
ok("HOLD-TALKS: holding the quill turns the box to Talk", await talking());
ok("  and writes nothing", (await models()) === m2 && !(await page.eval("!!document.getElementById('ghost')")));
ok("HOLD-HIDES: the mode row hides", !(await shown('#modes')));
ok("HOLD-SAME-BOX: the same box and Send are on screen, for Anansi",
   (await shown('#input')) && (await shown('#send'))
   && /Ask Anansi/.test(await page.eval("document.getElementById('input').placeholder")));
ok("HINT-GOES: once a hold has worked, the hint is gone", !(await page.eval("!!document.querySelector('.quillcell .holdhint')")));
await page.eval(`(() => { const i = document.getElementById('input'); i.value = 'Who keeps the silver key?';
  i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await press('#send');
ok("HOLD-SENDS-TO-TALK: Send asks Anansi, and the question is in the conversation above the box",
   await until("!location.hash.endsWith('/anansi') && document.getElementById('side').hidden"
     + " && (document.getElementById('talkthread')?.textContent ?? '').includes('Who keeps the silver key?')", 40));
ok("  and no passage was written", (await models()) === m2);
await open();
ok("HINT-STAYS-GONE: after a hold the hint does not come back on the next load",
   !(await page.eval("!!document.querySelector('.quillcell .holdhint')")));

// ---- Talk without a hold: on the dial
await page.click('#quill');
await page.mode('talk');
ok("TALK-DIAL: Talk to Anansi on the dial turns the box to Talk", await talking());
// TALK, FULL SCREEN (2026-10-29): the composer's own Full screen, with the conversation above the box.
// (The reload above emptied it, so the thread holds its openings; test/app.ts checks the turns.)
await press('[data-bigin]');
await wait(300);
{
  const m = JSON.parse(await page.eval("(() => { const t = document.getElementById('talkthread'), i = document.getElementById('input');"
    + " const a = t?.getBoundingClientRect(), b = i?.getBoundingClientRect();"
    + " return JSON.stringify({ thread: a ? [Math.round(a.top), Math.round(a.bottom)] : null, input: b ? [Math.round(b.top), Math.round(b.bottom)] : null,"
    + " said: !!t, big: document.getElementById('dock').classList.contains('big') }); })()"));
  ok(`TALK-FULL: See the conversation fills the screen with it, above the box (${JSON.stringify(m)})`,
     !!m.thread && !!m.input && m.thread[1] - m.thread[0] > 80 && m.input[1] - m.input[0] > 40
     && m.thread[1] <= m.input[0] + 1 && m.said && m.big);
}
ok("  and the drawer is not open over it", await page.eval("document.getElementById('side').hidden"));
await press('[data-bigin]');
await wait(200);
await press('#talkhead [data-dockwrite]');
await wait(200);
ok("  and Back to writing turns it back", (await shown('#modes')) && !(await talking()));

// ---- the keyboard: Alt+T, and typing opens the folded bar
await page.eval("(() => { document.activeElement?.blur(); return 1; })()");
await page.key('t', 84, 1);
ok("KEY-ALT-T: Alt+T turns the box to Talk", await talking());
await page.key('Escape', 27);
ok("  and Esc leaves it", !(await talking()));
await open();
await page.eval("(() => { document.activeElement?.blur(); return 1; })()");
await page.key('H', 72);
ok("KEY-TYPE-OPENS: typing with the bar folded opens the box and the letter lands in it",
   (await shown('#input')) && (await page.eval("document.getElementById('input').value")) === 'H');

// ---- the bulb, under the last passage: an idea per mode, one picked into the box, in its mode
await open();
ok("BULB-WHERE: the bulb is under the last passage, beside the line about a passage's actions",
   await page.eval(`(() => { const b = document.querySelector('#col .carry [data-idea]'), h = document.querySelector('#col .carry .taphint');
     if (!b || !h) return false; const x = b.getBoundingClientRect(), y = h.getBoundingClientRect();
     return x.height > 0 && y.height > 0 && Math.abs((x.top + x.bottom) / 2 - (y.top + y.bottom) / 2) < 12 && x.right <= y.left + 1; })()`));
ok("  and the ideas are no longer on the bar", !(await page.eval("!!document.querySelector('#nextbar [data-idea]')")));
await press('#col .carry [data-idea]');
ok("IDEA-MODES: the bulb shows Anansi's four ideas, one per mode",
   await until("document.querySelectorAll('#col #ideas .idea').length === 4", 60));
ok("  each named by its mode, with the words that came back", (await page.eval("document.querySelectorAll('#ideas .idea')[1]?.textContent ?? ''"))
   .replace(/\s+/g, ' ').trim().startsWith('Act The second fake idea'));
await press('#ideas .idea:nth-child(2)');
await wait(250);
ok("IDEA-PICK: picking one puts it in the box, the box open",
   (await shown('#input')) && (await page.eval("document.getElementById('input').value")).includes('second fake idea'));
ok("  in its own mode, Act, unsent", (await page.eval("document.querySelector('[data-modesel]').value")) === 'act'
   && !(await page.eval("!!document.getElementById('ghost')")));
ok("  and the choices go", !(await page.eval("!!document.getElementById('ideas')")));

// ---- the header: the title opens this tale's Threads, ⋯ the menu, and the dial is gone
await open();
await page.click('#quill');
ok("CHIP-GONE: there is no Threads dial above the box", !(await page.eval("!!document.querySelector('[data-threadsel]')"))
   && !/Threads/.test(await page.eval("document.getElementById('modes')?.textContent ?? ''")));
await press('#bar [data-goblock="threads:"]');
ok("TITLE-THREADS: the tale's title opens this tale's Threads",
   await until("location.hash.endsWith('/threads') && !document.getElementById('side').hidden", 30));
ok("THREADS-ADD: and Add a thread is at the top of that list",
   await page.visible('#side [data-newlore]'));
await open();
await page.click('#bar .pill[data-railview="story"]');
ok("MENU-DOTS: the ⋯ opens the tale's menu", await until("document.documentElement.dataset.uiRail === 'open'", 20));

// ---- 44px to the finger, at 390 wide and on the 360 square
const sizes = () => page.eval(`[...document.querySelectorAll('#nextrow button, #col .carry [data-idea], #ideas .idea')]
  .filter((b) => b.getBoundingClientRect().height > 0)
  .map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height),
    n: b.getAttribute('aria-label') || b.textContent.trim().slice(0, 12) }; })`);
await open();
await press('#col .carry [data-idea]');
await until("document.querySelectorAll('#ideas .idea').length === 3", 60);
let small = (await sizes()).filter((x) => x.w < 44 || x.h < 44);
ok(`TARGETS-390: every button on the bar, the bulb and the ideas are 44px both ways at 390 wide (${JSON.stringify(small)})`,
   small.length === 0 && (await sizes()).length === 7);
await page.viewport(360, 360);
await open();
small = (await sizes()).filter((x) => x.w < 44 || x.h < 44);
ok(`TARGETS-360: and on the 360 square (${JSON.stringify(small)})`, small.length === 0 && (await sizes()).length >= 3);
ok("  and all three are on screen there", await page.eval(`[...document.querySelectorAll('#nextrow button')]
  .every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0; })`));

// ---- and the hint stops after a few loads even with no hold
await page.eval("(() => { localStorage.setItem('anansi.holdhint', '0'); return 1; })()");
for (let i = 0; i < 5; i++) await page.goto(B + "/#" + sid);
ok("HINT-FEW-SHOWN: on the fifth load the hint is still said",
   !!(await page.eval("!!document.querySelector('.quillcell .holdhint')")));
await open();
ok("HINT-FEW: a sixth load later the hint has stopped, hold or no hold",
   !(await page.eval("!!document.querySelector('.quillcell .holdhint')")));

console.log(red ? `\n  ${red} RED` : "\n  all green");
