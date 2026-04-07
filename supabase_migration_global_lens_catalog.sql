CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS global_catalog_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laboratorio TEXT NOT NULL,
    versao TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'pdf',
    status TEXT NOT NULL DEFAULT 'draft',
    raw_pdf_url TEXT NULL,
    notes TEXT NULL,
    published_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_catalog_versions_status_check
        CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT global_catalog_versions_unique UNIQUE (laboratorio, versao)
);

CREATE TABLE IF NOT EXISTS catalog_source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    laboratorio TEXT NOT NULL,
    document_name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'pdf',
    source_path TEXT NULL,
    document_hash TEXT NOT NULL,
    extraction_engine TEXT NULL,
    extracted_text TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT catalog_source_documents_source_type_check
        CHECK (source_type IN ('pdf', 'text', 'json', 'manual')),
    CONSTRAINT catalog_source_documents_unique UNIQUE (version_id, document_hash)
);

CREATE TABLE IF NOT EXISTS catalog_source_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES catalog_source_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    extracted_text TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT catalog_source_pages_unique UNIQUE (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS catalog_source_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES catalog_source_pages(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT catalog_source_chunks_unique UNIQUE (page_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS global_lens_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    source_document_id UUID NULL REFERENCES catalog_source_documents(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    clinical_category TEXT NOT NULL DEFAULT 'indefinida',
    design TEXT NOT NULL,
    description_marketing TEXT NULL,
    tags_uso TEXT[] NOT NULL DEFAULT '{}'::text[],
    tags_beneficios TEXT[] NOT NULL DEFAULT '{}'::text[],
    source_page_reference TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_lens_families_clinical_category_check
        CHECK (clinical_category IN ('multifocal', 'visao_simples', 'ocupacional', 'bifocal', 'controle_miopia', 'plana_solar', 'mista', 'indefinida')),
    CONSTRAINT global_lens_families_unique UNIQUE (version_id, nome)
);

CREATE TABLE IF NOT EXISTS global_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    laboratorio TEXT NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_treatments_unique UNIQUE (version_id, nome)
);

CREATE TABLE IF NOT EXISTS global_lens_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES global_lens_families(id) ON DELETE CASCADE,
    import_key TEXT NOT NULL,
    raw_label TEXT NOT NULL,
    canonical_label TEXT NULL,
    clinical_category TEXT NOT NULL DEFAULT 'indefinida',
    material TEXT NULL,
    indice_refracao NUMERIC(5,2) NULL,
    is_atomic_offer BOOLEAN NOT NULL DEFAULT FALSE,
    allows_composition BOOLEAN NOT NULL DEFAULT TRUE,
    already_includes_treatment BOOLEAN NOT NULL DEFAULT FALSE,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    base_price NUMERIC(10,2) NULL,
    source_page_reference TEXT NULL,
    confidence_level NUMERIC(4,2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_lens_offers_confidence_check
        CHECK (confidence_level IS NULL OR (confidence_level >= 0 AND confidence_level <= 1)),
    CONSTRAINT global_lens_offers_clinical_category_check
        CHECK (clinical_category IN ('multifocal', 'visao_simples', 'ocupacional', 'bifocal', 'controle_miopia', 'plana_solar', 'mista', 'indefinida')),
    CONSTRAINT global_lens_offers_unique UNIQUE (family_id, import_key)
);

CREATE TABLE IF NOT EXISTS global_offer_diopter_grids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    sph_min NUMERIC(5,2) NOT NULL,
    sph_max NUMERIC(5,2) NOT NULL,
    cyl_min NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    cyl_max NUMERIC(5,2) NOT NULL,
    add_min NUMERIC(5,2) NULL,
    add_max NUMERIC(5,2) NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS global_offer_treatments_compatibility (
    offer_id UUID NOT NULL REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    treatment_id UUID NOT NULL REFERENCES global_treatments(id) ON DELETE CASCADE,
    special_price NUMERIC(10,2) NULL,
    price_mode TEXT NOT NULL DEFAULT 'final',
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_offer_treatments_compatibility_price_mode_check
        CHECK (price_mode IN ('final', 'surcharge')),
    PRIMARY KEY (offer_id, treatment_id)
);

CREATE TABLE IF NOT EXISTS global_usage_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NULL REFERENCES global_lens_families(id) ON DELETE CASCADE,
    offer_id UUID NULL REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    profile_scope TEXT NOT NULL DEFAULT 'family',
    usage_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    benefit_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    commercial_summary TEXT NULL,
    recommendation_notes TEXT NULL,
    source_page_reference TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_usage_profiles_scope_check
        CHECK (profile_scope IN ('family', 'offer')),
    CONSTRAINT global_usage_profiles_scope_target_check
        CHECK (
            (profile_scope = 'family' AND family_id IS NOT NULL AND offer_id IS NULL) OR
            (profile_scope = 'offer' AND offer_id IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS global_source_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    family_id UUID NULL REFERENCES global_lens_families(id) ON DELETE CASCADE,
    offer_id UUID NULL REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    treatment_id UUID NULL REFERENCES global_treatments(id) ON DELETE CASCADE,
    chunk_id UUID NULL REFERENCES catalog_source_chunks(id) ON DELETE SET NULL,
    evidence_type TEXT NOT NULL,
    raw_excerpt TEXT NOT NULL,
    normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_source_evidence_type_check
        CHECK (evidence_type IN ('family_marketing', 'offer_price', 'offer_feature', 'offer_label', 'treatment', 'grid', 'other'))
);

CREATE TABLE IF NOT EXISTS tenant_catalog_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    global_version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active',
    activated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_synced_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tenant_catalog_activations_status_check
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT tenant_catalog_activations_unique UNIQUE (store_id, global_version_id)
);

CREATE TABLE IF NOT EXISTS tenant_commercial_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activation_id UUID NOT NULL REFERENCES tenant_catalog_activations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    global_offer_id UUID NOT NULL REFERENCES global_lens_offers(id) ON DELETE RESTRICT,
    display_name TEXT NULL,
    price_cost NUMERIC(10,2) NULL,
    price_sell NUMERIC(10,2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tenant_commercial_offers_unique UNIQUE (activation_id, global_offer_id)
);

CREATE TABLE IF NOT EXISTS tenant_commercial_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activation_id UUID NOT NULL REFERENCES tenant_catalog_activations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    global_treatment_id UUID NOT NULL REFERENCES global_treatments(id) ON DELETE RESTRICT,
    display_name TEXT NULL,
    price_cost NUMERIC(10,2) NULL,
    price_sell NUMERIC(10,2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tenant_commercial_treatments_unique UNIQUE (activation_id, global_treatment_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_source_documents_version
    ON catalog_source_documents(version_id);

CREATE INDEX IF NOT EXISTS idx_catalog_source_pages_document
    ON catalog_source_pages(document_id, page_number);

CREATE INDEX IF NOT EXISTS idx_catalog_source_chunks_page
    ON catalog_source_chunks(page_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_global_lens_families_version
    ON global_lens_families(version_id, nome);

CREATE INDEX IF NOT EXISTS idx_global_treatments_version
    ON global_treatments(version_id, nome);

CREATE INDEX IF NOT EXISTS idx_global_lens_offers_family
    ON global_lens_offers(family_id);

CREATE INDEX IF NOT EXISTS idx_global_lens_offers_import_key
    ON global_lens_offers(family_id, import_key);

CREATE INDEX IF NOT EXISTS idx_global_lens_offers_atomic
    ON global_lens_offers(is_atomic_offer, allows_composition);

CREATE INDEX IF NOT EXISTS idx_global_offer_diopter_grids_offer
    ON global_offer_diopter_grids(offer_id);

CREATE INDEX IF NOT EXISTS idx_global_usage_profiles_family
    ON global_usage_profiles(family_id);

CREATE INDEX IF NOT EXISTS idx_global_usage_profiles_offer
    ON global_usage_profiles(offer_id);

CREATE INDEX IF NOT EXISTS idx_global_source_evidence_offer
    ON global_source_evidence(offer_id, evidence_type);

CREATE INDEX IF NOT EXISTS idx_tenant_catalog_activations_store
    ON tenant_catalog_activations(store_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_offers_store
    ON tenant_commercial_offers(store_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tenant_commercial_treatments_store
    ON tenant_commercial_treatments(store_id, is_active);

ALTER TABLE global_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_lens_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_lens_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_offer_diopter_grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_offer_treatments_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_usage_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_catalog_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_commercial_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_commercial_treatments ENABLE ROW LEVEL SECURITY;
