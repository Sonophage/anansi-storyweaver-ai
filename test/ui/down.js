// needs: dead-model
// What the screens say when the model does not answer, and three pages that waited for ever.
//
//   bash test/ui/run.sh down
//
// From the usability check of 2026-10-24, run against a server with no model: the menu's model dot
// was green, a hem with the model down showed a red report beside a green "Hemmed", a link to Find a
// model said "Reading your shortlist…" for ever, and All threads kept "reading…" under its title.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};

await page.goto(B + "/");
await wait(900);

// ---- the model dot
await page.click('#bar [data-railview="workspace"]');
await wait(400);
ok("the model list has been asked for", await until("!document.querySelector('#rail [data-modelmenu]') ? false : true"));
await wait(1500);
const dot = await page.eval("(() => { const b = document.querySelector('#rail [data-modelmenu]');"
  + " return { awake: b?.querySelector('[data-runs]')?.dataset.awake, text: b?.textContent.replace(/\\s+/g, ' ').trim() }; })()");
ok(`with the model down the dot is not lit (${JSON.stringify(dot)})`, dot.awake === '0');
ok("  and the words say it is not answering", /not answering/.test(dot.text ?? ''));

// ---- All threads
await page.goto(B + "/");
await wait(600);
await page.eval("(() => { document.querySelector('[data-nav=\"canon\"]').click(); return 1; })()");
await until("document.querySelectorAll('#page [data-entry]').length > 0");
await wait(300);
const sub = await page.eval("document.querySelector('#bar .up')?.textContent ?? ''");
ok(`All threads says how many once it has read them (${JSON.stringify(sub)})`, /\d+ threads? across/.test(sub));

// ---- Find a model, by its link
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
await page.goto(B + "/#" + sid + "/findmodel");
const read = await until("!!document.getElementById('findmine') && !/Reading your shortlist/.test(document.getElementById('findmine').textContent)");
ok(`a link to Find a model reads the shortlist (${JSON.stringify(await page.eval("document.getElementById('findmine')?.textContent.trim().slice(0, 60) ?? null"))})`, read);

// ---- a hem with the model down
await page.goto(B + "/#" + sid + "/ritual");
await until("!!document.querySelector('#sideBody [data-endchapter]')");
const before = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).currentChapter.id)()");
await page.eval("(() => { document.querySelector('#sideBody [data-endchapter]').click(); return 1; })()");
await until(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).currentChapter.id !== ${JSON.stringify(before)})()`, 60);
await wait(800);
// #92. The route answers before the passes run. Since 2026-10-30 the hem drawer stays open on the
// scene that closed, on its steps, and asks how the next scene starts while the passes run behind it.
ok("the hem drawer stays open on its steps and asks what the next scene is (2026-11-01)",
   await page.visible('#sideBody .hemsteps') && await page.visible('#sideBody [data-hemsteer]'));
// ENTER SENDS IT (Seth, 2026-10-30: "once I press enter"), and who is in the next scene comes next.
await page.eval("(() => { const t = document.querySelector('#sideBody [data-hemsteer]'); t.focus(); t.value = 'Days later, at the docks.';"
  + " t.dispatchEvent(new Event('input', { bubbles: true }));"
  + " t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()");
await until("!!document.querySelector('#sideBody [data-hemwhodone]')", 20);
ok("Enter sends the brief, and who is in the next scene is asked next",
   await page.visible('#sideBody [data-hemwhodone]') && !(await page.visible('#sideBody [data-hemsteer]')));
const briefed = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).currentChapter.brief)()");
ok(`  and the brief is the next scene's, as written (${JSON.stringify(briefed)})`, briefed === 'Days later, at the docks.');
await page.click('#sideBody [data-hemwhodone]');
await until(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).chapters.find((c) => c.id === ${JSON.stringify(before)})?.hem?.state === 'done')()`, 60);
// The row at the top of the next scene's screen that names the scene just closed. It was a green
// dot and "hemmed" beside a red report of what did not run.
await page.goto(B + "/#" + sid + "/setup");
await wait(900);
await page.eval("(() => { const b = [...document.querySelectorAll('#sideBody [data-setupstep]')].find((x) => /The next scene/.test(x.textContent)); if (b) b.click(); return !!b; })()");
await wait(700);
const row = await page.eval("(() => { const r = document.querySelector('#sideBody button[data-panel=\"ritual\"]');"
  + " return r ? { text: r.textContent.replace(/\\s+/g, ' ').trim(), dot: r.querySelector('span').getAttribute('style') } : null; })()");
ok(`the row for the closed scene does not say hemmed in green (${JSON.stringify(row?.text)})`,
   !!row && /did not run/.test(row.text) && !/hemmed/.test(row.text) && !/--good/.test(row.dot));
await page.click('#sideBody button[data-panel="ritual"]');
await wait(700);
// Since 2026-10-30 the hem screen is its steps: a pass that did not run is a red step, not green.
const failedSteps = await page.eval("[...document.querySelectorAll('#sideBody .hemsteps li[data-state=\"fail\"]')].length");
ok(`  and the hem's steps show what did not run in red (${failedSteps} steps)`, failedSteps > 0);

// After a reload, the scene hemmed with no summary is on the Workbench with its button. It was
// reachable only from This scene → Summaries (second usability check, 2026-10-25).
await page.goto(B + "/#" + sid + "/waiting");
await wait(1200);
ok("the Workbench lists the hemmed scene that has no summary, with a button to write it",
   await page.eval(`!!document.querySelector('#sideBody [data-summarize=${JSON.stringify(before)}]')`)
   && /has no summary/.test(await page.eval("document.getElementById('sideBody').textContent")));

console.log(red ? `\n  ${red} RED` : "\n  all green");
