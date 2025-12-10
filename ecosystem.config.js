module.exports = {
  apps: [{
    name: 'questera-backend',
    script: 'index.js',
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
    // PM2.io monitoring
    pmx: true,
    // Merge logs from all instances
    merge_logs: true,
    // Log date format
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],

  deploy: {
    production: {
      user: 'ec2-user',
      host: 'YOUR_AWS_HOST',
      ref: 'origin/main',
      repo: 'https://github.com/Pankaj-bit361/Questera-Backend.git',
      path: '/var/app/current',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};

