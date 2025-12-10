const mongoose = require('mongoose');
const { ASPECT_RATIOS, IMAGE_SIZES, STYLES } = require('../enums/imageEnums');

const imageSettingsSchema = new mongoose.Schema({
    aspectRatio: {
        type: String,
        enum: ASPECT_RATIOS,
        default: 'auto'
    },
    imageSize: {
        type: String,
        enum: IMAGE_SIZES,
        default: '2K'
    },
    style: {
        type: String,
        enum: STYLES,
        default: 'none'
    },
    instructions: {
        type: String,
        default: ''
    },
    temperature: {
        type: Number,
        min: 0,
        max: 2,
        default: 1
    },
    topP: {
        type: Number,
        min: 0,
        max: 1,
        default: 1
    },
}, { _id: false });

const imageSchema = new mongoose.Schema({
    name: String,
    desc: String,
    userId: String,
    imageChatId: {
        type: String,
        required: true,
        unique: true
    },
    messages: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ImageMessage',
        },
    ],
    imageSettings: imageSettingsSchema,
},
    { timestamps: true }
);

module.exports = mongoose.model('Image', imageSchema);