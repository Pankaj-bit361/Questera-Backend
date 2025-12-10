const GenerationJob = require('../models/generationJob');
const ContentEngine = require('./ContentEngine');
const ImageOrchestrator = require('./ImageOrchestrator');
const InstagramController = require('./Instagram');
const ContentJob = require('../models/contentJob');
const { v4: uuidv4 } = require('uuid');

/**
 * Live Generation Service
 * Handles recurring image generation + immediate posting
 * 
 * Flow:
 * 1. Cron finds due jobs
 * 2. For each job: Generate new image → Create viral caption → Post immediately
 * 3. Schedule next run
 */
class LiveGenerationService {
  constructor() {
    this.contentEngine = new ContentEngine();
    this.imageOrchestrator = new ImageOrchestrator();
    this.instagramController = new InstagramController();
  }

  /**
   * Create a new recurring generation job
   */
  async createJob(userId, config) {
    const {
      name,
      description,
      basePrompt,
      referenceImages = [],
      socialAccountId,
      platform = 'instagram',
      intervalMinutes = 60,
      timezone = 'UTC',
      themes = [],
      styles = ['photorealistic', 'cinematic', 'fashion'],
      modelTypes = ['female'],
      maxPosts = 100,
      endDate,
      autoPost = true,
    } = config;

    // Calculate first run time
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + intervalMinutes * 60 * 1000);

    const job = await GenerationJob.create({
      userId,
      name,
      description,
      generationConfig: {
        basePrompt,
        referenceImages: referenceImages.map(img => ({
          url: img.url || img,
          type: img.type || 'reference',
        })),
        themes: themes.length ? themes : ['lifestyle', 'professional', 'casual', 'glamour'],
        styles,
        modelTypes,
        viralOptimization: true,
      },
      postingConfig: {
        platform,
        socialAccountId,
        autoPost,
        captionStyle: 'viral',
        hashtagStrategy: 'mixed',
      },
      schedule: {
        frequency: intervalMinutes <= 60 ? 'minutes' : 'hourly',
        intervalMinutes,
        timezone,
        nextRunAt,
      },
      limits: {
        maxPosts,
        endDate: endDate ? new Date(endDate) : null,
      },
      status: 'active',
    });

    console.log(`🔄 [LIVE-GEN] Created job ${job.jobId} - runs every ${intervalMinutes} min`);
    return job;
  }

  /**
   * Process all due generation jobs (called by cron)
   */
  async processDueJobs() {
    const dueJobs = await GenerationJob.findDueJobs();
    console.log(`🔄 [LIVE-GEN] Found ${dueJobs.length} jobs due for generation`);

    const results = [];
    for (const job of dueJobs) {
      try {
        const result = await this.executeJob(job);
        results.push({ jobId: job.jobId, success: true, ...result });
      } catch (error) {
        console.error(`❌ [LIVE-GEN] Job ${job.jobId} failed:`, error);
        job.lastError = {
          message: error.message,
          occurredAt: new Date(),
          count: (job.lastError?.count || 0) + 1,
        };
        // Pause job if too many failures
        if (job.lastError.count >= 5) {
          job.status = 'failed';
        }
        await job.save();
        results.push({ jobId: job.jobId, success: false, error: error.message });
      }
    }

    return { processed: results.length, results };
  }

  /**
   * Execute a single generation job
   */
  async executeJob(job) {
    console.log(`🎨 [LIVE-GEN] Executing job: ${job.name}`);

    // Step 1: Select variation (theme, style, model)
    const variation = this.selectVariation(job);
    console.log(`🎨 [LIVE-GEN] Selected variation:`, variation);

    // Step 2: Generate enhanced prompt
    const prompt = await this.generatePrompt(job, variation);
    console.log(`📝 [LIVE-GEN] Generated prompt`);

    // Step 3: Generate image
    const imageResult = await this.generateImage(job, prompt, variation);
    console.log(`🖼️ [LIVE-GEN] Generated image: ${imageResult.url}`);

    // Step 4: Generate viral caption
    const caption = await this.generateCaption(job, variation);
    console.log(`✍️ [LIVE-GEN] Generated caption`);

    // Step 5: Post if autoPost enabled
    let postResult = null;
    if (job.postingConfig.autoPost) {
      postResult = await this.postImage(job, imageResult.url, caption);
      console.log(`📤 [LIVE-GEN] Posted to ${job.postingConfig.platform}`);
    }

    // Step 6: Update job history and schedule next run
    await this.updateJobAfterRun(job, imageResult, caption, postResult, variation);

    return {
      imageUrl: imageResult.url,
      caption: caption.fullCaption,
      posted: !!postResult?.success,
      nextRunAt: job.schedule.nextRunAt,
    };
  }

  /**
   * Select variation for this run (theme, style, model type)
   */
  selectVariation(job) {
    const config = job.generationConfig;
    const historyCount = job.limits.postsGenerated || 0;

    // Rotate through themes
    const themeIndex = historyCount % (config.themes?.length || 1);
    const theme = config.themes?.[themeIndex] || 'lifestyle';

    // Rotate through styles
    const styleIndex = Math.floor(historyCount / (config.themes?.length || 1)) % (config.styles?.length || 1);
    const style = config.styles?.[styleIndex] || 'photorealistic';

    // Rotate through model types
    const modelIndex = historyCount % (config.modelTypes?.length || 1);
    const modelType = config.modelTypes?.[modelIndex] || 'female';

    return { theme, style, modelType };
  }

  /**
   * Generate enhanced prompt based on base prompt and variation
   */
  async generatePrompt(job, variation) {
    const { basePrompt } = job.generationConfig;
    const { theme, style, modelType } = variation;

    // Build enhanced prompt with variation
    const designBrief = {
      concept: basePrompt,
      style: style,
      theme: theme,
      mood: theme,
    };

    const prompts = await this.contentEngine.generateImagePrompts(designBrief, {
      hasReferenceImage: job.generationConfig.referenceImages?.length > 0,
      referenceType: 'product',
      count: 1,
    });

    // Add model type if applicable
    let prompt = prompts[0] || basePrompt;
    if (modelType && modelType !== 'product_only') {
      const modelDesc = {
        male: 'a professional male model',
        female: 'a professional female model',
        unisex: 'a professional model',
      };
      prompt = `${prompt}, featuring ${modelDesc[modelType] || 'a model'}`;
    }

    return prompt;
  }

  /**
   * Generate the image
   */
  async generateImage(job, prompt, variation) {
    // Create a temporary content job
    const contentJob = await ContentJob.create({
      userId: job.userId,
      type: 'live_generation',
      status: 'running',
      userRequest: job.name,
      inputBrief: { concept: prompt, style: variation.style },
      prompts: [prompt],
      referenceImageUrls: job.generationConfig.referenceImages?.map(r => r.url) || [],
      progress: { total: 1, completed: 0, failed: 0 },
    });

    // Generate image
    const { results } = await this.imageOrchestrator.executeJob(
      contentJob.jobId,
      job.generationConfig.referenceImages?.map(r => ({
        url: r.url,
        mimeType: 'image/jpeg',
      })) || []
    );

    if (!results || results.length === 0) {
      throw new Error('Image generation failed');
    }

    return {
      url: results[0].url,
      prompt: results[0].promptUsed,
      jobId: contentJob.jobId,
    };
  }

  /**
   * Generate viral caption and hashtags
   */
  async generateCaption(job, variation) {
    const designBrief = {
      concept: job.generationConfig.basePrompt,
      theme: variation.theme,
      style: variation.style,
    };

    const viralContent = await this.contentEngine.generateViralPostContent(
      designBrief,
      [variation.theme],
      {
        platform: job.postingConfig.platform,
        tone: job.postingConfig.captionStyle === 'professional' ? 'professional' : 'engaging',
        goals: ['engagement', 'awareness'],
      }
    );

    return {
      caption: viralContent.shortCaption || viralContent.description,
      hashtags: viralContent.hashtagString,
      fullCaption: `${viralContent.shortCaption || viralContent.description}\n\n${viralContent.hashtagString}`,
    };
  }

  /**
   * Post image to platform
   */
  async postImage(job, imageUrl, caption) {
    if (job.postingConfig.platform === 'instagram') {
      const result = await this.instagramController.publishImage({
        body: {
          userId: job.userId,
          imageUrl: imageUrl,
          caption: caption.fullCaption,
          accountId: job.postingConfig.socialAccountId,
        },
      });

      return {
        success: result.status === 200,
        mediaId: result.json?.mediaId,
        error: result.json?.error,
      };
    }

    throw new Error(`Platform ${job.postingConfig.platform} not supported yet`);
  }

  /**
   * Update job after successful run
   */
  async updateJobAfterRun(job, imageResult, caption, postResult, variation) {
    // Add to history
    job.history.push({
      generatedAt: new Date(),
      imageUrl: imageResult.url,
      prompt: imageResult.prompt,
      theme: variation.theme,
      style: variation.style,
      status: postResult?.success ? 'posted' : 'generated',
      error: postResult?.error,
    });

    // Update counters
    job.limits.postsGenerated += 1;
    if (postResult?.success) {
      job.limits.postsPublished += 1;
    } else if (postResult?.error) {
      job.limits.postsFailed += 1;
    }

    // Update schedule
    job.schedule.lastRunAt = new Date();
    job.schedule.nextRunAt = job.calculateNextRun();

    // Check if job should complete
    if (job.limits.postsGenerated >= job.limits.maxPosts) {
      job.status = 'completed';
      console.log(`✅ [LIVE-GEN] Job ${job.jobId} completed - reached max posts`);
    }
    if (job.limits.endDate && new Date() > job.limits.endDate) {
      job.status = 'completed';
      console.log(`✅ [LIVE-GEN] Job ${job.jobId} completed - reached end date`);
    }

    await job.save();
  }

  /**
   * Pause a job
   */
  async pauseJob(userId, jobId) {
    const job = await GenerationJob.findOne({ jobId, userId });
    if (!job) throw new Error('Job not found');
    job.status = 'paused';
    await job.save();
    return job;
  }

  /**
   * Resume a paused job
   */
  async resumeJob(userId, jobId) {
    const job = await GenerationJob.findOne({ jobId, userId });
    if (!job) throw new Error('Job not found');
    if (job.status !== 'paused') throw new Error('Job is not paused');
    job.status = 'active';
    job.schedule.nextRunAt = job.calculateNextRun();
    await job.save();
    return job;
  }

  /**
   * Get all jobs for a user
   */
  async getJobs(userId, status = null) {
    const query = { userId };
    if (status) query.status = status;
    return GenerationJob.find(query).sort({ createdAt: -1 });
  }

  /**
   * Get job details with history
   */
  async getJobDetails(userId, jobId) {
    return GenerationJob.findOne({ jobId, userId });
  }
}

module.exports = LiveGenerationService;
