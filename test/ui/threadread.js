// One thread, read: the Read screen of the v2 Threads redesign (2026-10-25).
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/threadread.js
//
// The shape: "‹ Threads", ＋ and Tidy in the header, the name, ONE row of tags (kind, how it reaches
// Anansi with the list's own mark, N pockets), the thread's text, and four tabs: The thread,
// Timeline, Pockets (each pocket a row with its switch on it) and More (the rarer actions, which
// were under ⋯ until #136, 2026-11-03: Read is the editor). And the half that matters as much:
// every action the old screens offered still has a door from here, old links to the menu's rows
// still open the right tab, and Back and Esc take one step at a time — the thread, then the drawer.
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
  list: !!document.getElementById('thq') })`).then(JSON.parse);

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
    const b = document.querySelector('#sideHead [data-backentry]'), m = document.querySelector('#sideHead [data-tidy]');
    const box = (x) => x ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null;
    return { back: b?.textContent.replace(/\\s+/g, ' ').trim() ?? null, backBox: box(b), more: box(m),
      left: b ? b.getBoundingClientRect().left < innerWidth / 2 : false,
      right: m ? m.getBoundingClientRect().left > innerWidth / 2 : false,
      close: !!document.querySelector('#sideHead [data-panel=""]'),
      oldBar: !!document.querySelector('#sideBody .savebar'), menu: !!document.querySelector('[data-readmenu]') }; })())`).then(JSON.parse);
  ok(`the header has "‹ Threads" on the left and Tidy on the right, and no ⋯ (${JSON.stringify(head)})`,
     /^‹ ?Threads$/i.test(head.back ?? '') && head.left && head.right && !head.menu);
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
      text: f.querySelector('[data-readedit="stands"]')?.textContent.trim() ?? '',
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
  // On the Pockets tab since #136: the tabs are shown by the stylesheet, so it is pressed first.
  await page.click('#sideBody [data-cardtab="rooms"]');
  await wait(400);
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
    // ---- A pocket's eye works from here: each tap posts the next state, as a thread card's. The
    // seed's pocket has no wake words, so it has no On a word: Off and On (the server makes On a word
    // with no words Off).
    const rel = marek.addons.find((a) => a.slot === 'relationships');
    const NEXT = { off: 'always_on', on: 'off' };
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

  // ---- A CHARACTER'S PRONOUN (2026-11-05), in the kind's tag so the row stays one line: "character · she".
  // The tag opens the kinds and, under them, He · She · They · Not set, each saving at once. Speak's cut
  // reads it to know whose a "he says" is.
  const pron = () => page.eval(`document.querySelector('#sideBody .readtags [data-readedit="kind"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? ''`);
  await page.click('#sideBody .readtags [data-readedit="kind"]');
  await wait(400);
  ok("a character's kind tag opens its pronoun too: He, She, They, Not set", await page.eval(
    "[...document.querySelectorAll('#sideBody [data-pronoun]')].map((b) => b.dataset.pronoun).join(',')") === 'he,she,they,none');
  await page.click('#sideBody [data-pronoun="she"]');
  await wait(800);
  ok(`  a chip saves at once, and the tag says so (${await pron()})`,
     (await story(sid)).entries.find((e) => e.id === marek.id).pronoun === 'she' && await pron() === 'character · she');
  await page.click('#sideBody .readtags [data-readedit="kind"]');
  await wait(400);
  await page.click('#sideBody [data-pronoun="none"]');
  await wait(800);
  ok("  and Not set clears it", (await story(sid)).entries.find((e) => e.id === marek.id).pronoun === null && await pron() === 'character');

  // ---- More holds every action ⋯ held (#136), and each one goes somewhere
  await page.click('#sideBody [data-cardtab="more"]');
  await wait(500);
  ok("Tidy is an icon in the header, not a row of More", await page.eval(
    `!!document.querySelector('#sideHead [data-tidy]') && !document.querySelector('#sideBody [data-tidy]')`));
  const more = await page.eval(`JSON.stringify((() => {
    const p = document.querySelector('#sideBody .pane[data-pane="more"]');
    const seen = (sel) => [...(p?.querySelectorAll(sel) ?? [])].some((x) => x.offsetParent !== null);
    return { shown: !!p && p.offsetParent !== null, edges: seen('[data-fold="edges"]'), copy: seen('[data-fold="copy"]'),
      merge: seen('[data-mergestart]'), scan: seen('[data-scanstory]'), json: seen('#f-card-json'),
      past: seen('[data-fieldhistory]'), retire: seen('[data-retire], [data-unretire]'), del: seen('[data-delentry]') }; })())`).then(JSON.parse);
  ok(`More holds the rarer actions (${JSON.stringify(more)})`, Object.values(more).every(Boolean));

  if (w === 390) {
    // AN OLD DOOR TO A MENU ROW (data-readgo, from a link or a stale screen) lands on the tab that
    // holds it, with that section open. No row on screen carries one now, so the press is made by a
    // button put in the drawer for it, which the app's one click handler reads like any other.
    for (const [go, tab, sel] of [['time', 'time', '[data-addstate]'], ['edges', 'more', '[data-link], [data-unlink]'],
                                  ['copy', 'more', '[data-copyentry]'], ['history', 'more', '[data-revertfield], .hint'],
                                  ['json', 'more', '#f-card-json']]) {
      await list(sid); await openThread('Marek Vale');
      await page.eval(`(() => { const b = document.createElement('button'); b.dataset.readgo = ${JSON.stringify(go)};
        document.getElementById('sideBody').append(b); b.click(); return 1; })()`); await wait(900);
      const at = await page.eval(`JSON.stringify((() => {
        const t = document.querySelector('[data-cardtab][aria-pressed="true"]')?.dataset.cardtab;
        const target = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.offsetParent !== null);
        return { tab: t, box: document.querySelector('.cardpanes')?.dataset.tab, visible: !!target }; })())`).then(JSON.parse);
      ok(`  "${go}" opens Read on its tab with it showing (${JSON.stringify(at)})`, at.tab === tab && at.box === tab && at.visible);
    }
    // Delete still asks twice.
    await list(sid); const key = await openThread('the Silver Key');
    await page.click('#sideBody [data-cardtab="more"]'); await wait(400);
    await page.click('#sideBody [data-delentry]'); await wait(600);
    ok("Delete under More asks again before it deletes",
       (await story(sid)).entries.some((e) => e.id === key));
  }

  // ---- Back and Esc: the thread, then the drawer (no ⋯ step since #136)
  await list(sid); await openThread('Marek Vale');
  const s0 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(800);
  const s1 = await state();
  await page.eval("(() => { history.back(); return 1; })()"); await wait(1000);
  const s2 = await state();
  ok(`Back returns to the list (${JSON.stringify(s1)})`, s0.reading && s1.drawer && s1.list && !s1.reading);
  ok(`  then shuts the drawer and stays in the tale (${JSON.stringify(s2)})`, !s2.drawer && s2.hash === '#' + sid);

  await list(sid); await openThread('Marek Vale');
  await page.key("Escape", 27); await wait(500);
  const e1 = await state();
  ok(`Esc returns to the list (${JSON.stringify(e1)})`, e1.list && !e1.reading);

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
