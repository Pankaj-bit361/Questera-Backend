/**
 * ViralContentService
 * Extracts trending/viral content from the web for inspiration
 * Analyzes what makes posts viral and generates similar content
 */

const { GoogleGenAI } = require('@google/genai');

/**
 * Helper to clean JSON from markdown code blocks
 */
function cleanJsonResponse(text) {
  if (!text) return '{}';
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

class ViralContentService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.textModel = 'gemini-2.5-flash-lite-preview-09-2025';
  }

  /**
   * Helper to extract text from Gemini response
   */
  extractText(response) {
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  }

  /**
   * Search for trending content in a niche
   * @param {string} niche - Industry/niche to search
   * @param {string} platform - Target platform (instagram, tiktok, linkedin)
   * @param {number} count - Number of trends to find
   */
  async findTrendingContent(niche, platform = 'instagram', count = 10) {
    console.log(`🔥 [VIRAL] Searching trending ${platform} content in ${niche}`);

    // Use Gemini to search for and analyze trending content
    const searchPrompt = `You are a social media trend analyst. Find and describe ${count} current viral/trending content ideas for ${platform} in the "${niche}" niche.

For each trend, provide:
1. Trend Name/Theme
2. Why it's going viral (psychology)
3. Visual description (what the images/videos look like)
4. Hashtags being used
5. Caption style/hooks
6. Best posting time
7. Engagement tips

Focus on CURRENT trends (late 2024/2025). Be specific about visuals so an AI image generator can recreate similar content.

Output as JSON array:
[
  {
    "trendName": "...",
    "viralReason": "...",
    "visualDescription": "Detailed description of the visual style, composition, colors, subjects...",
    "hashtags": ["#tag1", "#tag2"],
    "captionHooks": ["Hook 1...", "Hook 2..."],
    "bestPostingTime": "9AM-11AM weekdays",
    "engagementTips": ["Tip 1", "Tip 2"],
    "estimatedEngagement": "high|medium|viral"
  }
]`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.8,
        },
      });

      const text = this.extractText(response);
      let trends;
      try {
        trends = JSON.parse(cleanJsonResponse(text));
      } catch (parseError) {
        console.warn('⚠️ [VIRAL] JSON parse error, attempting to fix:', parseError.message);
        // Try to extract valid JSON array from the response
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            trends = JSON.parse(match[0]);
          } catch {
            trends = [];
          }
        } else {
          trends = [];
        }
      }

      return {
        niche,
        platform,
        trends: Array.isArray(trends) ? trends : [],
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('❌ [VIRAL] Error finding trends:', error);
      throw error;
    }
  }

  /**
   * Analyze a competitor's content style
   * @param {string} competitorHandle - Instagram/TikTok handle
   * @param {string} platform - Platform name
   */
  async analyzeCompetitor(competitorHandle, platform = 'instagram') {
    console.log(`🔍 [VIRAL] Analyzing competitor: @${competitorHandle}`);

    const analysisPrompt = `You are a social media analyst. Analyze the typical content strategy of a successful ${platform} account like @${competitorHandle}.

Based on common patterns of successful accounts in this space, describe:

1. Content Pillars (main content themes)
2. Visual Aesthetic (colors, filters, composition style)
3. Posting Frequency
4. Caption Formula
5. Hashtag Strategy
6. Engagement Tactics
7. Story/Reel Strategy
8. What makes their content shareable

Output as JSON:
{
  "handle": "@${competitorHandle}",
  "platform": "${platform}",
  "contentPillars": ["pillar1", "pillar2"],
  "visualAesthetic": {
    "colorPalette": ["#color1", "#color2"],
    "filterStyle": "warm|cool|minimal|vibrant",
    "compositionStyle": "centered|rule-of-thirds|dynamic"
  },
  "postingStrategy": {
    "frequency": "daily|2x-daily|3x-week",
    "bestTimes": ["9AM", "7PM"]
  },
  "captionFormula": "Description of their caption style",
  "hashtagStrategy": "How they use hashtags",
  "engagementTactics": ["tactic1", "tactic2"],
  "viralElements": ["element1", "element2"],
  "contentIdeas": [
    {
      "idea": "Content idea based on their style",
      "visualPrompt": "AI image generation prompt to create similar content"
    }
  ]
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const text = this.extractText(response);
      let result;
      try {
        // Remove any JavaScript-style comments from JSON
        const cleanedText = cleanJsonResponse(text).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        result = JSON.parse(cleanedText);
      } catch (parseError) {
        console.warn('⚠️ [VIRAL] JSON parse error in competitor analysis:', parseError.message);
        result = { handle: competitorHandle, error: 'Could not parse analysis' };
      }
      return result;
    } catch (error) {
      console.error('❌ [VIRAL] Error analyzing competitor:', error);
      return { handle: competitorHandle, error: error.message };
    }
  }

  /**
   * Generate viral-optimized content ideas
   * Combines trending topics with user's brand/niche
   */
  async generateViralIdeas(userId, options = {}) {
    const {
      niche = 'fashion',
      platform = 'instagram',
      brandDescription = '',
      productType = '',
      targetAudience = '',
      count = 5,
    } = options;

    console.log(`💡 [VIRAL] Generating ${count} viral ideas for ${niche}`);

    // First, get current trends (with fallback)
    let trends = { trends: [] };
    try {
      trends = await this.findTrendingContent(niche, platform, 5);
    } catch (trendError) {
      console.warn('⚠️ [VIRAL] Could not fetch trends, using fallback:', trendError.message);
    }

    // Then, combine with brand context to generate tailored ideas
    const ideaPrompt = `You are a viral content strategist. Based on these current trends and the brand context, generate ${count} content ideas that are likely to go viral.

CURRENT TRENDS IN ${niche.toUpperCase()}:
${JSON.stringify(trends.trends.slice(0, 3), null, 2)}

BRAND CONTEXT:
- Niche: ${niche}
- Platform: ${platform}
- Brand: ${brandDescription || 'Not specified'}
- Product Type: ${productType || 'Not specified'}
- Target Audience: ${targetAudience || 'General'}

Generate ${count} unique, viral-worthy content ideas that:
1. Tap into current trends
2. Fit the brand's identity
3. Have high shareability
4. Can be created with AI image generation

Output JSON:
{
  "ideas": [
    {
      "title": "Catchy idea title",
      "concept": "What the content is about",
      "whyViral": "Why this will resonate and get shared",
      "imagePrompt": "Detailed AI image generation prompt (be VERY specific about style, lighting, composition, colors, subjects)",
      "caption": "Ready-to-use caption with hooks",
      "hashtags": "#tag1 #tag2 #tag3",
      "bestPostTime": "Day and time",
      "callToAction": "What action to ask viewers to take",
      "viralScore": 1-10
    }
  ]
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: ideaPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.9,
        },
      });

      const text = this.extractText(response);
      let result;
      try {
        result = JSON.parse(cleanJsonResponse(text));
      } catch (parseError) {
        console.warn('⚠️ [VIRAL] JSON parse error in ideas, using fallback:', parseError.message);
        result = { ideas: [] };
      }

      return {
        userId,
        niche,
        platform,
        trends: (trends.trends || []).slice(0, 3),
        ideas: result.ideas || [],
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('❌ [VIRAL] Error generating ideas:', error);
      // Return empty result instead of throwing
      return {
        userId,
        niche,
        platform,
        trends: [],
        ideas: [],
        generatedAt: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Create a full viral content package
   * Generates image, caption, hashtags, and scheduling recommendation
   */
  async createViralPackage(userId, ideaIndex, viralIdeas) {
    const ImageOrchestrator = require('./ImageOrchestrator');
    const ContentEngine = require('./ContentEngine');

    const idea = viralIdeas.ideas[ideaIndex];
    if (!idea) throw new Error('Invalid idea index');

    console.log(`📦 [VIRAL] Creating viral package: ${idea.title}`);

    const imageOrchestrator = new ImageOrchestrator();
    const contentEngine = new ContentEngine();

    // Generate the image
    const imageResult = await imageOrchestrator.generateImages(
      userId,
      null, // conversationId
      idea.imagePrompt,
      [], // no reference images
      { style: 'viral_optimized', count: 1 }
    );

    // Enhance caption with viral hooks
    const enhancedCaption = await contentEngine.generateViralCaption({
      originalCaption: idea.caption,
      imageContext: idea.concept,
      platform: viralIdeas.platform,
      targetAudience: viralIdeas.niche,
    });

    return {
      idea: idea.title,
      concept: idea.concept,
      image: imageResult.images?.[0] || null,
      caption: enhancedCaption.caption || idea.caption,
      hashtags: idea.hashtags,
      bestPostTime: idea.bestPostTime,
      callToAction: idea.callToAction,
      viralScore: idea.viralScore,
      readyToPost: true,
    };
  }

  /**
   * Get trending hashtags for a niche
   */
  async getTrendingHashtags(niche, platform = 'instagram', count = 30) {
    const hashtagPrompt = `List the top ${count} trending hashtags on ${platform} for the "${niche}" niche right now (late 2024/2025).

Categorize them:
1. High-volume (millions of posts) - for reach
2. Medium-volume (100K-1M posts) - for discovery
3. Niche-specific (10K-100K posts) - for targeting
4. Branded/Trending (currently viral)

Output JSON:
{
  "niche": "${niche}",
  "platform": "${platform}",
  "hashtags": {
    "highVolume": ["#tag1", "#tag2"],
    "mediumVolume": ["#tag1", "#tag2"],
    "nicheSpecific": ["#tag1", "#tag2"],
    "trending": ["#tag1", "#tag2"]
  },
  "recommendedMix": "Use 3 high-volume, 5 medium, 7 niche, 2 trending per post",
  "hashtagSets": [
    {
      "name": "Set 1 - Maximum Reach",
      "tags": "#tag1 #tag2 #tag3..."
    },
    {
      "name": "Set 2 - Engagement Focus",
      "tags": "#tag1 #tag2 #tag3..."
    }
  ]
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: hashtagPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const text = this.extractText(response);
      let result;
      try {
        result = JSON.parse(cleanJsonResponse(text));
      } catch (parseError) {
        console.warn('⚠️ [VIRAL] JSON parse error in hashtags:', parseError.message);
        result = { niche, platform, categories: [], hashtags: [] };
      }
      return result;
    } catch (error) {
      console.error('❌ [VIRAL] Error getting hashtags:', error);
      return { niche, platform, categories: [], hashtags: [], error: error.message };
    }
  }

  /**
   * Analyze why a specific type of content goes viral
   */
  async analyzeViralFormula(contentType, platform = 'instagram') {
    const formulaPrompt = `Analyze the viral formula for "${contentType}" content on ${platform}.

Break down:
1. The psychological triggers that make this content shareable
2. The visual elements that grab attention
3. The caption structures that drive engagement
4. The timing patterns that maximize reach
5. The audience behaviors that amplify virality

Output JSON:
{
  "contentType": "${contentType}",
  "platform": "${platform}",
  "psychologyTriggers": [
    {"trigger": "name", "explanation": "why it works", "howToUse": "practical tip"}
  ],
  "visualElements": [
    {"element": "name", "importance": "high|medium", "example": "description"}
  ],
  "captionStructures": [
    {"name": "Hook + Story + CTA", "template": "...", "effectiveness": "high"}
  ],
  "timingPatterns": {
    "bestDays": ["Tuesday", "Thursday"],
    "bestHours": ["9AM", "7PM"],
    "frequency": "daily"
  },
  "amplificationTactics": ["tactic1", "tactic2"],
  "commonMistakes": ["mistake1", "mistake2"],
  "successMetrics": {
    "expectedLikes": "range",
    "expectedComments": "range",
    "expectedShares": "range"
  }
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: formulaPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const text = this.extractText(response);
      let result;
      try {
        result = JSON.parse(cleanJsonResponse(text));
      } catch (parseError) {
        console.warn('⚠️ [VIRAL] JSON parse error in formula:', parseError.message);
        result = { contentType, platform, error: 'Could not parse formula' };
      }
      return result;
    } catch (error) {
      console.error('❌ [VIRAL] Error analyzing formula:', error);
      return { contentType, platform, error: error.message };
    }
  }
}

module.exports = ViralContentService;
