import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  PlusCircle,
  History,
  PieChart as PieChartIcon,
  Settings,
  Download,
  Trash2,
  ChevronRight,
  TrendingUp,
  MapPin,
  Calendar,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Scanner from './components/Scanner';
import Dashboard from './components/Dashboard';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import ManualEntryView from './components/ManualEntryView';
import { db } from './db';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <Dashboard />;
      case 'history':
        return <HistoryView onManualEntry={() => setActiveTab('manual')} />;
      case 'scan':
        return <Scanner onComplete={() => setActiveTab('history')} />;
      case 'settings':
        return <SettingsView />;
      case 'manual':
        return <ManualEntryView
          onComplete={() => setActiveTab('history')}
          onCancel={() => setActiveTab('history')}
          onScan={() => setActiveTab('scan')}
        />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="premium-container">
      {/* Header */}
      <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Smart<span style={{ color: 'var(--secondary-cyan)' }}>Contábil</span></h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Gestão Inteligente de NFC-e</p>
        </div>
        <div
          onClick={() => setActiveTab('settings')}
          style={{
            background: activeTab === 'settings' ? 'var(--primary-blue)' : 'var(--white)',
            padding: '10px',
            borderRadius: '12px',
            boxShadow: 'var(--premium-shadow)',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          <Settings size={20} color={activeTab === 'settings' ? 'white' : 'var(--primary-blue)'} />
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ paddingBottom: '100px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorBoundary>
              {renderContent()}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button for Scanner */}
      {activeTab !== 'manual' && activeTab !== 'scan' && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="btn-primary"
          style={{
            position: 'fixed',
            bottom: '90px',
            right: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setActiveTab('manual')}
        >
          <Plus size={30} />
        </motion.button>
      )}

      {/* Navigation Bar */}
      <nav className="nav-bar">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <BarChart3 />
          <span>Dashboard</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <History />
          <span>Histórico</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <PlusCircle />
          <span>Manual</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
