const { GoogleGenAI } = require('@google/genai');
const OpenRouterLLM = require('./OpenRouterLLM');
const axios = require('axios');

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
    this.openRouter = new OpenRouterLLM(); // Use OpenRouter for text tasks
  }

  /**
   * Generate a design brief from user request and context
   */
  async generateDesignBrief(userRequest, context = {}) {
    const { profile, memories, referenceType } = context;

    const systemPrompt = `You are a creative director for AI-generated content.
Given a user request, create a detailed design brief for image generation.

CRITICAL RULES:
1. ONLY use details EXPLICITLY mentioned in the current user request
2. Do NOT add themes, characters, or styles from previous requests
3. Extract the brand name if mentioned by the user - the brand name is crucial
4. If user says "white tshirt", create ONLY a white tshirt - do NOT add unrelated themes
5. Each request should be treated as a fresh, independent creation

BACKGROUND CONTEXT (use ONLY for understanding user's style preferences, NOT for adding content):
${context.profileContext || 'No previous context'}

Output a JSON object with:
{
  "concept": "Main creative concept based ONLY on current user request",
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

    try {
      // Use OpenRouter (Kimi K2) for design brief generation
      return await this.openRouter.generateJSON(`${systemPrompt}\n\nUser Request: ${userRequest}`, {
        temperature: 0.7,
        fallback
      });
    } catch (error) {
      console.error('Error generating design brief:', error);
      return fallback;
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

CRITICAL RULES:
- ONLY include elements explicitly described in the design brief
- Do NOT add characters, themes, or elements not mentioned in the brief
- If the brief says "white t-shirt with Velos logo", create ONLY that - no superheroes, no unrelated themes
- Focus on the SPECIFIC product/concept in the brief

${referenceInstruction}

Design Brief:
${JSON.stringify(designBrief, null, 2)}

Create prompts that:
1. Are highly detailed and specific to ONLY what's in the design brief
2. Include lighting, mood, and composition details
3. Vary in style/setting while maintaining brand consistency
4. Are optimized for ${designBrief.targetAspectRatio || '1:1'} aspect ratio
5. Follow ${designBrief.styleDirection || 'photorealistic'} style
6. Do NOT add any characters, themes, or styles not explicitly requested

Output a JSON array of prompt strings:
["prompt1", "prompt2", "prompt3", ...]`;

    try {
      // Use OpenRouter (Kimi K2) for prompt generation
      const result = await this.openRouter.generateJSON(systemPrompt, {
        temperature: 0.8,
        fallback: [designBrief.concept || 'A professional photograph']
      });
      // Handle both array and object responses
      return Array.isArray(result) ? result : [designBrief.concept || 'A professional photograph'];
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
      // Use OpenRouter (Kimi K2) for viral content generation
      return await this.openRouter.generateJSON(systemPrompt, {
        temperature: 0.8,
        fallback: this.getFallbackViralContent(designBrief)
      });
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

    // Viral hook - scroll-stopping first line
    const hook = brandName
      ? `This changes everything. ${brandName} just raised the bar. 🔥`
      : 'You have never seen anything like this before. ⚡';

    // Body - story/context
    const body = concept
      ? `${concept}\n\nEvery detail tells a story.`
      : 'When creativity meets AI magic, this is what happens.';

    // CTA - drive engagement
    const callToAction = brandName
      ? `Save this for later 🔖 Follow @${brandTag.toLowerCase()} for more ✨\nTag someone who needs to see this 👇`
      : 'Save this 🔖 Follow for more AI creations ✨\nDrop a 🔥 if you love it 👇';

    // Full description with proper structure
    const description = `${hook}\n\n${body}\n\n${callToAction}`;

    const brandedTags = brandName
      ? [brandTag.toLowerCase(), `${brandTag}style`.toLowerCase(), `${brandTag}official`.toLowerCase()]
      : ['velosai', 'aigenerated', 'aigeneratedart'];

    // PROPER HASHTAG STRING - 25+ hashtags for maximum reach
    const nicheHashtags = '#AIArt #AIGenerated #DigitalArt #GenerativeArt #AIArtCommunity #DigitalArtDaily';
    const mediumHashtags = '#ConceptArt #DigitalCreation #ArtOfTheDay #CreativeArt #ModernArt #FuturisticArt';
    const broadHashtags = '#Art #Design #Creative #Explore #Instagood #PhotoOfTheDay #InstaArt';
    const viralHashtags = '#Viral #Trending #FYP #ForYou #Discover';
    const brandHashtags = brandName ? `#${brandTag.toLowerCase()} #${brandTag}Style` : '#VelosAI #AIPowered';

    const hashtagString = `${nicheHashtags} ${mediumHashtags} ${broadHashtags} ${viralHashtags} ${brandHashtags}`;

    return {
      title,
      hook,
      description,
      shortCaption: hook, // Use the hook as short caption too
      callToAction,
      hashtags: {
        primary: ['viral', 'trending', 'explore', 'foryou', 'instagood', 'photooftheday'],
        secondary: ['aiart', 'digitalart', 'aigenerated', 'generativeart', 'aiartcommunity'],
        niche: ['conceptart', 'digitalcreation', 'futuristicart', 'modernart', 'creativeart'],
        branded: brandedTags
      },
      hashtagString,
      bestPostingTimes: ['9:00 AM', '12:00 PM', '7:00 PM'],
      viralScore: 7,
      viralTips: ['Post during peak hours (9AM, 12PM, 7PM)', 'Engage with comments in first 30 min', 'Use trending audio for Reels', 'Cross-post to Stories with poll sticker']
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
   * Generate brand-appropriate caption by ANALYZING the actual video with Gemini
   * Sends video to Gemini 3 Flash which can understand video content
   */
  async generateViralVideoContent(videoDescriptionOrUrl, context = {}) {
    const {
      platform = 'instagram',
      tone = 'brand', // 'brand', 'creator', 'marketing', 'story'
      niche = '',
      duration = 8,
      videoUrl = null // Actual video URL to analyze
    } = context;

    // Determine if we should analyze video or just use description
    const actualVideoUrl = videoUrl || (videoDescriptionOrUrl?.startsWith('http') ? videoDescriptionOrUrl : null);

    let videoAnalysis = null;

    // If we have a video URL, analyze it with Gemini
    if (actualVideoUrl) {
      try {
        console.log('🎬 [ContentEngine] Analyzing video with Gemini:', actualVideoUrl.slice(0, 50));
        videoAnalysis = await this.analyzeVideoWithGemini(actualVideoUrl);
        console.log('✅ [ContentEngine] Video analysis:', videoAnalysis?.summary?.slice(0, 100));
      } catch (error) {
        console.error('⚠️ [ContentEngine] Video analysis failed, using description:', error.message);
      }
    }

    const videoContext = videoAnalysis
      ? `VIDEO ANALYSIS (from actual video):
- Visual Content: ${videoAnalysis.summary}
- Key Elements: ${videoAnalysis.keyElements?.join(', ') || 'N/A'}
- Style: ${videoAnalysis.style || 'N/A'}
- Brand Elements: ${videoAnalysis.brandElements || 'N/A'}
- Mood: ${videoAnalysis.mood || 'N/A'}`
      : `VIDEO DESCRIPTION: ${videoDescriptionOrUrl}`;

    // Tone-specific instructions
    const toneGuides = {
      brand: `BRAND TONE GUIDELINES:
- Professional and polished
- Minimal emojis (1-2 max)
- Focus on brand value and identity
- No engagement bait ("tag a friend", "save this")
- Clean, elegant hashtags (5-8 max)
- Emphasize quality and expertise`,

      creator: `CREATOR TONE GUIDELINES:
- Casual and relatable
- Emojis welcome
- Engagement hooks encouraged
- CTAs like "save", "share", "follow"
- 15-20 hashtags for reach`,

      marketing: `MARKETING TONE GUIDELINES:
- Clear value proposition
- Professional but approachable
- Focus on benefits
- Subtle CTA (link in bio, learn more)
- 8-12 strategic hashtags`,

      story: `STORYTELLING TONE GUIDELINES:
- Narrative and emotional
- Draw viewer into the story
- Create connection
- Minimal hashtags (5-7)
- Focus on message over reach`
    };

    const systemPrompt = `You are a professional social media strategist for brands and businesses.
Analyze the video content and generate an appropriate caption for ${platform}.

${videoContext}

CONTEXT:
- Platform: ${platform}
- Tone: ${tone}
- Niche: ${niche || 'brand/business'}
- Duration: ~${duration} seconds

${toneGuides[tone] || toneGuides.brand}

OUTPUT FORMAT (JSON):
{
  "hook": "Opening line - concise, professional (under 60 chars)",
  "caption": "Full caption appropriate for the tone. For brand: clean and professional. For creator: engaging with emojis",
  "callToAction": "Appropriate CTA for the tone (or null for brand tone)",
  "hashtags": {
    "primary": ["3-5 most relevant hashtags for the content"],
    "secondary": ["3-5 supporting hashtags"],
    "branded": ["1-2 brand-specific if applicable"]
  },
  "hashtagString": "All hashtags as one string",
  "suggestedAudio": "Audio suggestion or 'Original audio'",
  "bestPostingTimes": ["optimal times"],
  "viralScore": 1-10,
  "tips": ["content-specific tips based on video analysis"]
}`;

    try {
      return await this.openRouter.generateJSON(systemPrompt, {
        temperature: 0.7,
        fallback: this.getFallbackVideoContent(videoDescriptionOrUrl, tone)
      });
    } catch (error) {
      console.error('Error generating video content:', error);
      return this.getFallbackVideoContent(videoDescriptionOrUrl, tone);
    }
  }

  /**
   * Analyze video content using OpenRouter + Gemini (multimodal)
   * Downloads video from S3 and sends as base64 to OpenRouter
   */
  async analyzeVideoWithGemini(videoUrl) {
    try {
      console.log('📥 [ContentEngine] Downloading video for analysis...');

      // Download video and convert to base64
      const response = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60s timeout for video download
        maxContentLength: 50 * 1024 * 1024 // 50MB max
      });

      const base64Video = Buffer.from(response.data).toString('base64');
      const dataUrl = `data:video/mp4;base64,${base64Video}`;

      console.log('🎬 [ContentEngine] Video downloaded, size:', Math.round(base64Video.length / 1024), 'KB');

      const prompt = `Analyze this video for social media caption generation.

Provide a JSON response:
{
  "summary": "Brief description of what happens in the video (2-3 sentences)",
  "keyElements": ["list", "of", "key", "visual", "elements"],
  "style": "visual style (cinematic, minimal, animated, professional, casual, etc.)",
  "brandElements": "any logos, text, brand colors visible (or 'none')",
  "mood": "emotional tone (elegant, energetic, calm, exciting, professional, etc.)",
  "contentType": "logo animation, product demo, testimonial, tutorial, etc.",
  "suggestedCategory": "marketing, entertainment, education, inspiration, etc."
}`;

      // Use OpenRouter with video support
      const result = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'video_url',
              video_url: { url: dataUrl }
            }
          ]
        }]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://velosapps.com',
          'X-Title': 'Velos Video Analysis'
        },
        timeout: 120000 // 2 min timeout for AI processing
      });

      const text = result.data?.choices?.[0]?.message?.content || '';
      console.log('✅ [ContentEngine] Video analysis complete');

      return safeJsonParse(text, {
        summary: 'Video content analysis unavailable',
        keyElements: [],
        style: 'professional',
        brandElements: 'none',
        mood: 'professional'
      });
    } catch (error) {
      console.error('❌ [ContentEngine] Video analysis error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fallback video content if AI fails - tone-aware
   */
  getFallbackVideoContent(videoDescription, tone = 'brand') {
    // Brand-appropriate fallback (professional, minimal)
    if (tone === 'brand') {
      return {
        hook: videoDescription?.slice(0, 60) || 'Crafted with precision.',
        caption: videoDescription || 'Where quality meets innovation.',
        callToAction: null,
        hashtags: {
          primary: ['brand', 'quality', 'design'],
          secondary: ['professional', 'creative'],
          branded: []
        },
        hashtagString: '#brand #quality #design #professional #creative',
        suggestedAudio: 'Original audio',
        bestPostingTimes: ['9:00 AM', '12:00 PM', '6:00 PM'],
        viralScore: 6,
        tips: ['Keep captions professional', 'Focus on brand value', 'Use high-quality thumbnails']
      };
    }

    // Creator-style fallback (engaging, emoji-heavy)
    const hook = 'Wait for it... 🔥';
    const caption = `${hook}\n\n${videoDescription || 'This is incredible ✨'}\n\nFollow for more! 👉`;
    const callToAction = 'Save this 🔖 Tag someone who needs to see this 👇';
    const hashtagString = '#reels #reelsviral #explorepage #viral #trending #fyp #foryou #reelsinstagram #viralreels #explore #instagood #instadaily #content #creator #aigenerated #aiart #videography #creative';

    return {
      hook,
      caption,
      callToAction,
      hashtags: {
        primary: ['viral', 'trending', 'fyp', 'foryou', 'explore'],
        secondary: ['reels', 'reelsviral', 'explorepage', 'reelsinstagram', 'viralreels'],
        branded: []
      },
      hashtagString,
      suggestedAudio: 'Original audio',
      bestPostingTimes: ['7:00 AM', '12:00 PM', '7:00 PM', '9:00 PM'],
      viralScore: 7,
      tips: ['Post during peak hours', 'Reply to comments quickly', 'Share to Stories', 'Use trending audio if possible']
    };
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
      // Use OpenRouter (Kimi K2) for prompt enhancement
      return await this.openRouter.generateText(systemPrompt, { temperature: 0.6 });
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
      // Use OpenRouter (Kimi K2) for edit prompt generation
      return await this.openRouter.generateText(systemPrompt, { temperature: 0.5 });
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
      // Use OpenRouter (Kimi K2) for memory extraction
      return await this.openRouter.generateJSON(systemPrompt, {
        temperature: 0.3,
        fallback: { memories: [], profileUpdates: {} }
      });
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