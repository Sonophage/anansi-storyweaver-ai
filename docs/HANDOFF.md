# Handoff — 2026-09-03, after the explanations, co-op and docs session

> **THIS FILE WENT FOUR DAYS WITHOUT AN UPDATE.** Sessions landed on 08-31, 09-01, 09-02 and 09-03
> and none of them touched it, so everything below §0 is from 2026-08-30 and describes a tree that
> has moved a long way. It is kept because §1–§10 are still the best writing on the prompt stack and
> the ledger migration, and none of that was undone. **§0 is the only part written today.** Where §0
> and a later section disagree, §0 was the one checked.
>
> If you want what is BUILT rather than what to read first, that is
> `docs/findings/BUILD-STATE.md`, which has an audited 2026-09-03 section at its end.

---

## 0 · What a cold session needs first, 2026-09-03

**Read `.claude/CLAUDE.md` before this file.** Then three things that cost time today:

1. **`node --check web/app.js` does not check `web/app.js`.** There is no `package.json`, so node
   reads `.js` as a script and it exits **0 on a file that does not parse** — verified against a
   genuinely broken one, after using it as a gate all session for nothing. The real check is
   `node --check --input-type=module < web/app.js`, which is what `test/web.ts` does.

2. **`test/ui/veil.js` is in the DEFAULT scenario set and drives real generations**, despite
   `run.sh`'s own comment saying `model`, `ritual` and `veil` are excluded. The comment is wrong;
   the list has `veil`. It fails under load and passes on a quiet box **at the same commit** — it
   died mid-scenario on one run and reached its verdict on the next. Two consequences: a red there
   is not evidence until you have run it alone on an idle machine, and running the default set
   **competes with whoever is writing** on the shared two-slot router.

3. **`test/web.ts` refuses a recorded browser red.** It reads `/tmp/anansi-ui-results.json`, so a
   `test/ui/run.sh <one-scenario>` that goes red leaves `test/all.ts` failing until the harness is
   run again. That is the harness working, not a regression — the message says so.

**Where things live now.** `docs/SPEC.md` was archived today: it is `docs/archived/SPEC.md`, it is
not a live reference, and four of its §15 gaps were carried to `docs/checklist.md` rather than being
closed by moving a file. The debt ledger is **51 markers** — count it, never carry the number
forward; it has drifted twice in two days.

**What landed today**, all pushed to `main`: explanations folded behind one mark above the control
they explain; labels in real capitals; the Chapter panel in four groups; a fuller writing record;
seeds on every generation; a live region for screen readers; the ring up for every model call; a
light along the top when something is owed; and **co-op** — a book with a second writer, a mode that
writes without asking the model, and a turn that says whose move it is without ever blocking.

**Two known gaps in co-op**, neither hidden: `writerStats` still counts only books you own, and a
shared passage says a second hand wrote it but not whose.

---

**There is one branch now: `main`.** `serial` was deleted, local and remote, at the end of this
session on Seth's word — it had been level with `main` all day and a second name for the same commit
is a thing to keep in step for nothing. Read `.claude/CLAUDE.md` first; this file is what a cold
session needs on top of it.

**One issue is open: #9, and it is open on purpose.** Nineteen commits landed today on top of the
last handoff. §2 is the prompt stack and you must read it before touching a prompt; §5 is the
ledger migration, which is the largest change to the writer's own data this project has made.

---

## 1 · Restart the live server

`serve.ts` loads `src/*.ts` **once, at boot**. Only `web/*.js` is served fresh per request. Before
debugging any report of "it still does X", check the server's start time against HEAD.

```bash
sqlite3 anansi.db ".backup 'backups/pre-restart-$(date +%Y-%m-%dT%H%M).db'"
systemctl --user restart anansi.service
journalctl --user -u anansi.service -n 20 --no-pager -o cat      # READ THE BANNER
```

**Read the banner every time.** A restart that loses the environment comes back on `127.0.0.1` over
plain HTTP with no allow-list and says so nowhere else. What a good one looks like:

```
  Anansi        https://0.0.0.0:5174
  writers       zlovlokvi@gmail.com, hellrigelkc@gmail.com
  admin         sonophage
  model         Qwen3.6-WNTH-35B-A3B-NN
  context       100096 / 2 slots = 50048 per slot
  library       8 stories · sonophage 4, demo 2, kia 2
  backup        8244 KB, keeping 12
  off-disk      /data/anansi-backups, 8.1 MB, keeping 14
  book export   /data/anansi-books, 8 books, daily
```

*(Copied off a real restart on 2026-09-03, not from memory. The 08-30 version of this block was
five lines and the banner prints nine — a "what a good one looks like" that is missing half of it
teaches you to accept half of it. The counts drift; the SHAPE is the thing to check.)*

`~/.config/systemd/user/anansi.service` is enabled and reads `EnvironmentFile=<repo>/.env`, which is
gitignored. **Give a boot ten seconds before you curl it** — a `curl` fired in the same command as
the restart returns `000` and looks exactly like a failed start. That cost a diagnosis today.

---

## 2 · The prompt stack, and the two rules about it that are now measured

`docs/PROMPTS.md` is correct as of today and says which of its own numbers are stale-prone.

**`SYSTEM` is the contract; the voice is the craft.** Ship 5 put the craft in `DEFAULT_VOICE` where
a writer can delete it. That division is checked in `test/db.ts` both ways, and a five-word overlap
check catches a rule said in both places — the un-deletable case wearing a disguise.

Shipped today:

- **`<mode>` is fenced.** `TAG` covered 7 of 11 kinds, so a prompt ended with the last sentence of
  the novel, one newline, then an order in the same visual register. Nothing is claimed for it —
  F29 has the mode checklist at 10/10.
- **The canon-uncertainty clause**, one line in `SYSTEM`. Free, unmeasured, accepted by COUNCIL-06.
- **The dialogue rule**, in `DEFAULT_VOICE` under `Dialogue:` and backfilled into the seven bespoke
  voices. It is **permission-shaped on purpose** — *"A plainly functional exchange is legitimate; do
  not inflate one into significance."* COUNCIL-06 struck the ban version because it kills the flat
  domestic exchange. `test/db.ts` reds if it drifts back into a ban.
  It spent one commit in `SYSTEM` and Seth moved it: *"move it and backfill."*
- **`LEDGER_REGISTER`**, one definition of what a card body is, carried by all five roles that write
  one — `INVENT`, `MEMORY`, `EXTRACT`, `CAST`. They disagreed: two asked for "one paragraph", which
  is a request for prose. **It must never appear in `SYSTEM` or `DEFAULT_VOICE`** and a test says so:
  telling the writing model its output is notes is the one place this would be a disaster.

**F48 is new** — `docs/findings/P0-FINDINGS.md`, the COUNCIL-06 base rate, n = 60, one arm, no
prompt change. **Three of the four counters are dead on arrival**: non-POV interiority (0/60 named,
under 5%), unasked scene-closing beats (0/60), object continuity (5.9% on a 34/60 denominator). The
one survivor is crowd attribution, and **the counter to pre-register is 2b** — two consecutive
unattributed lines at 52.2% — not the `said` share and not a ban.

It was measured against `064ff14` and the finding says so with the prompt's sha256. `src/render.ts`
has moved three times since. Do not compare a new number to it.

---

## 3 · The card-length bug, which is the one worth understanding

`INVENT` had a branch for `outfit` — 40 to 80 words, "clothes only" — and `outfit` was the ONLY
addon when it was written. Every room added since (interiority, appearance, voice, relationships,
history, role, facts) fell through to the **whole-card** branch: whole-card framing and whole-card
length. That length went 60-120 to 120-200 words on 2026-08-27 at Seth's request, which is right for
a thread proposed to the queue and asks for a **1,200-word person** when applied to eight rooms.

Fixed: three bands now — whole card 120-200, one room 40-80, an outfit 40-80. The room branch also
SAYS it is one room of a card, because the model cannot see the other seven from inside the call.

`INVENT_TOKENS` did NOT move down with the ask. A smaller ask inside a larger ceiling is safe; F25
is about the opposite pairing.

---

## 4 · Two defects found sideways, both real

**`narrationOnly` handed cut-off dialogue back as narration.** Every quality check reads it — eleven
callers — because only the narrator commits the story. The pattern required a CLOSING quote, so a
generation that ran out of tokens mid-line left an opening quote with no partner and that span
scored as narration. 46 of the 1,986 live passages are in that state.

Both candidates were measured against all 1,986 before shipping: end-of-text closes a span (46
change, 0 regressions) versus end-of-line (50 change, **4 real speeches broken**). The line-anchored
one is what I reached for first and it is not what shipped. **The test that rejects it is in the
suite.** `routes.ts` had its own copy of the regex and inherited the same bug; it takes spans from
`quotedSpans` now.

**A card edit could not stale a chapter summary.** `summaryStale` hashes the PASSAGES a summary
covers, so it fired when prose changed under a summary and never when the ledger did — a summary
saying Halsey wears the Ashford coat went on saying it in every prompt forever. That is the exact
failure its own comment describes, through a door nobody watched.

The rule is narrow on purpose: **a summary is stale only when a fact IT MENTIONS has LEFT the card.**
Not on any text change — a stale summary is dropped from the prompt until re-run, so a false positive
costs real context and a model call. It marks stale by nulling the hash, which `summaryStale` already
treats as stale: no column, no migration, one definition of stale.

---

## 5 · The ledger migration, and the three things Seth decided about it

`bench/compact.ts` — report, then `--propose` (model, writes a review file), then `--write` (applies,
after a hand-named snapshot). Three modes because a model sits between the before and the after.

**Where it ended up:** his seven books went from 41 over-band rooms to 9, and those 9 are 82 to 120
words against an 80-word line — the model returns them unchanged and is right to. Every applied
rewrite kept every name and number it started with. **Zero summaries staled at any point**, checked
before and after each of four applies, which is §4's fact rule paying for itself.

**Three decisions, all his, all closed:**

- **The nine remaining rooms stay as they are.** 216 words above the band in total. There is nothing
  left there worth a model call.
- **`EXPORT` and `Heretics Reign` are left alone**, and are back in the SKIP list with the reason
  written beside them. They are not heavy hand-written cards; they are encyclopedia entries the
  importer wrote, a median of TWELVE distinct facts a room and up to twenty-five. 73 of their rooms
  compacted cleanly and the rest cannot reach 40-80 words without dropping canon — a property of the
  cards, not a failure of the prompt. Their canon sits at ~3,600 tokens each and it is honest.
  **Removing those two names re-opens a question that was closed on evidence.**
- **`interiority` is not merged.** Halsey carries four active interiority rooms, 506 words, all in
  every prompt. Merging them would let the chapter-close pass actually update them — `roomOffer`
  targets the first active room in a slot, so three of her four are frozen — but Seth said keep it
  as it is. It is a real structural question and it is parked, not forgotten.

---

## 6 · Traps this session paid for

- **A misread instruction is worse than a bug, because it is confidently executed.** "keep the facts
  thats where its good" was read as the `facts` SLOT and 22 rooms were reverted that should have
  stayed. It meant the facts SURVIVING the compression. Both directions are cheap here only because
  the review file keeps the original beside the rewrite — build the undo before you need it.
- **A prompt "fix" made things twice as bad and the numbers caught it.** Naming the room's current
  length in the compaction prompt took it from 22/41 clean to 9/41. Reverted, with the numbers
  written above the constant. There is a `--limit N` now: a wording change should cost 20 rooms and
  eighty seconds, not 354 and twenty minutes.
- **A stopword list is the wrong shape for "is this a name".** It held back 89 of the first 140
  rewrites on words like `Upon`, `During`, `Despite`. ANY word can open a sentence, so no list is
  ever finished. The rule is positional now — a capitalised word is a name when it appears somewhere
  a sentence does not begin — and it was validated against 348 real rooms, both directions, no
  misses. **The card's own label is added back by name**, because it sits exactly where a sentence
  begins.
- **`m[1]` is `""` when `^` matches, not `undefined`… except at index 0, where V8 reports
  `undefined`.** An optional group whose first alternative is `^` cannot be used to ask "did a
  sentence begin here". Slice the text and look.
- **A test file's own count can lie.** `console.log(n + " checks passed")` sat above two appended
  blocks in `test/report.ts`, so they ran AFTER the summary and were invisible to it. Same shape as
  the four inert blocks of 2026-08-24. Put the summary last.
- **A `curl` in the same command as a `systemctl restart` returns `000`.** It is a race, not a
  failure. It looked exactly like a failed start.
- **And so does `curl http://…:5174`, for a completely different reason.** The live server runs
  **HTTPS** — the banner says so, `ANANSI_CERT` and `ANANSI_KEY` are in the unit's environment — so
  plain HTTP against it is refused with the same `000` a dead server gives. Use
  `curl -sk https://127.0.0.1:5174/…`. Paid for again on 2026-08-30: three curls read as "nothing
  is listening" while the server was up and healthy.
- **A ceiling assertion should say how to retire it.** The one documenting that a card named for a
  stopword was invisible said *"if this ever goes red somebody has fixed it — delete the assertion,
  do not restore the limit."* It went red the same hour. That instruction is why it was deleted
  rather than worked around.

---

## 7 · The box

`grep -rn "ponytail:" src web bench *.ts` — **30** markers, up from 28. Both new ones are in
`bench/compact.ts` and each names its own ceiling. **Seth is checking the ledger after testing**, so
leave it alone until he has.

**Nine books, two writers.** Seth owns seven, Kia owns two. Every book renders a VOICE block; the
two with an empty voice field take the house voice at runtime.

**Report an issue now carries a tag** — Something is broken / Something I want / A question, mapping
onto `bug` / `enhancement` / `question`. The `from-the-app` label exists on the repo now; it never
did before, so every report had been filing twice, failing the first call and silently retrying
without labels.

**Verification, both green at HEAD:**

```bash
node --experimental-strip-types test/all.ts   # 11 suites, ~380 checks, ~7s, no model needed
./test/ui/run.sh                              # 17 scenarios; needs chromium, no model
```

`test/all.ts` prints its own total — trust that, not this file. **The suites bind fixed ports and
`.claude/CLAUDE.md` lists all of them**: `test/scope.ts` takes 5187 and boots servers on 5188, 5189,
5190, 5194 and 5195; `test/ui/run.sh` takes 5179; the live server is 5174. A stray server on any of
those makes `scope.ts` report an ownership failure that is not there. It cost time today.

---

## 8 · Where to pick up

1. **#9 wants time, not code.** The repair looks twice, records what it did, and Storyteller shows
   the fix rate over the takes where something was actually wrong. A few more chapters and the
   numbers answer a question that could not be asked before.
2. **F48's one survivor.** Crowd attribution has headroom; counter 2b is the one to pre-register.
   Two arms simultaneously through `bench/ab.ts`, n = 100 per arm, no peek-and-stop. Everything else
   in the council's queue is dead.
3. **`bench/compact.ts` has its own compaction prompt** rather than sharing `LEDGER_REGISTER`. One
   definition would be tidier and it was left alone mid-run rather than changed under a running job.
4. **`interiority` as a single exclusive room**, if Seth ever revisits §5. It is the only thing that
   would let the chapter-close pass update what it writes.
5. **`backup()` throws on a name collision** — millisecond timestamp, `VACUUM INTO` refuses an
   existing target. Nobody hits it; written down rather than fixed.

---

## 9 · The new-story ritual, reordered — `85ae5b3`

The **spark wizard**, not `ritualPanel()`/`setupPanel()`. Both are called "the ritual" in this
codebase and its own test files disagree about which: `test/ui/wizard.js` is the new-story one,
`test/ui/ritual.js` is the chapter-end one. Reaching for the wrong file costs a session's first
twenty minutes.

**The cast is set before you say who you are in it.** Steps 3 and 4 traded places, reversing #21 §3,
which had argued the opposite in a comment that is now rewritten rather than left contradicting the
code. The argument was right about what the writer is deciding and wrong about the order: `persona`
and `locked_character` hold NAMES, so asking before a cast exists is asking for a name `db.pinCast`
then has to police and often drop.

**The cast step takes a steer and re-rolls one card at a time.** The one-card re-roll needed no new
route and no schema change — `POST /api/spark/cast` is asked for a single kind and told which names
are staying, and the answer is spliced in. `seedList()` serves both starts now, so threads can be
pulled out of any book on the shelf.

**`stories.direction` is gone from the app and this file predates that.** No surface offers it, and
it reaches no prompt — not SPINE, not `RETIRE`, not `/api/chapter/propose`. **The column is kept**
and marked `ponytail:`: two books had written in it. Two checks hold the line — `test/engine.ts`
builds a story row that still carries a destination and asserts SPINE does not; `test/web.ts`
asserts no surface offers the field. F40 is why `RETIRE` losing its clause cost nothing measurable.

**Council 09 §1 is closed, and the answer was half a defect.** `spreroll`, `spreview` and
`spwritecast` guarded; **`spark` and `acceptSpark` did not**, and a double press on Accept created
TWO BOOKS. Both go through `whileWorking` now, and Accept carries `S.spark.accepting` as well
because `whileWorking` releases when `createStory` answers while that handler runs on through a
saveStory, a copy per seeded thread, and `loadLibrary`/`openStory`.

---

## 10 · The forge — `92350c2`

An **admin-only** page of five prompts to hand a foreign model, and a paste that reads the answer
back. Gated on `c.admin`, the flag that already decides who may stop the router.

**`src/forge.ts` is generated from `src/slots.ts` and must stay that way.** A prompt naming the
rooms of a character IS a copy of the slot table, and copies of that list drifting is the entire
reason that module exists. **Adding a room to `SLOTS` without adding a line to `ROOM_MEANING` fails
`test/forge.ts`** — that is the intended failure, not an obstacle; write the English.

It also quotes `LEDGER_REGISTER` itself rather than paraphrasing it, because a forged card is read
on every call exactly like a written one and F36 is what happens when finished English sits in a
prompt.

**A SIXTH PROMPT, `book`, WRITES THE WHOLE THING** — story fields and cast together. It fills the
WIZARD rather than creating anything, because everything else a model writes here is read before it
is kept and a book is the largest of them. `POST /api/stories` now accepts `rooms` on an entry so a
pasted cast lands complete; both doors into the format share one `writeRooms` in `src/routes.ts`, so
the drop-do-not-coerce rule has a single home.

A pasted book's persona is treated as the WRITER'S, not as proposed: `proposedCast` is sent empty,
so `db.pinCast` never has standing to drop it. Pasting is a deliberate act in a way a model's
suggestion is not.

**`POST /api/thread/paste` is the only import in this app that writes a card's rooms.** Character
cards carry none, which is why the format is new rather than borrowed. It is **not** admin-gated,
deliberately: the page is a workbench, a card in that shape is just a card, and the route names a
story so the ordinary gate covers it. Asserted from the far side with a second owner.

Strict about what it writes, generous about what it reads: a code fence is stripped and a bare body
is wrapped into the bracket form, but an unknown KIND is refused outright and **a room that kind
does not have is dropped and named** rather than coerced into a real one. Filing an invented room
under `facts` would put text into every prompt about that card that the writer never agreed to.

The wizard's steps carry the prompt each one wants — premise, voice, both card prompts — behind
`forgeCopy()`, which renders nothing for a non-admin because `FORGE` is `[]` for them. The cast step
takes a paste of its own; `readForgedCards()` in `web/app.js` reads the same shape into the wizard
where there is no story to write to, and keeps `rooms` untouched for the server to write on Accept.

**`test/all.ts` is TWELVE suites now**, not eleven — `forge.ts` joined it. The browser set is
eighteen scenarios; `forge.js` needs no model and is in the default run.

---

## 11 · Where this session leaves off

**THE ONE THING ONLY SETH CAN VERIFY, and it is the whole point of §10.** The five forge prompts
have never been run through a foreign model. Not once. What is tested is their STRUCTURE — that the
character prompt names this database's character rooms and not a place's, that both carry
`LEDGER_REGISTER` itself, that the voice prompt states F37's per-line rule — and separately that the
paste route reads well-formed JSON correctly, driven from fixtures I wrote by hand.

**The round trip is unverified.** Nobody has taken the character prompt, given it to GPT or Gemini
or a local model, and pasted what came back into `+ Thread`. So the open question is not "does the
parser work" — it does, eleven checks and six falsifications say so — but **"does a real model,
reading that prompt cold, produce something the parser accepts and a writer wants?"** Those are
different questions and only the first one has an answer.

What would settle it, in one sitting: forge one character and one place through whatever model is
to hand, paste both, and read the cards. Three things to watch for, because they are what the
fixtures could not test —

- **Does it answer with bare JSON?** The prompt says no fence and no preamble. The route strips one
  fence as a kindness; it does not go hunting for JSON inside prose, and it should not have to.
- **Are the rooms the right SIZE?** `LEDGER_REGISTER` asks for notes, not prose. A model that writes
  a paragraph per room produces a card that is technically valid and quietly ruins the context
  budget — nothing refuses it, and F36 is what happens when finished English rides in a prompt.
- **Are the keys real?** The prompt says trigger words must be words that actually appear in prose,
  not the card's own title repeated. That was the F27 failure — every invented key was the title
  again — and a foreign model has every reason to make the same mistake.

If any of those come back wrong, the fix is prompt copy in `src/forge.ts` and nothing else; the
route and the tests do not move.

1. **The image prompt knows nothing about a specific book.** It asks the foreign model for your
   genre and setting rather than reading them from the open story, the way `web/model.js`'s cover
   prompt already does in one line. Deliberate — the forge is a workspace page with no story open —
   but wiring it to the open book is small if it turns out to be wanted.
2. **`loreFrom` is still not in the wizard.** A book can follow another's ledger from the Story
   panel; the new-story ritual only offers the copy. About six lines, and it was left out rather
   than guessed at.
3. **Nothing replaces `direction` for the retirement pass.** It was the only input that could tell
   offstage from finished, F40 says the clause bought nothing, and the failing shape is still open:
   a PLACE the prose calls closed. A rule about places specifically is the next thing to try, and
   `bench/retire.ts` — one arm now — is what it has to beat.
