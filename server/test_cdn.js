/**
 * Test: Upload a file to tmpfiles.org and check if the URL is accessible by Twilio
 * Also verify what HTTPS URL is returned
 */
const fs = require('fs');
const path = require('path');

async function testCdnUpload() {
  console.log('=== Testing CDN Upload and URL Accessibility ===\n');

  // Test 1: Upload text file to tmpfiles.org
  const blob = new Blob(['Hello, this is a test document for Twilio media delivery testing.'], { type: 'text/plain' });
  const fd = new FormData();
  fd.append('file', blob, 'test_doc.txt');

  console.log('1. Uploading text file to tmpfiles.org...');
  const uploadResp = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
  const uploadData = await uploadResp.json();
  const rawUrl = uploadData.data.url;
  const dlUrl = rawUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  console.log('   Raw URL:', rawUrl);
  console.log('   DL URL:', dlUrl);

  // Test 2: Verify the URL is actually accessible (status, content-type, redirect chain)
  console.log('\n2. Checking accessibility of DL URL...');
  const fetchResp = await fetch(dlUrl, { redirect: 'follow' });
  console.log('   Status:', fetchResp.status);
  console.log('   Final URL:', fetchResp.url);
  console.log('   Content-Type:', fetchResp.headers.get('content-type'));
  console.log('   Content-Length:', fetchResp.headers.get('content-length'));
  const body = await fetchResp.text();
  console.log('   Body preview:', body.substring(0, 80));

  // Test 3: Check if URL starts with https://
  if (!dlUrl.startsWith('https://')) {
    console.log('\n❌ URL does not start with https:// — Twilio will REJECT it!');
    console.log('   Fix: prepend https:// to the URL');
  } else {
    console.log('\n✅ URL starts with https://');
  }

  // Test 4: Upload actual PNG image and verify
  console.log('\n3. Uploading actual PNG image...');
  const imgPath = path.join(__dirname, 'test_files', 'umrah_promo_flyer.png');
  if (fs.existsSync(imgPath)) {
    const imgBuffer = fs.readFileSync(imgPath);
    const imgBlob = new Blob([imgBuffer], { type: 'image/png' });
    const imgFd = new FormData();
    imgFd.append('file', imgBlob, 'umrah_promo_flyer.png');
    const imgUpload = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: imgFd });
    const imgData = await imgUpload.json();
    const imgDlUrl = imgData.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    console.log('   Image DL URL:', imgDlUrl);

    // Verify image URL
    const imgCheck = await fetch(imgDlUrl, { redirect: 'follow' });
    console.log('   Image status:', imgCheck.status);
    console.log('   Image Content-Type:', imgCheck.headers.get('content-type'));
    console.log('   Image Content-Length:', imgCheck.headers.get('content-length'));
    console.log('   Image Final URL:', imgCheck.url);

    if (imgCheck.status === 200) {
      console.log('\n✅ Image URL is accessible — Twilio should be able to download it');
      console.log('   Try sending this URL manually: ', imgDlUrl);
    } else {
      console.log('\n❌ Image URL returned non-200. Twilio will fail with 63019.');
    }
  } else {
    console.log('   Image not found at', imgPath);
  }
}

testCdnUpload().catch(console.error);
