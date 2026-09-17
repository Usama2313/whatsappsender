import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, CheckCircle, Send, History, LayoutTemplate, Inbox, Clock, Cloud } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import SendTab from './components/SendTab';
import StatusTab from './components/StatusTab';
import CreateTemplateTab from './components/CreateTemplateTab';
import MessagesTab from './components/MessagesTab';
import ActiveSessionTab from './components/ActiveSessionTab';
import StorageSettingsModal from './components/StorageSettingsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('send');
  const [isStorageOpen, setIsStorageOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-800 to-slate-950 text-slate-100 font-sans">
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(30, 41, 59, 0.9)',
            color: '#fff',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
          success: {
            iconTheme: { primary: '#25D366', secondary: '#fff' },
          },
        }}
      />
      {/* Header Navigation Bar */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-green-500 to-green-300 p-0.5 shadow-lg shadow-green-500/20">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-green-400">
                <MessageCircle className="w-6 h-6" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-green-gradient flex items-center gap-2">
                WhatsApp Sender
              </h1>
              <p className="text-xs text-slate-400 font-medium">Bulk Messaging & Marketing Platform</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <nav className="flex items-center gap-2 bg-slate-800/50 p-1.5 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
              {[
                { id: 'send', icon: Send, label: 'Send' },
                { id: 'template', icon: LayoutTemplate, label: 'Templates' },
                { id: 'messages', icon: Inbox, label: 'Inbox' },
                { id: 'active24h', icon: Clock, label: 'Active 24h' },
                { id: 'status', icon: History, label: 'Status' }
              ].map(tab => (
                <motion.button
                  key={tab.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-green-500 text-slate-900 shadow-md shadow-green-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </motion.button>
              ))}
            </nav>

            {/* Cloud Storage Settings Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsStorageOpen(true)}
              className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800/80 hover:bg-slate-700/80 border border-indigo-500/30 text-indigo-300 hover:text-white transition flex items-center gap-2 shadow-lg shadow-indigo-500/10"
              title="Configure Cloud Storage for permanent template images"
            >
              <Cloud className="w-4 h-4 text-indigo-400" />
              <span>Cloud Storage</span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full"
          >
            {activeTab === 'send' && <SendTab onOpenStorageSettings={() => setIsStorageOpen(true)} />}
            {activeTab === 'template' && <CreateTemplateTab onOpenStorageSettings={() => setIsStorageOpen(true)} />}
            {activeTab === 'messages' && <MessagesTab />}
            {activeTab === 'active24h' && <ActiveSessionTab />}
            {activeTab === 'status' && <StatusTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Cloud Storage Settings Modal */}
      <StorageSettingsModal
        isOpen={isStorageOpen}
        onClose={() => setIsStorageOpen(false)}
      />

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-white/5 py-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>WhatsApp Bulk Sender Tool • Powered by Twilio</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-500" /> Active Session</span>
            <span>•</span>
            <span>End-to-End Secure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
