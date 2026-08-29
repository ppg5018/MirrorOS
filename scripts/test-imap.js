#!/usr/bin/env node
/**
 * MirrorOS — IMAP diagnostic
 * Run on the machine hosting the mirror:  node scripts/test-imap.js
 * Prints the exact reason email sync is failing, without leaking the password.
 */

const path = require('path')
const CONFIG_PATH = path.join(__dirname, '../config/imap.json')

function mask(pw) {
  if (!pw) return '(empty)'
  return pw.slice(0, 2) + '*'.repeat(Math.max(0, pw.length - 4)) + pw.slice(-2)
}

;(async () => {
  let cfg
  try {
    cfg = require(CONFIG_PATH)
  } catch (e) {
    console.log('❌ config/imap.json missing or invalid JSON:', e.message)
    process.exit(1)
  }

  console.log('── config ─────────────────────────')
  console.log('  email      :', cfg.email)
  console.log('  host       :', cfg.host || 'imap.gmail.com (default)')
  console.log('  port       :', cfg.port || '993 (default)')
  console.log('  appPassword:', mask(cfg.appPassword), `(len ${(cfg.appPassword || '').length}, spaces: ${/\s/.test(cfg.appPassword || '')})`)
  console.log()

  if (/\s/.test(cfg.appPassword || '')) {
    console.log('⚠ App password contains spaces — Google shows it as "abcd efgh ijkl mnop" but you must store it with NO spaces (16 chars).')
  }

  let ImapFlow
  try {
    ({ ImapFlow } = require('imapflow'))
  } catch (e) {
    console.log('❌ imapflow not installed. Run:  npm install imapflow')
    process.exit(1)
  }

  const client = new ImapFlow({
    host: cfg.host || 'imap.gmail.com',
    port: cfg.port || 993,
    secure: true,
    auth: { user: cfg.email, pass: cfg.appPassword },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
  })

  console.log('── connecting ─────────────────────')
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const uids = await client.search({ seen: false }, { uid: true }) || []
    lock.release()
    await client.logout()
    console.log('✅ SUCCESS — connected & authenticated.')
    console.log('   Unread messages in INBOX:', uids.length)

    // ── Now run the REAL helper the route uses (includes preview fetch) ──
    console.log()
    console.log('── running the actual getUnreadSummary() helper ──')
    try {
      const helper = require(path.join(__dirname, '../server/helpers/imap-mail'))
      const summary = await helper.getUnreadSummary()
      console.log('✅ helper OK — unread:', summary.unread, '| previews:', (summary.previews || []).length, '| name:', summary.name)
    } catch (he) {
      console.log('❌ helper FAILED (this is what the dashboard sees):')
      console.log('   message:', he.message)
      console.log('   stack  :', he.stack)
    }
  } catch (e) {
    console.log('❌ FAILED')
    console.log('   name        :', e.name)
    console.log('   code        :', e.code)
    console.log('   authFailed  :', e.authenticationFailed)
    console.log('   serverText  :', e.responseText)
    console.log('   message     :', e.message)
    console.log()
    // Human-readable hints
    if (e.authenticationFailed || /invalid credentials|AUTHENTICATIONFAILED/i.test(e.responseText || e.message || '')) {
      console.log('👉 Auth rejected. Likely causes:')
      console.log('   • The App Password was revoked or is wrong → generate a new one at')
      console.log('     https://myaccount.google.com/apppasswords (paste WITHOUT spaces).')
      console.log('   • 2-Step Verification is OFF on the account → App Passwords require it ON.')
    } else if (/ENOTFOUND|EAI_AGAIN/.test(e.code || '')) {
      console.log('👉 DNS/network problem reaching imap.gmail.com (offline, VPN, or DNS).')
    } else if (/ETIMEDOUT|timeout/i.test(e.code || e.message || '')) {
      console.log('👉 Connection timed out — a firewall/network is blocking outbound port 993.')
    } else if (/ECONNREFUSED/.test(e.code || '')) {
      console.log('👉 Connection refused — wrong host/port, or port 993 blocked.')
    }
    process.exit(2)
  }
})()
