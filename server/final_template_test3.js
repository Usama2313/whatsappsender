require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  try {
    const imageUrl = 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png';

    // Create template
    console.log('Creating template...');
    const content = await client.content.v1.contents.create({
      friendlyName: 'baba_air_umrah_final_test',
      language: 'en',
      variables: { '1': 'Customer' },
      types: {
        'twilio/media': {
          body: 'Hello {{1}},\n\nWe have a special Umrah package available!\n\nContact us to book your spot!\n\n- Baba Air Travels',
          media: [imageUrl]
        }
      }
    });
    console.log('✅ Template SID:', content.sid);

    // Submit for approval
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    const approvalRes = await fetch(`https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'MARKETING', name: 'baba_air_umrah_final_test' })
    });
    const approval = await approvalRes.json();
    console.log('📋 Approval status:', approval.status);
    if(approval.status === 400) console.log(approval);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

run();
