# PM2 Production Setup Guide

## Prerequisites
- Node.js installed on your AWS server
- PM2 installed globally: `npm install -g pm2`

## Step 1: Setup PM2.io Monitoring (Optional but Recommended)

1. Go to https://app.pm2.io/
2. Create an account or login
3. Create a new bucket/server
4. Copy your `PM2_PUBLIC_KEY` and `PM2_SECRET_KEY`

## Step 2: Configure Environment Variables

Add these to your `.env` file on the server:

```bash
PM2_PUBLIC_KEY=your_pm2_public_key_here
PM2_SECRET_KEY=your_pm2_secret_key_here
```

## Step 3: Link PM2 to PM2.io

On your AWS server, run:

```bash
pm2 link <PM2_SECRET_KEY> <PM2_PUBLIC_KEY>
```

## Step 4: Deploy and Start

### Option A: Using ecosystem file (Recommended)
```bash
# Install dependencies
npm install

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

### Option B: Using npm scripts
```bash
npm install
npm run pm2:start
pm2 save
pm2 startup
```

## Useful PM2 Commands

```bash
# View logs
npm run pm2:logs
# or
pm2 logs

# Monitor processes
npm run pm2:monit
# or
pm2 monit

# Restart app
npm run pm2:restart
# or
pm2 restart questera-backend

# Stop app
npm run pm2:stop
# or
pm2 stop questera-backend

# Delete app from PM2
npm run pm2:delete
# or
pm2 delete questera-backend

# View process list
pm2 list

# View detailed info
pm2 show questera-backend
```

## PM2.io Dashboard Features

Once connected, you can monitor:
- CPU & Memory usage
- Request rate
- Error tracking
- Custom metrics
- Logs in real-time
- Process management
- Alerts and notifications

## Troubleshooting

### PM2.io not connecting?
```bash
# Check PM2 status
pm2 list

# Check if linked
pm2 info questera-backend

# Re-link if needed
pm2 unlink
pm2 link <SECRET_KEY> <PUBLIC_KEY>
```

### App not starting?
```bash
# Check logs
pm2 logs questera-backend --lines 100

# Check error logs
pm2 logs questera-backend --err

# Restart
pm2 restart questera-backend
```

## Production Checklist

- [ ] PM2 installed globally
- [ ] Environment variables configured
- [ ] PM2 linked to PM2.io
- [ ] App started with ecosystem.config.js
- [ ] PM2 process list saved (`pm2 save`)
- [ ] PM2 startup configured (`pm2 startup`)
- [ ] Monitoring dashboard accessible
- [ ] Logs directory created and writable

