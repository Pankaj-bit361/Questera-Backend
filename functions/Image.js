const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Image = require('../models/image');
const ImageMessage = require('../models/imageMessage');
const { ASPECT_RATIOS, IMAGE_SIZES, STYLES } = require('../enums/imageEnums');
const CreditsController = require('./Credits');
const creditsController = new CreditsController();

// Default project settings
const DEFAULT_PROJECT_SETTINGS = {
    aspectRatio: 'auto',
    imageSize: '2K',
    style: 'none',
    instructions: '',
    temperature: 1,
    topP: 1,
};

class ImageController {
    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });
        this.model = 'gemini-3-pro-image-preview'; // Verify this model name is correct for your access

        // Initialize S3 client
        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    }

    /**
     * Upload image to S3
     */
    async uploadToS3(buffer, mimeType) {
        const extension = mimeType?.split('/')[1] || 'png';
        const fileName = `images/${uuidv4()}.${extension}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: mimeType,
        }));

        return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    async generateImages(req, res) {
        try {
            console.log('🚀 [GENERATE] Starting image generation...');
            console.log('📥 [GENERATE] Request body keys:', Object.keys(req.body));
            console.log('📥 [GENERATE] Has images param:', !!req.body.images);
            console.log('📥 [GENERATE] Has referenceImages param:', !!req.body.referenceImages);
            console.log('📥 [GENERATE] Images count:', req.body.images?.length || 0);
            console.log('📥 [GENERATE] ReferenceImages count:', req.body.referenceImages?.length || 0);

            let {
                prompt,
                originalMessage, // Original user message (before enhancement) for UI display
                userId,
                imageChatId,
                images,
                isEdit, // Flag to indicate this is an edit operation
                aspectRatio: aspectRatioOverride,
                imageSize: imageSizeOverride,
                style: styleOverride,
                viralContent, // Viral content (hashtags, description) from orchestrator
            } = req.body;

        imageSizeOverride = '4K';
            if (!prompt) {
                return { status: 400, json: { error: 'Prompt is required' } };
            }
            if (!userId) {
                return { status: 400, json: { error: 'User ID is required' } };
            }

            // Check if user has enough credits
            console.log('💳 [GENERATE] Checking credits for user:', userId);
            const hasCredits = await creditsController.hasCredits(userId, 1);
            if (!hasCredits) {
                console.log('❌ [GENERATE] Insufficient credits for user:', userId);
                return {
                    status: 402, // Payment Required
                    json: {
                        error: 'Insufficient credits',
                        code: 'INSUFFICIENT_CREDITS',
                        message: 'You don\'t have enough credits. Please upgrade your plan or wait for your credits to reset.',
                    }
                };
            }
            console.log('✅ [GENERATE] Credit check passed');

            console.log('📋 [GENERATE] Prompt:', prompt);
            console.log('📋 [GENERATE] Overrides:', { aspectRatioOverride, imageSizeOverride, styleOverride });

            let projectSettings = {};
            let existingConversation = null;

            if (imageChatId) {
                console.log('🔍 [GENERATE] Loading existing conversation:', imageChatId);
                existingConversation = await Image.findOne({ imageChatId });
                if (existingConversation?.imageSettings) {
                    projectSettings = {
                        ...existingConversation.imageSettings.toObject(),
                    };
                    console.log('📋 [GENERATE] Project settings from DB:', projectSettings);
                }
            }

            const finalSettings = {
                ...projectSettings,
                ...(aspectRatioOverride && { aspectRatio: aspectRatioOverride }),
                ...(imageSizeOverride && { imageSize: '4K' }),
                ...(styleOverride && { style: styleOverride }),
            };

            console.log('⚙️ [GENERATE] Final settings:', finalSettings);

            // FIX: Filter out 'auto' aspect ratio and invalid image sizes
            // The API expects specific strings for aspect ratio. 'auto' is not valid.
            const imageConfig = {};

            if (finalSettings.aspectRatio && finalSettings.aspectRatio !== 'auto') {
                imageConfig.aspectRatio = finalSettings.aspectRatio;
            }

            // Note: Gemini API might not support 'imageSize' directly as '2K'/'4K' in basic config. 
            // Usually it infers from aspect ratio or takes width/height. 
            // We'll pass it if it's not the default enum strings just in case, or map it if you have specific mapping logic.
            // For now, we'll exclude strictly non-standard sizes to avoid errors, or rely on API ignoring it.
            // But since the error was specifically about aspect_ratio, we fixed that above.

            const config = {
                responseModalities: ['IMAGE', 'TEXT'],
                ...(finalSettings.temperature && { temperature: finalSettings.temperature }),
                ...(finalSettings.topP && { topP: finalSettings.topP }),
                imageConfig: imageConfig,
                ...(finalSettings.instructions && { systemInstruction: [{ text: finalSettings.instructions }] }),
            };

            console.log('🔧 [GENERATE] Gemini config:', JSON.stringify(config, null, 2));

            let enhancedPrompt = prompt;
            if (finalSettings.style && finalSettings.style !== 'none') {
                enhancedPrompt = `${finalSettings.style} style: ${prompt}`;
            }

            console.log('📝 [GENERATE] Enhanced prompt:', enhancedPrompt);

            const parts = [{ text: enhancedPrompt }];
            const referenceImageUrls = [];

            console.log('🔍 [GENERATE] Images check:', {
                hasImages: !!images,
                isArray: Array.isArray(images),
                length: images?.length || 0,
                firstImageDataLength: images?.[0]?.data?.length || 0,
            });

            if (images && Array.isArray(images) && images.length > 0) {
                console.log('🖼️ [GENERATE] Processing', images.length, 'reference images...');
                for (const image of images) {
                    let imageData = image.data || image;
                    let mimeType = image.mimeType || 'image/jpeg';

                    // Skip SVG images - Gemini doesn't support them
                    // Only check mimeType, NOT the base64 data (which could contain 'svg' randomly)
                    if (mimeType === 'image/svg+xml') {
                        console.log('⚠️ [GENERATE] Skipping SVG image - Gemini does not support SVG format');
                        continue;
                    }

                    console.log('📷 [GENERATE] Adding image to parts - mimeType:', mimeType, 'dataLength:', imageData?.length || 0);

                    if (typeof imageData === 'string' && imageData.startsWith('http')) {
                        console.log('🌐 [GENERATE] Fetching image from URL...');
                        const response = await fetch(imageData);
                        const arrayBuffer = await response.arrayBuffer();
                        imageData = Buffer.from(arrayBuffer).toString('base64');
                        if (imageData.includes('.png')) mimeType = 'image/png';
                        else if (imageData.includes('.webp')) mimeType = 'image/webp';
                    }

                    // Ensure mimeType is supported by Gemini
                    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
                        console.log('⚠️ [GENERATE] Unsupported MIME type:', mimeType, '- defaulting to image/jpeg');
                        mimeType = 'image/jpeg';
                    }

                    console.log('☁️ [GENERATE] Uploading reference image to S3...');
                    const buffer = Buffer.from(imageData, 'base64');
                    const referenceUrl = await this.uploadToS3(buffer, mimeType);
                    referenceImageUrls.push(referenceUrl);
                    console.log('✅ [GENERATE] Reference image uploaded:', referenceUrl);

                    parts.push({
                        inlineData: {
                            mimeType,
                            data: imageData,
                        },
                    });
                }
            }

            const contents = [
                {
                    role: 'user',
                    parts,
                },
            ];

            // Debug: Log contents summary (truncated to avoid huge base64 strings)
            const contentsSummary = {
                role: contents[0].role,
                partsCount: contents[0].parts.length,
                parts: contents[0].parts.map((part, idx) => {
                    if (part.text) {
                        return { type: 'text', preview: part.text.slice(0, 100) + (part.text.length > 100 ? '...' : '') };
                    } else if (part.inlineData) {
                        return {
                            type: 'inlineData',
                            mimeType: part.inlineData.mimeType,
                            dataLength: part.inlineData.data?.length || 0,
                            dataPreview: part.inlineData.data?.slice(0, 50) + '...'
                        };
                    }
                    return { type: 'unknown', keys: Object.keys(part) };
                })
            };
            console.log('📋 [GENERATE] Contents being sent to Gemini:', JSON.stringify(contentsSummary, null, 2));

            console.log('🤖 [GENERATE] Calling Gemini API...');
            console.time('gemini-api-call');

            const response = await this.ai.models.generateContentStream({
                model: this.model,
                config,
                contents,
            });

            console.log('📡 [GENERATE] Got stream response, processing chunks...');

            const generatedImages = [];
            let textResponse = '';
            let chunkCount = 0;

            for await (const chunk of response) {
                chunkCount++;
                console.log(`📦 [GENERATE] Processing chunk #${chunkCount}...`);

                if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
                    console.log(`⚠️ [GENERATE] Chunk #${chunkCount} has no valid parts, skipping...`);
                    continue;
                }

                const parts = chunk.candidates[0].content.parts;

                for (const part of parts) {
                    if (part.inlineData) {
                        console.log(`🖼️ [GENERATE] Found image in chunk #${chunkCount}, uploading to S3...`);
                        console.time(`s3-upload-chunk-${chunkCount}`);

                        const inlineData = part.inlineData;
                        const buffer = Buffer.from(inlineData.data || '', 'base64');

                        console.log(`📊 [GENERATE] Image buffer size: ${buffer.length} bytes`);

                        const imageUrl = await this.uploadToS3(buffer, inlineData.mimeType);
                        console.timeEnd(`s3-upload-chunk-${chunkCount}`);
                        console.log(`✅ [GENERATE] Image uploaded:`, imageUrl);

                        generatedImages.push({
                            mimeType: inlineData.mimeType,
                            url: imageUrl,
                        });

                        // For edit operations, only generate 1 image
                        if (isEdit && generatedImages.length >= 1) {
                            console.log('✏️ [GENERATE] Edit operation complete - stopping after 1 image');
                            break;
                        }
                    }

                    if (chunk.text) {
                        console.log(`💬 [GENERATE] Got text in chunk #${chunkCount}:`, chunk.text.substring(0, 100));
                        textResponse += chunk.text;
                    }
                }

                // Break outer loop if edit is complete
                if (isEdit && generatedImages.length >= 1) {
                    break;
                }
            }

            console.timeEnd('gemini-api-call');
            console.log(`✅ [GENERATE] Stream processing complete. Chunks: ${chunkCount}, Images: ${generatedImages.length}`);

            const chatId = imageChatId || 'chat-' + uuidv4();
            const messageId = 'm' + uuidv4();

            console.log('💾 [GENERATE] Saving user message...');
            // Use originalMessage if provided, otherwise fall back to prompt
            const displayMessage = originalMessage || prompt;
            const userMessage = await ImageMessage.create({
                role: 'user',
                userId,
                content: displayMessage, // Save original user message, not enhanced prompt
                referenceImages: referenceImageUrls,
                imageChatId: chatId,
                messageId: 'm-' + uuidv4(),
            });
            console.log('✅ [GENERATE] User message saved');

            console.log('💾 [GENERATE] Saving assistant message...');
            const assistantMessage = await ImageMessage.create({
                role: 'assistant',
                userId,
                content: textResponse || 'Image generated successfully',
                imageUrl: generatedImages.length > 0 ? generatedImages[0].url : null,
                imageChatId: chatId,
                messageId: 'm-' + uuidv4(),
                viralContent: viralContent || null, // Save viral content for Instagram posts
            });
            console.log('✅ [GENERATE] Assistant message saved');

            console.log('💾 [GENERATE] Saving/updating conversation...');
            let imageConversation = existingConversation || await Image.findOne({ imageChatId: chatId });

            if (!imageConversation) {
                console.log('🆕 [GENERATE] Creating new conversation...');
                imageConversation = await Image.create({
                    name: prompt.substring(0, 50),
                    desc: prompt,
                    userId,
                    imageChatId: chatId,
                    messages: [userMessage._id, assistantMessage._id],
                    imageSettings: {
                        aspectRatio: finalSettings.aspectRatio,
                        imageSize: finalSettings.imageSize,
                        style: finalSettings.style,
                        instructions: finalSettings.instructions,
                        temperature: finalSettings.temperature,
                        topP: finalSettings.topP,
                    },
                });
                console.log('✅ [GENERATE] New conversation created:', chatId);
            } else {
                console.log('📝 [GENERATE] Updating existing conversation...');
                imageConversation.messages.push(userMessage._id, assistantMessage._id);
                await imageConversation.save();
                console.log('✅ [GENERATE] Conversation updated');
            }

            // Deduct credit after successful generation
            console.log('💳 [GENERATE] Deducting 1 credit...');
            const creditResult = await creditsController.deductCredits(
                userId,
                1,
                chatId,
                `Image generation: ${displayMessage.substring(0, 50)}...`
            );
            console.log('💳 [GENERATE] Credit deducted. Remaining balance:', creditResult.balance);

            console.log('🎉 [GENERATE] Complete! Returning response...');
            return {
                status: 200,
                json: {
                    success: true,
                    imageChatId: chatId,
                    messageId,
                    images: generatedImages,
                    imageUrl: generatedImages.length > 0 ? generatedImages[0].url : null,
                    textResponse,
                    userMessage,
                    assistantMessage,
                    creditsRemaining: creditResult.balance,
                },
            };

        } catch (error) {
            console.error('❌ [GENERATE] Error:', error);
            console.error('❌ [GENERATE] Stack:', error.stack);
            return {
                status: 500,
                json: { error: error.message },
            };
        }
    }

    /**
     * Get conversation history
     */
    async getConversation(req, res) {
        try {
            const { imageChatId } = req.params;
            const conversation = await Image.findOne({ imageChatId })
                .populate('messages');

            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            return { status: 200, json: conversation };
        } catch (error) {
            console.error('Error fetching conversation:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    async getUserConversations(req, res) {
        try {
            const { userId } = req.params;
            const conversations = await Image.find({ userId })
                .sort({ createdAt: -1 })
                .lean();

            // Get first message for each conversation as title
            const conversationsWithTitles = await Promise.all(
                conversations.map(async (conv) => {
                    const firstMessage = await ImageMessage.findOne({ imageChatId: conv.imageChatId })
                        .sort({ createdAt: 1 })
                        .lean();

                    return {
                        ...conv,
                        title: firstMessage?.prompt?.slice(0, 50) || 'Untitled',
                    };
                })
            );

            return { status: 200, json: { conversations: conversationsWithTitles } };
        } catch (error) {
            console.error('Error fetching user conversations:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Update project settings for a conversation
     * Only allows updating: aspectRatio, imageSize, style, instructions, temperature, topP
     */
    async updateProjectSettings(req, res) {
        try {
            const { imageChatId } = req.params;
            const { aspectRatio, imageSize, style, instructions, temperature, topP } = req.body;

            const conversation = await Image.findOne({ imageChatId });
            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            // Initialize imageSettings if not exists
            if (!conversation.imageSettings) {
                conversation.imageSettings = { ...DEFAULT_PROJECT_SETTINGS };
            }

            // Update only provided fields
            if (aspectRatio !== undefined && ASPECT_RATIOS.includes(aspectRatio)) {
                conversation.imageSettings.aspectRatio = aspectRatio;
            }
            if (imageSize !== undefined && IMAGE_SIZES.includes(imageSize)) {
                conversation.imageSettings.imageSize = imageSize;
            }
            if (style !== undefined && STYLES.includes(style)) {
                conversation.imageSettings.style = style;
            }
            if (instructions !== undefined) {
                conversation.imageSettings.instructions = instructions;
            }
            if (temperature !== undefined && temperature >= 0 && temperature <= 2) {
                conversation.imageSettings.temperature = temperature;
            }
            if (topP !== undefined && topP >= 0 && topP <= 1) {
                conversation.imageSettings.topP = topP;
            }

            await conversation.save();

            return { status: 200, json: { success: true, imageSettings: conversation.imageSettings } };
        } catch (error) {
            console.error('Error updating project settings:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get project settings for a conversation
     */
    async getProjectSettings(req, res) {
        try {
            const { imageChatId } = req.params;
            const conversation = await Image.findOne({ imageChatId });

            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            return { status: 200, json: { imageSettings: conversation.imageSettings || DEFAULT_PROJECT_SETTINGS } };
        } catch (error) {
            console.error('Error fetching project settings:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Bulk generate images with one reference image and multiple prompts
     * Creates variations of the same person in different scenarios
     */
    async bulkGenerateImages(req, res) {
        try {
            console.log('🚀 [BULK GENERATE] Starting bulk image generation...');
            console.log('📥 [BULK GENERATE] Request body keys:', Object.keys(req.body));
            console.log('📥 [BULK GENERATE] Has referenceImage:', !!req.body.referenceImage);
            console.log('📥 [BULK GENERATE] Prompts count:', req.body.prompts?.length || 0);

            const {
                referenceImage, // Single reference image of the person
                prompts, // Array of prompts for different scenarios
                userId,
                imageChatId,
                aspectRatio,
                imageSize,
                style,
                batchName, // Optional name for this bulk generation batch
            } = req.body;

            // Validation
            if (!referenceImage) {
                return { status: 400, json: { error: 'Reference image is required' } };
            }
            if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
                return { status: 400, json: { error: 'Prompts array is required and must not be empty' } };
            }
            if (!userId) {
                return { status: 400, json: { error: 'User ID is required' } };
            }

            console.log(`📋 [BULK GENERATE] Processing ${prompts.length} prompts with 1 reference image`);

            // Upload reference image to S3 once
            console.log('☁️ [BULK GENERATE] Uploading reference image to S3...');
            let referenceImageData = referenceImage.data || referenceImage;
            let mimeType = referenceImage.mimeType || 'image/jpeg';

            if (typeof referenceImageData === 'string' && referenceImageData.startsWith('http')) {
                console.log('🌐 [BULK GENERATE] Fetching reference image from URL...');
                const response = await fetch(referenceImageData);
                const arrayBuffer = await response.arrayBuffer();
                referenceImageData = Buffer.from(arrayBuffer).toString('base64');
                if (referenceImageData.includes('.png')) mimeType = 'image/png';
                else if (referenceImageData.includes('.webp')) mimeType = 'image/webp';
            }

            const buffer = Buffer.from(referenceImageData, 'base64');
            const referenceUrl = await this.uploadToS3(buffer, mimeType);
            console.log('✅ [BULK GENERATE] Reference image uploaded:', referenceUrl);

            // Create or get conversation
            const chatId = imageChatId || 'bulk-' + uuidv4();
            let imageConversation = await Image.findOne({ imageChatId: chatId });

            if (!imageConversation) {
                console.log('🆕 [BULK GENERATE] Creating new conversation...');
                imageConversation = await Image.create({
                    name: batchName || `Bulk Generation - ${new Date().toLocaleDateString()}`,
                    desc: `Bulk generation with ${prompts.length} variations`,
                    userId,
                    imageChatId: chatId,
                    messages: [],
                    imageSettings: {
                        aspectRatio: aspectRatio || 'auto',
                        imageSize: imageSize || '2K',
                        style: style || 'none',
                        instructions: '',
                        temperature: 1,
                        topP: 1,
                    },
                });
            }

            const results = [];
            const errors = [];

            // Process each prompt sequentially to avoid rate limits
            for (let i = 0; i < prompts.length; i++) {
                const prompt = prompts[i];
                console.log(`\n🎨 [BULK GENERATE] Processing prompt ${i + 1}/${prompts.length}: "${prompt.substring(0, 50)}..."`);

                try {
                    // Create a mock request object for generateImages
                    const mockReq = {
                        body: {
                            prompt,
                            userId,
                            imageChatId: chatId,
                            images: [{
                                data: referenceImageData,
                                mimeType: mimeType,
                            }],
                            aspectRatio,
                            imageSize,
                            style,
                        }
                    };

                    const result = await this.generateImages(mockReq, res);

                    if (result.status === 200) {
                        console.log(`✅ [BULK GENERATE] Prompt ${i + 1} completed successfully`);
                        results.push({
                            promptIndex: i,
                            prompt,
                            success: true,
                            imageUrl: result.json.imageUrl,
                            images: result.json.images,
                            messageId: result.json.messageId,
                        });
                    } else {
                        console.error(`❌ [BULK GENERATE] Prompt ${i + 1} failed:`, result.json.error);
                        errors.push({
                            promptIndex: i,
                            prompt,
                            error: result.json.error,
                        });
                    }

                    // Add a small delay between requests to avoid rate limiting
                    if (i < prompts.length - 1) {
                        console.log('⏳ [BULK GENERATE] Waiting 2 seconds before next generation...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    console.error(`❌ [BULK GENERATE] Error processing prompt ${i + 1}:`, error);
                    errors.push({
                        promptIndex: i,
                        prompt,
                        error: error.message,
                    });
                }
            }

            console.log(`\n🎉 [BULK GENERATE] Bulk generation complete!`);
            console.log(`✅ Successful: ${results.length}/${prompts.length}`);
            console.log(`❌ Failed: ${errors.length}/${prompts.length}`);

            return {
                status: 200,
                json: {
                    success: true,
                    imageChatId: chatId,
                    referenceImageUrl: referenceUrl,
                    totalPrompts: prompts.length,
                    successCount: results.length,
                    failureCount: errors.length,
                    results,
                    errors,
                },
            };

        } catch (error) {
            console.error('❌ [BULK GENERATE] Fatal error:', error);
            console.error('❌ [BULK GENERATE] Stack:', error.stack);
            return {
                status: 500,
                json: { error: error.message },
            };
        }
    }

    /**
     * Delete a specific message from a conversation
     */
    async deleteMessage(req, res) {
        try {
            const { messageId } = req.params;

            if (!messageId) {
                return { status: 400, json: { error: 'messageId is required' } };
            }

            // Find and delete the message
            const message = await ImageMessage.findOneAndDelete({ messageId });

            if (!message) {
                return { status: 404, json: { error: 'Message not found' } };
            }

            // Also remove from the Image document's messages array
            await Image.updateOne(
                { imageChatId: message.imageChatId },
                { $pull: { messages: message._id } }
            );

            console.log(`🗑️ [DELETE] Deleted message: ${messageId}`);
            return { status: 200, json: { success: true, messageId } };
        } catch (error) {
            console.error('Error deleting message:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Delete an entire conversation and all its messages
     */
    async deleteConversation(req, res) {
        try {
            const { imageChatId } = req.params;

            if (!imageChatId) {
                return { status: 400, json: { error: 'imageChatId is required' } };
            }

            // Delete all messages in the conversation
            const deletedMessages = await ImageMessage.deleteMany({ imageChatId });

            // Delete the conversation itself
            const conversation = await Image.findOneAndDelete({ imageChatId });

            if (!conversation) {
                return { status: 404, json: { error: 'Conversation not found' } };
            }

            console.log(`🗑️ [DELETE] Deleted conversation: ${imageChatId} (${deletedMessages.deletedCount} messages)`);
            return {
                status: 200,
                json: {
                    success: true,
                    imageChatId,
                    deletedMessagesCount: deletedMessages.deletedCount
                }
            };
        } catch (error) {
            console.error('Error deleting conversation:', error);
            return { status: 500, json: { error: error.message } };
        }
    }
}

module.exports = ImageController;