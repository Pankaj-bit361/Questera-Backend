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

/**
 * Content + Prompt Engine
 * Converts user requests into design briefs, image prompts, and captions
 */
class ContentEngine {
  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    this.textModel = 'gemini-2.5-flash';
  }

  /**
   * Generate a design brief from user request and context
   */
  async generateDesignBrief(userRequest, context = {}) {
    const { profile, memories, referenceType } = context;

    const systemPrompt = `You are a creative director for AI-generated content. 
Given a user request, create a detailed design brief for image generation.

${context.profileContext || ''}

Output a JSON object with:
{
  "concept": "Main creative concept in one sentence",
  "mood": ["mood1", "mood2", "mood3"],
  "colors": ["primary color", "secondary color", "accent"],
  "composition": "Description of image composition and framing",
  "targetPlatform": "instagram|facebook|tiktok|general",
  "targetAspectRatio": "1:1|4:5|9:16|16:9",
  "styleDirection": "photorealistic|cinematic|artistic|editorial|lifestyle",
  "referenceNotes": "How to incorporate reference images if any",
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
      return JSON.parse(cleanJsonResponse(text));
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

    const systemPrompt = `You are an elite social media growth strategist who has helped creators go viral.
Your job is to create MAXIMUM ENGAGEMENT content that drives likes, comments, shares, and follows.

CONTENT CONTEXT:
- Design Brief: ${JSON.stringify(designBrief, null, 2)}
- Platform: ${platform}
- Niche: ${niche || 'lifestyle'}
- Creator Goals: ${goals.join(', ') || 'grow audience, increase engagement'}
- Tone: ${tone}

VIRALITY PRINCIPLES TO APPLY:
1. HOOK: First line must stop the scroll (curiosity, controversy, or emotion)
2. RELATABILITY: Make viewers see themselves in the content
3. VALUE: Provide insight, entertainment, or inspiration
4. CTA: Drive engagement with questions or challenges
5. HASHTAG STRATEGY: Mix of high-volume (1M+), medium (100K-1M), niche (<100K)

OUTPUT FORMAT (JSON):
{
  "title": "Attention-grabbing title for the post (under 60 chars)",
  "hook": "Scroll-stopping first line that creates curiosity",
  "description": "Full post description with emojis, line breaks, and storytelling (300-500 chars)",
  "shortCaption": "Punchy one-liner version (under 100 chars)",
  "callToAction": "Engagement-driving question or challenge",
  "hashtags": {
    "primary": ["5 high-volume trending hashtags"],
    "secondary": ["5 medium-volume relevant hashtags"],
    "niche": ["5 niche-specific hashtags"],
    "branded": ["2-3 unique branded hashtags"]
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
    return {
      title: designBrief?.concept || 'Check this out! ✨',
      hook: 'You won\'t believe what happened next...',
      description: `${designBrief?.concept || 'Amazing content'} ✨\n\nDouble tap if you agree! 👇`,
      shortCaption: designBrief?.concept || 'New post alert! 🔥',
      callToAction: 'What do you think? Comment below! 👇',
      hashtags: {
        primary: ['viral', 'trending', 'explore', 'foryou', 'instagood'],
        secondary: ['content', 'creator', 'lifestyle', 'daily', 'mood'],
        niche: ['aiart', 'digitalcreator', 'contentcreator'],
        branded: ['questera', 'aigenerated']
      },
      hashtagString: '#viral #trending #explore #foryou #instagood #content #creator #aiart #questera',
      bestPostingTimes: ['9:00 AM', '12:00 PM', '7:00 PM'],
      viralScore: 5,
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