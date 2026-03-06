import Dexie from 'dexie';

export const db = new Dexie('AccountingAppDB');

db.version(1).stores({
  receipts: '++id, establishment, date, totalValue, url',
  products: '++id, receiptId, name, brand, category, unitPrice, quantity, totalValue',
  categories: '++id, name, color'
});

// Seed initial categories
db.on('populate', () => {
  db.categories.bulkAdd([
    { name: 'Alimentação', color: '#FF9800' },
    { name: 'Saúde', color: '#E91E63' },
    { name: 'Educação', color: '#2196F3' },
    { name: 'Transporte', color: '#9C27B0' },
    { name: 'Lazer', color: '#4CAF50' },
    { name: 'Mercado', color: '#3F51B5' },
    { name: 'Vestuário', color: '#795548' },
    { name: 'Outros', color: '#607D8B' }
  ]);
});
