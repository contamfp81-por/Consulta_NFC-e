import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
    Search,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    ShoppingBag,
    Calendar,
    Store,
    Download,
    Trash2,
    Filter,
    PlusCircle
} from 'lucide-react';
import { exportToExcel } from '../utils/export';
import { motion, AnimatePresence } from 'framer-motion';

const HistoryView = ({ onManualEntry }) => {
    const receipts = useLiveQuery(() => db.receipts.orderBy('date').reverse().toArray()) || [];
    const [expandedReceipt, setExpandedReceipt] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const products = useLiveQuery(async () => {
        if (expandedReceipt) {
            return await db.products.where('receiptId').equals(expandedReceipt).toArray();
        }
        return [];
    }, [expandedReceipt]);

    const allCategories = useLiveQuery(() => db.categories.toArray()) || [];

    const handleExport = async () => {
        const allProducts = await db.products.toArray();
        const allReceipts = await db.receipts.toArray();

        // Join data for Excel
        const exportData = allProducts.map(p => {
            const receipt = allReceipts.find(r => r.id === p.receiptId);
            return {
                'Estabelecimento': receipt?.establishment,
                'Data': new Date(receipt?.date).toLocaleDateString(),
                'Produto': p.name,
                'Marca': p.brand,
                'Qtd': p.quantity,
                'Unid': p.unit,
                'Preço Unit': p.unitPrice,
                'Total': p.totalValue,
                'Categoria': p.category
            };
        });

        exportToExcel(exportData);
    };

    const deleteReceipt = async (id, e) => {
        e.stopPropagation();
        if (window.confirm('Deseja excluir este cupom?')) {
            await db.receipts.delete(id);
            await db.products.where('receiptId').equals(id).delete();
            if (expandedReceipt === id) setExpandedReceipt(null);
        }
    };

    const updateCategory = async (productId, newCategory, e) => {
        if (e) e.stopPropagation();
        if (newCategory === 'ADD_NEW') {
            // This will be handled by settings or a quick prompt
            const name = prompt('Nome da nova categoria:');
            if (name) {
                await db.categories.add({ name, color: '#607D8B' });
                await db.products.update(productId, { category: name });
            }
        } else {
            await db.products.update(productId, { category: newCategory });
        }
    };

    const filteredReceipts = receipts.filter(r =>
        r.establishment.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="animate-slide-up">
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por loja..."
                        className="glass-card"
                        style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '12px', border: 'none' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    className="btn-primary"
                    style={{ width: '50px', padding: 0, borderRadius: '12px' }}
                    onClick={onManualEntry}
                    title="Nova Despesa Manual"
                >
                    <PlusCircle size={24} />
                </button>
                <button
                    className="glass-card"
                    style={{ padding: '12px', margin: 0, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={handleExport}
                    title="Exportar para Excel"
                >
                    <Download size={20} color="var(--primary-blue)" />
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {filteredReceipts.map(receipt => (
                    <div
                        key={receipt.id}
                        className="glass-card"
                        style={{ padding: '15px', cursor: 'pointer' }}
                        onClick={() => setExpandedReceipt(expandedReceipt === receipt.id ? null : receipt.id)}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Store size={16} color="var(--primary-blue)" />
                                    <h4 style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                                        {receipt.establishment}
                                    </h4>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '5px', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Calendar size={12} /> {new Date(receipt.date).toLocaleDateString()}
                                    </span>
                                    <span className="badge badge-success">
                                        R$ {receipt.totalValue.toFixed(2)}
                                    </span>
                                    {receipt.isPartial && (
                                        <span className="badge" style={{ background: '#FF9800', color: 'white' }}>
                                            Incompleto
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                    onClick={(e) => deleteReceipt(receipt.id, e)}
                                    style={{ background: 'none', border: 'none', color: '#ff5252' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                                {expandedReceipt === receipt.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>
                        </div>

                        <AnimatePresence>
                            {expandedReceipt === receipt.id && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    style={{ overflow: 'hidden', marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}
                                >
                                    <p style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '10px', color: 'var(--primary-blue)' }}>ITENS DO CUPOM</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {products.map(product => (
                                            <div key={product.id} style={{ fontSize: '0.85rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontWeight: '500' }}>{product.name}</span>
                                                    <span style={{ fontWeight: '700' }}>R$ {product.totalValue.toFixed(2)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                                        {product.quantity} {product.unit} x R$ {product.unitPrice.toFixed(2)}
                                                    </span>
                                                    <select
                                                        value={product.category}
                                                        onChange={(e) => updateCategory(product.id, e.target.value, e)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            padding: '4px 8px',
                                                            borderRadius: '8px',
                                                            border: '1px solid #ddd',
                                                            maxWidth: '120px',
                                                            background: 'white'
                                                        }}
                                                    >
                                                        {allCategories.map(cat => (
                                                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                                                        ))}
                                                        <option value="ADD_NEW">+ Nova Categoria</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}

                {receipts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-light)' }}>
                        <ShoppingBag size={48} style={{ opacity: 0.2, marginBottom: '10px' }} />
                        <p>Nenhum cupom ou despesa ainda.</p>
                        <p style={{ fontSize: '0.8rem' }}>Escaneie um cupom ou clique no botão "+" para incluir manualmente.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HistoryView;
