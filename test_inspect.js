require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const messageSid = 'MM7ffeb948d7f03de154c9fd55de8d5f23';

async function inspectMessage() {
  try {
    console.log(`Fetching details for message ${messageSid}...`);
    const message = await client.messages(messageSid).fetch();
    console.log('- Status:', message.status);
    console.log('- Date Created:', message.dateCreated);
    console.log('- Error Code:', message.errorCode);
    console.log('- Body:', message.body);
    console.log('- Num Media:', message.numMedia);
    
    // fetch media sub-resources to see the URL Twilio tried
    const mediaList = await client.messages(messageSid).media.list();
    if (mediaList.length > 0) {
      mediaList.forEach((m, i) => {
        console.log(`  Media[${i}] SID: ${m.sid}`);
        console.log(`  Media[${i}] ContentType: ${m.contentType}`);
        console.log(`  Media[${i}] URI: ${m.uri}`);
      });
    } else {
      console.log('No media sub-resources found. Twilio may have stored the URL differently.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspectMessage();
