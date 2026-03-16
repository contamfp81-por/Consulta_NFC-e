import jsPdfRuntimeUrl from '../vendor/jspdf.umd.min.js?url';
import * as XLSX from 'xlsx';
import { normalizePaymentMethod, PAYMENT_METHOD_NOT_INFORMED } from './paymentMethods';

let jsPdfLoaderPromise = null;
const JSPDF_RUNTIME_SRC = jsPdfRuntimeUrl;
const getJsPdfConstructor = () => window.jspdf?.jsPDF || window.jsPDF || null;

const installAtPolyfill = (target) => {
    if (!target || typeof target.at === 'function') return;

    Object.defineProperty(target, 'at', {
        value(index) {
            const length = this.length >>> 0;
            const normalizedIndex = Number(index) || 0;
            const resolvedIndex = normalizedIndex < 0 ? length + normalizedIndex : normalizedIndex;

            if (resolvedIndex < 0 || resolvedIndex >= length) {
                return undefined;
            }

            return this[resolvedIndex];
        },
        configurable: true,
        writable: true
    });
};

const ensureAtPolyfills = () => {
    installAtPolyfill(Array.prototype);
    installAtPolyfill(String.prototype);
    installAtPolyfill(Uint8Array.prototype);
    installAtPolyfill(Uint8ClampedArray.prototype);
    installAtPolyfill(Uint16Array.prototype);
    installAtPolyfill(Uint32Array.prototype);
    installAtPolyfill(Int8Array.prototype);
    installAtPolyfill(Int16Array.prototype);
    installAtPolyfill(Int32Array.prototype);
    installAtPolyfill(Float32Array.prototype);
    installAtPolyfill(Float64Array.prototype);
};

const loadJsPdfConstructor = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('A geração de PDF está disponível apenas no navegador.');
    }

    ensureAtPolyfills();

    if (getJsPdfConstructor()) {
        return getJsPdfConstructor();
    }

    if (!jsPdfLoaderPromise) {
        jsPdfLoaderPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-jspdf-runtime="true"]');
            if (existingScript) {
                if (getJsPdfConstructor()) {
                    resolve(getJsPdfConstructor());
                    return;
                }

                if (existingScript.dataset.loaded === 'true') {
                    jsPdfLoaderPromise = null;
                    reject(new Error('Biblioteca de PDF indisponível após o carregamento.'));
                    return;
                }

                existingScript.addEventListener('load', () => resolve(getJsPdfConstructor()), { once: true });
                existingScript.addEventListener('error', () => {
                    jsPdfLoaderPromise = null;
                    reject(new Error('Falha ao carregar a biblioteca de PDF.'));
                }, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = JSPDF_RUNTIME_SRC;
            script.async = true;
            script.dataset.jspdfRuntime = 'true';
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve(getJsPdfConstructor());
            };
            script.onerror = () => {
                jsPdfLoaderPromise = null;
                reject(new Error('Falha ao carregar a biblioteca de PDF.'));
            };
            document.head.appendChild(script);
        });
    }

    const jsPdfConstructor = await jsPdfLoaderPromise;

    if (!jsPdfConstructor) {
        jsPdfLoaderPromise = null;
        throw new Error('Biblioteca de PDF indisponível no carregamento.');
    }

    return jsPdfConstructor;
};

const COLORS = {
    navy: '#1F3A5F',
    blue: '#2F5D8C',
    cyan: '#4A90C2',
    slate: '#64748B',
    increase: '#D84315',
    decrease: '#2E7D32',
    lightSlate: '#E2E8F0',
    page: '#F8FAFC',
    white: '#FFFFFF',
    text: '#1E293B',
    muted: '#64748B'
};

const CHART_COLORS = ['#1F3A5F', '#2F5D8C', '#4A90C2', '#64748B', '#93C5FD', '#60A5FA', '#CBD5E1'];
const ESSENTIAL_CATEGORIES = new Set([
    'Alimentação',
    'Bebidas',
    'Higiene e Limpeza',
    'Hortifruti',
    'Açougue e Frios',
    'Padaria e Lanches',
    'Farmácia e Saúde',
    'Combustível'
]);

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const axisDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const monthBucketFormatter = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
});

const sum = (values) => values.reduce((total, value) => total + value, 0);
const average = (values) => (values.length ? sum(values) / values.length : 0);
const safeRatio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : 0);
const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);
const formatPercent = (value) => `${percentFormatter.format(Number(value) || 0)}%`;
const formatSignedRatioPercent = (value) => {
    const numericValue = (Number(value) || 0) * 100;
    const sign = numericValue > 0 ? '+' : '';
    return `${sign}${percentFormatter.format(numericValue)}%`;
};
const getVariationColor = (value) => ((Number(value) || 0) >= 0 ? COLORS.increase : COLORS.decrease);

const safeDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
    const date = safeDate(value);
    return date ? dateFormatter.format(date) : 'Data inválida';
};

const formatAxisDate = (value) => {
    const date = safeDate(value);
    return date ? axisDateFormatter.format(date) : String(value ?? '');
};

const getDateKey = (value) => {
    const date = safeDate(value);
    return date ? date.toISOString().split('T')[0] : null;
};

const getMonthKey = (value) => {
    const dateKey = getDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : null;
};

const formatMonthBucketLabel = (monthKey) => {
    if (!monthKey) return 'Sem referencia';

    const [year, month] = String(monthKey).split('-').map(Number);
    const date = new Date(Date.UTC(year, (month || 1) - 1, 1));
    if (Number.isNaN(date.getTime())) {
        return monthKey;
    }

    return monthBucketFormatter.format(date).replace('.', '').replace(/\s+/g, '/');
};

const formatSignedCurrency = (value) => {
    const numericValue = Number(value) || 0;
    const sign = numericValue > 0 ? '+' : numericValue < 0 ? '-' : '';
    return `${sign}${formatCurrency(Math.abs(numericValue))}`;
};

const describeDirection = (value, {
    up = 'alta',
    down = 'queda',
    stable = 'estabilidade',
    threshold = 0.03
} = {}) => {
    const numericValue = Number(value) || 0;
    if (numericValue > threshold) return up;
    if (numericValue < -threshold) return down;
    return stable;
};

const truncateText = (context, text, maxWidth) => {
    const normalizedText = String(text ?? '');
    if (!normalizedText || context.measureText(normalizedText).width <= maxWidth) {
        return normalizedText;
    }

    let truncatedText = normalizedText;
    while (truncatedText.length > 0 && context.measureText(`${truncatedText}...`).width > maxWidth) {
        truncatedText = truncatedText.slice(0, -1);
    }

    return `${truncatedText.trimEnd()}...`;
};

const splitCanvasText = (context, text, maxWidth, maxLines = 2) => {
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    if (!words.length) {
        return [''];
    }

    const lines = [];
    let currentLine = '';

    words.forEach((word) => {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
        } else if (!currentLine) {
            lines.push(truncateText(context, word, maxWidth));
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    if (lines.length <= maxLines) {
        return lines;
    }

    const visibleLines = lines.slice(0, maxLines);
    visibleLines[maxLines - 1] = truncateText(context, visibleLines[maxLines - 1], maxWidth);
    return visibleLines;
};

const createCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = COLORS.white;
    context.fillRect(0, 0, width, height);
    return { canvas, context };
};

const drawFrame = (context, width, height, title, subtitle) => {
    context.fillStyle = COLORS.white;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = COLORS.lightSlate;
    context.lineWidth = 2;
    context.strokeRect(1, 1, width - 2, height - 2);
    context.fillStyle = COLORS.text;
    context.font = '700 28px Arial';
    context.fillText(title, 28, 42);
    context.fillStyle = COLORS.muted;
    context.font = '400 16px Arial';
    context.fillText(subtitle, 28, 68);
};

const drawEmptyState = (context, width, height, title, subtitle, message) => {
    drawFrame(context, width, height, title, subtitle);
    context.fillStyle = COLORS.muted;
    context.font = '600 20px Arial';
    context.textAlign = 'center';
    context.fillText(message, width / 2, height / 2);
    context.textAlign = 'left';
};

const buildDailySeries = (receipts) => {
    const totalsByDay = {};
    receipts.forEach((receipt) => {
        const date = safeDate(receipt.date);
        if (!date) return;
        const key = date.toISOString().split('T')[0];
        totalsByDay[key] = (totalsByDay[key] || 0) + (Number(receipt.totalValue) || 0);
    });

    return Object.entries(totalsByDay)
        .map(([date, value]) => ({ date, value }))
        .sort((left, right) => left.date.localeCompare(right.date));
};

const buildCategoryComposition = (products, totalSpent) => {
    const categoryMap = {};
    products.forEach((product) => {
        const category = product.category || 'Outros';
        categoryMap[category] = (categoryMap[category] || 0) + (Number(product.totalValue) || 0);
    });

    return Object.entries(categoryMap)
        .map(([name, value]) => ({
            name,
            value,
            percentage: totalSpent > 0 ? (value / totalSpent) * 100 : 0
        }))
        .sort((left, right) => right.value - left.value);
};

const buildFlowData = (receipts, products) => {
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const flowMap = {};

    products.forEach((product) => {
        const receipt = receiptMap.get(product.receiptId);
        const source = receipt?.establishment || 'Origem não identificada';
        const target = product.category || 'Outros';
        const key = `${source}|||${target}`;
        flowMap[key] = (flowMap[key] || 0) + (Number(product.totalValue) || 0);
    });

    const links = Object.entries(flowMap)
        .map(([key, value]) => {
            const [source, target] = key.split('|||');
            return { source, target, value };
        })
        .sort((left, right) => right.value - left.value);

    const sourceTotals = {};
    const targetTotals = {};
    links.forEach((link) => {
        sourceTotals[link.source] = (sourceTotals[link.source] || 0) + link.value;
        targetTotals[link.target] = (targetTotals[link.target] || 0) + link.value;
    });

    return {
        links: links.slice(0, 18),
        sources: Object.entries(sourceTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((left, right) => right.value - left.value)
            .slice(0, 6),
        targets: Object.entries(targetTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((left, right) => right.value - left.value)
            .slice(0, 6)
    };
};

const buildPriceHistogram = (products) => {
    const thresholds = [5, 10, 20, 50, 100, 500];
    const buckets = [
        ...thresholds.map((threshold) => ({
            name: `Até ${formatCurrency(threshold)}`,
            count: 0
        })),
        { name: `Acima de ${formatCurrency(500)}`, count: 0 }
    ];

    products.forEach((product) => {
        const unitPrice = Number(product.unitPrice) || 0;
        const thresholdIndex = thresholds.findIndex((threshold) => unitPrice <= threshold);
        const bucketIndex = thresholdIndex >= 0 ? thresholdIndex : buckets.length - 1;
        buckets[bucketIndex].count += 1;
    });

    return buckets.filter((bucket) => bucket.count > 0);
};

const resolvePriceBucketOrder = (bucketName) => {
    const label = String(bucketName || '');
    if (label.includes(formatCurrency(5))) return 0;
    if (label.includes(formatCurrency(10))) return 1;
    if (label.includes(formatCurrency(20))) return 2;
    if (label.includes(formatCurrency(50))) return 3;
    if (label.includes(formatCurrency(100))) return 4;
    if (label.includes(formatCurrency(500)) && label.startsWith('Até')) return 5;
    return 6;
};

const buildStoreData = (receipts) => {
    const storeMap = {};

    receipts.forEach((receipt) => {
        const name = receipt.establishment || 'Outros';
        storeMap[name] = (storeMap[name] || 0) + (Number(receipt.totalValue) || 0);
    });

    return Object.entries(storeMap)
        .map(([name, value]) => ({
            name,
            shortName: name,
            value
        }))
        .sort((left, right) => right.value - left.value);
};

const buildStoreTimelineData = (receipts, topStores) => {
    const activeStoreKeys = new Set((topStores || []).map((store) => store.key));
    const timelineMap = {};

    receipts.forEach((receipt) => {
        const monthKey = getMonthKey(receipt.date);
        if (!monthKey) return;

        if (!timelineMap[monthKey]) {
            timelineMap[monthKey] = {
                monthKey,
                month: formatMonthBucketLabel(monthKey)
            };
        }

        const storeKey = receipt.establishment || 'Outros';
        if (!activeStoreKeys.has(storeKey)) {
            return;
        }

        timelineMap[monthKey][storeKey] = (timelineMap[monthKey][storeKey] || 0) + (Number(receipt.totalValue) || 0);
    });

    return Object.values(timelineMap)
        .sort((left, right) => String(left.monthKey).localeCompare(String(right.monthKey)));
};

const buildParetoData = (products, totalValueBase) => {
    const productValueMap = {};

    products.forEach((product) => {
        const name = product.name || 'Produto';
        productValueMap[name] = (productValueMap[name] || 0) + (Number(product.totalValue) || 0);
    });

    const sortedProducts = Object.entries(productValueMap)
        .map(([name, value]) => ({
            name,
            shortName: name.length > 24 ? `${name.slice(0, 21).trimEnd()}...` : name,
            value
        }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 10);

    let runningValue = 0;
    return sortedProducts.map((item) => {
        runningValue += item.value;
        return {
            ...item,
            percentage: safeRatio(runningValue, totalValueBase) * 100
        };
    });
};

const buildPaymentMethodBreakdown = (receipts, products, categoryTotalsMap = new Map()) => {
    const receiptPaymentMethodMap = new Map(
        receipts.map((receipt) => [
            receipt.id,
            normalizePaymentMethod(receipt.paymentMethod || PAYMENT_METHOD_NOT_INFORMED)
        ])
    );
    const categoryPaymentMethodMap = {};
    const paymentMethodSummaryMap = {};

    products.forEach((product) => {
        const category = product.category || 'Outros';
        const paymentMethod = normalizePaymentMethod(
            product.paymentMethod
            || receiptPaymentMethodMap.get(product.receiptId)
            || PAYMENT_METHOD_NOT_INFORMED
        );
        const totalValue = Number(product.totalValue) || 0;

        if (totalValue <= 0) {
            return;
        }

        const detailKey = `${category}|||${paymentMethod}`;
        if (!categoryPaymentMethodMap[detailKey]) {
            categoryPaymentMethodMap[detailKey] = {
                category,
                paymentMethod,
                value: 0,
                receiptIds: new Set()
            };
        }

        categoryPaymentMethodMap[detailKey].value += totalValue;
        categoryPaymentMethodMap[detailKey].receiptIds.add(product.receiptId);

        if (!paymentMethodSummaryMap[paymentMethod]) {
            paymentMethodSummaryMap[paymentMethod] = {
                name: paymentMethod,
                value: 0,
                categories: new Set()
            };
        }

        paymentMethodSummaryMap[paymentMethod].value += totalValue;
        paymentMethodSummaryMap[paymentMethod].categories.add(category);
    });

    return {
        paymentMethodSummaryData: Object.values(paymentMethodSummaryMap)
            .map((item) => ({
                name: item.name,
                value: item.value,
                categoryCount: item.categories.size
            }))
            .sort((left, right) => right.value - left.value),
        categoryPaymentMethodData: Object.values(categoryPaymentMethodMap)
            .map((item) => ({
                category: item.category,
                paymentMethod: item.paymentMethod,
                value: item.value,
                receiptCount: item.receiptIds.size,
                categoryShare: safeRatio(item.value, categoryTotalsMap.get(item.category) || 0)
            }))
            .sort((left, right) => (
                left.category.localeCompare(right.category, 'pt-BR')
                || right.value - left.value
            ))
    };
};

const buildReceiptTicketHistogram = (receipts) => {
    const ranges = [
        { min: 0, max: 20, label: `${formatCurrency(0)} a ${formatCurrency(20)}` },
        { min: 20, max: 50, label: `${formatCurrency(20)} a ${formatCurrency(50)}` },
        { min: 50, max: 100, label: `${formatCurrency(50)} a ${formatCurrency(100)}` },
        { min: 100, max: 200, label: `${formatCurrency(100)} a ${formatCurrency(200)}` },
        { min: 200, max: 400, label: `${formatCurrency(200)} a ${formatCurrency(400)}` },
        { min: 400, max: 800, label: `${formatCurrency(400)} a ${formatCurrency(800)}` },
        { min: 800, max: Infinity, label: `Acima de ${formatCurrency(800)}` }
    ].map((range) => ({ ...range, count: 0 }));

    receipts.forEach((receipt) => {
        const totalValue = Number(receipt.totalValue) || 0;
        const bucket = ranges.find((range) => totalValue >= range.min && totalValue < range.max);
        if (bucket) {
            bucket.count += 1;
        }
    });

    return ranges;
};

const buildHeatmapData = (receipts) => {
    const weekdayMap = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, 'Sáb': 0, Dom: 0 };
    const weekdayKeys = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    receipts.forEach((receipt) => {
        const date = safeDate(receipt.date);
        if (!date) return;
        const weekday = weekdayKeys[date.getUTCDay()];
        weekdayMap[weekday] = (weekdayMap[weekday] || 0) + 1;
    });

    return Object.entries(weekdayMap).map(([name, value]) => ({ name, value }));
};

const buildTemporalProjection = (temporalData) => {
    if (!temporalData.length) {
        return { direction: 'estabilidade', projectedDailyAverage: 0, projectedNext30: 0 };
    }

    const values = temporalData.map((item) => Number(item.value) || 0);
    const recent = values.slice(-Math.min(7, values.length));
    const previous = values.slice(-Math.min(14, values.length), -Math.min(7, values.length));
    const recentAverage = average(recent);
    const previousAverage = previous.length ? average(previous) : recentAverage;

    let direction = 'estabilidade';
    if (recentAverage > previousAverage * 1.08) direction = 'alta';
    if (recentAverage < previousAverage * 0.92) direction = 'redução';

    return {
        direction,
        projectedDailyAverage: Math.max(0, recentAverage),
        projectedNext30: Math.max(0, recentAverage) * 30
    };
};

const buildAccumulatedData = (temporalData) => {
    let runningTotal = 0;
    return temporalData.map((item) => {
        runningTotal += Number(item.value) || 0;
        return { date: item.date, total: runningTotal };
    });
};

const buildReportData = ({ receipts, products, stats, selectedProductGroups }) => {
    const receiptTotalSpent = Number(stats?.totalSpent)
        || sum(receipts.map((receipt) => Number(receipt.totalValue) || 0))
        || sum(products.map((product) => Number(product.totalValue) || 0));
    const productTotalSpent = sum(products.map((product) => Number(product.totalValue) || 0))
        || sum((stats?.categorySpendData || []).map((item) => Number(item.value) || 0))
        || receiptTotalSpent;
    const totalSpent = receiptTotalSpent;
    const temporalData = Array.isArray(stats?.dailyEvolutionData) && stats.dailyEvolutionData.length
        ? stats.dailyEvolutionData
            .map((item) => ({
                date: item.date,
                value: Number(item.value) || 0
            }))
            .sort((left, right) => left.date.localeCompare(right.date))
        : buildDailySeries(receipts);

    const categoryComposition = Array.isArray(stats?.categorySpendData) && stats.categorySpendData.length
        ? stats.categorySpendData
            .map((item) => ({
                name: item.name || 'Outros',
                value: Number(item.value) || 0,
                percentage: safeRatio(Number(item.value) || 0, productTotalSpent) * 100
            }))
            .sort((left, right) => right.value - left.value)
        : buildCategoryComposition(products, productTotalSpent);
    const categoryTotalsMap = new Map(categoryComposition.map((item) => [item.name, item.value]));

    const storeData = Array.isArray(stats?.storeData) && stats.storeData.length
        ? stats.storeData
            .map((item) => ({
                name: item.name || 'Outros',
                shortName: item.shortName || item.name || 'Outros',
                value: Number(item.value) || 0
            }))
            .sort((left, right) => right.value - left.value)
        : buildStoreData(receipts);

    const topStores = storeData.slice(0, 5).map((store) => ({
        key: store.name,
        label: store.shortName
    }));

    const stackedData = buildStoreTimelineData(receipts, topStores);

    const accumulatedData = Array.isArray(stats?.accumulatedData) && stats.accumulatedData.length
        ? stats.accumulatedData
            .map((item) => ({
                date: item.date,
                total: Number(item.total) || 0
            }))
            .sort((left, right) => left.date.localeCompare(right.date))
        : buildAccumulatedData(temporalData);

    const paretoData = buildParetoData(products, productTotalSpent);

    const treemapData = categoryComposition.map((item) => ({
        name: item.name,
        size: item.value
    }));

    const receiptDateMap = new Map(
        receipts
            .map((receipt) => [receipt.id, getDateKey(receipt.date)])
            .filter(([, dateKey]) => Boolean(dateKey))
    );

    let productEvolutionData = [];
    if (Array.isArray(stats?.productEvolutionData) && stats.productEvolutionData.length > 0) {
        productEvolutionData = stats.productEvolutionData.map(item => ({
            date: item.date,
            price: Number(item.price) || 0
        })).sort((a, b) => a.date.localeCompare(b.date));
    } else {
        // Fallback: Calculate evolution for all products with multiple purchases
        const multiplePurchaseGroups = (stats?.productInflationData || []).map(p => p.id);
        if (multiplePurchaseGroups.length > 0) {
            const evolutionMap = {};
            
            products.forEach(p => {
                // We need to group by product name or group id. 
                // Since export.js doesn't have the grouping logic, we can try to guess or use what was passed.
                // However, stats.productInflationData already filtered them.
                // Let's use name-based matching if group id isn't available, but usually we want to match the inflation logic.
                // Actually, let's just use all products that contribute to inflation.
                
                const dateKey = receiptDateMap.get(p.receiptId);
                if (!dateKey) return;

                // Check if this product belongs to one of the groups that have inflation (multiple purchases)
                // Since products doesn't have groupId, we use a simple heuristic: 
                // if it's name matches one of the memberNames in productInflationData.
                const belongsToInflation = (stats?.productInflationData || []).some(inf => 
                    inf.name === p.name || (inf.memberNames && inf.memberNames.includes(p.name))
                );

                if (belongsToInflation) {
                    if (!evolutionMap[dateKey]) {
                        evolutionMap[dateKey] = { totalValue: 0, totalQuantity: 0 };
                    }
                    const up = Number(p.unitPrice) || 0;
                    const q = Number(p.quantity) || 1;
                    evolutionMap[dateKey].totalValue += up * q;
                    evolutionMap[dateKey].totalQuantity += q;
                }
            });

            productEvolutionData = Object.entries(evolutionMap)
                .map(([date, data]) => ({
                    date,
                    price: data.totalQuantity > 0 ? data.totalValue / data.totalQuantity : 0
                }))
                .filter(item => item.price > 0)
                .sort((a, b) => a.date.localeCompare(b.date));
        }
    }

    const priceHistogramData = buildPriceHistogram(products)
        .map((item) => ({
            ...item,
            bucketOrder: resolvePriceBucketOrder(item.name)
        }))
        .sort((left, right) => left.bucketOrder - right.bucketOrder);

    const paymentFallback = buildPaymentMethodBreakdown(receipts, products, categoryTotalsMap);
    const paymentMethodSummaryData = Array.isArray(stats?.paymentMethodSummaryData) && stats.paymentMethodSummaryData.length
        ? stats.paymentMethodSummaryData
            .map((item) => ({
                name: item.name || 'Não informado',
                value: Number(item.value) || 0,
                categoryCount: Number(item.categoryCount) || 0
            }))
            .sort((left, right) => right.value - left.value)
        : paymentFallback.paymentMethodSummaryData;

    const categoryPaymentMethodData = Array.isArray(stats?.categoryPaymentMethodData) && stats.categoryPaymentMethodData.length
        ? stats.categoryPaymentMethodData
            .map((item) => ({
                category: item.category || 'Outros',
                paymentMethod: item.paymentMethod || 'Não informado',
                value: Number(item.value) || 0,
                receiptCount: Number(item.receiptCount) || 0,
                categoryShare: safeRatio(Number(item.value) || 0, categoryTotalsMap.get(item.category || 'Outros') || 0)
            }))
            .sort((left, right) => (
                left.category.localeCompare(right.category, 'pt-BR')
                || right.value - left.value
            ))
        : paymentFallback.categoryPaymentMethodData;

    const topRecurringProducts = Array.isArray(stats?.topRecurringProducts)
        ? stats.topRecurringProducts
            .map((item) => ({
                name: item.name || 'Produto',
                recurrenceCount: Number(item.recurrenceCount) || 0,
                impactPercentage: Number(item.impactPercentage) || 0,
                totalValue: Number(item.totalValue) || 0
            }))
        : [];

    const heatmapData = Array.isArray(stats?.heatmapData) && stats.heatmapData.length
        ? stats.heatmapData
            .map((item) => ({
                name: item.name || '',
                value: Number(item.value) || 0
            }))
        : buildHeatmapData(receipts);

    const flowData = buildFlowData(receipts, products);
    const receiptHistogramData = buildReceiptTicketHistogram(receipts);
    const temporalProjection = buildTemporalProjection(temporalData);
    const essentialShare = categoryComposition
        .filter((item) => ESSENTIAL_CATEGORIES.has(item.name))
        .reduce((total, item) => total + item.percentage, 0);
    const lowTicketShare = receiptHistogramData.length
        ? safeRatio(
            sum(receiptHistogramData.slice(0, 2).map((item) => item.count)),
            sum(receiptHistogramData.map((item) => item.count))
        ) * 100
        : 0;

    let profile = 'Consumidor equilibrado com padrão diversificado';
    if (lowTicketShare > 55 && temporalProjection.direction === 'alta') {
        profile = 'Consumidor recorrente com traços impulsivos';
    } else if (essentialShare > 60) {
        profile = 'Consumidor conservador e orientado a necessidades básicas';
    } else if ((categoryComposition[0]?.percentage || 0) > 40) {
        profile = 'Consumidor concentrado em poucos centros de custo';
    }

    const inflation = {
        personalInflationRate: Number(stats?.personalInflationRate) || 0,
        totalInflationImpact: Number(stats?.totalInflationImpact) || 0,
        comparableProductsCount: Number(stats?.comparableProductsCount) || 0,
        productInflationData: Array.isArray(stats?.productInflationData)
            ? stats.productInflationData.map((item) => ({
                ...item,
                name: item.name || 'Produto sem nome',
                memberNames: Array.isArray(item.memberNames) ? item.memberNames : [],
                category: item.category || 'Outros',
                previousDate: item.previousDate || '',
                currentDate: item.currentDate || '',
                previousPrice: Number(item.previousPrice) || 0,
                currentPrice: Number(item.currentPrice) || 0,
                inflationRate: Number(item.inflationRate) || 0,
                financialImpact: Number(item.financialImpact) || 0
            }))
            : [],
        categoryInflationData: Array.isArray(stats?.categoryInflationData)
            ? stats.categoryInflationData.map((item) => ({
                ...item,
                name: item.name || 'Outros',
                comparableProducts: Number(item.comparableProducts) || 0,
                inflationRate: Number(item.inflationRate) || 0,
                financialImpact: Number(item.financialImpact) || 0
            }))
            : []
    };

    return {
        receipts,
        products,
        totalSpent,
        receiptTotalSpent,
        productTotalSpent,
        receiptItemGap: receiptTotalSpent - productTotalSpent,
        temporalData,
        categoryComposition,
        storeData,
        topStores,
        stackedData,
        accumulatedData,
        paretoData,
        treemapData,
        productEvolutionData,
        selectedProductLabels: Array.isArray(selectedProductGroups)
            ? selectedProductGroups.map((group) => group.displayName).filter(Boolean)
            : [],
        priceHistogramData,
        receiptHistogramData,
        heatmapData,
        flowData,
        paymentMethodSummaryData,
        categoryPaymentMethodData,
        temporalProjection,
        profile,
        inflation,
        topRecurringProducts
    };
};

const buildInsights = (reportData) => {
    const firstTemporalEntry = reportData.temporalData[0];
    const lastTemporalEntry = reportData.temporalData.at(-1);
    const peakTemporal = [...reportData.temporalData].sort((left, right) => right.value - left.value)[0];
    const firstProductPoint = reportData.productEvolutionData[0];
    const lastProductPoint = reportData.productEvolutionData.at(-1);
    const productPriceVariation = firstProductPoint?.price
        ? safeRatio((lastProductPoint?.price || 0) - firstProductPoint.price, firstProductPoint.price)
        : 0;

    const topCategory = reportData.categoryComposition[0];
    const topThreeCategoryShare = sum(reportData.categoryComposition.slice(0, 3).map((item) => item.percentage));

    const topStore = reportData.storeData[0];
    const secondStore = reportData.storeData[1];
    const topStoreShare = safeRatio(topStore?.value || 0, reportData.receiptTotalSpent) * 100;
    const topThreeStoreShare = safeRatio(
        sum(reportData.storeData.slice(0, 3).map((item) => item.value)),
        reportData.receiptTotalSpent
    ) * 100;

    const monthlyTotals = reportData.stackedData.map((item) => ({
        month: item.month || 'Sem referência',
        total: sum(reportData.topStores.map((store) => Number(item[store.key]) || 0))
    }));
    const peakMonth = [...monthlyTotals].sort((left, right) => right.total - left.total)[0];
    const lastMonth = monthlyTotals.at(-1);
    const averageMonthValue = average(monthlyTotals.map((item) => item.total));

    const totalAccumulated = reportData.accumulatedData.at(-1)?.total || 0;
    const accumulatedMidPoint = reportData.accumulatedData[Math.floor(reportData.accumulatedData.length / 2)]?.total || 0;

    const topParetoItem = reportData.paretoData[0];
    const paretoTopThreeShare = reportData.paretoData[2]?.percentage || reportData.paretoData.at(-1)?.percentage || 0;

    const dominantPriceBucket = [...reportData.priceHistogramData].sort((left, right) => right.count - left.count)[0];
    const totalPriceItems = sum(reportData.priceHistogramData.map((item) => item.count));
    const lowPriceShare = safeRatio(
        sum(
            reportData.priceHistogramData
                .filter((item) => Number(item.bucketOrder) <= 1)
                .map((item) => item.count)
        ),
        totalPriceItems
    ) * 100;

    const dominantTicketBucket = [...reportData.receiptHistogramData].sort((left, right) => right.count - left.count)[0];
    const totalReceiptsCount = sum(reportData.receiptHistogramData.map((item) => item.count));
    const lowTicketShare = safeRatio(
        sum(reportData.receiptHistogramData.slice(0, 2).map((item) => item.count)),
        totalReceiptsCount
    ) * 100;

    const topLink = [...reportData.flowData.links].sort((left, right) => right.value - left.value)[0];
    const dominantDay = [...reportData.heatmapData].sort((left, right) => right.value - left.value)[0];
    const weekendShare = safeRatio(
        sum(
            reportData.heatmapData
                .filter((item) => item.name === 'Sáb' || item.name === 'Dom')
                .map((item) => item.value)
        ),
        sum(reportData.heatmapData.map((item) => item.value))
    ) * 100;

    const inflationTopProduct = [...reportData.inflation.productInflationData]
        .sort((left, right) => right.financialImpact - left.financialImpact || right.inflationRate - left.inflationRate)[0];
    const inflationTopCategory = [...reportData.inflation.categoryInflationData]
        .sort((left, right) => right.financialImpact - left.financialImpact || right.inflationRate - left.inflationRate)[0];
    const topPaymentMethod = reportData.paymentMethodSummaryData[0];
    const topPaymentMethodShare = safeRatio(topPaymentMethod?.value || 0, reportData.productTotalSpent) * 100;
    const leadingPaymentCategory = [...reportData.categoryPaymentMethodData]
        .sort((left, right) => right.value - left.value)[0];
    const hasReceiptItemGap = Math.abs(reportData.receiptItemGap) > 0.01;

    return {
        summary: {
            title: 'Relatório de Inteligência de Consumo',
            subtitle: 'Sistema Avançado de Análise Fiscais e Tendências',
            periodLabel: firstTemporalEntry?.date && lastTemporalEntry?.date
                ? `${formatDate(firstTemporalEntry.date)} a ${formatDate(lastTemporalEntry.date)}`
                : 'Período completo',
            highlights: [
                topCategory
                    ? `A categoria ${topCategory.name} é o seu maior gargalo financeiro, representando ${formatPercent(topCategory.percentage)} do valor dos itens analisados.`
                    : 'Ainda não há maturidade de dados para destacar uma categoria líder.',
                topStore
                    ? `O estabelecimento ${topStore.name} detém ${formatPercent(topStoreShare)} do valor total dos cupons analisados.`
                    : 'A distribuição entre estabelecimentos está equilibrada ou insuficiente.',
                reportData.inflation.comparableProductsCount > 0
                    ? `A sua inflação pessoal atingiu ${formatSignedRatioPercent(reportData.inflation.personalInflationRate)}, gerando um custo extra de ${formatCurrency(reportData.inflation.totalInflationImpact)}.`
                    : 'A base comparativa de preços ainda está em formação.'
            ],
            dataIntegrityNote: hasReceiptItemGap
                ? `Os cupons somam ${formatCurrency(reportData.receiptTotalSpent)} e os itens detalhados somam ${formatCurrency(reportData.productTotalSpent)}, com diferença de ${formatSignedCurrency(reportData.receiptItemGap)}. Essa variação normalmente reflete descontos, arredondamentos ou ajustes fiscais do cupom.`
                : `Os totais de cupons (${formatCurrency(reportData.receiptTotalSpent)}) e itens (${formatCurrency(reportData.productTotalSpent)}) estão alinhados, sem distorção material na base analisada.`,
            concentrationNote: topThreeStoreShare > 0
                ? `As 3 maiores lojas concentram ${formatPercent(topThreeStoreShare)} do seu orçamento. ${topThreeStoreShare >= 65 ? 'Isso indica uma dependência crítica: qualquer variação de preços nestes locais impactará fortemente seu saldo.' : 'Sua carteira está bem distribuída, o que reduz o risco de monopólio de preços.'}`
                : 'Processando fluxo de concentração...',
            recurrenceNote: peakTemporal
                ? `Identificamos um pico de consumo em ${formatDate(peakTemporal.date)} (${formatCurrency(peakTemporal.value)}). Analise se este evento foi uma compra de estoque ou um gasto impulsivo.`
                : 'Aguardando recorrência para análise de picos.',
            inflationNote: reportData.inflation.comparableProductsCount > 0
                ? `Com ${reportData.inflation.comparableProductsCount} itens monitorados, a maior pressão inflacionária vem de ${inflationTopCategory?.name || 'itens diversos'}. Sugerimos buscar substitutos nestas áreas para mitigar o impacto de ${formatCurrency(reportData.inflation.totalInflationImpact)}.`
                : 'Continue importando cupons para habilitar o monitoramento automático de preços e inflação pessoal.'
        },
        projection: {
            finalidade: 'Projetar o fechamento do gasto mensal com base no ritmo médio atual versus o histórico acumulado.',
            comportamento: reportData.monthInsight?.hasData
                ? `O fechamento estimado para o mês de ${reportData.monthInsight.monthLabel} é de ${formatCurrency(reportData.monthInsight.projectedTotal)}. Atualmente, você já desembolsou ${formatCurrency(reportData.monthInsight.monthTotalSpent)}, o que representa ${formatPercent(safeRatio(reportData.monthInsight.monthTotalSpent, reportData.monthInsight.projectedTotal) * 100)} do total esperado.`
                : 'A projeção requer dados do mês vigente para traçar o cenário de fechamento.',
            tendencia: reportData.monthInsight?.hasData
                ? `O ritmo do dia a dia está em ${formatCurrency(reportData.monthInsight.averageDailySpend)}. ${reportData.monthInsight.paceLabel === 'Acelerando' ? 'Atenção: A aceleração recente sugere que o gasto final pode superar a média histórica se não houver ajuste de rota.' : 'A estabilidade ou queda no ritmo indica um fechamento dentro das margens planejadas.'}`
                : 'Aguardando evolução do mês corrente para detalhar tendência.'
        },
        productEvolution: {
            finalidade: 'Monitorar a oscilação do preço médio ponderado dos itens selecionados ou recorrentes ao longo do tempo.',
            comportamento: reportData.productEvolutionData.length > 1
                ? `O valor médio da sua cesta monitorada iniciou em ${formatCurrency(firstProductPoint.price)} e encerrou em ${formatCurrency(lastProductPoint.price)}. Houve uma variação real de ${formatSignedRatioPercent(productPriceVariation)} entre o primeiro e o último registro.`
                : 'Ainda não possuímos registros de datas diferentes para traçar a evolução histórica deste grupo.',
            tendencia: reportData.productEvolutionData.length > 1
                ? `A curva aponta para uma ${describeDirection(productPriceVariation)} persistente. Se mantido este ritmo de ${formatSignedRatioPercent(productPriceVariation)}, o custo unitário médio tende a ${productPriceVariation > 0 ? 'pressionar' : 'aliviar'} seu fluxo de caixa nos próximos ciclos.`
                : 'A tendência só poderá ser calculada após o segundo registro de compra dos mesmos itens.'
        },
        temporal: {
            finalidade: 'Analisar o ritmo de desembolso diário para identificar sazonalidade e dias de maior sensibilidade financeira.',
            comportamento: peakTemporal
                ? `Seus gastos não são lineares: o dia ${formatDate(peakTemporal.date)} concentrou um volume atípico de ${formatCurrency(peakTemporal.value)}. A média diária do período ficou em ${formatCurrency(reportData.receiptTotalSpent / Math.max(1, reportData.temporalData.length))}.`
                : 'Os dados temporais ainda estão dispersos para uma conclusão sólida.',
            tendencia: `A projeção sugere um gasto de ${formatCurrency(reportData.temporalProjection.projectedNext30)} para o próximo mês. O sinal é de ${reportData.temporalProjection.direction}, indicando que você deve ${reportData.temporalProjection.direction === 'alta' ? 'reforçar o controle' : 'manter a disciplina'} para evitar surpresas.`
        },
        storeDistribution: {
            finalidade: 'Visualizar a fatia de mercado que cada estabelecimento detém sobre o seu poder de compra.',
            comportamento: topStore
                ? `A loja ${topStore.name} é sua principal parceira comercial, absorvendo ${formatCurrency(topStore.value)} (${formatPercent(topStoreShare)} do total).`
                : 'Analisando distribuição de market-share pessoal...',
            tendencia: `O cenário mostra que ${topStoreShare > 50 ? 'seu consumo está perigosamente concentrado em um único local.' : 'você mantém uma rede saudável de fornecedores.'} Estrategicamente, diversificar pode liberar melhores oportunidades de preço.`
        },
        storeComparison: {
            finalidade: 'Comparar o peso financeiro entre os principais estabelecimentos para otimizar a escolha de onde comprar.',
            comportamento: topStore && secondStore
                ? `Você gasta ${formatCurrency(topStore.value - secondStore.value)} a mais no(a) ${topStore.name} do que no(a) ${secondStore.name}. Esta diferença pode esconder oportunidades de economia se houver migração de itens.`
                : 'Aguardando mais estabelecimentos para comparação direta.',
            tendencia: `A liderança de ${topStore?.name || 'um estabelecimento'} sugere que ele é sua referência de conveniência ou preço. Compare se os itens caros do ${topStore?.name} não são significativamente mais baratos na concorrência.`
        },
        storeTimeline: {
            finalidade: 'Cruzar o tempo com os locais de compra para entender o revezamento de importância das lojas mês a mês.',
            comportamento: peakMonth
                ? `${peakMonth.month} foi o período de maior atividade nas lojas, totalizando ${formatCurrency(peakMonth.total)}. O gráfico empilhado mostra como cada loja contribuiu para este montante.`
                : 'A série mensal ainda está em fase de alimentação.',
            tendencia: lastMonth
                ? `No último mês (${lastMonth.month}), o volume de ${formatCurrency(lastMonth.total)} sinaliza ${lastMonth.total > averageMonthValue ? 'um aumento' : 'uma queda'} em relação ao seu histórico, o que demanda atenção ao orçamento do mês seguinte.`
                : 'Tendência sazonal aguardando mais meses de dados.'
        },
        accumulated: {
            finalidade: 'Observar a velocidade com que o valor total é formado, auxiliando na previsão de estouro de orçamento.',
            comportamento: totalAccumulated > 0
                ? `Seu gasto acumulou de forma constante até atingir ${formatCurrency(totalAccumulated)}. O ponto central da jornada foi em ${formatCurrency(accumulatedMidPoint)}, definindo o "meio do caminho" financeiro.`
                : 'Gerando curva de acúmulo financeiro...',
            tendencia: `A inclinação da reta acumulada indica que você está ${reportData.temporalProjection.direction === 'alta' ? 'acelerando' : 'desacelerando'} os gastos. Uma curva mais íngreme no final sugere compras maiores ou mais frequentes recentemente.`
        },
        pareto: {
            finalidade: 'Aplicar a regra de 80/20 para identificar os poucos produtos que causam a maior parte do seu gasto.',
            comportamento: topParetoItem
                ? `O item "${topParetoItem.name}" é o seu maior detrator de saldo. Apenas os 3 itens do topo já somam ${formatPercent(paretoTopThreeShare)} do que você gastou nos Top 10.`
                : 'Processando priorização de Pareto...',
            tendencia: `Focar a economia nos itens da esquerda deste gráfico trará resultados imediatos: reduzir 10% do custo do "${topParetoItem?.name || 'líder'}" vale mais do que cortar 50% de itens pequenos.`
        },
        treemap: {
            finalidade: 'Entender visualmente a hierarquia de gastos, onde o tamanho de cada bloco representa sua importância financeira.',
            comportamento: topCategory
                ? `A área ocupada por ${topCategory.name} reflete sua dominância visual no orçamento (${formatPercent(topCategory.percentage)}). Isso facilita a identificação instantânea de para onde seu dinheiro fluiu.`
                : 'Construindo mapa de hierarquia...',
            tendencia: `Blocos maiores exigem maior fiscalização. Se ${topCategory?.name} continuar ocupando esta área, estratégias de 'buy-in' ou compras em atacado para esta categoria devem ser consideradas.`
        },
        categories: {
            finalidade: 'Definir a participação percentual exata de cada centro de custo no seu estilo de vida.',
            comportamento: topCategory
                ? `${topCategory.name} é a categoria âncora com ${formatPercent(topCategory.percentage)}. As despesas ${ESSENTIAL_CATEGORIES.has(topCategory.name) ? 'essenciais' : 'discricionárias'} estão impulsionando seus números.`
                : 'Calculando fatias orçamentárias...',
            tendencia: `Com ${formatPercent(topThreeCategoryShare)} do gasto em apenas 3 categorias, você tem um perfil de consumo ${topThreeCategoryShare > 70 ? 'focado' : 'diversificado'}. Monitore se categorias opcionais não estão roubando espaço das essenciais.`
        },
        recurrentProducts: {
            finalidade: 'Identificar itens de alta frequência que podem ser candidatos a compras em volume ou assinaturas.',
            comportamento: reportData.topRecurringProducts.length
                ? `Você comprou "${reportData.topRecurringProducts[0].name}" em ${reportData.topRecurringProducts[0].recurrenceCount} ocasiões diferentes. Isso gerou um impacto total de ${formatCurrency(reportData.topRecurringProducts[0].totalValue)}.`
                : 'Analisando frequência de itens...',
            tendencia: 'Itens com recorrência acima de 3 vezes por mês sugerem um hábito de consumo consolidado. Buscar promoções de "leve mais, pague menos" para estes itens é a melhor tática de economia.'
        },
        priceHistogram: {
            finalidade: 'Entender a densidade da sua cesta de compras: você compra muitos itens baratos ou poucos itens caros?',
            comportamento: dominantPriceBucket
                ? `A maioria dos seus itens (${dominantPriceBucket.count} unidades) custa ${dominantPriceBucket.name}. Isso mostra que seu volume de compras é focado em itens de ${lowPriceShare > 60 ? 'baixo valor unitário' : 'valor intermediário'}.`
                : 'Perfilando faixas de preço...',
            tendencia: `Com ${formatPercent(lowPriceShare)} dos itens em faixas baixas, você realiza um consumo de "varejo formiguinha". Itens na faixa acima de R$ 100,00, embora menos frequentes, devem ter sua necessidade revisada.`
        },
        paymentMethods: {
            finalidade: 'Cruzar categorias e meios de pagamento para entender como o gasto é liquidado e onde existe maior concentração financeira.',
            comportamento: topPaymentMethod
                ? `${topPaymentMethod.name} movimentou ${formatCurrency(topPaymentMethod.value)} e apareceu em ${topPaymentMethod.categoryCount} categorias. ${leadingPaymentCategory ? `A combinação mais relevante foi ${leadingPaymentCategory.category} com ${leadingPaymentCategory.paymentMethod}, somando ${formatCurrency(leadingPaymentCategory.value)}.` : ''}`
                : 'Ainda não há meios de pagamento suficientes para leitura analítica.',
            tendencia: topPaymentMethod
                ? `Quando ${formatPercent(topPaymentMethodShare)} do valor dos itens fica concentrado em um único meio de pagamento, custos financeiros e limite de crédito passam a influenciar o consumo. Avalie se há espaço para redistribuir gastos de ${topPaymentMethod.name}.`
                : 'A tendência por forma de pagamento será destravada conforme novos cupons com meio identificado forem importados.'
        },
        composition: {
            finalidade: 'Visualizar a estrutura do seu orçamento de forma circular para entender o equilíbrio entre as categorias.',
            comportamento: topCategory
                ? `A "fatia" de ${topCategory.name} domina o círculo com ${formatPercent(topCategory.percentage)}. O equilíbrio do dashboard depende da redução deste segmento.`
                : 'Montando donut de composição...',
            tendencia: `O preenchimento do gráfico sugere um orçamento ${ESSENTIAL_CATEGORIES.has(topCategory?.name) ? 'inflexível (focado em necessidades)' : 'flexível (focado em desejos)'}. Ajustes na categoria ${topCategory?.name} trarão o maior alívio imediato.`
        },
        flow: {
            finalidade: 'Rastrear o caminho do dinheiro, conectando a origem (loja) ao destino final (categoria).',
            comportamento: topLink
                ? `Existe um canal forte de ${formatCurrency(topLink.value)} fluindo da(o) ${topLink.source} para a categoria ${topLink.target}. Este é o seu principal "tubo" de gastos.`
                : 'Mapeando conexões financeiras...',
            tendencia: 'Este diagrama revela fidelidade. Se os mesmos fluxos se repetirem, você está criando um hábito de consumo que automatiza seus gastos, o que pode cegar para novas opções de preço.'
        },
        heatmap: {
            finalidade: 'Detectar padrões comportamentais baseados nos dias da semana para otimizar o planejamento de compras.',
            comportamento: dominantDay
                ? `O dia ${dominantDay.name} é o seu dia preferido para compras (${dominantDay.value} registros). Isso pode indicar um padrão de reposição semanal ou disponibilidade de tempo.`
                : 'Amostragem semanal em processamento...',
            tendencia: `Com ${formatPercent(weekendShare)} das compras no fim de semana, você tende a ser um consumidor de conveniência. Compras nos dias de "feira" ou promoções específicas de meio de semana podem reduzir este valor.`
        },
        ticketHistogram: {
            finalidade: 'Avaliar o tamanho médio das suas "idas ao mercado": você faz compras grandes ou compras de conveniência?',
            comportamento: dominantTicketBucket
                ? `Seus cupons mais comuns ficam na faixa de ${dominantTicketBucket.label}. Isso reflete um comportamento de ${lowTicketShare > 50 ? 'reposição imediata e frequente' : 'compras de abastecimento planejado'}.`
                : 'Classificando tickets médios...',
            tendencia: `Muitos cupons de baixo valor (${formatPercent(lowTicketShare)}) aumentam o gasto logístico (tempo/gasolina). Tentar consolidar essas compras em tickets maiores e menos frequentes pode gerar economia indireta.`
        },
        inflation: {
            finalidade: 'Medir o impacto real da variação de preços no seu bolso, filtrando a inflação oficial para a sua realidade de consumo.',
            comportamento: reportData.inflation.comparableProductsCount > 0
                ? `Sua inflação pessoal de ${formatSignedRatioPercent(reportData.inflation.personalInflationRate)} superou ou acompanhou o mercado. O impacto de ${formatCurrency(reportData.inflation.totalInflationImpact)} foi puxado principalmente pela categoria ${inflationTopCategory?.name}.`
                : 'Ainda não é possível medir inflação pois os produtos não se repetiram no intervalo.',
            tendencia: `A pressão em ${inflationTopProduct?.name || 'certos itens'} indica que o mercado está ajustando preços para cima nesta área. Antecipar compras ou trocar de marca/loja para estes itens é vital para manter seu poder de compra.`
        }
    };
};

const drawGridLines = (context, area, minValue, maxValue, tickFormatter, orientation = 'horizontal') => {
    const range = Math.max(1, maxValue - minValue);

    for (let step = 0; step <= 4; step += 1) {
        if (orientation === 'horizontal') {
            const y = area.top + (area.height / 4) * step;
            const value = maxValue - (range / 4) * step;
            context.strokeStyle = COLORS.lightSlate;
            context.beginPath();
            context.moveTo(area.left, y);
            context.lineTo(area.left + area.width, y);
            context.stroke();

            context.fillStyle = COLORS.muted;
            context.font = '400 13px Arial';
            context.fillText(tickFormatter(value), 18, y + 4);
        } else {
            const x = area.left + (area.width / 4) * step;
            const value = (maxValue / 4) * step;
            context.strokeStyle = COLORS.lightSlate;
            context.beginPath();
            context.moveTo(x, area.top);
            context.lineTo(x, area.top + area.height);
            context.stroke();

            context.fillStyle = COLORS.muted;
            context.font = '400 13px Arial';
            context.textAlign = 'center';
            context.fillText(tickFormatter(value), x, area.top + area.height + 28);
            context.textAlign = 'left';
        }
    }
};

const drawLineAreaChart = ({
    title,
    subtitle,
    data,
    valueKey,
    labelKey,
    lineColor,
    fillColor = 'rgba(74, 144, 194, 0.18)',
    yFormatter = formatCurrency,
    xFormatter = formatAxisDate,
    emptyMessage = 'Sem dados suficientes',
    startAtZero = true,
    drawArea = true,
    width = 1400,
    height = 500
}) => {
    const { canvas, context } = createCanvas(width, height);
    if (!data.length) {
        drawEmptyState(context, canvas.width, canvas.height, title, subtitle, emptyMessage);
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, title, subtitle);
    const area = { left: 90, top: 100, width: canvas.width - 150, height: canvas.height - 180 };
    const values = data.map((item) => Number(item[valueKey]) || 0);
    const rawMinValue = Math.min(...values);
    const rawMaxValue = Math.max(...values, 1);
    const minValue = startAtZero ? Math.min(0, rawMinValue) : rawMinValue;
    const maxValue = rawMaxValue === minValue ? rawMaxValue + 1 : rawMaxValue;
    const range = Math.max(1, maxValue - minValue);

    drawGridLines(context, area, minValue, maxValue, yFormatter);

    const points = data.map((item, index) => ({
        ...item,
        x: area.left + (area.width / Math.max(1, data.length - 1)) * index,
        y: area.top + area.height - (((Number(item[valueKey]) || 0) - minValue) / range) * area.height
    }));

    context.beginPath();
    points.forEach((point, index) => {
        if (index === 0) {
            context.moveTo(point.x, point.y);
        } else {
            context.lineTo(point.x, point.y);
        }
    });
    context.strokeStyle = lineColor;
    context.lineWidth = 4;
    context.stroke();

    if (drawArea) {
        const firstPoint = points[0];
        const lastPoint = points.at(-1);
        context.beginPath();
        context.moveTo(firstPoint.x, area.top + area.height);
        points.forEach((point) => context.lineTo(point.x, point.y));
        context.lineTo(lastPoint.x, area.top + area.height);
        context.closePath();
        context.fillStyle = fillColor;
        context.fill();
    }

    points.forEach((point, index) => {
        context.fillStyle = COLORS.white;
        context.strokeStyle = lineColor;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        const labelFrequency = Math.max(1, Math.ceil(points.length / 6));
        if (index === 0 || index === points.length - 1 || index % labelFrequency === 0) {
            context.save();
            context.translate(point.x, canvas.height - 34);
            context.rotate(-Math.PI / 6);
            context.fillStyle = COLORS.muted;
            context.font = '400 13px Arial';
            context.fillText(xFormatter(point[labelKey], point), -24, 0);
            context.restore();
        }
    });

    return canvas;
};

const drawMultiScenarioProjectionChart = ({
    title,
    subtitle,
    data,
    width = 1400,
    height = 500
}) => {
    const { canvas, context } = createCanvas(width, height);
    if (!data || !data.length) {
        drawEmptyState(context, canvas.width, canvas.height, title, subtitle, 'Sem dados de projeção');
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, title, subtitle);
    const area = { left: 90, top: 120, width: canvas.width - 150, height: canvas.height - 220 };
    
    const allValues = data.flatMap((item) => [
        item.actual,
        item.provavel,
        item.conservador,
        item.picos
    ]).filter(v => v !== null && !isNaN(v));
    
    const maxValue = Math.max(...allValues, 100) * 1.1;
    const minValue = 0;
    const range = maxValue - minValue;

    drawGridLines(context, area, minValue, maxValue, formatCurrency);

    const getX = (index) => area.left + (area.width / Math.max(1, data.length - 1)) * index;
    const getY = (val) => area.top + area.height - ((Number(val) - minValue) / range) * area.height;

    // Helper to draw a line
    const drawLine = (key, color, isDashed = false, lineWidth = 3) => {
        const points = data
            .map((item, index) => item[key] !== null ? { x: getX(index), y: getY(item[key]) } : null)
            .filter(p => p !== null);

        if (points.length < 2) return;

        context.save();
        if (isDashed) context.setLineDash([12, 8]);
        context.beginPath();
        points.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
        });
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
        context.restore();
    };

    // Draw scenarios
    drawLine('picos', '#D84315', true, 3);
    drawLine('provavel', COLORS.blue, true, 4);
    drawLine('conservador', '#2E7D32', true, 3);
    
    // Draw Actual (Solid)
    drawLine('actual', COLORS.navy, false, 6);

    // Labels
    data.forEach((item, index) => {
        const x = getX(index);
        const labelFrequency = Math.max(1, Math.ceil(data.length / 10));
        if (index === 0 || index === data.length - 1 || index % labelFrequency === 0) {
            context.fillStyle = COLORS.muted;
            context.font = '400 13px Arial';
            context.textAlign = 'center';
            context.fillText(String(item.day), x, canvas.height - 40);
        }
    });

    // Legend at Bottom
    const legendY = canvas.height - 35;
    let currentLegendX = area.left;
    const spacing = 220;
    
    const addLegendItem = (label, color, isDashed = false) => {
        context.save();
        if (isDashed) context.setLineDash([6, 4]);
        context.strokeStyle = color;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(currentLegendX, legendY);
        context.lineTo(currentLegendX + 25, legendY);
        context.stroke();
        context.restore();
        
        context.fillStyle = COLORS.text;
        context.font = '700 16px Arial';
        context.textAlign = 'left';
        context.fillText(label, currentLegendX + 35, legendY + 6);
        currentLegendX += spacing;
    };

    addLegendItem('Gasto Real', COLORS.navy);
    addLegendItem('Provável', COLORS.blue, true);
    addLegendItem('Conservador', '#2E7D32', true);
    addLegendItem('Picos', '#D84315', true);

    return canvas;
};

const buildVisibleSegments = (data, maxSegments, remainderLabel) => {
    if (!data.length) return [];
    if (data.length <= maxSegments) return data;

    const leadingSegments = data.slice(0, maxSegments - 1);
    const remainder = data.slice(maxSegments - 1);
    return [
        ...leadingSegments,
        {
            name: remainderLabel,
            value: sum(remainder.map((item) => Number(item.value) || 0)),
            percentage: sum(remainder.map((item) => Number(item.percentage) || 0))
        }
    ];
};

const drawDonutChart = ({
    title,
    subtitle,
    data,
    valueFormatter,
    centerValue,
    centerLabel,
    maxSegments = 6,
    remainderLabel = 'Demais',
    emptyMessage = 'Sem dados suficientes'
}) => {
    const { canvas, context } = createCanvas(1400, 500);
    if (!data.length) {
        drawEmptyState(context, canvas.width, canvas.height, title, subtitle, emptyMessage);
        return canvas;
    }

    const visibleData = buildVisibleSegments(data, maxSegments, remainderLabel);
    const totalValue = Math.max(1, sum(visibleData.map((item) => Number(item.value) || 0)));

    drawFrame(context, canvas.width, canvas.height, title, subtitle);

    const centerX = 360;
    const centerY = 285;
    const outerRadius = 135;
    const innerRadius = 82;
    let startAngle = -Math.PI / 2;

    visibleData.forEach((item, index) => {
        const value = Number(item.value) || 0;
        const angle = (value / totalValue) * Math.PI * 2;
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(centerX, centerY, outerRadius, startAngle, startAngle + angle);
        context.closePath();
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fill();
        startAngle += angle;
    });

    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';

    context.fillStyle = COLORS.text;
    context.font = '700 24px Arial';
    context.textAlign = 'center';
    context.fillText(centerValue, centerX, centerY - 6);
    context.fillStyle = COLORS.muted;
    context.font = '400 15px Arial';
    context.fillText(centerLabel, centerX, centerY + 20);
    context.textAlign = 'left';

    let legendY = 135;
    visibleData.forEach((item, index) => {
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(700, legendY - 12, 22, 22);

        context.fillStyle = COLORS.text;
        context.font = '700 18px Arial';
        context.fillText(truncateText(context, item.name, 250), 736, legendY + 2);

        context.fillStyle = COLORS.muted;
        context.font = '400 16px Arial';
        const percentValue = Number.isFinite(item.percentage) ? item.percentage : safeRatio(Number(item.value) || 0, totalValue) * 100;
        context.fillText(`${formatPercent(percentValue)} | ${valueFormatter(item.value)}`, 736, legendY + 26);
        legendY += 56;
    });

    return canvas;
};

const drawHorizontalBarChart = ({
    title,
    subtitle,
    data,
    labelKey,
    valueKey,
    valueFormatter,
    tickFormatter,
    barColor,
    maxBars = 8,
    emptyMessage = 'Sem dados suficientes'
}) => {
    const { canvas, context } = createCanvas(1400, 500);
    const visibleData = data.slice(0, maxBars);
    if (!visibleData.length) {
        drawEmptyState(context, canvas.width, canvas.height, title, subtitle, emptyMessage);
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, title, subtitle);

    const area = { left: 260, top: 110, width: canvas.width - 320, height: canvas.height - 180 };
    const maxValue = Math.max(...visibleData.map((item) => Number(item[valueKey]) || 0), 1);
    drawGridLines(context, area, 0, maxValue, tickFormatter, 'vertical');

    const gap = 16;
    const barHeight = (area.height - gap * (visibleData.length - 1)) / visibleData.length;

    visibleData.forEach((item, index) => {
        const value = Number(item[valueKey]) || 0;
        const y = area.top + index * (barHeight + gap);
        const width = (value / maxValue) * area.width;

        context.fillStyle = 'rgba(226, 232, 240, 0.65)';
        context.fillRect(area.left, y, area.width, barHeight);
        context.fillStyle = barColor;
        context.fillRect(area.left, y, width, barHeight);

        context.fillStyle = COLORS.text;
        context.font = '700 16px Arial';
        const labelLines = splitCanvasText(context, item[labelKey], 220, 2);
        labelLines.forEach((line, lineIndex) => {
            context.fillText(line, 28, y + 18 + lineIndex * 16);
        });

        context.fillStyle = COLORS.muted;
        context.font = '700 15px Arial';
        context.fillText(valueFormatter(value), area.left + width + 12, y + barHeight / 2 + 5);
    });

    return canvas;
};

const drawVerticalBarChart = ({
    title,
    subtitle,
    data,
    valueKey,
    labelKey,
    valueFormatter,
    tickFormatter,
    labelRotation = -Math.PI / 5,
    barColorAccessor,
    emptyMessage = 'Sem dados suficientes'
}) => {
    const { canvas, context } = createCanvas(1400, 500);
    if (!data.length) {
        drawEmptyState(context, canvas.width, canvas.height, title, subtitle, emptyMessage);
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, title, subtitle);
    const area = { left: 90, top: 95, width: canvas.width - 130, height: canvas.height - 190 };
    const maxValue = Math.max(...data.map((item) => Number(item[valueKey]) || 0), 1);
    drawGridLines(context, area, 0, maxValue, tickFormatter);

    const barWidth = area.width / Math.max(1, data.length);

    data.forEach((item, index) => {
        const value = Number(item[valueKey]) || 0;
        const barHeight = (value / maxValue) * area.height;
        const x = area.left + index * barWidth + 12;
        const y = area.top + area.height - barHeight;
        const width = Math.max(10, barWidth - 24);

        context.fillStyle = typeof barColorAccessor === 'function'
            ? barColorAccessor(item, index)
            : CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(x, y, width, barHeight);

        context.fillStyle = COLORS.text;
        context.font = '700 15px Arial';
        context.textAlign = 'center';
        context.fillText(valueFormatter(value), x + width / 2, y - 10);

        context.save();
        context.translate(x + width / 2, canvas.height - 26);
        context.rotate(labelRotation);
        context.fillStyle = COLORS.muted;
        context.font = '400 13px Arial';
        context.fillText(String(item[labelKey] ?? ''), 0, 0);
        context.restore();
    });

    context.textAlign = 'left';
    return canvas;
};

const drawStackedBarChart = ({
    title,
    subtitle,
    data,
    series,
    emptyMessage = 'Sem dados suficientes'
}) => {
    const { canvas, context } = createCanvas(1400, 520);
    if (!data.length || !series.length) {
        drawEmptyState(context, canvas.width, canvas.height, title, subtitle, emptyMessage);
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, title, subtitle);

    context.font = '400 13px Arial';
    let legendX = 90;
    series.forEach((store, index) => {
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(legendX, 82, 18, 18);
        context.fillStyle = COLORS.text;
        context.fillText(truncateText(context, store.label, 120), legendX + 26, 95);
        legendX += 150;
    });

    const area = { left: 90, top: 120, width: canvas.width - 150, height: canvas.height - 220 };
    const totals = data.map((item) => sum(series.map((store) => Number(item[store.key]) || 0)));
    const maxValue = Math.max(...totals, 1);
    drawGridLines(context, area, 0, maxValue, formatCurrency);

    const groupWidth = area.width / Math.max(1, data.length);
    data.forEach((item, index) => {
        const x = area.left + index * groupWidth + groupWidth * 0.18;
        const width = groupWidth * 0.64;
        let currentY = area.top + area.height;
        const total = totals[index];

        series.forEach((store, seriesIndex) => {
            const value = Number(item[store.key]) || 0;
            if (!value) return;
            const segmentHeight = (value / maxValue) * area.height;
            currentY -= segmentHeight;
            context.fillStyle = CHART_COLORS[seriesIndex % CHART_COLORS.length];
            context.fillRect(x, currentY, width, segmentHeight);
        });

        context.fillStyle = COLORS.text;
        context.font = '700 14px Arial';
        context.textAlign = 'center';
        context.fillText(formatCurrency(total), x + width / 2, currentY - 10);
        context.fillStyle = COLORS.muted;
        context.font = '400 13px Arial';
        context.fillText(item.month || '', x + width / 2, canvas.height - 34);
    });

    context.textAlign = 'left';
    return canvas;
};

const drawParetoChart = (paretoData) => {
    const { canvas, context } = createCanvas(1400, 520);
    if (!paretoData.length) {
        drawEmptyState(
            context,
            canvas.width,
            canvas.height,
            'Gráfico de Pareto (Top 10 Produtos)',
            'Concentração acumulada do gasto por produto',
            'Sem dados suficientes'
        );
        return canvas;
    }

    drawFrame(
        context,
        canvas.width,
        canvas.height,
        'Gráfico de Pareto (Top 10 Produtos)',
        'Concentração acumulada do gasto por produto'
    );

    const area = { left: 90, top: 100, width: canvas.width - 180, height: canvas.height - 210 };
    const maxValue = Math.max(...paretoData.map((item) => item.value), 1);

    drawGridLines(context, area, 0, maxValue, formatCurrency);

    for (let step = 0; step <= 4; step += 1) {
        const y = area.top + (area.height / 4) * step;
        const percent = 100 - 25 * step;
        context.fillStyle = COLORS.muted;
        context.font = '400 13px Arial';
        context.textAlign = 'left';
        context.fillText(`${percent}%`, area.left + area.width + 18, y + 4);
    }

    const barWidth = area.width / Math.max(1, paretoData.length);
    const linePoints = [];

    paretoData.forEach((item, index) => {
        const x = area.left + index * barWidth + 14;
        const width = Math.max(12, barWidth - 28);
        const barHeight = (item.value / maxValue) * area.height;
        const y = area.top + area.height - barHeight;

        context.fillStyle = COLORS.blue;
        context.fillRect(x, y, width, barHeight);

        const pointX = x + width / 2;
        const pointY = area.top + area.height - ((item.percentage || 0) / 100) * area.height;
        linePoints.push({ x: pointX, y: pointY });

        context.save();
        context.translate(pointX, canvas.height - 28);
        context.rotate(-Math.PI / 6);
        context.fillStyle = COLORS.muted;
        context.font = '400 13px Arial';
        context.textAlign = 'right';
        context.fillText(item.shortName || item.name, 0, 0);
        context.restore();
    });

    context.beginPath();
    linePoints.forEach((point, index) => {
        if (index === 0) {
            context.moveTo(point.x, point.y);
        } else {
            context.lineTo(point.x, point.y);
        }
    });
    context.strokeStyle = '#FF7300';
    context.lineWidth = 3;
    context.stroke();

    linePoints.forEach((point) => {
        context.fillStyle = COLORS.white;
        context.strokeStyle = '#FF7300';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });

    context.textAlign = 'left';
    return canvas;
};

const buildTreemapLayout = (items, x, y, width, height, vertical = width >= height) => {
    if (!items.length) return [];
    if (items.length === 1) {
        return [{ item: items[0], x, y, width, height }];
    }

    const total = sum(items.map((item) => item.size));
    let runningTotal = 0;
    let splitIndex = 0;

    while (splitIndex < items.length - 1 && runningTotal < total / 2) {
        runningTotal += items[splitIndex].size;
        splitIndex += 1;
    }

    const firstGroup = items.slice(0, splitIndex);
    const secondGroup = items.slice(splitIndex);
    const firstRatio = safeRatio(sum(firstGroup.map((item) => item.size)), total);

    if (vertical) {
        const firstWidth = width * firstRatio;
        return [
            ...buildTreemapLayout(firstGroup, x, y, firstWidth, height, !vertical),
            ...buildTreemapLayout(secondGroup, x + firstWidth, y, width - firstWidth, height, !vertical)
        ];
    }

    const firstHeight = height * firstRatio;
    return [
        ...buildTreemapLayout(firstGroup, x, y, width, firstHeight, !vertical),
        ...buildTreemapLayout(secondGroup, x, y + firstHeight, width, height - firstHeight, !vertical)
    ];
};

const drawTreemapChart = (treemapData, totalSpent) => {
    const { canvas, context } = createCanvas(1400, 520);
    if (!treemapData.length) {
        drawEmptyState(
            context,
            canvas.width,
            canvas.height,
            'Treemap de Categorias',
            'Peso relativo das categorias no valor dos itens analisados',
            'Sem dados suficientes'
        );
        return canvas;
    }

    drawFrame(
        context,
        canvas.width,
        canvas.height,
        'Treemap de Categorias',
        'Peso relativo das categorias no valor dos itens analisados'
    );

    const sortedItems = [...treemapData]
        .filter((item) => (Number(item.size) || 0) > 0)
        .sort((left, right) => right.size - left.size);
    const layout = buildTreemapLayout(sortedItems, 70, 100, 1260, 360);

    layout.forEach(({ item, x, y, width, height }, index) => {
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(x, y, width, height);
        context.strokeStyle = COLORS.white;
        context.lineWidth = 3;
        context.strokeRect(x, y, width, height);

        if (width < 95 || height < 55) return;

        context.fillStyle = COLORS.white;
        context.font = '700 18px Arial';
        const nameLines = splitCanvasText(context, item.name, width - 22, 2);
        nameLines.forEach((line, lineIndex) => {
            context.fillText(line, x + 12, y + 26 + lineIndex * 18);
        });

        context.font = '400 15px Arial';
        const percentage = safeRatio(item.size, totalSpent) * 100;
        context.fillText(formatCurrency(item.size), x + 12, y + height - 28);
        context.fillText(formatPercent(percentage), x + 12, y + height - 10);
    });

    return canvas;
};

const drawCompositionChart = (categoryComposition) => drawDonutChart({
    title: 'Composição por Categorias',
    subtitle: 'Distribuição percentual por centros de custo',
    data: categoryComposition,
    valueFormatter: formatCurrency,
    centerValue: '100%',
    centerLabel: 'dos itens analisados',
    maxSegments: 6,
    remainderLabel: 'Demais categorias'
});

const drawFlowChart = (flowData) => {
    const { canvas, context } = createCanvas(1400, 560);
    if (!flowData.links.length || !flowData.sources.length || !flowData.targets.length) {
        drawEmptyState(
            context,
            canvas.width,
            canvas.height,
            'Fluxo Financeiro (Sankey)',
            'Percurso do gasto dos estabelecimentos para as categorias',
            'Sem dados suficientes'
        );
        return canvas;
    }

    drawFrame(
        context,
        canvas.width,
        canvas.height,
        'Fluxo Financeiro (Sankey)',
        'Percurso do gasto dos estabelecimentos para as categorias'
    );

    const totalFlow = Math.max(1, sum(flowData.links.map((link) => link.value)));
    const topPadding = 110;
    const bottomPadding = 80;
    const availableHeight = canvas.height - topPadding - bottomPadding;
    const gap = 18;
    const nodeWidth = 24;
    const leftX = 120;
    const rightX = 980;
    const scale = (availableHeight - (Math.max(flowData.sources.length, flowData.targets.length) - 1) * gap) / totalFlow;
    const sourceNodes = {};
    const targetNodes = {};

    let currentY = topPadding;
    flowData.sources.forEach((source, index) => {
        const height = Math.max(18, source.value * scale);
        sourceNodes[source.name] = {
            x: leftX,
            y: currentY,
            height,
            color: CHART_COLORS[index % CHART_COLORS.length],
            offset: 0,
            value: source.value
        };
        currentY += height + gap;
    });

    currentY = topPadding;
    flowData.targets.forEach((target, index) => {
        const height = Math.max(18, target.value * scale);
        targetNodes[target.name] = {
            x: rightX,
            y: currentY,
            height,
            color: CHART_COLORS[index % CHART_COLORS.length],
            offset: 0,
            value: target.value
        };
        currentY += height + gap;
    });

    flowData.links.forEach((link) => {
        const source = sourceNodes[link.source];
        const target = targetNodes[link.target];
        if (!source || !target) return;

        const bandHeight = Math.max(8, link.value * scale);
        const sourceTop = source.y + source.offset;
        const targetTop = target.y + target.offset;
        const sourceBottom = sourceTop + bandHeight;
        const targetBottom = targetTop + bandHeight;
        const controlX = (leftX + rightX) / 2;

        context.beginPath();
        context.moveTo(leftX + nodeWidth, sourceTop);
        context.bezierCurveTo(controlX, sourceTop, controlX, targetTop, rightX, targetTop);
        context.lineTo(rightX, targetBottom);
        context.bezierCurveTo(controlX, targetBottom, controlX, sourceBottom, leftX + nodeWidth, sourceBottom);
        context.closePath();
        context.fillStyle = 'rgba(47, 93, 140, 0.28)';
        context.fill();

        source.offset += bandHeight;
        target.offset += bandHeight;
    });

    Object.entries(sourceNodes).forEach(([name, node]) => {
        context.fillStyle = node.color;
        context.fillRect(node.x, node.y, nodeWidth, node.height);
        context.fillStyle = COLORS.text;
        context.font = '700 16px Arial';
        context.fillText(truncateText(context, name, 260), node.x + nodeWidth + 12, node.y + 20);
        context.fillStyle = COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(node.value), node.x + nodeWidth + 12, node.y + 40);
    });

    Object.entries(targetNodes).forEach(([name, node]) => {
        context.fillStyle = node.color;
        context.fillRect(node.x, node.y, nodeWidth, node.height);
        context.fillStyle = COLORS.text;
        context.font = '700 16px Arial';
        context.fillText(truncateText(context, name, 260), node.x + nodeWidth + 12, node.y + 20);
        context.fillStyle = COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(node.value), node.x + nodeWidth + 12, node.y + 40);
    });

    return canvas;
};

const addPageHeader = (pdf, reportTitle, pageTitle) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(COLORS.navy);
    pdf.rect(0, 0, pageWidth, 74, 'F');
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text(reportTitle, 40, 34);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(pageTitle, 40, 54);
};

const addFooter = (pdf) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageCount = pdf.getNumberOfPages();

    for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(COLORS.lightSlate);
        pdf.line(40, pageHeight - 38, pageWidth - 40, pageHeight - 38);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(COLORS.muted);
        pdf.text(`Relatório gerado automaticamente em ${dateFormatter.format(new Date())}`, 40, pageHeight - 22);
        pdf.text(`Página ${page} de ${pageCount}`, pageWidth - 100, pageHeight - 22);
    }
};

const addSummaryCard = (pdf, label, value, x, y, width) => {
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y, width, 72, 12, 12, 'F');
    pdf.setTextColor(COLORS.muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(label, x + 14, y + 20);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(pdf.splitTextToSize(String(value), width - 28), x + 14, y + 44);
};

const addMetricCard = (pdf, label, value, x, y, width, accentColor = COLORS.blue) => {
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y, width, 58, 10, 10, 'F');
    pdf.setFillColor(accentColor);
    pdf.roundedRect(x, y, 6, 58, 6, 6, 'F');
    pdf.setTextColor(COLORS.muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(label, x + 16, y + 18);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(pdf.splitTextToSize(String(value), width - 28), x + 16, y + 38);
};

const addMetricStrip = (pdf, metrics, x, y, width) => {
    const visibleMetrics = metrics.filter((metric) => metric && metric.label && metric.value !== undefined).slice(0, 3);
    if (!visibleMetrics.length) {
        return y;
    }

    const gap = 12;
    const cardWidth = (width - gap * (visibleMetrics.length - 1)) / visibleMetrics.length;

    visibleMetrics.forEach((metric, index) => {
        addMetricCard(
            pdf,
            metric.label,
            metric.value,
            x + index * (cardWidth + gap),
            y,
            cardWidth,
            metric.color || CHART_COLORS[index % CHART_COLORS.length]
        );
    });

    return y + 72;
};

const addInsightBlock = (pdf, title, body, x, y, width, accentColor) => {
    pdf.setFillColor(accentColor);
    pdf.roundedRect(x, y, width, 28, 8, 8, 'F');
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, x + 12, y + 18);
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y + 34, width, 92, 10, 10, 'F');
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(body, width - 22), x + 11, y + 52);
};

const addNarrativeCard = (pdf, title, body, x, y, width, height, accentColor = COLORS.blue) => {
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y, width, height, 12, 12, 'F');
    pdf.setFillColor(accentColor);
    pdf.roundedRect(x, y, width, 22, 12, 12, 'F');
    pdf.rect(x, y + 12, width, 10, 'F');
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(title, x + 12, y + 15);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(body, width - 24), x + 12, y + 40);
};

const addTableHeader = (pdf, columns, startX, startY) => {
    let currentX = startX;
    pdf.setFillColor(COLORS.navy);
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);

    columns.forEach((column) => {
        pdf.rect(currentX, startY, column.width, 24, 'F');
        pdf.text(column.label, currentX + 6, startY + 16);
        currentX += column.width;
    });

    return startY + 24;
};

const addTableRow = (pdf, columns, cells, startX, startY) => {
    const preparedCells = cells.map((cell, index) => {
        const text = String(cell ?? '');
        const lines = pdf.splitTextToSize(text, columns[index].width - 10);
        return lines.length ? lines : [''];
    });
    const lineHeight = 10;
    const rowHeight = Math.max(
        24,
        ...preparedCells.map((lines) => lines.length * lineHeight + 10)
    );

    let currentX = startX;
    pdf.setDrawColor(COLORS.lightSlate);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);

    preparedCells.forEach((lines, index) => {
        pdf.rect(currentX, startY, columns[index].width, rowHeight);
        if (columns[index].color) {
            pdf.setTextColor(columns[index].color(cells[index]));
        } else {
            pdf.setTextColor(COLORS.text);
        }
        pdf.text(lines, currentX + 5, startY + 12);
        currentX += columns[index].width;
    });

    return startY + rowHeight;
};

const addPaginatedTable = ({ pdf, reportTitle, pageTitle, introText, columns, rows, mapRow, emptyMessage }) => {
    const pageHeight = pdf.internal.pageSize.getHeight();
    const startX = 40;
    const contentWidth = 515;
    let rowIndex = 0;
    let pageNumber = 0;

    const startPage = () => {
        if (pageNumber > 0) {
            pdf.addPage();
        }

        addPageHeader(pdf, reportTitle, pageTitle);
        pdf.setTextColor(COLORS.text);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(17);
        pdf.text(pageTitle, 40, 100);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(COLORS.muted);
        pdf.text(pdf.splitTextToSize(introText, contentWidth), 40, 118);
        pageNumber += 1;
    };

    if (!rows.length) {
        startPage();
        pdf.setFillColor(COLORS.page);
        pdf.roundedRect(40, 150, contentWidth, 80, 12, 12, 'F');
        pdf.setTextColor(COLORS.muted);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.text(pdf.splitTextToSize(emptyMessage, contentWidth - 24), 52, 188);
        return;
    }

    while (rowIndex < rows.length) {
        startPage();
        let currentY = addTableHeader(pdf, columns, startX, 148);

        while (rowIndex < rows.length) {
            const previewCells = mapRow(rows[rowIndex]);
            const previewHeight = Math.max(
                24,
                ...previewCells.map((cell, index) => {
                    const lines = pdf.splitTextToSize(String(cell ?? ''), columns[index].width - 10);
                    return Math.max(1, lines.length) * 10 + 10;
                })
            );

            if (currentY + previewHeight > pageHeight - 56) {
                break;
            }

            currentY = addTableRow(pdf, columns, previewCells, startX, currentY);
            rowIndex += 1;
        }
    }
};

const addInflationOverviewPage = (pdf, reportTitle, reportData, insights) => {
    const topProduct = reportData.inflation.productInflationData[0];
    const topCategory = reportData.inflation.categoryInflationData[0];

    pdf.addPage();
    addPageHeader(pdf, reportTitle, 'Índice de Inflação Pessoal');

    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('Índice de Inflação Pessoal', 40, 102);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(COLORS.muted);
    pdf.text(
        'Comparativo entre o último preço e o preço anterior dos produtos comparáveis no período filtrado.',
        40,
        120
    );

    const metricWidth = (515 - 24) / 3;
    addSummaryCard(pdf, 'Índice geral', formatSignedRatioPercent(reportData.inflation.personalInflationRate), 40, 144, metricWidth);
    addSummaryCard(pdf, 'Impacto financeiro', formatCurrency(reportData.inflation.totalInflationImpact), 40 + metricWidth + 12, 144, metricWidth);
    addSummaryCard(pdf, 'Produtos comparáveis', `${reportData.inflation.comparableProductsCount}`, 40 + (metricWidth + 12) * 2, 144, metricWidth);

    addNarrativeCard(pdf, 'Leitura executiva', insights.inflation.comportamento, 40, 236, 515, 92, COLORS.blue);
    addNarrativeCard(
        pdf,
        'Metodologia',
        'Índice geral: (preço atual - preço anterior) / preço anterior. Impacto financeiro: (preço atual - preço anterior) x quantidade atual.',
        40,
        340,
        515,
        88,
        COLORS.cyan
    );
    addNarrativeCard(
        pdf,
        'Produto com maior pressão',
        topProduct
            ? `${topProduct.name} | ${topProduct.category} | ${formatDate(topProduct.previousDate)} até ${formatDate(topProduct.currentDate)} | inflação ${formatSignedRatioPercent(topProduct.inflationRate)} | impacto ${formatCurrency(topProduct.financialImpact)}.`
            : 'Não há produto com base comparável suficiente no período.',
        40,
        440,
        251,
        118,
        COLORS.slate
    );
    addNarrativeCard(
        pdf,
        'Categoria com maior pressão',
        topCategory
            ? `${topCategory.name} lidera com ${topCategory.comparableProducts} produtos comparáveis, inflação de ${formatSignedRatioPercent(topCategory.inflationRate)} e impacto de ${formatCurrency(topCategory.financialImpact)}.`
            : 'Não há categoria com base comparável suficiente no período.',
        304,
        440,
        251,
        118,
        COLORS.navy
    );
    addNarrativeCard(pdf, 'Tendência observada', insights.inflation.tendencia, 40, 570, 515, 92, COLORS.blue);
};

const addAnalyticalChartPage = (pdf, reportTitle, pageTitle, canvas, insights, metrics = []) => {
    addPageHeader(pdf, reportTitle, pageTitle);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(pageTitle, 40, 102);
    pdf.addImage(canvas.toDataURL('image/png', 1), 'PNG', 40, 122, 515, 180, undefined, 'FAST');

    const metricsBottom = addMetricStrip(pdf, metrics, 40, 320, 515);
    const narrativeStartY = metricsBottom ? metricsBottom + 4 : 320;

    addNarrativeCard(pdf, 'Finalidade do gráfico', insights.finalidade, 40, narrativeStartY, 515, 98, COLORS.blue);
    addNarrativeCard(pdf, 'Análise de comportamento', insights.comportamento, 40, narrativeStartY + 112, 515, 98, COLORS.cyan);
    addNarrativeCard(pdf, 'Tendência de consumo', insights.tendencia, 40, narrativeStartY + 224, 515, 98, COLORS.slate);
};

const addProjectionAnalysisPage = (pdf, reportTitle, reportData, insights) => {
    addPageHeader(pdf, reportTitle, 'Algoritmo de Previsão de Gastos');
    
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('Algoritmo de Previsão de Gastos', 40, 102);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(COLORS.text);
    pdf.text('RELATÓRIO DE RISCO E PREVISÃO\nAnálise de tendências sob cenários estatísticos.', 40, 122);
    
    const columns = [
        { label: 'Cenário', width: 100 },
        { label: 'Descrição da Lógica', width: 315 },
        { label: 'Valor Previsto', width: 100 }
    ];
    
    const scenarios = reportData.monthInsight?.scenarios;
    if (scenarios) {
        const rows = [
            { name: 'Conservador', logic: scenarios.conservador.description, value: formatCurrency(scenarios.conservador.value) },
            { name: 'Provável', logic: scenarios.provavel.description, value: formatCurrency(scenarios.provavel.value), isBold: true },
            { name: 'Se repetir picos', logic: scenarios.picos.description, value: formatCurrency(scenarios.picos.value) }
        ];
        
        let currentY = addTableHeader(pdf, columns, 40, 170);
        rows.forEach(row => {
            if (row.isBold) pdf.setFont('helvetica', 'bold');
            else pdf.setFont('helvetica', 'normal');
            currentY = addTableRow(pdf, columns, [row.name, row.logic, row.value], 40, currentY);
        });
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.setTextColor(COLORS.muted);
        pdf.text('A análise considera sazonalidade, Run Rate e elasticidade de categorias.', 40, currentY + 20);
    } else {
        pdf.text('Dados de projeção insuficientes para o mês atual.', 40, 180);
    }

    const chartCanvas = drawMultiScenarioProjectionChart({
        title: 'Curva de Tendência e Riscos',
        subtitle: 'Projeção de fechamento sob diferentes cenários de consumo',
        data: reportData.monthInsight?.projectionChartData || [],
        totalDays: reportData.monthInsight?.totalDaysInMonth || 30
    });
    
    pdf.addImage(chartCanvas.toDataURL('image/png', 1), 'PNG', 40, 260, 515, 180, undefined, 'FAST');

    addInsightBlock(pdf, 'Leitura de Risco', insights.projection.comportamento, 40, 460, 515, COLORS.blue);
    addInsightBlock(pdf, 'Tendência e Ajustes', insights.projection.tendencia, 40, 570, 515, COLORS.cyan);
    
    addNarrativeCard(
        pdf, 
        'Conclusão da Análise', 
        insights.projection.tendencia + ' ' + (reportData.monthInsight?.outlookSentence || ''), 
        40, 680, 515, 80, COLORS.navy
    );
};

export const exportToExcel = (data, filename = 'gastos_contabeis.xlsx') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatorio');
    XLSX.writeFile(workbook, filename);
};

export const generateConsumptionAnalysisPdf = async ({
    receipts = [],
    products = [],
    stats = null,
    selectedProductGroups = [],
    monthInsight = null
}) => {
    if (!receipts.length || !products.length) {
        throw new Error('Não há dados suficientes para gerar o relatório.');
    }

    const JsPDF = await loadJsPdfConstructor();
    const reportData = buildReportData({ receipts, products, stats, selectedProductGroups });
    reportData.monthInsight = monthInsight;
    const insights = buildInsights(reportData);
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const avgTicket = reportData.receipts.length ? reportData.receiptTotalSpent / reportData.receipts.length : 0;

    addPageHeader(pdf, insights.summary.title, insights.summary.subtitle);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text('Painel Executivo', 40, 110);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(COLORS.muted);
    pdf.text(`Período analisado: ${insights.summary.periodLabel}`, 40, 132);
    pdf.text(`Base de dados: ${receipts.length} cupons fiscais e ${products.length} itens processados`, 40, 148);

    const cardWidth = (pageWidth - 100) / 2;
    [
        ['Total em cupons', formatCurrency(reportData.receiptTotalSpent)],
        ['Total dos itens', formatCurrency(reportData.productTotalSpent)],
        ['Cupons processados', `${reportData.receipts.length}`],
        ['Ticket médio', formatCurrency(avgTicket)]
    ].forEach(([label, value], index) => {
        const x = 40 + (index % 2) * (cardWidth + 20);
        const y = 172 + Math.floor(index / 2) * 92;
        addSummaryCard(pdf, label, value, x, y, cardWidth);
    });

    const synthesisText = `${insights.summary.highlights.join(' ')} Perfil inferido: ${reportData.profile}. ${insights.summary.dataIntegrityNote} A projeção temporal aponta ${reportData.temporalProjection.direction} do gasto agregado, enquanto a composição por categorias ajuda a antecipar prioridades orçamentárias de curto prazo.`;
    const synthesisLines = pdf.splitTextToSize(synthesisText, 487);
    const synthesisHeight = Math.max(112, synthesisLines.length * 14 + 56);
    
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(40, 370, 515, synthesisHeight, 14, 14, 'F');
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Síntese estratégica', 56, 396);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(synthesisLines, 56, 418);

    const narrativeY = 370 + synthesisHeight + 26;
    addNarrativeCard(pdf, 'Concentração do gasto', insights.summary.concentrationNote, 40, narrativeY, 251, 110, COLORS.blue);
    addNarrativeCard(pdf, 'Recorrência diária', insights.summary.recurrenceNote, 304, narrativeY, 251, 110, COLORS.cyan);
    addNarrativeCard(pdf, 'Leitura inflacionária', insights.summary.inflationNote, 40, narrativeY + 124, 515, 96, COLORS.slate);

    pdf.addPage();
    addProjectionAnalysisPage(pdf, insights.summary.title, reportData, insights);

    const topStore = reportData.storeData[0];
    const secondStore = reportData.storeData[1];
    const topStoreShare = safeRatio(topStore?.value || 0, reportData.receiptTotalSpent) * 100;
    const topThreeStoreShare = safeRatio(
        sum(reportData.storeData.slice(0, 3).map((item) => item.value)),
        reportData.receiptTotalSpent
    ) * 100;
    const peakTemporal = [...reportData.temporalData].sort((left, right) => right.value - left.value)[0];
    const monthlyTotals = reportData.stackedData.map((item) => ({
        month: item.month || 'Sem referência',
        total: sum(reportData.topStores.map((store) => Number(item[store.key]) || 0))
    }));
    const peakMonth = [...monthlyTotals].sort((left, right) => right.total - left.total)[0];
    const averageMonthValue = average(monthlyTotals.map((item) => item.total));
    const totalAccumulated = reportData.accumulatedData.at(-1)?.total || 0;
    const accumulatedMidPoint = reportData.accumulatedData[Math.floor(reportData.accumulatedData.length / 2)]?.total || 0;
    const topParetoItem = reportData.paretoData[0];
    const paretoTopThreeShare = reportData.paretoData[2]?.percentage || reportData.paretoData.at(-1)?.percentage || 0;
    const dominantPriceBucket = [...reportData.priceHistogramData].sort((left, right) => right.count - left.count)[0];
    const lowPriceShare = safeRatio(
        sum(
            reportData.priceHistogramData
                .filter((item) => Number(item.bucketOrder) <= 1)
                .map((item) => item.count)
        ),
        sum(reportData.priceHistogramData.map((item) => item.count))
    ) * 100;
    const topPaymentMethod = reportData.paymentMethodSummaryData[0];
    const topPaymentMethodShare = safeRatio(topPaymentMethod?.value || 0, reportData.productTotalSpent) * 100;
    const leadingPaymentCategory = [...reportData.categoryPaymentMethodData]
        .sort((left, right) => right.value - left.value)[0];
    const topCategory = reportData.categoryComposition[0];
    const topThreeCategoryShare = sum(reportData.categoryComposition.slice(0, 3).map((item) => item.percentage));
    const topLink = [...reportData.flowData.links].sort((left, right) => right.value - left.value)[0];
    const dominantDay = [...reportData.heatmapData].sort((left, right) => right.value - left.value)[0];
    const weekendShare = safeRatio(
        sum(
            reportData.heatmapData
                .filter((item) => item.name === 'Sáb' || item.name === 'Dom')
                .map((item) => item.value)
        ),
        sum(reportData.heatmapData.map((item) => item.value))
    ) * 100;
    const dominantTicketBucket = [...reportData.receiptHistogramData].sort((left, right) => right.count - left.count)[0];
    const lowTicketShare = safeRatio(
        sum(reportData.receiptHistogramData.slice(0, 2).map((item) => item.count)),
        sum(reportData.receiptHistogramData.map((item) => item.count))
    ) * 100;

    const chartPages = [
        {
            title: 'Evolução dos Gastos ao Longo do Tempo',
            canvas: drawLineAreaChart({
                title: 'Evolução dos Gastos ao Longo do Tempo',
                subtitle: 'Somatório diário do consumo no período',
                data: reportData.temporalData,
                valueKey: 'value',
                labelKey: 'date',
                lineColor: COLORS.navy,
                fillColor: 'rgba(74, 144, 194, 0.18)',
                yFormatter: formatCurrency,
                xFormatter: formatAxisDate,
                emptyMessage: 'Sem dados suficientes'
            }),
            insights: insights.temporal,
            metrics: [
                { label: 'Maior dia', value: peakTemporal ? formatCurrency(peakTemporal.value) : 'Sem pico', color: COLORS.blue },
                { label: 'Média diária', value: formatCurrency(reportData.receiptTotalSpent / Math.max(1, reportData.temporalData.length)), color: COLORS.cyan },
                { label: 'Projeção 30 dias', value: formatCurrency(reportData.temporalProjection.projectedNext30), color: COLORS.slate }
            ]
        },
        {
            title: 'Distribuição por Loja (%)',
            canvas: drawDonutChart({
                title: 'Distribuição por Loja (%)',
                subtitle: 'Participação financeira dos principais estabelecimentos',
                data: reportData.storeData.map((item) => ({
                    ...item,
                    percentage: safeRatio(item.value, reportData.receiptTotalSpent) * 100
                })),
                valueFormatter: formatCurrency,
                centerValue: formatCurrency(reportData.receiptTotalSpent),
                centerLabel: 'total em cupons',
                maxSegments: 6,
                remainderLabel: 'Demais lojas'
            }),
            insights: insights.storeDistribution,
            metrics: [
                { label: 'Loja líder', value: topStore?.name || 'Sem destaque', color: COLORS.blue },
                { label: 'Participação líder', value: formatPercent(topStoreShare), color: COLORS.cyan },
                { label: 'Top 3 lojas', value: formatPercent(topThreeStoreShare), color: COLORS.slate }
            ]
        },
        {
            title: 'Comparativo de Lojas',
            canvas: drawHorizontalBarChart({
                title: 'Comparativo de Lojas',
                subtitle: 'Ranking das lojas de maior peso financeiro',
                data: reportData.storeData,
                labelKey: 'shortName',
                valueKey: 'value',
                valueFormatter: formatCurrency,
                tickFormatter: formatCurrency,
                barColor: COLORS.blue,
                maxBars: 5
            }),
            insights: insights.storeComparison,
            metrics: [
                { label: '1º lugar', value: formatCurrency(topStore?.value || 0), color: COLORS.blue },
                { label: '2º lugar', value: formatCurrency(secondStore?.value || 0), color: COLORS.cyan },
                { label: 'Diferença', value: formatCurrency((topStore?.value || 0) - (secondStore?.value || 0)), color: COLORS.slate }
            ]
        },
        {
            title: 'Gastos por Loja x Mês',
            canvas: drawStackedBarChart({
                title: 'Gastos por Loja x Mês',
                subtitle: 'Participação mensal das principais lojas',
                data: reportData.stackedData,
                series: reportData.topStores
            }),
            insights: insights.storeTimeline,
            metrics: [
                { label: 'Mês de pico', value: peakMonth?.month || 'Sem série', color: COLORS.blue },
                { label: 'Valor do pico', value: formatCurrency(peakMonth?.total || 0), color: COLORS.cyan },
                { label: 'Média mensal', value: formatCurrency(averageMonthValue), color: COLORS.slate }
            ]
        },
        {
            title: 'Volume Acumulado de Gastos',
            canvas: drawLineAreaChart({
                title: 'Volume Acumulado de Gastos',
                subtitle: 'Curva acumulada do gasto no intervalo filtrado',
                data: reportData.accumulatedData,
                valueKey: 'total',
                labelKey: 'date',
                lineColor: COLORS.cyan,
                fillColor: 'rgba(74, 144, 194, 0.16)',
                yFormatter: formatCurrency,
                xFormatter: formatAxisDate,
                emptyMessage: 'Sem dados suficientes'
            }),
            insights: insights.accumulated,
            metrics: [
                { label: 'Acumulado final', value: formatCurrency(totalAccumulated), color: COLORS.blue },
                { label: 'Ponto médio', value: formatCurrency(accumulatedMidPoint), color: COLORS.cyan },
                { label: 'Direção', value: reportData.temporalProjection.direction, color: COLORS.slate }
            ]
        },
        {
            title: 'Gráfico de Pareto (Top 10 Produtos)',
            canvas: drawParetoChart(reportData.paretoData),
            insights: insights.pareto,
            metrics: [
                { label: 'Produto líder', value: topParetoItem?.name || 'Sem destaque', color: COLORS.blue },
                { label: 'Top 3 acumulado', value: formatPercent(paretoTopThreeShare), color: COLORS.cyan },
                { label: 'Top 10 somados', value: formatCurrency(sum(reportData.paretoData.map((item) => item.value))), color: COLORS.slate }
            ]
        },
        {
            title: 'Top 5 Produtos Recorrentes',
            canvas: drawHorizontalBarChart({
                title: 'Top 5 Produtos Recorrentes',
                subtitle: 'Frequência de compras de cada produto e o impacto (em compras)',
                data: reportData.topRecurringProducts,
                labelKey: 'name',
                valueKey: 'recurrenceCount',
                valueFormatter: (value) => `${value} compras`,
                tickFormatter: (value) => `${Math.round(value)}`,
                barColor: COLORS.navy,
                maxBars: 5
            }),
            insights: insights.recurrentProducts,
            metrics: [
                { label: 'Produto líder', value: reportData.topRecurringProducts[0]?.name || 'Sem recorrência', color: COLORS.blue },
                { label: 'Recorrências', value: `${reportData.topRecurringProducts[0]?.recurrenceCount || 0}`, color: COLORS.cyan },
                { label: 'Impacto total', value: formatCurrency(reportData.topRecurringProducts[0]?.totalValue || 0), color: COLORS.slate }
            ]
        },
        {
            title: 'Treemap de Categorias',
            canvas: drawTreemapChart(reportData.treemapData, reportData.productTotalSpent),
            insights: insights.treemap,
            metrics: [
                { label: 'Categoria líder', value: topCategory?.name || 'Sem destaque', color: COLORS.blue },
                { label: 'Valor líder', value: formatCurrency(topCategory?.value || 0), color: COLORS.cyan },
                { label: 'Participação', value: formatPercent(topCategory?.percentage || 0), color: COLORS.slate }
            ]
        },
        {
            title: 'Gastos por Categoria (%)',
            canvas: drawHorizontalBarChart({
                title: 'Gastos por Categoria (%)',
                subtitle: 'Participação percentual das categorias no valor dos itens',
                data: reportData.categoryComposition,
                labelKey: 'name',
                valueKey: 'percentage',
                valueFormatter: formatPercent,
                tickFormatter: (value) => `${Number(value || 0).toFixed(0)}%`,
                barColor: COLORS.cyan,
                maxBars: 10
            }),
            insights: insights.categories,
            metrics: [
                { label: 'Categoria líder', value: topCategory?.name || 'Sem destaque', color: COLORS.blue },
                { label: 'Participação líder', value: formatPercent(topCategory?.percentage || 0), color: COLORS.cyan },
                { label: 'Top 3 categorias', value: formatPercent(topThreeCategoryShare), color: COLORS.slate }
            ]
        },
        {
            title: 'Histograma de Preços',
            canvas: drawVerticalBarChart({
                title: 'Histograma de Preços',
                subtitle: 'Distribuição dos itens por faixa de preço unitário',
                data: reportData.priceHistogramData,
                valueKey: 'count',
                labelKey: 'name',
                valueFormatter: (value) => `${value}`,
                tickFormatter: (value) => `${Math.round(value)}`,
                labelRotation: -Math.PI / 5
            }),
            insights: insights.priceHistogram,
            metrics: [
                { label: 'Faixa dominante', value: dominantPriceBucket?.name || 'Sem faixa', color: COLORS.blue },
                { label: 'Itens na faixa', value: `${dominantPriceBucket?.count || 0}`, color: COLORS.cyan },
                { label: 'Faixas baixas', value: formatPercent(lowPriceShare), color: COLORS.slate }
            ]
        },
        {
            title: 'Formas de Pagamento',
            canvas: drawHorizontalBarChart({
                title: 'Formas de Pagamento',
                subtitle: 'Peso financeiro de cada meio sobre o valor dos itens analisados',
                data: reportData.paymentMethodSummaryData,
                labelKey: 'name',
                valueKey: 'value',
                valueFormatter: formatCurrency,
                tickFormatter: formatCurrency,
                barColor: COLORS.navy,
                maxBars: 6
            }),
            insights: insights.paymentMethods,
            metrics: [
                { label: 'Meio líder', value: topPaymentMethod?.name || 'Sem registro', color: COLORS.blue },
                { label: 'Participação', value: formatPercent(topPaymentMethodShare), color: COLORS.cyan },
                { label: 'Maior cruzamento', value: leadingPaymentCategory ? `${leadingPaymentCategory.category} / ${leadingPaymentCategory.paymentMethod}` : 'Sem cruzamento', color: COLORS.slate }
            ]
        },
        {
            title: 'Composição por Categorias',
            canvas: drawCompositionChart(reportData.categoryComposition),
            insights: insights.composition,
            metrics: [
                { label: 'Categoria líder', value: topCategory?.name || 'Sem destaque', color: COLORS.blue },
                { label: 'Participação líder', value: formatPercent(topCategory?.percentage || 0), color: COLORS.cyan },
                { label: 'Top 3 categorias', value: formatPercent(topThreeCategoryShare), color: COLORS.slate }
            ]
        },
        {
            title: 'Fluxo Financeiro (Sankey)',
            canvas: drawFlowChart(reportData.flowData),
            insights: insights.flow,
            metrics: [
                { label: 'Fluxo líder', value: topLink ? `${topLink.source} → ${topLink.target}` : 'Sem fluxo', color: COLORS.blue },
                { label: 'Valor do fluxo', value: formatCurrency(topLink?.value || 0), color: COLORS.cyan },
                { label: 'Conexões', value: `${reportData.flowData.links.length}`, color: COLORS.slate }
            ]
        },
        {
            title: 'Mapa de Calor (Dias da Semana)',
            canvas: drawVerticalBarChart({
                title: 'Mapa de Calor (Dias da Semana)',
                subtitle: 'Incidência de compras ao longo da semana',
                data: reportData.heatmapData,
                valueKey: 'value',
                labelKey: 'name',
                valueFormatter: (value) => `${value}`,
                tickFormatter: (value) => `${Math.round(value)}`,
                labelRotation: 0,
                barColorAccessor: (item) => (
                    item.value > 5 ? '#E91E63' : item.value > 2 ? '#FF9800' : '#00E5FF'
                )
            }),
            insights: insights.heatmap,
            metrics: [
                { label: 'Dia dominante', value: dominantDay?.name || 'Sem destaque', color: COLORS.blue },
                { label: 'Registros', value: `${dominantDay?.value || 0}`, color: COLORS.cyan },
                { label: 'Fim de semana', value: formatPercent(weekendShare), color: COLORS.slate }
            ]
        },
        {
            title: 'Histograma de Frequência por Cupom',
            canvas: drawVerticalBarChart({
                title: 'Histograma de Frequência por Cupom',
                subtitle: 'Faixas de valor total por cupom fiscal',
                data: reportData.receiptHistogramData.map((item) => ({
                    name: item.label,
                    count: item.count
                })),
                valueKey: 'count',
                labelKey: 'name',
                valueFormatter: (value) => `${value}`,
                tickFormatter: (value) => `${Math.round(value)}`,
                labelRotation: -Math.PI / 5
            }),
            insights: insights.ticketHistogram,
            metrics: [
                { label: 'Faixa dominante', value: dominantTicketBucket?.label || 'Sem faixa', color: COLORS.blue },
                { label: 'Cupons na faixa', value: `${dominantTicketBucket?.count || 0}`, color: COLORS.cyan },
                { label: 'Tickets baixos', value: formatPercent(lowTicketShare), color: COLORS.slate }
            ]
        }
    ];

    chartPages.forEach((chartPage) => {
        pdf.addPage();
        addAnalyticalChartPage(pdf, insights.summary.title, chartPage.title, chartPage.canvas, chartPage.insights, chartPage.metrics);
    });

    pdf.addPage();
    addPaginatedTable({
        pdf,
        reportTitle: insights.summary.title,
        pageTitle: 'Pagamento por Categoria',
        introText: 'Matriz completa com a categoria, o meio de pagamento utilizado, o total movimentado, o volume de cupons e a participação daquela combinação dentro da própria categoria.',
        columns: [
            { label: 'Categoria', width: 170 },
            { label: 'Forma de pagamento', width: 150 },
            { label: 'Valor movimentado', width: 95 },
            { label: 'Cupons', width: 40 },
            { label: '% da categoria', width: 60 }
        ],
        rows: reportData.categoryPaymentMethodData,
        mapRow: (item) => [
            item.category,
            item.paymentMethod,
            formatCurrency(item.value),
            `${item.receiptCount}`,
            formatPercent((item.categoryShare || 0) * 100)
        ],
        emptyMessage: 'Ainda não há registros suficientes de formas de pagamento para montar a tabela analítica do período.'
    });

    addInflationOverviewPage(pdf, insights.summary.title, reportData, insights);

    pdf.addPage();
    addPaginatedTable({
        pdf,
        reportTitle: insights.summary.title,
        pageTitle: 'Inflação por Produto',
        introText: 'Tabela completa dos produtos comparáveis usados no cálculo do índice de inflação pessoal.',
        columns: [
            { label: 'Produto e contexto', width: 190 },
            { label: 'Período comparado', width: 88 },
            { label: 'Preço anterior', width: 58 },
            { label: 'Preço atual', width: 58 },
            { label: 'Variação (%)', width: 55, color: getVariationColor },
            { label: 'Impacto financeiro', width: 66 }
        ],
        rows: reportData.inflation.productInflationData,
        mapRow: (item) => [
            [
                item.name,
                `Categoria: ${item.category}`,
                item.memberNames.length > 1 ? `Base: ${item.memberNames.join(' | ')}` : ''
            ].filter(Boolean).join('\n'),
            `${formatDate(item.previousDate)}\n->\n${formatDate(item.currentDate)}`,
            formatCurrency(item.previousPrice),
            formatCurrency(item.currentPrice),
            formatSignedRatioPercent(item.inflationRate),
            formatCurrency(item.financialImpact)
        ],
        emptyMessage: 'Ainda não há produtos com pelo menos dois registros de preço em datas diferentes no período analisado.'
    });

    pdf.addPage();
    addPaginatedTable({
        pdf,
        reportTitle: insights.summary.title,
        pageTitle: 'Inflação por Categoria',
        introText: 'Agrupamento das variações de preço por categoria com base nos mesmos produtos comparáveis do índice de inflação pessoal.',
        columns: [
            { label: 'Categoria analisada', width: 230 },
            { label: 'Produtos comparáveis', width: 70 },
            { label: 'Inflação média', width: 90, color: getVariationColor },
            { label: 'Impacto financeiro', width: 125 }
        ],
        rows: reportData.inflation.categoryInflationData,
        mapRow: (item) => [
            item.name,
            `${item.comparableProducts}`,
            formatSignedRatioPercent(item.inflationRate),
            formatCurrency(item.financialImpact)
        ],
        emptyMessage: 'Ainda não há categorias com base comparável suficiente para o período analisado.'
    });

    addFooter(pdf);
    pdf.save(`relatorio-analise-consumo-${new Date().toISOString().slice(0, 10)}.pdf`);
};
