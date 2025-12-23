const express = require('express');
const analyticsRouter = express.Router();
const AnalyticsService = require('../functions/AnalyticsService');
const Instagram = require('../models/instagram');
const SocialAccount = require('../models/socialAccount');

const analyticsService = new AnalyticsService();

/**
 * GET /analytics/accounts/:userId
 * Get all connected Instagram accounts for user
 */
analyticsRouter.get('/accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const allAccounts = [];

    // Check Instagram model
    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    for (const doc of instagramDocs) {
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          if (acc.isConnected !== false && acc.accessToken && acc.instagramBusinessAccountId) {
            allAccounts.push({
              username: acc.instagramUsername,
              igBusinessId: acc.instagramBusinessAccountId,
              profilePicture: acc.profilePictureUrl,
            });
          }
        }
      }
      if (doc.accessToken && doc.instagramBusinessAccountId) {
        const exists = allAccounts.some(a => a.igBusinessId === doc.instagramBusinessAccountId);
        if (!exists) {
          allAccounts.push({
            username: doc.instagramUsername,
            igBusinessId: doc.instagramBusinessAccountId,
            profilePicture: doc.profilePictureUrl,
          });
        }
      }
    }

    // Check SocialAccount model
    const socialAccounts = await SocialAccount.find({ userId, platform: 'instagram', isActive: true });
    for (const sa of socialAccounts) {
      const token = sa.facebookPageAccessToken || sa.accessToken;
      if (token && sa.instagramBusinessAccountId) {
        const exists = allAccounts.some(a => a.igBusinessId === sa.instagramBusinessAccountId);
        if (!exists) {
          allAccounts.push({
            username: sa.username || sa.platformUsername,
            igBusinessId: sa.instagramBusinessAccountId,
            profilePicture: sa.profilePictureUrl,
          });
        }
      }
    }

    return res.status(200).json({ success: true, accounts: allAccounts });
  } catch (error) {
    console.error('[ANALYTICS] Accounts Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/instagram-direct/:userId
 * Get analytics directly from Instagram API (real-time, not from database)
 * Supports fetching ALL posts with pagination
 */
analyticsRouter.get('/instagram-direct/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { account, limit = 100, cursor, fetchAll = 'false' } = req.query;

    // Find account credentials
    let accessToken = null;
    let igBusinessId = account || null;
    let accountUsername = null;

    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    for (const doc of instagramDocs) {
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          if (acc.isConnected !== false && acc.accessToken) {
            if (account && acc.instagramBusinessAccountId !== account) continue;
            accessToken = acc.accessToken;
            igBusinessId = acc.instagramBusinessAccountId;
            accountUsername = acc.instagramUsername;
            break;
          }
        }
      }
      if (!accessToken && doc.accessToken) {
        if (!account || doc.instagramBusinessAccountId === account) {
          accessToken = doc.accessToken;
          igBusinessId = doc.instagramBusinessAccountId;
          accountUsername = doc.instagramUsername;
        }
      }
      if (accessToken) break;
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'No Instagram account connected' });
    }

    // Fetch ALL posts if requested, otherwise just one page
    let allPosts = [];
    let nextCursor = cursor || null;
    let hasMore = true;
    const maxPages = fetchAll === 'true' ? 20 : 1; // Max 20 pages = 2000 posts
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      let mediaUrl = `https://graph.facebook.com/v21.0/${igBusinessId}/media?` +
        `fields=id,caption,like_count,comments_count,permalink,timestamp,media_type,thumbnail_url,media_url&` +
        `limit=${Math.min(limit, 100)}&access_token=${accessToken}`;

      if (nextCursor) {
        mediaUrl += `&after=${nextCursor}`;
      }

      const mediaResponse = await fetch(mediaUrl);
      const mediaData = await mediaResponse.json();

      if (mediaData.error) {
        return res.status(400).json({ error: mediaData.error.message });
      }

      const posts = mediaData.data || [];
      allPosts = allPosts.concat(posts);

      nextCursor = mediaData.paging?.cursors?.after;
      hasMore = !!mediaData.paging?.next;
      pageCount++;

      console.log(`[ANALYTICS] Fetched page ${pageCount}: ${posts.length} posts (total: ${allPosts.length})`);
    }

    // Get insights for posts (batch to avoid rate limits - only first 100 for speed)
    const postsToEnrich = allPosts.slice(0, 200); // Limit insights fetch to first 200 for speed
    const postsWithInsights = await Promise.all(postsToEnrich.map(async (post) => {
      let views = 0, reach = 0, saves = 0;

      try {
        const insightsUrl = `https://graph.facebook.com/v21.0/${post.id}/insights?metric=reach,saved&access_token=${accessToken}`;
        const insightsRes = await fetch(insightsUrl);
        const insightsData = await insightsRes.json();

        if (insightsData.data) {
          insightsData.data.forEach(m => {
            if (m.name === 'reach') reach = m.values?.[0]?.value || 0;
            if (m.name === 'saved') saves = m.values?.[0]?.value || 0;
          });
        }

        const viewsUrl = `https://graph.facebook.com/v22.0/${post.id}/insights?metric=views&access_token=${accessToken}`;
        const viewsRes = await fetch(viewsUrl);
        const viewsData = await viewsRes.json();

        if (viewsData.data) {
          viewsData.data.forEach(m => {
            if (m.name === 'views') views = m.values?.[0]?.value || 0;
          });
        }
      } catch (e) {
        // Silent fail for insights
      }

      return {
        id: post.id,
        caption: post.caption,
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
        views,
        reach,
        saves,
        permalink: post.permalink,
        timestamp: post.timestamp,
        mediaType: post.media_type,
        thumbnailUrl: post.thumbnail_url,
        mediaUrl: post.media_url,
      };
    }));

    // For remaining posts (beyond 200), just use basic data
    const remainingPosts = allPosts.slice(200).map(post => ({
      id: post.id,
      caption: post.caption,
      likes: post.like_count || 0,
      comments: post.comments_count || 0,
      views: 0,
      reach: 0,
      saves: 0,
      permalink: post.permalink,
      timestamp: post.timestamp,
      mediaType: post.media_type,
      thumbnailUrl: post.thumbnail_url,
      mediaUrl: post.media_url,
    }));

    const finalPosts = [...postsWithInsights, ...remainingPosts];

    // Calculate totals
    const totals = finalPosts.reduce((acc, p) => ({
      likes: acc.likes + p.likes,
      comments: acc.comments + p.comments,
      views: acc.views + p.views,
      reach: acc.reach + p.reach,
      saves: acc.saves + p.saves,
    }), { likes: 0, comments: 0, views: 0, reach: 0, saves: 0 });

    return res.status(200).json({
      success: true,
      account: { username: accountUsername, igBusinessId },
      posts: finalPosts,
      totals,
      totalCount: finalPosts.length,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error('[ANALYTICS] Instagram Direct Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/dashboard/:userId
 * Get full analytics dashboard
 */
analyticsRouter.get('/dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30, limit = 20 } = req.query;

    const dashboard = await analyticsService.getDashboard(userId, parseInt(days), parseInt(limit));
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

/**
 * GET /analytics/comments/:userId
 * Fetch all recent comments across all posts for an account
 */
analyticsRouter.get('/comments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { account, limit = 50 } = req.query;

    // Find account credentials
    let accessToken = null;
    let igBusinessId = account || null;
    let accountUsername = null;

    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    for (const doc of instagramDocs) {
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          if (acc.isConnected !== false && acc.accessToken) {
            if (account && acc.instagramBusinessAccountId !== account) continue;
            accessToken = acc.accessToken;
            igBusinessId = acc.instagramBusinessAccountId;
            accountUsername = acc.instagramUsername;
            break;
          }
        }
      }
      if (!accessToken && doc.accessToken) {
        if (!account || doc.instagramBusinessAccountId === account) {
          accessToken = doc.accessToken;
          igBusinessId = doc.instagramBusinessAccountId;
          accountUsername = doc.instagramUsername;
        }
      }
      if (accessToken) break;
    }

    if (!accessToken) {
      const socialAccounts = await SocialAccount.find({ userId, platform: 'instagram', isActive: true });
      for (const sa of socialAccounts) {
        const token = sa.facebookPageAccessToken || sa.accessToken;
        if (token && sa.instagramBusinessAccountId) {
          if (!account || sa.instagramBusinessAccountId === account) {
            accessToken = token;
            igBusinessId = sa.instagramBusinessAccountId;
            accountUsername = sa.username || sa.platformUsername;
            break;
          }
        }
      }
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'No Instagram account connected' });
    }

    // Fetch recent media (last 25 posts)
    const mediaUrl = `https://graph.facebook.com/v21.0/${igBusinessId}/media?` +
      `fields=id,caption,permalink,timestamp,media_type,thumbnail_url,media_url,like_count,comments_count&` +
      `limit=25&access_token=${accessToken}`;

    const mediaResponse = await fetch(mediaUrl);
    const mediaData = await mediaResponse.json();

    if (mediaData.error) {
      return res.status(400).json({ error: mediaData.error.message });
    }

    const allComments = [];

    // Fetch comments for each post
    for (const post of (mediaData.data || [])) {
      if (post.comments_count > 0) {
        const commentsUrl = `https://graph.facebook.com/v21.0/${post.id}/comments?` +
          `fields=id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}&` +
          `limit=50&access_token=${accessToken}`;

        const commentsResponse = await fetch(commentsUrl);
        const commentsData = await commentsResponse.json();

        if (commentsData.data) {
          for (const comment of commentsData.data) {
            allComments.push({
              id: comment.id,
              text: comment.text,
              username: comment.username,
              timestamp: comment.timestamp,
              likeCount: comment.like_count || 0,
              postId: post.id,
              postCaption: post.caption?.substring(0, 100) || '',
              postPermalink: post.permalink,
              postThumbnail: post.thumbnail_url || post.media_url,
              replies: comment.replies?.data?.map(r => ({
                id: r.id,
                text: r.text,
                username: r.username,
                timestamp: r.timestamp,
                likeCount: r.like_count || 0,
              })) || [],
            });
          }
        }
      }
    }

    // Sort by timestamp (newest first)
    allComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      success: true,
      account: accountUsername,
      totalComments: allComments.length,
      comments: allComments.slice(0, parseInt(limit)),
    });
  } catch (error) {
    console.error('[ANALYTICS] Comments Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /analytics/comments/:userId/reply
 * Reply to a comment
 */
analyticsRouter.post('/comments/:userId/reply', async (req, res) => {
  try {
    const { userId } = req.params;
    const { commentId, message, account } = req.body;

    if (!commentId || !message) {
      return res.status(400).json({ error: 'commentId and message are required' });
    }

    // Find account credentials
    let accessToken = null;

    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    for (const doc of instagramDocs) {
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          if (acc.isConnected !== false && acc.accessToken) {
            if (account && acc.instagramBusinessAccountId !== account) continue;
            accessToken = acc.accessToken;
            break;
          }
        }
      }
      if (!accessToken && doc.accessToken) {
        accessToken = doc.accessToken;
      }
      if (accessToken) break;
    }

    if (!accessToken) {
      const socialAccounts = await SocialAccount.find({ userId, platform: 'instagram', isActive: true });
      for (const sa of socialAccounts) {
        const token = sa.facebookPageAccessToken || sa.accessToken;
        if (token) {
          accessToken = token;
          break;
        }
      }
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'No Instagram account connected' });
    }

    // Post reply
    const replyUrl = `https://graph.facebook.com/v21.0/${commentId}/replies`;
    const replyResponse = await fetch(replyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        access_token: accessToken,
      }),
    });

    const replyData = await replyResponse.json();

    if (replyData.error) {
      return res.status(400).json({ error: replyData.error.message });
    }

    return res.status(200).json({
      success: true,
      replyId: replyData.id,
      message: 'Reply posted successfully',
    });
  } catch (error) {
    console.error('[ANALYTICS] Reply Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /analytics/comments/:userId/:commentId
 * Delete a comment (only works for comments made by the app or on your own posts)
 */
analyticsRouter.delete('/comments/:userId/:commentId', async (req, res) => {
  try {
    const { userId, commentId } = req.params;
    const { account } = req.query;

    // Find account credentials
    let accessToken = null;

    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    for (const doc of instagramDocs) {
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          if (acc.isConnected !== false && acc.accessToken) {
            if (account && acc.instagramBusinessAccountId !== account) continue;
            accessToken = acc.accessToken;
            break;
          }
        }
      }
      if (!accessToken && doc.accessToken) {
        accessToken = doc.accessToken;
      }
      if (accessToken) break;
    }

    if (!accessToken) {
      const socialAccounts = await SocialAccount.find({ userId, platform: 'instagram', isActive: true });
      for (const sa of socialAccounts) {
        const token = sa.facebookPageAccessToken || sa.accessToken;
        if (token) {
          accessToken = token;
          break;
        }
      }
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'No Instagram account connected' });
    }

    // Delete comment
    const deleteUrl = `https://graph.facebook.com/v21.0/${commentId}?access_token=${accessToken}`;
    const deleteResponse = await fetch(deleteUrl, { method: 'DELETE' });
    const deleteData = await deleteResponse.json();

    if (deleteData.error) {
      return res.status(400).json({ error: deleteData.error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('[ANALYTICS] Delete Comment Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /analytics/comments/:userId/:commentId
 * Hide or unhide a comment (Instagram API only supports hide, not edit text)
 */
analyticsRouter.put('/comments/:userId/:commentId', async (req, res) => {
  try {
    const { userId, commentId } = req.params;
    const { hide, account } = req.body;

    if (typeof hide !== 'boolean') {
      return res.status(400).json({ error: 'hide parameter (true/false) is required' });
    }

    // Find account credentials
    let accessToken = null;

    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    for (const doc of instagramDocs) {
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          if (acc.isConnected !== false && acc.accessToken) {
            if (account && acc.instagramBusinessAccountId !== account) continue;
            accessToken = acc.accessToken;
            break;
          }
        }
      }
      if (!accessToken && doc.accessToken) {
        accessToken = doc.accessToken;
      }
      if (accessToken) break;
    }

    if (!accessToken) {
      const socialAccounts = await SocialAccount.find({ userId, platform: 'instagram', isActive: true });
      for (const sa of socialAccounts) {
        const token = sa.facebookPageAccessToken || sa.accessToken;
        if (token) {
          accessToken = token;
          break;
        }
      }
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'No Instagram account connected' });
    }

    // Hide/unhide comment using Instagram Graph API
    const updateUrl = `https://graph.facebook.com/v21.0/${commentId}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hide: hide,
        access_token: accessToken,
      }),
    });

    const updateData = await updateResponse.json();

    if (updateData.error) {
      return res.status(400).json({ error: updateData.error.message });
    }

    return res.status(200).json({
      success: true,
      hidden: hide,
      message: hide ? 'Comment hidden successfully' : 'Comment unhidden successfully',
    });
  } catch (error) {
    console.error('[ANALYTICS] Hide Comment Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = analyticsRouter;
