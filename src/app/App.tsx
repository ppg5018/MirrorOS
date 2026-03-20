import { useState, useEffect } from 'react';
import { ClockWidget } from './components/ClockWidget';
import { WeatherWidget } from './components/WeatherWidget';
import { AIPanel, MirrorState } from './components/AIPanel';
import { NotificationsWidget } from './components/NotificationsWidget';
import { CalendarWidget } from './components/CalendarWidget';
import { SpotifyWidget } from './components/SpotifyWidget';
import { WallpaperSection } from './components/WallpaperSection';
import { TasksWidget } from './components/TasksWidget';
import { ScanLine } from './components/ScanLine';
import '../styles/mirrorOS.css';
import '../styles/fonts.css';

/* ─── Quotes rotation ─── */
const QUOTES = [
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Arise, awake, and stop not till the goal is reached.", author: "Swami Vivekananda" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
];

/* ─── News items ─── */
const NEWS_ITEMS = [
  { source: "Times of India", headline: "India's GDP growth forecast revised upward to 7.2% for FY26 amid strong manufacturing output", time: "12m ago" },
  { source: "The Hindu", headline: "ISRO successfully tests Gaganyaan life support module ahead of crewed mission", time: "35m ago" },
  { source: "Mint", headline: "Sensex crosses 80,000 mark again as foreign investors increase stakes in Indian equities", time: "1h ago" },
];

/* ─── MirrorOS brand mark ─── */
function BrandMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 24, height: 24 }}>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '1px solid rgba(0,212,255,0.45)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 5.5, height: 5.5,
          borderRadius: '50%',
          background: '#00D4FF',
          opacity: 0.85,
        }} />
      </div>
      <span style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 300,
        letterSpacing: '5px',
        color: 'rgba(255,255,255,0.72)',
        textTransform: 'uppercase',
      }}>
        MirrorOS
      </span>
    </div>
  );
}

/* ─── Inline Quote (compact, for top bar) ─── */
function TopQuote() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % QUOTES.length);
        setVisible(true);
      }, 600);
    }, 12000);
    return () => clearInterval(t);
  }, []);

  const q = QUOTES[idx];

  return (
    <div style={{
      flex: 1,
      textAlign: 'center',
      padding: '0 60px',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      <span style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 13,
        fontWeight: 300,
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: '0.2px',
        fontStyle: 'italic',
      }}>
        "{q.text}"
      </span>
      <span style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 300,
        color: 'rgba(0,212,255,0.90)',
        letterSpacing: '1.5px',
        marginLeft: 12,
      }}>
        — {q.author}
      </span>
    </div>
  );
}

/* ─── Bottom News Bar ─── */
function NewsBar() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % NEWS_ITEMS.length);
        setVisible(true);
      }, 500);
    }, 9000);
    return () => clearInterval(t);
  }, []);

  const news = NEWS_ITEMS[idx];

  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      height: 52,
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '0 60px',
    }}>
      {/* NEWS label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        marginRight: 28,
      }}>
        <div style={{
          width: 3, height: 14,
          background: 'rgba(0,212,255,0.70)',
          borderRadius: 2,
        }} />
        <span style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 9,
          fontWeight: 400,
          letterSpacing: '3px',
          color: 'rgba(0,212,255,0.65)',
          textTransform: 'uppercase',
        }}>
          News
        </span>
      </div>

      {/* Source badge */}
      <div style={{
        flexShrink: 0,
        padding: '2px 10px',
        border: '1px solid rgba(255,255,255,0.20)',
        borderRadius: 10,
        fontFamily: "'Inter', sans-serif",
        fontSize: 9,
        fontWeight: 300,
        color: 'rgba(255,255,255,0.68)',
        letterSpacing: '1px',
        marginRight: 16,
      }}>
        {news.source}
      </div>

      {/* Headline */}
      <div style={{
        flex: 1,
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: 300,
        color: 'rgba(255,255,255,0.90)',
        letterSpacing: '0.2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.45s ease',
      }}>
        {news.headline}
      </div>

      {/* Time */}
      <div style={{
        flexShrink: 0,
        marginLeft: 20,
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
        fontWeight: 300,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: '1px',
      }}>
        {news.time}
      </div>

      {/* Dot nav */}
      <div style={{ display: 'flex', gap: 5, marginLeft: 16, flexShrink: 0 }}>
        {NEWS_ITEMS.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 10 : 3,
            height: 3,
            borderRadius: 2,
            background: i === idx ? 'rgba(0,212,255,0.60)' : 'rgba(255,255,255,0.12)',
            transition: 'all 0.4s ease',
          }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Thin vertical column divider ─── */
function ColDivider() {
  return (
    <div style={{
      width: 1,
      alignSelf: 'stretch',
      background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent 100%)',
      flexShrink: 0,
    }} />
  );
}

/* ─── Ambient glow blobs ─── */
function AmbientGlows() {
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: 600, height: 400,
        background: 'radial-gradient(ellipse at top left, rgba(0,212,255,0.015) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 800, height: 500,
        background: 'radial-gradient(ellipse at top right, rgba(0,212,255,0.022) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
    </>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [mirrorState] = useState<MirrorState>('idle');
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const sx = window.innerWidth / 1920;
      const sy = window.innerHeight / 1080;
      setScale(Math.min(sx, sy));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const widgetOpacity =
    mirrorState === 'listening'  ? 0.25 :
    mirrorState === 'responding' ? 0.55 :
    1;

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#000',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* ── 1920×1080 Canvas ── */}
      <div style={{
        width: 1920,
        height: 1080,
        background: '#000000',
        position: 'relative',
        fontFamily: "'Inter', sans-serif",
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        flexShrink: 0,
        overflow: 'hidden',
      }}>

        <AmbientGlows />
        {mirrorState === 'idle' && <ScanLine />}

        {/* ════════════════════════════════════════════
            TOP BAR — brand + quote
        ════════════════════════════════════════════ */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 66,
          display: 'flex',
          alignItems: 'center',
          padding: '0 60px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <BrandMark />
          <TopQuote />
          {/* Right: live clock micro indicator */}
          <div style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.20)',
            letterSpacing: '1.5px',
          }}>
            <span style={{
              width: 5, height: 5,
              borderRadius: '50%',
              background: '#00FF88',
              opacity: 0.85,
              boxShadow: '0 0 4px rgba(0,255,136,0.5)',
            }} />
            Live
          </div>
        </div>

        {/* ════════════════════════════════════════════
            MAIN 3-COLUMN GRID
        ════════════════════════════════════════════ */}
        <div style={{
          position: 'absolute',
          top: 66, left: 0, right: 0, bottom: 52,
          display: 'flex',
          padding: '0 60px',
        }}>

          {/* ── COL 1: Clock + Weather ── */}
          <div
            className="mirror-widget"
            style={{
              width: 460,
              flexShrink: 0,
              paddingTop: 48,
              paddingRight: 52,
              display: 'flex',
              flexDirection: 'column',
              gap: 44,
              opacity: widgetOpacity,
            }}
          >
            <ClockWidget />
            <WeatherWidget />
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '-12px 0' }} />
            <TasksWidget />
          </div>

          <ColDivider />

          {/* ── COL 2: AI Panel + Calendar ── */}
          <div style={{
            flex: 1,
            paddingTop: 48,
            paddingLeft: 56,
            paddingRight: 56,
            display: 'flex',
            flexDirection: 'column',
            gap: 36,
            minWidth: 0,
            overflowY: 'hidden',
          }}>
            {/* AI always full opacity */}
            <AIPanel state={mirrorState} />

            <div
              className="mirror-widget"
              style={{ opacity: widgetOpacity, paddingLeft: 20 }}
            >
              <CalendarWidget />
            </div>
          </div>

          <ColDivider />

          {/* ── COL 3: Notifications + Spotify + Wallpaper ── */}
          <div
            className="mirror-widget"
            style={{
              width: 490,
              flexShrink: 0,
              paddingTop: 48,
              paddingLeft: 50,
              paddingBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 32,
              opacity: widgetOpacity,
              overflowY: 'hidden',
            }}
          >
            <NotificationsWidget />

            <div style={{
              height: 1,
              background: 'rgba(255,255,255,0.06)',
              margin: '-8px 0',
            }} />

            <SpotifyWidget />

            <div style={{
              height: 1,
              background: 'rgba(255,255,255,0.06)',
              margin: '-8px 0',
            }} />

            <WallpaperSection />
          </div>

        </div>

        {/* ════════════════════════════════════════════
            BOTTOM BAR — News
        ════════════════════════════════════════════ */}
        <NewsBar />

      </div>
    </div>
  );
}