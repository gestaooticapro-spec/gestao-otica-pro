
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function countLines(filename) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!fs.existsSync(filePath)) {
        console.log(`${filename}: Arquivo não encontrado`);
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    // Subtract 1 for header
    console.log(`${filename}: ${lines.length - 1} registros (estimado)`);
}

countLines('vendas.csv');
countLines('itens.csv');
countLines('receitas.csv');
countLines('produtos.csv');
countLines('medicos.csv');
countLines('dependentes.csv');
