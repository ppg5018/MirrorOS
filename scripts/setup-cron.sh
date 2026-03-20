#!/bin/bash
echo "Setting up nightly auto-update at 2am..."

SCRIPT="/home/$(whoami)/mirroros/scripts/update.sh"

# Add cron job (avoid duplicates)
( crontab -l 2>/dev/null | grep -v 'mirroros.*update.sh'; \
  echo "0 2 * * * $SCRIPT" ) | crontab -

echo "Cron job added. Mirror will auto-update at 2am daily."
echo ""
echo "Current crontab:"
crontab -l
