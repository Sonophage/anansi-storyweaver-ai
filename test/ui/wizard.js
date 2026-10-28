// The spark wizard, driven without the model. #84 (2026-10-27) put You before the threads and a
// preview after Try it on; this file was updated for it without being run (no browser checks that
// round), so its first run is owed.
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
// locked character; since #84 the wizard ignores them, because You is chosen before the cast.
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
      // #40, 2026-09-01 · THE FIRST ONE FAILS ON PURPOSE, the same idiom the style call above uses.
      // Leaving the book step now ASKS for the threads by itself, so a stub that always answered
      // would make "the step arrives empty" and the free-text persona fallback unreachable — and
      // both are real states: they are what a writer gets when the model is down. The failing first
      // call is also the case the castTried flag exists for.
      // NO BACKTICKS IN HERE: this whole stub lives inside a page.eval template literal.
      if (window.__cast === 1) return Promise.resolve(new Response(
        JSON.stringify({ error: 'no model in this scenario' }), { headers: { 'Content-Type': 'application/json' } }));
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

// EIGHT STEPS, and they are asserted BY NAME because that is now what the app keys off. #84 moved
// You ahead of the threads (the cast call is told who you play) and added the preview.
//
// The order, after #40 on 2026-09-01: the book, the threads, a second look, you, the first scene,
// the opening, begin. What changed from eight: the idea screen went — Seth, "skip step one it's just
// showing me what I already wrote" — and it survives as a field on the book step, because every
// re-roll asks again from exactly it. The second look moved UP, to after the threads and before you,
// so the threads it proposes arrive before the writer picks a persona out of them.
//
// #21 §3 had you before the cast; #28 swapped them on 2026-08-30, because both fields on "you" hold
// a character's NAME. That still holds — you is still after the threads.

/* GO TO A STEP BY NAME, not by index — issue #40, 2026-09-01.
 *
 * Every navigation here was `page.click('[data-sparkstep="4"]')`. The wizard was reordered on
 * 2026-09-01 (the idea screen went, the second look moved up) and every one of those numbers then
 * pointed at a different screen: the suite DIED after 7 ok rather than reporting which. The app's
 * own step conditions were renumbered into names in the same change for exactly this reason, and a
 * test that still counts screens undoes half of that.
 *
 * The dots carry `aria-label` set from the step's title, which is what makes this possible without a
 * new attribute. Throws with the list it CAN see, so a renamed step names itself instead of failing
 * as a click on nothing.
 */
const go = async (title) => {
  const n = await page.eval(`(() => { const b = [...document.querySelectorAll('[data-sparkstep]')]
    .find(e => (e.getAttribute('aria-label') || '') === ${JSON.stringify(title)});
    return b ? b.dataset.sparkstep : null; })()`);
  if (!n) {
    const have = await page.eval(`JSON.stringify([...document.querySelectorAll('[data-sparkstep]')]
      .map(e => e.getAttribute('aria-label')))`);
    throw new Error(`no wizard step called ${JSON.stringify(title)} — the steps are ${have}`);
  }
  await page.click(`[data-sparkstep="${n}"]`);
  await wait(450);
};

// THE DOTS, WHICH ARE THE ONES THAT NAME THEMSELVES. Back and Next carry `data-sparkstep` too —
// they are how you move — so a bare selector counts nine things and reports eight steps plus an
// empty name. The indicator row is the labelled one, and `go()` already matches on the label.
const stepNames = JSON.parse(await page.eval(
  `JSON.stringify([...document.querySelectorAll('[data-sparkstep][aria-label]')]
     .map(e => e.getAttribute('aria-label')))`));
ok(`the skeleton arrives as steps, not one scroll (${stepNames.length} step controls)`,
   stepNames.length === 8);
// THE ORDER ITSELF, asserted. It is the thing #40 changed and the thing a later reorder would
// change again by accident — the array in app.js is now the only place it lives.
ok(`  in order: ${stepNames.join(' -> ')}`,
   JSON.stringify(stepNames) === JSON.stringify(['The tale', 'You', 'The threads', 'Try it on',
     'The preview', 'The first scene', 'The opening', 'Begin']));
// AND THE IDEA SCREEN IS GONE, which is the ask. Asserted as an absence so putting it back is a red.
ok('  the idea is no longer a screen of its own', !stepNames.includes('Your idea'));

// THE IDEA IS A LINE ON THE FIRST STEP NOW, not a screen. It could not simply be deleted: it is
// what the story was asked FOR and every re-roll sends exactly it, so the screen that echoed him was
// carrying the one input a re-roll needs.
ok("  the idea it came from is on the first step, kept and editable",
   (await page.eval("document.querySelector('[data-sp=\"idea\"]')?.value")) === 'a tide-clerk who counts what the sea gives back');
ok("  and the book's own fields are on that same step, not one further in",
   (await page.eval("!!document.querySelector('[data-sp=\"title\"]')")) === true);
// Accept on every step is the decision Seth made: everything is prefilled, so gating eight screens
// would turn one press into eight.
ok("  and Accept is already on the first step, not held back to the last",
   (await page.eval("!!document.querySelector('[data-accept-spark]')")) === true);
// Before the last step it is a small link that says it skips the rest (second usability check,
// 2026-10-25): as a full button under Next it read as the next step.
ok("  as a small link that says it skips the other steps",
   /Skip the other steps/.test(await page.eval("document.querySelector('[data-accept-spark]')?.textContent ?? ''")));

await go("The tale");
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
  // AWAY AND BACK, and away has to be a DIFFERENT step or this proves nothing. It was
  // `sparkstep=1` then `sparkstep=2`, and step 1 became the book itself on 2026-09-01 — so the
  // mechanical rewrite of this file turned it into clicking one step twice, which never unmounts the
  // box and would have passed with the once-only flag deleted.
  await go("The threads");
  await go("The tale");
  await wait(400);
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
await go("The threads");
await wait(700);

/* #40 stage 3 · EVERY KIND IS ON FROM THE START (2026-09-01). Seth: "Characters rules and lore
 * shoul all be auto selected from the start." It was characters alone, so a book that wanted its
 * places and its rules written had to know to ask for them.
 *
 * The threads do NOT ask for themselves — that half of #40 is not landed and the reason is written
 * at the `d.sparkstep` handler in web/app.js. The step still arrives empty and the cast is still its
 * own call, which is what the assertions below this one are written against.
 */
// Five kinds since #80 added Places.
ok("  every kind is on from the start, not characters alone",
   (await page.eval(`document.querySelectorAll('[data-spkind][aria-pressed="true"]').length`)) === 5);
ok("  the step arrives empty, and asks what kinds this book needs",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 0
   && (await page.eval("document.querySelectorAll('[data-spkind]').length")) === 5);
/* #40 · AND THE THREADS SUGGEST THEMSELVES on leaving the book. Seth: "having them suggested is
 * good." Fired on LEAVING rather than arriving, which is what keeps it inside #24's rule — pressing
 * on IS the ask. The stub refused this first one, so what is on screen is the model-down state.
 */
ok(`  the threads asked for themselves on the way in (${await page.eval("window.__cast")} call)`,
   (await page.eval("window.__cast")) === 1);
ok("  and the step is empty because that call could not reach the model",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 0);
// ONCE, EVEN AFTER A FAILURE. `castTried` and not `entries.length`: paging back and forth must not
// re-ask on a router that does not queue.
await go("The tale");
await go("The threads");
await wait(500);
ok("  and does not ask again on the next visit, though it came back with nothing",
   (await page.eval("window.__cast")) === 1);
await go("The tale");
await wait(400);
ok("  an edit survives leaving the step and coming back",
   (await page.eval("document.querySelector('[data-sp=\"title\"]')?.value")) === 'The Drowned Ledger');

// #28 · THE CAST COMES BEFORE YOU, reversing #21 §3. Seth, 2026-08-30: "the who you never speak as
// and the who you are should come AFTER the cast has been set." Both fields hold a NAME, so asking
// before the cast exists is asking the writer to type one the server may then have to drop.
//
// The free-text fallback is still reachable and this is the case that reaches it: skipping the cast
// step leaves nothing to pick from, which is the shape a book with no ledger has.
await go("You");
await wait(400);
ok("  You is a field you type into, offering the cast so far",
   (await page.eval("document.querySelector('[data-sp=\"persona\"]')?.tagName")) === 'INPUT');
// #84 · WHO YOU PLAY, BEFORE THE THREADS. Named here and held with one press, so the cast call below
// is told who you play and writes them from the outside.
await page.eval(`(() => { document.querySelector('[data-sp="persona"]').value = 'Ilva Marren'; return 1; })()`);
await page.click('[data-splock="1"]');
await wait(400);
ok("  and holding the one you play is one press",
   (await page.eval(`document.querySelector('[data-sp="lockedCharacter"]')?.value`)) === 'Ilva Marren');

/* CHARACTERS ONLY FROM HERE DOWN, and this is a fixture decision rather than a behaviour change.
 *
 * #40 turned every kind on by default (asserted above). The assertions below were written against a
 * character-only cast — the stub answers a 4-kind request with different cards, and the one-card
 * re-roll asserts the request names ONE kind — so the three other chips come off here. Deselecting
 * them tests the chips as well, and it keeps forty assertions saying what they were written to say
 * instead of being rewritten to match a fixture. */
await go("The threads");
for (const k of ['place', 'lore', 'item', 'rule']) {
  await page.click(`[data-spkind="${k}"]`);
  await wait(150);
}
ok("  the kind chips deselect, leaving characters alone",
   (await page.eval(`document.querySelectorAll('[data-spkind][aria-pressed="true"]').length`)) === 1);

// #21 §2 · THE CAST IS ITS OWN CALL. It autofills on the way in now (#40) and the button is still
// how you ask again — this is that second, explicit ask, and the first that the stub answers.
await page.click('[data-spwritecast="1"]');
await wait(600);
// The autofill on the way in was call one and the stub refused it; this is the button, and it is
// call two. "Its own call" is still the property — it is not folded into the scaffold — but it is no
// longer "only when asked", which #40 changed on purpose.
ok("  writing the threads is its own call, and the button asks again",
   (await page.eval("window.__cast")) === 2);
ok("  step 3 is the cast", (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 2);
ok("  and the cast call was told who you play, and who is Hands off",
   /"persona":"Ilva Marren"/.test(await page.eval("JSON.stringify((window.__castBody || {}).story || {})"))
   && /"lockedCharacter":"Ilva Marren"/.test(await page.eval("JSON.stringify((window.__castBody || {}).story || {})")));

// #28 · THE STEER REACHES THE CALL. Seth: "i should be able to reroll characters or direct it based
// on my input." A box the writer types into that never leaves the browser is the failure this
// asserts against, so the check is on the REQUEST BODY and not on the field's value.
/* #40, 2026-09-01 · WHAT YOU TICKED SURVIVES THE ASK. Seth: "the writer can state what they need
 * after choosing what stays or goes."
 *
 * THIS ASSERTION CHANGED MEANING and that is worth saying rather than burying. It used to prove the
 * steer reached the request while the whole list was REPLACED — the old contract, whose own comment
 * read "REPLACES rather than appends". Under the new one the ticked threads ride as `replacing` (the
 * argument the one-card re-roll has used since #28) and only the unticked are rewritten. Ticking was
 * pointless on the one press where it mattered most: you read two, kept one, asked again, lost both.
 *
 * The steer half is unchanged and still checked ON THE REQUEST BODY, because a box the writer types
 * into that never leaves the browser is the failure it was written against.
 */
{
  const before = await page.eval("window.__cast");
  // Drop the second and keep the first. Set through the DOM the way the other keep-checkbox
  // assertions in this file do — harvestSpark reads these on the way out.
  await page.eval(`(() => { document.querySelector('[data-spcast="1"]').checked = false; return 1; })()`);
  await page.eval(`(() => { const t = document.querySelector('[data-sp="castSteer"]');
    t.value = 'nobody over thirty, and one of them owes the sea'; return 1; })()`);
  await page.click('[data-spwritecast="1"]');
  await wait(700);
  const sent = await page.eval("JSON.stringify(window.__castBody || {})");
  ok(`  the steer typed on this step reaches the cast call (${sent.slice(0, 60)}…)`,
     (await page.eval("window.__cast")) === before + 1
     && /owes the sea/.test(sent));
  // THE KEPT ONE IS NAMED AS TAKEN, or the model hands back somebody already on screen.
  ok(`  and the one still ticked rides as taken, not as something to rewrite`,
     /"replacing":\["Ilva Marren"\]/.test(sent));
  const names = await page.eval(`(() => [...document.querySelectorAll('[data-spname]')]
    .map(n => n.value).join('|'))()`);
  ok(`  the ticked thread survived and the unticked one was replaced (${names})`,
     names === 'Ilva Marren|Ossian Rede');
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
  await go("You");
  await wait(400);
  ok("  and the one you play is untouched by it",
     (await page.eval(`document.querySelector('[data-sp="persona"]')?.value`)) === 'Ilva Marren');
  await go("The threads");
  await wait(400);
  /* PUT THE CAST BACK to the two the assertions below are written against — and under #40's rule
   * that means UNTICKING EVERYTHING FIRST. Ask-again keeps what is ticked, so pressing it with both
   * ticked would have added a third rather than replaced the pair. Unticking all of them is how you
   * ask for a genuinely different cast now, which is the same press it always was with one step in
   * front of it. */
  await page.eval(`(() => { for (const c of document.querySelectorAll('[data-spcast]')) c.checked = false;
    return 1; })()`);
  await page.click('[data-spwritecast="1"]');
  await wait(700);
  ok("  unticking everything and asking again is a different cast, not more of it",
     (await page.eval(`(() => [...document.querySelectorAll('[data-spname]')]
       .map(n => n.value).join('|'))()`)) === 'Ilva Marren|Kade Ashford');
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

// And once there IS a cast, You offers it: a second visit picks from the threads so far.
await go("You");
await wait(400);
ok("  and once there is one, You offers it",
   (await page.eval(`[...document.querySelectorAll('#f-sp-cast option')].map(o => o.value).join('|')`)) === 'Ilva Marren|Kade Ashford');

{
  const sparksBefore = await page.eval("window.__spark");

  // A KIND NOBODY PICKED IS NOT ASKED FOR. "No characters at this point" was unreachable while the
  // spark schema REQUIRED two of them.
  await go("The threads");
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
  await go("The tale");
  await wait(300);
  await page.click('[data-spreroll="1"]');
  await wait(700);
  ok("  the skeleton re-rolls from the same idea, as its own call",
     (await page.eval("window.__spark")) === sparksBefore + 1);
  await go("The threads");
  await wait(350);
  ok("  and the cast it was written for is still standing",
     (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 2);

  // The re-roll replaced the title, which is what it says it does. Put back the one the assertions
  // at the end of this file are about.
  await go("The tale");
  await wait(300);
  await page.eval(`(() => { const t = document.querySelector('[data-sp="title"]');
    t.value = 'The Drowned Ledger'; return 1; })()`);
}

// #21 §3 · STEP 5 · A SECOND LOOK, and it fires from a BUTTON. A model call nobody asked for is
// what made "what changed" slow, and #24 is the whole argument against it.
await go("Try it on");
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
await go("The tale");
await wait(400);
ok("  and the field it replaced carries the new words",
   (await page.eval("document.querySelector('[data-sp=\"title\"]')?.value")) === 'The Tide Clerk');
// Put the title back for the assertions at the end.
await page.eval(`(() => { const t = document.querySelector('[data-sp="title"]');
  t.value = 'The Drowned Ledger'; return 1; })()`);
await go("Try it on");
await wait(400);
await page.click('[data-spaddone="0"]');
await wait(400);
await go("The threads");
await wait(400);
ok("  and a thread she suggested joins the cast when you say so",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 3);
// Drop it again — the assertions at the end count what actually gets written.
await page.eval("(() => { document.querySelector('[data-spcast=\"2\"]').checked = false; return 1; })()");

// You offers only people still in the cast: offering somebody just dropped would invite a persona
// that names nobody.
await page.eval("(() => { document.querySelector('[data-spcast=\"1\"]').checked = false; return 1; })()");
await go("You");
await wait(400);
const offered = await page.eval(`(() => [...document.querySelectorAll('#f-sp-cast option')]
  .map(o => o.value).filter(Boolean).join('|'))()`);
ok(`  You offers only the cast you kept (${offered})`, offered === 'Ilva Marren');
ok("  and nobody stays available, because a story can be narrated from outside",
   /nobody/.test(await page.eval(`document.querySelector('[data-sp="persona"]')?.placeholder || ''`)));

// The cast is EDITABLE, and renaming somebody there has to carry what points at them. The cast call
// was told Ilva for both persona and locked character; renaming her must not leave You offering
// a name the cast no longer contains and silently falling back to Nobody.
await go("The threads");
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
await go("You");
await wait(400);
const afterRename = await page.eval(`(() => [...document.querySelectorAll('#f-sp-cast option')]
  .map(o => o.value).filter(Boolean).join('|'))()`);
ok(`  a rename on step 3 reaches step 4 (${afterRename})`, afterRename === 'Ilva Vane');
ok("  and the persona followed her rather than falling back to Nobody",
   (await page.eval(`document.querySelector('[data-sp="persona"]')?.value`)) === 'Ilva Vane');

// #21 §3 · BOTH DEFAULT TO THE ONE YOU PLAY, and the columns stay separate: a book with a second
// lead the writer does not speak as is a real shape, so it is a press rather than a rule.
await page.eval(`(() => { const l = document.querySelector('[data-sp="lockedCharacter"]');
  l.value = ''; l.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
await go("The threads");
await wait(300);
await go("You");
await wait(400);
ok("  the model-never-writes field can be cleared on its own",
   (await page.eval(`document.querySelector('[data-sp="lockedCharacter"]')?.value`)) === '');
await page.click('[data-splock="1"]');
await wait(400);
ok("  and one press puts the one you play back into it",
   (await page.eval(`document.querySelector('[data-sp="lockedCharacter"]')?.value`)) === 'Ilva Vane');

// #40 · THE TWO PICKERS MATCH THE STORY PANEL'S, which is the last item on that issue: "You are and
// never write in the screen after should be the same." Two of the three differences were wording;
// the third was a whole control. Hold-them-back shipped 2026-08-31 under Story and nowhere else, so
// a book set up here could not be told "lock her, but off for this scene" until after it existed.
ok("  naming somebody offers the Hold-them-back switch, the way Story does",
   (await page.eval(`!!document.querySelector('[data-sp="lockoutOn"]')`)) === true);
ok("  and it starts on, because holding them back is what naming them means",
   (await page.eval(`document.querySelector('[data-sp="lockoutOn"]')?.checked`)) === true);
// The panel's wording, from the panel's own constants. Read off the page rather than from the
// source: two separately typed copies is the defect, so what matters is what a writer sees.
{
  const you = await page.eval("document.querySelector('#page')?.innerText || ''");
  ok("  the blank option is worded as the panel words it",
     /it may write anyone/.test(you) && !/it may write everyone/.test(you));
  ok("  and the hint says what holding her back actually stops, in all three states",
     /nothing about what Ilva Vane feels or knows/.test(you));
  ok("  and says why it is a separate setting from You are",
     /A separate setting from/.test(you));
}
// CLEARING THE NAME TAKES THE SWITCH WITH IT: there is nothing to hold back, and a switch for
// nobody is a control that reads as broken. Off the step and back on, because a `data-sp` change
// does not repaint the wizard — the block above clears the same field the same way for the same
// reason, and `harvestSpark` is what carries the value across the move.
await page.eval(`(() => { const l = document.querySelector('[data-sp="lockedCharacter"]');
  l.value = ''; l.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
await go("The threads");
await wait(300);
await go("You");
await wait(400);
ok("  and clearing the name takes the switch away with it",
   (await page.eval(`!!document.querySelector('[data-sp="lockoutOn"]')`)) === false);
await page.click('[data-splock="1"]');
await wait(400);

// TURNED OFF HERE, AND IT HAS TO SURVIVE ACCEPT. Two ways this fails silently and both are real:
// every other `data-sp` control is a text box or a select, so reading `el.value` off a checkbox
// gives the string "on" and the switch is permanently ON; and `createStory`'s INSERT did not list
// `lockout_on`, whose column default is 1 — the right answer for a new book, and therefore the
// perfect hiding place for a dropped field. The assertion is on the created book, not on the box.
// TOLERATES A MISSING BOX ON PURPOSE. Dereferencing it killed the scenario when the switch was
// removed to check that its own assertion fires — and a dead scenario hides every assertion after
// it, which is the false green run.sh's own notes are about. It reports rather than throwing.
const unticked = await page.eval(`(() => { const b = document.querySelector('[data-sp="lockoutOn"]');
  if (!b) return false;
  b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
ok("  and the switch can be turned off before the book exists", unticked === true);
await wait(300);

// #84 · THE PREVIEW: everything that will be made, on one page, and nothing made yet.
await go("The preview");
await wait(500);
{
  const pv = await page.eval("document.querySelector('#page')?.innerText || ''");
  ok("  the preview opens on the tale's own thread", /The tale's own thread/.test(pv));
  ok("  and lists the threads you kept, folded to their name",
     /Ilva Vane/.test(pv) && (await page.eval("document.querySelectorAll('[data-spfold]').length")) >= 1);
  const none = await page.eval(`(async () => { const r = await (await fetch('/api/stories')).json();
    return r.stories.filter(x => x.title === 'The Drowned Ledger').length; })()`);
  ok(`  and nothing has been created yet (${none})`, none === 0);
}

// #21 §3 · STEP 8 SAYS WHAT ACCEPTING WILL WRITE, before it is pressed.
await go("Begin");
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
           entries: v.entries.length, pov: v.story.pov, lockoutOn: v.story.lockoutOn,
           names: v.entries.map(e => e.title).sort().join('|') }; })()`);
ok(`accepting from step 2 creates the story with every step's answers (${JSON.stringify(made)})`, !!made);
if (made) {
  ok("  the title edited on step 1 is the one that was saved", made.title === 'The Drowned Ledger');
  // Two: the one character kept from the cast, and the rule picked out of the library. The blank
  // row started with + and abandoned is dropped, and so is the unticked one.
  ok(`  the kept cast and the picked thread were written, and nothing else (${made.names})`,
     made.entries === 2 && made.names === 'Ilva Vane|Vantic law');
  ok("  the persona survived the rename", made.persona === 'Ilva Vane');
  // The writer chose Ilva for both on You, and nothing drops a name the writer chose.
  ok("  and the locked character with it", made.locked === 'Ilva Vane');
  // #40. Switched off on step 4 and it stayed off. False, not undefined and not true: the column
  // defaults to 1, so `true` here is exactly what a dropped field looks like.
  ok(`  and Hold-them-back was switched off in the wizard and stayed off (${made.lockoutOn})`,
     made.lockoutOn === false);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
