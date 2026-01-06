
import dotenv from 'dotenv';

// Tenta carregar .env.local, depois .env
dotenv.config({ path: '.env.local' });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env' });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('\n--- VERIFICAÇÃO DE CONEXÃO ---');
if (!url) {
    console.log('ERRO: Nenhuma URL do Supabase encontrada nas variáveis de ambiente.');
} else {
    console.log(`URL Conectada: ${url}`);

    // Tenta extrair o ID do projeto da URL (https://<PROJECT_ID>.supabase.co)
    const match = url.match(/https:\/\/([^.]+)\./);
    if (match) {
        console.log(`PROJECT ID:  ${match[1]}`);
    } else {
        console.log('PROJECT ID:  (Não foi possível extrair da URL)');
    }
}

console.log('------------------------------\n');
console.log('Compare este PROJECT ID com o que aparece na URL do seu navegador quando você acessa o painel do Supabase.');
console.log('Se forem diferentes, seu computador está conectado no banco errado.');
