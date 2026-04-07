#!/usr/bin/env python3
"""
Extrai um draft estruturado do PDF da Optilab/Essilor para o dominio global.

Escopo desta V1:
- 1 laboratorio (Optilab / tabela Essilor)
- preserva o texto fonte por pagina e chunks
- extrai familias, ofertas, tratamentos e grades basicas a partir das paginas tabulares
- gera artefatos de revisao humana: JSON, summary.md e CSVs

Observacao:
- o PDF mistura familias, seções, linhas promocionais e tabelas com layouts diferentes
- por isso o parser prioriza rastreabilidade e auditabilidade, nao perfeicao
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from hashlib import sha256
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pypdf nao encontrado no ambiente. Instale-o antes de rodar este script."
    ) from exc


MONEY_RE = re.compile(r"(?<![+\-−])\d{1,3}(?:\.\d{3})*,\d{2}|(?<!\S)-(?=\s|$)")
INDEX_RE = re.compile(r"\b1\.(?:50|53|56|59|60|67|74)\b")
RANGE_RE = re.compile(r"([+\-−]?\d{1,2},\d{2})\s+a\s+([+\-−]?\d{1,2},\d{2})$")
CYL_RE = re.compile(r"at[eé]\s+([+\-−]?\d{1,2},\d{2})", re.IGNORECASE)
ADD_RE = re.compile(r"(\d{1,2},\d{2})\s+a\s+(\d{1,2},\d{2})")
CODE_RE = re.compile(r"\b\d{4,6}\b")

KNOWN_COLUMNS = [
    "CRIZAL PREVENCIA",
    "CRIZAL SAPPHIRE HR FACE INTERNA",
    "CRIZAL SAPPHIRE HR",
    "CRIZAL ROCK",
    "CRIZAL EASY PRO",
    "OPTIFOG",
    "NO REFLEX",
    "VERT CLAIR PLUS",
    "VERT CLAIR",
    "TRIO EASY CLEAN",
    "SEM AR",
    "VERNIZ HC",
]

TREATMENT_TYPES = {
    "CRIZAL PREVENCIA": "Antirreflexo",
    "CRIZAL SAPPHIRE HR FACE INTERNA": "Antirreflexo",
    "CRIZAL SAPPHIRE HR": "Antirreflexo",
    "CRIZAL ROCK": "Antirreflexo",
    "CRIZAL EASY PRO": "Antirreflexo",
    "OPTIFOG": "Antirreflexo",
    "NO REFLEX": "Antirreflexo",
    "VERT CLAIR PLUS": "Antirreflexo",
    "VERT CLAIR": "Antirreflexo",
    "TRIO EASY CLEAN": "Antirreflexo",
    "VERNIZ HC": "Revestimento",
}

STOP_FAMILY_PREFIXES = (
    "*",
    "PREÇOS",
    "PRECOS",
    "DIGITAL",
    "CRIZAL",
    "TRATAMENTOS",
    "SERVIÇOS",
    "SERVICOS",
    "OUTROS",
    "PROMOCIONAIS",
)

NOTE_PREFIXES = (
    "ADIÇÃO",
    "ADICAO",
    "CILÍNDRICO",
    "CILINDRICO",
    "ALT.",
    "ALTURA",
    "PREÇOS",
    "PRECOS",
    "SHORT",
    "SEM CUSTO",
    "ADICIONAL",
    "COMPLEMENTOS",
)

USAGE_TAG_RULES = {
    "dirigir": ["dirigir", "drive"],
    "tv": ["tv"],
    "computador": ["computador", "telas", "digital"],
    "leitura": ["leitura", "perto"],
    "smartphone": ["smartphone", "celular"],
    "intermediario": ["intermediária", "intermediaria", "intermediário", "intermediario"],
    "multitarefas": ["multitarefa"],
    "sol": ["solar", "sol", "fotossensível", "fotossensivel"],
}

BENEFIT_TAG_RULES = {
    "adaptacao_rapida": ["adaptação", "adaptacao", "sem esforço", "sem esforco"],
    "conforto_visual": ["conforto", "relaxam"],
    "nitidez": ["nitidez", "contraste"],
    "protecao_luz_azul": ["luz azul", "blue uv"],
    "campos_amplos": ["campos", "zona de leitura ampliada", "campo intermediário"],
}

PAGE_TYPE_IGNORED = "ignored_page"
PAGE_TYPE_MARKETING = "marketing_description_page"
PAGE_TYPE_SERVICES = "services_page"
PAGE_TYPE_SERVICE_MIXED = "service_price_and_ready_lenses_page"
PAGE_TYPE_PRICING_MATRIX = "pricing_matrix_page"
PAGE_TYPE_STOCK_READY = "stock_ready_lenses_page"
PAGE_TYPE_MULTI_SECTION = "multi_section_page"
PAGE_TYPE_UNSUPPORTED = "unsupported_table_page"

SECTION_KEYWORDS = {
    "DIGITAL",
    "TRADICIONAL",
    "COLORAÃ‡ÃƒO",
    "COLORACAO",
    "SOLARES",
    "VISÃƒO INTERMEDIÃRIA",
    "VISAO INTERMEDIARIA",
    "VISÃƒO SIMPLES DIGITAL",
    "VISAO SIMPLES DIGITAL",
    "VISÃƒO SIMPLES DIGITAL INFANTIL",
    "VISAO SIMPLES DIGITAL INFANTIL",
    "LENTES VISÃƒO SIMPLES SURFAÃ‡ADAS",
    "LENTES VISAO SIMPLES SURFACADAS",
    "MULTIFOCAL DIGITAL",
    "MULTIFOCAL TRADICIONAL",
    "OCUPACIONAL DIGITAL",
    "LENTES PRONTAS",
    "LENTES ACABADAS",
    "LENTES SURFAÃ‡ADAS DIGITAIS",
    "LENTES SURFACADAS DIGITAIS",
    "CONTROLE DA MIOPIA INFANTIL",
}


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def make_slug(value: str) -> str:
    cleaned = normalize_whitespace(value).lower()
    cleaned = (
        cleaned.replace("á", "a")
        .replace("à", "a")
        .replace("ã", "a")
        .replace("â", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
        .replace("®", "")
        .replace("™", "")
    )
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    return cleaned.strip("_")


def price_to_number(token: str | None) -> float | None:
    if token is None:
        return None
    token = token.strip()
    if not token or token == "-":
        return None
    return float(token.replace(".", "").replace(",", "."))


def diopter_to_number(token: str | None) -> float | None:
    if token is None:
        return None
    token = token.replace("−", "-").replace("+", "").strip()
    if not token:
        return None
    try:
        return float(token.replace(",", "."))
    except ValueError:
        return None


def chunk_text(text: str, size: int = 900) -> list[str]:
    paragraphs = [normalize_whitespace(part) for part in text.split("\n") if normalize_whitespace(part)]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current} {paragraph}".strip()
        if current and len(candidate) > size:
            chunks.append(current)
            current = paragraph
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def extract_tags(text: str, rules: dict[str, list[str]]) -> list[str]:
    lowered = normalize_whitespace(text).lower()
    tags: list[str] = []
    for tag, keywords in rules.items():
        if any(keyword in lowered for keyword in keywords):
            tags.append(tag)
    return tags


def build_document_payload(pdf_path: Path) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    full_text_parts: list[str] = []
    pages_payload: list[dict[str, Any]] = []

    for index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        normalized = page_text.replace("\x00", " ").strip()
        full_text_parts.append(normalized)
        chunks = chunk_text(normalized)
        pages_payload.append(
            {
                "page_number": index,
                "text": normalized,
                "chunks": [
                    {
                        "chunk_index": chunk_index + 1,
                        "text": chunk_text_value,
                    }
                    for chunk_index, chunk_text_value in enumerate(chunks)
                ],
            }
        )

    document_hash = sha256(pdf_path.read_bytes()).hexdigest()
    full_text = "\n\n".join(part for part in full_text_parts if part)

    return {
        "document_name": pdf_path.name,
        "source_path": str(pdf_path),
        "document_hash": document_hash,
        "extraction_engine": "pypdf",
        "extracted_text": full_text,
        "pages": pages_payload,
    }


def page_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def is_table_page(text: str) -> bool:
    lowered = text.lower()
    if "preços em pares e em reais" not in lowered and "precos em pares e em reais" not in lowered:
        return False
    return any(term in lowered for term in ["crizal", "vert clair", "tabela", "valor", "transitions", "esférico", "esferico"])


def is_pricing_like_page(text: str) -> bool:
    lowered = normalize_whitespace(text).lower()
    money_hits = len(re.findall(r"\d{1,3}(?:\.\d{3})*,\d{2}", lowered))
    if money_hits < 3:
        return False
    if "preÃ§os em pares e em reais" not in lowered and "precos em pares e em reais" not in lowered and "pares e em reais" not in lowered:
        return False
    return any(term in lowered for term in ["crizal", "vert clair", "tabela", "valor", "transitions", "esf", "cil"])


def classify_page(text: str, lines: list[str]) -> dict[str, Any]:
    lowered = normalize_whitespace(text).lower()
    title = normalize_whitespace(lines[0]) if lines else ""

    if "servi" in lowered and "tratamentos" in lowered and "lentes vs solares planas" in lowered:
        return {
            "page_parser_type": PAGE_TYPE_SERVICE_MIXED,
            "parser_notes": "Pagina hibrida com servicos e lentes prontas.",
        }

    if is_service_page(lines):
        return {
            "page_parser_type": PAGE_TYPE_SERVICES,
            "parser_notes": "Bloco de servicos e tratamentos detectado.",
        }

    if "lentes prontas pre" in lowered and "esf" in lowered and "cil" in lowered:
        return {
            "page_parser_type": PAGE_TYPE_STOCK_READY,
            "parser_notes": "Tabela de lentes prontas / stock.",
        }

    if (
        "lentes acabadas e lentes surfa" in lowered
        or ("acrescentar" in lowered and "ultra light" in lowered)
    ):
        return {
            "page_parser_type": PAGE_TYPE_MULTI_SECTION,
            "parser_notes": "Pagina com multiplos blocos independentes.",
        }

    if any(term in lowered for term in ["conheça a fam", "conheca a fam", "multifocais", "visão simples ocupacional", "visao simples ocupacional"]) and not is_pricing_like_page(text):
        return {
            "page_parser_type": PAGE_TYPE_MARKETING,
            "parser_notes": f"Pagina descritiva: {title}" if title else "Pagina descritiva.",
        }

    if is_pricing_like_page(text):
        has_matrix_columns = any(term in lowered for term in ["crizal", "optifog", "verniz hc", "sem ar", "vert clair"])
        return {
            "page_parser_type": PAGE_TYPE_PRICING_MATRIX if has_matrix_columns else PAGE_TYPE_UNSUPPORTED,
            "parser_notes": "Tabela matricial principal." if has_matrix_columns else "Tabela com layout ainda nao suportado.",
        }

    if any(term in lowered for term in ["benef", "entenda qual lente", "conhe", "ideal para voc"]):
        return {
            "page_parser_type": PAGE_TYPE_MARKETING,
            "parser_notes": f"Pagina descritiva: {title}" if title else "Pagina descritiva.",
        }

    return {
        "page_parser_type": PAGE_TYPE_IGNORED,
        "parser_notes": f"Pagina ignorada nesta rodada: {title}" if title else "Pagina ignorada nesta rodada.",
    }


def detect_family_name(lines: list[str], previous_family: str | None) -> str | None:
    for line in lines[:25]:
        normalized = normalize_whitespace(line)
        if not normalized:
            continue
        if any(char.isdigit() for char in normalized):
            continue
        upper = normalized.upper()
        if upper.startswith(STOP_FAMILY_PREFIXES):
            continue
        if normalized in {"TM", "MULTIFOCAIS", "SOLARES", "ACABADAS", "SURFAÇADAS", "SURFAÇADAS 29", "SURFAÇADAS 28"}:
            continue
        if (
            "VARILUX" in upper
            or "EYEZEN" in upper
            or "ESSILOR" in upper
            or "KODAK" in upper
            or "BIFOCAIS" in upper
            or "ESPACE" in upper
            or normalized.startswith("iTop")
            or "STELLEST" in upper
            or "LINHA KIDS" in upper
        ):
            return normalized.replace(" TM", "").strip()
    return previous_family


def detect_section_name(lines: list[str], index: int) -> str | None:
    if index < 0 or index >= len(lines):
        return None
    line = normalize_whitespace(lines[index])
    if not line:
        return None
    upper = line.upper()
    if upper in {"DIGITAL", "TRADICIONAL", "COLORAÇÃO", "COLORACAO", "SOLARES", "VISÃO INTERMEDIÁRIA", "LENTES VISÃO SIMPLES SURFAÇADAS", "LENTES PRONTAS", "LENTES ACABADAS", "LENTES SURFAÇADAS DIGITAIS"}:
        return line
    return None


def detect_section_name_v2(lines: list[str], index: int) -> str | None:
    detected = detect_section_name(lines, index)
    if detected:
        return detected
    if index < 0 or index >= len(lines):
        return None
    line = normalize_whitespace(lines[index])
    if not line:
        return None
    upper = line.upper()
    if upper in SECTION_KEYWORDS:
        return line
    return None


def detect_columns(header_lines: list[str]) -> list[str]:
    header_text = normalize_whitespace(" ".join(header_lines)).upper()
    found: list[tuple[int, str]] = []
    for column in KNOWN_COLUMNS:
        position = header_text.find(column)
        if position >= 0:
            found.append((position, column))
    found.sort(key=lambda item: item[0])
    columns = [column for _, column in found]
    return columns


def extract_page_constraints(text: str) -> dict[str, Any]:
    normalized = normalize_whitespace(text)
    cylinder_matches = list(CYL_RE.finditer(normalized))
    add_matches = [match for match in ADD_RE.finditer(normalized) if "adi" in normalized[max(0, match.start() - 20): match.start()].lower()]

    cyl_value = diopter_to_number(cylinder_matches[0].group(1)) if cylinder_matches else None
    add_min = diopter_to_number(add_matches[0].group(1)) if add_matches else None
    add_max = diopter_to_number(add_matches[0].group(2)) if add_matches else None

    return {
        "page_cyl_max": cyl_value,
        "page_add_min": add_min,
        "page_add_max": add_max,
    }


def detect_features(
    raw_label: str,
    family_name: str,
    page_text: str | None = None,
    section_name: str | None = None,
    subsection_name: str | None = None,
) -> dict[str, Any]:
    offer_context = normalize_whitespace(" ".join(piece for piece in [raw_label, section_name, subsection_name] if piece)).lower()
    line_context = normalize_whitespace(raw_label).lower()
    family_context = normalize_whitespace(family_name).lower()
    placement_context = normalize_whitespace(" ".join(piece for piece in [section_name, subsection_name] if piece)).lower()
    _page_context = normalize_whitespace(page_text or "").lower()

    return {
        "transitions": any(token in line_context for token in ["transitions", "photo", "acclimates"]),
        "transitions_gens": any(token in line_context for token in ["gen s", "gen 8"]),
        "transitions_extractive": "extractive" in line_context,
        "blue_uv": any(token in line_context for token in ["blue uv", "blueuv", "uv led"]),
        "xperio": "xperio" in line_context,
        "solar": any(token in offer_context for token in ["solar", "sun"]) or "xperio" in line_context,
        "coloracao": any(token in offer_context for token in ["coloração", "coloracao", "degradê", "degrade"]),
        "digital": "digital" in placement_context or ("digital" in family_context and "tradicional" not in placement_context),
        "face_interna": "face interna" in line_context,
        "short": "short" in line_context,
    }


def infer_material(raw_label: str) -> str | None:
    lowered = raw_label.lower()
    if "airwear" in lowered or "poly" in lowered or "policarbonato" in lowered:
        return "Policarbonato"
    if "stylis" in lowered:
        return "Resina High Index"
    if "orma" in lowered or "cr-39" in lowered or INDEX_RE.search(raw_label):
        return "Resina"
    if "ultex" in lowered:
        return "Vidro"
    return None


def infer_index(raw_label: str) -> float | None:
    match = INDEX_RE.search(raw_label)
    return float(match.group(0)) if match else None


def infer_design(family_name: str, page_text: str) -> str:
    lowered = f"{family_name} {page_text}".lower()
    if "eyezen" in lowered or "visão simples" in lowered or "visao simples" in lowered or "single" in lowered:
        return "Visao Simples"
    if "ocupacional" in lowered or "intermediária" in lowered or "intermediaria" in lowered:
        return "Ocupacional"
    if "bifocais" in lowered or "bifocal" in lowered:
        return "Bifocal"
    if "multifocais" in lowered or "progressiva" in lowered or "varilux" in lowered:
        return "Progressiva"
    if "solares" in lowered or "solar" in lowered:
        return "Solar"
    return "Nao identificado"


def build_canonical_label(family_name: str, section_name: str | None, raw_label: str) -> str:
    pieces = [family_name]
    if section_name and section_name not in family_name:
        pieces.append(section_name)
    pieces.append(raw_label)
    return normalize_whitespace(" ".join(piece for piece in pieces if piece))


def build_canonical_label_v2(
    family_name: str,
    section_name: str | None,
    raw_label: str,
    subsection_name: str | None = None,
) -> str:
    pieces = [family_name]
    if section_name and section_name not in family_name:
        pieces.append(section_name)
    if subsection_name and subsection_name not in family_name and subsection_name != section_name:
        pieces.append(subsection_name)
    pieces.append(raw_label)
    return normalize_whitespace(" ".join(piece for piece in pieces if piece))


def is_parent_offer_label(raw_label: str) -> bool:
    if not raw_label or raw_label.startswith("+") or " + " in raw_label:
        return False
    lowered = raw_label.lower()
    return any(
        token in lowered
        for token in (
            "orma",
            "airwear",
            "stylis",
            "poly",
            "cr-39",
            "1.50",
            "1.53",
            "1.56",
            "1.59",
            "1.60",
            "1.67",
            "1.74",
        )
    )


def merge_parent_and_child_label(parent_label: str | None, raw_label: str) -> str:
    if not parent_label or not raw_label.startswith("+"):
        return raw_label
    return normalize_whitespace(f"{parent_label} {raw_label}")


def normalize_treatment_name(column_name: str) -> str:
    return column_name.title().replace("Hr", "HR")


def is_service_page(lines: list[str]) -> bool:
    joined = " ".join(lines[:12]).upper()
    return "SERVIÇOS E TRATAMENTOS" in joined or "SERVICOS E TRATAMENTOS" in joined


def is_code_line(line: str) -> bool:
    codes = CODE_RE.findall(line)
    if not codes:
        return False
    tokens = line.split()
    return len(codes) >= max(1, len(tokens) // 2)


def parse_standard_row(
    line: str,
    columns: list[str],
    page_constraints: dict[str, Any],
    family_name: str,
    section_name: str | None,
    subsection_name: str | None,
    page_text: str,
    parent_label: str | None,
) -> dict[str, Any] | None:
    normalized_line = normalize_whitespace(line)
    upper_line = normalized_line.upper()
    if upper_line.startswith(NOTE_PREFIXES) or "ADIÇÃO" in upper_line or "ADICAO" in upper_line:
        return None

    range_matches = list(
        re.finditer(r"([+\-âˆ’]?\d{1,2}[.,]\d{2})\s+a\s+([+\-âˆ’]?\d{1,2}[.,]\d{2})", line)
    )
    if not range_matches:
        return None
    range_match = range_matches[0]
    inline_add_match = range_matches[1] if len(range_matches) > 1 else None

    price_segment = line[: range_match.start()]
    money_matches = list(MONEY_RE.finditer(price_segment))
    if not money_matches:
        return None

    label_token_count = 0
    if len(money_matches) > 1:
        first_token_value = price_to_number(money_matches[0].group(0))
        second_token_value = price_to_number(money_matches[1].group(0))
        if first_token_value is not None and second_token_value is not None and first_token_value < 10 and second_token_value >= 20:
            label_token_count = 1

    label_end = money_matches[label_token_count].end() if label_token_count else money_matches[0].start()
    raw_label = normalize_whitespace(price_segment[:label_end])
    if not raw_label:
        return None
    if raw_label == "+":
        raw_label = "+ Blue UV Filter"
    if raw_label.startswith("-"):
        return None
    if raw_label.startswith("("):
        return None
    raw_label = merge_parent_and_child_label(parent_label, raw_label)

    price_tokens = [match.group(0) for match in money_matches[label_token_count:]]
    usable_columns = list(columns) if columns else []
    while len(usable_columns) < len(price_tokens):
        usable_columns.append(f"COLUNA_{len(usable_columns) + 1}")
    price_map = {
        usable_columns[index]: price_to_number(token)
        for index, token in enumerate(price_tokens[: len(usable_columns)])
    }

    sph_min = diopter_to_number(range_match.group(1))
    sph_max = diopter_to_number(range_match.group(2))

    base_price = None
    if "SEM AR" in price_map and price_map["SEM AR"] is not None:
        base_price = price_map["SEM AR"]
    elif "VERNIZ HC" in price_map and price_map["VERNIZ HC"] is not None:
        base_price = price_map["VERNIZ HC"]
    else:
        non_null_prices = [value for value in price_map.values() if value is not None]
        base_price = non_null_prices[-1] if non_null_prices else None

    compatibilities: list[dict[str, Any]] = []
    if columns:
        for column_name, value in price_map.items():
            if value is None:
                continue
            if column_name in {"SEM AR"} or column_name.startswith("COLUNA_"):
                continue
            compatibilities.append(
                {
                    "treatment_name": normalize_treatment_name(column_name),
                    "special_price": value,
                }
            )

    metadata = {
        "page_cyl_max": page_constraints["page_cyl_max"],
        "raw_price_token_count": len(price_tokens),
    }
    if section_name:
        metadata["section_name"] = section_name
    if subsection_name:
        metadata["subsection_name"] = subsection_name
    if parent_label:
        metadata["parent_label"] = parent_label

    confidence = 0.86 if columns else 0.6
    if len(price_tokens) < len(columns):
        confidence -= 0.08
    if raw_label == "+":
        confidence -= 0.08

    return {
        "legacy_code": None,
        "raw_label": raw_label,
        "canonical_label": build_canonical_label_v2(family_name, section_name, raw_label, subsection_name),
        "material": infer_material(raw_label),
        "indice_refracao": infer_index(raw_label),
        "is_atomic_offer": False,
        "allows_composition": True,
        "already_includes_treatment": False,
        "features": detect_features(raw_label, family_name, page_text, section_name, subsection_name),
        "base_price": base_price,
        "source_page_reference": None,
        "confidence_level": round(max(0.3, min(confidence, 0.95)), 2),
        "diopter_grids": [
            {
                "sph_min": sph_min,
                "sph_max": sph_max,
                "cyl_min": 0.0,
                "cyl_max": page_constraints["page_cyl_max"],
                "add_min": diopter_to_number(inline_add_match.group(1)) if inline_add_match else page_constraints["page_add_min"],
                "add_max": diopter_to_number(inline_add_match.group(2)) if inline_add_match else page_constraints["page_add_max"],
                "metadata": metadata,
            }
        ],
        "compatible_treatments": compatibilities,
        "_price_map": price_map,
    }


def parse_service_treatments(lines: list[str]) -> list[dict[str, Any]]:
    treatments: list[dict[str, Any]] = []
    capture = False
    for line in lines:
        normalized = normalize_whitespace(line)
        upper = normalized.upper()
        if upper == "TRATAMENTOS":
            capture = True
            continue
        if capture and upper in {"COLORAÇÃO", "COLORACAO", "LENTES VS SOLARES PLANAS", "OUTROS PRODUTOS"}:
            capture = False
        if not capture:
            continue

        match = re.match(r"(.+?)\s+(\d{2,3}(?:\.\d{3})*,\d{2})$", normalized)
        if not match:
            continue

        treatment_name = normalize_whitespace(match.group(1))
        treatments.append(
            {
                "slug": make_slug(treatment_name),
                "name": treatment_name,
                "type": "Antirreflexo" if "antirreflexo" in treatment_name.lower() or "crizal" in treatment_name.lower() else "Servico",
                "tags": ["catalogo_servicos"],
                "features": {
                    "service_price": price_to_number(match.group(2)),
                    "source": "services_page",
                },
            }
        )
    return treatments


def parse_service_catalog_items(lines: list[str]) -> list[dict[str, Any]]:
    section_headers = {
        "OUTROS PRODUTOS": ("Produto", "catalogo_produtos"),
        "COLORAÇÃO": ("Coloracao", "catalogo_coloracao"),
        "COLORACAO": ("Coloracao", "catalogo_coloracao"),
        "TRATAMENTOS": ("Antirreflexo", "catalogo_tratamentos"),
        "SURFAÇAGEM": ("Servico", "catalogo_surfacagem"),
        "SURFACAGEM": ("Servico", "catalogo_surfacagem"),
        "PREÇOS DE PARES": ("Promocao", "catalogo_promocoes"),
        "PRECOS DE PARES": ("Promocao", "catalogo_promocoes"),
        "PROMOCIONAIS": ("Promocao", "catalogo_promocoes"),
        "MONTAGEM AROS FLUTUANTES": ("Servico", "catalogo_montagem"),
        "MONTAGEM AROS FECHADOS": ("Servico", "catalogo_montagem"),
        "NYLON E PARAFUSADAS": ("Servico", "catalogo_montagem"),
        "METAL E ZILO": ("Servico", "catalogo_montagem"),
    }

    items: list[dict[str, Any]] = []
    current_section: str | None = None
    pending_prefix: str | None = None
    last_item: dict[str, Any] | None = None

    for line in lines:
        normalized = normalize_whitespace(line)
        upper = normalized.upper()
        if not normalized:
            continue

        matched_section = next((header for header in section_headers if upper == header), None)
        if matched_section:
            current_section = matched_section
            pending_prefix = None
            last_item = None
            continue

        if upper in {"LENTES VS SOLARES PLANAS", "ACABADAS", "LENTES ESSILOR", "SERVIÇOS E TRATAMENTOS", "SERVICOS E TRATAMENTOS"}:
            continue
        if is_code_line(normalized):
            if last_item is not None:
                last_item["features"]["service_codes"] = CODE_RE.findall(normalized)
            continue
        if re.fullmatch(r"\d+", normalized):
            continue

        if current_section in {"PREÇOS DE PARES", "PRECOS DE PARES"} and upper == "VARILUX -":
            pending_prefix = "Varilux"
            continue
        if current_section in {"PREÇOS DE PARES", "PRECOS DE PARES"} and upper == "STELLEST -":
            pending_prefix = "Stellest"
            continue

        match = re.match(r"(.+?)\s+([+\-]?\d{2,3}(?:\.\d{3})*,\d{2})$", normalized)
        if not match:
            if current_section == "TRATAMENTOS" and not MONEY_RE.search(normalized):
                pending_prefix = normalized
            continue

        item_name = normalize_whitespace(match.group(1))
        if pending_prefix:
            item_name = normalize_whitespace(f"{pending_prefix} {item_name}")
            pending_prefix = None

        if not current_section:
            continue

        base_type, base_tag = section_headers[current_section]
        item_type = base_type
        if current_section == "TRATAMENTOS":
            item_type = "Antirreflexo" if ("antirreflexo" in item_name.lower() or "crizal" in item_name.lower()) else "Servico"

        item = {
            "slug": make_slug(item_name),
            "name": item_name,
            "type": item_type,
            "tags": [base_tag],
            "features": {
                "service_price": price_to_number(match.group(2)),
                "source": "services_page",
                "service_section": current_section,
            },
        }
        items.append(item)
        last_item = item
    return items


def parse_service_mixed_page(
    page_number: int,
    text: str,
    lines: list[str],
    families_by_name: dict[str, dict[str, Any]],
    treatments: dict[str, dict[str, Any]],
    page_analysis: dict[str, Any],
) -> int:
    service_items = parse_service_catalog_items(lines)
    for treatment in service_items:
        treatments.setdefault(treatment["name"], treatment)

    family_name = "LENTES VS SOLARES PLANAS ACABADAS"
    family = get_or_create_family(families_by_name, family_name, page_number, text, lines)

    offer_pattern = re.compile(r"^(?P<label>.+?)\s+(?P<price>\d{1,3}(?:\.\d{3})*,\d{2})$")
    page_offer_count = 0
    capture = False
    header_breaks = {"OUTROS PRODUTOS", "PREÇOS DE PARES", "PRECOS DE PARES", "PROMOCIONAIS", "COLORAÇÃO", "COLORACAO", "TRATAMENTOS"}
    offer_indexes: list[int] = []
    capture_end = len(lines)

    for index, line in enumerate(lines):
        normalized = normalize_whitespace(line)
        upper = normalized.upper()

        if upper == "ACABADAS":
            capture = True
            continue
        if upper in header_breaks:
            if capture:
                capture_end = index
                break
            continue
        if not capture:
            continue

        match = offer_pattern.match(normalized)
        if match and match.group("label").upper() not in {"ACABADAS"}:
            offer_indexes.append(index)

    for position, start_index in enumerate(offer_indexes):
        end_index = offer_indexes[position + 1] if position + 1 < len(offer_indexes) else capture_end
        row_lines = [normalize_whitespace(line) for line in lines[start_index:end_index] if normalize_whitespace(line)]
        if not row_lines:
            continue

        match = offer_pattern.match(row_lines[0])
        if not match:
            continue

        raw_label = match.group("label")
        variant_names = [
            line
            for line in row_lines[1:]
            if not is_code_line(line) and not MONEY_RE.search(line)
        ]
        variant_code_rows = [CODE_RE.findall(line) for line in row_lines[1:] if is_code_line(line)]
        variants: list[dict[str, Any]] = []
        for variant_index, variant_name in enumerate(variant_names):
            variants.append(
                {
                    "name": variant_name,
                    "codes": variant_code_rows[variant_index] if variant_index < len(variant_code_rows) else [],
                }
            )

        offer = {
            "legacy_code": None,
            "raw_label": raw_label,
            "canonical_label": build_canonical_label(family_name, "ACABADAS", raw_label),
            "material": infer_material(raw_label),
            "indice_refracao": infer_index(raw_label),
            "is_atomic_offer": True,
            "allows_composition": False,
            "already_includes_treatment": False,
            "features": {
                **detect_features(raw_label, family_name, text, "ACABADAS", None),
                "available_variants": variants,
            },
            "base_price": price_to_number(match.group("price")),
            "source_page_reference": f"Pagina {page_number}",
            "confidence_level": 0.86,
            "diopter_grids": [],
            "compatible_treatments": [],
        }
        if variant_code_rows:
            offer["legacy_code"] = " / ".join(code for row in variant_code_rows for code in row)
        family["offers"].append(offer)
        page_offer_count += 1

    page_analysis["page_notes"] = page_analysis.get("page_notes", []) + [
        "Servicos/tratamentos extraidos da mesma pagina.",
        f"Itens de servico/promocao categorizados: {len(service_items)}",
    ]
    return page_offer_count


def ensure_treatment(
    treatments: dict[str, dict[str, Any]],
    treatment_name: str,
) -> None:
    key = normalize_treatment_name(treatment_name)
    if key in treatments:
        return
    base_type = TREATMENT_TYPES.get(treatment_name.upper(), "Antirreflexo")
    tags = ["antirreflexo"] if base_type == "Antirreflexo" else [make_slug(base_type)]
    treatments[key] = {
        "slug": make_slug(key),
        "name": key,
        "type": base_type,
        "tags": tags,
        "features": {},
    }


def get_or_create_family(
    families_by_name: dict[str, dict[str, Any]],
    family_name: str,
    page_number: int,
    text: str,
    lines: list[str],
) -> dict[str, Any]:
    family = families_by_name.setdefault(
        family_name,
        {
            "slug": make_slug(family_name),
            "name": family_name,
            "design": infer_design(family_name, text),
            "description_marketing": normalize_whitespace(" ".join(lines[:6])),
            "usage_tags": extract_tags(text, USAGE_TAG_RULES),
            "benefit_tags": extract_tags(text, BENEFIT_TAG_RULES),
            "source_page_reference": f"Pagina {page_number}",
            "offers": [],
        },
    )

    if family["design"] == "Nao identificado":
        family["design"] = infer_design(family_name, text)
    if not family["usage_tags"]:
        family["usage_tags"] = extract_tags(text, USAGE_TAG_RULES)
    if not family["benefit_tags"]:
        family["benefit_tags"] = extract_tags(text, BENEFIT_TAG_RULES)

    return family


def extract_embedded_treatments_from_label(raw_label: str) -> list[str]:
    upper = raw_label.upper()
    embedded: list[str] = []
    for column in KNOWN_COLUMNS:
        if column in {"SEM AR", "VERNIZ HC"}:
            continue
        if column in upper:
            embedded.append(normalize_treatment_name(column))
    return embedded


def parse_stock_ready_page(
    page_number: int,
    text: str,
    lines: list[str],
    families_by_name: dict[str, dict[str, Any]],
    treatments: dict[str, dict[str, Any]],
    page_analysis: dict[str, Any],
) -> int:
    family_name = detect_family_name(lines, None) or "Stock Ready Lenses"
    family = get_or_create_family(families_by_name, family_name, page_number, text, lines)
    page_constraints = extract_page_constraints(text)

    header_index = next((idx for idx, line in enumerate(lines) if "LENTES PRONTAS" in line.upper() and "PRE" in line.upper()), None)
    end_index = next((idx for idx, line in enumerate(lines) if line.upper().startswith("PRE") and "REAIS" in line.upper()), len(lines))
    if header_index is None:
        page_analysis["page_alert"] = "header_stock_nao_encontrado"
        return 0

    stock_pattern = re.compile(
        r"^(?P<label>.+?)\s+(?P<price>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
        r"(?P<sph_min>[+\-−]?\d{1,2},\d{2})\s+a\s+(?P<sph_max>[+\-−]?\d{1,2},\d{2})\s+"
        r"(?P<cyl>[+\-−]?\d{1,2},\d{2})$"
    )

    page_offer_count = 0
    for index in range(header_index + 1, end_index):
        line = normalize_whitespace(lines[index])
        match = stock_pattern.match(line)
        if not match:
            continue

        raw_label = match.group("label")
        base_price = price_to_number(match.group("price"))
        embedded_treatments = extract_embedded_treatments_from_label(raw_label)
        for treatment_name in embedded_treatments:
            ensure_treatment(treatments, treatment_name)

        offer = {
            "legacy_code": None,
            "raw_label": raw_label,
            "canonical_label": build_canonical_label(family_name, "LENTES PRONTAS", raw_label),
            "material": infer_material(raw_label),
            "indice_refracao": infer_index(raw_label),
            "is_atomic_offer": True,
            "allows_composition": False,
            "already_includes_treatment": bool(embedded_treatments),
            "features": {
                **detect_features(raw_label, family_name, text, "LENTES PRONTAS", None),
                "included_treatments": embedded_treatments,
            },
            "base_price": base_price,
            "source_page_reference": f"Pagina {page_number}",
            "confidence_level": 0.93,
            "diopter_grids": [
                {
                    "sph_min": diopter_to_number(match.group("sph_min")),
                    "sph_max": diopter_to_number(match.group("sph_max")),
                    "cyl_min": 0.0,
                    "cyl_max": diopter_to_number(match.group("cyl")),
                    "add_min": page_constraints["page_add_min"],
                    "add_max": page_constraints["page_add_max"],
                    "metadata": {
                        "section_name": "LENTES PRONTAS",
                        "page_parser_type": PAGE_TYPE_STOCK_READY,
                    },
                }
            ],
            "compatible_treatments": [],
        }

        if index + 1 < len(lines) and is_code_line(lines[index + 1]):
            offer["legacy_code"] = " / ".join(CODE_RE.findall(lines[index + 1]))

        family["offers"].append(offer)
        page_offer_count += 1

    return page_offer_count


def parse_multisection_page(
    page_number: int,
    text: str,
    lines: list[str],
    families_by_name: dict[str, dict[str, Any]],
    treatments: dict[str, dict[str, Any]],
    page_analysis: dict[str, Any],
) -> int:
    family_name = detect_family_name(lines, None) or "Multi Section Page"
    family = get_or_create_family(families_by_name, family_name, page_number, text, lines)
    page_offer_count = 0

    basic_pattern = re.compile(
        r"^(?P<label>.+?)\s+(?P<price>\d{1,3}(?:\.\d{3})*,\d{2})\s+(?P<diameter>\d+/\d+)\s+"
        r"(?P<cyl>[+\-−]?\d{1,2},\d{2})\s+(?P<sph_min>[+\-−]?\d{1,2}[.,]\d{2})\s+a\s+(?P<sph_max>[+\-−]?\d{1,2}[.,]\d{2})$"
    )
    digital_pattern = re.compile(
        r"^(?P<label>.+?)\s+(?P<price1>\d{1,3}(?:\.\d{3})*,\d{2})\s+"
        r"(?P<price2>\d{1,3}(?:\.\d{3})*,\d{2})\s+(?P<price3>\d{1,3}(?:\.\d{3})*,\d{2}|-)\s+"
        r"(?P<diameter>\d+/\d+)\s+(?P<cyl>[+\-−]?\d{1,2},\d{2})\s+"
        r"(?P<sph_min>[+\-−]?\d{1,2}[.,]\d{2})\s+a\s+(?P<sph_max>[+\-−]?\d{1,2}[.,]\d{2})$"
    )

    for index, line in enumerate(lines):
        normalized = normalize_whitespace(line)

        digital_match = digital_pattern.match(normalized)
        if digital_match:
            compatibilities = [
                {"treatment_name": "Vert Clair", "special_price": price_to_number(digital_match.group("price1"))},
                {"treatment_name": "Trio Easy Clean", "special_price": price_to_number(digital_match.group("price2"))},
            ]
            ensure_treatment(treatments, "VERT CLAIR")
            ensure_treatment(treatments, "TRIO EASY CLEAN")
            verniz_price = price_to_number(digital_match.group("price3"))
            if verniz_price is not None:
                ensure_treatment(treatments, "VERNIZ HC")
                compatibilities.append({"treatment_name": "Verniz HC", "special_price": verniz_price})

            offer = {
                "legacy_code": None,
                "raw_label": digital_match.group("label"),
                "canonical_label": build_canonical_label(family_name, "LENTES SURFAÇADAS DIGITAIS", digital_match.group("label")),
                "material": infer_material(digital_match.group("label")),
                "indice_refracao": infer_index(digital_match.group("label")),
                "is_atomic_offer": False,
                "allows_composition": True,
                "already_includes_treatment": False,
                "features": detect_features(digital_match.group("label"), family_name, text, "LENTES SURFAÇADAS DIGITAIS", None),
                "base_price": verniz_price or price_to_number(digital_match.group("price2")),
                "source_page_reference": f"Pagina {page_number}",
                "confidence_level": 0.88,
                "diopter_grids": [
                    {
                        "sph_min": diopter_to_number(digital_match.group("sph_min")),
                        "sph_max": diopter_to_number(digital_match.group("sph_max")),
                        "cyl_min": 0.0,
                        "cyl_max": diopter_to_number(digital_match.group("cyl")),
                        "add_min": None,
                        "add_max": None,
                        "metadata": {
                            "diameter": digital_match.group("diameter"),
                            "section_name": "LENTES SURFAÇADAS DIGITAIS",
                            "page_parser_type": PAGE_TYPE_MULTI_SECTION,
                        },
                    }
                ],
                "compatible_treatments": compatibilities,
            }
            if index + 1 < len(lines) and is_code_line(lines[index + 1]):
                offer["legacy_code"] = " / ".join(CODE_RE.findall(lines[index + 1]))
            family["offers"].append(offer)
            page_offer_count += 1
            continue

        basic_match = basic_pattern.match(normalized)
        if basic_match:
            offer = {
                "legacy_code": None,
                "raw_label": basic_match.group("label"),
                "canonical_label": build_canonical_label(family_name, "LENTES ACABADAS", basic_match.group("label")),
                "material": infer_material(basic_match.group("label")),
                "indice_refracao": infer_index(basic_match.group("label")),
                "is_atomic_offer": True,
                "allows_composition": False,
                "already_includes_treatment": False,
                "features": detect_features(basic_match.group("label"), family_name, text, "LENTES ACABADAS", None),
                "base_price": price_to_number(basic_match.group("price")),
                "source_page_reference": f"Pagina {page_number}",
                "confidence_level": 0.9,
                "diopter_grids": [
                    {
                        "sph_min": diopter_to_number(basic_match.group("sph_min")),
                        "sph_max": diopter_to_number(basic_match.group("sph_max")),
                        "cyl_min": 0.0,
                        "cyl_max": diopter_to_number(basic_match.group("cyl")),
                        "add_min": None,
                        "add_max": None,
                        "metadata": {
                            "diameter": basic_match.group("diameter"),
                            "section_name": "LENTES ACABADAS",
                            "page_parser_type": PAGE_TYPE_MULTI_SECTION,
                        },
                    }
                ],
                "compatible_treatments": [],
            }
            if index + 1 < len(lines) and is_code_line(lines[index + 1]):
                offer["legacy_code"] = " / ".join(CODE_RE.findall(lines[index + 1]))
            family["offers"].append(offer)
            page_offer_count += 1

    ultra_light_match = re.search(r"Acrescentar\s+(\d{1,3}(?:\.\d{3})*,\d{2})", text, re.IGNORECASE)
    if ultra_light_match:
        page_analysis["page_notes"] = page_analysis.get("page_notes", []) + [
            f"Ultra Light adicional detectado: {ultra_light_match.group(1)}"
        ]

    return page_offer_count


def parse_stellest_rows(
    page_number: int,
    text: str,
    lines: list[str],
    family: dict[str, Any],
) -> int:
    page_offer_count = 0
    row_start_indexes = [
        index
        for index, line in enumerate(lines)
        if normalize_whitespace(line).startswith(("Stellest 2.0", "Stellest Sun", "Stellest "))
    ]

    for start_pos, start_index in enumerate(row_start_indexes):
        end_index = row_start_indexes[start_pos + 1] if start_pos + 1 < len(row_start_indexes) else len(lines)
        row_text = normalize_whitespace(" ".join(lines[start_index:end_index]))
        if not row_text:
            continue

        price_match = MONEY_RE.search(row_text)
        range_matches = list(
            re.finditer(r"([+\-âˆ’]?\d{1,2}[.,]\d{2})\s+a\s+([+\-âˆ’]?\d{1,2}[.,]\d{2})", row_text)
        )
        if not price_match or not range_matches:
            continue

        raw_label = normalize_whitespace(row_text[: price_match.start()])
        raw_label = raw_label.replace("  ", " ")
        material = "Policarbonato" if "airwear" in row_text.lower() else infer_material(raw_label)
        treatment = "Crizal Sun XProtect" if "xprotect" in row_text.lower() else "Crizal Rock"
        cyl_match = range_matches[1] if len(range_matches) > 1 else None
        prism_match = re.search(r"(\d+)\s*DP/lente", row_text, re.IGNORECASE)
        diameter_match = re.search(r"(\d+mm\s*/\s*\d+mm)", row_text, re.IGNORECASE)

        family["offers"].append(
            {
                "legacy_code": " / ".join(CODE_RE.findall(row_text)) or None,
                "raw_label": raw_label,
                "canonical_label": build_canonical_label_v2(family["name"], "CONTROLE DA MIOPIA INFANTIL", raw_label),
                "material": material,
                "indice_refracao": infer_index(raw_label),
                "is_atomic_offer": True,
                "allows_composition": False,
                "already_includes_treatment": True,
                "features": {
                    **detect_features(raw_label, family["name"], text, "CONTROLE DA MIOPIA INFANTIL", None),
                    "included_treatments": [treatment],
                },
                "base_price": price_to_number(price_match.group(0)),
                "source_page_reference": f"Pagina {page_number}",
                "confidence_level": 0.84,
                "diopter_grids": [
                    {
                        "sph_min": diopter_to_number(range_matches[0].group(1)),
                        "sph_max": diopter_to_number(range_matches[0].group(2)),
                        "cyl_min": diopter_to_number(cyl_match.group(1)) if cyl_match else None,
                        "cyl_max": diopter_to_number(cyl_match.group(2)) if cyl_match else None,
                        "add_min": None,
                        "add_max": None,
                        "metadata": {
                            "section_name": "CONTROLE DA MIOPIA INFANTIL",
                            "prisma": prism_match.group(1) if prism_match else None,
                            "diameter": diameter_match.group(1) if diameter_match else None,
                        },
                    }
                ],
                "compatible_treatments": [],
            }
        )
        page_offer_count += 1

    return page_offer_count


def parse_embedded_ready_lenses_block(
    page_number: int,
    text: str,
    lines: list[str],
    family: dict[str, Any],
) -> int:
    header_index = next(
        (
            idx
            for idx, line in enumerate(lines)
            if "PREÇO" in line.upper() and "ESFÉRICO" in line.upper() and idx > 0 and "LENTES KODAK" in lines[idx - 1].upper()
        ),
        None,
    )
    if header_index is None:
        return 0

    row_start_indexes = [
        idx
        for idx in range(header_index + 1, len(lines))
        if MONEY_RE.search(lines[idx]) and not lines[idx].upper().startswith(("VISÃO", "VISAO"))
    ]

    page_offer_count = 0
    for pos, start_index in enumerate(row_start_indexes):
        next_start = row_start_indexes[pos + 1] if pos + 1 < len(row_start_indexes) else len(lines)
        row_lines = []
        for idx in range(start_index, next_start):
            upper = lines[idx].upper()
            if upper.startswith(("VISÃO", "VISAO")):
                break
            if lines[idx].strip() == str(page_number):
                break
            row_lines.append(lines[idx])

        row_text = normalize_whitespace(" ".join(row_lines))
        if not row_text:
            continue

        price_match = MONEY_RE.search(row_text)
        range_matches = list(
            re.finditer(r"([+\-âˆ’]?\d{1,2}[.,]\d{2})\s+a\s+([+\-âˆ’]?\d{1,2}[.,]\d{2})", row_text)
        )
        if not price_match or not range_matches:
            continue

        raw_label = normalize_whitespace(row_text[: price_match.start()])
        if not raw_label or raw_label.startswith("-"):
            continue
        cyl_match = re.search(r"([+\-âˆ’]?\d{1,2}[.,]\d{2})(?!.*[+\-âˆ’]?\d{1,2}[.,]\d{2})", row_text)
        family["offers"].append(
            {
                "legacy_code": " / ".join(CODE_RE.findall(row_text)) or None,
                "raw_label": raw_label,
                "canonical_label": build_canonical_label_v2(family["name"], "LENTES PRONTAS", raw_label),
                "material": infer_material(raw_label),
                "indice_refracao": infer_index(raw_label),
                "is_atomic_offer": True,
                "allows_composition": False,
                "already_includes_treatment": any(tag in row_text.lower() for tag in ["blue", "crizal", "transitions"]),
                "features": detect_features(raw_label, family["name"], text, "LENTES PRONTAS", None),
                "base_price": price_to_number(price_match.group(0)),
                "source_page_reference": f"Pagina {page_number}",
                "confidence_level": 0.82,
                "diopter_grids": [
                    {
                        "sph_min": diopter_to_number(range_matches[0].group(1)),
                        "sph_max": diopter_to_number(range_matches[0].group(2)),
                        "cyl_min": 0.0,
                        "cyl_max": diopter_to_number(cyl_match.group(1)) if cyl_match else None,
                        "add_min": None,
                        "add_max": None,
                        "metadata": {
                            "section_name": "LENTES PRONTAS",
                            "page_parser_type": PAGE_TYPE_STOCK_READY,
                        },
                    }
                ],
                "compatible_treatments": [],
            }
        )
        page_offer_count += 1

    return page_offer_count


def append_custom_offer_from_line(
    family: dict[str, Any],
    treatments: dict[str, dict[str, Any]],
    page_number: int,
    line: str,
    family_name: str,
    page_text: str,
    page_constraints: dict[str, Any],
    section_name: str | None,
    subsection_name: str | None,
    columns: list[str],
    label_override: str | None = None,
    parent_label: str | None = None,
) -> int:
    target_line = line
    if label_override:
        line_body = normalize_whitespace(line)
        if MONEY_RE.search(line_body):
            first_money = MONEY_RE.search(line_body)
            target_line = f"{label_override} {line_body[first_money.start():]}"
        else:
            target_line = label_override

    parsed_row = parse_standard_row(
        line=target_line,
        columns=columns,
        page_constraints=page_constraints,
        family_name=family_name,
        section_name=section_name,
        subsection_name=subsection_name,
        page_text=page_text,
        parent_label=parent_label,
    )
    if not parsed_row:
        return 0

    parsed_row["source_page_reference"] = f"Pagina {page_number}"
    for compatibility in parsed_row["compatible_treatments"]:
        ensure_treatment(treatments, compatibility["treatment_name"])
    family["offers"].append(parsed_row)
    return 1


def parse_audited_special_page(
    page_number: int,
    text: str,
    lines: list[str],
    families_by_name: dict[str, dict[str, Any]],
    treatments: dict[str, dict[str, Any]],
) -> int | None:
    if page_number not in {18, 19, 20}:
        return None

    family_name = detect_family_name(lines, None)
    if not family_name:
        return 0

    family = get_or_create_family(families_by_name, family_name, page_number, text, lines)
    page_constraints = extract_page_constraints(text)
    count = 0
    full_columns = [
        "CRIZAL PREVENCIA",
        "CRIZAL SAPPHIRE HR",
        "CRIZAL ROCK",
        "CRIZAL EASY PRO",
        "OPTIFOG",
        "TRIO EASY CLEAN",
        "SEM AR",
        "VERNIZ HC",
    ]
    color_columns = [
        "CRIZAL PREVENCIA",
        "CRIZAL SAPPHIRE HR",
        "CRIZAL ROCK",
        "CRIZAL EASY PRO",
        "OPTIFOG",
        "VERNIZ HC",
    ]
    simple_color_columns = ["VERNIZ HC"]

    if page_number == 18:
        for idx, label, parent in [
            (12, "Orma", None),
            (14, "Orma + Transitions Gen S", None),
            (16, "Airwear", None),
            (18, "Airwear + Transitions Gen S", None),
        ]:
            count += append_custom_offer_from_line(
                family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                "TRADICIONAL", None, full_columns, label_override=label, parent_label=parent
            )

        for idx, label in [
            (25, "Orma + Coloração padrão"),
            (27, "Orma + Coloração especial"),
            (29, "Airwear + Coloração padrão"),
            (31, "Airwear + Coloração especial"),
        ]:
            count += append_custom_offer_from_line(
                family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                "COLORAÇÃO", None, simple_color_columns, label_override=label
            )

        for idx, label in [
            (51, "Orma + Coloração padrão"),
            (53, "Orma + Coloração especial"),
            (55, "Orma + Xperio cinza/marrom"),
            (62, "Airwear + Coloração padrão"),
            (64, "Airwear + Coloração especial"),
            (66, "Airwear + Xperio cinza/marrom"),
        ]:
            count += append_custom_offer_from_line(
                family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                "SOLARES / COLORAÇÃO", None, color_columns, label_override=label
            )
        return count

    if page_number == 19:
        for idx, label in [
            (14, "Orma"),
            (16, "Orma + Blue UV Filter"),
            (18, "Orma + Transitions Gen S"),
            (40, "Orma + Transitions Extractive"),
            (42, "Airwear"),
            (44, "Airwear + Transitions Gen S"),
            (101, "Airwear + Transitions Extractive"),
        ]:
            count += append_custom_offer_from_line(
                family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                "DIGITAL", None, full_columns, label_override=label
            )

        for idx, label in [
            (120, "Orma"),
            (122, "Airwear"),
        ]:
            count += append_custom_offer_from_line(
                family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                "TRADICIONAL", None, full_columns, label_override=label
            )

        for idx, label in [
            (138, "Orma + Coloração padrão"),
            (140, "Orma + Coloração especial"),
            (142, "Orma + Xperio cinza/marrom"),
            (149, "Airwear + Coloração padrão"),
            (151, "Airwear + Coloração especial"),
            (153, "Airwear + Xperio cinza/marrom"),
        ]:
            count += append_custom_offer_from_line(
                family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                "SOLARES / COLORAÇÃO", None, color_columns, label_override=label
            )
        return count

    if page_number == 20:
        blocks = [
            ("DIGITAL", "Varilux Digitime near", [(16, "Orma"), (18, "Airwear"), (20, "Stylis 1.67")], full_columns),
            ("DIGITAL", "Varilux Digitime mid", [(32, "Orma"), (34, "Airwear"), (36, "Stylis 1.67")], full_columns),
            ("DIGITAL", "Varilux Roadpilot", [(48, "Orma DAY & NIGHT"), (50, "Airwear + Xperio cinza/marrom")], color_columns),
            ("DIGITAL", "Varilux Sport / Sportwrap", [(65, "Airwear"), (67, "Airwear + Transitions Gen S"), (69, "Airwear + Xperio cinza/marrom")], color_columns),
            ("COLORAÇÃO", "Varilux Activities", [(105, "Orma + Coloração padrão"), (107, "Orma + Coloração especial"), (109, "Airwear + Coloração padrão"), (111, "Airwear + Coloração especial")], ["VERNIZ HC"]),
        ]

        for section_name, subsection_name, entries, columns in blocks:
            for idx, label in entries:
                count += append_custom_offer_from_line(
                    family, treatments, page_number, lines[idx], family_name, text, page_constraints,
                    section_name, subsection_name, columns, label_override=label
                )
        return count

    return None


def parse_optilab_catalog(pdf_path: Path) -> dict[str, Any]:
    document_payload = build_document_payload(pdf_path)
    pages = document_payload["pages"]
    families_by_name: dict[str, dict[str, Any]] = {}
    treatments: dict[str, dict[str, Any]] = {}
    skipped_pages: list[dict[str, Any]] = []
    page_analysis: list[dict[str, Any]] = []
    current_family: str | None = None

    for page in pages:
        page_number = page["page_number"]
        text = page["text"]
        lines = page_lines(text)
        if not lines:
            continue

        classification = classify_page(text, lines)
        parser_type = classification["page_parser_type"]
        analysis_entry = {
            "page_number": page_number,
            "page_parser_type": parser_type,
            "parser_notes": classification["parser_notes"],
            "family_name": None,
            "offers_detected": 0,
        }

        if parser_type == PAGE_TYPE_SERVICE_MIXED:
            analysis_entry["family_name"] = "LENTES VS SOLARES PLANAS ACABADAS"
            page_offer_count = parse_service_mixed_page(
                page_number=page_number,
                text=text,
                lines=lines,
                families_by_name=families_by_name,
                treatments=treatments,
                page_analysis=analysis_entry,
            )
            analysis_entry["offers_detected"] = page_offer_count
            page_analysis.append(analysis_entry)
            continue

        if parser_type == PAGE_TYPE_SERVICES:
            for treatment in parse_service_catalog_items(lines):
                treatments.setdefault(treatment["name"], treatment)
            page_analysis.append(analysis_entry)
            continue

        if parser_type == PAGE_TYPE_STOCK_READY:
            family_name = detect_family_name(lines, current_family)
            if family_name:
                current_family = family_name
                analysis_entry["family_name"] = family_name
            page_offer_count = parse_stock_ready_page(
                page_number=page_number,
                text=text,
                lines=lines,
                families_by_name=families_by_name,
                treatments=treatments,
                page_analysis=analysis_entry,
            )
            analysis_entry["offers_detected"] = page_offer_count
            if page_offer_count == 0:
                skipped_pages.append({"page_number": page_number, "reason": "nenhuma_oferta_detectada"})
            page_analysis.append(analysis_entry)
            continue

        if parser_type == PAGE_TYPE_MULTI_SECTION:
            family_name = detect_family_name(lines, current_family)
            if family_name:
                current_family = family_name
                analysis_entry["family_name"] = family_name
            page_offer_count = parse_multisection_page(
                page_number=page_number,
                text=text,
                lines=lines,
                families_by_name=families_by_name,
                treatments=treatments,
                page_analysis=analysis_entry,
            )
            analysis_entry["offers_detected"] = page_offer_count
            if page_offer_count == 0:
                skipped_pages.append({"page_number": page_number, "reason": "nenhuma_oferta_detectada"})
            page_analysis.append(analysis_entry)
            continue

        if parser_type != PAGE_TYPE_PRICING_MATRIX:
            page_analysis.append(analysis_entry)
            continue

        special_page_offer_count = parse_audited_special_page(
            page_number=page_number,
            text=text,
            lines=lines,
            families_by_name=families_by_name,
            treatments=treatments,
        )
        if special_page_offer_count is not None:
            family_name = detect_family_name(lines, current_family)
            if family_name:
                current_family = family_name
                analysis_entry["family_name"] = family_name
            analysis_entry["offers_detected"] = special_page_offer_count
            page_analysis.append(analysis_entry)
            continue

        family_name = detect_family_name(lines, current_family)
        if not family_name:
            skipped_pages.append({"page_number": page_number, "reason": "familia_nao_identificada"})
            analysis_entry["parser_notes"] = "Tabela matricial sem familia detectada."
            page_analysis.append(analysis_entry)
            continue

        current_family = family_name
        analysis_entry["family_name"] = family_name
        family = get_or_create_family(families_by_name, family_name, page_number, text, lines)

        page_constraints = extract_page_constraints(text)
        current_columns: list[str] = []
        header_buffer: list[str] = []
        current_section: str | None = None
        current_subsection: str | None = None
        current_parent_label: str | None = None
        page_offer_count = 0

        for index, line in enumerate(lines):
            section_candidate = detect_section_name_v2(lines, index)
            if section_candidate:
                if section_candidate in {"LENTES PRONTAS", "SOLARES"} and page_offer_count == 0 and index < 5:
                    continue
                current_section = section_candidate
                current_parent_label = None
                header_buffer = [section_candidate]
                continue

            upper = line.upper()
            normalized_line = normalize_whitespace(line)
            if page_number == 26 and "MATERIAL" in upper and "ANTIRREFLEXO" in upper:
                break
            if page_number == 35 and "LENTES KODAK" in upper and "ESF" in upper and "CIL" in upper:
                break
            if page_number == 26 and "PREÇO MATERIAL ANTIRREFLEXO" in upper:
                break
            if page_number == 35 and "PREÇO ESFÉRICO CILÍNDRICO" in upper and "LENTES KODAK" in upper:
                break
            if (
                normalized_line
                and not any(char.isdigit() for char in normalized_line)
                and normalized_line != family_name
                and not normalized_line.startswith("+")
                and any(
                    token in upper
                    for token in [
                        "VARILUX",
                        "EYEZEN",
                        "KODAK",
                        "ESPACE",
                        "INTERVIEW",
                        "DIGITIME",
                        "ROADPILOT",
                        "SPORT",
                        "SOFTWEAR",
                        "UNIQUE",
                        "PRECISE",
                        "NETWORK",
                        "SINGLE",
                        "EASY SUN",
                        "CITY",
                        "STELLEST",
                    ]
                )
            ):
                current_subsection = normalized_line
                current_parent_label = None
                continue
            if any(token in upper for token in ["CRIZAL", "OPTIFOG", "NO REFLEX", "VERT CLAIR", "VERNIZ HC", "SEM AR", "ESFÉRICO", "ESFERICO", "CILÍNDRICO", "CILINDRICO", "MARCAÇÃO", "MARCACAO", "SURF", "DIGITAL", "TRIO EASY", "FACE INTERNA"]):
                header_buffer.append(line)
                if "ESFÉRICO" in upper or "ESFERICO" in upper or "CILÍNDRICO" in upper or "CILINDRICO" in upper:
                    detected = detect_columns(header_buffer)
                    if detected:
                        current_columns = detected
                continue

            if is_code_line(line):
                if family["offers"]:
                    last_offer = family["offers"][-1]
                    if last_offer.get("source_page_reference") == f"Pagina {page_number}":
                        codes = CODE_RE.findall(line)
                        if codes:
                            existing = last_offer.get("legacy_code")
                            combined = []
                            if existing:
                                combined.extend([part.strip() for part in existing.split("/") if part.strip()])
                            combined.extend(codes)
                            unique_codes = list(dict.fromkeys(combined))
                            last_offer["legacy_code"] = " / ".join(unique_codes)
                continue

            parsed_row = parse_standard_row(
                line=line,
                columns=current_columns,
                page_constraints=page_constraints,
                family_name=family_name,
                section_name=current_section,
                subsection_name=current_subsection,
                page_text=text,
                parent_label=current_parent_label,
            )
            if not parsed_row:
                continue

            parsed_row["source_page_reference"] = f"Pagina {page_number}"
            for compatibility in parsed_row["compatible_treatments"]:
                ensure_treatment(treatments, compatibility["treatment_name"])

            family["offers"].append(parsed_row)
            if is_parent_offer_label(parsed_row["raw_label"]):
                current_parent_label = parsed_row["raw_label"]
            page_offer_count += 1

        if page_number == 26:
            page_offer_count += parse_stellest_rows(
                page_number=page_number,
                text=text,
                lines=lines,
                family=family,
            )

        if page_number == 35:
            page_offer_count += parse_embedded_ready_lenses_block(
                page_number=page_number,
                text=text,
                lines=lines,
                family=family,
            )

        if page_offer_count == 0:
            skipped_pages.append({"page_number": page_number, "reason": "nenhuma_oferta_detectada"})
        analysis_entry["offers_detected"] = page_offer_count
        page_analysis.append(analysis_entry)

    first_page_text = pages[0]["text"] if pages else ""
    version_match = re.search(
        r"Válida de ([0-9]{2} de [a-zç]+ a [0-9]{2} de [a-zç]+ de [0-9]{4})",
        first_page_text,
        re.IGNORECASE,
    )
    version_label = version_match.group(1) if version_match else "Abril a Julho de 2026"

    families = list(families_by_name.values())
    offer_count = sum(len(family["offers"]) for family in families)

    for family in families:
        family["offers"].sort(key=lambda offer: (offer["source_page_reference"], offer["canonical_label"]))

    return {
        "catalog_version": {
            "laboratorio": "Optilab",
            "versao": f"Optilab {version_label}".strip(),
            "status": "draft",
            "source_kind": "pdf",
            "notes": "Draft extraido offline do PDF Optilab 2026 para curadoria humana.",
        },
        "source_document": document_payload,
        "treatments": list(treatments.values()),
        "families": families,
        "metadata": {
            "family_count": len(families),
            "offer_count": offer_count,
            "treatment_count": len(treatments),
            "skipped_pages": skipped_pages,
            "page_analysis": page_analysis,
        },
    }


def write_offers_review_csv(path: Path, families: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=[
                "family_name",
                "raw_label",
                "canonical_label",
                "material",
                "indice_refracao",
                "base_price",
                "compatible_treatments",
                "source_page_reference",
                "confidence_level",
            ],
        )
        writer.writeheader()
        for family in families:
            for offer in family["offers"]:
                writer.writerow(
                    {
                        "family_name": family["name"],
                        "raw_label": offer["raw_label"],
                        "canonical_label": offer["canonical_label"],
                        "material": offer["material"] or "",
                        "indice_refracao": offer["indice_refracao"] or "",
                        "base_price": offer["base_price"] or "",
                        "compatible_treatments": ", ".join(
                            f"{item['treatment_name']}={item['special_price']}"
                            for item in offer["compatible_treatments"]
                        ),
                        "source_page_reference": offer["source_page_reference"],
                        "confidence_level": offer["confidence_level"],
                    }
                )


def write_treatments_review_csv(path: Path, treatments: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=["name", "type", "tags", "features"],
        )
        writer.writeheader()
        for treatment in treatments:
            writer.writerow(
                {
                    "name": treatment["name"],
                    "type": treatment["type"],
                    "tags": ", ".join(treatment.get("tags", [])),
                    "features": json.dumps(treatment.get("features", {}), ensure_ascii=False),
                }
            )


def write_pages_review_csv(path: Path, page_analysis: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=["page_number", "page_parser_type", "family_name", "offers_detected", "parser_notes", "extra_notes"],
        )
        writer.writeheader()
        for item in page_analysis:
            writer.writerow(
                {
                    "page_number": item["page_number"],
                    "page_parser_type": item["page_parser_type"],
                    "family_name": item.get("family_name") or "",
                    "offers_detected": item.get("offers_detected", 0),
                    "parser_notes": item.get("parser_notes", ""),
                    "extra_notes": " | ".join(item.get("page_notes", [])),
                }
            )


def write_summary_md(path: Path, payload: dict[str, Any]) -> None:
    metadata = payload["metadata"]
    families = payload["families"]
    treatments = payload["treatments"]
    top_families = sorted(families, key=lambda family: len(family["offers"]), reverse=True)[:10]
    skipped = metadata["skipped_pages"][:20]
    page_analysis = metadata.get("page_analysis", [])
    parser_totals: dict[str, int] = {}
    for item in page_analysis:
        parser_type = item["page_parser_type"]
        parser_totals[parser_type] = parser_totals.get(parser_type, 0) + 1

    lines = [
        "# Optilab Catalog Summary",
        "",
        f"- Laboratório: {payload['catalog_version']['laboratorio']}",
        f"- Versão: {payload['catalog_version']['versao']}",
        f"- Famílias detectadas: {metadata['family_count']}",
        f"- Ofertas detectadas: {metadata['offer_count']}",
        f"- Tratamentos detectados: {metadata['treatment_count']}",
        "",
        "## Famílias com mais ofertas",
        "",
    ]

    for family in top_families:
        lines.append(f"- {family['name']}: {len(family['offers'])} ofertas")

    lines.extend(["", "## Tipos de página", ""])
    for parser_type, total in sorted(parser_totals.items()):
        lines.append(f"- {parser_type}: {total}")

    lines.extend(["", "## Tratamentos detectados", ""])
    for treatment in sorted(treatments, key=lambda item: item["name"]):
        lines.append(f"- {treatment['name']} ({treatment['type']})")

    lines.extend(["", "## Páginas com alerta", ""])
    if skipped:
        for item in skipped:
            lines.append(f"- Página {item['page_number']}: {item['reason']}")
    else:
        lines.append("- Nenhuma página com alerta nesta rodada.")

    lines.extend(["", "## Exemplos de ofertas", ""])
    for family in top_families[:5]:
        for offer in family["offers"][:3]:
            lines.append(
                f"- {family['name']} | {offer['raw_label']} | base={offer['base_price']} | página={offer['source_page_reference']}"
            )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai um draft estruturado do catalogo Optilab.")
    parser.add_argument("--pdf", default="Tabela Optilab 2026 - PVC - Digital v2.pdf", help="Caminho do PDF de entrada.")
    parser.add_argument("--output", default="tmp/optilab_catalog_draft.json", help="Caminho do JSON de saida.")
    parser.add_argument("--summary", default="tmp/optilab_catalog_summary.md", help="Caminho do resumo em markdown.")
    parser.add_argument("--offers-csv", default="tmp/optilab_offers_review.csv", help="Caminho do CSV de ofertas.")
    parser.add_argument("--treatments-csv", default="tmp/optilab_treatments_review.csv", help="Caminho do CSV de tratamentos.")
    parser.add_argument("--pages-csv", default="tmp/optilab_pages_review.csv", help="Caminho do CSV de paginas.")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise SystemExit(f"PDF nao encontrado: {pdf_path}")

    payload = parse_optilab_catalog(pdf_path)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    write_summary_md(Path(args.summary), payload)
    write_offers_review_csv(Path(args.offers_csv), payload["families"])
    write_treatments_review_csv(Path(args.treatments_csv), payload["treatments"])
    write_pages_review_csv(Path(args.pages_csv), payload["metadata"].get("page_analysis", []))

    metadata = payload["metadata"]
    print(
        f"Draft gerado em {output_path} | familias={metadata['family_count']} "
        f"ofertas={metadata['offer_count']} tratamentos={metadata['treatment_count']}"
    )


if __name__ == "__main__":
    main()
