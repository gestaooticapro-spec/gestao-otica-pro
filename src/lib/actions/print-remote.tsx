'use server'

import { generateReceiptPDF } from '@/lib/pdf-generator'
import { createAdminClient } from '@/lib/supabase/admin' 

// --- FUNÇÃO "TUDO OU NADA" (Tipagem Any) ---
export async function getReceiptPDFBase64(paymentIds: number[]) {
    try {
        const supabase = createAdminClient()

        // 1. Query Poderosa (Traz tudo de uma vez)
        // O "as any" aqui silencia o erro de que o select é muito complexo
        const { data: rawData, error: erroPag } = await supabase
            .from('pagamentos')
            .select('*, vendas!inner(*, customers(*), venda_itens(*))')
            .in('id', paymentIds) as any

        if (erroPag) throw new Error(`Erro SQL: ${erroPag.message}`)
        
        // Forçamos o TypeScript a tratar isso como uma lista genérica
        const pagamentos = rawData as any[]

        if (!pagamentos || pagamentos.length === 0) throw new Error("Pagamentos não encontrados.")

        // 2. Extraindo os dados (agora sem linhas vermelhas, pois é 'any')
        // Como usamos !inner na venda, ela com certeza existe no primeiro pagamento
        const venda = pagamentos[0].vendas
        
        // O cliente pode vir null se a venda foi sem cadastro, mas o 'any' deixa passar
        const cliente = venda.customers 
        
        const itens = venda.venda_itens || []

        // 3. Gerando PDF
        const pdfBuffer = await generateReceiptPDF({
            pagamentos: pagamentos, // Passamos os pagamentos originais
            venda: venda,
            cliente: cliente,
            itens: itens
        })

        // 4. Retorno
        return { 
            success: true, 
            pdfBase64: pdfBuffer.toString('base64') 
        }

    } catch (e: any) {
        console.error("❌ Erro ao gerar PDF:", e)
        return { success: false, error: e.message || "Erro desconhecido" }
    }
}

// --- MANTIDA COMO BACKUP ---
export async function sendReceiptToHP(paymentIds: number[]) {
  return { success: false, error: "Função desativada." }
}