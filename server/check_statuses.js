require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const sids = [
  'MM9a239025c29dbd6d85c2b9a944e6cd4b',
  'MM92ce0ca38b68a06ea33481859642da14',
  'MM7ade9516f98490cee10d49eca6b582e4',
  'MM5240946b1e7225843f28fc3c00b4f924',
  'MM2b415eaa4de54f526daea9bb8cebeb5e',
  'MM578fa5097f0243cd60aef562980f22f4',
  'MMc7350dc0cea25b064c66b6af4507f66b',
  'MM4da9682a5dfc620915e745f2d842c8b3'
];

(async () => {
  console.log('Fetching delivery status for each message...');
  for (const sid of sids) {
    try {
      const msg = await client.messages(sid).fetch();
      console.log(`${sid}: status=${msg.status} errorCode=${msg.errorCode || 'none'}`);
    } catch (e) {
      console.error(`${sid}: fetch error`, e.message);
    }
  }
})();
