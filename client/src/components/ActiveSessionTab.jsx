import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, Send, Image as ImageIcon, CheckSquare, Square, RefreshCw, MessageCircle, MessageSquare, PhoneCall, ArrowUpRight, ArrowDownLeft, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

const API = '';

export default function ActiveSessionTab() {
  const [activeUsers, setActiveUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'whatsapp' | 'sms'
  const [sendChannel, setSendChannel] = useState('whatsapp'); // 'whatsapp' | 'sms'
  
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  
  const fileInputRef = useRef(null);

  const fetchActiveSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(API + '/api/active-sessions');
      const data = await res.json();
      if (data.activeUsers) {
        setActiveUsers(data.activeUsers);
      }
    } catch (err) {
      console.error('Failed to fetch active sessions:', err);
      toast.error('Failed to load active 24h sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveSessions();
  }, []);

  // Filter users by channel
  const filteredUsers = activeUsers.filter(u => {
    if (channelFilter === 'whatsapp') return u.channel === 'whatsapp';
    if (channelFilter === 'sms') return u.channel === 'sms';
    return true;
  });

  const toggleUser = (number) => {
    const newSet = new Set(selectedUsers);
    if (newSet.has(number)) {
      newSet.delete(number);
    } else {
      newSet.add(number);
    }
    setSelectedUsers(newSet);
  };

  const toggleAll = () => {
    const visibleNumbers = filteredUsers.map(u => u.number);
    const allSelected = visibleNumbers.every(n => selectedUsers.has(n));
    const newSet = new Set(selectedUsers);
    
    if (allSelected) {
      visibleNumbers.forEach(n => newSet.delete(n));
    } else {
      visibleNumbers.forEach(n => newSet.add(n));
    }
    setSelectedUsers(newSet);
  };

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
  };

  const handleSend = async () => {
    if (selectedUsers.size === 0) return;
    if (!message.trim() && files.length === 0) return;

    setSending(true);
    setResults(null);

    const formData = new FormData();
    const numbersArray = Array.from(selectedUsers);
    formData.append('numbers', numbersArray.join(','));
    if (message.trim()) {
      formData.append('message', message);
    }
    files.forEach(f => {
      formData.append('files', f);
    });
    formData.append('channel', sendChannel);

    try {
      const res = await fetch(API + '/api/send-whatsapp', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setResults(data);
      if (data.success > 0) {
        toast.success(`Broadcast sent to ${data.success} recipient(s)!`);
        setMessage('');
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchActiveSessions();
      } else {
        toast.error(`Failed: ${data.error || 'Check logs for details'}`);
      }
    } catch (err) {
      console.error('Failed to send:', err);
      setResults({ error: err.message });
      toast.error(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'recently';
    const ms = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  };

  const smsCount = activeUsers.filter(u => u.channel === 'sms').length;
  const waCount = activeUsers.filter(u => u.channel === 'whatsapp').length;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 md:p-8 space-y-6 relative overflow-hidden shadow-[0_0_40px_rgba(34,197,94,0.1)] border border-white/10"
    >
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none"></div>
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Clock className="w-7 h-7 text-green-400" />
            <span className="text-green-gradient">24-Hour Active Sessions</span>
          </h2>
          <p className="text-slate-400 mt-1 text-xs sm:text-sm">
            Engage contacts who had activity (SMS or WhatsApp replies/outreach) in the last 24 hours.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchActiveSessions} 
            disabled={loading}
            className="btn-primary p-2.5 px-4 rounded-xl bg-slate-800 border border-white/10 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-green-400' : ''}`} />
            <span>Sync Twilio</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        {/* Left Column: Number List & Filters */}
        <div className="space-y-4">
          {/* Channel Filters */}
          <div className="flex items-center justify-between gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
            <div className="flex gap-1">
              {[
                { id: 'all', label: `All (${activeUsers.length})` },
                { id: 'sms', label: `SMS (${smsCount})` },
                { id: 'whatsapp', label: `WhatsApp (${waCount})` }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setChannelFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    channelFilter === f.id
                      ? f.id === 'sms'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-green-500 text-slate-900 shadow-lg shadow-green-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            
            <button 
              onClick={toggleAll} 
              className="text-xs font-semibold text-green-400 hover:text-green-300 transition px-3 py-1 flex items-center gap-1.5"
            >
              {filteredUsers.length > 0 && filteredUsers.every(u => selectedUsers.has(u.number)) ? (
                <><CheckSquare className="w-4 h-4" /> Deselect All</>
              ) : (
                <><Square className="w-4 h-4" /> Select All</>
              )}
            </button>
          </div>

          {/* Numbers Box */}
          <div className="bg-slate-900/40 rounded-xl border border-white/5 overflow-hidden h-[420px] flex flex-col">
            {filteredUsers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <Users className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">No active numbers found in the last 24 hours.</p>
                <p className="text-xs text-slate-600 mt-1">Send a message from the Send tab or click "Sync Twilio" to refresh.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {filteredUsers.map(user => {
                  const isSelected = selectedUsers.has(user.number);
                  const isSms = user.channel === 'sms';
                  const isOutgoing = user.type === 'outgoing';

                  return (
                    <div 
                      key={user.number}
                      onClick={() => toggleUser(user.number)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition border ${
                        isSelected 
                          ? isSms 
                            ? 'bg-blue-500/10 border-blue-500/30 text-white' 
                            : 'bg-green-500/10 border-green-500/30 text-white'
                          : 'bg-slate-800/40 border-white/5 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isSelected ? (
                          <CheckSquare className={`w-5 h-5 flex-shrink-0 ${isSms ? 'text-blue-400' : 'text-green-400'}`} />
                        ) : (
                          <Square className="w-5 h-5 text-slate-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-mono font-semibold text-sm truncate">{user.number}</p>
                          {user.lastMessage && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{user.lastMessage}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Channel Badge */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          isSms ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {isSms ? 'SMS' : 'WA'}
                        </span>

                        {/* Direction Badge */}
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-950/60 text-slate-400 flex items-center gap-0.5">
                          {isOutgoing ? <ArrowUpRight className="w-3 h-3 text-slate-500" /> : <ArrowDownLeft className="w-3 h-3 text-emerald-400" />}
                          {formatTimeAgo(user.lastActivity || user.lastReply)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-slate-950/60 p-2.5 px-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
              <span>Selected: <strong className="text-white">{selectedUsers.size}</strong> numbers</span>
              <span>Showing: <strong className="text-white">{filteredUsers.length}</strong></span>
            </div>
          </div>
        </div>

        {/* Right Column: Message & Media Composer */}
        <div className="space-y-4">
          <div className="bg-slate-900/40 p-5 rounded-xl border border-white/5 flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base flex items-center gap-2 text-white">
                <MessageCircle className="w-5 h-5 text-green-400" />
                Broadcast to Active Numbers
              </h3>

              {/* Target Channel Toggle */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setSendChannel('whatsapp')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    sendChannel === 'whatsapp' ? 'bg-green-500 text-slate-900 shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setSendChannel('sms')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    sendChannel === 'sms' ? 'bg-blue-500 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SMS Text
                </button>
              </div>
            </div>
            
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={sendChannel === 'sms' ? "Type your SMS content here..." : "Type freeform WhatsApp message..."}
              className="input-field flex-1 resize-none min-h-[140px] text-sm"
            />

            <div className="bg-slate-950/50 p-3.5 rounded-xl border border-white/5">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
                <ImageIcon className="w-4 h-4 text-green-400" /> Attach Media (Images, PDFs, Videos)
              </label>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-green-500/10 file:text-green-400 hover:file:bg-green-500/20 transition cursor-pointer"
              />
              {files.length > 0 && (
                <div className="mt-2.5 flex gap-2 flex-wrap">
                  {files.map((f, i) => (
                    <span key={i} className="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 border border-white/5 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-slate-400" />
                      <span className="max-w-[140px] truncate">{f.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={sending || selectedUsers.size === 0 || (!message.trim() && files.length === 0)}
              className={`btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition ${
                sendChannel === 'sms' 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20'
                  : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-500/20'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {sending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Sending to {selectedUsers.size} recipient(s)...</>
              ) : (
                <><Send className="w-4 h-4" /> Send {sendChannel === 'sms' ? 'SMS' : 'WhatsApp'} to {selectedUsers.size} Selected Number{selectedUsers.size === 1 ? '' : 's'}</>
              )}
            </button>

            {results && (
              <div className={`p-4 rounded-xl border text-xs animate-fadeIn ${results.error ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                {results.error ? (
                  <p className="font-semibold">Error: {results.error}</p>
                ) : (
                  <div>
                    <p className="font-bold text-sm mb-1">Campaign Execution Completed!</p>
                    <p className="text-slate-300">Delivered: <strong>{results.success}</strong> | Failed: <strong>{results.failed}</strong></p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
