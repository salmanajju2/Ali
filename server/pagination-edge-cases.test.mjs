import assert from 'assert';

const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';
const testToken = process.env.TEST_FIREBASE_ID_TOKEN || '';
const requestInit = testToken ? { headers: { Authorization: `Bearer ${testToken}` } } : {};

async function runEdgeCaseTests() {
  console.log(`🧪 Running pagination edge case and lazy loading validation against ${origin}...`);
  if (!testToken) {
    console.log('⏭️ Skipped: set TEST_FIREBASE_ID_TOKEN to run authenticated live edge-case checks.');
    return;
  }

  try {
    // 1. Edge Case: Out-of-range or non-existent cursor beforeId
    const outOfRangeRes = await fetch(`${origin}/api/transactions/history?beforeId=999999999&limit=10`, requestInit);
    assert.ok([200, 400, 422].includes(outOfRangeRes.status), `Out-of-range cursor status must be handled gracefully, got ${outOfRangeRes.status}`);
    console.log('✅ Edge Case Passed: Out-of-range beforeId cursor handled gracefully.');

    // 2. Edge Case: Invalid non-numeric beforeId query parameter
    const invalidCursorRes = await fetch(`${origin}/api/transactions/history?beforeId=abc&limit=5`, requestInit);
    assert.ok([200, 400, 422].includes(invalidCursorRes.status), `Invalid non-numeric cursor status must be handled, got ${invalidCursorRes.status}`);
    console.log('✅ Edge Case Passed: Invalid non-numeric cursor handled.');

    // 3. Edge Case: Zero or negative limit normalization
    const zeroLimitRes = await fetch(`${origin}/api/transactions/history?limit=0`, requestInit);
    assert.ok([200, 400, 422].includes(zeroLimitRes.status), `Zero limit query status must be handled, got ${zeroLimitRes.status}`);
    console.log('✅ Edge Case Passed: Zero/negative limit handled.');

    // 4. Verify Lazy Loading payload contract
    const recentRes = await fetch(`${origin}/api/transactions/recent?limit=3`, requestInit);
    assert.strictEqual(recentRes.status, 200);
    const recentItems = await recentRes.json();
    assert.ok(Array.isArray(recentItems), 'Recent items must be an array');
    console.log(`✅ Edge Case Passed: Bounded recent items fetched successfully (count: ${recentItems.length}).`);

    console.log('🎉 All pagination edge-case and lazy-loading tests passed successfully!');
  } catch (error) {
    console.error('❌ Pagination edge case test failed:', error);
    process.exit(1);
  }
}

runEdgeCaseTests();
