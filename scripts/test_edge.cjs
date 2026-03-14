require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testEdgeCases() {
    console.log('--- TESTE DE EDGE CASES ---');
    
    // Test 1: registrado_por_id com um NÚMERO (employee ID) em vez de UUID
    console.log('\n--- Test 1: registrado_por_id como número (string "2") ---');
    const { error: e1 } = await supabase
        .from('cobranca_historico')
        .insert({
            tenant_id: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
            store_id: 1,
            customer_id: 9367,
            venda_id: null,
            tipo_contato: 'Whatsapp',
            resumo_conversa: 'Teste com employee ID numérico',
            proxima_acao: null,
            registrado_por_id: '2' // Employee ID como string
        })
    
    if (e1) {
        console.error('❌ Test 1 FALHOU:', e1.message);
        console.error('Detalhes:', e1.details);
    } else {
        console.log('✅ Test 1 OK: employee ID numérico aceito');
    }

    // Test 2: registrado_por_id vazio (simula quando selectedEmployeeId é '' e user.id é usado)
    console.log('\n--- Test 2: registrado_por_id como UUID do user ---');
    const { error: e2 } = await supabase
        .from('cobranca_historico')
        .insert({
            tenant_id: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
            store_id: 1,
            customer_id: 9367,
            venda_id: null,
            tipo_contato: 'Whatsapp',
            resumo_conversa: 'Teste com user UUID',
            proxima_acao: null,
            registrado_por_id: 'ffa9595c-b872-4f56-af4f-d06e28ba2d72'
        })

    if (e2) {
        console.error('❌ Test 2 FALHOU:', e2.message);
    } else {
        console.log('✅ Test 2 OK: User UUID aceito');
    }

    // Test 3: proxima_acao com uma data
    console.log('\n--- Test 3: proxima_acao com data ---');
    const { error: e3 } = await supabase
        .from('cobranca_historico')
        .insert({
            tenant_id: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
            store_id: 1,
            customer_id: 9367,
            venda_id: null,
            tipo_contato: 'Telefone',
            resumo_conversa: 'Teste com próxima ação',
            proxima_acao: '2026-03-20',
            registrado_por_id: '2'
        })

    if (e3) {
        console.error('❌ Test 3 FALHOU:', e3.message);
    } else {
        console.log('✅ Test 3 OK: proxima_acao com data aceita');
    }

    // Limpa todos os registros de teste
    console.log('\n--- Limpeza ---');
    const { data: testRecords } = await supabase
        .from('cobranca_historico')
        .select('id')
        .eq('customer_id', 9367)
        .like('resumo_conversa', 'Teste %')
    
    if (testRecords && testRecords.length > 0) {
        const ids = testRecords.map(r => r.id)
        const { error: delError } = await supabase
            .from('cobranca_historico')
            .delete()
            .in('id', ids)
        if (delError) console.error('Erro ao limpar:', delError.message)
        else console.log(`🧹 ${ids.length} registros de teste removidos.`)
    }
}

testEdgeCases();
