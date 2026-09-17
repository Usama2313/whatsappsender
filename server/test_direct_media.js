/**
 * Direct Twilio API test — bypasses the local server entirely
 * Tests: WhatsApp media with a known public URL
 */
require('dotenv').config();
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const TO = 'whatsapp:+923354025901';

async function testDirectMedia() {
  console.log('FROM:', FROM);
  console.log('TO:', TO);
  console.log('');

  // Test 1: Twilio's own sample media URL (should 100% work if account supports media)
  console.log('--- Test 1: Twilio demo owl.png ---');
  try {
    const msg = await client.messages.create({
      from: FROM,
      to: TO,
      body: 'Test 1: Twilio own demo image',
      mediaUrl: ['https://demo.twilio.com/owl.png'],
    });
    console.log('SID:', msg.sid, '| Status:', msg.status);
    
    // Wait and poll
    await new Promise(r => setTimeout(r, 10000));
    const updated = await client.messages(msg.sid).fetch();
    console.log('Final status:', updated.status, '| ErrorCode:', updated.errorCode);
  } catch (e) {
    console.error('FAILED:', e.message);
  }

  // Test 2: A known public Google image (used by developers testing Twilio)
  console.log('\n--- Test 2: Google logo PNG ---');
  try {
    const msg = await client.messages.create({
      from: FROM,
      to: TO,
      body: 'Test 2: Google logo',
      mediaUrl: ['https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png'],
    });
    console.log('SID:', msg.sid, '| Status:', msg.status);
    
    await new Promise(r => setTimeout(r, 10000));
    const updated = await client.messages(msg.sid).fetch();
    console.log('Final status:', updated.status, '| ErrorCode:', updated.errorCode);
  } catch (e) {
    console.error('FAILED:', e.message);
  }

  // Test 3: Plain Wikipedia image
  console.log('\n--- Test 3: Wikipedia PNG ---');
  try {
    const msg = await client.messages.create({
      from: FROM,
      to: TO,
      body: 'Test 3: Wikipedia image',
      mediaUrl: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg'],
    });
    console.log('SID:', msg.sid, '| Status:', msg.status);
    
    await new Promise(r => setTimeout(r, 12000));
    const updated = await client.messages(msg.sid).fetch();
    console.log('Final status:', updated.status, '| ErrorCode:', updated.errorCode);
  } catch (e) {
    console.error('FAILED:', e.message);
  }
}

testDirectMedia().catch(console.error);
