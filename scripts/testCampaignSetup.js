/**
 * Test Email Campaign Setup
 * Verifies MongoDB models and creates a test campaign with sample leads
 */

require('dotenv').config();
const mongoose = require('mongoose');

const EmailLead = require('../models/emailLead');
const EmailCampaign = require('../models/emailCampaign');

async function testSetup() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTING EMAIL CAMPAIGN SETUP');
  console.log('='.repeat(60) + '\n');

  console.log('1️⃣ Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URL);
  console.log('   ✅ Connected!\n');

  console.log('2️⃣ Creating test campaign...');
  const campaign = await EmailCampaign.findOneAndUpdate(
    { name: 'Instagram Outreach' },
    {
      name: 'Instagram Outreach',
      subject: '${name}, create stunning AI content in seconds ✨',
      description: 'Main campaign for Instagram creators',
      fromEmail: process.env.SES_SENDER_EMAIL || 'no-reply@velosapps.com',
      replyTo: 'pankaj@velosapps.com',
    },
    { upsert: true, new: true }
  );
  console.log(`   ✅ Campaign: ${campaign.campaignId}\n`);

  console.log('3️⃣ Creating sample leads...');
  const sampleLeads = [
    { username: 'artist_jane', name: 'Jane', email: 'test1@example.com', category: 'Artist', followers: '15K' },
    { username: 'photo_mike', name: 'Mike', email: 'test2@example.com', category: 'Photographer', followers: '25K' },
    { username: 'fitness_lisa', name: 'Lisa', email: 'test3@example.com', category: 'Fitness', followers: '50K' },
  ];

  for (const lead of sampleLeads) {
    await EmailLead.findOneAndUpdate(
      { email: lead.email, campaignId: campaign.campaignId },
      { ...lead, campaignId: campaign.campaignId, status: 'pending' },
      { upsert: true }
    );
  }
  console.log(`   ✅ Created ${sampleLeads.length} sample leads\n`);

  console.log('4️⃣ Getting campaign stats...');
  const stats = await EmailLead.getCampaignStats(campaign.campaignId);
  console.log('   Stats:', JSON.stringify(stats, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('✅ SETUP COMPLETE!');
  console.log('='.repeat(60));
  console.log(`
📋 Next Steps:

1. Import your scraped data:
   node scripts/importLeads.js <json_file> ${campaign.campaignId}

2. Test sending (dry run):
   node scripts/sendCampaign.js ${campaign.campaignId} --dry-run --limit=5

3. Send for real:
   node scripts/sendCampaign.js ${campaign.campaignId} --limit=100
`);

  await mongoose.disconnect();
}

testSetup().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

