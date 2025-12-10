const { GoogleGenAI } = require('@google/genai');
const { v4: uuidv4 } = require('uuid');
const MemoryService = require('./Memory');
const ContentEngine = require('./ContentEngine');
const ContentJob = require('../models/contentJob');
const Image = require('../models/image');
const ImageMessage = require('../models/imageMessage');

/**
 * Helper to clean JSON from markdown code blocks and extract JSON
 */
function cleanJsonResponse(text) {
  if (!text) return '{}';
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Try to extract JSON if it's wrapped in text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return cleaned;
}

/**
 * Helper to safely parse JSON with fallback
 */
function safeJsonParse(text, fallback = {}) {
  try {
    const cleaned = cleanJsonResponse(text);
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn('⚠️ JSON parse failed, using fallback:', error.message);
    return fallback;
  }
}

/**
 * Orchestrator Service
 * Main chat endpoint that understands intent, loads memory, and routes to appropriate services
 */
class OrchestratorService {
  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    this.textModel = 'gemini-2.5-flash-lite-preview-09-2025';
    this.memoryService = new MemoryService();
    this.contentEngine = new ContentEngine();
  }

  /**
   * Main chat handler - understands intent and routes accordingly
   */
  async handleChat(req) {
    const { userId, message, imageChatId, referenceImages = [], lastImageUrl } = req.body;

    if (!userId || !message) {
      return { status: 400, json: { error: 'userId and message are required' } };
    }

    try {
      console.log('🎯 [ORCHESTRATOR] Processing message for user:', userId);

      // Step 1: Load profile and memory context
      const profile = await this.memoryService.getActiveProfile(userId);
      const contextString = await this.memoryService.buildContextForLLM(userId);

      console.log('📋 [ORCHESTRATOR] Loaded profile:', profile.name);

      // Step 2: Determine intent using LLM
      const hasImages = referenceImages.length > 0 || !!lastImageUrl;
      const intent = await this.determineIntent(message, contextString, hasImages);
      console.log('🎯 [ORCHESTRATOR] Detected intent:', intent.intent);

      // Step 3: Extract and save any memories from the message
      const insights = await this.contentEngine.extractMemoriesFromMessage(message, contextString);
      if (insights.memories?.length > 0) {
        await this.memoryService.addMemoriesFromChat(userId, profile.profileId, insights.memories);
        console.log('💾 [ORCHESTRATOR] Saved', insights.memories.length, 'memories');
      }
      if (Object.keys(insights.profileUpdates || {}).some(k => insights.profileUpdates[k])) {
        await this.memoryService.updateProfileFromChat(userId, insights.profileUpdates);
        console.log('📝 [ORCHESTRATOR] Updated profile');
      }

      // Step 4: Route based on intent
      let result;
      switch (intent.intent) {
        case 'image_generation':
        case 'campaign':
          result = await this.handleImageGeneration(userId, message, intent, profile, referenceImages, imageChatId);
          break;
        case 'scheduled_campaign':
          // User wants to create images AND schedule them for auto-posting
          result = await this.handleScheduledCampaign(userId, message, intent, profile, referenceImages, imageChatId);
          break;
        case 'live_generation':
          // User wants continuous/recurring generation + auto-post
          result = await this.handleLiveGeneration(userId, message, intent, profile, referenceImages);
          break;
        case 'viral_content':
          // User wants viral content ideas, competitor analysis, trending content
          result = await this.handleViralContent(userId, message, intent, profile);
          break;
        case 'schedule':
          // User wants to schedule an existing image
          result = await this.handleSchedulePost(userId, message, intent, imageChatId, lastImageUrl);
          break;
        case 'edit':
        case 'remix':
          // For edit/remix, we need to use the previous image as reference
          result = await this.handleEdit(userId, message, intent, profile, referenceImages, imageChatId, lastImageUrl);
          break;
        case 'question':
        case 'conversation':
        default:
          result = await this.handleConversation(userId, message, intent, contextString, imageChatId);
          break;
      }

      return { status: 200, json: result };
    } catch (error) {
      console.error('❌ [ORCHESTRATOR] Error:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Determine user intent from message
   */
  async determineIntent(message, context, hasReferenceImages) {
    const systemPrompt = `You are an AI assistant that helps create visual content.
Analyze the user's message and determine their intent.

Known context about user:
${context}

Has reference images attached: ${hasReferenceImages}

Intents:
- "image_generation": User wants to create a NEW image from scratch
- "campaign": User wants multiple NEW images for a campaign/batch
- "scheduled_campaign": User wants to generate images upfront AND schedule them for auto-posting
- "live_generation": User wants CONTINUOUS/RECURRING generation - create NEW images at intervals and post them automatically
- "viral_content": User wants to find viral/trending content, analyze competitors, get content inspiration, or create viral-optimized content
- "edit": User wants to MODIFY/EDIT an existing image (change colors, add/remove elements, adjust style)
- "remix": User wants to create a variation/remix of an existing image
- "schedule": User wants to schedule an existing image for posting
- "question": User is asking a question
- "conversation": General chat or feedback

IMPORTANT:
- If user mentions "viral", "trending", "competitors", "what's working", "inspiration", "analyze @username", this is "viral_content".
- If user mentions changing/editing a PREVIOUS image, this is an "edit" intent.
- If user wants to generate images ONCE and schedule them, this is "scheduled_campaign".
- If user wants CONTINUOUS/RECURRING generation (new images created at each interval), this is "live_generation".
- If user just wants to schedule an already generated image, this is "schedule".

Message: "${message}"

Output JSON:
{
  "intent": "image_generation|campaign|scheduled_campaign|live_generation|viral_content|edit|remix|schedule|question|conversation",
  "confidence": 0.0-1.0,
  "message": "Brief friendly response acknowledging the request",
  "needsPreviousImage": true/false (true if editing requires the previous generated image),
  "editDescription": "What change is being requested (only for edit intent)",
  "contentJob": {
    "generateBrief": true/false,
    "type": "single|campaign|batch|scheduled",
    "count": number of images (1-10),
    "style": "suggested style if mentioned"
  },
  "scheduling": {
    "detected": true/false,
    "interval": "hourly|daily|weekly|custom",
    "intervalMinutes": number (e.g., 60 for hourly),
    "startTime": "ISO date string if mentioned",
    "platform": "instagram|tiktok|linkedin"
  }
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = safeJsonParse(text, {
        intent: hasReferenceImages ? 'image_generation' : 'conversation',
        confidence: 0.5,
        message: "I'll help you with that!",
        contentJob: { generateBrief: hasReferenceImages, type: 'single', count: 1 }
      });
      return parsed;
    } catch (error) {
      console.error('Error determining intent:', error);
      return {
        intent: hasReferenceImages ? 'image_generation' : 'conversation',
        confidence: 0.5,
        message: "I'll help you with that!",
        contentJob: { generateBrief: hasReferenceImages, type: 'single', count: 1 }
      };
    }
  }

  /**
   * Handle image generation requests
   */
  async handleImageGeneration(userId, message, intent, profile, referenceImages, existingChatId) {
    const count = intent.contentJob?.count || 1;
    const isCampaign = count > 1 || intent.intent === 'campaign';

    // Build context for prompt generation - only use preferences, not old conversation facts
    // This prevents previous conversation themes (like "Superman") from bleeding into new chats
    const contextString = await this.memoryService.buildContextForLLM(userId, {
      includeMemories: true,
      onlyPreferences: true
    });

    // Step 1: Generate design brief based on current message + brand preferences only
    const designBrief = await this.contentEngine.generateDesignBrief(message, {
      profileContext: contextString,
      referenceType: referenceImages.length > 0 ? 'face' : null,
    });

    // Step 2: Generate image prompts
    const prompts = await this.contentEngine.generateImagePrompts(designBrief, {
      hasReferenceImage: referenceImages.length > 0,
      referenceType: 'face',
      count: Math.min(count, 10),
    });

    // Step 3: Generate viral post content (hashtags, title, description)
    console.log('🔥 [ORCHESTRATOR] Generating viral post content...');
    const viralContent = await this.contentEngine.generateViralPostContent(designBrief, [], {
      platform: 'instagram',
      tone: profile.toneOfVoice || 'engaging',
      niche: profile.niche || '',
      goals: profile.goals || [],
    });
    console.log('📱 [ORCHESTRATOR] Viral content generated:', viralContent.title);

    // Step 4: Create content job
    const contentJob = await ContentJob.create({
      userId,
      profileId: profile.profileId,
      type: isCampaign ? 'campaign' : 'single',
      status: 'pending',
      userRequest: message,
      inputBrief: designBrief,
      prompts,
      viralContent, // Store viral content in the job
      referenceImageUrls: referenceImages.map(img => img.url).filter(Boolean),
      progress: { total: prompts.length, completed: 0, failed: 0 },
      imageChatId: existingChatId,
    });

    console.log('📦 [ORCHESTRATOR] Created content job:', contentJob.jobId);

    // Return immediately with job info (generation happens async or via separate endpoint)
    return {
      success: true,
      intent: intent.intent,
      message: intent.message,
      contentJob: {
        jobId: contentJob.jobId,
        type: contentJob.type,
        status: contentJob.status,
        prompts: prompts,
        designBrief,
        count: prompts.length,
      },
      // Viral content for the post
      viralContent: {
        title: viralContent.title,
        hook: viralContent.hook,
        description: viralContent.description,
        shortCaption: viralContent.shortCaption,
        callToAction: viralContent.callToAction,
        hashtags: viralContent.hashtags,
        hashtagString: viralContent.hashtagString,
        bestPostingTimes: viralContent.bestPostingTimes,
        viralScore: viralContent.viralScore,
        viralTips: viralContent.viralTips,
      },
      // For backward compatibility, include first prompt for immediate generation
      prompt: prompts[0],
      imageChatId: existingChatId || contentJob.imageChatId,
    };
  }

  /**
   * Handle edit/remix requests - modifies an existing image
   */
  async handleEdit(userId, message, intent, profile, referenceImages, existingChatId, lastImageUrl) {
    console.log('✏️ [ORCHESTRATOR] Handling edit request');
    console.log('📸 [ORCHESTRATOR] Last image URL:', lastImageUrl ? 'Present' : 'Missing');

    // If no lastImageUrl and no referenceImages, we need to ask user to provide the image
    if (!lastImageUrl && referenceImages.length === 0) {
      return {
        success: true,
        intent: 'edit',
        message: intent.message || "I'd love to help edit that! Please share the image you want me to modify.",
        needsImage: true,
        imageChatId: existingChatId,
      };
    }

    // Build edit prompt that describes the modification
    const editDescription = intent.editDescription || message;
    const editPrompt = await this.contentEngine.generateEditPrompt(message, editDescription);

    console.log('✏️ [ORCHESTRATOR] Edit prompt:', editPrompt);

    return {
      success: true,
      intent: 'edit',
      message: intent.message || "Let me make that change for you!",
      prompt: editPrompt,
      editDescription: editDescription,
      useLastImage: true,
      lastImageUrl: lastImageUrl,
      referenceImages: referenceImages,
      imageChatId: existingChatId,
    };
  }

  /**
   * Handle remix requests (legacy - now uses handleEdit)
   */
  async handleRemix(userId, message, intent, profile, referenceImages, existingChatId) {
    return this.handleEdit(userId, message, intent, profile, referenceImages, existingChatId, null);
  }

  /**
   * Handle conversation/question requests
   */
  async handleConversation(userId, message, intent, contextString, existingChatId) {
    const systemPrompt = `You are a helpful AI creative assistant that helps users create amazing visual content.
You can generate images, create campaigns, and help with social media content.

User context:
${contextString}

Respond helpfully to the user's message. If they seem to want an image, guide them to describe what they want.
Keep responses concise and friendly.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser: ${message}` }] }
        ],
        generationConfig: { temperature: 0.7 },
      });

      const aiMessage = response.candidates?.[0]?.content?.parts?.[0]?.text || intent.message;

      // Save conversation to chat if we have a chatId
      if (existingChatId) {
        await ImageMessage.create({
          role: 'user',
          userId,
          content: message,
          imageChatId: existingChatId,
          messageId: 'm-' + uuidv4(),
        });
        await ImageMessage.create({
          role: 'assistant',
          userId,
          content: aiMessage,
          imageChatId: existingChatId,
          messageId: 'm-' + uuidv4(),
        });
      }

      return {
        success: true,
        intent: 'conversation',
        message: aiMessage,
        imageChatId: existingChatId,
      };
    } catch (error) {
      console.error('Error in conversation:', error);
      return {
        success: true,
        intent: 'conversation',
        message: intent.message || "I'm here to help! What would you like to create?",
        imageChatId: existingChatId,
      };
    }
  }

  /**
   * Get content job status
   */
  async getJobStatus(jobId) {
    const job = await ContentJob.findOne({ jobId });
    if (!job) {
      return { status: 404, json: { error: 'Job not found' } };
    }
    return { status: 200, json: job };
  }

  /**
   * Update content job with generated outputs
   */
  async updateJobWithOutputs(jobId, outputs) {
    const job = await ContentJob.findOne({ jobId });
    if (!job) {
      return { status: 404, json: { error: 'Job not found' } };
    }

    job.outputAssets.push(...outputs);
    job.progress.completed += outputs.length;

    if (job.progress.completed >= job.progress.total) {
      job.status = 'completed';
    } else {
      job.status = 'running';
    }

    await job.save();
    return { status: 200, json: job };
  }

  /**
   * Handle scheduled campaign - create images AND schedule for auto-posting
   */
  async handleScheduledCampaign(userId, message, intent, profile, referenceImages, existingChatId) {
    console.log('📅 [ORCHESTRATOR] Handling scheduled campaign request');

    const CampaignOrchestrator = require('./CampaignOrchestrator');
    const SocialAccount = require('../models/socialAccount');
    const Instagram = require('../models/instagram');
    const campaignOrchestrator = new CampaignOrchestrator();

    // Get user's connected Instagram account
    let socialAccount = await SocialAccount.findOne({ userId, platform: 'instagram', isActive: true });

    // Fallback to legacy Instagram model if no SocialAccount
    if (!socialAccount) {
      const instagram = await Instagram.findOne({ userId, isConnected: true });
      if (instagram) {
        // Create a SocialAccount from legacy data
        socialAccount = await SocialAccount.create({
          userId,
          platform: 'instagram',
          platformAccountId: instagram.instagramBusinessAccountId,
          username: instagram.instagramUsername,
          displayName: instagram.instagramName,
          profilePictureUrl: instagram.profilePictureUrl,
          accessToken: instagram.accessToken,
          isActive: true,
        });
      }
    }

    if (!socialAccount) {
      return {
        type: 'message',
        message: "I'd love to help you schedule posts, but you haven't connected your Instagram account yet! Please connect your Instagram first, then we can set up automatic posting.",
        action: 'connect_instagram',
      };
    }

    // Parse scheduling info from intent
    const scheduling = intent.scheduling || {};
    const intervalMinutes = scheduling.intervalMinutes || 60;
    const count = intent.contentJob?.count || 3;

    // Create campaign
    const campaignResult = await campaignOrchestrator.createAutomatedCampaign({
      userId,
      name: `Auto Campaign - ${new Date().toLocaleDateString()}`,
      description: message,
      socialAccountId: socialAccount.accountId,
      productImages: referenceImages.map(img => ({ data: img.data, mimeType: img.mimeType })),
      modelTypes: ['female'], // Default, can be enhanced
      postsPerModel: count,
      schedule: {
        startDate: scheduling.startTime || new Date(),
        intervalMinutes,
        timezone: profile.timezone || 'UTC',
      },
      viralSettings: {
        tone: profile.brandVoice || 'engaging',
        niche: profile.niche || '',
      },
      userRequest: message,
    });

    // Store campaign reference in chat
    if (existingChatId) {
      const imageChat = await Image.findOne({ imageChatId: existingChatId });
      if (imageChat) {
        imageChat.campaignId = campaignResult.campaign.campaignId;
        await imageChat.save();
      }
    }

    return {
      type: 'campaign_created',
      message: intent.message || `Great! I'm creating a campaign with ${count} images that will be posted every ${intervalMinutes} minutes to your Instagram (@${socialAccount.username}). I'll start generating the images now!`,
      campaign: campaignResult.campaign,
      nextStep: 'Generating images... This may take a few minutes.',
    };
  }

  /**
   * Handle scheduling an existing image for posting
   */
  async handleSchedulePost(userId, message, intent, existingChatId, lastImageUrl) {
    console.log('📅 [ORCHESTRATOR] Handling schedule post request');

    const SchedulerController = require('./Scheduler');
    const Instagram = require('../models/instagram');
    const schedulerController = new SchedulerController();

    if (!lastImageUrl) {
      return {
        type: 'message',
        message: "I don't see an image to schedule. Please generate or upload an image first, then ask me to schedule it!",
      };
    }

    // Get user's Instagram account
    const instagram = await Instagram.findOne({ userId, isConnected: true });
    if (!instagram) {
      return {
        type: 'message',
        message: "You haven't connected your Instagram account yet. Please connect it first to schedule posts!",
        action: 'connect_instagram',
      };
    }

    // Parse scheduling time from intent
    const scheduling = intent.scheduling || {};
    let scheduledAt = new Date();

    if (scheduling.startTime) {
      scheduledAt = new Date(scheduling.startTime);
    } else {
      // Default to 1 hour from now
      scheduledAt.setHours(scheduledAt.getHours() + 1);
    }

    // Create scheduled post
    const result = await schedulerController.createScheduledPost({
      body: {
        userId,
        imageUrl: lastImageUrl,
        caption: '', // Will be generated
        hashtags: '',
        platform: 'instagram',
        accountId: instagram.instagramBusinessAccountId,
        scheduledAt: scheduledAt.toISOString(),
        imageChatId: existingChatId,
      },
    });

    if (result.status === 200) {
      return {
        type: 'scheduled',
        message: `Done! I've scheduled your image to be posted on ${scheduledAt.toLocaleString()}. You can view and manage your scheduled posts in the calendar.`,
        post: result.json.post,
      };
    } else {
      return {
        type: 'error',
        message: `Sorry, I couldn't schedule the post: ${result.json.error}`,
      };
    }
  }

  /**
   * Handle live generation - continuous/recurring generation + auto-post
   * Creates new images at scheduled intervals
   */
  async handleLiveGeneration(userId, message, intent, profile, referenceImages) {
    console.log('🔄 [ORCHESTRATOR] Handling live generation request');

    const LiveGenerationService = require('./LiveGenerationService');
    const Instagram = require('../models/instagram');
    const liveGenService = new LiveGenerationService();

    // Get user's connected Instagram account
    const instagram = await Instagram.findOne({ userId, isConnected: true });
    if (!instagram) {
      return {
        type: 'message',
        message: "I'd love to help you set up continuous content generation, but you haven't connected your Instagram account yet! Please connect your Instagram first.",
        action: 'connect_instagram',
      };
    }

    // Parse scheduling info from intent
    const scheduling = intent.scheduling || {};
    const intervalMinutes = scheduling.intervalMinutes || 60;

    // Create live generation job
    const job = await liveGenService.createJob(userId, {
      name: `Live Content - ${new Date().toLocaleDateString()}`,
      description: message,
      basePrompt: message, // Use user's message as base prompt
      socialAccountId: instagram.instagramBusinessAccountId,
      platform: 'instagram',
      intervalMinutes,
      themes: ['lifestyle', 'professional', 'casual', 'glamour'],
      styles: ['photorealistic', 'cinematic', 'fashion editorial'],
      modelTypes: ['female'],
      maxPosts: 100,
      autoPost: true,
      referenceImages: referenceImages.map(img => ({
        url: img.url || '',
        type: 'product',
      })),
    });

    const intervalText = intervalMinutes < 60
      ? `${intervalMinutes} minutes`
      : intervalMinutes === 60
        ? 'hour'
        : `${Math.round(intervalMinutes / 60)} hours`;

    return {
      type: 'live_generation_started',
      message: intent.message || `I've set up continuous content generation for you! Every ${intervalText}, I'll create a fresh new image and post it automatically to your Instagram (@${instagram.instagramUsername}). The first post will go out at ${job.schedule.nextRunAt.toLocaleString()}. You can pause or stop this anytime!`,
      job: {
        jobId: job.jobId,
        name: job.name,
        intervalMinutes: job.schedule.intervalMinutes,
        nextRunAt: job.schedule.nextRunAt,
        maxPosts: job.limits.maxPosts,
      },
      actions: ['pause', 'stop', 'view_status'],
    };
  }

  /**
   * Handle viral content requests - trending content, competitor analysis, viral ideas
   */
  async handleViralContent(userId, message, intent, profile) {
    console.log('🔥 [ORCHESTRATOR] Handling viral content request');

    const ViralContentService = require('./ViralContentService');
    const viralService = new ViralContentService();

    // Detect what type of viral content request this is
    const lowerMessage = message.toLowerCase();

    // Check for competitor analysis (@username)
    const competitorMatch = message.match(/@(\w+)/);
    if (competitorMatch) {
      const handle = competitorMatch[1];
      const analysis = await viralService.analyzeCompetitor(handle, 'instagram');

      return {
        type: 'competitor_analysis',
        message: intent.message || `Here's my analysis of @${handle}'s content strategy! I've identified their content pillars, visual style, posting patterns, and generated some content ideas inspired by their success.`,
        analysis,
        actions: ['generate_similar', 'save_insights'],
      };
    }

    // Check for trending/viral content request
    if (lowerMessage.includes('trend') || lowerMessage.includes('viral') || lowerMessage.includes('what\'s working')) {
      const niche = profile?.industry || 'fashion';
      const trends = await viralService.findTrendingContent(niche, 'instagram', 5);

      return {
        type: 'trending_content',
        message: intent.message || `Here are the top trending content ideas in ${niche} right now! Each includes why it's going viral and how you can create similar content.`,
        trends: trends.trends,
        actions: ['generate_from_trend', 'save_trends'],
      };
    }

    // Default: Generate viral ideas based on profile
    const niche = profile?.industry || 'general';
    const ideas = await viralService.generateViralIdeas(userId, {
      niche,
      platform: 'instagram',
      brandDescription: profile?.brandDescription || '',
      targetAudience: profile?.targetAudience || '',
      count: 5,
    });

    return {
      type: 'viral_ideas',
      message: intent.message || `I've generated 5 viral content ideas tailored to your brand! Each one is designed to maximize engagement and shares. Want me to create any of these?`,
      ideas: ideas.ideas,
      trends: ideas.trends,
      actions: ['create_content', 'schedule_all', 'save_ideas'],
    };
  }
}

module.exports = OrchestratorService;