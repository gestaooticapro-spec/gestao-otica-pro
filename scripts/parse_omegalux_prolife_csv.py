import csv
import json
from pathlib import Path


INPUT = Path(".tabelas/OMEGALUX E PROLIFE.csv")
OUTPUT = Path("tmp/omegalux_prolife_price_matrix.json")


def norm(value: str) -> str:
    return (value or "").strip()


def parse_price(value: str):
    text = norm(value)
    if not text:
        return None
    try:
        return float(text.replace(".", "").replace(",", "."))
    except Exception:
        return None


def parse_index(token: str):
    text = norm(token)
    if not text:
        return None
    lowered = text.lower()
    if lowered in ("poly", "poli", "policarbonato"):
        return 1.59
    if lowered == "trivex":
        return 1.53
    try:
        return float(text.replace(",", "."))
    except Exception:
        return None


def is_data_row(row):
    first = norm(row[0]) if row else ""
    if not first:
        return False
    return parse_index(first) is not None


def is_section_header(row):
    if not row:
        return False
    first = norm(row[0])
    if not first or is_data_row(row):
        return False
    cells = [norm(cell).upper() for cell in row[1:]]
    return "FOTO" in cells or any(cell in {"SEM AR", "EASY CLEAN", "CLEAN EXTRA", "NO RISK"} for cell in cells)


def iter_sections(rows):
    index = 0
    while index < len(rows):
        row = rows[index]
        if not is_section_header(row):
            index += 1
            continue

        header = row
        data = []
        index += 1
        while index < len(rows):
            current = rows[index]
            if is_section_header(current):
                break
            if is_data_row(current):
                data.append(current)
            index += 1
        yield header, data


def compact_header_columns(header, start, end):
    return [(idx, norm(header[idx])) for idx in range(start, end) if idx < len(header) and norm(header[idx])]


def main():
    if not INPUT.exists():
        raise SystemExit(f"Arquivo nao encontrado: {INPUT}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with INPUT.open("r", encoding="utf-8-sig", newline="") as file:
        rows = list(csv.reader(file, delimiter=";"))

    products = []
    for header, data_rows in iter_sections(rows):
        product_name = norm(header[0])
        try:
            foto_idx = [norm(cell).upper() for cell in header].index("FOTO")
        except ValueError:
            foto_idx = None

        if foto_idx is None:
            left_cols = compact_header_columns(header, 1, len(header))
            right_cols = []
        else:
            left_cols = compact_header_columns(header, 1, foto_idx)
            right_cols = compact_header_columns(header, foto_idx + 1, len(header))

        entries = []
        for row in data_rows:
            index_token = norm(row[0])
            idx = parse_index(index_token)

            for col_idx, col_name in left_cols:
                price = parse_price(row[col_idx] if col_idx < len(row) else "")
                if price is None:
                    continue
                entries.append(
                    {
                        "product": product_name,
                        "photo": False,
                        "index_token": index_token,
                        "index": idx,
                        "column": col_name,
                        "price": price,
                    }
                )

            for col_idx, col_name in right_cols:
                price = parse_price(row[col_idx] if col_idx < len(row) else "")
                if price is None:
                    continue
                entries.append(
                    {
                        "product": product_name,
                        "photo": True,
                        "index_token": index_token,
                        "index": idx,
                        "column": col_name,
                        "price": price,
                    }
                )

        products.append(
            {
                "product": product_name,
                "foto_split": foto_idx is not None,
                "columns_left": [name for _, name in left_cols],
                "columns_right": [name for _, name in right_cols],
                "entries": entries,
            }
        )

    output = {
        "source": str(INPUT),
        "products": products,
        "unique_products": sorted({product["product"] for product in products}),
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {OUTPUT} (products={len(products)})")


if __name__ == "__main__":
    main()
