const { GoogleGenAI } = require('@google/genai');
const { v4: uuidv4 } = require('uuid');
const MemoryService = require('./Memory');
const ContentEngine = require('./ContentEngine');
const ContentJob = require('../models/contentJob');
const Image = require('../models/image');
const ImageMessage = require('../models/imageMessage');

/**
 * Helper to clean JSON from markdown code blocks
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
  return cleaned.trim();
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
    this.textModel = 'gemini-2.5-flash';
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
- "edit": User wants to MODIFY/EDIT an existing image (change colors, add/remove elements, adjust style)
- "remix": User wants to create a variation/remix of an existing image
- "question": User is asking a question
- "conversation": General chat or feedback

IMPORTANT: If user mentions changing, editing, modifying, swapping, replacing, or adjusting something in a PREVIOUS image (like "change the jacket", "make it blue", "add sunglasses", "remove the background"), this is an "edit" intent.

Message: "${message}"

Output JSON:
{
  "intent": "image_generation|campaign|edit|remix|question|conversation",
  "confidence": 0.0-1.0,
  "message": "Brief friendly response acknowledging the request",
  "needsPreviousImage": true/false (true if editing requires the previous generated image),
  "editDescription": "What change is being requested (only for edit intent)",
  "contentJob": {
    "generateBrief": true/false,
    "type": "single|campaign|batch",
    "count": number of images (1-10),
    "style": "suggested style if mentioned"
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
      return JSON.parse(cleanJsonResponse(text));
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

    // Build context for prompt generation
    const contextString = await this.memoryService.buildContextForLLM(userId);

    // Step 1: Generate design brief
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
}

module.exports = OrchestratorService;