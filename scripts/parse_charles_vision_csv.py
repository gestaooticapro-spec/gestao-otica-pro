import csv
import json
from pathlib import Path


INPUT = Path(".tabelas/tabela tab charles.csv")
OUTPUT = Path("tmp/vision_charles_price_matrix.json")


def norm(s: str) -> str:
    return (s or "").strip()


def parse_price(value: str):
    v = norm(value)
    if not v:
        return None
    # CSV uses integers without decimals (e.g. 2790). Keep numeric.
    try:
        return float(v.replace(".", "").replace(",", "."))
    except Exception:
        return None


def parse_index(token: str):
    t = norm(token)
    if not t:
        return None
    tl = t.lower()
    if tl in ("poly", "poli", "policarbonato"):
        return 1.59
    # Common Brazilian notation with comma
    t = t.replace(",", ".")
    try:
        return float(t)
    except Exception:
        return None


def iter_sections(rows):
    i = 0
    while i < len(rows):
        row = rows[i]
        if not row:
            i += 1
            continue
        first = norm(row[0])
        if first.lower().startswith("vision"):
            header = row
            # Consume data rows until next header or end.
            data = []
            i += 1
            while i < len(rows):
                r = rows[i]
                if r and norm(r[0]).lower().startswith("vision"):
                    break
                if r and norm(r[0]):
                    data.append(r)
                i += 1
            yield header, data
            continue
        i += 1


def main():
    if not INPUT.exists():
        raise SystemExit(f"Arquivo não encontrado: {INPUT}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with INPUT.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))

    products = []

    for header, data_rows in iter_sections(rows):
        product_name = norm(header[0])
        # Identify split point
        try:
            foto_idx = header.index("FOTO")
        except ValueError:
            foto_idx = None

        left_cols = []
        right_cols = []
        if foto_idx is not None:
            left_cols = [norm(x) for x in header[1:foto_idx] if norm(x)]
            right_cols = [norm(x) for x in header[foto_idx + 1 :] if norm(x)]
        else:
            left_cols = [norm(x) for x in header[1:] if norm(x)]

        entries = []
        for r in data_rows:
            material_token = norm(r[0])
            if not material_token:
                continue
            idx = parse_index(material_token)
            # Left block (non-photochromic)
            if foto_idx is not None:
                for c_i, col_name in enumerate(left_cols, start=1):
                    if c_i >= len(r):
                        continue
                    price = parse_price(r[c_i])
                    if price is None:
                        continue
                    entries.append(
                        {
                            "product": product_name,
                            "photo": False,
                            "index_token": material_token,
                            "index": idx,
                            "column": col_name,
                            "price": price,
                        }
                    )

                # Right block (photochromic)
                for off, col_name in enumerate(right_cols, start=foto_idx + 1):
                    if off >= len(r):
                        continue
                    price = parse_price(r[off])
                    if price is None:
                        continue
                    entries.append(
                        {
                            "product": product_name,
                            "photo": True,
                            "index_token": material_token,
                            "index": idx,
                            "column": col_name,
                            "price": price,
                        }
                    )
            else:
                for c_i, col_name in enumerate(left_cols, start=1):
                    if c_i >= len(r):
                        continue
                    price = parse_price(r[c_i])
                    if price is None:
                        continue
                    entries.append(
                        {
                            "product": product_name,
                            "photo": False,
                            "index_token": material_token,
                            "index": idx,
                            "column": col_name,
                            "price": price,
                        }
                    )

        products.append(
            {
                "product": product_name,
                "foto_split": foto_idx is not None,
                "columns_left": left_cols,
                "columns_right": right_cols,
                "entries": entries,
            }
        )

    out = {
        "source": str(INPUT),
        "products": products,
        "unique_products": sorted(set(p["product"] for p in products)),
    }

    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {OUTPUT} (products={len(products)})")


if __name__ == "__main__":
    main()

