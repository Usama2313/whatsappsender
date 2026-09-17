require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

(async () => {
  const templates = await client.content.v1.contents.list({limit:200});
  for (const t of templates) {
    try {
      const appr = await client.content.v1.contents(t.sid).approvalRequests.list({limit:1});
      const status = appr[0]?.whatsapp?.status || 'no status';
      console.log(`${t.sid} | ${t.friendlyName || 'unnamed'} | ${status}`);
    } catch (e) {
      console.log(`${t.sid} | error: ${e.message}`);
    }
  }
})();
