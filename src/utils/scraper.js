/**
 * Robot Scraper Utility
 * In a real production environment, this would call a server-side API (Vercel Serverless Function)
 * using Puppeteer or Playwright to bypass CORS and handle dynamic SEFAZ pages.
 */

export const processNFCeURL = async (url) => {
    console.log("Robô processando URL:", url);

    // Simulation of a delay for the "Robot" to work
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mocking the result for demonstration
    // In reality, this would be the output of the SEFAZ scraping
    const mockData = {
        establishment: "Supermercado Exemplo LTDA",
        date: new Date().toISOString(),
        totalValue: 154.50,
        products: [
            { name: "Arroz Integral 1kg", brand: "Tio João", quantity: 2, unit: "UN", unitPrice: 7.50, totalValue: 15.00, category: "Alimentação" },
            { name: "Leite Integral 1L", brand: "Itambé", quantity: 12, unit: "UN", unitPrice: 4.50, totalValue: 54.00, category: "Alimentação" },
            { name: "Detergente Líquido", brand: "Ipê", quantity: 3, unit: "UN", unitPrice: 2.50, totalValue: 7.50, category: "Limpeza" },
            { name: "Papel Higiênico 12un", brand: "Neve", quantity: 1, unit: "FD", unitPrice: 18.00, totalValue: 18.00, category: "Higiene" },
            { name: "Carne Alcatra kg", brand: "Swift", quantity: 1.2, unit: "KG", unitPrice: 50.00, totalValue: 60.00, category: "Alimentação" }
        ]
    };

    return mockData;
};

export const autoCategorize = (productName) => {
    const rules = [
        { keywords: ['arroz', 'feijao', 'leite', 'carne', 'frango', 'pao'], category: 'Alimentação' },
        { keywords: ['detergente', 'sabao', 'amaciante', 'desinfetante'], category: 'Limpeza' },
        { keywords: ['shampoo', 'sabonete', 'pasta', 'escova', 'papel'], category: 'Higiene' },
        { keywords: ['remedio', 'farmacia', 'medicamento'], category: 'Saúde' },
        { keywords: ['gasolina', 'alcool', 'diesel', 'uber', 'onibus'], category: 'Transporte' }
    ];

    const lowerName = productName.toLowerCase();
    for (const rule of rules) {
        if (rule.keywords.some(k => lowerName.includes(k))) {
            return rule.category;
        }
    }
    return 'Outros';
};
