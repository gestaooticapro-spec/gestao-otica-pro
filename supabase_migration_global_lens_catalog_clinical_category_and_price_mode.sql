ALTER TABLE global_lens_families
ADD COLUMN IF NOT EXISTS clinical_category TEXT NOT NULL DEFAULT 'indefinida';

ALTER TABLE global_lens_families
DROP CONSTRAINT IF EXISTS global_lens_families_clinical_category_check;

ALTER TABLE global_lens_families
ADD CONSTRAINT global_lens_families_clinical_category_check
CHECK (clinical_category IN ('multifocal', 'visao_simples', 'ocupacional', 'bifocal', 'controle_miopia', 'plana_solar', 'mista', 'indefinida'));

ALTER TABLE global_lens_offers
ADD COLUMN IF NOT EXISTS clinical_category TEXT NOT NULL DEFAULT 'indefinida';

ALTER TABLE global_lens_offers
DROP CONSTRAINT IF EXISTS global_lens_offers_clinical_category_check;

ALTER TABLE global_lens_offers
ADD CONSTRAINT global_lens_offers_clinical_category_check
CHECK (clinical_category IN ('multifocal', 'visao_simples', 'ocupacional', 'bifocal', 'controle_miopia', 'plana_solar', 'mista', 'indefinida'));

ALTER TABLE global_offer_treatments_compatibility
ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'final';

ALTER TABLE global_offer_treatments_compatibility
DROP CONSTRAINT IF EXISTS global_offer_treatments_compatibility_price_mode_check;

ALTER TABLE global_offer_treatments_compatibility
ADD CONSTRAINT global_offer_treatments_compatibility_price_mode_check
CHECK (price_mode IN ('final', 'surcharge'));
