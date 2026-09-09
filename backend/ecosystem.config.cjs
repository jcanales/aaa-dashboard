// pm2 process definition for the duties-dashboard backend in production.
module.exports = {
  apps: [
    {
      name: 'duties-backend',
      script: 'dist/api/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
