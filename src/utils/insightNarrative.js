const normalizeNarrativeText = (value = '') => String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const ensureNarrativeEnding = (value = '') => {
    const text = normalizeNarrativeText(value);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
};

const stripTrailingPunctuation = (value = '') => normalizeNarrativeText(value).replace(/[.!?]+$/g, '');

export const withInsightWhy = (statement = '', reason = '') => {
    const normalizedStatement = normalizeNarrativeText(statement);
    const normalizedReason = stripTrailingPunctuation(reason);

    if (!normalizedStatement) {
        return '';
    }

    if (!normalizedReason || /Porque\?/i.test(normalizedStatement)) {
        return ensureNarrativeEnding(normalizedStatement);
    }

    return `${ensureNarrativeEnding(normalizedStatement)} Porque? ${normalizedReason}.`;
};

export const withInsightWhyList = (items = []) => items
    .map((item) => withInsightWhy(item?.statement || item?.message || '', item?.reason || ''))
    .filter(Boolean);
