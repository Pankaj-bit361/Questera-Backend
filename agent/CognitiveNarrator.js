/**
 * CognitiveNarrator - Makes the AI agent "feel smart" by expressing its reasoning
 * 
 * This module transforms silent internal decisions into visible, human-friendly
 * thinking steps that make users perceive the agent as intelligent and deliberate.
 */

const AGENT_PERSONAS = {
   strategist: { emoji: '🧠', name: 'Strategist AI', color: '#8B5CF6' },
   creative: { emoji: '🎨', name: 'Creative AI', color: '#EC4899' },
   editor: { emoji: '✏️', name: 'Editor AI', color: '#F59E0B' },
   researcher: { emoji: '🔍', name: 'Research AI', color: '#3B82F6' },
   growth: { emoji: '📅', name: 'Growth AI', color: '#10B981' },
   reviewer: { emoji: '🛡️', name: 'Reviewer AI', color: '#6366F1' }
};

const TOOL_TO_PERSONA = {
   generate_image: 'creative',
   edit_image: 'editor',
   extract_website: 'researcher',
   deep_research: 'researcher',
   schedule_post: 'growth',
   create_variations: 'creative',
   get_accounts: 'growth'
};

const ASPECT_RATIO_REASONS = {
   '1:1': 'Square format works great for profile pictures and Instagram posts',
   '4:5': 'This 4:5 ratio performs 23% better in Instagram feeds',
   '9:16': 'Vertical format optimized for Stories and Reels',
   '16:9': 'Widescreen format ideal for YouTube thumbnails and covers',
   '3:4': 'Portrait orientation for Pinterest and professional headshots'
};

const STYLE_REASONS = {
   'cinematic': 'Cinematic style adds drama and professional polish',
   'photorealistic': 'Photorealistic rendering for maximum authenticity',
   'anime': 'Anime style brings vibrant, expressive character',
   'digital-art': 'Digital art style for modern, clean aesthetics',
   'oil-painting': 'Oil painting style adds classical artistic depth'
};

class CognitiveNarrator {
   constructor() {
      this.steps = [];
   }

   /**
    * Start a new narration sequence
    */
   reset() {
      this.steps = [];
      return this;
   }

   /**
    * Add a thinking step
    */
   addStep(persona, action, detail = null) {
      const personaInfo = AGENT_PERSONAS[persona] || AGENT_PERSONAS.strategist;
      this.steps.push({
         persona,
         emoji: personaInfo.emoji,
         name: personaInfo.name,
         action,
         detail,
         timestamp: Date.now()
      });
      return this;
   }

   /**
    * Generate thinking steps for image generation
    */
   narrateImageGeneration(params, context) {
      this.reset();

      // Strategist analyzes the request
      this.addStep('strategist', 'Analyzing your creative request');

      // Check for reference images
      if (context.referenceImages?.length > 0) {
         this.addStep('researcher', `Processing ${context.referenceImages.length} reference image${context.referenceImages.length > 1 ? 's' : ''} for style matching`);
      }

      // Creative designs
      const aspectReason = ASPECT_RATIO_REASONS[params.aspectRatio] || 'Selecting optimal composition';
      this.addStep('creative', 'Designing visual composition', aspectReason);

      // Style reasoning
      if (params.style) {
         const styleReason = STYLE_REASONS[params.style.toLowerCase()] || `Applying ${params.style} style`;
         this.addStep('creative', styleReason);
      }

      // Reviewer checks
      this.addStep('reviewer', 'Ensuring high-quality output');

      return this.getSteps();
   }

   /**
    * Generate thinking steps for image editing
    */
   narrateImageEdit(params, context) {
      this.reset();

      this.addStep('strategist', 'Understanding edit requirements');
      
      if (context.referenceImages?.length > 0) {
         this.addStep('editor', `Preparing ${context.referenceImages.length} image${context.referenceImages.length > 1 ? 's' : ''} for modification`);
      } else if (context.lastImageUrl) {
         this.addStep('editor', 'Using your last generated image as base');
      }

      this.addStep('editor', 'Applying precise modifications');
      this.addStep('reviewer', 'Verifying edit quality and accuracy');

      return this.getSteps();
   }

   /**
    * Generate thinking steps for website extraction
    */
   narrateWebsiteExtraction(params) {
      this.reset();

      this.addStep('researcher', `Analyzing ${params.url}`);
      this.addStep('researcher', 'Extracting brand identity and key messaging');
      this.addStep('strategist', 'Preparing brand context for content creation');

      return this.getSteps();
   }

   /**
    * Generate thinking steps for scheduling
    */
   narrateScheduling(params) {
      this.reset();

      this.addStep('growth', 'Preparing post for Instagram');
      
      if (params.scheduledTime === 'now' || params.scheduledTime === 'immediately') {
         this.addStep('growth', 'Optimizing for immediate publishing');
      } else {
         this.addStep('growth', 'Scheduling for optimal engagement time');
      }

      this.addStep('reviewer', 'Final quality check before publishing');

      return this.getSteps();
   }

   /**
    * Get all accumulated steps
    */
   getSteps() {
      return [...this.steps];
   }

   /**
    * Get persona for a tool
    */
   static getPersonaForTool(toolName) {
      return TOOL_TO_PERSONA[toolName] || 'strategist';
   }

   /**
    * Get aspect ratio reasoning
    */
   static getAspectRatioReason(ratio) {
      return ASPECT_RATIO_REASONS[ratio] || null;
   }

   /**
    * Get style reasoning
    */
   static getStyleReason(style) {
      return STYLE_REASONS[style?.toLowerCase()] || null;
   }
}

module.exports = { CognitiveNarrator, AGENT_PERSONAS, ASPECT_RATIO_REASONS, STYLE_REASONS };

