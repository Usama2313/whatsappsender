require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function createTextTemplate() {
  try {
    const template = await client.content.v1.contents.create({
      friendlyName: 'Bulk_Text_Template',
      language: 'en',
      types: {
        'twilio/text': {}
      },
      text: {
        body: 'Hello {{1}}'
      }
    });
    console.log('✅ Created template SID:', template.sid);
    console.log('Status:', template.status);
  } catch (e) {
    console.error('❌ Error creating template:', e.message);
  }
}

createTextTemplate();
