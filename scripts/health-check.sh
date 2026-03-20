#!/bin/bash
echo "=== MirrorOS Health Check ==="
echo ""

BASE="http://localhost:3000"
PASS=0
FAIL=0

check() {
  local name=$1
  local url=$2
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "200" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (HTTP $code)"
    FAIL=$((FAIL + 1))
  fi
}

echo "API Routes:"
check "Backend server"  "$BASE/api/status"
check "Weather"         "$BASE/api/weather"
check "Calendar"        "$BASE/api/calendar"
check "Gmail"           "$BASE/api/gmail"
check "WhatsApp"        "$BASE/api/whatsapp"
check "Tasks"           "$BASE/api/tasks"
check "Mirror UI"       "$BASE"
check "Companion app"   "$BASE/companion/"

echo ""
echo "PM2 Processes:"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    procs = json.load(sys.stdin)
    for p in procs:
        status = p['pm2_env']['status']
        name   = p['name']
        icon   = '✓' if status == 'online' else '✗'
        print(f'  {icon} {name} ({status})')
except Exception:
    pass
" 2>/dev/null || pm2 status

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
  echo "Mirror is healthy and ready!"
else
  echo "Some checks failed — run: pm2 logs"
fi
