const fs = require('fs');

let content = fs.readFileSync('src/components/evaluation/EvaluationInterface.tsx', 'utf8');

// The original script inserted the useEffect where `const selectedSubjectLabel = selectedSubjectType === 'dependente'` is found.
// Let's remove the first one and put it after `const patientNameMismatch` is defined.

// First remove the injected useEffect
const effectRegex = /\/\/ CRM Auto-save(?:.|\n)*?}, \[form, isSubjectChosen, authenticatedEmployee, evaluationId, selectedCustomer, selectedDependente, selectedSubjectType, selectedDependenteId, storeId\]\)/;
content = content.replace(effectRegex, '');

// Now we need to append it after `const patientNameMismatch = ...`
const patientNameMismatchRegex = /patientNameMismatch =[\s\S]*?normalizePersonName\(selectedSubjectName\)/;

const autoSaveCode = `

  // CRM Auto-save
  useEffect(() => {
    // Só salva automaticamente se tiver paciente escolhido E funcionário autenticado
    if (!isSubjectChosen || !authenticatedEmployee) {
      return
    }

    const timer = setTimeout(() => {
      startSaveTransition(async () => {
        setSyncStatus('saving')
        
        try {
          const derivedStatus: EvaluationStatus = form.sourceSystem === 'ivision' ? 'importada' : 'em_andamento'
          const payload = {
            storeId,
            evaluationId: evaluationId || undefined,
            evaluatedCustomerId: selectedSubjectType === 'customer' ? selectedCustomer?.id : null,
            evaluatedDependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null,
            responsibleCustomerId: selectedSubjectType === 'dependente' ? selectedCustomer?.id : null,
            evaluatedNameSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.full_name || '') : selectedCustomer?.full_name || '',
            responsibleNameSnapshot: selectedSubjectType === 'dependente' ? (selectedCustomer?.full_name || '') : null,
            relationshipSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.parentesco || 'Dependente') : 'Titular',
            employeeId: authenticatedEmployee.id,
            sourceSystem: form.sourceSystem,
            status: derivedStatus,
            parseStatus: form.parseStatus,
            sourceDocumentUrl: form.sourceUrl || null,
            sourceDocumentHost: form.sourceDocumentHost || null,
            sourceOsNumber: form.sourceOsNumber || null,
            sourceExamType: form.sourceExamType || null,
            sourceExamDatetime: form.sourceExamDatetime || null,
            patientNameRaw: form.patientNameRaw || null,
            ageYears: form.ageYears ? Number(form.ageYears) : null,
            estiloVidaUsoComputadorHoras: form.estiloVidaUsoComputadorHoras ? Number(form.estiloVidaUsoComputadorHoras) : null,
            estiloVidaDirigirHoras: form.estiloVidaDirigirHoras ? Number(form.estiloVidaDirigirHoras) : null,
            estiloVidaLeituraHoras: form.estiloVidaLeituraHoras ? Number(form.estiloVidaLeituraHoras) : null,
            estiloVidaUsoCelularHoras: form.estiloVidaUsoCelularHoras ? Number(form.estiloVidaUsoCelularHoras) : null,
            estiloVidaExposicaoSolHoras: form.estiloVidaExposicaoSolHoras ? Number(form.estiloVidaExposicaoSolHoras) : null,
            estiloVidaAmbienteInternoHoras: form.estiloVidaAmbienteInternoHoras ? Number(form.estiloVidaAmbienteInternoHoras) : null,
            estiloVidaAmbienteExternoHoras: form.estiloVidaAmbienteExternoHoras ? Number(form.estiloVidaAmbienteExternoHoras) : null,
            estiloVidaAssistirTvHoras: form.estiloVidaAssistirTvHoras ? Number(form.estiloVidaAssistirTvHoras) : null,
            receitaLongeOdEsferico: form.receitaLongeOdEsferico || null,
            receitaLongeOdCilindrico: form.receitaLongeOdCilindrico || null,
            receitaLongeOdEixo: form.receitaLongeOdEixo || null,
            receitaLongeOeEsferico: form.receitaLongeOeEsferico || null,
            receitaLongeOeCilindrico: form.receitaLongeOeCilindrico || null,
            receitaLongeOeEixo: form.receitaLongeOeEixo || null,
            receitaPertoOdEsferico: form.receitaPertoOdEsferico || null,
            receitaPertoOdCilindrico: form.receitaPertoOdCilindrico || null,
            receitaPertoOdEixo: form.receitaPertoOdEixo || null,
            receitaPertoOeEsferico: form.receitaPertoOeEsferico || null,
            receitaPertoOeCilindrico: form.receitaPertoOeCilindrico || null,
            receitaPertoOeEixo: form.receitaPertoOeEixo || null,
            receitaAdicao: form.receitaAdicao || null,
            medidaDnpOd: form.medidaDnpOd || null,
            medidaDnpOe: form.medidaDnpOe || null,
            medidaAlturaOd: form.medidaAlturaOd || null,
            medidaAlturaOe: form.medidaAlturaOe || null,
            recommendedLensName: form.recommendedLensName || null,
            commercialRecommendationRaw: form.commercialRecommendationRaw || null,
            extractedText: form.extractedText || null,
            rawPayloadJson: form.rawPayloadJson,
            parseWarning: form.parseWarning || null,
            documentHash: form.documentHash || null
          }

          const result = await upsertOpticalEvaluation(payload)

          if (result.success && result.data) {
            setEvaluationId(result.data.id)
            setSyncStatus('saved')
          } else {
            console.error('Save error:', result.message)
            setSyncStatus('error')
          }
        } catch (err) {
          console.error('Save error:', err)
          setSyncStatus('error')
        }
      })
    }, 1200)

    return () => clearTimeout(timer)
  }, [form, isSubjectChosen, authenticatedEmployee, evaluationId, selectedCustomer, selectedDependente, selectedSubjectType, selectedDependenteId, storeId])
`;

content = content.replace(patientNameMismatchRegex, (match) => {
  return match + autoSaveCode
})

fs.writeFileSync('src/components/evaluation/EvaluationInterface.tsx', content, 'utf8');
console.log('Fixed TS Error!');
