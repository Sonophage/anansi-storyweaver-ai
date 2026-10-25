// needs: fake-router
// Weaving (#55): the book's switch in the Storyteller panel, and the wait it buys. Runs against the
// fake local router, which plans for a few seconds before its prose whenever a call is sent weaving
// on (test/ui/router.ts), so the count, the first word and Stop can all be watched in a browser.
//
//   test/ui/run.sh weave
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 40, ms = 250) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const book = () => page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
  return JSON.stringify({ weaving: v.story.weaving, weaves: v.weaves }); })()`).then(JSON.parse);
/** What the veil and the composer say about weaving, read as the browser has them. */
const words = () => page.eval(`JSON.stringify({
  veil: document.querySelector('#ghost .veilweave')?.textContent ?? null,
  shown: (() => { const w = document.querySelector('#ghost .veilweave');
    return !!w && getComputedStyle(w).display !== 'none'; })(),
  prose: document.querySelector('#ghost .veiltext')?.textContent ?? '',
  dock: document.getElementById('weaving')?.textContent ?? null,
  ghost: !!document.getElementById('ghost') && !document.getElementById('ghost').classList.contains('leaving') })`)
  .then(JSON.parse);
const send = async (text) => {
  await page.eval(`(() => { const i = document.getElementById('input');
    i.value = ${JSON.stringify(text)}; return 1; })()`);
  await page.eval("(() => { document.getElementById('send').click(); return 1; })()");
};
const COUNT = /^Planning\u2026 \d+s$/;

// ---- 1. the switch, where the note was
await page.goto(B + "/#" + sid + "/teller");
ok("the Storyteller draws the weaving switch", await until("!!document.querySelector('[data-story=\"weaving\"]')"));
const panel = await page.text("#sideBody") ?? "";
ok("and the thinking note is gone", !/Thinking is off/i.test(panel));
ok("the book starts with weaving off", (await book()).weaving === false
  && await page.eval("document.querySelector('[data-story=\"weaving\"]').checked === false"));
await page.click('[data-story="weaving"]');
for (let i = 0; i < 20 && !(await book()).weaves; i++) await wait(250);
ok("pressing it turns weaving on for this book, as the server tells it", (await book()).weaves === true);
ok("and the switch stays on after the panel redraws",
  await until("document.querySelector('[data-story=\"weaving\"]')?.checked === true"));

// ---- 2. "Weaving…" with a running count on the veil, until the first word
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('send')");
await send("She reaches the door.");
ok("the veil goes up saying Planning", await until(`(document.querySelector('#ghost .veilweave')?.textContent ?? '').startsWith('Planning')`, 40, 100));
let w = await words();
ok(`  with a count (${w.veil})`, COUNT.test(w.veil ?? "") && w.shown);
ok("  and no prose yet", w.prose === "");
const counts = new Set();
for (let i = 0; i < 40; i++) {
  w = await words();
  if (w.prose) break;
  if (w.veil) counts.add(w.veil);
  await wait(200);
}
ok(`the count runs while it weaves (${[...counts].join(", ")})`, counts.size >= 2);
ok("the prose arrives", await until(`(document.querySelector('#ghost .veiltext')?.textContent ?? '').length > 0`, 40, 200));
w = await words();
ok(`  and Planning is gone from the veil once it does (${JSON.stringify(w.veil)})`, w.veil === "" && !w.shown);
await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
await until("!document.getElementById('ghost')");
await until("!document.getElementById('send')?.disabled", 40);

// ---- 3. Stop, in the middle of the weaving
const before = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.filter((p) => p.author === 'model').length)()`);
await send("He does not answer.");
ok("a second passage starts weaving", await until(`/^Planning/.test(document.querySelector('#ghost .veilweave')?.textContent ?? '')`, 40, 100));
await wait(600);
await page.click("#ghost .veilstop");
ok("Stop takes the veil down while it weaves", await until("!document.getElementById('ghost') || document.getElementById('ghost').classList.contains('leaving')", 20));
w = await words();
ok(`  and the count stops (${JSON.stringify(w.dock)})`, !w.dock);
ok("  and the composer is usable again", await until("!document.getElementById('send')?.disabled && !!document.querySelector('#send[data-send]')", 20));
await wait(5000);   // past the fake's plan, so a call Stop did not end would have landed by now
const after = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.filter((p) => p.author === 'model').length)()`);
ok(`  and the model wrote nothing (${before} → ${after} of its passages)`, after === before);

// ---- 4. the composer, for a writer who leaves the veil while it weaves
await send("The lamp goes out.");
await until(`/^Planning/.test(document.querySelector('#ghost .veilweave')?.textContent ?? '')`, 40, 100);
await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
ok("leaving the veil shows the count beside the composer",
  await until(`/^Planning\u2026 \\d+s$/.test(document.getElementById('weaving')?.textContent ?? '')`, 20, 100));
ok("  where Stop is, too", await page.eval("!!document.querySelector('#send[data-stop]')"));
ok("  and it goes at the first word", await until(`!(document.getElementById('weaving')?.textContent)`, 40, 250));
await until("!document.getElementById('send')?.disabled", 40);

// ---- 5. a book that does not weave says nothing of the kind
await page.goto(B + "/#" + sid + "/teller");
await until("document.querySelector('[data-story=\"weaving\"]')?.checked === true");
await page.click('[data-story="weaving"]');
for (let i = 0; i < 20 && (await book()).weaves; i++) await wait(250);
ok("pressing it again turns weaving off", (await book()).weaves === false);
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('send')");
await send("Morning comes.");
await until("!!document.getElementById('ghost')", 40, 50);
w = await words();
ok(`a book that does not weave never says Weaving (${JSON.stringify(w)})`, !w.veil && !w.shown && !w.dock);

console.log(red ? `\n  ${red} RED` : "\n  all green");
