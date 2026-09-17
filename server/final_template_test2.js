require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  try {
    const imageUrl = 'https://avatars.githubusercontent.com/u/5243833?v=4'; // Reliable, fast, always up

    // Create template
    console.log('Creating template...');
    const content = await client.content.v1.contents.create({
      friendlyName: 'baba_air_umrah_success',
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
      body: JSON.stringify({ category: 'MARKETING', name: 'baba_air_umrah_success' })
    });
    const approval = await approvalRes.json();
    console.log('📋 Approval status:', approval.status);

    // Send to +923354025901 immediately
    console.log('Sending test message to +923354025901...');
    const msg = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: 'whatsapp:+923354025901',
      contentSid: content.sid,
      contentVariables: JSON.stringify({ '1': 'Valued Customer' })
    });
    console.log('📤 Message SID:', msg.sid, '| Status:', msg.status);

    // Check status after 6 seconds
    await new Promise(r => setTimeout(r, 6000));
    const updated = await client.messages(msg.sid).fetch();
    console.log('📬 Final Status:', updated.status, '| ErrorCode:', updated.errorCode, '| ErrorMessage:', updated.errorMessage);

    console.log('\n=== USE THIS ON YOUR WEBSITE ===');
    console.log('Template SID:', content.sid);
    console.log('Variables JSON:', JSON.stringify({ '1': 'Customer' }));

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

run();
