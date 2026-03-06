import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingUp, CreditCard, ShoppingBag, Calendar } from 'lucide-react';

const COLORS = ['#1A237E', '#00E5FF', '#2E7D32', '#FF9800', '#E91E63', '#9C27B0'];

const Dashboard = () => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];

    const [categoryData, setCategoryData] = useState([]);
    const [monthlyData, setMonthlyData] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [establishmentData, setEstablishmentData] = useState([]);
    const [priceEvolution, setPriceEvolution] = useState([]);

    useEffect(() => {
        if (products && products.length > 0) {
            // 1. Gastos por Categoria
            const catMap = {};
            products.forEach(p => {
                const cat = p.category || 'Outros';
                catMap[cat] = (catMap[cat] || 0) + (Number(p.totalValue) || 0);
            });
            setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })));

            // 2. Top 5 Produtos
            const prodMap = {};
            products.forEach(p => {
                const name = p.name || 'Produto s/ Nome';
                prodMap[name] = (prodMap[name] || 0) + (Number(p.totalValue) || 0);
            });
            setTopProducts(
                Object.entries(prodMap)
                    .map(([name, value]) => ({ name: String(name).substring(0, 15), value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5)
            );
        } else {
            setCategoryData([]);
            setTopProducts([]);
        }

        if (receipts && receipts.length > 0) {
            // 3. Gastos por Estabelecimento
            const estMap = {};
            receipts.forEach(r => {
                const est = r.establishment || 'Loja s/ Nome';
                estMap[est] = (estMap[est] || 0) + (Number(r.totalValue) || 0);
            });
            setEstablishmentData(
                Object.entries(estMap)
                    .map(([name, value]) => ({ name: String(name).substring(0, 10), value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5)
            );

            // 4. Evolução Mensal
            const monthsMap = {};
            receipts.forEach(r => {
                try {
                    const date = new Date(r.date);
                    if (!isNaN(date)) {
                        const month = date.toLocaleString('pt-BR', { month: 'short' });
                        monthsMap[month] = (monthsMap[month] || 0) + (Number(r.totalValue) || 0);
                    }
                } catch (e) {
                    console.error("Data inválida:", r.date);
                }
            });
            setMonthlyData(Object.entries(monthsMap).map(([name, value]) => ({ name, value })));
        } else {
            setEstablishmentData([]);
            setMonthlyData([]);
        }
    }, [products, receipts]);

    const totalSpent = (receipts || []).reduce((acc, curr) => acc + (Number(curr.totalValue) || 0), 0);

    return (
        <div className="animate-slide-up">
            <div className="glass-card" style={{ background: 'var(--accent-gradient)', color: 'white' }}>
                <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>Saldo Total Gasto</p>
                <h2 style={{ color: 'white', fontSize: '2rem', margin: '5px 0' }}>R$ {totalSpent.toFixed(2)}</h2>
                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem' }}>
                        <ShoppingBag size={14} /> {products.length} Itens
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem' }}>
                        <Calendar size={14} /> {receipts.length} Cupons
                    </div>
                </div>
            </div>

            <h3 style={{ marginBottom: '15px' }}>Insights Financeiros</h3>

            {categoryData && categoryData.length > 0 && (
                <div className="glass-card">
                    <h4 style={{ marginBottom: '15px' }}>Gastos por Categoria</h4>
                    <div style={{ height: '220px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {monthlyData && monthlyData.length > 0 && (
                <div className="glass-card">
                    <h4 style={{ marginBottom: '15px' }}>Evolução Mensal</h4>
                    <div style={{ height: '200px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyData}>
                                <defs>
                                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                                <YAxis hide />
                                <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                                <Area type="monotone" dataKey="value" stroke="#00E5FF" fillOpacity={1} fill="url(#colorVal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {topProducts && topProducts.length > 0 && (
                <div className="glass-card">
                    <h4 style={{ marginBottom: '15px' }}>Top 5 Produtos (Volume $)</h4>
                    <div style={{ height: '200px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProducts} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={10} width={80} />
                                <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                                <Bar dataKey="value" fill="var(--primary-blue)" radius={[0, 10, 10, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {establishmentData && establishmentData.length > 0 && (
                <div className="glass-card">
                    <h4 style={{ marginBottom: '15px' }}>Top 5 Lojas</h4>
                    <div style={{ height: '200px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={establishmentData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} />
                                <YAxis hide />
                                <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                                <Bar dataKey="value" fill="var(--secondary-cyan)" radius={[10, 10, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="glass-card">
                <h4 style={{ marginBottom: '15px' }}>Variação de Preço Unitário</h4>
                <div style={{ height: '200px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[
                            { date: 'Jan', price: 4.50 },
                            { date: 'Fev', price: 4.65 },
                            { date: 'Mar', price: 4.30 },
                            { date: 'Abr', price: 4.80 }
                        ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} fontSize={10} />
                            <YAxis hide />
                            <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
                            <Line type="monotone" dataKey="price" stroke="var(--success-emerald)" strokeWidth={3} dot={{ fill: 'var(--success-emerald)' }} />
                        </LineChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-light)', textAlign: 'center', marginTop: '10px' }}>
                        Tendência de preço (Exemplo: Leite Integral)
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
