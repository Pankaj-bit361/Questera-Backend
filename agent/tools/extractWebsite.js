const WebsiteExtractor = require('../WebsiteExtractor');

const extractor = new WebsiteExtractor();

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

      const result = await extractor.extract(url);

      if (!result.success) {
         return {
            success: false,
            error: result.error || 'Failed to extract website content'
         };
      }

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
         message: `Extracted content from ${result.data.title || url}. Use this to create relevant content.`
      };
   }
};

module.exports = extractWebsiteTool;

