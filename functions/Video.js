const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const Video = require('../models/video');
const VideoMessage = require('../models/videoMessage');
const CreditsController = require('./Credits');

const creditsController = new CreditsController();
const VIDEO_CREDIT_COST = 10; // Each video costs 10 credits

class VideoController {
    constructor() {
        this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
        this.model = 'veo-3.1-generate-preview';
        this.fastModel = 'veo-3.1-fast-generate-preview';
        this.pollInterval = 10000; // 10 seconds
        this.maxPollAttempts = 60; // 10 minutes max

        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
        this.uploadsDir = path.join(__dirname, '..', 'uploads');
    }

    // Check if user has sufficient credits for video generation (10 credits)
    async checkVideoCredits(userId) {
        const credits = await creditsController.getCredits(userId);
        if (!credits) {
            console.warn(`⚠️ [Video] Credits not found for ${userId}, proceeding without check`);
            return null;
        }
        if (credits.balance < VIDEO_CREDIT_COST) {
            throw new Error(`Insufficient credits. Video generation requires ${VIDEO_CREDIT_COST} credits. You have ${credits.balance}.`);
        }
        return credits;
    }

    // Deduct 10 credits for video generation
    async deductVideoCredit(userId, prompt = '') {
        const result = await creditsController.deductCredits(
            userId,
            VIDEO_CREDIT_COST,
            null,
            `Video generation: ${prompt.substring(0, 50)}...`
        );
        if (result.success) {
            console.log(`✅ Deducted ${VIDEO_CREDIT_COST} credits from ${userId}. Remaining: ${result.balance}`);
        } else {
            console.warn(`⚠️ [Video] Could not deduct credits for ${userId}: ${result.error}`);
        }
        return result;
    }

    async uploadToS3(buffer, mimeType = 'video/mp4') {
        const extension = mimeType?.split('/')[1] || 'mp4';
        const fileName = `videos/${uuidv4()}.${extension}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: mimeType,
        }));

        return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    async waitForCompletion(operation, assistantMsg) {
        let attempts = 0;

        while (!operation.done && attempts < this.maxPollAttempts) {
            await new Promise(resolve => setTimeout(resolve, this.pollInterval));
            attempts++;
            console.log(`⏳ [Video] Polling... Attempt ${attempts}/${this.maxPollAttempts}`);

            operation = await this.ai.operations.getVideosOperation({ operation });

            // Update progress on the message
            if (assistantMsg) {
                assistantMsg.progress = Math.min(90, attempts * 2);
                await assistantMsg.save();
            }
        }

        if (!operation.done) {
            throw new Error('Video generation timeout. Please try again.');
        }

        // Check for errors
        if (operation.error) {
            console.error('❌ [Video] Operation error:', operation.error);
            throw new Error(operation.error.message || 'Video generation failed');
        }

        // Check for RAI (Responsible AI) filtering
        if (operation.response?.raiMediaFilteredCount > 0) {
            const reasons = operation.response.raiMediaFilteredReasons || [];
            const errorMessage = reasons.length > 0
                ? reasons.join(' ')
                : 'Content was filtered by safety guidelines. Please try a different prompt or image.';
            console.error('🚫 [Video] Content filtered by RAI:', errorMessage);
            throw new Error(errorMessage);
        }

        return operation;
    }

    // Save message and link to Video chat
    async saveMessage(chatId, userId, role, content, extras = {}) {
        const msg = await VideoMessage.create({
            messageId: `vmsg-${uuidv4()}`,
            videoChatId: chatId,
            role,
            content,
            userId,
            ...extras
        });

        await Video.findOneAndUpdate(
            { videoChatId: chatId },
            {
                $push: { messages: msg._id },
                $setOnInsert: { userId, videoChatId: chatId, name: content.slice(0, 50) }
            },
            { upsert: true, new: true }
        );

        return msg;
    }

    /**
     * Generate video - main endpoint
     */
    async generate(req) {
        let assistantMsg = null;
        let videoChatId = null;

        try {
            const {
                userId,
                prompt,
                videoChatId: providedChatId,
                startFrame,        // { data: base64, mimeType } - new format
                endFrame,          // { data: base64, mimeType } - new format
                startFrameUrl,     // Legacy URL format (for backward compat)
                endFrameUrl,       // Legacy URL format
                referenceImages = [],  // Array of { data, mimeType } or URLs
                lastVideoUrl,
                resolution = '720p'
            } = req.body;

            videoChatId = providedChatId || `vc-${uuidv4()}`;

            console.log('[VideoController] Generate request:', {
                userId,
                prompt: prompt?.slice(0, 50) + '...',
                hasStartFrame: !!startFrame,
                hasEndFrame: !!endFrame,
                refsCount: referenceImages.length,
                resolution,
            });

            if (!userId) {
                console.error('❌ [Video] userId is required');
                return { status: 400, json: { error: 'userId is required' } };
            }
            if (!prompt) {
                console.error('❌ [Video] prompt is required');
                return { status: 400, json: { error: 'prompt is required' } };
            }

            // Check video credits first
            console.log('[VideoController] Checking credits for:', userId);
            await this.checkVideoCredits(userId);
            console.log('[VideoController] Credits OK');

            // Save user message
            await this.saveMessage(videoChatId, userId, 'user', prompt, {
                referenceImages: referenceImages.map(r => r.data ? 'base64-data' : r),
            });

            // Create assistant message (pending)
            assistantMsg = await this.saveMessage(videoChatId, userId, 'assistant', 'Generating video...', {
                status: 'processing'
            });
            // Determine mode - check new format first, then legacy
            const hasStart = startFrame?.data || startFrameUrl;
            const hasEnd = endFrame?.data || endFrameUrl;
            const hasRefs = referenceImages.length > 0 && (referenceImages[0]?.data || typeof referenceImages[0] === 'string');

            console.log('[VideoController] hasRefs check:', {
                length: referenceImages.length,
                firstRef: referenceImages[0] ? (typeof referenceImages[0] === 'string' ? 'string-url' : Object.keys(referenceImages[0])) : 'none',
                hasData: !!referenceImages[0]?.data,
                hasRefs
            });

            let mode = 'prompt';
            if (lastVideoUrl) mode = 'extend';
            else if (hasStart && hasEnd) mode = 'interpolation';
            else if (hasStart) mode = 'start_frame';
            else if (hasRefs) mode = 'references';

            console.log('[VideoController] Mode:', mode);

            let operationConfig = { model: this.model, prompt, config: { resolution } };

            // Handle modes - support both base64 data and URLs
            if (mode === 'start_frame') {
                let imageBytes, mimeType = 'image/png';
                if (startFrame?.data) {
                    imageBytes = startFrame.data;
                    mimeType = startFrame.mimeType || 'image/png';
                    console.log('[VideoController] Using startFrame base64 data');
                } else if (startFrameUrl) {
                    const imgRes = await fetch(startFrameUrl);
                    imageBytes = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
                }
                operationConfig.image = { imageBytes, mimeType };
            }

            if (mode === 'interpolation') {
                let startBytes, endBytes;
                let startMime = 'image/png', endMime = 'image/png';

                if (startFrame?.data) {
                    startBytes = startFrame.data;
                    startMime = startFrame.mimeType || 'image/png';
                } else if (startFrameUrl) {
                    const res = await fetch(startFrameUrl);
                    startBytes = Buffer.from(await res.arrayBuffer()).toString('base64');
                }

                if (endFrame?.data) {
                    endBytes = endFrame.data;
                    endMime = endFrame.mimeType || 'image/png';
                } else if (endFrameUrl) {
                    const res = await fetch(endFrameUrl);
                    endBytes = Buffer.from(await res.arrayBuffer()).toString('base64');
                }

                operationConfig.image = { imageBytes: startBytes, mimeType: startMime };
                operationConfig.config.lastFrame = { imageBytes: endBytes, mimeType: endMime };
            }

            // Reference images can be added to ANY mode (not just 'references' mode)
            // Per Google docs: reference_images is for style and content references (Veo 3.1 only)
            if (hasRefs && referenceImages.length > 0) {
                console.log('[VideoController] Processing reference images:', referenceImages.length);
                const refs = await Promise.all(
                    referenceImages.slice(0, 3).map(async (ref) => {
                        let imageBytes, mimeType = 'image/png';
                        if (ref?.data) {
                            imageBytes = ref.data;
                            mimeType = ref.mimeType || 'image/png';
                            console.log('[VideoController] Using ref base64 data');
                        } else if (typeof ref === 'string') {
                            console.log('[VideoController] Fetching ref URL:', ref.substring(0, 50) + '...');
                            const res = await fetch(ref);
                            imageBytes = Buffer.from(await res.arrayBuffer()).toString('base64');
                        }
                        return {
                            image: { imageBytes, mimeType },
                            referenceType: 'REFERENCE_TYPE_STYLE',
                        };
                    })
                );
                operationConfig.config.reference_images = refs;
                console.log('[VideoController] Added referenceImages to config:', refs.length);
            }

            if (mode === 'extend') {
                // Find the original video message by S3 URL to get the googleFile reference
                // Google Veo can ONLY extend videos that were originally generated by Veo
                const originalVideoMessage = await VideoMessage.findOne({ videoUrl: lastVideoUrl });

                if (!originalVideoMessage) {
                    throw new Error('Original video not found. Cannot extend this video.');
                }

                if (!originalVideoMessage.googleFile) {
                    throw new Error('This video cannot be extended. Only videos generated by Veo can be extended, and the Google file reference is missing.');
                }

                console.log(`📁 [Video] Found original video googleFile:`, originalVideoMessage.googleFile);
                // Pass the video object directly (not wrapped in { uri: ... })
                // Per Gemini docs: video=operation.response.generated_videos[0].video
                operationConfig.video = originalVideoMessage.googleFile;
            }

            console.log('🎬 [Video] Starting generation with Google AI...');
            console.log('📋 [Video] Config:', {
                model: operationConfig.model,
                hasPrompt: !!operationConfig.prompt,
                hasImage: !!operationConfig.image,
                hasVideo: !!operationConfig.video,
                hasConfig: !!operationConfig.config,
                configKeys: operationConfig.config ? Object.keys(operationConfig.config) : [],
                hasReferenceImages: !!operationConfig.config?.referenceImages,
                referenceImagesCount: operationConfig.config?.referenceImages?.length || 0
            });

            // Start generation
            let operation = await this.ai.models.generateVideos(operationConfig);
            assistantMsg.operationId = operation.name;
            await assistantMsg.save();

            console.log(`⏳ [Video] Operation started: ${operation.name}`);

            // Wait for completion (with progress tracking)
            operation = await this.waitForCompletion(operation, assistantMsg);

            // Validate response
            console.log('🔍 [Video] Response keys:', Object.keys(operation.response || {}));

            const generatedVideo = operation.response?.generatedVideos?.[0];
            if (!generatedVideo?.video) {
                console.error('❌ [Video] No video in response:', operation.response);
                throw new Error('Video generation completed but no video was returned. Please try again.');
            }

            console.log('✅ [Video] Generation complete. Downloading...');

            // Download video to temp file then upload to S3
            const tempFilename = `temp_${uuidv4()}.mp4`;
            const tempPath = path.join(this.uploadsDir, tempFilename);

            // Ensure uploads directory exists
            try {
                await fs.mkdir(this.uploadsDir, { recursive: true });
            } catch (err) {
                // Directory might already exist
            }

            // Download from Google
            await this.ai.files.download({
                file: generatedVideo.video,
                downloadPath: tempPath
            });

            console.log(`💾 [Video] Downloaded to: ${tempPath}`);

            // Read and upload to S3
            const videoBuffer = await fs.readFile(tempPath);
            const videoUrl = await this.uploadToS3(videoBuffer, 'video/mp4');

            // Clean up temp file
            try {
                await fs.unlink(tempPath);
            } catch (err) {
                console.warn(`⚠️ [Video] Could not delete temp file: ${tempPath}`);
            }

            // Update message - store googleFile for future extend operations
            // Per Gemini docs: use operation.response.generated_videos[0].video for extend
            assistantMsg.content = prompt;
            assistantMsg.videoUrl = videoUrl;
            assistantMsg.googleFile = generatedVideo.video; // Store Google file reference for extend
            assistantMsg.status = 'completed';
            assistantMsg.progress = 100;
            await assistantMsg.save();
            console.log(`📁 [Video] Stored googleFile:`, JSON.stringify(generatedVideo.video, null, 2));

            // Deduct 10 credits for video generation
            await this.deductVideoCredit(userId, prompt);

            console.log(`✅ [Video] Completed and uploaded: ${videoUrl}`);
            return { status: 200, json: { success: true, videoChatId, message: assistantMsg } };

        } catch (error) {
            console.error('❌ [Video] Error:', error.message);
            console.error('❌ [Video] Stack:', error.stack);

            // Update assistant message if it exists
            if (assistantMsg) {
                try {
                    assistantMsg.status = 'failed';
                    assistantMsg.error = error.message;
                    assistantMsg.content = `Failed: ${error.message}`;
                    await assistantMsg.save();
                } catch (saveErr) {
                    console.error('❌ [Video] Failed to save error message:', saveErr.message);
                }
            }

            // Determine appropriate status code
            let statusCode = 500;
            if (error.message.includes('credits') || error.message.includes('Insufficient')) {
                statusCode = 403;
            } else if (error.message.includes('not found')) {
                statusCode = 404;
            }

            return { status: statusCode, json: { error: error.message, videoChatId } };
        }
    }

    async getConversation(req) {
        const { videoChatId } = req.params;
        const video = await Video.findOne({ videoChatId }).populate('messages');
        if (!video) return { status: 404, json: { error: 'Conversation not found' } };
        return { status: 200, json: { video, messages: video.messages } };
    }

    async getUserConversations(req) {
        const { userId } = req.params;
        const videos = await Video.find({ userId }).sort({ createdAt: -1 }).select('-messages');
        return { status: 200, json: { conversations: videos } };
    }

    async getSettings(req) {
        const { videoChatId } = req.params;
        const video = await Video.findOne({ videoChatId });
        if (!video) return { status: 404, json: { error: 'Not found' } };
        return { status: 200, json: { settings: video.videoSettings || {}, referenceImages: video.referenceImages || [] } };
    }

    async updateSettings(req) {
        const { videoChatId } = req.params;
        const { settings, referenceImages } = req.body;
        const update = {};
        if (settings) update.videoSettings = settings;
        if (referenceImages) update.referenceImages = referenceImages.slice(0, 3);

        const video = await Video.findOneAndUpdate({ videoChatId }, update, { new: true });
        if (!video) return { status: 404, json: { error: 'Not found' } };
        return { status: 200, json: { video } };
    }

    async deleteMessage(req) {
        const { messageId } = req.params;
        const msg = await VideoMessage.findOneAndDelete({ messageId });
        if (!msg) return { status: 404, json: { error: 'Message not found' } };
        await Video.updateOne({ videoChatId: msg.videoChatId }, { $pull: { messages: msg._id } });
        return { status: 200, json: { success: true } };
    }

    async deleteConversation(req) {
        const { videoChatId } = req.params;
        const video = await Video.findOneAndDelete({ videoChatId });
        if (!video) return { status: 404, json: { error: 'Not found' } };
        await VideoMessage.deleteMany({ videoChatId });
        return { status: 200, json: { success: true } };
    }
}

module.exports = VideoController;

