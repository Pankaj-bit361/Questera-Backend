const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const outputAssetSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  promptUsed: {
    type: String,
  },
  score: {
    type: Number,
    min: 0,
    max: 100,
  },
  style: {
    type: String,
  },
  caption: {
    type: String,
  },
  hashtags: [{
    type: String,
  }],
  platform: {
    type: String,
    enum: ['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'twitter', 'general'],
    default: 'general',
  },
  aspectRatio: {
    type: String,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const designBriefSchema = new mongoose.Schema({
  concept: String,
  mood: [String],
  colors: [String],
  composition: String,
  targetPlatform: String,
  targetAspectRatio: String,
  styleDirection: String,
  referenceNotes: String,
}, { _id: false });

const viralContentSchema = new mongoose.Schema({
  title: String,
  hook: String,
  description: String,
  shortCaption: String,
  callToAction: String,
  hashtags: {
    primary: [String],
    secondary: [String],
    niche: [String],
    branded: [String],
  },
  hashtagString: String,
  bestPostingTimes: [String],
  viralScore: { type: Number, min: 1, max: 10 },
  viralTips: [String],
}, { _id: false });

const contentJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    unique: true,
    default: () => 'job-' + uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  profileId: {
    type: String,
    index: true,
  },
  type: {
    type: String,
    enum: ['image_generation', 'campaign', 'single', 'remix', 'batch'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
  },
  // User's original request
  userRequest: {
    type: String,
  },
  // Generated design brief
  inputBrief: designBriefSchema,
  // Viral content for posting (hashtags, title, description)
  viralContent: viralContentSchema,
  // Generated prompts for image generation
  prompts: [{
    type: String,
  }],
  // Reference images used
  referenceImageUrls: [{
    type: String,
  }],
  // Generated outputs
  outputAssets: [outputAssetSchema],
  // Progress tracking
  progress: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  // Error info if failed
  error: {
    message: String,
    code: String,
    details: mongoose.Schema.Types.Mixed,
  },
  // Link to chat conversation
  imageChatId: {
    type: String,
  },
  // Scheduling info for auto-posting
  scheduledPostTime: {
    type: Date,
  },
  postedAt: {
    type: Date,
  },
}, { timestamps: true });

// Indexes for efficient queries
contentJobSchema.index({ userId: 1, status: 1 });
contentJobSchema.index({ userId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('ContentJob', contentJobSchema);