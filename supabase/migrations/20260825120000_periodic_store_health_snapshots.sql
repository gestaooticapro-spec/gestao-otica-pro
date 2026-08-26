-- Adds immutable weekly and monthly snapshots alongside the daily reports.
ALTER TABLE public.daily_store_health_reports
  ADD COLUMN IF NOT EXISTS cadence TEXT NOT NULL DEFAULT 'daily'
    CHECK (cadence IN ('daily', 'weekly', 'monthly'));

ALTER TABLE public.daily_store_health_reports
  ADD COLUMN IF NOT EXISTS period_start DATE;

ALTER TABLE public.daily_store_health_reports
  ADD COLUMN IF NOT EXISTS period_end DATE;

UPDATE public.daily_store_health_reports
SET period_start = report_date,
    period_end = report_date
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE public.daily_store_health_reports
  ALTER COLUMN period_start SET NOT NULL;

ALTER TABLE public.daily_store_health_reports
  ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE public.daily_store_health_reports
  DROP CONSTRAINT IF EXISTS daily_store_health_reports_store_id_report_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS daily_store_health_reports_store_cadence_period_idx
  ON public.daily_store_health_reports (store_id, cadence, period_start);

CREATE INDEX IF NOT EXISTS daily_store_health_reports_store_cadence_end_idx
  ON public.daily_store_health_reports (store_id, cadence, period_end DESC);
