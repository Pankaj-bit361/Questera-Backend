const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * GenerationJob Schema
 * Recurring jobs that generate NEW images at scheduled times and auto-post
 * 
 * Use Cases:
 * - "Create a new product photo every hour and post to Instagram"
 * - "Generate daily inspiration quote images for my brand"
 * - "Create trending content every 30 minutes based on my niche"
 */
const generationJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  
  // Job Configuration
  name: { type: String, required: true },
  description: { type: String },
  
  // What to generate
  generationConfig: {
    // Base prompt/instruction for generation
    basePrompt: { type: String, required: true },
    // Reference images (product images, style refs, etc.)
    referenceImages: [{ url: String, type: String }],
    // Variation strategy
    variationStrategy: {
      type: String,
      enum: ['random_style', 'rotating_themes', 'trending_topics', 'time_based', 'custom'],
      default: 'random_style',
    },
    // Themes to rotate through
    themes: [String],
    // Styles to vary
    styles: [String],
    // Model types (for product on models)
    modelTypes: [{ type: String, enum: ['male', 'female', 'unisex', 'product_only'] }],
    // Include viral optimization
    viralOptimization: { type: Boolean, default: true },
  },
  
  // Where to post
  postingConfig: {
    platform: { type: String, enum: ['instagram', 'tiktok', 'linkedin'], default: 'instagram' },
    socialAccountId: { type: String, required: true },
    autoPost: { type: Boolean, default: true }, // If false, just generates and saves
    captionStyle: { type: String, enum: ['viral', 'professional', 'casual', 'minimal'], default: 'viral' },
    hashtagStrategy: { type: String, enum: ['trending', 'niche', 'mixed', 'none'], default: 'mixed' },
  },
  
  // Scheduling
  schedule: {
    frequency: { type: String, enum: ['minutes', 'hourly', 'daily', 'weekly', 'custom'], default: 'hourly' },
    intervalMinutes: { type: Number, default: 60 }, // Generate every X minutes
    timezone: { type: String, default: 'UTC' },
    activeHours: {
      start: { type: Number, default: 8 },  // 8 AM
      end: { type: Number, default: 22 },   // 10 PM
    },
    activeDays: [{ type: Number }], // 0-6 (Sunday-Saturday), empty = all days
    nextRunAt: { type: Date },
    lastRunAt: { type: Date },
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'failed', 'draft'],
    default: 'draft',
  },
  
  // Limits
  limits: {
    maxPosts: { type: Number, default: 100 }, // Stop after X posts
    endDate: { type: Date }, // Stop after this date
    postsGenerated: { type: Number, default: 0 },
    postsPublished: { type: Number, default: 0 },
    postsFailed: { type: Number, default: 0 },
  },
  
  // History of generated posts
  history: [{
    generatedAt: Date,
    imageUrl: String,
    prompt: String,
    theme: String,
    style: String,
    postId: String, // Reference to ScheduledPost
    status: { type: String, enum: ['generated', 'posted', 'failed'] },
    error: String,
    engagement: {
      likes: Number,
      comments: Number,
      shares: Number,
    },
  }],
  
  // Error tracking
  lastError: {
    message: String,
    occurredAt: Date,
    count: { type: Number, default: 0 },
  },
  
}, { timestamps: true });

// Indexes for cron queries
generationJobSchema.index({ status: 1, 'schedule.nextRunAt': 1 });
generationJobSchema.index({ userId: 1, status: 1 });

// Find jobs that need to run
generationJobSchema.statics.findDueJobs = function() {
  return this.find({
    status: 'active',
    'schedule.nextRunAt': { $lte: new Date() },
    $or: [
      { 'limits.maxPosts': { $exists: false } },
      { $expr: { $lt: ['$limits.postsGenerated', '$limits.maxPosts'] } },
    ],
  }).sort({ 'schedule.nextRunAt': 1 });
};

// Calculate next run time
generationJobSchema.methods.calculateNextRun = function() {
  const now = new Date();
  const next = new Date(now.getTime() + this.schedule.intervalMinutes * 60 * 1000);
  
  // Check if within active hours
  const hour = next.getHours();
  if (hour < this.schedule.activeHours.start) {
    next.setHours(this.schedule.activeHours.start, 0, 0, 0);
  } else if (hour >= this.schedule.activeHours.end) {
    next.setDate(next.getDate() + 1);
    next.setHours(this.schedule.activeHours.start, 0, 0, 0);
  }
  
  // Check if active day (if activeDays specified)
  if (this.schedule.activeDays?.length > 0) {
    while (!this.schedule.activeDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
  }
  
  return next;
};

module.exports = mongoose.model('GenerationJob', generationJobSchema);

