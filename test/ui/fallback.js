// needs: fake-featherless fake-router
// When a remote model cannot write: the reseed hidden on a take Featherless wrote and shown on a
// local one, then the server's key taken away mid-run — no "Find a model" row, the shortlisted
// model a dimmed row reading "Featherless isn't set up", the strip on the local default, and the
// Storyteller's option for it disabled. Runs against a fake Featherless and a fake local router,
// which test/ui/run.sh starts for a scenario whose first line asks for them. run.sh hands over the
// key file as ANANSI_UI_FL_KEY; the server reads it on every call, so deleting it is a server with
// no key from then on.
//
//   test/ui/run.sh fallback
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 40) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(250); }
  return false;
};
const LOCAL = "Qwen3.6-WNTH-35B-A3B-NN";
const REMOTE = "featherless:TheDrummer/Mistral-Small-Uncensored-24B";
/** One call to the app's own routes, from inside the page, so it carries the page's session. */
const call = (path, body) => page.eval(`(async () => (await (await fetch(${JSON.stringify(path)},
  ${body ? `{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }` : '{}'})).json()))()`);

await page.goto(B + "/");
const sid = (await call("/api/stories")).stories.find((s) => s.title === "The Silver Key").id;

// ---- 0. one take by the remote model and one by the local one, in the same slot
const added = await call("/api/shortlist", { model: REMOTE });
ok(`the remote model is on the shortlist (${added.error ?? "added"})`, !added.error);
const write = async (model, variantOf) => {
  await call("/api/model", { model, storyId: sid });
  const g = await call("/api/generate", { storyId: sid, mode: "continue" });
  const v = await call("/api/accept", { storyId: sid, body: g.prose, mode: "continue", genId: g.genId,
    check: false, ...(variantOf ? { variantOf, rejected: false } : {}) });
  return { g, v };
};
const far = await write(REMOTE);
ok(`the remote model wrote a take (${far.g.error ?? "written"})`, !far.g.error && !!far.g.prose);
const pid = far.v.passages.at(-1).id;
const near = await write(LOCAL, pid);
ok(`the local model wrote another take of it (${near.g.error ?? "written"})`, !near.g.error && !!near.g.prose);
const takes = (await call(`/api/history?story=${sid}&passage=${pid}`)).takes;
const localTake = takes.find((t) => !t.remote), remoteTake = takes.find((t) => t.remote);
ok("one take is marked remote and the other local", !!localTake && !!remoteTake);
ok("both takes carry a seed, so only the remote flag can hide the button",
  takes.length === 2 && localTake?.seed != null && remoteTake?.seed != null);

// ---- 1. History: the reseed is on the local take only
await page.goto(B + "/#" + sid);
const shown = (await call(`/api/story?story=${sid}`)).passages.at(-1).id;
await until(`!!document.querySelector('[data-edit="${shown}"]')`);
await page.dbl(`[data-edit="${shown}"]`);
await wait(400);
await page.click(`[data-hi="${shown}"]`);
ok("Alterations shows both versions", await until(`/2 versions/.test(document.querySelector('#sideBody')?.textContent ?? '')`));
const seen = await page.eval(`(() => {
  const side = document.querySelector('#sideBody');
  return { seeds: [...side.querySelectorAll('.kind')].filter((k) => /^seed /.test(k.textContent)).length,
           reseeds: [...side.querySelectorAll('[data-reseed]')].map((b) => b.dataset.reseed) };
})()`);
ok(`both seeds are shown (${seen.seeds})`, seen.seeds === 2);
ok(`one reseed button, on the local take (${JSON.stringify(seen.reseeds)})`,
  seen.reseeds.length === 1 && seen.reseeds[0].endsWith(":" + localTake.seed));
ok("none on the take Featherless wrote", !seen.reseeds.some((r) => r.endsWith(":" + remoteTake.seed)));

// ---- 2. with the key: the Find a model row is there (the detector for the check below)
await call("/api/story", { id: sid, story: { model: REMOTE } });
await call("/api/model", { model: REMOTE, storyId: sid });
const menu = async (at) => {
  await page.goto(B + at);
  await until("!!document.querySelector('[data-modelmenu=\"1\"]')");
  await page.click('[data-modelmenu="1"]');
  return until(`!!document.querySelector('#rail [data-modelinfo="${LOCAL}"]')`);
};
await menu("/");
ok("with a key, the menu ends in Find a model", !!(await page.eval("!!document.querySelector('[data-findmodel]')")));
ok("and the remote model is a row that opens", await page.eval(`!!document.querySelector('#rail [data-modelinfo="${REMOTE}"]')`));

// ---- 3. the key goes away
const keyFile = process.env.ANANSI_UI_FL_KEY;
ok(`run.sh handed over the key file (${keyFile})`, !!keyFile && process.getBuiltinModule("node:fs").existsSync(keyFile));
process.getBuiltinModule("node:fs").unlinkSync(keyFile);
await menu("/");
ok("NO KEY: the Find a model row is gone", await page.eval("!document.querySelector('[data-findmodel]')"));
const dim = await page.eval(`(() => {
  const r = document.querySelector('#rail [data-unready="${REMOTE}"]');
  return r && { tag: r.tagName, text: r.textContent.replace(/\\s+/g, ' '), opacity: +getComputedStyle(r).opacity,
    opens: !!document.querySelector('#rail [data-modelinfo="${REMOTE}"]') };
})()`);
ok(`NO KEY: the shortlisted model is still listed, greyed (${JSON.stringify(dim)})`, dim && dim.opacity < 1);
ok("NO KEY: and says Featherless isn't set up", /Featherless isn't set up/.test(dim?.text ?? ""));
ok("NO KEY: and cannot be opened or picked", dim?.tag !== "BUTTON" && !dim?.opens);
ok("NO KEY: the strip names the local model that writes",
  await page.eval(`document.querySelector('[data-modelmenu="1"] [data-runs]')?.dataset.runs === 'local'`));

// ---- 4. the book pinned to it, in the Storyteller
await page.goto(B + "/#" + sid + "/teller");
ok("the Storyteller offers the picker", await until("!!document.querySelector('[data-storymodel]')"));
const opt = await page.eval(`(() => { const o = [...document.querySelector('[data-storymodel]').options]
  .find((x) => x.value === ${JSON.stringify(REMOTE)}); return o && { text: o.textContent, disabled: o.disabled }; })()`);
ok(`NO KEY: the pinned remote option is disabled and says why (${JSON.stringify(opt)})`,
  opt?.disabled && /Featherless isn't set up$/.test(opt.text));
const hint = (await page.text('#sideBody') ?? "").replace(/\s+/g, " ");
ok("NO KEY: the book says its pin cannot write now, and names the local model that does",
  /cannot write now/.test(hint) && /Qwen3\.6/.test(hint));

console.log(red ? `\n  ${red} RED` : "\n  all green");
