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

/**
 * GET /analytics/debug/:userId
 * Debug endpoint to check post data
 */
analyticsRouter.get('/debug/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const ScheduledPost = require('../models/scheduledPost');
    const SocialAccount = require('../models/socialAccount');
    const Instagram = require('../models/instagram');

    const posts = await ScheduledPost.find({ userId, status: 'published' })
      .select('postId imageUrl caption status publishedAt publishedMediaId platformPostUrl engagement')
      .limit(10);

    // Check both models
    const instagramAccount = await Instagram.findOne({ userId, isConnected: true })
      .select('instagramUsername instagramBusinessAccountId isConnected accessToken');

    const socialAccount = await SocialAccount.findOne({
      userId,
      platform: 'instagram',
      isActive: true
    }).select('platformUsername instagramBusinessAccountId isActive');

    return res.status(200).json({
      success: true,
      instagramAccount: instagramAccount ? {
        username: instagramAccount.instagramUsername,
        businessId: instagramAccount.instagramBusinessAccountId,
        isConnected: instagramAccount.isConnected,
        hasAccessToken: !!instagramAccount.accessToken,
      } : null,
      socialAccount,
      postsCount: posts.length,
      posts: posts.map(p => ({
        postId: p.postId,
        caption: p.caption?.substring(0, 60),
        hasMediaId: !!p.publishedMediaId,
        publishedMediaId: p.publishedMediaId,
        platformPostUrl: p.platformPostUrl,
        publishedAt: p.publishedAt,
        engagement: p.engagement,
      })),
    });
  } catch (error) {
    console.error('[ANALYTICS] Debug Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/test-instagram/:userId/:mediaId
 * Test endpoint to check raw Instagram API response
 */
analyticsRouter.get('/test-instagram/:userId/:mediaId', async (req, res) => {
  try {
    const { userId, mediaId } = req.params;
    const Instagram = require('../models/instagram');

    const instagramAccount = await Instagram.findOne({ userId, isConnected: true });

    if (!instagramAccount?.accessToken) {
      return res.status(400).json({ error: 'No Instagram access token found' });
    }

    const accessToken = instagramAccount.accessToken;
    const igBusinessId = instagramAccount.instagramBusinessAccountId;

    // Test 1: Get basic media info
    const mediaUrl = `https://graph.facebook.com/v20.0/${mediaId}?fields=id,like_count,comments_count,permalink,timestamp,media_type&access_token=${accessToken}`;
    const mediaResponse = await fetch(mediaUrl);
    const mediaData = await mediaResponse.json();

    // Test 2: Get insights
    const insightsUrl = `https://graph.facebook.com/v20.0/${mediaId}/insights?metric=impressions,reach,saved&access_token=${accessToken}`;
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    // Test 3: Get all recent media from this account to compare IDs
    const recentMediaUrl = `https://graph.facebook.com/v20.0/${igBusinessId}/media?fields=id,caption,like_count,comments_count,permalink&limit=5&access_token=${accessToken}`;
    const recentMediaResponse = await fetch(recentMediaUrl);
    const recentMediaData = await recentMediaResponse.json();

    return res.status(200).json({
      success: true,
      testingMediaId: mediaId,
      igBusinessAccountId: igBusinessId,
      mediaApiResponse: mediaData,
      insightsApiResponse: insightsData,
      recentMediaFromAccount: recentMediaData,
    });
  } catch (error) {
    console.error('[ANALYTICS] Test Instagram Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /analytics/fix-media-ids/:userId
 * One-time fix: Match existing posts to correct Instagram media IDs
 */
analyticsRouter.post('/fix-media-ids/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const ScheduledPost = require('../models/scheduledPost');
    const Instagram = require('../models/instagram');

    const instagramAccount = await Instagram.findOne({ userId, isConnected: true });
    if (!instagramAccount?.accessToken) {
      return res.status(400).json({ error: 'No Instagram access token found' });
    }

    const accessToken = instagramAccount.accessToken;
    const igBusinessId = instagramAccount.instagramBusinessAccountId;

    // Fetch all recent media from Instagram (up to 100)
    const mediaListUrl = `https://graph.facebook.com/v20.0/${igBusinessId}/media?fields=id,caption,permalink,timestamp&limit=100&access_token=${accessToken}`;
    const mediaListResponse = await fetch(mediaListUrl);
    const mediaListData = await mediaListResponse.json();

    if (mediaListData.error) {
      return res.status(400).json({ error: mediaListData.error.message });
    }

    const instagramMedia = mediaListData.data || [];
    console.log(`[FIX] Found ${instagramMedia.length} posts on Instagram`);

    // Get all published posts without correct permalink
    const posts = await ScheduledPost.find({
      userId,
      status: 'published',
      $or: [
        { platformPostUrl: { $exists: false } },
        { platformPostUrl: null },
        { platformPostUrl: '' }
      ]
    });

    console.log(`[FIX] Found ${posts.length} posts needing fix`);

    const fixed = [];
    for (const post of posts) {
      // Match by timestamp (within 30 minutes to be more lenient)
      const postTime = new Date(post.publishedAt).getTime();
      const igMedia = instagramMedia.find(m => {
        if (!m.timestamp) return false;
        const igTime = new Date(m.timestamp).getTime();
        const diff = Math.abs(postTime - igTime);
        return diff < 30 * 60 * 1000; // Within 30 minutes
      });

      if (igMedia) {
        post.publishedMediaId = igMedia.id;
        post.platformPostUrl = igMedia.permalink;
        await post.save();
        fixed.push({
          postId: post.postId,
          newMediaId: igMedia.id,
          permalink: igMedia.permalink,
        });
        console.log(`[FIX] Fixed ${post.postId}: ${igMedia.permalink}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Fixed ${fixed.length} out of ${posts.length} posts`,
      fixed,
    });
  } catch (error) {
    console.error('[ANALYTICS] Fix Media IDs Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = analyticsRouter;
