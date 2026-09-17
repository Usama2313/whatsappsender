require('dotenv').config();
const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');

const templates = [
  'HX27f554df3dc5806880463deb148c39f9',
  'HX3fe4038ecac0c8b0f35bad4f861a7a0f',
  'HX0630d35ee03f2ede0b2c09d319836b88',
  'HXdc751e061bcbfcaa030a5dff425e6356',
  'HX5ef475307c89185871849517c17fe792',
  'HXf3a0d76629675338f4809f03e68edfff',
  'HXc55614a1138e134d1468a37a32637755'
];

async function checkAll() {
  for (const sid of templates) {
    try {
      const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      const d = await r.json();
      const w = d.whatsapp || {};
      console.log(`${sid} | name: ${w.name || 'N/A'} | status: ${w.status || 'N/A'} | type: ${w.content_type || 'N/A'}`);
    } catch (e) {
      console.log(`${sid} | ERROR: ${e.message}`);
    }
  }
}

checkAll();
