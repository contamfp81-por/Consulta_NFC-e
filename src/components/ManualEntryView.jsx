import React, { useState } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Save, X, Store, Calendar, QrCode, Wallet } from 'lucide-react';
import { PAYMENT_METHOD_NOT_INFORMED, PAYMENT_METHOD_OPTIONS, normalizePaymentMethod } from '../utils/paymentMethods';

const ManualEntryView = ({ onComplete, onCancel, onScan }) => {
    const [establishment, setEstablishment] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHOD_NOT_INFORMED);
    const [products, setProducts] = useState(() => ([
        { id: Date.now(), name: '', quantity: 1, unit: 'UN', unitPrice: 0, totalValue: 0, category: 'Outros' }
    ]));

    const categories = useLiveQuery(() => db.categories.toArray()) || [];

    const addProduct = () => {
        setProducts([...products, {
            id: Date.now(),
            name: '',
            quantity: 1,
            unit: 'UN',
            unitPrice: 0,
            totalValue: 0,
            category: 'Outros'
        }]);
    };

    const removeProduct = (id) => {
        if (products.length > 1) {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    const updateProduct = async (id, field, value) => {
        let categoryToUpdate = null;
        
        // Suggest category if name changes and matches something in knowledge base
        if (field === 'name' && value.length > 2) {
            const learned = await db.productKnowledge.get({ name: value });
            if (learned) {
                categoryToUpdate = learned.category;
            }
        }

        setProducts(currentProducts => currentProducts.map(p => {
            if (p.id === id) {
                const updated = { ...p, [field]: value };
                if (categoryToUpdate) {
                    updated.category = categoryToUpdate;
                }
                if (field === 'quantity' || field === 'unitPrice') {
                    updated.totalValue = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unitPrice) || 0);
                }
                return updated;
            }
            return p;
        }));
    };

    const calculateTotal = () => {
        return products.reduce((acc, p) => acc + (parseFloat(p.unitPrice || 0) * parseFloat(p.quantity || 0)), 0);
    };

    const handleSave = async () => {
        if (!establishment) {
            alert('Por favor, informe o estabelecimento.');
            return;
        }

        try {
            const receiptId = await db.receipts.add({
                establishment,
                date: new Date(date).toISOString(),
                totalValue: calculateTotal(),
                url: '',
                accessKey: 'MANUAL-' + Date.now(),
                receiptNumber: 'MANUAL',
                paymentMethod: normalizePaymentMethod(paymentMethod),
                isPartial: false
            });

            const productsToSave = products.map(p => ({
                name: p.name || 'Produto Sem Nome',
                brand: 'Marca',
                quantity: parseFloat(p.quantity) || 0,
                unit: p.unit || 'UN',
                unitPrice: parseFloat(p.unitPrice) || 0,
                totalValue: (parseFloat(p.unitPrice) || 0) * (parseFloat(p.quantity) || 0),
                category: p.category,
                paymentMethod: normalizePaymentMethod(paymentMethod),
                receiptId
            }));

            await db.products.bulkAdd(productsToSave);
            
            // Learning System: Update knowledge base for each product saved
            await Promise.all(productsToSave.map(p => 
                db.productKnowledge.put({ name: p.name, category: p.category })
            ));

            onComplete();
        } catch (err) {
            console.error("Erro ao salvar manual:", err);
            alert("Erro ao salvar a despesa.");
        }
    };

    return (
        <div className="animate-slide-up">
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button
                    className="glass-card"
                    style={{
                        flex: 1,
                        padding: '15px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        border: '1px solid var(--primary-blue)',
                        color: 'var(--primary-blue)',
                        background: 'white',
                        fontWeight: '600'
                    }}
                    onClick={() => onScan && onScan()}
                >
                    <QrCode size={20} /> Escanear QR Code
                </button>
            </div>

            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>Inserir Despesa Manual</h3>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-light)' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div className="input-group">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'block', marginBottom: '5px' }}>Estabelecimento</label>
                        <div style={{ position: 'relative' }}>
                            <Store size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-blue)' }} />
                            <input
                                type="text"
                                className="glass-card"
                                style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '10px', fontSize: '1rem' }}
                                placeholder="Ex: Supermercado Silva"
                                value={establishment}
                                onChange={(e) => setEstablishment(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'block', marginBottom: '5px' }}>Data da Compra</label>
                        <div style={{ position: 'relative' }}>
                            <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-blue)' }} />
                            <input
                                type="date"
                                className="glass-card"
                                style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '10px', fontSize: '1rem' }}
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'block', marginBottom: '5px' }}>Forma de Pagamento</label>
                        <div style={{ position: 'relative' }}>
                            <Wallet size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-blue)' }} />
                            <select
                                className="glass-card"
                                style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '10px', fontSize: '1rem', background: 'white' }}
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                            >
                                {PAYMENT_METHOD_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ margin: 0 }}>Produtos</h4>
                    <button className="btn-primary" onClick={addProduct} style={{ width: 'auto', padding: '8px 15px', fontSize: '0.85rem' }}>
                        <Plus size={18} /> Add
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {products.map((p, index) => (
                        <div key={p.id} style={{ padding: '15px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--primary-blue)' }}>ITEM #{index + 1}</span>
                                <button onClick={() => removeProduct(p.id)} style={{ background: 'none', border: 'none', color: '#ff5252' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <input
                                type="text"
                                placeholder="Nome do produto"
                                className="glass-card"
                                style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}
                                value={p.name}
                                onChange={(e) => updateProduct(p.id, 'name', e.target.value)}
                            />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Qtd</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="glass-card"
                                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}
                                        value={p.quantity}
                                        onChange={(e) => updateProduct(p.id, 'quantity', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Preço Unit.</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="glass-card"
                                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}
                                        value={p.unitPrice}
                                        onChange={(e) => updateProduct(p.id, 'unitPrice', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Unidade (UN, KG...)</label>
                                    <input
                                        type="text"
                                        className="glass-card"
                                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}
                                        value={p.unit}
                                        onChange={(e) => updateProduct(p.id, 'unit', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Categoria</label>
                                    <select
                                        className="glass-card"
                                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ddd', background: 'white' }}
                                        value={p.category}
                                        onChange={(e) => updateProduct(p.id, 'category', e.target.value)}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginTop: '10px', textAlign: 'right', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--primary-blue)' }}>
                                Subtotal: R$ {(parseFloat(p.quantity || 0) * parseFloat(p.unitPrice || 0)).toFixed(2)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="glass-card" style={{ background: 'var(--primary-blue)', color: 'white', position: 'sticky', bottom: '100px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
                <div>
                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Total Geral</span>
                    <h2 style={{ margin: 0, color: 'white' }}>R$ {calculateTotal().toFixed(2)}</h2>
                </div>
                <button className="btn-primary" style={{ background: 'white', color: 'var(--primary-blue)', width: 'auto', padding: '12px 25px' }} onClick={handleSave}>
                    <Save size={20} /> Salvar
                </button>
            </div>
        </div>
    );
};

export default ManualEntryView;
