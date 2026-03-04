'use server'

import { generateReceiptPDF } from '@/lib/pdf-generator'
import { createAdminClient } from '@/lib/supabase/admin'

// --- FUNÇÃO "TUDO OU NADA" (Tipagem Any) ---
export async function getReceiptPDFBase64(paymentIds: number[]) {
    try {
        const supabase = createAdminClient()

        // 1. Query Poderosa (Traz tudo de uma vez)
        const { data: rawData, error: erroPag } = await supabase
            .from('pagamentos')
            .select('*, vendas!inner(*, customers(*), venda_itens(*))')
            .in('id', paymentIds) as any

        if (erroPag) throw new Error(`Erro SQL: ${erroPag.message}`)

        // Fallback: se não encontrou por ID de pagamento, tenta por venda_id
        let pagamentos = rawData as any[]
        if (!pagamentos || pagamentos.length === 0) {
            const { data: fallbackData, error: fallbackErr } = await supabase
                .from('pagamentos')
                .select('*, vendas!inner(*, customers(*), venda_itens(*))')
                .in('venda_id', paymentIds)
                .order('created_at', { ascending: false }) as any
            if (fallbackErr) throw new Error(`Erro SQL fallback: ${fallbackErr.message}`)
            pagamentos = fallbackData as any[]
        }

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