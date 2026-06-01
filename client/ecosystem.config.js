module.exports = {
  apps: [
    {
      name: 'search-sync',
      script: 'npm',
      args: 'run worker:search-sync',
      cwd: '.',
      env: {
        NODE_ENV: 'production'
      },
      autorestart: true,
      watch: false,
      instances: 1,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: './logs/search-sync-out.log',
      error_file: './logs/search-sync-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
