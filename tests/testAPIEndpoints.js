/**
 * API Endpoint Test Script
 * Tests all API endpoints for the backend
 */

const BASE_URL = 'http://localhost:8080';
const TEST_USER_ID = 'test-user-' + Date.now();

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
  };
  console.log(`${icons[type] || '•'} ${message}`);
}

const results = { passed: 0, failed: 0, tests: [] };

async function testEndpoint(name, url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();

    if (response.ok || response.status < 500) {
      results.passed++;
      results.tests.push({ name, passed: true, status: response.status });
      log('pass', `${name} - Status: ${response.status}`);
      return data;
    } else {
      throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
    }
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      results.failed++;
      results.tests.push({ name, passed: false, error: 'Timeout' });
      log('fail', `${name}: Timeout (${timeoutMs / 1000}s)`);
    } else {
      results.failed++;
      results.tests.push({ name, passed: false, error: error.message });
      log('fail', `${name}: ${error.message}`);
    }
    return null;
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}🌐 API ENDPOINT TESTS${colors.reset}`);
  console.log('='.repeat(60) + '\n');

  // ============================================
  // HEALTH CHECK
  // ============================================
  console.log(`${colors.bold}🏥 HEALTH CHECK${colors.reset}\n`);

  await testEndpoint('Server Health', '/');

  // ============================================
  // VIRAL CONTENT API (longer timeout for AI calls)
  // ============================================
  console.log(`\n${colors.bold}🔥 VIRAL CONTENT API${colors.reset}\n`);

  await testEndpoint('GET /api/viral/trends/fashion', '/api/viral/trends/fashion?count=3', {}, 60000);
  await testEndpoint('GET /api/viral/hashtags/fashion', '/api/viral/hashtags/fashion', {}, 60000);
  await testEndpoint('GET /api/viral/formula/product-photos', '/api/viral/formula/product-photos', {}, 60000);
  await testEndpoint('GET /api/viral/competitor/nike', '/api/viral/competitor/nike', {}, 60000);

  // ============================================
  // ANALYTICS API
  // ============================================
  console.log(`\n${colors.bold}📊 ANALYTICS API${colors.reset}\n`);

  await testEndpoint('GET /api/analytics/dashboard/:userId', `/api/analytics/dashboard/${TEST_USER_ID}`);
  await testEndpoint('GET /api/analytics/best-times/:userId', `/api/analytics/best-times/${TEST_USER_ID}`);
  await testEndpoint('GET /api/analytics/content/:userId', `/api/analytics/content/${TEST_USER_ID}`);
  await testEndpoint('GET /api/analytics/growth/:userId', `/api/analytics/growth/${TEST_USER_ID}?days=7`);

  // ============================================
  // LIVE GENERATION API
  // ============================================
  console.log(`\n${colors.bold}🔄 LIVE GENERATION API${colors.reset}\n`);

  await testEndpoint('GET /api/live-generation/jobs/:userId', `/api/live-generation/jobs/${TEST_USER_ID}`);

  // ============================================
  // SCHEDULER API
  // ============================================
  console.log(`\n${colors.bold}📅 SCHEDULER API${colors.reset}\n`);

  await testEndpoint('GET /api/scheduler/posts/:userId', `/api/scheduler/posts/${TEST_USER_ID}`);
  await testEndpoint('GET /api/scheduler/stats/:userId', `/api/scheduler/stats/${TEST_USER_ID}`);
  await testEndpoint('GET /api/scheduler/campaigns/:userId', `/api/scheduler/campaigns/${TEST_USER_ID}`);

  // ============================================
  // CAMPAIGN API
  // ============================================
  console.log(`\n${colors.bold}🎯 CAMPAIGN API${colors.reset}\n`);

  await testEndpoint('GET /api/campaigns/user/:userId', `/api/campaigns/user/${TEST_USER_ID}`);

  // ============================================
  // POST TESTS (require body)
  // ============================================
  console.log(`\n${colors.bold}📬 POST ENDPOINTS${colors.reset}\n`);

  await testEndpoint('POST /api/viral/ideas', '/api/viral/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: TEST_USER_ID,
      niche: 'fashion',
      platform: 'instagram',
      count: 2,
    }),
  }, 90000);

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}📋 API TEST SUMMARY${colors.reset}`);
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
}

runTests().catch(console.error);

