const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const visualStyleSchema = new mongoose.Schema({
  keywords: [{ type: String }],
  colors: [{ type: String }],
  mood: [{ type: String }],
}, { _id: false });

const profileSchema = new mongoose.Schema({
  profileId: {
    type: String,
    unique: true,
    default: () => 'profile-' + uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['personal', 'brand'],
    default: 'personal',
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  niche: {
    type: String,
  },
  goals: [{
    type: String,
  }],
  toneOfVoice: [{
    type: String,
  }],
  visualStyle: visualStyleSchema,
  platforms: [{
    type: String,
    enum: ['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'twitter'],
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  // Reference face/product images linked to this profile
  primaryFaceImageUrl: {
    type: String,
  },
  primaryProductImageUrl: {
    type: String,
  },
}, { timestamps: true });

// Index for quick lookup of active profile
profileSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('Profile', profileSchema);