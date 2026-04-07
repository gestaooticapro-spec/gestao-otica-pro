const fs = require('fs');
const filePath = 'g:\\projetos\\gestao-otica-pro\\src\\components\\SideNav.tsx';

let content = fs.readFileSync(filePath, 'utf8');

const search = `{ label: 'Busca Universal', icon: Globe, route: '/dashboard/loja/[id]/consultas', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },`;

const replacement = `{ label: 'Busca Universal', icon: Globe, route: '/dashboard/loja/[id]/consultas', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },
            { label: 'Tabela de Preços', icon: Tag, route: '/dashboard/loja/[id]/tabela-precos', allowedRoles: ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico'] },`;

if (content.includes(search)) {
  content = content.replace(search, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: SideNav link added');
} else {
  console.log('FAIL: marker not found');
}
