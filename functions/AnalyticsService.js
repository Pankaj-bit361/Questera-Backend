const ScheduledPost = require('../models/scheduledPost');
const Campaign = require('../models/campaign');
const GenerationJob = require('../models/generationJob');
const InstagramController = require('./Instagram');

/**
 * Analytics Service
 * Track post performance, engagement, best times, content analysis
 */
class AnalyticsService {
  constructor() {
    this.instagramController = new InstagramController();
  }

  /**
   * Get dashboard overview for a user
   */
  async getDashboard(userId, dateRange = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);

    // Get all published posts in range
    const posts = await ScheduledPost.find({
      userId,
      status: 'published',
      publishedAt: { $gte: startDate },
    }).sort({ publishedAt: -1 });

    // Calculate metrics
    const totalPosts = posts.length;
    const totalEngagement = posts.reduce((sum, p) => {
      const eng = p.engagement || {};
      return sum + (eng.likes || 0) + (eng.comments || 0) + (eng.shares || 0) + (eng.saves || 0);
    }, 0);

    const totalReach = posts.reduce((sum, p) => sum + (p.engagement?.reach || 0), 0);
    const totalImpressions = posts.reduce((sum, p) => sum + (p.engagement?.impressions || 0), 0);

    // Average engagement per post
    const avgEngagement = totalPosts > 0 ? Math.round(totalEngagement / totalPosts) : 0;

    // Best performing posts
    const topPosts = [...posts]
      .sort((a, b) => {
        const engA = (a.engagement?.likes || 0) + (a.engagement?.comments || 0);
        const engB = (b.engagement?.likes || 0) + (b.engagement?.comments || 0);
        return engB - engA;
      })
      .slice(0, 5)
      .map(p => ({
        postId: p.postId,
        imageUrl: p.imageUrl,
        videoUrl: p.videoUrl,
        postType: p.postType,
        caption: p.caption?.substring(0, 100),
        publishedAt: p.publishedAt,
        engagement: p.engagement,
      }));

    // Posts by day of week
    const byDayOfWeek = this.aggregateByDayOfWeek(posts);

    // Posts by hour
    const byHour = this.aggregateByHour(posts);

    // Campaign stats
    const campaigns = await Campaign.find({ userId }).sort({ createdAt: -1 }).limit(5);
    const campaignStats = campaigns.map(c => ({
      campaignId: c.campaignId,
      name: c.name,
      status: c.status,
      progress: c.progress,
      metrics: c.metrics,
    }));

    // Active generation jobs
    const activeJobs = await GenerationJob.find({ userId, status: 'active' }).limit(5);
    const jobStats = activeJobs.map(j => ({
      jobId: j.jobId,
      name: j.name,
      postsGenerated: j.limits.postsGenerated,
      postsPublished: j.limits.postsPublished,
      nextRunAt: j.schedule.nextRunAt,
    }));

    return {
      overview: {
        totalPosts,
        totalEngagement,
        totalReach,
        totalImpressions,
        avgEngagement,
        dateRange,
      },
      topPosts,
      byDayOfWeek,
      byHour,
      campaigns: campaignStats,
      activeJobs: jobStats,
    };
  }

  /**
   * Aggregate engagement by day of week
   */
  aggregateByDayOfWeek(posts) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const result = days.map((name, index) => ({
      day: name,
      dayIndex: index,
      posts: 0,
      engagement: 0,
      avgEngagement: 0,
    }));

    posts.forEach(post => {
      if (post.publishedAt) {
        const dayIndex = new Date(post.publishedAt).getDay();
        const eng = (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
        result[dayIndex].posts += 1;
        result[dayIndex].engagement += eng;
      }
    });

    result.forEach(day => {
      day.avgEngagement = day.posts > 0 ? Math.round(day.engagement / day.posts) : 0;
    });

    return result;
  }

  /**
   * Aggregate engagement by hour of day
   */
  aggregateByHour(posts) {
    const result = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i}:00`,
      posts: 0,
      engagement: 0,
      avgEngagement: 0,
    }));

    posts.forEach(post => {
      if (post.publishedAt) {
        const hour = new Date(post.publishedAt).getHours();
        const eng = (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
        result[hour].posts += 1;
        result[hour].engagement += eng;
      }
    });

    result.forEach(h => {
      h.avgEngagement = h.posts > 0 ? Math.round(h.engagement / h.posts) : 0;
    });

    return result;
  }

  /**
   * Get best posting times based on historical performance
   */
  async getBestPostingTimes(userId) {
    const posts = await ScheduledPost.find({
      userId,
      status: 'published',
      'engagement.likes': { $exists: true },
    });

    const byHour = this.aggregateByHour(posts);
    const byDay = this.aggregateByDayOfWeek(posts);

    // Find best hours (top 3 by avg engagement)
    const bestHours = [...byHour]
      .filter(h => h.posts > 0)
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3)
      .map(h => h.hour);

    // Find best days (top 3 by avg engagement)
    const bestDays = [...byDay]
      .filter(d => d.posts > 0)
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3)
      .map(d => d.day);

    return {
      bestHours,
      bestDays,
      recommendation: `Post on ${bestDays[0] || 'any day'} at ${bestHours[0] || 12}:00 for best engagement`,
      byHour,
      byDay,
    };
  }

  /**
   * Get content performance analysis
   */
  async getContentAnalysis(userId) {
    const posts = await ScheduledPost.find({
      userId,
      status: 'published',
    }).sort({ publishedAt: -1 }).limit(100);

    // Analyze hashtag performance
    const hashtagStats = {};
    posts.forEach(post => {
      if (post.hashtags) {
        const tags = post.hashtags.split(' ').filter(t => t.startsWith('#'));
        const eng = (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
        tags.forEach(tag => {
          if (!hashtagStats[tag]) {
            hashtagStats[tag] = { count: 0, totalEngagement: 0 };
          }
          hashtagStats[tag].count += 1;
          hashtagStats[tag].totalEngagement += eng;
        });
      }
    });

    // Top performing hashtags
    const topHashtags = Object.entries(hashtagStats)
      .map(([tag, stats]) => ({
        tag,
        count: stats.count,
        avgEngagement: Math.round(stats.totalEngagement / stats.count),
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 10);

    // Post type performance
    const byType = {};
    posts.forEach(post => {
      const type = post.postType || 'image';
      if (!byType[type]) {
        byType[type] = { count: 0, totalEngagement: 0 };
      }
      byType[type].count += 1;
      byType[type].totalEngagement += (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
    });

    const typePerformance = Object.entries(byType).map(([type, stats]) => ({
      type,
      count: stats.count,
      avgEngagement: Math.round(stats.totalEngagement / stats.count),
    }));

    return {
      totalAnalyzed: posts.length,
      topHashtags,
      typePerformance,
    };
  }

  /**
   * Refresh engagement data for recent posts
   */
  async refreshEngagement(userId) {
    const Instagram = require('../models/instagram');
    const SocialAccount = require('../models/socialAccount');

    // Try to find Instagram connection - check both models for backward compatibility
    let accessToken = null;

    // First try the Instagram model (primary connection)
    const instagramAccount = await Instagram.findOne({ userId, isConnected: true });
    if (instagramAccount?.accessToken) {
      accessToken = instagramAccount.accessToken;
      console.log('[ANALYTICS] Found Instagram connection via Instagram model');
    }

    // Fallback to SocialAccount model
    if (!accessToken) {
      const socialAccount = await SocialAccount.findOne({
        userId,
        platform: 'instagram',
        isActive: true
      });
      if (socialAccount) {
        accessToken = socialAccount.facebookPageAccessToken || socialAccount.accessToken;
        console.log('[ANALYTICS] Found Instagram connection via SocialAccount model');
      }
    }

    if (!accessToken) {
      throw new Error('Instagram not connected. Please connect your Instagram account in Settings.');
    }

    // NEW APPROACH: Fetch all recent media directly from Instagram account
    // This fixes the issue where stored publishedMediaId might be container IDs instead of actual media IDs
    const igBusinessId = instagramAccount?.instagramBusinessAccountId;

    if (!igBusinessId) {
      throw new Error('Instagram Business Account ID not found');
    }

    console.log(`[ANALYTICS] Fetching media directly from Instagram account ${igBusinessId}`);

    // Fetch recent media from Instagram (up to 50 posts)
    const mediaListUrl = `https://graph.facebook.com/v20.0/${igBusinessId}/media?` +
      `fields=id,caption,like_count,comments_count,permalink,timestamp,media_type&limit=50&access_token=${accessToken}`;

    const mediaListResponse = await fetch(mediaListUrl);
    const mediaListData = await mediaListResponse.json();

    if (mediaListData.error) {
      throw new Error(`Instagram API error: ${mediaListData.error.message}`);
    }

    const instagramMedia = mediaListData.data || [];
    console.log(`[ANALYTICS] Found ${instagramMedia.length} posts on Instagram`);

    // Get our published posts from database
    const posts = await ScheduledPost.find({
      userId,
      status: 'published',
      publishedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
    });

    console.log(`[ANALYTICS] Found ${posts.length} published posts in database`);

    const updated = [];
    const errors = [];

    // Match each database post to Instagram media by permalink or timestamp (reliable methods only)
    for (const post of posts) {
      try {
        // Find matching Instagram media
        let igMedia = null;

        // 1. First try matching by stored permalink (most reliable)
        if (post.platformPostUrl) {
          igMedia = instagramMedia.find(m => m.permalink === post.platformPostUrl);
          if (igMedia) {
            console.log(`[ANALYTICS] Matched ${post.postId} by permalink`);
          }
        }

        // 2. Try matching by timestamp (within 5 minutes - very reliable)
        if (!igMedia && post.publishedAt) {
          const postTime = new Date(post.publishedAt).getTime();
          igMedia = instagramMedia.find(m => {
            if (!m.timestamp) return false;
            const igTime = new Date(m.timestamp).getTime();
            const diff = Math.abs(postTime - igTime);
            return diff < 5 * 60 * 1000; // Within 5 minutes
          });
          if (igMedia) {
            console.log(`[ANALYTICS] Matched ${post.postId} by timestamp (${post.publishedAt})`);
          }
        }

        if (!igMedia) {
          console.log(`[ANALYTICS] No match for ${post.postId} published at ${post.publishedAt}`);
          continue;
        }

        // Update the publishedMediaId if it was wrong
        if (post.publishedMediaId !== igMedia.id) {
          console.log(`[ANALYTICS] Fixing mediaId for ${post.postId}: ${post.publishedMediaId} -> ${igMedia.id}`);
          post.publishedMediaId = igMedia.id;
          post.platformPostUrl = igMedia.permalink;
        }

        let likes = igMedia.like_count || 0;
        let comments = igMedia.comments_count || 0;
        let reach = 0;
        let impressions = 0;
        let saves = 0;

        // Try to get insights - use v19 for impressions support or v20 with reach,saved only
        // For images: reach, saved work. For reels/videos: plays, reach, saved
        const mediaType = igMedia.media_type;
        let metrics = 'reach,saved';
        if (mediaType === 'VIDEO') {
          metrics = 'plays,reach,saved';
        }

        const insightsUrl = `https://graph.facebook.com/v19.0/${igMedia.id}/insights?` +
          `metric=${metrics}&access_token=${accessToken}`;

        const insightsResponse = await fetch(insightsUrl);
        const insightsData = await insightsResponse.json();

        if (insightsData.error) {
          // Insights may not be available for very recent posts (< 24 hours)
          console.log(`[ANALYTICS] Insights unavailable for ${post.postId}`);
        } else if (insightsData.data) {
          insightsData.data.forEach(m => {
            if (m.name === 'reach') reach = m.values?.[0]?.value || 0;
            if (m.name === 'plays') impressions = m.values?.[0]?.value || 0; // Use plays as impressions for videos
            if (m.name === 'saved') saves = m.values?.[0]?.value || 0;
          });
        }

        post.engagement = {
          likes,
          comments,
          reach,
          impressions,
          saves,
          lastUpdated: new Date(),
        };
        await post.save();
        updated.push(post.postId);

        console.log(`[ANALYTICS] Updated ${post.postId}: ${likes} likes, ${comments} comments`);
      } catch (error) {
        console.error(`[ANALYTICS] Failed to refresh ${post.postId}:`, error.message);
        errors.push({ postId: post.postId, error: error.message });
      }
    }

    return {
      updated: updated.length,
      postIds: updated,
      errors: errors.length,
      total: posts.length
    };
  }

  /**
   * Get growth metrics over time
   */
  async getGrowthMetrics(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const posts = await ScheduledPost.find({
      userId,
      status: 'published',
      publishedAt: { $gte: startDate },
    }).sort({ publishedAt: 1 });

    // Group by date
    const byDate = {};
    posts.forEach(post => {
      const date = post.publishedAt.toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { posts: 0, engagement: 0, reach: 0 };
      }
      byDate[date].posts += 1;
      byDate[date].engagement += (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
      byDate[date].reach += post.engagement?.reach || 0;
    });

    // Convert to array and calculate cumulative
    let cumPosts = 0;
    let cumEngagement = 0;
    const timeline = Object.entries(byDate).map(([date, stats]) => {
      cumPosts += stats.posts;
      cumEngagement += stats.engagement;
      return {
        date,
        posts: stats.posts,
        engagement: stats.engagement,
        reach: stats.reach,
        cumulativePosts: cumPosts,
        cumulativeEngagement: cumEngagement,
      };
    });

    return { timeline, totalDays: days };
  }
}

module.exports = AnalyticsService;
