#!/usr/bin/env python3
import json
import re
import hashlib
import unicodedata
from pathlib import Path

INPUT_PATH = Path(".tabelas/hoya_catalog_extraction_2025.json")
PDF_PATH = Path(".tabelas/hoya-bm-20251113011825405.pdf")
OUTPUT_PATH = Path("tmp/hoya_catalog_draft_2025.json")


def slugify(value: str) -> str:
    value = (value or "").strip()
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "sem-slug"


def parse_index(material: str):
    if not material:
        return None
    match = re.search(r"(\d\.\d{2})", material)
    if match:
        return float(match.group(1))
    return None


def normalize_material(material: str):
    if not material:
        return None, None
    idx = parse_index(material)
    label = material.strip()
    # If there is a parenthetical label like "1.67 (EYNOA)", prefer the label.
    paren = re.search(r"\(([^)]+)\)", label)
    if paren:
        return paren.group(1).strip(), idx
    # If material is only numeric index, hide label to avoid duplication.
    if re.fullmatch(r"\d\.\d{2}", label):
        if idx == 1.50:
            return "Organic", idx
        return None, idx
    # Remove index token from label if it appears, keep the rest.
    if idx is not None:
        label = re.sub(r"\d\.\d{2}", "", label).strip(" -")
    return (label or None), idx


def normalize_feature_key(value: str) -> str:
    value = slugify(value).replace("-", "_")
    return value


def collect_features(raw: str | None):
    if not raw:
        return []
    text = raw.lower()
    tokens = []

    if "bluecontrol" in text:
        tokens.append("blue_control")
    if "uv" in text:
        tokens.append("uv")
    if "sun pro" in text or "sunpro" in text:
        tokens.append("solar")
    if "photo" in text or "chameleon" in text or "sensity" in text:
        tokens.append("fotossensivel")
    if "mirror" in text:
        tokens.append("espelhado")
    if "polar" in text:
        tokens.append("polarizado")
    if "meiryo" in text:
        tokens.append("meiryo")
    if "longlife" in text:
        tokens.append("longlife")
    if "aqua" in text:
        tokens.append("hidrofobico")
    if "hard" in text:
        tokens.append("hard")
    if "cleanextra" in text:
        tokens.append("clean_extra")
    if "no-risk" in text or "no risk" in text:
        tokens.append("no_risk")
    if "pentax" in text:
        tokens.append("pentax")
    if "enroute" in text:
        tokens.append("enroute")
    if "miyosmart" in text:
        tokens.append("miyosmart")

    return sorted(set(tokens))


def parse_add_range(text: str):
    if not text:
        return None
    nums = re.findall(r"[-+]?\d+(?:\.\d+)?", text)
    if len(nums) >= 2:
        return float(nums[0]), float(nums[1])
    return None


def parse_cylinder(text: str):
    if not text:
        return None
    nums = re.findall(r"[-+]?\d+(?:\.\d+)?", text)
    if not nums:
        return None
    return float(nums[0])


def parse_curva_range(segment: str):
    nums = re.findall(r"[-+]?\d+(?:\.\d+)?", segment)
    if len(nums) >= 2:
        return float(nums[0]), float(nums[1])
    return None


def parse_grade(grade: str):
    if not grade or not isinstance(grade, str):
        return None

    metadata = {"raw_grade": grade}
    if "Curva" in grade:
        curva6 = None
        curva8 = None
        if "Curva6" in grade:
            part = grade.split("Curva6:")[1]
            part = part.split(",")[0]
            curva6 = parse_curva_range(part)
        if "Curva8" in grade:
            part = grade.split("Curva8:")[1]
            part = part.split(",")[0]
            curva8 = parse_curva_range(part)
        if curva6:
            metadata["curve6"] = {"sph_min": curva6[0], "sph_max": curva6[1]}
        if curva8:
            metadata["curve8"] = {"sph_min": curva8[0], "sph_max": curva8[1]}
        sph_min = min([c[0] for c in [curva6, curva8] if c])
        sph_max = max([c[1] for c in [curva6, curva8] if c])
        return {
            "sph_min": sph_min,
            "sph_max": sph_max,
            "cyl_min": 0.0,
            "cyl_max": 0.0,
            "add_min": None,
            "add_max": None,
            "metadata": metadata,
        }

    nums = re.findall(r"[-+]?\d+(?:\.\d+)?", grade)
    if len(nums) >= 2:
        return {
            "sph_min": float(nums[0]),
            "sph_max": float(nums[1]),
            "cyl_min": 0.0,
            "cyl_max": 0.0,
            "add_min": None,
            "add_max": None,
            "metadata": metadata,
        }
    return None


def load_payload():
    raw = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    return raw


def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    source = load_payload()

    document_hash = sha256_file(PDF_PATH) if PDF_PATH.exists() else "unknown"

    draft = {
        "catalog_version": {
            "laboratorio": "HOYA",
            "versao": f"HOYA {source.get('validade', 'Tabela 2025')}",
            "status": "draft",
            "source_kind": "pdf",
            "notes": "Draft convertido a partir do parser HOYA (estrutura auditavel). Tratamentos incorporados ao preco.",
        },
        "source_document": {
            "document_name": PDF_PATH.name,
            "source_path": str(PDF_PATH).replace("/", "\\"),
            "document_hash": document_hash,
            "extraction_engine": "pdfplumber",
            "extracted_text": "",
            "pages": [],
        },
        "treatments": [],
        "families": [],
        "metadata": {
            "source_extraction": str(INPUT_PATH).replace("/", "\\"),
            "extraction_method": source.get("metodo"),
            "extraction_date": source.get("data_extracao"),
        },
    }

    for fam in source.get("familias", []):
        family = {
            "slug": slugify(fam.get("nome")),
            "name": fam.get("nome"),
            "design": fam.get("tier") or "Nao identificado",
            "description_marketing": None,
            "usage_tags": [],
            "benefit_tags": [],
            "source_page_reference": f"Pagina {fam.get('pagina_pdf')}",
            "offers": [],
        }

        add_range = parse_add_range((fam.get("info_adicional") or {}).get("adicao"))
        cyl_value = parse_cylinder((fam.get("info_adicional") or {}).get("cilindro"))
        cyl_max = cyl_value if cyl_value is not None else 0.0

        material_cols = fam.get("colunas_materiais", {})

        for row in fam.get("precos", []):
            for col_key, material in material_cols.items():
                idx = int(col_key.replace("col", ""))
                price = row.get(f"preco_col{idx}")
                if price is None:
                    continue
                grade = row.get(f"grade_col{idx}")
                grid = parse_grade(grade)
                if grid:
                    grid["cyl_max"] = float(cyl_max)
                    if add_range:
                        grid["add_min"], grid["add_max"] = add_range

                raw_label = f"{row.get('cor')} | {row.get('tratamento')}"
                mat_label, mat_index = normalize_material(material)
                material_display = mat_label or material
                canonical_label = f"{fam.get('nome')} {material_display} {row.get('cor')} {row.get('tratamento')}"

                offer = {
                    "legacy_code": None,
                    "raw_label": raw_label,
                    "canonical_label": canonical_label,
                    "material": mat_label,
                    "indice_refracao": mat_index,
                    "is_atomic_offer": True,
                    "allows_composition": False,
                    "already_includes_treatment": True,
                    "features": {
                        "cor": row.get("cor"),
                        "tratamento": row.get("tratamento"),
                        "row_notes": row.get("notas"),
                    },
                    "base_price": float(price),
                    "source_page_reference": f"Pagina {fam.get('pagina_pdf')}",
                    "confidence_level": 0.9 if fam.get("confianca_material") == "alta" else 0.7,
                    "diopter_grids": [grid] if grid else [],
                    "compatible_treatments": [],
                    "_price_map": None,
                }

                for key in collect_features(row.get("tratamento")):
                    offer["features"][key] = True

                family["offers"].append(offer)

        draft["families"].append(family)

    OUTPUT_PATH.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {OUTPUT_PATH}")
    print(f"Families: {len(draft['families'])}")
    print(f"Offers: {sum(len(f['offers']) for f in draft['families'])}")


if __name__ == "__main__":
    main()
