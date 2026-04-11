$File = "src/components/evaluation/EvaluationInterface.tsx"
$Content = Get-Content $File -Raw

# 1. Add Icons
$OldIcons = '  X$  } from ''lucide-react'''
$NewIcons = "  X,`n  Baby,`n  UserRound,`n  Briefcase,`n  Trash2`n} from 'lucide-react'"
# We need to escape special regex chars if any, but lucide-react block is straightforward.
# Using simple string replace for stability
$Content = $Content.Replace("  X`r`n} from 'lucide-react'", "  X,`n  Baby,`n  UserRound,`n  Briefcase,`n  Trash2`n} from 'lucide-react'")
$Content = $Content.Replace("  X`n} from 'lucide-react'", "  X,`n  Baby,`n  UserRound,`n  Briefcase,`n  Trash2`n} from 'lucide-react'")

# 2. Add Profiles
$OldProfilesEnd = '    default:
      return value
  }
}'
$NewProfiles = @"
    default:
      return value
  }
}

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
"@

$Content = $Content.Replace("    default:`r`n      return value`r`n  }`r`n}", $NewProfiles)
$Content = $Content.Replace("    default:`n      return value`n  }`n}", $NewProfiles)

# 3. Add UI Row
$OldFeedbackLine = '{feedback && (
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                    <Sparkles className="h-4 w-4" /> {feedback}
                  </div>
                )}'

$NewUI = @"
                {feedback && (
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                    <Sparkles className="h-4 w-4" /> {feedback}
                  </div>
                )}

                {/* TEST PROFILES - REMOVE EASILY BY DELETING THIS BLOCK */}
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
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
"@

$Content = $Content.Replace($OldFeedbackLine, $NewUI)

[System.IO.File]::WriteAllText("g:\projetos\gestao-otica-pro\src\components\evaluation\EvaluationInterface.tsx", $Content)
