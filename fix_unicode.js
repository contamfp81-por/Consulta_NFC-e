
import fs from 'fs';

const replacements = {
    '\\u00e7': 'ç',
    '\\u00e3': 'ã',
    '\\u00ea': 'ê',
    '\\u00e9': 'é',
    '\\u00ed': 'í',
    '\\u00f3': 'ó',
    '\\u00fa': 'ú',
    '\\u00e1': 'á',
    '\\u00f5': 'õ',
    '\\u00c9': 'É',
    '\\u00c1': 'Á',
    '\\u00cd': 'Í',
    '\\u00d3': 'Ó',
    '\\u00da': 'Ú',
    '\\u00c3': 'Ã',
    '\\u00d5': 'Õ',
    '\\u00f4': 'ô',
    '\\u00cd': 'Í',
    '\\u00e0': 'à',
    '\\u00c0': 'À'
};

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const [escape, char] of Object.entries(replacements)) {
        content = content.split(escape).join(char);
    }
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed ${filePath}`);
    } else {
        console.log(`No changes needed for ${filePath}`);
    }
}

const files = [
    'c:/Users/Familia/Documents/Antigravity/Consulta_NFC-e/src/components/Dashboard.jsx',
    'c:/Users/Familia/Documents/Antigravity/Consulta_NFC-e/src/utils/export.js'
];

files.forEach(fixFile);
