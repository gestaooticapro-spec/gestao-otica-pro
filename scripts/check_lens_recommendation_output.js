import fs from 'fs'
import path from 'path'

const [personaKey, outputPath] = process.argv.slice(2)
const specsPath = path.join(process.cwd(), '.tabelas', 'regressao_personagens_lentes.json')

function fail(message) {
  console.error(`ERRO: ${message}`)
  process.exit(1)
}

function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  if (!fs.existsSync(absolute)) fail(`arquivo nao encontrado: ${absolute}`)
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function containsAny(haystack, needles) {
  return asArray(needles).some((needle) => haystack.includes(needle))
}

function optionLabel(option) {
  return [option.sourceLaboratorio, option.familyName, option.offerLabel, option.treatmentName]
    .filter(Boolean)
    .join(' | ')
}

function getRecommendations(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.recommendations)) return payload.recommendations
  if (Array.isArray(payload.data?.recommendations)) return payload.data.recommendations
  if (Array.isArray(payload.data?.state?.recommendations)) return payload.data.state.recommendations
  fail('nao encontrei array recommendations no JSON informado')
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message)
}

function main() {
  const specs = readJson(specsPath)

  if (!personaKey || !outputPath) {
    console.log('Uso: node scripts/check_lens_recommendation_output.js <persona> <arquivo-json>')
    console.log(`Personas: ${Object.keys(specs).join(', ')}`)
    process.exit(1)
  }

  const spec = specs[personaKey]
  if (!spec) fail(`persona nao encontrada: ${personaKey}`)

  const payload = readJson(outputPath)
  const recommendations = getRecommendations(payload)
  const top = recommendations[0]
  if (!top) fail('recommendations vazio')

  const assertions = spec.assertions || {}
  const topReasons = asArray(top.reasons)
  const topLabel = optionLabel(top)
  const top3 = recommendations.slice(0, 3)
  const top3Reasons = top3.flatMap((option) => asArray(option.reasons))
  const top3Labels = top3.map(optionLabel)
  const failures = []
  const warnings = []

  if (assertions.topClinicalCategory) {
    assert(
      assertions.topClinicalCategory.includes(top.clinicalCategory),
      `top clinicalCategory esperado ${assertions.topClinicalCategory.join('|')}, veio ${top.clinicalCategory}`,
      failures,
    )
  }

  for (const category of asArray(assertions.forbiddenClinicalCategories)) {
    const offender = top3.find((option) => option.clinicalCategory === category)
    assert(!offender, `categoria proibida no top3: ${category} em ${optionLabel(offender || {})}`, failures)
  }

  for (const family of asArray(assertions.forbiddenFamilies)) {
    const offender = top3.find((option) => option.familyName === family)
    assert(!offender, `familia proibida no top3: ${family}`, failures)
  }

  for (const family of asArray(assertions.forbiddenTopFamilies)) {
    assert(top.familyName !== family, `familia proibida no top1: ${family}`, failures)
  }

  if (assertions.topMustIncludeAnyFamily) {
    assert(
      containsAny(topLabel, assertions.topMustIncludeAnyFamily),
      `top1 nao contem nenhuma familia esperada: ${assertions.topMustIncludeAnyFamily.join(', ')}`,
      failures,
    )
  }

  for (const category of asArray(assertions.requiredClinicalCategoryAnyTop3)) {
    assert(
      top3.some((option) => option.clinicalCategory === category),
      `categoria obrigatoria ausente no top3: ${category}`,
      failures,
    )
  }

  for (const reason of asArray(assertions.mustHaveReasonsAnyTop3)) {
    assert(top3Reasons.includes(reason), `reason obrigatorio ausente no top3: ${reason}`, failures)
  }

  for (const reason of asArray(assertions.forbiddenTopReasons)) {
    assert(!topReasons.includes(reason), `reason proibido no top1: ${reason}`, failures)
  }

  for (const reason of asArray(assertions.forbiddenReasonsAnyTop3)) {
    assert(!top3Reasons.includes(reason), `reason proibido no top3: ${reason}`, failures)
  }

  for (const reason of asArray(assertions.shouldHaveReasonsAnyTop3)) {
    if (!top3Reasons.includes(reason)) warnings.push(`reason desejavel ausente no top3: ${reason}`)
  }

  for (const orderAssertion of asArray(assertions.labelIncludesBefore)) {
    const [firstLabel, secondLabel] = orderAssertion
    const firstIndex = top3Labels.findIndex((label) => label.includes(firstLabel))
    const secondIndex = top3Labels.findIndex((label) => label.includes(secondLabel))
    assert(firstIndex !== -1, `label esperado ausente no top3: ${firstLabel}`, failures)
    assert(secondIndex !== -1, `label esperado ausente no top3: ${secondLabel}`, failures)
    if (firstIndex !== -1 && secondIndex !== -1) {
      assert(
        firstIndex < secondIndex,
        `ordem esperada no top3: "${firstLabel}" antes de "${secondLabel}"`,
        failures,
      )
    }
  }

  if (assertions.maxTopPrice != null) {
    assert(
      Number(top.finalPrice || 0) <= Number(assertions.maxTopPrice),
      `preco top1 ${top.finalPrice} acima do maximo esperado ${assertions.maxTopPrice}`,
      failures,
    )
  }

  console.log(`Persona: ${personaKey} - ${spec.label}`)
  console.log(`Top1: ${topLabel}`)
  console.log(`Preco top1: ${top.finalPrice}`)
  console.log('Top3:')
  top3Labels.forEach((label, index) => console.log(`${index + 1}. ${label}`))

  if (warnings.length) {
    console.log('\nAvisos:')
    warnings.forEach((warning) => console.log(`- ${warning}`))
  }

  if (failures.length) {
    console.log('\nFalhas:')
    failures.forEach((failure) => console.log(`- ${failure}`))
    process.exit(1)
  }

  console.log('\nOK: regressao passou.')
}

main()
