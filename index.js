require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imageRouter = require('./routes/Image');
const authRouter = require('./routes/Auth');
const templateRouter = require('./routes/Template');
const draftTemplateRouter = require('./routes/DraftTemplate');
const instagramRouter = require('./routes/Instagram');
const chatRouter = require('./routes/Chat');
const creditsRouter = require('./routes/Credits');
const schedulerRouter = require('./routes/Scheduler');
const campaignRouter = require('./routes/Campaign');
const liveGenRouter = require('./routes/LiveGeneration');
const analyticsRouter = require('./routes/Analytics');
const viralRouter = require('./routes/ViralContent');
const authMiddleware = require('./middlewares/auth');
const connectDB = require('./db');
const SchedulerController = require('./functions/Scheduler');
const LiveGenerationService = require('./functions/LiveGenerationService');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for image uploads

// Increase timeout for long-running requests (image generation can take 60+ seconds)
app.use((req, res, next) => {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    next();
});

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Server is working!' });
});

// Public routes
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/image', imageRouter);
app.use('/api/template', templateRouter);
app.use('/api/draft-template', draftTemplateRouter); // Draft Template Management
app.use('/api/instagram', instagramRouter);
app.use('/api/chat', chatRouter); // Smart AI Chat & Image Generation
app.use('/api/credits', creditsRouter); // Credits & Subscription Management
app.use('/api/scheduler', schedulerRouter); // Post Scheduling
app.use('/api/campaigns', campaignRouter); // Campaign Automation
app.use('/api/live-generation', liveGenRouter); // Live Generation + Auto-Post
app.use('/api/analytics', analyticsRouter); // Analytics Dashboard
app.use('/api/viral', viralRouter); // Viral Content Extraction

// Database connection and Server Start
const startServer = async () => {
    try {
        // Connect to DB before starting server to prevent buffering timeouts
        await connectDB();

        // Start the server (works for both local dev and Elastic Beanstalk)
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
        });

        // Start the scheduler cron job (runs every minute)
        startSchedulerCron();
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

// Scheduler Cron Job - checks and publishes due posts every minute
const startSchedulerCron = () => {
    const scheduler = new SchedulerController();
    const liveGenService = new LiveGenerationService();
    const CRON_INTERVAL = 60 * 1000; // 1 minute

    console.log('📅 [CRON] Scheduler cron job started - checking every minute');
    console.log('🔄 [CRON] Live generation cron job started - checking every minute');

    setInterval(async () => {
        try {
            // Process scheduled posts
            const schedulerResult = await scheduler.processDuePosts();
            if (schedulerResult.processed > 0) {
                console.log(`📅 [CRON] Processed ${schedulerResult.processed} scheduled posts`);
            }

            // Process live generation jobs
            const liveGenResult = await liveGenService.processDueJobs();
            if (liveGenResult.processed > 0) {
                console.log(`🔄 [CRON] Processed ${liveGenResult.processed} live generation jobs`);
            }
        } catch (error) {
            console.error('❌ [CRON] Cron error:', error);
        }
    }, CRON_INTERVAL);
};

startServer();

// Export for Vercel
module.exports = app;