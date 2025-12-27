const WebsiteExtractor = require('../WebsiteExtractor');
const { CognitiveNarrator } = require('../CognitiveNarrator');

const extractor = new WebsiteExtractor();
const narrator = new CognitiveNarrator();

const extractWebsiteTool = {
   name: 'extract_website',
   description: `Extract structured content from a website URL for brand-aware content creation.

WHEN TO USE:
- User mentions their website or brand URL
- User says "check out my website", "based on my site", "from my brand"
- User wants content that matches their brand voice/style
- User provides a URL and wants related content
- Before creating branded marketing content
- User says "create content for my business" and provides URL

WHEN NOT TO USE:
- User wants general research on a topic → use deep_research instead
- User just wants to chat → use reply instead
- User already described their brand in detail (no URL needed)
- URL is for reference/inspiration only, not their own brand

WHAT IT EXTRACTS:
- Brand name and tagline
- Meta description and value proposition
- Headlines (H1, H2) and key messaging
- Hero text and main selling points
- Key bullet points and features
- Overall brand summary

USE CASES:
- "Create Instagram posts for my coffee shop" + URL → extracts brand voice, menu items, vibe
- "Make marketing content for questera.ai" → extracts tech positioning, features, target audience
- "I run a fitness brand at fitlife.com" → extracts workout philosophy, products, tone

OUTPUT USAGE:
- Use extracted data to inform image prompts with brand colors/style
- Use headlines and key points in captions
- Match the brand's tone in all generated content
- Reference specific products/services mentioned on site

EXAMPLES:
- User: "Here's my site: coolstartup.io, make me some posts"
  → Extract brand info, then generate branded content
- User: "Based on mybakery.com, create a promo image"
  → Extract bakery name, specialties, style for image prompt
- User: "Check questera.ai and make social content"
  → Extract AI/tech positioning for relevant visuals

IMPORTANT:
- Fast and deterministic (not AI-generated research)
- Works with any public website URL
- Automatically normalizes URLs (adds https:// if missing)
- Returns structured data for consistent brand messaging
- Use this BEFORE generating images to ensure brand alignment`,

   parameters: {
      url: {
         type: 'string',
         required: true,
         description: 'Website URL to extract. Can include or omit https://. Domain only works too.',
         example: 'questera.ai'
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

