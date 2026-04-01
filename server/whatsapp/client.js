// Polyfill Web Crypto for Node.js 18 (required by Baileys)
if (!globalThis.crypto) {
  globalThis.crypto = require('crypto').webcrypto
}

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const { Boom } = require('@hapi/boom')
const qrcode = require('qrcode-terminal')
const pino = require('pino')
const path = require('path')
const fs = require('fs')

const AUTH_FOLDER = path.join(__dirname, '../../config/whatsapp-auth')

let messageStore = {}
let sock = null
let isConnected = false
let io = null
let qrString = null

async function connectWhatsApp(socketIO) {
  io = socketIO
  fs.mkdirSync(AUTH_FOLDER, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)
  const { version } = await fetchLatestBaileysVersion()

  console.log('[WhatsApp] Connecting with Baileys v' + version.join('.'))

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    getMessage: async () => undefined,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrString = qr
      console.log('\n[WhatsApp] Scan this QR code:')
      qrcode.generate(qr, { small: true })
      if (io) io.emit('whatsapp:qr', { qr })
    }

    if (connection === 'close') {
      isConnected = false
      qrString = null
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut

      console.log('[WhatsApp] Disconnected. Code:', code, '| Error:', lastDisconnect?.error?.message || 'none')
      if (io) io.emit('whatsapp:status', { connected: false })

      if (shouldReconnect) {
        console.log('[WhatsApp] Reconnecting in 5s...')
        setTimeout(() => connectWhatsApp(io), 5000)
      } else {
        console.log('[WhatsApp] Logged out. Delete config/whatsapp-auth to reconnect.')
      }
    }

    if (connection === 'open') {
      isConnected = true
      qrString = null
      console.log('[WhatsApp] Connected successfully!')
      if (io) io.emit('whatsapp:status', { connected: true })
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue
      if (msg.key.remoteJid === 'status@broadcast') continue

      const jid = msg.key.remoteJid
      const isGroup = jid.endsWith('@g.us')

      let contactName = jid.split('@')[0]
      try {
        const contacts = sock.store?.contacts || {}
        const contact = contacts[jid]
        if (contact?.name) contactName = contact.name
        else if (contact?.notify) contactName = contact.notify
        else if (contact?.verifiedName) contactName = contact.verifiedName
      } catch (e) {}

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedDisplayText ||
        '[Media]'

      if (!messageStore[jid]) {
        messageStore[jid] = {
          name: contactName,
          messages: [],
          unread: 0,
          isGroup,
          jid
        }
      }

      messageStore[jid].messages.push({
        text,
        timestamp: msg.messageTimestamp,
        fromMe: false
      })

      if (messageStore[jid].messages.length > 10) {
        messageStore[jid].messages.shift()
      }

      messageStore[jid].unread++
      messageStore[jid].lastMessage = text
      messageStore[jid].lastTime = msg.messageTimestamp
      messageStore[jid].name = contactName

      console.log(`[WhatsApp] New message from ${contactName}: ${text.substring(0, 40)}`)

      if (io) {
        io.emit('whatsapp:message', {
          from: contactName,
          text: text.substring(0, 60),
          isGroup,
          timestamp: msg.messageTimestamp
        })
      }
    }
  })

  return sock
}

function getMessages() {
  const contacts = Object.values(messageStore)
    .filter(c => c.unread > 0)
    .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0))
    .slice(0, 8)

  return {
    unread: contacts.reduce((sum, c) => sum + c.unread, 0),
    contacts: contacts.map(c => ({
      name: c.name,
      preview: c.lastMessage || '',
      count: c.unread,
      isGroup: c.isGroup
    })),
    connected: isConnected,
    mock: false
  }
}

function getMessagesFromContact(contactName) {
  const entry = Object.values(messageStore).find(c =>
    c.name.toLowerCase().includes(contactName.toLowerCase()) ||
    c.jid.includes(contactName)
  )
  if (!entry) return null
  return {
    name: entry.name,
    messages: entry.messages.slice(-5),
    unread: entry.unread
  }
}

function markAsRead(jid) {
  if (messageStore[jid]) messageStore[jid].unread = 0
}

function getConnectionStatus() { return isConnected }
function getQR() { return qrString }

async function sendMessage(jid, text) {
  if (!sock || !isConnected) throw new Error('WhatsApp not connected')
  await sock.sendMessage(jid, { text })
}

module.exports = {
  connectWhatsApp,
  getMessages,
  getMessagesFromContact,
  markAsRead,
  getConnectionStatus,
  getQR,
  sendMessage
}
