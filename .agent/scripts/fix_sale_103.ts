
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
    const VENDA_ID = 103
    console.log(`--- CORRIGINDO COMISSÃO DA VENDA ${VENDA_ID} ---`)

    // 1. Busca Venda
    const { data: venda, error } = await supabase
        .from('vendas')
        .select(`
            *,
            employees (*),
            pagamentos (*)
        `)
        .eq('id', VENDA_ID)
        .single()

    if (error || !venda) {
        console.error('Erro ao buscar venda:', error)
        return
    }

    console.log('Venda encontrada:', venda.id, venda.status)

    // 2. Calcula
    const emp = venda.employees
    let comissaoTotal = 0
    let totalPagoGarantido = 0

    // Garantida
    venda.pagamentos?.forEach((pg: any) => {
        const forma = (pg.forma_pagamento || '').toLowerCase()
        if (forma.includes('pix') || forma.includes('dinheiro') || forma.includes('cart') || forma.includes('débito')) {
            totalPagoGarantido += (pg.valor_pago || 0)
        }
    })

    const rateGuaranteed = emp?.comm_rate_guaranteed || 0
    if (totalPagoGarantido > 0 && rateGuaranteed > 0) {
        comissaoTotal += totalPagoGarantido * (rateGuaranteed / 100)
    }

    // Risco
    const totalRisco = Math.max(0, venda.valor_final - totalPagoGarantido)
    const rateCredit = emp?.comm_rate_store_credit || 0
    if (totalRisco > 0 && rateCredit > 0) {
        comissaoTotal += totalRisco * (rateCredit / 100)
    }

    // Sobre a Loja (Total)
    const rateStoreTotal = emp?.comm_rate_store_total || 0
    if (rateStoreTotal > 0 && venda.valor_final > 0) {
        comissaoTotal += venda.valor_final * (rateStoreTotal / 100)
    }

    // Sobre Recebimento
    const rateReceived = emp?.comm_rate_received || 0
    if (rateReceived > 0) {
        const totalRecebido = venda.pagamentos?.reduce((acc: number, pg: any) => acc + (pg.valor_pago || 0), 0) || 0
        if (totalRecebido > 0) {
            comissaoTotal += totalRecebido * (rateReceived / 100)
        }
    }

    console.log(`Comissão Calculada: R$ ${comissaoTotal.toFixed(2)}`)

    if (comissaoTotal > 0) {
        // 3. Remove anterior
        await supabase.from('commissions').delete().eq('venda_id', VENDA_ID)

        // 4. Insere Nova
        const { error: insertError } = await supabase.from('commissions').insert({
            tenant_id: venda.tenant_id,
            store_id: venda.store_id,
            employee_id: venda.employee_id,
            venda_id: VENDA_ID,
            amount: parseFloat(comissaoTotal.toFixed(2)),
            status: 'Pendente',
            created_at: venda.data_fechamento || new Date().toISOString()
        })

        if (insertError) {
            console.error('Erro ao inserir:', insertError)
        } else {
            console.log('✅ Comissão corrigida com sucesso!')
        }
    } else {
        console.log('⚠️ Valor da comissão é 0. Nada a registrar.')
    }
}

run()
