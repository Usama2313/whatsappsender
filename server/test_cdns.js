/**
 * Test multiple CDN services to find one that returns raw file content
 * (not HTML) — which Twilio requires for media delivery
 */
const fs = require('fs');
const path = require('path');

const imagePath = path.join(__dirname, 'test_files', 'umrah_promo_flyer.png');
const imageBuffer = fs.readFileSync(imagePath);

async function testCdn(name, uploadFn) {
  console.log(`\n--- Testing: ${name} ---`);
  try {
    const url = await uploadFn();
    console.log(`Upload URL: ${url}`);

    const resp = await fetch(url, { redirect: 'follow' });
    const ct = resp.headers.get('content-type') || '';
    const cl = resp.headers.get('content-length') || 'unknown';
    const finalUrl = resp.url;
    const isHtml = ct.includes('text/html');

    console.log(`Status: ${resp.status}`);
    console.log(`Content-Type: ${ct}`);
    console.log(`Content-Length: ${cl}`);
    console.log(`Final URL: ${finalUrl}`);
    console.log(isHtml ? `❌ RETURNS HTML — Twilio will REJECT` : `✅ Returns binary — Twilio compatible`);

    return { name, url, ok: !isHtml && resp.status === 200 };
  } catch (e) {
    console.log(`❌ FAILED: ${e.message}`);
    return { name, url: null, ok: false };
  }
}

async function main() {
  const imgBlob = new Blob([imageBuffer], { type: 'image/png' });
  const results = [];

  // 1. file.io — single-use link, always returns raw file
  results.push(await testCdn('file.io', async () => {
    const fd = new FormData();
    fd.append('file', imgBlob, 'test.png');
    const r = await fetch('https://file.io', { method: 'POST', body: fd });
    const d = await r.json();
    return d.link;
  }));

  // 2. catbox.moe — permanent, returns raw binary
  results.push(await testCdn('catbox.moe', async () => {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('userhash', '');
    fd.append('fileToUpload', imgBlob, 'test.png');
    const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd });
    return (await r.text()).trim();
  }));

  // 3. uguu.se — temporary, returns raw binary
  results.push(await testCdn('uguu.se', async () => {
    const fd = new FormData();
    fd.append('files[]', imgBlob, 'test.png');
    const r = await fetch('https://uguu.se/upload.php', { method: 'POST', body: fd });
    const d = await r.json();
    return d.files?.[0]?.url;
  }));

  // 4. Transfer.sh — returns raw content at URL
  results.push(await testCdn('transfer.sh', async () => {
    const r = await fetch('https://transfer.sh/test.png', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: imageBuffer,
    });
    return (await r.text()).trim();
  }));

  console.log('\n\n========= SUMMARY =========');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}: ${r.url || 'FAILED'}`);
  }

  const winner = results.find(r => r.ok);
  if (winner) {
    console.log(`\n🏆 Best CDN: ${winner.name} — ${winner.url}`);
  } else {
    console.log('\n❌ No CDN returned raw binary — need alternative approach');
  }
}

main().catch(console.error);
