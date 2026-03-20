#!/bin/bash
# MirrorOS WiFi Setup — Hotspot AP mode for first-time WiFi configuration
# Run this on the Orange Pi to create a hotspot, then connect from phone
# and visit http://192.168.4.1:3000/setup to enter WiFi credentials.

HOTSPOT_SSID="MirrorOS-Setup"
HOTSPOT_PASS="mirror1234"
HOTSPOT_IP="192.168.4.1"
IFACE="wlan0"

echo "[wifi] Starting MirrorOS hotspot setup..."

# Install hostapd + dnsmasq if not present
if ! command -v hostapd &>/dev/null; then
  apt-get install -y hostapd dnsmasq
fi

# Stop services
systemctl stop hostapd dnsmasq 2>/dev/null || true

# Configure static IP for hotspot interface
cat > /etc/network/interfaces.d/mirroros-ap << EOF
allow-hotplug $IFACE
iface $IFACE inet static
  address $HOTSPOT_IP
  netmask 255.255.255.0
EOF

# Configure hostapd
cat > /etc/hostapd/mirroros.conf << EOF
interface=$IFACE
driver=nl80211
ssid=$HOTSPOT_SSID
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$HOTSPOT_PASS
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

echo 'DAEMON_CONF="/etc/hostapd/mirroros.conf"' > /etc/default/hostapd

# Configure dnsmasq (DHCP for connected clients)
cat > /etc/dnsmasq.d/mirroros.conf << EOF
interface=$IFACE
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
address=/#/$HOTSPOT_IP
EOF

# Bring up interface and start services
ifdown $IFACE 2>/dev/null || true
ifup $IFACE
systemctl start hostapd
systemctl start dnsmasq

echo ""
echo "======================================"
echo "  MirrorOS Hotspot Active"
echo "  SSID    : $HOTSPOT_SSID"
echo "  Password: $HOTSPOT_PASS"
echo "  Open    : http://$HOTSPOT_IP:3000"
echo "======================================"
echo ""
echo "Connect your phone to the hotspot above."
echo "Then open the URL to configure WiFi."
echo ""
echo "Press Ctrl+C when done, then run:"
echo "  systemctl restart networking"
