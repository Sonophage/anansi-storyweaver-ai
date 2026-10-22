// The six-panel rearrangement. Eight rows became six, and the point is not the count: the
// chapter's business used to be spread across four of them (Story & chapter, Trajectory, What the
// chapter added, Branches) and lore had no home inside a story at all.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/panels.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");
const rail = () => page.eval("[...document.querySelectorAll('#rail [data-nav]')].map(b => b.dataset.nav).join(',')");
const head = () => page.eval("document.querySelector('#sideHead .serif')?.textContent ?? ''");

await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await rail()); i++) await wait(250);

// ---- 1. the rail, in order
const nav = await rail();
console.log("  rail: " + nav);
// Seth's stated order — story/chapter/threads/context/search/storyteller. Anansi was APPENDED at
// the end until 2026-08-27, when he asked for it "beside threads"; it sits between Threads and
// Strings now, and everything else still reads exactly as he wrote it.
// Search went to the top on 2026-08-27, and Anansi came OFF the rail the same day for the
// composer row — asking her something is a thing you do while writing rather than a place you
// navigate to. The panel is still there, still deep-linkable, and section 19 below still opens it.
// Chapters joined on 2026-09-02, next to Chapter — Seth: "instead of the chapter list being where
// it is make it it's own panel." Chapter is the one you are IN and this is all of them, so they sit
// together and in that order.
ok(`the rail lists the panels in the order asked for (${nav})`,
   nav === 'search,waiting,story,chapter,chapters,threads,strings,context,teller');
ok("  and Trajectory, What the chapter added and Branches are no longer rows of their own",
   !/traj|queue|branches/.test(nav));

// ---- 2. every row opens a panel with content in it. A nav row pointing at a panel that no
// longer exists renders an empty tray, which is exactly what a rename gets wrong.
for (const [k, label] of [['story', 'Story'], ['chapter', 'This chapter'], ['threads', 'Threads'],
                          ['context', 'Context'], ['search', 'Prose search'], ['teller', 'Storyteller']]) {
  await page.click(`[data-nav="${k}"]`);
  await wait(500);
  const body = (await page.text('#sideBody') || '').replace(/\s+/g, ' ').trim();
  ok(`${label} opens with something in it (${body.length} chars)`, body.length > 20);
  ok(`  titled ${JSON.stringify(label)}`, (await head()).trim() === label);
}

// ---- 3. Chapter holds all four things that used to be separate rows
await page.click('[data-nav="chapter"]');
await wait(600);
const chapter = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
// TWO HALVES OF THE BRIEF since 2026-09-02, where there was one box worded "This chapter must end
// with": how it starts reaches the model for the first passage only, where it ends reaches it as a
// direction on every call. Seth: "it tries to end the chapter early if it uses it that way."
for (const [what, re] of [['the chapter name', /Name/],
                          ['how it starts', /How this chapter starts/],
                          ['where it ends', /Where this chapter ends/],
                          ['what the chapter added', /What this chapter added/],
                          ['the summaries', /Summaries in context/], ['branches', /Branches/],
                          ['and closing it', /End this chapter/]]) {
  ok(`Chapter holds ${what}`, re.test(chapter));
}
// AND THE OLD DEMAND IS GONE FROM THE SURFACE TOO, not just from the prompt: the wording is what
// made a writer believe the box was a requirement, and it was the same words in both places.
ok("  and no longer says a chapter MUST end with anything", !/must end with/.test(chapter));
ok("  and the fields are real inputs, not labels",
   await page.eval("!!document.querySelector('[data-chapter-title]') && !!document.querySelector('[data-chapter-note]') && !!document.querySelector('[data-chapter-opens]')"));
// "Where this is going" was the third row here until 2026-08-30. Asserted GONE rather than dropped
// from the list above, because a removal nobody checks is a removal that comes back: this box was
// on two surfaces and in four prompts, and the whole point was that a writer never meets it again.
ok("  and no longer offers Where this is going, on this panel or any other",
   !/Where this is going/.test(chapter)
     && await page.eval("!document.querySelector('[data-story=\"direction\"]')"));

// ---- 3b. The hatch. The prose window closes at the chapter boundary on 2026-08-27, so this is
// the only way back to a chapter the model has stopped seeing. `keep_whole` had been honoured by
// the engine since it was written and had no control anywhere — a finished feature with no door,
// which is this repo's recurring failure.
{
  const pull = () => page.eval("(() => { const b = document.querySelector('[data-pullback]');"
    + " return b ? { on: b.dataset.on, text: b.textContent.trim().slice(0, 40) } : null; })()");
  // THE SUMMARIES ARE BEHIND A TAB SINCE 2026-09-03. The Chapter panel is four groups and opens on
  // This chapter; every other group is display:none, so the button was in the DOM with no box and
  // the click died rather than going red. Asserted as VISIBLE rather than merely pressed, because
  // "the tab shows what it says it shows" is the half a click alone cannot tell you.
  await page.click('[data-chaptab="summaries"]');
  await wait(300);
  ok('  the Summaries tab is what brings the pull-back control on screen',
     await page.visible('[data-pullback]'));
  const p0 = await pull();
  ok(`the summaries list offers a way to pull a chapter back (${JSON.stringify(p0?.text ?? null)})`,
     !!p0 && p0.on === '1');
  await page.click('[data-pullback]');
  await wait(900);
  const p1 = await pull();
  ok(`  pressing it sends that chapter whole (${JSON.stringify(p1?.text ?? null)})`,
     !!p1 && p1.on === '0');
  // It has to survive a rename, which is the bug that was sitting under it: updateChapter wrote
  // keep_whole unconditionally and every caller sends only a title and a note.
  await page.eval("(() => { const el = document.querySelector('[data-chapter-title]');"
    + " el.value = 'Renamed while pulled back'; return 1; })()");
  await page.click('[data-savestory="1"]');
  await wait(1200);
  ok("  and renaming the chapter does not switch it off again", (await pull())?.on === '0');
  // And back off, because a hatch you cannot shut is a window that never closes.
  await page.click('[data-pullback]');
  await wait(900);
  ok("  pressing it again lets the chapter go", (await pull())?.on === '1');
  // WAIT FOR THE MANIFEST TO SETTLE before leaving this section. Every press here refreshes it,
  // and `refreshManifest` clears MANI while the /tokenize round trip is in flight — so walking on
  // immediately left the top bar with no context reading and turned section 7 red, two sections
  // later, for something this block did. Poll the thing itself rather than sleeping at it.
  for (let i = 0; i < 40; i++) {
    if (/Context \d+%|No room/.test(await page.text('#bar') || '')) break;
    await wait(250);
  }
}

// ---- 3b2. A chapter summary edited by hand (#43): Edit, the live word count, Save, Cancel, and
// emptying in two presses. The seeded book's earlier chapters have summaries and NO prose, and a
// hand save on a chapter with no prose is refused — so the summary under edit is the current
// chapter's, written through the route first. The route itself is covered in test/scope.ts; this
// is the surface.
{
  const cur = (await story()).currentChapter.id;
  // PRESSED THROUGH EVAL, NOT page.click. A click on a button that is not there kills the
  // scenario, and the red the assertion after it would have reported is lost with it: a broken
  // Cancel leaves no Edit to press, a one-press clear leaves no second Save.
  const press = (sel) => page.eval(`(() => { document.querySelector('${sel}')?.click(); return 1; })()`);
  const sumOf = async (id) => ((await story()).chapters.find((c) => c.id === id) ?? {}).summary ?? null;
  const put = await page.eval(`(async () => (await (await fetch('/api/summary', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId: '${sid}',
    chapterId: '${cur}', summary: 'Aldis keeps the key.' }) })).json()).error ?? 'saved')()`);
  ok(`  the fixture summary is saved through the route (${put})`, put === 'saved');
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await rail()); i++) await wait(250);
  await page.click('[data-nav="chapter"]');
  await wait(500);
  await page.click('[data-chaptab="summaries"]');
  await wait(300);
  const cards = await page.eval(`[...document.querySelectorAll('[data-sumcard]')].map(c => c.dataset.sumcard).join(',')`);
  const all = (await story()).chapters.map((c) => c.id).join(',');
  ok(`the Summaries list shows every chapter up to the one being written (${cards})`, cards === all);
  const author = (id) => page.eval(`document.querySelector('[data-sumcard="${id}"] [data-sumauthor]')?.textContent ?? ''`);
  ok(`  a hand summary says it is yours (${await author(cur)})`, /yours/i.test(await author(cur)));
  const first = (await story()).chapters[0].id;
  ok(`  and Anansi's says so (${await author(first)})`, /Anansi/.test(await author(first)));
  // EVERY CARD SAYS HOW LONG ITS SUMMARY IS, not only the one being edited: the count is the prompt
  // space each one takes, and the list is where a writer compares them.
  const counted = await Promise.all((await story()).chapters.filter((c) => c.summary).map(async (c) => {
    const n = c.summary.trim().split(/\s+/).length;
    const text = await page.eval(`document.querySelector('[data-sumcard="${c.id}"]')?.textContent ?? ''`);
    return new RegExp(`\\b${n} words?\\b`).test(text.replace(/\s+/g, ' ')) ? '' : `${c.id} lacks "${n} words"`;
  }));
  ok(`  every summary card shows its word count (${counted.filter(Boolean).join('; ') || 'all'})`,
    counted.every((x) => !x));
  // ONE SUMMARISE FOR THE CURRENT CHAPTER. Its card carries Summarise again once it has a summary,
  // so the button at the foot of the list would be the same press twice.
  const foot = () => page.eval(`!!document.querySelector('#sideBody [data-summarize="1"]')`);
  ok('  and with the current chapter on the list, there is no second Summarise at its foot', !(await foot()));

  await press(`[data-editsum="${cur}"]`);
  await wait(300);
  const box = () => page.eval(`(() => { const t = document.querySelector('[data-sumtext]');
    const c = t?.closest('[data-sumcard]'), w = c?.querySelector('[data-wordwarn]');
    return t ? { text: t.value, count: c?.querySelector('[data-wordcount]')?.textContent ?? '',
      counts: (c.textContent.replace(/\\s+/g, ' ').match(/\\b\\d+ words?\\b/g) ?? []).length,
      warn: !!w && w.offsetParent !== null, save: !!document.querySelector('[data-savesum]:not([disabled])') } : null; })()`);
  const b0 = await box();
  ok(`Edit opens the summary in a text box (${JSON.stringify(b0?.text)})`, b0?.text === 'Aldis keeps the key.');
  ok(`  with its word count (${b0?.count})`, /^4 words/.test(b0?.count ?? ''));
  const type = (s) => page.eval(`(() => { const t = document.querySelector('[data-sumtext]'); if (!t) return 0; t.value = ${JSON.stringify(s)};
    t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await type(Array(200).fill('word').join(' '));
  const b1 = await box();
  ok(`  the count follows the typing (${b1?.count})`, /^200 words/.test(b1?.count ?? ''));
  ok('  past 180 words a quiet warning shows, and Save is still there', b1?.warn === true && b1?.save === true);
  ok(`  and the card shows one count while editing, not two (${b1?.counts})`, b1?.counts === 1);
  await type('Aldis keeps the key and says nothing.');
  const b2 = await box();
  ok(`  and under it the warning goes (${b2?.count})`, b2?.warn === false && /^7 words/.test(b2?.count ?? ''));
  // A REPAINT MID-EDIT PUTS THE SAME WORDS BACK. The Chapter row repaints the panel.
  await press('#rail [data-nav="chapter"]');
  await wait(400);
  const b3 = await box();
  ok(`  a repaint keeps what was typed (${JSON.stringify(b3?.text)})`,
    b3?.text === 'Aldis keeps the key and says nothing.' && /^7 words/.test(b3?.count ?? ''));
  await press('[data-cancelsum]');
  await wait(300);
  ok('Cancel leaves the summary exactly as it was', (await sumOf(cur)) === 'Aldis keeps the key.'
    && !(await page.eval("!!document.querySelector('[data-sumtext]')")));

  await press(`[data-editsum="${cur}"]`);
  await wait(300);
  await type('Aldis keeps the key, and the bell says nothing.');
  await press(`[data-savesum="${cur}"]`);
  await wait(900);
  ok('Save stores the new text', (await sumOf(cur)) === 'Aldis keeps the key, and the bell says nothing.');
  const shown = await page.eval(`document.querySelector('[data-sumcard="${cur}"]')?.textContent ?? ''`);
  ok('  and the card shows it, and the editor is closed', /the bell says nothing/.test(shown)
    && !(await page.eval("!!document.querySelector('[data-sumtext]')")));

  await press(`[data-editsum="${cur}"]`);
  await wait(300);
  await type('   ');
  await press(`[data-savesum="${cur}"]`);
  await wait(900);
  ok('saving it empty does nothing on the first press', (await sumOf(cur)) !== null);
  await press(`[data-savesum="${cur}"]`);
  await wait(900);
  ok('  and removes the summary on the second', (await sumOf(cur)) === null);
  ok('  and with the current chapter off the list, Summarise this chapter is back at its foot', await foot());
}

// ---- 3b3. Summarise again on an OLDER chapter (#45). Until #45 the only Summarise sent the current
// chapter, so a stale summary behind it stayed out of the prompt with nothing on screen to bring it
// back. Its own book, because it closes a chapter, and The Silver Key's current chapter is what
// every later section reads.
//
// NO MODEL. The route's half — the re-run lands on the chapter it is given and is current — is in
// test/memory.ts against a fake. What only a browser can show is which chapter the CARD sends and
// that the card repaints, so the summarise request is answered by a hand save of the chapter it
// names: the server's stale check still decides whether the note goes.
{
  const made = JSON.parse(await page.eval(`(async () => {
    const post = (u, b) => fetch(u, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(b) }).then((r) => r.json());
    const r = await post('/api/stories', { title:'Summarise Again', genre:'test', premise:'x', pov:'third past' });
    const id = r.storyId ?? r.id ?? (r.stories && r.stories.at(-1).id);
    await post('/api/write', { storyId:id, body:'The bell rang once and nobody came down for it.' });
    const v0 = await (await fetch('/api/story?story=' + id)).json();
    const first = v0.currentChapter.id;
    await post('/api/summary', { storyId:id, chapterId:first, summary:'The bell rings once.' });
    await post('/api/chapter/end', { storyId:id, summarise:false, remember:false, extract:false, retire:false });
    await post('/api/write', { storyId:id, body:'Morning, and the square was empty.' });
    // Chapter one's prose moves under its summary, which makes the summary stale.
    const p = v0.passages.find((x) => x.chapterId === first && !x.isBreak);
    await post('/api/passage', { storyId:id, id:p.id, body:'The bell rang twice and somebody came down.' });
    const v1 = await (await fetch('/api/story?story=' + id)).json();
    return JSON.stringify({ id, first, current: v1.currentChapter.id,
      stale: v1.chapters.find((c) => c.id === first)?.summaryStale ?? null }); })()`));
  ok(`a book whose first chapter's summary is stale, one chapter on (${made.stale})`,
     made.stale === true && made.current !== made.first);

  await page.goto(B + "/#" + made.id);
  for (let i = 0; i < 40 && !(await rail()); i++) await wait(250);
  await page.click('[data-nav="chapter"]');
  await wait(500);
  await page.click('[data-chaptab="summaries"]');
  await wait(300);
  const card = () => page.eval(`document.querySelector('[data-sumcard="${made.first}"]')?.textContent ?? ''`);
  ok('the older card says its summary is stale', /Stale/.test(await card()));
  // THE NOTE, NOT THE CARD. The card's own Summarise again and Edit buttons match both words, so
  // reading the whole card passed with the old "until it is re-run" note in place.
  const note0 = await page.eval(`[...document.querySelectorAll('[data-sumcard="${made.first}"] .hint')]
    .map((h) => h.textContent).find((t) => /Stale/.test(t)) ?? ''`);
  ok(`  and that summarising it again or editing it brings it back (${note0})`,
     /summari[sz]ed? again/i.test(note0) && /edit/i.test(note0));
  const btn = await page.eval(`document.querySelector('[data-sumcard="${made.first}"] [data-summarize]')?.textContent.trim() ?? null`);
  ok(`  and offers Summarise again (${JSON.stringify(btn)})`, /Summarise again/.test(btn ?? ''));

  await page.eval(`(() => { const real = window.__realFetch = window.fetch;
    window.fetch = async (u, o) => {
      if (!String(u).includes('/api/summarize')) return real(u, o);
      const b = JSON.parse(o.body); window.__sumAsked = b.chapterId; window.__sumReplace = b.replace ?? null;
      return real('/api/summary', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ storyId:b.storyId, chapterId:b.chapterId, summary:'The bell rings twice, and somebody comes.' }) });
    }; return 1; })()`);
  // YOURS TAKES TWO PRESSES (#46). This book's first summary was saved by hand above, so it is
  // yours: the first press asks and sends nothing, the second sends `replace`.
  const pressAgain = () => page.eval(`(() => { document.querySelector('[data-sumcard="${made.first}"] [data-summarize]')?.click(); return 1; })()`);
  await pressAgain();
  await wait(500);
  const asked1 = await page.eval('window.__sumAsked ?? null');
  const said = ((await page.text('#toast')) || '').trim();
  ok(`one press of Summarise again over yours sends nothing (${asked1})`, asked1 === null);
  ok(`  and asks first (${JSON.stringify(said)})`,
     said === "Press again — this replaces your summary with Anansi's.");
  await pressAgain();
  for (let i = 0; i < 20 && /Stale/.test(await card()); i++) await wait(250);
  const asked = await page.eval('window.__sumAsked ?? null');
  const replace = await page.eval('window.__sumReplace ?? null');
  await page.eval('(() => { if (window.__realFetch) window.fetch = window.__realFetch; return 1; })()');
  ok(`the second press sends that card's chapter (${asked === made.first ? 'its own' : asked})`, asked === made.first);
  ok(`  and asks to replace yours (${replace})`, replace === true);
  ok('  and the stale note goes', !/Stale/.test(await card()) && /rings twice/.test(await card()));
}

// ---- 3b4. Anansi's summary still re-runs on ONE press (#46): the guard is for yours only. The
// Silver Key's first chapter carries Anansi's summary from the seed. The request is caught and
// answered with an error, so no model is needed; what is asserted is that it was sent.
{
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await rail()); i++) await wait(250);
  await page.click('[data-nav="chapter"]');
  await wait(500);
  await page.click('[data-chaptab="summaries"]');
  await wait(300);
  const first = (await story()).chapters[0].id;
  await page.eval(`(() => { const real = window.__realFetch = window.fetch; window.__sumAsked = null;
    window.fetch = async (u, o) => {
      if (!String(u).includes('/api/summarize')) return real(u, o);
      const b = JSON.parse(o.body); window.__sumAsked = b.chapterId; window.__sumReplace = b.replace ?? null;
      return new Response(JSON.stringify({ error: 'caught by the test' }), { headers: { 'Content-Type': 'application/json' } });
    }; return 1; })()`);
  await page.eval(`(() => { document.querySelector('[data-sumcard="${first}"] [data-summarize]')?.click(); return 1; })()`);
  await wait(600);
  const asked = await page.eval('window.__sumAsked ?? null');
  const replace = await page.eval('window.__sumReplace ?? null');
  await page.eval('(() => { if (window.__realFetch) window.fetch = window.__realFetch; return 1; })()');
  ok(`one press of Summarise again over Anansi's sends it (${asked === first ? 'its own' : asked})`, asked === first);
  ok(`  without asking to replace anything (${replace})`, !replace);
}

// ---- 3c. A thread's body is not cut off.
//
// It was a fixed 96px box, and an invented thread went from 60-120 words to 120-200 on
// 2026-08-27 — so two thirds of a body sat below the fold with nothing saying there was more.
// Measured before the fix: 656 characters, 94px of box, 283px of content. This is the one place a
// unit check cannot stand in for a browser: the markup was always right, the LAYOUT was wrong.
{
  await page.goto(B + "/#" + sid + "/threads");
  for (let i = 0; i < 40 && !(await page.visible('#sideBody .card')); i++) await wait(250);
  const opened = await page.eval("(() => { const cs = [...document.querySelectorAll('#sideBody .card')];"
    + " const c = cs.sort((a, b) => (b.textContent||'').length - (a.textContent||'').length)[0];"
    + " if (!c) return false; c.click(); return true; })()");
  await wait(900);
  // The card lands on its face; this section is about the FORM's body field not being cut off, so
  // it has to open the form first. Pressing it here rather than changing what is asserted: the
  // growing textarea is still the thing under test and it still lives in the form.
  await page.eval("(() => { document.querySelector('[data-cardview=\"form\"]')?.click(); return 1; })()");
  await wait(600);
  const box = await page.eval("(() => { const t = document.querySelector('textarea[data-f]');"
    + " return t ? JSON.stringify({ chars: t.value.length, client: t.clientHeight, scroll: t.scrollHeight }) : null; })()");
  const b2 = box ? JSON.parse(box) : null;
  ok(`a thread opens in an editor (${opened})`, !!b2);
  ok(`  and its body is not cut off (${b2 ? b2.chars + " chars, " + b2.client + "px of " + b2.scroll : "no field"})`,
     !!b2 && b2.scroll <= b2.client + 4);
  // PUT THE PAGE BACK. Section 4 below is written against the Chapter panel — this block navigated
  // away, so it found nothing and threw, and took the remaining 124 assertions with it. A section
  // that moves the page owes the next one the state it was handed.
  //
  // It waited on [data-story="direction"] until that field was removed; the chapter's own beat box
  // is the thing that is always on this panel now.
  await page.goto(B + "/#" + sid + "/chapter");
  for (let i = 0; i < 40 && !(await page.visible('[data-chapter-note]')); i++) await wait(250);
}

// ---- 4. Saving from Chapter must not blank the story. updateStory was a full-row UPDATE, so a
// panel holding one [data-story] field bound undefined to every other column — the Trajectory
// panel's Save answered 500 for exactly this reason.
//
// THE CASE GOT SHARPER WHEN `direction` WENT. This panel held exactly one [data-story] field and
// now holds NONE, so its Save sends an EMPTY patch — which is the most extreme version of the same
// question, and the one a full-row UPDATE would answer by wiping the book. The chapter's own two
// fields still have to land, or Save on this panel does nothing at all.
const before = (await story()).story;
// THREE FIELDS, NOT TWO, since 2026-09-02: the brief is how the chapter starts and where it ends,
// two columns because they reach the model differently. Seth: "the where this is going should be
// how does this start and where does it end." Both are typed here, so a save that carries one and
// drops the other goes red.
ok("the chapter panel offers both halves of the brief and a way to have them written",
   (await page.visible('[data-chapter-opens]')) && (await page.visible('[data-chapter-note]'))
   && (await page.visible('[data-chbrief]')));
ok("  and says which is which", /How this chapter starts/.test(await page.text('#sideBody') || '')
   && /Where this chapter ends/.test(await page.text('#sideBody') || ''));
await page.eval("(() => { const t = document.querySelector('[data-chapter-title]');"
  + " const n = document.querySelector('[data-chapter-note]');"
  + " const o = document.querySelector('[data-chapter-opens]');"
  + " t.value = 'The Debt Falls Due'; o.value = 'The room is already cold when she comes in.';"
  + " n.value = 'She hands the key over and keeps the debt.'; return 1; })()");
await page.click('[data-savestory="1"]');
await wait(1200);
const after = (await story()).story;
const ch4 = (await story()).currentChapter ?? {};
ok(`saving from Chapter lands the chapter's own fields (${JSON.stringify(String(ch4.title || '').slice(0, 34))})`,
   ch4.title === 'The Debt Falls Due' && /keeps the debt/.test(ch4.authorsNote || ''));
ok(`  including how it starts (${JSON.stringify(String(ch4.opensWith || '').slice(0, 30))})`,
   /already cold/.test(ch4.opensWith || ''));
ok("  and does NOT blank the story it did not mention",
   after.title === before.title && after.genre === before.genre && after.premise === before.premise);
ok(`  including the ones a select holds (pov ${JSON.stringify(after.pov)}, spice ${after.spice})`,
   after.pov === before.pov && after.spice === before.spice);
const toast = (await page.text('#toast') || '').trim();
ok(`  and it says it saved rather than erroring (${JSON.stringify(toast.slice(0, 40))})`, /Saved/i.test(toast));

// ---- 5. Story keeps the book-level fields and loses the chapter's
await page.click('[data-nav="story"]');
await wait(500);
const storyBody = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
ok("Story still holds the book's own fields", /Setting/.test(storyBody) && /Point of view/.test(storyBody));
ok("  and taking it with you", /Take it with you/.test(storyBody));
// ON THE LABEL THE PANEL ACTUALLY USES. This read `!/must end with/` — the wording of the chapter's
// old single box — and that phrase left the app entirely on 2026-09-02, so the check could no
// longer fail. Both of the chapter's boxes are named here instead.
ok("  but no longer the chapter's",
   !/How this chapter starts/.test(storyBody) && !/Where this chapter ends/.test(storyBody));
ok("  and no chapter inputs are left behind on it",
   await page.eval("!document.querySelector('[data-chapter-title]')"));

// ---- 6. Threads holds every kind of card, not just the cast
await page.click('[data-nav="threads"]');
await wait(500);
const threads = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
console.log("  threads groups: " + (threads.match(/Characters|Lore|Items|Rules/g) || []).join(','));
ok("Threads groups the cards by kind", /Characters/.test(threads));
const kinds = new Set((await story()).entries.map((e) => e.entryType));
ok(`  and every kind this story has is shown (${[...kinds].join(',')})`,
   [...kinds].every((k) => new RegExp({ character: 'Characters', lore: 'Lore', item: 'Items', rule: 'Rules' }[k]).test(threads)));
// ONE DOOR TO ALL FOUR KINDS. The four New-* buttons came off this panel on 2026-09-02; the tray
// they were beside opens on the same four kinds and ends in the same data-newentry press, which is
// what "any functionality that these buttons may have carry over" means. Asserted on the tray's
// kind chips, because those are what the four buttons became.
await page.click('#sideBody [data-newlore]');
await wait(500);
ok("  with a way to add each kind",
   (await page.eval("[...document.querySelectorAll('[data-lorekind]')].map(b => b.dataset.lorekind).sort().join(',')"))
     === 'character,item,lore,rule');
ok("  and the four buttons that used to say so are gone",
   !(await page.eval("!!document.querySelector('#sideBody [data-newentry]')")));
await page.click('#sideBody [data-newlore]');
await wait(400);

// ---- 6b. THE STORY PANEL IS FOUR GROUPS, AND SWITCHING CANNOT LOSE WHAT YOU TYPED (2026-09-02).
// Seth: "this is so much information that its overwhelming. give it filter buttons to reach the
// information." Every box in that panel is free text that Save commits, so the groups are shown and
// hidden in CSS rather than by redrawing — and that is the half worth driving: a repaint on a tab
// press would throw away a half-written premise, which is the bug this app has recorded seven times.
// TYPED, SWITCHED, AND READ BACK, because the assertion has to be the thing a writer would lose.
await page.goto(B + "/#" + sid + "/story");
await wait(900);
ok("the story panel opens on the voice group", await page.eval(
  "document.querySelector('[data-tab]')?.dataset.tab === 'voice'"));
ok("  with a chip for each of the four", (await page.eval(
  "document.querySelectorAll('[data-storytab]').length")) === 4);
const oneShown = () => page.eval(
  "[...document.querySelectorAll('.sgroup')].filter(g => getComputedStyle(g).display !== 'none').map(g => g.dataset.group).join(',')");
ok(`  and exactly one group on screen (${await oneShown()})`, (await oneShown()) === 'voice');
await page.eval("(() => { const t = document.querySelector('#f-story-premise'); t.value = 'HALF TYPED'; return 1; })()");
await page.click('[data-storytab="book"]');
await wait(400);
ok(`  pressing The book shows that group and only it (${await oneShown()})`, (await oneShown()) === 'book');
ok("  and Save is still there, on every group", await page.visible('.savebar [data-savestory]'));
await page.click('[data-storytab="voice"]');
await wait(400);
ok("  and the half-typed premise survived both presses", (await page.eval(
  "document.querySelector('#f-story-premise')?.value")) === 'HALF TYPED');

// ---- 6c. THE CHAPTERS PANEL (2026-09-02). Seth: "instead of the chapter list being where it is
// make it it's own panel. Make it the name of the chapter the first sentence and how many words
// and. A few stats."
// It was a fold inside the passage tray carrying bare chapter names — forty rows in a strip meant
// to be glanced at, and reachable only by standing on a paragraph first. Asserted from both sides:
// the panel says what each chapter IS, and the old fold is gone from the document.
await page.goto(B + "/#" + sid + "/chapters");
for (let i = 0; i < 40 && !(await page.visible('#sideBody [data-chapter]')); i++) await wait(250);
const chapRows = await page.eval(`(() => {
  const rows = [...document.querySelectorAll('#sideBody [data-chapter]')];
  return JSON.stringify(rows.map((r) => ({
    name: r.querySelector('.platename')?.textContent ?? '',
    first: r.querySelector('.clamp2')?.textContent ?? '',
    stats: [...r.lastElementChild.querySelectorAll('.tnum')].map((x) => x.textContent),
    writing: !!r.querySelector('.tag') })));
})()`).then(JSON.parse);
console.log("  chapters: " + JSON.stringify(chapRows.map((r) => r.name + ' ' + r.stats.join('/'))));
ok(`the Chapters panel lists every chapter (${chapRows.length})`,
   chapRows.length === (await story()).chapters.length && chapRows.length > 1);
ok("  each with its name", chapRows.every((r) => r.name.trim().length > 0));
// THE FIRST SENTENCE AND NOT A SUMMARY: a summary only exists for a closed chapter and is the
// model's words; the opening sentence is the book's, and it is what a writer recognises a chapter
// by. Asserted on the chapter that HAS prose — the fixture's earlier chapters are empty, and an
// empty chapter must say so rather than showing a blank row.
const withProse = chapRows.filter((r) => r.first.trim().length > 0);
ok(`  and the opening sentence of the ones that have prose (${withProse.length})`, withProse.length >= 1);
ok("  which is a SENTENCE, not the whole passage",
   withProse.every((r) => r.first.length <= 210));
// A few stats, and the words are the one Seth named. Asserted as "words appears and is a number",
// not as a value: the count is the fixture's business and would change with it.
ok("  with the word count among the stats",
   chapRows.every((r) => r.stats.some((t) => /^[\d,]+ words$/.test(t))));
ok("  and how many passages, and whether it is open or closed",
   chapRows.every((r) => r.stats.some((t) => /passages?$/.test(t))
     && r.stats.some((t) => t === 'open' || t === 'closed')));
ok("  and what the model is sent for it",
   chapRows.every((r) => r.stats.some((t) => /summar|sent whole/.test(t))));
ok("  with exactly one marked as the one you are writing",
   chapRows.filter((r) => r.writing).length === 1);
// Pressing a row moves the reading column to that chapter. `data-chapter` focuses a chapter in the
// VIEW — it does not change which chapter the server has open — so this is asserted on the reading
// row under the header rather than by re-fetching the story.
await page.click(`#sideBody [data-chapter]`);
await wait(900);
ok(`  and pressing one moves the reading column to it (${await page.text('#ctxread')})`,
   /chapter 1 of/.test((await page.text('#ctxread')) || ''));
ok("  and the panel stays open, so you can pick another",
   await page.visible('#sideBody [data-chapter]'));
// THE FOLD IT REPLACED IS GONE, not merely unused: the tray's button opens this panel now.
await page.goto(B + "/#" + sid);
await wait(700);
ok("  and the passage tray's chapter fold is gone",
   !(await page.eval("!!document.querySelector('.chaplist')"))
   && (await page.eval("!!document.querySelector('[data-panel=\"chapters\"]')")));

// ---- 6d. NO PANEL OPENS ITSELF (2026-09-02). Seth: "the context box also always auto opens and it
// shouldnt." Opening a book put the Context panel up every time, so the first thing a writer met was
// a report on the prompt rather than the page. A panel NAMED IN THE HASH still opens — that is what
// makes a deep link work — so both halves are asserted or "nothing opens" would pass with deep
// links broken too.
await page.goto(B + "/#" + sid);
await wait(1200);
ok("opening a book opens no panel by itself",
   !(await page.eval("!!document.querySelector('#sideBody [data-story], #sideBody .meter')"))
   && (await page.eval("document.documentElement.dataset.uiRail !== 'open' || true")));
ok("  and the reading column is what you land on", await page.visible('#col .block'));
await page.goto(B + "/#" + sid + "/context");
for (let i = 0; i < 40 && !(await page.text('#sideBody')); i++) await wait(250);
ok("  while a panel named in the hash still opens", (await page.text('#sideBody') || '').length > 20);

// ---- 6e. FACTS IS EDITABLE, IN THE CARD TAB, AND A CARD GOES OUT AS JSON AND BACK (2026-09-02).
//
// Seth: "facts are missing from info cards btw i cant edit the facts it should be under the card
// tab also under more i should be able to export the json of that card and all fields including
// empty ones and be able to reupload".
//
// Facts was drawn NOWHERE: the comment above Info claimed it sat there, the rooms loop excluded it
// on those grounds, and nothing rendered it — so the one room whose whole purpose is to survive the
// chapter-end rewrite was the one room that could not be edited once written.
//
// ON A CARD OF ITS OWN, made here and deleted at the end. The first version of this block wrote a
// facts room onto the fixture's Aldis and tried to undo it afterwards; four assertions further down
// this file are about a card with exactly one filled room, and they went red — then went red again
// when the restore re-created the room from an export taken after it was added. run.sh resets the
// database between scenarios and not within one, so a section that mutates the shared fixture is
// testing a different card for everything after it. Making one is cheaper than putting one back.
await page.goto(B + "/#" + sid + "/threads");
for (let i = 0; i < 40 && !(await page.visible('#sideBody [data-newlore]')); i++) await wait(250);
const cardsBefore = (await story()).entries.length;
await page.click('#sideBody [data-newlore]');
await wait(500);
await page.click('[data-lorekind="character"]');
await wait(500);
await page.click('[data-newentry="character"]');
await wait(1200);
const mine = await page.eval("(() => document.querySelector('[data-f=\"title\"]') ? 1 : 0)()");
ok("a card can be made to test on, so the fixture is left alone", mine === 1);
const mineId = (await story()).entries.length > cardsBefore
  ? (await story()).entries.at(-1).id : null;

// A facts room on it, through the tray that is the only door to an empty room.
await page.click('[data-cardtab="rooms"]');
await wait(500);
await page.eval(`(() => { const d = document.querySelector('[data-newroom]')?.closest('details'); if (d) d.open = true; return 1; })()`);
await wait(300);
await page.click('[data-newroom="facts"]');
await wait(600);
await page.eval(`(() => { document.querySelector('[data-of="name"]').value = 'Facts';
  document.querySelector('[data-of="body"]').value = '[she is 41 and left-handed]';
  document.querySelector('[data-addoutfit]')?.click(); return 1; })()`);
await wait(1400);
await page.click('[data-cardtab="card"]');
await wait(700);
const facts = await page.eval(`(() => {
  const pane = document.querySelector('.pane:not([hidden])');
  const at = pane?.querySelector('[data-slotat="facts"]');
  const body = pane?.querySelector('[data-ab]');
  const info = pane?.querySelector('#f-card-body');
  return JSON.stringify({ heading: !!at, editable: !!body, value: body?.value ?? '',
    aboveInfo: !!(at && info) && at.compareDocumentPosition(info) === 4 }); })()`).then(JSON.parse);
console.log("  facts in the card tab: " + JSON.stringify(facts));
ok("the facts room is drawn in the card tab", facts.heading);
ok("  as a field you can edit, not a chip", facts.editable && /left-handed/.test(facts.value));
// The comment above Info has claimed this position since 2026-08-30 and nothing carried it out:
// facts survives the chapter-end rewrite and Info does not, so the order teaches which is which.
ok("  and above Info, which is what makes the order mean something", facts.aboveInfo);

// The same card, out as JSON.
await page.click('[data-cardtab="more"]');
await wait(700);
const shipped = await page.eval("(() => document.getElementById('f-card-json')?.value ?? '')()");
let card = null;
try { card = JSON.parse(shipped); } catch { /* asserted below */ }
ok("the More tab exports the card as JSON", !!card && !!card.id && card.kind === 'character');
// EVERY FIELD THE KIND CAN HOLD, empty ones included — that is the ask, and it is what makes the
// file a form to fill in rather than a record of what happened to be there.
const kindSlots = ((await story()).slots?.character ?? []).map((sl) => sl.name);
ok(`  with every room this kind can have (${kindSlots.length}), empty ones included`,
   kindSlots.length > 1 && kindSlots.every((n) => Object.prototype.hasOwnProperty.call(card.rooms ?? {}, n)));
ok("  and the room that IS filled carries its text", /left-handed/.test(card.rooms?.facts ?? ''));
ok("  and the empty ones are present as empty strings",
   kindSlots.filter((n) => n !== 'facts').every((n) => card.rooms[n] === ''));

// PUTTING IT BACK UPDATES THAT CARD rather than making a second one, which is what "reupload"
// means. The id in the file is what does it; the count is what proves it.
const nBefore = (await story()).entries.length;
await page.eval(`(() => { const box = document.querySelector('[data-cardpaste]');
  const j = JSON.parse(${JSON.stringify(shipped)}); j.body = '[a card that was put back]';
  box.value = JSON.stringify(j); return 1; })()`);
await page.click('[data-cardread]');
await wait(1600);
const back = await story();
ok(`  and putting it back updates the card rather than duplicating it (${nBefore} -> ${back.entries.length})`,
   back.entries.length === nBefore);
ok("  with the edit landing on it",
   /put back/.test(back.entries.find((e) => e.id === card.id)?.body ?? ''));

// And the card goes, so every section below sees the fixture it expects.
await page.click('[data-cardview="form"]');
await wait(500);
await page.click('[data-cardtab="more"]');
await wait(500);
for (let i = 0; i < 2; i++) { await page.click('[data-delentry]'); await wait(500); }
await wait(1000);
ok(`  and the card made for this block is deleted afterwards (${cardsBefore} -> ${(await story()).entries.length})`,
   (await story()).entries.length === cardsBefore);

// ---- 7. the top bar carries the book and nothing else
// The Inspector button came off it because it opened the panel the nav row already opens. The
// context reading and the word count came off it on 2026-08-27 — Seth wanted one bar across the
// window with the numbers behind a press, so they live under #ctxbar now and section 9 proves it.
// A refusal is the exception: "No room" is the app saying it cannot write, and that has to be
// visible without pressing anything.
const bar = (await page.text('#bar') || '');
ok("the Inspector button is gone from the top bar", !/Inspector/.test(bar));
ok(`  and so is the reading — the header names the book (${JSON.stringify(bar.replace(/\s+/g, ' ').trim().slice(0, 30))})`,
   !/Context \d+%/.test(bar) && !/\d[\d,]* words/.test(bar));

// ---- 8. links written before the rearrangement still resolve
// The label became "This chapter" on 2026-09-02 — Chapter and Chapters differed by one letter on a
// rail read at 11px. The KEYS did not move, which is the whole reason these three old links still
// land: what a retired name maps onto is a key, not a word.
for (const [old, now] of [['inspector', 'Context'], ['cast', 'Threads'],
                          ['traj', 'This chapter'], ['queue', 'This chapter'],
                          ['branches', 'This chapter']]) {
  await page.goto(B + "/#" + sid + "/" + old);
  await wait(700);
  const got = (await head()).trim();
  ok(`an old #${old} link opens ${now} (got ${JSON.stringify(got)}, hash ${JSON.stringify(await page.eval('location.hash'))})`,
     got === now);
}

// ---- 9. one chapter at a time. Every chapter in one scroll was fine at three passages; at 358
// there was no way to jump to a chapter and the whole book sat in the DOM.
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#col')); i++) await wait(250);
const v = await story();
const shown = await page.eval("document.querySelectorAll('#col .block').length");
const inCh = v.passages.filter((p) => p.chapterId === v.currentChapter.id).length;
const total = v.passages.length;
console.log(`  chapters ${v.chapters.length}, showing ${shown} of ${total} passages`);
ok(`the document shows one chapter, not the book (${shown} shown, ${inCh} in this chapter, ${total} in all)`,
   shown === inCh);
// The chapter's NAME is in the band at the top of the column. Which chapter of how many moved to
// the reading under the context bar on 2026-08-27, when the running head was removed — a strip
// that opens while you are reading is a strip that interrupts reading.
ok("  and says which chapter you are on",
   ((await page.text('.band-title')) || '').trim().length > 0);
// The bar is hidden until a manifest has arrived — there is nothing to fill it with before that,
// and pressing a hidden control is the driver's own error rather than a finding. Wait for it.
for (let i = 0; i < 40 && !(await page.visible('#ctxbar')); i++) await wait(250);
ok("  the context bar is there once the manifest is", await page.visible('#ctxbar'));
await page.click('#ctxbar');
await wait(400);
ok("  with which chapter of how many behind it",
   /chapter \d+ of \d+/i.test(await page.text('#ctxread') || ''));
await page.click('#ctxbar');
await wait(200);
if (v.chapters.length > 1) {
  // The pager under the prose was removed on 2026-08-27 — "the chapter selector and the end above
  // the input should be removed from the ui". The rail's Chapters list is the one door now, and it
  // names every chapter rather than the two either side of you. Same action, so everything below
  // this still tests what it always did: that choosing a chapter actually moves the document.
  ok("  and no pager under the prose", !(await page.visible('#col [data-chapter]')));
  ok("  the rail lists every chapter to jump to", await page.visible('#rail [data-chapter]'));
  // Which chapter you are reading lives in CLIENT state — view(storyId, focusChapterId). Asking
  // /api/story again without &chapter= answers with the last chapter every time, so a fresh fetch
  // cannot see the focus at all. Read the document, which is the thing under test anyway.
  // THE BAND BY NAME, not by being the column's first child. Each chapter is wrapped in its own
  // <section class="chap" id="ch-N"> since 2026-09-01 — reading mode draws every chapter and they
  // needed a break and an anchor between them — so "#col > div" stopped matching the heading and
  // this read an empty string. A selector that names the thing it wants survives the wrapper.
  const heading = () => page.eval("document.querySelector('#col .band')?.textContent ?? ''");
  // A chapter that is NOT the one already open, or the click is a no-op that passes.
  const to = await page.eval(
    "[...document.querySelectorAll('#rail [data-chapter]')]"
    + `.map(b => b.dataset.chapter).find(id => id !== ${JSON.stringify(v.currentChapter.id)}) ?? ''`);
  const want = v.chapters.find((c) => c.id === to);
  await page.click(`#rail [data-chapter="${to}"]`);
  await wait(1200);
  const head = (await heading()).replace(/\s+/g, ' ').trim();
  console.log(`  paged to: ${JSON.stringify(head.slice(0, 60))}`);
  ok(`  and it moves you to ${JSON.stringify(want?.title ?? '')}`,
     head.toLowerCase().includes((want?.title ?? '').toLowerCase()));
  /* AND WHERE THE JUMP LANDS YOU. Seth, 2026-09-01: "pressing chapter a previous chapter should take
   * me to the top of the chapter. a current one would take me to its bottom." Two intents wearing
   * one press: a chapter you have finished is one to read, and reading starts at the top; the one you
   * are writing is one to work in, and work is at the end.
   *
   * IN A BROWSER, because it is geometry. The unit harness auto-creates any element asked for by id
   * and hands back a zero-sized rect, so the computed target came out equal to wherever the pane
   * already was and the check could not tell the two cases apart. */
  const top = await page.eval("document.getElementById('read').scrollTop");
  ok(`  and a chapter you have finished opens at its top (${top})`, top < 40);
  const open = v.chapters.find((c) => c.status === 'open');
  if (open && open.id !== to) {
    await page.click(`#rail [data-chapter="${open.id}"]`);
    await wait(1200);
    const end = await page.eval(`(() => { const r = document.getElementById('read');
      return { at: Math.round(r.scrollTop), max: Math.round(r.scrollHeight - r.clientHeight) }; })()`);
    ok(`  and the one you are writing opens at its end (${end.at} of ${end.max})`,
       end.max <= 0 || end.at >= end.max - 40);
    // Back to the chapter this block was reading, or the counts below are about the wrong one.
    await page.click(`#rail [data-chapter="${to}"]`);
    await wait(1200);
  }
  const shown2 = await page.eval("document.querySelectorAll('#col .block').length");
  const wantN = v.passages.filter((p) => p.chapterId === to).length;
  ok(`  showing that chapter's passages (${shown2}, expected ${wantN})`, shown2 === wantN);
} else { console.log("  SKIP pager — this story has one chapter"); }

// ---- 10. the setup page: everything toggles, including always-on entries. force_out is applied
// FIRST in context.ts, before the always-on branch, so holding one back has always worked in the
// engine — the panel listed them as "no ticking needed" and offered no control.
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " const e = v.entries.find(x => x.activation === 'always_on');"
  + " await fetch('/api/pin', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId:'" + sid + "', chapterId: v.currentChapter.id, entryId: e.id, mode: null }) }); })()");
await page.goto(B + "/#" + sid + "/setup");
await wait(900);
if (await page.visible('[data-setup="title"]')) {
  const always = await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
    + " return v.entries.find(e => e.activation === 'always_on' && e.entryType === 'character')?.id ?? ''; })()");
  // ---- THE RITUAL IS THREE STEPS NOW (2026-08-30). Seth: "it should show the cards that are
  // proposed to be added first as a single panel. then the premise of the next chapter is set in
  // another page. then the option of adding new cards based on that premise then it begins ...
  // right now it out of order and all in one page."
  //
  // A COLD LOAD OPENS ON THE PREMISE, not on step one: `S.setupStep` is session state and only a
  // chapter close sets it, so somebody navigating to #story/setup on purpose lands on the step
  // they came for. Asserted rather than assumed, because it is the reason the ledger controls
  // below are no longer on the first thing you see.
  const cold = await page.eval(`(() => ({
    title: !!document.querySelector('[data-setup="title"]'),
    note: !!document.querySelector('[data-setup="note"]'),
    opens: !!document.querySelector('[data-setup="opens"]'),
    steer: !!document.querySelector('[data-setup="steer"]'),
    ledger: !!document.getElementById('setupQ'),
    steps: document.querySelectorAll('[data-setupstep]').length }))()`);
  console.log("  setup cold: " + JSON.stringify(cold));
  ok(`  it opens on the premise, with title and beat together (${cold.steps} steps offered)`,
     cold.title && cold.note && cold.steps >= 3);
  // AND HOW THE CHAPTER STARTS, since 2026-09-02. This screen is where that box has to be: Save
  // and write fires the chapter's first passage, and that is the only passage it is sent for.
  ok('  and how the chapter starts, which is the passage that press writes', cold.opens === true);
  // "title and premise should be together with the option to influence."
  ok('  and a box to steer what Anansi suggests', cold.steer === true);
  ok('  with the ledger NOT on that step', cold.ledger === false);
  await page.click('[data-setupstep="more"]');
  await wait(600);
  ok("the setup page offers a filter over the ledger", await page.visible('#setupQ'));
  if (always) {
    ok("  and an always-on character is listed as a control, not as a note",
       await page.visible(`[data-pin="${always}"]`));
    await page.click(`[data-pin="${always}"]`);
    await wait(1000);
    const pins = (await story()).pins ?? [];
    const held = pins.find((p) => p.entryId === always);
    ok(`  unticking an always-on entry holds it back (${held?.mode ?? 'no pin'})`, held?.mode === 'force_out');
    // And the engine has to honour it, or the control is theatre.
    const reasons = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
      + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'continue'})})).json();"
      + " return r.manifest.blocks.filter(b => b.id === '" + always + "').map(b => b.state + ':' + b.reason).join(','); })()");
    ok(`  and the prompt drops it (${JSON.stringify(reasons)})`, /omitted:pinned out/.test(reasons));
    await page.click(`[data-pin="${always}"]`);
    await wait(1000);
    ok("  ticking again puts it back", !((await story()).pins ?? []).some((p) => p.entryId === always));
  } else { console.log("  SKIP always-on toggle — no always-on character in this story"); }
  // The filter must not eat its own keystrokes, which is how the other seven boxes broke.
  await page.type('#setupQ', 'Aldis');
  await wait(600);
  ok(`the filter keeps what you type (${JSON.stringify(await page.eval("document.getElementById('setupQ')?.value"))})`,
     (await page.eval("document.getElementById('setupQ')?.value")) === 'Aldis');
  ok("  and narrows the list", (await page.eval("document.querySelectorAll('[data-pin]').length")) <= 2);
} else { ok("the setup page opens", false); }

// ---- 11. THE COMPOSER'S DOOR IS THE LIST; the tray's door is inside it (2026-08-28).
// It was the other way round: the composer's button opened the write-it-down tray, which is a door
// to one narrow thing standing where the door to everything should be. Seth: "threads in the
// composer should open to all the threads in that story ... right now it opens the new threads
// page, which isnt necessary because we have that on the input."
//
// Both halves asserted, because moving a door is only safe if the room it left still has one — the
// tray is the ONLY way to scan the chapter for facts, to have Anansi write a card, or to hang an
// outfit on somebody, so a door that vanished would take three features with it.
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
// THE DOOR IS AN OPTION ON THE THREADS DIAL since 2026-09-02, so what is visible is the dial and
// what carries the action is the option inside it. Both asserted: a dial with no such option is the
// regression, and so is no dial at all.
ok("the composer bar carries the door to this story's threads", await page.visible('[data-threadsel]')
   && await page.eval("[...document.querySelectorAll('[data-threadsel] option')].some(o => o.dataset.goblock === 'threads:')"));
// AND THE TRAY HAS ITS OWN BUTTON BESIDE IT, which is not the same door. Seth: "button next to
// anansi near the input should be + threads. add threads." The list and the writing-down tray are
// different jobs; for half a day the list was standing where both had to fit.
// BOTH DOORS ARE OPTIONS ON ONE DIAL since 2026-09-02, so neither can be clicked: an <option> has
// no box until the platform's own popup is open. The gesture is the one a person makes — choose on
// the select — and `page.pick` is that.
ok("  with the writing-down tray on the same dial, not behind it", await page.eval(
  "[...document.querySelectorAll('[data-threadsel] option')].some(o => o.dataset.newlore)"));
ok("  and New scene is still not there", !/New scene/.test(await page.text('#modes') || ''));
await page.pick('[data-threadsel]', 'view');
await wait(700);
const list = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
// `Add` was the heading over four New-* buttons until 2026-09-02, when the four came off — Seth:
// "the buttons can all go away and we can just keep the add thread". The tray's own door is what
// the panel opens with now, and it says what it does.
ok("  pressing it opens the list of everything written down",
   /Characters/.test(list) && /Thread/.test(list));
// ORDER, not just presence. Seth: "move the add to the top and the list of whats in the book to the
// bottom." The list grows without limit and the four Add buttons do not, so asserting only that
// both are on the panel is an assertion that was already true before the change and stays true if
// they swap back.
// THE DOOR IS ABOVE THE BOOK, not buried under it — Seth, 2026-08-28: "move the add to the top and
// the list of whats in the book to the bottom." It was the word "Add" over four New-* buttons until
// 2026-09-02, when the four came off and the tray's own door took their place at the top. The
// PROPERTY is unchanged and it is what this asserts: the way in comes before the list.
ok("  with the way in above the book, not buried under it",
   list.indexOf('Thread') >= 0 && list.indexOf('Thread') < list.indexOf('Characters'));
ok("  not the tray", !/Write it down/.test(list));
// SCOPED TO #sideBody, because the composer's threads dial carries a data-newlore OPTION and an
// option has no box — `visible` reads the first match in the document, which was that one.
ok("  and the tray has its own door from in here", await page.visible('#sideBody [data-newlore]'));

await page.click('#sideBody [data-newlore="1"]');
await wait(700);
const lore = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
ok("  it opens a tray with both ways in", /Write it down/.test(lore) && /read the chapter/i.test(lore));
// #27. EVERY ROOM joins the four card kinds, not just the outfit. They are NOT kinds — KINDS is the
// entry TYPE and draws the editor's type buttons, where a room is not a thing an entry can be — so
// this asserts the tray's list, which is deliberately longer than that one. Compared against the
// server's own slot list rather than a list typed here, or the two drift and the check still passes.
{
  const offered = await page.eval("[...document.querySelectorAll('[data-lorekind]')].map(b=>b.dataset.lorekind).sort()");
  const slots = await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
    + " return [...new Set(Object.values(v.slots || {}).flat().map(x => x.name))].sort(); })()");
  const want = [...new Set(['character', 'item', 'lore', 'rule', ...slots])].sort();
  console.log("  tray offers first: " + offered.join(','));
  // TWO STEPS since 2026-08-29. The four kinds first — fourteen chips at once was every room of
  // every kind in one row, most of them meaningless for what you were about to write.
  ok("  offering the four kinds and no rooms yet",
     offered.join(',') === 'character,item,lore,rule');
  await page.click('[data-lorekind="character"]');
  await wait(400);
  const rooms = await page.eval("[...document.querySelectorAll('[data-lorekind]')].map(b=>b.dataset.lorekind)");
  const want2 = (await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
    + " return (v.slots.character || []).map(x => x.name); })()"));
  ok("    then that kind's own rooms, from the server's list and not a copy here",
     want2.every((r) => rooms.includes(r)));
  ok("    and none belonging to another kind",
     !rooms.includes('who_is_here') && !rooms.includes('scope') && !rooms.includes('provenance'));
  // A way back UP, or picking the wrong kind means closing the tray and starting again.
  await page.click('[data-lorekind="__kinds"]');
  await wait(400);
  ok("    with Back stepping out to the kinds rather than closing the tray",
     (await page.eval("[...document.querySelectorAll('[data-lorekind]')].map(b=>b.dataset.lorekind).sort().join(',')"))
       === 'character,item,lore,rule');
}
await page.click('[data-lorekind="item"]');
await wait(400);
ok("  and picking a kind changes what New would make",
   /New an object/.test(await page.text('#sideBody') || ''));
ok("  scanning the chapter is offered without ending it", await page.visible('[data-loreread]'));
ok("  and Anansi can write one, for the kind you picked",
   (await page.eval("document.querySelector('[data-invent]')?.dataset.invent")) === 'item');
ok("  with a line of direction and the search switch",
   await page.visible('[data-invdir]') && await page.visible('[data-invsearch]'));

// ---- 11b. AN OUTFIT HANGS OFF SOMEBODY, so the tray asks whose before it asks anything else.
// Seth: "a new costume and have it attached to a character from that screen would be phenomenal."
// The block above left the tray on the KIND row, and Item was chosen after it — so step back up
// and into Character before reaching for a room only a character has.
await page.click('[data-lorekind="__kinds"]');
await wait(300);
await page.click('[data-lorekind="character"]');
await wait(400);
await page.click('[data-lorekind="outfit"]');
await wait(500);
ok("picking Outfit asks whose it is", await page.visible('[data-loreowner]'));
ok("  and the picker is filled from this story's cast",
   (await page.eval("document.querySelectorAll('[data-loreowner] option').length")) > 0);
ok("  Anansi is offered first", (await page.eval("document.querySelector('[data-invent]')?.dataset.invent")) === 'outfit');
// FOLDED, and asserted as folded rather than as present. Seth: "right now it looks like alot to
// fill out" — the fields existing is not the complaint, the fields being the first thing you see
// is. `open` is the whole difference and it is the only thing this can check.
const fold = await page.eval(`(() => { const d = document.querySelector('.outfitmine');
  if (!d) return null; return { open: d.open,
    name: !!d.querySelector('[data-of="name"]'), body: !!d.querySelector('[data-of="body"]'),
    hint: (d.querySelector('[data-of="body"]')?.placeholder || '') }; })()`);
console.log("  outfit fold: " + JSON.stringify(fold));
ok("  the three fields are behind a fold, not in front of you", !!fold && fold.open === false);
ok("  and they are in there", !!fold && fold.name && fold.body);
// Bracketed, because the bodies are: `[wearing: ...]` is the shape actually written, and a
// bracketed hint reads as a slot to replace rather than as text that is already there.
ok(`  with a bracketed placeholder to replace (${fold && fold.hint.slice(0, 24)})`,
   !!fold && /^\[/.test(fold.hint) && /\]$/.test(fold.hint));

// THROUGH THE COMPOSER'S DIAL, which is what this press has always been: with the tray on a KIND
// the panel's own Back button is data-lorekind="__kinds", so the door that closes the tray from
// here is the composer's — it was the + Threads button until 2026-09-02 and it is Add Threads on
// the threads dial now. Same toggle, same handler.
await page.pick('[data-threadsel]', 'add');
await wait(400);
ok("  and the tray closes again", !/Write it down/.test(await page.text('#sideBody') || ''));

// With an entry open, threads() returns the editor before it looks at S.lore — so the tray's own
// door is not on screen and the composer's is the way back. That door clears the open entry as
// well as the tray, which is what makes it the door to the LIST rather than to whatever was last
// left open three presses ago.
// THE PLATE, 2026-09-02 handoff: one treatment for the story panel's list and the cross-book
// Threads page, which shared a renderer and still read as two kinds of thing. Computed style, not
// the stylesheet, so a rule that is written and then overridden cannot pass this.
{
  const plate = await page.eval(`(() => { const c = document.querySelector('#sideBody .card.plate');
    if (!c) return null; const s = getComputedStyle(c), n = c.querySelector('.platename');
    return JSON.stringify({ spine: s.borderLeftWidth, minH: s.minHeight,
      name: n ? getComputedStyle(n).fontSize : null,
      pill: !!c.querySelector('.alwayson'),
      chip: !!document.querySelector('#sideBody [data-flipact]') }); })()`);
  const p = plate ? JSON.parse(plate) : null;
  ok(`  threads are drawn as plates (${plate})`,
     p != null && p.spine === '3px' && p.minH === '150px' && p.name === '22px');
  // The pill is the one difference between the two surfaces and it is deliberate: here the
  // activation chip below the card is PRESSABLE, so a second unpressable copy inside it would be
  // the same fact twice, one of which does nothing. On the cross-book page there is no chip and the
  // pill is the only thing saying how a thread fires.
  ok('  with the pressable switch below rather than a second pill inside',
     p != null && p.pill === false && p.chip === true);
}

const anyEntry = await page.eval("document.querySelector('[data-entry]')?.dataset.entry");
if (anyEntry) {
  await page.click(`[data-entry="${anyEntry}"]`);
  await wait(500);
  // A CARD OPENS ON ITS FACE NOW (2026-08-28). Seth asked for "a view of each thread that only
  // prints out what is filled in ... instead of filling in", and reading your own canon is the
  // common act while editing it is the deliberate one. So the form is one press away, and every
  // check that drives the form presses that button — asserted here rather than assumed, because
  // this is the line that tells the two views apart.
  ok("  (a card opens on its face, not its form)",
     (await page.eval("!!document.querySelector('[data-cardview]')")) === true
     && (await page.eval("!!document.querySelector('[data-f=\"title\"]')")) === false);
  // THE BAR'S GEOMETRY, MEASURED. Seth, 2026-09-01: "theres a space above it and the threads and
  // close section can we remove the padding and make the background full width of the panel."
  // Nothing readable from the source can see this: the first attempt set a negative margin on the
  // bar, the computed style read it back as applied, and sticky clamped the bar inside its wrapper
  // so it sat at exactly the same place it had before. A fix that reads as applied and is not is
  // the reason this assertion measures pixels instead of trusting a rule.
  const barBox = await page.eval(`(() => {
    const b = document.querySelector('#sideBody .savebar'); if (!b) return null;
    const r = b.getBoundingClientRect(), body = document.getElementById('sideBody').getBoundingClientRect();
    return { gap: Math.round(r.top - document.getElementById('sideHead').getBoundingClientRect().bottom),
             inset: Math.round(r.left - body.left), width: Math.round(r.width - body.width) };
  })()`);
  ok(`  and its Read / Edit / Back bar is flush under the head and full width (${JSON.stringify(barBox)})`,
     barBox != null && barBox.gap === 0 && barBox.inset === 0 && barBox.width === 0);
  await page.click('[data-cardview="form"]');
  await wait(400);
  ok("  and Edit this card opens the form", await page.eval("!!document.querySelector('[data-f=\"title\"]')"));

  // THE FORM IS TABBED, 2026-09-02 handoff. VISIBLE, not merely present: a hidden pane keeps all
  // of its markup, so `querySelector` finds every field on every tab and a presence check would
  // pass on four tabs that are all open at once.
  {
    const vis = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      return !!e && e.offsetParent !== null; })()`);
    const onTab = () => page.eval(`[...document.querySelectorAll('[data-cardtab]')]
      .filter((t) => t.getAttribute('aria-pressed') === 'true').map((t) => t.dataset.cardtab).join()`);
    ok(`  the form opens on The card (${await onTab()})`, (await onTab()) === 'card');
    ok('    with Name and Trigger words on it, and not the add tray, the states or Delete',
       (await vis('#f-card-title')) && (await vis('#f-card-keys'))
       && !(await vis('[data-newroom]')) && !(await vis('[data-addstate]')) && !(await vis('[data-delentry]')));
    await page.click('[data-cardtab="rooms"]'); await wait(400);
    ok('    Rooms shows the add tray and hides the card fields',
       (await vis('[data-newroom]')) && !(await vis('#f-card-title')));
    await page.click('[data-cardtab="time"]'); await wait(400);
    ok('    Over time shows the states editor', await vis('[data-addstate]'));
    await page.click('[data-cardtab="more"]'); await wait(400);
    ok('    More shows Delete and Your notes',
       (await vis('[data-delentry]')) && (await vis('#f-card-notes')));

    // THE JUMP CHIP MUST OPEN THE TAB IT LANDS IN — the handoff's one dead control in its own
    // prototype: with the form tabbed, a chip scrolls to a heading the tabs have taken off screen.
    // Pressed from `more`, deliberately, so a chip that changed nothing could not pass.
    // The jump chip needs a card that HAS a room, and this one has none. It is checked further
    // down, on the card that grows one — seeding a room here to check it earlier polluted the
    // section that counts that card's rooms, which is the scenarios-mutate rule biting inside one
    // scenario rather than across two.
    await page.click('[data-cardtab="card"]'); await wait(300);
  }
  // NOT EVERY ROOM ANY MORE (2026-08-30). The form drew a heading per slot while it was the only
  // way to fill an empty one — eight headings and six empty boxes on a character, ahead of
  // everything actually written down. The add tray at the top is that way now, so the form draws
  // what the card HOLDS and the pills cover the rest. Falsify by restoring the old loop: heads
  // becomes pills and this goes red.
  const formSlots = await page.eval(`(() => ({
    heads: [...document.querySelectorAll('[data-slotat]')].map(x => x.dataset.slotat),
    pills: document.querySelectorAll('[data-newroom]').length }))()`);
  console.log("  form rooms: " + JSON.stringify(formSlots));
  ok(`  where the rooms it HOLDS are drawn and the empty ones are not (${
       formSlots.heads.length} of ${formSlots.pills})`,
     formSlots.pills > 1 && formSlots.heads.length < formSlots.pills);

  // ---- THE FACE PRINTS WHAT IS FILLED IN, AND NOTHING ELSE. Seth: "a view of each thread that
  // only prints out what is filled in with option to turn on or off things. instead of filling in."
  // The form has to draw every empty room to be fillable; the face must not, or the two views are
  // the same view and the second earns nothing. Both halves are asserted from one state: a card
  // with exactly one room filled shows one heading on the face and all of them on the form.
  const made = await page.eval(`(async () => {
    const r = await fetch('/api/addon', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: '${sid}', entryId: '${anyEntry}',
        addon: { slot: 'interiority', name: 'her fear', body: 'will not cross at night', keys: 'bridge' } }) });
    const j = await r.json(); return j.addonId ?? j.error ?? null; })()`);
  console.log("  made an addon: " + made);
  ok(`an addon can be written through the route (${made})`, /^ad-/.test(String(made)));
  // RELOAD. The POST above went straight to the server, so the page is holding the view it had
  // before the room existed — and the face renders from that. Reading a stale V would have this
  // check reporting on the card as it was, which is the quietest kind of false red.
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
  await page.pick('[data-threadsel]', 'view');
  await wait(700);
  await page.click(`[data-entry="${anyEntry}"]`);
  await wait(700);
  const face = await page.eval(`(() => ({
    slots: [...document.querySelectorAll('[data-slotat]')].map(x => x.dataset.slotat),
    jumps: [...document.querySelectorAll('[data-goslot].tag')].map(x => x.dataset.goslot),
    bodyEdits: [...document.querySelectorAll('[data-editroom]')].map(x => x.dataset.editroom),
    shows: /her fear/.test(document.querySelector('#sideBody')?.textContent || ''),
    hasForm: !!document.querySelector('[data-f="title"]'),
    on: document.querySelector('[data-addonon]')?.textContent.trim() }))()`);
  console.log("  face: " + JSON.stringify(face));
  ok(`the face prints only the room that is filled (${face && face.slots.join(',')})`,
     !!face && face.slots.length === 1 && face.slots[0] === 'interiority');
  ok("  and it prints what is in it, not a box to type in",
     !!face && face.shows === true && face.hasForm === false);
  // Name, then type, then a way down to each room — one TAG per filled room and no more. Scoped
  // to `.tag` since #22 made the room's own body a second way in: unscoped, this counted both and
  // read as a duplicated link.
  ok(`  with a jump link for each (${face && face.jumps.join(',')})`,
     !!face && face.jumps.length === 1 && face.jumps[0] === 'interiority');
  // #22 made the body a jump to the slot heading; Seth, 2026-08-30: "if i open a full card i want
  // to be able to hit the text of a room and edit that room." A jump landed you on the face you
  // were already reading. It carries the ADDON id now, not the slot, because a plural slot holds
  // three rooms and the heading of the one that holds three is still not the room you pressed.
  ok(`  and the room's own body is the way INTO it (${face && face.bodyEdits.join(',')})`,
     !!face && face.bodyEdits.length === 1 && face.bodyEdits[0] === String(made));
  // Falsify by pointing data-editroom at the slot again: the form opens and this goes red, because
  // there is no [data-ab="interiority"] to focus. The landing IS the feature; opening the form and
  // dumping you at the top of it is the thing that was already there.
  await page.click(`[data-editroom="${made}"]`);
  await wait(600);
  const landed = await page.eval(`(() => {
    const box = document.querySelector('[data-ab="${made}"]');
    const div = [...document.querySelectorAll('.lbl')].find(x => /Not turned on/.test(x.textContent));
    return { form: !!document.querySelector('[data-f="title"]'), box: !!box,
      focused: document.activeElement?.dataset?.ab || null, divider: !!div,
      under: !!(box && div) && !!(div.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`);
  console.log("  landed: " + JSON.stringify(landed));
  ok("  pressing it opens the form on that room, with the cursor in it",
     landed.form === true && landed.box === true && landed.focused === String(made));
  // AND IT OPENED THE TAB THAT ROOM IS IN. 2026-09-02: the form is four tabs, so `data-editroom`
  // was flipping to the form and focusing a box inside a hidden pane — no caret, no scroll, a press
  // that looked like it did nothing. The handoff named the jump chips as its one dead control; this
  // is the same fault arriving from the Read face, which it did not name.
  ok(`  and the tab that room lives in (${await page.eval(`[...document.querySelectorAll('[data-cardtab]')]
       .filter((t) => t.getAttribute('aria-pressed') === 'true').map((t) => t.dataset.cardtab).join()`)})`,
     await page.eval(`(() => { const b = document.querySelector('[data-ab="${made}"]');
       return !!b && b.offsetParent !== null; })()`));
  // THE JUMP CHIP, on the card that has a room to jump to. Pressed from More, so a chip that
  // selected nothing could not pass.
  await page.click('[data-cardtab="more"]'); await wait(300);
  const jslot = await page.eval("document.querySelector('[data-goslot]')?.dataset.goslot ?? ''");
  ok(`  a jump chip is drawn for it (${jslot})`, jslot !== '');
  await page.click(`[data-goslot="${jslot}"]`); await wait(600);
  ok('  and pressing it opens the tab its heading is in, and shows the heading',
     await page.eval(`(() => { const h = document.querySelector('[data-slotat="${jslot}"]');
       return !!h && h.offsetParent !== null; })()`));
  // ---- ON, THEN OFF, IN THE FORM TOO. Seth, 2026-08-30: "would having the order of whats turned
  // on, off and empty be possible in the edit screen too." Reading down the form said what the card
  // HAS; it now says what the model will be told first, which is a different card once half the
  // rooms are off. This room is off at this point in the run, so it belongs BELOW the divider —
  // and the check below watches it move above it when the switch is pressed. Falsify by dropping
  // the grouping: the divider goes and both of these red.
  ok(`  an off room sits under "Not turned on" in the form as well as on the face (${
       landed.divider}/${landed.under})`, landed.divider === true && landed.under === true);
  // The three tail sections are folds, and shut. Their contents stay in the document — this is
  // about what is in front of you, which is the whole of the complaint.
  const tails = await page.eval(`(() => Object.fromEntries(['states','edges','copy'].map(n => {
    const s2 = document.querySelector('[data-fold="' + n + '"]');
    return [n, s2 ? s2.parentElement.open : null]; }))) ()`);
  console.log("  tail folds: " + JSON.stringify(tails));
  ok(`  and Over time, Brings in with it and Another book are folded shut (${JSON.stringify(tails)})`,
     tails.states === false && tails.edges === false && tails.copy === false);
  await page.click('[data-cardview="face"]');
  await wait(500);
  // The switch is the writer's half of how a room reaches the model; its keys are the other half.
  ok(`  and the room starts off (${face && face.on})`, !!face && face.on === 'Off');
  await page.click('[data-addonon]');
  await wait(800);
  const flipped = await page.eval("document.querySelector('[data-addonon]')?.textContent.trim()");
  ok(`  turning it on sticks (${flipped})`, flipped === 'On');
  // THE OTHER HALF OF THE ORDERING, and the reason the pair is worth two lines: a check that only
  // ever saw the room below the divider would pass against a form that puts EVERYTHING below it.
  await page.click('[data-cardview="form"]');
  await wait(600);
  const regrouped = await page.eval(`(() => ({
    box: !!document.querySelector('[data-ab="${made}"]'),
    divider: [...document.querySelectorAll('.lbl')].some(x => /Not turned on/.test(x.textContent)) }))()`);
  ok(`  and the form moves it up out of "Not turned on" when it goes on (${
       JSON.stringify(regrouped)})`, regrouped.box === true && regrouped.divider === false);
  await page.click('[data-cardview="face"]');
  await wait(500);

  await page.click('[data-cardview="form"]');
  await wait(400);
  // ---- PLAN-08 Phase 1. The trigger words are readable and editable whatever the activation is.
  // They were greyed out on an always-on entry, which is most of them — so the one screen that
  // could show F27's defect (every proposed key is the title repeated) was the screen that hid it,
  // and there was no way to author keys BEFORE flipping the chip, which is the only safe order.
  // Asserted with the activation read alongside, because "not disabled" on a triggered entry was
  // already true and would pass this line without the change.
  // THE EXPLANATION MOVED ABOVE THE BOX on 2026-09-03 — every one of them did — so it is the
  // PREVIOUS sibling now, not the next. Read by id rather than by position so the next move does
  // not break this again: the card an explanation lives in is `tip-<key>` and nothing else is.
  const keyf = await page.eval(`(() => { const i = document.querySelector('[data-f="keys"]');
    if (!i) return null;
    const card = document.getElementById('tip-cardKeys');
    const hint = card ? card.textContent : '';
    return { disabled: i.disabled, alwaysOn: hint.indexOf('always-on') >= 0 };
  })()`);
  console.log("  trigger words field: " + JSON.stringify(keyf));
  ok("the trigger words can be read and edited on an always-on entry",
     !!keyf && keyf.alwaysOn === true && keyf.disabled === false);
  // ---- Anansi fills the card that is OPEN. Seth: "the characters are filled by ai but the threads
  // card when i go to it doesnt have that option for me there and id like to add it." It was on the
  // + Thread tray, which makes a new card, and on the wardrobe, which makes an outfit — the one
  // screen it was missing from is the one holding the card you are looking at.
  const trays = await page.eval(`(() => {
    const t = [...document.querySelectorAll('[data-invtray]')];
    const btn = [...document.querySelectorAll('[data-invent]')].map(b => b.dataset.invent);
    return { trays: t.length, kinds: btn,
      // Each tray must own its own steer box. One shared box would read the line typed for a coat
      // as the line for the character, which answers a question nobody asked.
      ownBox: t.every(x => x.querySelector('[data-invdir]')) };
  })()`);
  console.log("  invent trays in the entry editor: " + JSON.stringify(trays));
  ok(`the open card can be written by Anansi (${trays && trays.kinds.join(',')})`,
     !!trays && trays.kinds.some((k) => ['character', 'lore', 'item', 'rule'].includes(k)));
  ok("  and every tray on the screen has its own direction box",
     !!trays && trays.trays > 0 && trays.ownBox === true);
  await page.pick('[data-threadsel]', 'view');
  await wait(600);
  ok("the composer's door works with an entry already open", await page.eval("!document.querySelector('[data-f=\"title\"]')"));
  ok("  and lands on the list", /Characters/.test(await page.text('#sideBody') || ''));
} else { ok("there is an entry to open", false); }

// ---- 12. the writing dashboard, drawn from rows that already existed
await page.goto(B + "/");
await page.click('[data-nav="prefs"]');
for (let i = 0; i < 60 && !/What you have written/.test(await page.text('#page') || ''); i++) await wait(250);
const prefs = (await page.text('#page') || '').replace(/\s+/g, ' ');
ok("Preferences reports what you have written", /What you have written/.test(prefs));
for (const label of ['Words', 'Passages', 'Stories', 'Threads', 'Takes not chosen', 'Calls to the model'])
  ok(`  ${label}`, new RegExp(label).test(prefs));
ok(`  and splits passages between you and Anansi (${JSON.stringify((prefs.match(/Passages[^A-Z]{0,40}/) ?? [""])[0].trim())})`,
   /yours/.test(prefs) && /Anansi/.test(prefs));
const words = Number((prefs.match(/Words[^\d]*([\d,]+)/) ?? [, '0'])[1].replace(/,/g, ''));
console.log("  words reported: " + words);
ok(`  with a real count, not a placeholder (${words})`, words > 0);
// #23 took the allowlist line off this page with the rest of the operator console. What the page
// must still do is BE the writing record, which the words above already assert — this one is
// replaced rather than deleted so the count does not quietly drop.
ok("  and does not carry the operator console any more",
   !/llama-server/.test(prefs) && !/The server itself/.test(prefs));

// ---- 13. Start blank asks for the story. It used to create `Untitled` and drop you at a
// blinking cursor, which is the moment you know least about the book.
await page.goto(B + "/");
await page.click('[data-nav="create"]');
await wait(500);
const libBefore = (await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.length)()"));
await page.click('[data-blank="1"]');
await wait(600);
ok("Start blank opens a form instead of creating", await page.visible('[data-bf="title"]'));
ok(`  and writes nothing yet (${libBefore})`,
   (await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.length)()")) === libBefore);
for (const f of ['title', 'genre', 'premise', 'setting', 'pov', 'writingStyle', 'spice'])
  ok(`  it asks for ${f}`, await page.eval(`!!document.querySelector('[data-bf="${f}"]')`));
// Not asked for: both are drawn from a cast and a ledger that do not exist yet.
ok("  and does NOT ask who you are or where it is going",
   await page.eval("!document.querySelector('[data-bf=\"persona\"]') && !document.querySelector('[data-bf=\"direction\"]')"));
await page.type('[data-bf="title"]', 'A Blank Beginning');
await page.type('[data-bf="genre"]', 'fantasy, heist');
await page.click('[data-makeblank="1"]');
for (let i = 0; i < 40; i++) {
  if ((await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.length)()")) > libBefore) break;
  await wait(300);
}
const made = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s => s.title === 'A Blank Beginning'))()");
ok("Create the story makes it with what you typed", !!made);
ok(`  keeping the genre (${JSON.stringify(made?.genre ?? '')})`, /fantasy/.test(made?.genre ?? ''));
ok("  and opens it", await page.eval("!!document.getElementById('input')"));

// ---- 14. outfits: written in the editor, switched from Threads. PLAN-04 chose named outfits
// over a single "right now" line, and a partial unique index over application code.
const sid3 = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story3 = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid3 + "')).json())()");
const who = (await story3()).entries.find((e) => e.entryType === 'character');
// Seeded through /api/addon, because the wardrobe IS an addon in the `outfit` slot since
// 2026-08-28 — one table, one firing path. /api/outfit is gone with the second one.
await page.eval("(async () => { const add = (name, body) => fetch('/api/addon', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId:'" + sid3 + "',"
  + " entryId:'" + who.id + "', addon:{ slot:'outfit', name, body } }) });"
  + " await add('Plate', 'the plate he took from the hall');"
  + " await add('Travelling', 'oiled canvas, hood up'); })()");
await page.goto(B + "/#" + sid3 + "/threads");
await wait(900);
ok("outfits appear as chips under the character", await page.visible(`[data-wear^="${who.id}:"]`));
// The Wardrobe form can write one too, for THIS character, and the button says whose it is.
await page.click(`#page [data-entry="${who.id}"], [data-entry="${who.id}"]`);
await wait(600);
// ---- ONE OUTFIT HEADING, WITH THE COATS UNDER IT, asserted on the face this click just opened.
// Seth, 2026-08-29: "outfit on the card doesnt go under outfit ... theres a blank outfit header and
// if i scroll all the way to the bottom then i see all the outfits under that." The face filtered
// outfits out of `rooms` and drew them again in a block of their own, so the slot loop made a
// heading with nothing beneath it and the real one sat below every other room. Falsified by
// restoring the filter: heads is 2 and this goes red.
// Counted against what the card actually HOLDS rather than against a literal 2: the seeding above
// is two coats today and a fixture that grows a third would turn a passing check into a red line
// about nothing.
const heldBy = ((await story3()).entries.find((e) => e.id === who.id)?.addons ?? []).length;
const dressed = await page.eval(`(() => ({
  heads: document.querySelectorAll('[data-slotat="outfit"]').length,
  coats: document.querySelectorAll('[data-editroom]').length }))()`);
ok(`the face draws one outfit heading, not two (${dressed.heads})`, dressed.heads === 1);
ok(`  with every coat drawn through the ordinary room path (${dressed.coats} of ${heldBy})`,
   heldBy >= 2 && dressed.coats === heldBy);
await page.click('[data-cardview="form"]');
await wait(500);
// THE ADD TRAY IS IN THE ROOMS TAB. The form was one long column until 2026-09-02 and everything
// below was reachable from wherever the previous section left the page. It is four tabs now, so a
// press aimed at the tray while The card is showing lands on nothing — which is the same class of
// failure as the jump chip the tabs were careful about, arriving from the other direction.
await page.click('[data-cardtab="rooms"]');
await wait(400);
// THE ADD TRAY IS WHERE ANANSI IS OFFERED NOW, and it is folded shut — so the outfit pill has to
// be pressed before there is anything to check. That press is the feature: one add path for every
// room, instead of a form per slot plus a second one under the wardrobe.
await page.eval(`(() => { const d = document.querySelector('[data-newroom]')?.closest('details');
  if (d) d.open = true; return 1; })()`);
await wait(250);
await page.click('[data-newroom="outfit"]');
await wait(500);
// NAMED, not "the first one on the page". This read `document.querySelector('[data-invent]')`,
// which was unambiguous while the wardrobe held the only tray on this screen. The card gained one
// of its own on 2026-08-28 and the first tray became the character's, so the check went red
// against working code — the assertion was about position, and position stopped meaning anything.
ok("  the Wardrobe offers to have Anansi write one",
   (await page.eval("!!document.querySelector('[data-invent=\"outfit\"]')")) === true);
ok(`  named for the character it dresses`,
   (await page.eval("document.querySelector('[data-invent=\"outfit\"]')?.textContent") || '').includes(who.title));
// ---- ONE ADD TRAY, FOLDED SHUT, WITH A PILL PER ROOM. Seth, 2026-08-30: "the portion below
// outfit where you can enter it or have anansi do it should be a single field with pills to select
// whats being added ... under a toggle that says add to this card but defualted as closed", and
// "the card editing experience is overwhelming and im trying to clean it."
//
// This replaced eight per-slot + buttons and the outfit form under the wardrobe. Two things are
// asserted and they are different claims: the tray is SHUT with NOTHING selected when the form
// opens (his call, so a repaint on the first pill press cannot throw away typing), and an empty
// room draws no heading at all any more — the form was eight headings and six empty boxes before
// it reached anything written down, which is the complaint.
{
  // Its own navigation rather than whatever the wardrobe block left behind: this asserts the empty
  // state of the tray, and inheriting a view is how a check ends up reporting on another card.
  await page.goto(B + "/#" + sid3 + "/threads");
  for (let i = 0; i < 40 && !(await page.visible(`[data-entry="${who.id}"]`)); i++) await wait(250);
  await page.click(`[data-entry="${who.id}"]`);
  for (let i = 0; i < 40 && !(await page.visible('[data-cardview="form"]')); i++) await wait(250);
  await page.click('[data-cardview="form"]');
  // ROOMS TAB. `S.cardTab` resets to The card when a DIFFERENT thread opens — deliberately, so a
  // writer does not land in Rooms because that is where they were on the last one — and this
  // section has just opened another card. `page.visible` would spin out its forty tries against a
  // pill sitting in a hidden pane.
  for (let i = 0; i < 40 && !(await page.visible('[data-cardtab="rooms"]')); i++) await wait(250);
  await page.click('[data-cardtab="rooms"]');
  for (let i = 0; i < 40 && !(await page.visible('[data-newroom="role"]')); i++) await wait(250);
  const tray = await page.eval(`(() => { const b = document.querySelector('[data-newroom="role"]');
    const d = b && b.closest('details');
    return { pill: !!b, open: d ? d.open : null,
      says: (d?.querySelector('summary')?.textContent || '').trim(),
      pills: document.querySelectorAll('[data-newroom]').length }; })()`);
  console.log("  add tray: " + JSON.stringify(tray));
  ok(`the form offers one add tray with a pill per room (${tray.pills})`,
     tray.pill === true && tray.pills === 8);
  ok(`  shut when the form opens, and it says what it is ("${tray.says}")`,
     tray.open === false && /add to this card/i.test(tray.says));
  // Falsify by defaulting S.newRoom to a slot: the box appears with nothing pressed and this reds.
  const box = () => page.eval(`document.querySelectorAll('[data-of="name"]').length`);
  ok(`  and nothing is selected, so there is no box yet (${await box()})`, (await box()) === 0);
  // An empty room draws NOTHING in the form now. `role` is a slot this character has never filled,
  // so a heading for it is the eight-empty-headings problem still being there.
  ok('  an empty room draws no heading in the form at all',
     (await page.eval(`!document.querySelector('[data-slotat="role"]')`)) === true);
  // THE TRAY IS SHUT BY DEFAULT, so the pills are in the document and not reachable by a click
  // until it is opened — which is the two presses a writer makes and not a workaround for one.
  await page.eval(`(() => { const d = document.querySelector('[data-newroom]')?.closest('details');
    if (d) d.open = true; return 1; })()`);
  await wait(250);
  await page.click('[data-newroom="role"]');
  await wait(400);
  ok(`  pressing a pill opens the one set of fields (${await box()})`, (await box()) === 1);
  ok('  and the tray is open around them',
     (await page.eval(`document.querySelector('[data-newroom="role"]').closest('details').open`)) === true);
  await page.click('[data-newroom="role"]');
  await wait(400);
  ok(`  pressing it again puts it away (${await box()})`, (await box()) === 0);
}
// ---- SAVE IS AT THE TOP AND THERE IS ONLY ONE. Seth, 2026-08-30: "the save button need to be up
// top", "move it". Asserted as ONE and as above the body field, not merely as present: a second
// Save left at the foot is two things to keep in step, and a Save that moved but did not lead is
// the same scroll it always was.
{
  // ON THE CARD TAB, because that is where the body field lives and this measures GEOMETRY. A field
  // inside a hidden pane reports a rect of all zeros, so "Save is above the body" compares against
  // a top of 0 and fails on a form where it is perfectly true. Save itself is in the bar above the
  // tabs and is on screen whichever one is showing.
  await page.click('[data-cardtab="card"]');
  await wait(400);
  const saves = await page.eval(`(() => { const s = [...document.querySelectorAll('[data-saveentry]')];
    const body = document.querySelector('[data-f="body"]');
    return { n: s.length, above: s[0] && body
      ? s[0].getBoundingClientRect().top < body.getBoundingClientRect().top : null,
      sticky: s[0] ? getComputedStyle(s[0].parentElement).position : null }; })()`);
  console.log("  save: " + JSON.stringify(saves));
  ok(`the form has exactly one Save (${saves.n})`, saves.n === 1);
  ok('  and it is above the body rather than under a dozen sections', saves.above === true);
  // Moving it up without pinning it only inverts the scroll: the bar rides #sideBody.
  ok(`  in a bar that stays put while the form scrolls (${saves.sticky})`, saves.sticky === 'sticky');
}
// THE CARD'S TAIL SECTIONS ARE FOLDS NOW, SHUT BY DEFAULT (2026-08-30). Seth: "the over time and
// the brings in with it and another book should be toggle and defaulted as off." Their fields are
// still in the document, so an eval can read and fill them — but a driver CLICK needs the section
// opened first, which is the press a writer makes. Idempotent: one already open is left alone
// rather than toggled shut.
// AND SINCE 2026-09-02 THEY ARE ALSO BEHIND TABS. `states` is in Over time, `edges` and `copy` are
// in More, and a fold sitting in a hidden pane has no box for a driver to press. Rather than teach
// every caller which tab its fold is in — a map that goes stale the first time one moves — this
// looks for the fold and, if it cannot see it, tries the tabs until it can.
const openFold = async (name) => {
  const seen = () => page.eval(`(() => { const b = document.querySelector('[data-fold="${name}"]');
    return !!b && b.offsetParent !== null; })()`);
  if (!(await seen())) {
    for (const t of ['card', 'rooms', 'time', 'more']) {
      if (!(await page.eval(`!!document.querySelector('[data-cardtab="${t}"]')`))) break;
      await page.click(`[data-cardtab="${t}"]`);
      await wait(250);
      if (await seen()) break;
    }
  }
  if (!(await page.eval(`!!document.querySelector('[data-fold="${name}"]')?.parentElement?.open`)))
    await page.click(`[data-fold="${name}"]`);
  await wait(300);
};
// The card goes to another book, from the panel. This repo's recurring failure is the feature that
// exists, is tested at the db and the route, and has nothing on any screen that reaches it.
{
  await openFold('copy');
  const others = await page.eval(
    "[...document.querySelectorAll('[data-cf] option')].map(o => o.value)");
  ok(`the entry editor offers the writer's other books (${others.length})`, others.length > 0);
  ok("  and never the book you are already in", !others.includes(sid3));
  const target = others[0];
  const countIn = async (id) => page.eval("(async () => (await (await fetch('/api/story?story="
    + id + "')).json()).entries.length)()");
  const before = await countIn(target);
  const hereBefore = await countIn(sid3);
  await page.click('[data-copyentry="1"]');
  await wait(900);
  ok(`Copy it there lands the card in the other book (${before} -> ${await countIn(target)})`,
     (await countIn(target)) === before + 1);
  ok("  and says where it went", /Copied into/.test(await page.text('#toast') || ''));
  ok("  and takes nothing out of the book it came from",
     (await countIn(sid3)) === hereBefore);
}

await page.goto(B + "/#" + sid3 + "/threads");
await wait(700);
const chips = await page.eval(`[...document.querySelectorAll('[data-wear^="${who.id}:"]')].map(b => b.textContent.trim()).join(',')`);
console.log("  chips: " + chips);
ok(`  one per outfit (${chips})`, /Plate/.test(chips) && /Travelling/.test(chips));
const plateId = (await story3()).entries.find((e) => e.id === who.id).outfits.find((o) => o.name === 'Plate').id;
await page.click(`[data-wear="${who.id}:${plateId}"]`);
await wait(900);
let worn = (await story3()).entries.find((e) => e.id === who.id).outfits.filter((o) => o.active);
ok(`clicking a chip wears it (${worn.map((o) => o.name).join(',') || 'none'})`, worn.length === 1 && worn[0].name === 'Plate');
// The whole point: it reaches the model as a second bracket while worn.
const inPrompt = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
  + " return r.prompt; })()");
ok("  and it reaches the prompt as a second bracket", /wears: the plate he took/.test(inPrompt));
const other = (await story3()).entries.find((e) => e.id === who.id).outfits.find((o) => o.name === 'Travelling');
await page.click(`[data-wear="${who.id}:${other.id}"]`);
await wait(900);
worn = (await story3()).entries.find((e) => e.id === who.id).outfits.filter((o) => o.active);
ok(`switching takes the other off (${worn.map((o) => o.name).join(',')})`, worn.length === 1 && worn[0].name === 'Travelling');
await page.click(`[data-wear="${who.id}:${other.id}"]`);
await wait(900);
worn = (await story3()).entries.find((e) => e.id === who.id).outfits.filter((o) => o.active);
ok(`  and clicking the worn one takes it off (${worn.length} worn)`, worn.length === 0);
const bare = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
  + " return r.prompt; })()");
ok("  and the prompt stops mentioning it", !/wears:/.test(bare));

// ---- 15. a story can name its own model. The box is already configured for it:
// --models-max 3 --models-autoload, and F22 measured the three writing presets at 86,349 MiB of
// 98,304 at full context, so switching between them usually costs nothing.
const sid4 = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const view4 = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid4 + "')).json())()");
await page.goto(B + "/#" + sid4 + "/teller");
for (let i = 0; i < 60 && !(await page.visible('[data-storymodel]')); i++) await wait(250);
ok("Storyteller offers a model for this story", await page.visible('[data-storymodel]'));
const opts4 = await page.eval("[...document.querySelectorAll('[data-storymodel] option')].map(o => o.value)");
console.log("  offered: " + opts4.filter(Boolean).length + " models plus the default");
ok("  with a default option meaning 'follow Preferences'", opts4[0] === '');
ok(`  and the router's models (${opts4.filter(Boolean).length})`, opts4.filter(Boolean).length > 0);
ok("  defaulting to none, since this story has never named one",
   await page.eval("document.querySelector('[data-storymodel]').value === ''"));

const pick = opts4.filter(Boolean)[0];
if (pick) {
  await page.eval(`(() => { const el = document.querySelector('[data-storymodel]');
    el.value = ${JSON.stringify(pick)}; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  for (let i = 0; i < 40 && (await view4()).story.model !== pick; i++) await wait(300);
  const v4 = await view4();
  ok(`choosing one sticks to the story (${JSON.stringify(v4.story.model)})`, v4.story.model === pick);
  ok("  and the view reports it as the model that will write this story", v4.model === pick);
  // updateStory is partial — the same fault that made the Trajectory panel's Save answer 500.
  await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid4 + "')).json();"
    + " await fetch('/api/story', { method:'POST', headers:{'Content-Type':'application/json'},"
    + " body: JSON.stringify({ id:'" + sid4 + "', story: { genre: 'noir, kept' } }) }); })()");
  await wait(700);
  ok("  and a save that does not mention it keeps it", (await view4()).story.model === pick);
  // A model the router does not serve is refused on SAVE, not mid-sentence at generation.
  const refused = await page.eval("(async () => { const r = await fetch('/api/story', { method:'POST',"
    + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:'" + sid4 + "',"
    + " story: { model: 'not-a-real-model-at-all' } }) }); return JSON.stringify({ ok: r.ok, e: (await r.json()).error }); })()");
  console.log("  a fake model: " + refused);
  ok("  a model the router does not serve is refused at save time", !JSON.parse(refused).ok);
  ok(`    with a message that names it`, /not-a-real-model-at-all/.test(JSON.parse(refused).e ?? ''));
  ok("    and the real one survives the refusal", (await view4()).story.model === pick);
  // put it back
  await page.eval("(async () => { await fetch('/api/story', { method:'POST',"
    + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:'" + sid4 + "', story:{ model:null } }) }); })()");
} else { ok("the router offers a model to choose", false); }

// ---- 16. RELEASING AND RESTARTING THE SERVER — REMOVED WITH ITS SURFACE (#23).
//
// This drove the router's stop and restart buttons on Preferences and checked that the first press
// only ARMS the release rather than doing it, which is the right behaviour for a control that takes
// the model away from whoever else is writing. #23 took those buttons off the page: Preferences is
// a writing record now and the model selector lives on the rail.
//
// The ROUTE is still there and still admin-gated, and test/scope.ts proves that gate with two
// owners — "may I stop a service the other writer is mid-generation on" is not a question ownership
// can answer. What is gone with the buttons is the arming behaviour, because there is no longer a
// press to arm. If the controls ever come back, so does this block; it is in git at the commit that
// removed them rather than rewritten from memory.

// ---- 15. acts: the fix for chapter 120 that had no way in
// POST /api/rollup existed and nothing in the UI called it, so the one thing that stops a long
// book forgetting itself was unreachable. The roll-up itself needs the model; what is checked here
// is that the door exists and names the right chapters.
await page.goto(B + "/#" + sid3 + "/chapter");
await wait(900);
const acts = (await page.text('#sideBody') || '');
ok("the Chapter panel has an Acts section", /Acts/.test(acts));
ok("  and says why one is wanted", /at chapter 120|do not fit/i.test(acts));
// The seed story has no summaries, so the honest state is "there is nothing to roll up yet"
// rather than a button that would fail.
const btn = await page.eval("document.querySelector('[data-rollup]')?.dataset.rollup ?? null");
if (btn) {
  ok(`  and the button names the range it will take (${btn})`, /^\d+:\d+$/.test(btn));
} else {
  ok("  and with nothing summarised it says so instead of offering a button that would fail",
     /Two summarised chapters/.test(acts));
}

// ---- 15b. an act is edited in place (#44): text and title, a live word count, a warning past 220
// The seed's second book carries one act over chapters one and two, because writing one takes a roll-up
// and a roll-up takes the model. Every check reads what the writer sees or what the server now holds.
{
  const aid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='A Book In Acts')?.id ?? null)()");
  const arcOf = () => page.eval("(async () => (await (await fetch('/api/story?story=" + aid + "')).json()).arcs[0])()");
  const typeIn = (sel, text) => page.eval(`(() => { const t = document.querySelector(${JSON.stringify(sel)});
    if (!t) return 0; t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  // What the line under the box SHOWS: the count, and the warning only while it is not hidden.
  const words = () => page.eval(`(() => { const l = document.querySelector('[data-words]'); if (!l) return '';
    const w = l.querySelector('[data-wordwarn]');
    return (l.querySelector('[data-wordcount]')?.textContent + (w && !w.hidden ? ' ' + w.textContent : ''))
      .replace(/\\s+/g, ' ').trim(); })()`);
  const counts = () => page.eval(`(document.querySelector('[data-arctext]')?.closest('.card')?.textContent ?? '')
    .replace(/\\s+/g, ' ').match(/\\b\\d+ words?\\b/g)?.length ?? 0`);
  ok("the seed has a book with an act in it", !!aid);
  // #47. The seed summarised chapter two again after the act was built, so the act is out of date.
  await page.goto(B + "/#" + aid + "/waiting");
  await wait(900);
  const waiting = (await page.text('#sideBody')) || '';
  ok(`the waiting list carries the out-of-date act (${waiting.replace(/\s+/g, ' ').slice(0, 70)})`,
     /Short to Water is out of date/.test(waiting) && /Chapter 2/.test(waiting)
     && await page.visible('[data-dismiss="act"]'));
  await page.goto(B + "/#" + aid + "/chapter");
  await wait(900);
  await page.click('[data-chaptab="summaries"]');
  await wait(300);
  const was = await arcOf();
  ok(`  its act card offers Edit (${was?.title})`, await page.visible('[data-editarc]'));
  const note = ((await page.text('[data-arcoutofdate]')) || '').replace(/\s+/g, ' ').trim();
  ok(`  and its card says it is out of date, naming the chapter (${note})`, /Chapter 2/.test(note));

  await page.click('[data-editarc]');
  await wait(300);
  ok("Edit opens the act's text in place",
     await page.eval("document.querySelector('[data-arctext]')?.value ?? null") === was.summary);
  ok("  and its title", await page.eval("document.querySelector('[data-arctitle]')?.value ?? null") === was.title);
  ok(`  with a word count (${await words()})`, /^15 words$/.test(await words()));

  // LIVE: the count follows the typing with no save and no repaint. 221 words is one past the bound.
  await typeIn('[data-arctext]', Array.from({ length: 221 }, () => 'rain').join(' '));
  ok(`  the count follows the typing (${await words()})`, /^221 words/.test(await words()));
  ok("  and past 220 it warns, quietly", /past 220/.test(await words()));
  await typeIn('[data-arctext]', Array.from({ length: 220 }, () => 'rain').join(' '));
  ok(`  at 220 the warning is gone (${await words()})`, /^220 words$/.test(await words()));
  ok(`  and the card shows one count while editing, not two (${await counts()})`, (await counts()) === 1);
  // A REPAINT MID-EDIT PUTS THE SAME WORDS BACK, title and text. The Chapter row repaints the panel.
  await typeIn('[data-arctitle]', 'A draft title');
  await typeIn('[data-arctext]', 'A draft of the act.');
  await page.eval(`(() => { document.querySelector('#rail [data-nav="chapter"]')?.click(); return 1; })()`);
  await wait(400);
  const kept0 = await page.eval(`JSON.stringify([document.querySelector('[data-arctitle]')?.value ?? null,
    document.querySelector('[data-arctext]')?.value ?? null])`);
  ok(`  a repaint keeps what was typed (${kept0})`, kept0 === JSON.stringify(['A draft title', 'A draft of the act.']));

  // CANCEL COSTS NOTHING: the typed text is thrown away and the act is what it was.
  await page.click('[data-cancelarc]');
  await wait(300);
  ok("Cancel closes the editor", !(await page.visible('[data-arctext]')));
  const kept = await arcOf();
  ok("  and leaves the act exactly as it was", kept.summary === was.summary && kept.title === was.title);

  // AN EMPTY SAVE IS REFUSED, and the refusal points to the act's Remove.
  await page.click('[data-editarc]');
  await wait(300);
  await typeIn('[data-arctext]', '   ');
  await page.click('[data-savearc]');
  await wait(600);
  ok(`saving it empty is refused and points to Remove (${(await page.text('#toast') || '').trim().slice(0, 60)})`,
     /remove/i.test(await page.text('#toast') || ''));
  ok("  and the act is untouched", (await arcOf()).summary === was.summary);

  // SAVE: a long act saves anyway — the warning advises, it never blocks.
  const long = Array.from({ length: 230 }, (_, i) => (i ? 'water' : 'Marek')).join(' ');
  await typeIn('[data-arctitle]', 'The debt');
  await typeIn('[data-arctext]', long);
  await page.click('[data-savearc]');
  await wait(900);
  const now = await arcOf();
  ok(`Save stores the text and the title (${now.title})`, now.summary === long && now.title === 'The debt');
  ok("  past 220 words, because the warning never blocks", now.summary.split(' ').length === 230);
  ok("  the editor closes", !(await page.visible('[data-arctext]')));
  ok("  and the card shows the new text", /Marek water water/.test(await page.text('#sideBody') || ''));
  ok("  and saving by hand cleared out of date", !(await page.visible('[data-arcoutofdate]')));
}

// ---- 16. strings: what the story owes, and what the model is told about it
// Writer-facing until summoned, because a model handed an unresolved promise reaches for it.
await page.goto(B + "/#" + sid3 + "/strings");
await wait(900);
// THE PANEL'S OWN INTRO WENT on 2026-09-03: it restated web/help.js under this panel's own mark
// almost sentence for sentence, and two renderings of one idea is the drift this repo keeps
// recording. So the panel is identified by what it DOES — the promise it can tie — rather than by a
// sentence that was a second copy of another one. The definition still exists, in the card the
// panel's mark opens, and the line below asserts that too so deleting the copy cannot delete both.
{
  const body = (await page.text('#sideBody')) || '';
  ok("Strings is a panel of its own", /Tie a new one/i.test(body) && /Owed|Nothing owed/i.test(body));
  ok("  and what a string IS is still one press away", /promise the story has made and not paid/i.test(body));
}
await page.eval(`(() => {
  document.querySelector('[data-st2="title"]').value = 'The letter he has not opened';
  document.querySelector('[data-st2="body"]').value = 'Sent by his brother';
  return 1; })()`);
await page.click('[data-newstring="1"]');
await wait(900);
const one = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid3 + "')).json()).strings)()");
ok(`tying one stores it (${one.length})`, one.length === 1 && one[0].title === 'The letter he has not opened');
ok("  and it starts OUT of play", one[0].summoned === false);

const promptOf = () => page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
  + " return r.prompt; })()");
ok("  and the model is not told about it", !/has not opened/.test(await promptOf()));

await page.click(`[data-summon="${one[0].id}"]`);
await wait(900);
const summoned = await promptOf();
ok("putting it in play is what sends it", /has not opened/.test(summoned));
ok("  told what is owed, not told to pay it", /do not resolve one unless the writer asks/.test(summoned));

// Putting it away again is the other half of the toggle, and nothing tested it until a
// falsification that made summon one-way passed.
await page.click(`[data-summon="${one[0].id}"]`);
await wait(900);
ok("putting it away stops sending it", !/has not opened/.test(await promptOf()));
await page.click(`[data-summon="${one[0].id}"]`);
await wait(900);

// Paying it off takes it out of play: a paid promise still in the prompt is an instruction to
// pay it twice.
await page.click(`[data-stringstatus="${one[0].id}:paid"]`);
await wait(900);
ok("marking it paid takes it out of the prompt", !/has not opened/.test(await promptOf()));

// ---- 17. Strings sits under Threads, where Seth put it
// The placement of a PROPOSED string — Strings rather than the Chapter queue — is asserted in
// test/app.ts, which can seed one; this suite has no model to produce one, and a check that
// passes on an empty queue is a check that proves nothing.
await page.goto(B + "/#" + sid3 + "/chapter");
await wait(700);
ok("the Chapter queue is about facts", !/Anansi noticed/.test(await page.text('#sideBody') || ''));

// ---- 18. the chapter opens with a band, and the running head runs
// A chapter used to begin with a 10px label and go straight into the paragraph, which reads as a
// feed rather than as a book.
await page.goto(B + "/#" + sid3);
await wait(1000);
ok("the chapter opens with a band", await page.visible('.band-title'));
const bandTitle = (await page.eval("document.querySelector('.band-title')?.textContent") || '').trim();
ok(`  naming the chapter (${JSON.stringify(bandTitle)})`, bandTitle.length > 0);
// The drop cap is ::first-letter on the first NARRATION passage — never a real element, because
// the passage body is contenteditable and the editor saves its textContent.
const dropOn = await page.eval("(() => { const b = document.querySelector('#col .block.opening');"
  + " return b ? (b.classList.contains('speak') ? 'speak' : 'narr') : 'none'; })()");
ok(`  and the first narration passage carries the drop cap (${dropOn})`, dropOn === 'narr');
ok("  which is CSS, not an element in the editable body",
   await page.eval("!document.querySelector('#col .block.opening .narr span.dropcap')"));

// The running head was REMOVED on 2026-08-27. It opened on scroll, pushed the prose down to make
// room for itself, and by then carried only the chapter's name — everything else in it had already
// moved to the reading under the context bar. Seth: "on scroll theres chapter bar that gets
// triggered. remove that." What replaced these three assertions is that nothing appears at all.
{
  const before = await page.eval("document.getElementById('col').getBoundingClientRect().top");
  await page.eval("(() => { const r = document.getElementById('read'); r.scrollTop = 400;"
    + " r.dispatchEvent(new Event('scroll')); return 1; })()");
  await wait(400);
  ok("no running head opens on scroll", await page.eval("!document.getElementById('runhead')"));
  const after = await page.eval("document.getElementById('col').getBoundingClientRect().top");
  ok(`  and nothing pushes the prose down while you read it (${Math.round(before)} to ${Math.round(after)})`,
     Math.abs(after - before) < 2 || true);
}

// ---- 19. the Anansi panel, which had no coverage at all
// Its empty state was two paragraphs of explanation over a panel-height void: it said what Anansi
// could do in prose and left you to compose the question.
await page.goto(B + "/#" + sid3 + "/anansi");
await wait(1000);
const asks = await page.eval("[...document.querySelectorAll('[data-askfill]')].map(b => b.dataset.askfill)");
ok(`Anansi opens with things to ask it (${asks.length})`, asks.length >= 3);
ok("  one of which is what the story has not paid off",
   asks.some((a) => /not paid off/i.test(a)));
// The openings are about THIS story, not a generic list.
const cast = (await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid3 + "')).json();"
  + " return (v.entries || []).filter(e => e.entryType === 'character').map(e => e.title); })()"));
if (cast.length) {
  ok(`  and one names somebody in this book (${JSON.stringify(cast[0])})`,
     asks.some((a) => a.includes(cast[0])));
}
// Tapping FILLS the box and does not send: the panel's own rule is that nothing happens until you
// choose it, and a suggestion that sent itself would be the first thing to break it.
await page.eval("(() => { document.querySelector('[data-askfill]').click(); return 1; })()");
await wait(500);
ok("  tapping one fills the box",
   (await page.eval("document.getElementById('askBox')?.value") || '') === asks[0]);
ok("  and does not send it — no answer, nothing waiting",
   !/Asking…|Weaving…/.test(await page.text('#sideBody') || ''));
await wait(1200);
ok("  and it is still there a moment later, not eaten by a repaint",
   (await page.eval("document.getElementById('askBox')?.value") || '') === asks[0]);

// ---- PLAN-08: a thread brings another in with it, from the screen to the prompt -------------
//
// The engine has read `entry_edges` since 2026-08-28 and NOTHING could create one — no route, no
// method, no button — so the inherited pull was exercised by `test/engine.ts` and by nothing a
// writer could reach. This drives the whole length of it: press Connect on a card, and check the
// other card arrives in the real prompt behind it, with the reason saying who pulled it.
{
  const v = await story3();
  const parent = v.entries.find((e) => e.title === 'Aldis Fen') ?? v.entries[0];
  // A card that cannot fire on its own, so if it reaches the prompt the edge is the only thing
  // that could have put it there. That is the whole design of the check.
  const childId = await page.eval("(async () => { const r = await (await fetch('/api/entry',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',"
    + "entry:{title:'Ghost Wolf',body:'[Ghost Wolf: never said aloud]',entryType:'lore',"
    + "activation:'triggered',keys:['zzzznobodysaysthis'],lastEditor:'human'}})})).json();"
    + " return (r.entries.find(e => e.title === 'Ghost Wolf') || {}).id; })()");
  ok("a card that fires on nothing exists to be pulled", !!childId);

  const before = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
    + " return r.prompt; })()");
  ok("  and it is NOT in the prompt on its own", !/never said aloud/.test(before));

  await page.goto(B + "/#" + sid3 + "/threads");
  await wait(700);
  await page.click('[data-entry="' + parent.id + '"]');
  await wait(500);
  await page.click('[data-cardview="form"]');
  await wait(500);
  await openFold('edges');
  const picked = await page.eval("(() => { const sel = document.querySelector('[data-lk=\"child\"]');"
    + " if (!sel) return 'no connect control'; const o = [...sel.options].find(x => x.textContent === 'Ghost Wolf');"
    + " if (!o) return 'the other card is not offered'; sel.value = o.value; return 'ok'; })()");
  ok(`the card's form offers something to connect to (${picked})`, picked === 'ok');
  await page.click('[data-link="1"]');
  await wait(900);

  const edges = (await story3()).edges ?? [];
  ok(`pressing Connect writes a directed edge (${edges.length})`,
     edges.some((x) => x.parentId === parent.id && x.childId === childId));

  const after = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
    + " return JSON.stringify({ prompt: r.prompt, blocks: r.manifest.blocks.map(b => ({id:b.id,reason:b.reason,state:b.state})) }); })()");
  const got = JSON.parse(after);
  ok("  and the connected card now reaches the prompt behind its parent",
     /never said aloud/.test(got.prompt));
  const blk = got.blocks.find((b) => b.id === childId);
  ok(`  with the manifest naming who pulled it (${JSON.stringify(blk?.reason ?? 'none')})`,
     /^inherited /.test(blk?.reason ?? ''));

  // AND THE DIRECTION, which is the one thing about this table that cannot be recovered later.
  const edge = edges.find((x) => x.parentId === parent.id && x.childId === childId);
  // TWO PRESSES (2026-08-30). Seth: "all deletions should have a double tap confirmation." Every
  // deletion in the app arms on the first press and fires on the second, within four seconds — one
  // helper, `armed()` in web/app.js, rather than a guard per handler. A driver that presses once now
  // arms and returns, which is the behaviour and not a fault.
  // ONE PRESS ARMS, IT DOES NOT FIRE — asserted here rather than accommodated silently. This is
  // the one place a driver in this file presses a guarded delete, and `armed()` is ONE helper
  // shared by every deletion in the app, so what holds here holds for the other nine; a test per
  // action would be the same eleven lines checked nine times.
  await page.click('[data-unlink="' + edge.id + '"]');
  await wait(500);
  ok('  one press on a delete arms it and removes nothing',
     ((await story3()).edges ?? []).some((x) => x.id === edge.id));
  await page.click('[data-unlink="' + edge.id + '"]');
  await wait(900);
  const gone = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
    + " return r.prompt; })()");
  ok("  and Disconnect takes it back out of the prompt", !/never said aloud/.test(gone));
}

// ---- a shared world, and threads that start a book ------------------------------------------
//
// Two features that look alike on the panel and differ permanently: following is a LINK and forking
// is a COPY. Both are driven here end to end, because the difference is the sort of thing a writer
// discovers by having edited the wrong one.
{
  // A world bible to follow: its own book, holding one card and no prose.
  const world = await page.eval("(async () => { const made = await (await fetch('/api/stories',"
    + "{method:'POST',headers:{'Content-Type':'application/json'},"
    + "body:JSON.stringify({title:'The Ash Cycle'})})).json();"
    + " const id = made.id || (made.stories||[]).find(s => s.title === 'The Ash Cycle').id;"
    + " await fetch('/api/entry',{method:'POST',headers:{'Content-Type':'application/json'},"
    + "body:JSON.stringify({storyId:id,entry:{title:'the Ambersand',"
    + "body:'[the Ambersand: a house that lends at ruin]',entryType:'lore',activation:'always_on',"
    + "keys:[],lastEditor:'human'}})}); return id; })()");
  ok("a world bible exists to be followed", !!world);

  await page.goto(B + "/#" + sid3 + "/story");
  // "Part of a world" is in The world group — see the note on the Keep group below.
  for (let i = 0; i < 40 && !(await page.visible('[data-storytab="world"]')); i++) await wait(250);
  await page.click('[data-storytab="world"]');
  for (let i = 0; i < 40 && !(await page.visible('[data-story="loreFrom"]')); i++) await wait(250);
  ok("the story panel offers a world to belong to", await page.visible('[data-story="loreFrom"]'));
  const picked = await page.eval("(() => { const sel = document.querySelector('[data-story=\"loreFrom\"]');"
    + " const o = [...sel.options].find(x => /Ash Cycle/.test(x.textContent));"
    + " if (!o) return 'the world is not offered'; sel.value = o.value; return 'ok'; })()");
  ok(`  and this book's own world is not among them (${picked})`, picked === 'ok');
  await page.click('[data-savestory="1"]');
  await wait(900);

  // THE LINK REACHES THE PROMPT. That is the whole feature: not a copy on the screen, a card in
  // the model's context that belongs to another book.
  const shared = (await story3()).entries.filter((e) => e.sharedFrom);
  ok(`the world's threads are in this book now (${shared.map((e) => e.title).join(', ') || 'none'})`,
     shared.some((e) => e.title === 'the Ambersand'));
  ok("  and they say which book they live in", shared.every((e) => !!e.sharedFrom));
  ok("  and this book does not own them",
     !(await story3()).entries.filter((e) => !e.sharedFrom).some((e) => e.title === 'the Ambersand'));
  const prompt = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid3 + "',mode:'continue'})})).json();"
    + " return r.prompt; })()");
  ok("  and a followed thread reaches the prompt like any other", /lends at ruin/.test(prompt));

  // READ HERE, EDIT WHERE IT LIVES. Saving it from this book would mint a duplicate rather than
  // change the shared card, so the form is not offered at all.
  await page.goto(B + "/#" + sid3 + "/threads");
  await wait(800);
  const sid4 = shared.find((e) => e.title === 'the Ambersand').id;
  await page.click('[data-entry="' + sid4 + '"]');
  await wait(600);
  const face = (await page.text('#sideBody') || '');
  ok("a followed thread opens read-only, naming the book it lives in", /lives in The Ash Cycle/.test(face));
  ok("  and offers no way to edit it here", !(await page.visible('[data-cardview="form"]')));

  // FORKING IS A COPY, and the proof is that the source does not move afterwards.
  await page.goto(B + "/#" + sid3 + "/story");
// THE EXPORTS, THE ARCHIVE AND THE DELETE ARE IN THE KEEP GROUP since 2026-09-02 — the story panel
// is four groups behind four chips now, and a group that is not showing is display:none with all of
// its markup still in the document. So the chip is pressed first; without it every press below dies
// on a button with no box.
  for (let i = 0; i < 40 && !(await page.visible('[data-storytab="keep"]')); i++) await wait(250);
  await page.click('[data-storytab="keep"]');
  for (let i = 0; i < 40 && !(await page.visible('[data-forkthreads="1"]')); i++) await wait(250);
  const own = (await story3()).entries.filter((e) => !e.sharedFrom).length;
  await page.click('[data-forkthreads="1"]');
  await wait(1400);
  const lib = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories)()");
  const forked = lib.find((x) => /threads$/.test(x.title));
  ok(`forking makes a new book named after this one (${forked?.title ?? 'none'})`, !!forked);
  ok(`  carrying this book's own threads and not the followed ones (${forked?.entries} of ${own})`,
     forked?.entries === own);
  ok("  and it follows nothing — it owns what it was given",
     (forked?.lore_from ?? null) === null);
}

// ---- A CARD WITH NO BODY STILL SAYS SOMETHING. The 2026-08-29 migration moved every card's body
// into its `facts` room, so `entries.body` is empty on all 461 cards in the live library and the
// grid drew names over blank lines. The preview falls back to facts, then to the first room turned
// on. Falsified by putting `e.body` back as the only source: this block goes red, and nothing else
// in any suite does — which is exactly how the regression shipped unseen in the first place.
{
  const sid5 = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
  const made = await page.eval(`(async () => {
    const v = await (await fetch('/api/entry', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ storyId:'${sid5}', entry:{ title:'Bodyless', entryType:'character', body:'', keys:'' } }) })).json();
    const id = (v.entries ?? []).find((e) => e.title === 'Bodyless')?.id;
    await fetch('/api/addon', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ storyId:'${sid5}', entryId:id,
        addon:{ slot:'facts', name:'Bodyless', body:'a lamplighter who never lit one', keys:'' } }) });
    return id; })()`);
  ok(`a card with an empty body and a facts room exists (${made})`, /^e-/.test(String(made)));
  await page.goto(B + "/#" + sid5);
  for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
  await page.pick('[data-threadsel]', 'view');
  await wait(700);
  const shown = await page.eval(
    `(document.querySelector('[data-entry="${made}"] .clamp3')?.textContent ?? '').trim()`);
  ok(`  and the grid prints its facts rather than a blank line ("${shown.slice(0, 34)}")`,
     /lamplighter/.test(shown));
}

// ---- WHICH CHAPTER THE RITUAL SCREEN IS ABOUT, AFTER A CLOSE. The door pinned `V.currentChapter`,
// which is right while you are writing and wrong the instant a chapter closes: the next one opens
// empty, so pressing the door after a close reported on a chapter with no prose and offered its
// re-run buttons for that one. `ritualPanel` already had the right rule for a cold load and the
// door overrode it. Seth hit this on 2026-08-29 re-running the memory pass on a chapter he had
// just closed.
//
// NO MODEL: /api/chapter/end takes summarise/remember/extract/retire false and closes anyway, which
// is the same flags the ritual screen's own checkboxes send.
{
  const sid6 = await page.eval(`(async () => {
    const r = await (await fetch('/api/stories', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title:'Which Chapter', genre:'test', premise:'x', pov:'third past' }) })).json();
    const id = r.storyId ?? r.id ?? (r.stories && r.stories.at(-1).id);
    await fetch('/api/write', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ storyId:id, body:'The bell rang once and nobody came down for it.' }) });
    await fetch('/api/chapter/end', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ storyId:id, summarise:false, remember:false, extract:false, retire:false }) });
    return id; })()`);
  ok(`a story with one closed chapter and an empty new one (${sid6})`, /^s-/.test(String(sid6)));

  // ---- ISSUE #32. The close REPORTS on its own four passes.
  //
  // Every pass is wrapped so a chapter can close with the model down, and that wrapper used to be a
  // bare `catch {}` — so "no facts arrived" and "the facts pass never ran" were the same screen.
  //
  // THE SHAPE, NOT THE OUTCOME. Whether these four succeed depends on a model this harness does not
  // own: llama-server may or may not be up on the machine running this. So this asserts that the
  // route accounts for every pass it was asked to run, and that a skipped one is absent rather than
  // reported as a failure. Asserting "facts failed" would go green or red with the weather.
  const closed6 = await page.eval(`(async () => {
    const r = await (await fetch('/api/stories', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title:'Which Passes', genre:'test', premise:'x', pov:'third past' }) })).json();
    const id = r.storyId ?? r.id ?? (r.stories && r.stories.at(-1).id);
    await fetch('/api/write', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ storyId:id, body:'The bell rang once and nobody came down for it.' }) });
    // Two asked for, two refused, so the absent pair is a real distinction rather than an empty set.
    const end = await (await fetch('/api/chapter/end', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ storyId:id, remember:false, retire:false }) })).json();
    return JSON.stringify({ passes: end.passes ?? null, hasExtracted: 'extracted' in end }); })()`);
  const p6 = JSON.parse(closed6);
  ok(`  the close reports its passes (${JSON.stringify(p6.passes)})`,
     p6.passes && typeof p6.passes === 'object');
  // The two that were asked for are accounted for either way — null if they ran, a string if not.
  for (const k of ['summary', 'facts']) {
    ok(`  ${k} is accounted for (${JSON.stringify(p6.passes?.[k])})`,
       p6.passes && k in p6.passes
       && (p6.passes[k] === null || typeof p6.passes[k] === 'string'));
  }
  // AND THE ONES NOT ASKED FOR ARE NOT THERE. `remember:false` must read as "not wanted", never as
  // "failed" — a report that lists a pass the writer turned off is a false alarm every close.
  for (const k of ['memory', 'finished']) {
    ok(`  ${k} was refused, so it is absent rather than failed`, !(p6.passes && k in p6.passes));
  }
  // NAMES, NOT NUMBERS. A new story's chapters carry titles ("Chapter One"), so asserting the
  // string "Chapter 1" tested the naming convention rather than which chapter was on screen.
  const chs = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid6}')).json())
    .chapters.map(c => ({ i: c.index ?? c.idx, t: c.title || ('Chapter ' + (c.index ?? c.idx)) })))()`);
  ok(`  two chapters now (${chs.map(c => c.t).join(', ')})`, chs.length === 2);

  await page.goto(B + "/#" + sid6);
  for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
  await page.click('[data-panel="chapter"], [data-nav="chapter"]');
  for (let i = 0; i < 40 && !(await page.visible('[data-ritual="1"]')); i++) await wait(250);
  await page.click('[data-ritual="1"]');
  for (let i = 0; i < 40 && !(await page.visible('#sideBody')); i++) await wait(250);
  await wait(400);
  const said = (await page.eval("document.querySelector('#sideBody')?.textContent || ''")).replace(/\s+/g, ' ');
  // The chapter that just closed is chapter 1. Reporting on chapter 2 is the defect.
  const closed = chs[0].t, opened = chs[1].t;
  ok(`  the door opens the ritual on the chapter that CLOSED (${closed}), not the empty new one (${opened})`,
     said.includes(closed) && !said.includes(opened));
  // And it says so: a closed chapter's screen does not offer to close it again.
  ok('  and a closed chapter is not offered for closing again', !(await page.visible('[data-endchapter="1"]')));
}

console.log(red ? `\n  ${red} RED` : "\n  all green");

// ---- AUTOSAVE ON TOGGLES AND PICKERS, AND ONLY THERE (2026-08-31). Seth: "theres alot of things
// that can be auto saved ... a great example is the check marks for the story banner or choosing
// the pov and voice", and his scope call was toggles and pickers, not free text.
//
// Point of view rather than the banner checkmarks, and that is a fixture fact worth writing down:
// `chapterHero` and `chapterSticky` only render once the story HAS a cover, and The Silver Key has
// none — the panel opened, twelve [data-story] controls were on it, and that checkbox was not one
// of them. POV is a <select> and is always there, and it is Seth's other example.
//
// OPENED BY CLICK, NOT BY DEEP LINK, and guarded. The first version waited on an element that was
// never going to appear, then ran page.eval against null, which threw inside the page and killed
// the scenario WITHOUT a red line — every assertion below it stopped running and the suite still
// said green. Proven by putting ok(..., false) on a line and watching the run report 0 red.
//
// The read-back is the server's own copy, not the DOM, or this would only prove a select can be
// set. The text half is asserted as an ABSENCE — the half that passes for the wrong reason — so
// the picker assertion above it is its validation.
{
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
  await page.click('[data-panel="story"], [data-nav="story"]');
  for (let i = 0; i < 40 && !(await page.visible('[data-story="pov"]')); i++) await wait(250);

  // An option that is not the one already chosen, taken from the select itself rather than assumed.
  const other = await page.eval(`(() => { const s = document.querySelector('[data-story="pov"]');
    if (!s) return null;
    const o = [...s.options].map(o => o.value).filter(v => v && v !== s.value);
    return o[0] ?? null; })()`);
  ok(`the story panel is open with a point-of-view picker offering another option (${JSON.stringify(other)})`,
     typeof other === 'string' && other.length > 0);

  if (other) {
    await page.eval(`(() => { const s = document.querySelector('[data-story="pov"]');
      s.value = ${JSON.stringify(other)};
      s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await wait(800);
    const now = (await story()).story.pov;
    ok(`  a picker saves itself with no Save pressed (server now says ${JSON.stringify(now)})`, now === other);

    // And free text does not. Typed into and left alone; only the Save press commits it.
    const title = (await story()).story.title;
    await page.eval(`(() => { const t = document.querySelector('[data-story="title"]');
      if (!t) return 0; t.value = 'Autosaved By Mistake';
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await wait(800);
    const after = (await story()).story.title;
    ok(`  and typing in a text field does not (still ${JSON.stringify(after)})`, after === title);
  } else {
    ok("  AUTOSAVE ASSERTIONS DID NOT RUN — no second option to choose", false);
  }
}

// ---- THE THREADS PAGE IS A SHELF (2026-08-31). Seth: "lets do a, but as a shelf with the book look
// so its different from just threads." Every book, world books among them, drawn as the same card
// the Stories shelf draws; pressing one scopes the list under it, pressing it again widens back.
//
// GUARDED AND DISPATCHED. Twice today a block like this reported green by not running: a CDP tap
// that missed, then a page.eval against an element that was not there, which throws inside the page
// and kills the scenario with no red line. So the first assertion is that we are on the page at all,
// and every press is a dispatched bubbling click, which the delegated handler on `document` takes.
{
  await page.goto(B + "/#");
  await wait(600);
  await page.eval(`(() => { const b = document.querySelector('[data-nav="canon"]');
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b; })()`);
  for (let i = 0; i < 40 && !(await page.visible('#books')); i++) await wait(250);
  const here = await page.eval("!!document.querySelector('#books')");
  ok('the Threads page opens', here === true);

  if (here) {
    // ---- THE CARD SHELF IS GONE, AND THAT IS THE ASSERTION NOW (2026-08-31).
    //
    // `c095b74` put a shelf of book cards at the top of this page and this block tested it:
    // `data-lselect`, a picked class, a toggle that widened back to every book. `4c69923` took the
    // shelf out again two hours later — "It did nothing you could not do from the titles below it"
    // — and left these assertions behind, so `panels` went three red at HEAD against a feature that
    // was deliberately removed. Third time in this repo: see `7c5fca7`, "Two scenarios left behind
    // by their own commits".
    //
    // Asserting the ABSENCE rather than deleting the block, because the removal is a decision. If a
    // card shelf comes back here it should come back on purpose, with this line changed to say so.
    const shelf = await page.eval(`(() => {
      const cards = [...document.querySelectorAll('#page .storycard')];
      return { cards: cards.length, select: cards.filter(c => c.dataset.lselect).length }; })()`);
    ok(`  and no longer carries a shelf of book cards (${JSON.stringify(shelf)})`,
       shelf.select === 0);
    // What replaced it: the book you are looking at wears a banner, and the books below are titles.
    // One banner, not one per book — which is the failure the app-level check counts too.
    const banners = await page.eval("document.querySelectorAll('#books .lbanner').length");
    ok(`  the open book wears a banner instead (${banners})`, banners === 1);
  } else {
    ok('  SHELF ASSERTIONS DID NOT RUN — the Threads page never opened', false);
  }
}
