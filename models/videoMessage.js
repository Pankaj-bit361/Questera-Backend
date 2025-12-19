const mongoose = require('mongoose');

const videoMessageSchema = new mongoose.Schema({
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
    videoUrl: String,
    thumbnailUrl: String,
    // Reference images used (max 3)
    referenceImages: [{
        type: String
    }],
    // Start/end frames
    startFrameUrl: String,
    endFrameUrl: String,
    videoChatId: {
        type: String,
        required: true
    },
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    // Generation status for async tracking
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'completed'
    },
    operationId: String,
    error: String,
    // Google File reference (required for video extend - only Veo-generated videos can be extended)
    // Stored as Mixed type since it can be an object from generatedVideo.video
    googleFile: mongoose.Schema.Types.Mixed,
},
    { timestamps: true }
);

module.exports = mongoose.model('VideoMessage', videoMessageSchema);
