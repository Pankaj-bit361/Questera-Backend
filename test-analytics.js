/**
 * Test Script for Analytics
 * Tests analytics directly (no server needed)
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const TEST_EMAIL = 'pnkjvshsht1@gmail.com';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n${colors.cyan}${msg}${colors.reset}\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`),
};

async function testAnalytics() {
  try {
    log.section('ANALYTICS TEST SCRIPT');
    log.info(`Testing with email: ${TEST_EMAIL}`);

    // Connect to MongoDB
    log.section('Step 0: Connecting to Database');
    const mongoUri = process.env.MONGO_URL || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    log.success('Connected to MongoDB');

    const User = require('./models/user');
    const AnalyticsService = require('./functions/AnalyticsService');
    const analyticsService = new AnalyticsService();

    // Step 1: Get user ID from email
    log.section('Step 1: Finding User ID');
    let userId;

    const user = await User.findOne({ email: TEST_EMAIL });
    if (user) {
      userId = user.userId;
      log.success(`Found User ID: ${userId}`);
      log.info(`User Name: ${user.name || 'N/A'}`);
    } else {
      log.error(`User not found with email: ${TEST_EMAIL}`);
      await mongoose.disconnect();
      return;
    }

    // Step 2: Refresh engagement data
    log.section('Step 2: Refreshing Engagement Data from Instagram');
    try {
      const refreshResult = await analyticsService.refreshEngagement(userId);
      log.success(`Refreshed ${refreshResult.updated} posts`);
      log.info(`Total posts: ${refreshResult.total}`);
      if (refreshResult.errors > 0) {
        log.warn(`Errors: ${refreshResult.errors}`);
      }
    } catch (error) {
      log.error(`Refresh failed: ${error.message}`);
    }

    // Step 3: Get dashboard analytics
    log.section('Step 3: Getting Analytics Dashboard');
    try {
      const dashboard = await analyticsService.getDashboard(userId, 30);
      const overview = dashboard.overview;
      log.success('Dashboard retrieved successfully');
      console.log('\n📊 OVERVIEW:');
      console.log(`  Total Posts: ${overview.totalPosts}`);
      console.log(`  Total Engagement: ${overview.totalEngagement}`);
      console.log(`  Total Reach: ${overview.totalReach}`);
      console.log(`  Total Impressions: ${overview.totalImpressions}`);
      console.log(`  Avg Engagement: ${overview.avgEngagement}`);

      if (dashboard.topPosts && dashboard.topPosts.length > 0) {
        console.log('\n🏆 TOP POSTS:');
        dashboard.topPosts.forEach((post, idx) => {
          console.log(`\n  ${idx + 1}. ${post.caption?.substring(0, 50)}...`);
          console.log(`     Likes: ${post.engagement?.likes || 0}`);
          console.log(`     Comments: ${post.engagement?.comments || 0}`);
          console.log(`     Reach: ${post.engagement?.reach || 0}`);
          console.log(`     Impressions: ${post.engagement?.impressions || 0}`);
          console.log(`     Plays: ${post.engagement?.plays || 0}`);
          console.log(`     Saves: ${post.engagement?.saves || 0}`);
        });
      }
    } catch (error) {
      log.error(`Dashboard failed: ${error.message}`);
    }

    // Step 4: Get growth metrics
    log.section('Step 4: Getting Growth Metrics');
    try {
      const growth = await analyticsService.getGrowthMetrics(userId, 30);
      log.success('Growth metrics retrieved successfully');
      console.log('\n📈 GROWTH TIMELINE (Last 7 days):');
      const timeline = growth.timeline;
      timeline.slice(-7).forEach(day => {
        console.log(`  ${day.date}: ${day.posts} posts, ${day.engagement} engagement, ${day.reach} reach`);
      });
    } catch (error) {
      log.error(`Growth metrics failed: ${error.message}`);
    }

    // Step 5: Get content analysis
    log.section('Step 5: Getting Content Analysis');
    try {
      const analysis = await analyticsService.getContentAnalysis(userId);
      log.success('Content analysis retrieved successfully');
      console.log(`\n📝 ANALYZED POSTS: ${analysis.totalAnalyzed}`);

      if (analysis.topHashtags && analysis.topHashtags.length > 0) {
        console.log('\n🏷️  TOP HASHTAGS:');
        analysis.topHashtags.slice(0, 5).forEach((tag, idx) => {
          console.log(`  ${idx + 1}. ${tag.tag} - Avg Engagement: ${tag.avgEngagement}`);
        });
      }

      if (analysis.typePerformance && analysis.typePerformance.length > 0) {
        console.log('\n📸 POST TYPE PERFORMANCE:');
        analysis.typePerformance.forEach(type => {
          console.log(`  ${type.type}: ${type.count} posts, Avg Engagement: ${type.avgEngagement}`);
        });
      }
    } catch (error) {
      log.error(`Content analysis failed: ${error.message}`);
    }

    log.section('✨ TEST COMPLETED ✨');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');

  } catch (error) {
    log.error(`Test failed: ${error.message}`);
    console.error(error);
    await mongoose.disconnect();
  }
}

// Run the test
testAnalytics();

