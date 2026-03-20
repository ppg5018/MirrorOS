module.exports = {
  apps: [
    {
      name: 'mirroros-backend',
      script: 'server/index.js',
      cwd: '/home/mirroros/mirroros',
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      out_file: '/var/log/mirroros/backend-out.log',
      error_file: '/var/log/mirroros/backend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'mirroros-voice',
      script: 'server/voice/wakeword.py',
      cwd: '/home/mirroros/mirroros',
      interpreter: 'python3',
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '5s',
      out_file: '/var/log/mirroros/voice-out.log',
      error_file: '/var/log/mirroros/voice-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        PYTHONUNBUFFERED: '1',
        MIRROR_BACKEND:   'http://localhost:3000',
        WAKE_KEYWORD:     'jarvis',
        RECORD_SECONDS:   '8',
        WHISPER_LANG:     '',
        PORCUPINE_ACCESS_KEY: process.env.PORCUPINE_ACCESS_KEY || '',
        // KEYWORD_PATH: '/home/mirroros/hey-mirror.ppn'
      }
    },
    {
      name: 'mirroros-pir',
      script: 'server/sensors/pir.py',
      cwd: '/home/mirroros/mirroros',
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
