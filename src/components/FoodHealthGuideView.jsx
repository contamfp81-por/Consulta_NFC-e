import React from 'react';
import { 
    Activity, 
    ArrowLeft, 
    Calculator, 
    Candy, 
    CheckCircle2, 
    ChevronRight, 
    Info, 
    Leaf, 
    Scale, 
    ShieldCheck, 
    ShoppingBasket, 
    TrendingUp,
    Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

const MotionSection = motion.section;

const sectionTransition = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' }
};

const FoodHealthGuideView = ({ onBack }) => {
    return (
        <div className="screen-stack">
            <header className="page-intro-card">
                <div className="section-heading section-heading-inline">
                    <button 
                        type="button" 
                        onClick={onBack}
                        className="back-button-circle"
                        aria-label="Voltar para analise alimentar"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <span className="eyebrow">Guia de Metricas</span>
                        <h1>Entenda o seu ISA</h1>
                    </div>
                </div>
                <p className="page-intro-copy">
                    O Indice de Saude Alimentar (ISA) e uma nota de 0 a 100 que resume a qualidade nutricional e comportamental das suas compras.
                    Ele nao olha apenas para o preco, mas para o impacto do que voce consome.
                </p>
            </header>

            <MotionSection {...sectionTransition} className="premium-surface">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow">Conceitos Fundamentais</span>
                        <h2>Os 3 Pilares da sua Saude</h2>
                    </div>
                </div>
                <div className="guide-pilar-grid">
                    <div className="guide-pilar-card">
                        <div className="pilar-icon quality">
                            <Leaf size={24} />
                        </div>
                        <h3>Qualidade (40%)</h3>
                        <p>Foca no equilibrio entre alimentos naturais (frutas, verduras, grãos) e ultraprocessados. Quanto mais "comida de verdade", maior a nota.</p>
                        <ul className="pilar-bullets">
                            <li><CheckCircle2 size={14} /> Bonus por itens naturais</li>
                            <li><Zap size={14} /> Penalidade por ultraprocessados</li>
                        </ul>
                    </div>
                    <div className="guide-pilar-card">
                        <div className="pilar-icon sugar">
                            <Candy size={24} />
                        </div>
                        <h3>Acucar (30%)</h3>
                        <p>Mede a presenca de acucares adicionados e bebidas adocicadas na sua cesta, com atencao especial ao horario das compras.</p>
                        <ul className="pilar-bullets">
                            <li><CheckCircle2 size={14} /> Controle de share de doces</li>
                            <li><Zap size={14} /> Penalidade por compras noturnas</li>
                        </ul>
                    </div>
                    <div className="guide-pilar-card">
                        <div className="pilar-icon behavior">
                            <ShoppingBasket size={24} />
                        </div>
                        <h3>Comportamento (30%)</h3>
                        <p>Analisa se suas compras sao planejadas ou fruto de impulsividade, usando padroes de horario e frequencia de itens reativos.</p>
                        <ul className="pilar-bullets">
                            <li><CheckCircle2 size={14} /> Padrao de dia da semana</li>
                            <li><Zap size={14} /> Score de impulsividade</li>
                        </ul>
                    </div>
                </div>
            </MotionSection>

            <MotionSection {...sectionTransition} className="premium-surface">
                <div className="section-heading">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calculator size={18} color="var(--primary-blue)" />
                            <span className="eyebrow">Transparencia Matematica</span>
                        </div>
                        <h2>Como calculamos sua nota</h2>
                    </div>
                </div>
                <div className="math-explanation">
                    <div className="formula-box">
                        <span className="formula-label">Formula do ISA</span>
                        <code className="formula-text">
                            ISA = (Base * FatorTendencia * FatorConsistencia)
                        </code>
                    </div>
                    
                    <div className="formula-details">
                        <div className="detail-row">
                            <div className="detail-icon"><Scale size={18} /></div>
                            <div>
                                <strong>Calculo do Base Score</strong>
                                <p>Soma ponderada dos 3 pilares: (Qualidade × 0.4) + (Acucar × 0.3) + (Comportamento × 0.3).</p>
                            </div>
                        </div>
                        <div className="detail-row">
                            <div className="detail-icon"><TrendingUp size={18} /></div>
                            <div>
                                <strong>Fator de Tendencia (0.92x a 1.08x)</strong>
                                <p>Compara seu mes atual com o anterior. Melhoras graduais premiam sua nota total, enquanto quedas bruscas geram um redutor.</p>
                            </div>
                        </div>
                        <div className="detail-row">
                            <div className="detail-icon"><ShieldCheck size={18} /></div>
                            <div>
                                <strong>Fator de Consistencia (0.92x a 1.02x)</strong>
                                <p>O algoritmo penaliza a "volatilidade". Quem mantem um padrao saudavel estavel recebe um bonus (1.02x). Oscilacoes excessivas diminuem o fator.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </MotionSection>

            <MotionSection {...sectionTransition} className="premium-surface">
                <div className="section-heading">
                    <div>
                        <span className="eyebrow">Beneficios</span>
                        <h2>Por que acompanhar o ISA?</h2>
                    </div>
                </div>
                <div className="insight-list">
                    <div className="list-item">
                        <div className="list-item-copy">
                            <span>Consciencia Nutricional</span>
                            <small>Saiba exatamente o que esta dominando sua dispensa sem precisar de uma dieta rigorosa.</small>
                        </div>
                    </div>
                    <div className="list-item">
                        <div className="list-item-copy">
                            <span>Economia Inteligente</span>
                            <small>Compras reativas e ultraprocessados tendem a ser mais caros e menos saciantes.</small>
                        </div>
                    </div>
                    <div className="list-item">
                        <div className="list-item-copy">
                            <span>Previsibilidade</span>
                            <small>O sistema projeta seu proximo mes, permitindo correcoes de rota antes que um habito ruim se instale.</small>
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: '24px' }}>
                    <button 
                        type="button" 
                        onClick={onBack}
                        className="primary-button full-width"
                    >
                        Entendi, voltar para analise
                    </button>
                </div>
            </MotionSection>

            <style dangerouslySetInnerHTML={{ __html: `
                .back-button-circle {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    background: rgba(8, 19, 31, 0.4);
                    color: var(--text-main);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .back-button-circle:hover {
                    background: rgba(8, 19, 31, 0.8);
                    border-color: var(--primary-blue);
                    color: var(--primary-blue);
                }
                .guide-pilar-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 16px;
                    margin-top: 12px;
                }
                .guide-pilar-card {
                    padding: 24px;
                    border-radius: 20px;
                    background: rgba(148, 163, 184, 0.04);
                    border: 1px solid rgba(148, 163, 184, 0.08);
                    transition: all 0.3s ease;
                }
                .guide-pilar-card:hover {
                    border-color: rgba(148, 163, 184, 0.2);
                    background: rgba(148, 163, 184, 0.08);
                }
                .pilar-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                }
                .pilar-icon.quality { background: rgba(34, 197, 94, 0.15); color: #22C55E; }
                .pilar-icon.sugar { background: rgba(249, 115, 22, 0.15); color: #F97316; }
                .pilar-icon.behavior { background: rgba(96, 165, 250, 0.15); color: #60A5FA; }
                .guide-pilar-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 1.1rem;
                    font-weight: 700;
                }
                .guide-pilar-card p {
                    font-size: 0.9rem;
                    color: var(--text-light);
                    line-height: 1.6;
                    margin-bottom: 16px;
                }
                .pilar-bullets {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .pilar-bullets li {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: var(--text-main);
                }
                .math-explanation {
                    background: rgba(8, 19, 31, 0.3);
                    border-radius: 20px;
                    padding: 24px;
                    margin-top: 12px;
                }
                .formula-box {
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 24px;
                    text-align: center;
                    border-left: 4px solid var(--primary-blue);
                }
                .formula-label {
                    display: block;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: var(--text-light);
                    margin-bottom: 8px;
                }
                .formula-text {
                    font-family: 'Courier New', monospace;
                    font-size: 1.1rem;
                    color: var(--primary-blue);
                    font-weight: 700;
                }
                .formula-details {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .detail-row {
                    display: flex;
                    gap: 16px;
                }
                .detail-icon {
                    flex-shrink: 0;
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    background: rgba(148, 163, 184, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-main);
                }
                .detail-row strong {
                    display: block;
                    font-size: 0.95rem;
                    margin-bottom: 4px;
                }
                .detail-row p {
                    font-size: 0.82rem;
                    color: var(--text-light);
                    line-height: 1.5;
                }
            `}} />
        </div>
    );
};

export default FoodHealthGuideView;
