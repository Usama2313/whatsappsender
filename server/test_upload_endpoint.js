const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testUpload() {
  const imagePath = path.join(__dirname, 'test_files', 'umrah_promo_flyer.png');
  if (!fs.existsSync(imagePath)) {
    console.error('Test file not found:', imagePath);
    return;
  }

  console.log('Sending upload request to http://localhost:5000/api/upload-template-image ...');
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));

  try {
    const res = await fetch('http://localhost:5000/api/upload-template-image', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    console.log('Response status:', res.status);
    const data = await res.json();
    console.log('Response body:', data);

    if (data.success && data.url) {
      console.log('✅ SUCCESS! Permanent Image URL:', data.url);
    } else {
      console.log('❌ Failed:', data);
    }
  } catch (err) {
    console.error('Upload test error:', err.message);
  }
}

testUpload();
