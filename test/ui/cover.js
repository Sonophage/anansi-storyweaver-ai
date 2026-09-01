// A cover found on the web: search, pick, fetch, shrink, store. Seth, 2026-09-01: "can the image
// search be added to the covers and the threads?"
//
// NOT IN THE DEFAULT SET, and named here rather than left to be discovered: this needs ANANSI_SEARCH
// pointing at a working endpoint AND the open web, which is two dependencies test/ui/run.sh
// deliberately does not have. It sits beside `model` and `ritual` for the same reason — those wait on
// a real generation, this waits on a real internet.
//
//   test/ui/run.sh cover        # with ANANSI_SEARCH set on the test server
//
// WHAT IT PROVES THAT NOTHING ELSE CAN: the bytes make the whole trip. An arbitrary image on the web
// sends no access-control-allow-origin, so the browser cannot read it — POST /api/image fetches it
// server-side and the existing readCover shrinks and stores it. A green run here means search, proxy,
// downscale and store all agree; a unit test can only check them one at a time.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => { const r = await (await fetch('/api/stories', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title:'Cover Test',"
  + " genre:'noir', premise:'x', setting:'a canal city', pov:'third past' }) })).json();"
  + " return r.storyId ?? r.id; })()");
ok(`a book to put a cover on (${sid})`, /^s-/.test(String(sid)));

await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
await page.click('[data-nav="story"]');
await wait(900);
ok("the Story panel offers to find a cover on the web",
   (await page.eval(`!!document.querySelector('[data-findcover="open"]')`)) === true);

await page.click('[data-findcover="open"]');
await wait(500);
const seeded = await page.eval(`document.querySelector('[data-findq]')?.value`);
ok(`  the box is seeded from the book rather than blank (${JSON.stringify(seeded)})`,
   typeof seeded === 'string' && seeded.length > 0);

await page.eval(`(() => { const q = document.querySelector('[data-findq]');
  q.value = 'venetian canal at night'; return 1; })()`);
await page.click('[data-findcover="go"]');
for (let i = 0; i < 60 && !(await page.eval("document.querySelectorAll('[data-takeweb]').length")); i++) await wait(500);
const n = await page.eval("document.querySelectorAll('[data-takeweb]').length");
ok(`  it comes back with thumbnails to pick from (${n})`, n > 0);

// Taking one goes through Anansi and lands as the cover, shrunk by the same path a file takes.
const before = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json(); return v.cover ?? null; })()`);
ok(`  and no cover yet (${before})`, !before);
await page.click('[data-takeweb]');
for (let i = 0; i < 80; i++) {
  const c = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json(); return v.cover ?? null; })()`);
  if (c) break; await wait(500);
}
const after = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json(); return v.cover ?? null; })()`);
ok(`  pressing one makes it the cover (${after})`, !!after);
// AND THE BYTES ARE A REAL JPEG the app will serve — the route validates magic bytes, so a stored
// cover proves the whole path: search, server fetch, browser downscale, store.
const served = await page.eval(`(async () => { const r = await fetch('/api/cover?story=${sid}&at=${after}');
  return r.ok ? (r.headers.get('content-type') || '') + ' ' + (await r.blob()).size : 'not served'; })()`);
ok(`  and it is served back as an image (${served})`, /image\//.test(String(served)));
console.log(red ? `\n  ${red} RED` : "\n  all green");
