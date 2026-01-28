"use server";

import { createClient } from "@/lib/supabase/server";

export async function getTenantIdByStore(storeId: number) {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("stores")
        .select("tenant_id")
        .eq("id", storeId)
        .single();

    if (error || !data) return null;
    return data.tenant_id;
}

export async function getFiscalInvoices(storeId: number) {
    const supabase = createClient();
    const tenantId = await getTenantIdByStore(storeId);

    if (!tenantId) return [];

    const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("*")
        .eq("organization_id", tenantId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Erro ao buscar notas:", error);
        return [];
    }

    return data;
}

export async function getPendingSales(storeId: number) {
    const supabase = createClient();
    const tenantId = await getTenantIdByStore(storeId);

    if (!tenantId) return [];

    // Busca Vendas que estão 'Fechada' mas ainda não têm nota fiscal emitida
    // Mapeamos work_order_id da tabela fiscal_invoices para o ID da venda

    const { data: invoices } = await supabase
        .from("fiscal_invoices")
        .select("work_order_id")
        .eq("organization_id", tenantId)
        .not("work_order_id", "is", null);

    const invoicedIds = invoices?.map(i => i.work_order_id) || [];

    let query = supabase
        .from("vendas")
        .select(`
            id, 
            created_at, 
            valor_final, 
            status,
            customer_id,
            customers (full_name, cpf)
        `)
        .eq("store_id", storeId)
        .eq("status", "Fechada")
        .order("created_at", { ascending: false });

    if (invoicedIds.length > 0) {
        query = query.not("id", "in", `(${invoicedIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Erro ao buscar Vendas pendentes:", error);
        return [];
    }

    return data.map(v => {
        const rawCustomer = v.customers as any;
        const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer;

        return {
            id: v.id,
            created_at: v.created_at,
            total: v.valor_final,
            status: v.status,
            client_id: v.customer_id,
            clients: {
                nome: customer?.full_name,
                cpf_cnpj: customer?.cpf
            }
        };
    });
}

export async function getSaleData(saleId: number) {
    const supabase = createClient();

    // Busca dados da venda e itens
    const { data: venda, error } = await supabase
        .from("vendas")
        .select(`
            *,
            customers (*),
            venda_itens (*)
        `)
        .eq("id", saleId)
        .single();

    if (error) return null;

    return venda;
}

export async function searchProducts(query: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("products")
        .select("id, nome, preco_venda, ncm, cfop, unidade_medida")
        .ilike("nome", `%${query}%`)
        .limit(10);

    if (error) {
        console.error("Erro ao buscar produtos:", error);
        return [];
    }

    return data.map(p => ({
        id: p.id,
        nome: p.nome,
        preco_venda: p.preco_venda,
        ncm: p.ncm,
        cfop: p.cfop,
        unidade: p.unidade_medida
    }));
}

export async function getProductFiscalData(productId: number) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("products")
        .select("ncm, cfop, unidade_medida")
        .eq("id", productId)
        .single();

    if (error) return null;

    return {
        ncm: data.ncm,
        cfop: data.cfop,
        unidade: data.unidade_medida
    };
}
