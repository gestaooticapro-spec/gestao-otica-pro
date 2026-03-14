require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTableStructure() {
    console.log('--- ESTRUTURA DA TABELA COBRANCA_HISTORICO ---');
    
    // Tenta inserir um registro inválido de propósito para ver o erro e os campos requeridos
    const { data, error } = await supabase
        .from('cobranca_historico')
        .insert({
            // Faltando campos obrigatórios
            resumo_conversa: 'Teste de erro'
        });

    if (error) {
        console.log('Erro ao inserir (esperado):', error.message);
        console.log('Detalhes do erro:', error.details);
        console.log('Dica do erro:', error.hint);
    }
}

checkTableStructure();
