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
        const data = await response.json();
        const html = data.contents;

        // Criamos um elemento temporário para parsear o HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // LÓGICA DE EXTRAÇÃO (Baseada em padrões SEFAZ comuns)
        // Nota: Cada estado pode ter um layout levemente diferente.

        const establishment =
            doc.querySelector('.txtTopo') ||
            doc.querySelector('#u20') ||
            doc.querySelector('.fantasy') ||
            { textContent: "Estabelecimento Desconhecido" };

        const totalValueStr =
            doc.querySelector('.txtMax') ||
            doc.querySelector('.totalNFe') ||
            { textContent: "0,00" };

        const products = [];
        const rows = doc.querySelectorAll('table#tabResult tr, .container-itens');

        rows.forEach(row => {
            const name = row.querySelector('.txtTit, .description, .item-name')?.textContent?.trim();
            const price = row.querySelector('.valor, .unit-price')?.textContent?.trim()?.replace(',', '.');
            const qty = row.querySelector('.Rqtd, .quantity')?.textContent?.trim()?.replace('Qtde.:', '').trim();

            if (name && price) {
                products.push({
                    name: name,
                    brand: "Marca N/A",
                    quantity: parseFloat(qty) || 1,
                    unit: "UN",
                    unitPrice: parseFloat(price) || 0,
                    totalValue: (parseFloat(price) || 0) * (parseFloat(qty) || 1),
                    category: autoCategorize(name)
                });
            }
        });

        // Se o robô não encontrou produtos (site dificultou o acesso), retornamos um erro amigável
        if (products.length === 0) {
            throw new Error("O Robô não conseguiu ler os detalhes desta nota. O site da SEFAZ pode estar bloqueando acessos automáticos.");
        }

        return {
            establishment: establishment.textContent.trim(),
            date: new Date().toISOString(),
            totalValue: parseFloat(totalValueStr.textContent.replace(',', '.')) || 0,
            products: products
        };

    } catch (error) {
        console.error("Erro no Robô:", error);
        // Fallback: Se falhar (CORS ou Layout), ainda avisamos o usuário
        throw error;
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
