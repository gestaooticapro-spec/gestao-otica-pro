const fs = require('fs');

let content = fs.readFileSync('src/components/evaluation/EvaluationInterface.tsx', 'utf8');

const targetHtml = `{authenticatedEmployee && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1" title={authenticatedEmployee.full_name}>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-200 truncate max-w-[240px]">
                  Consultor(a): {authenticatedEmployee.full_name}
                </span>
              </div>
            )}`;

const newHtml = `{authenticatedEmployee && (
              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1" title={authenticatedEmployee.full_name}>
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-200 truncate max-w-[200px]">
                    {authenticatedEmployee.full_name}
                  </span>
                </div>
                {syncStatus === 'saving' && <span className="text-[9px] font-black uppercase tracking-[0.1em] text-indigo-300 animate-pulse">Salvando...</span>}
                {syncStatus === 'saved' && <span className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-400">Sincronizado ✓</span>}
                {syncStatus === 'error' && <span className="text-[9px] font-black uppercase tracking-[0.1em] text-rose-400">Erro ao salvar</span>}
              </div>
            )}`;

content = content.replace(targetHtml, newHtml);

fs.writeFileSync('src/components/evaluation/EvaluationInterface.tsx', content, 'utf8');
console.log('UI updated');
