import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    Area,
    AreaChart,
    Cell,
    Pie,
    PieChart,
    PolarAngleAxis,
    RadialBar,
    RadialBarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import {
    Activity,
    Bell,
    ChevronRight,
    CreditCard,
    Landmark,
    PlusCircle,
    QrCode,
    ReceiptText,
    ShieldCheck,
    Store,
    UserCircle2,
    Wallet
} from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '../db';
import { buildFinanceOverview, formatCompactCurrency, formatCurrency } from '../utils/financeInsights';

const MotionSection = motion.section;

const CATEGORY_COLORS = ['#22C55E', '#60A5FA', '#8B5CF6', '#F59E0B', '#F97316'];

const sectionTransition = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' }
};

const CountUpValue = ({ value, formatter, duration = 900 }) => {
    const [displayValue, setDisplayValue] = useState(0);
    const previousValueRef = useRef(0);

    useEffect(() => {
        const startValue = previousValueRef.current;
        const endValue = Number(value) || 0;
        let animationFrameId = 0;
        let startTime = 0;

        const step = (timestamp) => {
            if (!startTime) {
                startTime = timestamp;
            }

            const progress = Math.min((timestamp - startTime) / duration, 1);
            const nextValue = startValue + ((endValue - startValue) * progress);
            setDisplayValue(nextValue);

            if (progress < 1) {
                animationFrameId = window.requestAnimationFrame(step);
                return;
            }

            previousValueRef.current = endValue;
        };

        animationFrameId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(animationFrameId);
    }, [duration, value]);

    return formatter(displayValue);
};

const resolveToneClassName = (tone) => {
    if (tone === 'positive') return 'positive';
    if (tone === 'negative') return 'negative';
    return 'neutral';
};

const getTransactionIcon = (transaction) => {
    if (transaction.type === 'pix') return Landmark;
    if (String(transaction.paymentMethod || '').toLowerCase().includes('credito')) return CreditCard;
    return Store;
};

const formatChartValue = (value) => formatCurrency(value);

const HomeView = ({
    onOpenPlanning,
    onOpenReports,
    onOpenManual,
    onOpenProfile,
    onOpenScan
}) => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const pixExpenses = useLiveQuery(() => db.pixExpenses.toArray()) || [];

    const insights = useMemo(
        () => buildFinanceOverview({ receipts, products, pixExpenses }),
        [pixExpenses, products, receipts]
    );

    const healthChartData = useMemo(() => ([{
        name: 'Saude financeira',
        value: insights.healthScore.score,
        fill: insights.healthScore.status.tone === 'positive'
            ? '#22C55E'
            : insights.healthScore.status.tone === 'negative'
                ? '#EF4444'
                : '#60A5FA'
    }]), [insights.healthScore.score, insights.healthScore.status.tone]);

    const handleNotificationClick = () => {
        onOpenReports?.();
    };

    const variationClassName = insights.variation.direction === 'up'
        ? 'negative'
        : insights.variation.direction === 'down'
            ? 'positive'
            : 'neutral';

    return (
        <div className="screen-stack">
            <MotionSection {...sectionTransition} className="hero-panel">
                <div className="hero-topbar">
                    <div>
                        <div className="eyebrow">{insights.greetingLabel}</div>
                        <h1 className="hero-title">Confira sua saude financeira</h1>
                        <p className="hero-subtitle">
                            Visao premium das saidas registradas no app, sem perder profundidade analitica.
                        </p>
                    </div>
                    <div className="hero-actions">
                        <button type="button" className="icon-button" onClick={handleNotificationClick} aria-label="Abrir relatorios">
                            <Bell size={18} />
                        </button>
                        <button type="button" className="icon-button" onClick={onOpenProfile} aria-label="Abrir perfil">
                            <UserCircle2 size={20} />
                        </button>
                    </div>
                </div>

                <div className="hero-grid">
                    <div className="hero-balance-card">
                        <div className="hero-chip-row">
                            <span className="status-pill neutral">{insights.monthLabel}</span>
                            <span className={`status-pill ${variationClassName}`}>{insights.variation.label}</span>
                        </div>
                        <div className="hero-balance-label">Saidas do mes</div>
                        <div className="hero-balance-value">
                            <CountUpValue value={insights.currentMonthTotal} formatter={formatCurrency} />
                        </div>
                        <p className="hero-helper">
                            Projecao de fechamento em {formatCurrency(insights.projectedMonthSpend)} com {insights.remainingDays} dia(s) restante(s).
                        </p>

                        <div className="hero-metric-grid">
                            <div className="stat-card">
                                <div className="stat-label">Media diaria</div>
                                <div className="stat-value">
                                    <CountUpValue value={insights.averageDailySpend} formatter={formatCompactCurrency} />
                                </div>
                                <div className="stat-meta">Ritmo atual de saidas</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Ticket medio</div>
                                <div className="stat-value">
                                    <CountUpValue value={insights.averageTicket} formatter={formatCompactCurrency} />
                                </div>
                                <div className="stat-meta">{insights.transactionsCount} transacoes no mes</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Pix pendentes</div>
                                <div className="stat-value">{insights.pendingPixCount}</div>
                                <div className="stat-meta">Itens que pedem confirmacao</div>
                            </div>
                        </div>
                    </div>

                    <div className="hero-health-card">
                        <div className="hero-card-heading">
                            <ShieldCheck size={18} />
                            <span>Indice de saude financeira</span>
                        </div>
                        <div className="health-ring-wrapper">
                            <div className="health-ring-chart">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadialBarChart
                                        data={healthChartData}
                                        startAngle={210}
                                        endAngle={-30}
                                        innerRadius="72%"
                                        outerRadius="100%"
                                        barSize={18}
                                    >
                                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                        <RadialBar
                                            background={{ fill: 'rgba(148, 163, 184, 0.18)' }}
                                            cornerRadius={18}
                                            dataKey="value"
                                        />
                                    </RadialBarChart>
                                </ResponsiveContainer>
                                <div className="health-ring-center">
                                    <strong>{insights.healthScore.score}</strong>
                                    <span>/100</span>
                                </div>
                            </div>
                            <div className="health-ring-copy">
                                <div className={`status-pill ${resolveToneClassName(insights.healthScore.status.tone)}`}>
                                    {insights.healthScore.status.label}
                                </div>
                                <p>{insights.healthScore.status.description}</p>
                                <span>{insights.healthScore.note}</span>
                            </div>
                        </div>

                        <div className="hero-mini-grid">
                            <div className="mini-stat">
                                <Wallet size={16} />
                                <div>
                                    <span>Essenciais</span>
                                    <strong>{formatCompactCurrency(insights.essentialTotal)}</strong>
                                </div>
                            </div>
                            <div className="mini-stat">
                                <ReceiptText size={16} />
                                <div>
                                    <span>Flexiveis</span>
                                    <strong>{formatCompactCurrency(insights.flexibleTotal)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="quick-action-grid">
                    <button type="button" className="quick-action-card" onClick={onOpenScan}>
                        <div className="quick-action-icon">
                            <QrCode size={18} />
                        </div>
                        <div>
                            <strong>Escanear</strong>
                            <span>Importe cupom fiscal ou Pix</span>
                        </div>
                        <ChevronRight size={16} />
                    </button>
                    <button type="button" className="quick-action-card" onClick={onOpenManual}>
                        <div className="quick-action-icon">
                            <PlusCircle size={18} />
                        </div>
                        <div>
                            <strong>Lancar manual</strong>
                            <span>Registre uma despesa completa</span>
                        </div>
                        <ChevronRight size={16} />
                    </button>
                    <button type="button" className="quick-action-card" onClick={onOpenPlanning}>
                        <div className="quick-action-icon">
                            <Activity size={18} />
                        </div>
                        <div>
                            <strong>Planejamento</strong>
                            <span>Veja projecoes e precisao</span>
                        </div>
                        <ChevronRight size={16} />
                    </button>
                    <button type="button" className="quick-action-card" onClick={onOpenReports}>
                        <div className="quick-action-icon">
                            <ReceiptText size={18} />
                        </div>
                        <div>
                            <strong>Relatorios</strong>
                            <span>Historico, exportacao e analises</span>
                        </div>
                        <ChevronRight size={16} />
                    </button>
                </div>
            </MotionSection>

            {!insights.hasData ? (
                <MotionSection {...sectionTransition} className="premium-surface empty-state-card">
                    <div className="empty-state-icon">
                        <Wallet size={28} />
                    </div>
                    <h2>Nenhum dado financeiro registrado ainda</h2>
                    <p>
                        O novo painel premium esta pronto. Assim que voce importar um cupom ou criar um lancamento manual,
                        a home passa a mostrar fluxo, score, categorias e historico automaticamente.
                    </p>
                    <div className="empty-state-actions">
                        <button type="button" className="btn-primary" onClick={onOpenScan}>
                            <QrCode size={18} />
                            Escanear agora
                        </button>
                        <button type="button" className="btn-secondary" onClick={onOpenManual}>
                            <PlusCircle size={18} />
                            Lancar manualmente
                        </button>
                    </div>
                </MotionSection>
            ) : (
                <>
                    <MotionSection {...sectionTransition} className="screen-grid screen-grid-two">
                        <div className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Equilibrio do mes</span>
                                    <h2>Essenciais vs flexiveis</h2>
                                </div>
                            </div>
                            <div className="comparison-stack">
                                <div className="comparison-row positive">
                                    <div>
                                        <span>Essenciais</span>
                                        <strong>{formatCurrency(insights.essentialTotal)}</strong>
                                    </div>
                                    <small>
                                        {insights.currentMonthTotal > 0
                                            ? `${((insights.essentialTotal / insights.currentMonthTotal) * 100).toFixed(1)}% das saidas`
                                            : 'Sem movimentacao'}
                                    </small>
                                </div>
                                <div className="comparison-row neutral">
                                    <div>
                                        <span>Flexiveis</span>
                                        <strong>{formatCurrency(insights.flexibleTotal)}</strong>
                                    </div>
                                    <small>
                                        {insights.currentMonthTotal > 0
                                            ? `${((insights.flexibleTotal / insights.currentMonthTotal) * 100).toFixed(1)}% das saidas`
                                            : 'Sem movimentacao'}
                                    </small>
                                </div>
                            </div>
                            <div className="insight-list">
                                {insights.topCategories.slice(0, 4).map((item) => (
                                    <div key={item.name} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{item.name}</span>
                                            <small>{(item.share * 100).toFixed(1)}% do total</small>
                                        </div>
                                        <strong>{formatCompactCurrency(item.value)}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Comportamento de pagamento</span>
                                    <h2>Formas mais usadas</h2>
                                </div>
                            </div>
                            <div className="insight-list">
                                {insights.topPayments.length > 0 ? insights.topPayments.map((item) => (
                                    <div key={item.name} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{item.name}</span>
                                            <small>{(item.share * 100).toFixed(1)}% do mes</small>
                                        </div>
                                        <strong>{formatCompactCurrency(item.value)}</strong>
                                    </div>
                                )) : (
                                    <div className="inline-empty">As formas de pagamento aparecerao aqui conforme novos dados forem importados.</div>
                                )}
                            </div>
                            <div className="hero-mini-grid">
                                {insights.topMerchants.slice(0, 2).map((merchant) => (
                                    <div key={merchant.name} className="mini-stat">
                                        <Store size={16} />
                                        <div>
                                            <span>{merchant.name}</span>
                                            <strong>{formatCompactCurrency(merchant.value)}</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </MotionSection>

                    <MotionSection {...sectionTransition} className="premium-surface chart-surface">
                        <div className="section-heading">
                            <div>
                                <span className="eyebrow">Fluxo recente</span>
                                <h2>Saidas dos ultimos 14 dias</h2>
                            </div>
                            <div className="status-pill neutral">
                                {insights.activeDays} dia(s) com lancamentos
                            </div>
                        </div>
                        <div className="chart-area chart-area-large">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={insights.dailySeries}>
                                    <defs>
                                        <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.65} />
                                            <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.06} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} tickFormatter={(value) => `R$ ${Number(value).toFixed(0)}`} />
                                    <Tooltip
                                        contentStyle={{
                                            background: '#0F2236',
                                            border: '1px solid rgba(148, 163, 184, 0.18)',
                                            borderRadius: '16px'
                                        }}
                                        labelStyle={{ color: '#E2E8F0' }}
                                        formatter={(value) => formatChartValue(value)}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="total"
                                        stroke="#60A5FA"
                                        strokeWidth={3}
                                        fill="url(#cashflowGradient)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </MotionSection>

                    <MotionSection {...sectionTransition} className="screen-grid screen-grid-main">
                        <div className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Ultimas movimentacoes</span>
                                    <h2>Historico recente</h2>
                                </div>
                                <button type="button" className="link-button" onClick={onOpenReports}>
                                    Ver tudo
                                </button>
                            </div>
                            <div className="transaction-list">
                                {insights.recentTransactions.map((transaction) => {
                                    const TransactionIcon = getTransactionIcon(transaction);

                                    return (
                                        <div key={transaction.id} className="transaction-row">
                                            <div className="transaction-icon">
                                                <TransactionIcon size={18} />
                                            </div>
                                            <div className="transaction-copy">
                                                <strong>{transaction.title}</strong>
                                                <span>
                                                    {new Date(transaction.date).toLocaleDateString('pt-BR', {
                                                        day: '2-digit',
                                                        month: 'short'
                                                    })} - {transaction.sourceLabel}
                                                </span>
                                            </div>
                                            <div className="transaction-value">
                                                {formatCurrency(transaction.amount)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Demonstrativo do mes</span>
                                    <h2>Categorias dominantes</h2>
                                </div>
                            </div>
                            {insights.topCategories.length > 0 ? (
                                <>
                                    <div className="chart-area chart-area-medium">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={insights.topCategories}
                                                    dataKey="value"
                                                    innerRadius={58}
                                                    outerRadius={84}
                                                    paddingAngle={3}
                                                >
                                                    {insights.topCategories.map((entry, index) => (
                                                        <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{
                                                        background: '#0F2236',
                                                        border: '1px solid rgba(148, 163, 184, 0.18)',
                                                        borderRadius: '16px'
                                                    }}
                                                    labelStyle={{ color: '#E2E8F0' }}
                                                    formatter={(value) => formatChartValue(value)}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="insight-list">
                                        {insights.topCategories.map((category, index) => (
                                            <div key={category.name} className="list-item">
                                                <div className="list-item-copy">
                                                    <span>{category.name}</span>
                                                    <small>{(category.share * 100).toFixed(1)}% do total</small>
                                                </div>
                                                <div className="list-item-value">
                                                    <span
                                                        className="dot-indicator"
                                                        style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                                                    />
                                                    <strong>{formatCompactCurrency(category.value)}</strong>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="inline-empty">As categorias do mes aparecerao aqui apos a primeira importacao.</div>
                            )}
                        </div>
                    </MotionSection>
                </>
            )}
        </div>
    );
};

export default HomeView;
