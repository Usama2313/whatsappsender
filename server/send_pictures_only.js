/**
 * Send pictures only (session window already open — no template).
 * Uploads local images to Catbox, then sends via WhatsApp to each number.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const { Blob } = require('buffer');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
const NUMBERS = ['+923354025901', '+97332377688'];

// Pictures from your computer (project test_files folder)
const PICTURE_PATHS = [
  path.join(__dirname, 'test_files', 'umrah_promo_flyer.png'),
];

const CAPTION =
  '🕌 Assalamu Alaikum! Please find the attached Umrah package picture from Baba Air Travels.';

async function uploadToLitterbox(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.webp' ? 'image/webp' :
    'application/octet-stream';
  const blob = new Blob([fileBuffer], { type: mime });
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '72h');
  formData.append('fileToUpload', blob, fileName);

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error(`litterbox upload failed: ${response.status}`);
  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`litterbox returned invalid URL: ${url}`);
  return url;
}

async function main() {
  const pictures = PICTURE_PATHS.filter((p) => {
    if (!fs.existsSync(p)) {
      console.log(`⚠️  Skipping missing file: ${p}`);
      return false;
    }
    return true;
  });

  if (pictures.length === 0) {
    console.error('❌ No picture files found. Add paths in PICTURE_PATHS.');
    process.exit(1);
  }

  console.log(`📤 Uploading ${pictures.length} picture(s) to litterbox...\n`);
  const mediaItems = [];
  for (const src of pictures) {
    const name = path.basename(src);
    try {
      const publicUrl = await uploadToLitterbox(src, name);
      console.log(`  ✅ ${name} → ${publicUrl}`);
      mediaItems.push({ url: publicUrl, name });
    } catch (e) {
      console.log(`  ❌ Failed to upload ${name}: ${e.message}`);
    }
  }

  if (mediaItems.length === 0) {
    console.error('\n❌ No pictures uploaded successfully.');
    process.exit(1);
  }

  console.log(`\n📤 Sending ${mediaItems.length} picture(s) to ${NUMBERS.length} numbers (media only, no template)...\n`);

  const allSids = [];
  for (const num of NUMBERS) {
    const to = `whatsapp:${num}`;
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      try {
        const msg = await client.messages.create({
          from: FROM,
          to,
          body: i === 0 ? CAPTION : '',
          mediaUrl: [item.url],
        });
        console.log(`  ✅ ${num} | ${item.name} → SID: ${msg.sid} [${msg.status}]`);
        allSids.push({ num, sid: msg.sid, name: item.name });
      } catch (e) {
        console.log(`  ❌ ${num} | ${item.name} → FAILED: ${e.message}`);
      }
    }
  }

  if (allSids.length === 0) {
    console.log('\n❌ No messages sent.');
    return;
  }

  console.log('\n⏳ Waiting 20 seconds for delivery status...');
  await new Promise((r) => setTimeout(r, 20000));

  console.log('\n=== DELIVERY STATUS ===');
  let delivered = 0;
  let failed = 0;
  let pending = 0;
  for (const { num, sid, name } of allSids) {
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
      `${icon} ${num} | ${name} | ${msg.status} | SID: ${sid} | Error: ${msg.errorCode || 'none'}${msg.errorMessage ? ' - ' + msg.errorMessage : ''}`
    );
  }

  console.log(`\n📊 ${delivered} delivered | ${failed} failed | ${pending} pending (out of ${allSids.length})`);
}

main().catch(console.error);
