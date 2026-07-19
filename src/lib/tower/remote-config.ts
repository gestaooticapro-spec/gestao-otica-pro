import { z } from 'zod'

export const TOWER_REMOTE_CONFIG_VERSION = 1 as const

export type TowerRemoteConfig = {
  version: typeof TOWER_REMOTE_CONFIG_VERSION
  updatedAt: string | null
  experiences: {
    visagismo: boolean
    campoVisual: boolean
    medidas: boolean
    informacoesUteis: boolean
  }
  information: {
    seuJeitoDeOlhar: boolean
    tratamentoAr: boolean
    optiFog: boolean
    lentesPolarizadas: boolean
    espessuraLentes: boolean
    comparativoCampos: boolean
  }
  interface: {
    mostrarContinuarAtendimento: boolean
    mostrarConfiguracoes: boolean
  }
  commercial: {
    mode: 'consultive' | 'campaign'
    headline: string
    supportingText: string
    offerText: string
    callToAction: string
  }
  catalog: {
    useGlobalCatalog: boolean
  }
}

export const towerRemoteConfigSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime().nullable(),
  experiences: z.object({
    visagismo: z.boolean(),
    campoVisual: z.boolean(),
    medidas: z.boolean(),
    informacoesUteis: z.boolean(),
  }),
  information: z.object({
    seuJeitoDeOlhar: z.boolean(),
    tratamentoAr: z.boolean(),
    optiFog: z.boolean(),
    lentesPolarizadas: z.boolean(),
    espessuraLentes: z.boolean(),
    comparativoCampos: z.boolean(),
  }),
  interface: z.object({
    mostrarContinuarAtendimento: z.boolean(),
    mostrarConfiguracoes: z.boolean(),
  }),
  commercial: z.object({
    mode: z.enum(['consultive', 'campaign']),
    headline: z.string().trim().min(3).max(100),
    supportingText: z.string().trim().min(3).max(240),
    offerText: z.string().trim().max(240),
    callToAction: z.string().trim().min(2).max(40),
  }),
  catalog: z.object({ useGlobalCatalog: z.boolean() }),
}).strict()

export const DEFAULT_TOWER_REMOTE_CONFIG: TowerRemoteConfig = {
  version: TOWER_REMOTE_CONFIG_VERSION,
  updatedAt: null,
  experiences: {
    visagismo: true,
    campoVisual: true,
    medidas: true,
    informacoesUteis: true,
  },
  information: {
    seuJeitoDeOlhar: true,
    tratamentoAr: true,
    optiFog: true,
    lentesPolarizadas: true,
    espessuraLentes: true,
    comparativoCampos: true,
  },
  interface: {
    mostrarContinuarAtendimento: true,
    mostrarConfiguracoes: true,
  },
  commercial: {
    mode: 'consultive',
    headline: 'Vamos iniciar uma nova experiência?',
    supportingText: 'Escolha como deseja começar. A identificação do cliente pode ficar para depois.',
    offerText: '',
    callToAction: 'Novo atendimento',
  },
  catalog: {
    useGlobalCatalog: true,
  },
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function text(value: unknown, fallback: string, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback
}

export function normalizeTowerRemoteConfig(settings: unknown): TowerRemoteConfig {
  const root = record(settings)
  const legacyExperiences = record(root.tower_experiences)
  const raw = record(root.tower_remote_config)
  const experiences = record(raw.experiences)
  const information = record(raw.information)
  const interfaceConfig = record(raw.interface)
  const commercial = record(raw.commercial)
  const catalog = record(raw.catalog)
  const defaults = DEFAULT_TOWER_REMOTE_CONFIG

  return {
    version: TOWER_REMOTE_CONFIG_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    experiences: {
      visagismo: bool(experiences.visagismo, bool(legacyExperiences.visagismo, defaults.experiences.visagismo)),
      campoVisual: bool(experiences.campoVisual, bool(legacyExperiences.campo_visual, defaults.experiences.campoVisual)),
      medidas: bool(experiences.medidas, bool(legacyExperiences.medidas, defaults.experiences.medidas)),
      informacoesUteis: bool(experiences.informacoesUteis, bool(legacyExperiences.informacoes_uteis, defaults.experiences.informacoesUteis)),
    },
    information: {
      seuJeitoDeOlhar: bool(information.seuJeitoDeOlhar, defaults.information.seuJeitoDeOlhar),
      tratamentoAr: bool(information.tratamentoAr, defaults.information.tratamentoAr),
      optiFog: bool(information.optiFog, defaults.information.optiFog),
      lentesPolarizadas: bool(information.lentesPolarizadas, defaults.information.lentesPolarizadas),
      espessuraLentes: bool(information.espessuraLentes, defaults.information.espessuraLentes),
      comparativoCampos: bool(information.comparativoCampos, defaults.information.comparativoCampos),
    },
    interface: {
      mostrarContinuarAtendimento: bool(interfaceConfig.mostrarContinuarAtendimento, defaults.interface.mostrarContinuarAtendimento),
      mostrarConfiguracoes: bool(interfaceConfig.mostrarConfiguracoes, defaults.interface.mostrarConfiguracoes),
    },
    commercial: {
      mode: commercial.mode === 'campaign' ? 'campaign' : 'consultive',
      headline: text(commercial.headline, defaults.commercial.headline, 100),
      supportingText: text(commercial.supportingText, defaults.commercial.supportingText, 240),
      offerText: text(commercial.offerText, defaults.commercial.offerText, 240),
      callToAction: text(commercial.callToAction, defaults.commercial.callToAction, 40),
    },
    catalog: {
      useGlobalCatalog: bool(catalog.useGlobalCatalog, defaults.catalog.useGlobalCatalog),
    },
  }
}

export function towerRemoteConfigForStorage(config: TowerRemoteConfig): TowerRemoteConfig {
  return normalizeTowerRemoteConfig({
    tower_remote_config: {
      ...config,
      version: TOWER_REMOTE_CONFIG_VERSION,
      updatedAt: config.updatedAt,
    },
  })
}
