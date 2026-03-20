import React from 'react';

const events = [
  {
    id: 1,
    time: '9:00',
    period: 'AM',
    title: 'Morning Standup',
    location: 'Zoom · Daily',
    active: false,
    done: true,
  },
  {
    id: 2,
    time: '11:00',
    period: 'AM',
    title: 'Strategy Review — Ravi',
    location: 'Boardroom 2',
    active: true,
    done: false,
  },
  {
    id: 3,
    time: '1:00',
    period: 'PM',
    title: 'Lunch with Client',
    location: 'The Oberoi, Pune',
    active: false,
    done: false,
  },
  {
    id: 4,
    time: '3:30',
    period: 'PM',
    title: 'Product Demo',
    location: 'Google Meet',
    active: false,
    done: false,
  },
];

export function CalendarWidget() {
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
        Today's Schedule
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.map((event, idx) => (
          <div
            key={event.id}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 18,
              paddingTop: 14,
              paddingBottom: 14,
              borderBottom: idx < events.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              position: 'relative',
            }}
          >
            {event.active && (
              <div style={{
                position: 'absolute',
                left: -20,
                top: 10,
                bottom: 10,
                width: 2.5,
                background: '#00D4FF',
                borderRadius: 2,
                boxShadow: '0 0 10px rgba(0,212,255,0.8)',
              }} />
            )}

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'center',
              width: 52,
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: 300,
                color: event.active
                  ? 'rgba(255,255,255,0.95)'
                  : event.done
                  ? 'rgba(255,255,255,0.42)'
                  : 'rgba(255,255,255,0.72)',
                letterSpacing: '0.5px',
                lineHeight: 1,
              }}>
                {event.time}
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                fontWeight: 300,
                color: event.active ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.42)',
                letterSpacing: '1px',
                marginTop: 2,
              }}>
                {event.period}
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
              paddingTop: 2,
            }}>
              <div style={{
                width: event.active ? 10 : 6,
                height: event.active ? 10 : 6,
                borderRadius: '50%',
                background: event.active
                  ? '#00D4FF'
                  : event.done
                  ? 'rgba(255,255,255,0.25)'
                  : 'rgba(255,255,255,0.45)',
                boxShadow: event.active ? '0 0 8px rgba(0,212,255,0.9)' : 'none',
                flexShrink: 0,
                transition: 'all 0.3s ease',
              }} />
              {idx < events.length - 1 && (
                <div style={{
                  width: 1,
                  flex: 1,
                  marginTop: 5,
                  background: event.active
                    ? 'linear-gradient(180deg, rgba(0,212,255,0.4), rgba(255,255,255,0.10))'
                    : 'rgba(255,255,255,0.12)',
                  minHeight: 18,
                }} />
              )}
            </div>

            <div style={{ flex: 1, paddingTop: event.active ? 0 : 1 }}>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 16,
                fontWeight: 300,
                color: event.active
                  ? 'rgba(255,255,255,1.0)'
                  : event.done
                  ? 'rgba(255,255,255,0.40)'
                  : 'rgba(255,255,255,0.88)',
                letterSpacing: '0.2px',
                textDecoration: event.done ? 'line-through' : 'none',
                lineHeight: 1.2,
              }}>
                {event.title}
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 300,
                color: event.active ? 'rgba(0,212,255,0.85)' : 'rgba(255,255,255,0.50)',
                letterSpacing: '1.2px',
                marginTop: 4,
                textTransform: 'uppercase',
              }}>
                {event.location}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
