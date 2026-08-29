#!/usr/bin/env bash
#
# MirrorOS — Raspotify (librespot) provisioning
# ------------------------------------------------------------------
# Makes the Pi a Spotify Connect device named "Mira" so music plays out of the
# mirror's own speaker. The MirrorOS backend then controls it via the Spotify
# Web API (see server/routes/spotify.js — it targets the device by name).
#
# Auth model: librespot uses Spotify Connect (zeroconf). After this runs, the
# owner opens their Spotify app on the same Wi-Fi, taps the "Devices" icon, and
# selects "Mira" once. That links Mira to their account (Premium required) and
# it then shows up in /me/player/devices for the Web API to target.
#
# Usage:  sudo bash scripts/setup-raspotify.sh [DEVICE_NAME]
#         DEVICE_NAME defaults to "Mira" (keep it in sync with SPOTIFY_DEVICE_NAME)
# ------------------------------------------------------------------
set -euo pipefail

DEVICE_NAME="${1:-Mira}"
CONF="/etc/raspotify/conf"

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo:  sudo bash scripts/setup-raspotify.sh ${DEVICE_NAME}"
  exit 1
fi

echo "==> Installing Raspotify (librespot Spotify Connect client)…"
if ! command -v raspotify >/dev/null 2>&1 && [[ ! -f "$CONF" ]]; then
  apt-get update -y
  apt-get install -y curl
  curl -sL https://dtcooper.github.io/raspotify/install.sh | sh
else
  echo "    Raspotify already installed — reconfiguring."
fi

echo "==> Configuring device name: ${DEVICE_NAME}"
# Raspotify reads shell-style options from /etc/raspotify/conf.
touch "$CONF"

set_opt() {  # set_opt KEY "VALUE"
  local key="$1"; local val="$2"
  if grep -qE "^\s*#?\s*${key}=" "$CONF"; then
    sed -i "s|^\s*#\?\s*${key}=.*|${key}=${val}|" "$CONF"
  else
    echo "${key}=${val}" >> "$CONF"
  fi
}

set_opt "LIBRESPOT_NAME" "\"${DEVICE_NAME}\""
set_opt "LIBRESPOT_BITRATE" "320"
set_opt "LIBRESPOT_INITIAL_VOLUME" "70"
# Announce as a speaker so it appears sensibly in the Spotify app
set_opt "LIBRESPOT_DEVICE_TYPE" "speaker"

echo "==> Restarting Raspotify…"
systemctl enable raspotify >/dev/null 2>&1 || true
systemctl restart raspotify

echo ""
echo "✓ Raspotify is running as Spotify Connect device: ${DEVICE_NAME}"
echo ""
echo "Next steps:"
echo "  1. Make sure .env has  SPOTIFY_DEVICE_NAME=${DEVICE_NAME}"
echo "  2. On the owner's phone (same Wi-Fi), open Spotify → Devices → pick '${DEVICE_NAME}'."
echo "     (Requires Spotify Premium.) This links Mira to their account."
echo "  3. Say 'play <song>' — audio comes out of the mirror's speaker."
echo ""
echo "Check status any time with:  systemctl status raspotify"
