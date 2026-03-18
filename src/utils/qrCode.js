const PIX_GUI = 'br.gov.bcb.pix';

export const PIX_EXPENSE_CATEGORY_OPTIONS = [
    'Energia eletrica',
    'Agua e saneamento',
    'Internet',
    'Telefone',
    'Gas',
    'Moradia',
    'Transporte',
    'Supermercado',
    'Saude',
    'Educacao',
    'Impostos e taxas',
    'Outros'
];

const FISCAL_URL_PATTERNS = [
    /sefaz/i,
    /fazenda/i,
    /nfce/i,
    /nfe/i,
    /sat/i,
    /consulta/i
];

const FISCAL_TEXT_PATTERNS = [
    /chNFe=/i,
    /\bp=/i,
    /\bnfce\b/i,
    /\bnfe\b/i,
    /\bcupom\b/i,
    /\bsefaz\b/i,
    /\bsat\b/i,
    /\bchave\s+de\s+acesso\b/i
];

const PIX_CATEGORY_RULES = [
    { pattern: /\bCOPEL\b/i, category: 'Energia eletrica' },
    { pattern: /\bENERGISA\b/i, category: 'Energia eletrica' },
    { pattern: /\bENEL\b/i, category: 'Energia eletrica' },
    { pattern: /\bCELPA\b|\bCEEE\b|\bCPFL\b/i, category: 'Energia eletrica' },
    { pattern: /\bSANEPAR\b/i, category: 'Agua e saneamento' },
    { pattern: /\bSABESP\b|\bCOPASA\b|\bAGUAS\b/i, category: 'Agua e saneamento' },
    { pattern: /\bCLARO\b|\bVIVO\b|\bTIM\b|\bOI\b/i, category: 'Telefone' },
    { pattern: /\bINTERNET\b|\bFIBRA\b|\bNET\b|\bBANDA\s+LARGA\b/i, category: 'Internet' },
    { pattern: /\bULTRAGAZ\b|\bLIQUIGAS\b|\bNACIONAL\s+GAS\b/i, category: 'Gas' },
    { pattern: /\bUBER\b|\b99\b|\bMOBILIDADE\b/i, category: 'Transporte' },
    { pattern: /\bMERCADO\b|\bSUPERMERCADO\b|\bATACADO\b/i, category: 'Supermercado' },
    { pattern: /\bUNIMED\b|\bHOSPITAL\b|\bFARMACIA\b/i, category: 'Saude' },
    { pattern: /\bESCOLA\b|\bCOLEGIO\b|\bFACULDADE\b|\bCURSO\b/i, category: 'Educacao' },
    { pattern: /\bPREFEITURA\b|\bDETRAN\b|\bRECEITA\b|\bTRIBUTO\b|\bIMPOSTO\b/i, category: 'Impostos e taxas' }
];

const normalizeQrRawContent = (value) => String(value || '')
    .split('\0')
    .join('')
    .trim();

const buildPixPayloadCandidates = (value) => {
    const trimmed = normalizeQrRawContent(value);
    const compact = trimmed.replace(/\s+/g, '');
    return Array.from(new Set([trimmed, compact].filter(Boolean)));
};

const parseNumericValue = (value) => {
    const normalized = String(value || '').replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseEmvFields = (payload) => {
    const normalizedPayload = String(payload || '');
    const fields = [];
    let cursor = 0;

    while (cursor < normalizedPayload.length) {
        if (cursor + 4 > normalizedPayload.length) {
            return { fields, valid: false };
        }

        const id = normalizedPayload.slice(cursor, cursor + 2);
        const lengthText = normalizedPayload.slice(cursor + 2, cursor + 4);

        if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) {
            return { fields, valid: false };
        }

        const length = Number(lengthText);
        const valueStart = cursor + 4;
        const valueEnd = valueStart + length;

        if (valueEnd > normalizedPayload.length) {
            return { fields, valid: false };
        }

        fields.push({
            id,
            length,
            value: normalizedPayload.slice(valueStart, valueEnd)
        });

        cursor = valueEnd;
    }

    return { fields, valid: cursor === normalizedPayload.length };
};

const parseNestedEmvMap = (value) => {
    const parsed = parseEmvFields(value);
    if (!parsed.valid || !parsed.fields.length) {
        return null;
    }

    return new Map(parsed.fields.map((field) => [field.id, field.value]));
};

const formatPixPayloadType = (value) => {
    switch (String(value || '')) {
        case '11':
            return 'Estatico';
        case '12':
            return 'Dinamico';
        default:
            return 'Nao informado';
    }
};

const extractPixDataFromPayload = (payload) => {
    const parsed = parseEmvFields(payload);
    if (!parsed.valid || !parsed.fields.length) {
        return null;
    }

    const topLevelMap = new Map(parsed.fields.map((field) => [field.id, field.value]));
    const merchantField = parsed.fields.find((field) => {
        const nestedMap = parseNestedEmvMap(field.value);
        return nestedMap?.get('00')?.toLowerCase() === PIX_GUI;
    });

    if (!merchantField) {
        return null;
    }

    if (String(topLevelMap.get('58') || '').toUpperCase() !== 'BR') {
        return null;
    }

    const merchantMap = parseNestedEmvMap(merchantField.value) || new Map();
    const additionalDataMap = parseNestedEmvMap(topLevelMap.get('62') || '') || new Map();
    const receiver = String(topLevelMap.get('59') || '').trim();
    const city = String(topLevelMap.get('60') || '').trim();
    const txid = String(additionalDataMap.get('05') || '').trim();
    const pixKey = String(merchantMap.get('01') || '').trim();
    const description = String(merchantMap.get('02') || '').trim();
    const amount = parseNumericValue(topLevelMap.get('54'));

    if (!receiver && !pixKey) {
        return null;
    }

    return {
        receiver,
        amount,
        city,
        txid,
        pixKey,
        description,
        payloadType: formatPixPayloadType(topLevelMap.get('01')),
        merchantCategoryCode: String(topLevelMap.get('52') || '').trim(),
        transactionCurrency: String(topLevelMap.get('53') || '').trim(),
        payloadOriginal: payload
    };
};

export const suggestPixCategory = (receiver) => {
    const normalizedReceiver = String(receiver || '').trim();
    if (!normalizedReceiver) {
        return 'Outros';
    }

    return PIX_CATEGORY_RULES.find(({ pattern }) => pattern.test(normalizedReceiver))?.category || 'Outros';
};

export const ehQrCupomFiscal = (value) => {
    const normalizedValue = normalizeQrRawContent(value);
    if (!normalizedValue) {
        return false;
    }

    try {
        const parsedUrl = new URL(normalizedValue);
        const urlSample = `${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search}`;
        if (FISCAL_URL_PATTERNS.some((pattern) => pattern.test(urlSample))) {
            return true;
        }
    } catch {
        // O QR pode nao ser uma URL completa.
    }

    return FISCAL_TEXT_PATTERNS.some((pattern) => pattern.test(normalizedValue));
};

export const extrairDadosPix = (value) => {
    const candidates = buildPixPayloadCandidates(value);

    for (const candidate of candidates) {
        const pixData = extractPixDataFromPayload(candidate);
        if (pixData) {
            return {
                ...pixData,
                suggestedCategory: suggestPixCategory(pixData.receiver)
            };
        }
    }

    return null;
};

export const ehQrPix = (value) => Boolean(extrairDadosPix(value));

export const processarCupomFiscal = (value) => ({
    type: 'receipt',
    rawContent: normalizeQrRawContent(value)
});

export const processarQrPix = (value) => {
    const data = extrairDadosPix(value);
    return data
        ? {
            type: 'pix',
            rawContent: normalizeQrRawContent(value),
            data
        }
        : null;
};

const normalizePixIdentityText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const normalizePixDateKey = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

export const buildPixExpenseIdentityKey = ({
    payloadOriginal,
    txid,
    pixKey,
    receiver,
    value,
    category,
    date,
    payloadType,
    merchantCategoryCode
} = {}) => {
    const normalizedPayload = normalizeQrRawContent(payloadOriginal);
    if (normalizedPayload) {
        return `payload|${normalizedPayload}`;
    }

    const normalizedTxid = normalizePixIdentityText(txid);
    const normalizedPixKey = normalizePixIdentityText(pixKey);
    const normalizedReceiver = normalizePixIdentityText(receiver);
    const normalizedValue = parseNumericValue(value);
    const normalizedCategory = normalizePixIdentityText(category);
    const normalizedDate = normalizePixDateKey(date);
    const normalizedPayloadType = normalizePixIdentityText(payloadType);
    const normalizedMerchantCategoryCode = normalizePixIdentityText(merchantCategoryCode);
    const valueKey = Number.isFinite(normalizedValue) ? normalizedValue.toFixed(2) : '';

    if (normalizedTxid) {
        return [
            'txid',
            normalizedTxid,
            normalizedPixKey || 'SEM_CHAVE',
            valueKey || 'SEM_VALOR'
        ].join('|');
    }

    if (normalizedPixKey && valueKey) {
        return [
            'pixkey',
            normalizedPixKey,
            normalizedReceiver || 'SEM_RECEBEDOR',
            valueKey,
            normalizedMerchantCategoryCode || 'SEM_MCC'
        ].join('|');
    }

    return [
        'fallback',
        normalizedReceiver || 'SEM_RECEBEDOR',
        valueKey || 'SEM_VALOR',
        normalizedCategory || 'SEM_CATEGORIA',
        normalizedDate || 'SEM_DATA',
        normalizedPayloadType || 'SEM_TIPO'
    ].join('|');
};

export const processarQRCode = (value) => {
    const normalizedValue = normalizeQrRawContent(value);

    if (!normalizedValue) {
        return {
            type: 'unknown',
            rawContent: ''
        };
    }

    if (ehQrCupomFiscal(normalizedValue)) {
        return processarCupomFiscal(normalizedValue);
    }

    const pixResult = processarQrPix(normalizedValue);
    if (pixResult) {
        return pixResult;
    }

    return {
        type: 'unknown',
        rawContent: normalizedValue
    };
};
