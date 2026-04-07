filepath = "src/lib/actions/vendas.actions.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

old = """    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    const oldCustomerId = venda.customer_id"""

new = """    const { data: profile } = await (supabaseAdmin.from('profiles') as any)
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    const oldCustomerId = venda.customer_id"""

if old in content:
    content = content.replace(old, new)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS")
else:
    print("ERROR: not found")
