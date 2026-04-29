const fs = require('fs');
const path = require('path');

const dirPath = path.join('g:', 'projetos', 'gestao-otica-pro', 'src', 'components', 'catalog');
const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

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
  'aÃ§Ã£o': 'ação',
  'detectÃ¡veis': 'detectáveis',
  'Ã­ndice': 'índice',
  'Ã ndice': 'Índice',
  'visualizaÃ§Ã£o': 'visualização',
  'sÃ³': 'só',
  'instantÃ¢neo': 'instantâneo'
};

for (const file of files) {
  const filePath = path.join(dirPath, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  for (const [bad, good] of Object.entries(replacements)) {
    content = content.split(bad).join(good);
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Fixed encoding in ${file}`);
  }
}
