import React from 'react';

function SunIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(255,210,80,1.0)" strokeWidth="1.1" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.5" />
      <line x1="12" y1="2"  x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2"  y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93"   x2="6.64" y2="6.64" />
      <line x1="17.36" y1="17.36" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07"  x2="6.64" y2="17.36" />
      <line x1="17.36" y1="6.64"  x2="19.07" y2="4.93" />
    </svg>
  );
}

function PartlyCloudyLargeIcon({ size = 52 }: { size?: number }) {
  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 70 50" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="26" cy="18" r="9" stroke="rgba(255,210,80,0.95)" strokeWidth="1.2" />
      <line x1="26" y1="4"  x2="26" y2="8"  stroke="rgba(255,210,80,0.75)" strokeWidth="1.1" />
      <line x1="14" y1="18" x2="18" y2="18" stroke="rgba(255,210,80,0.75)" strokeWidth="1.1" />
      <line x1="17" y1="9"  x2="20" y2="12" stroke="rgba(255,210,80,0.75)" strokeWidth="1.1" />
      <line x1="35" y1="9"  x2="32" y2="12" stroke="rgba(255,210,80,0.75)" strokeWidth="1.1" />
      <path d="M20 36 a11 11 0 0 1 0-22 a9 9 0 0 1 17 4 a8 8 0 0 1 1 16 Z"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" />
    </svg>
  );
}

function PartlyCloudyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 32 22" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="9" r="4" stroke="rgba(255,210,80,0.95)" strokeWidth="1.1" />
      <line x1="13" y1="3"  x2="13" y2="5"  stroke="rgba(255,210,80,0.80)" strokeWidth="1" />
      <line x1="7"  y1="9"  x2="9"  y2="9"  stroke="rgba(255,210,80,0.80)" strokeWidth="1" />
      <line x1="8.5" y1="4.5" x2="10" y2="6" stroke="rgba(255,210,80,0.80)" strokeWidth="1" />
      <path d="M10 17 a5 5 0 0 1 0-10 a4 4 0 0 1 7.5 2 a3.5 3.5 0 0 1 .5 7 Z"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.1" />
    </svg>
  );
}

function CloudIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10a6 6 0 0 0-10.9-3.4A4 4 0 1 0 7 18h11a3 3 0 0 0 0-8Z" />
    </svg>
  );
}

function RainIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(130,200,255,0.90)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 13a6 6 0 0 0-10.3-4.2A4 4 0 1 0 5 17h11a3 3 0 0 0 0-4Z" />
      <line x1="8" y1="20" x2="8" y2="22" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="16" y1="20" x2="16" y2="22" />
    </svg>
  );
}

type IconType = 'sun' | 'partly-cloudy' | 'cloudy' | 'rain';
function WeatherIcon({ type, size = 18 }: { type: IconType; size?: number }) {
  switch (type) {
    case 'sun':           return <SunIcon size={size} />;
    case 'partly-cloudy': return <PartlyCloudyIcon size={size} />;
    case 'cloudy':        return <CloudIcon size={size} />;
    case 'rain':          return <RainIcon size={size} />;
  }
}

const forecast: { day: string; icon: IconType; high: number; low: number }[] = [
  { day: 'THU', icon: 'sun',           high: 31, low: 22 },
  { day: 'FRI', icon: 'partly-cloudy', high: 28, low: 21 },
  { day: 'SAT', icon: 'cloudy',        high: 25, low: 20 },
  { day: 'SUN', icon: 'rain',          high: 23, low: 18 },
];

export function WeatherWidget() {
  return (
    <div>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: '3px',
        color: 'rgba(255,255,255,0.70)',
        textTransform: 'uppercase',
        marginBottom: 18,
      }}>
        Weather
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 6 }}>
        <PartlyCloudyLargeIcon size={52} />
        <div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 80,
            fontWeight: 100,
            letterSpacing: '2px',
            color: 'rgba(255,255,255,1.0)',
            lineHeight: 1,
          }}>
            28°
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 300,
            letterSpacing: '3px',
            color: 'rgba(255,255,255,0.75)',
            textTransform: 'uppercase',
            marginTop: 6,
          }}>
            Pune · Partly Cloudy
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: 0,
        marginTop: 22,
        paddingTop: 18,
        borderTop: '1px solid rgba(255,255,255,0.12)',
      }}>
        {forecast.map((f, i) => (
          <div key={f.day} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            borderRight: i < 3 ? '1px solid rgba(255,255,255,0.10)' : 'none',
          }}>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '2.5px',
              color: 'rgba(255,255,255,0.68)',
            }}>
              {f.day}
            </div>
            <WeatherIcon type={f.icon} size={18} />
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              fontWeight: 300,
              color: 'rgba(255,255,255,0.95)',
            }}>
              {f.high}°
            </div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              fontWeight: 300,
              color: 'rgba(255,255,255,0.58)',
            }}>
              {f.low}°
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <div style={{
          padding: '5px 14px',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 20,
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.78)',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}>
          <span style={{ color: 'rgba(100,210,255,1.0)', fontSize: 10 }}>◈</span>
          65% Humidity
        </div>
        <div style={{
          padding: '5px 14px',
          border: '1px solid rgba(255,107,53,0.40)',
          borderRadius: 20,
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 300,
          color: 'rgba(255,140,80,0.95)',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}>
          <span style={{ color: '#FF6B35', fontSize: 10 }}>●</span>
          AQI 78 · Moderate
        </div>
      </div>
    </div>
  );
}
