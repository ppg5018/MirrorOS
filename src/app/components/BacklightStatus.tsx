import React from 'react';

export function BacklightStatus() {
  return (
    <div>
      {/* Section title */}
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: '3px',
        color: 'rgba(255,255,255,0.32)',
        textTransform: 'uppercase',
        marginBottom: 16,
      }}>
        Mirror Status
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Sunrise mode pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 16px',
            border: '1px solid rgba(255,155,50,0.20)',
            borderRadius: 24,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 300,
            color: 'rgba(255,165,80,0.70)',
            letterSpacing: '1px',
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'rgba(255,155,50,0.90)',
              boxShadow: '0 0 6px rgba(255,155,50,0.55)',
              flexShrink: 0,
            }} />
            Sunrise Mode
          </div>

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.22)',
            letterSpacing: '1px',
          }}>
            Auto · 6:20 AM
          </div>
        </div>

        {/* Music sync indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 16px',
            border: '1px solid rgba(0,212,255,0.14)',
            borderRadius: 24,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 300,
            color: 'rgba(0,212,255,0.55)',
            letterSpacing: '1px',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(0,212,255,0.65)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6"  cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Music Sync
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            color: 'rgba(0,255,136,0.45)',
            letterSpacing: '1.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#00FF88',
              opacity: 0.65,
            }} />
            Active
          </div>
        </div>

        {/* Brightness indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          paddingTop: 6,
        }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: '2px',
            color: 'rgba(255,255,255,0.25)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}>
            Brightness
          </div>
          <div style={{
            flex: 1,
            height: 2,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 2,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: '72%',
              background: 'linear-gradient(90deg, rgba(0,212,255,0.4), rgba(0,212,255,0.65))',
              borderRadius: 2,
            }} />
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '1px',
            flexShrink: 0,
          }}>
            72%
          </div>
        </div>
      </div>
    </div>
  );
}
