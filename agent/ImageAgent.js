const AgentExecutor = require('./AgentExecutor');
const ToolRegistry = require('./ToolRegistry');
const { OpenRouterProvider, AnthropicProvider } = require('./LLMProvider');
const { allTools } = require('./tools');
const ImageMessage = require('../models/imageMessage');


const SYSTEM_PROMPT = `You are a helpful AI assistant for image generation and social media management.

You help users:
- Generate AI images from text descriptions
- Edit and modify existing images
- Schedule posts to Instagram
- Create image variations

Guidelines:
- Be concise and helpful
- For image generation prompts:
  * If the user's prompt is SHORT or VAGUE (like "a cat", "sunset"), enhance it with details
  * If the user's prompt is ALREADY DETAILED (50+ words with specific descriptions), use it AS-IS - don't modify it
  * Detailed prompts with specific colors, poses, styling, composition should be passed through unchanged
- When editing, clearly describe what changes to make
- If user just wants to chat or gives a short response like "yes", "ok", "thanks", use the reply tool
- IMPORTANT: Short responses like "yes", "ok", "sure", "thanks" are conversational - use the reply tool
- Only use generate_image if user explicitly asks to CREATE or GENERATE a new image
- Only use edit_image if user explicitly asks to EDIT, CHANGE, or MODIFY an existing image
- Only use schedule_post if user explicitly asks to POST, PUBLISH, or SCHEDULE
- When in doubt about user intent, use reply tool to ask for clarification`;


class ImageAgent {
   constructor(options = {}) {
      const provider = options.provider || 'openrouter';
      const model = options.model || 'google/gemini-2.5-flash-preview-09-2025';

      let llm;
      if (provider === 'anthropic') {
         llm = new AnthropicProvider({ model });
      } else {
         llm = new OpenRouterProvider({ model });
      }

      const registry = new ToolRegistry();
      registry.registerMany(allTools);

      this.agent = new AgentExecutor({
         llm,
         tools: registry,
         systemPrompt: options.systemPrompt || SYSTEM_PROMPT,
         maxIterations: options.maxIterations || 3,
         onToolCall: (name, params) => {
            console.log(`🔧 [AGENT] Tool call: ${name}`, JSON.stringify(params).slice(0, 100));
         },
         onToolResult: (name, result) => {
            console.log(`✅ [AGENT] Tool result: ${name}`, result.success ? 'success' : 'failed');
         }
      });
   }

   async getRecentHistory(chatId, limit = 15) {
      if (!chatId) return [];

      try {
         const messages = await ImageMessage.find({ imageChatId: chatId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

         return messages.reverse().map(msg => ({
            role: msg.role,
            content: msg.content || '',
            imageUrl: msg.imageUrl
         }));
      } catch (error) {
         console.error('⚠️ [AGENT] Error fetching history:', error.message);
         return [];
      }
   }

   async run(input) {
      const { userId, chatId, message, referenceImages, lastImageUrl } = input;

      console.log('🤖 [AGENT] Processing request...');
      console.log('👤 [AGENT] User:', userId);
      console.log('💬 [AGENT] Message:', message?.slice(0, 50));
      console.log('🖼️ [AGENT] Reference images:', referenceImages?.length || 0);
      console.log('🖼️ [AGENT] Last Image URL:', lastImageUrl || 'none');

      const history = await this.getRecentHistory(chatId, 30);

      const context = {
         userId,
         chatId,
         referenceImages,
         lastImageUrl,
         history
      };

      const result = await this.agent.run({ message, images: referenceImages }, context);

      console.log('📤 [AGENT] Result:', result.success ? 'success' : 'failed');
      console.log('🔄 [AGENT] Iterations:', result.iterations);

      return result;
   }
}


function createImageAgent(options = {}) {
   return new ImageAgent(options);
}


module.exports = { ImageAgent, createImageAgent };

