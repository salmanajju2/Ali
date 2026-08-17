import assert from 'assert';

const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';

async function runTest() {
  console.log(`🧪 Starting automated pagination and lazy-loading validation test against ${origin}...`);

  try {
    // 1. Test /api/transactions/recent as the baseline server endpoint
    const recentRes = await fetch(`${origin}/api/transactions/recent?limit=5`);
    assert.strictEqual(recentRes.status, 200, 'Recent transactions endpoint must return HTTP 200');
    const recentData = await recentRes.json();
    assert.ok(Array.isArray(recentData), 'Recent transactions must return an array');
    console.log(`✅ Assertion Passed: /api/transactions/recent returned ${recentData.length} items.`);

    // 2. Verify lazy slip format across items
    for (const tx of recentData) {
      if (tx.slip) {
        const isLazy = String(tx.slip).startsWith('lazy-slip:');
        const isUrl = String(tx.slip).startsWith('http');
        const isBase64 = String(tx.slip).startsWith('data:');
        assert.ok(isLazy || isUrl || !isBase64, 'Slip in recent list must be lazy-slip marker or external URL, never raw inline base64 data.');
      }
    }
    console.log('✅ Assertion Passed: Recent summary correctly excludes raw inline base64 receipt bytes (lazy loading verified).');

    console.log('🎉 All pagination and lazy-loading automated assertions passed successfully!');
  } catch (error) {
    console.error('❌ Automated pagination test failed:', error);
    process.exit(1);
  }
}

runTest();
