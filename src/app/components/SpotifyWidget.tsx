import { useState, useEffect, useRef } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';

const ALBUM_ART = 'https://images.unsplash.com/photo-1558965930-1b2cfee208d5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGNvbG9yZnVsJTIwbXVzaWMlMjBhbGJ1bSUyMGFydCUyMHZpYnJhbnR8ZW58MXx8fHwxNzczOTA5OTczfDA&ixlib=rb-4.1.0&q=80&w=400';

const TRACKS = [
  { title: 'Kesariya', artist: 'Arijit Singh', album: 'Brahmastra', duration: 256 },
  { title: 'Raataan Lambiyan', artist: 'Jubin Nautiyal', album: 'Shershah', duration: 218 },
  { title: 'Tum Hi Ho', artist: 'Arijit Singh', album: 'Aashiqui 2', duration: 249 },
];

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="19,20 9,12 19,4" />
      <rect x="5" y="4" width="2.5" height="16" rx="1" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,4 15,12 5,20" />
      <rect x="16.5" y="4" width="2.5" height="16" rx="1" />
    </svg>
  );
}
function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24"
      fill={filled ? '#00FF88' : 'none'}
      stroke={filled ? '#00FF88' : 'rgba(255,255,255,0.65)'}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function SpotifyLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="rgba(30,215,96,0.20)" stroke="rgba(30,215,96,0.75)" strokeWidth="1" />
      <path d="M7 15.5c2.5-1 5.5-.8 7.5.5" stroke="rgba(30,215,96,1.0)" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.5 12.5c3-1.2 6.5-1 9 .8" stroke="rgba(30,215,96,1.0)" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 9.5c3.5-1.4 7.5-1.2 10.5 1" stroke="rgba(30,215,96,1.0)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function SpotifyWidget() {
  const [trackIdx, setTrackIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [liked, setLiked] = useState(false);
  const [progress, setProgress] = useState(74);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const track = TRACKS[trackIdx];

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress(p => {
          if (p >= track.duration) { setTrackIdx(i => (i + 1) % TRACKS.length); return 0; }
          return p + 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, track.duration]);

  const pct = Math.round((progress / track.duration) * 100);

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}>
        <SpotifyLogo />
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: '3px',
          color: 'rgba(255,255,255,0.70)',
          textTransform: 'uppercase',
        }}>
          Now Playing
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.18)',
          position: 'relative',
        }}>
          <ImageWithFallback
            src={ALBUM_ART}
            alt="Album Art"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {playing && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 18 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} className="wf-bar" style={{ width: 3, minHeight: 4 }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 16,
            fontWeight: 300,
            color: 'rgba(255,255,255,1.0)',
            letterSpacing: '0.2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {track.title}
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.65)',
            letterSpacing: '1px',
            marginTop: 3,
            marginBottom: 12,
          }}>
            {track.artist} · {track.album}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => setTrackIdx(i => (i - 1 + TRACKS.length) % TRACKS.length)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center' }}
            >
              <PrevIcon />
            </button>
            <button
              onClick={() => setPlaying(p => !p)}
              style={{
                width: 32, height: 32,
                borderRadius: '50%',
                border: '1px solid rgba(0,212,255,0.70)',
                background: 'rgba(0,212,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                color: '#00D4FF',
                flexShrink: 0,
              }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              onClick={() => { setTrackIdx(i => (i + 1) % TRACKS.length); setProgress(0); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center' }}
            >
              <NextIcon />
            </button>
            <button
              onClick={() => setLiked(l => !l)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
            >
              <HeartIcon filled={liked} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{
          height: 2,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 2,
          position: 'relative',
          cursor: 'pointer',
        }}>
          <div style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: 'linear-gradient(90deg, rgba(30,215,96,0.75), rgba(30,215,96,1.0))',
            borderRadius: 2,
            transition: 'width 0.5s linear',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            width: 8, height: 8,
            borderRadius: '50%',
            background: '#1ED760',
            boxShadow: '0 0 6px rgba(30,215,96,0.85)',
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '1px',
        }}>
          <span>{formatTime(progress)}</span>
          <span>{formatTime(track.duration)}</span>
        </div>
      </div>
    </div>
  );
}
