import json
from pathlib import Path


PRICE_MATRIX = Path("tmp/vision_charles_price_matrix.json")
HAYTECK_PROFILES = Path("tmp/hayteck_profiles_2025_09.json")
OUTPUT = Path("tmp/vision_hayteck_name_map_draft.json")


def norm(s: str) -> str:
    return (s or "").strip()


def suggest_hayteck(vision_name: str, hay_models: list[str]):
    v = vision_name.lower()
    # heuristic suggestions only; user should confirm
    if "premium" in v:
        for m in hay_models:
            if m.lower() == "haytek pro id":
                return m
    if "extensee" in v:
        # often "extended" / entry-level; suggest Go!
        for m in hay_models:
            if m.lower().startswith("haytek go"):
                return m
    if "individual" in v:
        # suggests personalization; pro id or top
        for target in ["Haytek Pro ID", "Haytek Top", "Haytek Smart"]:
            for m in hay_models:
                if m.lower() == target.lower():
                    return m
    if "basic" in v or "lite" in v:
        for target in ["Haytek Go!", "Haytek Light"]:
            for m in hay_models:
                if m.lower().startswith(target.lower().replace("!", "")) or m.lower() == target.lower():
                    return m
    if "4k" in v:
        for target in ["Haytek Top", "Haytek Smart", "Haytek Light"]:
            for m in hay_models:
                if m.lower() == target.lower():
                    return m
    if v == "vision plus":
        for target in ["Haytek Smart", "Haytek Light", "Haytek Go!"]:
            for m in hay_models:
                if m.lower() == target.lower():
                    return m
    return None


def main():
    if not PRICE_MATRIX.exists():
        raise SystemExit(f"Arquivo não encontrado: {PRICE_MATRIX}")
    if not HAYTECK_PROFILES.exists():
        raise SystemExit(f"Arquivo não encontrado: {HAYTECK_PROFILES}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    price = json.loads(PRICE_MATRIX.read_text(encoding="utf-8"))
    prof = json.loads(HAYTECK_PROFILES.read_text(encoding="utf-8"))

    vision_products = sorted(set(norm(p) for p in price.get("unique_products", []) if norm(p)))
    hay_models = prof.get("models", [])

    mapping = []
    for vp in vision_products:
        mapping.append(
            {
                "vision_family_name": vp,
                "hayteck_model": None,
                "suggested": suggest_hayteck(vp, hay_models),
                "notes": "Preencha hayteck_model com um dos modelos Haytek (ver lista models). Sugestoes sao heuristicas.",
            }
        )

    out = {
        "vision_products": vision_products,
        "hayteck_models": hay_models,
        "mapping": mapping,
    }

    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {OUTPUT} (vision_products={len(vision_products)}, hayteck_models={len(hay_models)})")


if __name__ == "__main__":
    main()

