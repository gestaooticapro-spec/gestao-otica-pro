import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


PRICE_MATRIX = Path("tmp/vision_charles_price_matrix.json")
HAYTECK_PROFILES = Path("tmp/hayteck_profiles_2025_09.json")
NAME_MAP = Path("tmp/vision_hayteck_name_map.json")  # optional (user-confirmed)
NAME_MAP_DRAFT = Path("tmp/vision_hayteck_name_map_draft.json")  # generated heuristic

OUTPUT = Path("tmp/vision_catalog_draft_2025_09.json")
REPORT = Path("tmp/vision_catalog_build_report_2025_09.md")


# Charles confirmed:
# - Vision Office and Vision Drive are sourced from another lab, but should use the same prices as "vision plus HD".
# We clone the price matrix (no CSV edits needed) so these families exist in the catalog for search/suggestion.
EXTRA_PRODUCT_CLONES: dict[str, list[str]] = {
    "vision plus hd": ["vision office", "vision drive"],
}


def _sha256_of_paths(paths: list[Path]) -> str:
    h = hashlib.sha256()
    for p in paths:
        h.update(p.name.encode("utf-8"))
        h.update(b"\0")
        h.update(p.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _title_case_keep_acronyms(s: str) -> str:
    s = _norm(s)
    if not s:
        return s
    parts = []
    for w in s.split(" "):
        if w.isupper() and len(w) <= 4:
            parts.append(w)
        else:
            parts.append(w[:1].upper() + w[1:])
    return " ".join(parts)


def _fix_mojibake(s: str) -> str:
    """
    Common PDF text extraction issue: UTF-8 bytes decoded as latin-1 (mÃ­n. -> mín.).
    Best-effort fix; if it doesn't roundtrip, return original.
    """
    if not s:
        return s
    try:
        return s.encode("latin-1").decode("utf-8")
    except Exception:
        return s


def _treatment_display_name(column_name: str) -> str:
    c = _norm(column_name)
    cl = c.lower()
    if cl.startswith("verniz"):
        # keep as-is (verniz is not AR)
        return _title_case_keep_acronyms(c)
    # Most columns here are AR "brand" names, so prefix for better semantics downstream.
    return f"Antirreflexo {_title_case_keep_acronyms(c)}"


def _build_offer_label(family_name: str, index: Optional[float], photo: bool, column_name: str) -> str:
    idx = f"{index:.2f}".rstrip("0").rstrip(".") if index is not None else ""
    idx = idx.replace(".", ",")  # match Brazilian notation
    material = f"Indice {idx}" if idx else "Indice N/I"

    base = f"{_title_case_keep_acronyms(family_name)} {material} {_treatment_display_name(column_name)}"
    if photo:
        # Explicit token so the importer's feature inference picks it up.
        return f"{base} Fotossensivel"
    return base


def _build_material_label(index_token: str, index: Optional[float]) -> str:
    t = _norm(index_token)
    if not t:
        return "Nao identificado"
    tl = t.lower()
    if tl in ("poly", "poli", "policarbonato"):
        return "Policarbonato"
    # preserve token formatting (1,5 etc) so it matches CSV
    if index is None:
        return t
    # explicit "1.50" etc, used by other imports
    return f"{index:.2f}"


@dataclass
class HayteckProfile:
    model: str
    clinical_category: str
    min_fitting_height: Optional[int]
    cyl_min: Optional[float]
    add_min: Optional[float]
    add_max: Optional[float]
    diameter: Optional[str]
    sph_by_index: dict[str, dict[str, Any]]
    raw_text_excerpt: str


def _load_hayteck_profiles() -> dict[str, HayteckProfile]:
    if not HAYTECK_PROFILES.exists():
        return {}
    data = json.loads(HAYTECK_PROFILES.read_text(encoding="utf-8"))
    out: dict[str, HayteckProfile] = {}
    for p in data.get("profiles", []):
        model = _fix_mojibake(_norm(p.get("model", "")))
        add = p.get("add") or None
        out[model] = HayteckProfile(
            model=model,
            clinical_category=p.get("clinical_category") or "indefinida",
            min_fitting_height=p.get("min_fitting_height"),
            cyl_min=p.get("cyl_min"),
            add_min=(add[0] if add else None),
            add_max=(add[1] if add else None),
            diameter=p.get("diameter"),
            sph_by_index=p.get("sph_by_index") or {},
            raw_text_excerpt=_fix_mojibake(p.get("raw_text_excerpt") or ""),
        )
    return out


def _load_name_map() -> dict[str, str]:
    # Prefer the user-confirmed file, fallback to draft if present.
    chosen = NAME_MAP if NAME_MAP.exists() else NAME_MAP_DRAFT
    if not chosen.exists():
        return {}
    data = json.loads(chosen.read_text(encoding="utf-8"))
    mapping = {}
    for row in data.get("mapping", []):
        vision = _norm(row.get("vision_family_name") or "")
        hay = _norm(row.get("hayteck_model") or "")
        if vision and hay:
            mapping[vision] = _fix_mojibake(hay)
    return mapping


def _treatments_from_price_matrix(price_matrix: dict[str, Any]) -> list[dict[str, Any]]:
    cols: set[str] = set()
    for prod in price_matrix.get("products", []):
        for c in prod.get("columns_left", []):
            cols.add(_treatment_display_name(c))
        for c in prod.get("columns_right", []):
            cols.add(_treatment_display_name(c))

    # Explicit "Fotossensivel" treatment to be searchable/filterable later.
    cols.add("Fotossensivel")

    items = []
    for name in sorted(cols):
        n = name.lower()
        features = {}
        tags = []
        tipo = "Tratamento"

        if "antirreflexo" in n or "anti reflex" in n:
            tipo = "Antirreflexo"
            features["antirreflexo"] = True
            tags.append("antirreflexo")
        if "blue" in n:
            features["blue_uv"] = True
            features["blue_control"] = True
            tags.append("blue")
        if "optifog" in n or "fog" in n:
            features["antifog"] = True
            tags.append("antifog")
        if "fotossens" in n:
            tipo = "Fotossensivel"
            features["fotossensivel"] = True
            features["transitions"] = True
            tags.append("fotossensivel")
        if "verniz" in n or "antirrisco" in n:
            tipo = "Verniz"
            features["antirrisco"] = True
            tags.append("antirrisco")

        items.append(
            {
                "name": _title_case_keep_acronyms(name),
                "type": tipo,
                "tags": tags,
                "features": features,
            }
        )
    return items


def _build_diopter_grid_from_hayteck(profile: HayteckProfile, index: Optional[float]) -> list[dict[str, Any]]:
    if index is None:
        return []
    key = f"{index:.2f}"
    sph = profile.sph_by_index.get(key) or {}
    sph_min = sph.get("sph_min")
    sph_max = sph.get("sph_max")
    # Our DB schema requires sph_min/sph_max. If the PDF extraction didn't yield
    # the spherical range for this index, omit the grid entirely (UI will show
    # "grade nao informada" until we refine the mapping/extraction).
    if sph_min is None or sph_max is None:
        return []
    return [
        {
            "sph_min": sph_min,
            "sph_max": sph_max,
            "cyl_min": (profile.cyl_min if profile.cyl_min is not None else None),
            "cyl_max": (0.0 if profile.cyl_min is not None else None),
            "add_min": profile.add_min,
            "add_max": profile.add_max,
            "metadata": {"source": f"hayteck:{profile.model}"},
        }
    ]


def main():
    if not PRICE_MATRIX.exists():
        raise SystemExit(f"Arquivo nao encontrado: {PRICE_MATRIX}")

    price = json.loads(PRICE_MATRIX.read_text(encoding="utf-8"))

    # Inject clones (e.g. Office/Drive) before building families/offers.
    by_product = {(_norm(p.get("product") or "")).lower(): p for p in (price.get("products") or [])}
    clones_added = []
    for src, clones in EXTRA_PRODUCT_CLONES.items():
        src_key = _norm(src).lower()
        src_block = by_product.get(src_key)
        if not src_block:
            continue
        for clone_name in clones:
            clone_key = _norm(clone_name).lower()
            if clone_key in by_product:
                continue
            cloned = json.loads(json.dumps(src_block))
            cloned["product"] = clone_name
            for e in cloned.get("entries", []) or []:
                e["product"] = clone_name
            price.setdefault("products", []).append(cloned)
            by_product[clone_key] = cloned
            clones_added.append((src_block.get("product"), clone_name))

    hayteck_profiles = _load_hayteck_profiles()
    name_map = _load_name_map()

    # Build treatments list (optional, but helps future filtering/audit)
    treatments = _treatments_from_price_matrix(price)

    families = []
    missing_profile_for: list[str] = []
    for prod in price.get("products", []):
        family_name_raw = _norm(prod.get("product") or "")
        family_name = _title_case_keep_acronyms(family_name_raw)

        mapped_hay = name_map.get(family_name_raw) or name_map.get(family_name)  # accept both formats
        profile = hayteck_profiles.get(mapped_hay) if mapped_hay else None
        if mapped_hay and not profile:
            missing_profile_for.append(f"{family_name_raw} -> {mapped_hay}")

        offers = []
        for e in prod.get("entries", []):
            index_token = _norm(e.get("index_token") or "")
            index = e.get("index")
            photo = e.get("photo") is True
            column = _norm(e.get("column") or "")
            base_price = e.get("price")
            if base_price is None:
                continue

            raw_label = _build_offer_label(family_name_raw, index, photo, column)
            canonical_label = raw_label  # for this catalog, keep 1:1

            features: dict[str, Any] = {
                "catalog_brand": "Vision",
                "treatment_column": _treatment_display_name(column),
                "photo": photo,
            }
            treatment_name = str(features["treatment_column"]).lower()
            if "blue" in treatment_name:
                features["blue_uv"] = True
                features["blue_control"] = True
            if profile and profile.min_fitting_height is not None:
                features["min_fitting_height"] = profile.min_fitting_height
            if profile and profile.diameter:
                features["diameter"] = profile.diameter

            diopter_grids = _build_diopter_grid_from_hayteck(profile, index) if profile else []

            offers.append(
                {
                    "legacy_code": None,
                    "raw_label": raw_label,
                    "canonical_label": canonical_label,
                    "material": _build_material_label(index_token, index),
                    "indice_refracao": index,
                    "is_atomic_offer": True,
                    "allows_composition": False,
                    "already_includes_treatment": True,
                    "features": features,
                    "base_price": float(base_price),
                    "source_page_reference": "CSV Charles",
                    "confidence_level": 0.7 if not profile else 0.85,
                    "diopter_grids": diopter_grids,
                    "compatible_treatments": [],
                    "_price_map": None,
                }
            )

        families.append(
            {
                "slug": re.sub(r"[^a-z0-9]+", "-", family_name.lower()).strip("-"),
                "name": family_name,
                "design": "Marca Propria (Hayteck -> Vision)",
                "description_marketing": (profile.raw_text_excerpt if profile else None),
                "usage_tags": [],
                "benefit_tags": [],
                "source_page_reference": "CSV Charles",
                # If we don't have a profile yet, keep "indefinida" unless it's one of our explicit clones.
                # Vision Office is an occupational/office lens, not a general progressive.
                "clinical_category": (
                    profile.clinical_category
                    if profile
                    else (
                        "ocupacional"
                        if family_name_raw.lower() == "vision office"
                        else ("multifocal" if family_name_raw.lower() == "vision drive" else "indefinida")
                    )
                ),
                "offers": offers,
            }
        )

    pdf_path = Path(".tabelas/tabela hayteck 09-2025.pdf")
    csv_path = Path(".tabelas/tabela tab charles.csv")
    doc_hash = _sha256_of_paths([pdf_path, csv_path]) if pdf_path.exists() and csv_path.exists() else "unknown"

    payload = {
        "catalog_version": {
            "laboratorio": "Vision",
            "versao": "Vision Setembro 2025",
            "status": "draft",
            "source_kind": "csv+pdf",
            "notes": (
                "Tabela marca propria (Vision) com precos do CSV do logista e perfis tecnicos do PDF Hayteck. "
                "IMPORTANTE: o CSV tem a coluna FOTO apenas como separador; o lado direito gera ofertas Fotossensiveis. "
                "Se tmp/vision_hayteck_name_map.json nao estiver preenchido, grades/altura/diametro podem ficar incompletos."
            ),
        },
        "source_document": {
            "document_name": f"{pdf_path.name} + {csv_path.name}",
            "source_path": f"{str(pdf_path)} + {str(csv_path)}",
            "document_hash": doc_hash,
            "extraction_engine": "csv+pdfplumber",
            "extracted_text": "",
            "pages": [],
        },
        "treatments": treatments,
        "families": families,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # Report to guide next step (mapping confirmation)
    mapped = len([1 for v in name_map.values() if v])
    report_lines = []
    report_lines.append("# Vision (marca propria) - Build report\n")
    report_lines.append(f"- Output: `{OUTPUT}`")
    report_lines.append(f"- Families: {len(families)}")
    report_lines.append(f"- Offers: {sum(len(f['offers']) for f in families)}")
    report_lines.append(f"- Treatments created: {len(treatments)}")
    report_lines.append(f"- Hayteck profiles loaded: {len(hayteck_profiles)}")
    report_lines.append(f"- Vision->Hayteck mappings loaded: {mapped}")
    if clones_added:
        report_lines.append("\n## Clones adicionados (preco igual ao produto fonte)\n")
        report_lines.extend([f"- {src} -> {dst}" for src, dst in clones_added])
    if missing_profile_for:
        report_lines.append("\n## Mapeamentos sem perfil encontrado\n")
        report_lines.extend([f"- {x}" for x in missing_profile_for])
    if not name_map:
        report_lines.append("\n## Atenção\n")
        report_lines.append(
            "- Nenhum mapeamento Vision->Hayteck confirmado foi encontrado. "
            "Para preencher grade/altura/diametro automaticamente, crie `tmp/vision_hayteck_name_map.json` "
            "a partir do draft e preencha `hayteck_model` para cada `vision_family_name`."
        )
    REPORT.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"Saved: {OUTPUT}")
    print(f"Report: {REPORT}")


if __name__ == "__main__":
    main()
