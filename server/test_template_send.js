require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const TEMPLATE_SID = 'HXb6493b5c63e5796176ec77a6bfc43368'; // first text template (unknown approval)
const NUMBERS = ['+97334451249','+97332241249','+97332251249','+9733226139','+919849787154','+919177656344','+97332377688','+923278896691'];
const MESSAGE = 'Test bulk message via template';

async function sendViaTemplate(){
  console.log('Sending using template', TEMPLATE_SID);
  const all = [];
  for(const num of NUMBERS){
    try{
      const msg = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${num}`,
        contentSid: TEMPLATE_SID,
        contentVariables: JSON.stringify({"1": MESSAGE})
      });
      console.log('✅ Sent to', num, 'SID', msg.sid);
      all.push({num, sid: msg.sid});
    }catch(e){
      console.log('❌ Failed to send to', num, e.message);
    }
  }
  console.log('Done.');
}

sendViaTemplate().catch(console.error);
