/**
 * Import leads from daily_batches folder with day assignments
 * Each lead gets assigned a day (1-11) and priority (high/medium/standard)
 * 
 * Usage: node scripts/importDailyBatches.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const EmailLead = require('../models/emailLead');
const EmailCampaign = require('../models/emailCampaign');

const DAILY_BATCHES_PATH = path.join(__dirname, '../../email_campaign/daily_batches');
const BATCH_SIZE = 1000;

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('✅ Connected to MongoDB');
}

function getPriority(day) {
  if (day <= 2) return 'high';
  if (day <= 7) return 'medium';
  return 'standard';
}

async function importDailyBatches(campaignId) {
  console.log('\n📁 Importing from daily batches...\n');

  let totalImported = 0;

  for (let day = 1; day <= 11; day++) {
    const dayFolder = path.join(DAILY_BATCHES_PATH, `day_${String(day).padStart(2, '0')}`);

    if (!fs.existsSync(dayFolder)) {
      console.log(`   Day ${day}: folder not found, skipping`);
      continue;
    }

    const csvFiles = fs.readdirSync(dayFolder).filter(f => f.endsWith('.csv'));
    const priority = getPriority(day);
    const bulkOps = [];

    for (const csvFile of csvFiles) {
      const filePath = path.join(dayFolder, csvFile);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim()).slice(1);

      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 5) continue;

        const [, username, email, name, category, followers] = parts;
        if (!email || !email.includes('@')) continue;

        bulkOps.push({
          updateOne: {
            filter: { email: email.toLowerCase(), campaignId },
            update: {
              $setOnInsert: {
                leadId: 'lead-' + uuidv4(),
                username: username || '',
                name: name || email.split('@')[0],
                email: email.toLowerCase(),
                category: category || 'creator',
                followers: followers || '',
                campaignId,
                day,
                priority,
                status: 'pending',
                source: 'instagram_scraper',
                sourceFile: csvFile,
                createdAt: new Date(),
              },
              $set: { updatedAt: new Date() }
            },
            upsert: true
          }
        });
      }
    }

    let dayImported = 0;
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const batch = bulkOps.slice(i, i + BATCH_SIZE);
      const result = await EmailLead.bulkWrite(batch, { ordered: false });
      dayImported += result.upsertedCount;
    }

    console.log(`   Day ${day}: ${dayImported.toLocaleString()} leads (${priority} priority)`);
    totalImported += dayImported;
  }

  return totalImported;
}

async function main() {
  await connectDB();

  // Clear existing data
  console.log('🗑️  Clearing existing email leads and campaigns...');
  await EmailLead.deleteMany({});
  await EmailCampaign.deleteMany({});

  // Create campaign
  const campaignId = 'camp-velos-dec-2025';
  await EmailCampaign.create({
    campaignId,
    name: 'Velos Launch Campaign - Dec 2025',
    subject: '${name}, create stunning AI content in seconds ✨',
    fromEmail: 'no-reply@velosapps.com',
    replyTo: 'pankaj@velosapps.com',
    status: 'draft',
  });

  console.log(`\n📧 Campaign: ${campaignId}`);

  const totalImported = await importDailyBatches(campaignId);

  // Show stats
  const dayStats = await EmailLead.aggregate([
    { $match: { campaignId } },
    { $group: { _id: { day: '$day', priority: '$priority' }, count: { $sum: 1 } } },
    { $sort: { '_id.day': 1 } }
  ]);

  console.log('\n' + '='.repeat(50));
  console.log(`✅ TOTAL IMPORTED: ${totalImported.toLocaleString()} leads`);
  console.log(`📧 Campaign ID: ${campaignId}`);
  console.log('='.repeat(50));

  await mongoose.disconnect();
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });

