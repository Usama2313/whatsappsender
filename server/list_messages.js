require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

client.messages.list({ limit: 3 })
  .then(messages => {
    messages.forEach(m => {
      console.log(`SID: ${m.sid} | To: ${m.to} | Status: ${m.status} | ErrorCode: ${m.errorCode} | ErrorMessage: ${m.errorMessage} | Date: ${m.dateCreated}`);
    });
  })
  .catch(e => console.error('Error:', e.message));
