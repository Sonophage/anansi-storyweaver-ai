// One thread, read: the Read screen of the v2 Threads redesign (2026-10-25).
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/threadread.js
//
// The shape: "‹ Threads" and ⋯ in the header, the name, ONE row of tags (kind, how it reaches
// Anansi with the list's own mark, N pockets), the thread's text, each pocket as a card with its
// switch on it, and the rarer actions under ⋯. And the half that matters as much: every action the
// old Read screen and the form's More tab offered still has a door from here, and Back and Esc take
// one step at a time — ⋯ first, then the thread, then the drawer.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const story = (sid) => page.eval("(async () => JSON.stringify(await (await fetch('/api/story?story=" + sid + "')).json()))()").then(JSON.parse);
// OPENED BY A PRESS, as a writer opens it, not by its address: a drawer loaded from the address is
// the page's first history entry, so there is no step of its own for Back to go back over.
const list = async (sid) => {
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('[data-nav=\"threads\"]')")); i++) await wait(250);
  await page.eval("(() => { document.querySelector('[data-nav=\"threads\"]').click(); return 1; })()");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
};
const openThread = async (name) => {
  const id = await page.eval(`[...document.querySelectorAll('#thlist .card.plate[data-entry]')]
    .find((c) => c.querySelector('.platename')?.textContent === ${JSON.stringify(name)})?.dataset.entry ?? ''`);
  await page.click(`#thlist .card.plate[data-entry="${id}"]`);
  await wait(700);
  return id;
};
const state = () => page.eval(`JSON.stringify({ hash: location.hash,
  drawer: !document.getElementById('side').hidden,
  reading: !!document.querySelector('#sideBody .readface'),
  list: !!document.getElementById('thq'),
  menu: !!document.querySelector('#sideBody .readmenu') })`).then(JSON.parse);

for (const [w, h, where] of [[390, 844, 'the iPhone'], [360, 360, 'the Titan']]) {
  await page.mobile(w, h);
  await page.goto(B + "/");
  await wait(900);
  await page.click("#page [data-open]");
  await wait(1400);
  const sid = (await page.eval("location.hash")).slice(1).split('/')[0];
  const v = await story(sid);
  console.log(`  -- ${where} (${w}x${h})`);
  await list(sid);
  const listLook = await page.eval(`(() => { const c = [...document.querySelectorAll('#thlist .card.plate[data-entry]')]
    .find((x) => x.querySelector('.platename')?.textContent === 'Marek Vale');
    return c?.parentElement.querySelector('[data-flipact]')?.dataset.look ?? null; })()`);
  const marek = v.entries.find((e) => e.title === 'Marek Vale');
  await openThread('Marek Vale');

  // ---- The header
  const head = await page.eval(`JSON.stringify((() => {
    const b = document.querySelector('#sideHead [data-backentry]'), m = document.querySelector('#sideHead [data-readmenu]');
    const box = (x) => x ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null;
    return { back: b?.textContent.replace(/\\s+/g, ' ').trim() ?? null, backBox: box(b), more: box(m),
      left: b ? b.getBoundingClientRect().left < innerWidth / 2 : false,
      right: m ? m.getBoundingClientRect().left > innerWidth / 2 : false,
      close: !!document.querySelector('#sideHead [data-panel=""]'),
      oldBar: !!document.querySelector('#sideBody .savebar') }; })())`).then(JSON.parse);
  ok(`the header has "‹ Threads" on the left and ⋯ on the right (${JSON.stringify(head)})`,
     /^‹ ?Threads$/i.test(head.back ?? '') && head.left && head.right);
  ok("  each 44px to the finger", head.backBox?.[1] >= 44 && head.more?.[0] >= 44 && head.more?.[1] >= 44);
  ok("  with Close still there, and the old Read / Alter / Back bar gone", head.close && !head.oldBar);

  // ---- The name, one row of tags, the text
  const face = await page.eval(`JSON.stringify((() => {
    const f = document.querySelector('#sideBody .readface'); if (!f) return null;
    const rows = f.querySelectorAll('.readtags');
    const tags = [...(rows[0]?.children ?? [])];
    const tops = new Set(tags.map((t) => Math.round(t.getBoundingClientRect().top)));
    const reach = rows[0]?.querySelector('[data-flipact]');
    return { name: f.querySelector('.readname')?.textContent ?? '', rows: rows.length,
      tags: tags.map((t) => t.textContent.replace(/\\s+/g, ' ').trim()), lines: tops.size,
      look: reach?.dataset.look ?? null, reachLabel: reach?.getAttribute('aria-label') ?? '',
      text: f.querySelector('.readbody')?.textContent.trim() ?? '',
      jumps: f.querySelectorAll('.readtags ~ * [data-goslot], .readtags [data-goslot]').length }; })())`).then(JSON.parse);
  ok(`the name, and ONE row of tags: kind, how it reaches Anansi, pockets (${JSON.stringify(face?.tags)})`,
     face?.name === 'Marek Vale' && face.rows === 1 && face.tags.length === 3
       && /character/i.test(face.tags[0]) && /^(On|Woken|On a word|Off here)$/i.test(face.tags[1])
       && /^2 pockets$/i.test(face.tags[2]));
  ok(`  on one line (${face?.lines})`, face?.lines === 1);
  ok(`  and the reach tag draws the list's own mark for this thread (${face?.look} = ${listLook})`,
     !!face?.look && face.look === listLook && /Tap to/.test(face.reachLabel));
  ok(`  then the thread's text, without the bracket (${face?.text.slice(0, 30)})`,
     // #114: stored plain now, so it shows as stored; the capital came only from taking the bracket off.
     /^moneylender, courteous/i.test(face?.text ?? ''));

  // ---- Each pocket a row, with its switch on the row (rows on a hairline since 2026-11-02, not cards).
  // #134 · The switch is the thread's eye, its state on data-reach; an outfit keeps its Wear.
  const pocketCards = await page.eval(`JSON.stringify([...document.querySelectorAll('#sideBody .readface .pocketrow')]
    .filter((c) => c.querySelector('[data-pocketeye], [data-wear]')).map((c) => {
      const sw = c.querySelector('[data-pocketeye], [data-wear]');
      sw.scrollIntoView({ block: 'center', behavior: 'instant' });   // a finger lands only on what is on screen
      const r = sw.getBoundingClientRect(), cr = c.getBoundingClientRect();
      const mid = [r.left + r.width / 2, r.top + r.height / 2];
      // test/ui/targets.js's rule: the middle is the switch, and a finger 21px off it lands on a
      // control — this one, or a neighbour sharing the gap — never on nothing.
      const C = 'button, a[href], select, summary, [role=button], label';
      const finger = document.elementFromPoint(mid[0], mid[1])?.closest('[data-pocketeye], [data-wear]') === sw
        && [[0, -21], [0, 21], [-21, 0], [21, 0]].every(([dx, dy]) =>
          !!document.elementFromPoint(mid[0] + dx, mid[1] + dy)?.closest(C));
      return { name: c.querySelector('.pkname')?.textContent ?? '', sw: sw.dataset.reach ?? (sw.dataset.wear ? 'wear' : ''),
        inside: r.left >= cr.left && r.right <= cr.right, finger };
    }))`).then(JSON.parse);
  const want = marek.addons.filter((a) => a.slot !== 'facts').length;
  ok(`every pocket is its own row with its eye on it (${JSON.stringify(pocketCards)})`,
     pocketCards.length === want && pocketCards.every((p) => /^(on|woken|word|off|wear)$/.test(p.sw) && p.inside));
  ok("  and the switch is 44px to the finger", pocketCards.every((p) => p.finger));

  if (w === 390) {
    // ---- A pocket's eye works from here: each tap posts the next state, as a thread card's.
    const rel = marek.addons.find((a) => a.slot === 'relationships');
    const NEXT = { off: 'triggered', word: 'always_on', woken: 'always_on', on: 'off' };
    for (let i = 0; i < 3; i++) {
      const was = await page.eval(`document.querySelector('#sideBody [data-pocketeye="${rel.id}"]')?.dataset.reach`);
      await page.click(`#sideBody [data-pocketeye="${rel.id}"]`);
      await wait(800);
      const now = (await story(sid)).entries.find((e) => e.id === marek.id).addons.find((a) => a.id === rel.id)?.activation;
      ok(`a tap on a pocket's eye moves it on from ${was} (${now})`, now === NEXT[was]);
    }
    // ---- The reach tag is the same switch as the list's mark
    // THE SAME ORDER AS THE LIST (Seth, 2026-11-02): on → off (for the whole tale) → on a word → on.
    await page.click('#sideBody .readtags [data-flipact]');
    await wait(800);
    ok("the reach tag turns an always-on thread off, as the list's mark does",
       (await story(sid)).entries.find((e) => e.id === marek.id).activation === 'off'
       && await page.eval("document.querySelector('#sideBody .readtags [data-flipact]')?.dataset.reach") === 'off');
    await page.click('#sideBody .readtags [data-flipact]');
    await wait(800);
    ok("  then on a word", (await story(sid)).entries.find((e) => e.id === marek.id).activation === 'triggered');
    await page.click('#sideBody .readtags [data-flipact]');
    await wait(800);
    const back = await story(sid);
    ok("  and back on", back.entries.find((e) => e.id === marek.id).activation === 'always_on'
      && !(back.pins ?? []).some((p) => p.entryId === marek.id && p.chapterId === back.currentChapter.id));
  }

  // ---- ⋯ holds every action the old screens had, and each one goes somewhere
  await page.click('#sideHead [data-readmenu]');
  await wait(500);
  ok("  one flat list, no folds inside it", await page.eval(`!document.querySelector('#sideBody .readmenu details')`));
  ok("Tidy is an icon in the header, not a row", await page.eval(
    `!!document.querySelector('#sideHead [data-tidy]') && !document.querySelector('#sideBody .readmenu [data-tidy]')`));
  const rows = await page.eval(`JSON.stringify([...document.querySelectorAll('#sideBody .readmenu .readrow')].map((b) => ({
    text: b.textContent.replace(/\\s+/g, ' ').trim(), keys: Object.keys(b.dataset).join(','),
    h: Math.round(b.getBoundingClientRect().height) })))`).then(JSON.parse);
  const has = (re, key) => rows.some((r) => re.test(r.text) && r.keys.split(',').includes(key));
  ok(`⋯ opens a menu of the rarer actions (${rows.map((r) => r.text).join(' | ')})`,
     has(/^Alter/, 'cardview') && has(/^Timeline/, 'readgo') && has(/^Stitched/, 'readgo')
       && has(/^Copy to another tale/, 'readgo') && has(/^Past edits/, 'readgo')
       && has(/as JSON/, 'readgo') && has(/^Read the whole tale/, 'scanstory')
       && (has(/^Retire/, 'retire') || has(/^Bring it back/, 'unretire')) && has(/^Delete/, 'delentry'));
  ok("  every row 44px or more", rows.length > 0 && rows.every((r) => r.h >= 44));

  if (w === 390) {
    // Each door that opens the form lands on the tab that holds it, with that section open.
    for (const [go, tab, sel] of [['time', 'time', '[data-addstate]'], ['edges', 'more', '[data-link], [data-unlink]'],
                                  ['copy', 'more', '[data-copyentry]'], ['history', 'more', '[data-revertfield], .hint'],
                                  ['json', 'more', '#f-card-json']]) {
      await list(sid); await openThread('Marek Vale');
      await page.click('#sideHead [data-readmenu]'); await wait(400);
      await page.click(`#sideBody .readmenu [data-readgo="${go}"]`); await wait(900);
      const at = await page.eval(`JSON.stringify((() => {
        const pane = [...document.querySelectorAll('#sideBody .pane')].find((p) => !p.hidden);
        const t = document.querySelector('[data-cardtab][aria-pressed="true"]')?.dataset.cardtab;
        const target = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.offsetParent !== null);
        return { tab: t, visible: !!target }; })())`).then(JSON.parse);
      ok(`  "${go}" opens the form on its tab with it showing (${JSON.stringify(at)})`, at.tab === tab && at.visible);
    }
    // Delete still asks twice.
    await list(sid); const key = await openThread('the Silver Key');
    await page.click('#sideHead [data-readmenu]'); await wait(400);
    await page.click('#sideBody .readmenu [data-delentry]'); await wait(600);
    ok("Delete under ⋯ asks again before it deletes",
       (await story(sid)).entries.some((e) => e.id === key));
  }

  // ---- Back and Esc: ⋯ first, then the thread, then the drawer
  await list(sid); await openThread('Marek Vale');
  await page.click('#sideHead [data-readmenu]'); await wait(400);
  const s0 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(800);
  const s1 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(800);
  const s2 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(1000);
  const s3 = await state();
  ok(`Back shuts ⋯ first (${JSON.stringify(s1)})`, s0.menu && s1.reading && !s1.menu);
  ok(`  then returns to the list (${JSON.stringify(s2)})`, s2.drawer && s2.list && !s2.reading);
  ok(`  then shuts the drawer and stays in the tale (${JSON.stringify(s3)})`, !s3.drawer && s3.hash === '#' + sid);

  await list(sid); await openThread('Marek Vale');
  await page.click('#sideHead [data-readmenu]'); await wait(400);
  await page.key("Escape", 27); await wait(500);
  const e1 = await state();
  await page.key("Escape", 27); await wait(500);
  const e2 = await state();
  ok(`Esc shuts ⋯ first, then returns to the list (${JSON.stringify(e1)} > ${JSON.stringify(e2)})`,
     e1.reading && !e1.menu && e2.list && !e2.reading);

  // ‹ Threads, then Back: no dead step left behind.
  await list(sid); await openThread('Marek Vale');
  await page.click('#sideHead [data-backentry]'); await wait(700);
  const b1 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(1000);
  const b2 = await state();
  ok(`"‹ Threads" returns to the list, and the next Back shuts the drawer (${JSON.stringify(b1)} > ${JSON.stringify(b2)})`,
     b1.list && !b1.reading && !b2.drawer);

  // Close from a thread shuts the drawer, and Back does not open it again.
  await list(sid); await openThread('Marek Vale');
  await page.click('#sideHead [data-panel=""]'); await wait(900);
  const c1 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(1100);
  const c2 = await state();
  ok(`Close from a thread shuts the drawer, and Back leaves the tale rather than reopening it (${JSON.stringify(c1)} > ${JSON.stringify(c2)})`,
     !c1.drawer && !c2.drawer);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
