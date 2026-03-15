import Dexie from 'dexie';
import { normalizePaymentMethod } from './utils/paymentMethods';

export const db = new Dexie('AccountingAppDB');

db.version(1).stores({
  receipts: '++id, establishment, date, totalValue, url, &accessKey, receiptNumber',
  products: '++id, receiptId, name, brand, category, unitPrice, quantity, totalValue',
  categories: '++id, name, color'
});

db.version(2).stores({
  receipts: '++id, establishment, date, totalValue, url, &accessKey, receiptNumber',
  products: '++id, receiptId, name, brand, category, unitPrice, quantity, totalValue',
  categories: '++id, name, color',
  productAliases: '++id, leftName, rightName, leftKey, rightKey, &[leftKey+rightKey], createdAt'
});

db.version(3).stores({
  receipts: '++id, establishment, date, totalValue, url, &accessKey, receiptNumber, paymentMethod',
  products: '++id, receiptId, name, brand, category, unitPrice, quantity, totalValue, paymentMethod',
  categories: '++id, name, color',
  productAliases: '++id, leftName, rightName, leftKey, rightKey, &[leftKey+rightKey], createdAt'
}).upgrade(async (tx) => {
  const receiptPaymentMap = new Map();

  const receipts = await tx.table('receipts').toArray();
  await Promise.all(receipts.map((receipt) => {
    const paymentMethod = normalizePaymentMethod(receipt.paymentMethod);
    receiptPaymentMap.set(receipt.id, paymentMethod);

    return tx.table('receipts').put({
      ...receipt,
      paymentMethod
    });
  }));

  const products = await tx.table('products').toArray();
  await Promise.all(products.map((product) => tx.table('products').put({
    ...product,
    paymentMethod: normalizePaymentMethod(product.paymentMethod || receiptPaymentMap.get(product.receiptId))
  })));
});

db.version(5).stores({
  receipts: '++id, establishment, date, totalValue, url, &accessKey, receiptNumber, paymentMethod',
  products: '++id, receiptId, name, brand, category, unitPrice, quantity, totalValue, paymentMethod',
  categories: '++id, name, color',
  productAliases: '++id, leftName, rightName, leftKey, rightKey, &[leftKey+rightKey], createdAt',
  productKnowledge: '++id, &name, category',
  budgets: '&monthKey, amount'
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
