# Handoff — 2026-08-29, end of the migration-and-measurement day

`main` and `serial` are both at **`6e5652d`**, pushed, tree clean. Read `.claude/CLAUDE.md` first;
this file is what a cold session needs on top of it.

**Do these two things, in this order.** Everything else in this file is context for them.

---

## 1 · Restart the live server — FIRST, before anything else

`serve.ts` loads `src/*.ts` **once, at boot**. `#25`'s work is in `src/` and the running server
started at **15:53:50** against code that predates it. Only `web/*.js` is served fresh per request.

**This cost two diagnoses today.** Seth re-ran a worker, got the old answer, and reported the fix as
broken — twice — because the process was older than the code. Before debugging any report of "it
still does X", check the server's start time against HEAD:

```bash
ps -eo pid,lstart,args | grep '[s]erve.ts'
git log -1 --format='%ad' --date='format:%a %b %d %H:%M:%S %Y'
```

### How to restart it without breaking his setup

**The environment is not in the repo and must not be.** `ANANSI_ALLOW`, `ANANSI_ADMIN`,
`ANANSI_CERT`, `ANANSI_KEY`, `ANANSI_HOST` and `ANANSI_MODELS` live in the command Seth started it
with. Capture them from the running process **before** killing it:

```bash
cp /proc/<pid>/environ /tmp/live.env0            # null-separated, while it is still alive
```

`/tmp/anansi-restart.sh` already exists and does this correctly — it was generated today from that
environ with `shlex.quote` on every value, and it `cd`s to the repo and `exec`s node. It survives
until reboot. Regenerate it the same way if it is gone.

**A restart that loses the environment is worse than no restart:** the first attempt today came back
on `127.0.0.1` over plain HTTP with no allow-list, so Kia could not reach it and neither could
Seth's phone, and nothing said so except the startup banner. **Read the banner every time.** It
should say:

```
Anansi        https://0.0.0.0:5174
writers       zlovlokvi@gmail.com, hellrigelkc@gmail.com
admin         sonophage
```

Back up first — `sqlite3 anansi.db ".backup 'backups/pre-restart.db'"` — because migrations run at
boot. Two ran today and both are already applied.

---

## 2 · Then finish #25: the model info panel

The **data is done and shipped**; what is missing is the surface.

`GET /api/models` now returns `{ id, status, ctxSize, parallel, perSlot, tps, runs }`, merged from
three sources that each know one thing: the router (what exists, what is loaded), `presets.ini`
(`ctx-size`, `parallel`, and `perSlot = ctx-size / parallel`), and the `generations` table (measured
speed). `src/presets.ts` is the parser; `db.modelSpeeds()` is the speed.

The rail footer's model rows already show `50k each · 58.4 tok/s` via `modelFacts()` in
`web/model.js`. **What #25 still asks for** is a panel that opens from a model row carrying:

- [ ] the prose blurb — hand-written, per the issue; the id already encodes purpose (`RP`/`W`/`A`),
      thinking (`NT`/`T`), decensored (`H`) and the `-NN` novel tier, and `modelName()` in
      `web/model.js` decodes some of it already. **Extend that decode; hand-write only the blurb.**
- [ ] measured speed and per-slot context — both already on the payload, no new plumbing
- [ ] the switch button — `data-pickmodel` already exists and works

**Register the panel properly or it is half a panel**: a name in `TITLES` is what makes a panel
hash-addressable, `readHash` validates against that map, and `PANELS.<name>()` as a shorthand method
is what `test/web.ts`'s `panelNames` regex can see. `SNAV` is pinned at eight names by
`test/web.ts` — do not add to it. Any new `data-` action must go in `ACTIONS` or `test/web.ts`
refuses the button, which it did twice today, correctly.

**Four surfaces read the model list**: rail footer (`web/app.js` ~360), Storyteller (~2058), the bar
label, and Preferences — which was deleted in #23, so three.

---

## What changed today, and what it means for anything you touch

### Every card's body moved into a `facts` room

`bench/tofacts.ts` moved **461 cards**; there are **465 facts rooms** now. `entries.body` is empty
across the library. The `facts` room is the half chapter-end cannot rewrite, which is what Seth
asked for: *"there's no place to keep the characters main facts that doesn't get overwritten."*

**This broke three things by making one assumption false, and the lesson generalises: reading
`resolveBody` alone is no longer the same as reading the card.** Use **`cardText(e, at, window?)`**
from `src/context.ts` — body plus the rooms that are switched on. Four callers go through it now
(`factsFor`, `remember`, the retirement scan, and what a new thread is told already exists) and
`buildContext`'s own `bodyOf` is the same expression, so there is one of it.

The cost of missing one: the memory pass spent a whole chapter end asking the model what had changed
about `"Halloran: "` — a name, a colon, and nothing. **F46.**

### `passages.mode` — which press wrote each passage

`speak | act | direct | narrate`, null on everything before today (1,994 rows). It could not be
derived: Speak leaves a `speaker` and Direct leaves a `directive`, but Act and Narrate both write a
bare human row. Four accent colours are derived once in `themeVars` from values every theme already
declares — **not** four new columns in `THEMES`, because there are nineteen themes and that table
exists so a theme cannot ship half-applied. The last passage is boxed in its own accent.

### The chapter-end memory pass routes to rooms

`roomPieces` splits an answer the model has already labelled into one proposal per room.
`withoutEcho` drops any sentence the card already contains, so a room edit carries the change and
not the whole card — **but only on room edits.** `test/memory.ts` caught the first version applying
it to the `none` path too: a state IS the whole description rewritten, and it REPLACES the body from
that chapter on, so stripping it would leave a state holding one sentence and silently drop
everything else about the character. **F47.**

### The proposals queue

Chips by kind — Everything · New · Conflicts · Changed · Finished, each with its count. **Add all is
offered on `new` alone**, and not over a mixed queue, and not for a single card. A proposal card now
says **where it lands above the words that will land there**, with the room as a chip on its title
row.

---

## Traps that cost real time today

- **A stale server.** Twice. See §1.
- **`test/all.ts` going red with no suite named.** `test/web.ts` deliberately refuses a *recorded*
  browser death from `/tmp/anansi-ui-results.json`. Any falsification run that leaves a scenario red
  makes the node suite red until `test/ui/run.sh` runs green again. This looked like flakiness for
  hours. The runner now **names** the suites that failed.
- **`upsertAddon` always inserts a room switched OFF.** Passing `active: 1` does nothing; the accept
  path calls `setAddonActive` separately. A seeding script that assumes otherwise creates cards that
  render as empty — which is how a fixture character went into a chapter with a blank card.
- **`narrationOnly` strips quoted spans before any check sees them.** A name written inside
  quotation marks is invisible to the retirement gate. Two attempts to name a first-person narrator
  in his own chapter vanished this way. Use em dashes.
- **`keys` is already an array on the client** and a JSON string on the fixtures and older callers.
  `JSON.parse([])` is `JSON.parse('')`, which throws.
- **A first-person narrator is never a retirement candidate** unless the narration names him — the
  chapter calls him "I", so his card never fires. Worth knowing before concluding the gate is broken.

## Falsify, or it is decorative — four caught today

Three of my own checks passed against deliberately broken code before being fixed:

- a colour assertion comparing a computed `rgb()` against a raw hex token off `:root` — never equal,
  so it could not fail
- a speed test using `10/20/30`, where the mean and the median are the same number
- a commented-stanza test that passed with **either** of two independent guards removed
- and a fixture whose cards were one-liners, which scored 0/25 on a defect the live library produced
  at 16% — **a fixture that cannot reproduce the failure reports it as absent**

When a fixture will not reproduce something, **measure against the real story**. It is available
here in a way it is not for most projects and it was the only thing that worked for F47.

---

## The live library, as it stands

465 cards, 465 facts rooms, 2,021 passages, **0 open proposals**.

**The Test story (`s-bcb217a0`) is a working end-to-end fixture, built today.** Chapters 1–3 closed
with summaries; chapter 4 open and empty. Cards include Coyle (dead, ch2), Beckett (dismissed, ch3),
Sondra (a live control who does nothing), the two-o-clock rule (abolished, ch2), Halloran (the
narrator, named in the story's `direction`, must never be finished) and Wrenn. Chapter 3 carries all
four modes, so it is also the place to look at #14's accents.

Close a chapter there to exercise the whole ritual against real prose. Predictions belong in writing
**before** the close — that is how both of today's misses were caught honestly.

## Open issues, 10

**#13** (Threads) is largely delivered — rooms, routing, per-room proposals — and is open because
Seth has not called it done. **#22** has four items left; **#27** needs the story-wide fact scan;
**#18** needs the style library and a re-roll on the style field; **#20** needs seeding from threads.
**#9** (contradictions before the prose reaches the writer) is architectural. **#21**, **#24**,
**#11** are unstarted. **#17** (Pinterest) needs Seth's call on whether a network API belongs in a
local-first app at all.

`grep -rn "ponytail:" src web bench *.ts *.html` — 14 markers, each naming its own ceiling.
