const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const emailCampaignSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    unique: true,
    default: () => 'camp-' + uuidv4(),
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  // Email content
  subject: {
    type: String,
    required: true,
  },
  templateType: {
    type: String,
    enum: ['creator_outreach', 'product_launch', 'custom'],
    default: 'creator_outreach',
  },
  // Campaign status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
    default: 'draft',
    index: true,
  },
  // Scheduling
  scheduledAt: {
    type: Date,
  },
  startedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  // Rate limiting
  sendRate: {
    type: Number,
    default: 10, // emails per second (SES limit is 14)
  },
  // Stats (cached for dashboard)
  stats: {
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
  },
  // Sender info
  fromEmail: {
    type: String,
    default: 'no-reply@velosapps.com',
  },
  replyTo: {
    type: String,
    default: 'pankaj@velosapps.com',
  },
  // Filters for leads
  filters: {
    categories: [String],
    minFollowers: String,
    maxFollowers: String,
  },
  // Last processed lead (for resume)
  lastProcessedLeadId: {
    type: String,
  },
  // Created by (admin user)
  createdBy: {
    type: String,
  },
}, { timestamps: true });

// Update stats from leads
emailCampaignSchema.methods.refreshStats = async function() {
  const EmailLead = mongoose.model('EmailLead');
  const stats = await EmailLead.getCampaignStats(this.campaignId);
  this.stats = stats;
  await this.save();
  return stats;
};

module.exports = mongoose.model('EmailCampaign', emailCampaignSchema);

