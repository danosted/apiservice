# Sandbox checks, sourced by scripts/verify.sh (see there for the helpers).

# Bytes 00 01 02 ff fe "Hello"; covers values that aren't valid UTF-8.
DATA_B64="AAEC//5IZWxsbw=="

req POST /items "${AUTH[@]}" "${JSON[@]}" \
  -d "{\"name\":\"verify-item\",\"count\":42,\"price\":19.99,\"active\":true,\"data\":\"$DATA_B64\",\"metadata\":{\"tags\":[\"a\",\"b\"],\"nested\":{\"x\":1}}}"
expect "POST /items stores every field type" 201 \
  "b.id && b.name === 'verify-item' && b.count === 42 && b.price === 19.99 && b.active === true && b.data === '$DATA_B64' && b.metadata.nested.x === 1 && b.created_at"
ITEM_ID=$(json_get id)

req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{"name":"verify-minimal"}'
expect "POST /items with only a name defaults the rest" 201 \
  "b.count === null && b.price === null && b.active === false && b.data === null && b.metadata === null"
MINIMAL_ID=$(json_get id)

if [ -n "$ITEM_ID" ]; then
  req GET "/items/$ITEM_ID" "${AUTH[@]}"
  expect "GET /items/:id round-trips binary data unchanged" 200 "b.id === '$ITEM_ID' && b.data === '$DATA_B64'"

  req GET /items "${AUTH[@]}"
  expect "GET /items lists the new item" 200 "b.items.some(i => i.id === '$ITEM_ID')"
fi

req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{"count":1}'
expect "missing name is rejected" 400 "/name/.test(b.error)"
req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{"name":"x","count":1.5}'
expect "non-integer count is rejected" 400 "/count/.test(b.error)"
req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{"name":"x","active":"yes"}'
expect "non-boolean active is rejected" 400 "/active/.test(b.error)"
req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{"name":"x","data":"!!!"}'
expect "invalid base64 is rejected" 400 "/base64/.test(b.error)"
req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{"name":"x","metadata":[1]}'
expect "array metadata is rejected" 400 "/metadata/.test(b.error)"
req POST /items "${AUTH[@]}" "${JSON[@]}" -d '{nope'
expect "malformed JSON is rejected" 400 "/JSON/.test(b.error)"

req PUT /items "${AUTH[@]}"
expect "unsupported method gives 405" 405

for id in "$ITEM_ID" "$MINIMAL_ID"; do
  [ -n "$id" ] || continue
  req DELETE "/items/$id" "${AUTH[@]}"
  expect "DELETE /items/:id removes it" 204
done

if [ -n "$ITEM_ID" ]; then
  req GET "/items/$ITEM_ID" "${AUTH[@]}"
  expect "deleted item is gone" 404
  req DELETE "/items/$ITEM_ID" "${AUTH[@]}"
  expect "deleting it again gives 404" 404
fi
