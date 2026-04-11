const fs = require('fs');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  const replacementsDict = {
    "ÃƒÂ­": "í",
    "ÃƒÂ£": "ã",
    "ÃƒÂ¡": "á",
    "Ã£": "ã",
    "Ã§": "ç",
    "Ã¡": "á",
    "Ã©": "é",
    "Ã­": "í",
    "Ã³": "ó",
    "Ãº": "ú",
    "Ãª": "ê",
    "Ã¢": "â",
    "Ã´": "ô",
    "Ã ": "à",
    "Ãµ": "õ",
    "Ã§Ã£o": "ção",
    "Ã§Ãµes": "ções",
    "â€”": "—"
  };

  for (const [bad, good] of Object.entries(replacementsDict)) {
    content = content.split(bad).join(good);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixes applied to ${filePath}`);
}

const fileToFix = 'g:\\projetos\\gestao-otica-pro\\src\\components\\evaluation\\EvaluationInterface.tsx';

fixFile(fileToFix);
