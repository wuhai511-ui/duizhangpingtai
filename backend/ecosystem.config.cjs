const path = require('path');

const backendRoot = __dirname;
const logDir = process.env.PM2_LOG_DIR || '/var/log/yewu-api';

module.exports = {
  apps: [
    {
      name: 'yewu-api',
      script: 'start-server.js',
      cwd: backendRoot,
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: path.join(logDir, 'error.log'),
      out_file: path.join(logDir, 'out.log'),
      merge_logs: true,
    },
  ],
};
