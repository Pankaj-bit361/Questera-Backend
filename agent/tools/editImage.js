const ImageController = require('../../functions/Image');


const imageController = new ImageController();


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

      // PRIORITY: Always use lastImageUrl or imageUrl as the PRIMARY image to edit
      // Then ADD any referenceImages as additional context (e.g., showing what user wants)

      const primaryImageUrl = imageUrl || lastImageUrl;

      if (primaryImageUrl) {
         console.log('🖼️ [EDIT_IMAGE] Primary image to edit:', primaryImageUrl);
         imagesToEdit.push({ data: primaryImageUrl, mimeType: 'image/jpeg' });
      }

      // Add any reference images as additional context (but skip duplicates of primaryImageUrl)
      if (referenceImages && referenceImages.length > 0) {
         // Filter out reference images that are duplicates of the primary image
         const uniqueRefs = referenceImages.filter(ref => {
            // Skip if the reference data equals the primary image URL
            if (ref.data === primaryImageUrl) {
               console.log('🖼️ [EDIT_IMAGE] Skipping duplicate reference image (same as primary)');
               return false;
            }
            return true;
         });
         if (uniqueRefs.length > 0) {
            console.log('🖼️ [EDIT_IMAGE] Adding', uniqueRefs.length, 'unique reference images as context');
            imagesToEdit = [...imagesToEdit, ...uniqueRefs];
         }
      }

      // Fallback: If no primary image but have reference images, use those
      if (imagesToEdit.length === 0 && referenceImages && referenceImages.length > 0) {
         console.log('🖼️ [EDIT_IMAGE] No primary image, using referenceImages only');
         imagesToEdit = referenceImages;
      }

      console.log('🖼️ [EDIT_IMAGE] Final imagesToEdit count:', imagesToEdit.length);
      if (imagesToEdit.length > 0) {
         console.log('🖼️ [EDIT_IMAGE] First image data type:', typeof imagesToEdit[0].data);
         console.log('🖼️ [EDIT_IMAGE] First image data starts with:', imagesToEdit[0].data?.substring(0, 50));
      }

      if (imagesToEdit.length === 0) {
         return { success: false, error: 'No image provided to edit' };
      }

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

      return {
         success: true,
         imageUrl: result.json.imageUrl,
         images: result.json.images,
         imageChatId: result.json.imageChatId,
         creditsRemaining: result.json.creditsRemaining
      };
   }
};


module.exports = editImageTool;

