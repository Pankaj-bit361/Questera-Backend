const EmailLead = require('../models/emailLead');
const EmailCampaign = require('../models/emailCampaign');
const { SESClient, SendEmailCommand, GetSendQuotaCommand, GetSendStatisticsCommand } = require('@aws-sdk/client-ses');

const CAMPAIGN_ID = 'camp-velos-dec-2025';
const EMAILS_PER_SECOND = 10;

const ses = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Track active sending jobs
const activeSendingJobs = new Map();

class EmailCampaignController {
    constructor() { }

    // GET /overview - Campaign overview stats
    async getOverview(req) {
        const { campaignId } = req.query;

        // Get all campaigns or specific one
        const query = campaignId ? { campaignId } : {};
        const campaigns = await EmailCampaign.find(query).sort({ createdAt: -1 });

        // Aggregate stats across all campaigns
        const totalStats = await EmailLead.aggregate([
            { $match: campaignId ? { campaignId } : {} },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const stats = {
            total: 0,
            pending: 0,
            sent: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
            unsubscribed: 0,
            complained: 0,
        };

        totalStats.forEach(s => {
            stats[s._id] = s.count;
            stats.total += s.count;
        });

        const sentCount = stats.sent + stats.opened + stats.clicked;
        const deliveredCount = sentCount - stats.bounced;

        return {
            status: 200,
            json: {
                success: true,
                total_emails: stats.total,
                sent: sentCount,
                remaining: stats.pending,
                progress: stats.total > 0 ? ((sentCount / stats.total) * 100).toFixed(1) : 0,
                delivered: deliveredCount,
                opened: stats.opened + stats.clicked,
                clicked: stats.clicked,
                bounced: stats.bounced,
                unsubscribed: stats.unsubscribed,
                rates: {
                    delivery: sentCount > 0 ? ((deliveredCount / sentCount) * 100).toFixed(1) : 0,
                    open: deliveredCount > 0 ? (((stats.opened + stats.clicked) / deliveredCount) * 100).toFixed(1) : 0,
                    click: (stats.opened + stats.clicked) > 0 ? ((stats.clicked / (stats.opened + stats.clicked)) * 100).toFixed(1) : 0,
                    bounce: sentCount > 0 ? ((stats.bounced / sentCount) * 100).toFixed(1) : 0
                },
                campaigns: campaigns.map(c => ({
                    id: c.campaignId,
                    name: c.name,
                    status: c.status,
                    stats: c.stats,
                    createdAt: c.createdAt,
                })),
                status: stats.pending === stats.total ? 'not_started' : stats.pending === 0 ? 'completed' : 'in_progress'
            }
        };
    }

    // GET /emails - List sent emails with pagination
    async getEmails(req) {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const { status, campaignId, search } = req.query;

        const query = {};
        if (status) query.status = status;
        if (campaignId) query.campaignId = campaignId;
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await EmailLead.countDocuments(query);
        const emails = await EmailLead.find(query)
            .sort({ sentAt: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        return {
            status: 200,
            json: {
                success: true,
                emails: emails.map(e => ({
                    id: e.leadId,
                    email: e.email,
                    name: e.name,
                    username: e.username,
                    category: e.category,
                    followers: e.followers,
                    status: e.status,
                    sentAt: e.sentAt,
                    openedAt: e.openedAt,
                    clickedAt: e.clickedAt,
                })),
                pagination: { page, limit, total, pages: Math.ceil(total / limit) }
            }
        };
    }

    // GET /batches - List all campaigns (renamed from batches)
    async getBatches(req) {
        const campaigns = await EmailCampaign.find().sort({ createdAt: -1 }).lean();

        const batches = await Promise.all(campaigns.map(async (c) => {
            const stats = await EmailLead.getCampaignStats(c.campaignId);
            return {
                id: c.campaignId,
                name: c.name,
                status: c.status,
                sent: stats.sent + stats.opened + stats.clicked,
                total: stats.total,
                opened: stats.opened + stats.clicked,
                clicked: stats.clicked,
                bounced: stats.bounced,
                createdAt: c.createdAt,
                startedAt: c.startedAt,
                completedAt: c.completedAt,
            };
        }));

        return { status: 200, json: { success: true, batches } };
    }

    // GET /batches/:campaignId - Single campaign details
    async getBatchDetails(req) {
        const { day: campaignId } = req.params;

        const campaign = await EmailCampaign.findOne({ campaignId }).lean();
        if (!campaign) {
            return { status: 404, json: { success: false, error: 'Campaign not found' } };
        }

        const stats = await EmailLead.getCampaignStats(campaignId);
        const recentEmails = await EmailLead.find({ campaignId })
            .sort({ sentAt: -1 })
            .limit(100)
            .lean();

        return {
            status: 200,
            json: {
                success: true,
                campaign: {
                    ...campaign,
                    stats,
                    recentEmails: recentEmails.map(e => ({
                        email: e.email,
                        name: e.name,
                        status: e.status,
                        sentAt: e.sentAt,
                    })),
                }
            }
        };
    }

    // GET /templates - Get email templates
    async getTemplates(req) {
        const totalLeads = await EmailLead.countDocuments();
        return {
            status: 200,
            json: {
                success: true,
                templates: [
                    {
                        id: 'creator_outreach',
                        name: 'Creator Outreach',
                        subject: '${name}, create stunning AI content in seconds ✨',
                        preview: 'Personalized outreach to Instagram creators',
                        created_at: '2025-12-24',
                        used_count: totalLeads
                    }
                ]
            }
        };
    }

    // GET /stats/daily - Daily stats breakdown
    async getDailyStats(req) {
        const { campaignId } = req.query;

        const pipeline = [
            { $match: campaignId ? { campaignId, sentAt: { $exists: true } } : { sentAt: { $exists: true } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$sentAt' } },
                    sent: { $sum: 1 },
                    opened: { $sum: { $cond: [{ $in: ['$status', ['opened', 'clicked']] }, 1, 0] } },
                    clicked: { $sum: { $cond: [{ $eq: ['$status', 'clicked'] }, 1, 0] } },
                    bounced: { $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] } },
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 30 }
        ];

        const dailyStats = await EmailLead.aggregate(pipeline);

        return {
            status: 200,
            json: {
                success: true,
                daily: dailyStats.map(d => ({
                    date: d._id,
                    sent: d.sent,
                    opened: d.opened,
                    clicked: d.clicked,
                    bounced: d.bounced,
                }))
            }
        };
    }

    // POST /campaigns - Create new campaign
    async createCampaign(req) {
        const { name, subject, description, filters } = req.body;

        const campaign = await EmailCampaign.create({
            name: name || `Campaign ${new Date().toISOString().split('T')[0]}`,
            subject: subject || '${name}, create stunning AI content in seconds ✨',
            description,
            filters,
        });

        return {
            status: 201,
            json: { success: true, campaign }
        };
    }

    // POST /campaigns/:campaignId/start - Start a campaign
    async startCampaign(req) {
        const { campaignId } = req.params;

        const campaign = await EmailCampaign.findOneAndUpdate(
            { campaignId },
            { status: 'running', startedAt: new Date() },
            { new: true }
        );

        if (!campaign) {
            return { status: 404, json: { success: false, error: 'Campaign not found' } };
        }

        return { status: 200, json: { success: true, campaign } };
    }

    // POST /campaigns/:campaignId/pause - Pause a campaign
    async pauseCampaign(req) {
        const { campaignId } = req.params;

        const campaign = await EmailCampaign.findOneAndUpdate(
            { campaignId },
            { status: 'paused' },
            { new: true }
        );

        if (!campaign) {
            return { status: 404, json: { success: false, error: 'Campaign not found' } };
        }

        return { status: 200, json: { success: true, campaign } };
    }

    // GET /days - Get status of all 11 days
    async getDaysStatus(req) {
        const daysStats = await EmailLead.aggregate([
            {
                $group: {
                    _id: '$day',
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'opened', 'clicked']] }, 1, 0] } },
                    bounced: { $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] } },
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const days = [];
        for (let d = 1; d <= 11; d++) {
            const stats = daysStats.find(s => s._id === d) || { total: 0, pending: 0, sent: 0, bounced: 0 };
            const isSending = activeSendingJobs.has(d);
            const isCompleted = stats.pending === 0 && stats.sent > 0;

            days.push({
                day: d,
                total: stats.total,
                pending: stats.pending,
                sent: stats.sent,
                bounced: stats.bounced,
                status: isSending ? 'sending' : isCompleted ? 'completed' : stats.sent > 0 ? 'partial' : 'pending',
                canSend: !isSending && stats.pending > 0,
                progress: stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0,
            });
        }

        return { status: 200, json: { success: true, days } };
    }

    // POST /days/:day/send - Start sending emails for a specific day
    async sendDay(req) {
        const day = parseInt(req.params.day);

        if (day < 1 || day > 11) {
            return { status: 400, json: { success: false, error: 'Invalid day (1-11)' } };
        }

        if (activeSendingJobs.has(day)) {
            return { status: 400, json: { success: false, error: `Day ${day} is already being sent` } };
        }

        const pendingCount = await EmailLead.countDocuments({ day, status: 'pending' });
        if (pendingCount === 0) {
            return { status: 400, json: { success: false, error: `No pending emails for day ${day}` } };
        }

        // Start background sending job
        activeSendingJobs.set(day, { startedAt: new Date(), sent: 0, errors: 0 });

        // Run in background (non-blocking)
        this._sendDayEmails(day).catch(err => {
            console.error(`[EMAIL] Day ${day} sending failed:`, err);
            activeSendingJobs.delete(day);
        });

        return {
            status: 200,
            json: {
                success: true,
                message: `Started sending ${pendingCount} emails for day ${day}`,
                pending: pendingCount
            }
        };
    }

    // Background email sending (non-blocking)
    async _sendDayEmails(day) {
        const batchSize = 100;
        let sent = 0;
        let errors = 0;

        console.log(`[EMAIL] Starting Day ${day} send...`);

        while (activeSendingJobs.has(day)) {
            const leads = await EmailLead.find({ day, status: 'pending' })
                .limit(batchSize)
                .lean();

            if (leads.length === 0) {
                console.log(`[EMAIL] Day ${day} completed: ${sent} sent, ${errors} errors`);
                activeSendingJobs.delete(day);
                break;
            }

            for (const lead of leads) {
                if (!activeSendingJobs.has(day)) break;

                try {
                    await this._sendSingleEmail(lead);
                    await EmailLead.updateOne(
                        { _id: lead._id },
                        { status: 'sent', sentAt: new Date() }
                    );
                    sent++;
                } catch (err) {
                    console.error(`[EMAIL] Failed: ${lead.email}:`, err.message);
                    await EmailLead.updateOne(
                        { _id: lead._id },
                        { status: 'bounced', error: err.message }
                    );
                    errors++;
                }

                // Update job stats
                const job = activeSendingJobs.get(day);
                if (job) {
                    job.sent = sent;
                    job.errors = errors;
                }

                // Rate limit: ~50 emails/second (20ms delay)
                await new Promise(r => setTimeout(r, 20));
            }
        }
    }

    // Send single email using SES
    async _sendSingleEmail(lead) {
        const name = lead.name || lead.username || 'there';
        const category = lead.category || 'creator';

        const subject = `${name}, create stunning AI content in seconds ✨`;
        const htmlBody = this._getEmailTemplate(lead, name, category);

        const command = new SendEmailCommand({
            Source: `Pankaj from Velos <${process.env.FROM_EMAIL || 'no-reply@velosapps.com'}>`,
            Destination: { ToAddresses: [lead.email] },
            ReplyToAddresses: [process.env.REPLY_TO || 'pankaj@velosapps.com'],
            Message: {
                Subject: { Data: subject, Charset: 'UTF-8' },
                Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } }
            }
        });

        return ses.send(command);
    }

    // Generate tracking ID for a lead
    _generateTrackingId(lead) {
        const data = `${lead.email}|${lead.leadId || lead._id}`;
        return Buffer.from(data).toString('base64url');
    }

    // Email template with open/click tracking
    _getEmailTemplate(lead, name, category) {
        const trackingId = this._generateTrackingId(lead);
        const trackingDomain = process.env.TRACKING_DOMAIN || 'https://hackathon.velosapps.com';

        // Tracking URLs
        const openTrackingUrl = `${trackingDomain}/api/email-campaign/track/open/${trackingId}`;
        const clickTrackingUrl = `${trackingDomain}/api/email-campaign/track/click/${trackingId}?url=${encodeURIComponent('https://www.velosapps.com')}`;
        const unsubscribeUrl = `${trackingDomain}/api/email-campaign/unsubscribe?email=${encodeURIComponent(lead.email)}`;

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;padding:40px 20px;">
<tr><td align="center"><table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid #f3f4f6;">
<div style="font-size:22px;font-weight:700;color:#000;letter-spacing:-0.5px;">[V] Velos</div></td></tr>
<tr><td style="padding:32px 40px 0;">
<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">Hi <strong style="color:#000;">${name}</strong>,</p>
<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">I came across your work as a <strong style="color:#000;">${category.toLowerCase()}</strong> and had to reach out — you're exactly who we built Velos for.</p>
<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;"><strong style="color:#000;">Velos</strong> is an AI platform that helps creators like you:</p></td></tr>
<tr><td style="padding:0 40px 24px;">
<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="color:#374151;font-size:15px;padding:10px 0;border-bottom:1px solid #f3f4f6;">→ Generate professional images from text</td></tr>
<tr><td style="color:#374151;font-size:15px;padding:10px 0;border-bottom:1px solid #f3f4f6;">→ Create AI videos for Reels</td></tr>
<tr><td style="color:#374151;font-size:15px;padding:10px 0;border-bottom:1px solid #f3f4f6;">→ Schedule posts to Instagram</td></tr>
<tr><td style="color:#374151;font-size:15px;padding:10px 0;">→ Track performance analytics</td></tr></table></td></tr>
<tr><td style="padding:0 40px 40px;"><a href="${clickTrackingUrl}" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;font-size:15px;font-weight:500;text-decoration:none;border-radius:8px;">Try Velos Free</a></td></tr>
<tr><td style="padding:0 40px 48px;"><p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 24px;">Reply to this email — I read every response.</p>
<p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">Best,<br><strong style="color:#000;">Pankaj</strong><br><span style="color:#6b7280;font-size:14px;">Founder, Velos</span></p></td></tr>
<tr><td style="padding:32px 40px;border-top:1px solid #e5e7eb;"><p style="color:#9ca3af;font-size:13px;margin:0 0 12px;">You're receiving this because you're a creator we admire.</p>
<p style="color:#9ca3af;font-size:13px;margin:0;"><a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p></td></tr>
</table></td></tr></table>
<!-- Open Tracking Pixel -->
<img src="${openTrackingUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />
</body></html>`;
    }

    // POST /days/:day/stop - Stop sending for a day
    async stopDay(req) {
        const day = parseInt(req.params.day);

        if (!activeSendingJobs.has(day)) {
            return { status: 400, json: { success: false, error: `Day ${day} is not currently sending` } };
        }

        const job = activeSendingJobs.get(day);
        activeSendingJobs.delete(day);

        return {
            status: 200,
            json: {
                success: true,
                message: `Stopped day ${day}`,
                sent: job.sent,
                errors: job.errors
            }
        };
    }

    // GET /ses-stats - Get SES sending statistics to verify emails are being sent
    async getSESStats(req) {
        try {
            // Get quota
            const quotaCommand = new GetSendQuotaCommand({});
            const quotaResult = await ses.send(quotaCommand);

            // Get statistics (last 2 weeks)
            const statsCommand = new GetSendStatisticsCommand({});
            const statsResult = await ses.send(statsCommand);

            // Aggregate stats
            const dataPoints = statsResult.SendDataPoints || [];
            const totals = dataPoints.reduce((acc, point) => ({
                deliveryAttempts: acc.deliveryAttempts + (point.DeliveryAttempts || 0),
                bounces: acc.bounces + (point.Bounces || 0),
                complaints: acc.complaints + (point.Complaints || 0),
                rejects: acc.rejects + (point.Rejects || 0),
            }), { deliveryAttempts: 0, bounces: 0, complaints: 0, rejects: 0 });

            return {
                success: true,
                quota: {
                    max24HourSend: quotaResult.Max24HourSend,
                    maxSendRate: quotaResult.MaxSendRate,
                    sentLast24Hours: quotaResult.SentLast24Hours,
                },
                stats: {
                    ...totals,
                    dataPoints: dataPoints.slice(-5).map(p => ({
                        timestamp: p.Timestamp,
                        attempts: p.DeliveryAttempts,
                        bounces: p.Bounces,
                    })),
                },
            };
        } catch (error) {
            console.error('Error getting SES stats:', error);
            return { success: false, error: error.message };
        }
    }

    // POST /send-test - Send a test email to verify delivery
    async sendTestEmail(req) {
        const { email, name } = req.body;

        if (!email) {
            return { success: false, error: 'Email is required' };
        }

        try {
            const command = new SendEmailCommand({
                Source: '"Pankaj from Velos" <no-reply@velosapps.com>',
                Destination: { ToAddresses: [email] },
                ReplyToAddresses: ['pankaj@velosapps.com'],
                Message: {
                    Subject: { Data: '✅ Velos Test Email - Delivery Confirmed!' },
                    Body: {
                        Html: {
                            Data: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; color: white;">
                                        <h1 style="margin: 0; font-size: 24px;">✨ Velos</h1>
                                        <p style="margin-top: 20px;">Hi ${name || 'there'},</p>
                                        <p>This is a <strong>test email</strong> to confirm that your Velos email campaign system is working correctly.</p>
                                        <div style="background: #22c55e22; border: 1px solid #22c55e; border-radius: 8px; padding: 15px; margin: 20px 0;">
                                            <p style="margin: 0; color: #22c55e;"><strong>✅ Delivery Confirmed!</strong></p>
                                            <p style="margin: 5px 0 0 0; font-size: 14px;">If you received this, emails are being sent successfully via AWS SES.</p>
                                        </div>
                                        <p style="font-size: 12px; color: #888;">Sent at: ${new Date().toISOString()}</p>
                                    </div>
                                </div>
                            `,
                        },
                    },
                },
            });

            await ses.send(command);

            return {
                success: true,
                message: `Test email sent to ${email}`,
                sentAt: new Date().toISOString(),
            };
        } catch (error) {
            console.error('Error sending test email:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = EmailCampaignController;

