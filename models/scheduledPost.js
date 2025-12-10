const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const scheduledPostSchema = new mongoose.Schema({
  postId: {
    type: String,
    unique: true,
    default: () => 'post-' + uuidv4(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  // Content
  imageUrl: {
    type: String,
    required: true,
  },
  imageUrls: [{
    type: String, // For carousel posts
  }],
  caption: {
    type: String,
    default: '',
  },
  hashtags: {
    type: String,
    default: '',
  },
  postType: {
    type: String,
    enum: ['image', 'carousel', 'video', 'reel', 'story'],
    default: 'image',
  },
  // Campaign reference
  campaignId: {
    type: String,
    index: true,
  },
  // Platform & Account
  platform: {
    type: String,
    enum: ['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin'],
    default: 'instagram',
  },
  accountId: {
    type: String, // For multi-account support
  },
  // Scheduling
  scheduledAt: {
    type: Date,
    required: true,
    index: true,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  // Recurring/Frequency settings
  isRecurring: {
    type: Boolean,
    default: false,
  },
  frequency: {
    type: String,
    enum: ['once', 'daily', 'weekly', 'custom'],
    default: 'once',
  },
  frequencyDays: [{
    type: Number, // 0=Sunday, 1=Monday, etc.
    min: 0,
    max: 6,
  }],
  frequencyTime: {
    type: String, // HH:MM format
  },
  repeatUntil: {
    type: Date,
  },
  // Status
  status: {
    type: String,
    enum: ['scheduled', 'published', 'failed', 'cancelled'],
    default: 'scheduled',
    index: true,
  },
  // Publishing results
  publishedAt: {
    type: Date,
  },
  publishedMediaId: {
    type: String, // ID from Instagram/platform
  },
  publishError: {
    type: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  // Link to content job (if from AI generation)
  contentJobId: {
    type: String,
  },
  // Original chat context
  imageChatId: {
    type: String,
  },
  // Engagement tracking (updated after posting)
  engagement: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    lastUpdated: Date,
  },
  // Platform URL after posting
  platformPostUrl: {
    type: String,
  },
}, { timestamps: true });

// Indexes for efficient queries
scheduledPostSchema.index({ userId: 1, status: 1, scheduledAt: 1 });
scheduledPostSchema.index({ status: 1, scheduledAt: 1 }); // For cron job to find due posts

// Virtual for full caption (caption + hashtags)
scheduledPostSchema.virtual('fullCaption').get(function () {
  const parts = [];
  if (this.caption) parts.push(this.caption);
  if (this.hashtags) parts.push(this.hashtags);
  return parts.join('\n\n');
});

// Static method to find posts due for publishing
scheduledPostSchema.statics.findDuePosts = function () {
  return this.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() },
    retryCount: { $lt: 3 }, // Max 3 retries
  }).sort({ scheduledAt: 1 });
};

// Static method to get posts for calendar view
scheduledPostSchema.statics.getCalendarPosts = function (userId, startDate, endDate) {
  return this.find({
    userId,
    scheduledAt: { $gte: startDate, $lte: endDate },
    status: { $in: ['scheduled', 'published'] },
  }).sort({ scheduledAt: 1 });
};

module.exports = mongoose.model('ScheduledPost', scheduledPostSchema);

