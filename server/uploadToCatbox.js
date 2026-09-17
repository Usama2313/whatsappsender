const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch'); // we need to ensure node-fetch is installed or use axios/undici

async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));

  try {
    const response = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: form
    });
    
    if (!response.ok) {
      throw new Error(`Catbox upload failed with status: ${response.status}`);
    }
    
    const url = await response.text();
    return url.trim();
  } catch (error) {
    console.error('Catbox upload error:', error);
    throw error;
  }
}

module.exports = uploadToCatbox;
