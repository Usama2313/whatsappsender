require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const TEMPLATE_SID = 'HX3fe4038ecac0c8b0f35bad4f861a7a0f'; // second text template
const NUMBERS = ['+97334451249','+97332241249','+97332251249','+9733226139','+919849787154','+919177656344','+97332377688','+923278896691'];
const MESSAGE = 'Hello, this is a bulk WhatsApp test message.';

async function sendViaTemplate(){
  console.log('Sending using template', TEMPLATE_SID);
  const sids = [];
  for(const num of NUMBERS){
    try{
      const msg = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${num}`,
        contentSid: TEMPLATE_SID,
        contentVariables: JSON.stringify({"1": MESSAGE})
      });
      console.log('✅ Sent to', num, 'SID', msg.sid);
      sids.push(msg.sid);
    }catch(e){
      console.log('❌ Failed to send to', num, e.message);
    }
  }
  // write SIDs to a file for later status check
  const fs = require('fs');
  fs.writeFileSync('sent_sids.txt', sids.join('\n'));
  console.log('Done.');
}

sendViaTemplate().catch(console.error);
