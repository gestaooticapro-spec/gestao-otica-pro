import json
import re
from pathlib import Path


INPUT_PATH = Path('.tabelas/pesquisa_tratamento_essilor_kodak.json')
OUTPUT_PATH = Path('.tabelas/pesquisa_tratamento_essilor_kodak_insert_ready.json')


def fix_mojibake(text: str) -> str:
    try:
        return text.encode('latin1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def clean_url(value: str) -> str:
    if not value:
        return value
    markdown = re.search(r'\[([^\]]+)\]\(([^)]+)\)', value)
    if markdown:
        return markdown.group(2)
    match = re.search(r'(https?://[^)\s]+)', value)
    return match.group(1) if match else value


def normalize_quotes(quotes):
    if not quotes:
        return []
    normalized = []
    for item in quotes:
        if isinstance(item, dict):
            kind = item.get('type') or item.get('kind') or ''
            text = item.get('text') or ''
            text = text.strip()
            if kind:
                normalized.append(f"{kind}: {text}".strip())
            elif text:
                normalized.append(text)
        elif isinstance(item, str):
            normalized.append(item.strip())
    return [q for q in normalized if q]


def normalize_string(value):
    if isinstance(value, str):
        return fix_mojibake(value)
    return value


def normalize_entry(entry: dict) -> dict:
    cleaned = {}
    allowed_keys = {
        'entity_name',
        'entity_type',
        'manufacturer_or_brand',
        'category',
        'recommended_for',
        'not_ideal_for',
        'positioning',
        'benefit_tags',
        'usage_tags',
        'technology_tags',
        'material_tags',
        'commercial_summary',
        'recommendation_notes',
        'evidence_level',
        'evidence_type',
        'source_quotes_or_points',
        'source_urls',
    }

    for key in allowed_keys:
        if key in entry:
            cleaned[key] = entry[key]

    # Normalize fields
    cleaned['entity_name'] = normalize_string(cleaned.get('entity_name', '')).strip()
    cleaned['entity_type'] = normalize_string(cleaned.get('entity_type', '')).strip().lower()
    cleaned['manufacturer_or_brand'] = normalize_string(cleaned.get('manufacturer_or_brand'))
    cleaned['category'] = normalize_string(cleaned.get('category'))
    cleaned['commercial_summary'] = normalize_string(cleaned.get('commercial_summary'))
    cleaned['recommendation_notes'] = normalize_string(cleaned.get('recommendation_notes'))

    # Normalize arrays
    for key in ['recommended_for', 'not_ideal_for', 'benefit_tags', 'usage_tags', 'technology_tags', 'material_tags']:
        values = cleaned.get(key) or []
        cleaned[key] = [normalize_string(v).strip() for v in values if isinstance(v, str) and v.strip()]

    # Normalize evidence / quotes / urls
    cleaned['source_quotes_or_points'] = normalize_quotes(cleaned.get('source_quotes_or_points') or [])
    cleaned['source_urls'] = [clean_url(normalize_string(u)).strip() for u in (cleaned.get('source_urls') or []) if u]

    # Map technology/subfamily to treatment or family for insertion
    if cleaned['entity_type'] == 'technology':
        cleaned['entity_type'] = 'treatment'
    if cleaned['entity_type'] == 'subfamily':
        cleaned['entity_type'] = 'family'

    return cleaned


def main():
    raw = json.loads(INPUT_PATH.read_text(encoding='utf-8'))
    cleaned = [normalize_entry(entry) for entry in raw]
    OUTPUT_PATH.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Salvo: {OUTPUT_PATH} ({len(cleaned)} entradas)")


if __name__ == '__main__':
    main()
