import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ReceiptText, TrendingDown } from 'lucide-react';
import { db } from '../db';
import { buildFinanceOverview, formatCurrency } from '../utils/financeInsights';

const OpportunityView = ({ onOpenReports }) => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const pixExpenses = useLiveQuery(() => db.pixExpenses.toArray()) || [];
    const productAliases = useLiveQuery(() => db.productAliases.toArray()) || [];

    const insights = useMemo(
        () => buildFinanceOverview({ receipts, products, pixExpenses, productAliases }),
        [pixExpenses, productAliases, products, receipts]
    );

    const opportunityData = insights.currentWeekdayBestPriceProducts;

    return (
        <div className="screen-stack">
            <section className="page-intro-card">
                <div className="section-heading section-heading-inline">
                    <div>
                        <span className="eyebrow">Oportunidade do dia</span>
                        <h1>Hoje e {opportunityData.fullLabel}</h1>
                    </div>
                    <div className="status-pill positive">
                        {opportunityData.totalProducts} produto{opportunityData.totalProducts === 1 ? '' : 's'}
                    </div>
                </div>
                <p className="page-intro-copy">
                    Esta tela mostra os produtos que, pelo historico registrado no app, costumam atingir o menor preco observado quando comprados neste dia da semana.
                </p>
            </section>

            <section className="premium-surface">
                <div className="comparison-stack">
                    <div className="comparison-row positive">
                        <div>
                            <span>Dia da semana atual</span>
                            <strong>{opportunityData.fullLabel}</strong>
                        </div>
                        <small>
                            Cada produto aparece em um unico dia vencedor, definido pelo menor preco historico observado.
                        </small>
                    </div>
                </div>

                <div className="hero-mini-grid home-section-block">
                    <div className="mini-stat">
                        <CalendarDays size={16} />
                        <div>
                            <span>Dia atual</span>
                            <strong>{opportunityData.shortLabel}</strong>
                        </div>
                    </div>
                    <div className="mini-stat">
                        <ReceiptText size={16} />
                        <div>
                            <span>Produtos mapeados</span>
                            <strong>{opportunityData.totalProducts}</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section className="premium-surface">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow">Menores precos do dia</span>
                        <h2>Produtos mais baratos em {opportunityData.fullLabel}</h2>
                    </div>
                    {onOpenReports && (
                        <button type="button" className="link-button" onClick={onOpenReports}>
                            Abrir relatorios
                        </button>
                    )}
                </div>

                {opportunityData.products.length > 0 ? (
                    <div className="insight-list">
                        {opportunityData.products.map((product) => (
                            <div key={product.id} className="list-item">
                                <div className="list-item-copy">
                                    <span>{product.displayName}</span>
                                    <small>
                                        Menor {formatCurrency(product.lowestUnitPrice)} | media no dia {formatCurrency(product.averageUnitPrice)}
                                    </small>
                                </div>
                                <div className="list-item-value">
                                    <span className="dot-indicator" style={{ backgroundColor: '#22C55E' }} />
                                    <strong>{product.occurrences}x</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="inline-empty">
                        Ainda nao ha produtos com preco comparavel para {opportunityData.fullLabel}.
                    </div>
                )}
            </section>

            <section className="premium-surface">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow">Leitura do algoritmo</span>
                        <h2>Como o app escolhe o dia</h2>
                    </div>
                </div>
                <div className="comparison-stack">
                    <div className="comparison-row neutral">
                        <div>
                            <span>Regra aplicada</span>
                            <strong>Menor preco unitario historico</strong>
                        </div>
                        <small>
                            Empates sao resolvidos pela menor media do dia e, depois, pela maior recorrencia.
                        </small>
                    </div>
                    <div className="comparison-row neutral">
                        <div>
                            <span>Resultado final</span>
                            <strong>Um produto, um unico dia vencedor</strong>
                        </div>
                        <small>
                            O mesmo produto nao aparece em dias diferentes como melhor oportunidade.
                        </small>
                    </div>
                    <div className="comparison-row neutral">
                        <div>
                            <span>Uso pratico</span>
                            <strong>Priorize o dia atual para esta lista</strong>
                        </div>
                        <small>
                            Os itens abaixo sao os melhores candidatos para compra hoje, conforme o historico do seu banco.
                        </small>
                    </div>
                </div>
                <div className="hero-mini-grid home-section-block">
                    <div className="mini-stat">
                        <TrendingDown size={16} />
                        <div>
                            <span>Foco da analise</span>
                            <strong>Preco unitario</strong>
                        </div>
                    </div>
                    <div className="mini-stat">
                        <ReceiptText size={16} />
                        <div>
                            <span>Base utilizada</span>
                            <strong>{receipts.length} cupom(ns)</strong>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default OpportunityView;
