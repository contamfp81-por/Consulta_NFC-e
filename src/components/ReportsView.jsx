import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, History, LayoutPanelTop, Sparkles, UtensilsCrossed } from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '../db';
import { buildFinanceOverview, formatCompactCurrency } from '../utils/financeInsights';
import Dashboard from './Dashboard';
import FoodAnalysisView from './FoodAnalysisView';
import HistoryView from './HistoryView';

const MotionSection = motion.section;

const sectionTransition = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' }
};

const REPORT_TABS = [
    {
        id: 'overview',
        label: 'Painel',
        icon: LayoutPanelTop
    },
    {
        id: 'history',
        label: 'Historico',
        icon: History
    },
    {
        id: 'food',
        label: 'Analise Alimentar',
        icon: UtensilsCrossed
    }
];

const ReportsView = ({ onOpenPlanning }) => {
    const [activeReportTab, setActiveReportTab] = useState('overview');
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const pixExpenses = useLiveQuery(() => db.pixExpenses.toArray()) || [];

    const insights = useMemo(
        () => buildFinanceOverview({ receipts, products, pixExpenses }),
        [pixExpenses, products, receipts]
    );

    return (
        <div className="screen-stack">
            <MotionSection {...sectionTransition} className="page-intro-card">
                <div className="section-heading section-heading-inline">
                    <div>
                        <span className="eyebrow">Relatorios e memoria operacional</span>
                        <h1>Analise profunda do comportamento financeiro</h1>
                    </div>
                    <div className="status-pill neutral">
                        {insights.receiptsCount} cupons e {insights.pixCount} Pix na base
                    </div>
                </div>
                <p className="page-intro-copy">
                    Alterne entre o painel analitico completo e o historico operacional da base. O layout foi reorganizado para separar visao executiva de manutencao diaria.
                </p>
                <div className="info-strip-grid">
                    <div className="info-strip">
                        <Sparkles size={16} />
                        <span>Saidas do mes: {formatCompactCurrency(insights.currentMonthTotal)}</span>
                    </div>
                    <div className="info-strip">
                        <BarChart3 size={16} />
                        <span>Score: {insights.healthScore.score}/100</span>
                    </div>
                    <div className="info-strip">
                        <History size={16} />
                        <span>{insights.transactionsCount} transacoes no ciclo atual</span>
                    </div>
                </div>

                <div className="segmented-control">
                    {REPORT_TABS.map((tab) => {
                        const TabIcon = tab.icon;
                        const isActive = activeReportTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                className={`segment-button ${isActive ? 'active' : ''}`}
                                onClick={() => setActiveReportTab(tab.id)}
                            >
                                <TabIcon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </MotionSection>

            <MotionSection {...sectionTransition} className="reports-panel">
                {activeReportTab === 'overview' && <Dashboard onOpenForecastPrecision={onOpenPlanning} />}
                {activeReportTab === 'history' && <HistoryView />}
                {activeReportTab === 'food' && <FoodAnalysisView />}
            </MotionSection>
        </div>
    );
};

export default ReportsView;
