const mongoose = require('mongoose');

const contentHistorySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  postId: { type: String },
  type: { type: String, enum: ['feed', 'story', 'reel'] },
  format: { type: String, enum: ['image', 'carousel', 'video'] },
  theme: { type: String },
  hookStyle: { type: String },
  performance: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
  },
}, { _id: false });

const autopilotMemorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  chatId: {
    type: String,
    required: true,
    index: true,
  },

  // Brand understanding (learned over time)
  brand: {
    tone: { type: String, default: 'friendly' },
    topicsAllowed: { type: [String], default: [] },
    topicsBlocked: { type: [String], default: [] },
    visualStyle: { type: String, default: 'modern' },
    targetAudience: { type: String, default: '' },
    uniqueSellingPoints: { type: [String], default: [] },
  },

  // Reference images for content generation
  referenceImages: {
    // Product images - actual products to feature in content
    productImages: [{
      url: { type: String, required: true },
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now },
    }],
    // Style references - aesthetic/mood references
    styleReferences: [{
      url: { type: String, required: true },
      name: { type: String, default: '' },
      uploadedAt: { type: Date, default: Date.now },
    }],
    // Personal reference - user's face for personalized AI images
    personalReference: {
      url: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
    },
  },

  // Performance insights (updated daily)
  performance: {
    // Best performing content types
    bestFormats: {
      type: Map,
      of: Number, // format -> avg engagement rate
      default: {},
    },
    bestThemes: {
      type: Map,
      of: Number, // theme -> avg engagement rate
      default: {},
    },
    bestHooks: {
      type: Map,
      of: Number, // hook style -> avg engagement rate
      default: {},
    },

    // Best posting times
    bestTimes: {
      type: [String], // ['10:00', '18:00']
      default: ['10:00', '18:00'],
    },
    bestDays: {
      type: [String], // ['monday', 'wednesday', 'friday']
      default: ['monday', 'wednesday', 'friday'],
    },

    // Overall metrics
    avgEngagementRate: { type: Number, default: 0 },
    avgReach: { type: Number, default: 0 },
    avgLikes: { type: Number, default: 0 },
    avgComments: { type: Number, default: 0 },

    // Trends
    engagementTrend7d: { type: String, enum: ['up', 'down', 'flat'], default: 'flat' },
    reachTrend7d: { type: String, enum: ['up', 'down', 'flat'], default: 'flat' },
  },

  // Recent content history (last 30 posts)
  contentHistory: {
    type: [contentHistorySchema],
    default: [],
  },

  // Last decision reasoning (for transparency)
  lastDecisionSummary: {
    type: String,
    default: null,
  },
  lastDecisionAt: {
    type: Date,
    default: null,
  },

  // Exploration mode (when things aren't working)
  explorationMode: {
    enabled: { type: Boolean, default: false },
    reason: { type: String, default: null },
    startedAt: { type: Date, default: null },
  },

  // Stats
  totalPostsGenerated: { type: Number, default: 0 },
  totalStoriesGenerated: { type: Number, default: 0 },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound unique index
autopilotMemorySchema.index({ userId: 1, chatId: 1 }, { unique: true });

// Update timestamp on save
autopilotMemorySchema.pre('save', function () {
  this.updatedAt = new Date();
});

// Add content to history (keep last 30)
autopilotMemorySchema.methods.addContentHistory = function (content) {
  this.contentHistory.unshift(content);
  if (this.contentHistory.length > 30) {
    this.contentHistory = this.contentHistory.slice(0, 30);
  }
};

// Get last N posts
autopilotMemorySchema.methods.getRecentContent = function (n = 7) {
  return this.contentHistory.slice(0, n);
};

// Check if theme was used recently
autopilotMemorySchema.methods.wasThemeUsedRecently = function (theme, days = 3) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.contentHistory.some(c => c.theme === theme && c.date > cutoff);
};

module.exports = mongoose.model('AutopilotMemory', autopilotMemorySchema);

