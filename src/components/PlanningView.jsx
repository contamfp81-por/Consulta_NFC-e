import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, CalendarRange, Radar, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '../db';
import { formatCompactCurrency, formatCurrency, buildFinanceOverview } from '../utils/financeInsights';
import { ForecastPrecisionView } from './ForecastPrecisionModule';

const MotionSection = motion.section;

const sectionTransition = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' }
};

const PlanningView = () => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const pixExpenses = useLiveQuery(() => db.pixExpenses.toArray()) || [];
    const productAliases = useLiveQuery(() => db.productAliases.toArray()) || [];
    const foodClassificationOverrides = useLiveQuery(() => db.foodClassificationOverrides.toArray()) || [];

    const insights = useMemo(
        () => buildFinanceOverview({ receipts, products, pixExpenses, productAliases, foodClassificationOverrides }),
        [pixExpenses, products, receipts, productAliases, foodClassificationOverrides]
    );

    return (
        <div className="screen-stack">
            <MotionSection {...sectionTransition} className="page-intro-card">
                <div className="section-heading section-heading-inline">
                    <div>
                        <span className="eyebrow">Planejamento financeiro</span>
                        <h1>Previsoes, ritmo e capacidade de controle</h1>
                    </div>
                    <div className="status-pill neutral">
                        Base em tempo real do Dexie
                    </div>
                </div>
                <p className="page-intro-copy">
                    Esta area combina o ritmo atual de gastos com o modulo de previsao para antecipar o fechamento do mes e medir a confiabilidade do modelo.
                </p>
                <div className="hero-metric-grid planning-grid">
                    <div className="stat-card">
                        <div className="stat-label">Fechamento projetado</div>
                        <div className="stat-value">{formatCurrency(insights.projectedMonthSpend)}</div>
                        <div className="stat-meta">Com base nas saidas ja registradas neste mes</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Ritmo diario</div>
                        <div className="stat-value">{formatCompactCurrency(insights.averageDailySpend)}</div>
                        <div className="stat-meta">{insights.activeDays} dia(s) com movimentacao</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Janela restante</div>
                        <div className="stat-value">{insights.remainingDays} dias</div>
                        <div className="stat-meta">Tempo util para ajustar o fechamento do ciclo</div>
                    </div>
                </div>
                <div className="info-strip-grid">
                    <div className="info-strip">
                        <Sparkles size={16} />
                        <span>Score atual: {insights.healthScore.score}/100</span>
                    </div>
                    <div className="info-strip">
                        <Radar size={16} />
                        <span>Categoria lider: {insights.topCategory?.name || 'Sem dados'}</span>
                    </div>
                    <div className="info-strip">
                        <CalendarRange size={16} />
                        <span>Mes em curso: {insights.monthLabel}</span>
                    </div>
                    <div className="info-strip">
                        <Activity size={16} />
                        <span>Transacoes do mes: {insights.transactionsCount}</span>
                    </div>
                </div>
            </MotionSection>

            <MotionSection {...sectionTransition}>
                <ForecastPrecisionView />
            </MotionSection>
        </div>
    );
};

export default PlanningView;
