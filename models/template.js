const mongoose = require('mongoose');

const templateVariationSchema = new mongoose.Schema({
    prompt: {
        type: String,
        required: true,
    },
    generatedImageUrl: {
        type: String,
        required: true,
    },
    order: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

const templateSchema = new mongoose.Schema({
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
    referenceImageUrl: {
        type: String,
        required: true,
    },
    variations: [templateVariationSchema],
    settings: {
        aspectRatio: {
            type: String,
            default: '1:1',
        },
        imageSize: {
            type: String,
            default: '2K',
        },
        style: {
            type: String,
            default: 'photorealistic',
        },
    },
    isPublic: {
        type: Boolean,
        default: false,
    },
    createdBy: {
        type: String,
        required: true,
    },
    usageCount: {
        type: Number,
        default: 0,
    },
    tags: [{
        type: String,
        trim: true,
    }],
    status: {
        type: String,
        enum: ['draft', 'processing', 'completed', 'failed'],
        default: 'draft',
    },
}, { timestamps: true });

// Index for faster queries
templateSchema.index({ category: 1, isPublic: 1 });
templateSchema.index({ createdBy: 1 });
templateSchema.index({ tags: 1 });

module.exports = mongoose.model('Template', templateSchema);