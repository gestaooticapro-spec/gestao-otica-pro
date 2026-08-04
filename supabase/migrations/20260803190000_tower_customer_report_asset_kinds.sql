BEGIN;

ALTER TABLE public.tower_customer_report_assets
    DROP CONSTRAINT IF EXISTS tower_customer_report_assets_kind_check;

ALTER TABLE public.tower_customer_report_assets
    ADD CONSTRAINT tower_customer_report_assets_kind_check
    CHECK (kind IN (
        'visagismo',
        'visagismo_analysis',
        'visagismo_final',
        'measurement_front',
        'measurement_front_annotated',
        'measurement_profile',
        'measurement_profile_annotated',
        'heatmap'
    ));

COMMIT;
