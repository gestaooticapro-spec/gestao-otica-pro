#!/usr/bin/env python3
"""
Extrai um draft estruturado do PDF da Gamalab para o dominio global de lentes.

Escopo desta V1:
- 1 laboratorio (Gamalab)
- preserva texto fonte por pagina
- extrai familias a partir das paginas descritivas
- extrai ofertas, tratamentos e precos das paginas "Tabela de Precos"
- gera um JSON intermediario para revisao humana e futura importacao no Supabase
"""

from __future__ import annotations

import argparse
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
INDEX_RE = re.compile(r"\b1\.(?:50|53|56|59|60|67|74)\b")
TREATMENT_COLUMNS = [
    "Sigma Blue",
    "Sigma Supreme",
    "Sigma Premium",
    "Sigma Light",
    "Sem Antirreflexo",
]

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
    "campos_amplos": ["campos de visão amplos", "visão panorâmica", "amplitude de visão"],
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


def infer_design(text: str) -> str:
    lowered = text.lower()
    if "lentes progressivas" in lowered:
        return "Progressiva"
    if "lentes monofocais" in lowered:
        return "Monofocal"
    if "ocupacional" in lowered:
        return "Ocupacional"
    return "Nao identificado"


def detect_features(raw_label: str) -> dict[str, Any]:
    lowered = raw_label.lower()
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
    lowered = raw_label.lower()
    if "trivex" in lowered:
        return "Trivex"
    if "poli" in lowered:
        return "Policarbonato"
    if INDEX_RE.search(raw_label):
        return "Resina"
    return None


def infer_index(raw_label: str) -> float | None:
    match = INDEX_RE.search(raw_label)
    return float(match.group(0)) if match else None


def is_atomic_offer(raw_label: str) -> bool:
    return "com ar externo" in raw_label.lower()


def build_canonical_label(family_name: str, raw_label: str) -> str:
    raw_label = normalize_whitespace(raw_label)
    if family_name.lower() in raw_label.lower():
        return raw_label
    return f"{family_name} {raw_label}"


def parse_pricing_page(text: str) -> ParsedPricingPage:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
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

    family_name = ""
    if "SEM ANTIRREFLEXO" in footer_text and "COM TRATAMENTO ANTIRREFLEXO" in footer_text:
        family_name = normalize_whitespace(
            footer_text.split("SEM ANTIRREFLEXO", 1)[1].split("COM TRATAMENTO ANTIRREFLEXO", 1)[0]
        )
    if not family_name:
        family_name = "Familia nao identificada"

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


def is_pricing_page(text: str) -> bool:
    lowered = text.lower()
    return "tabela de preços" in lowered or "tabela de precos" in lowered


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


def parse_gamalab_catalog(pdf_path: Path) -> dict[str, Any]:
    document_payload = build_document_payload(pdf_path)
    pages = document_payload["pages"]
    families: list[dict[str, Any]] = []
    treatments: dict[str, dict[str, Any]] = {}
    skipped_pages: list[dict[str, Any]] = []

    for page in pages:
        page_text = page["text"]
        if not is_pricing_page(page_text):
            continue

        price_page_number = page["page_number"]
        description_page = pages[price_page_number - 2] if price_page_number >= 2 else None
        description_text = description_page["text"] if description_page else ""
        try:
            parsed = parse_pricing_page(page_text)
        except ValueError as exc:
            skipped_pages.append(
                {
                    "page_number": price_page_number,
                    "reason": str(exc),
                }
            )
            continue

        family = {
            "slug": make_slug(parsed.family_name),
            "name": parsed.family_name.title(),
            "design": infer_design(description_text),
            "description_marketing": normalize_whitespace(description_text),
            "usage_tags": extract_tags(description_text, USAGE_TAG_RULES),
            "benefit_tags": extract_tags(description_text, BENEFIT_TAG_RULES),
            "source_page_reference": f"Pagina {price_page_number - 1}-{price_page_number}",
            "offers": [],
        }

        for row in parsed.rows:
            raw_label = normalize_whitespace(row["raw_label"])
            atomic = is_atomic_offer(raw_label)
            sem_price = None
            compatibilities: list[dict[str, Any]] = []

            for column_name, token in row["price_map"].items():
                price_value = price_to_number(token)
                if column_name == "Sem Antirreflexo":
                    sem_price = price_value
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
                    }
                )

            family["offers"].append(
                {
                    "legacy_code": row["code"],
                    "raw_label": raw_label,
                    "canonical_label": build_canonical_label(parsed.family_name.title(), raw_label),
                    "material": infer_material(raw_label),
                    "indice_refracao": infer_index(raw_label),
                    "is_atomic_offer": atomic,
                    "allows_composition": not atomic,
                    "already_includes_treatment": atomic,
                    "features": detect_features(raw_label),
                    "base_price": sem_price,
                    "source_page_reference": f"Pagina {price_page_number}",
                    "confidence_level": 0.72,
                    "diopter_grids": [],
                    "compatible_treatments": compatibilities,
                }
            )

        families.append(family)

    first_page_text = pages[0]["text"] if pages else ""
    version_match = re.search(r"V[áa]lida a partir de ([A-Za-zçÇãõéÉ ]+ de \d{4})", first_page_text, re.IGNORECASE)
    version_label = version_match.group(1) if version_match else "Tabela Custo 2022"

    return {
        "catalog_version": {
            "laboratorio": "Gamalab",
            "versao": f"Gamalab {version_label}".strip(),
            "status": "draft",
            "source_kind": "pdf",
            "notes": "Draft extraido offline do PDF Gamalab para curadoria humana.",
        },
        "source_document": document_payload,
        "treatments": list(treatments.values()),
        "families": families,
        "metadata": {
            "family_count": len(families),
            "offer_count": sum(len(family["offers"]) for family in families),
            "treatment_count": len(treatments),
            "skipped_pages": skipped_pages,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai um draft estruturado do catalogo Gamalab.")
    parser.add_argument("--pdf", default="Gamalab_TabelaPrecos2022_Custo.pdf", help="Caminho do PDF de entrada.")
    parser.add_argument("--output", default="tmp/gamalab_catalog_draft.json", help="Caminho do JSON de saida.")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise SystemExit(f"PDF nao encontrado: {pdf_path}")

    payload = parse_gamalab_catalog(pdf_path)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    metadata = payload["metadata"]
    print(
        f"Draft gerado em {output_path} | familias={metadata['family_count']} "
        f"ofertas={metadata['offer_count']} tratamentos={metadata['treatment_count']}"
    )


if __name__ == "__main__":
    main()
