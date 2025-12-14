const WebsiteExtractor = require('../WebsiteExtractor');
const { CognitiveNarrator } = require('../CognitiveNarrator');

const extractor = new WebsiteExtractor();
const narrator = new CognitiveNarrator();

const extractWebsiteTool = {
   name: 'extract_website',
   description: 'Extract structured content from a website URL. Use when user wants to create content based on their website or brand. Fast and deterministic.',
   parameters: {
      url: {
         type: 'string',
         required: true,
         description: 'The website URL to extract content from (e.g., questera.ai, example.com)'
      }
   },

   execute: async (params, context) => {
      const { url } = params;

      console.log('🌐 [EXTRACT_WEBSITE] Extracting:', url);

      if (!url) {
         return { success: false, error: 'URL is required' };
      }

      // Generate cognitive narration (thinking steps)
      const thinkingSteps = narrator.narrateWebsiteExtraction(params);

      const result = await extractor.extract(url);

      if (!result.success) {
         return {
            success: false,
            error: result.error || 'Failed to extract website content'
         };
      }

      // Build opinionated reasoning (micro-decisions)
      const decisions = [];

      if (result.data.title) {
         decisions.push({
            type: 'brand',
            value: result.data.title,
            reason: 'Identified your brand name for consistent messaging'
         });
      }

      if (result.data.metaDescription || result.data.ogDescription) {
         decisions.push({
            type: 'positioning',
            value: 'brand voice captured',
            reason: 'Extracted your unique value proposition for authentic content'
         });
      }

      if (result.data.keyBullets?.length > 0) {
         decisions.push({
            type: 'features',
            value: `${result.data.keyBullets.length} key points`,
            reason: 'Captured your main selling points to highlight in visuals'
         });
      }

      // Generate smart suggestions
      const suggestions = [
         'Ready to create branded visuals based on your website.',
         'I can generate social media content that matches your brand voice.',
         'Want me to create images featuring your key product benefits?'
      ];

      // Return structured data for LLM context
      return {
         success: true,
         websiteData: {
            url: result.data.url,
            title: result.data.title,
            description: result.data.metaDescription || result.data.ogDescription,
            headline: result.data.h1,
            sections: result.data.h2s,
            heroText: result.data.heroText,
            keyPoints: result.data.keyBullets,
            summary: result.data.summary
         },
         message: `Extracted content from ${result.data.title || url}. Use this to create relevant content.`,
         // Cognitive Layer
         cognitive: {
            thinkingSteps,
            decisions,
            suggestions,
            persona: 'researcher'
         }
      };
   }
};

module.exports = extractWebsiteTool;

