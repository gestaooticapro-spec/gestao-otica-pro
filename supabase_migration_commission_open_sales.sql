-- Permite diferenciar comissoes finais de comissoes provisiorias de vendas em aberto.
ALTER TABLE commissions
ADD COLUMN IF NOT EXISTS commission_stage text NOT NULL DEFAULT 'final';

ALTER TABLE commissions
DROP CONSTRAINT IF EXISTS commissions_commission_stage_check;

ALTER TABLE commissions
ADD CONSTRAINT commissions_commission_stage_check
CHECK (commission_stage IN ('provisional', 'final'));

UPDATE commissions
SET commission_stage = 'final'
WHERE commission_stage IS NULL;
