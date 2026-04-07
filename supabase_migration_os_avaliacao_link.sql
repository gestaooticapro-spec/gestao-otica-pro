ALTER TABLE service_orders
ADD COLUMN IF NOT EXISTS source_optical_evaluation_id BIGINT NULL REFERENCES optical_evaluations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_source_optical_evaluation
ON service_orders(source_optical_evaluation_id);
