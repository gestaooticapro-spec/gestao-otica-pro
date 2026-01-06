
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function normalizeHeader(header) {
    if (!header) return '';
    return header.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^\w\s]/g, '') // Remove caracteres especiais
        .trim();
}

function readCsvDebug(filename) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`Arquivo não encontrado: ${filename}`);
        return;
    }

    console.log(`Lendo arquivo: ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');

    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }

    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    console.log(`Total de linhas: ${lines.length}`);

    if (lines.length === 0) return;

    const originalHeaders = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
    const headers = originalHeaders.map(normalizeHeader);

    console.log('Headers Originais:', originalHeaders);
    console.log('Headers Normalizados:', headers);

    // Mostrar primeira linha de dados
    if (lines.length > 1) {
        const values = lines[1].split(';');
        console.log('Primeira linha (raw):', lines[1]);
        const row = {};
        originalHeaders.forEach((_, index) => {
            const key = headers[index];
            if (!key) return;
            let value = values[index] ? values[index].trim() : '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            row[key] = value;
        });
        console.log('Primeira linha (parsed):', row);
    }
}

readCsvDebug('vendas.csv');
