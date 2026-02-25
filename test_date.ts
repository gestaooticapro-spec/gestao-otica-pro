import { createAdminClient } from './src/lib/supabase/admin';

async function run() {
    const sb = createAdminClient();
    // Fetch the most recent records to see what proxima_acao actually stored
    const { data, error } = await (sb.from('cobranca_historico') as any)
        .select('id, proxima_acao, created_at, resumo_conversa')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error(error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}
run();
