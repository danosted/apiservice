# Admin checks, sourced by scripts/verify.sh (see there for the helpers).
# Needs the game service running with seed data (scripts/start.sh --seed).
# probe: /api/__verify_missing
# auth-header: X-Dev-User: editor

VIEWER=(-H "X-Dev-User: viewer")

req GET /api/me "${AUTH[@]}"
expect "fake identity signs in the editor with its permissions" 200 "b.email === 'editor@local.test' && b.roles.includes('editor') && b.permissions.includes('inventory:adjust') && b.signOutUrl === '/__dev/logout'"

req GET /api/me "${VIEWER[@]}"
expect "viewer gets read permissions only" 200 "b.roles.includes('viewer') && !b.permissions.includes('inventory:adjust')"

req GET /api/me -H "X-Dev-User: nobody"
expect "unknown dev user is rejected and offered the dev logins" 401 "b.devLogin.includes('editor')"

# Response headers, lowercased, for the dev login switcher.
dev_login() { curl -s -o /dev/null -D - "$BASE/__dev/login?$1" | tr -d '\r' | tr '[:upper:]' '[:lower:]'; }
LOGIN=$(dev_login 'as=viewer&next=/players')
assert "dev login sets the dev_user cookie" grep -q '^set-cookie: dev_user=viewer' <<<"$LOGIN"
assert "dev login redirects to next" grep -qx 'location: /players' <<<"$LOGIN"
assert "dev login refuses off-site redirects" grep -qx 'location: /' <<<"$(dev_login 'as=viewer&next=//evil.example')"

req GET /api/stats "${AUTH[@]}"
expect "stats come from the game service" 200 "b.players > 0 && b.items > 0"

req GET "/api/players?q=player-00&page=1" "${AUTH[@]}"
expect "player search filters and paginates" 200 "b.total === 9 && b.players.length === 9 && b.page === 1"

req GET /api/players/player-001 "${AUTH[@]}"
expect "player detail includes inventory" 200 "b.player.id === 'player-001' && Array.isArray(b.inventory)"

req GET /api/players/nope "${AUTH[@]}"
expect "unknown player gives 404" 404

KEY="verify-$(date +%s%N)"
GRANT="{\"itemId\":\"health_potion\",\"delta\":1,\"idempotencyKey\":\"$KEY\"}"

req POST /api/players/player-001/inventory "${VIEWER[@]}" "${JSON[@]}" -d "$GRANT"
expect "viewer cannot change inventory" 403

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" -H "Origin: https://evil.example" -d "$GRANT"
expect "cross-origin write is rejected" 403

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" -d "$GRANT"
expect "editor grants an item" 200 "b.replayed === false && b.entry.item.id === 'health_potion'"
QTY=$(node -e 'console.log(JSON.parse(process.argv[1]).entry?.quantity ?? "")' "$BODY")

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" -d "$GRANT"
expect "retry with the same key is not applied twice" 200 "b.replayed === true && b.entry.quantity === ${QTY:-0}"

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" \
  -d "{\"itemId\":\"health_potion\",\"delta\":5,\"idempotencyKey\":\"$KEY\"}"
expect "reusing a key for a different change is a conflict" 409

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" \
  -d "{\"itemId\":\"health_potion\",\"delta\":-100000,\"idempotencyKey\":\"$KEY-neg\"}"
expect "removing more than held is rejected" 422

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" \
  -d "{\"itemId\":\"health_potion\",\"delta\":-1,\"idempotencyKey\":\"$KEY-undo\"}"
expect "editor removes the item again" 200 "b.entry.quantity === ${QTY:-0} - 1"

req POST /api/players/player-001/inventory "${AUTH[@]}" "${JSON[@]}" -d '{"itemId":"x"}'
expect "invalid body is rejected" 400

req GET /api/audit "${AUTH[@]}"
expect "audit log records the grant and removal" 200 \
  "b.entries[0].action === 'inventory.remove' && b.entries[1].action === 'inventory.grant' && b.entries[0].actor === 'editor@local.test'"

req GET /players/player-001
expect "deep link serves the UI shell" 200
assert "UI shell is the SPA index.html" grep -q '<div id="root">' <<<"$BODY"
