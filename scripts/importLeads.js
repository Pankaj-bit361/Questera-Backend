/**
 * Import Leads to MongoDB (FAST BULK VERSION)
 *
 * Imports scraped Instagram users from CSV/JSON files into the database
 * Usage: node scripts/importLeads.js <csv_or_json_file> [campaignId]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const EmailLead = require('../models/emailLead');
const EmailCampaign = require('../models/emailCampaign');

const BATCH_SIZE = 1000;

async function connectDB() {
  if (!process.env.MONGO_URL) {
    throw new Error('MONGO_URL not found in environment');
  }
  await mongoose.connect(process.env.MONGO_URL);
  console.log('✅ Connected to MongoDB');
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i]?.trim() || ''; });
    return obj;
  });
}

async function importFromFile(filePath, campaignId) {
  const ext = path.extname(filePath).toLowerCase();
  let users;

  if (ext === '.csv') {
    users = parseCSV(filePath);
  } else {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    users = Array.isArray(data) ? data : data.users || [];
  }

  console.log(`\n📁 Processing: ${path.basename(filePath)}`);
  console.log(`   Found ${users.length} users`);

  let imported = 0, skipped = 0, errors = 0;

  // Process in batches for speed
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const bulkOps = [];

    for (const user of batch) {
      if (!user.email) { skipped++; continue; }

      bulkOps.push({
        updateOne: {
          filter: { email: user.email.toLowerCase(), campaignId },
          update: {
            $setOnInsert: {
              username: user.username || user.handle || '',
              name: user.name || user.full_name || user.username || '',
              email: user.email.toLowerCase(),
              followers: user.followers || user.follower_count || '',
              category: user.category || user.niche || 'Creator',
              bio: user.bio || '',
              profileUrl: user.profile_url || `https://instagram.com/${user.username}`,
              source: 'instagram_scraper',
              sourceFile: path.basename(filePath),
              campaignId,
              status: 'pending',
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      try {
        const result = await EmailLead.bulkWrite(bulkOps, { ordered: false });
        imported += result.upsertedCount;
        skipped += bulkOps.length - result.upsertedCount;
      } catch (err) {
        errors += batch.length;
        console.error(`   ❌ Batch error:`, err.message);
      }
    }

    process.stdout.write(`\r   📊 Progress: ${Math.min(i + BATCH_SIZE, users.length)}/${users.length}`);
  }

  console.log(`\n   ✅ Imported: ${imported} | ⏭️ Skipped: ${skipped} | ❌ Errors: ${errors}`);
  return { imported, skipped, errors };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node scripts/importLeads.js <json_file_or_folder> [campaignId]');
    process.exit(1);
  }

  const inputPath = args[0];
  let campaignId = args[1];

  await connectDB();

  if (!campaignId) {
    const campaign = await EmailCampaign.create({
      name: `Import ${new Date().toISOString().split('T')[0]}`,
      subject: '${name}, create stunning AI content in seconds ✨',
      description: 'Auto-created campaign from import',
    });
    campaignId = campaign.campaignId;
    console.log(`\n📧 Created new campaign: ${campaignId}`);
  }

  const stats = { imported: 0, skipped: 0, errors: 0 };
  const stat = fs.statSync(inputPath);

  if (stat.isDirectory()) {
    const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.json'));
    console.log(`\n📂 Found ${files.length} JSON files`);
    for (const file of files) {
      const result = await importFromFile(path.join(inputPath, file), campaignId);
      stats.imported += result.imported;
      stats.skipped += result.skipped;
      stats.errors += result.errors;
    }
  } else {
    const result = await importFromFile(inputPath, campaignId);
    Object.assign(stats, result);
  }

  const campaign = await EmailCampaign.findOne({ campaignId });
  if (campaign) await campaign.refreshStats();

  console.log('\n' + '='.repeat(50));
  console.log(`📊 SUMMARY | Campaign: ${campaignId}`);
  console.log(`   Imported: ${stats.imported} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`);

  await mongoose.disconnect();
  console.log('✅ Done!');
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });

