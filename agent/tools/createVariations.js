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
   description: `Create multiple variations of an image while maintaining the same subject/person/character.

WHEN TO USE:
- User wants MULTIPLE OPTIONS or ALTERNATIVES of same subject
- User says "give me variations", "show me options", "different versions"
- User wants same person in different poses/angles
- User wants same subject with different styles/lighting
- User wants same character in different outfits
- User wants same product in different scenes/backgrounds
- User says "front view, back view, side view" of same subject

WHEN NOT TO USE:
- User wants ONE specific new image → use generate_image instead
- User wants to EDIT an existing image → use edit_image instead
- User wants completely different subjects → use generate_image multiple times
- No reference image exists yet → use generate_image first to create base

KEY FEATURE: SUBJECT CONSISTENCY
- Uses the last generated image as reference automatically
- Maintains the SAME person/character/subject across all variations
- Perfect for character consistency, product shots, model poses
- Critical for "show me from different angles" requests

VARIATION TYPES:

1. "pose" or "angle" - Different angles/poses:
   - Front view, back view, left profile, right profile
   - Three-quarter view, full body, close-up portrait
   - Great for character sheets, model portfolios

2. "style" (default) - Different lighting/mood:
   - Cinematic, soft natural, vibrant, moody, golden hour
   - Studio lighting, neon glow, vintage film
   - Great for finding the right aesthetic

3. "outfit" or "clothing" - Different attire:
   - Casual, formal, athletic, elegant, vintage
   - Futuristic, traditional, minimalist
   - Great for fashion content, character design

4. "scene" or "background" - Different environments:
   - City street, forest, sci-fi, studio, beach
   - Rooftop, fantasy world, office, café
   - Great for placing same subject in different contexts

CUSTOM VARIANTS:
- Provide specific list of variations you want
- Overrides variationType when provided
- Example: ["holding coffee", "on laptop", "in meeting", "presenting"]

EXAMPLES:
- "Show me different poses" → pose variations of last image
- "Give me 4 style options" → style variations (lighting/mood)
- "Same person, different outfits" → outfit variations
- "Put them in different locations" → scene variations
- "Front, back, left, right views" → customVariants with specific angles

IMPORTANT:
- Requires a previous image to work (uses as reference)
- Generates 2-10 variations (default 4)
- More variations = more generation time
- All variations maintain subject consistency`,

   parameters: {
      basePrompt: {
         type: 'string',
         required: true,
         description: 'Base description of the subject. The variation modifiers will be appended to this.',
         example: 'A professional woman in her 30s with brown hair, confident expression'
      },
      count: {
         type: 'number',
         required: false,
         description: 'Number of variations to generate (2-10). More = longer wait. Default is 4.',
         example: 4
      },
      variationType: {
         type: 'string',
         required: false,
         description: 'Type: "pose" (angles), "style" (lighting/mood), "outfit" (clothing), "scene" (backgrounds). Default: "style"',
         example: 'pose'
      },
      customVariants: {
         type: 'array',
         required: false,
         description: 'Custom variation list. Overrides variationType. Each item is appended to basePrompt.',
         example: ['front view facing camera', 'back view from behind', 'left side profile', 'right side profile']
      },
      aspectRatio: {
         type: 'string',
         required: false,
         description: 'Aspect ratio for all variations. Use "4:5" for Instagram feed/carousel (RECOMMENDED), "1:1" for square, "9:16" for stories/reels. Default: original ratio.',
         example: '4:5'
      },
      forInstagram: {
         type: 'boolean',
         required: false,
         description: 'If true, automatically uses 4:5 aspect ratio optimized for Instagram feed posts and carousels. Overrides aspectRatio.',
         example: true
      }
   },

   execute: async (params, context) => {
      const { basePrompt, count = 4, variationType = 'style', customVariants, aspectRatio, forInstagram } = params;

      // Determine aspect ratio - forInstagram takes priority
      const finalAspectRatio = forInstagram ? '4:5' : aspectRatio;
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

      // Log aspect ratio usage
      if (finalAspectRatio) {
         console.log('🖼️ [VARIATIONS] Using aspect ratio:', finalAspectRatio, forInstagram ? '(Instagram optimized)' : '');
      }

      for (let i = 0; i < variationCount; i++) {
         const variantModifier = variantsToUse[i % variantsToUse.length];

         // Build prompt with aspect ratio instruction if specified
         let variantPrompt = `${basePrompt}, ${variantModifier}`;
         if (finalAspectRatio) {
            // Add aspect ratio to prompt for better generation
            const ratioHint = finalAspectRatio === '4:5' ? ', portrait composition optimized for Instagram feed'
               : finalAspectRatio === '9:16' ? ', vertical composition optimized for Instagram stories/reels'
               : finalAspectRatio === '1:1' ? ', square composition'
               : finalAspectRatio === '16:9' ? ', widescreen cinematic composition'
               : '';
            variantPrompt += ratioHint;
         }

         const mockReq = {
            body: {
               prompt: variantPrompt,
               userId,
               imageChatId: chatId,
               images: imagesToUse,  // Use the reference images!
               isEdit: false,
               aspectRatio: finalAspectRatio // Pass aspect ratio to image generator
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
      const aspectNote = finalAspectRatio ? ` in ${finalAspectRatio} aspect ratio` : '';
      return {
         success: true,
         variations,
         count: variations.length,
         imageChatId: chatId,
         variationType: typeLabel,
         aspectRatio: finalAspectRatio,
         forInstagram: !!forInstagram,
         message: `Created ${variations.length} ${typeLabel} variations${aspectNote} using the same reference image`,
         // Hint for agent to continue with caption/scheduling
         nextSteps: forInstagram ? ['Generate a viral caption', 'Schedule as carousel post'] : []
      };
   }
};


module.exports = createVariationsTool;

