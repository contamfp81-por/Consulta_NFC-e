import { jsPDF } from 'jspdf';

const REPORT_COLORS = {
    navy: '#1F3A5F',
    blue: '#2F5D8C',
    cyan: '#4A90C2',
    slate: '#64748B',
    lightSlate: '#E2E8F0',
    softBlue: '#DCE8F5',
    page: '#F8FAFC',
    white: '#FFFFFF',
    success: '#2E7D32',
    warning: '#F59E0B',
    danger: '#D32F2F',
    text: '#1E293B',
    muted: '#64748B'
};

const CHART_COLORS = ['#1F3A5F', '#2F5D8C', '#4A90C2', '#64748B', '#93C5FD', '#60A5FA', '#CBD5E1'];
const ESSENTIAL_CATEGORIES = new Set([
    'Alimentação',
    'Bebidas',
    'Higiene e Limpeza',
    'Hortifruti',
    'Açougue e Frios',
    'Padaria e Lanches',
    'Farmácia e Saúde',
    'Combustível'
]);

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const sum = (values) => values.reduce((total, value) => total + value, 0);
const average = (values) => values.length > 0 ? sum(values) / values.length : 0;

const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);
const formatPercent = (value) => `${percentFormatter.format(Number(value) || 0)}%`;

const safeDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateLabel = (value) => {
    const date = safeDate(value);
    return date ? dateFormatter.format(date) : 'Data inválida';
};

const hexToRgba = (hex, alpha) => {
    const normalizedHex = hex.replace('#', '');
    const bigint = Number.parseInt(normalizedHex, 16);
    const red = (bigint >> 16) & 255;
    const green = (bigint >> 8) & 255;
    const blue = bigint & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const createCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    context.fillStyle = REPORT_COLORS.white;
    context.fillRect(0, 0, width, height);

    return { canvas, context };
};

const drawChartFrame = (context, width, height, title, subtitle) => {
    context.fillStyle = REPORT_COLORS.white;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = REPORT_COLORS.lightSlate;
    context.lineWidth = 2;
    context.strokeRect(1, 1, width - 2, height - 2);

    context.fillStyle = REPORT_COLORS.text;
    context.font = '700 28px Arial';
    context.fillText(title, 28, 42);

    if (subtitle) {
        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 16px Arial';
        context.fillText(subtitle, 28, 68);
    }
};

const getTemporalProjection = (temporalData) => {
    if (temporalData.length === 0) {
        return { direction: 'estável', projectedDailyAverage: 0, projectedNext30: 0, slope: 0 };
    }

    const values = temporalData.map((item) => Number(item.value) || 0);
    const lastWindow = values.slice(-Math.min(7, values.length));
    const previousWindow = values.slice(-Math.min(14, values.length), -Math.min(7, values.length));
    const lastAverage = average(lastWindow);
    const previousAverage = previousWindow.length > 0 ? average(previousWindow) : lastAverage;

    let numerator = 0;
    let denominator = 0;
    const meanIndex = (values.length - 1) / 2;
    const meanValue = average(values);

    values.forEach((value, index) => {
        numerator += (index - meanIndex) * (value - meanValue);
        denominator += (index - meanIndex) ** 2;
    });

    const slope = denominator > 0 ? numerator / denominator : 0;
    const projectedDailyAverage = Math.max(0, lastAverage + (slope * 15));
    const projectedNext30 = projectedDailyAverage * 30;

    let direction = 'estável';
    if (lastAverage > previousAverage * 1.08 || slope > meanValue * 0.02) direction = 'alta';
    if (lastAverage < previousAverage * 0.92 || slope < meanValue * -0.02) direction = 'redução';

    return { direction, projectedDailyAverage, projectedNext30, slope, lastAverage };
};

const buildDailySeries = (receipts) => {
    const dateMap = {};
    receipts.forEach((receipt) => {
        const date = safeDate(receipt.date);
        if (!date) return;
        const dateKey = date.toISOString().split('T')[0];
        dateMap[dateKey] = (dateMap[dateKey] || 0) + (Number(receipt.totalValue) || 0);
    });

    return Object.entries(dateMap)
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

const buildStoreCategoryFlows = (receipts, products) => {
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const flowMap = {};

    products.forEach((product) => {
        const receipt = receiptMap.get(product.receiptId);
        const source = receipt?.establishment || 'Origem não identificada';
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
        sources: Object.entries(sourceTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((left, right) => right.value - left.value)
            .slice(0, 6),
        targets: Object.entries(targetTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((left, right) => right.value - left.value)
            .slice(0, 6)
    };
};

const buildReceiptFrequencyHistogram = (receipts) => {
    const bins = [0, 20, 50, 100, 200, 400, 800, 1600];
    const labels = bins.slice(0, -1).map((value, index) => ({
        min: value,
        max: bins[index + 1],
        label: `${formatCurrency(value)} - ${formatCurrency(bins[index + 1])}`
    }));

    const histogram = labels.map((label) => ({ ...label, count: 0 }));

    receipts.forEach((receipt) => {
        const totalValue = Number(receipt.totalValue) || 0;
        const bucket = histogram.find((item, index) => (
            index === histogram.length - 1
                ? totalValue >= item.min
                : totalValue >= item.min && totalValue < item.max
        ));

        if (bucket) {
            bucket.count += 1;
        }
    });

    return histogram;
};

const inferOverallProfile = ({ categoryComposition, histogramData, temporalProjection }) => {
    const essentialShare = categoryComposition
        .filter((item) => ESSENTIAL_CATEGORIES.has(item.name))
        .reduce((total, item) => total + item.percentage, 0);

    const lowTicketShare = histogramData.length > 0
        ? (sum(histogramData.slice(0, 2).map((item) => item.count)) / Math.max(1, sum(histogramData.map((item) => item.count)))) * 100
        : 0;

    if (lowTicketShare > 55 && temporalProjection.direction === 'alta') {
        return 'Consumidor recorrente com traços impulsivos';
    }

    if (essentialShare > 60) {
        return 'Consumidor conservador e orientado a necessidades básicas';
    }

    if (categoryComposition[0]?.percentage > 40) {
        return 'Consumidor concentrado em poucos centros de custo';
    }

    return 'Consumidor equilibrado com padrão de gastos diversificado';
};

const createTemporalInsight = (temporalData) => {
    const projection = getTemporalProjection(temporalData);
    const peak = [...temporalData].sort((left, right) => right.value - left.value)[0];
    const values = temporalData.map((entry) => Number(entry.value) || 0);
    const meanValue = average(values);
    const volatility = values.length > 0
        ? Math.sqrt(average(values.map((value) => ((value - meanValue) ** 2)))) / Math.max(1, meanValue)
        : 0;

    return {
        finalidade: 'Este gráfico de séries temporais evidencia a evolução do gasto total ao longo do tempo, destacando picos, sazonalidade e períodos de desaceleração.',
        comportamento: peak
            ? `O maior pico ocorreu em ${formatDateLabel(peak.date)}, com ${formatCurrency(peak.value)}. A volatilidade observada sugere um perfil ${volatility > 0.55 ? 'reativo, com compras concentradas em janelas específicas' : 'mais estável e previsível'}.`
            : 'Ainda não há volume suficiente para caracterizar comportamento temporal.',
        tendencias: `Com base no ritmo recente, a tendência projetada é de ${projection.direction}, com gasto médio diário estimado em ${formatCurrency(projection.projectedDailyAverage)} e projeção de ${formatCurrency(projection.projectedNext30)} para os próximos 30 dias.`,
        projection
    };
};

const createCategoryInsight = (categoryComposition) => {
    const topCategory = categoryComposition[0];
    const topThreeShare = sum(categoryComposition.slice(0, 3).map((item) => item.percentage));
    const essentialShare = categoryComposition
        .filter((item) => ESSENTIAL_CATEGORIES.has(item.name))
        .reduce((total, item) => total + item.percentage, 0);

    return {
        finalidade: 'O gráfico de composição mostra como o orçamento se distribui entre categorias, permitindo enxergar quais centros de custo consomem mais recursos.',
        comportamento: topCategory
            ? `A categoria líder é ${topCategory.name}, com ${formatPercent(topCategory.percentage)} do total. As três maiores categorias somam ${formatPercent(topThreeShare)}, indicando ${topThreeShare > 70 ? 'alta concentração' : 'diversificação'} do orçamento.`
            : 'Sem dados suficientes para classificar concentração de categorias.',
        tendencias: `A participação de categorias essenciais representa ${formatPercent(essentialShare)} do consumo. Mantido esse padrão, o orçamento tende a permanecer ${essentialShare > 60 ? 'mais defensivo e previsível' : 'mais flexível e sujeito a redistribuições'} nos próximos períodos.`
    };
};

const createSankeyInsight = (flowData) => {
    const topLink = [...flowData.links].sort((left, right) => right.value - left.value)[0];
    const topSource = flowData.sources[0];
    const topTarget = flowData.targets[0];

    return {
        finalidade: 'O diagrama de fluxo (Sankey) mostra a jornada do dinheiro, conectando os estabelecimentos de origem às categorias de destino final.',
        comportamento: topLink
            ? `O fluxo dominante sai de ${topLink.source} para ${topLink.target}, totalizando ${formatCurrency(topLink.value)}. Isso revela onde a rotina de compra concentra maior peso financeiro.`
            : 'Ainda não há fluxo suficiente para identificar uma rota dominante.',
        tendencias: `O principal polo de saída é ${topSource?.name || 'indefinido'} e o principal destino é ${topTarget?.name || 'indefinido'}. Se o padrão persistir, essas conexões devem continuar liderando a alocação do orçamento nos próximos ciclos.`
    };
};

const createHistogramInsight = (histogramData) => {
    const totalTransactions = Math.max(1, sum(histogramData.map((item) => item.count)));
    const lowFrequency = sum(histogramData.slice(0, 2).map((item) => item.count));
    const highFrequency = sum(histogramData.slice(-2).map((item) => item.count));
    const lowShare = (lowFrequency / totalTransactions) * 100;
    const highShare = (highFrequency / totalTransactions) * 100;
    const dominantBucket = [...histogramData].sort((left, right) => right.count - left.count)[0];

    return {
        finalidade: 'Este histograma de frequência mostra quantas compras recaem em cada faixa de gasto, ajudando a detectar hábitos recorrentes e episódios impulsivos.',
        comportamento: dominantBucket
            ? `A faixa mais recorrente é ${dominantBucket.label}, com ${dominantBucket.count} ocorrências. ${lowShare > 50 ? 'Há forte presença de compras menores e frequentes, típicas de comportamento impulsivo ou conveniência.' : 'As compras estão menos pulverizadas em pequenos valores e sugerem maior planejamento.'}`
            : 'Sem ocorrências suficientes para caracterizar frequência de tickets.',
        tendencias: `Os gastos de baixo valor representam ${formatPercent(lowShare)} das compras e os de alto valor representam ${formatPercent(highShare)}. A tendência é de ${lowShare > highShare ? 'manutenção de recorrência em tickets menores' : 'predomínio de compras mais relevantes e espaçadas'} no curto prazo.`
    };
};

const createExecutiveSummary = (reportData) => {
    const { receipts, totalSpent, categoryComposition, temporalData, histogramData } = reportData;
    const firstDate = temporalData[0]?.date;
    const lastDate = temporalData[temporalData.length - 1]?.date;
    const avgTicket = receipts.length > 0 ? totalSpent / receipts.length : 0;
    const topCategory = categoryComposition[0];
    const profile = inferOverallProfile(reportData);

    return {
        title: 'Relatório de Análise de Consumo',
        subtitle: 'Sistema de Exportação de Inteligência de Consumo',
        periodLabel: firstDate && lastDate ? `${formatDateLabel(firstDate)} a ${formatDateLabel(lastDate)}` : 'Período insuficiente',
        summaryCards: [
            { label: 'Total analisado', value: formatCurrency(totalSpent) },
            { label: 'Cupons processados', value: `${receipts.length}` },
            { label: 'Ticket médio', value: formatCurrency(avgTicket) },
            { label: 'Perfil inferido', value: profile }
        ],
        highlights: [
            topCategory
                ? `Maior centro de custo: ${topCategory.name} (${formatPercent(topCategory.percentage)} do total).`
                : 'Sem categoria dominante identificada.',
            histogramData.length > 0
                ? `Faixa de gasto mais frequente: ${[...histogramData].sort((left, right) => right.count - left.count)[0].label}.`
                : 'Sem frequência de ticket relevante.'
        ]
    };
};

const buildReportData = ({ receipts, products, stats }) => {
    const totalSpent = Number(stats?.totalSpent) || sum(products.map((product) => Number(product.totalValue) || 0));
    const temporalData = stats?.dailyEvolutionData?.length ? stats.dailyEvolutionData : buildDailySeries(receipts);
    const categoryComposition = stats?.categorySpendData?.length ? stats.categorySpendData : buildCategoryComposition(products, totalSpent);
    const sankeyData = buildStoreCategoryFlows(receipts, products);
    const histogramData = buildReceiptFrequencyHistogram(receipts);

    return {
        receipts,
        products,
        totalSpent,
        temporalData,
        categoryComposition,
        sankeyData,
        histogramData,
        temporalProjection: getTemporalProjection(temporalData)
    };
};

const drawTimeSeriesChart = (temporalData) => {
    const { canvas, context } = createCanvas(1400, 500);
    drawChartFrame(context, canvas.width, canvas.height, 'Séries Temporais de Gasto', 'Evolução do consumo ao longo do período analisado');

    const chartArea = { left: 90, right: 60, top: 100, bottom: 80 };
    const values = temporalData.map((item) => Number(item.value) || 0);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const drawableHeight = canvas.height - chartArea.top - chartArea.bottom;
    const drawableWidth = canvas.width - chartArea.left - chartArea.right;

    context.strokeStyle = REPORT_COLORS.lightSlate;
    context.lineWidth = 1;
    for (let step = 0; step <= 4; step += 1) {
        const y = chartArea.top + (drawableHeight / 4) * step;
        context.beginPath();
        context.moveTo(chartArea.left, y);
        context.lineTo(canvas.width - chartArea.right, y);
        context.stroke();

        const gridValue = maxValue - ((maxValue - minValue) / 4) * step;
        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(gridValue), 20, y + 4);
    }

    if (temporalData.length === 1) {
        context.fillStyle = REPORT_COLORS.navy;
        context.beginPath();
        context.arc(chartArea.left + drawableWidth / 2, chartArea.top + drawableHeight / 2, 7, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = REPORT_COLORS.muted;
        context.fillText(formatDateLabel(temporalData[0].date), chartArea.left + drawableWidth / 2 - 40, canvas.height - 35);
        return canvas;
    }

    const points = temporalData.map((item, index) => {
        const x = chartArea.left + (drawableWidth / Math.max(1, temporalData.length - 1)) * index;
        const y = chartArea.top + drawableHeight - (((Number(item.value) || 0) - minValue) / Math.max(1, maxValue - minValue)) * drawableHeight;
        return { ...item, x, y };
    });

    context.beginPath();
    points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = REPORT_COLORS.navy;
    context.lineWidth = 4;
    context.stroke();

    context.beginPath();
    context.moveTo(points[0].x, canvas.height - chartArea.bottom);
    points.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(points[points.length - 1].x, canvas.height - chartArea.bottom);
    context.closePath();
    context.fillStyle = hexToRgba(REPORT_COLORS.cyan, 0.18);
    context.fill();

    points.forEach((point, index) => {
        context.fillStyle = REPORT_COLORS.white;
        context.strokeStyle = REPORT_COLORS.navy;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        if (index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0) {
            context.fillStyle = REPORT_COLORS.muted;
            context.font = '400 13px Arial';
            context.save();
            context.translate(point.x, canvas.height - 35);
            context.rotate(-Math.PI / 6);
            context.fillText(formatDateLabel(point.date), -30, 0);
            context.restore();
        }
    });

    return canvas;
};

const aggregateCompositionChartData = (categoryComposition) => {
    if (categoryComposition.length <= 6) return categoryComposition;

    const visible = categoryComposition.slice(0, 5);
    const remaining = categoryComposition.slice(5);
    return [
        ...visible,
        {
            name: 'Demais categorias',
            value: sum(remaining.map((item) => item.value)),
            percentage: sum(remaining.map((item) => item.percentage))
        }
    ];
};

const drawCompositionChart = (categoryComposition) => {
    const data = aggregateCompositionChartData(categoryComposition);
    const { canvas, context } = createCanvas(1400, 500);
    drawChartFrame(context, canvas.width, canvas.height, 'Composição por Categorias', 'Distribuição percentual por centros de custo');

    const centerX = 350;
    const centerY = 285;
    const outerRadius = 135;
    const innerRadius = 78;
    let startAngle = -Math.PI / 2;

    data.forEach((item, index) => {
        const angle = ((item.percentage || 0) / 100) * Math.PI * 2;
        const endAngle = startAngle + angle;

        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(centerX, centerY, outerRadius, startAngle, endAngle);
        context.closePath();
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fill();
        startAngle = endAngle;
    });

    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = 'source-over';

    context.fillStyle = REPORT_COLORS.text;
    context.font = '700 26px Arial';
    context.textAlign = 'center';
    context.fillText('100%', centerX, centerY - 8);
    context.fillStyle = REPORT_COLORS.muted;
    context.font = '400 16px Arial';
    context.fillText('do gasto analisado', centerX, centerY + 20);

    let legendY = 135;
    context.textAlign = 'left';
    data.forEach((item, index) => {
        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(690, legendY - 12, 22, 22);

        context.fillStyle = REPORT_COLORS.text;
        context.font = '700 18px Arial';
        context.fillText(item.name, 725, legendY + 2);

        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 16px Arial';
        context.fillText(`${formatPercent(item.percentage)} | ${formatCurrency(item.value)}`, 725, legendY + 26);

        legendY += 56;
    });

    return canvas;
};

const drawSankeyChart = (flowData) => {
    const { canvas, context } = createCanvas(1400, 560);
    drawChartFrame(context, canvas.width, canvas.height, 'Fluxo Financeiro (Sankey)', 'Percurso do gasto dos estabelecimentos para as categorias');

    const links = flowData.links.filter((link) =>
        flowData.sources.some((source) => source.name === link.source)
        && flowData.targets.some((target) => target.name === link.target)
    );
    const totalFlow = Math.max(1, sum(links.map((link) => link.value)));
    const topPadding = 110;
    const bottomPadding = 70;
    const availableHeight = canvas.height - topPadding - bottomPadding;
    const nodeGap = 18;
    const nodeWidth = 24;
    const leftX = 120;
    const rightX = 980;
    const scale = (availableHeight - (Math.max(flowData.sources.length, flowData.targets.length) - 1) * nodeGap) / totalFlow;

    const sourceNodes = {};
    const targetNodes = {};

    let currentY = topPadding;
    flowData.sources.forEach((source, index) => {
        const height = Math.max(18, source.value * scale);
        sourceNodes[source.name] = { x: leftX, y: currentY, height, color: CHART_COLORS[index % CHART_COLORS.length], offset: 0, value: source.value };
        currentY += height + nodeGap;
    });

    currentY = topPadding;
    flowData.targets.forEach((target, index) => {
        const height = Math.max(18, target.value * scale);
        targetNodes[target.name] = { x: rightX, y: currentY, height, color: CHART_COLORS[index % CHART_COLORS.length], offset: 0, value: target.value };
        currentY += height + nodeGap;
    });

    links.forEach((link) => {
        const sourceNode = sourceNodes[link.source];
        const targetNode = targetNodes[link.target];
        if (!sourceNode || !targetNode) return;

        const bandHeight = Math.max(8, link.value * scale);
        const sourceTop = sourceNode.y + sourceNode.offset;
        const targetTop = targetNode.y + targetNode.offset;
        const sourceBottom = sourceTop + bandHeight;
        const targetBottom = targetTop + bandHeight;
        const controlX = (leftX + rightX) / 2;

        context.beginPath();
        context.moveTo(leftX + nodeWidth, sourceTop);
        context.bezierCurveTo(controlX, sourceTop, controlX, targetTop, rightX, targetTop);
        context.lineTo(rightX, targetBottom);
        context.bezierCurveTo(controlX, targetBottom, controlX, sourceBottom, leftX + nodeWidth, sourceBottom);
        context.closePath();
        context.fillStyle = hexToRgba(sourceNode.color, 0.34);
        context.fill();

        sourceNode.offset += bandHeight;
        targetNode.offset += bandHeight;
    });

    Object.entries(sourceNodes).forEach(([name, node]) => {
        context.fillStyle = node.color;
        context.fillRect(node.x, node.y, nodeWidth, node.height);
        context.fillStyle = REPORT_COLORS.text;
        context.font = '700 16px Arial';
        context.fillText(name, node.x + nodeWidth + 12, node.y + 20);
        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(node.value), node.x + nodeWidth + 12, node.y + 40);
    });

    Object.entries(targetNodes).forEach(([name, node]) => {
        context.fillStyle = node.color;
        context.fillRect(node.x, node.y, nodeWidth, node.height);
        context.fillStyle = REPORT_COLORS.text;
        context.font = '700 16px Arial';
        context.fillText(name, node.x + nodeWidth + 12, node.y + 20);
        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(formatCurrency(node.value), node.x + nodeWidth + 12, node.y + 40);
    });

    return canvas;
};

const drawHistogramChart = (histogramData) => {
    const { canvas, context } = createCanvas(1400, 500);
    drawChartFrame(context, canvas.width, canvas.height, 'Histograma de Frequência', 'Faixas de gasto por cupom fiscal');

    const chartArea = { left: 90, right: 40, top: 95, bottom: 90 };
    const drawableHeight = canvas.height - chartArea.top - chartArea.bottom;
    const drawableWidth = canvas.width - chartArea.left - chartArea.right;
    const maxCount = Math.max(...histogramData.map((item) => item.count), 1);
    const barWidth = drawableWidth / Math.max(1, histogramData.length);

    context.strokeStyle = REPORT_COLORS.lightSlate;
    context.lineWidth = 1;
    for (let step = 0; step <= 4; step += 1) {
        const y = chartArea.top + (drawableHeight / 4) * step;
        context.beginPath();
        context.moveTo(chartArea.left, y);
        context.lineTo(canvas.width - chartArea.right, y);
        context.stroke();

        const gridValue = Math.round(maxCount - (maxCount / 4) * step);
        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 14px Arial';
        context.fillText(`${gridValue}`, 40, y + 4);
    }

    histogramData.forEach((item, index) => {
        const height = (item.count / maxCount) * drawableHeight;
        const x = chartArea.left + index * barWidth + 12;
        const y = canvas.height - chartArea.bottom - height;

        context.fillStyle = CHART_COLORS[index % CHART_COLORS.length];
        context.fillRect(x, y, barWidth - 24, height);

        context.fillStyle = REPORT_COLORS.text;
        context.font = '700 15px Arial';
        context.textAlign = 'center';
        context.fillText(`${item.count}`, x + (barWidth - 24) / 2, y - 10);

        context.save();
        context.translate(x + (barWidth - 24) / 2, canvas.height - 26);
        context.rotate(-Math.PI / 5);
        context.fillStyle = REPORT_COLORS.muted;
        context.font = '400 13px Arial';
        context.fillText(item.label, 0, 0);
        context.restore();
    });

    context.textAlign = 'left';
    return canvas;
};

const addPageHeader = (pdf, reportTitle, pageTitle) => {
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFillColor(REPORT_COLORS.navy);
    pdf.rect(0, 0, pageWidth, 74, 'F');

    pdf.setTextColor(REPORT_COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text(reportTitle, 40, 34);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(pageTitle, 40, 54);
};

const addFooter = (pdf) => {
    const pageCount = pdf.getNumberOfPages();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(REPORT_COLORS.lightSlate);
        pdf.line(40, pageHeight - 38, pageWidth - 40, pageHeight - 38);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(REPORT_COLORS.muted);
        pdf.text(`Relatório gerado automaticamente em ${dateFormatter.format(new Date())}`, 40, pageHeight - 22);
        pdf.text(`Página ${page} de ${pageCount}`, pageWidth - 100, pageHeight - 22);
    }
};

const addTextBlock = (pdf, title, body, startX, startY, width, accentColor) => {
    pdf.setFillColor(accentColor);
    pdf.roundedRect(startX, startY, width, 28, 8, 8, 'F');
    pdf.setTextColor(REPORT_COLORS.white);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, startX + 12, startY + 18);

    pdf.setFillColor(REPORT_COLORS.page);
    pdf.roundedRect(startX, startY + 34, width, 92, 10, 10, 'F');
    pdf.setTextColor(REPORT_COLORS.text);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(body, width - 22);
    pdf.text(lines, startX + 11, startY + 52);
};

const addSummaryCard = (pdf, label, value, x, y, width) => {
    pdf.setFillColor(REPORT_COLORS.page);
    pdf.roundedRect(x, y, width, 72, 12, 12, 'F');
    pdf.setTextColor(REPORT_COLORS.muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(label, x + 14, y + 20);
    pdf.setTextColor(REPORT_COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    const textLines = pdf.splitTextToSize(value, width - 28);
    pdf.text(textLines, x + 14, y + 44);
};

const addChartPage = (pdf, reportTitle, pageTitle, chartCanvas, insightBlocks) => {
    addPageHeader(pdf, reportTitle, pageTitle);
    const image = chartCanvas.toDataURL('image/png', 1);
    pdf.addImage(image, 'PNG', 40, 92, 515, 220, undefined, 'FAST');

    addTextBlock(pdf, 'Finalidade do gráfico', insightBlocks.finalidade, 40, 335, 515, REPORT_COLORS.blue);
    addTextBlock(pdf, 'Análise de comportamento', insightBlocks.comportamento, 40, 475, 515, REPORT_COLORS.cyan);
    addTextBlock(pdf, 'Tendências de consumo', insightBlocks.tendencias, 40, 615, 515, REPORT_COLORS.slate);
};

export const generateConsumptionAnalysisPdf = async ({ receipts = [], products = [], stats = null }) => {
    if (!receipts.length || !products.length) {
        throw new Error('Não há dados suficientes para gerar o relatório.');
    }

    const reportData = buildReportData({ receipts, products, stats });
    const executiveSummary = createExecutiveSummary(reportData);
    const temporalInsight = createTemporalInsight(reportData.temporalData);
    const categoryInsight = createCategoryInsight(reportData.categoryComposition);
    const sankeyInsight = createSankeyInsight(reportData.sankeyData);
    const histogramInsight = createHistogramInsight(reportData.histogramData);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();

    addPageHeader(pdf, executiveSummary.title, executiveSummary.subtitle);
    pdf.setTextColor(REPORT_COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text('Painel Executivo', 40, 110);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(REPORT_COLORS.muted);
    pdf.text(`Período analisado: ${executiveSummary.periodLabel}`, 40, 132);
    pdf.text(`Base de dados: ${receipts.length} cupons fiscais e ${products.length} itens processados`, 40, 148);

    const cardWidth = (pageWidth - 100) / 2;
    executiveSummary.summaryCards.forEach((card, index) => {
        const x = 40 + (index % 2) * (cardWidth + 20);
        const y = 172 + Math.floor(index / 2) * 92;
        addSummaryCard(pdf, card.label, card.value, x, y, cardWidth);
    });

    pdf.setFillColor(REPORT_COLORS.page);
    pdf.roundedRect(40, 370, 515, 112, 14, 14, 'F');
    pdf.setTextColor(REPORT_COLORS.text);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('Síntese estratégica', 56, 396);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    const synthesis = pdf.splitTextToSize(
        `${executiveSummary.highlights.join(' ')} A projeção temporal aponta ${reportData.temporalProjection.direction} do gasto agregado, enquanto a composição por categorias indica prioridades orçamentárias que devem permanecer relevantes no curto prazo.`,
        487
    );
    pdf.text(synthesis, 56, 418);

    pdf.addImage(drawTimeSeriesChart(reportData.temporalData).toDataURL('image/png', 1), 'PNG', 40, 508, 515, 225, undefined, 'FAST');

    pdf.addPage();
    addChartPage(pdf, executiveSummary.title, 'Relatório 1 de 4 • Séries Temporais', drawTimeSeriesChart(reportData.temporalData), temporalInsight);

    pdf.addPage();
    addChartPage(pdf, executiveSummary.title, 'Relatório 2 de 4 • Composição por Categorias', drawCompositionChart(reportData.categoryComposition), categoryInsight);

    pdf.addPage();
    addChartPage(pdf, executiveSummary.title, 'Relatório 3 de 4 • Fluxo Financeiro (Sankey)', drawSankeyChart(reportData.sankeyData), sankeyInsight);

    pdf.addPage();
    addChartPage(pdf, executiveSummary.title, 'Relatório 4 de 4 • Histograma de Frequência', drawHistogramChart(reportData.histogramData), histogramInsight);

    addFooter(pdf);
    pdf.save(`relatorio-analise-consumo-${new Date().toISOString().slice(0, 10)}.pdf`);
};
