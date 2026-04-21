ALTER TABLE global_lens_geometry
ADD COLUMN IF NOT EXISTS pins JSONB NULL;

COMMENT ON COLUMN global_lens_geometry.pins IS
'Normalized pin coordinates (0-1) for blur zone calibration.
Structure: { distance: [{x,y},...], corridor: [{x,y},...], near: [{x,y},...], fitting_height: number }
When null, falls back to parametric rendering from legacy numeric fields.';
