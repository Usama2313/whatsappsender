/**
 * Test: Send WhatsApp media via approved Content Template (bypasses 24h session rule)
 */
require('dotenv').config();
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;

async function listTemplates() {
  console.log('=== Fetching all approved templates ===\n');
  const templates = await client.content.v1.contents.list({ limit: 50 });
  const approved = [];
  for (const t of templates) {
    let waStatus = 'unknown';
    try {
      const approvalFetch = await client.content.v1.contents(t.sid).approvalRequests.fetch();
      waStatus = approvalFetch?.whatsapp?.status || 'unknown';
    } catch (_) {}

    const types = Object.keys(t.types || {}).join(', ');
    const isMedia = !!(t.types?.['twilio/media'] || t.types?.['twilio/call-to-action'] || types.includes('media'));
    console.log(`[${waStatus.toUpperCase()}] ${t.friendlyName} | ${t.sid}`);
    console.log(`   Types: ${types} ${isMedia ? '(has media)' : ''}`);

    if (waStatus === 'approved') {
      approved.push({ sid: t.sid, name: t.friendlyName, types, isMedia });
    }
  }
  return approved;
}

async function testTemplateSend(templateSid, templateName, to) {
  console.log(`\n--- Sending [${templateName}] to ${to} ---`);
  try {
    const msg = await client.messages.create({
      from: FROM,
      to: `whatsapp:${to}`,
      contentSid: templateSid,
      contentVariables: JSON.stringify({ '1': 'Valued Customer' }),
    });
    console.log('SID:', msg.sid, '| Initial status:', msg.status);

    await new Promise(r => setTimeout(r, 12000));
    const updated = await client.messages(msg.sid).fetch();
    const icon = ['delivered', 'read'].includes(updated.status) ? '✅' : '❌';
    console.log(`${icon} Final status: ${updated.status} | Error: ${updated.errorCode || 'none'}`);
    return updated.status;
  } catch (e) {
    console.error('❌ FAILED:', e.message);
    return 'error';
  }
}

async function main() {
  const approved = await listTemplates();
  console.log(`\n=== Found ${approved.length} approved templates ===\n`);

  const TO = '+923354025901';

  for (const t of approved) {
    await testTemplateSend(t.sid, t.name, TO);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
