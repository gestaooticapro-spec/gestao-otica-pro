'use server'

import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReceiptPDF } from '@/lib/pdf-generator'

// --- CONFIGURAÇÃO DE EMAIL (Mantém igual) ---
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false }
})

// --- FUNÇÃO AJUDANTE (Para não repetir código de busca) ---
async function fetchReceiptData(ids: number[], isReprint: boolean) {
  const supabase = createAdminClient()
  
  const { data: pagamentos } = await (supabase.from('pagamentos') as any).select('*').in('id', ids)
  if (!pagamentos || pagamentos.length === 0) throw new Error('Pagamentos não encontrados')
  
  const vendaId = pagamentos[0].venda_id
  const { data: vendaRaw } = await (supabase.from('vendas') as any).select('*, customers(*), venda_itens(*)').eq('id', vendaId).single()
  if (!vendaRaw) throw new Error('Venda não encontrada')

  return {
    pagamentos, venda: vendaRaw, cliente: vendaRaw.customers, itens: vendaRaw.venda_itens || [], isReprint
  }
}

// 1. ENVIO POR EMAIL (O que você já usa)
export async function sendReceiptToHP(ids: number[], isReprint: boolean = false) {
  const logPrefix = `[PDF-HP-${Date.now()}]`
  console.log(`${logPrefix} 🚀 Iniciando envio...`)

  try {
    const receiptData = await fetchReceiptData(ids, isReprint)
    const pdfBuffer = await generateReceiptPDF(receiptData)

    await transporter.sendMail({
      from: `"Sistema Ótica" <${process.env.EMAIL_USER}>`,
      to: 'oticaprisma@hpeprint.com',
      subject: `Recibo ${receiptData.venda.id}`,
      text: '', html: '', 
      attachments: [{
          filename: `recibo-${receiptData.venda.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
          contentDisposition: 'attachment'
      }]
    })

    return { success: true }
  } catch (error: any) {
    console.error(`${logPrefix} 💥 ERRO:`, error)
    return { success: false, error: error.message }
  }
}

// 2. NOVA FUNÇÃO: GERAR PDF PARA VISUALIZAR (PREVIEW)
export async function getReceiptPDFBase64(ids: number[], isReprint: boolean = false) {
  try {
    const receiptData = await fetchReceiptData(ids, isReprint)
    const pdfBuffer = await generateReceiptPDF(receiptData)
    
    // Converte o arquivo (Buffer) para texto (Base64) para viajar até o navegador
    const base64 = pdfBuffer.toString('base64')
    
    return { success: true, base64 }
  } catch (error: any) {
    console.error('Erro ao gerar preview:', error)
    return { success: false, error: error.message }
  }
}