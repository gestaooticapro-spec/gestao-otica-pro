-- O Campo Visual pode começar na Torre sem cliente nem avaliação.
-- O vínculo é preenchido depois, ao associar a tower_session.
ALTER TABLE public.tower_heatmap_sessions
    ALTER COLUMN customer_id DROP NOT NULL,
    ALTER COLUMN optical_evaluation_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tower_heatmap_sessions_tower_status
    ON public.tower_heatmap_sessions(tower_session_id, status, created_at DESC)
    WHERE tower_session_id IS NOT NULL;
