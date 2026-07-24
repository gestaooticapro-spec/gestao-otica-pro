'use client'

type ServiceOrderPrintData = {
  os_id: number
  os_numero: string | number
  data_emissao: string
  data_entrega: string
  cliente_nome: string
  cliente_fone: string
  total_venda: number
  valor_sinal: number
  valor_restante: number
  qtd_parcelas: number
  valor_primeira_parcela: number
  desc_lente: string
  valor_lente: number
  desc_armacao: string
  valor_armacao: number
  od_esf: string
  od_cil: string
  od_eixo: string
  od_dnp: string
  oe_esf: string
  oe_cil: string
  oe_eixo: string
  oe_dnp: string
  adicao: string
  altura: string
  diametro: string
  laboratorio: string
  obs_os: string
  store: {
    name: string
    logo_url: string
    street: string
    number: string
    neighborhood: string
    city: string
    state: string
    phone: string
    whatsapp: string
  }
}

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

const date = (value?: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR')
}

function Field({ label, value, className = '' }: { label: string, value: string | number | null | undefined, className?: string }) {
  return (
    <div className={`os-half-field ${className}`}>
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === '' ? '—' : value}</strong>
    </div>
  )
}

function StoreHeader({ data }: { data: ServiceOrderPrintData }) {
  const address = [
    [data.store.street, data.store.number].filter(Boolean).join(', '),
    data.store.neighborhood,
    [data.store.city, data.store.state].filter(Boolean).join(' - ')
  ].filter(Boolean).join(' · ')
  const phones = [data.store.phone, data.store.whatsapp].filter(Boolean).join(' · ')

  return (
    <header className="os-half-store-header">
      {data.store.logo_url ? <img src={data.store.logo_url} alt="Logo da loja" /> : null}
      <div>
        <h1>{data.store.name || 'ÓTICA'}</h1>
        {address ? <p>{address}</p> : null}
        {phones ? <p>{phones}</p> : null}
      </div>
    </header>
  )
}

export function ServiceOrderHalfA4({ data }: { data: ServiceOrderPrintData }) {
  const orderNumber = data.os_numero || `OS ${data.os_id}`

  return (
    <div className="os-half-a4-page">
      <main className="os-half-a5-sheet">
        <section className="os-half-customer-copy">
          <StoreHeader data={data} />
          <div className="os-half-copy-title">
            <strong>VIA DO CLIENTE</strong>
            <span>OS {orderNumber}</span>
          </div>
          <div className="os-half-customer-grid">
            <Field label="Cliente" value={data.cliente_nome} className="wide" />
            <Field label="Emissão" value={date(data.data_emissao)} />
            <Field label="Entrega prevista" value={date(data.data_entrega)} />
            <Field label="Total" value={money(data.total_venda)} />
            <Field label="Sinal / entrada" value={money(data.valor_sinal)} />
            <Field label="Restante" value={money(data.valor_restante)} />
            {data.qtd_parcelas > 0 ? <Field label="Parcelas" value={`${data.qtd_parcelas}x de ${money(data.valor_primeira_parcela)}`} /> : null}
          </div>
        </section>

        <div className="os-half-cut-line"><span>CORTE — VIA DO CLIENTE / VIA DA LOJA</span></div>

        <section className="os-half-store-copy">
          <div className="os-half-copy-title store">
            <strong>VIA DA LOJA</strong>
            <span>OS {orderNumber}</span>
          </div>

          <div className="os-half-store-identification">
            <Field label="Cliente" value={data.cliente_nome} className="wide" />
            <Field label="Telefone" value={data.cliente_fone} />
            <Field label="Emissão" value={date(data.data_emissao)} />
            <Field label="Entrega prevista" value={date(data.data_entrega)} />
          </div>

          <div className="os-half-financial-grid">
            <Field label="Total" value={money(data.total_venda)} />
            <Field label="Sinal / entrada" value={money(data.valor_sinal)} />
            <Field label="Restante" value={money(data.valor_restante)} />
            <Field label="Parcelas" value={data.qtd_parcelas > 0 ? `${data.qtd_parcelas}x de ${money(data.valor_primeira_parcela)}` : 'À vista'} />
          </div>

          <div className="os-half-section-title">Receita e medidas</div>
          <div className="os-half-recipe-grid">
            <div className="os-half-eye-label">OD</div>
            <Field label="Esf." value={data.od_esf} />
            <Field label="Cil." value={data.od_cil} />
            <Field label="Eixo" value={data.od_eixo} />
            <Field label="DNP" value={data.od_dnp} />
            <div className="os-half-eye-label">OE</div>
            <Field label="Esf." value={data.oe_esf} />
            <Field label="Cil." value={data.oe_cil} />
            <Field label="Eixo" value={data.oe_eixo} />
            <Field label="DNP" value={data.oe_dnp} />
          </div>
          <div className="os-half-measures-grid">
            <Field label="Adição" value={data.adicao} />
            <Field label="Altura" value={data.altura} />
            <Field label="Diâmetro" value={data.diametro} />
            <Field label="Laboratório" value={data.laboratorio} />
          </div>

          <div className="os-half-section-title">Produtos e observações</div>
          <div className="os-half-products-grid">
            <Field label="Lente" value={data.desc_lente} className="wide" />
            <Field label="Valor lente" value={data.valor_lente > 0 ? money(data.valor_lente) : '—'} />
            <Field label="Armação" value={data.desc_armacao} className="wide" />
            <Field label="Valor armação" value={data.valor_armacao > 0 ? money(data.valor_armacao) : '—'} />
          </div>
          <Field label="Observações" value={data.obs_os} className="os-half-observation" />
        </section>
      </main>
      <div className="os-half-a4-cut-guide" aria-hidden="true" />

      <style jsx global>{`
        /* A margem é desenhada no layout para funcionar mesmo com “Margens: nenhuma” no navegador. */
        @page { size: A4 landscape; margin: 0; }
        @media print {
          html, body { width: 297mm; height: 210mm; margin: 0; padding: 0; background: white; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .os-half-a4-page {
          position: relative; width: 277mm; height: 190mm; margin: 10mm; background: #fff; color: #111;
          font-family: Arial, Helvetica, sans-serif; box-sizing: border-box;
        }
        .os-half-a5-sheet {
          /* Ocupa a metade direita do A4; a metade esquerda sobra como A5 reutilizavel. */
          position: absolute; left: 141.5mm; top: 0; width: 130.5mm; height: 190mm;
          box-sizing: border-box; border: 0; overflow: hidden;
        }
        .os-half-a4-cut-guide {
          /* 138,5 mm + a margem esquerda de 10 mm = centro físico do A4 (148,5 mm). */
          position: absolute; left: 138.5mm; top: 0; height: 190mm; border-left: .25mm dashed #777;
        }
        .os-half-customer-copy { height: 66.5mm; box-sizing: border-box; padding: 3mm 4mm 2mm; }
        .os-half-store-copy { height: 123.5mm; box-sizing: border-box; padding: 2.5mm 4mm 3mm; }
        .os-half-store-header { display: flex; align-items: center; gap: 2.5mm; min-height: 13mm; }
        .os-half-store-header img { width: 15mm; height: 11mm; object-fit: contain; }
        .os-half-store-header h1 { margin: 0; font-size: 9pt; line-height: 1.05; text-transform: uppercase; }
        .os-half-store-header p { margin: .5mm 0 0; font-size: 6pt; line-height: 1.1; }
        .os-half-copy-title { display: flex; justify-content: space-between; align-items: center; border-top: .3mm solid #111; border-bottom: .3mm solid #111; margin-top: 1.4mm; padding: 1mm 0; font-size: 6.5pt; letter-spacing: .08em; }
        .os-half-copy-title span { font-size: 8pt; font-weight: 800; letter-spacing: 0; }
        .os-half-copy-title.store { margin-top: 0; background: #f1f1f1; padding: 1.3mm 2mm; }
        .os-half-customer-grid, .os-half-store-identification, .os-half-financial-grid, .os-half-measures-grid, .os-half-products-grid { display: grid; gap: 1.3mm 2mm; margin-top: 2mm; }
        .os-half-customer-grid { grid-template-columns: repeat(3, 1fr); }
        .os-half-store-identification { grid-template-columns: 2fr 1fr 1fr; }
        .os-half-financial-grid { grid-template-columns: repeat(4, 1fr); }
        .os-half-measures-grid { grid-template-columns: repeat(4, 1fr); }
        .os-half-products-grid { grid-template-columns: 2fr 1fr; }
        .os-half-field { min-width: 0; border-bottom: .2mm solid #aaa; padding-bottom: .6mm; display: flex; flex-direction: column; gap: .4mm; }
        .os-half-field span { color: #555; font-size: 5.7pt; font-weight: 700; line-height: 1; text-transform: uppercase; }
        .os-half-field strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 6.8pt; line-height: 1.1; }
        .os-half-field.wide { grid-column: span 2; }
        .os-half-section-title { margin-top: 2mm; padding-bottom: .7mm; border-bottom: .25mm solid #111; font-size: 6.3pt; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
        .os-half-recipe-grid { display: grid; grid-template-columns: 6mm repeat(4, 1fr); gap: 1mm 1.5mm; margin-top: 1.5mm; align-items: end; }
        .os-half-eye-label { align-self: end; font-size: 7pt; font-weight: 900; padding-bottom: 1.2mm; }
        .os-half-recipe-grid .os-half-field { padding-bottom: .5mm; }
        .os-half-observation { margin-top: 2mm; min-height: 9mm; }
        .os-half-observation strong { white-space: normal; overflow: hidden; text-overflow: initial; line-height: 1.25; }
        .os-half-cut-line { height: 0; border-top: .3mm dashed #555; position: relative; margin: 0 2mm; }
        .os-half-cut-line span { position: absolute; left: 50%; top: -2.2mm; transform: translateX(-50%); background: #fff; padding: 0 1.5mm; color: #666; font-size: 5pt; white-space: nowrap; }
      `}</style>
    </div>
  )
}
