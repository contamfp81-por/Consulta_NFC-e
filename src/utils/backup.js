import { db } from '../db';

const BACKUP_VERSION = 1;
const BACKUP_FILE_PREFIX = 'smartcontabil-backup';
const BACKUP_FILE_TYPE = 'application/json';

const getBackupTables = () => db.tables.map((table) => table.name);

const buildCountsMap = (tables) => Object.fromEntries(
    Object.entries(tables).map(([tableName, rows]) => [tableName, rows.length])
);

const sumCounts = (counts) => Object.values(counts).reduce(
    (total, count) => total + (Number(count) || 0),
    0
);

const sanitizeTimestampForFilename = (value) => String(value || new Date().toISOString())
    .replace(/[:.]/g, '-');

const downloadTextFile = (content, filename) => {
    const blob = new Blob([content], { type: BACKUP_FILE_TYPE });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const normalizeBackupPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Formato de backup inválido.');
    }

    if (!payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)) {
        throw new Error('O arquivo informado não contém uma base de dados válida.');
    }

    const tableNames = getBackupTables();
    const tables = Object.fromEntries(
        tableNames.map((tableName) => [
            tableName,
            Array.isArray(payload.tables?.[tableName]) ? payload.tables[tableName] : []
        ])
    );

    const receiptIds = new Set(
        (tables.receipts || [])
            .map((receipt) => receipt?.id)
            .filter((id) => id !== null && id !== undefined)
    );
    const hasOrphanProducts = (tables.products || []).some((product) => (
        product?.receiptId !== null
        && product?.receiptId !== undefined
        && !receiptIds.has(product.receiptId)
    ));

    if (hasOrphanProducts) {
        throw new Error('O backup informado possui itens sem cupom correspondente.');
    }

    return {
        app: payload.app || '',
        databaseName: payload.databaseName || '',
        schemaVersion: payload.schemaVersion || null,
        backupVersion: payload.backupVersion || 0,
        exportedAt: payload.exportedAt || '',
        tableNames,
        tables
    };
};

export const exportDatabaseBackup = async () => {
    const tableNames = getBackupTables();
    const tableEntries = await Promise.all(
        tableNames.map(async (tableName) => [tableName, await db.table(tableName).toArray()])
    );
    const tables = Object.fromEntries(tableEntries);
    const counts = buildCountsMap(tables);
    const payload = {
        app: 'SmartContabil',
        databaseName: db.name,
        schemaVersion: db.verno,
        backupVersion: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tables,
        counts
    };

    downloadTextFile(
        JSON.stringify(payload, null, 2),
        `${BACKUP_FILE_PREFIX}-${sanitizeTimestampForFilename(payload.exportedAt)}.json`
    );

    return {
        exportedAt: payload.exportedAt,
        counts,
        totalRecords: sumCounts(counts)
    };
};

export const importDatabaseBackup = async (source) => {
    let payload = source;

    if (typeof File !== 'undefined' && source instanceof File) {
        const fileContent = await source.text();

        try {
            payload = JSON.parse(fileContent);
        } catch {
            throw new Error('Não foi possível ler o arquivo de backup.');
        }
    }

    const normalizedPayload = normalizeBackupPayload(payload);
    const tablesToRestore = normalizedPayload.tableNames.map((tableName) => db.table(tableName));

    await db.transaction('rw', ...tablesToRestore, async () => {
        for (const table of tablesToRestore) {
            await table.clear();
        }

        for (const table of tablesToRestore) {
            const rows = normalizedPayload.tables[table.name] || [];
            if (rows.length) {
                await table.bulkPut(rows);
            }
        }
    });

    const counts = buildCountsMap(normalizedPayload.tables);

    return {
        importedAt: new Date().toISOString(),
        backupExportedAt: normalizedPayload.exportedAt,
        counts,
        totalRecords: sumCounts(counts)
    };
};
