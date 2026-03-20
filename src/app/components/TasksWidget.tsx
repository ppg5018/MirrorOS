import { useState } from 'react';

const INITIAL_TASKS = [
  { id: 1, text: 'Review Q2 financial report', done: true, priority: 'low' },
  { id: 2, text: 'Call vendor for office supplies', done: false, priority: 'medium' },
  { id: 3, text: 'Send proposal to Ravi Kumar', done: false, priority: 'high' },
  { id: 4, text: 'Book flight to Delhi — Mar 24', done: false, priority: 'medium' },
  { id: 5, text: 'Team check-in at 3:30 PM', done: false, priority: 'low' },
];

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#FF6B35',
  medium: 'rgba(0,212,255,0.90)',
  low:    'rgba(255,255,255,0.50)',
};

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#00FF88" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TasksWidget() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);

  const toggle = (id: number) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const done = tasks.filter(t => t.done).length;

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: '3px',
          color: 'rgba(255,255,255,0.70)',
          textTransform: 'uppercase',
        }}>
          Tasks
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 300,
          letterSpacing: '1px',
          color: 'rgba(0,255,136,0.85)',
        }}>
          {done}/{tasks.length} done
        </div>
      </div>

      <div style={{
        height: 2,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        marginBottom: 18,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${(done / tasks.length) * 100}%`,
          background: 'linear-gradient(90deg, rgba(0,255,136,0.6), rgba(0,255,136,0.90))',
          borderRadius: 2,
          transition: 'width 0.5s ease',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tasks.map((task, idx) => (
          <div
            key={task.id}
            onClick={() => toggle(task.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              paddingTop: 11,
              paddingBottom: 11,
              borderBottom: idx < tasks.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: task.done ? 'rgba(255,255,255,0.25)' : PRIORITY_COLOR[task.priority],
              flexShrink: 0,
              transition: 'background 0.3s',
              boxShadow: !task.done && task.priority === 'high'
                ? '0 0 5px rgba(255,107,53,0.70)'
                : 'none',
            }} />

            <div style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              border: task.done
                ? '1px solid rgba(0,255,136,0.60)'
                : '1px solid rgba(255,255,255,0.35)',
              background: task.done ? 'rgba(0,255,136,0.12)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.25s ease',
            }}>
              {task.done && <CheckIcon />}
            </div>

            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 300,
              color: task.done ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.90)',
              letterSpacing: '0.2px',
              textDecoration: task.done ? 'line-through' : 'none',
              transition: 'all 0.25s ease',
              flex: 1,
            }}>
              {task.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
