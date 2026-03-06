import Dexie from 'dexie';

export const db = new Dexie('AccountingAppDB');

db.version(1).stores({
  receipts: '++id, establishment, date, totalValue, url, &accessKey, receiptNumber',
  products: '++id, receiptId, name, brand, category, unitPrice, quantity, totalValue',
  categories: '++id, name, color'
});

// Seed initial categories
db.on('populate', () => {
  db.categories.bulkAdd([
    { name: 'Alimentação', color: '#FF9800' },
    { name: 'Bebidas', color: '#2196F3' },
    { name: 'Higiene e Limpeza', color: '#E91E63' },
    { name: 'Hortifruti', color: '#4CAF50' },
    { name: 'Açougue e Frios', color: '#795548' },
    { name: 'Padaria e Lanches', color: '#FFEB3B' },
    { name: 'Farmácia e Saúde', color: '#F44336' },
    { name: 'Combustível', color: '#607D8B' },
    { name: 'Pet Shop', color: '#9C27B0' },
    { name: 'Vestuário e Acessórios', color: '#3F51B5' },
    { name: 'Eletrônicos e Celular', color: '#00BCD4' },
    { name: 'Casa e Decoração', color: '#009688' },
    { name: 'Lazer e Viagem', color: '#8BC34A' },
    { name: 'Educação e Cultura', color: '#CDDC39' },
    { name: 'Serviços Financeiros', color: '#FFC107' },
    { name: 'Manutenção e Obra', color: '#FF5722' },
    { name: 'Brinquedos e Presentes', color: '#E91E63' },
    { name: 'Automotivo', color: '#795548' },
    { name: 'Papelaria e Escritório', color: '#9E9E9E' },
    { name: 'Outros', color: '#607D8B' }
  ]);
});
