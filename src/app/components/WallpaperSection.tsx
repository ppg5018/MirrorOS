import { ImageWithFallback } from './figma/ImageWithFallback';

const WALLPAPER_URL =
  'https://images.unsplash.com/photo-1765126124763-1b0fd60d6418?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb3VudGFpbiUyMHZhbGxleSUyMG1pc3R5JTIwc3VucmlzZSUyMGxhbmRzY2FwZXxlbnwxfHx8fDE3NzM5MDk5NzN8MA&ixlib=rb-4.1.0&q=80&w=800';

export function WallpaperSection() {
  return (
    <div>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: '3px',
        color: 'rgba(255,255,255,0.70)',
        textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        Ambient Art
      </div>

      <div style={{
        position: 'relative',
        width: '100%',
        height: 230,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <ImageWithFallback
          src={WALLPAPER_URL}
          alt="Ambient Wallpaper"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.88,
          }}
        />

        {[
          { top: 8, left: 8, borderTop: true, borderLeft: true },
          { top: 8, right: 8, borderTop: true, borderRight: true },
          { bottom: 8, left: 8, borderBottom: true, borderLeft: true },
          { bottom: 8, right: 8, borderBottom: true, borderRight: true },
        ].map((corner, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 14, height: 14,
            top: corner.top,
            left: corner.left,
            bottom: corner.bottom,
            right: corner.right,
            borderTop: corner.borderTop ? '1px solid rgba(0,212,255,0.75)' : undefined,
            borderLeft: corner.borderLeft ? '1px solid rgba(0,212,255,0.75)' : undefined,
            borderBottom: corner.borderBottom ? '1px solid rgba(0,212,255,0.75)' : undefined,
            borderRight: corner.borderRight ? '1px solid rgba(0,212,255,0.75)' : undefined,
          }} />
        ))}

        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          padding: '20px 14px 10px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.80))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.88)',
            letterSpacing: '1.5px',
          }}>
            Himalayan Valley
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            fontWeight: 300,
            color: 'rgba(0,212,255,0.90)',
            letterSpacing: '1px',
          }}>
            DAILY · AUTO
          </div>
        </div>
      </div>
    </div>
  );
}
