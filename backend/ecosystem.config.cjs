module.exports = {
  apps: [{
    name: 'yewu-api',
    script: 'start-server.js',
    cwd: '/home/admin/.openclaw/workspace-dev/业财一体化-mvp',
    interpreter: 'node',
    interpreter_args: '--experimental-vm-modules',

    // 自动重启
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 1000,

    // 内存限制
    max_memory_restart: '512M',

    // 环境变量
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },

    // 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/yewu-api/error.log',
    out_file: '/var/log/yewu-api/out.log',
    merge_logs: true,
  }]
};
