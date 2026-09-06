# Build state — rewritten from scratch 2026-09-06

The previous version of this file ran to 1,138 lines and had been appended to for two weeks. It was
wrong in five places on the day it was replaced, every one of them the same way: a row described
something as missing, the thing got built, and nothing came back to the row. Its own §6 named that
pattern in August and then did it three more times. It is parked at
`docs/archived/BUILD-STATE-2026-09-06.md` as the record of what was believed. Do not read it for
what is true.

**The rules this file lives by, because the last one died without them:**

1. **No transcribed numbers.** Every count below carries the command that produces it. If you want
   the number, run the command. A number typed into prose is wrong by the next commit — that is not
   a prediction, it is what happened to the last file four times.
2. **It is rewritten, not appended.** An append-only document reports the past as the present.
3. **It describes only what can be checked.** Anything that needs a measurement lives in
   `P0-FINDINGS.md` and is referenced by number, never restated here.
4. **When it disagrees with the code, the code wins and this file is the bug.**

---

## Count it yourself

```bash
sqlite3 anansi.db "select count(*) from sqlite_master where type='table' and name not like 'sqlite_%';"
grep -oE "'(GET|POST|PUT|DELETE|PATCH) /[^']*'" src/routes.ts | sort -u | wc -l   # routes
grep -rn "ponytail:" src web bench test *.ts *.html | wc -l                       # debt markers
grep -c '^## F' docs/findings/P0-FINDINGS.md                                      # findings
node --experimental-strip-types test/all.ts                                       # unit suites
bash test/ui/run.sh                                                               # browser scenarios
node --experimental-strip-types bench/sweep.ts                                    # dead code
```

At the commit this was written: 23 tables, 98 routes, 52 markers, 57 findings. Those four numbers
are here as a snapshot for a reader who wants to know the rough size of the thing, and they are the
only ones in this file. **If they matter to your decision, re-run the commands.**

---

## What is built and load-bearing

Not a list of features — a list of things whose absence would be a bug, verified in the source on
2026-09-06.

| | Where |
|---|---|
| `buildContext` is pure; blocks are named, never numbered; `render.ts` is the only place order becomes text | `src/context.ts`, `src/blocks.ts`, `src/render.ts` |
| Every route gated on ownership, failing closed; two-owner proof | `serve.ts`, `test/scope.ts` |
| Identity from `tailscale whois` against an `ANANSI_ALLOW` allowlist, one owner per request | `serve.ts` |
| Co-op: `story_writers`, one `MINE()` predicate, owner-only invite | `src/db.ts`, `POST /api/writers` |
| Live channel — the other writer's work arrives with no refresh | `src/live.ts`, `GET /api/live` |
| Ceilings, an **eviction order**, and a hard refusal on overflow | `src/context.ts`, `evict()` |
| Canon extraction, violation flags, muting, repair — all queued, nothing auto-canon | `src/routes.ts` |
| Branches, forking, per-passage history and restore | `src/db.ts` |
| Import: Anansi exports, AI Dungeon both halves, character cards V1/V2/V3 | `src/import.ts` |
| Backups: half-hourly beside the DB, six-hourly to `/data`, daily per-book export | `serve.ts` |
| Seeds — every generation reproducible, re-runnable from History | `src/routes.ts` |
| Static files gzipped on the way out, `no-cache` kept | `serve.ts`, `sendText` |

---

## What is missing

Each line was checked with a command on 2026-09-06, and the check is given so the next reader can
re-run it rather than believe this table.

| Missing | How it was checked |
|---|---|
| **Activation depth** — secondary keys, `key_logic`, proximity bound, exclusion keys, regex keys | 0 live hits for each in `context.ts`/`db.ts`; no column on `entries` for any of them |
| **Budget engine's remainder** — reservation, trim ladder, `partial` block state. **Eviction is NOT missing** — built 2026-08-29, `evict()` at `context.ts:1427` | `grep -n "evict\|reserve\|partial" src/context.ts` |
| **Internal coherence** — nothing checks a passage against *itself* | 0 hits; the checker compares passage→canon only |
| **Canon against canon** — two cards may disagree and nothing notices | 0 hits |
| **Resumable streams** — the passage persists, but the page loses track until something redraws | no `visibilitychange` handler; every "resume" in `app.js` is the shelf band |
| **Per-writer cost or time ceiling** | no quota or rate limit in `routes.ts` or `serve.ts` |
| **Service worker / offline read** | no registration anywhere, no `sw.js` |
| **`writerStats` counts only books you own** | reads `s.owner_id = ?`, not `MINE()` |
| **A shared passage cannot say WHICH hand wrote it** | `passages.author` holds only `human`/`model`; no writer id column |
| **Full-text search** — a `LIKE` scan | `db.search` |
| **Design screens D9, D10, D14** | **UNVERIFIABLE FROM THIS REPO** — the design source is not in the tree |

---

## Debt

Every deliberate shortcut carries a `ponytail:` comment at its site naming its ceiling and upgrade
path. That is the ledger; this file does not duplicate it.

```bash
grep -rn "ponytail:" src web bench test *.ts *.html
```

Adding debt means writing down the ceiling. Retiring debt means deleting the marker.

---

## The harness

```bash
node --experimental-strip-types test/all.ts     # twelve suites + one bench check, no model needed
bash test/ui/run.sh                             # browser scenarios, needs port 5179
```

**Known and open:**

- **Sixteen `check` modes exist under `bench/`; `test/all.ts` runs one.** All sixteen were run on
  2026-09-06 and all sixteen are green, in 228 ms in parallel. The reason not to wire them —
  "unknown reds" — is therefore gone; what remains is `all.ts`'s own instruction to add them one at
  a time with their own commit. Unresolved by choice, not by ignorance.
- **`test/scope.ts` intermittently fails to boot its child on 5187**, three times recorded, most
  recently 2026-09-05. Every port free at the time; "it ran after `app.ts`" was tested twice and
  refuted. The child's stderr is empty, and that is the thing to capture next time.
- **`veil` is in the default browser set and drives real generations.** It fails under load and
  passes on a quiet box.
- **No HTTP-level suite.** `test/scope.ts` is the closest and it is testing the gate, not contracts.

---

## The five rules that hold measurement together

These are the reason `P0-FINDINGS.md` is worth more than this file. Each was bought with a wrong
answer; the full case for each is in that document.

1. **Validate the detector before believing the result.** A check that never fires reports
   perfection. On 2026-09-06 `bench/sweep.ts` was found reporting two defects and both were its own
   parse faults — one of them reading its own explanatory comment as evidence, the third instance of
   that exact fault in one tool.
2. **Report the informative denominator.** Say how many runs *could* have failed.
3. **Falsify the test, not just the code.** Break the code on purpose and watch the specific
   assertion go red, or it is decorative.
4. **A guarded assertion can stop running and still report green.**
5. **A zero is not an absence.** Say "under X%", never "fixed".

And a sixth, added 2026-09-06 by F57: **a treatment measured against a baseline that has since been
improved does not carry its old number forward.** F54's published third did not survive being
re-measured on top of F53, because F53 had already taken the headroom.

---

## Conventions that are not negotiable

- Blocks are named, never numbered.
- `buildContext` is pure. Flags reach it through `Input`, never `process.env`.
- `render.ts` is the only place block order becomes text.
- Every route is gated; `serve.ts` fails closed.
- A deliberate shortcut gets a `ponytail:` comment naming its ceiling.
- Anything a writer would notice goes in `docs/WHATS-NEW.md` in the same commit.
- Quality checks read narration only — dialogue may lie.
