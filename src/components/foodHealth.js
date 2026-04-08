import { analyzeFoodPurchases } from './foodAnalysis';
import { getMonthKey, toLocalDate } from './date';
import { withInsightWhy } from './insightNarrative';

const QUALITY_WEIGHT = 0.4;
const SUGAR_WEIGHT = 0.3;
const BEHAVIOR_WEIGHT = 0.3;
const MONTH_WINDOW = 6;
const BASELINE_WINDOW = 3;

const STATUS_BANDS = [
    {
        min: 85,
        label: 'Excelente',
        tone: 'positive',
        color: '#22C55E',
        description: 'Sua cesta favorece itens naturais, acucar sob controle e compras mais planejadas.'
    },
    {
        min: 70,
        label: 'Boa',
        tone: 'stable',
        color: '#A3E635',
        description: 'A saude alimentar esta funcional, com poucos pontos de atencao no ciclo analisado.'
    },
    {
        min: 50,
        label: 'Atencao',
        tone: 'warning',
        color: '#F59E0B',
        description: 'Ha sinais relevantes de ultraprocessados, acucar ou compra reativa afetando a qualidade da alimentacao.'
    },
    {
        min: 0,
        label: 'Critica',
        tone: 'negative',
        color: '#EF4444',
        description: 'O padrao recente concentrou fatores que puxam a qualidade alimentar para baixo e pedem correcao rapida.'
    }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safeNumber = (value) => Number(value) || 0;
const average = (values = []) => (
    values.length
        ? values.reduce((sum, value) => sum + safeNumber(value), 0) / values.length
        : 0
);
const roundToOneDecimal = (value) => Math.round(safeNumber(value) * 10) / 10;
const formatPercent = (value, digits = 1) => `${safeNumber(value).toFixed(digits)}%`;

const formatMonthLabel = (monthKey) => {
    if (!monthKey) return '--';

    const [year, month] = String(monthKey).split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, 1);
    if (Number.isNaN(date.getTime())) {
        return monthKey;
    }

    return date.toLocaleDateString('pt-BR', { month: 'short' })
        .replace('.', '')
        .replace(/^\w/, (letter) => letter.toUpperCase());
};

const buildMonthKeys = (referenceDate = new Date(), windowSize = MONTH_WINDOW) => {
    const safeReferenceDate = toLocalDate(referenceDate) || new Date();
    const keys = [];

    for (let index = windowSize - 1; index >= 0; index -= 1) {
        const date = new Date(safeReferenceDate.getFullYear(), safeReferenceDate.getMonth() - index, 1);
        keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    return keys;
};

const getMonthReferenceDate = (monthKey, referenceDate = new Date()) => {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    const safeReferenceDate = toLocalDate(referenceDate) || new Date();

    if (!year || !month) {
        return safeReferenceDate;
    }

    if (
        safeReferenceDate.getFullYear() === year
        && (safeReferenceDate.getMonth() + 1) === month
    ) {
        return safeReferenceDate;
    }

    return new Date(year, month, 0, 12, 0, 0, 0);
};

const collectPreviousValues = (series = [], currentIndex, selector, windowSize = BASELINE_WINDOW) => {
    const values = [];

    for (let index = currentIndex - 1; index >= 0 && values.length < windowSize; index -= 1) {
        const item = series[index];
        if (!item?.hasData) {
            continue;
        }

        values.push(safeNumber(selector(item)));
    }

    return values;
};

const calculateStandardDeviation = (values = []) => {
    if (values.length <= 1) {
        return 0;
    }

    const mean = average(values);
    const variance = average(values.map((value) => ((value - mean) ** 2)));
    return Math.sqrt(variance);
};

const calculateMonthOverMonthDelta = (series = [], index) => {
    const current = series[index];
    if (!current?.hasData) {
        return 0;
    }

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const previous = series[cursor];
        if (previous?.hasData && Number.isFinite(previous.baseScore)) {
            return current.baseScore - previous.baseScore;
        }
    }

    return 0;
};

const calculateTrendFactor = (series = [], index) => {
    const delta = calculateMonthOverMonthDelta(series, index);
    return clamp(1 + (delta / 200), 0.92, 1.08);
};

const calculateConsistencyFactor = (series = [], index) => {
    const trailingScores = series
        .slice(Math.max(0, index - (MONTH_WINDOW - 1)), index + 1)
        .filter((item) => item?.hasData && Number.isFinite(item.baseScore))
        .map((item) => item.baseScore);

    const standardDeviation = calculateStandardDeviation(trailingScores);

    if (trailingScores.length < 3) {
        return { factor: 1, volatility: standardDeviation };
    }

    if (standardDeviation <= 4) {
        return { factor: 1.02, volatility: standardDeviation };
    }

    if (standardDeviation <= 8) {
        return { factor: 1, volatility: standardDeviation };
    }

    if (standardDeviation <= 12) {
        return { factor: 0.96, volatility: standardDeviation };
    }

    return { factor: 0.92, volatility: standardDeviation };
};

const getStatusFromScore = (score) => (
    STATUS_BANDS.find((band) => score >= band.min) || STATUS_BANDS[STATUS_BANDS.length - 1]
);

const resolveNaturalBonus = (naturalPercentage) => {
    if (naturalPercentage >= 55) return 6;
    if (naturalPercentage >= 40) return 3;
    return 0;
};

const resolveUltraPenalty = (ultraprocessedPercentage) => {
    if (ultraprocessedPercentage >= 35) return 18;
    if (ultraprocessedPercentage >= 25) return 10;
    if (ultraprocessedPercentage >= 15) return 5;
    return 0;
};

const resolveSugarNightPenalty = (nighttimeSugaryShare) => {
    if (nighttimeSugaryShare >= 0.6) return 10;
    if (nighttimeSugaryShare >= 0.4) return 5;
    return 0;
};

const resolveBehaviorPatternPenalty = ({
    totalFlagged = 0,
    nighttimePattern = false,
    saturdayPattern = false
} = {}) => {
    let penalty = 0;

    if (totalFlagged >= 4) {
        penalty += 10;
    } else if (totalFlagged >= 2) {
        penalty += 5;
    }

    if (nighttimePattern) {
        penalty += 6;
    }

    if (saturdayPattern) {
        penalty += 4;
    }

    return penalty;
};

const calculateQualityScore = ({
    qualityIndex = 0,
    naturalPercentage = 0,
    ultraprocessedPercentage = 0,
    totalSpend = 0
} = {}) => {
    const naturalBonus = resolveNaturalBonus(naturalPercentage);
    const ultraPenalty = resolveUltraPenalty(ultraprocessedPercentage);
    const score = clamp(Math.round(safeNumber(qualityIndex) + naturalBonus - ultraPenalty), 0, 100);

    return {
        key: 'qualidade',
        label: 'Qualidade da cesta',
        score,
        weight: QUALITY_WEIGHT,
        weightedContribution: roundToOneDecimal(score * QUALITY_WEIGHT),
        qualityIndex: safeNumber(qualityIndex),
        naturalPercentage: safeNumber(naturalPercentage),
        ultraprocessedPercentage: safeNumber(ultraprocessedPercentage),
        totalSpend: safeNumber(totalSpend),
        naturalBonus,
        ultraPenalty,
        color: '#22C55E',
        metricValueLabel: `${formatPercent(naturalPercentage)} natural | ${formatPercent(ultraprocessedPercentage)} ultra`,
        note: ultraPenalty > 0
            ? `${formatPercent(ultraprocessedPercentage)} da cesta ficou em ultraprocessados no ciclo avaliado.`
            : naturalBonus > 0
                ? `${formatPercent(naturalPercentage)} do gasto alimentar ficou em itens naturais ou saudaveis.`
                : 'A composicao da cesta ficou proxima do padrao alimentar esperado.'
    };
};

const calculateSugarScore = ({
    sugaryShare = 0,
    classification = 'baixo',
    nighttimeSugaryShare = 0,
    sugarySpend = 0
} = {}) => {
    const nightPenalty = resolveSugarNightPenalty(nighttimeSugaryShare);
    const baseScore = 100 - (safeNumber(sugaryShare) * 1.8);
    const score = clamp(Math.round(baseScore - nightPenalty), 0, 100);

    return {
        key: 'acucar',
        label: 'Controle de acucar',
        score,
        weight: SUGAR_WEIGHT,
        weightedContribution: roundToOneDecimal(score * SUGAR_WEIGHT),
        sugaryShare: safeNumber(sugaryShare),
        classification,
        nighttimeSugaryShare: safeNumber(nighttimeSugaryShare),
        sugarySpend: safeNumber(sugarySpend),
        nightPenalty,
        color: '#F97316',
        metricValueLabel: `${formatPercent(sugaryShare)} da cesta | noite ${formatPercent(nighttimeSugaryShare * 100)}`,
        note: safeNumber(sugaryShare) >= 25
            ? `${formatPercent(sugaryShare)} do gasto alimentar ficou em itens doces ou acucarados.`
            : nightPenalty > 0
                ? `${formatPercent(nighttimeSugaryShare * 100)} dos itens acucarados foram comprados a noite.`
                : 'A participacao de doces e itens acucarados ficou sob controle.'
    };
};

const calculateBehaviorScore = ({
    impulsivityScore = 0,
    classification = 'baixo',
    totalFlagged = 0,
    nighttimePattern = false,
    saturdayPattern = false
} = {}) => {
    const patternPenalty = resolveBehaviorPatternPenalty({
        totalFlagged,
        nighttimePattern,
        saturdayPattern
    });
    const baseScore = 100 - (safeNumber(impulsivityScore) * 8);
    const score = clamp(Math.round(baseScore - patternPenalty), 0, 100);

    return {
        key: 'comportamento',
        label: 'Planejamento e impulso',
        score,
        weight: BEHAVIOR_WEIGHT,
        weightedContribution: roundToOneDecimal(score * BEHAVIOR_WEIGHT),
        impulsivityScore: safeNumber(impulsivityScore),
        classification,
        totalFlagged: safeNumber(totalFlagged),
        nighttimePattern: Boolean(nighttimePattern),
        saturdayPattern: Boolean(saturdayPattern),
        patternPenalty,
        color: '#60A5FA',
        metricValueLabel: `${safeNumber(totalFlagged)} compra(s) sinalizadas | impulso ${safeNumber(impulsivityScore).toFixed(1)}/10`,
        note: totalFlagged > 0
            ? `${safeNumber(totalFlagged)} compra(s) do ciclo foram marcadas como mais reativas ou fora do padrao.`
            : 'Nao houve sinais fortes de compra alimentar por impulso no ciclo avaliado.'
    };
};

const calculateBaseScore = ({
    qualidade = 0,
    acucar = 0,
    comportamento = 0
} = {}) => Math.round(
    (safeNumber(qualidade) * QUALITY_WEIGHT)
    + (safeNumber(acucar) * SUGAR_WEIGHT)
    + (safeNumber(comportamento) * BEHAVIOR_WEIGHT)
);

const calculateAdjustedScore = ({
    qualidade = 0,
    acucar = 0,
    comportamento = 0,
    trendFactor = 1,
    consistencyFactor = 1
} = {}) => {
    const base = calculateBaseScore({ qualidade, acucar, comportamento });
    const adjusted = clamp(Math.round(base * trendFactor * consistencyFactor), 0, 100);

    return {
        base,
        adjusted
    };
};

const buildProjection = (series = []) => {
    const dataPoints = series.filter((item) => item.hasData && Number.isFinite(item.adjustedScore));
    const current = dataPoints.at(-1);
    const previous = dataPoints.at(-2);

    if (!current || !previous) {
        return {
            projectedNextScore: current?.adjustedScore || 0,
            delta: 0,
            message: withInsightWhy(
                'Continue registrando compras em meses completos para destravar uma projecao alimentar mais precisa',
                'sem ao menos dois ciclos comparaveis o modelo ainda nao consegue diferenciar tendencia real de oscilacao pontual'
            )
        };
    }

    const delta = current.adjustedScore - previous.adjustedScore;
    const projectedNextScore = clamp(Math.round(current.adjustedScore + delta), 0, 100);

    return {
        projectedNextScore,
        delta,
        message: delta < -2
            ? withInsightWhy(
                `Se o padrao atual continuar, o ISA pode cair para ${projectedNextScore} no proximo ciclo`,
                `o ultimo mes ficou ${Math.abs(delta)} ponto(s) abaixo do anterior e projeta nova perda de qualidade alimentar`
            )
            : delta > 2
                ? withInsightWhy(
                    `Mantendo o ritmo atual, o ISA pode avancar para ${projectedNextScore} no proximo ciclo`,
                    `o ultimo mes ganhou ${Math.abs(delta)} ponto(s) frente ao anterior e reforca uma tendencia positiva`
                )
                : withInsightWhy(
                    'O comportamento recente indica estabilidade alimentar para o proximo ciclo',
                    'a diferenca entre os dois ultimos meses foi pequena e nao aponta mudanca brusca na qualidade da cesta'
                )
    };
};

const buildPrimaryDriverText = (component) => {
    if (!component) {
        return withInsightWhy(
            'Sem dados suficientes para identificar o principal vetor do indice alimentar',
            'a base atual ainda nao reuniu itens classificados o bastante para separar o bloco que mais pesou no resultado'
        );
    }

    if (component.key === 'qualidade') {
        if (component.ultraPenalty > 0) {
            return withInsightWhy(
                'O principal freio do ISA veio da composicao da cesta',
                `${formatPercent(component.ultraprocessedPercentage)} do gasto alimentar ficou em ultraprocessados e reduziu a nota nutricional do ciclo`
            );
        }

        return withInsightWhy(
            'A composicao da cesta sustentou bem o indice alimentar',
            `${formatPercent(component.naturalPercentage)} do gasto ficou em itens naturais ou saudaveis e ajudou a segurar a nota do ciclo`
        );
    }

    if (component.key === 'acucar' && component.sugaryShare > 0) {
        return withInsightWhy(
            'O controle de acucar foi o principal ponto de pressao do ciclo',
            `${formatPercent(component.sugaryShare)} do gasto alimentar ficou concentrado em itens doces ou bebidas adocicadas`
        );
    }

    if (component.key === 'comportamento' && component.totalFlagged > 0) {
        return withInsightWhy(
            'O comportamento de compra puxou o indice para baixo',
            `${component.totalFlagged} compra(s) foram marcadas como mais impulsivas ou fora do seu padrao alimentar`
        );
    }

    return withInsightWhy(
        `${component.label} ajudou a sustentar o ISA do ciclo`,
        `esse bloco terminou o periodo com score ${component.score}/100 e contribuiu para estabilizar a nota alimentar`
    );
};

const resolvePointGain = (deltaScore, weight, trendFactor, consistencyFactor) => Math.max(
    1,
    Math.round(Math.max(0, deltaScore) * weight * trendFactor * consistencyFactor)
);

const buildInsights = ({
    currentMonth,
    projection,
    analysis
} = {}) => {
    const insights = [];
    const components = currentMonth?.breakdown || [];
    const lowestComponent = [...components].sort((left, right) => left.score - right.score)[0];

    if (safeNumber(currentMonth?.trendDelta) > 0) {
        insights.push(withInsightWhy(
            `Seu ISA melhorou ${Math.abs(currentMonth.trendDelta)} ponto(s) em relacao ao ciclo anterior`,
            'a combinacao entre qualidade da cesta, controle de acucar e planejamento de compra fechou melhor do que no periodo anterior'
        ));
    } else if (safeNumber(currentMonth?.trendDelta) < 0) {
        insights.push(withInsightWhy(
            `Seu ISA caiu ${Math.abs(currentMonth.trendDelta)} ponto(s) em relacao ao ciclo anterior`,
            'o ciclo atual perdeu equilibrio nutricional ou comportamental frente ao periodo imediatamente anterior'
        ));
    }

    if (lowestComponent) {
        insights.push(buildPrimaryDriverText(lowestComponent));
    }

    if (safeNumber(currentMonth?.acucar?.sugaryShare) >= 15) {
        insights.push(withInsightWhy(
            `Itens acucarados responderam por ${formatPercent(currentMonth.acucar.sugaryShare)} da cesta do ciclo`,
            'essa fatia ja e alta o bastante para distorcer a qualidade geral das compras alimentares'
        ));
    }

    if (safeNumber(currentMonth?.comportamento?.totalFlagged) > 0) {
        insights.push(withInsightWhy(
            `${currentMonth.comportamento.totalFlagged} compra(s) foram marcadas como mais reativas`,
            'o modelo encontrou sinais como horario noturno, itens fora do padrao ou ticket acima do comportamento habitual'
        ));
    }

    if (analysis?.alerts?.length) {
        insights.push(analysis.alerts[0]);
    }

    if (projection?.delta < -2) {
        insights.push(projection.message);
    }

    return insights.filter(Boolean).slice(0, 4);
};

const buildRecommendations = ({
    currentMonth,
    projection,
    pendingReviewCount = 0
} = {}) => {
    const recommendations = [];

    if (!currentMonth) {
        return recommendations;
    }

    const { qualidade, acucar, comportamento, trendFactor, consistencyFactor } = currentMonth;

    if (safeNumber(qualidade?.ultraprocessedPercentage) >= 15) {
        const targetUltra = qualidade.ultraprocessedPercentage >= 35 ? 25 : 15;
        const nextPenalty = resolveUltraPenalty(targetUltra);
        const nextScore = clamp(
            Math.round(qualidade.qualityIndex + qualidade.naturalBonus - nextPenalty),
            0,
            100
        );
        const pointGain = resolvePointGain(
            nextScore - qualidade.score,
            qualidade.weight,
            trendFactor,
            consistencyFactor
        );

        recommendations.push(
            `Reduzir cerca de ${Math.ceil(Math.max(0, qualidade.ultraprocessedPercentage - targetUltra))} p.p. de ultraprocessados pode devolver aproximadamente +${pointGain} ponto(s) ao ISA.`
        );
    }

    if (safeNumber(acucar?.sugaryShare) >= 8) {
        const targetSugar = acucar.sugaryShare >= 25 ? 15 : 8;
        const nextNightPenalty = acucar.nightPenalty;
        const nextScore = clamp(
            Math.round(100 - (targetSugar * 1.8) - nextNightPenalty),
            0,
            100
        );
        const pointGain = resolvePointGain(
            nextScore - acucar.score,
            acucar.weight,
            trendFactor,
            consistencyFactor
        );

        recommendations.push(
            `Trazer os itens acucarados para perto de ${formatPercent(targetSugar, 0)} da cesta pode recuperar aproximadamente +${pointGain} ponto(s) no indice.`
        );
    }

    if (safeNumber(comportamento?.totalFlagged) > 0 || comportamento?.nighttimePattern || comportamento?.saturdayPattern) {
        const nextPenalty = resolveBehaviorPatternPenalty({
            totalFlagged: Math.max(0, safeNumber(comportamento.totalFlagged) - 2),
            nighttimePattern: false,
            saturdayPattern: false
        });
        const nextScore = clamp(
            Math.round(100 - (comportamento.impulsivityScore * 8) - nextPenalty),
            0,
            100
        );
        const pointGain = resolvePointGain(
            nextScore - comportamento.score,
            comportamento.weight,
            trendFactor,
            consistencyFactor
        );

        recommendations.push(
            `Reduzir compras alimentares noturnas ou fora do padrao pode devolver cerca de +${pointGain} ponto(s) e melhorar a previsibilidade da cesta.`
        );
    }

    if (pendingReviewCount > 0) {
        recommendations.push(`Classifique os ${pendingReviewCount} item(ns) pendentes para refinar automaticamente o ISA nas proximas leituras.`);
    }

    if (projection?.delta < -2) {
        recommendations.push(projection.message);
    }

    if (!recommendations.length) {
        recommendations.push('O padrao alimentar esta consistente. O melhor proximo passo e preservar esse ritmo por mais um ciclo completo.');
    }

    return recommendations.slice(0, 4);
};

const buildMonthSnapshot = ({
    receipts = [],
    products = [],
    productAliases = [],
    foodClassificationOverrides = [],
    monthKey = '',
    referenceDate = new Date()
} = {}) => {
    const monthReceipts = receipts.filter((receipt) => getMonthKey(receipt.date) === monthKey);
    const monthReceiptIds = new Set(monthReceipts.map((receipt) => receipt.id));
    const monthProducts = products.filter((product) => monthReceiptIds.has(product.receiptId));
    const monthReferenceDate = getMonthReferenceDate(monthKey, referenceDate);
    const analysis = analyzeFoodPurchases({
        receipts: monthReceipts,
        products: monthProducts,
        productAliases,
        foodClassificationOverrides,
        referenceDate: monthReferenceDate
    });
    const monthSummary = analysis?.trend?.currentMonth || {};
    const quality = calculateQualityScore({
        qualityIndex: monthSummary.qualityIndex,
        naturalPercentage: monthSummary.naturalPercentage,
        ultraprocessedPercentage: monthSummary.ultraprocessedPercentage,
        totalSpend: monthSummary.totalSpend
    });
    const sugar = calculateSugarScore({
        sugaryShare: analysis?.sugar?.score,
        classification: analysis?.sugar?.classification,
        nighttimeSugaryShare: analysis?.sugar?.nighttimeSugaryShare,
        sugarySpend: analysis?.sugar?.sugarySpend
    });
    const behavior = calculateBehaviorScore({
        impulsivityScore: analysis?.impulsivity?.score,
        classification: analysis?.impulsivity?.classification,
        totalFlagged: analysis?.impulsivity?.totalFlagged,
        nighttimePattern: analysis?.impulsivity?.nighttimePattern,
        saturdayPattern: analysis?.impulsivity?.saturdayPattern
    });
    const hasData = safeNumber(analysis?.meta?.totalItemsAnalyzed) > 0;

    return {
        monthKey,
        label: formatMonthLabel(monthKey),
        monthReferenceDate,
        analysis,
        summary: monthSummary,
        qualidade: quality,
        acucar: sugar,
        comportamento: behavior,
        pendingReviewCount: safeNumber(analysis?.meta?.pendingReviewCount),
        hasData
    };
};

export const construirIndiceSaudeAlimentar = ({
    receipts = [],
    products = [],
    productAliases = [],
    foodClassificationOverrides = [],
    referenceDate = new Date()
} = {}) => {
    const safeReferenceDate = toLocalDate(referenceDate) || new Date();
    const referenceMonthKey = getMonthKey(safeReferenceDate);
    const monthKeys = buildMonthKeys(safeReferenceDate, MONTH_WINDOW);

    const baseSeries = monthKeys.map((monthKey) => {
        const snapshot = buildMonthSnapshot({
            receipts,
            products,
            productAliases,
            foodClassificationOverrides,
            monthKey,
            referenceDate: safeReferenceDate
        });

        return {
            ...snapshot,
            baseScore: calculateBaseScore({
                qualidade: snapshot.qualidade.score,
                acucar: snapshot.acucar.score,
                comportamento: snapshot.comportamento.score
            })
        };
    });

    const adjustedSeries = baseSeries.map((month, index, series) => {
        const trendFactor = calculateTrendFactor(series, index);
        const { factor: consistencyFactor, volatility } = calculateConsistencyFactor(series, index);
        const indexScore = calculateAdjustedScore({
            qualidade: month.qualidade.score,
            acucar: month.acucar.score,
            comportamento: month.comportamento.score,
            trendFactor,
            consistencyFactor
        });

        return {
            ...month,
            trendFactor,
            consistencyFactor,
            volatility,
            score: indexScore.adjusted,
            adjustedScore: indexScore.adjusted,
            breakdown: [month.qualidade, month.acucar, month.comportamento],
            status: getStatusFromScore(indexScore.adjusted)
        };
    });

    const latestVisibleMonth = adjustedSeries.at(-1) || null;
    const currentMonth = latestVisibleMonth?.hasData
        ? latestVisibleMonth
        : [...adjustedSeries].reverse().find((item) => item.hasData) || null;
    const currentMonthIndex = currentMonth
        ? adjustedSeries.findIndex((item) => item.monthKey === currentMonth.monthKey)
        : -1;
    const previousMonth = currentMonthIndex > 0
        ? adjustedSeries
            .slice(0, currentMonthIndex)
            .reverse()
            .find((item) => item.hasData) || null
        : null;
    const trendDelta = currentMonth && previousMonth
        ? currentMonth.adjustedScore - previousMonth.adjustedScore
        : 0;
    const projection = buildProjection(adjustedSeries);
    const currentAnalysis = currentMonth?.analysis || null;
    const pendingReviewCount = safeNumber(currentAnalysis?.meta?.pendingReviewCount);
    const weakestComponent = currentMonth?.breakdown
        ? [...currentMonth.breakdown].sort((left, right) => left.score - right.score)[0]
        : null;
    const isUsingFallbackMonth = Boolean(
        currentMonth
        && latestVisibleMonth
        && currentMonth.monthKey !== latestVisibleMonth.monthKey
    );

    if (!currentMonth?.hasData) {
        return {
            hasData: false,
            monthLabel: formatMonthLabel(referenceMonthKey),
            score: 50,
            baseScore: 50,
            trendDelta: 0,
            trendDirection: 'flat',
            status: {
                label: 'Em preparacao',
                tone: 'neutral',
                color: '#60A5FA',
                description: 'Importe e classifique seus primeiros itens alimentares para ativar um ISA totalmente explicado.'
            },
            trendFactor: 1,
            consistencyFactor: 1,
            volatility: 0,
            monthlySeries: adjustedSeries.map((item) => ({
                monthKey: item.monthKey,
                label: item.label,
                score: item.hasData ? item.adjustedScore : null,
                baseScore: item.hasData ? item.baseScore : null,
                hasData: item.hasData
            })),
            breakdown: [
                { key: 'qualidade', label: 'Qualidade da cesta', score: 0, weight: QUALITY_WEIGHT, weightedContribution: 0, color: '#22C55E', note: 'Aguardando itens classificados.', metricValueLabel: 'Sem base' },
                { key: 'acucar', label: 'Controle de acucar', score: 0, weight: SUGAR_WEIGHT, weightedContribution: 0, color: '#F97316', note: 'Aguardando itens classificados.', metricValueLabel: 'Sem base' },
                { key: 'comportamento', label: 'Planejamento e impulso', score: 0, weight: BEHAVIOR_WEIGHT, weightedContribution: 0, color: '#60A5FA', note: 'Aguardando eventos alimentares.', metricValueLabel: 'Sem base' }
            ],
            qualidade: null,
            acucar: null,
            comportamento: null,
            insights: [withInsightWhy(
                'Quando os primeiros itens alimentares forem classificados, o card vai explicar automaticamente o que puxa o indice para cima ou para baixo',
                'o ISA depende de itens alimentares reconhecidos para medir qualidade da cesta, acucar e planejamento de compra'
            )],
            recommendations: ['Importe compras com itens detalhados e revise as classificacoes pendentes para destravar o ISA alimentar.'],
            projection: {
                projectedNextScore: 50,
                delta: 0,
                message: withInsightWhy(
                    'Sem historico suficiente para projetar o proximo ciclo alimentar',
                    'a previsao so fica confiavel quando existem meses com itens classificados o bastante para comparar tendencia e consistencia'
                )
            },
            explanation: 'O indice ainda nao foi calculado porque a base nao possui itens alimentares classificados suficientes no ciclo analisado.',
            transparencyNote: 'Assim que houver itens alimentares classificados, o card vai mostrar score, tendencia, consistencia, breakdown e recomendacoes praticas.',
            formulaLabel: 'Qualidade da cesta 40% | Controle de acucar 30% | Planejamento e impulso 30%',
            metricSummary: {
                totalSpend: 0,
                naturalSpend: 0,
                ultraprocessedSpend: 0,
                sugarySpend: 0,
                flaggedPurchases: 0
            }
        };
    }

    return {
        hasData: true,
        monthLabel: currentMonth.label,
        score: currentMonth.adjustedScore,
        baseScore: currentMonth.baseScore,
        trendDelta,
        trendDirection: trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'flat',
        status: currentMonth.status,
        trendFactor: currentMonth.trendFactor,
        consistencyFactor: currentMonth.consistencyFactor,
        volatility: currentMonth.volatility,
        monthlySeries: adjustedSeries.map((item) => ({
            monthKey: item.monthKey,
            label: item.label,
            score: item.hasData ? item.adjustedScore : null,
            baseScore: item.hasData ? item.baseScore : null,
            hasData: item.hasData
        })),
        breakdown: currentMonth.breakdown,
        qualidade: currentMonth.qualidade,
        acucar: currentMonth.acucar,
        comportamento: currentMonth.comportamento,
        insights: buildInsights({
            currentMonth: {
                ...currentMonth,
                trendDelta
            },
            projection,
            analysis: currentAnalysis
        }),
        recommendations: buildRecommendations({
            currentMonth,
            projection,
            pendingReviewCount
        }),
        projection,
        explanation: buildPrimaryDriverText(weakestComponent),
        transparencyNote: [
            isUsingFallbackMonth
                ? `O ISA usa ${currentMonth.label} como ultimo mes com itens alimentares classificados dentro do filtro atual.`
                : `O ISA avalia o ciclo ${currentMonth.label} a partir dos itens alimentares classificados no periodo de referencia.`,
            pendingReviewCount > 0
                ? `Ha ${pendingReviewCount} item(ns) aguardando classificacao manual, o que pode refinar o indice.`
                : 'O calculo aplica pesos fixos, ajusta por tendencia recente e penaliza oscilacoes bruscas entre meses.'
        ].join(' '),
        formulaLabel: 'Qualidade da cesta 40% | Controle de acucar 30% | Planejamento e impulso 30%',
        metricSummary: {
            totalSpend: safeNumber(currentMonth.summary?.totalSpend),
            naturalSpend: safeNumber(currentMonth.analysis?.totals?.totalSpendByLevel?.find((item) => item.key === 'natural')?.value),
            ultraprocessedSpend: safeNumber(currentMonth.analysis?.totals?.totalSpendByLevel?.find((item) => item.key === 'ultraprocessed')?.value),
            sugarySpend: safeNumber(currentMonth.analysis?.sugar?.sugarySpend),
            flaggedPurchases: safeNumber(currentMonth.analysis?.impulsivity?.totalFlagged)
        }
    };
};
