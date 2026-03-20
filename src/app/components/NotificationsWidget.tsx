import React from 'react';

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" stroke="rgba(37,211,102,0.90)" strokeWidth="1.1" />
      <path
        d="M17.5 14.3c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.2-.5 0-.2-.8-1.9-1.1-2.6-.3-.6-.5-.5-.7-.5H8c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.1 3.1 1.3 3.3c.2.2 2.2 3.4 5.4 4.7 3.2 1.3 3.2.9 3.8.8.6-.1 1.8-.7 2.1-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.3-.5-.5Z"
        fill="rgba(37,211,102,0.85)"
      />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg width="22" height="17" viewBox="0 0 24 18" fill="none">
      <rect x="1" y="1" width="22" height="16" rx="2" stroke="rgba(255,100,100,0.85)" strokeWidth="1.1" />
      <polyline points="1,2 12,10 23,2" stroke="rgba(255,100,100,0.85)" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,107,53,1.0)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

const notifications = [
  {
    id: 1,
    icon: <WhatsAppIcon />,
    sender: 'Ravi Kumar',
    text: 'Running 10 mins late',
    time: '2m',
    urgent: false,
    dot: false,
  },
  {
    id: 2,
    icon: <GmailIcon />,
    sender: 'Invoice Received',
    text: '#2341 received from vendor',
    time: '15m',
    urgent: false,
    dot: true,
  },
  {
    id: 3,
    icon: <CalendarIcon />,
    sender: 'Calendar',
    text: 'Stand-up in 18 minutes',
    time: '18m',
    urgent: true,
    dot: false,
  },
];

export function NotificationsWidget() {
  return (
    <div>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: '3px',
        color: 'rgba(255,255,255,0.70)',
        textTransform: 'uppercase',
        marginBottom: 16,
      }}>
        Notifications
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {notifications.map((n, idx) => (
          <div
            key={n.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              paddingTop: 16,
              paddingBottom: 16,
              borderBottom: idx < notifications.length - 1
                ? '1px solid rgba(255,255,255,0.10)'
                : 'none',
            }}
          >
            <div style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
            }}>
              {n.icon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 300,
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: '1px',
                marginBottom: 3,
              }}>
                {n.sender}
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: 300,
                color: n.urgent ? '#FF6B35' : 'rgba(255,255,255,0.95)',
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {n.text}
              </div>
            </div>

            {n.dot && (
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00D4FF',
                flexShrink: 0,
                boxShadow: '0 0 6px rgba(0,212,255,0.8)',
              }} />
            )}

            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 300,
              color: n.urgent ? 'rgba(255,107,53,1.0)' : 'rgba(255,255,255,0.62)',
              letterSpacing: '1px',
              flexShrink: 0,
              border: n.urgent
                ? '1px solid rgba(255,107,53,0.50)'
                : '1px solid rgba(255,255,255,0.18)',
              padding: '3px 10px',
              borderRadius: 10,
              minWidth: 42,
              textAlign: 'center',
            }}>
              {n.time}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
