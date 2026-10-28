// needs: fake-router
// Talk on a setup step (#100): the same Talk window, on the new tale's draft, through the real
// POST /api/spark/talk and the fake router. Asked to change the premise, the box on the step shows
// it at once, and Undo puts it back. A question gets an answer and an offer, and Add puts the offer
// in the draft. Discard leaves no tale behind.
//
//   bash test/ui/run.sh setuptalk
//
// Only the skeleton is stubbed in the page (POST /api/spark, as wizard.js does), so the wizard has a
// draft to talk about without a model writing one. Talk itself goes to the server.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 60, ms = 100) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};
const tales = () => page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.length)()");

await page.goto(B + "/");
await wait(700);
const before = await tales();
await page.eval(`(() => {
  window.__talks = 0;
  const real = window.fetch;
  window.fetch = (u, o) => {
    const url = String(u);
    if (url.includes('/api/spark/talk')) window.__talks++;
    if (url.endsWith('/api/spark')) return Promise.resolve(new Response(JSON.stringify({
      story: { title: 'The Salt Ledger', genre: 'noir', premise: 'A tide-clerk counts what the sea returns.',
               setting: 'Fallow Quay', pov: 'third limited, past tense', spice: 2,
               writingStyle: 'Clipped and wet.', persona: null, lockedCharacter: null },
      entries: [] }), { headers: { 'Content-Type': 'application/json' } }));
    return real(u, o);
  };
  return 1; })()`);

await page.click('[data-open="new"]');
await wait(500);
await page.type('#idea', 'a tide-clerk who counts what the sea gives back');
await page.click('[data-spark="1"]');
ok("the wizard is up", await until("!!document.querySelector('[data-sp=\"premise\"]')"));

ok("the setup step has a Talk press", await page.eval("!!document.querySelector('#page [data-panel=\"anansi\"]')"));
await page.click('#page [data-panel="anansi"]');
ok("Talk opens beside the step, the same window a tale has",
   await until("!!document.getElementById('askBox')?.offsetParent && !document.getElementById('side').hidden"));
ok("  and Anansi has said nothing", (await page.eval("window.__talks")) === 0);

const ask = async (said) => {
  const n = await page.eval("window.__talks");
  await page.type('#askBox', said);
  await page.click('[data-ask="1"]');
  await until(`window.__talks > ${n} && !document.querySelector('[data-ask="1"]')?.disabled`, 80);
  await wait(300);
};

// Asked: the premise on the step changes at once, and the change has an Undo.
await ask('Make the premise darker');
ok("asked to change the premise, the box on the step shows it at once",
   await until("document.querySelector('[data-sp=\"premise\"]')?.value === 'The fake router made this premise darker.'"));
ok("  and the change is a line in the conversation, with Undo",
   await page.eval("/Changed the premise/.test(document.getElementById('sideBody').textContent) && !!document.querySelector('#sideBody [data-talkundo]')"));
await page.click('#sideBody [data-talkundo]');
ok("Undo puts the premise back exactly",
   await until("document.querySelector('[data-sp=\"premise\"]')?.value === 'A tide-clerk counts what the sea returns.'"));

// A question: an answer, and an offer with Add.
await ask('Who keeps the harbour?');
ok("a question gets an answer", await page.eval("/the harbour needs a keeper/.test(document.getElementById('sideBody').textContent)"));
ok("  and an offer with Add", await page.eval("!!document.querySelector('#sideBody [data-talkadd]')"));
await page.click('#sideBody [data-talkadd]');
await wait(300);
const n = await page.eval(`(() => { const b = [...document.querySelectorAll('[data-sparkstep][aria-label]')]
  .find((e) => e.getAttribute('aria-label') === 'The threads'); return b ? b.dataset.sparkstep : null; })()`);
await page.click(`[data-sparkstep="${n}"]`);
ok("Add puts the offer in the draft, on the threads step",
   await until("[...document.querySelectorAll('[data-spname]')].some((e) => e.value === 'The Harbour Keeper')"));

// Discard: nothing was saved, and nothing is.
await page.click('[data-drop-spark="1"]');
await wait(500);
ok("Discard shuts Talk with the draft", await page.eval("document.getElementById('side').hidden"));
ok(`  and leaves no tale behind (${before} tales before, ${await tales()} after)`, (await tales()) === before);

console.log(red ? `\n  ${red} RED` : "\n  all green");
