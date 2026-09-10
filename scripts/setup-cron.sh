#!/bin/bash
echo "Setting up nightly auto-update at 2am..."

# Resolve the project folder from this script's location (on the Pi:
# /home/mira/Desktop/MirrorOs), so the cron line always points at the real copy.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/update.sh"

# Add cron job — drop any older MirrorOS update line first (e.g. the old
# ~/mirroros path) so re-running never leaves duplicates or a dead entry.
( crontab -l 2>/dev/null | grep -vF 'scripts/update.sh'; \
  echo "0 2 * * * $SCRIPT" ) | crontab -

echo "Cron job added. Mirror will auto-update at 2am daily."
echo ""
echo "Current crontab:"
crontab -l
