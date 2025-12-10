const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Template = require('../models/template');

class TemplateController {
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
        const fileName = `templates/${uuidv4()}.${extension}`;

        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: mimeType,
        }));

        return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    /**
     * Create a new template with bulk image generation
     */
    async createTemplate(req, res) {
        try {
            console.log('🎨 [TEMPLATE] Creating new template...');

            const {
                name,
                description,
                category,
                referenceImage,
                prompts,
                aspectRatio,
                imageSize,
                style,
                tags,
                isPublic,
                createdBy,
            } = req.body;

            // Validation
            if (!name || !referenceImage || !prompts || !createdBy) {
                return { status: 400, json: { error: 'Name, reference image, prompts, and createdBy are required' } };
            }

            if (!Array.isArray(prompts) || prompts.length === 0) {
                return { status: 400, json: { error: 'Prompts must be a non-empty array' } };
            }

            console.log(`📋 [TEMPLATE] Creating template: ${name} with ${prompts.length} variations`);

            // Upload reference image
            let referenceImageData = referenceImage.data || referenceImage;
            let mimeType = referenceImage.mimeType || 'image/jpeg';

            if (typeof referenceImageData === 'string' && referenceImageData.startsWith('http')) {
                const response = await fetch(referenceImageData);
                const arrayBuffer = await response.arrayBuffer();
                referenceImageData = Buffer.from(arrayBuffer).toString('base64');
            }

            const buffer = Buffer.from(referenceImageData, 'base64');
            const referenceUrl = await this.uploadToS3(buffer, mimeType);
            console.log('✅ [TEMPLATE] Reference image uploaded:', referenceUrl);

            // Create template in database with 'processing' status
            const template = await Template.create({
                name,
                description,
                category: category || 'other',
                referenceImageUrl: referenceUrl,
                variations: [],
                settings: {
                    aspectRatio: aspectRatio || '1:1',
                    imageSize: imageSize || '2K',
                    style: style || 'photorealistic',
                },
                isPublic: isPublic || false,
                createdBy,
                tags: tags || [],
                status: 'processing',
            });

            console.log('✅ [TEMPLATE] Template created in DB:', template._id);

            // Generate images for each prompt
            const variations = [];
            const errors = [];

            for (let i = 0; i < prompts.length; i++) {
                const prompt = prompts[i];
                console.log(`\n🎨 [TEMPLATE] Generating variation ${i + 1}/${prompts.length}`);

                try {
                    const imageUrl = await this.generateSingleImage(
                        referenceImageData,
                        mimeType,
                        prompt,
                        aspectRatio,
                        imageSize,
                        style
                    );

                    variations.push({
                        prompt,
                        generatedImageUrl: imageUrl,
                        order: i,
                    });

                    console.log(`✅ [TEMPLATE] Variation ${i + 1} completed`);

                    // Add delay to avoid rate limiting
                    if (i < prompts.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    console.error(`❌ [TEMPLATE] Error generating variation ${i + 1}:`, error);
                    errors.push({
                        promptIndex: i,
                        prompt,
                        error: error.message,
                    });
                }
            }

            // Update template with variations
            template.variations = variations;
            template.status = variations.length > 0 ? 'completed' : 'failed';
            await template.save();

            console.log(`🎉 [TEMPLATE] Template creation complete! ${variations.length}/${prompts.length} successful`);

            return {
                status: 200,
                json: {
                    success: true,
                    template,
                    successCount: variations.length,
                    failureCount: errors.length,
                    errors,
                },
            };

        } catch (error) {
            console.error('❌ [TEMPLATE] Error:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Generate a single image using Gemini API
     */
    async generateSingleImage(referenceImageData, mimeType, prompt, aspectRatio, imageSize, style) {
        const imageConfig = {
            imageSize: imageSize || '2K',
        };
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

        const parts = [
            { text: enhancedPrompt },
            {
                inlineData: {
                    mimeType,
                    data: referenceImageData,
                },
            },
        ];

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
     * Get all templates (with optional filters)
     */
    async getTemplates(req, res) {
        try {
            const { category, isPublic, createdBy, tags } = req.query;

            const filter = { status: 'completed' };

            if (category) filter.category = category;
            if (isPublic !== undefined) filter.isPublic = isPublic === 'true';
            if (createdBy) filter.createdBy = createdBy;
            if (tags) filter.tags = { $in: tags.split(',') };

            const templates = await Template.find(filter)
                .sort({ createdAt: -1 })
                .lean();

            return { status: 200, json: { templates } };
        } catch (error) {
            console.error('Error fetching templates:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get a single template by ID
     */
    async getTemplateById(req, res) {
        try {
            const { id } = req.params;
            const template = await Template.findById(id);

            if (!template) {
                return { status: 404, json: { error: 'Template not found' } };
            }

            return { status: 200, json: { template } };
        } catch (error) {
            console.error('Error fetching template:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Update template
     */
    async updateTemplate(req, res) {
        try {
            const { id } = req.params;
            const { name, description, category, tags, isPublic } = req.body;

            const template = await Template.findById(id);
            if (!template) {
                return { status: 404, json: { error: 'Template not found' } };
            }

            if (name) template.name = name;
            if (description !== undefined) template.description = description;
            if (category) template.category = category;
            if (tags) template.tags = tags;
            if (isPublic !== undefined) template.isPublic = isPublic;

            await template.save();

            return { status: 200, json: { success: true, template } };
        } catch (error) {
            console.error('Error updating template:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Delete template
     */
    async deleteTemplate(req, res) {
        try {
            const { id } = req.params;
            const template = await Template.findByIdAndDelete(id);

            if (!template) {
                return { status: 404, json: { error: 'Template not found' } };
            }

            return { status: 200, json: { success: true, message: 'Template deleted' } };
        } catch (error) {
            console.error('Error deleting template:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Use a template to generate images for a user
     */
    async useTemplate(req, res) {
        try {
            const { id } = req.params;
            const { userImage, userId, selectedVariations } = req.body;

            if (!userImage || !userId) {
                return { status: 400, json: { error: 'User image and userId are required' } };
            }

            const template = await Template.findById(id);
            if (!template) {
                return { status: 404, json: { error: 'Template not found' } };
            }

            // Increment usage count
            template.usageCount += 1;
            await template.save();

            // Get prompts to use
            let promptsToUse = template.variations;
            if (selectedVariations && Array.isArray(selectedVariations)) {
                promptsToUse = template.variations.filter((_, index) =>
                    selectedVariations.includes(index)
                );
            }

            // Upload user's image
            let userImageData = userImage.data || userImage;
            let mimeType = userImage.mimeType || 'image/jpeg';

            if (typeof userImageData === 'string' && userImageData.startsWith('http')) {
                const response = await fetch(userImageData);
                const arrayBuffer = await response.arrayBuffer();
                userImageData = Buffer.from(arrayBuffer).toString('base64');
            }

            // Generate images using template prompts
            const results = [];
            const errors = [];

            for (let i = 0; i < promptsToUse.length; i++) {
                const variation = promptsToUse[i];
                console.log(`🎨 [USE TEMPLATE] Generating ${i + 1}/${promptsToUse.length}`);

                try {
                    const imageUrl = await this.generateSingleImage(
                        userImageData,
                        mimeType,
                        variation.prompt,
                        template.settings.aspectRatio,
                        template.settings.imageSize,
                        template.settings.style
                    );

                    results.push({
                        prompt: variation.prompt,
                        imageUrl,
                        originalTemplateImage: variation.generatedImageUrl,
                    });

                    if (i < promptsToUse.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    console.error(`❌ [USE TEMPLATE] Error:`, error);
                    errors.push({
                        prompt: variation.prompt,
                        error: error.message,
                    });
                }
            }

            return {
                status: 200,
                json: {
                    success: true,
                    templateName: template.name,
                    results,
                    errors,
                },
            };

        } catch (error) {
            console.error('Error using template:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Get templates by category
     */
    async getTemplatesByCategory(req, res) {
        try {
            const { category } = req.params;
            const templates = await Template.find({ category, isPublic: true })
                .select('name description category referenceImageUrl variations settings tags createdBy createdAt')
                .limit(20);

            return {
                status: 200,
                json: {
                    success: true,
                    count: templates.length,
                    templates,
                },
            };
        } catch (error) {
            console.error('Error fetching templates by category:', error);
            return { status: 500, json: { error: error.message } };
        }
    }

    /**
     * Create template from pre-generated image URLs
     */
    async createTemplateFromUrls(req, res) {
        try {
            console.log('🎨 [TEMPLATE] Creating template from URLs...');

            const {
                name,
                description,
                category,
                imageUrls,
                createdBy,
                tags,
                isPublic,
            } = req.body;

            if (!name || !imageUrls || !createdBy) {
                return { status: 400, json: { error: 'Name, imageUrls, and createdBy are required' } };
            }

            if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
                return { status: 400, json: { error: 'imageUrls must be a non-empty array' } };
            }

            // Create variations from URLs
            const variations = imageUrls.map((url, index) => ({
                generatedImageUrl: url,
                order: index,
                prompt: `Generated variation ${index + 1}`,
            }));

            // Create template
            const template = await Template.create({
                name,
                description,
                category: category || 'other',
                referenceImageUrl: imageUrls[0], // Use first image as reference
                variations,
                settings: {
                    aspectRatio: '1:1',
                    imageSize: '1K',
                    style: 'none',
                },
                isPublic: isPublic || false,
                createdBy,
                tags: tags || [],
                status: 'completed',
            });

            console.log('✅ [TEMPLATE] Template created from URLs:', template._id);

            return {
                status: 201,
                json: {
                    success: true,
                    templateId: template._id,
                    template,
                },
            };

        } catch (error) {
            console.error('❌ [TEMPLATE] Error creating template from URLs:', error);
            return { status: 500, json: { error: error.message } };
        }
    }
}

module.exports = TemplateController;