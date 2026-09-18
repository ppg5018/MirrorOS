// cwd is derived from this file's location so the same config works on the
// Pi, on a dev machine, and from any checkout path.
const ROOT = __dirname

module.exports = {
  apps: [
    {
      name: 'mirroros-backend',
      script: 'server/index.js',
      cwd: ROOT,
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      // Pi 4 1GB — Chromium kiosk + Python (voice/PIR) need the bulk of RAM, so
      // cap the Node old-space at 256MB. max_memory_restart is a safety net that
      // recycles the backend if RSS ever creeps past ~320MB (prevents OOM).
      node_args: '--max-old-space-size=256 --optimize-for-size',
      max_memory_restart: '320M',
      out_file: '/var/log/mirroros/backend-out.log',
      error_file: '/var/log/mirroros/backend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        UV_THREADPOOL_SIZE: '2'
      }
    },
    {
      name: 'mirroros-voice',
      script: 'server/voice/wakeword.py',
      cwd: ROOT,
      interpreter: 'python3',
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '5s',
      out_file: '/var/log/mirroros/voice-out.log',
      error_file: '/var/log/mirroros/voice-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // These names must match what server/voice/wakeword.py actually reads.
      // The previous block set WAKE_KEYWORD / PORCUPINE_ACCESS_KEY / KEYWORD_PATH —
      // all leftovers from the Porcupine engine, none of which the openWakeWord
      // loop looks at — so the wake word could not be tuned in production at all.
      env: {
        PYTHONUNBUFFERED: '1',
        MIRROR_BACKEND:   'http://localhost:3000',

        // Microphone: the INMP441 I2S mic, exposed as the ALSA device
        // "mirror_mic" by scripts/setup-mic.sh (see server/voice/mic.py).
        // If it is missing, the loop logs a warning and uses the default input.
        MIC_DEVICE:       'mirror_mic',

        // Wake word. WAKE_MODEL picks a bundled openWakeWord model
        // (hey_jarvis, hey_mycroft, hey_rhasspy, alexa). config/wakeword.json
        // overrides this when present. For a custom trained model, set
        // WAKE_WORD_PATH to its absolute .onnx/.tflite path instead.
        WAKE_MODEL:       'hey_jarvis',
        WAKE_THRESHOLD:   '0.35',   // raise toward 0.5 if you get false triggers
        WAKE_COOLDOWN:    '1.5',    // deaf period after replying, so the mirror
                                    // does not hear its own voice and answer itself
        // WAKE_WORD_PATH: '/home/mira/Desktop/MirrorOs/server/voice/wakewords/hey-mirror.onnx',
        // WAKE_FRAMEWORK: 'tflite', // lighter than onnxruntime on a Pi
        // WAKE_DEBUG:     '1',      // log mic level + score every ~2s

        // Recording / endpointing
        RECORD_SECONDS:     '8',
        SILENCE_SECONDS:    '0.7',
        SILENCE_THRESHOLD:  '500',
        PRESPEECH_TIMEOUT:  '3.0'
      }
    },
    {
      name: 'mirroros-pir',
      script: 'server/sensors/pir.py',
      cwd: ROOT,
      interpreter: 'python3',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '5s',
      out_file: '/var/log/mirroros/pir-out.log',
      error_file: '/var/log/mirroros/pir-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONUNBUFFERED: '1',
        MIRROR_BACKEND:   'http://localhost:3000',
        SCREEN_TIMEOUT:   '120'
      }
    }
  ]
}
