require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  try {
    // Create template with FIXED image URL (required by WhatsApp) + variable body text
    const content = await client.content.v1.contents.create({
      friendlyName: 'baba_air_umrah_promo',
      language: 'en',
      variables: { '1': 'Customer' },
      types: {
        'twilio/media': {
          body: 'Hello {{1}},\n\nWe have an exciting Umrah package available for you! Flights, Hotels & Visa included.\n\nContact us today to book your spot!\n\nBaba Air Travels',
          media: [
            'https://upload.wikimedia.org/wikipedia/commons/a/a3/Kaaba_mirror_edit.jpg'
          ]
        }
      }
    });
    console.log('✅ Template Created! Content SID:', content.sid);

    // Submit for WhatsApp approval
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    const url = `https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'MARKETING',
        name: 'baba_air_umrah_promo'
      })
    });
    const data = await response.json();
    console.log('📋 Approval Status:', data.status);
    console.log('\nNow testing send to +923354025901...');

    // Test send immediately
    const msg = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: 'whatsapp:+923354025901',
      contentSid: content.sid,
      contentVariables: JSON.stringify({ '1': 'Valued Customer' })
    });
    console.log('📤 Message SID:', msg.sid, '| Status:', msg.status);

  } catch (err) {
    console.error('❌ Error:', err.message, err.code || '');
  }
}

run();
