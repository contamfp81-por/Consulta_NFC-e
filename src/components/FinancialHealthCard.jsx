import React from 'react';
import {
    Activity,
    AlertTriangle,
    Lightbulb,
    Minus,
    ShieldCheck,
    TrendingDown,
    TrendingUp
} from 'lucide-react';
import { formatCurrency } from '../utils/financeInsights';

const GAUGE_SEGMENTS = [
    { start: 0, end: 49, color: '#EF4444' },
    { start: 49, end: 69, color: '#F59E0B' },
    { start: 69, end: 84, color: '#FACC15' },
    { start: 84, end: 100, color: '#22C55E' }
];

const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
};

const describeArc = (centerX, centerY, radius, startAngle, endAngle) => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1';

    return [
        'M', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
};

const scoreToArcAngles = (startValue, endValue) => ({
    startAngle: 180 - ((startValue / 100) * 180),
    endAngle: 180 - ((endValue / 100) * 180)
});

const TrendIcon = ({ direction }) => {
    if (direction === 'up') {
        return <TrendingUp size={16} />;
    }

    if (direction === 'down') {
        return <TrendingDown size={16} />;
    }

    return <Minus size={16} />;
};

const TrendChart = ({ series = [] }) => {
    const validSeries = series.filter((item) => item.hasData && Number.isFinite(item.score));

    if (!validSeries.length) {
        return (
            <div className="isf-chart-empty">
                O grafico de evolucao sera preenchido apos os primeiros meses completos.
            </div>
        );
    }

    const width = 360;
    const height = 132;
    const paddingX = 14;
    const paddingY = 16;
    const usableWidth = width - (paddingX * 2);
    const usableHeight = height - (paddingY * 2);

    const xStep = validSeries.length > 1 ? usableWidth / (validSeries.length - 1) : 0;
    const yFromScore = (score) => height - paddingY - ((score / 100) * usableHeight);
    const points = validSeries.map((item, index) => ({
        x: paddingX + (index * xStep),
        y: yFromScore(item.score),
        label: item.label,
        score: item.score
    }));

    const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
    const areaPoints = `0,${height} ${polylinePoints} ${width},${height}`;

    return (
        <div className="isf-chart-shell">
            <svg viewBox={`0 0 ${width} ${height}`} className="isf-chart-svg" role="img" aria-label="Evolucao do indice nos ultimos 6 meses">
                <defs>
                    <linearGradient id="isfTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(96, 165, 250, 0.34)" />
                        <stop offset="100%" stopColor="rgba(96, 165, 250, 0.02)" />
                    </linearGradient>
                </defs>

                {[0, 50, 100].map((tick) => (
                    <line
                        key={tick}
                        x1="0"
                        y1={yFromScore(tick)}
                        x2={width}
                        y2={yFromScore(tick)}
                        className="isf-chart-grid"
                    />
                ))}

                <polygon points={areaPoints} className="isf-chart-area" />
                <polyline points={polylinePoints} className="isf-chart-line" />

                {points.map((point) => (
                    <g key={`${point.label}-${point.score}`}>
                        <circle cx={point.x} cy={point.y} r="4.5" className="isf-chart-dot" />
                        <circle cx={point.x} cy={point.y} r="2.5" className="isf-chart-dot-core" />
                    </g>
                ))}
            </svg>

            <div className="isf-chart-labels">
                {series.map((item) => (
                    <div key={item.monthKey} className="isf-chart-label">
                        <span>{item.label}</span>
                        <strong>{item.hasData && Number.isFinite(item.score) ? item.score : '--'}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FinancialHealthCard = ({ model }) => {
    const pointerRotation = (Number(model?.score) - 50) * 1.8;
    const trendLabel = model?.trendDirection === 'up'
        ? `+${Math.abs(model.trendDelta)}`
        : model?.trendDirection === 'down'
            ? `-${Math.abs(model.trendDelta)}`
            : '0';
    const trendClassName = model?.trendDirection === 'up'
        ? 'positive'
        : model?.trendDirection === 'down'
            ? 'negative'
            : 'neutral';

    return (
        <div className="isf-card-shell">
            <div className="hero-card-heading">
                <div>
                    <span className="eyebrow">Indice de saude financeira</span>
                    <h2 className="isf-card-title">ISF inteligente do ciclo atual</h2>
                </div>
                <div className={`status-pill ${trendClassName}`}>
                    <TrendIcon direction={model.trendDirection} />
                    {trendLabel} vs periodo anterior
                </div>
            </div>

            <div className="isf-hero-layout">
                <div className="isf-gauge-panel">
                    <div className="isf-gauge-shell">
                        <svg viewBox="0 0 220 140" className="isf-gauge-svg" role="img" aria-label={`Indice de saude financeira em ${model.score} pontos`}>
                            <path d={describeArc(110, 110, 78, 180, 0)} className="isf-gauge-track" />
                            {GAUGE_SEGMENTS.map((segment) => {
                                const angles = scoreToArcAngles(segment.start, segment.end);

                                return (
                                    <path
                                        key={`${segment.start}-${segment.end}`}
                                        d={describeArc(110, 110, 78, angles.startAngle, angles.endAngle)}
                                        stroke={segment.color}
                                        className="isf-gauge-segment"
                                    />
                                );
                            })}

                            <g
                                className="isf-gauge-needle"
                                style={{
                                    transform: `rotate(${pointerRotation}deg)`,
                                    transformOrigin: '110px 110px'
                                }}
                            >
                                <line x1="110" y1="110" x2="110" y2="38" className="isf-gauge-needle-line" />
                                <circle cx="110" cy="110" r="7" className="isf-gauge-needle-core" />
                            </g>
                        </svg>

                        <div className="isf-gauge-center">
                            <strong>{model.score}</strong>
                            <span>{model.status.label}</span>
                            <small>ISF Ajustado</small>
                        </div>
                    </div>

                    <div className="isf-gauge-footer">
                        <div className="isf-gauge-scale">
                            <span>0</span>
                            <span>100</span>
                        </div>
                        <p>{model.status.description}</p>
                    </div>
                </div>

                <div className="isf-summary-panel">
                    <div className="isf-summary-card">
                        <div className="isf-summary-icon">
                            <ShieldCheck size={18} />
                        </div>
                        <div>
                            <span className="isf-summary-label">Formula aplicada</span>
                            <strong>Alimentacao 40% | Essenciais 30% | Discricionario 30%</strong>
                        </div>
                    </div>

                    <div className="isf-summary-copy">
                        <h3>Por que esse resultado</h3>
                        <p>{model.explanation}</p>
                        <small>{model.transparencyNote}</small>
                    </div>

                    <div className="isf-factor-grid">
                        <div className="isf-factor-card">
                            <span>ISF Base</span>
                            <strong>{model.baseScore}</strong>
                            <small>Antes dos ajustes de tendencia</small>
                        </div>
                        <div className="isf-factor-card">
                            <span>Fator Tendencia</span>
                            <strong>{model.trendFactor.toFixed(2)}x</strong>
                            <small>Premia melhora e pune deterioracao</small>
                        </div>
                        <div className="isf-factor-card">
                            <span>Fator Consistencia</span>
                            <strong>{model.consistencyFactor.toFixed(2)}x</strong>
                            <small>Penaliza oscilacao brusca entre meses</small>
                        </div>
                    </div>
                </div>
            </div>

            <div className="isf-breakdown-section">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow">Transparencia</span>
                        <h2>Breakdown do indice</h2>
                    </div>
                </div>

                <div className="isf-breakdown-list">
                    {model.breakdown.map((item) => (
                        <div key={item.key} className="isf-breakdown-item">
                            <div className="isf-breakdown-topline">
                                <div>
                                    <strong>{item.label}</strong>
                                    <small>Peso {(item.weight * 100).toFixed(0)}% | contribuicao {item.weightedContribution.toFixed(1)}</small>
                                </div>
                                <span style={{ color: item.color }}>{item.score}</span>
                            </div>
                            <div className="isf-progress-track">
                                <div
                                    className="isf-progress-fill"
                                    style={{
                                        width: `${item.score}%`,
                                        background: `linear-gradient(90deg, ${item.color} 0%, rgba(255,255,255,0.82) 100%)`
                                    }}
                                />
                            </div>
                            <div className="isf-breakdown-meta">
                                <span>{item.note}</span>
                                {item.key === 'alimentacao' && (
                                    <strong>{formatCurrency(item.currentSpend)}</strong>
                                )}
                                {item.key === 'essenciais' && (
                                    <strong>{formatCurrency(item.currentSpend)}</strong>
                                )}
                                {item.key === 'discricionario' && (
                                    <strong>{formatCurrency(item.currentSpend)}</strong>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="isf-decision-grid">
                <div className="isf-decision-card">
                    <div className="isf-decision-heading">
                        <Activity size={16} />
                        <span>Insights automaticos</span>
                    </div>
                    <div className="isf-message-list">
                        {model.insights.map((insight) => (
                            <div key={insight} className="isf-message-item">
                                <AlertTriangle size={16} />
                                <p>{insight}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="isf-decision-card">
                    <div className="isf-decision-heading">
                        <Lightbulb size={16} />
                        <span>Como melhorar</span>
                    </div>
                    <div className="isf-message-list">
                        {model.recommendations.map((recommendation) => (
                            <div key={recommendation} className="isf-message-item isf-message-item-highlight">
                                <Lightbulb size={16} />
                                <p>{recommendation}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="isf-trend-section">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow">Tendencia</span>
                        <h2>Evolucao dos ultimos 6 meses</h2>
                    </div>
                    <div className={`status-pill ${trendClassName}`}>
                        <TrendIcon direction={model.trendDirection} />
                        {model.projection.projectedNextScore} projetado
                    </div>
                </div>

                <TrendChart series={model.monthlySeries} />
            </div>
        </div>
    );
};

export default FinancialHealthCard;

