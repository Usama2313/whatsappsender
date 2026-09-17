require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function createTemplate(){
  try{
    const tmpl = await client.content.v1.contents.create({
      friendlyName: 'Bulk_Text_Template_Auto',
      language: 'en',
      types: { 'twilio/text': {} },
      text: { body: '{{1}}' }
    });
    console.log('✅ Created template SID:', tmpl.sid);
    console.log('Status:', tmpl.status);
  }catch(e){
    console.error('❌ Error creating template:', e.message);
  }
}

createTemplate();
