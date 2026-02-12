


set -euo pipefail

API="${API:-http://localhost:3000/api}"
BACKEND="${BACKEND:-http://localhost:3001}"
TOKEN="${TOKEN:-}"

if [[ -z "${TOKEN}" ]]; then
  echo "❌ TOKEN is empty. Export TOKEN first."
  exit 1
fi

bauth=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

create_company () {
  local name="$1"
  curl -sS "${BACKEND}/companies" "${bauth[@]}" -d "{\"name\":\"${name}\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])'
}

create_contact () {
  local companyId="$1"
  local firstName="$2"
  local lastName="$3"
  local phone="$4"
  local email="$5"

  curl -sS "${BACKEND}/contacts" "${bauth[@]}" \
    -d "{\"companyId\":\"${companyId}\",\"firstName\":\"${firstName}\",\"lastName\":\"${lastName}\",\"phone\":\"${phone}\",\"email\":\"${email}\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])'
}

create_order () {
  local companyId="$1"
  local clientId="$2"
  local comment="$3"
  local ownerId="$4"


  curl -sS "${BACKEND}/orders" "${bauth[@]}" \
    -d "{\"ownerId\":\"${ownerId}\",\"companyId\":\"${companyId}\",\"clientId\":\"${clientId}\",\"comment\":\"${comment}\",\"discountAmount\":0}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])'
}

OWNER_ID=$(python3 - <<'PY'
import os, json, base64
t=os.environ["TOKEN"]
p=t.split(".")[1]
pad="="*((4-len(p)%4)%4)
print(json.loads(base64.urlsafe_b64decode((p+pad).encode()))["sub"])
PY
)

echo "OWNER_ID=${OWNER_ID}"

C1=$(create_company "SUPREX LLC")
C2=$(create_company "NOVA TRADE")
C3=$(create_company "KOTYA GROUP")

K1=$(create_contact "$C1" "Ivan" "Petrenko" "+380501111111" "ivan1@test.com")
K2=$(create_contact "$C2" "Olena" "Shevchenko" "+380502222222" "olena2@test.com")
K3=$(create_contact "$C3" "Andrii" "Koval" "+380503333333" "andrii3@test.com")

O1=$(create_order "$C1" "$K1" "Test order for SUPREX" "$OWNER_ID")
O2=$(create_order "$C2" "$K2" "Test order for NOVA" "$OWNER_ID")
O3=$(create_order "$C3" "$K3" "Test order for KOTYA" "$OWNER_ID")

cat > .tmp/demo-ids.env <<EOF
export OWNER_ID="${OWNER_ID}"
export C1="${C1}"
export C2="${C2}"
export C3="${C3}"
export K1="${K1}"
export K2="${K2}"
export K3="${K3}"
export O1="${O1}"
export O2="${O2}"
export O3="${O3}"
EOF

echo "✅ Seed done. Saved to /Users/konstantin/CRM/apps/web/.tmp/demo-ids.env"
echo "C1=$C1"
echo "K1=$K1"
echo "O1=$O1"
