# Shared helpers for the dev scripts. Source it; don't run it.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Logs, pid files and throwaway test tokens for running services (git-ignored).
RUN_DIR="$ROOT/.dev-run"
mkdir -p "$RUN_DIR"

if [ -t 1 ]; then
  C_RED=$'\e[31m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_DIM=$'\e[2m' C_BOLD=$'\e[1m' C_RESET=$'\e[0m'
else
  C_RED="" C_GREEN="" C_YELLOW="" C_DIM="" C_BOLD="" C_RESET=""
fi

info() { echo "${C_BOLD}$*${C_RESET}"; }
warn() { echo "${C_YELLOW}warning:${C_RESET} $*" >&2; }
die() { echo "${C_RED}error:${C_RESET} $*" >&2; exit 1; }

# All services, discovered from services/*/package.json.
all_services() {
  local d
  for d in "$ROOT"/services/*/; do
    [ -f "$d/package.json" ] && basename "$d"
  done
}

# Services named on the command line, or all of them. Rejects unknown names.
resolve_services() {
  if [ $# -eq 0 ]; then
    all_services
    return
  fi
  local s
  for s in "$@"; do
    [ -f "$ROOT/services/$s/package.json" ] || die "unknown service '$s' (have: $(all_services | tr '\n' ' '))"
    echo "$s"
  done
}

# Dev port, read from the `--port N` in the service's dev script.
service_port() {
  node -e '
    const dev = require(process.argv[1]).scripts?.dev ?? "";
    const m = /--port\s+(\d+)/.exec(dev);
    if (!m) process.exit(1);
    console.log(m[1]);
  ' "$ROOT/services/$1/package.json" || die "no --port in services/$1/package.json dev script"
}

service_url() { echo "http://localhost:$(service_port "$1")"; }

# True when the service's dev script runs `wrangler dev` (vs. Vite for the admin UI).
uses_wrangler_dev() {
  node -e 'process.exit(/^wrangler dev\b/.test(require(process.argv[1]).scripts?.dev ?? "") ? 0 : 1)' \
    "$ROOT/services/$1/package.json"
}

has_script() {
  node -e 'process.exit(require(process.argv[1]).scripts?.[process.argv[2]] ? 0 : 1)' \
    "$ROOT/services/$1/package.json" "$2"
}

# Per-service settings for verify.sh, declared as comments in services/<name>/verify.sh:
#   # probe: /api/__verify_missing          path that needs auth (default /__verify_missing)
#   # auth-header: X-Dev-User: editor       header to authenticate with instead of a bearer token
verify_directive() {
  local f="$ROOT/services/$1/verify.sh"
  [ -f "$f" ] && sed -n "s/^# $2: //p" "$f" | head -1
}

is_healthy() { curl -s -m 2 -o /dev/null -w '%{http_code}' "$(service_url "$1")/health" 2>/dev/null | grep -q '^200$'; }

pid_file() { echo "$RUN_DIR/$1.pid"; }
log_file() { echo "$RUN_DIR/$1.log"; }
test_env_file() { echo "$RUN_DIR/$1.test.env"; }

# Bearer token for a service without ever printing it, in priority order:
#   1. <SERVICE>_TOKEN environment variable (e.g. SANDBOX_TOKEN)
#   2. the throwaway token written by `start.sh --test-tokens`
#   3. API_BEARER_TOKEN from services/<name>/.dev.vars
service_token() {
  local s=$1 var
  var="$(echo "$s" | tr '[:lower:]-' '[:upper:]_')_TOKEN"
  if [ -n "${!var:-}" ]; then
    echo "${!var}"
    return
  fi
  local f
  for f in "$(test_env_file "$s")" "$ROOT/services/$s/.dev.vars"; do
    if [ -f "$f" ]; then
      (set -a; . "$f" >/dev/null 2>&1; echo "${API_BEARER_TOKEN:-}")
      return
    fi
  done
}
