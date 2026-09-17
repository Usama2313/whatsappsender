require('dotenv').config();
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  try {
    // 1. Upload the PNG to 0x0.st to get a permanent, Twilio-accessible URL
    console.log('Uploading image to 0x0.st...');
    const imgPath = path.join(__dirname, 'test_image.png');
    const imgBuffer = fs.readFileSync(imgPath);
    const blob = new Blob([imgBuffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, 'umrah_promo.png');

    const uploadRes = await fetch('https://0x0.st', { method: 'POST', body: formData });
    if (!uploadRes.ok) throw new Error(`0x0.st upload failed: ${uploadRes.status}`);
    const imageUrl = (await uploadRes.text()).trim();
    console.log('✅ Image URL:', imageUrl);

    // 2. Create template with the permanent image URL
    console.log('Creating template...');
    const content = await client.content.v1.contents.create({
      friendlyName: 'baba_air_umrah_final',
      language: 'en',
      variables: { '1': 'Valued Customer' },
      types: {
        'twilio/media': {
          body: 'Hello {{1}},\n\nWe have a special Umrah package available!\n\nFlights, Hotels & Visa included.\n\nContact us to book your spot!\n\n- Baba Air Travels',
          media: [imageUrl]
        }
      }
    });
    console.log('✅ Template SID:', content.sid);

    // 3. Submit for approval
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    const approvalRes = await fetch(`https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'MARKETING', name: 'baba_air_umrah_final' })
    });
    const approval = await approvalRes.json();
    console.log('📋 Approval status:', approval.status);

    // 4. Immediately try sending to test number
    console.log('Sending test message to +923354025901...');
    const msg = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: 'whatsapp:+923354025901',
      contentSid: content.sid,
      contentVariables: JSON.stringify({ '1': 'Valued Customer' })
    });
    console.log('📤 Message SID:', msg.sid, '| Status:', msg.status);

    // 5. Wait a few seconds then check status
    await new Promise(r => setTimeout(r, 6000));
    const updated = await client.messages(msg.sid).fetch();
    console.log('📬 Final Status:', updated.status, '| ErrorCode:', updated.errorCode);

    console.log('\n=== RESULT ===');
    console.log('Template SID to use on website:', content.sid);
    console.log('Image URL (permanent):', imageUrl);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

run();
