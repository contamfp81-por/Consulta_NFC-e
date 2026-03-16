import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    BarChart,
    Bar
} from 'recharts';
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Layers,
    ShieldCheck,
    TableProperties,
    TrendingUp
} from 'lucide-react';
import { db } from '../db';
import {
    DEFAULT_FORECAST_MODEL_CONFIG,
    buildForecastDataset,
    buildForecastValidationModule,
    calculateForecastForObservedDays,
    getDateKey,
    getForecastModelConfig,
    getMonthKey
} from '../utils/forecastModel';

const formatCurrencyValue = (value) => `R$ ${Number(value || 0).toFixed(2)}`;
const formatPercentValue = (value) => `${Number(value || 0).toFixed(1)}%`;
const formatSignedCurrencyValue = (value) => {
    const numericValue = Number(value) || 0;
    const sign = numericValue > 0 ? '+' : numericValue < 0 ? '-' : '';
    return `${sign}${formatCurrencyValue(Math.abs(numericValue))}`;
};

const LEVEL_OPTIONS = [
    { id: 'daily', label: 'Diario' },
    { id: 'category', label: 'Categoria' },
    { id: 'monthly', label: 'Mensal' }
];

const FORECAST_WEIGHT_LABELS = {
    avg7: 'Media 7d',
    avg30: 'Media 30d',
    trend: 'Tendencia',
    weekday: 'Dia da semana',
    monthPosition: 'Periodo do mes',
    recurrence: 'Recorrencia'
};
const DAILY_WEIGHT_FIELDS = ['avg7', 'avg30', 'trend', 'weekday', 'monthPosition', 'recurrence'];
const CATEGORY_WEIGHT_FIELDS = ['avg7', 'avg30', 'trend', 'weekday', 'recurrence'];

const MOBILE_BREAKPOINT = 768;

const SUMMARY_GRID_STYLE = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: '14px'
};

const DETAIL_GRID_STYLE = {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))'
};

const isCompactViewport = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.innerWidth < MOBILE_BREAKPOINT;
};

const formatWeightGroup = (weights = {}, fields = []) => fields
    .map((field) => `${FORECAST_WEIGHT_LABELS[field]} ${(Number(weights[field] || 0) * 100).toFixed(0)}%`)
    .join(' | ');

const formatWeightsLabel = (dailyWeights = {}, categoryWeights = {}) => [
    `Dia: ${formatWeightGroup(dailyWeights, DAILY_WEIGHT_FIELDS)}`,
    `Categorias: ${formatWeightGroup(categoryWeights, CATEGORY_WEIGHT_FIELDS)}`
].join(' || ');

const buildTableRows = (validation, selectedLevel) => {
    if (selectedLevel === 'category') {
        return validation.recentCategoryRecords.map((record) => ({
            key: record.key,
            reference: record.label,
            scope: record.categoryName,
            previsto: record.predictedValue,
            real: record.realValue,
            erro: record.errorValue,
            erroPercentual: record.errorPercent,
            precisao: record.precision
        }));
    }

    if (selectedLevel === 'monthly') {
        return [...validation.monthlyRecords]
            .reverse()
            .map((record) => ({
                key: record.key,
                reference: record.label,
                scope: `Base no dia ${String(record.checkpointDay).padStart(2, '0')}`,
                previsto: record.predictedValue,
                real: record.realValue,
                erro: record.errorValue,
                erroPercentual: record.errorPercent,
                precisao: record.precision
            }));
    }

    return validation.recentDailyRecords.map((record) => ({
        key: record.key,
        reference: record.label,
        scope: 'Gasto diario',
        previsto: record.predictedValue,
        real: record.realValue,
        erro: record.errorValue,
        erroPercentual: record.errorPercent,
        precisao: record.precision
    }));
};

const buildCurrentMonthReference = ({ dataset, modelConfig }) => {
    const now = new Date();
    const currentDateKey = getDateKey(now);
    const currentMonthKey = getMonthKey(now);
    const currentDay = Number(currentDateKey?.slice(-2)) || 0;

    if (!currentDateKey || !currentMonthKey || !currentDay) {
        return null;
    }

    const projection = calculateForecastForObservedDays({
        dataset,
        monthKey: currentMonthKey,
        observedDays: currentDay,
        modelConfig
    });

    if (!projection) {
        return null;
    }

    return {
        currentDateKey,
        projectedTotal: projection.projectedTotal
    };
};

const ForecastPrecisionContent = ({
    validation,
    modelConfig,
    currentMonthInsight,
    onBack
}) => {
    const [selectedLevel, setSelectedLevel] = useState('daily');
    const [isCompactLayout, setIsCompactLayout] = useState(() => isCompactViewport());

    const tableRows = useMemo(
        () => buildTableRows(validation, selectedLevel),
        [selectedLevel, validation]
    );

    const hasValidationData = (
        validation.dailyMetrics.count > 0
        || validation.categoryMetrics.count > 0
        || validation.monthlyMetrics.count > 0
    );

    useEffect(() => {
        const handleResize = () => {
            setIsCompactLayout(isCompactViewport());
        };

        handleResize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const comparisonChartHeight = isCompactLayout ? 220 : 300;
    const precisionChartHeight = isCompactLayout ? 220 : 300;
    const chartMargin = isCompactLayout
        ? { top: 8, right: 4, left: -18, bottom: 12 }
        : { top: 8, right: 12, left: 4, bottom: 8 };

    return (
        <div className="animate-slide-up" style={{ display: 'grid', gap: '18px', width: '100%', minWidth: 0 }}>
            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isCompactLayout ? '1fr' : 'minmax(0, 1fr) auto', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ minWidth: 0 }}>
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    border: 'none',
                                    background: 'rgba(26, 35, 126, 0.08)',
                                    color: 'var(--primary-blue)',
                                    borderRadius: '999px',
                                    padding: '8px 12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    marginBottom: '14px'
                                }}
                            >
                                <ArrowLeft size={16} />
                                Voltar ao Dashboard
                            </button>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <ShieldCheck size={20} color={validation.status.color} />
                            <h3 style={{ margin: 0, fontSize: '1.18rem' }}>Precisao da Previsao</h3>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.86rem', lineHeight: 1.6 }}>
                            Modulo completo de validacao do algoritmo de previsao de gastos, com comparacao entre previsto x real, calculo de erro, MAPE, historico de desempenho e recalibracao automatica do modelo.
                        </p>
                    </div>
                    <div style={{ minWidth: 0, textAlign: isCompactLayout ? 'left' : 'right' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: validation.status.color }}>
                            {hasValidationData ? formatPercentValue(validation.overallPrecision) : '--'}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
                            {hasValidationData ? validation.status.badge : 'Aguardando base'}
                        </div>
                    </div>
                </div>
            </div>

            {validation.alertMessage && (
                <div className="glass-card" style={{ marginBottom: 0, border: '1px solid rgba(198, 40, 40, 0.18)', background: 'rgba(255, 255, 255, 0.95)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#8E1C1C' }}>
                        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '0.84rem', lineHeight: 1.55 }}>
                            <strong>Alerta automatico:</strong> {validation.alertMessage}
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ ...SUMMARY_GRID_STYLE }}>
                    <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(26, 35, 126, 0.06)' }}>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>Precisao geral</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: validation.status.color }}>
                            {hasValidationData ? formatPercentValue(validation.overallPrecision) : '--'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '6px' }}>
                            {hasValidationData ? `Status: ${validation.status.badge}` : 'Historico ainda insuficiente para avaliar.'}
                        </div>
                    </div>
                    <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(0, 229, 255, 0.08)' }}>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>MAPE atual</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>
                            {hasValidationData ? formatPercentValue(validation.overallMape) : '--'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '6px' }}>
                            Media do erro percentual absoluto.
                        </div>
                    </div>
                    <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(255, 152, 0, 0.08)' }}>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>Erro medio diario</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>
                            {hasValidationData ? formatCurrencyValue(validation.dailyMetrics.meanAbsoluteError) : '--'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '6px' }}>
                            Baseado nos desvios absolutos diarios.
                        </div>
                    </div>
                    <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(76, 175, 80, 0.08)' }}>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>Tendencia</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: validation.trend.color }}>
                            {validation.trend.label}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '6px' }}>
                            {validation.trend.description}
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Activity size={18} color={validation.status.color} />
                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Indicador visual do desempenho</h4>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '12px' }}>
                    Precisao do modelo
                </div>
                <div style={{ width: '100%', height: '18px', borderRadius: '999px', background: 'rgba(148, 163, 184, 0.18)', overflow: 'hidden', marginBottom: '10px' }}>
                    <div
                        style={{
                            width: `${Math.min(100, Math.max(0, validation.overallPrecision))}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${validation.status.color} 0%, rgba(26, 35, 126, 0.92) 100%)`
                        }}
                    />
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: validation.status.color, marginBottom: '8px' }}>
                    {hasValidationData ? formatPercentValue(validation.overallPrecision) : '--'}
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-dark)', marginBottom: '10px' }}>
                    {hasValidationData ? `Status: ${validation.status.description}` : 'Aguardando historico suficiente para validar a previsao.'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.6 }}>
                    {hasValidationData
                        ? `MAPE atual de ${formatPercentValue(validation.overallMape)}. Nivel diario em ${formatPercentValue(validation.dailyMetrics.precision)}, por categoria em ${formatPercentValue(validation.categoryMetrics.precision)} e no fechamento mensal em ${formatPercentValue(validation.monthlyMetrics.precision)}.`
                        : 'Assim que houver dias e meses suficientes para comparar previsao x gasto real, o indicador completo sera preenchido automaticamente.'}
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <TrendingUp size={18} color="var(--primary-blue)" />
                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Calculo automatico do erro</h4>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.7, display: 'grid', gap: '8px' }}>
                    <div><strong>Erro:</strong> Real - Previsto</div>
                    <div><strong>Erro %:</strong> |Real - Previsto| / Real x 100</div>
                    <div><strong>Precisao:</strong> 100 - Erro percentual</div>
                    <div><strong>MAPE:</strong> media do erro percentual absoluto</div>
                    {currentMonthInsight?.projectedTotal ? (
                        <div><strong>Base atual:</strong> fechamento provavel em {formatCurrencyValue(currentMonthInsight.projectedTotal)}</div>
                    ) : null}
                </div>
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(148, 163, 184, 0.18)', fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.6 }}>
                    Pesos ativos: {formatWeightsLabel(validation.weights, validation.categoryWeights)}
                    {modelConfig?.lastRecalibratedAt ? ` | Ultima recalibracao: ${modelConfig.lastRecalibratedAt}` : ''}
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TableProperties size={18} color="var(--primary-blue)" />
                        <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Tabela de comparacao previsao x gasto real</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {LEVEL_OPTIONS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setSelectedLevel(option.id)}
                                style={{
                                    border: 'none',
                                    borderRadius: '999px',
                                    padding: '8px 14px',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    background: selectedLevel === option.id ? 'var(--primary-blue)' : 'rgba(148, 163, 184, 0.14)',
                                    color: selectedLevel === option.id ? 'white' : 'var(--text-dark)'
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                {tableRows.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
                        Ainda nao ha registros suficientes nesse nivel de validacao.
                    </div>
                ) : isCompactLayout ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {tableRows.map((row) => (
                            <div
                                key={row.key}
                                style={{
                                    padding: '12px',
                                    borderRadius: '16px',
                                    background: 'rgba(26, 35, 126, 0.04)',
                                    border: '1px solid rgba(148, 163, 184, 0.16)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{row.reference}</strong>
                                    <span style={{ fontWeight: 800, color: row.precisao >= 80 ? '#2E7D32' : '#C62828' }}>
                                        {formatPercentValue(row.precisao)}
                                    </span>
                                </div>
                                <div style={DETAIL_GRID_STYLE}>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Escopo</div>
                                        <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{row.scope}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Previsto</div>
                                        <div style={{ fontWeight: 600 }}>{formatCurrencyValue(row.previsto)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Real</div>
                                        <div style={{ fontWeight: 600 }}>{formatCurrencyValue(row.real)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Erro</div>
                                        <div style={{ fontWeight: 600, color: row.erro > 0 ? '#D84315' : row.erro < 0 ? '#2E7D32' : 'var(--text-dark)' }}>
                                            {formatSignedCurrencyValue(row.erro)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Erro %</div>
                                        <div style={{ fontWeight: 600 }}>{formatPercentValue(row.erroPercentual)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ overflow: 'auto', maxHeight: '340px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148, 163, 184, 0.22)' }}>
                                    <th style={{ padding: '10px 8px' }}>Data / Referencia</th>
                                    <th style={{ padding: '10px 8px' }}>Escopo</th>
                                    <th style={{ padding: '10px 8px' }}>Previsto</th>
                                    <th style={{ padding: '10px 8px' }}>Real</th>
                                    <th style={{ padding: '10px 8px' }}>Erro</th>
                                    <th style={{ padding: '10px 8px' }}>Erro %</th>
                                    <th style={{ padding: '10px 8px' }}>Precisao</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row) => (
                                    <tr key={row.key} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                                        <td style={{ padding: '10px 8px', fontWeight: 700, overflowWrap: 'anywhere' }}>{row.reference}</td>
                                        <td style={{ padding: '10px 8px', overflowWrap: 'anywhere' }}>{row.scope}</td>
                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(row.previsto)}</td>
                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(row.real)}</td>
                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', color: row.erro > 0 ? '#D84315' : row.erro < 0 ? '#2E7D32' : 'var(--text-dark)' }}>
                                            {formatSignedCurrencyValue(row.erro)}
                                        </td>
                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatPercentValue(row.erroPercentual)}</td>
                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: 800, color: row.precisao >= 80 ? '#2E7D32' : '#C62828' }}>
                                            {formatPercentValue(row.precisao)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <TrendingUp size={18} color="var(--primary-blue)" />
                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Grafico 1 - Previsao x gasto real</h4>
                </div>
                <div style={{ height: `${comparisonChartHeight}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={validation.comparisonChartData} margin={chartMargin}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} fontSize={isCompactLayout ? 10 : 11} minTickGap={isCompactLayout ? 18 : 10} />
                            <YAxis axisLine={false} tickLine={false} width={isCompactLayout ? 48 : 60} fontSize={isCompactLayout ? 10 : 11} tickFormatter={(value) => `R$ ${Number(value || 0).toFixed(0)}`} />
                            <Tooltip formatter={(value) => formatCurrencyValue(value)} />
                            <Line type="monotone" dataKey="previsto" stroke="#1A237E" strokeWidth={3} dot={false} name="Previsto" />
                            <Line type="monotone" dataKey="real" stroke="#2E7D32" strokeWidth={3} dot={false} name="Real" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <Layers size={18} color="var(--primary-blue)" />
                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Grafico 2 - Evolucao da precisao</h4>
                </div>
                <div style={{ height: `${precisionChartHeight}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={validation.weeklyPrecisionData} margin={chartMargin}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                            <XAxis dataKey="week" axisLine={false} tickLine={false} fontSize={isCompactLayout ? 10 : 11} minTickGap={isCompactLayout ? 18 : 10} />
                            <YAxis axisLine={false} tickLine={false} width={isCompactLayout ? 36 : 42} fontSize={isCompactLayout ? 10 : 11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                            <Tooltip formatter={(value) => formatPercentValue(value)} />
                            <Bar dataKey="precision" fill={validation.status.color} radius={[10, 10, 0, 0]} name="Precisao" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.98rem' }}>Historico de desempenho do modelo</h4>
                <div style={{ display: 'grid', gap: '10px' }}>
                    {validation.monthlyRecords.length > 0 ? validation.monthlyRecords.map((record) => (
                        <div key={record.key} style={{ padding: '12px', borderRadius: '14px', background: 'rgba(26, 35, 126, 0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                <strong>{record.label}</strong>
                                <span style={{ color: record.precision >= 80 ? '#2E7D32' : '#C62828', fontWeight: 800 }}>
                                    {formatPercentValue(record.precision)}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55 }}>
                                Previsto: {formatCurrencyValue(record.predictedValue)} | Real: {formatCurrencyValue(record.realValue)} | Base no dia {String(record.checkpointDay).padStart(2, '0')}
                            </div>
                        </div>
                    )) : (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
                            Ainda nao ha meses fechados suficientes para avaliar a previsao total do mes.
                        </div>
                    )}
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: 0 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.98rem' }}>Precisao por categoria e recalibracao</h4>
                {validation.categorySummaryData.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '14px' }}>
                        Ainda nao ha dados por categoria suficientes para medir a precisao.
                    </div>
                ) : isCompactLayout ? (
                    <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                        {validation.categorySummaryData.map((item) => (
                            <div
                                key={item.categoryName}
                                style={{
                                    padding: '12px',
                                    borderRadius: '16px',
                                    background: 'rgba(26, 35, 126, 0.04)',
                                    border: '1px solid rgba(148, 163, 184, 0.16)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    <strong style={{ overflowWrap: 'anywhere' }}>{item.categoryName}</strong>
                                    <span style={{ color: item.precision >= 80 ? '#2E7D32' : '#C62828', fontWeight: 800 }}>
                                        {formatPercentValue(item.precision)}
                                    </span>
                                </div>
                                <div style={DETAIL_GRID_STYLE}>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Registros</div>
                                        <div style={{ fontWeight: 600 }}>{item.recordsCount}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>MAPE</div>
                                        <div style={{ fontWeight: 600 }}>{formatPercentValue(item.mape)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ overflow: 'auto', maxHeight: '280px', marginBottom: '14px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', tableLayout: 'fixed' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148, 163, 184, 0.22)' }}>
                                    <th style={{ padding: '8px 6px' }}>Categoria</th>
                                    <th style={{ padding: '8px 6px' }}>Registros</th>
                                    <th style={{ padding: '8px 6px' }}>MAPE</th>
                                    <th style={{ padding: '8px 6px' }}>Precisao</th>
                                </tr>
                            </thead>
                            <tbody>
                                {validation.categorySummaryData.map((item) => (
                                    <tr key={item.categoryName} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                                        <td style={{ padding: '8px 6px', fontWeight: 700, overflowWrap: 'anywhere' }}>{item.categoryName}</td>
                                        <td style={{ padding: '8px 6px' }}>{item.recordsCount}</td>
                                        <td style={{ padding: '8px 6px' }}>{formatPercentValue(item.mape)}</td>
                                        <td style={{ padding: '8px 6px', color: item.precision >= 80 ? '#2E7D32' : '#C62828', fontWeight: 800 }}>
                                            {formatPercentValue(item.precision)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{ padding: '12px 14px', borderRadius: '16px', background: validation.recalibration.shouldRecalibrate ? 'rgba(255, 152, 0, 0.08)' : 'rgba(46, 125, 50, 0.08)', border: `1px solid ${validation.recalibration.shouldRecalibrate ? 'rgba(255, 152, 0, 0.18)' : 'rgba(46, 125, 50, 0.18)'}` }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '6px' }}>
                        {validation.recalibration.shouldRecalibrate ? 'Recalibracao automatica sugerida' : 'Modelo dentro da faixa de controle'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55 }}>
                        {validation.recalibration.shouldRecalibrate ? validation.recalibration.reason : 'Os pesos atuais permanecem adequados para o comportamento observado.'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55, marginTop: '8px' }}>
                        <strong>Antes:</strong> {formatWeightsLabel(
                            validation.recalibration.currentWeights || validation.weights,
                            validation.recalibration.currentCategoryWeights || validation.categoryWeights
                        )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55 }}>
                        <strong>Depois:</strong> {formatWeightsLabel(
                            validation.recalibration.recommendedWeights || validation.weights,
                            validation.recalibration.recommendedCategoryWeights || validation.categoryWeights
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ForecastPrecisionModule = ({ validation, onOpen }) => {
    if (!validation) {
        return null;
    }

    const hasValidationData = (
        validation.dailyMetrics.count > 0
        || validation.categoryMetrics.count > 0
        || validation.monthlyMetrics.count > 0
    );

    return (
        <button
            type="button"
            className="glass-card"
            onClick={onOpen}
            style={{
                width: '100%',
                marginBottom: '20px',
                textAlign: 'left',
                padding: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                gap: '14px',
                alignItems: 'center',
                border: `1px solid ${validation.status.color}20`,
                background: `linear-gradient(135deg, ${validation.status.color}10 0%, rgba(255, 255, 255, 0.92) 100%)`
            }}
        >
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldCheck size={18} color={validation.status.color} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: validation.status.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Precisao da Previsao
                    </span>
                </div>
                <div style={{ fontSize: '1.12rem', fontWeight: 800, color: 'var(--primary-blue)', marginBottom: '6px' }}>
                    {hasValidationData ? `${formatPercentValue(validation.overallPrecision)} de precisao media` : 'Base historica ainda insuficiente'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.5 }}>
                    {hasValidationData
                        ? `MAPE atual de ${formatPercentValue(validation.overallMape)}. ${validation.status.description}. Toque para abrir a validacao completa do algoritmo.`
                        : 'Assim que houver dias e meses suficientes para comparar previsao x gasto real, o modulo passara a medir a precisao automaticamente.'}
                </div>
            </div>
            <div style={{ minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: validation.status.color }}>
                    {hasValidationData ? `${Math.round(validation.overallPrecision)}%` : '--'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                    {hasValidationData ? validation.status.badge : 'Aguardando base'}
                </div>
            </div>
        </button>
    );
};

export const ForecastPrecisionView = ({ onBack }) => {
    const receiptsQuery = useLiveQuery(() => db.receipts.toArray());
    const productsQuery = useLiveQuery(() => db.products.toArray());
    const forecastModelConfigQuery = useLiveQuery(() => db.forecastModelConfigs.get('primary'));
    const receipts = useMemo(() => receiptsQuery || [], [receiptsQuery]);
    const products = useMemo(() => productsQuery || [], [productsQuery]);

    useEffect(() => {
        if (forecastModelConfigQuery) {
            return;
        }

        db.forecastModelConfigs.put({
            ...DEFAULT_FORECAST_MODEL_CONFIG,
            updatedAt: new Date().toISOString()
        });
    }, [forecastModelConfigQuery]);

    const modelConfig = useMemo(
        () => getForecastModelConfig(forecastModelConfigQuery || DEFAULT_FORECAST_MODEL_CONFIG),
        [forecastModelConfigQuery]
    );
    const dataset = useMemo(
        () => buildForecastDataset({ receipts, products }),
        [products, receipts]
    );
    const validation = useMemo(
        () => buildForecastValidationModule({
            dataset,
            modelConfig,
            referenceDate: new Date()
        }),
        [dataset, modelConfig]
    );
    const currentMonthInsight = useMemo(
        () => buildCurrentMonthReference({ dataset, modelConfig }),
        [dataset, modelConfig]
    );

    return (
        <ForecastPrecisionContent
            validation={validation}
            modelConfig={modelConfig}
            currentMonthInsight={currentMonthInsight}
            onBack={onBack}
        />
    );
};

export default ForecastPrecisionModule;
