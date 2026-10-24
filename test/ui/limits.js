// Two states this app enters for real: the prompt does not fit, and the model is not there.
// F3 measured that the server REFUSES overflow loudly rather than truncating from the head — so
// the refusal has to reach the writer, naming what would have been dropped.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/limits.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");

// ---- squeeze the budget until the prompt cannot fit
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " await fetch('/api/story', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ id: '" + sid + "', story: { ...v.story, maxContext: 600 } }) }); })()");
// 600, and the number is load-bearing. budgetFor reserves max(600, max_tokens), plus 6% of the
// cap, plus SYSTEM — so a cap at or under ~1,112 is what drives the budget to zero, and 600 is
// well inside that. It was 700, which worked only while max_tokens defaulted to 900; halving that
// default to 450 moved the reserve to 600 and left a 58-token budget, so the zero-budget half
// stopped being tested and said so. 600 gives zero under either default.
// The threshold moved from 638 to ~1,112 on 2026-08-28 when PLAN-06 2d put SYSTEM's ~446 tokens
// on the budget; this scenario was already under both, which is why it did not notice.

const mani = await page.eval("(async () => { const r = await (await fetch('/api/manifest', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId:'" + sid + "', mode:'direct' }) })).json();"
  + " return JSON.stringify({ over: r.manifest.overflowed, why: r.manifest.overflowReason,"
  + " budget: r.manifest.totals.budget, used: r.manifest.totals.used }); })()");
console.log("  manifest at a 700-token cap: " + mani);
const m = JSON.parse(mani);
ok("the engine refuses rather than truncating", m.over === true);
// Asserted rather than assumed: if a sampler default moves the reserve again, this says so instead
// of quietly testing a different state.
ok(`  and the cap really does leave zero budget (${m.budget})`, m.budget === 0);
ok(`  and says what would have gone (${JSON.stringify((m.why || '').slice(0, 60))})`, !!m.why);

// the refusal has to reach the writer, not just the JSON
await page.goto(B + "/#" + sid);
// Continue, not #send: Continue is the one mode that needs nothing typed, so it reaches the
// engine. Pressing send with an empty box is now refused by the composer before the engine
// sees it, which is right, and would test the wrong refusal.
for (let i = 0; i < 40 && !(await page.visible('[data-continue]')); i++) await wait(250);
await page.click('[data-continue="1"]');
await wait(2500);
const toast = (await page.text('#toast') || '').trim();
ok(`the writer is told, in the toast (${JSON.stringify(toast.slice(0, 64))})`, toast.length > 10);
// Specific, not "failed". There are two real messages now: one naming the block that would be
// dropped, one explaining that the cap itself leaves no room. Either is specific; neither is a shrug.
ok("  and it is specific rather than a shrug",
   /token|budget|cap|reply|SPINE|CANON|PROSE|EARLIER|DIRECTIVE|TAIL|MODE|drop/i.test(toast));
ok("  and the composer is usable again", await page.eval("!document.getElementById('send').disabled"));

// the Context panel should show the overflow too, since that is where you would go to fix it
await page.click('[data-panel="context"]');
await wait(900);
const side = (await page.text('#sideBody') || '');
ok("the Context panel shows the overflow", /omitted|ceiling|over|refus|drop|no room/i.test(side));

// A cap below the reply reserve gives a budget of zero. It used to render as "Context -168%" and
// "406 / -242"; clamping it at zero then gave "Context Infinity%" and "406 / 1", because the
// divide-by-zero fallback lied. Zero is a state, and the surface has to say so.
const head = (await page.text('#bar') || '');
ok(`no nonsense percentage in the header (${JSON.stringify(head.replace(/\s+/g,' ').match(/(No space|\d+% full)/)?.[0] ?? '')})`,
   !/-\d+%|Infinity|NaN/.test(head));
ok("  it says there is no space instead", /No space/.test(head));
ok("  and the panel explains why, not a meter against nothing",
   /no room for a prompt/i.test(side) && !/\/ 1\b/.test(side));

// ---- put the budget back
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " await fetch('/api/story', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ id: '" + sid + "', story: { ...v.story, maxContext: null } }) }); })()");
const back = await page.eval("(async () => { const r = await (await fetch('/api/manifest', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId:'" + sid + "', mode:'direct' }) })).json();"
  + " return r.manifest.overflowed; })()");
ok("clearing the cap clears the refusal", back === false);

console.log(red ? `\n  ${red} RED` : "\n  all green");
