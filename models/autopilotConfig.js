const mongoose = require('mongoose');

const autopilotConfigSchema = new mongoose.Schema({
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
  platform: {
    type: String,
    enum: ['instagram', 'twitter', 'linkedin', 'tiktok'],
    default: 'instagram',
  },
  enabled: {
    type: Boolean,
    default: false,
  },

  // Posting limits
  limits: {
    maxFeedPostsPerDay: { type: Number, default: 1, min: 0, max: 5 },
    maxStoriesPerDay: { type: Number, default: 2, min: 0, max: 10 },
    maxRepliesPerHour: { type: Number, default: 5, min: 0, max: 20 },
  },

  // What autopilot is allowed to do
  permissions: {
    autoPost: { type: Boolean, default: true },
    autoStory: { type: Boolean, default: false },
    autoReplyComments: { type: Boolean, default: false },
    autoDMs: { type: Boolean, default: false }, // Always false for safety
  },

  // Quiet hours - no posting during this time
  quietHours: {
    enabled: { type: Boolean, default: true },
    start: { type: String, default: '22:00' }, // 10 PM
    end: { type: String, default: '07:00' },   // 7 AM
    timezone: { type: String, default: 'Asia/Kolkata' },
  },

  // Content preferences
  contentPreferences: {
    allowedThemes: {
      type: [String],
      default: ['educational', 'behind_the_scenes', 'promotional', 'engagement', 'trending'],
    },
    blockedThemes: {
      type: [String],
      default: [],
    },
    preferredFormats: {
      type: [String],
      default: ['image', 'carousel'],
    },
    tone: {
      type: String,
      enum: ['professional', 'casual', 'friendly', 'bold', 'inspirational'],
      default: 'friendly',
    },
  },

  // Pause functionality
  pausedUntil: {
    type: Date,
    default: null,
  },

  // Last run info
  lastRunAt: {
    type: Date,
    default: null,
  },
  lastRunResult: {
    type: String,
    enum: ['success', 'partial', 'failed', 'skipped'],
    default: null,
  },
  lastRunSummary: {
    type: String,
    default: null,
  },

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
autopilotConfigSchema.index({ userId: 1, chatId: 1 }, { unique: true });

// Update timestamp on save
autopilotConfigSchema.pre('save', function () {
  this.updatedAt = new Date();
});

// Check if autopilot is currently active (enabled and not paused)
autopilotConfigSchema.methods.isActive = function () {
  if (!this.enabled) return false;
  if (this.pausedUntil && new Date() < this.pausedUntil) return false;
  return true;
};

// Check if current time is within quiet hours
autopilotConfigSchema.methods.isQuietHours = function () {
  if (!this.quietHours.enabled) return false;

  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;

  const [startH, startM] = this.quietHours.start.split(':').map(Number);
  const [endH, endM] = this.quietHours.end.split(':').map(Number);
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }
  return currentTime >= startTime && currentTime < endTime;
};

module.exports = mongoose.model('AutopilotConfig', autopilotConfigSchema);

