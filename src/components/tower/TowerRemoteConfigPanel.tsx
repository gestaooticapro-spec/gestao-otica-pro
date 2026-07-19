'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { Check, Loader2, MonitorCog, Save, ShoppingBag, Sparkles } from 'lucide-react'
import type { TowerRemoteConfig } from '@/lib/tower/remote-config'

type Props = {
  storeId: number
  publicCode: string
  initialConfig: TowerRemoteConfig
  compact?: boolean
}

type BooleanSection = 'experiences' | 'information' | 'interface' | 'catalog'

const experienceOptions: Array<[keyof TowerRemoteConfig['experiences'], string, string]> = [
  ['visagismo', 'Visagismo', 'Estilo, rosto e recomendação de armações.'],
  ['campoVisual', 'Campo Visual', 'Demonstração e comparação de campos das lentes.'],
  ['medidas', 'Medidas', 'Captura técnica guiada para a armação escolhida.'],
  ['informacoesUteis', 'Informações úteis', 'Conteúdos didáticos sobre lentes e tratamentos.'],
]

const informationOptions: Array<[keyof TowerRemoteConfig['information'], string]> = [
  ['seuJeitoDeOlhar', 'Seu Jeito de Olhar'],
  ['tratamentoAr', 'Tratamento AR'],
  ['optiFog', 'Opti Fog'],
  ['lentesPolarizadas', 'Lentes Polarizadas'],
  ['espessuraLentes', 'Espessura das Lentes'],
  ['comparativoCampos', 'Comparativo de Campos'],
]

export default function TowerRemoteConfigPanel({ storeId, publicCode, initialConfig, compact = false }: Props) {
  const [config, setConfig] = useState(initialConfig)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function setBoolean<S extends BooleanSection>(section: S, key: keyof TowerRemoteConfig[S], value: boolean) {
    setSaved(false)
    setConfig((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }))
  }

  function updateConfig(updater: (current: TowerRemoteConfig) => TowerRemoteConfig) {
    setSaved(false)
    setConfig(updater)
  }

  function publish() {
    setMessage(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tower/remote-config/${publicCode}/configuration`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        })
        const result = await response.json() as { success?: boolean; message?: string; config?: TowerRemoteConfig }
        setMessage(result.message || (response.ok ? 'Configuracao publicada.' : 'Nao foi possivel publicar.'))
        if (response.ok && result.success && result.config) {
          setConfig(result.config)
          setSaved(true)
        }
      } catch {
        setMessage('Sem comunicacao com o servidor.')
      }
    })
  }

  return (
    <section className={`rounded-3xl border border-cyan-300/15 bg-slate-900/80 ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-cyan-300"><MonitorCog className="h-4 w-4" /> Configuração remota</p>
          <h2 className="mt-2 text-xl font-black text-white">Experiência exibida na Torre</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">As alterações valem somente para a loja #{storeId}. A Torre aplica a nova versão ao atualizar a tela, sem novo pareamento.</p>
        </div>
        <button type="button" onClick={publish} disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {pending ? 'Publicando...' : saved ? 'Publicado' : 'Publicar na Torre'}
        </button>
      </div>

      {message && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${saved ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'}`}>{message}</div>}

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <ConfigGroup title="Experiências principais" icon={Sparkles}>
          <div className="grid gap-3 sm:grid-cols-2">
            {experienceOptions.map(([key, label, description]) => (
              <ToggleCard key={key} label={label} description={description} checked={config.experiences[key]} onChange={(value) => setBoolean('experiences', key, value)} />
            ))}
          </div>
        </ConfigGroup>

        <ConfigGroup title="Conteúdos de Informações úteis" icon={ShoppingBag}>
          <div className="grid gap-2 sm:grid-cols-2">
            {informationOptions.map(([key, label]) => (
              <ToggleCard key={key} label={label} checked={config.information[key]} onChange={(value) => setBoolean('information', key, value)} />
            ))}
          </div>
        </ConfigGroup>

        <ConfigGroup title="Apresentação comercial" icon={ShoppingBag}>
          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-[.12em] text-slate-400">Estratégia
              <select value={config.commercial.mode} onChange={(event) => updateConfig((current) => ({ ...current, commercial: { ...current.commercial, mode: event.target.value as 'consultive' | 'campaign' } }))} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white">
                <option value="consultive">Atendimento consultivo</option>
                <option value="campaign">Campanha ou oferta ativa</option>
              </select>
            </label>
            <TextField label="Título de abertura" value={config.commercial.headline} maxLength={100} onChange={(headline) => updateConfig((current) => ({ ...current, commercial: { ...current.commercial, headline } }))} />
            <TextField label="Texto de apoio" value={config.commercial.supportingText} maxLength={240} onChange={(supportingText) => updateConfig((current) => ({ ...current, commercial: { ...current.commercial, supportingText } }))} />
            <TextField label="Texto do botão principal" value={config.commercial.callToAction} maxLength={40} onChange={(callToAction) => updateConfig((current) => ({ ...current, commercial: { ...current.commercial, callToAction } }))} />
            {config.commercial.mode === 'campaign' && <TextField label="Oferta em destaque" value={config.commercial.offerText} maxLength={240} placeholder="Ex.: Consulte condicoes da campanha progressiva." onChange={(offerText) => updateConfig((current) => ({ ...current, commercial: { ...current.commercial, offerText } }))} />}
          </div>
        </ConfigGroup>

        <ConfigGroup title="Controles e catálogo" icon={MonitorCog}>
          <div className="space-y-3">
            <ToggleCard label="Continuar atendimento" description="Exibe o acesso a sessões abertas nesta loja." checked={config.interface.mostrarContinuarAtendimento} onChange={(value) => setBoolean('interface', 'mostrarContinuarAtendimento', value)} />
            <ToggleCard label="Configuracoes locais" description="Mantem o atalho protegido por PIN na Torre." checked={config.interface.mostrarConfiguracoes} onChange={(value) => setBoolean('interface', 'mostrarConfiguracoes', value)} />
            <ToggleCard label="Usar catálogo global" description="Permite que as experiências consultem o catálogo global já liberado para a loja." checked={config.catalog.useGlobalCatalog} onChange={(value) => setBoolean('catalog', 'useGlobalCatalog', value)} />
          </div>
        </ConfigGroup>
      </div>

      <p className="mt-5 text-xs text-slate-500">Versão {config.version}{config.updatedAt ? ` · publicada em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(config.updatedAt))}` : ' · usando configuração inicial'}</p>
    </section>
  )
}

function ConfigGroup({ title, icon: Icon, children }: { title: string; icon: typeof Sparkles; children: ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:p-5"><h3 className="mb-4 flex items-center gap-2 text-sm font-black text-white"><Icon className="h-4 w-4 text-cyan-300" />{title}</h3>{children}</div>
}

function ToggleCard({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[.03] p-3 transition hover:bg-white/[.06]"><span><span className="block text-sm font-bold text-white">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-cyan-300" /></label>
}

function TextField({ label, value, maxLength, placeholder, onChange }: { label: string; value: string; maxLength: number; placeholder?: string; onChange(value: string): void }) {
  return <label className="block text-xs font-bold uppercase tracking-[.12em] text-slate-400">{label}<textarea value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-300/50" /></label>
}
