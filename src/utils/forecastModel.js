import { normalizePaymentMethod } from './paymentMethods';

const DEFAULT_WEIGHTS = {
    movingAverage: 0.5,
    trend: 0.3,
    seasonality: 0.2
};

export const DEFAULT_FORECAST_MODEL_CONFIG = {
    id: 'primary',
    weights: DEFAULT_WEIGHTS,
    precisionThreshold: 80,
    targetPrecision: 92,
    lastRecalibratedAt: '',
    updatedAt: ''
};

const MODEL_WEIGHT_FIELDS = ['movingAverage', 'trend', 'seasonality'];
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

const safeDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const getDateKey = (value) => {
    const date = safeDate(value);
    return date ? date.toISOString().split('T')[0] : null;
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

const getWeekStartKey = (dateKey) => {
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

export const normalizeForecastWeights = (weights = {}) => {
    const rawWeights = MODEL_WEIGHT_FIELDS.reduce((result, field) => ({
        ...result,
        [field]: normalizeWeightValue(weights[field] ?? DEFAULT_WEIGHTS[field])
    }), {});

    const totalWeight = sum(Object.values(rawWeights));
    if (totalWeight <= 0) {
        return DEFAULT_WEIGHTS;
    }

    return MODEL_WEIGHT_FIELDS.reduce((result, field) => ({
        ...result,
        [field]: rawWeights[field] / totalWeight
    }), {});
};

export const getForecastModelConfig = (config = {}) => ({
    ...DEFAULT_FORECAST_MODEL_CONFIG,
    ...config,
    weights: normalizeForecastWeights(config.weights || DEFAULT_FORECAST_MODEL_CONFIG.weights)
});

const createCategoryDayMapArray = (size) => Array.from({ length: size }, () => new Map());

export const buildForecastDataset = ({ receipts = [], products = [] } = {}) => {
    const receiptMetaById = new Map();
    const monthMap = new Map();

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

        dayCategoryMap.set(category, (dayCategoryMap.get(category) || 0) + totalValue);
        context.categoryTotals.set(category, (context.categoryTotals.get(category) || 0) + totalValue);
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

    return {
        receiptMetaById,
        months,
        monthMap: normalizedMonthMap
    };
};

const getComparableMonths = (dataset, monthKey) => dataset.months.filter((context) => context.monthKey < monthKey);

const sumContextDays = (context, observedDays, categoryName = '') => {
    if (!context || observedDays <= 0) return 0;

    if (!categoryName) {
        return sum(context.dayTotals.slice(0, observedDays));
    }

    return context.categoryDayMaps
        .slice(0, observedDays)
        .reduce((total, dayMap) => total + (dayMap.get(categoryName) || 0), 0);
};

const getContextTotal = (context, categoryName = '') => (
    categoryName
        ? context.categoryTotals.get(categoryName) || 0
        : context.totalSpent
);

const resolveSeasonalityProjectedTotal = ({
    dataset,
    monthKey,
    observedDays,
    partialSpent,
    categoryName = ''
}) => {
    if (partialSpent <= 0) return null;

    const comparableMonths = getComparableMonths(dataset, monthKey);
    const ratios = comparableMonths
        .map((context) => {
            const comparableDay = Math.min(observedDays, context.totalDaysInMonth);
            const partialValue = sumContextDays(context, comparableDay, categoryName);
            const finalValue = getContextTotal(context, categoryName);

            if (partialValue <= 0 || finalValue <= 0 || finalValue < partialValue) {
                return null;
            }

            return clamp(finalValue / partialValue, 1, 4);
        })
        .filter((ratio) => Number.isFinite(ratio));

    if (!ratios.length) {
        return null;
    }

    return Math.max(partialSpent, partialSpent * average(ratios));
};

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

const buildCategoryDailyRateMap = ({
    dataset,
    context,
    observedDays,
    remainingDays,
    combinedDailyRate,
    weights
}) => {
    const categoryTotals = new Map();
    const categoryRecentTotals = new Map();
    const categoryPreviousTotals = new Map();
    const recentWindowSize = Math.min(7, observedDays);
    const previousWindowSize = Math.min(7, Math.max(0, observedDays - recentWindowSize));
    const recentStartIndex = Math.max(0, observedDays - recentWindowSize);
    const previousStartIndex = Math.max(0, recentStartIndex - previousWindowSize);
    const activeCategories = new Set();

    context.categoryDayMaps.slice(0, observedDays).forEach((dayMap, index) => {
        dayMap.forEach((value, categoryName) => {
            activeCategories.add(categoryName);
            categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + value);

            if (index >= recentStartIndex) {
                categoryRecentTotals.set(categoryName, (categoryRecentTotals.get(categoryName) || 0) + value);
            } else if (index >= previousStartIndex) {
                categoryPreviousTotals.set(categoryName, (categoryPreviousTotals.get(categoryName) || 0) + value);
            }
        });
    });

    const categoryRates = Array.from(activeCategories).map((categoryName) => {
        const totalValue = categoryTotals.get(categoryName) || 0;
        const overallAverage = totalValue / Math.max(1, observedDays);
        const recentAverage = (categoryRecentTotals.get(categoryName) || 0) / Math.max(1, recentWindowSize);
        const previousAverage = previousWindowSize > 0
            ? (categoryPreviousTotals.get(categoryName) || 0) / previousWindowSize
            : overallAverage;
        const trendChange = previousAverage > 0
            ? (recentAverage - previousAverage) / previousAverage
            : recentAverage > 0 ? 1 : 0;
        const movingAverageRate = (recentAverage * 0.65) + (overallAverage * 0.35);
        const trendRate = Math.max(0, recentAverage * (1 + (trendChange * 0.5)));
        const seasonalProjectedTotal = resolveSeasonalityProjectedTotal({
            dataset,
            monthKey: context.monthKey,
            observedDays,
            partialSpent: totalValue,
            categoryName
        });
        const seasonalityRate = remainingDays > 0
            ? Math.max(0, ((seasonalProjectedTotal ?? totalValue) - totalValue) / remainingDays)
            : 0;
        const dailyRate = (
            (movingAverageRate * weights.movingAverage)
            + (trendRate * weights.trend)
            + (seasonalityRate * weights.seasonality)
        );

        return {
            categoryName,
            dailyRate: Math.max(0, dailyRate)
        };
    });

    const totalCategoryRate = sum(categoryRates.map((item) => item.dailyRate));
    if (combinedDailyRate > 0 && totalCategoryRate > 0) {
        const scale = combinedDailyRate / totalCategoryRate;
        return new Map(categoryRates.map((item) => [item.categoryName, item.dailyRate * scale]));
    }

    if (combinedDailyRate > 0 && categoryRates.length) {
        const fallbackShare = combinedDailyRate / categoryRates.length;
        return new Map(categoryRates.map((item) => [item.categoryName, fallbackShare]));
    }

    return new Map(categoryRates.map((item) => [item.categoryName, item.dailyRate]));
};

const buildScenarioDescriptions = ({ weights, targetPrecision }) => ({
    conservador: 'Baseado na media movel suavizada com protecao adicional para conter desvios de curto prazo.',
    provavel: `Equilibrio ponderado entre media movel (${(weights.movingAverage * 100).toFixed(0)}%), tendencia (${(weights.trend * 100).toFixed(0)}%) e sazonalidade (${(weights.seasonality * 100).toFixed(0)}%), com meta de ${targetPrecision}% de precisao.`,
    picos: 'Considera repeticao de picos recentes e maior elasticidade no restante do mes.'
});

export const calculateForecastForObservedDays = ({
    dataset,
    monthKey,
    observedDays,
    modelConfig
}) => {
    const normalizedConfig = getForecastModelConfig(modelConfig);
    const context = dataset.monthMap.get(monthKey);

    if (!context || observedDays <= 0) {
        return null;
    }

    const cappedObservedDays = Math.min(observedDays, context.totalDaysInMonth);
    const remainingDays = Math.max(0, context.totalDaysInMonth - cappedObservedDays);
    const monthTotalSpent = sum(context.dayTotals.slice(0, cappedObservedDays));
    const averageDailySpend = monthTotalSpent / Math.max(1, cappedObservedDays);
    const recentWindowSize = Math.min(7, cappedObservedDays);
    const recentWindow = context.dayTotals.slice(cappedObservedDays - recentWindowSize, cappedObservedDays);
    const previousWindow = context.dayTotals.slice(
        Math.max(0, cappedObservedDays - (recentWindowSize * 2)),
        Math.max(0, cappedObservedDays - recentWindowSize)
    );
    const recentAverage = average(recentWindow);
    const previousAverage = previousWindow.length ? average(previousWindow) : averageDailySpend;
    const paceChange = previousAverage > 0
        ? (recentAverage - previousAverage) / previousAverage
        : recentAverage > 0 ? 1 : 0;
    const currentRunRate = recentWindow.length ? recentAverage : averageDailySpend;
    const movingAverageRate = (recentAverage * 0.65) + (averageDailySpend * 0.35);
    const trendRate = Math.max(0, (recentAverage || averageDailySpend) * (1 + (paceChange * 0.5)));
    const baselineProjectedTotal = averageDailySpend * context.totalDaysInMonth;
    const seasonalProjectedTotal = resolveSeasonalityProjectedTotal({
        dataset,
        monthKey,
        observedDays: cappedObservedDays,
        partialSpent: monthTotalSpent
    }) ?? Math.max(monthTotalSpent, baselineProjectedTotal);
    const seasonalityRate = remainingDays > 0
        ? Math.max(0, (seasonalProjectedTotal - monthTotalSpent) / remainingDays)
        : 0;

    const projectedDailySpend = (
        (movingAverageRate * normalizedConfig.weights.movingAverage)
        + (trendRate * normalizedConfig.weights.trend)
        + (seasonalityRate * normalizedConfig.weights.seasonality)
    );
    const projectedTotal = Math.max(
        monthTotalSpent,
        monthTotalSpent + (projectedDailySpend * remainingDays)
    );
    const conservativeDailyRate = Math.max(0, Math.min(movingAverageRate, trendRate || movingAverageRate, seasonalityRate || movingAverageRate));
    const peakDailyRate = Math.max(
        ...context.dayTotals.slice(0, cappedObservedDays),
        currentRunRate,
        movingAverageRate * 1.08,
        trendRate * 1.12
    );
    const scenarioTotals = {
        conservador: Math.max(monthTotalSpent, monthTotalSpent + (conservativeDailyRate * remainingDays)),
        provavel: projectedTotal,
        picos: Math.max(monthTotalSpent, monthTotalSpent + (peakDailyRate * remainingDays))
    };
    const scenarioDescriptions = buildScenarioDescriptions({
        weights: normalizedConfig.weights,
        targetPrecision: normalizedConfig.targetPrecision
    });

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
        projectedTotal,
        projectedAdditionalSpend: Math.max(0, projectedTotal - monthTotalSpent),
        baselineProjectedTotal,
        componentRates: {
            movingAverage: movingAverageRate,
            trend: trendRate,
            seasonality: seasonalityRate
        },
        weightedComponents: {
            movingAverage: movingAverageRate * normalizedConfig.weights.movingAverage,
            trend: trendRate * normalizedConfig.weights.trend,
            seasonality: seasonalityRate * normalizedConfig.weights.seasonality
        },
        categoryDailyForecastMap: buildCategoryDailyRateMap({
            dataset,
            context,
            observedDays: cappedObservedDays,
            remainingDays,
            combinedDailyRate: projectedDailySpend,
            weights: normalizedConfig.weights
        }),
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
        weights: normalizedConfig.weights
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
            description: 'A precisao recente subiu frente a janela imediatamente anterior.',
            color: '#2E7D32'
        };
    }

    if (delta < -1.5) {
        return {
            delta,
            label: 'Piorando',
            description: 'A precisao recente caiu e merece revisao do modelo.',
            color: '#C62828'
        };
    }

    return {
        delta,
        label: 'Estavel',
        description: 'A precisao segue proxima do padrao das semanas anteriores.',
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

const CANDIDATE_WEIGHT_SETS = [
    DEFAULT_WEIGHTS,
    { movingAverage: 0.4, trend: 0.4, seasonality: 0.2 },
    { movingAverage: 0.45, trend: 0.35, seasonality: 0.2 },
    { movingAverage: 0.4, trend: 0.3, seasonality: 0.3 },
    { movingAverage: 0.55, trend: 0.25, seasonality: 0.2 },
    { movingAverage: 0.35, trend: 0.45, seasonality: 0.2 },
    { movingAverage: 0.45, trend: 0.25, seasonality: 0.3 }
];

const getWeightsSignature = (weights) => MODEL_WEIGHT_FIELDS
    .map((field) => `${field}:${(weights[field] || 0).toFixed(4)}`)
    .join('|');

const resolveRecalibrationRecommendation = ({
    dataset,
    modelConfig,
    dailyRecords,
    overallPrecision
}) => {
    const normalizedConfig = getForecastModelConfig(modelConfig);
    if (dailyRecords.length < 10 || overallPrecision >= normalizedConfig.precisionThreshold) {
        return {
            shouldRecalibrate: false,
            recommendedWeights: normalizedConfig.weights,
            reason: ''
        };
    }

    const recentWindowStartKey = dailyRecords.at(-30)?.dateKey || dailyRecords[0]?.dateKey || '';
    const eligibleMonths = dataset.months.filter((context) => (
        context.monthKey >= (recentWindowStartKey ? recentWindowStartKey.slice(0, 7) : '')
    ));
    const eligibleMonthMap = new Map(eligibleMonths.map((context) => [context.monthKey, context]));

    const candidateResults = CANDIDATE_WEIGHT_SETS.map((weights) => {
        const candidateDailyRecords = buildDailyValidationRecords({
            dataset: { ...dataset, months: eligibleMonths, monthMap: eligibleMonthMap },
            modelConfig: { ...normalizedConfig, weights },
            currentDateKey: dailyRecords.at(-1)?.dateKey || ''
        });
        const metrics = buildAccuracyMetrics(candidateDailyRecords.slice(-30));

        return {
            weights: normalizeForecastWeights(weights),
            mape: metrics.mape,
            precision: metrics.precision
        };
    }).sort((left, right) => left.mape - right.mape);

    const bestCandidate = candidateResults[0];
    const currentSignature = getWeightsSignature(normalizedConfig.weights);
    const bestSignature = getWeightsSignature(bestCandidate.weights);

    if (!bestCandidate || bestSignature === currentSignature || bestCandidate.precision <= overallPrecision) {
        return {
            shouldRecalibrate: false,
            recommendedWeights: normalizedConfig.weights,
            reason: ''
        };
    }

    return {
        shouldRecalibrate: true,
        recommendedWeights: bestCandidate.weights,
        currentWeights: normalizedConfig.weights,
        projectedPrecision: bestCandidate.precision,
        reason: `Precisao media abaixo de ${normalizedConfig.precisionThreshold}%. Ajuste sugerido para aumentar a resposta do modelo ao comportamento recente.`
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
        dataset,
        modelConfig: normalizedConfig,
        dailyRecords,
        overallPrecision
    });

    return {
        overallMape,
        overallPrecision,
        status,
        alertMessage: overallPrecision < normalizedConfig.precisionThreshold
            ? 'O algoritmo de previsao esta perdendo precisao. Sugestao: recalibrar pesos do modelo.'
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
        persistenceRecords: buildPersistenceRecords({
            dailyRecords,
            categoryRecords,
            monthlyRecords,
            modelConfig: normalizedConfig
        }),
        persistenceSignature: [
            getWeightsSignature(normalizedConfig.weights),
            dailyRecords.length,
            categoryRecords.length,
            monthlyRecords.length,
            dailyRecords.at(-1)?.key || '',
            categoryRecords.at(-1)?.key || '',
            monthlyRecords.at(-1)?.key || ''
        ].join('|')
    };
};
