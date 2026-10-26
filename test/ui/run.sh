#!/usr/bin/env bash
# Every driver scenario, each against a FRESH copy of the database.
#
# The scenarios mutate: they rename entries, accept proposals, create stories. Run against one
# copy in sequence they poison each other, and the failures look like code regressions — which
# cost real time to disbelieve once. So: reset between every scenario, always.
#
#   test/ui/run.sh              # the default list (below)
#   test/ui/run.sh --no-gpu     # the default list without the scenarios that need the real model
#   test/ui/run.sh --list       # print the list it would run, and run nothing
#   test/ui/run.sh search       # just one
#   test/ui/run.sh panels ritual # or several, unquoted
set -uo pipefail
cd "$(dirname "$0")/../.."
PORT=${ANANSI_UI_PORT:-5179}
# THE DEFAULT LIST IS DERIVED, from every test/ui/*.js. It was typed by hand, and every new
# scenario had to be added to it by hand: `threadlist`, `bar`, `threadread` and `threadalter` were
# all missing from it on 2026-10-25. Every .js here is a scenario (test/web.ts counts them the same
# way); the helpers are .ts. A new scenario joins the run when its file is created.
#
# Left out of the default, and run by name only:
#   model ritual   every step waits on a real generation, so they run in minutes.
#   cover entrypic they need ANANSI_SEARCH pointing at a working endpoint AND the open web. Run them
#                  by name, with that variable set on the test server.
#   shots          not a check: it writes screenshots and the words on every surface (bench/words.ts).
NAMED_ONLY="model ritual cover entrypic shots"
# THE SCENARIOS THAT NEED THE GPU: they talk to the real model on :8080. `--no-gpu` leaves them out,
# for a run while the GPU is busy with something else. `veil` is in the default list, as it was in
# the hand-typed one; `model` and `ritual` are not in it at all. Every other scenario reaches no
# model, or reaches the fake router or a refusing port (`// needs:` on its first line, see fresh() below).
GPU="veil model ritual"
# EVERY argument, not the first. `run.sh panels ritual` silently ran `panels` alone and reported
# green for a scenario nobody asked about — twice, per the old handoff notes.
nogpu=0 list=0 scenarios=""
for a in "$@"; do
  case "$a" in
    --no-gpu) nogpu=1 ;;
    --list) list=1 ;;
    *) scenarios="$scenarios $a" ;;
  esac
done
if [ -z "$scenarios" ]; then
  for f in test/ui/*.js; do
    s=$(basename "$f" .js)
    case " $NAMED_ONLY " in *" $s "*) ;; *) scenarios="$scenarios $s" ;; esac
  done
fi
if [ "$nogpu" = 1 ]; then
  kept=""
  for s in $scenarios; do case " $GPU " in *" $s "*) ;; *) kept="$kept $s" ;; esac; done
  scenarios=$kept
fi
# `--list` prints the list it would run and runs nothing. It exits here, before the lock and the
# trap below, so it waits for no other run and stops no server.
[ "$list" = 1 ] && { echo $scenarios; exit 0; }

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
  ANANSI_PORT=$PORT ANANSI_DB="$WORK/db" \
    ANANSI_FEATHERLESS_URL="$fl_url" ANANSI_FEATHERLESS_KEY_FILE="$fl_key" ANANSI_HF_URL="$hf_url" \
    ANANSI_LLAMA="$llama" \
    nohup node --experimental-strip-types serve.ts >"$WORK/serve.log" 2>&1 &
  local n=0
  until curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/"; do sleep 1; n=$((n+1)); [ $n -gt 30 ] && { echo "server never came up"; cat "$WORK/serve.log"; exit 1; }; done
}

fail=0
# A BOUND ON EVERY SCENARIO. A driver waits on the page with no limit of its own, so one hang held
# a whole run: `back` hung for 24 minutes on 2026-10-25 before somebody killed it by hand, and the
# summary could not have said which one it was. A scenario over its bound is killed, recorded as
# dead with its name, and the run goes on to the next.
#
# The bounds are sized from the `at` stamps in the results file, not guessed. Most scenarios take
# 10–100 s; `panels` takes 250–330 s, so it gets the long bound with the scenarios that wait on real
# generations (a cold model loads for minutes first). ANANSI_UI_TIMEOUT and ANANSI_UI_SLOW_TIMEOUT
# override the two, in seconds.
bound() {
  case "$1" in
    panels|veil|model|ritual) echo "${ANANSI_UI_SLOW_TIMEOUT:-1200}" ;;
    *) echo "${ANANSI_UI_TIMEOUT:-300}" ;;
  esac
}
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
  t0=$SECONDS lim=$(bound "$s")
  # --foreground: the TERM goes to the driver alone, and the driver closes chromium and removes its
  # profile. Without it timeout signals the whole group, and the driver died before its TERM handler
  # ran: four killed runs out of four left a profile in /tmp, 2026-10-25. Why the group signal
  # does that is not known; a TERM sent to the group by hand let the handler run. -k: a driver that
  # ignores the TERM is KILLed 10 s later.
  out=$(ANANSI_UI_FL_KEY="$UI_FL_KEY" timeout --foreground -k 10 "$lim" node --experimental-strip-types bench/drive.ts "http://127.0.0.1:$PORT/" "test/ui/$s.js" 2>&1)
  rc=$?
  ok=$(printf '%s' "$out" | grep -c '^  ok')
  red=$(printf '%s' "$out" | grep -c 'RED \|FAIL')
  # 124 is timeout's TERM, 137 its KILL. Either way the scenario never reached its verdict.
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    printf '  %-10s DIED (timeout) after %s s, %s ok — killed at its bound\n' "$s" "$lim" "$ok"
    printf '%s\n' "$out" | tail -6 | sed 's/^/       /'
    rows="$rows{\"name\":\"$s\",\"ok\":$ok,\"red\":$red,\"died\":true,\"timeout\":true,\"at\":$(date +%s)},"
    fail=$((fail+1)); continue
  fi
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
  printf '  %-10s %2s ok, %s red  (%s s)\n' "$s" "$ok" "$red" $((SECONDS-t0))
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
# The run's own length, so how long a full run takes is measured rather than guessed. It outlasts
# a 600 s foreground shell cap; run it in the background.
echo "  $(wc -w <<<"$scenarios") scenario(s) in $((SECONDS/60))m $((SECONDS%60))s"
exit $((fail > 0))
