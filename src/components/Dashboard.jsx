import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
    Treemap, Legend, ComposedChart
} from 'recharts';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    TrendingUp, CreditCard, ShoppingBag, Calendar,
    PieChart as PieIcon, BarChart3, LineChart as LineIcon,
    Layers, Activity, Target, Layout, Hash, Thermometer, FileText, Loader2,
    Search, Wallet
} from 'lucide-react';
import { generateConsumptionAnalysisPdf } from '../utils/export';

const COLORS = [
    '#1A237E', '#00E5FF', '#2E7D32', '#FF9800', '#E91E63',
    '#9C27B0', '#FFD600', '#4CAF50', '#2196F3', '#FF5722'
];

const ESTABLISHMENT_SUFFIXES = new Set(['LTDA', 'LTD', 'S/A', 'SA', 'ME', 'EIRELI', 'EPP', 'EI']);

const getDateKey = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
};

const formatFilterDateLabel = (value) => {
    if (!value) return '--';

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
};

const abbreviateEstablishmentName = (name) => {
    const normalizedName = (name || 'Outros').trim();
    if (normalizedName.length <= 24) return normalizedName;

    const relevantWords = normalizedName
        .split(/\s+/)
        .filter((word) => !ESTABLISHMENT_SUFFIXES.has(word.replace(/[.,]/g, '').toUpperCase()));

    const shortenedWords = [];
    for (const word of relevantWords) {
        const nextLabel = shortenedWords.length > 0
            ? `${shortenedWords.join(' ')} ${word}`
            : word;

        if (nextLabel.length > 24 || shortenedWords.length >= 3) {
            break;
        }

        shortenedWords.push(word);
    }

    const shortenedName = shortenedWords.join(' ').trim();
    if (!shortenedName) {
        return `${normalizedName.slice(0, 21).trimEnd()}...`;
    }

    return shortenedName.length < normalizedName.length
        ? `${shortenedName}...`
        : shortenedName;
};

const Dashboard = () => {
    const receipts = useLiveQuery(() => db.receipts.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const [selectedProductNames, setSelectedProductNames] = useState([]);
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportFeedback, setReportFeedback] = useState('');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');

    const dateBounds = useMemo(() => {
        const validDates = receipts
            .map((receipt) => getDateKey(receipt.date))
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));

        return {
            min: validDates[0] || '',
            max: validDates[validDates.length - 1] || ''
        };
    }, [receipts]);

    useEffect(() => {
        if (!dateBounds.min || !dateBounds.max) return;

        setStartDateFilter((currentValue) => (currentValue ? currentValue : dateBounds.min));
        setEndDateFilter((currentValue) => (currentValue ? currentValue : dateBounds.max));
    }, [dateBounds.max, dateBounds.min]);

    const normalizedDateRange = useMemo(() => {
        if (!dateBounds.min || !dateBounds.max) {
            return { start: '', end: '' };
        }

        let start = startDateFilter || dateBounds.min;
        let end = endDateFilter || dateBounds.max;

        if (start > end) {
            [start, end] = [end, start];
        }

        return { start, end };
    }, [dateBounds.max, dateBounds.min, endDateFilter, startDateFilter]);

    useEffect(() => {
        setReportFeedback('');
    }, [normalizedDateRange.end, normalizedDateRange.start]);

    const filteredReceipts = useMemo(() => receipts.filter((receipt) => {
        const dateKey = getDateKey(receipt.date);
        if (!dateKey) return false;
        if (normalizedDateRange.start && dateKey < normalizedDateRange.start) return false;
        if (normalizedDateRange.end && dateKey > normalizedDateRange.end) return false;
        return true;
    }), [normalizedDateRange.end, normalizedDateRange.start, receipts]);

    const filteredReceiptIds = useMemo(
        () => new Set(filteredReceipts.map((receipt) => receipt.id)),
        [filteredReceipts]
    );

    const filteredProducts = useMemo(
        () => products.filter((product) => filteredReceiptIds.has(product.receiptId)),
        [filteredReceiptIds, products]
    );

    const stats = useMemo(() => {
        if (!filteredReceipts.length || !filteredProducts.length) return null;

        // 1 & 2: Store distribution and comparison
        const storeMap = {};
        filteredReceipts.forEach(r => {
            const name = r.establishment || 'Outros';
            storeMap[name] = (storeMap[name] || 0) + (Number(r.totalValue) || 0);
        });
        const storeData = Object.entries(storeMap)
            .map(([name, value]) => ({
                name,
                shortName: abbreviateEstablishmentName(name),
                value
            }))
            .sort((a, b) => b.value - a.value);

        // Evolution over time (Daily sums) - Requested as second chart
        const dateMap = {};
        filteredReceipts.forEach(r => {
            // Normalize date to YYYY-MM-DD
            try {
                const d = new Date(r.date).toISOString().split('T')[0];
                dateMap[d] = (dateMap[d] || 0) + (Number(r.totalValue) || 0);
            } catch (e) { }
        });
        const dailyEvolutionData = Object.entries(dateMap)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Evolution by Month (for better scalability if there are many entries)
        const monthMap = {};
        filteredReceipts.forEach(r => {
            try {
                const d = new Date(r.date);
                const monthKey = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                monthMap[monthKey] = (monthMap[monthKey] || 0) + (Number(r.totalValue) || 0);
            } catch (e) { }
        });

        // 4: Stacked Data (Stores over time - last 5 stores)
        const top5Stores = storeData.slice(0, 5).map((store) => ({
            key: store.name,
            label: store.shortName
        }));
        const stackedMap = {};
        filteredReceipts.forEach(r => {
            const dateStr = new Date(r.date).toLocaleDateString('pt-BR', { month: 'short' });
            if (!stackedMap[dateStr]) stackedMap[dateStr] = { month: dateStr };
            const store = r.establishment || 'Outros';
            if (top5Stores.some((topStore) => topStore.key === store)) {
                stackedMap[dateStr][store] = (stackedMap[dateStr][store] || 0) + (Number(r.totalValue) || 0);
            }
        });
        const stackedData = Object.values(stackedMap);

        // 5: Accumulated Area
        let runningTotal = 0;
        const accumulatedData = dailyEvolutionData.map(d => {
            runningTotal += d.value;
            return { date: d.date, total: runningTotal };
        });

        // 6: Pareto (Top Products)
        const prodMap = {};
        filteredProducts.forEach(p => {
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
        filteredProducts.forEach(p => {
            const cat = p.category || 'Outros';
            catMap[cat] = (catMap[cat] || 0) + (Number(p.totalValue) || 0);
        });
        const treemapData = [{
            name: 'Gastos',
            children: Object.entries(catMap).map(([name, value]) => ({ name, size: value }))
        }];
        const categorySpendData = Object.entries(catMap)
            .map(([name, value]) => ({
                name,
                value,
                percentage: totalSum > 0 ? (value / totalSum) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        // 9: Histogram (Price distribution)
        const ranges = [0, 5, 10, 20, 50, 100, 500];
        const histMap = {};
        filteredProducts.forEach(p => {
            const price = Number(p.unitPrice);
            const range = ranges.find((r, i) => price <= (ranges[i + 1] || Infinity));
            const label = price > 500 ? '> 500' : `Até R$${ranges[ranges.indexOf(range) + 1] || 500}`;
            histMap[label] = (histMap[label] || 0) + 1;
        });
        const histogramData = Object.entries(histMap).map(([name, count]) => ({ name, count }));

        // 10: Heatmap (Weekday density)
        const weekMap = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
        const weekKeys = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        filteredReceipts.forEach(r => {
            const day = weekKeys[new Date(r.date).getUTCDay()];
            weekMap[day] = (weekMap[day] || 0) + 1;
        });
        const heatmapData = Object.entries(weekMap).map(([name, value]) => ({ name, value }));

        // Evolution of a specific product
        const uniqueProductsList = [...new Set(filteredProducts.map(p => p.name))].sort();
        let productEvolutionData = [];
        if (selectedProductNames.length > 0) {
            const productEvolutionMap = {};
            filteredProducts
                .filter((product) => selectedProductNames.includes(product.name))
                .forEach((product) => {
                    const receipt = filteredReceipts.find((r) => r.id === product.receiptId);
                    const date = receipt ? new Date(receipt.date).toISOString().split('T')[0] : 'Desconhecida';

                    if (!productEvolutionMap[date]) {
                        productEvolutionMap[date] = { date, totalPrice: 0, count: 0 };
                    }

                    productEvolutionMap[date].totalPrice += Number(product.unitPrice) || 0;
                    productEvolutionMap[date].count += 1;
                });

            productEvolutionData = Object.values(productEvolutionMap)
                .map((item) => ({
                    date: item.date,
                    price: item.count > 0 ? item.totalPrice / item.count : 0
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        return {
            totalSpent: totalSum,
            storeData,
            dailyEvolutionData,
            stackedData,
            accumulatedData,
            paretoData,
            treemapData,
            categorySpendData,
            histogramData,
            heatmapData,
            top5Stores,
            uniqueProductsList,
            productEvolutionData
        };
    }, [filteredProducts, filteredReceipts, selectedProductNames]);

    const filteredProductOptions = useMemo(() => {
        if (!stats) return [];

        const normalizedSearchTerm = productSearchTerm.trim().toLowerCase();
        if (!normalizedSearchTerm) {
            return stats.uniqueProductsList;
        }

        return stats.uniqueProductsList.filter((name) =>
            name.toLowerCase().includes(normalizedSearchTerm)
        );
    }, [stats, productSearchTerm]);

    useEffect(() => {
        if (!stats) {
            setSelectedProductNames((currentSelection) => (currentSelection.length ? [] : currentSelection));
            return;
        }

        setSelectedProductNames((currentSelection) => {
            const nextSelection = currentSelection.filter((name) => stats.uniqueProductsList.includes(name));
            return nextSelection.length === currentSelection.length ? currentSelection : nextSelection;
        });
    }, [stats]);

    if (!receipts.length || !products.length) {
        return (
            <div className="animate-slide-up" style={{ textAlign: 'center', padding: '50px 20px' }}>
                <ShoppingBag size={64} style={{ opacity: 0.1, marginBottom: '20px' }} />
                <h3>Nenhum dado disponível</h3>
                <p style={{ color: 'var(--text-light)' }}>Importe seus primeiros cupons para ver as análises.</p>
            </div>
        );
    }

    const ChartCard = ({ title, icon: Icon, children, fullWidth = false, contentHeight = '250px' }) => (
        <div className="glass-card" style={{ gridColumn: fullWidth ? '1/-1' : 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                    <Icon size={18} />
                </div>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{title}</h4>
            </div>
            <div style={{ height: contentHeight, width: '100%' }}>
                {children}
            </div>
        </div>
    );

    const renderStoreLegend = ({ payload = [] }) => (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '8px 12px',
                width: '100%',
                paddingTop: '8px'
            }}
        >
            {payload.map((entry, index) => (
                <div
                    key={`${entry.value}-${index}`}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        minWidth: 0
                    }}
                >
                    <span
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: entry.color,
                            marginTop: '4px',
                            flexShrink: 0
                        }}
                    />
                    <span
                        style={{
                            color: 'var(--text-main)',
                            fontSize: '0.7rem',
                            lineHeight: '1.2',
                            textAlign: 'left',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word'
                        }}
                    >
                        {entry.value}
                    </span>
                </div>
            ))}
        </div>
    );

    const toggleProductSelection = (productName) => {
        setSelectedProductNames((currentSelection) => (
            currentSelection.includes(productName)
                ? currentSelection.filter((name) => name !== productName)
                : [...currentSelection, productName]
        ));
    };

    const handleGenerateConsumptionReport = async () => {
        if (isGeneratingReport) return;

        if (!stats) {
            setReportFeedback('Selecione um intervalo com dados para gerar o relatório PDF.');
            return;
        }

        setIsGeneratingReport(true);
        setReportFeedback('');

        try {
            await generateConsumptionAnalysisPdf({ receipts: filteredReceipts, products: filteredProducts, stats });
            setReportFeedback('Relatório PDF gerado com sucesso.');
        } catch (error) {
            console.error('Erro ao gerar relatório PDF:', error);
            const reportErrorMessage = error?.message ? `Não foi possível gerar o relatório PDF. ${error.message}` : 'Não foi possível gerar o relatório PDF.';
            setReportFeedback(reportErrorMessage);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const hasFilteredResults = Boolean(stats);
    const selectedPeriodLabel = normalizedDateRange.start && normalizedDateRange.end
        ? `${formatFilterDateLabel(normalizedDateRange.start)} até ${formatFilterDateLabel(normalizedDateRange.end)}`
        : 'Período completo';
    const averageTicketValue = hasFilteredResults
        ? stats.totalSpent / Math.max(1, filteredReceipts.length)
        : 0;

    return (
        <div className="animate-slide-up" style={{ paddingBottom: '20px' }}>
            <div className="glass-card" style={{ marginBottom: '25px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ padding: '8px', background: 'rgba(26, 35, 126, 0.1)', borderRadius: '10px', color: 'var(--primary-blue)' }}>
                        <Calendar size={18} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Intervalo de Datas</h4>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-light)', fontSize: '0.82rem' }}>
                            O período selecionado será aplicado aos gráficos e ao relatório em PDF.
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                    <label style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: 'var(--text-light)' }}>
                        Data inicial
                        <input
                            type="date"
                            value={startDateFilter}
                            min={dateBounds.min || undefined}
                            max={dateBounds.max || undefined}
                            onChange={(event) => setStartDateFilter(event.target.value)}
                            style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)' }}
                        />
                    </label>
                    <label style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: 'var(--text-light)' }}>
                        Data final
                        <input
                            type="date"
                            value={endDateFilter}
                            min={dateBounds.min || undefined}
                            max={dateBounds.max || undefined}
                            onChange={(event) => setEndDateFilter(event.target.value)}
                            style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.35)' }}
                        />
                    </label>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                            setStartDateFilter(dateBounds.min);
                            setEndDateFilter(dateBounds.max);
                        }}
                        disabled={!dateBounds.min || !dateBounds.max}
                    >
                        Período completo
                    </button>
                </div>
                <div style={{ marginTop: '12px', fontSize: '0.82rem', color: 'var(--text-light)' }}>
                    Período aplicado: {selectedPeriodLabel}
                </div>
            </div>

            {hasFilteredResults && (
            <div className="glass-card" style={{ background: 'var(--accent-gradient)', color: 'white', marginBottom: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>Gastos Totais Acumulados</p>
                        <h2 style={{ color: 'white', fontSize: '2.4rem', margin: '5px 0' }}>R$ {stats.totalSpent.toFixed(2)}</h2>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Período Analisado</div>
                        <div style={{ fontWeight: 'bold' }}>{selectedPeriodLabel}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '20px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Hash size={16} /> {filteredProducts.length} itens</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={16} /> R$ {averageTicketValue.toFixed(2)} por cupom</div>
                </div>
            </div>
            )}

            <div className="glass-card" style={{ marginBottom: '25px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <h4 style={{ marginBottom: '6px', fontSize: '1rem' }}>Sistema de Exportação de Inteligência de Consumo</h4>
                        <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
                            Gere um PDF analítico com séries temporais, composição por categorias, diagrama de fluxo e histograma de frequência.
                        </p>
                    </div>
                    <button
                        className="btn-primary"
                        type="button"
                        onClick={handleGenerateConsumptionReport}
                        disabled={isGeneratingReport || !hasFilteredResults}
                        style={{
                            background: isGeneratingReport || !hasFilteredResults
                                ? 'linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)'
                                : 'linear-gradient(135deg, #1F3A5F 0%, #4A90C2 100%)',
                            opacity: isGeneratingReport || !hasFilteredResults ? 0.9 : 1
                        }}
                    >
                        {isGeneratingReport ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                        {isGeneratingReport ? 'Gerando relatório...' : 'Gerar Relatório de Análise de Consumo (PDF)'}
                    </button>
                    {reportFeedback && (
                        <div style={{ color: reportFeedback.includes('sucesso') ? 'var(--success-emerald)' : '#D32F2F', fontSize: '0.82rem' }}>
                            {reportFeedback}
                        </div>
                    )}
                </div>
            </div>

            {hasFilteredResults ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {/* 1. Evolução de Preço por Produto */}
                <ChartCard title="Evolução de Preço por Produto" icon={TrendingUp} fullWidth contentHeight="520px">
                    <div style={{ marginBottom: '15px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
                            <input
                                className="glass-card"
                                style={{
                                    width: '100%',
                                    padding: '10px 10px 10px 35px',
                                    borderRadius: '10px',
                                    border: '1px solid #ddd',
                                    fontSize: '0.9rem',
                                    background: 'white'
                                }}
                                type="text"
                                placeholder="Busque e selecione um ou mais produtos..."
                                value={productSearchTerm}
                                onChange={(e) => setProductSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div
                        className="glass-card"
                        style={{
                            marginBottom: '15px',
                            maxHeight: '150px',
                            overflowY: 'auto',
                            padding: '8px',
                            textAlign: 'left'
                        }}
                    >
                        {filteredProductOptions.length > 0 ? (
                            filteredProductOptions.map((name) => (
                                <label
                                    key={name}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 4px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedProductNames.includes(name)}
                                        onChange={() => toggleProductSelection(name)}
                                    />
                                    <span>{name}</span>
                                </label>
                            ))
                        ) : (
                            <div style={{ padding: '10px 4px', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                                Nenhum produto encontrado para este filtro.
                            </div>
                        )}
                    </div>
                    {selectedProductNames.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px' }}>
                            {selectedProductNames.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => toggleProductSelection(name)}
                                    style={{
                                        border: '1px solid rgba(26, 35, 126, 0.15)',
                                        background: 'rgba(26, 35, 126, 0.08)',
                                        color: 'var(--text-main)',
                                        borderRadius: '999px',
                                        padding: '6px 10px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {name}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setSelectedProductNames([])}
                                style={{
                                    border: '1px dashed rgba(26, 35, 126, 0.25)',
                                    background: 'transparent',
                                    color: 'var(--text-light)',
                                    borderRadius: '999px',
                                    padding: '6px 10px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Limpar seleção
                            </button>
                        </div>
                    )}
                    {selectedProductNames.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={stats.productEvolutionData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Line type="monotone" dataKey="price" stroke="var(--primary-blue)" strokeWidth={3} dot={{ r: 5, fill: 'var(--primary-blue)' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: '0.9rem' }}>
                            Escolha um ou mais produtos acima para ver o histórico de preços agrupado.
                        </div>
                    )}
                </ChartCard>

                {/* NOVO: Evolução dos Gastos ao longo do tempo (Somatório global) */}
                <ChartCard title="Evolução dos Gastos ao longo do tempo" icon={Wallet} fullWidth>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.dailyEvolutionData}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--primary-blue)" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="var(--primary-blue)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v) => `R$ ${Number(v).toFixed(2)}`} />
                            <Area type="monotone" dataKey="value" stroke="var(--primary-blue)" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* 1 & 2: Pizza e Barras - Lojas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <ChartCard title="Distribuição por Loja (%)" icon={PieIcon} contentHeight="320px">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.storeData.slice(0, 6)}
                                    innerRadius={45}
                                    outerRadius={62}
                                    cy="38%"
                                    paddingAngle={5}
                                    dataKey="value"
                                    nameKey="shortName"
                                >
                                    {stats.storeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v) => `${((v / stats.totalSpent) * 100).toFixed(1)}%`} />
                                <Legend
                                    verticalAlign="bottom"
                                    align="center"
                                    content={renderStoreLegend}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Comparativo de Lojas" icon={BarChart3}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.storeData.slice(0, 5)} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="shortName" type="category" width={80} fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => `R$ ${v.toFixed(2)}`} />
                                <Bar dataKey="value" fill="var(--primary-blue)" radius={[0, 10, 10, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>

                {/* 4 & 5: Empilhadas e Área */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <ChartCard title="Gastos por Loja x Mês" icon={Layers}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.stackedData}>
                                <XAxis dataKey="month" fontSize={10} />
                                <Tooltip />
                                {stats.top5Stores.map((store, i) => (
                                    <Bar key={store.key} dataKey={store.key} name={store.label} stackId="a" fill={COLORS[i % COLORS.length]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Volume Acumulado de Gastos" icon={Activity}>
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
                <ChartCard title="Gráfico de Pareto (Top 10 Produtos)" icon={Target} fullWidth>
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
                <ChartCard title="Treemap de Categorias" icon={Layout} fullWidth>
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

                {/* Categorias e Histograma */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <ChartCard title="Gastos por Categoria (%)" icon={BarChart3} contentHeight={`${Math.max(250, stats.categorySpendData.length * 36)}px`}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.categorySpendData} layout="vertical" margin={{ left: 10, right: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                                <XAxis
                                    type="number"
                                    fontSize={10}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                                />
                                <YAxis dataKey="name" type="category" width={110} fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value) => `${Number(value).toFixed(1)}% do total`}
                                    labelFormatter={(label) => `Categoria: ${label}`}
                                />
                                <Bar dataKey="percentage" fill="var(--secondary-cyan)" radius={[0, 10, 10, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Histograma de Preços" icon={Hash}>
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
                <ChartCard title="Mapa de Calor (Dias da Semana)" icon={Thermometer} fullWidth>
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

            </div>
            ) : (
                <div className="glass-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
                    <Calendar size={42} style={{ opacity: 0.15, marginBottom: '14px' }} />
                    <h4 style={{ marginBottom: '8px' }}>Nenhum dado no intervalo selecionado</h4>
                    <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', margin: 0 }}>
                        Ajuste as datas acima para gerar os gráficos e o relatório com um período que contenha cupons importados.
                    </p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
