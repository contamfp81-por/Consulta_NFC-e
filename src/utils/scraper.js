/**
 * Robot Scraper Utility - Enhanced for SEFAZ-PR Resilience
 */

const PROXIES = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
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
    console.log("Robô iniciando jornada para SEFAZ-PR:", url);
    let html = "";
    let lastError = null;

    // Tentativa com múltiplos proxies para garantir acesso
    for (const proxyFn of PROXIES) {
        try {
            const proxyUrl = proxyFn(url);
            const response = await fetch(proxyUrl);
            if (!response.ok) continue;

            // Tratamento específico para allorigins que envelopa o JSON
            if (proxyUrl.includes('allorigins')) {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }

            if (html && html.length > 500) break; // Sucesso se tiver conteúdo substancial
        } catch (e) {
            lastError = e;
            console.warn("Proxy falhou, tentando o próximo...");
        }
    }

    if (!html) {
        console.error("Todos os proxies falharam ou retornaram vazio.");
        // Fallback: Tenta extrair dados diretamente do URL (PR envia alguns dados no link)
        return tryExtractFromURL(url);
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. CHAVE DE ACESSO
        let accessKey = doc.querySelector('.chave, #lblChaveAcesso, .txtChave, .nfe-chave, .access-key')?.textContent?.replace(/\s/g, '') || "";
        if (!accessKey) {
            const keyMatch = url.match(/[0-9]{44}/);
            accessKey = keyMatch ? keyMatch[0] : "CHAVE-" + Date.now();
        }

        // 2. NÚMERO DA NOTA
        const nReceipt = doc.querySelector('#lblNF, .txtNF, .nfe-info, .nfe-numero, #lblNumero')?.textContent?.match(/\d+/)?.[0] ||
            doc.body.textContent.match(/NFC-e\s?n?o?[:\s]+(\d+)/i)?.[1] || "S/N";

        // 3. ESTABELECIMENTO
        let establishment =
            doc.querySelector('#lblNomeFantasia') ||
            doc.querySelector('.txtTopo') ||
            doc.querySelector('#u20') ||
            doc.querySelector('.fantasy') ||
            doc.querySelector('.txtLoja') ||
            doc.querySelector('#lblRazaoSocial') ||
            doc.querySelector('h2, h3');

        let estName = establishment?.textContent?.trim() || "Estabelecimento via NFC-e";
        if (estName.length < 3 || estName.includes('Consulta')) {
            // Busca por CNPJ seguido de nome se o seletor falhar
            const estMatch = doc.body.textContent.match(/(?:CNPJ|Emitente)[:\s]+([\d./-]+)\s+([A-Z0-9\s]+)/i);
            if (estMatch) estName = estMatch[2].trim();
        }

        // 4. DATA E HORA
        let processedDate = new Date();
        const dateMatch = doc.body.textContent.match(/(\d{2}\/\d{2}\/\d{4})/);
        const timeMatch = doc.body.textContent.match(/(\d{2}:\d{2}:\d{2})/);
        if (dateMatch) {
            const [day, month, year] = dateMatch[1].split('/');
            const timeStr = timeMatch ? timeMatch[1] : '12:00:00';
            processedDate = new Date(`${year}-${month}-${day}T${timeStr}`);
        }

        // 5. VALOR TOTAL (Busca mais agressiva por texto se seletores falharem)
        let totalValue = 0;
        const totalValueEl = doc.querySelector('#lblVlrTotal, .txtMax, .totalNFe, .vlrTotal, #ValorTotal');
        if (totalValueEl) {
            totalValue = parseBrazilianNumber(totalValueEl.textContent);
        } else {
            const valMatch = doc.body.textContent.match(/(?:Valor\s?Total|Pagar|Total)[:\s]*R?\$?\s*([\d,.]+)/i);
            if (valMatch) totalValue = parseBrazilianNumber(valMatch[1]);
        }

        const products = [];
        const rows = doc.querySelectorAll('table#tabResult tr, .container-itens, .NFCCalculadora tr, #infoConsulta tr, .table-itens tr, #itens tr, #tabelaItens tr');

        rows.forEach(row => {
            const nameEl = row.querySelector('.txtTit, .description, .item-name, .txtNome, .NM-PRODUTO, .nf-item-nome, #lblDescricao');
            const priceEl = row.querySelector('.valor, .unit-price, .txtValUnit, .VL-UNITARIO, .nf-item-valor, #lblVlrUnit');
            const qtyEl = row.querySelector('.Rqtd, .quantity, .txtQtde, .QT-ITEM, .nf-item-qtd, #lblQuantidade');
            const unitEl = row.querySelector('.runid, .measure-unit, .txtUnid, .UN-MEDIDA, .nf-item-un, #lblUnidade');

            if (nameEl && (priceEl || qtyEl)) {
                const name = nameEl.textContent.trim();
                if (name && !name.includes('Desconto')) {
                    const pUnit = parseBrazilianNumber(priceEl?.textContent || '0');
                    const pQty = parseBrazilianNumber(qtyEl?.textContent || '1');
                    const unit = unitEl?.textContent?.trim().slice(0, 3).toUpperCase() || "UN";

                    products.push({
                        name: name,
                        brand: "Marca",
                        quantity: pQty,
                        unit: unit,
                        unitPrice: pUnit,
                        totalValue: pUnit * pQty,
                        category: autoCategorize(name)
                    });
                }
            }
        });

        // Se falhou a busca por seletores, tenta regex nas tabelas
        if (products.length === 0) {
            doc.querySelectorAll('tr').forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('td'));
                if (cells.length >= 3) {
                    const txt = tr.textContent.toUpperCase();
                    if (txt.includes(',') && (txt.includes('UN') || txt.includes('KG') || txt.includes('LT'))) {
                        const name = cells[0].textContent.trim();
                        const valStr = cells[cells.length - 1].textContent;
                        const pVal = parseBrazilianNumber(valStr);
                        if (name.length > 3 && pVal > 0) {
                            products.push({
                                name: name,
                                brand: "Marca",
                                quantity: 1,
                                unit: "UN",
                                unitPrice: pVal,
                                totalValue: pVal,
                                category: autoCategorize(name)
                            });
                        }
                    }
                }
            });
        }

        return {
            establishment: estName.substring(0, 50),
            date: processedDate.toISOString(),
            totalValue: totalValue || 0,
            accessKey: accessKey,
            receiptNumber: nReceipt,
            products: products,
            isPartial: products.length === 0
        };

    } catch (error) {
        console.error("Erro no processamento do HTML:", error);
        return tryExtractFromURL(url);
    }
};

const tryExtractFromURL = (url) => {
    // Alguns URLs do PR têm vTotal=... ou outros dados
    const params = new URLSearchParams(url.split('?')[1]);
    const accessKey = url.match(/[0-9]{44}/)?.[0] || "ERRO-" + Date.now();

    return {
        establishment: "Leitura via URL (Site SEFAZ Bloqueado)",
        date: new Date().toISOString(),
        totalValue: parseFloat(params.get('vTotal')) || 0,
        accessKey: accessKey,
        receiptNumber: "S/N",
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
