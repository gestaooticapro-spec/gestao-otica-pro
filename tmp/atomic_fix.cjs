const fs = require('fs');
const filePath = 'src/components/evaluation/EvaluationInterface.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// The file has two TEST_PROFILES declarations. 
// Let's identify the start and end of that whole mess.
// It starts around line 150 (after getParseStatusLabel) and ends before parseNullableNumber.

const blockStart = content.indexOf('// ==========================================');
const blockEnd = content.indexOf('const parseNullableNumber =');

if (blockStart !== -1 && blockEnd !== -1 && blockStart < blockEnd) {
    const before = content.substring(0, blockStart);
    const after = content.substring(blockEnd);
    
    const cleanProfiles = `
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
\n`;

    fs.writeFileSync(filePath, before + cleanProfiles + after, 'utf8');
    console.log('Fixed EvaluationInterface UI and encoding.');
} else {
    console.log('Could not find injection boundaries.', {blockStart, blockEnd});
}
