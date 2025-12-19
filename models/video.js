const mongoose = require('mongoose');

// Settings for video generation
const videoSettingsSchema = new mongoose.Schema({
    resolution: {
        type: String,
        enum: ['720p', '1080p'],
        default: '720p'
    },
    duration: {
        type: String,
        enum: ['short', 'medium'],
        default: 'short'
    },
    style: {
        type: String,
        default: 'none'
    },
    instructions: {
        type: String,
        default: ''
    },
}, { _id: false });

// Video chat/project schema (like Image model)
const videoSchema = new mongoose.Schema({
    name: String,
    desc: String,
    userId: {
        type: String,
        required: true,
        index: true
    },
    videoChatId: {
        type: String,
        required: true,
        unique: true
    },
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VideoMessage',
    }],
    videoSettings: videoSettingsSchema,
    // Reference images for this project (max 3)
    referenceImages: [{
        type: String
    }],
},
    { timestamps: true }
);

module.exports = mongoose.model('Video', videoSchema);
