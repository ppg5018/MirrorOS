const os = require('os')

function getLanIP() {
  const interfaces = os.networkInterfaces()
  const priority = ['wlan0', 'eth0', 'en0', 'en1']

  for (const name of priority) {
    const iface = interfaces[name]
    if (!iface) continue
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }

  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name]) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }

  return 'localhost'
}

function getMirrorBaseURL() {
  if (process.env.MIRROR_BASE_URL) return process.env.MIRROR_BASE_URL
  const port = process.env.PORT || 3000
  return `http://${getLanIP()}:${port}`
}

function getGoogleRedirectURI() {
  return `${getMirrorBaseURL()}/auth/google/callback`
}

module.exports = { getLanIP, getMirrorBaseURL, getGoogleRedirectURI }
