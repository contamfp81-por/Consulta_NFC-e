export const PAYMENT_METHOD_NOT_INFORMED = 'Nao informado';

export const PAYMENT_METHOD_OPTIONS = [
    PAYMENT_METHOD_NOT_INFORMED,
    'Pix',
    'Dinheiro',
    'Cartao de Debito',
    'Cartao de Credito',
    'Vale Alimentacao',
    'Vale Refeicao',
    'Transferencia',
    'Boleto',
    'Cheque',
    'Carteira Digital',
    'Outro'
];

const PAYMENT_METHOD_PATTERNS = [
    { pattern: /\bpix\b/i, label: 'Pix' },
    { pattern: /\bdinheiro\b/i, label: 'Dinheiro' },
    { pattern: /cart[aã]o\s+de\s+d[eé]bito|\bd[eé]bito\b/i, label: 'Cartao de Debito' },
    { pattern: /cart[aã]o\s+de\s+cr[eé]dito|\bcr[eé]dito\b/i, label: 'Cartao de Credito' },
    { pattern: /vale\s+aliment/i, label: 'Vale Alimentacao' },
    { pattern: /vale\s+refei/i, label: 'Vale Refeicao' },
    { pattern: /transfer[êe]ncia|\bted\b|\bdoc\b/i, label: 'Transferencia' },
    { pattern: /\bboleto\b/i, label: 'Boleto' },
    { pattern: /\bcheque\b/i, label: 'Cheque' },
    { pattern: /carteira\s+digital|wallet|picpay|mercado\s+pago|paypal/i, label: 'Carteira Digital' }
];

const PAYMENT_SECTION_PATTERN = /(forma\s+de\s+pagamento|meio\s+de\s+pagamento|pagamento)/i;

const toCompactText = (value) => (
    (value || '')
        .replace(/\s+/g, ' ')
        .trim()
);

const toTitleCase = (value) => (
    value
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
);

export const normalizePaymentMethod = (value) => {
    const compactValue = toCompactText(value);
    if (!compactValue) {
        return PAYMENT_METHOD_NOT_INFORMED;
    }

    const directMatch = PAYMENT_METHOD_OPTIONS.find(
        (option) => option.toLowerCase() === compactValue.toLowerCase()
    );
    if (directMatch) {
        return directMatch;
    }

    const detectedMethods = detectPaymentMethods(compactValue);
    if (detectedMethods.length > 0) {
        return detectedMethods.join(' + ');
    }

    return toTitleCase(compactValue);
};

export const combinePaymentMethods = (values = []) => {
    const uniqueMethods = Array.from(new Set(
        values
            .map((value) => normalizePaymentMethod(value))
            .filter((value) => value && value !== PAYMENT_METHOD_NOT_INFORMED)
    ));

    if (uniqueMethods.length === 0) {
        return PAYMENT_METHOD_NOT_INFORMED;
    }

    return uniqueMethods.join(' + ');
};

export const detectPaymentMethods = (value) => {
    const compactValue = toCompactText(value);
    if (!compactValue) {
        return [];
    }

    return PAYMENT_METHOD_PATTERNS
        .filter(({ pattern }) => pattern.test(compactValue))
        .map(({ label }) => label);
};

export const extractPaymentMethodFromText = (value) => {
    const compactValue = toCompactText(value);
    if (!compactValue) {
        return PAYMENT_METHOD_NOT_INFORMED;
    }

    const sectionIndex = compactValue.search(PAYMENT_SECTION_PATTERN);
    const paymentSection = sectionIndex >= 0
        ? compactValue.slice(sectionIndex, sectionIndex + 400)
        : compactValue;

    const detectedMethods = detectPaymentMethods(paymentSection);
    if (detectedMethods.length > 0) {
        return combinePaymentMethods(detectedMethods);
    }

    const fallbackDetectedMethods = detectPaymentMethods(compactValue);
    if (fallbackDetectedMethods.length > 0) {
        return combinePaymentMethods(fallbackDetectedMethods);
    }

    const labelMatch = paymentSection.match(
        /(?:forma\s+de\s+pagamento|meio\s+de\s+pagamento|pagamento)\s*[:-]?\s*([A-Za-zÀ-ÿ ]{3,60})/i
    );
    if (labelMatch?.[1]) {
        return normalizePaymentMethod(labelMatch[1]);
    }

    return PAYMENT_METHOD_NOT_INFORMED;
};
