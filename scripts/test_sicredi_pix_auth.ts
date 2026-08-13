import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local', quiet: true })

async function main() {
  const { getSicrediPixAccessToken } = await import('../src/lib/pix/sicredi-client.server')
  const token = await getSicrediPixAccessToken({ forceRefresh: true })

  console.log(JSON.stringify({
    success: true,
    environment: 'homologacao',
    tokenType: token.tokenType,
    expiresInSeconds: token.expiresIn,
    scopes: token.scope.split(/\s+/).filter(Boolean),
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : 'Erro desconhecido',
  }, null, 2))
  process.exitCode = 1
})
