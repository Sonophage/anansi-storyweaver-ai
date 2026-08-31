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
ok(`the rail lists the panels in the order asked for (${nav})`,
   nav === 'search,waiting,story,chapter,threads,strings,context,teller');
ok("  and Trajectory, What the chapter added and Branches are no longer rows of their own",
   !/traj|queue|branches/.test(nav));

// ---- 2. every row opens a panel with content in it. A nav row pointing at a panel that no
// longer exists renders an empty tray, which is exactly what a rename gets wrong.
for (const [k, label] of [['story', 'Story'], ['chapter', 'Chapter'], ['threads', 'Threads'],
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
for (const [what, re] of [['the chapter name', /Name/], ['how it must end', /must end with/],
                          ['where the story is going', /Where this is going/],
                          ['what the chapter added', /What this chapter added/],
                          ['the summaries', /Summaries in context/], ['branches', /Branches/],
                          ['and closing it', /End this chapter/]]) {
  ok(`Chapter holds ${what}`, re.test(chapter));
}
ok("  and the fields are real inputs, not labels",
   await page.eval("!!document.querySelector('[data-chapter-title]') && !!document.querySelector('[data-chapter-note]')"
     + " && !!document.querySelector('[data-story=\"direction\"]')"));

// ---- 3b. The hatch. The prose window closes at the chapter boundary on 2026-08-27, so this is
// the only way back to a chapter the model has stopped seeing. `keep_whole` had been honoured by
// the engine since it was written and had no control anywhere — a finished feature with no door,
// which is this repo's recurring failure.
{
  const pull = () => page.eval("(() => { const b = document.querySelector('[data-pullback]');"
    + " return b ? { on: b.dataset.on, text: b.textContent.trim().slice(0, 40) } : null; })()");
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
  // PUT THE PAGE BACK. Section 4 below is written against the Chapter panel and reaches straight
  // for [data-story="direction"] — this block navigated away, so it found nothing and threw, and
  // took the remaining 124 assertions with it. A section that moves the page owes the next one the
  // state it was handed.
  await page.goto(B + "/#" + sid + "/chapter");
  for (let i = 0; i < 40 && !(await page.visible('[data-story="direction"]')); i++) await wait(250);
}

// ---- 4. Saving from Chapter must not blank the story. updateStory was a full-row UPDATE, so a
// panel holding one [data-story] field bound undefined to every other column — the Trajectory
// panel's Save answered 500 for exactly this reason.
const before = (await story()).story;
await page.eval("(() => { const el = document.querySelector('[data-story=\"direction\"]');"
  + " el.value = 'She hands the key over and keeps the debt.'; return 1; })()");
await page.click('[data-savestory="1"]');
await wait(1200);
const after = (await story()).story;
ok(`saving from Chapter lands the field (${JSON.stringify((after.direction || '').slice(0, 34))})`,
   /keeps the debt/.test(after.direction || ''));
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
ok("  but no longer the chapter's", !/must end with/.test(storyBody));
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
ok("  with a way to add each kind",
   (await page.eval("[...document.querySelectorAll('[data-newentry]')].map(b => b.dataset.newentry).sort().join(',')"))
     === 'character,item,lore,rule');

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
for (const [old, now] of [['inspector', 'Context'], ['cast', 'Threads'],
                          ['traj', 'Chapter'], ['queue', 'Chapter'], ['branches', 'Chapter']]) {
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
  const heading = () => page.eval("document.querySelector('#col > div')?.textContent ?? ''");
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
    steer: !!document.querySelector('[data-setup="steer"]'),
    ledger: !!document.getElementById('setupQ'),
    steps: document.querySelectorAll('[data-setupstep]').length }))()`);
  console.log("  setup cold: " + JSON.stringify(cold));
  ok(`  it opens on the premise, with title and beat together (${cold.steps} steps offered)`,
     cold.title && cold.note && cold.steps >= 3);
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
ok("the composer bar carries the door to this story's threads", await page.visible('[data-goblock="threads:"]'));
// AND THE TRAY HAS ITS OWN BUTTON BESIDE IT, which is not the same door. Seth: "button next to
// anansi near the input should be + threads. add threads." The list and the writing-down tray are
// different jobs; for half a day the list was standing where both had to fit.
ok("  with the writing-down tray beside it, not behind it", await page.visible('[data-newlore]'));
ok("  and New scene is still not there", !/New scene/.test(await page.text('#modes') || ''));
await page.click('[data-goblock="threads:"]');
await wait(700);
const list = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
ok("  pressing it opens the list of everything written down", /Characters/.test(list) && /Add/.test(list));
// ORDER, not just presence. Seth: "move the add to the top and the list of whats in the book to the
// bottom." The list grows without limit and the four Add buttons do not, so asserting only that
// both are on the panel is an assertion that was already true before the change and stays true if
// they swap back.
ok("  with Add above the book, not buried under it",
   list.indexOf('Add') >= 0 && list.indexOf('Add') < list.indexOf('Characters'));
ok("  not the tray", !/Write it down/.test(list));
ok("  and the tray has its own door from in here", await page.visible('[data-newlore]'));

await page.click('[data-newlore="1"]');
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

await page.click('[data-newlore="1"]');
await wait(400);
ok("  and the tray closes again", !/Write it down/.test(await page.text('#sideBody') || ''));

// With an entry open, threads() returns the editor before it looks at S.lore — so the tray's own
// door is not on screen and the composer's is the way back. That door clears the open entry as
// well as the tray, which is what makes it the door to the LIST rather than to whatever was last
// left open three presses ago.
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
  await page.click('[data-cardview="form"]');
  await wait(400);
  ok("  and Edit this card opens the form", await page.eval("!!document.querySelector('[data-f=\"title\"]')"));
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
  await page.click('[data-goblock="threads:"]');
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
  const keyf = await page.eval(`(() => { const i = document.querySelector('[data-f="keys"]');
    if (!i) return null;
    const hint = i.nextElementSibling ? i.nextElementSibling.textContent : '';
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
  await page.click('[data-goblock="threads:"]');
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
const openFold = async (name) => {
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

// ---- 16. strings: what the story owes, and what the model is told about it
// Writer-facing until summoned, because a model handed an unresolved promise reaches for it.
await page.goto(B + "/#" + sid3 + "/strings");
await wait(900);
ok("Strings is a panel of its own", /string is something the story has promised/i.test(await page.text('#sideBody') || ''));
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
ok("  and does not send it — no answer, no thinking",
   !/Thinking/.test(await page.text('#sideBody') || ''));
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
  await page.click('[data-goblock="threads:"]');
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
