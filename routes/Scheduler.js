const express = require('express');
const schedulerRouter = express.Router();
const SchedulerController = require('../functions/Scheduler');
const SchedulerService = require('../functions/SchedulerService');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const schedulerController = new SchedulerController();
const schedulerService = new SchedulerService();

// S3 client for image uploads
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const bucketName = process.env.AWS_S3_BUCKET_NAME;

// Helper to upload base64 image to S3
async function uploadToS3(base64Data, mimeType, folder = 'scheduler') {
  const extension = mimeType?.split('/')[1] || 'png';
  const fileName = `${folder}/${uuidv4()}.${extension}`;
  const buffer = Buffer.from(base64Data, 'base64');

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  }));

  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

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

// ============== VIDEO SCHEDULING ==============

/**
 * POST /scheduler/video
 * Schedule a video/reel with auto-generated viral caption and hashtags
 */
schedulerRouter.post('/video', async (req, res) => {
  try {
    const { status, json } = await schedulerController.scheduleVideo(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Video Schedule Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/video/caption
 * Generate viral caption preview without scheduling (for UI preview)
 */
schedulerRouter.post('/video/caption', async (req, res) => {
  try {
    const { status, json } = await schedulerController.generateVideoCaption(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[SCHEDULER] Caption Generate Error:', error);
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

// ============== MANUAL POST CREATION (Buffer-style) ==============

/**
 * POST /scheduler/manual-post
 * Create a scheduled post with user-uploaded image/video
 * Supports: Post, Reel, Story, Carousel types
 * Additional: Music, Tag Products, First Comment
 */
schedulerRouter.post('/manual-post', async (req, res) => {
  try {
    const {
      userId,
      media, // { data: base64, mimeType: 'image/png' } or array for carousel
      caption,
      hashtags,
      postType = 'image', // 'image', 'reel', 'story', 'carousel'
      scheduledAt,
      timezone = 'UTC',
      accountId,
      // New Buffer-like features
      music = '',
      tagProducts = '',
      firstComment = '',
    } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!media) {
      return res.status(400).json({ error: 'media is required (image or video)' });
    }
    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required' });
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    let imageUrl = null;
    let imageUrls = [];
    let videoUrl = null;

    // Handle different post types
    if (postType === 'carousel' && Array.isArray(media)) {
      // Carousel: multiple images
      for (const item of media) {
        const url = await uploadToS3(item.data, item.mimeType, 'scheduler/carousel');
        imageUrls.push(url);
      }
      imageUrl = imageUrls[0]; // First image as thumbnail
    } else if (postType === 'reel' || postType === 'video') {
      // Video/Reel
      videoUrl = await uploadToS3(media.data, media.mimeType, 'scheduler/videos');
    } else if (postType === 'story') {
      // Story can be image or video
      const isVideo = media.mimeType?.startsWith('video');
      if (isVideo) {
        videoUrl = await uploadToS3(media.data, media.mimeType, 'scheduler/stories');
      } else {
        imageUrl = await uploadToS3(media.data, media.mimeType, 'scheduler/stories');
      }
    } else {
      // Regular image post
      imageUrl = await uploadToS3(media.data, media.mimeType, 'scheduler/posts');
    }

    // Create the scheduled post using SchedulerService
    const postData = {
      socialAccountId: accountId,
      imageUrl,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      videoUrl,
      caption: caption || '',
      hashtags: hashtags || '',
      scheduledAt: scheduledDate,
      timezone,
      postType,
      // Buffer-like features
      music: music || '',
      tagProducts: tagProducts || '',
      firstComment: firstComment || '',
    };

    const post = await schedulerService.schedulePost(userId, postData);

    console.log(`📅 [SCHEDULER] Created manual post: ${post.postId} (${postType}) for ${scheduledDate}`);

    return res.status(200).json({
      success: true,
      message: 'Post scheduled successfully',
      post,
    });
  } catch (error) {
    console.error('[SCHEDULER] Manual Post Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/upload-media
 * Upload media to S3 and return URL (for preview before scheduling)
 */
schedulerRouter.post('/upload-media', async (req, res) => {
  try {
    const { media, type = 'image' } = req.body;
    // media: { data: base64, mimeType: 'image/png' }

    if (!media || !media.data) {
      return res.status(400).json({ error: 'media with data is required' });
    }

    const folder = type === 'video' ? 'scheduler/videos' : 'scheduler/uploads';
    const url = await uploadToS3(media.data, media.mimeType, folder);

    return res.status(200).json({
      success: true,
      url,
      mimeType: media.mimeType,
    });
  } catch (error) {
    console.error('[SCHEDULER] Upload Media Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /scheduler/publish-now
 * Immediately publish a post to Instagram (no scheduling)
 * This uploads media to S3 and publishes directly in one call
 */
schedulerRouter.post('/publish-now', async (req, res) => {
  try {
    const {
      userId,
      media, // { data: base64, mimeType: 'image/png' }
      caption,
      hashtags,
      postType = 'image', // 'image', 'story'
      accountId,
    } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!media || !media.data) {
      return res.status(400).json({ error: 'media with data is required' });
    }
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    console.log(`🚀 [PUBLISH-NOW] Starting immediate publish for user ${userId}`);

    // Step 1: Upload media to S3
    let imageUrl = null;
    const folder = postType === 'story' ? 'scheduler/stories' : 'scheduler/posts';
    imageUrl = await uploadToS3(media.data, media.mimeType, folder);
    console.log(`📤 [PUBLISH-NOW] Media uploaded to S3: ${imageUrl}`);

    // Step 2: Publish directly to Instagram
    const InstagramController = require('../functions/Instagram');
    const instagramController = new InstagramController();

    const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;

    let result;
    if (postType === 'story') {
      result = await instagramController.publishStory({
        body: { userId, imageUrl, accountId },
      });
    } else {
      result = await instagramController.publishImage({
        body: { userId, imageUrl, caption: fullCaption, accountId },
      });
    }

    if (result.json.success) {
      console.log(`✅ [PUBLISH-NOW] Published successfully! Media ID: ${result.json.mediaId}`);
      return res.status(200).json({
        success: true,
        message: 'Post published successfully',
        mediaId: result.json.mediaId,
        permalink: result.json.permalink,
        imageUrl,
        status: 'published',
      });
    } else {
      console.error(`❌ [PUBLISH-NOW] Publish failed:`, result.json.error);
      return res.status(400).json({
        success: false,
        error: result.json.error || 'Failed to publish to Instagram',
        details: result.json.details,
      });
    }
  } catch (error) {
    console.error('[SCHEDULER] Publish Now Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = schedulerRouter;

