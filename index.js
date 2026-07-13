require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const twilio = require('twilio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Twilio Client ──────────────────────────────────────────────────────────
let client;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (accountSid && authToken) {
  try {
    client = twilio(accountSid, authToken);
  } catch (e) {
    console.error('Failed to initialize Twilio client:', e);
  }
}

const FROM_NUMBER = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || ''}`;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── File Upload Setup ───────────────────────────────────────────────────────
const uploadsDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'uploads');
if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed MIME types for WhatsApp via Twilio
const ALLOWED_MIME_TYPES = {
  // Images
  'image/jpeg': true,
  'image/jpg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true,
  // Videos
  'video/mp4': true,
  'video/3gpp': true,
  'video/quicktime': true,
  'video/mpeg': true,
  // Documents / PDF
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.ms-excel': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'application/vnd.ms-powerpoint': true,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
  'text/plain': true,
  'application/zip': true,
};

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif|webp|mp4|3gp|mov|mpeg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB per file
  fileFilter: (req, file, cb) => {
    const extOk = ALLOWED_EXTENSIONS.test(path.extname(file.originalname));
    const mimeOk = ALLOWED_MIME_TYPES[file.mimetype];
    if (extOk || mimeOk) return cb(null, true);
    cb(new Error(`File type not supported: ${file.mimetype}`));
  },
});

// ─── Serve uploaded files publicly so Twilio can fetch them ─────────────────
app.use('/uploads', express.static(uploadsDir));

// ─── Helper: Upload to Vercel Blob (permanent public CDN urls for Twilio) ─────
async function uploadToVercelBlob(filePath, fileName, mimetype) {
  const { put } = require('@vercel/blob');
  const fileBuffer = fs.readFileSync(filePath);
  const { url } = await put(fileName, fileBuffer, {
    access: 'public',
    contentType: mimetype,
  });
  return url;
}

// ─── Helper: Upload to tmpfiles.org (fallback if Vercel Blob not configured) ──
async function uploadToTmpFiles(filePath, fileName, mimetype) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: mimetype });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  
  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error(`Failed to upload to tmpfiles.org: ${response.statusText}`);
  }
  
  const data = await response.json();
  const uploadUrl = data.data.url;
  return uploadUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

// ─── Helper: Upload media — tries Vercel Blob first, falls back to tmpfiles ───
async function uploadMedia(filePath, fileName, mimetype) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      console.log(`Uploading ${fileName} to Vercel Blob...`);
      return await uploadToVercelBlob(filePath, fileName, mimetype);
    } catch (e) {
      console.error('Vercel Blob upload failed, falling back to tmpfiles.org:', e.message);
    }
  }
  console.log(`Uploading ${fileName} to tmpfiles.org...`);
  return await uploadToTmpFiles(filePath, fileName, mimetype);
}

// ─── Helper: get file category ───────────────────────────────────────────────
function getFileCategory(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'document';
}

// ─── API: Send WhatsApp Messages ─────────────────────────────────────────────
app.post('/api/send-whatsapp', upload.array('files', 10), async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({
        error: 'Twilio client is not initialized. Please verify your Vercel Environment Variables (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN).'
      });
    }
    const { numbers, message, contentSid, contentVariables } = req.body;
    const uploadedFiles = req.files || [];

    // Parse and validate numbers
    if (!numbers) {
      return res.status(400).json({ error: 'Phone numbers are required' });
    }

    const numberList = numbers
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .slice(0, 250); // cap at 250

    if (numberList.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers provided' });
    }

    if (!contentSid && !message && uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'Provide a message, at least one file, or a template contentSid' });
    }

    // Parse template variables if sending in template mode
    let varsString = '';
    if (contentSid) {
      if (contentVariables) {
        try {
          const parsed = typeof contentVariables === 'string' ? JSON.parse(contentVariables) : contentVariables;
          varsString = JSON.stringify(parsed);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid contentVariables JSON format' });
        }
      }
    }

    // Build media URLs — Twilio needs publicly accessible URLs
    // We upload to tmpfiles.org so Twilio has a guaranteed public CDN link to download the media.
    const serverBaseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const mediaItems = await Promise.all(
      uploadedFiles.map(async (f) => {
        try {
          const publicUrl = await uploadMedia(f.path, f.originalname, f.mimetype);
          // Delete from local disk/temp immediately if upload succeeded to free space
          try { fs.unlinkSync(f.path); } catch (e) {}
          return {
            url: publicUrl,
            category: getFileCategory(f.mimetype),
            originalName: f.originalname,
          };
        } catch (uploadErr) {
          console.error(`Failed to upload ${f.originalname} to tmpfiles.org, using fallback:`, uploadErr);
          return {
            url: `${serverBaseUrl}/uploads/${f.filename}`,
            category: getFileCategory(f.mimetype),
            originalName: f.originalname,
          };
        }
      })
    );

    // Send to each number
    const results = await Promise.allSettled(
      numberList.map(async (rawNumber) => {
        // Ensure number has + prefix
        const toNumber = rawNumber.startsWith('+') ? rawNumber : `+${rawNumber}`;
        const toWhatsApp = `whatsapp:${toNumber}`;

        const messageOptions = {
          from: FROM_NUMBER,
          to: toWhatsApp,
        };

        if (contentSid) {
          messageOptions.contentSid = contentSid;
          if (varsString) {
            messageOptions.contentVariables = varsString;
          }
          const msg = await client.messages.create(messageOptions);
          return { number: toNumber, sid: msg.sid, status: 'sent' };
        } else {
          messageOptions.body = message || '';
          if (mediaItems.length === 0) {
            // Text-only message
            const msg = await client.messages.create(messageOptions);
            return { number: toNumber, sid: msg.sid, status: 'sent' };
          } else {
            // Send one message per media file
            // (Twilio WhatsApp supports 1 media per message)
            const sentSids = [];
            for (let i = 0; i < mediaItems.length; i++) {
              const opts = {
                ...messageOptions,
                mediaUrl: [mediaItems[i].url],
                // Only include text body with the first file
                body: i === 0 ? message || '' : '',
              };
              const msg = await client.messages.create(opts);
              sentSids.push(msg.sid);
            }
            return {
              number: toNumber,
              sids: sentSids,
              status: 'sent',
              fileCount: mediaItems.length,
              fileTypes: [...new Set(mediaItems.map((m) => m.category))],
            };
          }
        }
      })
    );

    // Format response
    const summary = results.map((r) => {
      if (r.status === 'fulfilled') {
        return { ...r.value, success: true };
      } else {
        return {
          success: false,
          error: r.reason?.message || 'Unknown error',
          number: 'unknown',
        };
      }
    });

    // Attach number to failed results (allSettled loses context)
    const enriched = summary.map((item, idx) => ({
      ...item,
      number: item.number === 'unknown' ? numberList[idx] : item.number,
    }));

    const successCount = enriched.filter((r) => r.success).length;
    const failCount = enriched.filter((r) => !r.success).length;

    res.json({
      total: enriched.length,
      success: successCount,
      failed: failCount,
      results: enriched,
    });
  } catch (err) {
    console.error('Error sending messages:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check & Welcome ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Bulk Sender API is running.',
    healthCheck: '/api/health',
    status: 'online'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    fromNumber: FROM_NUMBER,
    twilioInitialized: !!client
  });
});

app.get('/api/test-upload', async (req, res) => {
  try {
    const tempPath = path.join('/tmp', 'test_dummy.txt');
    fs.writeFileSync(tempPath, 'Hello from Vercel Serverless Upload Test!');
    
    console.log('Running test upload to tmpfiles.org...');
    const url = await uploadToTmpFiles(tempPath, 'test_dummy.txt', 'text/plain');
    
    try { fs.unlinkSync(tempPath); } catch (e) {}
    
    res.json({
      success: true,
      url: url
    });
  } catch (err) {
    console.error('Test upload failed:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ WhatsApp Sender Server running on http://localhost:${PORT}`);
    console.log(`   Twilio FROM: ${FROM_NUMBER}`);
  });
}

module.exports = app;
