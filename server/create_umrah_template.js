require('dotenv').config();
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  try {
    // First check if our existing text-only template is approved
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');

    console.log('=== Checking existing templates ===');
    const templates = ['HX3fe4038ecac0c8b0f35bad4f861a7a0f', 'HX0630d35ee03f2ede0b2c09d319836b88'];
    for (const sid of templates) {
      const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      const d = await r.json();
      console.log(`Template ${sid}: status=${d.whatsapp?.status}, name=${d.whatsapp?.name}`);
    }

    // Create a fresh template using Twilio's own demo image (guaranteed to work)
    console.log('\n=== Creating Umrah Marketing Template ===');
    const content = await client.content.v1.contents.create({
      friendlyName: 'baba_air_umrah_package',
      language: 'en',
      variables: { '1': 'Valued Customer' },
      types: {
        'twilio/media': {
          body: `Hello {{1}}! 🕌

We have an amazing *Umrah Package* available just for you!

✅ Return Flights
✅ Hotel Accommodation  
✅ Visa Processing
✅ Transport Included

Limited seats available. Book NOW before it's too late!

📞 Contact us today to secure your spot.

_Baba Air Travels - Your Trusted Travel Partner_`,
          media: ['https://demo.twilio.com/owl.png']
        }
      }
    });
    console.log('✅ New Template SID:', content.sid);

    // Submit for WhatsApp approval
    const approvalRes = await fetch(
      `https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'MARKETING', name: 'baba_air_umrah_package' })
      }
    );
    const approval = await approvalRes.json();
    console.log('📋 Approval Status:', approval.status || approval.message);

    // Test send immediately to +923354025901
    console.log('\n=== Sending test message to +923354025901 ===');
    const msg = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: 'whatsapp:+923354025901',
      contentSid: content.sid,
      contentVariables: JSON.stringify({ '1': 'Valued Customer' })
    });
    console.log('📤 Sent! Message SID:', msg.sid, '| Status:', msg.status);

    // Wait 8 seconds and check result
    await new Promise(r => setTimeout(r, 8000));
    const updated = await client.messages(msg.sid).fetch();
    console.log('📬 Final Status:', updated.status, '| ErrorCode:', updated.errorCode);

    console.log('\n=== DONE ===');
    console.log('Template SID:', content.sid);
    console.log('Put this in your website Template tab!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.moreInfo) console.error('More info:', err.moreInfo);
  }
}

run();
