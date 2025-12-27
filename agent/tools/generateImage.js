const ImageController = require('../../functions/Image');
const { CognitiveNarrator, ASPECT_RATIO_REASONS, STYLE_REASONS } = require('../CognitiveNarrator');


const imageController = new ImageController();
const narrator = new CognitiveNarrator();


const generateImageTool = {
   name: 'generate_image',
   description: `Generate new AI image(s) from a text prompt.

WHEN TO USE:
- User wants to create a NEW image from scratch
- User says "create", "generate", "make", "design" an image
- User describes a visual scene, person, product, or concept
- User wants marketing visuals, social media graphics, or creative content

WHEN NOT TO USE:
- User wants to EDIT an existing image → use edit_image instead
- User wants multiple VARIATIONS of same subject → use create_variations instead
- User just wants to chat or ask questions → use reply instead
- User wants to schedule/post → use schedule_post instead

PROMPTING TIPS:
- Include subject, environment, lighting, mood, and style for best results
- Mention aspect ratio in prompt if important (e.g., "16:9 landscape shot")
- Add quality keywords: "professional photography", "8k quality", "detailed"
- For people: describe pose, expression, clothing, background
- For products: describe angle, lighting setup, context

REFERENCE IMAGES:
- If user uploaded reference images, they will be used automatically for face/style consistency
- Great for "create an image of ME doing X" requests
- Reference images help maintain same person/character across generations

EXAMPLES:
- "A cyberpunk cityscape at night with neon signs" → generates sci-fi urban scene
- "Professional headshot of a woman, studio lighting" → generates portrait
- "Product shot of sneakers on marble, dramatic lighting" → generates product photo
- "Create a post about my coffee shop" + reference image → branded content with consistent style

IMPORTANT:
- Default aspect ratio is 1:1 (square) if not specified
- For Instagram feed: use 1:1 or 4:5
- For Instagram stories/reels: use 9:16
- For YouTube thumbnails: use 16:9
- Count is 1-4 images per generation`,

   parameters: {
      prompt: {
         type: 'string',
         required: true,
         description: 'Detailed prompt describing the image to generate. Include subject, style, lighting, mood.',
         example: 'A professional woman in business attire, modern office background, soft natural lighting, confident pose, photorealistic style'
      },
      count: {
         type: 'number',
         required: false,
         description: 'Number of images to generate (1-4). Default is 1. Use higher count when user wants options.',
         example: 2
      },
      style: {
         type: 'string',
         required: false,
         description: 'Visual style: cinematic, anime, photorealistic, illustration, watercolor, oil-painting, 3d-render, minimalist, vintage, neon',
         example: 'cinematic'
      },
      aspectRatio: {
         type: 'string',
         required: false,
         description: 'Aspect ratio. Use 1:1 for Instagram feed, 9:16 for stories/reels, 16:9 for YouTube/banners, 4:5 for portrait posts',
         example: '9:16'
      }
   },

   execute: async (params, context) => {
      const { prompt, count = 1, style, aspectRatio } = params;
      const { userId, chatId, referenceImages, lastImageUrl } = context;

      console.log('🖼️ [GENERATE_IMAGE] Starting generation...');
      console.log('🖼️ [GENERATE_IMAGE] referenceImages count:', referenceImages?.length || 0);
      console.log('🖼️ [GENERATE_IMAGE] lastImageUrl:', lastImageUrl || 'none');

      if (!userId) {
         return { success: false, error: 'userId is required' };
      }

      // Build images array: start with referenceImages, add lastImageUrl if available
      let imagesToUse = [...(referenceImages || [])];

      // If we have a lastImageUrl and no reference images, use lastImageUrl as reference
      // This allows "make same photo in library" type requests to work
      if (lastImageUrl && imagesToUse.length === 0) {
         console.log('🖼️ [GENERATE_IMAGE] Using lastImageUrl as reference');
         imagesToUse.push({ data: lastImageUrl, mimeType: 'image/jpeg' });
      }

      console.log('🖼️ [GENERATE_IMAGE] Final images count:', imagesToUse.length);

      // Generate cognitive narration (thinking steps)
      const thinkingSteps = narrator.narrateImageGeneration(params, context);

      const mockReq = {
         body: {
            prompt,
            userId,
            imageChatId: chatId,
            images: imagesToUse,
            isEdit: false,
            style,
            aspectRatio,
            skipSaveMessages: true // Agent route handles message saving for correct order
         }
      };

      const result = await imageController.generateImages(mockReq, {});

      if (result.status !== 200) {
         return { success: false, error: result.json?.error || 'Generation failed' };
      }

      // Build opinionated reasoning (micro-decisions)
      const decisions = [];

      if (aspectRatio) {
         const reason = ASPECT_RATIO_REASONS[aspectRatio];
         if (reason) {
            decisions.push({ type: 'aspectRatio', value: aspectRatio, reason });
         }
      }

      if (style) {
         const reason = STYLE_REASONS[style.toLowerCase()];
         if (reason) {
            decisions.push({ type: 'style', value: style, reason });
         } else {
            decisions.push({ type: 'style', value: style, reason: `Applied ${style} style for distinctive visual character` });
         }
      }

      if (imagesToUse.length > 0) {
         decisions.push({
            type: 'reference',
            value: `${imagesToUse.length} image${imagesToUse.length > 1 ? 's' : ''}`,
            reason: 'Used your reference for face/style consistency'
         });
      }

      // Generate smart suggestions for iteration
      const suggestions = [
         'Want me to try a bolder, more vibrant version?',
         'I can create a more minimal composition if you prefer.',
         'Should I add text overlay for marketing use?'
      ];

      return {
         success: true,
         imageUrl: result.json.imageUrl,
         images: result.json.images,
         imageChatId: result.json.imageChatId,
         creditsRemaining: result.json.creditsRemaining,
         // Cognitive Layer - makes the agent feel smart
         cognitive: {
            thinkingSteps,
            decisions,
            suggestions,
            persona: 'creative'
         }
      };
   }
};


module.exports = generateImageTool;

