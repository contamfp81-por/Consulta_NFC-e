import * as XLSX from 'xlsx';

export const exportToExcel = (data, filename = 'gastos_contabeis.xlsx') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');
    XLSX.writeFile(workbook, filename);
};
