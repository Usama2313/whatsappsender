const path = require('path');
const fs = require('fs');

// ─── Multi-location .env loader ─────────────────────────────────────────────
const envCandidates = [
  path.join(process.env.USER_DATA_PATH || '', '.env'),
  path.join(process.resourcesPath || '', 'server', '.env'),
  path.join(process.resourcesPath || '', 'resources', 'server', '.env'),
  path.join(process.resourcesPath || '', '.env'),
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'server', '.env'),
];
for (const envPath of envCandidates) {
  try {
    if (envPath && fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
    }
  } catch (_) {}
}

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const twilio = require('twilio');
const db = require('./db');
const fetch = require('node-fetch');
const {
  getStorageConfig,
  setStoredSetting,
  verifyPermanentImageUrl,
  uploadPermanentMedia,
  testStorageProvider,
  isExpiringOrPlaceholderUrl,
  rehostUrlIfExpiring
} = require('./cloudStorage');

// ─── Global Error Handlers to prevent undici/socket crashes ───────────────
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

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

const FROM_WHATSAPP = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || ''}`;
const FROM_SMS = process.env.TWILIO_SMS_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER || '';

// ─── Auto-detect Cloudflare Tunnel URL ─────────────────────────────────────
const TUNNEL_URL_FILE = path.join(__dirname, '.tunnelurl');
function getTunnelUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  try {
    if (fs.existsSync(TUNNEL_URL_FILE)) {
      const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf-8').trim();
      if (url.startsWith('https://')) return url;
    }
  } catch (_) {}
  return null;
}


// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// ─── File Upload Setup ───────────────────────────────────────────────────────
const userDataPath = process.env.USER_DATA_PATH || __dirname;
const uploadsDir = process.env.VERCEL ? '/tmp' : path.join(userDataPath, 'uploads');
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
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedOriginal}`);
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

// ─── Helper: Upload to uguu.se (fast, globally reachable, 48h expiry) ─────────
async function uploadToUguu(filePath, fileName, mimetype) {
  const FormDataPkg = require('form-data');
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormDataPkg();
  form.append('files[]', fileBuffer, { filename: fileName, contentType: mimetype });

  const response = await fetch('https://uguu.se/upload', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`uguu.se upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success || !data.files || !data.files[0]?.url) {
    throw new Error(`uguu.se returned unexpected response: ${JSON.stringify(data)}`);
  }

  const url = data.files[0].url;
  console.log(`  uguu.se URL: ${url}`);
  return url;
}

// ─── Helper: Upload to Telegra.ph (PERMANENT — Telegram's CDN, highly reliable) ─
async function uploadToTelegraph(filePath, fileName, mimetype) {
  const FormDataPkg = require('form-data');
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormDataPkg();
  form.append('file', fileBuffer, { filename: fileName, contentType: mimetype });

  const response = await fetch('https://telegra.ph/upload', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Telegraph upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(`Telegraph error: ${data.error}`);
  if (!Array.isArray(data) || !data[0]?.src) throw new Error(`Telegraph returned unexpected response: ${JSON.stringify(data)}`);
  
  const url = `https://telegra.ph${data[0].src}`;
  console.log(`  Telegraph URL: ${url}`);
  return url;
}

// ─── Helper: Verify that a URL returns real image/* content-type, not text/html ─
async function verifyImageContentType(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', timeout: 5000 });
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype.startsWith('image/')) return { ok: true, ctype };
    if (!res.ok) {
      const getRes = await fetch(url, { headers: { Range: 'bytes=0-100' }, timeout: 5000 });
      const getCtype = (getRes.headers.get('content-type') || '').toLowerCase();
      if (getCtype.startsWith('image/')) return { ok: true, ctype: getCtype };
      return { ok: false, ctype: getCtype };
    }
    return { ok: false, ctype };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Helper: Upload to catbox.moe (PERMANENT — required for template approval) ─
async function uploadToCatbox(filePath, fileName, mimetype) {
  const FormDataPkg = require('form-data');
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormDataPkg();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fileBuffer, { filename: fileName, contentType: mimetype });

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 25000,
  });

  if (!response.ok) {
    throw new Error(`catbox upload failed: ${response.status} ${response.statusText}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`catbox returned invalid URL: ${url}`);
  console.log(`  catbox URL: ${url}`);
  return url;
}

// ─── Helper: Upload to litterbox.catbox.moe (72h, Twilio-compatible) ──────────
async function uploadToLitterbox(filePath, fileName, mimetype) {
  const FormDataPkg = require('form-data');
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormDataPkg();
  form.append('reqtype', 'fileupload');
  form.append('time', '72h');
  form.append('fileToUpload', fileBuffer, { filename: fileName, contentType: mimetype });

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 20000,
  });

  if (!response.ok) {
    throw new Error(`litterbox upload failed: ${response.status} ${response.statusText}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) throw new Error(`litterbox returned invalid URL: ${url}`);
  console.log(`  litterbox URL: ${url}`);
  return url;
}

// ─── Helper: Upload to 0x0.st (serves raw files directly — Twilio compatible) ─
async function uploadTo0x0(filePath, fileName, mimetype) {
  const FormDataPkg = require('form-data');
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormDataPkg();
  form.append('file', fileBuffer, { filename: fileName, contentType: mimetype });

  const response = await fetch('https://0x0.st', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 20000,
  });

  if (!response.ok) {
    throw new Error(`0x0.st upload failed: ${response.status} ${response.statusText}`);
  }

  const url = (await response.text()).trim();
  console.log(`  0x0.st URL: ${url}`);
  return url;
}

// ─── Helper: Upload media — tries CDNs until one works ────────────────────────
async function uploadMedia(filePath, fileName, mimetype, forTemplate = false) {
  const errors = [];

  // When uploading for templates or permanent flyers, route through the cloudStorage engine
  // which uses Cloudinary, Firebase, ImgBB, Supabase, Vercel Blob, etc.
  if (forTemplate) {
    try {
      console.log(`[upload] Using permanent cloudStorage engine for template media: ${fileName}...`);
      const permanentUrl = await uploadPermanentMedia(filePath, fileName, mimetype);
      return permanentUrl;
    } catch (err) {
      console.error('[upload] cloudStorage engine failed, falling back to legacy CDNs:', err.message);
      errors.push(`cloudStorage: ${err.message}`);
    }
  }

  // 1. Try Vercel Blob (if token set — permanent, fast CDN, always accessible)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      console.log(`[upload] Trying Vercel Blob for ${fileName}...`);
      return await uploadToVercelBlob(filePath, fileName, mimetype);
    } catch (e) {
      console.error('[upload] Vercel Blob failed:', e.message);
      errors.push(`Vercel Blob: ${e.message}`);
    }
  }

  // 2. Try catbox.moe (PERMANENT — best for WhatsApp templates)
  try {
    console.log(`[upload] Trying catbox.moe for ${fileName}...`);
    const u = await uploadToCatbox(filePath, fileName, mimetype);
    const check = await verifyImageContentType(u);
    if (check.ok || !check.ctype) return u;
    console.warn(`[upload] catbox.moe returned non-image content-type: ${check.ctype}`);
  } catch (e) {
    console.error('[upload] catbox.moe failed:', e.message);
    errors.push(`catbox: ${e.message}`);
  }

  // 3. Try Telegra.ph (permanent)
  try {
    console.log(`[upload] Trying Telegra.ph for ${fileName}...`);
    return await uploadToTelegraph(filePath, fileName, mimetype);
  } catch (e) {
    console.error('[upload] Telegraph failed:', e.message);
    errors.push(`Telegraph: ${e.message}`);
  }

  // 4. Try 0x0.st (permanent/long-term raw file host)
  try {
    console.log(`[upload] Trying 0x0.st for ${fileName}...`);
    return await uploadTo0x0(filePath, fileName, mimetype);
  } catch (e) {
    console.error('[upload] 0x0.st failed:', e.message);
    errors.push(`0x0.st: ${e.message}`);
  }

  // 5. For ad-hoc direct messages only (NOT templates): try uguu.se (48h) or litterbox (72h)
  if (!forTemplate) {
    try {
      console.log(`[upload] Trying uguu.se for non-template ${fileName}...`);
      const u = await uploadToUguu(filePath, fileName, mimetype);
      const check = await verifyImageContentType(u);
      if (check.ok || !check.ctype) return u;
    } catch (e) {
      console.error('[upload] uguu.se failed:', e.message);
      errors.push(`uguu: ${e.message}`);
    }

    try {
      console.log(`[upload] Trying litterbox for non-template ${fileName}...`);
      return await uploadToLitterbox(filePath, fileName, mimetype);
    } catch (e) {
      console.error('[upload] litterbox failed:', e.message);
      errors.push(`litterbox: ${e.message}`);
    }
  }

  // 6. Last resort: Serve image from THIS server publicly via PUBLIC_URL if set
  if (process.env.PUBLIC_URL) {
    const publicFileUrl = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/uploads/${path.basename(filePath)}`;
    console.log(`[upload] All CDNs failed. Serving via own server: ${publicFileUrl}`);
    return publicFileUrl;
  }

  throw new Error(`All permanent CDN uploads failed for ${fileName}: ${errors.join('; ')}`);
}


// ─── Helper: get file category ───────────────────────────────────────────────
function getFileCategory(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'document';
}


// ─── API: Send Messages (WhatsApp or SMS) ───────────────────────────────────
app.post('/api/send-whatsapp', upload.array('files', 10), async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({
        error: 'Twilio client is not initialized. Please verify your Vercel Environment Variables (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN).'
      });
    }
    const { numbers, message, contentSid, contentVariables, templateBody, templateMediaUrl, channel } = req.body;
    const isSms = channel === 'sms';
    const uploadedFiles = req.files || [];

    // Parse and validate numbers
    if (!numbers) {
      return res.status(400).json({ error: 'Phone numbers are required' });
    }

    const numberList = numbers
      .split(',')
      .map((n) => {
        let cleaned = n.trim().replace(/[^\d+]/g, '');
        if (cleaned && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
        return cleaned;
      })
      .filter((n) => n.length > 5)
      .slice(0, 250); // cap at 250

    if (numberList.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers provided' });
    }

    if (!contentSid && !message && uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'Provide a message, at least one file, or a template contentSid' });
    }

    // ─── Guard: block sending templates with known placeholder images ─────────
    // This prevents accidentally broadcasting the Twilio demo owl image to all recipients.
    if (contentSid && templateMediaUrl) {
      const PLACEHOLDER_DOMAINS = ['demo.twilio.com', 'owl.png'];
      const isPlaceholder = PLACEHOLDER_DOMAINS.some(d => templateMediaUrl.includes(d));
      if (isPlaceholder) {
        return res.status(400).json({
          error: `This template was created with a placeholder image (${templateMediaUrl}). Sending is blocked to prevent delivering the wrong image to your recipients. Please recreate the template with your actual image in the "Create Template" tab.`
        });
      }
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

    // Build media URLs — Twilio needs publicly accessible HTTPS URLs.
    // Priority: 1) Cloudflare Tunnel (if running), 2) Vercel Blob, 3) litterbox CDN
    const tunnelBaseUrl = getTunnelUrl();
    const serverBaseUrl = tunnelBaseUrl || `${req.protocol}://${req.get('host')}`;
    if (tunnelBaseUrl) {
      console.log(`[media] Using Cloudflare Tunnel URL: ${tunnelBaseUrl}`);
    }

    const mediaItems = await Promise.all(
      uploadedFiles.map(async (f) => {
        const safeFilename = encodeURIComponent(f.filename);
        // Always try CDN upload first, because localtunnel often blocks Twilio with interstitial warning pages
        try {
          const publicUrl = await uploadMedia(f.path, f.originalname, f.mimetype);
          try { fs.unlinkSync(f.path); } catch (e) {}
          return {
            url: publicUrl,
            category: getFileCategory(f.mimetype),
            originalName: f.originalname,
          };
        } catch (uploadErr) {
          console.error(`Failed to upload ${f.originalname} to CDN, using server fallback:`, uploadErr);
          const url = tunnelBaseUrl 
            ? `${tunnelBaseUrl}/uploads/${safeFilename}` 
            : `${serverBaseUrl}/uploads/${safeFilename}`;
          return {
            url,
            category: getFileCategory(f.mimetype),
            originalName: f.originalname,
          };
        }
      })
    );

    // Send to each number
    const getTwilioErrorMeaning = (code) => {
      if (code === 63019) return 'Delivery Failed: Expired Template Media URL or Meta Delivery Restriction. Try sending an approved Text template (e.g. test_template_1, agent_test_template).';
      if (code === 63024 || code === 63049) return 'Outside 24h Session Window or Parameter Mismatch. Please verify template variables match {{1}} format.';
      if (code === 63032) return 'Template Variable Mismatch. Check template {{1}} variable text format.';
      if (code === 63007) return 'Number not opted in or invalid WhatsApp user';
      if (code === 21614) return 'To number is not a valid mobile or WhatsApp number';
      return null;
    };

    const enriched = await Promise.all(
      numberList.map(async (rawNumber) => {
        try {
          const messageOptions = {
            from: isSms ? FROM_SMS : FROM_WHATSAPP,
            to: isSms ? rawNumber : `whatsapp:${rawNumber}`,
          };

          const sentSids = [];

          if (contentSid) {
            messageOptions.contentSid = contentSid;
            // Only attach contentVariables if not empty
            if (varsString && varsString !== '{}') {
              messageOptions.contentVariables = varsString;
            }
            const msg = await client.messages.create(messageOptions);
            sentSids.push(msg.sid);
          } else if (isSms && mediaItems.length > 0) {
            // Send proper MMS by providing native mediaUrl
            messageOptions.body = message || '';
            messageOptions.mediaUrl = mediaItems.map(item => item.url);
            
            const msg = await client.messages.create(messageOptions);
            sentSids.push(msg.sid);
          } else if (mediaItems.length > 0) {
            for (let i = 0; i < mediaItems.length; i++) {
              const opts = {
                from: FROM_WHATSAPP,
                to: `whatsapp:${rawNumber}`,
                mediaUrl: [mediaItems[i].url],
                body: i === 0 && message ? message : '',
              };
              const msg = await client.messages.create(opts);
              sentSids.push(msg.sid);
            }
          } else if (message) {
            messageOptions.body = message;
            const msg = await client.messages.create(messageOptions);
            sentSids.push(msg.sid);
          }

          if (sentSids.length > 0) {
            try {
              insertMessage.run({
                id: sentSids[0],
                from: isSms ? FROM_SMS : FROM_WHATSAPP,
                to: rawNumber,
                body: message || (contentSid ? `[Template: ${contentSid}]` : (mediaItems.length > 0 ? '[Media Attachment]' : '')),
                timestamp: new Date().toISOString(),
                media: JSON.stringify(mediaItems.map(m => m.url)),
                channel: isSms ? 'sms' : 'whatsapp',
                isOutgoing: 1
              });
            } catch (_) {}
          }

          return {
            success: true,
            number: rawNumber,
            sids: sentSids,
            sid: sentSids[0],
            status: 'sent',
            fileCount: mediaItems.length,
            fileTypes: [...new Set(mediaItems.map((m) => m.category))],
          };
        } catch (err) {
          console.error(`Failed to send to ${rawNumber}:`, err);
          const explanation = getTwilioErrorMeaning(err.code) || err.message;
          return {
            success: false,
            number: rawNumber,
            error: explanation,
          };
        }
      })
    );

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

// ─── API: Get WhatsApp Message Statuses ──────────────────────────────────────
app.get('/api/message-status', async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({ error: 'Twilio client is not initialized.' });
    }
    const { sids } = req.query;
    if (!sids) {
      return res.status(400).json({ error: 'sids parameter is required' });
    }
    const sidList = sids.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const getTwilioErrorMeaning = (code) => {
      if (code === 63024 || code === 63049) return 'Outside 24h Session Window. Standard Messages cannot be sent to recipients outside 24h. Please select an Approved WhatsApp Template (e.g. Umrah Final Test) in the SSID dropdown selector.';
      if (code === 63032) return 'Template Variable Mismatch. Check template {{1}} variable text format.';
      if (code === 63007) return 'Number not opted in or invalid WhatsApp user';
      if (code === 21614) return 'To number is not a valid mobile or WhatsApp number';
      return null;
    };

    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');

    const statuses = await Promise.all(
      sidList.map(async (sid) => {
        const cleanSid = sid.trim();
        try {
          // HX SIDs are Content Template SIDs — look up via Content API
          if (cleanSid.startsWith('HX')) {
            const r = await fetch(`https://content.twilio.com/v1/Content/${cleanSid}/ApprovalRequests`, {
              headers: { 'Authorization': `Basic ${auth}` }
            });
            if (!r.ok) throw new Error(`Content API returned ${r.status}`);
            const d = await r.json();
            const w = d.whatsapp || {};
            return {
              sid: cleanSid,
              status: w.status || 'unknown',
              type: 'template',
              templateName: w.name || cleanSid,
              errorMessage: w.rejection_reason || null,
            };
          }
          // SM / MM SIDs are standard message SIDs
          const msg = await client.messages(cleanSid).fetch();
          const errorMeaning = getTwilioErrorMeaning(msg.errorCode);
          return {
            sid: cleanSid,
            status: msg.status,
            type: 'message',
            errorCode: msg.errorCode,
            errorMessage: errorMeaning ? `${msg.errorMessage || 'Error'} — ${errorMeaning}` : msg.errorMessage,
            to: msg.to,
            from: msg.from,
            dateSent: msg.dateSent,
          };
        } catch (e) {
          return {
            sid: cleanSid,
            status: 'error',
            type: cleanSid.startsWith('HX') ? 'template' : 'message',
            errorMessage: e.message,
          };
        }
      })
    );
    res.json({ statuses });
  } catch (err) {
    console.error('Error fetching message statuses:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Get WhatsApp Content Templates ──────────────────────────────────────
app.get('/api/templates', async (req, res) => {
  try {
    if (!client) {
      return res.json({ templates: [] });
    }

    try {
      const contents = await client.content.v1.contents.list({ limit: 100 });
      const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
      
      const enriched = await Promise.all(
        contents.map(async (c) => {
          try {
            const r = await fetch(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`, {
              headers: { 'Authorization': `Basic ${auth}` }
            });
            const d = await r.json();
            const w = d.whatsapp || {};
            const status = w.status || 'unsubmitted';
            const name = w.name || c.friendlyName || c.sid;
            const contentType = w.content_type || (c.types && c.types['twilio/text'] ? 'twilio/text' : 'twilio/media');
            const typeLabel = contentType.includes('text') ? 'Text Only' : 'Media Header';
            const statusIcon = status === 'approved' ? '✅' : status === 'pending' || status === 'submitted' ? '⏳' : '❌';

            let body = '';
            let mediaUrl = null;
            if (c.types) {
              for (const [typeKey, typeValue] of Object.entries(c.types)) {
                if (typeValue) {
                  if (typeValue.body && !body) body = typeValue.body;
                  if (typeValue.media && typeValue.media.length > 0 && !mediaUrl) {
                    mediaUrl = typeValue.media[0];
                  }
                }
              }
            }

            // Extract variable keys e.g. {{1}}, {{2}} or {{name}}
            const varMatches = [...body.matchAll(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]);
            const variables = [...new Set(varMatches)];

            // Check if media URL is on a known TEMPORARY host that expires or placeholder
            const isPlaceholderImage = mediaUrl && (mediaUrl.includes('demo.twilio.com') || mediaUrl.includes('owl.png'));
            const hasExpiredMedia = mediaUrl && !isPlaceholderImage && isExpiringOrPlaceholderUrl(mediaUrl);

            let customLabel = '';
            if (status === 'approved') {
              if (isPlaceholderImage) {
                customLabel = `⚠️ ${name} (APPROVED - Wrong Placeholder Image)`;
              } else if (hasExpiredMedia) {
                customLabel = `⚠️ ${name} (APPROVED - Expired Media URL)`;
              } else if (contentType.includes('text')) {
                customLabel = `✅ ${name} (APPROVED - Text Ready)`;
              } else {
                customLabel = `🖼️ ${name} (APPROVED - Media Header)`;
              }
            } else if (status === 'pending' || status === 'submitted') {
              customLabel = `⏳ ${name} (PENDING REVIEW - ${typeLabel})`;
            } else {
              customLabel = `❌ ${name} (REJECTED - ${typeLabel})`;
            }

            return {
              sid: c.sid,
              name,
              status,
              type: contentType,
              body,
              mediaUrl,
              variables,
              hasExpiredMedia,
              isPlaceholderImage: isPlaceholderImage || false,
              rejectionReason: w.rejection_reason || null,
              label: customLabel
            };
          } catch (e) {
            return {
              sid: c.sid,
              name: c.friendlyName || c.sid,
              status: 'unknown',
              type: 'twilio/text',
              body: '',
              mediaUrl: null,
              variables: [],
              label: c.sid
            };
          }
        })
      );

      // Sort approved templates first
      enriched.sort((a, b) => {
        if (a.status === 'approved' && b.status !== 'approved') return -1;
        if (a.status !== 'approved' && b.status === 'approved') return 1;
        return 0;
      });

      res.json({ templates: enriched });
    } catch (e) {
      console.error('Failed to list Twilio templates:', e);
      res.status(500).json({ error: e.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Batch Template Status Check (by comma-sep SIDs) ───────────────────
app.get('/api/template-statuses', async (req, res) => {
  try {
    if (!client) return res.status(500).json({ error: 'Twilio client not initialized.' });
    const { sids } = req.query;
    if (!sids) return res.status(400).json({ error: 'sids query param required' });
    const sidList = sids.split(',').map(s => s.trim()).filter(Boolean);
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    const results = await Promise.all(
      sidList.map(async (sid) => {
        try {
          const r = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
            headers: { 'Authorization': `Basic ${auth}` }
          });
          const d = await r.json();
          const w = d.whatsapp || {};
          return { sid, status: w.status || 'unknown', name: w.name, rejectionReason: w.rejection_reason || null };
        } catch (e) {
          return { sid, status: 'error', rejectionReason: e.message };
        }
      })
    );
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Check WhatsApp Template Status ──────────────────────────────────────
app.get('/api/template-status/:sid', async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({ error: 'Twilio client is not initialized.' });
    }
    const { sid } = req.params;
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    const response = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch approval status');
    }
    const data = await response.json();
    const w = data.whatsapp || {};
    res.json({
      status: w.status || 'unknown',
      rejectionReason: w.rejection_reason || ''
    });
  } catch (err) {
    console.error('Error fetching template status:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Create & Submit New WhatsApp Content Template ───────────────────────
app.post('/api/create-template', upload.array('files', 5), async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({ error: 'Twilio client is not initialized.' });
    }

    const { name, category, headerType, bodyText, headerMediaUrl: preSuppliedMediaUrl } = req.body;
    const uploadedFiles = req.files || [];

    if (!name || !bodyText) {
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(400).json({ error: 'Template name and body text are required.' });
    }

    // Sanitize template name for WhatsApp (lowercase, underscores only)
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50);
    const cat = category || 'MARKETING';
    const isMedia = headerType === 'media';

    // ─── Strict permanent image URL resolution for media templates ──────────
    let headerMediaUrl = null;

    if (isMedia) {
      if (uploadedFiles.length > 0) {
        // Direct file was submitted in the form
        const mainFile = uploadedFiles[0];
        console.log(`[template] Uploading attached file ${mainFile.originalname} to permanent cloud storage...`);
        try {
          headerMediaUrl = await uploadPermanentMedia(mainFile.path, mainFile.originalname, mainFile.mimetype);
        } catch (uploadErr) {
          uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
          return res.status(500).json({ error: `Failed to upload image to permanent cloud storage: ${uploadErr.message}` });
        }
      } else if (preSuppliedMediaUrl && preSuppliedMediaUrl.trim().startsWith('http')) {
        let rawUrl = preSuppliedMediaUrl.trim();
        // Check if URL is from an expiring host (e.g. uguu.se, tmpfiles.org) and auto-rehost permanently
        if (isExpiringOrPlaceholderUrl(rawUrl)) {
          console.log(`[template] Rehosting expiring/placeholder URL ${rawUrl}...`);
          try {
            headerMediaUrl = await rehostUrlIfExpiring(rawUrl);
          } catch (rehostErr) {
            uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
            return res.status(400).json({
              error: `The image URL is hosted on an expiring service and could not be rehosted: ${rehostErr.message}. Please upload your image directly.`
            });
          }
        } else {
          headerMediaUrl = rawUrl;
        }
      } else {
        uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
        return res.status(400).json({
          error: 'A permanent image is required for media templates. Please upload your image file in the form.'
        });
      }

      // Clean up uploaded files after processing
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });

      // Pre-flight check: verify the URL serves direct image bytes
      const check = await verifyPermanentImageUrl(headerMediaUrl);
      if (!check.ok) {
        return res.status(400).json({
          error: `Image verification failed: ${check.error || 'The image URL is not directly accessible or returns invalid content type.'}`
        });
      }

      console.log(`[template] ✅ Verified permanent image URL (${check.contentType || 'image'}): ${headerMediaUrl}`);
    } else {
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    }

    console.log(`[template] Creating new template "${sanitizedName}" (${cat}, ${headerType}, Image: ${headerMediaUrl})...`);

    const typesObj = {};
    if (isMedia) {
      typesObj['twilio/media'] = {
        body: bodyText,
        media: [headerMediaUrl]
      };
    } else {
      typesObj['twilio/text'] = {
        body: bodyText
      };
    }

    // Extract dynamic variables from body text (e.g. {{1}}, {{2}})
    const varMatches = [...bodyText.matchAll(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]);
    const uniqueVars = [...new Set(varMatches)];
    const variablesObj = {};
    if (uniqueVars.length > 0) {
      uniqueVars.forEach((v, idx) => {
        variablesObj[v] = `Sample Value ${idx + 1}`;
      });
    }

    // 1. Create content template in Twilio
    const contentParams = {
      friendlyName: sanitizedName,
      language: 'en',
      types: typesObj
    };
    if (Object.keys(variablesObj).length > 0) {
      contentParams.variables = variablesObj;
    }

    const content = await client.content.v1.contents.create(contentParams);
    console.log(`[template] Created Content SID: ${content.sid}`);

    // 2. Submit to WhatsApp for approval
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    const approvalRes = await fetch(
      `https://content.twilio.com/v1/Content/${content.sid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category: cat,
          name: sanitizedName
        })
      }
    );

    const approvalData = await approvalRes.json();
    console.log(`[template] Approval response for ${content.sid}:`, approvalData);

    const whatsappStatus = approvalData.whatsapp?.status || approvalData.status || 'submitted';

    res.json({
      success: true,
      sid: content.sid,
      name: sanitizedName,
      status: whatsappStatus,
      mediaUrl: isMedia ? headerMediaUrl : null,
      variables: uniqueVars,
      message: `Template "${sanitizedName}" submitted to Twilio/WhatsApp! SID: ${content.sid}. Status: ${whatsappStatus}`
    });
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

// ─── API: Fix Template — Clone with new permanent image ──────────────────────
// Fetches the old template body/name, uploads a new permanent image, creates a
// NEW template (old one is optionally deleted), and re-submits for WA approval.
app.post('/api/fix-template', upload.single('file'), async (req, res) => {
  try {
    if (!client) return res.status(500).json({ error: 'Twilio client is not initialized.' });

    const { oldSid, newImageUrl: preSuppliedUrl, deleteOld } = req.body;
    if (!oldSid) return res.status(400).json({ error: 'oldSid is required.' });

    // 1. Fetch old template details from Twilio
    const auth = Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64');
    let oldContent;
    try {
      oldContent = await client.content.v1.contents(oldSid).fetch();
    } catch (e) {
      return res.status(404).json({ error: `Cannot fetch template ${oldSid}: ${e.message}` });
    }

    // Extract body text and name from old template
    let bodyText = '';
    let oldMediaUrl = null;
    if (oldContent.types) {
      for (const [, typeValue] of Object.entries(oldContent.types)) {
        if (typeValue && typeValue.body && !bodyText) bodyText = typeValue.body;
        if (typeValue && typeValue.media && typeValue.media.length > 0 && !oldMediaUrl) {
          oldMediaUrl = typeValue.media[0];
        }
      }
    }
    const oldName = oldContent.friendlyName || oldSid;

    // 2. Get or upload the permanent image
    let permanentImageUrl = preSuppliedUrl ? preSuppliedUrl.trim() : null;

    if (req.file) {
      // File was uploaded — push to permanent cloud storage
      console.log(`[fix-template] Uploading replacement image: ${req.file.originalname} to permanent cloud storage...`);
      try {
        permanentImageUrl = await uploadPermanentMedia(req.file.path, req.file.originalname, req.file.mimetype);
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        console.log(`[fix-template] Permanent image URL: ${permanentImageUrl}`);
      } catch (uploadErr) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(500).json({ error: `Image upload failed: ${uploadErr.message}` });
      }
    } else if (permanentImageUrl) {
      if (isExpiringOrPlaceholderUrl(permanentImageUrl)) {
        try {
          permanentImageUrl = await rehostUrlIfExpiring(permanentImageUrl);
        } catch (rehostErr) {
          return res.status(400).json({ error: `Could not rehost image: ${rehostErr.message}` });
        }
      }
    } else {
      return res.status(400).json({ error: 'Either upload a new image file or supply a newImageUrl.' });
    }

    // Validate that the image URL is permanently accessible
    const check = await verifyPermanentImageUrl(permanentImageUrl);
    if (!check.ok) {
      return res.status(400).json({
        error: `The image URL verification failed: ${check.error || 'Invalid or inaccessible image link.'}`
      });
    }

    // 3. Build new template name — strip _v\d suffix and re-increment
    const baseNameMatch = oldName.replace(/_v\d+$/, '');
    const sanitizedBaseName = baseNameMatch.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 45);
    let newName = sanitizedBaseName + '_v' + Math.floor(Date.now() / 1000).toString().slice(-4);

    // 4. Create new template with permanent image
    const typesObj = {
      'twilio/media': {
        body: bodyText,
        media: [permanentImageUrl]
      }
    };

    const varMatches = [...bodyText.matchAll(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]);
    const uniqueVars = [...new Set(varMatches)];
    const variablesObj = {};
    uniqueVars.forEach((v, idx) => { variablesObj[v] = `Sample Value ${idx + 1}`; });

    const contentParams = { friendlyName: newName, language: 'en', types: typesObj };
    if (Object.keys(variablesObj).length > 0) contentParams.variables = variablesObj;

    const newContent = await client.content.v1.contents.create(contentParams);
    console.log(`[fix-template] Created new template: ${newContent.sid} (${newName})`);

    // 5. Submit new template for WhatsApp approval
    const approvalRes = await fetch(
      `https://content.twilio.com/v1/Content/${newContent.sid}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'MARKETING', name: newName })
      }
    );
    const approvalData = await approvalRes.json();
    const newStatus = approvalData.whatsapp?.status || approvalData.status || 'submitted';
    console.log(`[fix-template] Approval submitted, status: ${newStatus}`);

    // 6. Optionally delete the old broken template
    if (deleteOld === 'true' || deleteOld === true) {
      try {
        await client.content.v1.contents(oldSid).remove();
        console.log(`[fix-template] Deleted old template ${oldSid}`);
      } catch (delErr) {
        console.warn(`[fix-template] Could not delete old template ${oldSid}: ${delErr.message}`);
      }
    }

    return res.json({
      success: true,
      newSid: newContent.sid,
      newName,
      newImageUrl: permanentImageUrl,
      status: newStatus,
      message: `Fixed! New template "${newName}" (${newContent.sid}) submitted for WhatsApp approval with permanent image. Status: ${newStatus}`
    });
  } catch (err) {
    console.error('[fix-template] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fix template' });
  }
});

// ─── API: Upload template image to permanent cloud storage ────────────────────
app.post('/api/upload-template-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    console.log(`[upload-template-image] Uploading ${req.file.originalname} (${req.file.mimetype})...`);
    const publicUrl = await uploadPermanentMedia(req.file.path, req.file.originalname, req.file.mimetype);

    try { fs.unlinkSync(req.file.path); } catch (_) {}

    // Verify accessibility of image
    const verifyCheck = await verifyPermanentImageUrl(publicUrl);

    res.json({
      success: true,
      url: publicUrl,
      verified: verifyCheck.ok,
      contentType: verifyCheck.contentType,
      fileName: req.file.originalname
    });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    console.error('[upload-template-image] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload image to permanent cloud storage' });
  }
});

// ─── API: Cloud Storage Configuration (GET / POST) ───────────────────────────
app.get('/api/storage/config', (req, res) => {
  try {
    const config = getStorageConfig();
    res.json({
      success: true,
      config: {
        activeProvider: config.activeProvider || 'auto',
        cloudinary: {
          cloudName: config.cloudinary?.cloudName || '',
          apiKey: config.cloudinary?.apiKey || '',
          apiSecret: config.cloudinary?.apiSecret ? '••••••••' : '',
          uploadPreset: config.cloudinary?.uploadPreset || '',
          isConfigured: Boolean(config.cloudinary?.cloudName && (config.cloudinary?.uploadPreset || (config.cloudinary?.apiKey && config.cloudinary?.apiSecret))),
        },
        firebase: {
          bucket: config.firebase?.bucket || '',
          apiKey: config.firebase?.apiKey ? '••••••••' : '',
          isConfigured: Boolean(config.firebase?.bucket),
        },
        imgbb: {
          apiKey: config.imgbb?.apiKey ? '••••••••' : '',
          isConfigured: Boolean(config.imgbb?.apiKey),
        },
        supabase: {
          url: config.supabase?.url || '',
          key: config.supabase?.key ? '••••••••' : '',
          bucket: config.supabase?.bucket || 'public-media',
          isConfigured: Boolean(config.supabase?.url && config.supabase?.key),
        },
        s3: {
          bucket: config.s3?.bucket || '',
          region: config.s3?.region || 'us-east-1',
          accessKeyId: config.s3?.accessKeyId || '',
          secretAccessKey: config.s3?.secretAccessKey ? '••••••••' : '',
          endpoint: config.s3?.endpoint || '',
          publicUrl: config.s3?.publicUrl || '',
          isConfigured: Boolean(config.s3?.bucket && config.s3?.accessKeyId),
        },
        vercelBlob: {
          token: (config.vercelBlob?.token || process.env.BLOB_READ_WRITE_TOKEN) ? '••••••••' : '',
          isConfigured: Boolean(config.vercelBlob?.token || process.env.BLOB_READ_WRITE_TOKEN),
        },
        publicServerUrl: config.publicServerUrl || process.env.PUBLIC_URL || '',
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/storage/config', (req, res) => {
  try {
    const { activeProvider, cloudinary, firebase, imgbb, supabase, s3, vercelBlob, publicServerUrl } = req.body;

    if (activeProvider !== undefined) {
      setStoredSetting('STORAGE_ACTIVE_PROVIDER', activeProvider);
    }

    if (cloudinary) {
      if (cloudinary.cloudName !== undefined) setStoredSetting('CLOUDINARY_CLOUD_NAME', cloudinary.cloudName.trim());
      if (cloudinary.apiKey !== undefined && !cloudinary.apiKey.includes('••••')) setStoredSetting('CLOUDINARY_API_KEY', cloudinary.apiKey.trim());
      if (cloudinary.apiSecret !== undefined && !cloudinary.apiSecret.includes('••••')) setStoredSetting('CLOUDINARY_API_SECRET', cloudinary.apiSecret.trim());
      if (cloudinary.uploadPreset !== undefined) setStoredSetting('CLOUDINARY_UPLOAD_PRESET', cloudinary.uploadPreset.trim());
    }

    if (firebase) {
      if (firebase.bucket !== undefined) setStoredSetting('FIREBASE_STORAGE_BUCKET', firebase.bucket.trim());
      if (firebase.apiKey !== undefined && !firebase.apiKey.includes('••••')) setStoredSetting('FIREBASE_API_KEY', firebase.apiKey.trim());
    }

    if (imgbb) {
      if (imgbb.apiKey !== undefined && !imgbb.apiKey.includes('••••')) setStoredSetting('IMGBB_API_KEY', imgbb.apiKey.trim());
    }

    if (supabase) {
      if (supabase.url !== undefined) setStoredSetting('SUPABASE_URL', supabase.url.trim());
      if (supabase.key !== undefined && !supabase.key.includes('••••')) setStoredSetting('SUPABASE_KEY', supabase.key.trim());
      if (supabase.bucket !== undefined) setStoredSetting('SUPABASE_BUCKET', supabase.bucket.trim());
    }

    if (s3) {
      if (s3.bucket !== undefined) setStoredSetting('S3_BUCKET', s3.bucket.trim());
      if (s3.region !== undefined) setStoredSetting('S3_REGION', s3.region.trim());
      if (s3.accessKeyId !== undefined) setStoredSetting('S3_ACCESS_KEY_ID', s3.accessKeyId.trim());
      if (s3.secretAccessKey !== undefined && !s3.secretAccessKey.includes('••••')) setStoredSetting('S3_SECRET_ACCESS_KEY', s3.secretAccessKey.trim());
      if (s3.endpoint !== undefined) setStoredSetting('S3_ENDPOINT', s3.endpoint.trim());
      if (s3.publicUrl !== undefined) setStoredSetting('S3_PUBLIC_URL', s3.publicUrl.trim());
    }

    if (vercelBlob) {
      if (vercelBlob.token !== undefined && !vercelBlob.token.includes('••••')) setStoredSetting('BLOB_READ_WRITE_TOKEN', vercelBlob.token.trim());
    }

    if (publicServerUrl !== undefined) {
      setStoredSetting('PUBLIC_SERVER_URL', publicServerUrl.trim());
    }

    res.json({ success: true, message: 'Cloud storage settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Test Storage Provider Upload ───────────────────────────────────────
app.post('/api/storage/test', async (req, res) => {
  try {
    const { provider, customConfig } = req.body;
    const providerName = provider || 'auto';
    console.log(`[storage-test] Testing provider probe: "${providerName}"...`);

    const result = await testStorageProvider(providerName, customConfig);
    res.json(result);
  } catch (err) {
    console.error('[storage-test] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Settings & Inbound Message Store ────────────────────────────────────────
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    "from" TEXT,
    "to" TEXT,
    body TEXT,
    timestamp TEXT,
    media TEXT,
    channel TEXT,
    isOutgoing INTEGER DEFAULT 0
  );
`);

const getSetting = (key, defaultVal) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultVal;
  } catch (e) {
    return defaultVal;
  }
};

const setSetting = (key, val) => {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, val, val);
};

const insertMessage = db.prepare(`
  INSERT INTO messages (id, "from", "to", body, timestamp, media, channel, isOutgoing)
  VALUES (@id, @from, @to, @body, @timestamp, @media, @channel, @isOutgoing)
  ON CONFLICT(id) DO NOTHING
`);

const getMessages = db.prepare(`
  SELECT * FROM messages ORDER BY timestamp DESC LIMIT 200
`);

// ─── API: Inbound WhatsApp / SMS Webhook ─────────────────────────────────────
const handleInboundWebhook = async (req, res) => {
  try {
    const { From, To, Body, NumMedia, MessageSid } = req.body;
    console.log(`[inbound] Received message from ${From}: "${Body}"`);

    const mediaList = [];
    const numMediaInt = parseInt(NumMedia || '0', 10);
    for (let i = 0; i < numMediaInt; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const mediaType = req.body[`MediaContentType${i}`];
      if (mediaUrl) {
        mediaList.push({ url: mediaUrl, contentType: mediaType });
      }
    }

    const cleanFrom = (From || '').replace('whatsapp:', '');
    const cleanTo = (To || '').replace('whatsapp:', '');
    const isWhatsApp = (From || '').includes('whatsapp');

    const newMsg = {
      id: MessageSid || `msg_${Date.now()}`,
      from: cleanFrom,
      to: cleanTo,
      body: Body || (mediaList.length > 0 ? '[Media Attachment]' : ''),
      timestamp: new Date().toISOString(),
      media: mediaList,
      channel: isWhatsApp ? 'whatsapp' : 'sms'
    };

    insertMessage.run({
      id: newMsg.id,
      from: newMsg.from,
      to: newMsg.to,
      body: newMsg.body,
      timestamp: newMsg.timestamp,
      media: JSON.stringify(newMsg.media),
      channel: newMsg.channel,
      isOutgoing: 0
    });

    // Respond immediately with empty TwiML to acknowledge receipt to Twilio
    res.type('text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('Error in inbound webhook:', err);
    if (!res.headersSent) {
      res.status(500).send('<Response></Response>');
    }
  }
};

app.post('/api/whatsapp-webhook', handleInboundWebhook);
app.post('/api/sms-webhook', handleInboundWebhook);
app.post('/api/inbound-webhook', handleInboundWebhook);

// ─── API: Fetch & Sync Received Inbound Messages ─────────────────────────────
app.get('/api/inbound-messages', async (req, res) => {
  try {
    // 1. Live sync recent messages from Twilio Account Logs
    if (client) {
      try {
        const twilioMsgs = await client.messages.list({ limit: 50 });
        for (const m of twilioMsgs) {
          const cleanFrom = (m.from || '').replace('whatsapp:', '');
          const cleanTo = (m.to || '').replace('whatsapp:', '');
          const isInbound = m.direction ? m.direction.includes('inbound') : false;

          const numMedia = parseInt(m.numMedia || '0', 10);
          const mediaList = [];
          if (numMedia > 0) {
            mediaList.push({
              url: `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages/${m.sid}/Media`,
              contentType: 'image/jpeg'
            });
          }

          insertMessage.run({
            id: m.sid,
            from: cleanFrom,
            to: cleanTo,
            body: m.body || (numMedia > 0 ? '[Media Attachment]' : ''),
            timestamp: m.dateCreated ? new Date(m.dateCreated).toISOString() : new Date().toISOString(),
            media: JSON.stringify(mediaList),
            channel: (m.from || '').includes('whatsapp') || (m.to || '').includes('whatsapp') ? 'whatsapp' : 'sms',
            isOutgoing: isInbound ? 0 : 1
          });
        }
      } catch (syncErr) {
        console.error('Failed to sync live Twilio messages:', syncErr.message);
      }
    }

    // 2. Fetch all stored messages from SQLite DB
    const rows = getMessages.all();
    const messages = rows.map(row => ({
      ...row,
      media: JSON.parse(row.media || '[]'),
      isOutgoing: row.isOutgoing === 1
    }));
    res.json({ messages });
  } catch (err) {
    console.error('Error fetching messages from DB:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ─── API: Fetch Active 24-Hour Sessions (SMS & WhatsApp) ────────────────────
app.get('/api/active-sessions', async (req, res) => {
  try {
    // 1. Live sync recent messages from Twilio Account Logs
    if (client) {
      try {
        const twilioMsgs = await client.messages.list({ limit: 100 });
        for (const m of twilioMsgs) {
          const cleanFrom = (m.from || '').replace('whatsapp:', '');
          const cleanTo = (m.to || '').replace('whatsapp:', '');
          const isInbound = m.direction ? m.direction.includes('inbound') : false;
          const isWa = (m.from || '').includes('whatsapp') || (m.to || '').includes('whatsapp');

          insertMessage.run({
            id: m.sid,
            from: cleanFrom,
            to: cleanTo,
            body: m.body || '',
            timestamp: m.dateCreated ? new Date(m.dateCreated).toISOString() : new Date().toISOString(),
            media: '[]',
            channel: isWa ? 'whatsapp' : 'sms',
            isOutgoing: isInbound ? 0 : 1
          });
        }
      } catch (syncErr) {
        console.error('Error syncing Twilio logs in active-sessions:', syncErr.message);
      }
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // 2. Fetch all messages in the last 24 hours
    const rows = getMessages.all();
    const activeMap = new Map();

    for (const m of rows) {
      if (m.timestamp >= twentyFourHoursAgo) {
        // For outgoing messages, the contact is 'to'; for incoming messages, contact is 'from'
        const contactNumber = (m.isOutgoing === 1 ? m.to : m.from).replace('whatsapp:', '').trim();
        if (!contactNumber || contactNumber.length < 5) continue;

        if (!activeMap.has(contactNumber) || new Date(m.timestamp) > new Date(activeMap.get(contactNumber).lastActivity)) {
          activeMap.set(contactNumber, {
            number: contactNumber,
            lastActivity: m.timestamp,
            lastReply: m.timestamp, // backward compatibility with UI
            channel: m.channel || 'whatsapp',
            type: m.isOutgoing === 1 ? 'outgoing' : 'incoming',
            lastMessage: m.body || ''
          });
        }
      }
    }

    const activeUsers = Array.from(activeMap.values())
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    res.json({ activeUsers, count: activeUsers.length });
  } catch (err) {
    console.error('Error fetching active sessions:', err);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// ─── API: Send Direct Session Reply (24h Window with Pictures/Videos) ────────
app.post('/api/send-session-reply', upload.array('files', 5), async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({ error: 'Twilio client is not initialized.' });
    }

    const { to, message } = req.body;
    const uploadedFiles = req.files || [];

    if (!to) {
      return res.status(400).json({ error: 'Target phone number (to) is required.' });
    }

    const cleanTo = to.startsWith('+') ? to : `+${to.trim()}`;
    
    // Determine if the user is an SMS or WhatsApp user based on previous messages
    const lastMsgStmt = db.prepare(`SELECT channel, id FROM messages WHERE "from" = ? OR "to" = ? ORDER BY timestamp DESC LIMIT 1`);
    const lastMsg = lastMsgStmt.get(cleanTo, cleanTo) || lastMsgStmt.get(`whatsapp:${cleanTo}`, `whatsapp:${cleanTo}`);
    const reallyIsSms = lastMsg && lastMsg.channel === 'sms';

    const formattedTo = reallyIsSms ? cleanTo : (cleanTo.includes('whatsapp:') ? cleanTo : `whatsapp:${cleanTo}`);
    const fromNumber = reallyIsSms ? FROM_SMS : FROM_WHATSAPP;

    console.log(`[session-reply] Sending direct reply to ${formattedTo} via ${reallyIsSms ? 'SMS' : 'WhatsApp'}...`);

    const tunnelBaseUrl = getTunnelUrl();
    const serverBaseUrl = tunnelBaseUrl || `${req.protocol}://${req.get('host')}`;

    const mediaUrls = await Promise.all(
      uploadedFiles.map(async (f) => {
        const safeFilename = encodeURIComponent(f.filename);
        try {
          const publicUrl = await uploadMedia(f.path, f.originalname, f.mimetype);
          try { fs.unlinkSync(f.path); } catch (e) {}
          return publicUrl;
        } catch (err) {
          console.error('Failed to upload session reply media to CDN:', err);
          return tunnelBaseUrl 
            ? `${tunnelBaseUrl}/uploads/${safeFilename}`
            : `${serverBaseUrl}/uploads/${safeFilename}`;
        }
      })
    );

    let lastMsgSid = '';

    if (reallyIsSms && mediaUrls.length > 0) {
      const mediaLinksText = mediaUrls.map(url => `\n📎 Attachment: ${url}`).join('');
      const smsBody = `${message || ''}${mediaLinksText}`;
      const msg = await client.messages.create({
        from: fromNumber,
        to: formattedTo,
        body: smsBody.trim(),
      });
      lastMsgSid = msg.sid;
    } else if (mediaUrls.length > 0) {
      for (let i = 0; i < mediaUrls.length; i++) {
        const opts = {
          from: fromNumber,
          to: formattedTo,
          mediaUrl: [mediaUrls[i]],
        };
        // Attach text message to the first media item
        if (i === 0 && message) {
          opts.body = message;
        }
        const msg = await client.messages.create(opts);
        lastMsgSid = msg.sid;
      }
    } else if (message) {
      const msg = await client.messages.create({
        from: fromNumber,
        to: formattedTo,
        body: message,
      });
      lastMsgSid = msg.sid;
    }

    const replyObj = {
      id: lastMsgSid || `reply_${Date.now()}`,
      from: 'ME (Business Account)',
      to: cleanTo,
      body: message || '[Sent Media File]',
      timestamp: new Date().toISOString(),
      media: mediaUrls.map(u => ({ url: u })),
      channel: reallyIsSms ? 'sms' : 'whatsapp',
      isOutgoing: true
    };

    insertMessage.run({
      id: replyObj.id,
      from: replyObj.from,
      to: replyObj.to,
      body: replyObj.body,
      timestamp: replyObj.timestamp,
      media: JSON.stringify(replyObj.media),
      channel: replyObj.channel,
      isOutgoing: 1
    });

    res.json({
      success: true,
      sid: replyObj.id,
      message: `Message & media sent to ${cleanTo}!`
    });
  } catch (err) {
    console.error('Error sending session reply:', err);
    res.status(500).json({ error: err.message || 'Failed to send session reply' });
  }
});

// Removed root route so it doesn't intercept the static file serving.

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    fromWhatsApp: FROM_WHATSAPP,
    fromSms: FROM_SMS,
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

// ─── Global error handler — always return JSON, never HTML ────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// ─── Serve React Frontend for Electron/Production ───────────────────────────────
const clientDistCandidates = [
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, 'client/dist'),
  path.join(process.resourcesPath || '', 'client/dist'),
  path.join(process.resourcesPath || '', 'resources/client/dist'),
  path.join(process.resourcesPath || '', 'app/client/dist'),
  path.join(process.resourcesPath || '', 'app.asar.unpacked/client/dist')
];
const clientDistPath = clientDistCandidates.find(p => fs.existsSync(p)) || path.join(__dirname, '../client/dist');
console.log('[Frontend] Serving static React UI from:', clientDistPath);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ─── Start Server ─────────────────────────────────────────────────────────────
if (!process.env.VERCEL && !process.env.ELECTRON_EMBEDDED) {
  const server = app.listen(PORT, () => {
    const actualPort = server.address().port;
    console.log(`APP_PORT_IS:${actualPort}`);
    console.log(`✅ WhatsApp/SMS Sender Server running on http://localhost:${actualPort}`);
    console.log(`   Twilio WhatsApp FROM: ${FROM_WHATSAPP}`);
    console.log(`   Twilio SMS FROM: ${FROM_SMS}`);
  });
}

module.exports = app;

