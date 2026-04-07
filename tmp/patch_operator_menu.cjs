const fs = require('fs');
const filePath = 'g:\\projetos\\gestao-otica-pro\\src\\components\\operator-menu\\OperatorMenuAtendimento.tsx';

let content = fs.readFileSync(filePath, 'utf8');

// Find the closing of "Enviar Informação" button and the grid div
const searchText = '                            </div>\r\n                        </button>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n\r\n            {/* Botão Voltar */}';

const newButton = `                            </div>\r
                        </button>\r
\r
                        {/* Tabela de Preços */}\r
                        <button\r
                            onClick={() => onNavigate(\`/dashboard/loja/\${storeId}/tabela-precos\`)}\r
                            onMouseEnter={(e) => handleHover(e, "Consulte a tabela de preços do laboratório ativo. Compare ofertas, tratamentos e valores lado a lado.")}\r
                            onMouseMove={handleMove}\r
                            onMouseLeave={handleLeave}\r
                            className="group bg-white/5 hover:bg-slate-700/30 rounded-xl flex items-center gap-4 px-4 py-3 border border-white/5 hover:border-slate-500/30 transition-all duration-300 cursor-pointer"\r
                        >\r
                            <div className="p-2 rounded-lg bg-slate-500/20 text-slate-300 group-hover:bg-slate-500 group-hover:text-white transition-colors">\r
                                <Tag className="w-5 h-5" strokeWidth={2} />\r
                            </div>\r
                            <div className="text-left">\r
                                <span className="text-slate-200 text-sm font-bold block group-hover:text-white transition-colors">Tabela de Preços</span>\r
                                <span className="text-slate-500 text-[10px] group-hover:text-slate-300 transition-colors">Laboratório</span>\r
                            </div>\r
                        </button>\r
                    </div>\r
                </div>\r
            </div>\r
\r
            {/* Botão Voltar */}`;

if (content.includes(searchText)) {
  content = content.replace(searchText, newButton);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: Tabela de Precos button inserted');
} else {
  // Try without \r
  const searchTextLF = searchText.replace(/\r\n/g, '\n');
  if (content.includes(searchTextLF)) {
    const newButtonLF = newButton.replace(/\r\n/g, '\n');
    content = content.replace(searchTextLF, newButtonLF);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('SUCCESS (LF): Tabela de Precos button inserted');
  } else {
    console.log('FAIL: marker not found');
    // Debug: show lines around 426-430
    const lines = content.split(/\r?\n/);
    for (let i = 424; i < 432 && i < lines.length; i++) {
      console.log(`L${i+1}: ${JSON.stringify(lines[i])}`);
    }
  }
}
