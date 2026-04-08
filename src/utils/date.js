const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const padNumber = (value) => String(value).padStart(2, '0');

const getDaysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

export const parseDateKey = (value) => {
    const match = String(value || '').trim().match(DATE_KEY_PATTERN);
    if (!match) {
        return null;
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const day = Number(dayText);
    const date = new Date(year, monthIndex, day, 12, 0, 0, 0);

    return Number.isNaN(date.getTime()) ? null : date;
};

export const toLocalDate = (value) => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }

    const parsedDateKey = parseDateKey(value);
    if (parsedDateKey) {
        return parsedDateKey;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const toLocalDateKey = (value) => {
    const date = toLocalDate(value);
    if (!date) {
        return '';
    }

    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
};

export const getMonthKey = (value) => {
    const dateKey = toLocalDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : '';
};

export const getPreviousMonthKey = (value) => {
    const safeDate = toLocalDate(value);
    if (!safeDate) {
        return '';
    }

    const previousMonthDate = new Date(safeDate.getFullYear(), safeDate.getMonth() - 1, 1, 12, 0, 0, 0);
    return getMonthKey(previousMonthDate);
};

export const getTodayDateKey = (referenceDate = new Date()) => toLocalDateKey(referenceDate);

export const getCurrentMonthDateRange = (referenceDate = new Date()) => {
    const safeDate = toLocalDate(referenceDate) || new Date();
    const startDate = `${safeDate.getFullYear()}-${padNumber(safeDate.getMonth() + 1)}-01`;

    return {
        startDate,
        endDate: toLocalDateKey(safeDate)
    };
};

export const normalizeDateRange = (startDate = '', endDate = '') => {
    let nextStartDate = startDate || '';
    let nextEndDate = endDate || '';

    if (nextStartDate && nextEndDate && nextStartDate > nextEndDate) {
        [nextStartDate, nextEndDate] = [nextEndDate, nextStartDate];
    }

    return {
        startDate: nextStartDate,
        endDate: nextEndDate
    };
};

export const isDateKeyWithinRange = (dateKey, range = {}) => {
    const { startDate = '', endDate = '' } = range;
    if (!dateKey) {
        return false;
    }

    if (startDate && dateKey < startDate) {
        return false;
    }

    if (endDate && dateKey > endDate) {
        return false;
    }

    return true;
};

const shiftDateByMonths = (date, amount) => {
    const safeDate = toLocalDate(date);
    if (!safeDate || !amount) {
        return safeDate;
    }

    const originalDay = safeDate.getDate();
    const shiftedDate = new Date(safeDate.getTime());
    shiftedDate.setDate(1);
    shiftedDate.setMonth(shiftedDate.getMonth() + amount);
    shiftedDate.setDate(Math.min(originalDay, getDaysInMonth(shiftedDate.getFullYear(), shiftedDate.getMonth())));

    return shiftedDate;
};

const shiftDateByYears = (date, amount) => {
    const safeDate = toLocalDate(date);
    if (!safeDate || !amount) {
        return safeDate;
    }

    const originalDay = safeDate.getDate();
    const shiftedDate = new Date(safeDate.getTime());
    shiftedDate.setDate(1);
    shiftedDate.setFullYear(shiftedDate.getFullYear() + amount);
    shiftedDate.setDate(Math.min(originalDay, getDaysInMonth(shiftedDate.getFullYear(), shiftedDate.getMonth())));

    return shiftedDate;
};

export const shiftDateKey = (dateKey, { days = 0, weeks = 0, months = 0, years = 0 } = {}) => {
    const baseDate = parseDateKey(dateKey);
    if (!baseDate) {
        return '';
    }

    let shiftedDate = new Date(baseDate.getTime());

    if (days || weeks) {
        shiftedDate.setDate(shiftedDate.getDate() + days + (weeks * 7));
    }

    if (months) {
        shiftedDate = shiftDateByMonths(shiftedDate, months);
    }

    if (years) {
        shiftedDate = shiftDateByYears(shiftedDate, years);
    }

    return toLocalDateKey(shiftedDate);
};

export const toInputDateValue = (value, fallback = new Date()) => toLocalDateKey(value) || toLocalDateKey(fallback);

export const toStoredDateTime = (value) => {
    const parsedDateKey = parseDateKey(value);
    if (parsedDateKey) {
        return parsedDateKey.toISOString();
    }

    const date = toLocalDate(value);
    return date ? date.toISOString() : new Date().toISOString();
};

export const formatDateKeyLabel = (value, locale = 'pt-BR') => {
    const date = toLocalDate(value);
    return date ? date.toLocaleDateString(locale) : String(value || '');
};

export const COMPARISON_PERIOD_OPTIONS = [
    { value: 'none', label: 'Sem comparacao' },
    { value: 'previous_day', label: 'Dia anterior' },
    { value: 'previous_week', label: 'Semana anterior' },
    { value: 'previous_month', label: 'Mes anterior' },
    { value: 'previous_year', label: 'Ano anterior' }
];

export const buildComparisonRange = ({ startDate = '', endDate = '', mode = 'none' } = {}) => {
    if (!startDate || !endDate || mode === 'none') {
        return null;
    }

    switch (mode) {
        case 'previous_day':
            return {
                startDate: shiftDateKey(startDate, { days: -1 }),
                endDate: shiftDateKey(endDate, { days: -1 })
            };
        case 'previous_week':
            return {
                startDate: shiftDateKey(startDate, { weeks: -1 }),
                endDate: shiftDateKey(endDate, { weeks: -1 })
            };
        case 'previous_month':
            return {
                startDate: shiftDateKey(startDate, { months: -1 }),
                endDate: shiftDateKey(endDate, { months: -1 })
            };
        case 'previous_year':
            return {
                startDate: shiftDateKey(startDate, { years: -1 }),
                endDate: shiftDateKey(endDate, { years: -1 })
            };
        default:
            return null;
    }
};
