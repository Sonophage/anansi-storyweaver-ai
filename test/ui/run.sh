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
WORK=$(mktemp -d /tmp/anansi-ui.XXXXXX)
trap 'kill $(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP "pid=\K[0-9]+" | head -1) 2>/dev/null; rm -rf "$WORK"' EXIT

fresh() {
  local pid; pid=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  sleep 1; rm -f "$WORK"/db*; cp anansi.db "$WORK/db"
  ANANSI_PORT=$PORT ANANSI_DB="$WORK/db" nohup node --experimental-strip-types serve.ts >"$WORK/serve.log" 2>&1 &
  local n=0
  until curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/"; do sleep 1; n=$((n+1)); [ $n -gt 30 ] && { echo "server never came up"; cat "$WORK/serve.log"; exit 1; }; done
}

scenarios=${1:-}
[ -z "$scenarios" ] && scenarios="buttons surfaces handlers search restored hostile limits"
# `model` is excluded from the default set: every step waits on a real generation, so it runs
# in minutes. Ask for it by name: test/ui/run.sh model
fail=0
for s in $scenarios; do
  fresh
  out=$(node --experimental-strip-types bench/drive.ts "http://127.0.0.1:$PORT/" "test/ui/$s.js" 2>&1)
  ok=$(printf '%s' "$out" | grep -c '^  ok')
  red=$(printf '%s' "$out" | grep -c 'RED \|FAIL')
  printf '  %-10s %2s ok, %s red\n' "$s" "$ok" "$red"
  if [ "$red" -gt 0 ]; then fail=$((fail+red)); printf '%s\n' "$out" | grep -E 'RED |FAIL' | sed 's/^/       /'; fi
done
echo ""
[ "$fail" -eq 0 ] && echo "  all scenarios green" || echo "  $fail red"
exit $((fail > 0))
