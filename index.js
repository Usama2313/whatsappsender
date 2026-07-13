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
    // If testing locally, use a service like ngrok and set PUBLIC_URL in .env
    const serverBaseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const mediaItems = uploadedFiles.map((f) => ({
      url: `${serverBaseUrl}/uploads/${f.filename}`,
      category: getFileCategory(f.mimetype),
      originalName: f.originalname,
    }));

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

// ─── Start Server ─────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ WhatsApp Sender Server running on http://localhost:${PORT}`);
    console.log(`   Twilio FROM: ${FROM_NUMBER}`);
  });
}

module.exports = app;
