const express = require('express');
const schedulerRouter = express.Router();
const SchedulerController = require('../functions/Scheduler');
const schedulerController = new SchedulerController();

/**
 * POST /scheduler/posts
 * Create a new scheduled post
 */
schedulerRouter.post('/posts', async (req, res) => {
  try {
    const { status, json } = await schedulerController.createScheduledPost(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Create Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /scheduler/posts/:userId
 * Get all scheduled posts for a user (supports date range filtering)
 */
schedulerRouter.get('/posts/:userId', async (req, res) => {
  try {
    const { status, json } = await schedulerController.getScheduledPosts(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Get Posts Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /scheduler/posts/:postId
 * Update a scheduled post
 */
schedulerRouter.put('/posts/:postId', async (req, res) => {
  try {
    const { status, json } = await schedulerController.updateScheduledPost(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Update Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /scheduler/posts/:postId
 * Cancel a scheduled post
 */
schedulerRouter.delete('/posts/:postId', async (req, res) => {
  try {
    const { status, json } = await schedulerController.cancelScheduledPost(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Cancel Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /scheduler/stats/:userId
 * Get scheduler statistics for user dashboard
 */
schedulerRouter.get('/stats/:userId', async (req, res) => {
  try {
    const { status, json } = await schedulerController.getSchedulerStats(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Stats Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/process
 * Manually trigger processing of due posts (for testing or cron)
 */
schedulerRouter.post('/process', async (req, res) => {
  try {
    const result = await schedulerController.processDuePosts();
    return res.status(200).json(result);
  } catch (error) {
    console.error('[SCHEDULER] Process Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = schedulerRouter;

