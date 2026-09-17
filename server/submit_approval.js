require('dotenv').config();
const sid = 'HX3fe4038ecac0c8b0f35bad4f861a7a0f';
const url = `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`;
const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'MARKETING',
    name: 'baba_air_umrah_text_only'
  })
})
.then(r => r.json())
.then(data => console.log('Approval response:', data))
.catch(e => console.error('Error:', e.message));
