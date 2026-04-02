import { analyzeFoodPurchases } from './foodAnalysis';
import { toLocalDateKey, toLocalDate } from './date';

const FOOD_WEIGHT = 0.4;
const ESSENTIAL_WEIGHT = 0.3;
const DISCRETIONARY_WEIGHT = 0.3;
const MONTH_WINDOW = 6;
const BASELINE_WINDOW = 3;

const STATUS_BANDS = [
    { min: 85, label: 'Saudavel', tone: 'positive', color: '#22C55E', description: 'Sua estrutura de gasto esta sob controle e resiliente.' },
    { min: 70, label: 'Estavel', tone: 'stable', color: '#FACC15', description: 'O indice segue funcional, mas ja pede pequenos ajustes.' },
    { min: 50, label: 'Atencao', tone: 'warning', color: '#F59E0B', description: 'Ha sinais claros de pressao financeira no seu padrao recente.' },
    { min: 0, label: 'Critico', tone: 'negative', color: '#EF4444', description: 'O padrao atual exige correcao rapida para evitar deterioracao.' }
];

const ENERGY_KEYWORDS = ['energia', 'eletrica', 'eletrico', 'luz'];
const WATER_KEYWORDS = ['agua', 'esgoto', 'saneamento'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safeNumber = (value) => Number(value) || 0;
const average = (values = []) => (
    values.length
        ? values.reduce((sum, value) => sum + safeNumber(value), 0) / values.length
        : 0
);

const roundToOneDecimal = (value) => Math.round(safeNumber(value) * 10) / 10;

const normalizeLabel = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getMonthKey = (value) => {
    const dateKey = toLocalDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : '';
};

const formatMonthLabel = (monthKey) => {
    if (!monthKey) return '--';
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    if (Number.isNaN(date.getTime())) return monthKey;

    return date.toLocaleDateString('pt-BR', {
        month: 'short'
    }).replace('.', '').replace(/^\w/, (letter) => letter.toUpperCase());
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

const buildMonthlyTotalsMap = ({ receipts = [], pixExpenses = [] } = {}) => {
    const totals = new Map();

    receipts.forEach((receipt) => {
        const monthKey = getMonthKey(receipt.date);
        if (!monthKey) return;
        totals.set(monthKey, (totals.get(monthKey) || 0) + safeNumber(receipt.totalValue));
    });

    pixExpenses.forEach((expense) => {
        const monthKey = getMonthKey(expense.date);
        if (!monthKey) return;
        totals.set(monthKey, (totals.get(monthKey) || 0) + safeNumber(expense.value));
    });

    return totals;
};

const matchesAnyKeyword = (categoryName, keywords) => keywords.some((keyword) => categoryName.includes(keyword));

const resolveEssentialType = (rawCategory) => {
    const categoryName = normalizeLabel(rawCategory);
    if (!categoryName) return '';
    if (matchesAnyKeyword(categoryName, ENERGY_KEYWORDS)) return 'energy';
    if (matchesAnyKeyword(categoryName, WATER_KEYWORDS)) return 'water';
    return '';
};

const buildEssentialsMap = ({ products = [], pixExpenses = [] } = {}) => {
    const essentialsByMonth = new Map();

    const registerExpense = (monthKey, amount, essentialType) => {
        if (!monthKey || amount <= 0 || !essentialType) return;

        if (!essentialsByMonth.has(monthKey)) {
            essentialsByMonth.set(monthKey, {
                total: 0,
                energy: 0,
                water: 0
            });
        }

        const bucket = essentialsByMonth.get(monthKey);
        bucket.total += amount;
        if (essentialType === 'energy') {
            bucket.energy += amount;
        }
        if (essentialType === 'water') {
            bucket.water += amount;
        }
    };

    products.forEach((product) => {
        const essentialType = resolveEssentialType(product.category);
        registerExpense(getMonthKey(product.date), safeNumber(product.totalValue), essentialType);
    });

    pixExpenses.forEach((expense) => {
        const essentialType = resolveEssentialType(expense.category || expense.subcategory || expense.description);
        registerExpense(getMonthKey(expense.date), safeNumber(expense.value), essentialType);
    });

    return essentialsByMonth;
};

const buildProductsWithReceiptDate = ({ receipts = [], products = [] } = {}) => {
    const receiptDateMap = new Map(receipts.map((receipt) => [receipt.id, receipt.date]));

    return products.map((product) => ({
        ...product,
        date: receiptDateMap.get(product.receiptId) || product.date || ''
    }));
};

const collectPreviousValues = (series = [], currentIndex, selector, windowSize = BASELINE_WINDOW) => {
    const values = [];

    for (let index = currentIndex - 1; index >= 0 && values.length < windowSize; index -= 1) {
        const item = series[index];
        if (!item?.hasData) {
            continue;
        }

        const value = safeNumber(selector(item));
        values.push(value);
    }

    return values;
};

const getStatusFromScore = (score) => (
    STATUS_BANDS.find((band) => score >= band.min) || STATUS_BANDS[STATUS_BANDS.length - 1]
);

export const calcularScoreAlimentacao = ({
    currentSpend = 0,
    averageSpend = 0,
    ultraprocessedShare = 0
} = {}) => {
    const normalizedUltraShare = safeNumber(ultraprocessedShare);
    const normalizedCurrentSpend = safeNumber(currentSpend);
    const normalizedAverageSpend = safeNumber(averageSpend);

    let ultraPenalty = 0;
    if (normalizedUltraShare > 25) {
        ultraPenalty = 25;
    } else if (normalizedUltraShare > 10) {
        ultraPenalty = 10;
    }

    const spendIncreaseRatio = normalizedAverageSpend > 0
        ? (normalizedCurrentSpend - normalizedAverageSpend) / normalizedAverageSpend
        : 0;

    let spendPenalty = 0;
    if (spendIncreaseRatio > 0.4) {
        spendPenalty = 20;
    } else if (spendIncreaseRatio > 0.2) {
        spendPenalty = 10;
    }

    const score = clamp(Math.round(100 - ultraPenalty - spendPenalty), 0, 100);

    return {
        key: 'alimentacao',
        label: 'Alimentacao',
        score,
        weight: FOOD_WEIGHT,
        weightedContribution: roundToOneDecimal(score * FOOD_WEIGHT),
        currentSpend: normalizedCurrentSpend,
        averageSpend: normalizedAverageSpend,
        ultraprocessedShare: normalizedUltraShare,
        spendIncreaseRatio,
        ultraPenalty,
        spendPenalty,
        color: '#22C55E',
        note: ultraPenalty > 0
            ? `${normalizedUltraShare.toFixed(1)}% do gasto alimentar veio de ultraprocessados.`
            : normalizedAverageSpend > 0 && spendPenalty > 0
                ? `Alimentacao ${Math.round(spendIncreaseRatio * 100)}% acima da media recente.`
                : 'Componente alimentar sob controle no ciclo atual.'
    };
};

export const calcularScoreEssenciais = ({
    currentSpend = 0,
    averageSpend = 0,
    energySpend = 0,
    waterSpend = 0
} = {}) => {
    const normalizedCurrentSpend = safeNumber(currentSpend);
    const normalizedAverageSpend = safeNumber(averageSpend);
    const increaseRatio = normalizedAverageSpend > 0
        ? (normalizedCurrentSpend - normalizedAverageSpend) / normalizedAverageSpend
        : 0;

    let penalty = 0;
    if (increaseRatio > 0.4) {
        penalty = 25;
    } else if (increaseRatio > 0.25) {
        penalty = 15;
    } else if (increaseRatio > 0.1) {
        penalty = 5;
    }

    const score = clamp(Math.round(100 - penalty), 0, 100);

    return {
        key: 'essenciais',
        label: 'Essenciais',
        score,
        weight: ESSENTIAL_WEIGHT,
        weightedContribution: roundToOneDecimal(score * ESSENTIAL_WEIGHT),
        currentSpend: normalizedCurrentSpend,
        averageSpend: normalizedAverageSpend,
        energySpend: safeNumber(energySpend),
        waterSpend: safeNumber(waterSpend),
        increaseRatio,
        penalty,
        color: '#60A5FA',
        note: penalty > 0
            ? `Energia e agua subiram ${Math.round(increaseRatio * 100)}% sobre a media recente.`
            : 'Energia e agua ficaram dentro da faixa historica.'
    };
};

export const calcularScoreDiscricionario = ({
    currentSpend = 0,
    budgetSpend = 0
} = {}) => {
    const normalizedCurrentSpend = safeNumber(currentSpend);
    const normalizedBudgetSpend = safeNumber(budgetSpend);
    const overspendRatio = normalizedBudgetSpend > 0
        ? (normalizedCurrentSpend - normalizedBudgetSpend) / normalizedBudgetSpend
        : 0;

    let score = 100;
    if (overspendRatio > 0.5) {
        score = 50;
    } else if (overspendRatio > 0.25) {
        score = 70;
    } else if (overspendRatio > 0.1) {
        score = 85;
    }

    return {
        key: 'discricionario',
        label: 'Discricionario',
        score,
        weight: DISCRETIONARY_WEIGHT,
        weightedContribution: roundToOneDecimal(score * DISCRETIONARY_WEIGHT),
        currentSpend: normalizedCurrentSpend,
        budgetSpend: normalizedBudgetSpend,
        overspendRatio,
        color: '#F59E0B',
        note: normalizedBudgetSpend > 0
            ? (
                overspendRatio > 0
                    ? `Despesas variaveis ${Math.round(overspendRatio * 100)}% acima do orcamento inferido.`
                    : 'Despesas variaveis dentro do orcamento inferido.'
            )
            : 'Sem historico suficiente para inferir um orcamento discricionario.'
    };
};

const calcularISFBase = ({ alimentacao = 0, essenciais = 0, discricionario = 0 } = {}) => Math.round(
    (safeNumber(alimentacao) * FOOD_WEIGHT)
    + (safeNumber(essenciais) * ESSENTIAL_WEIGHT)
    + (safeNumber(discricionario) * DISCRETIONARY_WEIGHT)
);

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

const calculateStandardDeviation = (values = []) => {
    if (values.length <= 1) {
        return 0;
    }

    const mean = average(values);
    const variance = average(values.map((value) => ((value - mean) ** 2)));
    return Math.sqrt(variance);
};

const calcularFatorTendencia = (series = [], index) => {
    const delta = calculateMonthOverMonthDelta(series, index);
    return clamp(1 + (delta / 200), 0.92, 1.08);
};

const calcularFatorConsistencia = (series = [], index) => {
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

export const calcularISF = ({
    alimentacao = 0,
    essenciais = 0,
    discricionario = 0,
    fatorTendencia = 1,
    fatorConsistencia = 1
} = {}) => {
    const base = calcularISFBase({ alimentacao, essenciais, discricionario });
    const adjusted = clamp(Math.round(base * fatorTendencia * fatorConsistencia), 0, 100);

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
            message: 'Continue registrando meses completos para destravar uma projecao mais precisa.'
        };
    }

    const delta = current.adjustedScore - previous.adjustedScore;
    const projectedNextScore = clamp(Math.round(current.adjustedScore + delta), 0, 100);

    return {
        projectedNextScore,
        delta,
        message: delta < -2
            ? `Se mantiver esse padrao, seu indice pode cair para ${projectedNextScore} no proximo mes.`
            : delta > 2
                ? `Mantendo o ritmo atual, seu indice pode avancar para ${projectedNextScore} no proximo mes.`
                : 'O comportamento recente indica estabilidade para o proximo ciclo.'
    };
};

const buildPrimaryDriverText = (component) => {
    if (!component) {
        return 'Sem dados suficientes para identificar o principal vetor do indice.';
    }

    if (component.key === 'alimentacao') {
        if (component.ultraPenalty > 0) {
            return `O principal freio do ISF veio da alimentacao: ultraprocessados responderam por ${component.ultraprocessedShare.toFixed(1)}% do gasto alimentar.`;
        }

        if (component.spendPenalty > 0) {
            return `A alimentacao pressionou o indice por volume: o gasto ficou ${Math.round(component.spendIncreaseRatio * 100)}% acima da media recente.`;
        }
    }

    if (component.key === 'essenciais' && component.penalty > 0) {
        return `Os essenciais subiram ${Math.round(component.increaseRatio * 100)}% sobre a media e reduziram previsibilidade financeira.`;
    }

    if (component.key === 'discricionario' && component.overspendRatio > 0) {
        return `As despesas discricionarias ultrapassaram o orcamento inferido em ${Math.round(component.overspendRatio * 100)}%, comprimindo a margem do mes.`;
    }

    return `${component.label} sustentou bem o indice e ajudou a amortecer riscos do ciclo.`;
};

export const gerarInsights = ({
    currentMonth,
    projection,
    foodAnalysis
} = {}) => {
    const insights = [];
    const components = currentMonth?.breakdown || [];
    const sortedByRisk = [...components].sort((left, right) => left.score - right.score);
    const lowestComponent = sortedByRisk[0];

    if (currentMonth?.trendDelta > 0) {
        insights.push(`Seu ISF melhorou ${Math.abs(currentMonth.trendDelta)} ponto(s) versus o periodo anterior.`);
    } else if (currentMonth?.trendDelta < 0) {
        insights.push(`Seu ISF caiu ${Math.abs(currentMonth.trendDelta)} ponto(s) versus o periodo anterior.`);
    }

    if (lowestComponent) {
        insights.push(buildPrimaryDriverText(lowestComponent));
    }

    if (currentMonth?.essenciais?.penalty > 0) {
        insights.push(`Energia e agua somadas ficaram em ${Math.round(currentMonth.essenciais.increaseRatio * 100)}% acima da media usada como referencia.`);
    } else if (currentMonth?.discricionario?.score >= 100) {
        insights.push('Voce manteve controle nas despesas variaveis e protegeu o indice no bloco discricionario.');
    }

    if (foodAnalysis?.alerts?.length) {
        insights.push(foodAnalysis.alerts[0]);
    }

    if (projection?.delta < -2) {
        insights.push(projection.message);
    }

    return insights.filter(Boolean).slice(0, 4);
};

const resolvePointGain = (deltaScore, weight, trendFactor, consistencyFactor) => Math.max(
    1,
    Math.round(deltaScore * weight * trendFactor * consistencyFactor)
);

export const gerarRecomendacoes = ({
    currentMonth,
    projection
} = {}) => {
    const recommendations = [];

    if (!currentMonth) {
        return recommendations;
    }

    const { alimentacao, essenciais, discricionario, trendFactor, consistencyFactor } = currentMonth;

    if (alimentacao?.ultraPenalty > 0) {
        const targetShare = alimentacao.ultraprocessedShare > 25 ? 25 : 10;
        const nextPenalty = targetShare <= 10 ? 0 : 10;
        const pointGain = resolvePointGain(
            alimentacao.ultraPenalty - nextPenalty,
            alimentacao.weight,
            trendFactor,
            consistencyFactor
        );
        recommendations.push(`Reduza ultraprocessados em ${Math.ceil(alimentacao.ultraprocessedShare - targetShare)} p.p. para recuperar cerca de +${pointGain} ponto(s) no indice.`);
    }

    if (alimentacao?.spendPenalty > 0 && alimentacao.averageSpend > 0) {
        const safeTargetRatio = alimentacao.spendIncreaseRatio > 0.4 ? 0.2 : 0;
        const targetSpend = alimentacao.averageSpend * (1 + safeTargetRatio);
        const reductionValue = Math.max(0, alimentacao.currentSpend - targetSpend);
        const nextPenalty = safeTargetRatio > 0 ? 10 : 0;
        const pointGain = resolvePointGain(
            alimentacao.spendPenalty - nextPenalty,
            alimentacao.weight,
            trendFactor,
            consistencyFactor
        );
        recommendations.push(`Recuar ${reductionValue.toFixed(0)} reais na alimentacao do ciclo atual adiciona aproximadamente +${pointGain} ponto(s) ao ISF.`);
    }

    if (essenciais?.penalty > 0 && essenciais.averageSpend > 0) {
        const safeTargetRatio = essenciais.increaseRatio > 0.4 ? 0.25 : essenciais.increaseRatio > 0.25 ? 0.1 : 0;
        const targetSpend = essenciais.averageSpend * (1 + safeTargetRatio);
        const reductionValue = Math.max(0, essenciais.currentSpend - targetSpend);
        const nextPenalty = safeTargetRatio > 0.1 ? 15 : safeTargetRatio > 0 ? 5 : 0;
        const pointGain = resolvePointGain(
            Math.max(0, essenciais.penalty - nextPenalty),
            essenciais.weight,
            trendFactor,
            consistencyFactor
        );
        recommendations.push(`Reduzir ${reductionValue.toFixed(0)} reais em agua e energia ajuda a recuperar cerca de +${pointGain} ponto(s).`);
    }

    if (discricionario?.overspendRatio > 0 && discricionario.budgetSpend > 0) {
        const safeTargetRatio = discricionario.overspendRatio > 0.5 ? 0.25 : discricionario.overspendRatio > 0.25 ? 0.1 : 0;
        const targetSpend = discricionario.budgetSpend * (1 + safeTargetRatio);
        const reductionValue = Math.max(0, discricionario.currentSpend - targetSpend);
        const nextScore = safeTargetRatio > 0.1 ? 70 : safeTargetRatio > 0 ? 85 : 100;
        const pointGain = resolvePointGain(
            nextScore - discricionario.score,
            discricionario.weight,
            trendFactor,
            consistencyFactor
        );
        recommendations.push(`Cortar ${reductionValue.toFixed(0)} reais nas despesas discricionarias pode devolver aproximadamente +${pointGain} ponto(s) ao ISF.`);
    }

    if (projection?.delta < -2) {
        recommendations.push(projection.message);
    }

    if (!recommendations.length) {
        recommendations.push('Seu padrao atual esta consistente. O melhor proximo passo e preservar esse ritmo por mais um ciclo completo.');
    }

    return recommendations.slice(0, 4);
};

export const construirIndiceSaudeFinanceira = ({
    receipts = [],
    products = [],
    pixExpenses = [],
    productAliases = [],
    foodClassificationOverrides = [],
    referenceDate = new Date()
} = {}) => {
    const safeReferenceDate = toLocalDate(referenceDate) || new Date();
    const productsWithDate = buildProductsWithReceiptDate({ receipts, products });
    const monthKeys = buildMonthKeys(safeReferenceDate, MONTH_WINDOW);
    const monthlyTotalsMap = buildMonthlyTotalsMap({ receipts, pixExpenses });
    const essentialsMap = buildEssentialsMap({ products: productsWithDate, pixExpenses });

    const rawSeries = monthKeys.map((monthKey) => {
        const monthReferenceDate = getMonthReferenceDate(monthKey, safeReferenceDate);
        const foodAnalysis = analyzeFoodPurchases({
            receipts,
            products,
            productAliases,
            foodClassificationOverrides,
            referenceDate: monthReferenceDate
        });
        const foodSummary = foodAnalysis?.trend?.currentMonth || {};
        const monthTotal = safeNumber(monthlyTotalsMap.get(monthKey));
        const essentials = essentialsMap.get(monthKey) || { total: 0, energy: 0, water: 0 };
        const foodSpend = safeNumber(foodSummary.totalSpend);
        const essentialSpend = safeNumber(essentials.total);
        const discretionarySpend = Math.max(0, monthTotal - foodSpend - essentialSpend);
        const hasData = monthTotal > 0 || foodSpend > 0 || essentialSpend > 0;

        return {
            monthKey,
            label: formatMonthLabel(monthKey),
            monthReferenceDate,
            monthTotal,
            foodAnalysis,
            foodSummary,
            foodSpend,
            essentialSpend,
            energySpend: safeNumber(essentials.energy),
            waterSpend: safeNumber(essentials.water),
            discretionarySpend,
            hasData
        };
    });

    const baseSeries = rawSeries.map((month, index, series) => {
        const foodAverage = average(collectPreviousValues(series, index, (item) => item.foodSpend));
        const essentialAverage = average(collectPreviousValues(series, index, (item) => item.essentialSpend));
        const discretionaryAverage = average(collectPreviousValues(series, index, (item) => item.discretionarySpend));

        const alimentacao = calcularScoreAlimentacao({
            currentSpend: month.foodSpend,
            averageSpend: foodAverage,
            ultraprocessedShare: safeNumber(month.foodSummary.ultraprocessedPercentage)
        });

        const essenciais = calcularScoreEssenciais({
            currentSpend: month.essentialSpend,
            averageSpend: essentialAverage,
            energySpend: month.energySpend,
            waterSpend: month.waterSpend
        });

        const discricionario = calcularScoreDiscricionario({
            currentSpend: month.discretionarySpend,
            budgetSpend: discretionaryAverage
        });

        return {
            ...month,
            alimentacao,
            essenciais,
            discricionario,
            baseScore: calcularISFBase({
                alimentacao: alimentacao.score,
                essenciais: essenciais.score,
                discricionario: discricionario.score
            })
        };
    });

    const adjustedSeries = baseSeries.map((month, index, series) => {
        const trendFactor = calcularFatorTendencia(series, index);
        const { factor: consistencyFactor, volatility } = calcularFatorConsistencia(series, index);
        const indexScore = calcularISF({
            alimentacao: month.alimentacao.score,
            essenciais: month.essenciais.score,
            discricionario: month.discricionario.score,
            fatorTendencia: trendFactor,
            fatorConsistencia: consistencyFactor
        });

        return {
            ...month,
            trendFactor,
            consistencyFactor,
            volatility,
            score: indexScore.adjusted,
            adjustedScore: indexScore.adjusted,
            breakdown: [month.alimentacao, month.essenciais, month.discricionario],
            status: getStatusFromScore(indexScore.adjusted)
        };
    });

    const currentMonth = adjustedSeries.at(-1) || null;
    const previousMonth = adjustedSeries
        .slice(0, -1)
        .reverse()
        .find((item) => item.hasData) || null;
    const trendDelta = currentMonth && previousMonth
        ? currentMonth.adjustedScore - previousMonth.adjustedScore
        : 0;
    const projection = buildProjection(adjustedSeries);
    const insights = gerarInsights({
        currentMonth: {
            ...currentMonth,
            trendDelta
        },
        projection,
        foodAnalysis: currentMonth?.foodAnalysis
    });
    const recommendations = gerarRecomendacoes({
        currentMonth: {
            ...currentMonth,
            trendDelta
        },
        projection
    });

    const weakestComponent = currentMonth?.breakdown
        ? [...currentMonth.breakdown].sort((left, right) => left.score - right.score)[0]
        : null;

    if (!currentMonth?.hasData) {
        return {
            hasData: false,
            monthLabel: formatMonthLabel(getMonthKey(safeReferenceDate)),
            score: 50,
            baseScore: 50,
            trendDelta: 0,
            trendDirection: 'flat',
            status: {
                label: 'Em preparacao',
                tone: 'neutral',
                color: '#60A5FA',
                description: 'Importe seus primeiros gastos para ativar um ISF totalmente explicado e acionavel.'
            },
            trendFactor: 1,
            consistencyFactor: 1,
            volatility: 0,
            monthlySeries: adjustedSeries.map((item) => ({
                monthKey: item.monthKey,
                label: item.label,
                score: null,
                baseScore: null,
                hasData: false
            })),
            breakdown: [
                { key: 'alimentacao', label: 'Alimentacao', score: 0, weight: FOOD_WEIGHT, weightedContribution: 0, color: '#22C55E', note: 'Aguardando dados alimentares.' },
                { key: 'essenciais', label: 'Essenciais', score: 0, weight: ESSENTIAL_WEIGHT, weightedContribution: 0, color: '#60A5FA', note: 'Aguardando agua e energia.' },
                { key: 'discricionario', label: 'Discricionario', score: 0, weight: DISCRETIONARY_WEIGHT, weightedContribution: 0, color: '#F59E0B', note: 'Aguardando demais despesas.' }
            ],
            alimentacao: null,
            essenciais: null,
            discricionario: null,
            insights: ['Quando os primeiros gastos entrarem, o card vai explicar automaticamente o que puxa seu indice para cima ou para baixo.'],
            recommendations: ['Registre alimentacao, agua, energia e despesas variaveis para destravar o ISF inteligente.'],
            projection: {
                projectedNextScore: 50,
                delta: 0,
                message: 'Sem historico suficiente para projetar o proximo mes.'
            },
            explanation: 'O indice ainda nao foi calculado porque a base nao possui gastos suficientes no ciclo atual.',
            transparencyNote: 'Assim que houver movimentacao real, o card vai mostrar score, tendencia, consistencia, insights e recomendacoes praticas.',
            metricSummary: {
                totalSpend: 0,
                foodSpend: 0,
                essentialSpend: 0,
                discretionarySpend: 0
            }
        };
    }

    return {
        hasData: Boolean(currentMonth?.hasData),
        monthLabel: currentMonth?.label || formatMonthLabel(getMonthKey(safeReferenceDate)),
        score: currentMonth?.adjustedScore || 50,
        baseScore: currentMonth?.baseScore || 50,
        trendDelta,
        trendDirection: trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'flat',
        status: currentMonth?.status || getStatusFromScore(50),
        trendFactor: currentMonth?.trendFactor || 1,
        consistencyFactor: currentMonth?.consistencyFactor || 1,
        volatility: currentMonth?.volatility || 0,
        monthlySeries: adjustedSeries.map((item) => ({
            monthKey: item.monthKey,
            label: item.label,
            score: item.hasData ? item.adjustedScore : null,
            baseScore: item.hasData ? item.baseScore : null,
            hasData: item.hasData
        })),
        breakdown: currentMonth?.breakdown || [],
        alimentacao: currentMonth?.alimentacao || null,
        essenciais: currentMonth?.essenciais || null,
        discricionario: currentMonth?.discricionario || null,
        insights,
        recommendations,
        projection,
        explanation: buildPrimaryDriverText(weakestComponent),
        transparencyNote: currentMonth?.foodAnalysis?.meta?.pendingReviewCount > 0
            ? `Ha ${currentMonth.foodAnalysis.meta.pendingReviewCount} item(ns) alimentares aguardando classificacao manual, o que pode refinar o ISF.`
            : 'O indice usa os gastos do mes atual, compara com medias recentes e ajusta por tendencia e consistencia.',
        metricSummary: {
            totalSpend: safeNumber(currentMonth?.monthTotal),
            foodSpend: safeNumber(currentMonth?.foodSpend),
            essentialSpend: safeNumber(currentMonth?.essentialSpend),
            discretionarySpend: safeNumber(currentMonth?.discretionarySpend)
        }
    };
};
