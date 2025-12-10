const express = require('express');
const viralRouter = express.Router();
const ViralContentService = require('../functions/ViralContentService');

const viralService = new ViralContentService();

/**
 * GET /viral/trends/:niche
 * Get trending content in a niche
 */
viralRouter.get('/trends/:niche', async (req, res) => {
  try {
    const { niche } = req.params;
    const { platform = 'instagram', count = 10 } = req.query;

    const trends = await viralService.findTrendingContent(niche, platform, parseInt(count));
    return res.status(200).json({ success: true, ...trends });
  } catch (error) {
    console.error('[VIRAL] Trends Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /viral/competitor/:handle
 * Analyze a competitor's content strategy
 */
viralRouter.get('/competitor/:handle', async (req, res) => {
  try {
    const { handle } = req.params;
    const { platform = 'instagram' } = req.query;

    const analysis = await viralService.analyzeCompetitor(handle, platform);
    return res.status(200).json({ success: true, ...analysis });
  } catch (error) {
    console.error('[VIRAL] Competitor Analysis Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /viral/ideas
 * Generate viral content ideas for a brand
 */
viralRouter.post('/ideas', async (req, res) => {
  try {
    const {
      userId,
      niche,
      platform = 'instagram',
      brandDescription,
      productType,
      targetAudience,
      count = 5,
    } = req.body;

    if (!userId || !niche) {
      return res.status(400).json({ error: 'userId and niche are required' });
    }

    const ideas = await viralService.generateViralIdeas(userId, {
      niche,
      platform,
      brandDescription,
      productType,
      targetAudience,
      count,
    });

    return res.status(200).json({ success: true, ...ideas });
  } catch (error) {
    console.error('[VIRAL] Ideas Generation Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /viral/package
 * Create a full viral content package (image + caption + hashtags)
 */
viralRouter.post('/package', async (req, res) => {
  try {
    const { userId, ideaIndex, viralIdeas } = req.body;

    if (!userId || ideaIndex === undefined || !viralIdeas) {
      return res.status(400).json({ error: 'userId, ideaIndex, and viralIdeas are required' });
    }

    const package = await viralService.createViralPackage(userId, ideaIndex, viralIdeas);
    return res.status(200).json({ success: true, ...package });
  } catch (error) {
    console.error('[VIRAL] Package Creation Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /viral/hashtags/:niche
 * Get trending hashtags for a niche
 */
viralRouter.get('/hashtags/:niche', async (req, res) => {
  try {
    const { niche } = req.params;
    const { platform = 'instagram', count = 30 } = req.query;

    const hashtags = await viralService.getTrendingHashtags(niche, platform, parseInt(count));
    return res.status(200).json({ success: true, ...hashtags });
  } catch (error) {
    console.error('[VIRAL] Hashtags Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /viral/formula/:contentType
 * Analyze why a content type goes viral
 */
viralRouter.get('/formula/:contentType', async (req, res) => {
  try {
    const { contentType } = req.params;
    const { platform = 'instagram' } = req.query;

    const formula = await viralService.analyzeViralFormula(contentType, platform);
    return res.status(200).json({ success: true, ...formula });
  } catch (error) {
    console.error('[VIRAL] Formula Analysis Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = viralRouter;

