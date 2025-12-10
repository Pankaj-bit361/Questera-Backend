const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Campaign Model
 * Groups multiple scheduled posts into a cohesive campaign
 */
const campaignSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    unique: true,
    default: () => 'camp-' + uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  // Campaign type
  type: {
    type: String,
    enum: ['product_launch', 'brand_awareness', 'engagement', 'promotional', 'content_series', 'custom'],
    default: 'custom',
  },
  // Target platforms
  platforms: [{
    type: String,
    enum: ['instagram', 'tiktok', 'linkedin', 'facebook', 'twitter'],
  }],
  // Scheduling configuration
  schedule: {
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    postsPerDay: { type: Number, default: 1 },
    postingTimes: [{ type: String }], // ["09:00", "12:00", "18:00"]
    interval: { type: String, enum: ['hourly', 'daily', 'custom'], default: 'daily' },
    intervalMinutes: { type: Number }, // For custom intervals
    timezone: { type: String, default: 'UTC' },
  },
  // Content configuration
  content: {
    productImages: [{ type: String }], // Reference product images
    modelTypes: [{ type: String, enum: ['male', 'female', 'unisex', 'product_only'] }],
    styles: [{ type: String }],
    themes: [{ type: String }],
    customPrompts: [{ type: String }],
  },
  // Viral content settings
  viralSettings: {
    tone: { type: String, default: 'engaging' },
    niche: { type: String },
    goals: [{ type: String }],
    hashtagStrategy: { type: String, enum: ['trending', 'niche', 'mixed'], default: 'mixed' },
  },
  // Progress tracking
  progress: {
    totalPosts: { type: Number, default: 0 },
    generated: { type: Number, default: 0 },
    scheduled: { type: Number, default: 0 },
    posted: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'generating', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
    default: 'draft',
  },
  // Reference to content job
  contentJobId: {
    type: String,
  },
  // Performance metrics (aggregated)
  metrics: {
    totalLikes: { type: Number, default: 0 },
    totalComments: { type: Number, default: 0 },
    totalShares: { type: Number, default: 0 },
    totalReach: { type: Number, default: 0 },
    avgEngagementRate: { type: Number, default: 0 },
    bestPerformingPostId: { type: String },
    lastUpdated: Date,
  },
}, { timestamps: true });

// Index for finding active campaigns
campaignSchema.index({ userId: 1, status: 1 });
campaignSchema.index({ 'schedule.startDate': 1, status: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);

