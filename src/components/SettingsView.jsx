import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Trash2, Plus, Info } from 'lucide-react';

const Settings = () => {
    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const [newCatName, setNewCatName] = useState('');

    const addCategory = async () => {
        if (newCatName.trim()) {
            await db.categories.add({ name: newCatName.trim(), color: '#607D8B' });
            setNewCatName('');
        }
    };

    const deleteCategory = async (id) => {
        if (window.confirm('Excluir esta categoria?')) {
            await db.categories.delete(id);
        }
    };

    return (
        <div className="animate-slide-up">
            <div className="glass-card">
                <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    Gerenciar Categorias
                </h3>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input
                        type="text"
                        placeholder="Nova categoria..."
                        className="glass-card"
                        style={{ flex: 1, padding: '12px', margin: 0, borderRadius: '12px', border: '1px solid #ddd' }}
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                    />
                    <button
                        className="btn-primary"
                        style={{ width: '50px', padding: 0 }}
                        onClick={addCategory}
                    >
                        <Plus size={24} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {categories.map(cat => (
                        <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                            <span>{cat.name}</span>
                            <button
                                onClick={() => deleteCategory(cat.id)}
                                style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="glass-card" style={{ background: 'var(--primary-blue)', color: 'white', marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <Info size={24} color="var(--secondary-cyan)" />
                    <h4 style={{ color: 'white' }}>Sobre o App</h4>
                </div>
                <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                    Sistema de Gestão Contábil Inteligente com leitura de NFC-e.
                </p>
                <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: '600' }}>Desenvolvido por Márcio F Pereira</p>
                    <p style={{ fontSize: '0.7rem', opacity: 0.7 }}>v1.0.0 | Arquiteto de Software</p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
