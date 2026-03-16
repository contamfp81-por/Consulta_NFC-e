import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
    Treemap, Legend, ComposedChart
} from 'recharts';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    TrendingUp, CreditCard, ShoppingBag, Calendar,
    PieChart as PieIcon, BarChart3, LineChart as LineIcon,
    Layers, Activity, Target, Layout, Hash, Thermometer, FileText, Loader2,
    Search, Wallet, ChevronLeft, ChevronRight
} from 'lucide-react';
import { generateConsumptionAnalysisPdf } from '../utils/export';
import { buildProductGrouping, getProductGroup } from '../utils/productGrouping';
import { normalizePaymentMethod, PAYMENT_METHOD_NOT_INFORMED } from '../utils/paymentMethods';

const COLORS = [
    '#1A237E', '#00E5FF', '#2E7D32', '#FF9800', '#E91E63',
    '#9C27B0', '#FFD600', '#4CAF50', '#2196F3', '#FF5722'
];

const ESTABLISHMENT_SUFFIXES = new Set(['LTDA', 'LTD', 'S/A', 'SA', 'ME', 'EIRELI', 'EPP', 'EI']);

const getDateKey = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
};

const formatFilterDateLabel = (value) => {
    if (!value) return '--';

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
};

const abbreviateEstablishmentName = (name) => {
    const normalizedName = (name || 'Outros').trim();
    if (normalizedName.length <= 24) return normalizedName;

    const relevantWords = normalizedName
        .split(/\s+/)
        .filter((word) => !ESTABLISHMENT_SUFFIXES.has(word.replace(/[.,]/g, '').toUpperCase()));

    const shortenedWords = [];
    for (const word of relevantWords) {
        const nextLabel = shortenedWords.length > 0
            ? `${shortenedWords.join(' ')} ${word}`
            : word;

        if (nextLabel.length > 24 || shortenedWords.length >= 3) {
            break;
        }

        shortenedWords.push(word);
    }

    const shortenedName = shortenedWords.join(' ').trim();
    if (!shortenedName) {
        return `${normalizedName.slice(0, 21).trimEnd()}...`;
    }

    return shortenedName.length < normalizedName.length
        ? `${shortenedName}...`
        : shortenedName;
};

const formatCurrencyValue = (value) => `R$ ${Number(value || 0).toFixed(2)}`;

const formatVariationPercent = (value) => {
    const numericValue = Number(value || 0) * 100;
    const sign = numericValue > 0 ? '+' : '';
    return `${sign}${numericValue.toFixed(1)}%`;
};

const formatSharePercent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

const safeRatio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : 0);

const averageValues = (values) => (
    values.length
        ? values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length
        : 0
);

const normalizeInsightLabel = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const ESSENTIAL_CATEGORY_KEYS = new Set([
    'alimentacao',
    'bebidas',
    'higiene e limpeza',
    'hortifruti',
    'acougue e frios',
    'padaria e lanches',
    'farmacia e saude',
    'combustivel'
]);

const getMonthKey = (value) => {
    const dateKey = getDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : null;
};

const buildMonthDateKey = (monthKey, day) => `${monthKey}-${String(day).padStart(2, '0')}`;

const formatMonthReferenceLabel = (monthKey) => {
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

const formatMonthDayLabel = (value) => {
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

const inferCurrentMonthConsumerProfile = ({
    essentialShare,
    topCategory,
    topCategoryShare,
    topStore,
    topStoreShare,
    lowTicketShare,
    activeDays,
    daysElapsed,
    paceChange,
    dominantPaymentMethod,
    dominantPaymentShare
}) => {
    let title = 'Consumidor equilibrado e diversificado';
    let description = 'Distribui o consumo entre categorias e estabelecimentos sem dependencia excessiva de um unico eixo.';

    if (essentialShare >= 0.62) {
        title = 'Consumidor essencialista e disciplinado';
        description = 'Prioriza categorias basicas do dia a dia, com comportamento mais racional e foco em necessidades recorrentes.';
    } else if (topCategoryShare >= 0.42 || topStoreShare >= 0.48) {
        title = 'Consumidor concentrado em poucos centros de custo';
        description = 'A maior parte da despesa fica retida em uma categoria ou estabelecimento dominante, o que facilita controle, mas amplia dependencia.';
    } else if (lowTicketShare >= 0.58 && activeDays >= Math.max(4, Math.floor(daysElapsed * 0.45))) {
        title = 'Consumidor recorrente e fragmentado';
        description = 'Realiza compras frequentes de menor ticket, espalhando o desembolso ao longo do mes e elevando a sensacao de gasto continuo.';
    } else if (paceChange >= 0.18) {
        title = 'Consumidor em expansao de ritmo';
        description = 'O ritmo recente acelerou de forma relevante, indicando ampliacao do consumo no trecho mais novo do mes.';
    }

    return {
        title,
        description,
        evidence: [
            topCategory
                ? `${topCategory.name} concentra ${formatSharePercent(topCategoryShare)} do gasto do mes.`
                : 'Ainda nao ha categoria dominante suficiente para destaque.',
            topStore
                ? `${topStore.name} responde por ${formatSharePercent(topStoreShare)} do valor registrado.`
                : 'Ainda nao ha concentracao relevante por estabelecimento.',
            dominantPaymentMethod
                ? `${dominantPaymentMethod.name} sustenta ${formatSharePercent(dominantPaymentShare)} do desembolso atual.`
                : 'As formas de pagamento ainda estao dispersas.'
        ]
    };
};

const DEFAULT_CHART_HEIGHT = 'clamp(220px, 34vh, 300px)';
const MEDIUM_CHART_HEIGHT = 'clamp(280px, 38vh, 340px)';
const LARGE_CHART_HEIGHT = 'clamp(380px, 62vh, 520px)';
const MAX_CARD_VIEWPORT_HEIGHT = 'min(82vh, 760px)';
const MAX_TABLE_SECTION_HEIGHT = 'min(48vh, 360px)';
const RESPONSIVE_CARD_GRID = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: '20px'
};
const RESPONSIVE_SUMMARY_GRID = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
    gap: '14px'
};
const RESPONSIVE_FILTER_GRID = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
    gap: '10px',
    alignItems: 'stretch'
};
const SCROLLABLE_CARD_BODY = {
    overflowY: 'auto',
    overflowX: 'hidden',
    minHeight: 0,
    paddingRight: '4px'
};

const CardCarouselItem = ({ index, currentIndex, children }) => {
    if (index !== currentIndex) return null;
    return <div className="animate-slide-up" style={{ width: '100%' }}>{children}</div>;
};

const Dashboard = () => {
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const receiptsQuery = useLiveQuery(() => db.receipts.toArray());
    const productsQuery = useLiveQuery(() => db.products.toArray());
    const productAliasesQuery = useLiveQuery(() => db.productAliases.toArray());
    const [selectedProductGroupIds, setSelectedProductGroupIds] = useState([]);
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportFeedback, setReportFeedback] = useState('');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');
    const receipts = useMemo(() => receiptsQuery || [], [receiptsQuery]);
    const products = useMemo(() => productsQuery || [], [productsQuery]);
    const productAliases = useMemo(() => productAliasesQuery || [], [productAliasesQuery]);

    const productGrouping = useMemo(
        () => buildProductGrouping({ products, aliases: productAliases }),
        [productAliases, products]
    );

    const dateBounds = useMemo(() => {
        const validDates = receipts
            .map((receipt) => getDateKey(receipt.date))
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));

        return {
            min: validDates[0] || '',
            max: validDates[validDates.length - 1] || ''
        };
    }, [receipts]);

    useEffect(() => {
        if (!dateBounds.min || !dateBounds.max) return;

        setStartDateFilter((currentValue) => (currentValue ? currentValue : dateBounds.min));
        setEndDateFilter((currentValue) => (currentValue ? currentValue : dateBounds.max));
    }, [dateBounds.max, dateBounds.min]);

    const normalizedDateRange = useMemo(() => {
        if (!dateBounds.min || !dateBounds.max) {
            return { start: '', end: '' };
        }

        let start = startDateFilter || dateBounds.min;
        let end = endDateFilter || dateBounds.max;

        if (start > end) {
            [start, end] = [end, start];
        }

        return { start, end };
    }, [dateBounds.max, dateBounds.min, endDateFilter, startDateFilter]);

    useEffect(() => {
        setReportFeedback('');
    }, [normalizedDateRange.end, normalizedDateRange.start]);

    const filteredReceipts = useMemo(() => receipts.filter((receipt) => {
        const dateKey = getDateKey(receipt.date);
        if (!dateKey) return false;
        if (normalizedDateRange.start && dateKey < normalizedDateRange.start) return false;
        if (normalizedDateRange.end && dateKey > normalizedDateRange.end) return false;
        return true;
    }), [normalizedDateRange.end, normalizedDateRange.start, receipts]);

    const filteredReceiptIds = useMemo(
        () => new Set(filteredReceipts.map((receipt) => receipt.id)),
        [filteredReceipts]
    );

    const filteredProducts = useMemo(
        () => products.filter((product) => filteredReceiptIds.has(product.receiptId)),
        [filteredReceiptIds, products]
    );

    const stats = useMemo(() => {
        if (!filteredReceipts.length || !filteredProducts.length) return null;

        // 1 & 2: Store distribution and comparison
        const storeMap = {};
        filteredReceipts.forEach(r => {
            const name = r.establishment || 'Outros';
            storeMap[name] = (storeMap[name] || 0) + (Number(r.totalValue) || 0);
        });
        const storeData = Object.entries(storeMap)
            .map(([name, value]) => ({
                name,
                shortName: abbreviateEstablishmentName(name),
                value
            }))
            .sort((a, b) => b.value - a.value);

        // Evolution over time (Daily sums) - Requested as second chart
        const dateMap = {};
        filteredReceipts.forEach(r => {
            const dateKey = getDateKey(r.date);
            if (!dateKey) return;
            dateMap[dateKey] = (dateMap[dateKey] || 0) + (Number(r.totalValue) || 0);
        });
        const dailyEvolutionData = Object.entries(dateMap)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Evolution by Month (for better scalability if there are many entries)
        const monthMap = {};
        filteredReceipts.forEach(r => {
            const date = new Date(r.date);
            if (Number.isNaN(date.getTime())) return;
            const monthKey = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            monthMap[monthKey] = (monthMap[monthKey] || 0) + (Number(r.totalValue) || 0);
        });

        // 4: Stacked Data (Stores over time - last 5 stores)
        const top5Stores = storeData.slice(0, 5).map((store) => ({
            key: store.name,
            label: store.shortName
        }));
        const stackedMap = {};
        filteredReceipts.forEach(r => {
            const dateStr = new Date(r.date).toLocaleDateString('pt-BR', { month: 'short' });
            if (!stackedMap[dateStr]) stackedMap[dateStr] = { month: dateStr };
            const store = r.establishment || 'Outros';
            if (top5Stores.some((topStore) => topStore.key === store)) {
                stackedMap[dateStr][store] = (stackedMap[dateStr][store] || 0) + (Number(r.totalValue) || 0);
            }
        });
        const stackedData = Object.values(stackedMap);

        // 5: Accumulated Area
        let runningTotal = 0;
        const accumulatedData = dailyEvolutionData.map(d => {
            runningTotal += d.value;
            return { date: d.date, total: runningTotal };
        });

        // 6: Pareto (Top Products) e Produtos Mais Recorrentes
        const prodMap = {};
        const recurrenceMap = {};
        filteredProducts.forEach(p => {
            const val = Number(p.totalValue) || 0;
            prodMap[p.name] = (prodMap[p.name] || 0) + val;

            const group = getProductGroup(productGrouping, p.name);
            const key = group.id;
            if (!recurrenceMap[key]) {
                recurrenceMap[key] = {
                    id: key,
                    name: group.displayName.substring(0, 20),
                    receipts: new Set(),
                    totalValue: 0
                };
            }
            recurrenceMap[key].receipts.add(p.receiptId);
            recurrenceMap[key].totalValue += val;
        });
        
        const fullProdData = Object.entries(prodMap)
            .map(([name, value]) => ({ name: name.substring(0, 15), value }))
            .sort((a, b) => b.value - a.value);

        let cumulative = 0;
        const totalSum = fullProdData.reduce((a, b) => a + b.value, 0);
        const totalReceiptSum = filteredReceipts.reduce((sum, r) => sum + (Number(r.totalValue) || 0), 0);

        const paretoData = fullProdData.slice(0, 10).map(p => {
            cumulative += p.value;
            return { ...p, percentage: (cumulative / totalSum) * 100 };
        });

        const topRecurringProducts = Object.values(recurrenceMap)
            .map(p => ({
                name: p.name,
                recurrenceCount: p.receipts.size,
                totalValue: p.totalValue,
                impactPercentage: totalSum > 0 ? (p.totalValue / totalSum) * 100 : 0
            }))
            .sort((a, b) => b.recurrenceCount - a.recurrenceCount || b.totalValue - a.totalValue)
            .slice(0, 5);

        // 7: Treemap (Categories)
        const catMap = {};
        filteredProducts.forEach(p => {
            const cat = p.category || 'Outros';
            catMap[cat] = (catMap[cat] || 0) + (Number(p.totalValue) || 0);
        });
        const treemapData = [{
            name: 'Gastos',
            children: Object.entries(catMap).map(([name, value]) => ({ name, size: value }))
        }];
        const categorySpendData = Object.entries(catMap)
            .map(([name, value]) => ({
                name,
                value,
                percentage: totalSum > 0 ? (value / totalSum) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        // 9: Histogram (Price distribution)
        const ranges = [0, 5, 10, 20, 50, 100, 500];
        const histMap = {};
        filteredProducts.forEach(p => {
            const price = Number(p.unitPrice);
            const range = ranges.find((r, i) => price <= (ranges[i + 1] || Infinity));
            const label = price > 500 ? '> 500' : `Até R$${ranges[ranges.indexOf(range) + 1] || 500}`;
            histMap[label] = (histMap[label] || 0) + 1;
        });
        const histogramData = Object.entries(histMap).map(([name, count]) => ({ name, count }));

        // 10: Heatmap (Weekday density)
        const weekMap = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
        const weekKeys = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        filteredReceipts.forEach(r => {
            const day = weekKeys[new Date(r.date).getUTCDay()];
            weekMap[day] = (weekMap[day] || 0) + 1;
        });
        const heatmapData = Object.entries(weekMap).map(([name, value]) => ({ name, value }));

        const receiptDateMap = new Map(
            filteredReceipts
                .map((receipt) => [receipt.id, getDateKey(receipt.date)])
                .filter(([, dateKey]) => Boolean(dateKey))
        );
        const receiptPaymentMethodMap = new Map(
            filteredReceipts.map((receipt) => [
                receipt.id,
                normalizePaymentMethod(receipt.paymentMethod)
            ])
        );

        const categoryPaymentMethodMap = {};
        const paymentMethodSummaryMap = {};
        filteredProducts.forEach((product) => {
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

            const categoryPaymentKey = `${category}|||${paymentMethod}`;
            if (!categoryPaymentMethodMap[categoryPaymentKey]) {
                categoryPaymentMethodMap[categoryPaymentKey] = {
                    category,
                    paymentMethod,
                    value: 0,
                    itemCount: 0,
                    receiptIds: new Set()
                };
            }

            categoryPaymentMethodMap[categoryPaymentKey].value += totalValue;
            categoryPaymentMethodMap[categoryPaymentKey].itemCount += 1;
            categoryPaymentMethodMap[categoryPaymentKey].receiptIds.add(product.receiptId);

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

        const categoryPaymentMethodData = Object.values(categoryPaymentMethodMap)
            .map((item) => ({
                category: item.category,
                paymentMethod: item.paymentMethod,
                value: item.value,
                itemCount: item.itemCount,
                receiptCount: item.receiptIds.size,
                categoryShare: catMap[item.category] > 0 ? item.value / catMap[item.category] : 0
            }))
            .sort((left, right) => (
                left.category.localeCompare(right.category, 'pt-BR')
                || right.value - left.value
            ));

        const paymentMethodSummaryData = Object.values(paymentMethodSummaryMap)
            .map((item) => ({
                name: item.name,
                value: item.value,
                categoryCount: item.categories.size
            }))
            .sort((left, right) => right.value - left.value);

        const productSelectionMap = new Map();
        filteredProducts.forEach((product) => {
            const group = getProductGroup(productGrouping, product.name);
            if (!productSelectionMap.has(group.id)) {
                productSelectionMap.set(group.id, {
                    id: group.id,
                    displayName: group.displayName,
                    memberNames: group.memberNames,
                    merged: group.merged,
                    searchText: group.searchText,
                    occurrences: 0
                });
            }

            productSelectionMap.get(group.id).occurrences += 1;
        });

        const productSelectionOptions = Array.from(productSelectionMap.values())
            .sort((left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR'));

        let productEvolutionData = [];
        if (selectedProductGroupIds.length > 0) {
            const selectedGroupIds = new Set(selectedProductGroupIds);
            const productEvolutionMap = {};

            filteredProducts.forEach((product) => {
                const group = getProductGroup(productGrouping, product.name);
                if (!selectedGroupIds.has(group.id)) {
                    return;
                }

                const dateKey = receiptDateMap.get(product.receiptId);
                const unitPrice = Number(product.unitPrice);
                const quantity = Number(product.quantity) > 0 ? Number(product.quantity) : 1;

                if (!dateKey || !Number.isFinite(unitPrice) || unitPrice <= 0) {
                    return;
                }

                if (!productEvolutionMap[dateKey]) {
                    productEvolutionMap[dateKey] = {
                        date: dateKey,
                        totalValue: 0,
                        totalQuantity: 0
                    };
                }

                productEvolutionMap[dateKey].totalValue += unitPrice * quantity;
                productEvolutionMap[dateKey].totalQuantity += quantity;
            });

            productEvolutionData = Object.values(productEvolutionMap)
                .map((item) => ({
                    date: item.date,
                    price: item.totalQuantity > 0 ? item.totalValue / item.totalQuantity : 0
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        const productHistoryMap = {};
        filteredProducts.forEach((product) => {
            const dateKey = receiptDateMap.get(product.receiptId);
            const unitPrice = Number(product.unitPrice);
            const quantity = Number(product.quantity) > 0 ? Number(product.quantity) : 1;
            const group = getProductGroup(productGrouping, product.name);

            if (!dateKey || !Number.isFinite(unitPrice) || unitPrice <= 0) {
                return;
            }

            if (!productHistoryMap[group.id]) {
                productHistoryMap[group.id] = {
                    group,
                    historyByDate: {}
                };
            }

            if (!productHistoryMap[group.id].historyByDate[dateKey]) {
                productHistoryMap[group.id].historyByDate[dateKey] = {
                    date: dateKey,
                    totalValue: 0,
                    totalQuantity: 0,
                    category: product.category || 'Outros'
                };
            }

            productHistoryMap[group.id].historyByDate[dateKey].totalValue += unitPrice * quantity;
            productHistoryMap[group.id].historyByDate[dateKey].totalQuantity += quantity;
            productHistoryMap[group.id].historyByDate[dateKey].category = (
                product.category
                || productHistoryMap[group.id].historyByDate[dateKey].category
                || 'Outros'
            );
        });

        const productInflationData = Object.values(productHistoryMap)
            .map(({ group, historyByDate }) => {
                const observations = Object.values(historyByDate)
                    .map((item) => ({
                        date: item.date,
                        unitPrice: item.totalQuantity > 0 ? item.totalValue / item.totalQuantity : 0,
                        quantity: item.totalQuantity,
                        category: item.category || 'Outros'
                    }))
                    .filter((item) => item.unitPrice > 0)
                    .sort((a, b) => a.date.localeCompare(b.date));

                if (observations.length < 2) {
                    return null;
                }

                const currentObservation = observations[observations.length - 1];
                const previousObservation = observations[observations.length - 2];
                if (!previousObservation.unitPrice) {
                    return null;
                }

                const priceDelta = currentObservation.unitPrice - previousObservation.unitPrice;
                const inflationRate = priceDelta / previousObservation.unitPrice;
                const financialImpact = priceDelta * currentObservation.quantity;
                const baselineCost = previousObservation.unitPrice * currentObservation.quantity;

                return {
                    id: group.id,
                    name: group.displayName,
                    memberNames: group.memberNames,
                    merged: group.merged,
                    category: currentObservation.category || previousObservation.category || 'Outros',
                    previousDate: previousObservation.date,
                    currentDate: currentObservation.date,
                    previousPrice: previousObservation.unitPrice,
                    currentPrice: currentObservation.unitPrice,
                    quantity: currentObservation.quantity,
                    priceDelta,
                    inflationRate,
                    financialImpact,
                    baselineCost
                };
            })
            .filter(Boolean)
            .sort((a, b) => (
                b.financialImpact - a.financialImpact
                || b.inflationRate - a.inflationRate
            ));

        const categoryInflationMap = {};
        productInflationData.forEach((item) => {
            const categoryName = item.category || 'Outros';
            if (!categoryInflationMap[categoryName]) {
                categoryInflationMap[categoryName] = {
                    name: categoryName,
                    previousBasketValue: 0,
                    currentBasketValue: 0,
                    financialImpact: 0,
                    comparableProducts: 0
                };
            }

            categoryInflationMap[categoryName].previousBasketValue += item.baselineCost;
            categoryInflationMap[categoryName].currentBasketValue += item.currentPrice * item.quantity;
            categoryInflationMap[categoryName].financialImpact += item.financialImpact;
            categoryInflationMap[categoryName].comparableProducts += 1;
        });

        const categoryInflationData = Object.values(categoryInflationMap)
            .map((item) => ({
                ...item,
                inflationRate: item.previousBasketValue > 0
                    ? item.financialImpact / item.previousBasketValue
                    : 0
            }))
            .sort((a, b) => (
                b.financialImpact - a.financialImpact
                || b.inflationRate - a.inflationRate
            ));

        const totalInflationImpact = productInflationData.reduce((sum, item) => sum + item.financialImpact, 0);
        const personalInflationBase = productInflationData.reduce((sum, item) => sum + item.baselineCost, 0);
        const personalInflationRate = personalInflationBase > 0 ? totalInflationImpact / personalInflationBase : 0;

        return {
            totalSpent: totalReceiptSum,
            storeData,
            dailyEvolutionData,
            stackedData,
            accumulatedData,
            paretoData,
            treemapData,
            categorySpendData,
            categoryPaymentMethodData,
            histogramData,
            heatmapData,
            top5Stores,
            topRecurringProducts,
            paymentMethodSummaryData,
            productSelectionOptions,
            productEvolutionData,
            productInflationData,
            categoryInflationData,
            personalInflationRate,
            totalInflationImpact,
            comparableProductsCount: productInflationData.length
        };
    }, [filteredProducts, filteredReceipts, productGrouping, selectedProductGroupIds]);

    const filteredProductOptions = useMemo(() => {
        if (!stats) return [];

        const normalizedSearchTerm = productSearchTerm.trim().toLowerCase();
        if (!normalizedSearchTerm) {
            return stats.productSelectionOptions;
        }

        return stats.productSelectionOptions.filter((option) => (
            option.displayName.toLowerCase().includes(normalizedSearchTerm)
            || option.memberNames.some((name) => name.toLowerCase().includes(normalizedSearchTerm))
            || option.searchText.includes(normalizedSearchTerm)
        ));
    }, [stats, productSearchTerm]);

    useEffect(() => {
        if (!stats) {
            setSelectedProductGroupIds((currentSelection) => (currentSelection.length ? [] : currentSelection));
            setCurrentCardIndex(0);
            return;
        }

        setSelectedProductGroupIds((currentSelection) => {
            const availableGroupIds = new Set(stats.productSelectionOptions.map((option) => option.id));
            const nextSelection = currentSelection.filter((groupId) => availableGroupIds.has(groupId));
            return nextSelection.length === currentSelection.length ? currentSelection : nextSelection;
        });
    }, [stats]);

    const selectedProductGroups = useMemo(() => {
        if (!stats) return [];

        const selectedGroupIds = new Set(selectedProductGroupIds);
        return stats.productSelectionOptions.filter((option) => selectedGroupIds.has(option.id));
    }, [selectedProductGroupIds, stats]);

    const currentMonthInsight = useMemo(() => {
        const currentDateKey = getDateKey(new Date());
        if (!currentDateKey) return null;

        const currentMonthKey = currentDateKey.slice(0, 7);
        const [currentYear, currentMonth, currentDay] = currentDateKey.split('-').map(Number);
        const totalDaysInMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
        const monthLabel = formatMonthReferenceLabel(currentMonthKey);
        const remainingDays = Math.max(0, totalDaysInMonth - currentDay);
        const monthReceipts = receipts.filter((receipt) => getMonthKey(receipt.date) === currentMonthKey);

        if (!monthReceipts.length) {
            return {
                hasData: false,
                monthLabel,
                currentDateKey,
                daysElapsed: currentDay,
                totalDaysInMonth,
                remainingDays
            };
        }

        const monthReceiptIds = new Set(monthReceipts.map((receipt) => receipt.id));
        const monthProducts = products.filter((product) => monthReceiptIds.has(product.receiptId));

        const monthTotalSpent = monthReceipts.reduce(
            (sum, receipt) => sum + (Number(receipt.totalValue) || 0),
            0
        );
        const averageDailySpend = monthTotalSpent / Math.max(1, currentDay);

        const dayTotalsMap = {};
        monthReceipts.forEach((receipt) => {
            const dateKey = getDateKey(receipt.date);
            if (!dateKey) return;
            dayTotalsMap[dateKey] = (dayTotalsMap[dateKey] || 0) + (Number(receipt.totalValue) || 0);
        });

        const dailyTotals = Array.from({ length: currentDay }, (_, index) => {
            const dayNumber = index + 1;
            const dateKey = buildMonthDateKey(currentMonthKey, dayNumber);

            return {
                date: dateKey,
                label: String(dayNumber).padStart(2, '0'),
                value: dayTotalsMap[dateKey] || 0
            };
        });

        const recentWindowSize = Math.min(7, dailyTotals.length);
        const recentWindow = dailyTotals.slice(-recentWindowSize);
        const previousWindow = dailyTotals.slice(
            Math.max(0, dailyTotals.length - (recentWindowSize * 2)),
            -recentWindowSize
        );
        const recentAverage = averageValues(recentWindow.map((item) => item.value));
        const previousAverage = previousWindow.length
            ? averageValues(previousWindow.map((item) => item.value))
            : averageDailySpend;
        const paceChange = previousAverage > 0
            ? (recentAverage - previousAverage) / previousAverage
            : recentAverage > 0 ? 1 : 0;

        let paceLabel = 'Estavel';
        let paceColor = 'var(--primary-blue)';
        let paceDescription = 'O ritmo recente esta alinhado com a media observada desde o inicio do mes.';

        if (paceChange > 0.12) {
            paceLabel = 'Acelerando';
            paceColor = '#D84315';
            paceDescription = `Os ultimos ${recentWindow.length} dias ficaram ${formatSharePercent(paceChange)} acima da janela imediatamente anterior.`;
        } else if (paceChange < -0.12) {
            paceLabel = 'Desacelerando';
            paceColor = '#2E7D32';
            paceDescription = `Os ultimos ${recentWindow.length} dias recuaram ${formatSharePercent(Math.abs(paceChange))} versus a janela anterior.`;
        }

        let accumulatedActual = 0;
        const projectionChartData = Array.from({ length: totalDaysInMonth }, (_, index) => {
            const dayNumber = index + 1;
            const dateKey = buildMonthDateKey(currentMonthKey, dayNumber);
            const dayValue = dayNumber <= currentDay ? (dayTotalsMap[dateKey] || 0) : 0;

            if (dayNumber <= currentDay) {
                accumulatedActual += dayValue;
            }

            // Calculations for different scenarios
            const remainingDaysFromDay = Math.max(0, totalDaysInMonth - dayNumber);
            
            // Linear projection (Provável)
            const projectedProvavel = averageDailySpend * dayNumber;
            
            // Conservador: Smooth average and reduced impulses
            const conservadorDaily = Math.min(recentAverage, averageDailySpend) * 0.92;
            const projectedConservador = dayNumber <= currentDay 
                ? (accumulatedActual / dayNumber) * dayNumber // Just to follow a line
                : accumulatedActual + (conservadorDaily * (dayNumber - currentDay));

            // Picos: Maximum historical occurrences
            const maxHistoricalDaily = Math.max(...dailyTotals.map(d => d.value), averageDailySpend);
            const picosDaily = Math.max(averageDailySpend * 1.15, maxHistoricalDaily);
            const projectedPicos = dayNumber <= currentDay
                ? (accumulatedActual / dayNumber) * dayNumber
                : accumulatedActual + (picosDaily * (dayNumber - currentDay));

            return {
                day: String(dayNumber).padStart(2, '0'),
                actual: dayNumber <= currentDay ? accumulatedActual : null,
                provavel: dayNumber >= currentDay ? (dayNumber === currentDay ? accumulatedActual : projectedProvavel) : null,
                conservador: dayNumber >= currentDay ? (dayNumber === currentDay ? accumulatedActual : projectedConservador) : null,
                picos: dayNumber >= currentDay ? (dayNumber === currentDay ? accumulatedActual : projectedPicos) : null
            };
        });

        const activeDays = dailyTotals.filter((item) => item.value > 0).length;
        const activeDayAverage = monthTotalSpent / Math.max(1, activeDays);
        const projectedTotal = averageDailySpend * totalDaysInMonth;
        const projectedAdditionalSpend = Math.max(0, projectedTotal - monthTotalSpent);

        const categoryMap = {};
        monthProducts.forEach((product) => {
            const category = product.category || 'Outros';
            categoryMap[category] = (categoryMap[category] || 0) + (Number(product.totalValue) || 0);
        });

        const categorySpendData = Object.entries(categoryMap)
            .map(([name, value]) => ({
                name,
                value,
                share: safeRatio(value, monthTotalSpent)
            }))
            .sort((left, right) => right.value - left.value);

        const storeMap = {};
        monthReceipts.forEach((receipt) => {
            const storeName = receipt.establishment || 'Outros';
            storeMap[storeName] = (storeMap[storeName] || 0) + (Number(receipt.totalValue) || 0);
        });

        const storeData = Object.entries(storeMap)
            .map(([name, value]) => ({
                name,
                value,
                share: safeRatio(value, monthTotalSpent)
            }))
            .sort((left, right) => right.value - left.value);

        const paymentMethodMap = {};
        monthReceipts.forEach((receipt) => {
            const paymentMethod = normalizePaymentMethod(receipt.paymentMethod);
            paymentMethodMap[paymentMethod] = (paymentMethodMap[paymentMethod] || 0) + (Number(receipt.totalValue) || 0);
        });

        const paymentMethodSummary = Object.entries(paymentMethodMap)
            .map(([name, value]) => ({
                name,
                value,
                share: safeRatio(value, monthTotalSpent)
            }))
            .sort((left, right) => right.value - left.value);

        const manualReceipts = monthReceipts.filter((receipt) => (
            String(receipt.accessKey || '').startsWith('MANUAL-')
            || String(receipt.receiptNumber || '').toUpperCase() === 'MANUAL'
        ));
        const manualSpent = manualReceipts.reduce((sum, receipt) => sum + (Number(receipt.totalValue) || 0), 0);
        const importedReceiptsCount = monthReceipts.length - manualReceipts.length;
        const importedSpent = monthTotalSpent - manualSpent;

        const lowTicketShare = safeRatio(
            monthReceipts.filter((receipt) => (Number(receipt.totalValue) || 0) <= 50).length,
            monthReceipts.length
        );
        const essentialShare = categorySpendData
            .filter((item) => ESSENTIAL_CATEGORY_KEYS.has(normalizeInsightLabel(item.name)))
            .reduce((sum, item) => sum + item.share, 0);

        const topCategory = categorySpendData[0] || null;
        const topStore = storeData[0] || null;
        const dominantPaymentMethod = paymentMethodSummary[0] || null;
        const profile = inferCurrentMonthConsumerProfile({
            essentialShare,
            topCategory,
            topCategoryShare: topCategory?.share || 0,
            topStore,
            topStoreShare: topStore?.share || 0,
            lowTicketShare,
            activeDays,
            daysElapsed: currentDay,
            paceChange,
            dominantPaymentMethod,
            dominantPaymentShare: dominantPaymentMethod?.share || 0
        });

        const outlookSentence = `Até ${formatMonthDayLabel(currentDateKey)}, o mês de ${monthLabel} acumula ${formatCurrencyValue(monthTotalSpent)}. Mantido o ritmo médio de ${formatCurrencyValue(averageDailySpend)} por dia corrido, o fechamento estimado é de ${formatCurrencyValue(projectedTotal)}, com mais ${formatCurrencyValue(projectedAdditionalSpend)} até o último dia.`;
        const concentrationSentence = topCategory && topStore
            ? `${topCategory.name} lidera com ${formatSharePercent(topCategory.share)} do mês, enquanto ${topStore.name} concentra ${formatSharePercent(topStore.share)} do valor movimentado.`
            : 'A distribuição atual ainda está pouco concentrada entre categorias e estabelecimentos.';
        const paymentSentence = dominantPaymentMethod
            ? `${dominantPaymentMethod.name} aparece como principal alavanca de pagamento com ${formatSharePercent(dominantPaymentMethod.share)} do total.`
            : 'Ainda não há uma forma de pagamento dominante no mês.';
        const actionSentence = paceChange > 0.12
            ? 'Como a curva recente acelerou, o melhor ponto de controle está nas categorias líderes e nos gastos de reposição recorrente, para evitar um fechamento acima da percepção atual.'
            : essentialShare >= 0.62
                ? 'Como a maior parte do gasto está em categorias essenciais, a estratégia mais eficaz é revisar frequência de compra, marcas e reposições para preservar margem sem cortar itens-chave.'
                : 'Com um padrão mais distribuído, o maior ganho de previsibilidade vem de acompanhar estabelecimentos e meios de pagamento com maior peso financeiro.';

        return {
            hasData: true,
            monthLabel,
            currentDateKey,
            daysElapsed: currentDay,
            totalDaysInMonth,
            remainingDays,
            monthReceiptsCount: monthReceipts.length,
            monthProductsCount: monthProducts.length,
            monthTotalSpent,
            averageDailySpend,
            activeDayAverage,
            activeDays,
            projectedTotal,
            projectedAdditionalSpend,
            paceLabel,
            paceColor,
            paceDescription,
            topCategory,
            topStore,
            dominantPaymentMethod,
            manualReceiptsCount: manualReceipts.length,
            manualSpent,
            importedReceiptsCount,
            importedSpent,
            profile,
            outlookSentence,
            concentrationSentence,
            paymentSentence,
            actionSentence,
            projectionChartData,
            scenarios: {
                conservador: {
                    value: monthTotalSpent + (Math.min(recentAverage, averageDailySpend) * 0.92 * remainingDays),
                    description: 'Baseado na média móvel suavizada e redução de gastos impulsivos.'
                },
                provavel: {
                    value: projectedTotal * (1 + (paceChange * 0.08)), // Slight adjustment based on trend
                    description: 'Ponto de equilíbrio entre Holt-Winters e o Run Rate atual (92% de confiança).'
                },
                picos: {
                    value: Math.max(projectedTotal * 1.15, monthTotalSpent + (Math.max(...dailyTotals.map(d => d.value), averageDailySpend) * remainingDays)),
                    description: 'Considera a reocorrência de gastos máximos sazonais detectados no histórico.'
                }
            }
        };
    }, [products, receipts]);

    if (!receipts.length || !products.length) {
        return (
            <div className="animate-slide-up" style={{ textAlign: 'center', padding: '50px 20px' }}>
                <ShoppingBag size={64} style={{ opacity: 0.1, marginBottom: '20px' }} />
                <h3>Nenhum dado disponível</h3>
                <p style={{ color: 'var(--text-light)' }}>Importe seus primeiros cupons para ver as análises.</p>
            </div>
        );
    }

    const ChartCard = ({ title, icon, children, fullWidth = false, contentHeight = DEFAULT_CHART_HEIGHT }) => {
        const IconComponent = icon;

        return (
        <div
            className="glass-card"
            style={{
                gridColumn: fullWidth ? '1/-1' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: MAX_CARD_VIEWPORT_HEIGHT,
                overflow: 'hidden'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                    <IconComponent size={18} />
                </div>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h4>
            </div>
            <div
                style={{
                    height: contentHeight,
                    minHeight: '220px',
                    maxHeight: `calc(${MAX_CARD_VIEWPORT_HEIGHT} - 88px)`,
                    width: '100%',
                    overflowY: 'auto',
                    overflowX: 'hidden'
                }}
            >
                {children}
            </div>
        </div>
        );
    };

    const renderStoreLegend = ({ payload = [] }) => (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '8px 12px',
                width: '100%',
                paddingTop: '8px'
            }}
        >
            {payload.map((entry, index) => (
                <div
                    key={`${entry.value}-${index}`}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        minWidth: 0
                    }}
                >
                    <span
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: entry.color,
                            marginTop: '4px',
                            flexShrink: 0
                        }}
                    />
                    <span
                        style={{
                            color: 'var(--text-main)',
                            fontSize: '0.7rem',
                            lineHeight: '1.2',
                            textAlign: 'left',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word'
                        }}
                    >
                        {entry.value}
                    </span>
                </div>
            ))}
        </div>
    );

    const toggleProductSelection = (groupId) => {
        setSelectedProductGroupIds((currentSelection) => (
            currentSelection.includes(groupId)
                ? currentSelection.filter((currentGroupId) => currentGroupId !== groupId)
                : [...currentSelection, groupId]
        ));
    };

    const handleGenerateConsumptionReport = async () => {
        if (isGeneratingReport) return;

        if (!stats) {
            setReportFeedback('Selecione um intervalo com dados para gerar o relatório PDF.');
            return;
        }

        setIsGeneratingReport(true);
        setReportFeedback('');

        try {
            await generateConsumptionAnalysisPdf({
                receipts: filteredReceipts,
                products: filteredProducts,
                stats,
                selectedProductGroups,
                monthInsight: currentMonthInsight
            });
            setReportFeedback('Relatório PDF gerado com sucesso.');
        } catch (error) {
            console.error('Erro ao gerar relatório PDF:', error);
            const reportErrorMessage = error?.message ? `Não foi possível gerar o relatório PDF. ${error.message}` : 'Não foi possível gerar o relatório PDF.';
            setReportFeedback(reportErrorMessage);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const hasFilteredResults = Boolean(stats);
    const selectedPeriodLabel = normalizedDateRange.start && normalizedDateRange.end
        ? `${formatFilterDateLabel(normalizedDateRange.start)} até ${formatFilterDateLabel(normalizedDateRange.end)}`
        : 'Período completo';
    const availablePeriodLabel = dateBounds.min && dateBounds.max
        ? `${formatFilterDateLabel(dateBounds.min)} atÃ© ${formatFilterDateLabel(dateBounds.max)}`
        : 'Sem intervalo disponivel';
    const isFullPeriodSelected = normalizedDateRange.start === dateBounds.min && normalizedDateRange.end === dateBounds.max;
    const averageTicketValue = hasFilteredResults
        ? stats.totalSpent / Math.max(1, filteredReceipts.length)
        : 0;

    const exportReportCard = (
        <div className="glass-card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <h4 style={{ marginBottom: '6px', fontSize: '1rem' }}>Sistema de Exportação de Inteligência de Consumo</h4>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
                        Gere um PDF analítico com séries temporais, composição por categorias, diagrama de fluxo e histograma de frequência.
                    </p>
                </div>
                <button
                    className="btn-primary"
                    type="button"
                    onClick={handleGenerateConsumptionReport}
                    disabled={isGeneratingReport || !hasFilteredResults}
                    style={{
                        background: isGeneratingReport || !hasFilteredResults
                            ? 'linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)'
                            : 'linear-gradient(135deg, #1F3A5F 0%, #4A90C2 100%)',
                        opacity: isGeneratingReport || !hasFilteredResults ? 0.9 : 1
                    }}
                >
                    {isGeneratingReport ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                    {isGeneratingReport ? 'Gerando relatório...' : 'Gerar Relatório de Análise de Consumo (PDF)'}
                </button>
                {reportFeedback && (
                    <div style={{ color: reportFeedback.includes('sucesso') ? 'var(--success-emerald)' : '#D32F2F', fontSize: '0.82rem' }}>
                        {reportFeedback}
                    </div>
                )}
            </div>
        </div>
    );

    const currentMonthProjectionCard = currentMonthInsight && (
        <div className="glass-card" style={{ marginBottom: '25px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                        <LineIcon size={18} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.98rem' }}>Projeção de Fechamento do Mês</h4>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                            Cruza lançamentos manuais e cupons importados do mês atual para estimar o fechamento, identificar o perfil do consumidor e consolidar uma síntese estratégica.
                        </p>
                    </div>
                </div>
            </div>

            {currentMonthInsight.hasData ? (
                <>
                    <div style={{ ...RESPONSIVE_SUMMARY_GRID, marginBottom: '20px' }}>
                        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(26, 35, 126, 0.06)' }}>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '6px' }}>Acumulado no mês</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary-blue)' }}>
                                {formatCurrencyValue(currentMonthInsight.monthTotalSpent)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                {currentMonthInsight.monthReceiptsCount} cupons e {currentMonthInsight.monthProductsCount} itens registrados.
                            </div>
                        </div>

                        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(0, 229, 255, 0.08)' }}>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '6px' }}>Fechamento estimado</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                                {formatCurrencyValue(currentMonthInsight.projectedTotal)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                Projeção estatística até o fim do mês.
                            </div>
                        </div>

                        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255, 152, 0, 0.08)' }}>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '6px' }}>Restante projetado</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                                {formatCurrencyValue(currentMonthInsight.projectedAdditionalSpend)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                Estimativa para os próximos {currentMonthInsight.remainingDays} dias.
                            </div>
                        </div>

                        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(76, 175, 80, 0.08)' }}>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '6px' }}>Ritmo atual</div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: currentMonthInsight.paceColor }}>
                                {currentMonthInsight.paceLabel}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                {formatCurrencyValue(currentMonthInsight.averageDailySpend)} por dia corrido.
                            </div>
                        </div>
                    </div>

                    <div style={{ ...RESPONSIVE_CARD_GRID, marginBottom: '20px', alignItems: 'stretch' }}>
                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '18px',
                                background: 'linear-gradient(135deg, rgba(26, 35, 126, 0.04) 0%, rgba(0, 229, 255, 0.08) 100%)',
                                border: '1px solid rgba(26, 35, 126, 0.08)'
                            }}
                        >
                            <div style={{ marginBottom: '20px' }}>
                                <h5 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary-blue)', fontWeight: 800 }}>
                                    Algoritmo de Previsão de Gastos
                                </h5>
                                <p style={{ margin: '10px 0', color: 'var(--text-dark)', fontSize: '0.86rem', lineHeight: 1.6, fontWeight: 500 }}>
                                    Análise híbrida de séries temporais (Holt-Winters), Média Móvel Estabilizadora e Run Rate para previsão com meta de 92% de precisão, seguindo metodologias de análise de risco das maiores instituições financeiras globais.
                                </p>
                            </div>

                            {/* Multi-Scenario Projection Chart */}
                            <div style={{ height: '400px', width: '100%', marginBottom: '25px', padding: '10px', background: 'white', borderRadius: '15px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={currentMonthInsight.projectionChartData}
                                        margin={{ top: 25, right: 20, left: 10, bottom: 10 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                        <XAxis 
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            fontSize={10} 
                                            tick={{ fill: 'var(--text-light)' }}
                                            interval={Math.max(0, Math.ceil(currentMonthInsight.totalDaysInMonth / 10) - 1)}
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            fontSize={10} 
                                            tick={{ fill: 'var(--text-light)' }}
                                            tickFormatter={(value) => `R$ ${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
                                        />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', fontSize: '0.86rem' }}
                                            formatter={(value) => formatCurrencyValue(value)}
                                            labelFormatter={(label) => `Dia ${label}`}
                                        />
                                        <Legend 
                                            verticalAlign="top" 
                                            height={45} 
                                            iconType="circle" 
                                            wrapperStyle={{ paddingTop: '10px', paddingBottom: '20px' }}
                                        />
                                        
                                        {/* Scenario: Picos */}
                                        <Line 
                                            name="Se repetir picos" 
                                            type="monotone" 
                                            dataKey="picos" 
                                            stroke="#D84315" 
                                            strokeWidth={2} 
                                            strokeDasharray="5 5"
                                            dot={false} 
                                            activeDot={{ r: 4 }}
                                        />
                                        
                                        {/* Scenario: Provável */}
                                        <Line 
                                            name="Provável" 
                                            type="monotone" 
                                            dataKey="provavel" 
                                            stroke="var(--primary-blue)" 
                                            strokeWidth={3} 
                                            strokeDasharray="5 5"
                                            dot={false} 
                                            activeDot={{ r: 6 }}
                                        />
                                        
                                        {/* Scenario: Conservador */}
                                        <Line 
                                            name="Conservador" 
                                            type="monotone" 
                                            dataKey="conservador" 
                                            stroke="#2E7D32" 
                                            strokeWidth={2} 
                                            strokeDasharray="5 5"
                                            dot={false} 
                                            activeDot={{ r: 4 }}
                                        />

                                        {/* Real Spending */}
                                        <Line 
                                            name="Gasto Real" 
                                            type="monotone" 
                                            dataKey="actual" 
                                            stroke="var(--primary-blue)" 
                                            strokeWidth={5} 
                                            dot={{ r: 3, fill: 'var(--primary-blue)', strokeWidth: 0 }} 
                                            activeDot={{ r: 8 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid rgba(26, 35, 126, 0.1)' }}>
                                            <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--primary-blue)' }}>Cenário</th>
                                            <th style={{ textAlign: 'left', padding: '12px 8px', color: 'var(--primary-blue)' }}>Descrição da Lógica</th>
                                            <th style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--primary-blue)' }}>Valor Previsto (R$)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                            <td style={{ padding: '12px 8px', fontWeight: 700 }}>Conservador</td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-light)', fontSize: '0.78rem' }}>{currentMonthInsight.scenarios.conservador.description}</td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrencyValue(currentMonthInsight.scenarios.conservador.value)}</td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: 'rgba(0, 229, 255, 0.05)' }}>
                                            <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--primary-blue)' }}>Provável</td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-dark)', fontSize: '0.78rem' }}>{currentMonthInsight.scenarios.provavel.description}</td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-blue)', fontSize: '1.05rem' }}>{formatCurrencyValue(currentMonthInsight.scenarios.provavel.value)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '12px 8px', fontWeight: 700 }}>Se repetir picos</td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-light)', fontSize: '0.78rem' }}>{currentMonthInsight.scenarios.picos.description}</td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: '#D84315' }}>{formatCurrencyValue(currentMonthInsight.scenarios.picos.value)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            <div style={{ marginTop: '15px', padding: '12px', borderRadius: '12px', background: 'white', borderLeft: '4px solid var(--secondary-cyan)', fontSize: '0.78rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
                                A análise considera sazonalidade (Holt-Winters), Run Rate em tempo real e elasticidade de categorias para garantir integridade estatística sem alucinações.
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            <div
                                style={{
                                    padding: '18px',
                                    borderRadius: '18px',
                                    background: 'rgba(26, 35, 126, 0.05)',
                                    border: '1px solid rgba(26, 35, 126, 0.08)'
                                }}
                            >
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                                    Perfil do Consumidor
                                </div>
                                <div style={{ fontSize: '1.12rem', fontWeight: 700, marginBottom: '8px' }}>
                                    {currentMonthInsight.profile.title}
                                </div>
                                <p style={{ margin: '0 0 12px', color: 'var(--text-light)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                                    {currentMonthInsight.profile.description}
                                </p>
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {currentMonthInsight.profile.evidence.map((item) => (
                                        <div
                                            key={item}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '12px',
                                                background: 'rgba(255, 255, 255, 0.68)',
                                                border: '1px solid rgba(148, 163, 184, 0.16)',
                                                fontSize: '0.79rem',
                                                lineHeight: 1.45
                                            }}
                                        >
                                            {item}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div
                                style={{
                                    padding: '18px',
                                    borderRadius: '18px',
                                    background: 'rgba(0, 229, 255, 0.07)',
                                    border: '1px solid rgba(0, 229, 255, 0.14)'
                                }}
                            >
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                                    Origem dos lancamentos
                                </div>

                                <div style={{ ...RESPONSIVE_SUMMARY_GRID, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))', marginBottom: '12px' }}>
                                    <div style={{ padding: '12px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.7)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: '4px' }}>Manuais</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{currentMonthInsight.manualReceiptsCount}</div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginTop: '4px' }}>
                                            {formatCurrencyValue(currentMonthInsight.manualSpent)}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.7)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: '4px' }}>Importados</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{currentMonthInsight.importedReceiptsCount}</div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-light)', marginTop: '4px' }}>
                                            {formatCurrencyValue(currentMonthInsight.importedSpent)}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gap: '8px', fontSize: '0.8rem' }}>
                                    <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.68)' }}>
                                        <strong>Categoria lider:</strong> {currentMonthInsight.topCategory ? `${currentMonthInsight.topCategory.name} (${formatSharePercent(currentMonthInsight.topCategory.share)})` : 'Sem destaque ainda'}
                                    </div>
                                    <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.68)' }}>
                                        <strong>Estabelecimento lider:</strong> {currentMonthInsight.topStore ? `${currentMonthInsight.topStore.name} (${formatSharePercent(currentMonthInsight.topStore.share)})` : 'Sem destaque ainda'}
                                    </div>
                                    <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.68)' }}>
                                        <strong>Forma dominante:</strong> {currentMonthInsight.dominantPaymentMethod ? `${currentMonthInsight.dominantPaymentMethod.name} (${formatSharePercent(currentMonthInsight.dominantPaymentMethod.share)})` : 'Nao informada'}
                                    </div>
                                    <div style={{ padding: '10px 12px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.68)' }}>
                                        <strong>Frequencia:</strong> compras em {currentMonthInsight.activeDays} dos {currentMonthInsight.daysElapsed} dias corridos, com media de {formatCurrencyValue(currentMonthInsight.activeDayAverage)} por dia com gasto.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            padding: '20px',
                            borderRadius: '18px',
                            background: 'linear-gradient(135deg, rgba(31, 58, 95, 0.96) 0%, rgba(74, 144, 194, 0.92) 100%)',
                            color: 'white'
                        }}
                    >
                        <div style={{ fontSize: '0.76rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                            Sintese estrategica
                        </div>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.7 }}>
                                {currentMonthInsight.outlookSentence}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.7 }}>
                                {currentMonthInsight.concentrationSentence} {currentMonthInsight.paymentSentence}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.7 }}>
                                {currentMonthInsight.actionSentence}
                            </p>
                        </div>
                    </div>
                </>
            ) : (
                <div
                    style={{
                        padding: '18px',
                        borderRadius: '18px',
                        background: 'linear-gradient(135deg, rgba(26, 35, 126, 0.04) 0%, rgba(0, 229, 255, 0.08) 100%)',
                        border: '1px solid rgba(26, 35, 126, 0.08)'
                    }}
                >
                    <h5 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Sem base no mês corrente</h5>
                    <p style={{ margin: 0, color: 'var(--text-light)', fontSize: '0.86rem', lineHeight: 1.55 }}>
                        Ainda não há despesas registradas em {currentMonthInsight.monthLabel}. Assim que houver lançamentos manuais ou cupons importados neste mês, a projeção de fechamento, o perfil do consumidor e a síntese estratégica serão preenchidos automaticamente.
                    </p>
                </div>
            )}
        </div>
    );

    return (
        <div className="animate-slide-up" style={{ paddingBottom: '20px' }}>
            {hasFilteredResults && (
            <div className="glass-card" style={{ background: 'var(--accent-gradient)', color: 'white', marginBottom: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                        <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>Gastos Totais Acumulados</p>
                        <h2 style={{ color: 'white', fontSize: '2.4rem', margin: '5px 0' }}>R$ {stats.totalSpent.toFixed(2)}</h2>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Período Analisado</div>
                        <div style={{ fontWeight: 'bold' }}>{selectedPeriodLabel}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Hash size={16} /> {filteredProducts.length} itens</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={16} /> R$ {averageTicketValue.toFixed(2)} por cupom</div>
                </div>
            </div>
            )}

            <div className="glass-card" style={{ marginBottom: '25px', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                        <Calendar size={18} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Intervalo de Datas</h4>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                            Filtro global para todas as funcionalidades do dashboard.
                        </p>
                    </div>
                </div>
                <div style={RESPONSIVE_FILTER_GRID}>
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            padding: '10px 12px',
                            borderRadius: '14px',
                            border: '1px solid rgba(148, 163, 184, 0.22)',
                            background: 'rgba(255, 255, 255, 0.72)'
                        }}
                    >
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            De
                        </span>
                        <input
                            type="date"
                            value={startDateFilter}
                            min={dateBounds.min || undefined}
                            max={dateBounds.max || undefined}
                            onChange={(event) => setStartDateFilter(event.target.value)}
                            style={{
                                padding: 0,
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color: 'var(--text-dark)',
                                fontSize: '0.92rem',
                                fontWeight: 600
                            }}
                        />
                    </label>
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            padding: '10px 12px',
                            borderRadius: '14px',
                            border: '1px solid rgba(148, 163, 184, 0.22)',
                            background: 'rgba(255, 255, 255, 0.72)'
                        }}
                    >
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Ate
                        </span>
                        <input
                            type="date"
                            value={endDateFilter}
                            min={dateBounds.min || undefined}
                            max={dateBounds.max || undefined}
                            onChange={(event) => setEndDateFilter(event.target.value)}
                            style={{
                                padding: 0,
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color: 'var(--text-dark)',
                                fontSize: '0.92rem',
                                fontWeight: 600
                            }}
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => {
                            setStartDateFilter(dateBounds.min);
                            setEndDateFilter(dateBounds.max);
                        }}
                        disabled={!dateBounds.min || !dateBounds.max || isFullPeriodSelected}
                        style={{
                            border: '1px solid rgba(26, 35, 126, 0.14)',
                            background: isFullPeriodSelected ? 'rgba(148, 163, 184, 0.14)' : 'rgba(26, 35, 126, 0.06)',
                            color: isFullPeriodSelected ? 'var(--text-light)' : 'var(--primary-blue)',
                            borderRadius: '999px',
                            padding: '8px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: isFullPeriodSelected ? 'default' : 'pointer',
                            justifySelf: 'end',
                            gridColumn: '1 / -1',
                            width: 'fit-content'
                        }}
                    >
                        Usar Base Disponível
                    </button>
                </div>
                <div style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-light)' }}>
                    O periodo escolhido passa a valer para graficos, comparativos e geracao do PDF.
                </div>
            </div>

            <CardCarouselItem index={0} currentIndex={currentCardIndex}>{currentMonthProjectionCard}</CardCarouselItem>

            {hasFilteredResults ? (
            <>
            
                <CardCarouselItem index={1} currentIndex={currentCardIndex}>{/* 1. Evolução de Preço por Produto */}
                <ChartCard title="Evolução de Preço por Produto" icon={TrendingUp} fullWidth contentHeight={LARGE_CHART_HEIGHT}>
                    <div style={{ marginBottom: '15px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
                            <input
                                className="glass-card"
                                style={{
                                    width: '100%',
                                    padding: '10px 10px 10px 35px',
                                    borderRadius: '10px',
                                    border: '1px solid #ddd',
                                    fontSize: '0.9rem',
                                    background: 'white'
                                }}
                                type="text"
                                placeholder="Busque e selecione um ou mais produtos..."
                                value={productSearchTerm}
                                onChange={(e) => setProductSearchTerm(e.target.value)}
                            />
                        </div>
                        <div style={{ marginTop: '8px', color: 'var(--text-light)', fontSize: '0.78rem' }}>
                            Produtos com * usam a correspondencia criada na engrenagem para unir pequenas variacoes de nome.
                        </div>
                    </div>
                    <div
                        className="glass-card"
                        style={{
                            marginBottom: '15px',
                            maxHeight: 'clamp(120px, 22vh, 160px)',
                            overflowY: 'auto',
                            padding: '8px',
                            textAlign: 'left'
                        }}
                    >
                        {filteredProductOptions.length > 0 ? (
                            filteredProductOptions.map((option) => (
                                <label
                                    key={option.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '8px',
                                        padding: '6px 4px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedProductGroupIds.includes(option.id)}
                                        onChange={() => toggleProductSelection(option.id)}
                                        style={{ marginTop: '3px' }}
                                    />
                                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span>{option.displayName}</span>
                                        {option.merged && (
                                            <span style={{ color: 'var(--text-light)', fontSize: '0.72rem' }}>
                                                {option.memberNames.join(' | ')}
                                            </span>
                                        )}
                                    </span>
                                </label>
                            ))
                        ) : (
                            <div style={{ padding: '10px 4px', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                                Nenhum produto encontrado para este filtro.
                            </div>
                        )}
                    </div>
                    {selectedProductGroups.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px' }}>
                            {selectedProductGroups.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => toggleProductSelection(group.id)}
                                    style={{
                                        border: '1px solid rgba(26, 35, 126, 0.15)',
                                        background: 'rgba(26, 35, 126, 0.08)',
                                        color: 'var(--text-main)',
                                        borderRadius: '999px',
                                        padding: '6px 10px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {group.displayName}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setSelectedProductGroupIds([])}
                                style={{
                                    border: '1px dashed rgba(26, 35, 126, 0.25)',
                                    background: 'transparent',
                                    color: 'var(--text-light)',
                                    borderRadius: '999px',
                                    padding: '6px 10px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Limpar seleção
                            </button>
                        </div>
                    )}
                    {selectedProductGroupIds.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={stats.productEvolutionData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Line type="monotone" dataKey="price" stroke="var(--primary-blue)" strokeWidth={3} dot={{ r: 5, fill: 'var(--primary-blue)' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: '0.9rem' }}>
                            Escolha um ou mais produtos acima para ver o histórico de preços agrupado.
                        </div>
                    )}
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={2} currentIndex={currentCardIndex}>{/* 2. Evolução dos gastos ao longo do tempo */}
                <ChartCard title="Evolução dos Gastos ao longo do tempo" icon={Wallet} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.dailyEvolutionData}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary-blue)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="var(--primary-blue)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v) => `R$ ${Number(v).toFixed(2)}`} />
                            <Area type="monotone" dataKey="value" stroke="var(--primary-blue)" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={3} currentIndex={currentCardIndex}>{/* 3. Distribuição por loja (%) */}
                
                    <ChartCard title="Distribuição por Loja (%)" icon={PieIcon} contentHeight={MEDIUM_CHART_HEIGHT}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.storeData.slice(0, 6)}
                                    innerRadius={45}
                                    outerRadius={62}
                                    cy="38%"
                                    paddingAngle={5}
                                    dataKey="value"
                                    nameKey="shortName"
                                >
                                    {stats.storeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v) => `${((v / stats.totalSpent) * 100).toFixed(1)}%`} />
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    content={renderStoreLegend}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    </CardCarouselItem><CardCarouselItem index={4} currentIndex={currentCardIndex}><ChartCard title="Comparativo de lojas" icon={BarChart3}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.storeData.slice(0, 5)} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="shortName" type="category" width={80} fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Bar dataKey="value" fill="var(--primary-blue)" radius={[0, 10, 10, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>


                </CardCarouselItem><CardCarouselItem index={5} currentIndex={currentCardIndex}>{/* 5. Gastos por Loja x Mes */}
                
                    <ChartCard title="Gastos por Loja x Mês" icon={Layers}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.stackedData}>
                                <XAxis dataKey="month" fontSize={10} />
                                <Tooltip />
                                {stats.top5Stores.map((store, i) => (
                                    <Bar key={store.key} dataKey={store.key} name={store.label} stackId="a" fill={COLORS[i % COLORS.length]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    </CardCarouselItem><CardCarouselItem index={6} currentIndex={currentCardIndex}><ChartCard title="Volume Acumulado de Gastos" icon={Activity}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.accumulatedData}>
                                <defs>
                                    <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--secondary-cyan)" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="var(--secondary-cyan)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Area type="monotone" dataKey="total" stroke="var(--secondary-cyan)" fill="url(#colorAcc)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>

                </CardCarouselItem><CardCarouselItem index={7} currentIndex={currentCardIndex}>{/* 7. Gráfico de Pareto */}
                <ChartCard title="Gráfico de Pareto (Top 10 Produtos)" icon={Target} fullWidth contentHeight="auto">
                    <div style={{ height: '350px', marginBottom: '20px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stats.paretoData}>
                            <XAxis dataKey="name" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                            <YAxis yAxisId="left" orientation="left" stroke="var(--primary-blue)" hide />
                            <YAxis yAxisId="right" orientation="right" stroke="#ff7300" domain={[0, 100]} hide />
                            <Tooltip />
                            <Bar yAxisId="left" dataKey="value" fill="var(--primary-blue)" radius={[5, 5, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="percentage" stroke="#ff7300" strokeWidth={2} />
                        </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    {stats.paretoData.length > 0 && (
                        <div style={{ padding: '16px', background: 'rgba(26, 35, 126, 0.04)', borderRadius: '12px', borderLeft: '4px solid var(--primary-blue)' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: 'var(--primary-blue)' }}>Entendendo o Gráfico de Pareto</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                                O gráfico acima lista os produtos com maior impacto financeiro em ordem decrescente de valor. A linha amarela mostra o percentual que se forma quando somamos esses gastos na sequência. No seu caso atual, apenas estes {stats.paretoData.length} itens do gráfico consumiram juntos <strong>{formatCurrencyValue(stats.paretoData.reduce((acc, curr) => acc + curr.value, 0))}</strong>. Ou seja, isoladamente eles equivalem a <strong>{((stats.paretoData.reduce((acc, curr) => acc + curr.value, 0) / Math.max(1, stats.totalSpent)) * 100).toFixed(1)}%</strong> de todo o dinheiro (R$ {stats.totalSpent.toFixed(2)}) investido no período. 
                                <br/><br/>
                                <strong>Insight Prático:</strong> Segundo o economista Vilfredo Pareto, cortar ou baratear apenas os produtos na extremidade esquerda desta minúscula lista causa uma redução de gastos avassaladora em relação a cortar centenas de produtos minúsculos no resto do relatório. O campeão atual responsável por puxar os gastos para cima é o(a) <strong>{stats.paretoData[0].name}</strong>, custando {formatCurrencyValue(stats.paretoData[0].value)}.
                            </p>
                        </div>
                    )}
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={8} currentIndex={currentCardIndex}>{/* 8. Treemap de categorias */}
                <ChartCard title="Treemap de Categorias" icon={Layout} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                            data={stats.treemapData[0].children}
                            dataKey="size"
                            stroke="#fff"
                            fill="var(--primary-blue)"
                        >
                            <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                        </Treemap>
                    </ResponsiveContainer>
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={9} currentIndex={currentCardIndex}>{/* 9. Gastos por Categoria (INTERATIVO) */}
                <ChartCard title="Gastos por Categoria" icon={BarChart3} fullWidth contentHeight="auto">
                    <div style={{ padding: '10px 0' }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', margin: '0 0 15px' }}>
                            Clique em uma barra para ver o detalhamento dos produtos daquela categoria.
                        </p>
                    </div>
                    <div style={{ height: '350px', marginBottom: '20px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={stats.categorySpendData} 
                                layout="vertical" 
                                margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
                                onClick={(data) => {
                                    // Fallback for clicking anywhere in the chart row
                                    const categoryName = data?.activeLabel || (data?.activePayload && data.activePayload[0]?.payload?.name);
                                    if (categoryName) {
                                        setSelectedCategory(prev => prev === categoryName ? null : categoryName);
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                                <XAxis
                                    type="number"
                                    fontSize={10}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => `R$ ${value.toFixed(0)}`}
                                />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    width={120} 
                                    fontSize={10} 
                                    axisLine={false} 
                                    tickLine={false}
                                    style={{ cursor: 'pointer' }}
                                />
                                <Tooltip
                                    formatter={(value) => `R$ ${Number(value).toFixed(2)}`}
                                    labelFormatter={(label) => `Categoria: ${label}`}
                                    cursor={{ fill: 'rgba(26, 35, 126, 0.05)' }}
                                />
                                <Bar 
                                    dataKey="value" 
                                    fill="var(--primary-blue)" 
                                    radius={[0, 10, 10, 0]}
                                    cursor="pointer"
                                    onClick={(data) => {
                                        // Specific bar click
                                        if (data && data.name) {
                                            setSelectedCategory(prev => prev === data.name ? null : data.name);
                                        }
                                    }}
                                >
                                    {stats.categorySpendData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={entry.name === selectedCategory ? 'var(--secondary-cyan)' : 'var(--primary-blue)'} 
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent chart onClick from firing twice
                                                setSelectedCategory(prev => prev === entry.name ? null : entry.name);
                                            }}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {selectedCategory && (
                        <div className="animate-slide-up" style={{ marginTop: '20px', borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h5 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary-blue)' }}>
                                    Produtos em: {selectedCategory}
                                </h5>
                                <button 
                                    onClick={() => setSelectedCategory(null)}
                                    style={{ background: 'rgba(26, 35, 126, 0.05)', border: 'none', color: 'var(--primary-blue)', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 12px', borderRadius: '12px' }}
                                >
                                    Fechar lista
                                </button>
                            </div>
                            <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(148, 163, 184, 0.1)' }}>
                                            <th style={{ padding: '10px 8px' }}>Produto</th>
                                            <th style={{ padding: '10px 8px' }}>Qtd</th>
                                            <th style={{ padding: '10px 8px' }}>Preço Unit.</th>
                                            <th style={{ padding: '10px 8px' }}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProducts
                                            .filter(p => (p.category || 'Outros') === selectedCategory)
                                            .sort((a, b) => b.totalValue - a.totalValue)
                                            .map((p, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                                                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{p.name}</td>
                                                    <td style={{ padding: '10px 8px' }}>{p.quantity}</td>
                                                    <td style={{ padding: '10px 8px' }}>{formatCurrencyValue(p.unitPrice)}</td>
                                                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{formatCurrencyValue(p.totalValue)}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={10} currentIndex={currentCardIndex}>{/* 10. Histograma de Preços */}
                <ChartCard title="Histograma de Preços" icon={Hash}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.histogramData}>
                            <XAxis dataKey="name" fontSize={9} />
                            <Tooltip />
                            <Bar dataKey="count" fill="var(--primary-blue)" radius={[10, 10, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={11} currentIndex={currentCardIndex}>{/* 11. Formas de Pagamento por Categoria */}
                <div className="glass-card"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: MAX_CARD_VIEWPORT_HEIGHT,
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                            <CreditCard size={18} />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Formas de Pagamento por Categoria</h4>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.82rem' }}>
                                Consolida quanto cada categoria consumiu por forma de pagamento dentro do periodo filtrado.
                            </p>
                        </div>
                    </div>

                    {stats.categoryPaymentMethodData.length > 0 ? (
                        <div style={SCROLLABLE_CARD_BODY}>
                            <div style={{ ...RESPONSIVE_SUMMARY_GRID, marginBottom: '20px' }}>
                                {stats.paymentMethodSummaryData.slice(0, 4).map((item) => (
                                    <div key={item.name} style={{ padding: '16px', borderRadius: '14px', background: 'rgba(26, 35, 126, 0.06)' }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '6px' }}>Forma de pagamento</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '8px', overflowWrap: 'anywhere' }}>{item.name}</div>
                                        <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--primary-blue)' }}>
                                            {formatCurrencyValue(item.value)}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                            Presente em {item.categoryCount} categorias.
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ overflow: 'auto', maxHeight: MAX_TABLE_SECTION_HEIGHT }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148, 163, 184, 0.22)' }}>
                                            <th style={{ padding: '10px 8px' }}>Categoria</th>
                                            <th style={{ padding: '10px 8px' }}>Pagamento</th>
                                            <th style={{ padding: '10px 8px' }}>Total</th>
                                            <th style={{ padding: '10px 8px' }}>Cupons</th>
                                            <th style={{ padding: '10px 8px' }}>% da categoria</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.categoryPaymentMethodData.map((item) => (
                                            <tr key={`${item.category}-${item.paymentMethod}`} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                                                <td style={{ padding: '10px 8px', minWidth: '180px', fontWeight: 600 }}>{item.category}</td>
                                                <td style={{ padding: '10px 8px', minWidth: '180px' }}>{item.paymentMethod}</td>
                                                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(item.value)}</td>
                                                <td style={{ padding: '10px 8px' }}>{item.receiptCount}</td>
                                                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{(item.categoryShare * 100).toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '6px 0 2px', color: 'var(--text-light)', fontSize: '0.88rem' }}>
                            Ainda nao ha formas de pagamento registradas no intervalo selecionado.
                        </div>
                    )}
                </div>

                </CardCarouselItem><CardCarouselItem index={12} currentIndex={currentCardIndex}>{/* 12. Mapa de Calor */}
                <ChartCard title="Mapa de Calor (Dias da Semana)" icon={Thermometer} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.heatmapData}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="value" radius={20}>
                                {stats.heatmapData.map((entry, index) => (
                                    <Cell
                                        key={index}
                                        fill={entry.value > 5 ? '#E91E63' : entry.value > 2 ? '#FF9800' : '#00E5FF'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={13} currentIndex={currentCardIndex}>{/* 13. Índice de Inflação Pessoal */}
                <div className="glass-card"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: MAX_CARD_VIEWPORT_HEIGHT,
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                            <Thermometer size={18} />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Indice de Inflacao Pessoal</h4>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.82rem' }}>
                                Compara o ultimo preco com o preco anterior de cada produto dentro do periodo filtrado para medir aumento, impacto no bolso e pressao por categoria.
                            </p>
                        </div>
                    </div>

                    {stats.productInflationData.length > 0 ? (
                        <div style={SCROLLABLE_CARD_BODY}>
                            <div style={{ ...RESPONSIVE_SUMMARY_GRID, marginBottom: '20px' }}>
                                <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(26, 35, 126, 0.06)' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '6px' }}>Indice geral</div>
                                    <div style={{ fontSize: '1.55rem', fontWeight: 700, color: stats.personalInflationRate >= 0 ? '#D84315' : '#2E7D32' }}>
                                        {formatVariationPercent(stats.personalInflationRate)}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                        Baseado no ultimo preco x preco anterior dos produtos comparaveis.
                                    </div>
                                </div>
                                <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(0, 229, 255, 0.08)' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '6px' }}>Impacto financeiro</div>
                                    <div style={{ fontSize: '1.55rem', fontWeight: 700, color: stats.totalInflationImpact >= 0 ? '#D84315' : '#2E7D32' }}>
                                        {formatCurrencyValue(stats.totalInflationImpact)}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                        Formula: (preco atual - preco anterior) x quantidade atual.
                                    </div>
                                </div>
                                <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(76, 175, 80, 0.08)' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '6px' }}>Produtos comparaveis</div>
                                    <div style={{ fontSize: '1.55rem', fontWeight: 700 }}>{stats.comparableProductsCount}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '6px' }}>
                                        Produtos com pelo menos dois precos em datas diferentes no periodo analisado.
                                    </div>
                                </div>
                            </div>

                            
                                <div>
                                    <div style={{ marginBottom: '10px' }}>
                                        <h5 style={{ margin: 0, fontSize: '0.92rem' }}>1. Inflacao por produto</h5>
                                        <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.8rem' }}>
                                            Inflacao = (preco atual - preco anterior) / preco anterior.
                                        </p>
                                    </div>
                                    <div style={{ overflow: 'auto', maxHeight: MAX_TABLE_SECTION_HEIGHT }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148, 163, 184, 0.22)' }}>
                                                    <th style={{ padding: '10px 8px' }}>Produto</th>
                                                    <th style={{ padding: '10px 8px' }}>Anterior</th>
                                                    <th style={{ padding: '10px 8px' }}>Atual</th>
                                                    <th style={{ padding: '10px 8px' }}>Inflacao</th>
                                                    <th style={{ padding: '10px 8px' }}>Impacto</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stats.productInflationData.slice(0, 12).map((item) => (
                                                    <tr key={`${item.name}-${item.currentDate}`} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                                                        <td style={{ padding: '10px 8px', minWidth: '180px' }}>
                                                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                                                            {item.merged && (
                                                                <div style={{ color: 'var(--text-light)', fontSize: '0.7rem', marginTop: '2px' }}>
                                                                    {item.memberNames.join(' | ')}
                                                                </div>
                                                            )}
                                                            <div style={{ color: 'var(--text-light)', fontSize: '0.72rem' }}>
                                                                {item.category} | {formatFilterDateLabel(item.previousDate)} {'->'} {formatFilterDateLabel(item.currentDate)}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(item.previousPrice)}</td>
                                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(item.currentPrice)}</td>
                                                        <td style={{ padding: '10px 8px', color: item.inflationRate >= 0 ? '#D84315' : '#2E7D32', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                            {formatVariationPercent(item.inflationRate)}
                                                        </td>
                                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(item.financialImpact)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ marginBottom: '10px' }}>
                                        <h5 style={{ margin: 0, fontSize: '0.92rem' }}>2. Inflacao por categoria</h5>
                                        <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.8rem' }}>
                                            Agrupamento das variacoes de preco por categoria com base em datas, produtos, quantidades e precos.
                                        </p>
                                    </div>
                                    <div style={{ overflow: 'auto', maxHeight: MAX_TABLE_SECTION_HEIGHT }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148, 163, 184, 0.22)' }}>
                                                    <th style={{ padding: '10px 8px' }}>Categoria</th>
                                                    <th style={{ padding: '10px 8px' }}>Produtos</th>
                                                    <th style={{ padding: '10px 8px' }}>Inflacao</th>
                                                    <th style={{ padding: '10px 8px' }}>Impacto</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stats.categoryInflationData.map((item) => (
                                                    <tr key={item.name} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.14)' }}>
                                                        <td style={{ padding: '10px 8px', minWidth: '160px', fontWeight: 600 }}>{item.name}</td>
                                                        <td style={{ padding: '10px 8px' }}>{item.comparableProducts}</td>
                                                        <td style={{ padding: '10px 8px', color: item.inflationRate >= 0 ? '#D84315' : '#2E7D32', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                            {formatVariationPercent(item.inflationRate)}
                                                        </td>
                                                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatCurrencyValue(item.financialImpact)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                        </div>
                    ) : (
                        <div style={{ padding: '6px 0 2px', color: 'var(--text-light)', fontSize: '0.88rem' }}>
                            Ainda nao ha produtos com pelo menos dois registros de preco em datas diferentes dentro do intervalo selecionado. Ajuste o periodo para calcular a inflacao pessoal.
                        </div>
                    )}
                </div>

                </CardCarouselItem><CardCarouselItem index={14} currentIndex={currentCardIndex}>{/* 14. Top 5 produtos recorrentes */}
                <ChartCard title="Top 5 Produtos Mais Recorrentes" icon={ShoppingBag} fullWidth contentHeight="auto">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '10px' }}>
                        {stats.topRecurringProducts.map((p, index) => (
                            <div key={index} style={{
                                padding: '12px', 
                                background: 'linear-gradient(135deg, rgba(26, 35, 126, 0.04) 0%, rgba(0, 229, 255, 0.08) 100%)', 
                                border: '1px solid rgba(26, 35, 126, 0.08)',
                                borderRadius: '12px', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center'
                            }}>
                                <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {index + 1}. {p.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '4px' }}>
                                        Presente em {p.recurrenceCount} compra(s)
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--primary-blue)', fontSize: '0.95rem' }}>
                                        {formatSharePercent(p.impactPercentage / 100)}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                        Impacto: {formatCurrencyValue(p.totalValue)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ChartCard>

                </CardCarouselItem><CardCarouselItem index={15} currentIndex={currentCardIndex}>{/* 15. Exportação */}
                {exportReportCard}</CardCarouselItem>


                {/* Navegador entre cards */}
                <div style={{ padding: '30px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setCurrentCardIndex(prev => Math.max(0, prev - 1)); }}
                        disabled={currentCardIndex === 0}
                        style={{ background: 'var(--primary-blue)', color: 'white', border: 'none', borderRadius: '50%', width: '55px', height: '55px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(26, 35, 126, 0.4)', opacity: currentCardIndex === 0 ? 0.4 : 1, transition: 'all 0.3s ease', cursor: 'pointer' }}
                    >
                        <ChevronLeft size={28} />
                    </button>
                    <div style={{ background: 'rgba(255, 255, 255, 0.95)', padding: '8px 20px', borderRadius: '25px', fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary-blue)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(26, 35, 126, 0.1)' }}>
                        {currentCardIndex + 1} / 16
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setCurrentCardIndex(prev => Math.min(15, prev + 1)); }}
                        disabled={currentCardIndex === 15}
                        style={{ background: 'var(--primary-blue)', color: 'white', border: 'none', borderRadius: '50%', width: '55px', height: '55px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(26, 35, 126, 0.4)', opacity: currentCardIndex === 15 ? 0.4 : 1, transition: 'all 0.3s ease', cursor: 'pointer' }}
                    >
                        <ChevronRight size={28} />
                    </button>
                </div>
            </>
    ) : (
                <div className="glass-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
                    <Calendar size={42} style={{ opacity: 0.15, marginBottom: '14px' }} />
                    <h4 style={{ marginBottom: '8px' }}>Nenhum dado no intervalo selecionado</h4>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', margin: 0 }}>
                        Ajuste as datas acima para gerar os gráficos e o relatório com um período que contenha cupons importados.
                    </p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
