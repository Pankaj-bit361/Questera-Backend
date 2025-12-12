const { GoogleGenAI } = require('@google/genai');

class DeepResearch {
   constructor() {
      this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
   }

   /**
    * Perform deep research on a topic using Gemini with Google Search grounding
    * @param {string} query - The research query
    * @param {object} options - Research options
    * @returns {Promise<object>} Research results
    */
   async research(query, options = {}) {
      console.log('🔬 [DEEP_RESEARCH] Starting research:', query?.slice(0, 100));
      const startTime = Date.now();

      try {
         // Use Gemini with Google Search grounding
         const response = await this.client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
               role: 'user',
               parts: [{ text: this._buildResearchPrompt(query, options) }]
            }],
            config: {
               tools: [{ googleSearch: {} }],
               temperature: 0.3,
            }
         });

         const result = response.text || '';
         const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

         console.log('🔬 [DEEP_RESEARCH] Completed in', Date.now() - startTime, 'ms');
         console.log('🔬 [DEEP_RESEARCH] Sources:', groundingMetadata?.groundingChunks?.length || 0);

         // Extract sources
         const sources = this._extractSources(groundingMetadata);

         return {
            success: true,
            research: result,
            sources: sources,
            query: query,
            duration: Date.now() - startTime
         };

      } catch (error) {
         console.error('❌ [DEEP_RESEARCH] Error:', error.message);
         return {
            success: false,
            error: error.message,
            query: query
         };
      }
   }

   _buildResearchPrompt(query, options) {
      const { focus, maxLength } = options;

      let prompt = `You are a research analyst. Research the following topic thoroughly using web search.

TOPIC: ${query}

REQUIREMENTS:
- Use ONLY factual, verifiable information from search results
- Cite sources where possible
- Be concise but comprehensive
- Focus on actionable insights`;

      if (focus === 'competitive') {
         prompt += `\n- Analyze competitors and market positioning
- Identify strengths, weaknesses, opportunities`;
      } else if (focus === 'market') {
         prompt += `\n- Focus on market trends and statistics
- Include recent developments`;
      } else if (focus === 'brand') {
         prompt += `\n- Focus on brand identity and messaging
- Analyze target audience and positioning`;
      }

      prompt += `\n\nProvide a structured response with clear sections.`;

      if (maxLength) {
         prompt += `\nKeep response under ${maxLength} words.`;
      }

      return prompt;
   }

   _extractSources(groundingMetadata) {
      if (!groundingMetadata?.groundingChunks) return [];

      const sources = [];
      for (const chunk of groundingMetadata.groundingChunks) {
         if (chunk.web?.uri) {
            sources.push({
               url: chunk.web.uri,
               title: chunk.web.title || 'Source'
            });
         }
      }
      return sources.slice(0, 5); // Max 5 sources
   }

   /**
    * Summarize research results for social media content
    */
   async summarizeForContent(research, platform = 'instagram') {
      const prompt = `Summarize this research into content ideas for ${platform}.

RESEARCH:
${research}

Create:
1. A short, engaging caption (max 150 chars)
2. 3 key talking points
3. Suggested hashtags

Be concise and platform-appropriate.`;

      try {
         const response = await this.client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { temperature: 0.7 }
         });

         return { success: true, summary: response.text };
      } catch (error) {
         return { success: false, error: error.message };
      }
   }
}

module.exports = DeepResearch;

