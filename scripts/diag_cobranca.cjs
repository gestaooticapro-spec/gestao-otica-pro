require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDiagnostics() {
    console.log('--- DIAGNÓSTICO DE COBRANÇA ---');

    // 1. Verificar se o cliente Regiana existe e qual o seu ID
    const { data: customer, error: custErr } = await supabase
        .from('customers')
        .select('id, full_name, tenant_id')
        .ilike('full_name', '%Regiana Furtado%')
        .maybeSingle();

    if (custErr) console.error('Erro ao buscar cliente:', custErr);
    else console.log('Cliente encontrado:', customer);

    // 2. Tentar encontrar a última tentativa de histórico (se gravou algo por engano)
    if (customer) {
        const { data: hist, error: histErr } = await supabase
            .from('cobranca_historico')
            .select('*')
            .eq('customer_id', customer.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (histErr) console.error('Erro ao buscar histórico:', histErr);
        else console.log('Último histórico na DB:', hist);
    }

    // 3. Verificar o perfil do usuário logado (precisamos saber quem é o usuário atual)
    // Como não sei o ID do usuário atual, vou listar os perfis para ver se há algum com tenant_id nulo
    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, role, store_id, tenant_id')
        .limit(10);

    if (profErr) console.error('Erro ao buscar perfis:', profErr);
    else {
        console.log('Amostra de perfis (verificando tenant_id nulo):');
        profiles.forEach(p => {
            console.log(`ID: ${p.id}, Store: ${p.store_id}, Tenant: ${p.tenant_id} ${p.tenant_id ? '' : '⚠️ NULO!'}`);
        });
    }
}

checkDiagnostics();
