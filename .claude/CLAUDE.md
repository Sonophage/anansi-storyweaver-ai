# Anansi — working notes for Claude

Local-first long-form fiction app. Zero dependencies, no build step, no cloud. Node 26+ native
TypeScript stripping and `node:sqlite`. There is no `package.json`; do not add one, and do not
add a dependency without asking.

## Before you change anything

```bash
node --experimental-strip-types test/all.ts     # twelve suites, no model needed — it prints its own total
```

Run it before and after. It needs no llama-server, so there is no excuse for skipping it.

**The suites bind fixed ports, so nothing else may hold them while they run.** `test/scope.ts`
takes 5187 and boots throwaway servers on **5188, 5189, 5190, 5194 and 5195**; `test/ui/run.sh`
takes 5179; the live server is on 5174, **over HTTPS** — `curl http://…:5174` is refused with the
same `000` a dead server gives, so reach it with `curl -sk https://…`. A stray server on any of
those makes `scope.ts` report an ownership failure that is not there — a real one answers 200 where
the fixture expects 403, which reads exactly like the gate being broken. It cost time on 2026-08-30.
Do not start a second run to hurry the first, and give any scratch server a port well clear of that
list.

## Where the truth lives

**Docs drift from the code. The code wins.** When they disagree, read the code and fix the doc.

1. `docs/findings/P0-FINDINGS.md` — measured numbers. These override `docs/SPEC.md` and the plans
   wherever they conflict, and several already do.
2. `docs/findings/BUILD-STATE.md` — done / half-built / not started, audited against source.
3. `grep -rn "ponytail:" src web bench *.ts *.html` — the debt ledger. Thirty-five markers as of 2026-08-30. Each names what
   is missing, why it was left, and the upgrade path.

## Conventions that are not negotiable

- **Blocks are named, never numbered.** Three incompatible numberings once existed across two docs.
  `src/blocks.ts` holds one order and it has no integers.
- **`buildContext` is pure.** No I/O below the line marked in `src/story.ts`. Flags reach it through
  `Input`, never through `process.env`.
- **`render.ts` is the only place block order becomes text.** Do not order blocks anywhere else.
- **Every route is gated.** `serve.ts` fails closed on ownership; `test/scope.ts` proves it with two
  owners. An audit once found zero ownership checks on 27 routes — that is what the gate is for.
- **A deliberate shortcut gets a `ponytail:` comment** naming its ceiling. Adding debt means writing
  down the ceiling.
- **Anything a writer would notice goes in `docs/WHATS-NEW.md`, in the same commit.** That file IS
  the What changed screen — `GET /api/whatsnew` reads it, there is no model call and no cache.
  Newest first, `##` is a release (`YYYY-MM-DD · headline`), `###` is one thing in it. Write it for
  the person who WRITES BOOKS in the app: no file names, no function names, no refactors, no test
  work. If a commit changes nothing they would notice, it gets no entry.

## Hard-won rules about measurement

This project's findings are its most valuable asset. Five rules, each bought with a wrong answer:

- **Validate the detector before believing the result.** A check that never fires reports
  perfection. F17's probes ship with 22 synthetic cases asserting both that bad input flags and
  that good input does not.
- **Report the informative denominator, not the total.** F10 could not decide anything because most
  of its trials never mentioned the thing under test. Always say how many runs *could* have failed.
- **Falsify the test, not just the code.** Twice on 2026-08-24 a change shipped green because the
  assertion could not see it: a tag-splitting fix whose fixture had no comma in it, and a
  canon-per-take chain whose check asked "does any take carry canon" when only the second take was
  broken. Both were true before the change and true after. Break the code on purpose and watch the
  specific assertion go red, or it is decorative.
- **A guarded assertion can stop running and still report green.** `if (thing) { ...checks... }`
  with no `else` is invisible to a count-based harness. On 2026-08-24 four blocks were found inert
  this way — `ritual.js` had two that never ran because the setup page offered no entry its
  selector could match, and the comment above them explained exactly why without anyone reading it
  as "so this does not run". Assert the guard itself, or put a failing `else` on it.
- **A zero is not an absence.** F12 declared a defect gone on zero-in-sixty. Zero in sixty bounds
  the rate under ~5%; the true rate was 4%. Say "under X%", never "fixed".

Nothing sets a seed, so no generation run is reproducible. Only A/B arms run *simultaneously* are
controlled — `bench/ab.ts` does that, two servers against one router.

## Checks run against narration only

Dialogue may lie; characters may be wrong. Only the narrator commits the story. Every quality
check strips quoted spans first. Ignoring this produced a long run of false positives — a place
name, another character's name, a line of dialogue read as a POV break.

## The model

`Qwen3.6-WNTH-35B-A3B-NN` on `:8080`, 50,048 tokens per slot (two slots, `kv_unified`). The whole
preset list was renamed on 2026-08-27 — the old `write-nt-*` names are gone and the router answers
`400 model not found` for them. `ANANSI_MODEL` overrides the default in `llama.ts`. A story may also pin its own model in
`stories.model`. **The dead pin is gone** — checked against the live library 2026-08-30, the only
book that pins anything is `The Anagram of Ash`, and it pins `Artemis-1.1-RPNTH-31B-NN`, which the
router serves. The shelf still marks a pin the router has dropped (#18 §5); there is nothing for it
to mark today. The router runs `--models-max 3` and all three are resident (Qwen3.6 loaded,
Artemis-1.1 and GLM-4.7-Flash asleep), so a pinned model answers, but a cold one pays a reload.
**A story's voice field already outranks everything for register — but only if it is written like an
instruction.** F37: the same rule buried in a long line bought nothing (10.7%), and on its own line
naming *narration* with the forms spelled out it holds at ~98%, even against a book whose existing
prose contradicts it. Do not add register rules to SYSTEM; a clause there measured 98.0 against
98.0 and was deleted. It is a reasoning
model: **`chat_template_kwargs: {enable_thinking: false}` is mandatory** for prose. With thinking on
it returned no prose at all on three runs of four.

Two concurrent writers at full budget fit with a ~5,700-token margin. Oversubscribing the shared
cache does not queue — both requests die with HTTP 500. Do not raise the per-slot budget.
