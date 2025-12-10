const express = require('express');
const schedulerRouter = express.Router();
const SchedulerController = require('../functions/Scheduler');
const SchedulerService = require('../functions/SchedulerService');
const schedulerController = new SchedulerController();
const schedulerService = new SchedulerService();

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

// ============== CAMPAIGN ROUTES ==============

/**
 * POST /scheduler/campaigns
 * Create a new campaign
 */
schedulerRouter.post('/campaigns', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const campaign = await schedulerService.createCampaign(userId, req.body);
    return res.status(200).json({ success: true, campaign });
  } catch (error) {
    console.error('[SCHEDULER] Create Campaign Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /scheduler/campaigns/:userId
 * Get all campaigns for a user
 */
schedulerRouter.get('/campaigns/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;
    const Campaign = require('../models/campaign');

    const query = { userId };
    if (status) query.status = status;

    const campaigns = await Campaign.find(query).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, campaigns });
  } catch (error) {
    console.error('[SCHEDULER] Get Campaigns Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /scheduler/campaigns/:userId/:campaignId
 * Get campaign details with all posts
 */
schedulerRouter.get('/campaigns/:userId/:campaignId', async (req, res) => {
  try {
    const { userId, campaignId } = req.params;
    const result = await schedulerService.getCampaignDetails(userId, campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[SCHEDULER] Get Campaign Details Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/campaigns/:campaignId/pause
 * Pause a campaign
 */
schedulerRouter.post('/campaigns/:campaignId/pause', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { userId } = req.body;
    const campaign = await schedulerService.pauseCampaign(userId, campaignId);
    return res.status(200).json({ success: true, campaign });
  } catch (error) {
    console.error('[SCHEDULER] Pause Campaign Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/campaigns/:campaignId/resume
 * Resume a paused campaign
 */
schedulerRouter.post('/campaigns/:campaignId/resume', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { userId } = req.body;
    const campaign = await schedulerService.resumeCampaign(userId, campaignId);
    return res.status(200).json({ success: true, campaign });
  } catch (error) {
    console.error('[SCHEDULER] Resume Campaign Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============== BULK SCHEDULING ==============

/**
 * POST /scheduler/bulk
 * Schedule multiple posts at intervals
 */
schedulerRouter.post('/bulk', async (req, res) => {
  try {
    const { userId, socialAccountId, posts, startTime, intervalMinutes, campaignId } = req.body;

    if (!userId || !socialAccountId || !posts || !posts.length) {
      return res.status(400).json({ error: 'userId, socialAccountId, and posts are required' });
    }

    const scheduledPosts = await schedulerService.scheduleBulkPosts(
      userId,
      socialAccountId,
      posts,
      { startTime, intervalMinutes, campaignId }
    );

    return res.status(200).json({
      success: true,
      message: `${scheduledPosts.length} posts scheduled`,
      posts: scheduledPosts
    });
  } catch (error) {
    console.error('[SCHEDULER] Bulk Schedule Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============== CALENDAR VIEW ==============

/**
 * GET /scheduler/calendar/:userId
 * Get calendar view of scheduled posts
 */
schedulerRouter.get('/calendar/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const calendar = await schedulerService.getCalendarView(userId, startDate, endDate);
    return res.status(200).json({ success: true, calendar });
  } catch (error) {
    console.error('[SCHEDULER] Calendar Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============== POST MANAGEMENT ==============

/**
 * POST /scheduler/posts/:postId/reschedule
 * Reschedule a post to a new time
 */
schedulerRouter.post('/posts/:postId/reschedule', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required' });
    }

    const post = await schedulerService.reschedulePost(userId, postId, scheduledAt);
    return res.status(200).json({ success: true, post });
  } catch (error) {
    console.error('[SCHEDULER] Reschedule Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/posts/:postId/engagement
 * Update engagement metrics for a published post
 */
schedulerRouter.post('/posts/:postId/engagement', async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await schedulerService.updatePostEngagement(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found or not published' });
    }

    return res.status(200).json({ success: true, engagement: post.engagement });
  } catch (error) {
    console.error('[SCHEDULER] Engagement Update Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = schedulerRouter;

