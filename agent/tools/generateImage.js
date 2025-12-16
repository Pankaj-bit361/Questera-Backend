const ImageController = require('../../functions/Image');
const { CognitiveNarrator, ASPECT_RATIO_REASONS, STYLE_REASONS } = require('../CognitiveNarrator');


const imageController = new ImageController();
const narrator = new CognitiveNarrator();


const generateImageTool = {
   name: 'generate_image',
   description: 'Generate new AI image(s) from a text prompt. Use this when user wants to create a new image.',
   parameters: {
      prompt: {
         type: 'string',
         required: true,
         description: 'Detailed prompt describing the image to generate'
      },
      count: {
         type: 'number',
         required: false,
         description: 'Number of images to generate (1-4). Default is 1'
      },
      style: {
         type: 'string',
         required: false,
         description: 'Style like cinematic, anime, photorealistic, etc'
      },
      aspectRatio: {
         type: 'string',
         required: false,
         description: 'Aspect ratio like 1:1, 16:9, 9:16, 4:3, 3:4'
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

