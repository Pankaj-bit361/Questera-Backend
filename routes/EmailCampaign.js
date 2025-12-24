const express = require('express');
const emailCampaignRouter = express.Router();
const EmailCampaignController = require('../functions/EmailCampaign');
const EmailLead = require('../models/emailLead');

const controller = new EmailCampaignController();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRACKING ENDPOINTS (Public - no auth required)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 1x1 transparent GIF pixel for open tracking
const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /api/email-campaign/track/open/:trackingId - Track email opens
emailCampaignRouter.get('/track/open/:trackingId', async (req, res) => {
    try {
        const { trackingId } = req.params;
        const decoded = Buffer.from(trackingId, 'base64url').toString();
        const [email, leadId] = decoded.split('|');

        if (email) {
            // Update lead status to opened (only if currently 'sent')
            await EmailLead.updateOne(
                { email, status: 'sent' },
                {
                    status: 'opened',
                    openedAt: new Date(),
                    $inc: { openCount: 1 }
                }
            );
            console.log(`👀 [TRACK] Email opened: ${email}`);
        }
    } catch (e) {
        console.error('[TRACK] Invalid open tracking ID:', e.message);
    }

    // Always return the tracking pixel
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(TRACKING_PIXEL);
});

// GET /api/email-campaign/track/click/:trackingId - Track link clicks
emailCampaignRouter.get('/track/click/:trackingId', async (req, res) => {
    try {
        const { trackingId } = req.params;
        const { url } = req.query;
        const decoded = Buffer.from(trackingId, 'base64url').toString();
        const [email, leadId] = decoded.split('|');

        if (email) {
            // Update lead status to clicked
            await EmailLead.updateOne(
                { email, status: { $in: ['sent', 'opened'] } },
                {
                    status: 'clicked',
                    clickedAt: new Date(),
                    $inc: { clickCount: 1 }
                }
            );
            console.log(`🖱️ [TRACK] Link clicked: ${email} -> ${url}`);
        }
    } catch (e) {
        console.error('[TRACK] Invalid click tracking ID:', e.message);
    }

    // Redirect to the actual URL
    const redirectUrl = req.query.url || 'https://www.velosapps.com';
    res.redirect(302, redirectUrl);
});

// GET /api/email-campaign/unsubscribe - Handle unsubscribe
emailCampaignRouter.get('/unsubscribe', async (req, res) => {
    try {
        const { email, token } = req.query;

        if (email) {
            await EmailLead.updateOne(
                { email },
                { status: 'unsubscribed', unsubscribedAt: new Date() }
            );
            console.log(`🚫 [TRACK] Unsubscribed: ${email}`);
        }
    } catch (e) {
        console.error('[TRACK] Unsubscribe error:', e.message);
    }

    // Show a simple unsubscribe confirmation page
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Unsubscribed - Velos</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                       display: flex; align-items: center; justify-content: center; min-height: 100vh;
                       background: #f8fafc; margin: 0; }
                .card { background: white; padding: 48px; border-radius: 12px; text-align: center;
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; }
                h1 { color: #111; margin: 0 0 16px; }
                p { color: #666; margin: 0; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>You've been unsubscribed</h1>
                <p>You won't receive any more emails from Velos.</p>
            </div>
        </body>
        </html>
    `);
});

// GET /api/email-campaign/overview - Campaign overview stats
emailCampaignRouter.get('/overview', async (req, res) => {
    try {
        const { status, json } = await controller.getOverview(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Overview error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/emails - List sent emails
emailCampaignRouter.get('/emails', async (req, res) => {
    try {
        const { status, json } = await controller.getEmails(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Emails error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/batches - List all batches
emailCampaignRouter.get('/batches', async (req, res) => {
    try {
        const { status, json } = await controller.getBatches(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Batches error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/batches/:day/:batch - Single batch details
emailCampaignRouter.get('/batches/:day/:batch', async (req, res) => {
    try {
        const { status, json } = await controller.getBatchDetails(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Batch details error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/templates - Get email templates
emailCampaignRouter.get('/templates', async (req, res) => {
    try {
        const { status, json } = await controller.getTemplates(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Templates error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/stats/daily - Daily stats breakdown
emailCampaignRouter.get('/stats/daily', async (req, res) => {
    try {
        const { status, json } = await controller.getDailyStats(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Daily stats error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email-campaign/campaigns - Create new campaign
emailCampaignRouter.post('/campaigns', async (req, res) => {
    try {
        const { status, json } = await controller.createCampaign(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Create campaign error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email-campaign/campaigns/:campaignId/start - Start campaign
emailCampaignRouter.post('/campaigns/:campaignId/start', async (req, res) => {
    try {
        const { status, json } = await controller.startCampaign(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Start campaign error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email-campaign/campaigns/:campaignId/pause - Pause campaign
emailCampaignRouter.post('/campaigns/:campaignId/pause', async (req, res) => {
    try {
        const { status, json } = await controller.pauseCampaign(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Pause campaign error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/days - Get status of all 11 days
emailCampaignRouter.get('/days', async (req, res) => {
    try {
        const { status, json } = await controller.getDaysStatus(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Days status error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email-campaign/days/:day/send - Start sending for a day
emailCampaignRouter.post('/days/:day/send', async (req, res) => {
    try {
        const { status, json } = await controller.sendDay(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Send day error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email-campaign/days/:day/stop - Stop sending for a day
emailCampaignRouter.post('/days/:day/stop', async (req, res) => {
    try {
        const { status, json } = await controller.stopDay(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Stop day error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/ses-stats - Get AWS SES sending statistics
emailCampaignRouter.get('/ses-stats', async (req, res) => {
    try {
        const result = await controller.getSESStats(req);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] SES stats error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email-campaign/send-test - Send a test email
emailCampaignRouter.post('/send-test', async (req, res) => {
    try {
        const result = await controller.sendTestEmail(req);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Send test error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/preview-list - Get list of sent emails with preview URLs
emailCampaignRouter.get('/preview-list', async (req, res) => {
    try {
        const { status, json } = await controller.getPreviewList(req);
        return res.status(status).json(json);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Preview list error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email-campaign/preview/:email - Preview exact email sent to a user (renders HTML)
emailCampaignRouter.get('/preview/:email', async (req, res) => {
    try {
        const result = await controller.previewEmail(req);

        // Check if user wants JSON or HTML
        if (req.query.format === 'json') {
            return res.status(result.status).json({
                success: true,
                lead: result.lead,
                subject: result.subject,
                html: result.html
            });
        }

        // Return rendered HTML for browser viewing
        res.set('Content-Type', 'text/html');
        return res.send(result.html);
    } catch (error) {
        console.error('[EMAIL-CAMPAIGN] Preview error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = emailCampaignRouter;

