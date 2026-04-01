-- 1. Adiciona/normaliza a coluna que diferencia comissões individuais das globais.
ALTER TABLE commissions
ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE commissions
SET type = 'individual'
WHERE type IS NULL;

ALTER TABLE commissions
ALTER COLUMN type SET DEFAULT 'individual';

ALTER TABLE commissions
ALTER COLUMN type SET NOT NULL;

-- 2. Torna venda_id opcional (comissões globais não são atreladas a uma única venda)
ALTER TABLE commissions
ALTER COLUMN venda_id DROP NOT NULL;

-- 3. Adiciona a coluna de referência do período mensal das globais.
ALTER TABLE commissions
ADD COLUMN IF NOT EXISTS period_ref TEXT;

-- 4. Remove duplicidades prévias de comissão global antes de criar a trava única.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY store_id, employee_id, type, period_ref
            ORDER BY
                CASE WHEN status = 'Pago' THEN 0 ELSE 1 END,
                created_at DESC,
                id DESC
        ) AS rn
    FROM commissions
    WHERE type = 'global_store'
      AND period_ref IS NOT NULL
)
DELETE FROM commissions c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 5. Performance para busca por período.
CREATE INDEX IF NOT EXISTS idx_commissions_period_ref ON commissions(period_ref);

-- 6. Garante uma única comissão global por funcionário/período.
CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_store_employee_type_period_unique
ON commissions(store_id, employee_id, type, period_ref);
