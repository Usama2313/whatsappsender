import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  X,
  Zap,
  Loader2,
  Save,
  ExternalLink,
  Shield,
  Server,
  Database,
  Image as ImageIcon,
  Key,
  Globe,
  HelpCircle,
  ChevronRight,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const API = '';

const PROVIDER_OPTIONS = [
  {
    id: 'auto',
    name: 'Automatic Multi-Cloud',
    badge: 'Recommended',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    description: 'Automatically uses your configured cloud providers (Cloudinary, Firebase, ImgBB, Supabase), with Catbox permanent backup.',
    icon: Zap,
    color: 'from-indigo-600 to-purple-600',
  },
  {
    id: 'cloudinary',
    name: 'Cloudinary CDN',
    badge: '25GB Free Permanent',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    description: 'Fast global CDN, high throughput, never expires. Ideal for marketing flyers.',
    icon: Cloud,
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 'firebase',
    name: 'Firebase / Google Cloud',
    badge: 'Google Official',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description: 'Store directly in your Google Cloud / Firebase Storage bucket with permanent download tokens.',
    icon: Database,
    color: 'from-amber-600 to-orange-600',
  },
  {
    id: 'imgbb',
    name: 'ImgBB API',
    badge: '1-Min Setup',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: '100% free permanent image hosting with direct image CDN URLs. Instant setup.',
    icon: ImageIcon,
    color: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'supabase',
    name: 'Supabase Storage',
    badge: 'S3-Compatible',
    badgeColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    description: 'Enterprise PostgreSQL + S3 permanent public bucket storage.',
    icon: Server,
    color: 'from-green-600 to-emerald-700',
  },
  {
    id: 's3',
    name: 'AWS S3 / Cloudflare R2',
    badge: 'Enterprise',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    description: 'Direct S3 or zero-egress Cloudflare R2 bucket integration.',
    icon: Globe,
    color: 'from-orange-600 to-red-600',
  },
];

export default function StorageSettingsModal({ isOpen, onClose, onConfigSaved }) {
  const [activeTab, setActiveTab] = useState('auto');
  const [activeProvider, setActiveProvider] = useState('auto');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Form states
  const [cloudinaryConfig, setCloudinaryConfig] = useState({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    uploadPreset: '',
    isConfigured: false,
  });

  const [firebaseConfig, setFirebaseConfig] = useState({
    bucket: '',
    apiKey: '',
    isConfigured: false,
  });

  const [imgbbConfig, setImgbbConfig] = useState({
    apiKey: '',
    isConfigured: false,
  });

  const [supabaseConfig, setSupabaseConfig] = useState({
    url: '',
    key: '',
    bucket: 'public-media',
    isConfigured: false,
  });

  const [s3Config, setS3Config] = useState({
    bucket: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: '',
    endpoint: '',
    publicUrl: '',
    isConfigured: false,
  });

  const [publicServerUrl, setPublicServerUrl] = useState('');

  // Load configuration from backend on mount or when opened
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  async function loadConfig() {
    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/storage/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.config) {
        const c = data.config;
        setActiveProvider(c.activeProvider || 'auto');
        setActiveTab(c.activeProvider || 'auto');

        if (c.cloudinary) setCloudinaryConfig(c.cloudinary);
        if (c.firebase) setFirebaseConfig(c.firebase);
        if (c.imgbb) setImgbbConfig(c.imgbb);
        if (c.supabase) setSupabaseConfig(c.supabase);
        if (c.s3) setS3Config(c.s3);
        if (c.publicServerUrl) setPublicServerUrl(c.publicServerUrl);
      }
    } catch (err) {
      console.error('Failed to load storage config:', err);
      toast.error('Failed to load storage configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        activeProvider,
        cloudinary: cloudinaryConfig,
        firebase: firebaseConfig,
        imgbb: imgbbConfig,
        supabase: supabaseConfig,
        s3: s3Config,
        publicServerUrl,
      };

      const res = await fetch(`${API}/api/storage/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save settings');
      }

      toast.success('Storage settings saved successfully!');
      if (onConfigSaved) onConfigSaved();
      loadConfig();
    } catch (err) {
      toast.error(err.message || 'Error saving storage configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(providerToTest) {
    setTesting(true);
    setTestResult(null);

    const targetProvider = providerToTest || activeTab;

    try {
      const res = await fetch(`${API}/api/storage/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: targetProvider,
          customConfig: {
            cloudinary: cloudinaryConfig,
            firebase: firebaseConfig,
            imgbb: imgbbConfig,
            supabase: supabaseConfig,
            s3: s3Config,
            publicServerUrl,
          }
        }),
      });

      const data = await res.json();
      setTestResult(data);

      if (data.success) {
        toast.success(`Upload verified on ${data.provider.toUpperCase()} (${data.latencyMs}ms)!`);
      } else {
        toast.error(`Upload test failed: ${data.error}`);
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || 'Test network error',
      });
      toast.error('Test failed: ' + err.message);
    } finally {
      setTesting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Permanent Cloud Image Storage</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  WhatsApp Flyer Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                WhatsApp templates require permanent, immutable public image URLs that never expire.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Provider Sidebar */}
          <div className="w-64 border-r border-slate-800 bg-slate-950/40 p-3 space-y-1.5 overflow-y-auto">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-3 py-1">
              Storage Providers
            </p>
            {PROVIDER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = activeTab === opt.id;
              const isActiveEngine = activeProvider === opt.id;

              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    setActiveTab(opt.id);
                    setTestResult(null);
                  }}
                  className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1 border ${
                    isSelected
                      ? 'bg-slate-800/90 border-indigo-500/50 text-white shadow-lg'
                      : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-semibold">{opt.name}</span>
                    </div>
                    {isActiveEngine && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${opt.badgeColor}`}>
                      {opt.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tab Form Content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400">Loading storage credentials...</p>
              </div>
            ) : (
              <>
                {/* Active Provider Banner */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Active Upload Engine:</span>
                        <span className="uppercase text-emerald-400 font-mono tracking-wider">
                          {activeProvider}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        New templates and flyer uploads will be uploaded to this provider.
                      </p>
                    </div>
                  </div>
                  {activeProvider !== activeTab && (
                    <button
                      onClick={() => setActiveProvider(activeTab)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                    >
                      Set as Active
                    </button>
                  )}
                </div>

                {/* TAB 1: Auto */}
                {activeTab === 'auto' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 space-y-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-indigo-400" />
                        <h3 className="text-sm font-bold text-white">Automatic Multi-Cloud Failover</h3>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        In Automatic mode, the server inspects which providers you have configured credentials for and tries them in order of best performance:
                      </p>
                      <ol className="text-xs text-slate-300 space-y-1.5 pl-4 list-decimal">
                        <li><strong className="text-indigo-300">Cloudinary</strong> (if configured): ultra-fast CDN with permanent asset links.</li>
                        <li><strong className="text-amber-300">Firebase Storage / GCS</strong> (if configured): Google Cloud official storage bucket.</li>
                        <li><strong className="text-emerald-300">ImgBB</strong> (if configured): permanent direct hosting with zero configuration hassle.</li>
                        <li><strong className="text-green-300">Supabase Storage</strong> (if configured): AWS S3-backed public bucket.</li>
                        <li><strong className="text-purple-300">Catbox.moe</strong>: permanent direct link fallback (no account required).</li>
                      </ol>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-3">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Current Status of Configured Providers
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-300">Cloudinary</span>
                          {cloudinaryConfig.isConfigured ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
                          ) : (
                            <span className="text-slate-500">Not set</span>
                          )}
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-300">Firebase / GCS</span>
                          {firebaseConfig.isConfigured ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
                          ) : (
                            <span className="text-slate-500">Not set</span>
                          )}
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-300">ImgBB</span>
                          {imgbbConfig.isConfigured ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
                          ) : (
                            <span className="text-slate-500">Not set</span>
                          )}
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                          <span className="text-slate-300">Supabase</span>
                          {supabaseConfig.isConfigured ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
                          ) : (
                            <span className="text-slate-500">Not set</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Cloudinary */}
                {activeTab === 'cloudinary' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span>Cloudinary offers 25GB of permanent CDN storage for free. Direct links never expire.</span>
                      </div>
                      <a
                        href="https://cloudinary.com/users/register_free"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-semibold text-blue-200 hover:underline flex-shrink-0 ml-2"
                      >
                        Sign Up Free <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Cloud Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={cloudinaryConfig.cloudName || ''}
                          onChange={(e) => setCloudinaryConfig({ ...cloudinaryConfig, cloudName: e.target.value })}
                          placeholder="e.g. dxyz1234"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Upload Preset (Recommended — Unsigned)
                        </label>
                        <input
                          type="text"
                          value={cloudinaryConfig.uploadPreset || ''}
                          onChange={(e) => setCloudinaryConfig({ ...cloudinaryConfig, uploadPreset: e.target.value })}
                          placeholder="e.g. whatsapp_uploads"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          In Cloudinary Console &gt; Settings &gt; Upload &gt; Add upload preset &gt; set Signing Mode to <strong>Unsigned</strong>.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">API Key (Optional)</label>
                          <input
                            type="text"
                            value={cloudinaryConfig.apiKey || ''}
                            onChange={(e) => setCloudinaryConfig({ ...cloudinaryConfig, apiKey: e.target.value })}
                            placeholder="e.g. 123456789012345"
                            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">API Secret (Optional)</label>
                          <input
                            type="password"
                            value={cloudinaryConfig.apiSecret || ''}
                            onChange={(e) => setCloudinaryConfig({ ...cloudinaryConfig, apiSecret: e.target.value })}
                            placeholder="••••••••"
                            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Firebase / GCS */}
                {activeTab === 'firebase' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span>Stores media in your Firebase / Google Cloud Storage bucket with permanent token URLs.</span>
                      </div>
                      <a
                        href="https://console.firebase.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-semibold text-amber-200 hover:underline flex-shrink-0 ml-2"
                      >
                        Firebase Console <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Firebase Storage Bucket <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={firebaseConfig.bucket || ''}
                          onChange={(e) => setFirebaseConfig({ ...firebaseConfig, bucket: e.target.value })}
                          placeholder="e.g. your-project-id.firebasestorage.app or your-project-id.appspot.com"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Copy the bucket URL from Firebase Console &gt; Storage.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Web API Key (Optional)
                        </label>
                        <input
                          type="password"
                          value={firebaseConfig.apiKey || ''}
                          onChange={(e) => setFirebaseConfig({ ...firebaseConfig, apiKey: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: ImgBB */}
                {activeTab === 'imgbb' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span>ImgBB provides 100% free permanent direct image URLs without expiration.</span>
                      </div>
                      <a
                        href="https://api.imgbb.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-semibold text-emerald-200 hover:underline flex-shrink-0 ml-2"
                      >
                        Get Free API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        ImgBB API Key <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="password"
                        value={imgbbConfig.apiKey || ''}
                        onChange={(e) => setImgbbConfig({ ...imgbbConfig, apiKey: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Visit <a href="https://api.imgbb.com/" target="_blank" rel="noreferrer" className="text-indigo-400 underline">api.imgbb.com</a>, click &quot;Get API Key&quot;, and copy-paste it here.
                      </p>
                    </div>
                  </div>
                )}

                {/* TAB 5: Supabase */}
                {activeTab === 'supabase' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-300">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 flex-shrink-0" />
                        <span>Supabase Storage includes 1GB permanent S3 storage on the free tier.</span>
                      </div>
                      <a
                        href="https://supabase.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-semibold text-green-200 hover:underline flex-shrink-0 ml-2"
                      >
                        Supabase Console <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Supabase Project URL <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={supabaseConfig.url || ''}
                          onChange={(e) => setSupabaseConfig({ ...supabaseConfig, url: e.target.value })}
                          placeholder="https://xyzproject.supabase.co"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          API Key (Anon / Service Role) <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="password"
                          value={supabaseConfig.key || ''}
                          onChange={(e) => setSupabaseConfig({ ...supabaseConfig, key: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Bucket Name</label>
                        <input
                          type="text"
                          value={supabaseConfig.bucket || 'public-media'}
                          onChange={(e) => setSupabaseConfig({ ...supabaseConfig, bucket: e.target.value })}
                          placeholder="public-media"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 6: S3 / R2 */}
                {activeTab === 's3' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Bucket Name</label>
                        <input
                          type="text"
                          value={s3Config.bucket || ''}
                          onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                          placeholder="my-whatsapp-flyers"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Region</label>
                        <input
                          type="text"
                          value={s3Config.region || 'us-east-1'}
                          onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                          placeholder="us-east-1 or auto"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Access Key ID</label>
                        <input
                          type="text"
                          value={s3Config.accessKeyId || ''}
                          onChange={(e) => setS3Config({ ...s3Config, accessKeyId: e.target.value })}
                          placeholder="AKIA..."
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Secret Access Key</label>
                        <input
                          type="password"
                          value={s3Config.secretAccessKey || ''}
                          onChange={(e) => setS3Config({ ...s3Config, secretAccessKey: e.target.value })}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Endpoint (Optional — for Cloudflare R2 / MinIO)</label>
                      <input
                        type="text"
                        value={s3Config.endpoint || ''}
                        onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
                        placeholder="https://<account_id>.r2.cloudflarestorage.com"
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* Test Result Display Box */}
                {testResult && (
                  <div
                    className={`p-4 rounded-xl border text-xs space-y-2 ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5">
                        {testResult.success ? (
                          <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Upload Test Passed!</>
                        ) : (
                          <><AlertCircle className="w-4 h-4 text-red-400" /> Upload Test Failed</>
                        )}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ⚡ {testResult.latencyMs}ms
                      </span>
                    </div>

                    {testResult.success ? (
                      <div className="space-y-1 text-slate-300">
                        <p>{testResult.message}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">URL:</span>
                          <a
                            href={testResult.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-emerald-400 underline truncate max-w-sm"
                          >
                            {testResult.url}
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="text-red-300 font-mono text-[11px]">{testResult.error}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={() => handleTest(activeTab)}
            disabled={testing || loading}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition flex items-center gap-2"
          >
            {testing ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing Upload...</>
            ) : (
              <><Zap className="w-3.5 h-3.5 text-amber-400" /> Test {activeTab.toUpperCase()}</>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white disabled:opacity-50 transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> Save Changes</>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
