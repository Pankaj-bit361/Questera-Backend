module.exports = {
  apps: [{
    name: 'questera-backend',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
  }],

  deploy: {
    production: {
      user: 'ubuntu',
      host: 'YOUR_AWS_HOST',
      ref: 'origin/main',
      repo: 'https://github.com/Pankaj-bit361/Questera-Backend.git',
      path: '/home/ubuntu/questera-backend',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};

