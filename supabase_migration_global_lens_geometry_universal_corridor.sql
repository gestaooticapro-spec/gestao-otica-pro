CREATE TABLE IF NOT EXISTS global_lens_geometry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name TEXT NOT NULL,
    visual_design_type TEXT NOT NULL DEFAULT 'progressive',
    distance_present BOOLEAN NOT NULL DEFAULT TRUE,
    distance_width NUMERIC(5,2) NULL,
    intermediate_present BOOLEAN NOT NULL DEFAULT TRUE,
    intermediate_width NUMERIC(5,2) NULL,
    corridor_opening NUMERIC(5,2) NOT NULL DEFAULT 0,
    near_present BOOLEAN NOT NULL DEFAULT TRUE,
    near_width NUMERIC(5,2) NULL,
    corridor_length NUMERIC(5,2) NULL,
    lateral_blur NUMERIC(5,2) NULL,
    inset NUMERIC(5,2) NULL,
    distance_reference_height NUMERIC(5,2) NULL,
    near_reference_height NUMERIC(5,2) NULL,
    fitting_height NUMERIC(5,2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_lens_geometry_unique UNIQUE (family_name),
    CONSTRAINT global_lens_geometry_visual_design_type_check
        CHECK (visual_design_type IN ('progressive', 'occupational', 'personalized', 'single_vision_standard'))
);

ALTER TABLE global_lens_geometry
ADD COLUMN IF NOT EXISTS corridor_opening NUMERIC NOT NULL DEFAULT 0;

UPDATE global_lens_geometry
SET corridor_opening = COALESCE(intermediate_width, 0)
WHERE corridor_opening = 0;

ALTER TABLE global_lens_geometry
DROP CONSTRAINT IF EXISTS global_lens_geometry_corridor_opening_check;

ALTER TABLE global_lens_geometry
ADD CONSTRAINT global_lens_geometry_corridor_opening_check
CHECK (corridor_opening >= 0 AND corridor_opening <= 300);

COMMENT ON COLUMN global_lens_geometry.corridor_opening IS
'Universal corridor opening scale: 0 means no corridor, 300 means maximum opening used for cross-family comparison.';
