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
ok("the rail lists six panels in the order asked for",
   nav === 'story,chapter,threads,context,search,teller');
ok("  and Trajectory, What the chapter added and Branches are no longer rows of their own",
   !/traj|queue|branches/.test(nav));

// ---- 2. every row opens a panel with content in it. A nav row pointing at a panel that no
// longer exists renders an empty tray, which is exactly what a rename gets wrong.
for (const [k, label] of [['story', 'Story'], ['chapter', 'Chapter'], ['threads', 'Threads'],
                          ['context', 'Context'], ['search', 'Search'], ['teller', 'Storyteller']]) {
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

// ---- 7. the Inspector button is off the top bar; the context reading stays
const bar = (await page.text('#bar') || '');
ok("the Inspector button is gone from the top bar", !/Inspector/.test(bar));
ok(`  but the context reading stays, since nothing else shows it (${JSON.stringify((bar.match(/Context \d+%|No room/) ?? [''])[0])})`,
   /Context \d+%|No room/.test(bar));
ok("  and it opens the Context panel", await page.eval(
  "!!document.querySelector('#bar [data-panel=\"context\"]')"));

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
ok("  and says which chapter you are on", /chapter \d+ of \d+/i.test(await page.text('#col') || ''));
if (v.chapters.length > 1) {
  ok("  with a pager to the neighbouring chapters", await page.visible('#col [data-chapter]'));
  // Which chapter you are reading lives in CLIENT state — view(storyId, focusChapterId). Asking
  // /api/story again without &chapter= answers with the last chapter every time, so a fresh fetch
  // cannot see the focus at all. Read the document, which is the thing under test anyway.
  const heading = () => page.eval("document.querySelector('#col > div')?.textContent ?? ''");
  const to = await page.eval("document.querySelector('#col [data-chapter]')?.dataset.chapter ?? ''");
  const want = v.chapters.find((c) => c.id === to);
  await page.click('#col [data-chapter]');
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

// ---- 11. + Lore replaces New scene. Two ways a fact reaches canon, and they belong together:
// write it down yourself, or have the chapter read for what is already on the page.
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
ok("+ Lore is on the composer bar", await page.visible('[data-newlore]'));
ok("  and New scene is not", !/New scene/.test(await page.text('#modes') || ''));
await page.click('[data-newlore="1"]');
await wait(700);
const lore = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
ok("  it opens a tray with both ways in", /Write it down/.test(lore) && /read the chapter/i.test(lore));
ok("  offering every kind of card",
   (await page.eval("[...document.querySelectorAll('[data-lorekind]')].map(b=>b.dataset.lorekind).sort().join(',')"))
     === 'character,item,lore,rule');
await page.click('[data-lorekind="item"]');
await wait(400);
ok("  and picking a kind changes what New would make",
   /New an object/.test(await page.text('#sideBody') || ''));
ok("  scanning the chapter is offered without ending it", await page.visible('[data-loreread]'));
await page.click('[data-newlore="1"]');
await wait(400);
ok("  and it closes again", !/Write it down/.test(await page.text('#sideBody') || ''));
// threads() returns the entry editor before it looks at S.lore, so with an entry open the tray
// set its state and the editor rendered anyway — the button did nothing you could see.
const anyEntry = await page.eval("document.querySelector('[data-entry]')?.dataset.entry");
if (anyEntry) {
  await page.click(`[data-entry="${anyEntry}"]`);
  await wait(500);
  ok("  (an entry editor opens)", await page.eval("!!document.querySelector('[data-f=\"title\"]')"));
  await page.click('[data-newlore="1"]');
  await wait(600);
  ok("+ Lore works with an entry already open", /Write it down/.test(await page.text('#sideBody') || ''));
  ok("  and it leaves the entry editor", await page.eval("!document.querySelector('[data-f=\"title\"]')"));
  await page.click('[data-newlore="1"]');
  await wait(300);
} else { ok("there is an entry to open", false); }

// ---- 12. the writing dashboard, drawn from rows that already existed
await page.goto(B + "/");
await page.click('[data-nav="prefs"]');
for (let i = 0; i < 60 && !/What you have written/.test(await page.text('#page') || ''); i++) await wait(250);
const prefs = (await page.text('#page') || '').replace(/\s+/g, ' ');
ok("Preferences reports what you have written", /What you have written/.test(prefs));
for (const label of ['Words', 'Passages', 'Stories', 'In the ledgers', 'Takes not chosen', 'Calls to the model'])
  ok(`  ${label}`, new RegExp(label).test(prefs));
ok(`  and splits passages between you and Anansi (${JSON.stringify((prefs.match(/Passages[^A-Z]{0,40}/) ?? [""])[0].trim())})`,
   /yours/.test(prefs) && /Anansi/.test(prefs));
const words = Number((prefs.match(/Words[^\d]*([\d,]+)/) ?? [, '0'])[1].replace(/,/g, ''));
console.log("  words reported: " + words);
ok(`  with a real count, not a placeholder (${words})`, words > 0);
ok("  and says which models are allowed, or that all are",
   /allowed for Anansi|Every model the router serves/.test(prefs));

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
await page.eval("(async () => { await fetch('/api/outfit', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId:'" + sid3 + "', entryId:'" + who.id + "',"
  + " outfit:{ name:'Plate', body:'the plate he took from the hall' } }) });"
  + " await fetch('/api/outfit', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId:'" + sid3 + "', entryId:'" + who.id + "',"
  + " outfit:{ name:'Travelling', body:'oiled canvas, hood up' } }) }); })()");
await page.goto(B + "/#" + sid3 + "/threads");
await wait(900);
ok("outfits appear as chips under the character", await page.visible(`[data-wear^="${who.id}:"]`));
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

console.log(red ? `\n  ${red} RED` : "\n  all green");
