const express = require('express');
const autopilotRouter = express.Router();
const AutopilotConfig = require('../models/autopilotConfig');
const AutopilotMemory = require('../models/autopilotMemory');
const AutopilotService = require('../functions/AutopilotService');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

const autopilotService = new AutopilotService();

// S3 client for image uploads
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const bucketName = process.env.AWS_S3_BUCKET_NAME;

// Helper to upload base64 image to S3
async function uploadToS3(base64Data, mimeType, folder = 'autopilot') {
  const extension = mimeType?.split('/')[1] || 'png';
  const fileName = `${folder}/${uuidv4()}.${extension}`;
  const buffer = Buffer.from(base64Data, 'base64');

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  }));

  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}

/**
 * GET /autopilot/config/:userId/:chatId
 * Get autopilot configuration for a chat
 */
autopilotRouter.get('/config/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    let config = await AutopilotConfig.findOne({ userId, chatId });

    if (!config) {
      // Return default config structure
      return res.status(200).json({
        success: true,
        config: {
          enabled: false,
          limits: { maxFeedPostsPerDay: 1, maxStoriesPerDay: 2, maxRepliesPerHour: 5 },
          permissions: { autoPost: true, autoStory: false, autoReplyComments: false, autoDMs: false },
          quietHours: { enabled: true, start: '22:00', end: '07:00' },
          contentPreferences: {
            allowedThemes: ['educational', 'behind_the_scenes', 'promotional', 'engagement', 'trending'],
            tone: 'friendly',
          },
        },
        exists: false,
      });
    }

    return res.status(200).json({ success: true, config, exists: true });
  } catch (error) {
    console.error('[AUTOPILOT] Config Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/config/:userId/:chatId
 * Create or update autopilot configuration
 */
autopilotRouter.post('/config/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const { enabled, limits, permissions, quietHours, contentPreferences } = req.body;

    let config = await AutopilotConfig.findOne({ userId, chatId });

    if (!config) {
      config = new AutopilotConfig({ userId, chatId });
    }

    // Update fields
    if (enabled !== undefined) config.enabled = enabled;
    if (limits) {
      config.limits = { ...config.limits, ...limits };
    }
    if (permissions) {
      config.permissions = { ...config.permissions, ...permissions };
      // Never allow autoDMs without explicit permission
      config.permissions.autoDMs = false;
    }
    if (quietHours) {
      config.quietHours = { ...config.quietHours, ...quietHours };
    }
    if (contentPreferences) {
      config.contentPreferences = { ...config.contentPreferences, ...contentPreferences };
    }

    await config.save();

    // Create memory if doesn't exist
    let memory = await AutopilotMemory.findOne({ userId, chatId });
    if (!memory) {
      memory = new AutopilotMemory({ userId, chatId });
      await memory.save();
    }

    return res.status(200).json({
      success: true,
      message: config.enabled ? 'Autopilot enabled' : 'Autopilot configuration saved',
      config,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Save Config Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/toggle/:userId/:chatId
 * Quick toggle autopilot on/off
 */
autopilotRouter.post('/toggle/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    let config = await AutopilotConfig.findOne({ userId, chatId });

    if (!config) {
      config = new AutopilotConfig({ userId, chatId, enabled: true });
    } else {
      config.enabled = !config.enabled;
    }

    await config.save();

    return res.status(200).json({
      success: true,
      enabled: config.enabled,
      message: config.enabled ? 'Autopilot enabled' : 'Autopilot disabled',
    });
  } catch (error) {
    console.error('[AUTOPILOT] Toggle Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/pause/:userId/:chatId
 * Pause autopilot for specified hours
 */
autopilotRouter.post('/pause/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const { hours = 24 } = req.body;

    const config = await AutopilotConfig.findOne({ userId, chatId });

    if (!config) {
      return res.status(404).json({ error: 'Autopilot not configured for this chat' });
    }

    config.pausedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await config.save();

    return res.status(200).json({
      success: true,
      message: `Autopilot paused for ${hours} hours`,
      pausedUntil: config.pausedUntil,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Pause Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/resume/:userId/:chatId
 * Resume paused autopilot
 */
autopilotRouter.post('/resume/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    const config = await AutopilotConfig.findOne({ userId, chatId });

    if (!config) {
      return res.status(404).json({ error: 'Autopilot not configured' });
    }

    config.pausedUntil = null;
    await config.save();

    return res.status(200).json({ success: true, message: 'Autopilot resumed' });
  } catch (error) {
    console.error('[AUTOPILOT] Resume Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/memory/:userId/:chatId
 * Get autopilot memory (performance insights, history)
 */
autopilotRouter.get('/memory/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    const memory = await AutopilotMemory.findOne({ userId, chatId });

    if (!memory) {
      return res.status(200).json({ success: true, memory: null, exists: false });
    }

    return res.status(200).json({ success: true, memory, exists: true });
  } catch (error) {
    console.error('[AUTOPILOT] Memory Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /autopilot/memory/:userId/:chatId
 * Update autopilot memory (brand info)
 */
autopilotRouter.put('/memory/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const { brand } = req.body;

    let memory = await AutopilotMemory.findOne({ userId, chatId });

    if (!memory) {
      memory = new AutopilotMemory({ userId, chatId });
    }

    // Update brand info
    if (brand) {
      if (brand.niche || brand.topics || brand.topicsAllowed) {
        const topics = brand.topicsAllowed || brand.topics || brand.niche;
        memory.brand.topicsAllowed = Array.isArray(topics)
          ? topics
          : topics.split(',').map(t => t.trim());
      }
      if (brand.targetAudience) {
        memory.brand.targetAudience = brand.targetAudience;
      }
      if (brand.visualStyle) {
        memory.brand.visualStyle = brand.visualStyle;
      }
      if (brand.tone) {
        memory.brand.tone = brand.tone;
      }
      if (brand.uniqueSellingPoints) {
        memory.brand.uniqueSellingPoints = Array.isArray(brand.uniqueSellingPoints)
          ? brand.uniqueSellingPoints
          : [brand.uniqueSellingPoints];
      }
    }

    await memory.save();

    // Brand is complete if we have the 3 required fields (topics is optional)
    const brandComplete = !!(
      memory.brand.targetAudience?.trim() &&
      memory.brand.visualStyle?.trim() &&
      memory.brand.tone?.trim()
    );

    console.log('[AUTOPILOT] Brand saved:', {
      topics: memory.brand.topicsAllowed,
      targetAudience: !!memory.brand.targetAudience,
      visualStyle: !!memory.brand.visualStyle,
      tone: !!memory.brand.tone,
      brandComplete
    });

    return res.status(200).json({
      success: true,
      memory,
      brandComplete,
      message: brandComplete
        ? 'Brand info saved successfully! Autopilot is ready to run.'
        : 'Brand info partially saved. Please complete all required fields.',
    });
  } catch (error) {
    console.error('[AUTOPILOT] Update Memory Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/status/:userId/:chatId
 * Get full autopilot status (config + memory + last run)
 */
autopilotRouter.get('/status/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    const config = await AutopilotConfig.findOne({ userId, chatId });
    const memory = await AutopilotMemory.findOne({ userId, chatId });

    // Check if brand info is complete
    const brandComplete = !!(
      memory?.brand?.targetAudience?.trim() &&
      memory?.brand?.visualStyle?.trim() &&
      memory?.brand?.tone?.trim()
    );

    return res.status(200).json({
      success: true,
      status: {
        configured: !!config,
        enabled: config?.enabled || false,
        paused: config?.pausedUntil ? new Date() < config.pausedUntil : false,
        pausedUntil: config?.pausedUntil,
        lastRunAt: config?.lastRunAt,
        lastRunResult: config?.lastRunResult,
        lastRunSummary: config?.lastRunSummary,
        lastDecision: memory?.lastDecisionSummary,
        totalPostsGenerated: memory?.totalPostsGenerated || 0,
        totalStoriesGenerated: memory?.totalStoriesGenerated || 0,
      },
      memory: memory || null,
      brandComplete,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Status Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/run/:userId/:chatId
 * Manually trigger autopilot for a chat (for testing)
 */
autopilotRouter.post('/run/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    const config = await AutopilotConfig.findOne({ userId, chatId });

    if (!config) {
      return res.status(404).json({ error: 'Autopilot not configured' });
    }

    // Force enable for this run
    const wasEnabled = config.enabled;
    config.enabled = true;

    const result = await autopilotService.runForChat(config);

    // Restore original state
    config.enabled = wasEnabled;
    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Autopilot run complete',
      result,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Manual Run Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/list/:userId
 * List all autopilot configs for a user
 */
autopilotRouter.get('/list/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const configs = await AutopilotConfig.find({ userId });

    return res.status(200).json({
      success: true,
      count: configs.length,
      configs: configs.map(c => ({
        chatId: c.chatId,
        platform: c.platform,
        enabled: c.enabled,
        paused: c.pausedUntil ? new Date() < c.pausedUntil : false,
        lastRunAt: c.lastRunAt,
        lastRunResult: c.lastRunResult,
      })),
    });
  } catch (error) {
    console.error('[AUTOPILOT] List Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /autopilot/images/:userId/:chatId
 * Upload reference images (products, style, personal)
 */
autopilotRouter.post('/images/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const { images, type = 'product' } = req.body;
    // images: [{ data: base64, mimeType: 'image/png', name?: '', description?: '' }]

    if (!images || !images.length) {
      return res.status(400).json({ error: 'images array is required' });
    }

    let memory = await AutopilotMemory.findOne({ userId, chatId });
    if (!memory) {
      memory = new AutopilotMemory({ userId, chatId });
    }

    // Initialize referenceImages if not exists
    if (!memory.referenceImages) {
      memory.referenceImages = {
        productImages: [],
        styleReferences: [],
        personalReference: { url: null, uploadedAt: null },
      };
    }

    const uploadedUrls = [];

    for (const img of images) {
      const url = await uploadToS3(img.data, img.mimeType, `autopilot/${type}`);
      uploadedUrls.push(url);

      if (type === 'product') {
        memory.referenceImages.productImages.push({
          url,
          name: img.name || '',
          description: img.description || '',
          uploadedAt: new Date(),
        });
      } else if (type === 'style') {
        memory.referenceImages.styleReferences.push({
          url,
          name: img.name || '',
          uploadedAt: new Date(),
        });
      } else if (type === 'personal') {
        // Personal reference is single image, replace existing
        memory.referenceImages.personalReference = {
          url,
          uploadedAt: new Date(),
        };
      }
    }

    await memory.save();

    return res.status(200).json({
      success: true,
      message: `${uploadedUrls.length} image(s) uploaded successfully`,
      urls: uploadedUrls,
      referenceImages: memory.referenceImages,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Image Upload Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /autopilot/images/:userId/:chatId
 * Delete a reference image
 */
autopilotRouter.delete('/images/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const { type, url } = req.body;

    const memory = await AutopilotMemory.findOne({ userId, chatId });
    if (!memory || !memory.referenceImages) {
      return res.status(404).json({ error: 'No reference images found' });
    }

    if (type === 'product') {
      memory.referenceImages.productImages = memory.referenceImages.productImages.filter(
        img => img.url !== url
      );
    } else if (type === 'style') {
      memory.referenceImages.styleReferences = memory.referenceImages.styleReferences.filter(
        img => img.url !== url
      );
    } else if (type === 'personal') {
      memory.referenceImages.personalReference = { url: null, uploadedAt: null };
    }

    await memory.save();

    return res.status(200).json({
      success: true,
      message: 'Image deleted',
      referenceImages: memory.referenceImages,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Image Delete Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /autopilot/images/:userId/:chatId
 * Get all reference images
 */
autopilotRouter.get('/images/:userId/:chatId', async (req, res) => {
  try {
    const { userId, chatId } = req.params;

    const memory = await AutopilotMemory.findOne({ userId, chatId });

    if (!memory || !memory.referenceImages) {
      return res.status(200).json({
        success: true,
        referenceImages: {
          productImages: [],
          styleReferences: [],
          personalReference: { url: null },
        },
      });
    }

    return res.status(200).json({
      success: true,
      referenceImages: memory.referenceImages,
    });
  } catch (error) {
    console.error('[AUTOPILOT] Get Images Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = autopilotRouter;



