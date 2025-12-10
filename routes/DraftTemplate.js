const express = require('express');
const draftTemplateRouter = express.Router();
const DraftTemplateController = require('../functions/DraftTemplate');
const draftTemplateController = new DraftTemplateController();

/**
 * POST /api/draft-template/create
 * Create a new draft template with prompts and generate preview images
 */
draftTemplateRouter.post("/create", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.createDraft(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/draft-template
 * Get all draft templates (with optional filters)
 */
draftTemplateRouter.get("/", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.getDrafts(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/draft-template/:id
 * Get a single draft template by ID
 */
draftTemplateRouter.get("/:id", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.getDraftById(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/draft-template/:id/approve
 * Approve a draft and create final template
 */
draftTemplateRouter.post("/:id/approve", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.approveDraft(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/draft-template/:id
 * Reject/Delete a draft template
 */
draftTemplateRouter.delete("/:id", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.rejectDraft(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/draft-template/admin/clear-all-templates
 * Delete all existing templates (admin only)
 */
draftTemplateRouter.delete("/admin/clear-all-templates", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.deleteAllTemplates(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/draft-template/admin/clear-all-drafts
 * Delete all draft templates (admin only)
 */
draftTemplateRouter.delete("/admin/clear-all-drafts", async (req, res) => {
    try {
        const { status, json } = await draftTemplateController.deleteAllDrafts(req);
        return res.status(status).json(json);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = draftTemplateRouter;

