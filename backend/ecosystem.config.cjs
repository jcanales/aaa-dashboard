// pm2 process definition for the duties-dashboard backend. Shared by prod and
// dev on the same server — the deploy workflow sets PM2_APP_NAME so pm2 (which
// requires unique process names) manages them as two separate processes.
module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'duties-backend',
      script: 'dist/api/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
