require('dotenv').config();
const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');

async function testApproval() {
  try {
    // Submit the template we created earlier for approval
    const url = 'https://content.twilio.com/v1/Content/HXc55614a1138e134d1468a37a32637755/ApprovalRequests/whatsapp';
    
    console.log('Sending approval request...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'MARKETING',
        name: 'test_template_name_123'
      })
    });
    
    const data = await response.text(); // Get raw text to see exact error
    console.log('Status Code:', response.status);
    console.log('Raw Response:', data);

  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

testApproval();
