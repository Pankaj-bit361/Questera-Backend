const ImageController = require('../../functions/Image');


const imageController = new ImageController();


// Helper to fetch image from URL and convert to base64
async function fetchImageAsBase64(imageUrl) {
   try {
      console.log('📥 [VARIATIONS] Fetching reference image:', imageUrl);
      const response = await fetch(imageUrl);
      if (!response.ok) {
         console.error('❌ [VARIATIONS] Failed to fetch image:', response.status);
         return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      console.log('✅ [VARIATIONS] Image fetched, size:', base64.length, 'mimeType:', contentType);
      return { data: base64, mimeType: contentType };
   } catch (error) {
      console.error('❌ [VARIATIONS] Error fetching image:', error.message);
      return null;
   }
}


const createVariationsTool = {
   name: 'create_variations',
   description: 'Create multiple variations of an image with different styles or tweaks. Use when user wants alternatives or options. IMPORTANT: This will use the last generated image as reference to maintain the same person/subject.',
   parameters: {
      basePrompt: {
         type: 'string',
         required: true,
         description: 'The base prompt to create variations from'
      },
      count: {
         type: 'number',
         required: false,
         description: 'Number of variations (2-10). Default is 4'
      },
      variationType: {
         type: 'string',
         required: false,
         description: 'Type of variation: style, color, composition, lighting'
      }
   },

   execute: async (params, context) => {
      const { basePrompt, count = 4, variationType = 'style' } = params;
      const { userId, chatId, referenceImages, lastImageUrl } = context;

      if (!userId) {
         return { success: false, error: 'userId is required' };
      }

      // Build reference images array - prioritize lastImageUrl for variations
      let imagesToUse = [];

      // If we have a lastImageUrl (previously generated image), fetch it and use as reference
      if (lastImageUrl) {
         console.log('🖼️ [VARIATIONS] Using lastImageUrl as reference:', lastImageUrl);
         const fetchedImage = await fetchImageAsBase64(lastImageUrl);
         if (fetchedImage) {
            imagesToUse.push(fetchedImage);
         }
      }

      // Also include any reference images the user provided
      if (referenceImages && referenceImages.length > 0) {
         console.log('🖼️ [VARIATIONS] Adding', referenceImages.length, 'user reference images');
         imagesToUse = imagesToUse.concat(referenceImages);
      }

      console.log('🖼️ [VARIATIONS] Total reference images:', imagesToUse.length);

      if (imagesToUse.length === 0) {
         console.log('⚠️ [VARIATIONS] No reference images available - variations may not maintain same person');
      }

      const variations = [];
      const variationCount = Math.min(Math.max(count, 2), 10);

      const styleVariants = [
         'cinematic lighting, dramatic',
         'soft natural lighting, peaceful',
         'vibrant colors, energetic',
         'moody atmosphere, artistic',
         'golden hour lighting, warm tones',
         'studio lighting, professional',
         'neon glow, cyberpunk aesthetic',
         'vintage film look, retro',
         'high contrast, bold shadows',
         'dreamy soft focus, ethereal'
      ];

      for (let i = 0; i < variationCount; i++) {
         const variantPrompt = `${basePrompt}, ${styleVariants[i % styleVariants.length]}`;

         const mockReq = {
            body: {
               prompt: variantPrompt,
               userId,
               imageChatId: chatId,
               images: imagesToUse,  // Use the reference images!
               isEdit: false
            }
         };

         console.log(`🎨 [VARIATIONS] Generating variation ${i + 1}/${variationCount} with ${imagesToUse.length} reference images`);

         const result = await imageController.generateImages(mockReq, {});

         if (result.status === 200 && result.json.imageUrl) {
            variations.push({
               imageUrl: result.json.imageUrl,
               variant: styleVariants[i % styleVariants.length],
               index: i + 1
            });
         }
      }

      return {
         success: true,
         variations,
         count: variations.length,
         imageChatId: chatId,
         message: `Created ${variations.length} variations using the same reference image`
      };
   }
};


module.exports = createVariationsTool;

