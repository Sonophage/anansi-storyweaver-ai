# PLAN-07 — The veil goes full screen, and the device toggle finds its tab

## Context

Three asks, from a walkthrough of the writing surface:

1. Compare the themes menu against the composer menu and the main menu.
2. Move the hardware keyboard option from Preferences into the themes menu's UI tab.
3. Make the post-send overlay full screen, give it a transition in and out, and put Stop inside it.

Research changed two of the three. **Ask 1 is answered below and needs no code.** **Ask 2's premise
was wrong** — the toggle was never in Preferences; it is already in the themes menu, just not scoped
to a tab — so it shrinks to an 11-line relocation inside one function. **Ask 3 is the real work**, and
it is one change, not three: the overlay is column-scoped *on purpose* so that Stop stays reachable
(`web/app.js:3027-3028`), so full screen is only safe *because* Stop moves inside it. The transition
out does not exist at all — the node is removed, not hidden.

Four bugs turned up on the way and all four are in scope, by Seth's call.

Outcome: pressing send dims and blurs the whole window, the veil fades in and out rather than
appearing and vanishing, and the only control on screen is Stop.

---

## Ask 1 — the three menus, answered

No code. This section is the deliverable.

| | themes (`#appearance`) | composer (`#modes`) | main (`#rail`) |
|---|---|---|---|
| Container | `app.html:854` | `app.html:868-873` | `app.html:848` |
| Builder | `drawAppearance()` `web/app.js:525-621` | `drawDock()` `web/app.js:870-1001` | `drawRail()` `web/app.js:259-343` |
| CSS | `app.html:404-443` | `app.html:679-785` | `app.html:289-363` |
| Shape | 274px flyout → fullscreen sheet at 1099 | inline flex row, never overlays | 248px column → 76px icons → drawer → bottom sheet |
| Hide mechanism | `hidden` attr, **and returns before rendering** (`:527-528`) | never hides; CSS only, in reading mode | `html[data-ui-rail]` + `width`/`transform`, always populated |
| Escape | yes (`:4437`) | yes, big-mode only (`:4436`) | **no** |
| Dismiss outside | inside the no-action-matched branch (`:3458`) | n/a | dedicated `#scrim` listener (`:4429`) |
| Tabs | 4 real tab buttons, `S.lookTab` | `aria-pressed` mode row | same idea as `S.railView`, no tab markup |
| z-index band | 25 / 41 | — / 41 (`#dock.big`) | 30 / 40, scrim 31 |

**The differences that matter:**

- **Three interaction models for three menus.** One renders nothing when closed, one is always
  mounted, one keeps its DOM and slides. Nothing is shared but the delegated click listener
  (`web/app.js:3450-4427`) and its `ACTIONS` allowlist (`:234-250`), which `test/web.ts:96-105`
  enforces.
- **One concept, three implementations.** "One of N selected" is the themes menu's tabs, the rail's
  `S.railView`, and the composer's mode row — tab markup, no markup, and an underline.
- **Selected-state styling is re-typed six times.** "Gold border plus `rgba(217,178,106,.10)`" appears
  as an inline ternary at `web/app.js:270, 334, 557, 593, 612, 1318-1320` while
  `.chip[aria-pressed="true"]` (`app.html:443`) already says it in CSS.
- **Nobody traps focus.** No `<dialog>`, no popover API, no `role="dialog"`, no focus restore — and
  the two surfaces that go fullscreen are the two where it matters.
- **A fourth surface to trip over:** the `.acts` passage tray (`web/app.js:647-678`, CSS
  `app.html:546-589`) is the only true context menu, and it has no Escape either.

Not proposing a unification. Naming it so the next person does not discover it a fourth time.

---

## Ask 3 — the veil goes full screen

### What it is today

`ghost()` (`web/app.js:3017-3054`) builds `div#ghost.veil > div.narr > span.head` and appends it to
`#doc`. Dim and blur are both on the element (`app.html:167`). It is `position:absolute; left:0;
right:0` with `top`/`height` measured off `#read` in JS (`:3031`) and re-measured on `resize`.
The letters are a `requestAnimationFrame` loop at ~11 rolls/sec writing `glyphRun()` into
`span.head.textContent`; charset `GLYPHS` at `web/model.js:180`, length `HEAD = 9` at `:194`.
`unghost()` (`:3056`) calls `.remove()`.

### Changes

**1. CSS — `app.html:166-177`.**

```css
#ghost.veil { position:fixed; inset:0; z-index:50; display:flex; align-items:center;
  justify-content:center; background:rgba(6,6,8,.66); backdrop-filter:blur(2.5px);
  animation:veilin var(--t-slow) var(--ease-out) both; }
#ghost.veil.leaving { animation:veilout var(--t) var(--ease) both; }
@keyframes veilout { from { opacity:1; } to { opacity:0; } }
```

`z-index:50` clears `#rail`/`#side` (30), `#scrim` (31) and `#dock.big` (41), and stays under
`#toast` (60) — which is `pointer-events:none` (`app.html:836`) so it cannot swallow Stop.

Rewrite the comment at `app.html:163-165`. It currently says the veil must never cover the composer
because that would cover Stop. That reason is being answered, not ignored, and the new comment should
say so.

**2. Delete the JS sizing.** `place`, `unplace`, the `resize` listener, and the module-level
`let unplace = null` — `web/app.js:3016`, `3031-3034`, and the `unplace?.()` half of `:3056`.
`inset:0` needs no measurement. This also removes the latent single-handle leak.

**3. Stop inside the veil.** Add to `.narr`, under `span.head`:

```js
`<button data-stop="1" class="veilstop" aria-label="Stop writing">■ Stop</button>`
```

`'stop'` is already in `ACTIONS` (`web/app.js:248`) and the handler at `:3523` is
`if (d.stop) { STOP?.abort(); return; }` — one action, two render sites, no new machinery.

- **Do not give it `id="send"`.** That id belongs to the dock button; two would be a duplicate id.
- **Leave `drawDock()`'s swap alone** (`web/app.js:953-956`). It stays the source of truth for busy
  state and `test/app.ts:430-435` asserts it. It is simply not visible while the veil is up.
- Style `.veilstop` next to `#send.stopping` (`app.html:776-785`) so the two read as one control.

**4. Exit transition — `unghost()`.**

```js
const unghost = () => {
  const g = document.getElementById('ghost');
  if (!g) return;
  if (still()) return g.remove();          // reduced motion: app.html:174 kills the animation,
  g.classList.add('leaving');              // so animationend would never fire and the node
  g.addEventListener('animationend', () => g.remove(), { once: true });
};
```

The `still()` branch is load-bearing, not defensive: `#ghost.veil { animation:none }` at
`app.html:174-177` means a `.leaving` class produces no animation and therefore no `animationend`,
and the veil would stay on screen forever under reduced motion.

**5. Handle a restart during the fade.** `ghost()` reuses an existing `#ghost` if it finds one
(`:3019-3020`). A node mid-`.leaving` would be reused at opacity 0 and the veil would never appear.
At the top of `ghost()`:

```js
const old = document.getElementById('ghost');
if (old?.classList.contains('leaving')) old.remove();
```

**6. Escape, one line.** `web/app.js:4435` — add `if (S.busy) return;` at the top of the keydown
handler. With a modal veil, Escape currently toggles `S.appearance` or `S.panel` on surfaces nobody
can see. *Skipped: wiring Escape to `STOP.abort()`. Escape destroying a passage in flight is a
different decision from Escape closing a panel, and it is Seth's to make.*

### The knob to leave

`app.html:72-74` marks UI scale as `zoom` on `<body>` and names its ceiling exactly: *"it can nudge
fixed-position elements and anything sized in viewport units."* A fixed `inset:0` veil is both, and
XL is the scale Seth writes at. Add a `ponytail:` note on the new `#ghost.veil` rule pointing back at
`app.html:72`, so the next person who sees a misaligned veil at XL finds the cause instead of the
symptom. **This is the one thing tests cannot settle — verification step 4.**

---

## Ask 2 — hardware keyboard into the UI tab

Cut `web/app.js:606-621` and paste the button plus its `.hint` into the `scale` arm of the `body`
ternary at `web/app.js:576-581`, below the existing S/M/L/XL row and its hint, separated by
`border-top:1px solid var(--line)`. Drop the "This device" heading.

- **The UI tab is keyed `scale`, not `ui`** (`web/app.js:538`). The label and the key disagree; the
  code to edit is the `scale` arm.
- **Replace the hand-rolled border/background ternary with `class="chip"`.**
  `.chip[aria-pressed="true"]` (`app.html:443`) already encodes the selected look, and this button
  is the only control in that tab opting out of it. Honest note: `.chip` uses
  `rgba(217,178,106,.5)` border and `.08` background where the inline style uses `var(--gold)` and
  `.10`, so it will read **slightly subtler than today**. That is the shared rule winning over a
  local copy; for the stronger gold, keep the inline style and skip this half.
- **Keep `data-hwkb`.** It is referenced in exactly one other place — the `ACTIONS` allowlist at
  `web/app.js:236` — and no CSS selector targets it. Nothing outside `drawAppearance` moves.
- **Storage does not change.** `anansi.hwkb` in localStorage: declared `web/app.js:60`, read `:62`,
  written only by `setHwkb` `:79`. It must **not** gain `changeLook`'s per-story branch — the
  comment at `web/app.js:55-59` explains why this one setting is deliberately not server-held.
- **Consumers do not change:** `applyHwkb()` `:73-78` (the `interactive-widget` meta swap) and the
  caret restore at `:999`.

*Skipped: a shared toggle-row primitive. Add when a third such switch appears.*

**Cost, stated plainly:** the toggle is visible on whichever tab you opened today. After the move it
is behind a tab press. `drawAppearance()` already re-renders on tab change (`web/app.js:3710`), so it
works; the discoverability is the price.

---

## The four bugs

1. **A reroll at the end of the book shows no veil until the first token.**
   `web/app.js:3275` passes `atEnd ? (d) => ghost(live += d) : () => {}`, but `ghost()` takes no
   parameters (`:3017`) and `live` is accumulated and never read. So the veil waits for a delta —
   and never arrives if the model errors first, which is exactly the 7.8s-cold blank page the veil
   exists to cover (`:3006-3007`). Fix: call `ghost()` unconditionally before the request, the way
   `generate()` does at `:3185`, and delete `live`.

2. **`generate()`'s accept-error path leaves the composer stuck on Stop.**
   `web/app.js:3211-3212` sets `S.busy = false; working(null)` then returns the toast with no
   `drawDock()`, so `#send` keeps `data-stop="1"` and the breathing style until an unrelated
   repaint. Fix with the idiom `regenerateInto()` already uses at `:3287`.

3. **Duplicate `@keyframes breathe`.** `app.html:173` (`.7 → .28`, written for the veil's head) and
   `app.html:784` (`1 → .62`, written for `#send.stopping`). The second wins for both, so the veil
   has never pulsed at its intended amplitude. Fix: rename one — `veilbreathe` for `app.html:171`,
   leaving `breathe` to the send button.

4. **The Stop test's arrival check can never fire.** `test/ui/model.js:46` polls for `#ghost`
   textContent `.length > 20`, but the veil's only text is `glyphRun()` — exactly `HEAD = 9`
   characters (`web/model.js:194`). The loop burns 60 × 500ms = 30s and then fails. Stale from the
   refactor described at `web/app.js:3009-3014`: the ghost used to hold the streaming prose. Fix in
   the test changes below.

One more, not a break but a control that lies, and **left alone**: between `STOP = null`
(`web/app.js:3190`) and the end of `await api.accept(...)` (`:3209`), `S.busy` is still true, so the
button says Stop while `STOP?.abort()` is a silent no-op. Fixing it properly means deciding what
Stop should do to an accept in flight. Belongs in `bugs.md`, not here.

---

## Tests

`test/ui/model.js:33-58` is the only test that drives this path, and **the chosen design breaks it
mechanically.** `bench/drive.ts:108-116` dispatches real `Input.dispatchMouseEvent` at viewport
coordinates, not a DOM `.click()`. A fullscreen veil at z-index 50 sits over `#send`, so
`page.click('#send[data-stop]')` at `test/ui/model.js:52` lands on the veil and does nothing —
and every assertion after it fails. Three edits:

- `:46` — poll `#ghost` for existence, or for textContent `.length > 0`. Not `> 20`.
- `:50-51` — keep asserting the dock swapped to `data-stop`; it is still the busy-state source of
  truth even while covered.
- `:52` — click the veil's Stop (`#ghost [data-stop]`), which is the only reachable one.

**Add two assertions**, because none of this is currently covered:

- The veil is the size of the viewport, not of `#read`. Something like
  `#ghost.getBoundingClientRect().height === innerHeight`. This is the assertion that would have
  gone red before the change and green after — without it the fullscreen change is untested.
- `#ghost [data-stop]` exists while busy. Break it on purpose first: revert the Stop markup and
  watch this specific line go red, or it is decorative.

**`test/ui/model.js` is excluded from the default set** (`test/ui/run.sh`, "every step waits on a
real generation") — run it by name: `test/ui/run.sh model`. It needs llama-server.

`test/ui/surfaces.js:224` pins the tab list to exactly `theme,font,size,scale` — the hwkb move does
not add a tab, so it holds. `:252-255` asserts 4 `[data-scalepick]` and 0 `[data-sizepick]` — an
extra button in that arm does not violate it. **No test covers `hwkb` at all** (zero hits in `test/`
for `hwkb`, `overlays-content`, `This device`), so a green run proves nothing about ask 2 in either
direction. Either accept that or add one assertion that the toggle renders in the scale tab and not
in the theme tab.

---

## Verification

1. `node --experimental-strip-types test/all.ts` — before and after, and compare the total it prints
   against the before-run rather than against a number written here. It does not cover the veil; it
   catches collateral damage.
2. `test/ui/run.sh surfaces` and `test/ui/run.sh modes` — the themes menu and the composer.
3. `test/ui/run.sh model` — the Stop path, with llama-server up. Confirm the two new assertions go
   red when the change is reverted.
4. **By hand, and this is the step nothing else can do:** press send at UI scale **XL**
   (`data-ui-scale="125"`), on desktop and at ≤719px. Confirm the veil covers the viewport exactly —
   no gap at the bottom, no overflow — and that Stop is centred and hittable. This is the `zoom`
   ceiling from `app.html:72-74` being tested, and it is the reason to keep the knob.
5. By hand: veil fades in and out rather than snapping; with `prefers-reduced-motion: reduce` it
   appears and disappears instantly and **does not stick**.
6. By hand: open the rail, then press send — the veil covers the rail. Stop still works.
7. By hand: reroll the last passage. The veil must appear **on the press**, not on the first token
   (bug 1).

---

## Collision risk

Another agent is editing `web/app.js` and `web/model.js` — uncommitted work on model presets around
`web/app.js:1802` and `modelOptions` in `web/model.js`. This plan touches `web/app.js` at `525-621`,
`3016-3056`, `3211`, `3275`, `4435`, plus `app.html` and `test/ui/model.js`. No overlap by line, same
files. Land or stash that work before starting, or expect to resolve `web/app.js` by hand.
