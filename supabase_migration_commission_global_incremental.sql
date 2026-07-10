-- Permite quitar comissoes globais durante o periodo sem congelar novas vendas.
-- Mantemos varias parcelas pagas e, no maximo, um saldo pendente por periodo.
DROP INDEX IF EXISTS idx_commissions_store_employee_type_period_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_store_employee_type_period_pending_unique
ON commissions(store_id, employee_id, type, period_ref)
WHERE type = 'global_store'
  AND period_ref IS NOT NULL
  AND status = 'Pendente';
