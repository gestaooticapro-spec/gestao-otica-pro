filepath = "src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

old = """        if (saveState.success && saveState.data && saveState.timestamp !== lastSuccessRef.current) {"""

new = """        if (!saveState.success && saveState.message && saveState.timestamp !== lastSuccessRef.current) {
            alert(`Erro ao salvar OS: ${saveState.message}`);
            lastSuccessRef.current = saveState.timestamp;
            return;
        }

        if (saveState.success && saveState.data && saveState.timestamp !== lastSuccessRef.current) {"""

if old in content:
    content = content.replace(old, new)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS")
else:
    print("ERROR: not found")
