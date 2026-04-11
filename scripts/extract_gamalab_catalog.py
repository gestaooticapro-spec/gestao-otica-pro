#!/usr/bin/env python3
"""
Extrai um draft estruturado do PDF da Gamalab para o dominio global de lentes.

Escopo desta V1:
- foca no PDF atual `Gamalab_TabelaPrecos2025_02Mar2026.pdf`
- prioriza as familias proprias e mais padronizadas da Gamalab
- preserva texto fonte por pagina
- extrai ofertas, tratamentos e precos das paginas com matrizes mais regulares
- gera um JSON intermediario para revisao humana e futura importacao no Supabase

Limitacoes conhecidas desta V1:
- multimarcas, bifocais, acabadas e servicos ainda podem exigir parser dedicado
- algumas paginas hibridas podem ser registradas como skipped para tratamento futuro
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pypdf nao encontrado no ambiente. Instale-o antes de rodar este script."
    ) from exc


PRICE_RE = re.compile(r"^(?:\d{1,3}(?:\.\d{3})*,\d{2}|-)$")
INDEX_RE = re.compile(r"\b1\.(?:50|53|56|59|60|67|70|74)\b")
VERSION_RE = re.compile(r"Valida a partir de\s*(?:1[oº]\s*de\s*)?Marco de\s*(\d{4})", re.IGNORECASE)

CODE_GROUP_RE = re.compile(r"^\d+(?:\s*/\s*\d+)*$")
EXACT_INDEX_RE = re.compile(r"^1\.(?:50|53|56|59|60|67|70|74)$")
ALL_INDEX_VALUES = (1.50, 1.53, 1.56, 1.59, 1.60, 1.67, 1.70, 1.74)

TREATMENT_COLUMNS = [
    "Sigma Blue",
    "Sigma Supreme",
    "Sigma Premium",
    "Sigma Light",
    "Sem Antirreflexo",
]

MATRIX_HEADER_SKIP = {
    "MULTIFOCAIS",
    "MULTIMARCAS",
    "BIFOCAIS",
    "LENTES PRONTAS",
    "VISÃO SIMPLES",
    "ACABADAS",
    "SOLARES",
    "VALOR",
    "DISPONIBILIDADE",
    "ANTIRREFLEXO",
}

USAGE_TAG_RULES = {
    "dirigir": ["dirigir"],
    "tv": ["tv"],
    "computador": ["computador", "computadores"],
    "leitura": ["leitura"],
    "smartphone": ["smartphone", "smartphones"],
    "cinema_teatro": ["cinema", "teatro"],
}

BENEFIT_TAG_RULES = {
    "adaptacao_rapida": ["adaptacao", "adaptação"],
    "conforto_visual": ["conforto visual", "conforto"],
    "nitidez": ["nitidez"],
    "alta_tecnologia": ["alta tecnologia", "digital"],
    "campos_amplos": ["campos de visao amplos", "visao panoramica", "amplitude de visao"],
}

FAMILY_PAGE_CONFIG: dict[int, dict[str, str]] = {
    7: {"name": "Quantum A.I.", "design": "Progressiva"},
    8: {"name": "Gamavision 4K", "design": "Progressiva"},
    9: {"name": "Gamavision Pro Individual", "design": "Progressiva"},
    10: {"name": "Dynamic Premium", "design": "Progressiva"},
    11: {"name": "Gamavision Freeform", "design": "Progressiva"},
    12: {"name": "Dynamic Pro", "design": "Progressiva"},
    13: {"name": "Life", "design": "Progressiva"},
    14: {"name": "Gama HD", "design": "Progressiva"},
    15: {"name": "Dynamic Work", "design": "Ocupacional"},
    16: {"name": "Dynamic Relax", "design": "Monofocal"},
    17: {"name": "Dynamic Single", "design": "Monofocal"},
    18: {"name": "MioKids", "design": "Controle de Miopia"},
    19: {"name": "Visão Simples Surfaçadas Digital", "design": "Monofocal"},
}


@dataclass
class ParsedPricingPage:
    family_name: str
    codes: list[str]
    columns: list[str]
    labels: list[str]
    rows: list[dict[str, Any]]
    raw_footer: str


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_ascii(value: str) -> str:
    replacements = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "ã": "a",
            "â": "a",
            "é": "e",
            "ê": "e",
            "í": "i",
            "ó": "o",
            "ô": "o",
            "õ": "o",
            "ú": "u",
            "ç": "c",
            "Á": "A",
            "À": "A",
            "Ã": "A",
            "Â": "A",
            "É": "E",
            "Ê": "E",
            "Í": "I",
            "Ó": "O",
            "Ô": "O",
            "Õ": "O",
            "Ú": "U",
            "Ç": "C",
        }
    )
    return normalize_whitespace(value).translate(replacements)


def make_slug(value: str) -> str:
    cleaned = normalize_ascii(value).lower()
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    return cleaned.strip("_")


def price_to_number(token: str | None) -> float | None:
    if token is None:
        return None
    token = token.strip()
    if not token or token == "-":
        return None
    return float(token.replace(".", "").replace(",", "."))


def int_token_to_number(token: str | None) -> float | None:
    if token is None:
        return None
    normalized = normalize_ascii(str(token)).strip()
    if not normalized or not normalized.isdigit():
        return None
    return float(normalized)


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
    lowered = normalize_ascii(text).lower()
    tags: list[str] = []
    for tag, keywords in rules.items():
        if any(keyword in lowered for keyword in keywords):
            tags.append(tag)
    return tags


def infer_design(text: str) -> str:
    lowered = normalize_ascii(text).lower()
    if "controle da miopia" in lowered or "miokids" in lowered:
        return "Controle de Miopia"
    if "lentes progressivas" in lowered or "multifocais" in lowered:
        return "Progressiva"
    if "ocupacional" in lowered:
        return "Ocupacional"
    if "visao simples" in lowered or "lentes monofocais" in lowered:
        return "Monofocal"
    return "Nao identificado"


def extract_page_header_summary(lines: list[str]) -> str:
    header_lines: list[str] = []
    stop_tokens = ("blue", "supreme", "premium", "light", "ref", "antirreflexo")

    for raw_line in lines:
        line = normalize_whitespace(raw_line)
        if not line:
            continue
        lowered = normalize_ascii(line).lower()
        if any(lowered.startswith(token) for token in stop_tokens):
            break
        if PRICE_RE.match(line) or is_code_group_token(line) or is_index_token(line):
            break
        if any(char.isdigit() for char in line) and len(line.split()) > 3:
            break
        header_lines.append(line)
        if len(header_lines) >= 4:
            break

    return normalize_whitespace(" ".join(header_lines))


def detect_features(raw_label: str) -> dict[str, Any]:
    lowered = normalize_ascii(raw_label).lower()
    return {
        "blue_uv": "blue uv" in lowered,
        "photofusion": "photofusion" in lowered,
        "sensity": "sensity" in lowered,
        "transitions": "transitions" in lowered,
        "extractive": "extractive" in lowered,
        "acclimates": "acclimates" in lowered,
        "foto": lowered.startswith("foto ") or " foto " in lowered,
        "polarizado": "polarizado" in lowered or "polarizada" in lowered,
        "espelhada": "espelhada" in lowered or "epelhada" in lowered,
        "antirreflexo_externo": "ar externo" in lowered,
    }


def infer_material(raw_label: str) -> str | None:
    lowered = normalize_ascii(raw_label).lower()
    if "trivex" in lowered:
        return "Trivex"
    if "poli" in lowered:
        return "Policarbonato"
    if "airwear" in lowered:
        return "Policarbonato"
    if "stylis" in lowered:
        return "Resina"
    match = INDEX_RE.search(normalize_ascii(raw_label))
    if match:
        if match.group(0) == "1.59":
            return "Policarbonato"
        return "Resina"
    return None


def infer_index(raw_label: str) -> float | None:
    match = INDEX_RE.search(normalize_ascii(raw_label))
    return float(match.group(0)) if match else None


def format_index_value(index_value: float | None) -> str | None:
    if index_value is None:
        return None
    return f"{index_value:.2f}"


def strip_leading_index(raw_label: str) -> str:
    normalized = normalize_whitespace(raw_label)
    return normalize_whitespace(re.sub(r"^1\.(?:50|53|56|59|60|67|70|74)\s+", "", normalized))


def infer_material_from_index(index_value: str | None) -> str | None:
    if not index_value:
        return None
    if index_value == "1.59":
        return "Policarbonato"
    return "Resina"


def is_atomic_offer(raw_label: str) -> bool:
    return "com ar externo" in normalize_ascii(raw_label).lower()


def build_canonical_label(family_name: str, raw_label: str) -> str:
    raw_label = normalize_whitespace(raw_label)
    if family_name.lower() in raw_label.lower():
        return raw_label
    return f"{family_name} {raw_label}"


def extract_layout_offer_index_map(layout_text: str) -> dict[str, str]:
    index_by_code: dict[str, str] = {}
    current_index: str | None = None
    pending_codes: list[str] = []

    for raw_line in layout_text.splitlines():
        line = normalize_whitespace(raw_line)
        if not line:
            continue

        tokens = line.split()
        if len(tokens) == 1 and EXACT_INDEX_RE.fullmatch(tokens[0]):
            current_index = tokens[0]
            if pending_codes:
                for pending_code in pending_codes:
                    index_by_code.setdefault(pending_code, current_index)
                pending_codes.clear()
            continue

        if tokens and EXACT_INDEX_RE.fullmatch(tokens[0]):
            current_index = tokens[0]
            tokens = tokens[1:]
            if pending_codes:
                for pending_code in pending_codes:
                    index_by_code.setdefault(pending_code, current_index)
                pending_codes.clear()

        if len(tokens) < 12 or not tokens[0].isdigit():
            continue

        tail = tokens[-10:]
        valid_tail = True
        for token_index in range(0, 10, 2):
            code_token = tail[token_index]
            price_token = tail[token_index + 1]
            if not ((code_token.isdigit() or code_token == "-") and (PRICE_RE.match(price_token) or price_token == "-")):
                valid_tail = False
                break

        if not valid_tail:
            continue

        if current_index is None:
            pending_codes.append(tokens[0])
            continue

        index_by_code[tokens[0]] = current_index

    return index_by_code


def resolve_index_from_legacy_code(legacy_code: str | None, fallback_index: str | None, layout_offer_index_map: dict[str, str]) -> str | None:
    if not legacy_code:
        return fallback_index

    normalized_code = normalize_ascii(str(legacy_code))
    direct_match = layout_offer_index_map.get(normalized_code)
    if direct_match:
        return direct_match

    for token in re.findall(r"\d+", normalized_code):
        if len(token) >= 3 and token in layout_offer_index_map:
            return layout_offer_index_map[token]

    return fallback_index


def resolve_sequential_block_collisions(family: dict[str, Any]) -> None:
    collision_groups: dict[tuple[str, float], list[dict[str, Any]]] = {}
    for offer in family["offers"]:
        metadata = offer.get("metadata", {})
        if metadata.get("availability_text"):
            continue
        index_value = offer.get("indice_refracao")
        if index_value is None:
            continue
        label_body = strip_leading_index(offer.get("raw_label", ""))
        collision_groups.setdefault((label_body, float(index_value)), []).append(offer)

    for (label_body, current_index), offers in collision_groups.items():
        if len(offers) <= 1:
            continue
        block_indices = {
            offer.get("metadata", {}).get("block_index_in_page")
            for offer in offers
            if offer.get("metadata", {}).get("block_index_in_page") is not None
        }
        if len(block_indices) <= 1:
            continue
        base_prices = [offer.get("base_price") for offer in offers]
        if any(price is None for price in base_prices):
            continue
        if len(set(base_prices)) != len(base_prices):
            continue

        candidate_indices = [value for value in ALL_INDEX_VALUES if value >= current_index]
        if len(candidate_indices) < len(offers):
            continue

        for offer, new_index in zip(
            sorted(
                offers,
                key=lambda item: (
                    item.get("base_price") or 0,
                    item.get("metadata", {}).get("block_index_in_page") or 0,
                ),
            ),
            candidate_indices[: len(offers)],
        ):
            index_text = format_index_value(new_index)
            if not index_text:
                continue
            offer["raw_label"] = normalize_whitespace(f"{index_text} {label_body}")
            offer["canonical_label"] = build_canonical_label(family["name"], offer["raw_label"])
            offer["indice_refracao"] = new_index
            offer["material"] = infer_material(label_body) or infer_material_from_index(index_text)
            offer.setdefault("metadata", {})
            offer["metadata"]["subsection_name"] = index_text
            offer["metadata"]["index_reassigned_from_block_collision"] = True


def ensure_unique_offer_labels(family: dict[str, Any]) -> None:
    canonical_counts: dict[str, int] = {}
    for offer in family["offers"]:
        canonical = offer["canonical_label"]
        canonical_counts[canonical] = canonical_counts.get(canonical, 0) + 1

    canonical_offers: dict[str, list[dict[str, Any]]] = {}
    for offer in family["offers"]:
        canonical_offers.setdefault(offer["canonical_label"], []).append(offer)

    collision_index: dict[str, int] = {}
    for offer in family["offers"]:
        canonical = offer["canonical_label"]
        if canonical_counts.get(canonical, 0) <= 1:
            continue

        collision_index[canonical] = collision_index.get(canonical, 0) + 1
        occurrence = collision_index[canonical]
        sibling_offers = canonical_offers.get(canonical, [])
        availability_texts = {
            sibling.get("metadata", {}).get("availability_text")
            for sibling in sibling_offers
            if sibling.get("metadata", {}).get("availability_text")
        }
        block_indices = {
            sibling.get("metadata", {}).get("block_index_in_page")
            for sibling in sibling_offers
            if sibling.get("metadata", {}).get("block_index_in_page") is not None
        }
        block_index = offer.get("metadata", {}).get("block_index_in_page")
        availability_text = offer.get("metadata", {}).get("availability_text")
        legacy_code = str(offer.get("legacy_code") or "").strip()
        if availability_text and len(availability_texts) > 1:
            suffix = f"[grade {availability_text}]"
        elif block_index is not None and len(block_indices) > 1:
            suffix = f"[bloco {block_index}]"
        elif legacy_code:
            suffix = f"[ref {legacy_code}]" if occurrence == 1 else f"[ref {legacy_code} v{occurrence}]"
        else:
            suffix = f"[variante {occurrence}]"
        offer["raw_label"] = normalize_whitespace(f"{offer['raw_label']} {suffix}")
        offer["canonical_label"] = build_canonical_label(family["name"], offer["raw_label"])
        offer.setdefault("metadata", {})
        offer["metadata"]["label_disambiguated"] = True
        if availability_text and len(availability_texts) > 1:
            offer["metadata"]["label_disambiguation_basis"] = "availability_text"
        elif block_index is not None and len(block_indices) > 1:
            offer["metadata"]["label_disambiguation_basis"] = "block_index_in_page"
        elif legacy_code:
            offer["metadata"]["label_disambiguation_basis"] = "legacy_code"
        else:
            offer["metadata"]["label_disambiguation_basis"] = "occurrence"


def collapse_identical_offers(family: dict[str, Any]) -> None:
    unique_offers: list[dict[str, Any]] = []
    seen_signatures: set[tuple[Any, ...]] = set()

    for offer in family["offers"]:
        compat_signature = tuple(
            (
                compatibility.get("treatment_name"),
                compatibility.get("special_price"),
                compatibility.get("legacy_code"),
            )
            for compatibility in offer.get("compatible_treatments", [])
        )
        signature = (
            offer.get("legacy_code"),
            offer.get("raw_label"),
            offer.get("base_price"),
            offer.get("source_page_reference"),
            compat_signature,
        )
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)
        unique_offers.append(offer)

    family["offers"] = unique_offers


def is_numeric_token(token: str) -> bool:
    normalized = normalize_ascii(token)
    return bool(PRICE_RE.match(normalized) or normalized.isdigit())


def is_code_group_token(token: str) -> bool:
    normalized = normalize_ascii(token)
    return bool(normalized.isdigit() or CODE_GROUP_RE.fullmatch(normalized))


def is_index_token(token: str) -> bool:
    return bool(re.fullmatch(r"1\.(?:50|53|56|59|60|67|70|74)", normalize_ascii(token)))


def is_label_candidate(token: str) -> bool:
    normalized = normalize_ascii(token)
    if not normalized:
        return False
    if is_numeric_token(normalized) or is_index_token(normalized) or is_code_group_token(normalized):
        return False
    lowered = normalized.lower()
    noise_prefixes = (
        "tabela de precos",
        "ref ",
        "sem",
        "lentes",
        "valores por par",
        "altura de montagem",
        "visao",
        "longo",
        "intermediaria",
        "perto",
    )
    if lowered.startswith(noise_prefixes):
        return False
    if " - " in normalized and any(char.isdigit() for char in normalized):
        return False
    return True


def parse_pricing_page(text: str) -> ParsedPricingPage:
    lines = [normalize_whitespace(line) for line in text.splitlines() if normalize_whitespace(line)]
    if not lines:
        raise ValueError("Pagina vazia")

    cursor = 0
    codes: list[str] = []
    while cursor < len(lines) and lines[cursor].isdigit():
        codes.append(lines[cursor])
        cursor += 1

    if not codes:
        raise ValueError("Nao foi possivel identificar o bloco de codigos da pagina")

    price_tokens: list[str] = []
    while cursor < len(lines) and PRICE_RE.match(lines[cursor]):
        price_tokens.append(lines[cursor])
        cursor += 1

    if not price_tokens:
        raise ValueError("Nao foi possivel identificar o bloco de precos da pagina")

    if len(price_tokens) % len(codes) != 0:
        raise ValueError(
            f"Quantidade de precos ({len(price_tokens)}) nao multipla da quantidade de codigos ({len(codes)})"
        )

    column_count = len(price_tokens) // len(codes)
    columns = TREATMENT_COLUMNS[:column_count]
    if len(columns) != column_count:
        columns = [f"Coluna {index + 1}" for index in range(column_count)]

    labels = lines[cursor : cursor + len(codes)]
    if len(labels) != len(codes):
        raise ValueError("Nao foi possivel identificar todas as labels das ofertas da pagina")
    cursor += len(codes)

    footer_lines = lines[cursor:]
    footer_text = normalize_whitespace(" ".join(footer_lines))

    family_name = "Familia nao identificada"
    footer_upper = normalize_ascii(footer_text).upper()
    if "SEM ANTIRREFLEXO" in footer_upper and "COM TRATAMENTO ANTIRREFLEXO" in footer_upper:
        family_name = normalize_whitespace(
            footer_upper.split("SEM ANTIRREFLEXO", 1)[1].split("COM TRATAMENTO ANTIRREFLEXO", 1)[0]
        ).title()

    rows: list[dict[str, Any]] = []
    total_codes = len(codes)
    for row_index, code in enumerate(codes):
        price_map = {
            columns[column_index]: price_tokens[column_index * total_codes + row_index]
            for column_index in range(column_count)
        }
        rows.append(
            {
                "code": code,
                "raw_label": labels[row_index],
                "price_map": price_map,
            }
        )

    return ParsedPricingPage(
        family_name=family_name,
        codes=codes,
        columns=columns,
        labels=labels,
        rows=rows,
        raw_footer=footer_text,
    )


def extract_clean_column_blocks(lines: list[str], column_count: int = 5) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    cursor = 0

    while cursor < len(lines):
        found_block = False
        for label_start in range(cursor, len(lines)):
            if not is_label_candidate(lines[label_start]):
                continue

            label_end = label_start
            while label_end < len(lines) and is_label_candidate(lines[label_end]):
                label_end += 1

            labels = lines[label_start:label_end]
            offer_count = len(labels)
            if offer_count < 3:
                continue

            code_end = label_end + offer_count
            if code_end > len(lines):
                continue

            base_codes = lines[label_end:code_end]
            if not all(is_code_group_token(token) for token in base_codes):
                continue

            numeric_span = 2 * column_count * offer_count
            data_start = label_start - numeric_span
            if data_start < cursor:
                continue

            numeric_tokens = lines[data_start:label_start]
            if len(numeric_tokens) != numeric_span:
                continue
            if not all(is_numeric_token(token) for token in numeric_tokens):
                continue

            index_value = None
            next_cursor = code_end
            if code_end < len(lines) and is_index_token(lines[code_end]):
                index_value = normalize_ascii(lines[code_end])
                next_cursor = code_end + 1
            elif data_start > 0:
                previous_token = normalize_ascii(lines[data_start - 1])
                match = re.search(r"(1\.(?:50|53|56|59|60|67|70|74))$", previous_token)
                if match:
                    index_value = match.group(1)
                    next_cursor = code_end

            columns: list[dict[str, Any]] = []
            offset = 0
            for column_name in TREATMENT_COLUMNS[:column_count]:
                prices = numeric_tokens[offset : offset + offer_count]
                codes = numeric_tokens[offset + offer_count : offset + (2 * offer_count)]
                columns.append(
                    {
                        "name": column_name,
                        "prices": prices,
                        "codes": codes,
                        "costs": [int_token_to_number(token) for token in codes],
                    }
                )
                offset += 2 * offer_count

            blocks.append(
                {
                    "labels": labels,
                    "base_codes": base_codes,
                    "columns": columns,
                    "index": index_value,
                    "data_start": data_start,
                    "data_end": code_end,
                }
            )
            cursor = next_cursor
            found_block = True
            break

        if not found_block:
            cursor += 1

    return blocks


def parse_miokids_page(lines: list[str]) -> list[dict[str, Any]]:
    candidate_line = next((normalize_ascii(line) for line in lines if line.startswith("Incolor ")), "")
    if not candidate_line:
        return []
    match = re.search(
        r"Incolor\s+"
        r"(?P<blue_price>\d{1,3}(?:\.\d{3})*,\d{2})(?P<blue_code>\d{3,4})\s+"
        r"(?P<supreme_price>\d{1,3}(?:\.\d{3})*,\d{2})(?P<supreme_code>\d{3,4})\s+"
        r"(?P<premium_price>\d{1,3}(?:\.\d{3})*,\d{2})(?P<premium_code>\d{3,4})\s+"
        r"(?P<light_price>\d{1,3}(?:\.\d{3})*,\d{2})(?P<light_code>\d{3,4})\s+"
        r"(?P<sem_price>\d{1,3}(?:\.\d{3})*,\d{2})(?P<sem_code>\d{3,4})(?P<legacy_code>\d{5})(?P<index>1\.(?:50|53|56|59|60|67|70|74))",
        candidate_line,
    )
    if not match:
        return []
    blue_price = match.group("blue_price")
    supreme_price = match.group("supreme_price")
    premium_price = match.group("premium_price")
    light_price = match.group("light_price")
    sem_price = match.group("sem_price")
    premium_cost = int_token_to_number(match.group("premium_code"))
    supreme_cost = int_token_to_number(match.group("supreme_code"))
    light_cost = int_token_to_number(match.group("light_code"))
    sem_cost = int_token_to_number(match.group("sem_code"))
    blue_cost = int_token_to_number(match.group("blue_code"))
    legacy_code = match.group("legacy_code")
    index_value = match.group("index")

    return [
        {
            "legacy_code": legacy_code,
            "raw_label": f"{index_value} Incolor",
            "material": "Policarbonato" if index_value == "1.59" else "Resina",
            "indice_refracao": float(index_value),
            "base_price": price_to_number(sem_price),
            "cost_price": sem_cost,
            "compatible_treatments": [
                {"treatment_name": "Sigma Blue", "special_price": price_to_number(blue_price), "cost_price": blue_cost},
                {"treatment_name": "Sigma Supreme", "special_price": price_to_number(supreme_price), "cost_price": supreme_cost},
                {"treatment_name": "Sigma Premium", "special_price": price_to_number(premium_price), "cost_price": premium_cost},
                {"treatment_name": "Sigma Light", "special_price": price_to_number(light_price), "cost_price": light_cost},
            ],
        }
    ]


def parse_five_column_matrix_row(line: str) -> dict[str, Any] | None:
    tokens = normalize_whitespace(line).split()
    if len(tokens) < 12 or not tokens[0].isdigit():
        return None

    tail = tokens[-10:]
    for index in range(0, 10, 2):
        if not tail[index].isdigit():
            return None
        if not PRICE_RE.match(tail[index + 1]):
            return None

    label = " ".join(tokens[1:-10]).strip()
    if not label:
        return None

    columns: list[dict[str, Any]] = []
    for index, column_name in enumerate(TREATMENT_COLUMNS):
        columns.append(
            {
                "name": column_name,
                "cost_price": int_token_to_number(tail[index * 2]),
                "price": price_to_number(tail[index * 2 + 1]),
            }
        )

    return {
        "legacy_code": tokens[0],
        "raw_label": label,
        "columns": columns,
    }


def is_section_header_line(line: str) -> bool:
    normalized = normalize_whitespace(line)
    if not normalized:
        return False
    ascii_line = normalize_ascii(normalized)
    if ascii_line.upper() in MATRIX_HEADER_SKIP:
        return False
    if "Tabela de Precos" in ascii_line:
        return False
    if any(char.isdigit() for char in normalized):
        return False
    if PRICE_RE.match(normalized):
        return False
    return True


def parse_sectioned_matrix_page(lines: list[str]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None

    for line in lines:
        parsed_row = parse_five_column_matrix_row(line)
        if parsed_row is not None:
            if current_section is None:
                current_section = {"section_name": "Sem seção identificada", "rows": []}
                sections.append(current_section)
            current_section["rows"].append(parsed_row)
            continue

        if is_section_header_line(line):
            current_section = {"section_name": normalize_whitespace(line), "rows": []}
            sections.append(current_section)

    return [section for section in sections if section["rows"]]


def extract_index_hint(text: str) -> str | None:
    match = INDEX_RE.search(normalize_ascii(text))
    return match.group(0) if match else None


def parse_simple_value_sections(lines: list[str]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None

    section_re = re.compile(r"^(?P<section>.+?)\s+VALOR$")
    row_re = re.compile(
        r"^(?:(?P<code>\d{3,5})\s+)?(?P<label>.+?)\s+(?P<availability>\d+)\s+(?P<price>\d{1,3}(?:\.\d{3})*,\d{2})$"
    )

    for line in lines:
        normalized = normalize_whitespace(line)
        if not normalized or "Tabela de Precos" in normalize_ascii(normalized):
            continue

        section_match = section_re.match(normalized)
        if section_match:
            current_section = {
                "section_name": normalize_whitespace(section_match.group("section")),
                "rows": [],
            }
            sections.append(current_section)
            continue

        row_match = row_re.match(normalized)
        if row_match and current_section is not None:
            current_section["rows"].append(
                {
                    "legacy_code": row_match.group("code"),
                    "raw_label": normalize_whitespace(row_match.group("label")),
                    "availability_code": row_match.group("availability"),
                    "cost_price": int_token_to_number(row_match.group("availability")),
                    "base_price": price_to_number(row_match.group("price")),
                }
            )

    return [section for section in sections if section["rows"]]


def clean_section_header(line: str) -> str:
    normalized = normalize_whitespace(line)
    normalized = re.sub(r"\s+DISPONIBILIDADE\s+VALOR$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+VALOR$", "", normalized, flags=re.IGNORECASE)
    return normalize_whitespace(normalized)


def parse_stock_row(line: str) -> dict[str, Any] | None:
    normalized_line = normalize_whitespace(line)
    normalized_line = re.sub(r"(?i)(ESTENDIDO)EM\b", r"\1 EM", normalized_line)
    tail_match = re.search(
        r"(?P<availability_code>\d{2,4})\s*(?P<price>\d{1,3}(?:\.\d{3})*,\d{2}|\?)$",
        normalized_line,
    )
    if not tail_match:
        return None

    prefix = normalized_line[: tail_match.start()].strip()
    tokens = prefix.split()
    if len(tokens) < 2 or not tokens[0].isdigit():
        return None

    price_token = tail_match.group("price")
    availability_code = tail_match.group("availability_code")

    middle_tokens = tokens[1:]
    if not middle_tokens:
        return None

    availability_start = None
    for index, token in enumerate(middle_tokens):
        ascii_token = normalize_ascii(token).lower()
        if (token.startswith(("-", "+", "*")) or re.match(r"^\d", token)) and not is_index_token(token):
            availability_start = index
            break
        if ascii_token.startswith(("cil", "soma")):
            availability_start = index
            break

    if availability_start is None:
        label_tokens = middle_tokens
        availability_tokens: list[str] = []
    else:
        label_tokens = middle_tokens[:availability_start]
        availability_tokens = middle_tokens[availability_start:]

    label = normalize_whitespace(" ".join(label_tokens))
    if not label:
        return None

    return {
        "legacy_code": tokens[0],
        "raw_label": label,
        "availability_text": normalize_whitespace(" ".join(availability_tokens)) or None,
        "availability_code": availability_code,
        "cost_price": int_token_to_number(availability_code),
        "base_price": None if price_token == "?" else price_to_number(price_token),
    }


def refine_lumina_stock_label(raw_label: str, availability_text: str | None) -> str:
    label = normalize_whitespace(raw_label)
    availability = normalize_ascii(availability_text or "").lower()
    label_ascii = normalize_ascii(label).lower()

    if "em breve" in label_ascii:
        label = re.sub(r"(?i)\bem\s+breve\b", "Em Breve", label)
        label_ascii = normalize_ascii(label).lower()
    if "estendido" in availability and "estendido" not in label_ascii:
        label = normalize_whitespace(f"{label} Cilíndrico Estendido")
        label_ascii = normalize_ascii(label).lower()
    if "breve" in availability and "breve" not in label_ascii:
        label = normalize_whitespace(f"{label} Em Breve")

    return label


def parse_stock_page_sections(lines: list[str]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None

    for line in lines:
        normalized = normalize_whitespace(line)
        if not normalized or "Tabela de Precos" in normalize_ascii(normalized):
            continue

        row = parse_stock_row(normalized)
        if row is not None:
            if current_section is None:
                current_section = {"section_name": "Sem seção identificada", "rows": []}
                sections.append(current_section)
            current_section["rows"].append(row)
            continue

        cleaned_header = clean_section_header(normalized)
        if not cleaned_header:
            continue
        if cleaned_header == normalized or normalized.endswith("VALOR") or "DISPONIBILIDADE" in normalized:
            if is_section_header_line(cleaned_header):
                current_section = {"section_name": cleaned_header, "rows": []}
                sections.append(current_section)

    return [section for section in sections if section["rows"]]


def parse_service_value_part(text: str) -> tuple[str | None, float | None] | None:
    match = re.match(r"^(?P<code>\d+)\s+(?P<price>\d{1,3}(?:\.\d{3})*,\d{2}|\?)$", normalize_whitespace(text))
    if not match:
        return None
    return match.group("code"), None if match.group("price") == "?" else price_to_number(match.group("price"))


def parse_service_name_part(text: str) -> tuple[str | None, str]:
    normalized = normalize_whitespace(text)
    match = re.match(r"^(?P<code>\d{3,5})\s+(?P<label>.+)$", normalized)
    if not match:
        return None, normalized
    return match.group("code"), normalize_whitespace(match.group("label"))


def infer_service_category(section_name: str) -> str:
    lowered = normalize_ascii(section_name).lower()
    if "tratamentos antirreflexo" in lowered:
        return "treatment"
    if "coloracoes" in lowered:
        return "coloration"
    if "montagem" in lowered:
        return "service"
    if "insumos" in lowered:
        return "supply"
    return "service"


def parse_auxiliary_services_page(raw_layout_text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    current_left_section: str | None = None
    current_right_section: str | None = None

    def handle_pair(name_part: str, value_part: str, side: str) -> None:
        nonlocal current_left_section, current_right_section
        name_part = normalize_whitespace(name_part)
        value_part = normalize_whitespace(value_part)
        if not name_part or not value_part:
            return

        if value_part == "VALOR":
            if side == "left":
                current_left_section = name_part
            else:
                current_right_section = name_part
            return

        parsed_value = parse_service_value_part(value_part)
        if parsed_value is None:
            return

        item_code, label = parse_service_name_part(name_part)
        value_code, price = parsed_value
        section_name = current_left_section if side == "left" else current_right_section
        if not section_name:
            section_name = "Sem seção identificada"

        items.append(
            {
                "section_name": section_name,
                "category": infer_service_category(section_name),
                "item_name": label,
                "item_code": item_code,
                "value_code": value_code,
                "price": price,
            }
        )

    for raw_line in raw_layout_text.splitlines():
        if not raw_line.strip():
            continue

        parts = [part.strip() for part in re.split(r"\s{8,}", raw_line.strip()) if part.strip()]
        if not parts:
            continue

        if len(parts) == 3 and parts[1] == "VALOR" and parts[2] == "VALOR":
            current_left_section = parts[0]
            current_right_section = parts[0]
            continue

        if len(parts) == 4:
            handle_pair(parts[0], parts[1], "left")
            handle_pair(parts[2], parts[3], "right")
            continue

        if len(parts) == 2:
            handle_pair(parts[0], parts[1], "left")

    return items


def is_pricing_page(text: str) -> bool:
    lowered = normalize_ascii(text).lower()
    return "tabela de precos" in lowered


def build_document_payload(pdf_path: Path) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    full_text_parts: list[str] = []
    pages_payload: list[dict[str, Any]] = []

    for index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        layout_text = page.extract_text(extraction_mode="layout") or page_text
        normalized = page_text.replace("\x00", " ").strip()
        normalized_layout = layout_text.replace("\x00", " ").strip()
        full_text_parts.append(normalized)
        chunks = chunk_text(normalized)
        pages_payload.append(
            {
                "page_number": index,
                "text": normalized,
                "layout_text": normalized_layout,
                "chunks": [
                    {
                        "chunk_index": chunk_index + 1,
                        "text": chunk_text_value,
                    }
                    for chunk_index, chunk_text_value in enumerate(chunks)
                ],
            }
        )

    full_text = "\n\n".join(part for part in full_text_parts if part)
    document_hash = sha256(pdf_path.read_bytes()).hexdigest()

    return {
        "document_name": pdf_path.name,
        "source_path": str(pdf_path),
        "document_hash": document_hash,
        "extraction_engine": "pypdf",
        "extracted_text": full_text,
        "pages": pages_payload,
    }


def build_family_entry(
    family_name: str,
    design: str,
    description_text: str,
    price_page_number: int,
) -> dict[str, Any]:
    return {
        "slug": make_slug(family_name),
        "name": family_name,
        "design": design,
        "description_marketing": normalize_whitespace(description_text),
        "usage_tags": extract_tags(description_text, USAGE_TAG_RULES),
        "benefit_tags": extract_tags(description_text, BENEFIT_TAG_RULES),
        "source_page_reference": f"Pagina {price_page_number - 1}-{price_page_number}",
        "offers": [],
    }


def get_or_create_family(
    families_by_name: dict[str, dict[str, Any]],
    family_name: str,
    design: str,
    description_text: str,
    price_page_number: int,
) -> dict[str, Any]:
    return families_by_name.setdefault(
        family_name,
        build_family_entry(family_name, design, description_text, price_page_number),
    )


def parse_gamalab_catalog(pdf_path: Path) -> dict[str, Any]:
    document_payload = build_document_payload(pdf_path)
    pages = document_payload["pages"]
    families_by_name: dict[str, dict[str, Any]] = {}
    treatments: dict[str, dict[str, Any]] = {}
    service_items: list[dict[str, Any]] = []
    skipped_pages: list[dict[str, Any]] = []
    processed_pages: list[int] = []
    page_diagnostics: list[dict[str, Any]] = []

    for page in pages:
        page_number = page["page_number"]
        page_text = page["text"]
        lines = [normalize_whitespace(line) for line in page_text.splitlines() if normalize_whitespace(line)]
        layout_text = page.get("layout_text", page_text)
        layout_lines = [normalize_whitespace(line) for line in layout_text.splitlines() if normalize_whitespace(line)]
        page_config = FAMILY_PAGE_CONFIG.get(page_number)

        if page_number == 20:
            sections = parse_sectioned_matrix_page(layout_lines)
            page_diagnostics.append(
                {
                    "page_number": page_number,
                    "family_name": "Multifocais Multimarcas",
                    "line_count": len(layout_lines),
                    "manual_sections": len(sections),
                }
            )
            if not sections:
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": "Nao foi possivel extrair as secoes multimarcas da pagina 20",
                    }
                )
                continue

            for section in sections:
                family_name = section["section_name"]
                family = get_or_create_family(
                    families_by_name,
                    family_name=family_name,
                    design="Progressiva",
                    description_text="MULTIFOCAIS MULTIMARCAS",
                    price_page_number=page_number,
                )
                for row in section["rows"]:
                    raw_label = normalize_whitespace(row["raw_label"])
                    base_price = None
                    cost_price = None
                    compatibilities: list[dict[str, Any]] = []
                    for column in row["columns"]:
                        if column["name"] == "Sem Antirreflexo":
                            base_price = column["price"]
                            cost_price = column.get("cost_price")
                            continue
                        treatments.setdefault(
                            column["name"],
                            {
                                "slug": make_slug(column["name"]),
                                "name": column["name"],
                                "type": "Antirreflexo",
                                "tags": ["antirreflexo"],
                            },
                        )
                        compatibilities.append(
                            {
                                "treatment_name": column["name"],
                                "special_price": column["price"],
                                "cost_price": column.get("cost_price"),
                            }
                        )
                    inferred_index = infer_index(raw_label)
                    family["offers"].append(
                        {
                            "legacy_code": row["legacy_code"],
                            "raw_label": raw_label,
                            "canonical_label": build_canonical_label(family_name, raw_label),
                            "material": infer_material(raw_label) or infer_material_from_index(
                                f"{inferred_index:.2f}" if inferred_index is not None else None
                            ),
                            "indice_refracao": inferred_index,
                            "is_atomic_offer": False,
                            "allows_composition": True,
                            "already_includes_treatment": False,
                            "features": detect_features(raw_label),
                            "base_price": base_price,
                            "cost_price": cost_price,
                            "source_page_reference": f"Pagina {page_number}",
                            "confidence_level": 0.9,
                            "diopter_grids": [],
                            "compatible_treatments": compatibilities,
                            "metadata": {
                                "section_name": section["section_name"],
                                "manual_parse": True,
                                "page_group": "20_multimarcas",
                                "cost_price": cost_price,
                            },
                        }
                    )

            processed_pages.append(page_number)
            continue

        if page_number == 21:
            sections = parse_sectioned_matrix_page(layout_lines)
            page_diagnostics.append(
                {
                    "page_number": page_number,
                    "family_name": "Bifocais",
                    "line_count": len(layout_lines),
                    "manual_sections": len(sections),
                }
            )
            if not sections:
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": "Nao foi possivel extrair as secoes bifocais da pagina 21",
                    }
                )
                continue

            for section in sections:
                family_name = section["section_name"]
                family = get_or_create_family(
                    families_by_name,
                    family_name=family_name,
                    design="Bifocal",
                    description_text="BIFOCAIS",
                    price_page_number=page_number,
                )
                for row in section["rows"]:
                    raw_label = normalize_whitespace(row["raw_label"])
                    base_price = None
                    cost_price = None
                    compatibilities: list[dict[str, Any]] = []
                    for column in row["columns"]:
                        if column["name"] == "Sem Antirreflexo":
                            base_price = column["price"]
                            cost_price = column.get("cost_price")
                            continue
                        treatments.setdefault(
                            column["name"],
                            {
                                "slug": make_slug(column["name"]),
                                "name": column["name"],
                                "type": "Antirreflexo",
                                "tags": ["antirreflexo"],
                            },
                        )
                        compatibilities.append(
                            {
                                "treatment_name": column["name"],
                                "special_price": column["price"],
                                "cost_price": column.get("cost_price"),
                            }
                        )
                    inferred_index = infer_index(raw_label)
                    family["offers"].append(
                        {
                            "legacy_code": row["legacy_code"],
                            "raw_label": raw_label,
                            "canonical_label": build_canonical_label(family_name, raw_label),
                            "material": infer_material(raw_label) or infer_material_from_index(
                                f"{inferred_index:.2f}" if inferred_index is not None else None
                            ),
                            "indice_refracao": inferred_index,
                            "is_atomic_offer": False,
                            "allows_composition": True,
                            "already_includes_treatment": False,
                            "features": detect_features(raw_label),
                            "base_price": base_price,
                            "cost_price": cost_price,
                            "source_page_reference": f"Pagina {page_number}",
                            "confidence_level": 0.9,
                            "diopter_grids": [],
                            "compatible_treatments": compatibilities,
                            "metadata": {
                                "section_name": section["section_name"],
                                "manual_parse": True,
                                "page_group": "21_bifocais",
                                "cost_price": cost_price,
                            },
                        }
                    )

            processed_pages.append(page_number)
            continue

        if page_number in {22, 23, 24}:
            sections = parse_stock_page_sections(layout_lines)
            page_diagnostics.append(
                {
                    "page_number": page_number,
                    "family_name": "Estoque / Prontas / Acabadas",
                    "line_count": len(layout_lines),
                    "manual_sections": len(sections),
                }
            )
            if not sections:
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": f"Nao foi possivel extrair as secoes de estoque da pagina {page_number}",
                    }
                )
                continue

            for section in sections:
                if page_number == 22:
                    family_name = section["section_name"]
                    family_design = "Pronta"
                else:
                    family_name = f"{section['section_name']} Acabadas"
                    family_design = "Acabada"
                family = get_or_create_family(
                    families_by_name,
                    family_name=family_name,
                    design=family_design,
                    description_text=clean_section_header(layout_lines[0]) if layout_lines else "",
                    price_page_number=page_number,
                )
                section_index = extract_index_hint(section["section_name"])
                for row in section["rows"]:
                    raw_label = row["raw_label"]
                    if family_name == "Lentes Prontas Lumina":
                        raw_label = refine_lumina_stock_label(raw_label, row["availability_text"])
                    if section_index and not extract_index_hint(raw_label):
                        raw_label = normalize_whitespace(f"{section_index} {raw_label}")
                    inferred_index = infer_index(raw_label) or (float(section_index) if section_index else None)
                    family["offers"].append(
                        {
                            "legacy_code": row["legacy_code"],
                            "raw_label": raw_label,
                            "canonical_label": build_canonical_label(family_name, raw_label),
                            "material": infer_material(raw_label) or infer_material_from_index(
                                f"{inferred_index:.2f}" if inferred_index is not None else section_index
                            ),
                            "indice_refracao": inferred_index,
                            "is_atomic_offer": True,
                            "allows_composition": False,
                            "already_includes_treatment": True,
                            "features": detect_features(family_name + " " + raw_label),
                            "base_price": row["base_price"],
                            "cost_price": row.get("cost_price"),
                            "source_page_reference": f"Pagina {page_number}",
                            "confidence_level": 0.84,
                            "diopter_grids": [],
                            "compatible_treatments": [],
                            "metadata": {
                                "section_name": section["section_name"],
                                "availability_text": row["availability_text"],
                                "availability_code": row["availability_code"],
                                "cost_price": row.get("cost_price"),
                                "manual_parse": True,
                                "page_group": f"{page_number}_estoque",
                            },
                        }
                    )

            processed_pages.append(page_number)
            continue

        if page_number == 25:
            sections = parse_simple_value_sections(layout_lines)
            page_diagnostics.append(
                {
                    "page_number": page_number,
                    "family_name": "Solares",
                    "line_count": len(layout_lines),
                    "manual_sections": len(sections),
                }
            )
            if not sections:
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": "Nao foi possivel extrair as secoes solares da pagina 25",
                    }
                )
                continue

            for section in sections:
                family_name = section["section_name"]
                family = get_or_create_family(
                    families_by_name,
                    family_name=family_name,
                    design="Solar",
                    description_text="SOLARES",
                    price_page_number=page_number,
                )
                section_index = extract_index_hint(section["section_name"])
                for row in section["rows"]:
                    raw_label = row["raw_label"]
                    if section_index and not extract_index_hint(raw_label):
                        raw_label = normalize_whitespace(f"{section_index} {raw_label}")
                    inferred_index = infer_index(raw_label) or (float(section_index) if section_index else None)
                    family["offers"].append(
                        {
                            "legacy_code": row["legacy_code"],
                            "raw_label": raw_label,
                            "canonical_label": build_canonical_label(family_name, raw_label),
                            "material": infer_material(raw_label) or infer_material_from_index(
                                f"{inferred_index:.2f}" if inferred_index is not None else section_index
                            ),
                            "indice_refracao": inferred_index,
                            "is_atomic_offer": True,
                            "allows_composition": False,
                            "already_includes_treatment": True,
                            "features": detect_features(family_name + " " + raw_label),
                            "base_price": row["base_price"],
                            "cost_price": row.get("cost_price"),
                            "source_page_reference": f"Pagina {page_number}",
                            "confidence_level": 0.86,
                            "diopter_grids": [],
                            "compatible_treatments": [],
                            "metadata": {
                                "section_name": section["section_name"],
                                "availability_code": row["availability_code"],
                                "cost_price": row.get("cost_price"),
                                "manual_parse": True,
                                "page_group": "25_solares",
                            },
                        }
                    )

            processed_pages.append(page_number)
            continue

        if page_number == 26:
            auxiliary_items = parse_auxiliary_services_page(layout_text)
            page_diagnostics.append(
                {
                    "page_number": page_number,
                    "family_name": "Tratamentos e Serviços",
                    "line_count": len(layout_lines),
                    "manual_items": len(auxiliary_items),
                }
            )
            if not auxiliary_items:
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": "Nao foi possivel extrair os itens auxiliares da pagina 26",
                    }
                )
                continue

            for item in auxiliary_items:
                service_items.append(
                    {
                        **item,
                        "source_page_reference": f"Pagina {page_number}",
                    }
                )

            processed_pages.append(page_number)
            continue

        if page_config is None:
            if is_pricing_page(page_text):
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": "Pagina fora do escopo da V1 inicial da Gamalab",
                    }
                )
            continue

        layout_offer_index_map = extract_layout_offer_index_map(layout_text) if 7 <= page_number <= 19 else {}
        description_page = pages[page_number - 2] if page_number >= 2 else None
        if page_number == 18:
            description_text = page_text
        elif description_page and (page_number - 1) not in FAMILY_PAGE_CONFIG:
            description_text = description_page["text"]
        else:
            description_text = extract_page_header_summary(layout_lines)

        family_name = page_config["name"] if page_config else f"Pagina {page_number}"
        family_design = page_config["design"] if page_config else infer_design(description_text)
        family = get_or_create_family(
            families_by_name,
            family_name=family_name,
            design=family_design,
            description_text=description_text,
            price_page_number=page_number,
        )

        if page_number == 18:
            manual_offers = parse_miokids_page(lines)
            page_diagnostics.append(
                {
                    "page_number": page_number,
                    "family_name": family_name,
                    "line_count": len(lines),
                    "clean_blocks": 0,
                    "manual_offers": len(manual_offers),
                }
            )
            if not manual_offers:
                skipped_pages.append(
                    {
                        "page_number": page_number,
                        "reason": "Nao foi possivel extrair a oferta compactada da MioKids",
                    }
                )
                continue

            for offer in manual_offers:
                for compatibility in offer["compatible_treatments"]:
                    treatments.setdefault(
                        compatibility["treatment_name"],
                        {
                            "slug": make_slug(compatibility["treatment_name"]),
                            "name": compatibility["treatment_name"],
                            "type": "Antirreflexo",
                            "tags": ["antirreflexo"],
                        },
                    )
                family["offers"].append(
                    {
                        "legacy_code": offer["legacy_code"],
                        "raw_label": offer["raw_label"],
                        "canonical_label": build_canonical_label(family_name, offer["raw_label"]),
                        "material": offer["material"],
                        "indice_refracao": offer["indice_refracao"],
                        "is_atomic_offer": False,
                        "allows_composition": True,
                        "already_includes_treatment": False,
                        "features": detect_features(offer["raw_label"]),
                        "base_price": offer["base_price"],
                        "source_page_reference": f"Pagina {page_number}",
                        "confidence_level": 0.68,
                        "diopter_grids": [],
                        "compatible_treatments": offer["compatible_treatments"],
                        "metadata": {
                            "subsection_name": "MioKids",
                            "manual_parse": True,
                        },
                    }
                )
            processed_pages.append(page_number)
            continue

        blocks = extract_clean_column_blocks(lines)
        page_diagnostics.append(
            {
                "page_number": page_number,
                "family_name": family_name,
                "line_count": len(lines),
                "clean_blocks": len(blocks),
            }
        )

        if not blocks:
            skipped_pages.append(
                {
                    "page_number": page_number,
                    "reason": "Nenhum bloco limpo detectado na matriz da pagina",
                }
            )
            continue

        for block_index, block in enumerate(blocks, start=1):
            subsection = block.get("index")
            resolved_indices = [
                resolve_index_from_legacy_code(base_code, subsection, layout_offer_index_map)
                for base_code in block["base_codes"]
            ]
            for offer_index, resolved_index in enumerate(resolved_indices):
                if resolved_index is not None:
                    continue
                previous_index = resolved_indices[offer_index - 1] if offer_index > 0 else None
                next_index = resolved_indices[offer_index + 1] if offer_index + 1 < len(resolved_indices) else None
                if previous_index and previous_index == next_index:
                    resolved_indices[offer_index] = previous_index

            for offer_index, label in enumerate(block["labels"]):
                legacy_code = block["base_codes"][offer_index]
                resolved_index = resolved_indices[offer_index]
                raw_label = f"{resolved_index} {label}" if resolved_index else label
                raw_label = normalize_whitespace(raw_label)
                atomic = is_atomic_offer(raw_label)
                base_price = None
                cost_price = None
                compatibilities: list[dict[str, Any]] = []

                for column in block["columns"]:
                    column_name = column["name"]
                    price_value = price_to_number(column["prices"][offer_index])
                    column_cost = (column.get("costs") or [None] * len(block["labels"]))[offer_index]
                    if column_name == "Sem Antirreflexo":
                        base_price = price_value
                        cost_price = column_cost
                        continue

                    if price_value is None:
                        continue

                    treatments.setdefault(
                        column_name,
                        {
                            "slug": make_slug(column_name),
                            "name": column_name,
                            "type": "Antirreflexo",
                            "tags": ["antirreflexo"],
                        },
                    )
                    compatibilities.append(
                        {
                            "treatment_name": column_name,
                            "special_price": price_value,
                            "cost_price": column_cost,
                        }
                    )

                family["offers"].append(
                    {
                        "legacy_code": legacy_code,
                        "raw_label": raw_label,
                        "canonical_label": build_canonical_label(family_name, raw_label),
                        "material": infer_material(raw_label) or infer_material_from_index(resolved_index),
                        "indice_refracao": infer_index(raw_label) or (float(resolved_index) if resolved_index else None),
                        "is_atomic_offer": atomic,
                        "allows_composition": not atomic,
                        "already_includes_treatment": atomic,
                        "features": detect_features(raw_label),
                        "base_price": base_price,
                        "cost_price": cost_price,
                        "source_page_reference": f"Pagina {page_number}",
                        "confidence_level": 0.82 if subsection else 0.72,
                        "diopter_grids": [],
                        "compatible_treatments": compatibilities,
                        "metadata": {
                            "subsection_name": resolved_index or subsection,
                            "block_offer_count": len(block["labels"]),
                            "layout_index_resolved": bool(layout_offer_index_map.get(str(legacy_code))),
                            "block_index_in_page": block_index,
                            "cost_price": cost_price,
                        },
                    }
                )

        processed_pages.append(page_number)

    first_page_text = normalize_ascii(pages[0]["text"]) if pages else ""
    version_match = VERSION_RE.search(first_page_text)
    version_label = f"1 de Marco de {version_match.group(1)}" if version_match else "Marco de 2026"
    families = list(families_by_name.values())
    for family in families:
        collapse_identical_offers(family)
        resolve_sequential_block_collisions(family)
        ensure_unique_offer_labels(family)

    return {
        "catalog_version": {
            "laboratorio": "Gamalab",
            "versao": f"Gamalab {version_label}",
            "status": "draft",
            "source_kind": "pdf",
            "notes": (
                "Draft extraido offline do PDF Gamalab 2026 para curadoria humana. "
                "Esta V1 prioriza as familias proprias e mais padronizadas; "
                "multimarcas, bifocais, acabadas e servicos ainda podem exigir parser dedicado."
            ),
        },
        "source_document": document_payload,
        "treatments": list(treatments.values()),
        "service_items": service_items,
        "families": families,
        "metadata": {
            "family_count": len(families),
            "offer_count": sum(len(family["offers"]) for family in families),
            "treatment_count": len(treatments),
            "service_item_count": len(service_items),
            "processed_pages": processed_pages,
            "page_diagnostics": page_diagnostics,
            "skipped_pages": skipped_pages,
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
                "cost_price",
                "compatible_treatments",
                "source_page_reference",
                "confidence_level",
                "section_name",
                "subsection_name",
                "availability_text",
                "cost_hint",
                "page_group",
                "label_disambiguation_basis",
                "is_atomic_offer",
            ],
        )
        writer.writeheader()
        for family in families:
            for offer in family["offers"]:
                metadata = offer.get("metadata", {})
                writer.writerow(
                    {
                        "family_name": family["name"],
                        "raw_label": offer["raw_label"],
                        "canonical_label": offer["canonical_label"],
                        "material": offer.get("material") or "",
                        "indice_refracao": offer.get("indice_refracao") or "",
                        "base_price": offer.get("base_price") or "",
                        "cost_price": offer.get("cost_price") or "",
                        "compatible_treatments": ", ".join(
                            f"{item['treatment_name']}={item['special_price']}|cost={item.get('cost_price')}"
                            for item in offer.get("compatible_treatments", [])
                        ),
                        "source_page_reference": offer.get("source_page_reference", ""),
                        "confidence_level": offer.get("confidence_level", ""),
                        "section_name": metadata.get("section_name", ""),
                        "subsection_name": metadata.get("subsection_name", ""),
                        "availability_text": metadata.get("availability_text", ""),
                        "cost_hint": metadata.get("availability_code", ""),
                        "page_group": metadata.get("page_group", ""),
                        "label_disambiguation_basis": metadata.get("label_disambiguation_basis", ""),
                        "is_atomic_offer": offer.get("is_atomic_offer", False),
                    }
                )


def write_treatments_review_csv(path: Path, treatments: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=["name", "type", "tags", "features"])
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


def write_services_review_csv(path: Path, service_items: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=[
                "section_name",
                "category",
                "item_name",
                "item_code",
                "value_code",
                "price",
                "source_page_reference",
            ],
        )
        writer.writeheader()
        for item in service_items:
            writer.writerow(
                {
                    "section_name": item.get("section_name", ""),
                    "category": item.get("category", ""),
                    "item_name": item.get("item_name", ""),
                    "item_code": item.get("item_code", ""),
                    "value_code": item.get("value_code", ""),
                    "price": item.get("price", ""),
                    "source_page_reference": item.get("source_page_reference", ""),
                }
            )


def write_pages_review_csv(path: Path, page_diagnostics: list[dict[str, Any]], skipped_pages: list[dict[str, Any]]) -> None:
    skipped_by_page = {item["page_number"]: item for item in skipped_pages}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=[
                "page_number",
                "family_name",
                "line_count",
                "clean_blocks",
                "manual_sections",
                "manual_items",
                "extra_json",
                "skip_reason",
            ],
        )
        writer.writeheader()
        for item in page_diagnostics:
            page_number = item.get("page_number")
            extra = {
                key: value
                for key, value in item.items()
                if key
                not in {"page_number", "family_name", "line_count", "clean_blocks", "manual_sections", "manual_items"}
            }
            writer.writerow(
                {
                    "page_number": page_number,
                    "family_name": item.get("family_name", ""),
                    "line_count": item.get("line_count", ""),
                    "clean_blocks": item.get("clean_blocks", ""),
                    "manual_sections": item.get("manual_sections", ""),
                    "manual_items": item.get("manual_items", ""),
                    "extra_json": json.dumps(extra, ensure_ascii=False) if extra else "",
                    "skip_reason": skipped_by_page.get(page_number, {}).get("reason", ""),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai um draft estruturado do catalogo Gamalab.")
    parser.add_argument(
        "--pdf",
        default=".tabelas/Gamalab_TabelaPrecos2025_02Mar2026.pdf",
        help="Caminho do PDF de entrada.",
    )
    parser.add_argument("--output", default="tmp/gamalab_catalog_draft.json", help="Caminho do JSON de saida.")
    parser.add_argument("--offers-csv", default="tmp/gamalab_offers_review.csv", help="Caminho do CSV de ofertas.")
    parser.add_argument(
        "--treatments-csv",
        default="tmp/gamalab_treatments_review.csv",
        help="Caminho do CSV de tratamentos.",
    )
    parser.add_argument(
        "--services-csv",
        default="tmp/gamalab_services_review.csv",
        help="Caminho do CSV de servicos auxiliares.",
    )
    parser.add_argument("--pages-csv", default="tmp/gamalab_pages_review.csv", help="Caminho do CSV de paginas.")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise SystemExit(f"PDF nao encontrado: {pdf_path}")

    payload = parse_gamalab_catalog(pdf_path)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    write_offers_review_csv(Path(args.offers_csv), payload["families"])
    write_treatments_review_csv(Path(args.treatments_csv), payload["treatments"])
    write_services_review_csv(Path(args.services_csv), payload.get("service_items", []))
    write_pages_review_csv(
        Path(args.pages_csv),
        payload["metadata"].get("page_diagnostics", []),
        payload["metadata"].get("skipped_pages", []),
    )

    metadata = payload["metadata"]
    print(
        f"Draft gerado em {output_path} | familias={metadata['family_count']} "
        f"ofertas={metadata['offer_count']} tratamentos={metadata['treatment_count']}"
    )


if __name__ == "__main__":
    main()
