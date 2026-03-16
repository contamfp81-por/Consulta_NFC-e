import React, { useEffect, useMemo, useState } from 'react';
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
    Layers,
    ShieldCheck,
    TableProperties,
    TrendingUp,
    X
} from 'lucide-react';

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

const formatWeightsLabel = (weights = {}) => [
    `Media movel ${(Number(weights.movingAverage || 0) * 100).toFixed(0)}%`,
    `Tendencia ${(Number(weights.trend || 0) * 100).toFixed(0)}%`,
    `Sazonalidade ${(Number(weights.seasonality || 0) * 100).toFixed(0)}%`
].join(' | ');

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

const ForecastPrecisionModule = ({
    validation,
    modelConfig,
    currentMonthInsight
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState('daily');

    const tableRows = useMemo(
        () => buildTableRows(validation, selectedLevel),
        [selectedLevel, validation]
    );

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    if (!validation) {
        return null;
    }

    const hasValidationData = (
        validation.dailyMetrics.count > 0
        || validation.categoryMetrics.count > 0
        || validation.monthlyMetrics.count > 0
    );

    return (
        <>
            <button
                type="button"
                className="glass-card"
                onClick={() => setIsOpen(true)}
                style={{
                    width: '100%',
                    marginBottom: '20px',
                    textAlign: 'left',
                    padding: '18px',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
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
                <div style={{ minWidth: '110px', textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: validation.status.color }}>
                        {hasValidationData ? `${Math.round(validation.overallPrecision)}%` : '--'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                        {hasValidationData ? validation.status.badge : 'Aguardando base'}
                    </div>
                </div>
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1400,
                        background: 'rgba(15, 23, 42, 0.52)',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div
                        className="glass-card"
                        style={{
                            width: 'min(1120px, 100%)',
                            maxHeight: '92vh',
                            overflowY: 'auto',
                            margin: 0,
                            padding: '22px',
                            borderRadius: '24px',
                            background: 'rgba(255, 255, 255, 0.96)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <ShieldCheck size={20} color={validation.status.color} />
                                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Precisao da Previsao</h3>
                                </div>
                                <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.86rem', lineHeight: 1.55 }}>
                                    Modulo de validacao continua da previsao de gastos com comparacao entre previsto x real, MAPE, erro percentual, historico de desempenho e ajuste automatico de pesos.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                style={{
                                    background: 'rgba(148, 163, 184, 0.12)',
                                    border: 'none',
                                    borderRadius: '12px',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {validation.alertMessage && (
                            <div
                                style={{
                                    marginBottom: '18px',
                                    padding: '14px 16px',
                                    borderRadius: '16px',
                                    background: 'rgba(198, 40, 40, 0.08)',
                                    border: '1px solid rgba(198, 40, 40, 0.16)',
                                    color: '#8E1C1C',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px'
                                }}
                            >
                                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
                                    <strong>Alerta automatico:</strong> {validation.alertMessage}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px', marginBottom: '20px' }}>
                            <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(26, 35, 126, 0.06)' }}>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>Precisao geral</div>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: validation.status.color }}>
                                    {formatPercentValue(validation.overallPrecision)}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                    Status: {validation.status.badge}
                                </div>
                            </div>
                            <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(0, 229, 255, 0.08)' }}>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>MAPE atual</div>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>
                                    {formatPercentValue(validation.overallMape)}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                    Media do erro percentual absoluto.
                                </div>
                            </div>
                            <div style={{ padding: '18px', borderRadius: '18px', background: 'rgba(255, 152, 0, 0.08)' }}>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginBottom: '6px' }}>Erro medio diario</div>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>
                                    {formatCurrencyValue(validation.dailyMetrics.meanAbsoluteError)}
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

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '18px', marginBottom: '20px' }}>
                            <div style={{ padding: '18px', borderRadius: '20px', background: 'linear-gradient(135deg, rgba(26, 35, 126, 0.05) 0%, rgba(0, 229, 255, 0.08) 100%)', border: '1px solid rgba(26, 35, 126, 0.08)' }}>
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
                                    {formatPercentValue(validation.overallPrecision)}
                                </div>
                                <div style={{ fontSize: '0.84rem', color: 'var(--text-dark)', marginBottom: '10px' }}>
                                    Status: {validation.status.description}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.6 }}>
                                    MAPE atual de {formatPercentValue(validation.overallMape)}. Nivel diario em {formatPercentValue(validation.dailyMetrics.precision)}, por categoria em {formatPercentValue(validation.categoryMetrics.precision)} e no fechamento mensal em {formatPercentValue(validation.monthlyMetrics.precision)}.
                                </div>
                            </div>

                            <div style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <TrendingUp size={18} color="var(--primary-blue)" />
                                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Calculo automatico do erro</h4>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', lineHeight: 1.65, display: 'grid', gap: '8px' }}>
                                    <div><strong>Erro:</strong> Real - Previsto</div>
                                    <div><strong>Erro %:</strong> |Real - Previsto| / Real x 100</div>
                                    <div><strong>Precisao:</strong> 100 - Erro percentual</div>
                                    <div><strong>MAPE:</strong> media do erro percentual absoluto</div>
                                    {currentMonthInsight?.projectedTotal ? (
                                        <div><strong>Base atual:</strong> fechamento provavel em {formatCurrencyValue(currentMonthInsight.projectedTotal)}</div>
                                    ) : null}
                                </div>
                                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(148, 163, 184, 0.18)', fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.6 }}>
                                    Pesos ativos: {formatWeightsLabel(validation.weights)}
                                    {modelConfig?.lastRecalibratedAt ? ` | Ultima recalibracao: ${modelConfig.lastRecalibratedAt}` : ''}
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(148, 163, 184, 0.18)', marginBottom: '20px' }}>
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
                            <div style={{ overflow: 'auto', maxHeight: '320px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
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
                                                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: 700 }}>{row.reference}</td>
                                                <td style={{ padding: '10px 8px', minWidth: '140px' }}>{row.scope}</td>
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
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '18px', marginBottom: '20px' }}>
                            <div style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <TrendingUp size={18} color="var(--primary-blue)" />
                                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Grafico 1 - Previsao x gasto real</h4>
                                </div>
                                <div style={{ height: '280px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={validation.comparisonChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} fontSize={11} />
                                            <YAxis axisLine={false} tickLine={false} fontSize={11} tickFormatter={(value) => `R$ ${Number(value || 0).toFixed(0)}`} />
                                            <Tooltip formatter={(value) => formatCurrencyValue(value)} />
                                            <Line type="monotone" dataKey="previsto" stroke="#1A237E" strokeWidth={3} dot={false} name="Previsto" />
                                            <Line type="monotone" dataKey="real" stroke="#2E7D32" strokeWidth={3} dot={false} name="Real" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <Layers size={18} color="var(--primary-blue)" />
                                    <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Grafico 2 - Evolucao da precisao</h4>
                                </div>
                                <div style={{ height: '280px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={validation.weeklyPrecisionData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                                            <XAxis dataKey="week" axisLine={false} tickLine={false} fontSize={11} />
                                            <YAxis axisLine={false} tickLine={false} fontSize={11} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                                            <Tooltip formatter={(value) => formatPercentValue(value)} />
                                            <Bar dataKey="precision" fill={validation.status.color} radius={[10, 10, 0, 0]} name="Precisao" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: '18px' }}>
                            <div style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                                <h4 style={{ margin: '0 0 12px', fontSize: '0.98rem' }}>Historico de desempenho do modelo</h4>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {validation.monthlyRecords.length > 0 ? validation.monthlyRecords.map((record) => (
                                        <div key={record.key} style={{ padding: '12px', borderRadius: '14px', background: 'rgba(26, 35, 126, 0.04)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
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

                            <div style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                                <h4 style={{ margin: '0 0 12px', fontSize: '0.98rem' }}>Precisao por categoria e recalibracao</h4>
                                <div style={{ overflow: 'auto', maxHeight: '280px', marginBottom: '14px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
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
                                                    <td style={{ padding: '8px 6px', fontWeight: 700 }}>{item.categoryName}</td>
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

                                <div style={{ padding: '12px 14px', borderRadius: '16px', background: validation.recalibration.shouldRecalibrate ? 'rgba(255, 152, 0, 0.08)' : 'rgba(46, 125, 50, 0.08)', border: `1px solid ${validation.recalibration.shouldRecalibrate ? 'rgba(255, 152, 0, 0.18)' : 'rgba(46, 125, 50, 0.18)'}` }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '6px' }}>
                                        {validation.recalibration.shouldRecalibrate ? 'Recalibracao automatica sugerida' : 'Modelo dentro da faixa de controle'}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55 }}>
                                        {validation.recalibration.shouldRecalibrate ? validation.recalibration.reason : 'Os pesos atuais permanecem adequados para o comportamento observado.'}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55, marginTop: '8px' }}>
                                        <strong>Antes:</strong> {formatWeightsLabel(validation.recalibration.currentWeights || validation.weights)}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', lineHeight: 1.55 }}>
                                        <strong>Depois:</strong> {formatWeightsLabel(validation.recalibration.recommendedWeights || validation.weights)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ForecastPrecisionModule;
