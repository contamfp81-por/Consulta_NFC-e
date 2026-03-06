/**
 * Robot Scraper Utility - Enhanced for SEFAZ Scraping
 */

export const processNFCeURL = async (url) => {
    console.log("Robô iniciando jornada para SEFAZ:", url);

    try {
        // Para rodar no navegador (Vercel), precisamos de um proxy para evitar erro de CORS
        // Usamos o AllOrigins ou um proxy similar
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

        const response = await fetch(proxyUrl);

        if (!response.ok) throw new Error("Falha na conexão com o servidor proxy.");

        const data = await response.json();
        const html = data.contents;

        if (!html) throw new Error("Não foi possível obter o conteúdo da página.");

        // Criamos um elemento temporário para parsear o HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // LÓGICA DE EXTRAÇÃO (Baseada em padrões SEFAZ comuns)
        // Nota: Cada estado pode ter um layout levemente diferente.

        // Seletores mais abrangentes para diferentes estados
        const establishment =
            doc.querySelector('.txtTopo') ||
            doc.querySelector('#u20') ||
            doc.querySelector('.fantasy') ||
            doc.querySelector('#lblNomeFantasia') ||
            doc.querySelector('.txtLoja') ||
            { textContent: "Estabelecimento via NFC-e" };

        const totalValueStr =
            doc.querySelector('.txtMax') ||
            doc.querySelector('.totalNFe') ||
            doc.querySelector('#lblVlrTotal') ||
            doc.querySelector('.vlrTotal') ||
            { textContent: "0,00" };

        const products = [];
        // Tenta encontrar linhas de tabela ou divs de itens
        const rows = doc.querySelectorAll('table#tabResult tr, .container-itens, .NFCCalculadora tr, #infoConsulta tr');

        rows.forEach(row => {
            const name = row.querySelector('.txtTit, .description, .item-name, .txtNome')?.textContent?.trim();
            const price = row.querySelector('.valor, .unit-price, .txtValUnit')?.textContent?.trim()?.replace(',', '.');
            const qty = (row.querySelector('.Rqtd, .quantity, .txtQtde')?.textContent || '1')
                .replace('Qtde.:', '')
                .replace('Qtd.:', '')
                .trim()
                .replace(',', '.');

            if (name && price) {
                const pUnit = parseFloat(price) || 0;
                const pQty = parseFloat(qty) || 1;
                products.push({
                    name: name,
                    brand: "Marca N/A",
                    quantity: pQty,
                    unit: "UN",
                    unitPrice: pUnit,
                    totalValue: pUnit * pQty,
                    category: autoCategorize(name)
                });
            }
        });

        // Se não encontrou produtos, não trava o app, mas retorna o que tem (ou valores zerados)
        return {
            establishment: establishment.textContent.trim().substring(0, 50),
            date: new Date().toISOString(),
            totalValue: parseFloat(totalValueStr.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) || 0,
            products: products,
            isPartial: products.length === 0
        };

    } catch (error) {
        console.error("Erro no Robô:", error);
        // Em vez de dar erro fatal, retornamos um esqueleto para o usuário não travar
        return {
            establishment: "Erro na Leitura Automática",
            date: new Date().toISOString(),
            totalValue: 0,
            products: [],
            isPartial: true
        };
    }
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
