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
  // #75: rules are on the tale's own thread, not a group here; #80 adds Places.
  const LABEL = { character: 'Characters', place: 'Places', lore: 'Lore', item: 'Items' };
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
      look: eye[0]?.dataset.look ?? null,
      label: eye[0]?.getAttribute('aria-label') ?? '',
      eyeBox: er ? [Math.round(er.width), Math.round(er.height)] : null,
      eyeInside: er ? er.left >= r.left && er.right <= r.right + 0.5 : false,
      tags: [...c.querySelectorAll('.tag')].map((x) => x.textContent.trim()), h: Math.round(r.height) };
  }))`).then(JSON.parse);
  // Rules are pockets of the tale (ADR 0005), not threads, so the list has a card for every thread.
  const listed = v.entries.length;
  ok(`one card per thread (${cards.length} of ${listed})`, cards.length === listed);
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
  ok(`  each with exactly one mark, 44px to the finger, inside the card (${JSON.stringify(cards.map((c) => c.eyeBox))})`,
     cards.every((c) => c.eyes === 1 && c.eyeBox[0] >= 44 && c.eyeBox[1] >= 44 && c.eyeInside));
  const pockets = cards.map((c) => {
    const e = v.entries.find((x) => x.id === c.id), p = pocketsOf(e);
    return { name: c.name, p, tag: c.tags.find((t) => /pocket/i.test(t)) ?? null };
  });
  ok(`  a pockets tag only when there are pockets (${JSON.stringify(pockets)})`,
     pockets.some((x) => x.p > 0) && pockets.every((x) => x.p > 0
       ? x.tag?.toLowerCase() === `${x.p} ${x.p === 1 ? 'pocket' : 'pockets'}` : x.tag === null));
  // THREE LOOKS FOR TWO SETTINGS, and no tag saying it twice: an open eye is always on, an eye with
  // a speech mark is on a word and sent now, a shut eye is on a word and asleep. Asserted on the
  // look's NAME (which mark in web/model.js it draws) and on the label, not on the glyph's strokes,
  // so redrawing a mark does not break this.
  const lookOf = (act, lit) => act === 'always_on' ? 'eye' : lit === '1' ? 'eyeheard' : 'eyeshut';
  ok(`  and the mark is drawn for its setting and whether it is sent now, with no tag for either (${
       cards.map((c) => c.name + ':' + c.look).join(', ')})`,
     cards.every((c) => {
       const e = v.entries.find((x) => x.id === c.id);
       return c.look === lookOf(e.activation, c.lit)
         && !c.tags.some((t) => /on a word|always on/i.test(t));
     }));
  ok("  and its label names the state and what a tap does",
     cards.every((c) => /^(On|Off)[^.]*\. Tap to /.test(c.label)));
  const plain = cards.filter((c) => !c.tags.length);
  // TWICE AS TALL since 2026-11-02 (Seth: "make the threads bigger. Twice as big"): it was at most
  // 132px, and the floor is 260 now. A card with nothing to tag sits on the floor, not past it.
  ok(`  and a card with nothing to tag is twice the old height (${plain.map((c) => c.h).join(',')}px)`,
     plain.length > 0 && plain.every((c) => c.h >= 256 && c.h <= 266));

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
  ok("search finds a thread by name", (await typeQ("moneylender")) === "Marek Vale");
  ok("  and finds one by what is in its pockets", (await typeQ('grey coat')) === 'Marek Vale');
  ok("  and its kind heading counts what the search left", /Characters · 1/.test(await page.text('#thlist') || ''));
  await typeQ('zzqx');
  ok("  and says so when nothing matches", /No thread here matches/.test(await page.text('#thlist') || ''));
  await typeQ('');

  // ---- The mark is the switch: off, on a word, on
  // #75: Vantic law is a rule, so it is on the tale's own thread now and not in this list. An
  // always-on thread with no wake words is written for the same job.
  await page.eval(`(async () => { await fetch('/api/entry', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storyId: '${sid}', entry: { title: 'The curfew bell', body: '[The curfew bell: rung at the ninth hour]',
      entryType: 'item', activation: 'always_on', keys: [] } }) }); return 1; })()`);
  await page.goto(B + "/#" + sid + "/threads");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
  await wait(400);
  const rule = (await story(sid)).entries.find((e) => e.title === 'The curfew bell');
  const actNow = async () => (await story(sid)).entries.find((e) => e.id === rule.id).activation;
  const tap = async () => { await page.click(`#thlist [data-flipact="${rule.id}"]`); await wait(800); return actNow(); };
  const sentNow = () => page.eval("Number(document.querySelector('#sideBody [data-onlyin=\"1\"]').textContent.match(/\\d+/)[0])");
  const markOf = (id) => page.eval(`JSON.stringify((() => { const b = document.querySelector('#thlist [data-flipact="${id}"]');
    return { lit: b.dataset.lit, look: b.dataset.look, label: b.getAttribute('aria-label') }; })())`).then(JSON.parse);
  const tipNow = () => page.eval(`document.querySelector('#thlist [data-flipact="${rule.id}"] .eyetip')?.textContent ?? ''`);
  // THE WHOLE RIGHT SIDE IS THE SWITCH (Seth, 2026-11-02): the strip runs the card's full height.
  const strip = await page.eval(`JSON.stringify((() => { const b = document.querySelector('#thlist [data-flipact="${rule.id}"]');
    const c = b.parentElement.querySelector('.card'); const r = b.getBoundingClientRect(), q = c.getBoundingClientRect();
    return { h: Math.round(r.height), card: Math.round(q.height), right: Math.round(q.right - r.right) }; })())`).then(JSON.parse);
  ok(`the mark's press is the card's whole right side (${JSON.stringify(strip)})`, strip.h >= strip.card - 2 && strip.right <= 1);
  // THE ORDER (Seth, 2026-11-02): off → on a word → on → off; off is off for the whole tale.
  const sent0 = await sentNow();
  const steps = [await actNow(), await tap()];
  const off = await markOf(rule.id), tipOff = await tipNow(), sentOff = await sentNow();
  ok(`  a tap on one that is on turns it off, the eye struck through (${JSON.stringify(off)})`,
     off.look === 'eyeoff' && off.lit === '0' && /^Off: not sent in any scene/.test(off.label));
  ok(`  and a tip names the state (${JSON.stringify(tipOff)})`, tipOff === 'Off');
  steps.push(await tap());
  const asleep = await markOf(rule.id);
  const sent1 = await sentNow();
  // The curfew bell has no wake words, so on a word it is asleep: a shut eye, dim, out of Sent now.
  ok(`  a second tap puts it on a word, and with nothing to wake it it is a shut eye, dim (${JSON.stringify(asleep)})`,
     asleep.lit === '0' && asleep.look === 'eyeshut' && /^On a word, asleep.*send it every call/.test(asleep.label));
  // Brought into this scene, the same thread is woken, lit. A pin rather than a wake word, because
  // whether a word woke it is the manifest's answer and the manifest needs the model's tokenizer,
  // which a test server may not have; it lands in the same `inContext` either way. A thread with
  // no wake words cannot be woken by the real router either, so nothing else can light it first.
  await page.eval(`(async () => { await fetch('/api/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: '${sid}', chapterId: '${v.currentChapter.id}', entryId: '${rule.id}', mode: 'force_in' }) }); return 1; })()`);
  await page.goto(B + "/#" + sid + "/threads");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
  const woken = await markOf(rule.id);
  ok(`  and brought into the scene it is a lit eye with a speech mark (${JSON.stringify(woken)})`,
     woken.lit === '1' && woken.look === 'eyeheard' && /^On a word, and sent now/.test(woken.label));
  const sentW = await sentNow();
  steps.push(await tap());
  const sent2 = await sentNow();
  const pins = (await story(sid)).pins?.filter((p) => p.entryId === rule.id) ?? [];
  ok(`tapping the mark goes off, on a word, on (${steps.join(' > ')})`,
     steps.join() === 'always_on,off,triggered,always_on' && (await markOf(rule.id)).look === 'eye');
  ok(`  and the tap to on took the scene's pin off (${pins.length})`, pins.length === 0);
  ok(`  and Sent now counts the open eyes and the woken ones (${sent0} > ${sentOff} > ${sent1} > ${sentW} > ${sent2})`,
     sentOff === sent0 - 1 && sent1 === sent0 - 1 && sentW === sent0 && sent2 === sent0);

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
  ok("the + opens New thread with every way in",
     /New thread/.test(await page.text('#sideBody') || '') && /read the scene/i.test(await page.text('#sideBody') || ''));
  ok("  and the + and the count leave the header while it is open",
     await page.eval("!document.querySelector('#sideHead .headadd, #sideHead [data-thcount]')"));
  await page.click('#sideHead [data-newlore]');
  await wait(600);
  ok("  and its Back comes back to the list", await page.visible('#thq'));
  ok("every tale's threads is still a door from the list", await page.visible('#sideBody [data-leave="canon"]'));
}

// ---- THREE COLUMNS WHERE THE PANEL IS WIDE (#133). Counted as the distinct left edges of the first
// kind's cards: on the panel's width, not the window's, and the cards keep their 260px.
const columns = () => page.eval(`(() => {
  const rows = document.querySelector('#thlist [data-kindrows]');
  const cards = rows ? [...rows.querySelectorAll('.card.plate[data-entry]')] : [];
  return JSON.stringify({ cards: cards.length,
    cols: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size,
    tall: cards.every((c) => c.getBoundingClientRect().height >= 256) });
})()`).then(JSON.parse);
const toThreads = async (sid) => {
  await page.goto(B + "/#" + sid + "/threads");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
  await wait(400);
};
{
  const sid = await open(390, 844);
  const phoneCols = await columns();
  ok(`on a phone the threads are one column (${JSON.stringify(phoneCols)})`, phoneCols.cards > 0 && phoneCols.cols === 1);
  await page.viewport(1440, 900);
  await toThreads(sid);
  // The panel remembers full screen on this device; start beside the page.
  if (await page.eval("document.documentElement.dataset.sidefull === '1'")) { await page.click('#sideHead [data-panelfull]'); await wait(500); }
  const beside = await columns();
  ok(`on a wide window the panel beside the page stays one column (${JSON.stringify(beside)})`, beside.cards > 0 && beside.cols === 1);
  await page.click('#sideHead [data-panelfull]');
  await wait(600);
  const full = await columns();
  const want = Math.min(3, full.cards);
  ok(`made full screen on a desk, the threads go to three columns (${JSON.stringify(full)})`, full.cards > 0 && full.cols === want);
  ok("  and every card keeps its 260px", full.tall);
  await page.click('#sideHead [data-panelfull]');
  await wait(400);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
