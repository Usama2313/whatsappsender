const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const FormData = require('form-data');
const db = require('./db');

// ─── Settings Helper Functions ──────────────────────────────────────────────
function getStoredSetting(key, defaultVal = '') {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row && row.value !== undefined ? row.value : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function setStoredSetting(key, val) {
  try {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, val, val);
  } catch (e) {
    console.error(`[storage-db] Error setting ${key}:`, e.message);
  }
}

// ─── Storage Configuration Resolution ────────────────────────────────────────
// Reads from DB first, falling back to process.env
function getStorageConfig() {
  const activeProvider = getStoredSetting('STORAGE_ACTIVE_PROVIDER', process.env.STORAGE_ACTIVE_PROVIDER || 'auto');

  return {
    activeProvider,
    cloudinary: {
      cloudName: getStoredSetting('CLOUDINARY_CLOUD_NAME', process.env.CLOUDINARY_CLOUD_NAME || ''),
      apiKey: getStoredSetting('CLOUDINARY_API_KEY', process.env.CLOUDINARY_API_KEY || ''),
      apiSecret: getStoredSetting('CLOUDINARY_API_SECRET', process.env.CLOUDINARY_API_SECRET || ''),
      uploadPreset: getStoredSetting('CLOUDINARY_UPLOAD_PRESET', process.env.CLOUDINARY_UPLOAD_PRESET || ''),
    },
    firebase: {
      bucket: getStoredSetting('FIREBASE_STORAGE_BUCKET', process.env.FIREBASE_STORAGE_BUCKET || ''),
      apiKey: getStoredSetting('FIREBASE_API_KEY', process.env.FIREBASE_API_KEY || ''),
    },
    imgbb: {
      apiKey: getStoredSetting('IMGBB_API_KEY', process.env.IMGBB_API_KEY || ''),
    },
    supabase: {
      url: getStoredSetting('SUPABASE_URL', process.env.SUPABASE_URL || ''),
      key: getStoredSetting('SUPABASE_KEY', process.env.SUPABASE_KEY || ''),
      bucket: getStoredSetting('SUPABASE_BUCKET', process.env.SUPABASE_BUCKET || 'public-media'),
    },
    s3: {
      bucket: getStoredSetting('S3_BUCKET', process.env.S3_BUCKET || ''),
      region: getStoredSetting('S3_REGION', process.env.S3_REGION || 'us-east-1'),
      accessKeyId: getStoredSetting('S3_ACCESS_KEY_ID', process.env.S3_ACCESS_KEY_ID || ''),
      secretAccessKey: getStoredSetting('S3_SECRET_ACCESS_KEY', process.env.S3_SECRET_ACCESS_KEY || ''),
      endpoint: getStoredSetting('S3_ENDPOINT', process.env.S3_ENDPOINT || ''),
      publicUrl: getStoredSetting('S3_PUBLIC_URL', process.env.S3_PUBLIC_URL || ''),
    },
    vercelBlob: {
      token: getStoredSetting('BLOB_READ_WRITE_TOKEN', process.env.BLOB_READ_WRITE_TOKEN || ''),
    },
    publicServerUrl: getStoredSetting('PUBLIC_URL', process.env.PUBLIC_URL || ''),
  };
}

// Known temporary/expiring hosts — forbidden for WhatsApp templates
const FORBIDDEN_TEMP_HOSTS = [
  'uguu.se', 'h.uguu.se', 'n.uguu.se', 'a.uguu.se',
  'litterbox.catbox.moe',
  'tmpfiles.org',
  '0x0.st',
  'transfer.sh',
  'temp.sh',
  'file.io',
  'anonfiles.com',
  'workupload.com',
];

// ─── Pre-flight Image Verification ──────────────────────────────────────────
async function verifyPermanentImageUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { ok: false, error: 'Invalid URL format' };
  }

  if (FORBIDDEN_TEMP_HOSTS.some(h => url.includes(h))) {
    return {
      ok: false,
      error: `URL is hosted on a temporary expiring service (${url}). Templates require permanent cloud storage.`
    };
  }

  try {
    const res = await fetch(url, { method: 'HEAD', timeout: 8000 });
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    
    if (res.ok && ctype.startsWith('image/')) {
      return { ok: true, contentType: ctype, status: res.status };
    }

    // If HEAD is blocked, attempt a small ranged GET request
    const getRes = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-512' },
      timeout: 8000
    });
    const getCtype = (getRes.headers.get('content-type') || '').toLowerCase();
    
    if (getRes.ok && (getCtype.startsWith('image/') || getCtype.includes('octet-stream'))) {
      return { ok: true, contentType: getCtype, status: getRes.status };
    }

    return {
      ok: false,
      error: `URL returned HTTP ${getRes.status} with content-type "${getCtype}". Expected image/*`
    };
  } catch (err) {
    return { ok: false, error: `Failed to reach image: ${err.message}` };
  }
}

// ─── Driver 1: Cloudinary ───────────────────────────────────────────────────
async function uploadToCloudinary(filePath, fileName, mimetype, config) {
  const { cloudName, apiKey, apiSecret, uploadPreset } = config.cloudinary;
  if (!cloudName) {
    throw new Error('Cloudinary Cloud Name is required.');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', fileBuffer, { filename: fileName, contentType: mimetype });

  const timestamp = Math.floor(Date.now() / 1000);
  form.append('timestamp', timestamp.toString());

  if (uploadPreset) {
    // Unsigned upload preset
    form.append('upload_preset', uploadPreset);
  } else if (apiKey && apiSecret) {
    // Signed upload
    form.append('api_key', apiKey);
    // Create SHA1 signature: "timestamp=...<secret>"
    const strToSign = `timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(strToSign).digest('hex');
    form.append('signature', signature);
  } else {
    throw new Error('Cloudinary requires either an Upload Preset or both API Key and API Secret.');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 30000,
  });

  const data = await response.json();
  if (!response.ok || !data.secure_url) {
    throw new Error(data.error?.message || `Cloudinary upload failed (HTTP ${response.status})`);
  }

  console.log(`[cloud-storage] Cloudinary upload successful: ${data.secure_url}`);
  return data.secure_url;
}

// ─── Driver 2: Firebase Storage / Google Cloud Storage ──────────────────────
async function uploadToFirebase(filePath, fileName, mimetype, config) {
  let bucket = config.firebase.bucket.trim();
  if (!bucket) {
    throw new Error('Firebase Storage Bucket is required (e.g. project-id.firebasestorage.app or project-id.appspot.com).');
  }

  // Clean bucket string (remove gs:// or https:// prefix if user entered it)
  bucket = bucket.replace(/^gs:\/\//, '').replace(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\//, '').split('/')[0];

  const fileBuffer = fs.readFileSync(filePath);
  const sanitizedName = `whatsapp_templates/${Date.now()}_${path.basename(fileName).replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const encodedName = encodeURIComponent(sanitizedName);
  const downloadToken = crypto.randomUUID();

  // Upload to Firebase Storage REST API
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedName}`;
  const headers = {
    'Content-Type': mimetype || 'image/jpeg',
    'x-goog-meta-firebaseStorageDownloadTokens': downloadToken,
  };

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: fileBuffer,
    headers,
    timeout: 30000,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Firebase Storage upload failed (${response.status}): ${errText || response.statusText}. Please verify that your bucket allows uploads.`);
  }

  const data = await response.json();
  // Construct direct permanent public download URL
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedName}?alt=media&token=${downloadToken}`;
  console.log(`[cloud-storage] Firebase Storage upload successful: ${publicUrl}`);
  return publicUrl;
}

// ─── Driver 3: ImgBB ────────────────────────────────────────────────────────
async function uploadToImgBB(filePath, fileName, mimetype, config) {
  const apiKey = config.imgbb.apiKey.trim();
  if (!apiKey) {
    throw new Error('ImgBB API Key is required. Get a free API key at https://api.imgbb.com/');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('image', fileBuffer.toString('base64'));

  const endpoint = `https://api.imgbb.com/1/upload?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 30000,
  });

  const data = await response.json();
  if (!response.ok || !data.success || !data.data?.url) {
    throw new Error(data.error?.message || `ImgBB upload failed with status ${response.status}`);
  }

  // Use direct image link
  const directUrl = data.data.image?.url || data.data.url;
  console.log(`[cloud-storage] ImgBB upload successful: ${directUrl}`);
  return directUrl;
}

// ─── Driver 4: Supabase Storage ─────────────────────────────────────────────
async function uploadToSupabase(filePath, fileName, mimetype, config) {
  let { url: supabaseUrl, key: supabaseKey, bucket } = config.supabase;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and API Key are required.');
  }

  supabaseUrl = supabaseUrl.replace(/\/$/, '');
  bucket = bucket || 'public-media';

  const fileBuffer = fs.readFileSync(filePath);
  const sanitizedName = `${Date.now()}_${path.basename(fileName).replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

  const uploadEndpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${sanitizedName}`;
  const response = await fetch(uploadEndpoint, {
    method: 'POST',
    body: fileBuffer,
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': mimetype || 'image/jpeg',
      'x-upsert': 'true',
    },
    timeout: 30000,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Supabase upload failed (${response.status}): ${errText}`);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${sanitizedName}`;
  console.log(`[cloud-storage] Supabase upload successful: ${publicUrl}`);
  return publicUrl;
}

// ─── Driver 5: Catbox.moe (Permanent Community Fallback) ─────────────────────
async function uploadToCatbox(filePath, fileName, mimetype) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fileBuffer, { filename: fileName, contentType: mimetype });

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 25000,
  });

  if (!response.ok) {
    throw new Error(`Catbox upload failed: ${response.status} ${response.statusText}`);
  }

  const url = (await response.text()).trim();
  if (!url.startsWith('https://')) {
    throw new Error(`Catbox returned invalid URL: ${url}`);
  }

  console.log(`[cloud-storage] Catbox upload successful: ${url}`);
  return url;
}

// ─── Driver 6: Vercel Blob ──────────────────────────────────────────────────
async function uploadToVercelBlob(filePath, fileName, mimetype, token) {
  const { put } = require('@vercel/blob');
  const fileBuffer = fs.readFileSync(filePath);
  const { url } = await put(`whatsapp_templates/${fileName}`, fileBuffer, {
    access: 'public',
    contentType: mimetype,
    token: token || process.env.BLOB_READ_WRITE_TOKEN,
  });
  console.log(`[cloud-storage] Vercel Blob upload successful: ${url}`);
  return url;
}

// ─── Unified Permanent Upload Router ─────────────────────────────────────────
async function uploadPermanentMedia(filePath, fileName, mimetype) {
  const config = getStorageConfig();
  const errors = [];
  const provider = config.activeProvider;

  console.log(`[cloud-storage] Initiating permanent upload for ${fileName} (Active Provider: ${provider})...`);

  // 1. Explicit Provider Upload (if user selected a specific provider)
  if (provider === 'cloudinary') {
    return await uploadToCloudinary(filePath, fileName, mimetype, config);
  }
  if (provider === 'firebase') {
    return await uploadToFirebase(filePath, fileName, mimetype, config);
  }
  if (provider === 'imgbb') {
    return await uploadToImgBB(filePath, fileName, mimetype, config);
  }
  if (provider === 'supabase') {
    return await uploadToSupabase(filePath, fileName, mimetype, config);
  }
  if (provider === 'vercelBlob') {
    return await uploadToVercelBlob(filePath, fileName, mimetype, config.vercelBlob.token);
  }

  // 2. 'Auto' Mode — Try configured providers in order of reliability
  // A. Cloudinary (if configured)
  if (config.cloudinary.cloudName && (config.cloudinary.uploadPreset || config.cloudinary.apiSecret)) {
    try {
      console.log('[cloud-storage] Auto-trying Cloudinary...');
      return await uploadToCloudinary(filePath, fileName, mimetype, config);
    } catch (e) {
      console.error('[cloud-storage] Cloudinary failed:', e.message);
      errors.push(`Cloudinary: ${e.message}`);
    }
  }

  // B. Firebase Storage (if configured)
  if (config.firebase.bucket) {
    try {
      console.log('[cloud-storage] Auto-trying Firebase Storage...');
      return await uploadToFirebase(filePath, fileName, mimetype, config);
    } catch (e) {
      console.error('[cloud-storage] Firebase failed:', e.message);
      errors.push(`Firebase: ${e.message}`);
    }
  }

  // C. ImgBB (if configured)
  if (config.imgbb.apiKey) {
    try {
      console.log('[cloud-storage] Auto-trying ImgBB...');
      return await uploadToImgBB(filePath, fileName, mimetype, config);
    } catch (e) {
      console.error('[cloud-storage] ImgBB failed:', e.message);
      errors.push(`ImgBB: ${e.message}`);
    }
  }

  // D. Supabase Storage (if configured)
  if (config.supabase.url && config.supabase.key) {
    try {
      console.log('[cloud-storage] Auto-trying Supabase Storage...');
      return await uploadToSupabase(filePath, fileName, mimetype, config);
    } catch (e) {
      console.error('[cloud-storage] Supabase failed:', e.message);
      errors.push(`Supabase: ${e.message}`);
    }
  }

  // E. Vercel Blob (if configured)
  if (config.vercelBlob.token || process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      console.log('[cloud-storage] Auto-trying Vercel Blob...');
      return await uploadToVercelBlob(filePath, fileName, mimetype, config.vercelBlob.token);
    } catch (e) {
      console.error('[cloud-storage] Vercel Blob failed:', e.message);
      errors.push(`Vercel Blob: ${e.message}`);
    }
  }

  // F. Self-hosted PUBLIC_URL (if configured)
  if (config.publicServerUrl || process.env.PUBLIC_URL) {
    const pubUrl = (config.publicServerUrl || process.env.PUBLIC_URL).replace(/\/$/, '');
    const publicFileUrl = `${pubUrl}/uploads/${path.basename(filePath)}`;
    console.log(`[cloud-storage] Serving from public server: ${publicFileUrl}`);
    return publicFileUrl;
  }

  // G. Catbox.moe fallback
  try {
    console.log('[cloud-storage] Trying Catbox.moe permanent fallback...');
    const catboxUrl = await uploadToCatbox(filePath, fileName, mimetype);
    return catboxUrl;
  } catch (e) {
    console.error('[cloud-storage] Catbox fallback failed:', e.message);
    errors.push(`Catbox: ${e.message}`);
  }

  throw new Error(`All permanent cloud upload providers failed for ${fileName}. Configure a cloud provider (Cloudinary, Firebase, ImgBB, or Supabase) in Settings. Errors: ${errors.join('; ')}`);
}

// ─── Test Storage Provider Helper ────────────────────────────────────────────
async function testStorageProvider(providerName, customConfig = null) {
  const startTime = Date.now();
  const tempTestPath = path.join(__dirname, 'test_upload_probe.png');
  // 1x1 transparent PNG buffer
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(tempTestPath, pngBuffer);

  const configToUse = customConfig ? { ...getStorageConfig(), ...customConfig } : getStorageConfig();

  try {
    let uploadedUrl = '';
    const testFileName = `probe_test_${Date.now()}.png`;
    const mime = 'image/png';

    if (providerName === 'cloudinary') {
      uploadedUrl = await uploadToCloudinary(tempTestPath, testFileName, mime, configToUse);
    } else if (providerName === 'firebase') {
      uploadedUrl = await uploadToFirebase(tempTestPath, testFileName, mime, configToUse);
    } else if (providerName === 'imgbb') {
      uploadedUrl = await uploadToImgBB(tempTestPath, testFileName, mime, configToUse);
    } else if (providerName === 'supabase') {
      uploadedUrl = await uploadToSupabase(tempTestPath, testFileName, mime, configToUse);
    } else if (providerName === 'catbox') {
      uploadedUrl = await uploadToCatbox(tempTestPath, testFileName, mime);
    } else if (providerName === 'auto') {
      uploadedUrl = await uploadPermanentMedia(tempTestPath, testFileName, mime);
    } else {
      throw new Error(`Unknown provider "${providerName}"`);
    }

    try { fs.unlinkSync(tempTestPath); } catch (_) {}

    // Verify the URL by fetching it
    const verifyRes = await verifyPermanentImageUrl(uploadedUrl);
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      url: uploadedUrl,
      provider: providerName,
      latencyMs,
      verified: verifyRes.ok,
      contentType: verifyRes.contentType || 'image/png',
      message: `Verified successfully! Uploaded to ${providerName.toUpperCase()} and accessible in ${latencyMs}ms.`,
    };
  } catch (err) {
    try { fs.unlinkSync(tempTestPath); } catch (_) {}
    return {
      success: false,
      provider: providerName,
      error: err.message,
      latencyMs: Date.now() - startTime,
    };
  }
}

function isExpiringOrPlaceholderUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return FORBIDDEN_TEMP_HOSTS.some(h => url.includes(h)) || url.includes('demo.twilio.com') || url.includes('owl.png');
}

async function rehostUrlIfExpiring(url) {
  if (!url || !isExpiringOrPlaceholderUrl(url)) {
    return url;
  }
  console.log(`[cloud-storage] Detected temporary/expiring URL: ${url}. Auto-rehosting to permanent cloud storage...`);
  const tempPath = path.join(__dirname, `rehost_${Date.now()}.png`);
  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error(`Cannot download media (HTTP ${res.status})`);
    const buffer = await res.buffer();
    fs.writeFileSync(tempPath, buffer);
    const contentType = res.headers.get('content-type') || 'image/png';
    const permanentUrl = await uploadPermanentMedia(tempPath, `rehosted_${Date.now()}.png`, contentType);
    try { fs.unlinkSync(tempPath); } catch (_) {}
    console.log(`[cloud-storage] Successfully rehosted to permanent URL: ${permanentUrl}`);
    return permanentUrl;
  } catch (e) {
    try { fs.unlinkSync(tempPath); } catch (_) {}
    console.error(`[cloud-storage] Failed to rehost URL ${url}:`, e.message);
    throw new Error(`Failed to rehost expiring image (${url}): ${e.message}`);
  }
}

module.exports = {
  getStorageConfig,
  getStoredSetting,
  setStoredSetting,
  verifyPermanentImageUrl,
  uploadPermanentMedia,
  testStorageProvider,
  isExpiringOrPlaceholderUrl,
  rehostUrlIfExpiring,
};
