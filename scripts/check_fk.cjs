require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkVendaIdFK() {
    console.log('--- TESTANDO FK DE VENDA_ID ---');
    
    const { data, error } = await supabase
        .from('cobranca_historico')
        .insert({
            tenant_id: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
            store_id: 1,
            customer_id: 9367, // Regiana
            tipo_contato: 'Teste',
            resumo_conversa: 'Teste de FK',
            registrado_por_id: 'ffa9595c-b872-4f56-af4f-d06e28ba2d72',
            venda_id: 0 // Venda ID 0 provavelmente não existe
        });

    if (error) {
        console.log('Erro ao inserir com venda_id=0:', error.message);
        console.log('Detalhes:', error.details);
    } else {
        console.log('Inseriu com sucesso (sem FK ou ID 0 existe)');
    }
}

checkVendaIdFK();
