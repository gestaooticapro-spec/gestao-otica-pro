const fs = require('fs');
let content = fs.readFileSync('src/components/evaluation/EvaluationInterface.tsx', 'utf8');

// 1. Fix encoding
content = content.replace(/â€¢/g, '•');
content = content.replace(/Â·/g, '·');
content = content.replace(/AvaliaÃ§Ã£o/g, 'Avaliação');
content = content.replace(/EquilÃ­brio/g, 'Equilíbrio');
content = content.replace(/NÃ£o/g, 'Não');

// 2. Setup styles
const oldInputStyle = 'const inputStyle = \'block w-full rounded-xl border border-white/10 bg-black/20 shadow-inner text-slate-100 h-10 text-sm px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 disabled:opacity-50 transition-all outline-none\'';
const newInputStyles = 'const inputStyle = \'block w-full rounded-xl border border-white/20 bg-slate-900/60 shadow-inner text-slate-100 h-10 text-sm px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 disabled:opacity-50 transition-all outline-none\'\nconst selectStyle = `${inputStyle} appearance-none bg-[url(\\\'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%2394a3b8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E\\\')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10`';
content = content.replace(oldInputStyle, newInputStyles);

// 3. Replace all select inputStyle with selectStyle
content = content.replace(/(<select[\s\S]*?className=\{)inputStyle(\}[\s\S]*?>)/g, '$1selectStyle$2');

// 4. Update the Queixas block
const hHist = '<div className="col-span-12">\n                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">\n                        Histórico e Óculos Atual\n                      </h4>\n                    </div>\n                    <div className="col-span-12 md:col-span-4">\n                      <label className={labelStyle}>Marca atual</label>';
content = content.replace('<div className="col-span-12 md:col-span-4">\n                      <label className={labelStyle}>Marca atual</label>', hHist);

const hPref = '<div className="col-span-12 mt-4">\n                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">\n                        Objetivos e Preferências\n                      </h4>\n                    </div>\n                    <div className="col-span-12 md:col-span-4">\n                      <label className={labelStyle}>Prioridade principal</label>';
content = content.replace('<div className="col-span-12 md:col-span-4">\n                      <label className={labelStyle}>Prioridade principal</label>', hPref);

const hSint = '<div className="col-span-12 mt-4">\n                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">\n                        Sintomas e Comportamentos\n                      </h4>\n                    </div>\n                    <div className="col-span-12 md:col-span-3">\n                      <label className={labelStyle}>Dificuldade para dirigir à noite</label>';
content = content.replace('<div className="col-span-12 md:col-span-3">\n                      <label className={labelStyle}>Dificuldade para dirigir à noite</label>', hSint);

const hObs = '<div className="col-span-12 mt-4">\n                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">\n                        Observações Adicionais\n                      </h4>\n                    </div>\n                    <div className="col-span-12">\n                      <label className={labelStyle}>Observações do consultor</label>';
content = content.replace('<div className="col-span-12">\n                      <label className={labelStyle}>Observações do consultor</label>', hObs);

fs.writeFileSync('src/components/evaluation/EvaluationInterface.tsx', content);
console.log('Update Complete');
