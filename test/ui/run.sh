#!/usr/bin/env bash
# Every driver scenario, each against a FRESH copy of the database.
#
# The scenarios mutate: they rename entries, accept proposals, create stories. Run against one
# copy in sequence they poison each other, and the failures look like code regressions — which
# cost real time to disbelieve once. So: reset between every scenario, always.
#
#   test/ui/run.sh              # all of them
#   test/ui/run.sh search       # just one
set -uo pipefail
cd "$(dirname "$0")/../.."
PORT=${ANANSI_UI_PORT:-5179}
# One run at a time. The scenarios hardcode the port, so two concurrent runs kill each other's
# servers and every scenario after the collision reports failures that are not there — which
# cost real time to disbelieve, twice in one sitting.
exec 9>/tmp/anansi-ui-$PORT.lock
flock -n 9 || { echo "  another test/ui/run.sh is using port $PORT — wait for it"; exit 1; }
WORK=$(mktemp -d /tmp/anansi-ui.XXXXXX)
trap 'kill $(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP "pid=\K[0-9]+" | head -1) 2>/dev/null; rm -rf "$WORK"' EXIT

fresh() {
  local pid; pid=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  sleep 1; rm -f "$WORK"/db*
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
    nohup node --experimental-strip-types serve.ts >"$WORK/serve.log" 2>&1 &
  local n=0
  until curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/"; do sleep 1; n=$((n+1)); [ $n -gt 30 ] && { echo "server never came up"; cat "$WORK/serve.log"; exit 1; }; done
}

scenarios=${1:-}
[ -z "$scenarios" ] && scenarios="buttons tray surfaces handlers search restored hostile limits import modes panels phone wizard"
# `model` and `ritual` are excluded from the default set: every step waits on a real generation, so it runs
# in minutes. Ask for it by name: test/ui/run.sh model
fail=0
for s in $scenarios; do
  fresh
  out=$(node --experimental-strip-types bench/drive.ts "http://127.0.0.1:$PORT/" "test/ui/$s.js" 2>&1)
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
    fail=$((fail+1)); continue
  fi
  printf '  %-10s %2s ok, %s red\n' "$s" "$ok" "$red"
  if [ "$red" -gt 0 ]; then fail=$((fail+red)); printf '%s\n' "$out" | grep -E 'RED |FAIL' | sed 's/^/       /'; fi
done
echo ""
[ "$fail" -eq 0 ] && echo "  all scenarios green" || echo "  $fail red"
exit $((fail > 0))
