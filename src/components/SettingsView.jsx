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
                        </div>
                    )}
                </div>
            </div>

            <div className="glass-card" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <Info size={24} color="var(--primary-blue)" />
                    <h3 style={{ margin: 0, color: 'var(--primary-blue)' }}>Rastreabilidade e Fórmulas do Dashboard</h3>
                </div>
                <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '20px' }}>
                    Abaixo está a documentação técnica detalhada de como a aplicação processa cada número e gráfico exibido. Expanda os itens para auditar as regras de negócio utilizadas.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Painel Executivo (Totais)</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Resumo financeiro de alto nível do período selecionado.</p>
                            <ul>
                                <li><strong>Total Analisado:</strong> Soma simples (<var>Σ totalValue</var>) de todos os produtos extraídos cujos cupons pertencem ao filtro de datas.</li>
                                <li><strong>Ticket Médio:</strong> <var>Total Analisado / Número de Cupons Únicos</var> (<code>totalSpent / filteredReceipts.length</code>).</li>
                                <li><strong>Perfil Inferido:</strong> Detecta a categoria campeã de gastos e classifica o comportamento como "Essencial" (se Mercado, Farmácia, Saúde, Educação, etc.) ou "Discricionário" (flexível/secundário).</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Evolução de Preço por Produto</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Acompanhar a flutuação do preço unitário de produtos específicos ao longo do tempo (linha temporal).</p>
                            <ul>
                                <li><strong>Métricas:</strong> Eixo Y = <var>Preço Unitário (unitPrice)</var>, Eixo X = <var>Data da Compra</var>.</li>
                                <li><strong>Cálculos:</strong> Busca no banco em memória os itens selecionados (agrupados via alias manual ou nome literal) e traça suas oscilações nominais unicamente pelos lançamentos feitos.</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Evolução dos Gastos / Volume Acumulado</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Os gráficos de área mostram a queima orçamentária nominal e progressiva.</p>
                            <ul>
                                <li><strong>Evolução Diária:</strong> Soma simples dos cupons fiscais daquele mesmo dia (<var>Σ receipt.totalValue GROUP BY receipt.date</var>).</li>
                                <li><strong>Volume Acumulado:</strong> <var>Acumulado(Dia T) = Acumulado(Dia T-1) + TotalGasto(Dia T)</var>. Ajuda a ver a "curva de queima" contínua do dinheiro filtrado.</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Comparativos e Lojas (Ranking e Mês)</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Identificar a origem de emissão predileta para as compras.</p>
                            <ul>
                                <li><strong>Cálculos:</strong> Mapeamento do atributo <code>establishment</code> (Extraído da NFC-e).</li>
                                <li><strong>Pizza:</strong> <var>% Loja X = (Σ Gastos em Loja X / Total Histórico no Filtro) * 100</var>.</li>
                                <li><strong>Gastos por Loja x Mês:</strong> Barra empilhada fatiada por competência (MM/YYYY), exibindo onde o dinheiro ancorou em cada ciclo (<code>group BY month, store</code>).</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Gráfico de Pareto (Top 10 Produtos)</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Princípio 80/20 de Vilfredo Pareto. Identifica a pequena minoria de produtos que causa a grande maioria absoluta do desembolso de caixa.</p>
                            <ul>
                                <li><strong>Fórmulas:</strong> O app isola o Top 10 nominal de itens somados pelo <var>totalValue</var>.</li>
                                <li><strong>Curva (% Acumulado):</strong> <var>T(i) = T(i-1) + Gasto(Produto i)</var>. Em seguida, divide <var>T(i)</var> pela soma real unicamente do escopo do Top 10 e plota a linha vermelha crescente.</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Treemap e Barras de Categoria</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Visualização de centros de custo (hierarquias). Qual classe de consumo drena a conta e como interagem visualmente por agrupamento.</p>
                            <ul>
                                <li><strong>Cálculo Direto:</strong> Agrupamento do gasto <var>Σ product.totalValue GROUP BY category</var>. O Treemap calcula as áreas relativas geometricamente (tamanho do bloco = <var>Valor</var>).</li>
                                <li><strong>Porcentagem:</strong> <var>(Valor Categoria / Total Analisado do Período) * 100</var>.</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Histograma de Preços e Mapa de Calor</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade Histograma:</strong> Dispersão unitária. Revela se consumimos itens pulverizados de Ticket Baixo ou poucas compras de Ticket Altíssimo.</p>
                            <ul>
                                <li><strong>Histograma (Cálculo):</strong> Incrementa <code>count += 1</code> num array de buckets condicionais (ex: <code>&lt; 5</code>, <code>&lt; 10</code>, <code>&lt; 20</code>, <code>&lt; 50</code>, etc.), classificando o preço do item (<var>unitPrice</var>).</li>
                                <li><strong>Heatmap (Dias):</strong> Extrai <code>date.getDay()</code> da nota fiscal e compila (+1 cupom) num dicionário <code>(Domingo, Segunda...)</code>. Identifica o dia da semana campeão de movimentação (rotina operacional).</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Top 5 Produtos Mais Recorrentes e Impacto</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Encontrar os itens mais "constantes" no hábito de consumo (itens de alta rotatividade). Diferente do Pareto (baseado em R$), a recorrência é contada pela presença de notas.</p>
                            <ul>
                                <li><strong>Métrica:</strong> Para o Produto X, rastreia-se a chave da nota (<code>receipt.id</code>). Se houver várias compras do mesmo item no intervalo, é filtrado um <code>Set()</code> único (presença exclusiva por ida global).</li>
                                <li><strong>Impacto (%):</strong> <var>(Soma Absoluta em R$ gasta no produto ao considerar todos os repetecos contados / Verba Total Geral Analisada dos Produtos) * 100</var>.</li>
                            </ul>
                        </div>
                    </details>

                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Índice de Inflação Pessoal</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Estudar o encarecimento interno da "própria cesta de compras", em vez da inflação do noticiário. Usado para substituição e contenção de danos.</p>
                            <ul>
                                <li><strong>Produtos Comparáveis:</strong> Itens com presença confirmada em pelo menos duas datas distintas com a mesma exata nomenclatura ou unidos manualmente por correspondência. O algoritmo extrai a nota da data T0 e da nota final Tn do filtro selecionado.</li>
                                <li><strong>Fórmula Produto (Taxa %):</strong> <var>Inflação = (Preço Mais Recente(T_n) - Preço Mais Antigo(T_0)) / Preço Mais Antigo(T_0)</var>.</li>
                                <li><strong>Impacto R$:</strong> Revela lucro/prejuízo exato sofrido pela elevação: <var>(Preço(T_n) - Preço(T_0)) * Quantidade Comprada na Última Data</var>.</li>
                                <li><strong>Índice Geral (Média Ponderada):</strong> Agrega todos os Impactos Absolutos dos produtos compatíveis dividindo-os cumulativamente pela SOMA de seus custos teóricos passados equivalentes (preços antigos).</li>
                            </ul>
                        </div>
                    </details>
                    
                    <details style={{ background: 'rgba(26, 35, 126, 0.03)', borderRadius: '10px', padding: '10px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>Formas de Pagamento por Categoria</summary>
                        <div style={{ padding: '10px 0 0 16px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            <p><strong>Finalidade:</strong> Identificar tendências de endividamento (crédito) x liquidez ativa (PIX/débito/dinheiro) associadas às saídas reais departamentais.</p>
                            <ul>
                                <li><strong>Cálculos:</strong> É extraído o bloco de <var>Pagamento</var> nativo no parser HTML da Nota. O algoritmo faz agrupamento combinado (Category + Forma).</li>
                                <li><strong>Cupons:</strong> Número total de transações de cupons classificados naquele arranjo. </li>
                                <li><strong>% da Categoria:</strong> Indica o grau de propensão de uso dessa forma frente aos outros pagamentos usados especificamente SÓ naquela mesma categoria.</li>
                            </ul>
                        </div>
                    </details>
                </div>
            </div>

            <div 
                className="glass-card" 
                style={{ 
                    background: 'var(--primary-blue)', 
                    color: 'white', 
                    marginTop: '20px'
                }}
            >
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
