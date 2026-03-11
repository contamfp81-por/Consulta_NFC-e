import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Trash2, Plus, Info } from 'lucide-react';
import { buildProductGrouping, createProductAliasPair } from '../utils/productGrouping';

const Settings = () => {
    const categoriesQuery = useLiveQuery(() => db.categories.toArray());
    const productsQuery = useLiveQuery(() => db.products.toArray());
    const productAliasesQuery = useLiveQuery(() => db.productAliases.toArray());

    const [newCatName, setNewCatName] = useState('');
    const [leftProductKey, setLeftProductKey] = useState('');
    const [rightProductKey, setRightProductKey] = useState('');
    const [aliasFeedback, setAliasFeedback] = useState('');
    const categories = useMemo(() => categoriesQuery || [], [categoriesQuery]);
    const products = useMemo(() => productsQuery || [], [productsQuery]);
    const productAliases = useMemo(() => productAliasesQuery || [], [productAliasesQuery]);

    const productGrouping = useMemo(
        () => buildProductGrouping({ products, aliases: productAliases }),
        [productAliases, products]
    );

    const nameOptionsByKey = useMemo(
        () => new Map(productGrouping.nameOptions.map((option) => [option.key, option])),
        [productGrouping.nameOptions]
    );

    const mergedGroups = useMemo(
        () => productGrouping.groups.filter((group) => group.merged),
        [productGrouping.groups]
    );

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

    const addProductAlias = async () => {
        const leftOption = nameOptionsByKey.get(leftProductKey);
        const rightOption = nameOptionsByKey.get(rightProductKey);

        if (!leftOption || !rightOption) {
            setAliasFeedback('Selecione dois nomes validos para criar a correspondencia.');
            return;
        }

        if (leftOption.key === rightOption.key) {
            setAliasFeedback('Escolha dois nomes diferentes.');
            return;
        }

        const leftGroupId = productGrouping.nameToGroupId.get(leftOption.key);
        const rightGroupId = productGrouping.nameToGroupId.get(rightOption.key);

        if (leftGroupId && rightGroupId && leftGroupId === rightGroupId) {
            setAliasFeedback('Esses nomes ja pertencem ao mesmo agrupamento.');
            return;
        }

        const aliasPair = createProductAliasPair(leftOption, rightOption);
        if (!aliasPair) {
            setAliasFeedback('Nao foi possivel criar a correspondencia informada.');
            return;
        }

        const aliasAlreadyExists = productAliases.some((alias) => (
            alias.leftKey === aliasPair.leftKey && alias.rightKey === aliasPair.rightKey
        ));

        if (aliasAlreadyExists) {
            setAliasFeedback('Essa correspondencia ja foi cadastrada.');
            return;
        }

        await db.productAliases.add(aliasPair);
        setLeftProductKey('');
        setRightProductKey('');
        setAliasFeedback('Correspondencia salva. O produto agrupado passara a usar o nome automatico com *.');
    };

    const deleteProductAlias = async (id) => {
        if (!window.confirm('Remover esta correspondencia de produtos?')) {
            return;
        }

        await db.productAliases.delete(id);
        setAliasFeedback('');
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
                        onChange={(event) => setNewCatName(event.target.value)}
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
                    {categories.map((category) => (
                        <div
                            key={category.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px',
                                background: 'rgba(0,0,0,0.02)',
                                borderRadius: '10px'
                            }}
                        >
                            <span>{category.name}</span>
                            <button
                                onClick={() => deleteCategory(category.id)}
                                style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="glass-card">
                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '6px' }}>Correspondencia de Produtos</h3>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.88rem', margin: 0 }}>
                        Associe nomes parecidos vindos da importacao para que inflacao pessoal e evolucao de precos tratem tudo como o mesmo produto.
                    </p>
                </div>

                {productGrouping.nameOptions.length > 0 ? (
                    <>
                        <div style={{ display: 'grid', gap: '12px', marginBottom: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '6px' }}>
                                    Primeiro nome
                                </label>
                                <select
                                    className="glass-card"
                                    style={{ width: '100%', padding: '12px', margin: 0, borderRadius: '12px', border: '1px solid #ddd', background: 'white' }}
                                    value={leftProductKey}
                                    onChange={(event) => setLeftProductKey(event.target.value)}
                                >
                                    <option value="">Selecione um produto</option>
                                    {productGrouping.nameOptions.map((option) => (
                                        <option key={option.key} value={option.key}>
                                            {option.displayName} ({option.productCount})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '6px' }}>
                                    Segundo nome
                                </label>
                                <select
                                    className="glass-card"
                                    style={{ width: '100%', padding: '12px', margin: 0, borderRadius: '12px', border: '1px solid #ddd', background: 'white' }}
                                    value={rightProductKey}
                                    onChange={(event) => setRightProductKey(event.target.value)}
                                >
                                    <option value="">Selecione um produto</option>
                                    {productGrouping.nameOptions.map((option) => (
                                        <option key={option.key} value={option.key}>
                                            {option.displayName} ({option.productCount})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            className="btn-primary"
                            type="button"
                            onClick={addProductAlias}
                            disabled={productGrouping.nameOptions.length < 2}
                        >
                            <Plus size={18} />
                            Unir nomes do mesmo produto
                        </button>

                        {aliasFeedback && (
                            <div style={{ marginTop: '12px', color: 'var(--primary-blue)', fontSize: '0.82rem' }}>
                                {aliasFeedback}
                            </div>
                        )}

                        <div
                            style={{
                                marginTop: '14px',
                                padding: '12px 14px',
                                borderRadius: '14px',
                                background: 'rgba(26, 35, 126, 0.06)',
                                color: 'var(--text-light)',
                                fontSize: '0.82rem'
                            }}
                        >
                            O nome final e gerado automaticamente. Produtos agrupados aparecem com <strong>*</strong> no dashboard.
                        </div>
                    </>
                ) : (
                    <div style={{ color: 'var(--text-light)', fontSize: '0.88rem' }}>
                        Importe alguns cupons para liberar a unificacao manual de nomes de produto.
                    </div>
                )}

                <div style={{ marginTop: '24px' }}>
                    <h4 style={{ marginBottom: '10px', fontSize: '0.95rem' }}>Correspondencias salvas</h4>
                    {productAliases.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {productAliases
                                .slice()
                                .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''))
                                .map((alias) => (
                                    <div
                                        key={alias.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px',
                                            borderRadius: '12px',
                                            background: 'rgba(0, 0, 0, 0.03)'
                                        }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                                                {alias.leftName} {'<->'} {alias.rightName}
                                            </div>
                                            <div style={{ color: 'var(--text-light)', fontSize: '0.74rem', marginTop: '4px' }}>
                                                Essa ligacao alimenta os cards de inflacao e evolucao de precos.
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => deleteProductAlias(alias.id)}
                                            style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', flexShrink: 0 }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-light)', fontSize: '0.84rem' }}>
                            Nenhuma correspondencia criada ainda.
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '24px' }}>
                    <h4 style={{ marginBottom: '10px', fontSize: '0.95rem' }}>Produtos agrupados automaticamente</h4>
                    {mergedGroups.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {mergedGroups.map((group) => (
                                <div
                                    key={group.id}
                                    style={{
                                        padding: '14px',
                                        borderRadius: '14px',
                                        border: '1px solid rgba(26, 35, 126, 0.12)',
                                        background: 'rgba(26, 35, 126, 0.04)'
                                    }}
                                >
                                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>{group.displayName}</div>
                                    <div style={{ color: 'var(--text-light)', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                                        {group.memberNames.join(' | ')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-light)', fontSize: '0.84rem' }}>
                            Assim que voce unir dois ou mais nomes, o novo nome com * aparecera aqui.
                        </div>
                    )}
                </div>
            </div>

            <div className="glass-card" style={{ background: 'var(--primary-blue)', color: 'white', marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <Info size={24} color="var(--secondary-cyan)" />
                    <h4 style={{ color: 'white' }}>Sobre o App</h4>
                </div>
                <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                    Sistema de Gestao Contabil Inteligente com leitura de NFC-e.
                </p>
                <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: '600' }}>Desenvolvido por Marcio F Pereira</p>
                    <p style={{ fontSize: '0.7rem', opacity: 0.7 }}>v1.0.0 | Arquiteto de Software</p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
