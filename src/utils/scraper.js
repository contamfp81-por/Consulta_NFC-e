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
        { keywords: ['arroz', 'feijao', 'leite', 'carne', 'frango', 'pao', 'biscoito', 'macarrao'], category: 'Alimentação' },
        { keywords: ['detergente', 'sabao', 'amaciante', 'desinfetante', 'veja', 'limpador'], category: 'Limpeza' },
        { keywords: ['shampoo', 'sabonete', 'pasta', 'escova', 'papel', 'desodorante', 'creme'], category: 'Higiene' },
        { keywords: ['remedio', 'farmacia', 'medicamento', 'aspirina', 'curativo'], category: 'Saúde' },
        { keywords: ['gasolina', 'alcool', 'diesel', 'uber', 'onibus', 'estacionamento'], category: 'Transporte' },
        { keywords: ['cerveja', 'vinho', 'refrigerante', 'suco', 'agua'], category: 'Bebidas' }
    ];

    const lowerName = productName.toLowerCase();
    for (const rule of rules) {
        if (rule.keywords.some(k => lowerName.includes(k))) {
            return rule.category;
        }
    }
    return 'Mercado';
};
