// needs: fake-router
// Writing inline: the passage streams into the page, and the full-screen veil stays retired.
//
//   bash test/ui/run.sh inline
//
// Seth, 2026-10-25: "lets get rid of that transition and just do it inline. its pretty eye candy
// but lets retire it in a way where i can bring it back if no one likes the change." The veil is
// kept behind `anansi.veil` (test/ui/weave.js switches it on and tests it); this is the default.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 60, ms = 100) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
const models = () => page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.filter((p) => p.author === 'model').length)()`);
const send = async (text) => {
  await page.eval(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(text)};
    i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await page.eval("(() => { document.getElementById('send').click(); return 1; })()");
};

await page.goto(B + "/#" + sid);
await until("!!document.getElementById('send')");
ok("the veil is off by default", (await page.eval("localStorage.getItem('anansi.veil')")) !== '1');

// ---- a passage, written into the page
const before = await models();
await send("She reaches the door.");
ok("the passage being written sits in the page, under the last one",
   await until("!!document.querySelector('#col > #ghost.inlive')"));
ok("  and there is no full-screen veil", !(await page.eval("!!document.querySelector('#ghost.veil')")));
ok("  and Stop stays on the composer", await page.eval("!!document.querySelector('#send[data-stop]')"));
ok("its words arrive in it", await until("(document.querySelector('#ghost .veiltext')?.textContent ?? '').length > 0", 80));
ok("when it is done it becomes a passage like the others",
   await until("!document.getElementById('ghost')", 120));
ok(`  and it was written (${before} -> ${await models()})`, (await models()) === before + 1);
ok("  with no tap needed to see it", await until("!document.querySelector('#send[data-stop]')", 40));

// ---- a re-roll of the last passage: the new version writes where the old one was
await page.eval("(() => { document.querySelector('#nextbar [data-re]').click(); return 1; })()");
ok("a re-roll writes inline too", await until("!!document.querySelector('#col > #ghost.inlive')"));
ok("  and the version it replaces steps aside while it does",
   (await page.eval("document.querySelectorAll('#col .block.rerolling-out').length")) === 1);
ok("  and is replaced when it lands", await until("!document.getElementById('ghost') && !document.querySelector('.rerolling-out')", 120));

// ---- Stop, from the composer
await send("He does not answer.");
await until("!!document.querySelector('#col > #ghost.inlive')");
await page.eval("(() => { document.querySelector('#send[data-stop]').click(); return 1; })()");
ok("Stop takes the passage being written away", await until("!document.getElementById('ghost')", 40));

console.log(red ? `\n  ${red} RED` : "\n  all green");
