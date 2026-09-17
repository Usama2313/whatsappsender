require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const TEMPLATE_SID = 'HXdc751e061bcbfcaa030a5dff425e6356'; // approved media template
const NUMBERS = ['+923354025901', '+97332377688', '+923278896691'];
const MESSAGE = 'Test bulk message sent via verified template';

async function sendViaTemplate(){
  console.log('Sending using template', TEMPLATE_SID);
  const sids = [];
  for(const num of NUMBERS){
    try{
      const msg = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${num}`,
        contentSid: TEMPLATE_SID,
        contentVariables: JSON.stringify({"1": "Valued Customer"})
      });
      console.log('✅ Sent to', num, 'SID', msg.sid);
      sids.push({num, sid: msg.sid});
    }catch(e){
      console.log('❌ Failed to send to', num, e.message);
    }
  }
  
  console.log('Waiting 5 seconds to check delivery status...');
  setTimeout(async () => {
    for (const item of sids) {
      try {
        const fetched = await client.messages(item.sid).fetch();
        console.log(`Status for ${item.num}: ${fetched.status} (ErrorCode: ${fetched.errorCode || 'none'})`);
      } catch(e) {
        console.error(`Failed to fetch status for ${item.num}`, e.message);
      }
    }
  }, 5000);
}

sendViaTemplate().catch(console.error);
