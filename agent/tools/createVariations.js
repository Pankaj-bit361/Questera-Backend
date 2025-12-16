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
   description: 'Create multiple variations of an image. Use when user wants alternatives, options, or different poses/angles. IMPORTANT: This will use the last generated image as reference to maintain the same person/subject.',
   parameters: {
      basePrompt: {
         type: 'string',
         required: true,
         description: 'The base prompt describing the subject/person to create variations from'
      },
      count: {
         type: 'number',
         required: false,
         description: 'Number of variations (2-10). Default is 4'
      },
      variationType: {
         type: 'string',
         required: false,
         description: 'Type of variation: "pose" (for different angles/poses like front, back, left, right), "style" (for lighting/mood), "outfit" (for different clothing), "scene" (for different backgrounds). Default is "style"'
      },
      customVariants: {
         type: 'array',
         required: false,
         description: 'Custom list of specific variations to generate (e.g., ["front view", "back view", "left profile", "right profile", "full body"]). If provided, overrides variationType.'
      }
   },

   execute: async (params, context) => {
      const { basePrompt, count = 4, variationType = 'style', customVariants } = params;
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

      // Different variant types based on user request
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

      const poseVariants = [
         'front view, facing camera directly',
         'back view, showing from behind',
         'left profile view, side angle facing left',
         'right profile view, side angle facing right',
         'three-quarter view, slightly angled',
         'full body shot, head to toe visible',
         'close-up portrait, face focus',
         'over the shoulder view',
         'looking up angle, low camera',
         'looking down angle, high camera'
      ];

      const outfitVariants = [
         'wearing casual streetwear',
         'wearing formal business attire',
         'wearing sporty athletic wear',
         'wearing elegant evening dress',
         'wearing vintage retro clothing',
         'wearing futuristic cyberpunk outfit',
         'wearing cozy winter clothes',
         'wearing summer beach outfit',
         'wearing traditional cultural attire',
         'wearing minimalist modern fashion'
      ];

      const sceneVariants = [
         'in a modern city street',
         'in a lush forest setting',
         'in a futuristic sci-fi environment',
         'in a cozy indoor studio',
         'on a beach at sunset',
         'in an urban rooftop setting',
         'in a mystical fantasy world',
         'in a sleek modern office',
         'in a vintage cafe setting',
         'in a neon-lit night scene'
      ];

      // Select which variants to use - prioritize customVariants, then variationType
      let variantsToUse;
      if (customVariants && customVariants.length > 0) {
         variantsToUse = customVariants;
         console.log('🎨 [VARIATIONS] Using custom variants:', customVariants);
      } else {
         switch (variationType.toLowerCase()) {
            case 'pose':
            case 'poses':
            case 'angle':
            case 'angles':
               variantsToUse = poseVariants;
               break;
            case 'outfit':
            case 'clothing':
            case 'clothes':
               variantsToUse = outfitVariants;
               break;
            case 'scene':
            case 'background':
            case 'environment':
               variantsToUse = sceneVariants;
               break;
            default:
               variantsToUse = styleVariants;
         }
         console.log('🎨 [VARIATIONS] Using variationType:', variationType, '→', variantsToUse.slice(0, 3).join(', '), '...');
      }

      for (let i = 0; i < variationCount; i++) {
         const variantModifier = variantsToUse[i % variantsToUse.length];
         const variantPrompt = `${basePrompt}, ${variantModifier}`;

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
               variant: variantModifier,
               index: i + 1
            });
         }
      }

      const typeLabel = customVariants ? 'custom' : variationType;
      return {
         success: true,
         variations,
         count: variations.length,
         imageChatId: chatId,
         variationType: typeLabel,
         message: `Created ${variations.length} ${typeLabel} variations using the same reference image`
      };
   }
};


module.exports = createVariationsTool;

