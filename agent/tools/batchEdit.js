const ImageController = require('../../functions/Image');
const axios = require('axios');

const imageController = new ImageController();

/**
 * Fetch image from URL and convert to base64
 */
async function fetchImageAsBase64(imageUrl) {
   try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(response.data).toString('base64');
      const mimeType = response.headers['content-type'] || 'image/jpeg';
      return {
         data: base64,
         mimeType: mimeType
      };
   } catch (error) {
      console.error('❌ [BATCH_EDIT] Failed to fetch image:', imageUrl, error.message);
      return null;
   }
}

const batchEditTool = {
   name: 'batch_edit',
   description: `Edit MULTIPLE images at once with the same transformation.

WHEN TO USE:
- User wants to convert MULTIPLE existing images to a different aspect ratio
- User says "change ALL the images", "convert those 4 images", "edit the variations"
- User previously generated variations and wants to modify ALL of them
- User wants batch processing of multiple images

WHEN NOT TO USE:
- User wants to edit only ONE image → use edit_image instead
- User wants to create NEW variations → use create_variations instead
- User wants completely different edits for each image → use edit_image multiple times

KEY FEATURE:
This tool looks at conversation HISTORY to find previously generated images.
If user says "convert the 4 images you created", it will find those 4 image URLs from history.

EXAMPLES:
- "Convert the 4 images to Instagram aspect ratio" → finds 4 images from history, edits each to 4:5
- "Make all variations fit Instagram" → batch converts all recent variations
- "Change those images to portrait mode" → applies portrait transformation to all`,

   parameters: {
      editPrompt: {
         type: 'string',
         required: true,
         description: 'What transformation to apply to ALL images. Keep it focused on the change.',
         example: 'Convert to 4:5 portrait aspect ratio for Instagram'
      },
      imageUrls: {
         type: 'array',
         required: false,
         description: 'Array of image URLs to edit. If not provided, will extract from conversation history.',
         example: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg']
      },
      aspectRatio: {
         type: 'string',
         required: false,
         description: 'Target aspect ratio: "4:5" for Instagram feed, "9:16" for stories, "1:1" for square',
         example: '4:5'
      },
      forInstagram: {
         type: 'boolean',
         required: false,
         description: 'If true, automatically uses 4:5 aspect ratio optimized for Instagram.',
         example: true
      },
      count: {
         type: 'number',
         required: false,
         description: 'How many recent images to edit from history. Default: 4',
         example: 4
      }
   },

   execute: async (params, context) => {
      const { editPrompt, aspectRatio, forInstagram, count = 4 } = params;
      const { userId, chatId, history } = context;

      const finalAspectRatio = forInstagram ? '4:5' : aspectRatio;

      console.log('🖼️ [BATCH_EDIT] Starting batch edit...');
      console.log('🖼️ [BATCH_EDIT] Edit prompt:', editPrompt);
      console.log('🖼️ [BATCH_EDIT] Aspect ratio:', finalAspectRatio);
      console.log('🖼️ [BATCH_EDIT] Count:', count);

      if (!userId) {
         return { success: false, error: 'userId is required' };
      }

      // Get image URLs - either from params or from history
      let imageUrls = params.imageUrls || [];

      if (imageUrls.length === 0 && history && history.length > 0) {
         // Extract image URLs from history (assistant messages with images)
         console.log('🔍 [BATCH_EDIT] Searching history for images...');
         
         const historyImages = history
            .filter(msg => msg.role === 'assistant' && msg.imageUrl)
            .map(msg => msg.imageUrl)
            .slice(-count); // Get last N images

         imageUrls = historyImages;
         console.log('🔍 [BATCH_EDIT] Found', imageUrls.length, 'images in history');
      }

      if (imageUrls.length === 0) {
         return { 
            success: false, 
            error: 'No images found to edit',
            message: 'I could not find any images to edit. Please specify the image URLs or generate some images first.'
         };
      }

      console.log('🖼️ [BATCH_EDIT] Will edit', imageUrls.length, 'images');

      const editedImages = [];
      const errors = [];

      // Edit each image
      for (let i = 0; i < imageUrls.length; i++) {
         const imageUrl = imageUrls[i];
         console.log(`🎨 [BATCH_EDIT] Editing image ${i + 1}/${imageUrls.length}: ${imageUrl.slice(-40)}`);

         try {
            // Fetch image as base64
            const fetchedImage = await fetchImageAsBase64(imageUrl);
            if (!fetchedImage) {
               errors.push({ index: i, url: imageUrl, error: 'Failed to fetch image' });
               continue;
            }

            // Build edit prompt with aspect ratio
            let enhancedPrompt = editPrompt;
            if (finalAspectRatio) {
               const ratioHint = finalAspectRatio === '4:5' 
                  ? 'Reframe to 4:5 portrait aspect ratio for Instagram feed. '
                  : finalAspectRatio === '9:16' 
                  ? 'Reframe to 9:16 vertical aspect ratio for Instagram stories. '
                  : finalAspectRatio === '1:1'
                  ? 'Reframe to 1:1 square aspect ratio. '
                  : '';
               enhancedPrompt = ratioHint + editPrompt;
            }

            const mockReq = {
               body: {
                  prompt: enhancedPrompt,
                  userId,
                  imageChatId: chatId,
                  images: [fetchedImage],
                  isEdit: true,
                  aspectRatio: finalAspectRatio,
                  skipSaveMessages: true
               }
            };

            const result = await imageController.generateImages(mockReq, {});

            if (result.status === 200 && result.json.imageUrl) {
               editedImages.push({
                  originalUrl: imageUrl,
                  editedUrl: result.json.imageUrl,
                  index: i + 1
               });
            } else {
               errors.push({ index: i, url: imageUrl, error: result.json?.error || 'Edit failed' });
            }
         } catch (error) {
            console.error(`❌ [BATCH_EDIT] Error editing image ${i + 1}:`, error.message);
            errors.push({ index: i, url: imageUrl, error: error.message });
         }
      }

      const aspectNote = finalAspectRatio ? ` to ${finalAspectRatio} aspect ratio` : '';
      
      return {
         success: editedImages.length > 0,
         editedImages,
         count: editedImages.length,
         errors: errors.length > 0 ? errors : undefined,
         aspectRatio: finalAspectRatio,
         message: `Edited ${editedImages.length}/${imageUrls.length} images${aspectNote}`,
         // For schedule_post to use
         imageUrls: editedImages.map(img => img.editedUrl)
      };
   }
};

module.exports = batchEditTool;

