/**
 * Send image, video, and document to numbers after template opens the session window.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const uploadToCatbox = require('./uploadToCatbox');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const NUMBERS = ['+923354025901', '+97332377688'];
const MESSAGE =
  '🕌 Assalamu Alaikum! Please find the attached Umrah package materials from Baba Air Travels — image, document, and video.';

async function ensureFiles() {
  const dir = path.join(__dirname, 'test_files');
  const files = [
    { src: path.join(dir, 'umrah_promo_flyer.png'), url: 'https://demo.twilio.com/owl.png' },
    { src: path.join(dir, 'sample_video.mp4'), url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
  ];

  for (const f of files) {
    if (!fs.existsSync(f.src) || fs.statSync(f.src).size < 1000) {
      const resp = await fetch(f.url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`Failed to download ${path.basename(f.src)}`);
      fs.writeFileSync(f.src, Buffer.from(await resp.arrayBuffer()));
    }
  }
}

async function main() {
  await ensureFiles();

  const filesToSend = [
    { src: path.join(__dirname, 'test_files', 'umrah_promo_flyer.png'), label: 'Image' },
    { src: path.join(__dirname, 'test_files', 'umrah_package_details.txt'), label: 'Document' },
    { src: path.join(__dirname, 'test_files', 'sample_video.mp4'), label: 'Video' },
  ];

  console.log('Uploading media to Catbox...');
  const mediaItems = [];
  for (const f of filesToSend) {
    const publicUrl = await uploadToCatbox(f.src);
    console.log(`  ✅ ${f.label}: ${publicUrl}`);
    mediaItems.push({ url: publicUrl, label: f.label });
  }

  console.log('\nWaiting 5 seconds for template session window...');
  await new Promise((r) => setTimeout(r, 5000));

  const allSids = [];
  for (const num of NUMBERS) {
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      try {
        const msg = await client.messages.create({
          from: FROM,
          to: `whatsapp:${num}`,
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

  console.log('\nWaiting 20 seconds for delivery status...');
  await new Promise((r) => setTimeout(r, 20000));

  console.log('\n=== DELIVERY STATUS ===');
  let delivered = 0;
  let failed = 0;
  let pending = 0;
  for (const { num, sid, label } of allSids) {
    const msg = await client.messages(sid).fetch();
    const icon = ['delivered', 'read'].includes(msg.status)
      ? '✅'
      : ['failed', 'undelivered'].includes(msg.status)
        ? '❌'
        : '⏳';
    if (icon === '✅') delivered++;
    else if (icon === '❌') failed++;
    else pending++;
    console.log(
      `${icon} ${num} | ${label} | ${msg.status} | Error: ${msg.errorCode || 'none'}${msg.errorMessage ? ' - ' + msg.errorMessage : ''}`
    );
  }

  console.log(`\n📊 ${delivered} delivered | ${failed} failed | ${pending} pending (out of ${allSids.length})`);
}

main().catch(console.error);
