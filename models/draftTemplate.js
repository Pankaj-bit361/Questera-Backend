const mongoose = require('mongoose');

/**
 * Schema for generated preview images during template creation
 */
const previewImageSchema = new mongoose.Schema({
    prompt: {
        type: String,
        required: true,
    },
    imageUrl: {
        type: String,
        required: true,
    },
    order: {
        type: Number,
        default: 0,
    },
    isApproved: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

/**
 * DraftTemplate Schema - Templates pending approval
 * Once approved, they are converted to regular Templates
 */
const draftTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    category: {
        type: String,
        enum: ['professional', 'casual', 'artistic', 'lifestyle', 'seasonal', 'fashion', 'portrait', 'other'],
        default: 'other',
    },
    // The prompts submitted for image generation
    prompts: [{
        type: String,
        required: true,
    }],
    // Reference images used for generation (URLs after upload to S3)
    referenceImageUrls: [{
        type: String,
    }],
    // Generated preview images
    previewImages: [previewImageSchema],
    // Settings for image generation
    settings: {
        aspectRatio: {
            type: String,
            default: '1:1',
        },
        imageSize: {
            type: String,
            default: '1K',
        },
        style: {
            type: String,
            default: 'photorealistic',
        },
    },
    // Status of the draft template
    status: {
        type: String,
        enum: ['pending', 'generating', 'ready_for_review', 'approved', 'rejected'],
        default: 'pending',
    },
    // Who created this draft
    createdBy: {
        type: String,
        required: true,
    },
    // Tags for categorization
    tags: [{
        type: String,
        trim: true,
    }],
    // Whether to make public after approval
    isPublic: {
        type: Boolean,
        default: true,
    },
    // Error message if generation failed
    errorMessage: {
        type: String,
    },
    // ID of the final template after approval
    approvedTemplateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Template',
    },
}, { timestamps: true });

// Indexes for faster queries
draftTemplateSchema.index({ status: 1 });
draftTemplateSchema.index({ createdBy: 1 });
draftTemplateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DraftTemplate', draftTemplateSchema);

