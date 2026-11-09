# A second remote provider, NanoGPT, through one adapter

Seth decided this on 2026-11-09. It changes ADR 0001, which said there was one adapter, for
Featherless only, "because no second provider has been chosen". NanoGPT is the second provider.

## Why

Seth has a NanoGPT subscription and wants its models beside the local ones and Featherless's.
Featherless and NanoGPT both take the OpenAI chat-completions shape, so a second copy of the
adapter would be two things that must agree, with only one of them tested.

## The decision

- **A model id says where it runs, by its prefix.** `featherless:<id>` and `nanogpt:<id>` are
  remote; an id with no known prefix is local. `sourceOf(id)` in `src/llama.ts` is the one parser
  on the server, and `whereRuns(id)` in `web/model.js` is the one in the browser. `test/app.ts`
  holds the two lists of prefixes equal. Stored ids do not change.
- **One adapter, one table of providers.** Each provider has a prefix, a base URL, a key file name
  and a label. The request, the retry, the redaction and the error words go through one function.
  What only Featherless does stays Featherless's: its 503 `capacity_exhausted`, its
  `model_switching_limit_exceeded`, and its plan units (`cost`).
- **NanoGPT is reached on its subscription path**, `https://api.nano-gpt.com/api/subscription/v1`,
  for the catalogue and for every call. The catalogue there lists only the models the subscription
  covers, so a writer cannot shortlist a model that would spend money.
- **No token cap on NanoGPT either**, the same as Featherless (2026-10-27). Seth's key is set to
  subscription-only. Measured 2026-11-09: a model outside the subscription is refused with HTTP 429
  `api_key_usd_limit`, not billed. That 429 is not "busy" and is never retried; the writer is told
  the model is not in the subscription.
- **One key file per writer and provider**: `nanogpt-<login>.key` beside `featherless-<login>.key`.
  Only Seth has a NanoGPT key. A writer with no file has no NanoGPT models; nothing else changes.
- **The search and the lists filter by where a model runs.** Add a model searches one provider at
  a time, and the tale's model list can be narrowed to Local, Featherless or NanoGPT.

## What it costs

- NanoGPT has no tokenize endpoint (404, 2026-11-09). A prompt on a NanoGPT model is counted by
  an estimate from its length, not exactly. The estimate errs high, so the budget guard refuses
  early rather than late.
- NanoGPT's models are mostly not Hugging Face repos, so they have no tags. Their description is
  NanoGPT's own, from its catalogue.
- The probe on add, the weaving facts and the runaway guards are shared, so they are not measured
  separately on NanoGPT. Findings measured on Featherless do not carry over (the F57 rule).
