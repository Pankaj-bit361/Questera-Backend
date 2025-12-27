const ImageController = require('../../functions/Image');
const { CognitiveNarrator } = require('../CognitiveNarrator');


const imageController = new ImageController();
const narrator = new CognitiveNarrator();


const editImageTool = {
   name: 'edit_image',
   description: `Edit or modify an existing image using AI-powered inpainting and transformation.

WHEN TO USE:
- User wants to CHANGE or MODIFY an existing image
- User says "edit", "change", "fix", "adjust", "modify", "update" the image
- User wants to add or remove elements from an image
- User wants to change colors, lighting, style of existing image
- User uploaded an image and wants modifications
- User says "make it more...", "add...", "remove...", "change the..."

WHEN NOT TO USE:
- User wants a completely NEW image → use generate_image instead
- User wants multiple variations with same subject → use create_variations instead
- User hasn't generated or uploaded any image yet → use generate_image first
- User just wants to post/schedule the current image → use schedule_post instead

IMAGE SELECTION PRIORITY:
1. If user uploaded reference images → uses those (user explicitly chose what to edit)
2. If imageUrl parameter provided → uses that specific image
3. If neither → uses the last generated image from conversation

EDITING CAPABILITIES:
- Style transfer: "make it look like a watercolor painting"
- Color changes: "change the background to blue"
- Element addition: "add a sunset in the background"
- Element removal: "remove the person on the left"
- Lighting changes: "make it brighter", "add dramatic shadows"
- Expression/pose tweaks: "make her smile", "change to side profile"
- Background swap: "put them in a coffee shop instead"
- ASPECT RATIO CONVERSION: "make it instagram ready" → converts to 4:5 portrait

INSTAGRAM-READY CONVERSION (CRITICAL):
When user says "instagram ready", "fit in frame", or "correct aspect ratio":
- Use forInstagram=true OR aspectRatio="4:5" for feed posts
- Use aspectRatio="9:16" for stories/reels
- The AI will intelligently reframe and extend the image

EXAMPLES:
- "Make the background darker" → adjusts lighting/mood
- "Add a logo in the corner" → composites new element
- "Change her dress to red" → color modification
- "Make it look more professional" → style enhancement
- "Remove the text" → element removal
- "Add snow falling" → environmental effect
- "Make this instagram ready" → uses forInstagram=true, converts to 4:5
- "Convert to portrait for instagram" → uses aspectRatio="4:5"

TIPS:
- Be specific about WHAT to change and HOW
- The more detailed the edit prompt, the better results
- Original composition is preserved while applying changes
- Works best with clear, focused edit instructions

IMPORTANT:
- Always preserves the original image's core composition
- Edits are applied selectively, not regenerating entire image
- If no image exists to edit, will return an error`,

   parameters: {
      editPrompt: {
         type: 'string',
         required: true,
         description: 'Clear description of what changes to make. Be specific about what to change and how.',
         example: 'Change the background to a modern office setting with large windows and natural lighting'
      },
      imageUrl: {
         type: 'string',
         required: false,
         description: 'URL of specific image to edit. Leave empty to use the last generated image or user-uploaded reference.',
         example: 'https://storage.example.com/images/abc123.jpg'
      },
      aspectRatio: {
         type: 'string',
         required: false,
         description: 'Change aspect ratio. Use "4:5" for Instagram feed, "9:16" for stories/reels, "1:1" for square, "16:9" for landscape.',
         example: '4:5'
      },
      forInstagram: {
         type: 'boolean',
         required: false,
         description: 'If true, automatically optimizes for Instagram with 4:5 portrait aspect ratio.',
         example: true
      }
   },

   execute: async (params, context) => {
      const { editPrompt, imageUrl, aspectRatio, forInstagram } = params;
      const finalAspectRatio = forInstagram ? '4:5' : aspectRatio;
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

      // Build enhanced prompt with aspect ratio if specified
      let enhancedPrompt = editPrompt;
      if (finalAspectRatio) {
         const ratioHint = finalAspectRatio === '4:5' ? 'Reframe and crop the image to 4:5 portrait aspect ratio, optimized for Instagram feed. '
            : finalAspectRatio === '9:16' ? 'Reframe and crop the image to 9:16 vertical aspect ratio, optimized for Instagram stories/reels. '
            : finalAspectRatio === '1:1' ? 'Reframe and crop the image to 1:1 square aspect ratio. '
            : finalAspectRatio === '16:9' ? 'Reframe and crop the image to 16:9 widescreen aspect ratio. '
            : '';
         enhancedPrompt = ratioHint + editPrompt;
         console.log('🖼️ [EDIT_IMAGE] Using aspect ratio:', finalAspectRatio, forInstagram ? '(Instagram optimized)' : '');
      }

      const mockReq = {
         body: {
            prompt: enhancedPrompt,
            userId,
            imageChatId: chatId,
            images: imagesToEdit,
            isEdit: true,
            aspectRatio: finalAspectRatio, // Pass to image generator
            skipSaveMessages: true // Agent route handles message saving for correct order
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

