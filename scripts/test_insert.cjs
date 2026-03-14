require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
    console.log('--- TESTE DE INSERT DIRETO ---');

    // Simula exatamente o que registrarCobranca faz
    const { data, error } = await supabase
        .from('cobranca_historico')
        .insert({
            tenant_id: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
            store_id: 1,
            customer_id: 9367, // Regiana
            venda_id: null,    // Sem venda selecionada (corrigido para null)
            tipo_contato: 'Whatsapp',
            resumo_conversa: 'Teste direto via script',
            proxima_acao: null,
            registrado_por_id: 'ffa9595c-b872-4f56-af4f-d06e28ba2d72'
        })
        .select()

    if (error) {
        console.error('❌ ERRO no insert:', error.message);
        console.error('Detalhes:', error.details);
        console.error('Hint:', error.hint);
        console.error('Code:', error.code);
    } else {
        console.log('✅ INSERT bem sucedido!');
        console.log('Data:', JSON.stringify(data, null, 2));
        
        // Limpa o registro de teste
        if (data && data[0]) {
            const { error: delError } = await supabase
                .from('cobranca_historico')
                .delete()
                .eq('id', data[0].id)
            if (delError) console.error('Erro ao limpar teste:', delError.message)
            else console.log('🧹 Registro de teste removido.')
        }
    }
}

testInsert();
