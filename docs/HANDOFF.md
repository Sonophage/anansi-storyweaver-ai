# Handoff — 2026-08-30, after the issue-clearing session

`main` and `serial` are both at **`c12f49a`**, pushed, tree clean. Read `.claude/CLAUDE.md` first;
this file is what a cold session needs on top of it.

**Two issues are open and neither is blocked on code.** Everything else on the board went today.

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

**#11 — Anansi's two registers.** Her voice when speaking to *the writer* (a god to a fellow
storyteller, mischievous) versus when composing prompts *for the model*. **Blocked on Seth**, and on
one specific thing: a reply of hers that felt wrong, or a line that would have been right. Without
it the work is tuning against taste and calling it done, which is what F37 exists to prevent. It
also carries the half of **#7** that was never tracked anywhere else.

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
