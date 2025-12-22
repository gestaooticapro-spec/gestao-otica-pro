'use client'

import { useEffect, useState } from 'react'
import { getDadosProtocolo } from '@/lib/actions/ProtocoloPrint.actions'
import { PRINT_CONFIG } from '@/config/printLayout'
import { Loader2, AlertTriangle } from 'lucide-react'

// Tipagem das coordenadas (Sup/Inf)
type Coord = { x: number; y: number }

export default function PrintOSPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<any>(null)

  // 1. Busca os dados ao carregar a página
  useEffect(() => {
    const loadData = async () => {
      try {
        const osId = parseInt(params.id)
        if (isNaN(osId)) throw new Error('ID inválido')

        const res = await getDadosProtocolo(osId)
        
        if (!res.success || !res.data) {
          throw new Error(res.error || 'Erro ao buscar dados')
        }

        setData(res.data)
        
// Dispara a impressão quando os dados estiverem prontos
        setTimeout(() => {
          // Fecha a janela automaticamente após imprimir ou cancelar
          window.onafterprint = () => {
            window.close()
          }
          
          window.print()
        }, 800)
        
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [params.id])

  // --- HELPER DE RENDERIZAÇÃO ---
  // Renderiza um texto nas posições (Superior e Inferior) definidas no config
  const RenderField = ({ value, config }: { value: string | number | null | undefined, config: Coord[] }) => {
    if (!value || !config) return null
    
    return (
      <>
        {config.map((pos, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${pos.x}mm`,
              top: `${pos.y}mm`,
              whiteSpace: 'nowrap',
              fontFamily: 'Courier New, monospace', // Fonte monoespaçada ajuda no alinhamento
              fontWeight: 'bold',
              fontSize: '12px', // Ajuste conforme necessário
              transform: 'translateY(-50%)', // Centraliza verticalmente na coordenada
              pointerEvents: 'none'
            }}
          >
            {String(value).toUpperCase()}
          </div>
        ))}
      </>
    )
  }

  // Helper específico para datas desmembradas
  const RenderDate = ({ isoStr, config }: { isoStr: string, config: any }) => {
    if (!isoStr || !config) return null
    const d = new Date(isoStr)
    const dia = String(d.getUTCDate()).padStart(2, '0')
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
    const ano = String(d.getUTCFullYear()).slice(-2)
    const hora = String(d.getUTCHours()).padStart(2, '0')
    const min = String(d.getUTCMinutes()).padStart(2, '0')

    return (
      <>
        <RenderField value={dia} config={config.dia} />
        <RenderField value={mes} config={config.mes} />
        <RenderField value={ano} config={config.ano} />
        {config.hora && <RenderField value={hora} config={config.hora} />}
        {config.min && <RenderField value={min} config={config.min} />}
      </>
    )
  }

  // --- LOADING E ERRO ---
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="text-gray-500 font-medium">Gerando impressão...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 text-red-600">
        <AlertTriangle className="h-10 w-10" />
        <h1 className="text-xl font-bold">Erro na Impressão</h1>
        <p>{error}</p>
        <button 
          onClick={() => window.close()}
          className="rounded bg-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-300"
        >
          Fechar Janela
        </button>
      </div>
    )
  }

  if (!data) return null

  // Formatador de Dinheiro
  const fmtMoney = (val: number) => val?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  return (
    <div className="print-container w-[210mm] h-[297mm] relative overflow-hidden bg-white text-black">
      {/* DICA: Se quiser ver onde estão os campos durante o desenvolvimento, 
        adicione 'border border-red-500' na div acima ou coloque uma imagem de fundo 
        com a foto do recibo escaneado:
        style={{ backgroundImage: 'url(/gabarito-recibo.jpg)', backgroundSize: 'cover' }}
      */}

      {/* === 1. CABEÇALHO === */}
      <RenderField value={data.os_numero} config={PRINT_CONFIG.os_numero} />
      <RenderField value={data.cliente_nome} config={PRINT_CONFIG.cliente_nome} />
      <RenderField value={data.cliente_fone} config={PRINT_CONFIG.cliente_fone} />

      {/* === 2. DATAS === */}
      <RenderDate isoStr={data.data_emissao} config={PRINT_CONFIG.data_emissao} />
      <RenderDate isoStr={data.data_entrega} config={PRINT_CONFIG.data_entrega} />

      {/* === 3. FINANCEIRO === */}
      <RenderField value={fmtMoney(data.total_venda)} config={PRINT_CONFIG.total_venda} />
      <RenderField value={fmtMoney(data.valor_sinal)} config={PRINT_CONFIG.valor_sinal} />
      <RenderField value={fmtMoney(data.valor_restante)} config={PRINT_CONFIG.valor_restante} />
      
      {data.qtd_parcelas > 0 && (
        <>
          <RenderField value={data.qtd_parcelas} config={PRINT_CONFIG.qtd_parcelas} />
          <RenderField value={fmtMoney(data.valor_primeira_parcela)} config={PRINT_CONFIG.valor_primeira_parcela} />
        </>
      )}

      {/* === 4. DADOS TÉCNICOS (RECEITA) === */}
      <RenderField value={data.od_esf} config={PRINT_CONFIG.od_esf} />
      <RenderField value={data.od_cil} config={PRINT_CONFIG.od_cil} />
      <RenderField value={data.od_eixo} config={PRINT_CONFIG.od_eixo} />
      <RenderField value={data.od_dnp} config={PRINT_CONFIG.od_dnp} />

      <RenderField value={data.oe_esf} config={PRINT_CONFIG.oe_esf} />
      <RenderField value={data.oe_cil} config={PRINT_CONFIG.oe_cil} />
      <RenderField value={data.oe_eixo} config={PRINT_CONFIG.oe_eixo} />
      <RenderField value={data.oe_dnp} config={PRINT_CONFIG.oe_dnp} />

      <RenderField value={data.adicao} config={PRINT_CONFIG.adicao} />
      <RenderField value={data.altura} config={PRINT_CONFIG.altura} />
      <RenderField value={data.diametro} config={PRINT_CONFIG.diametro} />
      <RenderField value={data.laboratorio} config={PRINT_CONFIG.laboratorio} />

      {/* === 5. PRODUTOS === */}
      <RenderField value={data.desc_lente} config={PRINT_CONFIG.desc_lente} />
      {data.valor_lente > 0 && <RenderField value={fmtMoney(data.valor_lente)} config={PRINT_CONFIG.valor_lente} />}

      <RenderField value={data.desc_armacao} config={PRINT_CONFIG.desc_armacao} />
      {data.valor_armacao > 0 && <RenderField value={fmtMoney(data.valor_armacao)} config={PRINT_CONFIG.valor_armacao} />}

      {/* ESTILO GLOBAL DE IMPRESSÃO */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          body {
            background: white;
            -webkit-print-color-adjust: exact;
          }
          /* Oculta headers/footers do navegador se possível */
        }
      `}</style>
    </div>
  )
}