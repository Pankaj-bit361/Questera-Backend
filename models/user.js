const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        unique: true,
        default: () => 'u-' + uuidv4(),
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    name: {
        type: String,
        trim: true,
    },
    avatar: {
        type: String,
    },
    authProvider: {
        type: String,
        enum: ['google', 'email'],
        required: true,
    },
    googleId: {
        type: String,
        sparse: true,
    },
    otp: {
        code: String,
        expiresAt: Date,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    lastLogin: {
        type: Date,
    },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;