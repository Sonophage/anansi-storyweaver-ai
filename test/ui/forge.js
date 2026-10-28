// The forge, driven in a real browser: the admin's page, and the paste back into + Thread.
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/forge.js
//
// NO MODEL. Nothing on this page calls one — the prompts are static text built from src/slots.ts,
// and the paste is a parser — so this belongs in the default set rather than beside `model`.
//
// The server runs as the desk, which is the admin, so the admin half is what a browser can drive
// here. The REFUSAL is asserted in test/forge.ts from the far side, with a second owner, because a
// second identity is a thing this harness cannot make.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++;
  console.log("  " + (g ? "ok  " : "FAIL") + " " + l + (g ? "" : "   <-- broken")); };

await page.goto(B + "/");
await wait(700);

// ---- 1. the rail carries it, for this account ----
await page.click('[data-nav="account"]'); await wait(600); await page.click('[data-accttab="books"]'); await wait(300);  // Account → Your books since 2026-10-27
ok("Export has a door in Account → Your books", await page.eval("!!document.querySelector('[data-nav=\"forge\"]')"));
await page.click('[data-nav="forge"]');
await wait(800);
const page1 = (await page.text('#page') || '');
ok("  and opens on the six prompts",
   ['A whole tale', 'A character', 'A place', 'A premise', 'The voice', 'A cover image']
     .every((t) => page1.includes(t)));
ok("  each with a copy button",
   (await page.eval("document.querySelectorAll('[data-forgecopy]').length")) === 6);

// A PROMPT IS CLOSED UNTIL ASKED FOR. Five of these rendered flat is a wall nobody reads.
ok("  and the text itself is behind a press",
   (await page.eval("document.querySelectorAll('#page pre').length")) === 0);
await page.click('[data-forgeopen="character"]');
await wait(400);
const opened = await page.eval("document.querySelector('#page pre')?.textContent || ''");
ok(`  reading one shows it (${opened.length} chars)`, opened.length > 400);

// THE ROOMS COME FROM THE DATABASE'S OWN SLOT TABLE. This is the assertion that the page is not
// reciting a list somebody typed into the client — src/slots.ts is the authority and the prompt is
// built from it, so a character's rooms are named and a place's are not.
ok("  naming this database's character rooms",
   ['facts', 'appearance', 'outfit', 'interiority', 'relationships', 'voice']
     .every((r) => opened.includes('"' + r + '"')));
// #77. Role and history are not pockets any more: they fold into Always true and Over time.
ok("  and not the ones that folded away",
   !opened.includes('"role"') && !opened.includes('"history"'));
ok("  and not a place's",
   !opened.includes('"atmosphere"') && !opened.includes('"who_is_here"'));
ok("  and carrying the app's own card register",
   /A ledger body is NOTES, not prose/.test(opened));

// ---- 2. a forged thread, pasted into New thread's box ----
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.goto(B + "/#" + sid + "/threads");
// SCOPED TO #sideHead: the composer's threads dial carries a data-newlore OPTION since 2026-09-02,
// and an option has no box — so the unscoped selector found that one and waited on it for ever.
// The list's door is the + in the drawer's header since the v2 redesign (2026-10-25).
for (let i = 0; i < 40 && !(await page.visible('#sideHead [data-newlore="1"]')); i++) await wait(250);
await page.click('#sideHead [data-newlore="1"]');
await wait(400);
await page.click('[data-lorekind="character"]');
await wait(400);
ok("New thread's one box takes a paste", await page.eval("!!document.getElementById('newname')"));

const CARD = JSON.stringify({
  kind: 'character', title: 'Ossian Rede',
  body: '[Ossian Rede: harbour-master; owes nobody; keeps the tide book himself]',
  keys: ['Ossian', 'the harbour-master'], activation: 'triggered',
  rooms: {
    facts: { name: 'What is always true', body: '[fifty; harbour-master since the flood; deaf in one ear]' },
    voice: { name: 'How he sounds', body: '[says the tide before he says hello; never finishes a sentence about the weather]' },
    atmosphere: { name: 'Not his room', body: '[a character has no atmosphere]' },
  },
});
await page.eval(`(() => { document.getElementById('newname').value = ${JSON.stringify(CARD)}; return 1; })()`);
await page.click('[data-newthread]');
await wait(1600);

const after = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
  const e = v.entries.find(x => x.title === 'Ossian Rede');
  if (!e) return null;
  // Rooms hang on the ENTRY in the view, not at the top level — src/story.ts builds them there.
  return { activation: e.activation, keys: (e.keys || []).join('|'), body: e.body,
           rooms: (e.addons || []).map(r => r.slot).sort().join('|'),
           named: (e.addons || []).map(r => r.name).join('|') }; })()`);
ok(`the pasted card is in the ledger (${JSON.stringify(after)})`, !!after);
if (after) {
  ok("  with the activation and trigger words it declared",
     after.activation === 'triggered' && /Ossian/.test(after.keys));
  // THE ROOMS ARE THE POINT. No other import path in this app fills them, which is the whole
  // reason the format exists rather than reusing a character card.
  ok(`  and its rooms, which no other import writes (${after.rooms})`,
     after.rooms === 'facts|voice');
  ok(`  each keeping the name it was given (${after.named})`,
     /What is always true/.test(after.named) && /How he sounds/.test(after.named));
  // And the room a character does not have was dropped rather than filed under a real one.
  ok("  while a room that kind has no business with was left out",
     !after.rooms.includes('atmosphere'));
}
// The toast says what happened, including what did not come through.
const toast = (await page.text('#toast') || '').trim();
ok(`  and the toast says what landed (${JSON.stringify(toast.slice(0, 70))})`,
   /thread/.test(toast) && /pocket/.test(toast));

// ---- 3. what it refuses, from the surface ----
await page.goto(B + "/#" + sid + "/threads");
// SCOPED TO #sideHead: the composer's threads dial carries a data-newlore OPTION since 2026-09-02,
// and an option has no box — so the unscoped selector found that one and waited on it for ever.
// The list's door is the + in the drawer's header since the v2 redesign (2026-10-25).
for (let i = 0; i < 40 && !(await page.visible('#sideHead [data-newlore="1"]')); i++) await wait(250);
await page.click('#sideHead [data-newlore="1"]');
await wait(400);
await page.click('[data-lorekind="character"]');
await wait(400);
const beforeN = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).entries.length)()`);
// A model's answer with no JSON in it, two lines of prose: the second line makes it a paste, not a
// name, and the reader refuses it.
await page.eval("(() => { document.getElementById('newname').value = 'Certainly! Here is your character:\\nHe is a harbour-master.'; return 1; })()");
await page.click('[data-newthread]');
await wait(1200);
const afterN = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).entries.length)()`);
ok(`prose in the box is refused and writes nothing (${beforeN} -> ${afterN})`, beforeN === afterN);
ok("  and says so rather than failing quietly",
   /not JSON/.test((await page.text('#toast') || '')));

// ---- 4. the wizard: a copy button where the step wants it, and both pastes ----
//
// #30. Seth: "add the copy button and the import buttons where it makes the most sense ... and
// maybe one more copy button and field ... set a story and characters and everything from one
// command." Three surfaces, and the whole-book one is the reason the other two are worth having.
await page.goto(B + "/");
await wait(600);
await page.click('[data-open="new"]');
await wait(700);

// BEHIND A DOOR SINCE 2026-08-31. Seth: "the paste as json needs to be hidden under a toggle or a
// button that opens that option." This scenario went on reaching straight for the box, so
// querySelector returned null, the next line threw inside the page, and the whole scenario DIED
// after 17 ok — taking its remaining assertions with it and reporting no red at all. The door is
// asserted separately from what is behind it, so "the door is gone" and "the box is gone" cannot
// look like the same failure.
ok("the create page offers a door to forge a whole book elsewhere",
   (await page.eval("!!document.querySelector('[data-forgehere]')")) === true);
// BOTH halves are behind it — the prompt to copy and the box to paste back into — so both are
// asserted absent first. Absence on its own is the assertion that passes for the wrong reason:
// a create page that failed to render at all would satisfy it, which is why the door above and
// the two below bracket it.
ok("  and neither the prompt nor the box is on screen until it is pressed",
   (await page.eval("!!document.querySelector('[data-bookpaste]')")) === false
   && (await page.eval("!!document.querySelector('[data-forgecopy=\"book\"]')")) === false);
await page.click('[data-forgehere]');
await wait(400);
const boxThere = await page.eval("!!document.querySelector('[data-bookpaste]')");
ok("  pressing it opens the whole-book prompt and the box together", boxThere === true
   && (await page.eval("!!document.querySelector('[data-forgecopy=\"book\"]')")) === true);

const BOOK = JSON.stringify({
  story: {
    title: 'The Drowned Ledger', genre: 'noir, gothic',
    premise: 'A tide-clerk counts what the sea returns, and one return is a body already marked paid.',
    setting: 'Fallow Quay', pov: 'third limited, past tense', spice: 2,
    persona: 'Sella Vane', lockedCharacter: 'Sella Vane',
    writingStyle: 'Write the narration in past tense: she came up the stair.',
    styleNote: 'Scenes open in the middle. Money is counted on the page.',
  },
  entries: [
    { kind: 'character', title: 'Sella Vane', body: '[Sella Vane: tide-clerk; cannot swim]',
      keys: ['Sella'], activation: 'always_on',
      rooms: { facts: { name: 'What is always true', body: '[twenty-nine; left-handed]' },
               atmosphere: { name: 'Not her room', body: '[a person has no atmosphere]' } } },
    { kind: 'lore', title: 'the Ambersand', body: '[the Ambersand: counting-house on the north bank]',
      keys: ['Ambersand'], activation: 'triggered' },
  ],
});
// Guarded, and the guard is asserted. An unguarded `.value =` on a null is what killed this
// scenario, and a scenario that dies is scored as the assertions it reached rather than as a
// failure — the most expensive shape of green there is.
const pasted = await page.eval(`(() => { const b = document.querySelector('[data-bookpaste]');
  if (!b) return false; b.value = ${JSON.stringify(BOOK)}; return true; })()`);
ok("  the book JSON goes into the box", pasted === true);
await page.click('[data-pastebook="1"]');
await wait(900);

/* GO TO A WIZARD STEP BY NAME, not by index. #40 reordered the wizard on 2026-09-01 and this file
 * clicked `data-sparkstep="3"` expecting the cast — which became "A second look", so the paste box
 * was not on screen and the scenario DIED at a page.eval against null.
 *
 * wizard.js got this helper in the same change and this file was missed, because the grep that found
 * the index clicks was scoped to wizard.js instead of test/ui. The full eighteen-scenario pass is
 * what caught it. The dots carry aria-label from the step title; Back and Next carry data-sparkstep
 * too and no label, which is why the selector is narrowed.
 */
const goStep = async (title) => {
  const n = await page.eval(`(() => { const b = [...document.querySelectorAll('[data-sparkstep][aria-label]')]
    .find(e => (e.getAttribute('aria-label') || '') === ${JSON.stringify(title)});
    return b ? b.dataset.sparkstep : null; })()`);
  if (!n) {
    const have = await page.eval(`JSON.stringify([...document.querySelectorAll('[data-sparkstep][aria-label]')]
      .map(e => e.getAttribute('aria-label')))`);
    throw new Error(`no wizard step called ${JSON.stringify(title)} — the steps are ${have}`);
  }
  await page.click(`[data-sparkstep="${n}"]`);
  await wait(450);
};

// IT FILLS THE WIZARD, IT DOES NOT CREATE THE BOOK. Every other thing a model writes in this app is
// read before it is kept, and a whole book is the largest of them.
ok("pasting a book opens the wizard rather than creating anything",
   (await page.eval("!!document.querySelector('[data-sparkstep]')")) === true);
const libNow = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.filter(s=>s.title==='The Drowned Ledger').length)()");
ok(`  and nothing is in the library yet (${libNow})`, libNow === 0);
ok("  with the story fields filled from the paste",
   (await page.eval("document.querySelector('[data-sp=\"title\"]')?.value")) === 'The Drowned Ledger'
   && /past tense/.test(await page.eval("document.querySelector('[data-sp=\"writingStyle\"]')?.value") || ''));

await goStep("The threads");
ok("  and the threads on the threads step",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 2);
ok("  which also offers the card prompts and a paste of its own",
   (await page.eval("!!document.querySelector('[data-forgecopy=\"character\"]')")) === true
   && (await page.eval("!!document.querySelector('[data-castpaste]')")) === true);

// A card pasted into the CAST step joins the list rather than being written.
await page.eval(`(() => { document.querySelector('[data-castpaste]').value = ${JSON.stringify(
  JSON.stringify({ kind: 'item', title: 'the Tide Book', body: '[the Tide Book: every return, in one hand]',
                   rooms: { what_it_does: '[lists what the sea gave back, and when]' } }))}; return 1; })()`);
await page.click('[data-pastecast="1"]');
await wait(700);
ok("  a card pasted into the cast joins it",
   (await page.eval("document.querySelectorAll('[data-spcast]').length")) === 3);

await goStep("You");
ok("  and the persona came over as a pick off that cast",
   (await page.eval(`document.querySelector('[data-sp="persona"]')?.value`)) === 'Sella Vane');

// ACCEPT, and the rooms have to survive it — this is the half the wizard could not do before.
await page.click('[data-accept-spark]');
await wait(2600);
const book = await page.eval(`(async () => { const r = await (await fetch('/api/stories')).json();
  const s = r.stories.find(x => x.title === 'The Drowned Ledger');
  if (!s) return null;
  const v = await (await fetch('/api/story?story=' + s.id)).json();
  const sella = v.entries.find(e => e.title === 'Sella Vane');
  const tide = v.entries.find(e => e.title === 'the Tide Book');
  return { entries: v.entries.length, persona: v.story.persona,
           sellaRooms: (sella?.addons || []).map(a => a.slot).sort().join('|'),
           tideRooms: (tide?.addons || []).map(a => a.slot).sort().join('|') }; })()`);
ok(`accepting writes the book, its cast and their rooms (${JSON.stringify(book)})`, !!book);
if (book) {
  ok("  all three cards", book.entries === 3);
  ok(`  the pasted rooms survived Accept (${book.sellaRooms})`, book.sellaRooms === 'facts');
  /* BOTH ROOMS, since #39 on 2026-09-01. This read `=== 'what_it_does'` and now expects facts
   * beside it: story creation moves a new card's DESCRIPTION into the evergreen facts room, because
   * the chapter-end pass rewrites the body and has never been able to touch a room.
   *
   * So this assertion is stronger than it was, not weaker — it proves the pasted room survived
   * Accept AND that the body landed in facts without overwriting what the paste carried. Caught by
   * the full eighteen-scenario pass; scope.ts covers the route directly and could not see it. */
  ok(`  including one pasted at the cast step, beside its facts (${book.tideRooms})`,
     book.tideRooms === 'facts|what_it_does');
  // A character has no `atmosphere`. It was dropped rather than filed under a real room.
  ok("  and a room that kind has no business with was left out",
     !book.sellaRooms.includes('atmosphere'));
  // The persona was the writer's, so nothing drops it.
  ok("  and a pasted persona was not policed away", book.persona === 'Sella Vane');
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
