#!/usr/bin/env bash
# Start services with throwaway tokens and seed data, verify them (API checks and UI flows),
# then stop whatever this run started.
# Needs no .dev.vars, so it works on a fresh checkout.
#
#   scripts/smoke.sh                   # all services
#   scripts/smoke.sh sandbox           # just this one
set -euo pipefail
. "$(dirname "$0")/lib.sh"

SERVICE_LIST=$(resolve_services "$@")
mapfile -t SERVICES <<< "$SERVICE_LIST"

# Only stop the services this run started; leave already-running ones alone.
TO_STOP=()
for s in "${SERVICES[@]}"; do
  is_healthy "$s" && warn "$s: already running, so it's verified with its existing tokens" || TO_STOP+=("$s")
done
cleanup() { [ ${#TO_STOP[@]} -eq 0 ] || "$ROOT/scripts/stop.sh" "${TO_STOP[@]}"; }
trap cleanup EXIT

"$ROOT/scripts/start.sh" --test-tokens --seed "${SERVICES[@]}"
echo
"$ROOT/scripts/verify.sh" "${SERVICES[@]}"

# Browser flows for services that have them (services/<name>/flows/*.json).
for s in "${SERVICES[@]}"; do
  if compgen -G "$ROOT/services/$s/flows/*.json" >/dev/null; then
    echo
    info "$s UI flows"
    node "$ROOT/scripts/ui.mjs" flows --service "$s"
  fi
done
