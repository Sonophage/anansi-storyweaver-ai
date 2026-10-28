# After the first hem, the model reads where the tale stands, not the premise

Seth decided this on 2026-10-28, building on ADR 0009. The words are GLOSSARY.md's.

## Why

The premise is sent on every call and never trimmed. Even written as the opening (ADR 0009), at
scene 30 it still reads to the model as the present: what they want "now" and what is in their way
"now" were true on page one. A tale needs a record of where it stands that moves with it.

## The decision

**Until the first scene is hemmed, the model reads the premise**, as it does today.

**Each hem also writes where the tale stands now**: one paragraph, the current situation and what
is in play, never what comes next. It is chalked on the hem's Workbench card, shown as a diff, and
the writer sews it in. It lives in the tale's thread's Over time.

**From the first sewn-in entry on, the model reads where the tale stands instead of the premise.**
The premise stays in Tale settings as how the tale began, and is no longer sent.

**Existing tales switch at their next hem.** Nothing changes for them until then.

This makes the tale's thread real (it was "not built") and gives it an Over time, which reverses
the glossary's earlier "It has no Over time".

## Consequences

- The prompt change is owed an A/B against the premise-only prompt before anyone calls it better.
- Talk and Tidy that read the premise read where the tale stands once there is one.
