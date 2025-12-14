const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');
const ScheduledPost = require('../models/scheduledPost');
const ContentJob = require('../models/contentJob');
const SocialGrowthAgent = require('./SocialGrowthAgent');
const AnalyticsService = require('./AnalyticsService');
const ContentEngine = require('./ContentEngine');
const ImageOrchestrator = require('./ImageOrchestrator');
const { v4: uuidv4 } = require('uuid');

class AutopilotService {
  constructor() {
    this.growthAgent = new SocialGrowthAgent();
    this.analyticsService = new AnalyticsService();
    this.contentEngine = new ContentEngine();
    this.imageOrchestrator = new ImageOrchestrator();
  }

  /**
   * Main autopilot loop - called by cron
   * Runs for all enabled autopilot configs
   */
  async runDailyAutopilot() {
    console.log('[AUTOPILOT] Starting daily autopilot run...');

    const activeConfigs = await AutopilotConfig.find({
      enabled: true,
      $or: [
        { pausedUntil: null },
        { pausedUntil: { $lt: new Date() } },
      ],
    });

    console.log(`[AUTOPILOT] Found ${activeConfigs.length} active autopilot configs`);

    const results = [];
    for (const config of activeConfigs) {
      try {
        const result = await this.runForChat(config);
        results.push({ chatId: config.chatId, success: true, ...result });
      } catch (error) {
        console.error(`[AUTOPILOT] Error for chat ${config.chatId}:`, error.message);
        results.push({ chatId: config.chatId, success: false, error: error.message });

        // Update config with failure
        config.lastRunAt = new Date();
        config.lastRunResult = 'failed';
        config.lastRunSummary = error.message;
        await config.save();
      }
    }

    console.log(`[AUTOPILOT] Daily run complete. Results:`, results.length);
    return results;
  }

  /**
   * Run autopilot for a specific chat
   */
  async runForChat(config) {
    console.log(`[AUTOPILOT] Running for chat: ${config.chatId}`);

    // Check quiet hours
    if (config.isQuietHours()) {
      console.log(`[AUTOPILOT] Skipping - quiet hours active`);
      return { skipped: true, reason: 'quiet_hours' };
    }

    // Load or create memory
    let memory = await AutopilotMemory.findOne({
      userId: config.userId,
      chatId: config.chatId,
    });

    if (!memory) {
      memory = new AutopilotMemory({
        userId: config.userId,
        chatId: config.chatId,
      });
      await memory.save();
    }

    // Step 1: Observe - Gather current account state
    const observations = await this.observeAccount(config.userId, memory);
    console.log(`[AUTOPILOT] Observations:`, observations);

    // Step 2: Decide - Use SocialGrowthAgent to create plan
    const plan = await this.growthAgent.decideDailyPlan(observations, memory, config);
    console.log(`[AUTOPILOT] Plan:`, plan);

    // Step 3: Execute - Create and schedule posts
    const executionResult = await this.executePlan(plan, config, memory);

    // Step 4: Update memory
    memory.lastDecisionSummary = plan.reasoning;
    memory.lastDecisionAt = new Date();
    await memory.save();

    // Update config
    config.lastRunAt = new Date();
    config.lastRunResult = executionResult.success ? 'success' : 'partial';
    config.lastRunSummary = plan.reasoning;
    await config.save();

    return {
      plan,
      execution: executionResult,
    };
  }

  /**
   * Observe account - gather analytics and performance data
   */
  async observeAccount(userId, memory) {
    try {
      // Get analytics data
      const dashboard = await this.analyticsService.getDashboard(userId, 7);

      // Get recent posts performance
      const recentPosts = await ScheduledPost.find({
        userId,
        status: 'published',
        publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }).sort({ publishedAt: -1 }).limit(10);

      // Calculate trends
      const engagementTrend = this.calculateTrend(recentPosts, 'engagement');
      const reachTrend = this.calculateTrend(recentPosts, 'reach');

      // Find best performing format and theme
      const formatPerformance = this.analyzeByField(recentPosts, 'format');
      const themePerformance = this.analyzeByField(memory.contentHistory || [], 'theme');

      return {
        engagementTrend,
        reachTrend,
        avgEngagementRate: dashboard?.overview?.avgEngagementRate || 0,
        bestFormat: formatPerformance.best || 'image',
        bestTheme: themePerformance.best || 'educational',
        commentRate: this.getRate(dashboard?.overview?.totalComments, recentPosts.length),
        saveRate: this.getRate(dashboard?.overview?.totalSaves, recentPosts.length),
        totalPosts: dashboard?.overview?.totalPosts || 0,
        totalReach: dashboard?.overview?.totalReach || 0,
      };
    } catch (error) {
      console.error('[AUTOPILOT] Observation error:', error.message);
      return {
        engagementTrend: 'unknown',
        reachTrend: 'unknown',
        avgEngagementRate: 0,
        bestFormat: 'image',
        bestTheme: 'educational',
      };
    }
  }

  calculateTrend(posts, metric) {
    if (posts.length < 4) return 'unknown';

    const recent = posts.slice(0, Math.floor(posts.length / 2));
    const older = posts.slice(Math.floor(posts.length / 2));

    const getMetricValue = (post) => {
      if (metric === 'engagement') {
        return (post.engagement?.likes || 0) + (post.engagement?.comments || 0);
      }
      return post.engagement?.reach || 0;
    };

    const recentAvg = recent.reduce((sum, p) => sum + getMetricValue(p), 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + getMetricValue(p), 0) / older.length;

    if (recentAvg > olderAvg * 1.1) return 'up';
    if (recentAvg < olderAvg * 0.9) return 'down';
    return 'flat';
  }

  analyzeByField(items, field) {
    const performance = {};
    items.forEach(item => {
      const key = item[field] || 'unknown';
      if (!performance[key]) {
        performance[key] = { total: 0, count: 0 };
      }
      performance[key].total += item.performance?.engagementRate ||
        ((item.engagement?.likes || 0) + (item.engagement?.comments || 0));
      performance[key].count++;
    });

    let best = null;
    let bestAvg = 0;
    Object.entries(performance).forEach(([key, data]) => {
      const avg = data.total / data.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = key;
      }
    });

    return { best, performance };
  }

  getRate(value, count) {
    if (!count) return 'low';
    const avg = (value || 0) / count;
    if (avg > 5) return 'high';
    if (avg > 2) return 'normal';
    return 'low';
  }

  /**
   * Execute the plan - create and schedule posts
   */
  async executePlan(plan, config, memory) {
    const results = {
      feedPosts: [],
      stories: [],
      success: true,
    };

    // Execute feed posts
    if (plan.feedPosts && config.permissions?.autoPost) {
      for (const postPlan of plan.feedPosts) {
        try {
          const result = await this.createFeedPost(postPlan, config, memory);
          results.feedPosts.push(result);

          // Add to memory
          memory.addContentHistory({
            date: new Date(),
            postId: result.postId,
            type: 'feed',
            format: postPlan.format,
            theme: postPlan.theme,
            hookStyle: postPlan.hookStyle,
            performance: {},
          });
          memory.totalPostsGenerated++;
        } catch (error) {
          console.error('[AUTOPILOT] Feed post error:', error.message);
          results.feedPosts.push({ error: error.message });
          results.success = false;
        }
      }
    }

    // Execute stories
    if (plan.stories && config.permissions?.autoStory) {
      for (const storyPlan of plan.stories) {
        try {
          const result = await this.createStory(storyPlan, config);
          results.stories.push(result);
          memory.totalStoriesGenerated++;
        } catch (error) {
          console.error('[AUTOPILOT] Story error:', error.message);
          results.stories.push({ error: error.message });
        }
      }
    }

    await memory.save();
    return results;
  }

  /**
   * Create a feed post based on plan
   * This generates the image and schedules the post
   */
  async createFeedPost(postPlan, config, memory) {
    // Calculate scheduled time
    const scheduledAt = this.parseTime(postPlan.time);

    console.log(`[AUTOPILOT] Creating feed post for ${config.userId}, scheduled at ${scheduledAt}`);

    // Step 1: Generate a prompt based on the plan
    const prompt = await this.generateImagePrompt(postPlan, memory);
    console.log(`[AUTOPILOT] Generated prompt: ${prompt.slice(0, 100)}...`);

    // Step 2: Create a content job
    const contentJob = await ContentJob.create({
      userId: config.userId,
      type: 'single',
      status: 'pending',
      userRequest: `Autopilot: ${postPlan.theme} post`,
      inputBrief: {
        concept: postPlan.promptSuggestion || postPlan.theme,
        style: postPlan.format,
        tone: config.contentPreferences?.tone || 'friendly',
      },
      prompts: [prompt],
      progress: { total: 1, completed: 0, failed: 0 },
    });

    console.log(`[AUTOPILOT] Created content job: ${contentJob.jobId}`);

    // Step 3: Generate the image
    const { results } = await this.imageOrchestrator.executeJob(contentJob.jobId, []);

    if (!results || results.length === 0) {
      throw new Error('Image generation failed - no results');
    }

    const imageResult = results[0];
    console.log(`[AUTOPILOT] Image generated: ${imageResult.url}`);

    // Step 4: Generate viral content (caption, hashtags)
    const viralContent = await this.contentEngine.generateViralPostContent(
      contentJob.inputBrief,
      [prompt],
      {
        platform: config.platform || 'instagram',
        tone: config.contentPreferences?.tone || 'friendly',
        goals: [postPlan.goal || 'engagement'],
      }
    );

    console.log(`[AUTOPILOT] Viral content generated`);

    // Step 5: Create the scheduled post
    const postId = `post-${uuidv4()}`;
    const post = await ScheduledPost.create({
      postId,
      userId: config.userId,
      platform: config.platform || 'instagram',
      imageUrl: imageResult.url,
      caption: viralContent.description || viralContent.shortCaption || '',
      hashtags: viralContent.hashtagString || '',
      postType: postPlan.format || 'image',
      scheduledAt,
      status: 'scheduled',
      contentJobId: contentJob.jobId,
    });

    console.log(`[AUTOPILOT] Created scheduled post ${postId} for ${scheduledAt}`);

    return {
      postId,
      scheduledAt,
      imageUrl: imageResult.url,
      caption: post.caption,
      plan: postPlan,
    };
  }

  /**
   * Generate an image prompt based on the autopilot plan
   */
  async generateImagePrompt(postPlan, memory) {
    // Build context from memory
    const brandInfo = memory.brand || {};
    const theme = postPlan.theme || 'lifestyle';
    const format = postPlan.format || 'image';
    const hookStyle = postPlan.hookStyle || 'value';

    // Create a detailed prompt
    const basePrompt = postPlan.promptSuggestion || `A ${theme} themed ${format} for social media`;

    // Enhance with brand context
    const prompt = `${basePrompt}.
Style: ${brandInfo.visualStyle || 'modern, clean, professional'}.
Tone: ${brandInfo.tone || 'friendly and engaging'}.
Target audience: ${brandInfo.targetAudience || 'general social media users'}.
High quality, Instagram-worthy, visually striking.`;

    return prompt;
  }

  /**
   * Create a story based on plan
   */
  async createStory(storyPlan, config) {
    // Stories are simpler - just log for now
    // Full story implementation would require story-specific generation
    const scheduledAt = this.parseTime(storyPlan.time);

    console.log(`[AUTOPILOT] Story planned for ${scheduledAt}: ${storyPlan.type}`);

    return {
      type: storyPlan.type,
      scheduledAt,
      status: 'planned', // Stories need manual creation for now
    };
  }

  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(hours, minutes, 0, 0);

    // If time already passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled;
  }
}

module.exports = AutopilotService;

