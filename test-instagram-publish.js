/**
 * Test Script for instagram_business_content_publish permission
 * Run from production server to trigger API call detection by Meta
 *
 * Usage: node test-instagram-publish.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;
const API_VERSION = 'v21.0';

// Public test image
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800';

async function testInstagramPublish() {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URL);
  console.log('✅ Connected\n');

  // Check BOTH collections for tokens
  const InstagramCollection = mongoose.connection.collection('instagrams');
  const SocialAccountCollection = mongoose.connection.collection('socialaccounts');

  let instagramBusinessAccountId, accessToken, accountName;

  // Try instagrams collection first - get the most recently updated one
  console.log('🔍 Checking instagrams collection...');
  const igDoc = await InstagramCollection.findOne(
    { 'accounts.0': { $exists: true } },
    { sort: { updatedAt: -1 } }  // Get most recently updated
  );

  if (igDoc && igDoc.accounts?.length > 0) {
    const account = igDoc.accounts.find(acc => acc.instagramBusinessAccountId && acc.accessToken);
    if (account) {
      instagramBusinessAccountId = account.instagramBusinessAccountId;
      accessToken = account.accessToken;
      accountName = account.instagramUsername || account.pageName;
      console.log('✅ Found in instagrams collection');
    }
  }

  // If not found, try socialaccounts collection
  if (!accessToken) {
    console.log('🔍 Checking socialaccounts collection...');
    const saDoc = await SocialAccountCollection.findOne({
      platform: 'instagram',
      isActive: true,
      instagramBusinessAccountId: { $exists: true }
    });

    if (saDoc) {
      instagramBusinessAccountId = saDoc.instagramBusinessAccountId;
      accessToken = saDoc.accessToken;
      accountName = saDoc.platformUsername;
      console.log('✅ Found in socialaccounts collection');
    }
  }

  if (!accessToken) {
    console.log('❌ No Instagram account with valid token found in either collection');
    await mongoose.disconnect();
    return;
  }

  console.log('\n📸 Account:', accountName);
  console.log('📱 IG Business ID:', instagramBusinessAccountId);

  // Step 1: Create media container
  console.log('\n🚀 Step 1: Creating media container...');
  const containerUrl = `https://graph.facebook.com/${API_VERSION}/${instagramBusinessAccountId}/media`;

  const containerResponse = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      image_url: TEST_IMAGE_URL,
      caption: '🧪 Test post from Velos AI #VelosAI #Test',
      access_token: accessToken,
    })
  });

  const containerData = await containerResponse.json();

  if (containerData.error) {
    console.log('❌ Error:', containerData.error.message);
    console.log('   Code:', containerData.error.code);
    await mongoose.disconnect();
    return;
  }

  const containerId = containerData.id;
  console.log('✅ Container ID:', containerId);

  // Step 2: Wait for container to be ready
  console.log('\n⏳ Step 2: Waiting for processing...');
  await new Promise(r => setTimeout(r, 5000));

  // Step 3: Publish
  console.log('\n🎯 Step 3: Publishing...');
  const publishUrl = `https://graph.facebook.com/${API_VERSION}/${instagramBusinessAccountId}/media_publish`;

  const publishResponse = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    })
  });

  const publishData = await publishResponse.json();

  if (publishData.error) {
    console.log('❌ Publish error:', publishData.error.message);
  } else {
    console.log('\n✅✅✅ SUCCESS! Post published!');
    console.log('📱 Media ID:', publishData.id);
    console.log('\n🎉 instagram_business_content_publish API call successful!');
    console.log('   Meta should detect this within 24 hours.');
  }

  await mongoose.disconnect();
  console.log('\n🔌 Done');
}

testInstagramPublish().catch(err => {
  console.error('Error:', err.message);
  mongoose.disconnect();
});

