const { OpenRouterProvider } = require('./LLMProvider');

const ROUTER_SYSTEM_PROMPT = `You are a Router Agent.

Your ONLY responsibility is to classify the user's intent.
You do NOT generate content, images, captions, or schedules.
You do NOT call tools.
You ONLY return a JSON object.

CRITICAL: Be ACTION-ORIENTED. When user wants something done, classify appropriately and DO NOT ask for clarification.

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
INTENT EXAMPLES (LEARN FROM THESE)
━━━━━━━━━━━━━━━━━━━━━━
<example>
User: "create a sunset image"
Classification: { "intent": "generate_image", "confidence": 0.95, "needs_clarification": false, "reason": "Explicit create keyword, no posting" }
</example>

<example>
User: "make a superman image and post it to instagram"
Classification: { "intent": "generate_and_post", "confidence": 0.95, "needs_clarification": false, "reason": "Both create AND post mentioned" }
</example>

<example>
User: "create a post for questera.ai"
Classification: { "intent": "website_content", "confidence": 0.9, "extracted_url": "questera.ai", "reason": "URL + content request" }
</example>

<example>
User: "research my competitors in AI tools"
Classification: { "intent": "deep_research", "confidence": 0.95, "needs_clarification": false, "reason": "Explicit research keyword" }
</example>

<example>
User: "change the background to blue"
Classification: { "intent": "edit_image", "confidence": 0.9, "needs_clarification": false, "reason": "Edit/change keyword, modifying existing" }
</example>

<example>
User: "schedule this for tomorrow 9am"
Classification: { "intent": "schedule_post", "confidence": 0.9, "needs_clarification": false, "reason": "Schedule keyword, image exists" }
</example>

<example>
User: "thanks!"
Classification: { "intent": "chat", "confidence": 0.95, "needs_clarification": false, "reason": "Conversational reply" }
</example>

<example>
User: "automate my instagram account"
Classification: { "intent": "generate_and_post", "confidence": 0.9, "needs_clarification": false, "reason": "Automation request = content creation" }
</example>

━━━━━━━━━━━━━━━━━━━━━━
CLASSIFICATION RULES (PRIORITY ORDER)
━━━━━━━━━━━━━━━━━━━━━━
1. WEBSITE CONTENT: If user mentions a URL/website AND wants content/post/image for it → website_content

2. DEEP RESEARCH (EXPLICIT ONLY): ONLY if user says: research, analyze, compare, report → deep_research
   ⚠️ Do NOT use for simple content requests - only explicit research requests

3. AUTOMATION/CONTENT REQUESTS → generate_and_post (HIGH PRIORITY):
   - "automate my channel/account" → generate_and_post
   - "manage my [account]" → generate_and_post
   - "create content for my [account]" → generate_and_post
   - "generate a new post" → generate_and_post
   ⚠️ NEVER classify these as "chat" - they are clear action requests!

4. COMPOUND ACTIONS: If user says BOTH (create/generate/make) AND (post/publish/schedule) → generate_and_post

5. If user ONLY says: create, generate, make an image (NO posting) → generate_image

6. If user ONLY says: edit, change, modify, replace → edit_image

7. If user ONLY says: post, publish, schedule (image exists) → schedule_post

8. Short conversational replies ("yes", "ok", "thanks", "hey", "hi") → chat

9. If intent is unclear → needs_clarification = true

CRITICAL RULES:
- NEVER ignore the "post" part of a compound request
- NEVER guess intent
- website_content = GROUNDING (fast), deep_research = DISCOVERY (slow)

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

// Lower threshold - 0.6 is enough for action intents
// Only truly ambiguous requests should need clarification
const CONFIDENCE_THRESHOLD = 0.6;

// Intents that should NEVER need clarification if detected
const ACTION_INTENTS = ['generate_image', 'generate_and_post', 'edit_image', 'schedule_post', 'website_content', 'deep_research'];

class RouterAgent {
   constructor(options = {}) {
      this.llm = new OpenRouterProvider({
         model: options.model || 'google/gemini-3-flash-preview'
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

      // Apply confidence gate - but NEVER force clarification for action intents
      // If the LLM detected an action intent, trust it and proceed
      if (result.confidence < CONFIDENCE_THRESHOLD && !result.needs_clarification) {
         // Only flag for clarification if it's a "chat" intent with low confidence
         // Action intents should proceed even with lower confidence
         if (!ACTION_INTENTS.includes(result.intent)) {
            console.log('⚠️ [ROUTER] Low confidence chat, flagging for clarification:', result.confidence);
            result.needs_clarification = true;
         } else {
            console.log('✅ [ROUTER] Action intent detected, proceeding despite lower confidence:', result.intent, result.confidence);
         }
      }

      // OVERRIDE: If LLM says needs_clarification but detected an action intent, IGNORE clarification
      // This prevents over-cautious behavior
      if (result.needs_clarification && ACTION_INTENTS.includes(result.intent) && result.confidence >= 0.5) {
         console.log('✅ [ROUTER] Overriding clarification for action intent:', result.intent);
         result.needs_clarification = false;
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

