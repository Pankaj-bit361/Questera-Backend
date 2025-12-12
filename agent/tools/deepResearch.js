const DeepResearch = require('../DeepResearch');

const researcher = new DeepResearch();

const deepResearchTool = {
   name: 'deep_research',
   description: 'Perform deep web research on a topic. ONLY use when user EXPLICITLY asks for research, analysis, comparison, or reports. This is slow and expensive - do NOT use for simple content generation.',
   parameters: {
      query: {
         type: 'string',
         required: true,
         description: 'The research query or topic to investigate'
      },
      focus: {
         type: 'string',
         required: false,
         description: 'Research focus: "competitive", "market", "brand", or "general"'
      }
   },

   execute: async (params, context) => {
      const { query, focus } = params;

      console.log('🔬 [DEEP_RESEARCH_TOOL] Starting:', query);

      if (!query) {
         return { success: false, error: 'Research query is required' };
      }

      const result = await researcher.research(query, { focus: focus || 'general' });

      if (!result.success) {
         return {
            success: false,
            error: result.error || 'Research failed'
         };
      }

      return {
         success: true,
         research: result.research,
         sources: result.sources,
         duration: result.duration,
         message: `Research completed. Found ${result.sources.length} sources.`
      };
   }
};

module.exports = deepResearchTool;

