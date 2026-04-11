const fs = require('fs');

let content = fs.readFileSync('src/lib/actions/evaluation.actions.ts', 'utf8');

// I need to add getRecentEvaluationsForEmployee to fetch last 30 evaluations for a specific employee
const newFunction = `

export async function getRecentEvaluationsForEmployee(
  employeeId: number,
  storeId: number,
  limit: number = 20
): Promise<OpticalEvaluationListItem[]> {
  try {
    const tableApi = createClient().from('optical_evaluations') as unknown as OpticalEvaluationsTableApi
    
    // Create query to fetch recent evaluations that are not converted (exported_venda_id is null)
    // and status is not concluida, so we can resume them. Also filter by store_id and employee_id.
    const query = createClient()
      .from('optical_evaluations')
      .select(\`
        *,
        evaluated_patient:customers!optical_evaluations_evaluated_customer_id_fkey(full_name),
        responsible_customer:customers!optical_evaluations_responsible_customer_id_fkey(full_name)
      \`)
      .eq('store_id', storeId)
      .eq('employee_id', employeeId)
      .is('exported_venda_id', null)
      .not('status', 'eq', 'concluida')
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: records, error } = await query

    if (error) {
      console.error('getRecentEvaluationsForEmployee: Query error', error)
      return []
    }

    if (!records) return []

    return records.map((record: any) => ({
      ...record,
      evaluated_patient_name:
        record.evaluated_name_snapshot || 
        record.evaluated_patient?.full_name ||
        record.patient_name_raw || null,
      responsible_customer_name:
        record.responsible_name_snapshot ||
        record.responsible_customer?.full_name || null
    })) as OpticalEvaluationListItem[]
  } catch (error) {
    console.error('getRecentEvaluationsForEmployee: Unexpected error', error)
    return []
  }
}

export async function updateEvaluationPanicReason(
  evaluationId: number,
  storeId: number,
  panicReason: string
): Promise<EvaluationActionResult> {
  try {
    const tableApi = createAdminClient().from('optical_evaluations')
    
    const { error } = await tableApi
      .update({ panic_reason: panicReason })
      .eq('id', evaluationId)
      .eq('store_id', storeId)

    if (error) {
      return { success: false, message: error.message }
    }
    
    return { success: true, message: 'Motivo registrado com sucesso.' }
  } catch (error) {
    return { success: false, message: 'Falha inesperada.' }
  }
}
`;

content = content + newFunction;

fs.writeFileSync('src/lib/actions/evaluation.actions.ts', content, 'utf8');
console.log('evaluation.actions.ts updated for Phase 3!');
