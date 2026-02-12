#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3001}"
: "${TOKEN:?TOKEN is required}"

hdr=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

get_ids () {
  local endpoint="$1"
  local page=1
  while true; do
    resp="$(curl -s "${hdr[@]}" "${BASE}/${endpoint}?page=${page}&pageSize=200")"
    ids="$(python3 - <<'PY' "$resp"
import sys, json
d=json.loads(sys.argv[1])
items=d.get("items",[])
print("\n".join([x["id"] for x in items if "id" in x]))
print("__COUNT__=" + str(len(items)))
PY
)"
    count="$(echo "$ids" | sed -n 's/^__COUNT__=//p')"
    echo "$ids" | grep -v '^__COUNT__=' || true

    if [[ "${count}" == "0" ]]; then
      break
    fi
    page=$((page+1))
  done
}

delete_ids () {
  local endpoint="$1"
  local ids="$2"
  if [[ -z "${ids}" ]]; then
    return
  fi

  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    code="$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${hdr[@]}" "${BASE}/${endpoint}/${id}" || true)"
    echo "DEL ${endpoint} ${id} -> ${code}"
  done <<< "$ids"
}

echo "==> Fetching ALL orders..."
orders="$(get_ids "orders" | sed '/^\s*$/d' || true)"
echo "Orders: $(echo "$orders" | sed '/^\s*$/d' | wc -l | tr -d ' ')"
echo "==> Deleting orders..."
delete_ids "orders" "$orders"

echo "==> Fetching ALL contacts..."
contacts="$(get_ids "contacts" | sed '/^\s*$/d' || true)"
echo "Contacts: $(echo "$contacts" | sed '/^\s*$/d' | wc -l | tr -d ' ')"
echo "==> Deleting contacts..."
delete_ids "contacts" "$contacts"

echo "==> Fetching ALL companies..."
companies="$(get_ids "companies" | sed '/^\s*$/d' || true)"
echo "Companies: $(echo "$companies" | sed '/^\s*$/d' | wc -l | tr -d ' ')"
echo "==> Deleting companies..."
delete_ids "companies" "$companies"

echo "✅ Reset done"
