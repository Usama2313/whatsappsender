/**
 * Test script: Send WhatsApp messages with image, video, and document attachments
 * to +923354025901 and +923278896691
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'http://localhost:5001';
const NUMBERS = '+923354025901,+923278896691';
const MESSAGE = '🕌 Assalamu Alaikum! Here is our special Umrah package promotion from Baba Air Travels. Check the attached files for details!';

// Create a real tiny MP4 (download from public test assets — bbb_sunflower_1080p snippet)
async function ensureRealMp4(outputPath) {
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
    console.log(`Reusing existing MP4: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
    return;
  }
  // Tiny public domain MP4 sample (~500 KB) — always available
  const testUrls = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://www.w3schools.com/html/mov_bbb.mp4',
  ];
  for (const url of testUrls) {
    try {
      console.log(`Downloading test MP4 from ${url}...`);
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;
      const buf = await resp.arrayBuffer();
      if (buf.byteLength < 10000) continue; // too small = not a real video
      fs.writeFileSync(outputPath, Buffer.from(buf));
      console.log(`Downloaded real MP4: ${outputPath} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
      return;
    } catch (e) {
      console.log(`Failed to download from ${url}: ${e.message}`);
    }
  }
  throw new Error('Could not download a real MP4 test file');
}


async function sendWithFiles() {
  // Paths to test files
  const imagePath = path.join(__dirname, 'test_files', 'umrah_promo_flyer.png');
  const docPath = path.join(__dirname, 'test_files', 'umrah_package_details.txt');
  const videoPath = path.join(__dirname, 'test_files', 'sample_video.mp4');

  // Ensure we have a real MP4 file (download if needed)
  await ensureRealMp4(videoPath);

  // Check files exist
  const files = [
    { path: imagePath, name: 'umrah_promo_flyer.png', type: 'image/png' },
    { path: docPath, name: 'umrah_package_details.txt', type: 'text/plain' },
    { path: videoPath, name: 'sample_video.mp4', type: 'video/mp4' },
  ];

  for (const f of files) {
    if (!fs.existsSync(f.path)) {
      console.error(`❌ File not found: ${f.path}`);
      return;
    }
    console.log(`✅ Found: ${f.name} (${(fs.statSync(f.path).size / 1024).toFixed(1)} KB)`);
  }

  // Build multipart/form-data manually
  const boundary = '----FormBoundary' + Date.now();
  const parts = [];

  // Add text fields
  const textFields = {
    numbers: NUMBERS,
    message: MESSAGE,
    channel: 'whatsapp',
  };

  for (const [key, value] of Object.entries(textFields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  // Add file fields
  for (const f of files) {
    const fileData = fs.readFileSync(f.path);
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${f.name}"\r\n` +
      `Content-Type: ${f.type}\r\n\r\n`
    );
    parts.push(fileData);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(`--${boundary}--\r\n`);

  // Combine into single buffer
  const bodyParts = parts.map(p => (typeof p === 'string' ? Buffer.from(p) : p));
  const body = Buffer.concat(bodyParts);

  console.log(`\n📤 Sending ${files.length} files to ${NUMBERS}...`);
  console.log(`   Message: ${MESSAGE.substring(0, 60)}...`);
  console.log(`   Total body size: ${(body.length / 1024).toFixed(1)} KB\n`);

  // Send request
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/api/send-whatsapp`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('=== RESULTS ===');
          console.log(`Total: ${result.total} | Success: ${result.success} | Failed: ${result.failed}`);
          console.log('');
          for (const r of result.results) {
            const icon = r.success ? '✅' : '❌';
            const status = r.status ? r.status.toUpperCase() : 'N/A';
            const fileInfo = r.fileCount ? ` | ${r.fileCount} file(s) [${(r.fileTypes || []).join(', ')}]` : '';
            const errInfo = r.error ? ` | Error: ${r.error}` : '';
            console.log(`  ${icon} ${r.number} — ${status}${fileInfo}${errInfo}`);
            if (r.sids) console.log(`     SIDs: ${r.sids.join(', ')}`);
          }

          // Now poll statuses after 8 seconds
          if (result.results.some(r => r.success)) {
            console.log('\n⏳ Waiting 8 seconds then checking delivery status...');
            setTimeout(() => pollStatuses(result), 8000);
          }

          resolve(result);
        } catch (e) {
          console.error('Failed to parse response:', data);
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request failed:', err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

async function pollStatuses(initialResult) {
  const allSids = [];
  for (const r of initialResult.results) {
    if (r.sid) allSids.push(r.sid);
    if (r.sids) allSids.push(...r.sids);
  }

  if (allSids.length === 0) return;

  const url = `${API_BASE}/api/message-status?sids=${allSids.join(',')}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    console.log('\n=== DELIVERY STATUS (after 8s) ===');
    for (const s of data.statuses) {
      const icon = ['delivered', 'read'].includes(s.status) ? '✅' :
                   ['failed', 'undelivered'].includes(s.status) ? '❌' : '⏳';
      const errInfo = s.errorCode ? ` | Error ${s.errorCode}: ${s.errorMessage}` : '';
      console.log(`  ${icon} ${s.sid} — ${s.status.toUpperCase()}${errInfo}`);
    }

    const delivered = data.statuses.filter(s => ['delivered', 'read'].includes(s.status)).length;
    const failed = data.statuses.filter(s => ['failed', 'undelivered'].includes(s.status)).length;
    const pending = data.statuses.filter(s => !['delivered', 'read', 'failed', 'undelivered'].includes(s.status)).length;
    console.log(`\n📊 Summary: ${delivered} delivered, ${failed} failed, ${pending} pending out of ${allSids.length} messages`);
  } catch (e) {
    console.error('Failed to poll statuses:', e.message);
  }
}

sendWithFiles().catch(console.error);
