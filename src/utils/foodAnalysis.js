import { buildProductGrouping, getProductGroup } from './productGrouping';
import { withInsightWhy } from './insightNarrative';

// Dicionarios e constantes centrais do modulo alimentar.
const WEEKDAY_OPTIONS = [
    { index: 0, key: 'domingo', label: 'Domingo', shortLabel: 'Dom' },
    { index: 1, key: 'segunda-feira', label: 'Segunda-feira', shortLabel: 'Seg' },
    { index: 2, key: 'terca-feira', label: 'Terca-feira', shortLabel: 'Ter' },
    { index: 3, key: 'quarta-feira', label: 'Quarta-feira', shortLabel: 'Qua' },
    { index: 4, key: 'quinta-feira', label: 'Quinta-feira', shortLabel: 'Qui' },
    { index: 5, key: 'sexta-feira', label: 'Sexta-feira', shortLabel: 'Sex' },
    { index: 6, key: 'sabado', label: 'Sabado', shortLabel: 'Sab' }
];

const FOOD_RELATED_CATEGORY_HINTS = new Set([
    'alimentacao',
    'bebidas',
    'hortifruti',
    'acougue e frios',
    'padaria e lanches',
    'supermercado',
    'mercearia',
    'laticinios',
    'congelados',
    'doces',
    'bomboniere',
    'cereais',
    'frios',
    'padaria',
    'acougue'
]);

const NATURAL_KEYWORDS = [
    'banana', 'maca', 'pera', 'uva', 'morango', 'melancia', 'mamao', 'abacaxi', 'laranja', 'mexerica',
    'tangerina', 'limao', 'abacate', 'manga', 'kiwi', 'maracuja', 'goiaba', 'coco', 'acai puro',
    'alface', 'couve', 'espinafre', 'rucula', 'brocolis', 'couve flor', 'repolho', 'tomate', 'pepino',
    'cenoura', 'beterraba', 'abobrinha', 'chuchu', 'berinjela', 'quiabo', 'vagem', 'cebola', 'alho',
    'mandioca', 'batata doce', 'inhame', 'cara', 'abobora', 'moranga', 'milho verde', 'ervilha fresca',
    'feijao', 'arroz', 'lentilha', 'grao de bico', 'aveia', 'quinoa', 'farinha de aveia', 'granola sem acucar',
    'ovo', 'ovos', 'frango in natura', 'peito de frango', 'carne bovina', 'patinho', 'musculo', 'peixe',
    'tilapia', 'sardinha fresca', 'atum fresco', 'agua mineral', 'agua com gas', 'iogurte natural',
    'leite integral', 'leite desnatado', 'leite semi desnatado', 'castanha', 'castanhas', 'nozes',
    'amendoa', 'amendoim sem sal', 'chia', 'linhaca', 'sementes', 'tofu', 'cafe em po', 'cha sem acucar'
];

const MODERATE_KEYWORDS = [
    'pao', 'pao frances', 'pao integral', 'pao de forma', 'queijo', 'mussarela', 'muçarela', 'minas',
    'parmesao', 'requeijao', 'iogurte', 'kefir', 'macarrao', 'massa simples', 'molho de tomate',
    'extrato de tomate', 'atum em lata', 'sardinha em lata', 'ervilha enlatada', 'milho enlatado',
    'conserva', 'azeitona', 'pepino em conserva', 'legumes congelados', 'vegetais congelados',
    'manteiga', 'cafe', 'torrada', 'cream cracker', 'agua e sal', 'bolacha simples', 'biscoito simples',
    'granola', 'barra de cereal simples', 'leite fermentado', 'coalhada', 'pasta de amendoim',
    'wrap', 'tapioca', 'cuscuz', 'farinha', 'farelo', 'polvilho', 'molho pesto', 'passata', 'ricota',
    'queijo cottage', 'queijo coalho', 'creme de ricota', 'panqueca', 'massa fresca', 'tomate pelado'
];

const ULTRAPROCESSED_KEYWORDS = [
    'refrigerante', 'cola', 'guarana', 'soda', 'suco artificial', 'suco de caixinha', 'nectar',
    'bebida mista', 'bebida lactea', 'achocolatado', 'achocolatado pronto', 'chocolate', 'bombom',
    'bala', 'pirulito', 'doce', 'docinho', 'sobremesa pronta', 'sobremesa industrializada',
    'sorvete', 'biscoito recheado', 'bolacha recheada', 'wafer', 'cookie recheado', 'salgadinho',
    'chips', 'snack', 'snacks', 'salsicha', 'presunto', 'mortadela', 'salame', 'linguica', 'nuggets',
    'hamburguer congelado', 'pizza congelada', 'lasanha pronta', 'congelado pronto', 'macarrao instantaneo',
    'miojo', 'tempero pronto', 'caldo pronto', 'molho pronto', 'ketchup', 'maionese', 'mostarda',
    'creme de avela', 'leite condensado', 'mistura para bolo', 'bolo pronto', 'panetone', 'chocotone',
    'cereal matinal acucarado', 'barra proteica recheada', 'energetico', 'isotonico', 'xarope',
    'calda', 'chantilly pronto', 'pudim pronto', 'gelatina pronta', 'petisco industrializado',
    'salgado congelado', 'coxinha congelada', 'empanado', 'frango empanado', 'dessert', 'fast food'
];

const SUGAR_GROUPS = [
    {
        group: 'Refrigerantes e bebidas doces',
        keywords: ['refrigerante', 'cola', 'guarana', 'soda', 'suco artificial', 'suco de caixinha', 'nectar', 'energetico', 'isotonico']
    },
    {
        group: 'Chocolate, balas e doces',
        keywords: ['chocolate', 'bombom', 'bala', 'pirulito', 'doce', 'pacoca', 'marshmallow', 'caramelo']
    },
    {
        group: 'Sobremesas industrializadas',
        keywords: ['sobremesa pronta', 'sobremesa industrializada', 'sorvete', 'pudim pronto', 'gelatina pronta', 'mousse pronta']
    },
    {
        group: 'Biscoitos e confeitaria',
        keywords: ['biscoito recheado', 'bolacha recheada', 'wafer', 'bolo pronto', 'mistura para bolo', 'panetone', 'chocotone', 'confeitaria']
    },
    {
        group: 'Lacteos e cremes adocicados',
        keywords: ['achocolatado', 'bebida lactea', 'leite condensado', 'creme de avela', 'iogurte adocicado', 'iogurte adoçado']
    },
    {
        group: 'Cereais, barras e infantis',
        keywords: ['cereal matinal', 'barra acucarada', 'produto infantil', 'biscoito infantil', 'snack infantil']
    },
    {
        group: 'Geleias, xaropes e caldas',
        keywords: ['geleia', 'xarope', 'calda', 'melado', 'cobertura']
    }
];

const JUNK_FOOD_KEYWORDS = [
    'refrigerante', 'salgadinho', 'chips', 'biscoito recheado', 'bolacha recheada', 'wafer', 'chocolate',
    'bombom', 'bala', 'pirulito', 'nuggets', 'pizza congelada', 'lasanha pronta', 'hamburguer congelado',
    'macarrao instantaneo', 'miojo', 'salsicha', 'mortadela', 'presunto', 'salame', 'energetico', 'fast food'
];

const FOOD_LEVEL_LABELS = {
    natural: 'Natural / Saudavel',
    moderate: 'Moderado',
    ultraprocessed: 'Ruim / Ultraprocessado',
    unknown: 'Nao classificado'
};

export const FOOD_CLASSIFICATION_OPTIONS = [
    {
        value: 'natural',
        label: 'Natural / Saudavel',
        description: 'Frutas, legumes, proteinas frescas e basicos minimamente processados.'
    },
    {
        value: 'moderate',
        label: 'Moderado',
        description: 'Processados leves ou itens de preparo simples, sem perfil claramente ruim.'
    },
    {
        value: 'ultraprocessed',
        label: 'Ruim / Ultraprocessado',
        description: 'Snacks, refrigerantes, embutidos, sobremesas prontas e industrializados pesados.'
    },
    {
        value: 'non_food',
        label: 'Nao alimentar / Ignorar',
        description: 'Item do cupom que nao deve entrar na analise alimentar.'
    }
];

const MANUAL_CLASSIFICATION_VALUES = new Set(FOOD_CLASSIFICATION_OPTIONS.map((option) => option.value));

const PERIOD_BUCKETS = [
    { key: 'madrugada', label: 'Madrugada', start: 0, end: 5 },
    { key: 'manha', label: 'Manha', start: 6, end: 11 },
    { key: 'tarde', label: 'Tarde', start: 12, end: 17 },
    { key: 'noite', label: 'Noite', start: 18, end: 23 }
];

const NATURAL_SUPPLEMENTAL_KEYWORDS = [
    'abobora cabotia', 'abobrinha italiana', 'agriao', 'alho poro', 'ameixa', 'acerola', 'berinjela japonesa',
    'broto de feijao', 'caju', 'caqui', 'carne moida fresca', 'contra file', 'coxao mole', 'coxao duro',
    'ervas frescas', 'file de peixe', 'file de frango', 'figo', 'frutas vermelhas', 'graos integrais',
    'graos', 'grao', 'hortela', 'jilo', 'laranja pera', 'louro', 'mandioquinha', 'maxixe', 'mel', 'melao',
    'morango bandeja', 'pepperoni fresco', 'pera williams', 'pimentao', 'quiabo fresco', 'repolho roxo',
    'salsa', 'salsinha', 'tomilho', 'uva passa sem acucar', 'uva verde', 'verduras', 'vegetais frescos',
    'iogurte grego natural', 'batata inglesa', 'batata baroa', 'frango resfriado', 'frango congelado sem tempero',
    'salmao', 'tilapia file', 'atum em posta', 'ovo caipira', 'couve manteiga', 'manga palmer', 'manga tommy'
];

const MODERATE_SUPPLEMENTAL_KEYWORDS = [
    'pao de queijo', 'baguete', 'baguetinha', 'bolo simples', 'bolo caseiro', 'macarrao integral',
    'espaguete', 'penne', 'fusilli', 'massa integral', 'molho shoyu', 'molho ingles', 'ervilha lata',
    'milho lata', 'seleta de legumes', 'azeite', 'oleo de coco', 'oleo vegetal', 'vinagre', 'tempero seco',
    'queijo prato', 'queijo parmesao ralado', 'queijo fatiado', 'peito de peru', 'atum solido', 'atum ralado',
    'sardinha molho tomate', 'granola tradicional', 'barra de cereal', 'cookie integral', 'biscoito agua e sal',
    'biscoito integral', 'pao sirio', 'rap10', 'wrap integral', 'crepioca', 'massa para pastel',
    'massa de lasanha', 'massa de pizza', 'creme de leite', 'leite em po', 'iogurte grego', 'requeijao light',
    'ricota fresca', 'bebida vegetal sem acucar', 'cafe torrado', 'cafe soluvel', 'cha mate', 'filtro de cafe'
];

const ULTRAPROCESSED_SUPPLEMENTAL_KEYWORDS = [
    'refresco em po', 'po para refresco', 'suco em po', 'cha pronto', 'cha gelado', 'bebida energetica',
    'bala de goma', 'goma de mascar', 'trufa', 'pao doce industrializado', 'rosquinha', 'rosquinha recheada',
    'bolo recheado', 'bolo industrializado', 'danette', 'danoninho', 'sobremesa lactea', 'petit suisse',
    'sorvete massa', 'picole industrializado', 'hamburguer', 'hamburguer bovino', 'hamburguer de frango',
    'empanado de frango', 'frango empanado', 'fritas congeladas', 'batata smile', 'lasanha congelada',
    'esfirra congelada', 'mini pizza', 'pizza pronta', 'hot pocket', 'sanduiche pronto', 'salgadinho milho',
    'torcida', 'ruffles', 'doritos', 'fandangos', 'cheetos', 'wafer chocolate', 'bolinho pronto', 'cupcake',
    'cobertura pronta', 'chantininho', 'creme culinario pronto', 'molho barbecue', 'molho cheddar',
    'tempero completo', 'caldo de carne', 'caldo de galinha', 'sopa instantanea', 'margarina saborizada',
    'bebida proteica adoçada', 'cereal de chocolate', 'cereal açucarado', 'cereal acucarado'
];

const SUGAR_SUPPLEMENTAL_GROUPS = [
    {
        group: 'Refrescos e misturas adoçadas',
        keywords: ['refresco em po', 'po para refresco', 'suco em po', 'mistura para suco', 'xarope de groselha']
    },
    {
        group: 'Lacteos infantis e sobremesas doces',
        keywords: ['danoninho', 'petit suisse', 'sobremesa lactea', 'achocolatado', 'bebida lactea', 'iogurte grego adoçado']
    },
    {
        group: 'Panificacao e snacks doces',
        keywords: ['rosquinha', 'bolinho pronto', 'bolo recheado', 'cupcake', 'wafer chocolate', 'cookie recheado']
    }
];

const ALL_NATURAL_KEYWORDS = [...NATURAL_KEYWORDS, ...NATURAL_SUPPLEMENTAL_KEYWORDS];
const ALL_MODERATE_KEYWORDS = [...MODERATE_KEYWORDS, ...MODERATE_SUPPLEMENTAL_KEYWORDS];
const ALL_ULTRAPROCESSED_KEYWORDS = [...ULTRAPROCESSED_KEYWORDS, ...ULTRAPROCESSED_SUPPLEMENTAL_KEYWORDS];
const RESOLVED_SUGAR_GROUPS = [...SUGAR_GROUPS, ...SUGAR_SUPPLEMENTAL_GROUPS];
const SUGARY_KEYWORDS = RESOLVED_SUGAR_GROUPS.flatMap((group) => group.keywords);

export const FOOD_ANALYSIS_SAMPLE_ITEMS = [
    { id: 's1', nome: 'Banana prata', categoriaOriginal: 'hortifruti', valor: 6.8, quantidade: 6, data: '2026-02-28', hora: '18:10', diaSemana: 'sabado' },
    { id: 's2', nome: 'Feijao carioca 1kg', categoriaOriginal: 'alimentacao', valor: 8.9, quantidade: 1, data: '2026-03-01', hora: '10:15', diaSemana: 'domingo' },
    { id: 's3', nome: 'Refrigerante cola 2L', categoriaOriginal: 'bebidas', valor: 9.99, quantidade: 1, data: '2026-03-01', hora: '21:35', diaSemana: 'domingo' },
    { id: 's4', nome: 'Biscoito recheado chocolate', categoriaOriginal: 'alimentacao', valor: 5.79, quantidade: 2, data: '2026-03-01', hora: '21:35', diaSemana: 'domingo' },
    { id: 's5', nome: 'Arroz integral 1kg', categoriaOriginal: 'alimentacao', valor: 9.5, quantidade: 1, data: '2026-03-05', hora: '17:20', diaSemana: 'quinta-feira' },
    { id: 's6', nome: 'Iogurte natural', categoriaOriginal: 'bebidas', valor: 4.99, quantidade: 2, data: '2026-03-05', hora: '17:20', diaSemana: 'quinta-feira' },
    { id: 's7', nome: 'Salgadinho pacote grande', categoriaOriginal: 'alimentacao', valor: 8.49, quantidade: 1, data: '2026-03-07', hora: '22:10', diaSemana: 'sabado' },
    { id: 's8', nome: 'Chocolate ao leite', categoriaOriginal: 'alimentacao', valor: 7.8, quantidade: 1, data: '2026-03-07', hora: '22:10', diaSemana: 'sabado' },
    { id: 's9', nome: 'Tomate italiano', categoriaOriginal: 'hortifruti', valor: 7.25, quantidade: 1.4, data: '2026-03-10', hora: '16:40', diaSemana: 'terca-feira' },
    { id: 's10', nome: 'Peito de frango resfriado', categoriaOriginal: 'acougue e frios', valor: 24.6, quantidade: 1.3, data: '2026-03-10', hora: '16:40', diaSemana: 'terca-feira' },
    { id: 's11', nome: 'Energetico lata', categoriaOriginal: 'bebidas', valor: 8.99, quantidade: 2, data: '2026-03-14', hora: '20:45', diaSemana: 'sabado' },
    { id: 's12', nome: 'Pizza congelada calabresa', categoriaOriginal: 'alimentacao', valor: 18.9, quantidade: 1, data: '2026-03-14', hora: '20:45', diaSemana: 'sabado' },
    { id: 's13', nome: 'Aveia em flocos', categoriaOriginal: 'alimentacao', valor: 5.6, quantidade: 1, data: '2026-03-18', hora: '09:25', diaSemana: 'quarta-feira' },
    { id: 's14', nome: 'Maca gala', categoriaOriginal: 'hortifruti', valor: 8.4, quantidade: 1.2, data: '2026-03-18', hora: '09:25', diaSemana: 'quarta-feira' },
    { id: 's15', nome: 'Achocolatado pronto', categoriaOriginal: 'bebidas', valor: 6.49, quantidade: 2, data: '2026-03-20', hora: '21:20', diaSemana: 'sexta-feira' },
    { id: 's16', nome: 'Nuggets congelado', categoriaOriginal: 'alimentacao', valor: 16.8, quantidade: 1, data: '2026-03-20', hora: '21:20', diaSemana: 'sexta-feira' },
    { id: 's17', nome: 'Pao integral', categoriaOriginal: 'padaria e lanches', valor: 9.9, quantidade: 1, data: '2026-03-21', hora: '08:40', diaSemana: 'sabado' },
    { id: 's18', nome: 'Queijo minas', categoriaOriginal: 'acougue e frios', valor: 13.7, quantidade: 1, data: '2026-03-21', hora: '08:40', diaSemana: 'sabado' }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'pt-BR');
const safeNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const safeDivide = (numerator, denominator) => (denominator > 0 ? numerator / denominator : 0);
const formatPercent = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;

export const normalizeFoodText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const toDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (value) => {
    const date = toDate(value) || new Date();
    date.setHours(0, 0, 0, 0);
    return date;
};

const endOfDay = (value) => {
    const date = toDate(value) || new Date();
    date.setHours(23, 59, 59, 999);
    return date;
};

const addDays = (value, amount) => {
    const date = new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
};

const getMonthKey = (value) => {
    const date = toDate(value);
    if (!date) return '';

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getWeekKey = (value) => {
    const date = startOfDay(value);
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = addDays(date, mondayOffset);
    return `${monday.getFullYear()}-W${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
};

const getWeekdayDescriptor = (date, fallbackLabel = '') => {
    const safeDate = toDate(date);
    if (!safeDate) {
        const normalizedFallback = normalizeFoodText(fallbackLabel);
        return WEEKDAY_OPTIONS.find((item) => item.key === normalizedFallback) || WEEKDAY_OPTIONS[0];
    }

    return WEEKDAY_OPTIONS.find((item) => item.index === safeDate.getDay()) || WEEKDAY_OPTIONS[0];
};

const getTimeBucket = (hour) => (
    PERIOD_BUCKETS.find((bucket) => hour >= bucket.start && hour <= bucket.end) || PERIOD_BUCKETS[0]
);

const extractHour = (date, explicitTime = '') => {
    const normalizedTime = String(explicitTime || '').trim();
    if (/^\d{1,2}:\d{2}/.test(normalizedTime)) {
        return clamp(parseInt(normalizedTime.split(':')[0], 10), 0, 23);
    }

    const safeDate = toDate(date);
    return safeDate ? safeDate.getHours() : 12;
};

const buildDateWithOptionalTime = (dateValue, timeValue = '') => {
    const explicitDate = String(dateValue || '').trim();
    const explicitTime = String(timeValue || '').trim();

    if (!explicitDate) {
        return null;
    }

    if (explicitDate.includes('T')) {
        return toDate(explicitDate);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate) && /^\d{1,2}:\d{2}/.test(explicitTime)) {
        return toDate(`${explicitDate}T${explicitTime}:00`);
    }

    return toDate(explicitDate);
};

const hasKeyword = (normalizedText, keywordList = []) => keywordList.some((keyword) => normalizedText.includes(keyword));

const detectSugarGroup = (normalizedText) => {
    const match = RESOLVED_SUGAR_GROUPS.find((group) => hasKeyword(normalizedText, group.keywords));
    return match?.group || '';
};

const buildFoodClassificationOverridesMap = (overrides = []) => {
    const map = new Map();

    overrides.forEach((override) => {
        const normalizedKey = normalizeFoodText(override?.key || override?.normalizedName || override?.displayName || override?.name);
        const classification = String(override?.classification || '').trim();

        if (!normalizedKey || !MANUAL_CLASSIFICATION_VALUES.has(classification)) {
            return;
        }

        map.set(normalizedKey, {
            ...override,
            key: normalizedKey,
            classification
        });
    });

    return map;
};

export const identifyFoodClassification = (productName = '', categoryOriginal = '', foodClassificationOverridesMap = new Map(), originalName = '') => {
    const normalizedName = normalizeFoodText(productName);
    const normalizedOriginalName = normalizeFoodText(originalName);
    const normalizedCategory = normalizeFoodText(categoryOriginal);
    const searchableText = `${normalizedName} ${normalizedCategory}`.trim();

    const matchedNatural = ALL_NATURAL_KEYWORDS.filter((keyword) => searchableText.includes(keyword));
    const matchedModerate = ALL_MODERATE_KEYWORDS.filter((keyword) => searchableText.includes(keyword));
    const matchedUltra = ALL_ULTRAPROCESSED_KEYWORDS.filter((keyword) => searchableText.includes(keyword));
    const matchedSugar = SUGARY_KEYWORDS.filter((keyword) => searchableText.includes(keyword));
    const manualOverride = foodClassificationOverridesMap.get(normalizedName)
        || foodClassificationOverridesMap.get(normalizedOriginalName);

    if (manualOverride) {
        if (manualOverride.classification === 'non_food') {
            return {
                level: 'unknown',
                levelLabel: FOOD_LEVEL_LABELS.unknown,
                isFoodCandidate: false,
                isSugary: false,
                isUltraProcessed: false,
                isJunkFood: false,
                sugarGroup: '',
                matchedKeywords: [],
                classificationSource: 'manual',
                requiresReview: false,
                manualClassification: 'non_food'
            };
        }

        return {
            level: manualOverride.classification,
            levelLabel: FOOD_LEVEL_LABELS[manualOverride.classification] || FOOD_LEVEL_LABELS.unknown,
            isFoodCandidate: true,
            isSugary: matchedSugar.length > 0,
            isUltraProcessed: manualOverride.classification === 'ultraprocessed' || matchedSugar.length > 0,
            isJunkFood: hasKeyword(searchableText, JUNK_FOOD_KEYWORDS),
            sugarGroup: detectSugarGroup(searchableText),
            matchedKeywords: [...matchedNatural, ...matchedModerate, ...matchedUltra, ...matchedSugar],
            classificationSource: 'manual',
            requiresReview: false,
            manualClassification: manualOverride.classification
        };
    }

    let level = 'unknown';
    if (matchedUltra.length > 0 || matchedSugar.length > 0) {
        level = 'ultraprocessed';
    } else if (matchedNatural.length > 0) {
        level = 'natural';
    } else if (matchedModerate.length > 0) {
        level = 'moderate';
    } else if (normalizedCategory === 'hortifruti') {
        level = 'natural';
    } else if (normalizedCategory === 'acougue e frios' || normalizedCategory === 'padaria e lanches') {
        level = 'moderate';
    }

    const isFoodCandidate = level !== 'unknown' || FOOD_RELATED_CATEGORY_HINTS.has(normalizedCategory);
    const requiresReview = level === 'unknown';

    return {
        level,
        levelLabel: FOOD_LEVEL_LABELS[level] || FOOD_LEVEL_LABELS.unknown,
        isFoodCandidate,
        isSugary: matchedSugar.length > 0,
        isUltraProcessed: level === 'ultraprocessed',
        isJunkFood: hasKeyword(searchableText, JUNK_FOOD_KEYWORDS),
        sugarGroup: detectSugarGroup(searchableText),
        matchedKeywords: [...matchedNatural, ...matchedModerate, ...matchedUltra, ...matchedSugar],
        classificationSource: 'heuristic',
        requiresReview,
        manualClassification: ''
    };
};

export const identifySugarRisk = (productName = '', categoryOriginal = '') => (
    identifyFoodClassification(productName, categoryOriginal).isSugary
);

export const identifyUltraProcessed = (productName = '', categoryOriginal = '') => (
    identifyFoodClassification(productName, categoryOriginal).isUltraProcessed
);

const buildAppFoodSourceItems = ({ receipts = [], products = [], productAliases = [] }) => {
    const receiptMap = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const grouping = buildProductGrouping({ products, aliases: productAliases });

    return products
        .map((product) => {
            const receipt = receiptMap.get(product.receiptId);
            if (!receipt) {
                return null;
            }

            const receiptDate = toDate(receipt.date);
            if (!receiptDate) {
                return null;
            }

            const productGroup = getProductGroup(grouping, product.name);
            const weekday = getWeekdayDescriptor(receiptDate);

            return {
                id: `app-${product.id}`,
                purchaseKey: String(product.receiptId),
                nome: productGroup.displayName || product.name || 'Produto sem nome',
                nomeOriginal: product.name || productGroup.displayName || 'Produto sem nome',
                categoriaOriginal: product.category || 'Outros',
                valor: safeNumber(product.totalValue, safeNumber(product.unitPrice) * safeNumber(product.quantity, 1)),
                quantidade: safeNumber(product.quantity, 1),
                precoUnitario: safeNumber(product.unitPrice),
                data: receiptDate.toISOString(),
                hora: `${String(receiptDate.getHours()).padStart(2, '0')}:${String(receiptDate.getMinutes()).padStart(2, '0')}`,
                diaSemana: weekday.key,
                estabelecimento: receipt.establishment || 'Outros'
            };
        })
        .filter(Boolean);
};

const normalizeExternalItems = (items = []) => (
    items.map((item, index) => {
        const builtDate = buildDateWithOptionalTime(item.data || item.date, item.hora || item.time);
        const weekday = getWeekdayDescriptor(builtDate, item.diaSemana || item.weekday);
        const quantity = safeNumber(item.quantidade ?? item.quantity, 1);
        const totalValue = safeNumber(item.valor ?? item.value ?? item.totalValue);
        const unitPrice = safeNumber(item.precoUnitario ?? item.unitPrice, quantity > 0 ? totalValue / quantity : totalValue);

        return {
            id: item.id || `sample-${index + 1}`,
            purchaseKey: String(item.purchaseKey || `${item.data || item.date || 'sem-data'}-${item.hora || item.time || index}`),
            nome: item.nome || item.name || 'Item sem nome',
            nomeOriginal: item.nome || item.name || 'Item sem nome',
            categoriaOriginal: item.categoriaOriginal || item.categoryOriginal || item.category || 'Outros',
            valor: totalValue,
            quantidade: quantity,
            precoUnitario: unitPrice,
            data: builtDate ? builtDate.toISOString() : '',
            hora: item.hora || item.time || '',
            diaSemana: weekday.key,
            estabelecimento: item.estabelecimento || item.store || 'Nao informado'
        };
    })
);

export const buildFoodPurchaseItems = ({
    items = null,
    receipts = [],
    products = [],
    productAliases = [],
    foodClassificationOverrides = []
} = {}) => {
    const sourceItems = Array.isArray(items)
        ? normalizeExternalItems(items)
        : buildAppFoodSourceItems({ receipts, products, productAliases });
    const foodClassificationOverridesMap = buildFoodClassificationOverridesMap(foodClassificationOverrides);

    return sourceItems
        .map((item) => {
            const classification = identifyFoodClassification(
                item.nome,
                item.categoriaOriginal,
                foodClassificationOverridesMap,
                item.nomeOriginal
            );

            const itemDate = buildDateWithOptionalTime(item.data, item.hora);
            if (!itemDate) {
                return null;
            }

            const weekday = getWeekdayDescriptor(itemDate, item.diaSemana);
            const hour = extractHour(itemDate, item.hora);
            const timeBucket = getTimeBucket(hour);
            const totalValue = safeNumber(item.valor);
            const quantity = safeNumber(item.quantidade, 1);

            return {
                id: item.id,
                purchaseKey: String(item.purchaseKey || item.id),
                displayName: item.nome,
                originalName: item.nomeOriginal,
                normalizedName: normalizeFoodText(item.nome),
                normalizedOriginalName: normalizeFoodText(item.nomeOriginal),
                categoryOriginal: item.categoriaOriginal,
                normalizedCategory: normalizeFoodText(item.categoriaOriginal),
                totalValue,
                quantity,
                unitPrice: safeNumber(item.precoUnitario, quantity > 0 ? totalValue / quantity : totalValue),
                date: itemDate.toISOString(),
                dateKey: itemDate.toISOString().slice(0, 10),
                monthKey: getMonthKey(itemDate),
                weekKey: getWeekKey(itemDate),
                weekdayKey: weekday.key,
                weekdayLabel: weekday.label,
                weekdayShortLabel: weekday.shortLabel,
                hour,
                timeBucketKey: timeBucket.key,
                timeBucketLabel: timeBucket.label,
                isNight: hour >= 20,
                isWeekend: weekday.index === 0 || weekday.index === 6,
                establishment: item.estabelecimento || 'Nao informado',
                foodLevel: classification.level,
                foodLevelLabel: classification.levelLabel,
                isFoodCandidate: classification.isFoodCandidate,
                isSugary: classification.isSugary,
                isUltraProcessed: classification.isUltraProcessed,
                isJunkFood: classification.isJunkFood,
                classificationSource: classification.classificationSource,
                requiresReview: classification.requiresReview,
                manualClassification: classification.manualClassification || '',
                reviewKey: normalizeFoodText(item.nome) || normalizeFoodText(item.nomeOriginal),
                sugarGroup: classification.sugarGroup || 'Outros itens açucarados'
            };
        })
        .filter(Boolean);
};

const buildItemStats = (items = [], referenceDate = new Date()) => {
    const statsMap = new Map();
    const currentMonthKey = getMonthKey(referenceDate);

    items.forEach((item) => {
        const key = item.normalizedName || normalizeFoodText(item.displayName);
        if (!statsMap.has(key)) {
            statsMap.set(key, {
                key,
                displayName: item.displayName,
                foodLevel: item.foodLevel,
                foodLevelLabel: item.foodLevelLabel,
                occurrences: 0,
                totalSpend: 0,
                totalQuantity: 0,
                weeks: new Set(),
                months: new Set(),
                firstDate: item.date,
                lastDate: item.date,
                sugaryOccurrences: 0,
                ultraOccurrences: 0,
                junkOccurrences: 0,
                currentMonthOccurrences: 0
            });
        }

        const stat = statsMap.get(key);
        stat.occurrences += 1;
        stat.totalSpend += item.totalValue;
        stat.totalQuantity += item.quantity;
        stat.weeks.add(item.weekKey);
        stat.months.add(item.monthKey);
        stat.firstDate = compareText(item.date, stat.firstDate) < 0 ? item.date : stat.firstDate;
        stat.lastDate = compareText(item.date, stat.lastDate) > 0 ? item.date : stat.lastDate;
        if (item.isSugary) stat.sugaryOccurrences += 1;
        if (item.isUltraProcessed) stat.ultraOccurrences += 1;
        if (item.isJunkFood) stat.junkOccurrences += 1;
        if (item.monthKey === currentMonthKey) stat.currentMonthOccurrences += 1;
    });

    return Array.from(statsMap.values())
        .map((stat) => ({
            ...stat,
            averageSpend: safeDivide(stat.totalSpend, stat.occurrences),
            averageUnitPrice: safeDivide(stat.totalSpend, stat.totalQuantity),
            distinctWeeks: stat.weeks.size,
            distinctMonths: stat.months.size
        }))
        .sort((left, right) => right.totalSpend - left.totalSpend || right.occurrences - left.occurrences);
};

export const identifyRecurringFoodItem = (itemStat) => (
    Number(itemStat?.occurrences || 0) >= 3 || Number(itemStat?.distinctWeeks || 0) >= 2
);

export const identifyNewFoodItem = (itemStat, referenceDate = new Date()) => {
    const safeReferenceDate = endOfDay(referenceDate);
    const thirtyDaysAgo = addDays(startOfDay(safeReferenceDate), -29);
    const firstDate = toDate(itemStat?.firstDate);
    if (!firstDate) {
        return false;
    }

    return firstDate >= thirtyDaysAgo && Number(itemStat?.occurrences || 0) <= 2;
};

const buildUnclassifiedReviewItems = (items = []) => {
    const reviewMap = new Map();

    items
        .filter((item) => item.requiresReview)
        .forEach((item) => {
            const reviewKey = item.reviewKey || item.normalizedName || item.normalizedOriginalName;
            if (!reviewKey) {
                return;
            }

            if (!reviewMap.has(reviewKey)) {
                reviewMap.set(reviewKey, {
                    key: reviewKey,
                    displayName: item.displayName || item.originalName || 'Item sem nome',
                    occurrences: 0,
                    totalSpend: 0,
                    categories: new Set(),
                    exampleNames: new Set(),
                    lastDate: item.date,
                    lastEstablishment: item.establishment || 'Nao informado'
                });
            }

            const reviewItem = reviewMap.get(reviewKey);
            reviewItem.occurrences += 1;
            reviewItem.totalSpend += item.totalValue;
            reviewItem.categories.add(item.categoryOriginal || 'Outros');
            reviewItem.exampleNames.add(item.originalName || item.displayName || 'Item sem nome');
            reviewItem.lastDate = compareText(item.date, reviewItem.lastDate) > 0 ? item.date : reviewItem.lastDate;
            reviewItem.lastEstablishment = item.establishment || reviewItem.lastEstablishment;
        });

    return Array.from(reviewMap.values())
        .map((item) => ({
            key: item.key,
            displayName: item.displayName,
            occurrences: item.occurrences,
            totalSpend: item.totalSpend,
            categories: Array.from(item.categories).sort(compareText),
            exampleNames: Array.from(item.exampleNames).sort(compareText).slice(0, 3),
            lastDate: item.lastDate,
            lastEstablishment: item.lastEstablishment
        }))
        .sort((left, right) => (
            right.totalSpend - left.totalSpend
            || right.occurrences - left.occurrences
            || compareText(left.displayName, right.displayName)
        ));
};

const buildPurchaseEvents = (items = [], itemStatsMap = new Map()) => {
    const eventMap = new Map();

    items.forEach((item) => {
        if (!eventMap.has(item.purchaseKey)) {
            eventMap.set(item.purchaseKey, {
                id: item.purchaseKey,
                date: item.date,
                weekdayKey: item.weekdayKey,
                weekdayLabel: item.weekdayLabel,
                hour: item.hour,
                totalSpend: 0,
                items: [],
                categories: new Set(),
                newItemsCount: 0,
                recurringItemsCount: 0
            });
        }

        const event = eventMap.get(item.purchaseKey);
        event.totalSpend += item.totalValue;
        event.items.push(item);
        event.categories.add(item.foodLevel);

        const itemStat = itemStatsMap.get(item.normalizedName);
        if (identifyNewFoodItem(itemStat, item.date)) {
            event.newItemsCount += 1;
        }
        if (identifyRecurringFoodItem(itemStat)) {
            event.recurringItemsCount += 1;
        }
    });

    return Array.from(eventMap.values())
        .map((event) => {
            const totalItems = event.items.length;
            const sugaryItems = event.items.filter((item) => item.isSugary).length;
            const ultraItems = event.items.filter((item) => item.isUltraProcessed).length;
            const junkItems = event.items.filter((item) => item.isJunkFood).length;

            return {
                ...event,
                itemCount: totalItems,
                sugaryShare: safeDivide(sugaryItems, totalItems),
                ultraShare: safeDivide(ultraItems, totalItems),
                junkShare: safeDivide(junkItems, totalItems),
                nightPurchase: event.hour >= 20
            };
        })
        .sort((left, right) => compareText(left.date, right.date));
};

const sumItems = (items = [], selector = (item) => item) => items.reduce((sum, item) => sum + safeNumber(selector(item)), 0);

const buildSummaryFromItems = (items = [], referenceDate = new Date()) => {
    const totalSpend = sumItems(items, (item) => item.totalValue);
    const naturalSpend = sumItems(items.filter((item) => item.foodLevel === 'natural'), (item) => item.totalValue);
    const moderateSpend = sumItems(items.filter((item) => item.foodLevel === 'moderate'), (item) => item.totalValue);
    const ultraprocessedSpend = sumItems(items.filter((item) => item.foodLevel === 'ultraprocessed'), (item) => item.totalValue);
    const sugarySpend = sumItems(items.filter((item) => item.isSugary), (item) => item.totalValue);
    const junkSpend = sumItems(items.filter((item) => item.isJunkFood), (item) => item.totalValue);
    const currentMonthKey = getMonthKey(referenceDate);

    const summary = {
        totalSpend,
        itemCount: items.length,
        totalQuantity: sumItems(items, (item) => item.quantity),
        naturalSpend,
        moderateSpend,
        ultraprocessedSpend,
        sugarySpend,
        junkSpend,
        naturalPercentage: safeDivide(naturalSpend, totalSpend) * 100,
        moderatePercentage: safeDivide(moderateSpend, totalSpend) * 100,
        ultraprocessedPercentage: safeDivide(ultraprocessedSpend, totalSpend) * 100,
        sugaryPercentage: safeDivide(sugarySpend, totalSpend) * 100,
        junkPercentage: safeDivide(junkSpend, totalSpend) * 100,
        currentMonthItems: items.filter((item) => item.monthKey === currentMonthKey).length
    };

    const qualityIndex = clamp(
        Math.round(
            50
            + (summary.naturalPercentage * 0.55)
            + (summary.moderatePercentage * 0.18)
            - (summary.ultraprocessedPercentage * 0.62)
            - (summary.sugaryPercentage * 0.28)
            - (summary.junkPercentage * 0.22)
        ),
        0,
        100
    );

    return {
        ...summary,
        qualityIndex
    };
};

const buildComparableMonthWindows = (referenceDate = new Date()) => {
    const safeReferenceDate = toDate(referenceDate) || new Date();
    const currentStart = new Date(safeReferenceDate.getFullYear(), safeReferenceDate.getMonth(), 1);
    const currentEnd = endOfDay(safeReferenceDate);
    const previousMonthDate = new Date(safeReferenceDate.getFullYear(), safeReferenceDate.getMonth() - 1, 1);
    const comparableDay = Math.min(
        safeReferenceDate.getDate(),
        new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1, 0).getDate()
    );

    return {
        current: { label: 'Mes atual', start: currentStart, end: currentEnd },
        previous: {
            label: 'Mes anterior',
            start: previousMonthDate,
            end: endOfDay(new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth(), comparableDay))
        }
    };
};

const buildComparableWeekWindows = (referenceDate = new Date()) => {
    const safeReferenceDate = startOfDay(referenceDate);
    const day = safeReferenceDate.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const currentStart = addDays(safeReferenceDate, mondayOffset);
    const elapsedDays = Math.floor((safeReferenceDate.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const previousStart = addDays(currentStart, -7);

    return {
        current: { label: 'Semana atual', start: currentStart, end: endOfDay(safeReferenceDate) },
        previous: { label: 'Semana anterior', start: previousStart, end: endOfDay(addDays(previousStart, elapsedDays - 1)) }
    };
};

const buildRollingWindows = (referenceDate = new Date(), days = 30) => {
    const safeReferenceDate = endOfDay(referenceDate);
    const currentStart = addDays(startOfDay(safeReferenceDate), -(days - 1));
    const previousEnd = addDays(startOfDay(currentStart), -1);
    const previousStart = addDays(startOfDay(previousEnd), -(days - 1));

    return {
        current: { label: `Ultimos ${days} dias`, start: currentStart, end: safeReferenceDate },
        previous: { label: `${days} dias anteriores`, start: previousStart, end: endOfDay(previousEnd) }
    };
};

const filterItemsByWindow = (items = [], window = {}) => {
    const start = startOfDay(window.start);
    const end = endOfDay(window.end);
    return items.filter((item) => {
        const itemDate = toDate(item.date);
        return itemDate && itemDate >= start && itemDate <= end;
    });
};

const buildTrendComparison = (currentSummary, previousSummary, label) => {
    const previousIndex = Number(previousSummary?.qualityIndex || 0);
    const currentIndex = Number(currentSummary?.qualityIndex || 0);
    const variationPercent = previousIndex > 0
        ? ((currentIndex - previousIndex) / previousIndex) * 100
        : 0;

    const lowerLabel = label.toLowerCase();
    const targetPreposition = lowerLabel.startsWith('semana') ? 'na' : 'no';
    const currentScore = Math.round(currentIndex);
    const prevScore = Math.round(previousIndex);

    let direction = 'stable';
    let message = `A qualidade das suas compras manteve um padrao estavel ${targetPreposition} ${lowerLabel}. Seu indice nutricional seguiu proximo de ${currentScore}/100.`;

    if (variationPercent <= -5) {
        direction = 'worse';
        message = `Alerta nutricional: o indice de qualidade da sua alimentacao sofreu uma queda de ${Math.abs(variationPercent).toFixed(0)}% ${targetPreposition} ${lowerLabel} (caiu de ${prevScore} para ${currentScore}/100 pontos). Esse recuo aponta um consumo proporcional maior de ultraprocessados, junk food ou itens com muito açucar.`;
    } else if (variationPercent >= 5) {
        direction = 'better';
        message = `Evolucao nutricional: o indice de qualidade da sua alimentacao teve um salto positivo de ${Math.abs(variationPercent).toFixed(0)}% ${targetPreposition} ${lowerLabel} (subiu de ${prevScore} para ${currentScore}/100 pontos). Isso reflete reducao de processados e fortalecimento da base in natura nas compras.`;
    }

    return {
        label,
        direction,
        variationPercent,
        message,
        currentIndex,
        previousIndex,
        current: currentSummary,
        previous: previousSummary
    };
};

const buildDistributionByHour = (items = []) => PERIOD_BUCKETS.map((bucket) => {
    const bucketItems = items.filter((item) => item.timeBucketKey === bucket.key);
    const totalSpend = sumItems(bucketItems, (item) => item.totalValue);

    return {
        key: bucket.key,
        name: bucket.label,
        itemCount: bucketItems.length,
        totalSpend,
        sugaryShare: safeDivide(bucketItems.filter((item) => item.isSugary).length, bucketItems.length),
        ultraprocessedShare: safeDivide(bucketItems.filter((item) => item.isUltraProcessed).length, bucketItems.length)
    };
});

const buildDistributionByWeekday = (items = []) => WEEKDAY_OPTIONS.map((weekday) => {
    const weekdayItems = items.filter((item) => item.weekdayKey === weekday.key);
    const totalSpend = sumItems(weekdayItems, (item) => item.totalValue);

    return {
        key: weekday.key,
        name: weekday.label,
        shortLabel: weekday.shortLabel,
        itemCount: weekdayItems.length,
        totalSpend,
        sugaryShare: safeDivide(weekdayItems.filter((item) => item.isSugary).length, weekdayItems.length),
        ultraprocessedShare: safeDivide(weekdayItems.filter((item) => item.isUltraProcessed).length, weekdayItems.length)
    };
});

const buildSugarAnalysis = (items = []) => {
    const totalFoodSpend = sumItems(items, (item) => item.totalValue);
    const sugaryItems = items.filter((item) => item.isSugary);
    const sugarySpend = sumItems(sugaryItems, (item) => item.totalValue);
    const score = safeDivide(sugarySpend, totalFoodSpend) * 100;

    let classification = 'baixo';
    if (score >= 25) {
        classification = 'alto';
    } else if (score >= 10) {
        classification = 'moderado';
    }

    const topItemsMap = new Map();
    const topGroupsMap = new Map();

    sugaryItems.forEach((item) => {
        if (!topItemsMap.has(item.normalizedName)) {
            topItemsMap.set(item.normalizedName, {
                name: item.displayName,
                totalSpend: 0,
                occurrences: 0
            });
        }
        topItemsMap.get(item.normalizedName).totalSpend += item.totalValue;
        topItemsMap.get(item.normalizedName).occurrences += 1;

        const sugarGroup = item.sugarGroup || 'Outros itens açucarados';
        topGroupsMap.set(sugarGroup, (topGroupsMap.get(sugarGroup) || 0) + item.totalValue);
    });

    const nighttimeSugarySpend = sumItems(sugaryItems.filter((item) => item.isNight), (item) => item.totalValue);

    return {
        score,
        classification,
        sugarySpend,
        topItems: Array.from(topItemsMap.values())
            .sort((left, right) => right.totalSpend - left.totalSpend || right.occurrences - left.occurrences)
            .slice(0, 8),
        topGroups: Array.from(topGroupsMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((left, right) => right.value - left.value),
        nighttimeSugaryShare: safeDivide(nighttimeSugarySpend, sugarySpend)
    };
};

const buildImpulsivityAnalysis = (items = [], purchaseEvents = [], itemStats = []) => {
    const averageTicket = safeDivide(sumItems(purchaseEvents, (event) => event.totalSpend), purchaseEvents.length);
    const recurringKeys = new Set(itemStats.filter(identifyRecurringFoodItem).map((item) => item.key));
    const unusualLevelThreshold = 0.18;
    const levelFrequency = {
        natural: safeDivide(items.filter((item) => item.foodLevel === 'natural').length, items.length),
        moderate: safeDivide(items.filter((item) => item.foodLevel === 'moderate').length, items.length),
        ultraprocessed: safeDivide(items.filter((item) => item.foodLevel === 'ultraprocessed').length, items.length)
    };

    const flaggedPurchases = purchaseEvents.map((event) => {
        let score = 0;
        const reasons = [];
        const eventLevels = ['natural', 'moderate', 'ultraprocessed'].filter((level) => event.items.some((item) => item.foodLevel === level));

        const hasUnusualCategory = eventLevels.some((level) => levelFrequency[level] < unusualLevelThreshold);
        if (hasUnusualCategory || event.ultraShare >= 0.65) {
            score += 2;
            reasons.push('Compra fora do padrao historico');
        }

        if (event.nightPurchase) {
            score += 1;
            reasons.push('Compra apos 20h');
            if ((event.sugaryShare + event.junkShare) >= 0.6) {
                score += 1;
                reasons.push('Noite com muitos doces ou junk food');
            }
        }

        if (averageTicket > 0 && event.totalSpend > averageTicket * 1.3) {
            score += 2;
            reasons.push('Ticket acima de 30% da media');
        }

        const newItemsInEvent = event.items.filter((item) => !recurringKeys.has(item.normalizedName)).length;
        if (newItemsInEvent >= 2) {
            score += 2;
            reasons.push('Itens novos nao recorrentes');
        } else if (newItemsInEvent === 1) {
            score += 1;
            reasons.push('Item novo nao recorrente');
        }

        let classification = 'baixo';
        if (score >= 6) {
            classification = 'alto';
        } else if (score >= 3) {
            classification = 'moderado';
        }

        return {
            id: event.id,
            date: event.date,
            weekdayLabel: event.weekdayLabel,
            totalSpend: event.totalSpend,
            score,
            classification,
            reasons,
            nightPurchase: event.nightPurchase
        };
    });

    const averageScore = safeDivide(sumItems(flaggedPurchases, (purchase) => purchase.score), flaggedPurchases.length);
    const saturdayHighRisk = flaggedPurchases.filter((purchase) => purchase.weekdayLabel === 'Sabado' && purchase.score >= 3);
    const nighttimeHighRisk = flaggedPurchases.filter((purchase) => purchase.nightPurchase && purchase.score >= 3);

    let classification = 'baixo';
    if (averageScore >= 6) {
        classification = 'alto';
    } else if (averageScore >= 3) {
        classification = 'moderado';
    }

    return {
        score: Number(averageScore.toFixed(1)),
        classification,
        averageTicket,
        flaggedPurchases: flaggedPurchases
            .sort((left, right) => right.score - left.score || compareText(right.date, left.date))
            .slice(0, 8),
        totalFlagged: flaggedPurchases.filter((purchase) => purchase.score >= 3).length,
        saturdayPattern: saturdayHighRisk.length >= 2,
        nighttimePattern: nighttimeHighRisk.length >= 2
    };
};

const buildBehaviorIndicators = (items = [], purchaseEvents = []) => {
    const distinctWeeks = new Set(items.map((item) => item.weekKey)).size || 1;
    const distinctMonths = new Set(items.map((item) => item.monthKey)).size || 1;
    const ultraprocessedItems = items.filter((item) => item.isUltraProcessed);
    const sugaryItems = items.filter((item) => item.isSugary);
    const averageTicketByType = ['natural', 'moderate', 'ultraprocessed'].map((level) => {
        const levelItems = items.filter((item) => item.foodLevel === level);
        return {
            key: level,
            name: FOOD_LEVEL_LABELS[level],
            value: safeDivide(sumItems(levelItems, (item) => item.totalValue), levelItems.length)
        };
    });

    const hourDistribution = buildDistributionByHour(items);
    const weekdayDistribution = buildDistributionByWeekday(items);
    const daySpend = weekdayDistribution.reduce((best, current) => (current.totalSpend > best.totalSpend ? current : best), { totalSpend: 0, name: 'Sem dados' });
    const nightSugaryShare = safeDivide(sugaryItems.filter((item) => item.isNight).length, sugaryItems.length);
    const weekendBadShare = safeDivide(
        items.filter((item) => item.isWeekend && (item.isUltraProcessed || item.isSugary)).length,
        items.filter((item) => item.isWeekend).length
    );

    const detectedPatterns = [];
    if (nightSugaryShare >= 0.45) detectedPatterns.push('As compras noturnas concentram muitos itens açucarados.');
    if (weekendBadShare >= 0.45) detectedPatterns.push('Sabados e domingos concentram itens ruins com frequencia relevante.');
    if (daySpend.totalSpend > 0) detectedPatterns.push(`${daySpend.name} e o dia da semana com maior gasto alimentar.`);
    if (purchaseEvents.filter((event) => event.nightPurchase).length >= 2) detectedPatterns.push('Compras apos 20h fazem parte do comportamento habitual recente.');

    return {
        weeklyUltraprocessedFrequency: safeDivide(ultraprocessedItems.length, distinctWeeks),
        monthlySugaryFrequency: safeDivide(sugaryItems.length, distinctMonths),
        averageTicketByType,
        hourDistribution,
        weekdayDistribution,
        nightSugaryShare,
        weekendBadShare,
        detectedPatterns
    };
};

const buildAutomaticAlerts = ({ monthTrend, weekTrend, sugarAnalysis, impulsivity, behaviorIndicators, pendingReviewCount = 0 }) => {
    const alerts = [];

    if (monthTrend.direction === 'worse' || monthTrend.direction === 'better') {
        alerts.push(withInsightWhy(
            monthTrend.message,
            `o comparativo mensal saiu de ${Math.round(monthTrend.previousIndex)} para ${Math.round(monthTrend.currentIndex)} pontos e alterou a qualidade media da cesta`
        ));
    }
    if (weekTrend.direction === 'worse' && monthTrend.direction !== 'worse') {
        alerts.push(withInsightWhy(
            weekTrend.message,
            `na leitura semanal houve queda de ${Math.round(weekTrend.previousIndex)} para ${Math.round(weekTrend.currentIndex)} pontos, mesmo sem piora mensal dominante`
        ));
    }

    if (sugarAnalysis.classification === 'alto') {
        alerts.push(withInsightWhy(
            `Alerta de acucar: seu consumo de itens acucarados e doces atingiu ${formatPercent(sugarAnalysis.score)}, um nivel considerado alto para o periodo`,
            'a participacao de doces e produtos adocicados ficou acima da faixa de seguranca e tende a reduzir a qualidade nutricional do ciclo'
        ));
    } else if (sugarAnalysis.classification === 'moderado') {
        alerts.push(withInsightWhy(
            `Sinal amarelo: os doces e itens com acucar representam ${formatPercent(sugarAnalysis.score)} das compras alimentares`,
            'essa fatia ja e relevante o bastante para merecer acompanhamento antes de virar excesso'
        ));
    }

    if (behaviorIndicators.nightSugaryShare >= 0.45) {
        alerts.push(withInsightWhy(
            `Padrao noturno: detectamos que ${formatPercent(behaviorIndicators.nightSugaryShare)} dos itens acucarados sao comprados a noite`,
            'a concentracao desse tipo de compra no periodo noturno costuma indicar decisao mais impulsiva ou compra por cansaco'
        ));
    }
    if (behaviorIndicators.weekendBadShare >= 0.45) {
        alerts.push(withInsightWhy(
            `Padrao de fim de semana: houve concentracao de ${(behaviorIndicators.weekendBadShare * 100).toFixed(0)}% de ultraprocessados e doces entre sexta e domingo`,
            'os dias de lazer estao puxando uma parte importante das compras para itens de menor qualidade nutricional'
        ));
    }

    if (impulsivity.classification === 'alto') {
        alerts.push(withInsightWhy(
            `Risco de impulsividade: o algoritmo identificou um padrao de compra reativo (score ${impulsivity.score.toFixed(1)}/10)`,
            'as compras sinalizadas reunem combinacoes como horario noturno, ticket acima da media, itens novos e produtos de prazer imediato'
        ));
    } else if (impulsivity.totalFlagged >= 2) {
        alerts.push(withInsightWhy(
            'Atencao: algumas compras esporadicas fora do padrao estao elevando o ticket de lanches e doces',
            `o modelo marcou ${impulsivity.totalFlagged} episodio(s) com sinais de desvio em relacao ao seu comportamento habitual`
        ));
    }

    if (impulsivity.nighttimePattern) {
        alerts.push(withInsightWhy(
            'Habito detectado: voce costuma comprar junk food ou snacks no periodo noturno',
            'houve repeticao recente desse comportamento em horarios em que a compra tende a ser menos planejada'
        ));
    }
    if (impulsivity.saturdayPattern) {
        alerts.push(withInsightWhy(
            'Foco no sabado: existe um padrao recorrente de compra impulsiva ou de baixo valor nutricional aos sabados',
            'o sabado apareceu repetidamente entre as compras sinalizadas com pior perfil nutricional ou maior impulso'
        ));
    }

    if (pendingReviewCount > 0) {
        alerts.push(withInsightWhy(
            `Transparencia: ha ${pendingReviewCount} item(ns) aguardando classificacao manual para que a analise alimentar seja 100% precisa`,
            'sem essa revisao parte da base ainda pode ficar fora da classificacao ideal entre natural, moderado e ultraprocessado'
        ));
    }

    return Array.from(new Set(alerts));
};

const buildExecutiveSummary = ({ monthTrend, sugarAnalysis, impulsivity, behaviorIndicators, alerts = [], pendingReviewCount = 0 }) => {
    const lines = [];

    lines.push(withInsightWhy(
        monthTrend.message,
        `o comparativo mensal saiu de ${Math.round(monthTrend.previousIndex)} para ${Math.round(monthTrend.currentIndex)} pontos e resume a mudanca da qualidade media das compras`
    ));

    if (sugarAnalysis.classification === 'alto') {
        lines.push(withInsightWhy(
            `O impacto do acucar (${formatPercent(sugarAnalysis.score)}) ficou acima da faixa de seguranca`,
            'doces, bebidas adocicadas e confeitaria ocuparam uma parcela alta demais do gasto alimentar do periodo'
        ));
    } else if (sugarAnalysis.classification === 'moderado') {
        lines.push(withInsightWhy(
            `O consumo de acucar (${formatPercent(sugarAnalysis.score)}) exige atencao moderada`,
            'ja existe incidencia relevante de bebidas e confeitaria nas compras do periodo'
        ));
    } else {
        lines.push(withInsightWhy(
            `O score de acucar (${formatPercent(sugarAnalysis.score)}) esta sob controle e dentro dos limites recomendados para o periodo`,
            'a participacao de itens muito adocicados ficou baixa dentro da cesta alimentar analisada'
        ));
    }

    if (behaviorIndicators.detectedPatterns.length > 0) {
        lines.push(withInsightWhy(
            `Observacao de habito: ${behaviorIndicators.detectedPatterns[0]}`,
            'esse padrao apareceu de forma repetida quando o algoritmo cruzou horario, dia da semana e composicao das compras'
        ));
    }

    if (impulsivity.classification === 'alto') {
        lines.push(withInsightWhy(
            `Identificamos alta probabilidade de compras por impulso (score ${impulsivity.score.toFixed(1)}/10) afetando a qualidade e o orcamento`,
            'varios eventos recentes reuniram sinais de compra reativa, como horario, ticket acima da media e itens fora do padrao'
        ));
    } else if (impulsivity.classification === 'moderado') {
        lines.push(withInsightWhy(
            `Ha sinais moderados de compras reativas (score ${impulsivity.score.toFixed(1)}/10) que merecem acompanhamento`,
            'o algoritmo encontrou episodios suficientes para indicar risco, mesmo sem caracterizar um padrao forte'
        ));
    } else {
        lines.push(withInsightWhy(
            'O padrao de compra mantem-se estruturado, sem sinais relevantes de impulsividade ou gastos reativos',
            'as compras recentes ficaram mais proximas do comportamento historico, sem concentracao relevante de eventos de risco'
        ));
    }

    if (pendingReviewCount > 0) {
        lines.push(withInsightWhy(
            `Nota de transparencia: ${pendingReviewCount} item(ns) ainda dependem de classificacao manual para refinar o calculo final de qualidade`,
            'esses registros podem alterar a distribuicao final entre itens naturais, moderados e ultraprocessados'
        ));
    }

    return {
        headline: alerts[0] || monthTrend.message,
        lines
    };
};

const buildCategorySpend = (items = []) => {
    const categoryMap = new Map();
    items.forEach((item) => {
        const key = item.categoryOriginal || 'Outros';
        categoryMap.set(key, (categoryMap.get(key) || 0) + item.totalValue);
    });

    return Array.from(categoryMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => right.value - left.value);
};

export const analyzeFoodPurchases = ({
    items = null,
    receipts = [],
    products = [],
    productAliases = [],
    foodClassificationOverrides = [],
    referenceDate = new Date()
} = {}) => {
    const safeReferenceDate = toDate(referenceDate) || new Date();
    const processedItems = buildFoodPurchaseItems({
        items,
        receipts,
        products,
        productAliases,
        foodClassificationOverrides
    });
    const unclassifiedItems = buildUnclassifiedReviewItems(processedItems);
    const normalizedItems = processedItems.filter((item) => item.isFoodCandidate && item.foodLevel !== 'unknown');
    const itemStats = buildItemStats(normalizedItems, safeReferenceDate);
    const itemStatsMap = new Map(itemStats.map((item) => [item.key, item]));
    const purchaseEvents = buildPurchaseEvents(normalizedItems, itemStatsMap);

    const monthWindows = buildComparableMonthWindows(safeReferenceDate);
    const weekWindows = buildComparableWeekWindows(safeReferenceDate);
    const rollingWindows = buildRollingWindows(safeReferenceDate, 30);

    const overallSummary = buildSummaryFromItems(normalizedItems, safeReferenceDate);
    const currentMonthSummary = buildSummaryFromItems(filterItemsByWindow(normalizedItems, monthWindows.current), safeReferenceDate);
    const previousMonthSummary = buildSummaryFromItems(filterItemsByWindow(normalizedItems, monthWindows.previous), safeReferenceDate);
    const currentWeekSummary = buildSummaryFromItems(filterItemsByWindow(normalizedItems, weekWindows.current), safeReferenceDate);
    const previousWeekSummary = buildSummaryFromItems(filterItemsByWindow(normalizedItems, weekWindows.previous), safeReferenceDate);
    const currentRollingSummary = buildSummaryFromItems(filterItemsByWindow(normalizedItems, rollingWindows.current), safeReferenceDate);
    const previousRollingSummary = buildSummaryFromItems(filterItemsByWindow(normalizedItems, rollingWindows.previous), safeReferenceDate);

    const monthTrend = buildTrendComparison(currentMonthSummary, previousMonthSummary, 'Mes atual');
    const weekTrend = buildTrendComparison(currentWeekSummary, previousWeekSummary, 'Semana atual');
    const rollingTrend = buildTrendComparison(currentRollingSummary, previousRollingSummary, 'Periodo atual');

    const sugarAnalysis = buildSugarAnalysis(
        currentMonthSummary.itemCount > 0
            ? filterItemsByWindow(normalizedItems, monthWindows.current)
            : normalizedItems
    );
    const impulsivity = buildImpulsivityAnalysis(normalizedItems, purchaseEvents, itemStats);
    const behaviorIndicators = buildBehaviorIndicators(normalizedItems, purchaseEvents);
    const alerts = buildAutomaticAlerts({
        monthTrend,
        weekTrend,
        sugarAnalysis,
        impulsivity,
        behaviorIndicators,
        pendingReviewCount: unclassifiedItems.length
    });
    const summary = buildExecutiveSummary({
        monthTrend,
        sugarAnalysis,
        impulsivity,
        behaviorIndicators,
        alerts,
        pendingReviewCount: unclassifiedItems.length
    });

    const recurringItems = itemStats
        .filter(identifyRecurringFoodItem)
        .sort((left, right) => right.occurrences - left.occurrences || right.totalSpend - left.totalSpend)
        .slice(0, 10);
    const newItems = itemStats
        .filter((item) => identifyNewFoodItem(item, safeReferenceDate))
        .slice(0, 10);
    const sugaryFrequentItems = itemStats
        .filter((item) => item.sugaryOccurrences > 0)
        .sort((left, right) => right.sugaryOccurrences - left.sugaryOccurrences || right.totalSpend - left.totalSpend)
        .slice(0, 10);

    return {
        meta: {
            generatedAt: new Date().toISOString(),
            referenceDate: safeReferenceDate.toISOString(),
            totalProcessedItems: processedItems.length,
            totalItemsAnalyzed: normalizedItems.length,
            pendingReviewCount: unclassifiedItems.length,
            totalPurchases: purchaseEvents.length,
            dataSource: Array.isArray(items) ? 'manual_items' : 'app_database'
        },
        totals: {
            totalSpend: overallSummary.totalSpend,
            totalSpendByFoodCategory: buildCategorySpend(normalizedItems),
            pendingReviewSpend: sumItems(processedItems.filter((item) => item.requiresReview), (item) => item.totalValue),
            totalSpendByLevel: [
                { name: FOOD_LEVEL_LABELS.natural, key: 'natural', value: overallSummary.naturalSpend },
                { name: FOOD_LEVEL_LABELS.moderate, key: 'moderate', value: overallSummary.moderateSpend },
                { name: FOOD_LEVEL_LABELS.ultraprocessed, key: 'ultraprocessed', value: overallSummary.ultraprocessedSpend },
                { name: FOOD_LEVEL_LABELS.unknown, key: 'unknown', value: 0 }
            ]
        },
        percentages: {
            natural: overallSummary.naturalPercentage,
            moderate: overallSummary.moderatePercentage,
            ultraprocessed: overallSummary.ultraprocessedPercentage,
            sugary: overallSummary.sugaryPercentage
        },
        sugar: sugarAnalysis,
        impulsivity,
        trend: {
            direction: monthTrend.direction,
            percentChange: monthTrend.variationPercent,
            message: withInsightWhy(
                monthTrend.message,
                `o comparativo mensal saiu de ${Math.round(monthTrend.previousIndex)} para ${Math.round(monthTrend.currentIndex)} pontos e resume a mudanca da qualidade media das compras`
            ),
            currentMonth: currentMonthSummary,
            previousMonth: previousMonthSummary,
            currentWeek: currentWeekSummary,
            previousWeek: previousWeekSummary,
            currentRolling: currentRollingSummary,
            previousRolling: previousRollingSummary,
            monthComparison: monthTrend,
            weekComparison: weekTrend,
            rollingComparison: rollingTrend
        },
        forecast: {
            weeklyUltraprocessedFrequency: behaviorIndicators.weeklyUltraprocessedFrequency,
            monthlySugaryFrequency: behaviorIndicators.monthlySugaryFrequency,
            averageTicketByType: behaviorIndicators.averageTicketByType,
            hourDistribution: behaviorIndicators.hourDistribution,
            weekdayDistribution: behaviorIndicators.weekdayDistribution,
            detectedPatterns: behaviorIndicators.detectedPatterns
        },
        items: {
            mostFrequent: itemStats.slice(0, 10),
            mostFrequentSugary: sugaryFrequentItems,
            recurring: recurringItems,
            newItems,
            topSpending: itemStats.slice(0, 10),
            unclassified: unclassifiedItems
        },
        alerts,
        summary,
        uiSuggestion: {
            sections: [
                'KPIs principais: gasto total, percentual natural, score de açucar e score de impulsividade',
                'Comparativo mensal e semanal da dieta',
                'Distribuicao por horario e dia da semana',
                'Top itens frequentes, açucarados e compras impulsivas'
            ]
        }
    };
};

export const buildSampleFoodAnalysis = () => analyzeFoodPurchases({
    items: FOOD_ANALYSIS_SAMPLE_ITEMS,
    referenceDate: new Date('2026-03-22T12:00:00')
});
