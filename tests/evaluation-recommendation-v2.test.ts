import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecommendationCaseInput } from '../src/lib/recommendation/evaluation-case-input'
import { getDesiredClinicalCategories, recommendLensConfigurations, type RecommendationCatalog } from '../src/lib/server/lens-recommendation'

test('campos ausentes permanecem neutros e idade nao infere adicao', () => {
  const input = buildRecommendationCaseInput({ ageYears: '52', receitaLongeOdEsferico: '+1,00' })
  assert.equal(input.adicao, null)
  assert.deepEqual(input.preferred_features, [])
  assert.deepEqual(input.rejected_features, [])
  assert.equal(input.objetivo_tags?.includes('presbiopia'), false)
})

test('receita monocular usa o olho selecionado e cilindro vazio e nulo', () => {
  const input = buildRecommendationCaseInput({
    olhosUtilizaveis: 'oe',
    receitaLongeOdEsferico: '-8,00',
    receitaLongeOeEsferico: '-1,25',
    receitaLongeOeCilindrico: '',
  })
  assert.equal(input.esferico, -1.25)
  assert.equal(input.cilindrico, null)
  assert.equal(input.receita?.olhos_utilizaveis, 'oe')
})

test('controle de miopia exige menor, progressao e intencao confirmadas', () => {
  const withoutIntent = buildRecommendationCaseInput({ ageYears: '12', receitaLongeOdEsferico: '-2', queixaProgressaoRapida: 'sim' })
  const confirmed = buildRecommendationCaseInput({ ageYears: '12', receitaLongeOdEsferico: '-2', queixaProgressaoRapida: 'sim', myopiaControlIntent: 'sim' })
  const adult = buildRecommendationCaseInput({ ageYears: '18', receitaLongeOdEsferico: '-2', queixaProgressaoRapida: 'sim', myopiaControlIntent: 'sim' })
  assert.equal(withoutIntent.objetivo_tags?.includes('controle_miopia'), false)
  assert.equal(confirmed.objetivo_tags?.includes('controle_miopia'), true)
  assert.equal(adult.objetivo_tags?.includes('controle_miopia'), false)
})

test('recusas firmes sao normalizadas separadamente de preferencias', () => {
  const input = buildRecommendationCaseInput({
    receitaLongeOdEsferico: '0', receitaAdicao: '+2',
    rejectMultifocal: 'sim', rejectTransitions: 'sim', rejectedBrands: 'Marca A, Marca B',
  })
  assert.deepEqual(input.rejected_categories, ['multifocal'])
  assert.equal(input.rejected_features?.includes('transitions'), true)
  assert.deepEqual(input.rejected_brands, ['Marca A', 'Marca B'])
})

test('sol na rotina nao vira solar com grau sem objetivo principal explicito', () => {
  const routineOnly = buildRecommendationCaseInput({ receitaLongeOdEsferico: '-1', routinePrimary: 'externo_sol', routinePrimaryIntensity: 'alta' })
  const solarGoal = buildRecommendationCaseInput({ receitaLongeOdEsferico: '-1', routinePrimary: 'externo_sol', routinePrimaryIntensity: 'alta', solarPrimaryObjective: 'sim' })
  assert.deepEqual(getDesiredClinicalCategories(routineOnly), ['visao_simples'])
  assert.deepEqual(getDesiredClinicalCategories(solarGoal), ['plana_solar'])
})

test('antifadiga exige faixa etaria, uso relevante e sintoma confirmado', () => {
  const eligible = buildRecommendationCaseInput({ ageYears: '38', receitaLongeOdEsferico: '-1', routinePrimary: 'computador_escritorio', digitalFatigueSymptom: 'sim' })
  const noSymptom = buildRecommendationCaseInput({ ageYears: '38', receitaLongeOdEsferico: '-1', routinePrimary: 'computador_escritorio', digitalFatigueSymptom: 'nao' })
  const outsideAge = buildRecommendationCaseInput({ ageYears: '45', receitaLongeOdEsferico: '-1', routinePrimary: 'computador_escritorio', digitalFatigueSymptom: 'sim' })
  assert.equal(eligible.objetivo_tags?.includes('antifadiga'), true)
  assert.equal(noSymptom.objetivo_tags?.includes('antifadiga'), false)
  assert.equal(outsideAge.objetivo_tags?.includes('antifadiga'), false)
})

test('uso geral com adicao mantem multifocal e ignora finalidade especifica antiga', () => {
  const input = buildRecommendationCaseInput({
    receitaLongeOdEsferico: '+1', receitaAdicao: '+2',
    routinePrimary: 'geral', additionUse: 'exclusivo_computador',
  })
  assert.deepEqual(getDesiredClinicalCategories(input), ['multifocal'])
})

test('finalidade exclusiva escolhe ocupacional e preserva o contexto de uso', () => {
  const computer = buildRecommendationCaseInput({
    receitaLongeOdEsferico: '+1', receitaAdicao: '+2',
    routinePrimary: 'computador_escritorio', additionUse: 'exclusivo_computador',
  })
  const driving = buildRecommendationCaseInput({
    receitaLongeOdEsferico: '+1', receitaAdicao: '+2',
    routinePrimary: 'dirigir', additionUse: 'especifico_direcao',
  })
  assert.deepEqual(getDesiredClinicalCategories(computer), ['ocupacional'])
  assert.equal(computer.rotina_tags?.includes('escritorio'), true)
  assert.deepEqual(getDesiredClinicalCategories(driving), ['ocupacional'])
  assert.equal(driving.rotina_tags?.includes('dirigir'), true)
})

test('solar exclusivo com adicao continua multifocal, mas libera ofertas solares', () => {
  const input = buildRecommendationCaseInput({
    receitaLongeOdEsferico: '+1', receitaAdicao: '+2',
    routinePrimary: 'externo_sol', additionUse: 'solar_exclusivo',
  })
  assert.deepEqual(getDesiredClinicalCategories(input), ['multifocal'])
  assert.equal(input.objetivo_tags?.includes('oculos_sol_grau'), true)
})

const catalog: RecommendationCatalog = {
  families: [
    { id: 'multi', nome: 'Progressiva Teste', tags_uso: [], tags_beneficios: [], clinical_category: 'multifocal', sourceLaboratorio: 'Lab A' },
    { id: 'bifocal', nome: 'Bifocal Teste', tags_uso: [], tags_beneficios: [], clinical_category: 'bifocal', sourceLaboratorio: 'Lab B' },
  ],
  offers: [
    { id: 'm1', family_id: 'multi', raw_label: 'Progressiva 1', canonical_label: null, clinical_category: 'multifocal', features: {}, base_price: 500, is_atomic_offer: true, already_includes_treatment: false, allows_composition: false, source_page_reference: null },
    { id: 'b1', family_id: 'bifocal', raw_label: 'Bifocal 1', canonical_label: null, clinical_category: 'bifocal', features: {}, base_price: 400, is_atomic_offer: true, already_includes_treatment: false, allows_composition: false, source_page_reference: null },
  ],
  grids: [
    { offer_id: 'm1', sph_min: -10, sph_max: 10, cyl_min: -6, cyl_max: 0, add_min: 0.75, add_max: 4 },
    { offer_id: 'b1', sph_min: -10, sph_max: 10, cyl_min: -6, cyl_max: 0, add_min: 0.75, add_max: 4 },
  ],
  usageProfiles: [], compatibilities: [], treatments: [],
}

test('adicao indica uma unica categoria e recusa multifocal direciona para bifocal', async () => {
  const input = buildRecommendationCaseInput({ receitaLongeOdEsferico: '0', receitaAdicao: '+2', rejectMultifocal: 'sim' })
  assert.deepEqual(getDesiredClinicalCategories(input), ['bifocal'])
  const options = await recommendLensConfigurations({
    versionId: 'test', catalog,
    caseInput: input,
  })
  assert.ok(options.length > 0)
  assert.ok(options.every((option) => option.clinicalCategory === 'bifocal'))
})

test('cilindro vazio equivale a zero e receita com apenas um olho nao zera as candidatas', async () => {
  const input = buildRecommendationCaseInput({
    olhosUtilizaveis: 'ambos',
    receitaLongeOdEsferico: '+3,00',
    receitaLongeOdCilindrico: '',
    receitaLongeOeEsferico: '',
    receitaLongeOeCilindrico: '',
    receitaAdicao: '+3,00',
  })
  const options = await recommendLensConfigurations({
    versionId: 'test', catalog,
    caseInput: input,
  })
  assert.ok(options.length > 0)
  assert.ok(options.every((option) => option.clinicalCategory === 'multifocal'))
})

test('recusar multifocal e bifocal nao gera alternativa automatica', async () => {
  const options = await recommendLensConfigurations({
    versionId: 'test', catalog,
    caseInput: buildRecommendationCaseInput({ receitaLongeOdEsferico: '0', receitaAdicao: '+2', rejectMultifocal: 'sim', rejectBifocal: 'sim' }),
  })
  assert.deepEqual(options, [])
})
