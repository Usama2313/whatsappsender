import React, { useState, useEffect, useRef } from 'react';
import { Inbox, RefreshCw, Send, Image as ImageIcon, Reply, MessageSquare } from 'lucide-react';

export default function MessagesTab() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState('');
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inbound-messages');
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 30000); // Auto refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Group messages by conversation (the other party's phone number)
  const conversations = {};
  messages.forEach(msg => {
    let contact = msg.isOutgoing ? msg.to : msg.from;
    if (contact) {
      contact = contact.replace('whatsapp:', '').trim();
      if (!conversations[contact]) {
        conversations[contact] = [];
      }
      conversations[contact].push(msg);
    }
  });

  // Sort conversations by most recent message
  const sortedContacts = Object.keys(conversations).sort((a, b) => {
    const msgA = conversations[a][0];
    const msgB = conversations[b][0];
    return new Date(msgB.timestamp) - new Date(msgA.timestamp);
  });

  const activeConversation = selectedContact ? conversations[selectedContact] || [] : [];
  
  // Sort messages chronologically for the chat view (oldest to newest)
  const chatMessages = [...activeConversation].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSendReply = async () => {
    if (!selectedContact) return;
    if (!replyText.trim() && replyFiles.length === 0) return;

    setReplying(true);
    const formData = new FormData();
    formData.append('to', selectedContact);
    formData.append('message', replyText);
    
    replyFiles.forEach(f => {
      formData.append('files', f);
    });

    setReplyError('');
    try {
      const res = await fetch('/api/send-session-reply', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setReplyText('');
        setReplyFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(fetchMessages, 1000); // Fetch new messages
      } else {
        setReplyError(data.error || 'Failed to send reply. Please check if within 24h WhatsApp session window.');
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
      setReplyError(err.message || 'Network error occurred');
    } finally {
      setReplying(false);
    }
  };

  const handleFileChange = (e) => {
    setReplyFiles(Array.from(e.target.files));
  };

  return (
    <div className="glass-card flex overflow-hidden border border-white/10" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
      
      {/* Sidebar: Conversations List */}
      <div className="w-1/3 border-r border-white/10 flex flex-col bg-slate-900/40">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Inbox className="w-5 h-5 text-green-400" /> Inbox
          </h2>
          <button onClick={fetchMessages} disabled={loading} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {sortedContacts.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No messages found.</p>
            </div>
          ) : (
            sortedContacts.map(contact => {
              const latestMsg = conversations[contact][0];
              const isSelected = selectedContact === contact;
              return (
                <div 
                  key={contact}
                  onClick={() => setSelectedContact(contact)}
                  className={`p-4 border-b border-white/5 cursor-pointer transition ${isSelected ? 'bg-green-500/10 border-l-2 border-l-green-500' : 'hover:bg-slate-800/50 border-l-2 border-l-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-semibold text-white">{contact}</h3>
                    <span className="text-xs text-slate-500">
                      {new Date(latestMsg.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 truncate flex items-center gap-1">
                    {latestMsg.isOutgoing && <Reply className="w-3 h-3 text-slate-500" />}
                    {latestMsg.media && latestMsg.media.length > 0 ? (
                      <span className="flex items-center gap-1 text-slate-300 italic"><ImageIcon className="w-3 h-3" /> Media</span>
                    ) : (
                      latestMsg.body
                    )}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat View */}
      <div className="flex-1 flex flex-col bg-slate-950/40 relative">
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-sm z-10">
              <h3 className="text-lg font-bold text-white">{selectedContact}</h3>
              <p className="text-xs text-green-400">24-hour Session Window Open</p>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex flex-col max-w-[75%] ${msg.isOutgoing ? 'self-end items-end ml-auto' : 'self-start items-start mr-auto'}`}>
                  <div className={`p-3 rounded-2xl ${msg.isOutgoing ? 'bg-green-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-100 border border-white/5 rounded-tl-sm'}`}>
                    
                    {msg.media && msg.media.length > 0 && (
                      <div className="flex flex-col gap-2 mb-2">
                        {msg.media.map((m, i) => (
                          <div key={i} className="rounded-lg overflow-hidden border border-black/10 max-w-sm">
                            {m.contentType?.startsWith('image/') ? (
                              <img src={m.url} alt="attachment" className="max-w-full h-auto" />
                            ) : m.contentType?.startsWith('video/') ? (
                              <video src={m.url} controls className="max-w-full h-auto" />
                            ) : (
                              <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-black/20 text-sm hover:underline">
                                <ImageIcon className="w-4 h-4" /> View Attachment
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {msg.body && <p className="whitespace-pre-wrap text-[15px]">{msg.body}</p>}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.channel}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-4 bg-slate-900/60 border-t border-white/10 backdrop-blur-sm">
              {replyError && (
                <div className="mb-3 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center justify-between">
                  <span>{replyError}</span>
                  <button onClick={() => setReplyError('')} className="font-bold hover:text-white ml-2 text-slate-500">×</button>
                </div>
              )}

              {replyFiles.length > 0 && (
                <div className="mb-2 flex gap-2 flex-wrap">
                  {replyFiles.map((f, i) => (
                    <span key={i} className="text-xs bg-slate-800 px-3 py-1 rounded-full flex items-center gap-1 border border-white/10 text-slate-300">
                      <ImageIcon className="w-3 h-3" /> {f.name}
                    </span>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2 items-end">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-slate-400 hover:text-green-400 bg-slate-800 rounded-xl border border-white/5 transition mb-0.5"
                  title="Attach File"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  multiple 
                  className="hidden" 
                />
                
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder={`Reply to ${selectedContact}...`}
                  className="input-field flex-1 max-h-32 resize-y"
                  rows={1}
                />
                
                <button 
                  onClick={handleSendReply}
                  disabled={replying || (!replyText.trim() && replyFiles.length === 0)}
                  className="btn-primary p-3 rounded-xl mb-0.5 h-[46px] w-[46px] flex items-center justify-center p-0"
                >
                  {replying ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <Inbox className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium text-slate-400">Select a conversation</p>
            <p className="text-sm mt-1 max-w-sm text-center">Inbound WhatsApp and SMS replies will appear here. You have a 24-hour window to reply.</p>
          </div>
        )}
      </div>
    </div>
  );
}
