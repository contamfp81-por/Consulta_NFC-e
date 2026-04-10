import React from 'react';
import {
    Activity,
    AlertTriangle,
    Candy,
    Leaf,
    Lightbulb,
    Minus,
    ShieldCheck,
    ShoppingBasket,
    TrendingDown,
    TrendingUp
} from 'lucide-react';

const GAUGE_SEGMENTS = [
    { start: 0, end: 50, color: '#F87171' },
    { start: 50, end: 70, color: '#FBBF24' },
    { start: 70, end: 85, color: '#A3E635' },
    { start: 85, end: 100, color: '#22C55E' }
];
const GAUGE_PATH = 'M 20 110 A 90 90 0 0 1 200 110';

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
                O grafico de evolucao alimentar sera preenchido apos os primeiros meses com itens classificados.
            </div>
        );
    }

    const width = 360;
    const height = 132;
    const paddingX = 14;
    const paddingY = 16;
    const usableWidth = width - (paddingX * 2);
    const usableHeight = height - (paddingY * 2);

    const xStep = series.length > 1 ? usableWidth / (series.length - 1) : 0;
    const yFromScore = (score) => height - paddingY - ((score / 100) * usableHeight);
    const positionedSeries = series.map((item, index) => ({
        ...item,
        x: paddingX + (index * xStep),
        y: item.hasData && Number.isFinite(item.score) ? yFromScore(item.score) : null
    }));
    const points = positionedSeries.filter((item) => item.hasData && Number.isFinite(item.score)).map((item) => ({
        x: item.x,
        y: item.y,
        label: item.label,
        score: item.score
    }));

    const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
    const areaPoints = points.length > 1
        ? `${points[0].x},${height - paddingY} ${polylinePoints} ${points[points.length - 1].x},${height - paddingY}`
        : '';

    return (
        <div className="isf-chart-shell">
            <svg viewBox={`0 0 ${width} ${height}`} className="isf-chart-svg" role="img" aria-label="Evolucao do indice de saude alimentar nos ultimos 6 meses">
                <defs>
                    <linearGradient id="foodHealthTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(34, 197, 94, 0.32)" />
                        <stop offset="100%" stopColor="rgba(34, 197, 94, 0.02)" />
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

                {points.length > 1 && <polygon points={areaPoints} fill="url(#foodHealthTrendFill)" className="isf-chart-area" />}
                {points.length > 1 && <polyline points={polylinePoints} className="isf-chart-line" style={{ stroke: '#22C55E' }} />}

                {points.map((point) => (
                    <g key={`${point.label}-${point.score}`}>
                        <circle cx={point.x} cy={point.y} r="4.5" className="isf-chart-dot" style={{ fill: '#BBF7D0' }} />
                        <circle cx={point.x} cy={point.y} r="2.5" className="isf-chart-dot-core" style={{ fill: '#166534' }} />
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

const componentIconMap = {
    qualidade: Leaf,
    acucar: Candy,
    comportamento: ShoppingBasket
};

const FoodHealthCard = ({ model, onOpenFoodGuide }) => {
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
                    <span className="eyebrow">Indice de saude alimentar</span>
                    <h2 className="isf-card-title">ISA inteligente do ciclo avaliado</h2>
                </div>
                <div className={`status-pill ${trendClassName}`}>
                    <TrendIcon direction={model.trendDirection} />
                    {trendLabel} vs ciclo anterior
                </div>
            </div>

            <div className="isf-hero-layout">
                <div className="isf-gauge-panel">
                    <div className="isf-gauge-shell">
                        <svg viewBox="0 0 220 140" className="isf-gauge-svg" role="img" aria-label={`Indice de saude alimentar em ${model.score} pontos`}>
                            <path d={GAUGE_PATH} pathLength="100" className="isf-gauge-track" />
                            {GAUGE_SEGMENTS.map((segment) => {
                                const segmentLength = segment.end - segment.start;

                                return (
                                    <path
                                        key={`${segment.start}-${segment.end}`}
                                        d={GAUGE_PATH}
                                        pathLength="100"
                                        stroke={segment.color}
                                        strokeDasharray={`${segmentLength} ${100 - segmentLength}`}
                                        strokeDashoffset={-segment.start}
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
                                <line x1="110" y1="110" x2="110" y2="26" className="isf-gauge-needle-line" />
                                <circle cx="110" cy="110" r="7" className="isf-gauge-needle-core" />
                            </g>
                        </svg>

                        <div className="isf-gauge-center">
                            <strong>{model.score}</strong>
                            <span>{model.status.label}</span>
                            <small>ISA Ajustado</small>
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
                            <strong>{model.formulaLabel}</strong>
                        </div>
                    </div>

                    <div className="isf-summary-copy">
                        <h3>Por que esse resultado</h3>
                        <p>{model.explanation}</p>
                        <small>{model.transparencyNote}</small>
                    </div>

                    <div className="isf-factor-grid">
                        <div className="isf-factor-card">
                            <span>ISA Base</span>
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
                            <small>Penaliza oscilacao brusca entre ciclos</small>
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
                    {model.breakdown.map((item) => {
                        const BreakdownIcon = componentIconMap[item.key] || Activity;

                        return (
                            <div key={item.key} className="isf-breakdown-item">
                                <div className="isf-breakdown-topline">
                                    <div>
                                        <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <BreakdownIcon size={16} />
                                            {item.label}
                                        </strong>
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
                                    <strong>{item.metricValueLabel || '--'}</strong>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="isf-decision-grid">
                <div className="isf-decision-card">
                    <div className="isf-decision-heading">
                        <AlertTriangle size={16} />
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

            <div 
                className="isf-trend-section isf-trend-clickable" 
                onClick={onOpenFoodGuide}
                title="Clique para entender o calculo do ISA"
            >
                <div className="section-heading">
                    <div>
                        <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Tendencia <Info size={12} />
                        </span>
                        <h2>Evolucao dos ultimos {model.monthlySeries.length} meses</h2>
                    </div>
                    <div className={`status-pill ${trendClassName}`}>
                        <TrendIcon direction={model.trendDirection} />
                        {model.projection.projectedNextScore} projetado
                    </div>
                </div>

                <TrendChart series={model.monthlySeries} />
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <small style={{ color: 'var(--primary-blue)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                        Como este indice e calculado? Clique para ver o guia completo
                    </small>
                </div>
            </div>
        </div>
    );
};

export default FoodHealthCard;

const styles = `
.isf-trend-clickable {
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    border: 1px solid transparent;
}
.isf-trend-clickable:hover {
    background: rgba(148, 163, 184, 0.08);
    border-color: rgba(96, 165, 250, 0.3);
    border-radius: 16px;
}
`;

if (typeof document !== 'undefined') {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}
