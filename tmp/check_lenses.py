import os
import json
import urllib.request
import urllib.error

URL = "https://thmglufejrivyhabfqfb.supabase.co/rest/v1"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRobWdsdWZlanJpdnloYWJmcWZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODIzOCwiZXhwIjoyMDc4OTc0MjM4fQ.q3klL2jxyUvIBNVi-TyoYTwDYkX3ouNKuSTYq2fI07M"

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def fetch_table(table, params=""):
    req = urllib.request.Request(f"{URL}/{table}{params}", headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return None
    except Exception as e:
        return None

def delete_records(table, ids):
    if not ids: return
    batch_size = 50
    deleted_count = 0
    for i in range(0, len(ids), batch_size):
        batch = ids[i:i+batch_size]
        batch_str = ",".join(map(str, batch))
        req = urllib.request.Request(f"{URL}/{table}?id=in.({batch_str})", method="DELETE", headers=headers)
        try:
            with urllib.request.urlopen(req) as response:
                pass
            deleted_count += len(batch)
        except urllib.error.HTTPError as e:
            print(f"Failed to delete batch: {e.read().decode()}")
    print(f"Deleted {deleted_count} items from {table}.")

def run():
    print("--- Fetching all active products... ---")
    lenses = fetch_table("products", "?store_id=eq.1&select=id,nome,tem_grade,tipo_produto")
    
    lenses_without_grade = [l for l in lenses if l.get("tipo_produto") in ("Lente", "LenteContato") and not l.get("tem_grade")]
    print(f"Found {len(lenses_without_grade)} target lenses (no grades).")
    
    ids = [l["id"] for l in lenses_without_grade]
    if not ids: return

    used_ids = set()
    
    # Tables to check: venda_itens, os_items, compras_fornecedor_itens, stock_movements
    tables_to_check = {
        "venda_itens": "produto_id",      # sometimes it's produto_id
        "venda_item": "produto_id",
        "sale_items": "product_id",
        "purchase_items": "product_id",
        "compras_itens": "produto_id",
        "stock_movements": "produto_id",
        "estoque_movimentacoes": "produto_id",
        "inventory_movements": "produto_id",
        "os_items": "produto_id"
    }

    print("--- Identifying active references ... ---")
    batch_size = 50
    
    for table, col in tables_to_check.items():
        found = False
        for i in range(0, len(ids), batch_size):
            batch = ids[i:i+batch_size]
            b_str = ",".join(map(str, batch))
            
            # Tenta testar primeira coluna com product_id e produto_id
            for test_col in [col, "product_id", "produto_id", "item_id"]:
                res = fetch_table(table, f"?{test_col}=in.({b_str})&select={test_col}")
                if res is not None:
                    found = True
                    used_ids.update([r[test_col] for r in res])
                    break
        if found:
            print(f" Checked table '{table}' successfully.")

    to_delete = [id_ for id_ in ids if id_ not in used_ids]
    print(f"\\nAnalysis completed: Found {len(to_delete)} completely orphaned lenses.")
    
    if to_delete:
        print("Executing deletion sequence...")
        # Lenses is just table `products`. We will delete from products.
        delete_records("products", to_delete)
        print("Cleanup done!")
    else:
        print("Nothing to clean up.")

if __name__ == "__main__":
    run()
