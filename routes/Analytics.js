const express = require('express');
const analyticsRouter = express.Router();
const AnalyticsService = require('../functions/AnalyticsService');

const analyticsService = new AnalyticsService();

/**
 * GET /analytics/dashboard/:userId
 * Get full analytics dashboard
 */
analyticsRouter.get('/dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    const dashboard = await analyticsService.getDashboard(userId, parseInt(days));
    return res.status(200).json({ success: true, ...dashboard });
  } catch (error) {
    console.error('[ANALYTICS] Dashboard Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/best-times/:userId
 * Get best posting times based on performance
 */
analyticsRouter.get('/best-times/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const bestTimes = await analyticsService.getBestPostingTimes(userId);
    return res.status(200).json({ success: true, ...bestTimes });
  } catch (error) {
    console.error('[ANALYTICS] Best Times Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/content/:userId
 * Get content performance analysis (hashtags, post types, etc.)
 */
analyticsRouter.get('/content/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const analysis = await analyticsService.getContentAnalysis(userId);
    return res.status(200).json({ success: true, ...analysis });
  } catch (error) {
    console.error('[ANALYTICS] Content Analysis Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/growth/:userId
 * Get growth metrics over time
 */
analyticsRouter.get('/growth/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    const growth = await analyticsService.getGrowthMetrics(userId, parseInt(days));
    return res.status(200).json({ success: true, ...growth });
  } catch (error) {
    console.error('[ANALYTICS] Growth Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /analytics/refresh/:userId
 * Refresh engagement data from Instagram
 */
analyticsRouter.post('/refresh/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await analyticsService.refreshEngagement(userId);
    return res.status(200).json({ 
      success: true, 
      message: `Updated ${result.updated} posts`,
      ...result,
    });
  } catch (error) {
    console.error('[ANALYTICS] Refresh Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = analyticsRouter;

