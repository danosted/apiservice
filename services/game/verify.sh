# game checks, sourced by scripts/verify.sh (see there for the helpers).

req GET /v1 "${AUTH[@]}"
expect "GET /v1 answers with the service name" 200 "b.service === 'game' && b.version === 1"
