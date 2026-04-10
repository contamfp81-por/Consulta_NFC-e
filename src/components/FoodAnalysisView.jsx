import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import {
    AlertTriangle,
    Leaf,
    ShieldAlert,
    ShoppingBasket,
    TrendingUp
} from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '../db';
import { formatCompactCurrency, formatCurrency } from '../utils/financeInsights';
import { analyzeFoodPurchases, FOOD_CLASSIFICATION_OPTIONS } from '../utils/foodAnalysis';
import { construirIndiceSaudeAlimentar } from '../utils/foodHealth';
import { isDateKeyWithinRange, normalizeDateRange, toLocalDateKey } from '../utils/date';
import FoodHealthCard from './FoodHealthCard';

const MotionSection = motion.section;
const FOOD_LEVEL_COLORS = ['#22C55E', '#F59E0B', '#EF4444', '#64748B'];

const sectionTransition = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' }
};

const resolveToneClass = (direction) => {
    if (direction === 'better' || direction === 'baixo') return 'positive';
    if (direction === 'worse' || direction === 'alto') return 'negative';
    return 'neutral';
};

const formatPercentValue = (value) => `${Number(value || 0).toFixed(1)}%`;

const FoodAnalysisView = ({ dateFilter = {} }) => {
    const receiptsQuery = useLiveQuery(() => db.receipts.toArray());
    const productsQuery = useLiveQuery(() => db.products.toArray());
    const productAliasesQuery = useLiveQuery(() => db.productAliases.toArray());
    const foodClassificationOverridesQuery = useLiveQuery(() => db.foodClassificationOverrides.toArray());
    const receipts = useMemo(() => receiptsQuery || [], [receiptsQuery]);
    const products = useMemo(() => productsQuery || [], [productsQuery]);
    const productAliases = useMemo(() => productAliasesQuery || [], [productAliasesQuery]);
    const foodClassificationOverrides = useMemo(
        () => foodClassificationOverridesQuery || [],
        [foodClassificationOverridesQuery]
    );
    const [savingReviewKey, setSavingReviewKey] = useState('');

    const { startDate, endDate } = dateFilter;
    const normalizedDateRange = useMemo(
        () => normalizeDateRange(startDate, endDate),
        [endDate, startDate]
    );

    const filteredReceipts = useMemo(() => {
        return receipts.filter((receipt) => {
            const dateKey = toLocalDateKey(receipt.date);
            return isDateKeyWithinRange(dateKey, normalizedDateRange);
        });
    }, [normalizedDateRange, receipts]);

    const filteredReceiptIds = useMemo(() => new Set(filteredReceipts.map(r => r.id)), [filteredReceipts]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => filteredReceiptIds.has(p.receiptId));
    }, [filteredReceiptIds, products]);
    const analysisReferenceDate = useMemo(() => {
        if (normalizedDateRange.endDate) {
            return normalizedDateRange.endDate;
        }

        const latestReceipt = filteredReceipts.reduce((latest, receipt) => {
            if (!latest) {
                return receipt;
            }

            return String(receipt.date || '') > String(latest.date || '') ? receipt : latest;
        }, null);

        return latestReceipt?.date || new Date();
    }, [filteredReceipts, normalizedDateRange.endDate]);

    const analysis = useMemo(
        () => analyzeFoodPurchases({ receipts: filteredReceipts, products: filteredProducts, productAliases, foodClassificationOverrides }),
        [foodClassificationOverrides, productAliases, filteredProducts, filteredReceipts]
    );
    const automaticTrendModel = useMemo(
        () => construirIndiceSaudeAlimentar({
            receipts,
            products,
            productAliases,
            foodClassificationOverrides,
            referenceDate: new Date()
        }),
        [receipts, products, productAliases, foodClassificationOverrides]
    );

    const foodHealthModel = useMemo(() => {
        const baseModel = construirIndiceSaudeAlimentar({
            receipts: filteredReceipts,
            products: filteredProducts,
            productAliases,
            foodClassificationOverrides,
            referenceDate: analysisReferenceDate
        });

        return {
            ...baseModel,
            monthlySeries: automaticTrendModel.monthlySeries
        };
    }, [analysisReferenceDate, foodClassificationOverrides, productAliases, filteredProducts, filteredReceipts, automaticTrendModel.monthlySeries]);

    const qualityBreakdown = analysis.totals.totalSpendByLevel.filter((item) => item.value > 0);
    const weekdayChartData = analysis.forecast.weekdayDistribution.map((item) => ({
        name: item.shortLabel,
        value: item.totalSpend
    }));
    const hourChartData = analysis.forecast.hourDistribution.map((item) => ({
        name: item.name,
        value: item.totalSpend
    }));
    const hasProcessedItems = analysis.meta.totalProcessedItems > 0;
    const hasAnalyzedItems = analysis.meta.totalItemsAnalyzed > 0;

    const handleSaveClassification = async (reviewItem, classification) => {
        if (!reviewItem?.key || !classification) {
            return;
        }

        setSavingReviewKey(reviewItem.key);

        try {
            const existing = await db.foodClassificationOverrides.where('key').equals(reviewItem.key).first();
            const payload = {
                key: reviewItem.key,
                displayName: reviewItem.displayName,
                classification,
                updatedAt: new Date().toISOString()
            };

            if (existing?.id) {
                await db.foodClassificationOverrides.put({
                    ...existing,
                    ...payload,
                    id: existing.id
                });
            } else {
                await db.foodClassificationOverrides.add(payload);
            }
        } finally {
            setSavingReviewKey('');
        }
    };

    return (
        <div className="screen-stack">
            <MotionSection {...sectionTransition} className="page-intro-card">
                <div className="section-heading section-heading-inline">
                    <div>
                        <span className="eyebrow">Analise alimentar</span>
                        <h1>Inteligencia pratica para suas compras de supermercado</h1>
                    </div>
                    <div className={`status-pill ${resolveToneClass(analysis.trend.direction)}`}>
                        {analysis.meta.pendingReviewCount > 0
                            ? `${analysis.meta.totalItemsAnalyzed} classificados | ${analysis.meta.pendingReviewCount} revisar`
                            : `${analysis.meta.totalItemsAnalyzed} itens analisados`}
                    </div>
                </div>
                <p className="page-intro-copy">
                    O modulo cruza classificacao automatica de alimentos, padrao temporal, excesso de acucar e impulsividade.
                    Itens nao reconhecidos entram em revisao manual para o app aprender a classificacao correta nas proximas compras.
                </p>
                <div className="info-strip-grid">
                    <div className="info-strip">
                        <Leaf size={16} />
                        <span>Total classificado: {formatCompactCurrency(analysis.totals.totalSpend)}</span>
                    </div>
                    <div className="info-strip">
                        <TrendingUp size={16} />
                        <span>{analysis.trend.message}</span>
                    </div>
                    <div className="info-strip">
                        <AlertTriangle size={16} />
                        <span>Score de acucar: {formatPercentValue(analysis.sugar.score)}</span>
                    </div>
                    <div className="info-strip">
                        <ShieldAlert size={16} />
                        <span>Pendentes: {analysis.meta.pendingReviewCount}</span>
                    </div>
                </div>
            </MotionSection>

            {!hasProcessedItems ? (
                <MotionSection {...sectionTransition} className="premium-surface empty-state-card">
                    <div className="empty-state-icon">
                        <ShoppingBasket size={28} />
                    </div>
                    <h2>Nenhum item de cupom disponivel ainda</h2>
                    <p>
                        Assim que houver produtos importados na base, este painel passa a projetar tendencia de dieta,
                        risco de acucar, impulsividade e padroes por horario e dia da semana.
                    </p>
                </MotionSection>
            ) : (
                <>
                    <MotionSection {...sectionTransition}>
                        <FoodHealthCard model={foodHealthModel} />
                    </MotionSection>

                    {analysis.meta.pendingReviewCount > 0 && (
                        <MotionSection {...sectionTransition} className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Nao classificados</span>
                                    <h2>Revise os itens pendentes do cupom</h2>
                                </div>
                                <div className="status-pill neutral">
                                    {analysis.meta.pendingReviewCount} item(ns) | {formatCompactCurrency(analysis.totals.pendingReviewSpend)} aguardando revisao
                                </div>
                            </div>
                            <p className="page-intro-copy" style={{ marginTop: 0, marginBottom: '18px' }}>
                                Escolha uma classificacao pronta. Depois da primeira revisao, o app passa a aplicar essa decisao automaticamente nas proximas vezes que o mesmo item aparecer.
                            </p>
                            <div className="insight-list">
                                {analysis.items.unclassified.map((item) => (
                                    <div
                                        key={item.key}
                                        className="list-item"
                                        style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}
                                    >
                                        <div className="list-item-copy" style={{ minWidth: '220px' }}>
                                            <span>{item.displayName}</span>
                                            <small>
                                                {item.occurrences} ocorrencia(s) | {formatCompactCurrency(item.totalSpend)} | categorias: {item.categories.join(' / ')}
                                            </small>
                                            <small>
                                                Exemplos: {item.exampleNames.join(' | ')} | ultimo registro em {new Date(item.lastDate).toLocaleDateString('pt-BR')}
                                            </small>
                                        </div>
                                        <div style={{ marginLeft: 'auto', minWidth: 'min(100%, 280px)', width: '280px' }}>
                                            <select
                                                value=""
                                                onChange={(event) => handleSaveClassification(item, event.target.value)}
                                                disabled={savingReviewKey === item.key}
                                            >
                                                <option value="">Escolha a classificacao</option>
                                                {FOOD_CLASSIFICATION_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <div style={{ marginTop: '8px', fontSize: '0.76rem', color: 'var(--text-light)', lineHeight: 1.5 }}>
                                                {savingReviewKey === item.key
                                                    ? 'Salvando classificacao...'
                                                    : 'Opcoes: Natural / Saudavel, Moderado, Ruim / Ultraprocessado ou Nao alimentar / Ignorar.'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </MotionSection>
                    )}

                    {!hasAnalyzedItems ? (
                        <MotionSection {...sectionTransition} className="premium-surface empty-state-card">
                            <div className="empty-state-icon">
                                <ShieldAlert size={28} />
                            </div>
                            <h2>Nenhum item alimentar classificado ainda</h2>
                            <p>
                                O painel alimentar so fica completo depois que houver pelo menos alguns itens classificados.
                                Revise os itens pendentes acima para liberar as metricas.
                            </p>
                        </MotionSection>
                    ) : (
                        <>
                            <MotionSection {...sectionTransition} className="food-analysis-grid">
                                <div className="premium-surface food-kpi-card">
                                    <span className="eyebrow">Qualidade da dieta</span>
                                    <strong>{formatPercentValue(analysis.percentages.natural)}</strong>
                                    <small>Natural / saudavel no gasto total de alimentacao classificada</small>
                                </div>
                                <div className="premium-surface food-kpi-card">
                                    <span className="eyebrow">Ultraprocessados</span>
                                    <strong>{formatPercentValue(analysis.percentages.ultraprocessed)}</strong>
                                    <small>Peso atual dos itens ruins / ultraprocessados</small>
                                </div>
                                <div className="premium-surface food-kpi-card">
                                    <span className="eyebrow">Acucar</span>
                                    <strong>{formatPercentValue(analysis.sugar.score)}</strong>
                                    <small>Classificacao: {analysis.sugar.classification}</small>
                                </div>
                                <div className="premium-surface food-kpi-card">
                                    <span className="eyebrow">Impulsividade</span>
                                    <strong>{analysis.impulsivity.score.toFixed(1)}</strong>
                                    <small>Classificacao: {analysis.impulsivity.classification}</small>
                                </div>
                            </MotionSection>

                            <MotionSection {...sectionTransition} className="screen-grid screen-grid-two">
                                <div className="premium-surface">
                                    <div className="section-heading">
                                        <div>
                                            <span className="eyebrow">Distribuicao alimentar</span>
                                            <h2>Participacao por nivel</h2>
                                        </div>
                                    </div>
                                    <div className="chart-area chart-area-medium">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={qualityBreakdown} dataKey="value" innerRadius={54} outerRadius={86} paddingAngle={4}>
                                                    {qualityBreakdown.map((entry, index) => (
                                                        <Cell key={entry.key} fill={FOOD_LEVEL_COLORS[index % FOOD_LEVEL_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Legend verticalAlign="bottom" iconType="circle" />
                                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="premium-surface">
                                    <div className="section-heading">
                                        <div>
                                            <span className="eyebrow">Dia da semana</span>
                                            <h2>Gasto alimentar por dia</h2>
                                        </div>
                                    </div>
                                    <div className="chart-area chart-area-medium">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={weekdayChartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.16)" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${Number(value).toFixed(0)}`} />
                                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                                <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#60A5FA" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="insight-list">
                                        {analysis.forecast.weekdayDistribution.map((item) => (
                                            <div key={item.key} className="list-item">
                                                <div className="list-item-copy">
                                                    <span>{item.name}</span>
                                                    <small>{item.itemCount} item(ns) | acucar {formatPercentValue(item.sugaryShare * 100)}</small>
                                                </div>
                                                <strong>{formatCompactCurrency(item.totalSpend)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </MotionSection>

                            <MotionSection {...sectionTransition} className="screen-grid screen-grid-two">
                                <div className="premium-surface">
                                    <div className="section-heading">
                                        <div>
                                            <span className="eyebrow">Horario de compra</span>
                                            <h2>Distribuicao por periodo do dia</h2>
                                        </div>
                                    </div>
                                    <div className="chart-area chart-area-medium">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={hourChartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.16)" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${Number(value).toFixed(0)}`} />
                                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                                <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#F59E0B" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="insight-list">
                                        {analysis.forecast.hourDistribution.map((item) => (
                                            <div key={item.key} className="list-item">
                                                <div className="list-item-copy">
                                                    <span>{item.name}</span>
                                                    <small>Ultra {formatPercentValue(item.ultraprocessedShare * 100)} | Acucar {formatPercentValue(item.sugaryShare * 100)}</small>
                                                </div>
                                                <strong>{formatCompactCurrency(item.totalSpend)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="premium-surface">
                                    <div className="section-heading">
                                        <div>
                                            <span className="eyebrow">Resumo automatico</span>
                                            <h2>Principais achados</h2>
                                        </div>
                                    </div>
                                    <div className="comparison-stack">
                                        {analysis.summary.lines.map((line) => (
                                            <div key={line} className="comparison-row neutral">
                                                <div>
                                                    <span>Insight</span>
                                                    <strong>{line}</strong>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </MotionSection>

                            <MotionSection {...sectionTransition} className="screen-grid screen-grid-main">
                                <div className="premium-surface">
                                    <div className="section-heading">
                                        <div>
                                            <span className="eyebrow">Top itens</span>
                                            <h2>Alimentos, acucar e impulsividade</h2>
                                        </div>
                                    </div>
                                    <div className="insight-list">
                                        {analysis.items.mostFrequent.slice(0, 5).map((item) => (
                                            <div key={item.key} className="list-item">
                                                <div className="list-item-copy">
                                                    <span>{item.displayName}</span>
                                                    <small>{item.occurrences} ocorrencias | {item.foodLevelLabel}</small>
                                                </div>
                                                <strong>{formatCompactCurrency(item.totalSpend)}</strong>
                                            </div>
                                        ))}
                                        {analysis.sugar.topItems.slice(0, 3).map((item) => (
                                            <div key={`sugar-${item.name}`} className="list-item">
                                                <div className="list-item-copy">
                                                    <span>{item.name}</span>
                                                    <small>{item.occurrences} ocorrencias acucaradas</small>
                                                </div>
                                                <strong>{formatCompactCurrency(item.totalSpend)}</strong>
                                            </div>
                                        ))}
                                        {analysis.impulsivity.flaggedPurchases.slice(0, 3).map((purchase) => (
                                            <div key={purchase.id} className="list-item">
                                                <div className="list-item-copy">
                                                    <span>{new Date(purchase.date).toLocaleDateString('pt-BR')} - {purchase.weekdayLabel}</span>
                                                    <small>{purchase.reasons.join(' | ')}</small>
                                                </div>
                                                <strong>{purchase.score} pts</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </MotionSection>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default FoodAnalysisView;
