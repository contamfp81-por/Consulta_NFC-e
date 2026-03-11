import jsPdfRuntimeUrl from '../vendor/jspdf.umd.min.js?url';
import * as XLSX from 'xlsx';

let jsPdfLoaderPromise = null;
const JSPDF_RUNTIME_SRC = jsPdfRuntimeUrl;
const getJsPdfConstructor = () => window.jspdf?.jsPDF || window.jsPDF || null;
const installAtPolyfill = (target) => {
    if (!target || typeof target.at === 'function') return;

    Object.defineProperty(target, 'at', {
        value(index) {
            const length = this.length >>> 0;
            const normalizedIndex = Number(index) || 0;
            const resolvedIndex = normalizedIndex < 0 ? length + normalizedIndex : normalizedIndex;

            if (resolvedIndex < 0 || resolvedIndex >= length) {
                return undefined;
            }

            return this[resolvedIndex];
        },
        configurable: true,
        writable: true
    });
};

const ensureAtPolyfills = () => {
    installAtPolyfill(Array.prototype);
    installAtPolyfill(String.prototype);
    installAtPolyfill(Uint8Array.prototype);
    installAtPolyfill(Uint8ClampedArray.prototype);
    installAtPolyfill(Uint16Array.prototype);
    installAtPolyfill(Uint32Array.prototype);
    installAtPolyfill(Int8Array.prototype);
    installAtPolyfill(Int16Array.prototype);
    installAtPolyfill(Int32Array.prototype);
    installAtPolyfill(Float32Array.prototype);
    installAtPolyfill(Float64Array.prototype);
};

const loadJsPdfConstructor = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('A geração de PDF está disponível apenas no navegador.');
    }

    ensureAtPolyfills();

    if (getJsPdfConstructor()) {
        return getJsPdfConstructor();
    }

    if (!jsPdfLoaderPromise) {
        jsPdfLoaderPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-jspdf-runtime="true"]');
            if (existingScript) {
                if (getJsPdfConstructor()) {
                    resolve(getJsPdfConstructor());
                    return;
                }

                if (existingScript.dataset.loaded === 'true') {
                    jsPdfLoaderPromise = null;
                    reject(new Error('Biblioteca de PDF indisponÃ­vel apÃ³s o carregamento.'));
                    return;
                }

                existingScript.addEventListener('load', () => resolve(getJsPdfConstructor()), { once: true });
                existingScript.addEventListener('error', () => {
                    jsPdfLoaderPromise = null;
                    reject(new Error('Falha ao carregar a biblioteca de PDF.'));
                }, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = JSPDF_RUNTIME_SRC;
            script.async = true;
            script.dataset.jspdfRuntime = 'true';
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve(getJsPdfConstructor());
            };
            script.onerror = () => {
                jsPdfLoaderPromise = null;
                reject(new Error('Falha ao carregar a biblioteca de PDF.'));
            };
            document.head.appendChild(script);
        });
    }

    const jsPdfConstructor = await jsPdfLoaderPromise;

    if (!jsPdfConstructor) {
        jsPdfLoaderPromise = null;
        throw new Error('Biblioteca de PDF indisponível no carregamento.');
    }

    return jsPdfConstructor;
};

const COLORS = {
    navy: '#1F3A5F',
    blue: '#2F5D8C',
    cyan: '#4A90C2',
    slate: '#64748B',
    increase: '#D84315',
    decrease: '#2E7D32',
    lightSlate: '#E2E8F0',
    page: '#F8FAFC',
    white: '#FFFFFF',
    text: '#1E293B',
    muted: '#64748B'
};

const CHART_COLORS = ['#1F3A5F', '#2F5D8C', '#4A90C2', '#64748B', '#93C5FD', '#60A5FA', '#CBD5E1'];
const ESSENTIAL_CATEGORIES = new Set([
    'Alimenta\u00e7\u00e3o',
    'Bebidas',
    'Higiene e Limpeza',
    'Hortifruti',
    'A\u00e7ougue e Frios',
    'Padaria e Lanches',
    'Farm\u00e1cia e Sa\u00fade',
    'Combust\u00edvel'
]);

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const sum = (values) => values.reduce((total, value) => total + value, 0);
const average = (values) => (values.length ? sum(values) / values.length : 0);
const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);
const formatPercent = (value) => `${percentFormatter.format(Number(value) || 0)}%`;
const formatSignedRatioPercent = (value) => {
    const numericValue = (Number(value) || 0) * 100;
    const sign = numericValue > 0 ? '+' : '';
    return `${sign}${percentFormatter.format(numericValue)}%`;
};
const getVariationColor = (value) => ((Number(value) || 0) >= 0 ? COLORS.increase : COLORS.decrease);

const safeDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
    const date = safeDate(value);
    return date ? dateFormatter.format(date) : 'Data invalida';
};

const createCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = COLORS.white;
    context.fillRect(0, 0, width, height);
    return { canvas, context };
};

const drawFrame = (context, width, height, title, subtitle) => {
    context.fillStyle = COLORS.white;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = COLORS.lightSlate;
    context.lineWidth = 2;
    context.strokeRect(1, 1, width - 2, height - 2);
    context.fillStyle = COLORS.text;
    context.font = '700 28px Arial';
    context.fillText(title, 28, 42);
    context.fillStyle = COLORS.muted;
    context.font = '400 16px Arial';
    context.fillText(subtitle, 28, 68);
};

const drawEmptyState = (context, width, height, title, subtitle, message) => {
    drawFrame(context, width, height, title, subtitle);
    context.fillStyle = COLORS.muted;
    context.font = '600 20px Arial';
    context.textAlign = 'center';
    context.fillText(message, width / 2, height / 2);
    context.textAlign = 'left';
};

const buildDailySeries = (receipts) => {
    const totalsByDay = {};
    receipts.forEach((receipt) => {
        const date = safeDate(receipt.date);
        if (!date) return;
        const key = date.toISOString().split('T')[0];
        totalsByDay[key] = (totalsByDay[key] || 0) + (Number(receipt.totalValue) || 0);
    });

    return Object.entries(totalsByDay)
        .map(([date, value]) => ({ date, value }))
        .sort((left, right) => left.date.localeCompare(right.date));
};

const buildCategoryComposition = (products, totalSpent) => {
    const categoryMap = {};
    products.forEach((product) => {
        const category = product.category || 'Outros';
        categoryMap[category] = (categoryMap[category] || 0) + (Number(product.totalValue) || 0);
    });

    return Object.entries(categoryMap)
        .map(([name, value]) => ({
            name,
            value,
            percentage: totalSpent > 0 ? (value / totalSpent) * 100 : 0
        }))
        .sort((left, right) => right.value - left.value);
};

const buildFlowData = (receipts, products) => {
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const flowMap = {};

    products.forEach((product) => {
        const receipt = receiptMap.get(product.receiptId);
        const source = receipt?.establishment || 'Origem nao identificada';
        const target = product.category || 'Outros';
        const key = `${source}|||${target}`;
        flowMap[key] = (flowMap[key] || 0) + (Number(product.totalValue) || 0);
    });

    const links = Object.entries(flowMap)
        .map(([key, value]) => {
            const [source, target] = key.split('|||');
            return { source, target, value };
        })
        .sort((left, right) => right.value - left.value);

    const sourceTotals = {};
    const targetTotals = {};
    links.forEach((link) => {
        sourceTotals[link.source] = (sourceTotals[link.source] || 0) + link.value;
        targetTotals[link.target] = (targetTotals[link.target] || 0) + link.value;
    });

    return {
        links: links.slice(0, 18),
        sources: Object.entries(sourceTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6),
        targets: Object.entries(targetTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6)
    };
};

const buildHistogram = (receipts) => {
    const bins = [0, 20, 50, 100, 200, 400, 800, 1600];
    const histogram = bins.slice(0, -1).map((min, index) => ({
        min,
        max: bins[index + 1],
        label: `${formatCurrency(min)} - ${formatCurrency(bins[index + 1])}`,
        count: 0
    }));

    receipts.forEach((receipt) => {
        const totalValue = Number(receipt.totalValue) || 0;
        const bucket = histogram.find((item, index) => (
            index === histogram.length - 1
                ? totalValue >= item.min
                : totalValue >= item.min && totalValue < item.max
        ));
        if (bucket) bucket.count += 1;
    });

    return histogram;
};

const buildTemporalProjection = (temporalData) => {
    if (!temporalData.length) {
        return { direction: 'estavel', projectedDailyAverage: 0, projectedNext30: 0 };
    }

    const values = temporalData.map((item) => Number(item.value) || 0);
    const recent = values.slice(-Math.min(7, values.length));
    const previous = values.slice(-Math.min(14, values.length), -Math.min(7, values.length));
    const recentAverage = average(recent);
    const previousAverage = previous.length ? average(previous) : recentAverage;

    let direction = 'estavel';
    if (recentAverage > previousAverage * 1.08) direction = 'alta';
    if (recentAverage < previousAverage * 0.92) direction = 'reducao';

    return {
        direction,
        projectedDailyAverage: Math.max(0, recentAverage),
        projectedNext30: Math.max(0, recentAverage) * 30
    };
};

const buildReportData = ({ receipts, products, stats }) => {
    const totalSpent = Number(stats?.totalSpent) || sum(products.map((product) => Number(product.totalValue) || 0));
    const temporalData = stats?.dailyEvolutionData?.length ? stats.dailyEvolutionData : buildDailySeries(receipts);
    const categoryComposition = stats?.categorySpendData?.length
        ? stats.categorySpendData
            .map((item) => ({
                name: item.name,
                value: Number(item.value) || 0,
                percentage: totalSpent > 0 ? ((Number(item.value) || 0) / totalSpent) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value)
        : buildCategoryComposition(products, totalSpent);
    const flowData = buildFlowData(receipts, products);
    const histogramData = buildHistogram(receipts);
    const temporalProjection = buildTemporalProjection(temporalData);
    const essentialShare = categoryComposition
        .filter((item) => ESSENTIAL_CATEGORIES.has(item.name))
        .reduce((total, item) => total + item.percentage, 0);
    const lowTicketShare = histogramData.length
        ? (sum(histogramData.slice(0, 2).map((item) => item.count)) / Math.max(1, sum(histogramData.map((item) => item.count)))) * 100
        : 0;

    let profile = 'Consumidor equilibrado com padrao diversificado';
    if (lowTicketShare > 55 && temporalProjection.direction === 'alta') profile = 'Consumidor recorrente com tracos impulsivos';
    else if (essentialShare > 60) profile = 'Consumidor conservador e orientado a necessidades basicas';
    else if ((categoryComposition[0]?.percentage || 0) > 40) profile = 'Consumidor concentrado em poucos centros de custo';

    const inflation = {
        personalInflationRate: Number(stats?.personalInflationRate) || 0,
        totalInflationImpact: Number(stats?.totalInflationImpact) || 0,
        comparableProductsCount: Number(stats?.comparableProductsCount) || 0,
        productInflationData: Array.isArray(stats?.productInflationData)
            ? stats.productInflationData.map((item) => ({
                ...item,
                name: item.name || 'Produto sem nome',
                memberNames: Array.isArray(item.memberNames) ? item.memberNames : [],
                category: item.category || 'Outros',
                previousDate: item.previousDate || '',
                currentDate: item.currentDate || '',
                previousPrice: Number(item.previousPrice) || 0,
                currentPrice: Number(item.currentPrice) || 0,
                inflationRate: Number(item.inflationRate) || 0,
                financialImpact: Number(item.financialImpact) || 0
            }))
            : [],
        categoryInflationData: Array.isArray(stats?.categoryInflationData)
            ? stats.categoryInflationData.map((item) => ({
                ...item,
                name: item.name || 'Outros',
                comparableProducts: Number(item.comparableProducts) || 0,
                inflationRate: Number(item.inflationRate) || 0,
                financialImpact: Number(item.financialImpact) || 0
            }))
            : []
    };

    return {
        receipts,
        products,
        totalSpent,
        temporalData,
        categoryComposition,
        flowData,
        histogramData,
        temporalProjection,
        profile,
        inflation
    };
};

const buildInsights = (reportData) => {
    const peak = [...reportData.temporalData].sort((a, b) => b.value - a.value)[0];
    const topCategory = reportData.categoryComposition[0];
    const topLink = [...reportData.flowData.links].sort((a, b) => b.value - a.value)[0];
    const dominantBucket = [...reportData.histogramData].sort((a, b) => b.count - a.count)[0];
    const lastTemporalEntry = reportData.temporalData[reportData.temporalData.length - 1];
    const topThreeShare = sum(reportData.categoryComposition.slice(0, 3).map((item) => item.percentage));
    const lowShare = (sum(reportData.histogramData.slice(0, 2).map((item) => item.count)) / Math.max(1, sum(reportData.histogramData.map((item) => item.count)))) * 100;
    const highShare = (sum(reportData.histogramData.slice(-2).map((item) => item.count)) / Math.max(1, sum(reportData.histogramData.map((item) => item.count)))) * 100;
    const inflationTopProduct = [...reportData.inflation.productInflationData]
        .sort((a, b) => b.financialImpact - a.financialImpact || b.inflationRate - a.inflationRate)[0];
    const inflationTopCategory = [...reportData.inflation.categoryInflationData]
        .sort((a, b) => b.financialImpact - a.financialImpact || b.inflationRate - a.inflationRate)[0];

    return {
        summary: {
            title: 'Relatorio de Analise de Consumo',
            subtitle: 'Sistema de Exportacao de Inteligencia de Consumo',
            periodLabel: reportData.temporalData[0]?.date && lastTemporalEntry?.date
                ? `${formatDate(reportData.temporalData[0].date)} a ${formatDate(lastTemporalEntry.date)}`
                : 'Periodo insuficiente',
            highlights: [
                topCategory ? `Maior centro de custo: ${topCategory.name} (${formatPercent(topCategory.percentage)} do total).` : 'Sem categoria dominante identificada.',
                dominantBucket ? `Faixa de gasto mais frequente: ${dominantBucket.label}.` : 'Sem frequencia de ticket relevante.',
                reportData.inflation.comparableProductsCount > 0
                    ? `Inflacao pessoal no periodo: ${formatSignedRatioPercent(reportData.inflation.personalInflationRate)} com impacto de ${formatCurrency(reportData.inflation.totalInflationImpact)}.`
                    : 'Sem base comparavel suficiente para inflacao pessoal neste periodo.'
            ]
        },
        temporal: {
            finalidade: 'Este grafico mostra a evolucao do gasto ao longo do tempo e destaca picos, ritmos e periodos de desaceleracao.',
            comportamento: peak
                ? `O maior pico ocorreu em ${formatDate(peak.date)}, com ${formatCurrency(peak.value)}. Isso evidencia o momento de maior pressao orcamentaria.`
                : 'Ainda nao ha volume suficiente para caracterizar comportamento temporal.',
            tendencias: `A projecao atual indica ${reportData.temporalProjection.direction}, com gasto medio diario estimado em ${formatCurrency(reportData.temporalProjection.projectedDailyAverage)} e ${formatCurrency(reportData.temporalProjection.projectedNext30)} para os proximos 30 dias.`
        },
        categories: {
            finalidade: 'O grafico de composicao mostra como o orcamento se distribui entre categorias e revela os principais centros de custo.',
            comportamento: topCategory
                ? `${topCategory.name} lidera com ${formatPercent(topCategory.percentage)} do total. As tres maiores categorias concentram ${formatPercent(topThreeShare)} do gasto.`
                : 'Sem dados suficientes para classificar concentracao de categorias.',
            tendencias: `Mantido o padrao atual, o orcamento tende a seguir ${ESSENTIAL_CATEGORIES.has(topCategory?.name) ? 'centrado em despesas essenciais' : 'mais flexivel entre categorias'} no curto prazo.`
        },
        flow: {
            finalidade: 'O diagrama de fluxo mostra a jornada do dinheiro dos estabelecimentos de origem ate as categorias de destino.',
            comportamento: topLink
                ? `O fluxo dominante vai de ${topLink.source} para ${topLink.target}, somando ${formatCurrency(topLink.value)}.`
                : 'Ainda nao ha fluxo suficiente para identificar uma rota dominante.',
            tendencias: `Se o padrao persistir, as conexoes entre as principais lojas e categorias devem continuar liderando a alocacao do gasto.`
        },
        histogram: {
            finalidade: 'Este histograma mostra quantas compras recaem em cada faixa de gasto e ajuda a detectar recorrencia e impulsividade.',
            comportamento: dominantBucket
                ? `A faixa mais recorrente e ${dominantBucket.label}, com ${dominantBucket.count} ocorrencias.`
                : 'Sem ocorrencias suficientes para caracterizar frequencia de tickets.',
            tendencias: `Tickets baixos representam ${formatPercent(lowShare)} das compras e tickets altos representam ${formatPercent(highShare)}.`
        },
        inflation: {
            finalidade: 'Este painel compara o ultimo preco com o preco anterior dos produtos comparaveis para medir inflacao pessoal, impacto financeiro e pressao por categoria.',
            comportamento: reportData.inflation.comparableProductsCount > 0
                ? `${reportData.inflation.comparableProductsCount} produtos comparaveis sustentam um indice geral de ${formatSignedRatioPercent(reportData.inflation.personalInflationRate)} e impacto acumulado de ${formatCurrency(reportData.inflation.totalInflationImpact)}.`
                : 'Ainda nao ha produtos com pelo menos dois precos em datas diferentes dentro do periodo analisado.',
            tendencias: inflationTopProduct || inflationTopCategory
                ? `A principal pressao atual vem de ${inflationTopProduct ? `${inflationTopProduct.name} (${formatSignedRatioPercent(inflationTopProduct.inflationRate)})` : 'um produto comparavel'}${inflationTopCategory ? ` e da categoria ${inflationTopCategory.name} (${formatSignedRatioPercent(inflationTopCategory.inflationRate)}).` : '.'}`
                : 'Sem tendencias suficientes para destacar produtos ou categorias inflacionarias.'
        }
    };
};

const drawTimeSeriesChart = (temporalData) => {
    const { canvas, context } = createCanvas(1400, 500);
    if (!temporalData.length) {
        drawEmptyState(context, canvas.width, canvas.height, 'Series Temporais de Gasto', 'Evolucao do consumo no periodo analisado', 'Sem dados suficientes');
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, 'Series Temporais de Gasto', 'Evolucao do consumo no periodo analisado');
    const area = { left: 90, right: 60, top: 100, bottom: 80 };
    const values = temporalData.map((item) => Number(item.value) || 0);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const width = canvas.width - area.left - area.right;
    const height = canvas.height - area.top - area.bottom;

    for (let step = 0; step <= 4; step += 1) {
        const y = area.top + (height / 4) * step;
        context.strokeStyle = COLORS.lightSlate;
        context.beginPath();
        context.moveTo(area.left, y);
        context.lineTo(canvas.width - area.right, y);
        context.stroke();
        context.fillStyle = COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(maxValue - ((maxValue - minValue) / 4) * step), 20, y + 4);
    }

    const points = temporalData.map((item, index) => ({
        ...item,
        x: area.left + (width / Math.max(1, temporalData.length - 1)) * index,
        y: area.top + height - (((Number(item.value) || 0) - minValue) / Math.max(1, maxValue - minValue)) * height
    }));
    const lastPoint = points[points.length - 1];

    context.beginPath();
    points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = COLORS.navy;
    context.lineWidth = 4;
    context.stroke();

    context.beginPath();
    context.moveTo(points[0].x, canvas.height - area.bottom);
    points.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(lastPoint.x, canvas.height - area.bottom);
    context.closePath();
    context.fillStyle = 'rgba(74, 144, 194, 0.18)';
    context.fill();

    points.forEach((point, index) => {
        context.fillStyle = COLORS.white;
        context.strokeStyle = COLORS.navy;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        if (index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0) {
            context.save();
            context.translate(point.x, canvas.height - 35);
            context.rotate(-Math.PI / 6);
            context.fillStyle = COLORS.muted;
            context.font = '400 13px Arial';
            context.fillText(formatDate(point.date), -30, 0);
            context.restore();
        }
    });

    return canvas;
};

const drawCompositionChart = (categoryComposition) => {
    const { canvas, context } = createCanvas(1400, 500);
    if (!categoryComposition.length) {
        drawEmptyState(context, canvas.width, canvas.height, 'Composicao por Categorias', 'Distribuicao percentual por centros de custo', 'Sem dados suficientes');
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, 'Composicao por Categorias', 'Distribuicao percentual por centros de custo');
    const visibleData = categoryComposition.length > 6
        ? [...categoryComposition.slice(0, 5), {
            name: 'Demais categorias',
            value: sum(categoryComposition.slice(5).map((item) => item.value)),
            percentage: sum(categoryComposition.slice(5).map((item) => item.percentage))
        }]
        : categoryComposition;
    const centerX = 350;
    const centerY = 285;
    const outerRadius = 135;
    const innerRadius = 78;
    let startAngle = -Math.PI / 2;

    visibleData.forEach((item, index) => {
        const angle = ((item.percentage || 0) / 100) * Math.PI * 2;
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(centerX, centerY, outerRadius, startAngle, startAngle + angle);
        context.closePath();
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fill();
        startAngle += angle;
    });

    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';

    context.fillStyle = COLORS.text;
    context.font = '700 26px Arial';
    context.textAlign = 'center';
    context.fillText('100%', centerX, centerY - 8);
    context.fillStyle = COLORS.muted;
    context.font = '400 16px Arial';
    context.fillText('do gasto analisado', centerX, centerY + 20);
    context.textAlign = 'left';

    let legendY = 135;
    visibleData.forEach((item, index) => {
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(690, legendY - 12, 22, 22);
        context.fillStyle = COLORS.text;
        context.font = '700 18px Arial';
        context.fillText(item.name, 725, legendY + 2);
        context.fillStyle = COLORS.muted;
        context.font = '400 16px Arial';
        context.fillText(`${formatPercent(item.percentage)} | ${formatCurrency(item.value)}`, 725, legendY + 26);
        legendY += 56;
    });

    return canvas;
};

const drawFlowChart = (flowData) => {
    const { canvas, context } = createCanvas(1400, 560);
    if (!flowData.links.length || !flowData.sources.length || !flowData.targets.length) {
        drawEmptyState(context, canvas.width, canvas.height, 'Fluxo Financeiro (Sankey)', 'Percurso do gasto dos estabelecimentos para as categorias', 'Sem dados suficientes');
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, 'Fluxo Financeiro (Sankey)', 'Percurso do gasto dos estabelecimentos para as categorias');
    const totalFlow = Math.max(1, sum(flowData.links.map((link) => link.value)));
    const topPadding = 110;
    const bottomPadding = 70;
    const availableHeight = canvas.height - topPadding - bottomPadding;
    const gap = 18;
    const nodeWidth = 24;
    const leftX = 120;
    const rightX = 980;
    const scale = (availableHeight - (Math.max(flowData.sources.length, flowData.targets.length) - 1) * gap) / totalFlow;
    const sourceNodes = {};
    const targetNodes = {};

    let currentY = topPadding;
    flowData.sources.forEach((source, index) => {
        const height = Math.max(18, source.value * scale);
        sourceNodes[source.name] = { x: leftX, y: currentY, height, color: CHART_COLORS[index % CHART_COLORS.length], offset: 0, value: source.value };
        currentY += height + gap;
    });

    currentY = topPadding;
    flowData.targets.forEach((target, index) => {
        const height = Math.max(18, target.value * scale);
        targetNodes[target.name] = { x: rightX, y: currentY, height, color: CHART_COLORS[index % CHART_COLORS.length], offset: 0, value: target.value };
        currentY += height + gap;
    });

    flowData.links.forEach((link) => {
        const source = sourceNodes[link.source];
        const target = targetNodes[link.target];
        if (!source || !target) return;
        const bandHeight = Math.max(8, link.value * scale);
        const sourceTop = source.y + source.offset;
        const targetTop = target.y + target.offset;
        const sourceBottom = sourceTop + bandHeight;
        const targetBottom = targetTop + bandHeight;
        const controlX = (leftX + rightX) / 2;

        context.beginPath();
        context.moveTo(leftX + nodeWidth, sourceTop);
        context.bezierCurveTo(controlX, sourceTop, controlX, targetTop, rightX, targetTop);
        context.lineTo(rightX, targetBottom);
        context.bezierCurveTo(controlX, targetBottom, controlX, sourceBottom, leftX + nodeWidth, sourceBottom);
        context.closePath();
        context.fillStyle = 'rgba(47, 93, 140, 0.28)';
        context.fill();

        source.offset += bandHeight;
        target.offset += bandHeight;
    });

    Object.entries(sourceNodes).forEach(([name, node]) => {
        context.fillStyle = node.color;
        context.fillRect(node.x, node.y, nodeWidth, node.height);
        context.fillStyle = COLORS.text;
        context.font = '700 16px Arial';
        context.fillText(name, node.x + nodeWidth + 12, node.y + 20);
        context.fillStyle = COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(node.value), node.x + nodeWidth + 12, node.y + 40);
    });

    Object.entries(targetNodes).forEach(([name, node]) => {
        context.fillStyle = node.color;
        context.fillRect(node.x, node.y, nodeWidth, node.height);
        context.fillStyle = COLORS.text;
        context.font = '700 16px Arial';
        context.fillText(name, node.x + nodeWidth + 12, node.y + 20);
        context.fillStyle = COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(node.value), node.x + nodeWidth + 12, node.y + 40);
    });

    return canvas;
};

const drawHistogramChart = (histogramData) => {
    const { canvas, context } = createCanvas(1400, 500);
    if (!histogramData.length) {
        drawEmptyState(context, canvas.width, canvas.height, 'Histograma de Frequencia', 'Faixas de gasto por cupom fiscal', 'Sem dados suficientes');
        return canvas;
    }

    drawFrame(context, canvas.width, canvas.height, 'Histograma de Frequencia', 'Faixas de gasto por cupom fiscal');
    const area = { left: 90, right: 40, top: 95, bottom: 90 };
    const width = canvas.width - area.left - area.right;
    const height = canvas.height - area.top - area.bottom;
    const maxCount = Math.max(...histogramData.map((item) => item.count), 1);
    const barWidth = width / Math.max(1, histogramData.length);

    for (let step = 0; step <= 4; step += 1) {
        const y = area.top + (height / 4) * step;
        context.strokeStyle = COLORS.lightSlate;
        context.beginPath();
        context.moveTo(area.left, y);
        context.lineTo(canvas.width - area.right, y);
        context.stroke();
        context.fillStyle = COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(`${Math.round(maxCount - (maxCount / 4) * step)}`, 40, y + 4);
    }

    histogramData.forEach((item, index) => {
        const barHeight = (item.count / maxCount) * height;
        const x = area.left + index * barWidth + 12;
        const y = canvas.height - area.bottom - barHeight;
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(x, y, barWidth - 24, barHeight);
        context.fillStyle = COLORS.text;
        context.font = '700 15px Arial';
        context.textAlign = 'center';
        context.fillText(`${item.count}`, x + (barWidth - 24) / 2, y - 10);
        context.save();
        context.translate(x + (barWidth - 24) / 2, canvas.height - 26);
        context.rotate(-Math.PI / 5);
        context.fillStyle = COLORS.muted;
        context.font = '400 13px Arial';
        context.fillText(item.label, 0, 0);
        context.restore();
    });

    context.textAlign = 'left';
    return canvas;
};

const addPageHeader = (pdf, reportTitle, pageTitle) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    pdf.setFillColor(COLORS.navy);
    pdf.rect(0, 0, pageWidth, 74, 'F');
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text(reportTitle, 40, 34);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(pageTitle, 40, 54);
};

const addFooter = (pdf) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageCount = pdf.getNumberOfPages();

    for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(COLORS.lightSlate);
        pdf.line(40, pageHeight - 38, pageWidth - 40, pageHeight - 38);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(COLORS.muted);
        pdf.text(`Relatorio gerado automaticamente em ${dateFormatter.format(new Date())}`, 40, pageHeight - 22);
        pdf.text(`Pagina ${page} de ${pageCount}`, pageWidth - 100, pageHeight - 22);
    }
};

const addSummaryCard = (pdf, label, value, x, y, width) => {
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y, width, 72, 12, 12, 'F');
    pdf.setTextColor(COLORS.muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(label, x + 14, y + 20);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(pdf.splitTextToSize(String(value), width - 28), x + 14, y + 44);
};

const addInsightBlock = (pdf, title, body, x, y, width, accentColor) => {
    pdf.setFillColor(accentColor);
    pdf.roundedRect(x, y, width, 28, 8, 8, 'F');
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, x + 12, y + 18);
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y + 34, width, 92, 10, 10, 'F');
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(body, width - 22), x + 11, y + 52);
};

const addNarrativeCard = (pdf, title, body, x, y, width, height, accentColor = COLORS.blue) => {
    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(x, y, width, height, 12, 12, 'F');
    pdf.setFillColor(accentColor);
    pdf.roundedRect(x, y, width, 22, 12, 12, 'F');
    pdf.rect(x, y + 12, width, 10, 'F');
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(title, x + 12, y + 15);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(body, width - 24), x + 12, y + 40);
};

const addTableHeader = (pdf, columns, startX, startY) => {
    let currentX = startX;
    pdf.setFillColor(COLORS.navy);
    pdf.setTextColor(COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);

    columns.forEach((column) => {
        pdf.rect(currentX, startY, column.width, 24, 'F');
        pdf.text(column.label, currentX + 6, startY + 16);
        currentX += column.width;
    });

    return startY + 24;
};

const addTableRow = (pdf, columns, cells, startX, startY) => {
    const preparedCells = cells.map((cell, index) => {
        const text = String(cell ?? '');
        const lines = pdf.splitTextToSize(text, columns[index].width - 10);
        return lines.length ? lines : [''];
    });
    const lineHeight = 10;
    const rowHeight = Math.max(
        24,
        ...preparedCells.map((lines) => lines.length * lineHeight + 10)
    );

    let currentX = startX;
    pdf.setDrawColor(COLORS.lightSlate);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);

    preparedCells.forEach((lines, index) => {
        pdf.rect(currentX, startY, columns[index].width, rowHeight);
        if (columns[index].color) {
            pdf.setTextColor(columns[index].color(cells[index]));
        } else {
            pdf.setTextColor(COLORS.text);
        }
        pdf.text(lines, currentX + 5, startY + 12);
        currentX += columns[index].width;
    });

    return startY + rowHeight;
};

const addPaginatedTable = ({ pdf, reportTitle, pageTitle, introText, columns, rows, mapRow, emptyMessage }) => {
    const pageHeight = pdf.internal.pageSize.getHeight();
    const startX = 40;
    const contentWidth = 515;
    let rowIndex = 0;
    let pageNumber = 0;

    const startPage = () => {
        if (pageNumber > 0) {
            pdf.addPage();
        }

        addPageHeader(pdf, reportTitle, pageTitle);
        pdf.setTextColor(COLORS.text);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(17);
        pdf.text(pageTitle, 40, 100);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(COLORS.muted);
        pdf.text(pdf.splitTextToSize(introText, contentWidth), 40, 118);
        pageNumber += 1;
    };

    if (!rows.length) {
        startPage();
        pdf.setFillColor(COLORS.page);
        pdf.roundedRect(40, 150, contentWidth, 80, 12, 12, 'F');
        pdf.setTextColor(COLORS.muted);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.text(pdf.splitTextToSize(emptyMessage, contentWidth - 24), 52, 188);
        return;
    }

    while (rowIndex < rows.length) {
        startPage();
        let currentY = addTableHeader(pdf, columns, startX, 148);

        while (rowIndex < rows.length) {
            const previewCells = mapRow(rows[rowIndex]);
            const previewHeight = Math.max(
                24,
                ...previewCells.map((cell, index) => {
                    const lines = pdf.splitTextToSize(String(cell ?? ''), columns[index].width - 10);
                    return Math.max(1, lines.length) * 10 + 10;
                })
            );

            if (currentY + previewHeight > pageHeight - 56) {
                break;
            }

            currentY = addTableRow(pdf, columns, previewCells, startX, currentY);
            rowIndex += 1;
        }
    }
};

const addInflationOverviewPage = (pdf, reportTitle, reportData, insights) => {
    const topProduct = reportData.inflation.productInflationData[0];
    const topCategory = reportData.inflation.categoryInflationData[0];

    pdf.addPage();
    addPageHeader(pdf, reportTitle, 'Indice de Inflacao Pessoal');

    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('Indice de Inflacao Pessoal', 40, 102);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(COLORS.muted);
    pdf.text(
        'Comparativo entre o ultimo preco e o preco anterior dos produtos comparaveis no periodo filtrado.',
        40,
        120
    );

    const metricWidth = (515 - 24) / 3;
    addSummaryCard(pdf, 'Indice geral', formatSignedRatioPercent(reportData.inflation.personalInflationRate), 40, 144, metricWidth);
    addSummaryCard(pdf, 'Impacto financeiro', formatCurrency(reportData.inflation.totalInflationImpact), 40 + metricWidth + 12, 144, metricWidth);
    addSummaryCard(pdf, 'Produtos comparaveis', `${reportData.inflation.comparableProductsCount}`, 40 + (metricWidth + 12) * 2, 144, metricWidth);

    addNarrativeCard(
        pdf,
        'Leitura executiva',
        insights.inflation.comportamento,
        40,
        236,
        515,
        92,
        COLORS.blue
    );

    addNarrativeCard(
        pdf,
        'Metodologia',
        'Indice geral: (preco atual - preco anterior) / preco anterior. Impacto financeiro: (preco atual - preco anterior) x quantidade atual.',
        40,
        340,
        515,
        88,
        COLORS.cyan
    );

    addNarrativeCard(
        pdf,
        'Produto com maior pressao',
        topProduct
            ? `${topProduct.name} | ${topProduct.category} | ${formatDate(topProduct.previousDate)} ate ${formatDate(topProduct.currentDate)} | inflacao ${formatSignedRatioPercent(topProduct.inflationRate)} | impacto ${formatCurrency(topProduct.financialImpact)}.`
            : 'Nao ha produto com base comparavel suficiente no periodo.',
        40,
        440,
        251,
        118,
        COLORS.slate
    );

    addNarrativeCard(
        pdf,
        'Categoria com maior pressao',
        topCategory
            ? `${topCategory.name} lidera com ${topCategory.comparableProducts} produtos comparaveis, inflacao de ${formatSignedRatioPercent(topCategory.inflationRate)} e impacto de ${formatCurrency(topCategory.financialImpact)}.`
            : 'Nao ha categoria com base comparavel suficiente no periodo.',
        304,
        440,
        251,
        118,
        COLORS.navy
    );

    addNarrativeCard(
        pdf,
        'Tendencia observada',
        insights.inflation.tendencias,
        40,
        570,
        515,
        92,
        COLORS.blue
    );
};

const addChartPage = (pdf, reportTitle, pageTitle, canvas, insights) => {
    addPageHeader(pdf, reportTitle, pageTitle);
    pdf.addImage(canvas.toDataURL('image/png', 1), 'PNG', 40, 92, 515, 220, undefined, 'FAST');
    addInsightBlock(pdf, 'Finalidade do grafico', insights.finalidade, 40, 335, 515, COLORS.blue);
    addInsightBlock(pdf, 'Analise de comportamento', insights.comportamento, 40, 475, 515, COLORS.cyan);
    addInsightBlock(pdf, 'Tendencias de consumo', insights.tendencias, 40, 615, 515, COLORS.slate);
};

export const exportToExcel = (data, filename = 'gastos_contabeis.xlsx') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatorio');
    XLSX.writeFile(workbook, filename);
};

export const generateConsumptionAnalysisPdf = async ({ receipts = [], products = [], stats = null }) => {
    if (!receipts.length || !products.length) {
        throw new Error('Nao ha dados suficientes para gerar o relatorio.');
    }

    const JsPDF = await loadJsPdfConstructor();
    const reportData = buildReportData({ receipts, products, stats });
    const insights = buildInsights(reportData);
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const avgTicket = reportData.receipts.length ? reportData.totalSpent / reportData.receipts.length : 0;

    addPageHeader(pdf, insights.summary.title, insights.summary.subtitle);
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text('Painel Executivo', 40, 110);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(COLORS.muted);
    pdf.text(`Periodo analisado: ${insights.summary.periodLabel}`, 40, 132);
    pdf.text(`Base de dados: ${receipts.length} cupons fiscais e ${products.length} itens processados`, 40, 148);

    const cardWidth = (pageWidth - 100) / 2;
    [
        ['Total analisado', formatCurrency(reportData.totalSpent)],
        ['Cupons processados', `${reportData.receipts.length}`],
        ['Ticket medio', formatCurrency(avgTicket)],
        ['Perfil inferido', reportData.profile]
    ].forEach(([label, value], index) => {
        const x = 40 + (index % 2) * (cardWidth + 20);
        const y = 172 + Math.floor(index / 2) * 92;
        addSummaryCard(pdf, label, value, x, y, cardWidth);
    });

    pdf.setFillColor(COLORS.page);
    pdf.roundedRect(40, 370, 515, 112, 14, 14, 'F');
    pdf.setTextColor(COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Sintese estrategica', 56, 396);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(
        pdf.splitTextToSize(
            `${insights.summary.highlights.join(' ')} A projecao temporal aponta ${reportData.temporalProjection.direction} do gasto agregado, enquanto a composicao por categorias indica prioridades orcamentarias que devem permanecer relevantes no curto prazo.`,
            487
        ),
        56,
        418
    );

    pdf.addImage(drawTimeSeriesChart(reportData.temporalData).toDataURL('image/png', 1), 'PNG', 40, 508, 515, 225, undefined, 'FAST');

    pdf.addPage();
    addChartPage(pdf, insights.summary.title, 'Series Temporais de Gasto', drawTimeSeriesChart(reportData.temporalData), insights.temporal);

    pdf.addPage();
    addChartPage(pdf, insights.summary.title, 'Composicao por Categorias', drawCompositionChart(reportData.categoryComposition), insights.categories);

    pdf.addPage();
    addChartPage(pdf, insights.summary.title, 'Fluxo Financeiro (Sankey)', drawFlowChart(reportData.flowData), insights.flow);

    pdf.addPage();
    addChartPage(pdf, insights.summary.title, 'Histograma de Frequencia', drawHistogramChart(reportData.histogramData), insights.histogram);

    addInflationOverviewPage(pdf, insights.summary.title, reportData, insights);

    pdf.addPage();
    addPaginatedTable({
        pdf,
        reportTitle: insights.summary.title,
        pageTitle: 'Inflacao por Produto',
        introText: 'Tabela completa dos produtos comparaveis usados no calculo do indice de inflacao pessoal.',
        columns: [
            { label: 'Produto', width: 190 },
            { label: 'Periodo', width: 88 },
            { label: 'Anterior', width: 58 },
            { label: 'Atual', width: 58 },
            { label: 'Inflacao', width: 55, color: getVariationColor },
            { label: 'Impacto', width: 66 }
        ],
        rows: reportData.inflation.productInflationData,
        mapRow: (item) => [
            [
                item.name,
                `Categoria: ${item.category}`,
                item.memberNames.length > 1 ? `Base: ${item.memberNames.join(' | ')}` : ''
            ].filter(Boolean).join('\n'),
            `${formatDate(item.previousDate)}\n->\n${formatDate(item.currentDate)}`,
            formatCurrency(item.previousPrice),
            formatCurrency(item.currentPrice),
            formatSignedRatioPercent(item.inflationRate),
            formatCurrency(item.financialImpact)
        ],
        emptyMessage: 'Ainda nao ha produtos com pelo menos dois registros de preco em datas diferentes no periodo analisado.'
    });

    pdf.addPage();
    addPaginatedTable({
        pdf,
        reportTitle: insights.summary.title,
        pageTitle: 'Inflacao por Categoria',
        introText: 'Agrupamento das variacoes de preco por categoria com base nos mesmos produtos comparaveis do indice de inflacao pessoal.',
        columns: [
            { label: 'Categoria', width: 230 },
            { label: 'Produtos', width: 70 },
            { label: 'Inflacao', width: 90, color: getVariationColor },
            { label: 'Impacto', width: 125 }
        ],
        rows: reportData.inflation.categoryInflationData,
        mapRow: (item) => [
            item.name,
            `${item.comparableProducts}`,
            formatSignedRatioPercent(item.inflationRate),
            formatCurrency(item.financialImpact)
        ],
        emptyMessage: 'Ainda nao ha categorias com base comparavel suficiente para o periodo analisado.'
    });

    addFooter(pdf);
    pdf.save(`relatorio-analise-consumo-${new Date().toISOString().slice(0, 10)}.pdf`);
};
