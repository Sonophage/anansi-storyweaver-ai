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

console.log(red ? `\n  ${red} RED` : "\n  all green");
