import csv
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


INPUT_PATH = Path('.tabelas/essilor_ABRIL2026_COMPLETO__numeric_plus_rules_fixed.csv')
OUTPUT_PATH = Path('tmp/essilor_catalog_draft_2026.json')
PVC_PDF_PATH = Path('.tabelas/V2 - Tabela PVC ABRIL 26 WEB.pdf')
PVO_PDF_PATH = Path('.tabelas/V2 - Tabela PVO ABRIL 26.pdf')


def slugify(value: str) -> str:
    value = (value or '').strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-zA-Z0-9]+', '-', value).strip('-').lower()
    return value or 'sem-slug'


def parse_float(value: str | None):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(',', '.')
    try:
        return float(text)
    except ValueError:
        return None


def normalize_bool(value: str | None):
    text = (value or '').strip().lower()
    if text in ('sim', 's', 'yes', 'y', 'true'):
        return True
    if text in ('nao', 'não', 'n', 'no', 'false'):
        return False
    return None


def sha256_file(path: Path):
    if not path.exists():
        return 'unknown'
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def build_label(row: dict):
    parts = [
        row.get('produto'),
        row.get('design'),
        row.get('material'),
        row.get('indice_refracao'),
        row.get('tratamento'),
    ]
    label = ' '.join(p for p in parts if p)
    if normalize_bool(row.get('transitions')):
        cores = row.get('transitions_cores') or ''
        label = f"{label} Transitions {cores}".strip()
    if normalize_bool(row.get('blue_uv')):
        label = f"{label} Blue UV".strip()
    return label.strip() or 'Sem rotulo'


def build_features(row: dict, cost_price: float | None):
    features = {}
    if row.get('tratamento'):
        features['tratamento'] = row['tratamento']
    if row.get('treatment_group'):
        features['treatment_group'] = row['treatment_group']
    if row.get('treatment_application'):
        features['treatment_application'] = row['treatment_application']
    transitions = normalize_bool(row.get('transitions'))
    if transitions is not None:
        features['transitions'] = transitions
    if row.get('transitions_cores'):
        features['transitions_cores'] = row['transitions_cores']
    blue_uv = normalize_bool(row.get('blue_uv'))
    if blue_uv is not None:
        features['blue_uv'] = blue_uv
    if row.get('nota_disponibilidade'):
        features['row_notes'] = row['nota_disponibilidade']
    if cost_price is not None:
        features['cost_price'] = cost_price
    return features


def build_grid(row: dict):
    sph_min = parse_float(row.get('esferico_min'))
    sph_max = parse_float(row.get('esferico_max'))
    cyl_max = parse_float(row.get('cilindrico_max'))
    add_min = parse_float(row.get('adicao_min'))
    add_max = parse_float(row.get('adicao_max'))

    if sph_min is None and sph_max is None:
        return None

    return {
        'sph_min': sph_min,
        'sph_max': sph_max,
        'cyl_min': 0.0 if cyl_max is not None else None,
        'cyl_max': cyl_max,
        'add_min': add_min,
        'add_max': add_max,
        'metadata': {
            'raw_grade': ' / '.join(
                v for v in [row.get('esferico_min'), row.get('esferico_max'), row.get('cilindrico_max')] if v
            )
        },
    }


def load_rows():
    with INPUT_PATH.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)


def main():
    rows = load_rows()

    pvc_hash = sha256_file(PVC_PDF_PATH)
    pvo_hash = sha256_file(PVO_PDF_PATH)

    offers_map = {}
    family_pages = defaultdict(set)
    family_designs = defaultdict(set)

    for row in rows:
        key = (
            row.get('familia', ''),
            row.get('produto', ''),
            row.get('design', ''),
            row.get('material', ''),
            row.get('indice_refracao', ''),
            row.get('tratamento', ''),
            row.get('treatment_group', ''),
            row.get('treatment_application', ''),
            row.get('transitions', ''),
            row.get('transitions_cores', ''),
            row.get('blue_uv', ''),
            row.get('esferico_min', ''),
            row.get('esferico_max', ''),
            row.get('cilindrico_max', ''),
            row.get('adicao_min', ''),
            row.get('adicao_max', ''),
            row.get('preco_tipo', ''),
            row.get('nota_disponibilidade', ''),
        )

        record = offers_map.get(key)
        if record is None:
            record = {
                'row': row,
                'price_pvc': None,
                'price_pvo': None,
                'pages': set(),
            }
            offers_map[key] = record

        fonte = (row.get('fonte_tabela') or '').strip().upper()
        price = parse_float(row.get('preco_par_brl'))
        if fonte == 'PVC':
            record['price_pvc'] = price
        elif fonte == 'PVO':
            record['price_pvo'] = price

        page = row.get('pagina_pdf')
        if page:
            record['pages'].add(f"{fonte} p.{page}")
            family_pages[row.get('familia', '')].add(f"{fonte} p.{page}")
        if row.get('design'):
            family_designs[row.get('familia', '')].add(row.get('design'))

    families_map = defaultdict(list)

    for record in offers_map.values():
        row = record['row']
        base_price = record['price_pvc'] if record['price_pvc'] is not None else record['price_pvo']
        cost_price = record['price_pvo'] if record['price_pvo'] is not None else None

        label = build_label(row)
        grid = build_grid(row)
        indice = parse_float(row.get('indice_refracao'))

        offer = {
            'legacy_code': None,
            'raw_label': label,
            'canonical_label': label,
            'material': row.get('material') or None,
            'indice_refracao': indice,
            'is_atomic_offer': True,
            'allows_composition': False,
            'already_includes_treatment': True,
            'features': build_features(row, cost_price),
            'base_price': base_price,
            'source_page_reference': '; '.join(sorted(record['pages'])) or None,
            'confidence_level': 0.85,
            'diopter_grids': [grid] if grid else [],
            'compatible_treatments': [],
            '_price_map': None,
        }
        families_map[row.get('familia', 'Sem Familia')].append(offer)

    families = []
    for family_name, offers in families_map.items():
        designs = sorted(d for d in family_designs.get(family_name, set()) if d)
        family_design = designs[0] if len(designs) == 1 else None
        page_ref = '; '.join(sorted(family_pages.get(family_name, set()))) or None
        families.append({
            'slug': slugify(family_name),
            'name': family_name,
            'design': family_design,
            'description_marketing': None,
            'usage_tags': [],
            'benefit_tags': [],
            'source_page_reference': page_ref,
            'offers': offers,
        })

    draft = {
        'catalog_version': {
            'laboratorio': 'Essilor',
            'versao': 'Essilor Abril 2026',
            'status': 'draft',
            'source_kind': 'csv',
            'notes': (
                'Tabela combinada PVC/PVO (venda e custo). '
                f'PVC hash: {pvc_hash}. PVO hash: {pvo_hash}. '
                'Kodak incorporado como familia Essilor.'
            ),
        },
        'source_document': {
            'document_name': f"{PVC_PDF_PATH.name} + {PVO_PDF_PATH.name}",
            'source_path': f"{str(PVC_PDF_PATH).replace('/', '\\\\')} + {str(PVO_PDF_PATH).replace('/', '\\\\')}",
            'document_hash': pvc_hash,
            'extraction_engine': 'csv',
            'extracted_text': '',
            'pages': [],
        },
        'treatments': [],
        'families': sorted(families, key=lambda item: item['name']),
    }

    OUTPUT_PATH.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Draft salvo em {OUTPUT_PATH}")
    print(f"Familias: {len(families)} | Ofertas: {sum(len(f['offers']) for f in families)}")


if __name__ == '__main__':
    main()
