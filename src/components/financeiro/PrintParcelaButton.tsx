'use client'

import { useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'
import { getDadosReciboParcela } from '@/lib/actions/parcela-print.actions'

// Coordenadas para o modelo de recibo (Carnê)
const COORDS = {
  NOME: { x: 144, y: 56 },
  VALOR_NUM: { x: 185, y: 66 },
  VALOR_REPETIDO: { x: 185, y: 90 }, // Valor extenso/repetido
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
      
      // 1. Busca os dados no Backend
      const { success, data, error } = await getDadosReciboParcela(parcelaId)
      
      if (!success || !data) {
        alert('Erro ao buscar dados: ' + error)
        setLoading(false)
        return
      }

      // 2. Configura o PDF (A4 Paisagem)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      // Configura fonte estilo "Maquininha"
      doc.setFont('Courier', 'bold')
      doc.setFontSize(12)

      // --- FORMATAÇÃO DE DADOS ---
      const valorFormatado = Number(data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      
      // Data Pagamento
      const dtPagto = new Date(data.pagamento)
      // Ajuste de fuso horário simples (garante dia correto)
      const dia = dtPagto.getUTCDate().toString().padStart(2, '0')
      const mes = (dtPagto.getUTCMonth() + 1).toString().padStart(2, '0')
      const ano = dtPagto.getUTCFullYear().toString().slice(-2)

      // Data Vencimento
      const dtVenc = new Date(data.vencimento)
      const vencimentoTexto = dtVenc.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: '2-digit' })

      // --- DESENHO NO PDF ---

      // Aviso de 2ª via (se houver lógica futura)
      if (data.is_reimpressao) {
        doc.text('*** 2ª VIA ***', COORDS.REIMPRESSAO.x, COORDS.REIMPRESSAO.y)
      }

      // Cabeçalho
      doc.text(String(data.num_parcela), COORDS.NUM_PARCELA.x, COORDS.NUM_PARCELA.y)
      doc.text(vencimentoTexto, COORDS.VENCIMENTO.x, COORDS.VENCIMENTO.y)

      // Nome do Cliente
      doc.text((data.nome_cliente || '').substring(0, 45).toUpperCase(), COORDS.NOME.x, COORDS.NOME.y)

      // Checkbox Fixo
      doc.text('X', COORDS.CHECK_PRESTACAO.x, COORDS.CHECK_PRESTACAO.y)

      // Valores (SEM PARÊNTESES)
      doc.text(valorFormatado, COORDS.VALOR_NUM.x, COORDS.VALOR_NUM.y)
      
      // ALTERADO AQUI: Removido o "R$"
      doc.text(valorFormatado, COORDS.VALOR_REPETIDO.x, COORDS.VALOR_REPETIDO.y)

      // Data Pagamento (Separada nos quadrinhos)
      doc.text(dia, COORDS.DATA_PAGTO.x + 4, COORDS.DATA_PAGTO.y)
      doc.text(mes, COORDS.DATA_PAGTO.x + 14, COORDS.DATA_PAGTO.y)
      doc.text(ano, COORDS.DATA_PAGTO.x + 22, COORDS.DATA_PAGTO.y)

      // --- IMPRESSÃO "SILENCIOSA" VIA IFRAME ---
      
      // 1. Gera o arquivo Blob do PDF
      const blob = doc.output('blob')
      const blobUrl = URL.createObjectURL(blob)

      // 2. Cria um iframe invisível
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = blobUrl
      document.body.appendChild(iframe)

      // 3. Quando carregar, manda imprimir
      iframe.onload = () => {
        if (iframe.contentWindow) {
          iframe.contentWindow.print()
        }
      }

      // 4. Limpeza (Remove o iframe depois de 1 min para liberar memória)
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe)
        }
        URL.revokeObjectURL(blobUrl)
      }, 60000)

    } catch (err) {
      console.error(err)
      alert('Erro ao gerar impressão.')
    } finally {
      setLoading(false)
    }
  }

  // Renderização do Botão
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