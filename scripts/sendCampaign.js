/**
 * Production Email Campaign Sender with Daily Scheduling
 *
 * Usage:
 *   node scripts/sendCampaign.js --day=1                    (send Day 1, max 10K)
 *   node scripts/sendCampaign.js --day=1 --limit=100        (send 100 from Day 1)
 *   node scripts/sendCampaign.js --day=1 --dry-run          (dry run Day 1)
 *   node scripts/sendCampaign.js --stats                    (show campaign stats)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const EmailLead = require('../models/emailLead');
const EmailCampaign = require('../models/emailCampaign');

const CAMPAIGN_ID = 'camp-velos-dec-2025';
const EMAILS_PER_SECOND = 10;
const BATCH_SIZE = 100;
const DAILY_LIMIT = 10000;

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

let isShuttingDown = false;
let stats = { sent: 0, failed: 0 };

process.on('SIGINT', () => { console.log('\n⚠️ Shutting down...'); isShuttingDown = true; });

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('✅ Connected to MongoDB');
}

function generateEmailHTML(lead) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;padding:48px 24px;"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 40px;text-align:left;"><div style="display:inline-flex;align-items:center;">
<div style="width:36px;height:36px;background:linear-gradient(135deg,#000 0%,#374151 100%);border-radius:8px;text-align:center;line-height:36px;">
<span style="color:#fff;font-size:18px;font-weight:700;">V</span></div>
<span style="margin-left:10px;font-size:20px;font-weight:600;color:#000;">Velos</span></div></td></tr>
<tr><td style="padding:0 0 32px;"><h1 style="color:#000;font-size:28px;font-weight:600;margin:0;">Hi ${lead.name},</h1></td></tr>
<tr><td style="padding:0 0 24px;"><p style="color:#374151;font-size:16px;line-height:1.75;margin:0;">
I came across your work as a <strong style="color:#000;">${lead.category}</strong> on Instagram and was really impressed. With ${lead.followers} followers, it's clear you've built something special.</p></td></tr>
<tr><td style="padding:0 0 32px;"><p style="color:#374151;font-size:16px;line-height:1.75;margin:0;">
I think Velos could help you create even more incredible content — without spending hours on production.</p></td></tr>
<tr><td style="padding:0 0 32px;"><p style="color:#000;font-size:15px;font-weight:600;margin:0 0 16px;">Here's what Velos can do:</p>
<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="color:#374151;font-size:15px;padding:10px 0;border-bottom:1px solid #f3f4f6;">→ Generate professional images from text</td></tr>
<tr><td style="color:#374151;font-size:15px;padding:10px 0;border-bottom:1px solid #f3f4f6;">→ Create AI videos for Reels</td></tr>
<tr><td style="color:#374151;font-size:15px;padding:10px 0;border-bottom:1px solid #f3f4f6;">→ Schedule posts to Instagram</td></tr>
<tr><td style="color:#374151;font-size:15px;padding:10px 0;">→ Track performance analytics</td></tr></table></td></tr>
<tr><td style="padding:0 0 40px;"><a href="https://www.velosapps.com" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;font-size:15px;font-weight:500;text-decoration:none;border-radius:8px;">Try Velos Free</a></td></tr>
<tr><td style="padding:0 0 48px;"><p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 24px;">Reply to this email — I read every response.</p>
<p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">Best,<br><strong style="color:#000;">Pankaj</strong><br><span style="color:#6b7280;font-size:14px;">Founder, Velos</span></p></td></tr>
<tr><td style="padding:32px 0 0;border-top:1px solid #e5e7eb;"><p style="color:#9ca3af;font-size:13px;margin:0 0 12px;">You're receiving this because you're a creator we admire.</p>
<p style="color:#9ca3af;font-size:13px;margin:0;"><a href="https://www.velosapps.com/unsubscribe?email=${lead.email}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(lead, campaign, dryRun = false) {
  if (dryRun) { console.log(`   [DRY-RUN] ${lead.email}`); return { success: true, messageId: 'dry-run' }; }
  const subject = `${lead.name}, create stunning AI content in seconds ✨`;
  const params = {
    Source: `Velos <${campaign.fromEmail}>`,
    Destination: { ToAddresses: [lead.email] },
    ReplyToAddresses: [campaign.replyTo],
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: generateEmailHTML(lead), Charset: 'UTF-8' } },
    },
  };
  const result = await ses.send(new SendEmailCommand(params));
  return { success: true, messageId: result.MessageId };
}

async function processBatch(leads, campaign, dryRun) {
  for (const lead of leads) {
    if (isShuttingDown) break;
    try {
      const result = await sendEmail(lead, campaign, dryRun);
      await EmailLead.findByIdAndUpdate(lead._id, { status: 'sent', sentAt: new Date(), sesMessageId: result.messageId });
      stats.sent++;
      await new Promise(r => setTimeout(r, 1000 / EMAILS_PER_SECOND));
    } catch (err) {
      stats.failed++;
      await EmailLead.findByIdAndUpdate(lead._id, { status: 'bounced', errorMessage: err.message });
      console.error(`   ❌ ${lead.email}: ${err.message}`);
    }
    if ((stats.sent + stats.failed) % 10 === 0) process.stdout.write(`\r   📧 Sent: ${stats.sent} | Failed: ${stats.failed}`);
  }
}

async function showStats() {
  await connectDB();

  const dayStats = await EmailLead.aggregate([
    { $match: { campaignId: CAMPAIGN_ID } },
    { $group: { _id: { day: '$day', status: '$status' }, count: { $sum: 1 } } },
    { $sort: { '_id.day': 1 } }
  ]);

  const byDay = {};
  dayStats.forEach(s => {
    const day = s._id.day;
    if (!byDay[day]) byDay[day] = { pending: 0, sent: 0, bounced: 0 };
    byDay[day][s._id.status] = s.count;
  });

  console.log('\n📊 CAMPAIGN STATS\n');
  console.log('Day | Pending  | Sent     | Failed');
  console.log('----|----------|----------|--------');
  Object.entries(byDay).forEach(([day, s]) => {
    console.log(`${String(day).padStart(3)} | ${String(s.pending || 0).padStart(8)} | ${String(s.sent || 0).padStart(8)} | ${String(s.bounced || 0).padStart(6)}`);
  });

  const total = await EmailLead.countDocuments({ campaignId: CAMPAIGN_ID });
  const sent = await EmailLead.countDocuments({ campaignId: CAMPAIGN_ID, status: 'sent' });
  console.log(`\n✅ Total: ${total.toLocaleString()} | Sent: ${sent.toLocaleString()} (${Math.round(sent / total * 100)}%)`);

  await mongoose.disconnect();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const showStatsOnly = args.includes('--stats');

  const dayArg = args.find(a => a.startsWith('--day='));
  const limitArg = args.find(a => a.startsWith('--limit='));

  const day = dayArg ? parseInt(dayArg.split('=')[1]) : null;
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : DAILY_LIMIT;

  if (showStatsOnly) { await showStats(); return; }

  if (!day) {
    console.log('Usage:');
    console.log('  node scripts/sendCampaign.js --day=1              (send Day 1)');
    console.log('  node scripts/sendCampaign.js --day=1 --limit=100  (send 100)');
    console.log('  node scripts/sendCampaign.js --day=1 --dry-run    (dry run)');
    console.log('  node scripts/sendCampaign.js --stats              (show stats)');
    process.exit(1);
  }

  await connectDB();

  const campaign = await EmailCampaign.findOne({ campaignId: CAMPAIGN_ID });
  if (!campaign) { console.error(`❌ Campaign not found: ${CAMPAIGN_ID}`); process.exit(1); }

  console.log(`\n📧 CAMPAIGN: ${campaign.name}`);
  console.log(`📅 DAY ${day} | ${dryRun ? '[DRY-RUN]' : ''} | Limit: ${limit}\n`);

  const query = { campaignId: CAMPAIGN_ID, day, status: 'pending' };
  const totalPending = await EmailLead.countDocuments(query);
  const toSend = Math.min(limit, totalPending);
  console.log(`📊 Day ${day} Pending: ${totalPending} | Will send: ${toSend}\n`);

  if (totalPending === 0) { console.log('✅ No pending emails for this day!'); await mongoose.disconnect(); return; }

  if (!dryRun) await EmailCampaign.findByIdAndUpdate(campaign._id, { status: 'running', startedAt: campaign.startedAt || new Date() });

  let processed = 0;
  while (processed < toSend && !isShuttingDown) {
    const leads = await EmailLead.find(query).limit(Math.min(BATCH_SIZE, toSend - processed));
    if (leads.length === 0) break;
    await processBatch(leads, campaign, dryRun);
    processed += leads.length;
  }

  console.log(`\n\n✅ Sent: ${stats.sent} | ❌ Failed: ${stats.failed} | Day ${day} Remaining: ${totalPending - stats.sent - stats.failed}`);
  if (!dryRun) { await campaign.refreshStats(); }
  await mongoose.disconnect();
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });

