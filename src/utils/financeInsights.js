import { normalizePaymentMethod, PAYMENT_METHOD_NOT_INFORMED } from './paymentMethods';
import { buildProductGrouping, getProductGroup } from './productGrouping';
import { construirIndiceSaudeFinanceira } from './financialHealth';
import { withInsightWhy } from './insightNarrative';
import {
    getMonthKey as getSharedMonthKey,
    getPreviousMonthKey as getSharedPreviousMonthKey,
    toLocalDate,
    toLocalDateKey
} from './date';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HEALTH_SCORE = 68;
export const OPPORTUNITY_SEEN_SIGNATURE_STORAGE_KEY = 'opportunity-view:last-seen-signature';

const FIXED_MONTHLY_CATEGORY_KEYS = new Set([
    'energia eletrica',
    'agua e saneamento',
    'internet',
    'telefone'
]);

const CREDIT_METHOD_KEYS = ['cartao de credito', 'boleto'];
const POSITIVE_METHOD_KEYS = ['pix', 'dinheiro', 'cartao de debito', 'transferencia'];
const WEEKDAY_OPTIONS = [
    { index: 0, shortLabel: 'Dom', fullLabel: 'Domingo' },
    { index: 1, shortLabel: 'Seg', fullLabel: 'Segunda-feira' },
    { index: 2, shortLabel: 'Ter', fullLabel: 'Terca-feira' },
    { index: 3, shortLabel: 'Qua', fullLabel: 'Quarta-feira' },
    { index: 4, shortLabel: 'Qui', fullLabel: 'Quinta-feira' },
    { index: 5, shortLabel: 'Sex', fullLabel: 'Sexta-feira' },
    { index: 6, shortLabel: 'Sab', fullLabel: 'Sabado' }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeLabelKey = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const toDate = (value) => toLocalDate(value);

export const getDateKey = (value) => {
    return toLocalDateKey(value) || '';
};

const getMonthKey = (value) => getSharedMonthKey(value);

const getPreviousMonthKey = (value) => getSharedPreviousMonthKey(value);

const getDaysInMonth = (date) => {
    const safeDate = toDate(date);
    if (!safeDate) return 30;
    return new Date(safeDate.getFullYear(), safeDate.getMonth() + 1, 0).getDate();
};

const sumValues = (items = [], selector = (item) => item) => (
    items.reduce((total, item) => total + (Number(selector(item)) || 0), 0)
);

const sortByValueDesc = (items = []) => (
    items.slice().sort((left, right) => (Number(right.value) || 0) - (Number(left.value) || 0))
);

const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'pt-BR');

export const isManualReceipt = (receipt = {}) => (
    String(receipt.accessKey || '').startsWith('MANUAL-')
    || String(receipt.receiptNumber || '').toUpperCase() === 'MANUAL'
);

export const isPixSyntheticReceipt = (receipt = {}) => (
    Boolean(receipt.isPixSynthetic)
    || String(receipt.accessKey || '').startsWith('PIX-')
    || String(receipt.receiptNumber || '').toUpperCase() === 'PIX'
);

export const summarizeReceiptsByOrigin = (receipts = []) => receipts.reduce((summary, receipt) => {
    const receiptTotal = Number(receipt?.totalValue) || 0;

    summary.totalCount += 1;
    summary.totalSpend += receiptTotal;

    if (isPixSyntheticReceipt(receipt)) {
        summary.pixCount += 1;
        summary.pixSpent += receiptTotal;
        return summary;
    }

    if (isManualReceipt(receipt)) {
        summary.manualReceiptsCount += 1;
        summary.manualSpent += receiptTotal;
        return summary;
    }

    summary.importedReceiptsCount += 1;
    summary.importedSpent += receiptTotal;
    return summary;
}, {
    totalCount: 0,
    totalSpend: 0,
    importedReceiptsCount: 0,
    importedSpent: 0,
    manualReceiptsCount: 0,
    manualSpent: 0,
    pixCount: 0,
    pixSpent: 0
});

const buildStatus = (score) => {
    if (score >= 82) {
        return {
            label: 'Excelente',
            tone: 'positive',
            description: 'Ritmo de gastos equilibrado e bem distribuido no periodo.'
        };
    }

    if (score >= 68) {
        return {
            label: 'Estavel',
            tone: 'neutral',
            description: 'Os gastos estao controlados, com alguns pontos de atencao.'
        };
    }

    return {
        label: 'Atencao',
        tone: 'negative',
        description: 'O periodo mostra concentracao ou aceleracao relevante das saidas.'
    };
};

const buildVariation = (currentValue, previousValue) => {
    if (previousValue <= 0) {
        return {
            value: 0,
            direction: 'neutral',
            label: 'Sem base anterior'
        };
    }

    const ratio = (currentValue - previousValue) / previousValue;
    return {
        value: ratio,
        direction: ratio > 0.01 ? 'up' : ratio < -0.01 ? 'down' : 'neutral',
        label: `${ratio > 0 ? '+' : ''}${(ratio * 100).toFixed(1)}% vs mes anterior`
    };
};

const buildTransactionSourceLabel = (transaction) => {
    if (transaction.type === 'pix') {
        return 'Pix';
    }

    return transaction.paymentMethod !== PAYMENT_METHOD_NOT_INFORMED
        ? transaction.paymentMethod
        : 'Cupom';
};

const buildTransactions = ({ receipts = [], pixExpenses = [] }) => {
    const receiptTransactions = receipts.map((receipt) => ({
        id: `receipt-${receipt.id}`,
        type: 'receipt',
        title: receipt.establishment || 'Cupom fiscal',
        subtitle: receipt.paymentMethod || PAYMENT_METHOD_NOT_INFORMED,
        amount: Number(receipt.totalValue) || 0,
        date: receipt.date,
        dateKey: getDateKey(receipt.date),
        monthKey: getMonthKey(receipt.date),
        paymentMethod: normalizePaymentMethod(receipt.paymentMethod),
        origin: 'cupom',
        isPartial: Boolean(receipt.isPartial)
    }));

    const pixTransactions = pixExpenses.map((expense) => ({
        id: `pix-${expense.id}`,
        type: 'pix',
        title: expense.receiver || 'Despesa Pix',
        subtitle: expense.category || 'Outros',
        amount: Number(expense.value) || 0,
        date: expense.date,
        dateKey: getDateKey(expense.date),
        monthKey: getMonthKey(expense.date),
        paymentMethod: 'Pix',
        origin: 'pix',
        isPartial: false
    }));

    return [...receiptTransactions, ...pixTransactions]
        .filter((transaction) => transaction.dateKey)
        .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
};

const buildCurrentMonthCategoryData = ({ receiptMap, products = [], pixExpenses = [], currentMonthKey }) => {
    const totals = new Map();

    products.forEach((product) => {
        const receipt = receiptMap.get(product.receiptId);
        if (!receipt || getMonthKey(receipt.date) !== currentMonthKey) {
            return;
        }

        const label = product.category || 'Outros';
        totals.set(label, (totals.get(label) || 0) + (Number(product.totalValue) || 0));
    });

    pixExpenses.forEach((expense) => {
        if (getMonthKey(expense.date) !== currentMonthKey) {
            return;
        }

        const label = expense.category || 'Outros';
        totals.set(label, (totals.get(label) || 0) + (Number(expense.value) || 0));
    });

    return sortByValueDesc(
        Array.from(totals.entries()).map(([name, value]) => ({
            name,
            value,
            key: normalizeLabelKey(name)
        }))
    );
};

const buildPaymentData = (transactions = [], monthKey) => {
    const totals = new Map();

    transactions.forEach((transaction) => {
        if (transaction.monthKey !== monthKey) {
            return;
        }

        const label = normalizePaymentMethod(transaction.paymentMethod);
        totals.set(label, (totals.get(label) || 0) + (Number(transaction.amount) || 0));
    });

    return sortByValueDesc(
        Array.from(totals.entries()).map(([name, value]) => ({
            name,
            value,
            key: normalizeLabelKey(name)
        }))
    );
};

const buildMerchantData = (transactions = [], monthKey) => {
    const totals = new Map();

    transactions.forEach((transaction) => {
        if (transaction.monthKey !== monthKey) {
            return;
        }

        const label = transaction.title || 'Outros';
        totals.set(label, (totals.get(label) || 0) + (Number(transaction.amount) || 0));
    });

    return sortByValueDesc(
        Array.from(totals.entries()).map(([name, value]) => ({
            name,
            value,
            key: normalizeLabelKey(name)
        }))
    );
};

const buildDailySeries = (transactions = [], referenceDate = new Date(), windowSize = 14) => {
    const safeReferenceDate = toDate(referenceDate) || new Date();
    const startDate = new Date(safeReferenceDate);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (windowSize - 1));

    const buckets = new Map();
    for (let index = 0; index < windowSize; index += 1) {
        const bucketDate = new Date(startDate.getTime() + (index * DAY_IN_MS));
        const key = getDateKey(bucketDate);
        buckets.set(key, {
            key,
            label: bucketDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            fullLabel: bucketDate.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long'
            }),
            total: 0,
            receipts: 0,
            pix: 0
        });
    }

    transactions.forEach((transaction) => {
        const bucket = buckets.get(transaction.dateKey);
        if (!bucket) {
            return;
        }

        const amount = Number(transaction.amount) || 0;
        bucket.total += amount;
        if (transaction.type === 'pix') {
            bucket.pix += amount;
        } else {
            bucket.receipts += amount;
        }
    });

    return Array.from(buckets.values());
};



export const getGreetingLabel = (date = new Date()) => {
    const safeDate = toDate(date) || new Date();
    const hour = safeDate.getHours();

    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
};

export const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
}).format(Number(value) || 0);

export const formatCompactCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1
}).format(Number(value) || 0);

export const formatPercent = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;

export const buildOpportunitySignature = (opportunityData = {}, options = {}) => JSON.stringify({
    day: opportunityData.shortLabel || '',
    totalProducts: Number(opportunityData.totalProducts) || 0,
    products: Array.isArray(opportunityData.products)
        ? opportunityData.products.map((product) => ({
            id: product.id,
            lowestUnitPrice: Number(product.lowestUnitPrice) || 0,
            averageUnitPrice: Number(product.averageUnitPrice) || 0,
            occurrences: Number(product.occurrences) || 0
        }))
        : [],
    alerts: Array.isArray(options.alerts)
        ? options.alerts.map((alert) => String(alert || '').trim()).filter(Boolean)
        : []
});

export const getStoredOpportunitySignature = () => {
    if (typeof window === 'undefined') {
        return '';
    }

    try {
        return window.localStorage.getItem(OPPORTUNITY_SEEN_SIGNATURE_STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

export const markOpportunitySignatureAsSeen = (signature) => {
    if (typeof window === 'undefined' || !signature) {
        return;
    }

    try {
        window.localStorage.setItem(OPPORTUNITY_SEEN_SIGNATURE_STORAGE_KEY, signature);
    } catch {
        // Ignore storage errors and keep the UI functional.
    }
};

const buildCurrentWeekdayBestPriceProducts = ({
    receipts = [],
    products = [],
    productAliases = [],
    referenceDate = new Date()
} = {}) => {
    const safeReferenceDate = toDate(referenceDate) || new Date();
    const productGrouping = buildProductGrouping({ products, aliases: productAliases });
    const receiptWeekdayMap = new Map();
    const weekdayProductMap = new Map(
        WEEKDAY_OPTIONS.map((weekday) => [weekday.shortLabel, new Map()])
    );

    receipts.forEach((receipt) => {
        const receiptDate = toDate(receipt.date);
        if (!receiptDate) {
            return;
        }

        const weekday = WEEKDAY_OPTIONS.find((item) => item.index === receiptDate.getDay()) || WEEKDAY_OPTIONS[0];
        receiptWeekdayMap.set(receipt.id, weekday.shortLabel);
    });

    products.forEach((product) => {
        const weekdayKey = receiptWeekdayMap.get(product.receiptId);
        const weekdayProducts = weekdayProductMap.get(weekdayKey);
        if (!weekdayProducts) {
            return;
        }

        const group = getProductGroup(productGrouping, product.name);
        const quantity = Number(product.quantity) > 0 ? Number(product.quantity) : 1;
        const unitPrice = Number(product.unitPrice) > 0
            ? Number(product.unitPrice)
            : ((Number(product.totalValue) || 0) > 0 ? (Number(product.totalValue) || 0) / quantity : 0);
        const totalValue = Number(product.totalValue) > 0 ? Number(product.totalValue) : unitPrice * quantity;

        if (unitPrice <= 0) {
            return;
        }

        if (!weekdayProducts.has(group.id)) {
            weekdayProducts.set(group.id, {
                id: group.id,
                displayName: group.displayName,
                memberNames: group.memberNames,
                merged: group.merged,
                occurrences: 0,
                totalQuantity: 0,
                totalValue: 0,
                lowestUnitPrice: Infinity
            });
        }

        const groupedProduct = weekdayProducts.get(group.id);
        groupedProduct.occurrences += 1;
        groupedProduct.totalQuantity += quantity;
        groupedProduct.totalValue += totalValue;
        groupedProduct.lowestUnitPrice = Math.min(groupedProduct.lowestUnitPrice, unitPrice);
    });

    const weekdayOrderMap = new Map(WEEKDAY_OPTIONS.map((weekday, index) => [weekday.shortLabel, index]));
    const cheapestWeekdayByProduct = new Map();

    weekdayProductMap.forEach((weekdayProducts, weekdayKey) => {
        Array.from(weekdayProducts.values())
            .map((product) => ({
                ...product,
                averageUnitPrice: product.totalQuantity > 0 ? product.totalValue / product.totalQuantity : 0,
                lowestUnitPrice: Number.isFinite(product.lowestUnitPrice) ? product.lowestUnitPrice : 0
            }))
            .forEach((product) => {
                if (product.lowestUnitPrice <= 0) {
                    return;
                }

                const currentBest = cheapestWeekdayByProduct.get(product.id);
                const weekdayOrder = weekdayOrderMap.get(weekdayKey) ?? Number.MAX_SAFE_INTEGER;

                const shouldReplaceCurrentBest = !currentBest
                    || product.lowestUnitPrice < currentBest.lowestUnitPrice
                    || (
                        product.lowestUnitPrice === currentBest.lowestUnitPrice
                        && product.averageUnitPrice < currentBest.averageUnitPrice
                    )
                    || (
                        product.lowestUnitPrice === currentBest.lowestUnitPrice
                        && product.averageUnitPrice === currentBest.averageUnitPrice
                        && product.occurrences > currentBest.occurrences
                    )
                    || (
                        product.lowestUnitPrice === currentBest.lowestUnitPrice
                        && product.averageUnitPrice === currentBest.averageUnitPrice
                        && product.occurrences === currentBest.occurrences
                        && weekdayOrder < currentBest.weekdayOrder
                    );

                if (shouldReplaceCurrentBest) {
                    cheapestWeekdayByProduct.set(product.id, {
                        ...product,
                        bestWeekday: weekdayKey,
                        weekdayOrder
                    });
                }
            });
    });

    const currentWeekday = WEEKDAY_OPTIONS.find((item) => item.index === safeReferenceDate.getDay()) || WEEKDAY_OPTIONS[0];
    const productsForCurrentWeekday = Array.from(cheapestWeekdayByProduct.values())
        .filter((product) => product.bestWeekday === currentWeekday.shortLabel)
        .sort((left, right) => (
            left.lowestUnitPrice - right.lowestUnitPrice
            || left.averageUnitPrice - right.averageUnitPrice
            || right.occurrences - left.occurrences
            || compareText(left.displayName, right.displayName)
        ));

    return {
        shortLabel: currentWeekday.shortLabel,
        fullLabel: currentWeekday.fullLabel,
        totalProducts: productsForCurrentWeekday.length,
        products: productsForCurrentWeekday
    };
};

export const buildFinanceOverview = ({
    receipts = [],
    products = [],
    pixExpenses = [],
    productAliases = [],
    foodClassificationOverrides = [],
    referenceDate = new Date()
} = {}) => {
    const safeReferenceDate = toDate(referenceDate) || new Date();
    const currentMonthKey = getMonthKey(safeReferenceDate);
    const previousMonthKey = getPreviousMonthKey(safeReferenceDate);
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const receiptOriginSummary = summarizeReceiptsByOrigin(receipts);
    const transactions = buildTransactions({ receipts, pixExpenses });
    const currentMonthTransactions = transactions.filter((transaction) => transaction.monthKey === currentMonthKey);
    const previousMonthTransactions = transactions.filter((transaction) => transaction.monthKey === previousMonthKey);
    const currentMonthTotal = sumValues(currentMonthTransactions, (transaction) => transaction.amount);
    const previousMonthTotal = sumValues(previousMonthTransactions, (transaction) => transaction.amount);
    const categoryData = buildCurrentMonthCategoryData({
        receiptMap,
        products,
        pixExpenses,
        currentMonthKey
    });
    const paymentData = buildPaymentData(transactions, currentMonthKey);
    const merchantData = buildMerchantData(transactions, currentMonthKey);
    const dailySeries = buildDailySeries(transactions, safeReferenceDate);
    const currentMonthDaysElapsed = Math.max(1, safeReferenceDate.getDate());
    const daysInMonth = getDaysInMonth(safeReferenceDate);
    const remainingDays = Math.max(0, daysInMonth - currentMonthDaysElapsed);
    const activeDays = dailySeries.filter((item) => item.total > 0).length;
    const maxDailySpend = dailySeries.reduce(
        (currentMax, item) => Math.max(currentMax, Number(item.total) || 0),
        0
    );
    const averageActiveDaySpend = activeDays > 0 ? currentMonthTotal / activeDays : 0;
    const fixedMonthlyTotal = sumValues(
        categoryData.filter((item) => FIXED_MONTHLY_CATEGORY_KEYS.has(item.key)),
        (item) => item.value
    );
    const variableTotal = Math.max(0, currentMonthTotal - fixedMonthlyTotal);
    const creditTotal = sumValues(
        paymentData.filter((item) => CREDIT_METHOD_KEYS.some((key) => item.key.includes(key))),
        (item) => item.value
    );
    const positivePaymentTotal = sumValues(
        paymentData.filter((item) => POSITIVE_METHOD_KEYS.some((key) => item.key.includes(key))),
        (item) => item.value
    );
    const topCategory = categoryData[0] || null;
    const topMerchant = merchantData[0] || null;
    const topCategoryShare = currentMonthTotal > 0 ? (Number(topCategory?.value) || 0) / currentMonthTotal : 0;
    const topMerchantShare = currentMonthTotal > 0 ? (Number(topMerchant?.value) || 0) / currentMonthTotal : 0;
    const variation = buildVariation(currentMonthTotal, previousMonthTotal);
    const healthModel = construirIndiceSaudeFinanceira({
        receipts,
        products,
        pixExpenses,
        productAliases,
        foodClassificationOverrides,
        referenceDate: safeReferenceDate
    });

    const healthScore = {
        score: healthModel.score,
        status: healthModel.status,
        note: healthModel.transparencyNote
    };
    const projectedMonthSpend = currentMonthTotal > 0
        ? (currentMonthTotal / currentMonthDaysElapsed) * daysInMonth
        : 0;
    const averageTicket = currentMonthTransactions.length > 0
        ? currentMonthTotal / currentMonthTransactions.length
        : 0;
    const recentTransactions = transactions.slice(0, 6).map((transaction) => ({
        ...transaction,
        sourceLabel: buildTransactionSourceLabel(transaction)
    }));
    const monthLabel = safeReferenceDate.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
    });
    const topPayments = paymentData.slice(0, 4).map((item) => ({
        ...item,
        share: currentMonthTotal > 0 ? item.value / currentMonthTotal : 0
    }));
    const topCategories = categoryData.slice(0, 5).map((item) => ({
        ...item,
        share: currentMonthTotal > 0 ? item.value / currentMonthTotal : 0
    }));
    const topMerchants = merchantData.slice(0, 4).map((item) => ({
        ...item,
        share: currentMonthTotal > 0 ? item.value / currentMonthTotal : 0
    }));
    const pendingPixCount = pixExpenses.filter((expense) => (
        String(expense.confirmationStatus || '').toLowerCase() === 'pendente'
    )).length;
    const currentWeekdayBestPriceProducts = buildCurrentWeekdayBestPriceProducts({
        receipts,
        products,
        productAliases,
        referenceDate: safeReferenceDate
    });

    const currentCreditShare = currentMonthTotal > 0 ? creditTotal / currentMonthTotal : 0;
    const financeAlerts = [];
    if (variation.direction === 'up' && variation.value > 0.05) {
        financeAlerts.push(withInsightWhy(
            `Seus gastos subiram ${(variation.value * 100).toFixed(1)}% em relacao ao mes anterior`,
            `o total desembolsado no mes atual esta acima da base do mes anterior nas saidas registradas`
        ));
    }
    if (healthScore.score < 60 && currentMonthTotal > 0) {
        financeAlerts.push(withInsightWhy(
            'Seu indice de saude financeira esta alertando perigo. Reveja seu ritmo de saidas',
            `o ISF do ciclo atual ficou em ${healthScore.score}/100 e os blocos de gasto perderam equilibrio no mes`
        ));
    } else if (healthScore.score >= 85 && currentMonthTotal > 0) {
        financeAlerts.push(withInsightWhy(
            'Otimo comportamento no mes! Sua saude financeira esta excelente',
            `o ISF do ciclo atual chegou a ${healthScore.score}/100 com boa distribuicao entre alimentacao, essenciais e despesas variaveis`
        ));
    }
    if (currentCreditShare > 0.5) {
        financeAlerts.push(withInsightWhy(
            'Cuidado: Mais da metade das despesas deste mes baseiam-se em cartao de credito ou prazo longo',
            `${(currentCreditShare * 100).toFixed(1)}% do valor do ciclo foi concentrado em meios que alongam pagamento ou aumentam dependencia de limite`
        ));
    }
    if (topCategoryShare > 0.4 && topCategory) {
        financeAlerts.push(withInsightWhy(
            `Alerta de concentracao: A categoria '${topCategory.name}' representa ${(topCategoryShare * 100).toFixed(1)}% do total mensal`,
            `essa categoria absorveu sozinha uma fatia muito alta do gasto do mes e reduz a diversificacao do orcamento`
        ));
    }
    if (pendingPixCount > 0) {
        financeAlerts.push(withInsightWhy(
            `Nao esqueca de classificar as ${pendingPixCount} transacao(oes) Pix pendente(s)`,
            'essas despesas ainda nao entraram com a melhor categorizacao possivel nas leituras automaticas do app'
        ));
    }
    if (receiptOriginSummary.manualReceiptsCount > receiptOriginSummary.importedReceiptsCount && receiptOriginSummary.importedReceiptsCount > 5) {
        financeAlerts.push(withInsightWhy(
            'Dica: Use mais a camera! Escanear o QR Code extrai dados mais ricos do que apenas lancar despesas manuais',
            'os cupons importados trazem nomes de itens e categorias mais detalhadas, o que melhora a qualidade dos insights automaticos'
        ));
    }
    if (activeDays >= 3 && maxDailySpend > averageActiveDaySpend * 2.5) {
        financeAlerts.push(withInsightWhy(
            `Atencao para o salto: houve um dia atipico com desembolso isolado muito elevado (Pico do mes: ${formatCurrency(maxDailySpend)})`,
            'esse pico ficou muito acima da sua media por dia com gasto e pode distorcer a percepcao do fechamento mensal'
        ));
    }

    return {
        hasData: transactions.length > 0,
        greetingLabel: getGreetingLabel(safeReferenceDate),
        monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        currentMonthTotal,
        previousMonthTotal,
        projectedMonthSpend,
        variation,
        healthScore,
        currentMonthDaysElapsed,
        daysInMonth,
        remainingDays,
        activeDays,
        averageTicket,
        averageDailySpend: currentMonthTotal / currentMonthDaysElapsed,
        fixedMonthlyTotal,
        variableTotal,
        essentialTotal: fixedMonthlyTotal,
        flexibleTotal: variableTotal,
        topCategory,
        topCategoryShare,
        topMerchant,
        topMerchantShare,
        topCategories,
        topPayments,
        topMerchants,
        recentTransactions,
        dailySeries,
        paymentData,
        categoryData,
        transactionsCount: currentMonthTransactions.length,
        pendingPixCount,
        baseEntriesCount: receiptOriginSummary.importedReceiptsCount + receiptOriginSummary.manualReceiptsCount + pixExpenses.length,
        importedReceiptsCount: receiptOriginSummary.importedReceiptsCount,
        manualReceiptsCount: receiptOriginSummary.manualReceiptsCount,
        receiptsCount: receipts.length,
        pixCount: pixExpenses.length,
        currentWeekdayBestPriceProducts,
        alerts: financeAlerts
    };
};
