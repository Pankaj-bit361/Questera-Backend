const DeepResearch = require('../DeepResearch');

const researcher = new DeepResearch();

const deepResearchTool = {
   name: 'deep_research',
   description: `Perform comprehensive web research on a topic with multiple sources and analysis.

⚠️ IMPORTANT: This tool is SLOW (30-60 seconds) and EXPENSIVE. Use sparingly!

WHEN TO USE:
- User EXPLICITLY asks for "research", "analyze", "compare", "report"
- User wants competitive analysis: "research my competitors"
- User wants market insights: "what's trending in fitness industry"
- User wants brand analysis: "research Nike's marketing strategy"
- User needs data-backed content: "find statistics about remote work"
- User says "deep dive", "thorough analysis", "comprehensive overview"

WHEN NOT TO USE:
- User just wants to create an image → use generate_image instead
- User provides their own website → use extract_website instead (much faster!)
- User asks simple questions → use reply instead
- User wants quick content generation → just generate without research
- User doesn't explicitly ask for research/analysis
- Simple brand lookups or basic info

FOCUS TYPES:
- "competitive": Analyzes competitors, market positioning, strategies
- "market": Industry trends, statistics, growth areas, opportunities
- "brand": Specific brand analysis, marketing tactics, voice/style
- "general": Broad topic research, facts, multiple perspectives

RESEARCH DEPTH:
- Searches multiple web sources
- Synthesizes information into coherent analysis
- Provides source citations
- Returns structured insights

EXAMPLES:
- "Research trending fitness content for Instagram" → market focus, fitness trends
- "Analyze Gymshark's marketing strategy" → brand focus, specific brand
- "Who are the top competitors for meal prep services?" → competitive focus
- "What are the latest AI trends in 2024?" → general focus, tech trends

OUTPUT INCLUDES:
- Synthesized research summary
- Key insights and findings
- Source URLs for verification
- Duration taken for research

BEST PRACTICES:
- Be specific with your query for better results
- Use focus parameter to narrow down research type
- Allow 30-60 seconds for comprehensive results
- Use extracted research to inform image generation

COST/TIME WARNING:
- Takes 30-60 seconds to complete
- Uses significant API resources
- Only use when user explicitly needs research
- For simple info, reply directly or use extract_website`,

   parameters: {
      query: {
         type: 'string',
         required: true,
         description: 'Specific research query. Be detailed: topic + what you want to know + context.',
         example: 'Top Instagram marketing strategies for fitness brands in 2024, focusing on engagement tactics'
      },
      focus: {
         type: 'string',
         required: false,
         description: 'Research focus: "competitive" (competitor analysis), "market" (trends/stats), "brand" (specific brand), "general" (broad topic)',
         example: 'market'
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

