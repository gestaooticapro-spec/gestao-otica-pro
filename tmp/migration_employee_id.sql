ALTER TABLE optical_evaluations ADD COLUMN employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL;
