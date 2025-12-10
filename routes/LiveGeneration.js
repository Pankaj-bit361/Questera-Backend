const express = require('express');
const liveGenRouter = express.Router();
const LiveGenerationService = require('../functions/LiveGenerationService');

const liveGenService = new LiveGenerationService();

/**
 * POST /live-generation/jobs
 * Create a new recurring generation job
 * 
 * Body:
 * - userId: string (required)
 * - name: string (required)
 * - basePrompt: string (required) - e.g., "Product photo of my clothing brand"
 * - socialAccountId: string (required)
 * - intervalMinutes: number (default: 60)
 * - themes: array - ["lifestyle", "professional", "casual"]
 * - styles: array - ["photorealistic", "cinematic"]
 * - modelTypes: array - ["female", "male"]
 * - maxPosts: number (default: 100)
 * - autoPost: boolean (default: true)
 */
liveGenRouter.post('/jobs', async (req, res) => {
  try {
    const { userId, name, basePrompt, socialAccountId } = req.body;

    if (!userId || !name || !basePrompt || !socialAccountId) {
      return res.status(400).json({
        error: 'userId, name, basePrompt, and socialAccountId are required',
      });
    }

    const job = await liveGenService.createJob(userId, req.body);
    
    return res.status(200).json({
      success: true,
      message: `Live generation job created! Will generate every ${job.schedule.intervalMinutes} minutes.`,
      job: {
        jobId: job.jobId,
        name: job.name,
        status: job.status,
        nextRunAt: job.schedule.nextRunAt,
        intervalMinutes: job.schedule.intervalMinutes,
      },
    });
  } catch (error) {
    console.error('[LIVE-GEN] Create Job Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-generation/jobs/:userId
 * Get all generation jobs for a user
 */
liveGenRouter.get('/jobs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const jobs = await liveGenService.getJobs(userId, status);
    
    return res.status(200).json({
      success: true,
      jobs: jobs.map(j => ({
        jobId: j.jobId,
        name: j.name,
        status: j.status,
        platform: j.postingConfig.platform,
        intervalMinutes: j.schedule.intervalMinutes,
        nextRunAt: j.schedule.nextRunAt,
        lastRunAt: j.schedule.lastRunAt,
        postsGenerated: j.limits.postsGenerated,
        postsPublished: j.limits.postsPublished,
        maxPosts: j.limits.maxPosts,
      })),
    });
  } catch (error) {
    console.error('[LIVE-GEN] Get Jobs Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /live-generation/jobs/:userId/:jobId
 * Get job details with history
 */
liveGenRouter.get('/jobs/:userId/:jobId', async (req, res) => {
  try {
    const { userId, jobId } = req.params;
    const job = await liveGenService.getJobDetails(userId, jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json({ success: true, job });
  } catch (error) {
    console.error('[LIVE-GEN] Get Job Details Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-generation/jobs/:jobId/pause
 * Pause a generation job
 */
liveGenRouter.post('/jobs/:jobId/pause', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.body;

    const job = await liveGenService.pauseJob(userId, jobId);
    return res.status(200).json({ success: true, message: 'Job paused', job });
  } catch (error) {
    console.error('[LIVE-GEN] Pause Job Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-generation/jobs/:jobId/resume
 * Resume a paused job
 */
liveGenRouter.post('/jobs/:jobId/resume', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.body;

    const job = await liveGenService.resumeJob(userId, jobId);
    return res.status(200).json({
      success: true,
      message: `Job resumed! Next run at ${job.schedule.nextRunAt}`,
      job,
    });
  } catch (error) {
    console.error('[LIVE-GEN] Resume Job Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /live-generation/process
 * Manually trigger processing of due jobs (for testing or cron)
 */
liveGenRouter.post('/process', async (req, res) => {
  try {
    const result = await liveGenService.processDueJobs();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[LIVE-GEN] Process Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = liveGenRouter;

