require('dotenv').config();
const url = 'https://content.twilio.com/v1/Content/HX27f554df3dc5806880463deb148c39f9/ApprovalRequests';
const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
fetch(url, { headers: { 'Authorization': `Basic ${auth}` } })
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)));
