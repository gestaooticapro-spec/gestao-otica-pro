const fs = require('fs');
const filePath = 'g:\\projetos\\gestao-otica-pro\\src\\components\\evaluation\\EvaluationInterface.tsx';

let content = fs.readFileSync(filePath, 'utf8');

// 1. FIX ENCODING MOJIBAKE
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
  "Ã\u00a0": "à", 
  "Ãµ": "õ",
  "Ã§Ã£o": "ção",
  "Ã§Ãµes": "ções",
  "â€”": "—"
};

for (const [bad, good] of Object.entries(replacementsDict)) {
  content = content.split(bad).join(good);
}

// Ensure basic valid string replacement for a few oddballs
content = content.replace(/CrianÃ§a/g, 'Criança');
content = content.replace(/AdaptaÃ§Ã£o/g, 'Adaptação');
content = content.replace(/DifÃ­cil/g, 'Difícil');
content = content.replace(/GenÃ©rica/g, 'Genérica');
content = content.replace(/Preencimento RÃ¡pido/g, 'Preenchimento Rápido');

// 2. WIPE EXISTING PROFILES AND BLOCKS
// Wipe all TEST_PROFILES declarations
content = content.replace(/\/\/ =*[\s\S]*?\/\/ TEST PROFILES \(FOR DEMO\)[\s\S]*?const TEST_PROFILES = \{[\s\S]*?\n\};\n?/g, '');
content = content.replace(/\/\/ =*[\s\S]*?\/\/ =*\nconst TEST_PROFILES = \{[\s\S]*?\n\};\n?/g, '');

// Wipe any stray Quick Fill UI blocks
content = content.replace(/\{\/\* TEST PROFILES - REMOVE EASILY BY DELETING THIS BLOCK \*\/\}[\s\S]*?<div className="flex flex-wrap items-center[\s\S]*?<\/div>(\s+)?/g, '');


// 3. INJECT THE FRESH, CLEAN BLOCK
const cleanBlock = `
// ==========================================
// TEST PROFILES (FOR DEMO)
// ==========================================
const TEST_PROFILES = {
  enzo: {
    patientNameRaw: 'Enzo Gabriel (Criança Ativa)',
    ageYears: '8',
    estiloVidaUsoComputadorHoras: '0',
    estiloVidaDirigirHoras: '0',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '4',
    estiloVidaAmbienteInternoHoras: '4',
    estiloVidaAmbienteExternoHoras: '4',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'baixa',
    historicoTrocasRecentes: 'nenhuma',
    prioridadePrincipal: 'resistencia',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'trocar_marca',
    faixaOrcamento: '800_2000',
    budgetTarget: '1200',
    importanciaEstetica: 'baixa',
    importanciaResistencia: 'alta',
    prefereTransitions: 'sim',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'sim',
    queixaCriancaAtiva: 'sim',
    queixaProgressaoRapida: 'sim',
    observacoesConsultor: 'Criança muito ativa, quebra óculos na escola. Pais preocupados com aumento rápido do grau.',
    receitaLongeOdEsferico: '-4,50',
    receitaLongeOdCilindrico: '-1,50',
    receitaLongeOdEixo: '180',
    receitaLongeOeEsferico: '-4,25',
    receitaLongeOeCilindrico: '-1,25',
    receitaLongeOeEixo: '170',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '27',
    medidaDnpOe: '27',
    medidaAlturaOd: '16',
    medidaAlturaOe: '16'
  },
  maria: {
    patientNameRaw: 'Dona Maria (Adaptação Difícil)',
    ageYears: '62',
    estiloVidaUsoComputadorHoras: '1',
    estiloVidaDirigirHoras: '0',
    estiloVidaLeituraHoras: '4',
    estiloVidaUsoCelularHoras: '3',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '10',
    estiloVidaAmbienteExternoHoras: '2',
    estiloVidaAssistirTvHoras: '5',
    marcaAtual: 'Marca Genérica',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'alta',
    historicoTrocasRecentes: 'uma',
    prioridadePrincipal: 'adaptacao',
    principalIncomodoAtual: 'adaptacao',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: 'acima_5000',
    budgetTarget: '5500',
    importanciaEstetica: 'media',
    importanciaResistencia: 'media',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Já tentou usar multifocal 2 vezes sem sucesso. Sente tontura e campo lateral muito estreito.',
    receitaLongeOdEsferico: '+1,50',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+1,75',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '85',
    receitaAdicao: '2,50',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '30',
    medidaDnpOe: '30',
    medidaAlturaOd: '21',
    medidaAlturaOe: '21'
  },
  roberto: {
    patientNameRaw: 'Sr. Roberto (Presbita Iniciante)',
    ageYears: '42',
    estiloVidaUsoComputadorHoras: '8',
    estiloVidaDirigirHoras: '2',
    estiloVidaLeituraHoras: '2',
    estiloVidaUsoCelularHoras: '6',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '12',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'nao_informado',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nenhuma',
    prioridadePrincipal: 'equilibrio',
    principalIncomodoAtual: 'perto',
    objetivoCompra: 'primeira_multifocal',
    faixaOrcamento: '2000_5000',
    budgetTarget: '3500',
    importanciaEstetica: 'alta',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Empresário. Grande demanda digital. Começou a afastar objetos para ler recentemente.',
    receitaLongeOdEsferico: '0,00',
    receitaLongeOdCilindrico: '',
    receitaLongeOdEixo: '',
    receitaLongeOeEsferico: '0,00',
    receitaLongeOeCilindrico: '',
    receitaLongeOeEixo: '',
    receitaAdicao: '1,25',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '33',
    medidaDnpOe: '33',
    medidaAlturaOd: '19',
    medidaAlturaOe: '19'
  }
};
`;

const uiBlock = `                {/* TEST PROFILES - REMOVE EASILY BY DELETING THIS BLOCK */}
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 mb-5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Preenchimento Rápido (DEMO):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.enzo }))
                      setFeedback('Perfil do Enzo (Criança) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Baby className="h-3.5 w-3.5" /> Enzo (Criança)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.maria }))
                      setFeedback('Perfil da Maria (Adaptação) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Maria (Adaptação)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.roberto }))
                      setFeedback('Perfil do Roberto (Empresário) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Roberto (Empresário)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(createEmptyForm())
                      setFormError(null)
                      setFeedback('Formulário limpo com sucesso!')
                    }}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar Tudo
                  </button>
                </div>
`;

// Insert TEST_PROFILES before parseNullableNumber
content = content.replace(/(const parseNullableNumber =)/, cleanBlock + '\n$1');

// Insert UI row before the Origem do Exame Card: <div className={\`\${cardStyle} p-5\`}>
// The target is the section starting with Origem do Exame card, let's inject it precisely.
content = content.replace(/(<div className=\{\`\$\{cardStyle\} p-5\`\}>(\s+)?<div className="mb-4 flex items-center justify-between gap-4">)/, uiBlock + '\n                $1');

// Final check to make sure icons were imported. They usually are if earlier scripts ran, but let's be safe.
if (!content.includes('Baby,')) {
    content = content.replace(/  X\n\} from 'lucide-react'/, "  X,\n  Baby,\n  UserRound,\n  Briefcase,\n  Trash2\n} from 'lucide-react'");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed encodings, cleared duplicates, and cleanly injected the UI.');
