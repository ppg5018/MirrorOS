import { useEffect, useState, type CSSProperties } from 'react';

export type MirrorState = 'idle' | 'listening' | 'responding';

/* ─── Corner bracket accent (targeting reticle) ─── */
function CornerBrackets({
  glowing,
  color = '#00D4FF',
  size = 22,
}: {
  glowing?: boolean;
  color?: string;
  size?: number;
}) {
  const s: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    opacity: glowing ? 1 : 0.5,
    transition: 'opacity 0.6s ease',
  };
  const line = `1.5px solid ${color}`;

  return (
    <>
      <div style={{ ...s, top: -1, left: -1, borderTop: line, borderLeft: line }} />
      <div style={{ ...s, top: -1, right: -1, borderTop: line, borderRight: line }} />
      <div style={{ ...s, bottom: -1, left: -1, borderBottom: line, borderLeft: line }} />
      <div style={{ ...s, bottom: -1, right: -1, borderBottom: line, borderRight: line }} />
    </>
  );
}

/* ─── Waveform visualiser ─── */
function Waveform() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 72 }}>
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
        <div key={i} className="wf-bar" style={{ minHeight: 8, width: 4 }} />
      ))}
    </div>
  );
}

/* ─── Idle pulsing dot ─── */
function PulsingDot() {
  return (
    <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: '1px solid rgba(0,212,255,0.45)',
        animation: 'pulse-ring 2.4s ease-in-out infinite',
      }} />
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: '#00D4FF',
        animation: 'pulse-dot 2.4s ease-in-out infinite',
      }} />
    </div>
  );
}

/* ─── Blinking cursor ─── */
function BlinkCursor() {
  return (
    <span style={{
      display: 'inline-block',
      width: 2,
      height: '1em',
      background: '#00D4FF',
      marginLeft: 3,
      verticalAlign: 'text-bottom',
      animation: 'cursor-blink 1s step-end infinite',
    }} />
  );
}

/* ─── Typewriter AI response ─── */
const RESPONSE_TEXT =
  "Your 9am meeting with Ravi has been moved to 11am. You have 3 unread messages from the team.";

function ResponseText() {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(RESPONSE_TEXT.slice(0, i));
      if (i >= RESPONSE_TEXT.length) {
        clearInterval(timer);
        setDone(true);
      }
    }, 26);
    return () => clearInterval(timer);
  }, []);

  return (
    <span>
      {displayed}
      <BlinkCursor />
    </span>
  );
}

/* ─── Main AI Panel ─── */
export function AIPanel({ state }: { state: MirrorState }) {
  const isListening  = state === 'listening';
  const isResponding = state === 'responding';
  const isActive     = isListening || isResponding;

  const panelStyle: CSSProperties = {
    position: 'relative',
    borderRadius: 6,
    padding: '28px 30px',
    border: '1px solid rgba(255,255,255,0.08)',
    transition: 'all 0.6s ease',
    animation: isListening
      ? 'glow-border-active 1.8s ease-in-out infinite'
      : isResponding
      ? 'glow-border-respond 2.5s ease-in-out infinite'
      : 'none',
    background: isActive ? 'rgba(0,212,255,0.022)' : 'transparent',
  };

  return (
    <div style={panelStyle}>
      <CornerBrackets glowing={isActive} />

      {/* ── IDLE ── */}
      {state === 'idle' && (
        <div style={{ animation: 'fade-up 0.5s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '3px',
              color: 'rgba(255,255,255,0.65)',
              textTransform: 'uppercase',
            }}>
              AI Assistant
            </div>
            <PulsingDot />
          </div>

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 26,
            fontWeight: 300,
            color: 'rgba(255,255,255,1.0)',
            letterSpacing: '0.3px',
            marginBottom: 10,
          }}>
            Good morning, Arjun
          </div>

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.68)',
            letterSpacing: '0.3px',
          }}>
            Say{' '}
            <span style={{ color: '#00D4FF', opacity: 0.95 }}>"Hey Mirror"</span>
            {' '}to begin
          </div>
        </div>
      )}

      {/* ── LISTENING ── */}
      {state === 'listening' && (
        <div style={{ animation: 'fade-up 0.4s ease' }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: '3px',
            color: 'rgba(255,255,255,0.65)',
            textTransform: 'uppercase',
            marginBottom: 20,
          }}>
            AI Assistant
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Waveform />
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              fontWeight: 300,
              color: '#00D4FF',
              letterSpacing: '3px',
              textTransform: 'uppercase',
            }}>
              Listening...
            </div>
          </div>

          {/* Outer glow ring */}
          <div style={{
            position: 'absolute',
            inset: -10,
            borderRadius: 10,
            border: '1px solid rgba(0,212,255,0.10)',
            pointerEvents: 'none',
            animation: 'glow-border-active 1.8s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* ── RESPONDING ── */}
      {state === 'responding' && (
        <div style={{ animation: 'fade-up 0.4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '3px',
              color: 'rgba(255,255,255,0.65)',
              textTransform: 'uppercase',
            }}>
              AI Assistant
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 300,
              color: '#00D4FF',
              letterSpacing: '1.5px',
              opacity: 0.80,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00D4FF',
                display: 'inline-block',
                animation: 'pulse-dot 1.4s ease-in-out infinite',
              }} />
              Responding
            </div>
          </div>

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 17,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.95)',
            lineHeight: 1.7,
            letterSpacing: '0.2px',
          }}>
            <ResponseText />
          </div>
        </div>
      )}
    </div>
  );
}