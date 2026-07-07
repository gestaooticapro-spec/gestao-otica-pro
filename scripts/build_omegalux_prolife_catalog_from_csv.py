import hashlib
import json
import re
from pathlib import Path
from typing import Any, Optional


PRICE_MATRIX = Path("tmp/omegalux_prolife_price_matrix.json")
CSV_PATH = Path(".tabelas/OMEGALUX E PROLIFE.csv")
OUTPUT = Path("tmp/omegalux_prolife_catalog_draft_2026_07.json")
REPORT = Path("tmp/omegalux_prolife_catalog_build_report_2026_07.md")


REFERENCE_SEMANTICS: dict[str, dict[str, Any]] = {
    "PRO LIFE VI": {
        "equivalent": "Hoyalux iD LifeStyle 4",
        "geometry_source": "Hoyalux iD LifeStyle 4",
        "clinical_category": "multifocal",
        "positioning": "premium",
        "design": "iD Premium",
        "usage_tags": ["indoor", "urban", "outdoor", "perto", "intermediario", "longe"],
        "benefit_tags": [
            "adaptacao_facilitada",
            "menos_distorcoes",
            "conforto_visual",
            "foco_perto_intermediario",
            "segmentacao_por_estilo_de_vida",
        ],
        "summary": (
            "Marca propria da loja com equivalencia tecnica/comercial declarada para Hoyalux iD LifeStyle 4. "
            "Manter como lente comercial distinta; herda apenas semantica e geometria."
        ),
        "recommendation_notes": (
            "Usar como progressiva premium com leitura de estilo de vida Indoor, Urban e Outdoor, seguindo a semantica "
            "da Hoyalux iD LifeStyle 4, sem copiar precos ou combinacoes comerciais da HOYA."
        ),
    },
    "OMEGALUX IN": {
        "equivalent": "Varilux Liberty 3.0",
        "geometry_source": "Varilux Liberty 3.0",
        "clinical_category": "multifocal",
        "positioning": "entrada",
        "design": "Progressiva Digital (Liberty 3.0)",
        "usage_tags": ["uso_geral", "computador", "leitura", "dirigir"],
        "benefit_tags": ["custo_beneficio", "versatilidade", "adaptacao_suave", "conforto_visual"],
        "summary": (
            "Marca propria da loja com equivalencia tecnica/comercial declarada para Varilux Liberty 3.0. "
            "Manter como lente comercial distinta; herda apenas semantica e geometria."
        ),
    },
    "OMEGALUX DIGITAL": {
        "equivalent": "Varilux Comfort Max",
        "geometry_source": "Varilux Comfort Max",
        "clinical_category": "multifocal",
        "positioning": "intermediaria",
        "design": "Progressiva Digital (Comfort Max)",
        "usage_tags": ["computador", "leitura", "dirigir", "uso_geral"],
        "benefit_tags": ["conforto_visual", "transicao_suave", "adaptacao_suave", "versatilidade"],
        "summary": (
            "Marca propria da loja com equivalencia tecnica/comercial declarada para Varilux Comfort Max. "
            "Manter como lente comercial distinta; herda apenas semantica e geometria."
        ),
    },
    "OMEGALUX 4K": {
        "equivalent": "Varilux XR Pro",
        "semantic_source": "Varilux XR Series",
        "geometry_source": "Varilux XR Pro",
        "clinical_category": "multifocal",
        "positioning": "ultra_premium",
        "design": "Progressiva Ultra Premium (equivalente XR Pro)",
        "usage_tags": ["dirigir", "computador", "celular", "leitura", "smartphone", "uso_dinamico"],
        "benefit_tags": [
            "nitidez",
            "adaptacao_rapida",
            "visao_movimento",
            "campo_visual_amplo",
            "qualidade_optica",
            "conforto_visual",
        ],
        "summary": (
            "Marca propria da loja com equivalencia tecnica/comercial declarada para Varilux XR Pro. "
            "No sistema permanece como lente distinta; herda a semantica de XR Series e geometria de XR Pro."
        ),
    },
}


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_key(value: str) -> str:
    return norm(value).upper()


def title_case_keep_acronyms(value: str) -> str:
    text = norm(value)
    parts = []
    for word in text.split(" "):
        if word.isupper() and len(word) <= 4:
            parts.append(word)
        else:
            parts.append(word[:1].upper() + word[1:].lower())
    return " ".join(parts)


def sha256_of_paths(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def treatment_display_name(column_name: str) -> str:
    cleaned = norm(column_name).upper()
    replacements = {
        "SEM AR": "Sem AR",
        "CLEAN EXTRA": "Clean Extra",
        "EASY CLEAN": "Easy Clean",
        "NO RISK": "No Risk",
        "NO RISK BLUE": "No Risk Blue",
        "NO RISK BC": "No Risk Blue Control",
        "LONG LIFE": "Long Life",
        "BLUE CONTROL": "Blue Control",
        "UV PREMUM": "UV Premium",
        "UV PREMIUM": "UV Premium",
        "AR BLUE": "AR Blue",
    }
    return replacements.get(cleaned, title_case_keep_acronyms(cleaned))


def treatment_features(name: str) -> dict[str, Any]:
    lowered = name.lower()
    features: dict[str, Any] = {}
    if "sem ar" not in lowered and ("ar " in lowered or "clean" in lowered or "risk" in lowered or "life" in lowered):
        features["antirreflexo"] = True
    if "blue" in lowered:
        features["blue_uv"] = True
        features["blue_control"] = True
    if "uv" in lowered:
        features["uv"] = True
        features["uv_control"] = True
    if "risk" in lowered or "life" in lowered:
        features["antirrisco"] = True
    if "clean" in lowered:
        features["facil_limpeza"] = True
    if "fotossensivel" in lowered:
        features["fotossensivel"] = True
        features["transitions"] = True
    return features


def treatment_type(name: str) -> str:
    lowered = name.lower()
    if "fotossensivel" in lowered:
        return "Fotossensivel"
    if "sem ar" in lowered:
        return "Sem AR"
    if "ar" in lowered or "clean" in lowered or "risk" in lowered or "life" in lowered or "blue" in lowered:
        return "Antirreflexo"
    return "Tratamento"


def build_material_label(index_token: str, index: Optional[float]) -> str:
    token = norm(index_token)
    lowered = token.lower()
    if lowered in ("poly", "poli", "policarbonato"):
        return "Policarbonato"
    if lowered == "trivex":
        return "Trivex"
    if index is None:
        return token or "Nao identificado"
    return f"{index:.2f}"


def index_label(index: Optional[float]) -> str:
    if index is None:
        return "Indice N/I"
    return "Indice " + f"{index:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def build_offer_label(family_name: str, index: Optional[float], photo: bool, treatment_name: str) -> str:
    label = f"{family_name} {index_label(index)} {treatment_name}"
    if photo:
        return f"{label} Fotossensivel"
    return label


def treatments_from_matrix(price_matrix: dict[str, Any]) -> list[dict[str, Any]]:
    names = set()
    has_photo = False
    for product in price_matrix.get("products", []):
        for column in product.get("columns_left", []):
            names.add(treatment_display_name(column))
        for column in product.get("columns_right", []):
            names.add(treatment_display_name(column))
            has_photo = True
    if has_photo:
        names.add("Fotossensivel")

    treatments = []
    for name in sorted(names):
        features = treatment_features(name)
        tags = []
        if features.get("antirreflexo"):
            tags.append("antirreflexo")
        if features.get("blue_uv"):
            tags.append("blue")
        if features.get("fotossensivel"):
            tags.append("fotossensivel")
        if features.get("antirrisco"):
            tags.append("antirrisco")
        treatments.append({"name": name, "type": treatment_type(name), "tags": tags, "features": features})
    return treatments


def build_features(family_name: str, treatment_name: str, photo: bool, semantic: Optional[dict[str, Any]]) -> dict[str, Any]:
    features = {
        "catalog_brand": "OMEGALUX / PRO LIFE",
        "treatment_column": treatment_name,
        "photo": photo,
        "marca_propria": True,
    }
    features.update(treatment_features(treatment_name))
    if photo:
        features["fotossensivel"] = True
        features["transitions"] = True
    if semantic:
        features["equivalent_family"] = semantic.get("equivalent")
        features["semantic_source"] = semantic.get("semantic_source") or semantic.get("equivalent")
        features["geometry_source"] = semantic.get("geometry_source")
        features["positioning"] = semantic.get("positioning")
        features["same_semantics_not_same_commercial_lens"] = True
    else:
        features["semantic_pending"] = True
    return features


def main():
    if not PRICE_MATRIX.exists():
        raise SystemExit(f"Arquivo nao encontrado: {PRICE_MATRIX}. Rode scripts/parse_omegalux_prolife_csv.py primeiro.")

    price_matrix = json.loads(PRICE_MATRIX.read_text(encoding="utf-8"))
    treatments = treatments_from_matrix(price_matrix)
    families = []
    pending = []
    mapped = []

    for product in price_matrix.get("products", []):
        family_name = norm(product.get("product") or "")
        semantic = REFERENCE_SEMANTICS.get(normalize_key(family_name))
        if semantic:
            mapped.append((family_name, semantic["equivalent"]))
        else:
            pending.append(family_name)

        offers = []
        for entry in product.get("entries", []):
            treatment_name = treatment_display_name(entry.get("column") or "")
            photo = entry.get("photo") is True
            index = entry.get("index")
            raw_label = build_offer_label(family_name, index, photo, treatment_name)
            features = build_features(family_name, treatment_name, photo, semantic)
            offers.append(
                {
                    "legacy_code": None,
                    "raw_label": raw_label,
                    "canonical_label": raw_label,
                    "material": build_material_label(entry.get("index_token") or "", index),
                    "indice_refracao": index,
                    "is_atomic_offer": True,
                    "allows_composition": False,
                    "already_includes_treatment": True,
                    "features": features,
                    "base_price": float(entry["price"]),
                    "source_page_reference": "CSV OMEGALUX E PROLIFE",
                    "confidence_level": 0.9 if semantic else 0.65,
                    "diopter_grids": [],
                    "compatible_treatments": [],
                    "_price_map": None,
                }
            )

        families.append(
            {
                "slug": slugify(family_name),
                "name": family_name,
                "design": semantic["design"] if semantic else "Marca propria - sem equivalencia definida",
                "description_marketing": semantic["summary"] if semantic else "Marca propria da loja. Equivalencia semantica pendente.",
                "usage_tags": semantic["usage_tags"] if semantic else [],
                "benefit_tags": semantic["benefit_tags"] if semantic else [],
                "source_page_reference": "CSV OMEGALUX E PROLIFE",
                "clinical_category": semantic["clinical_category"] if semantic else "indefinida",
                "offers": offers,
            }
        )

    doc_hash = sha256_of_paths([CSV_PATH]) if CSV_PATH.exists() else "unknown"
    payload = {
        "catalog_version": {
            "laboratorio": "OMEGALUX / PRO LIFE",
            "versao": "OMEGALUX PRO LIFE Julho 2026",
            "status": "draft",
            "source_kind": "csv",
            "notes": (
                "Tabela de marca propria da loja importada de CSV. Familias permanecem comerciais/distintas; "
                "equivalencias conhecidas copiam apenas semantica e geometria. Precos, tratamentos, indices e materiais "
                "seguem exclusivamente a CSV."
            ),
        },
        "source_document": {
            "document_name": CSV_PATH.name,
            "source_path": str(CSV_PATH),
            "document_hash": doc_hash,
            "extraction_engine": "csv",
            "extracted_text": "",
            "pages": [],
        },
        "treatments": treatments,
        "families": families,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# OMEGALUX / PRO LIFE - Build report",
        "",
        f"- Output: `{OUTPUT}`",
        f"- Families: {len(families)}",
        f"- Offers: {sum(len(family['offers']) for family in families)}",
        f"- Treatments created: {len(treatments)}",
        f"- Mapped semantic families: {len(mapped)}",
        f"- Pending semantic families: {len(pending)}",
    ]
    if mapped:
        lines.extend(["", "## Equivalencias aplicadas", ""])
        for family_name, equivalent in mapped:
            semantic = REFERENCE_SEMANTICS[normalize_key(family_name)]
            lines.append(
                f"- {family_name} -> {equivalent} (semantica: {semantic.get('semantic_source') or equivalent}; geometria: {semantic.get('geometry_source')})"
            )
    if pending:
        lines.extend(["", "## Equivalencias pendentes", ""])
        for family_name in pending:
            lines.append(f"- {family_name}")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Saved: {OUTPUT}")
    print(f"Report: {REPORT}")


if __name__ == "__main__":
    main()
