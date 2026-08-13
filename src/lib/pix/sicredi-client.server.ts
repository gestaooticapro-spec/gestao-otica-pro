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
  const baseUrl = new URL(process.env.SICREDI_PIX_HML_BASE_URL?.trim() || DEFAULT_HML_BASE_URL)
  if (baseUrl.protocol !== 'https:') {
    throw new Error('A URL da API Pix Sicredi deve usar HTTPS.')
  }

  return {
    baseUrl,
    clientId: required(
      process.env.SICREDI_PIX_HML_CLIENT_ID || process.env.client_id,
      'SICREDI_PIX_HML_CLIENT_ID',
    ),
    clientSecret: required(
      process.env.SICREDI_PIX_HML_CLIENT_SECRET || process.env.client_secret,
      'SICREDI_PIX_HML_CLIENT_SECRET',
    ),
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
