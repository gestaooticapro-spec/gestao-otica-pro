const fs = require('fs');

let content = fs.readFileSync('src/components/evaluation/EvaluationInterface.tsx', 'utf8');

// 1. Import dependencies
if (!content.includes('import { EvaluationDashboard }')) {
  // Insert import right after import { Database }
  content = content.replace(
    /import \{ Database \} from '@\/lib\/database\.types'/,
    "import { Database } from '@/lib/database.types'\nimport { EvaluationDashboard } from './EvaluationDashboard'\nimport { getRecentEvaluationsForEmployee, updateEvaluationPanicReason } from '@/lib/actions/evaluation.actions'"
  );
}

if (!content.includes('const [recentEvaluations,')) {
  // Add state for recentEvaluations inside the component
  content = content.replace(
    /const \[customerResults, setCustomerResults\] \= useState<CustomerSearchResult\[\]>\(\[\]\)/,
    "const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([])\n  const [recentEvaluations, setRecentEvaluations] = useState<OpticalEvaluationListItem[]>([])\n  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)"
  );
}

// 2. Add an effect to load recent evaluations when authenticatedEmployee is set and no customer is selected
if (!content.includes('useEffect(() => { // Load Dashboard')) {
  const dashboardEffect = `
  useEffect(() => { // Load Dashboard
    if (authenticatedEmployee && !selectedCustomer && query.length === 0) {
      setIsLoadingDashboard(true)
      getRecentEvaluationsForEmployee(authenticatedEmployee.id, storeId).then(list => {
        setRecentEvaluations(list)
        setIsLoadingDashboard(false)
      })
    }
  }, [authenticatedEmployee, selectedCustomer, query.length, storeId])
`;
  content = content.replace(
    /const clearSubject = \(\) => \{/,
    dashboardEffect + "\n  const clearSubject = () => {"
  );
}

// 3. Add onSelectEvaluation logic
if (!content.includes('const handleSelectEvaluation =')) {
  const selectEvalLogic = `
  const handleSelectEvaluation = (ev: OpticalEvaluationListItem) => {
    // Restaurar estado da avaliação
    setEvaluationId(ev.id)
    setSyncStatus('saved')
    
    // Configurar sujeito
    if (ev.evaluated_dependente_id) {
      setSelectedSubjectType('dependente')
      setSelectedDependenteId(String(ev.evaluated_dependente_id))
    } else if (ev.evaluated_customer_id) {
      setSelectedSubjectType('customer')
    }
    
    // Fake customer search to simulate they are selected
    if (ev.evaluated_patient_name) {
       setQuery(ev.evaluated_patient_name)
       setSelectedCustomer({
           id: ev.responsible_customer_id || ev.evaluated_customer_id || 0,
           full_name: ev.responsible_customer_name || ev.evaluated_patient_name,
           cpf: '', fone_movel: '', tem_pendencia: false
       })
    }
    
    // Restaurar forms
    setForm({
      ...createEmptyForm(),
      sourceSystem: ev.source_system,
      status: ev.status,
      sourceUrl: ev.source_document_url || '',
      sourceDocumentHost: ev.source_document_host || '',
      sourceOsNumber: ev.source_os_number || '',
      sourceExamType: ev.source_exam_type || '',
      sourceExamDatetime: ev.source_exam_datetime ? ev.source_exam_datetime.slice(0, 16) : '',
      patientNameRaw: ev.patient_name_raw || '',
      ageYears: ev.age_years ? String(ev.age_years) : '',
      receitaLongeOdEsferico: ev.receita_longe_od_esferico || '',
      receitaLongeOdCilindrico: ev.receita_longe_od_cilindrico || '',
      receitaLongeOdEixo: ev.receita_longe_od_eixo || '',
      receitaLongeOeEsferico: ev.receita_longe_oe_esferico || '',
      receitaLongeOeCilindrico: ev.receita_longe_oe_cilindrico || '',
      receitaLongeOeEixo: ev.receita_longe_oe_eixo || '',
      receitaPertoOdEsferico: ev.receita_perto_od_esferico || '',
      receitaPertoOdCilindrico: ev.receita_perto_od_cilindrico || '',
      receitaPertoOdEixo: ev.receita_perto_od_eixo || '',
      receitaPertoOeEsferico: ev.receita_perto_oe_esferico || '',
      receitaPertoOeCilindrico: ev.receita_perto_oe_cilindrico || '',
      receitaPertoOeEixo: ev.receita_perto_oe_eixo || '',
      receitaAdicao: ev.receita_adicao || '',
      medidaDnpOd: ev.medida_dnp_od || '',
      medidaDnpOe: ev.medida_dnp_oe || '',
      medidaAlturaOd: ev.medida_altura_od || '',
      medidaAlturaOe: ev.medida_altura_oe || '',
      recommendedLensName: ev.recommended_lens_name || '',
      commercialRecommendationRaw: ev.commercial_recommendation_raw || '',
      rawPayloadJson: ev.raw_payload_json || {}
    })
  }
`;
  content = content.replace(
    /const handleSelectCustomer = \(/,
    selectEvalLogic + "\n  const handleSelectCustomer = ("
  );
}

// 4. Update the quick retention intent logic to automatically save the panic reason
content = content.replace(
  /setQuickRetentionReply\([\s\S]*?\}\)\n    \)/,
  `const reply = buildQuickRetentionReply({
        intent,
        recommendations: aiRecommendations,
        activeCatalog,
        activeCatalogs,
      })
    setQuickRetentionReply(reply)
    
    // Salvar silenciosamente que o consultor acionou esse intent
    if (evaluationId && authenticatedEmployee) {
        updateEvaluationPanicReason(evaluationId, storeId, intent)
    }`
);

// 5. Inject EvaluationDashboard when empty instead of empty space
// We search for `{!selectedCustomer && (query.length >= 2 || customerResults.length > 0) && (`
// And we insert the empty dashboard right before it, but we need to handle the query length correctly.

const dashboardUI = `
              {!selectedCustomer && query.length < 2 && (
                <div className="mt-4 pt-4 border-t border-white/10 flex-1">
                  <EvaluationDashboard 
                    employeeName={authenticatedEmployee?.full_name || ''} 
                    evaluations={recentEvaluations} 
                    onSelectEvaluation={handleSelectEvaluation}
                    isLoading={isLoadingDashboard}
                  />
                </div>
              )}
`;

content = content.replace(
  /{!selectedCustomer && \(query\.length >= 2 \|\| customerResults\.length > 0\) && \(/,
  dashboardUI + "\n              {!selectedCustomer && (query.length >= 2 || customerResults.length > 0) && ("
);

// 6. Add "Ir para Venda" logic in the bottom area or right column
// First let's find a good spot: maybe below the Quick Response area.
const goToVendaButton = `
            {evaluationId && selectedCustomer && (
              <div className="mt-8 pt-4 border-t border-white/10 flex justify-end">
                <a
                  href={\`/dashboard/loja/\${storeId}/vendas/nova?evaluation_id=\${evaluationId}\`}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider px-6 py-3 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all"
                >
                  <Briefcase className="h-5 w-5" />
                  Ir para Venda (Checkout)
                </a>
              </div>
            )}
`;

// Insert it before the final closing div of the right column
content = content.replace(
  /\{\/\* AI Chat Assistant \*\/\}/,
  goToVendaButton + "\n          {/* AI Chat Assistant */}"
);


fs.writeFileSync('src/components/evaluation/EvaluationInterface.tsx', content, 'utf8');
console.log('EvaluationInterface updated with Phase 3 UI!');
