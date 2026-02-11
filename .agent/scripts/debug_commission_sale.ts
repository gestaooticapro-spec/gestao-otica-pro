
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
    console.log('--- DIAGNÓSTICO DE VENDA E COMISSÃO ---')

    // 1. Busca Venda de 1040
    const { data: vendas, error } = await supabase
        .from('vendas')
        .select(`
            *,
            employees (*),
            pagamentos (*)
        `)
        .eq('valor_final', 1040)
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Erro ao buscar vendas:', error)
        return
    }

    if (!vendas || vendas.length === 0) {
        console.log('❌ Nenhuma venda de R$ 1040,00 encontrada.')
        return
    }

    console.log(`Encontradas ${vendas.length} vendas de R$ 1040. Analisando a mais recente...`)

    const venda = vendas[0]
    console.log('ID Venda:', venda.id)
    console.log('Status:', venda.status)
    console.log('Criada em:', venda.created_at)
    console.log('Fechada em (data_fechamento):', venda.data_fechamento)
    console.log('Employee ID:', venda.employee_id)
    console.log('Cliente ID:', venda.customer_id)

    // Detalhes do Funcionário
    const emp = venda.employees
    if (!emp) {
        console.log('❌ Venda sem funcionário vinculado!')
    } else {
        console.log('Funcionário:', emp.full_name)
        console.log('Taxas Configuradas:')
        console.log(' - Garantida:', emp.comm_rate_guaranteed)
        console.log(' - Risco (Crédito Loja):', emp.comm_rate_store_credit)
        console.log(' - Sobre Total (Loja):', emp.comm_rate_store_total)
        console.log(' - Sobre Recebimento:', emp.comm_rate_received)
        console.log(' - Sobre Lucro:', emp.comm_rate_profit)
    }

    // Pagamentos
    console.log('Pagamentos:')
    venda.pagamentos?.forEach((p: any) => {
        console.log(` - ${p.forma_pagamento}: R$ ${p.valor_pago} em ${p.parcelas}x`)
    })

    // 2. Busca Comissão Existente
    const { data: comissoes } = await supabase
        .from('commissions')
        .select('*')
        .eq('venda_id', venda.id)

    if (!comissoes || comissoes.length === 0) {
        console.log('❌ Nenhuma comissão registrada para esta venda no DB.')
    } else {
        comissoes.forEach((c: any) => {
            console.log(`✅ Comissão encontrada: ID ${c.id} | Valor: R$ ${c.amount} | Status: ${c.status} | Criada em: ${c.created_at}`)
        })
    }

    // 3. Simulação de Cálculo
    console.log('\n--- SIMULAÇÃO DE CÁLCULO ---')
    let comissaoTotal = 0
    let totalPagoGarantido = 0

    // Garantida
    venda.pagamentos?.forEach((pg: any) => {
        const forma = (pg.forma_pagamento || '').toLowerCase()
        if (forma.includes('pix') || forma.includes('dinheiro') || forma.includes('cart') || forma.includes('débito')) {
            totalPagoGarantido += (pg.valor_pago || 0)
        }
    })
    console.log('Total Garantido calc:', totalPagoGarantido)
    const rateGuaranteed = emp?.comm_rate_guaranteed || 0
    if (totalPagoGarantido > 0 && rateGuaranteed > 0) {
        const val = totalPagoGarantido * (rateGuaranteed / 100)
        console.log(` + Garantida (${rateGuaranteed}%): R$ ${val}`)
        comissaoTotal += val
    }

    // Risco
    const totalRisco = Math.max(0, venda.valor_final - totalPagoGarantido)
    console.log('Total Risco calc:', totalRisco)
    const rateCredit = emp?.comm_rate_store_credit || 0
    if (totalRisco > 0 && rateCredit > 0) {
        const val = totalRisco * (rateCredit / 100)
        console.log(` + Risco (${rateCredit}%): R$ ${val}`)
        comissaoTotal += val
    }

    console.log(`= TOTAL ESTIMADO: R$ ${comissaoTotal.toFixed(2)}`)
}

run()
