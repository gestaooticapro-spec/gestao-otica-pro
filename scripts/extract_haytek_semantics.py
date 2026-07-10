import copy
import json
import re
from pathlib import Path

import pdfplumber


PDF_PATH = Path(".tabelas/tabela haytek 09-2025.pdf")
PHOTOS_DIR = Path(".tabelas/haytek_pvc_imgs")
OUT_JSON = Path("tmp/haytek_semantics_2025_09.json")
OUT_MD = Path("tmp/haytek_semantics_2025_09.md")

PRICE_COLUMNS = [
    "Antirrisco",
    "AR Verde",
    "AR Azul",
    "AR Premium Verde",
    "AR Premium Azul",
]

PRICE_MODEL = {
    "mode": "final_by_lens_variant_and_ar",
    "description": "Cada celula de preco representa o preco final da combinacao lente/variante embutida + tratamento da coluna.",
    "embedded_variant_examples": ["Incolor", "Filtro Azul", "Foto Haytek", "Filtro Azul Foto Haytek"],
    "ar_columns": PRICE_COLUMNS,
}

MATERIAL_MODEL = {
    "index_field": "indice_refracao",
    "material_field": "material",
    "variant_field": "variant",
    "rules": [
        {
            "source_label": "Poli",
            "normalized_material": "POLI",
            "normalized_variant_when_alone": "Incolor",
            "notes": "Poli e material, nao variante comercial. Quando combinado com Filtro Azul/Foto Haytek, manter esses termos em variant.",
        }
    ],
}

PAGE3_PRO_TOP_GRIDS = [
    {
        "index": "1.56",
        "sph_min": -6.0,
        "sph_max": 6.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -6.0, "sph_max": 6.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page3_manual"],
    },
    {
        "index": "1.59",
        "sph_min": -8.0,
        "sph_max": 6.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -8.0, "sph_max": 6.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page3_manual"],
    },
    {
        "index": "1.61",
        "sph_min": -8.0,
        "sph_max": 7.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [
            {"sph_min": -6.0, "sph_max": 7.0, "cyl_min": -6.0, "cyl_max": 0},
            {"sph_min": -8.0, "sph_max": -6.25, "cyl_min": -4.0, "cyl_max": 0},
        ],
        "labels_seen": ["page3_manual"],
    },
    {
        "index": "1.67",
        "sph_min": -10.0,
        "sph_max": 8.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [
            {"sph_min": -8.5, "sph_max": 8.0, "cyl_min": -6.0, "cyl_max": 0},
            {"sph_min": -10.0, "sph_max": -8.75, "cyl_min": -4.0, "cyl_max": 0},
        ],
        "labels_seen": ["page3_manual"],
    },
    {
        "index": "1.74",
        "sph_min": -14.0,
        "sph_max": 14.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [
            {"sph_min": -13.0, "sph_max": 14.0, "cyl_min": -6.0, "cyl_max": 0},
            {"sph_min": -14.0, "sph_max": -13.25, "cyl_min": -4.0, "cyl_max": 0},
        ],
        "labels_seen": ["page3_manual"],
    },
]

PAGE4_SMART_GRIDS = copy.deepcopy(PAGE3_PRO_TOP_GRIDS)
for grid in PAGE4_SMART_GRIDS:
    grid["labels_seen"] = ["page4_manual"]

PAGE4_LIGHT_GRIDS = [
    {
        "index": "1.56",
        "sph_min": -6.0,
        "sph_max": 6.0,
        "cyl_min": -4.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -6.0, "sph_max": 6.0, "cyl_min": -4.0, "cyl_max": 0}],
        "labels_seen": ["page4_manual"],
    },
    {
        "index": "1.59",
        "sph_min": -6.0,
        "sph_max": 6.0,
        "cyl_min": -4.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -6.0, "sph_max": 6.0, "cyl_min": -4.0, "cyl_max": 0}],
        "labels_seen": ["page4_manual"],
    },
    {
        "index": "1.61",
        "sph_min": -6.0,
        "sph_max": 6.0,
        "cyl_min": -4.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -6.0, "sph_max": 6.0, "cyl_min": -4.0, "cyl_max": 0}],
        "labels_seen": ["page4_manual"],
    },
    {
        "index": "1.67",
        "sph_min": -10.0,
        "sph_max": 6.0,
        "cyl_min": -4.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -10.0, "sph_max": 6.0, "cyl_min": -4.0, "cyl_max": 0}],
        "labels_seen": ["page4_manual"],
    },
    {
        "index": "1.74",
        "sph_min": -12.0,
        "sph_max": 8.0,
        "cyl_min": -4.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -12.0, "sph_max": 8.0, "cyl_min": -4.0, "cyl_max": 0}],
        "labels_seen": ["page4_manual"],
    },
]

PAGE5_GO_GRIDS = copy.deepcopy(PAGE4_LIGHT_GRIDS)
for grid in PAGE5_GO_GRIDS:
    grid["labels_seen"] = ["page5_manual"]

PAGE6_OCCUPATIONAL_GRIDS = copy.deepcopy(PAGE3_PRO_TOP_GRIDS)
for grid in PAGE6_OCCUPATIONAL_GRIDS:
    grid["labels_seen"] = ["page6_manual"]

PAGE7_EASY_GRIDS = [
    {
        "index": "1.56",
        "sph_min": -6.0,
        "sph_max": 8.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -6.0, "sph_max": 8.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page7_manual"],
    },
    {
        "index": "1.59",
        "sph_min": -8.0,
        "sph_max": 9.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -8.0, "sph_max": 9.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page7_manual"],
    },
    {
        "index": "1.61",
        "sph_min": -8.0,
        "sph_max": 9.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [
            {"sph_min": -6.0, "sph_max": 9.0, "cyl_min": -6.0, "cyl_max": 0},
            {"sph_min": -8.0, "sph_max": -6.25, "cyl_min": -4.0, "cyl_max": 0},
        ],
        "labels_seen": ["page7_manual"],
    },
    {
        "index": "1.67",
        "sph_min": -10.0,
        "sph_max": 10.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [
            {"sph_min": -8.5, "sph_max": 10.0, "cyl_min": -6.0, "cyl_max": 0},
            {"sph_min": -10.0, "sph_max": -8.75, "cyl_min": -4.0, "cyl_max": 0},
        ],
        "labels_seen": ["page7_manual"],
    },
    {
        "index": "1.74",
        "sph_min": -14.0,
        "sph_max": 14.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [
            {"sph_min": -13.0, "sph_max": 14.0, "cyl_min": -6.0, "cyl_max": 0},
            {"sph_min": -14.0, "sph_max": -13.25, "cyl_min": -4.0, "cyl_max": 0},
        ],
        "labels_seen": ["page7_manual"],
    },
]

PAGE8_VISION_SIMPLE_GRIDS = [
    {
        "index": "1.56",
        "sph_min": -10.0,
        "sph_max": 10.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -10.0, "sph_max": 10.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page8_manual"],
    },
    {
        "index": "1.59",
        "sph_min": -12.0,
        "sph_max": 11.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -12.0, "sph_max": 11.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page8_manual"],
    },
    {
        "index": "1.61",
        "sph_min": -11.0,
        "sph_max": 11.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -11.0, "sph_max": 11.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page8_manual"],
    },
    {
        "index": "1.67",
        "sph_min": -13.0,
        "sph_max": 12.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -13.0, "sph_max": 12.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page8_manual"],
    },
    {
        "index": "1.74",
        "sph_min": -16.0,
        "sph_max": 15.0,
        "cyl_min": -6.0,
        "cyl_max": 0,
        "availability_segments": [{"sph_min": -16.0, "sph_max": 15.0, "cyl_min": -6.0, "cyl_max": 0}],
        "labels_seen": ["page8_manual"],
    },
]


FAMILY_DEFINITIONS = [
    {
        "name": "Haytek Pro ID",
        "pages": [3, 9],
        "category": "multifocal",
        "design": "Progressiva Freeform individualizada topo de linha",
        "tier": "premium_plus",
        "summary": "Progressiva de maior personalizacao e desempenho da linha Haytek, com foco em campos amplos, menor distorcao periferica e precisao em rotina dinamica.",
        "usage_tags": ["multifocal", "uso_diario", "alta_exigencia", "personalizacao"],
        "benefit_tags": ["campo_amplo", "menor_distorcao", "alta_precisao", "adaptacao_refinada"],
        "technical_overrides": {"corridors": [14, 15, 16, 17, 18], "min_fitting_height": 16, "add_range": [0.75, 3.5], "grids_by_index": PAGE3_PRO_TOP_GRIDS},
    },
    {
        "name": "Haytek Top",
        "pages": [3, 9],
        "category": "multifocal",
        "design": "Progressiva Freeform de alta tecnologia",
        "tier": "premium",
        "summary": "Progressiva premium com alta definicao, nitidez e bom equilibrio entre campos, posicionada logo abaixo da Pro ID.",
        "usage_tags": ["multifocal", "uso_diario", "alta_exigencia"],
        "benefit_tags": ["nitidez", "campo_amplo", "conforto_visual"],
        "technical_overrides": {"corridors": [14, 15, 16, 17, 18], "min_fitting_height": 16, "add_range": [0.75, 3.5], "grids_by_index": PAGE3_PRO_TOP_GRIDS},
    },
    {
        "name": "Haytek Smart",
        "pages": [4, 9],
        "category": "multifocal",
        "design": "Progressiva Freeform personalizada",
        "tier": "intermediario_premium",
        "summary": "Progressiva com foco em versatilidade e bom custo-beneficio dentro das lentes personalizadas.",
        "usage_tags": ["multifocal", "uso_diario", "versatilidade"],
        "benefit_tags": ["conforto", "custo_beneficio", "adaptacao_suave"],
        "technical_overrides": {"corridors": [14, 16, 18], "min_fitting_height": 16, "add_range": [0.75, 3.5], "grids_by_index": PAGE4_SMART_GRIDS},
    },
    {
        "name": "Haytek Light",
        "pages": [4, 9],
        "category": "multifocal",
        "design": "Progressiva Freeform equilibrada",
        "tier": "intermediario",
        "summary": "Progressiva de equilibrio entre campos, nitidez e preco, boa para rotina geral.",
        "usage_tags": ["multifocal", "uso_diario", "rotina_geral"],
        "benefit_tags": ["equilibrio_campos", "nitidez", "custo_beneficio"],
        "technical_overrides": {"corridors": [14, 18], "min_fitting_height": 16, "add_range": [0.75, 3.5], "grids_by_index": PAGE4_LIGHT_GRIDS},
    },
    {
        "name": "Haytek Go!",
        "pages": [5, 9],
        "category": "multifocal",
        "design": "Progressiva Freeform de entrada",
        "tier": "economico",
        "summary": "Progressiva de entrada com facil adaptacao e preco acessivel, indicada para primeiro multifocal ou orcamento mais controlado.",
        "usage_tags": ["multifocal", "primeira_multifocal", "rotina_geral"],
        "benefit_tags": ["facil_adaptacao", "preco_acessivel", "custo_beneficio"],
        "technical_overrides": {"corridors": [14, 18], "min_fitting_height": 16, "add_range": [0.75, 3.5], "grids_by_index": PAGE5_GO_GRIDS},
    },
    {
        "name": "Haytek Drive",
        "pages": [6, 9],
        "category": "ocupacional",
        "design": "Ocupacional Freeform",
        "tier": "intermediario_premium",
        "summary": "Lente ocupacional voltada para distancia intermediaria e perto, com proposta de conforto para tarefas especificas e direcao/rotina funcional.",
        "usage_tags": ["ocupacional", "perto_intermediario", "dirigir"],
        "benefit_tags": ["conforto_intermediario", "ergonomia_visual"],
        "technical_overrides": {"min_fitting_height": 20, "add_range": [0.75, 3.5], "grids_by_index": PAGE6_OCCUPATIONAL_GRIDS},
    },
    {
        "name": "Haytek Office",
        "pages": [6, 9],
        "category": "ocupacional",
        "design": "Ocupacional Freeform para escritorio",
        "tier": "intermediario",
        "summary": "Lente ocupacional para escritorio, telas, leitura e tarefas de perto/intermediario.",
        "usage_tags": ["ocupacional", "uso_telas", "leitura", "escritorio"],
        "benefit_tags": ["conforto_visual_telas", "ergonomia_visual", "campo_intermediario"],
        "technical_overrides": {"min_fitting_height": 20, "add_range": [0.75, 3.5], "grids_by_index": PAGE6_OCCUPATIONAL_GRIDS},
    },
    {
        "name": "Haytek Easy",
        "pages": [7, 9],
        "category": "visao_simples",
        "design": "Visao simples especial Freeform com apoio acomodativo",
        "tier": "intermediario",
        "summary": "Lente de visao simples especial com baixa adicao para reduzir esforco ocular em telas, leitura e fadiga visual, sem limitar o uso geral como uma ocupacional tradicional.",
        "usage_tags": ["visao_simples", "uso_telas", "leitura", "fadiga_visual", "uso_digital"],
        "benefit_tags": ["apoio_visual", "ergonomia_visual", "foco_inteligente", "conforto_visual_telas"],
        "technical_overrides": {"min_fitting_height": 16, "add_range": [0.5, 1.25], "grids_by_index": PAGE7_EASY_GRIDS},
    },
    {
        "name": "Haytek Visao Simples ID",
        "pages": [8, 9],
        "category": "visao_simples",
        "design": "Visao simples Freeform individualizada",
        "tier": "premium",
        "summary": "Visao simples freeform com personalizacao/ID, indicada para alta exigencia em monofocal.",
        "usage_tags": ["visao_simples", "uso_diario", "alta_exigencia"],
        "benefit_tags": ["precisao", "campo_amplo", "personalizacao"],
        "technical_overrides": {"add_range": None, "grids_by_index": PAGE8_VISION_SIMPLE_GRIDS},
    },
    {
        "name": "Haytek Visao Simples",
        "pages": [8, 9],
        "category": "visao_simples",
        "design": "Visao simples Freeform",
        "tier": "intermediario",
        "summary": "Visao simples freeform para rotina geral, com boa cobertura de indices e tratamentos.",
        "usage_tags": ["visao_simples", "uso_diario"],
        "benefit_tags": ["nitidez", "conforto_visual"],
        "technical_overrides": {"add_range": None, "grids_by_index": PAGE8_VISION_SIMPLE_GRIDS},
    },
    {
        "name": "Haytek VS Freeform",
        "pages": [9],
        "category": "visao_simples",
        "design": "Visao simples Freeform com Transitions Gen S",
        "tier": "intermediario",
        "summary": "Nomenclatura usada na pagina de Transitions Gen S para a linha visao simples freeform.",
        "usage_tags": ["visao_simples", "fotossensivel"],
        "benefit_tags": ["nitidez", "adaptacao_luz"],
        "technical_overrides": {"add_range": None},
    },
    {
        "name": "Haytek Visao Simples Acabadas",
        "pages": [11],
        "category": "visao_simples",
        "design": "Visao simples acabada",
        "tier": "economico",
        "summary": "Lentes prontas/acabadas de visao simples, com menor prazo e combinacoes predefinidas.",
        "usage_tags": ["visao_simples", "pronta_entrega"],
        "benefit_tags": ["rapidez", "preco_acessivel"],
        "technical_overrides": {"add_range": None},
    },
    {
        "name": "Haytek Progressivas Acabadas",
        "pages": [11],
        "category": "multifocal",
        "design": "Progressiva acabada",
        "tier": "economico",
        "summary": "Progressiva acabada/pronta para casos dentro da faixa disponivel, com foco em prazo e custo.",
        "usage_tags": ["multifocal", "pronta_entrega"],
        "benefit_tags": ["rapidez", "preco_acessivel"],
        "technical_overrides": {"add_range": [1.0, 3.5]},
    },
]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def to_float(text: str):
    if text is None:
        return None
    try:
        return float(str(text).replace(",", "."))
    except ValueError:
        return None


def parse_range(text: str):
    m = re.search(r"([+-]?\d+(?:\.\d+)?)\s*a\s*([+-]?\d+(?:\.\d+)?)", text or "")
    if not m:
        return None
    left = to_float(m.group(1))
    right = to_float(m.group(2))
    if left is None or right is None:
        return None
    return [min(left, right), max(left, right)]


def page_photo(page: int):
    candidate = PHOTOS_DIR / f"pag {page}.jpeg"
    return str(candidate).replace("\\", "/") if candidate.exists() else None


def extract_page_texts():
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        return {
            index: page.extract_text() or ""
            for index, page in enumerate(pdf.pages, start=1)
        }


def section_for_family(page_text: str, family_name: str):
    aliases = [family_name]
    if family_name == "Haytek Visao Simples ID":
        aliases.append("Haytek Visão Simples ID")
    if family_name == "Haytek Visao Simples":
        aliases.append("Haytek Visão Simples")

    starts = []
    for alias in aliases:
        pos = page_text.find(alias)
        if pos >= 0:
            starts.append(pos)
    if not starts:
        return ""

    start = min(starts)
    next_positions = []
    for family in FAMILY_DEFINITIONS:
        if family["name"] == family_name:
            continue
        for alias in {family["name"], family["name"].replace("Visao", "Visão")}:
            pos = page_text.find(alias, start + 1)
            if pos > start:
                next_positions.append(pos)

    end = min(next_positions) if next_positions else len(page_text)
    return page_text[start:end]


def extract_corridors(section_text: str):
    m = re.search(r"Corredores:\s*([0-9\s]+)", section_text)
    if not m:
        return []
    return [int(token) for token in re.findall(r"\d+", m.group(1))]


def extract_min_fitting_height(section_text: str):
    m = re.search(r"Alt\.\s*m[ií]n\.\s*(\d+)\s*mm", section_text, re.IGNORECASE)
    return int(m.group(1)) if m else None


def extract_add_range(section_text: str):
    m = re.search(r"Add\.\s*([+-]?\d+(?:\.\d+)?)\s*a\s*([+-]?\d+(?:\.\d+)?)", section_text)
    if not m:
        return None
    return [to_float(m.group(1)), to_float(m.group(2))]


def extract_diameter(section_text: str):
    values = sorted(set(re.findall(r"Di[âa]m\.\s*(\d+)\s*mm", section_text, re.IGNORECASE)))
    if not values:
        return None
    return "/".join(f"{value}mm" for value in values)


def extract_grids(section_text: str):
    grids = {}
    pattern = re.compile(
        r"\b(1\.\d{2})\b(?P<label>.{0,80}?)Esf\.\s*([+-]?\d+\.\d+)\s*a\s*([+-]?\d+\.\d+)\s*\|\s*Cil\.\s*(?:at[ée]\s*)?([+-]?\d+(?:\.\d+)?)",
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(section_text):
        index = match.group(1)
        label = norm(match.group("label"))
        sph = parse_range(f"{match.group(3)} a {match.group(4)}")
        cyl_min = to_float(match.group(5))
        if not sph:
            continue
        current = grids.setdefault(
            index,
            {
                "index": index,
                "sph_segments": [],
                "cyl_segments": [],
                "availability_segments": [],
                "labels_seen": [],
            },
        )
        current["sph_segments"].append(sph)
        if cyl_min is not None:
            cyl_segment = [min(cyl_min, 0), max(cyl_min, 0)]
            current["cyl_segments"].append(cyl_segment)
            current["availability_segments"].append(
                {
                    "sph_min": sph[0],
                    "sph_max": sph[1],
                    "cyl_min": cyl_segment[0],
                    "cyl_max": cyl_segment[1],
                }
            )
        if label and label not in current["labels_seen"]:
            current["labels_seen"].append(label)

    normalized = []
    for payload in grids.values():
        sph_min = min(segment[0] for segment in payload["sph_segments"])
        sph_max = max(segment[1] for segment in payload["sph_segments"])
        cyl_min = min(segment[0] for segment in payload["cyl_segments"]) if payload["cyl_segments"] else None
        cyl_max = max(segment[1] for segment in payload["cyl_segments"]) if payload["cyl_segments"] else None
        normalized.append(
            {
                "index": payload["index"],
                "sph_min": sph_min,
                "sph_max": sph_max,
                "cyl_min": cyl_min,
                "cyl_max": cyl_max,
                "availability_segments": payload["availability_segments"],
                "labels_seen": payload["labels_seen"],
            }
        )
    return sorted(normalized, key=lambda row: float(row["index"]))


def build_family_record(family, page_texts):
    sections = []
    for page in family["pages"]:
        text = page_texts.get(page, "")
        section = section_for_family(text, family["name"]) or text
        sections.append(section)
    joined = "\n".join(sections)

    overrides = family.get("technical_overrides", {})
    corridors = overrides.get("corridors", extract_corridors(joined))
    min_fitting_height = overrides.get("min_fitting_height", extract_min_fitting_height(joined))
    add_range = overrides["add_range"] if "add_range" in overrides else extract_add_range(joined)

    return {
        "name": family["name"],
        "clinical_category": family["category"],
        "design": family["design"],
        "commercial_tier": family["tier"],
        "commercial_summary": family["summary"],
        "usage_tags": family["usage_tags"],
        "benefit_tags": family["benefit_tags"],
        "needs_review": bool(family.get("needs_review")),
        "source_pages": family["pages"],
        "source_photos": [page_photo(page) for page in family["pages"] if page_photo(page)],
        "technical": {
            "corridors": corridors,
            "corridors_meaning": "Opcoes de corredor/canal progressivo disponiveis para o desenho da familia.",
            "min_fitting_height": min_fitting_height,
            "min_fitting_height_meaning": "Altura minima de montagem da familia em milimetros.",
            "add_range": add_range,
            "diameter": extract_diameter(joined),
            "grids_by_index": overrides.get("grids_by_index", extract_grids(joined)),
            "grid_meaning": "A coluna Disponibilidade da tabela informa faixa esferica, cilindrico, adicao quando aplicavel e diametro.",
        },
    }


def build_treatments():
    return [
        {
            "name": "Antirrisco",
            "type": "tratamento_base",
            "features": {"antirrisco": True},
            "summary": "Protecao contra pequenos riscos e arranhoes.",
        },
        {
            "name": "AR Verde",
            "type": "antirreflexo",
            "features": {"antirreflexo": True, "reflexo_verde": True},
            "summary": "Tratamento antirreflexo com reflexo verde.",
        },
        {
            "name": "AR Azul",
            "type": "antirreflexo",
            "features": {"antirreflexo": True, "reflexo_azul": True},
            "summary": "Tratamento antirreflexo com reflexo azul.",
        },
        {
            "name": "AR Premium Verde",
            "type": "antirreflexo_premium",
            "features": {
                "antirreflexo": True,
                "premium": True,
                "super_hidrofobico": True,
                "oleofobico": True,
                "antiestatico": True,
                "reflexo_verde": True,
            },
            "summary": "AR Premium com reducao de reflexos, repelencia a agua/oleos, efeito antiestatico e antirrisco.",
        },
        {
            "name": "AR Premium Azul",
            "type": "antirreflexo_premium",
            "features": {
                "antirreflexo": True,
                "premium": True,
                "super_hidrofobico": True,
                "oleofobico": True,
                "antiestatico": True,
                "reflexo_azul": True,
            },
            "summary": "AR Premium com reflexo azul e os mesmos beneficios de limpeza, durabilidade e reducao de reflexos.",
        },
        {
            "name": "Filtro Azul",
            "type": "filtro_luz_azul",
            "features": {"blue_control": True, "uso_telas": True},
            "summary": "Filtro para luz azul-violeta nociva, voltado a reducao de fadiga visual e protecao ocular.",
        },
        {
            "name": "Foto Haytek",
            "type": "fotossensivel",
            "features": {"fotossensivel": True},
            "summary": "Tratamento fotossensivel Haytek.",
        },
        {
            "name": "Transitions Gen S",
            "type": "fotossensivel",
            "features": {"fotossensivel": True, "transitions": True},
            "summary": "Fotossensivel Transitions Gen S, listado nas cores cinza e marrom.",
        },
        {
            "name": "Coloracao e protecoes",
            "type": "coloracao",
            "features": {"solar": True, "coloracao": True},
            "summary": "Coloracao total/degrade em cinza, marrom e verde, conforme pagina de protecoes.",
        },
    ]


def write_markdown(payload):
    lines = [
        "# Haytek 09/2025 - Semantica extraida",
        "",
        f"Fonte PDF: `{payload['source_pdf']}`",
        f"Fotos: `{payload['source_photos_dir']}`",
        "",
        "## Modelo de preco",
        "",
        f"- Modo: `{payload['price_model']['mode']}`",
        f"- Regra: {payload['price_model']['description']}",
        f"- Variantes embutidas no preco: {payload['price_model']['embedded_variant_examples']}",
        f"- Colunas de tratamento/preco final: {payload['price_model']['ar_columns']}",
        "",
        "## Modelo de material/variante",
        "",
        f"- Indice optico: `{payload['material_model']['index_field']}`",
        f"- Material: `{payload['material_model']['material_field']}`",
        f"- Variante comercial: `{payload['material_model']['variant_field']}`",
        "- Regra: `Poli` deve virar material `POLI`; a variante fica `Incolor`, `Filtro Azul`, `Foto Haytek` ou combinacoes comerciais equivalentes.",
        "",
        "## Significados tecnicos",
        "",
        "- Corredores: opcoes de corredor/canal progressivo disponiveis para o desenho da familia.",
        "- Altura minima: altura minima de montagem da familia em milimetros.",
        "- Grades: disponibilidade tecnica por indice, incluindo grau esferico, cilindrico, adicao quando aplicavel e diametro.",
        "",
        "## Familias",
        "",
    ]
    for family in payload["families"]:
        tech = family["technical"]
        grids = ", ".join(
            f"{grid['index']} esf {grid['sph_min']}..{grid['sph_max']} cil {grid['cyl_min']}..{grid['cyl_max']}"
            for grid in tech["grids_by_index"]
        ) or "sem grade extraida"
        segmented_grids = "; ".join(
            f"{grid['index']} "
            + " / ".join(
                f"esf {segment['sph_min']}..{segment['sph_max']} cil {segment['cyl_min']}..{segment['cyl_max']}"
                for segment in grid.get("availability_segments", [])
            )
            for grid in tech["grids_by_index"]
            if grid.get("availability_segments")
        ) or "sem segmentos extraidos"
        lines.extend(
            [
                f"### {family['name']}",
                f"- Categoria: `{family['clinical_category']}`",
                f"- Design: {family['design']}",
                f"- Tier: `{family['commercial_tier']}`",
                f"- Paginas: {family['source_pages']}",
                f"- Fotos: {family['source_photos'] or 'sem foto'}",
                f"- Altura minima: {tech['min_fitting_height']}",
                f"- Corredores: {tech['corridors']}",
                f"- Adicao: {tech['add_range']}",
                f"- Diametro: {tech['diameter']}",
                f"- Envelope da grade: {grids}",
                f"- Segmentos de disponibilidade: {segmented_grids}",
                f"- Resumo: {family['commercial_summary']}",
                "",
            ]
        )
    lines.extend(["## Tratamentos", ""])
    for treatment in payload["treatments"]:
        lines.append(f"- **{treatment['name']}**: {treatment['summary']}")
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")


def main():
    if not PDF_PATH.exists():
        raise SystemExit(f"Arquivo nao encontrado: {PDF_PATH}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    page_texts = extract_page_texts()
    payload = {
        "catalog_version": {
            "laboratorio": "Haytek",
            "versao": "Haytek Setembro 2025",
            "source_kind": "pdf+photos",
        },
        "source_pdf": str(PDF_PATH).replace("\\", "/"),
        "source_photos_dir": str(PHOTOS_DIR).replace("\\", "/"),
        "price_columns": PRICE_COLUMNS,
        "price_model": PRICE_MODEL,
        "material_model": MATERIAL_MODEL,
        "families": [build_family_record(family, page_texts) for family in FAMILY_DEFINITIONS],
        "treatments": build_treatments(),
        "page_roles": {
            "1": "capa/novidades",
            "2": "posicionamento progressivas",
            "3": "precos progressivas Pro ID e Top",
            "4": "precos progressivas Smart e Light",
            "5": "precos progressiva Go e notas tecnicas",
            "6": "precos ocupacionais Drive e Office",
            "7": "semantica filtro azul/apoio visual",
            "8": "precos visao simples freeform ID e VS",
            "9": "precos Transitions Gen S",
            "10": "semantica AR vs AR Premium",
            "11": "precos acabadas visao simples e progressivas",
            "12": "coloracao e protecoes",
        },
    }

    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(payload)
    print(f"Saved: {OUT_JSON} (families={len(payload['families'])}, treatments={len(payload['treatments'])})")
    print(f"Saved: {OUT_MD}")


if __name__ == "__main__":
    main()
