# AWS Elastic Beanstalk Deployment Guide

## Prerequisites
- AWS Account
- EB CLI installed: `pip install awsebcli`
- PM2.io account (for monitoring)

## Step 1: Get PM2.io Keys

1. Go to https://app.pm2.io/
2. Create an account or login
3. Create a new bucket/server
4. Copy your `PM2_PUBLIC_KEY` and `PM2_SECRET_KEY`

## Step 2: Configure Environment Variables in Elastic Beanstalk

### Option A: Using AWS Console

1. Go to **Elastic Beanstalk Console**
2. Select your environment
3. Go to **Configuration** → **Software**
4. Click **Edit**
5. Add the following **Environment Properties**:

```
NODE_ENV=production
MONGODB_URI=your_mongodb_uri
GEMINI_API_KEY=your_gemini_key
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET_NAME=your_bucket_name
JWT_SECRET=your_jwt_secret
PM2_PUBLIC_KEY=your_pm2_public_key
PM2_SECRET_KEY=your_pm2_secret_key
```

6. Click **Apply**

### Option B: Using EB CLI

Create a file `.ebextensions/03_env_vars.config` (DO NOT commit this file):

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    MONGODB_URI: "your_mongodb_uri"
    GEMINI_API_KEY: "your_gemini_key"
    AWS_REGION: "us-east-1"
    AWS_ACCESS_KEY_ID: "your_aws_key"
    AWS_SECRET_ACCESS_KEY: "your_aws_secret"
    AWS_S3_BUCKET_NAME: "your_bucket_name"
    JWT_SECRET: "your_jwt_secret"
    PM2_PUBLIC_KEY: "your_pm2_public_key"
    PM2_SECRET_KEY: "your_pm2_secret_key"
```

## Step 3: Initialize Elastic Beanstalk (First Time Only)

```bash
# Initialize EB application
eb init

# Select:
# - Region: (your preferred region)
# - Application name: questera-backend
# - Platform: Node.js
# - Platform version: (latest)
# - SSH: Yes (recommended)
```

## Step 4: Create Environment (First Time Only)

```bash
# Create environment
eb create questera-backend-prod

# Or with specific instance type
eb create questera-backend-prod --instance-type t3.small
```

## Step 5: Deploy

```bash
# Deploy latest code
eb deploy

# Check status
eb status

# Open in browser
eb open

# View logs
eb logs
```

## Step 6: Verify PM2.io Connection

1. SSH into your instance:
   ```bash
   eb ssh
   ```

2. Check PM2 status:
   ```bash
   pm2 list
   pm2 info questera-backend
   ```

3. Check if linked to PM2.io:
   ```bash
   pm2 web
   ```

4. Go to https://app.pm2.io/ and verify your app appears in the dashboard

## Useful EB Commands

```bash
# View environment status
eb status

# View logs
eb logs

# SSH into instance
eb ssh

# Open app in browser
eb open

# Set environment variables
eb setenv KEY=value

# Scale instances
eb scale 2

# Terminate environment
eb terminate questera-backend-prod
```

## PM2 Commands on EB Instance

After SSH-ing into the instance:

```bash
# View PM2 processes
pm2 list

# View logs
pm2 logs

# Monitor
pm2 monit

# Restart
pm2 restart all

# Check PM2.io link status
pm2 info questera-backend
```

## Troubleshooting

### App not starting?
```bash
eb ssh
cd /var/app/current
pm2 logs
```

### PM2.io not connecting?
```bash
eb ssh
pm2 link <SECRET_KEY> <PUBLIC_KEY>
pm2 restart all
```

### Check environment variables
```bash
eb ssh
printenv | grep PM2
```

### View deployment logs
```bash
eb logs --all
```

## Architecture

```
Internet → ELB → Nginx → PM2 (Cluster Mode) → Node.js App
                                ↓
                            PM2.io Dashboard
```

## Production Checklist

- [ ] PM2.io account created
- [ ] PM2 keys obtained
- [ ] All environment variables configured in EB
- [ ] EB application initialized
- [ ] Environment created
- [ ] Code deployed successfully
- [ ] PM2 linked to PM2.io
- [ ] Monitoring dashboard accessible
- [ ] Health checks passing
- [ ] Auto-scaling configured (optional)
- [ ] CloudWatch alarms set up (optional)

