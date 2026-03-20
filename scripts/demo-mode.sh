#!/bin/bash
echo "=== MirrorOS Demo Mode ==="

# Make sure all processes are running
pm2 start ecosystem.config.js 2>/dev/null || pm2 restart all

# Set warm backlight
curl -s -X POST http://localhost:3000/api/backlight \
  -H "Content-Type: application/json" \
  -d '{"mode":"warm","brightness":80}' > /dev/null
echo "✓ Backlight set to warm"

# Trigger morning briefing
curl -s -X POST http://localhost:3000/api/briefing > /dev/null
echo "✓ Morning briefing triggered"

# Show integration status
echo ""
echo "Integration Status:"
STATUS=$(curl -s http://localhost:3000/api/status)
echo "$STATUS" | python3 -c "
import json, sys
d = json.load(sys.stdin)
intg = d.get('integrations', {})
items = [
  ('Google/Gmail',  intg.get('google')),
  ('WhatsApp',      intg.get('whatsapp')),
  ('Claude AI',     intg.get('claude')),
  ('Weather',       intg.get('weather')),
]
for name, live in items:
    icon = '✓' if live else '✗'
    print(f'  {icon} {name}')
mem = round(d.get('memory', {}).get('heapUsed', 0) / 1024 / 1024)
print(f\"  Memory: {mem} MB\")
" 2>/dev/null || echo "$STATUS"

IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "Mirror is ready for demo!"
echo "Companion app: http://${IP}:3000/companion"
