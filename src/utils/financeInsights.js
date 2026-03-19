import { normalizePaymentMethod, PAYMENT_METHOD_NOT_INFORMED } from './paymentMethods';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HEALTH_SCORE = 68;

const ESSENTIAL_CATEGORY_KEYS = new Set([
    'alimentacao',
    'acougue e frios',
    'padaria e lanches',
    'bebidas',
    'hortifruti',
    'higiene e limpeza',
    'farmacia e saude',
    'combustivel',
    'moradia',
    'energia eletrica',
    'agua e saneamento',
    'gas',
    'transporte',
    'saude',
    'educacao',
    'internet',
    'telefone'
]);

const CREDIT_METHOD_KEYS = ['cartao de credito', 'boleto'];
const POSITIVE_METHOD_KEYS = ['pix', 'dinheiro', 'cartao de debito', 'transferencia'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeLabelKey = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const toDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const getDateKey = (value) => {
    const date = toDate(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getMonthKey = (value) => {
    const dateKey = getDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : '';
};

const getPreviousMonthKey = (value) => {
    const date = toDate(value);
    if (!date) return '';

    return `${date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear()}-${String(
        date.getMonth() === 0 ? 12 : date.getMonth()
    ).padStart(2, '0')}`;
};

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

const buildHealthScore = ({
    currentMonthTotal,
    previousMonthTotal,
    topCategoryShare,
    topMerchantShare,
    creditShare,
    positivePaymentShare,
    maxDailySpend,
    averageActiveDaySpend
}) => {
    if (currentMonthTotal <= 0) {
        return {
            score: DEFAULT_HEALTH_SCORE,
            status: buildStatus(DEFAULT_HEALTH_SCORE),
            note: 'O score sera refinado conforme novos gastos forem registrados.'
        };
    }

    const variationPenalty = previousMonthTotal > 0
        ? clamp(Math.abs((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 42, 0, 20)
        : 6;
    const concentrationPenalty = clamp((topCategoryShare * 22) + (topMerchantShare * 14), 0, 28);
    const creditPenalty = clamp(creditShare * 22, 0, 18);
    const spikePenalty = averageActiveDaySpend > 0 && maxDailySpend > averageActiveDaySpend
        ? clamp(((maxDailySpend / averageActiveDaySpend) - 1) * 7, 0, 14)
        : 0;
    const positiveBonus = clamp(positivePaymentShare * 14, 0, 10);

    const score = clamp(
        Math.round(100 - variationPenalty - concentrationPenalty - creditPenalty - spikePenalty + positiveBonus),
        32,
        96
    );

    return {
        score,
        status: buildStatus(score),
        note: 'Indice calculado pelo ritmo, concentracao e perfil das saidas registradas.'
    };
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

export const buildFinanceOverview = ({
    receipts = [],
    products = [],
    pixExpenses = [],
    referenceDate = new Date()
} = {}) => {
    const safeReferenceDate = toDate(referenceDate) || new Date();
    const currentMonthKey = getMonthKey(safeReferenceDate);
    const previousMonthKey = getPreviousMonthKey(safeReferenceDate);
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
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
    const essentialTotal = sumValues(
        categoryData.filter((item) => ESSENTIAL_CATEGORY_KEYS.has(item.key)),
        (item) => item.value
    );
    const flexibleTotal = Math.max(0, currentMonthTotal - essentialTotal);
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
    const healthScore = buildHealthScore({
        currentMonthTotal,
        previousMonthTotal,
        topCategoryShare,
        topMerchantShare,
        creditShare: currentMonthTotal > 0 ? creditTotal / currentMonthTotal : 0,
        positivePaymentShare: currentMonthTotal > 0 ? positivePaymentTotal / currentMonthTotal : 0,
        maxDailySpend,
        averageActiveDaySpend
    });
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
        essentialTotal,
        flexibleTotal,
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
        receiptsCount: receipts.length,
        pixCount: pixExpenses.length
    };
};
