import { extractPaymentMethodFromText, normalizePaymentMethod, PAYMENT_METHOD_NOT_INFORMED } from './paymentMethods';

const HTML_MIN_LENGTH = 800;
const HTML_FALLBACK_MIN_LENGTH = 500;
const FETCH_TIMEOUT_MS = 12000;

const PROXY_PROVIDERS = [
    {
        name: 'allorigins',
        buildUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        readBody: async (response) => {
            const data = await response.json();
            return data?.contents || '';
        }
    },
    {
        name: 'corsproxy',
        buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        readBody: async (response) => response.text()
    },
    {
        name: 'thingproxy',
        buildUrl: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
        readBody: async (response) => response.text()
    },
    {
        name: 'codetabs',
        buildUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${Math.random().toString(36).substring(7)}&url=${encodeURIComponent(url)}`,
        readBody: async (response) => response.text()
    }
];

const RECEIPT_MARKERS = [
    'nfc-e',
    'chave de acesso',
    'valor total',
    'qtde.:',
    'vl. unit.:',
    'consumidor'
];

const BLOCKED_PAGE_MARKERS = [
    'access denied',
    'forbidden',
    'temporarily unavailable',
    'service unavailable',
    'captcha',
    'cloudflare',
    'request blocked',
    'erro 403',
    'erro 502',
    'erro 503',
    'proxy error',
    'pagina nao encontrada',
    'page not found'
];

const PLACEHOLDER_ESTABLISHMENTS = new Set([
    'Supermercado (NFC-e PR)',
    'Consulta PR (Acesso Manual Necessario)'
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const extractByLabel = (element, label) => {
    const text = element.textContent || '';
    const match = text.match(new RegExp(`${escapeRegExp(label)}[:\\s]*([^\\s]+)`, 'i'));
    return match ? match[1].trim() : '';
};

export const parseBrazilianNumber = (value) => {
    if (!value) return 0;

    let normalized = value.trim().replace(/[^\d.,-]/g, '');

    if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',')) {
        normalized = normalized.replace(',', '.');
    }

    return parseFloat(normalized) || 0;
};

const fetchWithTimeout = async (url, timeoutMs = FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
            }
        });
    } finally {
        window.clearTimeout(timeoutId);
    }
};

const normalizeSefazUrl = (url) => {
    if (url.includes('fazenda.pr.gov.br') && !url.includes('|3|1')) {
        return `${url.split('|')[0]}|3|1`;
    }

    return url;
};

const getDocumentText = (document) => (
    document.body?.textContent?.replace(/\s+/g, ' ').trim() || ''
);

const isLikelyBlockedHtml = (html, textContent) => {
    const normalized = `${html} ${textContent}`.toLowerCase();
    return BLOCKED_PAGE_MARKERS.some((marker) => normalized.includes(marker));
};

const hasExpectedReceiptMarkers = (textContent) => {
    const normalized = textContent.toLowerCase();
    return RECEIPT_MARKERS.some((marker) => normalized.includes(marker));
};

const sanitizeEstablishment = (value) => {
    if (!value) return 'Supermercado (NFC-e PR)';
    return value.replace(/\s+/g, ' ').trim().slice(0, 50) || 'Supermercado (NFC-e PR)';
};

const extractAccessKey = (document, url, textContent) => {
    const selectorValue = document
        .querySelector('.chave, #lblChaveAcesso, .txtChave, .nfe-chave')
        ?.textContent
        ?.replace(/\s/g, '');

    if (/^\d{44}$/.test(selectorValue || '')) {
        return selectorValue;
    }

    const textMatch = textContent.match(/((?:\d\s*){44})/);
    if (textMatch) {
        return textMatch[1].replace(/\s/g, '');
    }

    const urlMatch = url.match(/[0-9]{44}/)?.[0];
    if (urlMatch) {
        return urlMatch;
    }

    return `PR-${Date.now()}`;
};

const extractDate = (textContent) => {
    const match = textContent.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}(?::\d{2})?)?/);
    if (!match) {
        return new Date().toISOString();
    }

    const [, datePart, timePart] = match;
    const [day, month, year] = datePart.split('/');
    return new Date(`${year}-${month}-${day}T${timePart || '12:00:00'}`).toISOString();
};

const extractReceiptNumber = (textContent) => (
    textContent.match(/(?:n(?:umero)?\.?|doc\.?|cupom|nfc-e)\s*[:#]?\s*(\d{3,})/i)?.[1] || 'S/N'
);

const extractTotalValue = (document, textContent) => {
    const selectorValue = document.querySelector('#lblVlrTotal, .txtMax, .totalNFe, #ValorTotal, .vlrTotal')?.textContent;
    const selectorTotal = parseBrazilianNumber(selectorValue);

    if (selectorTotal > 0) {
        return selectorTotal;
    }

    const patterns = [
        /(?:Valor\s*Total|Total\s*a\s*Pagar|Valor\s*a\s*Pagar|Pagar|Total)[:\s]*R?\$?\s*([\d,.]+)/i,
        /R\$\s*([\d,.]+)\s*(?:Valor\s*Total|Total)/i
    ];

    for (const pattern of patterns) {
        const match = textContent.match(pattern);
        const total = parseBrazilianNumber(match?.[1]);
        if (total > 0) {
            return total;
        }
    }

    return 0;
};

const extractPaymentMethod = (document, textContent) => {
    const paymentSnippets = [];

    document.querySelectorAll('tr, li, div, span, p').forEach((element) => {
        const snippet = (element.textContent || '').replace(/\s+/g, ' ').trim();
        if (!snippet || snippet.length > 180) {
            return;
        }

        if (/pagamento|pix|dinheiro|d[eé]bito|cr[eé]dito|vale|boleto|cheque|transfer/i.test(snippet)) {
            paymentSnippets.push(snippet);
        }
    });

    return normalizePaymentMethod(
        extractPaymentMethodFromText([
            textContent,
            ...paymentSnippets
        ].join(' '))
    );
};

const extractUnit = (textContent) => {
    const match = textContent.match(/\b(KG|LT|L|ML|G|PCT|PC|CX|FD|UN|UND|DZ|M|MT)\b/i);
    if (!match) {
        return 'UN';
    }

    return match[1].toUpperCase() === 'UND' ? 'UN' : match[1].toUpperCase();
};

const cleanProductName = (value) => {
    if (!value) return '';

    return value
        .replace(/\s+/g, ' ')
        .split('Qtde.:')[0]
        .split('Vl. Unit.:')[0]
        .replace(/\(\s*codigo.*$/i, '')
        .trim();
};

const createProduct = ({ name, quantity, unit, unitPrice, totalValue }) => {
    const sanitizedName = cleanProductName(name);
    const safeQuantity = quantity > 0 ? quantity : 1;
    const safeUnitPrice = unitPrice > 0 ? unitPrice : (totalValue > 0 ? totalValue / safeQuantity : 0);
    const safeTotalValue = totalValue > 0 ? totalValue : safeUnitPrice * safeQuantity;

    if (!sanitizedName || (safeUnitPrice <= 0 && safeTotalValue <= 0)) {
        return null;
    }

    return {
        name: sanitizedName,
        brand: 'Marca',
        quantity: safeQuantity,
        unit: unit || 'UN',
        unitPrice: safeUnitPrice,
        totalValue: safeTotalValue,
        category: autoCategorize(sanitizedName)
    };
};

const dedupeProducts = (products) => {
    const uniqueProducts = new Map();

    products.forEach((product) => {
        const key = [
            product.name,
            Number(product.quantity || 0).toFixed(3),
            Number(product.unitPrice || 0).toFixed(4),
            Number(product.totalValue || 0).toFixed(2)
        ].join('|');

        if (!uniqueProducts.has(key)) {
            uniqueProducts.set(key, product);
        }
    });

    return Array.from(uniqueProducts.values());
};

const parseStructuredProducts = (document) => {
    const products = [];

    document.querySelectorAll('li, tr, .container-itens, .ui-li-static').forEach((element) => {
        const textContent = element.textContent || '';
        if (!textContent.includes('Qtde.:') && !textContent.includes('Vl. Unit.:')) {
            return;
        }

        let name = (element.querySelector('h3, strong, span, .txtTit') || element).textContent || '';
        name = cleanProductName(name);

        const quantity = parseBrazilianNumber(extractByLabel(element, 'Qtde.'));
        const unitPrice = parseBrazilianNumber(extractByLabel(element, 'Vl. Unit.'));
        const totalValue = parseBrazilianNumber(extractByLabel(element, 'Vl. Total')) || unitPrice * (quantity || 1);
        const product = createProduct({
            name,
            quantity,
            unit: extractUnit(textContent),
            unitPrice,
            totalValue
        });

        if (product) {
            products.push(product);
        }
    });

    return products;
};

const parseTabularProducts = (document) => {
    const products = [];

    document.querySelectorAll('tr').forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) {
            return;
        }

        const name = cleanProductName(cells[0].textContent || '');
        const quantity = parseBrazilianNumber(cells[1].textContent || '');
        const totalValue = parseBrazilianNumber(cells[cells.length - 1].textContent || '');
        const product = createProduct({
            name,
            quantity,
            unit: extractUnit(row.textContent || ''),
            unitPrice: quantity > 0 ? totalValue / quantity : totalValue,
            totalValue
        });

        if (product) {
            products.push(product);
        }
    });

    return products;
};

const extractProducts = (document) => {
    const structuredProducts = parseStructuredProducts(document);

    if (structuredProducts.length > 0) {
        return dedupeProducts(structuredProducts);
    }

    return dedupeProducts(parseTabularProducts(document));
};

const buildPartialMessage = (reasons) => {
    if (reasons.includes('nenhum item encontrado')) {
        return 'A consulta retornou sem os itens completos da NFC-e. Nenhum dado foi salvo. Tente novamente.';
    }

    if (reasons.includes('resposta bloqueada ou invalida')) {
        return 'A resposta da SEFAZ ou do proxy veio bloqueada/invalida. Nenhum dado foi salvo. Tente novamente.';
    }

    return 'A consulta retornou dados incompletos da NFC-e. Nenhum dado foi salvo. Tente novamente.';
};

const calculateExtractionScore = (data, meta) => {
    let score = 0;

    if (meta.hasReceiptMarkers) score += 10;
    if (data.products.length > 0) score += 45 + Math.min(data.products.length, 20);
    if (data.totalValue > 0) score += 20;
    if (/^\d{44}$/.test(data.accessKey || '')) score += 15;
    if (data.establishment && !PLACEHOLDER_ESTABLISHMENTS.has(data.establishment)) score += 10;
    if (data.receiptNumber && data.receiptNumber !== 'S/N') score += 5;
    if (meta.blocked) score -= 60;

    return score;
};

const validateExtraction = (data, meta) => {
    const reasons = [];
    const itemTotal = data.products.reduce((sum, product) => sum + (Number(product.totalValue) || 0), 0);

    if (meta.blocked) {
        reasons.push('resposta bloqueada ou invalida');
    }

    if (meta.htmlLength < HTML_FALLBACK_MIN_LENGTH) {
        reasons.push('html incompleto');
    }

    if (meta.htmlLength < HTML_MIN_LENGTH && data.products.length === 0) {
        reasons.push('html menor que o esperado');
    }

    if (!meta.hasReceiptMarkers && data.products.length === 0) {
        reasons.push('pagina sem marcadores validos da NFC-e');
    }

    if (data.products.length === 0) {
        reasons.push('nenhum item encontrado');
    }

    if (data.totalValue <= 0) {
        reasons.push('total da nota nao identificado');
    }

    if (!/^\d{44}$/.test(data.accessKey || '')) {
        reasons.push('chave de acesso nao confirmada');
    }

    if (
        data.products.length > 0
        && data.totalValue > 0
        && itemTotal > 0
        && itemTotal < data.totalValue * 0.55
    ) {
        reasons.push('itens extraidos muito abaixo do total da nota');
    }

    const score = calculateExtractionScore(data, meta) - (reasons.length * 8);

    return {
        isPartial: reasons.length > 0,
        partialReasons: reasons,
        partialMessage: reasons.length > 0 ? buildPartialMessage(reasons) : '',
        extractionScore: score
    };
};

const buildExtractionResult = (document, url, html, proxyName) => {
    const textContent = getDocumentText(document);
    const products = extractProducts(document);
    const data = {
        establishment: sanitizeEstablishment(
            document.querySelector('#lblNomeFantasia, #lblRazaoSocial, .txtTopo, .fantasy, h2, h3')?.textContent?.trim()
        ),
        date: extractDate(textContent),
        totalValue: extractTotalValue(document, textContent),
        accessKey: extractAccessKey(document, url, textContent),
        receiptNumber: extractReceiptNumber(textContent),
        paymentMethod: extractPaymentMethod(document, textContent),
        products
    };

    const meta = {
        proxyName,
        htmlLength: html.length,
        blocked: isLikelyBlockedHtml(html, textContent),
        hasReceiptMarkers: hasExpectedReceiptMarkers(textContent)
    };

    return {
        ...data,
        ...validateExtraction(data, meta),
        proxyUsed: proxyName,
        htmlLength: meta.htmlLength
    };
};

export const processNFCeURL = (url) => {
    console.log('Robo iniciando jornada para SEFAZ-PR em paralelo:', url);

    const targetUrl = normalizeSefazUrl(url);

    return new Promise((resolve) => {
        let completed = 0;
        let bestPartialResult = null;
        let resolved = false;

        PROXY_PROVIDERS.forEach(async (proxy) => {
            try {
                const proxyUrl = proxy.buildUrl(targetUrl);
                const response = await fetchWithTimeout(proxyUrl);
                
                if (resolved) return;

                if (response.ok) {
                    const html = await proxy.readBody(response);
                    
                    if (resolved) return;

                    if (html && html.length >= HTML_FALLBACK_MIN_LENGTH) {
                        const document = new DOMParser().parseFromString(html, 'text/html');
                        const result = buildExtractionResult(document, targetUrl, html, proxy.name);

                        if (!result.isPartial) {
                            resolved = true;
                            return resolve(result);
                        }

                        console.warn(`Proxy ${proxy.name} retornou importacao parcial.`, result.partialReasons);

                        if (!bestPartialResult || result.extractionScore > bestPartialResult.extractionScore) {
                            bestPartialResult = result;
                        }
                    } else {
                        console.warn(`Proxy ${proxy.name} retornou HTML insuficiente.`);
                    }
                } else {
                    console.warn(`Proxy ${proxy.name} respondeu com status ${response.status}.`);
                }
            } catch (error) {
                if (!resolved) {
                    console.warn(`Proxy ${proxy.name} falhou...`, error.message);
                }
            } finally {
                completed++;
                if (completed === PROXY_PROVIDERS.length && !resolved) {
                    resolved = true;
                    if (bestPartialResult) {
                        resolve(bestPartialResult);
                    } else {
                        resolve(tryExtractFromURL(targetUrl));
                    }
                }
            }
        });
    });
};

const tryExtractFromURL = (url) => {
    const query = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(query);
    const accessKey = url.match(/[0-9]{44}/)?.[0] || `PR-URL-${Date.now()}`;
    const totalValue = parseBrazilianNumber(params.get('vTotal') || '0');

    return {
        establishment: 'Consulta PR (Acesso Manual Necessario)',
        date: new Date().toISOString(),
        totalValue,
        accessKey,
        receiptNumber: 'NFC-e',
        paymentMethod: PAYMENT_METHOD_NOT_INFORMED,
        products: [],
        isPartial: true,
        partialReasons: ['fallback por URL sem itens da nota'],
        partialMessage: 'Nao foi possivel obter o HTML completo da NFC-e. Nenhum dado foi salvo. Tente novamente.',
        extractionScore: -100,
        proxyUsed: 'url-fallback',
        htmlLength: 0
    };
};

export const autoCategorize = (productName) => {
    const categories = [
        {
            keywords: ['arroz', 'feijao', 'carne', 'frango', 'peixe', 'macarrao', 'farinha', 'sal', 'acucar', 'oleo', 'azeite'],
            category: 'Alimentação'
        },
        {
            keywords: ['leite', 'queijo', 'presunto', 'mortadela', 'iogurte', 'manteiga', 'requeijao'],
            category: 'Açougue e Frios'
        },
        {
            keywords: ['pao', 'bolo', 'doce', 'salgado', 'biscoito', 'bolacha', 'torrada'],
            category: 'Padaria e Lanches'
        },
        {
            keywords: ['refrigerante', 'suco', 'cerveja', 'vinho', 'whisky', 'vodka', 'agua', 'energetico', 'cha', 'cafe'],
            category: 'Bebidas'
        },
        {
            keywords: ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'esponja', 'cloro', 'lustra', 'multiuso'],
            category: 'Higiene e Limpeza'
        },
        {
            keywords: ['shampoo', 'sabonete', 'pasta', 'escova', 'desodorante', 'creme', 'fio dental', 'absorvente', 'fralda', 'barbear'],
            category: 'Higiene e Limpeza'
        },
        {
            keywords: ['alface', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'fruta', 'maca', 'banana', 'laranja', 'limao'],
            category: 'Hortifruti'
        },
        {
            keywords: ['remedio', 'medicamento', 'vitamina', 'aspirina', 'dorflex', 'dipirona', 'curativo', 'gaze', 'soro', 'farmacia'],
            category: 'Farmácia e Saúde'
        },
        {
            keywords: ['gasolina', 'alcool', 'etanol', 'diesel', 'gnv', 'lubrificante', 'oleo motor'],
            category: 'Combustível'
        },
        {
            keywords: ['racao', 'pet', 'cachorro', 'gato', 'coleira', 'brinquedo pet', 'areia'],
            category: 'Pet Shop'
        },
        {
            keywords: ['camiseta', 'calca', 'meia', 'cueca', 'calcinha', 'tenis', 'sapato', 'bolsa', 'bone', 'relogio'],
            category: 'Vestuário e Acessórios'
        },
        {
            keywords: ['celular', 'fone', 'carregador', 'mouse', 'teclado', 'monitor', 'televisao', 'bateria', 'pilha'],
            category: 'Eletrônicos e Celular'
        },
        {
            keywords: ['copo', 'prato', 'panela', 'talher', 'toalha', 'lencol', 'travesseiro', 'lampada'],
            category: 'Casa e Decoração'
        },
        {
            keywords: ['uber', 'onibus', 'metro', 'trem', 'estacionamento', 'pedagio', 'passagem'],
            category: 'Transporte'
        },
        {
            keywords: ['caderno', 'lapis', 'caneta', 'borracha', 'papel', 'envelope', 'livro', 'revista'],
            category: 'Papelaria e Escritório'
        },
        {
            keywords: ['brinquedo', 'boneca', 'carinho', 'jogo', 'presente'],
            category: 'Brinquedos e Presentes'
        }
    ];

    const normalizedName = (productName || '').toLowerCase();

    for (const category of categories) {
        if (category.keywords.some((keyword) => normalizedName.includes(keyword))) {
            return category.category;
        }
    }

    return 'Outros';
};
