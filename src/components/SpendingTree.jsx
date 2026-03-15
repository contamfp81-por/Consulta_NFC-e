import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
    ArrowLeft, 
    Leaf, 
    TrendingUp, 
    Calendar, 
    DollarSign, 
    Info, 
    ShoppingBag,
    Search,
    Maximize2,
    RefreshCw
} from 'lucide-react';

const SpendingTree = ({ onBack }) => {
    const canvasRef = useRef(null);
    const pixiAppRef = useRef(null);
    
    // UI State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [budgetInput, setBudgetInput] = useState('1000');
    const [selectedElement, setSelectedElement] = useState(null); // { type: 'branch'|'fruit', data: any }
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

    // Update budget from DB if it exists
    useEffect(() => {
        if (budgetRecord) {
            setBudgetInput(String(budgetRecord.amount));
        } else {
            setBudgetInput('1000'); // Default
        }
    }, [budgetRecord]);

    const handleBudgetChange = async (e) => {
        const value = e.target.value;
        setBudgetInput(value);
        const numericValue = parseFloat(value);
        if (!isNaN(numericValue)) {
            await db.budgets.put({ monthKey, amount: numericValue });
        }
    };

    const budget = parseFloat(budgetInput) || 1000;
    const usagePercent = budget > 0 ? (monthData.totalSpent / budget) * 100 : 0;

    // Health Logic
    const getHealthColor = () => {
        if (usagePercent < 70) return 0x4CAF50; // Green
        if (usagePercent < 90) return 0xFFEB3B; // Yellow
        if (usagePercent < 100) return 0xFF9800; // Orange
        return 0xF44336; // Red
    };

    const getTreeState = () => {
        if (usagePercent < 70) return 'healthy';
        if (usagePercent < 90) return 'warning';
        if (usagePercent < 100) return 'stress';
        return 'danger';
    };

    // PixiJS Initialization & Loop
    useEffect(() => {
        if (!canvasRef.current) return;

        const initPixi = async () => {
            const app = new PIXI.Application();
            await app.init({
                view: canvasRef.current,
                width: canvasRef.current.clientWidth,
                height: canvasRef.current.clientHeight,
                backgroundColor: 0xf8fafc,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });
            pixiAppRef.current = app;

            const container = new PIXI.Container();
            app.stage.addChild(container);

            // Responsive Resize
            const resize = () => {
                if (canvasRef.current) {
                    app.renderer.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
                }
            };
            window.addEventListener('resize', resize);

            // Animation loop
            let time = 0;
            app.ticker.add((ticker) => {
                time += 0.02;
                renderTree(container, monthData, budget, usagePercent, time);
            });

            return () => {
                window.removeEventListener('resize', resize);
                app.destroy(true, { children: true });
            };
        };

        initPixi();
    }, []);

    const resetView = () => {
        if (pixiAppRef.current) {
            const container = pixiAppRef.current.stage.children[0];
            container.scale.set(1);
            container.position.set(0, 0);
            setZoom(1);
        }
    };

    const handleZoom = (delta) => {
        if (pixiAppRef.current) {
            const container = pixiAppRef.current.stage.children[0];
            const newScale = Math.max(0.5, Math.min(3, container.scale.x + delta));
            container.scale.set(newScale);
            setZoom(newScale);
        }
    };
    // Tree Rendering Logic
    const renderTree = (container, data, budget, usage, time) => {
        container.removeChildren();
        
        const width = pixiAppRef.current.renderer.width / (window.devicePixelRatio || 1);
        const height = pixiAppRef.current.renderer.height / (window.devicePixelRatio || 1);
        
        const centerX = width / 2;
        const bottomY = height - 50;
        
        // Background Nature Gradient
        const bg = new PIXI.Graphics();
        // Sky to grass gradient simulation
        for (let y = 0; y < height; y += 4) {
            const ratio = y / height;
            const r = Math.floor(248 * (1 - ratio) + 232 * ratio);
            const g = Math.floor(250 * (1 - ratio) + 245 * ratio);
            const b = Math.floor(252 * (1 - ratio) + 230 * ratio);
            const color = (r << 16) + (g << 8) + b;
            bg.beginFill(color);
            bg.drawRect(0, y, width, 4);
            bg.endFill();
        }
        container.addChild(bg);

        // State-based modifiers
        const health = getTreeState();
        const windScale = health === 'danger' ? 2.5 : 1;
        const leafColor = usage < 70 ? 0x4CAF50 : (usage < 90 ? 0xC0CA33 : (usage < 100 ? 0xFFA726 : 0x795548));
        const trunkVitality = health === 'danger' ? 0.4 : (health === 'stress' ? 0.7 : 1);

        // Trunk - Robustness based on budget
        const trunkBaseWidth = Math.min(80, 30 + (budget / 400) * 15);
        const trunkTopWidth = trunkBaseWidth * 0.6;
        const trunkHeight = Math.min(240, 100 + (budget / 800) * 60);
        
        const trunk = new PIXI.Graphics();
        trunk.beginFill(0x5D4037, trunkVitality);
        
        // Organic Trunk with curve
        trunk.moveTo(centerX - trunkBaseWidth/2, bottomY);
        trunk.bezierCurveTo(
            centerX - trunkBaseWidth/2, bottomY - trunkHeight/2,
            centerX - trunkTopWidth/2, bottomY - trunkHeight/2,
            centerX - trunkTopWidth/2, bottomY - trunkHeight
        );
        trunk.lineTo(centerX + trunkTopWidth/2, bottomY - trunkHeight);
        trunk.bezierCurveTo(
            centerX + trunkTopWidth/2, bottomY - trunkHeight/2,
            centerX + trunkBaseWidth/2, bottomY - trunkHeight/2,
            centerX + trunkBaseWidth/2, bottomY
        );
        trunk.endFill();
        container.addChild(trunk);

        // Soil/Ground
        const ground = new PIXI.Graphics();
        ground.beginFill(usage > 110 ? 0x9E9E9E : 0xEEEEEE);
        ground.drawEllipse(centerX, bottomY, trunkBaseWidth * 2, 10);
        ground.endFill();
        container.addChild(ground);

        // Branches (Categories)
        const categories = data.categories;
        const totalCats = categories.length;
        
        categories.forEach((cat, i) => {
            // Distribute branches evenly in a fan shape
            const angle = (Math.PI * 0.7) * (i / Math.max(1, totalCats - 1)) - (Math.PI * 0.35);
            const branchLen = 70 + (cat.total / Math.max(1, data.totalSpent)) * 140;
            const branchThickness = 4 + (cat.count / 8);
            
            const startX = centerX;
            const startY = bottomY - trunkHeight;
            
            // Sway animation for organic feel
            const sway = Math.sin(time + i * 0.5) * 0.04 * windScale;
            
            // Multi-segment branch for curve
            const segments = 5;
            let lastX = startX;
            let lastY = startY;
            
            const branch = new PIXI.Graphics();
            branch.lineStyle(branchThickness, 0x6D4C41, 1);
            branch.moveTo(startX, startY);
            
            const points = [];
            for (let s = 1; s <= segments; s++) {
                const stepPos = s / segments;
                const segmentAngle = angle + sway * stepPos;
                const nextX = startX + Math.sin(segmentAngle) * branchLen * stepPos;
                const nextY = startY - Math.cos(segmentAngle) * branchLen * stepPos;
                branch.lineTo(nextX, nextY);
                points.push({ x: nextX, y: nextY, angle: segmentAngle });
            }
            
            // Interaction for branch
            branch.interactive = true;
            branch.cursor = 'pointer';
            branch.on('pointerdown', () => setSelectedElement({ type: 'category', data: cat }));
            
            container.addChild(branch);

            // Leaves & Fruits
            const branchItems = cat.items;
            branchItems.forEach((item, j) => {
                // Fruit position along the branch segments
                const pointIdx = Math.floor((j / branchItems.length) * (points.length - 1));
                const point = points[pointIdx];
                if (!point) return;

                const fx = point.x + (Math.random() - 0.5) * 15;
                const fy = point.y + (Math.random() - 0.5) * 15;
                
                // Leaves (scattering)
                const shouldDrawLeaf = usage < 100 || Math.random() > (usage - 100) / 100;
                if (shouldDrawLeaf) {
                    const leaf = new PIXI.Graphics();
                    leaf.beginFill(leafColor, 0.7 + Math.random() * 0.3);
                    leaf.drawEllipse(0, 0, 5, 10);
                    leaf.endFill();
                    leaf.x = fx + (Math.random() - 0.5) * 8;
                    leaf.y = fy + (Math.random() - 0.5) * 8;
                    leaf.rotation = point.angle + Math.PI/2 + (Math.random() - 0.5);
                    container.addChild(leaf);
                }

                // Fruit (Product) - Size based on value
                const fruit = new PIXI.Graphics();
                const fruitRadius = 4 + Math.min(6, (Number(item.totalValue) / 15));
                
                // Color variation based on category or health
                const fruitHue = 0xFF5252; // Redish
                fruit.beginFill(fruitHue);
                fruit.drawCircle(0, 0, fruitRadius);
                fruit.endFill();
                
                // Add a small shine/highlight for premium look
                if (health === 'healthy') {
                    fruit.beginFill(0xFFFFFF, 0.4);
                    fruit.drawCircle(-fruitRadius/3, -fruitRadius/3, fruitRadius/4);
                    fruit.endFill();
                }

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

    return (
        <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100vh - 120px)' }}>
            {/* Header */}
            <header className="glass-card" style={{ marginBottom: '15px', borderRadius: '0 0 20px 20px', padding: '15px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                    <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary-blue)', cursor: 'pointer' }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Árvore dos Gastos</h2>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-light)' }}>
                            Visualização viva do seu orçamento de supermercado no mês
                        </p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '15px' }}>
                    <div className="glass-card" style={{ padding: '10px', margin: 0, borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-light)' }}>Mês/Ano</label>
                        <select 
                            value={selectedMonth} 
                            onChange={e => setSelectedMonth(parseInt(e.target.value))}
                            style={{ width: '100%', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 'bold', outline: 'none' }}
                        >
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="glass-card" style={{ padding: '10px', margin: 0, borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-light)' }}>Orçamento (R$)</label>
                        <input 
                            type="number" 
                            value={budgetInput} 
                            onChange={handleBudgetChange}
                            style={{ width: '100%', border: 'none', background: 'none', fontSize: '0.85rem', fontWeight: 'bold', outline: 'none' }}
                        />
                    </div>
                    <div className="glass-card" style={{ padding: '10px', margin: 0, borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', backgroundColor: usagePercent > 100 ? 'rgba(244, 67, 54, 0.1)' : 'rgba(76, 175, 80, 0.1)' }}>
                        <label style={{ display: 'block', fontSize: '0.65rem', color: usagePercent > 100 ? '#F44336' : '#2E7D32' }}>Status</label>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: usagePercent > 100 ? '#F44336' : '#2E7D32' }}>
                            {Math.round(usagePercent)}%
                        </span>
                    </div>
                </div>
            </header>

            {/* Tree Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '20px', margin: '0 20px 20px 20px' }}>
                <canvas 
                    ref={canvasRef} 
                    style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
                />
                
                {/* Visual Feedback on state */}
                <div style={{ position: 'absolute', bottom: '20px', left: '20px', pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 15px', borderRadius: '30px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(5px)' }}>
                        <Leaf size={16} color={usagePercent > 90 ? '#FF9800' : '#4CAF50'} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {getTreeState() === 'healthy' ? 'Árvore Saudável' : 
                             getTreeState() === 'warning' ? 'Atenção Visual' :
                             getTreeState() === 'stress' ? 'Estresse Hídrico' : 'Emergência Financeira'}
                        </span>
                    </div>
                </div>

                {/* Legend & Controls */}
                <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button 
                        style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                        onClick={() => setSelectedElement({ type: 'legend' })}
                    >
                        <Info size={20} color="var(--primary-blue)" />
                    </button>
                    <button 
                        style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                        onClick={resetView}
                    >
                        <RefreshCw size={20} color="var(--primary-blue)" />
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '12px', background: 'white', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        <button onClick={() => handleZoom(0.2)} style={{ width: '40px', height: '40px', border: 'none', background: 'none', borderBottom: '1px solid #eee' }}>+</button>
                        <button onClick={() => handleZoom(-0.2)} style={{ width: '40px', height: '40px', border: 'none', background: 'none' }}>-</button>
                    </div>
                </div>

                {/* Selected Element Card */}
                {selectedElement && (
                    <div 
                        className="animate-slide-up"
                        style={{ 
                            position: 'absolute', 
                            bottom: '0', 
                            left: '0', 
                            right: '0', 
                            padding: '20px', 
                            background: 'white', 
                            borderTop: '2px solid var(--primary-blue)',
                            borderRadius: '30px 30px 0 0',
                            boxShadow: '0 -10px 30px rgba(0,0,0,0.1)',
                            zIndex: 100
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0 }}>
                                {selectedElement.type === 'category' ? `Categoria: ${selectedElement.data.name}` : 
                                 selectedElement.type === 'product' ? selectedElement.data.name : 'Legenda da Árvore'}
                            </h3>
                            <button onClick={() => setSelectedElement(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>

                        {selectedElement.type === 'category' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ padding: '15px', borderRadius: '15px', background: 'rgba(26, 35, 126, 0.05)' }}>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Total Gasto</label>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>R$ {selectedElement.data.total.toFixed(2)}</div>
                                </div>
                                <div style={{ padding: '15px', borderRadius: '15px', background: 'rgba(26, 35, 126, 0.05)' }}>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Itens</label>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{selectedElement.data.count} frutas</div>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '5px', display: 'block' }}>Alguns produtos:</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {selectedElement.data.items.slice(0, 8).map((item, i) => (
                                            <span key={i} style={{ padding: '4px 10px', background: '#eee', borderRadius: '20px', fontSize: '0.7rem' }}>
                                                {item.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedElement.type === 'product' && (
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <div style={{ width: '60px', height: '60px', borderRadius: '15px', background: 'rgba(255,82,82,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShoppingBag color="#FF5252" size={30} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>R$ {Number(selectedElement.data.totalValue).toFixed(2)}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                                        {selectedElement.data.quantity} x R$ {Number(selectedElement.data.unitPrice).toFixed(2)}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                        #{selectedElement.data.category} | {selectedElement.data.establishment || 'Loja não informada'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedElement.type === 'legend' && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-dark)' }}>
                                <p>🌳 <strong>Tronco:</strong> Representa seu orçamento total (altura e largura).</p>
                                <p>🌿 <strong>Galhos:</strong> São as categorias. Quanto maior o gasto, mais longo o galho.</p>
                                <p>🍎 <strong>Frutas:</strong> Cada item comprado é um fruto na sua árvore.</p>
                                <p>🍃 <strong>Folhas:</strong> Indicam a saúde do seu bolso. Verdes = ok. Secas = alerta.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* General Stats Footer (Floating over canvas) */}
            <div style={{ padding: '0 20px 20px 20px' }}>
                <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Total Gasto</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>R$ {monthData.totalSpent.toFixed(2)}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Restante</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: budget - monthData.totalSpent < 0 ? '#F44336' : '#2E7D32' }}>
                            R$ {(budget - monthData.totalSpent).toFixed(2)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>Impacto</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{monthData.categories.length} Categorias</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SpendingTree;
