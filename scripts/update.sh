#!/bin/bash
# MirrorOS OTA Update Script
# Runs nightly at 2am via cron: 0 2 * * * /home/$(whoami)/mirroros/scripts/update.sh

LOG="/var/log/mirroros/updates.log"
DIR="/home/$(whoami)/mirroros"

mkdir -p "$(dirname $LOG)"
echo "$(date): Starting update..." >> $LOG

cd $DIR || { echo "$(date): Could not cd to $DIR" >> $LOG; exit 1; }

# Must be a git repo
if [ ! -d ".git" ]; then
  echo "$(date): Not a git repo, skipping" >> $LOG
  exit 1
fi

# Stash any local changes so pull doesn't fail
git stash >> $LOG 2>&1

# Pull latest from GitHub
git pull origin main >> $LOG 2>&1

if [ $? -ne 0 ]; then
  echo "$(date): Git pull failed" >> $LOG
  exit 1
fi

# Install any new npm packages
npm install --production --silent >> $LOG 2>&1

# Restart PM2 processes
pm2 restart all >> $LOG 2>&1
pm2 save        >> $LOG 2>&1

echo "$(date): Update complete" >> $LOG
