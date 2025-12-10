const ContentEngine = require('./ContentEngine');
const ImageOrchestrator = require('./ImageOrchestrator');
const SchedulerService = require('./SchedulerService');
const Campaign = require('../models/campaign');
const ContentJob = require('../models/contentJob');
const SocialAccount = require('../models/socialAccount');
const { v4: uuidv4 } = require('uuid');

/**
 * Campaign Orchestrator
 * End-to-end automation: Generate images → Create viral content → Schedule posts
 * 
 * Use Cases:
 * - Product photography on models with auto-posting
 * - Influencer content calendar
 * - Brand campaign automation
 */
class CampaignOrchestrator {
  constructor() {
    this.contentEngine = new ContentEngine();
    this.imageOrchestrator = new ImageOrchestrator();
    this.schedulerService = new SchedulerService();
  }

  /**
   * Create and execute a full automated campaign
   * 
   * @param {Object} params Campaign parameters
   * @param {string} params.userId User ID
   * @param {string} params.name Campaign name
   * @param {string} params.description Campaign description
   * @param {string} params.socialAccountId Instagram account to post to
   * @param {Array} params.productImages Product/reference images
   * @param {Array} params.modelTypes ['male', 'female'] for generating variations
   * @param {number} params.postsPerModel Number of posts per model type
   * @param {Object} params.schedule Scheduling configuration
   * @param {Object} params.viralSettings Viral content settings
   */
  async createAutomatedCampaign(params) {
    const {
      userId,
      name,
      description,
      socialAccountId,
      productImages = [],
      modelTypes = ['female'],
      postsPerModel = 3,
      schedule,
      viralSettings = {},
      userRequest,
    } = params;

    console.log('🚀 [CAMPAIGN-ORCH] Starting automated campaign:', name);

    // Step 1: Validate social account
    const socialAccount = await SocialAccount.findOne({ accountId: socialAccountId, userId });
    if (!socialAccount) {
      throw new Error('Social account not found. Please connect Instagram first.');
    }

    // Step 2: Create campaign record
    const totalPosts = modelTypes.length * postsPerModel;
    const campaign = await Campaign.create({
      userId,
      name,
      description,
      type: 'product_launch',
      platforms: ['instagram'],
      schedule: {
        startDate: new Date(schedule.startDate || Date.now()),
        endDate: schedule.endDate ? new Date(schedule.endDate) : null,
        postsPerDay: schedule.postsPerDay || 1,
        postingTimes: schedule.postingTimes || ['12:00'],
        interval: schedule.interval || 'daily',
        intervalMinutes: schedule.intervalMinutes || 60,
        timezone: schedule.timezone || 'UTC',
      },
      content: {
        productImages: productImages.map(img => img.url || img),
        modelTypes,
        styles: viralSettings.styles || ['photorealistic'],
        themes: viralSettings.themes || [],
        customPrompts: [],
      },
      viralSettings: {
        tone: viralSettings.tone || 'engaging',
        niche: viralSettings.niche || '',
        goals: viralSettings.goals || ['engagement', 'awareness'],
        hashtagStrategy: viralSettings.hashtagStrategy || 'mixed',
      },
      progress: {
        totalPosts,
        generated: 0,
        scheduled: 0,
        posted: 0,
        failed: 0,
      },
      status: 'generating',
    });

    console.log('📦 [CAMPAIGN-ORCH] Campaign created:', campaign.campaignId);

    // Step 3: Generate design brief based on user request
    const designBrief = await this.contentEngine.generateDesignBrief(
      userRequest || `Create ${totalPosts} product photos with models`,
      { referenceType: 'product' }
    );

    console.log('📋 [CAMPAIGN-ORCH] Design brief generated:', designBrief.concept);

    // Step 4: Generate prompts for each model type
    const allPrompts = [];
    for (const modelType of modelTypes) {
      const prompts = await this.generateModelPrompts(designBrief, modelType, postsPerModel, productImages.length > 0);
      allPrompts.push(...prompts.map(p => ({ prompt: p, modelType })));
    }

    console.log('📝 [CAMPAIGN-ORCH] Generated', allPrompts.length, 'prompts');

    // Step 5: Create content job for image generation
    const contentJob = await ContentJob.create({
      userId,
      type: 'campaign',
      status: 'pending',
      userRequest: userRequest || name,
      inputBrief: designBrief,
      prompts: allPrompts.map(p => p.prompt),
      referenceImageUrls: productImages.map(img => img.url || img),
      progress: { total: allPrompts.length, completed: 0, failed: 0 },
    });

    campaign.contentJobId = contentJob.jobId;
    await campaign.save();

    console.log('📦 [CAMPAIGN-ORCH] Content job created:', contentJob.jobId);

    // Return immediately - generation happens async
    return {
      success: true,
      campaign: {
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        totalPosts,
        contentJobId: contentJob.jobId,
      },
      message: `Campaign created! Generating ${totalPosts} images...`,
    };
  }

  /**
   * Generate prompts specific to model types
   */
  async generateModelPrompts(designBrief, modelType, count, hasProductImage) {
    const modelDescriptions = {
      male: 'a professional male model with athletic build',
      female: 'a professional female model with elegant features',
      unisex: 'a professional model',
      product_only: 'the product displayed elegantly',
    };

    const modelDesc = modelDescriptions[modelType] || modelDescriptions.unisex;
    const referenceNote = hasProductImage
      ? `The model should be wearing/using the product from the reference image. `
      : '';

    const enhancedBrief = {
      ...designBrief,
      concept: `${referenceNote}${designBrief.concept} featuring ${modelDesc}`,
    };

    return this.contentEngine.generateImagePrompts(enhancedBrief, {
      hasReferenceImage: hasProductImage,
      referenceType: 'product',
      count,
    });
  }

  /**
   * Execute campaign - generate all images and schedule posts
   * Call this after campaign is created (can be async/background job)
   */
  async executeCampaign(campaignId, referenceImages = []) {
    const campaign = await Campaign.findOne({ campaignId });
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    console.log('🎬 [CAMPAIGN-ORCH] Executing campaign:', campaignId);

    const contentJob = await ContentJob.findOne({ jobId: campaign.contentJobId });
    if (!contentJob) {
      throw new Error('Content job not found');
    }

    // Step 1: Generate all images
    console.log('🖼️ [CAMPAIGN-ORCH] Generating images...');
    const { results } = await this.imageOrchestrator.executeJob(
      contentJob.jobId,
      referenceImages
    );

    campaign.progress.generated = results.length;
    await campaign.save();

    console.log('✅ [CAMPAIGN-ORCH] Generated', results.length, 'images');

    // Step 2: Generate viral content for each image
    const postsToSchedule = [];
    for (const result of results) {
      const viralContent = await this.contentEngine.generateViralPostContent(
        contentJob.inputBrief,
        [result.promptUsed],
        {
          platform: 'instagram',
          tone: campaign.viralSettings?.tone || 'engaging',
          niche: campaign.viralSettings?.niche || '',
          goals: campaign.viralSettings?.goals || [],
        }
      );

      postsToSchedule.push({
        imageUrl: result.url,
        caption: viralContent.description || viralContent.shortCaption,
        hashtags: viralContent.hashtagString,
        postType: 'image',
        contentJobId: contentJob.jobId,
      });
    }

    // Step 3: Get social account for scheduling
    const socialAccount = await SocialAccount.findOne({
      userId: campaign.userId,
      platform: 'instagram',
      isActive: true,
    });

    if (!socialAccount) {
      campaign.status = 'failed';
      campaign.error = { message: 'No active Instagram account found' };
      await campaign.save();
      throw new Error('No active Instagram account found');
    }

    // Step 4: Calculate posting times
    const postingTimes = this.schedulerService.generatePostingTimes(
      campaign,
      postsToSchedule.length
    );

    // Step 5: Schedule all posts
    console.log('📅 [CAMPAIGN-ORCH] Scheduling', postsToSchedule.length, 'posts...');

    for (let i = 0; i < postsToSchedule.length; i++) {
      const post = postsToSchedule[i];
      const scheduledTime = postingTimes[i] || new Date(Date.now() + (i + 1) * 3600000);

      await this.schedulerService.schedulePost(campaign.userId, {
        socialAccountId: socialAccount.accountId,
        imageUrl: post.imageUrl,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduledAt: scheduledTime,
        timezone: campaign.schedule.timezone,
        postType: post.postType,
        campaignId: campaign.campaignId,
        contentJobId: post.contentJobId,
      });

      campaign.progress.scheduled += 1;
      await campaign.save();
    }

    // Step 6: Update campaign status
    campaign.status = 'scheduled';
    await campaign.save();

    console.log('✅ [CAMPAIGN-ORCH] Campaign scheduled successfully!');

    return {
      success: true,
      campaign: {
        campaignId: campaign.campaignId,
        status: campaign.status,
        progress: campaign.progress,
      },
      message: `${postsToSchedule.length} posts scheduled!`,
    };
  }

  /**
   * Quick campaign - create and execute immediately
   * For when you want everything done in one call
   */
  async quickCampaign(params) {
    // Create campaign
    const createResult = await this.createAutomatedCampaign(params);

    // Process reference images for generation
    const referenceImages = [];
    if (params.productImages) {
      for (const img of params.productImages) {
        if (img.data) {
          referenceImages.push({
            data: img.data,
            mimeType: img.mimeType || 'image/jpeg',
          });
        }
      }
    }

    // Execute campaign (generate + schedule)
    const executeResult = await this.executeCampaign(
      createResult.campaign.campaignId,
      referenceImages
    );

    return {
      ...createResult,
      ...executeResult,
      message: `Campaign complete! ${executeResult.campaign.progress.scheduled} posts scheduled.`,
    };
  }

  /**
   * Get campaign status with detailed progress
   */
  async getCampaignStatus(campaignId) {
    const campaign = await Campaign.findOne({ campaignId });
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const contentJob = campaign.contentJobId
      ? await ContentJob.findOne({ jobId: campaign.contentJobId })
      : null;

    return {
      campaign: {
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        progress: campaign.progress,
        schedule: campaign.schedule,
        metrics: campaign.metrics,
      },
      contentJob: contentJob ? {
        jobId: contentJob.jobId,
        status: contentJob.status,
        progress: contentJob.progress,
        outputAssets: contentJob.outputAssets,
      } : null,
    };
  }
}

module.exports = CampaignOrchestrator;
