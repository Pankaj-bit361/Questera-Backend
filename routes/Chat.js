const express = require('express');
const chatRouter = express.Router();
const OrchestratorService = require('../functions/Orchestrator');
const ImageOrchestrator = require('../functions/ImageOrchestrator');
const MemoryService = require('../functions/Memory');

const orchestrator = new OrchestratorService();
const imageOrchestrator = new ImageOrchestrator();
const memoryService = new MemoryService();

/**
 * POST /chat
 * Main smart chat endpoint - understands intent and routes to appropriate handler
 */
chatRouter.post('/', async (req, res) => {
  try {
    const { status, json } = await orchestrator.handleChat(req);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CHAT] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /chat/generate
 * Execute image generation for a content job
 */
chatRouter.post('/generate', async (req, res) => {
  try {
    const { jobId, referenceImages = [] } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const result = await imageOrchestrator.executeJob(jobId, referenceImages);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CHAT/GENERATE] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/job/:jobId
 * Get content job status and results
 */
chatRouter.get('/job/:jobId', async (req, res) => {
  try {
    const { status, json } = await orchestrator.getJobStatus(req.params.jobId);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CHAT/JOB] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/profile/:userId
 * Get user profile
 */
chatRouter.get('/profile/:userId', async (req, res) => {
  try {
    const profile = await memoryService.getActiveProfile(req.params.userId);
    return res.status(200).json(profile);
  } catch (error) {
    console.error('[CHAT/PROFILE] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /chat/profile/:userId
 * Update user profile
 */
chatRouter.put('/profile/:userId', async (req, res) => {
  try {
    const profile = await memoryService.updateProfileFromChat(req.params.userId, req.body);
    return res.status(200).json(profile);
  } catch (error) {
    console.error('[CHAT/PROFILE] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/memory/:userId
 * Get user memories
 */
chatRouter.get('/memory/:userId', async (req, res) => {
  try {
    const memories = await memoryService.getMemories(req.params.userId, req.query);
    return res.status(200).json(memories);
  } catch (error) {
    console.error('[CHAT/MEMORY] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /chat/memory/:userId
 * Add a memory
 */
chatRouter.post('/memory/:userId', async (req, res) => {
  try {
    const memory = await memoryService.addMemory(req.params.userId, req.body);
    return res.status(200).json(memory);
  } catch (error) {
    console.error('[CHAT/MEMORY] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /chat/reference/:userId
 * Upload reference images
 */
chatRouter.post('/reference/:userId', async (req, res) => {
  try {
    const { images, type = 'face', tags = [] } = req.body;
    
    if (!images || !images.length) {
      return res.status(400).json({ error: 'images array is required' });
    }

    const assets = await memoryService.attachReferenceImages(
      req.params.userId, 
      images, 
      { type, tags }
    );
    return res.status(200).json(assets);
  } catch (error) {
    console.error('[CHAT/REFERENCE] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /chat/reference/:userId
 * Get reference assets
 */
chatRouter.get('/reference/:userId', async (req, res) => {
  try {
    const assets = await memoryService.getReferenceAssets(req.params.userId, req.query);
    return res.status(200).json(assets);
  } catch (error) {
    console.error('[CHAT/REFERENCE] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = chatRouter;