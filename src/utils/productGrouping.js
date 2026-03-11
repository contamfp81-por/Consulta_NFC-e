const collapseWhitespace = (value = '') => String(value).replace(/\s+/g, ' ').trim();

const stripDiacritics = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const compareLabels = (left = '', right = '') => left.localeCompare(right, 'pt-BR');

const compareDisplayCandidates = (left, right) => {
    const countDifference = (right.count || 0) - (left.count || 0);
    if (countDifference !== 0) return countDifference;

    const lengthDifference = (left.name || '').length - (right.name || '').length;
    if (lengthDifference !== 0) return lengthDifference;

    return compareLabels(left.name, right.name);
};

const buildDisjointSet = () => {
    const parents = new Map();

    const add = (key) => {
        if (!key || parents.has(key)) return;
        parents.set(key, key);
    };

    const find = (key) => {
        if (!parents.has(key)) {
            parents.set(key, key);
            return key;
        }

        const parent = parents.get(key);
        if (parent === key) {
            return key;
        }

        const root = find(parent);
        parents.set(key, root);
        return root;
    };

    const union = (left, right) => {
        if (!left || !right) return;

        add(left);
        add(right);

        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot === rightRoot) return;

        const [nextRoot, mergedRoot] = leftRoot <= rightRoot
            ? [leftRoot, rightRoot]
            : [rightRoot, leftRoot];

        parents.set(mergedRoot, nextRoot);
    };

    return { add, find, union };
};

const getPreferredDisplayName = (node) => {
    const candidates = Array.from(node.displayNames.entries())
        .map(([name, count]) => ({ name, count }))
        .sort(compareDisplayCandidates);

    return candidates[0]?.name || 'Produto sem nome';
};

const createNode = (key) => ({
    key,
    displayNames: new Map(),
    productCount: 0
});

const sortPairKeys = (leftKey, rightKey) => (
    leftKey <= rightKey
        ? [leftKey, rightKey]
        : [rightKey, leftKey]
);

export const normalizeProductNameKey = (value = '') => {
    const normalizedValue = collapseWhitespace(value);
    if (!normalizedValue) return '';

    return stripDiacritics(normalizedValue)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
};

export const createProductAliasPair = (leftOption, rightOption) => {
    if (!leftOption?.key || !rightOption?.key) return null;

    const [leftKey, rightKey] = sortPairKeys(leftOption.key, rightOption.key);
    const orderedOptions = leftKey === leftOption.key
        ? [leftOption, rightOption]
        : [rightOption, leftOption];

    return {
        leftKey,
        rightKey,
        leftName: orderedOptions[0].displayName,
        rightName: orderedOptions[1].displayName,
        createdAt: new Date().toISOString()
    };
};

export const buildProductGrouping = ({ products = [], aliases = [] } = {}) => {
    const disjointSet = buildDisjointSet();
    const nodesByKey = new Map();

    const ensureNode = (rawName, weight = 0) => {
        const displayName = collapseWhitespace(rawName);
        const key = normalizeProductNameKey(displayName);
        if (!key) return null;

        disjointSet.add(key);

        if (!nodesByKey.has(key)) {
            nodesByKey.set(key, createNode(key));
        }

        const node = nodesByKey.get(key);
        if (displayName) {
            node.displayNames.set(displayName, (node.displayNames.get(displayName) || 0) + weight);
        }
        node.productCount += weight;
        return node;
    };

    products.forEach((product) => {
        ensureNode(product?.name, 1);
    });

    aliases.forEach((alias) => {
        const leftFallbackName = collapseWhitespace(alias?.leftName || alias?.sourceName || alias?.leftKey || '');
        const rightFallbackName = collapseWhitespace(alias?.rightName || alias?.targetName || alias?.rightKey || '');
        const leftNode = ensureNode(leftFallbackName, 0);
        const rightNode = ensureNode(rightFallbackName, 0);
        const leftKey = alias?.leftKey || leftNode?.key || normalizeProductNameKey(leftFallbackName);
        const rightKey = alias?.rightKey || rightNode?.key || normalizeProductNameKey(rightFallbackName);

        if (leftKey && rightKey && leftKey !== rightKey) {
            disjointSet.union(leftKey, rightKey);
        }
    });

    const groupsById = new Map();

    Array.from(nodesByKey.values()).forEach((node) => {
        const groupId = disjointSet.find(node.key);
        if (!groupsById.has(groupId)) {
            groupsById.set(groupId, {
                id: groupId,
                nodes: []
            });
        }

        groupsById.get(groupId).nodes.push(node);
    });

    const groups = Array.from(groupsById.values())
        .map((group) => {
            const memberNodes = group.nodes
                .map((node) => ({
                    key: node.key,
                    displayName: getPreferredDisplayName(node),
                    productCount: node.productCount
                }))
                .sort((left, right) => compareLabels(left.displayName, right.displayName));

            const representative = [...memberNodes].sort((left, right) => {
                const countDifference = right.productCount - left.productCount;
                if (countDifference !== 0) return countDifference;

                const lengthDifference = left.displayName.length - right.displayName.length;
                if (lengthDifference !== 0) return lengthDifference;

                return compareLabels(left.displayName, right.displayName);
            })[0];

            const memberNames = memberNodes.map((node) => node.displayName);
            const merged = memberNames.length > 1;
            const displayName = merged
                ? `${representative?.displayName || memberNames[0] || 'Produto sem nome'} *`
                : (memberNames[0] || 'Produto sem nome');
            const searchText = normalizeProductNameKey([displayName, ...memberNames].join(' '));
            const productCount = memberNodes.reduce((total, node) => total + node.productCount, 0);

            return {
                id: group.id,
                displayName,
                memberNames,
                memberKeys: memberNodes.map((node) => node.key),
                productCount,
                merged,
                searchText
            };
        })
        .sort((left, right) => compareLabels(left.displayName, right.displayName));

    const groupsMap = new Map(groups.map((group) => [group.id, group]));
    const nameToGroupId = new Map();

    groups.forEach((group) => {
        group.memberKeys.forEach((memberKey) => {
            nameToGroupId.set(memberKey, group.id);
        });
    });

    const nameOptions = Array.from(nodesByKey.values())
        .map((node) => ({
            key: node.key,
            displayName: getPreferredDisplayName(node),
            productCount: node.productCount
        }))
        .sort((left, right) => compareLabels(left.displayName, right.displayName));

    return {
        groups,
        groupsMap,
        nameOptions,
        nameToGroupId
    };
};

export const getProductGroup = (grouping, rawName) => {
    const fallbackName = collapseWhitespace(rawName) || 'Produto sem nome';
    const key = normalizeProductNameKey(fallbackName);
    if (!key) {
        return {
            id: fallbackName,
            displayName: fallbackName,
            memberNames: [fallbackName],
            memberKeys: [],
            productCount: 0,
            merged: false,
            searchText: normalizeProductNameKey(fallbackName)
        };
    }

    const groupId = grouping?.nameToGroupId?.get(key);
    if (groupId && grouping?.groupsMap?.has(groupId)) {
        return grouping.groupsMap.get(groupId);
    }

    return {
        id: key,
        displayName: fallbackName,
        memberNames: [fallbackName],
        memberKeys: [key],
        productCount: 0,
        merged: false,
        searchText: normalizeProductNameKey(fallbackName)
    };
};
