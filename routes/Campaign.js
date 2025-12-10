const express = require('express');
const campaignRouter = express.Router();
const CampaignOrchestrator = require('../functions/CampaignOrchestrator');
const Campaign = require('../models/campaign');

const campaignOrchestrator = new CampaignOrchestrator();

/**
 * POST /campaigns/create
 * Create a new automated campaign
 * 
 * Body:
 * - userId: string (required)
 * - name: string (required)
 * - description: string
 * - socialAccountId: string (required)
 * - productImages: array of { url, data, mimeType }
 * - modelTypes: ['male', 'female']
 * - postsPerModel: number
 * - schedule: { startDate, postsPerDay, postingTimes, intervalMinutes, timezone }
 * - viralSettings: { tone, niche, goals, hashtagStrategy }
 * - userRequest: string (natural language description)
 */
campaignRouter.post('/create', async (req, res) => {
  try {
    const { userId, name, socialAccountId } = req.body;

    if (!userId || !name || !socialAccountId) {
      return res.status(400).json({ 
        error: 'userId, name, and socialAccountId are required' 
      });
    }

    const result = await campaignOrchestrator.createAutomatedCampaign(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CAMPAIGN] Create Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /campaigns/:campaignId/execute
 * Execute a campaign (generate images + schedule posts)
 * 
 * Body:
 * - referenceImages: array of { data, mimeType } (base64 encoded images)
 */
campaignRouter.post('/:campaignId/execute', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { referenceImages = [] } = req.body;

    const result = await campaignOrchestrator.executeCampaign(campaignId, referenceImages);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CAMPAIGN] Execute Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /campaigns/quick
 * Create and execute a campaign in one call
 * 
 * Same body as /create but executes immediately
 */
campaignRouter.post('/quick', async (req, res) => {
  try {
    const { userId, name, socialAccountId } = req.body;

    if (!userId || !name || !socialAccountId) {
      return res.status(400).json({ 
        error: 'userId, name, and socialAccountId are required' 
      });
    }

    const result = await campaignOrchestrator.quickCampaign(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CAMPAIGN] Quick Campaign Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /campaigns/:campaignId/status
 * Get campaign status with progress
 */
campaignRouter.get('/:campaignId/status', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const result = await campaignOrchestrator.getCampaignStatus(campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[CAMPAIGN] Status Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /campaigns/user/:userId
 * Get all campaigns for a user
 */
campaignRouter.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, limit = 20 } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    return res.status(200).json({ 
      success: true, 
      campaigns: campaigns.map(c => ({
        campaignId: c.campaignId,
        name: c.name,
        description: c.description,
        status: c.status,
        progress: c.progress,
        schedule: c.schedule,
        createdAt: c.createdAt,
      }))
    });
  } catch (error) {
    console.error('[CAMPAIGN] List Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /campaigns/:campaignId
 * Cancel and delete a campaign
 */
campaignRouter.delete('/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { userId } = req.body;

    const campaign = await Campaign.findOne({ campaignId, userId });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Cancel all pending scheduled posts
    const ScheduledPost = require('../models/scheduledPost');
    await ScheduledPost.updateMany(
      { campaignId, status: { $in: ['pending', 'scheduled'] } },
      { status: 'cancelled' }
    );

    campaign.status = 'cancelled';
    await campaign.save();

    return res.status(200).json({ success: true, message: 'Campaign cancelled' });
  } catch (error) {
    console.error('[CAMPAIGN] Delete Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = campaignRouter;

