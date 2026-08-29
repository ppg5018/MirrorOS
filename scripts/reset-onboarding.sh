#!/usr/bin/env bash
#
# MirrorOS — reset onboarding state
# ------------------------------------------------------------------
# Clears the "setup complete" flag and all connected-service config so the
# mirror boots back into the phone setup wizard — as if it were a fresh unit.
#
# It does NOT touch .env, the API key, Wi-Fi, or wake-word settings.
# Everything removed is backed up to config/_backup_<timestamp>/ first, so you
# can restore if needed.
#
# Usage:
#   bash scripts/reset-onboarding.sh          # full reset (re-run whole wizard)
#   bash scripts/reset-onboarding.sh --flag   # only clear the completion flag
#                                             # (keeps services connected)
# ------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/config"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$CFG/_backup_$STAMP"

# Files that hold onboarding / connection state
STATE_FILES=(
  user.json
  setup-complete.json
  imap.json
  calendar.json
  spotify-token.json
  spotify-device.json
  google-token.json
)
STATE_DIRS=( whatsapp-auth )

mkdir -p "$BACKUP"

echo "==> Backing up current state to: ${BACKUP#$ROOT/}"
for f in "${STATE_FILES[@]}"; do
  [[ -f "$CFG/$f" ]] && cp -p "$CFG/$f" "$BACKUP/" && echo "    saved $f"
done
for d in "${STATE_DIRS[@]}"; do
  [[ -d "$CFG/$d" ]] && cp -rp "$CFG/$d" "$BACKUP/" && echo "    saved $d/"
done

if [[ "${1:-}" == "--flag" ]]; then
  echo "==> Clearing completion flag only (services stay connected)…"
  if [[ -f "$CFG/user.json" ]]; then
    node -e '
      const fs=require("fs"); const p=process.argv[1];
      const c=JSON.parse(fs.readFileSync(p,"utf8"));
      delete c.setupComplete; delete c.setupCompletedAt;
      fs.writeFileSync(p, JSON.stringify(c,null,2));
    ' "$CFG/user.json"
  fi
  rm -f "$CFG/setup-complete.json"
else
  echo "==> Removing all onboarding + service state…"
  for f in "${STATE_FILES[@]}"; do rm -f "$CFG/$f" && echo "    removed $f"; done
  for d in "${STATE_DIRS[@]}"; do rm -rf "$CFG/$d" && echo "    removed $d/"; done
fi

echo "==> Restarting the mirror backend…"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart mirroros-backend >/dev/null 2>&1 || pm2 restart all >/dev/null 2>&1 || true
  echo "    pm2 restarted"
else
  echo "    (pm2 not found — restart the server manually: npm start)"
fi

echo ""
echo "✓ Reset done. Open the wizard on your phone:"
echo "    http://mira.local:3000/setup    (or http://<mirror-ip>:3000/setup)"
echo ""
echo "Backup kept at: ${BACKUP#$ROOT/}  — delete it once you're happy."
