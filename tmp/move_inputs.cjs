const fs = require('fs');
const filePath = 'g:\\projetos\\gestao-otica-pro\\src\\components\\evaluation\\EvaluationInterface.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the bottom block 
const bottomBlockRegex = /<div className="col-span-12">\s*<label className=\{labelStyle\}>Lente recomendada<\/label>\s*<input value=\{form\.recommendedLensName\}[^>]*>\s*<\/div>\s*<div className="col-span-12">\s*<label className=\{labelStyle\}>Resumo comercial<\/label>\s*<textarea\s*value=\{form\.commercialRecommendationRaw\}[^>]*\/>\s*<\/div>\s*\{isIvisionMode && \(\s*<>\s*<div className="col-span-12">\s*<label className=\{labelStyle\}>Avisos da importação<\/label>[\s\S]*?<\/div>\s*<\/>\s*\)\}/;

content = content.replace(bottomBlockRegex, '{/* Manual inputs moved to the iVision section up top */}');

// 2. Insert into the top block
const topTarget = `{isIvisionMode && (
                      <div className="col-span-12 md:col-span-8">
                        <label className={labelStyle}>Leitura do PDF</label>
                        <input value={getParseStatusLabel(form.parseStatus)} readOnly className={inputStyle} />
                      </div>
                    )}`;

const topReplacement = `{isIvisionMode && (
                      <>
                        <div className="col-span-12 md:col-span-8">
                          <label className={labelStyle}>Leitura do PDF</label>
                          <input value={getParseStatusLabel(form.parseStatus)} readOnly className={inputStyle} />
                        </div>
                        <div className="col-span-12 md:col-span-6">
                          <label className={labelStyle}>Lente recomendada (iVision)</label>
                          <input value={form.recommendedLensName} onChange={(e) => handleFormChange('recommendedLensName', e.target.value)} className={inputStyle} />
                        </div>
                        <div className="col-span-12 md:col-span-6">
                          <label className={labelStyle}>Resumo Comercial</label>
                          <textarea
                            value={form.commercialRecommendationRaw}
                            onChange={(e) => handleFormChange('commercialRecommendationRaw', e.target.value)}
                            className="block min-h-[40px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-bold text-slate-100 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="Tratamento sugerido, material..."
                          />
                        </div>
                        <div className="col-span-12 md:col-span-6">
                          <label className={labelStyle}>Avisos da importação</label>
                          <textarea
                            value={form.parseWarning}
                            onChange={(e) => handleFormChange('parseWarning', e.target.value)}
                            className="block min-h-[40px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-bold text-slate-100 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="Avisos de parse ou observações internas"
                          />
                        </div>
                        <div className="col-span-12 md:col-span-6">
                          <label className={labelStyle}>Texto extraído do PDF</label>
                          <textarea
                            value={form.extractedText}
                            onChange={(e) => handleFormChange('extractedText', e.target.value)}
                            className="block min-h-[40px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-medium text-slate-200 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="O texto bruto extraído do PDF fica registrado aqui"
                          />
                        </div>
                      </>
                    )}`;

if (content.includes(topTarget)) {
    content = content.replace(topTarget, topReplacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('UI fields successfully moved to iVision block.');
} else {
    // If exact match fails, try regex for the isIvisionMode block
    const topRegex = /\{isIvisionMode && \(\s*<div className="col-span-12 md:col-span-8">\s*<label className=\{labelStyle\}>Leitura do PDF<\/label>\s*<input value=\{getParseStatusLabel\(form\.parseStatus\)\} readOnly className=\{inputStyle\} \/>\s*<\/div>\s*\)\}/;
    if (topRegex.test(content)) {
        content = content.replace(topRegex, topReplacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('UI fields successfully moved to iVision block using regex fallback.');
    } else {
        console.log('Could not find the target isIvisionMode block to replace.');
    }
}
