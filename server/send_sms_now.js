require('dotenv').config();
const fs = require('fs');
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function uploadToLitterbox(filePath, fileName, mimetype) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: mimetype });
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '72h');
  formData.append('fileToUpload', blob, fileName);

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`litterbox upload failed: ${response.status} ${response.statusText}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`litterbox returned invalid URL: ${url}`);
  return url;
}

async function run() {
  const numbers = ['+923354025902', '+97332377688'];
  
  const messageText = `Valued Customer,\n\nWe tried to send you the promotional files via WhatsApp but encountered an error. Please contact us to receive your media files!`;

  for (const num of numbers) {
    try {
      console.log(`Sending SMS to ${num}...`);
      const msg = await client.messages.create({
        body: messageText,
        from: process.env.TWILIO_SMS_NUMBER,
        to: num
      });
      console.log(`Successfully sent to ${num}. SID: ${msg.sid}`);
    } catch (e) {
      console.error(`Failed to send to ${num}:`, e.message);
    }
  }
}

run();
