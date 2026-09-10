#!/usr/bin/env node
/**
 * MirrorOS — Spotify Connect device check
 *
 * Answers "why isn't music playing on the mirror?" by listing every Connect
 * device your account can see and saying whether Mira's own speaker is among
 * them. Run this on the Pi.
 *
 * Usage: npm run spotify:devices
 */

require('dotenv').config()

const path = require('path')
const { getValidToken, isConnected } = require(path.join(__dirname, '../server/helpers/spotify-auth'))

function targetName() {
  if (process.env.SPOTIFY_DEVICE_NAME) return process.env.SPOTIFY_DEVICE_NAME
  try {
    const cfg = require(path.join(__dirname, '../config/spotify-device.json'))
    if (cfg.name) return cfg.name
  } catch (e) { /* not configured */ }
  return 'Mira'
}

async function main() {
  if (!isConnected()) {
    console.error('✗ Spotify account not linked. Run: npm run setup:spotify')
    process.exit(1)
  }

  const token = await getValidToken()
  if (!token) {
    console.error('✗ Could not get a valid access token — try re-running: npm run setup:spotify')
    process.exit(1)
  }

  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: 'Bearer ' + token }
  })
  if (!res.ok) {
    console.error(`✗ Spotify API ${res.status} while listing devices`)
    process.exit(1)
  }

  const wanted  = targetName()
  const devices = (await res.json()).devices || []

  console.log(`\nTarget device name: "${wanted}"\n`)
  if (!devices.length) {
    console.log('  (no Spotify Connect devices visible at all)')
  }
  for (const d of devices) {
    const match = (d.name || '').toLowerCase().includes(wanted.toLowerCase())
    console.log(
      `  ${match ? '►' : ' '} ${d.name}  [${d.type}]${d.is_active ? '  (active)' : ''}`
    )
  }

  const found = devices.some(d => (d.name || '').toLowerCase().includes(wanted.toLowerCase()))
  if (found) {
    console.log(`\n✓ "${wanted}" is online — music will play on the mirror's speaker.\n`)
    return
  }

  console.log(`\n✗ "${wanted}" is NOT in the list, so the mirror has no speaker to play on.`)
  console.log('  Fix, in order:')
  console.log('    1. sudo bash scripts/setup-raspotify.sh ' + wanted)
  console.log('    2. systemctl status raspotify        (confirm it is running)')
  console.log('    3. On your phone, same Wi-Fi: open Spotify → Devices → pick "' + wanted + '" once.')
  console.log('       librespot only appears here after it has been selected at least once.')
  console.log('    4. Re-run this check.')
  console.log('  Spotify Premium is required for Connect playback.\n')
  process.exitCode = 2
}

main().catch(err => {
  console.error('✗', err.message)
  process.exit(1)
})
