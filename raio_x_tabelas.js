require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function raioX() {
    console.log('🕵️‍♂️ Iniciando Raio-X das tabelas...\n');

    // Função auxiliar para checar colunas
    async function checarColunas(tabela) {
        // Tenta pegar 1 registro só para ver as chaves (colunas)
        const { data, error } = await supabase
            .from(tabela)
            .select('*')
            .limit(1);

        if (error) {
            console.log(`❌ Erro ao ler tabela '${tabela}': ${error.message}`);
            return;
        }

        if (data && data.length > 0) {
            console.log(`📋 COLUNAS DA TABELA '${tabela.toUpperCase()}':`);
            const colunas = Object.keys(data[0]);

            // Procura suspeitos de unidade
            const suspeitos = colunas.filter(c => c.includes('unidade') || c.includes('medida') || c.includes('unit'));

            console.log(colunas.join(', '));

            if (suspeitos.length > 0) {
                console.log(`   ✅ ENCONTRADO CAMPO DE UNIDADE: ${suspeitos.join(', ')}`);
            } else {
                console.log(`   ⚠️  NENHUM CAMPO DE UNIDADE ENCONTRADO NESTA TABELA.`);
            }
        } else {
            console.log(`⚠️  Tabela '${tabela}' está vazia, não consigo ler as colunas (o Supabase esconde colunas de tabelas vazias via API).`);
        }
        console.log('---------------------------------------------------');
    }

    await checarColunas('products');
    await checarColunas('venda_itens');
}

raioX();