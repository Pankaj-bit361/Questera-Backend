const { GoogleGenAI } = require('@google/genai');

/**
 * Helper to clean JSON from markdown code blocks and extract JSON
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
  cleaned = cleaned.trim();

  // Try to extract JSON if it's wrapped in text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return cleaned;
}

/**
 * Helper to safely parse JSON with fallback
 */
function safeJsonParse(text, fallback = {}) {
  try {
    const cleaned = cleanJsonResponse(text);
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn('⚠️ JSON parse failed, using fallback:', error.message);
    return fallback;
  }
}

/**
 * Content + Prompt Engine
 * Converts user requests into design briefs, image prompts, and captions
 */
class ContentEngine {
  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    this.textModel = 'gemini-2.5-flash-lite-preview-09-2025';
  }

  /**
   * Generate a design brief from user request and context
   */
  async generateDesignBrief(userRequest, context = {}) {
    const { profile, memories, referenceType } = context;

    const systemPrompt = `You are a creative director for AI-generated content.
Given a user request, create a detailed design brief for image generation.

IMPORTANT: Extract the brand name if mentioned by the user. The brand name is crucial for content creation.

${context.profileContext || ''}

Output a JSON object with:
{
  "concept": "Main creative concept in one sentence",
  "brandName": "The brand name mentioned by user (or null if not mentioned)",
  "mood": ["mood1", "mood2", "mood3"],
  "colors": ["primary color", "secondary color", "accent"],
  "composition": "Description of image composition and framing",
  "targetPlatform": "instagram|facebook|tiktok|general",
  "targetAspectRatio": "1:1|4:5|9:16|16:9",
  "styleDirection": "photorealistic|cinematic|artistic|editorial|lifestyle",
  "referenceNotes": "How to incorporate reference images if any",
  "productTypes": ["list of product types mentioned like jeans, t-shirt, shirt, etc."],
  "count": number of images to generate (1-10)
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Request: ${userRequest}` }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const fallback = {
        concept: userRequest,
        mood: ['professional', 'modern'],
        colors: ['neutral'],
        composition: 'centered subject, clean background',
        targetPlatform: 'instagram',
        targetAspectRatio: '1:1',
        styleDirection: 'photorealistic',
        count: 1,
      };
      return safeJsonParse(text, fallback);
    } catch (error) {
      console.error('Error generating design brief:', error);
      return {
        concept: userRequest,
        mood: ['professional', 'modern'],
        colors: ['neutral'],
        composition: 'centered subject, clean background',
        targetPlatform: 'instagram',
        targetAspectRatio: '1:1',
        styleDirection: 'photorealistic',
        count: 1,
      };
    }
  }

  /**
   * Generate multiple image prompts from a design brief
   */
  async generateImagePrompts(designBrief, context = {}) {
    const { hasReferenceImage, referenceType, count = 3 } = context;

    const referenceInstruction = hasReferenceImage
      ? `IMPORTANT: Each prompt must incorporate the person/product from the reference image. 
         Use phrases like "the same person", "maintaining their exact likeness", "the subject from the reference".`
      : '';

    const systemPrompt = `You are an expert prompt engineer for AI image generation.
Given a design brief, create ${count} unique, detailed image generation prompts.

${referenceInstruction}

Design Brief:
${JSON.stringify(designBrief, null, 2)}

Create prompts that:
1. Are highly detailed and specific
2. Include lighting, mood, and composition details
3. Vary in style/setting while maintaining brand consistency
4. Are optimized for ${designBrief.targetAspectRatio || '1:1'} aspect ratio
5. Follow ${designBrief.styleDirection || 'photorealistic'} style

Output a JSON array of prompt strings:
["prompt1", "prompt2", "prompt3", ...]`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: 'application/json',
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      return JSON.parse(cleanJsonResponse(text));
    } catch (error) {
      console.error('Error generating prompts:', error);
      return [designBrief.concept || 'A professional photograph'];
    }
  }

  /**
   * Generate viral post content - title, description, hashtags optimized for engagement
   */
  async generateViralPostContent(designBrief, imageDescriptions = [], context = {}) {
    const { platform = 'instagram', tone = 'engaging', niche = '', goals = [] } = context;

    // Extract brand name from design brief
    const brandName = designBrief?.brandName || '';
    const productTypes = designBrief?.productTypes || [];
    const concept = designBrief?.concept || '';

    const systemPrompt = `You are an elite social media growth strategist who has helped creators go viral.
Your job is to create MAXIMUM ENGAGEMENT content that drives likes, comments, shares, and follows.

CONTENT CONTEXT:
- Concept: ${concept}
- Brand Name: ${brandName || 'Not specified'} ${brandName ? '(MUST prominently feature this brand in title and description!)' : ''}
- Product Types: ${productTypes.length > 0 ? productTypes.join(', ') : 'general fashion'}
- Platform: ${platform}
- Niche: ${niche || 'fashion/lifestyle'}
- Creator Goals: ${goals.join(', ') || 'grow audience, increase engagement'}
- Tone: ${tone}

${brandName ? `BRAND INTEGRATION RULES:
- The brand name "${brandName}" MUST appear in the title
- The brand name "${brandName}" MUST appear prominently in the description (first 2 lines)
- Create branded hashtag: #${brandName.replace(/\s+/g, '')}
- Make the content feel like official brand content
` : ''}

VIRALITY PRINCIPLES TO APPLY:
1. HOOK: First line must stop the scroll (curiosity, controversy, or emotion)
2. RELATABILITY: Make viewers see themselves in the content
3. VALUE: Provide insight, entertainment, or inspiration
4. CTA: Drive engagement with questions or challenges
5. HASHTAG STRATEGY: Mix of high-volume (1M+), medium (100K-1M), niche (<100K)

OUTPUT FORMAT (JSON):
{
  "title": "Attention-grabbing title ${brandName ? `featuring "${brandName}" brand` : ''} (under 60 chars)",
  "hook": "Scroll-stopping first line that creates curiosity",
  "description": "Full post description with emojis, line breaks, and storytelling. ${brandName ? `MUST mention "${brandName}" in first 2 lines.` : ''} (300-500 chars)",
  "shortCaption": "Punchy one-liner ${brandName ? `with "${brandName}"` : ''} (under 100 chars)",
  "callToAction": "Engagement-driving question or challenge",
  "hashtags": {
    "primary": ["5 high-volume trending hashtags"],
    "secondary": ["5 medium-volume relevant hashtags"],
    "niche": ["5 niche-specific hashtags"],
    "branded": ["2-3 unique branded hashtags ${brandName ? `including #${brandName.replace(/\s+/g, '')}` : ''}"]
  },
  "hashtagString": "#tag1 #tag2 ... (all hashtags formatted for copy-paste)",
  "bestPostingTimes": ["suggested posting times for max reach"],
  "viralScore": 1-10,
  "viralTips": ["specific tips to boost this post's virality"]
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: 'application/json',
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(cleanJsonResponse(text));
    } catch (error) {
      console.error('Error generating viral content:', error);
      return this.getFallbackViralContent(designBrief);
    }
  }

  /**
   * Fallback viral content if AI fails
   */
  getFallbackViralContent(designBrief) {
    const brandName = designBrief?.brandName || '';
    const productTypes = designBrief?.productTypes || [];
    const concept = designBrief?.concept || 'Amazing content';

    // Create brand-aware fallback content
    const brandTag = brandName ? brandName.replace(/\s+/g, '') : 'brand';
    const productsText = productTypes.length > 0 ? productTypes.join(', ') : 'collection';

    const title = brandName
      ? `${brandName} - New ${productsText} Drop! 🔥`
      : `Check this out! ✨`;

    const description = brandName
      ? `${brandName} presents the latest ${productsText}! ✨\n\n${concept}\n\nDouble tap if you love it! 👇`
      : `${concept} ✨\n\nDouble tap if you agree! 👇`;

    const brandedTags = brandName
      ? [brandTag.toLowerCase(), `${brandTag}style`.toLowerCase(), 'brandnew']
      : ['questera', 'aigenerated'];

    return {
      title,
      hook: brandName ? `${brandName} just dropped something amazing...` : 'You won\'t believe what happened next...',
      description,
      shortCaption: brandName ? `${brandName} ${productsText} 🔥` : 'New post alert! 🔥',
      callToAction: brandName ? `Would you wear ${brandName}? Comment below! 👇` : 'What do you think? Comment below! 👇',
      hashtags: {
        primary: ['viral', 'trending', 'explore', 'foryou', 'instagood'],
        secondary: ['fashion', 'style', 'ootd', 'clothing', 'outfitoftheday'],
        niche: ['fashionbrand', 'newcollection', 'streetwear'],
        branded: brandedTags
      },
      hashtagString: `#viral #trending #explore #fashion #style ${brandName ? `#${brandTag.toLowerCase()}` : '#questera'} #ootd #newcollection`,
      bestPostingTimes: ['9:00 AM', '12:00 PM', '7:00 PM'],
      viralScore: 6,
      viralTips: ['Post during peak hours', 'Engage with comments quickly', 'Use trending audio']
    };
  }

  /**
   * Generate captions and hashtags for generated images (legacy method)
   */
  async generateCaptions(designBrief, imageDescriptions = [], context = {}) {
    // Use the new viral content generator
    return this.generateViralPostContent(designBrief, imageDescriptions, context);
  }

  /**
   * Enhance a simple prompt with professional details
   */
  async enhancePrompt(simplePrompt, context = {}) {
    const { style = 'photorealistic', aspectRatio = '1:1', hasReference = false } = context;

    const referenceNote = hasReference
      ? 'Maintain the exact likeness of the person from the reference image. '
      : '';

    const systemPrompt = `Enhance this simple image prompt into a detailed, professional prompt.
Style: ${style}
Aspect Ratio: ${aspectRatio}
${referenceNote}

Simple prompt: "${simplePrompt}"

Output only the enhanced prompt text, nothing else.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.6 },
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.text || simplePrompt;
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      return simplePrompt;
    }
  }

  /**
   * Generate an edit/modification prompt for image editing
   */
  async generateEditPrompt(userMessage, editDescription) {
    const systemPrompt = `You are an expert at creating image editing prompts for AI image models.
The user wants to MODIFY an existing image. Create a prompt that describes the edit.

User's request: "${userMessage}"
Edit description: "${editDescription}"

IMPORTANT:
- The prompt should describe the MODIFICATION, not create a new image from scratch
- Preserve the original image as much as possible
- Only change what the user specifically asked for
- Be specific about what stays the same and what changes

Output only the edit prompt text, nothing else. Start with "Edit the image to..." or "Modify the image by..."`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.5 },
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.text || `Edit the image: ${editDescription}`;
    } catch (error) {
      console.error('Error generating edit prompt:', error);
      return `Edit the image: ${editDescription}`;
    }
  }

  /**
   * Extract memories/insights from a conversation message
   */
  async extractMemoriesFromMessage(message, existingContext = '') {
    const systemPrompt = `Analyze this user message and extract any insights about their preferences, brand, style, or goals.

Existing context: ${existingContext}

Message: "${message}"

Output JSON with memories to save:
{
  "memories": [
    { "type": "preference|fact|style|goal", "key": "short key", "value": "value", "importance": 1-5 }
  ],
  "profileUpdates": {
    "niche": "if mentioned",
    "goals": ["if mentioned"],
    "toneOfVoice": ["if mentioned"],
    "visualStyle": { "keywords": [], "mood": [], "colors": [] }
  }
}

Only include fields that are clearly mentioned. Return empty arrays/objects if nothing found.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(cleanJsonResponse(text));
    } catch (error) {
      console.error('Error extracting memories:', error);
      return { memories: [], profileUpdates: {} };
    }
  }

  /**
   * Score image quality (placeholder for future implementation)
   */
  async scoreImageQuality(imageUrl) {
    // TODO: Implement actual quality scoring using vision model
    // For now, return a placeholder score
    return {
      overall: 85,
      composition: 80,
      lighting: 85,
      sharpness: 90,
      aesthetics: 85,
    };
  }
}

module.exports = ContentEngine;