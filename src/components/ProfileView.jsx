import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { BadgeInfo, FolderTree, ReceiptText, Settings2, UserCircle2, Wallet } from 'lucide-react';
import { db } from '../db';
import SettingsView from './SettingsView';

const MotionSection = motion.section;

const sectionTransition = {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut' }
};

const ProfileView = () => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const productAliases = useLiveQuery(() => db.productAliases.toArray()) || [];
    const pixExpenses = useLiveQuery(() => db.pixExpenses.toArray()) || [];

    return (
        <div className="screen-stack">
            <MotionSection {...sectionTransition} className="page-intro-card">
                <div className="profile-hero">
                    <div className="profile-avatar">
                        <UserCircle2 size={34} />
                    </div>
                    <div className="profile-copy">
                        <span className="eyebrow">Perfil e configuracoes</span>
                        <h1>Organizacao, taxonomia e rastreabilidade</h1>
                        <p className="page-intro-copy">
                            Ajuste categorias, alias de produtos e as regras de leitura do seu ambiente financeiro sem perder consistencia visual no restante do app.
                        </p>
                    </div>
                </div>
                <div className="hero-metric-grid profile-grid">
                    <div className="stat-card">
                        <div className="stat-label">Cupons</div>
                        <div className="stat-value">{receipts.length}</div>
                        <div className="stat-meta">Documentos fiscais importados</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Itens</div>
                        <div className="stat-value">{products.length}</div>
                        <div className="stat-meta">Produtos e servicos catalogados</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Pix</div>
                        <div className="stat-value">{pixExpenses.length}</div>
                        <div className="stat-meta">Despesas fora do cupom</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Categorias</div>
                        <div className="stat-value">{categories.length}</div>
                        <div className="stat-meta">Estrutura ativa de classificacao</div>
                    </div>
                </div>
                <div className="info-strip-grid">
                    <div className="info-strip">
                        <Settings2 size={16} />
                        <span>Configuracoes centralizadas</span>
                    </div>
                    <div className="info-strip">
                        <FolderTree size={16} />
                        <span>{productAliases.length} alias de produtos salvos</span>
                    </div>
                    <div className="info-strip">
                        <ReceiptText size={16} />
                        <span>Base pronta para auditoria e exportacao</span>
                    </div>
                    <div className="info-strip">
                        <Wallet size={16} />
                        <span>Classificacao alimenta dashboard e planejamento</span>
                    </div>
                </div>
            </MotionSection>

            <MotionSection {...sectionTransition}>
                <SettingsView />
            </MotionSection>

            <MotionSection {...sectionTransition} className="premium-surface info-banner">
                <div className="info-banner-icon">
                    <BadgeInfo size={18} />
                </div>
                <div>
                    <strong>Observacao</strong>
                    <p>
                        O perfil usa os dados existentes no IndexedDB local. Quando voce altera categorias ou alias aqui, os relatorios e previsoes passam a refletir a nova leitura automaticamente.
                    </p>
                </div>
            </MotionSection>
        </div>
    );
};

export default ProfileView;
