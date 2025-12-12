const { OpenRouterProvider } = require('./LLMProvider');

const ROUTER_SYSTEM_PROMPT = `You are a Router Agent.

Your ONLY responsibility is to classify the user's intent.
You do NOT generate content, images, captions, or schedules.
You do NOT call tools.
You ONLY return a JSON object.

━━━━━━━━━━━━━━━━━━━━━━
INTENTS (EXACT VALUES)
━━━━━━━━━━━━━━━━━━━━━━
- generate_image
- edit_image
- schedule_post
- generate_and_post (compound: create image + post to social media)
- website_content (user provides a URL and wants content based on it)
- deep_research (user EXPLICITLY asks for research/analysis/comparison)
- chat

━━━━━━━━━━━━━━━━━━━━━━
CLASSIFICATION RULES (PRIORITY ORDER)
━━━━━━━━━━━━━━━━━━━━━━
1. WEBSITE CONTENT: If user mentions a URL/website AND wants content/post/image for it → website_content
   Examples: "create a post for questera.ai", "make an image for my website example.com", "Instagram caption for mysite.io"

2. DEEP RESEARCH (EXPLICIT ONLY): ONLY if user says: research, analyze, compare, report, competitive analysis → deep_research
   Examples: "research my competitors", "analyze the market for AI tools", "write a report on trends"
   ⚠️ Do NOT use for simple content requests - only explicit research requests

3. COMPOUND ACTIONS: If user says BOTH (create/generate/make image) AND (post/publish/schedule/instagram) → generate_and_post
   Examples: "create an image and post it", "make a superman image and post to instagram"

4. If user ONLY says: create, generate, make an image (NO posting mentioned) → generate_image

5. If user ONLY says: edit, change, modify, replace → edit_image

6. If user ONLY says: post, publish, schedule (image already exists) → schedule_post

7. Short conversational replies ("yes", "ok", "sure", "thanks", "hey", "hello", "hi") → chat

8. If intent is unclear → needs_clarification = true

- NEVER ignore the "post" part of a compound request
- NEVER guess intent
- website_content is for GROUNDING (fast), deep_research is for DISCOVERY (slow)

━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (JSON ONLY)
━━━━━━━━━━━━━━━━━━━━━━
Return ONLY this JSON. No text. No markdown.

{
  "intent": "generate_image | edit_image | schedule_post | generate_and_post | website_content | deep_research | chat",
  "confidence": 0.0,
  "needs_clarification": false,
  "extracted_url": "only if URL detected, else null",
  "reason": "short explanation"
}`;

const CONFIDENCE_THRESHOLD = 0.8;

class RouterAgent {
   constructor(options = {}) {
      this.llm = new OpenRouterProvider({
         model: options.model || 'google/gemini-2.5-flash-lite-preview-09-2025'
      });
   }

   async classify(message, context = {}) {
      console.log('🔀 [ROUTER] Classifying intent for:', message?.slice(0, 50));

      const messages = [
         { role: 'system', content: ROUTER_SYSTEM_PROMPT }
      ];

      // Add recent history for context (last 5 messages)
      if (context.history && Array.isArray(context.history)) {
         const recentHistory = context.history.slice(-5);
         for (const msg of recentHistory) {
            messages.push({
               role: msg.role === 'assistant' ? 'assistant' : 'user',
               content: msg.imageUrl ? '[Image was shared]' : msg.content
            });
         }
      }

      messages.push({ role: 'user', content: message });

      const result = await this.llm.chatJSON(messages, {
         fallback: { intent: 'chat', confidence: 0.5, needs_clarification: false, reason: 'fallback' }
      });

      console.log('🔀 [ROUTER] Classification result:', JSON.stringify(result));

      // Validate intent
      const validIntents = ['generate_image', 'edit_image', 'schedule_post', 'generate_and_post', 'website_content', 'deep_research', 'chat'];
      if (!validIntents.includes(result.intent)) {
         console.warn('⚠️ [ROUTER] Invalid intent, defaulting to chat:', result.intent);
         result.intent = 'chat';
      }

      // Apply confidence gate
      if (result.confidence < CONFIDENCE_THRESHOLD && !result.needs_clarification) {
         console.log('⚠️ [ROUTER] Low confidence, flagging for clarification:', result.confidence);
         result.needs_clarification = true;
      }

      return {
         intent: result.intent,
         confidence: result.confidence || 0.5,
         needsClarification: result.needs_clarification || false,
         reason: result.reason || '',
         extractedUrl: result.extracted_url || null
      };
   }

   getClarificationQuestion(intent) {
      const questions = {
         generate_image: "What kind of image would you like me to create?",
         edit_image: "Please upload or specify which image you'd like me to edit.",
         schedule_post: "Which platform and when would you like to schedule this post?",
         website_content: "What's the website URL you'd like me to create content for?",
         deep_research: "What topic would you like me to research?",
         chat: "Could you tell me more about what you need help with?"
      };
      return questions[intent] || questions.chat;
   }
}

module.exports = RouterAgent;

