import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, History, LayoutPanelTop, Sparkles, UtensilsCrossed, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '../db';
import { buildFinanceOverview, formatCompactCurrency } from '../utils/financeInsights';
import { buildComparisonRange, COMPARISON_PERIOD_OPTIONS, formatDateKeyLabel, getCurrentMonthDateRange, normalizeDateRange } from '../utils/date';
import Dashboard from './Dashboard';

const MotionSection = motion.section;
const HistoryView = lazy(() => import('./HistoryView.jsx'));
const FoodAnalysisView = lazy(() => import('./FoodAnalysisView.jsx'));

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

const ReportLoadingFallback = ({ label }) => (
    <div className="premium-surface empty-state-card">
        <h2>{label}</h2>
        <p>O conteudo desta aba esta sendo carregado.</p>
    </div>
);

const ReportsView = ({ onOpenPlanning }) => {
    const [activeReportTab, setActiveReportTab] = useState('overview');
    const [startDateFilter, setStartDateFilter] = useState(() => getCurrentMonthDateRange().startDate);
    const [endDateFilter, setEndDateFilter] = useState(() => getCurrentMonthDateRange().endDate);
    const [comparisonMode, setComparisonMode] = useState('none');
    const receiptsQuery = useLiveQuery(() => db.receipts.toArray());
    const productsQuery = useLiveQuery(() => db.products.toArray());
    const pixExpensesQuery = useLiveQuery(() => db.pixExpenses.toArray());
    const productAliasesQuery = useLiveQuery(() => db.productAliases.toArray());
    const foodClassificationOverridesQuery = useLiveQuery(() => db.foodClassificationOverrides.toArray());
    const receipts = useMemo(() => receiptsQuery || [], [receiptsQuery]);
    const products = useMemo(() => productsQuery || [], [productsQuery]);
    const pixExpenses = useMemo(() => pixExpensesQuery || [], [pixExpensesQuery]);
    const productAliases = useMemo(() => productAliasesQuery || [], [productAliasesQuery]);
    const foodClassificationOverrides = useMemo(() => foodClassificationOverridesQuery || [], [foodClassificationOverridesQuery]);
    const normalizedDateRange = useMemo(
        () => normalizeDateRange(startDateFilter, endDateFilter),
        [endDateFilter, startDateFilter]
    );
    const comparisonFilter = useMemo(
        () => buildComparisonRange({
            startDate: normalizedDateRange.startDate,
            endDate: normalizedDateRange.endDate,
            mode: comparisonMode
        }),
        [comparisonMode, normalizedDateRange.endDate, normalizedDateRange.startDate]
    );

    const insights = useMemo(
        () => buildFinanceOverview({ receipts, products, pixExpenses, productAliases, foodClassificationOverrides }),
        [pixExpenses, products, receipts, productAliases, foodClassificationOverrides]
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
                        {insights.baseEntriesCount} lancamentos: {insights.importedReceiptsCount} importados, {insights.manualReceiptsCount} manuais e {insights.pixCount} Pix na base
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
                
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(8, 19, 31, 0.4)', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Calendar size={16} color="var(--primary-blue)" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Intervalo de Analise Global</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textTransform: 'uppercase' }}>De</span>
                            <input 
                                type="date" 
                                value={normalizedDateRange.startDate}
                                onChange={(e) => setStartDateFilter(e.target.value)}
                                style={{ padding: '8px', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.22)', background: 'rgba(8, 19, 31, 0.72)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                            />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textTransform: 'uppercase' }}>Ate</span>
                            <input 
                                type="date" 
                                value={normalizedDateRange.endDate}
                                onChange={(e) => setEndDateFilter(e.target.value)}
                                style={{ padding: '8px', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.22)', background: 'rgba(8, 19, 31, 0.72)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                            />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textTransform: 'uppercase' }}>Comparar com</span>
                            <select
                                value={comparisonMode}
                                onChange={(e) => setComparisonMode(e.target.value)}
                                style={{ padding: '8px', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.22)', background: 'rgba(8, 19, 31, 0.72)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                            >
                                {COMPARISON_PERIOD_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                const currentMonthRange = getCurrentMonthDateRange();
                                setStartDateFilter(currentMonthRange.startDate);
                                setEndDateFilter(currentMonthRange.endDate);
                            }}
                            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(26, 35, 126, 0.3)', background: 'rgba(26, 35, 126, 0.15)', color: 'var(--primary-blue)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}
                        >
                            Mes Atual
                        </button>
                    </div>
                    {comparisonFilter && (
                        <div style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-light)' }}>
                            O dashboard vai comparar o intervalo atual com {formatDateKeyLabel(comparisonFilter.startDate)} ate {formatDateKeyLabel(comparisonFilter.endDate)}.
                        </div>
                    )}
                </div>
            </MotionSection>

            <MotionSection {...sectionTransition} className="reports-panel">
                {activeReportTab === 'overview' && (
                    <Dashboard
                        onOpenForecastPrecision={onOpenPlanning}
                        dateFilter={normalizedDateRange}
                        comparisonFilter={comparisonFilter}
                        comparisonMode={comparisonMode}
                    />
                )}
                {activeReportTab === 'history' && (
                    <Suspense fallback={<ReportLoadingFallback label="Carregando historico..." />}>
                        <HistoryView dateFilter={normalizedDateRange} />
                    </Suspense>
                )}
                {activeReportTab === 'food' && (
                    <Suspense fallback={<ReportLoadingFallback label="Carregando analise alimentar..." />}>
                        <FoodAnalysisView dateFilter={normalizedDateRange} />
                    </Suspense>
                )}
            </MotionSection>
        </div>
    );
};

export default ReportsView;
