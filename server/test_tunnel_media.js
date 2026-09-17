/**
 * Full end-to-end media send test using Cloudflare Tunnel
 * - Copies image/doc/video to uploads/ folder
 * - Uses tunnel URL to build public file URLs
 * - Sends to both target numbers via WhatsApp
 * - Polls delivery status after 15s
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const http = require('http');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const NUMBERS = ['+923354025901', '+923278896691'];
const MESSAGE = '🕌 Assalamu Alaikum! Please find the attached Umrah package materials from Baba Air Travels.';

// Read tunnel URL
const TUNNEL_URL_FILE = path.join(__dirname, '.tunnelurl');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

function getTunnelUrl() {
  if (fs.existsSync(TUNNEL_URL_FILE)) {
    const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf-8').trim();
    if (url.startsWith('https://')) return url;
  }
  return null;
}

async function verifyUrl(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return { ok: resp.ok, status: resp.status, ct: resp.headers.get('content-type') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const tunnelUrl = getTunnelUrl();
  if (!tunnelUrl) {
    console.error('❌ No tunnel URL found. Run cloudflared first.');
    process.exit(1);
  }
  console.log(`✅ Tunnel: ${tunnelUrl}\n`);

  // Ensure uploads dir exists
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

  // Copy test files into uploads directory with unique names
  const ts = Date.now();
  const filesToSend = [
    { src: path.join(__dirname, 'test_files', 'umrah_promo_flyer.png'),    dest: `${ts}-image.png`,   mime: 'image/png',     label: 'Image' },
    { src: path.join(__dirname, 'test_files', 'umrah_package_details.txt'),dest: `${ts}-doc.txt`,      mime: 'text/plain',    label: 'Document' },
    { src: path.join(__dirname, 'test_files', 'sample_video.mp4'),          dest: `${ts}-video.mp4`,   mime: 'video/mp4',     label: 'Video' },
  ];

  const mediaItems = [];
  for (const f of filesToSend) {
    if (!fs.existsSync(f.src)) { console.log(`⚠️  Skipping missing file: ${f.src}`); continue; }
    const destPath = path.join(UPLOADS_DIR, f.dest);
    fs.copyFileSync(f.src, destPath);
    const publicUrl = `${tunnelUrl}/uploads/${f.dest}`;
    
    // Verify the URL is accessible externally
    console.log(`Verifying ${f.label}: ${publicUrl}`);
    const check = await verifyUrl(publicUrl);
    if (check.ok) {
      console.log(`  ✅ Accessible (${check.status}) Content-Type: ${check.ct}`);
      mediaItems.push({ url: publicUrl, mime: f.mime, label: f.label });
    } else {
      console.log(`  ❌ NOT accessible: ${check.error || check.status}`);
    }
  }

  if (mediaItems.length === 0) {
    console.error('\n❌ No files are accessible via tunnel. Is the server running?');
    process.exit(1);
  }

  console.log(`\n📤 Sending ${mediaItems.length} file(s) to ${NUMBERS.length} numbers...\n`);

  const allSids = [];
  for (const num of NUMBERS) {
    const to = `whatsapp:${num}`;
    const numSids = [];
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
        numSids.push(msg.sid);
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
