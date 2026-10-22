// needs: fake-featherless fake-router
// Where each model runs: the circle and the spider or the feather, on the rail's model menu, the
// strip at the foot of the rail and the Storyteller's picker. Runs against a fake Featherless and
// a fake local router (one model awake, one asleep), which test/ui/run.sh starts for a scenario
// whose first line asks for them.
//
//   test/ui/run.sh marks
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 40) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(250); }
  return false;
};
const AWAKE = "Qwen3.6-WNTH-35B-A3B-NN", ASLEEP = "Wayfarer-2-RPNT-12B";
const REMOTE = "featherless:TheDrummer/Mistral-Small-Uncensored-24B";
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");

/** The mark inside one element, read as the browser drew it: which source and state it says, the
 *  circle's painted colours, the first stroke of its glyph, and its contrast on what is behind it. */
const read = (scope) => page.eval(`(async () => {
  const { MARK } = await import('/web/model.js');
  const host = ${scope};
  const m = host?.querySelector('[data-runs]');
  if (!m) return null;
  const ring = getComputedStyle(m.firstElementChild);
  const d = m.querySelector('svg path')?.getAttribute('d') ?? '';
  const first = (n) => 'M' + MARK[n].split('M').filter(Boolean)[0];
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = (c) => rgb(c).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  let bg = 'rgba(0, 0, 0, 0)', n = m;
  // The first OPAQUE ground. A highlighted row is a 10% wash over the rail, and reading that wash
  // as if it were solid gold measured 1.25:1 for a circle the eye sees on the rail.
  // A computed colour is written rgb() when it is opaque and rgba() when it is not.
  const solid = (c) => /^rgb\\(/.test(c);
  while (n && !solid(bg)) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; }
  const a = lum(ring.borderTopColor), b = lum(bg);
  return { runs: m.dataset.runs, awake: m.dataset.awake === '1', edge: ring.borderTopColor,
    filled: ring.backgroundColor === ring.borderTopColor, hollow: /rgba\\(0, 0, 0, 0\\)|transparent/.test(ring.backgroundColor),
    glyph: d === first('spider') ? 'spider' : d === first('feather') ? 'feather' : d,
    contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), words: m.getAttribute('aria-label') };
})()`);
const row = (id) => read(`document.querySelector('#rail [data-modelinfo="${id}"]')`);

// ---- 0. a remote model on this writer's shortlist
const added = await page.eval(`(async () => (await (await fetch('/api/shortlist', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ${JSON.stringify(REMOTE)} }) })).json()))()`);
ok(`the remote model is on the shortlist (${added.error ?? 'added'})`, !added.error);

// ---- 1. the menu rows, in the dark default theme
const menu = async (at = "/") => {
  await page.goto(B + at);
  await page.click('[data-modelmenu="1"]');
  return until(`!!document.querySelector('#rail [data-modelinfo="${REMOTE}"] [data-runs]')
    && !!document.querySelector('#rail [data-modelinfo="${ASLEEP}"] [data-runs]')`);
};
ok("the menu lists both local models and the remote one, each with a mark", await menu());
const checkRows = async (theme) => {
  const a = await row(AWAKE), s = await row(ASLEEP), r = await row(REMOTE);
  ok(`${theme}: an awake local model has a filled circle and the spider (${JSON.stringify(a)})`,
    a?.runs === "local" && a.awake && a.filled && a.glyph === "spider");
  ok(`${theme}: an asleep local model has a hollow circle and the spider`,
    s?.runs === "local" && !s.awake && s.hollow && s.glyph === "spider");
  ok(`${theme}: a remote model has a filled circle and the feather (${JSON.stringify(r)})`,
    r?.runs === "remote" && r.awake && r.filled && r.glyph === "feather");
  ok(`${theme}: local and remote circles are different colours (${a?.edge} / ${r?.edge})`,
    a?.edge && a.edge === s?.edge && a.edge !== r?.edge);
  ok(`${theme}: both circles read on the rail at 3:1 (${a?.contrast.toFixed(2)}, ${r?.contrast.toFixed(2)})`,
    a?.contrast >= 3 && r?.contrast >= 3);
  ok(`${theme}: the marks say it in words too`, a?.words === "local, awake" && s?.words === "local, asleep"
    && r?.words === "remote, on Featherless");
  return a?.edge;
};
const darkLocal = await checkRows("obsidian");

// ---- 2. the strip, before and after making the remote model this writer's default
const strip = () => read(`document.querySelector('[data-modelmenu="1"]')`);
let st = await strip();
ok(`the strip marks the default local model, awake (${JSON.stringify(st)})`,
  st?.runs === "local" && st.awake && st.glyph === "spider");
await page.click(`#rail [data-modelinfo="${REMOTE}"]`);
await until(`!!document.querySelector('[data-pickmodel="${REMOTE}"]')`);
await page.click(`[data-pickmodel="${REMOTE}"]`);
ok("pressing Write with this one moves the strip to the remote model",
  await until(`document.querySelector('[data-modelmenu="1"] [data-runs]')?.dataset.runs === 'remote'`));
st = await strip();
ok("the strip shows the feather, filled", st?.glyph === "feather" && st.filled);
ok("and says it runs on Featherless", /on Featherless/.test(await page.text('[data-modelmenu="1"]') ?? ""));
await page.click('[data-modelmenu="1"]');
await until(`!!document.querySelector('#rail [data-modelinfo="${REMOTE}"]')`);
ok("the model writing now is the highlighted row", await page.eval(`(() => {
  const bg = (id) => getComputedStyle(document.querySelector('#rail [data-modelinfo="' + id + '"]')).backgroundColor;
  return bg(${JSON.stringify(REMOTE)}) !== bg(${JSON.stringify(AWAKE)}) && /rgba\\(0, 0, 0, 0\\)/.test(bg(${JSON.stringify(AWAKE)})); })()`));

// ---- 3. the book's picker in the Storyteller panel
await page.goto(B + "/#" + sid + "/teller");
ok("the Storyteller offers the picker", await until("!!document.querySelector('[data-storymodel]')"));
const opt = (id) => page.eval(`[...document.querySelector('[data-storymodel]').options].find((o) => o.value === ${JSON.stringify(id)})?.textContent ?? ''`);
ok("each option says where its model runs in words",
  / · local, awake$/.test(await opt(AWAKE)) && / · local, asleep$/.test(await opt(ASLEEP))
  && / · remote, on Featherless$/.test(await opt(REMOTE)));
const beside = () => read(`document.querySelector('[data-storymodel]').parentElement`);
await page.pick('[data-storymodel]', ASLEEP);
ok("pinning the book to an asleep local model shows a hollow spider beside the picker",
  await until(`document.querySelector('[data-storymodel]')?.parentElement.querySelector('[data-runs]')?.dataset.awake === '0'`));
let b = await beside();
ok(`(${JSON.stringify(b)})`, b?.runs === "local" && b.hollow && b.glyph === "spider");
await page.pick('[data-storymodel]', REMOTE);
ok("pinning it to the remote model shows the feather",
  await until(`document.querySelector('[data-storymodel]')?.parentElement.querySelector('[data-runs]')?.dataset.runs === 'remote'`));
b = await beside();
ok(`filled, in the remote colour (${JSON.stringify(b)})`, b?.filled && b.glyph === "feather" && b.contrast >= 3);

// ---- 4. a light theme, chosen the way a writer chooses it, inside the book
await page.goto(B + "/#" + sid);
await until("!!document.querySelector('[data-appearance=\"1\"]')");
await page.click('[data-appearance="1"]');
await page.click('[data-theme="parchment"]');
ok("the theme is Parchment", await until("document.documentElement.dataset.uiTheme === 'parchment'"));
await menu("/#" + sid);
ok("and it is still Parchment after a reload", await page.eval("document.documentElement.dataset.uiTheme === 'parchment'"));
const lightLocal = await checkRows("parchment");
ok("and the circles took the light theme's colours", lightLocal && lightLocal !== darkLocal);

console.log(red ? `\n  ${red} RED` : "\n  all green");
