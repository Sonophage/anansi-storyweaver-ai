# Handoff — 2026-08-29, end of the migration-and-measurement day

`main` and `serial` were both at **`6886f38`** when this session started. Read `.claude/CLAUDE.md`
first; this file is what a cold session needs on top of it.

**Both of the two tasks at the top are done** — the restart, and #25's panel. §1 is kept because the
procedure it replaced was wrong and the next cold session will otherwise read the old one somewhere.
Everything below §2 is unchanged context from 2026-08-29.

---

## 1 · The live server — restarted, and the procedure above it was wrong

**Done, 2026-08-29 16:51:24.** The stale process (started 15:53:50, older than HEAD) is gone and
the server is back on `https://0.0.0.0:5174` with both writers and the admin in the banner.

**The restart procedure this file carried was obsolete, and following it is worse than not.** It
said the environment "is not in the repo and must not be" and told you to lift it out of
`/proc/<pid>/environ` into `/tmp/anansi-restart.sh`. Both halves are now false:

- `~/.config/systemd/user/anansi.service` exists, is `enabled`, and reads
  `EnvironmentFile=<repo>/.env`.
- That `.env` is at the repo root, gitignored (`.gitignore:20`), and its `ANANSI_*` lines are
  **byte-identical** to what the live process was running with — diffed before the kill, not
  assumed.

So the restart is:

```bash
sqlite3 anansi.db ".backup 'backups/pre-restart-$(date +%Y-%m-%dT%H%M).db'"   # migrations run at boot
systemctl --user restart anansi.service
journalctl --user -u anansi.service -n 20 --no-pager -o cat                   # read the banner
```

**Read the banner every time.** The failure this file warned about is real — a restart that loses
the environment comes back on `127.0.0.1` over plain HTTP with no allow-list and says so nowhere
else. It should say:

```
Anansi        https://0.0.0.0:5174
writers       zlovlokvi@gmail.com, hellrigelkc@gmail.com
admin         sonophage
```

`/tmp/anansi-restart.sh` still exists and still works, but it starts the server **in a terminal
scope** rather than under the unit — which is how the 15:53:50 process came to be: no
`Restart=on-failure`, and it dies with the terminal. Prefer the unit.

`serve.ts` still loads `src/*.ts` once at boot, and that is still what makes a stale process report
a fixed bug as broken. The check is unchanged:

```bash
systemctl --user show anansi.service -p ActiveEnterTimestamp
git log -1 --format='%ad' --date='format:%a %b %d %H:%M:%S %Y'
```

---

## 2 · #25's model panel — delivered

`TITLES.model`, `PANELS.model()`, `data-modelinfo` on each row of the rail's model list, and the
switch (`data-pickmodel`) moved onto the panel — which is what checks.md asked for: *"a sub
heading when you click it that opens a panel with the model information … then a switch button
done there."*

**Four sources, each named on the panel**, because a number whose provenance is off-screen is a
number nobody can check: the router says loaded/asleep, `presets.ini` says the context and how many
ways it is cut, the `generations` table says the measured speed and the run count behind it, and the
id itself says purpose, thinking and decensoring — once decoded.

- **`modelName` now reads the 2026-08-27 convention.** `MODEL-VERSION-CODE-SIZE[-NN]`, where the
  CODE segment is the only all-caps one. `Qwen3.6-WNTH-35B-A3B-NN` used to render as
  "Qwen3.6 WNTH 35B A3B NN" — every fact encoded, none of it read. It now yields
  `Write · no thinking · decensored · 35B-A3B · novel tier`.
  **H absent is not "censored"**: presets.ini is explicit that Wayfarer-2 and Muse were trained open
  and never censored, and the panel says `trained open`. An assertion holds that line.
- **`BLURB` in `web/model.js` is the only hand-written part**, keyed by the decoded family, and
  every line of it is quoted from the stanza comments in `/data/models/presets.ini`. A family with
  no blurb shows the decode alone rather than a guess. `ponytail:` marker on it names the ceiling:
  a hand-written map is what the last rename emptied silently, so `test/app.ts` walks the ten live
  preset ids against the map **both ways** and goes red if either side moves alone.
- **It is the one panel that opens with no story open.** It is about the box, not about a book, and
  the rail footer that opens it is on screen out on the shelf too. `drawSide`'s gate carries the
  exception and a test asserts both halves of it.
- **For the model that is loaded, the running server wins over the file.** `presets.ini` says
  `ctx-size 100000 / parallel 2` = **50,000**; llama-server rounds its own allocation and reports
  **50,048**, which is what the rail footer directly under this panel has always shown. Two numbers
  for one budget, forty-eight apart, an inch apart on screen — this repo's own recurring failure.
  The file is the plan and the server is the truth, so the loaded model reads `SRV.slot` and the
  caption names which of the two was read.

**Ten falsifications, all red on the named assertion**, then green again: the CODE regex broken, a
blurb key renamed, the panel showing `ctxSize` instead of `perSlot`, the thin-sample clause dropped,
the silent-source note blanked, the no-blurb fallback dropped, `drawSide` re-gated on a story, the
rail row put back to `data-pickmodel`, the running server never preferred, and the running server
preferred for every model rather than only the loaded one.

`test/app.ts` 43 checks, `test/web.ts` 25 — the two suites that read `web/`. `bench/sweep.ts` finds
no dead control for the new action.

### The same decode on every surface that names a model

Seth, 2026-08-29: *"do the storyteller and bar label surfaces too we need the uncensored writing
roleplay and the nn label on all three panels."* #25's "bar label" is the rail footer's own label —
checked against `ca2c613`, the commit the issue was filed against, where `:371-378` was the model
list and `:360-386` the footer around it. **The header bar has named no model since 2026-08-27**,
deliberately, and it still does not.

So the three are the **rail label**, the **rail list**, and the **Storyteller** — plus the panel.

- `modelName` now returns `bits` (the badges) and `size` **separately**. The badges are purpose,
  `uncensored` / `trained open`, and the novel tier; the size is not one of them, because two of the
  three surfaces are `nowrap` strips with an ellipsis already on them and the size is the longest
  badge and the least of what was asked for there. `detail` puts the size back, before the tier,
  and it is what builds the Storyteller's `<option>` text.
- **`no thinking` is gone; `thinking` is not.** Seth, same day: *"you can remove the no thinking
  label."* It rode on eight of the ten presets and said nothing while it did — the transport pins
  `enable_thinking: false` on every call, so not thinking is the normal case and a badge for it is a
  badge on almost everything. **The house rule is unchanged**: a `T` model is still spelled out on
  every surface, because it is the difference between a passage and 900 tokens of reasoning and no
  prose, GLM-4.7-Flash honours the switch and Huihui-ThinkingCap's is UNTESTED on its architecture.
  Silence means "nothing to watch"; the word means "watch this one". Three more falsifications, all
  red: the `T` case silenced, `no thinking` put back, and the size moved after the tier.
- `decensored` became **`uncensored`** — Seth's word, and the word the old alias branch already used.
- The Storyteller reads **`V.model`**, the model the server already resolved for the story
  (`routes.ts:1044`), not `SRV.model`: that one tracks the ACCOUNT default and `loadModels` rewrites
  it from `r.active` on every refresh, so a pinned book would start naming the wrong model the
  moment the list reloaded. Its `?? SRV.model` fallback was deleted after a falsification showed the
  branch was unreachable — the panel only renders inside a story.
- It also grows a **door to the model panel** (`data-modelinfo`), which is the other half of what
  was left undone.

**One of these checks was decorative and the falsification pass caught it.** `assert.match(rail,
/uncensored/)` stayed **green** with the rail label's badges deleted — because the HTML comment
above them quotes the sentence that asked for them, and the comment is in the markup. Same failure
`test/web.ts` documents for `data-panel="anansi"`, found the same way. The checks now strip HTML
comments before matching, read the label with the list **shut**, and read the list from a slice that
starts at the first row — the label and a row render the *same* badge string for the same model, so
a check that cannot tell them apart proves nothing about the one it names.

**Six more falsifications, five red on their named assertion:** the label's badges deleted, the
list's badges deleted, the Storyteller's chips and door deleted, the size pushed back into the
badges, and no-H rendered as `censored`. The sixth — the Storyteller re-deriving from `SRV.model` —
came back **green**, which is what showed the fallback was dead; it was removed rather than tested.

**What #25 still does not do:** nothing else. Every box on the issue is ticked; closing it is Seth's
call.

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

`grep -rn "ponytail:" src web bench *.ts *.html` — **28** markers, each naming its own ceiling.
(This file said 14 and `.claude/CLAUDE.md` said 28; the grep says 28, and one of those is the new
`BLURB` map.)
