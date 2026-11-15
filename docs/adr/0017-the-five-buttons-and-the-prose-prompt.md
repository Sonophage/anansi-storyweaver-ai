# The five buttons follow Seth's wordings, and the rules sit next to the task

Seth decided this on 2026-11-06 and 2026-11-11. The measurements are F73 to F77 and F79.

## Why

The five buttons (Continue, Direct, Speak, Act, Narrate) each have one job. Reads of takes showed
where a wording did not do that job. A pasted critique of the prose prompt (2026-11-11) was checked
against a real stored prompt.

## The decision

- **Seth's five mode wordings are the shipped defaults** (`MODE_WORDING` in `src/context.ts`).
- **Seth's standard per button** (his words, `SHOULD` in `bench/modes-read.ts`): Act, the selected
  character acts and the others react. Narrate, a turn in the story, never rewritten; Anansi writes
  only what happens after. Direct, a direction; Anansi writes using it as its direction.
- **A read of takes is labelled, never blind.** Each button has its own job.
- **Act says "reacts to it ... their reaction"** (F75).
- **Narrate and Continue leave the newest passage in the prose**; they do not quote it (F76).
  Continue was changed without a run, on Seth's word. Speak and Act still quote theirs. A quoted
  passage keeps its lockout mark, and a scene break is never quoted.
- **Direct is unchanged** (F77).
- **Speak**: a Speak answer that has the writer's character talk counts as a failure. The Speak cut
  (`cutSpeaker` in `src/speak.ts`) ends the answer there (F73, F74).
- **2026-11-11, shipped before measuring, on Seth's word**: the standing rules block (`DIRECTIVE`:
  point of view, the lockout, the register) moved after `TAIL` and before `MODE`, fenced as
  `<rules>` (`ORDER` in `src/blocks.ts`, `TAG` in
  `src/render.ts`). SYSTEM's Voice Modulation paragraph was removed. Three repeated lines were
  dropped from every mode wording and from Seth's saved wordings. Measured after (F79): flat, at a
  point with no headroom. Voice Modulation stays out.
- The rest of the critique was answered (the output contract is already first, the testable bans
  are already in the voice, the length is already in the mode). Do not argue it again.

## What it costs

- Seth's saved wordings (`prompt_overrides`) replace the defaults whole. A change to `MODE_WORDING`
  does not reach him. Change both.
