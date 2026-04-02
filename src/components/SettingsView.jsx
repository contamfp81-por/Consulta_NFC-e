import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Trash2, Plus, Info } from 'lucide-react';
import { buildProductGrouping, createProductAliasPair } from '../utils/productGrouping';

const QUESTION_GUIDE = [
    {
        key: 'operacional',
        title: 'Operacional',
        description: 'Consultas para auditar lancamentos, cupons, itens e Pix salvos na base.',
        items: [
            {
                question: 'Quais lancamentos existem no periodo X?',
                answer: 'O app lista cupons e Pix por data, origem, estabelecimento ou recebedor, valor e status. A resposta ideal e um historico filtrado pelo intervalo selecionado.'
            },
            {
                question: 'Quais cupons foram importados e quais foram manuais?',
                answer: 'O sistema separa os cupons pela origem do lancamento. Ele consegue contar e somar os valores de importados, manuais e Pix.'
            },
            {
                question: 'Qual e o detalhe de um cupom especifico?',
                answer: 'A resposta mostra estabelecimento, data, valor total, forma de pagamento, numero do cupom, chave de acesso, URL e os itens daquele documento.'
            },
            {
                question: 'Quais itens compoem o cupom Y?',
                answer: 'O app retorna produto, marca, quantidade, unidade, preco unitario, total do item e categoria para cada item do cupom selecionado.'
            },
            {
                question: 'Ha diferenca entre o total do cupom e a soma dos itens?',
                answer: 'Sim. O sistema calcula a diferenca entre o valor total do cupom e a soma dos itens detalhados, ajudando a detectar desconto, arredondamento ou cupom incompleto.'
            },
            {
                question: 'Quais despesas Pix estao pendentes ou sem revisao?',
                answer: 'A base consegue filtrar os Pix por status de confirmacao e mostrar quantos estao pendentes, com valor, data e recebedor.'
            }
        ]
    },
    {
        key: 'financeiro',
        title: 'Financeiro Executivo',
        description: 'Perguntas de total, comparacao de periodo, concentracao de gasto e saude financeira.',
        items: [
            {
                question: 'Quanto eu gastei no mes ou no periodo filtrado?',
                answer: 'O app soma cupons e Pix do intervalo, informando total gasto, numero de transacoes, ticket medio e media diaria.'
            },
            {
                question: 'Como esse periodo compara com o anterior?',
                answer: 'A resposta compara total, lancamentos, ticket medio e dias ativos contra dia, semana, mes ou ano anterior, com delta percentual.'
            },
            {
                question: 'Qual e a projecao de fechamento do mes?',
                answer: 'O sistema estima o fechamento com base no ritmo atual de gasto e ainda exibe cenarios conservador, provavel e de picos.'
            },
            {
                question: 'Meu ritmo de gasto esta acelerando ou desacelerando?',
                answer: 'O app observa a media recente, o run rate do mes e os picos diarios para classificar o ritmo como estavel, acelerando ou desacelerando.'
            },
            {
                question: 'Qual e meu score de saude financeira?',
                answer: 'A resposta e um score de 0 a 100, acompanhado de leitura executiva sobre variacao mensal, concentracao de gasto, peso do credito e intensidade dos picos.'
            },
            {
                question: 'Quanto do gasto e essencial ou fixo versus variavel?',
                answer: 'O app soma as categorias tratadas como essenciais e compara esse bloco com o restante do gasto, mostrando valor e participacao percentual.'
            },
            {
                question: 'Quais categorias e lojas dominam meu orcamento?',
                answer: 'O sistema ranqueia categorias e estabelecimentos por valor gasto e share do periodo, destacando os principais concentradores de custo.'
            },
            {
                question: 'Quais formas de pagamento eu mais uso?',
                answer: 'A resposta mostra o ranking das formas de pagamento por valor, participacao no total e quantidade de categorias em que aparecem.'
            }
        ]
    },
    {
        key: 'preco',
        title: 'Produto, Preco e Inflacao',
        description: 'Perguntas sobre impacto por item, recorrencia, melhor dia de compra e inflacao pessoal.',
        items: [
            {
                question: 'Quais produtos mais puxam meu gasto?',
                answer: 'O app usa um ranking tipo Pareto para mostrar os itens com maior impacto financeiro no periodo.'
            },
            {
                question: 'Quais produtos sao mais recorrentes?',
                answer: 'A base conta em quantos cupons cada item aparece e mede o impacto total em reais, destacando os produtos de repeticao mais forte.'
            },
            {
                question: 'Como o preco de um produto evoluiu ao longo do tempo?',
                answer: 'O sistema monta uma serie temporal do preco unitario, inclusive agrupando nomes equivalentes quando existe alias salvo.'
            },
            {
                question: 'Qual e o melhor dia da semana para comprar cada produto?',
                answer: 'A resposta identifica em qual dia cada produto registrou o menor preco unitario historico, usando media e recorrencia como criterio de desempate.'
            },
            {
                question: 'Qual e a oportunidade do dia de hoje?',
                answer: 'O app cruza o dia atual com o historico e lista os produtos que costumam ter o menor preco exatamente hoje.'
            },
            {
                question: 'Qual e minha inflacao pessoal?',
                answer: 'O sistema compara o ultimo preco com o preco anterior dos produtos comparaveis, calcula a taxa de inflacao e estima o impacto financeiro em reais.'
            },
            {
                question: 'Quais categorias mais inflacionaram?',
                answer: 'A resposta agrega as variacoes de preco por categoria e mostra onde a pressao de custo foi maior.'
            }
        ]
    },
    {
        key: 'alimentacao',
        title: 'Alimentacao',
        description: 'Perguntas sobre qualidade da dieta, acucar, impulsividade e padroes de compra alimentar.',
        items: [
            {
                question: 'Como esta a qualidade da minha dieta?',
                answer: 'O app separa os itens em natural, moderado e ultraprocessado e mostra a participacao de cada nivel no gasto alimentar.'
            },
            {
                question: 'Quanto do meu gasto alimentar foi com acucar?',
                answer: 'A resposta calcula o valor e o percentual gasto com itens acucarados, alem de apontar os grupos e produtos que mais pesam.'
            },
            {
                question: 'Ha sinais de compra por impulso?',
                answer: 'Sim. O sistema gera um score de impulsividade com base em eventos de compra, horario, concentracao de junk food e padrao de sabado ou noite.'
            },
            {
                question: 'Minha alimentacao piorou ou melhorou?',
                answer: 'O app compara mes atual versus anterior, semana atual versus anterior e janelas moveis para dizer se o padrao alimentar melhorou, piorou ou ficou estavel.'
            },
            {
                question: 'Em quais dias da semana eu gasto pior com alimentacao?',
                answer: 'A resposta cruza dia da semana com gasto, share de acucar e share de ultraprocessados para mostrar onde o comportamento piora.'
            },
            {
                question: 'Em quais horarios eu compro pior?',
                answer: 'O sistema distribui as compras por periodo do dia e destaca quando existe concentracao de acucar ou ultraprocessados no horario noturno.'
            },
            {
                question: 'Quais itens ainda precisam de classificacao manual?',
                answer: 'O app lista os itens ainda nao classificados, com numero de ocorrencias, gasto acumulado e categorias originais encontradas no historico.'
            }
        ]
    },
    {
        key: 'previsao',
        title: 'Previsao e Confiabilidade',
        description: 'Perguntas sobre previsao diaria, categorias previstas e confiabilidade do algoritmo.',
        items: [
            {
                question: 'Quanto devo gastar hoje e amanha?',
                answer: 'A base gera previsao diaria com valor estimado para hoje e para o proximo dia, acompanhada do nivel de confianca do modelo.'
            },
            {
                question: 'Quais categorias devem pesar mais hoje?',
                answer: 'O app monta uma previsao por categoria e mostra quais devem concentrar a maior parte do gasto do dia.'
            },
            {
                question: 'Quao confiavel esta o algoritmo de previsao?',
                answer: 'A resposta informa MAPE, precisao geral, precisao diaria, por categoria e no fechamento mensal, alem do status atual do modelo.'
            },
            {
                question: 'O modelo precisa de recalibracao?',
                answer: 'O sistema verifica se a precisao ficou abaixo do limite configurado e, se necessario, sugere recalibracao com novos pesos.'
            },
            {
                question: 'Quais sinais o algoritmo usa para prever?',
                answer: 'A previsao combina medias de 7 e 30 dias, tendencia recente, padrao do dia da semana, posicao no mes e recorrencia de gasto.'
            },
            {
                question: 'Qual e meu perfil de consumo no mes atual?',
                answer: 'O app classifica o comportamento do mes como equilibrado, essencialista, concentrado, recorrente ou em expansao de ritmo, sempre com evidencias da propria base.'
            }
        ]
    },
    {
        key: 'limites',
        title: 'Limites da Base Atual',
        description: 'Perguntas que o app ainda nao responde porque esses dados nao existem no banco atual.',
        items: [
            {
                question: 'O app responde perguntas sobre renda, saldo bancario ou patrimonio?',
                answer: 'Nao com a base atual. Hoje o banco registra saidas, itens, Pix, categorias, alias e previsoes, mas nao possui renda, saldo ou patrimonio.'
            },
            {
                question: 'O app conhece parcelas futuras ou contas a vencer?',
                answer: 'Nao. O sistema projeta o fechamento do mes pelo historico observado, mas nao armazena agenda de parcelas, vencimentos ou contas futuras.'
            },
            {
                question: 'O app sabe o estoque que eu tenho em casa?',
                answer: 'Nao. Ele sabe o que foi comprado e quando foi comprado, mas nao controla consumo, estoque restante ou reposicao real em casa.'
            },
            {
                question: 'O app sabe quem consumiu, onde eu moro ou a localizacao exata da loja?',
                answer: 'Nao com precisao operacional. A base guarda estabelecimento, cidade do Pix e dados do cupom, mas nao tem usuarios por pessoa, geolocalizacao detalhada ou contexto familiar.'
            }
        ]
    }
];

const Settings = () => {
    const categoriesQuery = useLiveQuery(() => db.categories.toArray());
    const productsQuery = useLiveQuery(() => db.products.toArray());
    const productAliasesQuery = useLiveQuery(() => db.productAliases.toArray());

    const [newCatName, setNewCatName] = useState('');
    const [leftProductKey, setLeftProductKey] = useState('');
    const [rightProductKey, setRightProductKey] = useState('');
    const [aliasFeedback, setAliasFeedback] = useState('');
    const [activeQuestion, setActiveQuestion] = useState(null);
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

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <input
                        type="text"
                        placeholder="Nova categoria..."
                        className="glass-card"
                        style={{ flex: 1, minWidth: '220px', padding: '12px', margin: 0, borderRadius: '12px', border: '1px solid #ddd' }}
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

            <div className="glass-card" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <Info size={24} color="var(--primary-blue)" />
                    <h3 style={{ margin: 0, color: 'var(--primary-blue)' }}>Perguntas que o App Consegue Responder</h3>
                </div>
                <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '18px' }}>
                    As perguntas abaixo foram agrupadas por categoria. Toque em qualquer uma para abrir uma resposta curta dentro da tela atual.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {QUESTION_GUIDE.map((category) => (
                        <details
                            key={category.key}
                            style={{
                                background: 'rgba(26, 35, 126, 0.03)',
                                borderRadius: '12px',
                                padding: '12px 14px',
                                border: '1px solid rgba(26, 35, 126, 0.08)'
                            }}
                        >
                            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                {category.title}
                            </summary>
                            <div style={{ paddingTop: '12px' }}>
                                <p style={{ margin: '0 0 12px', color: 'var(--text-light)', fontSize: '0.82rem' }}>
                                    {category.description}
                                </p>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {category.items.map((item) => (
                                        <button
                                            key={item.question}
                                            type="button"
                                            onClick={() => setActiveQuestion({
                                                category: category.title,
                                                question: item.question,
                                                answer: item.answer
                                            })}
                                            style={{
                                                textAlign: 'left',
                                                padding: '12px 14px',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(148, 163, 184, 0.18)',
                                                background: 'rgba(8, 19, 31, 0.68)',
                                                color: 'var(--text-main)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '6px'
                                            }}
                                        >
                                            <span style={{ fontWeight: 600, lineHeight: 1.4 }}>{item.question}</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                                                Toque para ver como o app responde essa pergunta.
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </details>
                    ))}
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

            {activeQuestion && (
                <div
                    onClick={() => setActiveQuestion(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1200,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        background: 'rgba(2, 6, 23, 0.58)'
                    }}
                >
                    <div
                        className="glass-card"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(560px, 100%)',
                            maxHeight: 'min(72vh, 540px)',
                            overflowY: 'auto',
                            margin: 0,
                            borderRadius: '18px',
                            border: '1px solid rgba(148, 163, 184, 0.18)',
                            background: 'rgba(8, 19, 31, 0.96)',
                            boxShadow: '0 24px 60px rgba(2, 6, 23, 0.48)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    {activeQuestion.category}
                                </div>
                                <h4 style={{ margin: 0, color: 'white', lineHeight: 1.35 }}>{activeQuestion.question}</h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveQuestion(null)}
                                style={{
                                    border: '1px solid rgba(148, 163, 184, 0.18)',
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    color: 'var(--text-light)',
                                    borderRadius: '999px',
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                }}
                            >
                                Fechar
                            </button>
                        </div>

                        <p style={{ margin: '0 0 18px', color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.7 }}>
                            {activeQuestion.answer}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => setActiveQuestion(null)}
                                style={{ width: 'auto', padding: '10px 16px' }}
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
