filepath = "src/lib/actions/vendas.actions.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

old = """    const { data: venda, error: vendaError } = await supabaseAdmin
      .from('vendas')
      .select('customer_id, employee_id, created_by_user_id')"""

new = """    const { data: venda, error: vendaError } = await (supabaseAdmin.from('vendas') as any)
      .select('customer_id, employee_id, created_by_user_id')"""

if old in content:
    content = content.replace(old, new)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS")
else:
    print("ERROR: not found")
