const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const emailLeadSchema = new mongoose.Schema({
  leadId: {
    type: String,
    unique: true,
    default: () => 'lead-' + uuidv4(),
  },
  // Instagram data
  username: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  followers: {
    type: String,
  },
  category: {
    type: String,
    index: true,
  },
  bio: {
    type: String,
  },
  profileUrl: {
    type: String,
  },
  // Scraped source
  source: {
    type: String,
    default: 'instagram_scraper',
  },
  sourceFile: {
    type: String,
  },
  // Day assignment (1-11 for daily batches)
  day: {
    type: Number,
    index: true,
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'standard'],
    default: 'standard',
  },
  // Email status
  status: {
    type: String,
    enum: ['pending', 'sent', 'opened', 'clicked', 'bounced', 'unsubscribed', 'complained'],
    default: 'pending',
    index: true,
  },
  // Campaign tracking
  campaignId: {
    type: String,
    index: true,
  },
  sentAt: {
    type: Date,
  },
  openedAt: {
    type: Date,
  },
  clickedAt: {
    type: Date,
  },
  // SES tracking
  sesMessageId: {
    type: String,
  },
  // Error tracking
  errorMessage: {
    type: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Compound indexes for efficient queries
emailLeadSchema.index({ status: 1, campaignId: 1 });
emailLeadSchema.index({ email: 1, campaignId: 1 }, { unique: true });

// Static method to get stats
emailLeadSchema.statics.getCampaignStats = async function (campaignId) {
  const stats = await this.aggregate([
    { $match: { campaignId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    total: 0,
    pending: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
    complained: 0,
  };

  stats.forEach(s => {
    result[s._id] = s.count;
    result.total += s.count;
  });

  return result;
};

module.exports = mongoose.model('EmailLead', emailLeadSchema);

