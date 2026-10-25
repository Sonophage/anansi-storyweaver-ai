// needs: fake-featherless fake-router
// A re-roll of the last passage lands as a take of it, on a local model and on a remote one alike
// (#63): one passage still, one more take, the ‹ › pager on it, and nothing extra on the page.
// Remote streams are driven several ways: plain, in pieces, past the cap (#62), after an at-capacity
// answer, one word long, after a plan, and with the veil left while it streams. A stream that fails partway leaves the page as it was. Runs against a
// fake Featherless and a fake local router, which test/ui/run.sh starts for a scenario whose first
// line asks for them; the fake Featherless reads `fl.script` beside the key file run.sh hands over.
//
//   test/ui/run.sh reroll
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 80) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(250); }
  return false;
};
const fs = process.getBuiltinModule("node:fs"), path = process.getBuiltinModule("node:path");
const SCRIPT = path.join(path.dirname(process.env.ANANSI_UI_FL_KEY ?? "/nonexistent/x"), "fl.script");
const LOCAL = "Qwen3.6-WNTH-35B-A3B-NN";
const REMOTE = "featherless:TheDrummer/Mistral-Small-Uncensored-24B";
/** One call to the app's own routes, from inside the page, so it carries the page's session. */
const call = (path, body) => page.eval(`(async () => (await (await fetch(${JSON.stringify(path)},
  ${body ? `{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }` : '{}'})).json()))()`);

await page.goto(B + "/");
const sid = (await call("/api/stories")).stories.find((s) => s.title === "The Silver Key").id;
const story = () => call(`/api/story?story=${sid}`);
const added = await call("/api/shortlist", { model: REMOTE });
ok(`the remote model is on the shortlist (${added.error ?? "added"})`, !added.error);
ok(`run.sh handed over the scratch folder (${SCRIPT})`, fs.existsSync(path.dirname(SCRIPT)));

/** Pin the book to `model` and give it an undirected last passage (the fixture's is directed, and
 *  a directed re-roll opens its instruction first). */
const fresh = async (model) => {
  await call("/api/story", { id: sid, story: { model } });
  await call("/api/model", { model, storyId: sid });
  const g = await call("/api/generate", { storyId: sid, mode: "continue" });
  await call("/api/accept", { storyId: sid, body: g.prose, mode: "continue", genId: g.genId, check: false });
  return g;
};
/** Re-roll the last passage from the row under it, the way a writer does, with the fake told how
 *  to answer, and read what the page and the book say once the veil is left. */
const reroll = async (how, during) => {
  fs.writeFileSync(SCRIPT, JSON.stringify(how ? [how] : []));
  await page.goto(B + "/#" + sid);
  await until("!!document.querySelector('#nextbar [data-re]')");
  const before = (await story()).passages;
  const textBefore = await page.eval("document.getElementById('col').textContent");
  await page.eval("(() => { document.querySelector('#nextbar [data-re]').click(); return 1; })()");
  await wait(300);
  if (during) await during();
  // The take is held on the veil until the writer leaves it; a failed one takes the veil down.
  await until("!!document.querySelector('#ghost.done') || (!document.getElementById('ghost') && !document.querySelector('[data-stop]'))");
  await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
  await until("!document.getElementById('ghost')");
  await wait(500);
  const after = (await story()).passages;
  const seen = await page.eval(`(() => {
    const col = document.getElementById('col');
    const tail = [...col.querySelectorAll('.block')].at(-1);
    const t = document.getElementById('toast');
    return { text: col.textContent, toast: t && !t.hidden ? t.textContent : '',
      pager: tail?.querySelector('[data-vp]')?.parentElement?.textContent?.replace(/\\s+/g, '') ?? null };
  })()`);
  return { before, after, textBefore, ...seen };
};
const lands = (where, r, words) => {
  const was = (r.before.at(-1).variants ?? []).length || 1, now = (r.after.at(-1)?.variants ?? []).length;
  ok(`${where}: still one passage, not a second (${r.before.length} -> ${r.after.length})`,
    r.after.length === r.before.length);
  ok(`${where}: one more take of it (${was} -> ${now})`, now === was + 1);
  ok(`${where}: the pager shows the new take (${r.pager})`, r.pager === `‹${now}/${now}›`);
  const tail = String(r.after.at(-1)?.body ?? "");
  ok(`${where}: the new take is the passage shown (${JSON.stringify(tail.slice(0, 40))})`, words.test(tail));
  // The take's own words, counted on the page: once, as the selected take of its passage.
  const n = r.text.split(tail).length - 1;
  ok(`${where}: its words are on the page once, not as extra text (${n})`, !!tail && n === 1);
};

// ---- 1. the control: a local re-roll, then a second one on the take it made
{
  const g = await fresh(LOCAL);
  ok(`local: a passage to re-roll (${g.error ?? "written"})`, !g.error && !!g.prose);
  lands("local", await reroll(), /fake router wrote/);
  lands("local, again", await reroll(), /fake router wrote/);
}

// ---- 2. remote, each way a stream can arrive, re-rolling the same passage each time
{
  const g = await fresh(REMOTE);
  ok(`remote: a passage to re-roll (${g.error ?? "written"})`, !g.error && !!g.prose);
  lands("remote", await reroll(), /^The fake wrote this\.$/);
  lands("remote, in pieces", await reroll("pieces"), /^The fake wrote this in pieces\.$/);
  lands("remote, cut at the cap", await reroll("overcap"), /^(word ){6}end\./);
  lands("remote, after an at-capacity answer", await reroll("capacity"), /^The fake wrote this\.$/);
  lands("remote, one word", await reroll("one"), /^She$/);
  lands("remote, planned first", await reroll("plan"), /^The fake planned this\.$/);
  // A remote take is slow, so the writer leaves the veil before it is done, as Seth does.
  lands("remote, veil left while it streams", await reroll("slow", async () => {
    await wait(900);
    await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
  }), /^The fake wrote this slowly/);
}

// ---- 3. remote, failing partway: the page is left as it was
{
  const r = await reroll("midstream");
  ok(`midstream: no passage added (${r.before.length} -> ${r.after.length})`, r.after.length === r.before.length);
  ok("midstream: no take added",
    (r.after.at(-1)?.variants ?? []).length === (r.before.at(-1)?.variants ?? []).length);
  ok(`midstream: the writer is told (${r.toast})`, /Featherless stopped mid-passage/.test(r.toast));
  ok("midstream: none of its words are on the page", !r.text.includes("The fake began"));
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
