import { normalizePaymentMethod } from './paymentMethods';
import { toLocalDateKey } from './date';
import { withInsightWhy } from './insightNarrative';

const LEGACY_WEIGHT_FIELDS = ['movingAverage', 'trend', 'seasonality'];
const DAILY_WEIGHT_FIELDS = ['avg7', 'avg30', 'trend', 'weekday', 'monthPosition', 'recurrence'];
const CATEGORY_WEIGHT_FIELDS = ['avg7', 'avg30', 'trend', 'weekday', 'recurrence'];

const DEFAULT_DAILY_WEIGHTS = {
    avg7: 0.24,
    avg30: 0.16,
    trend: 0.18,
    weekday: 0.16,
    monthPosition: 0.14,
    recurrence: 0.12
};

const DEFAULT_CATEGORY_WEIGHTS = {
    avg7: 0.28,
    avg30: 0.14,
    trend: 0.18,
    weekday: 0.16,
    recurrence: 0.24
};

const DEFAULT_BEHAVIOR_CONFIG = {
    minFactor: 0.75,
    maxFactor: 1.25,
    outlierCap: 2.2
};

const MAX_RECALIBRATION_HISTORY = 12;

export const DEFAULT_FORECAST_MODEL_CONFIG = {
    id: 'primary',
    weights: DEFAULT_DAILY_WEIGHTS,
    categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
    behaviorConfig: DEFAULT_BEHAVIOR_CONFIG,
    precisionThreshold: 80,
    targetPrecision: 92,
    lastRecalibratedAt: '',
    updatedAt: '',
    recalibrationHistory: []
};

const FORECAST_LEVEL_DAILY = 'daily-total';
const FORECAST_LEVEL_CATEGORY = 'daily-category';
const FORECAST_LEVEL_MONTHLY = 'monthly-total';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const average = (values) => (
    values.length
        ? values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length
        : 0
);
const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);
const standardDeviation = (values) => {
    if (!values.length) return 0;

    const mean = average(values);
    const variance = average(values.map((value) => ((Number(value) || 0) - mean) ** 2));
    return Math.sqrt(variance);
};
const weightedAverage = (entries = []) => {
    const totalWeight = sum(entries.map((entry) => entry.weight));
    if (totalWeight <= 0) return 0;

    return entries.reduce((total, entry) => total + ((Number(entry.value) || 0) * entry.weight), 0) / totalWeight;
};

export const getDateKey = (value) => {
    return toLocalDateKey(value) || null;
};

export const getMonthKey = (value) => {
    const dateKey = getDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : null;
};

export const buildMonthDateKey = (monthKey, dayNumber) => `${monthKey}-${String(dayNumber).padStart(2, '0')}`;

export const formatMonthReferenceLabel = (monthKey) => {
    if (!monthKey) return '--';

    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    if (Number.isNaN(date.getTime())) return monthKey;

    const label = date.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    });

    return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatCompactMonthReferenceLabel = (monthKey) => {
    if (!monthKey) return '--';

    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    if (Number.isNaN(date.getTime())) return monthKey;

    return date.toLocaleDateString('pt-BR', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC'
    }).replace('.', '').replace(' de ', '/');
};

export const formatMonthDayLabel = (value) => {
    if (!value) return '--';

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'UTC'
        });
};

const getDateWeekday = (dateKey) => {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
    return Number.isNaN(date.getTime()) ? 0 : date.getUTCDay();
};

export const getWeekStartKey = (dateKey) => {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
    if (Number.isNaN(date.getTime())) return '';

    const weekDay = date.getUTCDay();
    const distance = weekDay === 0 ? 6 : weekDay - 1;
    date.setUTCDate(date.getUTCDate() - distance);
    return date.toISOString().split('T')[0];
};

const getMonthDayNumber = (dateKey) => Number(String(dateKey || '').slice(-2)) || 0;

const normalizeWeightValue = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);

const normalizeWeightSet = (weights = {}, fields = [], defaults = {}) => {
    const rawWeights = fields.reduce((result, field) => ({
        ...result,
        [field]: normalizeWeightValue(weights[field] ?? defaults[field])
    }), {});

    const totalWeight = sum(Object.values(rawWeights));
    if (totalWeight <= 0) {
        return defaults;
    }

    return fields.reduce((result, field) => ({
        ...result,
        [field]: rawWeights[field] / totalWeight
    }), {});
};

export const normalizeForecastWeights = (weights = {}) => normalizeWeightSet(weights, DAILY_WEIGHT_FIELDS, DEFAULT_DAILY_WEIGHTS);

const normalizeForecastCategoryWeights = (weights = {}) => normalizeWeightSet(weights, CATEGORY_WEIGHT_FIELDS, DEFAULT_CATEGORY_WEIGHTS);

const isLegacyWeightSet = (weights = {}) => LEGACY_WEIGHT_FIELDS.some((field) => field in weights);

const translateLegacyDailyWeights = (weights = {}) => normalizeForecastWeights({
    avg7: (Number(weights.movingAverage) || 0.5) * 0.58,
    avg30: (Number(weights.movingAverage) || 0.5) * 0.42,
    trend: (Number(weights.trend) || 0.3) * 0.55,
    weekday: (Number(weights.trend) || 0.3) * 0.45,
    monthPosition: (Number(weights.seasonality) || 0.2) * 0.55,
    recurrence: (Number(weights.seasonality) || 0.2) * 0.45
});

const translateLegacyCategoryWeights = (weights = {}) => normalizeForecastCategoryWeights({
    avg7: (Number(weights.movingAverage) || 0.5) * 0.54,
    avg30: (Number(weights.movingAverage) || 0.5) * 0.28,
    trend: (Number(weights.trend) || 0.3) * 0.42,
    weekday: (Number(weights.trend) || 0.3) * 0.18,
    recurrence: (Number(weights.seasonality) || 0.2) * 0.58
});

const normalizeBehaviorConfig = (behaviorConfig = {}) => {
    const minFactor = clamp(Number(behaviorConfig.minFactor ?? DEFAULT_BEHAVIOR_CONFIG.minFactor) || DEFAULT_BEHAVIOR_CONFIG.minFactor, 0.5, 1.1);
    const maxFactor = clamp(Number(behaviorConfig.maxFactor ?? DEFAULT_BEHAVIOR_CONFIG.maxFactor) || DEFAULT_BEHAVIOR_CONFIG.maxFactor, 1, 1.6);

    return {
        minFactor: Math.min(minFactor, maxFactor),
        maxFactor: Math.max(maxFactor, minFactor),
        outlierCap: clamp(Number(behaviorConfig.outlierCap ?? DEFAULT_BEHAVIOR_CONFIG.outlierCap) || DEFAULT_BEHAVIOR_CONFIG.outlierCap, 1.2, 3.2)
    };
};

export const getForecastModelConfig = (config = {}) => ({
    ...DEFAULT_FORECAST_MODEL_CONFIG,
    ...config,
    weights: isLegacyWeightSet(config.weights || {})
        ? translateLegacyDailyWeights(config.weights)
        : normalizeForecastWeights(config.weights || DEFAULT_FORECAST_MODEL_CONFIG.weights),
    categoryWeights: config.categoryWeights
        ? normalizeForecastCategoryWeights(config.categoryWeights)
        : isLegacyWeightSet(config.weights || {})
            ? translateLegacyCategoryWeights(config.weights)
            : DEFAULT_FORECAST_MODEL_CONFIG.categoryWeights,
    behaviorConfig: normalizeBehaviorConfig(config.behaviorConfig || DEFAULT_FORECAST_MODEL_CONFIG.behaviorConfig),
    recalibrationHistory: Array.isArray(config.recalibrationHistory)
        ? config.recalibrationHistory.slice(-MAX_RECALIBRATION_HISTORY)
        : []
});

const createCategoryDayMapArray = (size) => Array.from({ length: size }, () => new Map());

export const buildForecastDataset = ({ receipts = [], products = [] } = {}) => {
    const receiptMetaById = new Map();
    const monthMap = new Map();
    const allCategoryNames = new Set();
    const globalCategoryTotals = new Map();

    receipts.forEach((receipt) => {
        const dateKey = getDateKey(receipt.date);
        if (!dateKey) return;

        const monthKey = dateKey.slice(0, 7);
        const dayNumber = getMonthDayNumber(dateKey);
        const [year, month] = monthKey.split('-').map(Number);
        const totalDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

        if (!monthMap.has(monthKey)) {
            monthMap.set(monthKey, {
                monthKey,
                totalDaysInMonth,
                dayTotals: Array(totalDaysInMonth).fill(0),
                dayReceiptCounts: Array(totalDaysInMonth).fill(0),
                categoryDayMaps: createCategoryDayMapArray(totalDaysInMonth),
                categoryTotals: new Map(),
                storeTotals: new Map(),
                paymentTotals: new Map(),
                receiptTotals: [],
                receiptsCount: 0,
                productsCount: 0,
                totalSpent: 0,
                manualReceiptsCount: 0,
                manualSpent: 0,
                importedReceiptsCount: 0,
                importedSpent: 0
            });
        }

        const context = monthMap.get(monthKey);
        const dayIndex = clamp(dayNumber - 1, 0, context.totalDaysInMonth - 1);
        const receiptTotal = Number(receipt.totalValue) || 0;
        const storeName = receipt.establishment || 'Outros';
        const paymentMethod = normalizePaymentMethod(receipt.paymentMethod);
        const isManual = String(receipt.accessKey || '').startsWith('MANUAL-')
            || String(receipt.receiptNumber || '').toUpperCase() === 'MANUAL';

        context.dayTotals[dayIndex] += receiptTotal;
        context.dayReceiptCounts[dayIndex] += 1;
        context.receiptTotals.push(receiptTotal);
        context.receiptsCount += 1;
        context.totalSpent += receiptTotal;
        context.storeTotals.set(storeName, (context.storeTotals.get(storeName) || 0) + receiptTotal);
        context.paymentTotals.set(paymentMethod, (context.paymentTotals.get(paymentMethod) || 0) + receiptTotal);

        if (isManual) {
            context.manualReceiptsCount += 1;
            context.manualSpent += receiptTotal;
        } else {
            context.importedReceiptsCount += 1;
            context.importedSpent += receiptTotal;
        }

        receiptMetaById.set(receipt.id, { monthKey, dayIndex, dateKey });
    });

    products.forEach((product) => {
        const receiptMeta = receiptMetaById.get(product.receiptId);
        if (!receiptMeta) return;

        const context = monthMap.get(receiptMeta.monthKey);
        if (!context) return;

        const category = product.category || 'Outros';
        const totalValue = Number(product.totalValue) || 0;
        const dayCategoryMap = context.categoryDayMaps[receiptMeta.dayIndex];

        allCategoryNames.add(category);
        dayCategoryMap.set(category, (dayCategoryMap.get(category) || 0) + totalValue);
        context.categoryTotals.set(category, (context.categoryTotals.get(category) || 0) + totalValue);
        globalCategoryTotals.set(category, (globalCategoryTotals.get(category) || 0) + totalValue);
        context.productsCount += 1;
    });

    const months = Array.from(monthMap.values())
        .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
        .map((context) => ({
            ...context,
            activeDays: context.dayTotals.filter((value) => value > 0).length,
            lastRecordedDay: Math.max(
                0,
                context.dayTotals.reduce(
                    (highestDay, value, index) => (value > 0 ? index + 1 : highestDay),
                    0
                )
            )
        }));

    const normalizedMonthMap = new Map(months.map((monthContext) => [monthContext.monthKey, monthContext]));
    const dailySeries = months.flatMap((context) => (
        Array.from({ length: context.totalDaysInMonth }, (_, index) => {
            const dayNumber = index + 1;
            const dateKey = buildMonthDateKey(context.monthKey, dayNumber);

            return {
                dateKey,
                monthKey: context.monthKey,
                dayNumber,
                weekday: getDateWeekday(dateKey),
                totalValue: context.dayTotals[index] || 0,
                categoryMap: context.categoryDayMaps[index] || new Map()
            };
        })
    ));

    return {
        receiptMetaById,
        months,
        monthMap: normalizedMonthMap,
        dailySeries,
        allCategoryNames: Array.from(allCategoryNames).sort((left, right) => left.localeCompare(right, 'pt-BR')),
        globalCategoryTotals
    };
};

const getComparableMonths = (dataset, monthKey) => dataset.months.filter((context) => context.monthKey < monthKey);

const getContextDayValue = ({
    context,
    dayIndex,
    categoryName = '',
    simulatedDayTotals = null,
    simulatedCategoryDayMaps = null
}) => {
    if (!context || dayIndex < 0 || dayIndex >= context.totalDaysInMonth) {
        return 0;
    }

    if (categoryName) {
        if (simulatedCategoryDayMaps) {
            return simulatedCategoryDayMaps[dayIndex]?.get(categoryName) || 0;
        }

        return context.categoryDayMaps[dayIndex]?.get(categoryName) || 0;
    }

    if (simulatedDayTotals) {
        return Number(simulatedDayTotals[dayIndex]) || 0;
    }

    return Number(context.dayTotals[dayIndex]) || 0;
};

const buildHistoricalEntries = ({
    dataset,
    context,
    targetDay,
    categoryName = '',
    simulatedDayTotals = null,
    simulatedCategoryDayMaps = null
}) => {
    const entries = [];

    dataset.months.forEach((monthContext) => {
        if (monthContext.monthKey > context.monthKey) {
            return;
        }

        const lastDay = monthContext.monthKey === context.monthKey
            ? Math.max(0, targetDay - 1)
            : monthContext.totalDaysInMonth;

        for (let dayNumber = 1; dayNumber <= lastDay; dayNumber += 1) {
            const dateKey = buildMonthDateKey(monthContext.monthKey, dayNumber);

            entries.push({
                dateKey,
                monthKey: monthContext.monthKey,
                dayNumber,
                weekday: getDateWeekday(dateKey),
                value: getContextDayValue({
                    context: monthContext,
                    dayIndex: dayNumber - 1,
                    categoryName,
                    simulatedDayTotals: monthContext.monthKey === context.monthKey ? simulatedDayTotals : null,
                    simulatedCategoryDayMaps: monthContext.monthKey === context.monthKey ? simulatedCategoryDayMaps : null
                })
            });
        }
    });

    return entries;
};

const getAroundDayAverage = ({ context, targetDay, categoryName = '' }) => weightedAverage(
    Array.from({ length: 5 }, (_, index) => index - 2)
        .map((offset) => {
            const dayNumber = targetDay + offset;
            if (dayNumber < 1 || dayNumber > context.totalDaysInMonth) {
                return null;
            }

            return {
                value: getContextDayValue({
                    context,
                    dayIndex: dayNumber - 1,
                    categoryName
                }),
                weight: 1 / (Math.abs(offset) + 1)
            };
        })
        .filter(Boolean)
);

const buildBehaviorSignal = ({ entries, behaviorConfig }) => {
    const historyValues = entries.map((entry) => entry.value);
    const recent3Values = historyValues.slice(-3);
    const recent7Values = historyValues.slice(-7);
    const recent30Values = historyValues.slice(-30);
    const avg30 = average(recent30Values.length ? recent30Values : historyValues);
    const outlierCap = avg30 > 0
        ? avg30 * behaviorConfig.outlierCap
        : Math.max(...historyValues, 0);
    const smoothValues = (values) => values.map((value) => clamp(value, 0, outlierCap || value || 0));
    const avg3 = average(smoothValues(recent3Values));
    const avg7 = average(smoothValues(recent7Values));
    const referenceAverage = avg30 > 0
        ? ((avg30 * 0.6) + (avg7 * 0.4))
        : (avg7 || average(historyValues) || 1);
    const rawFactor = referenceAverage > 0 ? avg3 / referenceAverage : 1;
    const factor = clamp(rawFactor || 1, behaviorConfig.minFactor, behaviorConfig.maxFactor);
    let label = 'Estavel';
    let description = withInsightWhy(
        'O comportamento recente segue proximo da media historica e mantem os pesos centrais do modelo',
        'a media curta dos ultimos dias ficou alinhada com a referencia de 30 dias e nao exigiu ajuste forte nos pesos'
    );

    if (factor >= 1.08) {
        label = 'Pressao de alta';
        description = withInsightWhy(
            'Os ultimos 3 dias ficaram acima da base de 30 dias e puxam a previsao para cima',
            'o consumo recente acelerou frente ao historico e aumentou o fator de comportamento aplicado pelo modelo'
        );
    } else if (factor <= 0.92) {
        label = 'Descompressao';
        description = withInsightWhy(
            'Os ultimos 3 dias recuaram frente ao historico de 30 dias e reduzem a previsao base',
            'o ritmo recente perdeu forca em relacao ao historico e o modelo diminuiu a pressao da projecao'
        );
    }

    return {
        avg3,
        avg7,
        avg30,
        rawFactor,
        factor,
        label,
        description
    };
};

const buildPredictionConfidence = ({
    componentValues = [],
    historyCount = 0,
    volatility = 0,
    behaviorFactor = 1,
    recurrenceCoverage = 0,
    weekdayCoverage = 0
}) => {
    const meanValue = average(componentValues);
    const dispersion = meanValue > 0 ? standardDeviation(componentValues) / meanValue : 1;
    const historyScore = clamp(historyCount / 90, 0, 1);
    const coverageScore = clamp((recurrenceCoverage * 0.45) + (weekdayCoverage * 0.55), 0, 1);
    const stabilityPenalty = clamp((dispersion * 20) + (volatility * 14) + (Math.abs(behaviorFactor - 1) * 28), 0, 38);

    return clamp(58 + (historyScore * 20) + (coverageScore * 12) - stabilityPenalty, 42, 96);
};

const buildAdaptiveCategoryWeights = ({ baseWeights, volatility, recurrenceCoverage }) => normalizeForecastCategoryWeights({
    ...baseWeights,
    avg30: baseWeights.avg30 * clamp(1 - (Math.max(0, volatility) * 0.28), 0.58, 1),
    avg7: baseWeights.avg7 * clamp(1 + (Math.max(0, volatility) * 0.1), 1, 1.18),
    trend: baseWeights.trend * clamp(1 + (Math.max(0, volatility) * 0.12), 1, 1.22),
    recurrence: baseWeights.recurrence * clamp(1 + (recurrenceCoverage * 0.35), 1, 1.26)
});

const buildProjectionChartData = ({
    monthKey,
    totalDaysInMonth,
    observedDays,
    dayTotals,
    scenarioTotals
}) => {
    let accumulatedActual = 0;

    return Array.from({ length: totalDaysInMonth }, (_, index) => {
        const dayNumber = index + 1;
        const dateKey = buildMonthDateKey(monthKey, dayNumber);
        const dayValue = dayNumber <= observedDays ? (dayTotals[dayNumber - 1] || 0) : 0;

        if (dayNumber <= observedDays) {
            accumulatedActual += dayValue;
        }

        const remainingDays = Math.max(1, totalDaysInMonth - observedDays);
        const buildScenarioValue = (targetValue) => {
            if (dayNumber < observedDays) return null;
            if (dayNumber === observedDays) return accumulatedActual;

            const dailyIncrement = (targetValue - accumulatedActual) / remainingDays;
            return accumulatedActual + (dailyIncrement * (dayNumber - observedDays));
        };

        return {
            dateKey,
            day: String(dayNumber).padStart(2, '0'),
            actual: dayNumber <= observedDays ? accumulatedActual : null,
            conservador: buildScenarioValue(scenarioTotals.conservador),
            provavel: buildScenarioValue(scenarioTotals.provavel),
            picos: buildScenarioValue(scenarioTotals.picos)
        };
    });
};

const buildDailySignalSnapshot = ({
    dataset,
    context,
    targetDay,
    simulatedDayTotals,
    simulatedCategoryDayMaps,
    modelConfig
}) => {
    const historyEntries = buildHistoricalEntries({
        dataset,
        context,
        targetDay,
        simulatedDayTotals,
        simulatedCategoryDayMaps
    });
    const historyValues = historyEntries.map((entry) => entry.value);
    const avg7 = average(historyValues.slice(-7));
    const avg30 = average(historyValues.slice(-30).length ? historyValues.slice(-30) : historyValues);
    const previous7 = average(historyValues.slice(-14, -7)) || avg30 || avg7;
    const targetDateKey = buildMonthDateKey(context.monthKey, targetDay);
    const targetWeekday = getDateWeekday(targetDateKey);
    const weekdayEntries = historyEntries.filter((entry) => entry.weekday === targetWeekday);
    const weekdayPattern = average(weekdayEntries.slice(-8).map((entry) => entry.value)) || avg7 || avg30;
    const monthPosition = weightedAverage(
        historyEntries
            .filter((entry) => Math.abs(entry.dayNumber - targetDay) <= 2)
            .map((entry) => ({
                value: entry.value,
                weight: 1 / (Math.abs(entry.dayNumber - targetDay) + 1)
            }))
    ) || avg30 || avg7;
    const recurrenceSamples = getComparableMonths(dataset, context.monthKey)
        .map((monthContext) => getAroundDayAverage({ context: monthContext, targetDay }))
        .filter((value) => Number.isFinite(value));
    const activeRecurrenceSamples = recurrenceSamples.filter((value) => value > 0);
    const recurrence = activeRecurrenceSamples.length
        ? average(activeRecurrenceSamples)
        : monthPosition;
    const trendRatio = previous7 > 0
        ? (avg7 - previous7) / previous7
        : avg7 > 0 ? 0.12 : 0;
    const trend = Math.max(0, (avg7 || avg30 || 0) * (1 + clamp(trendRatio, -0.35, 0.35)));
    const behavior = buildBehaviorSignal({
        entries: historyEntries,
        behaviorConfig: modelConfig.behaviorConfig
    });
    const components = {
        avg7: avg7 || 0,
        avg30: avg30 || avg7 || 0,
        trend,
        weekday: weekdayPattern || avg7 || 0,
        monthPosition: monthPosition || avg30 || avg7 || 0,
        recurrence: recurrence || monthPosition || avg30 || avg7 || 0
    };
    const basePrediction = DAILY_WEIGHT_FIELDS.reduce(
        (total, field) => total + (components[field] * modelConfig.weights[field]),
        0
    );
    const prediction = Math.max(0, basePrediction * behavior.factor);
    const recentVolatilityValues = historyValues.slice(-14);
    const volatilityBase = avg30 || avg7 || 0;
    const volatility = volatilityBase > 0
        ? standardDeviation(recentVolatilityValues.length ? recentVolatilityValues : historyValues) / volatilityBase
        : 0;
    const weekdayCoverage = clamp(weekdayEntries.length / 8, 0, 1);
    const recurrenceCoverage = recurrenceSamples.length
        ? clamp(activeRecurrenceSamples.length / recurrenceSamples.length, 0, 1)
        : 0;
    const confidence = buildPredictionConfidence({
        componentValues: Object.values(components),
        historyCount: historyEntries.length,
        volatility,
        behaviorFactor: behavior.factor,
        recurrenceCoverage,
        weekdayCoverage
    });

    return {
        targetDateKey,
        components,
        weightedComponents: DAILY_WEIGHT_FIELDS.reduce((result, field) => ({
            ...result,
            [field]: components[field] * modelConfig.weights[field]
        }), {}),
        prediction,
        confidence,
        behavior,
        volatility,
        recurrenceCoverage,
        weekdayCoverage,
        historyCount: historyEntries.length
    };
};

const buildCategorySignalSnapshot = ({
    dataset,
    context,
    targetDay,
    categoryName,
    simulatedDayTotals,
    simulatedCategoryDayMaps,
    modelConfig,
    totalBehaviorFactor
}) => {
    const historyEntries = buildHistoricalEntries({
        dataset,
        context,
        targetDay,
        categoryName,
        simulatedDayTotals,
        simulatedCategoryDayMaps
    });
    const historyValues = historyEntries.map((entry) => entry.value);
    const categoryHistoryTotal = sum(historyValues);

    if (!historyEntries.length || categoryHistoryTotal <= 0) {
        return null;
    }

    const avg7 = average(historyValues.slice(-7)) || 0;
    const avg30 = average(historyValues.slice(-30).length ? historyValues.slice(-30) : historyValues) || avg7;
    const previous7 = average(historyValues.slice(-14, -7)) || avg30 || avg7;
    const targetDateKey = buildMonthDateKey(context.monthKey, targetDay);
    const targetWeekday = getDateWeekday(targetDateKey);
    const weekdayEntries = historyEntries.filter((entry) => entry.weekday === targetWeekday);
    const weekdayPattern = average(weekdayEntries.slice(-8).map((entry) => entry.value)) || avg7 || avg30;
    const recurrenceSamples = getComparableMonths(dataset, context.monthKey)
        .map((monthContext) => getAroundDayAverage({ context: monthContext, targetDay, categoryName }))
        .filter((value) => Number.isFinite(value));
    const activeRecurrenceSamples = recurrenceSamples.filter((value) => value > 0);
    const recurrence = activeRecurrenceSamples.length
        ? average(activeRecurrenceSamples)
        : weekdayPattern || avg7 || avg30;
    const trendRatio = previous7 > 0
        ? (avg7 - previous7) / previous7
        : avg7 > 0 ? 0.12 : 0;
    const trend = Math.max(0, (avg7 || avg30 || 0) * (1 + clamp(trendRatio, -0.4, 0.4)));
    const behavior = buildBehaviorSignal({
        entries: historyEntries,
        behaviorConfig: modelConfig.behaviorConfig
    });
    const volatility = (avg30 || avg7) > 0
        ? standardDeviation(historyValues.slice(-14)) / Math.max(1, avg30 || avg7)
        : 0;
    const recurrenceCoverage = recurrenceSamples.length
        ? clamp(activeRecurrenceSamples.length / recurrenceSamples.length, 0, 1)
        : 0;
    const effectiveWeights = buildAdaptiveCategoryWeights({
        baseWeights: modelConfig.categoryWeights,
        volatility,
        recurrenceCoverage
    });
    const components = {
        avg7,
        avg30: avg30 || avg7,
        trend,
        weekday: weekdayPattern || avg7 || 0,
        recurrence: recurrence || weekdayPattern || avg7 || 0
    };
    const blendedBehaviorFactor = clamp(
        ((behavior.factor * 0.7) + (totalBehaviorFactor * 0.3)),
        modelConfig.behaviorConfig.minFactor,
        modelConfig.behaviorConfig.maxFactor
    );
    const basePrediction = CATEGORY_WEIGHT_FIELDS.reduce(
        (total, field) => total + (components[field] * effectiveWeights[field]),
        0
    );
    const prediction = Math.max(0, basePrediction * blendedBehaviorFactor);
    const confidence = buildPredictionConfidence({
        componentValues: Object.values(components),
        historyCount: historyEntries.length,
        volatility,
        behaviorFactor: blendedBehaviorFactor,
        recurrenceCoverage,
        weekdayCoverage: clamp(weekdayEntries.length / 8, 0, 1)
    });

    return {
        categoryName,
        components,
        weightedComponents: CATEGORY_WEIGHT_FIELDS.reduce((result, field) => ({
            ...result,
            [field]: components[field] * effectiveWeights[field]
        }), {}),
        weights: effectiveWeights,
        prediction,
        behaviorFactor: blendedBehaviorFactor,
        confidence,
        recurrenceCoverage,
        volatility
    };
};

const buildCategoryForecastBundle = ({
    dataset,
    context,
    targetDay,
    simulatedDayTotals,
    simulatedCategoryDayMaps,
    totalDailyPrediction,
    totalBehaviorFactor,
    modelConfig
}) => {
    const categoryNames = new Set([
        ...dataset.allCategoryNames,
        ...context.categoryTotals.keys()
    ]);
    const snapshots = Array.from(categoryNames)
        .map((categoryName) => buildCategorySignalSnapshot({
            dataset,
            context,
            targetDay,
            categoryName,
            simulatedDayTotals,
            simulatedCategoryDayMaps,
            modelConfig,
            totalBehaviorFactor
        }))
        .filter(Boolean);
    const rawTotal = sum(snapshots.map((item) => item.prediction));
    const fallbackCategoryTotals = snapshots.length
        ? new Map(snapshots.map((item) => [item.categoryName, dataset.globalCategoryTotals.get(item.categoryName) || 0]))
        : dataset.globalCategoryTotals;
    const fallbackTotal = sum(Array.from(fallbackCategoryTotals.values()));
    const categoryDailyForecastMap = new Map();
    const categoryPredictionDetails = new Map();

    snapshots.forEach((snapshot) => {
        let scaledPrediction = snapshot.prediction;

        if (totalDailyPrediction > 0 && rawTotal > 0) {
            scaledPrediction = snapshot.prediction * (totalDailyPrediction / rawTotal);
        } else if (totalDailyPrediction > 0 && fallbackTotal > 0) {
            scaledPrediction = totalDailyPrediction * ((fallbackCategoryTotals.get(snapshot.categoryName) || 0) / fallbackTotal);
        }

        categoryDailyForecastMap.set(snapshot.categoryName, scaledPrediction);
        categoryPredictionDetails.set(snapshot.categoryName, {
            ...snapshot,
            prediction: scaledPrediction
        });
    });

    return {
        categoryDailyForecastMap,
        categoryPredictionDetails,
        categoryForecastData: Array.from(categoryPredictionDetails.values())
            .sort((left, right) => right.prediction - left.prediction)
    };
};

const buildScenarioDescriptions = ({ weights, categoryWeights, targetPrecision, behaviorFactor }) => ({
    conservador: 'Protege a projeção com desconto sobre a pressão recente, reduzindo impacto de acelerações curtas e picos isolados.',
    provavel: `Combina media de 7 dias (${(weights.avg7 * 100).toFixed(0)}%), media de 30 dias (${(weights.avg30 * 100).toFixed(0)}%), tendencia (${(weights.trend * 100).toFixed(0)}%), padrao semanal (${(weights.weekday * 100).toFixed(0)}%), posicao no mes (${(weights.monthPosition * 100).toFixed(0)}%) e recorrencia (${(weights.recurrence * 100).toFixed(0)}%), com ajuste recente em ${behaviorFactor.toFixed(2)}x e meta de ${targetPrecision}% de precisao.`,
    picos: `Eleva o cenário provável com margem adicional para repetição de compras recorrentes e categorias mais elásticas, preservando a distribuição por categoria (recorrencia em ${(categoryWeights.recurrence * 100).toFixed(0)}%).`
});

export const calculateForecastForObservedDays = ({
    dataset,
    monthKey,
    observedDays,
    modelConfig
}) => {
    const normalizedConfig = getForecastModelConfig(modelConfig);
    const context = dataset.monthMap.get(monthKey);

    if (!context || observedDays < 0) {
        return null;
    }

    const cappedObservedDays = clamp(observedDays, 0, context.totalDaysInMonth);
    const remainingDays = Math.max(0, context.totalDaysInMonth - cappedObservedDays);
    const monthTotalSpent = sum(context.dayTotals.slice(0, cappedObservedDays));
    const historyWindow = dataset.dailySeries
        .filter((entry) => entry.dateKey < buildMonthDateKey(monthKey, Math.max(1, cappedObservedDays + 1)))
        .map((entry) => entry.totalValue);
    const averageDailySpend = cappedObservedDays > 0
        ? monthTotalSpent / Math.max(1, cappedObservedDays)
        : average(historyWindow.slice(-30));
    const recentWindowSize = Math.max(1, Math.min(7, cappedObservedDays || historyWindow.length || 1));
    const recentWindow = cappedObservedDays > 0
        ? context.dayTotals.slice(Math.max(0, cappedObservedDays - recentWindowSize), cappedObservedDays)
        : historyWindow.slice(-recentWindowSize);
    const previousWindow = cappedObservedDays > 0
        ? context.dayTotals.slice(
            Math.max(0, cappedObservedDays - (recentWindowSize * 2)),
            Math.max(0, cappedObservedDays - recentWindowSize)
        )
        : historyWindow.slice(-(recentWindowSize * 2), -recentWindowSize);
    const recentAverage = average(recentWindow);
    const previousAverage = previousWindow.length ? average(previousWindow) : averageDailySpend;
    const paceChange = previousAverage > 0
        ? (recentAverage - previousAverage) / previousAverage
        : recentAverage > 0 ? 1 : 0;
    const currentRunRate = recentWindow.length ? recentAverage : averageDailySpend;
    const simulatedDayTotals = Array.from({ length: context.totalDaysInMonth }, (_, index) => (
        index < cappedObservedDays ? (context.dayTotals[index] || 0) : 0
    ));
    const simulatedCategoryDayMaps = Array.from({ length: context.totalDaysInMonth }, (_, index) => (
        index < cappedObservedDays
            ? new Map(context.categoryDayMaps[index] || [])
            : new Map()
    ));
    const futureForecasts = [];

    for (let dayNumber = cappedObservedDays + 1; dayNumber <= context.totalDaysInMonth; dayNumber += 1) {
        const dailySnapshot = buildDailySignalSnapshot({
            dataset,
            context,
            targetDay: dayNumber,
            simulatedDayTotals,
            simulatedCategoryDayMaps,
            modelConfig: normalizedConfig
        });
        const categoryBundle = buildCategoryForecastBundle({
            dataset,
            context,
            targetDay: dayNumber,
            simulatedDayTotals,
            simulatedCategoryDayMaps,
            totalDailyPrediction: dailySnapshot.prediction,
            totalBehaviorFactor: dailySnapshot.behavior.factor,
            modelConfig: normalizedConfig
        });

        simulatedDayTotals[dayNumber - 1] = dailySnapshot.prediction;
        simulatedCategoryDayMaps[dayNumber - 1] = new Map(categoryBundle.categoryDailyForecastMap);

        futureForecasts.push({
            dayNumber,
            ...dailySnapshot,
            categoryDailyForecastMap: categoryBundle.categoryDailyForecastMap,
            categoryPredictionDetails: categoryBundle.categoryPredictionDetails,
            categoryForecastData: categoryBundle.categoryForecastData
        });
    }

    const firstFutureForecast = futureForecasts[0] || null;
    const projectedDailySpend = firstFutureForecast?.prediction || 0;
    const projectedTotal = sum(simulatedDayTotals);
    const baselineProjectedTotal = Math.max(
        monthTotalSpent,
        monthTotalSpent + ((averageDailySpend || projectedDailySpend || 0) * remainingDays)
    );
    const averageFutureBehavior = average(futureForecasts.map((item) => item.behavior.factor)) || 1;
    const averageFutureVolatility = average(futureForecasts.map((item) => item.volatility)) || 0;
    const averageFutureConfidence = average(futureForecasts.map((item) => item.confidence)) || normalizedConfig.targetPrecision;
    const conservativeFactor = clamp(
        0.88 - (Math.max(0, averageFutureBehavior - 1) * 0.08) - (averageFutureVolatility * 0.04),
        0.76,
        0.96
    );
    const peakFactor = clamp(
        1.12 + (Math.abs(averageFutureBehavior - 1) * 0.18) + (averageFutureVolatility * 0.08),
        1.08,
        1.3
    );
    const scenarioTotals = {
        conservador: Math.max(monthTotalSpent, monthTotalSpent + sum(futureForecasts.map((item) => item.prediction * conservativeFactor))),
        provavel: projectedTotal,
        picos: Math.max(monthTotalSpent, monthTotalSpent + sum(futureForecasts.map((item) => item.prediction * peakFactor)))
    };
    const scenarioDescriptions = buildScenarioDescriptions({
        weights: normalizedConfig.weights,
        categoryWeights: normalizedConfig.categoryWeights,
        behaviorFactor: averageFutureBehavior,
        targetPrecision: normalizedConfig.targetPrecision
    });
    const overallDailyConfidence = firstFutureForecast?.confidence || averageFutureConfidence;
    const nextDayDateKey = cappedObservedDays < context.totalDaysInMonth
        ? buildMonthDateKey(monthKey, cappedObservedDays + 1)
        : '';

    return {
        monthKey,
        monthLabel: formatMonthReferenceLabel(monthKey),
        observedDays: cappedObservedDays,
        totalDaysInMonth: context.totalDaysInMonth,
        remainingDays,
        monthTotalSpent,
        averageDailySpend,
        currentRunRate,
        recentWindowSize,
        paceChange,
        projectedDailySpend,
        projectedTotal: Math.max(monthTotalSpent, projectedTotal),
        projectedAdditionalSpend: Math.max(0, projectedTotal - monthTotalSpent),
        baselineProjectedTotal,
        componentRates: firstFutureForecast?.components || DAILY_WEIGHT_FIELDS.reduce((result, field) => ({ ...result, [field]: 0 }), {}),
        weightedComponents: firstFutureForecast?.weightedComponents || DAILY_WEIGHT_FIELDS.reduce((result, field) => ({ ...result, [field]: 0 }), {}),
        categoryDailyForecastMap: firstFutureForecast?.categoryDailyForecastMap || new Map(),
        categoryPredictionDetails: firstFutureForecast?.categoryPredictionDetails || new Map(),
        categoryForecastData: firstFutureForecast?.categoryForecastData || [],
        scenarios: {
            conservador: {
                value: scenarioTotals.conservador,
                description: scenarioDescriptions.conservador
            },
            provavel: {
                value: scenarioTotals.provavel,
                description: scenarioDescriptions.provavel
            },
            picos: {
                value: scenarioTotals.picos,
                description: scenarioDescriptions.picos
            }
        },
        projectionChartData: buildProjectionChartData({
            monthKey,
            totalDaysInMonth: context.totalDaysInMonth,
            observedDays: cappedObservedDays,
            dayTotals: context.dayTotals,
            scenarioTotals
        }),
        weights: normalizedConfig.weights,
        categoryWeights: normalizedConfig.categoryWeights,
        behaviorFactor: firstFutureForecast?.behavior.factor || averageFutureBehavior,
        behaviorSignal: firstFutureForecast?.behavior || buildBehaviorSignal({
            entries: buildHistoricalEntries({
                dataset,
                context,
                targetDay: Math.min(context.totalDaysInMonth, cappedObservedDays + 1),
                simulatedDayTotals,
                simulatedCategoryDayMaps
            }),
            behaviorConfig: normalizedConfig.behaviorConfig
        }),
        dailyConfidence: overallDailyConfidence,
        confidenceStatus: getForecastAccuracyStatus(overallDailyConfidence),
        nextDayDateKey,
        nextDayLabel: nextDayDateKey ? formatMonthDayLabel(nextDayDateKey) : '--'
    };
};

const calculateErrorMetrics = (predictedValue, realValue) => {
    const safePredictedValue = Number(predictedValue) || 0;
    const safeRealValue = Number(realValue) || 0;
    const errorValue = safeRealValue - safePredictedValue;
    let errorPercent = 0;

    if (safeRealValue > 0) {
        errorPercent = (Math.abs(errorValue) / safeRealValue) * 100;
    } else if (safePredictedValue > 0) {
        errorPercent = 100;
    }

    return {
        errorValue,
        errorPercent,
        precision: Math.max(0, 100 - errorPercent)
    };
};

const buildDailyValidationRecords = ({ dataset, modelConfig, currentDateKey }) => {
    const records = [];

    dataset.months.forEach((context) => {
        for (let observedDays = 1; observedDays < context.totalDaysInMonth; observedDays += 1) {
            const targetDay = observedDays + 1;
            const targetDateKey = buildMonthDateKey(context.monthKey, targetDay);

            if (currentDateKey && targetDateKey > currentDateKey) {
                break;
            }

            const forecast = calculateForecastForObservedDays({
                dataset,
                monthKey: context.monthKey,
                observedDays,
                modelConfig
            });

            if (!forecast) continue;

            const realValue = Number(context.dayTotals[targetDay - 1]) || 0;
            const predictedValue = forecast.projectedDailySpend;
            const errorMetrics = calculateErrorMetrics(predictedValue, realValue);

            records.push({
                key: `${FORECAST_LEVEL_DAILY}|${targetDateKey}`,
                level: FORECAST_LEVEL_DAILY,
                scopeKey: 'geral',
                monthKey: context.monthKey,
                referenceDateKey: buildMonthDateKey(context.monthKey, observedDays),
                dateKey: targetDateKey,
                label: formatMonthDayLabel(targetDateKey),
                predictedValue,
                realValue,
                componentPredictions: forecast.componentRates,
                behaviorFactor: forecast.behaviorFactor,
                confidence: forecast.dailyConfidence,
                ...errorMetrics
            });
        }
    });

    return records.sort((left, right) => left.dateKey.localeCompare(right.dateKey));
};

const buildCategoryValidationRecords = ({ dataset, modelConfig, currentDateKey }) => {
    const records = [];

    dataset.months.forEach((context) => {
        for (let observedDays = 1; observedDays < context.totalDaysInMonth; observedDays += 1) {
            const targetDay = observedDays + 1;
            const targetDateKey = buildMonthDateKey(context.monthKey, targetDay);

            if (currentDateKey && targetDateKey > currentDateKey) {
                break;
            }

            const forecast = calculateForecastForObservedDays({
                dataset,
                monthKey: context.monthKey,
                observedDays,
                modelConfig
            });

            if (!forecast) continue;

            const actualCategoryMap = context.categoryDayMaps[targetDay - 1] || new Map();
            const categoryNames = new Set([
                ...forecast.categoryDailyForecastMap.keys(),
                ...actualCategoryMap.keys()
            ]);

            categoryNames.forEach((categoryName) => {
                const predictedValue = forecast.categoryDailyForecastMap.get(categoryName) || 0;
                const realValue = actualCategoryMap.get(categoryName) || 0;
                const categoryDetail = forecast.categoryPredictionDetails?.get(categoryName);

                if (predictedValue <= 0 && realValue <= 0) {
                    return;
                }

                records.push({
                    key: `${FORECAST_LEVEL_CATEGORY}|${categoryName}|${targetDateKey}`,
                    level: FORECAST_LEVEL_CATEGORY,
                    scopeKey: categoryName,
                    monthKey: context.monthKey,
                    referenceDateKey: buildMonthDateKey(context.monthKey, observedDays),
                    dateKey: targetDateKey,
                    label: formatMonthDayLabel(targetDateKey),
                    categoryName,
                    predictedValue,
                    realValue,
                    componentPredictions: categoryDetail?.components || CATEGORY_WEIGHT_FIELDS.reduce((result, field) => ({ ...result, [field]: 0 }), {}),
                    effectiveWeights: categoryDetail?.weights || forecast.categoryWeights,
                    behaviorFactor: categoryDetail?.behaviorFactor || forecast.behaviorFactor,
                    confidence: categoryDetail?.confidence || forecast.dailyConfidence,
                    ...calculateErrorMetrics(predictedValue, realValue)
                });
            });
        }
    });

    return records.sort((left, right) => (
        left.dateKey.localeCompare(right.dateKey)
        || left.scopeKey.localeCompare(right.scopeKey, 'pt-BR')
    ));
};

const resolveMonthlyCheckpointDay = (context) => {
    if (!context || context.totalDaysInMonth <= 1) return 0;

    const baselineCheckpoint = Math.max(7, Math.ceil(context.totalDaysInMonth * 0.5));
    return Math.min(context.totalDaysInMonth - 1, baselineCheckpoint);
};

const buildMonthlyValidationRecords = ({ dataset, modelConfig, currentMonthKey }) => {
    return dataset.months
        .filter((context) => context.monthKey < currentMonthKey)
        .map((context) => {
            const checkpointDay = resolveMonthlyCheckpointDay(context);
            if (!checkpointDay) return null;

            const forecast = calculateForecastForObservedDays({
                dataset,
                monthKey: context.monthKey,
                observedDays: checkpointDay,
                modelConfig
            });

            if (!forecast) return null;

            return {
                key: `${FORECAST_LEVEL_MONTHLY}|${context.monthKey}`,
                level: FORECAST_LEVEL_MONTHLY,
                scopeKey: context.monthKey,
                monthKey: context.monthKey,
                referenceDateKey: buildMonthDateKey(context.monthKey, checkpointDay),
                dateKey: buildMonthDateKey(context.monthKey, checkpointDay),
                label: formatCompactMonthReferenceLabel(context.monthKey),
                predictedValue: forecast.projectedTotal,
                realValue: context.totalSpent,
                checkpointDay,
                ...calculateErrorMetrics(forecast.projectedTotal, context.totalSpent)
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
};

const buildAccuracyMetrics = (records = []) => {
    if (!records.length) {
        return {
            count: 0,
            mape: 0,
            precision: 0,
            meanAbsoluteError: 0,
            meanError: 0
        };
    }

    return {
        count: records.length,
        mape: average(records.map((record) => record.errorPercent)),
        precision: Math.max(0, 100 - average(records.map((record) => record.errorPercent))),
        meanAbsoluteError: average(records.map((record) => Math.abs(record.errorValue))),
        meanError: average(records.map((record) => record.errorValue))
    };
};

export const getForecastAccuracyStatus = (precision) => {
    if (precision >= 90) {
        return {
            tone: 'excellent',
            color: '#2E7D32',
            badge: 'Muito preciso',
            description: 'Algoritmo altamente preciso'
        };
    }

    if (precision >= 80) {
        return {
            tone: 'good',
            color: '#F9A825',
            badge: 'Boa confiabilidade',
            description: 'Previsao boa e confiavel'
        };
    }

    if (precision >= 70) {
        return {
            tone: 'attention',
            color: '#EF6C00',
            badge: 'Pode melhorar',
            description: 'Modelo razoavel, pode melhorar'
        };
    }

    return {
        tone: 'critical',
        color: '#C62828',
        badge: 'Precisa ajustar',
        description: 'Modelo precisa ser ajustado'
    };
};

const buildWeeklyPrecisionData = (records) => {
    const weeklyMap = new Map();

    records.forEach((record) => {
        const weekKey = getWeekStartKey(record.dateKey);
        if (!weekKey) return;

        if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, []);
        }

        weeklyMap.get(weekKey).push(record.precision);
    });

    return Array.from(weeklyMap.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([weekKey, values], index) => ({
            weekKey,
            week: `Semana ${index + 1}`,
            label: formatMonthDayLabel(weekKey),
            precision: average(values)
        }));
};

const buildTrendSummary = (records) => {
    const recentWindow = records.slice(-7);
    const previousWindow = records.slice(-14, -7);
    const recentPrecision = recentWindow.length ? average(recentWindow.map((record) => record.precision)) : 0;
    const previousPrecision = previousWindow.length ? average(previousWindow.map((record) => record.precision)) : recentPrecision;
    const delta = recentPrecision - previousPrecision;

    if (delta > 1.5) {
        return {
            delta,
            label: 'Melhorando',
            description: withInsightWhy(
                'A precisao recente subiu frente a janela imediatamente anterior',
                'os erros das ultimas previsoes diminuiram na comparacao com a semana anterior'
            ),
            color: '#2E7D32'
        };
    }

    if (delta < -1.5) {
        return {
            delta,
            label: 'Piorando',
            description: withInsightWhy(
                'A precisao recente caiu e merece revisao do modelo',
                'as ultimas previsoes ficaram mais distantes do gasto real do que na janela imediatamente anterior'
            ),
            color: '#C62828'
        };
    }

    return {
        delta,
        label: 'Estavel',
        description: withInsightWhy(
            'A precisao segue proxima do padrao das semanas anteriores',
            'o erro medio recente permaneceu perto do nivel que o modelo vinha entregando'
        ),
        color: 'var(--primary-blue)'
    };
};

const buildCategorySummaryData = (records) => {
    const categoryMap = new Map();

    records.forEach((record) => {
        if (!categoryMap.has(record.scopeKey)) {
            categoryMap.set(record.scopeKey, []);
        }

        categoryMap.get(record.scopeKey).push(record);
    });

    return Array.from(categoryMap.entries())
        .map(([categoryName, categoryRecords]) => {
            const metrics = buildAccuracyMetrics(categoryRecords);

            return {
                categoryName,
                recordsCount: categoryRecords.length,
                mape: metrics.mape,
                precision: metrics.precision,
                meanAbsoluteError: metrics.meanAbsoluteError
            };
        })
        .sort((left, right) => right.recordsCount - left.recordsCount || right.precision - left.precision)
        .slice(0, 8);
};

const getWeightsSignature = (weights = {}, fields = []) => fields
    .map((field) => `${field}:${(weights[field] || 0).toFixed(4)}`)
    .join('|');

const buildComponentPerformance = (records = [], fields = []) => fields.reduce((result, field) => {
    const componentMetrics = records.map((record) => {
        const predictedValue = Number(record.componentPredictions?.[field]) || 0;
        const realValue = Number(record.realValue) || 0;
        const absoluteError = Math.abs(realValue - predictedValue);
        const errorPercent = realValue > 0
            ? (absoluteError / realValue) * 100
            : predictedValue > 0 ? 100 : 0;

        return {
            absoluteError,
            errorPercent
        };
    });
    const meanAbsoluteError = average(componentMetrics.map((item) => item.absoluteError));
    const mape = average(componentMetrics.map((item) => item.errorPercent));

    return {
        ...result,
        [field]: {
            meanAbsoluteError,
            mape,
            precision: Math.max(0, 100 - mape),
            factor: 1 / (meanAbsoluteError + 1)
        }
    };
}, {});

const deriveRecommendedWeights = ({ currentWeights, performance, fields, defaults, normalizer }) => {
    const weightedResult = fields.reduce((result, field) => ({
        ...result,
        [field]: (currentWeights[field] || defaults[field]) * (performance[field]?.factor || 1)
    }), {});

    return normalizer(weightedResult);
};

const hasMeaningfulWeightChange = (currentWeights, nextWeights, fields = []) => fields.some((field) => (
    Math.abs((currentWeights[field] || 0) - (nextWeights[field] || 0)) >= 0.015
));

const estimateProjectedPrecision = ({ performance, weights, fields = [] }) => (
    fields.reduce((total, field) => total + ((performance[field]?.precision || 0) * (weights[field] || 0)), 0)
);

const resolveRecalibrationRecommendation = ({
    modelConfig,
    dailyRecords,
    categoryRecords,
    overallPrecision
}) => {
    const normalizedConfig = getForecastModelConfig(modelConfig);
    const recentDailyRecords = dailyRecords.slice(-21);
    const recentCategoryRecords = categoryRecords.slice(-84);

    if (recentDailyRecords.length < 7) {
        return {
            shouldRecalibrate: false,
            recommendedWeights: normalizedConfig.weights,
            recommendedCategoryWeights: normalizedConfig.categoryWeights,
            reason: ''
        };
    }

    const dailyPerformance = buildComponentPerformance(recentDailyRecords, DAILY_WEIGHT_FIELDS);
    const categoryPerformance = buildComponentPerformance(recentCategoryRecords, CATEGORY_WEIGHT_FIELDS);
    const recommendedWeights = deriveRecommendedWeights({
        currentWeights: normalizedConfig.weights,
        performance: dailyPerformance,
        fields: DAILY_WEIGHT_FIELDS,
        defaults: DEFAULT_DAILY_WEIGHTS,
        normalizer: normalizeForecastWeights
    });
    const recommendedCategoryWeights = recentCategoryRecords.length
        ? deriveRecommendedWeights({
            currentWeights: normalizedConfig.categoryWeights,
            performance: categoryPerformance,
            fields: CATEGORY_WEIGHT_FIELDS,
            defaults: DEFAULT_CATEGORY_WEIGHTS,
            normalizer: normalizeForecastCategoryWeights
        })
        : normalizedConfig.categoryWeights;
    const shouldRecalibrate = hasMeaningfulWeightChange(normalizedConfig.weights, recommendedWeights, DAILY_WEIGHT_FIELDS)
        || hasMeaningfulWeightChange(normalizedConfig.categoryWeights, recommendedCategoryWeights, CATEGORY_WEIGHT_FIELDS);

    if (!shouldRecalibrate) {
        return {
            shouldRecalibrate: false,
            recommendedWeights: normalizedConfig.weights,
            recommendedCategoryWeights: normalizedConfig.categoryWeights,
            currentWeights: normalizedConfig.weights,
            currentCategoryWeights: normalizedConfig.categoryWeights,
            dailyPerformance,
            categoryPerformance,
            reason: ''
        };
    }

    return {
        shouldRecalibrate: true,
        recommendedWeights,
        recommendedCategoryWeights,
        currentWeights: normalizedConfig.weights,
        currentCategoryWeights: normalizedConfig.categoryWeights,
        dailyPerformance,
        categoryPerformance,
        projectedPrecision: average([
            estimateProjectedPrecision({
                performance: dailyPerformance,
                weights: recommendedWeights,
                fields: DAILY_WEIGHT_FIELDS
            }),
            estimateProjectedPrecision({
                performance: categoryPerformance,
                weights: recommendedCategoryWeights,
                fields: CATEGORY_WEIGHT_FIELDS
            }) || overallPrecision
        ].filter((value) => Number.isFinite(value) && value > 0)),
        reason: overallPrecision < normalizedConfig.precisionThreshold
            ? withInsightWhy(
                `Precisao media abaixo de ${normalizedConfig.precisionThreshold}%. Ajuste sugerido para aumentar a resposta do modelo ao comportamento recente`,
                'os erros recentes mostram que os pesos atuais ficaram lentos para acompanhar a mudanca do comportamento observado'
            )
            : withInsightWhy(
                'Revisao semanal concluida com ajuste fino para acompanhar o padrao recente de consumo',
                'o monitoramento encontrou espaco para pequenos refinamentos sem indicar quebra do modelo'
            )
    };
};

const buildPersistenceRecords = ({ dailyRecords, categoryRecords, monthlyRecords, modelConfig }) => {
    const normalizedConfig = getForecastModelConfig(modelConfig);

    return [...dailyRecords, ...categoryRecords, ...monthlyRecords].map((record) => ({
        key: record.key,
        level: record.level,
        scope: record.level,
        scopeKey: record.scopeKey,
        monthKey: record.monthKey,
        dateKey: record.dateKey,
        referenceDateKey: record.referenceDateKey,
        categoryName: record.categoryName || '',
        label: record.label,
        predictedValue: record.predictedValue,
        realValue: record.realValue,
        errorValue: record.errorValue,
        errorPercent: record.errorPercent,
        precision: record.precision,
        checkpointDay: record.checkpointDay || 0,
        modelConfigId: normalizedConfig.id,
        weights: normalizedConfig.weights,
        categoryWeights: normalizedConfig.categoryWeights,
        updatedAt: new Date().toISOString()
    }));
};

export const buildForecastValidationModule = ({
    dataset,
    modelConfig,
    referenceDate = new Date()
}) => {
    const normalizedConfig = getForecastModelConfig(modelConfig);
    const currentDateKey = getDateKey(referenceDate);
    const currentMonthKey = getMonthKey(referenceDate);
    const dailyRecords = buildDailyValidationRecords({
        dataset,
        modelConfig: normalizedConfig,
        currentDateKey
    });
    const categoryRecords = buildCategoryValidationRecords({
        dataset,
        modelConfig: normalizedConfig,
        currentDateKey
    });
    const monthlyRecords = buildMonthlyValidationRecords({
        dataset,
        modelConfig: normalizedConfig,
        currentMonthKey
    });
    const dailyMetrics = buildAccuracyMetrics(dailyRecords);
    const categoryMetrics = buildAccuracyMetrics(categoryRecords);
    const monthlyMetrics = buildAccuracyMetrics(monthlyRecords);

    const weightedMapeValues = [
        { value: dailyMetrics.mape, weight: dailyMetrics.count ? 0.6 : 0 },
        { value: categoryMetrics.mape, weight: categoryMetrics.count ? 0.2 : 0 },
        { value: monthlyMetrics.mape, weight: monthlyMetrics.count ? 0.2 : 0 }
    ].filter((item) => item.weight > 0);
    const totalWeightedShare = sum(weightedMapeValues.map((item) => item.weight));
    const overallMape = totalWeightedShare > 0
        ? weightedMapeValues.reduce((total, item) => total + (item.value * item.weight), 0) / totalWeightedShare
        : 0;
    const overallPrecision = totalWeightedShare > 0
        ? Math.max(0, 100 - overallMape)
        : 0;
    const status = getForecastAccuracyStatus(overallPrecision);
    const trend = buildTrendSummary(dailyRecords);
    const weeklyPrecisionData = buildWeeklyPrecisionData(dailyRecords);
    const categorySummaryData = buildCategorySummaryData(categoryRecords);
    const comparisonChartData = dailyRecords.slice(-21).map((record) => ({
        date: record.label,
        dateKey: record.dateKey,
        previsto: record.predictedValue,
        real: record.realValue,
        precisao: record.precision
    }));
    const recalibration = resolveRecalibrationRecommendation({
        modelConfig: normalizedConfig,
        dailyRecords,
        categoryRecords,
        overallPrecision
    });

    return {
        overallMape,
        overallPrecision,
        status,
        alertMessage: overallPrecision < normalizedConfig.precisionThreshold
            ? withInsightWhy(
                'O algoritmo de previsao esta perdendo precisao. Sugestao: recalibrar pesos do modelo',
                `a precisao media caiu para ${Math.round(overallPrecision)}% e ficou abaixo do limite configurado de ${normalizedConfig.precisionThreshold}%`
            )
            : '',
        dailyMetrics,
        categoryMetrics,
        monthlyMetrics,
        trend,
        weeklyPrecisionData,
        comparisonChartData,
        recentDailyRecords: [...dailyRecords].reverse().slice(0, 20),
        dailyRecords,
        recentCategoryRecords: [...categoryRecords].reverse().slice(0, 20),
        categoryRecords,
        monthlyRecords,
        categorySummaryData,
        recalibration,
        weights: normalizedConfig.weights,
        categoryWeights: normalizedConfig.categoryWeights,
        persistenceRecords: buildPersistenceRecords({
            dailyRecords,
            categoryRecords,
            monthlyRecords,
            modelConfig: normalizedConfig
        }),
        persistenceSignature: [
            getWeightsSignature(normalizedConfig.weights, DAILY_WEIGHT_FIELDS),
            getWeightsSignature(normalizedConfig.categoryWeights, CATEGORY_WEIGHT_FIELDS),
            dailyRecords.length,
            categoryRecords.length,
            monthlyRecords.length,
            dailyRecords.at(-1)?.key || '',
            categoryRecords.at(-1)?.key || '',
            monthlyRecords.at(-1)?.key || ''
        ].join('|')
    };
};
