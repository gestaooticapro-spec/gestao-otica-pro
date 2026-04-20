import json
import re
from pathlib import Path

import pdfplumber


INPUT = Path(".tabelas/tabela hayteck 09-2025.pdf")
OUTPUT = Path("tmp/hayteck_profiles_2025_09.json")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def to_float(s: str):
    try:
        return float(s.replace(",", "."))
    except Exception:
        return None


def parse_range(text: str):
    # Supports "+6.00 a -6.00" or "-8.75 a -10.00"
    m = re.search(r"([+-]?\d+(?:\.\d+)?)\s*a\s*([+-]?\d+(?:\.\d+)?)", text)
    if not m:
        return None
    a = to_float(m.group(1))
    b = to_float(m.group(2))
    if a is None or b is None:
        return None
    return [min(a, b), max(a, b)]


def merge_ranges(ranges):
    mins = [r[0] for r in ranges if r]
    maxs = [r[1] for r in ranges if r]
    if not mins and not maxs:
        return None
    return [min(mins), max(maxs)]


def infer_category(page_text: str):
    t = page_text.lower()
    if "lentes progressivas" in t:
        return "multifocal"
    if "lentes ocupacionais" in t:
        return "ocupacional"
    if "lentes visão simples" in t or "lentes visao simples" in t:
        return "visao_simples"
    return "indefinida"


def extract_model_name(lines):
    # Typical header: "Haytek Pro ID Corredores: ..."
    for line in lines[:12]:
        if not line.lower().startswith("haytek"):
            continue
        # ignore lines that are obviously not model names
        if "esf." in line.lower() or "cil." in line.lower() or "add." in line.lower():
            continue
        # take "Haytek X" up to "Corredores" / "Alt." / end
        cut = re.split(r"\b(Corredores:|Alt\. mín\.|Alt\. min\.|Alt\. mín\.|Alt\.)\b", line, maxsplit=1)[0]
        name = norm(cut)
        if len(name.split()) >= 2:
            return name
    return None


def extract_profile_from_text(page_number: int, text: str):
    lines = [norm(l) for l in (text or "").splitlines() if norm(l)]
    model = extract_model_name(lines)
    if not model:
        return None

    category = infer_category(text)

    # Altura mínima: "Alt. mín. 16mm" or "Alt. mín. 20mm"
    mh = None
    mm = re.search(r"Alt\.\s*m[ií]n\.\s*(\d+)\s*mm", text, re.IGNORECASE)
    if mm:
        mh = int(mm.group(1))

    # Cyl: "Cil. até -6.00" (store as [-6,0])
    cyl_min = None
    cm = re.search(r"Cil\.\s*at[eé]\s*([+-]?\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if cm:
        cyl_min = to_float(cm.group(1))

    # Add: "Add. 0.75 a 3.50"
    add = None
    am = re.search(r"Add\.\s*([+-]?\d+(?:\.\d+)?)\s*a\s*([+-]?\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if am:
        add = [to_float(am.group(1)), to_float(am.group(2))]

    # Diameter: "Diâm. 80mm"
    diam = None
    dm = re.search(r"Di[âa]m\.\s*(\d+)\s*mm", text, re.IGNORECASE)
    if dm:
        diam = f"{dm.group(1)}mm"

    # Per index sph ranges (may appear multiple times per index; we merge)
    sph_by_index = {}
    # Example tokens: "1.56", "1.59", "1.61", "1.67", "1.50"
    for m in re.finditer(r"\b(1\.\d{2})\b.*?Esf\.\s*([+-]?\d+\.\d+)\s*a\s*([+-]?\d+\.\d+)", text):
        idx = m.group(1)
        r = parse_range(f"{m.group(2)} a {m.group(3)}")
        if not r:
            continue
        sph_by_index.setdefault(idx, {"segments": []})["segments"].append(r)

    for idx, payload in sph_by_index.items():
        merged = merge_ranges(payload["segments"])
        payload["sph_min"] = merged[0] if merged else None
        payload["sph_max"] = merged[1] if merged else None

    return {
        "page": page_number,
        "model": model,
        "clinical_category": category,
        "min_fitting_height": mh,
        "cyl_min": cyl_min,
        "add": add,
        "diameter": diam,
        "sph_by_index": sph_by_index,
        "raw_text_excerpt": "\n".join(lines[:18]),
    }


def main():
    if not INPUT.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    profiles = []
    with pdfplumber.open(str(INPUT)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            prof = extract_profile_from_text(i, text)
            if prof:
                profiles.append(prof)

    # Deduplicate by model name (keep the first, but attach pages if repeated)
    by_model = {}
    for p in profiles:
        key = p["model"]
        if key not in by_model:
            by_model[key] = p
            by_model[key]["pages"] = [p["page"]]
        else:
            by_model[key]["pages"].append(p["page"])

    out = {
        "source": str(INPUT),
        "models": sorted(by_model.keys()),
        "profiles": list(by_model.values()),
    }

    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {OUTPUT} (models={len(out['models'])})")


if __name__ == "__main__":
    main()

