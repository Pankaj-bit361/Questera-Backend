const ImageController = require('../../functions/Image');
const { CognitiveNarrator } = require('../CognitiveNarrator');


const imageController = new ImageController();
const narrator = new CognitiveNarrator();


const editImageTool = {
   name: 'edit_image',
   description: 'Edit or modify an existing image. Use when user wants to change something in a previously generated image or an uploaded reference image.',
   parameters: {
      editPrompt: {
         type: 'string',
         required: true,
         description: 'Description of what changes to make to the image'
      },
      imageUrl: {
         type: 'string',
         required: false,
         description: 'URL of image to edit. If not provided, uses the last generated image or reference image'
      }
   },

   execute: async (params, context) => {
      const { editPrompt, imageUrl } = params;
      const { userId, chatId, referenceImages, lastImageUrl } = context;

      console.log('🖼️ [EDIT_IMAGE] Starting edit...');
      console.log('🖼️ [EDIT_IMAGE] editPrompt:', editPrompt);
      console.log('🖼️ [EDIT_IMAGE] imageUrl param:', imageUrl);
      console.log('🖼️ [EDIT_IMAGE] lastImageUrl context:', lastImageUrl);
      console.log('🖼️ [EDIT_IMAGE] referenceImages count:', referenceImages?.length || 0);

      if (!userId) {
         return { success: false, error: 'userId is required' };
      }

      let imagesToEdit = [];
      let imageSource = 'unknown';

      // PRIORITY ORDER:
      // 1. If user uploaded referenceImages → Use ONLY those (user explicitly chose what to edit)
      // 2. If NO referenceImages → Use lastImageUrl (user said "edit this" without uploading)

      if (referenceImages && referenceImages.length > 0) {
         // User uploaded reference images - use ONLY those, ignore lastImageUrl
         console.log('🖼️ [EDIT_IMAGE] User provided', referenceImages.length, 'reference images - using those');
         imagesToEdit = referenceImages;
         imageSource = 'uploaded';
      } else if (imageUrl) {
         // Agent specified a specific URL to edit
         console.log('🖼️ [EDIT_IMAGE] Using agent-specified imageUrl:', imageUrl);
         imagesToEdit.push({ data: imageUrl, mimeType: 'image/jpeg' });
         imageSource = 'specified';
      } else if (lastImageUrl) {
         // No reference images, use the last generated image
         console.log('🖼️ [EDIT_IMAGE] No reference images, using lastImageUrl:', lastImageUrl);
         imagesToEdit.push({ data: lastImageUrl, mimeType: 'image/jpeg' });
         imageSource = 'previous';
      }

      console.log('🖼️ [EDIT_IMAGE] Final imagesToEdit count:', imagesToEdit.length);
      if (imagesToEdit.length > 0) {
         console.log('🖼️ [EDIT_IMAGE] First image data type:', typeof imagesToEdit[0].data);
         console.log('🖼️ [EDIT_IMAGE] First image data starts with:', imagesToEdit[0].data?.substring(0, 50));
      }

      if (imagesToEdit.length === 0) {
         return { success: false, error: 'No image provided to edit' };
      }

      // Generate cognitive narration (thinking steps)
      const thinkingSteps = narrator.narrateImageEdit(params, context);

      const mockReq = {
         body: {
            prompt: editPrompt,
            userId,
            imageChatId: chatId,
            images: imagesToEdit,
            isEdit: true
         }
      };

      console.log('🖼️ [EDIT_IMAGE] Calling generateImages with', imagesToEdit.length, 'images');
      const result = await imageController.generateImages(mockReq, {});

      if (result.status !== 200) {
         return { success: false, error: result.json?.error || 'Edit failed' };
      }

      // Build opinionated reasoning (micro-decisions)
      const decisions = [];

      if (imageSource === 'uploaded') {
         decisions.push({
            type: 'source',
            value: `${imagesToEdit.length} uploaded image${imagesToEdit.length > 1 ? 's' : ''}`,
            reason: 'Using your uploaded images as the base for editing'
         });
      } else if (imageSource === 'previous') {
         decisions.push({
            type: 'source',
            value: 'last generated image',
            reason: 'Editing the image I just created for you'
         });
      }

      decisions.push({
         type: 'preservation',
         value: 'selective edit',
         reason: 'Keeping the original composition intact while applying only the requested changes'
      });

      // Generate smart suggestions for iteration
      const suggestions = [
         'Want me to make a more dramatic version of this edit?',
         'I can undo and try a different approach if you prefer.',
         'Should I apply the same edit to create variations?'
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
            persona: 'editor'
         }
      };
   }
};


module.exports = editImageTool;

