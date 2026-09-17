/**
 * Full end-to-end media send test using Catbox.moe
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const uploadToCatbox = require('./uploadToCatbox');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const NUMBERS = ['+923354025901', '+97332377688'];
const MESSAGE = '🕌 Assalamu Alaikum! Please find the attached Umrah package materials from Baba Air Travels.';

async function main() {
  const filesToSend = [
    { src: path.join(__dirname, 'test_files', 'umrah_promo_flyer.png'),    label: 'Image' },
    { src: path.join(__dirname, 'test_files', 'umrah_package_details.txt'),label: 'Document' },
    { src: path.join(__dirname, 'test_files', 'sample_video.mp4'),          label: 'Video' },
  ];

  const mediaItems = [];
  console.log(`\n📤 Uploading ${filesToSend.length} files to Catbox...`);
  for (const f of filesToSend) {
    if (!fs.existsSync(f.src)) { console.log(`⚠️  Skipping missing file: ${f.src}`); continue; }
    try {
      console.log(`  Uploading ${f.label}...`);
      const publicUrl = await uploadToCatbox(f.src);
      console.log(`  ✅ ${f.label}: ${publicUrl}`);
      mediaItems.push({ url: publicUrl, label: f.label });
    } catch (e) {
      console.log(`  ❌ Failed to upload ${f.label}: ${e.message}`);
    }
  }

  if (mediaItems.length === 0) {
    console.error('\n❌ No files were uploaded successfully.');
    process.exit(1);
  }

  console.log(`\n📤 Sending to ${NUMBERS.length} numbers via WhatsApp...\n`);

  const allSids = [];
  for (const num of NUMBERS) {
    const to = `whatsapp:${num}`;
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      try {
        const msg = await client.messages.create({
          from: FROM,
          to,
          body: i === 0 ? MESSAGE : '',
          mediaUrl: [item.url],
        });
        console.log(`  ✅ ${num} | ${item.label} → ${msg.sid} [${msg.status}]`);
        allSids.push({ num, sid: msg.sid, label: item.label });
      } catch (e) {
        console.log(`  ❌ ${num} | ${item.label} → FAILED: ${e.message}`);
      }
    }
  }

  if (allSids.length === 0) {
    console.log('\n❌ No messages sent.');
    return;
  }

  console.log(`\n⏳ Waiting 20 seconds for WhatsApp delivery...`);
  await new Promise(r => setTimeout(r, 20000));

  console.log('\n=== DELIVERY STATUS ===');
  let delivered = 0, failed = 0, pending = 0;
  for (const { num, sid, label } of allSids) {
    const msg = await client.messages(sid).fetch();
    const icon = ['delivered','read'].includes(msg.status) ? '✅' :
                 ['failed','undelivered'].includes(msg.status) ? '❌' : '⏳';
    if (icon === '✅') delivered++;
    else if (icon === '❌') failed++;
    else pending++;
    console.log(`${icon} ${num} | ${label} | ${msg.status} | Error: ${msg.errorCode || 'none'}`);
  }

  console.log(`\n📊 ${delivered} delivered | ${failed} failed | ${pending} pending (out of ${allSids.length})`);
}

main().catch(console.error);
