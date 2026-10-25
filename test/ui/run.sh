#!/usr/bin/env bash
# Every driver scenario, each against a FRESH copy of the database.
#
# The scenarios mutate: they rename entries, accept proposals, create stories. Run against one
# copy in sequence they poison each other, and the failures look like code regressions — which
# cost real time to disbelieve once. So: reset between every scenario, always.
#
#   test/ui/run.sh              # all of them
#   test/ui/run.sh search       # just one
#   test/ui/run.sh panels ritual # or several, unquoted
set -uo pipefail
cd "$(dirname "$0")/../.."
PORT=${ANANSI_UI_PORT:-5179}
# One run at a time. The scenarios hardcode the port, so two concurrent runs kill each other's
# servers and every scenario after the collision reports failures that are not there — which
# cost real time to disbelieve, twice in one sitting. A second run WAITS for the first, and says
# so: parallel worktrees used to get "wait for it" and an exit, and wrote their own wait loops.
exec 9>/tmp/anansi-ui-$PORT.lock
flock -n 9 || { echo "  another test/ui/run.sh is using port $PORT — waiting for it"; flock 9; }
WORK=$(mktemp -d /tmp/anansi-ui.XXXXXX)
# The fake Featherless and the fake router, when the scenario before asked for them.
FLPID=""; RTPID=""; UI_FL_KEY=""
trap 'kill $(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP "pid=\K[0-9]+" | head -1) $FLPID $RTPID 2>/dev/null; rm -rf "$WORK"' EXIT

# Start the fake in test/ui/$1.ts on a port the system picks, and wait for it to write the port to
# $WORK/$2.port. Sets FAKEPID and FAKEPORT; a fake that never comes up ends the run with its log.
fake() {
  node --experimental-strip-types "test/ui/$1.ts" "$WORK/$2.port" >"$WORK/$2.log" 2>&1 &
  FAKEPID=$!
  local i=0
  until [ -s "$WORK/$2.port" ]; do sleep 0.2; i=$((i+1)); [ $i -gt 50 ] && { echo "the fake $1 never came up"; cat "$WORK/$2.log"; exit 1; }; done
  FAKEPORT=$(cat "$WORK/$2.port")
}

fresh() {
  local pid; pid=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  [ -n "$FLPID$RTPID" ] && kill $FLPID $RTPID 2>/dev/null; FLPID=""; RTPID=""
  sleep 1; rm -f "$WORK"/db* "$WORK"/fl.* "$WORK"/rt.*
  # NEVER THE REAL FEATHERLESS. This machine has a real key at the default path, so a test server
  # left to the defaults would read it, and a scenario that opened Find a model would spend plan
  # units. A scenario that needs remote models says so on its first line, `// needs:
  # fake-featherless`, and gets a fake one and a key file of its own; every other scenario gets no
  # key and an address that refuses at once. Hugging Face, which describes catalogue models, is the
  # same fake at its root, or the same refusing address.
  local fl_url="http://127.0.0.1:9/v1" fl_key="/nonexistent/featherless.key" hf_url="http://127.0.0.1:9"
  if head -1 "test/ui/$1.js" 2>/dev/null | grep -q '^// needs: fake-featherless'; then
    fake featherless fl; FLPID=$FAKEPID
    fl_url="http://127.0.0.1:$FAKEPORT/v1" hf_url="http://127.0.0.1:$FAKEPORT"
    fl_key="$WORK/fl.key"; printf 'fl-ui-fake-key\n' >"$fl_key"
  fi
  # Handed to the scenario as ANANSI_UI_FL_KEY. The server reads the key file on every call, so a
  # scenario that deletes it is a server with no key from then on, without a restart.
  UI_FL_KEY="$fl_key"
  # A FAKE LOCAL ROUTER, for a scenario whose first line also names `fake-router`. Every other
  # scenario reads the real router, as it always has.
  local llama="${ANANSI_LLAMA:-http://127.0.0.1:8080}"
  # A scenario about the model being DOWN points at a port where nothing listens.
  if head -1 "test/ui/$1.js" 2>/dev/null | grep -q '^// needs: .*\bdead-model\b'; then
    llama="http://127.0.0.1:9"
  fi
  if head -1 "test/ui/$1.js" 2>/dev/null | grep -q '^// needs: .*\bfake-router\b'; then
    fake router rt; RTPID=$FAKEPID
    llama="http://127.0.0.1:$FAKEPORT"
  fi
  # The fixture is the WHOLE ground truth, and it did not used to be: this snapshotted the real
  # anansi.db and seeded The Silver Key on top, so every scenario ran against the author's actual
  # library plus a fixture. That is invisible until the library changes. On 2026-08-26 it emptied and
  # three assertions in handlers.js stopped running with no red — 22 checks became 19 — because they
  # were reaching for a second story that happened to be there. A suite whose ground truth is a book
  # somebody is writing in tests something different every day.
  #
  # A scenario that needs more than the fixture makes it, the way handlers.js makes its empty book
  # and its second book to race.
  node --experimental-strip-types test/ui/seed.ts "$WORK/db" >/dev/null
  # The scenarios drive Preferences, which can stop and restart the llama-router unit. Point the
  # test server at a unit that does not exist so no test can ever take the real one down: a
  # scenario that stops the model server mid-suite would fail every scenario after it, and would
  # do it on the machine somebody is writing on.
  ANANSI_PORT=$PORT ANANSI_DB="$WORK/db" ANANSI_LLAMA_UNIT=anansi-test-nonexistent.service \
    ANANSI_FEATHERLESS_URL="$fl_url" ANANSI_FEATHERLESS_KEY_FILE="$fl_key" ANANSI_HF_URL="$hf_url" \
    ANANSI_LLAMA="$llama" \
    nohup node --experimental-strip-types serve.ts >"$WORK/serve.log" 2>&1 &
  local n=0
  until curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/"; do sleep 1; n=$((n+1)); [ $n -gt 30 ] && { echo "server never came up"; cat "$WORK/serve.log"; exit 1; }; done
}

# EVERY argument, not the first. `run.sh panels ritual` silently ran `panels` alone and reported
# green for a scenario nobody asked about — twice, per the old handoff notes.
scenarios=${*:-}
[ -z "$scenarios" ] && scenarios="buttons tray composer hwkb at veil surfaces handlers search restored hostile limits import modes panels phone wizard forge finder marks fallback weave weavefit reroll back doors targets down"
# `cover` and `entrypic` are excluded too, and for a second reason: they need ANANSI_SEARCH pointing
# at a working endpoint AND the open web. Run them by name, with that variable set on the test server.
# `model`, `ritual` and `veil` are excluded from the default set: every step waits on a real
# generation, so they run in minutes. Ask for one by name: test/ui/run.sh veil
fail=0
# WHAT THIS RUN SAW, written down. Until 2026-08-28 the results of this harness existed only in the
# terminal at the moment you ran it, and it is run by hand — so `buttons` and `handlers` sat dead
# for weeks and nothing in the repo could say so, while the last line still read "all scenarios
# green" over sixteen of eighteen. `test/web.ts` reads this file and refuses a recorded death.
# /tmp on purpose, at Seth's call: it is a fact about THIS machine at THIS moment, not about the
# code, so it does not belong in the tree and must never be committed.
# ONE FILE PER CHECKOUT, keyed on the checkout's real path. A single /tmp name was shared by every
# worktree on the machine, so a deliberate red in one (falsifying a test) failed `test/all.ts` in
# all the others, 2026-10-14. `test/web.ts` derives the same name; the two must agree.
RESULTS=${ANANSI_UI_RESULTS:-/tmp/anansi-ui-results-$(printf %s "$(pwd -P)" | sha256sum | cut -c1-8).json}
rows=""
for s in $scenarios; do
  fresh "$s"
  out=$(ANANSI_UI_FL_KEY="$UI_FL_KEY" node --experimental-strip-types bench/drive.ts "http://127.0.0.1:$PORT/" "test/ui/$s.js" 2>&1)
  ok=$(printf '%s' "$out" | grep -c '^  ok')
  red=$(printf '%s' "$out" | grep -c 'RED \|FAIL')
  # Every scenario ends by printing its own verdict. If that line is missing the scenario did
  # not finish — it threw partway, and the assertions it did reach are not the whole story.
  # Counting only ok and RED made a scenario that died at assertion 8 of 25 report "8 ok, 0 red",
  # which is the same false green as the zero case below wearing a different hat.
  # `[0-9]* RED` matched ZERO digits, so any line containing " RED" satisfied it — including the
  # per-assertion red lines the scenarios print. A scenario that failed one check and then DIED was
  # scored as having reached its verdict, and reported its partial count as if it were the whole
  # run: `panels 46 ok, 1 red` for a scenario that has 151. Found 2026-08-27 when a real death hid
  # behind a real red. `[0-9][0-9]*` is the verdict line and nothing else.
  if ! printf '%s' "$out" | grep -q 'all green\|[0-9][0-9]* RED'; then
    if [ "$ok" -eq 0 ] && [ "$red" -eq 0 ]; then
      printf '  %-10s DIED before its first assertion\n' "$s"
    else
      printf '  %-10s DIED after %s ok — did not reach its own verdict\n' "$s" "$ok"
    fi
    printf '%s\n' "$out" | tail -6 | sed 's/^/       /'
    rows="$rows{\"name\":\"$s\",\"ok\":$ok,\"red\":$red,\"died\":true,\"at\":$(date +%s)},"
    fail=$((fail+1)); continue
  fi
  rows="$rows{\"name\":\"$s\",\"ok\":$ok,\"red\":$red,\"died\":false,\"at\":$(date +%s)},"
  printf '  %-10s %2s ok, %s red\n' "$s" "$ok" "$red"
  if [ "$red" -gt 0 ]; then fail=$((fail+red)); printf '%s\n' "$out" | grep -E 'RED |FAIL' | sed 's/^/       /'; fi
done
# MERGED, NOT OVERWRITTEN. `run.sh panels` must not erase what the other seventeen last reported,
# or asking for one scenario would silently mark the rest as never run.
node -e '
  const fs = require("fs"), f = process.argv[1];
  const now = JSON.parse("[" + (process.argv[2] || "").replace(/,$/, "") + "]");
  let was = {}; try { was = JSON.parse(fs.readFileSync(f, "utf8")).scenarios ?? {}; } catch {}
  for (const r of now) was[r.name] = r;
  fs.writeFileSync(f, JSON.stringify({ scenarios: was }, null, 1));
' "$RESULTS" "$rows" 2>/dev/null || echo "  (could not write $RESULTS)"

echo ""
[ "$fail" -eq 0 ] && echo "  all scenarios green" || echo "  $fail red"
exit $((fail > 0))
