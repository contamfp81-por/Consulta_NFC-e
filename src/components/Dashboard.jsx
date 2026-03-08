import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
    Treemap, ScatterChart, Scatter, ZAxis, Legend, ComposedChart
} from 'recharts';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    TrendingUp, CreditCard, ShoppingBag, Calendar,
    PieChart as PieIcon, BarChart3, LineChart as LineIcon,
    Layers, Activity, Target, Layout, Database, Hash, Thermometer, ArrowRightLeft
} from 'lucide-react';

const COLORS = [
    '#1A237E', '#00E5FF', '#2E7D32', '#FF9800', '#E91E63',
    '#9C27B0', '#FFD600', '#4CAF50', '#2196F3', '#FF5722'
];

const Dashboard = () => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];

    const stats = useMemo(() => {
        if (!receipts.length || !products.length) return null;

        // 1 & 2: Store distribution and comparison
        const storeMap = {};
        receipts.forEach(r => {
            const name = r.establishment || 'Outros';
            storeMap[name] = (storeMap[name] || 0) + (Number(r.totalValue) || 0);
        });
        const storeData = Object.entries(storeMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // 3: Evolution over time (by date)
        const dateMap = {};
        receipts.forEach(r => {
            const d = new Date(r.date).toISOString().split('T')[0];
            dateMap[d] = (dateMap[d] || 0) + (Number(r.totalValue) || 0);
        });
        const evolutionData = Object.entries(dateMap)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // 4: Stacked Data (Stores over time - last 5 stores)
        const top5Stores = storeData.slice(0, 5).map(s => s.name);
        const stackedMap = {};
        receipts.forEach(r => {
            const dateStr = new Date(r.date).toLocaleDateString('pt-BR', { month: 'short' });
            if (!stackedMap[dateStr]) stackedMap[dateStr] = { month: dateStr };
            const store = r.establishment || 'Outros';
            if (top5Stores.includes(store)) {
                stackedMap[dateStr][store] = (stackedMap[dateStr][store] || 0) + (Number(r.totalValue) || 0);
            }
        });
        const stackedData = Object.values(stackedMap);

        // 5: Accumulated Area
        let runningTotal = 0;
        const accumulatedData = evolutionData.map(d => {
            runningTotal += d.value;
            return { date: d.date, total: runningTotal };
        });

        // 6: Pareto (Top Products)
        const prodMap = {};
        products.forEach(p => {
            prodMap[p.name] = (prodMap[p.name] || 0) + (Number(p.totalValue) || 0);
        });
        const fullProdData = Object.entries(prodMap)
            .map(([name, value]) => ({ name: name.substring(0, 15), value }))
            .sort((a, b) => b.value - a.value);

        let cumulative = 0;
        const totalSum = fullProdData.reduce((a, b) => a + b.value, 0);
        const paretoData = fullProdData.slice(0, 10).map(p => {
            cumulative += p.value;
            return { ...p, percentage: (cumulative / totalSum) * 100 };
        });

        // 7: Treemap (Categories)
        const catMap = {};
        products.forEach(p => {
            const cat = p.category || 'Outros';
            catMap[cat] = (catMap[cat] || 0) + (Number(p.totalValue) || 0);
        });
        const treemapData = [{
            name: 'Gastos',
            children: Object.entries(catMap).map(([name, value]) => ({ name, size: value }))
        }];

        // 8: Scatter (Price vs Quantity)
        const scatterData = products.slice(0, 50).map(p => ({
            x: Number(p.quantity),
            y: Number(p.unitPrice),
            name: p.name
        }));

        // 9: Histogram (Price distribution)
        const ranges = [0, 5, 10, 20, 50, 100, 500];
        const histMap = {};
        products.forEach(p => {
            const price = Number(p.unitPrice);
            const range = ranges.find((r, i) => price <= (ranges[i + 1] || Infinity));
            const label = price > 500 ? '> 500' : `Até R$${ranges[ranges.indexOf(range) + 1] || 500}`;
            histMap[label] = (histMap[label] || 0) + 1;
        });
        const histogramData = Object.entries(histMap).map(([name, count]) => ({ name, count }));

        // 10: Heatmap (Weekday density)
        const weekMap = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
        const weekKeys = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        receipts.forEach(r => {
            const day = weekKeys[new Date(r.date).getUTCDay()];
            weekMap[day] = (weekMap[day] || 0) + 1;
        });
        const heatmapData = Object.entries(weekMap).map(([name, value]) => ({ name, value }));

        return {
            totalSpent: totalSum,
            storeData,
            evolutionData,
            stackedData,
            accumulatedData,
            paretoData,
            treemapData,
            scatterData,
            histogramData,
            heatmapData,
            top5Stores
        };
    }, [receipts, products]);

    if (!stats) {
        return (
            <div className="animate-slide-up" style={{ textAlign: 'center', padding: '50px 20px' }}>
                <ShoppingBag size={64} style={{ opacity: 0.1, marginBottom: '20px' }} />
                <h3>Nenhum dado disponível</h3>
                <p style={{ color: 'var(--text-light)' }}>Importe seus primeiros cupons para ver as análises.</p>
            </div>
        );
    }

    const ChartCard = ({ title, icon: Icon, children, fullWidth = false }) => (
        <div className="glass-card" style={{ gridColumn: fullWidth ? '1/-1' : 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                    <Icon size={18} />
                </div>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h4>
            </div>
            <div style={{ height: '250px', width: '100%' }}>
                {children}
            </div>
        </div>
    );

    return (
        <div className="animate-slide-up" style={{ paddingBottom: '20px' }}>
            <div className="glass-card" style={{ background: 'var(--accent-gradient)', color: 'white', marginBottom: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>Gastos Totais Acumulados</p>
                        <h2 style={{ color: 'white', fontSize: '2.4rem', margin: '5px 0' }}>R$ {stats.totalSpent.toFixed(2)}</h2>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Período Analisado</div>
                        <div style={{ fontWeight: 'bold' }}>Últimos {receipts.length} Cupons</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '20px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Hash size={16} /> {products.length} itens</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={16} /> R$ {(stats.totalSpent / Math.max(1, receipts.length)).toFixed(2)} por cupom</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {/* 1 & 2: Pizza e Barras - Lojas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <ChartCard title="1. Distribuição por Loja (%)" icon={PieIcon}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={stats.storeData.slice(0, 6)} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" nameKey="name">
                                    {stats.storeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="2. Comparativo de Lojas" icon={BarChart3}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.storeData.slice(0, 5)} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Bar dataKey="value" fill="var(--primary-blue)" radius={[0, 10, 10, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>

                {/* 3: Linha - Evolução */}
                <ChartCard title="3. Evolução dos Gastos no Tempo" icon={LineIcon} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.evolutionData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                            <Line type="monotone" dataKey="value" stroke="var(--primary-blue)" strokeWidth={3} dot={{ r: 4, fill: 'var(--primary-blue)' }} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 4 & 5: Empilhadas e Área */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <ChartCard title="4. Gastos por Loja x Mês" icon={Layers}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.stackedData}>
                                <XAxis dataKey="month" fontSize={10} />
                                <Tooltip />
                                {stats.top5Stores.map((store, i) => (
                                    <Bar key={store} dataKey={store} stackId="a" fill={COLORS[i % COLORS.length]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="5. Volume Acumulado de Gastos" icon={Activity}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.accumulatedData}>
                                <defs>
                                    <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--secondary-cyan)" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="var(--secondary-cyan)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Area type="monotone" dataKey="total" stroke="var(--secondary-cyan)" fill="url(#colorAcc)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>

                {/* 6: Pareto */}
                <ChartCard title="6. Gráfico de Pareto (Top 10 Produtos)" icon={Target} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={stats.paretoData}>
                            <XAxis dataKey="name" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                            <YAxis yAxisId="left" orientation="left" stroke="var(--primary-blue)" hide />
                            <YAxis yAxisId="right" orientation="right" stroke="#ff7300" domain={[0, 100]} hide />
                            <Tooltip />
                            <Bar yAxisId="left" dataKey="value" fill="var(--primary-blue)" radius={[5, 5, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="percentage" stroke="#ff7300" strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 7: Treemap */}
                <ChartCard title="7. Treemap de Categorias" icon={Layout} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                            data={stats.treemapData[0].children}
                            dataKey="size"
                            stroke="#fff"
                            fill="var(--primary-blue)"
                        >
                            <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                        </Treemap>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 8 & 9: Dispersão e Histograma */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <ChartCard title="8. Preço Unitário vs Qtd" icon={Database}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart>
                                <XAxis type="number" dataKey="x" name="Qtd" unit=" un" />
                                <YAxis type="number" dataKey="y" name="Preço" unit=" R$" />
                                <ZAxis type="category" dataKey="name" name="Produto" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter name="Produtos" data={stats.scatterData} fill="var(--secondary-cyan)" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="9. Histograma de Preços" icon={Hash}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.histogramData}>
                                <XAxis dataKey="name" fontSize={9} />
                                <Tooltip />
                                <Bar dataKey="count" fill="var(--primary-blue)" radius={[10, 10, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>

                {/* 10: Heatmap (Weekday) */}
                <ChartCard title="10. Mapa de Calor (Dias da Semana)" icon={Thermometer} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.heatmapData}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="value" radius={20}>
                                {stats.heatmapData.map((entry, index) => (
                                    <Cell
                                        key={index}
                                        fill={entry.value > 5 ? '#E91E63' : entry.value > 2 ? '#FF9800' : '#00E5FF'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* EXTRA: Fluxo Sankey (Simulado com Treemap Detalhado ou Representação de Fluxo) */}
                {/* Nota: Sankey do Recharts exige estrutura complexa, usaremos uma representação de fluxo visualmente similar */}
                <ChartCard title="📊 Fluxo de Gastos (Loja → Top Categoria)" icon={ArrowRightLeft} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.storeData.slice(0, 5)} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={100} fontSize={12} />
                            <Tooltip />
                            <Bar dataKey="value" radius={[0, 20, 20, 0]}>
                                {stats.storeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                <LabelList dataKey="value" position="right" formatter={(v) => `R$ ${v.toFixed(2)}`} fontSize={10} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-light)', textAlign: 'center', marginTop: '10px' }}>
                        Visualização de fluxo de caixa por estabelecimento principal.
                    </p>
                </ChartCard>
            </div>
        </div>
    );
};

export default Dashboard;
