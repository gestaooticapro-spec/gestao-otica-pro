import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Força o carregamento do .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Faltam variáveis de ambiente!")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
    const storeId = 1
    
    // Busca a loja
    const { data: store, error: errStore } = await supabase.from('stores').select('id, tenant_id').eq('id', storeId).single()
    if (errStore || !store) {
        console.error("Erro ao buscar loja 1:", errStore)
        return
    }

    // Busca o canal ou cria um
    let channelId = 1
    const { data: channel, error: errChannel } = await supabase.from('whatsapp_store_channels').select('id').eq('store_id', storeId).limit(1).single()
    if (channel) {
        channelId = channel.id
    } else {
        const { data: newChannel, error: errNewChannel } = await supabase.from('whatsapp_store_channels').insert({
            tenant_id: store.tenant_id,
            store_id: storeId,
            provider: 'evolution',
            instance_key: 'test_instance',
            phone_number: '5511999999999',
            is_active: true,
            connection_status: 'connected'
        }).select().single()
        if (newChannel) {
            channelId = newChannel.id
        }
    }
    
    // Inserir registro de teste para a loja
    const { data, error } = await supabase.from('whatsapp_conversation_states').upsert({
        tenant_id: store.tenant_id,
        store_id: storeId,
        channel_id: channelId,
        remote_phone: '5511999999999',
        state: 'human_pause',
        // Define a expiração para daqui a 2 horas (em ms)
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        metadata: {
            handoff_internal_note: "O cliente pediu a 2ª via da parcela. Achei 1 pendente no valor de R$ 150,00."
        },
        updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id,remote_phone' }).select()

    if (error) {
        console.error("Erro ao inserir pendência:", error)
    } else {
        console.log("Pendência de teste criada com sucesso!")
        console.log(data)
    }
}

run()
