import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, UploadCloud, Users, Image as ImageIcon, AlertCircle, FileText, CheckCircle2, Eye, ShieldCheck, XCircle, ExternalLink, Wrench, Loader2, RefreshCw, Cloud } from 'lucide-react';
import toast from 'react-hot-toast';

const BASE = '';

export default function SendTab({ onOpenStorageSettings }) {
  const [numbers, setNumbers] = useState('');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [files, setFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateVars, setTemplateVars] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // ── Fix-expired-template state ─────────────────────────────────────────────
  const [showFix, setShowFix] = useState(false);
  const [fixFile, setFixFile] = useState(null);
  const [fixPreview, setFixPreview] = useState(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const fixFileRef = useRef(null);

  useEffect(() => {
    fetch(BASE + '/api/templates')
      .then(res => res.json())
      .then(data => { if (data.templates) setTemplates(data.templates); })
      .catch(err => console.error('Failed to load templates:', err));
  }, []);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    const previews = selectedFiles.map(file =>
      file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    );
    setFilePreviews(previews);
  };

  // ── Derive active template object ─────────────────────────────────────────
  const activeTemplate = selectedTemplate ? templates.find(t => t.sid === selectedTemplate) : null;
  const templateMediaUrl = activeTemplate?.mediaUrl || null;
  const isPlaceholderImage = activeTemplate?.isPlaceholderImage || false;
  const hasExpiredMedia = activeTemplate?.hasExpiredMedia || false;
  const hasMediaIssue = isPlaceholderImage || hasExpiredMedia;

  // ── Get active template body with vars substituted ─────────────────────────
  const getActiveTemplateBody = () => {
    if (!activeTemplate) return '';
    let body = activeTemplate.body || '';
    if (templateVars) {
      try {
        const vars = JSON.parse(templateVars);
        Object.keys(vars).forEach(key => {
          body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), vars[key]);
        });
      } catch (e) {}
    }
    return body;
  };

  // ── Fix expired template: upload new image + clone template ───────────────
  const handleFixTemplate = async () => {
    if (!activeTemplate) return;
    if (!fixFile) {
      toast.error('Please select a new image first.');
      return;
    }
    setFixLoading(true);
    setFixResult(null);
    const toastId = toast.loading('Uploading permanent image and recreating template...');
    try {
      const formData = new FormData();
      formData.append('oldSid', activeTemplate.sid);
      formData.append('deleteOld', 'false'); // keep old for safety
      formData.append('file', fixFile);

      const res = await fetch(BASE + '/api/fix-template', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fix failed');

      setFixResult(data);
      toast.success(`New template created: ${data.newName}`, { id: toastId });

      // Refresh template list so the new one appears
      fetch(BASE + '/api/templates').then(r => r.json()).then(d => { if (d.templates) setTemplates(d.templates); });
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setFixLoading(false);
    }
  };

  const handleSend = async () => {
    // Block send if the template has a placeholder/wrong image
    if (activeTemplate && hasMediaIssue) {
      toast.error(
        isPlaceholderImage
          ? 'Sending blocked: This template uses a placeholder (owl) image. Recreate it with your actual image.'
          : 'Sending blocked: This template has an expired media URL. Recreate it with a valid image.'
      );
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    const uniqueNumbers = [...new Set(numbers.split(',').map(n => n.trim()).filter(n => n))].join(',');
    formData.append('numbers', uniqueNumbers);
    formData.append('channel', channel);

    if (selectedTemplate) {
      formData.append('contentSid', selectedTemplate);
      if (templateVars) {
        formData.append('contentVariables', templateVars);
      }
      formData.append('templateBody', getActiveTemplateBody());
      // Always send the template's mediaUrl so the server can guard against placeholder images
      if (templateMediaUrl) {
        formData.append('templateMediaUrl', templateMediaUrl);
      }
    } else {
      formData.append('message', message);
      files.forEach(f => { formData.append('files', f); });
    }

    try {
      const response = await fetch(BASE + '/api/send-whatsapp', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult({ type: response.ok ? 'success' : 'error', data });
      if (response.ok) {
        toast.success(`Queued ${data.success} message(s) to Twilio!`);

        // Live check delivery status after 2.5 seconds
        const allSids = data.results?.flatMap(r => r.sids || (r.sid ? [r.sid] : [])).filter(Boolean);
        if (allSids.length > 0) {
          setTimeout(async () => {
            try {
              const statusRes = await fetch(BASE + `/api/message-status?sids=${allSids.join(',')}`);
              const statusData = await statusRes.json();
              if (statusData.statuses) {
                setResult(prev => {
                  if (!prev || !prev.data) return prev;
                  const updatedResults = prev.data.results.map(r => {
                    const found = statusData.statuses.find(s => (r.sids || []).includes(s.sid) || r.sid === s.sid);
                    if (found) {
                      return {
                        ...r,
                        liveStatus: found.status,
                        errorCode: found.errorCode,
                        errorMessage: found.errorMessage,
                        success: found.status !== 'failed' && found.status !== 'undelivered' && found.status !== 'error'
                      };
                    }
                    return r;
                  });
                  return {
                    ...prev,
                    data: {
                      ...prev.data,
                      results: updatedResults,
                      success: updatedResults.filter(u => u.success).length,
                      failed: updatedResults.filter(u => !u.success).length
                    }
                  };
                });
              }
            } catch (e) {
              console.error('Error fetching live statuses:', e);
            }
          }, 2500);
        }
      } else {
        toast.error(`Error: ${data.error || 'Failed to send campaign'}`);
      }
    } catch (err) {
      setResult({ type: 'error', data: { error: err.message } });
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const canSend = !loading && numbers.trim() && (
    (selectedTemplate && !hasMediaIssue) ||
    (!selectedTemplate && (message.trim() || files.length > 0))
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col xl:flex-row gap-8 items-start w-full"
    >
      {/* Configuration Panel */}
      <div className="w-full xl:w-7/12 space-y-6">
        <div className="glass-card p-6 md:p-8 space-y-6 relative overflow-hidden shadow-[0_0_40px_rgba(34,197,94,0.1)] border border-white/10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">New Campaign</h2>
                <p className="text-xs text-slate-400">Broadcast your message in seconds</p>
              </div>
            </div>

            {/* Channel Toggle */}
            <div className="flex bg-slate-950/60 p-1 rounded-xl border border-white/5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => { setChannel('whatsapp'); setSelectedTemplate(''); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${channel === 'whatsapp' ? 'bg-green-500 text-slate-900 shadow-lg shadow-green-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => { setChannel('sms'); setSelectedTemplate(''); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${channel === 'sms' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                SMS Text
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {/* Recipients */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-400" /> Recipients
                </label>
                <span className="text-xs text-slate-400">Comma-separated, with country codes</span>
              </div>
              <textarea
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                className="input-field min-h-[90px] resize-y"
                placeholder="+1234567890, +9876543210..."
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Valid format: +[country_code][number]</span>
                <span className="font-semibold text-green-400">{numbers ? numbers.split(',').filter(n => n.trim()).length : 0} Numbers loaded</span>
              </div>
            </div>

            {/* Template Selection (WhatsApp only) */}
            {channel === 'whatsapp' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-400" /> WhatsApp Template
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        toast.loading('Refreshing templates from Twilio...', { id: 'ref-tmpl' });
                        fetch(BASE + '/api/templates')
                          .then(res => res.json())
                          .then(data => {
                            if (data.templates) setTemplates(data.templates);
                            toast.success('Templates refreshed!', { id: 'ref-tmpl' });
                          })
                          .catch(() => toast.error('Failed to refresh templates', { id: 'ref-tmpl' }));
                      }}
                      className="text-[11px] text-green-400 hover:text-green-300 flex items-center gap-1 font-medium transition"
                    >
                      <span>↻ Refresh List</span>
                    </button>
                  </div>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => {
                      const sid = e.target.value;
                      setSelectedTemplate(sid);
                      const tmpl = templates.find(t => t.sid === sid);
                      if (tmpl) {
                        const vars = tmpl.variables && tmpl.variables.length > 0
                          ? tmpl.variables
                          : [...(tmpl.body || '').matchAll(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]);
                        const initialVars = {};
                        [...new Set(vars)].forEach(v => { initialVars[v] = ''; });
                        setTemplateVars(Object.keys(initialVars).length > 0 ? JSON.stringify(initialVars, null, 2) : '');
                      } else {
                        setTemplateVars('');
                      }
                    }}
                    className="input-field cursor-pointer bg-slate-900"
                  >
                    <option value="">-- Direct Freeform Message (Within 24h Window) --</option>
                    {templates.map(t => (
                      <option key={t.sid} value={t.sid}>{t.label || t.name || t.sid}</option>
                    ))}
                  </select>
                </div>

                {/* ── Active template detail panel ─────────────────────────────── */}
                {activeTemplate && (() => {
                  const vars = activeTemplate.variables && activeTemplate.variables.length > 0
                    ? activeTemplate.variables
                    : [...(activeTemplate.body || '').matchAll(/\{\{(\d+|[a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]);
                  const uniqueVars = [...new Set(vars)];
                  let parsedJson = {};
                  try { parsedJson = JSON.parse(templateVars || '{}'); } catch (e) {}

                  return (
                    <div className="space-y-3 animate-fadeIn">

                      {/* ── Image that will be sent panel ─────────────────── */}
                      {templateMediaUrl && (
                        <div className={`rounded-xl border overflow-hidden ${hasMediaIssue ? 'border-red-500/40 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
                          <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${hasMediaIssue ? 'border-red-500/20 bg-red-500/10' : 'border-green-500/20 bg-green-500/10'}`}>
                            {hasMediaIssue ? (
                              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
                            )}
                            <span className={`text-xs font-bold ${hasMediaIssue ? 'text-red-400' : 'text-green-400'}`}>
                              {hasMediaIssue
                                ? isPlaceholderImage
                                  ? '⚠️ Wrong Image — Template uses placeholder (owl)'
                                  : '⚠️ Expired Image URL — Image link is no longer valid'
                                : '📸 Image that will be delivered to recipients'}
                            </span>
                            <a
                              href={templateMediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto text-slate-500 hover:text-slate-300 transition"
                              title="Open image in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="p-3 space-y-3">
                            <img
                              src={templateMediaUrl}
                              alt="Template image"
                              className={`w-full max-h-40 object-cover rounded-lg ${hasMediaIssue ? 'opacity-40 grayscale' : ''}`}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            {hasMediaIssue && !fixResult && (
                              <div className="space-y-3">
                                <div className="text-xs rounded-lg p-3 bg-red-500/10 text-red-300 border border-red-500/20">
                                  {isPlaceholderImage
                                    ? '🚫 Template uses demo owl image. Upload your real image below to recreate it.'
                                    : '🔗 The image URL in this template has expired and can no longer be loaded. Upload a replacement image below — a new template with a permanent URL will be created and submitted for re-approval.'}
                                </div>

                                {/* Fix panel */}
                                <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden">
                                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-orange-500/20 bg-orange-500/10">
                                    <Wrench className="w-4 h-4 text-orange-400" />
                                    <span className="text-xs font-bold text-orange-400">🔧 Fix This Template — Upload Replacement Image</span>
                                    <div className="ml-auto flex items-center gap-2">
                                      {onOpenStorageSettings && (
                                        <button
                                          type="button"
                                          onClick={onOpenStorageSettings}
                                          className="text-[11px] text-indigo-300 hover:text-white border border-indigo-500/30 px-2 py-0.5 rounded-lg transition flex items-center gap-1 bg-indigo-500/10"
                                        >
                                          <Cloud className="w-3 h-3 text-indigo-400" /> Storage Settings
                                        </button>
                                      )}
                                      <button
                                        onClick={() => setShowFix(v => !v)}
                                        className="text-xs text-orange-300 hover:text-white border border-orange-500/30 px-2 py-0.5 rounded-lg transition"
                                      >{showFix ? 'Collapse' : 'Open Fix Panel'}</button>
                                    </div>
                                  </div>

                                  <AnimatePresence>
                                    {showFix && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="p-4 space-y-3">
                                          <p className="text-xs text-slate-400">Upload your flyer/image — it will be permanently stored on your configured Cloud Storage (Cloudinary, Firebase, ImgBB, Supabase, or Catbox) and a new template with the same text will be submitted for WhatsApp approval.</p>

                                          {/* Image picker */}
                                          <div
                                            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${fixFile ? 'border-orange-500/60 bg-orange-500/5' : 'border-white/10 hover:border-orange-500/40'}`}
                                            onClick={() => fixFileRef.current?.click()}
                                          >
                                            <input
                                              ref={fixFileRef}
                                              type="file"
                                              accept="image/*"
                                              className="hidden"
                                              onChange={e => {
                                                const f = e.target.files?.[0];
                                                if (!f) return;
                                                setFixFile(f);
                                                setFixPreview(URL.createObjectURL(f));
                                              }}
                                            />
                                            {fixPreview ? (
                                              <img src={fixPreview} alt="preview" className="mx-auto max-h-32 rounded-lg object-contain" />
                                            ) : (
                                              <>
                                                <UploadCloud className="w-7 h-7 text-slate-500 mx-auto mb-1" />
                                                <p className="text-xs text-slate-300">Click to select replacement image</p>
                                              </>
                                            )}
                                          </div>

                                          {fixFile && (
                                            <p className="text-xs text-orange-300 font-medium">📎 {fixFile.name} selected</p>
                                          )}

                                          <button
                                            onClick={handleFixTemplate}
                                            disabled={!fixFile || fixLoading}
                                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
                                          >
                                            {fixLoading ? (
                                              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading & Recreating Template...</>
                                            ) : (
                                              <><Wrench className="w-4 h-4" /> Upload Image & Fix Template</>
                                            )}
                                          </button>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            )}

                            {/* Fix success result */}
                            {fixResult && (
                              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-2">
                                <p className="text-sm font-bold text-green-400">✅ Template Fixed & Submitted!</p>
                                <p className="text-xs text-slate-300">{fixResult.message}</p>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-400">New SID:</span>
                                  <span className="font-mono text-white select-all">{fixResult.newSid}</span>
                                </div>
                                <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                                  ⏳ Wait 24-48 hrs for WhatsApp to approve the new template, then select it from the dropdown to broadcast.
                                </div>
                                <button
                                  onClick={() => { setFixResult(null); setFixFile(null); setFixPreview(null); setShowFix(false); }}
                                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                                ><RefreshCw className="w-3 h-3" /> Dismiss</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Template body / status */}
                      <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Template Text Schema:</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            activeTemplate.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {activeTemplate.status || 'unsubmitted'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {activeTemplate.body || 'No template body text found'}
                        </p>
                      </div>

                      {/* Variable fill fields */}
                      {uniqueVars.length > 0 ? (
                        <div className="bg-slate-900/60 p-4 rounded-xl border border-white/10 space-y-3">
                          <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <span className="text-green-400">⚡</span> Fill Template Variables:
                          </p>
                          <div className="grid grid-cols-1 gap-2.5">
                            {uniqueVars.map((varName) => (
                              <div key={varName} className="space-y-1">
                                <label className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                  <span>Tag {`{{${varName}}}`}:</span>
                                </label>
                                <input
                                  type="text"
                                  placeholder={`Value for {{${varName}}} (e.g. Customer Name)`}
                                  value={parsedJson[varName] || ''}
                                  onChange={(e) => {
                                    const updated = { ...parsedJson, [varName]: e.target.value };
                                    setTemplateVars(JSON.stringify(updated, null, 2));
                                  }}
                                  className="input-field text-xs py-2"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs text-green-300 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span>Static Template — Ready to broadcast directly without extra variables!</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Freeform message section */}
            {!selectedTemplate && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Message Body</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input-field min-h-[120px] resize-y"
                    placeholder={channel === 'sms' ? 'Type your SMS content here...' : 'Type WhatsApp body text...'}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-green-400" /> Media Attachments (Images, PDFs)
                  </label>
                  <div className="border-2 border-dashed border-white/10 hover:border-green-500/40 rounded-xl p-4 transition-all bg-slate-950/20 text-center relative cursor-pointer">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-300">Click to upload files or drag and drop</p>
                    <p className="text-xs text-slate-500 mt-1">Images, PDFs, Videos up to 16MB</p>
                  </div>

                  {files.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {files.map((f, i) => (
                        <span key={i} className="text-xs bg-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-1 border border-white/5 text-slate-300">
                          <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span className="max-w-[120px] truncate">{f.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <motion.button
              whileHover={{ scale: canSend ? 1.02 : 1 }}
              whileTap={{ scale: canSend ? 0.98 : 1 }}
              onClick={handleSend}
              disabled={!canSend}
              className={`btn-primary w-full mt-6 h-12 text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                channel === 'sms'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20'
                  : hasMediaIssue
                  ? 'bg-gradient-to-r from-red-700 to-red-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-500/20'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2 animate-pulse">
                  Sending campaign...
                </span>
              ) : hasMediaIssue ? (
                <><XCircle className="w-4 h-4" /> Blocked — Fix Template Image First</>
              ) : (
                <><Send className="w-4 h-4" /> Launch {channel === 'sms' ? 'SMS' : 'WhatsApp'} Campaign</>
              )}
            </motion.button>
          </div>
        </div>

        {/* Results Panel */}
        {result && (
          <div className="glass-card p-6 border border-white/10 animate-fadeIn">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-5">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h2 className="text-lg font-bold text-white">Campaign Execution Logs</h2>
            </div>

            {result.type === 'error' ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold mb-0.5">Execution Failed</h3>
                  <p className="text-sm">{result.data.error || 'Server error occurred'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900/60 rounded-xl p-3 text-center border border-white/5">
                    <div className="text-2xl font-bold text-white">{result.data.total}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Total</div>
                  </div>
                  <div className="bg-green-500/10 rounded-xl p-3 text-center border border-green-500/20">
                    <div className="text-2xl font-bold text-green-400">{result.data.success}</div>
                    <div className="text-[10px] text-green-500/70 uppercase tracking-wider mt-0.5">Delivered</div>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-3 text-center border border-red-500/20">
                    <div className="text-2xl font-bold text-red-400">{result.data.failed}</div>
                    <div className="text-[10px] text-red-500/70 uppercase tracking-wider mt-0.5">Failed</div>
                  </div>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {result.data.results?.map((r, i) => (
                    <div key={i} className={`p-3 rounded-xl border text-xs flex items-center justify-between ${r.success ? 'bg-green-500/5 border-green-500/10 text-green-400' : 'bg-red-500/5 border-red-500/10 text-red-400'}`}>
                      <span className="font-mono">{r.number}</span>
                      {r.success ? (
                        <span>Success ({r.sid?.substring(0, 10)}...)</span>
                      ) : (
                        <span className="truncate max-w-[200px]" title={r.error}>{r.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Phone Preview */}
      <div className="w-full xl:w-5/12 sticky top-24 flex flex-col items-center">
        <div className="w-full max-w-[340px] aspect-[9/19] bg-black rounded-[40px] p-3 shadow-2xl border-[6px] border-slate-800 relative overflow-hidden">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-b-2xl z-20 flex items-center justify-center">
            <div className="w-10 h-1.5 bg-slate-800 rounded-full" />
            <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ml-3 border border-slate-800" />
          </div>

          <div className="w-full h-full rounded-[30px] overflow-hidden flex flex-col relative bg-slate-950">
            {channel === 'whatsapp' ? (
              <div className="w-full h-full flex flex-col bg-[#0b141a] text-slate-100 font-sans text-xs">
                {/* WA Header */}
                <div className="bg-[#1f2c34] pt-6 pb-2 px-3 flex items-center gap-2 border-b border-[#233138]">
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-[10px]">WA</div>
                  <div>
                    <div className="font-bold text-[11px]">Twilio Business Profile</div>
                    <div className="text-[9px] text-[#8696a0]">Online</div>
                  </div>
                </div>

                {/* Chat */}
                <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-[#0b141a] relative" style={{ backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
                  <div className="mx-auto w-fit bg-[#182229] border border-[#233138] text-[#8696a0] py-1 px-2 rounded-lg text-[9px] text-center max-w-[90%]">
                    🔒 Messages are end-to-end encrypted.
                  </div>

                  {(message.trim() || filePreviews.length > 0 || selectedTemplate) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      className="bg-[#005c4b] text-[#e9edef] p-2.5 rounded-lg rounded-tr-none ml-auto max-w-[85%] shadow relative"
                    >
                      {/* Freeform image previews */}
                      {filePreviews.map((src, idx) => src && (
                        <img key={idx} src={src} alt="Upload preview" className="rounded mb-2 max-w-full h-auto object-cover max-h-[140px] w-full" />
                      ))}

                      {/* Template image — show with warning overlay if bad */}
                      {selectedTemplate && templateMediaUrl && (
                        <div className="relative mb-2">
                          <img
                            src={templateMediaUrl}
                            alt="Template image"
                            className={`rounded max-w-full h-auto object-cover max-h-[140px] w-full ${hasMediaIssue ? 'opacity-40 grayscale' : ''}`}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          {hasMediaIssue && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded">
                              <span className="text-[9px] text-red-300 font-bold text-center px-2">
                                {isPlaceholderImage ? '⚠️ Wrong image\n(owl placeholder)' : '⚠️ Expired URL'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Non-image file placeholders */}
                      {files.map((file, idx) => !file.type.startsWith('image/') && (
                        <div key={idx} className="bg-black/20 p-2 rounded flex items-center gap-2 mb-2">
                          <ImageIcon className="w-5 h-5 text-green-400" />
                          <div className="truncate max-w-[150px]">
                            <p className="truncate font-semibold text-[10px]">{file.name}</p>
                            <p className="text-[8px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                      ))}

                      <p className="whitespace-pre-wrap leading-relaxed text-[11px]">
                        {selectedTemplate ? getActiveTemplateBody() : message || 'Empty message...'}
                      </p>

                      <div className="text-right text-[8px] text-[#8696a0] mt-1 flex items-center justify-end gap-0.5">
                        <span>12:00 PM</span>
                        <span className="text-sky-400 font-bold">✓✓</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col bg-black text-slate-100 font-sans text-xs">
                <div className="bg-slate-900/90 pt-6 pb-2.5 px-3 flex items-center justify-between border-b border-white/5">
                  <div className="text-center w-full font-semibold text-[11px] text-slate-300">+1 424 497-4482</div>
                </div>
                <div className="flex-1 p-3 space-y-3 bg-black">
                  {message.trim() && (
                    <>
                      <div className="bg-[#007aff] text-white p-2.5 rounded-2xl rounded-tr-none ml-auto max-w-[80%] shadow animate-fadeIn">
                        <p className="whitespace-pre-wrap leading-relaxed text-[11px]">{message}</p>
                      </div>
                      <div className="text-right text-[8px] text-slate-500 pr-1">Delivered</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Device label */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 font-medium">
          <Eye className="w-4 h-4 text-green-400" />
          <span>Real-time Live {channel === 'sms' ? 'SMS' : 'WhatsApp'} Preview</span>
        </div>

        {/* Image status badge below phone */}
        {selectedTemplate && templateMediaUrl && (
          <div className={`mt-3 text-xs px-4 py-2 rounded-xl border font-medium flex items-center gap-2 max-w-[340px] w-full ${
            hasMediaIssue
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-green-500/10 border-green-500/20 text-green-400'
          }`}>
            {hasMediaIssue
              ? <><XCircle className="w-3.5 h-3.5 flex-shrink-0" /> {isPlaceholderImage ? 'Wrong image (owl) — recreate template' : 'Expired image URL'}</>
              : <><ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" /> Your image will be delivered ✓</>
            }
          </div>
        )}
      </div>
    </motion.div>
  );
}
