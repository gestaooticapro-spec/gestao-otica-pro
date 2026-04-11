const fs = require('fs');

let content = fs.readFileSync('src/components/evaluation/EvaluationInterface.tsx', 'utf8');

// Update EvaluationStatus
content = content.replace(
  /type EvaluationStatus = 'rascunho' \| 'concluida' \| 'importada' \| 'exportada'/,
  "type EvaluationStatus = 'rascunho' | 'em_andamento' | 'pendente' | 'concluida' | 'importada' | 'exportada'"
);

fs.writeFileSync('src/components/evaluation/EvaluationInterface.tsx', content, 'utf8');
console.log('Fixed EvaluationStatus!');
