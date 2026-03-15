import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
    ArrowLeft, 
    Leaf, 
    Calendar, 
    DollarSign, 
    Info, 
    ShoppingBag,
    RefreshCw
} from 'lucide-react';

const SpendingTree = ({ onBack }) => {
    const canvasRef = useRef(null);
    const pixiAppRef = useRef(null);
    const treeContainerRef = useRef(null);
    
    // UI State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [budgetInput, setBudgetInput] = useState('1000');
    const [selectedElement, setSelectedElement] = useState(null);
    const [zoom, setZoom] = useState(1);

    // Month Logic
    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    
    // Database Queries
    const budgetRecord = useLiveQuery(() => db.budgets.get(monthKey), [monthKey]);
    const receipts = useLiveQuery(() => db.receipts.toArray());
    const products = useLiveQuery(() => db.products.toArray());

    const monthData = useMemo(() => {
        if (!receipts || !products) return { totalSpent: 0, categories: [], allProducts: [] };

        const filteredReceiptIds = new Set(
            receipts
                .filter(r => r.date && r.date.startsWith(monthKey))
                .map(r => r.id)
        );

        const monthProducts = products.filter(p => filteredReceiptIds.has(p.receiptId));
        
        const catMap = {};
        monthProducts.forEach(p => {
            const cat = p.category || 'Outros';
            if (!catMap[cat]) catMap[cat] = { name: cat, total: 0, count: 0, items: [] };
            catMap[cat].total += Number(p.totalValue) || 0;
            catMap[cat].count += 1;
            catMap[cat].items.push(p);
        });

        const sortedCategories = Object.values(catMap).sort((a, b) => b.total - a.total);
        const totalSpent = sortedCategories.reduce((sum, c) => sum + c.total, 0);

        return {
            totalSpent,
            categories: sortedCategories,
            allProducts: monthProducts
        };
    }, [receipts, products, monthKey]);

    const budget = parseFloat(budgetInput) || 1000;
    const usagePercent = budget > 0 ? (monthData.totalSpent / budget) * 100 : 0;

    const dataRef = useRef({ monthData, budget, usagePercent });
    useEffect(() => {
        dataRef.current = { monthData, budget, usagePercent };
        // Redraw only when data changes significantly
        if (pixiAppRef.current && treeContainerRef.current) {
            drawFullTree();
        }
    }, [monthData, budget]);

    const getTreeState = () => {
        if (usagePercent < 70) return 'healthy';
        if (usagePercent < 90) return 'warning';
        if (usagePercent < 100) return 'stress';
        return 'danger';
    };

    // PixiJS Initialization
    useEffect(() => {
        if (!canvasRef.current) return;

        const initPixi = async () => {
            const app = new Application();
            await app.init({
                canvas: canvasRef.current,
                width: canvasRef.current.clientWidth,
                height: canvasRef.current.clientHeight,
                backgroundColor: 0xf0f9ff,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });
            pixiAppRef.current = app;

            const mainContainer = new Container();
            app.stage.addChild(mainContainer);
            treeContainerRef.current = mainContainer;

            // Simple animation loop for swaying
            let time = 0;
            app.ticker.add(() => {
                time += 0.02;
                if (mainContainer) {
                    const health = getTreeState();
                    const wind = health === 'danger' ? 2 : 1;
                    // Apply subtle swaying to the whole container
                    mainContainer.skew.x = Math.sin(time) * 0.02 * wind;
                }
            });

            drawFullTree();

            const resize = () => {
                if (canvasRef.current && app.renderer) {
                    app.renderer.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
                    drawFullTree();
                }
            };
            window.addEventListener('resize', resize);

            return () => {
                window.removeEventListener('resize', resize);
                app.destroy(true, { children: true });
            };
        };

        initPixi();
    }, []);

    const drawFullTree = () => {
        const container = treeContainerRef.current;
        const app = pixiAppRef.current;
        if (!container || !app || !app.renderer) return;

        container.removeChildren();
        
        const width = app.renderer.width / (window.devicePixelRatio || 1);
        const height = app.renderer.height / (window.devicePixelRatio || 1);
        const centerX = width / 2;
        const bottomY = height - 40;

        const { monthData: data, budget: currentBudget, usagePercent: usage } = dataRef.current;
        const health = getTreeState();
        
        // 1. Ground
        const ground = new Graphics();
        ground.ellipse(centerX, bottomY, 120, 20).fill({ color: usage > 110 ? 0x90A4AE : 0xC8E6C9, alpha: 1 });
        container.addChild(ground);

        // 2. Trunk
        const trunkHeight = Math.min(height * 0.4, 120 + (currentBudget / 1000) * 60);
        const trunkWidth = 30 + (currentBudget / 1000) * 20;
        const trunkVitality = health === 'danger' ? 0.5 : 1;
        
        const trunk = new Graphics();
        trunk.moveTo(centerX - trunkWidth/2, bottomY)
             .bezierCurveTo(centerX - trunkWidth/2, bottomY - trunkHeight/2, centerX - trunkWidth/4, bottomY - trunkHeight/2, centerX - trunkWidth/5, bottomY - trunkHeight)
             .lineTo(centerX + trunkWidth/5, bottomY - trunkHeight)
             .bezierCurveTo(centerX + trunkWidth/4, bottomY - trunkHeight/2, centerX + trunkWidth/2, bottomY - trunkHeight/2, centerX + trunkWidth/2, bottomY)
             .fill({ color: 0x5D4037, alpha: trunkVitality });
        container.addChild(trunk);

        // 3. Branches and Fruits
        const categories = data.categories;
        const leafColor = usage < 70 ? 0x4CAF50 : (usage < 90 ? 0xCDDC39 : (usage < 100 ? 0xFFB300 : 0x8D6E63));

        if (categories.length === 0) {
            // Placeholder for empty tree
            const style = new TextStyle({ fill: 0x90A4AE, fontSize: 14 });
            const msg = new Text({ text: 'Adicione gastos para ver a árvore crescer', style });
            msg.anchor.set(0.5);
            msg.x = centerX;
            msg.y = bottomY - trunkHeight - 40;
            container.addChild(msg);
        }

        categories.forEach((cat, i) => {
            const angle = (Math.PI * 0.6) * (i / Math.max(1, categories.length - 1)) - (Math.PI * 0.3);
            const branchLen = 60 + (cat.total / Math.max(1, data.totalSpent)) * 140;
            const startX = centerX;
            const startY = bottomY - trunkHeight;
            
            const endX = startX + Math.sin(angle) * branchLen;
            const endY = startY - Math.cos(angle) * branchLen;
            
            // Draw branch
            const branch = new Graphics();
            branch.moveTo(startX, startY).lineTo(endX, endY).stroke({ width: 3 + cat.count/5, color: 0x6D4C41 });
            branch.interactive = true;
            branch.cursor = 'pointer';
            branch.on('pointerdown', () => setSelectedElement({ type: 'category', data: cat }));
            container.addChild(branch);

            // Draw Leaves & Fruits
            cat.items.forEach((item, j) => {
                const step = 0.3 + (j / cat.items.length) * 0.7;
                const fx = startX + Math.sin(angle) * branchLen * step;
                const fy = startY - Math.cos(angle) * branchLen * step;

                // Leaf
                if (health !== 'danger') {
                    const leaf = new Graphics();
                    leaf.ellipse(0, 0, 4, 8).fill({ color: leafColor, alpha: 0.8 });
                    leaf.x = fx + (Math.random() - 0.5) * 10;
                    leaf.y = fy + (Math.random() - 0.5) * 10;
                    leaf.rotation = angle + Math.PI/2;
                    container.addChild(leaf);
                }

                // Fruit
                const fruit = new Graphics();
                const radius = 4 + Math.min(6, (Number(item.totalValue) / 10));
                fruit.circle(0, 0, radius).fill({ color: 0xFF5252 });
                // Shine
                fruit.circle(-radius/3, -radius/3, radius/4).fill({ color: 0xFFFFFF, alpha: 0.3 });
                fruit.x = fx;
                fruit.y = fy;
                fruit.interactive = true;
                fruit.cursor = 'pointer';
                fruit.on('pointerdown', (e) => {
                    e.stopPropagation();
                    setSelectedElement({ type: 'product', data: item });
                });
                container.addChild(fruit);
            });
        });
    };

    const handleZoom = (delta) => {
        if (treeContainerRef.current) {
            const newScale = Math.max(0.5, Math.min(3, treeContainerRef.current.scale.x + delta));
            treeContainerRef.current.scale.set(newScale);
            setZoom(newScale);
        }
    };

    const resetView = () => {
        if (treeContainerRef.current) {
            treeContainerRef.current.scale.set(1);
            treeContainerRef.current.position.set(0, 0);
            treeContainerRef.current.skew.set(0);
            setZoom(1);
        }
    };

    return (
        <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f8fafc' }}>
            {/* Header */}
            <header className="glass-card" style={{ marginBottom: '0', borderRadius: '0 0 20px 20px', padding: '15px 20px', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                    <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary-blue)', cursor: 'pointer' }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Árvore dos Gastos</h2>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div className="glass-card" style={{ padding: '8px', margin: 0, borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <label style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-light)' }}>Mês</label>
                        <select 
                            value={selectedMonth} 
                            onChange={e => setSelectedMonth(parseInt(e.target.value))}
                            style={{ width: '100%', border: 'none', background: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}
                        >
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="glass-card" style={{ padding: '8px', margin: 0, borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <label style={{ display: 'block', fontSize: '0.6rem', color: 'var(--text-light)' }}>Meta (R$)</label>
                        <input 
                            type="number" 
                            value={budgetInput} 
                            onChange={(e) => setBudgetInput(e.target.value)}
                            style={{ width: '100%', border: 'none', background: 'none', fontSize: '0.8rem', fontWeight: 'bold' }}
                        />
                    </div>
                    <div className="glass-card" style={{ padding: '8px', margin: 0, borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)', background: usagePercent > 100 ? '#ffebee' : '#f1f8e9' }}>
                        <label style={{ display: 'block', fontSize: '0.6rem', color: usagePercent > 100 ? '#c62828' : '#2e7d32' }}>Uso</label>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: usagePercent > 100 ? '#c62828' : '#2e7d32' }}>
                            {Math.round(usagePercent)}%
                        </span>
                    </div>
                </div>
            </header>

            {/* Tree Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <canvas 
                    ref={canvasRef} 
                    style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
                />

                {/* Controls */}
                <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button onClick={resetView} style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'white', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RefreshCw size={18} color="var(--primary-blue)" />
                    </button>
                    <button onClick={() => handleZoom(0.2)} style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'white', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '1.2rem', fontWeight: 'bold' }}>+</button>
                    <button onClick={() => handleZoom(-0.2)} style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'white', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '1.2rem', fontWeight: 'bold' }}>-</button>
                </div>

                {/* Details Card */}
                {selectedElement && (
                    <div className="animate-slide-up" style={{ position: 'absolute', bottom: '20px', left: '20px', right: '20px', padding: '15px', background: 'white', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', borderLeft: '5px solid var(--primary-blue)', zIndex: 100 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
                                    {selectedElement.type === 'category' ? `Categoria: ${selectedElement.data.name}` : selectedElement.data.name}
                                </h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                    {selectedElement.type === 'category' ? `${selectedElement.data.count} itens comprados` : `Preço: R$ ${Number(selectedElement.data.unitPrice).toFixed(2)}`}
                                </span>
                            </div>
                            <button onClick={() => setSelectedElement(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#999' }}>×</button>
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary-blue)' }}>
                            R$ {Number(selectedElement.data.total || selectedElement.data.totalValue).toFixed(2)}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Summary */}
            <div style={{ padding: '15px 20px', background: 'white', borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Total do Mês</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>R$ {monthData.totalSpent.toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Saúde da Árvore</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: usagePercent < 70 ? '#2e7d32' : (usagePercent < 100 ? '#f57c00' : '#c62828') }}>
                            {getTreeState().toUpperCase()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SpendingTree;
