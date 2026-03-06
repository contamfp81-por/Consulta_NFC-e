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
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Scanner from './components/Scanner';
import Dashboard from './components/Dashboard';
import HistoryView from './components/HistoryView';
import { db } from './db';
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
        return <HistoryView />;
      case 'scan':
        return <Scanner onComplete={() => setActiveTab('history')} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="premium-container">
      {/* Header */}
      <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800' }}>Smart<span style={{ color: 'var(--secondary-cyan)' }}>Contábil</span></h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Gestão Inteligente de NFC-e</p>
        </div>
        <div style={{ background: 'var(--white)', padding: '10px', borderRadius: '12px', boxShadow: 'var(--premium-shadow)' }}>
          <Settings size={20} color="var(--primary-blue)" />
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
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button for Scanner */}
      {activeTab !== 'scan' && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="btn-primary"
          onClick={() => setActiveTab('scan')}
          style={{
            position: 'fixed',
            bottom: '100px',
            right: '25px',
            width: '60px',
            height: '60px',
            borderRadius: '30px',
            boxShadow: '0 8px 25px rgba(0, 229, 255, 0.4)',
            zIndex: 999
          }}
        >
          <PlusCircle size={32} />
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
          className={`nav-item ${activeTab === 'scan' ? 'active' : ''}`}
          onClick={() => setActiveTab('scan')}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <PlusCircle />
          <span>Escanear</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
