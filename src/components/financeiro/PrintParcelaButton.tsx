'use client'

import { useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'
import { getDadosReciboParcela } from '@/lib/actions/parcela-print.actions'

// Coordenadas
const COORDS = {
  NOME: { x: 144, y: 56 },
  VALOR_NUM: { x: 185, y: 66 },
  VALOR_REPETIDO: { x: 185, y: 90 }, 
  DATA_PAGTO: { x: 246, y: 65 },     
  NUM_PARCELA: { x: 223, y: 45 },
  VENCIMENTO: { x: 267, y: 45 },
  CHECK_PRESTACAO: { x: 210, y: 62 }, 
  REIMPRESSAO: { x: 144, y: 50 }
}

interface PrintParcelaBtnProps {
  parcelaId: number
  variant?: 'icon' | 'full'
}

export function PrintParcelaButton({ parcelaId, variant = 'icon' }: PrintParcelaBtnProps) {
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    try {
      setLoading(true)
      
      const { success, data, error } = await getDadosReciboParcela(parcelaId)
      
      if (!success || !data) {
        alert('Erro ao buscar dados: ' + error)
        return
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      doc.setFont('Courier', 'bold')
      doc.setFontSize(12)

      // --- DADOS ---
      const valorFormatado = Number(data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      const dtPagto = new Date(data.pagamento)
      const dia = dtPagto.getUTCDate().toString().padStart(2, '0')
      const mes = (dtPagto.getUTCMonth() + 1).toString().padStart(2, '0')
      const ano = dtPagto.getUTCFullYear().toString().slice(-2)
      const dtVenc = new Date(data.vencimento)
      const vencimentoTexto = dtVenc.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' })

      // --- FUNÇÃO CARIMBO (Desenha o recibo) ---
      // Criamos essa função para não precisar repetir o código 2 vezes
      const desenharPagina = () => {
        if (data.is_reimpressao) {
          doc.text('*** 2ª VIA ***', COORDS.REIMPRESSAO.x, COORDS.REIMPRESSAO.y)
        }

        doc.text(String(data.num_parcela), COORDS.NUM_PARCELA.x, COORDS.NUM_PARCELA.y)
        doc.text(vencimentoTexto, COORDS.VENCIMENTO.x, COORDS.VENCIMENTO.y)
        doc.text((data.nome_cliente || '').substring(0, 45).toUpperCase(), COORDS.NOME.x, COORDS.NOME.y)
        doc.text('X', COORDS.CHECK_PRESTACAO.x, COORDS.CHECK_PRESTACAO.y)
        
        // Valores sem R$
        doc.text(valorFormatado, COORDS.VALOR_NUM.x, COORDS.VALOR_NUM.y)
        doc.text(valorFormatado, COORDS.VALOR_REPETIDO.x, COORDS.VALOR_REPETIDO.y)

        doc.text(dia, COORDS.DATA_PAGTO.x + 4, COORDS.DATA_PAGTO.y)
        doc.text(mes, COORDS.DATA_PAGTO.x + 14, COORDS.DATA_PAGTO.y)
        doc.text(ano, COORDS.DATA_PAGTO.x + 22, COORDS.DATA_PAGTO.y)
      }

      // --- GERAÇÃO DAS 2 VIAS ---
      
      // 1. Desenha a primeira via
      desenharPagina()
      
      // 2. Adiciona nova página e desenha a segunda via
      doc.addPage()
      desenharPagina()

      // --- IMPRESSÃO ---
      const blob = doc.output('blob')
      const blobUrl = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = blobUrl
      document.body.appendChild(iframe)

      iframe.onload = () => {
        if (iframe.contentWindow) iframe.contentWindow.print()
      }

      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe)
        URL.revokeObjectURL(blobUrl)
      }, 60000)

    } catch (err) {
      console.error(err)
      alert('Erro na impressão.')
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'full') {
    return (
        <button
            onClick={handlePrint}
            disabled={loading}
            className="w-full py-4 bg-slate-800 text-white font-bold rounded-xl shadow-lg hover:bg-slate-700 transition-all flex items-center justify-center gap-3"
        >
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Printer className="h-6 w-6" />}
            IMPRIMIR RECIBO
        </button>
    )
  }

  return (
    <button
      onClick={handlePrint}
      disabled={loading}
      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200 shadow-sm"
      title="Imprimir Recibo"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
    </button>
  )
}