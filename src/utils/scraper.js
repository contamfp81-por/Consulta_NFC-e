/**
 * Robot Scraper Utility - ULTIMATE RESILIENCE for SEFAZ-PR
 * This version uses an improved CORS proxy and handles PR's specific HTML structure.
 */

// Usando um proxy mais estável e rápido para o PR
const PROXIES = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://cors-anywhere.herokuapp.com/${url}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`
];

const parseBrazilianNumber = (text) => {
    if (!text) return 0;
    let cleaned = text.trim().replace(/[^\d.,-]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
    }
    return parseFloat(cleaned) || 0;
};

export const processNFCeURL = async (url) => {
    console.log("Robô iniciando jornada para SEFAZ-PR (Acesso Direto):", url);

    // Pequeno ajuste no URL do PR se necessário (garantir que seja a consulta completa)
    let targetUrl = url;
    if (url.includes('qrcode')) {
        // Algumas URLs do PR precisam ser "traduzidas" para a página de consulta completa se o proxy barrar o redirecionamento
        console.log("Detectado link de QR Code PR, preparando extração profunda...");
    }

    let html = "";

    // Tenta obter o HTML através dos proxies
    for (const proxyFn of PROXIES) {
        try {
            const proxyUrl = proxyFn(targetUrl);
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;

            if (proxyUrl.includes('allorigins')) {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }

            if (html && html.length > 1000) break;
        } catch (e) {
            console.warn("Proxy falhou na tentativa, tentando próximo...");
        }
    }

    // Se falhou em pegar o HTML, vamos extrair o que dá do URL (Melhorado)
    if (!html || html.length < 500) {
        return tryExtractFromURL(targetUrl);
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // --- LÓGICA ESPECÍFICA PARA O PORTAL PR (fazenda.pr.gov.br) ---

        // 1. CHAVE DE ACESSO
        let accessKey = doc.querySelector('.chave, #lblChaveAcesso, .txtChave, .nfe-chave, .access-key')?.textContent?.replace(/\s/g, '') || "";
        if (!accessKey) {
            accessKey = targetUrl.match(/[0-9]{44}/)?.[0] || "PR-" + Date.now();
        }

        // 2. ESTABELECIMENTO (PR usa muito #lblNomeFantasia ou #lblRazaoSocial)
        const estEl = doc.querySelector('#lblNomeFantasia, #lblRazaoSocial, .txtTopo, .fantasy, #u20');
        let establishment = estEl ? estEl.textContent.trim() : "Supermercado (NFC-e PR)";

        // 3. DATA E HORA
        let dateObj = new Date();
        const fullText = doc.body.textContent;
        const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
        if (dateMatch) {
            const [_, dStr, tStr] = dateMatch;
            const [d, m, y] = dStr.split('/');
            dateObj = new Date(`${y}-${m}-${d}T${tStr}`);
        } else {
            const onlyDate = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (onlyDate) {
                const [d, m, y] = onlyDate[1].split('/');
                dateObj = new Date(`${y}-${m}-${d}T12:00:00`);
            }
        }

        // 4. VALOR TOTAL (#lblVlrTotal no PR)
        const totalEl = doc.querySelector('#lblVlrTotal, .txtMax, .totalNFe, #ValorTotal');
        const totalValue = totalEl ? parseBrazilianNumber(totalEl.textContent) : 0;

        // 5. PRODUTOS (No PR ficam em tabelas com ID #tabResult ou dentro de #itens)
        const products = [];
        const rows = doc.querySelectorAll('#tabResult tr, #itens tr, .NFCCalculadora tr, table tr');

        rows.forEach(row => {
            // No PR o nome fica em .txtTit ou #lblDescricao
            const nameEl = row.querySelector('.txtTit, #lblDescricao, .NM-PRODUTO, .description');
            const priceEl = row.querySelector('.valor, #lblVlrUnit, .VL-UNITARIO, .unit-price');
            const qtyEl = row.querySelector('.Rqtd, #lblQuantidade, .QT-ITEM, .quantity');
            const unitEl = row.querySelector('.runid, #lblUnidade, .UN-MEDIDA, .measure-unit');

            if (nameEl && (priceEl || qtyEl)) {
                const name = nameEl.textContent.trim();
                if (name && !name.includes('Desconto') && !name.includes('TOTAL')) {
                    const price = parseBrazilianNumber(priceEl?.textContent || '0');
                    const qty = parseBrazilianNumber(qtyEl?.textContent || '1');
                    const unit = unitEl?.textContent?.trim().toUpperCase() || "UN";

                    products.push({
                        name,
                        brand: "Marca",
                        quantity: qty,
                        unit: unit.substring(0, 3),
                        unitPrice: price,
                        totalValue: price * qty,
                        category: autoCategorize(name)
                    });
                }
            }
        });

        // Se o valor total for 0, tenta pegar o que sobrou no texto
        let finalTotal = totalValue;
        if (finalTotal === 0) {
            const fallbackTotal = fullText.match(/(?:TOTAL|Pagar|VALOR)[:\s]*R?\$?\s*([\d,.]+)/i);
            if (fallbackTotal) finalTotal = parseBrazilianNumber(fallbackTotal[1]);
        }

        return {
            establishment,
            date: dateObj.toISOString(),
            totalValue: finalTotal,
            accessKey,
            receiptNumber: doc.querySelector('#lblNumero, #lblNF')?.textContent?.match(/\d+/)?.[0] || "S/N",
            products,
            isPartial: products.length === 0
        };

    } catch (error) {
        console.error("Robô falhou no processamento:", error);
        return tryExtractFromURL(targetUrl);
    }
};

const tryExtractFromURL = (url) => {
    // Recuperação de dados via URL para PR (vTotal é comum em links de QR Code)
    const params = new URLSearchParams(url.split('?')[1]);
    const accessKey = url.match(/[0-9]{44}/)?.[0] || "PR-URL-" + Date.now();

    return {
        establishment: "Consulta PR (Aguardando Captura)",
        date: new Date().toISOString(),
        totalValue: parseBrazilianNumber(params.get('vTotal') || '0'),
        accessKey,
        receiptNumber: "NFC-e",
        products: [],
        isPartial: true
    };
};

export const autoCategorize = (productName) => {
    const rules = [
        { keywords: ['arroz', 'feijao', 'carne', 'frango', 'peixe', 'macarrao', 'farinha', 'sal', 'acucar', 'oleo', 'azeite'], category: 'Alimentação' },
        { keywords: ['leite', 'queijo', 'presunto', 'mortadela', 'iogurte', 'manteiga', 'requeijao'], category: 'Açougue e Frios' },
        { keywords: ['pao', 'bolo', 'doce', 'salgado', 'biscoito', 'bolacha', 'torrada'], category: 'Padaria e Lanches' },
        { keywords: ['refrigerante', 'suco', 'cerveja', 'vinho', 'whisky', 'vodka', 'agua', 'energetico', 'cha', 'cafe'], category: 'Bebidas' },
        { keywords: ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'esponja', 'cloro', 'lustra', 'multiuso'], category: 'Higiene e Limpeza' },
        { keywords: ['shampoo', 'sabonete', 'pasta', 'escova', 'desodorante', 'creme', 'fio dental', 'absorvente', 'fralda', 'barbear'], category: 'Higiene e Limpeza' },
        { keywords: ['alface', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'fruta', 'maca', 'banana', 'laranja', 'limao'], category: 'Hortifruti' },
        { keywords: ['remedio', 'medicamento', 'vitamina', 'aspirina', 'dorflex', 'dipirona', 'curativo', 'gaze', 'soro'], category: 'Farmácia e Saúde' },
        { keywords: ['gasolina', 'alcool', 'etanol', 'diesel', 'gnv', 'lubrificante', 'oleo motor'], category: 'Combustível' },
        { keywords: ['racao', 'pet', 'cachorro', 'gato', 'coleira', 'brinquedo pet', 'areia'], category: 'Pet Shop' },
        { keywords: ['camiseta', 'calca', 'meia', 'cueca', 'calcinha', 'tenis', 'sapato', 'bolsa', 'bone', 'relogio'], category: 'Vestuário e Acessórios' },
        { keywords: ['celular', 'fone', 'carregador', 'mouse', 'teclado', 'monitor', 'televisao', 'bateria', 'pilha'], category: 'Eletrônicos e Celular' },
        { keywords: ['copo', 'prato', 'panela', 'talher', 'toalha', 'lencol', 'travesseiro', 'lampada'], category: 'Casa e Decoração' },
        { keywords: ['uber', 'onibus', 'metro', 'trem', 'estacionamento', 'pedagio', 'passagem'], category: 'Transporte' },
        { keywords: ['caderno', 'lapis', 'caneta', 'borracha', 'papel', 'envelope', 'livro', 'revista'], category: 'Papelaria e Escritório' },
        { keywords: ['brinquedo', 'boneca', 'carinho', 'jogo', 'presente'], category: 'Brinquedos e Presentes' }
    ];

    const lowerName = productName.toLowerCase();
    for (const rule of rules) {
        if (rule.keywords.some(k => lowerName.includes(k))) {
            return rule.category;
        }
    }
    return 'Outros';
};
