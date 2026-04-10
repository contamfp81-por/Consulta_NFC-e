import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
    BarChart3,
    House,
    Plus,
    QrCode,
    Radar,
    UserCircle2,
    Wallet,
    X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import HomeView from './components/HomeView';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const MotionDiv = motion.div;
const MotionButton = motion.button;
const OpportunityView = lazy(() => import('./components/OpportunityView'));
const ReportsView = lazy(() => import('./components/ReportsView'));
const PlanningView = lazy(() => import('./components/PlanningView'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const Scanner = lazy(() => import('./components/Scanner'));
const ManualEntryView = lazy(() => import('./components/ManualEntryView'));
const FoodHealthGuideView = lazy(() => import('./components/FoodHealthGuideView'));

const PRIMARY_TABS = new Set(['home', 'planning', 'reports', 'profile']);

const NAV_ITEMS = [
    {
        id: 'home',
        label: 'Inicio',
        icon: House
    },
    {
        id: 'planning',
        label: 'Planejamento',
        icon: Radar
    },
    {
        id: 'reports',
        label: 'Relatorios',
        icon: BarChart3
    },
    {
        id: 'profile',
        label: 'Config',
        icon: UserCircle2
    }
];

const ScreenLoadingFallback = ({ label = 'Carregando modulo...' }) => (
    <div className="screen-stack">
        <section className="premium-surface empty-state-card">
            <h2>{label}</h2>
            <p>O conteudo desta area esta sendo carregado.</p>
        </section>
    </div>
);

function App() {
    const [activeTab, setActiveTab] = useState('home');
    const [lastPrimaryTab, setLastPrimaryTab] = useState('home');
    const [isFabOpen, setIsFabOpen] = useState(false);

    useEffect(() => {
        if (PRIMARY_TABS.has(activeTab)) {
            setLastPrimaryTab(activeTab);
        }
    }, [activeTab]);

    useEffect(() => {
        setIsFabOpen(false);
    }, [activeTab]);

    const activePrimaryTab = PRIMARY_TABS.has(activeTab) ? activeTab : lastPrimaryTab;

    const openTab = (tabId) => {
        setActiveTab(tabId);
    };

    const openQuickAction = (targetTab) => {
        setIsFabOpen(false);
        setActiveTab(targetTab);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return (
                    <HomeView
                        onOpenManual={() => openQuickAction('manual')}
                        onOpenOpportunity={() => openTab('opportunity')}
                        onOpenPlanning={() => openTab('planning')}
                        onOpenProfile={() => openTab('profile')}
                        onOpenReports={() => openTab('reports')}
                        onOpenScan={() => openQuickAction('scan')}
                    />
                );
            case 'opportunity':
                return (
                    <Suspense fallback={<ScreenLoadingFallback label="Carregando oportunidade do dia..." />}>
                        <OpportunityView onOpenReports={() => openTab('reports')} />
                    </Suspense>
                );
            case 'planning':
                return (
                    <Suspense fallback={<ScreenLoadingFallback label="Carregando planejamento..." />}>
                        <PlanningView />
                    </Suspense>
                );
            case 'reports':
                return (
                    <Suspense fallback={<ScreenLoadingFallback label="Carregando relatorios..." />}>
                        <ReportsView 
                            onOpenPlanning={() => openTab('planning')} 
                            onOpenFoodGuide={() => openTab('food-guide')}
                        />
                    </Suspense>
                );
            case 'profile':
                return (
                    <Suspense fallback={<ScreenLoadingFallback label="Carregando perfil..." />}>
                        <ProfileView />
                    </Suspense>
                );
            case 'scan':
                return (
                    <div className="screen-stack">
                        <section className="page-intro-card">
                            <div className="section-heading section-heading-inline">
                                <div>
                                    <span className="eyebrow">Captura inteligente</span>
                                    <h1>Escaneie cupom fiscal ou QR Pix</h1>
                                </div>
                            </div>
                            <p className="page-intro-copy">
                                Use a camera ou envie uma imagem para transformar o documento em dados estruturados no seu historico.
                            </p>
                        </section>
                        <Suspense fallback={<ScreenLoadingFallback label="Carregando scanner..." />}>
                            <Scanner onComplete={() => openTab('reports')} />
                        </Suspense>
                    </div>
                );
            case 'food-guide':
                return (
                    <Suspense fallback={<ScreenLoadingFallback label="Carregando guia do ISA..." />}>
                        <FoodHealthGuideView onBack={() => openTab('reports')} />
                    </Suspense>
                );
            case 'manual':
                return (
                    <div className="screen-stack">
                        <section className="page-intro-card">
                            <div className="section-heading section-heading-inline">
                                <div>
                                    <span className="eyebrow">Lancamento manual</span>
                                    <h1>Monte a despesa com precisao item a item</h1>
                                </div>
                            </div>
                            <p className="page-intro-copy">
                                Ideal para complementar o historico quando o cupom nao pode ser importado automaticamente.
                            </p>
                        </section>
                        <Suspense fallback={<ScreenLoadingFallback label="Carregando formulario manual..." />}>
                            <ManualEntryView
                                onComplete={() => openTab('reports')}
                                onCancel={() => openTab(activePrimaryTab)}
                                onScan={() => openQuickAction('scan')}
                            />
                        </Suspense>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="app-shell">
            <div className="app-shell-backdrop" />
            <div className="premium-container premium-shell-container">
                <main className="app-main">
                    <AnimatePresence mode="wait">
                        <MotionDiv
                            key={activeTab}
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.22 }}
                        >
                            <ErrorBoundary key={activeTab}>
                                {renderContent()}
                            </ErrorBoundary>
                        </MotionDiv>
                    </AnimatePresence>
                </main>
            </div>

            <AnimatePresence>
                {isFabOpen && (
                    <>
                        <MotionDiv
                            className="fab-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsFabOpen(false)}
                        />
                        <MotionDiv
                            className="fab-menu"
                            initial={{ opacity: 0, y: 16, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.96 }}
                            transition={{ duration: 0.2 }}
                        >
                            <button
                                type="button"
                                className="fab-menu-item"
                                onClick={() => openQuickAction('scan')}
                            >
                                <div className="fab-menu-item-icon">
                                    <QrCode size={18} />
                                </div>
                                <div>
                                    <strong>Escanear</strong>
                                    <span>Importe QR de cupom ou Pix</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                className="fab-menu-item"
                                onClick={() => openQuickAction('manual')}
                            >
                                <div className="fab-menu-item-icon">
                                    <Wallet size={18} />
                                </div>
                                <div>
                                    <strong>Lancamento manual</strong>
                                    <span>Adicione uma despesa item a item</span>
                                </div>
                            </button>
                        </MotionDiv>
                    </>
                )}
            </AnimatePresence>

            <nav className="nav-bar">
                {NAV_ITEMS.slice(0, 2).map((item) => {
                    const Icon = item.icon;
                    const isActive = activePrimaryTab === item.id;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => openTab(item.id)}
                        >
                            <Icon size={22} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}

                <MotionButton
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    className={`fab-trigger ${isFabOpen ? 'active' : ''}`}
                    onClick={() => setIsFabOpen((currentValue) => !currentValue)}
                    aria-label={isFabOpen ? 'Fechar menu de acoes' : 'Abrir menu de acoes'}
                >
                    {isFabOpen ? <X size={24} /> : <Plus size={24} />}
                </MotionButton>

                {NAV_ITEMS.slice(2).map((item) => {
                    const Icon = item.icon;
                    const isActive = activePrimaryTab === item.id;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => openTab(item.id)}
                        >
                            <Icon size={22} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

export default App;
