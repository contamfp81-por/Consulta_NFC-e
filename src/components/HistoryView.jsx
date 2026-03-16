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
import { AnimatePresence, motion } from 'framer-motion';

const formatSheetDate = (value) => {
    if (!value) return '';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
};

const formatSheetDateTime = (value) => {
    if (!value) return '';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
};

const resolveEntrySource = (receipt) => (
    String(receipt?.accessKey || '').startsWith('MANUAL-')
    || String(receipt?.receiptNumber || '').toUpperCase() === 'MANUAL'
        ? 'Manual'
        : 'Importado'
);

const AnimatedReceiptPanel = motion.div;

const RECEIPT_EXPORT_COLUMNS = [
    'ID do cupom',
    'Origem do lançamento',
    'Estabelecimento',
    'Data ISO',
    'Data local',
    'Data e hora local',
    'Número do cupom',
    'Chave de acesso',
    'URL de consulta',
    'Forma de pagamento',
    'Valor total do cupom',
    'Quantidade de itens',
    'Soma dos itens',
    'Diferença cupom x itens',
    'Cupom incompleto'
];

const PRODUCT_EXPORT_COLUMNS = [
    'ID do item',
    'ID do cupom',
    'Origem do lançamento',
    'Estabelecimento',
    'Data ISO do cupom',
    'Data local do cupom',
    'Data e hora local do cupom',
    'Número do cupom',
    'Chave de acesso',
    'URL de consulta do cupom',
    'Forma de pagamento do cupom',
    'Valor total do cupom',
    'Quantidade de itens no cupom',
    'Soma dos itens do cupom',
    'Diferença cupom x itens',
    'Cupom incompleto',
    'Forma de pagamento do item',
    'Produto',
    'Marca',
    'Quantidade',
    'Unidade',
    'Preço unitário',
    'Total do item',
    'Categoria',
    'Participação no cupom (%)'
];

const CONSOLIDATED_EXPORT_COLUMNS = [
    'ID do cupom',
    'ID do item',
    'Origem do lançamento',
    'Estabelecimento',
    'Data ISO',
    'Data local',
    'Data e hora local',
    'Número do cupom',
    'Chave de acesso',
    'URL de consulta',
    'Forma de pagamento do cupom',
    'Valor total do cupom',
    'Quantidade de itens no cupom',
    'Soma dos itens do cupom',
    'Diferença cupom x itens',
    'Cupom incompleto',
    'Produto',
    'Marca',
    'Quantidade',
    'Unidade',
    'Preço unitário',
    'Total do item',
    'Categoria',
    'Forma de pagamento do item',
    'Participação do item no cupom (%)'
];

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
        const [allReceipts, allProducts] = await Promise.all([
            db.receipts.toArray(),
            db.products.toArray()
        ]);

        if (!allReceipts.length && !allProducts.length) {
            alert('Não há dados para exportar.');
            return;
        }

        const receiptMap = new Map(allReceipts.map((receipt) => [receipt.id, receipt]));
        const productsByReceiptId = allProducts.reduce((map, product) => {
            if (!map.has(product.receiptId)) {
                map.set(product.receiptId, []);
            }

            map.get(product.receiptId).push(product);
            return map;
        }, new Map());
        const receiptSummaryMap = new Map(
            allReceipts.map((receipt) => {
                const receiptProducts = productsByReceiptId.get(receipt.id) || [];
                const itemsTotalValue = receiptProducts.reduce(
                    (total, product) => total + (Number(product.totalValue) || 0),
                    0
                );

                return [
                    receipt.id,
                    {
                        itemCount: receiptProducts.length,
                        itemsTotalValue,
                        receiptTotalValue: Number(receipt.totalValue) || 0
                    }
                ];
            })
        );
        const sortedReceipts = allReceipts
            .slice()
            .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
        const sortedProducts = allProducts
            .slice()
            .sort((left, right) => {
                const leftReceipt = receiptMap.get(left.receiptId);
                const rightReceipt = receiptMap.get(right.receiptId);
                return String(rightReceipt?.date || '').localeCompare(String(leftReceipt?.date || ''));
            });

        const receiptsSheetRows = sortedReceipts.map((receipt) => {
            const receiptSummary = receiptSummaryMap.get(receipt.id) || {
                itemCount: 0,
                itemsTotalValue: 0,
                receiptTotalValue: Number(receipt.totalValue) || 0
            };

            return {
                'ID do cupom': receipt.id,
                'Origem do lançamento': resolveEntrySource(receipt),
                'Estabelecimento': receipt.establishment || '',
                'Data ISO': receipt.date || '',
                'Data local': formatSheetDate(receipt.date),
                'Data e hora local': formatSheetDateTime(receipt.date),
                'Número do cupom': receipt.receiptNumber || '',
                'Chave de acesso': receipt.accessKey || '',
                'URL de consulta': receipt.url || '',
                'Forma de pagamento': receipt.paymentMethod || '',
                'Valor total do cupom': receiptSummary.receiptTotalValue,
                'Quantidade de itens': receiptSummary.itemCount,
                'Soma dos itens': receiptSummary.itemsTotalValue,
                'Diferença cupom x itens': receiptSummary.receiptTotalValue - receiptSummary.itemsTotalValue,
                'Cupom incompleto': receipt.isPartial ? 'Sim' : 'Não'
            };
        });

        const productsSheetRows = sortedProducts.map((product) => {
            const receipt = receiptMap.get(product.receiptId);
            const receiptSummary = receiptSummaryMap.get(product.receiptId) || {
                itemCount: 0,
                itemsTotalValue: 0,
                receiptTotalValue: Number(receipt?.totalValue) || 0
            };
            const productTotalValue = Number(product.totalValue) || 0;

            return {
                'ID do item': product.id,
                'ID do cupom': product.receiptId,
                'Origem do lançamento': resolveEntrySource(receipt),
                'Estabelecimento': receipt?.establishment || '',
                'Data ISO do cupom': receipt?.date || '',
                'Data local do cupom': formatSheetDate(receipt?.date),
                'Data e hora local do cupom': formatSheetDateTime(receipt?.date),
                'Número do cupom': receipt?.receiptNumber || '',
                'Chave de acesso': receipt?.accessKey || '',
                'URL de consulta do cupom': receipt?.url || '',
                'Forma de pagamento do cupom': receipt?.paymentMethod || '',
                'Valor total do cupom': receiptSummary.receiptTotalValue,
                'Quantidade de itens no cupom': receiptSummary.itemCount,
                'Soma dos itens do cupom': receiptSummary.itemsTotalValue,
                'Diferença cupom x itens': receiptSummary.receiptTotalValue - receiptSummary.itemsTotalValue,
                'Cupom incompleto': receipt?.isPartial ? 'Sim' : 'Não',
                'Forma de pagamento do item': product.paymentMethod || '',
                'Produto': product.name || '',
                'Marca': product.brand || '',
                'Quantidade': Number(product.quantity) || 0,
                'Unidade': product.unit || '',
                'Preço unitário': Number(product.unitPrice) || 0,
                'Total do item': productTotalValue,
                'Categoria': product.category || '',
                'Participação no cupom (%)': receiptSummary.receiptTotalValue > 0
                    ? (productTotalValue / receiptSummary.receiptTotalValue) * 100
                    : 0
            };
        });

        const consolidatedSheetRows = sortedProducts.map((product) => {
            const receipt = receiptMap.get(product.receiptId);
            const receiptSummary = receiptSummaryMap.get(product.receiptId) || {
                itemCount: 0,
                itemsTotalValue: 0,
                receiptTotalValue: Number(receipt?.totalValue) || 0
            };
            const productTotalValue = Number(product.totalValue) || 0;

            return {
                'ID do cupom': receipt?.id ?? '',
                'ID do item': product.id,
                'Origem do lançamento': resolveEntrySource(receipt),
                'Estabelecimento': receipt?.establishment || '',
                'Data ISO': receipt?.date || '',
                'Data local': formatSheetDate(receipt?.date),
                'Data e hora local': formatSheetDateTime(receipt?.date),
                'Número do cupom': receipt?.receiptNumber || '',
                'Chave de acesso': receipt?.accessKey || '',
                'URL de consulta': receipt?.url || '',
                'Forma de pagamento do cupom': receipt?.paymentMethod || '',
                'Valor total do cupom': receiptSummary.receiptTotalValue,
                'Quantidade de itens no cupom': receiptSummary.itemCount,
                'Soma dos itens do cupom': receiptSummary.itemsTotalValue,
                'Diferença cupom x itens': receiptSummary.receiptTotalValue - receiptSummary.itemsTotalValue,
                'Cupom incompleto': receipt?.isPartial ? 'Sim' : 'Não',
                'Produto': product.name || '',
                'Marca': product.brand || '',
                'Quantidade': Number(product.quantity) || 0,
                'Unidade': product.unit || '',
                'Preço unitário': Number(product.unitPrice) || 0,
                'Total do item': productTotalValue,
                'Categoria': product.category || '',
                'Forma de pagamento do item': product.paymentMethod || '',
                'Participação do item no cupom (%)': receiptSummary.receiptTotalValue > 0
                    ? (productTotalValue / receiptSummary.receiptTotalValue) * 100
                    : 0
            };
        });

        exportToExcel(
            {
                sheets: [
                    {
                        name: 'Consolidado',
                        rows: consolidatedSheetRows,
                        columns: CONSOLIDATED_EXPORT_COLUMNS
                    },
                    {
                        name: 'Cupons',
                        rows: receiptsSheetRows,
                        columns: RECEIPT_EXPORT_COLUMNS
                    },
                    {
                        name: 'Itens',
                        rows: productsSheetRows,
                        columns: PRODUCT_EXPORT_COLUMNS
                    }
                ]
            },
            `historico-consulta-nfce-${new Date().toISOString().slice(0, 10)}.xlsx`
        );
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
        
        let targetCategory = newCategory;

        if (newCategory === 'ADD_NEW') {
            const name = prompt('Nome da nova categoria:');
            if (name) {
                await db.categories.add({ name, color: '#607D8B' });
                targetCategory = name;
            } else {
                return;
            }
        }

        await db.products.update(productId, { category: targetCategory });
        
        // Learning System: Store the association
        const product = await db.products.get(productId);
        if (product && product.name) {
            await db.productKnowledge.put({ 
                name: product.name, 
                category: targetCategory 
            });
            console.log(`Sistema aprendeu: ${product.name} -> ${targetCategory}`);
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
                                <AnimatedReceiptPanel
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
                                </AnimatedReceiptPanel>
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
