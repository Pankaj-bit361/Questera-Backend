const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const DraftTemplate = require('../models/draftTemplate');
const Template = require('../models/template');

class DraftTemplateController {
    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });
        this.model = 'gemini-3-pro-image-preview';

        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    }

    async uploadToS3(buffer, mimeType) {
        const extension = mimeType?.split('/')[1] || 'png';
        const fileName = `draft-templates/${uuidv4()}.${extension}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: mimeType,
        }));

        return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    /**
     * Create a new draft template and generate preview images
     */
    async createDraft(req) {
        try {
            console.log('📝 [DRAFT] Creating new draft template...');

            const {
                name,
                description,
                category,
                prompts,
                referenceImage,
                referenceImages,
                aspectRatio,
                imageSize,
                style,
                tags,
                isPublic,
                createdBy,
            } = req.body;

            // Validation
            if (!name || !prompts || !createdBy) {
                return { status: 400, json: { error: 'Name, prompts, and createdBy are required' } };
            }

            if (!Array.isArray(prompts) || prompts.length === 0) {
                return { status: 400, json: { error: 'Prompts must be a non-empty array' } };
            }

            // Process reference images (support both single and multiple)
            const processedReferenceImages = [];
            let referenceUrls = [];

            // Handle multiple reference images
            const imagesToProcess = referenceImages || (referenceImage ? [referenceImage] : []);

            for (const refImg of imagesToProcess) {
                let imgData = refImg.data || refImg;
                let imgMimeType = refImg.mimeType || 'image/jpeg';

                if (typeof imgData === 'string' && imgData.startsWith('http')) {
                    referenceUrls.push(imgData);
                    const response = await fetch(imgData);
                    const arrayBuffer = await response.arrayBuffer();
                    imgData = Buffer.from(arrayBuffer).toString('base64');
                } else {
                    const buffer = Buffer.from(imgData, 'base64');
                    const uploadedUrl = await this.uploadToS3(buffer, imgMimeType);
                    referenceUrls.push(uploadedUrl);
                }

                processedReferenceImages.push({
                    data: imgData,
                    mimeType: imgMimeType,
                });
            }

            console.log(`📷 [DRAFT] Processed ${processedReferenceImages.length} reference image(s)`);

            // Create draft in DB with 'generating' status
            const draft = await DraftTemplate.create({
                name,
                description,
                category: category || 'other',
                prompts,
                referenceImageUrls: referenceUrls,
                previewImages: [],
                settings: {
                    aspectRatio: aspectRatio || '1:1',
                    imageSize: imageSize || '1K',
                    style: style || 'photorealistic',
                },
                status: 'generating',
                createdBy,
                tags: tags || [],
                isPublic: isPublic !== false,
            });

            console.log('✅ [DRAFT] Draft created:', draft._id);

            // Generate images for each prompt
            const previewImages = [];
            const errors = [];

            for (let i = 0; i < prompts.length; i++) {
                const prompt = prompts[i];
                console.log(`\n🎨 [DRAFT] Generating preview ${i + 1}/${prompts.length}`);

                try {
                    // Pass all reference images to the generator
                    const imageUrl = await this.generateImage(
                        processedReferenceImages,
                        prompt,
                        aspectRatio,
                        style
                    );

                    previewImages.push({
                        prompt,
                        imageUrl,
                        order: i,
                        isApproved: false,
                    });

                    console.log(`✅ [DRAFT] Preview ${i + 1} generated`);

                    // Rate limiting delay
                    if (i < prompts.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    console.error(`❌ [DRAFT] Error generating preview ${i + 1}:`, error.message);
                    errors.push({ promptIndex: i, prompt, error: error.message });
                }
            }

            // Update draft with generated images
            draft.previewImages = previewImages;
            draft.status = previewImages.length > 0 ? 'ready_for_review' : 'rejected';
            if (errors.length > 0) {
                draft.errorMessage = `${errors.length} image(s) failed to generate`;
            }
            await draft.save();

            return {
                status: 201,
                json: {
                    success: true,
                    draftId: draft._id,
                    draft,
                    successCount: previewImages.length,
                    failureCount: errors.length,
                    errors,
                },
            };
        } catch (error) {
            console.error('❌ [DRAFT] Error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Generate a single image using Gemini API
     * @param {Array} referenceImages - Array of { data, mimeType } objects
     * @param {string} prompt - The text prompt
     * @param {string} aspectRatio - Aspect ratio for the image
     * @param {string} style - Style to apply
     */
    async generateImage(referenceImages, prompt, aspectRatio, style) {
        const imageConfig = {};
        if (aspectRatio && aspectRatio !== 'auto') {
            imageConfig.aspectRatio = aspectRatio;
        }

        const config = {
            responseModalities: ['IMAGE'],
            imageConfig,
        };

        let enhancedPrompt = prompt;
        if (style && style !== 'none') {
            enhancedPrompt = `${style} style: ${prompt}`;
        }

        const parts = [{ text: enhancedPrompt }];

        // Add all reference images if available
        if (referenceImages && referenceImages.length > 0) {
            for (const refImg of referenceImages) {
                parts.push({
                    inlineData: {
                        mimeType: refImg.mimeType,
                        data: refImg.data,
                    },
                });
            }
            console.log(`📷 [DRAFT] Including ${referenceImages.length} reference image(s) in generation`);
        }

        const contents = [{ role: 'user', parts }];

        const response = await this.ai.models.generateContentStream({
            model: this.model,
            config,
            contents,
        });

        let generatedImageUrl = null;

        for await (const chunk of response) {
            if (chunk.candidates?.[0]?.content?.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const buffer = Buffer.from(part.inlineData.data || '', 'base64');
                        generatedImageUrl = await this.uploadToS3(buffer, part.inlineData.mimeType);
                        break;
                    }
                }
            }
            if (generatedImageUrl) break;
        }

        if (!generatedImageUrl) {
            throw new Error('No image generated');
        }

        return generatedImageUrl;
    }

    /**
     * Get all draft templates
     */
    async getDrafts(req) {
        try {
            const { status, createdBy } = req.query;
            const filter = {};

            if (status) filter.status = status;
            if (createdBy) filter.createdBy = createdBy;

            const drafts = await DraftTemplate.find(filter)
                .sort({ createdAt: -1 })
                .lean();

            return { status: 200, json: { drafts } };
        } catch (error) {
            console.error('Error fetching drafts:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get a single draft template by ID
     */
    async getDraftById(req) {
        try {
            const { id } = req.params;
            const draft = await DraftTemplate.findById(id);

            if (!draft) {
                return { status: 404, json: { error: 'Draft template not found' } };
            }

            return { status: 200, json: { draft } };
        } catch (error) {
            console.error('Error fetching draft:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Approve a draft template and convert it to a regular template
     */
    async approveDraft(req) {
        try {
            const { id } = req.params;
            const { selectedImages } = req.body; // Optional: array of image indices to include

            const draft = await DraftTemplate.findById(id);
            if (!draft) {
                return { status: 404, json: { error: 'Draft template not found' } };
            }

            if (draft.status !== 'ready_for_review') {
                return { status: 400, json: { error: 'Draft is not ready for review' } };
            }

            // Filter images if selectedImages is provided
            let imagesToInclude = draft.previewImages;
            if (selectedImages && Array.isArray(selectedImages)) {
                imagesToInclude = draft.previewImages.filter((_, idx) =>
                    selectedImages.includes(idx)
                );
            }

            if (imagesToInclude.length === 0) {
                return { status: 400, json: { error: 'At least one image must be selected' } };
            }

            // Create variations from approved images
            const variations = imagesToInclude.map((img, idx) => ({
                prompt: img.prompt,
                generatedImageUrl: img.imageUrl,
                order: idx,
            }));

            // Create the final template
            const template = await Template.create({
                name: draft.name,
                description: draft.description,
                category: draft.category,
                referenceImageUrl: imagesToInclude[0].imageUrl,
                variations,
                settings: draft.settings,
                isPublic: draft.isPublic,
                createdBy: draft.createdBy,
                tags: draft.tags,
                status: 'completed',
            });

            // Update draft status
            draft.status = 'approved';
            draft.approvedTemplateId = template._id;
            await draft.save();

            console.log(`✅ [DRAFT] Draft ${id} approved, template ${template._id} created`);

            return {
                status: 200,
                json: {
                    success: true,
                    message: 'Draft approved and template created',
                    templateId: template._id,
                    template,
                },
            };
        } catch (error) {
            console.error('Error approving draft:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Reject/Delete a draft template
     */
    async rejectDraft(req) {
        try {
            const { id } = req.params;
            const draft = await DraftTemplate.findByIdAndDelete(id);

            if (!draft) {
                return { status: 404, json: { error: 'Draft template not found' } };
            }

            return { status: 200, json: { success: true, message: 'Draft rejected and deleted' } };
        } catch (error) {
            console.error('Error rejecting draft:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Delete all existing templates (clear templates collection)
     */
    async deleteAllTemplates(req) {
        try {
            const result = await Template.deleteMany({});
            console.log(`🗑️ [TEMPLATE] Deleted ${result.deletedCount} templates`);

            return {
                status: 200,
                json: {
                    success: true,
                    message: `Deleted ${result.deletedCount} templates`,
                    deletedCount: result.deletedCount,
                },
            };
        } catch (error) {
            console.error('Error deleting all templates:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Delete all draft templates
     */
    async deleteAllDrafts(req) {
        try {
            const result = await DraftTemplate.deleteMany({});
            console.log(`🗑️ [DRAFT] Deleted ${result.deletedCount} drafts`);

            return {
                status: 200,
                json: {
                    success: true,
                    message: `Deleted ${result.deletedCount} draft templates`,
                    deletedCount: result.deletedCount,
                },
            };
        } catch (error) {
            console.error('Error deleting all drafts:', error);
            return { status: 500, json: { error: error.message } };
        }
    }
}

module.exports = DraftTemplateController;

