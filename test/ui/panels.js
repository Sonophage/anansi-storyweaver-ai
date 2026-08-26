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
// Seth's stated order — story/chapter/threads/context/search/storyteller — with Anansi APPENDED
// rather than slotted in, so that order still reads exactly as he wrote it.
ok(`the rail lists the panels in the order asked for (${nav})`,
   nav === 'story,chapter,threads,strings,context,search,teller,anansi');
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
// Have Anansi write one. The button is on the tray for whichever kind is selected, and the box
// beside it is the writer's own steer.
ok("  and Anansi can write one, for the kind you picked",
   (await page.eval("document.querySelector('[data-invent]')?.dataset.invent")) === 'item');
ok("  with a line of direction and the search switch",
   await page.visible('[data-invdir]') && await page.visible('[data-invsearch]'));
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
for (const label of ['Words', 'Passages', 'Stories', 'Threads', 'Takes not chosen', 'Calls to the model'])
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
// The Wardrobe form can write one too, for THIS character, and the button says whose it is.
await page.click(`#page [data-entry="${who.id}"], [data-entry="${who.id}"]`);
await wait(600);
ok("  the Wardrobe offers to have Anansi write one",
   (await page.eval("document.querySelector('[data-invent]')?.dataset.invent")) === 'outfit');
ok(`  named for the character it dresses`,
   (await page.eval("document.querySelector('[data-invent=\"outfit\"]')?.textContent") || '').includes(who.title));
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

// ---- 16. releasing and restarting the server. The router has NO unload call — it only sleeps
// after 15 minutes idle — so stopping the unit is the only way to get the VRAM back now.
//
// This NEVER presses stop for real. The first press only arms it, which is the behaviour under
// test; actually stopping would take the model away from whatever else is using the box.
await page.goto(B + "/");
await page.click('[data-nav="prefs"]');
for (let i = 0; i < 60 && !(await page.visible('[data-router]')); i++) await wait(250);
const prefsText = () => page.text('#page').then((t) => (t || '').replace(/\s+/g, ' '));
ok("Preferences reports the server itself", /The server itself/.test(await prefsText()));
ok("  with its state", /llama-router/.test(await prefsText()));
ok("  a restart button", await page.visible('[data-router="restart"]'));
ok("  and a release button", await page.visible('[data-router="stop"]'));
ok("  which says what releasing costs", /VRAM back|cannot write while it is stopped/i.test(await prefsText()));
await page.click('[data-router="stop"]');
await wait(700);
const armed = (await page.text('#toast') || '').trim();
console.log("  first press: " + JSON.stringify(armed.slice(0, 60)));
ok("the first press only arms the release", /Press again/i.test(armed));
const stillUp = await page.eval("(async () => { const r = await fetch('/api/router', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'status', storyId:'" + sid4 + "' }) });"
  + " return (await r.json()).state; })()");
const ungated = await page.eval("(async () => { const r = await fetch('/api/router', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'stop' }) });"
  + " return r.status; })()");
ok(`  and the route is gated — no story id, no stopping the server (${ungated})`, ungated >= 400);
ok(`  and it reports on the unit it was given (${stillUp})`, typeof stillUp === 'string' && stillUp.length > 0);
ok("  which is NOT the real router — run.sh points test servers at a unit that does not exist",
   stillUp !== 'active');
await page.goto(B + "/");   // navigate away rather than press again

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

console.log(red ? `\n  ${red} RED` : "\n  all green");
