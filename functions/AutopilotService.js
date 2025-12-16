const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');
const ScheduledPost = require('../models/scheduledPost');
const ContentJob = require('../models/contentJob');
const SocialGrowthAgent = require('./SocialGrowthAgent');
const AnalyticsService = require('./AnalyticsService');
const ContentEngine = require('./ContentEngine');
const ImageOrchestrator = require('./ImageOrchestrator');
const { OpenRouterProvider } = require('../agent/LLMProvider');
const { v4: uuidv4 } = require('uuid');

class AutopilotService {
  constructor() {
    this.growthAgent = new SocialGrowthAgent();
    this.analyticsService = new AnalyticsService();
    this.contentEngine = new ContentEngine();
    this.imageOrchestrator = new ImageOrchestrator();
    this.openRouterProvider = new OpenRouterProvider();
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
      // FIRST: Refresh engagement data from Instagram API
      // This ensures we have the latest likes, comments, saves, reach
      console.log('[AUTOPILOT] Refreshing analytics from Instagram...');
      try {
        const refreshResult = await this.analyticsService.refreshEngagement(userId);
        console.log(`[AUTOPILOT] Refreshed ${refreshResult.updated} posts with latest Instagram data`);
      } catch (refreshError) {
        console.log('[AUTOPILOT] Analytics refresh failed (will use cached data):', refreshError.message);
      }

      // Get analytics data (now with fresh data)
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

    // Step 2: Collect reference images from memory
    const referenceImages = this.collectReferenceImages(memory);
    console.log(`[AUTOPILOT] Using ${referenceImages.length} reference image(s)`);

    // Step 3: Create a content job
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

    // Step 4: Generate the image with reference images
    const { results } = await this.imageOrchestrator.executeJob(contentJob.jobId, referenceImages);

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
   * Generate an image prompt based on the autopilot plan using LLM
   */
  async generateImagePrompt(postPlan, memory) {
    const brandInfo = memory.brand || {};
    const refImages = memory.referenceImages || {};
    const topics = brandInfo.topicsAllowed?.join(', ') || 'lifestyle content';
    const theme = postPlan.theme || 'lifestyle';
    const format = postPlan.format || 'image';
    const hookStyle = postPlan.hookStyle || 'value';
    const goal = postPlan.goal || 'engagement';

    // Check what reference images are available
    const hasPersonal = !!refImages.personalReference?.url;
    const hasProducts = refImages.productImages?.length > 0;
    const hasStyleRefs = refImages.styleReferences?.length > 0;

    // Build reference context for the prompt
    let referenceContext = '';
    if (hasPersonal || hasProducts || hasStyleRefs) {
      referenceContext = '\nREFERENCE IMAGES AVAILABLE:';
      if (hasPersonal) referenceContext += '\n- Personal photo of the creator (incorporate this person into the scene)';
      if (hasProducts) referenceContext += `\n- ${refImages.productImages.length} product image(s) (feature the products naturally)`;
      if (hasStyleRefs) referenceContext += '\n- Style reference images (match this aesthetic)';
      referenceContext += '\n\nIMPORTANT: The AI will receive these reference images. Design the prompt to naturally incorporate them.';
    }

    // Use LLM to generate a creative, specific prompt
    const systemPrompt = `You are an expert social media content creator and AI image prompt engineer.
Your job is to create SPECIFIC, DETAILED image generation prompts that will result in viral Instagram content.

IMPORTANT RULES:
1. Be SPECIFIC - describe exact scenes, compositions, colors, lighting
2. Include the brand's niche/topics naturally in the image concept
3. Make it visually striking and scroll-stopping
4. Consider the theme and hook style for maximum impact
5. If personal/product references are available, design the scene to feature them naturally
6. Output ONLY the image prompt, nothing else`;

    const userPrompt = `Create a detailed AI image generation prompt for this social media post:

BRAND CONTEXT:
- Niche/Topics: ${topics}
- Target Audience: ${brandInfo.targetAudience || 'general audience'}
- Visual Style: ${brandInfo.visualStyle || 'modern and clean'}
- Brand Tone: ${brandInfo.tone || 'friendly'}
${referenceContext}

POST REQUIREMENTS:
- Theme: ${theme}
- Format: ${format}
- Hook Style: ${hookStyle} (${hookStyle === 'value' ? 'provide value/tips' : hookStyle === 'curiosity' ? 'create intrigue' : hookStyle === 'bold' ? 'make a bold statement' : 'engage the viewer'})
- Goal: ${goal}

${postPlan.promptSuggestion ? `Agent suggestion: ${postPlan.promptSuggestion}` : ''}

Generate a detailed, specific image prompt that will create a visually stunning, on-brand image for Instagram.
${hasPersonal ? 'The image should feature the person from the reference photo in a natural, on-brand setting.' : ''}
${hasProducts ? 'Feature the products naturally in the scene.' : ''}
The prompt should be 2-3 sentences describing the exact visual scene, style, lighting, and mood.`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const response = await this.openRouterProvider.chat(messages, {
        temperature: 0.8,
        maxTokens: 300
      });

      // Response is already the content string from OpenRouterProvider
      const generatedPrompt = typeof response === 'string' ? response.trim() : response;

      if (generatedPrompt) {
        console.log(`[AUTOPILOT] LLM generated prompt: ${generatedPrompt.substring(0, 100)}...`);
        return generatedPrompt;
      }
    } catch (error) {
      console.error('[AUTOPILOT] LLM prompt generation failed:', error.message);
    }

    // Fallback to basic prompt if LLM fails
    return `A ${theme} themed Instagram post about ${topics}. Style: ${brandInfo.visualStyle || 'modern'}. High quality, visually striking, Instagram-worthy.`;
  }

  /**
   * Create a story based on plan - generates image and schedules for publishing
   */
  async createStory(storyPlan, config) {
    const scheduledAt = this.parseTime(storyPlan.time);

    console.log(`[AUTOPILOT] Creating story for ${config.userId}, scheduled at ${scheduledAt}`);

    // Get brand info for story context
    const memory = await AutopilotMemory.findOne({ userId: config.userId, chatId: config.chatId });
    const brandInfo = memory?.brandInfo || {};

    // Generate a story-appropriate prompt (9:16 aspect ratio, bold text overlay style)
    const storyPrompt = await this.generateStoryPrompt(storyPlan, brandInfo);

    // Step 1: Create a content job for story
    const ContentJob = require('../models/contentJob');
    const contentJob = await ContentJob.create({
      userId: config.userId,
      type: 'single',
      status: 'pending',
      userRequest: `Autopilot Story: ${storyPlan.type}`,
      inputBrief: {
        concept: storyPlan.content || storyPlan.type,
        style: 'instagram story',
        tone: brandInfo.tone || 'engaging',
        aspectRatio: '9:16', // Story aspect ratio
      },
      prompts: [storyPrompt],
      progress: { total: 1, completed: 0, failed: 0 },
    });

    // Step 2: Generate the story image
    const { results } = await this.imageOrchestrator.executeJob(contentJob.jobId);

    if (!results || results.length === 0) {
      throw new Error('Story image generation failed');
    }

    const imageUrl = results[0].imageUrl;
    console.log(`[AUTOPILOT] Story image generated: ${imageUrl}`);

    // Step 3: Get Instagram account
    const Instagram = require('../models/instagram');
    const instagramData = await Instagram.findOne({ userId: config.userId });

    if (!instagramData) {
      throw new Error('No Instagram account connected');
    }

    const account = instagramData.accounts?.[0] || instagramData;
    const accountId = account.instagramBusinessAccountId;

    // Step 4: Schedule the story post
    const ScheduledPost = require('../models/scheduledPost');
    const storyPost = await ScheduledPost.create({
      userId: config.userId,
      accountId: accountId,
      platform: 'instagram',
      postType: 'story',
      imageUrl: imageUrl,
      caption: '', // Stories don't have captions
      scheduledAt: scheduledAt,
      status: 'scheduled',
      metadata: {
        autopilot: true,
        chatId: config.chatId,
        storyType: storyPlan.type,
      },
    });

    console.log(`[AUTOPILOT] Story scheduled: ${storyPost.postId} at ${scheduledAt}`);

    return {
      type: storyPlan.type,
      postId: storyPost.postId,
      imageUrl: imageUrl,
      scheduledAt,
      status: 'scheduled',
    };
  }

  /**
   * Generate a story-specific prompt
   */
  async generateStoryPrompt(storyPlan, brandInfo) {
    const storyType = storyPlan.type || 'engagement';
    const content = storyPlan.content || '';
    const visualStyle = brandInfo.visualStyle || 'modern, bold';

    const systemPrompt = `You are a creative director for Instagram Stories.
Generate a prompt for an AI image generator to create a vertical (9:16) Instagram Story image.
Stories should be eye-catching, bold, and designed to drive quick engagement.`;

    const userPrompt = `Create a story image prompt for:
Story Type: ${storyType}
Content: ${content}
Brand Style: ${visualStyle}

The image should:
- Be designed for vertical 9:16 format
- Be bold and attention-grabbing
- Work well with text overlays
- Match the brand style

Return ONLY the image generation prompt, nothing else.`;

    try {
      const response = await this.openRouterProvider.generateChatCompletion({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.8,
        maxTokens: 200,
      });

      return response.content;
    } catch (error) {
      console.error('[AUTOPILOT] Story prompt generation error:', error.message);
      return `An eye-catching Instagram Story image, vertical 9:16 format, ${storyType} style, ${visualStyle}, bold colors, perfect for social media story.`;
    }
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

  /**
   * Collect reference images from memory for image generation
   * Returns array of { data: base64 or url, mimeType: string }
   */
  collectReferenceImages(memory) {
    const images = [];
    const refImages = memory.referenceImages;

    if (!refImages) return images;

    // Add personal reference (highest priority for personalized content)
    if (refImages.personalReference?.url) {
      images.push({
        url: refImages.personalReference.url,
        mimeType: 'image/png',
        type: 'personal',
      });
    }

    // Add product images (pick 1-2 random ones to avoid overloading)
    if (refImages.productImages?.length > 0) {
      const shuffled = [...refImages.productImages].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 2);
      selected.forEach(img => {
        images.push({
          url: img.url,
          mimeType: 'image/png',
          type: 'product',
        });
      });
    }

    // Add style references (pick 1 random one for style guidance)
    if (refImages.styleReferences?.length > 0) {
      const randomStyle = refImages.styleReferences[Math.floor(Math.random() * refImages.styleReferences.length)];
      images.push({
        url: randomStyle.url,
        mimeType: 'image/png',
        type: 'style',
      });
    }

    return images;
  }
}

module.exports = AutopilotService;

