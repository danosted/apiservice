#!/usr/bin/env bash
# Stop services started by start.sh.
#
#   scripts/stop.sh              # all services
#   scripts/stop.sh website      # just this one
set -euo pipefail
. "$(dirname "$0")/lib.sh"

SERVICE_LIST=$(resolve_services "$@")
mapfile -t SERVICES <<< "$SERVICE_LIST"

for s in "${SERVICES[@]}"; do
  pf=$(pid_file "$s")
  if [ ! -f "$pf" ]; then
    is_healthy "$s" && warn "$s: running but not started by start.sh; stop it where you started it"
    continue
  fi
  pid=$(cat "$pf")
  if kill -0 "$pid" 2>/dev/null; then
    # Negative pid = the whole process group created by setsid in start.sh.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -- "-$pid" 2>/dev/null || true
    echo "$s: stopped"
  else
    echo "$s: not running"
  fi
  rm -f "$pf" "$(test_env_file "$s")"
done
