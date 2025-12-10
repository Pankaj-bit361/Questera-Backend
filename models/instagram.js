const mongoose = require('mongoose');

// Sub-schema for individual Instagram accounts (for multi-account support)
const instagramAccountSchema = new mongoose.Schema({
  instagramBusinessAccountId: {
    type: String,
    required: true,
  },
  facebookPageId: {
    type: String,
    required: true,
  },
  facebookPageName: {
    type: String,
  },
  accessToken: {
    type: String,
    required: true,
  },
  instagramUsername: {
    type: String,
  },
  instagramName: {
    type: String,
  },
  profilePictureUrl: {
    type: String,
  },
  isConnected: {
    type: Boolean,
    default: true,
  },
  connectedAt: {
    type: Date,
    default: Date.now,
  },
});

// Main schema - now supports single account (backward compatible)
// Can be upgraded to accounts[] array for multi-account
const instagramSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Single account fields (current implementation)
    instagramBusinessAccountId: {
      type: String,
    },
    facebookPageId: {
      type: String,
    },
    facebookPageName: {
      type: String,
    },
    accessToken: {
      type: String,
    },
    refreshToken: {
      type: String,
    },
    tokenExpiresAt: {
      type: Date,
    },
    instagramUsername: {
      type: String,
    },
    instagramName: {
      type: String,
    },
    profilePictureUrl: {
      type: String,
    },
    isConnected: {
      type: Boolean,
      default: true,
    },
    lastTokenRefresh: {
      type: Date,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    // Multi-account support (for future use)
    accounts: [instagramAccountSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Instagram', instagramSchema);