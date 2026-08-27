// The five-step wizard, driven without the model.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/wizard.js
//
// This exists because the creation form had NO coverage in the default suite — the only spark
// scenario is in model.js, which is excluded because it waits on a real generation. So repaginating
// that form into five steps turned nothing red, which is the worst kind of green: it says the suite
// did not look, not that the change is sound.
//
// fetch is stubbed in the page for /api/spark and /api/generate only. Everything else — the real
// create call, the real ledger — goes to the real server, so what is under test is the wizard and
// not a mock of it.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.goto(B + "/");
await wait(700);

// A canned skeleton, in the shape POST /api/spark really returns. Anansi proposes a persona and a
// locked character, which is what the server polices and what step 4 has to offer.
await page.eval(`(() => {
  const real = window.fetch;
  window.fetch = (u, o) => {
    const url = String(u);
    if (url.includes('/api/spark')) return Promise.resolve(new Response(JSON.stringify({
      story: { title: 'The Salt Ledger', genre: 'noir, gothic', premise: 'A tide-clerk counts what the sea returns.',
               setting: 'Fallow Quay', pov: 'second person, present tense', spice: 2,
               writingStyle: 'Clipped and wet.', persona: 'Ilva Marren', lockedCharacter: 'Ilva Marren' },
      entries: [
        { title: 'Ilva Marren', entryType: 'character', activation: 'always_on', body: '[Ilva Marren: a tide-clerk.]', keys: ['Ilva'] },
        { title: 'Kade Ashford', entryType: 'character', activation: 'always_on', body: '[Kade Ashford: a creditor.]', keys: ['Kade'] },
      ],
    }), { headers: { 'Content-Type': 'application/json' } }));
    // The opening passage fires through the ordinary generate path. Stubbed so this scenario does
    // not wait on a model it was written to run without.
    if (url.includes('/api/generate')) return Promise.resolve(new Response(
      JSON.stringify({ error: 'no model in this scenario' }), { headers: { 'Content-Type': 'application/json' } }));
    return real(u, o);
  };
  return 1; })()`);

await page.click('[data-open="new"]');
await wait(500);
await page.type('#idea', 'a tide-clerk who counts what the sea gives back');
await page.click('[data-spark="1"]');
await wait(900);

const steps = await page.eval("document.querySelectorAll('[data-sparkstep]').length");
ok(`the skeleton arrives as steps, not one scroll (${steps} step controls)`, steps >= 5);
ok("  step 1 asks what the book is",
   (await page.eval("!!document.querySelector('[data-sp=\"title\"]')")) === true
   && (await page.eval("!!document.querySelector('[data-sp=\"setting\"]')")) === false);
// Accept on every step is the decision Seth made: everything is prefilled, so gating five screens
// would turn one press into five.
ok("  and Accept is already on the first step, not held back to the last",
   (await page.eval("!!document.querySelector('[data-accept-spark]')")) === true);

// THE assertion. A step that is not rendered is not in the DOM, so a value edited on one step and
// left there is lost unless it is harvested into state on the way out. This is the whole risk of
// paginating a form that used to read every field at accept time.
await page.eval(`(() => { const t = document.querySelector('[data-sp="title"]');
  t.value = 'The Drowned Ledger'; return 1; })()`);
await page.click('[data-sparkstep="3"]');
await wait(400);
ok("  step 3 is the cast", (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 2);
await page.click('[data-sparkstep="1"]');
await wait(400);
ok("  an edit survives leaving the step and coming back",
   (await page.eval("document.querySelector('[data-sp=\"title\"]')?.value")) === 'The Drowned Ledger');

// Step 4 may only offer people who are still in the cast: a persona naming somebody just dropped is
// exactly the stranding the server's pinCast exists to catch, and the surface should not create it.
await page.click('[data-sparkstep="3"]');
await wait(400);
await page.eval("(() => { document.querySelector('[data-spcast=\"1\"]').checked = false; return 1; })()");
await page.click('[data-sparkstep="4"]');
await wait(400);
const offered = await page.eval(`(() => [...document.querySelectorAll('[data-sp="persona"] option')]
  .map(o => o.value).filter(Boolean).join('|'))()`);
ok(`  step 4 offers only the cast you kept (${offered})`,
   offered === 'Ilva Marren');
ok("  and Nobody stays available, because a story can be narrated from outside",
   (await page.eval(`document.querySelectorAll('[data-sp="persona"] option').length`)) === 2);

// The cast is EDITABLE, and renaming somebody there has to carry what points at them. The spark
// proposed Ilva for both persona and locked character; renaming her must not leave step 4 offering
// a name the cast no longer contains and silently falling back to Nobody.
await page.click('[data-sparkstep="3"]');
await wait(400);
ok("  a proposed character can be edited in place",
   (await page.eval("!!document.querySelector('[data-spname=\"0\"]')")) === true
   && (await page.eval("!!document.querySelector('[data-spbody=\"0\"]')")) === true);
await page.eval(`(() => { document.querySelector('[data-spname="0"]').value = 'Ilva Vane';
  document.querySelector('[data-spbody="0"]').value = '[Ilva Vane: a tide-clerk who lies about it.]';
  return 1; })()`);
// And a blank one you started and abandoned must not reach the ledger as "Untitled".
await page.click('[data-spadd]');
await wait(400);
ok("  writing one of your own gives you a field to type in, not a row called Untitled",
   (await page.eval("document.querySelectorAll('[data-spname]').length")) === 3
   && (await page.eval("document.querySelector('[data-spname=\"2\"]')?.value")) === '');
await page.click('[data-sparkstep="4"]');
await wait(400);
const afterRename = await page.eval(`(() => [...document.querySelectorAll('[data-sp="persona"] option')]
  .map(o => o.value).filter(Boolean).join('|'))()`);
ok(`  a rename on step 3 reaches step 4 (${afterRename})`, afterRename === 'Ilva Vane');
ok("  and the persona followed her rather than falling back to Nobody",
   (await page.eval(`document.querySelector('[data-sp="persona"]')?.value`)) === 'Ilva Vane');

// Step 5, and the voice the writer can apply in one press.
await page.click('[data-sparkstep="5"]');
await wait(400);
ok("  step 5 is the voice, and the opening switch is on by default",
   (await page.eval("!!document.querySelector('[data-sp=\"writingStyle\"]')")) === true
   && (await page.eval("document.querySelector('[data-sp-open]')?.checked")) === true);
const before = await page.eval("document.querySelector('[data-sp=\"writingStyle\"]')?.value");
await page.click('[data-spvoice="shipped"]');
await wait(400);
const after = await page.eval("document.querySelector('[data-sp=\"writingStyle\"]')?.value");
ok(`  Quick apply replaces the voice (${before?.length} ch -> ${after?.length} ch)`,
   after !== before && (after || '').length > 100);

// And the end to end: accept from a step that is NOT the last, with an edit made two steps ago.
await page.click('[data-sparkstep="2"]');
await wait(400);
await page.click('[data-accept-spark]');
await wait(1800);
const made = await page.eval(`(async () => { const r = await (await fetch('/api/stories')).json();
  const s = r.stories.find(x => x.title === 'The Drowned Ledger');
  if (!s) return null;
  const v = await (await fetch('/api/story?story=' + s.id)).json();
  return { title: v.story.title, persona: v.story.persona, locked: v.story.lockedCharacter,
           entries: v.entries.length, pov: v.story.pov }; })()`);
ok(`accepting from step 2 creates the story with every step's answers (${JSON.stringify(made)})`, !!made);
if (made) {
  ok("  the title edited on step 1 is the one that was saved", made.title === 'The Drowned Ledger');
  ok("  only the kept, named cast was written — the blank one was dropped", made.entries === 1);
  ok("  the persona survived the rename", made.persona === 'Ilva Vane');
  // Anansi proposed Ilva for both. She stayed, so both stand — the drop only fires on a name that
  // left the cast, which is what the server's proposedCast list is for.
  ok("  and the locked character with it", made.locked === 'Ilva Vane');
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
