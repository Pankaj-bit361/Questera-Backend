const ScheduledPost = require('../models/scheduledPost');
const Campaign = require('../models/campaign');
const SocialAccount = require('../models/socialAccount');
const Instagram = require('../models/instagram');
const InstagramService = require('./InstagramService');
const { v4: uuidv4 } = require('uuid');

/**
 * Scheduler Service
 * Manages post scheduling, queue processing, and campaign automation
 */
class SchedulerService {
  constructor() {
    this.instagramService = new InstagramService();
    this.isProcessing = false;
  }

  /**
   * Schedule a single post
   */
  async schedulePost(userId, postData) {
    const {
      socialAccountId,
      imageUrl,
      imageUrls,
      caption,
      hashtags,
      scheduledAt,
      timezone = 'UTC',
      postType = 'image',
      campaignId,
      contentJobId,
    } = postData;

    // Validate social account - check SocialAccount first, then Instagram collection
    let account = await SocialAccount.findOne({ accountId: socialAccountId, userId });
    let platform = account?.platform || 'instagram';
    let accountIdToStore = socialAccountId;

    if (!account) {
      // Try to find in Instagram collection (by instagramBusinessAccountId)
      const igDoc = await Instagram.findOne({ userId });
      if (igDoc && igDoc.accounts) {
        const igAccount = igDoc.accounts.find(a => a.instagramBusinessAccountId === socialAccountId);
        if (igAccount) {
          console.log('📅 [SCHEDULER] Found account in Instagram collection:', igAccount.instagramUsername);
          platform = 'instagram';
          accountIdToStore = igAccount.instagramBusinessAccountId;
        } else {
          throw new Error('Social account not found');
        }
      } else {
        throw new Error('Social account not found');
      }
    }

    const post = await ScheduledPost.create({
      userId,
      accountId: accountIdToStore,
      platform,
      imageUrl,
      imageUrls: imageUrls || [],
      caption,
      hashtags: hashtags || '',
      scheduledAt: new Date(scheduledAt),
      timezone,
      postType,
      campaignId,
      contentJobId,
      status: 'scheduled',
    });

    console.log('📅 [SCHEDULER] Post scheduled for:', post.scheduledAt);
    return post;
  }

  /**
   * Schedule multiple posts at intervals
   */
  async scheduleBulkPosts(userId, socialAccountId, posts, options = {}) {
    const {
      startTime = new Date(),
      intervalMinutes = 60,
      timezone = 'UTC',
      campaignId,
    } = options;

    const scheduledPosts = [];
    let currentTime = new Date(startTime);

    for (const post of posts) {
      const scheduled = await this.schedulePost(userId, {
        socialAccountId,
        imageUrl: post.imageUrl,
        imageUrls: post.imageUrls,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduledAt: currentTime,
        timezone,
        postType: post.postType || 'image',
        campaignId,
        contentJobId: post.contentJobId,
      });

      scheduledPosts.push(scheduled);
      currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000);
    }

    console.log('📅 [SCHEDULER] Bulk scheduled', scheduledPosts.length, 'posts');
    return scheduledPosts;
  }

  /**
   * Create and schedule a campaign
   */
  async createCampaign(userId, campaignData) {
    const {
      name,
      description,
      type = 'custom',
      platforms = ['instagram'],
      schedule,
      content,
      viralSettings,
      socialAccountId,
    } = campaignData;

    // Create campaign
    const campaign = await Campaign.create({
      userId,
      name,
      description,
      type,
      platforms,
      schedule: {
        startDate: new Date(schedule.startDate),
        endDate: schedule.endDate ? new Date(schedule.endDate) : null,
        postsPerDay: schedule.postsPerDay || 1,
        postingTimes: schedule.postingTimes || ['12:00'],
        interval: schedule.interval || 'daily',
        intervalMinutes: schedule.intervalMinutes,
        timezone: schedule.timezone || 'UTC',
      },
      content,
      viralSettings,
      status: 'draft',
    });

    console.log('🎯 [SCHEDULER] Campaign created:', campaign.campaignId);
    return campaign;
  }

  /**
   * Generate posting schedule from campaign settings
   */
  generatePostingTimes(campaign, postCount) {
    const times = [];
    const { startDate, postingTimes, interval, intervalMinutes, timezone } = campaign.schedule;

    let currentDate = new Date(startDate);
    let postsScheduled = 0;

    while (postsScheduled < postCount) {
      for (const time of postingTimes) {
        if (postsScheduled >= postCount) break;

        const [hours, minutes] = time.split(':').map(Number);
        const postTime = new Date(currentDate);
        postTime.setHours(hours, minutes, 0, 0);

        // Only schedule future posts
        if (postTime > new Date()) {
          times.push(postTime);
          postsScheduled++;
        }
      }

      // Move to next day or interval
      if (interval === 'hourly') {
        currentDate = new Date(currentDate.getTime() + (intervalMinutes || 60) * 60 * 1000);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return times;
  }

  /**
   * Process scheduled posts that are due (called by cron job)
   */
  async processScheduledPosts() {
    if (this.isProcessing) {
      console.log('⏳ [SCHEDULER] Already processing, skipping...');
      return { processed: 0, skipped: true };
    }

    this.isProcessing = true;
    console.log('🔄 [SCHEDULER] Processing scheduled posts...');

    try {
      // Find all posts due for publishing
      const duePosts = await ScheduledPost.findDuePosts();
      console.log(`📬 [SCHEDULER] Found ${duePosts.length} posts due for publishing`);

      let processed = 0;
      let failed = 0;

      for (const post of duePosts) {
        try {
          await this.publishPost(post);
          processed++;
        } catch (error) {
          console.error(`❌ [SCHEDULER] Failed to publish post ${post.postId}:`, error.message);
          failed++;
        }
      }

      console.log(`✅ [SCHEDULER] Processed: ${processed}, Failed: ${failed}`);
      return { processed, failed, total: duePosts.length };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Publish a single scheduled post
   */
  async publishPost(post) {
    console.log(`📤 [SCHEDULER] Publishing post ${post.postId} to ${post.platform}`);

    // Mark as processing
    post.status = 'processing';
    await post.save();

    try {
      let result;
      const fullCaption = post.fullCaption; // Uses virtual field

      if (post.platform === 'instagram') {
        if (post.postType === 'carousel' && post.imageUrls?.length > 1) {
          result = await this.instagramService.postCarousel(
            post.accountId,
            post.imageUrls,
            fullCaption
          );
        } else {
          result = await this.instagramService.postImage(
            post.accountId,
            post.imageUrl,
            fullCaption
          );
        }
      } else {
        throw new Error(`Platform ${post.platform} not yet supported`);
      }

      // Update post with success
      post.status = 'published';
      post.publishedAt = new Date();
      post.publishedMediaId = result.mediaId;
      post.platformPostUrl = result.permalink;
      await post.save();

      // Update campaign progress if part of campaign
      if (post.campaignId) {
        await Campaign.findOneAndUpdate(
          { campaignId: post.campaignId },
          { $inc: { 'progress.posted': 1 } }
        );
      }

      console.log(`✅ [SCHEDULER] Post ${post.postId} published successfully`);
      return result;
    } catch (error) {
      // Handle failure
      post.status = 'failed';
      post.publishError = error.message;
      post.retryCount += 1;

      // If retries remaining, reset to scheduled
      if (post.retryCount < 3) {
        post.status = 'scheduled';
        post.scheduledAt = new Date(Date.now() + 5 * 60 * 1000); // Retry in 5 min
      }

      await post.save();

      // Update campaign progress if part of campaign
      if (post.campaignId && post.status === 'failed') {
        await Campaign.findOneAndUpdate(
          { campaignId: post.campaignId },
          { $inc: { 'progress.failed': 1 } }
        );
      }

      throw error;
    }
  }

  /**
   * Get scheduled posts for a user
   */
  async getScheduledPosts(userId, options = {}) {
    const { status, platform, startDate, endDate, limit = 50 } = options;

    const query = { userId };

    if (status) query.status = status;
    if (platform) query.platform = platform;
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    return ScheduledPost.find(query)
      .sort({ scheduledAt: 1 })
      .limit(limit);
  }

  /**
   * Get calendar view of scheduled posts
   */
  async getCalendarView(userId, startDate, endDate) {
    const posts = await ScheduledPost.getCalendarPosts(userId, new Date(startDate), new Date(endDate));

    // Group by date
    const calendar = {};
    for (const post of posts) {
      const dateKey = post.scheduledAt.toISOString().split('T')[0];
      if (!calendar[dateKey]) {
        calendar[dateKey] = [];
      }
      calendar[dateKey].push(post);
    }

    return calendar;
  }

  /**
   * Cancel a scheduled post
   */
  async cancelPost(userId, postId) {
    const post = await ScheduledPost.findOneAndUpdate(
      { userId, postId, status: 'scheduled' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!post) {
      throw new Error('Post not found or already published');
    }

    return post;
  }

  /**
   * Reschedule a post
   */
  async reschedulePost(userId, postId, newScheduledAt) {
    const post = await ScheduledPost.findOneAndUpdate(
      { userId, postId, status: { $in: ['scheduled', 'failed'] } },
      {
        scheduledAt: new Date(newScheduledAt),
        status: 'scheduled',
        retryCount: 0,
        publishError: null,
      },
      { new: true }
    );

    if (!post) {
      throw new Error('Post not found or already published');
    }

    return post;
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(userId, campaignId) {
    const campaign = await Campaign.findOneAndUpdate(
      { userId, campaignId, status: { $in: ['scheduled', 'running'] } },
      { status: 'paused' },
      { new: true }
    );

    if (!campaign) {
      throw new Error('Campaign not found or cannot be paused');
    }

    // Cancel all pending posts for this campaign
    await ScheduledPost.updateMany(
      { campaignId, status: 'scheduled' },
      { status: 'cancelled' }
    );

    return campaign;
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(userId, campaignId) {
    const campaign = await Campaign.findOneAndUpdate(
      { userId, campaignId, status: 'paused' },
      { status: 'running' },
      { new: true }
    );

    if (!campaign) {
      throw new Error('Campaign not found or not paused');
    }

    // Reschedule cancelled posts
    await ScheduledPost.updateMany(
      { campaignId, status: 'cancelled' },
      { status: 'scheduled' }
    );

    return campaign;
  }

  /**
   * Get campaign with all its posts
   */
  async getCampaignDetails(userId, campaignId) {
    const campaign = await Campaign.findOne({ userId, campaignId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const posts = await ScheduledPost.find({ campaignId })
      .sort({ scheduledAt: 1 });

    return { campaign, posts };
  }

  /**
   * Update engagement metrics for published posts
   */
  async updatePostEngagement(postId) {
    const post = await ScheduledPost.findOne({ postId, status: 'published' });

    if (!post || !post.publishedMediaId) {
      return null;
    }

    const account = await SocialAccount.findOne({ accountId: post.accountId });
    if (!account) return null;

    const insights = await this.instagramService.getPostInsights(
      post.publishedMediaId,
      account.facebookPageAccessToken || account.accessToken
    );

    if (insights) {
      post.engagement = {
        likes: insights.engagement || 0,
        impressions: insights.impressions || 0,
        reach: insights.reach || 0,
        saves: insights.saved || 0,
        lastUpdated: new Date(),
      };
      await post.save();
    }

    return post;
  }

  /**
   * Start the scheduler cron (call this on server start)
   */
  startCron(intervalSeconds = 60) {
    console.log(`⏰ [SCHEDULER] Starting cron, checking every ${intervalSeconds}s`);

    setInterval(async () => {
      try {
        await this.processScheduledPosts();
      } catch (error) {
        console.error('❌ [SCHEDULER] Cron error:', error);
      }
    }, intervalSeconds * 1000);
  }
}

module.exports = SchedulerService;

