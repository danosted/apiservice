#!/usr/bin/env bash
# Start one or more services in the background and wait until they're healthy.
#
#   scripts/start.sh                     # all services
#   scripts/start.sh sandbox game        # just these
#   scripts/start.sh --test-tokens       # use throwaway tokens instead of .dev.vars
#   scripts/start.sh --seed              # reset local data to the seed (services with a `seed` script)
#
# Local D1 migrations are applied first. Logs: .dev-run/<service>.log
set -euo pipefail
. "$(dirname "$0")/lib.sh"

TEST_TOKENS=0
SEED=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --test-tokens) TEST_TOKENS=1 ;;
    --seed) SEED=1 ;;
    -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option $a" ;;
    *) ARGS+=("$a") ;;
  esac
done
SERVICE_LIST=$(resolve_services "${ARGS[@]+"${ARGS[@]}"}")
mapfile -t SERVICES <<< "$SERVICE_LIST"

STARTED=()
for s in "${SERVICES[@]}"; do
  url=$(service_url "$s")
  if is_healthy "$s"; then
    echo "$s: already running at $url"
    continue
  fi

  # Bearer-token services run on `wrangler dev`; Vite-based ones (admin) use their own
  # auth and don't accept wrangler flags.
  extra=()
  if uses_wrangler_dev "$s"; then
    extra=(--show-interactive-dev-session=false)
    if [ $TEST_TOKENS -eq 1 ]; then
      env_file=$(test_env_file "$s")
      (umask 077; echo "API_BEARER_TOKEN=$(openssl rand -hex 32)" > "$env_file")
      extra+=(--env-file "$env_file")
    else
      rm -f "$(test_env_file "$s")"
      [ -f "$ROOT/services/$s/.dev.vars" ] ||
        warn "$s: no services/$s/.dev.vars, so every authed request will get 401 (use --test-tokens)"
    fi
  fi

  echo "$s: applying local migrations"
  if ! (cd "$ROOT" && npm run db:migrate:local -w "services/$s" > "$(log_file "$s")" 2>&1); then
    tail -20 "$(log_file "$s")" >&2
    die "$s: migrations failed (log: $(log_file "$s"))"
  fi

  if [ $SEED -eq 1 ] && has_script "$s" seed; then
    echo "$s: loading seed data"
    (cd "$ROOT" && npm run seed -w "services/$s" >> "$(log_file "$s")" 2>&1) || die "$s: seeding failed (log: $(log_file "$s"))"
  fi

  echo "$s: starting on $url"
  # setsid gives the npm -> wrangler/vite -> workerd tree its own process group so stop.sh can kill all of it.
  (cd "$ROOT" && exec setsid npm run dev -w "services/$s" -- \
    "${extra[@]+"${extra[@]}"}" \
    >> "$(log_file "$s")" 2>&1 < /dev/null) &
  echo $! > "$(pid_file "$s")"
  STARTED+=("$s")
done

FAILED=0
for s in "${STARTED[@]+"${STARTED[@]}"}"; do
  pid=$(cat "$(pid_file "$s")")
  for _ in $(seq 1 60); do
    is_healthy "$s" && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if is_healthy "$s"; then
    echo "${C_GREEN}$s: ready${C_RESET} at $(service_url "$s")"
  else
    echo "${C_RED}$s: failed to start${C_RESET}; last log lines:" >&2
    grep -vE 'cdn-cgi|explorer' "$(log_file "$s")" | tail -15 | sed 's/^/    /' >&2
    FAILED=1
  fi
done

[ $FAILED -eq 0 ] || { echo "Stop leftovers with scripts/stop.sh" >&2; exit 1; }
