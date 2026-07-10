-- Adiciona suporte a contas recorrentes e parceladas em accounts_payable.
ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS recurring_group_id uuid;

ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS installment_number integer;

ALTER TABLE accounts_payable
ADD COLUMN IF NOT EXISTS installment_total integer;

ALTER TABLE accounts_payable
DROP CONSTRAINT IF EXISTS accounts_payable_installment_number_check;

ALTER TABLE accounts_payable
ADD CONSTRAINT accounts_payable_installment_number_check
CHECK (installment_number IS NULL OR installment_number >= 1);

ALTER TABLE accounts_payable
DROP CONSTRAINT IF EXISTS accounts_payable_installment_total_check;

ALTER TABLE accounts_payable
ADD CONSTRAINT accounts_payable_installment_total_check
CHECK (installment_total IS NULL OR installment_total >= 1);

ALTER TABLE accounts_payable
DROP CONSTRAINT IF EXISTS accounts_payable_installment_pair_check;

ALTER TABLE accounts_payable
ADD CONSTRAINT accounts_payable_installment_pair_check
CHECK (
  (installment_number IS NULL AND installment_total IS NULL)
  OR (installment_number IS NOT NULL AND installment_total IS NOT NULL AND installment_number <= installment_total)
);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_recurring_group_id
ON accounts_payable (recurring_group_id);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_is_recurring_due_date
ON accounts_payable (store_id, is_recurring, due_date);
