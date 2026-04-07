import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078';

const TEST_PROFILES = {
  progressiva_telas_noite: {
    label: 'Presbita com telas + direcao noturna',
    esferico: -2.5,
    cilindrico: -0.75,
    adicao: 1.75,
    needs: ['computador', 'dirigir_noite'],
    desiredBenefits: ['adaptacao_rapida', 'conforto_baixa_luz', 'conforto_proximo'],
    preferredFeatures: ['blue_uv'],
    budgetMode: 'intermediario',
  },
  jovem_telas: {
    label: 'Jovem com fadiga visual em telas',
    esferico: -1.5,
    cilindrico: -0.5,
    adicao: null,
    needs: ['computador', 'smartphone'],
    desiredBenefits: ['reducao_fadiga_visual', 'protecao_luz_azul', 'nitidez'],
    preferredFeatures: ['blue_uv'],
    budgetMode: 'intermediario',
  },
  solar_pronta: {
    label: 'Cliente buscando lente solar pronta',
    esferico: -2.0,
    cilindrico: -0.5,
    adicao: null,
    needs: ['sol', 'dirigir_dia'],
    desiredBenefits: ['coloracao', 'disponibilidade_estoque'],
    preferredFeatures: ['solar', 'coloracao'],
    budgetMode: 'economico',
  },
};

function getDesiredClinicalCategories(profile) {
  if (profile.adicao != null) {
    return ['multifocal', 'bifocal'];
  }

  if ((profile.needs || []).includes('controle_miopia')) {
    return ['controle_miopia'];
  }

  if ((profile.needs || []).includes('sol') && (profile.needs || []).length === 1) {
    return ['plana_solar', 'visao_simples'];
  }

  return ['visao_simples', 'ocupacional'];
}

function parseArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function between(value, min, max) {
  if (value == null || min == null || max == null) return true;
  const low = Math.min(Number(min), Number(max));
  const high = Math.max(Number(min), Number(max));
  return Number(value) >= low && Number(value) <= high;
}

function matchesGrid(profile, grids) {
  if (!grids.length) {
    return { eligible: true, reason: 'sem_grade_cadastrada' };
  }

  const matched = grids.some((grid) => {
    const sphOk = between(profile.esferico, grid.sph_min, grid.sph_max);
    const cylOk = between(profile.cilindrico, grid.cyl_min, grid.cyl_max);
    const addOk =
      profile.adicao == null
        ? true
        : grid.add_min == null && grid.add_max == null
          ? false
          : between(profile.adicao, grid.add_min, grid.add_max);
    return sphOk && cylOk && addOk;
  });

  return {
    eligible: matched,
    reason: matched ? 'grade_compativel' : 'fora_da_grade',
  };
}

function normalizeFeatureFlags(features = {}) {
  return Object.fromEntries(
    Object.entries(features).filter(([_, value]) => typeof value === 'boolean' && value === true),
  );
}

function scoreBudget(mode, price, prices) {
  if (price == null || !prices.length) return 0;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return 0;

  const normalized = (price - min) / (max - min);

  if (mode === 'economico') {
    return (1 - normalized) * 2;
  }
  if (mode === 'premium') {
    return normalized * 2;
  }
  return 1 - Math.abs(normalized - 0.5) * 2;
}

function resolveConfigPrice(offer, compatibility) {
  if (!compatibility) {
    return Number(offer.base_price);
  }

  if (compatibility.price_mode === 'surcharge') {
    return Number(offer.base_price || 0) + Number(compatibility.special_price || 0);
  }

  return Number(compatibility.special_price ?? offer.base_price);
}

function getTreatmentSemanticProfile(treatment) {
  return treatment?.features?.semantic_profile || null;
}

function resolveOfferClinicalCategory(family, offer) {
  const familyCategory = family.clinical_category || 'indefinida';
  const offerCategory = offer.clinical_category || 'indefinida';

  if (offerCategory !== 'indefinida') return offerCategory;
  if (familyCategory !== 'mista') return familyCategory;
  return 'indefinida';
}

function evaluateClinicalEligibility(profile, family, offer) {
  const desiredCategories = getDesiredClinicalCategories(profile);
  const familyCategory = family.clinical_category || 'indefinida';
  const effectiveCategory = resolveOfferClinicalCategory(family, offer);

  if (effectiveCategory !== 'indefinida') {
    return {
      eligible: desiredCategories.includes(effectiveCategory),
      effectiveCategory,
      confidencePenalty: 0,
      desiredCategories,
    };
  }

  if (familyCategory === 'mista') {
    return {
      eligible: true,
      effectiveCategory,
      confidencePenalty: 2,
      desiredCategories,
    };
  }

  return {
    eligible: false,
    effectiveCategory,
    confidencePenalty: 0,
    desiredCategories,
  };
}

function scoreOffer({ offer, family, usageProfile, profile, peerPrices, clinicalEvaluation }) {
  let score = 0;
  const reasons = [];

  const familyUsage = usageProfile?.usage_tags || family.tags_uso || [];
  const familyBenefits = usageProfile?.benefit_tags || family.tags_beneficios || [];
  const offerFeatures = normalizeFeatureFlags(offer.features);

  if (clinicalEvaluation.effectiveCategory !== 'indefinida') {
    score += 5;
    reasons.push(`categoria:${clinicalEvaluation.effectiveCategory}`);
  } else if (clinicalEvaluation.confidencePenalty > 0) {
    score -= clinicalEvaluation.confidencePenalty;
    reasons.push('categoria:mista_sem_oferta_definida');
  }

  for (const need of profile.needs || []) {
    if (familyUsage.includes(need)) {
      score += 4;
      reasons.push(`uso:${need}`);
    }
  }

  for (const benefit of profile.desiredBenefits || []) {
    if (familyBenefits.includes(benefit)) {
      score += 3;
      reasons.push(`beneficio:${benefit}`);
    }
  }

  for (const preferred of profile.preferredFeatures || []) {
    if (offerFeatures[preferred] === true) {
      score += 3;
      reasons.push(`feature:${preferred}`);
    }
  }

  if (offer.is_atomic_offer) {
    score += 0.5;
    reasons.push('oferta_atomica');
  }

  if (offer.already_includes_treatment) {
    score += 0.5;
    reasons.push('inclui_tratamento');
  }

  const budgetScore = scoreBudget(profile.budgetMode, Number(offer.base_price), peerPrices);
  score += budgetScore;
  if (budgetScore > 0.5) {
    reasons.push(`orcamento:${profile.budgetMode}`);
  }

  return {
    score: Number(score.toFixed(2)),
    reasons,
  };
}

function scoreTreatment({ treatment, profile }) {
  let score = 0;
  const reasons = [];
  const name = (treatment?.nome || '').toLowerCase();
  const type = (treatment?.tipo || '').toLowerCase();
  const semantic = getTreatmentSemanticProfile(treatment);
  const semanticUsage = semantic?.usage_tags || [];
  const semanticBenefits = semantic?.benefit_tags || [];
  const priceTier = semantic?.price_tier || null;

  if (type === 'antirreflexo') {
    score += 2;
    reasons.push('tratamento:antirreflexo');
  }

  for (const need of profile.needs || []) {
    if (semanticUsage.includes(need)) {
      score += 2;
      reasons.push(`tratamento_uso:${need}`);
    }
  }

  for (const benefit of profile.desiredBenefits || []) {
    if (semanticBenefits.includes(benefit)) {
      score += 2;
      reasons.push(`tratamento_beneficio:${benefit}`);
    }
  }

  if (profile.budgetMode === 'economico' && ['economico', 'intermediario'].includes(priceTier)) {
    score += priceTier === 'economico' ? 2 : 1;
    reasons.push(`tratamento_orcamento:${priceTier}`);
  }

  if (profile.budgetMode === 'intermediario' && ['intermediario', 'premium'].includes(priceTier)) {
    score += priceTier === 'intermediario' ? 1.5 : 0.5;
    reasons.push(`tratamento_orcamento:${priceTier}`);
  }

  if ((profile.needs || []).includes('computador') && (name.includes('crizal') || name.includes('trio') || name.includes('vert clair'))) {
    score += 1.5;
    reasons.push('tratamento:conforto_telas');
  }

  if ((profile.needs || []).includes('dirigir_noite') && (name.includes('sapphire') || name.includes('crizal'))) {
    score += 1.5;
    reasons.push('tratamento:dirigir_noite');
  }

  if ((profile.needs || []).includes('sol') && (name.includes('transitions') || name.includes('photochromic'))) {
    score += 1;
    reasons.push('tratamento:outdoor');
  }

  return {
    score,
    reasons,
  };
}

function dedupeRankedEntries(entries) {
  const bestByKey = new Map();

  for (const entry of entries) {
    const key = `${entry.family} | ${entry.raw_label} | ${entry.treatment_name || 'sem_tratamento'}`;
    const current = bestByKey.get(key);

    if (
      !current ||
      entry.score > current.score ||
      (entry.score === current.score && (entry.final_price ?? Infinity) < (current.final_price ?? Infinity))
    ) {
      bestByKey.set(key, entry);
    }
  }

  return Array.from(bestByKey.values()).sort(
    (a, b) => b.score - a.score || (a.base_price ?? 0) - (b.base_price ?? 0),
  );
}

async function loadCatalog(versionId) {
  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id,nome,tags_uso,tags_beneficios,clinical_category')
    .eq('version_id', versionId);

  if (familiesError) throw familiesError;

  const familyIds = families.map((family) => family.id);

  const [{ data: offers, error: offersError }, { data: grids, error: gridsError }, { data: usageProfiles, error: profilesError }, { data: compatibilities, error: compatError }, { data: treatments, error: treatmentsError }] =
    await Promise.all([
      supabase
        .from('global_lens_offers')
        .select(
          'id,family_id,raw_label,canonical_label,clinical_category,features,base_price,is_atomic_offer,already_includes_treatment,allows_composition,source_page_reference',
        )
        .in('family_id', familyIds),
      supabase
        .from('global_offer_diopter_grids')
        .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max'),
      supabase
        .from('global_usage_profiles')
        .select('family_id,usage_tags,benefit_tags,commercial_summary,recommendation_notes')
        .eq('profile_scope', 'family')
        .in('family_id', familyIds),
      supabase
        .from('global_offer_treatments_compatibility')
        .select('offer_id,treatment_id,special_price,price_mode'),
      supabase
        .from('global_treatments')
        .select('id,nome,tipo,features')
        .eq('version_id', versionId),
    ]);

  if (offersError) throw offersError;
  if (gridsError) throw gridsError;
  if (profilesError) throw profilesError;
  if (compatError) throw compatError;
  if (treatmentsError) throw treatmentsError;

  return {
    families,
    offers,
    grids,
    usageProfiles,
    compatibilities,
    treatments,
  };
}

async function run(profileKey) {
  const profile = TEST_PROFILES[profileKey];
  if (!profile) {
    console.error(`Perfil desconhecido: ${profileKey}`);
    console.error(`Perfis disponiveis: ${Object.keys(TEST_PROFILES).join(', ')}`);
    process.exit(1);
  }

  const { families, offers, grids, usageProfiles, compatibilities, treatments } = await loadCatalog(VERSION_ID);
  const familyById = new Map(families.map((family) => [family.id, family]));
  const usageProfileByFamilyId = new Map(usageProfiles.map((entry) => [entry.family_id, entry]));
  const gridsByOfferId = new Map();
  const treatmentById = new Map(treatments.map((treatment) => [treatment.id, treatment]));
  const compatibilitiesByOfferId = new Map();

  for (const grid of grids) {
    if (!gridsByOfferId.has(grid.offer_id)) {
      gridsByOfferId.set(grid.offer_id, []);
    }
    gridsByOfferId.get(grid.offer_id).push(grid);
  }

  for (const compatibility of compatibilities) {
    if (!compatibilitiesByOfferId.has(compatibility.offer_id)) {
      compatibilitiesByOfferId.set(compatibility.offer_id, []);
    }
    compatibilitiesByOfferId.get(compatibility.offer_id).push(compatibility);
  }

  const technicallyEligible = [];
  for (const offer of offers) {
    const family = familyById.get(offer.family_id);
    const offerGrids = gridsByOfferId.get(offer.id) || [];
    const gradeCheck = matchesGrid(profile, offerGrids);
    const clinicalEvaluation = evaluateClinicalEligibility(profile, family, offer);

    if (!gradeCheck.eligible) continue;
    if (!clinicalEvaluation.eligible) continue;

    technicallyEligible.push({
      offer,
      family,
      usageProfile: usageProfileByFamilyId.get(offer.family_id),
      gradeReason: gradeCheck.reason,
      clinicalEvaluation,
    });
  }

  const candidateConfigs = [];
  for (const entry of technicallyEligible) {
    const compatRows = compatibilitiesByOfferId.get(entry.offer.id) || [];

    if (!compatRows.length) {
      candidateConfigs.push({
        ...entry,
        treatment: null,
        compatibility: null,
        finalPrice: Number(entry.offer.base_price),
      });
      continue;
    }

    for (const compatibility of compatRows) {
      const treatment = treatmentById.get(compatibility.treatment_id);
      candidateConfigs.push({
        ...entry,
        treatment,
        compatibility,
        finalPrice: resolveConfigPrice(entry.offer, compatibility),
      });
    }
  }

  const peerPrices = candidateConfigs
    .map((entry) => Number(entry.finalPrice))
    .filter((value) => Number.isFinite(value));

  const ranked = candidateConfigs
    .map((entry) => {
      const offerScoring = scoreOffer({
        offer: entry.offer,
        family: entry.family,
        usageProfile: entry.usageProfile,
        profile,
        peerPrices,
        clinicalEvaluation: entry.clinicalEvaluation,
      });
      const treatmentScoring = scoreTreatment({
        treatment: entry.treatment,
        profile,
      });
      const totalScore = Number((offerScoring.score + treatmentScoring.score).toFixed(2));

      return {
        family: entry.family.nome,
        raw_label: entry.offer.raw_label,
        canonical_label: entry.offer.canonical_label,
        clinical_category: entry.clinicalEvaluation.effectiveCategory,
        base_price: entry.offer.base_price,
        treatment_name: entry.treatment?.nome || null,
        treatment_type: entry.treatment?.tipo || null,
        treatment_summary: getTreatmentSemanticProfile(entry.treatment)?.commercial_summary || null,
        treatment_notes: getTreatmentSemanticProfile(entry.treatment)?.recommendation_notes || null,
        treatment_explain_why: getTreatmentSemanticProfile(entry.treatment)?.explain_why || null,
        price_mode: entry.compatibility?.price_mode || 'final',
        final_price: entry.finalPrice,
        source_page_reference: entry.offer.source_page_reference,
        score: totalScore,
        reasons: [...offerScoring.reasons, ...treatmentScoring.reasons],
        commercial_summary: entry.usageProfile?.commercial_summary || null,
        recommendation_notes: entry.usageProfile?.recommendation_notes || null,
      };
    })
    .sort((a, b) => b.score - a.score || (a.final_price ?? 0) - (b.final_price ?? 0));

  const dedupedRanked = dedupeRankedEntries(ranked);
  const top3 = dedupedRanked.slice(0, 3);

  console.log('');
  console.log(`Perfil: ${profile.label}`);
  console.log(
    JSON.stringify(
      {
        esferico: profile.esferico,
        cilindrico: profile.cilindrico,
        adicao: profile.adicao,
        desiredClinicalCategories: getDesiredClinicalCategories(profile),
        needs: profile.needs,
        desiredBenefits: profile.desiredBenefits,
        preferredFeatures: profile.preferredFeatures,
        budgetMode: profile.budgetMode,
      },
      null,
      2,
    ),
  );
  console.log('');
  console.log(`Candidatas tecnicas: ${technicallyEligible.length}`);
  console.log(`Configuracoes elegiveis: ${candidateConfigs.length}`);
  console.log(`Configuracoes unicas para ranking: ${dedupedRanked.length}`);
  console.log('');
  console.table(
    top3.map((entry, index) => ({
      posicao: index + 1,
      familia: entry.family,
      oferta: entry.raw_label,
      tratamento: entry.treatment_name || 'Sem tratamento explicito',
      categoria: entry.clinical_category,
      preco_final: entry.final_price,
      score: entry.score,
      pagina: entry.source_page_reference,
      motivos: entry.reasons.join(', '),
    })),
  );

  for (const [index, entry] of top3.entries()) {
    console.log(`\n#${index + 1} ${entry.family} | ${entry.raw_label}${entry.treatment_name ? ` + ${entry.treatment_name}` : ''}`);
    console.log(`Preco final: R$ ${Number(entry.final_price || 0).toFixed(2)}`);
    if (entry.commercial_summary) {
      console.log(`Resumo: ${entry.commercial_summary}`);
    }
    if (entry.recommendation_notes) {
      console.log(`Notas: ${entry.recommendation_notes}`);
    }
    if (entry.treatment_summary) {
      console.log(`Tratamento: ${entry.treatment_summary}`);
    }
    if (entry.treatment_explain_why) {
      console.log(`Por que este tratamento: ${entry.treatment_explain_why}`);
    }
  }
}

const selectedProfile = parseArg('--profile') || 'progressiva_telas_noite';
run(selectedProfile).catch((error) => {
  console.error(error);
  process.exit(1);
});
