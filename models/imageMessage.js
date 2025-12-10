const mongoose = require('mongoose');

const imageMessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    imageUrl: String,
    referenceImages: [{
        type: String
    }],
    imageChatId: {
        type: String,
        required: true
    },
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    // Viral content for Instagram posts
    viralContent: {
        title: String,
        hook: String,
        description: String,
        shortCaption: String,
        callToAction: String,
        hashtags: {
            primary: [String],
            secondary: [String],
            niche: [String],
            branded: [String]
        },
        hashtagString: String,
        bestPostingTimes: [String],
        viralScore: Number,
        viralTips: [String]
    }
},
    { timestamps: true }
);

module.exports = mongoose.model('ImageMessage', imageMessageSchema);