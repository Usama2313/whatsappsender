const fetch = require('node-fetch');

async function testEndpoints() {
  const baseUrl = 'http://localhost:5000/api';
  console.log('Testing GET /api/templates...');
  try {
    const res = await fetch(`${baseUrl}/templates`);
    const data = await res.json();
    console.log('✅ /api/templates response:', Object.keys(data), 'Templates count:', data.templates?.length);
  } catch (err) {
    console.error('❌ /api/templates failed:', err.message);
  }

  console.log('\nTesting GET /api/inbound-messages...');
  try {
    const res = await fetch(`${baseUrl}/inbound-messages`);
    const data = await res.json();
    console.log('✅ /api/inbound-messages response:', Object.keys(data), 'Messages count:', data.messages?.length);
  } catch (err) {
    console.error('❌ /api/inbound-messages failed:', err.message);
  }

  console.log('\nTesting GET /api/active-sessions...');
  try {
    const res = await fetch(`${baseUrl}/active-sessions`);
    const data = await res.json();
    console.log('✅ /api/active-sessions response:', Object.keys(data), 'Sessions count:', data.sessions?.length);
  } catch (err) {
    console.error('❌ /api/active-sessions failed:', err.message);
  }

  console.log('\nTesting GET /api/message-status (with fake sid)...');
  try {
    const res = await fetch(`${baseUrl}/message-status?sids=SM12345`);
    const data = await res.json();
    console.log('✅ /api/message-status response:', data);
  } catch (err) {
    console.error('❌ /api/message-status failed:', err.message);
  }
}

testEndpoints();
