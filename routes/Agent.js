const express = require('express');
const router = express.Router();
const { createImageAgent } = require('../agent');
const RouterAgent = require('../agent/RouterAgent');
const PromptValidator = require('../agent/PromptValidator');
const { FailureHandler } = require('../agent/FailureResponses');
const { PlatformDefaults } = require('../agent/PlatformDefaults');
const { Telemetry } = require('../agent/Telemetry');
const ImageMessage = require('../models/imageMessage');
const Image = require('../models/image');
const { v4: uuidv4 } = require('uuid');


// Lazy initialize agents to avoid startup failures if API key is missing
let agent = null;
let routerAgent = null;

function getAgent() {
   if (!agent) {
      if (!process.env.OPENROUTER_API_KEY) {
         console.warn('⚠️ [AGENT] OPENROUTER_API_KEY not set - agent disabled');
         return null;
      }
      agent = createImageAgent();
   }
   return agent;
}

function getRouterAgent() {
   if (!routerAgent) {
      if (!process.env.OPENROUTER_API_KEY) {
         return null;
      }
      routerAgent = new RouterAgent();
   }
   return routerAgent;
}

// Helper to save a message and link it to the Image document
async function saveMessage(chatId, userId, role, content, images = []) {
   const msgData = {
      messageId: `msg-${uuidv4()}`,
      imageChatId: chatId,
      role,
      content,
      userId
   };

   // Add images if provided
   if (images && images.length > 0) {
      msgData.imageUrl = images[0]; // Primary image
      msgData.referenceImages = images; // All images
   }

   const msg = await ImageMessage.create(msgData);

   // Update Image document - create if doesn't exist
   const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
   await Image.findOneAndUpdate(
      { imageChatId: chatId },
      {
         $push: { messages: msg._id },
         $setOnInsert: { userId, imageChatId: chatId, name: contentStr.slice(0, 50) }
      },
      { upsert: true, new: true }
   );

   return msg;
}


router.post('/', async (req, res) => {
   try {
      const { userId, message, imageChatId, referenceImages = [], lastImageUrl } = req.body;

      if (!userId) {
         return res.status(400).json({ error: 'userId is required' });
      }

      if (!message) {
         return res.status(400).json({ error: 'message is required' });
      }

      console.log('🤖 [AGENT ROUTE] Request received');
      console.log('👤 [AGENT ROUTE] User:', userId);
      console.log('💬 [AGENT ROUTE] Chat ID:', imageChatId || 'new');
      console.log('🖼️ [AGENT ROUTE] Last Image URL:', lastImageUrl || 'none');
      console.log('💬 [AGENT ROUTE] Message:', message);

      // Get agents (lazy init)
      const agentInstance = getAgent();
      const routerInstance = getRouterAgent();
      if (!agentInstance) {
         return res.status(503).json({ error: 'Agent service unavailable - OPENROUTER_API_KEY not configured' });
      }

      // Generate chatId if not provided
      let chatId = imageChatId;
      if (!chatId) {
         chatId = `chat-${uuidv4()}`;
      }

      // Get chat history for context
      const history = await ImageMessage.find({ imageChatId: chatId })
         .sort({ createdAt: 1 })
         .limit(10)
         .lean();

      // STEP 1: Router Agent classifies intent first
      let routerResult = null;
      if (routerInstance) {
         routerResult = await routerInstance.classify(message, { history, lastImageUrl, referenceImages });
         console.log('🔀 [AGENT ROUTE] Router result:', JSON.stringify(routerResult));

         // Log intent classification
         Telemetry.logIntent(userId, message, routerResult.intent, routerResult.confidence, routerResult.needsClarification);

         // If router needs clarification, respond early without calling main agent
         if (routerResult.needsClarification) {
            const clarificationMsg = routerInstance.getClarificationQuestion(routerResult.intent, routerResult.reason);
            await saveMessage(chatId, userId, 'user', message);
            await saveMessage(chatId, userId, 'assistant', clarificationMsg);

            // Log clarification event
            Telemetry.logClarification(userId, message, clarificationMsg, routerResult.intent);

            return res.status(200).json({
               message: clarificationMsg,
               imageChatId: chatId,
               intent: 'clarification',
               routerIntent: routerResult.intent,
               confidence: routerResult.confidence
            });
         }
      }

      // STEP 2: Main agent processes the request (router already validated intent)
      const result = await agentInstance.run({
         userId,
         chatId,
         message,
         referenceImages: referenceImages || [],
         lastImageUrl,
         routerIntent: routerResult?.intent // Pass router's classification to main agent
      });

      if (!result.success) {
         const errorMsg = result.message || 'Something went wrong';
         await saveMessage(chatId, userId, 'assistant', errorMsg);

         // Log failure with FailureHandler
         const failure = FailureHandler.fromError({ message: errorMsg });
         Telemetry.logFailure(userId, failure.code, failure.code, failure.action, message);

         return res.status(200).json({ message: errorMsg, imageChatId: chatId, intent: 'error' });
      }

      // Handle finalAnswer (conversation) - when agent responds without using a tool
      if (result.message && !result.result) {
         await saveMessage(chatId, userId, 'user', message);
         await saveMessage(chatId, userId, 'assistant', result.message);
         return res.status(200).json({ message: result.message, imageChatId: chatId, intent: 'conversation' });
      }

      const toolResult = result.result || {};

      // Extract cognitive layer from result (thinking steps, decisions, suggestions)
      const cognitive = result.cognitive || toolResult.cognitive || null;

      // Image generation - messages already saved by imageController
      if (toolResult.imageUrl) {
         return res.status(200).json({
            message: 'Image generated successfully!',
            imageUrl: toolResult.imageUrl,
            images: toolResult.images,
            imageChatId: toolResult.imageChatId || chatId,
            creditsRemaining: toolResult.creditsRemaining,
            intent: 'image_generation',
            // Cognitive Layer - makes the agent feel smart
            cognitive
         });
      }

      // Conversation reply - save user + assistant message, then return
      if (toolResult.type === 'text' && toolResult.message) {
         await saveMessage(chatId, userId, 'user', message); // Save user message for non-image tools
         await saveMessage(chatId, userId, 'assistant', toolResult.message);
         return res.status(200).json({ message: toolResult.message, imageChatId: chatId, intent: 'conversation', cognitive });
      }

      // Schedule post - save user + assistant message
      if (toolResult.postId) {
         await saveMessage(chatId, userId, 'user', message); // Save user message for non-image tools
         const scheduleMsg = toolResult.message || `Post scheduled for ${toolResult.scheduledAt}`;
         await saveMessage(chatId, userId, 'assistant', scheduleMsg);
         return res.status(200).json({
            message: scheduleMsg,
            postId: toolResult.postId,
            imageChatId: chatId,
            intent: 'schedule',
            cognitive
         });
      }

      // Accounts list - save user + assistant message
      if (toolResult.accounts) {
         await saveMessage(chatId, userId, 'user', message); // Save user message for non-image tools
         const accountsMsg = toolResult.message || `Found ${toolResult.count} account(s)`;
         await saveMessage(chatId, userId, 'assistant', accountsMsg);
         return res.status(200).json({ message: accountsMsg, accounts: toolResult.accounts, imageChatId: chatId, intent: 'accounts', cognitive });
      }

      // Variations - messages already saved by createVariations tool
      if (toolResult.variations && toolResult.variations.length > 0) {
         const variationsMsg = toolResult.message || `Created ${toolResult.count} variations`;
         const variationImages = toolResult.variations.map(v => v.imageUrl);
         return res.status(200).json({
            message: variationsMsg,
            variations: toolResult.variations,
            images: variationImages,
            imageChatId: toolResult.imageChatId || chatId,
            creditsRemaining: toolResult.creditsRemaining,
            intent: 'variations',
            cognitive
         });
      }

      // Fallback - save user + assistant message
      await saveMessage(chatId, userId, 'user', message);
      const fallbackMsg = toolResult.message || 'Done';
      await saveMessage(chatId, userId, 'assistant', fallbackMsg);
      return res.status(200).json({ message: fallbackMsg, imageChatId: chatId, intent: result.toolUsed || 'unknown', cognitive });

   } catch (error) {
      console.error('❌ [AGENT ROUTE] Error:', error.message);

      // Log system failure
      const { userId } = req.body;
      const failure = FailureHandler.fromError(error);
      Telemetry.logFailure(userId, 'SYSTEM_ERROR', failure.code, failure.action, error.message);

      res.status(500).json({ error: failure.message });
   }
});


// ━━━━━━━━━━━━━━━━━━━━━━
// FEEDBACK ENDPOINT
// ━━━━━━━━━━━━━━━━━━━━━━
router.post('/feedback', async (req, res) => {
   try {
      const { userId, chatId, messageId, rating, comment } = req.body;

      if (!userId || !rating) {
         return res.status(400).json({ error: 'userId and rating are required' });
      }

      await Telemetry.logFeedback(userId, chatId, messageId, rating, comment);
      await Telemetry.flush(); // Ensure feedback is saved immediately

      res.status(200).json({ success: true, message: 'Feedback recorded' });
   } catch (error) {
      console.error('❌ [FEEDBACK] Error:', error.message);
      res.status(500).json({ error: 'Failed to record feedback' });
   }
});


// ━━━━━━━━━━━━━━━━━━━━━━
// TELEMETRY STATS ENDPOINT
// ━━━━━━━━━━━━━━━━━━━━━━
router.get('/stats', async (req, res) => {
   try {
      const stats = await Telemetry.getWeeklyStats();
      res.status(200).json(stats);
   } catch (error) {
      console.error('❌ [STATS] Error:', error.message);
      res.status(500).json({ error: 'Failed to get stats' });
   }
});


// ━━━━━━━━━━━━━━━━━━━━━━
// PLATFORM DEFAULTS ENDPOINT
// ━━━━━━━━━━━━━━━━━━━━━━
router.get('/platforms', async (req, res) => {
   try {
      const platforms = PlatformDefaults.getAllPlatforms();
      const defaults = {};
      for (const p of platforms) {
         defaults[p] = PlatformDefaults.get(p);
      }
      res.status(200).json(defaults);
   } catch (error) {
      console.error('❌ [PLATFORMS] Error:', error.message);
      res.status(500).json({ error: 'Failed to get platform defaults' });
   }
});


module.exports = router;

