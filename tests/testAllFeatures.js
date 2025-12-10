/**
 * Comprehensive Test Script for All Backend Features
 * Tests: Instagram, Scheduler, Campaigns, Live Generation, Analytics, Viral Content
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:8080',
  testUserId: 'test-user-' + Date.now(),
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(type, message) {
  const icons = {
    pass: `${colors.green}✓${colors.reset}`,
    fail: `${colors.red}✗${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    test: `${colors.bold}🧪${colors.reset}`,
  };
  console.log(`${icons[type] || '•'} ${message}`);
}

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

function recordTest(name, passed, error = null) {
  results.tests.push({ name, passed, error });
  if (passed) results.passed++;
  else results.failed++;
}

// ============================================
// SERVICE IMPORTS (Direct testing)
// ============================================

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}🚀 QUESTERA BACKEND - COMPREHENSIVE TEST SUITE${colors.reset}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Connect to database
    log('info', 'Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    log('pass', 'MongoDB connected');

    // Run all test suites
    await testModels();
    await testServices();
    await testViralContent();
    await testAnalytics();
    await testLiveGeneration();
    await testOrchestrator();

  } catch (error) {
    log('fail', `Test setup failed: ${error.message}`);
  } finally {
    // Print summary
    printSummary();

    // Cleanup
    await mongoose.connection.close();
    log('info', 'Database connection closed');
  }
}

// ============================================
// MODEL TESTS
// ============================================

async function testModels() {
  console.log(`\n${colors.bold}📦 TESTING MODELS${colors.reset}\n`);

  // Test ScheduledPost model
  try {
    const ScheduledPost = require('../models/scheduledPost');
    const testPost = new ScheduledPost({
      userId: TEST_CONFIG.testUserId,
      accountId: 'test-account',
      platform: 'instagram',
      imageUrl: 'https://example.com/image.jpg',
      caption: 'Test caption',
      scheduledAt: new Date(Date.now() + 3600000),
    });
    await testPost.validate();
    recordTest('ScheduledPost model validation', true);
    log('pass', 'ScheduledPost model - valid');
  } catch (error) {
    recordTest('ScheduledPost model validation', false, error.message);
    log('fail', `ScheduledPost model - ${error.message}`);
  }

  // Test Campaign model
  try {
    const Campaign = require('../models/campaign');
    const testCampaign = new Campaign({
      userId: TEST_CONFIG.testUserId,
      name: 'Test Campaign',
      type: 'brand_awareness',
      status: 'draft',
    });
    await testCampaign.validate();
    recordTest('Campaign model validation', true);
    log('pass', 'Campaign model - valid');
  } catch (error) {
    recordTest('Campaign model validation', false, error.message);
    log('fail', `Campaign model - ${error.message}`);
  }

  // Test GenerationJob model
  try {
    const GenerationJob = require('../models/generationJob');
    const testJob = new GenerationJob({
      userId: TEST_CONFIG.testUserId,
      name: 'Test Job',
      socialAccountId: 'test-account',
      generationConfig: { basePrompt: 'Test prompt' },
      postingConfig: { platform: 'instagram', autoPost: true },
      schedule: { intervalMinutes: 60, nextRunAt: new Date() },
    });
    await testJob.validate();
    recordTest('GenerationJob model validation', true);
    log('pass', 'GenerationJob model - valid');
  } catch (error) {
    recordTest('GenerationJob model validation', false, error.message);
    log('fail', `GenerationJob model - ${error.message}`);
  }

  // Test SocialAccount model
  try {
    const SocialAccount = require('../models/socialAccount');
    const testAccount = new SocialAccount({
      userId: TEST_CONFIG.testUserId,
      platform: 'instagram',
      accountId: 'test-ig-account',
      username: 'testuser',
      accessToken: 'test-token',
    });
    await testAccount.validate();
    recordTest('SocialAccount model validation', true);
    log('pass', 'SocialAccount model - valid');
  } catch (error) {
    recordTest('SocialAccount model validation', false, error.message);
    log('fail', `SocialAccount model - ${error.message}`);
  }
}

// ============================================
// SERVICE TESTS
// ============================================

async function testServices() {
  console.log(`\n${colors.bold}⚙️ TESTING SERVICES${colors.reset}\n`);

  // Test SchedulerService instantiation
  try {
    const SchedulerService = require('../functions/SchedulerService');
    const scheduler = new SchedulerService();
    if (scheduler && typeof scheduler.schedulePost === 'function') {
      recordTest('SchedulerService instantiation', true);
      log('pass', 'SchedulerService - instantiated');
    } else {
      throw new Error('Missing methods');
    }
  } catch (error) {
    recordTest('SchedulerService instantiation', false, error.message);
    log('fail', `SchedulerService - ${error.message}`);
  }

  // Test InstagramService instantiation
  try {
    const InstagramService = require('../functions/InstagramService');
    const instagram = new InstagramService();
    if (instagram && typeof instagram.postImage === 'function') {
      recordTest('InstagramService instantiation', true);
      log('pass', 'InstagramService - instantiated');
    } else {
      throw new Error('Missing methods');
    }
  } catch (error) {
    recordTest('InstagramService instantiation', false, error.message);
    log('fail', `InstagramService - ${error.message}`);
  }

  // Test CampaignOrchestrator instantiation
  try {
    const CampaignOrchestrator = require('../functions/CampaignOrchestrator');
    const campaignOrch = new CampaignOrchestrator();
    if (campaignOrch && typeof campaignOrch.createCampaign === 'function') {
      recordTest('CampaignOrchestrator instantiation', true);
      log('pass', 'CampaignOrchestrator - instantiated');
    } else {
      throw new Error('Missing methods');
    }
  } catch (error) {
    recordTest('CampaignOrchestrator instantiation', false, error.message);
    log('fail', `CampaignOrchestrator - ${error.message}`);
  }
}

// ============================================
// VIRAL CONTENT TESTS
// ============================================

async function testViralContent() {
  console.log(`\n${colors.bold}🔥 TESTING VIRAL CONTENT SERVICE${colors.reset}\n`);

  try {
    const ViralContentService = require('../functions/ViralContentService');
    const viralService = new ViralContentService();

    // Test instantiation
    if (viralService) {
      recordTest('ViralContentService instantiation', true);
      log('pass', 'ViralContentService - instantiated');
    }

    // Test method existence
    const methods = ['findTrendingContent', 'analyzeCompetitor', 'generateViralIdeas', 'getTrendingHashtags', 'analyzeViralFormula'];
    for (const method of methods) {
      if (typeof viralService[method] === 'function') {
        recordTest(`ViralContentService.${method} exists`, true);
        log('pass', `ViralContentService.${method} - exists`);
      } else {
        recordTest(`ViralContentService.${method} exists`, false, 'Method not found');
        log('fail', `ViralContentService.${method} - not found`);
      }
    }

    // Test trending content (requires API key)
    if (process.env.GEMINI_API_KEY) {
      log('info', 'Testing findTrendingContent (requires Gemini API)...');
      try {
        const trends = await viralService.findTrendingContent('fashion', 'instagram', 3);
        if (trends && trends.trends && trends.trends.length > 0) {
          recordTest('ViralContentService.findTrendingContent API call', true);
          log('pass', `ViralContentService.findTrendingContent - returned ${trends.trends.length} trends`);
        } else {
          recordTest('ViralContentService.findTrendingContent API call', false, 'No trends returned');
          log('fail', 'ViralContentService.findTrendingContent - no trends');
        }
      } catch (apiError) {
        recordTest('ViralContentService.findTrendingContent API call', false, apiError.message);
        log('warn', `ViralContentService.findTrendingContent - API error: ${apiError.message}`);
      }
    } else {
      log('warn', 'Skipping API tests - GEMINI_API_KEY not set');
      results.skipped++;
    }

  } catch (error) {
    recordTest('ViralContentService tests', false, error.message);
    log('fail', `ViralContentService - ${error.message}`);
  }
}

// ============================================
// ANALYTICS TESTS
// ============================================

async function testAnalytics() {
  console.log(`\n${colors.bold}📊 TESTING ANALYTICS SERVICE${colors.reset}\n`);

  try {
    const AnalyticsService = require('../functions/AnalyticsService');
    const analyticsService = new AnalyticsService();

    // Test instantiation
    if (analyticsService) {
      recordTest('AnalyticsService instantiation', true);
      log('pass', 'AnalyticsService - instantiated');
    }

    // Test method existence
    const methods = ['getDashboard', 'getBestPostingTimes', 'getContentAnalysis', 'refreshEngagement', 'getGrowthMetrics'];
    for (const method of methods) {
      if (typeof analyticsService[method] === 'function') {
        recordTest(`AnalyticsService.${method} exists`, true);
        log('pass', `AnalyticsService.${method} - exists`);
      } else {
        recordTest(`AnalyticsService.${method} exists`, false, 'Method not found');
        log('fail', `AnalyticsService.${method} - not found`);
      }
    }

    // Test dashboard (with empty data)
    try {
      const dashboard = await analyticsService.getDashboard(TEST_CONFIG.testUserId, 7);
      if (dashboard && typeof dashboard.overview === 'object') {
        recordTest('AnalyticsService.getDashboard returns data', true);
        log('pass', 'AnalyticsService.getDashboard - returns valid structure');
      } else {
        recordTest('AnalyticsService.getDashboard returns data', false, 'Invalid structure');
        log('fail', 'AnalyticsService.getDashboard - invalid structure');
      }
    } catch (dashError) {
      recordTest('AnalyticsService.getDashboard returns data', false, dashError.message);
      log('fail', `AnalyticsService.getDashboard - ${dashError.message}`);
    }

  } catch (error) {
    recordTest('AnalyticsService tests', false, error.message);
    log('fail', `AnalyticsService - ${error.message}`);
  }
}

// ============================================
// LIVE GENERATION TESTS
// ============================================

async function testLiveGeneration() {
  console.log(`\n${colors.bold}🔄 TESTING LIVE GENERATION SERVICE${colors.reset}\n`);

  try {
    const LiveGenerationService = require('../functions/LiveGenerationService');
    const liveGenService = new LiveGenerationService();

    // Test instantiation
    if (liveGenService) {
      recordTest('LiveGenerationService instantiation', true);
      log('pass', 'LiveGenerationService - instantiated');
    }

    // Test method existence
    const methods = ['createJob', 'processDueJobs', 'pauseJob', 'resumeJob', 'getJobs'];
    for (const method of methods) {
      if (typeof liveGenService[method] === 'function') {
        recordTest(`LiveGenerationService.${method} exists`, true);
        log('pass', `LiveGenerationService.${method} - exists`);
      } else {
        recordTest(`LiveGenerationService.${method} exists`, false, 'Method not found');
        log('fail', `LiveGenerationService.${method} - not found`);
      }
    }

  } catch (error) {
    recordTest('LiveGenerationService tests', false, error.message);
    log('fail', `LiveGenerationService - ${error.message}`);
  }
}

// ============================================
// ORCHESTRATOR TESTS
// ============================================

async function testOrchestrator() {
  console.log(`\n${colors.bold}🎯 TESTING ORCHESTRATOR SERVICE${colors.reset}\n`);

  try {
    const OrchestratorService = require('../functions/Orchestrator');
    const orchestrator = new OrchestratorService();

    // Test instantiation
    if (orchestrator) {
      recordTest('OrchestratorService instantiation', true);
      log('pass', 'OrchestratorService - instantiated');
    }

    // Test method existence
    const methods = ['processMessage', 'determineIntent', 'handleImageGeneration', 'handleScheduledCampaign', 'handleLiveGeneration', 'handleViralContent'];
    for (const method of methods) {
      if (typeof orchestrator[method] === 'function') {
        recordTest(`OrchestratorService.${method} exists`, true);
        log('pass', `OrchestratorService.${method} - exists`);
      } else {
        recordTest(`OrchestratorService.${method} exists`, false, 'Method not found');
        log('fail', `OrchestratorService.${method} - not found`);
      }
    }

  } catch (error) {
    recordTest('OrchestratorService tests', false, error.message);
    log('fail', `OrchestratorService - ${error.message}`);
  }
}

// ============================================
// PRINT SUMMARY
// ============================================

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}📋 TEST SUMMARY${colors.reset}`);
  console.log('='.repeat(60));

  console.log(`\n${colors.green}✓ Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${results.failed}${colors.reset}`);
  console.log(`${colors.yellow}⚠ Skipped: ${results.skipped}${colors.reset}`);

  const total = results.passed + results.failed;
  const percentage = total > 0 ? Math.round((results.passed / total) * 100) : 0;
  console.log(`\n${colors.bold}Pass Rate: ${percentage}%${colors.reset}`);

  if (results.failed > 0) {
    console.log(`\n${colors.red}${colors.bold}Failed Tests:${colors.reset}`);
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  ${colors.red}✗${colors.reset} ${t.name}: ${t.error}`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run tests
runTests().catch(console.error);
