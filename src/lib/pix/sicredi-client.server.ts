import { readFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { resolve } from 'node:path'

const DEFAULT_HML_BASE_URL = 'https://api-pix-h.sicredi.com.br'
const DEFAULT_CERT_PATH = '.sicredicharles/23758870000120.cer'
const DEFAULT_KEY_PATH = '.sicredicharles/api-pix-oticaocular (3).key'
const DEFAULT_CA_PATH = '.sicredicharles/CadeiaCompletaSicredi 1.cer'
const REQUEST_TIMEOUT_MS = 15_000
const TOKEN_EXPIRY_SAFETY_SECONDS = 30

export type SicrediPixToken = {
  accessToken: string
  tokenType: string
  expiresIn: number
  scope: string
  expiresAt: number
}

type SicrediTokenResponse = {
  access_token?: unknown
  token_type?: unknown
  expires_in?: unknown
  scope?: unknown
}

type SicrediPixConfig = {
  baseUrl: URL
  clientId: string
  clientSecret: string
  certificate: Buffer
  privateKey: Buffer
  certificateChain: Buffer
  keyPassphrase?: string
}

type SicrediCobResponse = {
  txid?: unknown
  status?: unknown
  calendario?: {
    criacao?: unknown
    expiracao?: unknown
  }
  location?: unknown
  loc?: {
    id?: unknown
    location?: unknown
  }
  pixCopiaECola?: unknown
}

export class SicrediPixHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'SicrediPixHttpError'
  }
}

export type SicrediImmediateCharge = {
  txid: string
  status: string
  pixCopyPaste: string | null
  location: string | null
  createdAt: string | null
  expirationSeconds: number | null
  raw: Record<string, unknown>
}

let cachedToken: SicrediPixToken | null = null

function required(value: string | undefined, label: string) {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`Configuracao Sicredi ausente: ${label}`)
  return normalized
}

function readSecretFile(pathValue: string | undefined, fallback: string, envLabel: string) {
  const filePath = resolve(process.cwd(), pathValue?.trim() || fallback)
  try {
    return readFileSync(filePath)
  } catch {
    throw new Error(`Nao foi possivel ler o arquivo configurado em ${envLabel}.`)
  }
}

function getSicrediPixConfig(): SicrediPixConfig {
  const configuredBaseUrl = process.env.SICREDI_PIX_HML_BASE_URL?.trim()
  if (configuredBaseUrl) {
    const normalizedConfiguredUrl = configuredBaseUrl.replace(/\/+$/, '')
    if (normalizedConfiguredUrl !== DEFAULT_HML_BASE_URL) {
      throw new Error('A integracao Pix Sicredi desta versao aceita somente o ambiente de homologacao oficial.')
    }
  }

  return {
    baseUrl: new URL(DEFAULT_HML_BASE_URL),
    clientId: required(process.env.SICREDI_PIX_HML_CLIENT_ID, 'SICREDI_PIX_HML_CLIENT_ID'),
    clientSecret: required(process.env.SICREDI_PIX_HML_CLIENT_SECRET, 'SICREDI_PIX_HML_CLIENT_SECRET'),
    certificate: readSecretFile(process.env.SICREDI_PIX_CERT_PATH, DEFAULT_CERT_PATH, 'SICREDI_PIX_CERT_PATH'),
    privateKey: readSecretFile(process.env.SICREDI_PIX_KEY_PATH, DEFAULT_KEY_PATH, 'SICREDI_PIX_KEY_PATH'),
    certificateChain: readSecretFile(process.env.SICREDI_PIX_CA_PATH, DEFAULT_CA_PATH, 'SICREDI_PIX_CA_PATH'),
    keyPassphrase: process.env.SICREDI_PIX_KEY_PASSPHRASE?.trim() || undefined,
  }
}

function parseTokenResponse(payload: string): SicrediPixToken {
  let parsed: SicrediTokenResponse
  try {
    parsed = JSON.parse(payload) as SicrediTokenResponse
  } catch {
    throw new Error('O Sicredi retornou uma resposta invalida ao gerar o token.')
  }

  if (typeof parsed.access_token !== 'string' || !parsed.access_token) {
    throw new Error('O Sicredi nao retornou access_token.')
  }

  const expiresIn = Number(parsed.expires_in)
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('O Sicredi retornou expires_in invalido.')
  }

  return {
    accessToken: parsed.access_token,
    tokenType: typeof parsed.token_type === 'string' ? parsed.token_type : 'Bearer',
    expiresIn,
    scope: typeof parsed.scope === 'string' ? parsed.scope : '',
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

function requestToken(config: SicrediPixConfig): Promise<SicrediPixToken> {
  const endpoint = new URL('/oauth/token', config.baseUrl)
  endpoint.searchParams.set('grant_type', 'client_credentials')
  const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      cert: Buffer.concat([config.certificate, Buffer.from('\n'), config.certificateChain]),
      key: config.privateKey,
      passphrase: config.keyPassphrase,
      rejectUnauthorized: true,
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const payload = Buffer.concat(chunks).toString('utf8')
        const status = response.statusCode || 0
        if (status < 200 || status >= 300) {
          const safePayload = payload.slice(0, 500).replace(/[\r\n]+/g, ' ')
          reject(new Error(`Falha ao autenticar no Sicredi (HTTP ${status}): ${safePayload || 'sem detalhes'}`))
          return
        }

        try {
          resolvePromise(parseTokenResponse(payload))
        } catch (error) {
          reject(error)
        }
      })
    })

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Tempo limite excedido ao autenticar na API Pix Sicredi.'))
    })
    request.on('error', (error) => reject(new Error(`Falha de conexao mTLS com o Sicredi: ${error.message}`)))
    request.end()
  })
}

async function requestSicrediJson<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  pathname: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const config = getSicrediPixConfig()
  const token = await getSicrediPixAccessToken()
  const endpoint = new URL(pathname, config.baseUrl)
  const serializedBody = body ? JSON.stringify(body) : undefined

  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method,
      cert: Buffer.concat([config.certificate, Buffer.from('\n'), config.certificateChain]),
      key: config.privateKey,
      passphrase: config.keyPassphrase,
      rejectUnauthorized: true,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
        ...(serializedBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serializedBody) } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const payload = Buffer.concat(chunks).toString('utf8')
        const status = response.statusCode || 0
        if (status < 200 || status >= 300) {
          const safePayload = payload.slice(0, 500).replace(/[\r\n]+/g, ' ')
          reject(new SicrediPixHttpError(status, `Falha na API Pix Sicredi (HTTP ${status}): ${safePayload || 'sem detalhes'}`))
          return
        }

        try {
          resolvePromise((payload ? JSON.parse(payload) : {}) as T)
        } catch {
          reject(new Error('O Sicredi retornou uma resposta invalida para a cobrança Pix.'))
        }
      })
    })

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Tempo limite excedido na API Pix Sicredi.'))
    })
    request.on('error', (error) => reject(new Error(`Falha de conexao mTLS com o Sicredi: ${error.message}`)))
    if (serializedBody) request.write(serializedBody)
    request.end()
  })
}

function parseImmediateCharge(response: SicrediCobResponse): SicrediImmediateCharge {
  if (typeof response.txid !== 'string' || !response.txid.trim()) {
    throw new Error('O Sicredi nao retornou o txid da cobrança Pix.')
  }

  const raw = response as Record<string, unknown>
  return {
    txid: response.txid,
    status: typeof response.status === 'string' ? response.status : 'ATIVA',
    pixCopyPaste: typeof response.pixCopiaECola === 'string' ? response.pixCopiaECola : null,
    location: typeof response.location === 'string'
      ? response.location
      : typeof response.loc?.location === 'string'
        ? response.loc.location
        : null,
    createdAt: typeof response.calendario?.criacao === 'string' ? response.calendario.criacao : null,
    expirationSeconds: Number.isFinite(Number(response.calendario?.expiracao))
      ? Number(response.calendario?.expiracao)
      : null,
    raw,
  }
}

export async function getSicrediPixAccessToken(
  options: { forceRefresh?: boolean } = {},
): Promise<SicrediPixToken> {
  if (
    !options.forceRefresh
    && cachedToken
    && cachedToken.expiresAt - TOKEN_EXPIRY_SAFETY_SECONDS * 1000 > Date.now()
  ) {
    return cachedToken
  }

  const token = await requestToken(getSicrediPixConfig())
  cachedToken = token
  return token
}

export function clearSicrediPixTokenCache() {
  cachedToken = null
}

export async function createSicrediImmediateCharge(input: {
  txid?: string
  pixKey: string
  amount: number
  expirationSeconds: number
  payerRequest: string
  additionalInfo?: Array<{ name: string; value: string }>
}): Promise<SicrediImmediateCharge> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('O valor da cobrança Pix deve ser maior que zero.')
  }
  if (!Number.isInteger(input.expirationSeconds) || input.expirationSeconds < 60) {
    throw new Error('A validade da cobrança Pix deve ser de ao menos 60 segundos.')
  }
  if (!input.pixKey.trim()) throw new Error('Chave Pix Sicredi ausente para esta loja.')
  if (input.txid && !/^[A-Za-z0-9]{26,35}$/.test(input.txid)) {
    throw new Error('O txid informado para a cobrança Pix é inválido.')
  }

  const response = await requestSicrediJson<SicrediCobResponse>(input.txid ? 'PUT' : 'POST', input.txid ? `/api/v3/cob/${encodeURIComponent(input.txid)}` : '/api/v3/cob', {
    calendario: { expiracao: input.expirationSeconds },
    valor: { original: input.amount.toFixed(2), modalidadeAlteracao: 0 },
    chave: input.pixKey.trim(),
    solicitacaoPagador: input.payerRequest.slice(0, 140),
    ...(input.additionalInfo?.length
      ? {
          infoAdicionais: input.additionalInfo.map((item) => ({
            nome: item.name,
            valor: item.value,
          })),
        }
      : {}),
  })

  return parseImmediateCharge(response)
}

export async function getSicrediImmediateCharge(txid: string): Promise<SicrediImmediateCharge> {
  const response = await requestSicrediJson<SicrediCobResponse>('GET', `/api/v3/cob/${encodeURIComponent(txid)}`)
  return parseImmediateCharge(response)
}

export async function cancelSicrediImmediateCharge(txid: string): Promise<SicrediImmediateCharge> {
  const response = await requestSicrediJson<SicrediCobResponse>('PATCH', `/api/v3/cob/${encodeURIComponent(txid)}`, {
    status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR',
  })
  return parseImmediateCharge(response)
}
