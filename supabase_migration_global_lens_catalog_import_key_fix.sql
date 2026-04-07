ALTER TABLE global_lens_offers
ADD COLUMN IF NOT EXISTS import_key TEXT;

UPDATE global_lens_offers
SET import_key = CONCAT(
    COALESCE(source_page_reference, 'sem-pagina'),
    ' | ',
    COALESCE(canonical_label, raw_label, 'sem-label'),
    ' | ',
    COALESCE(base_price::text, 'sem-preco')
)
WHERE import_key IS NULL;

ALTER TABLE global_lens_offers
ALTER COLUMN import_key SET NOT NULL;

ALTER TABLE global_lens_offers
DROP CONSTRAINT IF EXISTS global_lens_offers_unique;

ALTER TABLE global_lens_offers
ADD CONSTRAINT global_lens_offers_unique UNIQUE (family_id, import_key);

CREATE INDEX IF NOT EXISTS idx_global_lens_offers_import_key
    ON global_lens_offers(family_id, import_key);
