const fs = require('fs');
const path = require('path');

const filePath = path.join('g:', 'projetos', 'gestao-otica-pro', 'src', 'components', 'catalog', 'GazeHeatmapLab.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const replacements = {
  'sessÃ£o': 'sessão',
  'SessÃ£o': 'Sessão',
  'cabeÃ§a': 'cabeça',
  'CabeÃ§a': 'Cabeça',
  'nÃ£o': 'não',
  'NÃ£o': 'Não',
  'estÃ¡veis': 'estáveis',
  'mÃ©dios': 'médios',
  'padrÃ£o': 'padrão',
  'PadrÃ£o': 'Padrão',
  'exigÃªncia': 'exigência',
  'LaboratÃ³rio': 'Laboratório',
  'Ã·': '·',
  'Â·': '·',
  'cÃ¢mera': 'câmera',
  'CÃ¢mera': 'Câmera',
  'sequÃªncia': 'sequência',
  'CalibraÃ§Ã£o': 'Calibração',
  'calibraÃ§Ã£o': 'calibração',
  'rÃ¡pida': 'rápida',
  'estÃ¡': 'está',
  'confiÃ¡vel': 'confiável',
  'possÃ­vel': 'possível',
  'concluÃ­da': 'concluída',
  'compatÃ­vel': 'compatível',
  'CompatÃ­vel': 'Compatível',
  'contÃ­nuo': 'contínuo',
  'Ã©': 'é',
  'Ãª': 'ê',
  'direÃ§Ã£o': 'direção',
  'Ã§Ã£o': 'ção',
  'ÃƒÂ©': 'é',
  'Ã ': 'à',
  'instantÃ¢nea': 'instantânea',
  'frequÃªncia': 'frequência',
  'mÃ¡ximo': 'máximo',
  'comparÃ¡vel': 'comparável',
  'FaÃ§a': 'Faça',
  'faÃ§a': 'faça',
  'peÃ§a': 'peça',
  'mÃ³vel': 'móvel',
  'jÃ¡': 'já',
  'aÃ§Ã£o': 'ação'
};

for (const [bad, good] of Object.entries(replacements)) {
  content = content.split(bad).join(good);
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Fixed encoding in GazeHeatmapLab.tsx');
