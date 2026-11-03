// Merge two threads, opened from a thread's ⋯ menu, at phone size.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/merge.js
//
// Seth, 2026-10-29: "merge thread does nothing when I try and use it." The press closed the ⋯ menu,
// which steps history back over the menu's own entry, and the popstate that step fires came AFTER
// the merge box was opened, so it read as Back and shut the box. Nothing showed. No model is
// reached here: the check is that the box opens, stays open, and Cancel and Back shut it.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.mobile();
await page.goto(B + "/");
await wait(900);
await page.click("#page [data-open]");
await wait(1400);
await page.eval("(() => { location.hash = location.hash.split('/')[0] + '/threads'; return 1; })()");
await wait(900);
const first = await page.eval("document.querySelector('#sideBody [data-entry]')?.dataset.entry ?? null");
ok(`the Threads drawer lists a thread to open (${first})`, !!first);
if (first) {
  await page.click(`#sideBody [data-entry="${first}"]`);
  await wait(700);
  // The ⋯ menu is gone; its rows are Read's More tab (#136, 2026-11-03).
  await page.click('#sideBody [data-cardtab="more"]');
  await wait(400);
  ok("its More tab offers Merge with another thread", await page.eval("!!document.querySelector('[data-mergestart]')"));
  await page.click("[data-mergestart]");
  await wait(900);
  const box = () => page.eval("(() => { const b = document.getElementById('mergePanel');"
    + " return { shown: !b.hidden && b.getBoundingClientRect().height > 0, list: !!b.querySelector('[data-mergewith]') }; })()");
  const opened = await box();
  ok(`MERGE-OPENS: pressing Merge opens the merge box, and it stays open (${JSON.stringify(opened)})`, opened.shown);
  ok("  with the other threads to pick from", opened.list);
  // The rest drives the box, so it stops here when the box never opened; MERGE-OPENS is red then.
  if (opened.shown) {

  const other = await page.eval("document.querySelector('#mergePanel [data-mergewith]')?.dataset.mergewith ?? null");
  if (other) {
    await page.click(`#mergePanel [data-mergewith="${other}"]`);
    await wait(500);
    ok("  picking one asks which thread stays",
       await page.eval("document.querySelectorAll('#mergePanel [data-mergekeep]').length === 2"));
  } else ok("  picking one asks which thread stays (no other thread to pick)", false);

  await page.click("#mergePanel [data-mergex]");
  await wait(700);
  const shut = await box();
  ok(`MERGE-CANCEL: Cancel shuts it (${JSON.stringify(shut)})`, !shut.shown);
  ok("  and the thread is still open under it", await page.eval("!!document.querySelector('#sideBody .readface')"));

  // And Back shuts it, without leaving the thread.
  await page.click('#sideBody [data-cardtab="more"]');
  await wait(400);
  await page.click("[data-mergestart]");
  await wait(900);
  ok("MERGE-REOPENS: it opens again from More", (await box()).shown);
  await page.eval("(() => { history.back(); return 1; })()");
  await wait(900);
  ok("MERGE-BACK: Back shuts it", !(await box()).shown);
  ok("  and the thread is still open", await page.eval("!!document.querySelector('#sideBody .readface')"));
  }
}
console.log(red ? `\n  ${red} red` : "\n  all green");
