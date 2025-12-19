const express = require('express');
const videoRouter = express.Router();
const VideoController = require('../functions/Video');
const videoController = new VideoController();

// Generate video
videoRouter.post('/generate', async (req, res) => {
    try {
        const { status, json } = await videoController.generate(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get conversation by videoChatId
videoRouter.get('/conversation/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.getConversation(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get all conversations for a user
videoRouter.get('/user/:userId/conversations', async (req, res) => {
    try {
        const { status, json } = await videoController.getUserConversations(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get project settings
videoRouter.get('/settings/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.getSettings(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Update project settings
videoRouter.put('/settings/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.updateSettings(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete a message
videoRouter.delete('/message/:messageId', async (req, res) => {
    try {
        const { status, json } = await videoController.deleteMessage(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete a conversation
videoRouter.delete('/conversation/:videoChatId', async (req, res) => {
    try {
        const { status, json } = await videoController.deleteConversation(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = videoRouter;

