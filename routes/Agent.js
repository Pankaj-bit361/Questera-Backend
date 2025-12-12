const express = require('express');
const router = express.Router();
const { createImageAgent } = require('../agent');
const ImageMessage = require('../models/imageMessage');
const Image = require('../models/image');
const { v4: uuidv4 } = require('uuid');


const agent = createImageAgent();

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

      // Generate chatId if not provided
      let chatId = imageChatId;
      if (!chatId) {
         chatId = `chat-${uuidv4()}`;
      }

      // NOTE: Don't save user message here - the image generation tools save their own messages
      // Only save user message for non-image tools (conversation, schedule, etc.)

      const result = await agent.run({
         userId,
         chatId,
         message,
         referenceImages: referenceImages || [],
         lastImageUrl
      });

      if (!result.success) {
         const errorMsg = result.message || 'Something went wrong';
         await saveMessage(chatId, userId, 'assistant', errorMsg);
         return res.status(200).json({ message: errorMsg, imageChatId: chatId, intent: 'error' });
      }

      const toolResult = result.result || {};

      // Image generation - messages already saved by imageController
      if (toolResult.imageUrl) {
         return res.status(200).json({
            message: 'Image generated successfully!',
            imageUrl: toolResult.imageUrl,
            images: toolResult.images,
            imageChatId: toolResult.imageChatId || chatId,
            creditsRemaining: toolResult.creditsRemaining,
            intent: 'image_generation'
         });
      }

      // Conversation reply - save user + assistant message, then return
      if (toolResult.type === 'text' && toolResult.message) {
         await saveMessage(chatId, userId, 'user', message); // Save user message for non-image tools
         await saveMessage(chatId, userId, 'assistant', toolResult.message);
         return res.status(200).json({ message: toolResult.message, imageChatId: chatId, intent: 'conversation' });
      }

      // Schedule post - save user + assistant message
      if (toolResult.postId) {
         await saveMessage(chatId, userId, 'user', message); // Save user message for non-image tools
         const scheduleMsg = toolResult.message || `Post scheduled for ${toolResult.scheduledAt}`;
         await saveMessage(chatId, userId, 'assistant', scheduleMsg);
         return res.status(200).json({ message: scheduleMsg, postId: toolResult.postId, imageChatId: chatId, intent: 'schedule' });
      }

      // Accounts list - save user + assistant message
      if (toolResult.accounts) {
         await saveMessage(chatId, userId, 'user', message); // Save user message for non-image tools
         const accountsMsg = toolResult.message || `Found ${toolResult.count} account(s)`;
         await saveMessage(chatId, userId, 'assistant', accountsMsg);
         return res.status(200).json({ message: accountsMsg, accounts: toolResult.accounts, imageChatId: chatId, intent: 'accounts' });
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
            intent: 'variations'
         });
      }

      // Fallback - save user + assistant message
      await saveMessage(chatId, userId, 'user', message);
      const fallbackMsg = toolResult.message || 'Done';
      await saveMessage(chatId, userId, 'assistant', fallbackMsg);
      return res.status(200).json({ message: fallbackMsg, imageChatId: chatId, intent: result.toolUsed || 'unknown' });

   } catch (error) {
      console.error('❌ [AGENT ROUTE] Error:', error.message);
      res.status(500).json({ error: error.message });
   }
});


module.exports = router;

