/**
 * Robot Scraper Utility - PR SPECIAL EDITION
 * Optimized for jQuery Mobile layout (SEFAZ-PR) and bypass logic.
 */

// Função auxiliar para extrair texto por rótulo (ex: QR Code PR)
const extractByLabel = (container, label) => {
    const text = container.textContent || "";
    const regex = new RegExp(label + "[:\\s]*([^\\s]+)", "i");
    const match = text.match(regex);
    return match ? match[1].trim() : "";
};

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
    console.log("Robô iniciando jornada para SEFAZ-PR:", url);

    // TRUQUE PR: Força o formato |3|1 para evitar Captcha no portal do Paraná
    let targetUrl = url;
    if (url.includes('fazenda.pr.gov.br') && !url.includes('|3|1')) {
        // Remove a assinatura antiga se houver e coloca a versão simplificada
        targetUrl = url.split('|')[0] + "|3|1";
    }

    const PROXIES = [
        (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://thingproxy.freeboard.io/fetch/${u}`
    ];

    let html = "";
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
            if (html && html.length > 800) break;
        } catch (e) {
            console.warn("Proxy falhou, tentando próximo...");
        }
    }

    if (!html || html.length < 500) {
        return tryExtractFromURL(targetUrl);
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. CHAVE DE ACESSO
        let accessKey = doc.querySelector('.chave, #lblChaveAcesso, .txtChave, .nfe-chave')?.textContent?.replace(/\s/g, '') || "";
        if (!accessKey) {
            accessKey = targetUrl.match(/[0-9]{44}/)?.[0] || "PR-" + Date.now();
        }

        // 2. ESTABELECIMENTO
        const estEl = doc.querySelector('#lblNomeFantasia, #lblRazaoSocial, .txtTopo, .fantasy, h2, h3');
        let establishment = estEl ? estEl.textContent.trim() : "Supermercado (NFC-e PR)";

        // 3. DATA E HORA
        let dateObj = new Date();
        const fullText = doc.body.textContent;
        const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})?/);
        if (dateMatch) {
            const [_, dStr, tStr] = dateMatch;
            const [d, m, y] = dStr.split('/');
            dateObj = new Date(`${y}-${m}-${d}T${tStr || '12:00:00'}`);
        }

        // 4. VALOR TOTAL 
        const totalEl = doc.querySelector('#lblVlrTotal, .txtMax, .totalNFe, #ValorTotal, .vlrTotal');
        let totalValue = totalEl ? parseBrazilianNumber(totalEl.textContent) : 0;
        if (totalValue === 0) {
            const valMatch = fullText.match(/(?:Valor\s?Total|Pagar|Total)[:\s]*R?\$?\s*([\d,.]+)/i);
            if (valMatch) totalValue = parseBrazilianNumber(valMatch[1]);
        }

        // 5. PRODUTOS (Layout Mobile PR)
        const products = [];
        // No layout mobile PR, os itens costumam ser <li> ou ter classes .ui-li
        const rows = doc.querySelectorAll('li, tr, .container-itens, .ui-li-static');

        rows.forEach(row => {
            const rowText = row.textContent || "";
            // Procura por "Qtde.:" ou "UN:" que são fortes indicadores de linha de produto no PR
            if (rowText.includes('Qtde.:') || rowText.includes('Vl. Unit.:')) {
                // Tenta pegar o nome (geralmente é um H3 ou o primeiro texto em negrito)
                const nameEl = row.querySelector('h3, strong, span, .txtTit') || row;
                let name = nameEl.textContent.split('(')[0].trim(); // Remove o código entre parenteses se houver

                // Limpeza se o nome capturado for muito longo ou contiver labels
                if (name.includes('Qtde.:')) name = name.split('Qtde.:')[0].trim();

                const rawQty = extractByLabel(row, 'Qtde.');
                const unit = extractByLabel(row, 'UN');
                const rawPrice = extractByLabel(row, 'Vl. Unit.');

                const pQty = parseBrazilianNumber(rawQty) || 1;
                const pUnit = parseBrazilianNumber(rawPrice);

                if (name && (pUnit > 0 || pQty > 0)) {
                    products.push({
                        name: name,
                        brand: "Marca",
                        quantity: pQty,
                        unit: unit || "UN",
                        unitPrice: pUnit,
                        totalValue: pUnit * pQty,
                        category: autoCategorize(name)
                    });
                }
            }
        });

        // Caso o layout seja o de Tabela (Normal)
        if (products.length === 0) {
            doc.querySelectorAll('tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 3) {
                    const name = tds[0].textContent.trim();
                    const qty = tds[1].textContent.trim();
                    const price = tds[tds.length - 1].textContent.trim();
                    if (name.length > 2 && price.includes(',')) {
                        products.push({
                            name,
                            brand: "Marca",
                            quantity: parseBrazilianNumber(qty) || 1,
                            unit: "UN",
                            unitPrice: parseBrazilianNumber(price) / (parseBrazilianNumber(qty) || 1),
                            totalValue: parseBrazilianNumber(price),
                            category: autoCategorize(name)
                        });
                    }
                }
            });
        }

        return {
            establishment: establishment.substring(0, 50),
            date: dateObj.toISOString(),
            totalValue: totalValue || 0,
            accessKey,
            receiptNumber: doc.body.textContent.match(/n?.?[:\s]+(\d{5,})/i)?.[1] || "S/N",
            products,
            isPartial: products.length === 0
        };

    } catch (error) {
        console.error("Robô falhou no processamento:", error);
        return tryExtractFromURL(targetUrl);
    }
};

const tryExtractFromURL = (url) => {
    const params = new URLSearchParams(url.split('?')[1]);
    const accessKey = url.match(/[0-9]{44}/)?.[0] || "PR-URL-" + Date.now();
    return {
        establishment: "Consulta PR (Acesso Manual Necessário)",
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
        { keywords: ['remedio', 'medicamento', 'vitamina', 'aspirina', 'dorflex', 'dipirona', 'curativo', 'gaze', 'soro', 'farmacia'], category: 'Farmácia e Saúde' },
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
