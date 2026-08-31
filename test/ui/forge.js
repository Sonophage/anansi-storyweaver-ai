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
ok("the forge has a row in the rail", await page.eval("!!document.querySelector('[data-nav=\"forge\"]')"));
await page.click('[data-nav="forge"]');
await wait(800);
const page1 = (await page.text('#page') || '');
ok("  and opens on the five prompts",
   ['A character', 'A place', 'A premise', 'The voice', 'A cover image'].every((t) => page1.includes(t)));
ok("  each with a copy button",
   (await page.eval("document.querySelectorAll('[data-forgecopy]').length")) === 5);

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
   ['facts', 'role', 'appearance', 'outfit', 'interiority', 'relationships', 'voice', 'history']
     .every((r) => opened.includes('"' + r + '"')));
ok("  and not a place's",
   !opened.includes('"atmosphere"') && !opened.includes('"who_is_here"'));
ok("  and carrying the app's own card register",
   /A ledger body is NOTES, not prose/.test(opened));

// ---- 2. a forged thread, pasted into + Thread ----
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.goto(B + "/#" + sid + "/threads");
for (let i = 0; i < 40 && !(await page.visible('[data-newlore="1"]')); i++) await wait(250);
await page.click('[data-newlore="1"]');
await wait(400);
await page.click('[data-lorekind="character"]');
await wait(400);
ok("+ Thread offers a paste box", await page.eval("!!document.querySelector('[data-pastebox]')"));

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
await page.eval(`(() => { document.querySelector('[data-pastebox]').value = ${JSON.stringify(CARD)}; return 1; })()`);
await page.click('[data-pastethread="1"]');
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
   /thread/.test(toast) && /room/.test(toast));

// ---- 3. what it refuses, from the surface ----
await page.goto(B + "/#" + sid + "/threads");
for (let i = 0; i < 40 && !(await page.visible('[data-newlore="1"]')); i++) await wait(250);
await page.click('[data-newlore="1"]');
await wait(400);
await page.click('[data-lorekind="character"]');
await wait(400);
const beforeN = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).entries.length)()`);
await page.eval("(() => { document.querySelector('[data-pastebox]').value = 'Certainly! Here is your character:'; return 1; })()");
await page.click('[data-pastethread="1"]');
await wait(1200);
const afterN = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).entries.length)()`);
ok(`prose in the box is refused and writes nothing (${beforeN} -> ${afterN})`, beforeN === afterN);
ok("  and says so rather than failing quietly",
   /not JSON/.test((await page.text('#toast') || '')));

console.log(red ? `\n  ${red} RED` : "\n  all green");
