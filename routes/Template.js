const express = require('express');
const templateRouter = express.Router();
const TemplateController = require('../functions/Template');
const templateController = new TemplateController();

// Create a new template
templateRouter.post("/create", async (req, res) => {
    try {
        const { status, json } = await templateController.createTemplate(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get all templates (with optional filters)
templateRouter.get("/", async (req, res) => {
    try {
        const { status, json } = await templateController.getTemplates(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get templates by category
templateRouter.get("/category/:category", async (req, res) => {
    try {
        const { status, json } = await templateController.getTemplatesByCategory(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Create template from generated image URLs
templateRouter.post("/create-from-urls", async (req, res) => {
    try {
        const { status, json } = await templateController.createTemplateFromUrls(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Get a single template by ID
templateRouter.get("/:id", async (req, res) => {
    try {
        const { status, json } = await templateController.getTemplateById(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Update a template
templateRouter.put("/:id", async (req, res) => {
    try {
        const { status, json } = await templateController.updateTemplate(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Delete a template
templateRouter.delete("/:id", async (req, res) => {
    try {
        const { status, json } = await templateController.deleteTemplate(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// Use a template to generate images for a user
templateRouter.post("/:id/use", async (req, res) => {
    try {
        const { status, json } = await templateController.useTemplate(req, res);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = templateRouter;