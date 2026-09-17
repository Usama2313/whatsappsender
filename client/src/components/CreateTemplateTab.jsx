import React, { useState, useRef } from 'react';
import { LayoutTemplate, UploadCloud, AlertCircle, CheckCircle2, Image as ImageIcon, Eye, Clock, ExternalLink, Link, Loader2, ShieldCheck, XCircle, RefreshCw, Cloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const API = '';

const STATUS_CONFIG = {
  approved: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: '✅', label: 'APPROVED' },
  pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: '⏳', label: 'PENDING REVIEW' },
  submitted: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: '⏳', label: 'SUBMITTED' },
  rejected: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: '❌', label: 'REJECTED' },
};

// ─── Upload image via backend server (no browser CORS restrictions) ───────────
async function uploadTemplateImageViaBackend(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API}/api/upload-template-image`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.url) {
    throw new Error('Server did not return a valid public image URL');
  }
  return data.url;
}

// ─── Validate that a URL is a reachable image ─────────────────────────────────
function validateImageUrl(url) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) { resolve(false); return; }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    // Timeout after 8 seconds
    setTimeout(() => resolve(false), 8000);
  });
}

export default function CreateTemplateTab({ onOpenStorageSettings }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [headerType, setHeaderType] = useState('text');
  const [bodyText, setBodyText] = useState('');

  // ─── Image state ───────────────────────────────────────────────────────────
  const [confirmedImageUrl, setConfirmedImageUrl] = useState(''); // the final URL used in template
  const [urlInput, setUrlInput] = useState('');                   // raw URL input field
  const [urlStatus, setUrlStatus] = useState('idle');             // idle | checking | valid | invalid
  const [uploadingImage, setUploadingImage] = useState(false);    // browser→catbox upload
  const [localPreview, setLocalPreview] = useState(null);         // local blob preview before upload
  const fileInputRef = useRef(null);

  // ─── Submission state ──────────────────────────────────────────────────────
  const [loadingStep, setLoadingStep] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // ─── Handle file pick → upload to catbox from browser ─────────────────────
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Show local preview immediately
    if (selectedFile.type.startsWith('image/')) {
      setLocalPreview(URL.createObjectURL(selectedFile));
    }

    setUploadingImage(true);
    setConfirmedImageUrl('');
    setUrlInput('');
    setUrlStatus('idle');
    const toastId = toast.loading('Uploading to permanent cloud storage...');

    try {
      const permanentUrl = await uploadTemplateImageViaBackend(selectedFile);
      setConfirmedImageUrl(permanentUrl);
      setUrlInput(permanentUrl);
      setUrlStatus('valid');
      toast.success('Image uploaded! Permanent URL locked in ✅', { id: toastId });
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`, { id: toastId });
      setLocalPreview(null);
    } finally {
      setUploadingImage(false);
      // Reset file input so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Handle manual URL paste → validate ───────────────────────────────────
  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrlInput(val);
    setConfirmedImageUrl('');
    setUrlStatus('idle');
    setLocalPreview(null);
  };

  const handleValidateUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlStatus('checking');
    const ok = await validateImageUrl(url);
    if (ok) {
      setUrlStatus('valid');
      setConfirmedImageUrl(url);
      setLocalPreview(url);
      toast.success('Image URL is publicly accessible ✅');
    } else {
      setUrlStatus('invalid');
      setConfirmedImageUrl('');
      toast.error('Cannot load this image. Make sure it\'s a direct, public image link.');
    }
  };

  const handleClearImage = () => {
    setConfirmedImageUrl('');
    setUrlInput('');
    setUrlStatus('idle');
    setLocalPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Submit template to server ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!name || !bodyText) return;

    if (headerType === 'media' && !confirmedImageUrl) {
      toast.error('Please upload an image or validate a URL first.');
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    formData.append('headerType', headerType);
    formData.append('bodyText', bodyText);

    if (headerType === 'media') {
      // Always send the pre-confirmed URL — no server-side CDN upload ever needed
      formData.append('headerMediaUrl', confirmedImageUrl);
      setLoadingStep('Submitting template with your verified image...');
    } else {
      setLoadingStep('Creating template...');
    }

    try {
      const response = await fetch(API + '/api/create-template', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult({ type: response.ok ? 'success' : 'error', data });
      if (response.ok) {
        toast.success(`Template submitted! Status: ${data.status}`);
      } else {
        toast.error(`Error: ${data.error || 'Failed to submit template'}`);
      }
    } catch (err) {
      setResult({ type: 'error', data: { error: err.message } });
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const isImageReady = headerType !== 'media' || !!confirmedImageUrl;
  const canSubmit = !loading && name && bodyText && isImageReady;

  return (
    <div className="flex flex-col xl:flex-row gap-8 items-start w-full">
      {/* Settings Form */}
      <div className="w-full xl:w-7/12 space-y-6">
        <div className="glass-card p-6 md:p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3 border-b border-white/10 pb-5">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Create Template</h2>
              <p className="text-xs text-slate-400">Submit a new message template to WhatsApp approval</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Template Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Template Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g. promotional_campaign_1"
                className="input-field"
              />
              <p className="text-xs text-slate-500">Only lowercase alphanumeric characters and underscores are allowed.</p>
            </div>

            {/* Category + Header Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input-field cursor-pointer bg-slate-900"
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">Header Type</label>
                <div className="flex gap-4 h-11 items-center">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                    <input type="radio" value="text" checked={headerType === 'text'} onChange={() => { setHeaderType('text'); handleClearImage(); }} className="text-green-500 bg-slate-800 border-slate-600 focus:ring-green-500" />
                    <span>Text Only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                    <input type="radio" value="media" checked={headerType === 'media'} onChange={() => setHeaderType('media')} className="text-green-500 bg-slate-800 border-slate-600 focus:ring-green-500" />
                    <span>Media (Image)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* ─── Media Image Section ─────────────────────────────────────── */}
            <AnimatePresence>
              {headerType === 'media' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 overflow-hidden">
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900/40">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-green-400" />
                        <span className="text-sm font-semibold text-white">Template Header Image</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {onOpenStorageSettings && (
                          <button
                            type="button"
                            onClick={onOpenStorageSettings}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-white border border-indigo-500/30 transition flex items-center gap-1.5"
                          >
                            <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Storage Settings</span>
                          </button>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold uppercase tracking-wider">Required</span>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">

                      {/* ── Confirmed image preview ───────────────────────── */}
                      <AnimatePresence>
                        {confirmedImageUrl && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative rounded-xl overflow-hidden border-2 border-green-500/40 bg-black"
                          >
                            <img
                              src={localPreview || confirmedImageUrl}
                              alt="Template header"
                              className="w-full max-h-48 object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute bottom-2 left-3 right-10 flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
                              <span className="text-xs text-green-300 font-semibold truncate">{confirmedImageUrl}</span>
                            </div>
                            <button
                              onClick={handleClearImage}
                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-red-500/80 flex items-center justify-center transition-colors"
                              title="Remove image"
                            >
                              <XCircle className="w-4 h-4 text-white" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {!confirmedImageUrl && (
                        <>
                          {/* ── Option A: Upload file → auto CDN ─────────── */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-[10px] font-black">1</span>
                              Upload from your device
                              <span className="text-[10px] font-normal text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">⚡ Auto-uploads to permanent CDN</span>
                            </p>
                            <div
                              className={`border-2 border-dashed rounded-xl p-5 text-center relative cursor-pointer transition-all ${uploadingImage ? 'border-green-500/60 bg-green-500/5' : 'border-white/10 hover:border-green-500/40 bg-slate-950/20'}`}
                              onClick={() => !uploadingImage && fileInputRef.current?.click()}
                            >
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                              />
                              {uploadingImage ? (
                                <div className="flex flex-col items-center gap-2 py-2">
                                  <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
                                  <p className="text-sm text-green-300 font-medium">Uploading to permanent cloud storage...</p>
                                  <p className="text-xs text-slate-400">Verifying permanent URL accessibility</p>
                                </div>
                              ) : (
                                <>
                                  <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                                  <p className="text-sm text-slate-300 font-medium">Click to upload your image</p>
                                  <p className="text-xs text-slate-500 mt-1">JPG, PNG, WebP — stored on permanent cloud CDN</p>
                                </>
                              )}
                            </div>
                          </div>

                          {/* ── Divider ──────────────────────────────────── */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-white/5" />
                            <span className="text-xs text-slate-500 font-medium">OR</span>
                            <div className="flex-1 h-px bg-white/5" />
                          </div>

                          {/* ── Option B: Paste URL → validate ────────────── */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-black">2</span>
                              Paste a public image URL
                            </p>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                  type="url"
                                  value={urlInput}
                                  onChange={handleUrlChange}
                                  onKeyDown={(e) => e.key === 'Enter' && handleValidateUrl()}
                                  placeholder="https://example.com/your-image.jpg"
                                  className="input-field pl-9 text-sm"
                                />
                              </div>
                              <button
                                onClick={handleValidateUrl}
                                disabled={!urlInput.trim() || urlStatus === 'checking'}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-all flex-shrink-0"
                              >
                                {urlStatus === 'checking' ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</>
                                ) : (
                                  <><RefreshCw className="w-3.5 h-3.5" /> Verify URL</>
                                )}
                              </button>
                            </div>

                            {/* URL status feedback */}
                            {urlStatus === 'invalid' && (
                              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>Cannot load this image publicly. Make sure it's a direct link (not a Google Drive share page). Try uploading the file directly above instead.</span>
                              </div>
                            )}

                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              Must be a <strong className="text-slate-400">direct image link</strong> accessible without login. Works with catbox.moe, imgur, Dropbox (dl=1), or your own website.
                            </p>
                          </div>
                        </>
                      )}

                      {/* Confirmed URL info bar */}
                      {confirmedImageUrl && (
                        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold">Image verified & locked in ✅</p>
                            <p className="text-green-300/70 truncate">{confirmedImageUrl}</p>
                          </div>
                          <button onClick={handleClearImage} className="text-slate-400 hover:text-red-400 transition-colors ml-2 flex-shrink-0">
                            Change
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Body Text */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-slate-300">Template Body Message</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setName('special_promotional_offer');
                      setBodyText('Hello {{1}},\n\nWe have an exclusive offer available for you today! Get {{2}} discount on your next order.\n\nReply to claim your spot!');
                    }}
                    className="text-[10px] px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition"
                  >
                    + Promo Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setName('umrah_package_offer');
                      setBodyText('Hello {{1}},\n\nDiscover our exclusive Umrah pilgrimage packages with flight, visa & 5-star hotel included!\n\nContact us today for details.');
                    }}
                    className="text-[10px] px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition"
                  >
                    + Umrah Preset
                  </button>
                </div>
              </div>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="input-field min-h-[150px] resize-y font-sans text-sm"
                placeholder="Write template copy... Use {{1}}, {{2}} for dynamic tags."
              />
              {(() => {
                const vars = [...new Set([...bodyText.matchAll(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]))];
                return (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500">Example: Hello {"{{1}}"}, your class is on {"{{2}}"}.</span>
                    {vars.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-medium">Detected:</span>
                        {vars.map(v => (
                          <span key={v} className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-green-400 font-medium text-[11px]">Static template (No variables)</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Readiness checklist */}
          <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Submission Checklist</p>
            {[
              { ok: !!name, label: 'Template name set' },
              { ok: !!bodyText, label: 'Body text written' },
              { ok: headerType !== 'media' || !!confirmedImageUrl, label: headerType === 'media' ? 'Image verified & ready' : 'Header type: Text (no image needed)' },
            ].map(({ ok, label }) => (
              <div key={label} className={`flex items-center gap-2 text-xs ${ok ? 'text-green-400' : 'text-slate-500'}`}>
                {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />}
                {label}
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="btn-primary w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 font-bold shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? (
                <span className="flex items-center gap-2 animate-pulse">
                  <Clock className="w-4 h-4" /> {loadingStep || 'Submitting...'}
                </span>
              ) : 'Submit to Twilio for WhatsApp Approval'}
            </motion.button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="glass-card p-6 border border-white/10 animate-fadeIn">
            <div className="flex items-start gap-3">
              {result.type === 'error' ? (
                <AlertCircle className="w-6 h-6 text-red-400 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-green-400 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-lg mb-1 ${result.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                  {result.type === 'error' ? 'Submission Failed' : 'Submission Successful!'}
                </h3>
                <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                  {result.type === 'error' ? result.data.error : result.data.message}
                </p>
                {result.type === 'success' && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-3">
                      <span className="px-3 py-1 bg-slate-900 rounded-lg border border-white/5 text-xs font-mono">
                        <span className="text-slate-500 mr-1">SID:</span>
                        <span className="text-white select-all">{result.data.sid}</span>
                      </span>
                      {(() => {
                        const st = result.data.status?.toLowerCase();
                        const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.submitted;
                        return (
                          <span className={`px-3 py-1 rounded-lg border text-xs font-bold ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        );
                      })()}
                    </div>
                    {result.data.mediaUrl && (
                      <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5">
                        <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">Image used in template ✅</p>
                        <a
                          href={result.data.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 truncate"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          {result.data.mediaUrl}
                        </a>
                      </div>
                    )}
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                      <p className="text-xs text-yellow-300 leading-relaxed">
                        <span className="font-bold">⏳ Next step:</span> WhatsApp typically reviews templates within 24–48 hours.
                        Copy your <span className="font-mono font-bold">{result.data.sid}</span> SID and check its approval status in the <strong>Status</strong> tab.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Device Preview */}
      <div className="w-full xl:w-5/12 sticky top-24 flex flex-col items-center">
        <div className="w-full max-w-[340px] aspect-[9/19] bg-black rounded-[40px] p-3 shadow-2xl border-[6px] border-slate-800 relative overflow-hidden">
          {/* Speaker & Camera notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-b-2xl z-20 flex items-center justify-center">
            <div className="w-10 h-1.5 bg-slate-800 rounded-full" />
            <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ml-3 border border-slate-800" />
          </div>

          {/* Screen */}
          <div className="w-full h-full rounded-[30px] overflow-hidden flex flex-col relative bg-slate-950">
            <div className="w-full h-full flex flex-col bg-[#0b141a] text-slate-100 font-sans text-xs">
              <div className="bg-[#1f2c34] pt-6 pb-2 px-3 flex items-center gap-2 border-b border-[#233138]">
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-[10px]">WA</div>
                <div>
                  <div className="font-bold text-[11px]">Twilio Template Approval</div>
                  <div className="text-[9px] text-green-400">Draft Preview</div>
                </div>
              </div>

              <div className="flex-1 p-3 space-y-3 bg-[#0b141a] relative" style={{ backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
                <div className="mx-auto w-fit bg-[#182229] border border-[#233138] text-[#8696a0] py-1 px-2 rounded-lg text-[9px] text-center max-w-[90%]">
                  📝 Template Name: {name || 'unnamed'}
                </div>

                {(bodyText.trim() || localPreview || confirmedImageUrl) && (
                  <div className="bg-[#005c4b] text-[#e9edef] p-2.5 rounded-lg rounded-tr-none ml-auto max-w-[85%] shadow relative animate-fadeIn">
                    {/* Media preview in bubble */}
                    {headerType === 'media' && (localPreview || confirmedImageUrl) && (
                      <img
                        src={localPreview || confirmedImageUrl}
                        alt="Header Preview"
                        className="rounded mb-2 max-w-full h-auto object-cover max-h-[140px] w-full"
                      />
                    )}
                    {headerType === 'media' && !localPreview && !confirmedImageUrl && (
                      <div className="bg-black/20 p-6 rounded flex flex-col items-center gap-2 mb-2 text-[#8696a0]">
                        <ImageIcon className="w-6 h-6 text-slate-500" />
                        <p className="text-[9px]">Upload or verify image first</p>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap leading-relaxed text-[11px]">
                      {bodyText || 'Type body text...'}
                    </p>

                    <div className="text-right text-[8px] text-[#8696a0] mt-1 flex items-center justify-end gap-0.5">
                      <span>12:00 PM</span>
                      <span className="text-sky-400 font-bold">✓✓</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Device Label */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 font-medium">
          <Eye className="w-4 h-4 text-green-400" />
          <span>Real-time Template Submission Preview</span>
        </div>

        {/* Image status badge */}
        {headerType === 'media' && (
          <div className={`mt-3 flex items-center gap-2 text-xs px-4 py-2 rounded-xl border font-medium ${
            confirmedImageUrl
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : uploadingImage
              ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-slate-800 border-white/5 text-slate-400'
          }`}>
            {confirmedImageUrl ? (
              <><ShieldCheck className="w-3.5 h-3.5" /> Your image is verified & will be sent</>
            ) : uploadingImage ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
            ) : (
              <><AlertCircle className="w-3.5 h-3.5" /> No image confirmed yet</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
