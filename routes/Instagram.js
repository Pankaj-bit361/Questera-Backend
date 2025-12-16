const express = require('express');
const instagramRouter = express.Router();
const InstagramController = require('../functions/Instagram');
const instagramController = new InstagramController();

// Get OAuth URL
instagramRouter.get('/oauth-url', (req, res) => {
  try {
    const { status, json } = instagramController.getOAuthUrl(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
instagramRouter.post('/callback', async (req, res) => {
  try {
    const { status, json } = await instagramController.handleCallback(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Get Instagram account info
instagramRouter.get('/info/:userId', async (req, res) => {
  try {
    const { status, json } = await instagramController.getInstagramInfo(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Disconnect Instagram account
instagramRouter.post('/disconnect/:userId', async (req, res) => {
  try {
    const { status, json } = await instagramController.disconnectInstagram(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Publish image to Instagram
instagramRouter.post('/publish', async (req, res) => {
  try {
    const { status, json } = await instagramController.publishImage(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Refresh access token
instagramRouter.post('/refresh-token', async (req, res) => {
  try {
    const { status, json } = await instagramController.refreshToken(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Publish Story to Instagram
instagramRouter.post('/publish-story', async (req, res) => {
  try {
    const { status, json } = await instagramController.publishStory(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = instagramRouter;