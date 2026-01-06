
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function normalizeHeader(header) {
    if (!header) return '';
    return header.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')
        .trim();
}

function readCsv(filename) {
    const filePath = path.join(PROJECT_ROOT, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
    const normalizedHeaders = headers.map(normalizeHeader);

    // Find 'codigo' column
    let codeIndex = normalizedHeaders.indexOf('codigo');
    if (codeIndex === -1) codeIndex = normalizedHeaders.indexOf('cdigo');
    if (codeIndex === -1) codeIndex = normalizedHeaders.indexOf('cÃ³digo');

    console.log(`Column 'codigo' index: ${codeIndex}`);

    const ids = new Set();
    let duplicates = 0;

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        const id = values[codeIndex];
        if (ids.has(id)) {
            duplicates++;
        } else {
            ids.add(id);
        }
    }

    console.log(`Total lines (excluding header): ${lines.length - 1}`);
    console.log(`Unique IDs: ${ids.size}`);
    console.log(`Duplicates: ${duplicates}`);
}

readCsv('vendas.csv');
