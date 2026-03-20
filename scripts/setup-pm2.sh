#!/bin/bash
set -e
echo "=== MirrorOS PM2 Setup ==="

# Create log directory
sudo mkdir -p /var/log/mirroros
sudo chown "$USER:$USER" /var/log/mirroros
echo "✓ Log directory ready: /var/log/mirroros"

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2 globally..."
  npm install -g pm2
fi
echo "✓ PM2 $(pm2 --version)"

# Stop any existing MirrorOS processes cleanly
pm2 delete mirroros-backend 2>/dev/null || true
pm2 delete mirroros-voice   2>/dev/null || true

# Start all processes from ecosystem config
pm2 start ecosystem.config.js

# Save PM2 process list so it survives reboots
pm2 save

echo ""
echo "=== Auto-start on Boot ==="
pm2 startup
echo ""
echo "↑ Copy the command above and run it to enable auto-start on boot"
echo ""

# Show current status
pm2 status

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Useful commands:"
echo "  pm2 status           → see all processes"
echo "  pm2 logs             → live logs (Ctrl+C to exit)"
echo "  pm2 logs backend     → backend logs only"
echo "  pm2 restart all      → restart everything"
echo "  pm2 stop all         → stop everything"
echo "  pm2 monit            → interactive process monitor"
