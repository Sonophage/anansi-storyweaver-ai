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
  window.__spark = 0; window.__cast = 0; window.__review = 0; window.__style = 0;
  // The last cast request's body, so the steer and the do-not-repeat list can be asserted as having
  // REACHED the call rather than merely as having been typed into a box.
  window.__castBody = null;
  const real = window.fetch;
  window.fetch = (u, o) => {
    const url = String(u);
    // #21 §2. TWO STAGES, TWO SHAPES. The scaffold carries no cast at all — its schema cannot
    // require one any more, which is what makes "no characters at this point" reachable — and the
    // cast is its own call, answering entries and the two names at the top level.
    // Checked for /cast FIRST: it also contains '/api/spark'.
    if (url.includes('/api/spark/review')) {
      window.__review++;
      return Promise.resolve(new Response(JSON.stringify({
        changes: [{ field: 'title', value: 'The Tide Clerk', why: 'The premise is about counting, not about salt.' }],
        entries: [{ title: 'The Quay Office', entryType: 'lore', activation: 'always_on',
                    body: '[The Quay Office: a room of ledgers above the water.]', keys: ['office'] }],
      }), { headers: { 'Content-Type': 'application/json' } }));
    }
    // #28. The house style, written from the genre before the book exists. Its own endpoint, and
    // checked before '/api/spark' for the same reason /cast is: that string is a prefix of both.
    if (url.includes('/api/spark/style')) {
      window.__style++;
      // THE FIRST ONE FAILS ON PURPOSE. A style call that succeeds fills the box, and a full box is
      // itself enough to stop the autofill asking again — so a stub that always answered would let
      // the once-only flag be deleted with nothing going red. The case the flag is FOR is the one
      // where the box is still empty afterwards.
      if (window.__style === 1) return Promise.resolve(new Response(
        JSON.stringify({ error: 'no model in this scenario' }), { headers: { 'Content-Type': 'application/json' } }));
      return Promise.resolve(new Response(JSON.stringify({ style: 'Short scenes. Weather does the work.' }),
        { headers: { 'Content-Type': 'application/json' } }));
    }
    if (url.includes('/api/spark/cast')) {
      window.__cast++;
      const sent = JSON.parse(o.body); window.__castBody = sent;
      // #28. A ONE-CARD RE-ROLL names who is staying, and the stub answers it the way the route
      // does: one entry, of the kind asked for, who is not one of them. Answering with the same
      // two would make the re-roll assertion pass while doing nothing.
      if ((sent.replacing || []).length) {
        return Promise.resolve(new Response(JSON.stringify({
          entries: [{ title: 'Ossian Rede', entryType: sent.kinds[0], activation: 'always_on',
                      body: '[Ossian Rede: a harbour-master who owes nobody.]', keys: ['Ossian'] }],
          persona: null, lockedCharacter: null,
        }), { headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        entries: [
          { title: 'Ilva Marren', entryType: 'character', activation: 'always_on', body: '[Ilva Marren: a tide-clerk.]', keys: ['Ilva'] },
          { title: 'Kade Ashford', entryType: 'character', activation: 'always_on', body: '[Kade Ashford: a creditor.]', keys: ['Kade'] },
        ],
        persona: 'Ilva Marren', lockedCharacter: 'Ilva Marren',
      }), { headers: { 'Content-Type': 'application/json' } }));
    }
    if (url.includes('/api/spark')) { window.__spark++; return Promise.resolve(new Response(JSON.stringify({
      story: { title: 'The Salt Ledger', genre: 'noir, gothic', premise: 'A tide-clerk counts what the sea returns.',
               setting: 'Fallow Quay', pov: 'second person, present tense', spice: 2,
               writingStyle: 'Clipped and wet.', persona: null, lockedCharacter: null },
      entries: [],
    }), { headers: { 'Content-Type': 'application/json' } })); }
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
// COUNCIL 09 §1 · PRESSED TWICE, ON PURPOSE. Two synchronous clicks: the first runs the handler up
// to its first await, which is where `whileWorking` disables the button, so the second lands on a
// button that is already dead. Unguarded this was two model calls, and the router does not queue —
// two concurrent fit and a third kills both with HTTP 500.
await page.eval(`(() => { const b = document.querySelector('[data-spark="1"]');
  b.click(); b.click(); return 1; })()`);
await wait(1200);
ok(`  a double press on Spark sends ONE request (${await page.eval("window.__spark")})`,
   (await page.eval("window.__spark")) === 1);

// EIGHT STEPS: the idea, the book, THE CAST, YOU, a second look, the first scene, the opening, and
// only then does the book open. #21 §3 had you before the cast; #28 swapped them at Seth's
// direction on 2026-08-30, because both of the fields on "you" hold a character's NAME.
const steps = await page.eval("document.querySelectorAll('[data-sparkstep]').length");
ok(`the skeleton arrives as steps, not one scroll (${steps} step controls)`, steps >= 8);

ok("  step 1 is the idea it came from, kept and editable",
   (await page.eval("document.querySelector('[data-sp=\"idea\"]')?.value")) === 'a tide-clerk who counts what the sea gives back');
// Accept on every step is the decision Seth made: everything is prefilled, so gating eight screens
// would turn one press into eight.
ok("  and Accept is already on the first step, not held back to the last",
   (await page.eval("!!document.querySelector('[data-accept-spark]')")) === true);

await page.click('[data-sparkstep="2"]');
await wait(700);
ok("  step 2 is the book, and the voice is on it rather than five steps later",
   (await page.eval("!!document.querySelector('[data-sp=\"title\"]')")) === true
   && (await page.eval("!!document.querySelector('[data-sp=\"writingStyle\"]')")) === true);
ok("  and the scaffold call brought back no cast at all", (await page.eval("window.__cast")) === 0);

// #28 · THE GENRE VOICE FILLS ITSELF, ONCE. Seth: "the genre voice should be autofilled and be able
// to be rerolled to fit the story." The spark schema has never returned styleNote, so this box
// arrived empty on a step most writers pass through, which is a box that stays empty.
{
  ok(`  the house style asks for itself on arriving at the step (${await page.eval("window.__style")} call)`,
     (await page.eval("window.__style")) === 1);
  // The stub refused that one. A fill nobody pressed for that could not reach the router is not an
  // event the writer needs, so it leaves the box alone rather than writing a failure into it.
  ok("  and a refusal leaves the box empty rather than writing an error into it",
     (await page.eval("document.querySelector('[data-sp=\"styleNote\"]')?.value")) === '');

  // ONCE, AND THIS IS THE ASSERTION. The box is STILL EMPTY, so the only thing stopping a second
  // ask is the flag. Without it every repaint of this step is another model call, and the router
  // does not queue — two concurrent fit and a third kills both with HTTP 500.
  await page.click('[data-sparkstep="1"]');
  await wait(300);
  await page.click('[data-sparkstep="2"]');
  await wait(700);
  ok("  and does not ask again on every visit, though the box it would fill is still empty",
     (await page.eval("window.__style")) === 1);

  // The button is the other half of "be able to be rerolled", and it is a real second call.
  await page.click('[data-spstyle="1"]');
  await wait(700);
  ok(`  but the button asks again when it is pressed, and fills the box (${await page.eval("window.__style")} calls)`,
     (await page.eval("window.__style")) === 2
     && (await page.eval("document.querySelector('[data-sp=\"styleNote\"]')?.value")) === 'Short scenes. Weather does the work.');
}

// THE assertion. A step that is not rendered is not in the DOM, so a value edited on one step and
// left there is lost unless it is harvested into state on the way out. This is the whole risk of
// paginating a form that used to read every field at accept time.
await page.eval(`(() => { const t = document.querySelector('[data-sp="title"]');
  t.value = 'The Drowned Ledger'; return 1; })()`);
await page.click('[data-sparkstep="3"]');
await wait(400);
ok("  step 3 arrives empty, and asks what kinds this book needs",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 0
   && (await page.eval("document.querySelectorAll('[data-spkind]').length")) === 4);
await page.click('[data-sparkstep="2"]');
await wait(400);
ok("  an edit survives leaving the step and coming back",
   (await page.eval("document.querySelector('[data-sp=\"title\"]')?.value")) === 'The Drowned Ledger');

// #28 · THE CAST COMES BEFORE YOU, reversing #21 §3. Seth, 2026-08-30: "the who you never speak as
// and the who you are should come AFTER the cast has been set." Both fields hold a NAME, so asking
// before the cast exists is asking the writer to type one the server may then have to drop.
//
// The free-text fallback is still reachable and this is the case that reaches it: skipping the cast
// step leaves nothing to pick from, which is the shape a book with no ledger has.
await page.click('[data-sparkstep="4"]');
await wait(400);
ok("  step 4 is a field you type into while the cast step has been skipped",
   (await page.eval("document.querySelector('[data-sp=\"persona\"]')?.tagName")) === 'INPUT');

// #21 §2 · THE CAST IS ITS OWN CALL, and does not run until the writer says what this book needs.
await page.click('[data-sparkstep="3"]');
await wait(400);
await page.click('[data-spwritecast="1"]');
await wait(600);
ok("  writing the cast is a second call, made only when asked", (await page.eval("window.__cast")) === 1);
ok("  step 3 is the cast", (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 2);

// #28 · THE STEER REACHES THE CALL. Seth: "i should be able to reroll characters or direct it based
// on my input." A box the writer types into that never leaves the browser is the failure this
// asserts against, so the check is on the REQUEST BODY and not on the field's value.
{
  const before = await page.eval("window.__cast");
  await page.eval(`(() => { const t = document.querySelector('[data-sp="castSteer"]');
    t.value = 'nobody over thirty, and one of them owes the sea'; return 1; })()`);
  await page.click('[data-spwritecast="1"]');
  await wait(700);
  const sent = await page.eval("JSON.stringify(window.__castBody || {})");
  ok(`  the steer typed on this step reaches the cast call (${sent.slice(0, 60)}…)`,
     (await page.eval("window.__cast")) === before + 1
     && /owes the sea/.test(sent));
}

// #28 · ONE CARD RE-ROLLED, and the rest left standing. Re-rolling the whole cast already existed
// and replaces the people you had read and kept, which is the wrong tool for a cast that is right
// except for one of them.
{
  const before = await page.eval("window.__cast");
  await page.click('[data-sprecast="1"]');
  await wait(700);
  const names = await page.eval(`(() => [...document.querySelectorAll('[data-spname]')]
    .map(n => n.value).join('|'))()`);
  ok(`  re-rolling one card replaces only that one (${names})`,
     (await page.eval("window.__cast")) === before + 1
     && names === 'Ilva Marren|Ossian Rede');
  // THE CALL HAS TO SAY WHO IS STAYING, or the model re-proposes somebody already on screen: the
  // premise is the same premise and nothing else in the request says they are taken.
  const replacing = await page.eval("JSON.stringify((window.__castBody || {}).replacing || [])");
  const kinds = await page.eval("JSON.stringify((window.__castBody || {}).kinds || [])");
  ok(`  and names the one that is staying, in the one kind asked for (${replacing} ${kinds})`,
     replacing === '["Ilva Marren"]' && kinds === '["character"]');
  // The persona was Ilva and Ilva stayed, so it is untouched — a per-card re-roll has no standing
  // to decide who you play.
  await page.click('[data-sparkstep="4"]');
  await wait(400);
  ok("  and the one you play is untouched by it",
     (await page.eval(`document.querySelector('[data-sp="persona"]')?.value`)) === 'Ilva Marren');
  await page.click('[data-sparkstep="3"]');
  await wait(400);
  // Put the cast back to the two the assertions further down are written against.
  await page.click('[data-spwritecast="1"]');
  await wait(700);
}

// #28 · AND THE LIBRARY IS ON THIS STEP. Seth: "i should be abel to set up lore books or pull from
// already existing lore if i want to pull that information." Setting one UP needed nothing new —
// `lore` has been a kind chip since #21 §2 — but pulling one in had no door in the wizard at all.
ok("  the cast step can also pull threads out of books you already have",
   (await page.eval("!!document.getElementById('seedq') && !!document.getElementById('seeds')")) === true);
{
  // A REAL PICK, CARRIED THROUGH TO THE CREATED BOOK. The picker existing is not the feature — the
  // thread arriving in the new book is, and that happens after Accept through the copy route a
  // single card already uses. Vantic law is a RULE in the seeded book: any kind travels, not only
  // characters, which is the half "pull from already existing lore" is actually about.
  await page.eval(`(() => { const q = document.getElementById('seedq');
    q.value = 'Vantic law'; q.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await wait(500);
  const rows = await page.eval("document.querySelectorAll('[data-seedpick]').length");
  const shown = await page.eval("document.getElementById('seeds')?.innerText || ''");
  ok(`  searching it finds a thread from a book you already have (${rows} shown)`,
     rows >= 1 && /Vantic law/.test(shown));
  await page.click('[data-seedpick]');
  await wait(400);
  ok("  and picking one says it is coming over",
     /1 chosen/.test(await page.eval("document.getElementById('seeds')?.innerText || ''")));
}

// And once there IS a cast, step 4 becomes a pick over it — which is now the ORDINARY path rather
// than the one you reach by walking backwards.
await page.click('[data-sparkstep="4"]');
await wait(400);
ok("  and once there is one, step 4 becomes a pick over it",
   (await page.eval("document.querySelector('[data-sp=\"persona\"]')?.tagName")) === 'SELECT');

{
  const sparksBefore = await page.eval("window.__spark");

  // A KIND NOBODY PICKED IS NOT ASKED FOR. "No characters at this point" was unreachable while the
  // spark schema REQUIRED two of them.
  await page.click('[data-sparkstep="3"]');
  await wait(300);
  await page.click('[data-spkind="character"]');
  await wait(250);
  const castsBefore = await page.eval("window.__cast");
  await page.click('[data-spwritecast="1"]');
  await wait(400);
  ok("  asking for the cast with no kind picked never reaches the model",
     (await page.eval("window.__cast")) === castsBefore);
  await page.click('[data-spkind="character"]');
  await wait(250);

  // RE-ROLLING THE SKELETON LEAVES THE CAST WHERE IT IS. It was written against the book, and a
  // writer asking for another premise has not asked to lose the people in it.
  await page.click('[data-sparkstep="1"]');
  await wait(300);
  await page.click('[data-spreroll="1"]');
  await wait(700);
  ok("  the skeleton re-rolls from the same idea, as its own call",
     (await page.eval("window.__spark")) === sparksBefore + 1);
  await page.click('[data-sparkstep="3"]');
  await wait(350);
  ok("  and the cast it was written for is still standing",
     (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 2);

  // The re-roll replaced the title, which is what it says it does. Put back the one the assertions
  // at the end of this file are about.
  await page.click('[data-sparkstep="2"]');
  await wait(300);
  await page.eval(`(() => { const t = document.querySelector('[data-sp="title"]');
    t.value = 'The Drowned Ledger'; return 1; })()`);
}

// #21 §3 · STEP 5 · A SECOND LOOK, and it fires from a BUTTON. A model call nobody asked for is
// what made "what changed" slow, and #24 is the whole argument against it.
await page.click('[data-sparkstep="5"]');
await wait(400);
ok("  step 5 asks nothing until it is asked", (await page.eval("window.__review")) === 0);
await page.click('[data-spreview="1"]');
await wait(600);
ok("  and reads the whole skeleton back when it is", (await page.eval("window.__review")) === 1);
ok("  proposing a change and a thread, neither of them applied",
   (await page.eval("document.querySelectorAll('[data-spapply]').length")) === 1
   && (await page.eval("document.querySelectorAll('[data-spaddone]').length")) === 1);
await page.click('[data-spapply="0"]');
await wait(400);
ok("  taking one applies it and takes it off the list",
   (await page.eval("document.querySelectorAll('[data-spapply]').length")) === 0);
await page.click('[data-sparkstep="2"]');
await wait(400);
ok("  and the field it replaced carries the new words",
   (await page.eval("document.querySelector('[data-sp=\"title\"]')?.value")) === 'The Tide Clerk');
// Put the title back for the assertions at the end.
await page.eval(`(() => { const t = document.querySelector('[data-sp="title"]');
  t.value = 'The Drowned Ledger'; return 1; })()`);
await page.click('[data-sparkstep="5"]');
await wait(400);
await page.click('[data-spaddone="0"]');
await wait(400);
await page.click('[data-sparkstep="3"]');
await wait(400);
ok("  and a thread she suggested joins the cast when you say so",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 3);
// Drop it again — the assertions at the end count what actually gets written.
await page.eval("(() => { document.querySelector('[data-spcast=\"2\"]').checked = false; return 1; })()");

// Step 4 may only offer people who are still in the cast: a persona naming somebody just dropped is
// exactly the stranding the server's pinCast exists to catch, and the surface should not create it.
await page.eval("(() => { document.querySelector('[data-spcast=\"1\"]').checked = false; return 1; })()");
await page.click('[data-sparkstep="4"]');
await wait(400);
const offered = await page.eval(`(() => [...document.querySelectorAll('[data-sp="persona"] option')]
  .map(o => o.value).filter(Boolean).join('|'))()`);
ok(`  step 4 offers only the cast you kept (${offered})`, offered === 'Ilva Marren');
ok("  and Nobody stays available, because a story can be narrated from outside",
   (await page.eval(`document.querySelectorAll('[data-sp="persona"] option').length`)) === 2);

// The cast is EDITABLE, and renaming somebody there has to carry what points at them. The cast call
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
   (await page.eval("document.querySelectorAll('[data-spname]').length")) === 4
   && (await page.eval("document.querySelector('[data-spname=\"3\"]')?.value")) === '');
await page.click('[data-sparkstep="4"]');
await wait(400);
const afterRename = await page.eval(`(() => [...document.querySelectorAll('[data-sp="persona"] option')]
  .map(o => o.value).filter(Boolean).join('|'))()`);
ok(`  a rename on step 3 reaches step 4 (${afterRename})`, afterRename === 'Ilva Vane');
ok("  and the persona followed her rather than falling back to Nobody",
   (await page.eval(`document.querySelector('[data-sp="persona"]')?.value`)) === 'Ilva Vane');

// #21 §3 · BOTH DEFAULT TO THE ONE YOU PLAY, and the columns stay separate: a book with a second
// lead the writer does not speak as is a real shape, so it is a press rather than a rule.
await page.eval(`(() => { const l = document.querySelector('[data-sp="lockedCharacter"]');
  l.value = ''; l.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
await page.click('[data-sparkstep="3"]');
await wait(300);
await page.click('[data-sparkstep="4"]');
await wait(400);
ok("  the model-never-writes field can be cleared on its own",
   (await page.eval(`document.querySelector('[data-sp="lockedCharacter"]')?.value`)) === '');
await page.click('[data-splock="1"]');
await wait(400);
ok("  and one press puts the one you play back into it",
   (await page.eval(`document.querySelector('[data-sp="lockedCharacter"]')?.value`)) === 'Ilva Vane');

// #21 §3 · STEP 8 SAYS WHAT ACCEPTING WILL WRITE, before it is pressed.
await page.click('[data-sparkstep="8"]');
await wait(400);
const begin = await page.eval("document.querySelector('#page')?.innerText || ''");
ok("  the last step says what will be created rather than asking for more",
   /Ilva Vane/.test(begin) && /thread/.test(begin));

// COUNCIL 09 §1 · THE ONE THAT MATTERED. Accept does not call the model, it WRITES — so the second
// press did not cost a request, it created a second book, silently, with the same title and the
// same cast. The count below is the assertion; `made` alone would have found the first of two and
// reported green.
await page.eval(`(() => { const b = document.querySelector('[data-accept-spark]');
  b.click(); b.click(); return 1; })()`);
await wait(2600);
const howMany = await page.eval(`(async () => { const r = await (await fetch('/api/stories')).json();
  return r.stories.filter(x => x.title === 'The Drowned Ledger').length; })()`);
ok(`  a double press on Accept creates ONE book, not two (${howMany})`, howMany === 1);
const made = await page.eval(`(async () => { const r = await (await fetch('/api/stories')).json();
  const s = r.stories.find(x => x.title === 'The Drowned Ledger');
  if (!s) return null;
  const v = await (await fetch('/api/story?story=' + s.id)).json();
  return { title: v.story.title, persona: v.story.persona, locked: v.story.lockedCharacter,
           entries: v.entries.length, pov: v.story.pov,
           names: v.entries.map(e => e.title).sort().join('|') }; })()`);
ok(`accepting from step 2 creates the story with every step's answers (${JSON.stringify(made)})`, !!made);
if (made) {
  ok("  the title edited on step 1 is the one that was saved", made.title === 'The Drowned Ledger');
  // Two: the one character kept from the cast, and the rule picked out of the library. The blank
  // row started with + and abandoned is dropped, and so is the unticked one.
  ok(`  the kept cast and the picked thread were written, and nothing else (${made.names})`,
     made.entries === 2 && made.names === 'Ilva Vane|Vantic law');
  ok("  the persona survived the rename", made.persona === 'Ilva Vane');
  // Anansi proposed Ilva for both. She stayed, so both stand — the drop only fires on a name that
  // left the cast, which is what the server's proposedCast list is for.
  ok("  and the locked character with it", made.locked === 'Ilva Vane');
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
