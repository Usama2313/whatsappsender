require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function createTemplate() {
  try {
    const content = await client.content.v1.contents.create({
      friendlyName: 'baba_air_dynamic_media',
      language: 'en',
      variables: { '1': 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Kaaba_mirror_edit.jpg', '2': 'Customer' },
      types: {
        'twilio/media': {
          body: 'Hello {{2}}, check out our latest Umrah package updates!',
          media: ['{{1}}']
        }
      }
    });
    console.log('Created Content SID:', content.sid);

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
        name: 'baba_air_dynamic_media'
      })
    });
    const data = await response.json();
    console.log('Approval response:', data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

createTemplate();
