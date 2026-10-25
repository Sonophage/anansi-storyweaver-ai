// The Threads list, as the v2 redesign draws it (2026-10-25).
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/threadlist.js
//
// Seth: "the threads screen is a lot of information and needs to be simpler and easier and more
// intuitive without losing functionality." So this asserts both halves. The new shape: the count
// beside the title, the + in the header, search and Sent now / All in one row, each kind with its
// count, and short cards (name, two lines, one eye, a pockets tag only when there are pockets).
// And every control the old list had is still on it and still does its job.
//
// On the iPhone width and on the Titan's 360x360, because the row that holds the search box and
// both filters is the thing most likely to break on the narrow one.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const open = async (w, h) => {
  await page.mobile(w, h);
  await page.goto(B + "/");
  await wait(900);
  await page.click("#page [data-open]");
  await wait(1400);
  const sid = (await page.eval("location.hash")).slice(1).split('/')[0];
  await page.goto(B + "/#" + sid + "/threads");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
  return sid;
};
const story = (sid) => page.eval("(async () => JSON.stringify(await (await fetch('/api/story?story=" + sid + "')).json()))()").then(JSON.parse);
// A pocket is every named part of a thread except its facts: facts is the thread's own text
// (it becomes Always true in the pockets plan), so counting it would put "1 pocket" on nearly
// every thread in a real library.
const pocketsOf = (e) => (e.addons ?? []).filter((a) => a.slot !== 'facts').length;

for (const [w, h, where] of [[390, 844, 'the iPhone'], [360, 360, 'the Titan']]) {
  const sid = await open(w, h);
  const v = await story(sid);
  const n = v.entries.length;
  console.log(`  -- ${where} (${w}x${h}), ${n} threads`);

  // ---- The header: the title, its count, the +
  const head = await page.eval(`JSON.stringify({
    title: document.querySelector('#sideHead .serif')?.textContent ?? '',
    count: document.querySelector('#sideHead [data-thcount]')?.textContent?.trim() ?? null,
    add: (() => { const b = document.querySelector('#sideHead [data-newlore]'); if (!b) return null;
      const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
    help: !!document.querySelector('#sideHead [data-tip="threads"]'),
    oldDoor: !!document.querySelector('#sideBody [data-newlore]') })`).then(JSON.parse);
  ok(`the title says Threads with the count beside it (${JSON.stringify(head)})`,
     /Threads/.test(head.title) && head.count === String(n) && head.help);
  ok("  and the + is in the header, 44px to the finger",
     !!head.add && head.add[0] >= 44 && head.add[1] >= 44);
  ok("  and the long door that sat above the list is gone", !head.oldDoor);

  // ---- Search and the two filters share one row
  const row = await page.eval(`(() => {
    const q = document.getElementById('thq'), c = [...document.querySelectorAll('#sideBody [data-onlyin]')];
    if (!q || c.length !== 2) return null;
    const mid = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
    const right = Math.max(...c.map((e) => e.getBoundingClientRect().right));
    const body = document.getElementById('sideBody').getBoundingClientRect();
    return JSON.stringify({ spread: Math.round(Math.max(...[q, ...c].map(mid)) - Math.min(...[q, ...c].map(mid))),
      inside: right <= body.right + 0.5, labels: c.map((e) => e.textContent.replace(/\\s+/g, ' ').trim()),
      qw: Math.round(q.getBoundingClientRect().width),
      tall: Math.min(...c.map((e) => e.getBoundingClientRect().height)) });
  })()`).then((x) => x && JSON.parse(x));
  ok(`search, Sent now and All sit in one row (${JSON.stringify(row)})`,
     !!row && row.spread <= 4 && row.inside && row.qw >= 80);
  ok("  and the filters still carry their counts",
     !!row && /^Sent now \d+$/.test(row.labels[0]) && row.labels[1] === `All ${n}`);

  // ---- Each kind with its count, and the cards under it
  const groups = await page.eval(`JSON.stringify([...document.querySelectorAll('#thlist [data-kindhead]')].map((h) => ({
    kind: h.dataset.kindhead, text: h.textContent.replace(/\\s+/g, ' ').trim(),
    cards: document.querySelectorAll('#thlist [data-kindrows="' + h.dataset.kindhead + '"] .card.plate[data-entry]').length })))`).then(JSON.parse);
  const LABEL = { character: 'Characters', lore: 'Lore', item: 'Items', rule: 'Rules' };
  const want = Object.entries(LABEL).map(([k]) => [k, v.entries.filter((e) => e.entryType === k).length]).filter(([, c]) => c);
  ok(`every kind is a heading with its count (${groups.map((g) => g.text).join(' / ')})`,
     groups.length === want.length && want.every(([k, c]) => groups.some((g) => g.kind === k
       && g.text === `${LABEL[k]} · ${c}` && g.cards === c)));

  // ---- The cards
  const cards = await page.eval(`JSON.stringify([...document.querySelectorAll('#thlist .card.plate[data-entry]')].map((c) => {
    const t = c.querySelector('.clamp2'), eye = c.parentElement.querySelectorAll(':scope > [data-flipact]');
    const r = c.getBoundingClientRect(), er = eye[0]?.getBoundingClientRect();
    return { id: c.dataset.entry, name: c.querySelector('.platename')?.textContent ?? '',
      lines: t ? getComputedStyle(t).webkitLineClamp : null, text: t?.textContent?.trim() ?? '',
      kindLine: !!c.querySelector('.kind'), eyes: eye.length, lit: eye[0]?.dataset.lit ?? null,
      eyeBox: er ? [Math.round(er.width), Math.round(er.height)] : null,
      eyeInside: er ? er.left >= r.left && er.right <= r.right + 0.5 : false,
      tags: [...c.querySelectorAll('.tag')].map((x) => x.textContent.trim()), h: Math.round(r.height) };
  }))`).then(JSON.parse);
  ok(`one card per thread (${cards.length} of ${n})`, cards.length === n);
  ok("  each with its name and two lines of its text, and no kind line under the name",
     cards.length > 0 && cards.every((c) => {
       const e = v.entries.find((x) => x.id === c.id);
       return e && c.name === e.title && c.lines === '2' && c.text.length > 0 && !c.kindLine;
     }));
  // THE BRACKET COMES OFF on the list. "[Aldis Fen: 34, ex-Watch ...]" repeats the name the card
  // already shows in large type; the text is what is after it.
  const aldis = cards.find((c) => c.name === 'Aldis Fen');
  ok(`  and the bracket and the repeated name come off the text (${aldis && aldis.text.slice(0, 30)})`,
     !!aldis && /^34, ex-Watch/.test(aldis.text) && !/[[\]]/.test(aldis.text));
  ok(`  each with exactly one eye, 44px to the finger, inside the card (${JSON.stringify(cards.map((c) => c.eyeBox))})`,
     cards.every((c) => c.eyes === 1 && c.eyeBox[0] >= 44 && c.eyeBox[1] >= 44 && c.eyeInside));
  const pockets = cards.map((c) => {
    const e = v.entries.find((x) => x.id === c.id), p = pocketsOf(e);
    return { name: c.name, p, tag: c.tags.find((t) => /pocket/i.test(t)) ?? null };
  });
  ok(`  a pockets tag only when there are pockets (${JSON.stringify(pockets)})`,
     pockets.some((x) => x.p > 0) && pockets.every((x) => x.p > 0
       ? x.tag?.toLowerCase() === `${x.p} ${x.p === 1 ? 'pocket' : 'pockets'}` : x.tag === null));
  ok("  and an on-a-word thread says so, an always-on one carries no tag for it",
     cards.every((c) => {
       const e = v.entries.find((x) => x.id === c.id);
       const says = c.tags.some((t) => /^on a word$/i.test(t));
       return e.activation === 'triggered' ? says : !says && !c.tags.some((t) => /always on/i.test(t));
     }));
  const plain = cards.filter((c) => !c.tags.length);
  ok(`  and a card with nothing to tag is short (${plain.map((c) => c.h).join(',')}px)`,
     plain.length > 0 && plain.every((c) => c.h <= 132));

  // ---- Sent now: the eye and the filter answer the same question
  const lit = cards.filter((c) => c.lit === '1').map((c) => c.id).sort();
  const sentLabel = Number(row?.labels[0]?.match(/\d+/)?.[0]);
  await page.click('#sideBody [data-onlyin="1"]');
  await wait(500);
  const sent = await page.eval("JSON.stringify([...document.querySelectorAll('#thlist .card.plate[data-entry]')].map(c => c.dataset.entry).sort())").then(JSON.parse);
  ok(`Sent now shows exactly the threads whose eye is open (${sent.length} shown, ${lit.length} lit, chip says ${sentLabel})`,
     sent.length === sentLabel && JSON.stringify(sent) === JSON.stringify(lit));
  ok("  and the row and its explainer stay on screen",
     await page.visible('#thq') && await page.eval("!!document.querySelector('#sideBody [data-tip=\"thInContext\"]')"));
  await page.click('#sideBody [data-onlyin="0"]');
  await wait(500);

  if (w !== 390) continue;   // the presses below change the book; once is enough

  // ---- Search: by name, inside a pocket, and saying so when nothing matches
  const typeQ = async (s) => {
    await page.eval(`(() => { const q = document.getElementById('thq'); q.value = ${JSON.stringify(s)};
      q.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await wait(300);
    return page.eval("[...document.querySelectorAll('#thlist .platename')].map(x => x.textContent).join(',')");
  };
  ok("search finds a thread by name", (await typeQ("vantic")) === "Vantic law");
  ok("  and finds one by what is in its pockets", (await typeQ('grey coat')) === 'Marek Vale');
  ok("  and its kind heading counts what the search left", /Characters · 1/.test(await page.text('#thlist') || ''));
  await typeQ('zzqx');
  ok("  and says so when nothing matches", /No thread here matches/.test(await page.text('#thlist') || ''));
  await typeQ('');

  // ---- The eye is the always-on / on-a-word switch, one press each way
  const key = v.entries.find((e) => e.entryType === 'item' && e.activation === 'triggered');
  await page.click(`#thlist [data-flipact="${key.id}"]`);
  await wait(800);
  const flipped = (await story(sid)).entries.find((e) => e.id === key.id).activation;
  const tagGone = !(await page.eval(`[...document.querySelector('#thlist .card.plate[data-entry="${key.id}"]').querySelectorAll('.tag')].some(t => /on a word/i.test(t.textContent))`));
  ok(`pressing the eye on an on-a-word thread makes it always on (${flipped})`, flipped === 'always_on' && tagGone);
  await page.click(`#thlist [data-flipact="${key.id}"]`);
  await wait(800);
  ok("  and pressing it again puts it back on a word",
     (await story(sid)).entries.find((e) => e.id === key.id).activation === 'triggered');
  ok("  and the eye says what a press will do",
     /wake word|every call|always/i.test(await page.eval(`document.querySelector('#thlist [data-flipact="${key.id}"]')?.getAttribute('aria-label') ?? ''`)));

  // ---- Outfits are still worn from the list
  const marek = v.entries.find((e) => e.title === 'Marek Vale');
  const coat = marek.outfits[0];
  ok("Marek's outfit is still a chip under his card", await page.visible(`#thlist [data-wear="${marek.id}:${coat.id}"]`));
  await page.click(`#thlist [data-wear="${marek.id}:${coat.id}"]`);
  await wait(800);
  ok("  and pressing it puts it on",
     !!(await story(sid)).entries.find((e) => e.id === marek.id).outfits.find((o) => o.id === coat.id)?.active);
  await page.click(`#thlist [data-wear="${marek.id}:"]`);
  await wait(800);
  ok("  and nothing takes it off again",
     !(await story(sid)).entries.find((e) => e.id === marek.id).outfits.some((o) => o.active));

  // ---- A card opens the thread; the + opens the tray; every tale's threads is still a door
  await page.click(`#thlist .card.plate[data-entry="${marek.id}"]`);
  await wait(700);
  ok("pressing a card opens that thread", await page.eval("!!document.querySelector('[data-cardview]')"));
  await page.goto(B + "/#" + sid + "/threads");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
  await page.click('#sideHead [data-newlore]');
  await wait(600);
  ok("the + opens the tray with every way in",
     /Write it down/.test(await page.text('#sideBody') || '') && /read the scene/i.test(await page.text('#sideBody') || ''));
  ok("  and the + and the count leave the header while it is open",
     await page.eval("!document.querySelector('#sideHead [data-newlore], #sideHead [data-thcount]')"));
  await page.click('#sideBody [data-newlore]');
  await wait(600);
  ok("  and its Back comes back to the list", await page.visible('#thq'));
  ok("every tale's threads is still a door from the list", await page.visible('#sideBody [data-leave="canon"]'));
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
