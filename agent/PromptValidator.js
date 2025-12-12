const { OpenRouterProvider } = require('./LLMProvider');

const VALIDATOR_SYSTEM_PROMPT = `You are a Prompt Validator for image generation.

Your job is to validate and optionally enrich user prompts BEFORE they are sent to the image model.

━━━━━━━━━━━━━━━━━━━━━━
VALIDATION RULES
━━━━━━━━━━━━━━━━━━━━━━
1. Check if the prompt is ACTIONABLE (can actually generate an image)
2. Check for PROHIBITED content (violence, NSFW, hate, illegal)
3. Check if critical details are MISSING

━━━━━━━━━━━━━━━━━━━━━━
ENRICHMENT RULES
━━━━━━━━━━━━━━━━━━━━━━
- If prompt is SHORT (< 20 words) and VAGUE → enrich with details
- If prompt is DETAILED (> 40 words with specifics) → use AS-IS
- NEVER remove user constraints (colors, styles, poses)
- NEVER add branding, logos, or text unless requested
- NEVER change the core subject or intent

━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (JSON ONLY)
━━━━━━━━━━━━━━━━━━━━━━
{
  "isValid": true,
  "enrichedPrompt": "the prompt to use (original or enhanced)",
  "wasEnriched": false,
  "issues": [],
  "suggestions": [],
  "category": "portrait | landscape | product | abstract | other"
}

If invalid:
{
  "isValid": false,
  "enrichedPrompt": null,
  "wasEnriched": false,
  "issues": ["reason 1", "reason 2"],
  "suggestions": ["try this instead"],
  "category": null
}`;

class PromptValidator {
   constructor(options = {}) {
      this.llm = new OpenRouterProvider({
         model: options.model || 'google/gemini-2.5-flash-lite-preview-09-2025'
      });
      this.minPromptLength = options.minPromptLength || 3;
      this.maxPromptLength = options.maxPromptLength || 2000;
   }

   async validate(prompt, context = {}) {
      console.log('✅ [VALIDATOR] Validating prompt:', prompt?.slice(0, 50));

      // Quick pre-validation
      const quickCheck = this.quickValidate(prompt);
      if (!quickCheck.isValid) {
         return quickCheck;
      }

      // LLM-based validation and enrichment
      const messages = [
         { role: 'system', content: VALIDATOR_SYSTEM_PROMPT },
         { role: 'user', content: `Validate and optionally enrich this image generation prompt:\n\n"${prompt}"` }
      ];

      const result = await this.llm.chatJSON(messages, {
         fallback: { isValid: true, enrichedPrompt: prompt, wasEnriched: false, issues: [], suggestions: [], category: 'other' }
      });

      console.log('✅ [VALIDATOR] Result:', result.isValid ? 'valid' : 'invalid', result.wasEnriched ? '(enriched)' : '');

      return {
         isValid: result.isValid !== false,
         enrichedPrompt: result.enrichedPrompt || prompt,
         wasEnriched: result.wasEnriched || false,
         originalPrompt: prompt,
         issues: result.issues || [],
         suggestions: result.suggestions || [],
         category: result.category || 'other'
      };
   }

   quickValidate(prompt) {
      // Basic sanity checks before calling LLM
      if (!prompt || typeof prompt !== 'string') {
         return {
            isValid: false,
            enrichedPrompt: null,
            issues: ['Prompt is empty or invalid'],
            suggestions: ['Please describe the image you want to create']
         };
      }

      const trimmed = prompt.trim();

      if (trimmed.length < this.minPromptLength) {
         return {
            isValid: false,
            enrichedPrompt: null,
            issues: ['Prompt is too short'],
            suggestions: ['Please provide more details about the image you want']
         };
      }

      if (trimmed.length > this.maxPromptLength) {
         return {
            isValid: false,
            enrichedPrompt: null,
            issues: ['Prompt is too long'],
            suggestions: ['Please shorten your prompt to under 2000 characters']
         };
      }

      return { isValid: true };
   }

   // Check if prompt should be enriched (short/vague)
   shouldEnrich(prompt) {
      const wordCount = prompt.trim().split(/\s+/).length;
      return wordCount < 20;
   }
}

module.exports = PromptValidator;

