import React, { useState } from 'react';
import { History, Search, RefreshCw, Activity, AlertCircle, CheckCircle2, Clock, FileText, MessageSquare, XCircle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API = '';

export default function StatusTab() {
  const [sidsInput, setSidsInput] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = async () => {
    if (!sidsInput.trim()) return;
    setLoading(true);
    setError('');
    setStatuses([]);

    // Separate HX (template) SIDs from SM/MM (message) SIDs
    const allSids = sidsInput.split(',').map(s => s.trim()).filter(Boolean);
    const templateSids = allSids.filter(s => s.startsWith('HX'));
    const messageSids = allSids.filter(s => !s.startsWith('HX'));

    const results = [];

    try {
      // Fetch message statuses
      if (messageSids.length > 0) {
        const res = await fetch(`${API}/api/message-status?sids=${encodeURIComponent(messageSids.join(','))}`);
        const data = await res.json();
        if (res.ok) {
          results.push(...(data.statuses || []));
        } else {
          setError(data.error || 'Failed to fetch message statuses');
        }
      }

      // Fetch template statuses
      if (templateSids.length > 0) {
        const res = await fetch(`${API}/api/message-status?sids=${encodeURIComponent(templateSids.join(','))}`);
        const data = await res.json();
        if (res.ok) {
          results.push(...(data.statuses || []));
        } else {
          setError(prev => (prev ? prev + ' | ' : '') + (data.error || 'Failed to fetch template statuses'));
        }
      }

      setStatuses(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (s) => {
    const status = s.status?.toLowerCase();
    const isTemplate = s.type === 'template';

    if (status === 'approved' || status === 'delivered' || status === 'read') {
      return { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/25', label: status.toUpperCase() };
    }
    if (status === 'sent') {
      return { icon: CheckCircle2, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/25', label: 'SENT' };
    }
    if (status === 'queued' || status === 'sending' || status === 'pending' || status === 'submitted') {
      return { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', label: status.toUpperCase() };
    }
    if (status === 'failed' || status === 'undelivered' || status === 'rejected') {
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25', label: status.toUpperCase() };
    }
    if (status === 'error') {
      return { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25', label: 'ERROR' };
    }
    return { icon: HelpCircle, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/25', label: (status || 'unknown').toUpperCase() };
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="glass-card p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 border-b border-white/10 pb-5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Check Delivery Status</h2>
            <p className="text-xs text-slate-400">Supports Message SIDs (SM…) and Template SIDs (HX…)</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              SIDs to check
            </label>
            <div className="flex gap-3">
              <textarea
                value={sidsInput}
                onChange={e => setSidsInput(e.target.value)}
                placeholder={"SM1234abcd, MM9876efgh, HXabc123...\n(comma-separated, any mix of message or template SIDs)"}
                className="input-field flex-1 min-h-[80px] resize-y font-mono text-xs"
                onKeyDown={e => e.key === 'Enter' && e.ctrlKey && checkStatus()}
              />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> SM… / MM… = Message SID</span>
              <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> HX… = Template SID</span>
              <span className="ml-auto">Ctrl+Enter to check</span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={checkStatus}
            disabled={loading || !sidsInput.trim()}
            className="btn-primary w-full h-11 text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-500"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Checking...' : 'Check Status'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statuses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 border border-white/10"
          >
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Results
              <span className="ml-auto text-xs text-slate-400 font-normal">{statuses.length} item{statuses.length !== 1 ? 's' : ''}</span>
            </h3>
            <div className="space-y-3">
              {statuses.map((s, i) => {
                const cfg = getStatusConfig(s);
                const Icon = cfg.icon;
                const isTemplate = s.type === 'template';
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`p-4 rounded-xl border ${cfg.bg} ${cfg.border} space-y-2`}
                  >
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          {isTemplate ? '📋 TEMPLATE' : '💬 MESSAGE'}
                        </span>
                        <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <span className="font-mono text-xs text-slate-400 truncate">{s.sid}</span>
                    </div>

                    {/* Template name */}
                    {isTemplate && s.templateName && (
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">Name: </span>
                        <span className="font-medium">{s.templateName}</span>
                      </div>
                    )}

                    {/* Message details */}
                    {!isTemplate && (s.to || s.from) && (
                      <div className="text-xs text-slate-400 flex gap-4">
                        {s.from && <span><span className="text-slate-500">From: </span>{s.from}</span>}
                        {s.to && <span><span className="text-slate-500">To: </span>{s.to}</span>}
                        {s.dateSent && <span><span className="text-slate-500">Sent: </span>{new Date(s.dateSent).toLocaleString()}</span>}
                      </div>
                    )}

                    {/* Error / rejection message */}
                    {s.errorMessage && (
                      <div className="text-xs bg-red-500/10 border border-red-500/15 rounded-lg p-2.5 text-red-400 leading-relaxed">
                        <span className="font-bold">
                          {isTemplate ? '❌ Rejection Reason: ' : '⚠️ Error: '}
                        </span>
                        {s.errorMessage}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
