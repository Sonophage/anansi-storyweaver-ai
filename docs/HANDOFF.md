# Handoff — 2026-08-30, after the issue-clearing session and COUNCIL-06

`main` and `serial` are both at **`7eaa267`**, pushed, tree clean. Read `.claude/CLAUDE.md` first;
this file is what a cold session needs on top of it.

**One issue is open: #9, and it is open on purpose.** Everything else on the board is closed.
§8 is the prompt-stack work that followed the issue clearing; read it before touching a prompt.

---

## 1 · Restart the live server — how, and why it is not what the last handoff said

`serve.ts` loads `src/*.ts` **once, at boot**. Only `web/*.js` is served fresh per request. Before
debugging any report of "it still does X", check the server's start time against HEAD.

```bash
systemctl --user show anansi.service -p ActiveEnterTimestamp --value
git log -1 --format='%ad' --date='format:%a %b %d %H:%M:%S %Y'
```

**The previous handoff's restart procedure was obsolete and is gone.** It said the environment "is
not in the repo and must not be" and told you to lift it out of `/proc/<pid>/environ` into
`/tmp/anansi-restart.sh`. Both halves were false:

- `~/.config/systemd/user/anansi.service` exists, is **enabled**, and reads
  `EnvironmentFile=<repo>/.env`.
- That `.env` is at the repo root, gitignored (`.gitignore:20`), and its `ANANSI_*` lines are
  **byte-identical** to what the live process runs with — diffed before a kill, not assumed.

So a restart is:

```bash
sqlite3 anansi.db ".backup 'backups/pre-restart-$(date +%Y-%m-%dT%H%M).db'"   # migrations run at boot
systemctl --user restart anansi.service
journalctl --user -u anansi.service -n 20 --no-pager -o cat                   # read the banner
```

**Read the banner every time.** A restart that loses the environment comes back on `127.0.0.1` over
plain HTTP with no allow-list and says so nowhere else:

```
Anansi        https://0.0.0.0:5174
writers       zlovlokvi@gmail.com, hellrigelkc@gmail.com
admin         sonophage
```

`/tmp/anansi-restart.sh` still works but starts the server **in a terminal scope**: no
`Restart=on-failure`, and it dies with the terminal. Prefer the unit.

---

## 2 · What is open

**#11 — closed 2026-08-30 in `7eaa267`.** It was blocked on Seth for exactly one thing — a reply of
hers that felt wrong, or a line that would have been right — and he supplied a whole voice document
instead. See §8. It carried the half of **#7** that was never tracked anywhere else.

**#9 — contradictions.** Left open **deliberately**, not unfinished. The repair now looks twice,
says what it did, and records it; Storyteller shows the fix rate over the takes where something was
actually wrong. Whether more is needed is a question the numbers can answer after a few chapters and
could not answer at all before. See §4.

---

## 3 · What shipped today, and the shape of each

Thirteen commits, twelve issues closed: **#5 #7 #12 #13 #14 #17 #18 #19 #20 #21 #22 #23 #24 #25 #26
#27 #28 #29** across the day (nine were closed by earlier sessions and audited by this one — see §5).

- **#25 · the model panel.** `GET /api/models` merges three sources: the router (what exists, what
  is loaded), `presets.ini` (`ctx-size`, `parallel`, `perSlot`), and `generations` (measured speed).
  `modelName` decodes the 2026-08-27 convention, so `Qwen3.6-WNTH-35B-A3B-NN` reads as
  *Write · uncensored · novel tier*. **H absent is never "censored"** — presets.ini says those
  models were trained open. `no thinking` was dropped at Seth's word; **`thinking` stayed**, because
  a `T` model is the difference between a passage and 900 tokens of reasoning.
  For the loaded model the **running server outranks the file**: presets computes 50,000, llama
  reports 50,048, and the rail footer already showed the second.
- **#17 · covers, drawn.** Pinterest's API cannot search Pinterest (`/v5/search/pins` reads only
  pins you have saved), so this is `pollinations.ai`: no key, no account, open CORS, so the browser
  fetches the bytes and there is **no server route**. The free tier holds **one request in flight
  per IP** and throttles after the first (2.6s, then ~45s), so it draws **one per press**. The
  premise never leaves the machine — genre and the first sentence of the setting only.
- **#24 · what changed is a file.** `docs/WHATS-NEW.md`, parsed by `src/news.ts`. The model call,
  `commits()`, the RELEASE prompt and the `release_notes` table are all gone; its five batches were
  written into the file first. **`.claude/CLAUDE.md` now carries the convention**: anything a writer
  would notice goes in that file, in the same commit, in their words.
- **#27 · a thread read against the whole book.** Entity-scoped in code, not only in the prompt:
  passages are filtered by `fires` on the title, and any proposal that would land elsewhere is
  dropped **and counted**. It reads the most recent mentions to a budget and says how many of how
  many — the informative denominator.
- **#22 · threads.** Opens on one book with the shelf a press away; rooms filter under a picked
  kind; a card's face reads body → what is on → **a second section for what is not**; finishing
  lives on the form and the face carries a quiet marker.
- **#20 · seeding.** A new book can copy threads out of the library at creation, through
  `POST /api/entry/copy` — the route a single card already used, where `db.copyEntry` refuses unless
  both books are yours.
- **#18 · the harness.** The style library is `prompt_overrides` with a namespaced key
  (`voice:<name>`), so it inherits the scoping `test/scope.ts` already proved. **The writer's global
  default voice finally has a surface** in Storyteller — only the two spark buttons ever read it,
  while the server backfilled it into any book created with the box left blank. Plus `Entry.wearing`
  deleted, three stale outfit comments and `docs/PROMPTS.md` §2/§4 corrected against the code, and a
  dead model pin marked on the shelf.
- **#21 · the wizard.** Eight steps in the order the issue names. The spark is **two calls** now
  (scaffold, then cast for the kinds you want — "none" is finally expressible), each re-rollable,
  plus a **second look** at step five that proposes and never applies.

---

## 4 · #9, and why it is the most interesting thing here

**The feature it asks for already existed.** `mend()` has checked each passage against canon and
corrected it before delivery since **2026-08-25**, three days before the report. A stale server was
never the explanation.

What the live library said: **eighteen violations, every one on a model-written passage.** Every one
went through the repair and came out still contradicting. The machinery was not missing — it was
**unverified and invisible**:

- it never looked twice, so `mended` counted repairs *attempted*, not repairs that *worked*;
- nothing was recorded, so nobody could say how often it fired or worked;
- the counts were returned to the browser, **which ignored them**, so a failed repair looked exactly
  like a clean passage.

All three are fixed. **And a falsification found a real hole:** `contradictionsIn` fails two ways —
it throws on a dead router, and it *returns* `{found: [], error}` when the answer will not parse,
which is **the same shape a clean passage produces**. Reading only the thrown one meant an unusable
reply was one line from being reported as "the contradiction is gone".

---

## 5 · The audit of what was closed, and what it found

Everything closed on 2026-08-29 was checked **against source, not against its own closing comment**.
Ten held up. **#26 did not**, and was reopened:

- its note said *"Search — `@` added"*. It was not: `AT_BOX` has exactly two members and the search
  panel has no `atlist`. **A false claim in a closing record is worse than an open box**, because
  the next session reads it and does not check.
- its thread-type filter bullet was never mentioned either way.

Both were then answered by Seth — `@` dropped, pinning is per-chapter — and #26 closed again.

---

## 6 · Rules this session re-learned the hard way

- **A backtick inside an HTML comment closes the template literal it lives in.** Hit **four times
  today**, every time while writing a comment *about* the code in the house style. There is now a
  lint in `test/web.ts`, **above the parse check on purpose**, that names the comment and its line
  instead of `Unexpected identifier` somewhere else entirely.
- **Six of my own checks could not fail**, and the falsification pass caught all six. The pattern
  worth carrying: a check that matches its own documentation (`/uncensored/` matched the comment
  quoting the request); a check on the whole page when the fixture makes the string true anyway; a
  check that names a save route by URL when the falsification calls a method that does not exist and
  throws inside an unawaited handler; a rule living in `app.js`, which exports nothing, where its
  most important case cannot be staged at all.
- **A green falsification is not always a decorative check.** Twice it was a `sed` that did not
  match, and once it was a real hole in the code. Read the diff before believing either.
- **`test/scope.ts` binds a fixed port 5187 and a fixed `/tmp/anansi-scope.db`.** Two overlapping
  runs collide and it reports failures that are not there. It cost time once today.

---

## 7 · The live library, and the state of the box

`docs/WHATS-NEW.md` is the app's own release notes and was written as the work landed — it is the
best short account of what a writer would notice.

`grep -rn "ponytail:" src web bench *.ts *.html` — **28** markers, each naming its own ceiling. Two
are new: the hand-written `BLURB` map, and the cover draw having no server proxy (if pollinations
closes its CORS header the fetch fails in the browser and nothing on this box can see why).

Branches: `main` and `serial` only. `night-2026-08-29`, `surface-round-2` and `ui-overhaul` were all
fully merged and are deleted, local and remote, along with the `anansi-night` worktree.

**Verification**: `node --experimental-strip-types test/all.ts` — eleven suites.
`test/ui/run.sh` — **thirteen scenarios, 600 checks**, and it needs chromium and no model. Both were
green at `c12f49a`.


---

## 8 · COUNCIL-06, and the six ships that came out of it

`docs/findings/COUNCIL-06.md` is the record: five seats given the exact `SYSTEM`, `DEFAULT_VOICE`
and mode prompts read out of source, plus this project's findings. It found that of ~50 standing
instructions, **four have ever been measured**, and that four items in the proposal it was asked to
review describe text that does not exist in the app.

Six ships, `5973498` through `7eaa267`. Each that changes bytes on the wire is its own commit, so
`bench/drift.ts` can attribute a regression to one at a time.

1. **`CAPS.SPINE` 400 → 1000.** Not a preference — at 400 `The Geometry of Absence` was losing the
   back half of its setting on **every call**, cut mid-sentence. Its spine is ~716 tokens raw.
2. **Deleted `Match the established voice. Do not escalate register on your own.`** The only
   deletion in the whole council with a number behind it: F37 measured its arm at 98.0 against 98.0
   and concluded the model was never overriding the voice field, it was following it exactly.
3. **The voice is always sent.** Two imported books had an empty `writing_style` and sent no voice
   at all. `voiceOf(owner)` in `story.ts` is a runtime ladder — story → the writer's saved default →
   shipped — applied at `assemble()`, not a migration: `db.createStory` has three callers and only
   one backfilled, so a migration would plug the rows and leave the paths open.
4. **The prose sample is gone** — prompt, UI and column. F36 is the argument: finished English in a
   prompt is lifted verbatim into the prose. It was empty on all nine books and never measured.
   VOICE is one `keep: true` part now, so it can no longer trim — it refuses and says so.
5. **The craft left `SYSTEM` for `DEFAULT_VOICE`.** Shipped the other way first (`8951779`) and
   **corrected on Seth's word** in `5c11ee3`: *"it's default for a reason so it can be overridden."*
   `SYSTEM` 430 → 235 tokens and keeps only what replacing a voice must not switch off — output
   format, canon arbitration, object permanence, the frame. `CAPS.VOICE` 500 → 1000 in the same
   commit, because the craft section alone is 274 tokens and VOICE is all-`keep` since ship 4: over
   cap it is **dropped whole**, not shortened.
6. **#11, Anansi's speaking voice**, in `TALK` and no other role. See the issue and the header
   comment above the constant.

### What only Seth can settle

- **The seven bespoke voices were backfilled by hand** on 2026-08-30 at 08:15Z — the craft section
  appended to what each book already said — so nothing lost a rule it had that morning. If any of
  those books starts reading wrong, that append is the first thing to try removing, and it is his
  call, not a measurement.

  **The state before it is `backups/pre-craft-backfill.db`, and that file is a restored copy.**
  The original was taken at 08:15Z and then deleted by `backup()`'s own prune — see §9. It was put
  back from `/data/anansi-backups/anansi-2026-08-30T08-04-28-514Z.db`, the last off-disk snapshot
  before the backfill, eleven minutes earlier; `integrity_check` is ok and all seven bespoke voices
  in it are pre-append. **Nothing happened in those eleven minutes**, checked rather than assumed:
  zero rows written to `passages` or `entries` in the window, and the snapshot matches the live
  database on every count that the backfill did not touch — 2,026 passages, 465 entries, 21
  chapters. Ship 4 had already landed at 07:53Z, so `voice_sample` is gone from it too.

  Verify a snapshot rather than trusting its name — the two are eleven minutes apart and only the
  content says which side of the line it is on:

  ```bash
  sqlite3 <file> "select title, writing_style like '%Sentence and image:%' from stories"
  ```

  It is safe where it is now: since `e919c1e` the prune only touches names it wrote, so a
  hand-named file in `backups/` is left alone. The off-disk copies roll at `keep = 14` and today
  that is a few hours, so nothing there should be treated as durable.
- **Six lines of his craft block were left out**, each with a stated reason, pinned in `test/db.ts`.
  Overruling one means deleting its row, which means reading why first. One of them —
  *"Begin in action or sensation"* — was already shipping and is now gone.
- **Nothing in ships 1, 3, 4, 5 or 6 is measured.** The honest claim is that the prompt says what he
  wanted it to say and that he can now change it. Not that the prose reads better.

### Nothing left over

Both of the discrepancies this session flagged were real and both are fixed — see §9 for the
backup, and the banner now reads `library 9 stories · sonophage 7, kia 2`. It had been counting
`listStories(owner(DESK))`, which is one writer's shelf, and calling it the library.

### Traps this round paid for

- **`db.updateStory(id, s)` takes TWO arguments.** Calling it as `(id, ownerId, patch)` makes every
  field fall back to its current value: the backfill printed seven successes having written nothing,
  and only a read-back caught it. There is no ownership check inside it — `serve.ts` is the gate.
- **A check can pass while reading the wrong thing.** `/Say ([^.]+)\./` over `TALK` matched a
  diction list nine lines above the list it was written for, so the images check compared the wrong
  two sets and went green. It was visible only because the falsification did **not** go red.
- **Fixtures must grow with the cap they test.** Twice in one day: `repeat(30)` stopped overrunning
  `SPINE` at 1000 and `repeat(90)` stopped overrunning `VOICE` at 1000. A check that quietly stops
  reproducing its own condition passes forever.


---

## 9 · The backup that was deleting backups, `e919c1e`

`backup failed: ENOENT … backups/anansi-<stamp>.db` had been in the boot log on **all twelve
recorded starts**. The stat that failed was `backup()`'s own, on the file it had written four lines
earlier.

The prune filtered on `.endsWith('.db')`, so **every** database in the directory was a candidate
rather than only the ones it wrote. Names sort, and `pre-` sorts above `anansi-` reversed: twelve
hand-made `pre-restart-*.db` files filled all twelve keep-slots, so the snapshot each call had just
written was the thirteenth. One line at the filter — a file this function did not write is not its
business.

**The half that failed loudly was the safe half.** A hand-made file whose name sorts *below*
`anansi-` was pruned with no error at all: the call returns, the log says `backup 7104 KB,
keeping 12`, and a snapshot taken before something risky is gone. That is what happened to
`pre-craft-backfill.db`, which §8 had named as the way back from a change to seven live books.

**What to take from it beyond the fix.** The repo `backups/` directory is safe to hand-name a file
in now, and it was not before. `/data/anansi-backups` was never affected — it holds nothing but
`anansi-*` names — but it rolls at `keep = 14`, and on a day with this many restarts that is a few
hours of history, not a few days. Neither directory is an archive. Anything that has to survive
gets copied somewhere neither pruner looks.

Three assertions, each falsified against a different broken filter, and the second one needed its
own scenario: under the original bug the ENOENT throws before a silent deletion could be asserted,
so the fixture for that half is named to sort **below** `anansi-`. One bug, two failure shapes, two
setups.
