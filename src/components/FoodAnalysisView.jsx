import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
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
import { analyzeFoodPurchases } from '../utils/foodAnalysis';

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

const FoodAnalysisView = () => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const productAliases = useLiveQuery(() => db.productAliases.toArray()) || [];

    const analysis = useMemo(
        () => analyzeFoodPurchases({ receipts, products, productAliases }),
        [productAliases, products, receipts]
    );

    const qualityBreakdown = analysis.totals.totalSpendByLevel.filter((item) => item.value > 0);
    const weekdayChartData = analysis.forecast.weekdayDistribution.map((item) => ({
        name: item.shortLabel,
        value: item.totalSpend
    }));
    const hourChartData = analysis.forecast.hourDistribution.map((item) => ({
        name: item.name,
        value: item.totalSpend
    }));

    return (
        <div className="screen-stack">
            <MotionSection {...sectionTransition} className="page-intro-card">
                <div className="section-heading section-heading-inline">
                    <div>
                        <span className="eyebrow">Analise alimentar</span>
                        <h1>Inteligencia pratica para suas compras de supermercado</h1>
                    </div>
                    <div className={`status-pill ${resolveToneClass(analysis.trend.direction)}`}>
                        {analysis.meta.totalItemsAnalyzed} itens analisados
                    </div>
                </div>
                <p className="page-intro-copy">
                    O modulo cruza classificacao automatica de alimentos, padrao temporal, excesso de açucar e impulsividade para transformar historico bruto em sinais de comportamento alimentar.
                </p>
                <div className="info-strip-grid">
                    <div className="info-strip">
                        <Leaf size={16} />
                        <span>Total gasto: {formatCompactCurrency(analysis.totals.totalSpend)}</span>
                    </div>
                    <div className="info-strip">
                        <TrendingUp size={16} />
                        <span>{analysis.trend.message}</span>
                    </div>
                    <div className="info-strip">
                        <AlertTriangle size={16} />
                        <span>Score de açucar: {formatPercentValue(analysis.sugar.score)}</span>
                    </div>
                    <div className="info-strip">
                        <ShieldAlert size={16} />
                        <span>Impulsividade: {analysis.impulsivity.score.toFixed(1)} pts</span>
                    </div>
                </div>
            </MotionSection>

            {analysis.meta.totalItemsAnalyzed === 0 ? (
                <MotionSection {...sectionTransition} className="premium-surface empty-state-card">
                    <div className="empty-state-icon">
                        <ShoppingBasket size={28} />
                    </div>
                    <h2>Nenhum alimento reconhecido ainda</h2>
                    <p>
                        Assim que houver itens alimentares na base, este painel passa a projetar tendencia de dieta,
                        risco de açucar, impulsividade e padroes por horario e dia da semana.
                    </p>
                </MotionSection>
            ) : (
                <>
                    <MotionSection {...sectionTransition} className="food-analysis-grid">
                        <div className="premium-surface food-kpi-card">
                            <span className="eyebrow">Qualidade da dieta</span>
                            <strong>{formatPercentValue(analysis.percentages.natural)}</strong>
                            <small>Natural / saudavel no gasto total de alimentacao</small>
                        </div>
                        <div className="premium-surface food-kpi-card">
                            <span className="eyebrow">Ultraprocessados</span>
                            <strong>{formatPercentValue(analysis.percentages.ultraprocessed)}</strong>
                            <small>Peso atual dos itens ruins / ultraprocessados</small>
                        </div>
                        <div className="premium-surface food-kpi-card">
                            <span className="eyebrow">Açucar</span>
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
                                        <Tooltip
                                            contentStyle={{ background: '#0F2236', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '16px' }}
                                            labelStyle={{ color: '#E2E8F0' }}
                                            formatter={(value) => formatCurrency(value)}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="insight-list">
                                {qualityBreakdown.map((item, index) => (
                                    <div key={item.key} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{item.name}</span>
                                            <small>{formatPercentValue((item.value / Math.max(analysis.totals.totalSpend, 1)) * 100)}</small>
                                        </div>
                                        <div className="list-item-value">
                                            <span className="dot-indicator" style={{ backgroundColor: FOOD_LEVEL_COLORS[index % FOOD_LEVEL_COLORS.length] }} />
                                            <strong>{formatCompactCurrency(item.value)}</strong>
                                        </div>
                                    </div>
                                ))}
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
                                        <Tooltip
                                            contentStyle={{ background: '#0F2236', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '16px' }}
                                            formatter={(value) => formatCurrency(value)}
                                        />
                                        <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#60A5FA" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="insight-list">
                                {analysis.forecast.weekdayDistribution.map((item) => (
                                    <div key={item.key} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{item.name}</span>
                                            <small>{item.itemCount} item(ns) | açucar {formatPercentValue(item.sugaryShare * 100)}</small>
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
                                        <Tooltip
                                            contentStyle={{ background: '#0F2236', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '16px' }}
                                            formatter={(value) => formatCurrency(value)}
                                        />
                                        <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#F59E0B" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="insight-list">
                                {analysis.forecast.hourDistribution.map((item) => (
                                    <div key={item.key} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{item.name}</span>
                                            <small>Ultra {formatPercentValue(item.ultraprocessedShare * 100)} | Açucar {formatPercentValue(item.sugaryShare * 100)}</small>
                                        </div>
                                        <strong>{formatCompactCurrency(item.totalSpend)}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Pilares do comportamento</span>
                                    <h2>Indicadores de previsao</h2>
                                </div>
                            </div>
                            <div className="comparison-stack">
                                <div className="comparison-row neutral">
                                    <div>
                                        <span>Frequencia semanal de ultraprocessados</span>
                                        <strong>{analysis.forecast.weeklyUltraprocessedFrequency.toFixed(1)}</strong>
                                    </div>
                                    <small>Media de itens ultraprocessados por semana observada.</small>
                                </div>
                                <div className="comparison-row neutral">
                                    <div>
                                        <span>Frequencia mensal de açucarados</span>
                                        <strong>{analysis.forecast.monthlySugaryFrequency.toFixed(1)}</strong>
                                    </div>
                                    <small>Media mensal de itens que elevaram o score de açucar.</small>
                                </div>
                                {analysis.forecast.averageTicketByType.map((item) => (
                                    <div key={item.key} className="comparison-row neutral">
                                        <div>
                                            <span>{item.name}</span>
                                            <strong>{formatCompactCurrency(item.value)}</strong>
                                        </div>
                                        <small>Ticket medio por tipo de alimento.</small>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </MotionSection>

                    <MotionSection {...sectionTransition} className="screen-grid screen-grid-main">
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
                            <div className="section-heading home-section-block">
                                <div>
                                    <span className="eyebrow">Alertas gerados</span>
                                    <h2>Riscos e sinais de atencao</h2>
                                </div>
                            </div>
                            <div className="insight-list">
                                {analysis.alerts.length > 0 ? analysis.alerts.map((alert) => (
                                    <div key={alert} className="list-item">
                                        <div className="list-item-value">
                                            <AlertTriangle size={16} color="#F97316" />
                                        </div>
                                        <div className="list-item-copy">
                                            <span>{alert}</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="inline-empty">Nenhum alerta relevante foi gerado para a base atual.</div>
                                )}
                            </div>
                        </div>

                        <div className="premium-surface">
                            <div className="section-heading">
                                <div>
                                    <span className="eyebrow">Drivers do modulo</span>
                                    <h2>Açucar, impulsividade e recorrencia</h2>
                                </div>
                            </div>
                            <div className="comparison-stack">
                                <div className={`comparison-row ${resolveToneClass(analysis.sugar.classification)}`}>
                                    <div>
                                        <span>Score de açucar</span>
                                        <strong>{formatPercentValue(analysis.sugar.score)}</strong>
                                    </div>
                                    <small>Classificacao: {analysis.sugar.classification}</small>
                                </div>
                                <div className={`comparison-row ${resolveToneClass(analysis.impulsivity.classification)}`}>
                                    <div>
                                        <span>Score de impulsividade</span>
                                        <strong>{analysis.impulsivity.score.toFixed(1)}</strong>
                                    </div>
                                    <small>Classificacao: {analysis.impulsivity.classification}</small>
                                </div>
                            </div>

                            <div className="section-heading home-section-block">
                                <div>
                                    <span className="eyebrow">Itens frequentes</span>
                                    <h2>Top alimentos e risco de açucar</h2>
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
                            </div>

                            <div className="section-heading home-section-block">
                                <div>
                                    <span className="eyebrow">Itens açucarados</span>
                                    <h2>Quem puxa o score para cima</h2>
                                </div>
                            </div>
                            <div className="insight-list">
                                {analysis.sugar.topItems.slice(0, 5).map((item) => (
                                    <div key={item.name} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{item.name}</span>
                                            <small>{item.occurrences} ocorrencias</small>
                                        </div>
                                        <strong>{formatCompactCurrency(item.totalSpend)}</strong>
                                    </div>
                                ))}
                            </div>

                            <div className="section-heading home-section-block">
                                <div>
                                    <span className="eyebrow">Compras impulsivas</span>
                                    <h2>Eventos fora do padrao</h2>
                                </div>
                            </div>
                            <div className="insight-list">
                                {analysis.impulsivity.flaggedPurchases.length > 0 ? analysis.impulsivity.flaggedPurchases.map((purchase) => (
                                    <div key={purchase.id} className="list-item">
                                        <div className="list-item-copy">
                                            <span>{new Date(purchase.date).toLocaleDateString('pt-BR')} - {purchase.weekdayLabel}</span>
                                            <small>{purchase.reasons.join(' | ')}</small>
                                        </div>
                                        <strong>{purchase.score} pts</strong>
                                    </div>
                                )) : (
                                    <div className="inline-empty">Nenhum evento com impulsividade relevante foi identificado.</div>
                                )}
                            </div>
                        </div>
                    </MotionSection>
                </>
            )}
        </div>
    );
};

export default FoodAnalysisView;
