# Traps

Things that broke a session before. Each is still true until a check catches it; when a
check exists, delete the line. Dates are when it last happened.

## Live data and the server

- **A later hem writes INTO an earlier hem's state row for the same chapter** (same thread, same
  `from_chapter`): undoing the earlier hem by deleting its `entry_states` row deletes the later text too
  (it happened on ENCORE 11-06; restored from the backup). Before undoing a hem by hand, compare each row
  you delete with the later hem's accepted cards.
- **Deleting a scene deletes every proposal on it** (`delChapter`), including Workbench correction cards
  filed under the open scene: move the open ones to another scene first.
- **Restoring a deleted scene**: `delChapter` cascades passages → passage_revisions, chapter_pins and
  hems, and deletes proposals by hand. Back up the live file first, then in one `BEGIN IMMEDIATE`
  with `foreign_keys=ON`: `ATTACH` the half-hourly backup and `INSERT INTO main.X SELECT * FROM b.X`
  for chapters, passages, passage_revisions, proposals, hems (check columns match). The FTS triggers
  re-index. Check first that nothing in the tale changed after the delete (ordinals, a reopened scene).
- **A scratch server on a copy of the live library** answers as Seth from loopback: `VACUUM INTO` a
  scratch copy, `ANANSI_DB=<copy> ANANSI_PORT=5302 … serve.ts`, then `curl -s -X POST
  http://127.0.0.1:5302/api/manifest -d '{"storyId":…,"count":false}'`. `generations.manifest` holds
  what each call actually sent (blocks, `reason`, `firedBy`).
- **Importing src/routes.ts from a script with no ANANSI_DB opens the live library.**
- **`upsertAddon` clears a pocket's wake words when `keys` is left out**: hand them back on every save.
- **`db.entriesOf` rows carry no addons**: `alwaysTrue()` on one is always "" (the 11-11 bug). Use the
  book's `v.entries` (from `bookOf`) for anything that reads pockets.
- **A stopped take writes NO passage**; its text is only in `stopped_takes`, and only for a reroll.
- **A tale's own look outranks the writer's** inside that tale (ENCORE's is romance on live).
- **`systemctl --user stop a b c` stops nothing if one unit is not loaded**: stop them one by one.
- **`data-kind` is an ACTION**; **`POST /api/settings` names a story**; **`/api/generate` (not
  streamed) SAVES the passage**; **two local slots** (a third call 500s); **Featherless refuses a
  second concurrent call**.
- **A multi-word key needs every word, in order, ≤2 words between** (`fires`, KEY_SLACK); matching
  is case-blind.
- **`fromText` is the one reader of every remote hem answer**; an invented shape fails silently.
- **A cap on the setup draft (SETUP_THREADS 30) is for the prompt only**: anything made from the draft
  must use the page's own Start body, not the capped copy.
- **Changing `MODE_WORDING` does not reach Seth**: his saved wordings (`prompt_overrides`, owner
  `u-13pi02b1`, keys continue/speak/act/narrate/direct) replace the defaults whole. Change both.

## Unit tests

- **A Talk test's own trigger word is in the message**: test/talk.ts fakes answers by the token after
  `CHANGE-`, and `askedOf` reads the whole message, so "CHANGE-PASSAGE" made "passage" heard. Name fake
  keys so they hold no word the rule listens for (PROSEEDIT, LOREOUT, RENAMEIT).
- **test/app.ts's `click` gives a target with no `closest`**: a handler that calls `t.closest(...)`
  throws there; use `t.closest?.(...)`.
- **test/web.ts wants every `data-*` action on the ACTIONS list in web/app.js** ("carry no action
  attribute"): register a new press there.
- **A break test whose assertion has no named label** looks green to a `[A-Z-]+` grep: name every
  assertion.
- **Unit tests pin attribute ORDER**: `<img src=` (test/app.ts `src`, loosened to `<img\b[^>]*\bsrc=`),
  `id="pk-name" value=`. Put new attributes after the ones a test reads.
- **An HTML comment followed by code on the same line** (`-->\`;`) fails test/web.ts: use a JS comment.
- **test/app.ts's fake server keeps nothing**: a test of what happens AFTER a save has to change
  `STORY`/`MANIFEST` itself.
- **test/app.ts**: virtual clock; `html(id)` of a parent does not see a child's later innerHTML.
- **Backticks inside an HTML comment in a template literal end the string.**
- **A test's fake-model tag sits in the writer's message** ("ABOUT-X: Hem this scene."): a rule that
  reads the whole message or a sentence start sees it. Put the tag after the sentence, or key the fake
  on the exact message.
- **Node's fetch strips a trailing CR from a header value**: a key test with a CR in the file proves
  nothing about trimming. curl does not strip it (NanoGPT 401'd a pasted key with two CRs, 11-09).
- **A `/g` regex used with `.test()` keeps `lastIndex`** between calls and answers false on the next
  string (bench/prompt-audit.ts's STOCK, 11-11). `/g` only with `match`.

## The browser harness

- **`run.sh` filters its output**: `grep -c '^ *ok'` on it counts 0; read its summary line
  (`deleted 28 ok, 0 red`). A GPU-gated scenario (ritual) runs nothing under `--no-gpu`.
- **Finding a thread by `textContent`** matches the cards that MENTION it (Aldis's text names Marek):
  match `.platename`.
- **`bench/drive.ts` cannot open a `file://` page**; use headless chromium `--screenshot`.
- **`.headadd` IS the + to test/ui** (newthread.js, threadlist.js); other head buttons need their own
  class (Alter's ＋ is `.headmore.headplus`).
- **A full browser run serves web files from its worktree per request**: do not edit there mid-run.
- **Never remove a worktree a background harness is running from**: it dies on `uv_cwd` ENOENT (11-09).
- **A falsify run leaves a red in the harness record** and the pre-commit hook (test/web.ts) refuses
  the commit until a green rerun of that scenario in the same worktree (11-09, finder).
- **run.sh prints only the last 6 lines of a DIED scenario**: the reds before the crash are hidden; widen
  `tail -6` for one run (do not commit it) to see them.
- **Piping `run.sh` through `tail` hides reds**; the truth is `/tmp/anansi-ui-results-<hash>.json`.
- **A browser test's static check wants literal `data-*` on every `<button`, and type ≥ 11px.**
- **The browser harness records results per worktree** (`/tmp/anansi-ui-results-<hash>.json`) and
  test/web.ts fails the gate while that worktree holds a red: a green rerun in THAT worktree clears it.
- **Headless screenshots after the app boots**: `--screenshot` fires before the fetches paint; use a
  CDP script (navigate, wait ~6 s, `Page.captureScreenshot`). A copy of the library with
  `writer_look` set and the tale's own look cleared shows a theme without touching anyone's device.
- **The fake router answers unwoven prose in two pieces** (PROSE_MS): a scenario that waits for "no
  ghost" must first see the ghost appear (`landed()` in inline.js), or it races.

## Benches and measurement

- **A point where the failure is 100% cannot show a fix that lowers its rate** (F79): pick an A/B point
  with headroom, or measure density.
- **Importing `bench/repetition.ts` runs its real Featherless run** (top-level code): import the
  detector from `bench/echo.ts`.
- **A bench that writes through a server must check the server's open library**, not only the path it
  was given (`bench/talk-replay.ts` reads the pid on the port and its /proc fds).
- **A bench guard that refuses after a ship is right**: `bench/act-react.ts` and `bench/narrate-replay.ts`
  look for the OLD line in Seth's saved wording, which changed when their result shipped; they now stop
  with "no longer has the line". Write a new bench (on `bench/scene.ts`) for a new question.
- **A write into a copy, then a manifest, is how every A/B checks its arm**: confirm the arm's line AND the
  writer's text are in `POST /api/manifest`'s prompt before the first take (all four benches do).
- **Asking Ornith to judge what belongs to "another tale" fails both ways** (F78): it stripped a tale's
  own true lore and missed the clear case. Code that finds the names was harmless but barely acted.
- **A model yes/no judge (hi-semif) on Ornith said "reacts" for 18 of 19 Act takes** including 3 of Seth's
  4 flagged: it is not a detector here. Word rules validated both ways on Seth's marks were.
- **A detector built on a run's own takes is confirmed on a second run with it frozen** (F75 did two).

## Git, the shell and tools

- **A `Closes #n` in any commit closes the issue when it reaches GitHub's main**, whatever the tracker
  rule said at merge time (#170, 11-13).
- **One git stash list serves every worktree**: never `git stash` in a worktree; commit.
- **`ss … | xargs kill` to stop a scratch server**, never `pkill -f` a pattern in your own command line
  (it killed the shell again 11-06 and 11-09, exit 144).
- **Fish is Seth's shell**: a one-liner for him to paste must be fish-safe or wrapped in `bash -c '…'`.
- **Python edit scripts and backslashes**: a `\b` in a non-raw Python string is a BACKSPACE byte
  written into the source (it happened 11-04). Use raw strings, and grep `[\x00-\x08…]` before committing.
- **The ste-lint script prints a count, not which rule fired**: `ste-lint.py` has no verbose flag.
- **`gh issue close` worked for Claude on 2026-11-06** (it was denied before). If it is denied again, Seth runs `!gh issue close N` (no space after the `!`; with a space it arrives as text).
- **Never read `.env`**; the real model copies quoted examples; a merge commit skips the hook;
  `git checkout <file>` throws away edits (it did again 11-06 while undoing a falsify sed; copy the file
  to the scratchpad first and copy it back, never checkout); no sexual content about real people.
