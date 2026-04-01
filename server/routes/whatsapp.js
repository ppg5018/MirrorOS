const express = require('express')
const router = express.Router()
const {
  getMessages,
  getMessagesFromContact,
  getConnectionStatus,
  getQR
} = require('../whatsapp/client')

router.get('/', (req, res) => {
  if (!getConnectionStatus()) {
    return res.json({ unread: 0, contacts: [], connected: false })
  }
  res.json(getMessages())
})

router.get('/status', (req, res) => {
  res.json({ connected: getConnectionStatus(), hasQR: !!getQR() })
})

router.get('/qr', (req, res) => {
  if (getConnectionStatus()) {
    return res.json({ connected: true, message: 'Already connected' })
  }
  const qr = getQR()
  if (qr) {
    return res.json({ qr, message: 'Scan this QR' })
  }
  res.json({ waiting: true, message: 'QR not ready yet, wait 5s' })
})

router.get('/contact/:name', (req, res) => {
  const data = getMessagesFromContact(req.params.name)
  if (!data) return res.status(404).json({ error: 'Contact not found' })
  res.json(data)
})

module.exports = router
