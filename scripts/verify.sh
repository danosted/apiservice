#!/usr/bin/env bash
# Run verification requests against running services. Exits non-zero if any check fails.
#
#   scripts/verify.sh                  # all services
#   scripts/verify.sh sandbox          # just this one
#
# Every service gets the shared checks below (health, auth, JSON errors). A service
# can add its own in services/<name>/verify.sh, which is sourced with these helpers:
#   req METHOD PATH [curl args...]     sends a request; sets $STATUS and $BODY
#   expect "desc" STATUS ['js expr']   asserts the status and, optionally, a JS
#                                      expression over the parsed body `b`
#   assert "desc" COMMAND...           passes when the command succeeds
#   json_get FIELD                     prints a top-level field of $BODY
#   $AUTH                              curl args carrying the service's bearer token
#   $JSON                              curl args for a JSON content-type
# Tokens come from <SERVICE>_TOKEN, start.sh --test-tokens, or services/<name>/.dev.vars.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

SERVICE_LIST=$(resolve_services "$@")
mapfile -t SERVICES <<< "$SERVICE_LIST"

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT
PASS=0
FAIL=0
BASE=""
STATUS=""
BODY=""

req() {
  local method=$1 path=$2
  shift 2
  STATUS=$(curl -s -m 10 -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE$path" "$@" 2>/dev/null || true)
  BODY=$(cat "$BODY_FILE")
}

expect() {
  local desc=$1 want=$2 js=${3:-} ok=1
  [ "$STATUS" = "$want" ] || ok=0
  if [ $ok -eq 1 ] && [ -n "$js" ]; then
    node -e "const b = JSON.parse(process.argv[1]); if (!($js)) process.exit(1);" "$BODY" 2>/dev/null || ok=0
  fi
  if [ $ok -eq 1 ]; then
    PASS=$((PASS + 1))
    echo "  ${C_GREEN}✓${C_RESET} $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  ${C_RED}✗ $desc${C_RESET}"
    echo "    ${C_DIM}expected $want${js:+ and $js}; got $STATUS ${BODY:0:200}${C_RESET}"
  fi
}

# assert "desc" command...: passes when the command succeeds.
assert() {
  local desc=$1
  shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1))
    echo "  ${C_GREEN}✓${C_RESET} $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  ${C_RED}✗ $desc${C_RESET}"
  fi
}

json_get() {
  node -e 'try { console.log(JSON.parse(process.argv[1])[process.argv[2]] ?? "") } catch { console.log("") }' "$BODY" "$1"
}

JSON=(-H "content-type: application/json")

for s in "${SERVICES[@]}"; do
  BASE=$(service_url "$s")
  info "$s ($BASE)"

  if ! is_healthy "$s"; then
    FAIL=$((FAIL + 1))
    echo "  ${C_RED}✗ not running${C_RESET} (start it with scripts/start.sh $s)"
    continue
  fi

  req GET /health
  expect "GET /health is public and names the service" 200 "b.status === 'ok' && b.service === '$s'"

  PROBE=$(verify_directive "$s" probe)
  PROBE=${PROBE:-/__verify_missing}

  req GET "$PROBE"
  expect "request without credentials is rejected" 401 "b.error === 'unauthorized'"

  req GET "$PROBE" -H "Authorization: Bearer wrong-token"
  expect "request with a wrong token is rejected" 401

  req GET "$PROBE" -H "Authorization: Basic dXNlcjpwYXNz"
  expect "non-Bearer auth scheme is rejected" 401

  AUTH_HEADER=$(verify_directive "$s" auth-header)
  if [ -n "$AUTH_HEADER" ]; then
    AUTH=(-H "$AUTH_HEADER")
  else
    TOKEN=$(service_token "$s")
    if [ -z "$TOKEN" ]; then
      warn "$s: no token found (set $(echo "$s" | tr '[:lower:]-' '[:upper:]_')_TOKEN or create services/$s/.dev.vars); skipping authed checks"
      continue
    fi
    AUTH=(-H "Authorization: Bearer $TOKEN")
  fi

  # Auth passes, then routing returns the standard JSON 404.
  req GET "$PROBE" "${AUTH[@]}"
  expect "valid credentials are accepted (unknown path gives JSON 404)" 404 "b.error === 'not found'"

  if [ -f "$ROOT/services/$s/verify.sh" ]; then
    . "$ROOT/services/$s/verify.sh"
  fi
done

echo
if [ $FAIL -eq 0 ]; then
  echo "${C_GREEN}${C_BOLD}All $PASS checks passed${C_RESET}"
else
  echo "${C_RED}${C_BOLD}$FAIL failed${C_RESET}, $PASS passed"
  exit 1
fi
