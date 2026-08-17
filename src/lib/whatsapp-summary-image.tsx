import React from 'react'
import { ImageResponse } from 'next/og'
import { loadStoreLogoDataUrl } from '@/lib/store-logo.server'
import type {
  CustomerFinancialSummaryPdfData,
  CustomerPrescriptionSummaryPdfData,
  InstallmentReceiptData,
} from '@/lib/pdf-generator'

function formatDateBR(dateStr: string) {
  if (!dateStr) return ''
  if (dateStr.length === 10 && dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  return new Date(dateStr).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
  })
}

function formatMoneyBR(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatPhoneBR(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return String(value || '').trim()
}

function formatCepBR(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  return String(value || '').trim()
}

function buildStoreAddress(store: InstallmentReceiptData['store']) {
  const firstLine = [store.street, store.number].filter(Boolean).join(', ')
  const secondLine = [
    store.neighborhood,
    [store.city, store.state].filter(Boolean).join('/'),
    formatCepBR(store.cep),
  ].filter(Boolean).join(' - ')

  return [firstLine, secondLine].filter(Boolean)
}

async function imageResponseToBuffer(element: React.ReactElement, width: number, height: number) {
  const response = new ImageResponse(element, {
    width,
    height,
  })

  return Buffer.from(await response.arrayBuffer())
}

type StoreHeaderProps = {
  title: string
  subtitle: string
  store: InstallmentReceiptData['store']
  logoDataUrl: string | null
}

function StoreHeader({ title, subtitle, store, logoDataUrl }: StoreHeaderProps) {
  const identity = store.legalName && store.legalName !== store.name ? store.legalName : null
  const address = buildStoreAddress(store).join(' | ')
  const contacts = [formatPhoneBR(store.whatsapp), formatPhoneBR(store.phone)].filter(Boolean).join(' | ')

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        background: '#0f172a',
        color: '#ffffff',
        borderRadius: 28,
        padding: '28px 32px',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flex: 1 }}>
        {logoDataUrl ? (
          <div
            style={{
              display: 'flex',
              width: 92,
              height: 92,
              background: '#ffffff',
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img src={logoDataUrl} alt="Logo" style={{ maxWidth: 72, maxHeight: 72, objectFit: 'contain' }} />
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <div style={{ fontSize: 38, fontWeight: 700 }}>{store.name || title}</div>
          {identity ? <div style={{ fontSize: 20, opacity: 0.92 }}>{identity}</div> : null}
          {address ? <div style={{ fontSize: 18, opacity: 0.84 }}>{address}</div> : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', maxWidth: 380 }}>
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: 'right' }}>{title}</div>
        <div style={{ fontSize: 18, opacity: 0.92, textAlign: 'right' }}>{subtitle}</div>
        {contacts ? <div style={{ fontSize: 18, opacity: 0.84, textAlign: 'right' }}>{contacts}</div> : null}
        {store.email ? <div style={{ fontSize: 16, opacity: 0.8, textAlign: 'right' }}>{store.email}</div> : null}
      </div>
    </div>
  )
}

type CompactStoreHeaderProps = {
  title: string
  subtitle: string
  store: InstallmentReceiptData['store']
  pageLabel: string
}

function CompactStoreHeader({ title, subtitle, store, pageLabel }: CompactStoreHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#0f172a',
        color: '#ffffff',
        borderRadius: 24,
        padding: '20px 26px',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{store.name || title}</div>
        <div style={{ fontSize: 16, opacity: 0.86 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'right' }}>{title}</div>
        <div style={{ fontSize: 16, opacity: 0.82, textAlign: 'right' }}>{pageLabel}</div>
      </div>
    </div>
  )
}

export async function generateCustomerFinancialSummaryImage(data: CustomerFinancialSummaryPdfData): Promise<Buffer> {
  const images = await generateCustomerFinancialSummaryImages(data)
  return images[0]
}

export async function generateCustomerFinancialSummaryImages(data: CustomerFinancialSummaryPdfData): Promise<Buffer[]> {
  const generatedAt = new Date().toLocaleDateString('pt-BR')
  const logoDataUrl = await loadStoreLogoDataUrl(data.store.logoFile)
  const width = 1400
  // A imagem cresce para acomodar os carnês mais comuns sem fragmentar a
  // conversa no WhatsApp. Acima de seis parcelas mantemos a paginação para
  // não produzir imagens excessivamente altas.
  const maxRowsPerPage = 6
  const chunks = data.financiamentos.flatMap((financiamento) => {
    const pages = []
    for (let index = 0; index < financiamento.parcelas.length; index += maxRowsPerPage) {
      pages.push({
        financiamento,
        parcelas: financiamento.parcelas.slice(index, index + maxRowsPerPage),
      })
    }
    return pages
  })

  const totalPages = Math.max(1, chunks.length)
  const renderPage = async (pageIndex: number) => {
    const chunk = chunks[pageIndex]
    const includeSummary = pageIndex === 0
    const headerHeight = includeSummary ? 290 : 100
    const height = Math.max(920, headerHeight + 170 + (chunk.parcelas.length * 98))

    return imageResponseToBuffer(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(180deg, #e2e8f0 0%, #f8fafc 16%, #ffffff 100%)',
            fontFamily: 'Arial, sans-serif',
            padding: 36,
            color: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 24 }}>
            {includeSummary ? (
              <StoreHeader
                title="Resumo financeiro"
                subtitle={`${data.customerName} | Emitido em ${generatedAt}`}
                store={data.store}
                logoDataUrl={logoDataUrl}
              />
            ) : (
              <CompactStoreHeader
                title="Resumo financeiro"
                subtitle={`${data.customerName} | Emitido em ${generatedAt}`}
                store={data.store}
                pageLabel={`Pagina ${pageIndex + 1} de ${totalPages}`}
              />
            )}

            {includeSummary ? (
              <div style={{ display: 'flex', gap: 18, width: '100%' }}>
                <div style={{ display: 'flex', flex: 1, background: '#ffffff', borderRadius: 24, padding: 22, border: '2px solid #dbeafe', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 18, color: '#64748b' }}>Total financiado</div>
                  <div style={{ fontSize: 34, fontWeight: 700 }}>{formatMoneyBR(data.totals.valorTotalFinanciado)}</div>
                </div>
                <div style={{ display: 'flex', flex: 1, background: '#eff6ff', borderRadius: 24, padding: 22, border: '2px solid #bfdbfe', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 18, color: '#1d4ed8' }}>Pago</div>
                  <div style={{ fontSize: 34, fontWeight: 700, color: '#1e3a8a' }}>
                    {`${data.totals.parcelasPagas}/${data.totals.totalParcelas} parcelas | ${formatMoneyBR(data.totals.valorPago)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', flex: 1, background: '#fff7ed', borderRadius: 24, padding: 22, border: '2px solid #fed7aa', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 18, color: '#c2410c' }}>Em aberto</div>
                  <div style={{ fontSize: 34, fontWeight: 700, color: '#9a3412' }}>
                    {`${data.totals.parcelasPendentes} parcelas | ${formatMoneyBR(data.totals.valorRestante)}`}
                  </div>
                  {data.nextDue?.data ? (
                    <div style={{ fontSize: 18, color: '#7c2d12' }}>
                      {`Proximo vencimento: parcela ${data.nextDue.numeroParcela} em ${formatDateBR(data.nextDue.data)} (${formatMoneyBR(data.nextDue.valor)})`}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {(() => {
                const financiamento = chunk.financiamento
              const totalPagoVenda = financiamento.parcelas.reduce((sum, parcela) => {
                const isPago = String(parcela.status || '').toLowerCase() === 'pago'
                return sum + (isPago ? (parcela.valorPago || parcela.valor) : 0)
              }, 0)
              const totalPendenteVenda = financiamento.parcelas.reduce((sum, parcela) => {
                const isPago = String(parcela.status || '').toLowerCase() === 'pago'
                return sum + (isPago ? 0 : parcela.valor)
              }, 0)

                return (
                <div
                  key={financiamento.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 24,
                    padding: 22,
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 28, fontWeight: 700 }}>{`Venda #${financiamento.vendaId}`}</div>
                      <div style={{ fontSize: 18, color: '#475569' }}>{`Data da venda: ${formatDateBR(financiamento.dataVenda)}`}</div>
                      {financiamento.dependenteNames.length > 0 ? (
                        <div style={{ fontSize: 18, color: '#475569' }}>
                          {`Dependente(s): ${financiamento.dependenteNames.join(', ')}`}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ fontSize: 18, color: '#64748b' }}>Total da venda</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{formatMoneyBR(financiamento.valorFinanciado)}</div>
                      <div style={{ fontSize: 18, color: '#16a34a' }}>{`Pago: ${formatMoneyBR(totalPagoVenda)}`}</div>
                      <div style={{ fontSize: 18, color: '#ea580c' }}>{`Pendente: ${formatMoneyBR(totalPendenteVenda)}`}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', background: '#eff6ff', padding: '12px 14px', fontSize: 17, fontWeight: 700, color: '#1e3a8a' }}>
                      <div style={{ width: 70 }}>N</div>
                      <div style={{ width: 180 }}>Vencimento</div>
                      <div style={{ width: 200 }}>Valor</div>
                      <div style={{ width: 200 }}>Pago em</div>
                      <div style={{ width: 200 }}>Valor pago</div>
                      <div style={{ flex: 1 }}>Status</div>
                    </div>
                    {chunk.parcelas.map((parcela) => {
                      const isPago = String(parcela.status || '').toLowerCase() === 'pago'
                      const valorPago = isPago ? (parcela.valorPago || parcela.valor) : 0
                      return (
                        <div
                          key={`${financiamento.id}-${parcela.numeroParcela}-${parcela.dataVencimento}`}
                          style={{
                            display: 'flex',
                            padding: '12px 14px',
                            fontSize: 18,
                            color: '#334155',
                            background: isPago ? '#f8fafc' : '#fff7ed',
                            borderTop: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ width: 70 }}>{String(parcela.numeroParcela)}</div>
                          <div style={{ width: 180 }}>{formatDateBR(parcela.dataVencimento)}</div>
                          <div style={{ width: 200 }}>{formatMoneyBR(parcela.valor)}</div>
                          <div style={{ width: 200 }}>{parcela.dataPagamento ? formatDateBR(parcela.dataPagamento) : '-'}</div>
                          <div style={{ width: 200 }}>{isPago ? formatMoneyBR(valorPago) : '-'}</div>
                          <div style={{ flex: 1, fontWeight: 700, color: isPago ? '#15803d' : '#c2410c' }}>
                            {isPago ? 'Pago' : 'Pendente'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                )
              })()}
            </div>
          </div>
        </div>
      ),
      width,
      height
    )
  }

  return Promise.all(Array.from({ length: totalPages }, (_, index) => renderPage(index)))
}

export async function generateCustomerPrescriptionSummaryImage(data: CustomerPrescriptionSummaryPdfData): Promise<Buffer> {
  const generatedAt = new Date().toLocaleDateString('pt-BR')
  const logoDataUrl = await loadStoreLogoDataUrl(data.store.logoFile)
  const width = 1400
  const height = Math.max(820, 310 + (data.prescriptions.length * 190))

  return imageResponseToBuffer(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, #dbeafe 0%, #eff6ff 18%, #f8fafc 100%)',
          fontFamily: 'Arial, sans-serif',
          padding: 36,
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 24 }}>
          <StoreHeader
            title="Resumo de receitas"
            subtitle={`${data.customerName} | Emitido em ${generatedAt}`}
            store={data.store}
            logoDataUrl={logoDataUrl}
          />

          <div style={{ display: 'flex', background: '#ffffff', borderRadius: 24, padding: 24, border: '2px solid #bfdbfe', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 20, color: '#1d4ed8', fontWeight: 700 }}>Paciente</div>
            <div style={{ fontSize: 34, fontWeight: 700 }}>{data.subjectLabel}</div>
            <div style={{ fontSize: 18, color: '#475569' }}>Ultimos graus registrados no historico da loja.</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {data.prescriptions.map((rx) => {
              const hasPerto = Boolean(
                rx.pertoOdEsf || rx.pertoOdCil || rx.pertoOdEixo || rx.pertoOeEsf || rx.pertoOeCil || rx.pertoOeEixo
              )
              const hasAdicao = Boolean(rx.adicao)

              return (
                <div
                  key={rx.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 24,
                    padding: 22,
                    gap: 18,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{formatDateBR(rx.dataCompra)}</div>
                    {rx.medico ? <div style={{ fontSize: 18, color: '#475569' }}>{`Medico: ${rx.medico}`}</div> : null}
                  </div>

                  <div style={{ display: 'flex', gap: 18 }}>
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', background: '#eff6ff', borderRadius: 20, padding: 18, gap: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a' }}>Longe - OD</div>
                      <div style={{ fontSize: 20 }}>{`Esf ${rx.longeOdEsf || '-'}`}</div>
                      <div style={{ fontSize: 20 }}>{`Cil ${rx.longeOdCil || '-'}`}</div>
                      <div style={{ fontSize: 20 }}>{`Eixo ${rx.longeOdEixo || '-'}`}</div>
                    </div>
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', background: '#eff6ff', borderRadius: 20, padding: 18, gap: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a' }}>Longe - OE</div>
                      <div style={{ fontSize: 20 }}>{`Esf ${rx.longeOeEsf || '-'}`}</div>
                      <div style={{ fontSize: 20 }}>{`Cil ${rx.longeOeCil || '-'}`}</div>
                      <div style={{ fontSize: 20 }}>{`Eixo ${rx.longeOeEixo || '-'}`}</div>
                    </div>
                  </div>

                  {hasPerto ? (
                    <div style={{ display: 'flex', gap: 18 }}>
                      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', background: '#f8fafc', borderRadius: 20, padding: 18, gap: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#334155' }}>Perto - OD</div>
                        <div style={{ fontSize: 20 }}>{`Esf ${rx.pertoOdEsf || '-'}`}</div>
                        <div style={{ fontSize: 20 }}>{`Cil ${rx.pertoOdCil || '-'}`}</div>
                        <div style={{ fontSize: 20 }}>{`Eixo ${rx.pertoOdEixo || '-'}`}</div>
                      </div>
                      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', background: '#f8fafc', borderRadius: 20, padding: 18, gap: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#334155' }}>Perto - OE</div>
                        <div style={{ fontSize: 20 }}>{`Esf ${rx.pertoOeEsf || '-'}`}</div>
                        <div style={{ fontSize: 20 }}>{`Cil ${rx.pertoOeCil || '-'}`}</div>
                        <div style={{ fontSize: 20 }}>{`Eixo ${rx.pertoOeEixo || '-'}`}</div>
                      </div>
                    </div>
                  ) : null}

                  {hasAdicao ? (
                    <div
                      style={{
                        display: 'flex',
                        alignSelf: 'flex-start',
                        background: '#fef3c7',
                        color: '#92400e',
                        borderRadius: 999,
                        padding: '10px 16px',
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      {`Adicao: ${rx.adicao}`}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    ),
    width,
    height
  )
}
