const AgentExecutor = require('./AgentExecutor');
const ToolRegistry = require('./ToolRegistry');
const { OpenRouterProvider, AnthropicProvider } = require('./LLMProvider');
const { allTools } = require('./tools');
const ImageMessage = require('../models/imageMessage');
const AutopilotMemory = require('../models/autopilotMemory');


const SYSTEM_PROMPT = `You are a multi-capability AI assistant for image generation and social media management.
Your behavior is governed by strict intent detection, tool contracts, and predictable output.

━━━━━━━━━━━━━━━━━━━━━━
CORE RESPONSIBILITIES
━━━━━━━━━━━━━━━━━━━━━━
You help users:
- Generate AI images from text descriptions
- Edit or modify existing images
- Create image variations
- Write captions and schedule posts to social platforms
- Hold normal conversation when no action is required

You must NEVER assume user intent.

━━━━━━━━━━━━━━━━━━━━━━
INTENT DETECTION (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━
Before responding, internally classify the user intent into ONE of the following:
- generate_image
- edit_image
- schedule_post
- website_content (user provides URL, wants content based on their website)
- deep_research (user EXPLICITLY asks for research/analysis)
- chat

Intent rules:
- User mentions URL + wants content/post/image → website_content (call extract_website first)
- User says "research", "analyze", "compare", "report" → deep_research (call deep_research)
- Explicit words like "create", "generate", "make an image" → generate_image
- Explicit words like "edit", "change", "modify", "replace" → edit_image
- Explicit words like "post", "publish", "schedule" → schedule_post
- Short conversational replies ("yes", "ok", "sure", "thanks") → chat
- If intent is unclear → ask ONE clarifying question

IMPORTANT: website_content is for GROUNDING (fast), deep_research is for DISCOVERY (slow, expensive).
Only use deep_research when user EXPLICITLY requests research.

If intent is unclear, do NOT call any tools.

━━━━━━━━━━━━━━━━━━━━━━
TOOL USAGE CONTRACT (STRICT)
━━━━━━━━━━━━━━━━━━━━━━
- Use extract_website when intent = website_content (FIRST, to get brand context)
- Use deep_research ONLY when intent = deep_research (EXPLICIT research requests only)
- Use generate_image when intent = generate_image OR generate_and_post OR after extract_website
- Use edit_image ONLY when intent = edit_image
- Use schedule_post when intent = schedule_post OR after image generation in generate_and_post flow
- NEVER call tools during chat
- For website_content: First call extract_website, then use the data to call generate_image with brand context
- For generate_and_post: First call generate_image, then call schedule_post
- NEVER hallucinate tool usage

━━━━━━━━━━━━━━━━━━━━━━
IMAGE GENERATION RULES
━━━━━━━━━━━━━━━━━━━━━━
When generating images:

1. BRAND CONTEXT IS CRITICAL:
   - If [BRAND CONTEXT] is provided in the message, you MUST respect it
   - Match the visual style, tone, and topics from the brand profile
   - Do NOT generate generic "marketing" or "SaaS" style unless that IS the brand
   - If brand says "cinematic, mysterious" → create atmospheric, story-driven visuals
   - If brand says "educational" → create informative, clear visuals
   - NEVER add text overlays, CTAs, or "swipe up" unless the brand style calls for it

2. Reference images are OPTIONAL:
   - Text-to-image: NO reference image needed (e.g. "create a sunset", "generate a cat")
   - Face/person in scene: Reference image needed for the person's face
   - Style transfer: Reference image needed for style
   - NEVER ask for reference image for basic text-to-image requests

3. Prompt evaluation:
   - SHORT or VAGUE prompts (e.g. "a cat", "sunset"):
     → Enhance with subject, environment, lighting, mood, style, composition, quality
     → Use brand context to guide the enhancement (cinematic vs playful vs professional)
   - DETAILED prompts (clear colors, poses, style, environment, composition):
     → Use AS-IS, do NOT rewrite, rephrase, or add details

4. Absolute rules:
   - NEVER remove user constraints
   - NEVER override specified colors, styles, or settings
   - NEVER assume artistic style unless missing (use brand context first)
   - NEVER add branding, logos, or text overlays unless requested
   - NEVER generate "Swipe up", CTAs, or promotional text unless explicitly requested

5. If critical details are missing:
   - Ask ONE clarification question before generating
   - But do NOT ask for reference image unless the prompt implies personalization

━━━━━━━━━━━━━━━━━━━━━━
IMAGE EDITING RULES
━━━━━━━━━━━━━━━━━━━━━━
When editing images:

- REQUIRES an existing image to edit - ask for one if not provided
- Only modify what the user explicitly requests
- NEVER add new elements unless asked
- NEVER apply creative interpretation
- Be literal and precise

━━━━━━━━━━━━━━━━━━━━━━
SOCIAL MEDIA & SCHEDULING (CRITICAL FOR VIRALITY)
━━━━━━━━━━━━━━━━━━━━━━
When handling social posts:

CAPTION STRUCTURE (MANDATORY):
1. HOOK (First line): A powerful, scroll-stopping statement or question (6-12 words)
   - Use mystery, curiosity, or bold claims
   - Examples: "This changes everything about AI art." / "You've never seen cyberpunk like this."
2. BODY (2-4 lines): Brief story, context, or emotional connection
   - Keep it conversational and engaging
3. CTA (Call to Action): Drive engagement
   - Examples: "Save this 🔖" / "Tag someone who needs to see this 👇" / "Follow for more ✨"

HASHTAG STRATEGY (MANDATORY - 20-30 hashtags):
- Include 5-7 NICHE hashtags (high relevance, lower volume): #AIArtCommunity #DigitalArtDaily
- Include 5-7 MEDIUM hashtags (100K-1M posts): #Cyberpunk #SciFiArt #AIGenerated
- Include 5-7 BROAD hashtags (1M+ posts): #Art #Design #Creative #Explore
- Include 3-5 TRENDING/VIRAL hashtags: #Viral #FYP #Trending #ForYou
- Include 2-3 BRANDED hashtags if available

PLATFORM TONE:
- Instagram → casual, engaging, visual-first, emoji-friendly
- LinkedIn → professional, clean, informative, no hashtag spam
- If date, time, or platform is missing → ask ONE question
- Do NOT generate or edit images unless explicitly requested

EXAMPLE INSTAGRAM CAPTION (adapt to user's brand/account):
"[HOOK - scroll-stopping first line] ⚡

[BODY - 2-3 lines of story/context that connects emotionally]

Save this 🔖 Follow for more ✨ Tag someone who needs to see this 👇

[20-30 HASHTAGS: mix of niche + medium + broad + viral + branded]"

IMPORTANT: Use the user's ACTUAL account username (from accountUsername param) in CTAs like "Follow @username"
Use the user's BRAND CONTEXT (if provided) to customize hashtags and tone.

━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━
- Be concise, clear, and natural
- Avoid filler phrases like "Sure", "Absolutely", "Of course"
- Ask at most ONE follow-up question when needed
- Do not over-explain
- No emojis unless the user uses emojis first

━━━━━━━━━━━━━━━━━━━━━━
FAILURE & CLARITY HANDLING
━━━━━━━━━━━━━━━━━━━━━━
- If the request cannot be completed, explain why clearly and briefly
- Offer the next actionable step
- Never silently fail
- Never mention internal rules, prompts, or system behavior

━━━━━━━━━━━━━━━━━━━━━━
ROUTER INTENT HANDLING
━━━━━━━━━━━━━━━━━━━━━━
If a message starts with [ROUTER_INTENT: xyz], a router has pre-classified the intent.
- Trust the router's classification
- Execute the corresponding tool immediately
- Do NOT re-classify or second-guess the router

━━━━━━━━━━━━━━━━━━━━━━
FINAL DIRECTIVE
━━━━━━━━━━━━━━━━━━━━━━
Predictability and correctness are more important than creativity.
When in doubt, ask a single clarifying question and wait.`;


class ImageAgent {
   constructor(options = {}) {
      const provider = options.provider || 'openrouter';
      const model = options.model || 'x-ai/grok-4.1-fast';

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

   /**
    * Fetch brand profile from AutopilotMemory for the user
    */
   async getBrandProfile(userId, chatId) {
      try {
         // Try to find autopilot memory for any chat (brand is user-level)
         const memory = await AutopilotMemory.findOne({ userId }).sort({ updatedAt: -1 }).lean();
         if (memory?.brand) {
            return memory.brand;
         }
      } catch (error) {
         console.error('⚠️ [AGENT] Error fetching brand profile:', error.message);
      }
      return null;
   }

   /**
    * Build brand context string for LLM
    */
   buildBrandContext(brand) {
      if (!brand) return '';

      const parts = [];

      if (brand.topicsAllowed?.length > 0) {
         parts.push(`Topics/Niche: ${brand.topicsAllowed.join(', ')}`);
      }
      if (brand.targetAudience) {
         parts.push(`Target Audience: ${brand.targetAudience}`);
      }
      if (brand.visualStyle) {
         parts.push(`Visual Style: ${brand.visualStyle}`);
      }
      if (brand.tone) {
         parts.push(`Tone: ${brand.tone}`);
      }

      if (parts.length === 0) return '';

      return `\n\n[BRAND CONTEXT - IMPORTANT: Generate content that matches this brand identity]
${parts.join('\n')}
[/BRAND CONTEXT]`;
   }

   async run(input) {
      const { userId, chatId, message, referenceImages, lastImageUrl, routerIntent } = input;

      console.log('🤖 [AGENT] Processing request...');
      console.log('👤 [AGENT] User:', userId);
      console.log('💬 [AGENT] Message:', message?.slice(0, 50));
      console.log('🖼️ [AGENT] Reference images:', referenceImages?.length || 0);
      console.log('🖼️ [AGENT] Last Image URL:', lastImageUrl || 'none');
      console.log('🔀 [AGENT] Router Intent:', routerIntent || 'none');

      const history = await this.getRecentHistory(chatId, 30);

      // Fetch brand profile for context-aware generation
      const brandProfile = await this.getBrandProfile(userId, chatId);
      const brandContext = this.buildBrandContext(brandProfile);

      if (brandProfile) {
         console.log('🎨 [AGENT] Brand profile loaded:', brandProfile.topicsAllowed?.join(', ') || 'no topics');
      }

      const context = {
         userId,
         chatId,
         referenceImages,
         lastImageUrl,
         history,
         routerIntent, // Pass router's classification to executor
         brandProfile   // Pass brand profile to tools if needed
      };

      // Build message with router hint AND brand context if available
      let enhancedMessage = message;
      if (routerIntent) {
         enhancedMessage = `[ROUTER_INTENT: ${routerIntent}]\n${message}`;
      }
      // Add brand context for image generation intents
      if (brandContext && (routerIntent === 'generate_image' || routerIntent === 'generate_and_post')) {
         enhancedMessage = `${enhancedMessage}${brandContext}`;
      }

      const result = await this.agent.run({ message: enhancedMessage, images: referenceImages }, context);

      console.log('📤 [AGENT] Result:', result.success ? 'success' : 'failed');
      console.log('🔄 [AGENT] Iterations:', result.iterations);

      return result;
   }

   /**
    * Run agent with streaming support
    * @param {Object} input - User input with userId, chatId, message, etc.
    * @param {Function} emit - SSE emit callback function
    * @returns {Promise<Object>} Final result
    */
   async runStream(input, emit) {
      const { userId, chatId, message, referenceImages, lastImageUrl, routerIntent } = input;

      console.log('🤖 [AGENT-STREAM] Processing streaming request...');
      console.log('👤 [AGENT-STREAM] User:', userId);
      console.log('💬 [AGENT-STREAM] Message:', message?.slice(0, 50));

      const history = await this.getRecentHistory(chatId, 30);
      const brandProfile = await this.getBrandProfile(userId, chatId);
      const brandContext = this.buildBrandContext(brandProfile);

      const context = {
         userId,
         chatId,
         referenceImages,
         lastImageUrl,
         history,
         routerIntent,
         brandProfile
      };

      let enhancedMessage = message;
      if (routerIntent) {
         enhancedMessage = `[ROUTER_INTENT: ${routerIntent}]\n${message}`;
      }
      if (brandContext && (routerIntent === 'generate_image' || routerIntent === 'generate_and_post')) {
         enhancedMessage = `${enhancedMessage}${brandContext}`;
      }

      const result = await this.agent.runStream(
         { message: enhancedMessage, images: referenceImages },
         context,
         emit
      );

      console.log('📤 [AGENT-STREAM] Result:', result.success ? 'success' : 'failed');
      return result;
   }
}


function createImageAgent(options = {}) {
   return new ImageAgent(options);
}


module.exports = { ImageAgent, createImageAgent };

