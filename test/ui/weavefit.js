// needs: fake-router
// When weaving does not fit (#56): a long book under a small context cap, where the 5,000 tokens the
// plan is given would push its oldest prose out of the prompt. The press is refused with a row on the
// composer, and each of its two buttons sends the press again. Runs against the fake local router,
// which plans for a few seconds before its prose when a call is sent weaving on (test/ui/router.ts).
//
//   test/ui/run.sh weavefit
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 40, ms = 250) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};
const post = (url, body) => page.eval(`(async () => JSON.stringify(await (await fetch(${JSON.stringify(url)},
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} })).json()))()`)
  .then(JSON.parse);

// ---- the book: forty passages under a 10,500-token cap, weaving on. At that cap the normal reserve
// holds every passage, and the weaving one cannot.
// The cap was 9,000 until 2026-11-09. By then the fixed part of the prompt had grown enough that a
// weaving prompt did not fit at 9,000 at all: the refusal became the overflow one, which has no Write
// anyway, and this scenario died on the press. Measured that day: 10,000 and 11,000 both give the
// case below, and 12,000 weaves without a refusal. 10,500 is the middle of that range.
await page.goto(B + "/");
const made = await post("/api/stories", { title: "The Long Weave", premise: "A city on a dead god." });
const sid = made.id;
for (let i = 1; i <= 40; i++)
  await post("/api/write", { storyId: sid, body: `Passage ${i}. ` + "The lower tiers pulse under the rain, and the Murmur keeps her counsel. ".repeat(4) });
await post("/api/story", { id: sid, story: { maxContext: 10500, weaving: true } });
const book = () => page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
  return JSON.stringify({ weaves: v.weaves, human: v.passages.filter((p) => p.author === 'human').length,
    model: v.passages.filter((p) => p.author === 'model').length }); })()`).then(JSON.parse);
const start = await book();
ok(`the book weaves, with ${start.human} passages of its writer's`, start.weaves === true && start.human === 40);

const send = async (text) => {
  await page.eval(`(() => { const i = document.getElementById('input');
    i.value = ${JSON.stringify(text)}; return 1; })()`);
  await page.eval("(() => { document.getElementById('send').click(); return 1; })()");
};
const row = () => page.eval("document.getElementById('weavefit')?.textContent ?? ''");

// ---- 1. refused, with the row on the composer
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('send')");
await send("Hold the door.");
ok("the press is refused with a row on the composer", await until("!!document.getElementById('weavefit')", 40, 100));
const said = await row();
ok(`  naming what would drop out (${said.trim().slice(0, 120)}…)`, /oldest passages still in view/.test(said));
ok("  with Write anyway and Turn weaving off",
  await page.eval("!!document.querySelector('#weavefit [data-weaveanyway]') && !!document.querySelector('#weavefit [data-weaveoff]')"));
ok("  and the veil is down", await until("!document.getElementById('ghost') || document.getElementById('ghost').classList.contains('leaving')", 20));
const refused = await book();
ok(`  your line is on the page and the model wrote nothing (${refused.human}, ${refused.model})`,
  refused.human === 41 && refused.model === 0);

// ---- 2. Write anyway: the same press, weaving, and the row goes
// The veil takes a moment to leave, and while it does it still covers the composer.
await until("!document.getElementById('ghost')", 20);
await page.click("#weavefit [data-weaveanyway]");
ok("write anyway plans", await until(`/^Planning/.test(document.querySelector('#ghost .veilweave')?.textContent ?? '')`, 40, 100));
ok("  and the row is gone", await page.eval("!document.getElementById('weavefit')"));
ok("  the prose arrives", await until(`(document.querySelector('#ghost .veiltext')?.textContent ?? '').length > 0`, 60, 200));
await until("!document.getElementById('send')?.disabled", 40);
const anyway = await book();
ok(`  one passage by the model, and your line written once (${anyway.human}, ${anyway.model})`,
  anyway.human === 41 && anyway.model === 1);
await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
await until("!document.getElementById('ghost')");

// ---- 3. Turn weaving off: the switch flips, and the same press writes without weaving
await send("Let it close.");
ok("refused again", await until("!!document.getElementById('weavefit')", 40, 100));
await until("!document.getElementById('ghost')", 20);
await page.click("#weavefit [data-weaveoff]");
for (let i = 0; i < 20 && (await book()).weaves; i++) await wait(250);
ok("turn weaving off turns it off for this book, as the server tells it", (await book()).weaves === false);
await until("!!document.getElementById('ghost')", 40, 50);
ok("  and writes without weaving", !(await page.eval("document.querySelector('#ghost .veilweave')?.textContent ?? ''")));
await until("!document.getElementById('send')?.disabled", 40);
for (let i = 0; i < 20 && (await book()).model < 2; i++) await wait(250);
const off = await book();
ok(`  one more passage by the model, your line once (${off.human}, ${off.model})`, off.human === 42 && off.model === 2);
ok("  and no row", await page.eval("!document.getElementById('weavefit')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
