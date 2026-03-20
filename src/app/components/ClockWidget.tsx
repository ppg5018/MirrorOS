import { useState, useEffect } from 'react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function ClockWidget() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = time.getHours().toString().padStart(2, '0');
  const mm = time.getMinutes().toString().padStart(2, '0');
  const dayName = DAYS[time.getDay()];
  const dateNum = time.getDate();
  const monthName = MONTHS[time.getMonth()];

  return (
    <div>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 124,
        fontWeight: 100,
        letterSpacing: '6px',
        color: 'rgba(255,255,255,1.0)',
        lineHeight: 1,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'baseline',
      }}>
        <span>{hh}</span>
        <span style={{ opacity: 0.55, margin: '0 4px' }}>:</span>
        <span>{mm}</span>
      </div>

      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 18,
        fontWeight: 300,
        letterSpacing: '5px',
        color: 'rgba(255,255,255,0.82)',
        marginTop: 14,
        textTransform: 'uppercase',
        userSelect: 'none',
      }}>
        {dayName}, {dateNum} {monthName}
      </div>

      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 70%, transparent 100%)',
        marginTop: 28,
      }} />
    </div>
  );
}
