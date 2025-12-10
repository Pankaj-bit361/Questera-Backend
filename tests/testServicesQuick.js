/**
 * Quick Service Test - No Database Required
 * Tests service instantiation and method existence
 */

require('dotenv').config();

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
  };
  console.log(`${icons[type] || '•'} ${message}`);
}

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, passed: true });
    log('pass', name);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, passed: false, error: error.message });
    log('fail', `${name}: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`${colors.bold}🧪 QUESTERA BACKEND - QUICK SERVICE TEST${colors.reset}`);
console.log('='.repeat(60) + '\n');

// ============================================
// SERVICE INSTANTIATION TESTS
// ============================================

console.log(`${colors.bold}⚙️ SERVICE INSTANTIATION${colors.reset}\n`);

test('SchedulerService loads', () => {
  const SchedulerService = require('../functions/SchedulerService');
  const service = new SchedulerService();
  if (!service) throw new Error('Failed to instantiate');
});

test('InstagramService loads', () => {
  const InstagramService = require('../functions/InstagramService');
  const service = new InstagramService();
  if (!service) throw new Error('Failed to instantiate');
});

test('CampaignOrchestrator loads', () => {
  const CampaignOrchestrator = require('../functions/CampaignOrchestrator');
  const service = new CampaignOrchestrator();
  if (!service) throw new Error('Failed to instantiate');
});

test('LiveGenerationService loads', () => {
  const LiveGenerationService = require('../functions/LiveGenerationService');
  const service = new LiveGenerationService();
  if (!service) throw new Error('Failed to instantiate');
});

test('AnalyticsService loads', () => {
  const AnalyticsService = require('../functions/AnalyticsService');
  const service = new AnalyticsService();
  if (!service) throw new Error('Failed to instantiate');
});

test('ViralContentService loads', () => {
  const ViralContentService = require('../functions/ViralContentService');
  const service = new ViralContentService();
  if (!service) throw new Error('Failed to instantiate');
});

test('OrchestratorService loads', () => {
  const OrchestratorService = require('../functions/Orchestrator');
  const service = new OrchestratorService();
  if (!service) throw new Error('Failed to instantiate');
});

// ============================================
// METHOD EXISTENCE TESTS
// ============================================

console.log(`\n${colors.bold}📋 METHOD EXISTENCE${colors.reset}\n`);

test('SchedulerService.schedulePost exists', () => {
  const SchedulerService = require('../functions/SchedulerService');
  const service = new SchedulerService();
  if (typeof service.schedulePost !== 'function') throw new Error('Method not found');
});

test('SchedulerService.processScheduledPosts exists', () => {
  const SchedulerService = require('../functions/SchedulerService');
  const service = new SchedulerService();
  if (typeof service.processScheduledPosts !== 'function') throw new Error('Method not found');
});

test('InstagramService.postImage exists', () => {
  const InstagramService = require('../functions/InstagramService');
  const service = new InstagramService();
  if (typeof service.postImage !== 'function') throw new Error('Method not found');
});

test('LiveGenerationService.createJob exists', () => {
  const LiveGenerationService = require('../functions/LiveGenerationService');
  const service = new LiveGenerationService();
  if (typeof service.createJob !== 'function') throw new Error('Method not found');
});

test('LiveGenerationService.processDueJobs exists', () => {
  const LiveGenerationService = require('../functions/LiveGenerationService');
  const service = new LiveGenerationService();
  if (typeof service.processDueJobs !== 'function') throw new Error('Method not found');
});

test('AnalyticsService.getDashboard exists', () => {
  const AnalyticsService = require('../functions/AnalyticsService');
  const service = new AnalyticsService();
  if (typeof service.getDashboard !== 'function') throw new Error('Method not found');
});

test('ViralContentService.findTrendingContent exists', () => {
  const ViralContentService = require('../functions/ViralContentService');
  const service = new ViralContentService();
  if (typeof service.findTrendingContent !== 'function') throw new Error('Method not found');
});

test('ViralContentService.analyzeCompetitor exists', () => {
  const ViralContentService = require('../functions/ViralContentService');
  const service = new ViralContentService();
  if (typeof service.analyzeCompetitor !== 'function') throw new Error('Method not found');
});

test('OrchestratorService.handleChat exists', () => {
  const OrchestratorService = require('../functions/Orchestrator');
  const service = new OrchestratorService();
  if (typeof service.handleChat !== 'function') throw new Error('Method not found');
});

test('OrchestratorService.handleViralContent exists', () => {
  const OrchestratorService = require('../functions/Orchestrator');
  const service = new OrchestratorService();
  if (typeof service.handleViralContent !== 'function') throw new Error('Method not found');
});

// Print summary
console.log('\n' + '='.repeat(60));
console.log(`${colors.bold}📋 TEST SUMMARY${colors.reset}`);
console.log('='.repeat(60));
console.log(`\n${colors.green}✓ Passed: ${results.passed}${colors.reset}`);
console.log(`${colors.red}✗ Failed: ${results.failed}${colors.reset}`);
const pct = Math.round((results.passed / (results.passed + results.failed)) * 100);
console.log(`\n${colors.bold}Pass Rate: ${pct}%${colors.reset}\n`);

if (results.failed > 0) {
  console.log(`${colors.red}Failed Tests:${colors.reset}`);
  results.tests.filter(t => !t.passed).forEach(t => {
    console.log(`  ${colors.red}✗${colors.reset} ${t.name}: ${t.error}`);
  });
}

process.exit(results.failed > 0 ? 1 : 0);

